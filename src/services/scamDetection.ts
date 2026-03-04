/**
 * CredIQ — 3-Layer Scam Detection Engine
 *
 * LAYER 1  Supabase DB lookup        (< 100ms,  high confidence)
 * LAYER 2  Pattern-based rule engine (< 1ms,    medium confidence)
 * LAYER 3  Qwen2.5-Coder:14B via Ollama (2-10s, AI-grade confidence)
 */

import { lookupInScamDB } from '@/services/supabase'
import { analyzeScamRisk } from '@/services/ollama'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical'

export interface RedFlag {
  flag: string
  weight: number
  matched: string      // the matched text snippet
}

export interface LayerResult {
  layerName: string
  layerIcon: string
  triggered: boolean
  riskScore: number        // 0–100 contribution from this layer
  riskLevel: RiskLevel
  confidence: number       // 0–100 how confident this layer is
  flags: RedFlag[]
  explanation: string
  durationMs: number
}

export interface ScamAnalysisResult {
  isScam: boolean
  finalRiskScore: number   // 0–100
  riskLevel: RiskLevel
  scamType?: string
  explanation: string
  recommendations: string[]
  blockedBy: 'layer1' | 'layer2' | 'layer3' | 'none'
  layers: [LayerResult, LayerResult, LayerResult]
  totalDurationMs: number
  dbRecord?: {
    id: string
    reports_count: number
    is_verified: boolean
    confidence_score: number
    scam_type: string
    description: string
  }
}

// ─── Layer 2: Pattern Rules ───────────────────────────────────────────────────

interface Rule {
  pattern: RegExp
  flag: string
  weight: number                // how much this adds to risk score (0–50)
  scamType?: string
}

const RULES: Rule[] = [
  // OTP / PIN theft
  { pattern: /\b(otp|one[\s-]?time[\s-]?password)\b/i,             flag: 'Requesting OTP',          weight: 30, scamType: 'otp_theft' },
  { pattern: /\b(upi[\s-]?pin|atm[\s-]?pin|mpin|pin\b)/i,          flag: 'Requesting UPI/ATM PIN',  weight: 40, scamType: 'otp_theft' },
  { pattern: /\bshare.{0,20}(screen|otp|code|pin)\b/i,              flag: 'Screen/code sharing ask', weight: 35, scamType: 'upi_phishing' },

  // Account threats
  { pattern: /\b(block|freeze|suspend|deactivat).{0,15}(account|card|upi)\b/i, flag: 'Account block threat', weight: 30, scamType: 'kyc_fraud' },
  { pattern: /\b(kyc|know[\s-]?your[\s-]?customer).{0,20}(urgent|expire|block|last.?day|today)\b/i, flag: 'Urgent KYC deadline', weight: 35, scamType: 'kyc_fraud' },
  { pattern: /\b(account|wallet).{0,20}(expire|close|block).{0,20}(today|24.?hour|immediately|urgent)\b/i, flag: 'Urgent account expiry', weight: 30, scamType: 'kyc_fraud' },

  // Verification payment trick
  { pattern: /\b(₹\s*1|rs\.?\s*1|one\s*rupee|1\s*rupee).{0,30}(verif|confirm|activ|unlock)\b/i, flag: '₹1 verification trick', weight: 45, scamType: 'upi_phishing' },
  { pattern: /\b(verify|verif|confirm).{0,20}(pay|₹|rs\.?|inr|send.?money|transaction)\b/i,      flag: 'Pay to verify scam',    weight: 35, scamType: 'upi_phishing' },
  { pattern: /\bpayment.{0,20}(request|received|pending).{0,20}(approve|accept|tap)\b/i,          flag: 'Fake payment request',  weight: 30, scamType: 'upi_phishing' },

  // Fake identity
  { pattern: /\b(hdfc|sbi|icici|axis|kotak|rbi|npci|irdai|sebi).{0,20}(team|official|call|representative|executive|helpline)\b/i, flag: 'Fake bank/regulator identity', weight: 25, scamType: 'fake_bank_call' },
  { pattern: /\b(customer[\s-]?care|helpline|toll[\s-]?free).{0,30}(\d{10}|\d{4,}-\d{4,})\b/i,  flag: 'Fake helpline number',    weight: 20, scamType: 'fake_bank_call' },

  // Investment fraud
  { pattern: /\b(guaranteed|sure|certain).{0,20}(return|profit|earn|income|interest)\b/i,         flag: 'Guaranteed returns promise', weight: 35, scamType: 'investment_fraud' },
  { pattern: /\b(double|2x|5x|10x|100x).{0,20}(money|invest|earn|profit)\b/i,                    flag: 'Unrealistic multiplier',      weight: 40, scamType: 'investment_fraud' },
  { pattern: /\b(bitcoin|crypto|btc|eth).{0,30}(mine|earn|invest|scheme|pool|group)\b/i,          flag: 'Crypto mining scheme',        weight: 30, scamType: 'investment_fraud' },

  // Lottery / prize
  { pattern: /\b(won|winner|lottery|prize|lucky.?draw|selected).{0,30}(lakh|crore|rupee|₹|rs\.?|inr)\b/i, flag: 'Lottery/prize claim', weight: 40, scamType: 'lottery_scam' },
  { pattern: /\b(processing.?fee|release.?fee|delivery.?fee).{0,20}(pay|send|transfer)\b/i,               flag: 'Fake fee to claim prize', weight: 45, scamType: 'lottery_scam' },

  // Phishing links
  { pattern: /\b(click|tap|open|visit).{0,20}(link|url|http|bit\.ly|shorturl|tinyurl|goo\.gl)\b/i, flag: 'Suspicious link', weight: 20, scamType: 'upi_phishing' },
  { pattern: /https?:\/\/(?!(?:www\.)?(?:npci|bhimupi|paytm|phonepe|googlepay)\.)/i,               flag: 'Unrecognized URL',   weight: 15, scamType: 'upi_phishing' },

  // Social engineering language
  { pattern: /\b(urgent|immediately|right.?now|asap|last.?chance|limited.?time|act.?now)\b/i, flag: 'Urgency pressure language', weight: 15 },
  { pattern: /\b(don.?t.?tell|keep.?secret|confidential|not.?share.?anyone)\b/i,              flag: 'Secrecy demand',           weight: 20 },
  { pattern: /\b(police|arrest|legal.?action|cyber.?crime|court).{0,30}(report|file|notice)\b/i, flag: 'Threat of legal action', weight: 25, scamType: 'kyc_fraud' },

  // Job scams
  { pattern: /\b(work.?from.?home|part[\s-]?time.?job|earn.{0,15}per.?day).{0,30}(register|pay|fee|deposit)\b/i, flag: 'Fake job with upfront fee', weight: 35, scamType: 'job_fraud' },

  // Bank/official asking to pay fee or charges
  { pattern: /\b(bank|official|executive|representative).{0,40}(pay|send|transfer|charge|fee|amount)\b/i,       flag: 'Bank/official demanding payment', weight: 40, scamType: 'fake_bank_call' },
  { pattern: /\b(pay|send|transfer).{0,30}(charge|fee|fine|penalty|processing|convenience|service).{0,20}(bank|account|upi|portal)\b/i, flag: 'Fake bank service charge demand', weight: 45, scamType: 'fake_bank_call' },
  { pattern: /\b(charge|charges|fee|deduct).{0,20}(₹|rs\.?|inr|\d{3,})\b/i,                                 flag: 'Suspicious fee/charge demand',    weight: 30, scamType: 'fake_bank_call' },
  { pattern: /\bfrom.{0,10}(bank|rbi|sbi|hdfc|icici|axis|npci|government|ministry|department)\b/i,             flag: 'Impersonating official institution', weight: 25, scamType: 'fake_bank_call' },

  // Fake/impersonated UPI IDs
  { pattern: /^(sbi|hdfc|icici|axis|rbi|npci|paytm|phonepe|googlepay|bhim)[._-]/i,                              flag: 'UPI ID impersonating official entity', weight: 40, scamType: 'upi_phishing' },
  { pattern: /(sbi|hdfc|icici|axis|rbi|npci)\.(official|bank|help|care|customer|support)@/i,                   flag: 'Official-sounding fake UPI ID',        weight: 45, scamType: 'upi_phishing' },

  // Remote access / screen share
  { pattern: /\b(anydesk|teamviewer|remote|screen.?share|screen.?control|remote.?access)\b/i,                  flag: 'Remote access tool mentioned',  weight: 50, scamType: 'upi_phishing' },

  // "Pay first to receive" pattern
  { pattern: /\b(pay|send|transfer|deposit).{0,20}(first|advance|upfront|before).{0,30}(receive|get|claim|release|unlock)\b/i, flag: 'Pay-first-to-receive scam', weight: 45, scamType: 'lottery_scam' },
]

export function runPatternRules(input: string, context: string): { score: number; flags: RedFlag[]; topScamType: string | undefined } {
  const text = `${input} ${context}`.toLowerCase()
  const flags: RedFlag[] = []
  const scamTypeCounts: Record<string, number> = {}

  for (const rule of RULES) {
    const match = text.match(rule.pattern)
    if (match) {
      flags.push({
        flag: rule.flag,
        weight: rule.weight,
        matched: match[0].slice(0, 60),
      })
      if (rule.scamType) {
        scamTypeCounts[rule.scamType] = (scamTypeCounts[rule.scamType] ?? 0) + rule.weight
      }
    }
  }

  const score = Math.min(100, flags.reduce((s, f) => s + f.weight, 0))
  const topScamType = Object.entries(scamTypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
  return { score, flags, topScamType }
}

// ─── Risk level from score ────────────────────────────────────────────────────

function scoreToLevel(score: number): RiskLevel {
  if (score >= 80) return 'critical'
  if (score >= 60) return 'high'
  if (score >= 40) return 'medium'
  if (score >= 20) return 'low'
  return 'safe'
}

// ─── Default recommendations ──────────────────────────────────────────────────

function buildRecommendations(level: RiskLevel, scamType?: string): string[] {
  const base = [
    'Do NOT share OTP, UPI PIN, or any password with anyone.',
    'Verify caller identity by calling the official bank helpline.',
    'Report to Cyber Crime portal: cybercrime.gov.in',
  ]
  if (scamType === 'investment_fraud') return [
    'Never invest based on unsolicited messages or calls.',
    'Check SEBI registration before investing: sebi.gov.in',
    ...base,
  ]
  if (scamType === 'lottery_scam') return [
    'Legitimate lotteries never ask for upfront fees.',
    'Block and report the sender immediately.',
    ...base,
  ]
  if (level === 'safe' || level === 'low') return [
    'Looks relatively safe, but stay cautious.',
    'Never share personal or financial info unprompted.',
    'When in doubt, hang up and call back on the official number.',
  ]
  return base
}

// ─── Main 3-Layer Analysis ────────────────────────────────────────────────────

export async function runScamAnalysis(
  input: string,
  context: string,
): Promise<ScamAnalysisResult> {
  const globalStart = Date.now()

  // ══════════════════════════════════════════════════════════════════════════
  // LAYER 1 — Supabase / Local DB Lookup
  // ══════════════════════════════════════════════════════════════════════════
  const t1 = Date.now()
  const dbRecord = await lookupInScamDB(input)
  const layer1Duration = Date.now() - t1

  const layer1: LayerResult = {
    layerName: 'Scam Database',
    layerIcon: '🗄️',
    triggered: Boolean(dbRecord),
    riskScore: dbRecord ? dbRecord.confidence_score : 0,
    riskLevel: dbRecord ? scoreToLevel(dbRecord.confidence_score) : 'safe',
    confidence: dbRecord ? dbRecord.confidence_score : 0,
    flags: dbRecord
      ? [{ flag: `Matched in database (${dbRecord.reports_count} reports)`, weight: dbRecord.confidence_score, matched: input }]
      : [],
    explanation: dbRecord
      ? `Exact match found: "${dbRecord.scam_type.replace(/_/g, ' ')}" — ${dbRecord.description}`
      : 'Not found in scam database.',
    durationMs: layer1Duration,
  }

  // If Layer 1 gives very high confidence, short-circuit
  if (dbRecord && dbRecord.confidence_score >= 90) {
    return buildFinalResult({
      blockedBy: 'layer1',
      layer1,
      layer2: buildEmptyLayer('Pattern Rules', '🔍'),
      layer3: buildEmptyLayer('AI Analysis (Qwen)', '🤖'),
      dbRecord,
      input,
      context,
      totalDurationMs: Date.now() - globalStart,
    })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LAYER 2 — Pattern-Based Rules
  // ══════════════════════════════════════════════════════════════════════════
  const t2 = Date.now()
  const { score: patternScore, flags, topScamType } = runPatternRules(input, context)
  const layer2Duration = Date.now() - t2

  const layer2: LayerResult = {
    layerName: 'Pattern Rules',
    layerIcon: '🔍',
    triggered: flags.length > 0,
    riskScore: patternScore,
    riskLevel: scoreToLevel(patternScore),
    confidence: Math.min(95, patternScore + 10),
    flags,
    explanation: flags.length > 0
      ? `${flags.length} red flag${flags.length > 1 ? 's' : ''} detected: ${flags.map((f) => f.flag).join(', ')}.`
      : 'No suspicious patterns detected.',
    durationMs: layer2Duration,
  }

  // Combine layer 1 + 2 scores
  const combinedScore = Math.min(100, (layer1.riskScore * 0.6) + (layer2.riskScore * 0.4))

  if (combinedScore >= 75 && flags.length >= 2) {
    return buildFinalResult({
      blockedBy: 'layer2',
      layer1,
      layer2,
      layer3: buildEmptyLayer('AI Analysis (Qwen)', '🤖', 'Skipped — pattern rules gave sufficient confidence.'),
      dbRecord: dbRecord ?? undefined,
      topScamType,
      input,
      context,
      totalDurationMs: Date.now() - globalStart,
    })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LAYER 3 — Ollama AI (Qwen2.5-Coder:14B)
  // ══════════════════════════════════════════════════════════════════════════
  const t3 = Date.now()
  let aiData
  try {
    aiData = await analyzeScamRisk(input, context || 'No additional context provided', flags)
  } catch {
    aiData = {
      isScam: combinedScore > 50,
      riskScore: combinedScore,
      riskLevel: scoreToLevel(combinedScore),
      scamType: topScamType ?? 'other',
      explanation: 'AI offline — using pattern analysis only.',
      recommendations: buildRecommendations(scoreToLevel(combinedScore), topScamType),
    }
  }
  const layer3Duration = Date.now() - t3

  const layer3: LayerResult = {
    layerName: 'AI Analysis (Qwen)',
    layerIcon: '🤖',
    triggered: aiData.isScam,
    riskScore: aiData.riskScore,
    riskLevel: scoreToLevel(aiData.riskScore),
    confidence: aiData.riskScore,
    flags: [],
    explanation: aiData.explanation,
    durationMs: layer3Duration,
  }

  return buildFinalResult({
    blockedBy: aiData.isScam ? 'layer3' : 'none',
    layer1,
    layer2,
    layer3,
    dbRecord: dbRecord ?? undefined,
    topScamType: aiData.scamType ?? topScamType,
    aiRecommendations: aiData.recommendations,
    input,
    context,
    totalDurationMs: Date.now() - globalStart,
    aiRiskScore: aiData.riskScore,
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildEmptyLayer(name: string, icon: string, explanation = 'Not triggered.'): LayerResult {
  return {
    layerName: name,
    layerIcon: icon,
    triggered: false,
    riskScore: 0,
    riskLevel: 'safe',
    confidence: 0,
    flags: [],
    explanation,
    durationMs: 0,
  }
}

interface FinalResultParams {
  blockedBy: 'layer1' | 'layer2' | 'layer3' | 'none'
  layer1: LayerResult
  layer2: LayerResult
  layer3: LayerResult
  dbRecord?: { id: string; reports_count: number; is_verified: boolean; confidence_score: number; scam_type: string; description: string }
  topScamType?: string
  aiRecommendations?: string[]
  input: string
  context: string
  totalDurationMs: number
  aiRiskScore?: number
}

function buildFinalResult(p: FinalResultParams): ScamAnalysisResult {
  const activeLayer = p.blockedBy === 'layer1' ? p.layer1
    : p.blockedBy === 'layer2' ? p.layer2
    : p.layer3

  const finalScore = Math.min(100, Math.max(
    p.layer1.riskScore,
    p.layer2.riskScore,
    p.aiRiskScore ?? 0,
  ))
  const riskLevel = scoreToLevel(finalScore)
  const isScam = riskLevel !== 'safe' && riskLevel !== 'low'

  const scamType = p.dbRecord?.scam_type ?? p.topScamType

  return {
    isScam,
    finalRiskScore: finalScore,
    riskLevel,
    scamType,
    explanation: activeLayer.explanation,
    recommendations: p.aiRecommendations ?? buildRecommendations(riskLevel, scamType),
    blockedBy: p.blockedBy,
    layers: [p.layer1, p.layer2, p.layer3],
    totalDurationMs: p.totalDurationMs,
    dbRecord: p.dbRecord,
  }
}

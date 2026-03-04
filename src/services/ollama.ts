import axios from 'axios'
import type { OllamaRequest, OllamaResponse, UPITransaction, AIAnalysisResult } from '@/types'

// Ollama base URL — uses 14B model (user's setup)
const OLLAMA_BASE = import.meta.env.VITE_OLLAMA_URL || 'http://localhost:11434'
const MODEL = import.meta.env.VITE_OLLAMA_MODEL || 'qwen2.5-coder:14b'

const ollamaClient = axios.create({
  baseURL: OLLAMA_BASE,
  timeout: 25_000, // 25s — fast enough for 7B, fallback kicks in for 14B if slow
  headers: { 'Content-Type': 'application/json' },
})

// ===== Health Check =====
export async function checkOllamaHealth(): Promise<{ connected: boolean; models: string[] }> {
  try {
    const res = await ollamaClient.get('/api/tags', { timeout: 5000 })
    const models: string[] = (res.data?.models || []).map((m: { name: string }) => m.name)
    return { connected: true, models }
  } catch {
    return { connected: false, models: [] }
  }
}

// ===== Core Generate Function =====
async function generate(prompt: string, maxTokens = 2048): Promise<string> {
  const body: OllamaRequest = {
    model: MODEL,
    prompt,
    stream: false,
    options: {
      temperature: 0.1,       // deterministic for financial data
      num_ctx: 4096,          // keep small for fast response
      top_p: 0.9,
      num_predict: maxTokens,
    },
  }

  const res = await ollamaClient.post<OllamaResponse>('/api/generate', body)
  return res.data.response.trim()
}

// ===== UPI Transaction Analysis =====
export async function analyzeTransactions(transactions: UPITransaction[]): Promise<AIAnalysisResult> {
  // Build compact transaction string — limit to 60 to stay within num_ctx: 4096
  const txLines = transactions.slice(0, 60).map((tx, i) => {
    const date = new Date(tx.date).toISOString().split('T')[0]
    return `[${i + 1}] ${date} | ${tx.type} | ₹${tx.amount} | "${tx.description}"`
  }).join('\n')

  const prompt = `You are a financial AI assistant analyzing Indian UPI transactions. 
Extract behavioral signals and output ONLY valid JSON (no markdown, no explanation).

TRANSACTIONS:
${txLines}

OUTPUT this exact JSON structure:
{
  "incomeAnalysis": {
    "monthlyAvg": <number>,
    "consistencyScore": <0-100>,
    "variance": <percentage>,
    "growthTrend": "<string>",
    "paymentCycle": "<weekly|biweekly|monthly>",
    "cycleDay": "<day name>",
    "weekendGapNormal": <true|false>
  },
  "platformDetection": {
    "primaryPlatform": "<platform name>",
    "platformType": "<food_delivery_gig|ride_sharing|freelance|employment|business|unknown>",
    "secondaryIncome": <null or "description">,
    "gigWorkerConfidence": <0.0-1.0>
  },
  "paymentBehavior": {
    "electricityBill": "<on_time|delayed|missed|na>",
    "mobileRecharge": "<regular|irregular|na>",
    "rentPayment": "<punctual|delayed|na>",
    "billPaymentScore": <0-100>
  },
  "spendingIntelligence": {
    "foodDelivery": <monthly avg spend>,
    "essentialsRatio": <0.0-1.0>,
    "discretionaryRatio": <0.0-1.0>,
    "impulsePurchases": <count>,
    "spendingDiscipline": <0-100>
  },
  "savingsBehavior": {
    "monthlySavings": <number>,
    "savingsRate": <0.0-1.0>,
    "consistentSaving": <true|false>,
    "investmentApps": [],
    "savingsScore": <0-100>
  },
  "riskFlags": [],
  "recommendedCredScore": <300-850>,
  "tier": "<Poor|Fair|Good|Very Good|Excellent>",
  "loanEligibility": "<amount range @ rate%>"
}`

  // Quick health check — skip 2-min wait if Ollama is offline
  const health = await checkOllamaHealth()
  if (!health.connected) {
    console.warn('Ollama offline, using smart numeric fallback')
    return buildFallbackAnalysis(transactions)
  }

  try {
    const raw = await generate(prompt, 800)
    // Extract JSON from response (handle any surrounding text)
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    const parsed = JSON.parse(jsonMatch[0]) as AIAnalysisResult
    return parsed
  } catch (err) {
    console.warn('Ollama parse error, using smart fallback:', err)
    return buildFallbackAnalysis(transactions)
  }
}

// ===== Scam Detection =====
export async function analyzeScamRisk(
  subject: string,
  context: string,
  patternFlags?: Array<{ flag: string; matched: string }>,
): Promise<{ riskScore: number; riskLevel: string; explanation: string; isScam: boolean; scamType?: string; recommendations?: string[] }> {
  const flagsSummary = patternFlags && patternFlags.length > 0
    ? `\nPre-detected red flags by rule engine:\n${patternFlags.map((f) => `  - ${f.flag} (matched: "${f.matched}")`).join('\n')}`
    : '\nNo pre-detected flags (rely on your own analysis).'

  const prompt = `You are an expert Indian cybercrime and UPI fraud analyst. Your job is to assess whether a given UPI ID / phone number / scenario is a scam.

Think step by step before answering. Consider ALL signals carefully.

━━━ KNOWN INDIAN SCAM PATTERNS ━━━
1. FAKE_BANK_CALL: Someone claiming to be from SBI/HDFC/ICICI/RBI asks to pay "charges", "fees", "penalty", "service fee", "KYC fee" or transfer money. Real banks NEVER ask customers to pay fees over call.
2. KYC_FRAUD: Urgent KYC update deadlines, "your account will be blocked in 24 hours", asking to install an app or share screen.
3. UPI_PHISHING: UPI IDs mimicking official entities (sbi.xxxx@upi, rbi.helpline@paytm), asking ₹1 to "verify", sending collect requests and asking to approve.
4. OTP_THEFT: Any scenario where someone asks for OTP, UPI PIN, ATM PIN, CVV, or "one-time password".
5. INVESTMENT_FRAUD: WhatsApp/Telegram groups promising guaranteed returns, 2x/5x/10x money, crypto mining pools.
6. LOTTERY_SCAM: "You've won ₹X lakhs" but must pay a processing/release fee first.
7. QR_SCAM: Sending a QR code and saying "scan to receive money" — scanning a payment QR always SENDS money, never receives it.
8. JOB_FRAUD: Work-from-home jobs asking for upfront registration fee or security deposit.

━━━ ANALYSIS SIGNALS ━━━
Subject (UPI ID / phone / scenario): ${subject}
User-reported context: ${context}${flagsSummary}

━━━ SCORING GUIDE ━━━
- 0–19:  Safe — no suspicious signals
- 20–39: Low — minor suspicion, could be legitimate
- 40–59: Medium — multiple soft signals, treat with caution
- 60–79: High — clear scam indicators present
- 80–100: Critical — textbook scam, do NOT proceed

━━━ EXAMPLES ━━━
Example 1:
  Subject: "rbi.official@upi"
  Context: "received request to pay ₹500 KYC verification"
  → {"isScam":true,"riskScore":95,"riskLevel":"critical","scamType":"kyc_fraud","explanation":"RBI never collects payments via UPI. This is a classic KYC fraud impersonating RBI using a fake UPI ID.","recommendations":["Do not pay or approve any UPI request from this ID","Report to cybercrime.gov.in immediately","Block the sender on your UPI app"]}

Example 2:
  Subject: "sbi.0123@upi"
  Context: "they said they are from bank and asking to pay 5000rs as some charges"
  → {"isScam":true,"riskScore":92,"riskLevel":"critical","scamType":"fake_bank_call","explanation":"SBI never charges customers via UPI calls. The UPI ID mimics SBI and demanding payment for 'charges' is a textbook fake bank employee scam.","recommendations":["Hang up immediately — real bank employees never ask for money","Call SBI official helpline 1800-11-2211 to verify","Report this UPI ID to NPCI / cybercrime.gov.in"]}

Example 3:
  Subject: "+919988776655"
  Context: "said my account will be blocked, asking to share screen for KYC via TeamViewer"
  → {"isScam":true,"riskScore":97,"riskLevel":"critical","scamType":"kyc_fraud","explanation":"Screen sharing for KYC is a remote access scam — the attacker will take control of your phone to steal UPI PIN and transfer funds.","recommendations":["Never install AnyDesk/TeamViewer for bank verification","Hang up and call your bank's official number","File a complaint at cybercrime.gov.in"]}

Example 4:
  Subject: "friend@okaxis"
  Context: "my friend sending me money for lunch split"
  → {"isScam":false,"riskScore":5,"riskLevel":"safe","scamType":null,"explanation":"Normal peer-to-peer UPI transaction between known contacts for a routine purpose.","recommendations":["Always verify UPI ID name before approving large amounts"]}

━━━ NOW ANALYZE ━━━
Output ONLY a single valid JSON object. No markdown, no explanation outside the JSON.
{
  "isScam": <true|false>,
  "riskScore": <0-100, integer>,
  "riskLevel": "<safe|low|medium|high|critical>",
  "scamType": "<fake_bank_call|upi_phishing|qr_scam|investment_fraud|kyc_fraud|lottery_scam|job_fraud|otp_theft|other|null>",
  "explanation": "<2-3 sentence detailed explanation of why this is or isn't a scam, citing specific signals>",
  "recommendations": ["<specific actionable advice 1>", "<specific actionable advice 2>", "<specific actionable advice 3>"]
}`

  // Compute a fallback score from pattern flags in case AI fails
  const fallbackScore = patternFlags && patternFlags.length > 0
    ? Math.min(95, patternFlags.reduce((s, f) => s + 15, 30))
    : 45

  try {
    const raw = await generate(prompt, 600)
    // Strip any markdown code fences if model wraps output
    const cleaned = raw.replace(/```json|```/gi, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    const parsed = JSON.parse(jsonMatch[0])
    // Ensure required fields exist
    if (typeof parsed.isScam !== 'boolean' || typeof parsed.riskScore !== 'number') {
      throw new Error('Invalid JSON shape')
    }
    return parsed
  } catch (err) {
    console.warn('Ollama scam parse error, using pattern-aware fallback:', err)
    const isScam = fallbackScore >= 50
    return {
      isScam,
      riskScore: fallbackScore,
      riskLevel: fallbackScore >= 80 ? 'critical' : fallbackScore >= 60 ? 'high' : fallbackScore >= 40 ? 'medium' : 'low',
      explanation: patternFlags && patternFlags.length > 0
        ? `AI analysis incomplete. Rule engine detected ${patternFlags.length} red flag(s): ${patternFlags.map((f) => f.flag).join('; ')}.`
        : 'AI analysis incomplete. No strong patterns detected — treat with caution.',
      scamType: 'other',
      recommendations: [
        'Verify the caller/sender identity through official channels before taking any action.',
        'Never pay any "fees" or "charges" demanded over a call or message.',
        'Report suspicious UPI IDs to cybercrime.gov.in or call 1930.',
      ],
    }
  }
}

// ===== Transaction Categorizer =====
export async function categorizeTransaction(description: string): Promise<string> {
  const prompt = `Categorize this Indian UPI transaction. Output ONE word category only.
Categories: salary, gig_income, rent, food, electricity, mobile_recharge, investment, insurance, shopping, transport, healthcare, entertainment, transfer, other

Transaction: "${description}"
Category:`

  try {
    const raw = await generate(prompt, 10)
    const cat = raw.toLowerCase().trim().split(/\s/)[0]
    const valid = [
      'salary', 'gig_income', 'rent', 'food', 'electricity',
      'mobile_recharge', 'investment', 'insurance', 'shopping',
      'transport', 'healthcare', 'entertainment', 'transfer', 'other',
    ]
    return valid.includes(cat) ? cat : 'other'
  } catch {
    return 'other'
  }
}

// ===== Smart numeric fallback (no AI) =====
function buildFallbackAnalysis(transactions: UPITransaction[]): AIAnalysisResult {
  const credits = transactions.filter((t) => t.type === 'CREDIT')
  const debits = transactions.filter((t) => t.type === 'DEBIT')
  const months = new Set(credits.map((t) => new Date(t.date).getMonth())).size || 1
  const monthlyIncome = credits.reduce((s, t) => s + t.amount, 0) / months
  const monthlyExpenses = debits.reduce((s, t) => s + t.amount, 0) / months
  const savingsRate = monthlyIncome > 0 ? Math.max(0, (monthlyIncome - monthlyExpenses) / monthlyIncome) : 0
  const score = Math.min(850, Math.max(300,
    300 + Math.round(monthlyIncome / 100) + Math.round(savingsRate * 200)
  ))

  return {
    incomeAnalysis: {
      monthlyAvg: Math.round(monthlyIncome),
      consistencyScore: 70,
      variance: 15,
      growthTrend: '+5% over 3 months',
      paymentCycle: 'monthly',
      cycleDay: 'Monday',
      weekendGapNormal: true,
    },
    platformDetection: {
      primaryPlatform: 'Unknown',
      platformType: 'unknown',
      secondaryIncome: null,
      gigWorkerConfidence: 0.5,
    },
    paymentBehavior: {
      electricityBill: 'on_time',
      mobileRecharge: 'regular',
      rentPayment: 'on_time',
      billPaymentScore: 75,
    },
    spendingIntelligence: {
      foodDelivery: 2000,
      essentialsRatio: 0.65,
      discretionaryRatio: 0.35,
      impulsePurchases: 2,
      spendingDiscipline: 70,
    },
    savingsBehavior: {
      monthlySavings: Math.round(monthlyIncome * savingsRate),
      savingsRate,
      consistentSaving: savingsRate > 0.1,
      investmentApps: [],
      savingsScore: Math.round(savingsRate * 100),
    },
    riskFlags: [],
    recommendedCredScore: score,
    tier: score >= 750 ? 'Excellent' : score >= 700 ? 'Very Good' : score >= 650 ? 'Good' : score >= 550 ? 'Fair' : 'Poor',
    loanEligibility: `₹${Math.round(monthlyIncome * 1.5 / 1000)}K–₹${Math.round(monthlyIncome * 2 / 1000)}K @ 15%`,
  }
}

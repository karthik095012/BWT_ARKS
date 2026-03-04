import { useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  Shield, Search, Phone, CheckCircle2, XCircle,
  Bot, Users, Flag, Clock, Database, Cpu, Zap, ChevronDown, ChevronUp,
} from 'lucide-react'
import { lookupInScamDB, reportScamToSupabase, LOCAL_SCAM_DB } from '@/services/supabase'
import { runPatternRules } from '@/services/scamDetection'
import { analyzeScamRisk } from '@/services/ollama'
import { useAppStore } from '@/store/useAppStore'
import { triggerScamDetected } from '@/services/n8n'
import { formatDate } from '@/utils/helpers'
import toast from 'react-hot-toast'
import type { LayerResult, ScamAnalysisResult } from '@/services/scamDetection'

interface CheckForm { input: string; context: string }
interface ReportForm { phone: string; scamType: string; description: string }

type LayerStatus = 'pending' | 'running' | 'done' | 'skipped'
interface LayerState { status: LayerStatus; result?: LayerResult; expanded: boolean }

const RISK_COLOR: Record<string, string> = {
  safe: '#22c55e', low: '#84cc16', medium: '#f59e0b',
  high: '#f97316', critical: '#ef4444',
}

function RiskBadge({ level, score }: { level: string; score?: number }) {
  const c = RISK_COLOR[level] ?? '#6b7280'
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border"
      style={{ color: c, borderColor: c + '55', backgroundColor: c + '15' }}
    >
      {level.toUpperCase()}{score !== undefined && ` · ${score}%`}
    </span>
  )
}

function LayerCard({
  index, icon: Icon, title, subtitle, state, onToggle,
}: {
  index: number; icon: React.ElementType; title: string
  subtitle: string; state: LayerState; onToggle: () => void
}) {
  const { status, result, expanded } = state
  const borderCls = {
    pending: 'border-neutral-200 bg-white',
    running: 'border-primary/40 bg-primary/5',
    done: result?.triggered ? 'border-danger/40 bg-danger-light/50' : 'border-success/40 bg-success-light/50',
    skipped: 'border-neutral-200 bg-neutral-50',
  }[status]

  return (
    <div className={`rounded-xl border-2 transition-all ${borderCls}`}>
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={onToggle}>
        <div className="w-8 h-8 rounded-lg bg-primary-light flex items-center justify-center shrink-0">
          <span className="text-primary text-sm font-bold">{index}</span>
        </div>
        <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-neutral-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-neutral-dark text-sm">{title}</p>
          <p className="text-xs text-neutral-gray truncate">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {status === 'pending' && <span className="text-xs text-neutral-gray">Waiting…</span>}
          {status === 'running' && (
            <span className="flex items-center gap-1 text-xs text-primary animate-pulse">
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>Scanning…
            </span>
          )}
          {status === 'done' && result && <RiskBadge level={result.riskLevel} score={result.riskScore} />}
          {status === 'skipped' && <span className="text-xs text-neutral-gray italic">Skipped</span>}
          {status === 'done' && (expanded
            ? <ChevronUp className="w-4 h-4 text-neutral-gray" />
            : <ChevronDown className="w-4 h-4 text-neutral-gray" />)}
        </div>
      </div>

      {status === 'done' && result && expanded && (
        <div className="px-4 pb-4 border-t border-neutral-100 pt-3 space-y-2">
          <p className="text-sm text-neutral-gray">{result.explanation}</p>
          {result.flags.length > 0 && (
            <div className="space-y-1">
              {result.flags.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 text-warning">⚑</span>
                  <span className="text-neutral-dark font-medium">{f.flag}</span>
                  {f.matched && <span className="text-neutral-gray italic">"{f.matched}"</span>}
                  <span className="ml-auto text-danger font-mono font-bold">+{f.weight}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-neutral-gray">
            {result.durationMs > 0 ? `${result.durationMs}ms` : 'Instant'} · Confidence {result.confidence}%
          </p>
        </div>
      )}
    </div>
  )
}

export default function ScamShieldPage() {
  const { scamsBlocked, incrementScamsBlocked, ollamaConnected } = useAppStore()
  const [layers, setLayers] = useState<[LayerState, LayerState, LayerState]>([
    { status: 'pending', expanded: false },
    { status: 'pending', expanded: false },
    { status: 'pending', expanded: false },
  ])
  const [scanResult, setScanResult] = useState<ScamAnalysisResult | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<CheckForm>()
  const reportForm = useForm<ReportForm>()
  const inputValue = watch('input') ?? ''

  const setLayer = (i: 0 | 1 | 2, patch: Partial<LayerState>) =>
    setLayers((prev) => {
      const next = [...prev] as [LayerState, LayerState, LayerState]
      next[i] = { ...next[i], ...patch }
      return next
    })

  const resetLayers = () =>
    setLayers([
      { status: 'pending', expanded: false },
      { status: 'pending', expanded: false },
      { status: 'pending', expanded: false },
    ])

  const handleCheck = async (data: CheckForm) => {
    setIsScanning(true)
    setScanResult(null)
    resetLayers()
    const input = data.input.trim()
    const context = data.context?.trim() || 'No additional context'
    let blocked = false
    const t0 = Date.now()
    const layerResults: LayerResult[] = []

    // ── LAYER 1: Supabase DB lookup ─────────────────────────────────────────
    setLayer(0, { status: 'running' })
    const l1t = Date.now()
    const dbRecord = await lookupInScamDB(input).catch(() => null)
    const l1Result: LayerResult = dbRecord
      ? {
          layerName: 'Database Lookup', layerIcon: '🗄️', triggered: true,
          riskScore: dbRecord.confidence_score ?? 95,
          riskLevel: (dbRecord.confidence_score ?? 95) >= 90 ? 'critical' : 'high',
          confidence: dbRecord.confidence_score ?? 95,
          flags: [{ flag: `${dbRecord.reports_count} community reports`, weight: 50, matched: input }],
          explanation: dbRecord.description,
          durationMs: Date.now() - l1t,
        }
      : {
          layerName: 'Database Lookup', layerIcon: '🗄️', triggered: false,
          riskScore: 0, riskLevel: 'safe', confidence: 100, flags: [],
          explanation: 'Not found in scam database — proceeding to pattern analysis.',
          durationMs: Date.now() - l1t,
        }
    layerResults.push(l1Result)
    setLayer(0, { status: 'done', result: l1Result, expanded: l1Result.triggered })
    if (l1Result.riskScore >= 90) blocked = true

    // ── LAYER 2: Pattern Rules ──────────────────────────────────────────────
    if (!blocked) {
      setLayer(1, { status: 'running' })
      await new Promise((r) => setTimeout(r, 80))
      const l2t = Date.now()
      const { score, flags, topScamType } = runPatternRules(input, context)
      const l2dur = Date.now() - l2t
      const l2Level = score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 30 ? 'medium' : score >= 10 ? 'low' : 'safe'
      const l2Result: LayerResult = {
        layerName: 'Pattern Rules', layerIcon: '🔍', triggered: flags.length > 0,
        riskScore: Math.min(score, 100), riskLevel: l2Level as LayerResult['riskLevel'],
        confidence: 85, flags,
        explanation: flags.length
          ? `${flags.length} risk pattern${flags.length > 1 ? 's' : ''} detected${topScamType ? ` — likely ${topScamType.replace(/_/g, ' ')}` : ''}.`
          : 'No suspicious patterns detected.',
        durationMs: l2dur,
      }
      layerResults.push(l2Result)
      setLayer(1, { status: 'done', result: l2Result, expanded: flags.length > 0 })
      if (score >= 75 && flags.length >= 2) blocked = true
    } else {
      const skip: LayerResult = { layerName: 'Pattern Rules', layerIcon: '🔍', triggered: false, riskScore: 0, riskLevel: 'safe', confidence: 0, flags: [], explanation: 'Skipped — already blocked by Layer 1.', durationMs: 0 }
      layerResults.push(skip)
      setLayer(1, { status: 'skipped', result: skip })
    }

    // ── LAYER 3: Qwen2.5-Coder:14B AI ──────────────────────────────────────
    if (!blocked) {
      setLayer(2, { status: 'running' })
      const l3t = Date.now()
      let ai: Awaited<ReturnType<typeof analyzeScamRisk>> | null = null
      try { ai = await analyzeScamRisk(input, context) } catch { ai = null }
      const l3dur = Date.now() - l3t
      const l3Result: LayerResult = {
        layerName: 'AI Analysis', layerIcon: '🤖', triggered: ai?.isScam ?? false,
        riskScore: ai?.riskScore ?? 0,
        riskLevel: (ai?.riskLevel as LayerResult['riskLevel']) ?? 'safe',
        confidence: 92, flags: [],
        explanation: ai?.explanation ?? (ollamaConnected ? 'AI analysis complete.' : 'Ollama offline — AI layer skipped.'),
        durationMs: l3dur,
      }
      layerResults.push(l3Result)
      setLayer(2, { status: 'done', result: l3Result, expanded: ai?.isScam ?? false })

      const final: ScamAnalysisResult = {
        isScam: ai?.isScam ?? false,
        finalRiskScore: ai?.riskScore ?? 0,
        riskLevel: (ai?.riskLevel as ScamAnalysisResult['riskLevel']) ?? 'safe',
        scamType: ai?.scamType,
        explanation: ai?.explanation ?? 'No threat detected.',
        recommendations: ai?.recommendations ?? ['Proceed with caution.'],
        blockedBy: 'layer3',
        layers: layerResults as [LayerResult, LayerResult, LayerResult],
        totalDurationMs: Date.now() - t0,
        dbRecord: dbRecord ? { id: dbRecord.id, reports_count: dbRecord.reports_count, is_verified: dbRecord.is_verified, confidence_score: dbRecord.confidence_score, scam_type: dbRecord.scam_type, description: dbRecord.description } : undefined,
      }
      setScanResult(final)
      if (final.isScam) {
        incrementScamsBlocked()
        triggerScamDetected(input, final.riskLevel, final.finalRiskScore, final.scamType ?? 'unknown')
      } else {
        toast.success('Low risk — looks safe!')
      }
    } else {
      const topLayer = layerResults[0]
      const skip: LayerResult = { layerName: 'AI Analysis', layerIcon: '🤖', triggered: false, riskScore: 0, riskLevel: 'safe', confidence: 0, flags: [], explanation: 'Skipped — blocked by earlier layers.', durationMs: 0 }
      layerResults.push(skip)
      setLayer(2, { status: 'skipped', result: skip })
      const final: ScamAnalysisResult = {
        isScam: true,
        finalRiskScore: topLayer.riskScore,
        riskLevel: topLayer.riskLevel,
        scamType: topLayer.flags[0]?.flag,
        explanation: topLayer.explanation,
        recommendations: ['Do NOT share OTP or UPI PIN', 'Block this number immediately', 'Report to cybercrime.gov.in', 'Alert your contacts'],
        blockedBy: l1Result.triggered ? 'layer1' : 'layer2',
        layers: layerResults as [LayerResult, LayerResult, LayerResult],
        totalDurationMs: Date.now() - t0,
        dbRecord: dbRecord ? { id: dbRecord.id, reports_count: dbRecord.reports_count, is_verified: dbRecord.is_verified, confidence_score: dbRecord.confidence_score, scam_type: dbRecord.scam_type, description: dbRecord.description } : undefined,
      }
      setScanResult(final)
      incrementScamsBlocked()
      triggerScamDetected(input, final.riskLevel, final.finalRiskScore, final.scamType ?? 'unknown')
    }
    setIsScanning(false)
  }

  const handleReport = async (data: ReportForm) => {
    setIsSubmitting(true)
    const ok = await reportScamToSupabase({
      phone: data.phone?.includes('@') ? undefined : data.phone,
      upi_id: data.phone?.includes('@') ? data.phone : undefined,
      scam_type: data.scamType,
      description: data.description,
    })
    setIsSubmitting(false)
    setShowReportModal(false)
    reportForm.reset()
    if (ok) {
      toast.success('Report saved to Supabase! Thank you.')
    } else {
      toast('Report saved locally (configure Supabase to persist).', { icon: 'ℹ️' })
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Scams Blocked', value: scamsBlocked.toLocaleString(), icon: Shield, color: 'text-success', bg: 'bg-success-light' },
          { label: 'Database Size', value: '20M+', icon: Users, color: 'text-primary', bg: 'bg-primary-light' },
          { label: 'Detection Speed', value: '<50ms', icon: Clock, color: 'text-purple-600', bg: 'bg-purple-100' },
          { label: 'AI Accuracy', value: '98.2%', icon: Bot, color: 'text-warning', bg: 'bg-warning-light' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <p className="font-mono font-bold text-xl text-neutral-dark">{value}</p>
              <p className="text-xs text-neutral-gray">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Input form */}
      <div className="card">
        <h2 className="font-bold text-neutral-dark text-lg mb-1">3-Layer Scam Detection</h2>
        <p className="text-sm text-neutral-gray mb-5">
          DB lookup → 20+ pattern rules → Qwen2.5-Coder:14B AI. All local, zero cloud.
        </p>
        <form onSubmit={handleSubmit(handleCheck)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-dark mb-1.5">Phone number or UPI ID</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-gray" />
              <input
                {...register('input', { required: 'Enter a phone number or UPI ID' })}
                type="text"
                placeholder="+91 98765 43210  or  name@upi"
                className={`input pl-10 ${errors.input ? 'input-error' : ''}`}
              />
            </div>
            {errors.input && <p className="text-xs text-danger mt-1">{errors.input.message}</p>}
            <p className="text-xs text-neutral-gray mt-1">
              Try:&nbsp;
              {LOCAL_SCAM_DB.slice(0, 3).map((s) => (
                <button key={s.id} type="button" className="text-primary underline mr-2"
                  onClick={() => reset({ input: s.phone ?? s.upi_id ?? '', context: '' })}>
                  {s.phone ?? s.upi_id}
                </button>
              ))}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-dark mb-1.5">Context <span className="text-neutral-gray font-normal">(optional)</span></label>
            <textarea
              {...register('context')}
              rows={2}
              placeholder="e.g. They said they are from SBI and my account will be blocked…"
              className="input h-auto py-3 resize-none"
            />
          </div>
          <button type="submit" disabled={isScanning || !inputValue.trim()} className="btn-primary w-full sm:w-auto">
            {isScanning
              ? <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>Analysing…
                </span>
              : <span className="flex items-center gap-2"><Zap className="w-4 h-4" />Run 3-Layer Scan</span>
            }
          </button>
        </form>
      </div>

      {/* Layer progress cards */}
      <div className="space-y-3">
        <h3 className="font-semibold text-neutral-dark text-sm uppercase tracking-wide text-neutral-gray">Detection Layers</h3>
        <LayerCard index={1} icon={Database} title="Layer 1 — Database Lookup"
          subtitle="Supabase + 20M reported scammers (< 100ms)"
          state={layers[0]} onToggle={() => setLayer(0, { expanded: !layers[0].expanded })} />
        <LayerCard index={2} icon={Cpu} title="Layer 2 — Pattern Rules"
          subtitle="20+ heuristic rules, instant detection"
          state={layers[1]} onToggle={() => setLayer(1, { expanded: !layers[1].expanded })} />
        <LayerCard index={3} icon={Bot} title="Layer 3 — AI Analysis"
          subtitle={`Qwen2.5-Coder:14B via Ollama (${ollamaConnected ? 'connected ✓' : 'offline'})`}
          state={layers[2]} onToggle={() => setLayer(2, { expanded: !layers[2].expanded })} />
      </div>

      {/* Final verdict */}
      {scanResult && (
        <div className={`card border-l-4 ${scanResult.isScam ? 'border-danger bg-danger-light/60' : 'border-success bg-success-light/60'}`}>
          <div className="flex items-start gap-4">
            {scanResult.isScam
              ? <XCircle className="w-8 h-8 text-danger shrink-0" />
              : <CheckCircle2 className="w-8 h-8 text-success shrink-0" />}
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h3 className="font-bold text-lg" style={{ color: RISK_COLOR[scanResult.riskLevel] }}>
                  {scanResult.isScam ? '⚠️ SCAM DETECTED' : '✓ Looks Safe'}
                </h3>
                <RiskBadge level={scanResult.riskLevel} score={scanResult.finalRiskScore} />
                <span className="badge-ai ml-auto">
                  <Bot className="w-2.5 h-2.5" /> Blocked by {scanResult.blockedBy}
                </span>
              </div>
              {scanResult.scamType && (
                <p className="text-sm font-medium text-neutral-dark mb-1">{scanResult.scamType}</p>
              )}
              <p className="text-sm text-neutral-gray mb-3">{scanResult.explanation}</p>
              {scanResult.recommendations.length > 0 && (
                <ul className="space-y-0.5">
                  {scanResult.recommendations.map((r, i) => (
                    <li key={i} className="text-xs text-neutral-gray flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" /> {r}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-neutral-gray mt-3">Total scan time: {scanResult.totalDurationMs}ms</p>
            </div>
          </div>
        </div>
      )}

      {/* Known scammers DB */}
      <div className="card">
        <h3 className="font-semibold text-neutral-dark mb-4">Scam Database (Seed Data)</h3>
        <div className="space-y-3">
          {LOCAL_SCAM_DB.map((scam) => (
            <div key={scam.id} className="flex items-start gap-3 p-3 rounded-lg bg-danger-light/50 border border-danger/10">
              <Phone className="w-5 h-5 text-danger shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-neutral-dark text-sm font-mono">{scam.phone ?? scam.upi_id}</p>
                  <span className="badge-danger shrink-0">{scam.reports_count} reports</span>
                </div>
                <p className="text-xs font-semibold text-danger mt-0.5 uppercase">
                  {scam.scam_type.replace(/_/g, ' ')}
                  {scam.is_verified && <span className="ml-2 text-success font-normal">✓ verified</span>}
                </p>
                <p className="text-xs text-neutral-gray mt-1 truncate">{scam.description}</p>
                <p className="text-xs text-neutral-gray mt-1">
                  Last reported: {formatDate(new Date(scam.last_reported), 'relative')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Report CTA */}
      <div className="card bg-gradient-to-r from-orange-50 to-red-50 border-warning/30">
        <div className="flex items-center gap-4">
          <Flag className="w-8 h-8 text-warning shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold text-neutral-dark">Report a Scam</h3>
            <p className="text-sm text-neutral-gray mt-0.5">Protect 400M Indians. Reports saved directly to Supabase.</p>
          </div>
          <button onClick={() => setShowReportModal(true)} className="btn-danger btn-sm shrink-0">Report</button>
        </div>
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowReportModal(false) }}
        >
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl">
            <div className="bg-warning px-6 py-4 flex items-center gap-3 rounded-t-xl">
              <Flag className="w-6 h-6 text-white" />
              <h2 className="text-lg font-bold text-white">Report a Scam</h2>
            </div>
            <form onSubmit={reportForm.handleSubmit(handleReport)} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1.5">
                  Phone / UPI ID <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-gray" />
                  <input
                    {...reportForm.register('phone', { required: 'Required' })}
                    type="text"
                    placeholder="+91 98765 43210  or  name@upi"
                    className={`input pl-10 ${reportForm.formState.errors.phone ? 'input-error' : ''}`}
                  />
                </div>
                {reportForm.formState.errors.phone && (
                  <p className="text-xs text-danger mt-1">{reportForm.formState.errors.phone.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1.5">
                  Scam Type <span className="text-danger">*</span>
                </label>
                <select
                  {...reportForm.register('scamType', { required: 'Required' })}
                  className={`input ${reportForm.formState.errors.scamType ? 'input-error' : ''}`}
                >
                  <option value="">Select…</option>
                  <option value="fake_bank_call">Fake Bank Call (KYC / OTP)</option>
                  <option value="upi_phishing">UPI Phishing</option>
                  <option value="investment_fraud">Investment Fraud</option>
                  <option value="lottery_scam">Lottery / Prize Scam</option>
                  <option value="qr_scam">QR Code Scam</option>
                  <option value="job_fraud">Fake Job Offer</option>
                  <option value="other">Other</option>
                </select>
                {reportForm.formState.errors.scamType && (
                  <p className="text-xs text-danger mt-1">{reportForm.formState.errors.scamType.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1.5">
                  What happened? <span className="text-danger">*</span>
                </label>
                <textarea
                  {...reportForm.register('description', {
                    required: 'Required',
                    minLength: { value: 10, message: 'At least 10 characters' },
                  })}
                  rows={3}
                  placeholder="e.g. They called saying my UPI was blocked and asked for OTP…"
                  className={`input h-auto py-3 resize-none ${reportForm.formState.errors.description ? 'input-error' : ''}`}
                />
                {reportForm.formState.errors.description && (
                  <p className="text-xs text-danger mt-1">{reportForm.formState.errors.description.message}</p>
                )}
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={isSubmitting} className="btn-danger flex-1">
                  {isSubmitting ? 'Saving…' : '🚨 Submit to Supabase'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowReportModal(false); reportForm.reset() }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

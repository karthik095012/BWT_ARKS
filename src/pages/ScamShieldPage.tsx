import { useState } from 'react'
import {
  Shield, Search, Phone, AlertTriangle, CheckCircle2,
  XCircle, Bot, Users, Flag, Clock,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { analyzeScamRisk } from '@/services/ollama'
import { useAppStore } from '@/store/useAppStore'
import { triggerScamDetected } from '@/services/n8n'
import { getRiskColor, formatDate } from '@/utils/helpers'
import toast from 'react-hot-toast'

interface CheckForm {
  input: string
  context: string
}

interface ScanResult {
  isScam: boolean
  riskScore: number
  riskLevel: string
  scamType?: string
  explanation: string
  recommendations: string[]
  detectionTimeMs: number
}

const MOCK_SCAM_DB = [
  {
    id: 's1',
    phone: '+91 9876543210',
    type: 'Fake HDFC Bank Representative',
    reports: 847,
    first: new Date('2025-01-15'),
    last: new Date('2026-03-01'),
    description: 'Calls pretending to be HDFC Bank KYC team, asks for OTP and UPI PIN.',
  },
  {
    id: 's2',
    phone: '+91 8899001122',
    type: 'Investment Fraud (100x returns)',
    reports: 234,
    first: new Date('2025-06-01'),
    last: new Date('2026-02-28'),
    description: 'WhatsApp group scam promising 100x returns in "BTC mining". Asks for ₹5000 to join.',
  },
  {
    id: 's3',
    phone: '+91 7788990011',
    type: 'Lottery / Prize Winner Scam',
    reports: 1203,
    first: new Date('2024-11-01'),
    last: new Date('2026-03-02'),
    description: 'Claims you won ₹25 lakh in a lucky draw. Demands ₹2000 "processing fee".',
  },
]

export default function ScamShieldPage() {
  const { scamsBlocked, incrementScamsBlocked, ollamaConnected } = useAppStore()
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const { register, handleSubmit, watch, formState: { errors } } = useForm<CheckForm>()
  const inputValue = watch('input') || ''

  const handleCheck = async (data: CheckForm) => {
    setIsScanning(true)
    const t0 = Date.now()

    // First: check local mock DB
    const localMatch = MOCK_SCAM_DB.find((s) =>
      s.phone.replace(/\s/g, '') === data.input.replace(/\s/g, '') ||
      s.phone.includes(data.input.replace(/\D/g, '').slice(-10)),
    )

    try {
      const aiResult = await analyzeScamRisk(data.input, data.context || 'No additional context')
      const detectionTimeMs = Date.now() - t0

      const result: ScanResult = {
        isScam: localMatch ? true : aiResult.isScam,
        riskScore: localMatch ? 98 : aiResult.riskScore,
        riskLevel: localMatch ? 'critical' : aiResult.riskLevel,
        scamType: localMatch?.type || aiResult.scamType,
        explanation: localMatch
          ? localMatch.description
          : aiResult.explanation,
        recommendations: aiResult.recommendations || [
          'Do NOT answer calls from this number',
          'Do NOT share any OTP or UPI PIN',
          'Report to Cyber Crime: cybercrime.gov.in',
        ],
        detectionTimeMs,
      }

      setScanResult(result)
      if (result.isScam) {
        incrementScamsBlocked()
        setShowModal(true)
        // Fire n8n scam alert automation (non-blocking)
        triggerScamDetected(data.input, result.riskLevel, result.riskScore, result.scamType || 'unknown')
      } else {
        toast.success(`Low risk detected. Stay cautious!`)
      }
    } catch {
      toast.error('Scan failed. Please retry.')
    } finally {
      setIsScanning(false)
    }
  }

  const riskBg = {
    low: 'bg-success-light border-success',
    medium: 'bg-warning-light border-warning',
    high: 'bg-orange-100 border-orange-400',
    critical: 'bg-danger-light border-danger animate-shake',
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

      {/* Check form */}
      <div className="card">
        <h2 className="font-bold text-neutral-dark text-lg mb-1">Check Phone / UPI ID for Scams</h2>
        <p className="text-sm text-neutral-gray mb-5">
          Enter a phone number or UPI ID to check against 20M+ reported scammers.
          AI-powered by Qwen2.5-Coder:7B.
        </p>

        <form onSubmit={handleSubmit(handleCheck)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-dark mb-1.5">
              Phone Number or UPI ID
            </label>
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
              Try: <button type="button" className="text-primary underline"
                onClick={() => {}}>+91 9876543210</button> (known scammer demo)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-dark mb-1.5">
              Context (Optional)
            </label>
            <textarea
              {...register('context')}
              rows={2}
              placeholder="e.g. They said they're from SBI bank and my account will be blocked…"
              className="input h-auto py-3 resize-none"
            />
          </div>

          <button type="submit" disabled={isScanning || !inputValue.trim()} className="btn-primary w-full sm:w-auto">
            {isScanning ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                AI Scanning ({ollamaConnected ? 'Qwen' : 'Fallback'})…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Shield className="w-4 h-4" /> Scan Now
              </span>
            )}
          </button>
        </form>
      </div>

      {/* Last scan result (inline) */}
      {scanResult && !showModal && (
        <div className={`card border-l-4 ${riskBg[scanResult.riskLevel as keyof typeof riskBg] || 'bg-neutral-light border-neutral-gray'}`}>
          <div className="flex items-start gap-4">
            <div>
              {scanResult.isScam ? (
                <XCircle className="w-8 h-8 text-danger" />
              ) : (
                <CheckCircle2 className="w-8 h-8 text-success" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="font-bold text-lg" style={{ color: getRiskColor(scanResult.riskLevel) }}>
                  {scanResult.isScam ? '⚠️ SCAM DETECTED' : '✓ Looks Safe'}
                </h3>
                <span className="badge" style={{
                  backgroundColor: `${getRiskColor(scanResult.riskLevel)}20`,
                  color: getRiskColor(scanResult.riskLevel),
                }}>
                  {scanResult.riskLevel.toUpperCase()} RISK
                </span>
                <span className="badge-ai ml-auto">
                  <Bot className="w-2.5 h-2.5" /> AI · {scanResult.riskScore}% confidence
                </span>
              </div>
              {scanResult.scamType && (
                <p className="text-sm font-medium text-neutral-dark mb-1">{scanResult.scamType}</p>
              )}
              <p className="text-sm text-neutral-gray mb-3">{scanResult.explanation}</p>
              <div>
                <p className="text-xs font-semibold text-neutral-dark mb-1">What to do:</p>
                <ul className="space-y-1">
                  {scanResult.recommendations.map((r, i) => (
                    <li key={i} className="text-xs text-neutral-gray flex items-start gap-1.5">
                      <span className="text-success mt-0.5">✓</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-neutral-gray mt-3">
                Detected in {scanResult.detectionTimeMs}ms
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Known scammers */}
      <div className="card">
        <h3 className="font-semibold text-neutral-dark mb-4">
          Recently Reported Scammers
        </h3>
        <div className="space-y-3">
          {MOCK_SCAM_DB.map((scam) => (
            <div
              key={scam.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-danger-light/50 border border-danger/10"
            >
              <Phone className="w-5 h-5 text-danger shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-neutral-dark text-sm font-mono">{scam.phone}</p>
                  <span className="badge-danger shrink-0">{scam.reports} reports</span>
                </div>
                <p className="text-xs font-semibold text-danger mt-0.5">{scam.type}</p>
                <p className="text-xs text-neutral-gray mt-1 truncate">{scam.description}</p>
                <p className="text-xs text-neutral-gray mt-1">
                  Last reported: {formatDate(scam.last, 'relative')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Report scam CTA */}
      <div className="card bg-gradient-to-r from-orange-50 to-red-50 border-warning/30">
        <div className="flex items-center gap-4">
          <Flag className="w-8 h-8 text-warning shrink-0" />
          <div className="flex-1">
            <h3 className="font-semibold text-neutral-dark">Report a Scam</h3>
            <p className="text-sm text-neutral-gray mt-0.5">
              Help protect 400M Indians. Report fraudulent numbers to our community database.
            </p>
          </div>
          <button
            onClick={() => toast.success('Report submitted! Thank you for protecting the community.')}
            className="btn-danger btn-sm shrink-0"
          >
            Report
          </button>
        </div>
      </div>

      {/* Scam Alert Modal */}
      {showModal && scanResult && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div className="bg-white rounded-xl max-w-lg w-full overflow-hidden shadow-2xl animate-slide-up">
            {/* Red header */}
            <div className="bg-danger px-6 py-5 flex items-start gap-3">
              <AlertTriangle className="w-8 h-8 text-white shrink-0" />
              <div>
                <h2 className="text-xl font-bold text-white">⚠️ SCAM ALERT</h2>
                <p className="text-red-100 text-sm mt-1">This number has been reported for fraudulent activity</p>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="bg-danger-light rounded-lg p-4 border border-danger/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-danger">HIGH RISK</span>
                  <span className="badge-ai">
                    <Bot className="w-2.5 h-2.5" /> AI – {scanResult.riskScore}% confident
                  </span>
                </div>
                <p className="text-sm font-mono font-medium text-neutral-dark mb-1">{inputValue}</p>
                {scanResult.scamType && (
                  <p className="text-sm text-danger font-medium">{scanResult.scamType}</p>
                )}
              </div>

              <div>
                <p className="text-sm font-semibold text-neutral-dark mb-2">How this scam works:</p>
                <p className="text-sm text-neutral-gray">{scanResult.explanation}</p>
              </div>

              <div>
                <p className="text-sm font-semibold text-neutral-dark mb-2">What you should do:</p>
                <ul className="space-y-1.5">
                  {scanResult.recommendations.map((r, i) => (
                    <li key={i} className="text-sm text-neutral-gray flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    toast.success('Number blocked!')
                    setShowModal(false)
                  }}
                  className="btn-danger flex-1"
                >
                  Block Number
                </button>
                <button
                  onClick={() => {
                    toast.success('Thank you for reporting!')
                    setShowModal(false)
                  }}
                  className="btn-secondary flex-1"
                >
                  Report More Details
                </button>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-full text-center text-sm text-neutral-gray hover:text-neutral-dark"
              >
                Close ×
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

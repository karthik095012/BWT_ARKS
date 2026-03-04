import { useState } from 'react'
import { Banknote, CheckCircle2, Clock, TrendingUp, ArrowRight, Shield, Bot } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { useNavigate } from 'react-router-dom'
import { triggerLoanApplied } from '@/services/n8n'
import { formatCurrency } from '@/utils/helpers'
import toast from 'react-hot-toast'

interface LoanProduct {
  id: string
  provider: string
  type: string
  badge: string
  badgeColor: string
  minAmount: number
  maxAmount: number
  interestRate: number
  tenureMonths: string
  processingFee: string
  features: string[]
  requiredScore: number
  turnaround: string
  icon: string
}

const LOAN_PRODUCTS: LoanProduct[] = [
  {
    id: 'emergency',
    provider: 'CredIQ Emergency',
    type: 'Emergency Loan',
    badge: 'Instant',
    badgeColor: 'bg-danger-light text-red-700',
    minAmount: 2000,
    maxAmount: 10000,
    interestRate: 18,
    tenureMonths: '1–3',
    processingFee: '0%',
    features: ['Disburse in <30 minutes', 'No paperwork', 'Auto-repay from next gig payout'],
    requiredScore: 500,
    turnaround: '30 mins',
    icon: '⚡',
  },
  {
    id: 'microloan',
    provider: 'Stashfin NBFC',
    type: 'Microloan',
    badge: 'Popular',
    badgeColor: 'bg-success-light text-green-700',
    minAmount: 5000,
    maxAmount: 50000,
    interestRate: 15,
    tenureMonths: '3–12',
    processingFee: '1%',
    features: ['Weekly or monthly repayment', 'Gig income accepted', 'No salary slip needed'],
    requiredScore: 600,
    turnaround: '24 hours',
    icon: '💰',
  },
  {
    id: 'personal',
    provider: 'KreditBee',
    type: 'Personal Loan',
    badge: 'Best Rate',
    badgeColor: 'bg-primary-light text-primary-dark',
    minAmount: 10000,
    maxAmount: 200000,
    interestRate: 12,
    tenureMonths: '6–24',
    processingFee: '2%',
    features: ['Lowest interest rate', 'Flexible repayment', 'Credit bureau reporting to improve CIBIL'],
    requiredScore: 700,
    turnaround: '48 hours',
    icon: '🏦',
  },
  {
    id: 'insurance',
    provider: 'CredIQ Protect',
    type: 'Micro Insurance',
    badge: 'Just ₹99/mo',
    badgeColor: 'bg-purple-100 text-purple-700',
    minAmount: 99,
    maxAmount: 99,
    interestRate: 0,
    tenureMonths: '1–12',
    processingFee: '0%',
    features: ['Life cover ₹5 lakh', 'Accident cover ₹2 lakh', 'Income protection 3 months'],
    requiredScore: 0,
    turnaround: 'Instant',
    icon: '🛡️',
  },
]

export default function LoansPage() {
  const { credScore } = useAppStore()
  const [applying, setApplying] = useState<string | null>(null)
  const [applied, setApplied] = useState<string[]>([])
  const navigate = useNavigate()

  const handleApply = async (product: LoanProduct) => {
    if (!credScore) {
      toast.error('Calculate your CredScore first to apply for loans.')
      return
    }
    if (credScore.score < product.requiredScore) {
      toast.error(`Minimum score of ${product.requiredScore} required. Your score: ${credScore.score}`)
      return
    }
    setApplying(product.id)
    await new Promise((r) => setTimeout(r, 1800))
    setApplied((prev) => [...prev, product.id])
    setApplying(null)
    toast.success(`Application submitted to ${product.provider}! You'll hear back in ${product.turnaround}.`)
    // Fire n8n loan automation (non-blocking)
    triggerLoanApplied(product.type, product.provider, product.maxAmount, credScore.score)
  }

  const eligible = credScore ? credScore.loanEligibility : null

  return (
    <div className="space-y-6">
      {/* Eligibility banner */}
      {credScore ? (
        <div className={`card ${eligible?.eligible ? 'bg-success-light border-success/30' : 'bg-warning-light border-warning/30'}`}>
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl`}>
              {eligible?.eligible ? '✅' : '⚠️'}
            </div>
            <div className="flex-1">
              {eligible?.eligible ? (
                <>
                  <h2 className="font-bold text-neutral-dark text-lg">
                    You Are Eligible! Up to{' '}
                    <span className="text-success font-mono">{formatCurrency(eligible.maxAmount)}</span>
                  </h2>
                  <p className="text-sm text-neutral-gray">
                    Based on your CredScore of <strong>{credScore.score}</strong> ({credScore.tier}) ·{' '}
                    {eligible.reason}
                  </p>
                </>
              ) : (
                <>
                  <h2 className="font-bold text-neutral-dark text-lg">Not Yet Eligible</h2>
                  <p className="text-sm text-neutral-gray">{eligible?.reason}</p>
                </>
              )}
            </div>
            {!eligible?.eligible && (
              <button
                onClick={() => navigate('/credscore')}
                className="btn-primary btn-sm shrink-0"
              >
                Improve Score <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="alert-warning">
          <Bot className="w-5 h-5 text-warning shrink-0" />
          <div>
            <p className="font-medium text-sm text-neutral-dark">Calculate Your CredScore First</p>
            <p className="text-xs text-neutral-gray mt-0.5">
              We need your score to show personalized loan offers.
              <button onClick={() => navigate('/dashboard')} className="ml-1 text-primary underline">
                Go to Dashboard →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Loan products */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {LOAN_PRODUCTS.map((product) => {
          const isEligible = !credScore || credScore.score >= product.requiredScore
          const isApplied = applied.includes(product.id)
          const isApplying = applying === product.id

          return (
            <div
              key={product.id}
              className={`card transition-all ${isEligible ? 'hover:shadow-card-hover' : 'opacity-75'}`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{product.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-neutral-dark">{product.type}</h3>
                      <span className={`badge text-xs ${product.badgeColor}`}>{product.badge}</span>
                    </div>
                    <p className="text-xs text-neutral-gray">{product.provider}</p>
                  </div>
                </div>
                {!isEligible && (
                  <span className="badge-warning text-xs">Score {product.requiredScore}+ needed</span>
                )}
              </div>

              {/* Amount range */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-neutral-light rounded-lg p-3 text-center">
                  <p className="text-xs text-neutral-gray mb-0.5">Loan Amount</p>
                  <p className="font-mono font-bold text-sm text-neutral-dark">
                    {product.type === 'Micro Insurance'
                      ? `₹${product.minAmount}/mo`
                      : `${formatCurrency(product.minAmount, true)}–${formatCurrency(product.maxAmount, true)}`}
                  </p>
                </div>
                <div className="bg-neutral-light rounded-lg p-3 text-center">
                  <p className="text-xs text-neutral-gray mb-0.5">Interest p.a.</p>
                  <p className="font-mono font-bold text-sm text-neutral-dark">
                    {product.interestRate === 0 ? 'N/A' : `${product.interestRate}%`}
                  </p>
                </div>
                <div className="bg-neutral-light rounded-lg p-3 text-center">
                  <p className="text-xs text-neutral-gray mb-0.5">Tenure</p>
                  <p className="font-mono font-bold text-sm text-neutral-dark">
                    {product.tenureMonths} mo
                  </p>
                </div>
              </div>

              {/* Features */}
              <ul className="space-y-1.5 mb-5">
                {product.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-neutral-gray">
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
                <li className="flex items-center gap-2 text-sm text-neutral-gray">
                  <Clock className="w-4 h-4 text-primary shrink-0" />
                  Turnaround: {product.turnaround}
                </li>
                <li className="flex items-center gap-2 text-sm text-neutral-gray">
                  <Banknote className="w-4 h-4 text-neutral-gray shrink-0" />
                  Processing fee: {product.processingFee}
                </li>
              </ul>

              {/* CTA */}
              <button
                onClick={() => handleApply(product)}
                disabled={isApplying || isApplied || !isEligible}
                className={`w-full btn ${
                  isApplied
                    ? 'bg-success-light text-green-700 border border-success cursor-default'
                    : isEligible
                    ? 'btn-primary'
                    : 'btn-ghost border border-neutral-border cursor-not-allowed'
                }`}
              >
                {isApplied ? (
                  <><CheckCircle2 className="w-4 h-4" /> Applied! Awaiting Approval</>
                ) : isApplying ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Submitting Application…
                  </>
                ) : !isEligible ? (
                  `Need Score ${product.requiredScore}+`
                ) : (
                  <><TrendingUp className="w-4 h-4" /> Apply Now <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* Privacy note */}
      <div className="card bg-neutral-light border-neutral-border">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-neutral-dark mb-1">Privacy & Data Protection</p>
            <p className="text-xs text-neutral-gray">
              CredIQ never shares your raw transaction data with lenders. We only transmit your
              aggregated behavioral score and income metadata (e.g., "avg income ₹24,500/month") —
              never merchant names, UPI IDs, or payment descriptions. All AI processing is local.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

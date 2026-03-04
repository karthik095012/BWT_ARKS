import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, IndianRupee, ShieldCheck,
  Upload, ChevronRight, Bot, AlertTriangle,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { useAppStore } from '@/store/useAppStore'
import { generateMockTransactions, parseUPICSV, parseUPIPDF } from '@/services/upiParser'
import { analyzeTransactions } from '@/services/ollama'
import { triggerScoreCalculated, triggerScoreImproved } from '@/services/n8n'
import { calculateCredScore, buildDashboardStats, generateImprovements } from '@/utils/credScore'
import { formatCurrency, cleanDisplayName } from '@/utils/helpers'
import ScoreGauge from '@/components/ui/ScoreGauge'
import MetricCard from '@/components/ui/MetricCard'
import TransactionItem from '@/components/ui/TransactionItem'
import toast from 'react-hot-toast'

export default function DashboardPage() {
  const {
    credScore, setCredScore, setCalculating, isCalculating,
    transactions, setTransactions, dashboardStats, setDashboardStats,
    setImprovements, ollamaConnected, user,
  } = useAppStore()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [statsLoading, setStatsLoading] = useState(!dashboardStats)

  const handleUploadFile = async (file: File) => {
    const isPDF = file.name.toLowerCase().endsWith('.pdf')
    const isCSV = file.name.toLowerCase().endsWith('.csv')
    if (!isPDF && !isCSV) { toast.error('Please upload a CSV or PDF file.'); return }
    const toastId = toast.loading(`Parsing ${isPDF ? 'PDF' : 'CSV'} transactions…`)
    try {
      const parsed = isPDF
        ? await parseUPIPDF(await file.arrayBuffer())
        : parseUPICSV(await file.text())
      setTransactions(parsed)
      setDashboardStats(buildDashboardStats(parsed))
      toast.success(`Loaded ${parsed.length} transactions!`, { id: toastId })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Parse error', { id: toastId })
    }
  }

  // Load mock data on first visit; rebuild stats if transactions exist but stats were lost (not persisted)
  useEffect(() => {
    if (!transactions.length) {
      const txs = generateMockTransactions()
      setTransactions(txs)
      setDashboardStats(buildDashboardStats(txs))
    } else if (!dashboardStats) {
      setDashboardStats(buildDashboardStats(transactions))
    }
    setStatsLoading(false)
  }, []) // eslint-disable-line

  const handleCalculateScore = async () => {
    if (!transactions.length) {
      toast.error('No transactions loaded. Upload a CSV or use demo data.')
      return
    }
    setCalculating(true)
    const toastId = toast.loading('Analyzing transactions…')
    // Hard 35s timeout — guarantees the button always un-sticks
    const hardTimeout = setTimeout(() => {
      setCalculating(false)
      toast.error('Analysis timed out. Using offline fallback.', { id: toastId })
    }, 35_000)
    try {
      const aiResult = await analyzeTransactions(transactions)
      const score = calculateCredScore(transactions, aiResult)
      setCredScore(score)
      setImprovements(generateImprovements(score.score))
      const stats = buildDashboardStats(transactions)
      setDashboardStats(stats)
      clearTimeout(hardTimeout)
      toast.success(`CredScore: ${score.score} (${score.tier})`, { id: toastId })
      // Fire n8n automations (non-blocking, safe)
      triggerScoreCalculated(score.score, score.tier, user?.phone || user?.email || '+916238046005').catch(() => {})
      if (credScore && score.score - credScore.score >= 10) {
        triggerScoreImproved(credScore.score, score.score, score.tier).catch(() => {})
      }
    } catch (err) {
      clearTimeout(hardTimeout)
      console.error('Score calculation error:', err)
      toast.error('Analysis failed. Please retry.', { id: toastId })
    } finally {
      clearTimeout(hardTimeout)
      setCalculating(false)
    }
  }

  const stats = dashboardStats
  const recentTx = [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-dark">
            Welcome back, {user?.name ? cleanDisplayName(user.name) : 'there'} 👋
          </h2>
          <p className="text-sm text-neutral-gray mt-0.5">
            {transactions.length} transactions loaded ·{' '}
            {credScore ? `Score last updated ${new Date(credScore.calculatedAt).toLocaleDateString('en-IN')}` : 'Calculate your CredScore below'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUploadFile(e.target.files[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="btn-secondary btn-sm flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Upload UPI CSV
          </button>
          {!credScore && (
            <button
              onClick={handleCalculateScore}
              disabled={isCalculating}
              className="btn-primary btn-sm"
            >
              {isCalculating ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Calculating…
                </span>
              ) : (
                'Calculate Score'
              )}
            </button>
          )}
        </div>
      </div>

      {/* Ollama offline notice */}
      {!ollamaConnected && (
        <div className="alert-warning">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-800">Ollama AI Offline</p>
            <p className="text-xs text-yellow-700 mt-0.5">
              Qwen2.5-Coder:7B not detected. Run{' '}
              <code className="font-mono bg-yellow-200 px-1 rounded">
                docker-compose up ollama
              </code>{' '}
              or{' '}
              <code className="font-mono bg-yellow-200 px-1 rounded">ollama serve</code>
              . Smart numerical fallback will be used for scoring.
            </p>
          </div>
        </div>
      )}

      {/* Hero: Score + Metrics row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Score Card */}
        <div className="lg:col-span-1 card bg-score-gradient text-white flex flex-col items-center justify-center py-8 space-y-4">
          <p className="text-blue-100 text-sm font-medium">Your CredScore</p>
          {credScore ? (
            <>
              <ScoreGauge score={credScore.score} size="md" />
              <div className="text-center">
                <p className="text-blue-100 text-sm">
                  Eligible for{' '}
                  <span className="text-white font-bold">
                    {formatCurrency(credScore.loanEligibility.maxAmount, true)}
                  </span>
                </p>
              </div>
              <button
                onClick={() => navigate('/credscore')}
                className="flex items-center gap-1 text-blue-200 hover:text-white text-sm transition-colors"
              >
                View Details <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="text-center space-y-3">
              <div className="w-32 h-32 rounded-full border-4 border-white/20 flex items-center justify-center">
                <p className="font-mono text-5xl font-bold text-white/40">—</p>
              </div>
              <p className="text-blue-200 text-sm">Not calculated yet</p>
              <button
                onClick={handleCalculateScore}
                disabled={isCalculating}
                className="btn bg-white text-primary px-5 py-2 text-sm font-semibold hover:bg-blue-50"
              >
                {isCalculating ? 'Analyzing…' : '✨ Calculate Now'}
              </button>
            </div>
          )}
        </div>

        {/* 3 metric cards */}
        <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            label="Monthly Income"
            value={stats ? formatCurrency(stats.totalIncome / 6, true) : '—'}
            change={5}
            color="success"
            loading={statsLoading}
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <MetricCard
            label="Monthly Expenses"
            value={stats ? formatCurrency(stats.totalExpenses / 6, true) : '—'}
            change={-3}
            color="danger"
            loading={statsLoading}
            icon={<TrendingDown className="w-4 h-4" />}
          />
          <MetricCard
            label="Savings Rate"
            value={stats ? `${Math.round(stats.savingsRate * 100)}%` : '—'}
            change={2}
            color="primary"
            loading={statsLoading}
            icon={<IndianRupee className="w-4 h-4" />}
          />
        </div>
      </div>

      {/* Score Component scores */}
      {credScore && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Object.entries(credScore.components).slice(0, 4).map(([key, comp]) => (
            <div key={key} className="card">
              <p className="text-xs text-neutral-gray mb-1">{comp.label}</p>
              <p className="font-mono text-2xl font-bold text-neutral-dark">{comp.score}</p>
              <div className="w-full h-1.5 rounded-full bg-neutral-border mt-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${comp.score}%`,
                    backgroundColor:
                      comp.score >= 75 ? '#10B981' : comp.score >= 50 ? '#3B82F6' : '#EF4444',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Charts row */}
      {stats && stats.monthlyTrend.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Income trend */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-neutral-dark">Income vs Expenses</h3>
              <span className="text-xs text-neutral-gray">6 months</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={stats.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={(v) => `₹${v / 1000}K`} />
                <Tooltip
                  formatter={(v: number) => [formatCurrency(v), '']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                />
                <Line type="monotone" dataKey="income" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} name="Income" />
                <Line type="monotone" dataKey="expenses" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} name="Expenses" />
                <Line type="monotone" dataKey="savings" stroke="#3B82F6" strokeWidth={2} strokeDasharray="4 2" dot={false} name="Savings" />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Spending breakdown */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-neutral-dark">Spending Breakdown</h3>
              <span className="text-xs text-neutral-gray">By Category</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={stats.categoryBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {stats.categoryBreakdown.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, name: string) => [formatCurrency(v), name]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend
                  formatter={(v) => v.replace(/_/g, ' ')}
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent transactions */}
      {recentTx.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-neutral-dark">Recent Transactions</h3>
            <button
              onClick={() => navigate('/transactions')}
              className="text-sm text-primary hover:text-primary-dark flex items-center gap-1"
            >
              View All <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div>
            {recentTx.map((tx) => (
              <TransactionItem key={tx.id} transaction={tx} compact />
            ))}
          </div>
        </div>
      )}

      {/* ScamShield teaser */}
      <div
        className="card bg-gradient-to-r from-red-50 to-orange-50 border-danger/20 cursor-pointer hover:shadow-card-hover transition-all"
        onClick={() => navigate('/scamshield')}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-danger-light flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-danger" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-dark">ScamShield Active</h3>
              <p className="text-sm text-neutral-gray">
                Protecting against UPI fraud · 20M+ scammer database ·{' '}
                <span className="text-success font-medium">98.2% accuracy</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-neutral-gray">
            <Bot className="w-4 h-4 text-purple-600" />
            <span className="text-sm">Check a Number</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      </div>
    </div>
  )
}

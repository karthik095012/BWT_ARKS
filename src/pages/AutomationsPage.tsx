import { useState, useEffect, useCallback } from 'react'
import {
  Workflow, Zap, CheckCircle2, XCircle, Clock, Wifi, WifiOff,
  RefreshCw, ExternalLink, Download, ChevronRight, Circle,
} from 'lucide-react'
import {
  checkN8nHealth,
  getEventLog,
  WORKFLOW_WEBHOOKS,
  triggerAutomation,
  type AutomationEvent,
  type AutomationEventType,
} from '@/services/n8n'
import { useAppStore } from '@/store/useAppStore'
import { formatDate } from '@/utils/helpers'
import toast from 'react-hot-toast'

const STATUS_COLORS: Record<AutomationEvent['status'], string> = {
  success: 'text-success bg-success-light',
  failed:  'text-danger bg-danger-light',
  pending: 'text-amber-600 bg-amber-50',
  offline: 'text-neutral-gray bg-neutral-light',
}

const STATUS_ICONS: Record<AutomationEvent['status'], React.ReactNode> = {
  success: <CheckCircle2 className="w-3.5 h-3.5" />,
  failed:  <XCircle className="w-3.5 h-3.5" />,
  pending: <Clock className="w-3.5 h-3.5" />,
  offline: <WifiOff className="w-3.5 h-3.5" />,
}

const WORKFLOW_DOCS: Partial<Record<AutomationEventType, string[]>> = {
  score_calculated: ['Send WhatsApp message with the new score', 'Send an email summary to the user', 'Save score history to Google Sheets'],
  scam_detected:   ['Send SMS alert to user immediately', 'Post warning to a team WhatsApp/Slack group', 'Save the scam report to a spreadsheet'],
  loan_applied:    ['Send loan details to the lending partner', 'Send a confirmation email to the user', 'Save the application in a Google Sheet'],
  csv_uploaded:    ['Re-calculate the score automatically', 'Save the uploaded file to Google Drive', 'Notify the admin that new data is available'],
}

export default function AutomationsPage() {
  const { credScore, user } = useAppStore()
  const [n8nOnline, setN8nOnline] = useState<boolean | null>(null)
  const [events, setEvents] = useState<AutomationEvent[]>([])
  const [testing, setTesting] = useState<AutomationEventType | null>(null)
  const [checkingHealth, setCheckingHealth] = useState(false)

  const refreshLog = useCallback(() => setEvents(getEventLog()), [])

  const checkHealth = useCallback(async () => {
    setCheckingHealth(true)
    const ok = await checkN8nHealth()
    setN8nOnline(ok)
    setCheckingHealth(false)
  }, [])

  useEffect(() => {
    checkHealth()
    refreshLog()
    const interval = setInterval(refreshLog, 3000)
    return () => clearInterval(interval)
  }, [checkHealth, refreshLog])

  const handleTest = async (type: AutomationEventType) => {
    setTesting(type)
    const payload: Record<string, unknown> =
      type === 'score_calculated' ? { score: credScore?.score || 720, tier: credScore?.tier || 'Good', phone: user?.phone || user?.email || '+916238046005' }
      : type === 'scam_detected'  ? { input: '+91 9876543210', riskLevel: 'critical', riskScore: 98, scamType: 'fake_bank_call' }
      : type === 'loan_applied'   ? { loanType: 'Microloan', provider: 'Stashfin NBFC', amount: 25000, score: credScore?.score || 720 }
      : type === 'csv_uploaded'   ? { txCount: 180, monthsCovered: 6 }
      : { test: true }

    const evt = await triggerAutomation(type, payload)
    refreshLog()
    setTesting(null)

    if (evt.status === 'success') toast.success(`Workflow fired! (${evt.durationMs}ms)`)
    else if (evt.status === 'offline') toast('n8n offline — event logged locally', { icon: '📋' })
    else toast.error(`Webhook failed — is n8n running?`)
  }

  const totalSuccess = events.filter((e) => e.status === 'success').length
  const totalFired   = events.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-dark flex items-center gap-2">
            <Workflow className="w-6 h-6 text-primary" />
            Automations
          </h1>
          <p className="text-neutral-gray text-sm mt-0.5">
            Automatically send alerts &amp; notifications when something important happens in CredIQ
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* n8n status */}
          <div className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full ${
            n8nOnline === null ? 'bg-neutral-light text-neutral-gray'
            : n8nOnline ? 'bg-success-light text-green-700'
            : 'bg-neutral-light text-neutral-gray'
          }`}>
            {n8nOnline === null ? <Circle className="w-3 h-3" />
              : n8nOnline ? <Wifi className="w-3.5 h-3.5" />
              : <WifiOff className="w-3.5 h-3.5" />}
            {n8nOnline === null ? 'Checking…' : n8nOnline ? 'n8n Online' : 'n8n Offline'}
          </div>

          <button
            onClick={checkHealth}
            disabled={checkingHealth}
            className="btn-ghost p-2"
            title="Refresh status"
          >
            <RefreshCw className={`w-4 h-4 ${checkingHealth ? 'animate-spin' : ''}`} />
          </button>

          <a
            href="http://localhost:5678"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost flex items-center gap-1.5 text-sm"
          >
            Open n8n <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* n8n offline subtle note */}
      {n8nOnline === false && (
        <div className="flex items-center gap-2 text-sm text-neutral-gray bg-neutral-light/60 rounded-xl px-4 py-2.5">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>n8n is not running — events are saved locally. Run <code className="text-xs font-mono bg-neutral-dark/10 px-1.5 py-0.5 rounded">docker-compose up -d n8n</code> to enable live alerts.</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Workflows', value: Object.keys(WORKFLOW_WEBHOOKS).length, icon: '⚙️' },
          { label: 'Events Fired', value: totalFired, icon: '⚡' },
          { label: 'Successful', value: totalSuccess, icon: '✅' },
          { label: 'Success Rate', value: totalFired ? `${Math.round((totalSuccess / totalFired) * 100)}%` : '—', icon: '📈' },
        ].map(({ label, value, icon }) => (
          <div key={label} className="card text-center">
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-2xl font-bold text-neutral-dark">{value}</div>
            <div className="text-xs text-neutral-gray">{label}</div>
          </div>
        ))}
      </div>

      {/* Workflow cards */}
      <div>
        <h2 className="text-lg font-semibold text-neutral-dark mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" /> What Gets Triggered
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {(Object.entries(WORKFLOW_WEBHOOKS) as [AutomationEventType, typeof WORKFLOW_WEBHOOKS[AutomationEventType]][]).map(
            ([type, wf]) => {
              const recentEvents = events.filter((e) => e.type === type)
              const lastEvent = recentEvents[0]
              const docs = WORKFLOW_DOCS[type] || []

              return (
                <div key={type} className="card hover:shadow-medium transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl">{wf.icon}</span>
                      <div>
                        <p className="font-semibold text-neutral-dark text-sm">{wf.label}</p>
                        <code className="text-xs text-neutral-gray font-mono">POST {wf.path}</code>
                      </div>
                    </div>
                    <button
                      onClick={() => handleTest(type)}
                      disabled={testing === type}
                      className="btn-primary py-1.5 px-3 text-xs"
                    >
                      {testing === type ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        'Test Fire'
                      )}
                    </button>
                  </div>

                  <p className="text-xs text-neutral-gray mb-3">{wf.description}</p>

                  {docs.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-neutral-dark mb-1.5">You can also use it to:</p>
                      <ul className="space-y-1">
                        {docs.map((d) => (
                          <li key={d} className="flex items-start gap-1.5 text-xs text-neutral-gray">
                            <ChevronRight className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                            {d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {lastEvent && (
                    <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md w-fit ${STATUS_COLORS[lastEvent.status]}`}>
                      {STATUS_ICONS[lastEvent.status]}
                      Last: {lastEvent.status} · {lastEvent.durationMs ? `${lastEvent.durationMs}ms` : '—'}
                    </div>
                  )}
                </div>
              )
            },
          )}
        </div>
      </div>

      {/* Event log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-neutral-dark flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" /> Event Log
          </h2>
          <button onClick={refreshLog} className="btn-ghost text-xs flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>

        {events.length === 0 ? (
          <div className="card text-center py-12 text-neutral-gray">
            <Workflow className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nothing has fired yet</p>
            <p className="text-sm mt-1">Click "Test Fire" on any card above to try it out</p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((evt) => (
              <div key={evt.id} className="card flex items-center gap-4 py-3">
                <span className="text-xl shrink-0">{WORKFLOW_WEBHOOKS[evt.type]?.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-neutral-dark">
                      {WORKFLOW_WEBHOOKS[evt.type]?.label}
                    </p>
                    <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[evt.status]}`}>
                      {STATUS_ICONS[evt.status]} {evt.status}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-gray font-mono mt-0.5">
                    {evt.workflowId} · {formatDate(new Date(evt.triggeredAt))}
                    {evt.durationMs ? ` · ${evt.durationMs}ms` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

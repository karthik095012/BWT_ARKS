import axios from 'axios'

const N8N_BASE = import.meta.env.VITE_N8N_WEBHOOK_URL || 'http://localhost:5678'

// ===== Event Types =====
export type AutomationEventType =
  | 'score_calculated'
  | 'scam_detected'
  | 'loan_applied'
  | 'csv_uploaded'
  | 'suspicious_transaction'
  | 'score_improved'

export interface AutomationEvent {
  id: string
  type: AutomationEventType
  triggeredAt: Date
  payload: Record<string, unknown>
  status: 'success' | 'failed' | 'pending' | 'offline'
  workflowId: string
  durationMs?: number
}

// Pre-defined workflow webhook paths (set these in n8n)
export const WORKFLOW_WEBHOOKS: Record<AutomationEventType, { path: string; label: string; description: string; icon: string }> = {
  score_calculated: {
    path: '/webhook/crediq-score',
    label: 'Score Calculated',
    description: 'Fires when AI calculates a new CredScore. Can trigger WhatsApp/email report.',
    icon: '🎯',
  },
  scam_detected: {
    path: '/webhook/crediq-scam',
    label: 'Scam Detected',
    description: 'Fires when ScamShield detects a high-risk number. Sends instant alert.',
    icon: '🚨',
  },
  loan_applied: {
    path: '/webhook/crediq-loan',
    label: 'Loan Applied',
    description: 'Fires when user applies for a loan product. Notifies NBFC partner.',
    icon: '🏦',
  },
  csv_uploaded: {
    path: '/webhook/crediq-csv',
    label: 'CSV Uploaded',
    description: 'Fires when new UPI transactions are uploaded. Triggers re-analysis.',
    icon: '📊',
  },
  suspicious_transaction: {
    path: '/webhook/crediq-suspicious',
    label: 'Suspicious Transaction',
    description: 'Fires when AI flags an unusual debit pattern.',
    icon: '⚠️',
  },
  score_improved: {
    path: '/webhook/crediq-improved',
    label: 'Score Improved',
    description: 'Fires when score increases by 10+ points. Sends motivational alert.',
    icon: '📈',
  },
}

// Local event log (stored in sessionStorage for demo)
const EVENT_LOG_KEY = 'crediq-automation-events'

export function getEventLog(): AutomationEvent[] {
  try {
    const raw = sessionStorage.getItem(EVENT_LOG_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveEvent(event: AutomationEvent) {
  try {
    const log = getEventLog()
    log.unshift(event)
    sessionStorage.setItem(EVENT_LOG_KEY, JSON.stringify(log.slice(0, 50)))
  } catch { /* ignore */ }
}

// ===== Check n8n connectivity =====
export async function checkN8nHealth(): Promise<boolean> {
  try {
    await axios.get(`${N8N_BASE}/healthz`, { timeout: 3000 })
    return true
  } catch {
    try {
      // Try the webhook base URL as fallback
      await axios.get(N8N_BASE, { timeout: 3000 })
      return true
    } catch {
      return false
    }
  }
}

// ===== Fire a webhook event to n8n =====
export async function triggerAutomation(
  type: AutomationEventType,
  payload: Record<string, unknown>,
): Promise<AutomationEvent> {
  const workflow = WORKFLOW_WEBHOOKS[type]
  const event: AutomationEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    triggeredAt: new Date(),
    payload,
    status: 'pending',
    workflowId: workflow.path,
  }

  const t0 = Date.now()

  try {
    await axios.post(
      `${N8N_BASE}${workflow.path}`,
      {
        event: type,
        timestamp: new Date().toISOString(),
        source: 'CredIQ',
        ...payload,
      },
      { timeout: 8000 },
    )
    event.status = 'success'
    event.durationMs = Date.now() - t0
  } catch (err) {
    const isNetwork = axios.isAxiosError(err) && (!err.response || err.code === 'ERR_NETWORK')
    event.status = isNetwork ? 'offline' : 'failed'
    event.durationMs = Date.now() - t0
    // Don't throw — automations are non-blocking
    console.warn(`n8n automation ${type} ${event.status}:`, err)
  }

  saveEvent(event)
  return event
}

// ===== Convenience wrappers =====

export function triggerScoreCalculated(score: number, tier: string, phone: string) {
  return triggerAutomation('score_calculated', { score, tier, phone, platform: 'CredIQ' })
}

export function triggerScamDetected(
  input: string,
  riskLevel: string,
  riskScore: number,
  scamType: string,
) {
  return triggerAutomation('scam_detected', { input, riskLevel, riskScore, scamType })
}

export function triggerLoanApplied(
  loanType: string,
  provider: string,
  amount: number,
  score: number,
) {
  return triggerAutomation('loan_applied', { loanType, provider, amount, score })
}

export function triggerCSVUploaded(txCount: number, monthsCovered: number) {
  return triggerAutomation('csv_uploaded', { txCount, monthsCovered })
}

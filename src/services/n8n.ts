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
    description: 'Runs every time your credit score is updated — sends you a summary via WhatsApp or email.',
    icon: '🎯',
  },
  scam_detected: {
    path: '/webhook/crediq-scam',
    label: 'Scam Detected',
    description: 'Runs when a phone number or UPI ID is flagged as a scam — sends you an immediate warning.',
    icon: '🚨',
  },
  loan_applied: {
    path: '/webhook/crediq-loan',
    label: 'Loan Applied',
    description: 'Runs when you apply for a loan — notifies the lender and sends you a confirmation.',
    icon: '🏦',
  },
  csv_uploaded: {
    path: '/webhook/crediq-csv',
    label: 'CSV Uploaded',
    description: 'Runs when you upload a new CSV file — automatically re-checks your transactions.',
    icon: '📊',
  },
  suspicious_transaction: {
    path: '/webhook/crediq-suspicious',
    label: 'Suspicious Transaction',
    description: 'Runs when the AI spots an unusual payment — alerts you so you can review it.',
    icon: '⚠️',
  },
  score_improved: {
    path: '/webhook/crediq-improved',
    label: 'Score Improved',
    description: 'Runs when your score goes up by 10 or more points — sends you a congratulations message.',
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
    // Use Vite proxy (/n8n) to avoid CORS in browser
    const base = typeof window !== 'undefined' ? '/n8n' : N8N_BASE
    await axios.get(`${base}/healthz`, { timeout: 4000 })
    return true
  } catch {
    try {
      const base = typeof window !== 'undefined' ? '/n8n' : N8N_BASE
      await axios.get(`${base}/`, { timeout: 4000 })
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

export function triggerSuspiciousTransaction(amount: number, description: string, merchant: string) {
  return triggerAutomation('suspicious_transaction', { amount, description, merchant })
}

export function triggerScoreImproved(oldScore: number, newScore: number, tier: string) {
  return triggerAutomation('score_improved', { oldScore, newScore, improvement: newScore - oldScore, tier })
}

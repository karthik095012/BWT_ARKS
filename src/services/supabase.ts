import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScamRecord {
  id: string
  phone?: string | null
  upi_id?: string | null
  vpa?: string | null
  scam_type: string
  description: string
  reports_count: number
  confidence_score: number
  first_reported: string
  last_reported: string
  is_verified: boolean
  reported_by: string
}

// ─── Seed / fallback local DB (when Supabase is not configured) ──────────────

export const LOCAL_SCAM_DB: ScamRecord[] = [
  {
    id: 's1',
    phone: '+919876543210',
    upi_id: null,
    vpa: null,
    scam_type: 'fake_bank_call',
    description: 'Calls pretending to be HDFC Bank KYC team, asks for OTP and UPI PIN.',
    reports_count: 847,
    confidence_score: 98,
    first_reported: '2025-01-15',
    last_reported: '2026-03-01',
    is_verified: true,
    reported_by: 'community',
  },
  {
    id: 's2',
    phone: '+918899001122',
    upi_id: null,
    vpa: null,
    scam_type: 'investment_fraud',
    description: 'WhatsApp group scam promising 100x returns in "BTC mining". Asks for ₹5000 to join.',
    reports_count: 234,
    confidence_score: 95,
    first_reported: '2025-06-01',
    last_reported: '2026-02-28',
    is_verified: true,
    reported_by: 'community',
  },
  {
    id: 's3',
    phone: '+917788990011',
    upi_id: null,
    vpa: null,
    scam_type: 'lottery_scam',
    description: 'Claims user won ₹25 lakh in a lucky draw. Demands ₹2000 "processing fee".',
    reports_count: 1203,
    confidence_score: 99,
    first_reported: '2024-11-01',
    last_reported: '2026-03-02',
    is_verified: true,
    reported_by: 'community',
  },
  {
    id: 's4',
    phone: null,
    upi_id: 'kyc.hdfc@ybl',
    vpa: 'kyc.hdfc@ybl',
    scam_type: 'upi_phishing',
    description: 'Fake HDFC Bank UPI ID used for KYC verification scam. Requests ₹1 to "activate".',
    reports_count: 312,
    confidence_score: 97,
    first_reported: '2025-03-10',
    last_reported: '2026-02-25',
    is_verified: true,
    reported_by: 'bank_reported',
  },
  {
    id: 's5',
    phone: null,
    upi_id: 'prize.winner@paytm',
    vpa: 'prize.winner@paytm',
    scam_type: 'lottery_scam',
    description: 'Sends fake prize money requests asking recipient to pay ₹500 to "release" ₹5 lakh prize.',
    reports_count: 89,
    confidence_score: 92,
    first_reported: '2025-07-20',
    last_reported: '2026-01-14',
    is_verified: false,
    reported_by: 'community',
  },
  {
    id: 's6',
    phone: '+919988776655',
    upi_id: null,
    vpa: null,
    scam_type: 'kyc_fraud',
    description: 'SBI account freeze threat, asks to share screen for "KYC verification via TeamViewer".',
    reports_count: 556,
    confidence_score: 96,
    first_reported: '2025-02-01',
    last_reported: '2026-03-03',
    is_verified: true,
    reported_by: 'sbi_reported',
  },
]

// ─── Layer 1: DB Lookup ──────────────────────────────────────────────────────

/**
 * Normalize input: strip spaces, dashes, +91 prefix for comparison
 */
function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, '').replace(/^\+?91/, '')
}

function normalizeUPI(raw: string): string {
  return raw.trim().toLowerCase()
}

export async function lookupInScamDB(input: string): Promise<ScamRecord | null> {
  const normalizedInput = input.trim()
  const plainPhone = normalizePhone(normalizedInput)
  const plainUPI = normalizeUPI(normalizedInput)

  // ── Try Supabase first ───────────────────────────────────────────────────
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('scam_reports')
        .select('*')
        .or(
          `phone.ilike.%${plainPhone}%,upi_id.ilike.%${plainUPI}%,vpa.ilike.%${plainUPI}%`,
        )
        .order('reports_count', { ascending: false })
        .limit(1)
        .single()

      if (!error && data) return data as ScamRecord
    } catch {
      // Fall through to local DB
      console.warn('Supabase lookup failed, using local DB')
    }
  }

  // ── Local fallback ───────────────────────────────────────────────────────
  return LOCAL_SCAM_DB.find((r) => {
    if (r.phone && normalizePhone(r.phone).includes(plainPhone)) return true
    if (r.upi_id && normalizeUPI(r.upi_id) === plainUPI) return true
    if (r.vpa && normalizeUPI(r.vpa) === plainUPI) return true
    return false
  }) ?? null
}

// ─── Report a new scam ───────────────────────────────────────────────────────

export interface ReportPayload {
  phone?: string
  upi_id?: string
  scam_type: string
  description: string
  reported_by?: string
}

export async function reportScamToSupabase(payload: ReportPayload): Promise<boolean> {
  if (!supabase) {
    console.warn('Supabase not configured — report saved locally only')
    return false
  }
  try {
    const { error } = await supabase.from('scam_reports').insert([
      {
        ...payload,
        reports_count: 1,
        confidence_score: 70,
        is_verified: false,
        reported_by: payload.reported_by || 'user',
        first_reported: new Date().toISOString(),
        last_reported: new Date().toISOString(),
      },
    ])
    return !error
  } catch {
    return false
  }
}

// ─── Increment report count ───────────────────────────────────────────────────

export async function incrementReportCount(id: string): Promise<void> {
  if (!supabase) return
  await supabase.rpc('increment_report_count', { record_id: id }).throwOnError?.()
}

// ─── Auth ─────────────────────────────────────────────────────────────────

/** Demo mode: true when Supabase is not configured */
export const isSupabaseDemoMode = !isSupabaseConfigured

// ── Phone OTP (kept for backward compat) ──────────────────────────────
export async function sendPhoneOTP(phoneE164: string): Promise<void> {
  if (!supabase || isSupabaseDemoMode) return
  const { error } = await supabase.auth.signInWithOtp({ phone: phoneE164 })
  if (error) throw error
}

export async function verifyPhoneOTP(phoneE164: string, otp: string): Promise<string> {
  if (!supabase || isSupabaseDemoMode) {
    if (otp !== '123456') throw new Error('Invalid OTP. Use 123456 for demo.')
    return `demo_${Date.now()}`
  }
  const { data, error } = await supabase.auth.verifyOtp({
    phone: phoneE164, token: otp, type: 'sms',
  })
  if (error) throw error
  return data.user?.id ?? `uid_${Date.now()}`
}

// ── Email + Password Auth (primary) ───────────────────────────────

/** Sign up with email + password. Returns the user's UID. */
export async function signUpWithEmail(email: string, password: string): Promise<string> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  if (!data.user) throw new Error('Sign up failed — no user returned')
  return data.user.id
}

/** Sign in with email + password. Returns the user's UID. */
export async function signInWithEmail(email: string, password: string): Promise<string> {
  if (!supabase) {
    // demo fallback
    if (email === 'demo@crediq.in' && password === 'demo123') return `demo_${Date.now()}`
    throw new Error('Invalid credentials. Use demo@crediq.in / demo123')
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.user.id
}

/** Sign out the current session. */
export async function signOut(): Promise<void> {
  await supabase?.auth.signOut()
}

// ─── User DB helpers ──────────────────────────────────────────────────────

export async function saveUser(uid: string, data: Record<string, unknown>): Promise<void> {
  if (!supabase) return
  try {
    await supabase
      .from('users')
      .upsert({ id: uid, ...data, updated_at: new Date().toISOString() })
  } catch (err) {
    console.warn('saveUser error:', err)
  }
}

export async function getUser(uid: string): Promise<Record<string, unknown> | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase.from('users').select('*').eq('id', uid).single()
    return data
  } catch {
    return null
  }
}

// ─── CredScore DB helpers ─────────────────────────────────────────────────

export async function saveCredScore(uid: string, scoreData: Record<string, unknown>): Promise<void> {
  if (!supabase) return
  try {
    await supabase.from('cred_scores').insert([{
      user_id: uid,
      ...scoreData,
      calculated_at: new Date().toISOString(),
    }])
  } catch (err) {
    console.warn('saveCredScore error:', err)
  }
}

export async function getLatestCredScore(uid: string): Promise<Record<string, unknown> | null> {
  if (!supabase) return null
  try {
    const { data } = await supabase
      .from('cred_scores')
      .select('*')
      .eq('user_id', uid)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single()
    return data
  } catch {
    return null
  }
}

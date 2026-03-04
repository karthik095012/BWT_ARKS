// ⚠️  Firebase has been replaced with Supabase.
// This file re-exports the Supabase equivalents so any stray imports still compile.
export {
  isSupabaseDemoMode as isFirebaseDemoMode,
  sendPhoneOTP,
  verifyPhoneOTP,
  saveUser,
  getUser,
  saveCredScore,
  getLatestCredScore,
  lookupInScamDB as lookupScammer,
  reportScamToSupabase as reportScammer,
  supabase as db,
} from '@/services/supabase'

// Dummy exports kept so no import breaks
export const auth = null
export const storage = null
export function getRecaptchaVerifier() { return null }

// ─── DEAD CODE BELOW — kept only so TypeScript doesn't break during transition ─
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unused = null
export default _unused

// Original Firebase code removed. See src/services/supabase.ts
if (false) {
const _x = null // placeholder so file isn't empty
void _x
}

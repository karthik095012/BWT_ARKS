import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { TrendingUp, Phone, Shield, Zap, ArrowRight, Bot, Lock } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import {
  sendPhoneOTP,
  verifyPhoneOTP,
  isSupabaseDemoMode,
  saveUser,
} from '@/services/supabase'
import toast from 'react-hot-toast'
import type { User } from '@/types'

const phoneSchema = z.object({
  phone: z
    .string()
    .min(10, 'Enter a valid 10-digit mobile number')
    .max(13)
    .regex(/^(\+91)?[6-9]\d{9}$/, 'Enter a valid Indian mobile number'),
})
const otpSchema = z.object({
  otp: z.string().length(6, 'OTP must be 6 digits'),
})

type PhoneForm = z.infer<typeof phoneSchema>
type OTPForm = z.infer<typeof otpSchema>

export default function LoginPage() {
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { setUser } = useAppStore()
  const navigate = useNavigate()

  const phoneForm = useForm<PhoneForm>({ resolver: zodResolver(phoneSchema) })
  const otpForm = useForm<OTPForm>({ resolver: zodResolver(otpSchema) })

  // Normalise to E.164 (+91XXXXXXXXXX)
  const toE164 = (raw: string) =>
    raw.startsWith('+91') ? raw : `+91${raw.replace(/\D/g, '').slice(-10)}`

  const handleSendOTP = async (data: PhoneForm) => {
    setIsLoading(true)
    const e164 = toE164(data.phone)
    setPhone(e164)

    if (isSupabaseDemoMode) {
      // ── Demo mode: no real SMS ──────────────────────────────
      await new Promise((r) => setTimeout(r, 1000))
      toast.success(`OTP sent to ${e164}  (Demo — use 123456)`)
    } else {
      // Real Supabase Phone Auth
      try {
        await sendPhoneOTP(e164)
        toast.success(`OTP sent to ${e164}`)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to send OTP'
        toast.error(msg)
        setIsLoading(false)
        return
      }
    }

    setStep('otp')
    setIsLoading(false)
  }

  const handleVerifyOTP = async (data: OTPForm) => {
    setIsLoading(true)
    let uid: string

    try {
      uid = await verifyPhoneOTP(phone, data.otp)
    } catch {
      otpForm.setError('otp', {
        message: isSupabaseDemoMode ? 'Invalid OTP. Use 123456 for demo.' : 'Invalid OTP. Please try again.',
      })
      setIsLoading(false)
      return
    }

    const user: User = {
      uid,
      phone,
      name: 'Karthik R Nair',
      createdAt: new Date(),
      lastLogin: new Date(),
    }
    await saveUser(uid, { phone, last_login: new Date().toISOString() })
    setUser(user)
    toast.success('Welcome to CredIQ!')
    navigate('/dashboard')
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen bg-neutral-light flex flex-col md:flex-row">
      {/* Left hero */}
      <div className="hidden md:flex md:w-1/2 bg-hero-gradient text-white flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-xl">CredIQ</div>
            <div className="text-blue-200 text-xs">AI Financial Identity Platform</div>
          </div>
        </div>

        <div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            Your Money Tells<br />
            Your Story.<br />
            <span className="text-blue-200">We Make Banks Listen.</span>
          </h1>
          <p className="text-blue-100 text-lg mb-10">
            India's first privacy-preserving AI credit platform for 400M gig workers.
          </p>

          <div className="space-y-4">
            {[
              { icon: Bot, text: 'Powered by Qwen2.5-Coder:14B running locally' },
              { icon: Shield, text: 'Zero data sent to cloud — complete privacy' },
              { icon: Zap, text: 'Credit score in &lt;30 seconds from UPI history' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-blue-100">
                <Icon className="w-5 h-5 text-blue-300 shrink-0" />
                <span dangerouslySetInnerHTML={{ __html: text }} />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-blue-200 text-sm">
          <Lock className="w-4 h-4" />
          <span>Team ARKS · BWT Hackathon 2026 · Future Finance Innovation</span>
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 md:hidden">
            <div className="w-9 h-9 rounded-xl bg-score-gradient flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-bold text-lg">CredIQ</div>
              <div className="text-xs text-neutral-gray">AI Finance Platform</div>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-dark mb-1">
              {step === 'phone' ? 'Get Started' : 'Verify OTP'}
            </h2>
            <p className="text-neutral-gray text-sm">
              {step === 'phone'
                ? 'Enter your mobile number to continue'
                : `We sent a 6-digit OTP to ${phone}`}
            </p>
          </div>

          {step === 'phone' ? (
            <form onSubmit={phoneForm.handleSubmit(handleSendOTP)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1.5">
                  Mobile Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-gray" />
                  <input
                    {...phoneForm.register('phone')}
                    type="tel"
                    placeholder="+91 98765 43210"
                    className={`input pl-10 ${phoneForm.formState.errors.phone ? 'input-error' : ''}`}
                    autoFocus
                  />
                </div>
                {phoneForm.formState.errors.phone && (
                  <p className="text-xs text-danger mt-1">
                    {phoneForm.formState.errors.phone.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sending OTP…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Send OTP <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={otpForm.handleSubmit(handleVerifyOTP)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1.5">
                  6-Digit OTP
                </label>
                <input
                  {...otpForm.register('otp')}
                  type="number"
                  maxLength={6}
                  placeholder="123456"
                  className={`input text-center font-mono text-xl tracking-[0.5em] ${
                    otpForm.formState.errors.otp ? 'input-error' : ''
                  }`}
                  autoFocus
                />
                {otpForm.formState.errors.otp && (
                  <p className="text-xs text-danger mt-1">{otpForm.formState.errors.otp.message}</p>
                )}
                {isSupabaseDemoMode && (
                  <p className="text-xs text-neutral-gray mt-1 text-center">
                    Demo mode — use <strong>123456</strong>
                  </p>
                )}
              </div>

              <button type="submit" disabled={isLoading} className="btn-primary w-full">
                {isLoading ? 'Verifying…' : 'Verify & Login'}
              </button>

              <button
                type="button"
                onClick={() => { setStep('phone'); otpForm.reset() }}
                className="btn-ghost w-full text-sm"
              >
                ← Change number
              </button>
            </form>
          )}

          <div className="mt-6 p-3 rounded-lg bg-primary-light border border-primary/20">
            <p className="text-xs text-primary-dark text-center">
              🔒 Your financial data never leaves your device. Processed by local AI only.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { TrendingUp, Mail, Lock, Shield, Zap, ArrowRight, Bot, Eye, EyeOff } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { signInWithEmail, signUpWithEmail, saveUser, isSupabaseConfigured } from '@/services/supabase'
import toast from 'react-hot-toast'
import type { User } from '@/types'

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

const signupSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Confirm your password'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type LoginForm = z.infer<typeof loginSchema>
type SignupForm = z.infer<typeof signupSchema>

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [isLoading, setIsLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const { setUser } = useAppStore()
  const navigate = useNavigate()

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })
  const signupForm = useForm<SignupForm>({ resolver: zodResolver(signupSchema) })

  const handleSignIn = async (data: LoginForm) => {
    setIsLoading(true)
    try {
      const uid = await signInWithEmail(data.email, data.password)
      const user: User = {
        uid,
        email: data.email,
        name: data.email.split('@')[0],
        createdAt: new Date(),
        lastLogin: new Date(),
      }
      await saveUser(uid, { email: data.email, last_login: new Date().toISOString() })
      setUser(user)
      toast.success('Welcome back to CredIQ!')
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign in failed'
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignUp = async (data: SignupForm) => {
    setIsLoading(true)
    try {
      const uid = await signUpWithEmail(data.email, data.password)
      const user: User = {
        uid,
        email: data.email,
        name: data.email.split('@')[0],
        createdAt: new Date(),
        lastLogin: new Date(),
      }
      await saveUser(uid, { email: data.email, last_login: new Date().toISOString() })
      setUser(user)
      toast.success('Account created! Welcome to CredIQ.')
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign up failed'
      // Supabase returns "User already registered" for duplicate emails
      if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists')) {
        toast.error('Email already registered. Please sign in instead.')
        setMode('signin')
        loginForm.setValue('email', data.email)
      } else {
        toast.error(msg)
      }
    } finally {
      setIsLoading(false)
    }
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
              { icon: Bot,    text: 'Powered by Qwen2.5-Coder:14B running locally' },
              { icon: Shield, text: 'Zero data sent to cloud &mdash; complete privacy' },
              { icon: Zap,    text: 'Credit score in &lt;30 seconds from UPI history' },
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

          {/* Mode toggle */}
          <div className="flex rounded-xl border border-neutral-200 bg-neutral-100 p-1 mb-8">
            <button
              type="button"
              onClick={() => setMode('signin')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === 'signin'
                  ? 'bg-white text-neutral-dark shadow-sm'
                  : 'text-neutral-gray hover:text-neutral-dark'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === 'signup'
                  ? 'bg-white text-neutral-dark shadow-sm'
                  : 'text-neutral-gray hover:text-neutral-dark'
              }`}
            >
              Sign Up
            </button>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-neutral-dark mb-1">
              {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-neutral-gray text-sm">
              {mode === 'signin'
                ? 'Sign in to your CredIQ account'
                : 'Join CredIQ to unlock your financial identity'}
            </p>
          </div>

          {!isSupabaseConfigured && (
            <div className="mb-4 p-3 rounded-lg bg-warning/10 border border-warning/30 text-xs text-warning font-medium">
              ⚠️ Demo mode — use <strong>demo@crediq.in</strong> / <strong>demo123</strong>
            </div>
          )}

          {mode === 'signin' ? (
            <form onSubmit={loginForm.handleSubmit(handleSignIn)} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-gray" />
                  <input
                    {...loginForm.register('email')}
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoFocus
                    className={`input pl-10 ${loginForm.formState.errors.email ? 'input-error' : ''}`}
                  />
                </div>
                {loginForm.formState.errors.email && (
                  <p className="text-xs text-danger mt-1">{loginForm.formState.errors.email.message}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-gray" />
                  <input
                    {...loginForm.register('password')}
                    type={showPw ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className={`input pl-10 pr-10 ${loginForm.formState.errors.password ? 'input-error' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-gray hover:text-neutral-dark"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {loginForm.formState.errors.password && (
                  <p className="text-xs text-danger mt-1">{loginForm.formState.errors.password.message}</p>
                )}
              </div>

              <button type="submit" disabled={isLoading} className="btn-primary w-full mt-2">
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Sign In <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </button>

              <p className="text-center text-xs text-neutral-gray pt-1">
                Don't have an account?{' '}
                <button type="button" onClick={() => setMode('signup')} className="text-primary font-medium hover:underline">
                  Sign Up
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={signupForm.handleSubmit(handleSignUp)} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-gray" />
                  <input
                    {...signupForm.register('email')}
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoFocus
                    className={`input pl-10 ${signupForm.formState.errors.email ? 'input-error' : ''}`}
                  />
                </div>
                {signupForm.formState.errors.email && (
                  <p className="text-xs text-danger mt-1">{signupForm.formState.errors.email.message}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-gray" />
                  <input
                    {...signupForm.register('password')}
                    type={showPw ? 'text' : 'password'}
                    placeholder="Min. 6 characters"
                    autoComplete="new-password"
                    className={`input pl-10 pr-10 ${signupForm.formState.errors.password ? 'input-error' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-gray hover:text-neutral-dark"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {signupForm.formState.errors.password && (
                  <p className="text-xs text-danger mt-1">{signupForm.formState.errors.password.message}</p>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-neutral-dark mb-1.5">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-gray" />
                  <input
                    {...signupForm.register('confirmPassword')}
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                    className={`input pl-10 pr-10 ${signupForm.formState.errors.confirmPassword ? 'input-error' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-gray hover:text-neutral-dark"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {signupForm.formState.errors.confirmPassword && (
                  <p className="text-xs text-danger mt-1">{signupForm.formState.errors.confirmPassword.message}</p>
                )}
              </div>

              <button type="submit" disabled={isLoading} className="btn-primary w-full mt-2">
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating account…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Create Account <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </button>

              <p className="text-center text-xs text-neutral-gray pt-1">
                Already have an account?{' '}
                <button type="button" onClick={() => setMode('signin')} className="text-primary font-medium hover:underline">
                  Sign In
                </button>
              </p>
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

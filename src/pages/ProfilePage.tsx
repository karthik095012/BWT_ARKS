import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, User, AtSign, Mail, Check, X, Loader2, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAppStore } from '@/store/useAppStore'
import {
  saveUser,
  checkUsernameAvailable,
  sendEmailChangeOTP,
  verifyEmailChangeOTP,
} from '@/services/supabase'
import { cn, cleanDisplayName } from '@/utils/helpers'

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken'
type EmailStep = 'idle' | 'enterEmail' | 'enterOTP'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, setUser } = useAppStore()

  // ── Name ──────────────────────────────────────────────────────────────────
  const [name, setName] = useState(user?.name || '')
  const [savingName, setSavingName] = useState(false)

  const handleSaveName = async () => {
    const trimmed = cleanDisplayName(name.trim())
    if (!trimmed) return toast.error('Name cannot be empty')
    if (!user) return
    setSavingName(true)
    try {
      await saveUser(user.uid, { name: trimmed })
      setUser({ ...user, name: trimmed })
      setName(trimmed)
      toast.success('Name updated!')
    } catch {
      toast.error('Failed to update name')
    } finally {
      setSavingName(false)
    }
  }

  // ── Username ───────────────────────────────────────────────────────────────
  const [username, setUsername] = useState(user?.username || '')
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle')
  const [savingUsername, setSavingUsername] = useState(false)
  const unTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const val = username.trim().toLowerCase()
    if (val.length < 3) { setUsernameStatus('idle'); return }
    if (val === user?.username?.toLowerCase()) { setUsernameStatus('idle'); return }
    setUsernameStatus('checking')
    if (unTimer.current) clearTimeout(unTimer.current)
    unTimer.current = setTimeout(async () => {
      const available = await checkUsernameAvailable(val)
      setUsernameStatus(available ? 'available' : 'taken')
    }, 600)
    return () => { if (unTimer.current) clearTimeout(unTimer.current) }
  }, [username, user?.username])

  const handleSaveUsername = async () => {
    const val = username.trim().toLowerCase()
    if (!val || val.length < 3) return toast.error('Username must be at least 3 characters')
    if (!user) return
    if (usernameStatus === 'taken') return toast.error('That username is already taken')
    if (val === user.username?.toLowerCase()) return toast.error('That is already your username')
    setSavingUsername(true)
    try {
      await saveUser(user.uid, { username: val })
      setUser({ ...user, username: val })
      setUsernameStatus('idle')
      toast.success('Username updated!')
    } catch {
      toast.error('Failed to update username')
    } finally {
      setSavingUsername(false)
    }
  }

  // ── Email ──────────────────────────────────────────────────────────────────
  const [emailStep, setEmailStep] = useState<EmailStep>('idle')
  const [newEmail, setNewEmail]   = useState('')
  const [otp, setOtp]             = useState('')
  const [sendingOTP, setSendingOTP] = useState(false)
  const [verifyingOTP, setVerifyingOTP] = useState(false)

  const handleSendOTP = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error('Enter a valid email address')
    if (email === user?.email?.toLowerCase()) return toast.error('That is already your email address')
    setSendingOTP(true)
    try {
      await sendEmailChangeOTP(email)
      setEmailStep('enterOTP')
      toast.success(`OTP sent to ${email}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send OTP')
    } finally {
      setSendingOTP(false)
    }
  }

  const handleVerifyOTP = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!otp || otp.length < 6) return toast.error('Enter the 6-digit OTP')
    if (!user) return
    setVerifyingOTP(true)
    try {
      await verifyEmailChangeOTP(email, otp.trim())
      await saveUser(user.uid, { email })
      setUser({ ...user, email })
      setEmailStep('idle')
      setNewEmail('')
      setOtp('')
      toast.success('Email updated successfully!')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'OTP verification failed')
    } finally {
      setVerifyingOTP(false)
    }
  }

  const cancelEmailChange = () => {
    setEmailStep('idle')
    setNewEmail('')
    setOtp('')
  }

  // ── Username badge ─────────────────────────────────────────────────────────
  const unBadge = () => {
    if (usernameStatus === 'checking') return <Loader2 className="w-4 h-4 animate-spin text-neutral-gray" />
    if (usernameStatus === 'available') return <Check className="w-4 h-4 text-green-500" />
    if (usernameStatus === 'taken') return <X className="w-4 h-4 text-red-500" />
    return null
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-neutral-light text-neutral-gray hover:text-neutral-dark transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-neutral-dark">Edit Profile</h1>
          <p className="text-sm text-neutral-gray">Update your personal information</p>
        </div>
      </div>

      {/* ── Name Card ── */}
      <div className="bg-white rounded-xl border border-neutral-border p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <User className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-neutral-dark text-sm">Display Name</h2>
        </div>
        <div className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
            className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-border text-sm 
                       focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary 
                       text-neutral-dark placeholder-neutral-gray/60 transition-all"
          />
          <button
            onClick={handleSaveName}
            disabled={savingName || !name.trim()}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              'bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {savingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save Name
          </button>
        </div>
      </div>

      {/* ── Username Card ── */}
      <div className="bg-white rounded-xl border border-neutral-border p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <AtSign className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-neutral-dark text-sm">Username</h2>
        </div>
        <p className="text-xs text-neutral-gray -mt-2">
          Username must be unique. You can only save if it is available.
        </p>
        <div className="space-y-3">
          <div className="relative">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/\s/g, '').toLowerCase())}
              placeholder="pick a username"
              className={cn(
                'w-full px-3.5 py-2.5 rounded-lg border text-sm pr-9',
                'focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all',
                'text-neutral-dark placeholder-neutral-gray/60',
                usernameStatus === 'taken'
                  ? 'border-red-400 focus:border-red-400'
                  : usernameStatus === 'available'
                  ? 'border-green-400 focus:border-green-400'
                  : 'border-neutral-border focus:border-primary',
              )}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">{unBadge()}</div>
          </div>
          {usernameStatus === 'taken' && (
            <p className="text-xs text-red-500">That username is already taken</p>
          )}
          {usernameStatus === 'available' && (
            <p className="text-xs text-green-600">Username is available!</p>
          )}
          <button
            onClick={handleSaveUsername}
            disabled={savingUsername || usernameStatus !== 'available'}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              'bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {savingUsername ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save Username
          </button>
        </div>
      </div>

      {/* ── Email Card ── */}
      <div className="bg-white rounded-xl border border-neutral-border p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-neutral-dark text-sm">Email Address</h2>
        </div>

        {/* Current email */}
        <div className="px-3.5 py-2.5 rounded-lg bg-neutral-light border border-neutral-border text-sm text-neutral-gray">
          {user?.email || <span className="italic text-neutral-gray/60">No email set</span>}
        </div>

        {emailStep === 'idle' && (
          <button
            onClick={() => setEmailStep('enterEmail')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium 
                       border border-primary text-primary hover:bg-primary/5 transition-all"
          >
            <Mail className="w-3.5 h-3.5" />
            Change Email
          </button>
        )}

        {emailStep === 'enterEmail' && (
          <div className="space-y-3 pt-1">
            <p className="text-xs text-neutral-gray">
              Enter your new email address. An OTP will be sent to verify it.
            </p>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="new@email.com"
              className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-border text-sm 
                         focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary 
                         text-neutral-dark placeholder-neutral-gray/60 transition-all"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSendOTP}
                disabled={sendingOTP || !newEmail.trim()}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  'bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {sendingOTP ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Send OTP
              </button>
              <button
                onClick={cancelEmailChange}
                className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-gray 
                           hover:bg-neutral-light border border-neutral-border transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {emailStep === 'enterOTP' && (
          <div className="space-y-3 pt-1">
            <p className="text-xs text-neutral-gray">
              A 6-digit OTP was sent to <span className="font-medium text-neutral-dark">{newEmail}</span>.
              Enter it below to confirm your new email.
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-border text-sm 
                         focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary 
                         text-neutral-dark placeholder-neutral-gray/60 tracking-[0.3em] text-center
                         transition-all"
            />
            <div className="flex gap-2">
              <button
                onClick={handleVerifyOTP}
                disabled={verifyingOTP || otp.length < 6}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  'bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {verifyingOTP ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Verify & Save
              </button>
              <button
                onClick={cancelEmailChange}
                className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-gray 
                           hover:bg-neutral-light border border-neutral-border transition-all"
              >
                Cancel
              </button>
            </div>
            <button
              onClick={() => setEmailStep('enterEmail')}
              className="text-xs text-primary hover:underline"
            >
              Change email address
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

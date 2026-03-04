import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Star,
  ShieldAlert,
  List,
  Banknote,
  LogOut,
  Bot,
  X,
  TrendingUp,
  Workflow,
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { cn, cleanDisplayName, extractDisplayName } from '@/utils/helpers'

function getDisplayName(name?: string, email?: string): string {
  if (name && !name.includes('@')) return cleanDisplayName(name)
  if (name && name.includes('@')) return extractDisplayName(name)
  if (email) return extractDisplayName(email)
  return 'User'
}

function cleanInitials(name?: string, email?: string): string {
  const display = getDisplayName(name, email)
  const parts = display.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return display[0]?.toUpperCase() || 'U'
}

const NAV_ITEMS = [
  { path: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/credscore',    icon: Star,            label: 'CredScore' },
  { path: '/transactions', icon: List,            label: 'Transactions' },
  { path: '/scamshield',   icon: ShieldAlert,     label: 'ScamShield' },
  { path: '/loans',        icon: Banknote,        label: 'Loans' },
  { path: '/automations',  icon: Workflow,        label: 'Automations' },
]

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen, user, logout, ollamaConnected, ollamaModel, credScore } =
    useAppStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full w-64 bg-white border-r border-neutral-border z-30',
          'flex flex-col transition-transform duration-300 shadow-lg',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-score-gradient flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-neutral-dark text-xl tracking-tight">CredIQ</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-neutral-gray hover:text-neutral-dark p-1 rounded-md hover:bg-neutral-light transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Score pill */}
        {credScore && (
          <div className="mx-4 mt-4 px-4 py-3 rounded-xl bg-primary/5 border border-primary/15">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-neutral-gray mb-0.5">Your CredScore</p>
                <p className="text-xl font-bold text-primary">{credScore.score} <span className="text-xs font-normal text-neutral-gray">/850</span></p>
              </div>
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary">{credScore.tier}</span>
            </div>
            <div className="w-full h-1 rounded-full bg-primary/15 mt-2">
              <div
                className="h-full rounded-full bg-primary transition-all duration-1000"
                style={{ width: `${((credScore.score - 300) / 550) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              onClick={() => { if (window.innerWidth < 768) setSidebarOpen(false) }}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-neutral-gray hover:text-neutral-dark hover:bg-neutral-light',
                )
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Ollama status */}
        <div className="mx-3 mb-2 px-3 py-2.5 rounded-lg border border-neutral-border flex items-center gap-2.5">
          <div className={cn('w-2 h-2 rounded-full shrink-0', ollamaConnected ? 'bg-green-500 animate-pulse' : 'bg-neutral-300')} />
          <Bot className="w-3.5 h-3.5 text-neutral-gray shrink-0" />
          <span className="text-xs text-neutral-gray truncate flex-1">{ollamaModel || 'qwen2.5-coder:7b'}</span>
          <span className={cn('text-xs font-medium', ollamaConnected ? 'text-green-600' : 'text-neutral-gray')}>
            {ollamaConnected ? 'Live' : 'Off'}
          </span>
        </div>

        {/* User + logout */}
        <div className="border-t border-neutral-border px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { navigate('/profile'); if (window.innerWidth < 768) setSidebarOpen(false) }}
              title="Edit Profile"
              className="w-9 h-9 rounded-full bg-score-gradient flex items-center justify-center text-white font-bold text-sm shrink-0 hover:ring-2 hover:ring-primary/40 transition-all cursor-pointer"
            >
              {cleanInitials(user?.name, user?.email)}
            </button>
            <button
              onClick={() => { navigate('/profile'); if (window.innerWidth < 768) setSidebarOpen(false) }}
              className="flex-1 min-w-0 text-left hover:opacity-75 transition-opacity"
            >
              <p className="text-sm font-semibold text-neutral-dark truncate leading-tight">
                {getDisplayName(user?.name, user?.email)}
              </p>
              <p className="text-xs text-neutral-gray truncate">{user?.email || user?.phone || ''}</p>
            </button>
            <button
              onClick={handleLogout}
              title="Logout"
              className="p-1.5 rounded-lg text-neutral-gray hover:text-danger hover:bg-danger-light transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

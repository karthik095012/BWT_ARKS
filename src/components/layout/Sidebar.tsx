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
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/credscore', icon: Star, label: 'CredScore' },
  { path: '/scamshield', icon: ShieldAlert, label: 'ScamShield' },
  { path: '/transactions', icon: List, label: 'Transactions' },
  { path: '/loans', icon: Banknote, label: 'Loans' },
  { path: '/automations', icon: Workflow, label: 'Automations' },
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
        <div className="flex items-center justify-between px-4 py-4 border-b border-neutral-border bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-score-gradient flex items-center justify-center shadow-sm">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-bold text-neutral-dark text-lg leading-none tracking-tight">CredIQ</div>
              <div className="text-xs text-primary font-medium">AI Finance Platform</div>
            </div>
          </div>
          {/* Mobile close */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-neutral-gray hover:text-neutral-dark p-1 rounded"
          >
            <X className="w-4 h-4" />
          </button>
          {/* Desktop collapse */}
          <button
            onClick={() => setSidebarOpen(false)}
            title="Collapse sidebar"
            className="hidden md:flex items-center justify-center w-7 h-7 rounded-md text-neutral-gray hover:text-neutral-dark hover:bg-neutral-light transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Score pill */}
        {credScore && (
          <div className="mx-3 mt-3 px-3 py-2.5 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-primary-dark font-semibold">CredScore</span>
              <div className="flex items-center gap-1">
                <span className="font-mono font-bold text-primary text-base">{credScore.score}</span>
                <span className="text-xs text-neutral-gray">/850</span>
              </div>
            </div>
            <div className="w-full h-1.5 rounded-full bg-primary/20">
              <div
                className="h-full rounded-full bg-primary transition-all duration-1000"
                style={{ width: `${((credScore.score - 300) / 550) * 100}%` }}
              />
            </div>
            <div className="text-right mt-1">
              <span className="text-xs text-primary font-medium">{credScore.tier}</span>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              onClick={() => { if (window.innerWidth < 768) setSidebarOpen(false) }}
              className={({ isActive }) =>
                cn(
                  'nav-item',
                  isActive && 'active',
                )
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="text-sm">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Ollama status */}
        <div className="mx-3 mb-2 px-3 py-2 rounded-xl bg-neutral-light border border-neutral-border">
          <div className="flex items-center gap-2">
            <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', ollamaConnected ? 'bg-purple-100' : 'bg-neutral-200')}>
              <Bot className={cn('w-4 h-4', ollamaConnected ? 'text-purple-600' : 'text-neutral-gray')} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-neutral-dark truncate">
                {ollamaModel || 'qwen2.5-coder:7b'}
              </div>
              <div className="flex items-center gap-1.5">
                <div
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    ollamaConnected ? 'bg-success animate-pulse' : 'bg-neutral-gray',
                  )}
                />
                <span className="text-xs text-neutral-gray">
                  {ollamaConnected ? 'AI Ready' : 'AI Offline'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* User + logout */}
        <div className="border-t border-neutral-border px-3 py-3 bg-neutral-light/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-score-gradient flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">
              {cleanInitials(user?.name, user?.email)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-neutral-dark truncate">
                {getDisplayName(user?.name, user?.email)}
              </div>
              <div className="text-xs text-neutral-gray truncate">{user?.email || user?.phone || ''}</div>
            </div>
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

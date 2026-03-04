import { Menu, Bell, Search } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { useLocation } from 'react-router-dom'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/credscore': 'CredScore Details',
  '/scamshield': 'ScamShield',
  '/transactions': 'Transactions',
  '/loans': 'Loan Marketplace',
  '/automations': 'Automations',
}

export default function Header() {
  const { sidebarOpen, setSidebarOpen } = useAppStore()
  const location = useLocation()
  const title = PAGE_TITLES[location.pathname] || 'CredIQ'

  return (
    <header className="sticky top-0 z-10 bg-white border-b border-neutral-border h-16 flex items-center px-4 md:px-6 gap-4">
      {/* Menu toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="p-2 rounded-md text-neutral-gray hover:text-neutral-dark hover:bg-neutral-light transition-colors"
        aria-label="Toggle sidebar"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Title */}
      <h1 className="font-semibold text-neutral-dark text-lg hidden sm:block">{title}</h1>

      {/* Search */}
      <div className="flex-1 max-w-sm hidden md:block relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-gray" />
        <input
          type="search"
          placeholder="Search transactions, reports…"
          className="input pl-9 h-9 text-sm"
        />
      </div>

      <div className="flex-1 md:hidden" />

      {/* Notifs */}
      <button className="relative p-2 rounded-md text-neutral-gray hover:text-neutral-dark hover:bg-neutral-light transition-colors">
        <Bell className="w-5 h-5" />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger" />
      </button>

      {/* Team tag */}
      <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
        <span>Team ARKS</span>
        <span className="text-purple-400">·</span>
        <span>BWT 2026</span>
      </div>
    </header>
  )
}

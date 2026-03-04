import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/utils/helpers'

export default function Layout() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)

  return (
    <div className="min-h-screen bg-neutral-light flex">
      {/* Sidebar */}
      <Sidebar />

      {/* Main area */}
      <div
        className={cn(
          'flex-1 flex flex-col min-h-screen transition-all duration-300',
          sidebarOpen ? 'md:ml-60' : 'md:ml-0',
        )}
      >
        <Header />
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
        <footer className="text-center text-xs text-neutral-gray py-3 border-t border-neutral-border bg-white">
          © 2026 Team ARKS · CredIQ v1.0 · BWT Hackathon · Powered by Qwen2.5-Coder:7B
        </footer>
      </div>
    </div>
  )
}

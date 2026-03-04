import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { checkOllamaHealth } from '@/services/ollama'
import Layout from '@/components/layout/Layout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import CredScorePage from '@/pages/CredScorePage'
import ScamShieldPage from '@/pages/ScamShieldPage'
import TransactionsPage from '@/pages/TransactionsPage'
import LoansPage from '@/pages/LoansPage'
import AutomationsPage from '@/pages/AutomationsPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { setOllamaStatus } = useAppStore()

  useEffect(() => {
    // Check Ollama health on app start
    checkOllamaHealth().then(({ connected, models }) => {
      const model = models.find(
        (m) => m.includes('qwen2.5-coder:7b') || m.includes('qwen2.5'),
      ) || 'qwen2.5-coder:7b'
      setOllamaStatus(connected, model)
    })
  }, [setOllamaStatus])

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
          },
          success: { iconTheme: { primary: '#10B981', secondary: '#fff' } },
          error: { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="credscore" element={<CredScorePage />} />
          <Route path="scamshield" element={<ScamShieldPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="loans" element={<LoansPage />} />
          <Route path="automations" element={<AutomationsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'

// Pages
import LoginPage from './pages/auth/LoginPage'
import SuperAdminLayout from './pages/super-admin/SuperAdminLayout'
import AdminLayout from './pages/admin/AdminLayout'
import PublicSurveyPage from './pages/survey/PublicSurveyPage'
import ThankYouPage from './pages/survey/ThankYouPage'
import NotFoundPage from './pages/NotFoundPage'

// Guards
import ProtectedRoute from './components/auth/ProtectedRoute'

function App() {
  const { initialize, initialized, loading } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [])

  if (!initialized) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 animate-pulse-slow" />
          <p className="text-dark-400 text-sm animate-pulse">Yükleniyor...</p>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/s/:slug" element={<PublicSurveyPage />} />
        <Route path="/s/:slug/tesekkurler" element={<ThankYouPage />} />

        {/* Super Admin */}
        <Route path="/super-admin/*" element={
          <ProtectedRoute requiredRole="super_admin">
            <SuperAdminLayout />
          </ProtectedRoute>
        } />

        {/* Kurum Admin */}
        <Route path="/admin/*" element={
          <ProtectedRoute requiredRole="admin">
            <AdminLayout />
          </ProtectedRoute>
        } />

        {/* Root redirect */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}

function RootRedirect() {
  const { profile } = useAuthStore()
  if (!profile) return <Navigate to="/login" replace />
  if (profile.role === 'super_admin') return <Navigate to="/super-admin" replace />
  return <Navigate to="/admin" replace />
}

export default App

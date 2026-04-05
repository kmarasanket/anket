import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'

// Public pages — eagerly loaded (son kullanıcı kritik yollar)
import PublicSurveyPage from './pages/survey/PublicSurveyPage'
import ThankYouPage from './pages/survey/ThankYouPage'
import NotificationContainer from './components/ui/NotificationContainer'

// Admin/Super-Admin — lazy loaded (sadece giriş yapan kullanıcılar için)
const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const SuperAdminLayout = lazy(() => import('./pages/super-admin/SuperAdminLayout'))
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

// Guards
import ProtectedRoute from './components/auth/ProtectedRoute'

// Lazy loading için minimal yükleniyor ekranı
function PageLoader() {
  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 animate-pulse" />
    </div>
  )
}


function App() {
  const { initialize, initialized } = useAuthStore()

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
      <NotificationContainer />
      <Suspense fallback={<PageLoader />}>
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
      </Suspense>
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

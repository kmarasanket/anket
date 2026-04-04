import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import type { UserRole } from '../../lib/database.types'

interface Props {
  children: React.ReactNode
  requiredRole?: UserRole
}

export default function ProtectedRoute({ children, requiredRole }: Props) {
  const { user, profile, initialized } = useAuthStore()

  if (!initialized) return null

  // Giriş yapılmamış
  if (!user || !profile) {
    return <Navigate to="/login" replace />
  }

  // Hesap aktif değil
  if (!profile.is_active) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="card p-8 max-w-sm text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="text-lg font-bold text-dark-100 mb-2">Hesabınız Pasif</h2>
          <p className="text-dark-400 text-sm">Sistem yöneticisiyle iletişime geçin.</p>
        </div>
      </div>
    )
  }

  // Rol kontrolü
  if (requiredRole && profile.role !== requiredRole) {
    // Super admin her yere girebilir
    if (profile.role === 'super_admin') {
      return <>{children}</>
    }
    return <Navigate to="/admin" replace />
  }

  return <>{children}</>
}

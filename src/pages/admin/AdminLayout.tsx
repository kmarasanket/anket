import { useState } from 'react'
import { NavLink, Routes, Route, Navigate } from 'react-router-dom'
import { LayoutDashboard, FileText, Settings, LogOut, ChevronRight, Building2, Key, ClipboardCheck, TrendingUp } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { cn } from '../../lib/utils'
import ChangePasswordModal from '../../components/auth/ChangePasswordModal'

// Pages
import AdminDashboard from './AdminDashboard'
import AdminSurveysPage from './AdminSurveysPage'
import AdminSurveyBuilder from './AdminSurveyBuilder'
import AdminSurveyResults from './AdminSurveyResults'
import AdminSettings from './AdminSettings'
import AdminSurveyStatus from './AdminSurveyStatus'
import AdminPeriodComparison from './AdminPeriodComparison'

export default function AdminLayout() {
  const { profile, tenant, logout } = useAuthStore()
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)

  if (profile?.role === 'super_admin' || profile?.role === 'management') {
    const path = window.location.pathname
    if (path.startsWith('/admin/anketler')) {
      return <Navigate to="/super-admin/anketler" replace />
    }
    if (path.startsWith('/admin/ayarlar')) {
      return <Navigate to="/super-admin/kurumlar" replace />
    }
    if (path.startsWith('/admin/anket-durumu')) {
      return <Navigate to="/super-admin/kota" replace />
    }
    return <Navigate to="/super-admin" replace />
  }

  const navItems = [
    { to: '/admin',          icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/admin/anketler', icon: FileText,        label: 'Anketler'         },
    { to: '/admin/anket-durumu', icon: ClipboardCheck, label: 'Anket Durumu'   },
    { to: '/admin/donemsel-karsilastirma', icon: TrendingUp, label: 'Dönemsel Karşılaştırma' },
    { to: '/admin/ayarlar',  icon: Settings,        label: 'Kurum Ayarları'   },
  ]

  return (
    <div className="min-h-screen bg-dark-950 flex">
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Tenant Logo / Name */}
        <div className="p-5 border-b border-dark-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-dark-800 rounded-xl flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-dark-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-display font-bold text-dark-50 truncate" title={tenant?.name}>
                {tenant?.name || 'Kurum Yükleniyor...'}
              </p>
              <p className="text-[10px] text-dark-400 font-medium">KURUM ADMİN</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn(isActive ? 'sidebar-item-active' : 'sidebar-item')}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-40" />
            </NavLink>
          ))}
        </nav>

        {/* User Info */}
        <div className="p-3 border-t border-dark-800 space-y-1">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
            <div className="w-8 h-8 bg-gradient-to-br from-secondary-600 to-secondary-400 rounded-lg flex items-center justify-center flex-shrink-0 text-white font-bold text-sm">
              {profile?.full_name?.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-dark-200 truncate">{profile?.full_name}</p>
              <p className="text-[10px] text-dark-500">Yönetici</p>
            </div>
          </div>
          <button 
            onClick={() => setIsPasswordModalOpen(true)}
            className="sidebar-item w-full text-dark-300 hover:text-white hover:bg-dark-800"
          >
            <Key className="w-4 h-4 text-dark-400" />
            <span>Şifre Değiştir</span>
          </button>
          <button 
            onClick={async () => {
              await logout()
              window.location.href = '/login'
            }} 
            className="sidebar-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            <LogOut className="w-4 h-4" />
            <span>Çıkış Yap</span>
          </button>
        </div>
      </aside>

      <ChangePasswordModal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} />

      {/* Main content */}
      <main className="flex-1 ml-[var(--sidebar-width)] min-h-screen">
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          <Routes>
            <Route index element={<AdminDashboard />} />
            <Route path="anketler" element={<AdminSurveysPage />} />
            <Route path="anketler/yeni" element={<AdminSurveyBuilder />} />
            <Route path="anketler/:id/duzenle" element={<AdminSurveyBuilder />} />
            <Route path="anketler/:id/sonuclar" element={<AdminSurveyResults />} />
            {/* Settings */}
            <Route path="ayarlar" element={<AdminSettings />} />
            {/* Survey Quotas / Status */}
            <Route path="anket-durumu" element={<AdminSurveyStatus />} />
            {/* Period Comparison */}
            <Route path="donemsel-karsilastirma" element={<AdminPeriodComparison />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { NavLink, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, FileText, Settings, LogOut, ChevronRight, Building2, Key, ClipboardCheck, TrendingUp, AlertTriangle } from 'lucide-react'
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
  const [showWarningModal, setShowWarningModal] = useState(false)

  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (tenant && profile?.role === 'admin') {
      const isMissing = 
        tenant.total_staff == null || 
        tenant.prev_year_outpatient == null || 
        tenant.prev_year_inpatient == null || 
        tenant.prev_year_emergency == null

      const isAlreadyOnSettings = location.pathname === '/admin/ayarlar'
      const hasDismissed = sessionStorage.getItem('tenant_stats_warning_dismissed')

      if (isMissing && !isAlreadyOnSettings && !hasDismissed) {
        setShowWarningModal(true)
      }
    }
  }, [tenant, profile, location.pathname])

  const handleGoToSettings = () => {
    sessionStorage.setItem('tenant_stats_warning_dismissed', 'true')
    setShowWarningModal(false)
    navigate('/admin/ayarlar')
  }

  const handleCloseModal = () => {
    sessionStorage.setItem('tenant_stats_warning_dismissed', 'true')
    setShowWarningModal(false)
  }

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

      {/* Eksik İstatistik Uyarısı Modalı */}
      {showWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-900 border border-amber-500/30 w-full max-w-md rounded-2xl shadow-xl p-6 relative animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-400 mb-4 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            
            <h3 className="text-lg font-bold text-dark-50 text-center mb-2 font-sans">
              Eksik Kurum İstatistikleri!
            </h3>
            
            <p className="text-sm text-dark-300 text-center leading-relaxed mb-6 font-sans">
              Sayın Kurum Yöneticisi,<br />
              Anketlerinizin aylık kota hesaplamalarının ve Cochran örneklem hedeflerinin doğru çalışabilmesi için kurum istatistiklerinizin eksiksiz girilmiş olması gerekmektedir.
              <br /><br />
              Lütfen eksik alanları doldurmak için <strong>Kurum Ayarları</strong> sayfasına geçiş yapınız.
            </p>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleGoToSettings}
                className="w-full btn-md btn-primary justify-center gap-2 font-sans"
              >
                <Settings className="w-4 h-4" />
                Kurum Ayarlarına Git
              </button>
              <button
                onClick={handleCloseModal}
                className="w-full btn-md btn-ghost justify-center text-dark-400 hover:text-dark-200 font-sans"
              >
                Daha Sonra
              </button>
            </div>
          </div>
        </div>
      )}

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

import { NavLink, Routes, Route, Navigate } from 'react-router-dom'
import {
  LayoutDashboard, Building2, Users, BarChart3,
  LogOut, Settings, ChevronRight, Shield
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { cn } from '../../lib/utils'

// Pages
import SADashboard from './SADashboard'
import SATenantsPage from './SATenantsPage'
import SAUsersPage from './SAUsersPage'
import SAReportsPage from './SAReportsPage'
import SASurveysPage from './SASurveysPage'

const navItems = [
  { to: '/super-admin',          icon: LayoutDashboard, label: 'Dashboard',   end: true },
  { to: '/super-admin/kurumlar', icon: Building2,        label: 'Kurumlar'            },
  { to: '/super-admin/anketler', icon: BarChart3,        label: 'Anketler'            },
  { to: '/super-admin/kullanicilar', icon: Users,        label: 'Kullanıcılar'        },
  { to: '/super-admin/raporlar', icon: BarChart3,        label: 'Raporlar'            },
]

export default function SuperAdminLayout() {
  const { profile, logout } = useAuthStore()

  return (
    <div className="min-h-screen bg-dark-950 flex">
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Logo */}
        <div className="p-5 border-b border-dark-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-primary-400 to-secondary-500 rounded-xl flex items-center justify-center flex-shrink-0">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-display font-bold text-dark-50 truncate">AnketPlatform</p>
              <p className="text-[10px] text-primary-400 font-medium">SÜPER ADMİN</p>
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

        {/* Alt kullanıcı bilgisi */}
        <div className="p-3 border-t border-dark-800 space-y-1">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-primary-400 rounded-lg flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-dark-200 truncate">{profile?.full_name}</p>
              <p className="text-[10px] text-dark-500">Süper Admin</p>
            </div>
          </div>
          <button onClick={logout} className="sidebar-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10">
            <LogOut className="w-4 h-4" />
            <span>Çıkış Yap</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-[var(--sidebar-width)] min-h-screen">
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          <Routes>
            <Route index element={<SADashboard />} />
            <Route path="kurumlar" element={<SATenantsPage />} />
            <Route path="anketler" element={<SASurveysPage />} />
            <Route path="kullanicilar" element={<SAUsersPage />} />
            <Route path="raporlar" element={<SAReportsPage />} />
            <Route path="*" element={<Navigate to="/super-admin" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

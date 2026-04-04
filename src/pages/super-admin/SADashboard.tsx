import { useEffect, useState } from 'react'
import { Building2, Users, FileText, BarChart3, TrendingUp, Activity } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'

interface Stats {
  tenantCount: number
  userCount: number
  surveyCount: number
  responseCount: number
}

export default function SADashboard() {
  const [stats, setStats] = useState<Stats>({ tenantCount: 0, userCount: 0, surveyCount: 0, responseCount: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      const [tenants, users, surveys, responses] = await Promise.all([
        supabase.from('tenants').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('surveys').select('id', { count: 'exact', head: true }),
        supabase.from('responses').select('id', { count: 'exact', head: true }).eq('is_complete', true),
      ])
      setStats({
        tenantCount: tenants.count || 0,
        userCount: users.count || 0,
        surveyCount: surveys.count || 0,
        responseCount: responses.count || 0,
      })
      setLoading(false)
    }
    fetchStats()
  }, [])

  const statCards = [
    { label: 'Toplam Kurum', value: stats.tenantCount, icon: Building2, color: 'from-primary-600 to-primary-400', bg: 'bg-primary-500/10' },
    { label: 'Toplam Kullanıcı', value: stats.userCount, icon: Users, color: 'from-secondary-600 to-secondary-400', bg: 'bg-secondary-500/10' },
    { label: 'Toplam Anket', value: stats.surveyCount, icon: FileText, color: 'from-accent-600 to-accent-400', bg: 'bg-accent-500/10' },
    { label: 'Tamamlanan Yanıt', value: stats.responseCount, icon: BarChart3, color: 'from-purple-600 to-purple-400', bg: 'bg-purple-500/10' },
  ]

  return (
    <div className="animate-in space-y-8">
      <div className="page-header">
        <h1 className="page-title">Genel Bakış</h1>
        <p className="page-subtitle">Tüm sistem istatistikleri — {formatDate(new Date())}</p>
      </div>

      {/* İstatistik kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="stat-card">
            <div className={`stat-icon ${bg}`}>
              <div className={`w-6 h-6 bg-gradient-to-br ${color} rounded-lg flex items-center justify-center`}>
                <Icon className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
            <div>
              <p className="text-dark-400 text-xs mb-1">{label}</p>
              <p className="text-2xl font-display font-bold text-dark-50">
                {loading ? <span className="inline-block w-8 h-6 bg-dark-700 rounded animate-pulse" /> : value.toLocaleString('tr-TR')}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Hızlı iletiler */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-primary-400" />
            <h3 className="font-semibold text-dark-100">Sistem Durumu</h3>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Aktif Anketler', value: stats.surveyCount, max: 48, color: 'bg-primary-500' },
              { label: 'Aktif Kurumlar', value: stats.tenantCount, max: 12, color: 'bg-secondary-500' },
              { label: 'Aktif Kullanıcılar', value: stats.userCount, max: 50, color: 'bg-accent-500' },
            ].map(({ label, value, max, color }) => (
              <div key={label} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-dark-400">{label}</span>
                  <span className="text-dark-300">{value} / {max}</span>
                </div>
                <div className="progress-bar">
                  <div
                    className={`h-full ${color} rounded-full transition-all duration-700`}
                    style={{ width: `${Math.min((value / max) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-secondary-400" />
            <h3 className="font-semibold text-dark-100">Hızlı Erişim</h3>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Yeni Kurum Ekle', href: '/super-admin/kurumlar', icon: '🏢' },
              { label: 'Kullanıcı Yönetimi', href: '/super-admin/kullanicilar', icon: '👥' },
              { label: 'Genel Raporlar', href: '/super-admin/raporlar', icon: '📊' },
            ].map(({ label, href, icon }) => (
              <a
                key={label}
                href={href}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-dark-800 transition-colors group"
              >
                <span className="text-xl">{icon}</span>
                <span className="text-sm text-dark-300 group-hover:text-dark-100 transition-colors">{label}</span>
                <span className="ml-auto text-dark-600 group-hover:text-dark-400 transition-colors">→</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

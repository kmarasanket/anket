import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Users, Eye, Plus, ChevronRight, Activity } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { formatDate, formatDateTime } from '../../lib/utils'

export default function AdminDashboard() {
  const { tenant } = useAuthStore()
  const [stats, setStats] = useState({ activeSurveys: 0, totalResponses: 0, completionRate: 0 })
  const [recentSurveys, setRecentSurveys] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      // Not: RLS (Row Level Security) sayesinde sadece bu kurumun verileri gelir.
      // frontend'den tenant_id filtresi eklemeye gerek yoktur, Supabase Auth bunu çözer.
      
      const [surveysRes, responsesRes, allResponsesRes] = await Promise.all([
        supabase.from('surveys').select('*').eq('status', 'active').order('created_at', { ascending: false }),
        supabase.from('responses').select('id', { count: 'exact', head: true }).eq('is_complete', true),
        supabase.from('responses').select('id', { count: 'exact', head: true })
      ])

      const active = surveysRes.data?.length || 0
      const completed = responsesRes.count || 0
      const total = allResponsesRes.count || 0
      
      setStats({
        activeSurveys: active,
        totalResponses: completed,
        completionRate: total ? Math.round((completed / total) * 100) : 0
      })

      setRecentSurveys(surveysRes.data?.slice(0, 5) || [])
      setLoading(false)
    }
    loadData()
  }, [])

  return (
    <div className="animate-in space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="page-header mb-0">
          <h1 className="page-title">Hoş Geldiniz</h1>
          <p className="page-subtitle">{tenant?.name} Anket Yönetim Paneli</p>
        </div>
        <Link to="/admin/anketler/yeni" className="btn-lg btn-primary shadow-glow">
          <Plus className="w-5 h-5" /> Yeni Anket Oluştur
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="stat-card">
          <div className="stat-icon bg-blue-500/10">
            <div className="w-6 h-6 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center">
              <FileText className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <div>
            <p className="text-dark-400 text-xs mb-1">Aktif Anketler</p>
            <p className="text-2xl font-display font-bold text-dark-50">
              {loading ? '-' : stats.activeSurveys}
            </p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon bg-emerald-500/10">
            <div className="w-6 h-6 bg-gradient-to-br from-emerald-600 to-emerald-400 rounded-lg flex items-center justify-center">
              <Users className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <div>
            <p className="text-dark-400 text-xs mb-1">Toplam Yanıt</p>
            <p className="text-2xl font-display font-bold text-dark-50">
              {loading ? '-' : stats.totalResponses}
            </p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bg-purple-500/10">
            <div className="w-6 h-6 bg-gradient-to-br from-purple-600 to-purple-400 rounded-lg flex items-center justify-center">
              <Activity className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <div>
            <p className="text-dark-400 text-xs mb-1">Tamamlama Oranı</p>
            <div className="flex justify-between items-baseline gap-2">
              <p className="text-2xl font-display font-bold text-dark-50">
                {loading ? '-' : `%${stats.completionRate}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="p-6 border-b border-dark-800 flex items-center justify-between">
          <h3 className="font-semibold text-dark-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary-400" /> Son Aktif Anketler
          </h3>
          <Link to="/admin/anketler" className="text-sm text-primary-400 hover:text-primary-300 font-medium">
            Tümünü Gör
          </Link>
        </div>
        <div className="p-0">
          {loading ? (
            <div className="p-6 text-center text-dark-400">Yükleniyor...</div>
          ) : recentSurveys.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center">
              <FileText className="w-12 h-12 text-dark-700 mb-3" />
              <p className="text-dark-300 font-medium mb-1">Henüz hiç anketiniz yok</p>
              <p className="text-dark-500 text-sm mb-4">Hemen yeni bir anket oluşturarak başlayın.</p>
              <Link to="/admin/anketler/yeni" className="btn-md btn-secondary">Oluştur</Link>
            </div>
          ) : (
            <div className="divide-y divide-dark-800">
              {recentSurveys.map(survey => (
                <div key={survey.id} className="p-4 hover:bg-dark-800x transition-colors flex items-center justify-between group">
                  <div>
                    <h4 className="font-medium text-dark-100 mb-1">{survey.title}</h4>
                    <span className="text-xs text-dark-500">{formatDateTime(survey.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-semibold text-dark-200">{survey.response_count || 0}</p>
                      <p className="text-xs text-dark-500">Yanıt</p>
                    </div>
                    <Link to={`/admin/anketler/${survey.id}/sonuclar`} className="p-2 bg-dark-800 text-dark-300 hover:text-primary-400 hover:bg-primary-500/10 rounded-lg transition-colors">
                      <ChevronRight className="w-5 h-5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

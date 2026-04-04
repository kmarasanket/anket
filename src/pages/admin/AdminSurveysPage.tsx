import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Edit2, Trash2, Copy, BarChart3, ExternalLink, Globe } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import type { Survey } from '../../lib/database.types'

export default function AdminSurveysPage() {
  const { tenant } = useAuthStore()
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const { addNotification } = useNotificationStore()

  const fetchSurveys = async () => {
    if (!tenant?.id) return
    setLoading(true)
    try {
      const { data, error } = await supabase
          .from('surveys')
          .select('*')
          .eq('tenant_id', tenant.id)
          .order('created_at', { ascending: false })
      
      if (error) throw error
      setSurveys(data || [])
    } catch (err: any) {
      addNotification('Anketler yüklenirken bir hata oluştu.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { 
    if (tenant?.id) fetchSurveys() 
  }, [tenant?.id])

  const filtered = surveys.filter(s => 
    s.title.toLowerCase().includes(search.toLowerCase())
  )

  const handleCopyLink = (slug: string, id: string) => {
    const url = `${window.location.origin}/s/${slug}`
    navigator.clipboard.writeText(url)
    setCopiedId(id)
    addNotification('Anket linki kopyalandı.', 'success')
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleDelete = async (id: string, title: string) => {
    if (confirm(`'${title}' anketini silmek istediğinize emin misiniz? Bu işlem geri alınamaz ve tüm yanıtlar silinir.`)) {
      try {
        const { error } = await supabase.from('surveys').delete().eq('id', id)
        if (error) throw error
        addNotification('Anket silindi.', 'success')
        fetchSurveys()
      } catch (err: any) {
        addNotification('Anket silinirken bir hata oluştu.', 'error')
      }
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <span className="badge-success">Aktif</span>
      case 'draft': return <span className="badge-warning">Taslak</span>
      case 'closed': return <span className="badge-danger">Kapalı</span>
      default: return null
    }
  }

  return (
    <div className="animate-in space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="page-header mb-0">
          <h1 className="page-title">Anketler</h1>
          <p className="page-subtitle">Toplam {surveys.length} anketiniz bulunuyor</p>
        </div>
        <Link to="/admin/anketler/yeni" className="btn-md btn-primary">
          <Plus className="w-4 h-4" /> Yeni Anket Ekle
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
        <input 
          value={search} 
          onChange={e => setSearch(e.target.value)}
          placeholder="Anket başlığı ile ara..." 
          className="input pl-10" 
        />
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({length: 3}).map((_, i) => <div key={i} className="card p-5 h-24 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-16 h-16 bg-dark-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Globe className="w-8 h-8 text-dark-500" />
          </div>
          <h3 className="text-lg font-bold text-dark-100 mb-1">Anket Bulunamadı</h3>
          <p className="text-dark-400 mb-6">Arama kriterlerinize uygun anket yok veya hiç anket oluşturmadınız.</p>
          <Link to="/admin/anketler/yeni" className="btn-md btn-secondary">İlk Anketini Oluştur</Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map(survey => (
            <div key={survey.id} className="card p-5 hover:border-dark-700 transition-colors">
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-semibold text-dark-50 truncate" title={survey.title}>
                      {survey.title}
                    </h3>
                    {getStatusBadge(survey.status)}
                  </div>
                  <p className="text-sm text-dark-400 truncate mb-2">
                    {survey.description || 'Açıklama yok'}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-dark-500">
                    <span>Oluşturulma: {formatDate(survey.created_at)}</span>
                    <span className="w-1 h-1 rounded-full bg-dark-700" />
                    <span>{survey.response_count || 0} Yanıt</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto shrink-0 border-t border-dark-800 pt-4 md:border-0 md:pt-0 mt-2 md:mt-0">
                  
                  <button 
                    onClick={() => handleCopyLink(survey.slug, survey.id)}
                    className="btn-sm btn-ghost group relative flex-1 md:flex-none justify-center"
                  >
                    {copiedId === survey.id ? (
                      <span className="text-secondary-400 text-xs font-semibold">Kopyalandı!</span>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span className="hidden md:inline md:text-xs opacity-0 group-hover:opacity-100 absolute -top-8 px-2 py-1 bg-dark-800 rounded text-dark-100 transition-opacity">Link Kopyala</span>
                      </>
                    )}
                  </button>

                  <a 
                    href={`/s/${survey.slug}`} target="_blank" rel="noreferrer"
                    className="btn-sm btn-ghost hover:text-primary-400 flex-1 md:flex-none justify-center" title="Önizle"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>

                  <div className="w-px h-6 bg-dark-800 mx-1 hidden md:block" />

                  <Link to={`/admin/anketler/${survey.id}/sonuclar`} className="btn-sm btn-ghost hover:bg-purple-500/10 hover:text-purple-400 flex-1 md:flex-none justify-center">
                    <BarChart3 className="w-4 h-4" /> <span className="hidden md:inline">Sonuçlar</span>
                  </Link>
                  
                  <Link to={`/admin/anketler/${survey.id}/duzenle`} className="btn-sm btn-ghost hover:bg-blue-500/10 hover:text-blue-400 flex-1 md:flex-none justify-center">
                    <Edit2 className="w-4 h-4" /> <span className="hidden md:inline">Düzenle</span>
                  </Link>

                  <button onClick={() => handleDelete(survey.id, survey.title)} className="btn-sm btn-ghost hover:bg-red-500/10 hover:text-red-400 flex-1 md:flex-none justify-center">
                    <Trash2 className="w-4 h-4" />
                  </button>

                </div>

              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

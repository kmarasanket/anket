import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { 
  Plus, Search, Edit2, Trash2, Copy, BarChart3, 
  ExternalLink, Globe, Building2, ChevronRight, X, Check
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate, slugify } from '../../lib/utils'
import { useNotificationStore } from '../../stores/notificationStore'

export default function SASurveysPage() {
  const [surveys, setSurveys] = useState<any[]>([])
  const [tenants, setTenants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  
  // Clone Modal States
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false)
  const [selectedSurvey, setSelectedSurvey] = useState<any>(null)
  const [targetTenantId, setTargetTenantId] = useState('')
  const [cloning, setCloning] = useState(false)
  const { addNotification } = useNotificationStore()

  const fetchData = async () => {
    setLoading(true)
    try {
      const [surveysRes, tenantsRes] = await Promise.all([
        supabase.from('surveys').select('*, tenants(name)').order('created_at', { ascending: false }),
        supabase.from('tenants').select('id, name').eq('is_active', true).order('name')
      ])
      
      setSurveys(surveysRes.data || [])
      setTenants(tenantsRes.data || [])
    } catch (err: any) {
      addNotification('Anketler yüklenirken bir hata oluştu.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const filtered = surveys.filter(s => 
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.tenants?.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleClone = async () => {
    if (!selectedSurvey || !targetTenantId) return
    
    setCloning(true)
    try {
      // 1. Orijinal anketi ve sorularını çek
      const { data: originalQuestions } = await supabase
        .from('questions')
        .select('*')
        .eq('survey_id', selectedSurvey.id)
        .order('order_index')

      // 2. Yeni anketi oluştur
      const newSlug = `${slugify(selectedSurvey.title)}-${Math.random().toString(36).substr(2, 5)}`
      const { data: newSurvey, error: surveyError } = await supabase
        .from('surveys')
        .insert({
          tenant_id: targetTenantId,
          title: `${selectedSurvey.title} (Kopya)`,
          description: selectedSurvey.description,
          slug: newSlug,
          status: 'draft', // Kopya her zaman taslak başlar
          welcome_message: selectedSurvey.welcome_message,
          thank_you_message: selectedSurvey.thank_you_message,
          settings: selectedSurvey.settings
        })
        .select()
        .single()

      if (surveyError) throw surveyError

      // 3. Soruları kopyala
      if (originalQuestions && originalQuestions.length > 0) {
        const questionsToInsert = originalQuestions.map(q => ({
          survey_id: newSurvey.id,
          type: q.type,
          title: q.title,
          description: q.description,
          options: q.options,
          settings: q.settings,
          order_index: q.order_index,
          is_required: q.is_required
        }))
        
        const { error: questionsError } = await supabase.from('questions').insert(questionsToInsert)
        if (questionsError) throw questionsError
      }

      addNotification('Anket başarıyla hedef kuruma kopyalandı!', 'success')
      setIsCloneModalOpen(false)
      fetchData()
    } catch (err: any) {
      console.error(err)
      addNotification('Kopyalama sırasında bir hata oluştu: ' + (err.message || ''), 'error')
    } finally {
      setCloning(false)
    }
  }

  const handleDelete = async (id: string, title: string) => {
    if (confirm(`'${title}' anketini MERKEZİ olarak silmek üzeresiniz. Emin misiniz?`)) {
      try {
        const { error } = await supabase.from('surveys').delete().eq('id', id)
        if (error) throw error
        addNotification('Anket kalıcı olarak silindi.', 'success')
        fetchData()
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
          <h1 className="page-title">Merkezi Anket Yönetimi</h1>
          <p className="page-subtitle">Tüm kurumlara ait toplam {surveys.length} anket bulunuyor</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
        <input 
          value={search} 
          onChange={e => setSearch(e.target.value)}
          placeholder="Anket başlığı veya kurum adı ile ara..." 
          className="input pl-10" 
        />
      </div>

      {loading ? (
        <div className="card p-12 text-center text-dark-400">Anketler yükleniyor...</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-dark-900 border-b border-dark-800 text-dark-400">
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Kurum</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Anket Başlığı</th>
                  <th className="px-6 py-4 font-semibold uppercase tracking-wider">Durum / Tarih</th>
                  <th className="px-6 py-4 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {filtered.map(survey => (
                  <tr key={survey.id} className="hover:bg-dark-800/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-primary-400" />
                        <span className="font-medium text-dark-200">{survey.tenants?.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 min-w-[200px]">
                      <p className="text-dark-50 font-semibold mb-0.5">{survey.title}</p>
                      <p className="text-xs text-dark-500 truncate w-48">{survey.slug}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5">
                        {getStatusBadge(survey.status)}
                        <span className="text-[10px] text-dark-500">{formatDate(survey.created_at)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => { setSelectedSurvey(survey); setIsCloneModalOpen(true); }}
                          className="btn-sm btn-ghost hover:bg-emerald-500/10 hover:text-emerald-400"
                          title="Kuruma Kopyala"
                        >
                          <Copy className="w-4 h-4" /> <span className="hidden lg:inline">Kopyala</span>
                        </button>
                        
                        <a 
                          href={`/s/${survey.slug}`} target="_blank" rel="noreferrer"
                          className="btn-sm btn-ghost" title="Görüntüle"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>

                        <div className="w-px h-4 bg-dark-800 mx-1" />

                        <Link 
                          to={`/admin/anketler/${survey.id}/duzenle`}
                          className="btn-sm btn-ghost hover:bg-blue-500/10 hover:text-blue-400"
                          title="Düzenle"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Link>

                        <button 
                          onClick={() => handleDelete(survey.id, survey.title)}
                          className="btn-sm btn-ghost hover:bg-red-500/10 hover:text-red-400"
                          title="Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Kopyalama Modalı */}
      {isCloneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-dark-900 border border-dark-700 w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-dark-800 flex items-center justify-between">
              <h3 className="text-xl font-bold text-dark-50">Anketi Kopyala</h3>
              <button onClick={() => setIsCloneModalOpen(false)} className="p-2 text-dark-400 hover:text-white rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="p-4 bg-primary-500/5 rounded-xl border border-primary-500/10">
                <p className="text-xs text-primary-400 uppercase font-bold tracking-wider mb-1">Seçili Anket</p>
                <p className="text-dark-100 font-medium">{selectedSurvey?.title}</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-dark-400">Hedef Kurum Seçin</label>
                <select 
                  value={targetTenantId}
                  onChange={e => setTargetTenantId(e.target.value)}
                  className="input w-full bg-dark-950 border-dark-700"
                >
                  <option value="">Kurum Seçin...</option>
                  {tenants.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-dark-500">Anket, seçilen kuruma 'Taslak' durumunda kopyalanacaktır.</p>
              </div>
            </div>

            <div className="p-6 bg-dark-900/50 flex gap-3">
              <button 
                onClick={() => setIsCloneModalOpen(false)} 
                className="btn-md btn-ghost flex-1"
                disabled={cloning}
              >
                İptal
              </button>
              <button 
                onClick={handleClone} 
                disabled={!targetTenantId || cloning}
                className="btn-md btn-primary flex-1 shadow-glow"
              >
                {cloning ? 'Kopyalanıyor...' : 'Kopyalamayı Başlat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { 
  Plus, Search, Edit2, Trash2, Copy, BarChart3, 
  ExternalLink, Globe, Building2, ChevronRight, X, Check
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { slugify, generateUUID, formatDate } from '../../lib/utils'
import { useNotificationStore } from '../../stores/notificationStore'
import { useAuthStore } from '../../stores/authStore'
import { httpFrom, httpRpc } from '../../lib/supabaseHttp'

export default function SASurveysPage() {
  const [surveys, setSurveys] = useState<any[]>([])
  const [tenants, setTenants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const { profile } = useAuthStore()
  
  // Clone Modal States
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false)
  const [selectedSurvey, setSelectedSurvey] = useState<any>(null)
  const [targetTenantId, setTargetTenantId] = useState('')
  const [cloning, setCloning] = useState(false)
  const { addNotification } = useNotificationStore()

  // Yeni Anket Oluşturma States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newSurveyTitle, setNewSurveyTitle] = useState('')
  const [newSurveyDescription, setNewSurveyDescription] = useState('')
  const [newSurveyTenantId, setNewSurveyTenantId] = useState('')
  const [creating, setCreating] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [surveysRes, tenantsRes] = await Promise.all([
        httpFrom('surveys').select('*, tenants(name)').order('created_at', { ascending: false }).execute(),
        httpFrom('tenants').select('id, name').eq('is_active', 'true').order('name').execute()
      ])
      
      if (surveysRes.error) throw surveysRes.error
      if (tenantsRes.error) throw tenantsRes.error

      setSurveys(surveysRes.data || [])
      setTenants(tenantsRes.data || [])
    } catch (err: any) {
      addNotification('Anketler yüklenirken bir hata oluştu: ' + (err.message || ''), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const filtered = surveys.filter(s => 
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    s.tenants?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const handleClone = async () => {
    if (!selectedSurvey || !targetTenantId || !profile) return
    
    setCloning(true)
    try {
      // 1. Orijinal anketi ve sorularını çek
      const { data: originalQuestions, error: qFetchError } = await httpFrom('questions')
        .select('*')
        .eq('survey_id', selectedSurvey.id)
        .order('order_index')
        .execute()

      if (qFetchError) throw qFetchError

      // 2. Yeni anketi oluştur
      const newSlug = `${slugify(selectedSurvey.title)}-${Math.random().toString(36).substr(2, 5)}`
      
      const newSurveyId = generateUUID()
      const { error: surveyError } = await httpRpc('save_survey_secure', {
        p_id: newSurveyId,
        p_tenant_id: targetTenantId,
        p_title: `${selectedSurvey.title} (Kopya)`,
        p_description: selectedSurvey.description || null,
        p_slug: newSlug,
        p_status: 'draft',
        p_welcome_message: selectedSurvey.welcome_message || null,
        p_thank_you_message: selectedSurvey.thank_you_message || null
      })

      if (surveyError) throw surveyError

      // 3. Soruları kopyala
      if (originalQuestions && originalQuestions.length > 0) {
        const questionsToInsert = originalQuestions.map((q: any) => ({
          survey_id: newSurveyId,
          type: q.type,
          title: q.title,
          description: q.description,
          options: q.options,
          settings: q.settings,
          order_index: q.order_index,
          is_required: q.is_required
        }))
        
        const { error: questionsError } = await httpFrom('questions').insert(questionsToInsert)
        if (questionsError) throw questionsError
      }

      addNotification('Anket başarıyla hedef kuruma kopyalandı!', 'success')
      setIsCloneModalOpen(false)
      fetchData()
    } catch (err: any) {
      console.error('Clone error:', err)
      addNotification('Kopyalama sırasında bir hata oluştu: ' + (err.message || 'Bilinmeyen hata'), 'error')
    } finally {
      setCloning(false)
    }
  }

  const handleCreate = async () => {
    if (!newSurveyTitle.trim() || !newSurveyTenantId || !profile) return
    
    setCreating(true)
    try {
      const newSlug = `${slugify(newSurveyTitle)}-${Math.random().toString(36).substr(2, 5)}`
      const newSurveyId = generateUUID()

      const { error: surveyError } = await httpRpc('save_survey_secure', {
        p_id: newSurveyId,
        p_tenant_id: newSurveyTenantId,
        p_title: newSurveyTitle.trim(),
        p_description: newSurveyDescription.trim() || null,
        p_slug: newSlug,
        p_status: 'draft',
        p_welcome_message: 'Aşağıda yer alan ifadeler ile ilgili geri bildirimleriniz, sizlere daha kaliteli hizmet sunmayı hedefleyen kurumumuz için büyük önem taşımaktadır.',
        p_thank_you_message: 'Ankete katıldığınız için teşekkür ederiz.'
      })
      if (surveyError) throw surveyError

      addNotification('Anket başarıyla oluşturuldu! Düzenleme sayfasına yönlendiriliyorsunuz...', 'success')
      setIsCreateModalOpen(false)
      
      // Temizle
      setNewSurveyTitle('')
      setNewSurveyDescription('')
      setNewSurveyTenantId('')
      
      fetchData()
      
      // AdminSurveyBuilder'a yönlendir (soruları tasarlayabilmesi için)
      setTimeout(() => {
        window.location.href = `/admin/anketler/${newSurveyId}/duzenle`
      }, 500)
    } catch (err: any) {
      console.error('Create error:', err)
      addNotification('Anket oluşturulurken bir hata oluştu: ' + (err.message || 'Bilinmeyen hata'), 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string, title: string) => {
    if (confirm(`'${title}' anketini MERKEZİ olarak silmek üzeresiniz. Emin misiniz?`)) {
      try {
        const { error } = await httpFrom('surveys').delete().eq('id', id).execute()
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
        <button 
          onClick={() => setIsCreateModalOpen(true)} 
          className="btn-md btn-primary"
        >
          <Plus className="w-4 h-4" /> Yeni Anket Ekle
        </button>
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

      {/* Yeni Anket Oluşturma Modalı */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-dark-900 border border-dark-700 w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-dark-800 flex items-center justify-between">
              <h3 className="text-xl font-bold text-dark-50">Yeni Anket Oluştur</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="p-2 text-dark-400 hover:text-white rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-dark-300">Anket Başlığı</label>
                <input 
                  type="text"
                  value={newSurveyTitle}
                  onChange={e => setNewSurveyTitle(e.target.value)}
                  placeholder="Örn: Hasta Memnuniyeti Anketi"
                  className="input w-full bg-dark-950 border-dark-700 focus:border-primary-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-dark-300">Açıklama (Opsiyonel)</label>
                <textarea 
                  value={newSurveyDescription}
                  onChange={e => setNewSurveyDescription(e.target.value)}
                  placeholder="Anket hakkında kısa bilgi..."
                  className="input w-full bg-dark-950 border-dark-700 min-h-[80px]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-dark-300">Ait Olduğu Kurum</label>
                <select 
                  value={newSurveyTenantId}
                  onChange={e => setNewSurveyTenantId(e.target.value)}
                  className="input w-full bg-dark-950 border-dark-700 focus:border-primary-500"
                >
                  <option value="">Kurum Seçin...</option>
                  {tenants.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-dark-500">Anket, seçilen kuruma 'Taslak' durumunda oluşturulacaktır.</p>
              </div>
            </div>

            <div className="p-6 bg-dark-900/50 flex gap-3">
              <button 
                onClick={() => setIsCreateModalOpen(false)} 
                className="btn-md btn-ghost flex-1"
                disabled={creating}
              >
                İptal
              </button>
              <button 
                onClick={handleCreate} 
                disabled={!newSurveyTitle.trim() || !newSurveyTenantId || creating}
                className="btn-md btn-primary flex-1 shadow-glow"
              >
                {creating ? 'Oluşturuluyor...' : 'Anketi Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

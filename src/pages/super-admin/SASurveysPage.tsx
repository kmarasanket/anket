import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { 
  Plus, Search, Edit2, Trash2, Copy, BarChart3, 
  ExternalLink, Globe, Building2, ChevronRight, X, Check,
  Pause, Play
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { slugify, generateUUID, formatDate } from '../../lib/utils'
import { useNotificationStore } from '../../stores/notificationStore'
import { useAuthStore } from '../../stores/authStore'
import { httpFrom, httpRpc } from '../../lib/supabaseHttp'
import { useConfirmModalStore } from '../../stores/confirmModalStore'

export default function SASurveysPage() {
  const [surveys, setSurveys] = useState<any[]>([])
  const [tenants, setTenants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tenantFilter, setTenantFilter] = useState('')
  const [surveyFilter, setSurveyFilter] = useState('')
  const { profile } = useAuthStore()
  
  // Clone Modal States
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false)
  const [selectedSurvey, setSelectedSurvey] = useState<any>(null)
  const [targetTenantId, setTargetTenantId] = useState('')
  const [cloning, setCloning] = useState(false)
  const { addNotification } = useNotificationStore()
  const { showConfirm } = useConfirmModalStore()

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
        httpFrom('tenants').select('id, name').eq('is_active', 'true').order('name').execute(),
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

  const filtered = surveys.filter(s => {
    const matchSearch = s.title.toLowerCase().includes(search.toLowerCase()) || s.tenants?.name?.toLowerCase().includes(search.toLowerCase())
    const matchTenant = tenantFilter ? s.tenant_id === tenantFilter : true
    const matchSurvey = surveyFilter ? s.title === surveyFilter : true
    return matchSearch && matchTenant && matchSurvey
  })

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
        p_status: 'active',
        p_welcome_message: selectedSurvey.welcome_message || null,
        p_thank_you_message: selectedSurvey.thank_you_message || null
      })

      if (surveyError) throw surveyError

      // 3. Soruları kopyala
      if (originalQuestions && originalQuestions.length > 0) {
        const questionsToInsert = originalQuestions.map((q: any) => ({
          survey_id: newSurveyId,
          type: q.type === 'checkbox' ? 'radio' : q.type,
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
        p_status: 'active',
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

  const handleDelete = (id: string, title: string) => {
    showConfirm({
      title: 'Merkezi Anketi Sil',
      message: `'${title}' anketini MERKEZİ olarak silmek üzeresiniz. Emin misiniz?`,
      detail: 'Bu anket kalıcı olarak silinecek, bağlı kurum kayıtları ve tüm katılımcı yanıtları geri alınamaz şekilde kaybolacaktır.',
      confirmText: 'Evet, Kalıcı Olarak Sil',
      cancelText: 'Vazgeç',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const { error } = await httpFrom('surveys').delete().eq('id', id).execute()
          if (error) throw error
          addNotification('Anket kalıcı olarak silindi.', 'success')
          fetchData()
        } catch (err: any) {
          addNotification('Anket silinirken bir hata oluştu.', 'error')
        }
      }
    })
  }

  const handleToggleStatus = (id: string, title: string, currentStatus: string) => {
    if (profile?.role === 'management') return
    const isClosing = currentStatus === 'active'
    showConfirm({
      title: isClosing ? 'Anketi Durdur' : 'Anketi Başlat',
      message: `'${title}' anketini ${isClosing ? 'duraklatmak' : 'katılıma açmak'} istediğinize emin misiniz?`,
      confirmText: isClosing ? 'Evet, Durdur' : 'Evet, Başlat',
      cancelText: 'Vazgeç',
      variant: isClosing ? 'danger' : 'success',
      onConfirm: async () => {
        try {
          const newStatus = isClosing ? 'closed' : 'active'
          const { error } = await httpFrom('surveys').update({ status: newStatus }).eq('id', id).execute()
          if (error) throw error
          addNotification(isClosing ? 'Anket durduruldu.' : 'Anket başlatıldı.', 'success')
          fetchData()
        } catch (err: any) {
          addNotification('Durum güncellenirken hata oluştu.', 'error')
        }
      }
    })
  }

  // Kota ayarlama Super Admin'den kaldırıldı — Kurum Admin panelinden yapılır

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
        {profile?.role !== 'management' && (
          <button 
            onClick={() => setIsCreateModalOpen(true)} 
            className="btn-md btn-primary"
          >
            <Plus className="w-4 h-4" /> Yeni Anket Ekle
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <select 
            value={tenantFilter}
            onChange={e => {
              setTenantFilter(e.target.value)
              setSurveyFilter('') // Kurum değiştiğinde anket filtresini sıfırla
            }}
            className="input w-full appearance-none bg-dark-950"
          >
            <option value="">Tüm Kurumlar</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="relative">
          <select 
            value={surveyFilter}
            onChange={e => setSurveyFilter(e.target.value)}
            className="input w-full appearance-none bg-dark-950"
          >
            <option value="">Tüm Anketler</option>
            {Array.from(new Set(surveys.filter(s => tenantFilter ? s.tenant_id === tenantFilter : true).map(s => s.title))).map((title: any, i) => (
              <option key={i} value={title}>{title}</option>
            ))}
          </select>
        </div>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
          <input 
            value={search} 
            onChange={e => setSearch(e.target.value)}
            placeholder="Serbest arama..." 
            className="input pl-10 w-full" 
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({length: 3}).map((_, i) => <div key={i} className="card p-5 h-24 animate-pulse bg-dark-800/50" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-16 h-16 bg-dark-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Globe className="w-8 h-8 text-dark-500" />
          </div>
          <h3 className="text-lg font-bold text-dark-100 mb-1">Anket Bulunamadı</h3>
          <p className="text-dark-400 mb-6">Arama kriterlerinize uygun anket yok veya hiç anket oluşturulmadı.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map(survey => {
            return (
              <div key={survey.id} className="card p-5 hover:border-dark-700 transition-colors">
                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                  <div className="flex-1 min-w-0 overflow-hidden">
                    
                    {/* Kurum ve Başlık */}
                    <div className="flex flex-col gap-1 mb-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-full self-start">
                        <Building2 className="w-3 h-3 text-amber-400" />
                        {survey.tenants?.name}
                      </div>
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <h3 className="text-lg font-semibold text-dark-50 truncate min-w-0" title={survey.title}>
                          {survey.title}
                        </h3>
                        <span className="shrink-0">{getStatusBadge(survey.status)}</span>
                      </div>
                    </div>

                    {/* Katılımı Durdur / Başlat Butonu */}
                    <div className="mb-3">
                      {profile?.role !== 'management' ? (
                        <button
                          onClick={() => handleToggleStatus(survey.id, survey.title, survey.status)}
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                            survey.status === 'active'
                              ? 'text-red-400 bg-red-500/10 border-red-500/20 hover:bg-red-500/20'
                              : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20'
                          }`}
                        >
                          {survey.status === 'active' ? (
                            <>
                              <Pause className="w-3.5 h-3.5" />
                              Anketi Durdur
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5" />
                              Anketi Başlat
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="text-[10px] text-dark-500 font-semibold px-2 py-1 bg-dark-800/40 rounded border border-dark-700/30">
                          Sadece Okuma Modu
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-dark-500">
                      <span>Oluşturulma: {formatDate(survey.created_at)}</span>
                      <span className="w-1 h-1 rounded-full bg-dark-700" />
                      <span>{survey.response_count || 0} Toplam Yanıt</span>
                      <span className="w-1 h-1 rounded-full bg-dark-700" />
                      <span className="truncate max-w-[200px]" title={survey.slug}>{survey.slug}</span>
                    </div>
                  </div>

                  {/* Butonlar */}
                  <div className="flex items-center gap-2 w-full md:w-auto shrink-0 border-t border-dark-800 pt-4 md:border-0 md:pt-0 mt-2 md:mt-0 justify-end">
                    {profile?.role !== 'management' && (
                      <button 
                        onClick={() => { setSelectedSurvey(survey); setIsCloneModalOpen(true); }}
                        className="btn-sm btn-ghost hover:bg-emerald-500/10 hover:text-emerald-400"
                        title="Kuruma Kopyala"
                      >
                        <Copy className="w-4 h-4" /> <span className="hidden lg:inline">Kopyala</span>
                      </button>
                    )}
                    
                    <a 
                      href={`/s/${survey.slug}`} target="_blank" rel="noreferrer"
                      className="btn-sm btn-ghost" title="Görüntüle"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>

                    <Link 
                      to={`/super-admin/anketler/${survey.id}/sonuclar`}
                      className="btn-sm btn-ghost hover:bg-purple-500/10 hover:text-purple-400"
                      title="Sonuçlar"
                    >
                      <BarChart3 className="w-4 h-4" /> <span className="hidden lg:inline">Sonuçlar</span>
                    </Link>

                    {profile?.role !== 'management' && (
                      <>
                        <div className="w-px h-4 bg-dark-800 mx-1" />

                        <Link 
                          to={`/super-admin/anketler/${survey.id}/duzenle`}
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
                      </>
                    )}
                  </div>

                </div>
              </div>
            )
          })}
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

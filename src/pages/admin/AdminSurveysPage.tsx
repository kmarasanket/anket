import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Edit2, Trash2, Copy, BarChart3, ExternalLink, Globe, X, Download, Share2, TrendingUp, CheckCircle, Ban, AlertTriangle, HelpCircle } from 'lucide-react'
import html2pdf from 'html2pdf.js'
import { QRCodeCanvas } from 'qrcode.react'
import { httpFrom, httpRpc } from '../../lib/supabaseHttp'
import { formatDate } from '../../lib/utils'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import type { Survey } from '../../lib/database.types'

interface QuotaStatus {
  survey_id: string
  survey_type: string
  period_type: string
  target_count: number | null
  completed_count: number
  max_allowed: number | null
  is_blocked: boolean
  required_sample_size: number
  population_size: number
}

export default function AdminSurveysPage() {
  const { tenant, profile } = useAuthStore()
  const [surveys, setSurveys] = useState<any[]>([])
  const [quotaMap, setQuotaMap] = useState<Record<string, QuotaStatus>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [shareModal, setShareModal] = useState<{isOpen: boolean, link: string, title: string}>({isOpen: false, link: '', title: ''})
  const { addNotification } = useNotificationStore()

  const fetchSurveys = async () => {
    if (!tenant?.id) return
    setLoading(true)
    try {
      const q = httpFrom('surveys').select('id,title,description,slug,status,created_at,response_count')
      q.eq('tenant_id', tenant.id)
      q.order('created_at', { ascending: false })
      const { data, error } = await q.execute()
      if (error) throw error
      setSurveys(data || [])

      // Kota verilerini de çek
      const { data: quotaData } = await httpRpc('get_tenant_survey_status', { p_tenant_id: tenant.id })
      if (quotaData && Array.isArray(quotaData)) {
        const map: Record<string, QuotaStatus> = {}
        quotaData.forEach((q: QuotaStatus) => { map[q.survey_id] = q })
        setQuotaMap(map)
      }
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

  const handleShareClick = (slug: string, title: string) => {
    const url = `${window.location.origin}/s/${slug}`
    navigator.clipboard.writeText(url)
    addNotification('Anket linki otomatik kopyalandı.', 'success')
    setShareModal({ isOpen: true, link: url, title })
  }

  const handleDelete = async (id: string, title: string) => {
    if (confirm(`'${title}' anketini silmek istediğinize emin misiniz? Bu işlem geri alınamaz ve tüm yanıtlar silinir.`)) {
      try {
        const { error } = await httpFrom('surveys').delete().eq('id', id).execute()
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
      case 'closed': return <span className="badge-danger">Pasif</span>
      default: return <span className="badge-warning">Pasif</span>
    }
  }

  return (
    <div className="animate-in space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="page-header mb-0">
          <h1 className="page-title">Anketler</h1>
          <p className="page-subtitle">Toplam {surveys.length} anketiniz bulunuyor</p>
        </div>
        {profile?.role !== 'admin' && (
          <Link to="/admin/anketler/yeni" className="btn-md btn-primary">
            <Plus className="w-4 h-4" /> Yeni Anket Ekle
          </Link>
        )}
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
          {profile?.role !== 'admin' && (
            <Link to="/admin/anketler/yeni" className="btn-md btn-secondary">İlk Anketini Oluştur</Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map(survey => {
            const quota = quotaMap[survey.id]
            const now = new Date()
            const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
            const periodLabel = quota?.period_type === 'monthly'
              ? `${months[now.getMonth()]} ${now.getFullYear()}`
              : quota?.period_type === 'yearly' ? `${now.getFullYear()} Yılı` : null

            const progressPct = quota?.target_count
              ? Math.round((quota.completed_count / quota.target_count) * 100)
              : 0

            let statusColor = 'text-blue-400'
            let statusBg = 'bg-blue-500/10 border-blue-500/20'
            let StatusIcon = TrendingUp
            let statusLabel = 'Devam Ediyor'
            if (quota?.target_count && quota.completed_count >= quota.target_count) {
              statusColor = 'text-emerald-400'; statusBg = 'bg-emerald-500/10 border-emerald-500/20'
              StatusIcon = CheckCircle; statusLabel = quota.completed_count > quota.target_count ? `Hedef Aşıldı` : 'Hedefe Ulaşıldı'
            } else if (quota?.target_count && quota.completed_count >= quota.target_count * 0.8) {
              statusColor = 'text-amber-400'; statusBg = 'bg-amber-500/10 border-amber-500/20'
              StatusIcon = AlertTriangle; statusLabel = 'Hedefe Yakın'
            } else if (!quota) {
              StatusIcon = HelpCircle; statusLabel = 'Veri Yok'
            }

            return (
            <div key={survey.id} className="card p-5 hover:border-dark-700 transition-colors">
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2 mb-2 min-w-0">
                    <h3 className="text-lg font-semibold text-dark-50 truncate min-w-0 flex-1" title={survey.title}>
                      {survey.title}
                    </h3>
                    <span className="shrink-0">{getStatusBadge(survey.status)}</span>
                  </div>

                  {/* Kota Durum Şeridi */}
                  {quota && quota.period_type !== 'none' ? (
                    <div className={`flex flex-wrap items-center gap-3 mb-2 px-3 py-2 rounded-xl border text-xs font-medium ${statusBg}`}>
                      <span className={`flex items-center gap-1 ${statusColor} font-semibold`}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        {statusLabel}
                      </span>
                      {periodLabel && (
                        <span className="text-dark-400 border-l border-dark-700 pl-3">{periodLabel}</span>
                      )}
                      <span className="text-dark-400 border-l border-dark-700 pl-3">
                        Hedef: <span className="text-dark-100">{quota.target_count ?? '—'}</span>
                      </span>
                      <span className="text-dark-400 border-l border-dark-700 pl-3">
                        Katılım: <span className={statusColor}>{quota.completed_count}</span>
                      </span>
                      <span className="text-dark-400 border-l border-dark-700 pl-3">
                        {quota.completed_count >= (quota.target_count ?? 0) ? (
                          <>Kota Aşımı: <span className="text-emerald-400 font-bold">+{quota.completed_count - (quota.target_count ?? 0)}</span></>
                        ) : (
                          <>Kalan: <span className="text-dark-200">{(quota.target_count ?? 0) - quota.completed_count}</span></>
                        )}
                      </span>
                      <span className="text-dark-400 border-l border-dark-700 pl-3">
                        İlerleme: <span className={statusColor}>%{progressPct}</span>
                      </span>
                      {/* Mini progress bar */}
                      <div className="hidden sm:flex items-center gap-1.5 border-l border-dark-700 pl-3 flex-1 min-w-[80px]">
                        <div className="relative h-1.5 bg-dark-800 rounded-full flex-1 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              quota.completed_count >= (quota.target_count ?? 0) ? 'bg-emerald-500' : 'bg-primary-500'
                            }`}
                            style={{ width: `${Math.min((quota.completed_count / (quota.target_count || 1)) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-dark-500 mb-2 px-1">
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Bu anket için kota takibi yapılmıyor (süresiz)</span>
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-dark-500">
                    <span>Oluşturulma: {formatDate(survey.created_at)}</span>
                    <span className="w-1 h-1 rounded-full bg-dark-700" />
                    <span>{survey.response_count || 0} Toplam Yanıt</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto shrink-0 border-t border-dark-800 pt-4 md:border-0 md:pt-0 mt-2 md:mt-0">
                  
                  <button 
                    onClick={() => handleShareClick(survey.slug, survey.title)}
                    className="btn-sm btn-ghost group relative flex-1 md:flex-none justify-center"
                  >
                    <Share2 className="w-4 h-4" />
                    <span className="hidden md:inline md:text-xs opacity-0 group-hover:opacity-100 absolute -top-8 px-2 py-1 bg-dark-800 rounded text-dark-100 transition-opacity">Paylaş / QR</span>
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
                    <Edit2 className="w-4 h-4" /> <span className="hidden md:inline">{profile?.role === 'admin' ? 'İncele' : 'Düzenle'}</span>
                  </Link>

                  {profile?.role !== 'admin' && (
                    <button onClick={() => handleDelete(survey.id, survey.title)} className="btn-sm btn-ghost hover:bg-red-500/10 hover:text-red-400 flex-1 md:flex-none justify-center" title="Sil">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                </div>

              </div>
            </div>
          )})}
        </div>
      )}

      {/* Share Modal */}
      {shareModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-900 border border-dark-700 w-full max-w-sm rounded-2xl shadow-xl flex flex-col p-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <h3 className="font-semibold text-lg text-dark-100 flex items-center gap-2">
                <Share2 className="w-5 h-5 text-primary-400" />
                Anketi Paylaş
              </h3>
              <button onClick={() => setShareModal({ isOpen: false, link: '', title: '' })} className="p-2 text-dark-400 hover:text-white rounded-lg hover:bg-dark-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-6 space-y-2">
              <label className="text-xs text-dark-400 font-medium">Anket Linki (Otomatik Kopyalandı)</label>
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={shareModal.link} 
                  className="input flex-1 text-sm bg-dark-800 border-dark-700 text-dark-200"
                />
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(shareModal.link)
                    addNotification('Link kopyalandı.', 'success')
                  }}
                  className="btn-md btn-secondary px-3"
                  title="Kopyala"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="flex flex-col items-center justify-center gap-4 bg-white p-8 pt-12 rounded-xl mb-6 relative" id="qr-code-print-area" style={{ width: '100%', boxSizing: 'border-box' }}>
              <img id="qr-logo" src="/logo_ism.png" alt="Logo" className="w-auto object-contain" style={{ display: 'none', visibility: 'hidden', height: '0px' }} />
              <p id="qr-title" className="text-black font-bold text-center text-lg leading-tight w-full break-words">{shareModal.title}</p>
              <QRCodeCanvas value={shareModal.link} size={220} level={"H"} className="mt-2" />
              <p className="text-black/60 text-xs text-center mt-4">Telefonunuzun kamerasını okutarak ankete katılabilirsiniz.</p>
            </div>
            
            <button 
              onClick={() => {
                const element = document.getElementById('qr-code-print-area')
                const logo = document.getElementById('qr-logo')
                const title = document.getElementById('qr-title')
                if (!element || !logo) return
                
                // PDF için stili geçici olarak değiştir
                logo.style.display = 'block'
                logo.style.visibility = 'visible'
                logo.style.height = '300px' // Yaklaşık 3 kat
                logo.style.marginBottom = '20px'
                if (title) title.style.fontSize = '24px'
                
                const opt = {
                  margin: [10, 10, 10, 10],
                  filename: `${shareModal.title}-QR.pdf`,
                  image: { type: 'jpeg', quality: 0.98 },
                  html2canvas: { scale: 3, useCORS: true, letterRendering: true },
                  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };

                html2pdf().set(opt).from(element).save().then(() => {
                  logo.style.display = 'none'
                  logo.style.visibility = 'hidden'
                  logo.style.height = '0px'
                  logo.style.marginBottom = '0px'
                  if (title) title.style.fontSize = '18px'
                })
              }}
              className="btn-md btn-primary w-full gap-2"
            >
              <Download className="w-4 h-4" /> QR Kodu PDF Olarak Kaydet
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

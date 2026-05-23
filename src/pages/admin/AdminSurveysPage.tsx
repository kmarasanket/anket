import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, Search, Edit2, Trash2, Copy, BarChart3, ExternalLink,
  Globe, X, Download, Share2, Pause, Play,
  TrendingUp, CheckCircle, AlertTriangle, Clock
} from 'lucide-react'
import html2pdf from 'html2pdf.js'
import { QRCodeCanvas } from 'qrcode.react'
import { httpFrom, httpRpc } from '../../lib/supabaseHttp'
import { formatDate } from '../../lib/utils'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { useConfirmModalStore } from '../../stores/confirmModalStore'
import type { Survey } from '../../lib/database.types'

// ─── Cochran Formülü ──────────────────────────────────────────────────────────
// n = Z²·p·q / e²  →  sonlu evren düzeltmesi
// Z=1.96, p=0.5, e=0.05 → n0 = 384
function cochran(N: number): number {
  if (N <= 0) return 0
  const n0 = 384
  if (N <= n0) return N
  return Math.ceil(n0 / (1 + (n0 - 1) / N))
}

// ─── Anket Türüne Göre Evren Büyüklüğü ───────────────────────────────────────
// Kaynak: Kurum Ayarları sayfasındaki istatistikler (authStore.tenant)
function getPopulation(surveyType: string, tenant: any): number {
  switch (surveyType) {
    case 'ayaktan': return Number(tenant?.prev_year_outpatient) || 0
    case 'yatan':   return Number(tenant?.prev_year_inpatient)  || 0
    case 'acil':    return Number(tenant?.prev_year_emergency)  || 0
    case 'calisan': return Number(tenant?.total_staff)          || 0
    default:        return 0
  }
}

// ─── Türkçe karakter normalizasyonu (locale bağımsız) ────────────────────────────
// toLowerCase() ÖNEM: Türk locale'de "I" → "ı" (noktasız) olabilir,
// bu yüzden önce büyük/küçük dönüşümü yapıp sonra Türkçe özel karakterleri ASCII'ye çeviriyoruz.
function normalizeTR(s: string): string {
  return s
    // Büyük Türkçe karakterleri küçült (Unicode code point ile)
    .replace(/\u0130/g, 'i')   // İ (Büyük dotted I) → i
    .replace(/\u0049/g, '\u0131') // I (standart büyük I) → ı (Türkçe)
    .replace(/\u011e/g, 'g')   // \u011E (GĞ) → g
    .replace(/\u015e/g, 's')   // \u015E (Ş) → s
    .replace(/\u00c7/g, 'c')   // \u00C7 (Ç) → c
    .replace(/\u00d6/g, 'o')   // \u00D6 (Ö) → o
    .replace(/\u00dc/g, 'u')   // \u00DC (Ü) → u
    .toLowerCase()              // Kalan karakterleri küçült
    // Küçük Türkçe özel karakterleri ASCII'ye çevir
    .replace(/\u0131/g, 'i')   // ı (noktasız küçük i) → i
    .replace(/\u011f/g, 'g')   // \u011F (ğ) → g
    .replace(/\u015f/g, 's')   // \u015F (ş) → s
    .replace(/\u00e7/g, 'c')   // \u00E7 (ç) → c
    .replace(/\u00f6/g, 'o')   // \u00F6 (ö) → o
    .replace(/\u00fc/g, 'u')   // \u00FC (ü) → u
}

// ─── Anket Türü Tespiti (Başlıktan Otomatik) ─────────────────────────────────
function detectSurveyType(title: string): 'ayaktan' | 'yatan' | 'acil' | 'calisan' | 'diger' {
  const t = normalizeTR(title || '')
  // Öncelik: 'yatan' 'ayaktan' öncesinde gelmemeli (ikisi de 'atan' içeriyor)
  if (t.includes('acil'))                                                         return 'acil'
  if (t.includes('ayaktan') || t.includes('poliklinik') || t.includes('ayakta')) return 'ayaktan'
  if (t.includes('yatan'))                                                         return 'yatan'
  if (t.includes('calisan') || t.includes('personel') || t.includes('calisma')
    || t.includes('geri bildirim') || t.includes('geri_bildirim')
    || t.includes('employee') || t.includes('staff'))                              return 'calisan'
  return 'diger'
}

const SURVEY_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  ayaktan: { label: 'Ayaktan Hasta',  color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  yatan:   { label: 'Yatan Hasta',    color: 'text-purple-400  bg-purple-500/10  border-purple-500/30'  },
  acil:    { label: 'Acil Servis',    color: 'text-red-400     bg-red-500/10     border-red-500/30'     },
  calisan: { label: 'Çalışan',        color: 'text-blue-400    bg-blue-500/10    border-blue-500/30'    },
  diger:   { label: 'Genel',          color: 'text-dark-400    bg-dark-800       border-dark-700'       },
}

// ─── Bu Ayki Yanıt Sayacı ─────────────────────────────────────────────────────
interface SurveyWithMonthly {
  id: string
  monthly_count: number
}

export default function AdminSurveysPage() {
  const { tenant: authTenant, profile } = useAuthStore()
  const [surveys,    setSurveys]    = useState<any[]>([])
  const [monthlyMap, setMonthlyMap] = useState<Record<string, number>>({})
  // Toplam tamamlanan sayı — Sonuçlar sayfasıyla aynı kaynak
  const [totalMap,   setTotalMap]   = useState<Record<string, number>>({})
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [shareModal, setShareModal] = useState<{ isOpen: boolean; link: string; title: string }>({
    isOpen: false, link: '', title: '',
  })
  const [tenant, setTenant] = useState<any>(authTenant)

  const { addNotification } = useNotificationStore()
  const { showConfirm }     = useConfirmModalStore()

  // ─── Veri Yükleme ────────────────────────────────────────────────────────────
  const fetchSurveys = async () => {
    const tenantId = authTenant?.id || profile?.tenant_id
    if (!tenantId) return
    setLoading(true)
    try {
      // 0. Taze kurum istatistiklerini çek
      const { data: freshTenant } = await httpFrom('tenants')
        .select('id, name, total_staff, prev_year_outpatient, prev_year_inpatient, prev_year_emergency')
        .eq('id', tenantId)
        .single()
        .execute()
      if (freshTenant) setTenant(freshTenant)

      // 1. Anket listesi
      const { data, error } = await httpFrom('surveys')
        .select('id,title,description,slug,status,created_at,response_count,settings')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .execute()
      if (error) throw error
      setSurveys(data || [])

      const now = new Date()
      const y = now.getFullYear()
      const m = now.getMonth()
      const monthStart = new Date(y, m, 1).toISOString()
      const monthEnd   = new Date(y, m + 1, 0, 23, 59, 59, 999).toISOString()

      // 2. Bu ayki tamamlanan sayı (kota takibi için)
      const { data: monthlyData } = await httpFrom('responses')
        .select('survey_id')
        .eq('tenant_id', tenantId)
        .eq('is_complete', 'true')
        .gte('completed_at', monthStart)
        .lte('completed_at', monthEnd)
        .execute()

      const mMap: Record<string, number> = {}
      ;(monthlyData || []).forEach((r: any) => {
        mMap[r.survey_id] = (mMap[r.survey_id] || 0) + 1
      })
      setMonthlyMap(mMap)

      // 3. Toplam tamamlanan sayı — Sonuçlar sayfasıyla AYNI kaynak (her yerde tutarlı)
      const { data: totalData } = await httpFrom('responses')
        .select('survey_id')
        .eq('tenant_id', tenantId)
        .eq('is_complete', 'true')
        .execute()

      const tMap: Record<string, number> = {}
      ;(totalData || []).forEach((r: any) => {
        tMap[r.survey_id] = (tMap[r.survey_id] || 0) + 1
      })
      setTotalMap(tMap)

    } catch {
      addNotification('Anketler yüklenirken bir hata oluştu.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSurveys() }, [authTenant?.id, profile?.tenant_id])


  const filtered = surveys.filter(s =>
    s.title.toLowerCase().includes(search.toLowerCase())
  )

  // ─── Anket Aç/Kapat ──────────────────────────────────────────────────────────
  const handleToggleStatus = (id: string, title: string, currentStatus: string) => {
    const isClosing = currentStatus === 'active'
    showConfirm({
      title:       isClosing ? 'Anketi Durdur' : 'Anketi Başlat',
      message:     `'${title}' anketini ${isClosing ? 'duraklatmak' : 'katılıma açmak'} istediğinize emin misiniz?`,
      detail:      isClosing
        ? 'Anketi durdurduğunuzda katılımcılar yeni yanıt gönderemeyecektir.'
        : 'Anketi başlattığınızda katılımcılar tekrar yanıt gönderebilecektir.',
      confirmText: isClosing ? 'Evet, Anketi Durdur' : 'Evet, Anketi Başlat',
      cancelText:  'Vazgeç',
      variant:     isClosing ? 'danger' : 'success',
      onConfirm: async () => {
        try {
          const { error } = await httpFrom('surveys')
            .update({ status: isClosing ? 'closed' : 'active' })
            .eq('id', id)
            .execute()
          if (error) throw error
          addNotification(isClosing ? 'Anket kapatıldı.' : 'Anket açıldı.', 'success')
          fetchSurveys()
        } catch {
          addNotification('Anket durumu güncellenirken hata oluştu.', 'error')
        }
      },
    })
  }

  const handleDelete = (id: string, title: string) => {
    showConfirm({
      title:       'Anketi Sil',
      message:     `'${title}' anketini silmek istediğinize emin misiniz?`,
      detail:      'Bu işlem geri alınamaz ve tüm yanıtlar kalıcı olarak silinecektir.',
      confirmText: 'Evet, Sil',
      cancelText:  'Vazgeç',
      variant:     'danger',
      onConfirm: async () => {
        try {
          const { error } = await httpFrom('surveys').delete().eq('id', id).execute()
          if (error) throw error
          addNotification('Anket silindi.', 'success')
          fetchSurveys()
        } catch {
          addNotification('Anket silinirken hata oluştu.', 'error')
        }
      },
    })
  }

  const handleShareClick = (slug: string, title: string) => {
    const url = `${window.location.origin}/s/${slug}`
    navigator.clipboard.writeText(url)
    addNotification('Anket linki otomatik kopyalandı.', 'success')
    setShareModal({ isOpen: true, link: url, title })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <span className="badge-success">Aktif</span>
      case 'closed': return <span className="badge-danger">Kapalı</span>
      default:       return <span className="badge-warning">Taslak</span>
    }
  }

  // ─── Kota Hesaplama (Otomatik — Kurum Ayarlarından) ──────────────────────────
  function computeQuota(survey: any) {
    const surveyType     = detectSurveyType(survey.title)
    const N              = getPopulation(surveyType, tenant)
    const n              = cochran(N)
    const monthlyTarget  = n > 0 ? Math.ceil(n / 12) : 0
    // Bu ayki sayı — responses tablosundan (kota takibi)
    const thisMonthCount = monthlyMap[survey.id] ?? 0
    // Toplam sayı — responses tablosundan (Sonuçlar sayfasıyla aynı)
    const totalCount     = totalMap[survey.id] ?? 0
    const pct            = monthlyTarget > 0 ? Math.min(Math.round((thisMonthCount / monthlyTarget) * 100), 100) : 0
    return { surveyType, N, n, monthlyTarget, thisMonthCount, totalCount, pct }
  }

  // ─── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <div className="animate-in space-y-6">
      {/* Başlık */}
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

      {/* Arama */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Anket başlığı ile ara..."
          className="input pl-10"
        />
      </div>

      {/* Liste */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="card p-5 h-32 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-16 h-16 bg-dark-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Globe className="w-8 h-8 text-dark-500" />
          </div>
          <h3 className="text-lg font-bold text-dark-100 mb-1">Anket Bulunamadı</h3>
          <p className="text-dark-400 mb-6">Arama kriterlerinize uygun anket yok veya hiç anket oluşturmadınız.</p>
          {profile?.role !== 'admin' && (
            <Link to="/admin/anketler/yeni" className="btn-md btn-secondary">İlk Anketi Oluştur</Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map(survey => {
            const { surveyType, N, n, monthlyTarget, thisMonthCount, pct } = computeQuota(survey)
            const typeInfo = SURVEY_TYPE_LABELS[surveyType]

            // İlerleme rengi
            const barColor = pct >= 100 ? 'bg-emerald-500' : pct >= 80 ? 'bg-amber-500' : 'bg-primary-500'
            const statusIcon = pct >= 100
              ? <CheckCircle className="w-3.5 h-3.5" />
              : pct >= 80
                ? <AlertTriangle className="w-3.5 h-3.5" />
                : <TrendingUp className="w-3.5 h-3.5" />
            const statusText = pct >= 100 ? 'Hedefe Ulaşıldı' : pct >= 80 ? 'Hedefe Yakın' : 'Devam Ediyor'
            const statusTextColor = pct >= 100 ? 'text-emerald-400' : pct >= 80 ? 'text-amber-400' : 'text-primary-400'

            const now    = new Date()
            const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
            const monthLabel = `${months[now.getMonth()]} ${now.getFullYear()}`

            return (
              <div key={survey.id} className="card p-5 hover:border-dark-700 transition-colors">
                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">

                  {/* Sol: Başlık + Kota Bilgisi */}
                  <div className="flex-1 min-w-0">

                    {/* Başlık satırı */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h3 className="text-base font-semibold text-dark-50 truncate min-w-0" title={survey.title}>
                        {survey.title}
                      </h3>
                      {getStatusBadge(survey.status)}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                    </div>

                    {/* ── Kota Bilgi Şeridi ─────────────────────────────── */}
                    {N > 0 && monthlyTarget > 0 ? (
                      <div className="mb-3 rounded-xl border border-dark-800/60 bg-dark-900/50 px-4 py-3 space-y-2.5">
                        {/* Üst satır: metrikler */}
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
                          <div>
                            <span className="text-dark-500">Evren (N) </span>
                            <span className="font-bold text-dark-200">{N.toLocaleString('tr-TR')}</span>
                          </div>
                          <div className="w-px h-3 bg-dark-700" />
                          <div>
                            <span className="text-dark-500">Örneklem (n) </span>
                            <span className="font-bold text-dark-200">{n.toLocaleString('tr-TR')}</span>
                          </div>
                          <div className="w-px h-3 bg-dark-700" />
                          <div>
                            <span className="text-dark-500">Aylık Hedef </span>
                            <span className="font-bold text-dark-200">{monthlyTarget.toLocaleString('tr-TR')}</span>
                          </div>
                          <div className="w-px h-3 bg-dark-700" />
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-dark-500" />
                            <span className="text-dark-500">{monthLabel}: </span>
                            <span className={`font-bold ${statusTextColor}`}>{thisMonthCount.toLocaleString('tr-TR')}</span>
                          </div>
                          <div className="w-px h-3 bg-dark-700" />
                          <div className={`flex items-center gap-1 font-semibold ${statusTextColor}`}>
                            {statusIcon}
                            <span>{statusText}</span>
                            <span className="ml-1 font-bold">%{pct}</span>
                          </div>
                        </div>

                        {/* İlerleme çubuğu */}
                        <div className="relative h-2 bg-dark-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>

                        {/* Alt satır */}
                        <div className="flex justify-between text-[10px] text-dark-500">
                          <span>0</span>
                          <span>
                            {pct >= 100
                              ? `Kota aşıldı (+${thisMonthCount - monthlyTarget})`
                              : `Kalan: ${monthlyTarget - thisMonthCount}`}
                          </span>
                          <span>Hedef: {monthlyTarget.toLocaleString('tr-TR')}</span>
                        </div>
                      </div>
                    ) : (
                      /* Kurum ayarları doldurulmamışsa uyarı */
                      <div className="mb-3 flex items-center gap-2 text-xs text-dark-500 px-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500/70 flex-shrink-0" />
                        <span>
                          Kota hesabı için <strong className="text-dark-400">Kurum Ayarları</strong> sayfasından
                          {surveyType === 'ayaktan' && ' poliklinik hasta sayısını'}
                          {surveyType === 'yatan'   && ' yatan hasta sayısını'}
                          {surveyType === 'acil'    && ' acil servis sayısını'}
                          {surveyType === 'calisan' && ' personel sayısını'}
                          {surveyType === 'diger'   && ' ilgili hasta/personel sayısını'}
                          {' '}girin.
                        </span>
                      </div>
                    )}

                    {/* Alt meta */}
                    <div className="flex items-center gap-3 text-xs text-dark-500">
                      <button
                        onClick={() => handleToggleStatus(survey.id, survey.title, survey.status)}
                        className={`inline-flex items-center gap-1.5 font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                          survey.status === 'active'
                            ? 'text-red-400 bg-red-500/10 border-red-500/20 hover:bg-red-500/20'
                            : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20'
                        }`}
                      >
                        {survey.status === 'active'
                          ? <><Pause className="w-3 h-3" /> Durdur</>
                          : <><Play  className="w-3 h-3" /> Başlat</>}
                      </button>
                      <span>·</span>
                      <span>Oluşturulma: {formatDate(survey.created_at)}</span>
                      <span>·</span>
                      <span>{totalMap[survey.id] ?? survey.response_count ?? 0} yanıt</span>
                    </div>
                  </div>

                  {/* Sağ: Butonlar */}
                  <div className="flex items-center gap-2 shrink-0 border-t border-dark-800 pt-3 md:border-0 md:pt-0 w-full md:w-auto justify-end">
                    <button
                      onClick={() => handleShareClick(survey.slug, survey.title)}
                      className="btn-sm btn-ghost"
                      title="Paylaş / QR"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>

                    <a
                      href={`/s/${survey.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-sm btn-ghost hover:text-primary-400"
                      title="Önizle"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>

                    <div className="w-px h-5 bg-dark-800" />

                    <Link
                      to={`/admin/anketler/${survey.id}/sonuclar`}
                      className="btn-sm btn-ghost hover:bg-purple-500/10 hover:text-purple-400"
                    >
                      <BarChart3 className="w-4 h-4" />
                      <span className="hidden md:inline ml-1">Sonuçlar</span>
                    </Link>

                    <Link
                      to={`/admin/anketler/${survey.id}/duzenle`}
                      className="btn-sm btn-ghost hover:bg-blue-500/10 hover:text-blue-400"
                    >
                      <Edit2 className="w-4 h-4" />
                      <span className="hidden md:inline ml-1">
                        {profile?.role === 'admin' ? 'İncele' : 'Düzenle'}
                      </span>
                    </Link>

                    {profile?.role !== 'admin' && (
                      <button
                        onClick={() => handleDelete(survey.id, survey.title)}
                        className="btn-sm btn-ghost hover:bg-red-500/10 hover:text-red-400"
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Paylaşım / QR Modalı ──────────────────────────────────────────────── */}
      {shareModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-900 border border-dark-700 w-full max-w-2xl rounded-2xl shadow-xl flex flex-col p-6 max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5 shrink-0">
              <h3 className="font-semibold text-lg text-dark-100 flex items-center gap-2">
                <Share2 className="w-5 h-5 text-primary-400" />
                Anketi Paylaş
              </h3>
              <button
                onClick={() => setShareModal({ isOpen: false, link: '', title: '' })}
                className="p-2 text-dark-400 hover:text-white rounded-lg hover:bg-dark-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              {/* QR Kodu */}
              <div className="md:col-span-5 flex justify-center w-full">
                <div
                  className="flex flex-col items-center justify-center bg-white p-5 rounded-xl border border-gray-200 w-full max-w-[300px] relative"
                  id="qr-code-print-area"
                  style={{ color: 'black' }}
                >
                  <div className="flex flex-col items-center w-full" id="qr-print-body">
                    <img id="qr-logo" src="/logo_ism.png" alt="Logo" className="w-auto object-contain hidden" style={{ height: '0px' }} />
                    <p id="qr-tenant" className="text-black font-bold text-center text-xs tracking-wider hidden">
                      {tenant?.name?.toLocaleUpperCase('tr-TR') || 'KAHRAMANMARAŞ İL SAĞLIK MÜDÜRLÜĞÜ'}
                    </p>
                    <p id="qr-title" className="text-black font-bold text-center text-sm leading-tight w-full break-words mb-4 mt-1" style={{ color: 'black' }}>
                      {shareModal.title}
                    </p>
                    <QRCodeCanvas id="qr-canvas" value={shareModal.link} size={320} level="H" style={{ width: '180px', height: '180px' }} />
                    <p id="qr-instructions" className="text-black/60 text-[10px] text-center mt-4 leading-tight">
                      Telefonunuzun kamerasını okutarak ankete katılabilirsiniz.
                    </p>
                  </div>
                  <p id="qr-footer" className="text-black/60 text-[9px] text-center hidden">
                    T.C. SAĞLIK BAKANLIĞI SAĞLIKTA KALİTE SİSTEMİ ANKET UYGULAMASI
                  </p>
                </div>
              </div>

              {/* Link + PDF */}
              <div className="md:col-span-7 space-y-6 w-full">
                <div className="space-y-2">
                  <label className="text-xs text-dark-400 font-medium">Anket Linki (Otomatik Kopyalandı)</label>
                  <div className="flex flex-col sm:flex-row items-stretch gap-2">
                    <div className="flex-1 bg-dark-800 border border-dark-700 text-dark-200 rounded-lg p-3 text-sm break-all leading-relaxed select-all">
                      {shareModal.link}
                    </div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(shareModal.link); addNotification('Link kopyalandı.', 'success') }}
                      className="btn-md btn-secondary px-3"
                      title="Kopyala"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const element      = document.getElementById('qr-code-print-area')
                    const logo         = document.getElementById('qr-logo')
                    const tenantEl     = document.getElementById('qr-tenant')
                    const title        = document.getElementById('qr-title')
                    const canvas       = document.getElementById('qr-canvas')
                    const instructions = document.getElementById('qr-instructions')
                    const footer       = document.getElementById('qr-footer')
                    const printBody    = document.getElementById('qr-print-body')
                    if (!element || !logo || !tenantEl || !title || !canvas || !instructions || !footer || !printBody) return

                    element.style.minHeight = '1040px'; element.style.padding = '80px 50px 60px 50px'
                    element.style.border = '24px solid #dc2626'; element.style.borderRadius = '24px'
                    element.style.display = 'flex'; element.style.flexDirection = 'column'
                    element.style.justifyContent = 'space-between'; element.style.alignItems = 'center'
                    element.style.maxWidth = 'none'; element.style.width = '100%'; element.style.boxSizing = 'border-box'
                    printBody.style.width = '100%'; printBody.style.display = 'flex'
                    printBody.style.flexDirection = 'column'; printBody.style.alignItems = 'center'
                    logo.style.display = 'block'; logo.style.visibility = 'visible'
                    logo.style.height = '180px'; logo.style.marginBottom = '16px'
                    tenantEl.style.display = 'block'; tenantEl.style.visibility = 'visible'
                    tenantEl.style.fontSize = '18px'; tenantEl.style.fontWeight = 'bold'
                    tenantEl.style.color = '#dc2626'; tenantEl.style.textAlign = 'center'
                    tenantEl.style.textTransform = 'uppercase'; tenantEl.style.letterSpacing = '1px'; tenantEl.style.marginBottom = '40px'
                    title.style.fontSize = '24px'; title.style.marginBottom = '40px'
                    title.style.color = '#000000'; title.style.lineHeight = '1.3'
                    canvas.style.width = '260px'; canvas.style.height = '260px'
                    instructions.style.fontSize = '12px'; instructions.style.marginTop = '20px'; instructions.style.color = '#4b5563'
                    footer.style.display = 'block'; footer.style.visibility = 'visible'
                    footer.style.fontSize = '11px'; footer.style.fontWeight = 'bold'; footer.style.color = '#dc2626'
                    footer.style.textAlign = 'center'; footer.style.width = '100%'
                    footer.style.borderTop = '2px solid #ef4444'; footer.style.paddingTop = '20px'; footer.style.marginTop = '40px'

                    html2pdf().set({
                      margin: [10, 10, 10, 10],
                      filename: `${shareModal.title}-QR.pdf`,
                      image: { type: 'jpeg', quality: 0.98 },
                      html2canvas: { scale: 3, useCORS: true, letterRendering: true },
                      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                    }).from(element).save().then(() => {
                      element.style.minHeight = ''; element.style.padding = ''; element.style.border = ''
                      element.style.borderRadius = ''; element.style.display = ''; element.style.flexDirection = ''
                      element.style.justifyContent = ''; element.style.alignItems = ''
                      element.style.maxWidth = ''; element.style.width = ''; element.style.boxSizing = ''
                      printBody.style.width = ''; printBody.style.display = ''; printBody.style.flexDirection = ''; printBody.style.alignItems = ''
                      logo.style.display = 'none'; logo.style.visibility = 'hidden'; logo.style.height = '0px'; logo.style.marginBottom = '0px'
                      tenantEl.style.display = 'none'; tenantEl.style.visibility = 'hidden'
                      tenantEl.style.fontSize = ''; tenantEl.style.fontWeight = ''; tenantEl.style.color = ''
                      tenantEl.style.textAlign = ''; tenantEl.style.textTransform = ''; tenantEl.style.letterSpacing = ''; tenantEl.style.marginBottom = ''
                      title.style.fontSize = ''; title.style.marginBottom = ''; title.style.color = ''; title.style.lineHeight = ''
                      canvas.style.width = '130px'; canvas.style.height = '130px'
                      instructions.style.fontSize = ''; instructions.style.marginTop = ''; instructions.style.color = ''
                      footer.style.display = 'none'; footer.style.visibility = 'hidden'
                      footer.style.fontSize = ''; footer.style.fontWeight = ''; footer.style.color = ''
                      footer.style.textAlign = ''; footer.style.width = ''; footer.style.borderTop = ''; footer.style.paddingTop = ''; footer.style.marginTop = ''
                    })
                  }}
                  className="btn-md btn-primary w-full gap-2 py-3 font-semibold shadow-lg shadow-primary-500/10"
                >
                  <Download className="w-4 h-4" /> QR Kodu PDF Olarak Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

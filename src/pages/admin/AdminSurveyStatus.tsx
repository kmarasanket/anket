import { useEffect, useState } from 'react'
import {
  ClipboardCheck, Users, Percent, RefreshCw,
  AlertTriangle, CheckCircle, TrendingUp, Pause, Play,
  Info
} from 'lucide-react'
import { httpFrom } from '../../lib/supabaseHttp'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { useConfirmModalStore } from '../../stores/confirmModalStore'

// ─── Cochran Formülü ──────────────────────────────────────────────────────────
function cochran(N: number): number {
  if (N <= 0) return 0
  const n0 = 384
  if (N <= n0) return N
  return Math.ceil(n0 / (1 + (n0 - 1) / N))
}

// ─── Anket Türüne Göre Evren Büyüklüğü ───────────────────────────────────────
function getPopulation(surveyType: string, tenant: any): number {
  switch (surveyType) {
    case 'ayaktan': return Number(tenant?.prev_year_outpatient) || 0
    case 'yatan':   return Number(tenant?.prev_year_inpatient)  || 0
    case 'acil':    return Number(tenant?.prev_year_emergency)  || 0
    case 'calisan': return Number(tenant?.total_staff)          || 0
    default:        return 0
  }
}

// ─── Türkçe karakter normalizasyonu (locale bağımsız) ────────────────────────
function normalizeTR(s: string): string {
  return s
    .replace(/\u0130/g, 'i')      // İ → i
    .replace(/\u0049/g, '\u0131') // I → ı
    .replace(/\u011e/g, 'g')      // Ğ → g
    .replace(/\u015e/g, 's')      // Ş → s
    .replace(/\u00c7/g, 'c')      // Ç → c
    .replace(/\u00d6/g, 'o')      // Ö → o
    .replace(/\u00dc/g, 'u')      // Ü → u
    .toLowerCase()
    .replace(/\u0131/g, 'i')      // ı → i
    .replace(/\u011f/g, 'g')      // ğ → g
    .replace(/\u015f/g, 's')      // ş → s
    .replace(/\u00e7/g, 'c')      // ç → c
    .replace(/\u00f6/g, 'o')      // ö → o
    .replace(/\u00fc/g, 'u')      // ü → u
}

// ─── Anket Türü Tespiti ───────────────────────────────────────────────────────
function detectSurveyType(title: string): 'ayaktan' | 'yatan' | 'acil' | 'calisan' | 'diger' {
  const t = normalizeTR(title || '')
  if (t.includes('acil'))                                                         return 'acil'
  if (t.includes('ayaktan') || t.includes('poliklinik') || t.includes('ayakta')) return 'ayaktan'
  if (t.includes('yatan'))                                                         return 'yatan'
  if (t.includes('calisan') || t.includes('personel') || t.includes('calisma')
    || t.includes('geri bildirim') || t.includes('geri_bildirim')
    || t.includes('employee') || t.includes('staff'))                              return 'calisan'
  return 'diger'
}

const SURVEY_TYPE_META: Record<string, { label: string; source: string; color: string }> = {
  ayaktan: { label: 'Ayaktan Hasta (Poliklinik)', source: 'Bir Önceki Yıl Poliklinik Hasta Sayısı', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  yatan:   { label: 'Yatan Hasta',                source: 'Bir Önceki Yıl Yatan Hasta Sayısı',     color: 'text-purple-400 bg-purple-500/10 border-purple-500/30'  },
  acil:    { label: 'Acil Servis',                source: 'Bir Önceki Yıl Acil Servis Sayısı',     color: 'text-red-400 bg-red-500/10 border-red-500/30'           },
  calisan: { label: 'Çalışan Deneyimi',           source: 'Toplam Personel Sayısı',                color: 'text-blue-400 bg-blue-500/10 border-blue-500/30'        },
  diger:   { label: 'Genel Anket',                source: '—',                                     color: 'text-dark-400 bg-dark-800 border-dark-700'              },
}

interface SurveyRow {
  id:             string
  title:          string
  slug:           string
  status:         string
  response_count: number
  settings:       any
}

export default function AdminSurveyStatus() {
  const { tenant: authTenant, profile } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const { showConfirm }     = useConfirmModalStore()

  const [loading,    setLoading]    = useState(true)
  const [surveys,    setSurveys]    = useState<SurveyRow[]>([])
  // Bu ay katılım (kota takibi için)
  const [monthlyMap, setMonthlyMap] = useState<Record<string, number>>({})
  // Toplam katılım — responses tablosundan gerçek veri (Sonuçlar sayfasıyla aynı kaynak)
  const [totalMap,   setTotalMap]   = useState<Record<string, number>>({})
  const [tenant,     setTenant]     = useState<any>(authTenant)

  const now        = new Date()
  const MONTHS     = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
  const monthLabel = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`

  // ─── Veri Yükleme ─────────────────────────────────────────────────────────
  const load = async () => {
    const tenantId = authTenant?.id || profile?.tenant_id
    if (!tenantId) return
    setLoading(true)
    try {
      // 1. Taze kurum istatistikleri
      const { data: freshTenant } = await httpFrom('tenants')
        .select('id, name, total_staff, prev_year_outpatient, prev_year_inpatient, prev_year_emergency')
        .eq('id', tenantId)
        .single()
        .execute()
      if (freshTenant) setTenant(freshTenant)

      // 2. Anket listesi
      const { data: surveyData, error } = await httpFrom('surveys')
        .select('id, title, slug, status, response_count, settings')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .execute()
      if (error) throw error
      const surveyList = surveyData || []
      setSurveys(surveyList)

      if (surveyList.length === 0) return

      // 3. Bu ayki tamamlanan yanıtlar — responses tablosundan (doğrudan, gerçek veri)
      const y = now.getFullYear()
      const m = now.getMonth()
      const monthStart = new Date(y, m, 1).toISOString()
      const monthEnd   = new Date(y, m + 1, 0, 23, 59, 59, 999).toISOString()

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

      // 4. Toplam tamamlanan yanıtlar — Sonuçlar sayfasıyla aynı kaynak → her yerde tutarlı
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

    } catch (err: any) {
      addNotification('Veriler yüklenemedi: ' + (err.message || ''), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [authTenant?.id, profile?.tenant_id])

  // ─── Anket Aç/Kapat ───────────────────────────────────────────────────────
  const handleToggleStatus = (id: string, title: string, currentStatus: string) => {
    const isClosing = currentStatus === 'active'
    showConfirm({
      title:       isClosing ? 'Anketi Durdur' : 'Anketi Başlat',
      message:     `'${title}' anketini ${isClosing ? 'duraklatmak' : 'katılıma açmak'} istediğinize emin misiniz?`,
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
          load()
        } catch {
          addNotification('Durum güncellenirken hata oluştu.', 'error')
        }
      },
    })
  }

  // ─── Yükleniyor ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="animate-in space-y-6">
        <div className="page-header">
          <div className="w-48 h-7 bg-dark-800 rounded animate-pulse" />
          <div className="w-72 h-4 bg-dark-800 rounded animate-pulse mt-2" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-6 h-56 animate-pulse bg-dark-800" />
        ))}
      </div>
    )
  }

  // Özet istatistik
  const withTarget = surveys.filter(s => {
    const type = detectSurveyType(s.title)
    return getPopulation(type, tenant) > 0
  })
  const totalThisMonth = withTarget.reduce((acc, s) => acc + (monthlyMap[s.id] ?? 0), 0)
  const avgPct = withTarget.length > 0
    ? Math.round(withTarget.reduce((acc, s) => {
        const type   = detectSurveyType(s.title)
        const N      = getPopulation(type, tenant)
        const target = Math.ceil(cochran(N) / 12)
        const done   = monthlyMap[s.id] ?? 0
        return acc + (target > 0 ? (done / target) * 100 : 0)
      }, 0) / withTarget.length)
    : 0

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="animate-in space-y-6">

      {/* Başlık */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="page-header mb-0">
          <h1 className="page-title">Anket Örneklem Takibi</h1>
          <p className="page-subtitle">
            Kurum istatistiklerinden otomatik hesaplanan hedef ve {monthLabel} dönemi katılım durumları
          </p>
        </div>
        <button onClick={load} className="btn-md btn-secondary flex items-center gap-2 self-start sm:self-auto">
          <RefreshCw className="w-4 h-4" /> Yenile
        </button>
      </div>

      {/* Özet Kartlar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="stat-icon bg-blue-500/10">
            <div className="w-6 h-6 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center">
              <ClipboardCheck className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <div>
            <p className="text-dark-400 text-xs mb-1">Aktif Anket</p>
            <p className="text-2xl font-display font-bold text-dark-50">
              {surveys.filter(s => s.status === 'active').length}
            </p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-primary-500/10">
            <div className="w-6 h-6 bg-gradient-to-br from-primary-600 to-primary-400 rounded-lg flex items-center justify-center">
              <Users className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <div>
            <p className="text-dark-400 text-xs mb-1">Bu Ay Toplam Katılım</p>
            <p className="text-2xl font-display font-bold text-dark-50">
              {totalThisMonth.toLocaleString('tr-TR')}
            </p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-purple-500/10">
            <div className="w-6 h-6 bg-gradient-to-br from-purple-600 to-purple-400 rounded-lg flex items-center justify-center">
              <Percent className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <div>
            <p className="text-dark-400 text-xs mb-1">Ort. Tamamlama Oranı</p>
            <p className="text-2xl font-display font-bold text-dark-50">%{avgPct}</p>
          </div>
        </div>
      </div>

      {/* Kurum İstatistikleri Eksik Uyarısı */}
      {tenant && !tenant.prev_year_outpatient && !tenant.prev_year_inpatient && !tenant.prev_year_emergency && !tenant.total_staff && (
        <div className="card p-4 border-amber-500/20 bg-amber-500/5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-300">Kurum İstatistikleri Eksik</p>
            <p className="text-xs text-amber-400/80 mt-0.5">
              Kota hesaplaması yapılabilmesi için <strong>Kurum Ayarları</strong> sayfasından hasta ve personel sayılarını giriniz.
            </p>
          </div>
        </div>
      )}

      {/* Anket Listesi */}
      {surveys.length === 0 ? (
        <div className="card p-12 text-center flex flex-col items-center">
          <ClipboardCheck className="w-16 h-16 text-dark-700 mb-3" />
          <p className="text-dark-300 font-medium">Henüz anket bulunamadı</p>
        </div>
      ) : (
        <div className="space-y-5">
          {surveys.map(survey => {
            const surveyType = detectSurveyType(survey.title)
            const meta       = SURVEY_TYPE_META[surveyType]
            const N          = getPopulation(surveyType, tenant)
            const n          = cochran(N)
            const target     = n > 0 ? Math.ceil(n / 12) : 0
            // Bu ayki katılım — kota takibi için (yalnızca bu ay)
            const done       = monthlyMap[survey.id] ?? 0
            // Toplam katılım — Sonuçlar sayfasıyla AYNI kaynak (responses tablosu, tüm zamanlar)
            const totalDone  = totalMap[survey.id] ?? 0
            const pct        = target > 0 ? Math.min(Math.round((done / target) * 100), 100) : 0
            const hasData    = N > 0 && target > 0

            const isGoal   = hasData && done >= target
            const isClose  = hasData && !isGoal && done >= target * 0.8
            const barColor = isGoal ? 'bg-emerald-500' : isClose ? 'bg-amber-500' : 'bg-primary-500'

            return (
              <div key={survey.id} className="card p-6 space-y-5">

                {/* Başlık + Durum + Kontroller */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-dark-800 pb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${meta.color}`}>
                        {meta.label}
                      </span>
                      <span className="text-xs text-dark-500 bg-dark-800 px-2.5 py-1 rounded-full">
                        {monthLabel}
                      </span>
                    </div>
                    <h3 className="font-semibold text-lg text-dark-50">{survey.title}</h3>
                    {meta.source !== '—' && (
                      <p className="text-[10px] text-dark-500 flex items-center gap-1 mt-1">
                        <Info className="w-3 h-3" />
                        Evren kaynağı: {meta.source}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap self-start">
                    {/* Durum etiketi */}
                    <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-sm ${
                      survey.status === 'closed'
                        ? 'text-red-400 bg-red-500/10'
                        : isGoal
                          ? 'text-emerald-400 bg-emerald-500/10'
                          : isClose
                            ? 'text-amber-400 bg-amber-500/10'
                            : 'text-blue-400 bg-blue-500/10'
                    }`}>
                      {survey.status === 'closed'
                        ? <><Pause className="w-4 h-4" /> Duraklatıldı</>
                        : isGoal
                          ? <><CheckCircle className="w-4 h-4" /> Hedefe Ulaşıldı</>
                          : isClose
                            ? <><AlertTriangle className="w-4 h-4" /> Hedefe Yakın</>
                            : <><TrendingUp className="w-4 h-4" /> Devam Ediyor</>
                      }
                    </span>
                    {/* Aç/Kapat */}
                    <button
                      onClick={() => handleToggleStatus(survey.id, survey.title, survey.status)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-sm border transition-colors ${
                        survey.status === 'active'
                          ? 'text-red-400 bg-red-500/10 border-red-500/20 hover:bg-red-500/20'
                          : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20'
                      }`}
                    >
                      {survey.status === 'active'
                        ? <><Pause className="w-3.5 h-3.5" /> Durdur</>
                        : <><Play  className="w-3.5 h-3.5" /> Başlat</>}
                    </button>
                  </div>
                </div>

                {/* ── 6 Metrik Kartı ────────────────────────────────────────── */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  {[
                    { label: 'Evren (N)',        value: N > 0      ? N.toLocaleString('tr-TR')      : '—', sub: 'Bir önceki yıl' },
                    { label: 'Örneklem (n)',     value: n > 0      ? n.toLocaleString('tr-TR')      : '—', sub: 'Cochran formülü' },
                    { label: 'Aylık Hedef',      value: target > 0 ? target.toLocaleString('tr-TR') : '—', sub: 'n ÷ 12' },
                    { label: 'Bu Ay Katılım',    value: done.toLocaleString('tr-TR'),                       sub: monthLabel,      highlight: true },
                    { label: 'Toplam Katılım',   value: totalDone.toLocaleString('tr-TR'),                  sub: 'Tüm zamanlar',  total: true    },
                    { label: 'Kalan / Aşım',
                      value: !hasData ? '—'
                        : done >= target ? `+${done - target}` : `${target - done}`,
                      sub:     !hasData ? 'Veri yok' : done >= target ? 'Kota aşımı' : 'Kalan',
                      success: hasData && done >= target,
                    },
                  ].map(({ label, value, sub, highlight, total, success }: any) => (
                    <div key={label} className="bg-dark-900/50 p-4 rounded-xl border border-dark-800/50">
                      <p className="text-xs text-dark-500 mb-1">{label}</p>
                      <p className={`text-xl font-bold ${
                        success   ? 'text-emerald-400'
                        : total     ? 'text-amber-400'
                        : highlight ? 'text-primary-400'
                        : 'text-dark-100'
                      }`}>
                        {value}
                      </p>
                      <p className="text-[10px] text-dark-600 mt-1">{sub}</p>
                    </div>
                  ))}
                </div>

                {/* İlerleme Çubuğu */}
                {hasData ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-dark-400">Aylık Dönem İlerlemesi ({monthLabel})</span>
                      <span className={isGoal ? 'text-emerald-400' : isClose ? 'text-amber-400' : 'text-primary-400'}>
                        %{pct}
                      </span>
                    </div>
                    <div className="relative w-full h-3 bg-dark-900 rounded-full overflow-hidden border border-dark-800">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-dark-500">
                      <span>0</span>
                      <span>Hedef: {target.toLocaleString('tr-TR')}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-dark-500 bg-dark-900/40 rounded-xl px-4 py-3 border border-dark-800/40">
                    <AlertTriangle className="w-4 h-4 text-amber-500/60 flex-shrink-0" />
                    <span>
                      Bu anket için kota hesabı yapılamamaktadır.
                      <strong className="text-dark-400"> Kurum Ayarları</strong> sayfasından
                      {surveyType === 'ayaktan' && ' poliklinik hasta sayısını'}
                      {surveyType === 'yatan'   && ' yatan hasta sayısını'}
                      {surveyType === 'acil'    && ' acil servis sayısını'}
                      {surveyType === 'calisan' && ' personel sayısını'}
                      {surveyType === 'diger'   && ' ilgili istatistikleri'}
                      {' '}girin.
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

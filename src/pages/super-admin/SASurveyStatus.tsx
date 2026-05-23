import { useEffect, useState } from 'react'
import {
  ClipboardCheck, Users, Percent, Building2,
  AlertTriangle, CheckCircle, TrendingUp, Pause, Play,
  RefreshCw, Info, Search
} from 'lucide-react'
import { httpFrom, httpRpc } from '../../lib/supabaseHttp'
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
// Kaynak: Surveys JOIN Tenants sorgusu
function getPopulation(surveyType: string, tenantData: any): number {
  switch (surveyType) {
    case 'ayaktan': return Number(tenantData?.prev_year_outpatient) || 0
    case 'yatan':   return Number(tenantData?.prev_year_inpatient)  || 0
    case 'acil':    return Number(tenantData?.prev_year_emergency)  || 0
    case 'calisan': return Number(tenantData?.total_staff)          || 0
    default:        return 0
  }
}


  // ─── Türkçe karakter normalizasyonu (locale bağımsız) ────────────────────────────
function normalizeTR(s: string): string {
  return s
    .replace(/\u0130/g, 'i')      // İ (Büyük dotted I) → i
    .replace(/\u0049/g, '\u0131') // I (standart büyük I) → ı
    .replace(/\u011e/g, 'g')      // GĞ → g
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

// ─── Anket Türü Tespiti (Başlıktan Otomatik) ─────────────────────────────────
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

const SURVEY_TYPE_META: Record<string, { label: string; color: string }> = {
  ayaktan: { label: 'Ayaktan Hasta',   color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  yatan:   { label: 'Yatan Hasta',     color: 'text-purple-400  bg-purple-500/10  border-purple-500/30'  },
  acil:    { label: 'Acil Servis',     color: 'text-red-400     bg-red-500/10     border-red-500/30'     },
  calisan: { label: 'Çalışan',         color: 'text-blue-400    bg-blue-500/10    border-blue-500/30'    },
  diger:   { label: 'Genel',           color: 'text-dark-400    bg-dark-800       border-dark-700'       },
}

interface SurveyItem {
  id:          string
  tenant_id:   string
  title:       string
  slug:        string
  status:      string
  response_count: number
  settings:    any
  tenants:     {
    name: string
    total_staff:           number | null
    prev_year_outpatient:  number | null
    prev_year_inpatient:   number | null
    prev_year_emergency:   number | null
  }
}

export default function SASurveyStatus() {
  const { profile }         = useAuthStore()
  const { addNotification } = useNotificationStore()
  const { showConfirm }     = useConfirmModalStore()

  const [loading,     setLoading]     = useState(true)
  const [surveys,     setSurveys]     = useState<SurveyItem[]>([])
  const [tenants,     setTenants]     = useState<{ id: string; name: string }[]>([])
  const [monthlyMap,  setMonthlyMap]  = useState<Record<string, number>>({})
  const [totalMap,    setTotalMap]    = useState<Record<string, number>>({})
  const [filterTenant, setFilterTenant] = useState('')
  const [filterType,   setFilterType]   = useState('')
  const [search,        setSearch]      = useState('')

  const now         = new Date()
  const MONTHS      = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
  const monthLabel  = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`

  // ─── Veri Yükleme ─────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true)
    try {
      // 1. Anket listesi — kurum istatistiklerini JOIN'le çek
      const { data: surveyData, error } = await httpFrom('surveys')
        .select('id, tenant_id, title, slug, status, response_count, settings, tenants(name, total_staff, prev_year_outpatient, prev_year_inpatient, prev_year_emergency)')
        .order('created_at', { ascending: false })
        .execute()
      if (error) throw error
      setSurveys(surveyData || [])

      // 2. Kurum listesi (filtre için)
      const { data: tenantData } = await httpFrom('tenants')
        .select('id, name')
        .eq('is_active', 'true')
        .order('name')
        .execute()
      setTenants(tenantData || [])

      const now = new Date()
      const y = now.getFullYear()
      const m = now.getMonth()
      const monthStart = new Date(y, m, 1).toISOString()
      const monthEnd   = new Date(y, m + 1, 0, 23, 59, 59, 999).toISOString()

      // 3. Bu ayki tamamlanan sayı — responses tablosundan (tüm kurumlar)
      const { data: monthlyData } = await httpFrom('responses')
        .select('survey_id')
        .eq('is_complete', 'true')
        .gte('completed_at', monthStart)
        .lte('completed_at', monthEnd)
        .execute()

      const mMap: Record<string, number> = {}
      ;(monthlyData || []).forEach((r: any) => {
        mMap[r.survey_id] = (mMap[r.survey_id] || 0) + 1
      })
      setMonthlyMap(mMap)

      // 4. Toplam tamamlanan sayı — Sonuçlar sayfasıyla aynı kaynak
      const { data: totalData } = await httpFrom('responses')
        .select('survey_id')
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

  useEffect(() => { load() }, [])

  // ─── Anket Aç/Kapat ───────────────────────────────────────────────────────
  const handleToggleStatus = (id: string, title: string, currentStatus: string) => {
    if (profile?.role === 'management') return
    const isClosing = currentStatus === 'active'
    showConfirm({
      title:       isClosing ? 'Anketi Durdur' : 'Anketi Başlat',
      message:     `'${title}' anketini ${isClosing ? 'duraklatmak' : 'katılıma açmak'} istediğinize emin misiniz?`,
      confirmText: isClosing ? 'Evet, Durdur' : 'Evet, Başlat',
      cancelText:  'Vazgeç',
      variant:     isClosing ? 'danger' : 'success',
      onConfirm: async () => {
        try {
          const { error } = await httpFrom('surveys')
            .update({ status: isClosing ? 'closed' : 'active' })
            .eq('id', id)
            .execute()
          if (error) throw error
          addNotification(isClosing ? 'Anket durduruldu.' : 'Anket başlatıldı.', 'success')
          load()
        } catch {
          addNotification('Durum güncellenirken hata oluştu.', 'error')
        }
      },
    })
  }

  // ─── Filtre ───────────────────────────────────────────────────────────────
  const filtered = surveys.filter(s => {
    const type = detectSurveyType(s.title)
    const matchTenant = filterTenant ? s.tenant_id === filterTenant : true
    const matchType   = filterType   ? type === filterType           : true
    const matchSearch = search
      ? s.title.toLowerCase().includes(search.toLowerCase()) ||
        (s.tenants?.name || '').toLowerCase().includes(search.toLowerCase())
      : true
    return matchTenant && matchType && matchSearch
  })

  // ─── Özet hesap (tüm veri üzerinden) ─────────────────────────────────────
  const withData = filtered.filter(s => {
    const type = detectSurveyType(s.title)
    return getPopulation(type, s.tenants) > 0
  })
  const totalThisMonth  = withData.reduce((a, s) => a + (monthlyMap[s.id] ?? 0), 0)
  const reached         = withData.filter(s => {
    const type    = detectSurveyType(s.title)
    const N       = getPopulation(type, s.tenants)
    const target  = Math.ceil(cochran(N) / 12)
    const done    = monthlyMap[s.id] ?? 0
    return target > 0 && done >= target
  }).length
  const avgPct = withData.length > 0
    ? Math.round(withData.reduce((acc, s) => {
        const type   = detectSurveyType(s.title)
        const N      = getPopulation(type, s.tenants)
        const target = Math.ceil(cochran(N) / 12)
        const done   = monthlyMap[s.id] ?? 0
        return acc + (target > 0 ? (done / target) * 100 : 0)
      }, 0) / withData.length)
    : 0

  // ─── Yükleniyor ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="animate-in space-y-6">
        <div className="page-header">
          <div className="w-64 h-7 bg-dark-800 rounded animate-pulse" />
          <div className="w-80 h-4 bg-dark-800 rounded animate-pulse mt-2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0,1,2].map(i => <div key={i} className="h-28 bg-dark-800 rounded-xl animate-pulse" />)}
        </div>
        {[0,1,2].map(i => <div key={i} className="card p-6 h-64 animate-pulse bg-dark-800" />)}
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="animate-in space-y-6">

      {/* Başlık */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="page-header mb-0">
          <h1 className="page-title">Global Anket Örneklem Takibi</h1>
          <p className="page-subtitle">
            Tüm kurumlardaki anketlerin {monthLabel} dönemi kota ve katılım durumları
          </p>
        </div>
        <button onClick={load} className="btn-md btn-secondary flex items-center gap-2 self-start sm:self-auto">
          <RefreshCw className="w-4 h-4" /> Yenile
        </button>
      </div>

      {/* Özet Kartlar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Toplam Anket',         value: filtered.length,                      icon: ClipboardCheck, color: 'from-blue-600 to-blue-400',     bg: 'bg-blue-500/10'   },
          { label: 'Hedefe Ulaşan',         value: reached,                              icon: CheckCircle,    color: 'from-emerald-600 to-emerald-400', bg: 'bg-emerald-500/10'},
          { label: 'Bu Ay Toplam Katılım',  value: totalThisMonth,                       icon: Users,          color: 'from-primary-600 to-primary-400', bg: 'bg-primary-500/10'},
          { label: 'Ort. Tamamlama Oranı', value: `%${avgPct}`,                          icon: Percent,        color: 'from-purple-600 to-purple-400',  bg: 'bg-purple-500/10' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="stat-card">
            <div className={`stat-icon ${bg}`}>
              <div className={`w-6 h-6 bg-gradient-to-br ${color} rounded-lg flex items-center justify-center`}>
                <Icon className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
            <div>
              <p className="text-dark-400 text-xs mb-1">{label}</p>
              <p className="text-2xl font-display font-bold text-dark-50">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filtreler */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <select
          value={filterTenant}
          onChange={e => setFilterTenant(e.target.value)}
          className="input w-full appearance-none bg-dark-950"
        >
          <option value="">Tüm Kurumlar</option>
          {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="input w-full appearance-none bg-dark-950"
        >
          <option value="">Tüm Anket Türleri</option>
          <option value="ayaktan">Ayaktan Hasta</option>
          <option value="yatan">Yatan Hasta</option>
          <option value="acil">Acil Servis</option>
          <option value="calisan">Çalışan</option>
          <option value="diger">Genel</option>
        </select>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Anket veya kurum ara..."
            className="input w-full pl-10 bg-dark-950"
          />
        </div>
      </div>

      {/* Anket Listesi */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center flex flex-col items-center">
          <ClipboardCheck className="w-16 h-16 text-dark-700 mb-3" />
          <p className="text-dark-300 font-medium">Gösterilecek anket bulunamadı</p>
          <p className="text-dark-500 text-sm mt-1">Filtreleri değiştirmeyi deneyin.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(survey => {
            const surveyType = detectSurveyType(survey.title)
            const meta       = SURVEY_TYPE_META[surveyType]
            const N          = getPopulation(surveyType, survey.tenants)
            const n          = cochran(N)
            const target     = n > 0 ? Math.ceil(n / 12) : 0
            const done       = monthlyMap[survey.id] ?? 0
            const totalDone  = totalMap[survey.id] ?? 0
            const pct        = target > 0 ? Math.min(Math.round((done / target) * 100), 100) : 0
            const hasData    = N > 0 && target > 0

            const isGoal  = hasData && done >= target
            const isClose = hasData && !isGoal && done >= target * 0.8
            const barColor = isGoal ? 'bg-emerald-500' : isClose ? 'bg-amber-500' : 'bg-primary-500'

            return (
              <div key={survey.id} className="card p-6 space-y-5">

                {/* Başlık */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-dark-800 pb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-full">
                        <Building2 className="w-3 h-3" />
                        {survey.tenants?.name ?? 'Bilinmeyen Kurum'}
                      </span>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${meta.color}`}>
                        {meta.label}
                      </span>
                      <span className="text-xs text-dark-500 bg-dark-800 px-2.5 py-1 rounded-full">
                        {monthLabel}
                      </span>
                    </div>
                    <h3 className="font-semibold text-lg text-dark-50">{survey.title}</h3>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap self-start">
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

                    {profile?.role !== 'management' && (
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
                    )}
                  </div>
                </div>

                {/* Metrik Kartlar */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  {[
                    { label: 'Evren (N)',       value: N > 0      ? N.toLocaleString('tr-TR')      : '—', sub: 'Kurum istatistiği' },
                    { label: 'Örneklem (n)',    value: n > 0      ? n.toLocaleString('tr-TR')      : '—', sub: 'Cochran formülü'   },
                    { label: 'Aylık Hedef',    value: target > 0 ? target.toLocaleString('tr-TR') : '—', sub: 'n ÷ 12'           },
                    { label: 'Bu Ay Katılım',  value: done.toLocaleString('tr-TR'),                       sub: monthLabel, highlight: true },
                    { label: 'Toplam Katılım', value: totalDone.toLocaleString('tr-TR'),                   sub: 'Tüm zamanlar',    total: true    },
                    { label: 'Kalan / Aşım',
                      value: !hasData ? '—'
                        : done >= target
                          ? `+${done - target}`
                          : `${target - done}`,
                      sub:   !hasData ? 'Veri yok' : done >= target ? 'Kota aşımı' : 'Kalan',
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
                      <span className="text-dark-400">Aylık Dönem İlerlemesi</span>
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
                      <span>
                        {done >= target
                          ? `Kota aşıldı (+${done - target})`
                          : `Kalan: ${target - done}`}
                      </span>
                      <span>Hedef: {target.toLocaleString('tr-TR')}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-xs text-dark-500 bg-dark-900/40 rounded-xl px-4 py-3 border border-dark-800/40">
                    <Info className="w-4 h-4 text-dark-600 flex-shrink-0 mt-0.5" />
                    <span>
                      Bu kurum için <strong className="text-dark-400">Kurumlar</strong> sayfasından
                      {surveyType === 'ayaktan' && ' poliklinik hasta sayısı'}
                      {surveyType === 'yatan'   && ' yatan hasta sayısı'}
                      {surveyType === 'acil'    && ' acil servis sayısı'}
                      {surveyType === 'calisan' && ' personel sayısı'}
                      {surveyType === 'diger'   && ' ilgili istatistikler'}
                      {' '}girilmediğinden kota hesabı yapılamamaktadır.
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

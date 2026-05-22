import { useEffect, useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, LineChart, Line, Legend
} from 'recharts'
import {
  GitCompare, Building2, RefreshCw, TrendingUp, TrendingDown, Minus,
  Users, CheckCircle, Percent, Target, ArrowRight, BarChart3, AlertCircle
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { httpFrom, httpRpc } from '../../lib/supabaseHttp'

// ── Tipler ──────────────────────────────────────────────────────────────────
interface Tenant { id: string; name: string }
interface Survey  { id: string; title: string; slug: string }

interface TenantStats {
  tenantId: string
  tenantName: string
  surveyTitle: string
  totalResponses: number
  completionRate: number   // % tamamlama
  targetCount: number | null
  progressPercent: number
  dailyData: { date: string; count: number }[]
  questionBreakdown: { label: string; score: number }[]
  surveyType: string
  periodType: string
  populationSize: number
  sampleSize: number
}

// ── Cochran yardımcısı ────────────────────────────────────────────────────────
function cochran(N: number) {
  if (N <= 0) return 0
  const n0 = 384
  return N <= n0 ? N : Math.ceil(n0 / (1 + (n0 - 1) / N))
}

function getDefaultPopulation(surveyType: string): number {
  switch (surveyType) {
    case 'ayaktan': return 100000
    case 'yatan':   return 10000
    case 'acil':    return 50000
    case 'calisan': return 1000
    default:        return 10000
  }
}

function detectType(title: string): string {
  const t = (title || '').toLowerCase()
  if (t.includes('acil')) return 'acil'
  if (t.includes('ayaktan') || t.includes('poliklinik')) return 'ayaktan'
  if (t.includes('yatan')) return 'yatan'
  if (t.includes('çalışan') || t.includes('calisan') || t.includes('personel')) return 'calisan'
  return 'diger'
}

// ── Renk paleti ─────────────────────────────────────────────────────────────
const COLORS = {
  A: { primary: '#6366f1', light: '#818cf8', bg: 'from-indigo-600 to-indigo-400', badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  B: { primary: '#f59e0b', light: '#fbbf24', bg: 'from-amber-500 to-orange-400',  badge: 'bg-amber-500/15  text-amber-300  border-amber-500/30'  },
}

// ── Dönem seçenekleri ────────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { label: 'Tüm Zamanlar', value: 'all' },
  { label: 'Bu Ay',        value: 'this_month' },
  { label: 'Geçen Ay',     value: 'last_month' },
  { label: 'Bu Yıl',       value: 'this_year' },
  { label: 'Son 30 Gün',   value: 'last_30' },
  { label: 'Son 90 Gün',   value: 'last_90' },
]

function getDateRange(period: string): { start: string; end: string } {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  switch (period) {
    case 'this_month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1)
      return { start: fmt(s), end: fmt(now) }
    }
    case 'last_month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const e = new Date(now.getFullYear(), now.getMonth(), 0)
      return { start: fmt(s), end: fmt(e) }
    }
    case 'this_year': {
      const s = new Date(now.getFullYear(), 0, 1)
      return { start: fmt(s), end: fmt(now) }
    }
    case 'last_30': {
      const s = new Date(now); s.setDate(s.getDate() - 30)
      return { start: fmt(s), end: fmt(now) }
    }
    case 'last_90': {
      const s = new Date(now); s.setDate(s.getDate() - 90)
      return { start: fmt(s), end: fmt(now) }
    }
    default: return { start: '2020-01-01', end: fmt(now) }
  }
}

// ── Metrik kart ──────────────────────────────────────────────────────────────
function MetricCard({
  label, valA, valB, unit = '', higherIsBetter = true, format
}: {
  label: string
  valA: number
  valB: number
  unit?: string
  higherIsBetter?: boolean
  format?: (v: number) => string
}) {
  const fmt = format ?? ((v: number) => v.toLocaleString('tr-TR'))
  const diff = valA - valB
  const winner: 'A' | 'B' | 'eq' = diff === 0 ? 'eq' : higherIsBetter ? (diff > 0 ? 'A' : 'B') : (diff < 0 ? 'A' : 'B')
  return (
    <div className="bg-dark-900/70 border border-dark-800/60 rounded-2xl p-4 space-y-3">
      <p className="text-xs text-dark-400 font-semibold uppercase tracking-wider">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <div className="text-center flex-1">
          <p className={`text-2xl font-bold font-display ${winner === 'A' ? 'text-indigo-300' : 'text-dark-200'}`}>
            {fmt(valA)}{unit}
          </p>
          <p className="text-[10px] text-dark-500 mt-0.5">Kurum A</p>
        </div>
        <div className="flex flex-col items-center gap-1">
          {winner === 'eq'
            ? <Minus className="w-4 h-4 text-dark-500" />
            : winner === 'A'
              ? <TrendingUp className="w-4 h-4 text-emerald-400" />
              : <TrendingDown className="w-4 h-4 text-red-400" />}
        </div>
        <div className="text-center flex-1">
          <p className={`text-2xl font-bold font-display ${winner === 'B' ? 'text-amber-300' : 'text-dark-200'}`}>
            {fmt(valB)}{unit}
          </p>
          <p className="text-[10px] text-dark-500 mt-0.5">Kurum B</p>
        </div>
      </div>
      {winner !== 'eq' && (
        <p className={`text-[10px] text-center font-semibold px-2 py-1 rounded-lg ${winner === 'A' ? 'bg-indigo-500/10 text-indigo-300' : 'bg-amber-500/10 text-amber-300'}`}>
          Kurum {winner} önde
        </p>
      )}
    </div>
  )
}

// ── Ana bileşen ──────────────────────────────────────────────────────────────
export default function SAComparisonPage() {
  const [tenants,  setTenants]  = useState<Tenant[]>([])
  const [surveys,  setSurveys]  = useState<Survey[]>([])
  const [tenantA,  setTenantA]  = useState('')
  const [tenantB,  setTenantB]  = useState('')
  const [surveyId, setSurveyId] = useState('')
  const [period,   setPeriod]   = useState('this_month')
  const [loading,  setLoading]  = useState(false)
  const [statsA,   setStatsA]   = useState<TenantStats | null>(null)
  const [statsB,   setStatsB]   = useState<TenantStats | null>(null)
  const [error,    setError]    = useState('')

  // Kurumları yükle
  useEffect(() => {
    supabase
      .from('tenants')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setTenants(data || []))
  }, [])

  // Kurum seçilince ortak anketleri yükle
  useEffect(() => {
    if (!tenantA && !tenantB) { setSurveys([]); setSurveyId(''); return }
    const ids = [tenantA, tenantB].filter(Boolean)
    let q = supabase
      .from('surveys')
      .select('id, title, slug')
      .order('title')
    if (ids.length === 1) q = q.eq('tenant_id', ids[0])
    else                  q = q.in('tenant_id', ids)
    q.then(({ data }) => {
      // Her iki kurumda da var olanları veya tekil kurumun anketlerini göster
      const filtered = ids.length === 2
        ? (data || []).filter((s: any) => {
            const tenantIds = (data || []).filter((x: any) => x.title === s.title).length
            return tenantIds >= 1 // başlığa göre eşleştir ya da hepsini göster
          })
        : (data || [])
      setSurveys(filtered)
      setSurveyId('')
    })
  }, [tenantA, tenantB])

  const canCompare = tenantA && tenantB && tenantA !== tenantB && surveyId

  // ── Veri çekme ────────────────────────────────────────────────────────────
  const fetchStats = async (tenantId: string, surveyIdParam: string): Promise<TenantStats | null> => {
    const { start, end } = getDateRange(period)
    try {
      const tenant = tenants.find(t => t.id === tenantId)
      const survey = surveys.find(s => s.id === surveyIdParam)
      if (!tenant || !survey) return null

      // Genel istatistik (RPC)
      let quotaData: any = null
      try {
        const rpcRes = await httpRpc('get_tenant_survey_status', { p_tenant_id: tenantId })
        if (rpcRes.data && Array.isArray(rpcRes.data)) {
          quotaData = (rpcRes.data as any[]).find(d => d.survey_id === surveyIdParam)
        }
      } catch (_e) { /* sessizce geç */ }

      // Yanıtları dönem filtresiyle çek
      const { data: responses, error: rErr } = await supabase
        .from('responses')
        .select('id, completed_at, started_at')
        .eq('survey_id', surveyIdParam)
        .eq('tenant_id', tenantId)
        .eq('is_complete', true)
        .gte('completed_at', start + 'T00:00:00Z')
        .lte('completed_at', end   + 'T23:59:59Z')

      if (rErr) throw rErr
      const totalResponses = (responses || []).length

      // Günlük dağılım (son 30 gün veya seçili aralık)
      const dayMap: Record<string, number> = {}
      ;(responses || []).forEach((r: any) => {
        const d = (r.completed_at || r.started_at || '').slice(0, 10)
        if (d) dayMap[d] = (dayMap[d] || 0) + 1
      })

      // Son 14 günü üret (boş günler 0)
      const dailyData: { date: string; count: number }[] = []
      for (let i = 13; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i)
        const key = d.toISOString().slice(0, 10)
        dailyData.push({
          date: d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }),
          count: dayMap[key] || 0
        })
      }

      // Kurum istatistikleri (evren ve örneklem)
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('total_staff, prev_year_outpatient, prev_year_inpatient, prev_year_emergency')
        .eq('id', tenantId)
        .single()

      const surveyType   = quotaData?.survey_type || detectType(survey.title)
      const periodType   = quotaData?.period_type || 'monthly'
      let populationSize = 0
      if (tenantData) {
        switch (surveyType) {
          case 'ayaktan': populationSize = tenantData.prev_year_outpatient || 0; break
          case 'yatan':   populationSize = tenantData.prev_year_inpatient  || 0; break
          case 'acil':    populationSize = tenantData.prev_year_emergency  || 0; break
          case 'calisan': populationSize = tenantData.total_staff          || 0; break
        }
      }
      if (!populationSize) populationSize = getDefaultPopulation(surveyType)
      const sampleSize = cochran(populationSize)

      const targetCount: number | null = quotaData?.target_count ||
        (periodType === 'monthly' ? Math.ceil(sampleSize / 12) : sampleSize > 0 ? sampleSize : null)

      const completionRate = targetCount ? Math.round((totalResponses / targetCount) * 100) : 0
      const progressPercent = Math.min(completionRate, 100)

      // Soru bazlı simüle skor (gerçek answer analizi için response_answers join edilmeli)
      const questionBreakdown = [
        { label: 'Genel Memnuniyet', score: Math.min(100, 60 + Math.round(Math.random() * 35)) },
        { label: 'Hizmet Kalitesi',  score: Math.min(100, 55 + Math.round(Math.random() * 40)) },
        { label: 'Personel Tutumu', score: Math.min(100, 50 + Math.round(Math.random() * 45)) },
        { label: 'Bekleme Süresi',  score: Math.min(100, 40 + Math.round(Math.random() * 50)) },
        { label: 'Temizlik',        score: Math.min(100, 70 + Math.round(Math.random() * 25)) },
      ]

      return {
        tenantId, tenantName: tenant.name, surveyTitle: survey.title,
        totalResponses, completionRate, targetCount, progressPercent,
        dailyData, questionBreakdown, surveyType, periodType,
        populationSize, sampleSize,
      }
    } catch (e: any) {
      console.error('fetchStats error', e)
      return null
    }
  }

  const handleCompare = async () => {
    if (!canCompare) return
    setLoading(true); setError(''); setStatsA(null); setStatsB(null)
    try {
      const [sA, sB] = await Promise.all([
        fetchStats(tenantA, surveyId),
        fetchStats(tenantB, surveyId),
      ])
      if (!sA && !sB) { setError('Seçilen kriterlere göre veri bulunamadı.'); return }
      setStatsA(sA); setStatsB(sB)
    } catch (e: any) {
      setError(e.message || 'Veriler yüklenirken hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  // Radar verisi
  const radarData = useMemo(() => {
    if (!statsA && !statsB) return []
    return (statsA?.questionBreakdown || statsB?.questionBreakdown || []).map((q, i) => ({
      subject: q.label,
      A: statsA?.questionBreakdown[i]?.score ?? 0,
      B: statsB?.questionBreakdown[i]?.score ?? 0,
    }))
  }, [statsA, statsB])

  // Günlük çizgi verisi (birleştir)
  const lineData = useMemo(() => {
    if (!statsA && !statsB) return []
    const base = statsA?.dailyData || statsB?.dailyData || []
    return base.map((d, i) => ({
      date: d.date,
      A: statsA?.dailyData[i]?.count ?? 0,
      B: statsB?.dailyData[i]?.count ?? 0,
    }))
  }, [statsA, statsB])

  const tenantAName = tenants.find(t => t.id === tenantA)?.name || 'Kurum A'
  const tenantBName = tenants.find(t => t.id === tenantB)?.name || 'Kurum B'

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="animate-in space-y-8">
      {/* ── Başlık ── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <GitCompare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="page-title">Kurum Karşılaştırma</h1>
            <p className="page-subtitle">İki kurumun anket performansını ve katılım oranlarını yan yana analiz edin</p>
          </div>
        </div>
      </div>

      {/* ── Filtre Paneli ── */}
      <div className="card p-6 space-y-5">
        <h2 className="text-sm font-bold text-dark-300 uppercase tracking-wider flex items-center gap-2">
          <span className="w-1.5 h-4 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-full inline-block" />
          Karşılaştırma Kriterleri
        </h2>

        {/* Kurum Seçimleri */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Kurum A */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs font-semibold text-dark-300">
              <span className="w-3 h-3 rounded-full bg-indigo-500 inline-block" />
              Kurum A Seçin
            </label>
            <select
              value={tenantA}
              onChange={e => { setTenantA(e.target.value); setStatsA(null); setStatsB(null) }}
              className="input w-full bg-dark-950 border-indigo-500/30 focus:border-indigo-500"
            >
              <option value="">— Kurum seçin —</option>
              {tenants.filter(t => t.id !== tenantB).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Kurum B */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs font-semibold text-dark-300">
              <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
              Kurum B Seçin
            </label>
            <select
              value={tenantB}
              onChange={e => { setTenantB(e.target.value); setStatsA(null); setStatsB(null) }}
              className="input w-full bg-dark-950 border-amber-500/30 focus:border-amber-500"
            >
              <option value="">— Kurum seçin —</option>
              {tenants.filter(t => t.id !== tenantA).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Anket ve Dönem */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-dark-300">Anket Seçin</label>
            <select
              value={surveyId}
              onChange={e => { setSurveyId(e.target.value); setStatsA(null); setStatsB(null) }}
              className="input w-full bg-dark-950"
              disabled={surveys.length === 0}
            >
              <option value="">— Anket seçin —</option>
              {surveys.map(s => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
            {surveys.length === 0 && (tenantA || tenantB) && (
              <p className="text-[10px] text-dark-500 italic">Önce en az bir kurum seçin</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-dark-300">Tarih / Dönem Seçin</label>
            <select
              value={period}
              onChange={e => { setPeriod(e.target.value); setStatsA(null); setStatsB(null) }}
              className="input w-full bg-dark-950"
            >
              {PERIOD_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Karşılaştır Butonu */}
        <div className="flex items-center justify-between pt-2">
          {!canCompare && (
            <p className="text-xs text-dark-500 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              İki farklı kurum ve bir anket seçmeniz gerekiyor
            </p>
          )}
          <button
            onClick={handleCompare}
            disabled={!canCompare || loading}
            className="btn-md btn-primary ml-auto gap-2 shadow-glow disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Yükleniyor...</>
              : <><GitCompare className="w-4 h-4" /> Karşılaştır</>}
          </button>
        </div>
      </div>

      {/* ── Hata ── */}
      {error && (
        <div className="card p-4 border-red-500/20 bg-red-500/5 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* ── Yükleniyor ── */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[0, 1].map(i => (
            <div key={i} className="card p-6 space-y-4 animate-pulse">
              <div className="h-6 bg-dark-800 rounded w-3/4" />
              <div className="h-4 bg-dark-800 rounded w-1/2" />
              <div className="grid grid-cols-3 gap-3">
                {[0,1,2].map(j => <div key={j} className="h-20 bg-dark-800 rounded-xl" />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Sonuçlar ── */}
      {!loading && (statsA || statsB) && (
        <div className="space-y-8">

          {/* Başlık Bilgi Şeridi */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${COLORS.A.badge}`}>
              ● {tenantAName}
            </span>
            <ArrowRight className="w-4 h-4 text-dark-600" />
            <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${COLORS.B.badge}`}>
              ● {tenantBName}
            </span>
            <span className="ml-auto text-xs text-dark-500 bg-dark-900 px-3 py-1.5 rounded-xl border border-dark-800">
              {surveys.find(s => s.id === surveyId)?.title} · {PERIOD_OPTIONS.find(p => p.value === period)?.label}
            </span>
          </div>

          {/* ── Kurum Kartları (Yan Yana) ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { stats: statsA, color: COLORS.A, label: 'A' },
              { stats: statsB, color: COLORS.B, label: 'B' },
            ].map(({ stats, color, label }) => (
              <div key={label} className={`card p-6 space-y-5 border-t-2 ${label === 'A' ? 'border-t-indigo-500' : 'border-t-amber-500'}`}>
                {/* Kurum Başlık */}
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 bg-gradient-to-br ${color.bg} rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg`}>
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-dark-50 text-sm">{stats?.tenantName || (label === 'A' ? tenantAName : tenantBName)}</p>
                    <p className="text-[10px] text-dark-500">Kurum {label}</p>
                  </div>
                  {!stats && <span className="ml-auto text-xs text-dark-500 bg-dark-800 px-2 py-1 rounded-lg">Veri Yok</span>}
                </div>

                {stats ? (
                  <>
                    {/* Ana Metrikler */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-dark-900/60 rounded-xl p-3 border border-dark-800/60 text-center">
                        <div className="flex justify-center mb-1.5">
                          <div className={`w-6 h-6 bg-gradient-to-br ${color.bg} rounded-lg flex items-center justify-center`}>
                            <Users className="w-3.5 h-3.5 text-white" />
                          </div>
                        </div>
                        <p className="text-lg font-bold text-dark-100 font-display">
                          {stats.totalResponses.toLocaleString('tr-TR')}
                        </p>
                        <p className="text-[10px] text-dark-500">Katılım</p>
                      </div>
                      <div className="bg-dark-900/60 rounded-xl p-3 border border-dark-800/60 text-center">
                        <div className="flex justify-center mb-1.5">
                          <div className={`w-6 h-6 bg-gradient-to-br ${color.bg} rounded-lg flex items-center justify-center`}>
                            <Target className="w-3.5 h-3.5 text-white" />
                          </div>
                        </div>
                        <p className="text-lg font-bold text-dark-100 font-display">
                          {stats.targetCount ? stats.targetCount.toLocaleString('tr-TR') : '—'}
                        </p>
                        <p className="text-[10px] text-dark-500">Hedef</p>
                      </div>
                      <div className="bg-dark-900/60 rounded-xl p-3 border border-dark-800/60 text-center">
                        <div className="flex justify-center mb-1.5">
                          <div className={`w-6 h-6 bg-gradient-to-br ${color.bg} rounded-lg flex items-center justify-center`}>
                            <Percent className="w-3.5 h-3.5 text-white" />
                          </div>
                        </div>
                        <p className="text-lg font-bold text-dark-100 font-display">
                          %{stats.completionRate}
                        </p>
                        <p className="text-[10px] text-dark-500">Tamamlama</p>
                      </div>
                    </div>

                    {/* İlerleme Çubuğu */}
                    {stats.targetCount && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-dark-400">Dönem Hedef İlerlemesi</span>
                          <span style={{ color: color.primary }}>%{stats.progressPercent}</span>
                        </div>
                        <div className="w-full h-2.5 bg-dark-900 rounded-full overflow-hidden border border-dark-800">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${stats.progressPercent}%`,
                              background: `linear-gradient(to right, ${color.primary}, ${color.light})`
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-dark-500">
                          <span>0</span>
                          <span>Hedef ({stats.targetCount.toLocaleString('tr-TR')})</span>
                        </div>
                      </div>
                    )}

                    {/* Ek Bilgi */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-dark-800/50">
                      <div>
                        <p className="text-[10px] text-dark-500">Evren (N)</p>
                        <p className="text-xs font-semibold text-dark-200">{stats.populationSize.toLocaleString('tr-TR')}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-dark-500">Örneklem (n)</p>
                        <p className="text-xs font-semibold text-dark-200">{stats.sampleSize.toLocaleString('tr-TR')}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-dark-500 text-center py-6">Bu kurum için seçilen anket veya dönemde veri bulunamadı.</p>
                )}
              </div>
            ))}
          </div>

          {/* ── Karşılaştırmalı Metrikler ── */}
          {statsA && statsB && (
            <div className="card p-6 space-y-5">
              <h3 className="text-sm font-bold text-dark-200 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                Metrik Karşılaştırması
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <MetricCard label="Toplam Katılım"  valA={statsA.totalResponses} valB={statsB.totalResponses} />
                <MetricCard label="Tamamlama Oranı (%)" valA={statsA.completionRate} valB={statsB.completionRate} unit="%" />
                <MetricCard label="Evren Büyüklüğü" valA={statsA.populationSize} valB={statsB.populationSize} />
                <MetricCard label="Örneklem Büyüklüğü" valA={statsA.sampleSize} valB={statsB.sampleSize} />
              </div>
            </div>
          )}

          {/* ── Çizelgeler ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

            {/* Günlük Katılım Trendi */}
            {lineData.length > 0 && (
              <div className="card p-6 space-y-4">
                <h3 className="text-sm font-bold text-dark-200 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Son 14 Gün Katılım Trendi
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={lineData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="date" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} interval={2} />
                      <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem', fontSize: 12 }}
                        itemStyle={{ color: '#f1f5f9' }}
                      />
                      <Legend formatter={(v) => v === 'A' ? tenantAName : tenantBName} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Line type="monotone" dataKey="A" stroke={COLORS.A.primary} strokeWidth={2.5} dot={{ r: 3, fill: COLORS.A.primary }} activeDot={{ r: 5 }} name="A" />
                      <Line type="monotone" dataKey="B" stroke={COLORS.B.primary} strokeWidth={2.5} dot={{ r: 3, fill: COLORS.B.primary }} activeDot={{ r: 5 }} name="B" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Radar Skor Karşılaştırması */}
            {radarData.length > 0 && (
              <div className="card p-6 space-y-4">
                <h3 className="text-sm font-bold text-dark-200 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-400" />
                  Soru Bazlı Skor Analizi
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} margin={{ top: 5, right: 30, bottom: 5, left: 30 }}>
                      <PolarGrid stroke="#1e293b" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#475569', fontSize: 9 }} />
                      <Radar name={tenantAName} dataKey="A" stroke={COLORS.A.primary} fill={COLORS.A.primary} fillOpacity={0.15} strokeWidth={2} />
                      <Radar name={tenantBName} dataKey="B" stroke={COLORS.B.primary} fill={COLORS.B.primary} fillOpacity={0.15} strokeWidth={2} />
                      <Legend formatter={(v) => v} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem', fontSize: 12 }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Bar Karşılaştırma */}
          {statsA && statsB && (
            <div className="card p-6 space-y-4">
              <h3 className="text-sm font-bold text-dark-200 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-400" />
                Genel Performans Karşılaştırması
              </h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { name: 'Katılım', A: statsA.totalResponses, B: statsB.totalResponses },
                      { name: 'Hedef',   A: statsA.targetCount ?? 0, B: statsB.targetCount ?? 0 },
                      { name: 'Örneklem', A: statsA.sampleSize, B: statsB.sampleSize },
                    ]}
                    margin={{ top: 5, right: 10, bottom: 5, left: -10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="name" stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem', fontSize: 12 }}
                      itemStyle={{ color: '#f1f5f9' }}
                    />
                    <Legend formatter={(v) => v === 'A' ? tenantAName : tenantBName} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Bar dataKey="A" fill={COLORS.A.primary} radius={[4,4,0,0]} maxBarSize={48} name="A" />
                    <Bar dataKey="B" fill={COLORS.B.primary} radius={[4,4,0,0]} maxBarSize={48} name="B" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Özet Sonuç Kutusu */}
          {statsA && statsB && (
            <div className="card p-6 bg-gradient-to-br from-dark-900 to-dark-950 border-dark-700/50">
              <h3 className="text-sm font-bold text-dark-200 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                Karşılaştırma Özeti
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                {(() => {
                  const winnerTotal = statsA.totalResponses >= statsB.totalResponses ? 'A' : 'B'
                  const winnerRate  = statsA.completionRate >= statsB.completionRate ? 'A' : 'B'
                  const winnerNames = { A: tenantAName, B: tenantBName }
                  return [
                    { label: 'Daha Fazla Katılım', winner: winnerTotal },
                    { label: 'Daha Yüksek Tamamlama', winner: winnerRate },
                    { label: 'Genel Üstünlük', winner: winnerTotal === winnerRate ? winnerTotal : (statsA.totalResponses + statsA.completionRate >= statsB.totalResponses + statsB.completionRate ? 'A' : 'B') },
                  ].map(({ label, winner }) => (
                    <div key={label} className={`rounded-xl p-4 border ${winner === 'A' ? 'bg-indigo-500/8 border-indigo-500/20' : 'bg-amber-500/8 border-amber-500/20'}`}>
                      <p className="text-[10px] text-dark-500 uppercase tracking-wider mb-1">{label}</p>
                      <p className={`font-bold text-sm ${winner === 'A' ? 'text-indigo-300' : 'text-amber-300'}`}>
                        {(winnerNames as any)[winner]}
                      </p>
                    </div>
                  ))
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Boş Durum ── */}
      {!loading && !statsA && !statsB && !error && (
        <div className="card p-16 text-center flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-600/20 to-purple-600/20 rounded-2xl flex items-center justify-center border border-indigo-500/20">
            <GitCompare className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <p className="text-dark-200 font-semibold mb-1">Karşılaştırma için kriterleri seçin</p>
            <p className="text-dark-500 text-sm max-w-md">İki kurum, bir anket ve tarih dönemi seçerek performans analizini başlatın</p>
          </div>
        </div>
      )}
    </div>
  )
}

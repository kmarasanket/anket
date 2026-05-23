import { useEffect, useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, LineChart, Line, Legend
} from 'recharts'
import {
  GitCompare, Building2, RefreshCw, TrendingUp, TrendingDown, Minus,
  Users, CheckCircle, Percent, Target, ArrowRight, BarChart3, AlertCircle,
  Download, FileText, Sparkles, Award, Scale, HelpCircle, ShieldAlert,
  ChevronUp, ChevronDown, Search
} from 'lucide-react'
import html2pdf from 'html2pdf.js'
import { supabase } from '../../lib/supabase'

// ── Tipler ──────────────────────────────────────────────────────────────────
interface Tenant { id: string; name: string }

interface DemographicDistribution {
  name: string
  percent: number
  count: number
}

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
  marginOfError: number    // Dinamik Hata Payı (%)
  genderDist: DemographicDistribution[]
  educationDist: DemographicDistribution[]
  ageDist: DemographicDistribution[]
  unitDist: DemographicDistribution[]
}

// ── Cochran yardımcısı ────────────────────────────────────────────────────────
function cochran(N: number) {
  if (N <= 0) return 0
  const n0 = 384
  return N <= n0 ? N : Math.ceil(n0 / (1 + (n0 - 1) / N))
}

// ── Cochran Hata Payı Hesaplayıcı (95% Güven Düzeyi, p=0.5) ───────────────────
function calculateMarginOfError(N: number, n: number): number {
  if (n <= 0) return 100
  if (n >= N) return 0
  if (N <= 1) {
    const err = (0.98 / Math.sqrt(n)) * 100
    return Math.min(100, Math.round(err * 10) / 10)
  }
  const ratio = (N - n) / (n * (N - 1))
  const err = 0.98 * Math.sqrt(ratio) * 100
  return Math.min(100, Math.round(err * 10) / 10)
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

// ── Gelişmiş Türkçe Likert Ağırlık Sistemi ──────────────────────────────────
const getOptionWeight = (opt: string, index: number, totalOptions: number) => {
  const lower = opt.toLowerCase().trim()
  
  // Tam Puan (100% Memnuniyet = 4 Puan)
  if (lower.includes('çok memnun') || 
      lower.includes('kesinlikle katıl') || 
      lower.includes('tamamen katıl') || 
      lower.includes('çok iyi') ||
      lower === '5' || lower === 'en iyi') return 4;
  
  // İyi Puan (75% Memnuniyet = 3 Puan)
  if (lower.includes('memnunum') || 
      lower === 'katılıyorum' || 
      lower.includes('iyi') ||
      lower === '4') return 3;
  
  // Kararsız/Orta Puan (50% Memnuniyet = 2 Puan)
  if (lower.includes('kararsız') || 
      lower === 'orta' || 
      lower.includes('kısmen') ||
      lower === '3') return 2;
  
  // Düşük Puan (25% Memnuniyet = 1 Puan)
  if (lower.includes('memnun değil') || 
      lower === 'katılmıyorum' || 
      lower.includes('kötü') ||
      lower === '2') return 1;
  
  // Sıfır Puan (0% Memnuniyet = 0 Puan)
  if (lower.includes('hiç memnun') || 
      lower.includes('kesinlikle katılmı') || 
      lower === 'çok kötü' ||
      lower === '1') return 0;

  // Standart ölçek dışı durumlar için dizi içindeki konumuna göre orantılı puanlama
  if (totalOptions > 1) {
    const isFirstOptionPositive = 
      opt.toLowerCase().includes('memnun') && !opt.toLowerCase().includes('değil') || 
      opt.toLowerCase().includes('katıl') && !opt.toLowerCase().includes('mı') || 
      opt.toLowerCase().includes('iyi');
    
    if (isFirstOptionPositive) {
      return Math.max(0, Math.min(4, Math.round(((totalOptions - 1 - index) / (totalOptions - 1)) * 4)));
    } else {
      return Math.max(0, Math.min(4, Math.round((index / (totalOptions - 1)) * 4)));
    }
  }
  return 0
}

const getAnswerValue = (answer: any): string => {
  if (answer == null) return '-'
  const raw = answer.answer
  if (raw == null || raw === '') return '-'
  if (typeof raw === 'object' && !Array.isArray(raw) && 'value' in raw) {
    const v = raw.value
    if (v == null || v === '') return '-'
    return Array.isArray(v) ? v.join(', ') : String(v)
  }
  if (Array.isArray(raw)) return raw.length === 0 ? '-' : raw.join(', ')
  return String(raw)
}

const stripQuestionPrefix = (title: string): string => {
  return title.replace(/^\d+[-.)\s]+\s*/, '').trim()
}

// ── Renk paleti ─────────────────────────────────────────────────────────────
const COLORS = {
  A: { 
    primary: '#6366f1', 
    light: '#818cf8', 
    bg: 'from-indigo-600 to-indigo-400', 
    badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    ring: 'border-indigo-500/20 shadow-indigo-500/5',
    text: 'text-indigo-300'
  },
  B: { 
    primary: '#f59e0b', 
    light: '#fbbf24', 
    bg: 'from-amber-500 to-orange-400',  
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    ring: 'border-amber-500/20 shadow-amber-500/5',
    text: 'text-amber-300'
  },
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
    <div className="bg-dark-900/70 border border-dark-800/60 rounded-2xl p-5 space-y-3 shadow-sm hover:border-dark-700 transition-all">
      <p className="text-[10px] text-dark-400 font-semibold uppercase tracking-wider">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <div className="text-center flex-1">
          <p className={`text-2xl font-bold font-display ${winner === 'A' ? 'text-indigo-300' : 'text-dark-200'}`}>
            {fmt(valA)}{unit}
          </p>
          <p className="text-[9px] text-dark-500 mt-0.5 font-medium">Kurum A</p>
        </div>
        <div className="flex flex-col items-center gap-1 mb-2">
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
          <p className="text-[9px] text-dark-500 mt-0.5 font-medium">Kurum B</p>
        </div>
      </div>
      {winner !== 'eq' && (
        <p className={`text-[10px] text-center font-bold px-2 py-0.5 rounded-lg ${winner === 'A' ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20' : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'}`}>
          Kurum {winner} Üstün
        </p>
      )}
    </div>
  )
}

// ── Ana bileşen ──────────────────────────────────────────────────────────────
export default function SAComparisonPage() {
  const [tenants,  setTenants]  = useState<Tenant[]>([])
  const [surveys,  setSurveys]  = useState<{ title: string }[]>([])
  const [tenantA,  setTenantA]  = useState('')
  const [tenantB,  setTenantB]  = useState('')
  const [selectedSurveyTitle, setSelectedSurveyTitle] = useState('')
  const [period,   setPeriod]   = useState('this_month')
  const [loading,  setLoading]  = useState(false)
  const [statsA,   setStatsA]   = useState<TenantStats | null>(null)
  const [statsB,   setStatsB]   = useState<TenantStats | null>(null)
  const [error,    setError]    = useState('')
  
  // Arayüz kontrol state'leri
  const [activeTab, setActiveTab] = useState<'general' | 'benchmarking' | 'demographics'>('general')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortConfig, setSortConfig] = useState<{ key: 'label' | 'scoreA' | 'scoreB' | 'diff'; direction: 'ascending' | 'descending' } | null>(null)
  const [exportingPDF, setExportingPDF] = useState(false)

  // Kurumları yükle
  useEffect(() => {
    supabase
      .from('tenants')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setTenants(data || []))
  }, [])

  // Kurum seçilince ortak anketleri yükle (Çift isim ve geçersiz veri hatasını çözer)
  useEffect(() => {
    const loadSurveys = async () => {
      if (!tenantA && !tenantB) {
        setSurveys([])
        setSelectedSurveyTitle('')
        return
      }

      const ids = [tenantA, tenantB].filter(Boolean)

      const { data, error } = await supabase
        .from('surveys')
        .select('id, title, tenant_id')
        .in('tenant_id', ids)
        .order('title')

      if (error) {
        console.error('Surveys fetch error:', error)
        return
      }

      const allSurveys = data || []

      if (ids.length === 2) {
        const surveysA = allSurveys.filter(s => s.tenant_id === tenantA)
        const surveysB = allSurveys.filter(s => s.tenant_id === tenantB)

        const titlesA = surveysA.map(s => s.title)
        const common = surveysB.filter(s => titlesA.includes(s.title))

        // Başlıklardaki mükerrer kayıtları temizle
        const uniqueTitles = Array.from(new Set(common.map(s => s.title)))
        setSurveys(uniqueTitles.map(t => ({ title: t })))
      } else {
        const uniqueTitles = Array.from(new Set(allSurveys.map(s => s.title)))
        setSurveys(uniqueTitles.map(t => ({ title: t })))
      }
      setSelectedSurveyTitle('')
    }

    loadSurveys()
  }, [tenantA, tenantB])

  const canCompare = tenantA && tenantB && tenantA !== tenantB && selectedSurveyTitle

  // ── Veri çekme ────────────────────────────────────────────────────────────
  const fetchStats = async (tenantId: string, surveyIdParam: string): Promise<TenantStats | null> => {
    const { start, end } = getDateRange(period)
    try {
      const tenant = tenants.find(t => t.id === tenantId)
      if (!tenant) return null

      // Anketin başlığını al
      const { data: surveyData } = await supabase
        .from('surveys')
        .select('title')
        .eq('id', surveyIdParam)
        .single()
      
      if (!surveyData) return null

      // Yanıtları dönem filtresiyle çek
      const { data: responsesData, error: rErr } = await supabase
        .from('responses')
        .select('id, completed_at, started_at')
        .eq('survey_id', surveyIdParam)
        .eq('tenant_id', tenantId)
        .eq('is_complete', true)
        .gte('completed_at', start + 'T00:00:00Z')
        .lte('completed_at', end   + 'T23:59:59Z')

      if (rErr) throw rErr
      const responses = responsesData || []
      const totalResponses = responses.length

      // Günlük katılım dağılımı
      const dayMap: Record<string, number> = {}
      responses.forEach((r: any) => {
        const d = (r.completed_at || r.started_at || '').slice(0, 10)
        if (d) dayMap[d] = (dayMap[d] || 0) + 1
      })

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

      const surveyType = detectType(surveyData.title)
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

      // Aylık hedef kota ve hata payı
      const targetCount = Math.ceil(sampleSize / 12)
      const completionRate = targetCount ? Math.round((totalResponses / targetCount) * 100) : 0
      const progressPercent = Math.min(completionRate, 100)
      const marginOfError = calculateMarginOfError(populationSize, totalResponses)

      // Soruları çek
      const { data: questionsData } = await supabase
        .from('questions')
        .select('id, title, type, options')
        .eq('survey_id', surveyIdParam)
        .order('order_index')

      const questionsList = questionsData || []
      const radioQuestions = questionsList.filter(q => q.type === 'radio' || q.type === 'checkbox')

      // Demografi Sorularını Bul
      const genderQ = radioQuestions.find(q => {
        const t = q.title.toLowerCase()
        return t.includes('cinsiyet') || t.includes('gender')
      })
      const eduQ = radioQuestions.find(q => {
        const t = q.title.toLowerCase()
        return t.includes('eğitim') || t.includes('öğrenim') || t.includes('mezun') || t.includes('okul')
      })
      const ageQ = radioQuestions.find(q => {
        const t = q.title.toLowerCase()
        return t.includes('yaş') || t.includes('age')
      })
      const unitQ = radioQuestions.find(q => {
        const t = q.title.toLowerCase()
        return t.includes('birim') || t.includes('departman') || t.includes('görev') || t.includes('unvan') || t.includes('rol')
      })

      // Ana memnuniyet seçenek setini bul
      const optionCounts: Record<string, { count: number, options: string[] }> = {}
      radioQuestions.forEach(q => {
        // Demografi sorularını genel memnuniyet hesaplamasından hariç tutalım
        if (q.id === genderQ?.id || q.id === eduQ?.id || q.id === ageQ?.id || q.id === unitQ?.id) return
        if (!q.options || q.options.length < 3) return
        const key = JSON.stringify(q.options)
        if (!optionCounts[key]) optionCounts[key] = { count: 0, options: q.options }
        optionCounts[key].count++
      })
      
      let mainOptions: string[] = []
      let maxCount = 0
      Object.values(optionCounts).forEach(item => {
        if (item.count > maxCount) {
          maxCount = item.count
          mainOptions = item.options
        }
      })

      const targetQuestions = radioQuestions.filter(q => {
        if (q.id === genderQ?.id || q.id === eduQ?.id || q.id === ageQ?.id || q.id === unitQ?.id) return false
        if (!q.options) return false
        return JSON.stringify(q.options) === JSON.stringify(mainOptions)
      })

      const weights: Record<string, number> = {}
      mainOptions.forEach((opt: string, idx: number) => {
        weights[opt] = getOptionWeight(opt, idx, mainOptions.length)
      })

      let questionBreakdown: { label: string; score: number }[] = []
      let genderDist: DemographicDistribution[] = []
      let educationDist: DemographicDistribution[] = []
      let ageDist: DemographicDistribution[] = []
      let unitDist: DemographicDistribution[] = []

      if (responses.length > 0 && radioQuestions.length > 0) {
        // Yanıt cevaplarını çek
        const { data: answersData } = await supabase
          .from('response_answers')
          .select('question_id, answer')
          .in('response_id', responses.map(r => r.id))

        const answersList = answersData || []

        // Soru bazlı memnuniyet hesapla
        questionBreakdown = targetQuestions.map(q => {
          let totalScore = 0
          let count = 0
          
          const qAnswers = answersList.filter((a: any) => a.question_id === q.id)
          qAnswers.forEach((ans: any) => {
            const val = getAnswerValue(ans)
            if (mainOptions.includes(val)) {
              totalScore += weights[val]
              count++
            }
          })
          
          const score = count > 0 ? Math.round((totalScore / (count * 4)) * 100) : 0
          return {
            label: stripQuestionPrefix(q.title),
            score
          }
        })

        // Demografi oranlarını hesapla
        const calcDemographics = (q: any): DemographicDistribution[] => {
          if (!q || !q.options || q.options.length === 0) return []
          const counts: Record<string, number> = {}
          q.options.forEach((opt: string) => counts[opt] = 0)
          let qTotal = 0

          const qAnswers = answersList.filter((a: any) => a.question_id === q.id)
          qAnswers.forEach((ans: any) => {
            const val = getAnswerValue(ans)
            const matchedOpt = q.options.find((opt: string) => opt.toLowerCase().trim() === val.toLowerCase().trim())
            if (matchedOpt) {
              counts[matchedOpt]++
              qTotal++
            } else if (q.options.includes(val)) {
              counts[val]++
              qTotal++
            }
          })

          if (qTotal === 0) return []
          return q.options.map((opt: string) => ({
            name: opt,
            count: counts[opt],
            percent: Math.round((counts[opt] / qTotal) * 100)
          })).filter((item: any) => item.count > 0)
        }

        genderDist = calcDemographics(genderQ)
        educationDist = calcDemographics(eduQ)
        ageDist = calcDemographics(ageQ)
        unitDist = calcDemographics(unitQ)
      } else {
        questionBreakdown = targetQuestions.map(q => ({
          label: stripQuestionPrefix(q.title),
          score: 0
        }))
      }

      return {
        tenantId, tenantName: tenant.name, surveyTitle: surveyData.title,
        totalResponses, completionRate, targetCount, progressPercent,
        dailyData, questionBreakdown, surveyType, periodType: 'monthly',
        populationSize, sampleSize, marginOfError,
        genderDist, educationDist, ageDist, unitDist
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
      // Kurum A için anket ID'sini bul
      const { data: sAData } = await supabase
        .from('surveys')
        .select('id')
        .eq('tenant_id', tenantA)
        .eq('title', selectedSurveyTitle)
        .single()

      // Kurum B için anket ID'sini bul
      const { data: sBData } = await supabase
        .from('surveys')
        .select('id')
        .eq('tenant_id', tenantB)
        .eq('title', selectedSurveyTitle)
        .single()

      if (!sAData || !sBData) {
        setError('Seçilen anket iki kurumda da tam olarak eşleşmedi.')
        setLoading(false)
        return
      }

      const [sA, sB] = await Promise.all([
        fetchStats(tenantA, sAData.id),
        fetchStats(tenantB, sBData.id),
      ])
      if (!sA && !sB) { setError('Seçilen kriterlere göre veri bulunamadı.'); return }
      setStatsA(sA); setStatsB(sB)
    } catch (e: any) {
      setError(e.message || 'Veriler yüklenirken hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  // ── Hesaplamalı Özellikler ──────────────────────────────────────────────────
  
  // Ortalama Memnuniyet Skorları
  const avgSatisfactionA = useMemo(() => {
    if (!statsA || statsA.questionBreakdown.length === 0) return 0
    return Math.round(statsA.questionBreakdown.reduce((acc, q) => acc + q.score, 0) / statsA.questionBreakdown.length)
  }, [statsA])

  const avgSatisfactionB = useMemo(() => {
    if (!statsB || statsB.questionBreakdown.length === 0) return 0
    return Math.round(statsB.questionBreakdown.reduce((acc, q) => acc + q.score, 0) / statsB.questionBreakdown.length)
  }, [statsB])

  // Benchmarking Analizi (Güçlü ve Gelişime Açık Alanlar)
  const benchmarkInsights = useMemo(() => {
    if (!statsA || !statsB) return null
    const aQs = statsA.questionBreakdown || []
    const bQs = statsB.questionBreakdown || []
    
    const superiorA: { label: string; scoreA: number; scoreB: number; diff: number }[] = []
    const superiorB: { label: string; scoreA: number; scoreB: number; diff: number }[] = []
    const commonImprovement: { label: string; scoreA: number; scoreB: number }[] = []
    const balanced: { label: string; scoreA: number; scoreB: number; diff: number }[] = []
    
    aQs.forEach(q => {
      const match = bQs.find(x => x.label === q.label)
      const scoreB = match ? match.score : 0
      const diff = q.score - scoreB
      
      if (diff >= 8) {
        superiorA.push({ label: q.label, scoreA: q.score, scoreB, diff })
      } else if (diff <= -8) {
        superiorB.push({ label: q.label, scoreA: q.score, scoreB, diff: Math.abs(diff) })
      }
      
      if (q.score < 65 && scoreB < 65) {
        commonImprovement.push({ label: q.label, scoreA: q.score, scoreB })
      }
      
      if (Math.abs(diff) <= 3) {
        balanced.push({ label: q.label, scoreA: q.score, scoreB, diff })
      }
    })
    
    return { superiorA, superiorB, commonImprovement, balanced }
  }, [statsA, statsB])

  // Radar verisi (Soru bazlı kıyaslama)
  const radarData = useMemo(() => {
    if (!statsA || !statsB) return []
    const p1Qs = statsA.questionBreakdown || []
    const p2Qs = statsB.questionBreakdown || []
    
    return p1Qs.map(q => {
      const match = p2Qs.find(x => x.label === q.label)
      return {
        subject: q.label.length > 25 ? q.label.slice(0, 25) + '...' : q.label,
        A: q.score,
        B: match ? match.score : 0,
      }
    })
  }, [statsA, statsB])

  // Günlük katılım trend verisi
  const lineData = useMemo(() => {
    if (!statsA && !statsB) return []
    const base = statsA?.dailyData || statsB?.dailyData || []
    return base.map((d, i) => ({
      date: d.date,
      A: statsA?.dailyData[i]?.count ?? 0,
      B: statsB?.dailyData[i]?.count ?? 0,
    }))
  }, [statsA, statsB])

  // Arama ve Sıralama Filtresi Uygulanmış Soru Listesi
  const filteredAndSortedQuestions = useMemo(() => {
    if (!statsA || !statsB) return []
    
    let result = statsA.questionBreakdown.map((q, idx) => {
      const match = statsB.questionBreakdown.find(x => x.label === q.label)
      const scoreB = match ? match.score : 0
      return {
        originalIdx: idx,
        label: q.label,
        scoreA: q.score,
        scoreB,
        diff: q.score - scoreB
      }
    })

    // Arama filtrelemesi
    if (searchTerm) {
      const s = searchTerm.toLowerCase().trim()
      result = result.filter(q => q.label.toLowerCase().includes(s))
    }

    // Sıralama
    if (sortConfig !== null) {
      result.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? -1 : 1
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? 1 : -1
        }
        return 0
      })
    }

    return result
  }, [statsA, statsB, searchTerm, sortConfig])

  const requestSort = (key: 'label' | 'scoreA' | 'scoreB' | 'diff') => {
    let direction: 'ascending' | 'descending' = 'ascending'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending'
    }
    setSortConfig({ key, direction })
  }

  // PDF Export Fonksiyonu
  const exportPDF = async () => {
    const element = document.getElementById('comparison-print-area')
    if (!element) return

    setExportingPDF(true)
    element.classList.add('print-pdf-mode')
    
    const opt = {
      margin:       [10, 10, 10, 10],
      filename:     `Kurum_Karsilastirma_Raporu_${statsA?.tenantName}_vs_${statsB?.tenantName}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { 
        scale: 2, 
        useCORS: true, 
        backgroundColor: '#030712',
        letterRendering: true,
        logging: false
      },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak:    { mode: ['css', 'legacy'] }
    }

    try {
      // @ts-ignore
      await html2pdf().set(opt).from(element).save()
    } catch (err) {
      console.error('PDF Export Error:', err)
    } finally {
      element.classList.remove('print-pdf-mode')
      setExportingPDF(false)
    }
  }

  const tenantAName = tenants.find(t => t.id === tenantA)?.name || 'Kurum A'
  const tenantBName = tenants.find(t => t.id === tenantB)?.name || 'Kurum B'

  return (
    <div className="animate-in space-y-8">
      {/* ── PDF Print Styles ── */}
      <style>{`
        .print-pdf-mode {
          background-color: #030712 !important;
          color: #f1f5f9 !important;
          padding: 8mm !important;
          border-radius: 0 !important;
        }
        .print-pdf-mode .pdf-hidden {
          display: none !important;
        }
        .print-pdf-mode .card {
          background-color: #0f172a !important;
          border-color: #1e293b !important;
          box-shadow: none !important;
        }
        .print-pdf-mode .recharts-responsive-container {
          height: 180px !important;
        }
        .print-pdf-mode .page-break-before {
          page-break-before: always;
          margin-top: 15px;
        }
      `}</style>

      {/* ── Başlık ── */}
      <div className="page-header flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/10">
            <GitCompare className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">Kurum Karşılaştırma</h1>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20 font-mono pdf-hidden">
                v2.0 (Canlı Veri)
              </span>
            </div>
            <p className="page-subtitle">İki kurumun anket performansını, soru skorlarını ve demografik yapılarını bilimsel metotlarla kıyaslayın</p>
          </div>
        </div>
        {statsA && statsB && (
          <button 
            onClick={exportPDF} 
            disabled={exportingPDF}
            className="btn-md btn-primary gap-2 shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 shrink-0 self-start md:self-center"
          >
            {exportingPDF ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Rapor Hazırlanıyor...</>
            ) : (
              <><Download className="w-4 h-4" /> Kıyaslama Raporu (PDF)</>
            )}
          </button>
        )}
      </div>

      {/* ── Filtre Paneli ── */}
      <div className="card p-6 space-y-5">
        <h2 className="text-sm font-bold text-dark-300 uppercase tracking-wider flex items-center gap-2">
          <span className="w-1.5 h-4 bg-gradient-to-b from-indigo-500 to-amber-500 rounded-full inline-block" />
          Karşılaştırma Kriterleri
        </h2>

        {/* Kurum Seçimleri */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Kurum A */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs font-semibold text-dark-300">
              <span className="w-3 h-3 rounded-full bg-indigo-500 inline-block shadow-sm" />
              Kurum A Seçin
            </label>
            <select
              value={tenantA}
              onChange={e => { setTenantA(e.target.value); setStatsA(null); setStatsB(null) }}
              className="input w-full bg-dark-950 border-indigo-500/30 focus:border-indigo-500 text-sm h-11 transition-all"
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
              <span className="w-3 h-3 rounded-full bg-amber-500 inline-block shadow-sm" />
              Kurum B Seçin
            </label>
            <select
              value={tenantB}
              onChange={e => { setTenantB(e.target.value); setStatsA(null); setStatsB(null) }}
              className="input w-full bg-dark-950 border-amber-500/30 focus:border-amber-500 text-sm h-11 transition-all"
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
            <label className="text-xs font-semibold text-dark-300">Ortak Anket Seçin</label>
            <select
              value={selectedSurveyTitle}
              onChange={e => { setSelectedSurveyTitle(e.target.value); setStatsA(null); setStatsB(null) }}
              className="input w-full bg-dark-950 text-sm h-11 focus:border-indigo-500"
              disabled={surveys.length === 0}
            >
              <option value="">— Ortak bir anket seçin —</option>
              {surveys.map((s, idx) => (
                <option key={idx} value={s.title}>{s.title}</option>
              ))}
            </select>
            {surveys.length === 0 && (tenantA || tenantB) && (
              <p className="text-[10px] text-dark-500 italic">Ortak anketleri listelemek için iki kurumu da seçin</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-dark-300">Tarih / Dönem Seçin</label>
            <select
              value={period}
              onChange={e => { setPeriod(e.target.value); setStatsA(null); setStatsB(null) }}
              className="input w-full bg-dark-950 text-sm h-11 focus:border-indigo-500"
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
              <AlertCircle className="w-3.5 h-3.5 text-indigo-400" />
              Karşılaştırmak için iki farklı kurum ve ortak bir anket seçin
            </p>
          )}
          <button
            onClick={handleCompare}
            disabled={!canCompare || loading}
            className="btn-md btn-primary ml-auto gap-2 shadow-glow disabled:opacity-50 disabled:cursor-not-allowed h-11 px-6 text-sm"
          >
            {loading
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Analiz Ediliyor...</>
              : <><GitCompare className="w-4 h-4" /> Kıyasla & Analiz Et</>}
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

      {/* ── Sonuçlar (GERÇEK VERİ) ── */}
      {!loading && (statsA || statsB) && (
        <div className="space-y-8" id="comparison-print-area">
          
          {/* Rapor PDF Başlık Bandı (Sadece PDF İhracında Görünür) */}
          <div className="hidden print-pdf-mode:block border-b border-dark-800 pb-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white uppercase tracking-wider">KURUM KARŞILAŞTIRMA DEĞERLENDİRME RAPORU</h2>
                <p className="text-xs text-dark-400 mt-0.5">Karşılaştırma Anketi: {selectedSurveyTitle} · Dönem: {PERIOD_OPTIONS.find(p => p.value === period)?.label}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-dark-300 font-bold">{new Date().toLocaleDateString('tr-TR')}</p>
                <p className="text-[10px] text-dark-500">Süper Admin Paneli Tarafından Oluşturuldu</p>
              </div>
            </div>
          </div>

          {/* Başlık Bilgi Şeridi */}
          <div className="flex items-center gap-3 flex-wrap pdf-hidden">
            <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${COLORS.A.badge}`}>
              ● {tenantAName}
            </span>
            <ArrowRight className="w-4 h-4 text-dark-600" />
            <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${COLORS.B.badge}`}>
              ● {tenantBName}
            </span>
            <span className="ml-auto text-xs text-dark-400 bg-dark-900 px-3 py-1.5 rounded-xl border border-dark-800 font-medium">
              {selectedSurveyTitle} · {PERIOD_OPTIONS.find(p => p.value === period)?.label}
            </span>
          </div>

          {/* ── Dairesel Memnuniyet Dials ve Temsil İstatistikleri (Yan Yana) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[
              { stats: statsA, color: COLORS.A, label: 'A', overall: avgSatisfactionA, name: tenantAName },
              { stats: statsB, color: COLORS.B, label: 'B', overall: avgSatisfactionB, name: tenantBName },
            ].map(({ stats, color, label, overall, name }) => (
              <div key={label} className={`card p-6 flex flex-col md:flex-row items-center gap-6 border-l-4 ${label === 'A' ? 'border-l-indigo-500' : 'border-l-amber-500'} bg-gradient-to-br from-dark-900/40 to-dark-950/20`}>
                
                {/* Circular Progress Gauge */}
                <div className="flex flex-col items-center justify-center shrink-0">
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="42" stroke="rgba(30, 41, 59, 0.6)" strokeWidth="8" fill="transparent" />
                      <circle 
                        cx="50" cy="50" r="42" 
                        stroke={color.primary} 
                        strokeWidth="8" 
                        fill="transparent" 
                        strokeDasharray={263.8} 
                        strokeDashoffset={263.8 - (263.8 * overall) / 100}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center">
                      <span className="text-3xl font-black text-white font-display">%{overall}</span>
                      <span className="text-[9px] text-dark-400 font-bold uppercase tracking-wide">Endeks</span>
                    </div>
                  </div>
                  <p className="text-xs font-black text-dark-100 mt-2.5 text-center">{name}</p>
                </div>

                {/* Bilimsel Metrikler & Cochran Temsil Bilgisi */}
                {stats ? (
                  <div className="flex-1 space-y-4 w-full">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-dark-950/50 p-2.5 rounded-xl border border-dark-800/80">
                        <p className="text-[9px] text-dark-500 font-bold uppercase tracking-wider">Hata Payı (Margin of Error)</p>
                        <p className={`text-base font-extrabold ${stats.marginOfError <= 5 ? 'text-emerald-400' : stats.marginOfError <= 10 ? 'text-amber-400' : 'text-red-400'} mt-0.5`}>
                          ±%{stats.marginOfError}
                        </p>
                        <p className="text-[8px] text-dark-500 mt-0.5">95% Güven Düzeyi</p>
                      </div>

                      <div className="bg-dark-950/50 p-2.5 rounded-xl border border-dark-800/80">
                        <p className="text-[9px] text-dark-500 font-bold uppercase tracking-wider">Cochran Temsil Gücü</p>
                        <p className={`text-base font-extrabold ${stats.totalResponses >= stats.sampleSize ? 'text-indigo-400' : 'text-dark-300'} mt-0.5`}>
                          %{Math.min(100, Math.round((stats.totalResponses / stats.sampleSize) * 100))}
                        </p>
                        <p className="text-[8px] text-dark-500 mt-0.5">{stats.totalResponses}/{stats.sampleSize} Hedef Katılım</p>
                      </div>
                    </div>

                    {/* Hedef İlerleme Barı */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-semibold text-dark-400">
                        <span>Hedef Kota Ulaşımı ({stats.totalResponses} / {stats.targetCount || 0})</span>
                        <span className={color.text}>%{stats.progressPercent}</span>
                      </div>
                      <div className="w-full h-2 bg-dark-950 rounded-full overflow-hidden border border-dark-800/80">
                        <div 
                          className="h-full rounded-full transition-all duration-1000"
                          style={{ 
                            width: `${stats.progressPercent}%`, 
                            background: `linear-gradient(to right, ${color.primary}, ${color.light})` 
                          }}
                        />
                      </div>
                    </div>

                    {/* Populasyon Alt Detay */}
                    <div className="flex justify-between items-center text-[10px] text-dark-500 border-t border-dark-850 pt-2">
                      <span>Evren Geneli: <strong>{stats.populationSize.toLocaleString('tr-TR')}</strong></span>
                      <span>Bilimsel n: <strong>{stats.sampleSize.toLocaleString('tr-TR')}</strong></span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-dark-500 py-6 italic text-center w-full">Bu kurum için veri seti boş.</p>
                )}
              </div>
            ))}
          </div>

          {/* ── Kıyaslamalı Özet Metrik Kartları ── */}
          {statsA && statsB && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <MetricCard label="Toplam Katılım (Yanıt)" valA={statsA.totalResponses} valB={statsB.totalResponses} />
              <MetricCard label="Hata Payı (Düşük İyi)" valA={statsA.marginOfError} valB={statsB.marginOfError} unit="%" higherIsBetter={false} format={(v) => `±${v}`} />
              <MetricCard label="Kota Ulaşım Oranı (%)" valA={statsA.completionRate} valB={statsB.completionRate} unit="%" />
              <MetricCard label="Örneklem Gücü (%)" valA={Math.min(100, Math.round((statsA.totalResponses / statsA.sampleSize) * 100))} valB={Math.min(100, Math.round((statsB.totalResponses / statsB.sampleSize) * 100))} unit="%" />
            </div>
          )}

          {/* ── Interaktif Navigasyon Sekmeleri (PDF'de Hepsi Görünür) ── */}
          <div className="flex items-center gap-1.5 border-b border-dark-800 pb-px pdf-hidden">
            {[
              { id: 'general', label: 'Grafikler & Trend Analizi', icon: BarChart3 },
              { id: 'benchmarking', label: 'Güçlü & Zayıf Yönler (Benchmark)', icon: Award },
              { id: 'demographics', label: 'Demografik Profiller', icon: Users },
            ].map(tab => {
              const Icon = tab.icon
              const isSelected = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-bold transition-all border-b-2 -mb-px rounded-t-xl hover:bg-dark-900/40 ${isSelected ? 'border-indigo-500 text-indigo-300 bg-indigo-500/5' : 'border-transparent text-dark-400'}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* ── TAB 1: GRAFİKLER & TREND ANALİZİ ── */}
          {((activeTab === 'general') || exportingPDF) && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              
              {/* Radar Skor Karşılaştırması */}
              {radarData.length > 0 && (
                <div className="card p-6 space-y-4">
                  <h3 className="text-sm font-bold text-dark-200 flex items-center gap-2">
                    <Scale className="w-4 h-4 text-blue-400" />
                    Soru Bazlı Memnuniyet Dağılımı (Radar)
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData} margin={{ top: 5, right: 30, bottom: 5, left: 30 }}>
                        <PolarGrid stroke="#1e293b" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 8 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#475569', fontSize: 8 }} />
                        <Radar name={tenantAName} dataKey="A" stroke={COLORS.A.primary} fill={COLORS.A.primary} fillOpacity={0.15} strokeWidth={2} />
                        <Radar name={tenantBName} dataKey="B" stroke={COLORS.B.primary} fill={COLORS.B.primary} fillOpacity={0.15} strokeWidth={2} />
                        <Legend formatter={(v) => v} wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                        <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem', fontSize: 11 }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Günlük Katılım Trendi */}
              {lineData.length > 0 && (
                <div className="card p-6 space-y-4">
                  <h3 className="text-sm font-bold text-dark-200 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    14 Günlük Katılım Hacim Dağılımı
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={lineData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis dataKey="date" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} interval={2} />
                        <YAxis stroke="#475569" fontSize={9} tickLine={false} axisLine={false} />
                        <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem', fontSize: 11 }} />
                        <Legend formatter={(v) => v === 'A' ? tenantAName : tenantBName} wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                        <Line type="monotone" dataKey="A" stroke={COLORS.A.primary} strokeWidth={2} dot={{ r: 2, fill: COLORS.A.primary }} activeDot={{ r: 4 }} name="A" />
                        <Line type="monotone" dataKey="B" stroke={COLORS.B.primary} strokeWidth={2} dot={{ r: 2, fill: COLORS.B.primary }} activeDot={{ r: 4 }} name="B" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 2: BENCHMARKING (GÜÇLÜ & ZAYIF YÖNLER) ── */}
          {((activeTab === 'benchmarking') || exportingPDF) && benchmarkInsights && (
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${exportingPDF ? 'page-break-before' : ''}`}>
              
              {/* Kurum A'nın Belirgin Üstün Olduğu Konular */}
              <div className="bg-dark-900 border border-indigo-500/10 rounded-2xl p-5 space-y-4">
                <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block shadow shadow-indigo-500/50" />
                  {tenantAName} Üstün Performans Alanları (+8% Puan)
                </h4>
                {benchmarkInsights.superiorA.length === 0 ? (
                  <p className="text-xs text-dark-500 py-6 text-center italic">Bu kriterde eşleşen anket maddesi bulunmamaktadır.</p>
                ) : (
                  <div className="space-y-3">
                    {benchmarkInsights.superiorA.map((item, idx) => (
                      <div key={idx} className="bg-dark-950/40 p-3 rounded-xl border border-dark-850 flex items-start justify-between gap-4">
                        <p className="text-xs text-dark-200 leading-relaxed flex-1 font-medium">{item.label}</p>
                        <span className="text-[10px] font-black text-indigo-300 bg-indigo-500/15 border border-indigo-500/20 px-2 py-0.5 rounded-lg shrink-0 flex items-center gap-0.5">
                          <TrendingUp className="w-3 h-3" /> +{item.diff} Puan
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Kurum B'nin Belirgin Üstün Olduğu Konular */}
              <div className="bg-dark-900 border border-amber-500/10 rounded-2xl p-5 space-y-4">
                <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow shadow-amber-500/50" />
                  {tenantBName} Üstün Performans Alanları (+8% Puan)
                </h4>
                {benchmarkInsights.superiorB.length === 0 ? (
                  <p className="text-xs text-dark-500 py-6 text-center italic">Bu kriterde eşleşen anket maddesi bulunmamaktadır.</p>
                ) : (
                  <div className="space-y-3">
                    {benchmarkInsights.superiorB.map((item, idx) => (
                      <div key={idx} className="bg-dark-950/40 p-3 rounded-xl border border-dark-850 flex items-start justify-between gap-4">
                        <p className="text-xs text-dark-200 leading-relaxed flex-1 font-medium">{item.label}</p>
                        <span className="text-[10px] font-black text-amber-300 bg-amber-500/15 border border-amber-500/20 px-2 py-0.5 rounded-lg shrink-0 flex items-center gap-0.5">
                          <TrendingUp className="w-3 h-3" /> +{item.diff} Puan
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ortak İyileştirilmesi Gereken Alanlar */}
              <div className="bg-dark-900 border border-red-500/10 rounded-2xl p-5 space-y-4">
                <h4 className="text-xs font-bold text-red-300 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block shadow shadow-red-500/50" />
                  Ortak Zayıf & İyileştirilmesi Gereken Alanlar (Kritik &lt;%65)
                </h4>
                {benchmarkInsights.commonImprovement.length === 0 ? (
                  <p className="text-xs text-dark-500 py-6 text-center italic">İki kurumun da memnuniyeti %65'in altında olan ortak bir maddesi yoktur.</p>
                ) : (
                  <div className="space-y-3">
                    {benchmarkInsights.commonImprovement.map((item, idx) => (
                      <div key={idx} className="bg-dark-950/40 p-3 rounded-xl border border-dark-850 space-y-2">
                        <p className="text-xs text-dark-200 leading-relaxed font-medium">{item.label}</p>
                        <div className="flex items-center gap-4 text-[10px] font-bold">
                          <span className="text-indigo-400">A Skoru: %{item.scoreA}</span>
                          <span className="text-amber-400">B Skoru: %{item.scoreB}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Benzer Memnuniyet Düzeyinde Kalınan Alanlar */}
              <div className="bg-dark-900 border border-slate-500/10 rounded-2xl p-5 space-y-4">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" />
                  Stabil / Benzer Düzeyde Kalınan Alanlar (±3% Puan)
                </h4>
                {benchmarkInsights.balanced.length === 0 ? (
                  <p className="text-xs text-dark-500 py-6 text-center italic">İki kurum arasında başa baş memnuniyette olan anket maddesi bulunamadı.</p>
                ) : (
                  <div className="space-y-3">
                    {benchmarkInsights.balanced.map((item, idx) => (
                      <div key={idx} className="bg-dark-950/40 p-3 rounded-xl border border-dark-850 flex items-start justify-between gap-4">
                        <p className="text-xs text-dark-200 leading-relaxed flex-1 font-medium">{item.label}</p>
                        <span className="text-[10px] font-bold text-dark-300 bg-dark-800 px-2 py-0.5 rounded-lg shrink-0">
                          Fark: {item.diff > 0 ? '+' : ''}{item.diff} Puan
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TAB 3: DEMOGRAFİK PROFİLLER ── */}
          {((activeTab === 'demographics') || exportingPDF) && (
            <div className={`space-y-6 ${exportingPDF ? 'page-break-before' : ''}`}>
              
              {/* Demografi Yoksa Bildiri */}
              {(!statsA?.genderDist.length && !statsA?.educationDist.length && !statsA?.ageDist.length && !statsA?.unitDist.length) ? (
                <div className="card p-12 text-center text-dark-500 italic">
                  <Users className="w-10 h-10 mx-auto mb-3 text-dark-700" />
                  Bu anket tipinde demografik veri (Cinsiyet, Eğitim, Yaş, Birim) bulunamadı.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Cinsiyet Karşılaştırma */}
                  {(statsA?.genderDist.length || statsB?.genderDist.length) && (
                    <div className="card p-5 space-y-4">
                      <h4 className="text-xs font-bold text-dark-200 uppercase tracking-wider flex items-center gap-2">
                        <Users className="w-4 h-4 text-purple-400" /> Cinsiyet Dağılımı Karşılaştırması
                      </h4>
                      <div className="space-y-4">
                        {Array.from(new Set([
                          ...(statsA?.genderDist.map(g => g.name) || []),
                          ...(statsB?.genderDist.map(g => g.name) || [])
                        ])).map((name, idx) => {
                          const valA = statsA?.genderDist.find(g => g.name === name)?.percent || 0
                          const valB = statsB?.genderDist.find(g => g.name === name)?.percent || 0
                          return (
                            <div key={idx} className="space-y-2">
                              <p className="text-xs text-dark-300 font-bold">{name}</p>
                              
                              {/* Kurum A */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-[9px] text-dark-400">
                                  <span>{tenantAName}</span>
                                  <span>%{valA}</span>
                                </div>
                                <div className="w-full h-2 bg-dark-950 rounded-full overflow-hidden border border-dark-900">
                                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${valA}%` }} />
                                </div>
                              </div>

                              {/* Kurum B */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-[9px] text-dark-400">
                                  <span>{tenantBName}</span>
                                  <span>%{valB}</span>
                                </div>
                                <div className="w-full h-2 bg-dark-950 rounded-full overflow-hidden border border-dark-900">
                                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${valB}%` }} />
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Yaş Dağılımı */}
                  {(statsA?.ageDist.length || statsB?.ageDist.length) && (
                    <div className="card p-5 space-y-4">
                      <h4 className="text-xs font-bold text-dark-200 uppercase tracking-wider flex items-center gap-2">
                        <Users className="w-4 h-4 text-emerald-400" /> Yaş Grubu Dağılımı
                      </h4>
                      <div className="space-y-4">
                        {Array.from(new Set([
                          ...(statsA?.ageDist.map(g => g.name) || []),
                          ...(statsB?.ageDist.map(g => g.name) || [])
                        ])).map((name, idx) => {
                          const valA = statsA?.ageDist.find(g => g.name === name)?.percent || 0
                          const valB = statsB?.ageDist.find(g => g.name === name)?.percent || 0
                          return (
                            <div key={idx} className="space-y-2">
                              <p className="text-xs text-dark-300 font-bold">{name}</p>
                              
                              {/* Kurum A */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-[9px] text-dark-400">
                                  <span>{tenantAName}</span>
                                  <span>%{valA}</span>
                                </div>
                                <div className="w-full h-2 bg-dark-950 rounded-full overflow-hidden border border-dark-900">
                                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${valA}%` }} />
                                </div>
                              </div>

                              {/* Kurum B */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-[9px] text-dark-400">
                                  <span>{tenantBName}</span>
                                  <span>%{valB}</span>
                                </div>
                                <div className="w-full h-2 bg-dark-950 rounded-full overflow-hidden border border-dark-900">
                                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${valB}%` }} />
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Eğitim Dağılımı */}
                  {(statsA?.educationDist.length || statsB?.educationDist.length) && (
                    <div className="card p-5 space-y-4">
                      <h4 className="text-xs font-bold text-dark-200 uppercase tracking-wider flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-400" /> Eğitim Durumu Dağılımı
                      </h4>
                      <div className="space-y-4">
                        {Array.from(new Set([
                          ...(statsA?.educationDist.map(g => g.name) || []),
                          ...(statsB?.educationDist.map(g => g.name) || [])
                        ])).map((name, idx) => {
                          const valA = statsA?.educationDist.find(g => g.name === name)?.percent || 0
                          const valB = statsB?.educationDist.find(g => g.name === name)?.percent || 0
                          return (
                            <div key={idx} className="space-y-2">
                              <p className="text-xs text-dark-300 font-bold">{name}</p>
                              
                              {/* Kurum A */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-[9px] text-dark-400">
                                  <span>{tenantAName}</span>
                                  <span>%{valA}</span>
                                </div>
                                <div className="w-full h-2 bg-dark-950 rounded-full overflow-hidden border border-dark-900">
                                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${valA}%` }} />
                                </div>
                              </div>

                              {/* Kurum B */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-[9px] text-dark-400">
                                  <span>{tenantBName}</span>
                                  <span>%{valB}</span>
                                </div>
                                <div className="w-full h-2 bg-dark-950 rounded-full overflow-hidden border border-dark-900">
                                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${valB}%` }} />
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Birim Görev Dağılımı */}
                  {(statsA?.unitDist.length || statsB?.unitDist.length) && (
                    <div className="card p-5 space-y-4">
                      <h4 className="text-xs font-bold text-dark-200 uppercase tracking-wider flex items-center gap-2">
                        <Users className="w-4 h-4 text-amber-400" /> Görev / Birim Dağılımı
                      </h4>
                      <div className="space-y-4">
                        {Array.from(new Set([
                          ...(statsA?.unitDist.map(g => g.name) || []),
                          ...(statsB?.unitDist.map(g => g.name) || [])
                        ])).map((name, idx) => {
                          const valA = statsA?.unitDist.find(g => g.name === name)?.percent || 0
                          const valB = statsB?.unitDist.find(g => g.name === name)?.percent || 0
                          return (
                            <div key={idx} className="space-y-2">
                              <p className="text-xs text-dark-300 font-bold">{name}</p>
                              
                              {/* Kurum A */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-[9px] text-dark-400">
                                  <span>{tenantAName}</span>
                                  <span>%{valA}</span>
                                </div>
                                <div className="w-full h-2 bg-dark-950 rounded-full overflow-hidden border border-dark-900">
                                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${valA}%` }} />
                                </div>
                              </div>

                              {/* Kurum B */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-[9px] text-dark-400">
                                  <span>{tenantBName}</span>
                                  <span>%{valB}</span>
                                </div>
                                <div className="w-full h-2 bg-dark-950 rounded-full overflow-hidden border border-dark-900">
                                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${valB}%` }} />
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          )}

          {/* ── Soru Bazında Puan Farkı Karşılaştırma Listesi (Tablo) ── */}
          {statsA && statsB && (
            <div className={`card overflow-hidden ${exportingPDF ? 'page-break-before' : ''}`}>
              
              {/* Tablo Header ve Live Search */}
              <div className="p-5 border-b border-dark-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-dark-900/20">
                <div>
                  <h3 className="font-bold text-dark-100 text-sm uppercase tracking-wider">
                    Soru Düzeyi Karşılaştırmalı Memnuniyet Skor Farkları
                  </h3>
                  <p className="text-xs text-dark-400 mt-1">
                    Ortak anket maddelerinin iki kurum arasındaki gerçek memnuniyet skoru (%) kıyaslaması. Fark sütununa tıklayarak en yüksek/en düşük farkları listeleyebilirsiniz.
                  </p>
                </div>
                <div className="relative w-full sm:w-64 pdf-hidden">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-dark-500" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Soru maddelerinde ara..."
                    className="input w-full bg-dark-950 border-dark-800 focus:border-indigo-500 text-xs pl-9 h-9"
                  />
                </div>
              </div>

              {/* Tablo Gövdesi */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-dark-900 border-b border-dark-800 text-dark-400 text-xs font-semibold">
                    <tr>
                      <th 
                        onClick={() => requestSort('label')} 
                        className="px-6 py-4 cursor-pointer select-none hover:text-white transition-colors w-7/12"
                      >
                        <div className="flex items-center gap-1.5">
                          Ortak Değerlendirme Maddesi
                          {sortConfig?.key === 'label' && (sortConfig.direction === 'ascending' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                        </div>
                      </th>
                      <th 
                        onClick={() => requestSort('scoreA')} 
                        className="px-6 py-4 cursor-pointer select-none hover:text-white text-center transition-colors w-2/12"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          {tenantAName} Skoru
                          {sortConfig?.key === 'scoreA' && (sortConfig.direction === 'ascending' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                        </div>
                      </th>
                      <th 
                        onClick={() => requestSort('scoreB')} 
                        className="px-6 py-4 cursor-pointer select-none hover:text-white text-center transition-colors w-2/12"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          {tenantBName} Skoru
                          {sortConfig?.key === 'scoreB' && (sortConfig.direction === 'ascending' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                        </div>
                      </th>
                      <th 
                        onClick={() => requestSort('diff')} 
                        className="px-6 py-4 cursor-pointer select-none hover:text-white text-center transition-colors w-2/12"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          Puan Farkı (A - B)
                          {sortConfig?.key === 'diff' && (sortConfig.direction === 'ascending' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-850">
                    {filteredAndSortedQuestions.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-xs text-dark-500 italic">
                          Arama kriterinize uygun veya karşılaştırılabilir ortak bir anket maddesi bulunamadı.
                        </td>
                      </tr>
                    ) : (
                      filteredAndSortedQuestions.map((q, idx) => {
                        const diffText = `${q.diff > 0 ? '+' : ''}${q.diff} Puan`
                        const diffColor = q.diff > 0 
                          ? 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/10' 
                          : q.diff < 0 
                            ? 'text-amber-400 bg-amber-500/10 border border-amber-500/10' 
                            : 'text-dark-400 bg-dark-800'

                        return (
                          <tr key={idx} className="hover:bg-dark-900/30 transition-colors table-row">
                            <td className="px-6 py-3.5 text-dark-200">
                              <div className="font-semibold text-xs leading-relaxed max-w-xl">
                                {q.originalIdx + 1}. {q.label}
                              </div>
                            </td>
                            <td className="px-6 py-3.5 text-center">
                              <div className="space-y-1">
                                <span className="font-extrabold text-indigo-300">%{q.scoreA}</span>
                                <div className="w-16 h-1 bg-dark-950 rounded-full mx-auto overflow-hidden">
                                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${q.scoreA}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-3.5 text-center">
                              <div className="space-y-1">
                                <span className="font-extrabold text-amber-300">%{q.scoreB}</span>
                                <div className="w-16 h-1 bg-dark-950 rounded-full mx-auto overflow-hidden">
                                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${q.scoreB}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-3.5 text-center">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-lg ${diffColor}`}>
                                {q.diff > 0 && <TrendingUp className="w-3.5 h-3.5" />}
                                {q.diff < 0 && <TrendingDown className="w-3.5 h-3.5" />}
                                {diffText}
                              </span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Özet Karar Destek Paneli ── */}
          {statsA && statsB && (
            <div className="card p-6 bg-gradient-to-br from-dark-900 to-dark-950 border-dark-800">
              <h3 className="text-sm font-bold text-dark-200 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                Karşılaştırmalı Karar Destek Özeti
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                {(() => {
                  const winnerTotal = statsA.totalResponses >= statsB.totalResponses ? 'A' : 'B'
                  const winnerRate  = statsA.completionRate >= statsB.completionRate ? 'A' : 'B'
                  const winnerScore = avgSatisfactionA >= avgSatisfactionB ? 'A' : 'B'

                  const winnerNames = { A: tenantAName, B: tenantBName }
                  return [
                    { label: 'Daha Yüksek Katılım Verisi', winner: winnerTotal, desc: `${winnerTotal === 'A' ? statsA.totalResponses : statsB.totalResponses} Katılımcı` },
                    { label: 'Daha Başarılı Hedef Ulaşımı', winner: winnerRate, desc: `%${winnerRate === 'A' ? statsA.completionRate : statsB.completionRate} Ulaşım` },
                    { label: 'Genel Memnuniyet Lideri', winner: winnerScore, desc: `%${winnerScore === 'A' ? avgSatisfactionA : avgSatisfactionB} Ortalama` },
                  ].map(({ label, winner, desc }) => (
                    <div key={label} className={`rounded-xl p-4 border transition-all ${winner === 'A' ? 'bg-indigo-500/5 border-indigo-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
                      <p className="text-[9px] text-dark-500 uppercase tracking-wider mb-1 font-bold">{label}</p>
                      <p className={`font-extrabold text-sm ${winner === 'A' ? 'text-indigo-300' : 'text-amber-300'}`}>
                        {(winnerNames as any)[winner]}
                      </p>
                      <p className="text-[10px] text-dark-400 mt-1 font-semibold">{desc}</p>
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
        <div className="card p-16 text-center flex flex-col items-center gap-4 border-dashed border-dark-850">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-600/20 to-amber-500/20 rounded-2xl flex items-center justify-center border border-indigo-500/20 shadow-inner">
            <GitCompare className="w-8 h-8 text-indigo-400 animate-pulse" />
          </div>
          <div>
            <p className="text-dark-200 font-semibold mb-1">Karşılaştırma yapmak için kriterleri seçin</p>
            <p className="text-dark-500 text-sm max-w-md">İki farklı kurum, ortak bir değerlendirme anketi ve tarih dönemi seçerek kıyaslamayı başlatın</p>
          </div>
        </div>
      )}
    </div>
  )
}

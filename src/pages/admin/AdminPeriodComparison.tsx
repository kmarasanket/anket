import { useEffect, useState, useMemo } from 'react'
import { FileText, Download, Activity, Filter, Calendar, Users, TrendingUp, TrendingDown, ChevronRight, Award, AlertTriangle, ArrowRight } from 'lucide-react'
import html2pdf from 'html2pdf.js'
import { httpFrom } from '../../lib/supabaseHttp'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'

const getOptionWeight = (opt: string, index: number, totalOptions: number) => {
  const lower = opt.toLowerCase().trim()
  if (lower.includes('tamamen') && lower.includes('katıl')) return 4
  if (lower === 'katılıyorum') return 3
  if (lower === 'kararsızım') return 2
  if (lower === 'katılmıyorum') return 1
  if (lower.includes('kesinlikle') && lower.includes('katılmıyor')) return 0
  if (totalOptions === 5) return 4 - index
  return 0
}

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
]

export default function AdminPeriodComparison() {
  const { tenant } = useAuthStore()
  const { addNotification } = useNotificationStore()

  const [surveys, setSurveys] = useState<any[]>([])
  const [selectedSurveyId, setSelectedSurveyId] = useState<string>('')
  const [loadingSurveys, setLoadingSurveys] = useState(true)

  const [questions, setQuestions] = useState<any[]>([])
  const [responses, setResponses] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(false)

  // Dönem 1 ve Dönem 2 seçimleri
  const [period1Year, setPeriod1Year] = useState<string>('')
  const [period1Month, setPeriod1Month] = useState<string>('')
  const [period2Year, setPeriod2Year] = useState<string>('')
  const [period2Month, setPeriod2Month] = useState<string>('')

  // 1. Kuruma ait aktif anketleri yükle
  useEffect(() => {
    const loadSurveys = async () => {
      if (!tenant?.id) return
      setLoadingSurveys(true)
      try {
        const { data, error } = await httpFrom('surveys')
          .select('id, title')
          .eq('tenant_id', tenant.id)
          .order('created_at', { ascending: false })
          .execute()

        if (error) throw error
        setSurveys(data || [])
        if (data && data.length > 0) {
          setSelectedSurveyId(data[0].id)
        }
      } catch (err: any) {
        addNotification('Anketler yüklenirken hata oluştu: ' + (err.message || ''), 'error')
      } finally {
        setLoadingSurveys(false)
      }
    }
    loadSurveys()
  }, [tenant])

  // 2. Seçilen ankete ait soru ve cevapları yükle
  useEffect(() => {
    const loadSurveyData = async () => {
      if (!selectedSurveyId) return
      setLoadingData(true)
      try {
        const qQuestions = httpFrom('questions')
          .select('*')
          .eq('survey_id', selectedSurveyId)
          .order('order_index', { ascending: true })

        const qResponses = httpFrom('responses')
          .select('*, response_answers(*)')
          .eq('survey_id', selectedSurveyId)
          .eq('is_complete', 'true')
          .order('completed_at', { ascending: false })

        const [qRes, rRes] = await Promise.all([qQuestions.execute(), qResponses.execute()])

        if (qRes.error) throw qRes.error
        if (rRes.error) throw rRes.error

        setQuestions(qRes.data || [])
        const rawResponses = rRes.data || []
        setResponses(rawResponses.map((r: any) => ({ ...r, response_answers: r.response_answers || [] })))

        // Varsayılan dönem seçimlerini otomatik doldur (en son 2 farklı ay)
        const periods = new Set<string>()
        rawResponses.forEach((r: any) => {
          if (r.completed_at) {
            const d = new Date(r.completed_at)
            periods.add(`${d.getFullYear()}-${d.getMonth()}`)
          }
        })

        const sortedPeriods = Array.from(periods).sort((a, b) => {
          const [ay, am] = a.split('-').map(Number)
          const [by, bm] = b.split('-').map(Number)
          return by !== ay ? by - ay : bm - am // desc
        })

        if (sortedPeriods.length >= 2) {
          const [p2y, p2m] = sortedPeriods[0].split('-')
          const [p1y, p1m] = sortedPeriods[1].split('-')
          setPeriod2Year(p2y)
          setPeriod2Month(p2m)
          setPeriod1Year(p1y)
          setPeriod1Month(p1m)
        } else if (sortedPeriods.length === 1) {
          const [p2y, p2m] = sortedPeriods[0].split('-')
          setPeriod2Year(p2y)
          setPeriod2Month(p2m)
          setPeriod1Year('')
          setPeriod1Month('')
        } else {
          setPeriod1Year('')
          setPeriod1Month('')
          setPeriod2Year('')
          setPeriod2Month('')
        }
      } catch (err: any) {
        addNotification('Veriler yüklenirken hata oluştu: ' + (err.message || ''), 'error')
      } finally {
        setLoadingData(false)
      }
    }
    loadSurveyData()
  }, [selectedSurveyId])

  // Yanıtlardan mevcut yılları ve ayları çıkar
  const availablePeriods = useMemo(() => {
    const years = new Set<number>()
    const monthsByYear: Record<number, Set<number>> = {}

    responses.forEach(r => {
      if (r.completed_at) {
        const d = new Date(r.completed_at)
        const y = d.getFullYear()
        const m = d.getMonth()
        years.add(y)
        if (!monthsByYear[y]) monthsByYear[y] = new Set<number>()
        monthsByYear[y].add(m)
      }
    })

    const yearList = Array.from(years).sort((a, b) => b - a)
    const monthListByYear: Record<number, number[]> = {}
    Object.keys(monthsByYear).forEach((y: any) => {
      monthListByYear[Number(y)] = Array.from(monthsByYear[Number(y)]).sort((a, b) => a - b)
    })

    return { years: yearList, monthsByYear: monthListByYear }
  }, [responses])

  const findResponseAnswer = (response: any, question: any) => {
    if (!response.response_answers || response.response_answers.length === 0) return null
    return response.response_answers.find((a: any) => a.question_id === question.id) || null
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

  // Dönemsel Karşılaştırma Hesaplamaları
  const comparisonResults = useMemo(() => {
    if (questions.length === 0 || responses.length === 0) return null
    if (period1Year === '' || period1Month === '' || period2Year === '' || period2Month === '') return null

    const p1Y = Number(period1Year)
    const p1M = Number(period1Month)
    const p2Y = Number(period2Year)
    const p2M = Number(period2Month)

    // 1. Dönem yanıtları
    const p1Responses = responses.filter(r => {
      if (!r.completed_at) return false
      const d = new Date(r.completed_at)
      return d.getFullYear() === p1Y && d.getMonth() === p1M
    })

    // 2. Dönem yanıtları
    const p2Responses = responses.filter(r => {
      if (!r.completed_at) return false
      const d = new Date(r.completed_at)
      return d.getFullYear() === p2Y && d.getMonth() === p2M
    })

    const radioQuestions = questions.filter(q => q.type === 'radio' || q.type === 'checkbox')
    
    // Ana memnuniyet soru setini tespit et (seçenek sayısı 3'ten büyük, standart Likert ölçek)
    const optionCounts: Record<string, { count: number, options: string[] }> = {}
    radioQuestions.forEach(q => {
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
      if (!q.options) return false
      return JSON.stringify(q.options) === JSON.stringify(mainOptions)
    })

    const weights: Record<string, number> = {}
    mainOptions.forEach((opt: string, idx: number) => {
      weights[opt] = getOptionWeight(opt, idx, mainOptions.length)
    })

    // Soru bazında skorları hesapla
    const questionScores = targetQuestions.map(q => {
      const getScore = (resList: any[]) => {
        if (resList.length === 0) return null
        let totalScore = 0
        let answeredCount = 0
        
        resList.forEach(r => {
          const ans = findResponseAnswer(r, q)
          const val = getAnswerValue(ans)
          if (mainOptions.includes(val)) {
            totalScore += weights[val]
            answeredCount++
          }
        })
        
        if (answeredCount === 0) return null
        const maxScore = answeredCount * 4
        return Math.round((totalScore / maxScore) * 100)
      }

      const p1Score = getScore(p1Responses)
      const p2Score = getScore(p2Responses)
      const diff = p1Score !== null && p2Score !== null ? p2Score - p1Score : null

      return {
        id: q.id,
        title: stripQuestionPrefix(q.title),
        p1Score,
        p2Score,
        diff
      }
    })

    // Genel Memnuniyet Skoru
    const getGeneralScore = (scoreList: (number | null)[]) => {
      const valid = scoreList.filter((s): s is number => s !== null)
      if (valid.length === 0) return 0
      return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
    }

    const p1GenScore = getGeneralScore(questionScores.map(q => q.p1Score))
    const p2GenScore = getGeneralScore(questionScores.map(q => q.p2Score))
    const genDiff = p2GenScore - p1GenScore

    // İyileşen ve Gerileyen Alanlar
    const comparedQuestions = questionScores.filter(q => q.diff !== null) as { id: string, title: string, p1Score: number, p2Score: number, diff: number }[]
    
    const improvements = [...comparedQuestions]
      .filter(q => q.diff > 0)
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 3)

    const declines = [...comparedQuestions]
      .filter(q => q.diff < 0)
      .sort((a, b) => a.diff - b.diff) // En negatif olan ilk sırada
      .slice(0, 3)

    return {
      p1Count: p1Responses.length,
      p2Count: p2Responses.length,
      p1GenScore,
      p2GenScore,
      genDiff,
      questionScores,
      improvements,
      declines
    }
  }, [questions, responses, period1Year, period1Month, period2Year, period2Month])

  // PDF Olarak Dışarı Aktar
  const exportPDF = async () => {
    const element = document.getElementById('period-comparison-print-area')
    if (!element) return

    element.classList.add('print-pdf-mode')
    const opt = {
      margin: 10,
      filename: `Donemsel_Karsilastirma_Raporu_${tenant?.name || 'Kurum'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true, 
        letterRendering: true,
        logging: false
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] }
    }

    try {
      // @ts-ignore
      await html2pdf().set(opt).from(element).save()
    } catch (err) {
      console.error('PDF Export Error:', err)
    } finally {
      element.classList.remove('print-pdf-mode')
    }
  }

  const selectedSurvey = surveys.find(s => s.id === selectedSurveyId)

  return (
    <div className="animate-in space-y-6">
      
      {/* Üst Başlık */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Anket Dönemsel Karşılaştırma</h1>
          <p className="page-subtitle">İki farklı zaman dönemini seçip karşılaştırarak memnuniyet trendlerini analiz edin.</p>
        </div>
        {comparisonResults && (
          <button onClick={exportPDF} className="btn-md btn-primary gap-2 shrink-0">
            <Download className="w-4 h-4" /> Karşılaştırma Raporu (PDF)
          </button>
        )}
      </div>

      {/* Kontrol / Seçim Paneli */}
      <div className="card p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Anket Seçin */}
        <div className="lg:col-span-1">
          <label className="block text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">Anket Seçin</label>
          <select
            value={selectedSurveyId}
            onChange={e => setSelectedSurveyId(e.target.value)}
            disabled={loadingSurveys}
            className="input w-full bg-dark-900 border-dark-800 h-11 text-dark-100 disabled:opacity-50"
          >
            {loadingSurveys ? (
              <option>Anketler Yükleniyor...</option>
            ) : surveys.length === 0 ? (
              <option>Tanımlı Anket Bulunamadı</option>
            ) : (
              surveys.map(s => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))
            )}
          </select>
        </div>

        {/* 1. Dönem Seçin */}
        <div>
          <label className="block text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">1. Dönem (Eski)</label>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={period1Year}
              onChange={e => { setPeriod1Year(e.target.value); setPeriod1Month('') }}
              disabled={loadingData || !selectedSurveyId}
              className="input w-full bg-dark-900 border-dark-800 h-11 text-dark-100 text-sm"
            >
              <option value="">Yıl Seçin</option>
              {availablePeriods.years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select
              value={period1Month}
              onChange={e => setPeriod1Month(e.target.value)}
              disabled={loadingData || !period1Year}
              className="input w-full bg-dark-900 border-dark-800 h-11 text-dark-100 text-sm"
            >
              <option value="">Ay Seçin</option>
              {(availablePeriods.monthsByYear[Number(period1Year)] || []).map(m => (
                <option key={m} value={m}>{MONTH_NAMES[m]}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 2. Dönem Seçin */}
        <div>
          <label className="block text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">2. Dönem (Yeni / Kıyaslanan)</label>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={period2Year}
              onChange={e => { setPeriod2Year(e.target.value); setPeriod2Month('') }}
              disabled={loadingData || !selectedSurveyId}
              className="input w-full bg-dark-900 border-dark-800 h-11 text-dark-100 text-sm"
            >
              <option value="">Yıl Seçin</option>
              {availablePeriods.years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select
              value={period2Month}
              onChange={e => setPeriod2Month(e.target.value)}
              disabled={loadingData || !period2Year}
              className="input w-full bg-dark-900 border-dark-800 h-11 text-dark-100 text-sm"
            >
              <option value="">Ay Seçin</option>
              {(availablePeriods.monthsByYear[Number(period2Year)] || []).map(m => (
                <option key={m} value={m}>{MONTH_NAMES[m]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loadingData ? (
        <div className="p-12 text-center text-dark-400">Veriler yükleniyor ve hesaplanıyor...</div>
      ) : !comparisonResults ? (
        <div className="card p-12 text-center text-dark-400 border border-dashed border-dark-800">
          <Filter className="w-12 h-12 text-dark-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-dark-200">Karşılaştırma Yapabilmek İçin Dönem Seçin</h3>
          <p className="text-sm text-dark-500 mt-1.5 max-w-md mx-auto">
            Lütfen yukarıdaki menüden bir anket seçin ve karşılaştırma yapmak istediğiniz 2 farklı Yıl/Ay dönemini işaretleyin.
          </p>
        </div>
      ) : (
        <div className="space-y-6" id="period-comparison-print-area">
          
          <style>{`
            .print-pdf-mode {
              background-color: white !important;
              color: black !important;
              padding: 10mm !important;
            }
            .print-pdf-mode .card {
              border: 1px solid #cbd5e1 !important;
              background-color: white !important;
              color: black !important;
              box-shadow: none !important;
            }
            .print-pdf-mode h1, .print-pdf-mode h2, .print-pdf-mode h3, .print-pdf-mode h4, .print-pdf-mode p {
              color: black !important;
            }
            .print-pdf-mode .text-dark-50, .print-pdf-mode .text-dark-100, .print-pdf-mode .text-dark-200 {
              color: black !important;
            }
            .print-pdf-mode .text-dark-400, .print-pdf-mode .text-dark-500 {
              color: #475569 !important;
            }
            .print-pdf-mode .border-dark-800 {
              border-color: #e2e8f0 !important;
            }
            .print-pdf-mode .bg-dark-900, .print-pdf-mode .bg-dark-950 {
              background-color: #f8fafc !important;
            }
            .print-pdf-mode .table-row:hover {
              background-color: #f1f5f9 !important;
            }
            .print-pdf-mode .progress-bar-bg {
              background-color: #e2e8f0 !important;
            }
            .print-pdf-mode .pdf-hidden {
              display: none !important;
            }
          `}</style>

          {/* Rapor PDF Başlık Alanı (Sadece PDF'de görünecek şekilde) */}
          <div className="hidden print-pdf-mode:block border-b-2 border-primary-600 pb-4 mb-6">
            <h2 className="text-xl font-bold uppercase text-primary-600">Dönemsel Anket Karşılaştırma Raporu</h2>
            <div className="grid grid-cols-2 gap-4 text-xs mt-3">
              <div>Kurum: <strong>{tenant?.name}</strong></div>
              <div>Anket: <strong>{selectedSurvey?.title}</strong></div>
              <div>1. Dönem: <strong>{MONTH_NAMES[Number(period1Month)]} {period1Year}</strong> ({comparisonResults.p1Count} Katılımcı)</div>
              <div>2. Dönem: <strong>{MONTH_NAMES[Number(period2Month)]} {period2Year}</strong> ({comparisonResults.p2Count} Katılımcı)</div>
            </div>
          </div>

          {/* 1. ÖZET METRİK KARTLARI */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Katılımcı Karşılaştırma */}
            <div className="stat-card p-6 flex flex-col justify-between">
              <div>
                <p className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">Katılımcı Sayısı</p>
                <div className="flex items-baseline gap-4 mt-2">
                  <div>
                    <span className="text-3xl font-black text-dark-50">{comparisonResults.p2Count}</span>
                    <span className="text-xs text-dark-400 ml-1">2. Dönem</span>
                  </div>
                  <div className="text-dark-500">/</div>
                  <div>
                    <span className="text-lg font-bold text-dark-300">{comparisonResults.p1Count}</span>
                    <span className="text-xs text-dark-400 ml-1">1. Dönem</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-dark-800 flex items-center justify-between">
                <span className="text-xs text-dark-400">Katılım Değişimi:</span>
                <span className={`text-xs font-bold ${comparisonResults.p2Count >= comparisonResults.p1Count ? 'text-emerald-400' : 'text-red-400'}`}>
                  {comparisonResults.p2Count >= comparisonResults.p1Count ? '+' : ''}
                  {comparisonResults.p2Count - comparisonResults.p1Count} Kişi ({comparisonResults.p1Count > 0 ? Math.round(((comparisonResults.p2Count - comparisonResults.p1Count) / comparisonResults.p1Count) * 100) : 0}%)
                </span>
              </div>
            </div>

            {/* Genel Memnuniyet Skoru */}
            <div className="stat-card p-6 flex flex-col justify-between">
              <div>
                <p className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">Genel Memnuniyet Skoru</p>
                <div className="flex items-baseline gap-4 mt-2">
                  <div>
                    <span className="text-3xl font-black text-primary-400">%{comparisonResults.p2GenScore}</span>
                    <span className="text-xs text-dark-400 ml-1">2. Dönem</span>
                  </div>
                  <div className="text-dark-500">/</div>
                  <div>
                    <span className="text-lg font-bold text-dark-300">%{comparisonResults.p1GenScore}</span>
                    <span className="text-xs text-dark-400 ml-1">1. Dönem</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-dark-800 flex items-center justify-between">
                <span className="text-xs text-dark-400">Skor Farkı:</span>
                <div className="flex items-center gap-1">
                  {comparisonResults.genDiff > 0 ? (
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                  ) : comparisonResults.genDiff < 0 ? (
                    <TrendingDown className="w-4 h-4 text-red-400" />
                  ) : null}
                  <span className={`text-xs font-bold ${comparisonResults.genDiff > 0 ? 'text-emerald-400' : comparisonResults.genDiff < 0 ? 'text-red-400' : 'text-dark-400'}`}>
                    {comparisonResults.genDiff > 0 ? '+' : ''}
                    {comparisonResults.genDiff} Puan
                  </span>
                </div>
              </div>
            </div>

            {/* Özet Durum Paragrafı */}
            <div className="stat-card p-6 flex flex-col justify-between">
              <div>
                <p className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">Dönemsel Performans Özeti</p>
                <p className="text-xs text-dark-300 leading-relaxed mt-2.5">
                  <strong>{MONTH_NAMES[Number(period1Month)]} {period1Year}</strong> dönemine kıyasla, 
                  <strong> {MONTH_NAMES[Number(period2Month)]} {period2Year}</strong> döneminde 
                  genel memnuniyet skoru <strong>%{comparisonResults.p1GenScore}</strong> seviyesinden <strong>%{comparisonResults.p2GenScore}</strong> düzeyine 
                  {comparisonResults.genDiff > 0 ? ' yükselerek gelişim kaydetmiştir.' : comparisonResults.genDiff < 0 ? ' gerileyerek performans kaybı göstermiştir.' : ' sabit kalarak stabil seyretmiştir.'}
                </p>
              </div>
            </div>
          </div>

          {/* 2. KARAR DESTEK VE EYLEM PLANLAMA ALANLARI (Gelişen & Zayıflayan) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* EN ÇOK İYİLEŞEN 3 ALAN */}
            <div className="bg-dark-900 border border-emerald-500/20 rounded-2xl p-6">
              <h4 className="text-emerald-400 font-bold mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                En Çok Gelişim Gösteren Alanlar (Trend Up)
              </h4>
              
              {comparisonResults.improvements.length === 0 ? (
                <div className="p-6 text-center text-xs text-dark-500">
                  Bu iki dönem arasında skoru yükselen herhangi bir alan bulunamadı.
                </div>
              ) : (
                <div className="space-y-4">
                  {comparisonResults.improvements.map((q, i) => (
                    <div key={i} className="flex flex-col gap-1 pb-3 border-b border-dark-800 last:border-0 last:pb-0">
                      <div className="flex justify-between items-start gap-4">
                        <p className="text-xs text-dark-200 flex-1 leading-relaxed font-medium">{q.title}</p>
                        <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded flex items-center gap-1 shrink-0">
                          <TrendingUp className="w-3.5 h-3.5" /> +{q.diff}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] text-dark-400 mt-1">
                        <span>1. Dönem: %{q.p1Score}</span>
                        <ArrowRight className="w-3 h-3 text-dark-600" />
                        <span>2. Dönem: %{q.p2Score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* EN ÇOK GERİLEYEN 3 ALAN */}
            <div className="bg-dark-900 border border-red-500/20 rounded-2xl p-6">
              <h4 className="text-red-400 font-bold mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                Düzeltici Eylem Gereken Alanlar (Trend Down)
              </h4>
              
              {comparisonResults.declines.length === 0 ? (
                <div className="p-6 text-center text-xs text-dark-500">
                  Bu iki dönem arasında skoru düşen herhangi bir alan bulunamadı.
                </div>
              ) : (
                <div className="space-y-4">
                  {comparisonResults.declines.map((q, i) => (
                    <div key={i} className="flex flex-col gap-1 pb-3 border-b border-dark-800 last:border-0 last:pb-0">
                      <div className="flex justify-between items-start gap-4">
                        <p className="text-xs text-dark-200 flex-1 leading-relaxed font-medium">{q.title}</p>
                        <span className="text-xs font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded flex items-center gap-1 shrink-0">
                          <TrendingDown className="w-3.5 h-3.5" /> {q.diff}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] text-dark-400 mt-1">
                        <span>1. Dönem: %{q.p1Score}</span>
                        <ArrowRight className="w-3 h-3 text-dark-600" />
                        <span>2. Dönem: %{q.p2Score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 3. DETAYLI SORU KARŞILAŞTIRMA TABLOSU */}
          <div className="card overflow-hidden">
            <div className="p-5 border-b border-dark-800">
              <h3 className="font-semibold text-dark-100">Soru Bazında Karşılaştırma Detayları</h3>
              <p className="text-xs text-dark-400 mt-1">Her bir anket sorusunun iki dönem arasındaki skorsal dağılımı ve yüzde farkı.</p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-dark-900 border-b border-dark-800 text-dark-400 text-xs">
                  <tr>
                    <th className="px-6 py-4 font-medium w-1/2">Soru / Değerlendirme Maddesi</th>
                    <th className="px-6 py-4 font-medium text-center">1. Dönem Skoru</th>
                    <th className="px-6 py-4 font-medium text-center">2. Dönem Skoru</th>
                    <th className="px-6 py-4 font-medium text-center">Değişim / Fark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800">
                  {comparisonResults.questionScores.map((q, idx) => {
                    const diffVal = q.diff;
                    const diffText = diffVal !== null ? `${diffVal > 0 ? '+' : ''}${diffVal}%` : '-';
                    const diffColor = diffVal === null ? 'text-dark-500' 
                      : diffVal > 0 ? 'text-emerald-400 bg-emerald-500/10' 
                      : diffVal < 0 ? 'text-red-400 bg-red-500/10' 
                      : 'text-dark-400 bg-dark-800';

                    return (
                      <tr key={q.id} className="hover:bg-dark-900/30 transition-colors table-row">
                        <td className="px-6 py-4 text-dark-200">
                          <div className="font-medium text-xs leading-relaxed">
                            {idx + 1}. {q.title}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {q.p1Score !== null ? (
                            <div className="space-y-1">
                              <span className="font-bold text-dark-100">%{q.p1Score}</span>
                              <div className="w-16 h-1.5 bg-dark-800 rounded-full mx-auto overflow-hidden progress-bar-bg">
                                <div className="h-full bg-dark-400 rounded-full" style={{ width: `${q.p1Score}%` }}></div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-dark-500 italic text-xs">Veri Yok</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {q.p2Score !== null ? (
                            <div className="space-y-1">
                              <span className="font-bold text-primary-400">%{q.p2Score}</span>
                              <div className="w-16 h-1.5 bg-dark-800 rounded-full mx-auto overflow-hidden progress-bar-bg">
                                <div className="h-full bg-primary-500 rounded-full" style={{ width: `${q.p2Score}%` }}></div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-dark-500 italic text-xs">Veri Yok</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded ${diffColor}`}>
                            {diffVal !== null && diffVal > 0 && <TrendingUp className="w-3.5 h-3.5" />}
                            {diffVal !== null && diffVal < 0 && <TrendingDown className="w-3.5 h-3.5" />}
                            {diffText}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

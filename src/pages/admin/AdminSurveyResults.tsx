import { useEffect, useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Users, Download, Activity, LayoutList, X, Calendar, Filter, FileSpreadsheet, FileText, PieChart as PieChartIcon } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts'
import html2pdf from 'html2pdf.js'
import { httpFrom } from '../../lib/supabaseHttp'
import { formatDateTime } from '../../lib/utils'
import { useAuthStore } from '../../stores/authStore'

const getOptionWeight = (opt: string, index: number, totalOptions: number) => {
  const lower = opt.toLowerCase().trim()
  if (lower.includes('tamamen') && lower.includes('katıl')) return 4
  if (lower === 'katılıyorum') return 3
  if (lower === 'kararsızım') return 2
  if (lower === 'katılmıyorum') return 1
  if (lower.includes('kesinlikle') && lower.includes('katılmıyor')) return 0
  // Fallback
  if (totalOptions === 5) return 4 - index
  return 0
}

export default function AdminSurveyResults() {
  const { id } = useParams()
  const { tenant } = useAuthStore()
  const [survey, setSurvey] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [responses, setResponses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedResponse, setSelectedResponse] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'list' | 'report' | 'score_report' | 'chart_report' | 'exec_summary' | 'trend_report' | 'cross_tab' | 'word_cloud'>('list')
  const [crossCategoryQ, setCrossCategoryQ] = useState<string>('')
  const [crossTargetQ, setCrossTargetQ] = useState<string>('')
  const [trendTargetQ, setTrendTargetQ] = useState<string>('')

  // Rapor Ayarları (Sabit A4 - Dikey)

  const [filterMode, setFilterMode] = useState<'range' | 'month'>('month')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedYear, setSelectedYear] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    const loadResults = async () => {
      setLoading(true)
      try {
        // 1. Anket + Sorular paralel çek
        const qSurvey = httpFrom('surveys').select('*')
        qSurvey.eq('id', id!)

        const qQuestions = httpFrom('questions').select('*')
        qQuestions.eq('survey_id', id!)
        qQuestions.order('order_index', { ascending: true })

        const [surveyRes, questionsRes] = await Promise.all([
          qSurvey.execute(),
          qQuestions.execute()
        ])

        if (surveyRes.error) throw surveyRes.error
        if (questionsRes.error) throw questionsRes.error

        // Anket verisini state'e yükle
        const surveyData = Array.isArray(surveyRes.data) ? surveyRes.data[0] : surveyRes.data
        if (!surveyData) throw new Error('Anket bulunamadı (ID eşleşmedi)')
        setSurvey(surveyData)
        setQuestions(questionsRes.data || [])

        // 2. Yanıtları al (is_complete filtresi string olarak gönderiliyor - RLS uyumlu)
        const { data, error } = await httpFrom('responses')
          .select('*, response_answers(*)')
          .eq('survey_id', id!)
          .eq('is_complete', 'true')
          .order('completed_at', { ascending: false })
          .execute()

        if (error) {
          console.error('Responses fetch error:', error)
          throw error
        }
        const rawResponses = data || []
        console.log('Fetched responses:', rawResponses.length)
        setResponses(rawResponses.map((r: any) => ({ ...r, response_answers: r.response_answers || [] })))

      } catch (err) {
        console.error('Sonuçlar yüklenemedi:', err)
      } finally {
        setLoading(false)
      }
    }
    if (id) loadResults()
  }, [id])

  // Yanıtlardan mevcut yılları çıkar (dropdown için)
  const availableYears = useMemo(() => {
    const years = new Set<number>()
    responses.forEach(r => {
      if (r.completed_at) years.add(new Date(r.completed_at).getFullYear())
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [responses])

  // Seçili yıla ait ayları çıkar
  const availableMonths = useMemo(() => {
    if (!selectedYear) return []
    const months = new Set<number>()
    responses.forEach(r => {
      if (r.completed_at) {
        const d = new Date(r.completed_at)
        if (d.getFullYear() === Number(selectedYear)) months.add(d.getMonth())
      }
    })
    return Array.from(months).sort((a, b) => a - b)
  }, [responses, selectedYear])

  const MONTH_NAMES = [
    'Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
    'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'
  ]

  // Ay/Yıl seçilince tarih aralığını otomatik doldur
  const applyMonthFilter = (year: string, month: string) => {
    if (!year) { setDateFrom(''); setDateTo(''); return }
    const y = Number(year)
    const m = month !== '' ? Number(month) : null
    if (m !== null) {
      const from = new Date(y, m, 1)
      const to = new Date(y, m + 1, 0)
      setDateFrom(from.toISOString().split('T')[0])
      setDateTo(to.toISOString().split('T')[0])
    } else {
      setDateFrom(`${y}-01-01`)
      setDateTo(`${y}-12-31`)
    }
  }

  const handleYearChange = (year: string) => {
    setSelectedYear(year)
    setSelectedMonth('')
    applyMonthFilter(year, '')
  }

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month)
    applyMonthFilter(selectedYear, month)
  }

  // Tarih filtresi uygulanmış yanıtlar
  const filteredResponses = useMemo(() => {
    return responses.filter(r => {
      const dt = r.completed_at ? new Date(r.completed_at) : null
      if (!dt) return true
      if (dateFrom && dt < new Date(dateFrom)) return false
      if (dateTo) {
        const toDate = new Date(dateTo)
        toDate.setHours(23, 59, 59, 999)
        if (dt > toDate) return false
      }
      return true
    })
  }, [responses, dateFrom, dateTo])

  const itemsPerPage = 50
  const totalPages = Math.ceil(filteredResponses.length / itemsPerPage)

  useEffect(() => {
    setCurrentPage(1)
  }, [dateFrom, dateTo, selectedYear, selectedMonth])

  const paginatedResponses = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredResponses.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredResponses, currentPage])

  const getPageNumbers = () => {
    const pages = []
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
        pages.push(i)
      } else if (i === 2 || i === totalPages - 1) {
        pages.push('...')
      }
    }
    return pages.filter((item, index, self) => item !== '...' || self[index - 1] !== '...')
  }

  const findResponseAnswer = (response: any, question: any) => {
    if (!response.response_answers || response.response_answers.length === 0) return null
    const ansById = response.response_answers.find((a: any) => a.question_id === question.id)
    if (ansById) return ansById
    return null
  }

  // Sorudan cevap değerini oku (plain value veya {value:x} formatı desteklenir)
  const getAnswerValue = (answer: any): string => {
    if (answer == null) return '-'
    const raw = answer.answer
    if (raw == null || raw === '') return '-'
    // Eski format: { value: x }
    if (typeof raw === 'object' && !Array.isArray(raw) && 'value' in raw) {
      const v = raw.value
      if (v == null || v === '') return '-'
      return Array.isArray(v) ? v.join(', ') : String(v)
    }
    // Yeni format: düz değer
    if (Array.isArray(raw)) return raw.length === 0 ? '-' : raw.join(', ')
    return String(raw)
  }

  // Soru başlığındaki öneki temizle: "1-", "2.", "3) " → başlık metni
  const stripQuestionPrefix = (title: string): string => {
    return title.replace(/^\d+[-.)\s]+\s*/, '').trim()
  }

  // Rapor Tablosu Verisi (Sadece ana ölçeğe sahip "radio" ve "checkbox" soruları)
  const reportData = useMemo(() => {
    const radioQuestions = questions.filter(q => q.type === 'radio' || q.type === 'checkbox')
    
    // Soruları seçeneklerine göre grupla ve en çok kullanılan seçenek setini (ana anket ölçeği) bul
    const optionCounts: Record<string, { count: number, options: string[] }> = {}
    radioQuestions.forEach(q => {
      if (!q.options || q.options.length === 0) return
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

    // Sadece ana seçenek setine sahip soruları filtrele (Böylece demografik sorular hariç tutulur)
    const targetQuestions = radioQuestions.filter(q => {
      if (!q.options) return false
      return JSON.stringify(q.options) === JSON.stringify(mainOptions)
    })
    
    const options = mainOptions
    
    const rows = targetQuestions.map(q => {
      const counts: Record<string, number> = {}
      options.forEach((opt: string) => counts[opt] = 0)
      
      filteredResponses.forEach(r => {
        const ans = findResponseAnswer(r, q)
        const val = getAnswerValue(ans)
        if (options.includes(val)) counts[val]++
      })
      return { question: stripQuestionPrefix(q.title), counts }
    })

    const totals: Record<string, number> = {}
    options.forEach((opt: string) => totals[opt] = 0)
    rows.forEach(r => {
      options.forEach((opt: string) => totals[opt] += r.counts[opt])
    })

    const grandTotal = targetQuestions.length * filteredResponses.length
    const percentages: Record<string, string> = {}
    options.forEach((opt: string) => {
      percentages[opt] = grandTotal > 0 ? ((totals[opt] / grandTotal) * 100).toFixed(1) + '%' : '0%'
    })

    return { targetQuestions, options, rows, totals, grandTotal, percentages }
  }, [questions, filteredResponses])

  // Soru Bazında Karşılanma Oranı Verisi
  const scoreReportData = useMemo(() => {
    if (!reportData) return null
    const { options, rows } = reportData
    if (options.length === 0) return null

    const weights: Record<string, number> = {}
    options.forEach((opt: string, idx: number) => {
      weights[opt] = getOptionWeight(opt, idx, options.length)
    })

    const scoreRows = rows.map(row => {
      let totalScore = 0
      const weightedCounts: Record<string, number> = {}
      
      options.forEach((opt: string) => {
        const weight = weights[opt]
        const wScore = row.counts[opt] * weight
        weightedCounts[opt] = wScore
        totalScore += wScore
      })

      const maxPossibleScore = filteredResponses.length * 4
      const percentage = maxPossibleScore > 0 ? Math.round((totalScore / maxPossibleScore) * 100) : 0

      return {
        question: row.question,
        weightedCounts,
        percentage
      }
    })

    return { weights, rows: scoreRows, options }
  }, [reportData, filteredResponses.length])

  // Kelime Bulutu Verisi
  const wordCloudData = useMemo(() => {
    const textQuestions = questions.filter(q => q.type === 'text' || q.type === 'textarea')
    if (textQuestions.length === 0) return null

    const wordsMap: Record<string, number> = {}
    const stopWords = ['ve', 'ile', 'bir', 'çok', 'da', 'de', 'için', 'bu', 'gibi', 'kadar', 'daha', 'en', 'var', 'yok', 'olan', 'ama', 'fakat', 'ise', 'ki']

    filteredResponses.forEach(r => {
      textQuestions.forEach(q => {
        const ans = r.response_answers?.find((a: any) => a.question_id === q.id)
        if (ans && ans.answer_text) {
          const text = ans.answer_text.toLocaleLowerCase('tr-TR')
          // Extract words with 3+ characters (basic Turkish letter support)
          const words = text.match(/[a-zçğıöşü]{3,}/g) || [] 
          words.forEach((w: string) => {
            if (!stopWords.includes(w)) {
              wordsMap[w] = (wordsMap[w] || 0) + 1
            }
          })
        }
      })
    })

    const wordsArr = Object.entries(wordsMap)
      .map(([text, value]) => ({ text, value }))
      .filter(w => w.value > 1)
      .sort((a, b) => b.value - a.value)
      .slice(0, 50)

    return wordsArr.length > 0 ? wordsArr : null
  }, [questions, filteredResponses])

  // Çapraz Analiz için Soru Kırılımları
  const crossTabQuestions = useMemo(() => {
    const radioQuestions = questions.filter(q => q.type === 'radio' || q.type === 'checkbox')
    
    // Ana seçenekleri bul
    const optionCounts: Record<string, { count: number, options: string[] }> = {}
    radioQuestions.forEach(q => {
      if (!q.options || q.options.length === 0) return
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

    // Ana seçenek setine UYMAYANLAR demografik/kategori sorularıdır
    const categoryQs = radioQuestions.filter(q => {
      if (!q.options || q.options.length === 0) return false
      return JSON.stringify(q.options) !== JSON.stringify(mainOptions)
    })

    // Ana seçenek setine UYANLAR ise memnuniyet/hedef sorulardır
    const targetQs = radioQuestions.filter(q => {
      if (!q.options) return false
      return JSON.stringify(q.options) === JSON.stringify(mainOptions)
    })

    return { categoryQs, targetQs, mainOptions }
  }, [questions])

  // Set default questions for cross-tab and trend
  useEffect(() => {
    if (crossTabQuestions.categoryQs.length > 0 && !crossCategoryQ) {
      setCrossCategoryQ(crossTabQuestions.categoryQs[0].id)
    }
    if (crossTabQuestions.targetQs.length > 0 && !crossTargetQ) {
      setCrossTargetQ(crossTabQuestions.targetQs[0].id)
    }
    if (crossTabQuestions.targetQs.length > 0 && !trendTargetQ) {
      setTrendTargetQ(crossTabQuestions.targetQs[0].id)
    }
  }, [crossTabQuestions])

  // Çapraz Analiz Matrix Verisi
  const crossTabData = useMemo(() => {
    if (!crossCategoryQ || !crossTargetQ) return null
    const catQ = questions.find(q => q.id === crossCategoryQ)
    const tgtQ = questions.find(q => q.id === crossTargetQ)
    if (!catQ || !tgtQ) return null

    const catOptions = catQ.options || []
    const tgtOptions = tgtQ.options || []

    const matrix: Record<string, Record<string, number>> = {}
    const catTotals: Record<string, number> = {}

    catOptions.forEach((catOpt: string) => {
      matrix[catOpt] = {}
      catTotals[catOpt] = 0
      tgtOptions.forEach((tgtOpt: string) => {
        matrix[catOpt][tgtOpt] = 0
      })
    })

    filteredResponses.forEach(r => {
      const catAns = findResponseAnswer(r, catQ)
      const tgtAns = findResponseAnswer(r, tgtQ)
      const catVal = getAnswerValue(catAns)
      const tgtVal = getAnswerValue(tgtAns)

      if (catOptions.includes(catVal)) {
        catTotals[catVal]++
        if (tgtOptions.includes(tgtVal)) {
          matrix[catVal][tgtVal]++
        }
      }
    })

    return { catQ, tgtQ, catOptions, tgtOptions, matrix, catTotals }
  }, [crossCategoryQ, crossTargetQ, questions, filteredResponses])

  // Trend Analizi Verisi (Tarih filtrelerine göre filtrelenir)
  const trendData = useMemo(() => {
    if (!trendTargetQ) return null
    const tgtQ = questions.find(q => q.id === trendTargetQ)
    if (!tgtQ) return null

    const radioQuestions = questions.filter(q => q.type === 'radio' || q.type === 'checkbox')
    const optionCounts: Record<string, { count: number, options: string[] }> = {}
    radioQuestions.forEach(q => {
      if (!q.options || q.options.length === 0) return
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
    
    const weights: Record<string, number> = {}
    mainOptions.forEach((opt: string, idx: number) => {
      weights[opt] = getOptionWeight(opt, idx, mainOptions.length)
    })

    const monthlyGroups: Record<string, { totalScore: number, maxPossible: number, count: number }> = {}

    filteredResponses.forEach(r => {
      if (!r.completed_at) return
      const date = new Date(r.completed_at)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const periodKey = `${year}-${month}`

      if (!monthlyGroups[periodKey]) {
        monthlyGroups[periodKey] = { totalScore: 0, maxPossible: 0, count: 0 }
      }

      const ans = findResponseAnswer(r, tgtQ)
      const val = getAnswerValue(ans)

      if (mainOptions.includes(val)) {
        const weight = weights[val]
        monthlyGroups[periodKey].totalScore += weight
        monthlyGroups[periodKey].maxPossible += 4
        monthlyGroups[periodKey].count++
      }
    })

    const sortedPeriods = Object.keys(monthlyGroups).sort()
    
    const chartData = sortedPeriods.map(period => {
      const { totalScore, maxPossible } = monthlyGroups[period]
      const scorePercentage = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0
      
      const [y, m] = period.split('-')
      const months = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
      const monthName = months[Number(m)] || m
      const label = `${monthName} ${y}`

      return {
        period,
        label,
        Skor: scorePercentage
      }
    })

    return { tgtQ, chartData }
  }, [trendTargetQ, questions, filteredResponses])


  const exportPDF = async () => {
    const element = document.getElementById('chart-report-content')
    if (!element) return

    const opt = {
      margin: 10,
      filename: `anket-grafik-rapor-${survey?.id}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true, 
        letterRendering: true,
        logging: false
      },
      jsPDF: { unit: 'mm', format: pageSize, orientation: orientation }
    }

    try {
      // @ts-ignore
      await html2pdf().set(opt).from(element).save()
    } catch (err) {
      console.error('PDF Export Error:', err)
    }
  }

  const exportReportExcel = () => {
    const table = document.getElementById('report-table')
    if (!table) return
    const wb = XLSX.utils.table_to_book(table)
    XLSX.writeFile(wb, `${survey?.title || 'Rapor'}.xlsx`)
  }

  // Grafik Rapor Verisi
  const chartReportData = useMemo(() => {
    return questions
      .filter(q => q.type === 'radio' || q.type === 'checkbox')
      .map(q => {
        const data: { name: string, value: number }[] = []
        const options = q.options || []
        
        options.forEach((opt: string) => {
          let count = 0
          filteredResponses.forEach(r => {
            const ans = findResponseAnswer(r, q)
            const val = getAnswerValue(ans)
            // Checkbox ise virgülle ayrılmış olabilir
            if (q.type === 'checkbox') {
              const selectedOpts = val.split(', ').map(s => s.trim())
              if (selectedOpts.includes(opt)) count++
            } else {
              if (val === opt) count++
            }
          })
          data.push({ name: opt, value: count })
        })

        return {
          id: q.id,
          title: q.title,
          data: data, // Tüm seçenekleri tutuyoruz (tablo için)
          chartData: data.filter(d => d.value > 0) // Sadece verisi olanları grafik için
        }
      })
      .filter(q => q.data.some(d => d.value > 0)) // En az bir cevap verilmiş soruları göster
  }, [questions, filteredResponses])

  const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']

  // Katılımcı Listesini normal Excel (XLS) olarak indir
  const downloadExcel = () => {
    const dataQuestions = questions.filter(q => q.type !== 'section')
    const headers = ['#', 'Tarih/Saat', 'Ay/Yıl', ...dataQuestions.map(q => q.title)]
    
    const rows = filteredResponses.map((r, idx) => {
      const dateStr = r.completed_at ? formatDateTime(r.completed_at) : '-'
      const monthYear = r.completed_at
        ? new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date(r.completed_at))
        : '-'

      const row = [
        filteredResponses.length - idx,
        dateStr,
        monthYear
      ]

      dataQuestions.forEach(q => {
        const ans = findResponseAnswer(r, q)
        row.push(getAnswerValue(ans))
      })

      return row
    })

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Katılımcılar")
    XLSX.writeFile(wb, `${survey?.title || 'Anket'}-Katilimcilar.xlsx`)
  }

  const clearFilter = () => { setDateFrom(''); setDateTo('') }
  const isFiltered = dateFrom || dateTo

  if (loading) return <div className="p-12 text-center text-dark-400">Sonuçlar Yükleniyor...</div>
  if (!survey) return <div className="p-12 text-center text-red-400">Anket bulunamadı.</div>

  const dataQuestions = questions.filter(q => q.type !== 'section')

  return (
    <div className="animate-in space-y-6">

      {/* Üst Bar */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <Link to="/admin/anketler" className="btn-sm btn-ghost p-2 shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="page-header mb-0 min-w-0">
            <h1 className="page-title truncate">{survey.title} — Sonuçlar</h1>
            <p className="page-subtitle">
              Toplam {responses.length} yanıt
              {isFiltered && ` · Filtrelenen: ${filteredResponses.length}`}
            </p>
          </div>
        </div>
        <button onClick={downloadExcel} className="btn-md btn-secondary gap-2 shrink-0">
          <Download className="w-4 h-4" /> Excel İndir ({filteredResponses.length})
        </button>
      </div>

      {/* İstatistik Kartları */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="stat-card p-5">
          <div className="w-10 h-10 bg-primary-500/10 rounded-xl flex items-center justify-center text-primary-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-dark-400">Toplam Yanıt</p>
            <p className="text-2xl font-bold text-dark-50">{responses.length}</p>
          </div>
        </div>
        <div className="stat-card p-5">
          <div className="w-10 h-10 bg-secondary-500/10 rounded-xl flex items-center justify-center text-secondary-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-dark-400">Durum</p>
            <p className="text-xl font-bold text-dark-50">
              {survey.status === 'active' ? 'Yayında' : 'Pasif'}
            </p>
          </div>
        </div>
        <div className="stat-card p-5">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
            <LayoutList className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-dark-400">Soru Sayısı</p>
            <p className="text-2xl font-bold text-dark-50">{dataQuestions.length}</p>
          </div>
        </div>
      </div>

      {/* Filtreleme */}
      <div className="card">
        <div className="p-5 border-b border-dark-800 flex items-center gap-3">
          <Filter className="w-5 h-5 text-primary-400" />
          <h3 className="font-semibold text-dark-100 flex-1">Sonuç Filtreleme</h3>
          {isFiltered && (
            <button onClick={clearFilter} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
              <X className="w-3 h-3" /> Filtreyi Temizle
            </button>
          )}
        </div>
        
        <div className="p-5 border-b border-dark-800 bg-dark-900/50">
          <div className="flex gap-2">
            <button
              onClick={() => setFilterMode('month')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                filterMode === 'month' ? 'bg-primary-500 text-white' : 'text-dark-300 hover:bg-dark-800'
              }`}
            >
              Ay / Yıl Seçimi
            </button>
            <button
              onClick={() => setFilterMode('range')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                filterMode === 'range' ? 'bg-primary-500 text-white' : 'text-dark-300 hover:bg-dark-800'
              }`}
            >
              Tarih Aralığı
            </button>
          </div>
        </div>

        <div className="p-5">
          {filterMode === 'month' ? (
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-xs text-dark-400 mb-1.5">Yıl Seçin</label>
                <select
                  value={selectedYear}
                  onChange={e => handleYearChange(e.target.value)}
                  className="input w-full bg-dark-950 border-dark-800 h-10"
                >
                  <option value="">Tümü</option>
                  {availableYears.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-dark-400 mb-1.5">Ay Seçin</label>
                <select
                  value={selectedMonth}
                  onChange={e => handleMonthChange(e.target.value)}
                  disabled={!selectedYear}
                  className="input w-full bg-dark-950 border-dark-800 h-10 disabled:opacity-50"
                >
                  <option value="">Tüm Aylar</option>
                  {availableMonths.map(m => (
                    <option key={m} value={m}>{MONTH_NAMES[m]}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-xs text-dark-400 mb-1.5">Başlangıç Tarihi</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500 pointer-events-none" />
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => {
                      setDateFrom(e.target.value)
                      setSelectedYear('')
                      setSelectedMonth('')
                    }}
                    className="input w-full pl-9 bg-dark-950 border-dark-800"
                  />
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-dark-400 mb-1.5">Bitiş Tarihi</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500 pointer-events-none" />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => {
                      setDateTo(e.target.value)
                      setSelectedYear('')
                      setSelectedMonth('')
                    }}
                    min={dateFrom}
                    className="input w-full pl-9 bg-dark-950 border-dark-800"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sekmeler */}
      <div className="flex border-b border-dark-800 mt-8 mb-4">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'list' ? 'border-primary-500 text-primary-400' : 'border-transparent text-dark-400 hover:text-dark-200'
          }`}
        >
          Katılımcı Listesi
        </button>
        <button
          onClick={() => setActiveTab('report')}
          className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'report' ? 'border-primary-500 text-primary-400' : 'border-transparent text-dark-400 hover:text-dark-200'
          }`}
        >
          Seçenek Bazında Verilen Cevap Raporu
        </button>
        <button 
          onClick={() => setActiveTab('score_report')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all border-b-2 ${activeTab === 'score_report' ? 'text-primary-400 border-primary-400 bg-primary-400/5' : 'text-dark-400 border-transparent hover:text-dark-200'}`}
        >
          <Activity className="w-4 h-4" />
          Soru Bazında Karşılanma
        </button>
        <button 
          onClick={() => setActiveTab('chart_report')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all border-b-2 ${activeTab === 'chart_report' ? 'text-primary-400 border-primary-400 bg-primary-400/5' : 'text-dark-400 border-transparent hover:text-dark-200'}`}
        >
          <PieChartIcon className="w-4 h-4" />
          Soru Bazında Analiz (Grafik)
        </button>
        <button 
          onClick={() => setActiveTab('exec_summary')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all border-b-2 ${activeTab === 'exec_summary' ? 'text-primary-400 border-primary-400 bg-primary-400/5' : 'text-dark-400 border-transparent hover:text-dark-200'}`}
        >
          <LayoutList className="w-4 h-4" />
          Yönetici Özeti
        </button>
        <button 
          onClick={() => setActiveTab('trend_report')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all border-b-2 ${activeTab === 'trend_report' ? 'text-primary-400 border-primary-400 bg-primary-400/5' : 'text-dark-400 border-transparent hover:text-dark-200'}`}
        >
          <Activity className="w-4 h-4" />
          Trend Analizi
        </button>
        <button 
          onClick={() => setActiveTab('cross_tab')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all border-b-2 ${activeTab === 'cross_tab' ? 'text-primary-400 border-primary-400 bg-primary-400/5' : 'text-dark-400 border-transparent hover:text-dark-200'}`}
        >
          <Users className="w-4 h-4" />
          Çapraz Analiz
        </button>
        <button 
          onClick={() => setActiveTab('word_cloud')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all border-b-2 ${activeTab === 'word_cloud' ? 'text-primary-400 border-primary-400 bg-primary-400/5' : 'text-dark-400 border-transparent hover:text-dark-200'}`}
        >
          <FileText className="w-4 h-4" />
          Kelime Bulutu
        </button>
      </div>

      {activeTab === 'list' && (
        <div className="card">
          <div className="p-5 border-b border-dark-800 flex items-center gap-3">
            <LayoutList className="w-5 h-5 text-accent-400" />
            <h3 className="font-semibold text-dark-100">
              Katılımcılar
              {isFiltered && <span className="ml-2 text-sm text-primary-400">({filteredResponses.length} sonuç)</span>}
            </h3>
          </div>

          {filteredResponses.length === 0 ? (
            <div className="p-8 text-center text-dark-400">
              {isFiltered ? 'Bu tarih aralığında yanıt bulunamadı.' : 'Henüz kimse bu anketi yanıtlamadı.'}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-dark-900 border-b border-dark-800 text-dark-400">
                    <tr>
                      <th className="px-6 py-4 font-medium">#</th>
                      <th className="px-6 py-4 font-medium">Tarih / Saat</th>
                      <th className="px-6 py-4 font-medium">Tarayıcı</th>
                      <th className="px-6 py-4 font-medium text-right">Detaylar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800">
                    {paginatedResponses.map((r, i) => {
                      const browser = r.metadata?.b === 'ch' ? 'Chrome'
                        : r.metadata?.b === 'ff' ? 'Firefox'
                        : r.metadata?.b === 'sf' ? 'Safari'
                        : r.metadata?.b === 'ed' ? 'Edge'
                        : 'Diğer'
                      const isMobile = r.metadata?.m === 1

                      return (
                        <tr key={r.id} className="hover:bg-dark-800/50 transition-colors">
                          <td className="px-6 py-4 font-medium text-dark-200">
                            #{filteredResponses.length - ((currentPage - 1) * itemsPerPage + i)}
                          </td>
                          <td className="px-6 py-4 text-dark-300">
                            {r.completed_at ? formatDateTime(r.completed_at) : (
                              <span className="text-dark-500 italic">Tarih kaydedilmemiş</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-dark-400 text-xs">
                            {browser}{isMobile ? ' · Mobil' : ''}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => setSelectedResponse(r)}
                              className="text-primary-400 hover:text-primary-300 font-medium"
                            >
                              İncele
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 border-t border-dark-800 text-sm text-dark-400 bg-dark-900/10">
                  <div>
                    Toplam <span className="font-semibold text-dark-200">{filteredResponses.length}</span> kayıttan{' '}
                    <span className="font-semibold text-dark-200">
                      {(currentPage - 1) * itemsPerPage + 1}
                    </span>
                    -
                    <span className="font-semibold text-dark-200">
                      {Math.min(filteredResponses.length, currentPage * itemsPerPage)}
                    </span>{' '}
                    arası gösteriliyor.
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 rounded-lg bg-dark-900 border border-dark-800 text-dark-300 hover:bg-dark-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-semibold"
                    >
                      Geri
                    </button>
                    {getPageNumbers().map((pageNum, idx) => {
                      if (pageNum === '...') {
                        return (
                          <span key={`dots-${idx}`} className="px-2 text-dark-500 font-bold select-none">
                            ...
                          </span>
                        )
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(Number(pageNum))}
                          className={`w-8 h-8 rounded-lg border transition-all text-xs font-bold ${
                            currentPage === pageNum
                              ? 'bg-primary-500 border-primary-500 text-white'
                              : 'bg-dark-900 border-dark-800 text-dark-300 hover:bg-dark-800'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 rounded-lg bg-dark-900 border border-dark-800 text-dark-300 hover:bg-dark-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-semibold"
                    >
                      İleri
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
      
      {activeTab === 'report' && (
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-primary-400" />
              <h3 className="font-bold text-dark-100">Rapor Önizleme</h3>
              {/* Butonlar kaldırıldı - Sabit A4 Dikey */}
            </div>
            <div className="flex gap-3">
              <button onClick={exportReportExcel} className="btn-md btn-secondary gap-2 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30">
                <FileSpreadsheet className="w-4 h-4" /> Excel İndir
              </button>
              <button onClick={async () => {
                const element = document.getElementById('report-table-print-area')
                if (!element) return
                element.classList.add('print-pdf-mode')
                try {
                  await html2pdf().set({
                    margin: [5, 5, 5, 5],
                    filename: `${survey?.title || 'Rapor'}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                    pagebreak: { mode: ['css', 'legacy'], avoid: 'tr' }
                  }).from(element).save()
                } finally {
                  element.classList.remove('print-pdf-mode')
                }
              }} className="btn-md btn-primary gap-2">
                <Download className="w-4 h-4" /> PDF Olarak Kaydet
              </button>
            </div>
          </div>

          {reportData.options.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-dark-700 rounded-xl">
              <p className="text-dark-300">Bu ankette Tek Seçimli (Radio) veya Çok Seçimli (Checkbox) soru bulunmuyor.</p>
              <p className="text-dark-500 text-sm mt-2">Raporlama için seçenekli sorular gereklidir.</p>
            </div>
          ) : (
            <div className="flex justify-center bg-dark-950 p-4 sm:p-8 rounded-xl overflow-x-auto border border-dark-800 shadow-inner">
              <div 
                id="report-table-print-area" 
                className="bg-white text-black shadow-2xl relative w-full p-6 sm:p-8 rounded-2xl"
                style={{ 
                  boxSizing: 'border-box',
                  fontFamily: 'Arial, sans-serif'
                }}
              >
                <style>{`
                  #report-table {
                    font-family: Arial, sans-serif;
                    font-size: 13px;
                    width: 100%;
                    border-collapse: collapse;
                    color: black;
                    table-layout: fixed;
                  }
                  #report-table th, #report-table td {
                    border: 1px solid #cbd5e1;
                    padding: 10px 8px;
                    text-align: center;
                    vertical-align: middle;
                    word-wrap: break-word;
                    overflow-wrap: break-word;
                  }
                  #report-table .text-left { text-align: left; }
                  #report-table .font-bold { font-weight: bold; }
                  #report-table th { background-color: #f1f5f9; font-weight: bold; font-size: 13px; }
                  #report-table .bg-gray-100 { background-color: #f8fafc !important; }
                  #report-table .q-col { width: 45%; }
                  #report-table .opt-col { width: ${(55 / (reportData.options.length || 1)).toFixed(1)}%; }
                  
                  .report-title { font-size: 18px; }
                  .report-info { font-size: 13px; }

                  /* PDF Kaydetme (A4 Dikey) Modu */
                  .print-pdf-mode {
                    width: 200mm !important;
                    padding: 5mm !important;
                    border-radius: 0px !important;
                  }
                  .print-pdf-mode #report-table {
                    font-size: 9px !important;
                  }
                  .print-pdf-mode #report-table th, .print-pdf-mode #report-table td {
                    border: 1px solid #444 !important;
                    padding: 5px 4px !important;
                  }
                  .print-pdf-mode #report-table th {
                    font-size: 9px !important;
                    background-color: #e5e7eb !important;
                  }
                  .print-pdf-mode #report-table .bg-gray-100 {
                    background-color: #f3f4f6 !important;
                  }
                  .print-pdf-mode #report-table .q-col { width: 48% !important; }
                  .print-pdf-mode #report-table .opt-col { width: ${(52 / (reportData.options.length || 1)).toFixed(1)}% !important; }
                  .print-pdf-mode .report-title { font-size: 13px !important; }
                  .print-pdf-mode .report-info { font-size: 8px !important; }
                `}</style>
                
                {/* Başlık */}
                <div className="report-title font-bold uppercase border-b-2 border-black pb-3 mb-4">
                  SEÇENEK BAZINDA VERİLEN CEVAP SAYISI VE ORANI
                </div>
                {/* Üst Bilgi */}
                <div className="report-info mb-4" style={{ lineHeight: '1.6' }}>
                  <div>Anket Adı: <strong>{survey?.title}</strong></div>
                  <div>Yıl/Ay: <strong>{selectedYear ? `${selectedYear} / ${MONTH_NAMES[Number(selectedMonth)] || 'Tümü'}` : (dateFrom ? `${dateFrom} - ${dateTo}` : 'Tüm Zamanlar')}</strong></div>
                  <div>Hastane Adı: <strong>{tenant?.name || '-'}</strong></div>
                  <div>İlgili Dönemde Anket Uygulanan Kişi Sayısı: <strong>{filteredResponses.length}</strong></div>
                </div>

                {/* Ana Tablo */}
                <table id="report-table">
                  <colgroup>
                    <col className="q-col" />
                    {reportData.options.map((_: string, i: number) => (
                      <col key={i} className="opt-col" />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="text-left q-col" rowSpan={2} style={{ width: '48%' }}>SORULAR</th>
                      <th colSpan={reportData.options.length}>Cevap Seçeneği (Kişi Sayısı)</th>
                    </tr>
                    <tr>
                      {reportData.options.map((opt: string, i: number) => (
                        <th key={i}>{opt}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.rows.map((row, i) => (
                      <tr key={i}>
                        <td className="text-left">{i + 1}-{row.question}</td>
                        {reportData.options.map((opt: string, j: number) => (
                          <td key={j}>{row.counts[opt]}</td>
                        ))}
                      </tr>
                    ))}

                    {/* Alt Özet Satırları */}
                    <tr>
                      <td className="text-left font-bold bg-gray-100">
                        Seçenek Bazında Verilen Toplam Cevap Sayısı<br/>
                        <span style={{ fontWeight: 'normal', fontSize: '7px' }}>({reportData.options.join(', ')} Toplamı)</span>
                      </td>
                      {reportData.options.map((opt: string, i: number) => (
                        <td key={i} className="font-bold bg-gray-100">{reportData.totals[opt]}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="text-left font-bold bg-gray-100">
                        Toplam Cevap Sayısı<br/>
                        <span style={{ fontWeight: 'normal', fontSize: '7px' }}>(Anketteki Soru Sayısı X Anket Uygulanan Kişi Sayısı)</span>
                      </td>
                      <td colSpan={reportData.options.length} className="font-bold bg-gray-100">{reportData.grandTotal}</td>
                    </tr>
                    <tr>
                      <td className="text-left font-bold bg-gray-100">
                        Seçenek Bazında Verilen Cevap Oranı<br/>
                        <span style={{ fontWeight: 'normal', fontSize: '7px' }}>(Her Seçenekte Verilen Toplam Cevap Sayısı / Toplam Cevap Sayısı)</span>
                      </td>
                      {reportData.options.map((opt: string, i: number) => (
                        <td key={i} className="font-bold bg-gray-100">{reportData.percentages[opt]}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}


      {activeTab === 'chart_report' && (
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <PieChartIcon className="w-5 h-5 text-primary-400" />
              <h3 className="font-bold text-dark-100">SORU BAZINDA SONUÇ ANALİZİ (GRAFİK)</h3>
              {/* Butonlar kaldırıldı - Sabit A4 Dikey */}
            </div>
            <div className="flex gap-3">
              <button onClick={async () => {
                const element = document.getElementById('chart-report-print-area')
                if (!element) return
                element.classList.add('print-pdf-mode')
                try {
                  await html2pdf().set({
                    margin: [5, 5, 5, 5],
                    filename: `${survey?.title || 'Grafik Rapor'}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
                  }).from(element).save()
                } finally {
                  element.classList.remove('print-pdf-mode')
                }
              }} className="btn-md btn-primary gap-2">
                <Download className="w-4 h-4" /> PDF Olarak Kaydet
              </button>
            </div>
          </div>

          {chartReportData.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-dark-700 rounded-xl">
              <p className="text-dark-300">Grafik oluşturulabilecek veri bulunamadı.</p>
            </div>
          ) : (
            <div className="flex justify-center bg-dark-950 p-4 sm:p-8 rounded-xl overflow-x-auto border border-dark-800 shadow-inner">
              <div 
                id="chart-report-print-area" 
                className="bg-white text-black shadow-2xl w-full p-6 sm:p-8 rounded-2xl"
                style={{ 
                  boxSizing: 'border-box',
                  fontFamily: 'Arial, sans-serif'
                }}
              >
                <style>{`
                  /* Varsayılan Ekran Modu */
                  .chart-report-title { font-size: 20px; }
                  .chart-report-info { font-size: 13px; }
                  .chart-report-item { margin-bottom: 30px; }
                  .chart-report-q-title { font-size: 15px; }
                  
                  .chart-report-flex {
                    display: flex;
                    flex-direction: row;
                    align-items: flex-start;
                    gap: 20px;
                    flex-wrap: wrap;
                  }
                  
                  .chart-report-chart-container {
                    flex: 1 1 50%;
                    min-width: 300px;
                    height: 350px;
                    background: #f8fafc;
                    border-radius: 12px;
                    border: 1px solid #e2e8f0;
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                  }
                  
                  .chart-report-html-legend {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: center;
                    gap: 12px;
                    margin-top: 8px;
                    width: 100%;
                  }
                  
                  .chart-report-legend-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 12px;
                    color: #475569;
                    font-weight: 500;
                  }
                  
                  .chart-report-table-container {
                    flex: 1 1 45%;
                    min-width: 300px;
                  }
                  
                  .chart-report-table-header {
                    font-size: 13px;
                    font-weight: bold;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    margin-bottom: 10px;
                    text-align: center;
                  }
                  
                  .chart-report-table {
                    width: 100%;
                    font-size: 13px;
                    border-collapse: collapse;
                    border: 1px solid #cbd5e1;
                  }
                  .chart-report-table th, .chart-report-table td {
                    border: 1px solid #cbd5e1;
                    padding: 8px 12px;
                  }
                  .chart-report-table th {
                    background-color: #f1f5f9;
                    font-weight: bold;
                    color: #1e293b;
                  }
                  
                  .chart-pie-percent-text {
                    font-size: 11px;
                  }

                  /* PDF Kaydetme (A4 Dikey) Modu */
                  .print-pdf-mode {
                    width: 200mm !important;
                    padding: 5mm !important;
                    border-radius: 0px !important;
                  }
                  .print-pdf-mode .chart-report-title { font-size: 13px !important; margin-bottom: 2mm !important; }
                  .print-pdf-mode .chart-report-info { font-size: 8px !important; }
                  .print-pdf-mode .chart-report-item { margin-bottom: 15px !important; }
                  .print-pdf-mode .chart-report-q-title { font-size: 9px !important; margin-bottom: 2mm !important; }
                  
                  .print-pdf-mode .chart-report-flex {
                    display: flex !important;
                    flex-direction: row !important;
                    flex-wrap: nowrap !important;
                    align-items: flex-start !important;
                    gap: 5mm !important;
                  }
                  .print-pdf-mode .chart-report-chart-container {
                    flex: 0 0 65% !important;
                    height: 240px !important;
                    padding: 4px !important;
                    border-radius: 6px !important;
                    border: 1px solid #cbd5e1 !important;
                    background: #f9fafb !important;
                    display: flex !important;
                    flex-direction: column !important;
                    align-items: center !important;
                  }
                  .print-pdf-mode .chart-report-html-legend {
                    gap: 6px !important;
                    margin-top: 4px !important;
                  }
                  .print-pdf-mode .chart-report-legend-item {
                    gap: 4px !important;
                    font-size: 8px !important;
                  }
                  .print-pdf-mode .chart-report-table-container {
                    flex: 1 !important;
                    min-width: 0 !important;
                  }
                  .print-pdf-mode .chart-report-table-header {
                    font-size: 7px !important;
                    margin-bottom: 2mm !important;
                  }
                  .print-pdf-mode .chart-report-table {
                    font-size: 8px !important;
                    border: 1px solid #cbd5e1 !important;
                  }
                  .print-pdf-mode .chart-report-table th,
                  .print-pdf-mode .chart-report-table td {
                    padding: 3px 4px !important;
                    border: 1px solid #cbd5e1 !important;
                  }
                  .print-pdf-mode .chart-report-table th {
                    font-size: 7px !important;
                    background-color: #e0f2fe !important;
                  }
                  .print-pdf-mode .chart-pie-percent-text {
                    font-size: 10px !important;
                  }
                `}</style>
                
                {/* Başlık */}
                <div style={{ borderBottom: '2px solid black', paddingBottom: '4mm', marginBottom: '4mm' }}>
                  <h1 className="chart-report-title font-bold uppercase m-0 mb-3">
                    SORU BAZINDA SONUÇ ANALİZİ (GRAFİK)
                  </h1>
                  <div className="chart-report-info" style={{ lineHeight: '1.6' }}>
                    <div>Anket Adı: <strong>{survey?.title}</strong></div>
                    <div>Yıl/Ay: <strong>{selectedYear ? `${selectedYear} / ${MONTH_NAMES[Number(selectedMonth)] || 'Tümü'}` : (dateFrom ? `${dateFrom} - ${dateTo}` : 'Tüm Zamanlar')}</strong></div>
                    <div>Hastane Adı: <strong>{tenant?.name || '-'}</strong></div>
                    <div>Anket Uygulanan Kişi Sayısı: <strong>{filteredResponses.length}</strong></div>
                  </div>
                </div>

                {/* Her soru için: grafik SOL | tablo SAĞ */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8mm' }}>
                  {chartReportData.map((item, idx) => (
                    <div key={item.id} className="chart-report-item" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                      {/* Soru başlığı */}
                      <div className="chart-report-q-title font-bold mb-3 border-l-[3px] border-[#3b82f6] pl-3">
                        {idx + 1}. {stripQuestionPrefix(item.title)}
                      </div>

                      {/* Yan yana: grafik + tablo */}
                      <div className="chart-report-flex">

                        {/* SOL: Pasta Grafik */}
                        <div className="chart-report-chart-container">
                          <div style={{ flex: 1, width: '100%', minHeight: '180px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={item.chartData}
                                  cx="50%"
                                  cy="45%"
                                  labelLine={false}
                                  label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                                    if (percent < 0.04) return null;
                                    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                                    const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
                                    const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);
                                    return (
                                      <text x={x} y={y} fill="#ffffff" textAnchor="middle" dominantBaseline="central" className="chart-pie-percent-text" style={{ fontWeight: 'bold', textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>
                                        {`%${(percent * 100).toFixed(1)}`}
                                      </text>
                                    );
                                  }}
                                  innerRadius={0}
                                  outerRadius={85}
                                  dataKey="value"
                                  stroke="#fff"
                                  strokeWidth={2}
                                >
                                  {item.chartData.map((entry: any, index: number) => (
                                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip 
                                  contentStyle={{ borderRadius: '6px', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', fontSize: '11px' }}
                                  formatter={(value: number) => [`${value} Yanıt`, 'Sayı']} 
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          
                          {/* Native HTML Legend */}
                          <div className="chart-report-html-legend">
                            {item.chartData.map((entry: any, index: number) => (
                              <div key={index} className="chart-report-legend-item">
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: CHART_COLORS[index % CHART_COLORS.length], flexShrink: 0 }}></div>
                                <span>{entry.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* SAĞ: Veri Tablosu */}
                        <div className="chart-report-table-container">
                          <div className="chart-report-table-header">
                            CEVAP DAĞILIMI VE SAYILARI
                          </div>
                          <table className="chart-report-table">
                            <thead>
                              <tr style={{ backgroundColor: '#e0f2fe' }}>
                                <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'left', color: '#0369a1' }}>Cevap Seçeneği</th>
                                <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center', width: '60px', color: '#0369a1' }}>Sayı</th>
                                <th style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center', width: '60px', color: '#0369a1' }}>Oran</th>
                              </tr>
                            </thead>
                            <tbody>
                              {item.data.map((d, i) => {
                                const total = item.data.reduce((acc, curr) => acc + curr.value, 0)
                                const percentage = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
                                return (
                                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'left' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }}></div>
                                        <span style={{ fontWeight: '500' }}>{d.name}</span>
                                      </div>
                                    </td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center', fontWeight: 'bold' }}>{d.value}</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center', fontWeight: 'bold', color: '#2563eb' }}>%{percentage}</td>
                                  </tr>
                                )
                              })}
                              <tr style={{ backgroundColor: '#e5e7eb', fontWeight: 'bold' }}>
                                <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'right', textTransform: 'uppercase' }}>CEVAP SAYISI:</td>
                                <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>{item.data.reduce((acc, curr) => acc + curr.value, 0)}</td>
                                <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center' }}>%100</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}


      {activeTab === 'score_report' && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-dark-100 flex items-center gap-3">
              <FileText className="w-5 h-5 text-primary-400" />
              Soru Bazında Karşılanma Oranı (Önizleme)
              <span className="text-dark-400 font-normal text-xs bg-dark-800 px-2 py-1 rounded-md">A4 Yatay (Landscape)</span>
            </h3>
            <div className="flex gap-3">
              <button onClick={() => {
                const element = document.getElementById('score-report-table-print-area')
                if (!element) return
                html2pdf().set({
                  margin: 0,
                  filename: `${survey?.title || 'Karşılanma Oranı Raporu'}.pdf`,
                  image: { type: 'jpeg', quality: 0.98 },
                  html2canvas: { scale: 2 },
                  jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
                }).from(element).save()
              }} className="btn-md btn-primary gap-2">
                <Download className="w-4 h-4" /> PDF Olarak Kaydet
              </button>
            </div>
          </div>

          {!scoreReportData ? (
            <div className="p-12 text-center border border-dashed border-dark-700 rounded-xl">
              <p className="text-dark-300">Bu rapor için uygun soru formatı bulunamadı.</p>
            </div>
          ) : (
            <div className="flex justify-center bg-dark-950 p-4 sm:p-8 rounded-xl overflow-x-auto border border-dark-800 shadow-inner">
              <div 
                id="score-report-table-print-area" 
                className="bg-white text-black shadow-2xl relative"
                style={{ width: '297mm', minHeight: '210mm', maxWidth: 'none', padding: '10mm', boxSizing: 'border-box' }}
              >
                <style>{`
                  #score-report-table {
                    font-family: Arial, sans-serif;
                    font-size: 9px;
                    width: 100%;
                    border-collapse: collapse;
                    color: black;
                  }
                  #score-report-table th, #score-report-table td {
                    border: 1px solid #444;
                    padding: 4px 2px;
                    text-align: center;
                    vertical-align: middle;
                  }
                  #score-report-table .text-left { text-align: left; }
                  #score-report-table .font-bold { font-weight: bold; }
                  #score-report-table .header-info td { border: none; padding: 2px 0; text-align: left; font-size: 11px; }
                  #score-report-table th { background-color: #f3f4f6; font-weight: bold; }
                  #score-report-table .bg-gray-100 { background-color: #f3f4f6 !important; }
                `}</style>
                
                <table id="score-report-table">
                  <tbody>
                    <tr className="header-info"><td colSpan={scoreReportData.options.length + 2} className="font-bold text-[24px] uppercase pb-6 border-b border-black" style={{ fontSize: '24px' }}>SORU BAZINDA KARŞILANMA ORANI</td></tr>
                    <tr><td colSpan={scoreReportData.options.length + 2} style={{height: '10px', border: 'none'}}></td></tr>
                    <tr className="header-info"><td colSpan={scoreReportData.options.length + 2}>Anket Adı: <span className="font-bold">{survey?.title}</span></td></tr>
                    <tr className="header-info"><td colSpan={scoreReportData.options.length + 2}>Yıl/Ay: <span className="font-bold">{selectedYear ? `${selectedYear} / ${MONTH_NAMES[Number(selectedMonth)] || 'Tümü'}` : (dateFrom ? `${dateFrom} - ${dateTo}` : 'Tüm Zamanlar')}</span></td></tr>
                    <tr className="header-info"><td colSpan={scoreReportData.options.length + 2}>Hastane Adı: <span className="font-bold">{tenant?.name || '-'}</span></td></tr>
                    <tr className="header-info"><td colSpan={scoreReportData.options.length + 2}>İlgili Dönemde Anket Uygulanan Kişi Sayısı: <span className="font-bold">{filteredResponses.length}</span></td></tr>
                    <tr><td colSpan={scoreReportData.options.length + 2} style={{height: '15px', border: 'none'}}></td></tr>
                    
                    <tr>
                      <th className="text-left bg-gray-100" rowSpan={2} style={{ width: '40%' }}>SORULAR</th>
                      <th colSpan={scoreReportData.options.length} className="bg-gray-100">Cevap Seçeneği (Oransal Dağılım)</th>
                      <th className="bg-gray-100" rowSpan={2} style={{ width: '15%' }}>Soru Bazında Karşılanma Oranı (%)</th>
                    </tr>
                    <tr>
                      {scoreReportData.options.map((opt: string, i: number) => (
                        <th key={i} className="bg-gray-100">
                          {opt}<br/>
                          <span style={{ fontSize: '9px', fontWeight: 'normal' }}>Cevap Sayısı x {scoreReportData.weights[opt]}</span>
                        </th>
                      ))}
                    </tr>
                    
                    {scoreReportData.rows.map((row, i) => (
                      <tr key={i}>
                        <td className="text-left">{row.question}</td>
                        {scoreReportData.options.map((opt: string, j: number) => (
                          <td key={j}>{row.weightedCounts[opt]}</td>
                        ))}
                        <td className="font-bold">{row.percentage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Yönetici Özeti Sekmesi */}
      {activeTab === 'exec_summary' && (
        <div className="card p-5 space-y-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-dark-100 flex items-center gap-3">
              <LayoutList className="w-5 h-5 text-primary-400" />
              Yönetici Özeti (Executive Summary)
            </h3>
          </div>

          {!scoreReportData || scoreReportData.rows.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-dark-700 rounded-xl">
              <p className="text-dark-300">Bu rapor için puanlanabilir soru bulunamadı.</p>
            </div>
          ) : (
            <div className="space-y-6" id="exec-summary-print-area">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-dark-900 border border-dark-800 rounded-xl p-6 flex flex-col justify-center items-center text-center">
                  <p className="text-dark-400 font-medium mb-2">Genel Memnuniyet Skoru</p>
                  <div className="text-5xl font-black text-primary-400">
                    %{Math.round(scoreReportData.rows.reduce((acc, r) => acc + r.percentage, 0) / scoreReportData.rows.length)}
                  </div>
                </div>
                <div className="bg-dark-900 border border-dark-800 rounded-xl p-6 flex flex-col justify-center items-center text-center">
                  <p className="text-dark-400 font-medium mb-2">Ankete Katılan Kişi Sayısı</p>
                  <div className="text-5xl font-black text-emerald-400">
                    {filteredResponses.length}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-dark-900 border border-emerald-500/20 rounded-xl p-6">
                  <h4 className="text-emerald-400 font-bold mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    En Başarılı 3 Konu
                  </h4>
                  <div className="space-y-4">
                    {[...scoreReportData.rows].sort((a, b) => b.percentage - a.percentage).slice(0, 3).map((row, i) => (
                      <div key={i} className="flex flex-col gap-1 pb-3 border-b border-dark-800 last:border-0 last:pb-0">
                        <div className="flex justify-between items-start gap-4">
                          <p className="text-sm text-dark-100 flex-1">{row.question}</p>
                          <span className="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                            %{row.percentage}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-dark-900 border border-red-500/20 rounded-xl p-6">
                  <h4 className="text-red-400 font-bold mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    İyileştirmeye Açık 3 Konu
                  </h4>
                  <div className="space-y-4">
                    {[...scoreReportData.rows].sort((a, b) => a.percentage - b.percentage).slice(0, 3).map((row, i) => (
                      <div key={i} className="flex flex-col gap-1 pb-3 border-b border-dark-800 last:border-0 last:pb-0">
                        <div className="flex justify-between items-start gap-4">
                          <p className="text-sm text-dark-100 flex-1">{row.question}</p>
                          <span className="font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded">
                            %{row.percentage}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Kelime Bulutu Sekmesi */}
      {activeTab === 'word_cloud' && (
        <div className="card p-5 space-y-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-dark-100 flex items-center gap-3">
              <FileText className="w-5 h-5 text-primary-400" />
              Kelime Bulutu (Açık Uçlu Yorumlar)
            </h3>
          </div>

          {!wordCloudData ? (
            <div className="p-12 text-center border border-dashed border-dark-700 rounded-xl">
              <p className="text-dark-300">Ankette açık uçlu (metin) soru bulunmuyor veya hiç yorum yapılmamış.</p>
            </div>
          ) : (
            <div className="bg-dark-900 border border-dark-800 rounded-xl p-8 flex flex-wrap justify-center items-center gap-4 min-h-[300px]">
              {wordCloudData.map((word, i) => {
                const maxVal = wordCloudData[0].value;
                const minVal = wordCloudData[wordCloudData.length - 1].value;
                // Normalize font size between 14px and 48px
                const fontSize = minVal === maxVal ? 24 : 14 + ((word.value - minVal) / (maxVal - minVal)) * 34;
                
                // Assign a random appealing color
                const colors = ['text-primary-400', 'text-emerald-400', 'text-amber-400', 'text-red-400', 'text-purple-400', 'text-cyan-400', 'text-pink-400'];
                const color = colors[i % colors.length];

                return (
                  <span 
                    key={i} 
                    className={`${color} font-bold transition-all hover:scale-110 cursor-default`}
                    style={{ fontSize: `${fontSize}px`, lineHeight: 1 }}
                    title={`${word.value} kez kullanıldı`}
                  >
                    {word.text}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Trend Analizi Sekmesi */}
      {activeTab === 'trend_report' && (
        <div className="card p-5 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-dark-800 pb-4">
            <div>
              <h3 className="font-bold text-dark-100 flex items-center gap-3">
                <Activity className="w-5 h-5 text-primary-400" />
                Dönemsel Memnuniyet Trend Analizi
              </h3>
              <p className="text-xs text-dark-400 mt-1">Sorunun aylara göre memnuniyet skorunun (0-100%) değişimini izleyin.</p>
            </div>
            
            <div className="w-full sm:w-96">
              <label className="block text-xs text-dark-400 mb-1.5 font-medium">Trendi İzlenecek Soru</label>
              <select
                value={trendTargetQ}
                onChange={e => setTrendTargetQ(e.target.value)}
                className="input w-full bg-dark-950 border-dark-800 h-10 text-sm text-dark-100"
              >
                {crossTabQuestions.targetQs.map(q => (
                  <option key={q.id} value={q.id}>{stripQuestionPrefix(q.title)}</option>
                ))}
              </select>
            </div>
          </div>

          {!trendData || trendData.chartData.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-dark-700 rounded-xl">
              <p className="text-dark-300">Bu soru için yeterli veri bulunamadı veya henüz yanıtlanmamış.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Trend Chart */}
              <div className="bg-dark-950/50 p-6 rounded-xl border border-dark-800">
                <h4 className="text-sm font-semibold text-dark-200 mb-6 flex items-center gap-2">
                  <span>Aylık Skor Trendi (%) -</span>
                  <span className="text-primary-400 font-bold">{stripQuestionPrefix(trendData.tgtQ.title)}</span>
                </h4>
                
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={trendData.chartData}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorSkor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                      <XAxis 
                        dataKey="label" 
                        stroke="#9ca3af" 
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis 
                        domain={[0, 100]} 
                        stroke="#9ca3af" 
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `%${v}`}
                      />
                      <Tooltip
                        contentStyle={{ 
                          backgroundColor: '#111827', 
                          border: '1px solid #374151', 
                          borderRadius: '8px',
                          color: '#f9fafb',
                          fontSize: '12px'
                        }}
                        formatter={(value: any) => [`%${value}`, 'Memnuniyet Skoru']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="Skor" 
                        stroke="#3b82f6" 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#colorSkor)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Trend Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-dark-900 border border-dark-800 rounded-xl p-5">
                  <p className="text-xs text-dark-400 mb-1">En Yüksek Skor</p>
                  <p className="text-2xl font-black text-emerald-400">
                    %{Math.max(...trendData.chartData.map(d => d.Skor)) || 0}
                  </p>
                  <p className="text-[10px] text-dark-500 mt-1">
                    Zirve Dönem: {trendData.chartData.length > 0 ? trendData.chartData.reduce((prev, current) => (prev.Skor > current.Skor) ? prev : current).label : '-'}
                  </p>
                </div>

                <div className="bg-dark-900 border border-dark-800 rounded-xl p-5">
                  <p className="text-xs text-dark-400 mb-1">En Düşük Skor</p>
                  <p className="text-2xl font-black text-red-400">
                    %{Math.min(...trendData.chartData.map(d => d.Skor)) || 0}
                  </p>
                  <p className="text-[10px] text-dark-500 mt-1">
                    En Düşük Dönem: {trendData.chartData.length > 0 ? trendData.chartData.reduce((prev, current) => (prev.Skor < current.Skor) ? prev : current).label : '-'}
                  </p>
                </div>

                <div className="bg-dark-900 border border-dark-800 rounded-xl p-5">
                  <p className="text-xs text-dark-400 mb-1">Genel Ortalama Trendi</p>
                  <p className="text-2xl font-black text-primary-400">
                    %{Math.round(trendData.chartData.reduce((acc, d) => acc + d.Skor, 0) / trendData.chartData.length) || 0}
                  </p>
                  <p className="text-[10px] text-dark-500 mt-1">Son {trendData.chartData.length} ayın ortalaması</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Çapraz Analiz Sekmesi */}
      {activeTab === 'cross_tab' && (
        <div className="card p-5 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-dark-800 pb-4">
            <div>
              <h3 className="font-bold text-dark-100 flex items-center gap-3">
                <Users className="w-5 h-5 text-primary-400" />
                Çapraz Kırılım Analizi (Cross-Tabulation)
              </h3>
              <p className="text-xs text-dark-400 mt-1">Farklı demografik grupların (doktor, hemşire, birim vb.) anket sorularına verdikleri yanıt dağılımını kıyaslayın.</p>
            </div>
          </div>

          {crossTabQuestions.categoryQs.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-dark-700 rounded-xl">
              <p className="text-dark-300">Ankette demografik veya kategorik kırılım yapılabilecek soru bulunamadı.</p>
              <p className="text-xs text-dark-500 mt-1">Bu analiz için en az bir tane farklı seçeneklere sahip (Göreviniz, Biriminiz vb.) soru olmalıdır.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Dropdowns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-dark-900/50 p-4 rounded-xl border border-dark-800">
                <div>
                  <label className="block text-xs text-dark-400 mb-1.5 font-medium">1. Kırılım Seçeneği (Demografi)</label>
                  <select
                    value={crossCategoryQ}
                    onChange={e => setCrossCategoryQ(e.target.value)}
                    className="input w-full bg-dark-950 border-dark-800 h-10 text-sm text-dark-100"
                  >
                    {crossTabQuestions.categoryQs.map(q => (
                      <option key={q.id} value={q.id}>{stripQuestionPrefix(q.title)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-dark-400 mb-1.5 font-medium">2. Hedef Soru (Analiz Edilecek Madde)</label>
                  <select
                    value={crossTargetQ}
                    onChange={e => setCrossTargetQ(e.target.value)}
                    className="input w-full bg-dark-950 border-dark-800 h-10 text-sm text-dark-100"
                  >
                    {crossTabQuestions.targetQs.map(q => (
                      <option key={q.id} value={q.id}>{stripQuestionPrefix(q.title)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Matrix Table */}
              {!crossTabData ? (
                <div className="p-12 text-center border border-dashed border-dark-700 rounded-xl">
                  <p className="text-dark-300">Lütfen analiz parametrelerini seçin.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-dark-800 rounded-xl shadow-inner">
                  <table className="w-full border-collapse text-left text-sm text-dark-200">
                    <thead>
                      <tr className="bg-dark-900 border-b border-dark-800">
                        <th className="p-4 font-bold text-dark-100 w-1/4">GRUP / KIRILIM ({stripQuestionPrefix(crossTabData.catQ.title)})</th>
                        {crossTabData.tgtOptions.map((opt: string, i: number) => (
                          <th key={i} className="p-4 font-semibold text-center text-dark-200">{opt}</th>
                        ))}
                        <th className="p-4 font-bold text-center text-dark-100">Toplam Yanıt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-800 bg-dark-950/20">
                      {crossTabData.catOptions.map((catOpt: string, idx: number) => {
                        const totalAnswers = crossTabData.catTotals[catOpt] || 0;
                        return (
                          <tr key={idx} className="hover:bg-dark-900/30 transition-colors">
                            <td className="p-4 font-medium text-dark-100">{catOpt}</td>
                            {crossTabData.tgtOptions.map((tgtOpt: string, i: number) => {
                              const count = crossTabData.matrix[catOpt]?.[tgtOpt] || 0;
                              const percent = totalAnswers > 0 ? Math.round((count / totalAnswers) * 100) : 0;
                              return (
                                <td key={i} className="p-4 text-center">
                                  <div className="font-bold text-dark-50">{count}</div>
                                  <div className="text-xs text-dark-400">%{percent}</div>
                                </td>
                              );
                            })}
                            <td className="p-4 text-center font-semibold text-primary-400 bg-primary-500/5">{totalAnswers}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Yanıt Detay Modalı */}
      {selectedResponse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-900 border border-dark-700 w-full max-w-2xl rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-dark-800">
              <div>
                <h3 className="text-xl font-bold text-dark-50">Katılımcı Detayları</h3>
                <p className="text-dark-400 text-sm mt-1">
                  {selectedResponse.completed_at
                    ? formatDateTime(selectedResponse.completed_at)
                    : 'Tarih bilinmiyor'}
                </p>
              </div>
              <button
                onClick={() => setSelectedResponse(null)}
                className="p-2 text-dark-400 hover:text-white rounded-lg hover:bg-dark-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {questions.map((q: any, i: number) => {
                if (q.type === 'section') {
                  return (
                    <div key={q.id} className="pt-2 pb-1 border-b border-dark-700">
                      <p className="text-sm font-bold text-primary-400 uppercase tracking-wide">{q.title}</p>
                    </div>
                  )
                }

                const ans = selectedResponse.response_answers?.find((a: any) => a.question_id === q.id)
                const ansStr = getAnswerValue(ans)
                const qNum = questions.slice(0, i).filter((x: any) => x.type !== 'section').length + 1

                return (
                  <div key={q.id} className="p-4 bg-dark-800/50 rounded-xl border border-dark-800">
                    <p className="text-xs font-medium text-dark-400 mb-1.5">{qNum}. {q.title}</p>
                    <p className={`font-medium whitespace-pre-wrap ${ansStr === '-' ? 'text-dark-500 italic' : 'text-dark-100'}`}>
                      {ansStr === '-' ? 'Yanıtlanmadı' : ansStr}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

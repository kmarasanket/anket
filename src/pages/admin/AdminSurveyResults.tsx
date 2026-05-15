import { useEffect, useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Users, Download, Activity, LayoutList, X, Calendar, Filter, FileSpreadsheet, FileText, PieChart as PieChartIcon } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
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
  const [activeTab, setActiveTab] = useState<'participants' | 'report' | 'score_report' | 'chart_report'>('participants')

  // Rapor Ayarları
  const [pageSize, setPageSize] = useState<'a4' | 'a3'>('a4')
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')

  // Filtre modu: 'range' = tarih aralığı, 'month' = ay/yıl seçimi
  const [filterMode, setFilterMode] = useState<'range' | 'month'>('month')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedYear, setSelectedYear] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('')

  useEffect(() => {
    const loadResults = async () => {
      setLoading(true)
      try {
        // 1. Anket + Sorular + Yanıtlar paralel çek
        const qSurvey = httpFrom('surveys').select('*')
        qSurvey.eq('id', id!)

        const qQuestions = httpFrom('questions').select('*')
        qQuestions.eq('survey_id', id!)
        qQuestions.order('order_index', { ascending: true })

        // 1. Önce anketi ve soruları al
        const [surveyRes, questionsRes] = await Promise.all([
          qSurvey.single().execute(),
          qQuestions.execute()
        ])

        // 2. Yanıtları al (Join yerine düz çekip sonra kendimiz eşleştireceğiz - Daha güvenli)
        const qResp = httpFrom('responses').select('*')
        qResp.eq('survey_id', id!)
        qResp.eq('is_complete', 'true')
        qResp.order('completed_at', { ascending: false })
        
        const responsesRes = await qResp.execute()
        const rawResponses = responsesRes.data || []

        // 3. Eğer yanıt varsa, bu yanıtlara ait tüm cevapları tek seferde çek
        let enrichedResponses = rawResponses
        if (rawResponses.length > 0) {
          const responseIds = rawResponses.map((r: any) => r.id)
          const qAns = httpFrom('response_answers').select('*')
          qAns.in('response_id', responseIds)
          
          const answersRes = await qAns.execute()
          const allAnswers = answersRes.data || []

          // Cevapları yanıtlarla eşleştir
          enrichedResponses = rawResponses.map((r: any) => ({
            ...r,
            response_answers: allAnswers.filter((a: any) => a.response_id === r.id)
          }))
        }

        setSurvey(surveyRes.data)
        setQuestions(questionsRes.data || [])
        setResponses(enrichedResponses)
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

  const findResponseAnswer = (response: any, question: any) => {
    if (!response.response_answers || response.response_answers.length === 0) return null
    const ansById = response.response_answers.find((a: any) => a.question_id === question.id)
    if (ansById) return ansById
    const qIdx = questions.findIndex(q => q.id === question.id)
    if (qIdx !== -1 && response.response_answers[qIdx]) return response.response_answers[qIdx]
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
      return { question: q.title, counts }
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

  const exportPDF = () => {
    const element = document.getElementById('report-table-print-area')
    if (!element) return
    const opt = {
      margin:       0,
      filename:     `${survey?.title || 'Rapor'}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }
    html2pdf().set(opt).from(element).save()
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
              if (val.split(', ').includes(opt)) count++
            } else {
              if (val === opt) count++
            }
          })
          data.push({ name: opt, value: count })
        })

        return {
          id: q.id,
          title: q.title,
          data: data.filter(d => d.value > 0) // Sadece yanıtı olanları göster (isteğe bağlı)
        }
      })
      .filter(q => q.data.length > 0)
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
                  {filteredResponses.map((r, i) => {
                    const browser = r.metadata?.b === 'ch' ? 'Chrome'
                      : r.metadata?.b === 'ff' ? 'Firefox'
                      : r.metadata?.b === 'sf' ? 'Safari'
                      : r.metadata?.b === 'ed' ? 'Edge'
                      : 'Diğer'
                    const isMobile = r.metadata?.m === 1

                    return (
                      <tr key={r.id} className="hover:bg-dark-800/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-dark-200">
                          #{filteredResponses.length - i}
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
          )}
        </div>
      )}
      
      {activeTab === 'report' && (
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-primary-400" />
              <h3 className="font-bold text-dark-100">Rapor Önizleme</h3>
              <div className="flex items-center gap-2 bg-dark-800 p-1 rounded-lg">
                <button 
                  onClick={() => setPageSize('a4')} 
                  className={`px-2 py-1 text-[10px] rounded ${pageSize === 'a4' ? 'bg-primary-500 text-white' : 'text-dark-400'}`}
                >A4</button>
                <button 
                  onClick={() => setPageSize('a3')} 
                  className={`px-2 py-1 text-[10px] rounded ${pageSize === 'a3' ? 'bg-primary-500 text-white' : 'text-dark-400'}`}
                >A3</button>
                <div className="w-px h-3 bg-dark-700 mx-1"></div>
                <button 
                  onClick={() => setOrientation('portrait')} 
                  className={`px-2 py-1 text-[10px] rounded ${orientation === 'portrait' ? 'bg-primary-500 text-white' : 'text-dark-400'}`}
                >Dikey</button>
                <button 
                  onClick={() => setOrientation('landscape')} 
                  className={`px-2 py-1 text-[10px] rounded ${orientation === 'landscape' ? 'bg-primary-500 text-white' : 'text-dark-400'}`}
                >Yatay</button>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={exportReportExcel} className="btn-md btn-secondary gap-2 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30">
                <FileSpreadsheet className="w-4 h-4" /> Excel İndir
              </button>
              <button onClick={() => {
                const element = document.getElementById('report-table-print-area')
                if (!element) return
                html2pdf().set({
                  margin: 10,
                  filename: `${survey?.title || 'Rapor'}.pdf`,
                  image: { type: 'jpeg', quality: 0.98 },
                  html2canvas: { scale: 2 },
                  jsPDF: { unit: 'mm', format: pageSize, orientation: orientation }
                }).from(element).save()
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
                className="bg-white text-black shadow-2xl relative transition-all duration-300"
                style={{ 
                  width: orientation === 'portrait' 
                    ? (pageSize === 'a4' ? '210mm' : '297mm') 
                    : (pageSize === 'a4' ? '297mm' : '420mm'),
                  minHeight: orientation === 'portrait' 
                    ? (pageSize === 'a4' ? '297mm' : '420mm') 
                    : (pageSize === 'a4' ? '210mm' : '297mm'),
                  maxWidth: 'none', 
                  padding: '10mm', 
                  boxSizing: 'border-box' 
                }}
              >
                <style>{`
                  #report-table {
                    font-family: Arial, sans-serif;
                    font-size: 11px;
                    width: 100%;
                    border-collapse: collapse;
                    color: black;
                  }
                  #report-table th, #report-table td {
                    border: 1px solid #444;
                    padding: 6px 4px;
                    text-align: center;
                    vertical-align: middle;
                  }
                  #report-table .text-left { text-align: left; }
                  #report-table .font-bold { font-weight: bold; }
                  #report-table .header-info td { border: none; padding: 2px 0; text-align: left; font-size: 12px; }
                  #report-table th { background-color: #f3f4f6; font-weight: bold; }
                  #report-table .bg-gray-100 { background-color: #f3f4f6 !important; }
                  
                  /* Satır hover efekti PDF'e yansımaz, sadece ekranda şık durur */
                  @media screen {
                    #report-table tr.hover-row:hover { background-color: #f9fafb; }
                  }
                `}</style>
                
                <table id="report-table">
                  <tbody>
                    <tr className="header-info"><td colSpan={reportData.options.length + 1} className="font-bold text-[24px] uppercase pb-6 border-b border-black" style={{ fontSize: '24px' }}>SEÇENEK BAZINDA VERİLEN CEVAP SAYISI VE ORANI</td></tr>
                    <tr><td colSpan={reportData.options.length + 1} style={{height: '10px', border: 'none'}}></td></tr>
                    <tr className="header-info"><td colSpan={reportData.options.length + 1}>Anket Adı: <span className="font-bold">{survey?.title}</span></td></tr>
                    <tr className="header-info"><td colSpan={reportData.options.length + 1}>Yıl/Ay: <span className="font-bold">{selectedYear ? `${selectedYear} / ${MONTH_NAMES[Number(selectedMonth)] || 'Tümü'}` : (dateFrom ? `${dateFrom} - ${dateTo}` : 'Tüm Zamanlar')}</span></td></tr>
                    <tr className="header-info"><td colSpan={reportData.options.length + 1}>Hastane Adı: <span className="font-bold">{tenant?.name || '-'}</span></td></tr>
                    <tr className="header-info"><td colSpan={reportData.options.length + 1}>İlgili Dönemde Anket Uygulanan Kişi Sayısı: <span className="font-bold">{filteredResponses.length}</span></td></tr>
                    <tr><td colSpan={reportData.options.length + 1} style={{height: '15px', border: 'none'}}></td></tr>
                    
                    <tr>
                      <th className="text-left bg-gray-100" rowSpan={2} style={{ width: '45%' }}>SORULAR</th>
                      <th colSpan={reportData.options.length} className="bg-gray-100">Cevap Seçeneği (Kişi Sayısı)</th>
                    </tr>
                    <tr>
                      {reportData.options.map((opt: string, i: number) => (
                        <th key={i} className="bg-gray-100">{opt}</th>
                      ))}
                    </tr>
                    
                    {reportData.rows.map((row, i) => (
                      <tr key={i} className="hover-row">
                        <td className="text-left">{row.question}</td>
                        {reportData.options.map((opt: string, j: number) => (
                          <td key={j}>{row.counts[opt]}</td>
                        ))}
                      </tr>
                    ))}
                    
                    <tr><td colSpan={reportData.options.length + 1} style={{height: '5px', border: 'none'}}></td></tr>

                    <tr>
                      <td className="text-left font-bold bg-gray-100">Seçenek Bazında Verilen Toplam Cevap Sayısı<br/><span className="font-normal text-[10px]">({reportData.options.join(', ')} Toplamı)</span></td>
                      {reportData.options.map((opt: string, i: number) => (
                        <td key={i} className="font-bold bg-gray-100">{reportData.totals[opt]}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="text-left font-bold bg-gray-100">Toplam Cevap Sayısı<br/><span className="font-normal text-[10px]">(Anketteki Soru Sayısı X Anket Uygulanan Kişi Sayısı)</span></td>
                      <td colSpan={reportData.options.length} className="font-bold bg-gray-100">{reportData.grandTotal}</td>
                    </tr>
                    <tr>
                      <td className="text-left font-bold bg-gray-100">Seçenek Bazında Verilen Cevap Oranı<br/><span className="font-normal text-[10px]">(Her Seçenekte Verilen Toplam Cevap Sayısı / Toplam Cevap Sayısı)</span></td>
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
              <div className="flex items-center gap-2 bg-dark-800 p-1 rounded-lg">
                <button 
                  onClick={() => setPageSize('a4')} 
                  className={`px-2 py-1 text-[10px] rounded ${pageSize === 'a4' ? 'bg-primary-500 text-white' : 'text-dark-400'}`}
                >A4</button>
                <button 
                  onClick={() => setPageSize('a3')} 
                  className={`px-2 py-1 text-[10px] rounded ${pageSize === 'a3' ? 'bg-primary-500 text-white' : 'text-dark-400'}`}
                >A3</button>
                <div className="w-px h-3 bg-dark-700 mx-1"></div>
                <button 
                  onClick={() => setOrientation('portrait')} 
                  className={`px-2 py-1 text-[10px] rounded ${orientation === 'portrait' ? 'bg-primary-500 text-white' : 'text-dark-400'}`}
                >Dikey</button>
                <button 
                  onClick={() => setOrientation('landscape')} 
                  className={`px-2 py-1 text-[10px] rounded ${orientation === 'landscape' ? 'bg-primary-500 text-white' : 'text-dark-400'}`}
                >Yatay</button>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => {
                const element = document.getElementById('chart-report-print-area')
                if (!element) return
                html2pdf().set({
                  margin: 10,
                  filename: `${survey?.title || 'Grafik Rapor'}.pdf`,
                  image: { type: 'jpeg', quality: 0.98 },
                  html2canvas: { scale: 2, useCORS: true },
                  jsPDF: { unit: 'mm', format: pageSize, orientation: orientation }
                }).from(element).save()
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
                className="bg-white text-black shadow-2xl relative transition-all duration-300"
                style={{ 
                  width: orientation === 'portrait' 
                    ? (pageSize === 'a4' ? '210mm' : '297mm') 
                    : (pageSize === 'a4' ? '297mm' : '420mm'),
                  minHeight: orientation === 'portrait' 
                    ? (pageSize === 'a4' ? '297mm' : '420mm') 
                    : (pageSize === 'a4' ? '210mm' : '297mm'),
                  maxWidth: 'none', 
                  padding: '15mm', 
                  boxSizing: 'border-box' 
                }}
              >
                {/* Header Info (Same as other reports for consistency) */}
                <div className="border-b-2 border-black pb-4 mb-6">
                  <h1 className="text-2xl font-bold uppercase mb-4">SORU BAZINDA SONUÇ ANALİZİ (GRAFİK)</h1>
                  <div className="grid grid-cols-1 gap-1 text-sm">
                    <p>Anket Adı: <span className="font-bold">{survey?.title}</span></p>
                    <p>Yıl/Ay: <span className="font-bold">{selectedYear ? `${selectedYear} / ${MONTH_NAMES[Number(selectedMonth)] || 'Tümü'}` : (dateFrom ? `${dateFrom} - ${dateTo}` : 'Tüm Zamanlar')}</span></p>
                    <p>Hastane Adı: <span className="font-bold">{tenant?.name || '-'}</span></p>
                    <p>Anket Uygulanan Kişi Sayısı: <span className="font-bold">{filteredResponses.length}</span></p>
                  </div>
                </div>

                <div className="space-y-12">
                  {chartReportData.map((item, idx) => (
                    <div key={item.id} className="break-inside-avoid">
                      <h4 className="text-sm font-bold mb-4 flex gap-2">
                        <span>{idx + 1}.</span>
                        <span>{item.title}</span>
                      </h4>
                      <div className="flex flex-col md:flex-row items-center gap-4">
                        <div className="w-full h-[250px] max-w-[400px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={item.data}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                              >
                                {item.data.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip />
                              <Legend verticalAlign="bottom" height={36}/>
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex-1 w-full">
                          <table className="w-full text-xs border-collapse border border-gray-300">
                            <thead>
                              <tr className="bg-gray-100">
                                <th className="border border-gray-300 p-2 text-left">Seçenek</th>
                                <th className="border border-gray-300 p-2 text-center">Sayı</th>
                                <th className="border border-gray-300 p-2 text-center">Oran</th>
                              </tr>
                            </thead>
                            <tbody>
                              {item.data.map((d, i) => {
                                const total = item.data.reduce((acc, curr) => acc + curr.value, 0)
                                const percentage = total > 0 ? ((d.value / total) * 100).toFixed(1) : 0
                                return (
                                  <tr key={i}>
                                    <td className="border border-gray-300 p-2 text-left flex items-center gap-2">
                                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}></div>
                                      {d.name}
                                    </td>
                                    <td className="border border-gray-300 p-2 text-center font-medium">{d.value}</td>
                                    <td className="border border-gray-300 p-2 text-center font-medium">%{percentage}</td>
                                  </tr>
                                )
                              })}
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

import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Users, Download, Activity, LayoutList, X, Calendar, Filter } from 'lucide-react'
import { httpFrom } from '../../lib/supabaseHttp'
import { formatDateTime } from '../../lib/utils'

export default function AdminSurveyResults() {
  const { id } = useParams()
  const [survey, setSurvey] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [responses, setResponses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedResponse, setSelectedResponse] = useState<any>(null)

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

        const qResp = httpFrom('responses').select('*, response_answers(*)')
        qResp.eq('survey_id', id!)
        qResp.eq('is_complete', 'true')
        qResp.order('completed_at', { ascending: false })

        const [surveyRes, questionsRes, responsesRes] = await Promise.all([
          qSurvey.single().execute(),
          qQuestions.execute(),
          qResp.execute()
        ])

        setSurvey(surveyRes.data)
        setQuestions(questionsRes.data || [])
        setResponses(responsesRes.data || [])
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

  // Excel / CSV indir
  const downloadExcel = () => {
    const dataQuestions = questions.filter(q => q.type !== 'section')
    const BOM = '\ufeff'
    const headers = ['#', 'Tarih/Saat', 'Ay/Yıl', ...dataQuestions.map(q => q.title)]
    let csv = BOM + headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(',') + '\n'

    filteredResponses.forEach((r, idx) => {
      const dateStr = r.completed_at ? formatDateTime(r.completed_at) : '-'
      const monthYear = r.completed_at
        ? new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date(r.completed_at))
        : '-'

      const row: string[] = [
        String(filteredResponses.length - idx),
        dateStr,
        monthYear,
        ...dataQuestions.map(q => {
          const ans = r.response_answers?.find((a: any) => a.question_id === q.id)
          return `"${getAnswerValue(ans).replace(/"/g, '""')}"`
        })
      ]
      csv += row.join(',') + '\n'
    })

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${survey?.title || 'Anket'}-Sonuclar.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
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
              {survey.status === 'active' ? 'Yayında' : survey.status === 'closed' ? 'Kapalı' : 'Taslak'}
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

      {/* Katılımcı Tablosu */}
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

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Users, Download, Activity, LayoutList, X } from 'lucide-react'
import { httpFrom } from '../../lib/supabaseHttp'
import { formatDateTime } from '../../lib/utils'

export default function AdminSurveyResults() {
  const { id } = useParams()
  const [survey, setSurvey] = useState<any>(null)
  const [responses, setResponses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedResponse, setSelectedResponse] = useState<any>(null)

  useEffect(() => {
    const loadResults = async () => {
      // 1. Anket bilgilerini çek
      const qSurvey = httpFrom('surveys').select('*')
      qSurvey.eq('id', id!)
      const { data: s } = await qSurvey.single().execute()
      setSurvey(s)

      // 2. Yanıtları çek
      const qResp = httpFrom('responses').select('*, response_answers(*)')
      qResp.eq('survey_id', id!)
      qResp.eq('is_complete', 'true')
      qResp.order('completed_at', { ascending: false })
      const { data: r } = await qResp.execute()

      setResponses(r || [])
      setLoading(false)
    }
    if (id) loadResults()
  }, [id])

  // Flat list of questions for easy matching
  const getQuestions = () => {
    const qList: any[] = []
    survey?.pages?.forEach((p: any) => {
      p.questions?.forEach((q: any) => qList.push(q))
    })
    return qList
  }

  const downloadExcel = () => {
    const questions = getQuestions()
    let csv = "Tarih/Saat,Dönem (Ay/Yıl)," + questions.map(q => `"${String(q.title || '').replace(/"/g, '""')}"`).join(',') + "\n"

    responses.forEach(r => {
      const dateStr = r.completed_at ? formatDateTime(r.completed_at) : '-'
      const monthYear = r.completed_at ? new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date(r.completed_at)) : '-'
      
      const row = [dateStr, monthYear]
      questions.forEach(q => {
        const answer = r.response_answers?.find((a: any) => a.question_id === q.id)
        let ansStr = ''
        if (answer?.answer?.value !== undefined) {
          const val = answer.answer.value
          ansStr = Array.isArray(val) ? val.join(', ') : String(val)
        }
        row.push(`"${ansStr.replace(/"/g, '""')}"`)
      })
      csv += row.join(',') + "\n"
    })

    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${survey.title}-Sonuclar.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  if (loading) return <div className="p-12 text-center text-dark-400">Sonuçlar Yükleniyor...</div>
  if (!survey) return <div className="p-12 text-center text-red-400">Anket bulunamadı.</div>

  const allQuestions = getQuestions()

  return (
    <div className="animate-in space-y-6">
      
      {/* Üst Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/admin/anketler" className="btn-sm btn-ghost p-2">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="page-header mb-0">
            <h1 className="page-title">{survey.title} — Sonuçlar</h1>
            <p className="page-subtitle">Toplam {responses.length} kişi tamamladı</p>
          </div>
        </div>
        <button onClick={downloadExcel} className="btn-md btn-secondary gap-2 hidden md:flex">
          <Download className="w-4 h-4" /> Excel Olarak İndir
        </button>
      </div>

      {/* İstatistik Özetleri */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <p className="text-xl font-bold text-dark-50 capitalize">
              {survey.status === 'active' ? 'Yayında' : survey.status === 'closed' ? 'Kapalı' : 'Taslak'}
            </p>
          </div>
        </div>
      </div>

      {/* Katılımcı Listesi */}
      <div className="card">
        <div className="p-5 border-b border-dark-800 flex items-center gap-3">
          <LayoutList className="w-5 h-5 text-accent-400" />
          <h3 className="font-semibold text-dark-100">Son Katılımcılar</h3>
        </div>
        
        <div className="divide-y divide-dark-800">
          {responses.length === 0 ? (
            <div className="p-8 text-center text-dark-400">
              Henüz kimse bu anketi yanıtlamadı.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-dark-900 border-b border-dark-800 text-dark-400">
                  <tr>
                    <th className="px-6 py-4 font-medium">Katılım Formatı</th>
                    <th className="px-6 py-4 font-medium">Tarih / Saat</th>
                    <th className="px-6 py-4 font-medium text-right">Detaylar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800">
                  {responses.map((r, i) => (
                    <tr key={r.id} className="hover:bg-dark-800/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-dark-200">
                        Katılımcı #{responses.length - i}
                      </td>
                      <td className="px-6 py-4 text-dark-400">
                        {r.completed_at ? formatDateTime(r.completed_at) : '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => setSelectedResponse(r)} className="text-primary-400 hover:text-primary-300 font-medium">
                          İncele
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Sonuç İnceleme Modalı */}
      {selectedResponse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-dark-900 border border-dark-700 w-full max-w-2xl rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-dark-800">
              <div>
                <h3 className="text-xl font-bold text-dark-50">Katılımcı Detayları</h3>
                <p className="text-dark-400 text-sm mt-1">{formatDateTime(selectedResponse.completed_at)}</p>
              </div>
              <button onClick={() => setSelectedResponse(null)} className="p-2 text-dark-400 hover:text-white rounded-lg hover:bg-dark-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              {allQuestions.map((q: any, i: number) => {
                const answer = selectedResponse.response_answers?.find((a: any) => a.question_id === q.id)
                let ansStr = '-'
                if (answer?.answer_data?.value !== undefined && answer.answer_data.value !== '') {
                  const val = answer.answer_data.value
                  ansStr = Array.isArray(val) ? val.join(', ') : String(val)
                }

                return (
                  <div key={q.id} className="p-4 bg-dark-800/50 rounded-xl border border-dark-800">
                    <p className="text-sm font-medium text-dark-300 mb-2">{i+1}. {q.title}</p>
                    <p className="text-dark-100 font-medium whitespace-pre-wrap">{ansStr}</p>
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

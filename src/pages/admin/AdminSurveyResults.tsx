import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Users, Download, Activity, LayoutList } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'

export default function AdminSurveyResults() {
  const { id } = useParams()
  const [survey, setSurvey] = useState<any>(null)
  const [responses, setResponses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadResults = async () => {
      // 1. Anket bilgilerini çek
      const { data: s } = await supabase.from('surveys').select('*').eq('id', id).single()
      setSurvey(s)

      // 2. Yanıtları tam liste yerine sayım ve basit listeleme olarak çek
      // Gerçek bir sistemde bu sayfa için her soruya göre gruplama yapılarak chartlar çizilir.
      const { data: r } = await supabase.from('responses')
        .select('*, response_answers(*)')
        .eq('survey_id', id)
        .eq('is_complete', true)
        .order('completed_at', { ascending: false })

      setResponses(r || [])
      setLoading(false)
    }
    if (id) loadResults()
  }, [id])

  if (loading) return <div className="p-12 text-center text-dark-400">Sonuçlar Yükleniyor...</div>
  if (!survey) return <div className="p-12 text-center text-red-400">Anket bulunamadı.</div>

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
        <button className="btn-md btn-secondary gap-2 hidden md:flex">
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
                    <th className="px-6 py-4 font-medium">Tarih</th>
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
                        {r.completed_at ? formatDate(r.completed_at) : '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-primary-400 hover:text-primary-300 font-medium">
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

    </div>
  )
}

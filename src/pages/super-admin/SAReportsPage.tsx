import { useEffect, useState, useMemo } from 'react'
import {
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts'
import { BarChart3, Download, Calendar, Building2, FileText, Users, Activity, CheckCircle, Search } from 'lucide-react'
import html2pdf from 'html2pdf.js'
import { httpFrom } from '../../lib/supabaseHttp'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']

export default function SAReportsPage() {
  const [loading, setLoading] = useState(true)
  const [tenants, setTenants] = useState<any[]>([])
  const [surveys, setSurveys] = useState<any[]>([])
  const [responses, setResponses] = useState<any[]>([])
  const [searchText, setSearchText] = useState('')

  useEffect(() => {
    const loadSystemData = async () => {
      setLoading(true)
      try {
        // 1. Kurumları, Anketleri ve Yanıtları paralel çek (N+1 yok)
        const qTenants = httpFrom('tenants').select('id, name')
        const qSurveys = httpFrom('surveys').select('id, title, status, tenant_id, response_count, created_at')
        const qResponses = httpFrom('responses').select('tenant_id, completed_at').eq('is_complete', 'true')

        const [tRes, sRes, rRes] = await Promise.all([
          qTenants.execute(),
          qSurveys.execute(),
          qResponses.execute()
        ])

        if (tRes.error) throw tRes.error
        if (sRes.error) throw sRes.error
        if (rRes.error) throw rRes.error

        setTenants(tRes.data || [])
        setSurveys(sRes.data || [])
        setResponses(rRes.data || [])
      } catch (err) {
        console.error('Sistem raporları yüklenemedi:', err)
      } finally {
        setLoading(false)
      }
    }
    loadSystemData()
  }, [])

  // Kurum Haritası (tenant_id -> Kurum Adı)
  const tenantMap = useMemo(() => {
    const map: Record<string, string> = {}
    tenants.forEach(t => map[t.id] = t.name)
    return map
  }, [tenants])

  // İstatistik Hesaplamaları
  const stats = useMemo(() => {
    const totalTenants = tenants.length
    const totalSurveys = surveys.length
    const totalResponses = responses.length
    const activeSurveys = surveys.filter(s => s.status === 'active').length

    return { totalTenants, totalSurveys, totalResponses, activeSurveys }
  }, [tenants, surveys, responses])

  // Kurum Bazında Katılım Payı Grafiği Verisi
  const tenantChartData = useMemo(() => {
    const counts: Record<string, number> = {}
    responses.forEach(r => {
      if (r.tenant_id) {
        counts[r.tenant_id] = (counts[r.tenant_id] || 0) + 1
      }
    })

    const data = Object.entries(counts).map(([tid, count]) => ({
      name: tenantMap[tid] || 'Bilinmeyen Kurum',
      value: count
    })).sort((a, b) => b.value - a.value)

    return data.slice(0, 8) // Sadece en çok katılım alan ilk 8 kurumu göster
  }, [responses, tenantMap])

  // Son 15 Günlük Katılım Trendi Grafiği Verisi
  const timelineChartData = useMemo(() => {
    const timelineCounts: Record<string, number> = {}
    const last15Days: string[] = []

    for (let i = 14; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      last15Days.push(key)
      timelineCounts[key] = 0
    }

    responses.forEach(r => {
      if (r.completed_at) {
        const key = r.completed_at.split('T')[0]
        if (key in timelineCounts) {
          timelineCounts[key]++
        }
      }
    })

    return last15Days.map(key => {
      const d = new Date(key)
      const label = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
      return {
        date: label,
        Katılım: timelineCounts[key]
      }
    })
  }, [responses])

  // Filtrelenmiş Anket Listesi
  const filteredSurveys = useMemo(() => {
    return surveys.filter(s => {
      const tName = (tenantMap[s.tenant_id] || '').toLowerCase()
      const sTitle = (s.title || '').toLowerCase()
      const search = searchText.toLowerCase()
      return tName.includes(search) || sTitle.includes(search)
    }).sort((a, b) => (b.response_count || 0) - (a.response_count || 0))
  }, [surveys, tenantMap, searchText])

  // PDF Rapor Çıktısı Al
  const exportPDF = async () => {
    const element = document.getElementById('system-reports-print-area')
    if (!element) return

    element.classList.add('print-pdf-mode')
    const opt = {
      margin: 10,
      filename: `Sistem_Geneli_Analiz_Raporu.pdf`,
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

  if (loading) return <div className="p-12 text-center text-dark-400">Sistem raporları hesaplanıyor...</div>

  return (
    <div className="animate-in space-y-6">
      
      {/* Üst Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="page-header mb-0">
          <h1 className="page-title">Sistem Raporları</h1>
          <p className="page-subtitle">Sistem genelindeki tüm kurumların, anketlerin ve katılımların özet analizleri.</p>
        </div>
        <button onClick={exportPDF} className="btn-md btn-primary gap-2 shrink-0">
          <Download className="w-4 h-4" /> Sistem Analiz Raporu (PDF)
        </button>
      </div>

      <div className="space-y-6" id="system-reports-print-area">
        
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
          .print-pdf-mode .pdf-hidden {
            display: none !important;
          }
        `}</style>

        {/* PDF Üst Bilgi Başlığı (Sadece PDF formatında basılacak) */}
        <div className="hidden print-pdf-mode:block border-b-2 border-primary-600 pb-4 mb-6">
          <h2 className="text-xl font-bold uppercase text-primary-600">Sistem Geneli Ölçme ve Değerlendirme Raporu</h2>
          <div className="text-xs text-dark-500 mt-2">
            Rapor Tarihi: <strong>{new Date().toLocaleDateString('tr-TR')}</strong> | Yetki Grubu: <strong>Süper Yönetici / İl Sağlık Müdürlüğü</strong>
          </div>
        </div>

        {/* 1. SİSTEM GENELİ METRİK KARTLARI */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Toplam Kurum */}
          <div className="stat-card p-5">
            <div className="stat-icon bg-blue-500/10 text-blue-400 shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-dark-400 text-xs mb-1 font-semibold uppercase tracking-wide">Kayıtlı Kurum</p>
              <p className="text-2xl font-bold text-dark-50">{stats.totalTenants}</p>
            </div>
          </div>

          {/* Toplam Anket */}
          <div className="stat-card p-5">
            <div className="stat-icon bg-emerald-500/10 text-emerald-400 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-dark-400 text-xs mb-1 font-semibold uppercase tracking-wide">Toplam Anket</p>
              <p className="text-2xl font-bold text-dark-50">{stats.totalSurveys}</p>
            </div>
          </div>

          {/* Aktif Anket */}
          <div className="stat-card p-5">
            <div className="stat-icon bg-amber-500/10 text-amber-400 shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <p className="text-dark-400 text-xs mb-1 font-semibold uppercase tracking-wide">Aktif Anket</p>
              <p className="text-2xl font-bold text-dark-50">{stats.activeSurveys}</p>
            </div>
          </div>

          {/* Toplam Katılım */}
          <div className="stat-card p-5">
            <div className="stat-icon bg-purple-500/10 text-purple-400 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-dark-400 text-xs mb-1 font-semibold uppercase tracking-wide">Toplam Katılım</p>
              <p className="text-2xl font-bold text-dark-50">{stats.totalResponses}</p>
            </div>
          </div>

        </div>

        {/* 2. ANALİZ GRAFİKLERİ GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Kurum Katılım Dağılımı (Pie Chart) */}
          <div className="card p-6">
            <h3 className="text-dark-100 font-bold mb-6 flex items-center gap-2 text-sm uppercase tracking-wider border-b border-dark-800 pb-3">
              <BarChart3 className="w-4 h-4 text-primary-400" />
              Kurum Bazında Katılım Payı (En Çok Katılım Alan 8 Kurum)
            </h3>
            
            {tenantChartData.length === 0 ? (
              <div className="h-72 flex items-center justify-center text-xs text-dark-500">
                Grafik oluşturulacak katılım verisi bulunmamaktadır.
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={tenantChartData}
                      cx="50%" cy="50%"
                      innerRadius={60} outerRadius={100}
                      paddingAngle={4}
                      dataKey="value"
                      label={({ name, percent }) => `${name.substring(0, 15)}... (${(percent * 100).toFixed(0)}%)`}
                      labelLine={false}
                    >
                      {tenantChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.75rem' }}
                      itemStyle={{ color: '#f8fafc', fontSize: '11px' }}
                      formatter={(val: number) => [`${val} Tamamlanan Yanıt`, 'Yanıt Sayısı']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Son 15 Günlük Katılım Trendi (Area Chart) */}
          <div className="card p-6">
            <h3 className="text-dark-100 font-bold mb-6 flex items-center gap-2 text-sm uppercase tracking-wider border-b border-dark-800 pb-3">
              <Calendar className="w-4 h-4 text-secondary-400" />
              Sistem Geneli Günlük Katılım Trendi (Son 15 Gün)
            </h3>
            
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineChartData}>
                  <defs>
                    <linearGradient id="colorKatilim" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                  <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.75rem', color: '#f8fafc', fontSize: '11px' }} 
                  />
                  <Area
                    type="monotone"
                    dataKey="Katılım"
                    stroke="#10b981"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorKatilim)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* 3. SİSTEM GENELİ DETAYLI ANKET TABLOSU */}
        <div className="card overflow-hidden">
          <div className="p-5 border-b border-dark-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-dark-100 text-sm uppercase tracking-wider flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-primary-400" />
                Kurumsal Anket Katılım ve Performans Listesi
              </h3>
              <p className="text-xs text-dark-400 mt-1">Sistemdeki tüm kurumlara ait aktif/pasif anketler ve katılım sayıları.</p>
            </div>
            
            {/* Arama Alanı (Sadece PDF'te gizlenecek) */}
            <div className="relative w-full sm:w-72 pdf-hidden">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
              <input
                type="text"
                placeholder="Kurum veya anket adı arayın..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="input w-full pl-9 h-10 bg-dark-900 border-dark-800 text-xs text-dark-100"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-dark-900 border-b border-dark-800 text-dark-400 text-xs">
                <tr>
                  <th className="px-6 py-4 font-semibold">Anket Başlığı</th>
                  <th className="px-6 py-4 font-semibold">İlgili Kurum / Hastane</th>
                  <th className="px-6 py-4 font-semibold text-center">Toplam Katılım</th>
                  <th className="px-6 py-4 font-semibold text-center">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {filteredSurveys.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-dark-500 italic">
                      Arama kriterlerinize uygun anket bulunamadı.
                    </td>
                  </tr>
                ) : (
                  filteredSurveys.map(s => {
                    const statusText = s.status === 'active' ? 'Yayında' : 'Pasif';
                    const statusColor = s.status === 'active' 
                      ? 'text-emerald-400 bg-emerald-500/10' 
                      : 'text-dark-500 bg-dark-800';

                    return (
                      <tr key={s.id} className="hover:bg-dark-900/30 transition-colors table-row">
                        <td className="px-6 py-4 font-medium text-dark-100">{s.title}</td>
                        <td className="px-6 py-4 text-dark-350">{tenantMap[s.tenant_id] || '-'}</td>
                        <td className="px-6 py-4 text-center font-bold text-dark-200">{s.response_count || 0}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${statusColor}`}>
                            {statusText}
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

      </div>
    </div>
  )
}

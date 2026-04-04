import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell
} from 'recharts'
import { BarChart3, Download, Calendar } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const COLORS = ['#6366f1', '#22c55e', '#f97316', '#eab308', '#ec4899', '#8b5cf6']

export default function SAReportsPage() {
  const [data, setData] = useState({
    tenantResponses: [] as any[],
    timelineData: [] as any[],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Demo verisi (Gerçek uygulamada Supabase RPC veya gruplanmış sorgular kullanılır)
    // Şimdilik görselleştirmeyi göstermek için statik/rastgele demo verisi üretiyoruz
    const loadDemoData = () => {
      const tenantResponses = [
        { name: 'Sağlık Yön.', value: 450 },
        { name: 'Bilgi İşlem', value: 320 },
        { name: 'İnsan Kayn.', value: 280 },
        { name: 'Destek Hizm.', value: 150 },
      ]

      const timelineData = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - (6 - i))
        return {
          date: d.toLocaleDateString('tr-TR', { weekday: 'short' }),
          yanit: Math.floor(Math.random() * 50) + 10,
        }
      })

      setData({ tenantResponses, timelineData })
      setLoading(false)
    }

    loadDemoData()
  }, [])

  return (
    <div className="animate-in space-y-6">
      <div className="flex items-center justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Sistem Raporları</h1>
          <p className="page-subtitle">Sistem geneli katılım istatistikleri</p>
        </div>
        <button className="btn-md btn-secondary">
          <Download className="w-4 h-4" /> Dışa Aktar (PDF)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Kurum Katılım Dağılımı */}
        <div className="card p-6">
          <h3 className="text-dark-100 font-semibold mb-6 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary-400" />
            Kurumlara Göre Katılım (Top 4)
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.tenantResponses}
                  cx="50%" cy="50%"
                  innerRadius={60} outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {data.tenantResponses.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '0.75rem' }}
                  itemStyle={{ color: '#f8fafc' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Son 7 Gün Trendi */}
        <div className="card p-6">
          <h3 className="text-dark-100 font-semibold mb-6 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-secondary-400" />
            Son 7 Gün Yanıt Trendi
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.timelineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '0.75rem' }} 
                />
                <Line
                  type="monotone"
                  dataKey="yanit"
                  stroke="#22c55e"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#22c55e', strokeWidth: 0 }}
                  activeDot={{ r: 6, stroke: '#16a34a', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

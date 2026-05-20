import { useEffect, useState } from 'react'
import {
  ClipboardCheck, Users, Percent, HelpCircle,
  AlertTriangle, CheckCircle, Ban, ArrowRight,
  TrendingUp, Calendar, Pause, Play, X
} from 'lucide-react'
import { httpRpc, httpFrom } from '../../lib/supabaseHttp'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { useConfirmModalStore } from '../../stores/confirmModalStore'

interface SurveyQuotaStatus {
  survey_id: string
  title: string
  slug: string
  status: string
  survey_type: 'ayaktan' | 'yatan' | 'acil' | 'calisan' | 'diger'
  population_size: number
  required_sample_size: number
  period_type: 'monthly' | 'yearly' | 'none'
  target_count: number | null
  completed_count: number
  max_allowed: number | null
  is_blocked: boolean
}

export default function AdminSurveyStatus() {
  const { tenant } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const { showConfirm } = useConfirmModalStore()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<SurveyQuotaStatus[]>([])

  const loadQuotaStatus = async () => {
    if (!tenant?.id) return
    setLoading(true)
    try {
      const { data: resData, error } = await httpRpc('get_tenant_survey_status', {
        p_tenant_id: tenant.id
      })
      if (error) throw error
      setData(resData || [])
    } catch (err: any) {
      console.error(err)
      addNotification('Anket kota durumları yüklenemedi: ' + (err.message || ''), 'error')
    } finally {
      if (loading) setLoading(false)
    }
  }

  useEffect(() => {
    loadQuotaStatus()
  }, [tenant?.id])

  const handleToggleStatus = (id: string, title: string, currentStatus: string) => {
    const isClosing = currentStatus === 'active'
    showConfirm({
      title: isClosing ? 'Anketi Durdur' : 'Anketi Başlat',
      message: `'${title}' anketini ${isClosing ? 'duraklatmak' : 'katılıma açmak'} istediğinize emin misiniz?`,
      detail: isClosing 
        ? 'Anketi durdurduğunuzda katılımcılar yeni yanıt gönderemeyecektir.'
        : 'Anketi başlattığınızda katılımcılar tekrar yanıt gönderebilecektir.',
      confirmText: isClosing ? 'Evet, Anketi Durdur' : 'Evet, Anketi Başlat',
      cancelText: 'Vazgeç',
      variant: isClosing ? 'danger' : 'success',
      onConfirm: async () => {
        try {
          const newStatus = isClosing ? 'closed' : 'active'
          const { error } = await httpFrom('surveys').update({ status: newStatus }).eq('id', id).execute()
          if (error) throw error
          addNotification(
            isClosing ? 'Anket katılıma kapatıldı.' : 'Anket katılıma açıldı.',
            'success'
          )
          loadQuotaStatus()
        } catch (err: any) {
          addNotification('Anket durumu güncellenirken bir hata oluştu.', 'error')
        }
      }
    })
  }

  const getSurveyTypeLabel = (type: string) => {
    switch (type) {
      case 'ayaktan': return 'Ayaktan Hasta (Poliklinik)'
      case 'yatan': return 'Yatan Hasta'
      case 'acil': return 'Acil Servis'
      case 'calisan': return 'Çalışan Geri Bildirim'
      default: return 'Genel Anket'
    }
  }

  const getPeriodLabel = (p: string) => {
    const now = new Date()
    const months = [
      'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
    ]
    const currentMonth = months[now.getMonth()]
    const currentYear = now.getFullYear()

    switch (p) {
      case 'monthly': return `Aylık (${currentMonth} ${currentYear})`
      case 'yearly': return `Yıllık (${currentYear})`
      default: return 'Süresiz'
    }
  }

  if (loading) {
    return (
      <div className="animate-in space-y-6">
        <div className="page-header">
          <div className="w-48 h-7 bg-dark-800 rounded animate-pulse" />
          <div className="w-72 h-4 bg-dark-800 rounded animate-pulse mt-2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-dark-800 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="card p-6 space-y-6">
          <div className="w-full h-40 bg-dark-800 rounded-xl animate-pulse" />
          <div className="w-full h-40 bg-dark-800 rounded-xl animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="animate-in space-y-6">
      <div className="page-header">
        <h1 className="page-title">Anket Örneklem & Kota Takibi</h1>
        <p className="page-subtitle">
          Kurum istatistiklerine göre hedeflenen örneklem sayıları ve aktif dönem katılım durumları
        </p>
      </div>

      {data.length === 0 ? (
        <div className="card p-12 text-center flex flex-col items-center">
          <ClipboardCheck className="w-16 h-16 text-dark-700 mb-3" />
          <p className="text-dark-300 font-medium mb-1">Takip edilecek aktif anket bulunamadı</p>
          <p className="text-dark-500 text-sm">Hedefleri belirlemek için önce anket oluşturmalısınız.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Genel Özet Kartları */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="stat-card">
              <div className="stat-icon bg-blue-500/10">
                <div className="w-6 h-6 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center">
                  <Users className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
              <div>
                <p className="text-dark-400 text-xs mb-1">Toplam Aktif Anketler</p>
                <p className="text-2xl font-display font-bold text-dark-50">
                  {data.filter(s => s.status === 'active').length}
                </p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon bg-emerald-500/10">
                <div className="w-6 h-6 bg-gradient-to-br from-emerald-600 to-emerald-400 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
              <div>
                <p className="text-dark-400 text-xs mb-1">Hedefe Ulaşan Anketler</p>
                <p className="text-2xl font-display font-bold text-dark-50 text-emerald-400">
                  {data.filter(s => s.target_count && s.completed_count >= s.target_count).length}
                </p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon bg-purple-500/10">
                <div className="w-6 h-6 bg-gradient-to-br from-purple-600 to-purple-400 rounded-lg flex items-center justify-center">
                  <Percent className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
              <div>
                <p className="text-dark-400 text-xs mb-1">Ortalama Katılım Oranı</p>
                <p className="text-2xl font-display font-bold text-dark-50">
                  %{Math.round(
                    data.reduce((acc, curr) => {
                      if (!curr.target_count) return acc
                      return acc + ((curr.completed_count / curr.target_count) * 100)
                    }, 0) / (data.filter(s => s.target_count).length || 1)
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Anket Bazlı Detay Kartları */}
          <div className="grid grid-cols-1 gap-6">
            {data.map(survey => {
              const target = survey.target_count
              const comp = survey.completed_count
              const progressPercent = target ? Math.round((comp / target) * 100) : 0

              let statusColor = 'text-blue-400 bg-blue-500/10'
              let statusText = 'Katılım Alıyor'
              let statusIcon = <TrendingUp className="w-4 h-4" />

              if (survey.status === 'closed') {
                statusColor = 'text-red-400 bg-red-500/10'
                statusText = 'Duraklatıldı (Kapalı)'
                statusIcon = <Pause className="w-4 h-4" />
              } else if (target && comp >= target) {
                statusColor = 'text-emerald-400 bg-emerald-500/10'
                statusText = comp > target ? `Hedef Aşıldı (+${comp - target})` : 'Hedefe Ulaşıldı'
                statusIcon = <CheckCircle className="w-4 h-4" />
              } else if (target && comp >= target * 0.8) {
                statusColor = 'text-warning-400 bg-warning-500/10'
                statusText = 'Hedefe Yakın'
                statusIcon = <AlertTriangle className="w-4 h-4" />
              }

              return (
                <div key={survey.survey_id} className="card p-6 space-y-6">
                  {/* Başlık ve Durum */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-dark-800 pb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-primary-400 uppercase tracking-wider bg-primary-500/10 px-2 py-0.5 rounded-full">
                          {getSurveyTypeLabel(survey.survey_type)}
                        </span>
                        <span className="text-xs font-semibold text-dark-400 bg-dark-800 px-2 py-0.5 rounded-full">
                          Dönem: {getPeriodLabel(survey.period_type)}
                        </span>
                      </div>
                      <h3 className="font-semibold text-lg text-dark-50">{survey.title}</h3>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap self-start sm:self-center">
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-semibold text-sm ${statusColor}`}>
                        {statusIcon}
                        {statusText}
                      </div>

                      <button
                        onClick={() => handleToggleStatus(survey.survey_id, survey.title, survey.status)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-sm border transition-colors ${
                          survey.status === 'active'
                            ? 'text-red-400 bg-red-500/10 border-red-500/20 hover:bg-red-500/20'
                            : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20'
                        }`}
                      >
                        {survey.status === 'active' ? (
                          <>
                            <Pause className="w-3.5 h-3.5" />
                            Anketi Durdur
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            Anketi Başlat
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* İstatistikler */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                    <div className="bg-dark-900/50 p-4 rounded-xl border border-dark-800/50">
                      <p className="text-xs text-dark-500 mb-1">Evren Büyüklüğü (N)</p>
                      <p className="text-xl font-bold text-dark-100">
                        {survey.population_size ? survey.population_size.toLocaleString('tr-TR') : 'Belirtilmemiş'}
                      </p>
                    </div>

                    <div className="bg-dark-900/50 p-4 rounded-xl border border-dark-800/50">
                      <p className="text-xs text-dark-500 mb-1">Gerekli Örneklem (n)</p>
                      <p className="text-xl font-bold text-dark-100">
                        {survey.required_sample_size ? survey.required_sample_size.toLocaleString('tr-TR') : 'Belirtilmemiş'}
                      </p>
                    </div>

                    <div className="bg-dark-900/50 p-4 rounded-xl border border-dark-800/50">
                      <p className="text-xs text-dark-500 mb-1">Dönem Hedefi</p>
                      <p className="text-xl font-bold text-dark-100">
                        {target ? target.toLocaleString('tr-TR') : 'Sınırsız'}
                      </p>
                      <p className="text-[10px] text-dark-500 mt-1.5 font-medium">
                        {survey.period_type === 'monthly' ? 'Aylık Hedef (n / 12)' : survey.period_type === 'yearly' ? 'Yıllık Hedef (n)' : 'Hedef'}
                      </p>
                    </div>

                    <div className="bg-dark-900/50 p-4 rounded-xl border border-dark-800/50">
                      <p className="text-xs text-dark-500 mb-1">Mevcut Katılım</p>
                      <p className="text-xl font-bold text-primary-400">
                        {comp.toLocaleString('tr-TR')}
                      </p>
                      <p className="text-[10px] text-dark-500 mt-1.5 font-medium">
                        {survey.period_type === 'monthly' ? 'Bu Ayki Katılım' : survey.period_type === 'yearly' ? 'Bu Yılki Katılım' : 'Toplam'}
                      </p>
                    </div>

                    <div className="bg-dark-900/50 p-4 rounded-xl border border-dark-800/50 col-span-2 md:col-span-1">
                      <p className="text-xs text-dark-500 mb-1">Hedef Kalan / Kota Aşımı</p>
                      <p className="text-xl font-bold text-dark-100">
                        {target ? (
                          comp >= target ? (
                            <span className="text-emerald-400">+{comp - target}</span>
                          ) : (
                            `${target - comp}`
                          )
                        ) : (
                          'Sınırsız'
                        )}
                      </p>
                      <p className="text-[10px] text-dark-500 mt-1.5 font-medium">
                        {target ? (comp >= target ? 'Kota Üzeri Katılım' : 'Kalan Gerekli Katılım') : 'Limit Yok'}
                      </p>
                    </div>
                  </div>

                  {/* İlerleme Çubuğu */}
                  {target && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-dark-400">Dönem İlerlemesi</span>
                        <span className="text-primary-400">
                          %{progressPercent}
                        </span>
                      </div>
                      <div className="relative w-full h-3 bg-dark-900 rounded-full overflow-hidden border border-dark-800">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            comp >= target
                              ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                              : 'bg-gradient-to-r from-primary-500 to-primary-400'
                          }`}
                          style={{ width: `${Math.min((comp / target) * 100, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-dark-500">
                        <span>Başlangıç</span>
                        <span>Hedef ({target})</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}

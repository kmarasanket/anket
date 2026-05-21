import { useEffect, useState } from 'react'
import {
  ClipboardCheck, Users, Percent, Building2,
  AlertTriangle, CheckCircle, TrendingUp, Pause, Play, RefreshCw
} from 'lucide-react'
import { httpRpc, httpFrom } from '../../lib/supabaseHttp'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { useConfirmModalStore } from '../../stores/confirmModalStore'

interface SurveyQuotaStatus {
  survey_id: string
  tenant_id?: string
  tenant_name?: string
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

// Cochran formülü: n = (Z²·p·q) / e²  →  N'e göre sonlu düzeltme
function calculateSampleSize(N: number): number {
  if (N <= 0) return 0
  const n0 = 384 // Z=1.96, p=0.5, e=0.05 → 384
  if (N <= n0) return N
  return Math.ceil(n0 / (1 + (n0 - 1) / N))
}

// Anket türüne göre kurum istatistiğinden evren büyüklüğünü getir
function getPopulationFromTenant(survey_type: string, tenant: any): number {
  switch (survey_type) {
    case 'ayaktan': return Number(tenant?.prev_year_outpatient) || 0
    case 'yatan':   return Number(tenant?.prev_year_inpatient)  || 0
    case 'acil':    return Number(tenant?.prev_year_emergency)  || 0
    case 'calisan': return Number(tenant?.total_staff)          || 0
    default:        return 0
  }
}

export default function SASurveyStatus() {
  const { profile } = useAuthStore()
  const { addNotification } = useNotificationStore()
  const { showConfirm } = useConfirmModalStore()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<SurveyQuotaStatus[]>([])
  const [tenants, setTenants] = useState<any[]>([])
  const [selectedTenant, setSelectedTenant] = useState<string>('')
  const [selectedSurvey, setSelectedSurvey] = useState<string>('')
  const [search, setSearch] = useState<string>('')

  const loadData = async () => {
    setLoading(true)
    try {
      const [tenantsRes, surveysRes] = await Promise.all([
        httpFrom('tenants').select('id, name').eq('is_active', 'true').order('name').execute(),
        // Kurum istatistiklerini de çek (evren hesabı için)
        httpFrom('surveys').select('*, tenants(name, total_staff, prev_year_outpatient, prev_year_inpatient, prev_year_emergency)').order('created_at', { ascending: false }).execute()
      ])

      if (tenantsRes.error) throw tenantsRes.error
      setTenants(tenantsRes.data || [])

      const surveysData = surveysRes.data || []
      let allData: SurveyQuotaStatus[] = []

      try {
        const quotaRes = await httpRpc('get_tenant_survey_status')
        if (quotaRes.data && Array.isArray(quotaRes.data)) {
          allData = quotaRes.data as SurveyQuotaStatus[]
        }
      } catch (err) {
        console.warn('RPC call failed, using client-side aggregation:', err)
      }

      const rpcMap = new Map(allData.map(d => [d.survey_id, d]))

      const mergedData: SurveyQuotaStatus[] = surveysData.map((survey: any) => {
        const rpcItem = rpcMap.get(survey.id)
        const settings = survey.settings || {}
        const tenantData = survey.tenants || {}

        // Anket türü: RPC > settings > varsayılan
        const survey_type = rpcItem?.survey_type || settings.survey_type || 'diger'

        // Evren (N): RPC > manuel settings > kurum istatistiğinden otomatik
        const population_from_tenant = getPopulationFromTenant(survey_type, tenantData)
        const population_size =
          rpcItem?.population_size ||
          (settings.population_size && Number(settings.population_size) > 0 ? Number(settings.population_size) : 0) ||
          population_from_tenant

        // Örneklem (n): RPC > manuel settings > Cochran formülü
        const required_sample_size =
          rpcItem?.required_sample_size ||
          (settings.required_sample_size && Number(settings.required_sample_size) > 0 ? Number(settings.required_sample_size) : 0) ||
          (population_size > 0 ? calculateSampleSize(population_size) : 0)

        const period_type = rpcItem?.period_type || settings.period_type || 'none'

        let target_count = rpcItem?.target_count || (settings.target_count && Number(settings.target_count) > 0 ? Number(settings.target_count) : null)
        if (!target_count && required_sample_size > 0) {
          if (period_type === 'monthly') target_count = Math.ceil(required_sample_size / 12)
          else if (period_type === 'yearly') target_count = required_sample_size
        }

        return {
          survey_id: survey.id,
          tenant_id: survey.tenant_id,
          tenant_name: tenantData.name || 'Bilinmeyen Kurum',
          title: survey.title,
          slug: survey.slug,
          status: survey.status,
          survey_type,
          population_size,
          required_sample_size,
          period_type,
          target_count,
          completed_count: rpcItem?.completed_count ?? survey.response_count ?? 0,
          max_allowed: rpcItem?.max_allowed || (settings.max_allowed ? Number(settings.max_allowed) : null),
          is_blocked: rpcItem?.is_blocked || false
        }
      })

      mergedData.sort((a, b) => (a.tenant_name || '').localeCompare(b.tenant_name || '', 'tr'))
      setData(mergedData)
    } catch (err: any) {
      addNotification('Veriler yüklenemedi: ' + (err.message || ''), 'error')
    } finally {
      setLoading(false)
    }
  }


  useEffect(() => { loadData() }, [])

  const handleToggleStatus = (id: string, title: string, currentStatus: string) => {
    if (profile?.role === 'management') return
    const isClosing = currentStatus === 'active'
    showConfirm({
      title: isClosing ? 'Anketi Durdur' : 'Anketi Başlat',
      message: `'${title}' anketini ${isClosing ? 'duraklatmak' : 'katılıma açmak'} istediğinize emin misiniz?`,
      confirmText: isClosing ? 'Evet, Durdur' : 'Evet, Başlat',
      cancelText: 'Vazgeç',
      variant: isClosing ? 'danger' : 'success',
      onConfirm: async () => {
        try {
          const newStatus = isClosing ? 'closed' : 'active'
          const { error } = await httpFrom('surveys').update({ status: newStatus }).eq('id', id).execute()
          if (error) throw error
          addNotification(isClosing ? 'Anket durduruldu.' : 'Anket başlatıldı.', 'success')
          loadData()
        } catch (err: any) {
          addNotification('Durum güncellenirken hata oluştu.', 'error')
        }
      }
    })
  }

  const getSurveyTypeLabel = (type: string) => {
    switch (type) {
      case 'ayaktan': return 'Ayaktan Hasta'
      case 'yatan': return 'Yatan Hasta'
      case 'acil': return 'Acil Servis'
      case 'calisan': return 'Çalışan'
      default: return 'Genel'
    }
  }

  const getPeriodLabel = (p: string) => {
    const now = new Date()
    const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
    switch (p) {
      case 'monthly': return `Aylık (${months[now.getMonth()]} ${now.getFullYear()})`
      case 'yearly': return `Yıllık (${now.getFullYear()})`
      default: return 'Süresiz'
    }
  }

  const filteredData = data.filter(s => {
    const matchSearch = search ? s.title.toLowerCase().includes(search.toLowerCase()) || (s.tenant_name || '').toLowerCase().includes(search.toLowerCase()) : true
    const matchTenant = selectedTenant ? s.tenant_id === selectedTenant : true
    const matchSurvey = selectedSurvey ? s.title === selectedSurvey : true
    return matchSearch && matchTenant && matchSurvey
  })

  // Özet istatistikler
  const totalActive = filteredData.filter(s => s.status === 'active').length
  const totalReached = filteredData.filter(s => s.target_count && s.completed_count >= s.target_count).length
  const totalResponses = filteredData.reduce((sum, s) => sum + s.completed_count, 0)
  const avgRate = filteredData.filter(s => s.target_count).length > 0
    ? Math.round(filteredData.reduce((acc, s) => s.target_count ? acc + (s.completed_count / s.target_count) * 100 : acc, 0) / filteredData.filter(s => s.target_count).length)
    : 0

  if (loading) {
    return (
      <div className="animate-in space-y-6">
        <div className="page-header">
          <div className="w-64 h-7 bg-dark-800 rounded animate-pulse" />
          <div className="w-80 h-4 bg-dark-800 rounded animate-pulse mt-2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-dark-800 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-6 h-40 animate-pulse bg-dark-800" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="animate-in space-y-6">
      {/* Başlık */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="page-header mb-0">
          <h1 className="page-title">Global Anket Örneklem Takibi</h1>
          <p className="page-subtitle">
            Tüm kurumlardaki anketlerin hedef katılım ve kota durumları
          </p>
        </div>
        <button
          onClick={loadData}
          className="btn-md btn-secondary flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className="w-4 h-4" /> Yenile
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <select 
            value={selectedTenant}
            onChange={e => {
              setSelectedTenant(e.target.value)
              setSelectedSurvey('')
            }}
            className="input w-full appearance-none bg-dark-950"
          >
            <option value="">Tüm Kurumlar</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="relative">
          <select 
            value={selectedSurvey}
            onChange={e => setSelectedSurvey(e.target.value)}
            className="input w-full appearance-none bg-dark-950"
          >
            <option value="">Tüm Anketler</option>
            {Array.from(new Set(data.filter(s => selectedTenant ? s.tenant_id === selectedTenant : true).map(s => s.title))).map((title: any, i) => (
              <option key={i} value={title}>{title}</option>
            ))}
          </select>
        </div>
        <div className="relative">
          <input 
            value={search} 
            onChange={e => setSearch(e.target.value)}
            placeholder="Anket veya kurum ara..." 
            className="input w-full bg-dark-950" 
          />
        </div>
      </div>

      {/* Özet Kartlar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="stat-icon bg-blue-500/10">
            <div className="w-6 h-6 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center">
              <ClipboardCheck className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <div>
            <p className="text-dark-400 text-xs mb-1">Aktif Anketler</p>
            <p className="text-2xl font-display font-bold text-dark-50">{totalActive}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bg-emerald-500/10">
            <div className="w-6 h-6 bg-gradient-to-br from-emerald-600 to-emerald-400 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <div>
            <p className="text-dark-400 text-xs mb-1">Hedefe Ulaşan</p>
            <p className="text-2xl font-display font-bold text-emerald-400">{totalReached}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bg-primary-500/10">
            <div className="w-6 h-6 bg-gradient-to-br from-primary-600 to-primary-400 rounded-lg flex items-center justify-center">
              <Users className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <div>
            <p className="text-dark-400 text-xs mb-1">Toplam Katılım</p>
            <p className="text-2xl font-display font-bold text-dark-50">{totalResponses.toLocaleString('tr-TR')}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bg-purple-500/10">
            <div className="w-6 h-6 bg-gradient-to-br from-purple-600 to-purple-400 rounded-lg flex items-center justify-center">
              <Percent className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <div>
            <p className="text-dark-400 text-xs mb-1">Ort. Katılım Oranı</p>
            <p className="text-2xl font-display font-bold text-dark-50">%{avgRate}</p>
          </div>
        </div>
      </div>

      {filteredData.length === 0 ? (
        <div className="card p-12 text-center flex flex-col items-center">
          <ClipboardCheck className="w-16 h-16 text-dark-700 mb-3" />
          <p className="text-dark-300 font-medium mb-1">Takip edilecek anket bulunamadı</p>
          <p className="text-dark-500 text-sm">Anket ayarlarında örneklem/kota belirlenmiş anket bulunmuyor.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredData.map(survey => {
            const target = survey.target_count
            const comp = survey.completed_count
            const progressPercent = target ? Math.min(Math.round((comp / target) * 100), 100) : 0

            let statusColor = 'text-blue-400 bg-blue-500/10'
            let statusText = 'Katılım Alıyor'
            let statusIcon = <TrendingUp className="w-4 h-4" />

            if (survey.status === 'closed') {
              statusColor = 'text-red-400 bg-red-500/10'
              statusText = 'Duraklatıldı'
              statusIcon = <Pause className="w-4 h-4" />
            } else if (target && comp >= target) {
              statusColor = 'text-emerald-400 bg-emerald-500/10'
              statusText = comp > target ? `Hedef Aşıldı (+${comp - target})` : 'Hedefe Ulaşıldı'
              statusIcon = <CheckCircle className="w-4 h-4" />
            } else if (target && comp >= target * 0.8) {
              statusColor = 'text-amber-400 bg-amber-500/10'
              statusText = 'Hedefe Yakın'
              statusIcon = <AlertTriangle className="w-4 h-4" />
            }

            return (
              <div key={survey.survey_id} className="card p-6 space-y-5">
                {/* Başlık */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-dark-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-full">
                        <Building2 className="w-3 h-3" />
                        {survey.tenant_name}
                      </div>
                      <span className="text-xs font-semibold text-primary-400 bg-primary-500/10 px-2.5 py-1 rounded-full">
                        {getSurveyTypeLabel(survey.survey_type)}
                      </span>
                      <span className="text-xs font-semibold text-dark-400 bg-dark-800 px-2.5 py-1 rounded-full">
                        {getPeriodLabel(survey.period_type)}
                      </span>
                    </div>
                    <h3 className="font-semibold text-lg text-dark-50">{survey.title}</h3>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap self-start">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-sm ${statusColor}`}>
                      {statusIcon}
                      {statusText}
                    </div>
                    {profile?.role !== 'management' && (
                      <button
                        onClick={() => handleToggleStatus(survey.survey_id, survey.title, survey.status)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-sm border transition-colors ${
                          survey.status === 'active'
                            ? 'text-red-400 bg-red-500/10 border-red-500/20 hover:bg-red-500/20'
                            : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20'
                        }`}
                      >
                        {survey.status === 'active'
                          ? <><Pause className="w-3.5 h-3.5" /> Durdur</>
                          : <><Play className="w-3.5 h-3.5" /> Başlat</>
                        }
                      </button>
                    )}
                  </div>
                </div>

                {/* İstatistikler */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="bg-dark-900/50 p-4 rounded-xl border border-dark-800/50">
                    <p className="text-xs text-dark-500 mb-1">Evren (N)</p>
                    <p className="text-xl font-bold text-dark-100">
                      {survey.population_size ? survey.population_size.toLocaleString('tr-TR') : '—'}
                    </p>
                  </div>
                  <div className="bg-dark-900/50 p-4 rounded-xl border border-dark-800/50">
                    <p className="text-xs text-dark-500 mb-1">Örneklem (n)</p>
                    <p className="text-xl font-bold text-dark-100">
                      {survey.required_sample_size ? survey.required_sample_size.toLocaleString('tr-TR') : '—'}
                    </p>
                  </div>
                  <div className="bg-dark-900/50 p-4 rounded-xl border border-dark-800/50">
                    <p className="text-xs text-dark-500 mb-1">Dönem Hedefi</p>
                    <p className="text-xl font-bold text-dark-100">
                      {target ? target.toLocaleString('tr-TR') : 'Sınırsız'}
                    </p>
                  </div>
                  <div className="bg-dark-900/50 p-4 rounded-xl border border-dark-800/50">
                    <p className="text-xs text-dark-500 mb-1">Mevcut Katılım</p>
                    <p className="text-xl font-bold text-primary-400">
                      {comp.toLocaleString('tr-TR')}
                    </p>
                  </div>
                  <div className="bg-dark-900/50 p-4 rounded-xl border border-dark-800/50 col-span-2 md:col-span-1">
                    <p className="text-xs text-dark-500 mb-1">Kalan / Aşım</p>
                    <p className="text-xl font-bold">
                      {target ? (
                        comp >= target
                          ? <span className="text-emerald-400">+{comp - target}</span>
                          : <span className="text-dark-100">{target - comp}</span>
                      ) : <span className="text-dark-500">—</span>}
                    </p>
                  </div>
                </div>

                {/* Progress */}
                {target && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-dark-400">Dönem İlerlemesi</span>
                      <span className="text-primary-400">%{progressPercent}</span>
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
                      <span>Hedef ({target.toLocaleString('tr-TR')})</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

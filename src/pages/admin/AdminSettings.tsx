import { useEffect, useState } from 'react'
import {
  Building2, Mail, Users, Stethoscope, BedDouble, Siren,
  Save, AlertCircle, CheckCircle2
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'

interface TenantSettings {
  name: string
  description: string | null
  total_staff: number | null
  prev_year_outpatient: number | null
  prev_year_inpatient: number | null
  prev_year_emergency: number | null
}

export default function AdminSettings() {
  const { tenant, user, refreshProfile } = useAuthStore()
  const { addNotification } = useNotificationStore()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userEmail, setUserEmail] = useState('')

  const [form, setForm] = useState<TenantSettings>({
    name: '',
    description: null,
    total_staff: null,
    prev_year_outpatient: null,
    prev_year_inpatient: null,
    prev_year_emergency: null,
  })

  useEffect(() => {
    const load = async () => {
      if (!tenant?.id) return
      setLoading(true)
      try {
        const { data } = await supabase
          .from('tenants')
          .select('name, description, total_staff, prev_year_outpatient, prev_year_inpatient, prev_year_emergency')
          .eq('id', tenant.id)
          .single()

        if (data) {
          setForm({
            name: data.name || '',
            description: data.description || '',
            total_staff: data.total_staff ?? null,
            prev_year_outpatient: data.prev_year_outpatient ?? null,
            prev_year_inpatient: data.prev_year_inpatient ?? null,
            prev_year_emergency: data.prev_year_emergency ?? null,
          })
        }

        // E-posta bilgisini kullanıcı kimliğinden al
        setUserEmail(user?.email || '')
      } catch (err) {
        addNotification('Ayarlar yüklenirken bir hata oluştu.', 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [tenant?.id])

  const handleSave = async () => {
    if (!tenant?.id) return
    setSaving(true)
    try {
      const { error } = await supabase.from('tenants').update({
        description: form.description,
        total_staff: form.total_staff,
        prev_year_outpatient: form.prev_year_outpatient,
        prev_year_inpatient: form.prev_year_inpatient,
        prev_year_emergency: form.prev_year_emergency,
      }).eq('id', tenant.id)

      if (error) throw error

      await refreshProfile()
      addNotification('Kurum ayarları başarıyla güncellendi.', 'success')
    } catch (err: any) {
      addNotification('Kaydedilemedi: ' + (err.message || 'Bilinmeyen hata'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const numInput = (label: string, icon: React.ReactNode, field: keyof TenantSettings, description: string) => (
    <div className="space-y-1.5">
      <label className="label flex items-center gap-2">
        {icon}
        {label}
      </label>
      <p className="text-xs text-dark-500 -mt-1 mb-1">{description}</p>
      <input
        type="number"
        min={0}
        value={form[field] ?? ''}
        onChange={e => setForm(p => ({ ...p, [field]: e.target.value === '' ? null : Number(e.target.value) }))}
        className="input"
        placeholder="0"
      />
    </div>
  )

  if (loading) {
    return (
      <div className="animate-in space-y-6">
        <div className="page-header">
          <div className="w-40 h-7 bg-dark-800 rounded animate-pulse" />
          <div className="w-64 h-4 bg-dark-800 rounded animate-pulse mt-2" />
        </div>
        <div className="card p-6 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-dark-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="animate-in space-y-6 max-w-3xl">
      <div className="page-header">
        <h1 className="page-title">Kurum Ayarları</h1>
        <p className="page-subtitle">Kurumunuza ait bilgileri ve istatistikleri yönetin</p>
      </div>

      {/* Kurum Kimlik Bilgileri - Salt Okunur */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-dark-800">
          <Building2 className="w-4 h-4 text-primary-400" />
          <h2 className="font-semibold text-dark-100">Kurum Bilgileri</h2>
          <span className="ml-auto text-xs text-dark-500 bg-dark-800 px-2 py-0.5 rounded-full">Salt Okunur</span>
        </div>

        <div className="space-y-1.5">
          <label className="label flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-dark-400" />
            Kurum Adı
          </label>
          <input
            type="text"
            value={form.name}
            readOnly
            className="input opacity-60 cursor-not-allowed bg-dark-900"
          />
          <p className="text-xs text-dark-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Kurum adı değişikliği için Sistem Yöneticisi ile iletişime geçin.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="label flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-dark-400" />
            Yönetici E-posta Adresi
          </label>
          <input
            type="email"
            value={userEmail}
            readOnly
            className="input opacity-60 cursor-not-allowed bg-dark-900"
          />
          <p className="text-xs text-dark-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            E-posta değişikliği için Sistem Yöneticisi ile iletişime geçin.
          </p>
        </div>
      </div>

      {/* Düzenlenebilir İstatistikler */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-dark-800">
          <CheckCircle2 className="w-4 h-4 text-secondary-400" />
          <h2 className="font-semibold text-dark-100">Kurum İstatistikleri</h2>
          <span className="ml-auto text-xs text-secondary-400 bg-secondary-500/10 px-2 py-0.5 rounded-full">Düzenlenebilir</span>
        </div>

        {numInput(
          'Toplam Personel Sayısı',
          <Users className="w-3.5 h-3.5 text-blue-400" />,
          'total_staff',
          'Kurumunuzda aktif olarak çalışan toplam personel sayısı'
        )}

        <div className="border-t border-dark-800 pt-4">
          <p className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-4">
            Bir Önceki Yıl Hasta Sayıları
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="label flex items-center gap-2">
                <Stethoscope className="w-3.5 h-3.5 text-emerald-400" />
                Poliklinik
              </label>
              <p className="text-xs text-dark-500 -mt-1 mb-1">Ayaktan hasta sayısı</p>
              <input
                type="number"
                min={0}
                value={form.prev_year_outpatient ?? ''}
                onChange={e => setForm(p => ({ ...p, prev_year_outpatient: e.target.value === '' ? null : Number(e.target.value) }))}
                className="input"
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <label className="label flex items-center gap-2">
                <BedDouble className="w-3.5 h-3.5 text-purple-400" />
                Yatan Hasta
              </label>
              <p className="text-xs text-dark-500 -mt-1 mb-1">İnpatient hasta sayısı</p>
              <input
                type="number"
                min={0}
                value={form.prev_year_inpatient ?? ''}
                onChange={e => setForm(p => ({ ...p, prev_year_inpatient: e.target.value === '' ? null : Number(e.target.value) }))}
                className="input"
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <label className="label flex items-center gap-2">
                <Siren className="w-3.5 h-3.5 text-red-400" />
                Acil Servis
              </label>
              <p className="text-xs text-dark-500 -mt-1 mb-1">Acil servis hasta sayısı</p>
              <input
                type="number"
                min={0}
                value={form.prev_year_emergency ?? ''}
                onChange={e => setForm(p => ({ ...p, prev_year_emergency: e.target.value === '' ? null : Number(e.target.value) }))}
                className="input"
                placeholder="0"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Kaydet Butonu */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-lg btn-primary gap-2 shadow-glow"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
        </button>
      </div>
    </div>
  )
}

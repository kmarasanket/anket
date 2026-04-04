import { useEffect, useState } from 'react'
import { Plus, Search, Edit2, ToggleLeft, ToggleRight, Building2, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate, slugify } from '../../lib/utils'
import { useNotificationStore } from '../../stores/notificationStore'
import type { Tenant } from '../../lib/database.types'

export default function SATenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Tenant | null>(null)
  const [formData, setFormData] = useState({ name: '', description: '' })
  const [saving, setSaving] = useState(false)
  const { addNotification } = useNotificationStore()

  const fetchTenants = async () => {
    try {
      const { data, error } = await supabase.from('tenants').select('*').order('created_at', { ascending: false })
      if (error) throw error
      setTenants(data || [])
    } catch (err: any) {
      addNotification('Kurumlar yüklenirken bir hata oluştu.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTenants() }, [])

  const filtered = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleSave = async () => {
    if (!formData.name.trim()) return
    setSaving(true)
    try {
      if (editItem) {
        const { error } = await supabase.from('tenants').update({
          name: formData.name.trim(),
          description: formData.description,
        }).eq('id', editItem.id)
        if (error) throw error
        addNotification('Kurum başarıyla güncellendi.', 'success')
      } else {
        const { error } = await supabase.from('tenants').insert({
          name: formData.name.trim(),
          description: formData.description,
          slug: slugify(formData.name),
          is_active: true,
          settings: {},
        })
        if (error) throw error
        addNotification('Yeni kurum başarıyla eklendi.', 'success')
      }
      setShowForm(false)
      setEditItem(null)
      setFormData({ name: '', description: '' })
      fetchTenants()
    } catch (err: any) {
      addNotification('Kurum kaydedilirken bir hata oluştu: ' + (err.message || ''), 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (tenant: Tenant) => {
    try {
      const { error } = await supabase.from('tenants').update({ is_active: !tenant.is_active }).eq('id', tenant.id)
      if (error) throw error
      addNotification(`Kurum ${!tenant.is_active ? 'aktif' : 'pasif'} duruma getirildi.`, 'info')
      fetchTenants()
    } catch (err: any) {
      addNotification('Durum değiştirilirken bir hata oluştu.', 'error')
    }
  }

  const openEdit = (tenant: Tenant) => {
    setEditItem(tenant)
    setFormData({ name: tenant.name, description: tenant.description || '' })
    setShowForm(true)
  }

  return (
    <div className="animate-in space-y-6">
      <div className="flex items-center justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Kurumlar</h1>
          <p className="page-subtitle">{tenants.length} kurum kayıtlı</p>
        </div>
        <button onClick={() => { setEditItem(null); setFormData({ name: '', description: '' }); setShowForm(true) }}
          className="btn-md btn-primary">
          <Plus className="w-4 h-4" /> Kurum Ekle
        </button>
      </div>

      {/* Arama */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Kurum ara..." className="input pl-10" />
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-md slide-in-up">
            <h2 className="text-lg font-bold text-dark-50 mb-5">
              {editItem ? 'Kurumu Düzenle' : 'Yeni Kurum Ekle'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="label">Kurum Adı *</label>
                <input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  placeholder="örn. Sağlık Müdürlüğü" className="input" />
              </div>
              <div>
                <label className="label">Açıklama</label>
                <textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                  placeholder="Kurum hakkında kısa bilgi..." rows={3} className="input resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowForm(false); setEditItem(null) }}
                className="btn-md btn-secondary flex-1">İptal</button>
              <button onClick={handleSave} disabled={saving || !formData.name.trim()}
                className="btn-md btn-primary flex-1">
                {saving ? 'Kaydediliyor...' : (editItem ? 'Güncelle' : 'Ekle')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 h-20 animate-pulse bg-dark-800" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <Users className="w-10 h-10 text-dark-600 mx-auto mb-3" />
          <p className="text-dark-400">Kurum bulunamadı</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(tenant => (
            <div key={tenant.id} className="card-hover p-4 flex items-center gap-4">
              <div className="w-10 h-10 bg-gradient-to-br from-primary-600/30 to-primary-400/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-primary-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-dark-100 truncate">{tenant.name}</p>
                <p className="text-xs text-dark-500 mt-0.5">{tenant.description || 'Açıklama yok'} · {formatDate(tenant.created_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={tenant.is_active ? 'badge-success' : 'badge-neutral'}>
                  {tenant.is_active ? 'Aktif' : 'Pasif'}
                </span>
                <button onClick={() => openEdit(tenant)} className="btn-sm btn-ghost">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => toggleActive(tenant)} className="btn-sm btn-ghost">
                  {tenant.is_active ? <ToggleRight className="w-4 h-4 text-secondary-400" /> : <ToggleLeft className="w-4 h-4 text-dark-500" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

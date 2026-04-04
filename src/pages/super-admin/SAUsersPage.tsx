import { useEffect, useState } from 'react'
import { Plus, Search, Edit2, ToggleLeft, ToggleRight, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { Profile, Tenant } from '../../lib/database.types'

export default function SAUsersPage() {
  const [users, setUsers] = useState<(Profile & { tenant_name?: string })[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({ email: '', full_name: '', role: 'admin' as 'admin' | 'super_admin', tenant_id: '', password: '' })

  const fetchData = async () => {
    const [profilesRes, tenantsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('tenants').select('*').eq('is_active', true),
    ])
    const tenantMap = new Map((tenantsRes.data || []).map(t => [t.id, t.name]))
    setUsers((profilesRes.data || []).map(p => ({ ...p, tenant_name: p.tenant_id ? tenantMap.get(p.tenant_id) : 'Ana Sistem' })))
    setTenants(tenantsRes.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const filtered = users.filter(u =>
    u.full_name.toLowerCase().includes(search.toLowerCase())
  )

  const handleCreate = async () => {
    if (!formData.email || !formData.full_name || !formData.password) return
    setSaving(true)
    // Supabase Auth ile kullanıcı oluştur (admin API gerektirir - edge function ile yapılır)
    // Şimdilik profiles tablosuna ekliyoruz
    const { data: authData } = await supabase.auth.admin?.createUser({
      email: formData.email,
      password: formData.password,
      email_confirm: true,
    }) || {}
    if (authData?.user) {
      await supabase.from('profiles').insert({
        id: authData.user.id,
        full_name: formData.full_name,
        role: formData.role,
        tenant_id: formData.role === 'admin' ? formData.tenant_id : null,
        is_active: true,
      })
    }
    setSaving(false)
    setShowForm(false)
    fetchData()
  }

  const toggleActive = async (user: Profile) => {
    await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id)
    fetchData()
  }

  return (
    <div className="animate-in space-y-6">
      <div className="flex items-center justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Kullanıcılar</h1>
          <p className="page-subtitle">{users.length} kullanıcı kayıtlı</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-md btn-primary">
          <Plus className="w-4 h-4" /> Kullanıcı Ekle
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Kullanıcı ara..." className="input pl-10" />
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-md slide-in-up">
            <h2 className="text-lg font-bold text-dark-50 mb-5">Yeni Kullanıcı Ekle</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Ad Soyad *</label>
                <input value={formData.full_name} onChange={e => setFormData(p => ({ ...p, full_name: e.target.value }))}
                  placeholder="Ahmet Yılmaz" className="input" />
              </div>
              <div>
                <label className="label">E-posta *</label>
                <input value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                  type="email" placeholder="ahmet@kurum.gov.tr" className="input" />
              </div>
              <div>
                <label className="label">Şifre *</label>
                <input value={formData.password} onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
                  type="password" placeholder="En az 8 karakter" className="input" />
              </div>
              <div>
                <label className="label">Rol</label>
                <select value={formData.role} onChange={e => setFormData(p => ({ ...p, role: e.target.value as 'admin' | 'super_admin' }))}
                  className="input">
                  <option value="admin">Kurum Admin</option>
                  <option value="super_admin">Süper Admin</option>
                </select>
              </div>
              {formData.role === 'admin' && (
                <div>
                  <label className="label">Kurum</label>
                  <select value={formData.tenant_id} onChange={e => setFormData(p => ({ ...p, tenant_id: e.target.value }))}
                    className="input">
                    <option value="">Kurum seçin...</option>
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="btn-md btn-secondary flex-1">İptal</button>
              <button onClick={handleCreate} disabled={saving} className="btn-md btn-primary flex-1">
                {saving ? 'Oluşturuluyor...' : 'Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="card p-4 h-16 animate-pulse bg-dark-800" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center"><Users className="w-10 h-10 text-dark-600 mx-auto mb-3" /><p className="text-dark-400">Kullanıcı bulunamadı</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(user => (
            <div key={user.id} className="card-hover p-4 flex items-center gap-4">
              <div className="w-9 h-9 bg-gradient-to-br from-primary-600/30 to-primary-400/20 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold text-primary-300">
                {user.full_name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-dark-100 truncate">{user.full_name}</p>
                <p className="text-xs text-dark-500">{user.tenant_name || 'Ana Sistem'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={user.role === 'super_admin' ? 'badge-primary' : 'badge-neutral'}>
                  {user.role === 'super_admin' ? 'Süper Admin' : 'Kurum Admin'}
                </span>
                <span className={user.is_active ? 'badge-success' : 'badge-danger'}>
                  {user.is_active ? 'Aktif' : 'Pasif'}
                </span>
                <button onClick={() => toggleActive(user)} className="btn-sm btn-ghost">
                  {user.is_active ? <ToggleRight className="w-4 h-4 text-secondary-400" /> : <ToggleLeft className="w-4 h-4 text-dark-500" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

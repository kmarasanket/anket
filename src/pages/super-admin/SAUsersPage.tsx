import { useEffect, useState } from 'react'
import { Plus, Search, ToggleLeft, ToggleRight, Users, Edit2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useNotificationStore } from '../../stores/notificationStore'
import { useAuthStore } from '../../stores/authStore'
import type { Profile, Tenant } from '../../lib/database.types'
import { validatePassword } from '../../lib/utils'

type ProfileWithEmail = Profile & { tenant_name?: string; email?: string }

export default function SAUsersPage() {
  const [users, setUsers] = useState<ProfileWithEmail[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({ email: '', full_name: '', role: 'admin' as 'admin' | 'super_admin', tenant_id: '', password: '', password_confirm: '' })
  const [showEditForm, setShowEditForm] = useState(false)
  const [editingUser, setEditingUser] = useState<ProfileWithEmail | null>(null)
  const [editFormData, setEditFormData] = useState({ full_name: '', role: 'admin' as 'admin' | 'super_admin', tenant_id: '', email: '' })
  const { addNotification } = useNotificationStore()
  const { profile } = useAuthStore()

  const fetchData = async () => {
    try {
      const rpcRes = await supabase.rpc('get_users_with_email')
      const pRes = rpcRes.error ? await supabase.from('profiles').select('*').order('created_at', { ascending: false }) : rpcRes

      const [profilesRes, tenantsRes] = await Promise.all([
        Promise.resolve(pRes),
        supabase.from('tenants').select('*').eq('is_active', true),
      ])
      
      const tenantMap = new Map((tenantsRes.data || []).map(t => [t.id, t.name]))
      let fetchedUsers = (profilesRes.data || []).map(p => ({ ...p, tenant_name: p.tenant_id ? tenantMap.get(p.tenant_id) : 'Ana Sistem' }))
      
      // PostgREST bazen RPC sonuçlarında order() desteklemez (400 Bad Request döner), bu yüzden JS'de sıralıyoruz
      fetchedUsers.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      
      setUsers(fetchedUsers)
      setTenants(tenantsRes.data || [])
    } catch (err: any) {
      addNotification('Veriler yüklenirken bir hata oluştu.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const filtered = users.filter(u =>
    u.full_name.toLowerCase().includes(search.toLowerCase())
  )

  const handleCreate = async () => {
    if (!formData.email || !formData.full_name || !formData.password) return
    if (formData.password !== formData.password_confirm) {
        addNotification("Girdiğiniz şifreler eşleşmiyor, lütfen kontrol ediniz.", "warning")
        return
    }

    const passwordError = validatePassword(formData.password)
    if (passwordError) {
      addNotification(passwordError, "warning")
      return
    }

    setSaving(true)
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const tempSupabase = createClient(
        import.meta.env.VITE_SUPABASE_URL as string,
        import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        { auth: { persistSession: false } }
      )

      const { data: authData, error: authError } = await tempSupabase.auth.signUp({
        email: formData.email.trim(),
        password: formData.password,
        options: {
          data: {
            must_change_password: true,
            role: formData.role,
            tenant_id: formData.role === 'admin' ? formData.tenant_id : null
          }
        }
      })
      if (authError) throw authError

      if (authData?.user) {
        const { error: profileError } = await supabase.from('profiles').insert({
          id: authData.user.id,
          full_name: formData.full_name,
          role: formData.role,
          tenant_id: formData.role === 'admin' ? formData.tenant_id : null,
          is_active: true,
        })
        if (profileError) throw profileError
      }
      addNotification('Kullanıcı başarıyla oluşturuldu.', 'success')
      setShowForm(false)
      setFormData({ email: '', full_name: '', role: 'admin', tenant_id: '', password: '', password_confirm: '' })
      fetchData()
    } catch (err: any) {
      console.error('User creation error:', err)
      if (err.message?.includes("already registered")) {
        addNotification("Kullanıcı daha önceden sisteme (auth) eklenmiş! Lütfen merkezi Authentication sekmesinden o kullanıcıyı silin.", "error", 8000)
      } else {
        addNotification("Kullanıcı eklenemedi: " + (err.message || 'Bilinmeyen hata'), 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleEditClick = (user: ProfileWithEmail) => {
    setEditingUser(user)
    setEditFormData({
      full_name: user.full_name,
      role: user.role,
      tenant_id: user.tenant_id || '',
      email: user.email || ''
    })
    setShowEditForm(true)
  }

  const handleEditSave = async () => {
    if (!editingUser) return
    if (!editFormData.full_name || !editFormData.email) {
      addNotification("Ad Soyad ve E-posta boş bırakılamaz.", "warning")
      return
    }

    setSaving(true)
    try {
      const { error: rpcError } = await supabase.rpc('update_user_admin', {
        p_user_id: editingUser.id,
        p_full_name: editFormData.full_name,
        p_role: editFormData.role,
        p_tenant_id: editFormData.role === 'admin' ? editFormData.tenant_id : null,
        p_email: editFormData.email.trim()
      })

      if (rpcError) {
        // Fallback to normal update if RPC fails or doesn't exist
        const updates = {
          full_name: editFormData.full_name,
          role: editFormData.role,
          tenant_id: editFormData.role === 'admin' ? editFormData.tenant_id : null
        }
        const { error } = await supabase.from('profiles').update(updates).eq('id', editingUser.id)
        if (error) throw error
        addNotification('Kullanıcı güncellendi (E-posta güncellenemedi, SQL betiği çalıştırılmamış).', 'warning')
      } else {
        addNotification('Kullanıcı bilgileri ve e-posta güncellendi.', 'success')
      }
      
      setShowEditForm(false)
      setEditingUser(null)
      fetchData()
    } catch (err: any) {
      addNotification('Kullanıcı güncellenirken hata oluştu: ' + (err.message || ''), 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (user: Profile) => {
    try {
      const { error } = await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id)
      if (error) throw error
      addNotification(`Kullanıcı ${!user.is_active ? 'aktif' : 'pasif'} duruma getirildi.`, 'info')
      fetchData()
    } catch (err: any) {
      addNotification('Durum değiştirilirken bir hata oluştu.', 'error')
    }
  }

  return (
    <div className="animate-in space-y-6">
      <div className="flex items-center justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Kullanıcılar</h1>
          <p className="page-subtitle">{users.length} kullanıcı kayıtlı</p>
        </div>
        {profile?.role !== 'management' && (
          <button onClick={() => setShowForm(true)} className="btn-md btn-primary">
            <Plus className="w-4 h-4" /> Kullanıcı Ekle
          </button>
        )}
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
                  type="password" placeholder="En az 8 karakter (Büyük, Küçük, Sayı, Özel)" className="input" />
              </div>
              <div>
                <label className="label">Şifre Tekrarı *</label>
                <input value={formData.password_confirm} onChange={e => setFormData(p => ({ ...p, password_confirm: e.target.value }))}
                  type="password" placeholder="Şifrenizi doğrulayın" className="input" />
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

      {/* Edit Form Modal */}
      {showEditForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-md slide-in-up">
            <h2 className="text-lg font-bold text-dark-50 mb-5">Kullanıcıyı Düzenle</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Ad Soyad *</label>
                <input value={editFormData.full_name} onChange={e => setEditFormData(p => ({ ...p, full_name: e.target.value }))}
                  placeholder="Ahmet Yılmaz" className="input" />
              </div>
              <div>
                <label className="label">E-posta *</label>
                <input value={editFormData.email} onChange={e => setEditFormData(p => ({ ...p, email: e.target.value }))}
                  type="email" placeholder="ahmet@kurum.gov.tr" className="input" />
              </div>
              <div>
                <label className="label">Rol</label>
                <select value={editFormData.role} onChange={e => setEditFormData(p => ({ ...p, role: e.target.value as 'admin' | 'super_admin' }))}
                  className="input">
                  <option value="admin">Kurum Admin</option>
                  <option value="super_admin">Süper Admin</option>
                </select>
              </div>
              {editFormData.role === 'admin' && (
                <div>
                  <label className="label">Kurum</label>
                  <select value={editFormData.tenant_id} onChange={e => setEditFormData(p => ({ ...p, tenant_id: e.target.value }))}
                    className="input">
                    <option value="">Kurum seçin...</option>
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowEditForm(false)} className="btn-md btn-secondary flex-1">İptal</button>
              <button onClick={handleEditSave} disabled={saving} className="btn-md btn-primary flex-1">
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
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
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-dark-500">{user.tenant_name || 'Ana Sistem'}</p>
                  {user.email && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-dark-700" />
                      <p className="text-xs text-dark-400 truncate">{user.email}</p>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={user.role === 'super_admin' ? 'badge-primary' : user.role === 'management' ? 'badge-warning' : 'badge-neutral'}>
                  {user.role === 'super_admin' ? 'Süper Admin' : user.role === 'management' ? 'Yönetim' : 'Kurum Admin'}
                </span>
                <span className={user.is_active ? 'badge-success' : 'badge-danger'}>
                  {user.is_active ? 'Aktif' : 'Pasif'}
                </span>
                {profile?.role !== 'management' && (
                  <>
                    <button onClick={() => handleEditClick(user)} className="btn-sm btn-ghost" title="Düzenle">
                      <Edit2 className="w-4 h-4 text-blue-400" />
                    </button>
                    <button onClick={() => toggleActive(user)} className="btn-sm btn-ghost" title={user.is_active ? 'Pasife Al' : 'Aktifleştir'}>
                      {user.is_active ? <ToggleRight className="w-4 h-4 text-secondary-400" /> : <ToggleLeft className="w-4 h-4 text-dark-500" />}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import { useNotificationStore } from './notificationStore'
import type { Profile, Tenant } from '../lib/database.types'

interface AuthState {
  user: { id: string; email: string } | null
  profile: Profile | null
  tenant: Tenant | null
  loading: boolean
  initialized: boolean

  // Actions
  initialize: () => Promise<void>
  login: (email: string, password: string) => Promise<{ error: string | null }>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      tenant: null,
      loading: false,
      initialized: false,

      initialize: async () => {
        set({ loading: true })
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            set({ user: { id: session.user.id, email: session.user.email! } })
            await get().refreshProfile()
          }
        } catch (err) {
          useNotificationStore.getState().addNotification('Oturum kurtarılamadı.', 'error')
        } finally {
          set({ loading: false, initialized: true })
        }

        // Auth state değişikliklerini dinle
        supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === 'SIGNED_IN' && session?.user) {
            set({ user: { id: session.user.id, email: session.user.email! } })
            await get().refreshProfile()
          } else if (event === 'SIGNED_OUT') {
            set({ user: null, profile: null, tenant: null })
          }
        })
      },

      login: async (email, password) => {
        set({ loading: true })
        try {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password })
          if (error) throw error
          
          if (data.user) {
            set({ user: { id: data.user.id, email: data.user.email! } })
            await get().refreshProfile()
          }
          useNotificationStore.getState().addNotification('Giriş başarılı. Hoş geldiniz!', 'success')
          return { error: null }
        } catch (err: any) {
          useNotificationStore.getState().addNotification('Giriş başarısız: ' + (err.message || 'Bilgilerinizi kontrol edin'), 'error')
          return { error: err.message }
        } finally {
          set({ loading: false })
        }
      },

      logout: async () => {
        try {
          await supabase.auth.signOut()
        } catch (err) {
          console.error('Logout error:', err)
        } finally {
          set({ user: null, profile: null, tenant: null })
          // localStorage temizliği (persist middleware için)
          localStorage.removeItem('auth-store')
        }
      },

      refreshProfile: async () => {
        const { user } = get()
        if (!user) return

        // Profil bilgisini çek
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (!profile) return
        set({ profile })

        // Tenant bilgisini çek (super_admin için null)
        if (profile.tenant_id) {
          const { data: tenant } = await supabase
            .from('tenants')
            .select('*')
            .eq('id', profile.tenant_id)
            .single()
          set({ tenant })
        }
      },
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({ user: state.user }),
    }
  )
)

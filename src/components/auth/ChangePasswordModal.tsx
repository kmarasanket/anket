import { useState } from 'react'
import { Eye, EyeOff, Lock, Check, X, ShieldAlert } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { cn } from '../../lib/utils'

interface ChangePasswordModalProps {
  isOpen: boolean
  onClose: () => void
  forceChange?: boolean
}

export default function ChangePasswordModal({ isOpen, onClose, forceChange = false }: ChangePasswordModalProps) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const { user } = useAuthStore()
  const { addNotification } = useNotificationStore()

  if (!isOpen) return null

  // Real-time validations
  const checks = {
    length: newPassword.length >= 8,
    uppercase: /[A-Z]/.test(newPassword),
    lowercase: /[a-z]/.test(newPassword),
    number: /\d/.test(newPassword),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(newPassword)
  }

  const allPassed = Object.values(checks).every(Boolean)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    if (!allPassed) {
      setErrorMsg('Lütfen şifre kurallarının tamamını karşılayın.')
      return
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Yeni şifreler uyuşmuyor.')
      return
    }

    setLoading(true)
    try {
      // Supabase ile şifreyi güncelle ve metadata'yı temizle
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        data: { must_change_password: false }
      })

      if (error) throw error

      // Zustand store'u güncelle
      if (user) {
        useAuthStore.setState({
          user: {
            ...user,
            user_metadata: {
              ...user.user_metadata,
              must_change_password: false
            }
          }
        })
      }

      addNotification('Şifreniz başarıyla güncellendi.', 'success')
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Şifre güncellenirken bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
      <div className="card p-6 w-full max-w-md animate-in relative bg-dark-900 border border-dark-800">
        
        {/* Kapatma Butonu (Zorunlu değilse) */}
        {!forceChange && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1.5 text-dark-400 hover:text-white rounded-lg hover:bg-dark-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center text-primary-400">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-dark-50">Şifrenizi Değiştirin</h3>
            {forceChange && (
              <p className="text-xs text-amber-400 font-medium flex items-center gap-1 mt-0.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                Güvenliğiniz için şifre değişimi zorunludur.
              </p>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm mb-4">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Yeni Şifre</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Yeni şifreniz"
                className="input pr-10 bg-dark-950 border-dark-800"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="label">Yeni Şifre (Tekrar)</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Yeni şifreniz (tekrar)"
                className="input pr-10 bg-dark-950 border-dark-800"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Şifre Kriterleri */}
          <div className="bg-dark-950 p-4 rounded-xl border border-dark-800 space-y-2">
            <p className="text-xs font-semibold text-dark-400">Şifre Gereksinimleri:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { checked: checks.length, label: 'En az 8 karakter' },
                { checked: checks.uppercase, label: '1 büyük harf' },
                { checked: checks.lowercase, label: '1 küçük harf' },
                { checked: checks.number, label: '1 rakam' },
                { checked: checks.special, label: '1 özel karakter' }
              ].map((rule, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <div className={cn(
                    "w-4 h-4 rounded-full flex items-center justify-center transition-colors",
                    rule.checked ? "bg-emerald-500/20 text-emerald-400" : "bg-dark-800 text-dark-500"
                  )}>
                    <Check className="w-2.5 h-2.5" />
                  </div>
                  <span className={cn(
                    "transition-colors",
                    rule.checked ? "text-dark-300" : "text-dark-500"
                  )}>
                    {rule.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            {!forceChange && (
              <button
                type="button"
                onClick={onClose}
                className="btn-md btn-secondary flex-1"
                disabled={loading}
              >
                İptal
              </button>
            )}
            <button
              type="submit"
              disabled={loading || !allPassed || newPassword !== confirmPassword}
              className="btn-md btn-primary flex-1 disabled:opacity-55 disabled:cursor-not-allowed"
            >
              {loading ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

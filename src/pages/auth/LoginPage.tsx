import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, BarChart3, Lock, Mail, ArrowRight, Shield } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { cn } from '../../lib/utils'

const schema = z.object({
  email: z.string().email('Geçerli bir e-posta giriniz'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalıdır'),
})
type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState('')
  const { login, loading } = useAuthStore()
  const navigate = useNavigate()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setServerError('')
    const { error } = await login(data.email, data.password)
    if (error) {
      setServerError('E-posta veya şifre hatalı')
      return
    }
    const profile = useAuthStore.getState().profile
    if (profile?.role === 'super_admin') navigate('/super-admin')
    else navigate('/admin')
  }

  return (
    <div className="min-h-screen bg-dark-950 flex">
      {/* Sol panel — Marka */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Arka plan gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-900 via-dark-950 to-secondary-900" />
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-72 h-72 bg-primary-500/20 rounded-full blur-3xl animate-pulse-slow" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-secondary-500/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div className="flex items-center">
            <img src="/kmaraslogo.png" alt="Kurum Logosu" className="h-16 w-auto object-contain drop-shadow-lg" />
          </div>

          {/* Orta içerik */}
          <div className="space-y-6">
            <div className="space-y-3">
              <h1 className="text-4xl font-display font-bold text-white leading-tight">
                Kurumsal Anket<br />
                <span className="gradient-text">Yönetim Sistemi</span>
              </h1>
              <p className="text-dark-300 text-lg leading-relaxed">
                Sağlıkta Kalite ve Sağlık Tesisi Denetim Standartlarıyla Uyumlu Anket Platformu
              </p>
            </div>

            {/* Özellikler */}
            {[
              { icon: '🏢', text: 'Tüm Sağlık Tesisleri Merkezi Anket Yönetimi' },
              { icon: '📊', text: 'Gerçek zamanlı analiz ve raporlar' },
              { icon: '📱', text: 'Web ve mobil uyumlu, PWA desteği' },
              { icon: '🔒', text: 'Veritabanı seviyesinde güvenlik' },
            ].map((f) => (
              <div key={f.text} className="flex items-center gap-3 glass px-4 py-3">
                <span className="text-xl">{f.icon}</span>
                <span className="text-dark-200 text-sm">{f.text}</span>
              </div>
            ))}
          </div>

          {/* Alt bilgi */}
          <div className="flex items-center gap-2 text-dark-500 text-sm">
            <Shield className="w-4 h-4" />
            <span>Güvenli Veri Altyapısı</span>
          </div>
        </div>
      </div>

      {/* Sağ panel — Login form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md animate-in">
          {/* Mobil logo */}
          <div className="flex items-center justify-center mb-8 lg:hidden">
            <img src="/kmaraslogo.png" alt="Kurum Logosu" className="h-16 w-auto object-contain" />
          </div>

          <div className="space-y-2 mb-8">
            <h2 className="text-2xl font-display font-bold text-dark-50">Kurumsal Anket Yönetim Sistemi</h2>
            <p className="text-dark-400">Kurumsal Hesap Girişi</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* E-posta */}
            <div>
              <label className="label">E-posta</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                <input
                  {...register('email')}
                  type="email"
                  placeholder="ornek@kurum.gov.tr"
                  autoComplete="email"
                  className={cn('input pl-10', errors.email && 'input-error')}
                />
              </div>
              {errors.email && <p className="error-msg">{errors.email.message}</p>}
            </div>

            {/* Şifre */}
            <div>
              <label className="label">Şifre</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={cn('input pl-10 pr-10', errors.password && 'input-error')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="error-msg">{errors.password.message}</p>}
            </div>

            {/* Sunucu hatası */}
            {serverError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                {serverError}
              </div>
            )}

            {/* Giriş butonu */}
            <button
              type="submit"
              disabled={loading}
              className="btn-lg btn-primary w-full"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Giriş yapılıyor...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Giriş Yap
                  <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </button>
          </form>

          <p className="text-center text-dark-500 text-sm mt-8">
            Hesap oluşturmak için sistem yöneticinizle iletişime geçin.
          </p>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { AlertTriangle, Trash2, Info, CheckCircle, X, Loader2 } from 'lucide-react'
import { useConfirmModalStore, type ConfirmVariant } from '../../stores/confirmModalStore'

const variantConfig: Record<ConfirmVariant, {
  icon: React.ElementType
  iconClass: string
  bgClass: string
  borderClass: string
  glowClass: string
  btnClass: string
}> = {
  danger: {
    icon: Trash2,
    iconClass: 'text-red-400',
    bgClass: 'bg-red-500/10',
    borderClass: 'border-red-500/20',
    glowClass: 'bg-red-500/5',
    btnClass: 'bg-red-600 hover:bg-red-500 text-white shadow-red-500/20',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/20',
    glowClass: 'bg-amber-500/5',
    btnClass: 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/20',
  },
  info: {
    icon: Info,
    iconClass: 'text-blue-400',
    bgClass: 'bg-blue-500/10',
    borderClass: 'border-blue-500/20',
    glowClass: 'bg-blue-500/5',
    btnClass: 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20',
  },
  success: {
    icon: CheckCircle,
    iconClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/20',
    glowClass: 'bg-emerald-500/5',
    btnClass: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20',
  },
}

export default function ConfirmModal() {
  const { isOpen, options, loading, closeModal, setLoading } = useConfirmModalStore()
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  // ESC ile kapat
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) closeModal()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, loading, closeModal])

  // Modal açılınca confirm butonuna focus
  useEffect(() => {
    if (isOpen) setTimeout(() => confirmBtnRef.current?.focus(), 50)
  }, [isOpen])

  if (!isOpen || !options) return null

  const variant = options.variant ?? 'warning'
  const cfg = variantConfig[variant]
  const Icon = cfg.icon

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await options.onConfirm()
    } finally {
      setLoading(false)
      closeModal()
    }
  }

  const handleCancel = () => {
    if (loading) return
    options.onCancel?.()
    closeModal()
  }

  return (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleCancel}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md bg-dark-900/90 backdrop-blur-xl border border-dark-700 rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.5)] overflow-hidden"
        style={{ animation: 'modalIn 0.2s cubic-bezier(0.175,0.885,0.32,1.275)' }}
      >
        {/* Top colored stripe */}
        <div className={`h-0.5 w-full ${cfg.bgClass.replace('/10', '')}`} />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-start gap-4 mb-5">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bgClass} border ${cfg.borderClass}`}>
              <Icon className={`w-5 h-5 ${cfg.iconClass}`} />
            </div>
            <div className="flex-1 pt-0.5">
              <h3 className="text-base font-bold text-dark-50 leading-tight mb-1">
                {options.title}
              </h3>
              <p className="text-sm text-dark-300 leading-relaxed">
                {options.message}
              </p>
              {options.detail && (
                <p className="text-xs text-dark-500 leading-relaxed mt-2 border-l-2 border-dark-700 pl-3">
                  {options.detail}
                </p>
              )}
            </div>
            {!loading && (
              <button
                onClick={handleCancel}
                className="p-1.5 text-dark-500 hover:text-dark-200 hover:bg-dark-800 rounded-lg transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleCancel}
              disabled={loading}
              className="px-4 py-2 text-sm font-semibold text-dark-300 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-xl transition-colors disabled:opacity-40"
            >
              {options.cancelText ?? 'Vazgeç'}
            </button>
            <button
              ref={confirmBtnRef}
              onClick={handleConfirm}
              disabled={loading}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all shadow-lg flex items-center gap-2 disabled:opacity-60 ${cfg.btnClass}`}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'İşleniyor...' : (options.confirmText ?? 'Onayla')}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.92) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
      `}</style>
    </div>
  )
}

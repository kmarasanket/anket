import { useNotificationStore } from '../../stores/notificationStore'
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '../../lib/utils'

const icons = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
}

const styles = {
  success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-emerald-500/10',
  error: 'bg-red-500/10 border-red-500/20 text-red-400 shadow-red-500/10',
  warning: 'bg-amber-500/10 border-amber-500/20 text-amber-400 shadow-amber-500/10',
  info: 'bg-blue-500/10 border-blue-500/20 text-blue-400 shadow-blue-500/10',
}

export default function NotificationContainer() {
  const { notifications, removeNotification } = useNotificationStore()

  if (notifications.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-3 w-full max-w-sm pointer-events-none">
      {notifications.map((n) => {
        const Icon = icons[n.type]
        return (
          <div
            key={n.id}
            className={cn(
              "p-4 rounded-2xl border backdrop-blur-md shadow-lg flex items-start gap-3 pointer-events-auto",
              "animate-in slide-in-from-right-full fade-in duration-300",
              styles[n.type]
            )}
          >
            <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-sm font-medium leading-relaxed">
              {n.message}
            </div>
            <button
              onClick={() => removeNotification(n.id)}
              className="p-1 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface Notification {
  id: string
  type: NotificationType
  message: string
  duration?: number
}

interface NotificationState {
  notifications: Notification[]
  addNotification: (message: string, type?: NotificationType, duration?: number) => void
  removeNotification: (id: string) => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  addNotification: (message, type = 'info', duration = 4000) => {
    const id = uuidv4()
    set((state) => ({
      notifications: [...state.notifications, { id, type, message, duration }]
    }))

    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id)
        }))
      }, duration)
    }
  },
  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id)
    }))
  }
}))

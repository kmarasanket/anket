import { create } from 'zustand'

export type ConfirmVariant = 'danger' | 'warning' | 'info' | 'success'

export interface ConfirmModalOptions {
  title: string
  message: string
  detail?: string
  confirmText?: string
  cancelText?: string
  variant?: ConfirmVariant
  onConfirm: () => void | Promise<void>
  onCancel?: () => void
}

interface ConfirmModalState {
  isOpen: boolean
  options: ConfirmModalOptions | null
  loading: boolean
  showConfirm: (options: ConfirmModalOptions) => void
  closeModal: () => void
  setLoading: (v: boolean) => void
}

export const useConfirmModalStore = create<ConfirmModalState>((set) => ({
  isOpen: false,
  options: null,
  loading: false,
  showConfirm: (options) => set({ isOpen: true, options, loading: false }),
  closeModal: () => set({ isOpen: false, options: null, loading: false }),
  setLoading: (v) => set({ loading: v }),
}))

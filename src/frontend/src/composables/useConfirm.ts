import { ref } from 'vue'

export interface ConfirmOptions {
  type?: 'warning' | 'danger'
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
}

interface ConfirmState {
  visible: boolean
  options: ConfirmOptions
  resolve: ((value: boolean) => void) | null
}

const state = ref<ConfirmState>({
  visible: false,
  options: { message: '' },
  resolve: null,
})

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    state.value = {
      visible: true,
      options: { type: 'warning', title: '確認操作', confirmLabel: '確認', cancelLabel: '取消', ...opts },
      resolve,
    }
  })
}

export function useConfirm() {
  function handleConfirm() {
    state.value.resolve?.(true)
    state.value = { visible: false, options: { message: '' }, resolve: null }
  }
  function handleCancel() {
    state.value.resolve?.(false)
    state.value = { visible: false, options: { message: '' }, resolve: null }
  }
  return { state, handleConfirm, handleCancel }
}

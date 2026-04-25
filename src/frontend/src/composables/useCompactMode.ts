import { ref, watchEffect } from 'vue'

const STORAGE_KEY = 'oc_compact_mode'

function loadStored(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const compact = ref<boolean>(loadStored())

function persist(value: boolean): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    /* silent */
  }
}

watchEffect(() => persist(compact.value))

export function useCompactMode() {
  return {
    compact,
    toggleCompact: () => {
      compact.value = !compact.value
    },
    setCompact: (v: boolean) => {
      compact.value = v
    },
  }
}

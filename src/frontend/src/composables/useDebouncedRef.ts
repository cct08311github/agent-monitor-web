import { ref, watch, onUnmounted, type Ref } from 'vue'
import { createDebouncer } from '@/lib/debounce'

/**
 * Returns a Ref whose value lags `source` by `delayMs`.
 * Each update to `source` resets the debounce timer; the returned ref only
 * updates after `delayMs` of quiescence. Timer is cleared on component unmount.
 */
export function useDebouncedRef<T>(source: Ref<T>, delayMs: number): Ref<T> {
  const debounced = ref(source.value) as Ref<T>
  const debouncer = createDebouncer<T>((val) => {
    debounced.value = val
  }, delayMs)
  watch(source, (val) => {
    debouncer(val)
  })
  onUnmounted(() => {
    debouncer.cancel()
  })
  return debounced
}

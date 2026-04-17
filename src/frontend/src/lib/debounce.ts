/**
 * Create a debounced wrapper around a callback.
 * The callback fires only after `delayMs` has passed since the last invocation.
 * Each new call cancels any pending timer.
 */
export function createDebouncer<T>(
  callback: (value: T) => void,
  delayMs: number,
): {
  (value: T): void
  cancel: () => void
} {
  let timer: ReturnType<typeof setTimeout> | null = null

  const debounced = (value: T): void => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      callback(value)
    }, delayMs)
  }

  debounced.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  return debounced
}

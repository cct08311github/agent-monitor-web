import { ref, type Ref } from 'vue'

export interface LogPauseOptions {
  /** Hard cap on queue size. When exceeded, oldest entries are dropped. */
  maxQueueSize: number
}

export interface LogPauseApi<T> {
  paused: Ref<boolean>
  pauseQueue: Ref<T[]>
  /** Push an entry into the queue, truncating oldest when cap exceeded. */
  enqueue: (entry: T) => void
  /** Return all queued entries and clear the queue. */
  drain: () => T[]
  /** Clear the queue without returning contents. */
  reset: () => void
}

/**
 * State machine for SSE pause/resume: a bounded FIFO queue that holds entries
 * while `paused` is true. Caller owns the decision of whether to enqueue or
 * append directly; this composable only manages the queue storage.
 */
export function useLogPause<T>(options: LogPauseOptions): LogPauseApi<T> {
  const paused = ref(false)
  const pauseQueue = ref<T[]>([]) as Ref<T[]>

  function enqueue(entry: T): void {
    pauseQueue.value.push(entry)
    if (pauseQueue.value.length > options.maxQueueSize) {
      pauseQueue.value.splice(0, pauseQueue.value.length - options.maxQueueSize)
    }
  }

  function drain(): T[] {
    return pauseQueue.value.splice(0)
  }

  function reset(): void {
    pauseQueue.value = []
  }

  return { paused, pauseQueue, enqueue, drain, reset }
}

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useQuickCapture } from '../useQuickCapture'

// ---------------------------------------------------------------------------
// localStorage stub — reset per test to isolate reactive state reads
// ---------------------------------------------------------------------------

function makeLocalStorageStub() {
  const store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k])
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorageStub())
  // Reset module-scoped captures ref by clearing all captures via the composable
  const { clear } = useQuickCapture()
  clear()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useQuickCapture', () => {
  it('add updates reactive captures with the new item at the front', () => {
    const { add, captures } = useQuickCapture()

    const first = add('thought one', 'MonitorTab')
    const second = add('thought two', 'LogsTab')

    expect(captures.value[0]?.id).toBe(second.id)
    expect(captures.value[1]?.id).toBe(first.id)
    expect(captures.value).toHaveLength(2)
  })

  it('remove removes the capture from reactive captures', () => {
    const { add, remove, captures } = useQuickCapture()

    const a = add('to keep', 'ctx')
    const b = add('to delete', 'ctx')

    remove(b.id)

    expect(captures.value.map((c) => c.id)).not.toContain(b.id)
    expect(captures.value.map((c) => c.id)).toContain(a.id)
    expect(captures.value).toHaveLength(1)
  })

  it('clear empties reactive captures', () => {
    const { add, clear, captures } = useQuickCapture()

    add('alpha', 'ctx')
    add('beta', 'ctx')

    expect(captures.value).toHaveLength(2)

    clear()

    expect(captures.value).toHaveLength(0)
  })
})

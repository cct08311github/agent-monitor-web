import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadAnnotations, saveAnnotation, removeAnnotation } from '../sessionAnnotations'

// ---------------------------------------------------------------------------
// localStorage stub
// ---------------------------------------------------------------------------

const store: Record<string, string> = {}

const localStorageMock = {
  getItem: vi.fn((k: string) => store[k] ?? null),
  setItem: vi.fn((k: string, v: string) => {
    store[k] = v
  }),
  removeItem: vi.fn((k: string) => {
    delete store[k]
  }),
  clear: vi.fn(() => {
    for (const k of Object.keys(store)) delete store[k]
  }),
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
})

beforeEach(() => {
  localStorageMock.clear()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// 1. load empty (no key)
// ---------------------------------------------------------------------------

describe('loadAnnotations', () => {
  it('returns empty array when no key exists', () => {
    const result = loadAnnotations('agent-1', 'session-abc')
    expect(result).toEqual([])
  })

  it('returns empty array when stored value is corrupt JSON', () => {
    store['oc_session_notes:agent-1:session-abc'] = '{bad json'
    const result = loadAnnotations('agent-1', 'session-abc')
    expect(result).toEqual([])
  })

  it('returns empty array when stored value is not an array', () => {
    store['oc_session_notes:agent-1:session-abc'] = JSON.stringify({ msgIndex: 0, note: 'hi' })
    const result = loadAnnotations('agent-1', 'session-abc')
    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 2. save new annotation
// ---------------------------------------------------------------------------

describe('saveAnnotation — save new', () => {
  it('saves a new annotation and returns the updated list', () => {
    const result = saveAnnotation('agent-1', 'session-abc', 0, 'important note')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ msgIndex: 0, note: 'important note' })
    expect(typeof result[0].ts).toBe('number')
  })

  it('persists the annotation to localStorage', () => {
    saveAnnotation('agent-1', 'session-abc', 2, 'test note')
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'oc_session_notes:agent-1:session-abc',
      expect.stringContaining('test note'),
    )
  })

  it('can save multiple annotations for different message indices', () => {
    saveAnnotation('agent-1', 'session-abc', 0, 'note zero')
    const result = saveAnnotation('agent-1', 'session-abc', 3, 'note three')
    expect(result).toHaveLength(2)
    expect(result.find(a => a.msgIndex === 0)?.note).toBe('note zero')
    expect(result.find(a => a.msgIndex === 3)?.note).toBe('note three')
  })
})

// ---------------------------------------------------------------------------
// 3. update existing annotation
// ---------------------------------------------------------------------------

describe('saveAnnotation — update existing', () => {
  it('overwrites annotation when msgIndex already exists', () => {
    saveAnnotation('agent-1', 'session-abc', 1, 'first note')
    const result = saveAnnotation('agent-1', 'session-abc', 1, 'updated note')
    expect(result).toHaveLength(1)
    expect(result[0].note).toBe('updated note')
  })

  it('trims whitespace from note before saving', () => {
    const result = saveAnnotation('agent-1', 'session-abc', 0, '  trimmed  ')
    expect(result[0].note).toBe('trimmed')
  })
})

// ---------------------------------------------------------------------------
// 4. remove annotation (empty note)
// ---------------------------------------------------------------------------

describe('saveAnnotation — remove via empty note', () => {
  it('removes annotation when note is empty string', () => {
    saveAnnotation('agent-1', 'session-abc', 0, 'to be deleted')
    const result = saveAnnotation('agent-1', 'session-abc', 0, '')
    expect(result).toHaveLength(0)
  })

  it('removes annotation when note is whitespace only', () => {
    saveAnnotation('agent-1', 'session-abc', 0, 'to be deleted')
    const result = saveAnnotation('agent-1', 'session-abc', 0, '   ')
    expect(result).toHaveLength(0)
  })

  it('is idempotent — removing non-existent entry does not error', () => {
    const result = saveAnnotation('agent-1', 'session-abc', 99, '')
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 5. removeAnnotation helper
// ---------------------------------------------------------------------------

describe('removeAnnotation', () => {
  it('delegates to saveAnnotation with empty note', () => {
    saveAnnotation('agent-1', 'session-abc', 5, 'note')
    const result = removeAnnotation('agent-1', 'session-abc', 5)
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 6. localStorage error handling
// ---------------------------------------------------------------------------

describe('localStorage error handling', () => {
  it('returns empty array when localStorage.getItem throws', () => {
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error('storage unavailable')
    })
    const result = loadAnnotations('agent-1', 'session-abc')
    expect(result).toEqual([])
  })

  it('does not throw when localStorage.setItem throws', () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('quota exceeded')
    })
    expect(() => saveAnnotation('agent-1', 'session-abc', 0, 'note')).not.toThrow()
  })
})

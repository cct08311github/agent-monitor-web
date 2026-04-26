import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  buildCaptureBackup,
  parseCaptureBackup,
  restoreCaptureBackup,
} from '../captureExportJson'
import type { CaptureBackup } from '../captureExportJson'
import type { Capture } from '../quickCapture'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const c1: Capture = { id: 'qc_1', body: 'First thought', context: 'Dashboard', createdAt: 1_000_000 }
const c2: Capture = { id: 'qc_2', body: 'Second idea #test', context: 'Chat', createdAt: 2_000_000 }

function makeLocalStorageStub(): Storage {
  const store: Record<string, string> = {}
  return {
    get length() {
      return Object.keys(store).length
    },
    key(index: number): string | null {
      return Object.keys(store)[index] ?? null
    },
    getItem(key: string): string | null {
      return Object.prototype.hasOwnProperty.call(store, key) ? (store[key] ?? null) : null
    },
    setItem(key: string, value: string): void {
      store[key] = value
    },
    removeItem(key: string): void {
      delete store[key]
    },
    clear(): void {
      for (const k of Object.keys(store)) delete store[k]
    },
  } as Storage
}

// ---------------------------------------------------------------------------
// buildCaptureBackup
// ---------------------------------------------------------------------------

describe('buildCaptureBackup', () => {
  it('filename matches pattern quick-captures-backup-YYYY-MM-DD.json', () => {
    const now = new Date(2026, 3, 26) // 2026-04-26
    const { filename } = buildCaptureBackup({ captures: [], archivedIds: [], pinnedIds: [] }, now)
    expect(filename).toMatch(/^quick-captures-backup-\d{4}-\d{2}-\d{2}\.json$/)
    expect(filename).toBe('quick-captures-backup-2026-04-26.json')
  })

  it('filename zero-pads month and day', () => {
    const now = new Date(2026, 0, 5) // 2026-01-05
    const { filename } = buildCaptureBackup({ captures: [], archivedIds: [], pinnedIds: [] }, now)
    expect(filename).toBe('quick-captures-backup-2026-01-05.json')
  })

  it('content includes version "1"', () => {
    const { content } = buildCaptureBackup(
      { captures: [c1], archivedIds: ['qc_2'], pinnedIds: ['qc_1'] },
    )
    const parsed = JSON.parse(content) as CaptureBackup
    expect(parsed.version).toBe('1')
  })

  it('content includes exportedAt as a number', () => {
    const now = new Date(2026, 3, 26)
    const { content } = buildCaptureBackup(
      { captures: [], archivedIds: [], pinnedIds: [] },
      now,
    )
    const parsed = JSON.parse(content) as CaptureBackup
    expect(typeof parsed.exportedAt).toBe('number')
    expect(parsed.exportedAt).toBe(now.getTime())
  })

  it('content preserves captures array', () => {
    const { content } = buildCaptureBackup({ captures: [c1, c2], archivedIds: [], pinnedIds: [] })
    const parsed = JSON.parse(content) as CaptureBackup
    expect(parsed.captures).toHaveLength(2)
    expect(parsed.captures[0]?.id).toBe('qc_1')
    expect(parsed.captures[1]?.id).toBe('qc_2')
  })

  it('content preserves archivedIds', () => {
    const { content } = buildCaptureBackup({
      captures: [c1, c2],
      archivedIds: ['qc_2'],
      pinnedIds: [],
    })
    const parsed = JSON.parse(content) as CaptureBackup
    expect(parsed.archivedIds).toEqual(['qc_2'])
  })

  it('content preserves pinnedIds', () => {
    const { content } = buildCaptureBackup({
      captures: [c1, c2],
      archivedIds: [],
      pinnedIds: ['qc_1'],
    })
    const parsed = JSON.parse(content) as CaptureBackup
    expect(parsed.pinnedIds).toEqual(['qc_1'])
  })

  it('does not mutate the input arrays', () => {
    const caps = [c1]
    const archived = ['qc_2']
    const pinned = ['qc_1']
    buildCaptureBackup({ captures: caps, archivedIds: archived, pinnedIds: pinned })
    expect(caps).toHaveLength(1)
    expect(archived).toHaveLength(1)
    expect(pinned).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// parseCaptureBackup
// ---------------------------------------------------------------------------

describe('parseCaptureBackup', () => {
  const validBackup: CaptureBackup = {
    version: '1',
    exportedAt: 1_700_000_000_000,
    captures: [c1, c2],
    archivedIds: ['qc_2'],
    pinnedIds: ['qc_1'],
  }

  it('returns a CaptureBackup for valid JSON', () => {
    const result = parseCaptureBackup(JSON.stringify(validBackup))
    expect(result).not.toBeNull()
    expect(result?.version).toBe('1')
    expect(result?.exportedAt).toBe(1_700_000_000_000)
    expect(result?.captures).toHaveLength(2)
    expect(result?.archivedIds).toEqual(['qc_2'])
    expect(result?.pinnedIds).toEqual(['qc_1'])
  })

  it('returns null for invalid / malformed JSON', () => {
    expect(parseCaptureBackup('not json')).toBeNull()
    expect(parseCaptureBackup('{broken')).toBeNull()
    expect(parseCaptureBackup('')).toBeNull()
  })

  it('returns null when version is not "1"', () => {
    const bad = { ...validBackup, version: '2' }
    expect(parseCaptureBackup(JSON.stringify(bad))).toBeNull()
  })

  it('returns null when exportedAt is missing', () => {
    const { exportedAt: _, ...bad } = validBackup
    expect(parseCaptureBackup(JSON.stringify(bad))).toBeNull()
  })

  it('returns null when captures field is missing', () => {
    const { captures: _, ...bad } = validBackup
    expect(parseCaptureBackup(JSON.stringify(bad))).toBeNull()
  })

  it('returns null when archivedIds is not an array', () => {
    const bad = { ...validBackup, archivedIds: 'wrong' }
    expect(parseCaptureBackup(JSON.stringify(bad))).toBeNull()
  })

  it('returns null when pinnedIds is not an array', () => {
    const bad = { ...validBackup, pinnedIds: 42 }
    expect(parseCaptureBackup(JSON.stringify(bad))).toBeNull()
  })

  it('filters invalid Capture entries out of captures array', () => {
    const withBad = {
      ...validBackup,
      captures: [
        c1,
        { id: 123, body: 'bad id type', context: 'x', createdAt: 1 }, // id is number
        { body: 'missing id', context: 'x', createdAt: 1 }, // no id
        c2,
      ],
    }
    const result = parseCaptureBackup(JSON.stringify(withBad))
    expect(result).not.toBeNull()
    expect(result?.captures).toHaveLength(2)
    expect(result?.captures[0]?.id).toBe('qc_1')
    expect(result?.captures[1]?.id).toBe('qc_2')
  })

  it('filters non-string values out of archivedIds', () => {
    const withBad = { ...validBackup, archivedIds: ['good-id', 42, null, 'another-id', true] }
    const result = parseCaptureBackup(JSON.stringify(withBad))
    expect(result).not.toBeNull()
    expect(result?.archivedIds).toEqual(['good-id', 'another-id'])
  })

  it('filters non-string values out of pinnedIds', () => {
    const withBad = { ...validBackup, pinnedIds: ['pin-1', false, undefined, 'pin-2'] }
    const result = parseCaptureBackup(JSON.stringify(withBad))
    expect(result).not.toBeNull()
    expect(result?.pinnedIds).toEqual(['pin-1', 'pin-2'])
  })

  it('round-trips with buildCaptureBackup output', () => {
    const { content } = buildCaptureBackup({
      captures: [c1, c2],
      archivedIds: ['qc_2'],
      pinnedIds: ['qc_1'],
    })
    const result = parseCaptureBackup(content)
    expect(result).not.toBeNull()
    expect(result?.captures).toHaveLength(2)
    expect(result?.archivedIds).toEqual(['qc_2'])
    expect(result?.pinnedIds).toEqual(['qc_1'])
    expect(result?.version).toBe('1')
  })

  it('returns null when top-level value is not an object', () => {
    expect(parseCaptureBackup('"just a string"')).toBeNull()
    expect(parseCaptureBackup('null')).toBeNull()
    expect(parseCaptureBackup('42')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// restoreCaptureBackup
// ---------------------------------------------------------------------------

describe('restoreCaptureBackup', () => {
  let storage: Storage

  beforeEach(() => {
    storage = makeLocalStorageStub()
    vi.stubGlobal('localStorage', storage)
  })

  it('writes oc_quick_captures to localStorage', () => {
    const backup: CaptureBackup = {
      version: '1',
      exportedAt: 1_700_000_000_000,
      captures: [c1, c2],
      archivedIds: [],
      pinnedIds: [],
    }
    restoreCaptureBackup(backup)
    const raw = storage.getItem('oc_quick_captures')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as Capture[]
    expect(parsed).toHaveLength(2)
    expect(parsed[0]?.id).toBe('qc_1')
    expect(parsed[1]?.id).toBe('qc_2')
  })

  it('writes oc_capture_archived to localStorage', () => {
    const backup: CaptureBackup = {
      version: '1',
      exportedAt: 1_700_000_000_000,
      captures: [],
      archivedIds: ['qc_2'],
      pinnedIds: [],
    }
    restoreCaptureBackup(backup)
    const raw = storage.getItem('oc_capture_archived')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as string[]
    expect(parsed).toEqual(['qc_2'])
  })

  it('writes oc_capture_pinned to localStorage', () => {
    const backup: CaptureBackup = {
      version: '1',
      exportedAt: 1_700_000_000_000,
      captures: [],
      archivedIds: [],
      pinnedIds: ['qc_1'],
    }
    restoreCaptureBackup(backup)
    const raw = storage.getItem('oc_capture_pinned')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as string[]
    expect(parsed).toEqual(['qc_1'])
  })

  it('writes all three keys when all data is present', () => {
    const backup: CaptureBackup = {
      version: '1',
      exportedAt: 1_700_000_000_000,
      captures: [c1],
      archivedIds: ['qc_2'],
      pinnedIds: ['qc_1'],
    }
    restoreCaptureBackup(backup)
    expect(storage.getItem('oc_quick_captures')).not.toBeNull()
    expect(storage.getItem('oc_capture_archived')).not.toBeNull()
    expect(storage.getItem('oc_capture_pinned')).not.toBeNull()
  })

  it('overwrites existing storage values', () => {
    storage.setItem('oc_quick_captures', JSON.stringify([c2]))
    storage.setItem('oc_capture_archived', JSON.stringify(['old-id']))
    storage.setItem('oc_capture_pinned', JSON.stringify(['old-pin']))

    const backup: CaptureBackup = {
      version: '1',
      exportedAt: 1_700_000_000_000,
      captures: [c1],
      archivedIds: [],
      pinnedIds: [],
    }
    restoreCaptureBackup(backup)

    const caps = JSON.parse(storage.getItem('oc_quick_captures')!) as Capture[]
    expect(caps).toHaveLength(1)
    expect(caps[0]?.id).toBe('qc_1')
    const archived = JSON.parse(storage.getItem('oc_capture_archived')!) as string[]
    expect(archived).toEqual([])
    const pinned = JSON.parse(storage.getItem('oc_capture_pinned')!) as string[]
    expect(pinned).toEqual([])
  })
})

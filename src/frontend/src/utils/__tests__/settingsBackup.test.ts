import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  collectSettings,
  buildBackup,
  exportAsJson,
  parseBackup,
  restoreSettings,
  clearAllSettings,
} from '../settingsBackup'
import type { SettingsBackup } from '../settingsBackup'

// ---------------------------------------------------------------------------
// localStorage stub
// ---------------------------------------------------------------------------

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
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
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
// Helpers
// ---------------------------------------------------------------------------

function seedStorage(stub: Storage, entries: Record<string, string>): void {
  for (const [k, v] of Object.entries(entries)) {
    stub.setItem(k, v)
  }
}

// ---------------------------------------------------------------------------
// collectSettings
// ---------------------------------------------------------------------------

describe('collectSettings', () => {
  let storage: Storage

  beforeEach(() => {
    storage = makeLocalStorageStub()
    vi.stubGlobal('localStorage', storage)
  })

  it('returns only oc_* keys from a mixed storage', () => {
    seedStorage(storage, {
      oc_theme: 'dark',
      oc_compact: '1',
      unrelated_key: 'should-be-ignored',
      other: 'also-ignored',
    })
    const result = collectSettings()
    expect(Object.keys(result)).toHaveLength(2)
    expect(result['oc_theme']).toBe('dark')
    expect(result['oc_compact']).toBe('1')
    expect('unrelated_key' in result).toBe(false)
    expect('other' in result).toBe(false)
  })

  it('returns empty object when storage is empty', () => {
    expect(collectSettings()).toEqual({})
  })

  it('returns empty object when storage has only non-oc_ keys', () => {
    seedStorage(storage, { foo: 'bar', baz: 'qux' })
    expect(collectSettings()).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// buildBackup
// ---------------------------------------------------------------------------

describe('buildBackup', () => {
  let storage: Storage

  beforeEach(() => {
    storage = makeLocalStorageStub()
    vi.stubGlobal('localStorage', storage)
  })

  it('returns version "1"', () => {
    const backup = buildBackup()
    expect(backup.version).toBe('1')
  })

  it('exportedAt is a number', () => {
    const backup = buildBackup()
    expect(typeof backup.exportedAt).toBe('number')
  })

  it('uses the provided now argument for exportedAt', () => {
    const ts = 1_700_000_000_000
    const backup = buildBackup(ts)
    expect(backup.exportedAt).toBe(ts)
  })

  it('settings contains oc_* keys present in storage', () => {
    seedStorage(storage, { oc_foo: 'bar', irrelevant: 'x' })
    const backup = buildBackup()
    expect(backup.settings['oc_foo']).toBe('bar')
    expect('irrelevant' in backup.settings).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// exportAsJson
// ---------------------------------------------------------------------------

describe('exportAsJson', () => {
  let storage: Storage

  beforeEach(() => {
    storage = makeLocalStorageStub()
    vi.stubGlobal('localStorage', storage)
  })

  it('filename matches expected pattern with date from now parameter', () => {
    const now = new Date(2026, 3, 26) // 2026-04-26
    const { filename } = exportAsJson(now)
    expect(filename).toMatch(/^agent-monitor-settings-\d{4}-\d{2}-\d{2}\.json$/)
    expect(filename).toBe('agent-monitor-settings-2026-04-26.json')
  })

  it('content parses back to a valid SettingsBackup via parseBackup', () => {
    seedStorage(storage, { oc_key: 'value' })
    const { content } = exportAsJson()
    const parsed = parseBackup(content)
    expect(parsed).not.toBeNull()
    expect(parsed?.version).toBe('1')
    expect(parsed?.settings['oc_key']).toBe('value')
  })
})

// ---------------------------------------------------------------------------
// parseBackup
// ---------------------------------------------------------------------------

describe('parseBackup', () => {
  const validBackup: SettingsBackup = {
    version: '1',
    exportedAt: 1_700_000_000_000,
    settings: { oc_theme: 'neon', oc_compact: '1' },
  }

  it('returns a SettingsBackup for valid JSON', () => {
    const result = parseBackup(JSON.stringify(validBackup))
    expect(result).not.toBeNull()
    expect(result?.version).toBe('1')
    expect(result?.exportedAt).toBe(1_700_000_000_000)
    expect(result?.settings['oc_theme']).toBe('neon')
  })

  it('returns null for invalid / malformed JSON', () => {
    expect(parseBackup('not json at all')).toBeNull()
    expect(parseBackup('{broken')).toBeNull()
    expect(parseBackup('')).toBeNull()
  })

  it('returns null when version is not "1"', () => {
    const bad = { ...validBackup, version: '2' }
    expect(parseBackup(JSON.stringify(bad))).toBeNull()
  })

  it('returns null when exportedAt is missing', () => {
    const { exportedAt: _, ...bad } = validBackup
    expect(parseBackup(JSON.stringify(bad))).toBeNull()
  })

  it('returns null when settings field is missing', () => {
    const { settings: _, ...bad } = validBackup
    expect(parseBackup(JSON.stringify(bad))).toBeNull()
  })

  it('returns null when settings is not an object', () => {
    const bad = { ...validBackup, settings: 'should-be-object' }
    expect(parseBackup(JSON.stringify(bad))).toBeNull()
  })

  it('filters out non-string values in settings, keeping string ones', () => {
    const mixed = {
      ...validBackup,
      settings: {
        oc_good: 'value',
        oc_num: 42,
        oc_bool: true,
        oc_null: null,
        oc_arr: [],
      },
    }
    const result = parseBackup(JSON.stringify(mixed))
    expect(result).not.toBeNull()
    expect(result?.settings['oc_good']).toBe('value')
    expect('oc_num' in (result?.settings ?? {})).toBe(false)
    expect('oc_bool' in (result?.settings ?? {})).toBe(false)
    expect('oc_null' in (result?.settings ?? {})).toBe(false)
    expect('oc_arr' in (result?.settings ?? {})).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// restoreSettings
// ---------------------------------------------------------------------------

describe('restoreSettings', () => {
  let storage: Storage

  beforeEach(() => {
    storage = makeLocalStorageStub()
    vi.stubGlobal('localStorage', storage)
  })

  it('writes oc_* keys from backup to localStorage', () => {
    const backup: SettingsBackup = {
      version: '1',
      exportedAt: Date.now(),
      settings: { oc_theme: 'retro', oc_compact: '0' },
    }
    const count = restoreSettings(backup)
    expect(count).toBe(2)
    expect(storage.getItem('oc_theme')).toBe('retro')
    expect(storage.getItem('oc_compact')).toBe('0')
  })

  it('does NOT write non-oc_ keys from backup (security boundary)', () => {
    const backup: SettingsBackup = {
      version: '1',
      exportedAt: Date.now(),
      // evil_key has no oc_ prefix — must be blocked
      settings: { evil_key: 'injected', oc_legit: 'ok' },
    }
    restoreSettings(backup)
    expect(storage.getItem('evil_key')).toBeNull()
    expect(storage.getItem('oc_legit')).toBe('ok')
  })

  it('clears existing oc_* keys before applying backup', () => {
    seedStorage(storage, { oc_stale: 'old-value', oc_other: 'to-be-removed' })
    const backup: SettingsBackup = {
      version: '1',
      exportedAt: Date.now(),
      settings: { oc_new: 'fresh' },
    }
    restoreSettings(backup)
    expect(storage.getItem('oc_stale')).toBeNull()
    expect(storage.getItem('oc_other')).toBeNull()
    expect(storage.getItem('oc_new')).toBe('fresh')
  })

  it('returns the count of restored keys (only oc_* ones)', () => {
    const backup: SettingsBackup = {
      version: '1',
      exportedAt: Date.now(),
      settings: {
        oc_a: '1',
        oc_b: '2',
        evil: 'blocked',
      },
    }
    const count = restoreSettings(backup)
    expect(count).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// clearAllSettings
// ---------------------------------------------------------------------------

describe('clearAllSettings', () => {
  let storage: Storage

  beforeEach(() => {
    storage = makeLocalStorageStub()
    vi.stubGlobal('localStorage', storage)
  })

  it('removes all oc_* keys', () => {
    seedStorage(storage, { oc_a: '1', oc_b: '2' })
    const count = clearAllSettings()
    expect(count).toBe(2)
    expect(storage.getItem('oc_a')).toBeNull()
    expect(storage.getItem('oc_b')).toBeNull()
  })

  it('does NOT remove non-oc_ keys (security — only oc_* prefix touched)', () => {
    seedStorage(storage, { oc_x: 'remove-me', keep_me: 'untouched', other: 'also-untouched' })
    clearAllSettings()
    expect(storage.getItem('keep_me')).toBe('untouched')
    expect(storage.getItem('other')).toBe('also-untouched')
    expect(storage.getItem('oc_x')).toBeNull()
  })

  it('returns 0 when there are no oc_* keys', () => {
    seedStorage(storage, { foo: 'bar' })
    expect(clearAllSettings()).toBe(0)
  })
})

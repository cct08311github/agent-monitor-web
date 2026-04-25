import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  loadSnoozes,
  saveSnoozes,
  snoozeAlert,
  unsnoozeAlert,
  isSnoozed,
  pruneExpired,
  partitionAlerts,
  snoozeRemainingLabel,
  durationLabel,
  SNOOZE_DURATIONS,
  type SnoozeEntry,
} from '../alertSnooze'

// ---------------------------------------------------------------------------
// localStorage stub
// ---------------------------------------------------------------------------

let store: Record<string, string> = {}

const localStorageMock: Storage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = value
  },
  removeItem: (key: string) => {
    delete store[key]
  },
  clear: () => {
    store = {}
  },
  get length() {
    return Object.keys(store).length
  },
  key: (index: number) => Object.keys(store)[index] ?? null,
}

beforeEach(() => {
  store = {}
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  store = {}
})

// ---------------------------------------------------------------------------
// snoozeAlert
// ---------------------------------------------------------------------------

describe('snoozeAlert', () => {
  it('returns entry with correct snoozedUntil', () => {
    const now = 1_000_000
    const duration = 60 * 60 * 1000 // 1h
    const entry = snoozeAlert('rule_a:123', duration, now)
    expect(entry.alertId).toBe('rule_a:123')
    expect(entry.snoozedAt).toBe(now)
    expect(entry.snoozedUntil).toBe(now + duration)
    expect(entry.duration).toBe(duration)
  })

  it('persists to localStorage', () => {
    const entry = snoozeAlert('rule_b:456', 15 * 60 * 1000, 2_000_000)
    const loaded = loadSnoozes()
    expect(loaded.get('rule_b:456')).toEqual(entry)
  })

  it('per-alert isolation: snooze A does not affect B', () => {
    snoozeAlert('alert_a:1', 60_000, 1_000_000)
    const loaded = loadSnoozes()
    expect(loaded.has('alert_a:1')).toBe(true)
    expect(loaded.has('alert_b:2')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isSnoozed
// ---------------------------------------------------------------------------

describe('isSnoozed', () => {
  const base = 1_000_000

  it('returns true when snoozedUntil is in the future', () => {
    const entry: SnoozeEntry = {
      alertId: 'x:1',
      snoozedAt: base,
      snoozedUntil: base + 1,
      duration: 1,
    }
    expect(isSnoozed(entry, base)).toBe(true)
  })

  it('returns false when snoozedUntil equals now', () => {
    const entry: SnoozeEntry = {
      alertId: 'x:1',
      snoozedAt: base,
      snoozedUntil: base,
      duration: 1,
    }
    expect(isSnoozed(entry, base)).toBe(false)
  })

  it('returns false when snoozedUntil is in the past', () => {
    const entry: SnoozeEntry = {
      alertId: 'x:1',
      snoozedAt: base,
      snoozedUntil: base - 1,
      duration: 1,
    }
    expect(isSnoozed(entry, base)).toBe(false)
  })

  it('returns false for undefined entry', () => {
    expect(isSnoozed(undefined)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// pruneExpired
// ---------------------------------------------------------------------------

describe('pruneExpired', () => {
  it('removes expired entries and keeps active ones', () => {
    const now = 2_000_000
    const active: SnoozeEntry = {
      alertId: 'a:1',
      snoozedAt: now - 100,
      snoozedUntil: now + 10_000,
      duration: 10_100,
    }
    const expired: SnoozeEntry = {
      alertId: 'b:2',
      snoozedAt: now - 5_000,
      snoozedUntil: now - 1,
      duration: 4_999,
    }
    const m = new Map<string, SnoozeEntry>([
      ['a:1', active],
      ['b:2', expired],
    ])
    const pruned = pruneExpired(m, now)
    expect(pruned.size).toBe(1)
    expect(pruned.has('a:1')).toBe(true)
    expect(pruned.has('b:2')).toBe(false)
  })

  it('returns new map (original unchanged)', () => {
    const now = 1_000_000
    const entry: SnoozeEntry = {
      alertId: 'a:1',
      snoozedAt: now - 5000,
      snoozedUntil: now - 1,
      duration: 4999,
    }
    const m = new Map<string, SnoozeEntry>([['a:1', entry]])
    const pruned = pruneExpired(m, now)
    expect(pruned).not.toBe(m)
    expect(m.size).toBe(1) // original unchanged
    expect(pruned.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// partitionAlerts
// ---------------------------------------------------------------------------

describe('partitionAlerts', () => {
  type A = { id: string; rule: string }

  it('correctly splits active and snoozed alerts', () => {
    const now = 1_000_000
    const snoozeEntry: SnoozeEntry = {
      alertId: 'alert:2',
      snoozedAt: now - 100,
      snoozedUntil: now + 10_000,
      duration: 10_100,
    }
    const snoozes = new Map<string, SnoozeEntry>([['alert:2', snoozeEntry]])
    const alerts: A[] = [
      { id: 'alert:1', rule: 'high_cpu' },
      { id: 'alert:2', rule: 'high_mem' },
      { id: 'alert:3', rule: 'disk_full' },
    ]
    const { active, snoozed } = partitionAlerts(alerts, snoozes, now)
    expect(active.map((a) => a.id)).toEqual(['alert:1', 'alert:3'])
    expect(snoozed.map((a) => a.id)).toEqual(['alert:2'])
  })

  it('returns all active when no snoozes', () => {
    const alerts: A[] = [{ id: 'x:1', rule: 'r1' }]
    const { active, snoozed } = partitionAlerts(alerts, new Map(), Date.now())
    expect(active.length).toBe(1)
    expect(snoozed.length).toBe(0)
  })

  it('returns all snoozed when all alerts are snoozed', () => {
    const now = 5_000_000
    const entry: SnoozeEntry = {
      alertId: 'x:1',
      snoozedAt: now,
      snoozedUntil: now + 60_000,
      duration: 60_000,
    }
    const snoozes = new Map([['x:1', entry]])
    const { active, snoozed } = partitionAlerts([{ id: 'x:1', rule: 'r1' }], snoozes, now)
    expect(active.length).toBe(0)
    expect(snoozed.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// loadSnoozes / saveSnoozes round-trip
// ---------------------------------------------------------------------------

describe('loadSnoozes / saveSnoozes round-trip', () => {
  it('preserves all fields after save + load', () => {
    const entry: SnoozeEntry = {
      alertId: 'my_rule:999',
      snoozedAt: 1_000_000,
      snoozedUntil: 1_060_000,
      duration: 60_000,
    }
    const m = new Map<string, SnoozeEntry>([['my_rule:999', entry]])
    saveSnoozes(m)
    const loaded = loadSnoozes()
    expect(loaded.get('my_rule:999')).toEqual(entry)
  })

  it('returns empty Map for corrupt JSON', () => {
    store['oc_alert_snooze'] = 'not-valid-json{{{'
    expect(loadSnoozes().size).toBe(0)
  })

  it('filters invalid entries (missing fields)', () => {
    store['oc_alert_snooze'] = JSON.stringify({
      valid: { alertId: 'v:1', snoozedAt: 100, snoozedUntil: 200, duration: 100 },
      // missing duration
      invalid1: { alertId: 'i:1', snoozedAt: 100, snoozedUntil: 200 },
      // wrong types
      invalid2: { alertId: 123, snoozedAt: 100, snoozedUntil: 200, duration: 100 },
    })
    const loaded = loadSnoozes()
    expect(loaded.size).toBe(1)
    expect(loaded.has('valid')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// unsnoozeAlert
// ---------------------------------------------------------------------------

describe('unsnoozeAlert', () => {
  it('removes only the specified alertId', () => {
    snoozeAlert('a:1', 60_000, 1_000_000)
    snoozeAlert('b:2', 60_000, 1_000_000)
    unsnoozeAlert('a:1')
    const loaded = loadSnoozes()
    expect(loaded.has('a:1')).toBe(false)
    expect(loaded.has('b:2')).toBe(true)
  })

  it('is a no-op for unknown alertId', () => {
    snoozeAlert('c:3', 60_000, 1_000_000)
    unsnoozeAlert('nonexistent:0')
    const loaded = loadSnoozes()
    expect(loaded.has('c:3')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// snoozeRemainingLabel
// ---------------------------------------------------------------------------

describe('snoozeRemainingLabel', () => {
  it('renders minutes when < 60m remaining', () => {
    const now = 1_000_000
    const entry: SnoozeEntry = {
      alertId: 'x:1',
      snoozedAt: now,
      snoozedUntil: now + 47 * 60 * 1000,
      duration: 47 * 60 * 1000,
    }
    expect(snoozeRemainingLabel(entry, now)).toBe('47m 後自動恢復')
  })

  it('renders hours when >= 60m remaining', () => {
    const now = 1_000_000
    const entry: SnoozeEntry = {
      alertId: 'x:1',
      snoozedAt: now,
      snoozedUntil: now + 3 * 60 * 60 * 1000,
      duration: 3 * 60 * 60 * 1000,
    }
    expect(snoozeRemainingLabel(entry, now)).toBe('3h 後自動恢復')
  })
})

// ---------------------------------------------------------------------------
// durationLabel
// ---------------------------------------------------------------------------

describe('durationLabel', () => {
  it('returns the label for known SNOOZE_DURATIONS', () => {
    for (const d of SNOOZE_DURATIONS) {
      expect(durationLabel(d.ms)).toBe(d.label)
    }
  })

  it('returns fallback label for unknown duration', () => {
    expect(durationLabel(90 * 60 * 1000)).toBe('90m')
  })
})

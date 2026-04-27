import { describe, it, expect } from 'vitest'
import { buildAlertsJson } from '../alertsJsonExport'
import type { AlertsBackup, AlertsJsonInput } from '../alertsJsonExport'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const alert1 = {
  id: 'cpu_high:1745712000000',
  rule: 'cpu_high',
  message: 'CPU usage exceeded 90%',
  severity: 'critical',
  ts: new Date(2026, 3, 26, 10, 0, 0).getTime(),
}

const alert2 = {
  id: 'mem_warn:1745715600000',
  rule: 'mem_warn',
  message: 'Memory usage at 80%',
  severity: 'warning',
  ts: new Date(2026, 3, 26, 11, 0, 0).getTime(),
}

function makeInput(overrides: Partial<AlertsJsonInput> = {}): AlertsJsonInput {
  return {
    alerts: [],
    snoozedIds: [],
    snoozes: new Map(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// filename
// ---------------------------------------------------------------------------

describe('buildAlertsJson — filename', () => {
  it('filename matches alerts-YYYY-MM-DD-HHmm.json pattern', () => {
    const now = new Date(2026, 3, 26, 10, 5) // 2026-04-26 10:05
    const { filename } = buildAlertsJson(makeInput(), now)
    expect(filename).toMatch(/^alerts-\d{4}-\d{2}-\d{2}-\d{4}\.json$/)
  })

  it('filename encodes injectable now date correctly', () => {
    const now = new Date(2026, 3, 26, 10, 5)
    const { filename } = buildAlertsJson(makeInput(), now)
    expect(filename).toBe('alerts-2026-04-26-1005.json')
  })

  it('filename zero-pads month, day, hour, and minute', () => {
    const now = new Date(2024, 0, 7, 8, 3) // 2024-01-07 08:03
    const { filename } = buildAlertsJson(makeInput(), now)
    expect(filename).toBe('alerts-2024-01-07-0803.json')
  })

  it('filename uses the injectable now date', () => {
    const { filename } = buildAlertsJson(makeInput(), new Date(2024, 11, 1, 14, 30)) // 2024-12-01 14:30
    expect(filename).toBe('alerts-2024-12-01-1430.json')
  })
})

// ---------------------------------------------------------------------------
// version and exportedAt
// ---------------------------------------------------------------------------

describe('buildAlertsJson — version and exportedAt', () => {
  it('content includes version "1"', () => {
    const { content } = buildAlertsJson(makeInput())
    const parsed = JSON.parse(content) as AlertsBackup
    expect(parsed.version).toBe('1')
  })

  it('content includes exportedAt as a number matching now.getTime()', () => {
    const now = new Date(2026, 3, 26, 10, 5)
    const { content } = buildAlertsJson(makeInput(), now)
    const parsed = JSON.parse(content) as AlertsBackup
    expect(typeof parsed.exportedAt).toBe('number')
    expect(parsed.exportedAt).toBe(now.getTime())
  })
})

// ---------------------------------------------------------------------------
// alerts
// ---------------------------------------------------------------------------

describe('buildAlertsJson — alerts', () => {
  it('content preserves alerts array', () => {
    const { content } = buildAlertsJson(makeInput({ alerts: [alert1, alert2] }))
    const parsed = JSON.parse(content) as AlertsBackup
    expect(parsed.alerts).toHaveLength(2)
    expect((parsed.alerts[0] as typeof alert1).id).toBe('cpu_high:1745712000000')
    expect((parsed.alerts[1] as typeof alert2).id).toBe('mem_warn:1745715600000')
  })

  it('empty alerts array produces valid JSON with empty alerts array', () => {
    const { content } = buildAlertsJson(makeInput())
    const parsed = JSON.parse(content) as AlertsBackup
    expect(parsed.alerts).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// snoozedIds
// ---------------------------------------------------------------------------

describe('buildAlertsJson — snoozedIds', () => {
  it('content preserves snoozedIds array', () => {
    const { content } = buildAlertsJson(
      makeInput({ snoozedIds: ['cpu_high:1745712000000', 'mem_warn:1745715600000'] }),
    )
    const parsed = JSON.parse(content) as AlertsBackup
    expect(parsed.snoozedIds).toEqual([
      'cpu_high:1745712000000',
      'mem_warn:1745715600000',
    ])
  })

  it('empty snoozedIds produces empty array in output', () => {
    const { content } = buildAlertsJson(makeInput())
    const parsed = JSON.parse(content) as AlertsBackup
    expect(parsed.snoozedIds).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// snoozes Map → object
// ---------------------------------------------------------------------------

describe('buildAlertsJson — snoozes serialization', () => {
  it('snoozes Map is serialized to a plain object', () => {
    const snoozes = new Map<string, unknown>([
      ['cpu_high:1745712000000', { until: 1745712600000, reason: 'Maintenance' }],
      ['mem_warn:1745715600000', { until: 1745716200000 }],
    ])
    const { content } = buildAlertsJson(makeInput({ snoozes }))
    const parsed = JSON.parse(content) as AlertsBackup
    expect(typeof parsed.snoozes).toBe('object')
    expect(Array.isArray(parsed.snoozes)).toBe(false)
    expect(parsed.snoozes['cpu_high:1745712000000']).toEqual({
      until: 1745712600000,
      reason: 'Maintenance',
    })
    expect(parsed.snoozes['mem_warn:1745715600000']).toEqual({ until: 1745716200000 })
  })

  it('snoozes plain object is preserved in output', () => {
    const snoozes: Record<string, unknown> = {
      'cpu_high:1745712000000': { until: 1745712600000 },
    }
    const { content } = buildAlertsJson(makeInput({ snoozes }))
    const parsed = JSON.parse(content) as AlertsBackup
    expect(parsed.snoozes['cpu_high:1745712000000']).toEqual({ until: 1745712600000 })
  })

  it('empty snoozes Map serializes to empty object', () => {
    const { content } = buildAlertsJson(makeInput())
    const parsed = JSON.parse(content) as AlertsBackup
    expect(parsed.snoozes).toEqual({})
  })

  it('empty snoozes plain object serializes to empty object', () => {
    const { content } = buildAlertsJson(makeInput({ snoozes: {} }))
    const parsed = JSON.parse(content) as AlertsBackup
    expect(parsed.snoozes).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// all fields present
// ---------------------------------------------------------------------------

describe('buildAlertsJson — all fields present', () => {
  it('content includes all required top-level fields', () => {
    const { content } = buildAlertsJson(
      makeInput({
        alerts: [alert1],
        snoozedIds: ['cpu_high:1745712000000'],
        snoozes: new Map([['cpu_high:1745712000000', { until: 1745712600000 }]]),
      }),
      new Date(2026, 3, 26, 10, 5),
    )
    const parsed = JSON.parse(content) as AlertsBackup
    expect(parsed.version).toBe('1')
    expect(typeof parsed.exportedAt).toBe('number')
    expect(Array.isArray(parsed.alerts)).toBe(true)
    expect(Array.isArray(parsed.snoozedIds)).toBe(true)
    expect(typeof parsed.snoozes).toBe('object')
    expect(Array.isArray(parsed.snoozes)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// JSON round-trip
// ---------------------------------------------------------------------------

describe('buildAlertsJson — round-trip', () => {
  it('JSON round-trips via JSON.parse → matches original data', () => {
    const now = new Date(2026, 3, 26, 10, 5)
    const input = makeInput({
      alerts: [alert1, alert2],
      snoozedIds: ['cpu_high:1745712000000'],
      snoozes: new Map<string, unknown>([
        ['cpu_high:1745712000000', { until: 1745712600000 }],
      ]),
    })
    const { content } = buildAlertsJson(input, now)
    const parsed = JSON.parse(content) as AlertsBackup
    expect(parsed.version).toBe('1')
    expect(parsed.exportedAt).toBe(now.getTime())
    expect(parsed.alerts).toHaveLength(2)
    expect(parsed.snoozedIds).toEqual(['cpu_high:1745712000000'])
    expect(parsed.snoozes['cpu_high:1745712000000']).toEqual({ until: 1745712600000 })
  })

  it('does not mutate the input collections', () => {
    const alerts = [alert1, alert2]
    const snoozedIds = ['cpu_high:1745712000000']
    buildAlertsJson(makeInput({ alerts, snoozedIds }))
    expect(alerts).toHaveLength(2)
    expect(snoozedIds).toHaveLength(1)
  })

  it('content is valid JSON parseable by JSON.parse', () => {
    const { content } = buildAlertsJson(
      makeInput({ alerts: [alert1], snoozedIds: [], snoozes: new Map() }),
    )
    expect(() => JSON.parse(content)).not.toThrow()
  })
})

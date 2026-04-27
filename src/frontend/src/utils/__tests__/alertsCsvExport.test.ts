import { describe, it, expect } from 'vitest'
import { buildAlertsCsv } from '../alertsCsvExport'
import type { AlertForCsv } from '../alertsCsvExport'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const a1: AlertForCsv = {
  id: 'cpu_high:1745712000000',
  rule: 'cpu_high',
  message: 'CPU usage exceeded 90%',
  level: 'critical',
  firstSeen: new Date(2026, 3, 26, 10, 0, 0).getTime(),
  lastSeen: new Date(2026, 3, 26, 10, 5, 0).getTime(),
}

const a2: AlertForCsv = {
  id: 'mem_warn:1745715600000',
  rule: 'mem_warn',
  message: 'Memory usage at 80%',
  level: 'warning',
  firstSeen: '2026-04-26T11:00:00.000Z',
  lastSeen: '2026-04-26T11:30:00.000Z',
}

// Alert with only ts — no firstSeen/lastSeen
const a3: AlertForCsv = {
  id: 'cost_today_high:1745719200000',
  rule: 'cost_today_high',
  message: 'Daily cost exceeded $10',
  level: 'warning',
  ts: new Date(2026, 3, 26, 12, 0, 0).getTime(),
}

// Alert with special characters
const a4: AlertForCsv = {
  id: 'special:1745722800000',
  rule: 'rule,with,commas',
  message: 'She said "alert triggered" again',
  level: 'critical',
  firstSeen: new Date(2026, 3, 26, 13, 0, 0).getTime(),
  lastSeen: new Date(2026, 3, 26, 13, 1, 0).getTime(),
}

// Alert with no optional fields
const a5: AlertForCsv = {
  id: 'bare-alert',
}

// ---------------------------------------------------------------------------
// header row
// ---------------------------------------------------------------------------

describe('buildAlertsCsv — header', () => {
  it('header row matches "rule,message,level,firstSeen,lastSeen,snoozed"', () => {
    const { content } = buildAlertsCsv([], [], new Date(2026, 3, 26, 10, 5))
    const firstLine = content.split('\n')[0]
    expect(firstLine).toBe('rule,message,level,firstSeen,lastSeen,snoozed')
  })

  it('empty alerts array produces only header + trailing newline', () => {
    const { content } = buildAlertsCsv([], [], new Date(2026, 3, 26, 10, 5))
    expect(content).toBe('rule,message,level,firstSeen,lastSeen,snoozed\n')
  })
})

// ---------------------------------------------------------------------------
// filename
// ---------------------------------------------------------------------------

describe('buildAlertsCsv — filename', () => {
  it('filename pattern matches alerts-YYYY-MM-DD-HHmm.csv', () => {
    const { filename } = buildAlertsCsv([], [], new Date(2026, 3, 26, 10, 5))
    expect(filename).toMatch(/^alerts-\d{4}-\d{2}-\d{2}-\d{4}\.csv$/)
  })

  it('filename encodes injectable now date correctly', () => {
    const { filename } = buildAlertsCsv([], [], new Date(2026, 3, 26, 10, 5))
    expect(filename).toBe('alerts-2026-04-26-1005.csv')
  })

  it('filename pads month, day, hour, minute with leading zeros', () => {
    const { filename } = buildAlertsCsv([], [], new Date(2024, 0, 7, 8, 3)) // 2024-01-07 08:03
    expect(filename).toBe('alerts-2024-01-07-0803.csv')
  })
})

// ---------------------------------------------------------------------------
// rows
// ---------------------------------------------------------------------------

describe('buildAlertsCsv — rows', () => {
  it('produces one data row per alert', () => {
    const { content } = buildAlertsCsv([a1, a2], [], new Date(2026, 3, 26, 10, 5))
    const lines = content.trimEnd().split('\n')
    expect(lines.length).toBe(3) // header + 2 data rows
  })

  it('simple alert row has correct column values', () => {
    const { content } = buildAlertsCsv([a1], [], new Date(2026, 3, 26, 10, 5))
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toBe('cpu_high,CPU usage exceeded 90%,critical,2026-04-26 10:00:00,2026-04-26 10:05:00,false')
  })
})

// ---------------------------------------------------------------------------
// snoozed column
// ---------------------------------------------------------------------------

describe('buildAlertsCsv — snoozed column', () => {
  it('snoozed column is "true" for snoozed alerts', () => {
    const { content } = buildAlertsCsv([a1], [a1.id], new Date(2026, 3, 26, 10, 5))
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toMatch(/,true$/)
  })

  it('snoozed column is "false" for non-snoozed alerts', () => {
    const { content } = buildAlertsCsv([a1], [], new Date(2026, 3, 26, 10, 5))
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toMatch(/,false$/)
  })

  it('mixed: snoozed alert shows true, non-snoozed shows false', () => {
    const { content } = buildAlertsCsv([a1, a2], [a1.id], new Date(2026, 3, 26, 10, 5))
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toMatch(/,true$/)
    expect(lines[2]).toMatch(/,false$/)
  })
})

// ---------------------------------------------------------------------------
// ts fallback
// ---------------------------------------------------------------------------

describe('buildAlertsCsv — ts fallback', () => {
  it('firstSeen falls back to ts when firstSeen is absent', () => {
    const { content } = buildAlertsCsv([a3], [], new Date(2026, 3, 26, 10, 5))
    const lines = content.trimEnd().split('\n')
    // firstSeen column (index 3) should be formatted from ts
    const cols = lines[1].split(',')
    expect(cols[3]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('lastSeen falls back to ts when lastSeen is absent', () => {
    const { content } = buildAlertsCsv([a3], [], new Date(2026, 3, 26, 10, 5))
    const lines = content.trimEnd().split('\n')
    // lastSeen column (index 4) should be formatted from ts
    const cols = lines[1].split(',')
    expect(cols[4]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('firstSeen and lastSeen are the same when only ts is present', () => {
    const { content } = buildAlertsCsv([a3], [], new Date(2026, 3, 26, 10, 5))
    const lines = content.trimEnd().split('\n')
    const cols = lines[1].split(',')
    expect(cols[3]).toBe(cols[4])
  })
})

// ---------------------------------------------------------------------------
// missing optional fields
// ---------------------------------------------------------------------------

describe('buildAlertsCsv — missing optional fields', () => {
  it('missing rule exports empty string in rule column', () => {
    const { content } = buildAlertsCsv([a5], [], new Date(2026, 3, 26, 10, 5))
    const lines = content.trimEnd().split('\n')
    // row: ,,,,, (all empty)
    expect(lines[1]).toBe(',,,,,false')
  })

  it('missing message exports empty string', () => {
    const alert: AlertForCsv = { id: 'x', rule: 'my_rule' }
    const { content } = buildAlertsCsv([alert], [], new Date(2026, 3, 26, 10, 5))
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toMatch(/^my_rule,,,/)
  })

  it('missing level exports empty string', () => {
    const alert: AlertForCsv = { id: 'x', rule: 'r', message: 'm' }
    const { content } = buildAlertsCsv([alert], [], new Date(2026, 3, 26, 10, 5))
    const lines = content.trimEnd().split('\n')
    const cols = lines[1].split(',')
    expect(cols[2]).toBe('')
  })

  it('null ts and null firstSeen/lastSeen export as empty strings', () => {
    const alert: AlertForCsv = { id: 'x', rule: 'r', ts: null, firstSeen: null, lastSeen: null }
    const { content } = buildAlertsCsv([alert], [], new Date(2026, 3, 26, 10, 5))
    const lines = content.trimEnd().split('\n')
    const cols = lines[1].split(',')
    expect(cols[3]).toBe('')
    expect(cols[4]).toBe('')
  })
})

// ---------------------------------------------------------------------------
// RFC-4180 escaping
// ---------------------------------------------------------------------------

describe('buildAlertsCsv — RFC-4180 escaping', () => {
  it('rule containing comma is wrapped in double-quotes', () => {
    const { content } = buildAlertsCsv([a4], [], new Date(2026, 3, 26, 10, 5))
    expect(content).toContain('"rule,with,commas"')
  })

  it('message containing double-quotes doubles them and wraps', () => {
    const { content } = buildAlertsCsv([a4], [], new Date(2026, 3, 26, 10, 5))
    expect(content).toContain('"She said ""alert triggered"" again"')
  })

  it('id containing special characters — snoozed lookup still works', () => {
    const alert: AlertForCsv = { id: 'id-with,"quotes', rule: 'r', message: 'msg', level: 'warning' }
    const { content } = buildAlertsCsv([alert], ['id-with,"quotes'], new Date(2026, 3, 26, 10, 5))
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toMatch(/,true$/)
  })
})

// ---------------------------------------------------------------------------
// timestamp formats
// ---------------------------------------------------------------------------

describe('buildAlertsCsv — timestamp formats', () => {
  it('numeric timestamp is formatted as YYYY-MM-DD HH:mm:ss', () => {
    const { content } = buildAlertsCsv([a1], [], new Date(2026, 3, 26, 10, 5))
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toContain('2026-04-26 10:00:00')
  })

  it('ISO string timestamp is formatted correctly (non-empty)', () => {
    const { content } = buildAlertsCsv([a2], [], new Date(2026, 3, 26, 10, 5))
    const lines = content.trimEnd().split('\n')
    // exact value depends on local TZ, but must be formatted (not raw ISO string)
    expect(lines[1]).not.toContain('2026-04-26T11:00:00.000Z')
    expect(lines[1]).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)
  })

  it('invalid timestamp string exports as empty string', () => {
    const alert: AlertForCsv = { id: 'x', firstSeen: 'not-a-date', lastSeen: 'nope' }
    const { content } = buildAlertsCsv([alert], [], new Date(2026, 3, 26, 10, 5))
    const lines = content.trimEnd().split('\n')
    const cols = lines[1].split(',')
    expect(cols[3]).toBe('')
    expect(cols[4]).toBe('')
  })
})

// ---------------------------------------------------------------------------
// trailing newline
// ---------------------------------------------------------------------------

describe('buildAlertsCsv — trailing newline', () => {
  it('content ends with a trailing newline for non-empty alerts', () => {
    const { content } = buildAlertsCsv([a1], [], new Date(2026, 3, 26, 10, 5))
    expect(content.endsWith('\n')).toBe(true)
  })

  it('empty export also ends with a trailing newline', () => {
    const { content } = buildAlertsCsv([], [], new Date(2026, 3, 26, 10, 5))
    expect(content.endsWith('\n')).toBe(true)
  })
})

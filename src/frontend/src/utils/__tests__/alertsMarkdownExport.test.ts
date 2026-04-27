import { describe, it, expect } from 'vitest'
import { buildAlertsMarkdown } from '../alertsMarkdownExport'
import type { AlertForMd } from '../alertsMarkdownExport'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const alert1: AlertForMd = {
  id: 'cpu_high:1745712000000',
  rule: 'cpu_high',
  message: 'CPU usage exceeded 90%',
  level: 'critical',
  ts: new Date(2026, 3, 26, 10, 0, 0).getTime(),
}

const alert2: AlertForMd = {
  id: 'mem_warn:1745715600000',
  rule: 'mem_warn',
  message: 'Memory usage at 80%',
  level: 'warning',
  firstSeen: new Date(2026, 3, 26, 9, 0, 0).getTime(),
  lastSeen: new Date(2026, 3, 26, 11, 0, 0).getTime(),
}

const alert3: AlertForMd = {
  id: 'info_event:1745719200000',
  rule: 'info_event',
  message: 'Scheduled maintenance',
  level: 'info',
  ts: new Date(2026, 3, 26, 12, 0, 0).getTime(),
}

// ---------------------------------------------------------------------------
// filename
// ---------------------------------------------------------------------------

describe('buildAlertsMarkdown — filename', () => {
  it('filename matches alerts-YYYY-MM-DD-HHmm.md pattern', () => {
    const now = new Date(2026, 3, 26, 10, 5) // 2026-04-26 10:05
    const { filename } = buildAlertsMarkdown([], [], now)
    expect(filename).toMatch(/^alerts-\d{4}-\d{2}-\d{2}-\d{4}\.md$/)
  })

  it('filename encodes injectable now date correctly', () => {
    const now = new Date(2026, 3, 26, 10, 5)
    const { filename } = buildAlertsMarkdown([], [], now)
    expect(filename).toBe('alerts-2026-04-26-1005.md')
  })

  it('filename zero-pads month, day, hour, and minute', () => {
    const now = new Date(2024, 0, 7, 8, 3) // 2024-01-07 08:03
    const { filename } = buildAlertsMarkdown([], [], now)
    expect(filename).toBe('alerts-2024-01-07-0803.md')
  })

  it('filename uses the injectable now date', () => {
    const { filename } = buildAlertsMarkdown([], [], new Date(2024, 11, 1, 14, 30))
    expect(filename).toBe('alerts-2024-12-01-1430.md')
  })
})

// ---------------------------------------------------------------------------
// header — export time and counts
// ---------------------------------------------------------------------------

describe('buildAlertsMarkdown — header', () => {
  it('content includes export timestamp in header', () => {
    const now = new Date(2026, 3, 26, 10, 5, 0) // 2026-04-26 10:05:00
    const { content } = buildAlertsMarkdown([], [], now)
    expect(content).toContain('**匯出時間:**')
    expect(content).toContain('2026-04-26 10:05:00')
  })

  it('content includes total and snoozed count in header', () => {
    const now = new Date(2026, 3, 26, 10, 0)
    const { content } = buildAlertsMarkdown([alert1, alert2], [alert1.id], now)
    expect(content).toContain('**總數:** 2 alerts (1 snoozed)')
  })

  it('header shows 0 snoozed when no snoozed ids', () => {
    const { content } = buildAlertsMarkdown([alert1], [], new Date())
    expect(content).toContain('alerts (0 snoozed)')
  })

  it('content starts with # Alerts Export heading', () => {
    const { content } = buildAlertsMarkdown([], [], new Date())
    expect(content).toMatch(/^# Alerts Export/)
  })
})

// ---------------------------------------------------------------------------
// empty alerts
// ---------------------------------------------------------------------------

describe('buildAlertsMarkdown — empty alerts', () => {
  it('returns _無 alerts_ placeholder when alerts array is empty', () => {
    const { content } = buildAlertsMarkdown([], [], new Date())
    expect(content).toContain('_無 alerts_')
  })

  it('empty alerts still includes header section', () => {
    const { content } = buildAlertsMarkdown([], [], new Date())
    expect(content).toContain('# Alerts Export')
    expect(content).toContain('**匯出時間:**')
  })

  it('empty alerts filename still follows pattern', () => {
    const { filename } = buildAlertsMarkdown([], [], new Date(2026, 3, 26, 10, 0))
    expect(filename).toBe('alerts-2026-04-26-1000.md')
  })
})

// ---------------------------------------------------------------------------
// snoozed markers
// ---------------------------------------------------------------------------

describe('buildAlertsMarkdown — snoozed markers', () => {
  it('snoozed alert heading has ☕ prefix', () => {
    const { content } = buildAlertsMarkdown([alert1], [alert1.id], new Date())
    expect(content).toContain(`## 🔴 ☕ cpu_high`)
  })

  it('non-snoozed alert heading has no ☕ prefix', () => {
    const { content } = buildAlertsMarkdown([alert1], [], new Date())
    expect(content).not.toContain('☕')
    expect(content).toContain('## 🔴 cpu_high')
  })

  it('snoozed alert has "Snoozed: yes" field', () => {
    const { content } = buildAlertsMarkdown([alert1], [alert1.id], new Date())
    expect(content).toContain('- **Snoozed:** yes')
  })

  it('non-snoozed alert does not have Snoozed field', () => {
    const { content } = buildAlertsMarkdown([alert1], [], new Date())
    expect(content).not.toContain('Snoozed:')
  })

  it('only the snoozed alert is marked when mixed', () => {
    const { content } = buildAlertsMarkdown([alert1, alert2], [alert1.id], new Date())
    // alert1 snoozed
    expect(content).toContain(`☕ cpu_high`)
    // alert2 not snoozed — heading has no ☕
    const alert2HeadingIdx = content.indexOf('## ⚠️ mem_warn')
    expect(alert2HeadingIdx).toBeGreaterThan(-1)
    // ensure alert2 heading doesn't have ☕
    const alert2Line = content.slice(alert2HeadingIdx, content.indexOf('\n', alert2HeadingIdx))
    expect(alert2Line).not.toContain('☕')
  })
})

// ---------------------------------------------------------------------------
// level emoji
// ---------------------------------------------------------------------------

describe('buildAlertsMarkdown — level emoji', () => {
  it('critical level gets 🔴 emoji', () => {
    const { content } = buildAlertsMarkdown([alert1], [], new Date())
    expect(content).toContain('## 🔴 cpu_high')
  })

  it('warning level gets ⚠️ emoji', () => {
    const { content } = buildAlertsMarkdown([alert2], [], new Date())
    expect(content).toContain('## ⚠️ mem_warn')
  })

  it('info level gets ℹ️ emoji', () => {
    const { content } = buildAlertsMarkdown([alert3], [], new Date())
    expect(content).toContain('## ℹ️ info_event')
  })

  it('error level gets 🔴 emoji', () => {
    const errorAlert: AlertForMd = { id: 'e1', rule: 'err_rule', level: 'error' }
    const { content } = buildAlertsMarkdown([errorAlert], [], new Date())
    expect(content).toContain('## 🔴 err_rule')
  })

  it('warn (short form) level gets ⚠️ emoji', () => {
    const warnAlert: AlertForMd = { id: 'w1', rule: 'warn_rule', level: 'warn' }
    const { content } = buildAlertsMarkdown([warnAlert], [], new Date())
    expect(content).toContain('## ⚠️ warn_rule')
  })

  it('unknown level gets · fallback emoji', () => {
    const unknownAlert: AlertForMd = { id: 'u1', rule: 'unknown_rule', level: 'trace' }
    const { content } = buildAlertsMarkdown([unknownAlert], [], new Date())
    expect(content).toContain('## · unknown_rule')
  })

  it('null level gets · fallback emoji', () => {
    const nullLevelAlert: AlertForMd = { id: 'n1', rule: 'no_level_rule', level: null }
    const { content } = buildAlertsMarkdown([nullLevelAlert], [], new Date())
    expect(content).toContain('## · no_level_rule')
  })

  it('level is case-insensitive (CRITICAL → 🔴)', () => {
    const upperAlert: AlertForMd = { id: 'c1', rule: 'upper_rule', level: 'CRITICAL' }
    const { content } = buildAlertsMarkdown([upperAlert], [], new Date())
    expect(content).toContain('## 🔴 upper_rule')
  })
})

// ---------------------------------------------------------------------------
// alert fields
// ---------------------------------------------------------------------------

describe('buildAlertsMarkdown — alert fields', () => {
  it('includes message when present', () => {
    const { content } = buildAlertsMarkdown([alert1], [], new Date())
    expect(content).toContain('- **Message:** CPU usage exceeded 90%')
  })

  it('includes level when present', () => {
    const { content } = buildAlertsMarkdown([alert1], [], new Date())
    expect(content).toContain('- **Level:** critical')
  })

  it('includes ts as first/last seen when firstSeen/lastSeen absent', () => {
    const { content } = buildAlertsMarkdown([alert1], [], new Date())
    expect(content).toContain('- **First seen:**')
    expect(content).toContain('- **Last seen:**')
  })

  it('uses firstSeen and lastSeen over ts when both present', () => {
    const { content } = buildAlertsMarkdown([alert2], [], new Date())
    // firstSeen = 09:00, lastSeen = 11:00
    expect(content).toContain('- **First seen:** 2026-04-26 09:00:00')
    expect(content).toContain('- **Last seen:** 2026-04-26 11:00:00')
  })

  it('omits message field when message is null/undefined', () => {
    const noMsgAlert: AlertForMd = { id: 'nm1', rule: 'no_msg', level: 'info' }
    const { content } = buildAlertsMarkdown([noMsgAlert], [], new Date())
    expect(content).not.toContain('**Message:**')
  })

  it('omits level field when level is null/undefined', () => {
    const noLvlAlert: AlertForMd = { id: 'nl1', rule: 'no_lvl' }
    const { content } = buildAlertsMarkdown([noLvlAlert], [], new Date())
    expect(content).not.toContain('**Level:**')
  })

  it('omits timestamps when all time fields are null/undefined', () => {
    const noTimeAlert: AlertForMd = { id: 'nt1', rule: 'no_time', level: 'info' }
    const { content } = buildAlertsMarkdown([noTimeAlert], [], new Date())
    expect(content).not.toContain('**First seen:**')
    expect(content).not.toContain('**Last seen:**')
  })

  it('rule falls back to id when rule is missing', () => {
    const noRuleAlert: AlertForMd = { id: 'fallback-id-123', level: 'info' }
    const { content } = buildAlertsMarkdown([noRuleAlert], [], new Date())
    expect(content).toContain('fallback-id-123')
  })
})

// ---------------------------------------------------------------------------
// multiple alerts structure
// ---------------------------------------------------------------------------

describe('buildAlertsMarkdown — multiple alerts', () => {
  it('each alert renders as a separate H2 section', () => {
    const { content } = buildAlertsMarkdown([alert1, alert2, alert3], [], new Date())
    const h2Matches = content.match(/^## /gm)
    expect(h2Matches).toHaveLength(3)
  })

  it('sections are separated by --- dividers', () => {
    const { content } = buildAlertsMarkdown([alert1, alert2], [], new Date())
    const dividers = content.match(/^---$/gm)
    // One after header, one after each alert section
    expect(dividers).toBeTruthy()
    expect(dividers!.length).toBeGreaterThanOrEqual(3)
  })

  it('content ends with newline', () => {
    const { content } = buildAlertsMarkdown([alert1], [], new Date())
    expect(content.endsWith('\n')).toBe(true)
  })

  it('content ends with newline for empty alerts', () => {
    const { content } = buildAlertsMarkdown([], [], new Date())
    expect(content.endsWith('\n')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// immutability
// ---------------------------------------------------------------------------

describe('buildAlertsMarkdown — immutability', () => {
  it('does not mutate input alerts array', () => {
    const alerts: AlertForMd[] = [alert1, alert2]
    buildAlertsMarkdown(alerts, [alert1.id], new Date())
    expect(alerts).toHaveLength(2)
  })

  it('does not mutate input snoozedIds array', () => {
    const snoozedIds = [alert1.id]
    buildAlertsMarkdown([alert1], snoozedIds, new Date())
    expect(snoozedIds).toHaveLength(1)
  })
})

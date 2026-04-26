import { describe, it, expect } from 'vitest'
import { buildLogsJson } from '../logsJsonExport'
import type { LogEntry, LogsExportFilter } from '../logsJsonExport'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const e1: LogEntry = { ts: 1_000_000, level: 'info', message: 'Agent started' }
const e2: LogEntry = { ts: 2_000_000, level: 'error', message: 'Connection failed' }
const e3: LogEntry = { ts: 3_000_000, level: 'warn', agent: 'claude-1', message: 'Rate limit' }

// ---------------------------------------------------------------------------
// filename
// ---------------------------------------------------------------------------

describe('buildLogsJson — filename', () => {
  it('matches pattern logs-YYYY-MM-DD-HHmm.json', () => {
    const now = new Date(2026, 3, 26, 14, 5) // 2026-04-26 14:05
    const { filename } = buildLogsJson({ entries: [], filter: {} }, now)
    expect(filename).toMatch(/^logs-\d{4}-\d{2}-\d{2}-\d{4}\.json$/)
  })

  it('includes correct date/time slug', () => {
    const now = new Date(2026, 3, 26, 14, 5) // 2026-04-26 14:05
    const { filename } = buildLogsJson({ entries: [], filter: {} }, now)
    expect(filename).toBe('logs-2026-04-26-1405.json')
  })

  it('zero-pads month, day, hour, and minute', () => {
    const now = new Date(2026, 0, 5, 8, 3) // 2026-01-05 08:03
    const { filename } = buildLogsJson({ entries: [], filter: {} }, now)
    expect(filename).toBe('logs-2026-01-05-0803.json')
  })
})

// ---------------------------------------------------------------------------
// exportedAt
// ---------------------------------------------------------------------------

describe('buildLogsJson — exportedAt', () => {
  it('content includes exportedAt as numeric epoch ms', () => {
    const now = new Date(2026, 3, 26, 14, 5)
    const { content } = buildLogsJson({ entries: [], filter: {} }, now)
    const parsed = JSON.parse(content) as { exportedAt: unknown }
    expect(typeof parsed.exportedAt).toBe('number')
    expect(parsed.exportedAt).toBe(now.getTime())
  })
})

// ---------------------------------------------------------------------------
// filter
// ---------------------------------------------------------------------------

describe('buildLogsJson — filter', () => {
  it('content includes a filter object', () => {
    const { content } = buildLogsJson({ entries: [], filter: { query: 'error' } })
    const parsed = JSON.parse(content) as { filter: unknown }
    expect(parsed.filter).toBeDefined()
    expect(typeof parsed.filter).toBe('object')
  })

  it('includes query when set', () => {
    const filter: LogsExportFilter = { query: 'timeout' }
    const { content } = buildLogsJson({ entries: [], filter })
    const parsed = JSON.parse(content) as { filter: Record<string, unknown> }
    expect(parsed.filter.query).toBe('timeout')
  })

  it('includes level when set', () => {
    const filter: LogsExportFilter = { level: 'error' }
    const { content } = buildLogsJson({ entries: [], filter })
    const parsed = JSON.parse(content) as { filter: Record<string, unknown> }
    expect(parsed.filter.level).toBe('error')
  })

  it('includes agentId when set', () => {
    const filter: LogsExportFilter = { agentId: 'claude-1' }
    const { content } = buildLogsJson({ entries: [], filter })
    const parsed = JSON.parse(content) as { filter: Record<string, unknown> }
    expect(parsed.filter.agentId).toBe('claude-1')
  })

  it('includes regex:true when set', () => {
    const filter: LogsExportFilter = { regex: true }
    const { content } = buildLogsJson({ entries: [], filter })
    const parsed = JSON.parse(content) as { filter: Record<string, unknown> }
    expect(parsed.filter.regex).toBe(true)
  })

  it('produces empty filter object when all filter fields are undefined', () => {
    const filter: LogsExportFilter = {}
    const { content } = buildLogsJson({ entries: [], filter })
    const parsed = JSON.parse(content) as { filter: Record<string, unknown> }
    expect(Object.keys(parsed.filter)).toHaveLength(0)
  })

  it('does not include undefined filter fields', () => {
    const filter: LogsExportFilter = { query: 'warn', level: undefined }
    const { content } = buildLogsJson({ entries: [e1], filter })
    const parsed = JSON.parse(content) as { filter: Record<string, unknown> }
    expect(Object.prototype.hasOwnProperty.call(parsed.filter, 'level')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(parsed.filter, 'query')).toBe(true)
  })

  it('does not include regex when false', () => {
    const filter: LogsExportFilter = { regex: false }
    const { content } = buildLogsJson({ entries: [], filter })
    const parsed = JSON.parse(content) as { filter: Record<string, unknown> }
    expect(Object.prototype.hasOwnProperty.call(parsed.filter, 'regex')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// entries
// ---------------------------------------------------------------------------

describe('buildLogsJson — entries', () => {
  it('content includes an entries array', () => {
    const { content } = buildLogsJson({ entries: [e1, e2], filter: {} })
    const parsed = JSON.parse(content) as { entries: unknown }
    expect(Array.isArray(parsed.entries)).toBe(true)
  })

  it('preserves all supplied entries', () => {
    const { content } = buildLogsJson({ entries: [e1, e2, e3], filter: {} })
    const parsed = JSON.parse(content) as { entries: LogEntry[] }
    expect(parsed.entries).toHaveLength(3)
    expect(parsed.entries[0]?.message).toBe('Agent started')
    expect(parsed.entries[1]?.message).toBe('Connection failed')
    expect(parsed.entries[2]?.message).toBe('Rate limit')
  })

  it('preserves entry fields including ts, level, message, and optional agent', () => {
    const { content } = buildLogsJson({ entries: [e3], filter: {} })
    const parsed = JSON.parse(content) as { entries: LogEntry[] }
    const entry = parsed.entries[0]
    expect(entry?.ts).toBe(3_000_000)
    expect(entry?.level).toBe('warn')
    expect(entry?.agent).toBe('claude-1')
    expect(entry?.message).toBe('Rate limit')
  })

  it('produces entries: [] for empty input — still valid JSON', () => {
    const { content } = buildLogsJson({ entries: [], filter: {} })
    const parsed = JSON.parse(content) as { entries: unknown[] }
    expect(Array.isArray(parsed.entries)).toBe(true)
    expect(parsed.entries).toHaveLength(0)
  })

  it('does not mutate the input entries array', () => {
    const entries: LogEntry[] = [e1, e2]
    buildLogsJson({ entries, filter: {} })
    expect(entries).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// JSON validity
// ---------------------------------------------------------------------------

describe('buildLogsJson — JSON round-trip', () => {
  it('produces valid JSON (round-trip via JSON.parse)', () => {
    const { content } = buildLogsJson({
      entries: [e1, e2, e3],
      filter: { query: 'warn', level: 'warn', regex: true },
    })
    expect(() => JSON.parse(content)).not.toThrow()
  })

  it('top-level keys are exportedAt, filter, entries', () => {
    const { content } = buildLogsJson({ entries: [e1], filter: { query: 'test' } })
    const parsed = JSON.parse(content) as Record<string, unknown>
    expect(Object.keys(parsed).sort()).toEqual(['entries', 'exportedAt', 'filter'])
  })
})

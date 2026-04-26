import { describe, it, expect } from 'vitest'
import { buildLogsCsv } from '../logsCsvExport'
import type { LogEntry } from '../logsJsonExport'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const e1: LogEntry = {
  ts: new Date(2026, 3, 26, 10, 5, 3).getTime(), // 2026-04-26 10:05:03
  level: 'info',
  agent: 'agent-abc',
  message: 'Server started on port 3001',
}

const e2: LogEntry = {
  ts: new Date(2026, 3, 25, 8, 0, 0).getTime(), // 2026-04-25 08:00:00
  level: 'error',
  agent: 'agent-xyz',
  message: 'Connection refused, retrying',
}

const e3: LogEntry = {
  ts: new Date(2026, 3, 24, 14, 30, 0).getTime(), // 2026-04-24 14:30:00
  level: 'warn',
  agent: 'agent-abc',
  message: 'Message with "quotes", and comma',
}

const e4: LogEntry = {
  ts: new Date(2026, 3, 23, 0, 0, 0).getTime(), // 2026-04-23 00:00:00
  level: 'info',
  agent: 'agent-abc',
  message: 'Line one\nLine two',
}

// Entry with optional fields missing
const e5: LogEntry = {
  ts: new Date(2026, 3, 22, 6, 0, 0).getTime(), // 2026-04-22 06:00:00
  message: 'Bare message no level or agent',
}

// ---------------------------------------------------------------------------
// header row
// ---------------------------------------------------------------------------

describe('buildLogsCsv — header', () => {
  it('header row matches "timestamp,level,agent,message"', () => {
    const { content } = buildLogsCsv([], new Date(2026, 3, 26, 10, 30))
    const firstLine = content.split('\n')[0]
    expect(firstLine).toBe('timestamp,level,agent,message')
  })

  it('empty entries array produces only header + trailing newline', () => {
    const { content } = buildLogsCsv([], new Date(2026, 3, 26, 10, 30))
    expect(content).toBe('timestamp,level,agent,message\n')
  })
})

// ---------------------------------------------------------------------------
// filename
// ---------------------------------------------------------------------------

describe('buildLogsCsv — filename', () => {
  it('filename pattern matches logs-YYYY-MM-DD-HHmm.csv', () => {
    const { filename } = buildLogsCsv([], new Date(2026, 3, 26, 10, 30))
    expect(filename).toMatch(/^logs-\d{4}-\d{2}-\d{2}-\d{4}\.csv$/)
  })

  it('filename encodes the injectable now date correctly', () => {
    const { filename } = buildLogsCsv([], new Date(2026, 3, 26, 10, 30))
    expect(filename).toBe('logs-2026-04-26-1030.csv')
  })

  it('filename pads month, day, hour, and minute with leading zero', () => {
    const { filename } = buildLogsCsv([], new Date(2024, 0, 7, 3, 5)) // 2024-01-07 03:05
    expect(filename).toBe('logs-2024-01-07-0305.csv')
  })
})

// ---------------------------------------------------------------------------
// rows
// ---------------------------------------------------------------------------

describe('buildLogsCsv — rows', () => {
  it('produces one data row per entry', () => {
    const { content } = buildLogsCsv([e1, e2], new Date(2026, 3, 26, 10, 30))
    const lines = content.trimEnd().split('\n')
    expect(lines.length).toBe(3) // header + 2 data rows
  })

  it('simple entry row has correct column values', () => {
    const { content } = buildLogsCsv([e1], new Date(2026, 3, 26, 10, 30))
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toBe('2026-04-26 10:05:03,info,agent-abc,Server started on port 3001')
  })
})

// ---------------------------------------------------------------------------
// optional fields
// ---------------------------------------------------------------------------

describe('buildLogsCsv — optional fields', () => {
  it('missing level exports as empty string in level column', () => {
    const { content } = buildLogsCsv([e5], new Date(2026, 3, 26, 10, 30))
    const lines = content.trimEnd().split('\n')
    // timestamp,,<agent>?,message — level column should be empty
    expect(lines[1]).toMatch(/^2026-04-22 06:00:00,,/)
  })

  it('missing agent exports as empty string in agent column', () => {
    const { content } = buildLogsCsv([e5], new Date(2026, 3, 26, 10, 30))
    const lines = content.trimEnd().split('\n')
    // columns: timestamp, level(empty), agent(empty), message
    expect(lines[1]).toBe('2026-04-22 06:00:00,,,Bare message no level or agent')
  })
})

// ---------------------------------------------------------------------------
// RFC-4180 escaping
// ---------------------------------------------------------------------------

describe('buildLogsCsv — RFC-4180 escaping', () => {
  it('wraps message containing double-quotes in double-quotes and doubles them', () => {
    const { content } = buildLogsCsv([e3], new Date(2026, 3, 26, 10, 30))
    expect(content).toContain('"Message with ""quotes"", and comma"')
  })

  it('wraps message containing comma in double-quotes', () => {
    const { content } = buildLogsCsv([e2], new Date(2026, 3, 26, 10, 30))
    // "Connection refused, retrying" contains a comma → must be quoted
    expect(content).toContain('"Connection refused, retrying"')
  })

  it('wraps message containing newline in double-quotes', () => {
    const { content } = buildLogsCsv([e4], new Date(2026, 3, 26, 10, 30))
    expect(content).toContain('"Line one\nLine two"')
  })

  it('agent name containing comma is properly escaped', () => {
    const entry: LogEntry = {
      ts: new Date(2026, 3, 26, 8, 0, 0).getTime(),
      level: 'info',
      agent: 'agent, special',
      message: 'test',
    }
    const { content } = buildLogsCsv([entry], new Date(2026, 3, 26, 10, 30))
    expect(content).toContain('"agent, special"')
  })
})

// ---------------------------------------------------------------------------
// trailing newline
// ---------------------------------------------------------------------------

describe('buildLogsCsv — trailing newline', () => {
  it('content ends with a trailing newline for non-empty entries', () => {
    const { content } = buildLogsCsv([e1], new Date(2026, 3, 26, 10, 30))
    expect(content.endsWith('\n')).toBe(true)
  })

  it('empty export also ends with a trailing newline', () => {
    const { content } = buildLogsCsv([], new Date(2026, 3, 26, 10, 30))
    expect(content.endsWith('\n')).toBe(true)
  })
})

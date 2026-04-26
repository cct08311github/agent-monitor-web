import { describe, it, expect } from 'vitest'
import { csvEscape, buildCaptureCsv } from '../captureCsvExport'
import type { Capture } from '../quickCapture'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const c1: Capture = {
  id: 'qc_1',
  body: 'Hello world',
  context: 'Dashboard',
  createdAt: new Date(2026, 3, 26, 10, 5, 3).getTime(), // 2026-04-26 10:05:03
}

const c2: Capture = {
  id: 'qc_2',
  body: 'Buy milk, eggs #shopping #errand',
  context: 'Home',
  createdAt: new Date(2026, 3, 25, 8, 0, 0).getTime(), // 2026-04-25 08:00:00
}

const c3: Capture = {
  id: 'qc_3',
  body: 'She said "hello" to me',
  context: 'Work',
  createdAt: new Date(2026, 3, 24, 14, 30, 0).getTime(), // 2026-04-24 14:30:00
}

const c4: Capture = {
  id: 'qc_4',
  body: 'Line one\nLine two',
  context: 'Notes',
  createdAt: new Date(2026, 3, 23, 0, 0, 0).getTime(), // 2026-04-23 00:00:00
}

// ---------------------------------------------------------------------------
// csvEscape
// ---------------------------------------------------------------------------

describe('csvEscape', () => {
  it('returns the value unchanged when no special characters are present', () => {
    expect(csvEscape('hello')).toBe('hello')
  })

  it('wraps in double-quotes when the value contains a comma', () => {
    expect(csvEscape('a,b')).toBe('"a,b"')
  })

  it('wraps in double-quotes when the value contains a newline', () => {
    expect(csvEscape('hello\nworld')).toBe('"hello\nworld"')
  })

  it('wraps in double-quotes when the value contains a carriage return', () => {
    expect(csvEscape('hello\rworld')).toBe('"hello\rworld"')
  })

  it('doubles internal double-quotes and wraps in double-quotes', () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""')
  })

  it('handles a value that is already a double-quote', () => {
    expect(csvEscape('"')).toBe('""""')
  })

  it('returns an empty string unchanged', () => {
    expect(csvEscape('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// buildCaptureCsv
// ---------------------------------------------------------------------------

describe('buildCaptureCsv', () => {
  it('includes the header row "timestamp,context,body,tags"', () => {
    const { content } = buildCaptureCsv([], new Date(2026, 3, 26))
    const firstLine = content.split('\n')[0]
    expect(firstLine).toBe('timestamp,context,body,tags')
  })

  it('returns only the header for an empty captures array', () => {
    const { content } = buildCaptureCsv([], new Date(2026, 3, 26))
    // header line + trailing newline
    expect(content).toBe('timestamp,context,body,tags\n')
  })

  it('filename matches quick-captures-YYYY-MM-DD.csv pattern', () => {
    const { filename } = buildCaptureCsv([], new Date(2026, 3, 26))
    expect(filename).toMatch(/^quick-captures-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(filename).toBe('quick-captures-2026-04-26.csv')
  })

  it('filename uses the injectable now date', () => {
    const { filename } = buildCaptureCsv([], new Date(2024, 0, 5)) // 2024-01-05
    expect(filename).toBe('quick-captures-2024-01-05.csv')
  })

  it('produces one data row per capture', () => {
    const { content } = buildCaptureCsv([c1, c2], new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    // header + 2 data rows
    expect(lines.length).toBe(3)
  })

  it('correctly formats a simple capture row with timestamp', () => {
    const { content } = buildCaptureCsv([c1], new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    // data row is second line
    expect(lines[1]).toBe('2026-04-26 10:05:03,Dashboard,Hello world,')
  })

  it('extracts tags from the body and puts them in the tags column', () => {
    const { content } = buildCaptureCsv([c2], new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    // last field = tags, separated by space
    expect(lines[1]).toContain('shopping errand')
  })

  it('properly escapes body containing a comma', () => {
    const { content } = buildCaptureCsv([c2], new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    // body has comma → should be quoted
    expect(lines[1]).toContain('"Buy milk, eggs #shopping #errand"')
  })

  it('properly escapes body containing double-quotes', () => {
    const { content } = buildCaptureCsv([c3], new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toContain('"She said ""hello"" to me"')
  })

  it('properly escapes body containing a newline', () => {
    const { content } = buildCaptureCsv([c4], new Date(2026, 3, 26))
    const lines = content.split('\n')
    // First data field in row contains the quoted multiline body
    expect(content).toContain('"Line one\nLine two"')
    // Should still start with header
    expect(lines[0]).toBe('timestamp,context,body,tags')
  })

  it('ends with a trailing newline', () => {
    const { content } = buildCaptureCsv([c1], new Date(2026, 3, 26))
    expect(content.endsWith('\n')).toBe(true)
  })
})

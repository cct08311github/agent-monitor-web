import { describe, it, expect } from 'vitest'
import { formatCaptureForClipboard } from '../captureFormat'
import type { Capture } from '../quickCapture'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCapture(overrides: Partial<Capture> = {}): Capture {
  return {
    id: 'qc_test_001',
    body: 'Hello world',
    context: 'TestTab',
    createdAt: new Date('2026-04-26T15:30:00').getTime(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// formatCaptureForClipboard
// ---------------------------------------------------------------------------

describe('formatCaptureForClipboard', () => {
  it('includes the timestamp formatted as YYYY-MM-DD HH:mm', () => {
    const capture = makeCapture({ createdAt: new Date('2026-04-26T15:30:00').getTime() })
    const result = formatCaptureForClipboard(capture)
    expect(result).toContain('2026-04-26 15:30')
  })

  it('includes the context label in the meta line', () => {
    const capture = makeCapture({ context: 'LogsTab' })
    const result = formatCaptureForClipboard(capture)
    expect(result).toContain('LogsTab')
  })

  it('includes the body verbatim', () => {
    const body = 'TODO: 監控 5xx error rate 變化'
    const capture = makeCapture({ body })
    const result = formatCaptureForClipboard(capture)
    expect(result).toContain(body)
  })

  it('appends a tag line when body contains hashtags', () => {
    const capture = makeCapture({ body: 'Fix the issue #observability #followup' })
    const result = formatCaptureForClipboard(capture)
    expect(result).toContain('#observability')
    expect(result).toContain('#followup')
    // tag line must be on its own line after the body
    const lines = result.split('\n')
    const tagLine = lines[lines.length - 1]
    expect(tagLine).toMatch(/^#/)
  })

  it('has no trailing tag line when the body has no hashtags', () => {
    const capture = makeCapture({ body: 'Plain text with no tags' })
    const result = formatCaptureForClipboard(capture)
    // should only have 2 lines: meta + body
    expect(result.split('\n')).toHaveLength(2)
  })

  it('formats the meta line as [timestamp · context]', () => {
    const capture = makeCapture({
      context: 'DashboardTab',
      createdAt: new Date('2026-01-02T09:05:00').getTime(),
    })
    const result = formatCaptureForClipboard(capture)
    expect(result.split('\n')[0]).toBe('[2026-01-02 09:05 · DashboardTab]')
  })

  it('pads single-digit month, day, hour, and minute with leading zero', () => {
    // 2026-01-02 09:05
    const capture = makeCapture({
      createdAt: new Date('2026-01-02T09:05:00').getTime(),
    })
    const result = formatCaptureForClipboard(capture)
    expect(result).toContain('2026-01-02 09:05')
  })
})

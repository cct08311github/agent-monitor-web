import { describe, it, expect } from 'vitest'
import { formatCronError } from './cronError'

describe('formatCronError', () => {
  it('returns empty string for undefined', () => {
    expect(formatCronError(undefined)).toBe('')
  })

  it('returns empty string for null', () => {
    expect(formatCronError(null)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(formatCronError('')).toBe('')
  })

  it('returns empty string for whitespace-only input', () => {
    expect(formatCronError('   \n\t  ')).toBe('')
  })

  it('returns short single-line input unchanged', () => {
    expect(formatCronError('Command failed')).toBe('Command failed')
  })

  it('collapses multi-line input into single line', () => {
    expect(formatCronError('line one\nline two\nline three')).toBe('line one line two line three')
  })

  it('collapses repeated whitespace to single space', () => {
    expect(formatCronError('too   many    spaces')).toBe('too many spaces')
  })

  it('truncates long input with ellipsis', () => {
    const long = 'a'.repeat(85)
    const result = formatCronError(long)
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBe(80)
  })

  it('does not truncate input at exactly maxLen chars', () => {
    const exact = 'a'.repeat(80)
    expect(formatCronError(exact)).toBe(exact)
  })

  it('truncates input at maxLen + 1 chars', () => {
    const overOne = 'a'.repeat(81)
    const result = formatCronError(overOne)
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBe(80)
  })

  it('respects custom maxLen parameter', () => {
    const long = 'a'.repeat(30)
    const result = formatCronError(long, 20)
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBe(20)
  })
})

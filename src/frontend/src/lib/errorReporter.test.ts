import { describe, it, expect, beforeEach } from 'vitest'
import { formatError, shouldSuppressDuplicate } from './errorReporter'

describe('formatError', () => {
  it('Error instance with message → correct message + type=Error', () => {
    const err = new Error('something went wrong')
    const result = formatError(err)
    expect(result.message).toBe('something went wrong')
    expect(result.type).toBe('Error')
  })

  it('Error instance with empty message uses name as fallback', () => {
    const err = new Error('')
    const result = formatError(err)
    expect(result.message).toBe('Error')
    expect(result.type).toBe('Error')
  })

  it('Custom error subclass → type reflects subclass name', () => {
    class CustomError extends Error {
      constructor(msg: string) {
        super(msg)
        this.name = 'CustomError'
      }
    }
    const err = new CustomError('custom msg')
    const result = formatError(err)
    expect(result.message).toBe('custom msg')
    expect(result.type).toBe('CustomError')
  })

  it('TypeError subclass → type is TypeError', () => {
    const err = new TypeError('type mismatch')
    const result = formatError(err)
    expect(result.message).toBe('type mismatch')
    expect(result.type).toBe('TypeError')
  })

  it('Non-empty string → returned unchanged', () => {
    const result = formatError('some error string')
    expect(result.message).toBe('some error string')
    expect(result.type).toBe('string')
  })

  it('Empty string → Empty error', () => {
    const result = formatError('')
    expect(result.message).toBe('Empty error')
    expect(result.type).toBe('string')
  })

  it('null → null error', () => {
    const result = formatError(null)
    expect(result.message).toBe('null error')
    expect(result.type).toBe('null')
  })

  it('undefined → undefined error', () => {
    const result = formatError(undefined)
    expect(result.message).toBe('undefined error')
    expect(result.type).toBe('undefined')
  })

  it('Object with .message string → uses message field', () => {
    const result = formatError({ message: 'obj message' })
    expect(result.message).toBe('obj message')
  })

  it('Object with .error string but no message → uses error field', () => {
    const result = formatError({ error: 'err field value' })
    expect(result.message).toBe('err field value')
  })

  it('Object with .reason string but no message or error → uses reason field', () => {
    const result = formatError({ reason: 'reason field value' })
    expect(result.message).toBe('reason field value')
  })

  it('Plain object with none of message/error/reason → JSON stringify truncated to 200', () => {
    const obj = { foo: 'bar', baz: 42 }
    const result = formatError(obj)
    expect(result.type).toBe('object')
    expect(result.message).toBe(JSON.stringify(obj).slice(0, 200))
  })

  it('Object that cannot be serialized (circular ref) → Unserializable object', () => {
    const obj: Record<string, unknown> = {}
    obj.self = obj
    const result = formatError(obj)
    expect(result.message).toBe('Unserializable object')
    expect(result.type).toBe('object')
  })

  it('Number 42 → message="42", type="number"', () => {
    const result = formatError(42)
    expect(result.message).toBe('42')
    expect(result.type).toBe('number')
  })

  it('Boolean true → message="true", type="boolean"', () => {
    const result = formatError(true)
    expect(result.message).toBe('true')
    expect(result.type).toBe('boolean')
  })
})

describe('shouldSuppressDuplicate', () => {
  let recent: Map<string, number>

  beforeEach(() => {
    recent = new Map()
  })

  it('First call → returns false and stores the key', () => {
    const result = shouldSuppressDuplicate('key1', 1000, 500, recent)
    expect(result).toBe(false)
    expect(recent.has('key1')).toBe(true)
  })

  it('Second call within window → returns true (suppressed)', () => {
    shouldSuppressDuplicate('key1', 1000, 500, recent)
    const result = shouldSuppressDuplicate('key1', 1200, 500, recent)
    expect(result).toBe(true)
  })

  it('Second call after window expires → returns false (not suppressed)', () => {
    shouldSuppressDuplicate('key1', 1000, 500, recent)
    const result = shouldSuppressDuplicate('key1', 1600, 500, recent)
    expect(result).toBe(false)
  })

  it('Different keys → independent, neither suppresses the other', () => {
    const r1 = shouldSuppressDuplicate('keyA', 1000, 500, recent)
    const r2 = shouldSuppressDuplicate('keyB', 1000, 500, recent)
    expect(r1).toBe(false)
    expect(r2).toBe(false)
    // Both still not suppressed on second call at different times
    const r3 = shouldSuppressDuplicate('keyA', 1600, 500, recent)
    const r4 = shouldSuppressDuplicate('keyB', 1600, 500, recent)
    expect(r3).toBe(false)
    expect(r4).toBe(false)
  })

  it('Map caps: after adding 101 stale entries, size is pruned to <= 100', () => {
    const windowMs = 500
    const now = 10000
    // Add 101 stale entries (timestamp far in the past)
    for (let i = 0; i < 101; i++) {
      recent.set(`stale-key-${i}`, 100) // stale: 9900ms before now
    }
    // Trigger pruning by calling with a new key (causes size > 100 check)
    shouldSuppressDuplicate('trigger-key', now, windowMs, recent)
    expect(recent.size).toBeLessThanOrEqual(100)
  })
})

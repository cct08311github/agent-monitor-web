import { describe, it, expect } from 'vitest'
import { filterAlertsByQuery, type SearchableAlert } from '../alertSearchFilter'

interface TestAlert extends SearchableAlert {
  id?: string
}

const alerts: TestAlert[] = [
  { id: 'a1', rule: 'cpu_high', message: 'CPU usage exceeded 90%', description: 'High CPU alert' },
  { id: 'a2', rule: 'memory_low', message: 'Memory below 100MB', description: null },
  { id: 'a3', rule: 'disk_full', message: 'Disk usage at 99%', description: 'Storage alert' },
  { id: 'a4', rule: 'latency_p99', message: 'p99 latency exceeds 2s', description: undefined },
]

describe('filterAlertsByQuery', () => {
  it('empty query returns all alerts (unfiltered copy)', () => {
    const result = filterAlertsByQuery(alerts, '')
    expect(result).toHaveLength(alerts.length)
    expect(result.map((a) => a.id)).toEqual(alerts.map((a) => a.id))
  })

  it('whitespace-only query returns all alerts', () => {
    const result = filterAlertsByQuery(alerts, '   ')
    expect(result).toHaveLength(alerts.length)
  })

  it('matches by rule field', () => {
    const result = filterAlertsByQuery(alerts, 'cpu')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a1')
  })

  it('matches by message field', () => {
    const result = filterAlertsByQuery(alerts, 'Memory below')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a2')
  })

  it('matches by description field', () => {
    const result = filterAlertsByQuery(alerts, 'Storage alert')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a3')
  })

  it('is case-insensitive', () => {
    const result = filterAlertsByQuery(alerts, 'LATENCY')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a4')
  })

  it('fuzzy matches across characters out of order are rejected', () => {
    // 'zzz' should not match anything
    const result = filterAlertsByQuery(alerts, 'zzz')
    expect(result).toHaveLength(0)
  })

  it('alert with all null/undefined fields is not matched', () => {
    const nullAlert: TestAlert[] = [{ id: 'null-alert', rule: null, message: null, description: undefined }]
    const result = filterAlertsByQuery(nullAlert, 'anything')
    expect(result).toHaveLength(0)
  })

  it('does not mutate the original array', () => {
    const original = [...alerts]
    filterAlertsByQuery(alerts, 'cpu')
    expect(alerts).toEqual(original)
  })

  it('query matching multiple fields returns alert once', () => {
    // 'cpu_high' matches both rule AND could match description; should deduplicate (filter, not flatMap)
    const result = filterAlertsByQuery(alerts, 'cpu')
    expect(result).toHaveLength(1)
  })

  it('fuzzy match on rule: partial chars still match', () => {
    // 'dsk' fuzzy matches 'disk_full'
    const result = filterAlertsByQuery(alerts, 'dsk')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a3')
  })
})

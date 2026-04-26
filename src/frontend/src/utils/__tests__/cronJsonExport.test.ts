import { describe, it, expect } from 'vitest'
import { buildCronJson } from '../cronJsonExport'
import type { CronBackup, CronBackupInput } from '../cronJsonExport'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const job1 = { id: 'cron-001', name: 'Daily Backup', schedule: { expr: '0 2 * * *' }, enabled: true }
const job2 = { id: 'cron-002', name: 'Weekly Report', schedule: { expr: '0 9 * * 1' }, enabled: false }

function makeInput(overrides: Partial<CronBackupInput> = {}): CronBackupInput {
  return {
    jobs: [],
    aliases: new Map(),
    tagsMap: new Map(),
    pinned: [],
    archived: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// filename
// ---------------------------------------------------------------------------

describe('buildCronJson — filename', () => {
  it('filename matches cron-jobs-YYYY-MM-DD.json pattern', () => {
    const now = new Date(2026, 3, 26) // 2026-04-26
    const { filename } = buildCronJson(makeInput(), now)
    expect(filename).toMatch(/^cron-jobs-\d{4}-\d{2}-\d{2}\.json$/)
    expect(filename).toBe('cron-jobs-2026-04-26.json')
  })

  it('filename zero-pads month and day', () => {
    const now = new Date(2026, 0, 5) // 2026-01-05
    const { filename } = buildCronJson(makeInput(), now)
    expect(filename).toBe('cron-jobs-2026-01-05.json')
  })

  it('filename uses the injectable now date', () => {
    const { filename } = buildCronJson(makeInput(), new Date(2024, 11, 1)) // 2024-12-01
    expect(filename).toBe('cron-jobs-2024-12-01.json')
  })
})

// ---------------------------------------------------------------------------
// version and exportedAt
// ---------------------------------------------------------------------------

describe('buildCronJson — version and exportedAt', () => {
  it('content includes version "1"', () => {
    const { content } = buildCronJson(makeInput())
    const parsed = JSON.parse(content) as CronBackup
    expect(parsed.version).toBe('1')
  })

  it('content includes exportedAt as a number matching now.getTime()', () => {
    const now = new Date(2026, 3, 26)
    const { content } = buildCronJson(makeInput(), now)
    const parsed = JSON.parse(content) as CronBackup
    expect(typeof parsed.exportedAt).toBe('number')
    expect(parsed.exportedAt).toBe(now.getTime())
  })
})

// ---------------------------------------------------------------------------
// jobs
// ---------------------------------------------------------------------------

describe('buildCronJson — jobs', () => {
  it('content preserves jobs array', () => {
    const { content } = buildCronJson(makeInput({ jobs: [job1, job2] }))
    const parsed = JSON.parse(content) as CronBackup
    expect(parsed.jobs).toHaveLength(2)
    expect((parsed.jobs[0] as typeof job1).id).toBe('cron-001')
    expect((parsed.jobs[1] as typeof job2).id).toBe('cron-002')
  })

  it('empty jobs array produces valid JSON with empty jobs array', () => {
    const { content } = buildCronJson(makeInput())
    const parsed = JSON.parse(content) as CronBackup
    expect(parsed.jobs).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// aliases Map → object
// ---------------------------------------------------------------------------

describe('buildCronJson — aliases serialization', () => {
  it('aliases Map serialized to plain object', () => {
    const aliases = new Map([
      ['cron-001', 'My Alias'],
      ['cron-002', 'Another'],
    ])
    const { content } = buildCronJson(makeInput({ aliases }))
    const parsed = JSON.parse(content) as CronBackup
    expect(parsed.aliases).toEqual({ 'cron-001': 'My Alias', 'cron-002': 'Another' })
  })

  it('empty aliases Map serializes to empty object', () => {
    const { content } = buildCronJson(makeInput())
    const parsed = JSON.parse(content) as CronBackup
    expect(parsed.aliases).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// tagsMap Map → object with array values
// ---------------------------------------------------------------------------

describe('buildCronJson — tags serialization', () => {
  it('tagsMap Map serialized to object with array values', () => {
    const tagsMap = new Map<string, string[]>([
      ['cron-001', ['backup', 'db']],
      ['cron-002', ['weekly']],
    ])
    const { content } = buildCronJson(makeInput({ tagsMap }))
    const parsed = JSON.parse(content) as CronBackup
    expect(parsed.tags).toEqual({ 'cron-001': ['backup', 'db'], 'cron-002': ['weekly'] })
  })

  it('empty tagsMap serializes to empty object', () => {
    const { content } = buildCronJson(makeInput())
    const parsed = JSON.parse(content) as CronBackup
    expect(parsed.tags).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// pinned and archived
// ---------------------------------------------------------------------------

describe('buildCronJson — pinned and archived', () => {
  it('content preserves pinned array', () => {
    const { content } = buildCronJson(makeInput({ pinned: ['cron-001'] }))
    const parsed = JSON.parse(content) as CronBackup
    expect(parsed.pinned).toEqual(['cron-001'])
  })

  it('content preserves archived array', () => {
    const { content } = buildCronJson(makeInput({ archived: ['cron-002'] }))
    const parsed = JSON.parse(content) as CronBackup
    expect(parsed.archived).toEqual(['cron-002'])
  })

  it('empty input produces empty pinned and archived', () => {
    const { content } = buildCronJson(makeInput())
    const parsed = JSON.parse(content) as CronBackup
    expect(parsed.pinned).toEqual([])
    expect(parsed.archived).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// all fields present
// ---------------------------------------------------------------------------

describe('buildCronJson — all fields present', () => {
  it('content includes all required top-level fields', () => {
    const { content } = buildCronJson(
      makeInput({
        jobs: [job1],
        aliases: new Map([['cron-001', 'Daily']]),
        tagsMap: new Map([['cron-001', ['nightly']]]),
        pinned: ['cron-001'],
        archived: [],
      }),
      new Date(2026, 3, 26),
    )
    const parsed = JSON.parse(content) as CronBackup
    expect(parsed.version).toBe('1')
    expect(typeof parsed.exportedAt).toBe('number')
    expect(Array.isArray(parsed.jobs)).toBe(true)
    expect(typeof parsed.aliases).toBe('object')
    expect(typeof parsed.tags).toBe('object')
    expect(Array.isArray(parsed.pinned)).toBe(true)
    expect(Array.isArray(parsed.archived)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// JSON round-trip
// ---------------------------------------------------------------------------

describe('buildCronJson — round-trip', () => {
  it('JSON round-trips via JSON.parse → matches original data', () => {
    const now = new Date(2026, 3, 26)
    const input = makeInput({
      jobs: [job1, job2],
      aliases: new Map([['cron-001', 'Backup Alias']]),
      tagsMap: new Map([['cron-001', ['backup', 'db']]]),
      pinned: ['cron-001'],
      archived: ['cron-002'],
    })
    const { content } = buildCronJson(input, now)
    const parsed = JSON.parse(content) as CronBackup
    expect(parsed.version).toBe('1')
    expect(parsed.exportedAt).toBe(now.getTime())
    expect(parsed.jobs).toHaveLength(2)
    expect(parsed.aliases['cron-001']).toBe('Backup Alias')
    expect(parsed.tags['cron-001']).toEqual(['backup', 'db'])
    expect(parsed.pinned).toEqual(['cron-001'])
    expect(parsed.archived).toEqual(['cron-002'])
  })

  it('does not mutate the input collections', () => {
    const jobs = [job1, job2]
    const pinned = ['cron-001']
    const archived = ['cron-002']
    buildCronJson(makeInput({ jobs, pinned, archived }))
    expect(jobs).toHaveLength(2)
    expect(pinned).toHaveLength(1)
    expect(archived).toHaveLength(1)
  })
})

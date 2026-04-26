import { describe, it, expect } from 'vitest'
import { categorizeSchedule, computeCronInsights } from '../cronInsights'

// ---------------------------------------------------------------------------
// categorizeSchedule
// ---------------------------------------------------------------------------

describe('categorizeSchedule — @-shortcuts', () => {
  it('@daily → daily', () => {
    expect(categorizeSchedule('@daily')).toBe('daily')
  })

  it('@midnight → daily', () => {
    expect(categorizeSchedule('@midnight')).toBe('daily')
  })

  it('@hourly → hourly', () => {
    expect(categorizeSchedule('@hourly')).toBe('hourly')
  })

  it('@weekly → weekly', () => {
    expect(categorizeSchedule('@weekly')).toBe('weekly')
  })

  it('@monthly → monthly', () => {
    expect(categorizeSchedule('@monthly')).toBe('monthly')
  })

  it('@yearly → custom', () => {
    expect(categorizeSchedule('@yearly')).toBe('custom')
  })

  it('@annually → custom', () => {
    expect(categorizeSchedule('@annually')).toBe('custom')
  })
})

describe('categorizeSchedule — 5-field expressions', () => {
  it('*/5 * * * * → minute', () => {
    expect(categorizeSchedule('*/5 * * * *')).toBe('minute')
  })

  it('* * * * * → minute (all wildcard minute)', () => {
    expect(categorizeSchedule('* * * * *')).toBe('minute')
  })

  it('0 * * * * → hourly (minute fixed, hour wildcard)', () => {
    expect(categorizeSchedule('0 * * * *')).toBe('hourly')
  })

  it('30 */2 * * * → hourly (minute fixed, hour step)', () => {
    expect(categorizeSchedule('30 */2 * * *')).toBe('hourly')
  })

  it('0 9 * * * → daily', () => {
    expect(categorizeSchedule('0 9 * * *')).toBe('daily')
  })

  it('0 9 * * 1 → weekly (dow specified)', () => {
    expect(categorizeSchedule('0 9 * * 1')).toBe('weekly')
  })

  it('0 0 1 * * → monthly (dom specified, dow wildcard)', () => {
    expect(categorizeSchedule('0 0 1 * *')).toBe('monthly')
  })

  it('0 0 15 * * → monthly', () => {
    expect(categorizeSchedule('0 0 15 * *')).toBe('monthly')
  })

  it('too few fields → custom', () => {
    expect(categorizeSchedule('0 9 * *')).toBe('custom')
  })

  it('too many fields → custom', () => {
    expect(categorizeSchedule('0 9 * * * *')).toBe('custom')
  })

  it('empty string → custom', () => {
    expect(categorizeSchedule('')).toBe('custom')
  })

  it('garbage string → custom', () => {
    expect(categorizeSchedule('garbage')).toBe('custom')
  })

  it('whitespace-only → custom', () => {
    expect(categorizeSchedule('   ')).toBe('custom')
  })
})

// ---------------------------------------------------------------------------
// computeCronInsights — empty input
// ---------------------------------------------------------------------------

describe('computeCronInsights — empty input', () => {
  it('returns zeroed-out result for empty jobs array', () => {
    const result = computeCronInsights({ jobs: [], tagsMap: new Map() })
    expect(result.scheduleCategories).toEqual([])
    expect(result.enabledCount).toBe(0)
    expect(result.disabledCount).toBe(0)
    expect(result.enabledPct).toBe(0)
    expect(result.topTags).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// computeCronInsights — enabledCount / disabledCount / enabledPct
// ---------------------------------------------------------------------------

describe('computeCronInsights — enabled ratio', () => {
  it('counts enabled and disabled jobs correctly', () => {
    const jobs = [
      { id: 'j1', enabled: true, schedule: { expr: '0 9 * * *' } },
      { id: 'j2', enabled: true, schedule: { expr: '0 * * * *' } },
      { id: 'j3', enabled: false, schedule: { expr: '@daily' } },
    ]
    const result = computeCronInsights({ jobs, tagsMap: new Map() })
    expect(result.enabledCount).toBe(2)
    expect(result.disabledCount).toBe(1)
    expect(result.enabledPct).toBe(67)
  })

  it('treats missing enabled field as disabled', () => {
    const jobs = [
      { id: 'j1' },
      { id: 'j2', enabled: true, schedule: null },
    ]
    const result = computeCronInsights({ jobs, tagsMap: new Map() })
    expect(result.enabledCount).toBe(1)
    expect(result.disabledCount).toBe(1)
    expect(result.enabledPct).toBe(50)
  })

  it('100% when all enabled', () => {
    const jobs = [
      { id: 'j1', enabled: true },
      { id: 'j2', enabled: true },
    ]
    const result = computeCronInsights({ jobs, tagsMap: new Map() })
    expect(result.enabledPct).toBe(100)
    expect(result.disabledCount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// computeCronInsights — scheduleCategories
// ---------------------------------------------------------------------------

describe('computeCronInsights — scheduleCategories', () => {
  it('groups jobs by schedule category', () => {
    const jobs = [
      { id: 'j1', enabled: true, schedule: { expr: '0 9 * * *' } },  // daily
      { id: 'j2', enabled: true, schedule: { expr: '@daily' } },       // daily
      { id: 'j3', enabled: false, schedule: { expr: '0 * * * *' } },  // hourly
      { id: 'j4', enabled: true, schedule: { expr: '' } },             // custom
    ]
    const result = computeCronInsights({ jobs, tagsMap: new Map() })
    const catMap = Object.fromEntries(
      result.scheduleCategories.map((c) => [c.category, c]),
    )
    expect(catMap['daily'].count).toBe(2)
    expect(catMap['hourly'].count).toBe(1)
    expect(catMap['custom'].count).toBe(1)
    // 'minute', 'weekly', 'monthly' should not appear (count = 0)
    expect(result.scheduleCategories.find((c) => c.category === 'minute')).toBeUndefined()
  })

  it('categories are ordered: minute, hourly, daily, weekly, monthly, custom', () => {
    const jobs = [
      { id: 'j1', enabled: true, schedule: { expr: '*/5 * * * *' } },  // minute
      { id: 'j2', enabled: true, schedule: { expr: '0 9 * * *' } },    // daily
    ]
    const result = computeCronInsights({ jobs, tagsMap: new Map() })
    expect(result.scheduleCategories[0].category).toBe('minute')
    expect(result.scheduleCategories[1].category).toBe('daily')
  })

  it('computes pct correctly', () => {
    const jobs = [
      { id: 'j1', enabled: true, schedule: { expr: '0 9 * * *' } },
      { id: 'j2', enabled: true, schedule: { expr: '0 9 * * *' } },
      { id: 'j3', enabled: true, schedule: { expr: '0 9 * * *' } },
      { id: 'j4', enabled: true, schedule: { expr: '0 * * * *' } },
    ]
    const result = computeCronInsights({ jobs, tagsMap: new Map() })
    const daily = result.scheduleCategories.find((c) => c.category === 'daily')!
    const hourly = result.scheduleCategories.find((c) => c.category === 'hourly')!
    expect(daily.pct).toBe(75)
    expect(hourly.pct).toBe(25)
  })
})

// ---------------------------------------------------------------------------
// computeCronInsights — topTags
// ---------------------------------------------------------------------------

describe('computeCronInsights — topTags', () => {
  it('returns top 3 tags sorted by frequency descending', () => {
    const tagsMap = new Map([
      ['j1', ['alpha', 'beta', 'gamma']],
      ['j2', ['alpha', 'beta']],
      ['j3', ['alpha']],
    ])
    const result = computeCronInsights({ jobs: [], tagsMap })
    expect(result.topTags).toHaveLength(3)
    expect(result.topTags[0].label).toBe('alpha')
    expect(result.topTags[0].count).toBe(3)
    expect(result.topTags[1].label).toBe('beta')
    expect(result.topTags[1].count).toBe(2)
    expect(result.topTags[2].label).toBe('gamma')
    expect(result.topTags[2].count).toBe(1)
  })

  it('returns at most 3 tags even when more exist', () => {
    const tagsMap = new Map([
      ['j1', ['a', 'b', 'c', 'd', 'e']],
    ])
    const result = computeCronInsights({ jobs: [], tagsMap })
    expect(result.topTags).toHaveLength(3)
  })

  it('returns empty topTags when tagsMap is empty', () => {
    const jobs = [{ id: 'j1', enabled: true, schedule: { expr: '@daily' } }]
    const result = computeCronInsights({ jobs, tagsMap: new Map() })
    expect(result.topTags).toEqual([])
  })

  it('breaks ties alphabetically', () => {
    const tagsMap = new Map([
      ['j1', ['zebra', 'apple']],
      ['j2', ['zebra', 'apple']],
    ])
    const result = computeCronInsights({ jobs: [], tagsMap })
    expect(result.topTags[0].label).toBe('apple')
    expect(result.topTags[1].label).toBe('zebra')
  })

  it('calculates pct relative to total tag instances', () => {
    const tagsMap = new Map([
      ['j1', ['a', 'a']],  // a=2
      ['j2', ['b', 'b']],  // b=2
    ])
    const result = computeCronInsights({ jobs: [], tagsMap })
    // total instances = 4; a: 2/4 = 50%, b: 2/4 = 50%
    expect(result.topTags.find((t) => t.label === 'a')?.pct).toBe(50)
    expect(result.topTags.find((t) => t.label === 'b')?.pct).toBe(50)
  })
})

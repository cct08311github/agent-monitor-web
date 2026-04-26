import { describe, it, expect } from 'vitest'
import { groupByCategory } from '../commandGroups'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function item(id: number, category?: string) {
  return { id, category }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('groupByCategory', () => {
  // Case 1: empty input → empty output
  it('returns [] for empty input', () => {
    expect(groupByCategory([], [])).toEqual([])
  })

  // Case 2: items with same category end up in one group; distinct categories → two groups
  it('groups items with same category into one group', () => {
    const result = groupByCategory([item(1, 'A'), item(2, 'A'), item(3, 'B')])
    expect(result).toHaveLength(2)
    const groupA = result.find((g) => g.category === 'A')
    expect(groupA?.commands).toHaveLength(2)
    const groupB = result.find((g) => g.category === 'B')
    expect(groupB?.commands).toHaveLength(1)
  })

  // Case 3: items with empty string or undefined category go into defaultCategory ('Other')
  it('places items with empty or undefined category into default "Other" group', () => {
    const result = groupByCategory([item(1, ''), item(2, undefined)])
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('Other')
    expect(result[0].commands).toHaveLength(2)
  })

  // Case 4: order array controls group order
  it('respects order array — listed categories appear first', () => {
    const result = groupByCategory([item(1, 'B'), item(2, 'A')], ['A', 'B'])
    expect(result[0].category).toBe('A')
    expect(result[1].category).toBe('B')
  })

  // Case 5: categories not in order appear after ordered ones
  it('appends unlisted categories after ordered groups', () => {
    const result = groupByCategory(
      [item(1, 'B'), item(2, 'X'), item(3, 'A')],
      ['A', 'B'],
    )
    expect(result).toHaveLength(3)
    expect(result[0].category).toBe('A')
    expect(result[1].category).toBe('B')
    expect(result[2].category).toBe('X')
  })

  // Case 6: internal order within a group preserves insertion order
  it('preserves insertion order within a group', () => {
    const result = groupByCategory([item(1, 'A'), item(2, 'A')])
    expect(result[0].commands[0].id).toBe(1)
    expect(result[0].commands[1].id).toBe(2)
  })

  // Case 7: custom defaultCategory is respected
  it('uses custom defaultCategory when provided', () => {
    const result = groupByCategory([item(1, undefined)], [], 'Misc')
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('Misc')
  })

  // Case 8: order entries that have no matching items are silently skipped
  it('skips order entries with no matching items', () => {
    const result = groupByCategory([item(1, 'B')], ['A', 'B', 'C'])
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('B')
  })

  // Case 9: ReadonlyArray constraint — works with a typed tuple narrowed to category union
  it('works with typed category union', () => {
    const cmds: Array<{ id: number; category: 'Navigation' | 'Actions' }> = [
      { id: 1, category: 'Navigation' },
      { id: 2, category: 'Actions' },
      { id: 3, category: 'Navigation' },
    ]
    const result = groupByCategory(cmds, ['Navigation', 'Actions'])
    expect(result[0].category).toBe('Navigation')
    expect(result[0].commands).toHaveLength(2)
    expect(result[1].category).toBe('Actions')
    expect(result[1].commands).toHaveLength(1)
  })
})

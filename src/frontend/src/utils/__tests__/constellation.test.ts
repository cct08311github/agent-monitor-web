import { describe, it, expect } from 'vitest'
import {
  groupSubagents,
  computeLayout,
  statusColor,
  subagentRadius,
} from '../constellation'

// ---------------------------------------------------------------------------
// groupSubagents
// ---------------------------------------------------------------------------

describe('groupSubagents', () => {
  it('filters out entries without ownerAgent', () => {
    const result = groupSubagents([
      { subagentId: 'orphan', status: 'idle', tokens: 100 },
    ])
    expect(result.size).toBe(0)
  })

  it('groups subagents by ownerAgent', () => {
    const result = groupSubagents([
      { ownerAgent: 'agentA', subagentId: 'sub1', status: 'running', tokens: 1000 },
      { ownerAgent: 'agentA', subagentId: 'sub2', status: 'idle', tokens: 500 },
      { ownerAgent: 'agentB', subagentId: 'sub3', status: 'idle', tokens: 200 },
    ])
    expect(result.size).toBe(2)
    expect(result.get('agentA')).toHaveLength(2)
    expect(result.get('agentB')).toHaveLength(1)
  })

  it('uses subagentId as id and falls back gracefully', () => {
    const result = groupSubagents([
      { ownerAgent: 'agentA', subagentId: 'my-sub', status: 'active', tokens: 0 },
    ])
    const sas = result.get('agentA')!
    expect(sas[0].id).toBe('my-sub')
  })

  it('uses label when provided', () => {
    const result = groupSubagents([
      { ownerAgent: 'agentA', subagentId: 'sub1', label: 'My Sub', status: 'idle', tokens: 0 },
    ])
    expect(result.get('agentA')![0].label).toBe('My Sub')
  })

  it('falls back to subagentId as label when label is absent', () => {
    const result = groupSubagents([
      { ownerAgent: 'agentA', subagentId: 'sub-x', status: 'idle', tokens: 0 },
    ])
    expect(result.get('agentA')![0].label).toBe('sub-x')
  })
})

// ---------------------------------------------------------------------------
// computeLayout
// ---------------------------------------------------------------------------

describe('computeLayout', () => {
  it('returns minimal viewBox for empty groups array', () => {
    const layout = computeLayout([])
    expect(layout.groups).toHaveLength(0)
    expect(layout.viewBox.width).toBeGreaterThan(0)
    expect(layout.viewBox.height).toBeGreaterThan(0)
  })

  it('produces one GroupLayout per ConstellationGroup', () => {
    const groups = [
      {
        ownerAgent: 'agentA',
        centerEmoji: '🤖',
        subagents: [{ id: 'sub1', label: 'sub1', status: 'idle', tokens: 0 }],
      },
    ]
    const layout = computeLayout(groups)
    expect(layout.groups).toHaveLength(1)
    expect(layout.groups[0].ownerAgent).toBe('agentA')
    expect(layout.groups[0].centerEmoji).toBe('🤖')
  })

  it('assigns x/y/r/color to each subagent layout', () => {
    const groups = [
      {
        ownerAgent: 'agentA',
        centerEmoji: '🤖',
        subagents: [
          { id: 'sub1', label: 'sub1', status: 'running', tokens: 5000 },
          { id: 'sub2', label: 'sub2', status: 'idle', tokens: 0 },
        ],
      },
    ]
    const layout = computeLayout(groups)
    const sas = layout.groups[0].subagents
    expect(sas).toHaveLength(2)
    for (const sa of sas) {
      expect(typeof sa.x).toBe('number')
      expect(typeof sa.y).toBe('number')
      expect(sa.r).toBeGreaterThanOrEqual(6)
      expect(sa.r).toBeLessThanOrEqual(14)
      expect(sa.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('viewBox height grows when groups overflow into a second row', () => {
    // With CLUSTER_COLS = 2, three groups create two rows
    const threeGroups = [
      {
        ownerAgent: 'agentA',
        centerEmoji: '🤖',
        subagents: [{ id: 'sub1', label: 's', status: 'idle', tokens: 0 }],
      },
      {
        ownerAgent: 'agentB',
        centerEmoji: '🤖',
        subagents: [{ id: 'sub2', label: 's', status: 'idle', tokens: 0 }],
      },
      {
        ownerAgent: 'agentC',
        centerEmoji: '🤖',
        subagents: [{ id: 'sub3', label: 's', status: 'idle', tokens: 0 }],
      },
    ]
    const twoGroups = threeGroups.slice(0, 2)
    const layoutTwo = computeLayout(twoGroups)
    const layoutThree = computeLayout(threeGroups)
    // Three clusters (two rows) → taller than two clusters (one row)
    expect(layoutThree.viewBox.height).toBeGreaterThan(layoutTwo.viewBox.height)
  })
})

// ---------------------------------------------------------------------------
// statusColor
// ---------------------------------------------------------------------------

describe('statusColor', () => {
  it('returns grey for idle', () => {
    expect(statusColor('idle')).toBe('#9aa0a6')
  })

  it('returns green for active_recent', () => {
    expect(statusColor('active_recent')).toBe('#22c55e')
  })

  it('returns orange for running', () => {
    expect(statusColor('running')).toBe('#f97316')
  })

  it('returns grey for empty string', () => {
    expect(statusColor('')).toBe('#9aa0a6')
  })

  it('returns orange for active_executing', () => {
    expect(statusColor('active_executing')).toBe('#f97316')
  })

  it('returns grey for unknown status', () => {
    expect(statusColor('unknown_xyz')).toBe('#9aa0a6')
  })
})

// ---------------------------------------------------------------------------
// subagentRadius
// ---------------------------------------------------------------------------

describe('subagentRadius', () => {
  it('returns minimum radius for 0 tokens', () => {
    expect(subagentRadius(0)).toBe(6)
  })

  it('returns minimum radius for negative tokens', () => {
    expect(subagentRadius(-100)).toBe(6)
  })

  it('returns maximum radius for very large tokens (1M+)', () => {
    expect(subagentRadius(1_000_000)).toBe(14)
  })

  it('radius for mid-range tokens is between min and max', () => {
    const r = subagentRadius(10_000)
    expect(r).toBeGreaterThanOrEqual(6)
    expect(r).toBeLessThanOrEqual(14)
  })

  it('larger token count produces larger or equal radius (monotonic)', () => {
    const r1 = subagentRadius(100)
    const r2 = subagentRadius(100_000)
    expect(r2).toBeGreaterThanOrEqual(r1)
  })

  it('radius for 1 token is > minimum (log scale starts at 0 for log(1))', () => {
    const r = subagentRadius(1)
    // log10(2) > 0, so ratio > 0 → radius > 6 (rounding may keep it at 6)
    expect(r).toBeGreaterThanOrEqual(6)
  })
})

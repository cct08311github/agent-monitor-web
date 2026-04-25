import { describe, it, expect } from 'vitest'
import { buildDigest } from '../dailyDigest'
import type { DigestInput } from '../dailyDigest'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(
  id: string,
  opts: { status?: string; today?: number; yesterday?: number; month?: number } = {},
) {
  return {
    id,
    status: opts.status ?? 'offline',
    costs: {
      today: opts.today ?? 0,
      yesterday: opts.yesterday ?? 0,
      month: opts.month ?? 0,
    },
  }
}

function linesOf(text: string): string[] {
  return text.split('\n')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildDigest', () => {
  // 1. Empty input fallback — should not throw, returns 5 lines
  it('handles empty input without throwing', () => {
    const result = buildDigest({})
    const lines = linesOf(result)
    expect(lines).toHaveLength(5)
  })

  // 2. Exactly 5 lines
  it('always returns exactly 5 lines', () => {
    const input: DigestInput = {
      agents: [makeAgent('a', { status: 'active_executing', today: 1.5, month: 10 })],
      subagents: [{ status: 'idle' }],
      alerts: [],
      errorCount: 3,
    }
    const lines = linesOf(buildDigest(input))
    expect(lines).toHaveLength(5)
  })

  // 3. Critical alert hint
  it('shows critical alert hint when severity is critical', () => {
    const input: DigestInput = {
      alerts: [{ severity: 'critical' }, { severity: 'warning' }],
    }
    const result = buildDigest(input)
    expect(result).toContain('🔴 critical: 1')
  })

  // 4. Warning alert hint (no critical)
  it('shows warning hint when only warning alerts exist', () => {
    const input: DigestInput = {
      alerts: [{ severity: 'warning' }, { severity: 'warning' }],
    }
    const result = buildDigest(input)
    expect(result).toContain('🟠 warning: 2')
  })

  // 5. No alerts hint
  it('shows "no active alerts" hint when alerts array is empty', () => {
    const result = buildDigest({ alerts: [] })
    expect(result).toContain('✅ no active alerts')
  })

  // 6. Cost delta — up arrow when today > yesterday by more than 5%
  it('shows ↑ arrow when cost increased > 5% vs yesterday', () => {
    const input: DigestInput = {
      agents: [makeAgent('a', { today: 12, yesterday: 10 })],
    }
    const result = buildDigest(input)
    expect(result).toContain('↑')
  })

  // 7. Cost delta — down arrow when today < yesterday by more than 5%
  it('shows ↓ arrow when cost decreased > 5% vs yesterday', () => {
    const input: DigestInput = {
      agents: [makeAgent('a', { today: 8, yesterday: 10 })],
    }
    const result = buildDigest(input)
    expect(result).toContain('↓')
  })

  // 8. Cost delta — flat when change is within 5%
  it('shows ≈ when cost change is within 5%', () => {
    const input: DigestInput = {
      agents: [makeAgent('a', { today: 10.2, yesterday: 10 })],
    }
    const result = buildDigest(input)
    expect(result).toContain('≈')
  })

  // 9. Top spender selection — highest month cost wins
  it('selects top spender by month cost', () => {
    const input: DigestInput = {
      agents: [
        makeAgent('cheap', { month: 5 }),
        makeAgent('big-spender', { month: 100 }),
        makeAgent('mid', { month: 30 }),
      ],
    }
    const result = buildDigest(input)
    expect(result).toContain('big-spender')
  })

  // 10. Sub-agents count
  it('reports correct sub-agent total and idle count', () => {
    const input: DigestInput = {
      subagents: [
        { status: 'idle' },
        { status: 'idle' },
        { status: 'busy' },
      ],
    }
    const lines = linesOf(buildDigest(input))
    // line 5 (index 4): Sub-agents: 3 (2 idle)
    expect(lines[4]).toContain('Sub-agents: 3 (2 idle)')
  })

  // 11. Active agent count
  it('counts agents matching /active/i as active', () => {
    const input: DigestInput = {
      agents: [
        makeAgent('a', { status: 'active_executing' }),
        makeAgent('b', { status: 'active_recent' }),
        makeAgent('c', { status: 'offline' }),
      ],
    }
    const lines = linesOf(buildDigest(input))
    expect(lines[1]).toContain('3 agents, 2 active')
  })

  // 12. Custom date is reflected in title line
  it('uses provided date in title line', () => {
    const result = buildDigest({ date: '2025-01-15' })
    expect(result).toContain('Daily Digest (2025-01-15)')
  })
})

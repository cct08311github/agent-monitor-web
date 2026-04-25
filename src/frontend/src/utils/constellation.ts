// ---------------------------------------------------------------------------
// constellation.ts — Utilities for the Agent Constellation radial SVG graph
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Exported interfaces
// ---------------------------------------------------------------------------

export interface ConstellationGroup {
  ownerAgent: string
  centerEmoji: string
  subagents: ConstellationSubAgent[]
}

export interface ConstellationSubAgent {
  id: string
  label: string
  status: string
  tokens: number
}

export interface ConstellationLayout {
  groups: GroupLayout[]
  viewBox: { width: number; height: number }
}

export interface GroupLayout {
  ownerAgent: string
  centerEmoji: string
  centerX: number
  centerY: number
  subagents: SubAgentLayout[]
}

export interface SubAgentLayout extends ConstellationSubAgent {
  x: number
  y: number
  r: number
  color: string
}

// ---------------------------------------------------------------------------
// groupSubagents
// ---------------------------------------------------------------------------

/**
 * Group a list of raw subagent records by ownerAgent.
 * Records without an ownerAgent are skipped.
 */
export function groupSubagents(
  subagents: {
    ownerAgent?: string
    subagentId?: string
    label?: string
    status?: string
    tokens?: number
  }[],
): Map<string, ConstellationSubAgent[]> {
  const result = new Map<string, ConstellationSubAgent[]>()

  for (const sa of subagents) {
    if (!sa.ownerAgent) continue

    const entry: ConstellationSubAgent = {
      id: sa.subagentId ?? sa.ownerAgent + '-sub',
      label: sa.label ?? sa.subagentId ?? 'sub',
      status: sa.status ?? 'idle',
      tokens: sa.tokens ?? 0,
    }

    const existing = result.get(sa.ownerAgent)
    if (existing) {
      existing.push(entry)
    } else {
      result.set(sa.ownerAgent, [entry])
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// statusColor
// ---------------------------------------------------------------------------

/**
 * Return a hex color for a given status string.
 * idle → slate grey, recent → green, running/active → orange
 */
export function statusColor(status: string): string {
  const s = status.toLowerCase()
  if (s === 'idle' || s === '') return '#9aa0a6'
  if (s.includes('recent') || s.includes('complete') || s.includes('done')) return '#22c55e'
  if (s.includes('running') || s.includes('active') || s.includes('executing')) return '#f97316'
  return '#9aa0a6'
}

// ---------------------------------------------------------------------------
// subagentRadius
// ---------------------------------------------------------------------------

const MIN_RADIUS = 6
const MAX_RADIUS = 14

/**
 * Map a token count to a circle radius using a log scale clamped to [6, 14].
 */
export function subagentRadius(tokens: number): number {
  if (tokens <= 0) return MIN_RADIUS
  // log10(1) = 0, log10(100k) ≈ 5, log10(1M) ≈ 6
  const logVal = Math.log10(tokens + 1)
  const logMax = Math.log10(1_000_000)
  const ratio = Math.min(logVal / logMax, 1)
  return Math.round(MIN_RADIUS + ratio * (MAX_RADIUS - MIN_RADIUS))
}

// ---------------------------------------------------------------------------
// computeLayout
// ---------------------------------------------------------------------------

const CLUSTER_COLS = 2
const CENTER_RADIUS = 30
const ORBIT_RADIUS = 80
const CLUSTER_PAD_X = 240
const CLUSTER_PAD_Y = 220
const VIEWPORT_PAD = 40

/**
 * Compute a full SVG layout for an array of ConstellationGroups.
 * Groups are arranged in a grid of CLUSTER_COLS columns.
 */
export function computeLayout(groups: ConstellationGroup[]): ConstellationLayout {
  if (groups.length === 0) {
    return {
      groups: [],
      viewBox: { width: 400, height: 200 },
    }
  }

  const cols = CLUSTER_COLS
  const rows = Math.ceil(groups.length / cols)

  const width = cols * CLUSTER_PAD_X + VIEWPORT_PAD * 2
  const height = rows * CLUSTER_PAD_Y + VIEWPORT_PAD * 2

  const groupLayouts: GroupLayout[] = groups.map((group, idx) => {
    const col = idx % cols
    const row = Math.floor(idx / cols)

    const centerX = VIEWPORT_PAD + col * CLUSTER_PAD_X + CLUSTER_PAD_X / 2
    const centerY = VIEWPORT_PAD + row * CLUSTER_PAD_Y + CENTER_RADIUS + 20

    const subagentLayouts: SubAgentLayout[] = group.subagents.map((sa, saIdx) => {
      const total = group.subagents.length
      const angle = total === 1 ? 0 : (2 * Math.PI * saIdx) / total - Math.PI / 2
      const x = centerX + ORBIT_RADIUS * Math.cos(angle)
      const y = centerY + ORBIT_RADIUS * Math.sin(angle)

      return {
        ...sa,
        x,
        y,
        r: subagentRadius(sa.tokens),
        color: statusColor(sa.status),
      }
    })

    return {
      ownerAgent: group.ownerAgent,
      centerEmoji: group.centerEmoji,
      centerX,
      centerY,
      subagents: subagentLayouts,
    }
  })

  return {
    groups: groupLayouts,
    viewBox: { width, height },
  }
}

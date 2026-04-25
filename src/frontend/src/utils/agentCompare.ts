// ---------------------------------------------------------------------------
// agentCompare.ts — Build a side-by-side comparison between two agents
// ---------------------------------------------------------------------------

export interface CompareAgentLike {
  id: string
  model?: string
  status?: string
  lastActivity?: string
  costs?: { month?: number; total?: number; today?: number }
  tokens?: { total?: number; input?: number; output?: number }
  currentTask?: { task?: string }
}

export type Direction = 'lower-is-better' | 'higher-is-better'

export interface ComparisonRow {
  label: string
  valueA: number | string | null
  valueB: number | string | null
  winner: 'A' | 'B' | 'tie' | 'na'
  direction: Direction | 'none'
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function decideWinner(
  a: number | null,
  b: number | null,
  dir: Direction,
): 'A' | 'B' | 'tie' | 'na' {
  if (a === null && b === null) return 'na'
  if (a === null) return 'B'
  if (b === null) return 'A'
  if (a === b) return 'tie'
  if (dir === 'lower-is-better') return a < b ? 'A' : 'B'
  return a > b ? 'A' : 'B'
}

export function buildComparison(
  a: CompareAgentLike,
  b: CompareAgentLike,
): ComparisonRow[] {
  const rows: ComparisonRow[] = []

  const addNumeric = (
    label: string,
    getA: number | null,
    getB: number | null,
    dir: Direction,
  ) => {
    rows.push({
      label,
      valueA: getA,
      valueB: getB,
      winner: decideWinner(getA, getB, dir),
      direction: dir,
    })
  }

  const addInfo = (label: string, va: string | null, vb: string | null) => {
    rows.push({ label, valueA: va, valueB: vb, winner: 'na', direction: 'none' })
  }

  addInfo('Model', a.model ?? null, b.model ?? null)
  addInfo('Status', a.status ?? null, b.status ?? null)
  addInfo('Last Activity', a.lastActivity ?? null, b.lastActivity ?? null)
  addNumeric('Cost (month)', num(a.costs?.month), num(b.costs?.month), 'lower-is-better')
  addNumeric('Cost (total)', num(a.costs?.total), num(b.costs?.total), 'lower-is-better')
  addNumeric('Tokens (total)', num(a.tokens?.total), num(b.tokens?.total), 'higher-is-better')
  addNumeric('Tokens (input)', num(a.tokens?.input), num(b.tokens?.input), 'higher-is-better')
  addNumeric('Tokens (output)', num(a.tokens?.output), num(b.tokens?.output), 'higher-is-better')

  return rows
}

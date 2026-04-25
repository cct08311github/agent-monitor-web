export interface CronFireResult {
  times: Date[]
  supported: boolean
}

// Domain definitions for each cron field
interface Domain {
  min: number
  max: number
}

const DOMAINS: [Domain, Domain, Domain, Domain, Domain] = [
  { min: 0, max: 59 }, // minute
  { min: 0, max: 23 }, // hour
  { min: 1, max: 31 }, // day-of-month
  { min: 1, max: 12 }, // month
  { min: 0, max: 6 },  // day-of-week
]

// Normalize @-shortcut expressions to standard 5-field expressions
function normalizeShortcut(expr: string): string {
  const lower = expr.trim().toLowerCase()
  const shortcuts: Record<string, string> = {
    '@hourly': '0 * * * *',
    '@daily': '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@weekly': '0 0 * * 0',
    '@monthly': '0 0 1 * *',
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
  }
  return shortcuts[lower] ?? expr
}

/**
 * Parse a single cron field token into a Set of allowed values.
 * Supported:
 *   - `*`   → all values in domain
 *   - `N`   → literal integer (singleton)
 *   - `*\/N` → step of N within domain (only if domain size is divisible by N or can be cleanly stepped)
 * Returns null if the token is unsupported (list, range, non-parseable step).
 */
function parseField(token: string, domain: Domain): Set<number> | null {
  const { min, max } = domain

  if (token === '*') {
    const result = new Set<number>()
    for (let v = min; v <= max; v++) result.add(v)
    return result
  }

  // */N step
  const stepMatch = token.match(/^\*\/(\d+)$/)
  if (stepMatch) {
    const n = parseInt(stepMatch[1], 10)
    if (n <= 0) return null
    const result = new Set<number>()
    for (let v = min; v <= max; v += n) result.add(v)
    if (result.size === 0) return null
    return result
  }

  // Reject lists (comma) and ranges (dash in non-numeric context)
  if (token.includes(',') || token.includes('-')) return null

  // Reject other @ not already normalized
  if (token.startsWith('@')) return null

  // Literal integer
  if (/^\d+$/.test(token)) {
    const n = parseInt(token, 10)
    // day-of-week: treat 7 as 0
    const adjusted = domain === DOMAINS[4] && n === 7 ? 0 : n
    if (adjusted < min || adjusted > max) return null
    return new Set([adjusted])
  }

  return null
}

/**
 * Compute the next `count` fire times for a cron expression, starting after `from`.
 *
 * Supports:
 *   - `*` (wildcard) in any field
 *   - `*\/N` step expressions
 *   - Literal integer values
 *   - @-shortcuts: @hourly, @daily, @midnight, @weekly, @monthly, @yearly, @annually
 *
 * Returns `{ supported: false, times: [] }` for:
 *   - List expressions (`,`)
 *   - Range expressions (`-`)
 *   - Invalid or unrecognized expressions
 *   - Expressions with unsupported `@` shortcuts
 */
export function nextFireTimes(
  expr: string,
  count: number,
  from: Date = new Date(),
): CronFireResult {
  if (!expr || typeof expr !== 'string') {
    return { supported: false, times: [] }
  }

  const normalized = normalizeShortcut(expr.trim())

  // Reject any remaining @-shortcuts we didn't recognize
  if (normalized.includes('@')) {
    return { supported: false, times: [] }
  }

  const parts = normalized.trim().split(/\s+/)
  if (parts.length !== 5) {
    return { supported: false, times: [] }
  }

  const [minTok, hourTok, domTok, monTok, dowTok] = parts
  const rawDowTok = dowTok

  // Parse each field
  const minuteSet = parseField(minTok, DOMAINS[0])
  const hourSet = parseField(hourTok, DOMAINS[1])
  const domSet = parseField(domTok, DOMAINS[2])
  const monSet = parseField(monTok, DOMAINS[3])
  // Normalize dow 7 → 0 inside parseField already
  const dowSet = parseField(rawDowTok === '7' ? '0' : rawDowTok, DOMAINS[4])

  if (!minuteSet || !hourSet || !domSet || !monSet || !dowSet) {
    return { supported: false, times: [] }
  }

  const domIsWild = domTok === '*'
  const dowIsWild = rawDowTok === '*'

  // Walk minute-by-minute up to 366 days (covers annual expressions)
  const MAX_MINUTES = 366 * 24 * 60
  const result: Date[] = []

  // Start from the next minute after `from`
  const start = new Date(from)
  start.setSeconds(0, 0)
  start.setMinutes(start.getMinutes() + 1)

  const candidate = new Date(start)

  for (let i = 0; i < MAX_MINUTES && result.length < count; i++) {
    const min = candidate.getMinutes()
    const hour = candidate.getHours()
    const dom = candidate.getDate()
    const mon = candidate.getMonth() + 1 // JS months are 0-based
    const dow = candidate.getDay()

    if (
      minuteSet.has(min) &&
      hourSet.has(hour) &&
      monSet.has(mon) &&
      matchDayField(dom, dow, domIsWild, dowIsWild, domSet, dowSet)
    ) {
      result.push(new Date(candidate))
    }

    // Advance by 1 minute
    candidate.setMinutes(candidate.getMinutes() + 1)
  }

  if (result.length < count && result.length === 0) {
    // No results found within 65 days — still technically supported but empty
    return { supported: true, times: [] }
  }

  return { supported: true, times: result }
}

/**
 * Determine if a candidate (dom, dow) matches given Vixie cron OR semantics:
 *   - Both wild (`* * * * *` style) → always pass
 *   - Only domIsWild → only dow gates
 *   - Only dowIsWild → only dom gates
 *   - Neither wild → OR: fire if dom OR dow matches
 */
function matchDayField(
  dom: number,
  dow: number,
  domIsWild: boolean,
  dowIsWild: boolean,
  domSet: Set<number>,
  dowSet: Set<number>,
): boolean {
  if (domIsWild && dowIsWild) return true
  if (domIsWild) return dowSet.has(dow)
  if (dowIsWild) return domSet.has(dom)
  // Both specified: Vixie cron OR semantics
  return domSet.has(dom) || dowSet.has(dow)
}

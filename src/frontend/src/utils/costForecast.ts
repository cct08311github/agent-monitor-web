// ---------------------------------------------------------------------------
// costForecast.ts — Linear regression cost forecasting utility
// ---------------------------------------------------------------------------

export interface CostPoint {
  ts: string
  total_cost: number
}

export interface DailyCost {
  date: string // YYYY-MM-DD (local)
  cost: number
}

export interface RegressionResult {
  slope: number      // cost change per day index
  intercept: number
  rSquared: number   // 0..1
}

export interface Forecast {
  next7d_total: number
  next30d_total: number
  trend: 'up' | 'flat' | 'down'
  slope_per_day: number
  confidence: 'low' | 'medium' | 'high'
  basis_days: number
  daily: DailyCost[]    // historical daily data
  mean_daily_cost: number
}

/**
 * Format a Date to local YYYY-MM-DD string.
 */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Group CostPoint[] by local YYYY-MM-DD, sum total_cost per day,
 * sort ascending, and return the most recent 14 days relative to today.
 */
export function aggregateDaily(history: CostPoint[]): DailyCost[] {
  const map = new Map<string, number>()

  for (const point of history) {
    const ts = new Date(point.ts)
    if (isNaN(ts.getTime())) continue
    const dateKey = toLocalDateString(ts)
    map.set(dateKey, (map.get(dateKey) ?? 0) + (point.total_cost ?? 0))
  }

  // Sort all keys ascending
  const sorted = Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, cost]) => ({ date, cost }))

  // Take only dates within the last 14 days (inclusive today)
  const today = toLocalDateString(new Date())
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 13)
  const cutoffStr = toLocalDateString(cutoff)

  return sorted.filter((d) => d.date >= cutoffStr && d.date <= today)
}

/**
 * Compute ordinary least-squares linear regression.
 * x = 0..N-1, y = values
 * Returns slope=0, intercept=mean, rSquared=0 for N < 2.
 */
export function linearRegression(values: number[]): RegressionResult {
  const n = values.length
  if (n < 2) {
    const mean = n === 1 ? values[0] : 0
    return { slope: 0, intercept: mean, rSquared: 0 }
  }

  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumX2 = 0

  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += values[i]
    sumXY += i * values[i]
    sumX2 += i * i
  }

  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) {
    const mean = sumY / n
    return { slope: 0, intercept: mean, rSquared: 0 }
  }

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  const meanY = sumY / n

  // Compute rSquared from residuals
  let ssTot = 0
  let ssRes = 0
  for (let i = 0; i < n; i++) {
    ssTot += (values[i] - meanY) ** 2
    const predicted = intercept + slope * i
    ssRes += (values[i] - predicted) ** 2
  }

  const rSquared = ssTot === 0 ? 0 : Math.max(0, Math.min(1, 1 - ssRes / ssTot))

  return { slope, intercept, rSquared }
}

/**
 * Build a Forecast from raw CostPoint history.
 * Prediction values are clamped to >= 0.
 */
export function buildForecast(history: CostPoint[]): Forecast {
  const daily = aggregateDaily(history)
  const n = daily.length
  const values = daily.map((d) => d.cost)
  const mean = n > 0 ? values.reduce((s, v) => s + v, 0) / n : 0
  const reg = linearRegression(values)

  // Predict days N..N+6 (next 7 days)
  let next7 = 0
  for (let i = 0; i < 7; i++) {
    next7 += Math.max(0, reg.intercept + reg.slope * (n + i))
  }

  // Predict days N..N+29 (next 30 days)
  let next30 = 0
  for (let i = 0; i < 30; i++) {
    next30 += Math.max(0, reg.intercept + reg.slope * (n + i))
  }

  // Determine trend based on slope relative to mean
  const flatThreshold = mean * 0.005  // 0.5% of mean per day
  let trend: 'up' | 'flat' | 'down'
  if (Math.abs(reg.slope) < flatThreshold) {
    trend = 'flat'
  } else if (reg.slope > 0) {
    trend = 'up'
  } else {
    trend = 'down'
  }

  // Confidence based on data quantity and fit quality
  let confidence: 'low' | 'medium' | 'high'
  if (n < 7) {
    confidence = 'low'
  } else if (reg.rSquared > 0.5) {
    confidence = 'high'
  } else {
    confidence = 'medium'
  }

  return {
    next7d_total: next7,
    next30d_total: next30,
    trend,
    slope_per_day: reg.slope,
    confidence,
    basis_days: n,
    daily,
    mean_daily_cost: mean,
  }
}

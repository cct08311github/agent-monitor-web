export type FreshnessLevel = 'loading' | 'fresh' | 'warning' | 'stale'

/** Classify age (in seconds) into freshness level. Null age = never loaded. */
export function computeFreshness(ageSeconds: number | null): FreshnessLevel {
  if (ageSeconds === null) return 'loading'
  if (ageSeconds < 30) return 'fresh'
  if (ageSeconds < 60) return 'warning'
  return 'stale'
}

/** Human-readable label for each freshness level. */
export function formatFreshnessLabel(level: FreshnessLevel, ageSeconds: number | null): string {
  switch (level) {
    case 'loading':
      return '載入中...'
    case 'fresh':
      return `已更新 ${ageSeconds ?? 0}s 前`
    case 'warning':
      return `⚠ 資料延遲 ${ageSeconds ?? 0}s`
    case 'stale':
      return `⚠ 資料可能過期 (${ageSeconds ?? 0}s)`
  }
}

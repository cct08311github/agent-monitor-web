export interface TimelineJob {
  id: string
  name: string
  nextRun?: number
  enabled?: boolean
}

export interface TimelineMarker {
  id: string
  name: string
  hourOffset: number // 0..24
  isOverdue: boolean
  ts: number
}

const WINDOW_HOURS = 24
const HOUR_MS = 3_600_000

export function buildMarkers(jobs: TimelineJob[], now: number): TimelineMarker[] {
  const cutoff = now + WINDOW_HOURS * HOUR_MS
  const out: TimelineMarker[] = []
  for (const j of jobs) {
    if (!j.enabled) continue
    if (typeof j.nextRun !== 'number' || !Number.isFinite(j.nextRun)) continue
    const ts = j.nextRun
    if (ts > cutoff) continue
    if (ts < now) {
      out.push({ id: j.id, name: j.name, hourOffset: 0, isOverdue: true, ts })
    } else {
      const offset = (ts - now) / HOUR_MS
      out.push({ id: j.id, name: j.name, hourOffset: Math.min(WINDOW_HOURS, Math.max(0, offset)), isOverdue: false, ts })
    }
  }
  return out.sort((a, b) => a.ts - b.ts)
}

export function formatRelative(ms: number): string {
  if (ms < 0) {
    const m = Math.floor(-ms / 60_000)
    return m === 0 ? '剛過' : `逾期 ${m} 分鐘`
  }
  if (ms < 60_000) return '即將執行'
  const totalMin = Math.floor(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m} 分後`
  return `${h} 小時 ${m} 分後`
}

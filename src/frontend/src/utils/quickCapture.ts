/**
 * quickCapture.ts — localStorage-backed utility for quick idea capture.
 *
 * Persists up to MAX=100 captures, newest first.
 * All operations are pure functions operating on localStorage; no Vue reactivity here.
 */

const KEY = 'oc_quick_captures'
const MAX = 100

export interface Capture {
  id: string
  body: string
  context: string
  createdAt: number
}

function isValid(o: unknown): o is Capture {
  if (!o || typeof o !== 'object') return false
  const r = o as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.body === 'string' &&
    typeof r.context === 'string' &&
    typeof r.createdAt === 'number'
  )
}

export function loadCaptures(): Capture[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as unknown[]).filter(isValid) : []
  } catch {
    return []
  }
}

function saveAll(list: ReadonlyArray<Capture>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Silent — quota or private browsing
  }
}

export function generateId(now: number = Date.now()): string {
  return `qc_${now}_${Math.random().toString(36).slice(2, 8)}`
}

export function addCapture(body: string, context: string, now: number = Date.now()): Capture {
  const c: Capture = { id: generateId(now), body, context, createdAt: now }
  const all = loadCaptures()
  // Newest first; cap to MAX
  const next = [c, ...all].slice(0, MAX)
  saveAll(next)
  return c
}

export function deleteCapture(id: string): void {
  const next = loadCaptures().filter((c) => c.id !== id)
  saveAll(next)
}

export function updateCapture(id: string, body: string): Capture | null {
  const all = loadCaptures()
  const idx = all.findIndex((c) => c.id === id)
  if (idx < 0) return null
  const updated: Capture = { ...all[idx]!, body }
  const next = [...all.slice(0, idx), updated, ...all.slice(idx + 1)]
  saveAll(next)
  return updated
}

export function clearCaptures(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Silent
  }
}

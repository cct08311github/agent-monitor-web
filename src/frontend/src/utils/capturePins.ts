// ---------------------------------------------------------------------------
// capturePins.ts — per-capture pin state, persisted to localStorage.
// Mirrors the sessionBookmarks design: loadPins / savePins / togglePin /
// isPinned / partition.  Pinned captures float to the top of the active list.
// ---------------------------------------------------------------------------

const KEY = 'oc_capture_pinned'

export function loadPins(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : []
  } catch {
    return []
  }
}

export function savePins(pins: ReadonlyArray<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(pins))
  } catch {
    /* silent */
  }
}

export function togglePin(id: string): string[] {
  const cur = loadPins()
  const idx = cur.indexOf(id)
  const next = idx >= 0 ? cur.filter((p) => p !== id) : [...cur, id]
  savePins(next)
  return next
}

export function isPinned(pins: ReadonlyArray<string>, id: string): boolean {
  return pins.includes(id)
}

export interface PartitionResult<T> {
  pinned: T[]
  rest: T[]
}

export function partition<T extends { id: string }>(
  items: ReadonlyArray<T>,
  pins: ReadonlyArray<string>,
): PartitionResult<T> {
  const pinSet = new Set(pins)
  const pinned: T[] = []
  const rest: T[] = []
  for (const it of items) {
    if (pinSet.has(it.id)) pinned.push(it)
    else rest.push(it)
  }
  // Preserve pin-click order in pinned region
  pinned.sort((a, b) => pins.indexOf(a.id) - pins.indexOf(b.id))
  return { pinned, rest }
}

const KEY = 'oc_agent_order'

export function loadOrder(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : []
  } catch {
    return []
  }
}

export function saveOrder(ids: ReadonlyArray<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids))
  } catch {
    // silent — localStorage may be unavailable (e.g. private browsing quota)
  }
}

export function clearOrder(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // silent
  }
}

export function reorder(
  currentIds: ReadonlyArray<string>,
  dragId: string,
  dropId: string,
): string[] {
  if (dragId === dropId) return [...currentIds]
  const dragIdx = currentIds.indexOf(dragId)
  const dropIdx = currentIds.indexOf(dropId)
  if (dragIdx < 0 || dropIdx < 0) return [...currentIds]
  // remove dragId, then insert before dropId
  const without = currentIds.filter((id) => id !== dragId)
  const insertAt = without.indexOf(dropId)
  return [...without.slice(0, insertAt), dragId, ...without.slice(insertAt)]
}

export function applyOrder<T extends { id: string }>(
  items: ReadonlyArray<T>,
  order: ReadonlyArray<string>,
): T[] {
  const byId = new Map(items.map((it) => [it.id, it]))
  const ordered: T[] = []
  const seen = new Set<string>()
  for (const id of order) {
    const it = byId.get(id)
    if (it && !seen.has(id)) {
      ordered.push(it)
      seen.add(id)
    }
  }
  // append items not present in saved order (new agents appear at end)
  for (const it of items) {
    if (!seen.has(it.id)) ordered.push(it)
  }
  return ordered
}

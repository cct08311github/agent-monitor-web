// ---------------------------------------------------------------------------
// commandHistory.ts — CommandPalette recents, persisted to localStorage.
// Mirrors the design language of sessionBookmarks.ts.
// ---------------------------------------------------------------------------

const KEY = 'oc_command_history'
const MAX = 10

export function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : []
  } catch {
    return []
  }
}

export function saveHistory(history: ReadonlyArray<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(history))
  } catch {
    /* silent */
  }
}

export function recordCommand(commandId: string): string[] {
  const current = loadHistory()
  const without = current.filter((id) => id !== commandId) // dedupe
  const next = [commandId, ...without].slice(0, MAX)
  saveHistory(next)
  return next
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* silent */
  }
}

export function pickRecents<T extends { id: string }>(
  commands: ReadonlyArray<T>,
  history: ReadonlyArray<string>,
): T[] {
  const byId = new Map(commands.map((c) => [c.id, c]))
  return history.map((id) => byId.get(id)).filter((c): c is T => c !== undefined)
}

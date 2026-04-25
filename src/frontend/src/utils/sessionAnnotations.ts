export interface SessionAnnotation {
  msgIndex: number
  note: string
  ts: number
}

const KEY_PREFIX = 'oc_session_notes:'

function key(agentId: string, sessionId: string): string {
  return `${KEY_PREFIX}${agentId}:${sessionId}`
}

export function loadAnnotations(agentId: string, sessionId: string): SessionAnnotation[] {
  try {
    const raw = localStorage.getItem(key(agentId, sessionId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persist(agentId: string, sessionId: string, items: SessionAnnotation[]): void {
  try {
    localStorage.setItem(key(agentId, sessionId), JSON.stringify(items))
  } catch {
    /* silent */
  }
}

export function saveAnnotation(
  agentId: string,
  sessionId: string,
  msgIndex: number,
  note: string,
): SessionAnnotation[] {
  const items = loadAnnotations(agentId, sessionId)
  const idx = items.findIndex(a => a.msgIndex === msgIndex)
  const trimmed = note.trim()
  if (!trimmed) {
    // empty = remove
    if (idx >= 0) items.splice(idx, 1)
  } else {
    const entry: SessionAnnotation = { msgIndex, note: trimmed, ts: Date.now() }
    if (idx >= 0) items[idx] = entry
    else items.push(entry)
  }
  persist(agentId, sessionId, items)
  return items
}

export function removeAnnotation(agentId: string, sessionId: string, msgIndex: number): SessionAnnotation[] {
  return saveAnnotation(agentId, sessionId, msgIndex, '')
}

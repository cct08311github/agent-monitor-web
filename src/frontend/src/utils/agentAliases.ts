// ---------------------------------------------------------------------------
// agentAliases.ts — per-agent display name aliases, persisted to localStorage.
// Key format mirrors sessionBookmarks: oc_agent_alias:<agentId>
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'oc_agent_alias:'
const ALL_KEY_REGEX = /^oc_agent_alias:(.+)$/

function key(agentId: string): string {
  return `${KEY_PREFIX}${agentId}`
}

export function loadAlias(agentId: string): string | null {
  try {
    const v = localStorage.getItem(key(agentId))
    return v && v.trim() ? v : null
  } catch {
    return null
  }
}

export function saveAlias(agentId: string, alias: string): void {
  try {
    const trimmed = alias.trim()
    if (!trimmed) {
      localStorage.removeItem(key(agentId))
    } else {
      localStorage.setItem(key(agentId), trimmed)
    }
  } catch {
    /* silent */
  }
}

export function clearAlias(agentId: string): void {
  try {
    localStorage.removeItem(key(agentId))
  } catch {
    /* silent */
  }
}

export function loadAllAliases(): Map<string, string> {
  const out = new Map<string, string>()
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      const m = ALL_KEY_REGEX.exec(k)
      if (!m) continue
      const v = localStorage.getItem(k)
      if (v && v.trim()) out.set(m[1], v)
    }
  } catch {
    /* silent */
  }
  return out
}

export function displayAgentName(
  agentId: string,
  alias?: string | null,
  fallbackName?: string | null,
): string {
  if (alias && alias.trim()) return alias.trim()
  if (fallbackName && fallbackName.trim()) return fallbackName.trim()
  return agentId
}

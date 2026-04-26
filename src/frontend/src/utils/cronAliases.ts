// ---------------------------------------------------------------------------
// cronAliases.ts — per-cron-job display name aliases, persisted to localStorage.
// Key format mirrors agentAliases: oc_cron_alias:<jobId>
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'oc_cron_alias:'
const ALL_KEY_REGEX = /^oc_cron_alias:(.+)$/

function key(jobId: string): string {
  return `${KEY_PREFIX}${jobId}`
}

export function loadCronAlias(jobId: string): string | null {
  try {
    const v = localStorage.getItem(key(jobId))
    return v && v.trim() ? v : null
  } catch {
    return null
  }
}

export function saveCronAlias(jobId: string, alias: string): void {
  try {
    const trimmed = alias.trim()
    if (!trimmed) {
      localStorage.removeItem(key(jobId))
    } else {
      localStorage.setItem(key(jobId), trimmed)
    }
  } catch {
    /* silent */
  }
}

export function clearCronAlias(jobId: string): void {
  try {
    localStorage.removeItem(key(jobId))
  } catch {
    /* silent */
  }
}

export function loadAllCronAliases(): Map<string, string> {
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

export function displayCronJobName(
  jobId: string,
  alias?: string | null,
  fallbackName?: string | null,
): string {
  if (alias && alias.trim()) return alias.trim()
  if (fallbackName && fallbackName.trim()) return fallbackName.trim()
  return jobId
}

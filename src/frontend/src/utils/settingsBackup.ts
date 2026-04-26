// ---------------------------------------------------------------------------
// settingsBackup.ts — export/import/reset all oc_* localStorage settings.
//
// Security boundary: only keys with the 'oc_' prefix are ever read, written,
// or cleared. Non-oc_ keys are silently ignored during restore.
// ---------------------------------------------------------------------------

const PREFIX = 'oc_'

export interface SettingsBackup {
  version: '1'
  exportedAt: number
  settings: Record<string, string>
}

// ---------------------------------------------------------------------------
// Collect
// ---------------------------------------------------------------------------

/** Returns all oc_* localStorage entries as a plain key→value map. */
export function collectSettings(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(PREFIX)) continue
      const val = localStorage.getItem(key)
      if (val !== null) out[key] = val
    }
  } catch {
    // silent — e.g. security error in restrictive environments
  }
  return out
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/** Builds a versioned SettingsBackup object from current localStorage state. */
export function buildBackup(now: number = Date.now()): SettingsBackup {
  return {
    version: '1',
    exportedAt: now,
    settings: collectSettings(),
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Returns a filename and JSON string ready for download.
 * Injectable `now` parameter makes the function testable without mocking Date.
 */
export function exportAsJson(now: Date = new Date()): { filename: string; content: string } {
  const backup = buildBackup(now.getTime())
  return {
    filename: `agent-monitor-settings-${dateOnly(now)}.json`,
    content: JSON.stringify(backup, null, 2),
  }
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/**
 * Parses a JSON string into a SettingsBackup.
 * Returns null if the JSON is malformed or fails schema validation.
 */
export function parseBackup(json: string): SettingsBackup | null {
  try {
    const parsed = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object') return null
    const r = parsed as Record<string, unknown>
    if (r.version !== '1') return null
    if (typeof r.exportedAt !== 'number') return null
    if (!r.settings || typeof r.settings !== 'object') return null
    const settings: Record<string, string> = {}
    for (const [k, v] of Object.entries(r.settings as Record<string, unknown>)) {
      // Only accept string key→string value pairs (filter non-string values)
      if (typeof k === 'string' && typeof v === 'string') settings[k] = v
    }
    return { version: '1', exportedAt: r.exportedAt as number, settings }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

/**
 * Clears existing oc_* keys then writes keys from backup.
 * Non-oc_ keys in the backup are silently ignored (security boundary).
 * Returns the count of restored keys.
 */
export function restoreSettings(backup: SettingsBackup): number {
  let count = 0
  try {
    // Remove current oc_* keys first to avoid stale entries
    const existing = collectSettings()
    for (const k of Object.keys(existing)) {
      localStorage.removeItem(k)
    }
    // Apply backup — only oc_* keys allowed
    for (const [key, value] of Object.entries(backup.settings)) {
      if (!key.startsWith(PREFIX)) continue
      localStorage.setItem(key, value)
      count++
    }
  } catch {
    // silent
  }
  return count
}

// ---------------------------------------------------------------------------
// Clear
// ---------------------------------------------------------------------------

/**
 * Removes all oc_* localStorage keys.
 * Non-oc_ keys are untouched.
 * Returns the count of cleared keys.
 */
export function clearAllSettings(): number {
  let count = 0
  try {
    const existing = collectSettings()
    for (const k of Object.keys(existing)) {
      localStorage.removeItem(k)
      count++
    }
  } catch {
    // silent
  }
  return count
}

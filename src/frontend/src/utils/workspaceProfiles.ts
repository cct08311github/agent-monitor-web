// ---------------------------------------------------------------------------
// workspaceProfiles — localStorage persistence for named workspace profiles
//
// A profile bundles 4 personalization settings into a named snapshot:
//   themeMode, palette, timezoneMode, soundEnabled
//
// Key: 'oc_workspace_profiles'
// ---------------------------------------------------------------------------

export type WorkspaceThemeMode = 'light' | 'dark' | 'auto' | 'neon' | 'retro'
export type WorkspacePalette = 'default' | 'cb-safe'
export type WorkspaceTimezoneMode = 'local' | 'utc'

export interface WorkspaceProfile {
  id: string
  name: string
  themeMode: WorkspaceThemeMode
  palette: WorkspacePalette
  timezoneMode: WorkspaceTimezoneMode
  soundEnabled: boolean
  createdAt: number
}

export interface ProfileStore {
  profiles: WorkspaceProfile[]
  activeId: string | null
}

const KEY = 'oc_workspace_profiles'

const EMPTY_STORE: ProfileStore = { profiles: [], activeId: null }

const VALID_THEMES: ReadonlySet<WorkspaceThemeMode> = new Set(['light', 'dark', 'auto', 'neon', 'retro'])
const VALID_PALETTES: ReadonlySet<WorkspacePalette> = new Set(['default', 'cb-safe'])
const VALID_TZ_MODES: ReadonlySet<WorkspaceTimezoneMode> = new Set(['local', 'utc'])

export function isValidProfile(o: unknown): o is WorkspaceProfile {
  if (!o || typeof o !== 'object') return false
  const r = o as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.themeMode === 'string' &&
    VALID_THEMES.has(r.themeMode as WorkspaceThemeMode) &&
    typeof r.palette === 'string' &&
    VALID_PALETTES.has(r.palette as WorkspacePalette) &&
    typeof r.timezoneMode === 'string' &&
    VALID_TZ_MODES.has(r.timezoneMode as WorkspaceTimezoneMode) &&
    typeof r.soundEnabled === 'boolean' &&
    typeof r.createdAt === 'number'
  )
}

export function loadStore(): ProfileStore {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...EMPTY_STORE }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_STORE }
    const p = parsed as Record<string, unknown>
    const profiles: WorkspaceProfile[] = Array.isArray(p.profiles)
      ? (p.profiles as unknown[]).filter(isValidProfile)
      : []
    const activeId: string | null =
      typeof p.activeId === 'string' && profiles.some((prof) => prof.id === p.activeId)
        ? p.activeId
        : null
    return { profiles, activeId }
  } catch {
    return { ...EMPTY_STORE }
  }
}

export function saveStore(s: ProfileStore): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // silent — non-critical
  }
}

export function generateId(now: number = Date.now()): string {
  return `wp_${now}_${Math.random().toString(36).slice(2, 8)}`
}

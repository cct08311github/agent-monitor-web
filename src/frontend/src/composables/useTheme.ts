// ---------------------------------------------------------------------------
// useTheme — Theme switcher composable ported from theme-manager.js
//
// Supports 5 modes:
//   'light'  — always light (Warm Stone)
//   'dark'   — always dark (Neutral Dark)
//   'auto'   — follows OS/browser preference (prefers-color-scheme)
//   'neon'   — Cyber-punk: black base + neon green/purple accent
//   'retro'  — 80s terminal: warm paper base + dark red accent + monospace
//
// Cycle order: light → dark → auto → neon → retro
// Persists to localStorage under key 'oc_theme'.
// Applies theme via data-theme attribute on <html>.
// Updates <meta name="theme-color"> for mobile browsers.
// ---------------------------------------------------------------------------

import { shallowRef, computed, watchEffect, triggerRef, onMounted, onUnmounted } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'auto' | 'neon' | 'retro'

const STORAGE_KEY = 'oc_theme'
// Cycle: light → dark → auto → neon → retro
const CYCLE_ORDER: ThemeMode[] = ['light', 'dark', 'auto', 'neon', 'retro']

/** meta theme-color per resolved theme (used by mobile browser chrome) */
const THEME_COLORS: Record<'light' | 'dark' | 'neon' | 'retro', string> = {
  light: '#f4f7fb',
  dark: '#0f172a',
  neon: '#0a0014',
  retro: '#f4ecd8',
}

// ---------------------------------------------------------------------------
// Module-level singletons (shared across all composable instances)
// ---------------------------------------------------------------------------

function loadStoredTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'auto'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'auto' || stored === 'neon' || stored === 'retro')
    return stored
  return 'auto'
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false
}

// Singleton reactive refs — one instance across all usages
// shallowRef for primitive string — enables triggerRef() for OS preference changes
const currentTheme = shallowRef<ThemeMode>(loadStoredTheme())

// effectiveTheme: resolves what data-theme value to actually apply to the DOM.
// 'auto'  → derived from OS preference (light/dark)
// 'neon' / 'retro' → pass through directly (not mapped to light/dark)
const effectiveTheme = computed<'light' | 'dark' | 'neon' | 'retro'>(() => {
  if (currentTheme.value === 'auto') {
    return systemPrefersDark() ? 'dark' : 'light'
  }
  return currentTheme.value
})

// Apply theme to the DOM and persist whenever it changes
watchEffect(() => {
  if (typeof document === 'undefined') return
  const effective = effectiveTheme.value
  document.documentElement.setAttribute('data-theme', effective)
  updateThemeColor(effective)
  try {
    localStorage.setItem(STORAGE_KEY, currentTheme.value)
  } catch {
    // Ignore storage errors (private browsing, quota)
  }
})

function updateThemeColor(theme: 'light' | 'dark' | 'neon' | 'retro'): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = THEME_COLORS[theme]
}

// Respond to OS-level changes when in 'auto' mode
let _sysMediaQuery: MediaQueryList | null = null
let _sysChangeHandler: (() => void) | null = null

if (typeof window !== 'undefined') {
  _sysMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  _sysChangeHandler = () => {
    if (currentTheme.value === 'auto') {
      // triggerRef forces the computed to re-evaluate without toggling the value
      triggerRef(currentTheme)
    }
  }
  // Listener is managed by onMounted/onUnmounted — no module-scope registration
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

let _themeUsers = 0

export function useTheme() {
  onMounted(() => {
    // Re-attach system preference listener when first user mounts
    if (_themeUsers === 0 && _sysMediaQuery && _sysChangeHandler) {
      _sysMediaQuery.addEventListener('change', _sysChangeHandler)
    }
    _themeUsers++
  })

  onUnmounted(() => {
    _themeUsers--
    if (_themeUsers <= 0 && _sysMediaQuery && _sysChangeHandler) {
      _sysMediaQuery.removeEventListener('change', _sysChangeHandler)
      _themeUsers = 0
    }
  })

  /** Advance to the next theme in the cycle: light → dark → auto → light … */
  function cycleTheme(): void {
    const idx = CYCLE_ORDER.indexOf(currentTheme.value)
    currentTheme.value = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length]
  }

  /** Jump to a specific theme. */
  function setTheme(theme: ThemeMode): void {
    currentTheme.value = theme
  }

  return { currentTheme, effectiveTheme, cycleTheme, setTheme }
}

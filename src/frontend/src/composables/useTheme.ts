// ---------------------------------------------------------------------------
// useTheme — Theme switcher composable ported from theme-manager.js
//
// Supports 3 modes:
//   'light'  — always light
//   'dark'   — always dark
//   'auto'   — follows OS/browser preference (prefers-color-scheme)
//
// Cycle order: light → dark → auto  (matches original theme-manager.js)
// Persists to localStorage under key 'oc_theme'.
// Applies theme via data-theme attribute on <html>.
// Updates <meta name="theme-color"> for mobile browsers.
// ---------------------------------------------------------------------------

import { shallowRef, computed, watchEffect, triggerRef, onMounted, onUnmounted } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'auto'

const STORAGE_KEY = 'oc_theme'
// Cycle: light → dark → auto  (matches original theme-manager.js cycleTheme order)
const CYCLE_ORDER: ThemeMode[] = ['light', 'dark', 'auto']

const THEME_COLORS: Record<'light' | 'dark', string> = {
  light: '#f4f7fb',
  dark: '#0f172a',
}

// ---------------------------------------------------------------------------
// Module-level singletons (shared across all composable instances)
// ---------------------------------------------------------------------------

function loadStoredTheme(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'auto'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored
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

const effectiveTheme = computed<'light' | 'dark'>(() =>
  currentTheme.value === 'auto'
    ? systemPrefersDark()
      ? 'dark'
      : 'light'
    : currentTheme.value,
)

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

function updateThemeColor(theme: 'light' | 'dark'): void {
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

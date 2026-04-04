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

import { ref, computed, watchEffect, onUnmounted } from 'vue'

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
const currentTheme = ref<ThemeMode>(loadStoredTheme())

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
      // Force the computed to re-evaluate by briefly toggling — Vue tracks the
      // ref, not the MediaQueryList, so we write the same value to flush.
      const prev = currentTheme.value
      currentTheme.value = 'light' // temp
      currentTheme.value = prev
      // Directly apply so there's no single-frame flash
      document.documentElement.setAttribute('data-theme', effectiveTheme.value)
      updateThemeColor(effectiveTheme.value)
    }
  }
  _sysMediaQuery.addEventListener('change', _sysChangeHandler)
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useTheme() {
  // Clean up the global OS-preference listener when the last component using
  // useTheme unmounts.  In practice this is module-level, but we register it
  // inside onUnmounted so unit tests can clean up properly.
  onUnmounted(() => {
    // Only remove if both references are still intact (they always should be)
    if (_sysMediaQuery && _sysChangeHandler) {
      _sysMediaQuery.removeEventListener('change', _sysChangeHandler)
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

  return {
    currentTheme,
    effectiveTheme,
    cycleTheme,
    setTheme,
  }
}

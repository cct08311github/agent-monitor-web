// ---------------------------------------------------------------------------
// useNotificationBadge — browser tab title badge + favicon red dot
//
// When the tab is hidden (document.hidden) and new alerts arrive, this
// composable:
//   1. Prefixes document.title with "(N) " (capped at "9+")
//   2. Overlays a red dot on the favicon via Canvas
//
// When the tab becomes visible again both effects are cleared.
//
// Usage (App.vue onMounted):
//   installNotificationBadge()
//
// Usage (on new alert while tab is hidden):
//   const { increment } = useNotificationBadge()
//   increment()
//
// Usage (tests):
//   teardownNotificationBadge()
// ---------------------------------------------------------------------------

import { ref, watch } from 'vue'
import type { WatchStopHandle } from 'vue'
import { isQuietNow } from '@/composables/useQuietHours'
import { useDesktopNotify } from '@/composables/useDesktopNotify'

// ---------------------------------------------------------------------------
// Module-scoped state — shared across all useNotificationBadge() calls
// ---------------------------------------------------------------------------

const unreadCount = ref(0)
const baseTitle = ref('Agent Monitor')
const installed = ref(false)

/** Collected watcher stop functions, cleared on teardown */
const _stopHandles: WatchStopHandle[] = []

let _visibilityHandler: (() => void) | null = null
let _originalFaviconHref: string | null = null

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface NotificationBadgeApi {
  unreadCount: typeof unreadCount
  baseTitle: typeof baseTitle
  /** Increment the unread count and optionally send a desktop notification. */
  increment: (n?: number, alertMessage?: string) => void
  clear: () => void
  setBaseTitle: (t: string) => void
}

export function useNotificationBadge(): NotificationBadgeApi {
  return {
    unreadCount,
    baseTitle,
    increment: (n = 1, alertMessage?: string) => {
      if (typeof document !== 'undefined' && document.hidden && !isQuietNow()) {
        unreadCount.value += n
        // Also push an OS-level desktop notification when user has opted in
        useDesktopNotify().send(
          'Agent Monitor',
          alertMessage ?? '新警示已觸發',
        )
      }
    },
    clear: () => {
      unreadCount.value = 0
    },
    setBaseTitle: (t: string) => {
      baseTitle.value = t
    },
  }
}

// ---------------------------------------------------------------------------
// Pure helper — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Returns the title string with an optional badge prefix.
 * Cap is 9; anything higher displays as "9+".
 */
export function formatTitleBadge(count: number, base: string): string {
  if (count <= 0) return base
  if (count > 9) return `(9+) ${base}`
  return `(${count}) ${base}`
}

// ---------------------------------------------------------------------------
// Favicon dot — draws via Canvas and returns a data URL
// ---------------------------------------------------------------------------

/**
 * Loads the favicon image at `originalHref`, draws it on a 32x32 canvas,
 * then overlays a small filled circle at the top-right corner.
 * Returns the canvas as a data URL (PNG).
 *
 * If Canvas / Image is unavailable (e.g. happy-dom without canvas), rejects.
 */
export function drawFaviconWithDot(
  originalHref: string,
  dotColor = '#e53935',
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('document not available'))
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 32

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('Canvas 2D context not available'))
      return
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      // Draw the original favicon
      ctx.drawImage(img, 0, 0, 32, 32)

      // Overlay a red dot at top-right (center ~28,4 radius 5)
      ctx.beginPath()
      ctx.arc(26, 6, 6, 0, Math.PI * 2)
      ctx.fillStyle = dotColor
      ctx.fill()

      resolve(canvas.toDataURL('image/png'))
    }

    img.onerror = () => {
      reject(new Error(`Failed to load favicon: ${originalHref}`))
    }

    img.src = originalHref
  })
}

// ---------------------------------------------------------------------------
// Install / teardown
// ---------------------------------------------------------------------------

/**
 * Installs the badge system. Safe to call multiple times — subsequent calls
 * are no-ops until `teardownNotificationBadge` is called.
 */
export function installNotificationBadge(): void {
  if (installed.value) return
  if (typeof document === 'undefined') return

  installed.value = true

  // Capture the current document title as the base
  baseTitle.value = document.title || 'Agent Monitor'

  // --- Watch 1: unreadCount + baseTitle → document.title ---
  const titleStop = watch(
    [unreadCount, baseTitle],
    ([n, t]) => {
      document.title = formatTitleBadge(n as number, t as string)
    },
    { immediate: true },
  )
  _stopHandles.push(titleStop)

  // --- Watch 2: unreadCount → swap favicon ---
  const link = document.querySelector<HTMLLinkElement>("link[rel*='icon']")
  if (link) {
    _originalFaviconHref = link.href

    const faviconStop = watch(unreadCount, async (n) => {
      if (!link) return
      if (n > 0 && _originalFaviconHref) {
        try {
          link.href = await drawFaviconWithDot(_originalFaviconHref)
        } catch {
          // Canvas unavailable or image failed to load — skip favicon change
        }
      } else if (_originalFaviconHref) {
        link.href = _originalFaviconHref
      }
    })
    _stopHandles.push(faviconStop)
  }

  // --- visibilitychange: clear count when tab becomes visible ---
  _visibilityHandler = () => {
    if (!document.hidden) {
      unreadCount.value = 0
    }
  }
  document.addEventListener('visibilitychange', _visibilityHandler)
}

/**
 * Removes all watchers, event listeners and resets module state.
 * Primarily used in tests; can also be called on app teardown.
 */
export function teardownNotificationBadge(): void {
  // Stop all Vue watchers
  for (const stop of _stopHandles) {
    stop()
  }
  _stopHandles.length = 0

  // Remove visibility listener
  if (_visibilityHandler) {
    document.removeEventListener('visibilitychange', _visibilityHandler)
    _visibilityHandler = null
  }

  // Restore original favicon if present
  if (_originalFaviconHref) {
    const link = document.querySelector<HTMLLinkElement>("link[rel*='icon']")
    if (link) {
      link.href = _originalFaviconHref
    }
    _originalFaviconHref = null
  }

  // Reset reactive state
  installed.value = false
  unreadCount.value = 0
}

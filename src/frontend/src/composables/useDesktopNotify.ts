// ---------------------------------------------------------------------------
// useDesktopNotify — reactive composable wrapping the desktopNotify utils
//
// Single module-scoped shared state so all callers see the same enabled /
// permission values without prop-drilling.
//
// Usage:
//   const { enabled, permission, toggle, send, isUnsupported } = useDesktopNotify()
//
//   await toggle()    // request permission on first click, then flip enabled
//   send('Agent Monitor', 'CPU alert: 95%')
// ---------------------------------------------------------------------------

import { ref, computed } from 'vue'
import {
  getPermission,
  requestPermission,
  isEnabled,
  setEnabled,
  showNotification,
  type NotifyPermission,
} from '@/utils/desktopNotify'
import { isQuietNow } from '@/composables/useQuietHours'

// ---------------------------------------------------------------------------
// Module-scoped state — shared across all useDesktopNotify() calls
// ---------------------------------------------------------------------------

const enabled = ref(isEnabled())
const permission = ref<NotifyPermission>(getPermission())

// ---------------------------------------------------------------------------
// Public composable
// ---------------------------------------------------------------------------

export interface DesktopNotifyToggleResult {
  ok: boolean
  reason?: string
}

export function useDesktopNotify() {
  return {
    /** Whether desktop notifications are toggled on by the user */
    enabled,
    /** Current Notification API permission state */
    permission,
    /** True when the browser does not support the Notification API */
    isUnsupported: computed(() => permission.value === 'unsupported'),

    /**
     * Toggle desktop notifications on / off.
     * - If permission is 'default', requests it first.
     * - Returns { ok: true } on success, { ok: false, reason } on failure.
     */
    async toggle(): Promise<DesktopNotifyToggleResult> {
      if (permission.value === 'unsupported') return { ok: false, reason: 'unsupported' }
      if (permission.value === 'denied') return { ok: false, reason: 'denied' }

      if (permission.value === 'default') {
        const p = await requestPermission()
        permission.value = p
        if (p !== 'granted') return { ok: false, reason: p }
      }

      // permission is 'granted' — flip enabled state
      const next = !enabled.value
      enabled.value = next
      setEnabled(next)
      return { ok: true }
    },

    /**
     * Send an OS-level notification if all guards pass
     * (enabled + granted + tab hidden + not quiet hours).
     */
    send(title: string, body: string, opts?: NotificationOptions): Notification | null {
      return showNotification(
        title,
        body,
        {
          isHidden: () => typeof document !== 'undefined' && document.hidden,
          isQuiet: () => isQuietNow(),
        },
        opts,
      )
    },
  }
}

// ---------------------------------------------------------------------------
// Test helper — reset module state between tests
// ---------------------------------------------------------------------------

/** @internal — for tests only */
export function _resetDesktopNotifyState(): void {
  enabled.value = isEnabled()
  permission.value = getPermission()
}

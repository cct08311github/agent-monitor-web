// ---------------------------------------------------------------------------
// desktopNotify — Browser Notification API helpers
//
// Thin, side-effect-free utility layer.  All state reads come through here;
// Vue reactivity lives in useDesktopNotify composable.
//
// Guard chain for showNotification():
//   1. isEnabled()          — user explicitly opted in
//   2. getPermission()      — browser granted permission
//   3. isHidden()           — tab is in background
//   4. isQuiet()            — not in quiet hours
//   5. isSnoozedNow()       — not in ad-hoc snooze window (#584)
// ---------------------------------------------------------------------------

import { isSnoozedNow as isNotifySnoozed } from '@/utils/notifySnooze'

const KEY = 'oc_desktop_notify_enabled'

export type NotifyPermission = 'default' | 'granted' | 'denied' | 'unsupported'

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

export function getPermission(): NotifyPermission {
  if (typeof window === 'undefined') return 'unsupported'
  if (typeof Notification === 'undefined') return 'unsupported'
  const p = Notification.permission
  return p === 'granted' || p === 'denied' || p === 'default' ? p : 'default'
}

export async function requestPermission(): Promise<NotifyPermission> {
  if (getPermission() === 'unsupported') return 'unsupported'
  try {
    const result = await Notification.requestPermission()
    return result === 'granted' || result === 'denied' || result === 'default' ? result : 'default'
  } catch {
    return 'denied'
  }
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

export function isEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setEnabled(b: boolean): void {
  try {
    localStorage.setItem(KEY, b ? '1' : '0')
  } catch {
    /* silent — storage unavailable */
  }
}

// ---------------------------------------------------------------------------
// Show notification
// ---------------------------------------------------------------------------

export interface ShowNotificationGuards {
  isQuiet: () => boolean
  isHidden: () => boolean
}

export function showNotification(
  title: string,
  body: string,
  guards?: Partial<ShowNotificationGuards>,
  opts?: NotificationOptions,
): Notification | null {
  if (!isEnabled()) return null
  if (getPermission() !== 'granted') return null

  const isHidden = guards?.isHidden ?? (() => typeof document !== 'undefined' && document.hidden)
  if (!isHidden()) return null

  const isQuiet = guards?.isQuiet ?? (() => false)
  if (isQuiet()) return null

  // Guard 5: ad-hoc snooze (#584)
  if (isNotifySnoozed()) return null

  try {
    const notification = new Notification(title, { body, icon: '/favicon.ico', ...opts })
    notification.onclick = () => {
      try {
        window.focus()
      } catch {
        /* silent */
      }
      try {
        notification.close()
      } catch {
        /* silent */
      }
    }
    return notification
  } catch {
    return null
  }
}

import { reactive } from 'vue'
import type { DashboardPayload, Agent } from '@/types/api'

// ---------------------------------------------------------------------------
// localStorage helpers — keep error key persistence consistent with vanilla JS
// ---------------------------------------------------------------------------

function loadErrorKeys(key: string): Map<string, number> {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, number>
    return new Map(Object.entries(stored))
  } catch {
    return new Map()
  }
}

export function saveErrorKeys(key: string, map: Map<string, number>): void {
  try {
    localStorage.setItem(key, JSON.stringify(Object.fromEntries(map)))
  } catch {
    // Ignore storage quota / private-browsing errors
  }
}

// ---------------------------------------------------------------------------
// Reactive global state — replaces window.appState from vanilla state.js
// ---------------------------------------------------------------------------

export const appState = reactive({
  currentExchangeRate: 32.0,
  latestDashboard: null as DashboardPayload | null,
  /** Snapshot of the previous SSE frame keyed by agent id, used for diff rendering */
  previousAgentsMap: {} as Record<string, Agent>,
  currentDesktopTab: 'monitor' as string,
  currentSubTab: 'agents' as string,
  isMobile: typeof window !== 'undefined'
    ? window.matchMedia('(max-width: 768px)').matches
    : false,
  agentSearchQuery: '',
  currentDetailAgentId: '',
  lastErrors: [] as Array<{ message: string; ts: number }>,
  dismissedErrorMap: loadErrorKeys('oc_dismissed_errors'),
  shownErrorMap: loadErrorKeys('oc_shown_errors'),
  commandRunning: false,
  lastSseTs: 0,
  chatSending: false,
  /** Consumed by MonitorTab: navigate to this sub-tab, then cleared to null */
  preferredMonitorSubTab: null as string | null,
})

// Track mobile breakpoint changes reactively
if (typeof window !== 'undefined') {
  window.matchMedia('(max-width: 768px)').addEventListener('change', (e) => {
    appState.isMobile = e.matches
  })
}

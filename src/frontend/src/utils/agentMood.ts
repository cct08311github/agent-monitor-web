// ---------------------------------------------------------------------------
// agentMood.ts — Derive an emoji + label from an agent's runtime state
// ---------------------------------------------------------------------------

export interface AgentMood {
  emoji: string
  label: string
  reason: string
}

export interface AgentLike {
  status?: string
  lastActivity?: string
  currentTask?: { task?: string }
  // other fields may be present but are not required
}

const HOUR_MS = 3_600_000

/**
 * Compute a mood emoji and descriptive label for a given agent snapshot.
 *
 * Priority order (highest to lowest):
 *   1. Idle > 24 h  → 💀 長期離線
 *   2. Idle > 1 h   → 😴 休眠
 *   3. status contains 'error' → 😰 異常
 *   4. status contains 'active' AND has a currentTask → 🔥 工作中
 *   5. status contains 'active'                       → 😊 正常
 *   6. anything else                                  → 😐 待機
 *
 * @param agent - partial agent object (only reads status / lastActivity / currentTask)
 * @param now   - epoch ms reference (defaults to Date.now(), injectable for testing)
 */
export function computeAgentMood(agent: AgentLike, now: number = Date.now()): AgentMood {
  const status = String(agent.status ?? '')
  const lastTs = agent.lastActivity ? Date.parse(agent.lastActivity) : NaN
  const idleMs = Number.isFinite(lastTs) ? now - lastTs : Infinity

  if (idleMs > 24 * HOUR_MS) {
    const hours = Math.floor(idleMs / HOUR_MS)
    return { emoji: '💀', label: '長期離線', reason: `${hours} 小時無活動` }
  }

  if (idleMs > HOUR_MS) {
    const minutes = Math.floor(idleMs / 60_000)
    return { emoji: '😴', label: '休眠', reason: `${minutes} 分鐘無活動` }
  }

  if (status.toLowerCase().includes('error')) {
    return { emoji: '😰', label: '異常', reason: '狀態異常' }
  }

  if (status.toLowerCase().includes('active') && agent.currentTask?.task) {
    return { emoji: '🔥', label: '工作中', reason: '正在執行任務' }
  }

  if (status.toLowerCase().includes('active')) {
    return { emoji: '😊', label: '正常', reason: '正常運作中' }
  }

  return { emoji: '😐', label: '待機', reason: '已連線' }
}

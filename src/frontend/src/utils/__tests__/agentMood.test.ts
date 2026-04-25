import { describe, it, expect } from 'vitest'
import { computeAgentMood } from '../agentMood'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

describe('computeAgentMood', () => {
  // ── idle thresholds ───────────────────────────────────────────────────────

  it('returns 💀 when lastActivity is more than 24 h ago', () => {
    const now = Date.now()
    const mood = computeAgentMood(
      { status: 'active_recent', lastActivity: new Date(now - DAY_MS - 1).toISOString() },
      now,
    )
    expect(mood.emoji).toBe('💀')
    expect(mood.label).toBe('長期離線')
    expect(mood.reason).toMatch(/小時無活動/)
  })

  it('returns 😴 when lastActivity is more than 1 h but <= 24 h ago', () => {
    const now = Date.now()
    const mood = computeAgentMood(
      { status: 'active_recent', lastActivity: new Date(now - HOUR_MS - 1).toISOString() },
      now,
    )
    expect(mood.emoji).toBe('😴')
    expect(mood.label).toBe('休眠')
    expect(mood.reason).toMatch(/分鐘無活動/)
  })

  it('boundary: idleMs == HOUR_MS does NOT trigger 😴 (condition is strict >)', () => {
    const now = Date.now()
    // exactly HOUR_MS idle → not > HOUR_MS
    const mood = computeAgentMood(
      { status: 'active', lastActivity: new Date(now - HOUR_MS).toISOString() },
      now,
    )
    expect(mood.emoji).not.toBe('😴')
  })

  it('boundary: idleMs == 24*HOUR_MS does NOT trigger 💀 (condition is strict >)', () => {
    const now = Date.now()
    const mood = computeAgentMood(
      { status: 'active', lastActivity: new Date(now - DAY_MS).toISOString() },
      now,
    )
    expect(mood.emoji).not.toBe('💀')
  })

  // ── status-based moods ────────────────────────────────────────────────────

  it('returns 😰 for status containing "error"', () => {
    const now = Date.now()
    // recent activity so idle thresholds don't fire
    const mood = computeAgentMood(
      { status: 'error', lastActivity: new Date(now - 60_000).toISOString() },
      now,
    )
    expect(mood.emoji).toBe('😰')
    expect(mood.label).toBe('異常')
  })

  it('returns 😰 for status "active_error" (contains both active and error)', () => {
    const now = Date.now()
    const mood = computeAgentMood(
      { status: 'active_error', lastActivity: new Date(now - 60_000).toISOString() },
      now,
    )
    // error check fires before active check in priority order — but status contains 'error'
    // idle < 1 h so it falls through to error branch
    expect(mood.emoji).toBe('😰')
  })

  it('returns 🔥 for status "active" with currentTask.task set', () => {
    const now = Date.now()
    const mood = computeAgentMood(
      {
        status: 'active_executing',
        lastActivity: new Date(now - 30_000).toISOString(),
        currentTask: { task: 'writing tests' },
      },
      now,
    )
    expect(mood.emoji).toBe('🔥')
    expect(mood.label).toBe('工作中')
    expect(mood.reason).toBe('正在執行任務')
  })

  it('returns 😊 for status "active" without currentTask', () => {
    const now = Date.now()
    const mood = computeAgentMood(
      { status: 'active_recent', lastActivity: new Date(now - 30_000).toISOString() },
      now,
    )
    expect(mood.emoji).toBe('😊')
    expect(mood.label).toBe('正常')
  })

  it('returns 😐 when status is empty / not active', () => {
    const now = Date.now()
    const mood = computeAgentMood(
      { status: '', lastActivity: new Date(now - 30_000).toISOString() },
      now,
    )
    expect(mood.emoji).toBe('😐')
    expect(mood.label).toBe('待機')
  })

  it('returns 😐 when status is dormant (not active, not error)', () => {
    const now = Date.now()
    const mood = computeAgentMood(
      { status: 'dormant', lastActivity: new Date(now - 30_000).toISOString() },
      now,
    )
    expect(mood.emoji).toBe('😐')
  })

  // ── missing / invalid lastActivity ───────────────────────────────────────

  it('treats an invalid lastActivity string as infinite idle → 💀', () => {
    const now = Date.now()
    const mood = computeAgentMood({ status: 'active', lastActivity: 'not-a-date' }, now)
    expect(mood.emoji).toBe('💀')
  })

  it('treats missing lastActivity field as infinite idle → 💀', () => {
    const now = Date.now()
    const mood = computeAgentMood({ status: 'active' }, now)
    expect(mood.emoji).toBe('💀')
  })

  // ── idle reason string format ─────────────────────────────────────────────

  it('includes correct hour count in 💀 reason', () => {
    const now = Date.now()
    const hoursAgo = 30
    const mood = computeAgentMood(
      { lastActivity: new Date(now - hoursAgo * HOUR_MS - 1).toISOString() },
      now,
    )
    expect(mood.reason).toBe(`${hoursAgo} 小時無活動`)
  })

  it('includes correct minute count in 😴 reason', () => {
    const now = Date.now()
    const minutesAgo = 90
    const mood = computeAgentMood(
      { lastActivity: new Date(now - minutesAgo * 60_000 - 1).toISOString() },
      now,
    )
    expect(mood.reason).toBe(`${minutesAgo} 分鐘無活動`)
  })
})

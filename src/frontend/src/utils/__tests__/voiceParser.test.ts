import { describe, it, expect } from 'vitest'
import { parseVoice } from '../voiceParser'

describe('parseVoice', () => {
  // ── empty / blank ──────────────────────────────────────────────────────────

  it('returns unknown for empty string', () => {
    const result = parseVoice('')
    expect(result.type).toBe('unknown')
    expect(result.raw).toBe('')
  })

  it('returns unknown for whitespace-only string', () => {
    const result = parseVoice('   ')
    expect(result.type).toBe('unknown')
  })

  // ── navigate ───────────────────────────────────────────────────────────────

  it('navigates to logs on "切到日誌"', () => {
    const result = parseVoice('切到日誌')
    expect(result.type).toBe('navigate')
    expect(result.target).toBe('logs')
  })

  it('navigates to logs on "logs"', () => {
    const result = parseVoice('logs')
    expect(result.type).toBe('navigate')
    expect(result.target).toBe('logs')
  })

  it('navigates to system on "系統"', () => {
    const result = parseVoice('系統')
    expect(result.type).toBe('navigate')
    expect(result.target).toBe('system')
  })

  it('navigates to system on "費用"', () => {
    const result = parseVoice('費用')
    expect(result.type).toBe('navigate')
    expect(result.target).toBe('system')
  })

  it('navigates to chat on "聊天"', () => {
    const result = parseVoice('聊天')
    expect(result.type).toBe('navigate')
    expect(result.target).toBe('chat')
  })

  it('navigates to optimize on "優化"', () => {
    const result = parseVoice('優化')
    expect(result.type).toBe('navigate')
    expect(result.target).toBe('optimize')
  })

  it('navigates to monitor on "監控"', () => {
    const result = parseVoice('監控')
    expect(result.type).toBe('navigate')
    expect(result.target).toBe('monitor')
  })

  it('navigates to monitor on "agent"', () => {
    const result = parseVoice('agent')
    expect(result.type).toBe('navigate')
    expect(result.target).toBe('monitor')
  })

  it('navigates to monitor on "agents"', () => {
    const result = parseVoice('agents')
    expect(result.type).toBe('navigate')
    expect(result.target).toBe('monitor')
  })

  it('navigates to logs case-insensitively on "LOGS"', () => {
    const result = parseVoice('LOGS')
    expect(result.type).toBe('navigate')
    expect(result.target).toBe('logs')
  })

  // ── open palette ───────────────────────────────────────────────────────────

  it('opens palette on "open palette"', () => {
    const result = parseVoice('open palette')
    expect(result.type).toBe('open')
    expect(result.target).toBe('palette')
  })

  it('opens palette on "command"', () => {
    const result = parseVoice('command')
    expect(result.type).toBe('open')
    expect(result.target).toBe('palette')
  })

  it('opens palette on "面板"', () => {
    const result = parseVoice('面板')
    expect(result.type).toBe('open')
    expect(result.target).toBe('palette')
  })

  it('opens palette on "搜尋面板"', () => {
    const result = parseVoice('搜尋面板')
    expect(result.type).toBe('open')
    expect(result.target).toBe('palette')
  })

  // ── search ─────────────────────────────────────────────────────────────────

  it('returns search action on "找 main"', () => {
    const result = parseVoice('找 main')
    expect(result.type).toBe('search')
    expect(result.query).toBe('main')
  })

  it('returns search action on "搜尋 gpt"', () => {
    const result = parseVoice('搜尋 gpt')
    expect(result.type).toBe('search')
    expect(result.query).toBe('gpt')
  })

  it('returns search action on "search hello"', () => {
    const result = parseVoice('search hello')
    expect(result.type).toBe('search')
    expect(result.query).toBe('hello')
  })

  it('returns search action on "find claude"', () => {
    const result = parseVoice('find claude')
    expect(result.type).toBe('search')
    expect(result.query).toBe('claude')
  })

  it('trims search query whitespace', () => {
    const result = parseVoice('找  some agent ')
    expect(result.type).toBe('search')
    expect(result.query).toBe('some agent')
  })

  // ── unknown ────────────────────────────────────────────────────────────────

  it('returns unknown for unrecognised input "gibberish XYZ"', () => {
    const result = parseVoice('gibberish XYZ')
    expect(result.type).toBe('unknown')
    expect(result.raw).toBe('gibberish XYZ')
  })

  it('returns unknown for random phrase with no keyword', () => {
    const result = parseVoice('hello world foo bar')
    expect(result.type).toBe('unknown')
  })

  // ── raw preserved ──────────────────────────────────────────────────────────

  it('preserves raw transcript on navigate action', () => {
    const result = parseVoice('切到日誌')
    expect(result.raw).toBe('切到日誌')
  })

  it('preserves raw transcript on search action', () => {
    const result = parseVoice('find claude')
    expect(result.raw).toBe('find claude')
  })
})

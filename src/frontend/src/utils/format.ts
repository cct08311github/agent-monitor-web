// ---------------------------------------------------------------------------
// format.ts — Utility functions ported from app.js
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// HTML escape
// ---------------------------------------------------------------------------

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escape a string for safe insertion into HTML. */
export function esc(s = ''): string {
  return String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c] ?? c)
}

// ---------------------------------------------------------------------------
// Token count formatting
// ---------------------------------------------------------------------------

/**
 * Format a raw token count into a compact human-readable string.
 * Examples: 1_200_000 → "1.2M",  45_000 → "45k",  500 → "500"
 */
export function formatTokens(n: number): string {
  const count = Number(n || 0)
  if (count >= 1_000_000) return (count / 1_000_000).toFixed(1) + 'M'
  if (count >= 1_000) return (count / 1_000).toFixed(0) + 'k'
  return count.toString()
}

// ---------------------------------------------------------------------------
// Currency formatting
// ---------------------------------------------------------------------------

/**
 * Convert a USD amount to a TWD-formatted string using the given exchange rate.
 * Examples: formatTWD(10, 32) → "NT$320",  formatTWD(0.5, 32) → "NT$16.0"
 */
export function formatTWD(usd: number, rate: number): string {
  const twd = usd * rate
  if (twd >= 1_000) return 'NT$' + twd.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (twd >= 100) return 'NT$' + twd.toFixed(0)
  if (twd >= 1) return 'NT$' + twd.toFixed(1)
  return 'NT$' + twd.toFixed(2)
}

// ---------------------------------------------------------------------------
// Date / time formatting
// ---------------------------------------------------------------------------

/**
 * Format a Date object as "YYYY-MM-DD HH:mm:ss".
 * Defaults to the current time when no argument is provided.
 */
export function fmtTime(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

// ---------------------------------------------------------------------------
// Agent emoji map
// ---------------------------------------------------------------------------

const AGENT_EMOJI_MAP: Record<string, string> = {
  main: '🏠',
  coder: '💻',
  code: '💻',
  sre: '🛡️',
  finance: '💰',
  writer: '✍️',
  research: '🔬',
  creative: '🎨',
  tester: '🧪',
  intelligence: '🧠',
  architect: '🏗️',
  pm: '📋',
  docs: '📚',
  github: '🐙',
  critic: '🔍',
  data: '📊',
  life: '🍳',
  gourmet: '🍳',
  visionary: '🔮',
  dev: '⚙️',
  work: '💼',
  concierge: '🛎️',
}

/**
 * Return a representative emoji for an agent id.
 * Falls back to '🤖' when no keyword matches.
 */
export function getAgentEmoji(id: string): string {
  for (const [key, emoji] of Object.entries(AGENT_EMOJI_MAP)) {
    if (id.includes(key)) return emoji
  }
  return '🤖'
}

// ---------------------------------------------------------------------------
// Agent status display info
// ---------------------------------------------------------------------------

export interface StatusInfo {
  /** CSS class applied to the agent card wrapper */
  class: string
  /** Human-readable status text (zh-TW) */
  text: string
  /** CSS class for the status dot indicator */
  dotClass: string
  /** Icon character for the status */
  icon: string
}

/**
 * Return CSS class names, display text, and icon for a given agent status string.
 */
export function getStatusInfo(status: string): StatusInfo {
  switch (status) {
    case 'active_executing':
      return { class: 'running', text: '執行中', dotClass: 'online', icon: '▶' }
    case 'active_recent':
      return { class: 'active', text: '活動中', dotClass: 'online', icon: '●' }
    case 'dormant':
      return { class: 'dormant', text: '休眠中', dotClass: 'idle', icon: '◐' }
    default:
      return { class: '', text: '離線', dotClass: 'offline', icon: '○' }
  }
}

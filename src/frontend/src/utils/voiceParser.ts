export type VoiceActionType = 'navigate' | 'open' | 'search' | 'unknown'

export interface VoiceAction {
  type: VoiceActionType
  target?: string // 'monitor' | 'system' | 'logs' | 'chat' | 'optimize' | 'palette'
  query?: string // search keyword
  raw: string
}

const KEYWORDS = {
  monitor: ['監控', 'monitor', 'agent', 'agents'],
  system: ['系統', '費用', 'system', 'cost'],
  logs: ['日誌', 'logs', 'log'],
  chat: ['聊天', 'chat'],
  optimize: ['優化', 'optimize'],
  palette: ['palette', '面板', '搜尋面板', 'command'],
} as const

const SEARCH_PATTERNS = [/^找\s*(.+)$/i, /^搜尋\s*(.+)$/i, /^search\s+(.+)$/i, /^find\s+(.+)$/i]

export function parseVoice(transcript: string): VoiceAction {
  const t = (transcript || '').trim()
  if (!t) return { type: 'unknown', raw: t }

  const lower = t.toLowerCase()

  // palette keywords checked first — before generic search patterns so that
  // compound terms like "搜尋面板" route to palette, not generic search
  for (const kw of KEYWORDS.palette) {
    if (lower.includes(kw.toLowerCase())) return { type: 'open', target: 'palette', raw: t }
  }

  // search patterns
  for (const re of SEARCH_PATTERNS) {
    const m = t.match(re)
    if (m && m[1]) return { type: 'search', query: m[1].trim(), raw: t }
  }

  // navigate keywords (order: long match first via array order)
  for (const target of ['logs', 'system', 'chat', 'optimize', 'monitor'] as const) {
    for (const kw of KEYWORDS[target]) {
      if (lower.includes(kw.toLowerCase())) return { type: 'navigate', target, raw: t }
    }
  }
  return { type: 'unknown', raw: t }
}

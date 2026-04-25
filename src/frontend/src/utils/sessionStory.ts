export interface StoryMessage {
  role: string
  text?: string
  toolUses?: string[]
  ts?: string | number
}

export type StoryType = 'intro' | 'thought' | 'action' | 'error' | 'result'

export interface StoryStep {
  index: number      // 1-based
  type: StoryType
  text: string
  msgIndex: number   // first source msg index (0-based)
}

const ERROR_PATTERN = /\b(error|failed|fail|exception|cannot|unable|denied|timeout)\b/i

export function truncate(s: string, n = 60): string {
  if (!s) return ''
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}

export function classifyMessage(
  msg: StoryMessage,
  isFirst: boolean,
  isLast: boolean,
): { type: StoryType; text: string } | null {
  const role = (msg.role || '').toLowerCase()
  const text = (msg.text || '').trim()
  const tools = msg.toolUses ?? []

  // intro: first user message
  if (isFirst && role === 'user' && text) {
    return { type: 'intro', text: `User asked: ${truncate(text)}` }
  }
  // assistant with toolUses → action
  if (role === 'assistant' && tools.length > 0) {
    return { type: 'action', text: `Invoked: ${tools.slice(0, 3).join(', ')}${tools.length > 3 ? '…' : ''}` }
  }
  // assistant text containing error keywords → error
  if (role === 'assistant' && text && ERROR_PATTERN.test(text)) {
    return { type: 'error', text: `Error: ${truncate(text)}` }
  }
  // last assistant message → result
  if (isLast && role === 'assistant' && text) {
    return { type: 'result', text: `Final: ${truncate(text)}` }
  }
  // assistant text → thought
  if (role === 'assistant' && text) {
    return { type: 'thought', text: `Thought: ${truncate(text)}` }
  }
  // user mid-conversation → skip (caller can decide)
  return null
}

export function buildStory(messages: StoryMessage[]): StoryStep[] {
  if (!Array.isArray(messages) || messages.length === 0) return []
  const steps: StoryStep[] = []
  let lastType: StoryType | null = null
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const isFirst = i === 0
    const isLast = i === messages.length - 1
    const r = classifyMessage(msg, isFirst, isLast)
    if (!r) continue
    // 合併連續同 type
    if (lastType === r.type && steps.length > 0) {
      const prev = steps[steps.length - 1]
      prev.text = `${prev.text} · ${r.text}`
      continue
    }
    steps.push({ index: steps.length + 1, type: r.type, text: r.text, msgIndex: i })
    lastType = r.type
  }
  return steps
}

export function storyIcon(type: StoryType): string {
  switch (type) {
    case 'intro': return '💬'
    case 'thought': return '💭'
    case 'action': return '⚙️'
    case 'error': return '⚠️'
    case 'result': return '✅'
  }
}

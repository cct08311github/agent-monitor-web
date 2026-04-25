import { describe, it, expect } from 'vitest'
import {
  buildStory,
  classifyMessage,
  truncate,
  storyIcon,
  type StoryMessage,
} from '../sessionStory'

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------

describe('truncate', () => {
  it('returns string as-is when <= 60 chars', () => {
    expect(truncate('hello')).toBe('hello')
    expect(truncate('a'.repeat(60))).toBe('a'.repeat(60))
  })

  it('truncates string longer than 60 chars and appends ellipsis', () => {
    const long = 'a'.repeat(80)
    const result = truncate(long)
    expect(result.length).toBe(60)
    expect(result.endsWith('…')).toBe(true)
  })

  it('accepts custom limit', () => {
    const result = truncate('hello world', 5)
    expect(result.length).toBe(5)
    expect(result.endsWith('…')).toBe(true)
  })

  it('returns empty string for empty input', () => {
    expect(truncate('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// classifyMessage
// ---------------------------------------------------------------------------

describe('classifyMessage', () => {
  it('classifies first user message as intro', () => {
    const msg: StoryMessage = { role: 'user', text: 'What is the weather?' }
    const result = classifyMessage(msg, true, false)
    expect(result?.type).toBe('intro')
    expect(result?.text).toContain('User asked:')
  })

  it('classifies assistant with toolUses as action', () => {
    const msg: StoryMessage = { role: 'assistant', text: 'calling tools', toolUses: ['bash', 'edit'] }
    const result = classifyMessage(msg, false, false)
    expect(result?.type).toBe('action')
    expect(result?.text).toContain('Invoked:')
    expect(result?.text).toContain('bash')
    expect(result?.text).toContain('edit')
  })

  it('limits tool list to 3 and appends ellipsis when more than 3', () => {
    const msg: StoryMessage = { role: 'assistant', toolUses: ['tool_a', 'tool_b', 'tool_c', 'tool_d'] }
    const result = classifyMessage(msg, false, false)
    expect(result?.type).toBe('action')
    expect(result?.text).toContain('…')
    // fourth tool should not appear in the text
    expect(result?.text).not.toContain('tool_d')
  })

  it('classifies assistant text with error keyword as error', () => {
    const msg: StoryMessage = { role: 'assistant', text: 'Operation failed due to network timeout' }
    const result = classifyMessage(msg, false, false)
    expect(result?.type).toBe('error')
    expect(result?.text).toContain('Error:')
  })

  it('classifies last assistant message as result', () => {
    const msg: StoryMessage = { role: 'assistant', text: 'Here is the final answer' }
    const result = classifyMessage(msg, false, true)
    expect(result?.type).toBe('result')
    expect(result?.text).toContain('Final:')
  })

  it('classifies mid-conversation assistant text as thought', () => {
    const msg: StoryMessage = { role: 'assistant', text: 'Let me think about this' }
    const result = classifyMessage(msg, false, false)
    expect(result?.type).toBe('thought')
    expect(result?.text).toContain('Thought:')
  })

  it('returns null for mid-conversation user messages', () => {
    const msg: StoryMessage = { role: 'user', text: 'Follow-up question' }
    const result = classifyMessage(msg, false, false)
    expect(result).toBeNull()
  })

  it('returns null for assistant with no text and no tools', () => {
    const msg: StoryMessage = { role: 'assistant' }
    const result = classifyMessage(msg, false, false)
    expect(result).toBeNull()
  })

  it('error classification uses case-insensitive matching', () => {
    const msg: StoryMessage = { role: 'assistant', text: 'Access DENIED to resource' }
    const result = classifyMessage(msg, false, false)
    expect(result?.type).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// buildStory
// ---------------------------------------------------------------------------

describe('buildStory', () => {
  it('returns empty array for empty messages', () => {
    expect(buildStory([])).toEqual([])
  })

  it('handles non-array input gracefully', () => {
    // @ts-expect-error testing runtime guard
    expect(buildStory(null)).toEqual([])
    // @ts-expect-error testing runtime guard
    expect(buildStory(undefined)).toEqual([])
  })

  it('first user message becomes intro step', () => {
    const msgs: StoryMessage[] = [
      { role: 'user', text: 'Hello, please summarize this document' },
    ]
    const steps = buildStory(msgs)
    expect(steps.length).toBe(1)
    expect(steps[0].type).toBe('intro')
    expect(steps[0].index).toBe(1)
    expect(steps[0].msgIndex).toBe(0)
  })

  it('assistant with toolUses becomes action step', () => {
    const msgs: StoryMessage[] = [
      { role: 'assistant', toolUses: ['read_file', 'write_file'] },
    ]
    const steps = buildStory(msgs)
    expect(steps.length).toBe(1)
    expect(steps[0].type).toBe('action')
  })

  it('assistant text with error keyword becomes error step', () => {
    const msgs: StoryMessage[] = [
      { role: 'assistant', text: 'An error occurred: cannot open the file' },
    ]
    const steps = buildStory(msgs)
    expect(steps.length).toBe(1)
    expect(steps[0].type).toBe('error')
  })

  it('last assistant message becomes result step', () => {
    const msgs: StoryMessage[] = [
      { role: 'user', text: 'Do this please' },
      { role: 'assistant', text: 'Done! Here is your result.' },
    ]
    const steps = buildStory(msgs)
    const resultStep = steps.find(s => s.type === 'result')
    expect(resultStep).toBeDefined()
    expect(resultStep?.text).toContain('Final:')
  })

  it('mid-conversation assistant text becomes thought step', () => {
    const msgs: StoryMessage[] = [
      { role: 'user', text: 'Some request' },
      { role: 'assistant', text: 'Analyzing the situation carefully' },
      { role: 'assistant', text: 'Finished' },
    ]
    const steps = buildStory(msgs)
    const thoughtStep = steps.find(s => s.type === 'thought')
    expect(thoughtStep).toBeDefined()
  })

  it('consecutive steps of the same type are merged with dot separator', () => {
    const msgs: StoryMessage[] = [
      { role: 'assistant', toolUses: ['bash'] },
      { role: 'assistant', toolUses: ['edit'] },
    ]
    const steps = buildStory(msgs)
    expect(steps.length).toBe(1)
    expect(steps[0].text).toContain(' · ')
  })

  it('steps have sequential 1-based index', () => {
    const msgs: StoryMessage[] = [
      { role: 'user', text: 'Start' },
      { role: 'assistant', toolUses: ['bash'] },
      { role: 'assistant', text: 'Done working on it' },
    ]
    const steps = buildStory(msgs)
    expect(steps.every((s, i) => s.index === i + 1)).toBe(true)
  })

  it('produces at most ~10 steps for a realistic 20-message session', () => {
    const msgs: StoryMessage[] = [
      { role: 'user', text: 'Please help me with this task' },
      ...Array.from({ length: 9 }, (_, i) => ({
        role: 'assistant',
        toolUses: [`tool_${i}`],
      })),
      { role: 'assistant', text: 'All done!' },
    ]
    const steps = buildStory(msgs)
    // consecutive tool calls merge → 1 action step + 1 intro + 1 result
    expect(steps.length).toBeLessThanOrEqual(10)
  })

  it('full pipeline: intro → action → result', () => {
    const msgs: StoryMessage[] = [
      { role: 'user', text: 'Write a script for me' },
      { role: 'assistant', toolUses: ['write_file'] },
      { role: 'assistant', text: 'Script created successfully.' },
    ]
    const steps = buildStory(msgs)
    const types = steps.map(s => s.type)
    expect(types).toContain('intro')
    expect(types).toContain('action')
    expect(types).toContain('result')
  })
})

// ---------------------------------------------------------------------------
// storyIcon
// ---------------------------------------------------------------------------

describe('storyIcon', () => {
  it('returns correct icon for each story type', () => {
    expect(storyIcon('intro')).toBe('💬')
    expect(storyIcon('thought')).toBe('💭')
    expect(storyIcon('action')).toBe('⚙️')
    expect(storyIcon('error')).toBe('⚠️')
    expect(storyIcon('result')).toBe('✅')
  })
})

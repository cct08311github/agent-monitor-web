import { describe, it, expect } from 'vitest'
import {
  renameTagInBody,
  removeTagFromBody,
  applyTagRename,
  applyTagRemove,
} from '../captureTagRename'
import type { Capture } from '../quickCapture'

// Helper to create a minimal Capture for testing
function mkCapture(id: string, body: string): Capture {
  return { id, body, context: 'test', createdAt: Date.now() }
}

describe('renameTagInBody', () => {
  it('replaces a simple tag', () => {
    expect(renameTagInBody('TODO #bug fix', 'bug', 'issue')).toBe('TODO #issue fix')
  })

  it('does NOT change plain word without #', () => {
    expect(renameTagInBody('the word bug is here', 'bug', 'issue')).toBe('the word bug is here')
  })

  it('matches case-insensitively', () => {
    expect(renameTagInBody('#Bug works', 'bug', 'issue')).toBe('#issue works')
  })

  it('replaces all occurrences in the body', () => {
    expect(renameTagInBody('#bug first #bug second', 'bug', 'issue')).toBe('#issue first #issue second')
  })

  it('does NOT match partial tag — #bugs is NOT renamed when oldTag is "bug"', () => {
    expect(renameTagInBody('#bugs are annoying', 'bug', 'issue')).toBe('#bugs are annoying')
  })

  it('handles mixed partial and exact tags in one body', () => {
    expect(renameTagInBody('#bug and #bugs', 'bug', 'issue')).toBe('#issue and #bugs')
  })

  it('is a no-op when the tag is absent', () => {
    expect(renameTagInBody('just text', 'bug', 'issue')).toBe('just text')
  })
})

describe('removeTagFromBody', () => {
  it('removes a tag and collapses whitespace', () => {
    expect(removeTagFromBody('todo #bug fix', 'bug')).toBe('todo fix')
  })

  it('removes a trailing tag', () => {
    expect(removeTagFromBody('todo #bug', 'bug')).toBe('todo')
  })

  it('removes a leading tag', () => {
    expect(removeTagFromBody('#bug todo', 'bug')).toBe('todo')
  })

  it('removes multiple occurrences', () => {
    expect(removeTagFromBody('#bug a #bug b', 'bug')).toBe('a b')
  })

  it('does not remove #bugs when tag is "bug"', () => {
    expect(removeTagFromBody('fix #bugs', 'bug')).toBe('fix #bugs')
  })

  it('is a no-op when tag is absent', () => {
    expect(removeTagFromBody('hello world', 'bug')).toBe('hello world')
  })
})

describe('applyTagRename', () => {
  it('returns only affected captures', () => {
    const captures = [
      mkCapture('1', 'todo #bug fix'),
      mkCapture('2', 'no tag here'),
      mkCapture('3', '#bug again'),
    ]
    const results = applyTagRename(captures, 'bug', 'issue')
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ id: '1', oldBody: 'todo #bug fix', newBody: 'todo #issue fix' })
    expect(results[1]).toEqual({ id: '3', oldBody: '#bug again', newBody: '#issue again' })
  })

  it('returns empty array for empty input', () => {
    expect(applyTagRename([], 'bug', 'issue')).toEqual([])
  })

  it('returns empty array when no capture contains the tag', () => {
    const captures = [mkCapture('1', 'nothing here'), mkCapture('2', 'also nothing')]
    expect(applyTagRename(captures, 'bug', 'issue')).toEqual([])
  })
})

describe('applyTagRemove', () => {
  it('returns only affected captures', () => {
    const captures = [
      mkCapture('1', 'todo #bug fix'),
      mkCapture('2', 'no tag here'),
    ]
    const results = applyTagRemove(captures, 'bug')
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({ id: '1', oldBody: 'todo #bug fix', newBody: 'todo fix' })
  })

  it('returns empty array for empty input', () => {
    expect(applyTagRemove([], 'bug')).toEqual([])
  })
})

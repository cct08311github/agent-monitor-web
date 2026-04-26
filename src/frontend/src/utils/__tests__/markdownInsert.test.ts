import { describe, it, expect } from 'vitest'
import { wrapSelection, prependLine } from '../markdownInsert'

describe('wrapSelection', () => {
  it('wraps the selected text with prefix and suffix', () => {
    const result = wrapSelection('hello', 0, 5, '**', '**', 'X')
    expect(result.text).toBe('**hello**')
    expect(result.selectionStart).toBe(2) // after '**'
    expect(result.selectionEnd).toBe(7) // 2 + length('hello')
  })

  it('inserts placeholder when selection is collapsed (start === end)', () => {
    const result = wrapSelection('xy', 1, 1, '**', '**', 'placeholder')
    expect(result.text).toBe('x**placeholder**y')
    expect(result.selectionStart).toBe(3) // 'x'.length + '**'.length
    expect(result.selectionEnd).toBe(3 + 'placeholder'.length)
  })

  it('positions selection bounds correctly after wrapping', () => {
    const result = wrapSelection('hello world', 6, 11, '*', '*', 'text')
    expect(result.text).toBe('hello *world*')
    expect(result.selectionStart).toBe(7) // 'hello '.length + '*'.length
    expect(result.selectionEnd).toBe(12) // 7 + 'world'.length
  })

  it('works for mid-string selection with code wrap', () => {
    const result = wrapSelection('foo bar baz', 4, 7, '`', '`', 'code')
    expect(result.text).toBe('foo `bar` baz')
    expect(result.selectionStart).toBe(5)
    expect(result.selectionEnd).toBe(8)
  })

  it('handles empty string with collapsed caret', () => {
    const result = wrapSelection('', 0, 0, '[', '](https://)', '連結文字')
    expect(result.text).toBe('[連結文字](https://)')
    expect(result.selectionStart).toBe(1)
    expect(result.selectionEnd).toBe(1 + '連結文字'.length)
  })

  it('handles prefix-only wrap (empty suffix)', () => {
    const result = wrapSelection('abc', 0, 3, '> ', '', 'text')
    expect(result.text).toBe('> abc')
    expect(result.selectionStart).toBe(2)
    expect(result.selectionEnd).toBe(5)
  })
})

describe('prependLine', () => {
  it('prepends prefix to the line containing the caret', () => {
    const result = prependLine('foo\nbar', 5, '- ')
    expect(result.text).toBe('foo\n- bar')
    expect(result.selectionStart).toBe(7) // 5 + '- '.length
    expect(result.selectionEnd).toBe(7)
  })

  it('is a no-op when the line already starts with the prefix', () => {
    const result = prependLine('foo\n- bar', 7, '- ')
    expect(result.text).toBe('foo\n- bar')
    expect(result.selectionStart).toBe(7)
    expect(result.selectionEnd).toBe(7)
  })

  it('works for the first line when caret is at position 0', () => {
    const result = prependLine('hello', 0, '- ')
    expect(result.text).toBe('- hello')
    expect(result.selectionStart).toBe(2)
    expect(result.selectionEnd).toBe(2)
  })

  it('advances caret by prefix length', () => {
    const result = prependLine('abc\ndef', 5, '## ')
    expect(result.text).toBe('abc\n## def')
    expect(result.selectionStart).toBe(5 + '## '.length)
  })

  it('handles last line without trailing newline', () => {
    const result = prependLine('line1\nline2', 9, '- ')
    expect(result.text).toBe('line1\n- line2')
    expect(result.selectionStart).toBe(9 + 2)
  })

  it('works when caret is at the very end of the string', () => {
    const result = prependLine('hello', 5, '- ')
    expect(result.text).toBe('- hello')
    expect(result.selectionStart).toBe(7)
  })
})

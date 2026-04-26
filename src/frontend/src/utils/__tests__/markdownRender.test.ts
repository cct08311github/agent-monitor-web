import { describe, it, expect } from 'vitest'
import { parseInline, parseMarkdown } from '../markdownRender'

describe('parseInline', () => {
  it('returns a single text node for plain text', () => {
    const nodes = parseInline('hello world')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toEqual({ kind: 'text', text: 'hello world' })
  })

  it('parses **bold** into a bold node', () => {
    const nodes = parseInline('**bold**')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toEqual({ kind: 'bold', text: 'bold' })
  })

  it('parses __bold__ into a bold node', () => {
    const nodes = parseInline('__bold__')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toEqual({ kind: 'bold', text: 'bold' })
  })

  it('parses *italic* into an italic node', () => {
    const nodes = parseInline('*italic*')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toEqual({ kind: 'italic', text: 'italic' })
  })

  it('parses _italic_ into an italic node', () => {
    const nodes = parseInline('_italic_')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toEqual({ kind: 'italic', text: 'italic' })
  })

  it('parses inline `code` surrounded by text into 3 nodes', () => {
    const nodes = parseInline('code `x` end')
    expect(nodes).toHaveLength(3)
    expect(nodes[0]).toEqual({ kind: 'text', text: 'code ' })
    expect(nodes[1]).toEqual({ kind: 'code', text: 'x' })
    expect(nodes[2]).toEqual({ kind: 'text', text: ' end' })
  })

  it('parses a [link](url) into a link node with url', () => {
    const nodes = parseInline('[GitHub](https://github.com)')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toEqual({ kind: 'link', text: 'GitHub', url: 'https://github.com' })
  })

  it('parses mixed bold and plain text', () => {
    const nodes = parseInline('hello **world** end')
    expect(nodes).toHaveLength(3)
    expect(nodes[0].kind).toBe('text')
    expect(nodes[1].kind).toBe('bold')
    expect(nodes[1].text).toBe('world')
    expect(nodes[2].kind).toBe('text')
  })

  it('code takes priority over bold markers inside backticks', () => {
    const nodes = parseInline('`**not bold**`')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toEqual({ kind: 'code', text: '**not bold**' })
  })
})

describe('parseMarkdown', () => {
  it('returns [] for empty body', () => {
    expect(parseMarkdown('')).toEqual([])
  })

  it('returns [] for falsy body', () => {
    expect(parseMarkdown(undefined as unknown as string)).toEqual([])
  })

  it('parses plain text into 1 paragraph block', () => {
    const blocks = parseMarkdown('hello world')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].kind).toBe('paragraph')
    expect(blocks[0].inlines).toHaveLength(1)
    expect(blocks[0].inlines![0]).toEqual({ kind: 'text', text: 'hello world' })
  })

  it('parses **bold** into a paragraph with bold inline', () => {
    const blocks = parseMarkdown('**bold**')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].kind).toBe('paragraph')
    expect(blocks[0].inlines![0].kind).toBe('bold')
  })

  it('parses *italic* into a paragraph with italic inline', () => {
    const blocks = parseMarkdown('*italic*')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].inlines![0].kind).toBe('italic')
  })

  it('parses # Heading into heading block with level 1', () => {
    const blocks = parseMarkdown('# Heading')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].kind).toBe('heading')
    expect(blocks[0].level).toBe(1)
    expect(blocks[0].inlines![0].text).toBe('Heading')
  })

  it('parses ## H2 into heading block with level 2', () => {
    const blocks = parseMarkdown('## Sub')
    expect(blocks[0].level).toBe(2)
  })

  it('parses a list of two items', () => {
    const blocks = parseMarkdown('- a\n- b')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].kind).toBe('list')
    expect(blocks[0].items).toHaveLength(2)
    expect(blocks[0].items![0][0].text).toBe('a')
    expect(blocks[0].items![1][0].text).toBe('b')
  })

  it('parses * bullet list items', () => {
    const blocks = parseMarkdown('* first\n* second')
    expect(blocks[0].kind).toBe('list')
    expect(blocks[0].items).toHaveLength(2)
  })

  it('parses mixed paragraph + list + heading in correct order', () => {
    const input = 'Intro text\n\n- item one\n- item two\n\n## Section'
    const blocks = parseMarkdown(input)
    expect(blocks).toHaveLength(3)
    expect(blocks[0].kind).toBe('paragraph')
    expect(blocks[1].kind).toBe('list')
    expect(blocks[2].kind).toBe('heading')
    expect(blocks[2].level).toBe(2)
  })

  it('parses [link](url) in paragraph correctly', () => {
    const blocks = parseMarkdown('[GitHub](https://github.com)')
    expect(blocks[0].inlines![0]).toEqual({
      kind: 'link',
      text: 'GitHub',
      url: 'https://github.com',
    })
  })

  it('handles inline code inside a paragraph', () => {
    const blocks = parseMarkdown('run `npm install` now')
    const inlines = blocks[0].inlines!
    expect(inlines).toHaveLength(3)
    expect(inlines[1]).toEqual({ kind: 'code', text: 'npm install' })
  })

  it('treats heading immediately after list as separate blocks', () => {
    const blocks = parseMarkdown('- item\n# Title')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].kind).toBe('list')
    expect(blocks[1].kind).toBe('heading')
  })

  it('trailing list without blank line is still flushed', () => {
    const blocks = parseMarkdown('- only')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].kind).toBe('list')
  })
})

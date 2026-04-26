export type MdInlineKind = 'text' | 'bold' | 'italic' | 'code' | 'link'
export type MdBlockKind = 'paragraph' | 'heading' | 'list'

export interface MdInlineNode {
  kind: MdInlineKind
  text: string
  url?: string
}

export interface MdBlock {
  kind: MdBlockKind
  level?: number // for heading (1-6)
  items?: MdInlineNode[][] // for list, each item is inline nodes
  inlines?: MdInlineNode[] // for paragraph and heading
}

/**
 * Parse a single line into inline nodes (text, bold, italic, code, link).
 * Match in priority: code > link > bold > italic > text.
 */
export function parseInline(line: string): MdInlineNode[] {
  const nodes: MdInlineNode[] = []
  let remaining = line
  while (remaining.length > 0) {
    // try inline code: `text`
    const code = /^`([^`]+)`/.exec(remaining)
    if (code) {
      nodes.push({ kind: 'code', text: code[1] })
      remaining = remaining.slice(code[0].length)
      continue
    }
    // link: [text](url)
    const link = /^\[([^\]]+)\]\(([^\s)]+)\)/.exec(remaining)
    if (link) {
      nodes.push({ kind: 'link', text: link[1], url: link[2] })
      remaining = remaining.slice(link[0].length)
      continue
    }
    // bold: **text** or __text__
    const bold = /^(\*\*|__)([^*_]+)\1/.exec(remaining)
    if (bold) {
      nodes.push({ kind: 'bold', text: bold[2] })
      remaining = remaining.slice(bold[0].length)
      continue
    }
    // italic: *text* or _text_
    const italic = /^(\*|_)([^*_]+)\1/.exec(remaining)
    if (italic) {
      nodes.push({ kind: 'italic', text: italic[2] })
      remaining = remaining.slice(italic[0].length)
      continue
    }
    // plain text: consume up to next markup char
    const next = remaining.search(/[*_`[]/)
    const consume = next < 0 ? remaining.length : Math.max(1, next)
    nodes.push({ kind: 'text', text: remaining.slice(0, consume) })
    remaining = remaining.slice(consume)
  }
  return nodes
}

export function parseMarkdown(body: string): MdBlock[] {
  if (!body) return []
  const lines = body.split('\n')
  const blocks: MdBlock[] = []
  let listItems: MdInlineNode[][] | null = null
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line) {
      if (listItems) {
        blocks.push({ kind: 'list', items: listItems })
        listItems = null
      }
      continue
    }
    // heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) {
      if (listItems) {
        blocks.push({ kind: 'list', items: listItems })
        listItems = null
      }
      blocks.push({ kind: 'heading', level: h[1].length, inlines: parseInline(h[2]) })
      continue
    }
    // list item
    const li = /^[-*]\s+(.*)$/.exec(line)
    if (li) {
      if (!listItems) listItems = []
      listItems.push(parseInline(li[1]))
      continue
    }
    // paragraph
    if (listItems) {
      blocks.push({ kind: 'list', items: listItems })
      listItems = null
    }
    blocks.push({ kind: 'paragraph', inlines: parseInline(line) })
  }
  if (listItems) blocks.push({ kind: 'list', items: listItems })
  return blocks
}

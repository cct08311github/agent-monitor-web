import { describe, it, expect } from 'vitest'
import { CAPTURE_TEMPLATES, type CaptureTemplate } from '../captureTemplates'

describe('CAPTURE_TEMPLATES data', () => {
  it('has at least 5 entries', () => {
    expect(CAPTURE_TEMPLATES.length).toBeGreaterThanOrEqual(5)
  })

  it('each entry has a non-empty id, name, emoji, and body', () => {
    for (const t of CAPTURE_TEMPLATES) {
      expect(t.id.trim().length, `id empty on template "${t.name}"`).toBeGreaterThan(0)
      expect(t.name.trim().length, `name empty on template "${t.id}"`).toBeGreaterThan(0)
      expect(t.emoji.trim().length, `emoji empty on template "${t.id}"`).toBeGreaterThan(0)
      expect(t.body.trim().length, `body empty on template "${t.id}"`).toBeGreaterThan(0)
    }
  })

  it('all ids are unique', () => {
    const ids = CAPTURE_TEMPLATES.map((t) => t.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('each body contains at least one #tag to encourage tagging', () => {
    for (const t of CAPTURE_TEMPLATES) {
      expect(t.body, `template "${t.id}" body has no #tag`).toMatch(/#\w+/)
    }
  })

  it('includes a template with id "todo"', () => {
    const t = CAPTURE_TEMPLATES.find((x) => x.id === 'todo')
    expect(t).toBeDefined()
    expect(t?.body).toContain('#followup')
  })

  it('includes a template with id "decision"', () => {
    const t = CAPTURE_TEMPLATES.find((x) => x.id === 'decision')
    expect(t).toBeDefined()
    expect(t?.body).toContain('#decision')
  })

  it('includes a template with id "bug"', () => {
    const t = CAPTURE_TEMPLATES.find((x) => x.id === 'bug')
    expect(t).toBeDefined()
    expect(t?.body).toContain('#bug')
  })

  it('includes a template with id "idea"', () => {
    const t = CAPTURE_TEMPLATES.find((x) => x.id === 'idea')
    expect(t).toBeDefined()
    expect(t?.body).toContain('#idea')
  })

  it('includes a template with id "meeting"', () => {
    const t = CAPTURE_TEMPLATES.find((x) => x.id === 'meeting')
    expect(t).toBeDefined()
    expect(t?.body).toContain('#meeting')
  })

  it('satisfies the CaptureTemplate interface for every entry', () => {
    for (const t of CAPTURE_TEMPLATES) {
      const template: CaptureTemplate = t
      expect(typeof template.id).toBe('string')
      expect(typeof template.name).toBe('string')
      expect(typeof template.emoji).toBe('string')
      expect(typeof template.body).toBe('string')
    }
  })
})

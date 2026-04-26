/**
 * captureTemplates.ts — single source of truth for QuickCapture predefined templates.
 *
 * Each template provides a structured body scaffold so users can fill in
 * content without having to retype repeated structural elements.
 * Templates are tagged so captured notes are discoverable by tag search.
 */

export interface CaptureTemplate {
  id: string
  name: string
  emoji: string
  body: string
}

/**
 * Built-in capture templates covering the most common note types.
 * Keep this list in sync with the dropdown rendered in QuickCaptureModal.
 */
export const CAPTURE_TEMPLATES: ReadonlyArray<CaptureTemplate> = [
  {
    id: 'todo',
    name: 'TODO',
    emoji: '✅',
    body: 'TODO: \n\n#followup',
  },
  {
    id: 'decision',
    name: '決策',
    emoji: '⚖️',
    body: '## Decision\n\n\n\n## Reason\n\n\n\n## Alternatives\n\n\n\n#decision',
  },
  {
    id: 'bug',
    name: 'Bug',
    emoji: '🐛',
    body: '### Symptom\n\n\n\n### Reproduction\n\n\n\n### Expected\n\n\n\n### Actual\n\n\n\n#bug',
  },
  {
    id: 'idea',
    name: '想法',
    emoji: '💡',
    body: '💡 \n\n## Why interesting\n\n\n\n## Next step\n\n\n\n#idea',
  },
  {
    id: 'meeting',
    name: '會議筆記',
    emoji: '🗣️',
    body: '## Meeting\n\n### Attendees\n\n\n\n### Discussion\n\n\n\n### Action items\n\n\n\n#meeting',
  },
] as const

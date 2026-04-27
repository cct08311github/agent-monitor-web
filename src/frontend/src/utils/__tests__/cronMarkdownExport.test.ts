import { describe, it, expect } from 'vitest'
import { buildCronMarkdown } from '../cronMarkdownExport'
import type { CronMdJob, CronMdInput } from '../cronMarkdownExport'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date(2026, 3, 26, 15, 0, 0) // 2026-04-26 15:00

const jobA: CronMdJob = {
  id: 'job-alpha',
  name: 'Alpha Job',
  schedule: { expr: '0 9 * * *' },
  description: 'Morning sync task',
  enabled: true,
}

const jobB: CronMdJob = {
  id: 'job-beta',
  name: 'Beta Job',
  schedule: { expr: '*/30 * * * *' },
  description: null,
  enabled: false,
}

const jobC: CronMdJob = {
  id: 'job-gamma',
  // name intentionally absent to test id fallback
  schedule: { expr: '0 0 * * 0' },
  enabled: true,
}

const emptyInput: CronMdInput = {
  jobs: [],
  aliases: new Map(),
  tagsMap: new Map(),
  pinned: [],
  archived: [],
}

function makeInput(overrides: Partial<CronMdInput> = {}): CronMdInput {
  return { ...emptyInput, ...overrides }
}

// ---------------------------------------------------------------------------
// filename
// ---------------------------------------------------------------------------

describe('buildCronMarkdown — filename', () => {
  it('filename matches cron-jobs-YYYY-MM-DD.md pattern', () => {
    const { filename } = buildCronMarkdown(emptyInput, NOW)
    expect(filename).toMatch(/^cron-jobs-\d{4}-\d{2}-\d{2}\.md$/)
  })

  it('filename encodes the injectable date', () => {
    const { filename } = buildCronMarkdown(emptyInput, NOW)
    expect(filename).toBe('cron-jobs-2026-04-26.md')
  })

  it('filename pads month and day with leading zeros', () => {
    const early = new Date(2024, 0, 7, 8, 5, 0) // 2024-01-07
    const { filename } = buildCronMarkdown(emptyInput, early)
    expect(filename).toBe('cron-jobs-2024-01-07.md')
  })
})

// ---------------------------------------------------------------------------
// header
// ---------------------------------------------------------------------------

describe('buildCronMarkdown — header', () => {
  it('content contains the # Cron Jobs Export heading', () => {
    const { content } = buildCronMarkdown(emptyInput, NOW)
    expect(content).toContain('# Cron Jobs Export')
  })

  it('includes 匯出時間 line', () => {
    const { content } = buildCronMarkdown(emptyInput, NOW)
    expect(content).toContain('**匯出時間:**')
  })

  it('includes formatted export timestamp', () => {
    const { content } = buildCronMarkdown(emptyInput, NOW)
    // 2026-04-26 15:00
    expect(content).toContain('2026-04-26 15:00')
  })

  it('timestamp pads hours and minutes', () => {
    const earlyNow = new Date(2026, 0, 7, 8, 5, 0) // 08:05
    const { content } = buildCronMarkdown(emptyInput, earlyNow)
    expect(content).toContain('2026-01-07 08:05')
  })

  it('includes 總數 line with job count', () => {
    const { content } = buildCronMarkdown(
      makeInput({ jobs: [jobA, jobB], pinned: ['job-alpha'], archived: ['job-beta'] }),
      NOW,
    )
    expect(content).toContain('**總數:** 2 jobs (1 釘選, 1 已封存)')
  })

  it('總數 shows 0 釘選 and 0 已封存 when none', () => {
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobA] }), NOW)
    expect(content).toContain('**總數:** 1 jobs (0 釘選, 0 已封存)')
  })

  it('contains a horizontal rule separator', () => {
    const { content } = buildCronMarkdown(emptyInput, NOW)
    expect(content).toContain('---')
  })
})

// ---------------------------------------------------------------------------
// empty jobs
// ---------------------------------------------------------------------------

describe('buildCronMarkdown — empty jobs', () => {
  it('empty jobs renders _無 jobs_ placeholder', () => {
    const { content } = buildCronMarkdown(emptyInput, NOW)
    expect(content).toContain('_無 jobs_')
  })

  it('non-empty jobs do not show the placeholder', () => {
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobA] }), NOW)
    expect(content).not.toContain('_無 jobs_')
  })

  it('empty export ends with a trailing newline', () => {
    const { content } = buildCronMarkdown(emptyInput, NOW)
    expect(content.endsWith('\n')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// per-job sections
// ---------------------------------------------------------------------------

describe('buildCronMarkdown — per-job sections', () => {
  it('each job produces an H2 heading', () => {
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobA, jobB] }), NOW)
    const headings = content.split('\n').filter((l) => l.startsWith('## '))
    expect(headings).toHaveLength(2)
  })

  it('job heading uses job name', () => {
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobA] }), NOW)
    expect(content).toContain('## Alpha Job')
  })

  it('job heading falls back to job id when name is absent', () => {
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobC] }), NOW)
    expect(content).toContain('## job-gamma')
  })

  it('includes ID field with backtick-wrapped id', () => {
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobA] }), NOW)
    expect(content).toContain('- **ID:** `job-alpha`')
  })

  it('includes Schedule field when expr is present', () => {
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobA] }), NOW)
    expect(content).toContain('- **Schedule:** `0 9 * * *`')
  })

  it('omits Schedule field when expr is absent', () => {
    const noScheduleJob: CronMdJob = { id: 'no-sched', enabled: true }
    const { content } = buildCronMarkdown(makeInput({ jobs: [noScheduleJob] }), NOW)
    expect(content).not.toContain('**Schedule:**')
  })

  it('enabled job shows ✅ Enabled status', () => {
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobA] }), NOW)
    expect(content).toContain('- **Status:** ✅ Enabled')
  })

  it('disabled job shows ⛔ Disabled status', () => {
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobB] }), NOW)
    expect(content).toContain('- **Status:** ⛔ Disabled')
  })

  it('includes description when present', () => {
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobA] }), NOW)
    expect(content).toContain('Morning sync task')
  })

  it('omits description when null', () => {
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobB] }), NOW)
    // jobB has null description; no blank content for it
    const lines = content.split('\n')
    // Should not have an empty description line after Status
    const statusIdx = lines.findIndex((l) => l.includes('⛔ Disabled'))
    expect(statusIdx).toBeGreaterThan(-1)
    // Next non-empty line should be empty (blank line before ---)
    const nextNonEmpty = lines.slice(statusIdx + 1).find((l) => l.trim() !== '')
    expect(nextNonEmpty).toBe('---')
  })

  it('content ends with trailing newline for non-empty jobs', () => {
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobA] }), NOW)
    expect(content.endsWith('\n')).toBe(true)
  })

  it('multiple jobs each get a separator', () => {
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobA, jobB] }), NOW)
    // Count occurrences of ---
    const sepCount = content.split('\n').filter((l) => l === '---').length
    // 1 header separator + 2 job separators
    expect(sepCount).toBeGreaterThanOrEqual(3)
  })
})

// ---------------------------------------------------------------------------
// pinned jobs
// ---------------------------------------------------------------------------

describe('buildCronMarkdown — pinned jobs', () => {
  it('pinned job heading has 📌 prefix', () => {
    const { content } = buildCronMarkdown(
      makeInput({ jobs: [jobA], pinned: ['job-alpha'] }),
      NOW,
    )
    expect(content).toContain('## 📌 Alpha Job')
  })

  it('non-pinned job heading has no 📌 prefix', () => {
    const { content } = buildCronMarkdown(
      makeInput({ jobs: [jobA], pinned: [] }),
      NOW,
    )
    expect(content).not.toContain('📌')
  })

  it('only the pinned job gets 📌 when multiple jobs', () => {
    const { content } = buildCronMarkdown(
      makeInput({ jobs: [jobA, jobB], pinned: ['job-alpha'] }),
      NOW,
    )
    const headings = content.split('\n').filter((l) => l.startsWith('## '))
    expect(headings[0]).toContain('📌')
    expect(headings[1]).not.toContain('📌')
  })
})

// ---------------------------------------------------------------------------
// archived jobs
// ---------------------------------------------------------------------------

describe('buildCronMarkdown — archived jobs', () => {
  it('archived job heading uses strikethrough', () => {
    const { content } = buildCronMarkdown(
      makeInput({ jobs: [jobB], archived: ['job-beta'] }),
      NOW,
    )
    expect(content).toContain('## ~~Beta Job~~')
  })

  it('non-archived job heading has no strikethrough', () => {
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobA] }), NOW)
    expect(content).not.toContain('~~')
  })

  it('archived + pinned job combines both markers', () => {
    const { content } = buildCronMarkdown(
      makeInput({ jobs: [jobA], pinned: ['job-alpha'], archived: ['job-alpha'] }),
      NOW,
    )
    expect(content).toContain('## 📌 ~~Alpha Job~~')
  })
})

// ---------------------------------------------------------------------------
// aliases
// ---------------------------------------------------------------------------

describe('buildCronMarkdown — aliases', () => {
  it('alias is used as display name in heading', () => {
    const aliases = new Map([['job-alpha', 'My Custom Name']])
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobA], aliases }), NOW)
    expect(content).toContain('## My Custom Name')
    expect(content).not.toContain('## Alpha Job')
  })

  it('alias line appears in the job section', () => {
    const aliases = new Map([['job-alpha', 'My Custom Name']])
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobA], aliases }), NOW)
    expect(content).toContain('- **別名:** My Custom Name')
  })

  it('no 別名 line when alias is absent', () => {
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobA] }), NOW)
    expect(content).not.toContain('**別名:**')
  })

  it('id is still shown in ID field even when alias is set', () => {
    const aliases = new Map([['job-alpha', 'Aliased']])
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobA], aliases }), NOW)
    expect(content).toContain('- **ID:** `job-alpha`')
  })
})

// ---------------------------------------------------------------------------
// tags
// ---------------------------------------------------------------------------

describe('buildCronMarkdown — tags', () => {
  it('includes tags in Tags field with #tag format', () => {
    const tagsMap = new Map<string, string[]>([['job-alpha', ['sync', 'prod']]])
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobA], tagsMap }), NOW)
    expect(content).toContain('- **Tags:** `#sync` `#prod`')
  })

  it('no Tags line when job has no tags', () => {
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobA] }), NOW)
    expect(content).not.toContain('**Tags:**')
  })

  it('single tag renders correctly', () => {
    const tagsMap = new Map<string, string[]>([['job-alpha', ['daily']]])
    const { content } = buildCronMarkdown(makeInput({ jobs: [jobA], tagsMap }), NOW)
    expect(content).toContain('- **Tags:** `#daily`')
  })
})

// ---------------------------------------------------------------------------
// graceful missing fields
// ---------------------------------------------------------------------------

describe('buildCronMarkdown — graceful missing fields', () => {
  it('job with only id renders without error', () => {
    const minimalJob: CronMdJob = { id: 'minimal' }
    const { content } = buildCronMarkdown(makeInput({ jobs: [minimalJob] }), NOW)
    expect(content).toContain('## minimal')
    expect(content).toContain('- **ID:** `minimal`')
    expect(content).not.toContain('**Schedule:**')
    expect(content).not.toContain('**別名:**')
    expect(content).not.toContain('**Tags:**')
  })

  it('job with enabled=undefined shows Disabled', () => {
    const undefinedEnabled: CronMdJob = { id: 'undef-en' }
    const { content } = buildCronMarkdown(makeInput({ jobs: [undefinedEnabled] }), NOW)
    expect(content).toContain('⛔ Disabled')
  })

  it('job with null name falls back to id in heading', () => {
    const nullName: CronMdJob = { id: 'null-name', name: null, enabled: true }
    const { content } = buildCronMarkdown(makeInput({ jobs: [nullName] }), NOW)
    expect(content).toContain('## null-name')
  })

  it('job with empty schedule.expr omits Schedule field', () => {
    const emptyExpr: CronMdJob = { id: 'empty-expr', schedule: { expr: '' }, enabled: true }
    const { content } = buildCronMarkdown(makeInput({ jobs: [emptyExpr] }), NOW)
    expect(content).not.toContain('**Schedule:**')
  })
})

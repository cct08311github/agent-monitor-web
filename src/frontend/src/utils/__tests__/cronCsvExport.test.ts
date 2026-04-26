import { describe, it, expect } from 'vitest'
import { buildCronCsv } from '../cronCsvExport'
import type { CronCsvJob, CronCsvInput } from '../cronCsvExport'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const j1: CronCsvJob = {
  id: 'cron-001',
  name: 'Daily Backup',
  schedule: { expr: '0 2 * * *' },
  description: 'Backs up the database',
  enabled: true,
}

const j2: CronCsvJob = {
  id: 'cron-002',
  name: 'Weekly Report',
  schedule: { expr: '0 9 * * 1' },
  description: null,
  enabled: false,
}

const j3: CronCsvJob = {
  id: 'cron-003',
  name: null,
  schedule: { expr: '*/5 * * * *' },
  description: 'Has a "quoted" description, with comma',
  enabled: true,
}

const j4: CronCsvJob = {
  id: 'cron-004',
  name: 'No Schedule',
  schedule: null,
  description: null,
  enabled: false,
}

function makeInput(
  jobs: CronCsvJob[],
  overrides: Partial<Omit<CronCsvInput<CronCsvJob>, 'jobs'>> = {},
): CronCsvInput<CronCsvJob> {
  return {
    jobs,
    aliases: new Map(),
    tagsMap: new Map(),
    archivedIds: new Set(),
    pinnedIds: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// header
// ---------------------------------------------------------------------------

describe('buildCronCsv — header', () => {
  it('header row matches expected 8 columns', () => {
    const { content } = buildCronCsv(makeInput([]), new Date(2026, 3, 26))
    const firstLine = content.split('\n')[0]
    expect(firstLine).toBe('id,displayName,cronExpression,description,enabled,tags,archived,pinned')
  })

  it('empty jobs array produces only header + trailing newline', () => {
    const { content } = buildCronCsv(makeInput([]), new Date(2026, 3, 26))
    expect(content).toBe('id,displayName,cronExpression,description,enabled,tags,archived,pinned\n')
  })
})

// ---------------------------------------------------------------------------
// filename
// ---------------------------------------------------------------------------

describe('buildCronCsv — filename', () => {
  it('filename matches cron-jobs-YYYY-MM-DD.csv pattern', () => {
    const { filename } = buildCronCsv(makeInput([]), new Date(2026, 3, 26))
    expect(filename).toMatch(/^cron-jobs-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(filename).toBe('cron-jobs-2026-04-26.csv')
  })

  it('filename uses the injectable now date', () => {
    const { filename } = buildCronCsv(makeInput([]), new Date(2024, 0, 5))
    expect(filename).toBe('cron-jobs-2024-01-05.csv')
  })

  it('filename pads month and day with leading zero', () => {
    const { filename } = buildCronCsv(makeInput([]), new Date(2026, 0, 7)) // Jan 7
    expect(filename).toBe('cron-jobs-2026-01-07.csv')
  })
})

// ---------------------------------------------------------------------------
// basic rows
// ---------------------------------------------------------------------------

describe('buildCronCsv — rows', () => {
  it('produces one data row per job', () => {
    const { content } = buildCronCsv(makeInput([j1, j2]), new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    expect(lines.length).toBe(3) // header + 2 rows
  })

  it('simple job row has correct column values', () => {
    const { content } = buildCronCsv(makeInput([j1]), new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toBe(
      'cron-001,Daily Backup,0 2 * * *,Backs up the database,true,,false,false',
    )
  })

  it('disabled job has enabled=false', () => {
    const { content } = buildCronCsv(makeInput([j2]), new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toContain(',false,')
  })

  it('job with null schedule produces empty cronExpression column', () => {
    const { content } = buildCronCsv(makeInput([j4]), new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    // id,displayName,<empty cronExpr>,...
    expect(lines[1]).toMatch(/^cron-004,No Schedule,,/)
  })
})

// ---------------------------------------------------------------------------
// displayName resolution
// ---------------------------------------------------------------------------

describe('buildCronCsv — displayName', () => {
  it('uses alias as displayName when alias is set', () => {
    const aliases = new Map([['cron-001', 'My Custom Alias']])
    const { content } = buildCronCsv(makeInput([j1], { aliases }), new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toContain('My Custom Alias')
    expect(lines[1]).not.toContain('Daily Backup')
  })

  it('falls back to job.name when no alias', () => {
    const { content } = buildCronCsv(makeInput([j2]), new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toContain('Weekly Report')
  })

  it('falls back to job.id when both alias and name are absent', () => {
    const { content } = buildCronCsv(makeInput([j3]), new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    // j3.name is null, no alias → use id
    expect(lines[1]).toMatch(/^cron-003,cron-003,/)
  })
})

// ---------------------------------------------------------------------------
// tags
// ---------------------------------------------------------------------------

describe('buildCronCsv — tags', () => {
  it('joins multiple tags with a single space', () => {
    const tagsMap = new Map<string, string[]>([['cron-001', ['backup', 'db', 'nightly']]])
    const { content } = buildCronCsv(makeInput([j1], { tagsMap }), new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toContain('backup db nightly')
  })

  it('empty tags column for job with no tags', () => {
    const { content } = buildCronCsv(makeInput([j1]), new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    // tags column (index 5) should be empty — ends in ,,,
    const cols = lines[1].split(',')
    expect(cols[5]).toBe('')
  })
})

// ---------------------------------------------------------------------------
// archived / pinned booleans
// ---------------------------------------------------------------------------

describe('buildCronCsv — archived / pinned', () => {
  it('archived=true when job id is in archivedIds', () => {
    const archivedIds = new Set(['cron-002'])
    const { content } = buildCronCsv(makeInput([j1, j2], { archivedIds }), new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    const j1Row = lines[1]
    const j2Row = lines[2]
    expect(j1Row).toContain(',false,')  // j1 not archived
    expect(j2Row).toContain(',true,')   // j2 archived
  })

  it('pinned=true when job id is in pinnedIds', () => {
    const pinnedIds = ['cron-001']
    const { content } = buildCronCsv(makeInput([j1, j2], { pinnedIds }), new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    const j1Row = lines[1]
    const j2Row = lines[2]
    // last column is pinned
    expect(j1Row.endsWith(',true')).toBe(true)
    expect(j2Row.endsWith(',false')).toBe(true)
  })

  it('archived and pinned both false by default', () => {
    const { content } = buildCronCsv(makeInput([j1]), new Date(2026, 3, 26))
    const lines = content.trimEnd().split('\n')
    expect(lines[1]).toMatch(/,false,false$/)
  })
})

// ---------------------------------------------------------------------------
// RFC-4180 escaping
// ---------------------------------------------------------------------------

describe('buildCronCsv — RFC-4180 escaping', () => {
  it('wraps description containing comma in double-quotes', () => {
    const { content } = buildCronCsv(makeInput([j3]), new Date(2026, 3, 26))
    expect(content).toContain('"Has a ""quoted"" description, with comma"')
  })

  it('wraps displayName containing comma in double-quotes', () => {
    const job: CronCsvJob = { id: 'x', name: 'A, B', enabled: true }
    const { content } = buildCronCsv(makeInput([job]), new Date(2026, 3, 26))
    expect(content).toContain('"A, B"')
  })

  it('wraps tag containing newline in double-quotes', () => {
    const job: CronCsvJob = { id: 'y', name: 'Y', enabled: true }
    const tagsMap = new Map<string, string[]>([['y', ['tag\nnewline']]])
    const { content } = buildCronCsv(makeInput([job], { tagsMap }), new Date(2026, 3, 26))
    expect(content).toContain('"tag\nnewline"')
  })
})

// ---------------------------------------------------------------------------
// trailing newline
// ---------------------------------------------------------------------------

describe('buildCronCsv — trailing newline', () => {
  it('content ends with a trailing newline', () => {
    const { content } = buildCronCsv(makeInput([j1]), new Date(2026, 3, 26))
    expect(content.endsWith('\n')).toBe(true)
  })

  it('empty export also ends with a trailing newline', () => {
    const { content } = buildCronCsv(makeInput([]), new Date(2026, 3, 26))
    expect(content.endsWith('\n')).toBe(true)
  })
})

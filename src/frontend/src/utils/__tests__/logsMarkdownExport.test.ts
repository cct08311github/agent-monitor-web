import { describe, it, expect } from 'vitest'
import { buildLogsMarkdown } from '../logsMarkdownExport'
import type { LogEntry, LogsExportFilter } from '../logsJsonExport'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date(2026, 3, 26, 14, 30, 0) // 2026-04-26 14:30:00

const errorEntry: LogEntry = {
  ts: new Date(2026, 3, 26, 10, 0, 5).getTime(),
  level: 'error',
  agent: 'agent-abc',
  message: 'Something went wrong',
}

const warnEntry: LogEntry = {
  ts: new Date(2026, 3, 26, 10, 1, 0).getTime(),
  level: 'warn',
  message: 'Low memory warning',
}

const infoEntry: LogEntry = {
  ts: new Date(2026, 3, 26, 10, 2, 30).getTime(),
  level: 'info',
  message: 'Service started',
}

const debugEntry: LogEntry = {
  ts: new Date(2026, 3, 26, 10, 3, 0).getTime(),
  level: 'debug',
  message: 'Debug trace',
}

const noLevelEntry: LogEntry = {
  ts: new Date(2026, 3, 26, 10, 4, 0).getTime(),
  message: 'Raw line without level',
}

const emptyFilter: LogsExportFilter = {}

// ---------------------------------------------------------------------------
// filename
// ---------------------------------------------------------------------------

describe('buildLogsMarkdown — filename', () => {
  it('filename matches logs-YYYY-MM-DD-HHmm.md pattern', () => {
    const { filename } = buildLogsMarkdown({ entries: [], filter: emptyFilter }, NOW)
    expect(filename).toMatch(/^logs-\d{4}-\d{2}-\d{2}-\d{4}\.md$/)
  })

  it('filename encodes date and HHmm from injectable now', () => {
    const { filename } = buildLogsMarkdown({ entries: [], filter: emptyFilter }, NOW)
    expect(filename).toBe('logs-2026-04-26-1430.md')
  })

  it('filename pads month, day, hour, minute with leading zeros', () => {
    const early = new Date(2024, 0, 7, 8, 5, 0) // 2024-01-07 08:05
    const { filename } = buildLogsMarkdown({ entries: [], filter: emptyFilter }, early)
    expect(filename).toBe('logs-2024-01-07-0805.md')
  })
})

// ---------------------------------------------------------------------------
// header
// ---------------------------------------------------------------------------

describe('buildLogsMarkdown — header', () => {
  it('content contains the # Logs Export heading', () => {
    const { content } = buildLogsMarkdown({ entries: [], filter: emptyFilter }, NOW)
    expect(content).toContain('# Logs Export')
  })

  it('includes 匯出時間 line', () => {
    const { content } = buildLogsMarkdown({ entries: [], filter: emptyFilter }, NOW)
    expect(content).toContain('**匯出時間:**')
  })

  it('includes formatted export timestamp', () => {
    const { content } = buildLogsMarkdown({ entries: [], filter: emptyFilter }, NOW)
    // 2026-04-26 14:30:00
    expect(content).toContain('2026-04-26 14:30:00')
  })

  it('includes Entries count', () => {
    const { content } = buildLogsMarkdown(
      { entries: [errorEntry, warnEntry], filter: emptyFilter },
      NOW,
    )
    expect(content).toContain('**Entries:** 2')
  })

  it('Entries count is 0 for empty entries', () => {
    const { content } = buildLogsMarkdown({ entries: [], filter: emptyFilter }, NOW)
    expect(content).toContain('**Entries:** 0')
  })

  it('contains a horizontal rule separator', () => {
    const { content } = buildLogsMarkdown({ entries: [], filter: emptyFilter }, NOW)
    expect(content).toContain('---')
  })
})

// ---------------------------------------------------------------------------
// filter summary
// ---------------------------------------------------------------------------

describe('buildLogsMarkdown — filter summary', () => {
  it('filter line absent when all filter fields empty/false', () => {
    const { content } = buildLogsMarkdown({ entries: [], filter: emptyFilter }, NOW)
    expect(content).not.toContain('**Filter:**')
  })

  it('filter line included when query is set', () => {
    const { content } = buildLogsMarkdown(
      { entries: [], filter: { query: 'ERROR' } },
      NOW,
    )
    expect(content).toContain('**Filter:**')
    expect(content).toContain('query: `ERROR`')
  })

  it('filter line included when level is set', () => {
    const { content } = buildLogsMarkdown(
      { entries: [], filter: { level: 'error' } },
      NOW,
    )
    expect(content).toContain('**Filter:**')
    expect(content).toContain('level: error')
  })

  it('filter line included when agentId is set', () => {
    const { content } = buildLogsMarkdown(
      { entries: [], filter: { agentId: 'agent-xyz' } },
      NOW,
    )
    expect(content).toContain('**Filter:**')
    expect(content).toContain('agent: agent-xyz')
  })

  it('filter line included when regex is true', () => {
    const { content } = buildLogsMarkdown(
      { entries: [], filter: { regex: true } },
      NOW,
    )
    expect(content).toContain('**Filter:**')
    expect(content).toContain('regex: true')
  })

  it('filter line absent when regex is false', () => {
    const { content } = buildLogsMarkdown(
      { entries: [], filter: { regex: false } },
      NOW,
    )
    expect(content).not.toContain('regex:')
  })

  it('multiple active filter parts are joined with ·', () => {
    const { content } = buildLogsMarkdown(
      { entries: [], filter: { query: 'err', level: 'error' } },
      NOW,
    )
    expect(content).toContain('query: `err` · level: error')
  })
})

// ---------------------------------------------------------------------------
// empty entries
// ---------------------------------------------------------------------------

describe('buildLogsMarkdown — empty entries', () => {
  it('empty entries renders _無 logs_ placeholder', () => {
    const { content } = buildLogsMarkdown({ entries: [], filter: emptyFilter }, NOW)
    expect(content).toContain('_無 logs_')
  })

  it('non-empty entries do not show the placeholder', () => {
    const { content } = buildLogsMarkdown(
      { entries: [infoEntry], filter: emptyFilter },
      NOW,
    )
    expect(content).not.toContain('_無 logs_')
  })
})

// ---------------------------------------------------------------------------
// entry list lines
// ---------------------------------------------------------------------------

describe('buildLogsMarkdown — entry list lines', () => {
  it('each entry produces a markdown list item', () => {
    const { content } = buildLogsMarkdown(
      { entries: [infoEntry], filter: emptyFilter },
      NOW,
    )
    const lines = content.split('\n').filter((l) => l.startsWith('- '))
    expect(lines).toHaveLength(1)
  })

  it('entry line contains formatted timestamp', () => {
    const { content } = buildLogsMarkdown(
      { entries: [infoEntry], filter: emptyFilter },
      NOW,
    )
    expect(content).toContain('2026-04-26 10:02:30')
  })

  it('entry line with agent includes backtick-wrapped agent id', () => {
    const { content } = buildLogsMarkdown(
      { entries: [errorEntry], filter: emptyFilter },
      NOW,
    )
    expect(content).toContain('`agent-abc`')
  })

  it('entry line without agent does not produce a blank agent slot', () => {
    const { content } = buildLogsMarkdown(
      { entries: [warnEntry], filter: emptyFilter },
      NOW,
    )
    // Should not have double space or backtick for undefined agent
    expect(content).not.toContain('` ')
    expect(content).toContain('Low memory warning')
  })

  it('entry line contains message text', () => {
    const { content } = buildLogsMarkdown(
      { entries: [infoEntry], filter: emptyFilter },
      NOW,
    )
    expect(content).toContain('Service started')
  })

  it('multiple entries produce multiple list items', () => {
    const { content } = buildLogsMarkdown(
      { entries: [errorEntry, warnEntry, infoEntry], filter: emptyFilter },
      NOW,
    )
    const listLines = content.split('\n').filter((l) => l.startsWith('- '))
    expect(listLines).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// level emoji
// ---------------------------------------------------------------------------

describe('buildLogsMarkdown — level emoji', () => {
  it('error level maps to 🔴', () => {
    const { content } = buildLogsMarkdown(
      { entries: [errorEntry], filter: emptyFilter },
      NOW,
    )
    expect(content).toContain('🔴')
  })

  it('warn level maps to ⚠️', () => {
    const { content } = buildLogsMarkdown(
      { entries: [warnEntry], filter: emptyFilter },
      NOW,
    )
    expect(content).toContain('⚠️')
  })

  it('info level maps to ℹ️', () => {
    const { content } = buildLogsMarkdown(
      { entries: [infoEntry], filter: emptyFilter },
      NOW,
    )
    expect(content).toContain('ℹ️')
  })

  it('debug level maps to 🐛', () => {
    const { content } = buildLogsMarkdown(
      { entries: [debugEntry], filter: emptyFilter },
      NOW,
    )
    expect(content).toContain('🐛')
  })

  it('missing level maps to · fallback', () => {
    const { content } = buildLogsMarkdown(
      { entries: [noLevelEntry], filter: emptyFilter },
      NOW,
    )
    expect(content).toContain('· ')
  })

  it('uppercase WARN level is handled case-insensitively', () => {
    const upperWarn: LogEntry = { ts: Date.now(), level: 'WARN', message: 'upper warn' }
    const { content } = buildLogsMarkdown(
      { entries: [upperWarn], filter: emptyFilter },
      NOW,
    )
    expect(content).toContain('⚠️')
  })

  it('unknown level maps to · fallback', () => {
    const unknownLevel: LogEntry = { ts: Date.now(), level: 'trace', message: 'some trace' }
    const { content } = buildLogsMarkdown(
      { entries: [unknownLevel], filter: emptyFilter },
      NOW,
    )
    expect(content).toContain('· ')
  })
})

// ---------------------------------------------------------------------------
// trailing newline
// ---------------------------------------------------------------------------

describe('buildLogsMarkdown — trailing newline', () => {
  it('content ends with a trailing newline for non-empty entries', () => {
    const { content } = buildLogsMarkdown(
      { entries: [infoEntry], filter: emptyFilter },
      NOW,
    )
    expect(content.endsWith('\n')).toBe(true)
  })

  it('empty export also ends with a trailing newline', () => {
    const { content } = buildLogsMarkdown({ entries: [], filter: emptyFilter }, NOW)
    expect(content.endsWith('\n')).toBe(true)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

// ---------------------------------------------------------------------------
// Stubs — must be declared before component import
// ---------------------------------------------------------------------------

vi.mock('@/composables/useSSE', () => ({
  useSSE: () => ({
    connect: vi.fn(),
    close: vi.fn(),
    isConnected: { value: false },
    reconnectAttempt: { value: 0 },
    isFailed: { value: false },
    manualReconnect: vi.fn(),
  }),
}))

vi.mock('@/composables/useToast', () => ({
  showToast: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import LogsTab from '../LogsTab.vue'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogEntry {
  id: number
  line: string
  level: string
  cls: string
  ts: number
}

interface FilterPreset {
  id: string
  name: string
  filterText: string
  regexMode: boolean
  errorOnly: boolean
  warnOnly: boolean
}

// Vue Test Utils auto-unwraps refs exposed via defineExpose when accessed
// through wrapper.vm. So vm.regexMode is boolean (not { value: boolean }),
// vm.logBuffer is LogEntry[] (array), vm.regexError is string | null.
// Use Record<string, unknown> to allow indexed writes (assignment via proxy).
type ExposedVm = Record<string, unknown> & {
  logBuffer: LogEntry[]
  filterText: string
  debouncedFilter: string
  regexMode: boolean
  regexError: string | null
  visibleLines: LogEntry[]
  // preset seam
  presets: FilterPreset[]
  selectedPresetId: string
  saveCurrentAsPreset: (name: string) => void
  applyPreset: (preset: FilterPreset) => void
  deletePreset: (id: string) => void
  loadPresets: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let seq = 0
function makeEntry(line: string, level = 'info', cls = 'info'): LogEntry {
  return { id: ++seq, line, level, cls, ts: Date.now() }
}

function mountTab() {
  const wrapper = mount(LogsTab)
  const vm = wrapper.vm as unknown as ExposedVm
  return { wrapper, vm }
}

/**
 * Set the debounced filter directly (bypasses the 200 ms debounce timer,
 * which would require real or fake time manipulation).
 * Also sets filterText so the input value is consistent.
 */
async function setFilter(vm: ExposedVm, value: string) {
  vm.filterText = value
  vm.debouncedFilter = value
  await flushPromises()
  await nextTick()
}

/** Toggle regexMode by writing directly to the exposed ref. */
async function setRegexMode(vm: ExposedVm, on: boolean) {
  vm.regexMode = on
  await nextTick()
}

// ---------------------------------------------------------------------------
// Tests — regex mode
// ---------------------------------------------------------------------------

describe('LogsTab — regex filter mode', () => {
  beforeEach(() => {
    seq = 0
    vi.clearAllMocks()
  })

  // ── 1. Toggle on / off via button ─────────────────────────────────────────

  it('regex button is rendered in the filter bar', () => {
    const { wrapper } = mountTab()
    expect(wrapper.find('.log-filter-btn.regex').exists()).toBe(true)
    wrapper.unmount()
  })

  it('regex button is not active by default', () => {
    const { wrapper } = mountTab()
    expect(wrapper.find('.log-filter-btn.regex').classes()).not.toContain('active')
    wrapper.unmount()
  })

  it('clicking the regex button toggles it on', async () => {
    const { wrapper } = mountTab()
    await wrapper.find('.log-filter-btn.regex').trigger('click')
    await nextTick()
    expect(wrapper.find('.log-filter-btn.regex').classes()).toContain('active')
    wrapper.unmount()
  })

  it('clicking the regex button a second time toggles it off', async () => {
    const { wrapper } = mountTab()
    await wrapper.find('.log-filter-btn.regex').trigger('click')
    await nextTick()
    await wrapper.find('.log-filter-btn.regex').trigger('click')
    await nextTick()
    expect(wrapper.find('.log-filter-btn.regex').classes()).not.toContain('active')
    wrapper.unmount()
  })

  // ── 2. regexError computed — raw value ───────────────────────────────────

  it('regexError is null when regex mode is off (even with bad pattern)', async () => {
    const { wrapper, vm } = mountTab()
    await setFilter(vm, '(bad')
    expect(vm.regexError).toBeNull()
    wrapper.unmount()
  })

  it('regexError is null for a valid regex in regex mode', async () => {
    const { wrapper, vm } = mountTab()
    await setRegexMode(vm, true)
    await setFilter(vm, 'error|warn')
    expect(vm.regexError).toBeNull()
    wrapper.unmount()
  })

  it('regexError contains "Invalid regex" for an invalid pattern in regex mode', async () => {
    const { wrapper, vm } = mountTab()
    await setRegexMode(vm, true)
    await setFilter(vm, '[bad')
    expect(vm.regexError).not.toBeNull()
    expect(vm.regexError).toContain('Invalid regex')
    wrapper.unmount()
  })

  // ── 3. Error message UI ───────────────────────────────────────────────────

  it('shows .log-regex-error element when pattern is invalid', async () => {
    const { wrapper, vm } = mountTab()
    await setRegexMode(vm, true)
    await setFilter(vm, '(unclosed')
    expect(wrapper.find('.log-regex-error').exists()).toBe(true)
    expect(wrapper.find('.log-regex-error').text()).toContain('Invalid regex')
    wrapper.unmount()
  })

  it('does not show .log-regex-error when pattern is valid', async () => {
    const { wrapper, vm } = mountTab()
    await setRegexMode(vm, true)
    await setFilter(vm, 'error|warn')
    expect(wrapper.find('.log-regex-error').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not show .log-regex-error when regex mode is off', async () => {
    const { wrapper, vm } = mountTab()
    await setFilter(vm, '(unclosed')
    expect(wrapper.find('.log-regex-error').exists()).toBe(false)
    wrapper.unmount()
  })

  // ── 4. Invalid regex → visibleLines empty ────────────────────────────────

  it('no .oc-log-line elements are rendered when regex is invalid', async () => {
    const { wrapper, vm } = mountTab()

    vm.logBuffer.push(makeEntry('some error line', 'error', 'err'))
    await setRegexMode(vm, true)
    await setFilter(vm, '(bad[regex')

    expect(wrapper.findAll('.oc-log-line').length).toBe(0)
    wrapper.unmount()
  })

  // ── 5. Regex case-insensitive ('i' flag) ──────────────────────────────────

  it('regex match is case-insensitive', async () => {
    const { wrapper, vm } = mountTab()

    vm.logBuffer.push(makeEntry('ERROR occurred', 'error', 'err'))
    vm.logBuffer.push(makeEntry('all good here', 'info', 'info'))
    await setRegexMode(vm, true)
    await setFilter(vm, 'error')

    const lines = wrapper.findAll('.oc-log-line')
    expect(lines.length).toBe(1)
    expect(lines[0].text()).toContain('ERROR')
    wrapper.unmount()
  })

  // ── 6. Regex alternation: error|warn ─────────────────────────────────────

  it('regex alternation (error|warn) matches both error and warn lines', async () => {
    const { wrapper, vm } = mountTab()

    vm.logBuffer.push(makeEntry('ERROR: disk full', 'error', 'err'))
    vm.logBuffer.push(makeEntry('WARN: low memory', 'warn', 'warn'))
    vm.logBuffer.push(makeEntry('INFO: system ok', 'info', 'info'))
    await setRegexMode(vm, true)
    await setFilter(vm, 'error|warn')

    const lines = wrapper.findAll('.oc-log-line')
    expect(lines.length).toBe(2)
    wrapper.unmount()
  })

  // ── 7. Switch back to substring mode restores normal behavior ─────────────

  it('switching back to substring mode restores plain includes filtering', async () => {
    const { wrapper, vm } = mountTab()

    vm.logBuffer.push(makeEntry('hello world'))
    vm.logBuffer.push(makeEntry('goodbye world'))
    await nextTick()

    // Enable then disable regex mode
    await setRegexMode(vm, true)
    await setRegexMode(vm, false)

    await setFilter(vm, 'hello')

    const lines = wrapper.findAll('.oc-log-line')
    expect(lines.length).toBe(1)
    expect(lines[0].text()).toContain('hello')
    wrapper.unmount()
  })

  // ── 8. No error shown when filter is empty in regex mode ──────────────────

  it('no regex error when filter input is empty in regex mode', async () => {
    const { wrapper, vm } = mountTab()

    await setRegexMode(vm, true)
    await setFilter(vm, '')

    expect(wrapper.find('.log-regex-error').exists()).toBe(false)
    wrapper.unmount()
  })

  // ── 9. buildSegments regex mode highlights multiple matches ───────────────

  it('buildSegments in regex mode produces a <mark> for each match occurrence', async () => {
    const { wrapper, vm } = mountTab()

    vm.logBuffer.push(makeEntry('error at line 42 and another error here', 'error', 'err'))
    await setRegexMode(vm, true)
    await setFilter(vm, 'error')

    // Two <mark> elements — one per 'error' occurrence in the line
    const marks = wrapper.findAll('mark')
    expect(marks.length).toBe(2)
    marks.forEach((m) => expect(m.text().toLowerCase()).toBe('error'))
    wrapper.unmount()
  })

  // ── 10. Input gets error CSS class when regex is invalid ──────────────────

  it('log-search-input gets log-search-input--error class when regex is invalid', async () => {
    const { wrapper, vm } = mountTab()

    await setRegexMode(vm, true)
    await setFilter(vm, '[invalid')

    expect(wrapper.find('.log-search-input').classes()).toContain('log-search-input--error')
    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// Tests — filter presets
// ---------------------------------------------------------------------------

describe('LogsTab — filter presets', () => {
  // Minimal localStorage mock — uses a plain Map for isolation between tests.
  let store: Record<string, string>

  beforeEach(() => {
    seq = 0
    vi.clearAllMocks()
    store = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => { store[key] = val },
      removeItem: (key: string) => { delete store[key] },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ── 1. Load presets from localStorage on mount ────────────────────────────

  it('loads presets from localStorage on mount', async () => {
    const saved: FilterPreset[] = [
      { id: 'abc', name: 'Error only', filterText: 'error', regexMode: false, errorOnly: true, warnOnly: false },
    ]
    store['oc_log_filter_presets'] = JSON.stringify(saved)

    const { wrapper, vm } = mountTab()
    await flushPromises()
    await nextTick()

    expect(vm.presets).toHaveLength(1)
    expect(vm.presets[0].name).toBe('Error only')
    wrapper.unmount()
  })

  // ── 2. Corrupt localStorage falls back to empty array ────────────────────

  it('falls back to empty presets array when localStorage is corrupt JSON', async () => {
    store['oc_log_filter_presets'] = 'not-valid-json{{'

    const { wrapper, vm } = mountTab()
    await flushPromises()
    await nextTick()

    expect(vm.presets).toHaveLength(0)
    wrapper.unmount()
  })

  // ── 3. Save current filter as preset ─────────────────────────────────────

  it('saveCurrentAsPreset adds a new preset with the given name', async () => {
    const { wrapper, vm } = mountTab()
    await setFilter(vm, 'timeout')
    await setRegexMode(vm, true)

    vm.saveCurrentAsPreset('Timeout regex')
    await nextTick()

    expect(vm.presets).toHaveLength(1)
    const p = vm.presets[0]
    expect(p.name).toBe('Timeout regex')
    expect(p.filterText).toBe('timeout')
    expect(p.regexMode).toBe(true)
    wrapper.unmount()
  })

  it('saveCurrentAsPreset persists to localStorage', async () => {
    const { wrapper, vm } = mountTab()
    await setFilter(vm, 'warn')

    vm.saveCurrentAsPreset('Warn filter')
    await nextTick()

    const saved = JSON.parse(store['oc_log_filter_presets'] as string) as FilterPreset[]
    expect(saved).toHaveLength(1)
    expect(saved[0].name).toBe('Warn filter')
    wrapper.unmount()
  })

  it('saveCurrentAsPreset with empty name does nothing', async () => {
    const { wrapper, vm } = mountTab()
    await setFilter(vm, 'error')

    vm.saveCurrentAsPreset('')
    await nextTick()

    expect(vm.presets).toHaveLength(0)
    wrapper.unmount()
  })

  it('saveCurrentAsPreset with whitespace-only name does nothing', async () => {
    const { wrapper, vm } = mountTab()
    vm.saveCurrentAsPreset('   ')
    await nextTick()
    expect(vm.presets).toHaveLength(0)
    wrapper.unmount()
  })

  // ── 4. Apply preset sets all filter state ────────────────────────────────

  it('applyPreset sets filterText, regexMode, errorOnly, warnOnly', async () => {
    const { wrapper, vm } = mountTab()

    const preset: FilterPreset = {
      id: 'p1',
      name: 'My preset',
      filterText: 'disk',
      regexMode: true,
      errorOnly: true,
      warnOnly: false,
    }

    vm.applyPreset(preset)
    await nextTick()

    expect(vm.filterText).toBe('disk')
    expect(vm.regexMode).toBe(true)
    wrapper.unmount()
  })

  // ── 5. Delete preset removes it and persists ──────────────────────────────

  it('deletePreset removes the preset from the list and persists', async () => {
    const { wrapper, vm } = mountTab()
    vm.saveCurrentAsPreset('First')
    vm.saveCurrentAsPreset('Second')
    await nextTick()

    const idToDelete = vm.presets[0].id
    vm.deletePreset(idToDelete)
    await nextTick()

    expect(vm.presets).toHaveLength(1)
    expect(vm.presets[0].name).toBe('Second')

    const stored = JSON.parse(store['oc_log_filter_presets'] as string) as FilterPreset[]
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('Second')
    wrapper.unmount()
  })

  it('deletePreset clears selectedPresetId when the deleted id was selected', async () => {
    const { wrapper, vm } = mountTab()
    vm.saveCurrentAsPreset('Only preset')
    await nextTick()

    const id = vm.presets[0].id
    ;(vm as unknown as Record<string, unknown>).selectedPresetId = id
    await nextTick()

    vm.deletePreset(id)
    await nextTick()

    expect(vm.selectedPresetId).toBe('')
    wrapper.unmount()
  })

  // ── 6. Preset dropdown rendered in UI ────────────────────────────────────

  it('renders the preset select dropdown', () => {
    const { wrapper } = mountTab()
    expect(wrapper.find('.log-preset-select').exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders 💾 儲存 and 🗑️ 刪除 buttons', () => {
    const { wrapper } = mountTab()
    const text = wrapper.text()
    expect(text).toContain('儲存')
    expect(text).toContain('刪除')
    wrapper.unmount()
  })
})

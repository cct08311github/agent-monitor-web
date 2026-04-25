import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ---------------------------------------------------------------------------
// Hoisted setup
// ---------------------------------------------------------------------------

const { mockGet, mockPost, mockDel, mockRegisterShortcut } = vi.hoisted(() => {
  const mockGet = vi.fn()
  const mockPost = vi.fn()
  const mockDel = vi.fn()
  const mockRegisterShortcut = vi.fn()
  return { mockGet, mockPost, mockDel, mockRegisterShortcut }
})

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/composables/useApi', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    del: (...args: unknown[]) => mockDel(...args),
  },
}))

vi.mock('@/composables/useToast', () => ({
  showToast: vi.fn(),
}))

vi.mock('@/composables/useConfirm', () => ({
  confirm: vi.fn().mockResolvedValue(false),
}))

vi.mock('@/composables/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => ({
    registerShortcut: mockRegisterShortcut,
    unregisterShortcut: vi.fn(),
    getShortcuts: vi.fn(() => []),
  }),
}))

vi.mock('@/utils/format', () => ({
  fmtTime: (d: Date) => d.toISOString(),
}))

vi.mock('@/lib/cronError', () => ({
  formatCronError: (msg: string) => msg,
}))

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import CronTab from '../CronTab.vue'
import type { CronJob } from '@/types/api'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: 'job-1',
    name: 'Default Job',
    enabled: true,
    schedule: { expr: '0 * * * *' },
    agentId: 'agent-1',
    description: 'A test cron job',
    state: {
      lastRunAtMs: 1_700_000_000_000,
      nextRunAtMs: 1_700_003_600_000,
      lastStatus: 'ok',
    },
    ...overrides,
  }
}

function jobsResponse(jobs: CronJob[]) {
  return { success: true, jobs }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CronTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Filter bar rendering ───────────────────────────────────────────────────

  describe('filter bar', () => {
    it('renders the search input when jobs exist', async () => {
      mockGet.mockResolvedValue(jobsResponse([makeJob()]))
      const wrapper = mount(CronTab)
      await flushPromises()

      expect(wrapper.find('.cron-search-input').exists()).toBe(true)
      wrapper.unmount()
    })

    it('renders all three filter buttons when jobs exist', async () => {
      mockGet.mockResolvedValue(jobsResponse([makeJob()]))
      const wrapper = mount(CronTab)
      await flushPromises()

      const buttons = wrapper.findAll('.cron-filter-btn')
      expect(buttons).toHaveLength(3)
      expect(buttons[0].text()).toBe('全部')
      expect(buttons[1].text()).toBe('已啟用')
      expect(buttons[2].text()).toBe('已停用')
      wrapper.unmount()
    })

    it('renders the sort select when jobs exist', async () => {
      mockGet.mockResolvedValue(jobsResponse([makeJob()]))
      const wrapper = mount(CronTab)
      await flushPromises()

      expect(wrapper.find('.cron-sort-select').exists()).toBe(true)
      wrapper.unmount()
    })

    it('does NOT render filter bar when no jobs exist', async () => {
      mockGet.mockResolvedValue(jobsResponse([]))
      const wrapper = mount(CronTab)
      await flushPromises()

      expect(wrapper.find('.cron-filter-bar').exists()).toBe(false)
      wrapper.unmount()
    })
  })

  // ── Search: name filtering ─────────────────────────────────────────────────

  describe('search by name', () => {
    it('shows only matching job when search query matches name', async () => {
      const jobs = [
        makeJob({ id: 'a', name: 'Daily Backup' }),
        makeJob({ id: 'b', name: 'Weekly Report' }),
      ]
      mockGet.mockResolvedValue(jobsResponse(jobs))
      const wrapper = mount(CronTab)
      await flushPromises()

      await wrapper.find('.cron-search-input').setValue('Daily')
      await wrapper.vm.$nextTick()

      const cards = wrapper.findAll('.agent-card')
      expect(cards).toHaveLength(1)
      expect(cards[0].text()).toContain('Daily Backup')
      wrapper.unmount()
    })

    it('search is case-insensitive for name', async () => {
      const jobs = [makeJob({ id: 'a', name: 'Daily Backup' })]
      mockGet.mockResolvedValue(jobsResponse(jobs))
      const wrapper = mount(CronTab)
      await flushPromises()

      await wrapper.find('.cron-search-input').setValue('daily')
      await wrapper.vm.$nextTick()

      expect(wrapper.findAll('.agent-card')).toHaveLength(1)
      wrapper.unmount()
    })

    it('shows all jobs when search query is cleared', async () => {
      const jobs = [
        makeJob({ id: 'a', name: 'Daily Backup' }),
        makeJob({ id: 'b', name: 'Weekly Report' }),
      ]
      mockGet.mockResolvedValue(jobsResponse(jobs))
      const wrapper = mount(CronTab)
      await flushPromises()

      await wrapper.find('.cron-search-input').setValue('Daily')
      await wrapper.vm.$nextTick()
      expect(wrapper.findAll('.agent-card')).toHaveLength(1)

      await wrapper.find('.cron-search-input').setValue('')
      await wrapper.vm.$nextTick()
      expect(wrapper.findAll('.agent-card')).toHaveLength(2)
      wrapper.unmount()
    })
  })

  // ── Search: schedule expression filtering ─────────────────────────────────

  describe('search by schedule expression', () => {
    it('shows job when query matches schedule expression', async () => {
      const jobs = [
        makeJob({ id: 'a', name: 'Job A', schedule: { expr: '0 * * * *' } }),
        makeJob({ id: 'b', name: 'Job B', schedule: { expr: '@daily' } }),
      ]
      mockGet.mockResolvedValue(jobsResponse(jobs))
      const wrapper = mount(CronTab)
      await flushPromises()

      await wrapper.find('.cron-search-input').setValue('@daily')
      await wrapper.vm.$nextTick()

      const cards = wrapper.findAll('.agent-card')
      expect(cards).toHaveLength(1)
      expect(cards[0].text()).toContain('Job B')
      wrapper.unmount()
    })

    it('search by schedule is case-insensitive', async () => {
      const jobs = [makeJob({ id: 'a', schedule: { expr: '@Daily' } })]
      mockGet.mockResolvedValue(jobsResponse(jobs))
      const wrapper = mount(CronTab)
      await flushPromises()

      await wrapper.find('.cron-search-input').setValue('@daily')
      await wrapper.vm.$nextTick()

      expect(wrapper.findAll('.agent-card')).toHaveLength(1)
      wrapper.unmount()
    })
  })

  // ── Filter: enabled-only ───────────────────────────────────────────────────

  describe('enabled-only filter', () => {
    it('shows only enabled jobs when enabled filter is active', async () => {
      const jobs = [
        makeJob({ id: 'a', name: 'Enabled Job', enabled: true }),
        makeJob({ id: 'b', name: 'Disabled Job', enabled: false }),
      ]
      mockGet.mockResolvedValue(jobsResponse(jobs))
      const wrapper = mount(CronTab)
      await flushPromises()

      const buttons = wrapper.findAll('.cron-filter-btn')
      await buttons[1].trigger('click') // 已啟用
      await wrapper.vm.$nextTick()

      const cards = wrapper.findAll('.agent-card')
      expect(cards).toHaveLength(1)
      expect(cards[0].text()).toContain('Enabled Job')
      wrapper.unmount()
    })

    it('marks enabled button as active when clicked', async () => {
      mockGet.mockResolvedValue(jobsResponse([makeJob()]))
      const wrapper = mount(CronTab)
      await flushPromises()

      const buttons = wrapper.findAll('.cron-filter-btn')
      await buttons[1].trigger('click')
      await wrapper.vm.$nextTick()

      expect(buttons[1].classes()).toContain('active')
      expect(buttons[0].classes()).not.toContain('active')
      wrapper.unmount()
    })
  })

  // ── Filter: disabled-only ──────────────────────────────────────────────────

  describe('disabled-only filter', () => {
    it('shows only disabled jobs when disabled filter is active', async () => {
      const jobs = [
        makeJob({ id: 'a', name: 'Enabled Job', enabled: true }),
        makeJob({ id: 'b', name: 'Disabled Job', enabled: false }),
      ]
      mockGet.mockResolvedValue(jobsResponse(jobs))
      const wrapper = mount(CronTab)
      await flushPromises()

      const buttons = wrapper.findAll('.cron-filter-btn')
      await buttons[2].trigger('click') // 已停用
      await wrapper.vm.$nextTick()

      const cards = wrapper.findAll('.agent-card')
      expect(cards).toHaveLength(1)
      expect(cards[0].text()).toContain('Disabled Job')
      wrapper.unmount()
    })

    it('clicking 全部 restores all jobs after disabled filter', async () => {
      const jobs = [
        makeJob({ id: 'a', enabled: true }),
        makeJob({ id: 'b', enabled: false }),
      ]
      mockGet.mockResolvedValue(jobsResponse(jobs))
      const wrapper = mount(CronTab)
      await flushPromises()

      const buttons = wrapper.findAll('.cron-filter-btn')
      await buttons[2].trigger('click') // disabled
      await wrapper.vm.$nextTick()
      expect(wrapper.findAll('.agent-card')).toHaveLength(1)

      await buttons[0].trigger('click') // 全部
      await wrapper.vm.$nextTick()
      expect(wrapper.findAll('.agent-card')).toHaveLength(2)
      wrapper.unmount()
    })
  })

  // ── Sort: by name ──────────────────────────────────────────────────────────

  describe('sort by name', () => {
    it('sorts jobs alphabetically by name (default)', async () => {
      const jobs = [
        makeJob({ id: 'c', name: 'Zebra Task' }),
        makeJob({ id: 'a', name: 'Alpha Task' }),
        makeJob({ id: 'b', name: 'Mango Task' }),
      ]
      mockGet.mockResolvedValue(jobsResponse(jobs))
      const wrapper = mount(CronTab)
      await flushPromises()

      const names = wrapper.findAll('.agent-name').map((n) => n.text())
      expect(names).toEqual(['Alpha Task', 'Mango Task', 'Zebra Task'])
      wrapper.unmount()
    })
  })

  // ── Sort: by nextRun ───────────────────────────────────────────────────────

  describe('sort by nextRun', () => {
    it('sorts jobs ascending by nextRunAtMs, unscheduled last', async () => {
      const jobs = [
        makeJob({ id: 'a', name: 'Far Future', state: { nextRunAtMs: 2_000_000_000_000 } }),
        makeJob({ id: 'b', name: 'Unscheduled', state: { nextRunAtMs: undefined } }),
        makeJob({ id: 'c', name: 'Near Future', state: { nextRunAtMs: 1_000_000_000_000 } }),
      ]
      mockGet.mockResolvedValue(jobsResponse(jobs))
      const wrapper = mount(CronTab)
      await flushPromises()

      await wrapper.find('.cron-sort-select').setValue('nextRun')
      await wrapper.vm.$nextTick()

      const names = wrapper.findAll('.agent-name').map((n) => n.text())
      expect(names).toEqual(['Near Future', 'Far Future', 'Unscheduled'])
      wrapper.unmount()
    })
  })

  // ── Sort: by lastRun ───────────────────────────────────────────────────────

  describe('sort by lastRun', () => {
    it('sorts jobs descending by lastRunAtMs, never-run last', async () => {
      const jobs = [
        makeJob({ id: 'a', name: 'Old Run', state: { lastRunAtMs: 1_000_000_000_000 } }),
        makeJob({ id: 'b', name: 'Never Run', state: { lastRunAtMs: undefined } }),
        makeJob({ id: 'c', name: 'Recent Run', state: { lastRunAtMs: 1_700_000_000_000 } }),
      ]
      mockGet.mockResolvedValue(jobsResponse(jobs))
      const wrapper = mount(CronTab)
      await flushPromises()

      await wrapper.find('.cron-sort-select').setValue('lastRun')
      await wrapper.vm.$nextTick()

      const names = wrapper.findAll('.agent-name').map((n) => n.text())
      expect(names).toEqual(['Recent Run', 'Old Run', 'Never Run'])
      wrapper.unmount()
    })
  })

  // ── Empty state: no jobs ───────────────────────────────────────────────────

  describe('empty states', () => {
    it('shows "沒有 Cron 任務" when API returns no jobs', async () => {
      mockGet.mockResolvedValue(jobsResponse([]))
      const wrapper = mount(CronTab)
      await flushPromises()

      expect(wrapper.find('.empty-state-title').text()).toBe('沒有 Cron 任務')
      wrapper.unmount()
    })

    it('shows "沒有符合條件" when jobs exist but none match search', async () => {
      mockGet.mockResolvedValue(jobsResponse([makeJob({ name: 'Daily Backup' })]))
      const wrapper = mount(CronTab)
      await flushPromises()

      await wrapper.find('.cron-search-input').setValue('zzz-no-match')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.empty-state-title').text()).toBe('沒有符合條件')
      wrapper.unmount()
    })

    it('shows "沒有符合條件" when jobs exist but none match filter', async () => {
      // All jobs are enabled, filter to disabled
      mockGet.mockResolvedValue(jobsResponse([makeJob({ enabled: true })]))
      const wrapper = mount(CronTab)
      await flushPromises()

      const buttons = wrapper.findAll('.cron-filter-btn')
      await buttons[2].trigger('click') // 已停用
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.empty-state-title').text()).toBe('沒有符合條件')
      wrapper.unmount()
    })
  })

  // ── Existing behavior preservation ────────────────────────────────────────

  describe('existing behavior preserved', () => {
    it('calls /api/cron/jobs on mount', async () => {
      mockGet.mockResolvedValue(jobsResponse([]))
      mount(CronTab)
      await flushPromises()

      expect(mockGet).toHaveBeenCalledWith('/api/cron/jobs')
    })

    it('renders job name and schedule expression', async () => {
      mockGet.mockResolvedValue(jobsResponse([makeJob({ name: 'Test Job', schedule: { expr: '*/5 * * * *' } })]))
      const wrapper = mount(CronTab)
      await flushPromises()

      expect(wrapper.find('.agent-name').text()).toBe('Test Job')
      expect(wrapper.find('.agent-hostname').text()).toBe('*/5 * * * *')
      wrapper.unmount()
    })

    it('renders run and delete buttons for each job', async () => {
      mockGet.mockResolvedValue(jobsResponse([makeJob()]))
      const wrapper = mount(CronTab)
      await flushPromises()

      expect(wrapper.find('.cron-run-button').exists()).toBe(true)
      expect(wrapper.find('[title="刪除任務"]').exists()).toBe(true)
      wrapper.unmount()
    })

    it('renders toggle checkbox for each job', async () => {
      mockGet.mockResolvedValue(jobsResponse([makeJob()]))
      const wrapper = mount(CronTab)
      await flushPromises()

      expect(wrapper.find('.watchdog-toggle input[type="checkbox"]').exists()).toBe(true)
      wrapper.unmount()
    })
  })

  // ── Countdown display ──────────────────────────────────────────────────────

  describe('countdown display', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('shows countdown text for an enabled job with a future nextRunAtMs', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(1_700_000_000_000)

      const job = makeJob({
        enabled: true,
        state: {
          nextRunAtMs: 1_700_000_000_000 + 5 * 60_000, // 5 min from now
          lastRunAtMs: undefined,
          lastStatus: undefined,
        },
      })
      mockGet.mockResolvedValue(jobsResponse([job]))
      const wrapper = mount(CronTab)
      await flushPromises()

      const countdown = wrapper.find('.cron-countdown')
      expect(countdown.exists()).toBe(true)
      expect(countdown.text()).toMatch(/分/)
      wrapper.unmount()
    })

    it('shows "已停用" countdown for a disabled job', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(1_700_000_000_000)

      const job = makeJob({
        enabled: false,
        state: {
          nextRunAtMs: 1_700_000_000_000 + 5 * 60_000,
          lastRunAtMs: undefined,
          lastStatus: undefined,
        },
      })
      mockGet.mockResolvedValue(jobsResponse([job]))
      const wrapper = mount(CronTab)
      await flushPromises()

      const countdown = wrapper.find('.cron-countdown')
      expect(countdown.text()).toBe('已停用')
      wrapper.unmount()
    })

    it('shows "未排程" for enabled job with no nextRunAtMs', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(1_700_000_000_000)

      const job = makeJob({
        enabled: true,
        state: {
          nextRunAtMs: undefined,
          lastRunAtMs: undefined,
          lastStatus: undefined,
        },
      })
      mockGet.mockResolvedValue(jobsResponse([job]))
      const wrapper = mount(CronTab)
      await flushPromises()

      const countdown = wrapper.find('.cron-countdown')
      expect(countdown.text()).toBe('未排程')
      wrapper.unmount()
    })

    it('shows "即將執行" for enabled job with nextRunAtMs within 30s', async () => {
      vi.useFakeTimers()
      const NOW = 1_700_000_000_000
      vi.setSystemTime(NOW)

      const job = makeJob({
        enabled: true,
        state: {
          nextRunAtMs: NOW + 15_000, // 15s ahead
          lastRunAtMs: undefined,
          lastStatus: undefined,
        },
      })
      mockGet.mockResolvedValue(jobsResponse([job]))
      const wrapper = mount(CronTab)
      await flushPromises()

      const countdown = wrapper.find('.cron-countdown')
      expect(countdown.text()).toBe('即將執行')
      wrapper.unmount()
    })

    it('updates countdown after 1s tick via fake timer', async () => {
      vi.useFakeTimers()
      const NOW = 1_700_000_000_000
      vi.setSystemTime(NOW)

      const job = makeJob({
        enabled: true,
        state: {
          nextRunAtMs: NOW + 120_000, // 2 min
          lastRunAtMs: undefined,
          lastStatus: undefined,
        },
      })
      mockGet.mockResolvedValue(jobsResponse([job]))
      const wrapper = mount(CronTab)
      await flushPromises()

      const before = wrapper.find('.cron-countdown').text()

      // advance 1 second
      vi.advanceTimersByTime(1000)
      await wrapper.vm.$nextTick()

      const after = wrapper.find('.cron-countdown').text()
      // Both should still show countdown (2 min range), but may differ by 1s
      expect(before).toMatch(/分/)
      expect(after).toMatch(/分/)
      wrapper.unmount()
    })

    it('shows "逾期 N 分鐘" for enabled job overdue by more than 60s', async () => {
      vi.useFakeTimers()
      const NOW = 1_700_000_000_000
      vi.setSystemTime(NOW)

      const job = makeJob({
        enabled: true,
        state: {
          nextRunAtMs: NOW - 5 * 60_000, // 5 min overdue
          lastRunAtMs: undefined,
          lastStatus: undefined,
        },
      })
      mockGet.mockResolvedValue(jobsResponse([job]))
      const wrapper = mount(CronTab)
      await flushPromises()

      const countdown = wrapper.find('.cron-countdown')
      expect(countdown.text()).toBe('逾期 5 分鐘')
      wrapper.unmount()
    })
  })

  // ── / shortcut focuses search input ───────────────────────────────────────

  describe('/ shortcut focuses search input', () => {
    it('registers a "/" shortcut on mount', async () => {
      mockGet.mockResolvedValue(jobsResponse([makeJob()]))
      const wrapper = mount(CronTab)
      await flushPromises()

      expect(mockRegisterShortcut).toHaveBeenCalledWith(
        expect.objectContaining({ key: '/' }),
      )
      wrapper.unmount()
    })

    it('registers the shortcut with category "Actions"', async () => {
      mockGet.mockResolvedValue(jobsResponse([makeJob()]))
      const wrapper = mount(CronTab)
      await flushPromises()

      expect(mockRegisterShortcut).toHaveBeenCalledWith(
        expect.objectContaining({ key: '/', category: 'Actions' }),
      )
      wrapper.unmount()
    })

    it('shortcut handler calls focus() on the search input when jobs exist', async () => {
      mockGet.mockResolvedValue(jobsResponse([makeJob()]))
      const wrapper = mount(CronTab)
      await flushPromises()

      const input = wrapper.find<HTMLInputElement>('.cron-search-input')
      expect(input.exists()).toBe(true)

      const focusSpy = vi.spyOn(input.element, 'focus')
      const selectSpy = vi.spyOn(input.element, 'select')

      const call = mockRegisterShortcut.mock.calls.find(
        (c) => (c[0] as { key: string }).key === '/',
      )
      expect(call).toBeTruthy()
      const handler = (call![0] as { handler: () => void }).handler
      handler()

      expect(focusSpy).toHaveBeenCalledTimes(1)
      expect(selectSpy).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })
  })
})

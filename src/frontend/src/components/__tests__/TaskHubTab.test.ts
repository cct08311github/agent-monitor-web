import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// ---------------------------------------------------------------------------
// Hoisted mock factories (must run before any imports)
// ---------------------------------------------------------------------------

const { mockGet, mockDel, mockPatch, mockConfirm, mockShowToast, mockRegisterShortcut } = vi.hoisted(() => {
  const mockGet     = vi.fn()
  const mockDel     = vi.fn()
  const mockPatch   = vi.fn()
  const mockConfirm = vi.fn()
  const mockShowToast = vi.fn()
  const mockRegisterShortcut = vi.fn()
  return { mockGet, mockDel, mockPatch, mockConfirm, mockShowToast, mockRegisterShortcut }
})

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/composables/useApi', () => ({
  api: {
    get:   (...args: unknown[]) => mockGet(...args),
    del:   (...args: unknown[]) => mockDel(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
  },
}))

vi.mock('@/composables/useToast', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}))

vi.mock('@/composables/useConfirm', () => ({
  confirm: (...args: unknown[]) => mockConfirm(...args),
}))

// Stub child modals so they don't require complex internals
vi.mock('@/components/TaskDetailModal.vue', () => ({
  default: { name: 'TaskDetailModal', template: '<div />' },
}))

vi.mock('@/components/AddTaskModal.vue', () => ({
  default: { name: 'AddTaskModal', template: '<div />' },
}))

vi.mock('@/composables/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => ({
    registerShortcut: mockRegisterShortcut,
    unregisterShortcut: vi.fn(),
    getShortcuts: vi.fn(() => []),
  }),
}))

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import TaskHubTab from '../TaskHubTab.vue'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<{
  id: string | number
  title: string
  status: string
  priority: string
  domain: string
  tags: string[]
  notes: string
  due_date: string
}> = {}) {
  return {
    id:       overrides.id       ?? 'task-1',
    title:    overrides.title    ?? 'Default Task',
    status:   overrides.status   ?? 'not_started',
    priority: overrides.priority ?? 'medium',
    domain:   overrides.domain   ?? 'work',
    tags:     overrides.tags     ?? [],
    notes:    overrides.notes,
    due_date: overrides.due_date,
  }
}

function tasksResponse(tasks: ReturnType<typeof makeTask>[]) {
  return { success: true, tasks, total: tasks.length }
}

function statsResponse() {
  return {
    success: true,
    stats: {
      domains: {
        work:        { total: 0, active: 0, by_status: {} },
        personal:    { total: 0, active: 0, by_status: {} },
        sideproject: { total: 0, active: 0, by_status: {} },
      },
      total_active: 0,
    },
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupDefaultMocks() {
  mockGet.mockResolvedValue(tasksResponse([]))
  mockConfirm.mockResolvedValue(false)
}

// The component calls both /stats and /tasks on mount.
// mockGet must handle both paths.
function mockGetDispatch(
  tasks: ReturnType<typeof makeTask>[],
  overrideStats?: unknown,
) {
  mockGet.mockImplementation((url: string) => {
    if (url.startsWith('/api/taskhub/stats')) {
      return Promise.resolve(overrideStats ?? statsResponse())
    }
    return Promise.resolve(tasksResponse(tasks))
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TaskHubTab — batch selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultMocks()
  })

  // ── 1. Checkbox rendered for each row ───────────────────────────────────

  it('renders a checkbox for each task row', async () => {
    mockGetDispatch([
      makeTask({ id: 'a', title: 'Task A' }),
      makeTask({ id: 'b', title: 'Task B' }),
    ])
    const wrapper = mount(TaskHubTab)
    await flushPromises()

    const checkboxes = wrapper.findAll('.th-row-check')
    expect(checkboxes).toHaveLength(2)
    wrapper.unmount()
  })

  // ── 2. Header checkbox rendered ─────────────────────────────────────────

  it('renders a header checkbox when tasks exist', async () => {
    mockGetDispatch([makeTask()])
    const wrapper = mount(TaskHubTab)
    await flushPromises()

    expect(wrapper.find('.th-check-all').exists()).toBe(true)
    wrapper.unmount()
  })

  // ── 3. toggleOne: adds to and removes from selectedIds ──────────────────

  it('toggleOne adds and removes a task from selectedIds', async () => {
    mockGetDispatch([makeTask({ id: 'a', domain: 'work' })])
    const wrapper = mount(TaskHubTab)
    await flushPromises()

    const checkbox = wrapper.find<HTMLInputElement>('.th-row-check')
    // Check — should be selected
    await checkbox.trigger('click')
    await wrapper.vm.$nextTick()
    expect(checkbox.element.checked).toBe(true)

    // Uncheck — should be deselected
    await checkbox.trigger('click')
    await wrapper.vm.$nextTick()
    expect(checkbox.element.checked).toBe(false)

    wrapper.unmount()
  })

  // ── 4. toggleAll: selects all when none selected ─────────────────────────

  it('toggleAll selects all tasks when none are selected', async () => {
    mockGetDispatch([
      makeTask({ id: 'a' }),
      makeTask({ id: 'b' }),
    ])
    const wrapper = mount(TaskHubTab)
    await flushPromises()

    await wrapper.find('.th-check-all').trigger('click')
    await wrapper.vm.$nextTick()

    const checkboxes = wrapper.findAll<HTMLInputElement>('.th-row-check')
    expect(checkboxes.every((c) => c.element.checked)).toBe(true)

    wrapper.unmount()
  })

  // ── 5. toggleAll: deselects all when all selected ────────────────────────

  it('toggleAll deselects all tasks when all are already selected', async () => {
    mockGetDispatch([
      makeTask({ id: 'a' }),
      makeTask({ id: 'b' }),
    ])
    const wrapper = mount(TaskHubTab)
    await flushPromises()

    const headerCb = wrapper.find('.th-check-all')

    // Select all
    await headerCb.trigger('click')
    await wrapper.vm.$nextTick()

    // Deselect all
    await headerCb.trigger('click')
    await wrapper.vm.$nextTick()

    const checkboxes = wrapper.findAll<HTMLInputElement>('.th-row-check')
    expect(checkboxes.every((c) => !c.element.checked)).toBe(true)

    wrapper.unmount()
  })

  // ── 6. indeterminate state when partially selected ───────────────────────

  it('header checkbox has indeterminate=true when partially selected', async () => {
    mockGetDispatch([
      makeTask({ id: 'a' }),
      makeTask({ id: 'b' }),
    ])
    const wrapper = mount(TaskHubTab)
    await flushPromises()

    // Select only the first row checkbox
    await wrapper.findAll('.th-row-check')[0].trigger('click')
    await wrapper.vm.$nextTick()

    const headerCb = wrapper.find<HTMLInputElement>('.th-check-all')
    expect(headerCb.element.indeterminate).toBe(true)
    expect(headerCb.element.checked).toBe(false)

    wrapper.unmount()
  })

  // ── 7. Batch action bar hidden when nothing selected ─────────────────────

  it('does NOT show batch action bar when selection is empty', async () => {
    mockGetDispatch([makeTask()])
    const wrapper = mount(TaskHubTab)
    await flushPromises()

    expect(wrapper.find('.th-batch-bar').exists()).toBe(false)
    wrapper.unmount()
  })

  // ── 8. Batch action bar visible once a task is selected ──────────────────

  it('shows batch action bar after selecting a task', async () => {
    mockGetDispatch([makeTask()])
    const wrapper = mount(TaskHubTab)
    await flushPromises()

    await wrapper.find('.th-row-check').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.th-batch-bar').exists()).toBe(true)
    expect(wrapper.find('.th-batch-count').text()).toContain('1')

    wrapper.unmount()
  })

  // ── 9. Cancel button clears selection ────────────────────────────────────

  it('cancel button clears the selection and hides the action bar', async () => {
    mockGetDispatch([makeTask()])
    const wrapper = mount(TaskHubTab)
    await flushPromises()

    await wrapper.find('.th-row-check').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.th-batch-bar').exists()).toBe(true)

    await wrapper.find('.th-batch-cancel').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.th-batch-bar').exists()).toBe(false)

    wrapper.unmount()
  })

  // ── 10. batchDelete: confirm + sequential API calls + clear + refetch ────

  it('batchDelete calls confirm, then sequentially deletes, clears selection and refetches', async () => {
    const tasks = [
      makeTask({ id: 'a', title: 'Task A', domain: 'work' }),
      makeTask({ id: 'b', title: 'Task B', domain: 'work' }),
    ]
    mockGetDispatch(tasks)
    mockConfirm.mockResolvedValue(true)
    mockDel.mockResolvedValue({ success: true })

    const wrapper = mount(TaskHubTab)
    await flushPromises()

    // Select all
    await wrapper.find('.th-check-all').trigger('click')
    await wrapper.vm.$nextTick()

    // Trigger batch delete
    await wrapper.find('.th-batch-delete').trigger('click')
    await flushPromises()

    // confirm called once with deletion message
    expect(mockConfirm).toHaveBeenCalledTimes(1)
    const confirmOpts = mockConfirm.mock.calls[0][0] as { message: string }
    expect(confirmOpts.message).toContain('2 筆')
    expect(confirmOpts.message).toContain('刪除')

    // del called once per task (sequential)
    expect(mockDel).toHaveBeenCalledTimes(2)

    // Selection cleared (no batch bar)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.th-batch-bar').exists()).toBe(false)

    // refetch occurred (mockGet was called again after initial mount)
    expect(mockGet).toHaveBeenCalledTimes(4) // stats + tasks on mount, stats + tasks on refetch

    wrapper.unmount()
  })

  // ── 11. batchDelete: abort when user cancels confirm ─────────────────────

  it('batchDelete does nothing when user cancels the confirm dialog', async () => {
    mockGetDispatch([makeTask({ id: 'a' })])
    mockConfirm.mockResolvedValue(false)

    const wrapper = mount(TaskHubTab)
    await flushPromises()

    await wrapper.find('.th-row-check').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('.th-batch-delete').trigger('click')
    await flushPromises()

    expect(mockDel).not.toHaveBeenCalled()
    // Selection should still be intact (user cancelled)
    expect(wrapper.find('.th-batch-bar').exists()).toBe(true)

    wrapper.unmount()
  })

  // ── 12. batchSetStatus: confirm + sequential PATCH + clear + refetch ─────

  it('batchSetStatus calls confirm, patches all tasks, clears selection and refetches', async () => {
    const tasks = [
      makeTask({ id: 'a', domain: 'work' }),
      makeTask({ id: 'b', domain: 'work' }),
    ]
    mockGetDispatch(tasks)
    mockConfirm.mockResolvedValue(true)
    mockPatch.mockResolvedValue({ success: true })

    const wrapper = mount(TaskHubTab)
    await flushPromises()

    // Select all
    await wrapper.find('.th-check-all').trigger('click')
    await wrapper.vm.$nextTick()

    // Change status via select
    const statusSelect = wrapper.find<HTMLSelectElement>('.th-batch-status-select')
    await statusSelect.setValue('done')
    await statusSelect.trigger('change')
    await flushPromises()

    expect(mockConfirm).toHaveBeenCalledTimes(1)
    const confirmOpts = mockConfirm.mock.calls[0][0] as { message: string }
    expect(confirmOpts.message).toContain('2 筆')

    expect(mockPatch).toHaveBeenCalledTimes(2)
    expect(mockPatch).toHaveBeenCalledWith(
      expect.stringContaining('/api/taskhub/tasks/'),
      { status: 'done' },
    )

    await wrapper.vm.$nextTick()
    expect(wrapper.find('.th-batch-bar').exists()).toBe(false)

    wrapper.unmount()
  })

  // ── 13. batchSetStatus: aborted when confirm cancelled ───────────────────

  it('batchSetStatus does nothing when user cancels confirm', async () => {
    mockGetDispatch([makeTask({ id: 'a' })])
    mockConfirm.mockResolvedValue(false)

    const wrapper = mount(TaskHubTab)
    await flushPromises()

    await wrapper.find('.th-row-check').trigger('click')
    await wrapper.vm.$nextTick()

    const statusSelect = wrapper.find<HTMLSelectElement>('.th-batch-status-select')
    await statusSelect.setValue('done')
    await statusSelect.trigger('change')
    await flushPromises()

    expect(mockPatch).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  // ── 14. Switching domain clears selection ─────────────────────────────────

  it('switching domain clears the selection', async () => {
    mockGetDispatch([makeTask({ id: 'a', domain: 'work' })])
    const wrapper = mount(TaskHubTab)
    await flushPromises()

    // Select a task
    await wrapper.find('.th-row-check').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.th-batch-bar').exists()).toBe(true)

    // Switch to Personal domain
    const domainBtns = wrapper.findAll('.th-domain-btn')
    const personalBtn = domainBtns.find((btn) => btn.text().includes('Personal'))
    expect(personalBtn).toBeTruthy()

    // Reseed mock to return no tasks for personal
    mockGetDispatch([])
    await personalBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.find('.th-batch-bar').exists()).toBe(false)

    wrapper.unmount()
  })

  // ── 15. batchDelete partial failure accumulates error toast ──────────────

  it('batchDelete shows warning toast with error details when some deletions fail', async () => {
    const tasks = [
      makeTask({ id: 'a', title: 'Good Task',  domain: 'work' }),
      makeTask({ id: 'b', title: 'Fail Task',  domain: 'work' }),
    ]
    mockGetDispatch(tasks)
    mockConfirm.mockResolvedValue(true)
    mockDel
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: 'Server error' })

    const wrapper = mount(TaskHubTab)
    await flushPromises()

    await wrapper.find('.th-check-all').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('.th-batch-delete').trigger('click')
    await flushPromises()

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('失敗'),
      'warning',
    )

    wrapper.unmount()
  })

  // ── 16. Composite key: different domains with same id are distinct ────────

  it('treats tasks with same id but different domains as distinct selections', async () => {
    const tasks = [
      makeTask({ id: '1', domain: 'work',     title: 'Work Task' }),
      makeTask({ id: '1', domain: 'personal', title: 'Personal Task' }),
    ]
    mockGetDispatch(tasks)

    const wrapper = mount(TaskHubTab)
    await flushPromises()

    const checkboxes = wrapper.findAll<HTMLInputElement>('.th-row-check')
    expect(checkboxes).toHaveLength(2)

    // Select only the first
    await checkboxes[0].trigger('click')
    await wrapper.vm.$nextTick()

    expect(checkboxes[0].element.checked).toBe(true)
    expect(checkboxes[1].element.checked).toBe(false)

    // Indeterminate on header
    const headerCb = wrapper.find<HTMLInputElement>('.th-check-all')
    expect(headerCb.element.indeterminate).toBe(true)

    wrapper.unmount()
  })
})

// ---------------------------------------------------------------------------
// Tests — / shortcut focuses search input
// ---------------------------------------------------------------------------

describe('TaskHubTab — / shortcut focuses search input', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockImplementation((url: string) => {
      if (url.startsWith('/api/taskhub/stats')) return Promise.resolve(statsResponse())
      return Promise.resolve(tasksResponse([]))
    })
    mockConfirm.mockResolvedValue(false)
  })

  it('registers a "/" shortcut on mount', async () => {
    const wrapper = mount(TaskHubTab)
    await flushPromises()

    expect(mockRegisterShortcut).toHaveBeenCalledWith(
      expect.objectContaining({ key: '/' }),
    )
    wrapper.unmount()
  })

  it('registers the shortcut with category "Actions"', async () => {
    const wrapper = mount(TaskHubTab)
    await flushPromises()

    expect(mockRegisterShortcut).toHaveBeenCalledWith(
      expect.objectContaining({ key: '/', category: 'Actions' }),
    )
    wrapper.unmount()
  })

  it('shortcut handler calls focus() and select() on the search input', async () => {
    const wrapper = mount(TaskHubTab)
    await flushPromises()

    const input = wrapper.find<HTMLInputElement>('.th-search-input')
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

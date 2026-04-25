import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { useAlertSnooze } from '../useAlertSnooze'

// ---------------------------------------------------------------------------
// localStorage stub
// ---------------------------------------------------------------------------

let store: Record<string, string> = {}

const localStorageMock: Storage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = value
  },
  removeItem: (key: string) => {
    delete store[key]
  },
  clear: () => {
    store = {}
  },
  get length() {
    return Object.keys(store).length
  },
  key: (index: number) => Object.keys(store)[index] ?? null,
}

beforeEach(() => {
  store = {}
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  store = {}
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Handle = ReturnType<typeof useAlertSnooze>

function makeWrapper(): { vm: { handle: Handle }; unmount: () => void } {
  const TestComponent = defineComponent({
    setup() {
      const handle = useAlertSnooze()
      return { handle }
    },
    template: '<div />',
  })
  const wrapper = mount(TestComponent)
  return wrapper as unknown as { vm: { handle: Handle }; unmount: () => void }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAlertSnooze', () => {
  it('snooze() adds entry to snoozes Map and persists to localStorage', () => {
    const wrapper = makeWrapper()
    const handle = wrapper.vm.handle

    const durationMs = 60 * 60 * 1000 // 1h
    const entry = handle.snooze('rule_x:100', durationMs)

    // reactive Map updated
    expect(handle.snoozes.value.has('rule_x:100')).toBe(true)
    expect(handle.snoozes.value.get('rule_x:100')).toMatchObject({
      alertId: 'rule_x:100',
      duration: durationMs,
    })

    // persisted
    const raw = store['oc_alert_snooze']
    expect(raw).toBeDefined()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    expect(parsed['rule_x:100']).toBeDefined()
    expect((parsed['rule_x:100'] as { alertId: string }).alertId).toBe('rule_x:100')

    // returned entry is consistent
    expect(entry.alertId).toBe('rule_x:100')

    wrapper.unmount()
  })

  it('unsnooze() removes entry from Map and persists', () => {
    const wrapper = makeWrapper()
    const handle = wrapper.vm.handle

    handle.snooze('rule_y:200', 15 * 60 * 1000)
    expect(handle.snoozes.value.has('rule_y:200')).toBe(true)

    handle.unsnooze('rule_y:200')
    expect(handle.snoozes.value.has('rule_y:200')).toBe(false)

    // also persisted correctly — unsnooze should have updated localStorage
    const raw = store['oc_alert_snooze']
    const parsed = JSON.parse(raw ?? '{}') as Record<string, unknown>
    expect(parsed['rule_y:200']).toBeUndefined()

    wrapper.unmount()
  })
})

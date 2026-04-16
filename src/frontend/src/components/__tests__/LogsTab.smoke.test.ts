import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

// Stub useSSE — avoids EventSource and getBasePath side effects
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

// Stub useToast — avoids module-level toast state
vi.mock('@/composables/useToast', () => ({
  showToast: vi.fn(),
}))

// Stub useApi — avoids basePath resolution
vi.mock('@/composables/useApi', () => ({
  getBasePath: () => '',
}))

import LogsTab from '../LogsTab.vue'

describe('LogsTab (smoke)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mounts without throwing', () => {
    const wrapper = mount(LogsTab, {
      global: {
        stubs: {
          teleport: true,
        },
      },
    })
    expect(wrapper.exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders the "開始監看" start button initially', () => {
    const wrapper = mount(LogsTab)
    const text = wrapper.text()
    expect(text).toContain('開始監看')
    wrapper.unmount()
  })
})

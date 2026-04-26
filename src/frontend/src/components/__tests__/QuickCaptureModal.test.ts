import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

// ---------------------------------------------------------------------------
// Mock localStorage
// ---------------------------------------------------------------------------

const _lsStore: Record<string, string> = {}

const localStorageMock = {
  getItem: vi.fn((key: string): string | null => _lsStore[key] ?? null),
  setItem: vi.fn((key: string, value: string): void => {
    _lsStore[key] = value
  }),
  removeItem: vi.fn((key: string): void => {
    delete _lsStore[key]
  }),
  clear: vi.fn((): void => {
    for (const key of Object.keys(_lsStore)) {
      delete _lsStore[key]
    }
  }),
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// ---------------------------------------------------------------------------
// Mock composables
// ---------------------------------------------------------------------------

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}))

vi.mock('@/composables/useQuickCapture', async () => {
  const vue = await import('vue')
  const isOpen = vue.ref(true)
  return {
    useQuickCapture: () => ({
      isOpen,
      close: vi.fn(),
      add: vi.fn(),
      prefillBody: vue.ref(''),
    }),
  }
})

// ---------------------------------------------------------------------------
// Mock clipboard utilities
// ---------------------------------------------------------------------------

vi.mock('@/utils/clipboardRead', () => ({
  readClipboardText: vi.fn(async () => null),
  isClipboardReadSupported: vi.fn(() => false),
}))

// ---------------------------------------------------------------------------
// Mock draft utilities
// ---------------------------------------------------------------------------

vi.mock('@/utils/captureDraft', () => ({
  loadDraft: vi.fn(() => ''),
  saveDraft: vi.fn(),
  clearDraft: vi.fn(),
}))

import QuickCaptureModal from '../QuickCaptureModal.vue'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mountModal() {
  return mount(QuickCaptureModal, {
    props: { currentContext: 'test-context' },
    attachTo: document.body,
  })
}

// ---------------------------------------------------------------------------
// Tests — char counter
// ---------------------------------------------------------------------------

// QuickCaptureModal uses <Teleport to="body"> — rendered content lands in
// document.body, not inside the wrapper. Use document.querySelector to inspect.

describe('QuickCaptureModal — char counter', () => {
  afterEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
  })

  it('renders char count as "0 字" and has is-dimmed class when text is empty', async () => {
    const wrapper = mountModal()
    await Promise.resolve()
    await Promise.resolve()

    const counter = document.querySelector('.qcm-char-count') as HTMLElement | null
    expect(counter).not.toBeNull()
    expect(counter!.textContent?.trim()).toBe('0 字')
    expect(counter!.classList.contains('is-dimmed')).toBe(true)

    wrapper.unmount()
  })

  it('updates char count and removes is-dimmed when text is typed', async () => {
    const wrapper = mountModal()
    await Promise.resolve()
    await Promise.resolve()

    const textarea = document.querySelector('textarea.qc-textarea') as HTMLTextAreaElement | null
    expect(textarea).not.toBeNull()

    // Simulate user typing
    textarea!.value = 'Hello'
    textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()

    const counter = document.querySelector('.qcm-char-count') as HTMLElement | null
    expect(counter).not.toBeNull()
    expect(counter!.textContent?.trim()).toBe('5 字')
    expect(counter!.classList.contains('is-dimmed')).toBe(false)

    wrapper.unmount()
  })
})

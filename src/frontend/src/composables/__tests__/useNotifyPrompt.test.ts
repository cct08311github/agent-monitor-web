import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, computed } from 'vue'
import { useNotifyPrompt, _resetNotifyPromptState } from '../useNotifyPrompt'

// ---------------------------------------------------------------------------
// Mock utility modules
// ---------------------------------------------------------------------------

vi.mock('@/utils/notifyPromptState', () => ({
  markShown: vi.fn(),
  shouldShowPrompt: vi.fn(() => true),
  isPromptShown: vi.fn(() => false),
  resetShown: vi.fn(),
}))

vi.mock('@/utils/desktopNotify', () => ({
  requestPermission: vi.fn(async () => 'granted'),
  setEnabled: vi.fn(),
  getPermission: vi.fn(() => 'default'),
  isEnabled: vi.fn(() => false),
}))

vi.mock('@/composables/useDesktopNotify', () => ({
  useDesktopNotify: vi.fn(() => ({
    permission: { value: 'default' },
    enabled: { value: false },
    isUnsupported: { value: false },
  })),
}))

import { markShown, shouldShowPrompt } from '@/utils/notifyPromptState'
import { requestPermission, setEnabled } from '@/utils/desktopNotify'
import { useDesktopNotify } from '@/composables/useDesktopNotify'

const mockMarkShown = vi.mocked(markShown)
const mockShouldShowPrompt = vi.mocked(shouldShowPrompt)
const mockRequestPermission = vi.mocked(requestPermission)
const mockSetEnabled = vi.mocked(setEnabled)
const mockUseDesktopNotify = vi.mocked(useDesktopNotify)

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  _resetNotifyPromptState()
  vi.clearAllMocks()
  mockShouldShowPrompt.mockReturnValue(true)
  mockRequestPermission.mockResolvedValue('granted')
  // Reset the desktopNotify mock to return fresh mutable refs each call
  const permissionRef = ref<'default' | 'granted' | 'denied' | 'unsupported'>('default')
  const enabledRef = ref(false)
  mockUseDesktopNotify.mockReturnValue({
    permission: permissionRef,
    enabled: enabledRef,
    isUnsupported: computed(() => false),
    toggle: vi.fn(async () => ({ ok: true })),
    send: vi.fn(() => null),
  })
})

// ---------------------------------------------------------------------------
// maybeOpen
// ---------------------------------------------------------------------------

describe('maybeOpen', () => {
  it('opens the banner when shouldShowPrompt returns true', () => {
    const { isOpen, maybeOpen } = useNotifyPrompt()
    mockShouldShowPrompt.mockReturnValue(true)
    maybeOpen()
    expect(isOpen.value).toBe(true)
  })

  it('does NOT open the banner when shouldShowPrompt returns false', () => {
    const { isOpen, maybeOpen } = useNotifyPrompt()
    mockShouldShowPrompt.mockReturnValue(false)
    maybeOpen()
    expect(isOpen.value).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// enable
// ---------------------------------------------------------------------------

describe('enable', () => {
  it('calls requestPermission and setEnabled(true) on granted', async () => {
    mockRequestPermission.mockResolvedValue('granted')
    const { enable } = useNotifyPrompt()
    const result = await enable()
    expect(mockRequestPermission).toHaveBeenCalledOnce()
    expect(mockSetEnabled).toHaveBeenCalledWith(true)
    expect(result).toBe(true)
  })

  it('calls markShown and closes the banner', async () => {
    const { isOpen, open, enable } = useNotifyPrompt()
    open()
    expect(isOpen.value).toBe(true)
    await enable()
    expect(mockMarkShown).toHaveBeenCalledOnce()
    expect(isOpen.value).toBe(false)
  })

  it('returns false and does NOT call setEnabled when permission is denied', async () => {
    mockRequestPermission.mockResolvedValue('denied')
    const { enable } = useNotifyPrompt()
    const result = await enable()
    expect(mockSetEnabled).not.toHaveBeenCalled()
    expect(result).toBe(false)
  })

  it('syncs useDesktopNotify permission ref after requestPermission resolves', async () => {
    mockRequestPermission.mockResolvedValue('granted')
    const dnPermission = ref<'default' | 'granted' | 'denied' | 'unsupported'>('default')
    const dnEnabled = ref(false)
    mockUseDesktopNotify.mockReturnValue({
      permission: dnPermission,
      enabled: dnEnabled,
      isUnsupported: computed(() => false),
      toggle: vi.fn(async () => ({ ok: true })),
      send: vi.fn(() => null),
    })
    const { enable } = useNotifyPrompt()
    await enable()
    expect(dnPermission.value).toBe('granted')
    expect(dnEnabled.value).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// decline
// ---------------------------------------------------------------------------

describe('decline', () => {
  it('calls markShown and closes the banner', () => {
    const { isOpen, open, decline } = useNotifyPrompt()
    open()
    expect(isOpen.value).toBe(true)
    decline()
    expect(mockMarkShown).toHaveBeenCalledOnce()
    expect(isOpen.value).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// later
// ---------------------------------------------------------------------------

describe('later', () => {
  it('closes the banner WITHOUT calling markShown', () => {
    const { isOpen, open, later } = useNotifyPrompt()
    open()
    expect(isOpen.value).toBe(true)
    later()
    expect(isOpen.value).toBe(false)
    expect(mockMarkShown).not.toHaveBeenCalled()
  })
})

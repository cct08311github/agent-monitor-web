import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDesktopNotify, _resetDesktopNotifyState } from '../useDesktopNotify'

// ---------------------------------------------------------------------------
// Mock @/utils/desktopNotify — use vi.hoisted() so refs are available when
// vi.mock factory is called (factory is hoisted above imports by Vitest)
// ---------------------------------------------------------------------------

const {
  mockGetPermission,
  mockRequestPermission,
  mockIsEnabled,
  mockSetEnabled,
  mockShowNotification,
} = vi.hoisted(() => ({
  mockGetPermission: vi.fn(() => 'default' as 'default' | 'granted' | 'denied' | 'unsupported'),
  mockRequestPermission: vi.fn(async () => 'granted' as 'default' | 'granted' | 'denied' | 'unsupported'),
  mockIsEnabled: vi.fn(() => false),
  mockSetEnabled: vi.fn(),
  mockShowNotification: vi.fn(() => null as Notification | null),
}))

vi.mock('@/utils/desktopNotify', () => ({
  getPermission: () => mockGetPermission(),
  requestPermission: () => mockRequestPermission(),
  isEnabled: () => mockIsEnabled(),
  setEnabled: (b: boolean) => mockSetEnabled(b),
  showNotification: (...args: Parameters<typeof mockShowNotification>) =>
    mockShowNotification(...args),
}))

// ---------------------------------------------------------------------------
// Mock @/composables/useQuietHours
// ---------------------------------------------------------------------------

vi.mock('@/composables/useQuietHours', () => ({
  isQuietNow: () => false,
}))

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockGetPermission.mockReturnValue('default')
  mockRequestPermission.mockResolvedValue('granted')
  mockIsEnabled.mockReturnValue(false)
  mockSetEnabled.mockReturnValue(undefined)
  mockShowNotification.mockReturnValue(null)
  _resetDesktopNotifyState()
})

// ---------------------------------------------------------------------------
// toggle
// ---------------------------------------------------------------------------

describe('useDesktopNotify — toggle', () => {
  it('from default: requests permission, returns ok:true, sets enabled true', async () => {
    mockGetPermission.mockReturnValue('default')
    mockRequestPermission.mockResolvedValue('granted')

    const { toggle, enabled, permission } = useDesktopNotify()
    expect(enabled.value).toBe(false)

    const result = await toggle()
    expect(result).toEqual({ ok: true })
    expect(permission.value).toBe('granted')
    expect(enabled.value).toBe(true)
    expect(mockSetEnabled).toHaveBeenCalledWith(true)
  })

  it('when already granted: flips enabled without requesting permission', async () => {
    mockGetPermission.mockReturnValue('granted')
    _resetDesktopNotifyState()

    const { toggle, enabled } = useDesktopNotify()
    expect(enabled.value).toBe(false)

    const result = await toggle()
    expect(result).toEqual({ ok: true })
    expect(enabled.value).toBe(true)
    expect(mockRequestPermission).not.toHaveBeenCalled()

    // toggle again flips back
    const result2 = await toggle()
    expect(result2).toEqual({ ok: true })
    expect(enabled.value).toBe(false)
  })

  it('when denied: returns ok:false with reason "denied"', async () => {
    mockGetPermission.mockReturnValue('denied')
    _resetDesktopNotifyState()

    const { toggle } = useDesktopNotify()
    const result = await toggle()
    expect(result).toEqual({ ok: false, reason: 'denied' })
    expect(mockSetEnabled).not.toHaveBeenCalled()
  })

  it('when unsupported: returns ok:false with reason "unsupported"', async () => {
    mockGetPermission.mockReturnValue('unsupported')
    _resetDesktopNotifyState()

    const { toggle } = useDesktopNotify()
    const result = await toggle()
    expect(result).toEqual({ ok: false, reason: 'unsupported' })
    expect(mockSetEnabled).not.toHaveBeenCalled()
  })

  it('when default and user denies: returns ok:false with reason "denied"', async () => {
    mockGetPermission.mockReturnValue('default')
    mockRequestPermission.mockResolvedValue('denied')
    _resetDesktopNotifyState()

    const { toggle } = useDesktopNotify()
    const result = await toggle()
    expect(result).toEqual({ ok: false, reason: 'denied' })
    expect(mockSetEnabled).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// send
// ---------------------------------------------------------------------------

describe('useDesktopNotify — send', () => {
  it('delegates to showNotification with correct guards', () => {
    const fakeNotification = { title: 'Agent Monitor', close: vi.fn(), onclick: null } as unknown as Notification
    mockShowNotification.mockReturnValue(fakeNotification)

    const { send } = useDesktopNotify()
    const result = send('Agent Monitor', 'CPU 95%')

    expect(mockShowNotification).toHaveBeenCalledOnce()
    expect(result).toBe(fakeNotification)
  })

  it('returns null when showNotification returns null', () => {
    mockShowNotification.mockReturnValue(null)

    const { send } = useDesktopNotify()
    const result = send('Agent Monitor', 'test')
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// isUnsupported computed
// ---------------------------------------------------------------------------

describe('useDesktopNotify — isUnsupported', () => {
  it('is true when permission is "unsupported"', () => {
    mockGetPermission.mockReturnValue('unsupported')
    _resetDesktopNotifyState()

    const { isUnsupported } = useDesktopNotify()
    expect(isUnsupported.value).toBe(true)
  })

  it('is false when permission is "granted"', () => {
    mockGetPermission.mockReturnValue('granted')
    _resetDesktopNotifyState()

    const { isUnsupported } = useDesktopNotify()
    expect(isUnsupported.value).toBe(false)
  })
})

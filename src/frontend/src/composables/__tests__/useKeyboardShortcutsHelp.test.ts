import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useKeyboardShortcutsHelp, installShortcutsHelpHotkey } from '../useKeyboardShortcutsHelp'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fireKey(key: string, target: EventTarget = document, extra: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...extra })
  Object.defineProperty(event, 'target', { value: target, writable: false })
  document.dispatchEvent(event)
}

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

describe('useKeyboardShortcutsHelp — state management', () => {
  let uninstall: () => void

  beforeEach(() => {
    // Reset shared state and install the hotkey before each test
    const { close } = useKeyboardShortcutsHelp()
    close()
    uninstall = installShortcutsHelpHotkey()
  })

  afterEach(() => {
    uninstall()
  })

  it('isOpen starts as false', () => {
    const { isOpen } = useKeyboardShortcutsHelp()
    expect(isOpen.value).toBe(false)
  })

  it('open() sets isOpen to true', () => {
    const { isOpen, open } = useKeyboardShortcutsHelp()
    open()
    expect(isOpen.value).toBe(true)
  })

  it('close() sets isOpen to false', () => {
    const { isOpen, open, close } = useKeyboardShortcutsHelp()
    open()
    expect(isOpen.value).toBe(true)
    close()
    expect(isOpen.value).toBe(false)
  })

  it('toggle() flips isOpen from false to true', () => {
    const { isOpen, toggle } = useKeyboardShortcutsHelp()
    expect(isOpen.value).toBe(false)
    toggle()
    expect(isOpen.value).toBe(true)
  })

  it('toggle() flips isOpen from true to false', () => {
    const { isOpen, open, toggle } = useKeyboardShortcutsHelp()
    open()
    expect(isOpen.value).toBe(true)
    toggle()
    expect(isOpen.value).toBe(false)
  })

  it('multiple callers share the same isOpen ref', () => {
    const a = useKeyboardShortcutsHelp()
    const b = useKeyboardShortcutsHelp()
    a.open()
    expect(b.isOpen.value).toBe(true)
    b.close()
    expect(a.isOpen.value).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Hotkey — opens on "?"
// ---------------------------------------------------------------------------

describe('installShortcutsHelpHotkey — "?" hotkey', () => {
  let uninstall: () => void

  beforeEach(() => {
    const { close } = useKeyboardShortcutsHelp()
    close()
    uninstall = installShortcutsHelpHotkey()
  })

  afterEach(() => {
    uninstall()
  })

  it('pressing "?" on the document opens the panel', () => {
    const { isOpen } = useKeyboardShortcutsHelp()
    expect(isOpen.value).toBe(false)
    fireKey('?')
    expect(isOpen.value).toBe(true)
  })

  it('pressing "?" when an <input> is the target does NOT open the panel', () => {
    const { isOpen } = useKeyboardShortcutsHelp()
    const input = document.createElement('input')
    document.body.appendChild(input)

    const event = new KeyboardEvent('keydown', { key: '?', bubbles: true })
    Object.defineProperty(event, 'target', { value: input, writable: false })
    document.dispatchEvent(event)

    expect(isOpen.value).toBe(false)
    document.body.removeChild(input)
  })

  it('pressing "?" when a <textarea> is the target does NOT open the panel', () => {
    const { isOpen } = useKeyboardShortcutsHelp()
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)

    const event = new KeyboardEvent('keydown', { key: '?', bubbles: true })
    Object.defineProperty(event, 'target', { value: textarea, writable: false })
    document.dispatchEvent(event)

    expect(isOpen.value).toBe(false)
    document.body.removeChild(textarea)
  })

  it('pressing "?" when a contenteditable element is active does NOT open the panel', () => {
    const { isOpen } = useKeyboardShortcutsHelp()
    const div = document.createElement('div')
    div.contentEditable = 'true'
    document.body.appendChild(div)

    const event = new KeyboardEvent('keydown', { key: '?', bubbles: true })
    Object.defineProperty(event, 'target', { value: div, writable: false })
    document.dispatchEvent(event)

    expect(isOpen.value).toBe(false)
    document.body.removeChild(div)
  })

  it('pressing Esc closes the panel when it is open', () => {
    const { isOpen, open } = useKeyboardShortcutsHelp()
    open()
    expect(isOpen.value).toBe(true)
    fireKey('Escape')
    expect(isOpen.value).toBe(false)
  })

  it('pressing Esc when panel is already closed does nothing', () => {
    const { isOpen } = useKeyboardShortcutsHelp()
    expect(isOpen.value).toBe(false)
    // Should not throw
    fireKey('Escape')
    expect(isOpen.value).toBe(false)
  })

  it('unrelated keys do not open the panel', () => {
    const { isOpen } = useKeyboardShortcutsHelp()
    for (const key of ['a', 'Enter', 'ArrowUp', '1', 'k']) {
      fireKey(key)
      expect(isOpen.value).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Ref-count — listener added once and removed when last caller uninstalls
// ---------------------------------------------------------------------------

describe('installShortcutsHelpHotkey — ref counting', () => {
  it('calling install multiple times only adds listener once', () => {
    const { close } = useKeyboardShortcutsHelp()
    close()

    const spy = { count: 0 }
    const originalAdd = document.addEventListener.bind(document)
    document.addEventListener = (type: string, handler: EventListenerOrEventListenerObject, ...rest: Parameters<typeof document.addEventListener>[2][]) => {
      if (type === 'keydown') spy.count++
      return originalAdd(type, handler, ...rest)
    }

    const u1 = installShortcutsHelpHotkey()
    const u2 = installShortcutsHelpHotkey()
    // Only one DOM listener should have been added
    expect(spy.count).toBeLessThanOrEqual(1)
    u1()
    u2()
    document.addEventListener = originalAdd
  })

  it('listener is removed when all callers uninstall', () => {
    const { isOpen, close } = useKeyboardShortcutsHelp()
    close()

    const u1 = installShortcutsHelpHotkey()
    const u2 = installShortcutsHelpHotkey()

    // Both installed — "?" should open
    fireKey('?')
    expect(isOpen.value).toBe(true)
    close()

    // Uninstall both
    u1()
    u2()

    // Listener removed — "?" should no longer open
    fireKey('?')
    expect(isOpen.value).toBe(false)
  })
})

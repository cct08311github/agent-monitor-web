import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createFocusTrap } from './focusTrap'

function buildDom(): {
  trigger: HTMLButtonElement
  dialog: HTMLDivElement
  btn1: HTMLButtonElement
  btn2: HTMLButtonElement
  btn3: HTMLButtonElement
  cleanup: () => void
} {
  const trigger = document.createElement('button')
  trigger.textContent = 'Trigger'
  document.body.appendChild(trigger)

  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  document.body.appendChild(dialog)

  const btn1 = document.createElement('button')
  btn1.textContent = 'First'
  const btn2 = document.createElement('button')
  btn2.textContent = 'Second'
  const btn3 = document.createElement('button')
  btn3.textContent = 'Last'
  dialog.appendChild(btn1)
  dialog.appendChild(btn2)
  dialog.appendChild(btn3)

  return {
    trigger,
    dialog,
    btn1,
    btn2,
    btn3,
    cleanup: () => {
      trigger.remove()
      dialog.remove()
    },
  }
}

describe('createFocusTrap', () => {
  let dom: ReturnType<typeof buildDom>
  let trap: ReturnType<typeof createFocusTrap>

  beforeEach(() => {
    dom = buildDom()
    trap = createFocusTrap()
  })

  afterEach(() => {
    trap.deactivate()
    dom.cleanup()
  })

  it('moves focus to first focusable inside container on activate', () => {
    dom.trigger.focus()
    trap.activate(dom.dialog)
    expect(document.activeElement).toBe(dom.btn1)
  })

  it('wraps focus from last to first on Tab', () => {
    trap.activate(dom.dialog)
    dom.btn3.focus()
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(event)
    expect(document.activeElement).toBe(dom.btn1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('wraps focus from first to last on Shift+Tab', () => {
    trap.activate(dom.dialog)
    dom.btn1.focus()
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    document.dispatchEvent(event)
    expect(document.activeElement).toBe(dom.btn3)
    expect(event.defaultPrevented).toBe(true)
  })

  it('invokes onEscape handler on Escape key', () => {
    const onEscape = vi.fn()
    trap.activate(dom.dialog, onEscape)
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    document.dispatchEvent(event)
    expect(onEscape).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('restores focus to previously active element on deactivate', () => {
    dom.trigger.focus()
    trap.activate(dom.dialog)
    expect(document.activeElement).toBe(dom.btn1)
    trap.deactivate()
    expect(document.activeElement).toBe(dom.trigger)
  })

  it('second activate supersedes first without leaking listener', () => {
    const onEscape1 = vi.fn()
    const onEscape2 = vi.fn()
    trap.activate(dom.dialog, onEscape1)
    trap.activate(dom.dialog, onEscape2)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onEscape1).not.toHaveBeenCalled()
    expect(onEscape2).toHaveBeenCalledTimes(1)
  })

  it('deactivate without prior activate is safe no-op', () => {
    expect(() => trap.deactivate()).not.toThrow()
  })

  it('Tab without focus on boundary element leaves default behavior', () => {
    trap.activate(dom.dialog)
    dom.btn2.focus() // middle element — not first or last
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(event)
    // Not at boundary — trap does nothing; default Tab behavior runs
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('createFocusTrap — nested traps', () => {
  it('only topmost trap handles Escape when nested', () => {
    const outerDialog = document.createElement('div')
    const outerBtn = document.createElement('button')
    outerDialog.appendChild(outerBtn)
    document.body.appendChild(outerDialog)

    const innerDialog = document.createElement('div')
    const innerBtn = document.createElement('button')
    innerDialog.appendChild(innerBtn)
    document.body.appendChild(innerDialog)

    const outerEscape = vi.fn()
    const innerEscape = vi.fn()
    const outer = createFocusTrap()
    const inner = createFocusTrap()

    outer.activate(outerDialog, outerEscape)
    inner.activate(innerDialog, innerEscape)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(innerEscape).toHaveBeenCalledTimes(1)
    expect(outerEscape).not.toHaveBeenCalled()

    inner.deactivate()
    // Now outer is topmost; Escape routes to outer
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(outerEscape).toHaveBeenCalledTimes(1)

    outer.deactivate()
    outerDialog.remove()
    innerDialog.remove()
  })

  it('outer trap Tab handling resumes after inner deactivates', () => {
    const outerDialog = document.createElement('div')
    const o1 = document.createElement('button')
    const o2 = document.createElement('button')
    outerDialog.appendChild(o1); outerDialog.appendChild(o2)
    document.body.appendChild(outerDialog)

    const innerDialog = document.createElement('div')
    const innerBtn = document.createElement('button')
    innerDialog.appendChild(innerBtn)
    document.body.appendChild(innerDialog)

    const outer = createFocusTrap()
    const inner = createFocusTrap()

    outer.activate(outerDialog)
    inner.activate(innerDialog)

    // While inner is active, outer does NOT trap Tab on its boundary
    o2.focus()
    const blocked = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(blocked)
    expect(blocked.defaultPrevented).toBe(false) // outer handler ignored

    // After inner deactivates, outer's Tab trap works
    inner.deactivate()
    o2.focus()
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(o1)

    outer.deactivate()
    outerDialog.remove()
    innerDialog.remove()
  })
})

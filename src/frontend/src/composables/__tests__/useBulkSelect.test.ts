import { describe, it, expect, beforeEach } from 'vitest'
import { useBulkSelect } from '../useBulkSelect'

describe('useBulkSelect', () => {
  let bulk: ReturnType<typeof useBulkSelect>

  beforeEach(() => {
    bulk = useBulkSelect()
  })

  it('initial count is 0', () => {
    expect(bulk.count.value).toBe(0)
    expect(bulk.selected.value.size).toBe(0)
  })

  it('toggle adds an id; toggling again removes it', () => {
    bulk.toggle('a')
    expect(bulk.isSelected('a')).toBe(true)
    expect(bulk.count.value).toBe(1)

    bulk.toggle('a')
    expect(bulk.isSelected('a')).toBe(false)
    expect(bulk.count.value).toBe(0)
  })

  it('setAllIds then selectAll selects all', () => {
    bulk.setAllIds(['a', 'b', 'c'])
    bulk.selectAll()
    expect(bulk.count.value).toBe(3)
    expect(bulk.isSelected('a')).toBe(true)
    expect(bulk.isSelected('b')).toBe(true)
    expect(bulk.isSelected('c')).toBe(true)
  })

  it('clear empties selection and resets lastSelectedId', () => {
    bulk.setAllIds(['a', 'b', 'c'])
    bulk.selectAll()
    bulk.clear()
    expect(bulk.count.value).toBe(0)
    expect(bulk.selected.value.size).toBe(0)

    // After clear, shift+toggle should act like a plain toggle (no range from old lastSelectedId)
    bulk.toggle('b', { shift: true })
    expect(bulk.isSelected('b')).toBe(true)
    expect(bulk.count.value).toBe(1)
  })

  it('isSelected reflects current state', () => {
    expect(bulk.isSelected('x')).toBe(false)
    bulk.toggle('x')
    expect(bulk.isSelected('x')).toBe(true)
    bulk.toggle('x')
    expect(bulk.isSelected('x')).toBe(false)
  })

  it('toggle with shift:true and lastSelectedId === null behaves as plain toggle', () => {
    bulk.setAllIds(['a', 'b', 'c'])
    // No prior toggle, so lastSelectedId is null
    bulk.toggle('b', { shift: true })
    expect(bulk.isSelected('b')).toBe(true)
    expect(bulk.count.value).toBe(1)
  })

  it('toggle("a") then toggle("c", { shift: true }) selects range [a, b, c]', () => {
    bulk.setAllIds(['a', 'b', 'c'])
    bulk.toggle('a')
    bulk.toggle('c', { shift: true })
    expect(bulk.isSelected('a')).toBe(true)
    expect(bulk.isSelected('b')).toBe(true)
    expect(bulk.isSelected('c')).toBe(true)
    expect(bulk.count.value).toBe(3)
  })

  it('toggle("c") then toggle("a", { shift: true }) selects range [a, b, c] (reverse)', () => {
    bulk.setAllIds(['a', 'b', 'c'])
    bulk.toggle('c')
    bulk.toggle('a', { shift: true })
    expect(bulk.isSelected('a')).toBe(true)
    expect(bulk.isSelected('b')).toBe(true)
    expect(bulk.isSelected('c')).toBe(true)
  })

  it('range select is additive — does not deselect existing selections', () => {
    bulk.setAllIds(['a', 'b', 'c', 'd', 'e'])
    bulk.toggle('e') // select e first
    bulk.toggle('a') // now a is last selected
    bulk.toggle('c', { shift: true }) // range a..c
    // a, b, c selected via range; e was already selected and must stay
    expect(bulk.isSelected('a')).toBe(true)
    expect(bulk.isSelected('b')).toBe(true)
    expect(bulk.isSelected('c')).toBe(true)
    expect(bulk.isSelected('e')).toBe(true)
    expect(bulk.count.value).toBe(4)
  })

  it('allSelected is true when selected.size equals allIds.length (> 0)', () => {
    bulk.setAllIds(['a', 'b'])
    expect(bulk.allSelected.value).toBe(false)
    bulk.selectAll()
    expect(bulk.allSelected.value).toBe(true)
    bulk.toggle('a')
    expect(bulk.allSelected.value).toBe(false)
  })

  it('someSelected is true when 0 < size < allIds.length', () => {
    bulk.setAllIds(['a', 'b', 'c'])
    expect(bulk.someSelected.value).toBe(false)
    bulk.toggle('a')
    expect(bulk.someSelected.value).toBe(true)
    bulk.selectAll()
    expect(bulk.someSelected.value).toBe(false)
    bulk.clear()
    expect(bulk.someSelected.value).toBe(false)
  })

  it('allSelected is false when allIds is empty', () => {
    bulk.selectAll() // allIds is empty
    expect(bulk.allSelected.value).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// useBulkSelect — generic multi-select composable with shift-click range support
//
// Usage:
//   const bulk = useBulkSelect()
//   bulk.setAllIds(alerts.map(a => a.id))
//   bulk.toggle('id-1')
//   bulk.toggle('id-3', { shift: true }) // range select from last toggled
// ---------------------------------------------------------------------------

import { ref, computed, type Ref, type ComputedRef } from 'vue'

export interface BulkSelectApi {
  selected: Ref<Set<string>>
  count: ComputedRef<number>
  allIds: Ref<string[]>
  setAllIds(ids: ReadonlyArray<string>): void
  toggle(id: string, opts?: { shift?: boolean }): void
  selectAll(): void
  clear(): void
  isSelected(id: string): boolean
  allSelected: ComputedRef<boolean>
  someSelected: ComputedRef<boolean>
}

export function useBulkSelect(): BulkSelectApi {
  const selected = ref<Set<string>>(new Set())
  const allIds = ref<string[]>([])
  const lastSelectedId = ref<string | null>(null)

  function toggle(id: string, opts?: { shift?: boolean }): void {
    if (opts?.shift && lastSelectedId.value !== null && lastSelectedId.value !== id) {
      const a = allIds.value.indexOf(lastSelectedId.value)
      const b = allIds.value.indexOf(id)
      if (a >= 0 && b >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a]
        const next = new Set(selected.value)
        for (let i = from; i <= to; i++) next.add(allIds.value[i])
        selected.value = next
        lastSelectedId.value = id
        return
      }
    }
    const next = new Set(selected.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selected.value = next
    lastSelectedId.value = id
  }

  function setAllIds(ids: ReadonlyArray<string>): void {
    allIds.value = [...ids]
  }

  function selectAll(): void {
    selected.value = new Set(allIds.value)
  }

  function clear(): void {
    selected.value = new Set()
    lastSelectedId.value = null
  }

  return {
    selected,
    count: computed(() => selected.value.size),
    allIds,
    setAllIds,
    toggle,
    selectAll,
    clear,
    isSelected: (id: string) => selected.value.has(id),
    allSelected: computed(
      () => allIds.value.length > 0 && selected.value.size === allIds.value.length,
    ),
    someSelected: computed(
      () => selected.value.size > 0 && selected.value.size < allIds.value.length,
    ),
  }
}

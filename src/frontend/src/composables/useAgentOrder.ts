import { ref, computed } from 'vue'
import {
  loadOrder,
  saveOrder,
  reorder as reorderUtil,
  applyOrder,
} from '@/utils/agentOrder'

// Module-scoped reactive order state so all consumers share a single instance
const order = ref<string[]>(loadOrder())

export function useAgentOrder() {
  return {
    order: computed(() => order.value),

    setOrder(next: ReadonlyArray<string>) {
      order.value = [...next]
      saveOrder(next)
    },

    handleDrop(dragId: string, dropId: string) {
      const next = reorderUtil(order.value, dragId, dropId)
      order.value = next
      saveOrder(next)
    },

    sortedView<T extends { id: string }>(items: ReadonlyArray<T>): T[] {
      return applyOrder(items, order.value)
    },

    /**
     * Seed the order from the current agent list the first time agents arrive.
     * This captures the default server order so subsequent renders are stable.
     */
    seedFromAgents(agents: ReadonlyArray<{ id: string }>) {
      if (order.value.length === 0 && agents.length > 0) {
        const ids = agents.map((a) => a.id)
        order.value = ids
        saveOrder(ids)
      }
    },
  }
}

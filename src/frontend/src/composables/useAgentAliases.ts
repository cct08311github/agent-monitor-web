// ---------------------------------------------------------------------------
// useAgentAliases — module-scoped reactive alias store.
// Shared across components so alias changes propagate everywhere instantly.
// ---------------------------------------------------------------------------

import { ref, computed } from 'vue'
import {
  loadAllAliases,
  saveAlias as saveUtil,
  clearAlias as clearUtil,
  displayAgentName,
} from '@/utils/agentAliases'

const aliases = ref<Map<string, string>>(loadAllAliases())

export function useAgentAliases() {
  return {
    aliases: computed(() => aliases.value),

    getAlias: (agentId: string): string | null => aliases.value.get(agentId) ?? null,

    setAlias: (agentId: string, alias: string): void => {
      saveUtil(agentId, alias)
      const next = new Map(aliases.value)
      const trimmed = alias.trim()
      if (trimmed) {
        next.set(agentId, trimmed)
      } else {
        next.delete(agentId)
      }
      aliases.value = next
    },

    clearAlias: (agentId: string): void => {
      clearUtil(agentId)
      const next = new Map(aliases.value)
      next.delete(agentId)
      aliases.value = next
    },

    displayName: (agentId: string, fallbackName?: string | null): string => {
      return displayAgentName(agentId, aliases.value.get(agentId) ?? null, fallbackName)
    },
  }
}

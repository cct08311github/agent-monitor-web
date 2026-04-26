// ---------------------------------------------------------------------------
// useCronAliases — module-scoped reactive alias store for cron jobs.
// Shared across components so alias changes propagate everywhere instantly.
// ---------------------------------------------------------------------------

import { ref, computed } from 'vue'
import {
  loadAllCronAliases,
  saveCronAlias as saveUtil,
  clearCronAlias as clearUtil,
  displayCronJobName,
} from '@/utils/cronAliases'

const aliases = ref<Map<string, string>>(loadAllCronAliases())

export function useCronAliases() {
  return {
    aliases: computed(() => aliases.value),

    getAlias: (jobId: string): string | null => aliases.value.get(jobId) ?? null,

    setAlias: (jobId: string, alias: string): void => {
      saveUtil(jobId, alias)
      const next = new Map(aliases.value)
      const trimmed = alias.trim()
      if (trimmed) {
        next.set(jobId, trimmed)
      } else {
        next.delete(jobId)
      }
      aliases.value = next
    },

    clearAlias: (jobId: string): void => {
      clearUtil(jobId)
      const next = new Map(aliases.value)
      next.delete(jobId)
      aliases.value = next
    },

    displayName: (jobId: string, fallbackName?: string | null): string => {
      return displayCronJobName(jobId, aliases.value.get(jobId) ?? null, fallbackName)
    },
  }
}

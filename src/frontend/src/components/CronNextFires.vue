<script setup lang="ts">
import { computed } from 'vue'
import { nextFireTimes } from '@/utils/cronNextFires'

const props = withDefaults(
  defineProps<{
    expression: string
    count?: number
  }>(),
  { count: 5 },
)

const result = computed(() => nextFireTimes(props.expression, props.count))

const fmt = new Intl.DateTimeFormat('zh-TW', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatTime(d: Date): string {
  return fmt.format(d)
}
</script>

<template>
  <details class="cron-next-fires">
    <summary class="cron-next-fires-summary">
      <template v-if="result.supported">
        ▶ 下次 {{ count }} 次觸發
      </template>
      <template v-else>
        <span class="cron-next-fires-unsupported">⚠ 無法預測</span>
      </template>
    </summary>

    <ol v-if="result.supported && result.times.length > 0" class="cron-next-fires-list">
      <li v-for="(t, idx) in result.times" :key="idx" class="cron-next-fires-item">
        {{ formatTime(t) }}
      </li>
    </ol>

    <p v-else-if="result.supported" class="cron-next-fires-empty">
      未來 366 天內無觸發
    </p>
  </details>
</template>

<style scoped>
.cron-next-fires {
  margin-top: 6px;
}

.cron-next-fires-summary {
  font-size: 11px;
  color: var(--text-muted, #94a3b8);
  cursor: pointer;
  user-select: none;
  list-style: none;
  padding: 2px 0;
}

.cron-next-fires-summary::-webkit-details-marker {
  display: none;
}

.cron-next-fires-summary::marker {
  display: none;
}

.cron-next-fires-summary:hover {
  color: var(--text, #e2e8f0);
}

.cron-next-fires-unsupported {
  color: var(--yellow, #f59e0b);
}

.cron-next-fires-list {
  margin: 6px 0 4px 16px;
  padding: 0;
  list-style: decimal;
}

.cron-next-fires-item {
  font-size: 11px;
  color: var(--text, #e2e8f0);
  font-variant-numeric: tabular-nums;
  line-height: 1.6;
}

.cron-next-fires-empty {
  font-size: 11px;
  color: var(--text-muted, #94a3b8);
  margin: 4px 0 0 4px;
}

@media (prefers-reduced-motion: reduce) {
  details[open] > summary ~ * {
    animation: none;
  }
}
</style>

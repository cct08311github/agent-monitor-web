<script setup lang="ts">
import { computed } from 'vue'
import { useMessageRate } from '@/composables/useMessageRate'

const { orderedBuckets, avgPerSec, peakPerSec } = useMessageRate()

/** Build the SVG polyline points string from ordered bucket data. */
const points = computed<string>(() => {
  const data = orderedBuckets.value
  // Guard divide-by-zero: use at least 1 as the max
  const max = Math.max(1, peakPerSec.value)
  return data
    .map((count, i) => {
      const x = i
      // 24px height; leave 2px at the top so the peak line is visible
      const y = 24 - (count / max) * 22
      return `${x},${y.toFixed(2)}`
    })
    .join(' ')
})

const tooltipText = computed<string>(() =>
  `過去 60s · 平均 ${avgPerSec.value.toFixed(1)} msg/s · 峰值 ${peakPerSec.value}`,
)
</script>

<template>
  <span
    class="msg-rate-sparkline"
    :aria-label="tooltipText"
    title=""
  >
    <svg
      width="80"
      height="24"
      viewBox="0 0 60 24"
      aria-hidden="true"
      class="msg-rate-sparkline__svg"
    >
      <title>{{ tooltipText }}</title>
      <polyline
        :points="points"
        fill="none"
        stroke="var(--accent)"
        stroke-width="1.5"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </svg>
  </span>
</template>

<style scoped>
.msg-rate-sparkline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0.85;
  transition: opacity 0.15s;
}

.msg-rate-sparkline:hover {
  opacity: 1;
}

.msg-rate-sparkline__svg {
  display: block;
  overflow: visible;
}

@media (prefers-reduced-motion: reduce) {
  .msg-rate-sparkline {
    transition: none;
  }
}
</style>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  activeRatio?: number  // 0..1
  activeCount?: number
  totalCount?: number
}>(), {
  activeRatio: 0,
  activeCount: 0,
  totalCount: 0,
})

const clampedRatio = computed(() => Math.max(0, Math.min(1, props.activeRatio)))

// duration 3s (slow) ↔ 0.6s (fast) linear interpolation
const durationSec = computed(() => parseFloat((3 - clampedRatio.value * 2.4).toFixed(3)))

const color = computed(() => {
  if (clampedRatio.value < 0.2) return '#9aa0a6'  // gray
  if (clampedRatio.value < 0.7) return '#22c55e'  // green
  return '#ef4444'  // red
})

const tooltip = computed(() => `${props.activeCount}/${props.totalCount} agents active`)
</script>

<template>
  <span class="heartbeat-wrap" :title="tooltip" role="status" :aria-label="tooltip">
    <span class="heartbeat-icon" :style="{
      color: color,
      animationDuration: `${durationSec}s`
    }">❤️</span>
  </span>
</template>

<style scoped>
.heartbeat-wrap {
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  vertical-align: middle;
}
.heartbeat-icon {
  display: inline-block;
  font-size: 14px;
  transform-origin: center;
  animation: heartbeat-pulse 2s ease-in-out infinite;
  filter: drop-shadow(0 0 2px currentColor);
}
@keyframes heartbeat-pulse {
  0%, 100% { transform: scale(1); }
  20% { transform: scale(1.25); }
  40% { transform: scale(0.95); }
  60% { transform: scale(1.15); }
  80% { transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .heartbeat-icon { animation: none; }
}
</style>

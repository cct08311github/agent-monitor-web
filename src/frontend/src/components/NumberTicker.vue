<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  value: number | string
  duration?: number  // ms
}>(), {
  duration: 250,
})

// The component itself only renders the value via Transition.
// The animation drives via CSS keyframes keyed by `value`.
const display = computed(() => String(props.value))
const styleVars = computed(() => ({ '--ticker-duration': `${props.duration}ms` }))
</script>

<template>
  <Transition name="ticker" mode="out-in">
    <span :key="display" :style="styleVars" class="ticker-cell">{{ display }}</span>
  </Transition>
</template>

<style scoped>
.ticker-cell {
  display: inline-block;
  transition: transform var(--ticker-duration, 250ms) cubic-bezier(0.16, 1, 0.3, 1),
              opacity var(--ticker-duration, 250ms) ease-out;
}
.ticker-enter-from {
  opacity: 0;
  transform: translateY(-0.4em);
}
.ticker-enter-to {
  opacity: 1;
  transform: translateY(0);
}
.ticker-leave-from {
  opacity: 1;
  transform: translateY(0);
}
.ticker-leave-to {
  opacity: 0;
  transform: translateY(0.4em);
}
@media (prefers-reduced-motion: reduce) {
  .ticker-cell { transition: none; }
  .ticker-enter-from, .ticker-leave-to {
    opacity: 1;
    transform: none;
  }
}
</style>

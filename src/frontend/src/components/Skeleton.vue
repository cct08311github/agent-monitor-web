<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    width?: string
    height?: string
    rows?: number
    rounded?: boolean
  }>(),
  {
    width: '100%',
    height: '14px',
    rows: 1,
    rounded: true,
  },
)

const rowList = computed(() => Array.from({ length: Math.max(1, props.rows) }, (_, i) => i))

const styleVars = computed(() => ({
  '--skeleton-width': props.width,
  '--skeleton-height': props.height,
  '--skeleton-radius': props.rounded ? '4px' : '0',
}))
</script>

<template>
  <div class="skeleton-wrapper" :style="styleVars" role="status" aria-label="loading">
    <div v-for="i in rowList" :key="i" class="skeleton-row" />
  </div>
</template>

<style scoped>
.skeleton-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-row {
  width: var(--skeleton-width);
  height: var(--skeleton-height);
  border-radius: var(--skeleton-radius);
  background: linear-gradient(
    90deg,
    rgba(0, 0, 0, 0.06) 0%,
    rgba(0, 0, 0, 0.12) 50%,
    rgba(0, 0, 0, 0.06) 100%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s linear infinite;
}

:global([data-theme='dark']) .skeleton-row {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.06) 0%,
    rgba(255, 255, 255, 0.12) 50%,
    rgba(255, 255, 255, 0.06) 100%
  );
  background-size: 200% 100%;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-row {
    animation: none;
    background: rgba(0, 0, 0, 0.08);
  }
}
</style>

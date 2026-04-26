<script setup lang="ts">
/**
 * CaptureHeatmap — 30-day linear heatmap showing capture frequency.
 *
 * Reuses the --color-heatmap-0..4 CSS variables defined in theme.css (#477).
 * Designed to fit compactly in the QuickCaptureList header.
 */
import { computed } from 'vue'
import type { Capture } from '@/utils/quickCapture'
import { intensityBucket } from '@/utils/activityHeatmap'
import { buildCaptureGrid, bucketCapturesByDay } from '@/utils/captureHeatmap'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const props = withDefaults(
  defineProps<{
    captures: Capture[]
    days?: number
  }>(),
  { days: 30 },
)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CELL_SIZE = 12
const CELL_GAP = 2

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const grid = computed(() => buildCaptureGrid(new Date(), props.days))
const counts = computed(() => bucketCapturesByDay(props.captures))

const svgWidth = computed(
  () => props.days * CELL_SIZE + (props.days - 1) * CELL_GAP,
)
const svgHeight = CELL_SIZE

function cellX(index: number): number {
  return index * (CELL_SIZE + CELL_GAP)
}

function cellClass(key: string): string {
  const count = counts.value.get(key) ?? 0
  return `cell-l${intensityBucket(count)}`
}

function cellTitle(key: string, count: number): string {
  return `${key} · ${count} captures`
}
</script>

<template>
  <div
    class="capture-heatmap"
    role="img"
    :aria-label="`過去 ${days} 天 capture 頻率熱圖`"
  >
    <svg
      :width="svgWidth"
      :height="svgHeight"
      :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
      xmlns="http://www.w3.org/2000/svg"
      class="capture-heatmap-svg"
    >
      <rect
        v-for="(cell, i) in grid"
        :key="cell.key"
        :x="cellX(i)"
        y="0"
        :width="CELL_SIZE"
        :height="CELL_SIZE"
        rx="3"
        :class="cellClass(cell.key)"
      ><title>{{ cellTitle(cell.key, counts.get(cell.key) ?? 0) }}</title></rect>
    </svg>
  </div>
</template>

<style scoped>
.capture-heatmap {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0;
}

.capture-heatmap-svg {
  display: block;
  overflow: visible;
}

/* Cell fill classes — use the shared heatmap CSS variables */
.cell-l0 { fill: var(--color-heatmap-0); }
.cell-l1 { fill: var(--color-heatmap-1); }
.cell-l2 { fill: var(--color-heatmap-2); }
.cell-l3 { fill: var(--color-heatmap-3); }
.cell-l4 { fill: var(--color-heatmap-4); }

/* Hover: brightness shift only; no transform */
.cell-l0:hover,
.cell-l1:hover,
.cell-l2:hover,
.cell-l3:hover,
.cell-l4:hover {
  filter: brightness(1.3);
  cursor: default;
}

@media (prefers-reduced-motion: reduce) {
  .cell-l0:hover,
  .cell-l1:hover,
  .cell-l2:hover,
  .cell-l3:hover,
  .cell-l4:hover {
    filter: none;
    opacity: 0.85;
  }
}
</style>

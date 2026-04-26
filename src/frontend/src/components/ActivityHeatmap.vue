<script setup lang="ts">
import { computed, ref } from 'vue'
import { buildGrid, intensityBucket } from '@/utils/activityHeatmap'
import {
  type HeatmapRange,
  loadRange,
  saveRange,
  weeksToInt,
  cellSizeFor,
} from '@/utils/heatmapRange'
import { useTimezone } from '@/composables/useTimezone'
import { useActivityAccumulator } from '@/composables/useActivityAccumulator'
import { useToast } from '@/composables/useToast'

// ---------------------------------------------------------------------------
// Props / emits
// ---------------------------------------------------------------------------

const props = defineProps<{
  /** Map of YYYY-MM-DD → daily session count. null = not yet loaded. */
  data: Map<string, number> | null
}>()

const emit = defineEmits<{
  (e: 'reset'): void
  (e: 'select', dateKey: string): void
}>()

// ---------------------------------------------------------------------------
// Range picker state
// ---------------------------------------------------------------------------

const range = ref<HeatmapRange>(loadRange())
const weeks = computed(() => weeksToInt(range.value))
const cellSize = computed(() => cellSizeFor(range.value))

function setRange(r: HeatmapRange): void {
  range.value = r
  saveRange(r)
}

// ---------------------------------------------------------------------------
// Grid constants
// ---------------------------------------------------------------------------

const CELL_GAP = 2
const DAY_LABEL_WIDTH = 28
// Row labels: only show Sun, Mon, Wed, Fri (GitHub's pattern)
const DAY_LABELS: Array<{ row: number; label: string }> = [
  { row: 0, label: 'Sun' },
  { row: 1, label: 'Mon' },
  { row: 3, label: 'Wed' },
  { row: 5, label: 'Fri' },
]

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const today = computed(() => new Date())

const grid = computed(() => buildGrid(today.value, weeks.value))

const { format: tzFormat } = useTimezone()

/** Today's date label, respecting the user's timezone preference. */
const todayLabel = computed(() => tzFormat(today.value, { style: 'date' }))

const svgWidth = computed(
  () =>
    DAY_LABEL_WIDTH +
    weeks.value * cellSize.value +
    (weeks.value - 1) * CELL_GAP +
    4,
)

const svgHeight = computed(
  () => 7 * cellSize.value + 6 * CELL_GAP + 6, // slight padding at bottom
)

function cellX(colIndex: number): number {
  return DAY_LABEL_WIDTH + colIndex * (cellSize.value + CELL_GAP)
}

function cellY(rowIndex: number): number {
  return rowIndex * (cellSize.value + CELL_GAP)
}

function cellClass(key: string, inRange: boolean): string {
  if (!inRange) return 'cell-out'
  const count = props.data?.get(key) ?? 0
  return `cell-l${intensityBucket(count)}`
}

function cellTitle(key: string, inRange: boolean, dayOfWeek: number): string {
  if (!inRange) return ''
  const count = props.data?.get(key) ?? 0
  const dayNames = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
  const dayName = dayNames[dayOfWeek] ?? ''
  return `${key} (${dayName}) · ${count} sessions`
}

const isEmpty = computed(() => {
  if (!props.data || props.data.size === 0) return true
  for (const v of props.data.values()) {
    if (v > 0) return false
  }
  return true
})

// ---------------------------------------------------------------------------
// Reset handler
// ---------------------------------------------------------------------------

const toast = useToast()
const accumulator = useActivityAccumulator()

function onReset(): void {
  if (!window.confirm('將清空所有累積的活躍度資料，確定？')) return
  accumulator.reset()
  emit('reset')
  toast.info('已重置活躍度資料')
}
</script>

<template>
  <div class="activity-heatmap">
    <div class="heatmap-header">
      <span class="heatmap-title">過去 {{ weeks }} 週活躍度</span>
      <div class="range-picker" role="tablist" aria-label="顯示範圍">
        <button
          v-for="opt in (['7', '12', '24'] as HeatmapRange[])"
          :key="opt"
          role="tab"
          :aria-selected="range === opt"
          :class="['range-btn', { 'is-active': range === opt }]"
          @click="setRange(opt)"
        >{{ opt }} 週</button>
      </div>
      <button
        class="reset-btn"
        title="重置累積資料"
        aria-label="重置累積資料"
        @click="onReset"
      >🗑</button>
      <span class="heatmap-legend" aria-hidden="true">
        <svg width="80" height="14" viewBox="0 0 80 14" class="legend-svg">
          <rect x="0"  y="0" width="12" height="12" rx="3" class="cell-l0" />
          <rect x="17" y="0" width="12" height="12" rx="3" class="cell-l1" />
          <rect x="34" y="0" width="12" height="12" rx="3" class="cell-l2" />
          <rect x="51" y="0" width="12" height="12" rx="3" class="cell-l3" />
          <rect x="68" y="0" width="12" height="12" rx="3" class="cell-l4" />
        </svg>
        <span class="legend-label">少</span>
        <span class="legend-label legend-label--right">多</span>
      </span>
    </div>

    <div
      class="heatmap-body"
      role="img"
      :aria-label="`過去 ${weeks} 週 session 活動熱圖`"
    >
      <svg
        :width="svgWidth"
        :height="svgHeight"
        class="heatmap-svg"
        :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
        xmlns="http://www.w3.org/2000/svg"
      >
        <!-- Day-of-week labels on the left -->
        <g class="day-labels" aria-hidden="true">
          <text
            v-for="{ row, label } in DAY_LABELS"
            :key="label"
            :x="0"
            :y="cellY(row) + cellSize - 2"
            class="day-label-text"
          >{{ label }}</text>
        </g>

        <!-- Grid cells — column-major -->
        <g
          v-for="(col, colIndex) in grid"
          :key="colIndex"
        >
          <g v-for="cell in col" :key="cell.key">
            <rect
              :x="cellX(colIndex)"
              :y="cellY(cell.dayOfWeek)"
              :width="cellSize"
              :height="cellSize"
              rx="3"
              :class="cellClass(cell.key, cell.inRange)"
              :style="cell.inRange ? 'cursor: pointer' : undefined"
              @click="cell.inRange ? emit('select', cell.key) : undefined"
            ><title>{{ cellTitle(cell.key, cell.inRange, cell.dayOfWeek) }}</title></rect>
          </g>
        </g>
      </svg>

      <!-- Empty state overlay -->
      <div v-if="isEmpty" class="heatmap-empty" aria-live="polite">
        累積資料中...
      </div>
    </div>

    <!-- Today's date key label -->
    <div class="heatmap-footer" aria-hidden="true">
      今天: {{ todayLabel }}
    </div>
  </div>
</template>

<style scoped>
.activity-heatmap {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px 12px;
  display: inline-flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.heatmap-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.heatmap-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.01em;
}

/* ── Range picker (segmented control) ── */

.range-picker {
  display: flex;
  gap: 2px;
  background: var(--bg-surface, var(--bg-card));
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px;
}

.range-btn {
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.6;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    color 120ms ease;
}

.range-btn:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--border) 60%, transparent);
}

.range-btn.is-active {
  color: var(--text-primary);
  background: var(--bg-card);
  box-shadow: 0 1px 2px color-mix(in srgb, #000 12%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .range-btn {
    transition: none;
  }
}

/* ── Reset button ── */

.reset-btn {
  padding: 2px 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    color 120ms ease;
  flex-shrink: 0;
}

.reset-btn:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--border) 60%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .reset-btn {
    transition: none;
  }
}

.heatmap-legend {
  display: flex;
  align-items: center;
  gap: 4px;
}

.legend-svg {
  display: block;
}

.legend-label {
  font-size: 11px;
  color: var(--text-muted);
}

.legend-label--right {
  order: 1;
}

.heatmap-body {
  position: relative;
  display: flex;
}

.heatmap-svg {
  overflow: visible;
}

/* ── Cell fill classes (use SVG fill via CSS custom properties) ── */

.cell-l0 {
  fill: var(--color-heatmap-0);
}
.cell-l1 {
  fill: var(--color-heatmap-1);
}
.cell-l2 {
  fill: var(--color-heatmap-2);
}
.cell-l3 {
  fill: var(--color-heatmap-3);
}
.cell-l4 {
  fill: var(--color-heatmap-4);
}
.cell-out {
  fill: transparent;
}

/* Hover: color shift only; no transform (respects prefers-reduced-motion) */
.cell-l0:hover,
.cell-l1:hover,
.cell-l2:hover,
.cell-l3:hover,
.cell-l4:hover {
  filter: brightness(1.3);
  cursor: pointer;
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

/* Day labels */
.day-label-text {
  font-size: 10px;
  fill: var(--text-muted);
  font-family: inherit;
}

/* Empty overlay */
.heatmap-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-muted);
  pointer-events: none;
  background: color-mix(in srgb, var(--bg-card) 80%, transparent);
  border-radius: var(--radius-sm);
}

.heatmap-footer {
  font-size: 11px;
  color: var(--text-muted);
  text-align: right;
}
</style>

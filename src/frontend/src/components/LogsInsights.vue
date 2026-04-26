<script setup lang="ts">
/**
 * LogsInsights — analytical panel for gateway log distribution.
 *
 * Displays:
 *  1. Level 分布 — error / warn / info with count and percentage
 *  2. Top 3 agents by log volume
 *  3. 時段分布 — 24-bar SVG histogram by hour-of-day
 *
 * No animations — prefers-reduced-motion compliant by construction.
 */
import type { LogsInsights } from '@/utils/logsInsights'

const props = defineProps<{ insights: LogsInsights }>()

const HOUR_TICK_LABELS: Record<number, string> = { 0: '0', 6: '6', 12: '12', 18: '18' }
const BAR_WIDTH = 100  // SVG viewBox width per bar slot (arbitrary units for proportions)
const CHART_HEIGHT = 60 // px — inner height for bars
const LABEL_HEIGHT = 16 // px — space below bars for axis labels

const LEVEL_COLORS: Record<string, string> = {
  error: 'var(--color-error, #f38ba8)',
  warn: 'var(--color-warn, #f9e2af)',
  info: 'var(--color-accent, #89b4fa)',
}

function levelColor(level: string): string {
  return LEVEL_COLORS[level] ?? 'var(--color-text-muted, #6c7086)'
}

function barHeights(histogram: number[]): number[] {
  const max = Math.max(...histogram, 1)
  return histogram.map((v) => (v / max) * CHART_HEIGHT)
}
</script>

<template>
  <section class="li-panel" aria-label="日誌分布分析">
    <!-- Level distribution -->
    <div class="li-section">
      <h3 class="li-section-title">Level 分布</h3>
      <p v-if="insights.levels.length === 0" class="li-empty">尚無日誌</p>
      <ul v-else class="li-rank-list" aria-label="日誌 level 分布">
        <li v-for="item in insights.levels" :key="item.label" class="li-rank-item">
          <span class="li-level-badge" :style="{ color: levelColor(item.label) }">
            {{ item.label }}
          </span>
          <span class="li-rank-bar-bg">
            <span
              class="li-rank-bar-fill"
              :style="{ width: `${item.pct}%`, background: levelColor(item.label) }"
              aria-hidden="true"
            />
          </span>
          <span class="li-rank-count">{{ item.count }}</span>
          <span class="li-rank-pct">{{ item.pct }}%</span>
        </li>
      </ul>
    </div>

    <!-- Top agents -->
    <div class="li-section">
      <h3 class="li-section-title">Top 3 Agents</h3>
      <p v-if="insights.topAgents.length === 0" class="li-empty">尚無 agent 資料</p>
      <ul v-else class="li-rank-list" aria-label="日誌量前三 agent">
        <li v-for="item in insights.topAgents" :key="item.label" class="li-rank-item">
          <span class="li-rank-label">{{ item.label }}</span>
          <span class="li-rank-bar-bg">
            <span class="li-rank-bar-fill" :style="{ width: `${item.pct}%` }" aria-hidden="true" />
          </span>
          <span class="li-rank-count">{{ item.count }}</span>
          <span class="li-rank-pct">{{ item.pct }}%</span>
        </li>
      </ul>
    </div>

    <!-- Hour-of-day histogram -->
    <div class="li-section">
      <h3 class="li-section-title">時段分布（小時）</h3>
      <div class="li-histogram-wrap" aria-label="時段分布直方圖，顯示每個小時的日誌數量">
        <svg
          class="li-histogram-svg"
          :viewBox="`0 0 ${24 * BAR_WIDTH} ${CHART_HEIGHT + LABEL_HEIGHT}`"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <g v-for="(height, idx) in barHeights(insights.hourHistogram)" :key="idx">
            <rect
              :x="idx * BAR_WIDTH + 4"
              :y="CHART_HEIGHT - height"
              :width="BAR_WIDTH - 8"
              :height="height"
              class="li-bar"
            />
            <text
              v-if="HOUR_TICK_LABELS[idx] !== undefined"
              :x="idx * BAR_WIDTH + BAR_WIDTH / 2"
              :y="CHART_HEIGHT + LABEL_HEIGHT - 2"
              class="li-axis-label"
              text-anchor="middle"
            >{{ HOUR_TICK_LABELS[idx] }}</text>
          </g>
        </svg>
      </div>
    </div>
  </section>
</template>

<style scoped>
.li-panel {
  padding: 0.75rem 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ── Section ─────────────────────────────────────────────────────────────── */

.li-section {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.li-section-title {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted, #6c7086);
}

.li-empty {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted, #6c7086);
}

/* ── Ranked list ─────────────────────────────────────────────────────────── */

.li-rank-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.li-rank-item {
  display: grid;
  grid-template-columns: 5rem 1fr 2rem 2.5rem;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
}

.li-level-badge {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.li-rank-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text, #cdd6f4);
}

.li-rank-bar-bg {
  height: 6px;
  background: var(--color-border, #313244);
  border-radius: 3px;
  overflow: hidden;
}

.li-rank-bar-fill {
  display: block;
  height: 100%;
  background: var(--color-accent, #89b4fa);
  border-radius: 3px;
  min-width: 2px;
}

.li-rank-count {
  text-align: right;
  color: var(--color-text, #cdd6f4);
}

.li-rank-pct {
  text-align: right;
  color: var(--color-text-muted, #6c7086);
  font-size: 0.7rem;
}

/* ── Histogram ──────────────────────────────────────────────────────────── */

.li-histogram-wrap {
  width: 100%;
}

.li-histogram-svg {
  width: 100%;
  height: 4.75rem;
  display: block;
}

.li-bar {
  fill: var(--color-accent, #89b4fa);
  opacity: 0.8;
}

.li-axis-label {
  fill: var(--color-text-muted, #6c7086);
  font-size: 10px;
}
</style>

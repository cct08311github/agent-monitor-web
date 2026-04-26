<script setup lang="ts">
/**
 * CaptureInsights — analytical panel for Quick Capture behaviour patterns.
 *
 * Displays:
 *  1. Top tags (up to 3) with count and percentage
 *  2. Top contexts (up to 3) with count and percentage
 *  3. 時段分布 — 24-bar SVG histogram by hour-of-day
 *  4. 星期分布 — 7-bar SVG histogram by day-of-week
 *  Footer: 平均每活動日 N 筆
 *
 * No animations — prefers-reduced-motion compliant by construction.
 */
import type { CaptureInsights } from '@/utils/captureInsights'

const props = defineProps<{ insights: CaptureInsights }>()

const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const HOUR_TICK_LABELS: Record<number, string> = { 0: '0', 6: '6', 12: '12', 18: '18' }
const BAR_WIDTH = 100 // SVG viewBox width per bar slot (arbitrary units for proportions)
const CHART_HEIGHT = 60 // px — inner height for bars
const LABEL_HEIGHT = 16 // px — space below bars for axis labels

function barHeights(histogram: number[]): number[] {
  const max = Math.max(...histogram, 1)
  return histogram.map((v) => (v / max) * CHART_HEIGHT)
}
</script>

<template>
  <section class="ci-panel" aria-label="Capture 行為模式分析">
    <!-- Top tags -->
    <div class="ci-section">
      <h3 class="ci-section-title">常用 Tag</h3>
      <p v-if="insights.topTags.length === 0" class="ci-empty">尚無 tag</p>
      <ul v-else class="ci-rank-list" aria-label="常用 tag 排行">
        <li v-for="item in insights.topTags" :key="item.label" class="ci-rank-item">
          <span class="ci-rank-label">#{{ item.label }}</span>
          <span class="ci-rank-bar-bg">
            <span class="ci-rank-bar-fill" :style="{ width: `${item.pct}%` }" aria-hidden="true" />
          </span>
          <span class="ci-rank-count">{{ item.count }}</span>
          <span class="ci-rank-pct">{{ item.pct }}%</span>
        </li>
      </ul>
    </div>

    <!-- Top contexts -->
    <div class="ci-section">
      <h3 class="ci-section-title">常用 Context</h3>
      <p v-if="insights.topContexts.length === 0" class="ci-empty">尚無 context</p>
      <ul v-else class="ci-rank-list" aria-label="常用 context 排行">
        <li v-for="item in insights.topContexts" :key="item.label" class="ci-rank-item">
          <span class="ci-rank-label">{{ item.label || '(未指定)' }}</span>
          <span class="ci-rank-bar-bg">
            <span class="ci-rank-bar-fill" :style="{ width: `${item.pct}%` }" aria-hidden="true" />
          </span>
          <span class="ci-rank-count">{{ item.count }}</span>
          <span class="ci-rank-pct">{{ item.pct }}%</span>
        </li>
      </ul>
    </div>

    <!-- Hour-of-day histogram -->
    <div class="ci-section">
      <h3 class="ci-section-title">時段分布（小時）</h3>
      <div class="ci-histogram-wrap" aria-label="時段分布直方圖，顯示每個小時的 capture 數量">
        <svg
          class="ci-histogram-svg"
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
              class="ci-bar"
            />
            <text
              v-if="HOUR_TICK_LABELS[idx] !== undefined"
              :x="idx * BAR_WIDTH + BAR_WIDTH / 2"
              :y="CHART_HEIGHT + LABEL_HEIGHT - 2"
              class="ci-axis-label"
              text-anchor="middle"
            >{{ HOUR_TICK_LABELS[idx] }}</text>
          </g>
        </svg>
      </div>
    </div>

    <!-- Day-of-week histogram -->
    <div class="ci-section">
      <h3 class="ci-section-title">星期分布</h3>
      <div class="ci-histogram-wrap" aria-label="星期分布直方圖，顯示每個星期幾的 capture 數量">
        <svg
          class="ci-histogram-svg"
          :viewBox="`0 0 ${7 * BAR_WIDTH} ${CHART_HEIGHT + LABEL_HEIGHT}`"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <g v-for="(height, idx) in barHeights(insights.dayHistogram)" :key="idx">
            <rect
              :x="idx * BAR_WIDTH + 8"
              :y="CHART_HEIGHT - height"
              :width="BAR_WIDTH - 16"
              :height="height"
              class="ci-bar"
            />
            <text
              :x="idx * BAR_WIDTH + BAR_WIDTH / 2"
              :y="CHART_HEIGHT + LABEL_HEIGHT - 2"
              class="ci-axis-label"
              text-anchor="middle"
            >{{ DAY_LABELS[idx] }}</text>
          </g>
        </svg>
      </div>
    </div>

    <!-- Footer -->
    <p class="ci-footer">
      平均每活動日
      <strong>{{ insights.avgPerActiveDay % 1 === 0 ? insights.avgPerActiveDay : insights.avgPerActiveDay.toFixed(1) }}</strong>
      筆
    </p>
  </section>
</template>

<style scoped>
.ci-panel {
  padding: 0.75rem 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ── Section ─────────────────────────────────────────────────────────────── */

.ci-section {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.ci-section-title {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted, #6c7086);
}

.ci-empty {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted, #6c7086);
}

/* ── Ranked list ─────────────────────────────────────────────────────────── */

.ci-rank-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.ci-rank-item {
  display: grid;
  grid-template-columns: 7rem 1fr 2rem 2.5rem;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
}

.ci-rank-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text, #cdd6f4);
}

.ci-rank-bar-bg {
  height: 6px;
  background: var(--color-border, #313244);
  border-radius: 3px;
  overflow: hidden;
}

.ci-rank-bar-fill {
  display: block;
  height: 100%;
  background: var(--color-accent, #89b4fa);
  border-radius: 3px;
  min-width: 2px;
}

.ci-rank-count {
  text-align: right;
  color: var(--color-text, #cdd6f4);
}

.ci-rank-pct {
  text-align: right;
  color: var(--color-text-muted, #6c7086);
  font-size: 0.7rem;
}

/* ── Histograms ─────────────────────────────────────────────────────────── */

.ci-histogram-wrap {
  width: 100%;
}

.ci-histogram-svg {
  width: 100%;
  height: 4.75rem;
  display: block;
}

.ci-bar {
  fill: var(--color-accent, #89b4fa);
  opacity: 0.8;
}

.ci-axis-label {
  fill: var(--color-text-muted, #6c7086);
  font-size: 10px;
}

/* ── Footer ──────────────────────────────────────────────────────────────── */

.ci-footer {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted, #6c7086);
  border-top: 1px solid var(--color-border, #313244);
  padding-top: 0.5rem;
}

.ci-footer strong {
  color: var(--color-text, #cdd6f4);
}
</style>

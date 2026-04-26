<script setup lang="ts">
/**
 * SessionsInsights — analytical panel for session bookmark and time patterns.
 *
 * Displays:
 *  1. Bookmark 使用率 — proportion bar + N / total
 *  2. 時段分布 — 24-bar SVG histogram (based on createdAt local hour)
 *  3. 星期分布 — 7-bar SVG histogram (based on createdAt weekday, Sun-Sat)
 *
 * No animations — prefers-reduced-motion compliant by construction.
 */
import type { SessionsInsights } from '@/utils/sessionsInsights'

const props = defineProps<{ insights: SessionsInsights }>()

// ---------------------------------------------------------------------------
// SVG histogram helpers (shared for hour + day histograms)
// ---------------------------------------------------------------------------

const SVG_WIDTH = 240
const SVG_HEIGHT = 44
const BAR_GAP = 2

function histMax(histogram: number[]): number {
  return Math.max(...histogram, 1)
}

function barX(index: number, totalBars: number): number {
  const barW = (SVG_WIDTH - BAR_GAP * (totalBars - 1)) / totalBars
  return index * (barW + BAR_GAP)
}

function barWidth(totalBars: number): number {
  return (SVG_WIDTH - BAR_GAP * (totalBars - 1)) / totalBars
}

function barHeight(value: number, max: number): number {
  const maxBarH = SVG_HEIGHT - 10 // leave 10px for x-axis labels
  return value > 0 ? Math.max(2, (value / max) * maxBarH) : 0
}

function barY(value: number, max: number): number {
  const maxBarH = SVG_HEIGHT - 10
  return maxBarH - barHeight(value, max)
}

// ---------------------------------------------------------------------------
// Day labels (Sun-Sat)
// ---------------------------------------------------------------------------

const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
</script>

<template>
  <section class="si-panel" aria-label="Sessions 分析統計">
    <!-- 1. Bookmark usage ratio -->
    <div class="si-section">
      <h3 class="si-section-title">Bookmark 使用率</h3>
      <p v-if="insights.totalSessions === 0" class="si-empty">尚無 Session 資料</p>
      <div v-else class="si-bookmark-wrap">
        <!-- Proportion bar -->
        <div
          class="si-bookmark-bar"
          role="img"
          :aria-label="`已釘選：${insights.bookmarkedCount} / ${insights.totalSessions} (${insights.bookmarkPct}%)`"
        >
          <span
            v-if="insights.bookmarkedCount > 0"
            class="si-bookmark-segment si-bookmark-with"
            :style="{ width: `${insights.bookmarkPct}%` }"
          />
          <span
            v-if="insights.bookmarkedCount < insights.totalSessions"
            class="si-bookmark-segment si-bookmark-without"
            :style="{ width: `${100 - insights.bookmarkPct}%` }"
          />
        </div>
        <!-- Legend -->
        <div class="si-bookmark-legend">
          <span class="si-bookmark-legend-item">
            <span class="si-bookmark-dot si-bookmark-dot--with" />
            已釘選 {{ insights.bookmarkedCount }}
            <span class="si-bookmark-pct">{{ insights.bookmarkPct }}%</span>
          </span>
          <span class="si-bookmark-legend-item">
            <span class="si-bookmark-dot si-bookmark-dot--without" />
            未釘選 {{ insights.totalSessions - insights.bookmarkedCount }}
            <span class="si-bookmark-pct">{{ 100 - insights.bookmarkPct }}%</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 2. Hour histogram -->
    <div class="si-section">
      <h3 class="si-section-title">時段分布（建立時間）</h3>
      <p
        v-if="insights.hourHistogram.every((v) => v === 0)"
        class="si-empty"
      >
        尚無時段資料
      </p>
      <div v-else class="si-histogram-wrap">
        <svg
          class="si-histogram-svg"
          :viewBox="`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`"
          :width="SVG_WIDTH"
          :height="SVG_HEIGHT"
          aria-label="24 小時時段分布"
          role="img"
        >
          <g>
            <rect
              v-for="(count, h) in insights.hourHistogram"
              :key="h"
              :x="barX(h, 24)"
              :y="barY(count, histMax(insights.hourHistogram))"
              :width="barWidth(24)"
              :height="barHeight(count, histMax(insights.hourHistogram))"
              class="si-histogram-bar"
              :opacity="count > 0 ? 1 : 0.15"
            >
              <title>{{ h }}:00 — {{ count }} 次</title>
            </rect>
          </g>
          <!-- Hour tick labels: 0 / 6 / 12 / 18 / 23 -->
          <text
            v-for="tick in [0, 6, 12, 18, 23]"
            :key="'hl-' + tick"
            :x="barX(tick, 24) + barWidth(24) / 2"
            :y="SVG_HEIGHT"
            font-size="7"
            fill="var(--color-text-muted, #6c7086)"
            text-anchor="middle"
          >{{ tick }}</text>
        </svg>
      </div>
    </div>

    <!-- 3. Day histogram -->
    <div class="si-section">
      <h3 class="si-section-title">星期分布（建立時間）</h3>
      <p
        v-if="insights.dayHistogram.every((v) => v === 0)"
        class="si-empty"
      >
        尚無星期資料
      </p>
      <div v-else class="si-histogram-wrap">
        <svg
          class="si-histogram-svg si-histogram-svg--day"
          :viewBox="`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`"
          :width="SVG_WIDTH"
          :height="SVG_HEIGHT"
          aria-label="星期分布"
          role="img"
        >
          <g>
            <rect
              v-for="(count, d) in insights.dayHistogram"
              :key="d"
              :x="barX(d, 7)"
              :y="barY(count, histMax(insights.dayHistogram))"
              :width="barWidth(7)"
              :height="barHeight(count, histMax(insights.dayHistogram))"
              class="si-histogram-bar si-histogram-bar--day"
              :opacity="count > 0 ? 1 : 0.15"
            >
              <title>{{ DAY_LABELS[d] }} — {{ count }} 次</title>
            </rect>
          </g>
          <!-- Day tick labels -->
          <text
            v-for="(label, d) in DAY_LABELS"
            :key="'dl-' + d"
            :x="barX(d, 7) + barWidth(7) / 2"
            :y="SVG_HEIGHT"
            font-size="7"
            fill="var(--color-text-muted, #6c7086)"
            text-anchor="middle"
          >{{ label }}</text>
        </svg>
      </div>
    </div>
  </section>
</template>

<style scoped>
.si-panel {
  padding: 0.75rem 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ── Section ────────────────────────────────────────────────────────────── */

.si-section {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.si-section-title {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted, #6c7086);
}

.si-empty {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted, #6c7086);
}

/* ── Bookmark ratio bar ─────────────────────────────────────────────────── */

.si-bookmark-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.si-bookmark-bar {
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--color-border, #313244);
}

.si-bookmark-segment {
  display: block;
  height: 100%;
  min-width: 2px;
}

.si-bookmark-with {
  background: var(--color-accent, #89b4fa);
}

.si-bookmark-without {
  background: var(--color-text-muted, #6c7086);
}

.si-bookmark-legend {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: var(--color-text, #cdd6f4);
}

.si-bookmark-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.si-bookmark-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.si-bookmark-dot--with {
  background: var(--color-accent, #89b4fa);
}

.si-bookmark-dot--without {
  background: var(--color-text-muted, #6c7086);
}

.si-bookmark-pct {
  color: var(--color-text-muted, #6c7086);
  font-size: 0.7rem;
}

/* ── Histogram ──────────────────────────────────────────────────────────── */

.si-histogram-wrap {
  overflow-x: auto;
}

.si-histogram-svg {
  display: block;
  width: 100%;
  max-width: 320px;
  height: auto;
}

.si-histogram-svg--day {
  max-width: 200px;
}

.si-histogram-bar {
  fill: var(--color-accent, #89b4fa);
}

.si-histogram-bar--day {
  fill: var(--color-green, #a6e3a1);
}
</style>

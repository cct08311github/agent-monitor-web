<script setup lang="ts">
/**
 * AgentsInsights — analytical panel for agent status and activity patterns.
 *
 * Displays:
 *  1. 狀態分布 — status chip list with color coding
 *  2. Alias 使用率 — proportion bar + N / total
 *  3. 活躍時段分布 — 24-bar SVG histogram (based on lastActiveAt local hour)
 *
 * No animations — prefers-reduced-motion compliant by construction.
 */
import type { AgentsInsights } from '@/utils/agentsInsights'

const props = defineProps<{ insights: AgentsInsights }>()

// ---------------------------------------------------------------------------
// Status color coding
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  active_executing: 'var(--color-green, #a6e3a1)',
  active_recent: 'var(--color-accent, #89b4fa)',
  dormant: 'var(--color-text-muted, #6c7086)',
  offline: 'var(--color-text-muted, #585b70)',
  inactive: 'var(--color-text-muted, #585b70)',
  unknown: 'var(--color-text-muted, #45475a)',
}

function statusColor(label: string): string {
  return STATUS_COLORS[label] ?? 'var(--color-text-muted, #6c7086)'
}

function statusLabel(label: string): string {
  const LABELS: Record<string, string> = {
    active_executing: '執行中',
    active_recent: '近期活躍',
    dormant: '休眠',
    offline: '離線',
    inactive: '未活躍',
    unknown: '未知',
  }
  return LABELS[label] ?? label
}

// ---------------------------------------------------------------------------
// Activity histogram helpers
// ---------------------------------------------------------------------------

const SVG_WIDTH = 240
const SVG_HEIGHT = 44
const BAR_GAP = 2

function histogramMax(histogram: number[]): number {
  return Math.max(...histogram, 1)
}

function barX(hour: number): number {
  const totalBars = 24
  const barW = (SVG_WIDTH - BAR_GAP * (totalBars - 1)) / totalBars
  return hour * (barW + BAR_GAP)
}

function barWidth(): number {
  const totalBars = 24
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
</script>

<template>
  <section class="agi-panel" aria-label="Agent 分析統計">
    <!-- 1. Status distribution -->
    <div class="agi-section">
      <h3 class="agi-section-title">狀態分布</h3>
      <p v-if="insights.statusDistribution.length === 0" class="agi-empty">
        尚無 Agent 資料
      </p>
      <ul v-else class="agi-rank-list" aria-label="Agent 狀態分布">
        <li
          v-for="item in insights.statusDistribution"
          :key="item.label"
          class="agi-rank-item"
        >
          <span
            class="agi-status-chip"
            :style="{ color: statusColor(item.label) }"
          >{{ statusLabel(item.label) }}</span>
          <span class="agi-rank-bar-bg">
            <span
              class="agi-rank-bar-fill"
              :style="{ width: `${item.pct}%`, background: statusColor(item.label) }"
              aria-hidden="true"
            />
          </span>
          <span class="agi-rank-count">{{ item.count }}</span>
          <span class="agi-rank-pct">{{ item.pct }}%</span>
        </li>
      </ul>
    </div>

    <!-- 2. Alias usage -->
    <div class="agi-section">
      <h3 class="agi-section-title">Alias 使用率</h3>
      <p v-if="insights.totalAgents === 0" class="agi-empty">尚無 Agent 資料</p>
      <div v-else class="agi-alias-wrap">
        <!-- Proportion bar -->
        <div
          class="agi-alias-bar"
          role="img"
          :aria-label="`有 alias：${insights.aliasCount} / ${insights.totalAgents} (${insights.aliasPct}%)`"
        >
          <span
            v-if="insights.aliasCount > 0"
            class="agi-alias-segment agi-alias-with"
            :style="{ width: `${insights.aliasPct}%` }"
          />
          <span
            v-if="insights.aliasCount < insights.totalAgents"
            class="agi-alias-segment agi-alias-without"
            :style="{ width: `${100 - insights.aliasPct}%` }"
          />
        </div>
        <!-- Legend -->
        <div class="agi-alias-legend">
          <span class="agi-alias-legend-item">
            <span class="agi-alias-dot agi-alias-dot--with" />
            有 alias {{ insights.aliasCount }}
            <span class="agi-alias-pct">{{ insights.aliasPct }}%</span>
          </span>
          <span class="agi-alias-legend-item">
            <span class="agi-alias-dot agi-alias-dot--without" />
            無 alias {{ insights.totalAgents - insights.aliasCount }}
            <span class="agi-alias-pct">{{ 100 - insights.aliasPct }}%</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 3. Activity hour histogram -->
    <div class="agi-section">
      <h3 class="agi-section-title">活躍時段分布（最後活躍時間）</h3>
      <p
        v-if="insights.activityHourHistogram.every((v) => v === 0)"
        class="agi-empty"
      >
        尚無活躍時間資料
      </p>
      <div v-else class="agi-histogram-wrap">
        <svg
          class="agi-histogram-svg"
          :viewBox="`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`"
          :width="SVG_WIDTH"
          :height="SVG_HEIGHT"
          aria-label="24 小時活躍時段分布"
          role="img"
        >
          <!-- Bars -->
          <g>
            <rect
              v-for="(count, h) in insights.activityHourHistogram"
              :key="h"
              :x="barX(h)"
              :y="barY(count, histogramMax(insights.activityHourHistogram))"
              :width="barWidth()"
              :height="barHeight(count, histogramMax(insights.activityHourHistogram))"
              class="agi-histogram-bar"
              :opacity="count > 0 ? 1 : 0.15"
            >
              <title>{{ h }}:00 — {{ count }} 次</title>
            </rect>
          </g>
          <!-- Hour tick labels: 0 / 6 / 12 / 18 / 23 -->
          <text
            v-for="tick in [0, 6, 12, 18, 23]"
            :key="'label-' + tick"
            :x="barX(tick) + barWidth() / 2"
            :y="SVG_HEIGHT"
            font-size="7"
            fill="var(--color-text-muted, #6c7086)"
            text-anchor="middle"
          >{{ tick }}</text>
        </svg>
      </div>
    </div>
  </section>
</template>

<style scoped>
.agi-panel {
  padding: 0.75rem 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ── Section ──────────────────────────────────────────────────────────────── */

.agi-section {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.agi-section-title {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted, #6c7086);
}

.agi-empty {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted, #6c7086);
}

/* ── Ranked list ──────────────────────────────────────────────────────────── */

.agi-rank-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.agi-rank-item {
  display: grid;
  grid-template-columns: 5.5rem 1fr 2rem 2.5rem;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
}

.agi-status-chip {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agi-rank-bar-bg {
  height: 6px;
  background: var(--color-border, #313244);
  border-radius: 3px;
  overflow: hidden;
}

.agi-rank-bar-fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  min-width: 2px;
}

.agi-rank-count {
  text-align: right;
  color: var(--color-text, #cdd6f4);
}

.agi-rank-pct {
  text-align: right;
  color: var(--color-text-muted, #6c7086);
  font-size: 0.7rem;
}

/* ── Alias ratio bar ──────────────────────────────────────────────────────── */

.agi-alias-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.agi-alias-bar {
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--color-border, #313244);
}

.agi-alias-segment {
  display: block;
  height: 100%;
  min-width: 2px;
}

.agi-alias-with {
  background: var(--color-accent, #89b4fa);
}

.agi-alias-without {
  background: var(--color-text-muted, #6c7086);
}

.agi-alias-legend {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: var(--color-text, #cdd6f4);
}

.agi-alias-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.agi-alias-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.agi-alias-dot--with {
  background: var(--color-accent, #89b4fa);
}

.agi-alias-dot--without {
  background: var(--color-text-muted, #6c7086);
}

.agi-alias-pct {
  color: var(--color-text-muted, #6c7086);
  font-size: 0.7rem;
}

/* ── Activity hour histogram ──────────────────────────────────────────────── */

.agi-histogram-wrap {
  overflow-x: auto;
}

.agi-histogram-svg {
  display: block;
  width: 100%;
  max-width: 320px;
  height: auto;
}

.agi-histogram-bar {
  fill: var(--color-accent, #89b4fa);
}
</style>

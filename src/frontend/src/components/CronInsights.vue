<script setup lang="ts">
/**
 * CronInsights — analytical panel for cron job patterns.
 *
 * Displays:
 *  1. Schedule 模式分布 — minute / hourly / daily / weekly / monthly / custom
 *  2. Enabled vs Disabled 比例
 *  3. Top 3 tags
 *
 * No animations — prefers-reduced-motion compliant by construction.
 */
import type { CronInsights } from '@/utils/cronInsights'

const props = defineProps<{ insights: CronInsights }>()

const CATEGORY_LABELS: Record<string, string> = {
  minute: 'Minute',
  hourly: 'Hourly',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  custom: 'Custom',
}

const CATEGORY_COLORS: Record<string, string> = {
  minute: 'var(--color-error, #f38ba8)',
  hourly: 'var(--color-warn, #f9e2af)',
  daily: 'var(--color-accent, #89b4fa)',
  weekly: 'var(--color-green, #a6e3a1)',
  monthly: 'var(--color-mauve, #cba6f7)',
  custom: 'var(--color-text-muted, #6c7086)',
}

function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? 'var(--color-text-muted, #6c7086)'
}

function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat
}
</script>

<template>
  <section class="cri-panel" aria-label="Cron 排程分析">
    <!-- Schedule category distribution -->
    <div class="cri-section">
      <h3 class="cri-section-title">Schedule 模式分布</h3>
      <p v-if="insights.scheduleCategories.length === 0" class="cri-empty">尚無 Cron 任務</p>
      <ul v-else class="cri-rank-list" aria-label="Schedule 模式分布">
        <li
          v-for="item in insights.scheduleCategories"
          :key="item.category"
          class="cri-rank-item"
        >
          <span
            class="cri-category-chip"
            :style="{ color: categoryColor(item.category) }"
          >{{ categoryLabel(item.category) }}</span>
          <span class="cri-rank-bar-bg">
            <span
              class="cri-rank-bar-fill"
              :style="{ width: `${item.pct}%`, background: categoryColor(item.category) }"
              aria-hidden="true"
            />
          </span>
          <span class="cri-rank-count">{{ item.count }}</span>
          <span class="cri-rank-pct">{{ item.pct }}%</span>
        </li>
      </ul>
    </div>

    <!-- Enabled vs Disabled ratio -->
    <div class="cri-section">
      <h3 class="cri-section-title">啟用 / 停用比例</h3>
      <p v-if="insights.enabledCount === 0 && insights.disabledCount === 0" class="cri-empty">
        尚無 Cron 任務
      </p>
      <div v-else class="cri-ratio-wrap">
        <!-- Combined bar -->
        <div class="cri-ratio-bar" role="img" :aria-label="`啟用 ${insights.enabledPct}%，停用 ${100 - insights.enabledPct}%`">
          <span
            v-if="insights.enabledCount > 0"
            class="cri-ratio-segment cri-ratio-enabled"
            :style="{ width: `${insights.enabledPct}%` }"
          />
          <span
            v-if="insights.disabledCount > 0"
            class="cri-ratio-segment cri-ratio-disabled"
            :style="{ width: `${100 - insights.enabledPct}%` }"
          />
        </div>
        <!-- Legend row -->
        <div class="cri-ratio-legend">
          <span class="cri-ratio-legend-item">
            <span class="cri-ratio-dot cri-ratio-dot--enabled" />
            啟用 {{ insights.enabledCount }}
            <span class="cri-ratio-pct">{{ insights.enabledPct }}%</span>
          </span>
          <span class="cri-ratio-legend-item">
            <span class="cri-ratio-dot cri-ratio-dot--disabled" />
            停用 {{ insights.disabledCount }}
            <span class="cri-ratio-pct">{{ 100 - insights.enabledPct }}%</span>
          </span>
        </div>
      </div>
    </div>

    <!-- Top 3 tags -->
    <div class="cri-section">
      <h3 class="cri-section-title">Top 3 Tags</h3>
      <p v-if="insights.topTags.length === 0" class="cri-empty">尚無 tag</p>
      <ul v-else class="cri-rank-list" aria-label="常用 tag 排行">
        <li v-for="item in insights.topTags" :key="item.label" class="cri-rank-item">
          <span class="cri-rank-label">#{{ item.label }}</span>
          <span class="cri-rank-bar-bg">
            <span class="cri-rank-bar-fill" :style="{ width: `${item.pct}%` }" aria-hidden="true" />
          </span>
          <span class="cri-rank-count">{{ item.count }}</span>
          <span class="cri-rank-pct">{{ item.pct }}%</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.cri-panel {
  padding: 0.75rem 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ── Section ─────────────────────────────────────────────────────────────── */

.cri-section {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.cri-section-title {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted, #6c7086);
}

.cri-empty {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted, #6c7086);
}

/* ── Ranked list ─────────────────────────────────────────────────────────── */

.cri-rank-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.cri-rank-item {
  display: grid;
  grid-template-columns: 5.5rem 1fr 2rem 2.5rem;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
}

.cri-category-chip {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cri-rank-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text, #cdd6f4);
}

.cri-rank-bar-bg {
  height: 6px;
  background: var(--color-border, #313244);
  border-radius: 3px;
  overflow: hidden;
}

.cri-rank-bar-fill {
  display: block;
  height: 100%;
  background: var(--color-accent, #89b4fa);
  border-radius: 3px;
  min-width: 2px;
}

.cri-rank-count {
  text-align: right;
  color: var(--color-text, #cdd6f4);
}

.cri-rank-pct {
  text-align: right;
  color: var(--color-text-muted, #6c7086);
  font-size: 0.7rem;
}

/* ── Enabled / Disabled ratio ────────────────────────────────────────────── */

.cri-ratio-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.cri-ratio-bar {
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--color-border, #313244);
}

.cri-ratio-segment {
  display: block;
  height: 100%;
  min-width: 2px;
}

.cri-ratio-enabled {
  background: var(--color-green, #a6e3a1);
}

.cri-ratio-disabled {
  background: var(--color-text-muted, #6c7086);
}

.cri-ratio-legend {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: var(--color-text, #cdd6f4);
}

.cri-ratio-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.cri-ratio-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.cri-ratio-dot--enabled {
  background: var(--color-green, #a6e3a1);
}

.cri-ratio-dot--disabled {
  background: var(--color-text-muted, #6c7086);
}

.cri-ratio-pct {
  color: var(--color-text-muted, #6c7086);
  font-size: 0.7rem;
}
</style>

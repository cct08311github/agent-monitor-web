<script setup lang="ts">
import { computed } from 'vue'
import type { UpcomingFire } from '@/utils/cronUpcoming'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const props = defineProps<{
  fires: UpcomingFire[]
}>()

// ---------------------------------------------------------------------------
// Time formatting helpers
// ---------------------------------------------------------------------------

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(date: Date): string {
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (isToday) return '今天'
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// Hour-group structure
// ---------------------------------------------------------------------------

interface HourGroup {
  label: string
  fires: UpcomingFire[]
}

const hourGroups = computed<HourGroup[]>(() => {
  const map = new Map<string, UpcomingFire[]>()
  for (const f of props.fires) {
    const key = `${formatDate(f.date)} ${f.date.getHours().toString().padStart(2, '0')}:xx`
    const bucket = map.get(key)
    if (bucket) {
      bucket.push(f)
    } else {
      map.set(key, [f])
    }
  }
  return Array.from(map.entries()).map(([label, fires]) => ({ label, fires }))
})
</script>

<template>
  <div class="cron-upcoming-timeline" aria-label="未來 24h cron 觸發時間軸">
    <!-- Empty state -->
    <div v-if="fires.length === 0" class="upcoming-empty">
      未來 24h 無 cron 觸發
    </div>

    <!-- Hour groups -->
    <div v-else class="upcoming-groups">
      <div
        v-for="group in hourGroups"
        :key="group.label"
        class="upcoming-hour-group"
      >
        <div class="upcoming-hour-label">{{ group.label }}</div>
        <ul class="upcoming-fire-list" role="list">
          <li
            v-for="fire in group.fires"
            :key="`${fire.jobId}-${fire.ts}`"
            class="upcoming-fire-row"
          >
            <span class="upcoming-fire-time">{{ formatTime(fire.date) }}</span>
            <span class="upcoming-fire-dot" aria-hidden="true" />
            <span class="upcoming-fire-name">{{ fire.jobName }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cron-upcoming-timeline {
  padding: 4px 0;
}

.upcoming-empty {
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
  text-align: center;
  padding: 8px 0;
}

.upcoming-groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.upcoming-hour-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.upcoming-hour-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted, #94a3b8);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding-bottom: 2px;
  border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.08));
}

.upcoming-fire-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.upcoming-fire-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  border-radius: 4px;
  transition: background 0.12s;
}

.upcoming-fire-row:hover {
  background: var(--surface2, rgba(255, 255, 255, 0.04));
}

.upcoming-fire-time {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--accent, #6366f1);
  min-width: 42px;
}

.upcoming-fire-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent, #6366f1);
  opacity: 0.65;
  flex-shrink: 0;
}

.upcoming-fire-name {
  font-size: 12px;
  color: var(--text, #e2e8f0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Respect reduced-motion */
@media (prefers-reduced-motion: reduce) {
  .upcoming-fire-row {
    transition: none;
  }
}
</style>

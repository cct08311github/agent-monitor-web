<script setup lang="ts">
import type { AgentStats } from '@/utils/agentStats'

const props = defineProps<{
  stats: AgentStats
}>()
</script>

<template>
  <div class="agent-stats-card">
    <div class="stats-tile" :class="{ 'stats-tile--zero': props.stats.bookmarks === 0 }">
      <span class="stats-icon" aria-hidden="true">🔖</span>
      <span class="stats-number">{{ props.stats.bookmarks }}</span>
      <span class="stats-label">Bookmarks</span>
    </div>
    <div class="stats-tile" :class="{ 'stats-tile--zero': props.stats.captures === 0 }">
      <span class="stats-icon" aria-hidden="true">💡</span>
      <span class="stats-number">{{ props.stats.captures }}</span>
      <span class="stats-label">Captures</span>
    </div>
    <div class="stats-tile" :class="{ 'stats-tile--zero': props.stats.pinnedCaptures === 0 }">
      <span class="stats-icon" aria-hidden="true">⭐</span>
      <span class="stats-number">{{ props.stats.pinnedCaptures }}</span>
      <span class="stats-label">Pinned</span>
    </div>
    <div class="stats-tile" :class="{ 'stats-tile--zero': props.stats.notesChars === 0 }">
      <span class="stats-icon" aria-hidden="true">📝</span>
      <span class="stats-number">{{ props.stats.notesChars }}</span>
      <span class="stats-label">Notes (chars)</span>
    </div>
  </div>
</template>

<style scoped>
.agent-stats-card {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.stats-tile {
  flex: 1 1 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 6px;
  border-radius: 6px;
  background: var(--bg-secondary, rgba(0, 0, 0, 0.12));
  border: 1px solid var(--border, rgba(255, 255, 255, 0.06));
  min-width: 60px;
  transition: opacity 0.15s ease;
}

.stats-tile--zero {
  opacity: 0.5;
}

.stats-icon {
  font-size: 14px;
  line-height: 1;
}

.stats-number {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--text, #cdd6f4);
  font-variant-numeric: tabular-nums;
}

.stats-label {
  font-size: 10px;
  color: var(--text-muted, #6c7086);
  text-align: center;
  line-height: 1.2;
  white-space: nowrap;
}
</style>

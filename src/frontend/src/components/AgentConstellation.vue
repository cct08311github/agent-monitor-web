<script setup lang="ts">
import { computed } from 'vue'
import { getAgentEmoji } from '@/utils/format'
import {
  groupSubagents,
  computeLayout,
  type ConstellationGroup,
  type SubAgentLayout,
} from '@/utils/constellation'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AgentProp {
  id: string
  model?: string
  status?: string
}

interface SubagentProp {
  ownerAgent?: string
  subagentId?: string
  label?: string
  status?: string
  tokens?: number
}

const props = defineProps<{
  agents: AgentProp[]
  subagents: SubagentProp[]
}>()

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

const emit = defineEmits<{
  (e: 'drill-down', subagent: SubAgentLayout): void
}>()

// ---------------------------------------------------------------------------
// Computed: build groups + layout
// ---------------------------------------------------------------------------

const groups = computed<ConstellationGroup[]>(() => {
  const grouped = groupSubagents(props.subagents)

  // Only produce groups where we have actual subagents
  const result: ConstellationGroup[] = []
  for (const [ownerAgent, sas] of grouped.entries()) {
    result.push({
      ownerAgent,
      centerEmoji: getAgentEmoji(ownerAgent),
      subagents: sas,
    })
  }
  return result
})

const layout = computed(() => computeLayout(groups.value))

const hasData = computed(() => groups.value.length > 0)

// ---------------------------------------------------------------------------
// Event handler
// ---------------------------------------------------------------------------

function onSubagentClick(subagent: SubAgentLayout) {
  emit('drill-down', subagent)
}
</script>

<template>
  <div class="agent-constellation">
    <!-- Empty state -->
    <div v-if="!hasData" class="constellation-empty">
      <div class="constellation-empty-icon">🌌</div>
      <div class="constellation-empty-text">無 sub-agent 數據</div>
    </div>

    <!-- SVG constellation graph -->
    <svg
      v-else
      class="constellation-svg"
      :viewBox="`0 0 ${layout.viewBox.width} ${layout.viewBox.height}`"
      :width="layout.viewBox.width"
      :height="layout.viewBox.height"
      role="img"
      aria-label="Agent Constellation graph"
    >
      <!-- Render each cluster -->
      <g
        v-for="group in layout.groups"
        :key="group.ownerAgent"
        class="constellation-cluster"
      >
        <!-- Lines from center to each subagent -->
        <line
          v-for="sa in group.subagents"
          :key="`line-${sa.id}`"
          :x1="group.centerX"
          :y1="group.centerY"
          :x2="sa.x"
          :y2="sa.y"
          class="constellation-line"
          stroke="#4a5568"
          stroke-width="1.5"
          stroke-dasharray="4 2"
          opacity="0.6"
        />

        <!-- Center node: large circle -->
        <circle
          :cx="group.centerX"
          :cy="group.centerY"
          r="28"
          class="constellation-center-circle"
          fill="#1e293b"
          stroke="#6366f1"
          stroke-width="2"
        />

        <!-- Center emoji -->
        <text
          :x="group.centerX"
          :y="group.centerY - 2"
          class="constellation-center-emoji"
          text-anchor="middle"
          dominant-baseline="central"
          font-size="18"
        >{{ group.centerEmoji }}</text>

        <!-- Agent id label below center -->
        <text
          :x="group.centerX"
          :y="group.centerY + 40"
          class="constellation-center-label"
          text-anchor="middle"
          font-size="11"
          fill="#94a3b8"
        >{{ group.ownerAgent }}</text>

        <!-- Subagent nodes -->
        <g
          v-for="sa in group.subagents"
          :key="`sa-${sa.id}`"
          class="constellation-subagent"
          style="cursor: pointer"
          @click="onSubagentClick(sa)"
        >
          <title>{{ sa.label }} ({{ sa.tokens }} tokens)</title>
          <circle
            :cx="sa.x"
            :cy="sa.y"
            :r="sa.r"
            :fill="sa.color"
            stroke="#0f172a"
            stroke-width="1.5"
            opacity="0.9"
          />
          <!-- Small subagent label -->
          <text
            :x="sa.x"
            :y="sa.y + sa.r + 12"
            text-anchor="middle"
            font-size="9"
            fill="#64748b"
          >{{ sa.label.length > 10 ? sa.label.slice(0, 10) + '…' : sa.label }}</text>
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.agent-constellation {
  padding: 16px;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.constellation-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 200px;
  gap: 12px;
  color: var(--text-secondary, #64748b);
}

.constellation-empty-icon {
  font-size: 40px;
}

.constellation-empty-text {
  font-size: 14px;
}

.constellation-svg {
  overflow: visible;
  max-width: 100%;
}

.constellation-subagent:hover circle {
  opacity: 1;
  filter: brightness(1.2);
}
</style>

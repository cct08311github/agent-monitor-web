<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { api } from '@/composables/useApi'
import { formatTokens, formatTWD } from '@/utils/format'
import { formatRelativeTime } from '@/lib/time'
import { appState } from '@/stores/appState'
import { showToast } from '@/composables/useToast'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HistoryPoint {
  cpu: number
  memory: number
  timestamp?: string
}

interface CostHistoryPoint {
  total_cost?: number
  ts?: string
}

interface TopSpender {
  agent_id?: string
  id?: string
  total?: number
}

interface ModelUsageItem {
  model: string
  sessions?: number
  tokens?: number
  cost?: number
}

interface AgentActivitySummary {
  agent_id: string
  active_minutes: number
  last_seen: string  // ISO timestamp
}

// ---------------------------------------------------------------------------
// Canvas refs
// ---------------------------------------------------------------------------

const sysChartRef = ref<HTMLCanvasElement | null>(null)
const costChartRef = ref<HTMLCanvasElement | null>(null)
const tokenChartRef = ref<HTMLCanvasElement | null>(null)

// ---------------------------------------------------------------------------
// Data state
// ---------------------------------------------------------------------------

const sysHistoryData = ref<HistoryPoint[]>([])
const costHistoryData = ref<CostHistoryPoint[]>([])
const tokenSpendersData = ref<TopSpender[]>([])
const modelUsageData = ref<ModelUsageItem[]>([])
const agentActivityData = ref<AgentActivitySummary[]>([])
const historyError = ref(false)

// ---------------------------------------------------------------------------
// Computed: system resource metrics from appState
// ---------------------------------------------------------------------------

const sysMetrics = computed(() => {
  const sys = appState.latestDashboard?.sys
  return [
    {
      label: 'CPU',
      value: Math.round(sys?.cpu ?? 0),
      colorClass: 'blue',
    },
    {
      label: 'MEM',
      value: Math.round(sys?.memory ?? 0),
      colorClass: 'green',
    },
    {
      label: 'Disk',
      value: Math.round(sys?.disk ?? 0),
      colorClass: 'orange',
    },
  ]
})

const totalCostUSD = computed(() => {
  return (appState.latestDashboard?.agents ?? []).reduce((sum, a) => {
    return sum + parseFloat(String((a as Record<string, unknown>).costUSD ?? 0))
  }, 0)
})

// Top 10 agents sorted by active_minutes descending
const topAgentActivity = computed<AgentActivitySummary[]>(() => {
  return [...agentActivityData.value]
    .sort((a, b) => b.active_minutes - a.active_minutes)
    .slice(0, 10)
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatActiveMinutes(min: number): string {
  if (min < 60) return `${min} 分鐘`
  const hours = Math.floor(min / 60)
  const remaining = min % 60
  return `${hours} 小時 ${remaining} 分`
}

// ---------------------------------------------------------------------------
// Canvas drawing helpers — plain TS functions, not in template
// ---------------------------------------------------------------------------

function isDarkTheme(): boolean {
  const theme = document.documentElement.getAttribute('data-theme')
  return (
    theme === 'dark' ||
    (theme === null && window.matchMedia('(prefers-color-scheme: dark)').matches)
  )
}

function drawSparkline(
  canvas: HTMLCanvasElement,
  data: number[][],
  labels: string[],
): void {
  if (!canvas || !data || data.length === 0) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  ctx.scale(dpr, dpr)
  const w = rect.width
  const h = rect.height
  const pad = { top: 22, right: 10, bottom: 24, left: 35 }
  const cw = w - pad.left - pad.right
  const ch = h - pad.top - pad.bottom
  ctx.clearRect(0, 0, w, h)

  const isDark = isDarkTheme()
  ctx.fillStyle = isDark ? '#1e293b' : '#f8fafc'
  ctx.fillRect(0, 0, w, h)

  const colors = [
    { stroke: '#3b82f6', fill: 'rgba(59,130,246,0.1)', label: 'CPU' },
    { stroke: '#22c55e', fill: 'rgba(34,197,94,0.1)', label: 'MEM' },
  ]

  ctx.fillStyle = isDark ? '#64748b' : '#94a3b8'
  ctx.font = '10px Inter, sans-serif'
  ctx.textAlign = 'right'
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (ch / 4) * i
    ctx.fillText(100 - i * 25 + '%', pad.left - 4, y + 3)
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
    ctx.beginPath()
    ctx.moveTo(pad.left, y)
    ctx.lineTo(pad.left + cw, y)
    ctx.stroke()
  }

  ctx.textAlign = 'center'
  const firstSeries = data[0] ?? []
  const step = Math.max(1, Math.floor(firstSeries.length / 6) || 1)
  for (let i = 0; i < firstSeries.length; i += step) {
    const x = pad.left + (i / ((firstSeries.length - 1) || 1)) * cw
    ctx.fillStyle = isDark ? '#64748b' : '#94a3b8'
    ctx.fillText(labels[i] ?? '', x, h - 4)
  }

  ctx.textAlign = 'left'
  colors.forEach((c, idx) => {
    const lx = pad.left + idx * 60
    ctx.fillStyle = c.stroke
    ctx.fillRect(lx, 4, 10, 10)
    ctx.fillStyle = isDark ? '#94a3b8' : '#64748b'
    ctx.fillText(c.label, lx + 14, 12)
  })

  data.forEach((series, si) => {
    if (!series || series.length === 0) return
    const color = colors[si] ?? colors[0]
    ctx.beginPath()
    ctx.moveTo(pad.left, pad.top + ch)
    series.forEach((val, i) => {
      const x = pad.left + (i / ((series.length - 1) || 1)) * cw
      const y = pad.top + ch - (Math.min(100, val) / 100) * ch
      ctx.lineTo(x, y)
    })
    ctx.lineTo(pad.left + cw, pad.top + ch)
    ctx.closePath()
    ctx.fillStyle = color.fill
    ctx.fill()

    ctx.beginPath()
    series.forEach((val, i) => {
      const x = pad.left + (i / ((series.length - 1) || 1)) * cw
      const y = pad.top + ch - (Math.min(100, val) / 100) * ch
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = color.stroke
    ctx.lineWidth = 1.5
    ctx.stroke()
  })
}

function drawBarChart(
  canvas: HTMLCanvasElement,
  labels: string[],
  values: number[],
  color?: string,
): void {
  if (!canvas || !labels || labels.length === 0) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  ctx.scale(dpr, dpr)
  const w = rect.width
  const h = rect.height

  const isDark = isDarkTheme()
  ctx.fillStyle = isDark ? '#1e293b' : '#f8fafc'
  ctx.fillRect(0, 0, w, h)

  const pad = { top: 8, right: 8, bottom: 24, left: 8 }
  const cw = w - pad.left - pad.right
  const ch = h - pad.top - pad.bottom
  const n = labels.length
  if (n === 0) return
  const barW = Math.max(2, (cw / n) * 0.65)
  const gap = cw / n
  const maxVal = Math.max(...values, 0.000001)
  const barColor = color ?? (isDark ? '#3b82f6' : '#2563eb')
  const textColor = isDark ? '#94a3b8' : '#64748b'

  ctx.font = '9px Inter, sans-serif'
  ctx.textAlign = 'center'

  values.forEach((val, i) => {
    const bh = (val / maxVal) * ch
    const x = pad.left + gap * i + gap / 2 - barW / 2
    const y = pad.top + ch - bh
    ctx.fillStyle = barColor
    ctx.fillRect(x, y, barW, bh)
    ctx.fillStyle = textColor
    const label = labels[i] ?? ''
    ctx.fillText(label.length > 6 ? label.slice(0, 6) : label, pad.left + gap * i + gap / 2, h - 4)
  })
}

function drawHBarChart(
  canvas: HTMLCanvasElement,
  labels: string[],
  values: number[],
  color?: string,
): void {
  if (!canvas || !labels || labels.length === 0) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  ctx.scale(dpr, dpr)
  const w = rect.width
  const h = rect.height

  const isDark = isDarkTheme()
  ctx.fillStyle = isDark ? '#1e293b' : '#f8fafc'
  ctx.fillRect(0, 0, w, h)

  const labelW = Math.min(80, Math.floor(w * 0.35))
  const pad = { top: 6, right: 8, bottom: 6, left: labelW + 4 }
  const cw = w - pad.left - pad.right
  const n = labels.length
  if (n === 0) return
  const rowH = (h - pad.top - pad.bottom) / n
  const barH = Math.max(4, rowH * 0.55)
  const maxVal = Math.max(...values, 1)
  const barColor = color ?? (isDark ? '#22c55e' : '#16a34a')
  const textColor = isDark ? '#94a3b8' : '#64748b'
  const valColor = isDark ? '#cbd5e1' : '#475569'

  ctx.font = '10px Inter, sans-serif'
  values.forEach((val, i) => {
    const y = pad.top + rowH * i + rowH / 2
    ctx.fillStyle = textColor
    ctx.textAlign = 'right'
    const label = labels[i] ?? ''
    ctx.fillText(label.length > 10 ? label.slice(0, 10) : label, labelW, y + 4)

    const bw = (val / maxVal) * cw
    ctx.fillStyle = barColor
    ctx.fillRect(pad.left, y - barH / 2, bw, barH)

    ctx.fillStyle = valColor
    ctx.textAlign = 'left'
    const display =
      val >= 1_000_000
        ? `${(val / 1_000_000).toFixed(1)}M`
        : val >= 1_000
          ? `${(val / 1_000).toFixed(0)}K`
          : String(val)
    ctx.fillText(display, pad.left + bw + 4, y + 4)
  })
}

// ---------------------------------------------------------------------------
// Redraw all charts
// ---------------------------------------------------------------------------

function redrawCharts(): void {
  if (sysHistoryData.value.length >= 2 && sysChartRef.value) {
    drawSparkline(
      sysChartRef.value,
      [sysHistoryData.value.map((d) => d.cpu), sysHistoryData.value.map((d) => d.memory)],
      sysHistoryData.value.map((d) => {
        if (!d.timestamp) return ''
        const t = new Date(d.timestamp + 'Z')
        return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
      }),
    )
  }

  if (costHistoryData.value.length > 1 && costChartRef.value) {
    drawBarChart(
      costChartRef.value,
      costHistoryData.value.map((r) => (r.ts ?? '').slice(11, 16)),
      costHistoryData.value.map((r) => r.total_cost ?? 0),
    )
  }

  if (tokenSpendersData.value.length > 0 && tokenChartRef.value) {
    drawHBarChart(
      tokenChartRef.value,
      tokenSpendersData.value.map((s) => s.agent_id ?? s.id ?? ''),
      tokenSpendersData.value.map((s) => s.total ?? 0),
    )
  }
}

// ---------------------------------------------------------------------------
// Fetch history data
// ---------------------------------------------------------------------------

async function fetchHistory(): Promise<void> {
  try {
    historyError.value = false
    const data = (await api.get('/api/read/history')) as {
      success: boolean
      history?: HistoryPoint[]
      costHistory?: CostHistoryPoint[]
      topSpenders?: TopSpender[]
      modelUsage?: ModelUsageItem[]
      agentActivity?: AgentActivitySummary[]
    }
    if (data.success && data.history) {
      sysHistoryData.value = data.history
    }
    if (data.costHistory) {
      costHistoryData.value = data.costHistory
    }
    if (data.topSpenders && data.topSpenders.length > 0) {
      tokenSpendersData.value = data.topSpenders
    }
    if (data.modelUsage) {
      modelUsageData.value = data.modelUsage
    }
    agentActivityData.value = data.agentActivity ?? []
    // Draw after data arrives
    redrawCharts()
  } catch {
    historyError.value = true
    showToast('歷史資料載入失敗', 'error')
  }
}

// ---------------------------------------------------------------------------
// Theme / resize handling
// ---------------------------------------------------------------------------

let resizeObserver: ResizeObserver | null = null
let _resizeTimer: ReturnType<typeof setTimeout> | null = null

function setupResizeObserver(): void {
  if (!window.ResizeObserver) return
  resizeObserver = new ResizeObserver(() => {
    if (_resizeTimer) clearTimeout(_resizeTimer)
    _resizeTimer = setTimeout(() => redrawCharts(), 16)
  })
  if (sysChartRef.value) resizeObserver.observe(sysChartRef.value)
  if (costChartRef.value) resizeObserver.observe(costChartRef.value)
  if (tokenChartRef.value) resizeObserver.observe(tokenChartRef.value)
}

// MutationObserver to watch theme attribute changes on <html>
let themeObserver: MutationObserver | null = null

function setupThemeObserver(): void {
  themeObserver = new MutationObserver(() => redrawCharts())
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  fetchHistory()
  setupResizeObserver()
  setupThemeObserver()
})

onUnmounted(() => {
  if (_resizeTimer) { clearTimeout(_resizeTimer); _resizeTimer = null }
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
})

// Re-draw when canvas refs are mounted (initial paint)
watch(sysChartRef, (el) => {
  if (el && sysHistoryData.value.length >= 2) redrawCharts()
})
watch(costChartRef, (el) => {
  if (el && costHistoryData.value.length > 1) redrawCharts()
})
watch(tokenChartRef, (el) => {
  if (el && tokenSpendersData.value.length > 0) redrawCharts()
})
</script>

<template>
  <div class="system-tab">
    <div class="system-layout">
      <!-- Left column: system resources + sparkline -->
      <div class="system-left">
        <div class="section-header">
          <h2>📊 系統資源</h2>
        </div>

        <div class="sys-cards">
          <div v-for="metric in sysMetrics" :key="metric.label" class="sys-card">
            <div class="sys-card-header">
              <span>{{ metric.label }}</span>
              <span class="sys-val">{{ metric.value }}%</span>
            </div>
            <div class="progress-bar">
              <div
                class="progress-fill"
                :class="metric.colorClass"
                :style="{ width: metric.value + '%' }"
              />
            </div>
          </div>
        </div>

        <div class="section-header" style="margin-top: 16px">
          <h2>📈 趨勢</h2>
        </div>
        <canvas ref="sysChartRef" style="width: 100%; height: 180px" />
        <div v-if="historyError && sysHistoryData.length === 0" class="chart-error-state">
          ⚠️ 資料載入失敗
          <button class="ctrl-btn" style="margin-left:8px;font-size:12px" @click="fetchHistory">重試</button>
        </div>
      </div>

      <!-- Right column: cost + token + model usage -->
      <div class="system-right">
        <div class="section-header">
          <h2>💰 費用分析</h2>
        </div>
        <canvas ref="costChartRef" style="width: 100%; height: 160px" />
        <!-- H5: show retry for cost chart data failure -->
        <div v-if="historyError && costHistoryData.length === 0" class="chart-error-state">
          ⚠️ 費用資料載入失敗
          <button class="ctrl-btn" style="margin-left:8px;font-size:12px" @click="fetchHistory">重試</button>
        </div>

        <div class="section-header" style="margin-top: 16px">
          <h2>🏆 Token 消耗排行</h2>
        </div>
        <canvas ref="tokenChartRef" style="width: 100%; height: 200px" />
        <!-- H5: show retry for token spenders data failure -->
        <div v-if="historyError && tokenSpendersData.length === 0" class="chart-error-state">
          ⚠️ Token 排行資料載入失敗
          <button class="ctrl-btn" style="margin-left:8px;font-size:12px" @click="fetchHistory">重試</button>
        </div>

        <div class="section-header" style="margin-top: 16px">
          <h2>🤖 模型使用明細</h2>
        </div>

        <div class="model-usage-list">
          <div
            v-for="(item, idx) in modelUsageData"
            :key="idx"
            class="model-usage-item"
          >
            <div class="model-usage-name">{{ item.model }}</div>
            <div class="model-usage-sessions">{{ item.sessions ?? 0 }} 次</div>
            <div class="model-usage-bar">
              <!-- decorative fill based on token share -->
            </div>
            <div class="model-usage-stats">
              <span class="model-usage-tokens">{{ formatTokens(item.tokens ?? 0) }}</span>
              <span class="model-usage-cost">
                {{ formatTWD(item.cost ?? 0, appState.currentExchangeRate) }}
              </span>
            </div>
          </div>
        </div>

        <div class="cost-summary">
          <span class="cost-summary-label">總費用</span>
          <span class="cost-summary-value">
            {{ formatTWD(totalCostUSD, appState.currentExchangeRate) }}
          </span>
        </div>

        <!-- Agent Activity Summary Card -->
        <div class="section-header" style="margin-top: 16px">
          <h2>⏱ Agent 活躍度 (Top 10)</h2>
        </div>

        <div class="activity-table-wrap">
          <table v-if="topAgentActivity.length > 0" class="activity-table">
            <thead>
              <tr>
                <th class="activity-th activity-th--agent">Agent</th>
                <th class="activity-th activity-th--duration">活躍時長</th>
                <th class="activity-th activity-th--last-seen">最後活動</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in topAgentActivity"
                :key="item.agent_id"
                class="activity-row"
              >
                <td class="activity-td activity-td--agent">{{ item.agent_id }}</td>
                <td class="activity-td activity-td--duration">{{ formatActiveMinutes(item.active_minutes) }}</td>
                <td class="activity-td activity-td--last-seen">
                  {{ formatRelativeTime(Date.parse(item.last_seen)) }}
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="activity-empty">目前無活躍記錄</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.activity-table-wrap {
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border-color, #e2e8f0);
  margin-top: 4px;
}

.activity-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.activity-th {
  padding: 8px 10px;
  text-align: left;
  font-weight: 600;
  background: var(--surface-raised, #f1f5f9);
  color: var(--text-muted, #64748b);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.activity-th--duration,
.activity-th--last-seen {
  text-align: right;
}

.activity-row:not(:last-child) {
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.activity-row:hover {
  background: var(--surface-hover, #f8fafc);
}

.activity-td {
  padding: 7px 10px;
  color: var(--text-primary, #1e293b);
}

.activity-td--agent {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-td--duration,
.activity-td--last-seen {
  text-align: right;
  white-space: nowrap;
  color: var(--text-muted, #64748b);
}

.activity-empty {
  padding: 16px 12px;
  text-align: center;
  color: var(--text-muted, #94a3b8);
  font-size: 13px;
}
</style>

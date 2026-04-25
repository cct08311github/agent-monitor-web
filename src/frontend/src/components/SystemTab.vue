<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { api } from '@/composables/useApi'
import { formatTokens, formatTWD } from '@/utils/format'
import { formatRelativeTime } from '@/lib/time'
import { appState } from '@/stores/appState'
import { showToast } from '@/composables/useToast'
import {
  computeHeatmapBuckets,
  maxBucketCost,
  colorForCost,
} from '@/utils/costHeatmap'
import { buildForecast } from '@/utils/costForecast'
import type { Forecast } from '@/utils/costForecast'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InsightSeverity = 'critical' | 'warning' | 'info'

interface Insight {
  type: string
  severity: InsightSeverity
  message: string
  ts: number
  meta?: Record<string, unknown>
}

interface HealthFull {
  status: 'ok' | 'degraded' | 'critical'
  uptime_ms: number
  alerts_recent_count: number
  alerts_critical_count: number
  alerts_warning_count: number
  errors_recent_count: number
  p99_max_ms: number
  agents_active_count: number
  agents_total_count: number
  ts: number
}

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

const health = ref<HealthFull | null>(null)
const healthLoading = ref(true)
const healthError = ref(false)

// Smart Insights state
const insights = ref<Insight[]>([])
const insightsLoading = ref(true)
const insightsError = ref(false)

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
// Cost Heatmap computed
// ---------------------------------------------------------------------------

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const heatmapMatrix = computed(() => {
  return computeHeatmapBuckets(
    costHistoryData.value.map((p) => ({
      ts: p.ts ?? '',
      total_cost: p.total_cost ?? 0,
    })),
  )
})

const maxCost = computed(() => maxBucketCost(heatmapMatrix.value))

const heatmapEmpty = computed(() => maxCost.value === 0)

// ---------------------------------------------------------------------------
// Cost Forecast computed
// ---------------------------------------------------------------------------

const forecast = computed<Forecast>(() =>
  buildForecast(
    costHistoryData.value.map((p) => ({
      ts: p.ts ?? '',
      total_cost: p.total_cost ?? 0,
    })),
  ),
)

// ---------------------------------------------------------------------------
// Health computed helpers
// ---------------------------------------------------------------------------

const healthStatusClass = computed<string>(() => {
  switch (health.value?.status) {
    case 'ok': return 'health-status--ok'
    case 'degraded': return 'health-status--degraded'
    case 'critical': return 'health-status--critical'
    default: return ''
  }
})

const healthStatusLabel = computed<string>(() => {
  switch (health.value?.status) {
    case 'ok': return 'OK'
    case 'degraded': return 'DEGRADED'
    case 'critical': return 'CRITICAL'
    default: return '—'
  }
})

// ---------------------------------------------------------------------------
// Insights helpers
// ---------------------------------------------------------------------------

function insightIcon(severity: InsightSeverity): string {
  switch (severity) {
    case 'critical': return '🔴'
    case 'warning': return '🟠'
    default: return '🔵'
  }
}

function insightSeverityClass(severity: InsightSeverity): string {
  switch (severity) {
    case 'critical': return 'insight-item--critical'
    case 'warning': return 'insight-item--warning'
    default: return 'insight-item--info'
  }
}

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
// Fetch insights
// ---------------------------------------------------------------------------

async function fetchInsights(): Promise<void> {
  try {
    insightsError.value = false
    const data = (await api.get('/api/read/insights')) as { insights: Insight[] }
    insights.value = data.insights ?? []
  } catch {
    insightsError.value = true
  } finally {
    insightsLoading.value = false
  }
}

// ---------------------------------------------------------------------------
// Fetch health/full composite status
// ---------------------------------------------------------------------------

async function fetchHealth(): Promise<void> {
  try {
    healthError.value = false
    const data = (await api.get('/api/read/health/full')) as HealthFull
    health.value = data
  } catch {
    healthError.value = true
  } finally {
    healthLoading.value = false
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

let _healthInterval: ReturnType<typeof setInterval> | null = null
let _insightsInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  fetchHealth()
  _healthInterval = setInterval(fetchHealth, 15000)
  fetchHistory()
  fetchInsights()
  _insightsInterval = setInterval(fetchInsights, 60000)
  setupResizeObserver()
  setupThemeObserver()
})

onUnmounted(() => {
  if (_healthInterval) { clearInterval(_healthInterval); _healthInterval = null }
  if (_insightsInterval) { clearInterval(_insightsInterval); _insightsInterval = null }
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
    <!-- ---------------------------------------------------------------- -->
    <!-- Smart Insights Card                                               -->
    <!-- ---------------------------------------------------------------- -->
    <div class="insights-card" data-testid="insights-card">
      <div class="insights-card-header">
        <h2 class="insights-card-title">💡 Smart Insights</h2>
        <button
          class="ctrl-btn"
          style="font-size:12px"
          :disabled="insightsLoading"
          @click="fetchInsights"
        >重新整理</button>
      </div>

      <!-- Loading state -->
      <div v-if="insightsLoading" class="insights-loading" data-testid="insights-loading">
        <span class="insights-loading-spinner" />
        分析中…
      </div>

      <!-- Error state -->
      <div v-else-if="insightsError" class="insights-error" data-testid="insights-error">
        ⚠️ Insights 載入失敗
        <button class="ctrl-btn" style="margin-left:8px;font-size:12px" @click="fetchInsights">重試</button>
      </div>

      <!-- Empty state -->
      <div v-else-if="insights.length === 0" class="insights-empty" data-testid="insights-empty">
        ✅ 一切正常 — 沒有顯著變化
      </div>

      <!-- Insights list -->
      <ul v-else class="insights-list" data-testid="insights-list">
        <li
          v-for="(item, idx) in insights"
          :key="idx"
          class="insight-item"
          :class="insightSeverityClass(item.severity)"
          :data-testid="`insight-item-${item.severity}`"
        >
          <span class="insight-icon" aria-hidden="true">{{ insightIcon(item.severity) }}</span>
          <span class="insight-message">{{ item.message }}</span>
        </li>
      </ul>
    </div>

    <!-- ---------------------------------------------------------------- -->
    <!-- 系統健康 Card (health/full composite status)                      -->
    <!-- ---------------------------------------------------------------- -->
    <div class="health-card">
      <div class="health-card-header">
        <h2 class="health-card-title">🩺 系統健康</h2>
        <span
          v-if="!healthLoading && !healthError && health"
          class="health-status-pill"
          :class="healthStatusClass"
        >{{ healthStatusLabel }}</span>
      </div>

      <!-- Loading state -->
      <div v-if="healthLoading" class="health-loading" data-testid="health-loading">
        <span class="health-loading-spinner" />
        載入中…
      </div>

      <!-- Error state -->
      <div v-else-if="healthError" class="health-error" data-testid="health-error">
        ⚠️ 健康狀態載入失敗
        <button class="ctrl-btn" style="margin-left:8px;font-size:12px" @click="fetchHealth">重試</button>
      </div>

      <!-- Data state -->
      <div v-else-if="health" class="health-metrics" data-testid="health-metrics">
        <div class="health-metric-row">
          <span class="health-metric-label">運行時間</span>
          <span class="health-metric-value">{{ formatRelativeTime(Date.now() - health.uptime_ms) }}</span>
        </div>
        <div class="health-metric-row">
          <span class="health-metric-label">Active Agents</span>
          <span class="health-metric-value">{{ health.agents_active_count }} / {{ health.agents_total_count }}</span>
        </div>
        <div class="health-metric-row">
          <span class="health-metric-label">近期告警</span>
          <span class="health-metric-value">{{ health.alerts_recent_count }}</span>
        </div>
        <div class="health-metric-row">
          <span class="health-metric-label">Critical 告警</span>
          <span class="health-metric-value health-metric-value--critical">{{ health.alerts_critical_count }}</span>
        </div>
        <div class="health-metric-row">
          <span class="health-metric-label">Warning 告警</span>
          <span class="health-metric-value health-metric-value--warning">{{ health.alerts_warning_count }}</span>
        </div>
        <div class="health-metric-row">
          <span class="health-metric-label">近期錯誤</span>
          <span class="health-metric-value">{{ health.errors_recent_count }}</span>
        </div>
        <div class="health-metric-row">
          <span class="health-metric-label">P99 延遲</span>
          <span class="health-metric-value">{{ health.p99_max_ms }} ms</span>
        </div>
      </div>
    </div>

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

        <!-- ---------------------------------------------------------------- -->
        <!-- Cost Forecast Card                                               -->
        <!-- ---------------------------------------------------------------- -->
        <div class="section-header" style="margin-top: 16px" data-testid="forecast-section">
          <h2>🔮 成本預測</h2>
        </div>

        <div class="forecast-card" data-testid="forecast-card">
          <!-- Empty state: insufficient data -->
          <div
            v-if="forecast.basis_days < 2"
            class="forecast-empty"
            data-testid="forecast-empty"
          >
            資料不足（需至少 2 天歷史資料）
          </div>

          <!-- Data state -->
          <div v-else data-testid="forecast-content">
            <!-- Primary forecast numbers -->
            <div class="forecast-row" data-testid="forecast-7d">
              <span class="forecast-row-label">下 7 天 預估</span>
              <span class="forecast-row-value">${{ forecast.next7d_total.toFixed(2) }}</span>
            </div>
            <div class="forecast-row" data-testid="forecast-30d">
              <span class="forecast-row-label">下 30 天 預估</span>
              <span class="forecast-row-value">${{ forecast.next30d_total.toFixed(2) }}</span>
            </div>

            <!-- Trend line -->
            <div class="forecast-trend" data-testid="forecast-trend">
              <span class="forecast-trend-label">趨勢：</span>
              <span
                v-if="forecast.trend === 'up'"
                class="forecast-trend-value forecast-trend--up"
              >↑ +${{ forecast.slope_per_day.toFixed(2) }}/day</span>
              <span
                v-else-if="forecast.trend === 'down'"
                class="forecast-trend-value forecast-trend--down"
              >↓ ${{ forecast.slope_per_day.toFixed(2) }}/day</span>
              <span
                v-else
                class="forecast-trend-value forecast-trend--flat"
              >→ 持平</span>
            </div>

            <!-- Confidence badge + basis -->
            <div class="forecast-meta" data-testid="forecast-meta">
              <span
                class="forecast-confidence-badge"
                :class="`forecast-confidence--${forecast.confidence}`"
                data-testid="forecast-confidence"
              >{{ forecast.confidence === 'low' ? '低' : forecast.confidence === 'medium' ? '中' : '高' }} 可信度</span>
              <span class="forecast-basis" data-testid="forecast-basis">
                基於過去 {{ forecast.basis_days }} 天資料
              </span>
            </div>
          </div>
        </div>

        <!-- ---------------------------------------------------------------- -->
        <!-- Cost Heatmap Card                                                 -->
        <!-- ---------------------------------------------------------------- -->
        <div class="section-header" style="margin-top: 16px" data-testid="heatmap-section">
          <h2>🔥 成本熱力圖 (7×24h)</h2>
        </div>

        <div class="heatmap-card" data-testid="heatmap-card">
          <!-- Empty state -->
          <div v-if="heatmapEmpty" class="heatmap-empty" data-testid="heatmap-empty">
            無 cost 資料
          </div>

          <!-- SVG heatmap -->
          <svg
            v-else
            viewBox="0 0 720 220"
            class="heatmap-svg"
            aria-label="成本熱力圖"
            data-testid="heatmap-svg"
          >
            <!-- y-axis day labels -->
            <text
              v-for="(d, i) in DAY_LABELS"
              :key="d"
              :x="0"
              :y="20 + i * 25 + 12"
              class="heatmap-label"
            >{{ d }}</text>

            <!-- x-axis hour labels (every 3rd hour for readability) -->
            <text
              v-for="h in 24"
              :key="h - 1"
              :x="40 + (h - 1) * 28"
              :y="14"
              class="heatmap-label"
            >{{ h - 1 }}</text>

            <!-- cells: 7 rows × 24 cols = 168 cells -->
            <g
              v-for="(row, dy) in heatmapMatrix"
              :key="dy"
              :data-testid="`heatmap-row-${dy}`"
            >
              <rect
                v-for="(cell, hr) in row"
                :key="hr"
                :x="40 + hr * 28"
                :y="20 + dy * 25"
                width="26"
                height="22"
                rx="3"
                :fill="colorForCost(cell.cost, maxCost)"
                stroke="rgba(0,0,0,0.06)"
                :data-testid="`heatmap-cell-${dy}-${hr}`"
              >
                <title>{{ DAY_LABELS[dy] }} {{ hr }}:00 — ${{ cell.cost.toFixed(4) }}</title>
              </rect>
            </g>
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ------------------------------------------------------------------ */
/* Smart Insights Card                                                  */
/* ------------------------------------------------------------------ */

.insights-card {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
  background: var(--surface-base, #fff);
}

.insights-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.insights-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #1e293b);
}

.insights-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted, #94a3b8);
  padding: 8px 0;
}

.insights-loading-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-color, #e2e8f0);
  border-top-color: var(--accent, #3b82f6);
  border-radius: 50%;
  animation: health-spin 0.7s linear infinite;
}

.insights-error {
  display: flex;
  align-items: center;
  font-size: 13px;
  color: var(--red, #ef4444);
  padding: 6px 0;
}

.insights-empty {
  font-size: 13px;
  color: var(--text-muted, #64748b);
  padding: 6px 0;
}

.insights-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.insight-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
}

.insight-item--critical {
  background: color-mix(in srgb, var(--red, #ef4444) 8%, transparent);
  border-left: 3px solid var(--red, #ef4444);
}

.insight-item--warning {
  background: color-mix(in srgb, var(--amber, #f59e0b) 8%, transparent);
  border-left: 3px solid var(--amber, #f59e0b);
}

.insight-item--info {
  background: color-mix(in srgb, var(--accent, #3b82f6) 8%, transparent);
  border-left: 3px solid var(--accent, #3b82f6);
}

.insight-icon {
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1.5;
}

.insight-message {
  color: var(--text-primary, #1e293b);
}

/* ------------------------------------------------------------------ */
/* Health Card                                                          */
/* ------------------------------------------------------------------ */

.health-card {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
  background: var(--surface-base, #fff);
}

.health-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.health-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #1e293b);
}

.health-status-pill {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.health-status--ok {
  background: var(--green, #22c55e);
  color: #fff;
}

.health-status--degraded {
  background: var(--amber, #f59e0b);
  color: #fff;
}

.health-status--critical {
  background: var(--red, #ef4444);
  color: #fff;
}

.health-metrics {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.health-metric-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  padding: 2px 0;
}

.health-metric-label {
  color: var(--text-muted, #64748b);
}

.health-metric-value {
  font-weight: 600;
  color: var(--text-primary, #1e293b);
  font-variant-numeric: tabular-nums;
}

.health-metric-value--critical {
  color: var(--red, #ef4444);
}

.health-metric-value--warning {
  color: var(--amber, #f59e0b);
}

.health-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted, #94a3b8);
  padding: 8px 0;
}

.health-loading-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-color, #e2e8f0);
  border-top-color: var(--accent, #3b82f6);
  border-radius: 50%;
  animation: health-spin 0.7s linear infinite;
}

@keyframes health-spin {
  to { transform: rotate(360deg); }
}

.health-error {
  display: flex;
  align-items: center;
  font-size: 13px;
  color: var(--red, #ef4444);
  padding: 6px 0;
}

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

/* ------------------------------------------------------------------ */
/* Cost Forecast Card                                                   */
/* ------------------------------------------------------------------ */

.forecast-card {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  padding: 14px 16px;
  background: var(--surface-base, #fff);
  margin-top: 4px;
}

.forecast-empty {
  padding: 12px 0;
  text-align: center;
  color: var(--text-muted, #94a3b8);
  font-size: 13px;
}

.forecast-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 0;
  font-size: 14px;
  border-bottom: 1px solid var(--border-color, #f1f5f9);
}

.forecast-row:last-of-type {
  border-bottom: none;
}

.forecast-row-label {
  color: var(--text-muted, #64748b);
  font-size: 13px;
}

.forecast-row-value {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary, #1e293b);
  font-size: 15px;
}

.forecast-trend {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 0 4px;
  font-size: 13px;
}

.forecast-trend-label {
  color: var(--text-muted, #64748b);
}

.forecast-trend-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.forecast-trend--up {
  color: var(--red, #ef4444);
}

.forecast-trend--down {
  color: var(--green, #22c55e);
}

.forecast-trend--flat {
  color: var(--text-muted, #64748b);
}

.forecast-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 8px;
  flex-wrap: wrap;
}

.forecast-confidence-badge {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.forecast-confidence--low {
  background: color-mix(in srgb, var(--amber, #f59e0b) 15%, transparent);
  color: var(--amber, #d97706);
  border: 1px solid var(--amber, #f59e0b);
}

.forecast-confidence--medium {
  background: color-mix(in srgb, var(--accent, #3b82f6) 12%, transparent);
  color: var(--accent, #2563eb);
  border: 1px solid var(--accent, #3b82f6);
}

.forecast-confidence--high {
  background: color-mix(in srgb, var(--green, #22c55e) 15%, transparent);
  color: var(--green, #16a34a);
  border: 1px solid var(--green, #22c55e);
}

.forecast-basis {
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
}

/* ------------------------------------------------------------------ */
/* Cost Heatmap Card                                                    */
/* ------------------------------------------------------------------ */

.heatmap-card {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  padding: 12px 8px;
  background: var(--surface-base, #fff);
  overflow-x: auto;
}

.heatmap-svg {
  display: block;
  width: 100%;
  min-width: 480px;
  height: auto;
}

.heatmap-label {
  font-size: 9px;
  fill: var(--text-muted, #94a3b8);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.heatmap-empty {
  padding: 16px 12px;
  text-align: center;
  color: var(--text-muted, #94a3b8);
  font-size: 13px;
}
</style>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '@/composables/useApi'
import { formatTs } from '@/lib/time'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiMetricErrorCount {
  '4xx': number
  '5xx': number
}

export interface ApiMetric {
  endpoint: string
  count: number
  p50: number
  p95: number
  p99: number
  min: number
  max: number
  mean: number
  errorCount: ApiMetricErrorCount
}

export interface ApiMetricsResponse {
  success: boolean
  data: {
    metrics: Record<
      string,
      {
        count: number
        p50: number
        p95: number
        p99: number
        min: number
        max: number
        mean: number
        errorCount: ApiMetricErrorCount
      }
    >
  }
}

export interface ApiError {
  timestamp: string | number
  requestId: string
  method: string
  path: string
  statusCode: number
  error: string
  durationMs: number
}

export interface ApiErrorsResponse {
  success: boolean
  data: {
    errors: ApiError[]
    total: number
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const metrics = ref<ApiMetric[]>([])
const errors = ref<ApiError[]>([])
const loadingMetrics = ref(false)
const loadingErrors = ref(false)
const metricsError = ref<string | null>(null)
const errorsError = ref<string | null>(null)
const lastUpdated = ref<Date | null>(null)
const autoRefresh = ref(true)

// Sorting for metrics table
const sortKey = ref<keyof ApiMetric>('p99')
const sortDesc = ref(true)

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const sortedMetrics = computed(() => {
  const key = sortKey.value
  return [...metrics.value].sort((a, b) => {
    const aVal = a[key]
    const bVal = b[key]
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDesc.value ? bVal - aVal : aVal - bVal
    }
    const aStr = String(aVal)
    const bStr = String(bVal)
    return sortDesc.value ? bStr.localeCompare(aStr) : aStr.localeCompare(bStr)
  })
})

const lastUpdatedLabel = computed(() => {
  if (!lastUpdated.value) return '—'
  return lastUpdated.value.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
})

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchMetrics(): Promise<void> {
  if (loadingMetrics.value) return
  loadingMetrics.value = true
  metricsError.value = null
  try {
    const data = (await api.get('/api/read/metrics')) as ApiMetricsResponse
    if (data.success) {
      metrics.value = Object.entries(data.data.metrics).map(([endpoint, stats]) => ({
        endpoint,
        ...stats,
      }))
    } else {
      metricsError.value = 'Metrics API returned unsuccessful response'
    }
  } catch (e) {
    metricsError.value = (e as Error).message ?? 'Failed to fetch metrics'
  } finally {
    loadingMetrics.value = false
  }
}

async function fetchErrors(): Promise<void> {
  if (loadingErrors.value) return
  loadingErrors.value = true
  errorsError.value = null
  try {
    const data = (await api.get('/api/read/errors/recent?limit=20')) as ApiErrorsResponse
    if (data.success) {
      errors.value = data.data.errors
    } else {
      errorsError.value = 'Errors API returned unsuccessful response'
    }
  } catch (e) {
    errorsError.value = (e as Error).message ?? 'Failed to fetch errors'
  } finally {
    loadingErrors.value = false
  }
}

async function refresh(): Promise<void> {
  await Promise.all([fetchMetrics(), fetchErrors()])
  lastUpdated.value = new Date()
}

// ---------------------------------------------------------------------------
// Auto-refresh
// ---------------------------------------------------------------------------

let autoRefreshTimer: ReturnType<typeof setInterval> | null = null

function startAutoRefresh(): void {
  stopAutoRefresh()
  autoRefreshTimer = setInterval(() => {
    void refresh()
  }, 10_000)
}

function stopAutoRefresh(): void {
  if (autoRefreshTimer !== null) {
    clearInterval(autoRefreshTimer)
    autoRefreshTimer = null
  }
}

function toggleAutoRefresh(): void {
  autoRefresh.value = !autoRefresh.value
  if (autoRefresh.value) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function setSort(key: keyof ApiMetric): void {
  if (sortKey.value === key) {
    sortDesc.value = !sortDesc.value
  } else {
    sortKey.value = key
    sortDesc.value = true
  }
}

function sortIndicator(key: keyof ApiMetric): string {
  if (sortKey.value !== key) return ''
  return sortDesc.value ? ' ↓' : ' ↑'
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtMs(ms: number): string {
  if (ms >= 1000) return (ms / 1000).toFixed(2) + 's'
  return ms.toFixed(0) + 'ms'
}

function fmtTime(ts: string | number): string {
  const n = typeof ts === 'string' ? Date.parse(ts) : ts
  return formatTs(n)
}

function truncateRequestId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  void refresh()
  if (autoRefresh.value) startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<template>
  <div class="obs-tab">
    <!-- Header -->
    <div class="obs-header">
      <span class="obs-updated">
        Last updated: <strong>{{ lastUpdatedLabel }}</strong>
      </span>
      <div class="obs-controls">
        <button
          class="obs-btn obs-btn--secondary"
          :disabled="loadingMetrics || loadingErrors"
          @click="refresh"
        >
          <span v-if="loadingMetrics || loadingErrors" class="obs-spinner" aria-hidden="true" />
          Refresh
        </button>
        <button
          :class="['obs-btn', autoRefresh ? 'obs-btn--active' : 'obs-btn--secondary']"
          @click="toggleAutoRefresh"
        >
          Auto-refresh {{ autoRefresh ? 'ON' : 'OFF' }}
        </button>
      </div>
    </div>

    <!-- ── API Metrics Table ─────────────────────────────────────────────── -->
    <section class="obs-section">
      <h2 class="obs-section-title">API Latency Metrics</h2>

      <!-- Error state -->
      <div v-if="metricsError" class="obs-error-state">
        <span class="obs-error-icon" aria-hidden="true">⚠</span>
        <span>{{ metricsError }}</span>
        <button class="obs-btn obs-btn--secondary obs-btn--sm" @click="fetchMetrics">
          Retry
        </button>
      </div>

      <!-- Empty state -->
      <div v-else-if="!loadingMetrics && metrics.length === 0" class="obs-empty-state">
        <div class="obs-empty-icon" aria-hidden="true">📊</div>
        <div class="obs-empty-title">No metrics yet</div>
        <div class="obs-empty-desc">
          Metrics accumulate as API endpoints receive traffic.
        </div>
      </div>

      <!-- Table -->
      <div v-else class="obs-table-wrap">
        <table class="obs-table">
          <thead>
            <tr>
              <th class="obs-th obs-th--sortable" @click="setSort('endpoint')">
                Endpoint{{ sortIndicator('endpoint') }}
              </th>
              <th class="obs-th obs-th--sortable obs-th--num" @click="setSort('count')">
                Count{{ sortIndicator('count') }}
              </th>
              <th class="obs-th obs-th--sortable obs-th--num" @click="setSort('p50')">
                p50{{ sortIndicator('p50') }}
              </th>
              <th class="obs-th obs-th--sortable obs-th--num" @click="setSort('p95')">
                p95{{ sortIndicator('p95') }}
              </th>
              <th class="obs-th obs-th--sortable obs-th--num" @click="setSort('p99')">
                p99{{ sortIndicator('p99') }}
              </th>
              <th class="obs-th obs-th--sortable obs-th--num" @click="setSort('mean')">
                Mean{{ sortIndicator('mean') }}
              </th>
              <th class="obs-th obs-th--sortable obs-th--num" @click="setSort('max')">
                Max{{ sortIndicator('max') }}
              </th>
              <th class="obs-th obs-th--num">4xx</th>
              <th class="obs-th obs-th--num">5xx</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in sortedMetrics" :key="m.endpoint" class="obs-tr">
              <td class="obs-td obs-td--endpoint">{{ m.endpoint }}</td>
              <td class="obs-td obs-td--num">{{ m.count }}</td>
              <td class="obs-td obs-td--num">{{ fmtMs(m.p50) }}</td>
              <td class="obs-td obs-td--num">{{ fmtMs(m.p95) }}</td>
              <td class="obs-td obs-td--num obs-td--p99">{{ fmtMs(m.p99) }}</td>
              <td class="obs-td obs-td--num">{{ fmtMs(m.mean) }}</td>
              <td class="obs-td obs-td--num">{{ fmtMs(m.max) }}</td>
              <td class="obs-td obs-td--num" :class="{ 'obs-td--warn': m.errorCount['4xx'] > 0 }">
                {{ m.errorCount['4xx'] }}
              </td>
              <td class="obs-td obs-td--num" :class="{ 'obs-td--error': m.errorCount['5xx'] > 0 }">
                {{ m.errorCount['5xx'] }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── Recent Errors Table ───────────────────────────────────────────── -->
    <section class="obs-section">
      <h2 class="obs-section-title">
        Recent Errors
        <span class="obs-section-subtitle">(5xx only, last 50)</span>
      </h2>

      <!-- Error state -->
      <div v-if="errorsError" class="obs-error-state">
        <span class="obs-error-icon" aria-hidden="true">⚠</span>
        <span>{{ errorsError }}</span>
        <button class="obs-btn obs-btn--secondary obs-btn--sm" @click="fetchErrors">
          Retry
        </button>
      </div>

      <!-- Empty state -->
      <div v-else-if="!loadingErrors && errors.length === 0" class="obs-empty-state">
        <div class="obs-empty-icon" aria-hidden="true">✅</div>
        <div class="obs-empty-title">No recent errors</div>
        <div class="obs-empty-desc">
          No 5xx errors recorded in the current session.
        </div>
      </div>

      <!-- Table -->
      <div v-else class="obs-table-wrap">
        <table class="obs-table">
          <thead>
            <tr>
              <th class="obs-th">Time</th>
              <th class="obs-th">Method</th>
              <th class="obs-th">Path</th>
              <th class="obs-th obs-th--num">Status</th>
              <th class="obs-th obs-th--num">Duration</th>
              <th class="obs-th">Request ID</th>
              <th class="obs-th obs-th--err">Error</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(e, i) in errors" :key="e.requestId + i" class="obs-tr obs-tr--error">
              <td class="obs-td obs-td--mono">{{ fmtTime(e.timestamp) }}</td>
              <td class="obs-td">
                <span :class="['obs-method', `obs-method--${e.method.toLowerCase()}`]">
                  {{ e.method }}
                </span>
              </td>
              <td class="obs-td obs-td--path">{{ e.path }}</td>
              <td class="obs-td obs-td--num obs-td--error">{{ e.statusCode }}</td>
              <td class="obs-td obs-td--num">{{ fmtMs(e.durationMs) }}</td>
              <td class="obs-td obs-td--mono obs-td--reqid" :title="e.requestId">
                {{ truncateRequestId(e.requestId) }}
              </td>
              <td class="obs-td obs-td--errmsg" :title="e.error">{{ e.error }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ── Layout ─────────────────────────────────────────────────────────────── */

.obs-tab {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.obs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.obs-updated {
  font-size: 13px;
  color: var(--color-text-muted, #888);
}

.obs-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* ── Buttons ─────────────────────────────────────────────────────────────── */

.obs-btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid transparent;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: opacity 0.15s;
}

.obs-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.obs-btn--secondary {
  background: var(--color-surface-2, #2a2a2a);
  color: var(--color-text, #e0e0e0);
  border-color: var(--color-border, #444);
}

.obs-btn--secondary:not(:disabled):hover {
  background: var(--color-surface-3, #333);
}

.obs-btn--active {
  background: var(--color-accent, #3b82f6);
  color: #fff;
  border-color: transparent;
}

.obs-btn--active:hover {
  opacity: 0.85;
}

.obs-btn--sm {
  padding: 4px 8px;
  font-size: 12px;
}

/* ── Spinner ─────────────────────────────────────────────────────────────── */

.obs-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  display: inline-block;
  animation: obs-spin 0.7s linear infinite;
}

@keyframes obs-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Section ─────────────────────────────────────────────────────────────── */

.obs-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.obs-section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, #e0e0e0);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.obs-section-subtitle {
  font-size: 12px;
  font-weight: 400;
  color: var(--color-text-muted, #888);
}

/* ── Empty / Error states ────────────────────────────────────────────────── */

.obs-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 16px;
  gap: 8px;
  color: var(--color-text-muted, #888);
  background: var(--color-surface-1, #1e1e1e);
  border-radius: 8px;
  border: 1px solid var(--color-border, #333);
}

.obs-empty-icon {
  font-size: 32px;
}

.obs-empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #e0e0e0);
}

.obs-empty-desc {
  font-size: 12px;
  text-align: center;
  max-width: 300px;
}

.obs-error-state {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--color-error-surface, #2d1a1a);
  border: 1px solid var(--color-error-border, #7f1d1d);
  border-radius: 8px;
  color: var(--color-error, #f87171);
  font-size: 13px;
}

.obs-error-icon {
  font-size: 16px;
  flex-shrink: 0;
}

/* ── Table ───────────────────────────────────────────────────────────────── */

.obs-table-wrap {
  overflow-x: auto;
  border-radius: 8px;
  border: 1px solid var(--color-border, #333);
}

.obs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.obs-th {
  padding: 10px 12px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted, #999);
  background: var(--color-surface-2, #1a1a1a);
  border-bottom: 1px solid var(--color-border, #333);
  white-space: nowrap;
  user-select: none;
}

.obs-th--sortable {
  cursor: pointer;
}

.obs-th--sortable:hover {
  color: var(--color-text, #e0e0e0);
}

.obs-th--num {
  text-align: right;
}

.obs-tr {
  border-bottom: 1px solid var(--color-border-subtle, #2a2a2a);
  transition: background 0.1s;
}

.obs-tr:last-child {
  border-bottom: none;
}

.obs-tr:hover {
  background: var(--color-surface-hover, #252525);
}

.obs-tr--error:hover {
  background: var(--color-error-surface-hover, #2d1a1a);
}

.obs-td {
  padding: 9px 12px;
  color: var(--color-text, #e0e0e0);
  vertical-align: middle;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.obs-td--num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.obs-td--mono {
  font-family: ui-monospace, 'Cascadia Code', monospace;
  font-size: 12px;
}

.obs-td--endpoint {
  font-family: ui-monospace, 'Cascadia Code', monospace;
  font-size: 12px;
  color: var(--color-text-muted, #bbb);
  max-width: 300px;
}

.obs-td--path {
  font-family: ui-monospace, 'Cascadia Code', monospace;
  font-size: 12px;
  max-width: 200px;
}

.obs-td--p99 {
  font-weight: 600;
}

.obs-td--warn {
  color: var(--color-warn, #fbbf24);
}

.obs-td--error {
  color: var(--color-error, #f87171);
  font-weight: 600;
}

.obs-td--errmsg {
  color: var(--color-text-muted, #aaa);
  font-size: 12px;
  max-width: 260px;
}

.obs-td--reqid {
  font-size: 11px;
  color: var(--color-text-muted, #888);
  letter-spacing: 0.04em;
}

/* ── Method badge ────────────────────────────────────────────────────────── */

.obs-method {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  font-family: ui-monospace, monospace;
  letter-spacing: 0.04em;
}

.obs-method--get {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.obs-method--post {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}

.obs-method--put,
.obs-method--patch {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

.obs-method--delete {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
}
</style>

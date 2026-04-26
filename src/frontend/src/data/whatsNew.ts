// ---------------------------------------------------------------------------
// whatsNew.ts — version-based release notes for the What's New popup
//
// Add a new ReleaseNote block whenever you ship a notable version.
// LATEST_VERSION is compared against localStorage to decide whether to
// auto-open the popup on the first visit after an upgrade.
// ---------------------------------------------------------------------------

export interface ReleaseItem {
  emoji: string
  title: string
  description?: string
  prNumber?: number
}

export interface ReleaseNote {
  version: string // 'YYYY.MM.DD' format
  date: string    // human-readable label
  items: ReleaseItem[]
}

export const LATEST_VERSION = '2026.04.26'

export const RELEASE_NOTES: ReadonlyArray<ReleaseNote> = [
  {
    version: '2026.04.26',
    date: '2026-04-26',
    items: [
      {
        emoji: '📊',
        title: 'Activity heatmap',
        description: '過去 7 週 session 強度視覺化',
        prNumber: 477,
      },
      {
        emoji: '🔔',
        title: 'Toast 通知系統',
        description: '統一短暫提示，連線恢復、cron 觸發都有回饋',
        prNumber: 475,
      },
      {
        emoji: '🎓',
        title: '5 步驟新手引導',
        description: '第一次登入自動帶看主要功能',
        prNumber: 493,
      },
      {
        emoji: '🌙',
        title: '安靜時段',
        description: '設定不打擾的通知時段（支援跨日）',
        prNumber: 499,
      },
      {
        emoji: '🎨',
        title: '色盲友善色盤',
        description: 'Okabe-Ito 替代色盤，從 ? 面板切換',
        prNumber: 501,
      },
      {
        emoji: '📝',
        title: 'Per-agent 筆記',
        description: '每 agent 自己的 scratchpad，自動儲存',
        prNumber: 483,
      },
      {
        emoji: '✏️',
        title: 'Agent 友善別名',
        description: '把難記的 ID 改成「API主機」這樣的顯示名',
        prNumber: 495,
      },
      {
        emoji: '☕',
        title: 'Snooze alerts',
        description: '15m / 1h / 4h / 24h 暫停通知',
        prNumber: 481,
      },
      {
        emoji: '🔍',
        title: 'Saved log searches',
        description: 'LogsTab 把常用搜尋存成 preset',
        prNumber: 489,
      },
      {
        emoji: '⏰',
        title: 'Cron next-fire-times',
        description: '每 job 顯示下次 5 次觸發時間',
        prNumber: 485,
      },
      {
        emoji: '🟢',
        title: 'SSE 連線狀態指示器',
        description: 'header 即時連線狀態 + 重連',
        prNumber: 471,
      },
      {
        emoji: '📈',
        title: '訊息速率 sparkline',
        description: '60s SSE throughput 折線',
        prNumber: 497,
      },
      {
        emoji: '🔢',
        title: 'Per-tab 徽章計數',
        description: 'header tab 顯示狀態指示',
        prNumber: 469,
      },
      {
        emoji: '⌨️',
        title: '鍵盤快捷鍵面板',
        description: '按 ? 隨時查看所有快捷鍵',
        prNumber: 473,
      },
      {
        emoji: '🎯',
        title: 'CommandPalette 最近使用',
        description: 'recents 自動追蹤，快速回到上次操作',
        prNumber: 487,
      },
      {
        emoji: '🪶',
        title: 'Empty state 視覺化',
        description: '空狀態加圖示和引導 CTA',
        prNumber: 491,
      },
      {
        emoji: '📥',
        title: 'Notes 匯出 markdown',
        description: '一鍵下載 agent 筆記為 .md 檔',
        prNumber: 503,
      },
      {
        emoji: '🌐',
        title: '背景 tab 通知',
        description: '失焦時 title + favicon 顯示未讀',
        prNumber: 479,
      },
    ],
  },
] as const

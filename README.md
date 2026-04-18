# OpenClaw Agent 監控系統 - 網頁版

即時監控所有 OpenClaw Agent 的狀態、費用與任務執行情況，提供直觀的網頁介面。

## 主要功能

### 監控 (Monitor)
- **Agent 狀態即時監控** — 每 30 秒自動刷新，SSE 串流更新
- **Agent 分組顯示** — 執行中（橫排展開）/ 閒置（可折疊）分區
- **Agent 搜尋篩選** — 即時依 id / model / 狀態過濾卡片
- **Agent 詳情面板** — 點擊卡片查看 Token、費用、模型明細、任務內容

### Session 檢視
- **Session 列表** — 詳情面板顯示最新 20 個 sessions（訊息數 / 最後時間）
- **Session 內容閱讀** — 點擊 session 行開啟 Modal，以對話泡泡呈現 user/assistant 訊息

### 費用與統計 (System)
- **Agent 費用長條圖** — Top 10 agent 費用分佈（依選擇的時間範圍）
- **Model 使用統計** — 各 model token 用量 + 相對費用比例條
- **Agent Token 排行榜** — Top 5 agent 水平長條圖
- **系統資源折線圖** — CPU / Memory 歷史趨勢
- **成本趨勢圖** — 60 分鐘 USD 成本 sparkline

### 操作
- **Live Log 串流** — SSE 即時串流 gateway logs，含篩選與 active filter 狀態
- **Chat Tab** — 可選 Agent 傳送訊息
- **Cron 管理** — 定時任務狀態、toggle、手動觸發、刪除
- **TaskHub** — 任務管理（priority / status / due date 排序）
- **系統指令** — 重啟 Gateway、查詢狀態、切換模型等
- **Watchdog** — 自動偵測 Gateway 異常，可手動 repair / toggle
- **自主優化** — Gemini 四步驟分析 → 報告 → Telegram 推播

### 安全
- Localhost + Tailscale + 本地網域白名單
- HttpOnly sid cookie + HMAC session store + bcrypt + rate limit
- 控制端點 Bearer Token 驗證
- 威脅情報分析 + 自適應安全系統 + 合規檢查

## 快速開始

```bash
npm install
cp .env.example .env          # 再編輯填入 AUTH_PASSWORD_HASH / AUTH_SESSION_SECRET / HUD_CONTROL_TOKEN
npm start
# → https://localhost:3001
```

> 需要 mkcert 憑證：`./cert/key.pem` 和 `./cert/cert.pem`
> 詳細 env 變數見 `.env.example`（24+ 個可調參數，分 Auth / Server / Control / Dashboard / Watchdog 等區塊）

## 測試

```bash
npm test
# 600+ tests, 43+ suites — jest --forceExit --detectOpenHandles
```

## Configuration

| 變數 | 說明 |
|------|------|
| `PORT` | HTTPS 服務埠（預設 `3001`） |
| `HTTPS_KEY_PATH` / `HTTPS_CERT_PATH` | TLS 憑證路徑（預設 `cert/`） |
| `OPENCLAW_ROOT` / `OPENCLAW_BIN` / `OPENCLAW_ENV_PATH` | OpenClaw 根目錄、執行檔與 `.env` |
| `AUTH_DISABLED` | 停用登入驗證（測試用） |
| `AUTH_USERNAME` / `AUTH_PASSWORD_HASH` / `AUTH_SESSION_SECRET` / `AUTH_SESSION_TTL_HOURS` | 後台登入與 session |
| `HUD_CONTROL_TOKEN` | 控制端點 bearer token；未設定時回 `503` |
| `GEMINI_API_KEY` | 自主優化 pipeline；fallback 讀 `~/.openclaw/.env` |
| `OPENCLAW_NOTIFY_CHANNEL` / `OPENCLAW_NOTIFY_TARGET` | 優化通知目標（預設 Telegram） |

啟動時檢查 TLS 憑證、OpenClaw binary 與必要 auth 設定；缺少時拒絕啟動並輸出錯誤。

## 架構

```
src/
├── backend/
│   ├── controllers/    # 11 controllers (dashboard, control, auth, alert, optimize, cron, taskHub, agent, security, compliance, system)
│   ├── routes/         # api.js — 所有 API 路由
│   ├── middlewares/    # session/control auth, origin policy, rate limit, audit, error handler, request context/logger
│   ├── security/       # threatIntel, adaptiveSecurity, compliance
│   └── services/       # 12 services (dashboard, history, session, openclaw, health, optimize, alert, watchdog, tsdb, etc.)
└── frontend/           # Vue 3 + Vite + TypeScript
    ├── index.html
    ├── vite.config.ts
    └── src/
        ├── App.vue
        ├── router.ts
        ├── composables/    # useApi, useSSE, useAuth, useTheme, useDashboard, useKeyboardShortcuts, useConfirm, useToast
        ├── types/          # TypeScript 型別定義
        ├── views/          # LoginView, DashboardView
        └── components/     # 25 Vue 3 SFC 組件
            ├── MonitorTab.vue      # Agent 監控主畫面（Focus + Periphery 佈局）
            ├── AgentCard.vue       # Agent 卡片
            ├── AgentFocus.vue      # 活動中 Agent 展示區
            ├── AgentPeriphery.vue  # 閒置 Agent 收納區
            ├── AgentDetail.vue     # Agent 詳情面板
            ├── AgentMinimap.vue    # Agent 快速導覽
            ├── SessionViewer.vue   # Session 對話檢視器
            ├── SystemTab.vue       # 費用統計 / 系統資源
            ├── LogsTab.vue         # SSE 即時 log 串流
            ├── ChatTab.vue         # Agent 對話
            ├── OptimizeTab.vue     # 自主優化 pipeline
            ├── CronTab.vue         # Cron 管理
            ├── TaskHubTab.vue      # 任務管理
            └── ...                 # ConfirmDialog, ToastContainer, modals
dist/                   # Vite 建置輸出（Express 靜態檔）
tests/                  # Jest 測試，對應 src/backend/ 結構
```

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/read/dashboard` | 完整 dashboard payload |
| GET | `/api/read/stream` | SSE 即時推送 |
| GET | `/api/read/history` | 系統歷史 + 成本 + token 排行 |
| GET | `/api/read/status` | 系統狀態摘要 |
| GET | `/api/read/models` | 模型列表 |
| GET | `/api/read/agents` | Agent 列表 |
| GET | `/api/read/liveness` | 程序存活檢查 |
| GET | `/api/read/readiness` | readiness 與 startup/dependency 狀態 |
| GET | `/api/read/dependencies` | 依賴檢查明細 |
| GET | `/api/agents/:id/sessions` | Agent sessions 列表 |
| GET | `/api/agents/:id/sessions/:sid` | Session 訊息內容 |
| POST | `/api/auth/login` | 登入 |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/me` | 當前使用者 |
| GET | `/api/alerts/config` | 告警設定 |
| PATCH | `/api/alerts/config` | 更新告警設定 |
| GET | `/api/alerts/recent` | 近期告警 |
| GET | `/api/taskhub/tasks` | TaskHub 任務列表 |
| POST | `/api/taskhub/tasks` | 新增任務 |
| PATCH | `/api/taskhub/tasks/:domain/:id` | 更新任務 |
| DELETE | `/api/taskhub/tasks/:domain/:id` | 刪除任務 |
| GET | `/api/cron/jobs` | Cron 任務列表 |
| POST | `/api/cron/jobs/:id/toggle` | Toggle cron 任務 |
| POST | `/api/cron/jobs/:id/run` | 手動執行 cron 任務 |
| DELETE | `/api/cron/jobs/:id` | 刪除 cron 任務 |
| POST | `/api/command` | 執行 openclaw 指令 |
| GET | `/api/optimize/run` | 自主優化 pipeline（SSE） |
| GET | `/api/watchdog/status` | Watchdog 狀態 |
| POST | `/api/watchdog/repair` | 手動修復 |
| POST | `/api/watchdog/toggle` | Toggle watchdog |
| GET | `/api/logs/stream` | 即時 log 串流（SSE） |
| GET | `/api/system/comprehensive` | 系統完整狀態 |
| POST | `/api/security/analyze` | 安全分析 |
| GET | `/api/compliance/status` | 合規狀態 |

## 開發流程

1. open GitHub issue
2. fix → push
3. 等 CI 通過
4. close issue

commit 格式：`feat(sN): <description>`（N = sprint 編號）

---

**最後更新**：2026-04-11
**狀態**：Vue 3 遷移完成，安全掃描 R1-R25 完成，品質強化期

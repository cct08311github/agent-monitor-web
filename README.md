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
- **Cron 狀態** — 顯示定時任務狀態
- **TaskHub** — 任務管理（priority / status / due date 排序）
- **系統指令** — 重啟 Gateway、查詢狀態、切換模型等

### 安全
- Localhost + Tailscale + 本地網域白名單
- Bearer Token 驗證（控制端點）
- Rate limiting、Audit log
- 威脅情報 (6 條規則) + 自適應安全系統

## 快速開始

```bash
npm install
npm start
# → https://localhost:3001
```

> 需要 mkcert 憑證：`./cert/key.pem` 和 `./cert/cert.pem`

## 測試

```bash
npm test
# 340 tests, 24 suites — jest --forceExit --detectOpenHandles
```

## Configuration

- `PORT` — HTTPS 服務埠，預設 `3001`
- `HTTPS_KEY_PATH` / `HTTPS_CERT_PATH` — TLS 憑證路徑，預設為 `cert/key.pem` 與 `cert/cert.pem`
- `OPENCLAW_ROOT` / `OPENCLAW_BIN` / `OPENCLAW_ENV_PATH` — OpenClaw 根目錄、執行檔與 `.env` 路徑
- `PROJECT_PATH` / `PLANS_DIR` — 專案根目錄與自主優化報告輸出路徑
- `AUTH_DISABLED` / `AUTH_USERNAME` / `AUTH_PASSWORD_HASH` / `AUTH_SESSION_SECRET` / `AUTH_SESSION_TTL_HOURS` — 後台登入與 session 設定
- `HUD_CONTROL_TOKEN` 或 `OPENCLAW_HUD_CONTROL_TOKEN` — 控制端點 bearer token，未設定時 `/api/control/*` 會回 `503 control_not_configured`
- `GEMINI_API_KEY` — 自主優化 pipeline 使用；未設定時會 fallback 讀取 OpenClaw `.env`
- `OPENCLAW_NOTIFY_CHANNEL` / `OPENCLAW_NOTIFY_TARGET` — 自主優化通知目標，預設為 Telegram

啟動時會先檢查 TLS 憑證、OpenClaw binary 與必要 auth 設定；若缺少必要檔案或設定，server 會直接拒絕啟動並輸出明確錯誤。

## 架構

```
src/
├── backend/
│   ├── controllers/    # dashboardReadController / controlController，legacy* 僅保留 compatibility wrapper
│   ├── routes/         # api.js — 所有 API 路由
│   ├── middlewares/    # session/control/origin/rate/audit/errorHandler
│   ├── security/       # threatIntel, adaptiveSecurity, compliance
│   └── services/       # dashboardPayloadService, historyService, sessionReadService, openclawClient, healthService
└── frontend/
    └── public/
        ├── index.html
        ├── css/        # style.css, theme.css, taskhub.css
        └── js/
            ├── state.js                # 前端共享狀態容器
            ├── stream-manager.js       # SSE / EventSource 共用封裝
            ├── api-client.js           # fetch / JSON / API error 共用封裝
            ├── app.js                  # 主邏輯（逐步拆分中）
            └── modules/
                ├── charts.js           # drawSparkline / drawBarChart / drawHBarChart
                ├── logs.js
                ├── chat.js
                ├── cron.js
                └── taskhub.js
tests/                  # Jest 測試，對應 src/backend/ 結構
```

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/read/dashboard` | 完整 dashboard payload |
| GET | `/api/read/stream` | SSE 即時推送 |
| GET | `/api/read/history` | 系統歷史 + 成本 + token 排行 |
| GET | `/api/read/liveness` | 程序存活檢查 |
| GET | `/api/read/readiness` | readiness 與 startup/dependency 狀態 |
| GET | `/api/read/dependencies` | 依賴檢查明細 |
| GET | `/api/agents/:id/sessions` | Agent sessions 列表 |
| GET | `/api/agents/:id/sessions/:sid` | Session 訊息內容 |
| GET | `/api/alerts/config` | 告警設定 |
| GET | `/api/taskhub/tasks` | TaskHub 任務列表 |
| POST | `/api/command` | 執行 openclaw 指令 |

## 開發流程

1. open GitHub issue
2. fix → push
3. 等 CI 通過
4. close issue

commit 格式：`feat(sN): <description>`（N = sprint 編號）

## 協作進度

- 目前重構進度與工作樹分工記錄在 [progress.md](/Users/openclaw/.openclaw/shared/projects/agent-monitor-web/progress.md)
- 建議 frontend 重構先在額外 worktree 做完再 cherry-pick 回 `main`

---

**最後更新**：2026-03-07
**狀態**：重構進行中，主線可運作

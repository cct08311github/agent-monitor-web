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

## 架構

```
src/
├── backend/
│   ├── controllers/    # legacyDashboardController (含 getSessions, getSessionContent)
│   ├── routes/         # api.js — 所有 API 路由
│   ├── middlewares/    # auth.js — localhostOnly, bearerToken, rateLimit, auditLog
│   ├── security/       # threatIntel, adaptiveSecurity, compliance
│   └── services/       # alertEngine, gatewayWatchdog, tsdbService, openclawService
└── frontend/
    └── public/
        ├── index.html
        ├── css/        # style.css, theme.css, taskhub.css
        └── js/
            ├── app.js                  # 主邏輯
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

---

**最後更新**：2026-03-04
**測試覆蓋**：340 tests，24 suites，全部通過
**狀態**：生產就緒

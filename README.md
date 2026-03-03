# OpenClaw Agent 監控系統 - 網頁版

即時監控所有 OpenClaw Agent 的狀態和任務執行情況，提供直觀的網頁界面。

## 主要功能

- **Agent 狀態監控** — 即時顯示每個 Agent 的在線/離線狀態，每 30 秒自動刷新
- **Agent 分組顯示** — 活躍 Agent 展開顯示，非活躍收合在 `<details>`
- **Live Log 串流** — SSE 即時串流 gateway logs，含篩選與 active filter 狀態
- **TaskHub** — 任務管理模組，支援欄位排序（priority / status / due date）、domain 欄自動隱藏、secondary actions dropdown
- **Chat Tab** — 可選 Agent 傳送訊息，隱藏 summary section
- **OpenClaw 版本顯示** — dashboard 顯示目前安裝版本
- **Cron 狀態** — 顯示定時任務狀態，不輸出 JSON dump 到 log stream
- **統計面板** — 系統整體狀態（總數 / 在線 / 離線 / 已配置）
- **響應式設計** — 支援電腦和手機瀏覽

## 快速開始

```bash
npm install
npm start
# → http://localhost:3000
```

## 測試

```bash
npm test
# jest --forceExit --detectOpenHandles
```

## 架構

```
src/
├── backend/
│   ├── controllers/    # Express 控制器
│   ├── routes/         # api.js — 所有 API 路由
│   ├── security/       # 安全/合規模組（修改前確認影響範圍）
│   └── services/       # alertEngine, gatewayWatchdog, openclawService, tsdbService
└── frontend/
    └── public/         # 純 HTML/CSS/JS（無框架）
tests/                  # Jest 測試，對應 src/backend/ 結構
```

## 資料來源

| 來源 | 用途 |
|------|------|
| `openclaw agents list` | Agent 列表 |
| `openclaw sessions list` | 當前 Sessions |
| `openclaw cron status` | 定時任務狀態 |
| `GET /api/logs/stream` (SSE) | 即時 log 串流 |

## 開發流程

1. open GitHub issue
2. fix → push
3. 等 CI 通過
4. close issue

commit 格式：`feat(sN): <description>`（N = sprint 編號）

---

**最後更新**：2026-03-04
**狀態**：生產就緒

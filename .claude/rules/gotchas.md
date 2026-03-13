# 關鍵注意事項（Gotchas）

開發前必讀的地雷與慣例：

- 不把 cron job JSON dump 輸出到 log stream
- 所有後端 API 走 `src/backend/routes/api.js`
- 現行 controller：`dashboardReadController.js` / `controlController.js`
- request id / structured log 由 `requestContext.js` / `requestLogger.js` 接管
- 安全/合規模組在 `src/backend/security/`，修改前確認影響範圍
- CSS：`agent-group-header`/`agent-grid-inner`/`agent-group-details` 需 `grid-column: 1/-1`
- Session JSONL：每行 `{type, message: {role, content[]}}`，`type=message` 才是對話
- `openclawService` 無 `listAgents()`，用 `getOpenClawData('openclaw agents list')`
- 多 agent 協作時先看 `progress.md`，frontend 優先在 worktree 上工作再 cherry-pick

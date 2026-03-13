# Agent Monitor Web

OpenClaw Agent 監控後台，Node.js + Express 後端 + 純 HTML/CSS/JS 前端。

## 專案使命

- 角色：OpenClaw 自主 AI Agent 與運維後台的監控、警報處理、維護與持續優化助手
- 階段：優化期（Auto-Memory Learning）
- 目標：可靠、持續進化的監控與運維助手

### 學習重點（長期模式辨識）

- 監控節奏與警報決策流程
- 任務拆解與維護優先級
- 輸出結構（健康摘要、警報細節、資源圖表）
- 系統變更與監控規則調整前的確認需求
- 對異常行為、資源波動、安全事件與 downtime 的反應

### Auto-Memory 原則

- 只記錄長期模式，不記一次性操作
- 不確定是否該記憶時，先詢問使用者
- 記憶目的：降低監控摩擦，非增加誤報風險

### 工作方式

- 先給結論，再給理由
- 偏實務、可執行
- 監控規則變更前先說明影響、風險與回滾方式

## 規則參考

詳細規則拆分至 `.claude/rules/`，Claude Code 會自動載入：

| 檔案 | 內容 |
|------|------|
| `workflow.md` | GitHub Issue + PR 流程、commit 格式、自動化規則 |
| `architecture.md` | Stack、目錄結構、前後端慣例、安全與測試 |
| `commands.md` | 啟動、重啟、快取清除指令 |
| `gotchas.md` | 關鍵注意事項與開發地雷 |

# Auto-Optimize Design
**Date**: 2026-03-05
**Status**: Approved

---

## 目標

在 agent-monitor-web 實作「自主優化」功能：系統每日收集運行數據，由 Sonnet 起草優化方案，Opus 獨立審查並提出改善建議，Sonnet 整合成完整報告，儲存至 `docs/plans/` 並推播 Telegram 摘要。

---

## 觸發方式

**手動觸發**：UI 按鈕（System tab）。按下後禁用按鈕防止重複執行，完成後恢復。

---

## 架構

```
UI Button
    │ GET /api/optimize/run (SSE)
    ▼
OptimizeController
    │
    ├─① 數據收集 (parallel)
    │   ├── tsdbService.getCostHistory()
    │   ├── tsdbService.getAgentActivitySummary()
    │   ├── alertEngine.getRecent(50)
    │   ├── openclawService.listSessions() (recent 3 days)
    │   └── fs.readdir(docs/plans/) → 已完成方案標題列表
    │
    ├─② Sonnet 起草 (claude-sonnet-4-6)
    │   prompt: 數據摘要 + 專案路徑 + 現有方案清單
    │   output: 優化草案 markdown
    │
    ├─③ Opus 審查 (claude-opus-4-6)
    │   prompt: 草案全文 + 專案路徑
    │   output: 問題清單 + 每項改善建議
    │
    ├─④ Sonnet 整合 (claude-sonnet-4-6)
    │   prompt: 草案 + Opus 審查意見
    │   output: 最終完整報告 markdown
    │
    ├─⑤ 儲存 docs/plans/YYYY-MM-DD-auto-optimize.md
    │
    └─⑥ Telegram 推播（摘要 + 檔案路徑）
```

---

## SSE 事件格式

```
event: progress  data: {"step": 1, "msg": "收集數據中..."}
event: progress  data: {"step": 2, "msg": "Sonnet 起草中..."}
event: progress  data: {"step": 3, "msg": "Opus 審查中..."}
event: progress  data: {"step": 4, "msg": "Sonnet 整合中..."}
event: progress  data: {"step": 5, "msg": "儲存報告..."}
event: progress  data: {"step": 6, "msg": "Telegram 推播..."}
event: done      data: {"file": "YYYY-MM-DD-auto-optimize.md", "summary": "..."}
event: error     data: {"msg": "..."}
```

---

## 新增 / 修改檔案

| 檔案 | 類型 | 職責 |
|------|------|------|
| `src/backend/services/optimizeService.js` | 新增 | 數據收集 + 3 次 Claude API 呼叫 + 儲存 |
| `src/backend/controllers/optimizeController.js` | 新增 | SSE endpoint handler |
| `src/backend/routes/api.js` | 修改 | 掛載 `GET /api/optimize/run` |
| `src/frontend/public/index.html` | 修改 | System tab 新增「🔍 執行自主優化」按鈕 |
| `src/frontend/public/js/app.js` | 修改 | 按鈕 handler + SSE 進度顯示邏輯 |
| `tests/optimizeService.test.js` | 新增 | mock Claude API + 三步流程驗證 |
| `tests/optimizeController.test.js` | 新增 | SSE 回應格式驗證 |

**環境變數**：`.env` 新增 `ANTHROPIC_API_KEY`

---

## Prompt 設計

所有呼叫都帶入：
```
專案路徑：/Users/openclaw/.openclaw/shared/projects/agent-monitor-web
分析日期：YYYY-MM-DD
```

### ① Sonnet 起草 (system prompt)
```
你是 agent-monitor-web 的系統分析師。
專案路徑：{PROJECT_PATH}
今日日期：{DATE}

根據以下運行數據，識別 3-5 個最值得優化的項目，每項包含：
- 問題描述（基於數據）
- 建議改善方向
- 預估影響

不要提出已在 {existing_plans} 中完成的項目。
輸出格式：markdown，有標題分節。
```

### ② Opus 審查 (system prompt)
```
你是獨立技術顧問，負責審查 agent-monitor-web 的優化草案。
專案路徑：{PROJECT_PATH}

對草案中每個優化項目，指出：
1. 邏輯不足或假設錯誤之處
2. 遺漏的風險或副作用
3. 具體改善建議

保持批判立場，不要為草案辯護。
```

### ③ Sonnet 整合 (system prompt)
```
你是 agent-monitor-web 的技術負責人。
專案路徑：{PROJECT_PATH}

將下列草案與 Opus 審查意見整合成最終優化方案：
- 採納 Opus 的合理修改
- 標註「[Opus 修訂]」的段落
- 每項優化附上：問題、建議、Opus補充、優先級（P0/P1/P2）
- 結尾附「實施順序建議」

輸出：完整 markdown，可直接存為實施計畫。
```

---

## UI 設計

**位置**：System tab 操作區（右上角，緊靠現有按鈕）

**按鈕狀態**：
- 預設：`🔍 執行自主優化`
- 執行中：spinner + 禁用
- 完成：`✅ 優化報告已生成：YYYY-MM-DD-auto-optimize.md` + `[在 Session Viewer 查看]` 連結

**進度顯示**：System tab 內展開進度列表，每步完成打勾。

---

## 錯誤處理

| 情境 | 處理 |
|------|------|
| `ANTHROPIC_API_KEY` 未設定 | 立即回傳錯誤，UI 顯示「請設定 ANTHROPIC_API_KEY」 |
| Opus 呼叫失敗 | 降級：用 Sonnet 草案繼續，標註「未經 Opus 審查」 |
| Telegram 推播失敗 | 不中斷流程，報告仍儲存，UI 顯示警告 |
| 執行中再次觸發 | 按鈕禁用，回傳 409 |

---

## 測試計畫

- `tests/optimizeService.test.js` — mock Anthropic SDK，驗證三步流程與降級邏輯
- `tests/optimizeController.test.js` — SSE 格式、409 重複觸發、error event

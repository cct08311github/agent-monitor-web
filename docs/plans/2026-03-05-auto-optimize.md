# Auto-Optimize Report — 2026-03-05
> 生成時間：2026-03-05T13:00:37.061Z

這是一份為 `agent-monitor-web` 專案整理的最終實施計畫報告，已將原始草案與 Opus 的審查意見進行深度整合，並梳理了 Code Review 結果。

---

# agent-monitor-web 技術優化與 QA 實施報告

## 第一章：優化建議

本章節基於系統運行數據（2026-03-05 11:54:00Z 至 12:57:00Z）進行分析。經 [Opus 修訂] 糾正前端與後端職責邊界後，制定以下 4 項核心優化方案。

### 1. [Opus 修訂] Agent 監控與未歸屬成本視覺化 (Unattributed Cost Visualization)
*   **問題**：`total_cost` 持續產生但 `agents` 為空。原草案誤以為是數據遺失並建議傳輸 `idle` 狀態，但這將導致 API Payload 暴增引發瀏覽器 OOM。這實際上是系統基礎設施產生的常駐成本。
*   **建議**：前端應在 UI 上實作「未歸屬成本（Unattributed Cost）」或「系統基礎成本」的分類。當 `total_cost` > 0 且 `agents` 為空時，圖表應清晰顯示這筆費用屬於基礎設施。
*   **Opus 補充**：
    *   **嚴禁**要求後端傳輸大量休眠 Agent 狀態。
    *   向後端團隊提出 API 變更需求，新增 `cost_breakdown` 欄位（區分 `agent_cost` 與 `system_cost`）以便圖表分層渲染。
*   **優先級**：**P1**

### 2. [Opus 修訂] 監控數據斷層處理與狀態對齊 (State Reconciliation & Gap Handling)
*   **問題**：數據出現 4 分鐘盲區。原草案建議在後端採集器加緩存，超出了 Web 前端範疇；且單純的重試機制會在斷線恢復時引發「驚群效應（Thundering Herd）」拖垮後端。
*   **建議**：前端引入指數退避（Exponential Backoff）重試機制。當 WebSockets 或 Polling 斷線恢復後，自動發起 `[last_received_time, current_time]` 的歷史區間查詢（Historical Fetch）以補齊缺口。
*   **Opus 補充**：在圖表 UI 呈現上，針對缺失資料的時段（Null values），必須渲染為「斷線」或使用「虛線/灰色陰影」標示，**嚴禁**在視覺上自動平滑連線插值（Interpolation），以免誤導使用者。
*   **優先級**：**P0**

### 3. [Opus 修訂] 成本異常視覺警示與配置介面 (Visual Cues for Cost Spikes)
*   **問題**：成本突增但警報未觸發。原草案建議由前端計算移動平均線並生成 Alert，這是嚴重的架構錯誤（關閉瀏覽器即失效），且低基數百分比計算易導致「告警疲勞」。
*   **建議**：Alert 的生成與發送必須由後端（如 Prometheus/Worker）全權負責。前端僅負責「強化視覺提示」，例如單分鐘成本觸及 UI 顯示閾值時，將圖表柱狀圖標為紅色或彈出 Toast。
*   **Opus 補充**：前端應開發一個配置表單介面，讓使用者可以設定「後端告警閾值（建議使用絕對值而非僅百分比）」，並將設定寫回後端。
*   **優先級**：**P1**

### 4. [Opus 修訂] 成本數值真實呈現與格式化規範 (Cost Formatting & Data Integrity)
*   **問題**：單次操作成本微幅增加（如 4.3367 -> 4.3779）。原草案誤判為浮點數精度遺失。這極大機率是真實的累計使用量（如 Token 或運算時間累積）。
*   **建議**：捨棄精度問題假設，應視為真實成本。在 `agent-monitor-web` 中建立全域的貨幣/成本格式化工具（使用 `Intl.NumberFormat`），固定顯示有效位數（如小數點後 4 位）。
*   **Opus 補充**：
    *   **嚴禁**前端私自實作四捨五入（Rounding）或截斷掩蓋漂移，以免監控儀表板與最終計費系統（Billing System）財務數字不符。
    *   UI 數值旁應增加 Hover Tooltip，顯示成本微增是因為「Compute Time」還是「Token Usage」，以解除使用者疑慮。
*   **優先級**：**P2**

---

### 💡 第一章實施順序建議
1. **[P0] 優先執行 項目 2**：完成前端斷線重連機制（指數退避）、歷史資料拉取（State Reconciliation）以及圖表斷層（Data Gap）的正確渲染，保障系統穩定性與數據真實性。
2. **[P1] 執行 項目 1 & 3**：與後端協調 API 規格（`cost_breakdown`），實作前端基礎成本分類視覺化、異常數值的 UI 標紅提示，以及開發後端閾值設定介面。
3. **[P2] 最後執行 項目 4**：導入全域數字格式化工具，並完善 UI Tooltip 細節，提升整體 UX 與計費透明度。

---
---

## 第二章：Code Review & QA

本章節針對 `agent-monitor-web` 的後端/BFF 原始碼進行安全與效能審查，並依嚴重程度降冪排序。

### P0：極高風險 (Critical) - 立即修復

*   **[SECURITY] Host 校驗存在繞過漏洞（Host Header Injection）**
    *   **檔案**：`src/backend/middlewares/auth.js`
    *   **問題**：`isAllowedHost` 使用 `startsWith` 驗證域名（如 `'localhost'` 匹配到 `localhost.evil.com`），可能導致 SSRF 或越權存取內部控制端點。
    *   **建議**：改用嚴格的字串相等比對（`===`）。對於 IP 網段，使用嚴謹的正規表達式（如 `/^192\.168\.\d+\.\d+$/`）精確匹配。
*   **[PERFORMANCE] SSE 連線未處理客戶端中斷，導致全域鎖死與資源浪費**
    *   **檔案**：`src/backend/controllers/optimizeController.js`
    *   **問題**：`run` 函數的 `isRunning` 互斥鎖在客戶端斷線或發生未捕捉例外時無法釋放，導致 LLM 額度持續消耗且 `/optimize/run` 端點永久鎖死。
    *   **建議**：監聽客戶端斷線事件 `req.on('close', ...)`，並觸發 `AbortController` 中止背景任務及釋放 `isRunning` 鎖。將資料收集與 LLM 請求改為支援 `AbortSignal`。

### P1：高風險 (High) - 排入本週 Sprint 修復

*   **[SECURITY] 使用 `exec` 執行指令存在 Command Injection 高風險**
    *   **檔案**：`src/backend/services/openclawService.js`
    *   **問題**：`getOpenClawData` 直接拼接字串交由 `child_process.exec` 執行。若未來引入外部變數將導致 RCE (遠端代碼執行) 漏洞。
    *   **建議**：改用 `child_process.execFile`，並將指令與參數陣列嚴格分離（例：`execFile('openclaw', args)`），杜絕 Shell 注入。
*   **[PERFORMANCE] 快取機制存在 Cache Stampede（快取雪崩）風險**
    *   **檔案**：`src/backend/services/openclawService.js`
    *   **問題**：快取過期且面臨大量併發請求時，所有請求會繞過快取同時觸發 `openclaw` shell 指令，導致 CPU 瞬間飆高。
    *   **建議**：實作 Promise Lock 機制。若更新快取的 Promise 正在進行，後續請求應等待該 Promise Resolve，而非各自發起新指令。
*   **[ERROR_HANDLING] 解析錯誤靜默吞掉，導致警告配置被重置清空**
    *   **檔案**：`src/backend/services/alertEngine.js`
    *   **問題**：`loadConfig()` 的 JSON 解析錯誤被靜默處理並返回預設值。下次觸發 `saveConfig()` 時會直接覆寫並銷毀原本只是語法寫錯的原始設定檔。
    *   **建議**：解析失敗應拋出錯誤或紀錄 Error Log 並阻止服務覆蓋檔案；若需容錯，應先將毀損檔案備份（如 `alert-config.json.bak`）。

### P2：中風險 (Medium) - 規劃於後續優化

*   **[BUG] IP 獲取邏輯在反向代理下失效**
    *   **檔案**：`src/backend/middlewares/auth.js`
    *   **問題**：直接讀取 `req.ip`，在 Nginx 等 Reverse Proxy 後方將永遠拿到 `127.0.0.1`，導致封鎖機制或地理分析失效。
    *   **建議**：優先讀取 `x-forwarded-for` Header，並在 Express 設置 `app.set('trust proxy', true)` 避免 Header 偽造。
*   *(註：檢測報告末端 `src/backend/services/optimizeService` 項目數據截斷，請開發團隊自行覆查該檔案之近期變更)*

---

### 🚨 必修清單（P0 項目 Check-list）
在下一次部署上線前，技術團隊**必須**完成以下事項的 PR 審核：
- [ ] 修復 `auth.js` 中的 `isAllowedHost` 邏輯，消除 Host Header Injection 風險。
- [ ] 在 `optimizeController.js` 實作 `req.on('close')` 監聽，並掛載 `AbortController` 確保釋放全域鎖 `isRunning`。
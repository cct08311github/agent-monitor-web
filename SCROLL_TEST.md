# 測試 Agent 詳情頁面文字截斷問題修復

## 問題描述
Issue #27: Agent 詳情頁面文字仍被截斷且無捲軸顯示。
Issue #14 修復後問題仍然存在。

## 根本原因分析
1. `.detail-card` 設置為 `display: flex; flex-direction: column;` 但缺少 `min-height: 0`，導致 flex 容器無法縮小。
2. `.detail-task-content` 設置了 `flex: 1` 和 `max-height: 300px`，但在 flex 佈局中，當父容器沒有固定高度時，`max-height` 可能被忽略。
3. `.detail-task-content` 的 `min-height: 40px` 阻止了元素縮小到小於內容的高度。

## 修復方案
已修改 `src/frontend/public/css/style.css`：

1. 為 `.detail-card` 添加 `min-height: 0`
2. 將 `.detail-task-content` 的 `min-height: 40px` 改為 `min-height: 0`
3. 將 `.detail-task-content` 的 `flex: 1` 明確為 `flex: 1 1 auto`

## 測試步驟
1. 啟動服務器：`npm start`
2. 訪問 https://localhost:3001
3. 點擊任何 Agent 進入詳情頁面
4. 觀察「目前任務」區域：
   - 當任務內容少於 300px 高度時，不顯示滾動條
   - 當任務內容超過 300px 高度時，自動顯示垂直滾動條
   - 文字應自動換行，不應被截斷

## 手動測試腳本
可以使用瀏覽器開發者工具模擬長內容：
```javascript
// 在瀏覽器控制台執行
document.querySelector('.detail-task-content').textContent = '長文字測試。'.repeat(200);
```
檢查元素是否出現滾動條（`overflow-y: auto` 生效）。

## 預期結果
- 長文字正確顯示滾動條
- 文字不被截斷，自動換行
- 佈局保持穩定，其他卡片不受影響

## 檔案變更
- `src/frontend/public/css/style.css` (lines 1068-1115)
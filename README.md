# OpenClaw Agent 監控系統 - 網頁版

## 🎯 功能概述
即時監控所有 OpenClaw Agent 的狀態和任務執行情況，提供直觀的網頁界面。

## ✨ 主要功能
- ✅ **實時狀態監控**：顯示每個 Agent 的在線/離線狀態
- ✅ **任務內容顯示**：查看每個 Agent 的當前執行任務
- ✅ **自動刷新**：每30秒自動更新數據
- ✅ **統計面板**：系統整體狀態一目了然
- ✅ **響應式設計**：支援電腦和手機瀏覽
- ✅ **本地部署**：僅在本地網絡訪問，安全可靠

## 🚀 快速開始

### 1. 安裝依賴
```bash
cd /Users/openclaw/.openclaw/shared/projects/agent-monitor-web
npm install
```

### 2. 啟動服務
```bash
npm start
```

### 3. 訪問監控系統
在瀏覽器中打開：http://localhost:3000

## 📊 監控內容

### Agent 狀態詳情
- **Agent 名稱**：顯示中文名稱和 ID
- **狀態**：在線（✅）/ 離線（❌）
- **最後活動時間**：最近一次活動的時間戳
- **當前任務**：正在執行的任務內容（截斷顯示）
- **Cron 任務**：定時任務的執行情況

### 系統統計
- **總 Agent 數**：所有已配置的 Agent
- **在線中**：當前活躍的 Agent 數量
- **離線中**：未運行的 Agent 數量
- **已配置**：完成配置的 Agent 數量

## ⚙️ 技術架構

### 前端
- **HTML/CSS/JavaScript**：純前端技術，無需編譯
- **響應式設計**：適應各種屏幕尺寸
- **自動刷新**：每30秒自動更新數據

### 後端
- **Node.js + Express**：輕量級伺服器
- **RESTful API**：提供數據接口
- **OpenClaw CLI 集成**：通過 CLI 命令獲取數據

### 數據來源
1. `openclaw agents list` - 獲取 Agent 列表
2. `openclaw sessions list` - 獲取當前 Session
3. `openclaw cron status` - 獲取定時任務狀態

## 🔧 配置選項

### 修改刷新頻率
在 `server.js` 中修改：
```javascript
// 自動刷新間隔（毫秒）
const REFRESH_INTERVAL = 30000; // 30秒
```

### 修改監控端口
在 `server.js` 中修改：
```javascript
const PORT = 3000; // 改為其他端口
```

## 🐛 故障排除

### 常見問題
1. **無法啟動服務**
   - 檢查 Node.js 是否安裝：`node --version`
   - 檢查端口是否被佔用：`lsof -i :3000`

2. **無法獲取 Agent 數據**
   - 檢查 OpenClaw 是否運行：`openclaw gateway status`
   - 檢查 CLI 命令權限

3. **頁面無法自動刷新**
   - 檢查瀏覽器 JavaScript 是否啟用
   - 檢查網絡連接

### 日誌查看
```bash
# 查看伺服器日誌
cd /Users/openclaw/.openclaw/shared/projects/agent-monitor-web
npm start 2>&1 | tee monitor.log
```

## 📈 未來擴展計劃

### Phase 2 (本週內)
- [ ] 任務歷史記錄查看
- [ ] Agent 性能指標監控
- [ ] 自定義警報規則
- [ ] 數據導出功能

### Phase 3 (下週)
- [ ] 協作關係可視化
- [ ] 學習進步追蹤
- [ ] 自動化報告生成
- [ ] 移動端應用

## 👥 開發團隊
- **專案負責人**：main (夥計)
- **前端開發**：creative (創意師)
- **後端開發**：coder (程式開發)
- **系統集成**：sre (系統維運)

## 📄 許可證
MIT License - 詳見 LICENSE 文件

---

**最後更新**：2026-02-18  
**版本**：v1.0.0  
**狀態**：✅ 生產就緒
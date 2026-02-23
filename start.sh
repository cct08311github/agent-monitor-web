#!/bin/bash

# OpenClaw Agent 監控系統啟動腳本
# 作者: OpenClaw Development Team
# 日期: 2026-02-18

echo "🚀 啟動 OpenClaw Agent 監控系統..."
echo "========================================"

# 檢查 Node.js 是否安裝
if ! command -v node &> /dev/null; then
    echo "❌ 錯誤: Node.js 未安裝"
    echo "請先安裝 Node.js: https://nodejs.org/"
    exit 1
fi

# 檢查 npm 是否安裝
if ! command -v npm &> /dev/null; then
    echo "❌ 錯誤: npm 未安裝"
    exit 1
fi

# 檢查當前目錄
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "📁 工作目錄: $(pwd)"

# 檢查 package.json
if [ ! -f "package.json" ]; then
    echo "❌ 錯誤: package.json 不存在"
    exit 1
fi

# 檢查 node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 安裝依賴包..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ 錯誤: 依賴安裝失敗"
        exit 1
    fi
    echo "✅ 依賴安裝完成"
else
    echo "✅ 依賴已安裝"
fi

# 檢查 server.js
if [ ! -f "server.js" ]; then
    echo "❌ 錯誤: server.js 不存在"
    exit 1
fi

# 檢查端口是否被佔用
PORT=3001
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  警告: 端口 $PORT 已被佔用"
    echo "嘗試關閉現有進程..."
    lsof -ti:$PORT | xargs kill -9 2>/dev/null
    sleep 2
fi

# 啟動服務
echo "🚀 啟動監控服務..."
echo "----------------------------------------"
echo "🌐 監控地址: http://localhost:$PORT"
echo "🔄 自動刷新: 每30秒"
echo "📊 監控對象: 所有 OpenClaw Agent"
echo "⏰ 啟動時間: $(date '+%Y-%m-%d %H:%M:%S')"
echo "----------------------------------------"
echo ""
echo "📝 操作說明:"
echo "1. 保持此終端窗口開啟"
echo "2. 在瀏覽器打開以上地址"
echo "3. 按 Ctrl+C 停止服務"
echo ""
echo "✅ 服務啟動中..."

# 啟動 Node.js 服務
npm start

# 服務停止後
echo ""
echo "----------------------------------------"
echo "🛑 監控服務已停止"
echo "停止時間: $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
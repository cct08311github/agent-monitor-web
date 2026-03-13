# Commands & Startup

## 啟動

- `npm start` → https://localhost:3001 (HTTPS，需 mkcert 憑證在 `./cert/`)
- `npm test` → jest --forceExit --detectOpenHandles

## 重啟服務

```bash
pkill -f "node server.js" && npm start &
```

## 版本快取清除

前端 JS 使用 `?v=YYYYMMDD` 查詢參數，改動後需更新日期並 Cmd+Shift+R 強制刷新。

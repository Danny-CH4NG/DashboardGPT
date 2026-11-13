# dashboard-service

新竹站數位孿生儀表板（POC）。可獨立部署，不依賴 chat-service。

```bash
npm install
npm run dev        # API :4100 + Vite :5173
# 或
npx vite build && npm start   # 單一埠 :4100
```

| 環境變數 | 預設 | 說明 |
|---|---|---|
| `PORT` | 4100 | |
| `DATA_FILE` | `data/db.json` | JSON 儲存（首次啟動自動寫入種子資料） |
| `ALLOWED_ORIGINS` | `http://localhost:4200,http://localhost:5173` | 允許呼叫 API 的來源（chat-service） |
| `FRAME_ANCESTORS` | `'self' http://localhost:4200 …` | 允許以 iframe 嵌入 `/embed/*` 的頁面 |
| `CHAT_WIDGET_URL` | （空） | chat-service 的 `widget.js`；不設就沒有聊天視窗 |
| `VITE_BASEMAP_TILES` | Carto dark | 建置時指定底圖瓦片 URL |

結構：`shared/schema.ts` 是元件格式的唯一來源（zod），`server/` 為 REST + SSE（M3 加 MCP），`web/` 為 React 前端。

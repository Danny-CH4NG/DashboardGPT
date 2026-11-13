# dashboard-service

新竹站數位孿生儀表板（POC）。可獨立部署，不依賴 chat-service。

```bash
npm install
npm run build      # 前端 → dist/，同時產生 dist/component-manifest.json
npm start          # :4100（設定放 .env，見 .env.example）
npm run dev        # 開發：API :4100 + Vite :5173，manifest 即時由 Vite 產生
npm test
```

## 元件由前端定義

```
web/src/catalog/
  _shared/define.ts      defineComponent()、共用 options
  _shared/rules.ts       跨欄位規則（JSON Schema 表達不了的，例如「數列長度 = x 長度」）
  _shared/chart.tsx      圖表共用工具（ECharts 包裝、配色）
  envelope.ts            所有元件共通的外層：id、標題、說明、grid 大小
  <type>/definition.ts   資料格式（zod）、options、rules、範例、預設大小
  <type>/Renderer.tsx    怎麼畫
  definitions.ts         所有 definition 的清單 → 用來產生 manifest
  index.ts               definition + Renderer 的對照 → 頁面使用
  manifest.ts            產生 component-manifest.json
```

### 新增一種元件

1. 建 `web/src/catalog/<type>/definition.ts`（用 `defineComponent`）和 `Renderer.tsx`。
2. 在 `definitions.ts` 與 `index.ts` 各加一行。
3. `npm run build`（或 dev 模式直接生效）。

後端不用改：它會在 30 秒內（或 `POST /api/manifest/reload`）讀到新的 manifest，MCP 的 `list_component_types`、`get_component_schema`、格式檢查就會包含新類型，AI 助理也就能用它產生元件。

### manifest 怎麼交給後端

後端從下列來源讀取，並每 `MANIFEST_REFRESH_SECONDS`（預設 30）秒重新讀取；新版有問題時保留舊版：

| 情境 | 設定 |
|---|---|
| 前後端一起部署（預設） | `MANIFEST_FILE`，預設 `dist/component-manifest.json` |
| 前端另外部署（CDN 等） | `MANIFEST_URL=https://<前端>/component-manifest.json` |
| CI 產出檔案 | `npm run manifest -- <輸出路徑>` |

`GET /api/manifest/status` 可看目前載入的版本與來源。存下來的元件會記錄產生時的 manifest 版本（`source.manifestVersion`）；每種元件也有自己的 `version`，資料格式不相容時遞增。

跨欄位規則（`rules`）在前端（zod refine）與後端（`server/rules.ts`）各有一份同語意的實作，`server/test/rules.test.ts` 確保兩邊結果一致。

## 環境變數

| 變數 | 預設 | 說明 |
|---|---|---|
| `PORT` | 4100 | |
| `DATA_FILE` | `data/db.json` | JSON 儲存（首次啟動自動寫入種子資料） |
| `PUBLIC_URL` | `http://localhost:4100` | 瀏覽器連到 dashboard 的網址（用於預覽連結） |
| `MANIFEST_URL` / `MANIFEST_FILE` | — / `dist/component-manifest.json` | 見上方 |
| `MANIFEST_REFRESH_SECONDS` | 30 | |
| `ALLOWED_ORIGINS` | `http://localhost:4200,http://localhost:5173` | 允許呼叫 API 的來源 |
| `FRAME_ANCESTORS` | `'self' http://localhost:4200 …` | 允許以 iframe 嵌入 `/embed/*` 的頁面 |
| `CHAT_WIDGET_URL` | （空） | chat-service 的 `widget.js`；不設就沒有聊天視窗 |
| `VITE_BASEMAP_TILES` | Carto dark | build 時指定底圖瓦片 URL |

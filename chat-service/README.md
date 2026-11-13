# chat-service

AI 元件助理：把使用者貼上的資料做成 dashboard 元件。可獨立部署；與 dashboard 的唯一連結是 **MCP**（`DASHBOARD_MCP_URL`）以及 dashboard 渲染的預覽 iframe。

```bash
npm install
npx vite build            # 產生 dist/widget.js
ANTHROPIC_API_KEY=... npm start   # :4200；獨立測試頁 http://localhost:4200/demo/
```

| 環境變數 | 預設 | 說明 |
|---|---|---|
| `PORT` | 4200 | |
| `ANTHROPIC_API_KEY` | （沒有時讀 `CLAUDE_KEY`） | Claude API key |
| `ANTHROPIC_API_BASE` | `https://api.anthropic.com` | 明確指定，避免被其他 `ANTHROPIC_BASE_URL` 影響 |
| `CLAUDE_MODEL` / `CLAUDE_EFFORT` | `claude-sonnet-5-5` / `medium` | |
| `DASHBOARD_MCP_URL` | `http://localhost:4100/mcp` | dashboard 的 MCP 端點 |
| `ALLOWED_ORIGINS` | `http://localhost:4100,…` | 嵌入 widget 的頁面來源 |

## 嵌入方式

```html
<script type="module" src="https://chat.example.com/widget.js"></script>
<dashboard-chat></dashboard-chat>
```
widget 是 Shadow DOM 的 Web Component，`position: fixed` 疊在宿主頁面上，不影響版面；API 位址取自 `widget.js` 的來源。dashboard 設定 `CHAT_WIDGET_URL` 時會自動做這件事。

## 架構

- `server/agent.ts`：單純的 Claude tool-use 迴圈（不用 LangGraph）。流程是線性的，唯一分支「資料有問題 → 問使用者」由驗證結果決定。對話狀態存在記憶體（2 小時過期）。
- `server/dashboard.ts`：MCP client；工具定義在執行期從 dashboard 取得，轉成 Claude tools。
- `server/table.ts`：貼上表格（Excel TSV / CSV / Markdown）的確定性解析與問題偵測，結果附在使用者訊息旁給模型。
- `server/prompt.ts`：系統提示與各元件的資料格式提示。
- `widget/`：React 介面（模板選擇 → 對話 → 預覽 → 存到 Dashboard → 放到頁面）。
- 「存到 Dashboard」「放到頁面」是按鈕直接呼叫 MCP，不經過模型。

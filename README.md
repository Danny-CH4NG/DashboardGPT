# DashboardGPT POC

驗證「Dashboard + AI 聊天視窗」的組合，兩者是**獨立部署、執行期互不依賴**的服務。計畫與設計決策見 [`docs/PLAN.md`](docs/PLAN.md)。

| 服務 | 埠 | 內容 |
|---|---|---|
| [`dashboard-service`](dashboard-service/) | 4100 | 新竹站數位孿生儀表板（地圖底圖＋3D 站體、可替換元件）、REST、**MCP Server** |
| [`chat-service`](chat-service/) | 4200 | AI 元件助理（Claude Sonnet 5.5，effort medium）、可嵌入的 `widget.js` |

```
瀏覽器 ── dashboard 頁面 ──(載入，可選)── chat widget.js
                │                          │
         REST/SSE│                          │REST + SSE 串流
                ▼                          ▼
        dashboard-service ◀──── MCP ──── chat-service ──▶ Claude API
```

## 本機執行

```bash
cd dashboard-service && npm install && npx vite build
CHAT_WIDGET_URL=http://localhost:4200/widget.js npm start
```

```bash
cd chat-service && npm install && npx vite build
ANTHROPIC_API_KEY=sk-... npm start
```

打開 http://localhost:4100 ，右下角是 AI 元件助理。

或用 Docker：

```bash
ANTHROPIC_API_KEY=sk-... docker compose up --build
```

## 測試

```bash
cd dashboard-service && npm test     # MCP 工具整合測試
```

```bash
cd chat-service && npm test          # 貼上表格解析
```

```bash
node e2e/full-flow.cjs               # 兩個服務都啟動後的瀏覽器端到端流程（會呼叫 Claude API）
```

## 獨立性

- 不設 `CHAT_WIDGET_URL`，或 chat-service 掛掉：dashboard 照常運作，只是沒有聊天視窗。
- dashboard 掛掉：chat-service 照常啟動，widget 顯示「無法連線到 Dashboard 服務」並可重試。
- 兩者之間沒有共用程式碼：元件格式由 dashboard 在執行期透過 MCP（`get_component_schema`）提供。

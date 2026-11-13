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

需要 Node.js 22（最低 20.12）。

### Windows（PowerShell）

```powershell
.\start.ps1
```

第一次執行會詢問 Anthropic API key（輸入時不顯示），並存到 `chat-service\.env`（不會進 git）。接著會安裝、build，在兩個視窗分別啟動兩個服務，最後打開 http://localhost:4100 。之後可以用 `.\start.ps1 -SkipInstall` 跳過安裝。

如果系統擋下腳本執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

### macOS / Linux，或手動啟動

設定都放在各服務資料夾的 `.env`（參考 `.env.example`），不用在命令列設定環境變數，所以 PowerShell、cmd、bash 都能用同樣的指令：

```bash
cd chat-service && npm install && npm run build && npm start
```

```bash
cd dashboard-service && npm install && npm run build && npm start
```

`chat-service/.env` 至少要有 `ANTHROPIC_API_KEY=...`；`dashboard-service/.env` 要有 `CHAT_WIDGET_URL=http://localhost:4200/widget.js` 才會出現聊天視窗。

### Docker

```bash
ANTHROPIC_API_KEY=sk-... docker compose up --build
```

## 測試

```bash
cd dashboard-service && npm test     # MCP／manifest 整合測試、前後端規則一致性
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

## 元件由前端定義（component manifest）

每種元件在 `dashboard-service/web/src/catalog/<type>/` 一個資料夾：`definition.ts`（資料格式、options、跨欄位規則、範例）與 `Renderer.tsx`（怎麼畫）。前端 build 時產生 `component-manifest.json`，dashboard 後端的格式檢查與 MCP 工具都依它運作，**後端沒有任何元件專屬的程式**。新增元件類型只要改前端，見 [`dashboard-service/README.md`](dashboard-service/README.md)。

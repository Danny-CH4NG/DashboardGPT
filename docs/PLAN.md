# DashboardGPT POC 實作計畫

> 目標：驗證「Dashboard + AI 聊天視窗」的組合，兩者為**獨立部署、執行期互不依賴**的服務。
> 參考概念：新竹站數位孿生 3D 儀表板白板（頂部 KPI 列｜中央 3D 站體｜右側向內微斜儀表｜左下反向微斜補充區）。

---

## 0. 關鍵決策（先講結論）

| 議題 | 決定 | 理由 |
|---|---|---|
| 服務切分 | `dashboard-service`、`chat-service` 兩個獨立專案，各自 `package.json`、`Dockerfile`、`.env` | 需求明確要求獨立部署 |
| 兩者的契約 | **Dashboard 對外提供 MCP Server**（Streamable HTTP）；chat 只認一個 `DASHBOARD_MCP_URL` | 「類似 MCP 的方式」直接用真 MCP；component schema 在執行期由 dashboard 提供，chat **沒有任何程式碼層級的共用依賴** |
| 單純 agent 或 LangGraph | **單純 agent（Claude tool-use loop）＋ 前端控制的流程階段**，不用 LangGraph | 流程是線性的（選模板 → 給資料 → 驗證 → 修正 → 渲染 → 儲存），分支只有「資料有問題 → 問使用者」，這由 tool 回傳的驗證結果驅動即可；LangGraph 的 checkpoint／多節點圖在此 POC 是額外複雜度。「選模板」是 UI 步驟，不經 LLM |
| 模型 | `claude-sonnet-5-5`，`output_config: { effort: "medium" }`，adaptive thinking（預設） | 依需求；注意此模型不支援強制 `tool_choice: any/tool`，改用 `auto` + `strict: true` |
| 語言 | 兩邊都用 TypeScript（Node 22） | 前後端同語言、zod → JSON Schema 可直接產出 MCP 工具 schema |
| 渲染 | **只有 dashboard 會渲染 component**；chat 預覽時用 iframe 嵌 dashboard 的 `/embed/preview/:draftId` | 避免兩套渲染器、確保「chat 看到的 = dashboard 上的」 |
| 圖表庫 | ECharts（`echarts-for-react`） | 圖表種類齊、深色科技風容易調 |
| 3D 站體 | **MapLibre GL 地圖底圖 + `fill-extrusion` 簡易幾何**（站體、月台、軌道、熱區），以新竹站座標為中心，可旋轉/傾斜/縮放 | 需求：簡單幾何 + 地圖當底圖；同一個引擎同時處理地圖與 3D，免 three.js 與地圖對位。底圖用免金鑰的 Carto dark 瓦片，載入失敗時退回深色格線底 |
| 儲存 | dashboard-service 用 JSON 檔（`data/*.json`） | 已確認 |
| 模板定義 | **模板 = 單一元件**（type + 預設樣式 + 範例資料） | 已確認 |
| 資料輸入 | **只支援貼上文字或表格**（CSV/TSV/Markdown 表格/從 Excel 複製的 tab 分隔） | 已確認；不做檔案上傳 |
| API key | chat-service 讀 `ANTHROPIC_API_KEY`，未設時退回 `CLAUDE_KEY` | 已確認 |

---

## 1. 整體架構

```
┌──────────────────────── 瀏覽器 ────────────────────────┐
│  Dashboard SPA (dashboard-service 提供)                │
│   ├─ Layout: TopBar / Left / Center(3D) / Right        │
│   ├─ ComponentFrame × N（標題/說明/放大/替換）         │
│   └─ <script src="${CHAT_URL}/widget.js"> (可選)       │
│        └─ Chat Widget（Shadow DOM，右下角 FAB → 浮層）  │
│             └─ iframe: ${DASHBOARD_URL}/embed/preview  │
└────────────────────────────────────────────────────────┘
        │ REST + SSE                     │ REST + SSE(串流)
        ▼                                ▼
┌──────────────────────┐   MCP (HTTP)  ┌──────────────────────┐
│ dashboard-service    │◀──────────────│ chat-service         │
│ - REST API (layout,  │               │ - Agent loop          │
│   library, drafts)   │               │   (Anthropic SDK)     │
│ - MCP Server         │               │ - MCP client          │
│ - SSE: layout 變更   │               │ - 貼上資料解析        │
│ - JSON 檔儲存        │               │ - widget.js 靜態檔    │
└──────────────────────┘               └──────────────────────┘
                                                │
                                                ▼
                                       Anthropic API (Sonnet 5.5)
```

**獨立性保證**
- Dashboard 不載入 widget（未設 `CHAT_WIDGET_URL` 或 chat 掛掉）→ 照常運作，只少了浮層。
- Chat 連不到 MCP → widget 顯示「Dashboard 服務無法連線」，不會崩。
- 兩者只透過 **MCP（工具＋schema）** 與 **iframe URL** 互動；CORS 白名單用 env 設定。

### Repo 結構

```
/dashboard-service
  /server        Fastify：REST、SSE、MCP server、JSON 儲存
  /web           Vite + React：頁面、ComponentFrame、renderer registry、/embed/preview
  /schema        zod 定義（ComponentSpec、各 type 的 data schema）← 唯一真相來源
  Dockerfile
/chat-service
  /server        Fastify：/api/chat (SSE)、/api/upload、agent loop、MCP client
  /widget        Vite 打包成單一 widget.js（Web Component + Shadow DOM）
  Dockerfile
docker-compose.yml   ← 只是本機一起跑的便利，不代表耦合
```

---

## 2. Component 模型（Dashboard 需求 2、3）

### 2.1 ComponentSpec（共通外層 + 內層）

```ts
type ComponentSpec = {
  id: string;
  type: "kpi" | "kpi-chips" | "line" | "bar" | "donut" | "gauge" | "status-list" | "ticker";
  title: string;                 // 外層：標題
  description?: string;          // 外層：說明（? 按鈕 popover）
  grid: { colSpan: 1-12; rowSpan: 1-6 };  // 外層：在所屬區域 grid 中佔的大小（參數調整）
  data: unknown;                 // 內層：依 type 驗證（見 2.3）
  options?: { unit?: string; thresholds?: …; colorScheme?: … };
  source?: { kind: "builtin" | "ai"; createdAt: string; templateId?: string };
};
```

### 2.2 外層 `ComponentFrame`（所有 component 共用）
- Header：標題、`?` 說明 popover、`⤢` 放大（全螢幕 modal，內層 renderer 以大尺寸重繪）、`⋯` 選單（替換 / 重設）。
- 由 `grid.colSpan/rowSpan` 轉成 CSS `grid-column: span N; grid-row: span M`。
- 錯誤邊界：內層 data 驗證失敗時顯示錯誤卡，不影響其他 component。

### 2.3 內層 renderer registry（圖表或數字）
| type | data 形狀 | 對應白板位置 |
|---|---|---|
| `kpi` | `{ value, unit?, delta?, status? }` | 左上「營運正常」環、單一數字 |
| `kpi-chips` | `[{ label, value, status? }]` | 頂部列 KPI 晶片 |
| `line` | `{ x: string[], series: [{ name, values: number[] }] }` | 即時人流（進／出站） |
| `bar` | 同 line | 月台擁擠度 |
| `gauge` | `{ value, min, max, unit }` | 列車準點率 |
| `donut` | `[{ name, value }]` | 設備狀態 |
| `status-list` | `[{ label, level, time? }]` | 告警 |
| `ticker` | `{ items: string[] }` | 左下跑馬燈 |

POC 至少落地 5 種（kpi、line、bar、gauge、donut），滿足「至少三個 component」且有數字＋圖表兩類。

### 2.4 頁面版面（對應參考概念）
- `TopBar`：站名、時間天氣、`kpi-chips` slot。
- `Left`：`kpi`（營運狀態環）＋左下補充區（`transform: perspective(1200px) rotateY(8deg)`）。
- `Center`：3D 站體（R3F），熱區/告警點可點擊 → 高亮右側對應 component。
- `Right`：12 欄 CSS grid、`perspective(1200px) rotateY(-8deg)`，主 KPI component 放這裡。
- 版面設定 `layout.json`：`{ zones: { right: { slots: [{ slotId, componentId }] }, … } }`。

---

## 3. 「類似 MCP」的 component 介面（Dashboard 需求 4）

dashboard-service 以 `@modelcontextprotocol/sdk` 提供 MCP Server（`/mcp`）：

| Tool | 用途 |
|---|---|
| `list_component_types` | 回傳所有 type、用途說明、適用資料特徵（時間序列/類別占比/單值…） |
| `get_component_schema(type)` | 回傳該 type 的 JSON Schema（由 zod 產生）與範例 |
| `list_templates` | 回傳可用模板（內建預設 + 圖庫中已存的 component） |
| `get_template(id)` | 取得模板完整 spec（含 sample data） |
| `validate_component(spec)` | 驗證 spec，回傳 `{ ok, errors: [{ path, message, hint }] }` |
| `create_draft(spec)` | 存成草稿，回傳 `previewUrl`（`/embed/preview/:draftId`） |
| `save_to_library(draftId, name)` | 草稿轉正式模板，進入 dashboard 圖庫 |
| `apply_to_slot(componentId, slotId)` | 直接替換頁面上某個 slot（可選，需使用者在 UI 確認） |
| `list_slots` | 目前頁面 slot 與其 component，供「替換哪一個」使用 |

另提供 MCP **resources**：`dashboard://layout`、`dashboard://component-types`。

同一套邏輯也開 REST（`/api/...`）給 dashboard 自己的前端用；MCP 只是包一層。

---

## 4. Component 替換（Dashboard 需求 5、AI 需求 10）
1. 每個 `ComponentFrame` 的 `⋯ → 替換` 開啟「圖庫」側欄：分頁「內建」「AI 生成」。
2. 選取 → 預覽 → 確認 → `PUT /api/layout/slots/:slotId` → 重新渲染。
3. 新的 `grid` 尺寸沿用目標 slot 或使用 component 自帶尺寸（選項）。
4. AI 生成的 component 經 `save_to_library` 後，透過 SSE `library.updated` 即時出現在圖庫。

---

## 5. AI 聊天視窗

### 5.1 形式（需求 1、4）
- `widget.js` 註冊 `<dashboard-chat>` Web Component，Shadow DOM 隔離樣式。
- 預設：右下角圓形 FAB（含縮圖/未讀點）。點擊 → 右側浮層面板（`position: fixed`，寬 420px，高 100vh−32px，z-index 最高），**疊在 dashboard 上、不擠壓版面**；可再點「⤢」放大成 70vw。

### 5.2 對話流程（需求 5–9）
```
[開啟] → 步驟1 選模板（UI 卡片，不經 LLM）
          ├─ Dashboard 模板（MCP list_templates）
          └─ 空白模板
       → 步驟2 提供資料：貼上文字或表格（不支援上傳檔案）
       → 步驟3 Agent 解析
          ├─ 後端先做確定性解析（papaparse：CSV/TSV/Markdown 表格）→ 欄位、型別、筆數摘要
          ├─ 空白模板：Agent 依資料特徵 + list_component_types 選 type（說明理由）
          ├─ Agent 對應欄位 → 產生 spec → validate_component
          └─ 驗證失敗或資料語意有疑慮 → 向使用者說明「哪一欄/哪幾列、什麼問題」，
             提供選項：補充資料 / 刪除該列或欄 / 讓 AI 用建議方式處理
       → 步驟4 OK → create_draft → 在聊天內以 iframe 顯示 dashboard 渲染的預覽
       → 步驟5 使用者可微調（標題、說明、grid 大小、顏色）→ 再預覽
       → 步驟6「存到 Dashboard」→ save_to_library（可選「立即替換某個 slot」）
```

### 5.3 資料問題檢查（需求 8）
確定性檢查（程式）＋語意檢查（LLM）：
- 缺值、非數字、日期格式不一、x 與 series 長度不一致
- 類別過多（donut > 8 類建議合併）、負值放進 gauge/donut、單位混用
- 重複時間點、資料量過少（line < 2 點）
回覆格式固定：問題清單（位置 + 原因）＋ 建議動作按鈕。

### 5.4 Agent 實作
- `@anthropic-ai/sdk`，`client.messages.stream({ model: "claude-sonnet-5-5", output_config: { effort: "medium" }, tools, messages })`，自己寫 tool loop（方便插入 UI 事件，例如「已產生預覽」）。
- Tools = MCP 工具（自動轉成 Claude tool 定義）＋ 本地工具 `inspect_pasted_data(dataId)`。
- `tool_choice: auto` + `strict: true`；串流回前端用 SSE。
- 開啟 refusal fallback（`fallbacks: "default"`，beta header），處理 `stop_reason: "refusal"`。
- 對話狀態存在 chat-service 記憶體（`sessionId` → messages、目前模板、目前 draftId）。
- API key：`process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_KEY`，並明確指定 `baseURL`（`ANTHROPIC_API_BASE`，預設官方端點），避免環境中其他 `ANTHROPIC_BASE_URL` 干擾。

---

## 6. 里程碑

| # | 內容 | 驗收 |
|---|---|---|
| M1 | dashboard-service 骨架：zod schema、ComponentFrame、5 種 renderer、參考概念版面（含地圖底圖 + 3D 站體）、layout.json | 頁面呈現 ≥5 個 component；改 `grid` 參數尺寸會變；放大/說明可用 |
| M2 | 替換功能 + 圖庫 + REST + SSE | 從圖庫替換任一 slot 成功並持久化 |
| M3 | MCP Server（第 3 節工具）+ `/embed/preview/:draftId` | 用 MCP Inspector 呼叫各工具成功；validate 回傳可讀錯誤 |
| M4 | chat-service：widget（FAB/浮層）、模板選擇、貼上資料解析、agent loop、SSE 串流 | 兩服務分開啟動；關掉 chat，dashboard 正常 |
| M5 | 端到端：空白模板 + 有問題資料 → AI 指出問題 → 修正 → 預覽 → 存檔 → 在 dashboard 替換 | 依第 7 節情境全部通過 |
| M6 | 熱區與元件連動、各自 Dockerfile、README | `docker compose up` 與單獨 `docker run` 皆可 |

---

## 7. 驗收情境（E2E，Playwright）
1. 選「即時人流」模板，貼上正確表格 → 預覽為折線圖 → 存檔 → 替換右上 slot。
2. 選空白模板，貼上「設備狀態占比」→ AI 選 donut 並說明理由。
3. 貼上含缺值與文字數字混雜的 CSV → AI 列出第幾列哪一欄有問題，要求補充或刪除；使用者選「刪除」→ 成功渲染。
4. 停掉 chat-service → dashboard 全功能正常；停掉 dashboard → widget 顯示無法連線。

## 8. 風險
- **iframe 跨網域預覽**：需 dashboard 設 `frame-ancestors` 白名單（env）。
- **LLM 產生的 spec 不合法**：一律經 `validate_component`，失敗回饋給 agent 重試（上限 2 次）再交給使用者。
- **3D 效能**：POC 只用低面數幾何，不載入外部模型。

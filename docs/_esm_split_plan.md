# 04_web/index.html ESM Module 拆檔設計

> 報告 1 #2 設計文件。本檔記錄拆檔方案與步驟,留待專屬 session 執行(預估 4-8 小時)。

---

## 動機

`04_web/index.html` 目前 5430 行單檔,所有 JS / CSS 內嵌。問題:
- 維護門檻高,新進者難找對應位置
- diff 噪音大,改一處可能影響其他段
- IDE 跳轉支援差(無 module 邊界)
- 重複代碼難抽出(如 `renderRateTableHtml` 與 `renderInsuranceWidget` 都靠近彼此但耦合度高)

---

## 目標檔案結構

```
04_web/
├── index.html              # 只剩 HTML 骨架 + <link>/<script type="module"> + footer
├── assets-v2/
│   ├── styles/
│   │   ├── tokens.css      # :root 變數(馬卡龍 7 色 + 字體 + 間距)
│   │   ├── base.css        # body / topnav / .app / .main / 全域 reset
│   │   ├── cards.css       # .card, .card-summary, .card-tags
│   │   ├── drawer.css      # .drawer, .drawer-meta, .drawer-actions
│   │   ├── scenarios.css   # .sc-*, .scope-banner
│   │   ├── widgets.css     # .ins-widget, .calc-*, .rt-*, .compare-*
│   │   └── responsive.css  # @media (max-width: 720px) 全部
│   └── js/
│       ├── main.js         # entry: init() + switchView() + 全域 state
│       ├── data.js         # loadAllData() + DATA / SCENARIOS / SYNONYMS / etc.
│       ├── filter.js       # filteredData() + setFilter() + expandSynonyms()
│       ├── renderer/
│       │   ├── cards.js    # renderCards() + renderCardRow()
│       │   ├── drawer.js   # openDrawer() + closeDrawer() + drawer-nav
│       │   ├── scenarios.js # renderScenarios() + renderScenarioChips()
│       │   ├── scope-banner.js # renderScopeBanner() — caveats / example / template
│       │   ├── rate-table.js # renderRateTableHtml() + LOOKUP_TYPE_RENDERERS
│       │   ├── insurance.js  # 抽出 LOOKUP_TYPE_RENDERERS.insurance 與 wirer
│       │   ├── flow-modal.js # openFlowModal() + state machine
│       │   ├── compare.js    # 並排比較 modal
│       │   ├── breadcrumb.js # 麵包屑
│       │   └── spotlight.js  # ⌘K overlay
│       ├── calc/
│       │   ├── living.js   # 日支生活費 widget + lookupLiving()
│       │   ├── insurance.js # 保險費 widget(若不在 renderer/ 裡)
│       │   └── currency.js  # 匯率轉換
│       ├── helpers/
│       │   ├── highlight.js # highlightTerms()
│       │   ├── dom.js      # 共用 DOM helper
│       │   └── markdown.js # renderMarkdown()
│       └── data/
│           ├── lookup.js   # rate_lookup 整合 + city / neighbor fallback
│           └── synonyms.js # SYNONYMS / SYNONYM_INDEX 操作
```

---

## 拆檔順序(low-risk → high-risk)

### Phase 1 — CSS 拆出(低風險,純樣式)

1. 把 `<style>` 內 token 區塊抽到 `assets-v2/styles/tokens.css`
2. base / cards / drawer / scenarios / widgets / responsive 各抽一檔
3. `index.html` 改成 `<link rel="stylesheet" href="assets-v2/styles/tokens.css">` 等
4. **驗證**:preview reload,所有畫面樣式不變

### Phase 2 — 資料層拆出(中風險)

1. `data.js` — 抽 `loadAllData` + 全域變數宣告 (DATA, SCENARIOS, ...)
2. `filter.js` — 抽 `filteredData`、`setFilter`、`expandSynonyms`
3. **驗證**:資料載入正常,過濾邏輯不變

### Phase 3 — Renderer 拆出(中風險)

按依賴順序:
1. `cards.js` — 卡片網格(被多處呼叫,先抽)
2. `drawer.js` — 抽屜載入
3. `scenarios.js` + `scope-banner.js` — 情境視圖
4. `rate-table.js` — 費率表(含 LOOKUP_TYPE_RENDERERS 已抽出的好基礎)
5. `flow-modal.js` — 條件問答
6. `compare.js` + `breadcrumb.js` + `spotlight.js`
7. **驗證**:每個 renderer 獨立後逐一 preview 測試

### Phase 4 — 計算層 + Helpers(低風險)

抽 `calc/` + `helpers/` + `data/lookup.js`,純函式好移動。

### Phase 5 — 整合 main.js

1. `main.js` 為 entry point,匯入其他 module 並掛上事件
2. `index.html` 只剩 HTML 骨架 + 一行 `<script type="module" src="assets-v2/js/main.js">`
3. **完整驗證**:smoke test + 5 條金路徑(landing / 情境 / 條文 / 試算 / Ctrl+K)

---

## 風險與注意

1. **全域變數依賴**:目前所有 function 都共享全域 `DATA`、`SCENARIOS`、`filterState` 等。Module 化後需明確 export / import 或建立中央 store。
2. **HTML inline event handler**:有些 `onclick="..."` 直接寫在 HTML 裡,需改為 module 內 addEventListener。
3. **CSS 順序**:某些樣式 cascade 順序敏感(如 mobile responsive override),拆檔需保持原 import 順序。
4. **快取破壞**:Phase 5 完成後,`assets-v2/` 內每個檔需獨立加 `?v=DATA_VERSION` query string。
5. **CDN / GitHub Pages**:確認 ES Module 支援(modern browsers 全支援,IE 不支援但已棄)。
6. **Source map**:不必要(production 直接讀 unminified ES module)。

---

## 退場條件

若拆到一半發現:
- ES Module 在某 browser 出錯 → 加 `<script nomodule>` fallback 載入舊版
- 拆完性能下降 > 200ms → 評估是否 bundle 為單檔(可保留 module 寫法)

---

## 驗證 SOP

每個 Phase 結束:
1. `python 05_scripts/_smoke_test.py --strict` — 結構驗證
2. `preview_eval` 跑前端 sanity check(DATA.length / SCENARIOS.length)
3. 手測 5 條金路徑
4. 確認 console 無新 error
5. git commit per phase(可獨立 revert)

---

## 預估時程

| Phase | 工時 | 風險 |
|---|---|---|
| Phase 1 CSS | 1.5h | 低 |
| Phase 2 資料層 | 1h | 中 |
| Phase 3 Renderer | 3-4h | 中 |
| Phase 4 計算/Helpers | 1h | 低 |
| Phase 5 整合 | 1h | 中 |
| 最終驗證 | 0.5-1h | — |
| **合計** | **8-10h** | — |

---

## 備案:不拆,純內部抽函式

若資源不允許完整 ESM 拆,可退一步:
1. 把 `index.html` 內 JS / CSS 區塊各加 region marker(`// ── REGION: cards ──`)
2. 不改檔案結構,只用 region 與 IIFE 群組化代碼
3. ROI 低,但不破壞既有架構

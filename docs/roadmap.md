# 已知擴充點 / Roadmap

> 由舊 CLAUDE.md §14 外移獨立。目的是讓 CLAUDE.md 主檔精簡，roadmap 由本檔長期維護。

## 圖例

- ✅ 已完成（保留供查找；不再列為 backlog）
- ⏳ 進行中
- ❌ 待做（依優先級分組）
- 純註記項（如「重新啟用關聯圖」）標 📌

---

## ✅ 已完成（按主題）

### 母題 / 視圖

| 項目 | 完成時間 |
|------|---------|
| 國內旅費 / 國外旅費 / 支出憑證與結報 BETA → 校對中 | 2026-04-27 起多次 |
| 為國外旅費 / 支出憑證 補情境（2026-05-01 整併到 73 張） | 2026-04-27p / 2026-05-01 |
| 情境卡 schema 擴充（caveats / example / template / baseline / flow_root / sub_scenarios / deprecated） | 2026-05-01 commit `d0d4063` |
| 6 個情境樹 root 整併（B1 一次到位） | 2026-05-01 |
| auto 卡停用（A1 決策） | 2026-05-01 |
| flow modal 改 mobile bottom sheet | 2026-05-01 |
| 情境視圖內關鍵字搜尋 | 2026-05-01 |
| 試算表聯動（scope-banner 加開啟試算按鈕） | 2026-05-01 |
| 自動初校 481 份的「LLM 二輪精校」 | 2026-04-29 |
| Decision tree 擴至 ~30 | 2026-05-02 #14（30 / 75 = 40%） |
| related 區分人工/推斷邊（`related_inferred`） | 2026-05-02 #11 |
| 同義詞前端搜尋（51 組 / 213 alias） | 2026-04-27g / 2026-05-02 #19 |
| 行動版 RWD（@media max-width 768px） | 2026-04-27g |
| `source_url` 補齊（99.8%） | 2026-04-27 |
| 「(刪除)」函釋 status 自動標記 | 2026-04-27 |
| 推斷邊跨母題 | 2026-04-27 |
| `_common.py` 共用模組 | 2026-05-02 #1 |
| 並排比較模式 | 2026-04-28q |
| 全文搜尋串到主畫面 | 2026-04-28o + 2026-04-30e |
| 抽屜上下張導航 + scroll 還原 | 2026-04-28p / 2026-04-30e |
| 馬卡龍色票系統 | 2026-04-30e |
| 條文庫 chip 加母題排 | 2026-04-30e |
| 情境 attachments / flow 露出 | 2026-04-30e |
| 麵包屑導覽 | 2026-04-30e |
| 試算公式拆解 | 2026-04-30e |
| FlexSearch 中文分詞替代（自寫 mini bigram + trigram） | 2026-05-02 #24 |
| 條文版本歷史 `law_version_history` schema + UI | 2026-05-02 #23 |
| 鄰國比照 fallback | 2026-05-02 #15 |
| `lookup_type` widget 通用化 | 2026-05-02 #18 |
| ESM 拆檔（index.html 5430 → 260 行 + 5 module） | 2026-05-02 #2 |
| 後端事件追蹤 code（CF Workers + D1） | 2026-05-02 #25（**待 deploy**） |
| LLM 精校 481 卡升 llm精校 | 2026-05-02 #5 |
| 全面中立角色 audit | 2026-05-02 |
| 67 卡 caveats / example / template 內容深化（8 卡 pilot） | 2026-05-02 #13 |
| 結構化費率表 `rate_table` | 2026-04-27l + 2026-04-28b + 2026-05-03 擴充 |
| 保險表互動試算 widget | 2026-04-28b |
| 已逾期費率表保留顯示 | 2026-04-28b |
| 情境卡分類 + 蠟筆紅框 | 2026-04-28b |
| 情境視圖快捷條 + 類別下拉 | 2026-04-28k |
| 情境視圖 4 欄密度 | 2026-04-28k |
| rate_table 跨 section 全域搜尋 | 2026-04-28f |
| 自訂 widget dark mode 統一（[data-theme="dark"]） | 2026-04-28h |
| 條文庫卡片排序（A→B→C→D → 母題 → 條文序） | 2026-05-03 |
| 母題 chip 排序（支出憑證→國內→酬勞→國外） | 2026-05-03 |
| 附表改列 A 類核心法規 | 2026-05-04 commit `804010e` |
| GA4 自訂事件追蹤 14 項 | 2026-05-04 |
| flow redirect stopPropagation 修正 | 2026-05-04 |

### 工作流程

| 項目 | 完成時間 |
|------|---------|
| 新增其他母題 SOP（PARENT_KEYWORDS / EXPENSE_LAYER / ENRICH_RULES 三處同步） | 持續可用 |
| GitHub Actions CI（push to main 自動 7 步） | 2026-04-29 |

---

## ❌ 待做

### 內容建設（持續性）

- **5 個 WIP 母題內容建設**：餐費 / 採購及履約 / 物品管理 / 其他支出 / 教育訓練 各需補齊 A/C/D 類卡片與情境
- **酬勞費母題情境卡**（P3，18-25 卡）— 預估 4-6 週
- **後續母題擴充順序**：#2 共通性費用 → #3 加班費 → #4 公務車輛 → #5 教育部 / 國科會專章 → #6 採購法深化招標端
- **59 卡 caveats / example / template 持續深化**（ongoing）
- **13 個無 flow 卡的 decision tree**（目標 ~50%）
- **A 類條文版本歷史**逐條補充（A-國內-005 已示範 3 筆）

### 體驗優化（暫緩）

- mobile-tabbar 4 tab
- 複製附件清單
- 列印 PDF
- 我的常用情境收藏
- emoji icon → SVG icon system
- lazy-render 對抽屜內 MD 解析
- 試算 16~30 日「每日為日支表 1/20」分段計算

### 「未列載國家比照最近國家其他」（附註 §2）

需地理距離資料 / 鄰國表。可選方案：手動維護「比照表」（類似 city_aliases 但 key 是國家），命中時顯示「比照 X 國 → 其他 → Y 美元」。

### 編輯介面

- drawer 加「+ 新增關聯」按鈕，從候選清單中（來自推斷邊）加入 related

### 部署觸發條件

- **events_worker / data_worker 上線**：DAU/MAU > 10 人/日且要評估付費功能優先級時觸發。code 完整待 deploy。
- **真伺服器端認證**：若日後要放敏感資料，需移出 GitHub Pages → Cloudflare Workers / Vercel Functions / 自架。

### 「部分修正」函釋的 status 標記

「(刪除)」自動偵測已實作（`_mark_status.py`，2026-04-27 跑過）。「部分修正」仍須人工逐份判斷後在 front-matter 加 `status: 部分修正`。

### 城市 alias 種子擴充

目前 ~40 條。要補英、德、義、其他亞洲國家，編輯 [04_web/data/city_aliases.json](../04_web/data/city_aliases.json)，key 用使用者可能輸入的中/英/常見譯名，value 用 rate_table 中的「國家」中文主名（substring 比對）。新增前用 `python -c "..."` 驗證該城市真不在表中。

### 表內欄位排序

列數多的 rate_table（B-國外-003 > 130 列）若需排序，可在 `<th>` 加 click handler 做 column sort。目前以「編號」為原始順序，過濾搜尋是主要查找方式。

### B-國外-001 月支生活費 section searchable

目前未開（8 級距 + 中文「410 以上」字串較不適合直接搜尋）。要開只需在該 section 加 `searchable: true` 即可。

---

## 📌 註記

- **顯示已廢止節點**：`04_web/static/js/01_state.js` 改 `HIDE_OBSOLETE = false`（預設 true）
- **舊樣式「已廢止 0.65 opacity」**：已停用（因為已隱藏）。若需重新顯示但希望弱化，CSS 加 `.card[data-status="已廢止"] { opacity: 0.65 }` 並把 `HIDE_OBSOLETE` 設 false
- **重新啟用關聯圖**：移除 `index.html` 中關聯圖 tab 的 `hidden` 屬性即可，後端程式碼仍完整

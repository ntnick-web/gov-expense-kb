# 技術決策紀錄(Architecture Decision Records)

> 重要技術決策的歷史紀錄。每次重大變更新增一筆,**勿刪除既有紀錄**。

---

## 格式

```markdown
## YYYY-MM-DD: 決策標題
**背景**:為何需要做此決定
**決定**:具體決策內容
**理由**:選擇此方案的原因
**替代方案**:考慮過但未採用的選項與否決理由
**影響範圍**:此決策影響哪些檔案/流程
```

---

## 2026-04-25: 採用 MD + JSON 雙層架構而非單一 SQLite

**背景**
資料量小但需頻繁人工編輯,需考慮版控與協作。

**決定**
`02_markdown/` 為單一事實來源(SSOT),`03_index/*.json` 為衍生產物。

**理由**
- MD 可讀性高,人工編輯友善
- Git diff 對 MD 友善,法規修訂歷史清楚
- JSON 索引可隨時重建,不需手改
- 純前端可直接載入 JSON,無需後端

**替代方案**
- SQLite:資料變更需 SQL,人工編輯門檻高;Git diff 不友善
- 純 JSON:寫長文不便,維護痛苦
- Notion API:外部依賴、無法離線、權限管理複雜

**影響範圍**
全部腳本與前端架構

---

## 2026-04-25: 三視圖共用同一份 JSON 索引

**背景**
泡泡圖、條文庫、關聯圖三視圖資料來源是否獨立。

**決定**
三視圖均載入 `03_index/nodes.json` + `edges.json`,僅渲染方式不同。

**理由**
- 避免資料不同步
- 維護成本最低
- 切換視圖時資料已在記憶體,無需重新載入

**替代方案**
- 各視圖獨立 JSON:資料同步成本高,易出錯

**影響範圍**
`03_build_index.py`、前端三個視圖模組

---

## 2026-04-25: ID 類別代碼採單一英文字母

**背景**
跨檔引用需要短而唯一的識別。

**決定**
類別代碼為 `A`/`B`/`C`/`D`/`N`,各代表特定類別。

**理由**
- 短、輸入快
- 視覺辨識度高
- 圖 1 圖例已採此設計,延用一致

**替代方案**
- 多字母縮寫(LAW/STD/INT/QA):較長且非通用慣例
- 數字編碼(1/2/3):缺乏語義

**影響範圍**
ID 規則、所有 MD、前端類別顯示

---

## 2026-04-25: 條文庫為主介面,泡泡圖為首頁(原始決策,後修正見 §6)

**背景**
原始需求看似要做泡泡圖,但實際使用情境多為精確查找。

**決定**
條文庫(左樹右文)為主介面,泡泡圖僅作首頁入口。

**理由**
- 使用者 90% 時間在做查找與引用,需高密度資訊介面
- 泡泡圖視覺效果好但工具性差
- 兩者並存可兼顧視覺識別與實用性

**替代方案**
- 純泡泡圖:導航效率差,不適合日常使用
- 純條文庫:缺乏視覺記憶點

**影響範圍**
UI 規格、開發優先順序

> ⚠️ 此決策後續被修正:見 §6「優先級調整為 P0 泡泡圖 / P1 條文庫」。

---

## 2026-04-25: 不引前端框架與大型 lib(D3/FlexSearch)— 純 SVG + 自寫實作

**背景**
泡泡圖、關聯圖原規劃用 D3.js;搜尋原規劃用 FlexSearch。實作評估後選擇自寫。

**決定**
- 視覺化:純 SVG + 三角函數定位 + 自寫 Coulomb-spring 力模擬(~120+100 行)
- 搜尋:純 vanilla JavaScript substring 比對(中文無需分詞)

**理由**
- 自包含、無 CDN 依賴、無離線問題
- 對 < 500 節點,自寫實作毫秒級回應,效能足夠
- 維護門檻低(無 framework 學習曲線)

**替代方案(列為候選未引)**
- D3.js force module:節點數爆增(>500)或需複雜佈局演算時可重新評估
- FlexSearch:需中文分詞或同義詞搜尋時可重新評估

**影響範圍**
[04_web/assets/app.js](../04_web/assets/app.js)、[docs/01_architecture.md](01_architecture.md) §2.4-2.5

---

## 2026-04-25: 自動推斷邊機制(`cites_inferred / answers_inferred`)

**背景**
新增草稿時 `related: []` 為空,關聯圖會稀疏。完全靠人工補 `related` 工作量大。

**決定**
[05_scripts/03_build_index.py](../05_scripts/03_build_index.py) 加 `build_inferred_edges`,從 `body_plain` 用正規式抽「第 N 條/點」「第 N 則」「QN」,在同 parent 內查 ID 自動建邊,relation 為 `cites_inferred / answers_inferred`,edges.json 加 `inferred: true` + `matched`(原始字樣)欄位。

**理由**
- 法規條文編號很規律,regex 抓得乾淨,誤判率低
- 同一 (from→to) 已有人工邊則跳過,避免重複
- 前端用淡色點線顯示推斷邊,跟人工邊區分;過濾面板可關
- 即使尚未人工補 `related`,關聯圖也有合理連線骨架

**替代方案**
- 純人工 related:工作量大,新增母題後關聯圖長期稀疏
- LLM 自動產 related:外部依賴 + 不可重現

**影響範圍**
[03_build_index.py](../05_scripts/03_build_index.py)、[edges.json schema](02_data_schema.md#32-edgesjson)、前端關聯圖過濾控制

---

## 2026-04-25: 批次自動初校工具(`_batch_autoreview.py`)+ 「自動初校」記號

**背景**
新增 200+ 草稿時,逐份補 `reviewed` 與摘要工作量過大;但 `reviewed` 自動加會混淆「人工已確認」與「自動產出」。

**決定**
[05_scripts/_batch_autoreview.py](../05_scripts/_batch_autoreview.py) 一次性工具:
- 對所有沒 `reviewed` 的 MD,抽 H2 區塊首段(到第一個「。」)為「重點摘要」
- 加 `reviewed: 今日`、`version: TODO → 2024-01-01` placeholder
- 摘要尾標 `_(自動初校,待人工潤飾)_` 斜體記號

**理由**
- 讓初次新增的草稿快速進入「可瀏覽」狀態
- 標記清楚自動 vs 人工狀態,使用者可挑重要節點精校
- 配合「正文引用偵測 → 推斷邊」機制,即使尚未人工補 `related` 也能在關聯圖看到合理連線
- 既有「reviewed 安全網」邏輯仍適用(批次自動初校的 MD 也有 `reviewed`,`02_parse.py --force` 不會蓋,需 `--force-reviewed`)

**影響範圍**
[_batch_autoreview.py](../05_scripts/_batch_autoreview.py)、[02_data_schema.md](02_data_schema.md) `reviewed` 欄位語意

---

## 2026-04-25: 鎖定母題模式(條文庫 + 關聯圖共用 `state.filter.parent`)

**背景**
從泡泡圖點某母題進入條文庫,使用者進入「focus mode」想專注該母題。同時切到關聯圖時也應 scope 到該母題。

**決定**
- **條文庫**:`state.filter.parent` 設定時,樹根直接顯示該母題、隱藏其他母題、支出類別預設展開、底部「↩ ← 全部母題」按鈕
- **關聯圖**:讀同個 `state.filter.parent`,過濾顯示該母題節點 + 跨母題鄰居(任一邊跨到該母題,對方納入);左上「目前範圍:XX [顯示全部]」banner
- **「顯示全部」按鈕**清 `state.filter.parent`(連帶條文庫回到全部母題模式)

**理由**
- 兩視圖共用 state,使用者體驗一致(條文庫 scope 著的母題,切到關聯圖不會看到全部)
- 跨母題鄰居自動納入,讓使用者看到該母題與其他母題的連結
- `setFilter` 變動時自動觸發 `updateGraphScopeBanner`,雙向同步

**影響範圍**
[04_web/assets/app.js](../04_web/assets/app.js) `renderTree / applyGraphFilter / setFilter / updateGraphScopeBanner`

---

## 2026-04-25: 條文庫加「支出類別」中間層(`EXPENSE_LAYER` + 「程序總則」)

**背景**
單純按「母題 → 類別代碼(A/B/C/D)」分類太抽象;使用者直覺以「費用種類」尋找(交通費 / 住宿費)。

**決定**
- 條文庫分類樹改 3 層:`母題 → 支出類別 → 類別代碼`
- 支出類別由前端 `EXPENSE_LAYER` 表定義,從節點的 `tags`(自由標籤)推斷
- 各母題自有支出類別清單(國內旅費 4 類、國外旅費 10 類等)
- 加「程序總則」兜底類別:命中泛 tag 但無具體費用 tag 者落入(總則、法源、調任、懲處等)
- 「其他」放最末作為最後 fallback,目前實際 0 筆

**理由**
- 從 tag 推斷不需改 SSOT MD,輕量
- 「程序總則」優雅吸收「綜合性條文」,讓「其他」極小化
- 各母題支出類別獨立,不強制套用同一表(國內旅費的「雜費」與國外旅費的「禮品交際及雜費」不同)
- 使用者校對時補具體 tag,下次重建索引自動歸正,不需動 `EXPENSE_LAYER` 表

**影響範圍**
[04_web/assets/app.js](../04_web/assets/app.js) `EXPENSE_LAYER`、`buildTreeData`、`renderTree`、`filteredNodes`、`renderCards` 麵包屑;[06_tags_taxonomy.md](06_tags_taxonomy.md) 加實作對應段

---

## 2026-04-25: 優先級調整為 P0 泡泡圖 / P1 條文庫

**背景**
原始決策(本檔 §4)定條文庫 P0、泡泡圖 P1。實作後使用者回饋希望反過來:首頁進入直接看到泡泡視覺地圖,點母題進入條文庫。

**決定**
- P0:泡泡概覽圖(預設首頁,`<body data-view="overview">`)
- P1:條文庫(從泡泡圖進入後 scope 鎖定母題)
- P2:關聯圖(維持輔助)

**理由**
- 視覺入口比文字列表更友善
- 泡泡視覺地圖讓使用者一眼掌握各母題分量(節點數)
- 鎖定母題模式讓使用者進條文庫時有明確 scope,不會被全部母題淹沒

**影響範圍**
[index.html](../04_web/index.html) `data-view`、tab is-active、view hidden 屬性;[01_architecture.md](01_architecture.md);[04_ui_spec.md](04_ui_spec.md)

---

## 2026-04-25: 泡泡圖大改(刪雙環/中心、佔滿頁面、0 筆灰色、裝飾泡泡)

**背景**
原泡泡圖採 docs/04_ui_spec 雙環設計(中心「政府支出」+ 內環 6 母題 + 外環 3 專章)。實作後發現中心冗餘、雙環顯得制式、版面利用率不足。

**決定**
- 刪除「政府支出」中心節點與內外環區分,改為單層 9 母題
- 主泡泡大小依 count 線性映射(min 4.5%、max 13% 容器短邊)
- **0 筆母題用灰色**,有檔案才用母題色(視覺暗示「尚未建立檔案」)
- 不顯示節點數文字、無「無資料」字樣
- 加 30+ 個裝飾泡泡(隨機尺寸/色、半透明、無互動),填滿外圍空間
- SVG 佔滿整個 view(`flex: 1; width/height 100%`),viewBox 動態取容器 rect
- circle packing 力模擬 + 重心校正(幾何重心對齊畫面中心)

**理由**
- 雙環設計過於規範,失去「視覺地圖」的自由感
- 中心節點與其他泡泡功能重疊(都代表「進入該層級」)
- 0 筆灰色直接表達「未建檔」資訊,無需文字
- 裝飾泡泡填補大畫面的空白,維持「視覺地圖」感

**影響範圍**
[04_web/assets/app.js](../04_web/assets/app.js) `renderOverview`、`packBubbles`、`makeBubble`;[04_ui_spec.md](04_ui_spec.md) §2 完全重寫

---

## 2026-04-25: 關聯圖改靜態 layout(無 RAF 動畫)

**背景**
原關聯圖用 RAF 跑力模擬,打開時節點會「彈跳」展開幾秒鐘才穩定。對於 235 節點規模,動畫感偏雜亂。

**決定**
- 移除 RAF 動畫迴圈
- 改為打開時跑 `runPackingSync(W, H, 320)` 同步收斂(~10-50ms)後一次 paint
- 拖曳節點:mousemove 直接 paint(無模擬),mouseup 釋放但保留新位置
- 「重新模擬」按鈕:重新散布初始位置 + 跑 320 次同步 packing + paint

**理由**
- 打開即穩定布局,使用者第一眼看到的就是最終狀態
- 235 節點 O(n²) 互斥計算 320 次,JavaScript 同步約 30-50ms,遠低於人類感知延遲
- 拖曳改為直接更新位置(無模擬)反應更直接
- 節省 CPU(無持續 RAF)

**影響範圍**
[04_web/assets/app.js](../04_web/assets/app.js) `tickSimulation` 移除、`runPackingSync` 新增、拖曳互動改寫

---

## (待補)

新決策依時間順序追加於下方。

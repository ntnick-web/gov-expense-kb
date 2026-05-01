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

## 2026-04-29: LLM subagent 16 batch 模式 — title 與 summary 大規模重整

**背景**
500+ 節點的 title 與 summary 經 PDF 抽取 + 規則式整理,仍存在截斷、檔名直譯、前言式、長度不一等問題;直接呼叫 LLM API 成本高且難以追蹤。

**決定**
建立 `_retitle_build_batches.py` + `_retitle_apply.py` 雙腳本範式:① 切 16 批分檔輸出 ② Claude Code subagent 並行讀取內文 + 摘要 + 前後脈絡產出提案 ③ apply 腳本自動 merge 提案 + 套用到 SSOT。Summary 同模式建立 `_resummary_*` 對偶腳本。

**理由**
- subagent 是免費(無 API 費),適合大規模重整
- 16 批切分讓單次 context 維持在可控範圍
- proposals/ 落地產物可審計、可重跑、可 dry-run
- title 在 LLM 提案後仍經 `_polish_titles.py` 20 字硬上限把關

**影響範圍**
460 卡 title 改動、479 卡 summary 改動;`02_markdown/` 大規模 SSOT 變動;新範式可外推到下次內容深化(scenarios caveats / example / template 67 卡待補)

---

## 2026-04-30e: 馬卡龍 7 色 token 設計系統 — 取代靛藍單色品牌

**背景**
舊版 v2 用單一靛藍品牌色(oklch 55% 0.15 265),搭配多色 chip 與徽章顯得雜亂;V3 prototype 提出馬卡龍系統作為候選。改版建議報告(2026-04-30 對話)決議將 V3 優點融入正式版。

**決定**
- `:root` 從靛藍 hue 265 改成薰衣草 hue 295 主品牌
- 加入 7 色馬卡龍 token:lavender / peach / strawberry / vanilla / matcha / sky / rose-taupe
- 每色配套深 ink 變數,過 WCAG AA 對比 ≥ 4.5
- 深色模式 L 從 ~88% 降到 ~30% 保留 hue,避免螢光糖果色
- **角色映射規則**:主畫布奶白底;馬卡龍只用於 chip / banner / dot / 邊框(< 30% 面積);馬卡龍底必配深 ink 字

**理由**
- 政府網站普遍硬色彩,馬卡龍系統提升品牌辨識度
- 7 色覆蓋 ok / warn / stop / info / 中性 5 種語意需求
- token 化讓改色一次到位(改 `:root` 即可)
- 深色模式 hue 保留,避免兩種模式視覺斷裂

**影響範圍**
[04_web/index.html](../04_web/index.html) `:root` + `--ok/warn/stop` + `mark.search-hit` + `.related-kind` + `.sc-flow-strip` + `.badge-certainty` 等共 ~30 處改用 token

---

## 2026-05-01: 中立角色原則明文化 + 法源位階 SOP

**背景**
2026-05-02 法源審查發現 4 張情境卡曾被誤判為「無法源」(因初查只搜 A/B/D,漏 C 類解釋彙編 359 份),需建立明確 SOP 防止再現。同時 AI 助手在內容深化過程曾以「常識補強」名義加入無法源結論,違反專案中立原則。

**決定**
- CLAUDE.md §0 新增「核心原則:中立角色 — 不給予判斷,不加入無法源依據的內容」段落
- 法源位階明確:A 核心 > B 標準 > C 解釋 > D 問答(D 仍算法源,但位階最低,不可推翻 A/B 文義)
- 新增情境卡 SOP:必須**同時搜 A/B/C/D 全四分類**才能寫結論;每個限制詞 / 數字 / 條件都需對應原文
- 違反原則的既有內容**列入待處理清單**,不自行修改;等人類拍板處理方式
- 用語中性化:用「條文規定...」「依○○條...」取代「應該...」「不得...」「才能...」
- 處理紀錄抽出獨立檔 [_review_log.md](_review_log.md)(2026-05-01 拆檔)

**理由**
- 中立角色是本資料庫最大護城河,違反即等於把工具變成「另一份實務指引」失去差異化
- 法律意見必須有來源,沒有就應留白讓使用者諮詢主計室
- AI 助手「主動補強」是常見失誤,需明確禁止

**影響範圍**
- CLAUDE.md §0 + §17(後 §17 抽到 [_review_log.md](_review_log.md))
- 對 75 manual 情境卡的 caveats / flow.conclusions / template 內容皆有審查影響

---

## 2026-05-01: 多版本前端檔退役 — 以 git tag 取代實檔保留

**背景**
從 2026-04-26 v1(母題泡泡圖) → 2026-04-28r v2(Claude Design)→ 2026-04-30 V3 候選 → 2026-04-30e 馬卡龍重構,累積 4 份 index.html 並存 + 兩份 scenarios JSON + `design-preview/` React prototype。同時存在帶來 ~600 KB tracked 體積與「該改哪一版?」的維護心智成本。

**決定**
- `git tag` 三個歷史錨點:`v2-archive`(`8aaf079`) / `v3-prototype`(`6dfea70`) / `old-bubblechart`(`8aaf079`)
- `git rm` 7 檔 + 1 目錄:`index-v2.html` / `index-v3.html` / `index-old.html` / `assets/app.js` / `assets/style.css` / `data/scenarios.json` / `data/scenarios_auto.json` / `design-preview/`
- `04_web/index.html`:刪 footer 兩個連結 + 移除 `loadAllData()` 的 `scenarios.json` fallback fetch + 簡化 SCENARIOS 賦值
- 還原任一檔:`git checkout <tag> -- <path>`

**理由**
- 「保留供 bookmark 不破」實際很少使用,卻長期增加心智成本
- git tag 是更乾淨的歷史錨點機制(語義化 + 不佔工作樹)
- `04_web/` 從 4 份 index 簡化為 1 份,新進者不會誤改錯版本
- legacy scenarios.json 早被 A1 決策停載,留著只是 dead code

**替代方案**
- 砍 design-preview 但保留 v2/v3:仍有「該改哪一版?」問題
- 全保留 + 加 README 說明:文件成本只增不減

**影響範圍**
- `04_web/` 大幅瘦身(從 4 份 index 變 1 份)
- 新增 `docs/changelog.md` + `_review_log.md` 兩檔
- `_handoff_*.md` 移到 `docs/_archive/`
- README.md / 01_architecture.md / 02_data_schema.md 同步更新

---

## (待補)

新決策依時間順序追加於下方。

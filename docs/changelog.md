# Changelog — 重大變更歷史

> 每次大型重構 / 設計轉換 / 結構性決策的歷史紀錄,從 CLAUDE.md §15 抽出獨立成檔(2026-05-01)。
> 之後的大改動以「## YYYY-MM-DD: 標題」新增章節,**勿刪除既有紀錄**。

---

## 2026-05-01: 資料夾整理 + 多版本退役 + 文件重構

依「資料庫資料夾整理報告」(`docs/_資料庫資料夾整理報告_2026-05-01.docx`)分三批執行。

### 第一批(本機 dev artefact 清除)
刪除 `_retitle_proposals/` `_resummary_proposals/` `__pycache__/` `_certainty_review.csv` `_scenario_audit.txt` `nodes_sample.json`,合計約 2 MB。皆為一次性 LLM batch / audit 已 apply 的留底,untracked。

### 第二批(舊版退役)
- **新增 git tag**:`v2-archive`(commit `8aaf079`)、`v3-prototype`(commit `6dfea70`)、`old-bubblechart`(commit `8aaf079`)。要還原任一版用 `git checkout <tag> -- <path>`。
- **`git rm` 7 檔 + 1 目錄**:`04_web/index-v2.html`、`index-v3.html`、`index-old.html`、`assets/app.js`、`assets/style.css`、`data/scenarios.json`、`data/scenarios_auto.json`、`design-preview/`(整目錄)。
- **`04_web/index.html` 修改**:
  - footer 刪除「✨ V3 候選」「🎨 設計試做」兩個連結
  - `loadAllData()` 移除 `scenarios.json` fallback fetch(原 Promise.all 第 4 項)
  - 連帶移除懸空 `scnLegacy` / `scnAuto` 宣告
  - 簡化 `SCENARIOS` 賦值(原 manual / legacy 二選一 → 直接用 manual 一行)
- 結果:`04_web/` 從 4 個 index.html 簡化為 1 個;`SCENARIOS` 載入路徑唯一;前端驗證 518 節點 / 75 情境卡載入正常,console 0 error。

### 第三批(CLAUDE.md 拆檔 + docs 更新)
- 本檔(`docs/changelog.md`)從 CLAUDE.md §15 抽出。
- `docs/_review_log.md` 從 CLAUDE.md §17 抽出(法源審查紀錄)。
- `_handoff_optimization.md` / `_handoff_retitle.md` 移到 `docs/_archive/`(已用畢)。
- `README.md` + `docs/01_architecture.md` 更新節點數(513 → 520)與視圖描述(3 視圖 → 6 視圖)。
- `docs/02_data_schema.md` 補 scenarios 7 新欄位(caveats / example / template / baseline_attachments_id / flow_root / sub_scenarios / deprecated)。
- `docs/decisions.md` 補三筆 ADR(2026-04-29 LLM 重整 / 2026-04-30 馬卡龍重構 / 2026-05-01 整併深化 v3)。
- `.gitignore` 強化:加入 `_*_proposals/` `05_scripts/_*.csv` `05_scripts/_*.txt`(保留 `_skip.txt`)`04_web/data/_*.json` `04_web/data/*_sample.json` 模式。

### 回滾若需要
- 取回任一退役檔:`git checkout v2-archive -- 04_web/index-v2.html`
- 整批回退:在這次 commit 之前 `git revert HEAD`
- CLAUDE.md 拆檔不影響 git(本檔 gitignored)— 從 `docs/changelog.md` + `_review_log.md` 把內容貼回即可

---

## 2026-05-01: 整併深化 v3 — P0/P1/P2/P4 全部落地 + A1 拆 auto 卡(commit `d0d4063`)

依使用者「全面檢視核銷情境入口頁」體檢報告(2026-04-30 26 項待改善),經 2026-05-01 規劃會議決策後執行。

**A1 決策**:auto 卡(43 張規則式生成的法條搬家)完全從前端載入移除。
- 理由:① 與條文庫功能完全重複(type=A + parent 過濾即達相同效果)② 違反情境視圖「使用者語言列出實務常見問題」設計初衷 ③ 一次砍 37% 卡片量解決首屏堆疊與計數誇大
- 做法:`loadAllData()` 不再 fetch `scenarios_auto.json`(2026-05-01 後續清理時連同 JSON 一起退役);`.github/workflows/validate-and-build.yml` 移除 `build_scenarios.py --apply` 步驟
- 重啟方式:恢復 `loadAllData()` fetch + CI 加回該步驟(完全可逆)

**P0 修 7 處 bug**:
- 情境視圖內 `<input id="sc-q">` 接通 `scenarioQuery`(原 dead code)
- `init()` 改 `switchView('landing')`(原誤切到 scenarios)
- 刪「7 張 Q&A」collapsed strip 冗餘(has-flow 卡已自帶徽章 + 按鈕)
- 「← 回情境列表」清完整 filter + sc-q + chip state + 滾頂
- `taxi` flow Q2 假分支(三選項全 conclude approved)→ 改為「符合任一 vs 都不符合」真分支
- `voucher-lost` Q2 加「≤ 5,000 元」具體金額判準(原無門檻)
- 同步 CLAUDE.md(§0 + §6 + §16)+ DATA_VERSION → `2026-05-01a`

**P1 schema 擴充 + 內容戰**:
- scenarios JSON 加 7 欄位:`caveats` / `example` / `template` / `baseline_attachments_id` / `flow_root` / `sub_scenarios` / `deprecated`(詳見 `docs/02_data_schema.md`)
- 新建 `04_web/data/baseline_attachments.json` 5 組標配憑證
- 前端 `renderScopeBanner()` 渲染 5 個新區塊(紅 caveats / 灰 baseline / 薰衣草 sub / 抹茶 example / 天空 template)+ CSS(深色模式 + ≤720px mobile)
- 7 高頻卡補 caveats / example;3 flow 加 template 簽呈樣張(taxi / voucher-procurement / voucher-lost);4 flow 結論補具體金額

**P2 6 個情境樹整併(B1 一次到位)**:
- 新建 2 root:`domestic-trip-overview`(20 子)+ `transport-choice-overview`(10 子)
- 既有 4 root 加 `flow_root: true` + `sub_scenarios`:`overnight` / `voucher-procurement` / `abroad-basic`(21 子)/ `voucher-types`(17 子)
- 3 完全重複住宿子卡標 `deprecated: true`:lodging-distance-60km / weekday-holiday / long-discount
- 前端 `renderScenarios` + `renderScenarioChips` filter deprecated;scope-banner 渲染子情境連結網格(220px chip 卡)
- 卡片加 `is-root` 樣式(薰衣草漸層 + 加粗邊框 + 「🗂 N 子情境」徽章)
- `countScenarioMatches` + `filteredData` 收緊:泛 tag(報支上限/覈實報支/結報核銷/出差規定/原始憑證/誠信原則)不單獨支撐 ≥2 命中,且 expense 必須相符

**P4 體驗優化**:
- flow modal 改 mobile bottom sheet(`@media (max-width: 720px)` + `align-items: flex-end` + 90vh + slide-up 動畫 + 握把指示器)
- 首屏精簡:行動版 `.sc-filterbar` 改水平 scroll(避免折成 4-5 列堆疊);標題副標縮小
- 試算表聯動:`scope-banner` 加抹茶色「🧮 開啟試算」按鈕(expense ∈ 生活費/保險費 或 國外住宿時自動顯示)

**4 項使用者已決議暫不執行**(留底參考):mobile-tabbar 補回 4 tab、複製附件清單一鍵按鈕、列印/匯出 PDF 核銷 SOP、我的常用情境 localStorage 收藏。

詳細分析、未來母題擴充建議(主推:講座鐘點費 / 出席費 / 稿費)、整體核銷邏輯優化方向詳見 CLAUDE.md §14 已知擴充點。

**回滾**:`git revert d0d4063`。子模組可單獨 hotfix:
- A1 拆 auto:在 `loadAllData()` 加回 `fetch('data/scenarios_auto.json'+v)` + CI workflow 加回 `build_scenarios.py --apply` 步驟
- 顯示 deprecated 卡:在 `renderScenarios` 移除 `if (s.deprecated) return false;`
- 取消 caveats / example 渲染:把對應 html 變數設為空字串

---

## 2026-04-30e: 馬卡龍重構 — 整合 V3 候選版優點 + 配色升級(commit `0beb8af` 等)

依「核銷網站改版建議報告」(將 V3 prototype 即 `index-v3.html` 的優點融入正式版 `index.html`),這輪做了 **8 個 round + 2 個追加修正**。

### Round 1 — 馬卡龍色票系統(全站基礎建設)
- `:root` token 從靛藍系(brand 265 hue)改成薰衣草系(295 hue)+ 7 色馬卡龍 token:
  - 🍇 lavender(主品牌)/ 🍑 peach(暖點綴)/ 🌸 strawberry(紅警示)/ 🍋 vanilla(黃警告)/ 🍵 matcha(綠通過)/ ☁️ sky(藍資訊)/ 🌹 rose-taupe(中性藕)
  - 每色配套深 ink 變數 `--ink-{hue}`,過 WCAG AA 對比 ≥ 4.5
  - 深色模式 L 從 ~88% 降到 ~30% 保留 hue,避免螢光糖果色
- 沿用點 → 馬卡龍 token 化:`--ok/--warn/--stop` 系列、`mark.search-hit` 香草黃、`.related-kind.qa/.fn` 天空藍/薰衣草、`.sc-flow-strip` 草莓粉、`.badge-certainty inferred/contested` 蜜桃/草莓、`.sc-auto-badge` 藕色、`.cmp-meta-row.diff` 香草黃
- **角色映射規則**(行動指南):主畫布奶白底(別把馬卡龍當大背景);馬卡龍只用於 chip / banner / dot / 邊框(< 30% 面積);馬卡龍底必配深 ink 字(別配白字)

### Round 2a — 情境 attachments 露出
- `renderScopeBanner()` 在條文庫頂的情境 banner 下方,加蜜桃色「📎 需附單據」清單 + 草莓色「🤔 開始條件問答」按鈕(若 sc.flow)
- approvers(核章流程)依使用者要求**砍掉不渲染**(2026-04-30 對話),JSON 欄位保留供未來

### Round 2b — 同義詞展開搜尋
- `loadAllData()` 多載入 `data/synonyms.json` → `SYNONYMS` array + `SYNONYM_INDEX` Map(每詞反查整組)
- `expandSynonyms(q)` 雙向 substring 比對展開
- `filteredData()` 跑全部 queryTerms 一輪,每個欄位加權,同義詞命中權重 70% / 原 query 100%
- 卡片渲染加灰藕色「≈ 命中詞」徽章 + `highlightTerms(html, [q, matchedSynonym])` 雙詞高亮

### Round 3 — 試算公式拆解
- 生活費 widget 加兩個 calc-row-aux 欄位:天數 input + 供膳宿情形 4 tab(100% 自理 / 80% 供膳 / 30% 供膳宿 / 10% 全包)
- `lookupLiving()` 加 `formulaHtml`,有天數時顯示「日費 美元/日 × 天數 × % = 總額」
- 保險 widget 加每日均價輔助行
- **月支 label 改 ≥31 日 → >15 日**(commit `cfee43f`)
- calc-formula CSS:dashed mint 邊框 + monospace + total 抹茶色粗體

### Round 4a — 抽屜 prev/next 翻頁
- `<span class="drawer-nav">` 在 drawer-actions,內含 `‹ 1/518 ›`
- `openDrawer()` 開頭記下 `window._cardsScrollTop`,`closeDrawer()` 還原(避免關抽屜跳頂)
- `move(±1)` 不再循環,配合 disabled 按鈕
- 鍵盤 ←/→ 同義(早就有)

### Round 4b — 麵包屑
- `<nav class="breadcrumb">` 在條文庫 pagehead 上方
- 渲染:全部 › 情境 › 母題 › 支出類別 › 類別 › #tag › 🔍query
- 點任一層自動清掉之後的 filter

### Round 4c — Spotlight overlay (⌘K)
- 行動版 padding-top:0、border-radius:0(全螢幕);桌面 padding-top:12vh、max-width:640px
- 收集頁面 + scenarios + nodes;排序 view > scenario > node + 標題命中加 50 分;同義詞展開
- kind chip 各對應馬卡龍色(view=sky / scenario=peach / node=lavender)
- 鍵盤 ↑↓ Enter Esc + 點 backdrop 關閉
- `(metaKey || ctrlKey) + K` 從 focus topbar input 改成開 overlay

### Round 4d — card-summary 4 行
- `-webkit-line-clamp: 3` → `4`、`line-height: 1.55` → `1.6`(讓 LLM resummary 50 字摘要更易讀)

### 追加修正 1 — 條文庫加母題 chip + 刪顯示狀態(commit `3ddd904`)
- HTML 新增 `<div class="filterrow" id="lib-parent-row">`、移除 `lib-obsolete-row`
- `renderChips()` 加母題 chip 計數 + render + click handler;移除「顯示狀態」整段
- 點母題 chip 自動清 type / expense filter

### 追加修正 2 — 行動版 RWD 修補
1. `scope-banner` mobile 改 column flex(避免「情境:跨夜住宿…」中文擠成單字一行)
2. `drawer-nav-btn` mobile min 28×28px hit area(原本 7.7×14px 手指點不到)
3. `drawer-row` mobile 改 column(meta 一行、actions 一行右對齊)
4. Spotlight placeholder 縮短

### 追加修正 3 — view 切換 mobile leak bug(關鍵 fix)
- 症狀:行動版從情境切到試算後,試算下方接續顯示情境/條文庫的內容
- 根因:`html[data-init-view="scenarios"] #view-scenarios { display: block }` 永久 override `.scenarios-view.active`
- 修法:`switchView()` 開頭 `document.documentElement.removeAttribute('data-init-view')`,讓 pre-paint flash 防護只在首次渲染前生效

**回滾**:`git revert 0beb8af`(主)+ `3ddd904`(母題 chip)+ `cfee43f`(>15 日 label)

---

## 2026-04-30: 激進重構 — 移除桌面 sidebar + 加 Landing 三入口(commit `0623e9c`)

依使用者「左側 sidebar 與上方 chip 重複浪費版面」+「全版三切左中右入口讓使用者更聚焦」需求。

### 桌面變動
- `<aside class="side">` 整個刪除 → `.app` 從 grid 變單欄
- 新增 `.topnav`(sticky top):brand「核銷這樣做!!!」+ 3 tab(情境/條文庫/試算表)
- 主內容寬度 +260px
- 點 brand 任何時候回 landing 並清掉 filterState

### Landing 首頁(`#view-landing`)
- 三張卡左中右並排(grid 3 col,行動版 1 col 堆疊)
- Hero「核銷這樣做!!!」38px + 副標
- 卡內:icon 64px + 標題 + 簡介 + 計數膠囊
- **每次進站永遠從 landing**(currentView 預設 'landing',不記住上次 view 是使用者明確要求)
- topbar 搜尋框在 landing 時隱藏(避免跟 hero 視覺打架)

### 行動版變動
- mobile-tabbar 加「🏠 首頁」tab,變 4 tabs(原 3 tabs:情境/條文庫/試算)
- topnav 在 ≤720px 隱藏(行動版用 mobile-tabbar)

### lazy-render(commit `f24c4f5`)
- 條文庫:`renderCards` chunked,首批 30,sentinel + IntersectionObserver(rootMargin 400px)
- 情境視圖:`renderScenarios` chunked by section,首批 3 sections,IntersectionObserver(rootMargin 600px)
- 情境視圖 page height 19887 → 4936px(降 75%)
- filter 變動時重置 `_libRenderedCount` / `_scnSectionsRendered`

**回滾**:`git revert 0623e9c` 恢復 sidebar,或手動把 `.app` 改回 `grid-template-columns: 240px 1fr` + restore `<aside class="side">` HTML。

---

## 2026-04-29: LLM 大規模重整 — Title + Summary + Certainty + CI(commits `251f8d3` `6d9c343` `01cf91a` `ee2591f` `92064ac`)

完整交接見 `docs/_archive/_handoff_optimization.md` 與 `_handoff_retitle.md`。

- **Title 全面重抽**(commit `251f8d3`):`_retitle_build_batches.py` + `_retitle_apply.py` 切 16 批,subagent 讀內文 + 摘要推核心關鍵字。460 張改、19 沿用、0 異常。helper 自動補 A 類「第N條」/ D 類「QN」前綴。20 字硬上限把關。
- **Summary 全面情境句型化**(commit `6d9c343`):`_resummary_build_batches.py` + `_resummary_apply.py` 同樣 16 批,subagent 把摘要重寫為「適用場景+核心規定+關鍵限制」格式。479 張改、平均長度從 119 字降到 50 字。summary_pending 警告從 16 降到 1。
- **情境自動化**(commit `01cf91a`):scenarios 拆 manual + auto 兩份。`build_scenarios.py` 從 verified+current 節點規則式生成 43 張長尾情境(`source: auto`)。前端載入時兩份合併,auto 卡片加灰色 dashed「🤖 自動產生」徽章。(2026-05-01 起 auto 卡停用。)
- **信度系統 certainty**(commit `ee2591f`):`_mark_certainty.py` 規則式偵測 22 個 inferred 訊號詞 + 11 個 contested 訊號詞。標 519 個現行節點:**496 explicit / 21 inferred / 3 contested**。03_build_index.py 序列化到 nodes.json。前端三層免責 UI:抽屜底部 40 字標準免責(常駐)+ inferred/contested 抽屜頂部紅 banner + 卡片網格右上角「⚠ 推論/爭議」徽章。
- **GitHub Actions CI**(commit `92064ac`):`.github/workflows/validate-and-build.yml` push to main 自動跑 04_validate → 03_build_index → build_scenarios --apply,變動自動 commit 回 main 並由 Pages 部署。(2026-05-01 起 build_scenarios 不在 CI 跑。)
- **scenarios 原則 2 修正**(commit `7f48882`):依「情境內容須遵循最新法規,函釋過時時以最新法規為準」原則,`_audit_scenarios.py` 盤點 + `_fix_stale_scenarios.py` 修補:abroad-airfare-receipts 從「機票三項憑證」改「二項」(A-國外-006 最新規定);abroad-airfare/low-cost-carrier/onboard-overnight-living 刪「出國事實證明」附件;boarding-pass-lost 整張刪除;credit-card-fee-cap 合併到 registration-credit-card;voucher-receipt vs receipts 改名差異化。情境總數 119 → 117。

---

## 2026-04-28r: v2 設計重構 — Claude Design 介接版正式取代舊版

從 [claude.ai/design](https://claude.ai/design) 取得設計 handoff bundle 後落地的新版,於 2026-04-28r 正式取代舊版作為 `04_web/index.html` 預設首頁。

**檔案結構**(2026-04-28r 當時):
- `04_web/index.html` — 新版正式版(原 v2 架構,單一 HTML 內含所有 JS/CSS,~2400 行)
- `04_web/index-v2.html` — 同檔複本,供既有 bookmark URL 不破(**2026-05-01 退役**)
- `04_web/index-old.html` — 舊版凍結備份(母題泡泡圖 + 原 4 視圖架構)(**2026-05-01 退役**)
- `04_web/assets/{app.js,style.css}` — 舊版的 JS/CSS,新版不引用(**2026-05-01 退役**)

**新舊版功能差異**(舊 = `index-old.html` / 新 = `index.html`):
| 功能 | 舊版 | 新版 |
|------|------|------|
| 預設首頁 | 母題泡泡圖 | Landing 三入口卡(2026-04-30 加) |
| 母題泡泡圖 | ✅ | ❌(依設計刻意拿掉) |
| 情境視圖 | 18 分組 | 18 分組 + 蠟筆紅框 + 條件問答按鈕 + 母題/支出類別 chip filter |
| 條文庫 | 母題/類別/支出類別三層樹 | chip filter 三排,lazy-render(首批 30 + IntersectionObserver) |
| 抽屜「相關規定」 | 3 段式分組 | 出+入,2026-04-30 加方向標題 |
| 比較模式 | ✅ 2-3 卡 + diff | 同 + 同 design system |
| 條件問答 (flow) | inline 在 cards 上方 | 互動 modal(state machine 逐題 + 結論 + refs) |
| 試算表入口 | ❌ | 日支生活費 + 保險費 widget |
| 桌面導覽 | sidebar | topnav(2026-04-30 起) |
| 設計風格 | 多色 chip | 單品牌色(2026-04-30e 改馬卡龍) |
| 信度 UI | ❌ | 抽屜底部 40 字標準免責 + inferred/contested 紅 banner + 卡片信度徽章 |
| 搜尋高亮 | ❌ | `<mark class="search-hit">` 黃底 + 多欄位加權排序 |

**v2 內嵌 JS/CSS 維護注意**:
- 單一 HTML(~3600 行,2026-05-01 已超 5400 行),所有 JS/CSS inline,**沒** `app.js` / `style.css` 拆檔
- 共用 design tokens 寫在 `<style>` 開頭的 `:root`
- 改設計系統(色彩 / 圓角 / 字體),改 `:root` 一次到位

---

## 早期紀錄(2026-04-25 ~ 2026-04-28)

早期決策(MD + JSON 雙層架構、三視圖共用索引、Python 處理鏈、純前端無框架等)記錄於 [decisions.md](decisions.md)。

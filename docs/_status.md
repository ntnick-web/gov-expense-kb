# 最新狀態速覽

> 此檔取代舊 CLAUDE.md §0「最新狀態速覽」。每次大型 session 結束時 append 一段；不刪歷史。CLAUDE.md 內只留摘要 5 行 + 連結到本檔。

## 當前快照（2026-05-08a）

- **DATA_VERSION**:`2026-05-07e`（待 bump）
- **節點數**:**1071**（刪除 30 筆 TOC 殘渣後；3 筆已廢止函釋另標記）；**4 主母題 + 6 WIP 母題**
- **review_level 分布**:**81 人工 / 925 llm精校 / 24 llm待人工 / 41 自動初校**
- **情境卡**:**126 張**（122 可見；扣 4 deprecated）；96 flow / 122 visible = **79%**；caveats **121 張**；example **16 張**
- **母題排序**：三組排序陣列（01_state / 02_data / 03_render）已統一為「國內→國外→酬勞→支出憑證→採購→餐費→物品→其他→教育訓練→國科會→教育部→成大」
- **6 個情境樹 root**:overnight / voucher-procurement / abroad-basic / voucher-types / domestic-trip-overview / transport-choice-overview
- **色票系統**:**馬卡龍 7 色 token**(薰衣草主品牌 / 蜜桃 / 草莓 / 香草 / 抹茶 / 天空 / 藕色)+ 配套深 ink(WCAG AA)
- **桌面 / 行動版 UI**:Landing 三入口 + topnav 3 tab / mobile-tabbar 4 tab(2026-04-30 加首頁)
- **預設入口**:scenarios(landing 已封存,splash 後直接入情境)
- **同義詞展開搜尋**:**51 組**(原 21,2026-05-01 加 18 高頻組;213 alias 總);`expandSynonyms()` 多詞 OR + 70% 權重 + 命中詞徽章
- **Mini Chinese 搜尋索引**(2026-05-02 #24):純自寫 bigram + trigram 倒排索引 [04_web/static/js/00_search_index.js](../04_web/static/js/00_search_index.js)(150 行,無 CDN,符合「禁外部 lib」);518 docs / 11K bigrams / 20K trigrams;query 候選預過濾,filteredData 0.50ms/query
- **rate_lookup 比照鄰國**(2026-05-02 #15):`04_web/data/country_neighbors.json` 109 國對應(寮國→泰國 等);`inferCountryByAlias()` 雙段 fallback(city kind / neighbor kind);試算 widget 顯示「比照鄰國 X(政府附註 §2)」標示
- **lookup_type widget registry**(2026-05-02 #18):`LOOKUP_TYPE_RENDERERS` + `LOOKUP_TYPE_WIRERS` 通用化 — 新增 widget 改 registry 加一筆即可
- **Spotlight overlay (⌘K)**:全螢幕 panel(行動)/ centered modal(桌面);同義詞展開 + ↑↓ Enter Esc
- **抽屜 prev/next**:drawer header `‹ N/Total ›` + 鍵盤 ←/→
- **抽屜條文修法歷史 timeline**(2026-05-02 #23):`fm.version_history: [{date, change, replaces?}]` → 抽屜 header 後渲染 香草色橫條 timeline;A-國內-005 已示範 3 筆(2024 / 2018 / 2014)
- **麵包屑 / 試算公式拆解 / lazy-render** 同前
- **信度系統**:496 explicit / 21 inferred / 3 contested + 三層免責 UI
- **後端事件追蹤(2026-05-02 #25)**:[06_workers/](../06_workers/) 含完整 Worker code + D1 schema + 部署 SOP;前端 `track()` helper + sendBeacon batch flush + 3 處埋點(switchView / scenario_apply / drawer_open);**`window.EVENTS_ENDPOINT = null` 預設 inert,部署後設值才啟用**
- **CI/CD**:GitHub Actions push to main 自動 7 步(build merged scenarios → MD validate → JSON Schema validate → audit → link check → build_index → sync DATA_VERSION → commit)
- **#2 ESM 拆檔(完整)**:[04_web/index.html](../04_web/index.html) 從 5430 行 → **260 行**;JS 拆 [`04_web/static/js/`](../04_web/static/js/) 5 module(`00_search_index.js` / `01_state.js` / `02_data.js` / `03_render.js` / `04_main.js`);全部 plain script + `?v=` cache-bust,共享 window scope(無 ES module 的 import/export 改寫,設計取捨見 [docs/_esm_split_plan.md](_esm_split_plan.md))

## Session 摘要（2026-05-08a）— LLM 精校 Phase 1–4 + Round 2（commit `2033dd0`）

**目標**：清理積壓 118 筆 llm待人工；刪除 TOC 殘渣；補 B 類摘要；廢止已刪除函釋。

### Phase 1（跨 session 延續）
前次 session 已完成 Phase 1（將空白摘要節點批次升為 自動初校）。

### Phase 2 — 補件 149 筆空白→自動初校
- 149 筆節點補自動初校後重送 LLM（5 batch × Haiku）
- 結果：57 pass + 51 fix = 108 升 llm精校；41 flag（llm待人工）

### Phase 3 — 國科會專章重審 253 筆
- `_reset_nsc_qna_to_draft.py --apply`：253 筆 NSC 節點 llm待人工 → 自動初校
- 9 batch × Haiku（QnA 專用 prompt）
- 結果：40 pass + 181 fix = 221 升 llm精校；32 re-flag

### Phase 4 — 118 筆 triage 決策執行
NICK 勾選全部 6 分組建議後執行 `_phase4_execute.py --apply`：
- Group 6（3 筆）：status → 已廢止，review_level → llm精校
- Group 5（3 筆）：補 B 類費率表人工摘要，review_level → llm精校
- Group 2（30 筆）：刪除 TOC 殘渣 MD 檔（節點數 1101 → 1071）
- Groups 1+3+4（78 筆）：重設自動初校供 LLM Round 2

### LLM Round 2 — 78 筆強化重審
- Round 2 PROMPT 強化：偏向 fix 而非 flag；D 類有答案必須 fix
- 3 batch × Haiku（30+30+18）
- 結果：42 pass + 31 fix = 73 升 llm精校；5 re-flag（llm待人工）

### 最終成果
| 狀態 | 本 session 前 | 本 session 後 |
|------|-------------|-------------|
| 🟢 llm精校 | ~477 | **925** |
| 🔴 llm待人工 | 118 | **24** |
| 🟡 自動初校 | 96 | **41** |
| 🔵 人工 | 80 | **81** |

剩餘 24 筆 llm待人工 = 真正無法自動處理（body 幾乎全 TOC 行或內容不足）。

**新增記憶體**：`feedback_pipeline_toc.md` — 未來 PDF 萃取不應保留 TOC 頁面內容（NICK 指示）。

---

## Session 摘要（2026-05-07e）— 情境檢索全面優化（commit `c2ceb28`）

- **P0 母題排序統一**：01_state.js / 02_data.js / 03_render.js 三組排序陣列統一為「國內→國外→酬勞→支出憑證→採購→餐費→物品→其他→教育訓練→國科會→教育部→成大」；先前三組不一致互衝
- **P0 條文庫去重**：A-國科會專章-001/002/003 標題修正為各自全文名稱（原標題「第?條 國家科學及技術委員會補助...」無法鑑別）；C-國內旅費-016/038 標題補具體主題（原「其他相關解釋..............」）
- **P1 重疊卡合併**：`change-transport` deprecated → `transport-substitute` sub_scenario；`senior-premium` / `discount-ticket` 設為 `premium-class` sub_scenarios（鑑別度提升）
- **P1 example 補充**：`abroad-airfare`（商務艙溢價試算 2 案例）、`procurement-amount-flow`（三級金額門檻試算 3 案例）
- **P2 新增情境卡 5 張**（117→122 可見；126 總含 deprecated）：
  - 教育訓練 +3：`training-subsidized-leave`（公費進修假差旅費）、`training-external-institution`（外部機構報名費/教材費）、`training-online`（線上課程費用，含跨年度分攤 example）
  - 採購 +2：`procurement-it-software`（軟體授權/訂閱採購，含跨年度分攤 example）、`procurement-service-vs-purchase`（勞務 vs 財物分界）
- **P2 cross_ref 補充**：abroad/foreign-receipt-payee ↔ voucher/foreign-receipt-no-payee 互指；lecture-natural-person → procurement-service-vs-purchase；domestic/training ↔ education/training-transport-lodging 互指
- **scenarios_manual.json rebuild**：126 卡，96 flow（79%），caveats 121，example 16

---

## Session 摘要（2026-05-07）— 四項資料整理任務

- **Task 1 — 國科會專章 sort_order 清除**：移除 19 個 MD 的 `sort_order` 欄位，讓排序 fallback 至 ID 末段數字，修正兩份法規（研究人力/補助計畫）交錯排列問題
- **Task 2 — 三母題合併為「餐費及其他支出」+ 物品管理 QA 逐條拆分**：移除 `餐費` / `物品管理` / `其他支出` 三母題；新建 33 個節點（8A + 1C + 24D，含 23 張物品管理逐條問答卡）；JS 常數全面同步
- **Task 3 — 教育部專章清理**：刪除 A-教育部專章-001/002（PDF 封面頁殘渣）；B-教育部專章-001 移入成功大學專章（E-成功大學專章-003）
- **Task 4 — E 類別改名 + 成功大學專章歸類**：`E_附屬法規及資料/成功大學專章/` 建立 3 卡（E-001~003）；CAT_LABEL.E + chip 按鈕文字改為「附屬法規及資料」
- **commit**：`a9af673`；**GitHub Pages CI 自動觸發**
- **Task 5 — 產學合作收入收支管理要點逐條拆分**：刪除 E-002 合併卡，建立 E-004~E-018（15 張逐條卡）；節點數 1126 → 1140；commit `9bbae5d`
- **Task 6 — 彈性支用額度作業要點逐點拆分**：A-國科會專章-004 錯置卡刪除、E-001 合併卡刪除；建立 E-019~E-025（7 張逐點卡，第一～七點）；節點數 1140 → 1145；commit `0cfb728`
- **Task 7 — E 類驗證修正**：`docs/03_id_convention.md` 補登 E 類別 + 成功大學專章 + WIP 母題清單；`04_validate.py` regex/TYPE_BY_CATEGORY 加入 E；E2/E7 錯誤全消；commit `0cfb728`
- **Task 8 — test 版可見性修正**：`license_lk_TEST_2026` KV 改 `visible_all:true`（舊 visible_parents 含已廢棄母題名）；`data_worker.js` SOP 更新；commit `aa6019f`
- **Task 9 — E 類 chip 隱藏邏輯移除**：`chip-e-hidden` 及所有 E 類特判移除；E 類卡片比照 A/B/C/D 正常顯示；commit `f03ebce`

---

## 校對狀態（資料層真實情形，2026-05-06 補完）

全部 1106 節點以 `review_level` 區分。本期健診後元資料補完進度（W2 後重評）：

- **summary 空缺率**：71.7%（789/1101 active；W2.1 LLM batch 尚未跑）
- **version=TODO 比例**：37.7%（415/1101 active；無可辨識日期，需人工）
- **無 reviewed 欄位筆數**：0（W2.3 backfill 完成）
- **DATA_VERSION**：`2026-05-06c`（W4.2 scenarios lazy load 後更新）

## 歷史摘要（按 session）

### 2026-05-06 續做 — W2 補完 + W3 清整 + W4.2 效能（commits `3a7c82c`～`6f037a6`）

**W2.5** — `_fix_titles_v3.py --apply`：290 筆 title 修正（P1過短 28 / P2前言模板 13 / P3過長 249）
**W2.6** — `01_extract.py` + `02_parse.py` 加 NFKC 正規化 + Kangxi 部首偵測警告（`unicodedata.normalize("NFKC")`）
**W2.7** — `04_validate.py` 新增 `write_completeness()`：基線寫入 `03_index/_meta.json`（summary 71.7% / version 37.7% / reviewed 0%）；新增 `--quick` 旗標供 02_parse 結束呼叫
**W3.3** — `02_parse.py` 尾端呼叫 `04_validate.py --quick`（不影響 exit code）
**W4.2** — scenarios 分層載入：`scenarios_index.json`(44KB) 優先；`scenarios_manual.json`(426KB) 背景 fetch 後 merge；flow modal await detail ready
**W4.7** — 刪 `scenarios_list.json`（已廢棄）、`_tmp_*.txt`；`.gitignore` 加 `_tmp_*.txt / json`；cache-bust → `2026-05-06c`

**腳本現況**（gitignored）：45 .py 活躍腳本（W3 目標達成）；`_build_scenarios_manual.py` 現同時產 `scenarios_index.json`
**待做**：W2.1 LLM batch summary（789 筆空缺）；W3.1 `_llm_batch_base.py` 基類；W4.1 rate_table 外部化；W4.4/W4.5 search_index → worker；W1.6 刪重複 PDF（最後）

### 2026-05-01 新增酬勞費母題

- **自動化來源探勘**:新增 [05_scripts/_fetch_sources.py](../05_scripts/_fetch_sources.py) 兩階段 CLI(--discover / --fetch),PARENT_SPECS dataclass 配置 — 支援主計總處 dgbas / 人事總處 dgpa / 友善專區 ebasnew(SN=2/15/16/17/47)/ 法務部 moj / 衛福部 lia-roc 五個來源;dgbas 用 `?media=print` 完整撈條文;ebasnew 撈 5 大類別(內審規定 / 解釋彙編 / 問答集 / 內審範例 / 支標手冊)
- **45 候選 → 57 檔下載 → 53 有效 MD**:候選 5 A 核心法規 + 38 B 支標手冊 + 1 C 內審範例 + 1 D 二代健保 QA(剩餘為附件 .docx/.odt 已抽);[01_extract.py](../05_scripts/01_extract.py) 加 HTML/ODT 支援(BeautifulSoup4 抽 main + 行去重 + 子串去重 / ZIP+content.xml 解析 ODT);_manifest.csv 配置驅動類別路由
- **法源位階規則更新**:A > B = C = D = 支標手冊(支標手冊不獨立,內容與 ABCD 重疊不重複收錄);未來找尋主計法規來源優先至友善專區網頁
- **4 階段管線跑完**:01_extract → 02_parse(53 草稿)→ _migrate_review_level + _redact_pii + _batch_autoreview → _llm_review(5 batch × 10 卡 並行 subagent → 3 pass / 30 fix / 16 flag);_retitle(2 batch × 25 卡 並行 → 46 卡 new_title 套用)
- **使用者反饋:刪 13 張彙編前言/凡例 C 卡**(C-國內 004/006/014/019/022/029/034 + C-國外 008/012/016/031/037/042 — 立法目的 / 體例 / 凡例 / 彙編索引 — 屬編印後設,非實質函釋);新增 [_audit_c_preamble.py](../05_scripts/_audit_c_preamble.py) 偵測工具
- **regression 清整**:刪 121 張 `_cleanup_C_國內旅費.py` 已清過再生的 TOC 殘渣 + 1 張 B-國外-001 + 2 張 A-酬勞費-011/013(法規系統 page-shell 重複,實際內容已在 -010/-012 支給表)
- **跨母題標記**:A-酬勞費-005(健保補充保費辦法)+ B-酬勞費-001(加班費)加 `pending_relocation` 欄位,待健保 / 加班費母題建立後遷移
- **前端整合**:01_state.js PARENTS 加酬勞費;02_data.js EXPENSE_LIST 加 5 類(講座鐘點費 / 出席費 / 稿費 / 兼職費 / 健保補充保費)— 但目前無情境卡,僅母題 chip 「酬勞費 48」可篩選
- **後續**:① 16 flag 卡待人工從原檔附件補 PDF 內文 ② 設計 18-25 酬勞費情境卡 + 3 widgets(鐘點費 / 出席費 / 二代健保補充保費試算) ③ D-酬勞費-001 二代健保 QA qa_split_failed 待人工分段 ④ 跨母題遷移健保 / 所得稅法

### 2026-05-02 改動摘要（commits `28ebbca` ~ `6886564`）

- **報告 1 #1-#20 短期+中期 16 項全完成** — _common.py / audit / smoke / link_check / JSON Schema / sync_data_version / scenarios 拆多檔 / DATA_VERSION 同步 CI / lookup_type registry / 鄰國 fallback / 同義詞 51 組 / related_inferred 獨立追蹤
- **#5 LLM 精校 481 卡**(subagent 16 batch + retry 3):442 升 llm精校 + 37 flag 為 llm待人工 + 2 殘留
- **#14 Decision tree 7→30**(自寫 5 + subagent 寫 18,refs 全對應真實 nodes)
- **#13 67 卡內容深化(8 卡 pilot)**:caveats 7→18(procurement-detail / voucher-receipts / meeting-meals / training / from-home / premium-class 等)
- **#2 ESM 拆檔完整**:Phase 2-4 完成,index.html 95% 縮減
- **報告 1 #23 #24 #25 長期** 全完成:law_version_history schema + timeline UI / mini Chinese bigram 索引(取代 FlexSearch)/ CF Workers + D1 events code(完整待 deploy)
- **全面 75 卡 中立角色 audit**:188 雜訊降到 5,實質修 3 卡(car-rental option a / abroad-basic 40→45 日 / abroad-incidental 撤回 C-047 法源位階)
- **2 份 Word 檢視報告**:[資料庫處理流程優化報告](_資料庫處理流程優化報告_2026-05-01.docx) + [資料庫資料夾整理報告](_資料庫資料夾整理報告_2026-05-01.docx)
- **資料夾整理**:刪 v2/v3/old.html + assets/* + scenarios.json/auto.json + design-preview/(以 git tag `v2-archive` / `v3-prototype` / `old-bubblechart` 取代);拆 CLAUDE.md(§15 → docs/changelog.md / §17 → docs/_review_log.md);_handoff 移到 docs/_archive/

### 2026-05-03 改動摘要（commits `d114b0d` ~ `ebd2fa7`）

- **三張 B 類標準表 rate_table 表格化**:B-國外專家-001(5 級別報酬表 + 機票補助說明 2 section) / B-國科會專章-001(壹酬金/生活費 8 類別 × 日支/月支 + 貳國際機票 3 艙等 × 6 地區) / B-教育部專章-001(膳費/住宿費/交通費 × 一般/國際性會議)
- **條文庫卡片排序改為 A→B→C→D → 母題 → sort_order → ID 末段**:新增 `TYPE_ORDER`(02_data.js)+ `PARENT_SORT_IDX`(原名 PARENT_ORDER,因與 03_render.js 陣列衝突改名);`filteredData()` 無 query/scenario 時統一使用此排序
- **母題 chip 順序更改**:`PARENTS`(01_state.js) = [支出憑證與結報, 國內旅費, 酬勞費, 國外旅費];`PARENT_ORDER`(03_render.js) = [支出憑證與結報, 國內旅費, 酬勞費, 國外旅費, 國外專家, 教育部專章, 國科會專章]
- **Splash 停留時間延長**:splashHold 3000ms → 3500ms(+0.5 秒呼吸感)
- **Bug fix**:02_data.js `PARENT_ORDER`(Object)與 03_render.js `PARENT_ORDER`(Array)在 window scope 重複 const 宣告 → 改名為 `PARENT_SORT_IDX` 解決；修正後情境畫面空白問題消失

### 2026-05-03 內容保護架構（commits `bd9422d` ~ `69f4f05`）

- **授權升級**:整理內容 CC BY 4.0 → **CC BY-NC-ND 4.0**（禁商業、禁改作）；程式碼改 All Rights Reserved；[LICENSE.md](../LICENSE.md) 全面改寫
- **使用條款強化**:[docs/terms.md](terms.md) 新增 §5 明確禁止（複製資料庫 / 建競爭性服務 / AI 訓練）+ §6 技術保護措施聲明 + §7 執行與救濟
- **robots.txt**:[robots.txt](../robots.txt) 封鎖 GPTBot / ClaudeBot / CCBot 等 18 個 AI 爬蟲；禁止爬取 `/03_index/` / `/02_markdown/` / `scenarios_manual.json`
- **05_scripts/ 私有化**:84 個腳本推至 **private repo `ntnick-web/gov-expense-pipeline`**，從 public repo 移除，.gitignore 加入排除規則
- **CF Workers 資料 API**:[06_workers/data_worker.js](../06_workers/data_worker.js) 新 Worker — nodes/scenarios 存 KV，Origin 驗證後才回傳；已部署至 `https://gov-expense-data.ntnick72.workers.dev`；[06_workers/wrangler_data.toml](../06_workers/wrangler_data.toml) 含完整設定（account_id + KV namespace id 已填）
- **核心資料移出 public repo**:`03_index/nodes.json`（768KB）+ `04_web/data/scenarios_manual.json`（424KB）移入 CF KV，GitHub repo 不再公開這兩個檔案；.gitignore 加入排除規則
- **前端切換 API 模式**:`04_web/index.html` 加 `window.DATA_API_BASE = 'https://gov-expense-data.ntnick72.workers.dev'`；`01_state.js` 的 `loadAllData()` 加 API fallback 邏輯（null = 直接 JSON，適用本機 dev）
- **驗證**：瀏覽器確認 578 節點 / 105 情境從 Worker API 正常載入，網站功能完整無損

### 2026-05-04 改動摘要（commit `804010e`）

- **B 類附表改列 A 類核心法規**:`B-國內旅費-001`(附表一旅費數額表)→ **`A-國內旅費-017`「附表一 國內差旅費數額表」**;`B-酬勞費-039`(稿費支給基準數額表)→ **`A-酬勞費-020`「附表 稿費支給基準數額表」**;更新 A-003 / A-009 related 參照;nodes.json 重建並上傳 CF KV
- **條文庫 A 類群組標頭計數徽章**:A 類群組標頭補 `N 筆` 計數徽章(比照 B/C/D 原有做法);`_groupCounts` 邏輯擴充涵蓋 A 類
- **移除頁首計數顯示**:條文庫 pagehead 的「Q&A · N 筆」計數顯示移除(不再需要)
- **Google Analytics GA4**:`G-1LTQGY50L2` 加入 `04_web/index.html`;追蹤裝置類別(桌面/行動/平板)+ 地區 + 完整 14 項自訂事件(tab切換/情境點擊/條文點擊/搜尋/複製/抽屜/比較/試算/⌘K/chip/翻頁/捲動深度/零結果)
- **flow redirect 修正**:`data-flow-redirect` 按鈕加 `e.stopPropagation()` 防止 click 冒泡至 backdrop 立即關閉;C0→overnight / C3→taxi 均正常運作
- **domestic.json C0 結論改寫**:「屬跨夜出差,請改用「跨夜住宿」情境」→「屬跨夜出差,請接續「跨夜住宿」條件問答」+ 加 `redirect_scenario: "overnight"`

### 2026-05-05 改動摘要（commit `f45b9c5`）

- **刪除 DQ9**:D-支出憑證與結報-009（折扣毋須平均分攤，非法規或函釋）移除
- **新增 5 個 WIP 母題（隱藏）**:`餐費` / `採購及履約` / `物品管理` / `其他支出` / `教育訓練`；PARENTS + WIP_PARENTS + EXPENSE_LAYER + EXPENSE_LIST + PARENT_SORT_IDX 全部同步更新
- **支出類別重構**:餐費 `['膳食費','茶水費']`（公務膳費+便當費合併，移除程序與通則）；其他支出加 `通信費`；教育訓練 `['訓練費補助','程序與通則']`
- **A-教育訓練-001**（原 A-其他-001）：遷移至新母題，清除 PDF 頁首殘渣，補正摘要
- **A-其他支出-001**（原 A-其他-002）：遷移至新母題，重整 2 欄 PDF 版面，補正摘要
- **Q033 大修**：清除全文 dump（350 行整份問答集），只保留 Q33 問答本文；tags 改 `採購結報`；related 清到僅 Q034；升 llm精校
- **Q048 / Q027 / Q050 tag 更新**：Q048 加 `膳食費`；Q027 加 `特支費`；Q050 `公務膳費` → `膳食費`
- **支出憑證與結報 tag 補強（前 session）**：Q013/Q016 加 `差旅費結報`；Q053-Q058 加 `補助與分攤`；Q066-Q078 加 `系統化結報`
- **索引重建 + CF KV 上傳**：`03_build_index.py` 613 節點；nodes.json 上傳 CF KV

### 2026-05-06 改動摘要（計畫 1-2-a-bcd 完成）

- **Phase 1 — 逐條卡片化（19 張新 A 類）**：A-國科會專章-001/002（整份文件 dump）刪除，改建 9 張（A-005~A-013 研究人力約用注意事項）+ 10 張（A-014~A-023 補助專題計畫經費處理原則）；A-003 改 B 類（B-國科會專章-002 耗材物品費範例表）；A-004 + A-教育部專章-001 移至新母題「成功大學專章」；A-教育部專章-002 拆成 12 張（A-教育部專章-003~014）；C-國內旅費-130 拆成 C-130 + C-164；C-國外旅費-001 補備註說明 100.3.31 停用段落
- **Phase 2 — EXPENSE_LAYER 更新**：國科會專章 改為 `['計畫申請資格','業務費','研究設備費','差旅費','管理費','程序與通則']`；新增「成功大學專章」WIP；01_state.js WIP_PARENTS 加成功大學專章
- **Phase 3 — A 類法規分組標頭 UI**：03_render.js 加 `extractLawName(d.source)` 分組標頭邏輯，依 source 欄位區分同母題多法規；03_build_index.py 補 `source` 欄位序列化；01_state.js `.map()` 補 `source: n.source || ''`
- **Phase 2.3 — 252 張 D-國科會專章 Q&A tag 補強**：`_enrich_nsc_tags.py` 批次加 EXPENSE_LAYER tag；231 張修改（業務費:97 / 研究設備費:9 / 程序與通則:82 / 差旅費:34 / 管理費:9）
- **Phase 5 — WIP 母題管線路由修復**：`01_extract.py` PARENT_KEYWORDS 加餐費/物品管理/採購及履約路由規則；Q050（原支出憑證與結報）移至 `D-餐費-001`；新建 `C-餐費-001`（各機關餐費標準解釋函）+ `D-物品管理-001`（物品管理手冊問答集 Q1-Q23）；採購及履約 0 卡（來源文件無符合關鍵字）；索引重建 1106 節點 + CF KV 上傳

## 3.B 未逐條拆解稽核結果（2026-05-05）

- 掃描全庫後 Q033 是唯一「整份文件 dump 進單一 MD」嚴重案例（已修正）
- 所有 D 類 QA 無殘留多問題合併；A 類支出憑證 24 條各自一檔
- D-國科會專章-001（40KB）屬結構化表格 Q&A 彙整，非合併問題

## 未做（留後續 session）

- **5 個 WIP 母題內容建設**：餐費 / 採購及履約 / 物品管理 / 其他支出 / 教育訓練 各需補齊 A/C/D 類卡片與情境
- **酬勞費母題情境卡**（P3，18-25 卡）
- 後續母題：共通性費用 / 加班費 / 公務車輛 / 採購法深化
- 59 卡 caveats / example / template 持續深化（ongoing）
- 13 個無 flow 卡的 decision tree（目標 ~50%）
- emoji icon → SVG icon system
- lazy-render 對抽屜內 MD 解析
- 試算 16~30 日「每日為日支表 1/20」分段計算
- **長期 #21-#22 #26-#28**（報告 1）：條文版本歷史補完 / Tauri 桌面版 / API 開放 / LLM「閱讀引導員」

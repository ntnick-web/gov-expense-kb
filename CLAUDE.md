# 政府支出法規知識庫 — AI 編碼指引

> 本檔為 Claude Code / AI 助手之常駐指引。每次開始工作前請先閱讀本檔與 `docs/` 內所有文件,理解後再動手。

---

## 1. 專案目標

將政府支出相關規定、解釋函令、問答集自動化處理為結構化 Markdown,
並建立三視圖(泡泡概覽 / 條文庫 / 關聯圖)的純靜態 HTML 視覺化介面,
供使用者快速查找、引用、比較條文。

**最終交付物**
- `02_markdown/` 內每條文 / 每函釋 / 每題一份 MD
- `03_index/` 自動產生的 JSON 索引
- `04_web/` 可直接開啟的 HTML 介面(從專案根目錄跑 `python -m http.server`)
- 線上版:<https://ntnick-web.github.io/gov-expense-kb/>(密碼 `1234`,僅客戶端遮罩,非真實認證)

**目前資料範圍**:630 節點(國內旅費 322 + 國外旅費 208 + 支出憑證與結報 100),全部已校對。
- 國內旅費:13 條條文 + 1 函釋 + 13 份 Q&A + 295 份解釋彙編 + 1 份附表標準表
- 國外旅費:22 條要點 + 2 份標準表 + 184 份解釋彙編
- 支出憑證與結報:23 條政府支出憑證處理要點 + 77 份經費結報常見疑義問答集

**校對狀態**:全部 630 份已標 `reviewed`(其中前 27 份國內旅費為人工精校;其餘為 `_batch_autoreview.py` 抽首段的自動初校,尾部標 `_(自動初校,待人工潤飾)_`,可挑重要逐份精校)。

---

## 2. 技術棧(已決定,勿擅自更換)

| 階段 | 工具 | 備註 |
|------|------|------|
| PDF 抽取 | Python 3.11 + `pdfplumber` | 文字型 PDF;lazy import |
| OCR | `paddleocr`(opt-in) | 掃描型 PDF,`--ocr` 才載入 |
| DOCX | `python-docx` | 含表格抽取 |
| 結構化 | Python + `PyYAML` + 規則式 regex | 中文數字 ↔ 阿拉伯轉換 |
| 索引 | 純 JSON | 前端載入後即用 |
| 前端搜尋 | 純 vanilla JS substring + 高亮 | 中文無需分詞;630 節點仍流暢,>1000 再評估 FlexSearch |
| 前端 | 純 HTML/CSS/JS,**無框架無 CDN** | 自包含 |
| 視覺化 | 純 SVG + Math 三角函數(泡泡圖) + 自寫力模擬(關聯圖) | 不引 D3 |
| 版控 | Git | 從第一天開始 |

**禁止**:資料庫、後端 API、前端框架(React/Vue/Angular)、jQuery、CDN 依賴。

**保留欄位**:`docs/01_architecture.md` 仍提及 D3.js 與 FlexSearch 為候選工具;實際實作改用更輕量自包含方案。若未來節點數爆增(>500)或中文搜尋出現需要分詞的情境,再評估引入 FlexSearch。

---

## 3. 資料夾規範

```
gov-expense-kb/
├── 00_source/        # 原始 PDF/DOCX/MD,唯讀,勿修改;依機關分子目錄
├── 01_extracted/     # 抽取後純文字 + .meta.json sidecar;依類別/母題分子目錄
├── 02_markdown/      # 結構化 MD ⭐ 單一事實來源(SSOT)
├── 03_index/         # 由腳本自動產生(nodes/edges/tags/search_index 4 份),勿手改
├── 04_web/           # 純靜態 HTML 三視圖介面
├── 05_scripts/       # 自動化腳本(01_extract / 02_parse / 03_build_index / 04_validate)
├── docs/             # 規格與決策文件
└── .claude/          # 本機 Claude Code 設定(launch.json 等)
```

**重要原則**
- `00_source/` 唯讀,任何處理結果都寫到別處
- `02_markdown/` 是 SSOT,人工只改這裡
- `03_index/` 完全由腳本產生,人工不動,可隨時 rebuild
- 三視圖共用 `03_index/*.json`,**不可為單一視圖另建資料源**
- `00_source/` 子資料夾按「機關」分(例:`04_主計總處/`);`01_extracted/`、`02_markdown/` 按「類別」分(`A_核心法規/`、`D_問答集/` 等)

---

## 4. ID 編碼規則(完整見 `docs/03_id_convention.md`)

格式:`{類別}-{母題}-{三位序號}`

- 類別:`A`=核心法規 / `B`=支出標準 / `C`=解釋函令 / `D`=問答集 / `N`=分類節點
- 母題:國內旅費 / 國外旅費 / 講座鐘點費 / 酬勞費 / 國外專家 / 其他 / 教育部專章 / 國科會專章 / **支出憑證與結報**
- 序號:`001` 起遞增,刪除不重用

範例:`A-國內旅費-005` = 國內旅費第五條;`A-支出憑證與結報-004` = 政府支出憑證處理要點第四條

> **改母題名稱的工具**:`05_scripts/_rename_parent.py` — 一次性更新 02_markdown / 01_extracted 的資料夾名 + 各 MD 的 `parent`/`id` 欄位 + meta.json,改完跑 `03_build_index.py` 重建索引。例:`python 05_scripts/_rename_parent.py 支出憑證 支出憑證與結報`。

---

## 5. MD Front-matter 必填欄位

完整規格見 `docs/02_data_schema.md`。最小必填:

```yaml
---
id: A-國內旅費-005
type: 核心法規
parent: 國內旅費
title: 第五條 交通費上限
tags: [交通費, 報支上限]
related: [C-國內旅費-002, D-國內旅費-001]
source: 行政院主計總處_國內旅費報支要點
version: 2024-01-15
---
```

**`reviewed` 欄位是「已校對」標記**:02_parse.py **不寫入**,留給人工校對時加。
- 02_parse.py 預設不覆寫已含 `reviewed:` 的檔(`should_skip` 安全網)
- 即使 `--force` 也不蓋已校對檔,需顯式 `--force-reviewed`
- 03_build_index.py 與前端據此區分「人工確認」與「草稿」狀態

---

## 6. 三視圖架構

| 視圖 | 用途 | 優先級 | 狀態 |
|------|------|--------|------|
| 泡泡概覽圖 | 首頁入口、母題視覺地圖 | **P0**(預設首頁) | ✓ 已實作 |
| 條文庫(左樹右文) | 日常查找主力 | P1 | ✓ 已實作 |
| 關聯圖 | 研究條文牽連 | P2 | ✓ 已實作 |

三者共用 `03_index/*.json`,只是渲染方式不同。

**泡泡概覽圖(P0)**
- 9 個母題泡泡 + 30+ 裝飾泡泡(隨機尺寸/色)
- 主泡泡大小依該母題節點數線性映射(min 4.5%、max 13% 容器短邊)
- 0 筆母題 → 灰色;有檔案 → 母題色彩(裝飾泡泡保持彩色但低透明)
- 不顯示節點數文字、無「政府支出」中心、不分內外環
- 容器佔滿整個 view(`flex: 1; width/height 100%`),viewBox 動態取 SVG rect
- circle packing 力模擬:主泡泡輕中心引力、裝飾泡泡推離至 ~45% 短邊環、互斥防重疊、邊界限制、重心校正
- 點主泡泡 → 切條文庫 + setFilter(parent)

**條文庫分類樹(三層)**
```
全部 ─ 母題 ─ 支出類別 ─ 類別代碼
                (依 EXPENSE_LAYER       (核心法規/
                 從 tag 推斷:           解釋函令/
                 交通費/生活費/         問答集/
                 程序總則/...)          支出標準)
```
- 「支出類別」中間層由 `EXPENSE_LAYER` 常數依 tags 推斷;**已定義**:國內旅費(交通/住宿/雜費/程序總則)、國外旅費(大陸港澳/出國進修/交通/生活/手續/保險/行政/禮品/程序總則)、支出憑證與結報(收據與發票/採購結報/系統化結報/補助與分攤/差旅費結報/酬勞與會議/程序總則)。新增母題在 [04_web/assets/app.js](04_web/assets/app.js) 補表
- **「程序總則」設計**:命中泛 tag(結報核銷/總則/法源依據等)無具體費用 tag 者落入,屬綜合性條文
- **鎖定母題模式**:從泡泡圖點某母題進條文庫時,樹根直接顯示為該母題、隱藏其他母題、支出類別預設展開、底部「↩ ← 全部母題」按鈕

**關聯圖(P2)**
- **靜態 layout**:打開時跑 320 次同步 packing iteration 收斂後一次 paint(無 RAF 動畫);拖曳節點直接 paint,釋放後保留新位置
- **動態邊界 `computeGraphBounds()`**:packing 與拖曳都尊重「右側過濾面板」「左上 scope banner」「標籤左右各 70px / 上下 24px 預留」推算的 inner box;當面板把可用寬度擠到不足面板 1.4× 時自動放棄避讓(避免擠成一條線)。SVG 尺寸與上次 packing 差異 >15% 時自動重新分布
- **Scope 過濾**:依 `state.filter.parent` 自動 scope,左上 banner「目前範圍:XX [顯示全部]」,可顯示該母題節點 + 跨母題鄰居
- **邊類型**:
  - 人工邊:`cites/explains/answers`(從 `related` 推導)
  - 推斷邊:`cites_inferred/answers_inferred`(`03_build_index.py` 從 body_plain 抽「第 N 條/點」「QN」自動產出)
  - 推斷邊用更淡點線(stroke-opacity 0.22),過濾面板可關掉
  - 同一 (from→to) 已有人工邊則跳過推斷
- **互動**:點節點 → 切條文庫並開抽屜;hover → tooltip + 一階關聯高亮

**必備功能(全部已實作)**
- 全文搜尋(純 substring + 高亮 + Ctrl+K 喚起)
- 麵包屑導航(政府支出 › 母題 › 支出類別 › 類別 › #tag)
- 標籤雲過濾(動態反映 visible nodes)
- 抽屜載入完整 MD(自製簡易 markdown parser)
- 反向連結(「本節點被以下引用」)
- 列印友善樣式(`@media print`)
- 深色模式切換(localStorage 記憶)
- 鍵盤捷徑(Ctrl+K、Esc、←/→)
- URL hash 直連節點

---

## 7. 編碼規範

**Python**
- type hints 必加(Python 3.10+ syntax,如 `list[str]`、`Optional[X]`)
- 函式單一職責,docstring 必寫
- 每個腳本可獨立執行,輸入輸出明確
- 路徑用 `pathlib.Path`,勿用字串拼接
- 重依賴(pdfplumber、paddleocr、python-docx)lazy import
- 共用工具函式以「複製貼上」為先(各腳本自包含),累積到 3+ 腳本同時用才抽 `_common.py`

**JavaScript**
- ES6+,模組化(`<script type="module">`)
- 不引 jQuery、不引 React/Vue
- 資料與顯示分離,**不可把資料寫死在 HTML**
- 前端從 `../03_index/` 載 JSON,從 `../02_markdown/` 載 MD 全文(需在專案根跑 server)
- SVG 元素一律用 `document.createElementNS('http://www.w3.org/2000/svg', ...)`(不要用 innerHTML 創 SVG)

**檔名與命名**
- 中文檔名允許(MD 檔、來源 MD)
- 變數名、函式名、ID 用英文
- Python:snake_case;JS:camelCase
- MD 檔名規則見 `docs/03_id_convention.md` §5

---

## 8. 禁止事項

- ❌ 引入 React / Vue / Angular / jQuery
- ❌ 從 CDN 載入大型 lib(D3、Marked、FlexSearch 等);若必要先評估自寫成本
- ❌ 修改 `00_source/` 內任何檔案
- ❌ 在 MD 內嵌 HTML 或 `<script>`
- ❌ 將資料硬編碼進 HTML
- ❌ 為單一視圖另建資料源(必須共用 JSON)
- ❌ 改寫條文全文(02_data_schema.md §2「條文必須逐字保留」)
- ❌ 把全形標點正規化為半形(同上)
- ❌ 把法律文書的「1、2、3、」轉成 markdown list(原文是編號,非列表)
- ❌ 自動覆寫已含 `reviewed:` 欄位的 MD(`--force-reviewed` 才能蓋)

---

## 9. 完成定義(Definition of Done)

每個功能交付前須滿足:
1. 可獨立執行,有明確輸入輸出
2. 提供 1 組範例輸入與預期輸出
3. README 或腳本 docstring 內有使用說明
4. `04_validate.py` 預設模式 exit 0(無 errors);可有 warnings(草稿狀態)
5. 若涉及前端,在實際瀏覽器(透過 HTTP server)跑過一遍,沒有 console error
6. Git commit 訊息清楚標註變動範圍

---

## 10. 標準管線執行

```bash
# 從專案根目錄
python 05_scripts/_compute_skip_list.py     # (新增來源批次後)識別重複/雜訊檔,寫 00_source/_skip.txt
python 05_scripts/01_extract.py             # 00_source → 01_extracted(自動跳過 _skip.txt 列出者)
python 05_scripts/02_parse.py               # 01_extracted → 02_markdown 草稿
python 05_scripts/_batch_autoreview.py      # (可選)批次自動初校:抽首段為摘要 + reviewed
# ... 人工精校重要節點(補 related、潤飾摘要、加備註) ...
python 05_scripts/03_build_index.py         # 02_markdown → 03_index/*.json(含推斷邊)
python 05_scripts/04_validate.py            # 一致性檢查
python -m http.server 8765                  # 啟動 server
# → 開瀏覽器訪問 http://localhost:8765/04_web/
```

或者用 Claude Code 內建:`preview_start "Static frontend (04_web)"` 從 `.claude/launch.json` 啟動,生命週期由 IDE 管理。

各腳本退出碼:`0` 成功 / `1` 環境錯誤 / `2` 有錯誤 / `3` `--strict` 且有警告。
所有主管線腳本支援 `--help`、`--dry-run`(若適用)、`-v`。

**輔助工具**(`05_scripts/_*.py`,非標準管線一部分,僅在特定情境使用):
- `_compute_skip_list.py` — 對 `00_source/` 找重複/雜訊檔(同 Q 號多檔取最小;政府支出憑證處理要點「人工指定 keep」),寫 `_skip.txt` 供 `01_extract.py` 跳過。EXTRA_SKIP 也可手動加(如已存在 .md 對應的重複 PDF)
- `_batch_autoreview.py` — 對所有 `02_markdown/` 內無 `reviewed:` 的草稿,抽 ## H2 區塊首段作為「重點摘要」、加 `reviewed: 今日`、`version=TODO → 2024-01-01` placeholder、摘要尾標 `_(自動初校,待人工潤飾)_`
- `_rename_parent.py` — 重新命名母題(改資料夾 + MD 內 `parent`/`id` + meta.json),改完跑 `03_build_index.py`

**00_source/ 的「準輸入」配置檔**(以 `_` 開頭,不算「修改原檔」):
- `_manifest.csv` — 對推斷不到類別/母題的檔案(如未含關鍵字的 .docx)指派 `category, parent, agency, version, doc_no`
- `_skip.txt` — 列出要排除的檔名(每行一個),供 01_extract.py 過濾

**01_extract.py 的母題推斷規則**(`PARENT_KEYWORDS`):
- **特定法規/問答集名稱優先**(如「經費結報常見疑義問答集」「政府支出憑證處理要點」),再排「母題本名」,最後才是泛費目詞
- 不要把「支出憑證」「鐘點費」這類**常被其他母題條文提及的費目名**單獨當關鍵字,會誤判
- 來源 MD 開頭若夾 `\f`(form feed,PDF→MD 轉檔殘留),會破壞 H1 + metadata 解析;`strip_md_header` 會在解析前移除

新增來源檔的 SOP 見 [docs/05_workflow.md](docs/05_workflow.md)。

---

## 11. 工作流程

開始任何任務前:
1. 先讀 `CLAUDE.md` + `docs/` 全部
2. 簡述你的理解,等待人類確認
3. 確認後再動手

任務範圍較大(>3 步驟、新增腳本、改前端架構等):
- 先用 plan 模式規劃,輸出計畫供確認
- 計畫核准後再實作

---

## 12. 重要決策紀錄

技術決策變更時,寫入 `docs/decisions.md`,格式:

```markdown
## YYYY-MM-DD: 決策標題
**背景**:...
**決定**:...
**理由**:...
**影響範圍**:...
```

---

## 13. 求助時機

遇到以下情況**停下來問人類**,勿自行決定:
- 法規條文切分規則模糊(例如附件、附表如何處理)
- 函釋編號規則不清
- 既有 MD 結構需要破壞性變更
- 引入新依賴或新工具
- 新母題的「支出類別」中間層該怎麼分(目前已定:國內旅費、國外旅費、支出憑證與結報)
- 推斷邊偵測規則需擴充(例:跨母題引用、附表編號)
- 母題重新命名(會動到所有 ID,雖然 `_rename_parent.py` 能批次改,但需人類確認影響面)

---

## 14. 已知擴充點(供未來迭代)

| 項目 | 何時需要 |
|------|---------|
| 新增其他母題(講座鐘點費、酬勞費、教育部專章...) | 補來源 MD/PDF + 在 `PARENT_KEYWORDS` 加識別字串 + 在 `EXPENSE_LAYER` 加新母題的支出類別表 |
| 推斷邊跨母題 | 目前 `build_inferred_edges` 限同 parent;若新增「主辦機關引用其他機關規定」情境,需放寬 |
| `_common.py` 共用模組 | 第 5 個腳本要用同樣工具時(目前 4 個腳本各自局部複製) |
| 並排比較模式 | 條文庫卡片右鍵 → 加入比較;抽屜變寬左右並排 |
| FlexSearch 中文分詞 | 節點數 > 1000 或開始有同義詞需求時(目前 630,vanilla substring 仍流暢) |
| 編輯介面 | drawer 加「+ 新增關聯」按鈕,從候選清單中(來自推斷邊)加入 related |
| 真伺服器端認證 | 若日後要放敏感資料,需移出 GitHub Pages → Cloudflare Workers / Vercel Functions / 自架 |

---

## 15. 線上部署(GitHub Pages)

- **線上版**:<https://ntnick-web.github.io/gov-expense-kb/> · 密碼 `1234`
- **repo**:<https://github.com/ntnick-web/gov-expense-kb>(public,branch=main,Pages source=`/`)
- **根目錄 [index.html](index.html)** 是 meta-refresh 重定向到 `/04_web/`,讓網址不用帶 `/04_web/` 後綴
- **密碼閘**:`04_web/index.html` 內嵌 IIFE,過後存 `sessionStorage('gate-ok-v1')`。改密碼:找 `EXPECTED = '1234'` 改字串
- **這層密碼是 UI 遮罩,不是真認證** — 任何人 F12 看 source 或 `curl https://.../03_index/nodes.json` 都能拿資料。內容是政府公開法規可公開,**請勿在此 repo 放任何敏感資訊**
- **更新流程**:本地改 → `python 05_scripts/03_build_index.py` → `git add . && git commit -m "..." && git push` → Pages 約 1–2 分鐘自動部署
- **不進 git 的檔**(`.gitignore`):`00_source/`(原檔避免版權與肥 repo)、`01_extracted/`(可由 02_markdown 重建)、`.claude/`(本機設定)
- **CDN 邊緣快取**約 10 分鐘,push 後若看到舊版本請強制重整(Ctrl+Shift+R)

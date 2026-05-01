# 政府支出法規知識庫

將政府支出規定、解釋函令、問答集自動化處理為結構化 Markdown,並建立 6 視圖(Landing 三入口 / 情境檢索 / 條文庫 / 試算表 / 抽屜 / 比較模式)的純靜態 HTML 視覺化介面。

**目前資料規模**:520 節點(國內旅費 204 + 國外旅費 215 + 支出憑證與結報 101),全部已校對(reviewed)。72 張可見情境卡 + 6 個情境樹 root + 482 條人工/推斷雙模式關聯邊。

線上版:<https://ntnick-web.github.io/gov-expense-kb/>

> **安全聲明**:本站完全公開,無存取控制 — 內容皆為政府公開法規,可公開傳布。請勿在此 repo 放置任何機密資訊。

> **授權**:程式碼 [MIT](LICENSE.md) / 整理內容 [CC BY 4.0](LICENSE.md) / 法規原文 屬政府公開資訊。引用方式見 [LICENSE.md](LICENSE.md)。

---

## 快速開始

```bash
# 1. 安裝 Python 依賴
pip install -r requirements.txt

# 2. 將原始 PDF/DOCX/MD 放入 00_source/{機關}/ 資料夾(按機關分類)
# 3. 維護來源清冊(可選,推斷不到時 fallback)
#    編輯 00_source/_manifest.csv,加新檔對應的 category/parent/version 等

# 4. 執行處理流程
python 05_scripts/01_extract.py             # 來源 → 純文字 + meta.json
python 05_scripts/02_parse.py               # 純文字 → 結構化 MD 草稿
python 05_scripts/_batch_autoreview.py      # (可選)批次自動初校:抽首段為摘要 + 加 reviewed
# ... 對重要節點人工精校(補 related、潤飾摘要、加備註) ...
python 05_scripts/03_build_index.py         # MD → JSON 索引(含正文引用偵測 → 推斷邊)
python 05_scripts/04_validate.py            # 一致性檢查

# 5. 啟動前端(必須從專案根跑 server,瀏覽器才能 fetch JSON 與 MD)
python -m http.server 8765
# 開瀏覽器訪問 http://localhost:8765/04_web/
```

如果使用 Claude Code,可以用 `preview_start "Static frontend (04_web)"` 透過 `.claude/launch.json` 啟動,生命週期由 IDE 管理。

---

## 資料夾結構

```
gov-expense-kb/
├── 00_source/        原始 PDF/DOCX/MD,按「機關」分子目錄(如 04_主計總處/)。唯讀
├── 01_extracted/     抽取後純文字 + .meta.json sidecar,按「類別/母題」分(A_核心法規/國內旅費/)
├── 02_markdown/      結構化 MD ⭐ 單一事實來源(SSOT),按類別/母題分
├── 03_index/         自動產生的 JSON 索引(nodes/edges/tags/search_index/_meta/rate_lookup 6 份),勿手改
├── 04_web/           純靜態 HTML 6 視圖介面(無框架、無 CDN);展示用情境設定於 04_web/data/
├── 05_scripts/       自動化腳本與一次性工具
├── docs/             規格、決策、變更紀錄、法源審查與已封存 handoff
└── .claude/          Claude Code 設定(launch.json 等)
```

---

## 文件索引

| 文件 | 用途 |
|------|------|
| [CLAUDE.md](CLAUDE.md) | AI 編碼助手常駐指引(最重要) |
| [docs/01_architecture.md](docs/01_architecture.md) | 系統架構與技術決策 |
| [docs/02_data_schema.md](docs/02_data_schema.md) | MD front-matter 與 JSON 規格 |
| [docs/03_id_convention.md](docs/03_id_convention.md) | ID 編碼規則 |
| [docs/04_ui_spec.md](docs/04_ui_spec.md) | 三視圖介面規格 |
| [docs/05_workflow.md](docs/05_workflow.md) | 新增來源檔 SOP |
| [docs/06_tags_taxonomy.md](docs/06_tags_taxonomy.md) | 標籤分類系統 |
| [docs/decisions.md](docs/decisions.md) | 重要技術決策紀錄(ADR) |
| [docs/changelog.md](docs/changelog.md) | 大型重構 / 設計轉換歷史 |
| [docs/_review_log.md](docs/_review_log.md) | 法源審查 SOP 與紀錄 |
| [docs/_archive/](docs/_archive/) | 已封存 handoff 文件 |

---

## 6 視圖

| 視圖 | 用途 | 優先級 |
|------|------|--------|
| Landing 三入口卡 | 首頁,新手三選一聚焦 | **P0**(預設首頁) |
| 核銷情境檢索 | 使用者語言入口、深 link 到條文 | P1 |
| 條文庫(chip filter+卡片+抽屜) | 日常查找主力 | P1 |
| 試算表 | 日支生活費 + 外交部保險費試算 | P2 |
| 抽屜(Drawer) | 條文全文 + 相關規定 + prev/next | 隨條文庫 |
| 比較模式 | 2-3 卡並排 + metadata diff | P2 |

共用 `03_index/*.json` + `04_web/data/scenarios_manual.json`(展示用,非 SSOT)。

**互通設計**
- 任何時候點 topnav brand「核銷這樣做!!!」回 Landing 並清掉所有 filter
- 情境卡片點擊 → 切到條文庫並套用情境過濾(primary_ids 置頂 + tag ≥2 命中)
- 條文庫卡片點擊 → 開啟抽屜載入完整 MD + 相關規定
- 抽屜內「+ 加入比較」→ 浮動底部 compare-bar 累積 → 並排 modal(2-3 張)
- ⌘K Spotlight 全螢幕搜尋(分組顯示頁面 + 情境 + 條文)

---

## 自動化機制

| 機制 | 說明 |
|---|---|
| **正文引用偵測** | `03_build_index.py` 掃 body 抓「第 N 條/點」「QN」,自動產生 `cites_inferred / answers_inferred` 邊。前端用淡點線顯示,可過濾切換 |
| **批次自動初校** | `_batch_autoreview.py` 抽首段為摘要、加 `reviewed`,讓初次新增的草稿快速進入「可瀏覽」狀態,摘要尾標示 `_(自動初校,待人工潤飾)_` |
| **`reviewed` 安全網** | `02_parse.py` 不寫入 `reviewed`;含 `reviewed` 的 MD 即視為已校對,`--force` 不蓋,需 `--force-reviewed` 才能覆寫 |
| **支出類別中間層** | 條文庫分類樹於母題下自動依 tag 推斷支出類別(交通費/生活費/...),由 `EXPENSE_LAYER` 表定義 |

---

## 開發狀態

- [x] 文件規格底定
- [x] 範例 MD 樣本建立
- [x] 抽取腳本 `01_extract.py`(PDF/DOCX/MD 通用,OCR 為 opt-in)
- [x] 切分腳本 `02_parse.py`(中文數字 ID、reviewed 安全網、Q&A 切分)
- [x] 索引腳本 `03_build_index.py`(6 份 JSON + 正文引用推斷邊 + rate_lookup)
- [x] 驗證腳本 `04_validate.py`(errors/warnings 分級)
- [x] 批次自動初校工具 `_batch_autoreview.py`
- [x] LLM 16 batch subagent 模式(`_retitle_*` / `_resummary_*`)
- [x] 信度系統 `_mark_certainty.py`(explicit / inferred / contested)
- [x] GitHub Actions CI(push to main 自動 validate → build_index)
- [x] HTML Landing 三入口(P0,左中右並排,行動版堆疊)
- [x] HTML 條文庫視圖(P1,4 排 chip filter + 卡片 + 抽屜 + ⌘K Spotlight)
- [x] HTML 情境檢索(P1,情境樹 root + sub_scenarios + 條件問答 modal)
- [x] HTML 試算表(P2,日支生活費公式拆解 + 外交部保險費 widget)
- [x] HTML 比較模式(P2,2-3 卡並排 + metadata diff)
- [x] 馬卡龍 7 色 token + WCAG AA 設計系統

---

## 授權與聲明

本知識庫**雙授權**:
- **程式碼**(`05_scripts/`、`04_web/`):[MIT License](LICENSE.md)
- **整理內容**(摘要、tags、related、情境、文件):[Creative Commons BY 4.0](LICENSE.md)
- **法規原文**:依《著作權法》§9 屬政府公開資訊,公有領域

歡迎自由使用、改作、商業引用,僅需姓名標示(歸屬本知識庫)。

**引用範本**:
> NtN (2026)。政府支出法規知識庫。摘自 https://ntnick-web.github.io/gov-expense-kb/,授權 CC BY 4.0。

**重要聲明**:
- 本工具僅供**查詢輔助**使用,正式引用、報支、決策請以**主管機關公告之最新版本**為準
- 維護者已盡力確保準確性,但**不對使用本資料造成之損失負責**
- 詳見 [使用條款](docs/terms.md) 與 [隱私聲明](docs/privacy.md)

**使用統計**:本站使用 Cloudflare Web Analytics 蒐集**匿名**瀏覽統計(無 cookie、無 PII),用於改善內容。詳見[隱私聲明](docs/privacy.md)。

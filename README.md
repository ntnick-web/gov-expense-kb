# 政府支出法規知識庫

將政府支出規定、解釋函令、問答集自動化處理為結構化 Markdown,並建立三視圖(泡泡概覽 / 條文庫 / 關聯圖)的純靜態 HTML 視覺化介面。

**目前資料規模**:630 節點(國內旅費 322 + 國外旅費 208 + 支出憑證與結報 100),全部已校對。

線上版:<https://ntnick-web.github.io/gov-expense-kb/>

> **安全聲明**:本站完全公開,無存取控制 — 內容皆為政府公開法規,可公開傳布。請勿在此 repo 放置任何機密資訊。

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
├── 03_index/         自動產生的 JSON 索引(nodes/edges/tags/search_index 4 份),勿手改
├── 04_web/           純靜態 HTML 三視圖介面(無框架、無 CDN)
├── 05_scripts/       自動化腳本與一次性工具
├── docs/             規格與決策文件
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
| [docs/decisions.md](docs/decisions.md) | 重要技術決策紀錄 |

---

## 三視圖

| 視圖 | 用途 | 優先級 |
|------|------|--------|
| 泡泡概覽圖 | 首頁入口、母題視覺地圖 | **P0**(預設首頁) |
| 條文庫(三層樹+卡片+抽屜) | 日常查找主力 | P1 |
| 關聯圖 | 研究條文牽連、靜態力佈局 | P2 |

三者共用 `03_index/*.json`,不重複維護資料。

**互通設計**
- 泡泡圖點母題 → 切到條文庫並鎖定該母題(隱藏其他母題)
- 條文庫於鎖定模式下切到關聯圖 → 自動 scope 該母題(顯示該母題節點 + 跨母題鄰居)
- 關聯圖點節點 → 切回條文庫並開啟抽屜

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
- [x] 索引腳本 `03_build_index.py`(4 份 JSON + 正文引用推斷邊)
- [x] 驗證腳本 `04_validate.py`(errors/warnings 分級)
- [x] 批次自動初校工具 `_batch_autoreview.py`
- [x] HTML 條文庫視圖(P1,三層樹 + 卡片 + 抽屜 + 搜尋)
- [x] HTML 泡泡概覽圖(P0,佔滿頁面、0 筆灰色、裝飾泡泡)
- [x] HTML 關聯圖(P2,靜態 layout、scope 過濾、推斷邊區分)

---

## 授權與聲明

本知識庫整理之法規條文、函釋、問答集均為政府公開資訊。
本工具僅供查詢輔助使用,正式引用請以主管機關公告版本為準。

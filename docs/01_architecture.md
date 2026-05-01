# 系統架構與技術決策

> 最後更新:2026-05-01。歷史變更見 [changelog.md](changelog.md);早期 ADR 見 [decisions.md](decisions.md)。

---

## 1. 系統總覽

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  00_source   │───▶│ 01_extracted │───▶│ 02_markdown  │───▶│  03_index    │
│  PDF/DOCX    │    │   純文字     │    │  結構化 MD   │    │  6 份 JSON   │
└──────────────┘    └──────────────┘    └──────────────┘    └──────┬───────┘
       ▲                   ▲                   ▲                   │
       │                   │                   │                   ▼
   人工放檔        01_extract.py        02_parse.py          ┌──────────────┐
                                       + autoreview           │   04_web     │
                                       + LLM 16 batch         │  6 視圖介面  │
                                       + 法源審查 SOP         └──────────────┘
                                                                      │
                                                                      ▼
                                                              ┌──────────────┐
                                                              │ GitHub Pages │
                                                              │ + CF Web     │
                                                              │   Analytics  │
                                                              └──────────────┘
```

**核心原則**
- 單向資料流:左→右,不回流
- 每階段產物可獨立檢視
- `02_markdown` 為單一事實來源(SSOT),其他可重建
- 中立角色(不下判斷,每結論需有真實 A/B/C/D 法源 — 詳見 [_review_log.md](_review_log.md))

**6 視圖架構**(2026-04-30 起,取代舊版 4 視圖)

| 視圖 | 內容 | 預設 |
|------|------|------|
| Landing 三入口 | Hero「核銷這樣做!!!」+ 情境/條文/試算三卡 | ✅ 預設首頁 |
| 情境檢索 | 6 個 root + sub_scenarios + 條件問答 modal | |
| 條文庫 | 4 排 chip filter + 卡片網格 + 抽屜 + ⌘K Spotlight | |
| 試算表 | 日支生活費(公式拆解)+ 外交部保險費 widget | |
| 抽屜 | 條文全文 + 相關規定(出/入)+ prev/next + 比較加入 | |
| 比較模式 | 2-3 卡並排 + metadata diff + 馬卡龍 | |

舊「母題泡泡圖」與「關聯圖」於 2026-04-30 退役(關聯圖程式碼仍在但 hidden;泡泡圖已從 v2 設計拿掉)。

---

## 2. 技術棧決策

### 2.1 為何用 Python 處理後端

| 候選 | 選擇 | 理由 |
|------|------|------|
| **Python** ✓ | 採用 | PDF/OCR 生態最成熟,中文處理工具多 |
| Node.js | 否決 | PDF 抽取庫品質落後 Python |
| Go/Rust | 否決 | 開發速度慢,原型階段不適合 |

### 2.2 為何用純前端、不用框架

| 候選 | 選擇 | 理由 |
|------|------|------|
| **純 HTML/CSS/JS** ✓ | 採用 | 零建置、可直接開啟、易部署 |
| Vue 3 | 暫緩 | 上線後若需重構再換 |
| React | 否決 | JSX 對非工程師維護門檻高 |

### 2.3 為何用 JSON、不用資料庫

- 資料量小(預估 < 500 個節點),JSON 完全夠用
- 純前端可載入,不需後端
- Git diff 可讀,版控友善
- 未來若上線需要資料庫,JSON 可一鍵匯入

### 2.4 視覺化:純 SVG + 自寫力模擬(D3 列為候選未引)

| 候選 | 選擇 | 理由 |
|------|------|------|
| **純 SVG + 自寫力模擬** ✓ | 採用 | 自包含、無 CDN;對 < 500 節點完全足夠 |
| D3.js | 暫緩 | 列為候選但未引入,~250KB 額外負擔 |
| Cytoscape/Vis.js | 否決 | 客製化彈性差 |

實作:泡泡圖用三角函數定位 + circle packing + 重心校正(~120 行);關聯圖用 Coulomb-spring 模擬同步收斂(無 RAF 動畫,~100 行)。若未來節點數爆增(>500)或需要更複雜的圖演算,再評估引入 D3 force module。

### 2.5 搜尋:純 substring + 高亮(FlexSearch 列為候選未引)

| 候選 | 選擇 | 理由 |
|------|------|------|
| **純 vanilla JS substring** ✓ | 採用 | 自包含;對中文無需分詞;< 500 節點毫秒級回應 |
| FlexSearch | 暫緩 | 列為候選但未引入;若需中文分詞或同義詞時再評估 |
| Lunr | 否決 | 中文支援不足

---

## 3. 資料流與責任分工

| 階段 | 輸入 | 輸出 | 自動化程度 | 負責人 |
|------|------|------|------------|--------|
| 來源盤點 | 原始檔 | `_manifest.csv` | 人工(可選) | 業務 |
| 抽取 | PDF/DOCX/MD | 純文字 + .meta.json | 全自動 | `01_extract.py` |
| 切分 | 純文字 | MD 草稿 | 全自動(1:1 映射) | `02_parse.py` |
| **批次自動初校** | MD 草稿 | MD 含 reviewed + 自動摘要 | 全自動 | `_batch_autoreview.py` |
| 人工精校 | 自動初校 MD | 人工定稿 MD | 人工(挑重點) | 業務 |
| 索引 | MD 定稿 | JSON(含推斷邊) | 全自動 | `03_build_index.py` |
| 驗證 | MD + JSON | 0 errors | 全自動 | `04_validate.py` |
| 渲染 | JSON + MD | HTML 三視圖 | 全自動 | 瀏覽器 |

**人工介入點**:
1. 來源盤點(可選,manifest 沒對應時自動推斷)
2. **MD 精校**:補 `related`、潤飾自動摘要、加備註
3. (可選)新增母題的 `EXPENSE_LAYER` 表(於 [04_web/assets/app.js](04_web/assets/app.js))

「批次自動初校」讓初次新增的草稿快速進入可瀏覽狀態(摘要尾標 `_(自動初校,待人工潤飾)_`),配合「正文引用偵測 → 推斷邊」機制,即使尚未人工補 `related` 也能在關聯圖看到合理連線。

---

## 4. 擴充性考量

### 4.1 新增母題
1. 更新 `docs/03_id_convention.md` 母題清單
2. 在 `02_markdown/` 各分類下建立子資料夾
3. 重跑 `03_build_index.py`

### 4.2 新增節點類別
1. 在 `docs/02_data_schema.md` 新增 `type` 列舉值
2. 在 `docs/03_id_convention.md` 分配新類別代碼
3. 更新 `04_validate.py` 驗證邏輯
4. 更新前端視圖之分類顯示

### 4.3 上線部署
- **靜態託管**(GitHub Pages / Netlify / Cloudflare Pages):直接上傳 `04_web/` + `03_index/`
- **內網部署**:Nginx 直接 serve 靜態檔
- **加上後端**:若需要使用者編輯、留言,再考慮加 FastAPI + SQLite

---

## 5. 效能(實測 2026-05-01)

- 節點數:520(國內 204 + 國外 215 + 支出憑證 101)
- `nodes.json` 約 700 KB / `edges.json` 約 50 KB / `search_index.json` 約 350 KB / `rate_lookup.json` 約 30 KB
- 條文庫 lazy-render:首批 30 卡 + IntersectionObserver(rootMargin 400px)
- 情境視圖:首批 3 sections,page height 19887 → 4936px(降 75%)
- 首頁載入時間:桌面 < 0.5 秒、行動裝置 4G < 1.5 秒

---

## 6. 安全性與隱私

- 純靜態檔,無後端攻擊面
- 完全公開無存取控制(內容皆政府公開法規)
- Cloudflare Web Analytics:無 cookie / 無 PII / GDPR 友善
- 詳見 [privacy.md](privacy.md)

---

## 7. 已知擴充點

- 新增母題:在 `PARENT_KEYWORDS` 加識別字串 + `EXPENSE_LAYER` 加支出類別表 + `_normalize_tags.py` `ENRICH_RULES` 加關鍵字
- 主推下一輪母題:酬勞費(講座 / 出席 / 稿費),預估 18-25 卡
- 後續 5 母題順序:共通性費用 → 加班費 → 公務車輛 → 教育部 → 國科會
- 推斷邊獨立追蹤(目前 482 條全混雜為人工邊)
- index.html(5424 行)拆 ESM module
- 節點 > 1000 時引入 FlexSearch 中文分詞

完整擴充清單見 [CLAUDE.md](../CLAUDE.md) §14。

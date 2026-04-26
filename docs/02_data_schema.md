# 資料規格(Data Schema)

> 所有 MD front-matter 與 JSON 索引的權威規格。修改本檔需同步更新範例 MD 與腳本。

---

## 1. Markdown Front-matter 規格

每份 MD 開頭必含 YAML front-matter,以 `---` 包夾。

### 1.1 欄位定義

| 欄位 | 型別 | 必填 | 說明 | 範例 |
|------|------|------|------|------|
| `id` | string | ✓ | 唯一識別碼,格式見 `03_id_convention.md` | `A-國內旅費-005` |
| `type` | enum | ✓ | 節點類別 | `核心法規` |
| `parent` | string | ✓ | 所屬母題 | `國內旅費` |
| `title` | string | ✓ | 條文/函釋/題目標題 | `第五條 交通費上限` |
| `tags` | array<string> | ✓ | 自由標籤,至少 1 個 | `[交通費, 報支上限]` |
| `related` | array<id> | ✗ | 關聯節點 ID(人工邊;推斷邊由 `03_build_index.py` 額外產出) | `[C-國內旅費-002]` |
| `source` | string | ✓ | 來源檔名/法規名稱 | `行政院主計總處_國內旅費報支要點` |
| `version` | date | ✓ | 法規版本日期(YYYY-MM-DD) | `2024-01-15` |
| `reviewed` | date | ✗ | 校對日期。**有此欄位 = 已校對**(自動或人工);用於 `02_parse.py` 的安全網,`--force` 不蓋,需 `--force-reviewed` | `2026-04-25` |
| `agency` | string | ✗ | 發布機關(函釋必填) | `行政院主計總處` |
| `doc_no` | string | ✗ | 發文字號(函釋必填) | `主會字第1090051074B號` |
| `status` | enum | ✗ | 法規狀態,預設 `現行`。允許值:`現行` / `部分修正` / `已廢止` | `現行` |
| `source_url` | url | ✗ | 原始法規/函釋的官方網頁/PDF 連結,前端卡片會顯示為「原始出處」按鈕 | `https://www.dgbas.gov.tw/...` |
| `summary_pending` | bool | ✗ | 由 `_cleanup_*` 腳本自動加上,代表摘要尚為占位符 | `true` |

**`reviewed` 安全網**
- `02_parse.py` 不寫入 `reviewed`(留給人工 / `_batch_autoreview.py` 補)
- 若 dst 已含 `reviewed`,`02_parse.py` 預設跳過,即便 `--force` 也跳;需要 `--force-reviewed` 才覆寫
- 前端用此欄位區分「已校對」(有 = 不顯示草稿 flag)與「草稿」(無 = 顯示橘色 flag)

**`_batch_autoreview.py` 自動初校標記**
批次自動初校時:抽 H2 區塊首段為「重點摘要」,在區塊尾加 `_(自動初校,待人工潤飾)_` 斜體標記。使用者可一眼辨識「自動」vs「人工精校」狀態。

### 1.2 `type` 列舉值

- `核心法規` — 法規條文(對應 ID 類別 A)
- `支出標準` — 標準表、額度表(對應 B)
- `解釋函令` — 主管機關函釋(對應 C)
- `問答集` — 常見問答(對應 D)
- `分類節點` — 虛擬節點,僅供關聯圖使用(對應 N)

### 1.3 `tags` 命名建議

- 使用名詞,不用動詞
- 2-6 個字
- 跨母題可共用(如「交通費」可同時屬於國內旅費與國外旅費)
- 標籤清單維護於 `docs/tags_taxonomy.md`(待建)

---

## 2. Markdown 內文結構

front-matter 之後,內文採固定區塊:

```markdown
---
(front-matter)
---

## 條文全文

(逐字保留原文,勿改寫)

## 重點摘要

(3-5 句話的人類可讀摘要,可由 AI 產生但需人工校對)

## 相關規定

- [A-國內旅費-002](../A_核心法規/國內旅費/第02條_旅費項目及數額.md) — 旅費項目
- [C-國內旅費-001](../C_解釋函令/國內旅費/C001_交通費手續費.md) — 手續費函釋

## 備註

(版本變更紀錄、實務注意事項)
```

**規則**
- 「條文全文」必須逐字保留,不得改寫或省略
- 「重點摘要」為輔助,使用者點開時優先看到全文
- 內部連結使用相對路徑

---

## 3. JSON 索引規格

由 `05_scripts/03_build_index.py` 自動產生,**人工勿改**。

### 3.1 `nodes.json`

所有節點清單,前端載入後可直接渲染。

```json
[
  {
    "id": "A-國內旅費-005",
    "type": "核心法規",
    "parent": "國內旅費",
    "title": "第五條 交通費上限",
    "tags": ["交通費", "報支上限"],
    "file_path": "02_markdown/A_核心法規/國內旅費/第05條_交通費上限.md",
    "version": "2024-01-15",
    "summary": "(自重點摘要區塊抽出,前 100 字)",
    "status": "現行",
    "source_url": "https://...(若 front-matter 提供)",
    "summary_pending": true
  }
]
```

### 3.2 `edges.json`

節點間關聯,供關聯圖視圖使用。

```json
[
  {
    "from": "A-國內旅費-005",
    "to": "C-國內旅費-002",
    "relation": "explains",
    "inferred": false
  },
  {
    "from": "D-國內旅費-002",
    "to": "A-國內旅費-005",
    "relation": "cites_inferred",
    "inferred": true,
    "matched": "第 5 點"
  }
]
```

**欄位**
- `from` / `to`:節點 ID
- `relation`:關聯類型(列舉見下)
- `inferred`:`true` 為腳本自動推斷邊,`false` 為人工 `related` 邊
- `matched`(僅推斷邊):正規式命中的原始字樣(例 `第 5 點`),供除錯與審查

**`relation` 列舉值**

人工邊(`inferred: false`)
- `cites` — A 引用 B(條文間互引)
- `explains` — 函釋說明條文
- `answers` — Q&A 回答條文相關問題
- `belongs_to` — 屬於分類節點(N 類)

推斷邊(`inferred: true`,由 `03_build_index.py` 從 body_plain 自動偵測)
- `cites_inferred` — 正文有「第 N 條/點」字樣 → 連到對應 A 類條文
- `answers_inferred` — 正文有「QN」字樣 → 連到對應 D 類 Q&A

**去重規則**:同一 (from, to) pair 已有人工邊則不再加推斷邊;前端用更淡的點線顯示推斷邊,過濾面板「自動推斷」checkbox 可切換顯示。

### 3.3 `tags.json`

母子標籤樹,供標籤過濾 UI 使用。

```json
{
  "母標籤": {
    "國內旅費": ["交通費", "住宿費", "雜費", "自駕租賃", "特殊情形"],
    "國外旅費": ["機票", "生活費", "保險費"]
  },
  "自由標籤": {
    "交通費": { "count": 12, "node_ids": ["A-國內旅費-005", "..."] }
  }
}
```

### 3.4 `search_index.json`

FlexSearch 預建索引,前端載入後即可全文搜尋。
產出方式見 `05_scripts/03_build_index.py` 內註解。

---

## 4. `_manifest.csv` 規格

`00_source/_manifest.csv` 為原始檔清冊,人工維護。

| 欄位 | 必填 | 說明 |
|------|------|------|
| `filename` | ✓ | 檔名(含副檔名) |
| `category` | ✓ | A / B / C / D |
| `parent` | ✓ | 母題 |
| `agency` | ✓ | 發布機關 |
| `version` | ✓ | 版本日期 |
| `notes` | ✗ | 備註 |

---

## 5. 驗證規則

`05_scripts/04_validate.py` 應檢查:

1. 所有 MD 的 `id` 唯一
2. `id` 格式符合規則
3. `related` 中的 ID 都實際存在
4. `type` 與 ID 第一碼一致(A→核心法規)
5. `parent` 在合法母題清單內
6. `version` 為合法日期格式
7. `source` 對應檔案存在於 `00_source/`

驗證失敗時印出具體檔名與問題,以非零代碼結束。

---

## 6. 變更管理

修改本規格時:
1. 在 `docs/decisions.md` 記錄變更理由
2. 同步更新範例 MD(`02_markdown/` 內的樣本)
3. 更新 `04_validate.py` 驗證邏輯
4. 對既有 MD 執行批次遷移腳本(若需要)

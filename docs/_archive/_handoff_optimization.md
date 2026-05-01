# 資料庫優化專案交接 — 2026-04-29

> 依 3 份外部建議報告(免責設計 / 情境自動化 / 標籤鏈結)落地的 5 階段優化專案紀錄。
> 完成 4.5 / 5 階段,Phase 3b decision tree 擴充與 D1 related 區分留作後續。

---

## 已完成階段(Phase 1-4 + Phase 5 部分)

### Phase 1 — 信度系統 schema + validator 升級 [4a86ea7]

- `docs/02_data_schema.md` 文件化 6 個新欄位:`certainty` / `disclaimer_level` / `no_inference_note` / `effective_period`(已有)/ `superseded_by`(已有)/ `review_level=草稿`
- `status` 從 3 值擴成 4 值:`現行 / 被取代 / 修正中 / 已廢止`(原「部分修正」拆兩語意)
- `04_validate.py` 加 E11 / W7 / W8 / W9 規則(列舉值、tags 上限、superseded 鏈)

### Phase 2 — summary 全面情境句型化 [6d9c343]

- 寫 `_resummary_build_batches.py` + `_resummary_apply.py`
- 16 批 subagent 重寫 479 張卡 summary 為「適用場景+核心規定+關鍵限制」格式
- 平均長度 119 字 → 50 字
- C-國外-177 過長手動 patch(86→65)
- summary_pending 警告從 16 降到 1

### Phase 3a — 情境自動化基底 [01cf91a]

- `04_web/data/scenarios.json` 拆兩份:
  - `scenarios_manual.json` — 76 個既有手寫情境
  - `scenarios_auto.json` — 43 個 build_scenarios.py 自動生成
- 寫 `build_scenarios.py` — 規則式 summary→question 轉換,標 `source: auto`
- 前端 `loadAllData` 載兩份合併;舊 scenarios.json 保留 fallback
- 自動產生卡片加灰色 dashed「🤖 自動產生」徽章 + opacity .82 降權

### Phase 4 — certainty 標記 + UI 三層免責 [ee2591f]

- 寫 `_mark_certainty.py` 規則式 heuristic(無 LLM,免費快速)
- 標 519 個現行節點:**496 explicit / 21 inferred / 3 contested**(95/4/1 分布,符合報告 1 預估)
- `03_build_index.py` 擴 Node 序列化 certainty 系列欄位到 nodes.json
- 前端三層免責:
  - **第二層**(常駐):每張卡抽屜底部 40 字標準免責
  - **第三層**(條件):inferred/contested 抽屜頂部紅 banner + 「請洽主計室確認」
  - **卡片網格**:右上角「⚠ 推論 / 爭議」徽章

### Phase 5(部分) — GitHub Actions [本 commit]

- `.github/workflows/validate-and-build.yml`
  - 觸發:push to main 改動 `02_markdown/**` 或 build/validate 腳本
  - 流程:validate → 重建 03_index → 重建 scenarios_auto.json → 自動 commit 回 main
  - GitHub Pages 接著自動部署

---

## 未完成(留後續)

### Phase 3b — Decision Tree 擴充至 ~30(從目前 7 PoC)

工法:類似 Phase 2 的 16 批 subagent,讓每個 expense layer 設計 2-3 個 decision tree。**需另一輪 LLM batch session**。
推薦先做高頻 expense:交通費(已有 4 個)、住宿費(0)、生活費(1)、收據與發票(1)。

### Phase 5.D1 — related 區分人工 vs 自動

目前 482 條 related 邊全部混雜(2026-04-27 `_write_inferred_related.py` 把推斷邊回寫到 SSOT)。
報告 3 建議人工 related 只保留 4 種真補充關係(特別法 vs 普通法 / 例外規定 / 問答補充 / 函釋推翻),其餘交由 cites_inferred 自動偵測。

工法:
1. 寫 `_classify_related.py` 標記每條 related 為人工還是推斷(看 03_build_index.py:edges.json 的 `inferred` 欄)
2. 把推斷邊從 SSOT `related` 欄移除,只留人工(可能 41% → 5-10%)
3. cites_inferred 仍由 03_build_index.py runtime 推斷

風險:會大幅減少 related 邊,但前端「相關規定」展示仍由 incoming + outgoing 雙向組合,UX 可能要調整。

### Phase 5.其他 — 暫無 blocker

- 1 個節點 44 related 過量(可能是 meta 節點或 retitle 沒清乾淨)
- 1 個節點 11 related 邊緣 case
- W8 116 筆 tags > 4(若 D1 完成後 tags 自然會精簡)

---

## 累積技術資產(Phase 1-4)

### 新增腳本

| 腳本 | 用途 |
|------|------|
| `_retitle_build_batches.py` / `_retitle_apply.py` / `_retitle_quality_check.py` | retitle 工具(已用過) |
| `_resummary_build_batches.py` / `_resummary_apply.py` | summary 重寫工具(已用過) |
| `_mark_certainty.py` | certainty 規則式標記 |
| `build_scenarios.py` | 規則式生成情境 |
| `_read_docx_reports.py` | docx 報告抽文字工具 |

### 新增前端欄位

`certainty` / `disclaimer_level` / `no_inference_note` / `effective_period` / `superseded_by` / `review_level=草稿` / `status` 4 值

### 新增 validate 規則

E11 / W7 / W8 / W9

### 新增前端 UI

- 抽屜頂部 inferred/contested 紅警示 banner
- 抽屜底部 40 字標準免責(常駐)
- 卡片網格右上角「⚠ 推論 / 爭議」徽章
- 情境視圖「🤖 自動產生」徽章(灰 dashed)
- v2 行動版底部 tabbar(3 鍵)
- nodes.json 帶 certainty 系列欄位
- 拆 scenarios manual + auto 兩份檔案

### CI/CD

- `.github/workflows/validate-and-build.yml` — push 自動 validate + 重建索引 + scenarios_auto

---

## Paste 給接手 Claude 的 prompt 範本

> 我要繼續優化資料庫。先讀 `docs/_handoff_optimization.md` 與 CLAUDE.md 了解進度。我要做 [Phase 3b 擴充 decision tree / Phase 5.D1 related 清理 / 其他]。動手前簡述方案讓我確認。

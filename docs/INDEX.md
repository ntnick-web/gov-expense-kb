# Docs 索引（按需讀取）

> 取代「進入 session 後 read 所有 docs/*.md」的舊習慣。Claude / 開發者進入時先讀 [CLAUDE.md](../CLAUDE.md) + 本 INDEX，再依任務 fetch 細節。

## 必讀（每次都要讀）

| 文件 | 範圍 | 為何必讀 |
|------|------|---------|
| [../CLAUDE.md](../CLAUDE.md) | 核心規範與導航 | AI 編碼助手主指引 |
| [02_data_schema.md](02_data_schema.md) | MD front-matter / JSON schema | 動 02_markdown 必看 |
| [_review_log.md](_review_log.md) | 法源審查 SOP + 中立角色規則 | 任何「結論性內容」必對齊 |

## 按需讀取（依任務）

### 動資料層

| 文件 | 何時讀 |
|------|--------|
| [01_architecture.md](01_architecture.md) | 想了解系統整體架構 |
| [03_id_convention.md](03_id_convention.md) | 新增節點 / 改 ID / 新增母題 |
| [05_workflow.md](05_workflow.md) | 新增來源檔 / PDF 抽取 / 重複檔處理 |
| [06_tags_taxonomy.md](06_tags_taxonomy.md) | 增刪 tag / 同義詞合併 |

### 動前端 / UI

| 文件 | 何時讀 |
|------|--------|
| [04_ui_spec.md](04_ui_spec.md) | 改視圖 / chip filter / 抽屜 / 情境卡 / 比較模式 |
| [_esm_split_plan.md](_esm_split_plan.md) | JS 5 module 拆檔脈絡 |

### 歷史脈絡 / 決策

| 文件 | 何時讀 |
|------|--------|
| [_status.md](_status.md) | 想知道「目前的全貌摘要」 |
| [roadmap.md](roadmap.md) | 想知道「已完成什麼 / 待做什麼」 |
| [decisions.md](decisions.md) | 想對齊既有 ADR 不踩重 |
| [changelog.md](changelog.md) | 想知道大型重構 / 設計轉換歷史 |

### 法務 / 隱私（外部頁面）

| 文件 | 用途 |
|------|------|
| [about.md](about.md) | 站內介紹（前端 modal） |
| [terms.md](terms.md) | 使用條款（前端 modal） |
| [privacy.md](privacy.md) | 隱私聲明（前端 modal） |

### 已封存

- [_archive/](_archive/) — 已用畢的 handoff 文件（2026-04-29 LLM 重整 等）

---

## 規則

1. **不要把按需文件變成必讀**：CLAUDE.md 應只引用 INDEX 與必讀文件。需要 docs/04_ui_spec 細節時即時 fetch。
2. **新增 docs/* 必更新本 INDEX**：在對應分組加一行；標清楚「何時讀」。
3. **必讀清單要嚴格控制**：超過 3 份就要重新檢查是否真的「每次必讀」，否則塞進「按需讀取」。

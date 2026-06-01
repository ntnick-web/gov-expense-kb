# 2026-06-01 — 國外旅費報告表主題上線（成大 ncku/ 版）

## 問題 / 動機

成大學生填寫國科會出差旅費報告表時，需手動查日支數額表、換算匯率、計算供宿/供餐折扣，容易出錯。
NICK 已有一套獨立的旅費報告表填報系統（`成大學生國外旅費報告表線上系統/`），希望整合進 P01 ncku/ 版知識庫，達到「查法條 → 填報告」一站完成。

## 決定

在 `04_web/ncku/index.html` 新增第 4 個 tab「報告表」，不動 public `index.html`。
新增 `<section id="view-report">` 嵌入現有 app shell，`switchView('report')` 統一控制顯示。

**核心設計選擇：**
- 視圖切換由既有 `switchView()` 管理，僅在 `02_data.js` 加 1 行：`getElementById('view-report')?.classList.toggle('hidden', v !== 'report')`
- 報告表邏輯全部自包含於 `04_web/ncku/report.js`（不汙染 P01 主模組）
- 日支費率資料：copy 來源 `allowance-data.js` → `04_web/static/js/allowance-data.js`，含季節性費率（rate_lookup.json 目前無此資料）
- 列印輸出：完全保留原始 `generator.js` 格式（A4 直式 + 版面調整面板）

## 排除方案

- **獨立頁面（04_web/ncku/ 另建 HTML）**：放棄，因為無法共享 P01 設計 token 與 tab 導覽
- **接 rate_lookup.json 作費率來源**：暫不做，因 rate_lookup.json 缺季節性費率資料（如杜拜夏冬費率），allowance-data.js 較完整；等日後 B-國外旅費節點補 seasonal 欄位後再切換
- **修改 public index.html**：不做，報告表為成大學生專屬功能

## 新增 / 修改檔案

| 檔案 | 說明 |
|------|------|
| `04_web/ncku/report.js` | 報告表完整邏輯（~800 行，含 utils/form-data/app/generator/checklist）|
| `04_web/static/js/allowance-data.js` | 城市費率資料（1239 行，從來源 copy）|
| `04_web/ncku/assets/form02.doc` | 差假申請單空白表單 |
| `04_web/ncku/assets/form03.doc` | 外籍航空申請書空白表單 |
| `04_web/ncku/index.html` | +第4tab + view-report section + mobile tab + script 載入 |
| `04_web/static/js/02_data.js` | switchView 加 1 行處理 view-report |
| `04_web/static/style.css` | append ~350 行 `.rpt-*` 樣式（完全不動現有 CSS）|

## 驗收標準

- [x] 切換到報告表 tab：現有 3 個 view 正確隱藏，報告表正確顯示
- [x] 切回現有 tab：報告表隱藏，原 view 正常顯示（6 項切換測試全通過）
- [x] 城市下拉：571 個選項從 allowance-data.js 載入
- [x] Step 1 → Step 2：東京 5 天行程，生活費自動計算 $299 × 31.5 = 9,419 TWD ✓
- [x] 民國年格式正確（114年）
- [x] console.error = 0

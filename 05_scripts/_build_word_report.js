// 建立 Word 報告:後續優化規劃(只含尚未執行項目)
// 執行:node 05_scripts/_build_word_report.js

const path = require('path');
require('module').globalPaths.push('C:\\Users\\user\\AppData\\Roaming\\npm\\node_modules');

const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageOrientation, PageBreak, Footer, Header, PageNumber,
} = require('docx');

// ============ 共用樣式 ============
const FONT = "Microsoft JhengHei";  // 微軟正黑體 — 中文友善
const FONT_MONO = "Consolas";

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

// 段落:標題層
const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  children: [new TextRun({ text, font: FONT })],
});
const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  children: [new TextRun({ text, font: FONT })],
});
const h3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  children: [new TextRun({ text, font: FONT })],
});

// 段落:正文
const p = (text, opts = {}) => new Paragraph({
  spacing: { before: 60, after: 60, line: 360 },
  children: [new TextRun({ text, font: FONT, size: 22, ...opts })],
});

// 段落:bullet
const bullet = (text, level = 0, opts = {}) => new Paragraph({
  numbering: { reference: 'bullets', level },
  spacing: { before: 30, after: 30, line: 340 },
  children: [new TextRun({ text, font: FONT, size: 22, ...opts })],
});

// 段落:編號
const numbered = (text, opts = {}) => new Paragraph({
  numbering: { reference: 'numbers', level: 0 },
  spacing: { before: 30, after: 30, line: 340 },
  children: [new TextRun({ text, font: FONT, size: 22, ...opts })],
});

// 段落:多 run 組合(如:粗體標題 + 一般說明)
const pMix = (runs) => new Paragraph({
  spacing: { before: 60, after: 60, line: 360 },
  children: runs.map(r => new TextRun({ font: FONT, size: 22, ...r })),
});

// 表格 cell helper
const td = (text, opts = {}) => new TableCell({
  borders,
  width: { size: opts.width || 2000, type: WidthType.DXA },
  shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  children: [new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    children: [new TextRun({ text: String(text), font: FONT, size: 20, bold: opts.bold || false })],
  })],
});

// 表格 helper
const makeTable = (rows, columnWidths) => new Table({
  width: { size: columnWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
  columnWidths,
  rows: rows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => {
      const opts = typeof cell === 'object' && cell.text !== undefined ? cell : { text: cell };
      return td(opts.text, {
        width: columnWidths[ci],
        fill: ri === 0 ? "E8DEFF" : (opts.fill),  // 表頭薰衣草色
        bold: ri === 0 || opts.bold,
        align: opts.align,
      });
    }),
  })),
});

// 空行
const blank = () => new Paragraph({ children: [] });

// 分頁
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

// ============ 內容 ============
const children = [];

// ───── 封面 ─────
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 2400, after: 240 },
  children: [new TextRun({ text: "核銷情境視覺化資料庫", font: FONT, size: 48, bold: true })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 0, after: 400 },
  children: [new TextRun({ text: "後續優化規劃報告", font: FONT, size: 36, bold: true, color: "5E4E9E" })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 200, after: 1200 },
  children: [new TextRun({ text: "(本報告僅含「尚未執行」之建議與分析,已落地項目不另列載)", font: FONT, size: 22, italics: true, color: "888888" })],
}));

// 封面資訊表
children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: " ", font: FONT })] }));
children.push(makeTable([
  [{ text: "報告編製日期", bold: true }, "2026-05-01"],
  [{ text: "編製階段", bold: true }, "P0/P1/P2/P4 已執行;P3、P5、4 項暫緩執行項以本報告留底"],
  [{ text: "適用對象", bold: true }, "經費支用 / 採購核銷承辦人員 / 主辦會計 / 機關首長"],
  [{ text: "建議下一步行動", bold: true }, "依本報告第四章「結論與下一步建議」逐項討論排程"],
], [3000, 6000]));

children.push(pageBreak());

// ───── 摘要 ─────
children.push(h1("摘要 — 為何需要這份報告"));
children.push(p("情境視覺化資料庫於 2026-04-30 完成全面體檢,共識別 26 項待改善項目,經 2026-05-01 一輪整併與決策後分為三類:"));
children.push(blank());

children.push(makeTable([
  [{ text: "類別", bold: true }, { text: "處理方式", bold: true }, { text: "本報告是否載明", bold: true }],
  ["P0 / P1 / P2 / P4 等 22 項已執行項目", "已於 2026-05-01 完成程式碼與資料修改", "❌ 不載(避免報告過載,改寫於 CLAUDE.md §0)"],
  ["P3 新增母題(酬勞費) + P5 後續母題擴充", "暫不執行,留下次規劃週期", "✅ 完整建議(本報告第一章)"],
  ["4 項使用者已決議暫不執行的優化", "暫緩,但保留供未來重啟", "✅ 留底說明(第二章)"],
  ["整體核銷邏輯優化方向", "屬概念性指引,非單次工作", "✅ 留底說明(第三章)"],
], [3500, 3000, 3500]));

children.push(blank());
children.push(p("本報告聚焦「未做什麼、什麼時候做、為何這樣排序」,讓使用者能在下一次規劃會議直接挑出哪幾項要動手。"));

children.push(pageBreak());

// ============================================
// 第一章:後續母題擴充建議
// ============================================
children.push(h1("第一章 後續母題擴充建議"));
children.push(p("現況:資料庫包含 3 個母題(國內旅費 / 國外旅費 / 支出憑證與結報),共 520 條法源節點與 73 張情境卡。本章評估下一個應補的母題,並列出後續 4-5 個母題的優先順序。"));

// 1.1 主推
children.push(h2("1.1 主推 — 講座鐘點費 / 出席費 / 稿費(酬勞費)"));

children.push(h3("1.1.1 推薦理由(綜分 19 / 20)"));
children.push(makeTable([
  [{ text: "評估維度", bold: true }, { text: "得分", bold: true }, { text: "說明", bold: true }],
  [{ text: "日常使用頻次", bold: true }, "5 / 5", "每場研討會、評選會、會議都涉及。中央機關每月平均 5-15 件,大型機關上百件"],
  [{ text: "資料量可控", bold: true }, "4 / 5", "預估約 1 條核心要點 + 1-2 張支給表 + 30-50 條解釋函令 + 20-30 個 Q&A,共 60-100 個節點"],
  [{ text: "與既有母題不重疊", bold: true }, "5 / 5", "目前 117 張情境卡中 grep「鐘點費 / 出席費 / 稿費 / 出席」全部 0 命中,完全空白"],
  [{ text: "業務痛點明顯", bold: true }, "5 / 5", "扣繳憑單、二代健保補充保費、公務員兼職限制、印領清冊等,違反任一項會被審計或國稅局退件"],
  [{ text: "綜合", bold: true, fill: "E8DEFF" }, { text: "19 / 20", bold: true, fill: "E8DEFF" }, { text: "強烈推薦立即啟動", bold: true, fill: "E8DEFF" }],
], [3500, 1500, 5000]));

children.push(blank());

children.push(h3("1.1.2 必收法源清單(供 00_source 補充)"));
children.push(p("下列法規應全數蒐集為 PDF / DOCX 並放入 00_source/06_酬勞費/ 子目錄(依機關分):"));
children.push(bullet("中央政府各機關學校員工待遇授權法及其施行細則"));
children.push(bullet("中央政府各機關學校出席費及稿費支給要點(行政院 64 年訂定,迭次修正)— 核心法規 A 類"));
children.push(bullet("講座鐘點費支給表(行政院主計總處公布,內聘 / 外聘費率不同)— 支出標準 B 類"));
children.push(bullet("軍公教人員兼職費及講座鐘點費支給規定 — 核心法規 A 類"));
children.push(bullet("各類出席費(諮詢委員、評選委員、評審委員、訴願審議委員)個別函令 — 解釋函令 C 類"));
children.push(bullet("所得稅法 §88(扣繳義務人)/ 全民健保法 §31(二代健保補充保費連動規定)"));
children.push(bullet("主計總處解釋函令(印領清冊格式、領據形式、勞報單適用範圍)"));
children.push(bullet("各機關內規(常見:聘請校外講座支給辦法、本機關業務評選委員出席費標準等)— 視情況收"));

children.push(h3("1.1.3 預期情境卡分布(18-25 張)"));
children.push(p("依支出類別分組,可作為新增母題後 EXPENSE_LAYER 設定的種子:"));

children.push(makeTable([
  [{ text: "支出類別", bold: true }, { text: "預期張數", bold: true }, { text: "情境卡示例", bold: true }],
  ["鐘點費類", "6-8 張", "內聘鐘點費上限 / 外聘鐘點費上限 / 教師兼任鐘點費 / 連續授課時數計算 / 現場助教 vs 講師 / 跨機關支援講座"],
  ["出席費類", "5-7 張", "各類委員會出席費上限 / 諮詢費 vs 出席費差異 / 評選委員迴避情形 / 公務員兼任委員不另支領"],
  ["稿費類", "3-4 張", "稿費單字標準(每字單價)/ 翻譯稿費 / 委託撰稿契約 vs 稿費"],
  ["扣繳與二代健保", "4-5 張", "5% / 10% 扣繳判斷 / 單筆 ≥ 20,000 元二代健保 2.11% / 執行業務所得 vs 薪資所得 / 印領清冊 vs 勞報單"],
  ["特殊情境", "2-3 張", "兼職禁止與例外 / 退休人員可否支領 / 學生兼任助教鐘點"],
  [{ text: "合計", bold: true, fill: "E8DEFF" }, { text: "18-25 張", bold: true, fill: "E8DEFF" }, { text: "其中至少 5-8 張需設計完整 flow 條件問答", fill: "E8DEFF" }],
], [3000, 1800, 5200]));

children.push(h3("1.1.4 預期解掉哪些既有缺口"));
children.push(p("酬勞費母題上線後,可一併解掉本月體檢中以下 3 個缺位:"));
children.push(numbered("體檢報告 §5 第 11 項「學者專家出席費 / 講座鐘點費上限」"));
children.push(numbered("體檢報告 §5 第 13 項「薪資 / 酬勞所得扣繳 5% / 10% 規則」"));
children.push(numbered("體檢報告 §5 第 12 項「二代健保補充保費代扣」(單筆執行業務所得 ≥ 20,000 要扣 2.11%)"));
children.push(p("同時情境卡 meeting-meals 從「便當茶水 + 出席費」混雜中,把出席費獨立出去後內容更聚焦。"));

children.push(h3("1.1.5 工作量預估(4-6 週)"));
children.push(makeTable([
  [{ text: "階段", bold: true }, { text: "週數", bold: true }, { text: "主要工作", bold: true }],
  ["階段 1:資料蒐集", "1-2 週", "PDF / DOCX 蒐集到 00_source/06_酬勞費/;_compute_skip_list.py 處理重複 / 雜訊;_manifest.csv 補設定"],
  ["階段 2:抽取與初校", "1-2 週", "01_extract.py + 02_parse.py 跑出 02_markdown 草稿;_batch_autoreview.py + _redact_pii.py 自動初校;PARENT_KEYWORDS 加識別字串"],
  ["階段 3:情境設計", "1 週", "規劃 18-25 張情境卡;設計 5-8 張完整 flow;EXPENSE_LAYER 補新母題支出類別表;_normalize_tags.py 補關鍵字"],
  ["階段 4:試算 widget 擴充", "0.5-1 週", "講座鐘點費試算(內 / 外聘 + 時數);出席費試算(本機關 / 外聘 + 是否兼任公職);二代健保補充保費試算"],
  [{ text: "總計", bold: true, fill: "E8DEFF" }, { text: "4-6 週", bold: true, fill: "E8DEFF" }, { text: "可由一個 session 完整完成,或拆成 2 個 milestone 分別交付", fill: "E8DEFF" }],
], [3000, 1500, 5500]));

children.push(pageBreak());

// 1.2 P5
children.push(h2("1.2 後續母題優先順序(P5)"));
children.push(p("酬勞費完成後,建議依下列順序逐步擴充。每一個母題啟動前,可重複本報告第 1.1 節的 4 維度評分,確認當下優先級仍與本表一致。"));

children.push(makeTable([
  [
    { text: "順位", bold: true },
    { text: "母題候選", bold: true },
    { text: "綜分", bold: true },
    { text: "為何排這個順序", bold: true },
    { text: "工作量估", bold: true },
  ],
  ["#1", "(本期推薦) 講座鐘點費 / 出席費 / 稿費", "19", "頻次最高、痛點最明確、空白最大", "4-6 週"],
  ["#2", "共通性費用(便當 / 茶水 / 印刷 / 會議費)", "18", "主計總處每年公布基準表,廣泛適用,資料量最小", "2-3 週"],
  ["#3", "加班費 / 不休假加班", "17", "各機關高頻,但人事業務性質為主", "3-4 週"],
  ["#4", "公務車輛使用 / 油料費", "15", "中型機關以上才高頻", "2-3 週"],
  ["#5", "教育部 / 國科會專章", "12", "範圍特定機關才用,等使用者反饋有需求再做", "依範圍 2-6 週"],
  ["#6", "政府採購法深化(招標端)", "12", "與既有支出憑證結報互補,聚焦招標流程", "4-6 週"],
], [800, 3000, 800, 4400, 1000]));

children.push(blank());

children.push(h3("1.2.1 各候選母題簡述"));

children.push(pMix([
  { text: "#2 共通性費用(便當/茶水/印刷/會議費) — ", bold: true },
  { text: "依據《中央政府各機關共通性費用編列基準表》(主計總處每年公布)。涵蓋便當 80 元上限、茶水 50 元 / 人、會議室租金、印刷品單價、廉政講習費等。資料量小但覆蓋廣,可解掉現有 meeting-meals 卡片下「便當與茶水混合」的情況。" },
]));

children.push(pMix([
  { text: "#3 加班費 / 不休假加班 — ", bold: true },
  { text: "依據《公務人員加班費支給要點》。涵蓋平日加班、假日加班、國定假日加班三類費率,以及不休假加班費(年資、上限)。屬人事業務性質,但與經費核銷高度連動,審計常糾正。" },
]));

children.push(pMix([
  { text: "#4 公務車輛使用 / 油料費 — ", bold: true },
  { text: "依據《機關員工申請使用機關公務車輛要點》與油料費編列規範。涵蓋公務車派遣、油料卡管理、私人借用、肇事報告等。中型機關以上才會頻繁出現核銷需求。" },
]));

children.push(pMix([
  { text: "#5 教育部 / 國科會專章 — ", bold: true },
  { text: "教育部主管學校適用之派員出國研究進修補助、留學獎學金等;國科會研究計畫科研採購補助、研究助理薪資等。範圍特定,等接到該類使用者反饋再啟動。" },
]));

children.push(pMix([
  { text: "#6 政府採購法深化(招標端) — ", bold: true },
  { text: "目前支出憑證與結報母題已涵蓋採購結報端(發票、驗收、保證金退還)。深化方向是招標前期:招標公告、押標金、最有利標、評選委員會、保證金沒收、爭議處理。與第 #1 推薦的酬勞費「評選委員出席費」可互補,但獨立成母題會比較完整。" },
]));

children.push(pageBreak());

// ============================================
// 第二章:已決議暫不執行項
// ============================================
children.push(h1("第二章 已決議暫不執行項(供未來重啟參考)"));
children.push(p("以下 4 項在 2026-05-01 規劃會議中,使用者明確表示「暫不執行」。本章保留分析摘要與重啟前提,作為未來判斷是否補做的依據。"));

// 2.1
children.push(h2("2.1 mobile-tabbar 補回「🏠 首頁」 4 tab"));
children.push(makeTable([
  [{ text: "現況", bold: true }, "mobile-tabbar 只有 3 tab(情境 / 條文庫 / 試算)。Landing 頁需點 brand「核銷 Let's go!」回去"],
  [{ text: "原規劃做法", bold: true }, "在 mobile-tabbar 加「🏠 首頁」變 4 tab,與桌面 topnav 對齊"],
  [{ text: "暫不執行原因", bold: true }, "使用者考量行動版每多一個 tab,觸控目標就更小;3 tab 已足以覆蓋核心動線。Landing 頁不算頻繁回訪。"],
  [{ text: "重啟前提", bold: true }, "若日後使用者在 Landing 頁加入「我的常用情境」「最近查看」等持續性內容,會頻繁回訪時,再加回 4 tab"],
  [{ text: "預估工作量", bold: true }, "極小(< 30 分鐘) — 在 mobile-tabbar HTML 加一個 tab + switchView('landing') 綁定 + CSS 寬度調整"],
], [2500, 6500]));

// 2.2
children.push(h2("2.2 「📋 複製附件清單」一鍵按鈕"));
children.push(makeTable([
  [{ text: "現況", bold: true }, "情境卡 attachments 為文字清單,使用者要通知申請人時只能逐項複製"],
  [{ text: "原規劃做法", bold: true }, "在 scope-banner 與情境卡上加「📋 複製附件清單」按鈕,navigator.clipboard.writeText() 一鍵複製"],
  [{ text: "暫不執行原因", bold: true }, "屬於體驗優化非阻塞功能;目前使用者用瀏覽器原生「選取 → Ctrl+C」即可,優先級可後延"],
  [{ text: "重啟前提", bold: true }, "Cloudflare Web Analytics 顯示 attachments 區塊高頻訪問 + 使用者反饋「常複製」;或下次 P1 內容戰追加時納入"],
  [{ text: "預估工作量", bold: true }, "小(1-2 小時) — 加按鈕 + clipboard API + 視覺回饋(複製成功 toast);需注意 iOS Safari 對 clipboard 限制"],
], [2500, 6500]));

// 2.3
children.push(h2("2.3 「🖨 列印 / 匯出 PDF」核銷 SOP"));
children.push(makeTable([
  [{ text: "現況", bold: true }, "情境視圖無列印樣式,業務想將 attachments 列印給新進承辦只能截圖"],
  [{ text: "原規劃做法", bold: true }, "加 @media print CSS + 「📄 列印此情境核銷單」按鈕,優化版面為單頁,隱藏導覽 chrome"],
  [{ text: "暫不執行原因", bold: true }, "屬於體驗優化非阻塞功能;使用者目前未提出此需求,且若加入需考慮 PDF 樣板設計、機關 logo / 制式表頭等細節"],
  [{ text: "重啟前提", bold: true }, "機關 SOP 文件需求出現,或 Cloudflare 數據顯示「列印」事件高頻"],
  [{ text: "預估工作量", bold: true }, "中(0.5-1 週) — @media print CSS + 樣板設計 + 測試多種紙張尺寸 + 各情境分組是否要分頁"],
], [2500, 6500]));

// 2.4
children.push(h2("2.4 「⭐ 我的常用情境」localStorage 收藏功能"));
children.push(makeTable([
  [{ text: "現況", bold: true }, "業務人員月底結報通常一次處理 5-15 件,每次都要從頭瀏覽情境卡"],
  [{ text: "原規劃做法", bold: true }, "情境卡右上角加 ⭐ 收藏按鈕,localStorage 記住前 5-8 張;情境視圖頂部 pin 顯示;延伸「我這月要報的清單」可整批列印"],
  [{ text: "暫不執行原因", bold: true }, "屬於體驗優化非阻塞功能;且 localStorage 跨裝置不同步,單機收藏對行動辦公使用者助益有限"],
  [{ text: "重啟前提", bold: true }, "(a) Cloudflare 顯示同一使用者重複訪問固定情境;(b) 或日後加入帳號系統可同步收藏時(目前純靜態 GitHub Pages 不支援)"],
  [{ text: "預估工作量", bold: true }, "中(1 週) — localStorage state + 收藏按鈕 + 情境視圖頂部 pinned 區 + 「批次清單」進階功能"],
], [2500, 6500]));

children.push(blank());
children.push(p("此 4 項共同特徵:皆屬「體驗優化」性質,非阻塞核心使用流程。建議在 Cloudflare Web Analytics 累積 3-6 個月使用者數據後,依實際訪問路徑與重複動作熱點,重新評估是否啟動。"));

children.push(pageBreak());

// ============================================
// 第三章:整體核銷邏輯優化方向
// ============================================
children.push(h1("第三章 整體核銷邏輯優化方向"));
children.push(p("本章不是單次工作,而是長期指引。當未來新增母題、設計新功能、整併情境時,應回頭檢視本章的 4 個原則,確保整體一致性。"));

// 3.1
children.push(h2("3.1 三層資訊架構(從導覽到結論)"));
children.push(p("情境視圖目前已部分採用此結構,未來新增母題或情境時應遵循同樣的三層遞進:"));

children.push(makeTable([
  [{ text: "層級", bold: true }, { text: "內容", bold: true }, { text: "使用者問題", bold: true }, { text: "現況落地", bold: true }],
  ["第一層 Landing", "類型選擇:出差 / 採購 / 酬勞 / 補助 / 憑證 / 雜項", "「我這個案件大致是什麼類別?」", "✅ 已落地三入口卡(情境 / 條文庫 / 試算)"],
  ["第二層 情境樹根", "條件問答(flow):當日 / 跨夜?自駕 / 大眾運輸?", "「我這個案件的細節屬於哪個分支?」", "🚧 部分落地 6 個 root flow + 子情境連結;尚需擴充至 ~30"],
  ["第三層 情境葉", "結論 + 附件 + 紅線 + 計算範例 + 簽呈樣張", "「我具體要附什麼、上限多少、可能踩哪些紅線、簽呈怎麼寫?」", "🚧 schema 已就緒(caveats / example / template),內容已加 7 張卡 + 4 flow,後續需逐張擴充"],
], [1500, 2700, 2700, 2100]));

children.push(blank());
children.push(p("關鍵原則:「使用者每答一題,UI 應漸進揭露下一個問題或結論」,而非一次給完所有資訊。這也是 mobile bottom sheet 比 centered modal 更適合 flow modal 的根本理由。"));

// 3.2
children.push(h2("3.2 快速 / 引導 / 深入三模式切換"));
children.push(p("不同使用者目的不同,目前介面預設「引導模式」(完整資訊一次呈現),未來可加模式切換滿足兩極需求:"));

children.push(makeTable([
  [
    { text: "模式", bold: true },
    { text: "適用使用者", bold: true },
    { text: "目的", bold: true },
    { text: "UI 表現", bold: true },
  ],
  ["🚀 快速應答", "資深承辦", "確認金額上限 / 憑證項目", "輸入關鍵字 → 直接顯示金額表 + 紅線(不顯示完整 attachments / template)"],
  ["🧭 引導(預設)", "一般承辦", "完整核銷指引", "目前架構:走完整 flow → 看法源 → 看範例(已實作)"],
  ["📚 深入學習", "新進承辦 / 主辦會計", "學習法規邏輯", "完整 flow + 法源全文 + 抽屜可看 MD + 跨情境關聯(同類其他)"],
], [1800, 1800, 1800, 3600]));

children.push(blank());
children.push(p("實作建議:情境視圖頂部加「🚀 快速 / 🧭 引導 / 📚 深入」三 chip,localStorage 記住偏好。本項目前未啟動,屬於 P5 級別優化。"));

// 3.3
children.push(h2("3.3 案件流程化"));
children.push(p("業務人員月底結報通常一次處理 5-15 件,目前每個情境都從頭點繁瑣。本方向涉及第二章 §2.4 的「我的常用情境」+「我這月要報的清單」收藏功能,但該項已暫緩。"));
children.push(p("替代低成本做法:在情境卡上加「📋 加入清單」按鈕,並在 footer 顯示懸浮 toolbar「目前清單 N 件」+「📤 匯出全部附件清單」。LocalStorage 即可,無需後端。但同樣屬於體驗優化非阻塞,啟動時機建議與第二章 §2.2 / §2.4 一併啟動。"));

// 3.4
children.push(h2("3.4 紅線防呆優先(本期已落地的指導原則)"));
children.push(p("審計退件 / 國稅局糾正最常見原因:"));
children.push(numbered("應扣繳未扣繳(5% / 10% / 二代健保 2.11%)"));
children.push(numbered("超過支給標準上限(雜費 400 / 鐘點費上限 / 計程車費)"));
children.push(numbered("應檢未檢憑證(印領清冊 / 出席證明 / 退保證明)"));
children.push(numbered("公務車輛 / 計程車混報"));
children.push(numbered("跨年度結報違反會計年度"));
children.push(blank());
children.push(p("本期已導入 caveats 結構化欄位 + 紅色 banner 渲染,把這些「不該報但常被報」的紅線直接視覺化呈現在情境頂部。未來新增情境卡時,應主動填寫 caveats 欄位至少 1-3 條,且新母題的所有核心法規卡都應檢查。"));

children.push(blank());
children.push(p("延伸方向(尚未啟動):當使用者填寫情境表單時,系統可自動比對 caveats 規則並提示「此案件可能踩到 X 紅線」,類似於即時靜態檢查。但需先有「使用者填表單」這個介面(目前還是純查閱型),屬於下一個 major iteration 才會出現的功能。"));

children.push(pageBreak());

// ============================================
// 第四章:結論與下一步建議
// ============================================
children.push(h1("第四章 結論與下一步建議"));

children.push(h2("4.1 本期(2026-05-01)成果定位"));
children.push(p("本期完成 P0 / P1 / P2 / P4 共 22 項落地,情境視覺化資料庫已從「可用 v1」進入「結構化 v2」階段:schema 擴充就緒、6 個情境樹結構建立、紅線 / 範例 / 簽呈樣張的內容容器到位。"));
children.push(p("但內容深度仍是進行式 — 目前僅 7 張卡 + 4 flow 補完 caveats / example / template;其餘 67 張卡仍待逐步增補。建議將「補內容」視為持續性 ongoing 工作,而非單次衝刺。"));

children.push(h2("4.2 建議下一步(供決策參考)"));
children.push(p("下列三條路線供使用者擇一啟動,各有不同節奏與資源需求:"));

children.push(h3("路線 A:啟動酬勞費母題(本報告強烈推薦)"));
children.push(bullet("時程:4-6 週"));
children.push(bullet("立即效益:解開現有最大空白,業務量最高的酬勞核銷正式上線"));
children.push(bullet("配套:同步擴充試算 widget(鐘點費 / 出席費 / 二代健保)"));
children.push(bullet("風險:資料蒐集階段須密集查找最新公告(尤其支給表費率變動);法源 PDF 部分需 OCR"));

children.push(h3("路線 B:深化現有情境內容(向下扎根)"));
children.push(bullet("時程:2-3 週(分批)"));
children.push(bullet("立即效益:現有 67 張未補卡片逐步補 caveats / example / template,使用者每次回訪都能看到新增內容"));
children.push(bullet("配套:可結合 P5-22(LLM 16 batch subagent 模式)半自動化"));
children.push(bullet("風險:需要對每張卡片的法規條款有一定理解,LLM 自動化不能完全取代人工校對"));

children.push(h3("路線 C:擴 flow 從 7 → 30(條件問答工程)"));
children.push(bullet("時程:3-4 週"));
children.push(bullet("立即效益:現有 73 張卡片中,還有 ~25 張適合做 flow 但尚未做;補完後 flow 覆蓋率從 6% → 40%+"));
children.push(bullet("配套:可結合路線 B 同步進行(設計 flow 時同時補 caveats / example)"));
children.push(bullet("風險:flow 設計需保證「不退化」(避免如 taxi 假分支),需先列規格再做"));

children.push(h2("4.3 三路線比較"));

children.push(makeTable([
  [
    { text: "維度", bold: true },
    { text: "路線 A 酬勞費", bold: true },
    { text: "路線 B 深化內容", bold: true },
    { text: "路線 C 擴 flow", bold: true },
  ],
  ["時程", "4-6 週", "2-3 週(可分批)", "3-4 週"],
  ["立即影響面", "★★★★★ 開新母題", "★★★ 既有強化", "★★★★ 既有強化"],
  ["可逐步分批", "✗(較完整週期)", "✓✓(最易分批)", "✓(可批做)"],
  ["可與其他路線並行", "✓", "✓✓", "✓✓"],
  ["技術風險", "中(資料蒐集)", "低", "中(設計嚴謹度)"],
  ["業務同仁有感程度", "★★★★★(全新功能)", "★★★(漸進式)", "★★★★(交互式)"],
], [1500, 2500, 2500, 2500]));

children.push(blank());
children.push(p("綜合建議:若資源允許 1 條,優先路線 A;若資源允許 2 條並行,A + B 組合最佳(B 由 LLM 半自動補,A 由人工蒐集 + 校對)。"));

children.push(h2("4.4 持續觀測指標"));
children.push(p("建議啟動下一輪規劃前,先檢視 Cloudflare Web Analytics 累積數據(本網站已掛 token,2026-04-27 起記錄):"));
children.push(numbered("PV / UV 趨勢(估算實際使用者數,評估投入產出比)"));
children.push(numbered("熱門頁面(若 scenarios 頁停留時間 > library,代表情境設計成功;反之需強化)"));
children.push(numbered("Referrer(若有大量來自特定機關內網,代表已被當作機關 SOP 工具)"));
children.push(numbered("行動裝置 vs 桌面比例(若行動 > 50%,P4-27 bottom sheet 投入價值高)"));

children.push(blank());
children.push(p("資料累積 3-6 個月後,可重新檢視第二章 4 項暫緩優化,依實際使用模式決定是否啟動。"));

children.push(blank());
children.push(blank());

// 結尾
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 400 },
  children: [new TextRun({ text: "— 報告結束 —", font: FONT, size: 20, italics: true, color: "888888" })],
}));

// ============ 文件 ============
const doc = new Document({
  creator: "核銷情境視覺化資料庫",
  title: "後續優化規劃報告",
  description: "尚未執行項目的建議與分析",
  styles: {
    default: {
      document: { run: { font: FONT, size: 22 } },
    },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 36, bold: true, font: FONT, color: "5E4E9E" },
        paragraph: {
          spacing: { before: 480, after: 240 },
          outlineLevel: 0,
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 8, color: "5E4E9E", space: 4 },
          },
        },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 28, bold: true, font: FONT, color: "3F2D7A" },
        paragraph: {
          spacing: { before: 320, after: 160 },
          outlineLevel: 1,
        },
      },
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 24, bold: true, font: FONT, color: "2D2D2D" },
        paragraph: {
          spacing: { before: 240, after: 120 },
          outlineLevel: 2,
        },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0, format: LevelFormat.BULLET, text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
          {
            level: 1, format: LevelFormat.BULLET, text: "◦",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1440, hanging: 360 } } },
          },
        ],
      },
      {
        reference: "numbers",
        levels: [
          {
            level: 0, format: LevelFormat.DECIMAL, text: "%1.",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },  // A4
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: "核銷情境視覺化資料庫 — 後續優化規劃報告", font: FONT, size: 18, color: "888888" })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "— 第 ", font: FONT, size: 18, color: "888888" }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: "888888" }),
            new TextRun({ text: " 頁 / 共 ", font: FONT, size: 18, color: "888888" }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: "888888" }),
            new TextRun({ text: " 頁 —", font: FONT, size: 18, color: "888888" }),
          ],
        })],
      }),
    },
    children,
  }],
});

const outPath = path.join(process.cwd(), 'docs', '_未來優化規劃報告_2026-05-01.docx');
Packer.toBuffer(doc).then(buf => {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  console.log("✓ Word report written to:", outPath);
  console.log("  size:", (buf.length / 1024).toFixed(1), "KB");
});

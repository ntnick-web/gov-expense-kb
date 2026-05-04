// 商轉整合可行方案報告
// NODE_PATH="C:/Users/user/AppData/Roaming/npm/node_modules" node docs/_gen_report3.js
'use strict';
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat
} = require('docx');
const fs = require('fs');

const OUTPUT = 'C:\\Users\\user\\OneDrive\\桌面\\支出規定視覺化資料庫\\docs\\商轉整合方案_2026-05-03.docx';

const CP = '4A148C'; // 主紫
const CP2 = '7B1FA2';
const CD = '311B92';
const CG = '888888';
const CR = 'B71C1C';
const CGREEN = '1B5E20';
const CBLUE = '0D47A1';
const CORANGE = 'E65100';

const BD = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const BS = { top: BD, bottom: BD, left: BD, right: BD };
const CM = { top: 80, bottom: 80, left: 130, right: 130 };

function h1(t) { return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t, bold: true })] }); }
function h2(t) { return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t, bold: true })] }); }
function h3(t) { return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: t, bold: true })] }); }
function p(x) {
  if (typeof x === 'string') return new Paragraph({ children: [new TextRun({ text: x })] });
  if (!Array.isArray(x)) return new Paragraph({ children: [x] });
  return new Paragraph({ children: x });
}
function b(t, c) { return new TextRun({ text: t, bold: true, ...(c ? { color: c } : {}) }); }
function n(t, c) { return new TextRun({ text: t, ...(c ? { color: c } : {}) }); }
function sp() { return new Paragraph({ children: [] }); }
function pb() { return new Paragraph({ children: [new PageBreak()] }); }

function bul(items) {
  return items.map(i => new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    children: typeof i === 'string' ? [new TextRun({ text: i })]
             : Array.isArray(i) ? i : [i]
  }));
}
function sub(items) {
  return items.map(i => new Paragraph({
    numbering: { reference: 'sub', level: 0 },
    children: typeof i === 'string' ? [new TextRun({ text: i })]
             : Array.isArray(i) ? i : [i]
  }));
}
function num(items) {
  return items.map(i => new Paragraph({
    numbering: { reference: 'numbers', level: 0 },
    children: typeof i === 'string' ? [new TextRun({ text: i })]
             : Array.isArray(i) ? i : [i]
  }));
}

// ── 通用 cell ──
function cell(content, w, hdr, fill) {
  const bg = hdr ? 'E8EAF6' : (fill || 'FFFFFF');
  let runs;
  if (typeof content === 'string') runs = hdr ? [b(content)] : [new TextRun({ text: content })];
  else if (Array.isArray(content)) runs = content;
  else runs = [content];
  return new TableCell({ borders: BS, width: { size: w, type: WidthType.DXA }, shading: { fill: bg, type: ShadingType.CLEAR }, margins: CM, children: [new Paragraph({ children: runs })] });
}

function tbl2(rows, w1 = 3500, w2 = 5000) {
  return new Table({ width: { size: w1 + w2, type: WidthType.DXA }, columnWidths: [w1, w2],
    rows: rows.map(([a, b2, hdr, f1, f2]) => new TableRow({ children: [cell(a, w1, hdr, f1), cell(b2, w2, hdr, f2)] })) });
}
function tbl3(rows, w1 = 2600, w2 = 2700, w3 = 3200) {
  return new Table({ width: { size: w1 + w2 + w3, type: WidthType.DXA }, columnWidths: [w1, w2, w3],
    rows: rows.map(([a, b2, c, hdr]) => new TableRow({ children: [cell(a, w1, hdr), cell(b2, w2, hdr), cell(c, w3, hdr)] })) });
}
function tbl4(rows, ws = [2000, 2000, 2000, 2500]) {
  const tw = ws.reduce((s, x) => s + x, 0);
  return new Table({ width: { size: tw, type: WidthType.DXA }, columnWidths: ws,
    rows: rows.map(cols => new TableRow({ children: cols.map((c, i) => {
      const hdr = typeof c === 'object' && c._h; const txt = typeof c === 'string' ? c : (c.v || '');
      return cell(txt, ws[i], hdr);
    })})) });
}
function h4r(arr) { return arr.map(v => ({ v, _h: true })); }

function warningBox(label, lines, color) {
  return lines.map((line, idx) => new Paragraph({
    indent: { left: 400 },
    spacing: { before: idx === 0 ? 60 : 0, after: 0 },
    border: { left: { style: BorderStyle.SINGLE, size: 14, color, space: 12 } },
    children: idx === 0 ? [b('【' + label + '】　', color), n(line)] : [n(line)]
  }));
}

// ══════════════════════════════════════
const doc = new Document({
  numbering: { config: [
    { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    { reference: 'sub',     levels: [{ level: 0, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1200, hanging: 360 } } } }] },
    { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  ]},
  styles: {
    default: { document: { run: { font: '標楷體', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 34, bold: true, color: CP, font: '標楷體' },
        paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: CP2, space: 4 } } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, color: CD, font: '標楷體' },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 23, bold: true, color: '37474F', font: '標楷體' },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1200, bottom: 1440, left: 1400 } } },
    headers: { default: new Header({ children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 4 } },
      children: [new TextRun({ text: '政府支出法規知識庫　商轉整合可行方案', size: 16, color: CG, font: '標楷體' })]
    })] }) },
    footers: { default: new Footer({ children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 4 } },
      children: [new TextRun({ text: '第 ', size: 18, color: CG }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: CG }), new TextRun({ text: ' 頁', size: 18, color: CG })]
    })] }) },
    children: [
      // ── 封面 ──
      sp(), sp(), sp(), sp(),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 180 },
        children: [new TextRun({ text: '政府支出法規知識庫', size: 52, bold: true, color: CP, font: '標楷體' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 8, color: CP2 }, bottom: { style: BorderStyle.SINGLE, size: 8, color: CP2 } },
        spacing: { before: 140, after: 140 },
        children: [new TextRun({ text: '商轉整合可行方案', size: 38, bold: true, color: CD, font: '標楷體' })] }),
      sp(),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 },
        children: [new TextRun({ text: '法律合規・商業主體・技術架構・定價・客戶開發・分階段任務', size: 22, color: '555555', font: '標楷體' })] }),
      sp(), sp(), sp(),
      new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '2026 年 5 月　v1.0', size: 22, color: CG, font: '標楷體' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '前提：以家人或朋友名義運營，本人為公務員兼職', size: 20, color: CG, font: '標楷體' })] }),
      pb(),

      // ══════════════════════════════════════════
      h1('第一章　前提設定與核心原則'),
      // ══════════════════════════════════════════
      h2('1.1　已確認的前提'),
      ...bul([
        [b('商業主體：'), n('以家人或朋友個人名義設立行號（第一階段），規模化後改以其名義設立公司（第二階段）')],
        [b('本人角色：'), n('提供技術與內容，以非正式家庭/朋友協助方式參與，不在任何商業文件上具名，不直接收受報酬')],
        [b('目標市場：'), n('政府機關（主計、出納、會計人員）及各級學校（行政人員）')],
        [b('收費模式：'), n('訂閱制，依使用人數分級，全部方案控制在 NT$ 99,000 以下以利直接採購')],
        [b('運營方式：'), n('本人兼職，每週投入約 4～6 小時；家人/朋友名義負責法律和金流')],
      ]),
      sp(),
      h2('1.2　絕對紅線（不得逾越）'),
      ...warningBox('公務員身份保護紅線', [
        '本人姓名不得出現在行號登記、網站版權聲明、合約甲/乙方、銀行帳戶等任何商業文件中',
        '本人不得直接收受來自客戶的任何報酬（含現金、禮品、轉帳、發票對象等）',
        '本人在任職機關（成大）的任何活動，不得明確連結「本人」與「這個網站」的商業關係',
        '即使以贊助/捐款名義收費，仍建議先諮詢人事室或律師書面確認後再執行',
      ], CR),
      sp(),
      h2('1.3　最乾淨的角色分工'),
      tbl2([
        ['角色', '負責事項', true],
        [[b('本人'), n('（技術/內容提供者，不具名）')], '建置並維護網站、新增法規內容、設計情境卡、處理技術問題、制訂策略方向'],
        [[b('家人/朋友'), n('（商業主體，具名）')], '行號登記、銀行帳戶、開立發票/收據、簽署合約、對外洽商、收受款項'],
        [[b('雙方關係')], '非雇傭、非合夥；本人以「幫忙家人/朋友事業」的方式參與，無任何書面協議'],
      ], 3000, 5500),
      sp(),
      ...warningBox('重要', [
        '雙方之間不要有任何書面的「報酬」「分潤」「合作協議」——這類文件一旦存在，就可能被認定本人實質參與商業活動。財務往來只在家庭生活費範疇自然流動，不留商業痕跡。',
      ], CORANGE),
      pb(),

      // ══════════════════════════════════════════
      h1('第二章　商業主體設置'),
      // ══════════════════════════════════════════
      h2('2.1　第一階段：設立行號'),
      h3('2.1.1　為什麼選行號（不直接設公司）'),
      tbl2([
        ['比較項目', '行號（第一階段）vs 有限公司（第二階段）', true],
        ['設立費用', '行號：約 NT$ 1,000（規費）；公司：約 NT$ 6,000～10,000（含規費＋會計師/事務所）'],
        ['設立時間', '行號：約 1～2 週；公司：約 3～5 週'],
        ['帳務要求', '行號：記帳本即可，年收入達標才需記帳士；公司：每月需申報營業稅，較繁瑣'],
        ['適合時機', '行號：驗證市場、前期收入 NT$ 0～50 萬；公司：有穩定客戶、年收入超過 NT$ 50 萬後'],
        ['切換方式', '行號轉公司：重新設立公司即可，行號可以保留或廢止，現有合約可移轉'],
      ], 2800, 5700),
      sp(),
      h3('2.1.2　行號設立流程（由家人/朋友執行）'),
      ...num([
        [b('決定商號名稱：'), n('例如「XX 法規顧問工作室」「XX 數位知識服務」，建議簡短易記。注意不要用可能引起誤解的政府機關字樣')],
        [b('至縣市政府商業處（或線上）申請登記：'), n('攜帶身分證、印章、營業地址（可用戶籍地）。費用約 NT$ 1,000。約 5～7 個工作天完成')],
        [b('前往稅務機關（國稅局分局）辦理稅籍登記：'), n('取得統一編號。免費。約 1～2 個工作天')],
        [b('開立行號專用銀行帳戶：'), n('用商業登記謄本到銀行開立。建議用一般銀行（如台灣銀行、合作金庫），政府機關匯款較常走這兩家')],
        [b('申請加入「免用統一發票」或「使用統一發票」：'), n('年收入預計 NT$ 50 萬以下：申請免用統一發票，開立二聯式收據即可，行政負擔最小。超過後再升級')],
      ]),
      sp(),
      h2('2.2　金流設置'),
      p([b('原則：'), n('讓客戶有多種付款方式，但不要讓本人的任何帳號出現在付款紀錄中。')]),
      sp(),
      tbl3([
        ['付款方式', '適合客群', '設置難度', true],
        ['銀行轉帳（行號帳戶）', '政府機關（最常用，可出具帳款匯入憑證）', '低，立刻可用'],
        ['綠界 ECPay 信用卡收款', '學校、個人用戶', '中，需行號統編申請特店，約 1～2 週'],
        ['藍新金流（NewebPay）', '學校、個人用戶', '中，與綠界類似，二擇一即可'],
        ['支票', '大型機關（縣市局級）', '行號帳戶可收，無需特別設置'],
      ], 2500, 2500, 3500),
      sp(),
      ...warningBox('注意', [
        '政府機關通常需要「統一發票」或「收據」才能核銷，行號可開立「二聯式收據」（免統一發票）。',
        '機關需要統一發票時，需升級為「使用統一發票」並按月申報，建議有穩定訂單後才做。',
      ], CBLUE),
      sp(),
      h2('2.3　第二階段：設立公司的時機與考量'),
      p([b('建議轉換時機：'), n('符合以下任一條件時考慮設立有限公司：')]),
      ...bul([
        '年收入超過 NT$ 50 萬（行號稅負較高，公司有優化空間）',
        '有大型機關或縣市局級合約，對方要求對象為「公司」',
        '需要聘用正式員工或與他人正式合夥',
        '本人確定退休/離職，可以正式出面成為股東或員工',
      ]),
      sp(),
      p([b('轉換方式：'), n('重新設立有限公司（資本額建議 NT$ 10 萬，最低門檻）；現有行號的合約、客戶關係可以函告通知移轉到新公司；行號可以繼續保留或廢止。')]),
      pb(),

      // ══════════════════════════════════════════
      h1('第三章　產品架構設計'),
      // ══════════════════════════════════════════
      h2('3.1　免費版 vs 付費版功能劃分'),
      p('功能劃分的設計原則：免費版足夠讓使用者「嘗到甜頭」，但付費版解決的是「日常工作效率」——讓付費決定成為理性的，而不是衝動的。'),
      sp(),
      tbl3([
        ['功能', '免費版', '付費版', true],
        ['情境問答（flow）', '可使用，每日有次數提示', '無限制，儲存最近查詢記錄'],
        ['條文庫查詢', '完整可用', '完整可用，另加進階搜尋篩選'],
        ['試算工具', '完整可用', '完整可用，可匯出試算結果 PDF'],
        ['法規原文連結', '有，跳外部網站', '有，並自動偵測連結失效（通知）'],
        ['情境卡 PDF 列印版', '不提供', '提供可套用機關名稱的格式化 PDF'],
        ['法規更新通知', '不提供', 'Email 或 LINE 通知（有新增/修訂時）'],
        ['引用格式自動產生', '不提供', '一鍵產生公文用引用字串'],
        ['客戶支援', '問題回報（3 個工作日內回覆）', '優先回應（1 個工作日內）'],
        ['使用人數', '無限制（無帳號）', '依方案限制，超量自動擋'],
      ], 3000, 2000, 3500),
      sp(),
      h2('3.2　技術存取控管（分兩個子系統）'),
      h3('3.2.1　直接網頁存取（主要路線）'),
      p('使用者直接瀏覽你的網站，授權碼控制進階功能的解鎖，無需 iframe：'),
      sp(),
      ...num([
        [b('授權碼（Token）生成：'), n('每個付費客戶取得一組唯一的 UUID 授權碼（例：GOV-XXXX-XXXX-XXXX）')],
        [b('授權碼輸入方式：'), n('使用者在網站首頁輸入授權碼，Local Storage 儲存，之後自動讀取；或加在 URL 參數後直接進入（適合機關管理員分發連結給同仁）')],
        [b('CF Workers 驗證：'), n('前端每次載入核心資料時，將授權碼帶到 CF Workers API，Workers 查 KV 確認有效性（有無逾期、有無超量）')],
        [b('KV 存的授權碼結構：')],
      ]),
      sp(),
      tbl2([
        ['KV 欄位', '說明', true],
        ['token', 'UUID，主鍵'],
        ['billing_entity', '付費機關名稱（如「成功大學主計室」）'],
        ['unified_number', '機關統一編號（防止其他機關使用）'],
        ['max_users', '授權人數上限（對應方案）'],
        ['current_uses', '當月已使用次數計數'],
        ['expires_at', '到期日（YYYY-MM-DD）'],
        ['tier', '方案層級（basic / standard / premium）'],
        ['features', '開啟的功能清單（JSON array）'],
      ], 2800, 5700),
      sp(),
      p([b('實作成本：'), n('直接在現有 CF Workers + KV 上擴充，不需要新基礎設施。以 Claude Code 約 2～3 小時可完成基礎版本。')]),
      sp(),
      h3('3.2.2　iframe 嵌入（for 學校官網，選擇性推出）'),
      p('學校希望在自己的入口網站直接嵌入，使用者不離開學校官網：'),
      sp(),
      ...bul([
        [b('架構：'), n('學校在官網加入 <iframe src="https://你的網站?token=XXX&domain=ncku.edu.tw" />，內容仍在你的伺服器')],
        [b('驗證流程：'), n('iframe 載入時，CF Workers 比對 token + document.referrer 網域，必須同時符合才放行')],
        [b('優點：'), n('學校 IT 不需維護更新；品牌在學校官網持續曝光；資料完全在你的伺服器，不被複製')],
        [b('注意事項：'), n('部分學校 IT 部門設有 CSP（內容安全政策），可能擋外部 iframe，洽談時需準備「白名單申請說明文件」範本供學校 IT 使用')],
        [b('建議時機：'), n('有第一個學校客戶確認後再開發此功能，不要提前投入')],
      ]),
      sp(),
      h2('3.3　授權碼管理工具（家人/朋友用）'),
      p('家人/朋友需要一個介面來管理客戶授權碼，不需要登入你的 CF 後台：'),
      sp(),
      ...bul([
        [b('第一階段（簡單版）：'), n('用 Google Sheets 記錄所有授權碼及客戶資訊，本人用 Claude Code 在 CF KV 手動建立/更新授權碼（每次操作不超過 5 分鐘）')],
        [b('第二階段（有了穩定客戶後）：'), n('建置簡易管理頁面，家人/朋友登入後可以自行建立授權碼、查看到期日、停用授權碼。用 Supabase 免費方案作為資料庫（500MB 免費，存幾百個客戶完全夠用）')],
        [b('Supabase 設置：'), n('免費，不需要信用卡。Claude Code 可協助建立資料表和 REST API，約需 3～4 小時')],
      ]),
      pb(),

      // ══════════════════════════════════════════
      h1('第四章　定價策略'),
      // ══════════════════════════════════════════
      h2('4.1　分級定價表'),
      p([b('設計原則：'), n('所有方案年費 ≤ NT$ 99,000，學校和機關均可走「直接採購」程序，不需招標，大幅降低行政阻力。')]),
      sp(),
      tbl4([
        h4r(['方案名稱', '授權人數', '年費', '每人年均成本']),
        ['入門版', '1～5 人', 'NT$ 3,600', 'NT$ 720'],
        ['基本版', '6～15 人', 'NT$ 8,400', 'NT$ 560～1,400'],
        ['標準版', '16～30 人', 'NT$ 15,000', 'NT$ 500～940'],
        ['進階版', '31～60 人', 'NT$ 24,000', 'NT$ 400～775'],
        ['機關版', '61～100 人', 'NT$ 36,000', 'NT$ 360～590'],
        ['全機關版', '100 人以上', 'NT$ 60,000 起', 'NT$ 600 以下'],
      ], [2000, 2000, 2500, 2000]),
      sp(),
      h2('4.2　早期採用者優惠（前 20 個客戶）'),
      ...bul([
        [b('前 10 個客戶：'), n('免費試用 6 個月，之後按正常定價續約。條件：願意提供書面使用案例（匿名化後用於推廣）')],
        [b('第 11～20 個客戶：'), n('首年 7 折優惠。條件：一次付清年費')],
        [b('目的：'), n('以優惠換取使用案例和口碑，不是純粹的價格競爭')],
      ]),
      sp(),
      h2('4.3　試算：不同情境下的年收入'),
      tbl3([
        ['情境', '客戶數（估計）', '年收入（估計）', true],
        ['最低可行：維持基本成本', '3～5 個機關（基本版）', 'NT$ 2.5 萬～4.2 萬'],
        ['兼職有感：相當於副業收入', '15～25 個機關', 'NT$ 12.6 萬～21 萬'],
        ['規模化目標', '80～120 個訂閱單位', 'NT$ 67 萬～100 萬'],
        ['教育部體系 5% 滲透率', '約 200 個學校', 'NT$ 168 萬（按基本版均價估）'],
      ], 3500, 2500, 2500),
      sp(),
      p([b('損益兩平：'), n('固定成本幾乎為零（網站 NT$ 0/月，現有 CF 免費方案）。只要有 3～5 個付費客戶，就已超越現金成本。所謂「損益兩平」在這個模型裡指的是「你的時間投入有沒有等值回報」。')]),
      pb(),

      // ══════════════════════════════════════════
      h1('第五章　客戶獲取策略'),
      // ══════════════════════════════════════════
      h2('5.1　目標客群優先順序'),
      tbl2([
        ['優先序', '目標客群與理由', true],
        ['P1（優先）', [b('國立大學主計體系：'), n('12 所國立大學主計人員互相熟識、資訊流通快；你的背景讓你在這個圈子有天然公信力；NCKU 試點成功後，口耳相傳速度遠快於一般社群')]],
        ['P2（次優）', [b('大專校院行政主計室（全臺 145 所）：'), n('決策鏈短、採購程序相對簡單；受教育部相關規定影響，對你的內容有直接需求')]],
        ['P3', [b('高中職總務/出納人員（508 所）：'), n('人數多、但決策更分散，適合以低價方案快速滲透')]],
        ['P4（長期）', [b('縣市政府教育局統一訂閱：'), n('一個合約覆蓋轄下所有學校，但採購流程複雜，是規模化後才追求的目標')]],
        ['P5（長期）', [b('政府機關（非教育體系）：'), n('主計總處的輻射範圍涵蓋全部機關，但需要更高的公信力和推廣資源')]],
      ], 1800, 6700),
      sp(),
      h2('5.2　NCKU 匿名試點策略（最重要的第一步）'),
      p([b('核心原則：'), n('全程不具名，讓工具自己說話，不讓「是誰做的」成為討論焦點。')]),
      sp(),
      h3('5.2.1　三種傳播方式（由低風險到高風險）'),
      ...num([
        [b('方法一（最低風險）：'), n('找 1～2 位你信任且非直屬的同事，以「我看到一個不錯的工具，你試試」的方式口耳相傳，沒有任何說明你與工具的關聯')],
        [b('方法二（中等風險）：'), n('請研習承辦人員以「知識分享」名義在內網公告，採用「一位熱心同仁整理的工具，歡迎試用」的措辭，全程不具名')],
        [b('方法三（建議，但需評估）：'), n('以筆名投稿主計人員 Facebook/LINE 社群，與你本人完全切割的帳號撰文分享')],
      ]),
      sp(),
      ...warningBox('提醒', [
        'NCKU 試點的匿名性是你目前身分下最重要的保護。一旦試點成功，後續擴散不需要你出面——工具本身的品質會讓使用者自發推薦。',
      ], CORANGE),
      sp(),
      h3('5.2.2　試點期間蒐集的資料（用於後續推廣）'),
      ...bul([
        'Google Analytics 流量（哪些頁面最多人訪問、平均停留時間）',
        '問題回饋表單的意見（有多少人反映「這個工具有用」）',
        '哪些情境卡被最多人查詢（驗證內容的市場需求）',
        '有沒有人主動詢問「有沒有更完整的版本」或「怎麼引用這個工具」',
      ]),
      sp(),
      h2('5.3　對外推廣策略（第二階段後）'),
      h3('5.3.1　主計人員社群管道'),
      ...bul([
        [b('Facebook 社群：'), n('搜尋「公務員主計」「政府會計」「學校總務出納」相關社群，以筆名或家人帳號發表實用文章，不是廣告而是「我分享一個工具」')],
        [b('PTT gov 版：'), n('po 一篇「有人在整理旅費報支法規的完整資料庫，蠻實用的」這類第三者語氣的文章')],
        [b('主計總處研習課程：'), n('詢問是否有「5 分鐘工具分享」的時間——這是直接觸及目標客群的黃金機會，即使一次只介紹給 20 人，這 20 人每個人認識的人都是潛在用戶')],
      ]),
      sp(),
      h3('5.3.2　Email 直接接觸（第三階段啟動後）'),
      p('當你已有 NCKU 使用案例後，可以用行號名義 Email 接觸其他大學主計室：'),
      sp(),
      ...bul([
        [b('Email 範本原則：'), n('不要一開始就談錢。第一封 Email 是「介紹工具，邀請免費試用」，建立信任後再談付費')],
        [b('對象：'), n('各大學主計室的電子信箱通常在學校官網可以找到，這是公開資訊')],
        [b('頻率：'), n('每週不超過 5 封，保持品質勝過數量；太密集的群發會讓人覺得是垃圾信')],
        [b('跟進：'), n('寄出後 2 週無回應，發一封短的跟進信。超過 2 次無回應就不再打擾，記錄在追蹤表中')],
      ]),
      pb(),

      // ══════════════════════════════════════════
      h1('第六章　分階段任務安排'),
      // ══════════════════════════════════════════
      h2('6.1　各階段總覽'),
      tbl4([
        h4r(['階段', '時間', '核心目標', '成功指標']),
        ['第 0 期', '立即（本月內）', '法律確認 + 商業主體就位', '行號設立完成；法律路徑書面確認'],
        ['第 1 期', '第 1～3 個月', 'NCKU 試點 + 產品補強', '100 個月活用戶；30 份問題回饋'],
        ['第 2 期', '第 4～6 個月', '對外推廣 + 技術就緒', 'Email 訂閱 100 人；2～3 個意向客戶'],
        ['第 3 期', '第 7～12 個月', '商轉啟動', '30 個付費客戶；年收 NT$ 25 萬'],
        ['第 4 期', '第 2 年起', '規模化', '120 個訂閱單位；年收 NT$ 100 萬'],
      ], [1300, 1800, 2700, 2700]),
      sp(),

      // ── Phase 0 ──
      h2('6.2　第 0 期：立即執行（本月內）'),
      sp(),
      tbl3([
        ['類別', '任務', '預估時間', true],
        ['【法律】', '諮詢人事室或律師（可用 LINE 預約免費諮詢），書面確認「以家人名義設行號提供技術支援」是否符合公務員服務法規定', '1～2 小時'],
        ['【法律】', '確認財產申報義務範圍：家人名義的行號，本人是否需要在財產申報中揭露（問人事室）', '30 分鐘'],
        ['【商業主體】', '家人/朋友至縣市政府商業處（或線上）申請商號，備好身分證、印章、地址', '半天'],
        ['【商業主體】', '家人/朋友至國稅局辦理稅籍登記，取得統一編號', '1～2 小時'],
        ['【商業主體】', '以行號名義開立銀行帳戶（建議台灣銀行或合作金庫）', '1 小時'],
        ['【技術】', '安裝 Google Analytics（在 index.html 加入追蹤碼），開始記錄網站流量', '30 分鐘'],
        ['【技術】', '在 Google Form 問題回饋表單加入「這個工具幫助你解決了什麼問題」的開放式問題', '20 分鐘'],
        ['【技術】', '設定 Google Alerts（監控「核銷這樣做」「政府支出法規知識庫」等關鍵字）', '30 分鐘'],
        ['【安全】', 'GitHub + Cloudflare 帳號開啟兩步驟驗證；確認 OneDrive 自動備份正常', '20 分鐘'],
        ['【推廣】', '建立一個與本人切割的社群帳號（筆名），用於 PTT/Facebook 匿名推廣', '30 分鐘'],
      ], 1500, 4500, 2500),
      sp(),

      // ── Phase 1 ──
      h2('6.3　第 1 期：NCKU 試點（第 1～3 個月）'),
      p([b('本期核心工作：'), n('不談錢，只讓人用。讓口碑在目標社群中自然流動。')]),
      sp(),
      tbl3([
        ['類別', '任務', '預估時間', true],
        ['【推廣】', '選定 1～2 位信任的 NCKU 同事，以「這是個不錯的工具，你用用看」方式口耳相傳，不透露自己做的', '0（自然對話）'],
        ['【推廣】', '以筆名帳號在主計人員 FB/LINE 社群發表「旅費報支完整指南」實用文章，附上工具連結', '2～3 小時'],
        ['【產品】', '製作一頁式服務說明 PDF（供未來機關採購參考）：網站功能、適用對象、定價表、聯絡方式（用行號電話/Email）', '2 小時（Claude Code 輔助排版）'],
        ['【產品】', '決定免費版功能邊界，在網站加入「升級通知」按鈕（點擊後導向 Google Form 留 Email）', '1 小時'],
        ['【技術】', '在 CF KV 設計授權碼資料結構（unified_number、max_users、expires_at、tier），並以 Claude Code 實作 Token 驗證邏輯', '3～4 小時'],
        ['【技術】', '建立 Google Sheets 授權碼管理表（給家人/朋友），記錄客戶名稱、Token、到期日、方案', '1 小時'],
        ['【數據】', '每週查看一次 Google Analytics，記錄哪些情境卡最多人用（這決定下一步優先新增什麼）', '每週 15 分鐘'],
        ['【法規】', '新增 2～4 張情境卡（依 Google Analytics 顯示的高流量頁面補充）', '每月 2 小時'],
        ['【月底檢討】', '第 3 個月底：是否已有 100 個月活用戶？問題回饋是否有人說「希望有 XX 功能」？有無人主動詢問合作？', '30 分鐘'],
      ], 1500, 4500, 2500),
      sp(),

      // ── Phase 2 ──
      h2('6.4　第 2 期：對外擴散（第 4～6 個月）'),
      p([b('本期核心工作：'), n('從 NCKU 走向全國，準備好收費工具，但不強迫推銷。')]),
      sp(),
      tbl3([
        ['類別', '任務', '預估時間', true],
        ['【推廣】', '整理 NCKU 試點數據（匿名化），製作「使用案例摘要」1 頁，作為對外推廣的佐證', '1 小時'],
        ['【推廣】', '以行號名義 Email 接觸 5～10 所其他國立大學主計室，邀請免費試用（附一頁說明 PDF）', '每週 1 小時'],
        ['【推廣】', '詢問主計總處研習課程承辦人，是否有「5 分鐘工具分享」的機會（以行號名義，不具名個人）', '1 封 Email'],
        ['【金流】', '申請綠界 ECPay 或藍新金流特店（行號統編申請，約 1～2 週審核）', '2 小時（填表）'],
        ['【金流】', '在網站加入「申請試用 / 訂閱方案」頁面，顯示定價表和付款方式（轉帳帳號 + ECPay 連結）', '2 小時（Claude Code）'],
        ['【技術】', '建置 iframe embed + Token 驗證功能（如有學校客戶要求時才優先開發）', '4～5 小時（Claude Code）'],
        ['【技術】', '建置 Supabase 授權碼管理資料表，讓家人/朋友可以從簡易管理頁面建立/停用 Token', '4 小時（Claude Code）'],
        ['【法規】', '根據前 3 個月的使用者反饋，決定新增哪個母題（如：加班費、出席費）', '評估 1 小時，開發視規模'],
        ['【月底檢討】', '第 6 個月底：Email 訂閱人數達到多少？有無 2～3 個機關表達付費意向？', '30 分鐘'],
      ], 1500, 4500, 2500),
      sp(),

      // ── Phase 3 ──
      h2('6.5　第 3 期：商轉啟動（第 7～12 個月）'),
      p([b('本期核心工作：'), n('把「意向客戶」轉成「付費客戶」，建立可重複的收費流程。')]),
      sp(),
      tbl3([
        ['類別', '任務', '預估時間', true],
        ['【商轉】', '正式啟動付費方案，對第 2 期的意向客戶發送「現在可以訂閱了」的通知，附定價表和申請方式', '1 小時'],
        ['【商轉】', '準備「報價單範本」（行號信頭、服務說明、金額、付款方式），供機關提交採購申請', '2 小時（Claude Code 排版）'],
        ['【商轉】', '準備「服務說明書」（1～2 頁），供機關長官審核採購用途', '2 小時'],
        ['【商轉】', '簽署第一份授權合約（請 Claude Code 依照第二章的條款草擬範本，視情況請律師確認）', '1 小時'],
        ['【金流】', '第一筆收入入帳後，確認行號帳務記錄正確（記帳本記錄收入來源、日期、金額）', '30 分鐘'],
        ['【產品】', '開發「法規更新自動通知」功能（Email 通知付費用戶），這是付費版的核心差異化點', '3～4 小時（Claude Code）'],
        ['【技術】', '設定授權碼到期前 30 天自動提醒（Email 給家人/朋友，由其聯絡客戶續約）', '2 小時（Claude Code）'],
        ['【目標】', '第 12 個月底：達成 30 個付費訂閱單位，年化收入超過 NT$ 25 萬', '—'],
      ], 1500, 4500, 2500),
      sp(),

      // ── Phase 4 ──
      h2('6.6　第 4 期：規模化（第 2 年起）'),
      p([b('本期核心工作：'), n('建立可持續的成長飛輪，評估是否需要引入更多資源。')]),
      sp(),
      tbl3([
        ['類別', '任務', '優先序', true],
        ['【擴充內容】', '新增政府採購法規情境卡（廠商比選、決標、驗收等主計相關流程）', '高'],
        ['【擴充內容】', '新增人事法規（差假規定、加班費計算）類別', '高'],
        ['【商業主體】', '若年收入超過 NT$ 50 萬，由家人/朋友設立有限公司，接手行號業務', '中'],
        ['【市場】', '探索縣市教育局統一訂閱方案（一個合約覆蓋轄下學校），需要公司主體才容易談', '中'],
        ['【技術】', '評估是否開放 API（需有穩定收入支撐維運責任風險）', '低'],
        ['【人力】', '若業務量超出兼職可承受範圍，評估是否由家人/朋友正式投入（或招募兼職助理）', '低'],
        ['【本人】', '若屆時考慮退休/離職，可正式成為公司股東或員工，商轉架構重新調整', '視情況'],
      ], 1500, 4500, 2500),
      pb(),

      // ══════════════════════════════════════════
      h1('第七章　風險管理'),
      // ══════════════════════════════════════════
      h2('7.1　公務員身份風險（最高優先）'),
      tbl2([
        ['風險項目', '應對方式', true],
        ['被認定「實質經營商業活動」', '確保本人姓名不出現在任何商業文件；家人/朋友為 100% 的法律主體；不直接收受報酬'],
        ['財產申報揭露問題', '第 0 期立即諮詢人事室，書面確認揭露範圍；不要等到有收入才問'],
        ['機關內部被發現', 'NCKU 試點全程匿名；網站版權聲明只用行號名稱，不用本人姓名；對外聯絡只用行號電話/Email'],
        ['法規修改導致灰色地帶縮小', '定期（每半年）重新確認法律狀態；若環境改變，B 路徑（等退休）仍是保留選項'],
      ], 3000, 5500),
      sp(),
      h2('7.2　技術風險'),
      tbl2([
        ['風險項目', '應對方式', true],
        ['CF Workers 免費額度耗盡', '每日 100K 請求限制，500 個付費用戶每天各查詢 200 次才會觸頂。真正達到這個量時升級方案（$5/月）是划算的'],
        ['GitHub Pages 或 CF Workers 服務中斷', '建立 OneDrive + GitLab 雙備份；熟悉從備份還原的流程（每半年演練一次）'],
        ['CF KV 資料遺失', '每次更新後，本機和 OneDrive 各備份一份 nodes.json 和 scenarios_manual.json'],
        ['Claude Code 無法處理的技術問題', '建立「已知技術問題清單」，嚴重問題可在 GitHub Issues 或社群尋求幫助；架構設計盡量簡單化'],
      ], 3000, 5500),
      sp(),
      h2('7.3　市場風險'),
      tbl2([
        ['風險項目', '應對方式', true],
        ['使用者增長緩慢', '90 天後重新評估曝光管道；若 3 個月後 UV 仍低於 50/月，考慮更主動的接觸策略'],
        ['競爭者出現（類似工具）', '你的核心競爭力是「深度整理的質量」和「持續更新的法規追蹤」，而不是技術。競爭者難以在短期內達到你的內容深度'],
        ['主計總處或教育部自建類似工具', '風險存在但機率低（政府自建通常很慢）；若發生，你的工具可以轉型為「輔助查找」定位，而非「取代官方」'],
        ['客戶不願付費', '先驗證「有人願意用」，再驗證「有人願意付費」，按序進行，不跳過驗證步驟'],
      ], 3000, 5500),
      sp(),
      h2('7.4　財務風險'),
      ...bul([
        [b('現金成本近乎為零，財務風險極低：'), n('網站 NT$ 0/月；CF Workers 免費方案夠用至相當規模；不建議有任何固定人力成本在正式商轉前')],
        [b('會計風險：'), n('行號的收入屬家人/朋友的個人所得，需如實申報所得稅（10% 的執行業務所得或記帳申報）。年收入 NT$ 50 萬以下，行政負擔很低')],
        [b('未預期的帳務糾紛：'), n('授權合約中明確約定「付費後不退款」（已在第二章條款中列入），避免爭議')],
      ]),
      pb(),

      // ══════════════════════════════════════════
      h1('附錄　工具與資源速查'),
      // ══════════════════════════════════════════
      h2('A. 設立行號所需文件清單'),
      ...bul([
        '身分證正本（家人/朋友的）',
        '印章（個人章即可）',
        '戶籍地址或營業地址（可用戶籍地）',
        '行號名稱（事先想好 2～3 個備用，可能被占用）',
        '前往地點：戶籍所在縣市政府商業處（或 線上申請：gcis.nat.gov.tw）',
      ]),
      sp(),
      h2('B. 各阶段关键工具清单'),
      tbl3([
        ['工具', '用途', '費用', true],
        ['Google Analytics 4', '網站流量追蹤（裝一次，長期有效）', '免費'],
        ['Google Forms', '使用者回饋表單、Email 訂閱', '免費'],
        ['Google Alerts', '侵權和品牌監控', '免費'],
        ['Google Sheets', '授權碼管理表（第一階段）', '免費'],
        ['Supabase Free Tier', '授權碼資料庫（第二階段，500MB 免費）', '免費'],
        ['Cloudflare Workers + KV（現有）', 'Token 驗證 + 資料保護 API', '免費'],
        ['綠界 ECPay 或藍新金流', '信用卡收款（行號申請）', '手續費 2.75%～3.5%'],
        ['Mailchimp Free Plan', 'Email 訂閱名單（每月 500 封免費）', '免費'],
        ['台灣銀行或合作金庫', '行號專用帳戶', '免費（開戶）'],
        ['Claude Code', '所有技術工作的主要工具', '依訂閱方案'],
      ], 2500, 3500, 1800),
      sp(),
      h2('C. 授權合約草擬提示詞（給 Claude Code）'),
      new Paragraph({
        indent: { left: 400 },
        border: { left: { style: BorderStyle.SINGLE, size: 8, color: 'AAAAAA', space: 12 } },
        children: [new TextRun({ text: '「請幫我草擬一份「政府支出法規知識庫」授權使用合約範本，甲方為（行號名稱），乙方為政府機關或學校。條款包括：授權範圍（內部查詢）、授權期間（1 年）、授權人數上限（依方案）、禁止轉授權、免責聲明（資料僅供參考，正式決策以主管機關版本為準）、侵權賠償（3 倍授權費用）、到期自動提醒、準據法（臺灣）、管轄法院（臺北地方法院）。格式為繁體中文標準合約格式，不超過 2 頁 A4。」', color: '333333' })]
      }),
      sp(),
      sp(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 8 } },
        children: [new TextRun({ text: '本方案以「2026 年 5 月」為基準點撰寫，建議每 6 個月依進展重新複盤並調整。', size: 18, color: CG, font: '標楷體' })]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUTPUT, buf);
  console.log('DONE:', OUTPUT);
}).catch(e => { console.error(e); process.exit(1); });

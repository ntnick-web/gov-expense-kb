// 產生「授權、商轉、權利保護、網站維護」詳細可行建議報告
// Run: NODE_PATH="C:/Users/user/AppData/Roaming/npm/node_modules" node docs/_gen_report2.js
'use strict';
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat
} = require('docx');
const fs = require('fs');

const OUTPUT = 'C:\\Users\\user\\OneDrive\\桌面\\支出規定視覺化資料庫\\docs\\商轉可行建議報告_2026-05-03.docx';

const C_PURPLE  = '4A148C';
const C_PURPLE2 = '7B1FA2';
const C_DARK    = '311B92';
const C_GRAY    = '888888';

const BORDER  = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const CM      = { top: 80, bottom: 80, left: 120, right: 120 };

// ── 段落工廠 ──────────────────────────────
function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, bold: true })] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, bold: true })] });
}
function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text, bold: true })] });
}
function p(runs) {
  if (typeof runs === 'string') return new Paragraph({ children: [new TextRun({ text: runs })] });
  if (!Array.isArray(runs)) return new Paragraph({ children: [runs] });
  return new Paragraph({ children: runs });
}
function bold(text, color) { return new TextRun({ text, bold: true, ...(color ? { color } : {}) }); }
function normal(text)       { return new TextRun({ text }); }
function spacer()           { return new Paragraph({ children: [] }); }
function pageBreak()        { return new Paragraph({ children: [new PageBreak()] }); }

// ── 清單（每個 item 是字串 or TextRun[] ）──
function bullet(items) {
  return items.map(item => new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    children: typeof item === 'string' ? [new TextRun({ text: item })]
             : Array.isArray(item)     ? item
             : [item]
  }));
}
function subbullet(items) {
  return items.map(item => new Paragraph({
    numbering: { reference: 'sub-bullets', level: 0 },
    children: typeof item === 'string' ? [new TextRun({ text: item })]
             : Array.isArray(item)     ? item
             : [item]
  }));
}
function numbered(items) {
  return items.map(item => new Paragraph({
    numbering: { reference: 'numbers', level: 0 },
    children: typeof item === 'string' ? [new TextRun({ text: item })]
             : Array.isArray(item)     ? item
             : [item]
  }));
}

// ── 表格工廠 ──────────────────────────────
function mkCell(content, width, isHeader) {
  const fill = isHeader ? 'E8EAF6' : 'FFFFFF';
  let runs;
  if (typeof content === 'string') {
    runs = isHeader ? [bold(content)] : [new TextRun({ text: content })];
  } else if (Array.isArray(content)) {
    runs = isHeader ? content.map(r => (r.options ? Object.assign({}, r.options, { bold: true }) && r : r)) : content;
  } else {
    runs = [content];
  }
  return new TableCell({
    borders: BORDERS,
    width: { size: width, type: WidthType.DXA },
    shading: { fill, type: ShadingType.CLEAR },
    margins: CM,
    children: [new Paragraph({ children: runs })]
  });
}
function table2(rows, c1 = 3500, c2 = 5000) {
  return new Table({
    width: { size: c1 + c2, type: WidthType.DXA },
    columnWidths: [c1, c2],
    rows: rows.map(([a, b, hdr]) => new TableRow({ children: [mkCell(a, c1, hdr), mkCell(b, c2, hdr)] }))
  });
}
function table3(rows, c1 = 2800, c2 = 2800, c3 = 2900) {
  return new Table({
    width: { size: c1 + c2 + c3, type: WidthType.DXA },
    columnWidths: [c1, c2, c3],
    rows: rows.map(([a, b, c, hdr]) => new TableRow({ children: [mkCell(a, c1, hdr), mkCell(b, c2, hdr), mkCell(c, c3, hdr)] }))
  });
}
function table4(rows, ws = [2200, 2200, 2200, 1900]) {
  return new Table({
    width: { size: ws.reduce((s, x) => s + x, 0), type: WidthType.DXA },
    columnWidths: ws,
    rows: rows.map(cols => new TableRow({
      children: cols.map((c, i) => {
        const hdr = typeof c === 'object' && c._h;
        const txt = typeof c === 'string' ? c : (c.v || '');
        return mkCell(txt, ws[i], hdr);
      })
    }))
  });
}
function h4row(arr) { return arr.map(v => ({ v, _h: true })); }

// ════════════════════════════════════════════
// 文件內容
// ════════════════════════════════════════════
const doc = new Document({
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•',
          alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: 'sub-bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '–',
          alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1200, hanging: 360 } } } }] },
      { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.',
          alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  styles: {
    default: { document: { run: { font: '標楷體', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 34, bold: true, color: C_PURPLE, font: '標楷體' },
        paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C_PURPLE2, space: 4 } } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, color: C_DARK, font: '標楷體' },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 23, bold: true, color: '37474F', font: '標楷體' },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    properties: {
      page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1300, bottom: 1440, left: 1400 } }
    },
    headers: { default: new Header({ children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 4 } },
      children: [new TextRun({ text: '政府支出法規知識庫　授權・商轉・保護・維護　完整建議報告', size: 16, color: C_GRAY, font: '標楷體' })]
    })] }) },
    footers: { default: new Footer({ children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 4 } },
      children: [
        new TextRun({ text: '第 ', size: 18, color: C_GRAY }),
        new TextRun({ children: [PageNumber.CURRENT], size: 18, color: C_GRAY }),
        new TextRun({ text: ' 頁', size: 18, color: C_GRAY }),
      ]
    })] }) },
    children: [
      // ── 封面 ──────────────────────────────
      spacer(), spacer(), spacer(), spacer(),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 },
        children: [new TextRun({ text: '政府支出法規知識庫', size: 52, bold: true, color: C_PURPLE, font: '標楷體' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 240 },
        children: [new TextRun({ text: '「核銷這樣做!!!」', size: 36, color: C_PURPLE2, font: '標楷體' })] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 6, color: C_PURPLE2 }, bottom: { style: BorderStyle.SINGLE, size: 6, color: C_PURPLE2 } },
        spacing: { before: 160, after: 160 },
        children: [new TextRun({ text: '授權架構・商轉規劃・權利保護・網站維護', size: 30, bold: true, color: C_DARK, font: '標楷體' })]
      }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 80 },
        children: [new TextRun({ text: '完整可行建議報告', size: 28, bold: true, color: C_DARK, font: '標楷體' })] }),
      spacer(), spacer(), spacer(),
      new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '2026 年 5 月 3 日　v1.0', size: 22, color: C_GRAY, font: '標楷體' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '適用情境：單人兼職・非技術背景・最小化開支・長期商轉', size: 20, color: C_GRAY, font: '標楷體' })] }),
      pageBreak(),

      // ══ 第一章 ════════════════════════════
      h1('第一章　前提與現況確認'),
      h2('1.1　本報告的前提假設'),
      p([bold('本報告所有建議，均以下列條件為前提，每項建議必須同時滿足「可由一人執行」、「不需程式背景」、「不需前期資金」三個條件：')]),
      spacer(),
      ...bullet([
        [bold('單人運營：'), normal('目前只有你一個人，沒有共同創辦人或兼職員工')],
        [bold('非技術背景：'), normal('不具備資訊工程專業，主要借助 Claude Code 等 AI 工具完成技術工作')],
        [bold('有正職工作：'), normal('在確定長期獲利之前不考慮離職，商轉以「兼職進行」為原則')],
        [bold('最小化前期支出：'), normal('在尚未有穩定營收前，不增加任何固定費用；現有免費工具優先')],
        [bold('長線思維：'), normal('目標是可持續的商業模式，而非快速變現後退出')],
      ]),
      spacer(),
      h2('1.2　目前資產盤點'),
      p([bold('你已經擁有的，比你想像的多：')]),
      spacer(),
      table3([
        ['資產類型', '目前狀態', '商業價值', true],
        ['核心知識庫', '555 節點、75 情境卡、4 母題', [bold('高。'), normal('建立此規模需數百工時，競爭門檻很高')]],
        ['網站基礎設施', 'GitHub Pages + CF Workers（均免費）', [bold('高。'), normal('已完成，零固定維運費用')]],
        ['內容保護架構', 'CF KV + robots.txt + CC BY-NC-ND 4.0', [bold('已就位。'), normal('競爭者無法直接複製')]],
        ['工具能力', 'Claude Code 為主工具，可完成複雜技術任務', [bold('高。'), normal('以非技術背景達成技術工作')]],
        ['法律文件', 'LICENSE.md、terms.md、privacy.md 均已完成', [bold('已就位。'), normal('商業合作基礎具備')]],
        ['知識領域', '對政府採購、核銷法規有深度理解', [bold('稀缺。'), normal('懂法規又懂數位工具的人極少')]],
      ], 2500, 3000, 3000),
      spacer(),
      h2('1.3　你面對的主要風險'),
      ...bullet([
        [bold('時間稀缺：'), normal('正職工作佔去大部分精力，商轉工作必須極度聚焦，不能分散在太多方向')],
        [bold('內容抄襲：'), normal('法規整理成果容易被複製貼上，技術保護要與法律保護雙管齊下')],
        [bold('法律不熟悉：'), normal('授權協議、合約、侵權處理等，需要標準的應對流程而非臨時應付')],
        [bold('客戶期待管理：'), normal('政府機關是保守客戶，需要建立信任後才會付款，不適合強硬推銷')],
        [bold('技術孤島：'), normal('Claude Code 是唯一技術工具，作為單點依賴有風險，需備份策略')],
      ]),
      pageBreak(),

      // ══ 第二章 ════════════════════════════
      h1('第二章　授權架構設計'),
      h2('2.1　現行授權架構說明'),
      p('你目前使用的雙授權架構已經相當完整，以下是現行架構的清晰說明：'),
      spacer(),
      table3([
        ['授權對象', '目前授權', '說明', true],
        ['程式碼（04_web/、根目錄）', 'All Rights Reserved', '最嚴格保護，任何人不得複製或商業使用'],
        ['整理內容（摘要、標籤、情境等）', 'CC BY-NC-ND 4.0', '允許非商業分享，禁商業使用、禁改作'],
        ['法規原文', '政府公開資訊（著作權法 §9）', '屬公有領域，任何人可使用'],
      ], 2800, 2600, 3100),
      spacer(),
      h2('2.2　CC BY-NC-ND 4.0 實際意義（白話說明）'),
      ...bullet([
        [bold('允許：'), normal('其他人可以複製你的整理內容（摘要、情境說明），但必須標明來源是你，且只能用於非商業目的')],
        [bold('禁止：'), normal('不得拿你的整理內容去賣錢（NC = Non-Commercial）')],
        [bold('禁止：'), normal('不得修改後再發布（ND = No Derivatives）')],
        [bold('例外：'), normal('法規原文部分不受你的授權管轄，對方本來就可以引用')],
        [bold('執行：'), normal('CC 授權在臺灣法院具有效力，但需要你主動主張，不會自動阻止侵權')],
      ]),
      spacer(),
      h2('2.3　付費授權層：商業例外授權'),
      p('CC BY-NC-ND 4.0 預設禁止商業使用。但你可以透過「商業例外授權」向付費客戶授予商業使用權——這是 MySQL、Qt 等知名開源項目的標準商業模式。'),
      spacer(),
      p([bold('建議建立的授權層級：')]),
      spacer(),
      table4([
        h4row(['授權層級', '適用對象', '使用範圍', '建議定價方向']),
        ['免費公開版', '個人查詢、學術研究', 'CC BY-NC-ND 4.0，禁商業', '免費（現行）'],
        ['機關訂閱版', '政府機關（5-50 人）', '內部教育訓練、差旅報銷查閱', '依機關規模定價'],
        ['學校訂閱版', '大專院校行政人員', '出納、總務、會計教育使用', '依校規模定價'],
        ['企業版（未來）', '會計師/法律事務所', '客戶諮詢輔助工具', '待規模化後推出'],
      ], [2200, 2000, 2700, 1900]),
      spacer(),
      h2('2.4　付費授權協議必備條款'),
      p('當機關願意付費時，你需要一份「授權合約」。以下是最低限度必須納入的條款（建議用 Claude 起草範本，有具體洽商時再請律師審閱）：'),
      spacer(),
      ...numbered([
        [bold('授權範圍：'), normal('明確寫出哪些內容可以使用（內部查詢）、不能做什麼（不得對外轉售、不得提供給其他機關）')],
        [bold('授權期間：'), normal('建議以年為單位，到期前自動提醒續約')],
        [bold('使用人數/帳號：'), normal('明確約定最大帳號數或「全機關授權」的機關範圍定義')],
        [bold('禁止轉授權：'), normal('不得將授權再授予第三方或子機關（除非另行付費）')],
        [bold('著作人格權保留：'), normal('標明「本資料由政府支出法規知識庫整理，僅供被授權方內部使用」')],
        [bold('侵權賠償：'), normal('違反授權條件時，被授權方需支付損害賠償（至少為授權費用的 3 倍）')],
        [bold('免責聲明：'), normal('資料僅供參考，正式決策以主管機關版本為準（與現有 terms.md 一致）')],
        [bold('終止條款：'), normal('發現違反時，你有權立即終止授權，且已付費用不予退還')],
        [bold('準據法：'), normal('明定以中華民國（臺灣）法律為準，管轄法院為臺北地方法院')],
      ]),
      spacer(),
      h2('2.5　授權費用定價建議'),
      p('政府機關採購有一個特殊邏輯：太便宜反而不信任，太貴又走不了採購流程。以下定價策略專針對這個生態：'),
      spacer(),
      table4([
        h4row(['方案', '定價區間（年費）', '定價依據', '採購方式']),
        ['機關基本版', 'NT$ 3,000～6,000', '低於公告金額門檻 5%，逕行購買', '逕行採購，無需招標'],
        ['機關標準版', 'NT$ 8,000～15,000', '符合小額採購範圍', '小額採購（10 萬以下）'],
        ['學校基本版', 'NT$ 3,000～5,000', '與機關版相同邏輯', '逕行採購'],
        ['多機關合約', 'NT$ 30,000～80,000', '超過 10 萬走公開招標', '公開招標（初期不建議）'],
      ], [2200, 2500, 2800, 2000]),
      spacer(),
      p([bold('關鍵原則：'), normal('初期將定價控制在單一機關 NT$ 5,000 以下（年費）。這個金額在政府機關可以用「會議費」「訂閱服務費」等科目直接購買，不需要走採購程序，行政摩擦最小。')]),
      spacer(),
      p([bold('不建議免費開放機關版的原因：'), normal('免費反而讓機關認為這是「個人做好玩的」，付費才建立「正式服務」的心理定位。即使金額很小，付費行為本身就是信任的象徵。')]),
      pageBreak(),

      // ══ 第三章 ════════════════════════════
      h1('第三章　商轉規劃步驟'),
      h2('3.1　整體策略：三階段漸進路線'),
      p('你目前的網站已在 Google 公開，會有主動搜尋的使用者找到。但「被動等待」不足以達到穩定商轉，需要一個漸進式主動策略，同時不佔用太多正職之外的時間。'),
      spacer(),
      table3([
        ['階段', '目標', '月時間投入', true],
        ['第一階段：建立基礎（0～6 個月）', '建立信任資產，蒐集反饋，不主動談錢', '每月 4～8 小時'],
        ['第二階段：試商業化（6～18 個月）', '找到前 3 個付費客戶，建立收費流程', '每月 8～16 小時'],
        ['第三階段：規模化（18 個月以後）', '系統化招募客戶，評估是否需要助手', '視收入規模再決定'],
      ], 3500, 3500, 1500),
      spacer(),
      h2('3.2　第一階段：建立基礎（0～6 個月）'),
      p([bold('核心目標：'), normal('讓 100 個真實使用者定期使用這個網站，並蒐集他們的具體痛點。')]),
      spacer(),
      h3('3.2.1　零成本曝光行動'),
      ...numbered([
        [bold('在 PTT gov 版、公務員 Facebook 社群分享介紹文（最重要的起點）：')],
      ]),
      ...subbullet([
        '撰寫一篇「我整理了所有國內外旅費報支法規」的使用說明文，以「有用的資訊」而非廣告的姿態出現',
        '分享具體使用場景（例：「出國開會，保險費到底怎麼算？」配上解答截圖）',
        '在文末放網站連結，讓讀者自然點進來——這是目標受眾最集中的地方',
      ]),
      ...numbered([
        [bold('找 3～5 位認識的公務員同事或朋友試用：')],
      ]),
      ...subbullet([
        '讓他們用，蒐集反饋，不需要付費',
        '他們的使用反饋（即使是批評）比任何市場分析都有價值',
        '若反饋正面，詢問他們是否願意推薦給同機關其他同仁',
      ]),
      ...numbered([
        [bold('在政府機關 LINE 群組（如各機關人事/會計群組）分享：')],
      ]),
      ...subbullet([
        '不以「我在賣東西」的方式出現，而是以「我整理了一個大家都需要的工具」的姿態',
        '若你不在這類群組，可請試用的朋友代為分享',
      ]),
      spacer(),
      h3('3.2.2　建立 Email 訂閱名單（免費，但是最重要的資產）'),
      p('在網站加入「有新功能時通知我」的 Email 訂閱功能。這個名單未來是你最重要的商業資產之一。'),
      spacer(),
      ...bullet([
        [bold('推薦工具（免費方案）：'), normal('Google Forms（最簡單）或 Mailchimp Free Plan（每月 500 封免費）')],
        [bold('加入位置：'), normal('在網站 landing 頁面加一個「訂閱更新通知」輸入框，說明「完全免費，有新法規更新或新功能時通知」')],
        [bold('目標：'), normal('累積 50～100 個主動訂閱的 Email，這就是你的第一批潛在付費客戶')],
        [bold('重要：'), normal('不要在這個階段要求付費，只是建立名單')],
      ]),
      spacer(),
      h2('3.3　第二階段：試商業化（6～18 個月）'),
      p([bold('核心目標：'), normal('完成第一筆收入。哪怕只有 NT$ 1,000，心理意義遠大於金額本身。')]),
      spacer(),
      h3('3.3.1　確認「可以開始談錢」的前提條件'),
      ...numbered([
        '你的 Email 訂閱名單至少 50 人（代表有真實需求）',
        '你已收到至少 10 條具體的「這個工具幫我解決了 XX 問題」的正面反饋',
        '你能清楚說出「付費版比免費版多給什麼」',
      ]),
      spacer(),
      p([bold('付費版可以提供的差異化（不需要技術開發，只需要授權差異化）：')]),
      ...bullet([
        [bold('下載功能：'), normal('提供情境卡的 PDF 報表（可列印版），免費版只能看網頁')],
        [bold('公文引用格式：'), normal('付費版自動產生正式引用字串（如「依行政院主計總處 X 函釋 Q1...」），方便直接貼入公文')],
        [bold('更新通知：'), normal('法規更新時主動 Email 通知付費用戶，免費版不通知')],
        [bold('優先支援：'), normal('付費用戶的問題回報在 48 小時內回應，免費版視情況')],
      ]),
      spacer(),
      h3('3.3.2　取得第一筆商業合約的方法'),
      ...numbered([
        [bold('不要冷電話給陌生機關：'), normal('這是最沒效率的方法，政府機關不會因為陌生電話而付費')],
        [bold('透過你認識的人介紹：'), normal('正職工作中認識的同事、主管、合作廠商，已建立信任的人才是第一批客戶來源')],
        [bold('讓 Email 訂閱者成為付費者：'), normal('發送「我們在考慮推出機關訂閱版，您願意參與早鳥測試嗎？」的信，不是銷售，是邀請合作')],
        [bold('從一個「典型案例」開始：'), normal('找一個願意的機關（哪怕免費試用半年），取得使用成果後才能讓其他機關看到效果')],
      ]),
      spacer(),
      h3('3.3.3　收費機制建立（零費用方案）'),
      p('政府機關採購有嚴格流程，你需要「讓機關可以用現有採購流程付錢給你」的方式：'),
      spacer(),
      table2([
        ['方式', '說明與注意事項', true],
        ['統一發票（辦稅籍登記，費用幾乎為零）', '最正式，政府機關最接受。帶身分證去國稅局辦理稅籍登記，約半天可完成。強烈建議在第一筆訂單前完成。'],
        ['顧問費或講師費名義', '若你有一定知名度，機關可用「邀請講座」「顧問費」名義付費，比「軟體訂閱費」更容易走採購流程。適合作為初期切入點。'],
        ['Line Pay / 街口 / 銀行轉帳', '適合個人或小型機構，但政府機關通常無法用此方式核帳，僅供個人用戶使用'],
      ], 3000, 5500),
      spacer(),
      h2('3.4　正職期間的時間管理策略'),
      p([bold('每週可投入商轉的時間假設：'), normal('工作日每天 30 分鐘，週末 2 小時，合計每週約 4.5 小時。')]),
      spacer(),
      table3([
        ['時間塊', '建議投入方向', '預期產出', true],
        ['工作日早晨 15 分鐘', '閱讀使用者反饋、法規更新資訊', '掌握需求，維持內容時效性'],
        ['工作日晚間 15 分鐘', '社群貼文準備、Email 草稿', '保持品牌可見度'],
        ['週六上午 1 小時', '實際內容更新（新法規、新情境卡）', '每月新增 2～4 張情境卡'],
        ['週日下午 1 小時', '商業開發（聯絡潛在客戶、準備提案）', '每月進行 1～2 次潛在合作接觸'],
      ], 2800, 3500, 2200),
      spacer(),
      p([bold('重要心態：'), normal('正職收入是你最重要的風險保護。在商轉收入超過正職薪資的 50% 之前，「不讓商轉佔用太多精力而影響正職」是最重要的原則。商轉失敗可以重來，正職受影響才是真正的風險。')]),
      pageBreak(),

      // ══ 第四章 ════════════════════════════
      h1('第四章　權利保護'),
      h2('4.1　現有保護措施盤點'),
      p([bold('已建立（不需要再做）：')]),
      ...bullet([
        [bold('robots.txt：'), normal('封鎖 22 個 AI 爬蟲（GPTBot、ClaudeBot、CCBot 等），防止大型 AI 公司直接抓取整理成果作為訓練資料')],
        [bold('Cloudflare Workers KV：'), normal('核心資料不放在公開 GitHub，需透過 Origin 驗證才能取得')],
        [bold('CC BY-NC-ND 4.0：'), normal('法律層面明確宣告禁止商業使用和改作')],
        [bold('terms.md §5：'), normal('使用條款明確列出禁止事項（複製資料庫、建競爭性服務、AI 訓練）')],
        [bold('程式碼 All Rights Reserved：'), normal('前端程式碼不開放任何授權')],
      ]),
      spacer(),
      p([bold('尚未建立（本章重點）：')]),
      ...bullet([
        '內容指紋（識別抄襲）',
        '侵權監控機制',
        '侵權發現後的標準處理流程',
        'AI 爬蟲保護強化',
      ]),
      spacer(),
      h2('4.2　內容指紋策略（讓你能在法庭上證明這是你的）'),
      h3('4.2.1　文字水印'),
      p('在你的整理摘要中，嵌入一些「只有你知道是刻意放的」細節，但不影響內容實用性：'),
      ...bullet([
        [bold('具體做法：'), normal('在每個母題的第一篇摘要中，加一個看起來很正常但略不尋常的句子，例如「本條文為國內旅費報支體系的總則依據，各細則條文由此延伸」——這句話你知道是你特意的措辭')],
        [bold('記錄：'), normal('在私人文件中記錄「我在哪篇加了什麼水印，日期是 YYYY-MM-DD」')],
        [bold('效果：'), normal('如果有人複製你的整理後去賣，出現你的水印語句就是直接證據')],
      ]),
      spacer(),
      h3('4.2.2　著作權存證（免費方法）'),
      p('在臺灣，著作權在創作完成時自動成立，不需要登記。但要在法律上主張，需要能證明「某個時間點這份內容是你創作的」：'),
      ...bullet([
        [bold('Email 自發：'), normal('把當天重要版本的內容截圖，Email 給自己（不要改日期），這個 Email 的時間戳就是日後的日期證明')],
        [bold('Git commit 紀錄：'), normal('你的 GitHub commit history 本身就是時間戳紀錄，保持有意義的 commit 訊息')],
        [bold('Google Drive 版本紀錄：'), normal('如果把重要文件放在 Google Drive，它會自動記錄每個版本的修改時間')],
        [bold('法院公證（較重要資料才做，費用約 3,000～8,000 元）：'), normal('若日後發生大規模侵權糾紛，可申請律師公證特定版本的著作權')],
      ]),
      spacer(),
      h2('4.3　侵權監控機制（免費工具）'),
      p('你不可能每天手動搜尋是否有人抄你的內容，以下是自動化監控方法：'),
      spacer(),
      ...numbered([
        [bold('Google Alerts（最重要，完全免費）：')],
      ]),
      ...subbullet([
        '進入 alerts.google.com，設定你的獨特短語作為監控關鍵字（如「核銷這樣做」、「政府支出法規知識庫」、你的網站 URL）',
        '設定頻率為「每天」，Google 會在有新頁面出現這些關鍵字時 Email 通知你',
        '每月花 5 分鐘看通知就夠，不需要主動搜尋',
      ]),
      ...numbered([
        [bold('Copyscape 文字比對（免費版每月 10 次）：')],
      ]),
      ...subbullet([
        '去 copyscape.com，輸入你的網站 URL，可以找到網路上的類似內容',
        '發現類似頁面時，截圖存證，評估是否真的是抄襲',
        '免費版每月 10 次足夠用',
      ]),
      ...numbered([
        [bold('GitHub 搜尋你的 repo：')],
      ]),
      ...subbullet([
        '在 GitHub 搜尋你的 repo 名稱或獨特程式碼片段，看是否有人 fork 後再商業化',
        '每季一次，5 分鐘搞定',
      ]),
      spacer(),
      h2('4.4　發現侵權的標準處理流程'),
      p([bold('重要原則：'), normal('不要立刻發怒或公開指責，先評估情況，依序採取最低成本的行動。')]),
      spacer(),
      ...numbered([
        [bold('Step 1：截圖存證（發現後立刻做）')],
      ]),
      ...subbullet([
        '用瀏覽器截取侵權頁面的完整截圖（包含 URL 和日期）',
        '儲存到私人雲端資料夾，檔名加日期（例：2026-05-03_侵權截圖_XX網站.png）',
        '不要先聯絡對方，先蒐集完整證據',
      ]),
      ...numbered([
        [bold('Step 2：評估侵權程度')],
      ]),
      ...subbullet([
        '情節輕微（非商業、個人轉貼但有標出處）：可接受，只需要觀察',
        '情節中等（商業使用或未標出處）：發送下架通知',
        '情節嚴重（整批複製建立競爭網站）：考慮法律行動',
      ]),
      ...numbered([
        [bold('Step 3：發送和善版下架通知（情節中等時）')],
      ]),
      ...subbullet([
        '以 Email 或平台私訊，語氣保持禮貌但明確',
        '範本：「您好，本人為政府支出法規知識庫作者 NtN。您在 [頁面 URL] 使用的內容係本人整理成果，依 CC BY-NC-ND 4.0 授權禁止商業使用及未標示出處之轉載。請於 7 日內下架或取得授權，否則將考慮依法追究。」',
        '保留這封 Email 的寄出紀錄',
      ]),
      ...numbered([
        [bold('Step 4：DMCA 下架申訴（對方不回應時）')],
      ]),
      ...subbullet([
        '如果侵權頁面在 Google 搜尋出現，可向 Google 提交 DMCA 取下申請（免費）',
        '如果在 GitHub 上，向 GitHub 提交 DMCA（免費）',
        '填寫時需要說明你的著作、侵權 URL、你的聯絡資料，約 5 分鐘可完成',
        '這不是打官司，是透過平台機制下架，效果通常很快',
      ]),
      ...numbered([
        [bold('Step 5：法律諮詢（情節嚴重時）')],
      ]),
      ...subbullet([
        '可到各地方法院附設的「律師免費諮詢」（每次 30 分鐘），評估是否值得起訴',
        '著作權侵害可請求損害賠償（實際損失或法定賠償 NT$ 1 萬至 100 萬）',
        '除非損失明確且金額夠大，否則訴訟成本不划算，DMCA 通常就夠了',
      ]),
      spacer(),
      h2('4.5　對 AI 爬蟲的保護強化'),
      ...bullet([
        [bold('已做（繼續保持）：'), normal('robots.txt 封鎖 22 個爬蟲；核心資料放在 CF KV，不在公開 HTML 中直接渲染')],
        [bold('建議新增：'), normal('在 terms.md 明確寫入「本網站禁止任何 AI 訓練資料的蒐集」，雖然效力有限，但建立法律基準')],
        [bold('最有效的保護：'), normal('維持 CF KV 保護架構，讓核心資料不在靜態 HTML 頁面直接呈現，即使被爬也爬不到結構化資料，這是目前最強的技術保護')],
      ]),
      pageBreak(),

      // ══ 第五章 ════════════════════════════
      h1('第五章　網站建置與維護'),
      h2('5.1　現有技術架構（完整全覽）'),
      p('你目前的技術架構在「免費、穩定、可由非技術背景維護」三個目標上已經做到了很高的水準：'),
      spacer(),
      table3([
        ['元件', '服務/工具', '月費用', true],
        ['前端網頁 hosting', 'GitHub Pages', 'NT$ 0（永久免費）'],
        ['核心資料保護 API', 'Cloudflare Workers + KV', 'NT$ 0（免費方案，每天 100K 請求限制）'],
        ['流量統計', 'Cloudflare Web Analytics', 'NT$ 0（無 cookie、無 PII）'],
        ['網域（目前）', 'ntnick-web.github.io（GitHub 預設）', 'NT$ 0'],
        ['版本控制 / CI', 'GitHub + GitHub Actions', 'NT$ 0（公開 repo 免費）'],
        ['AI 編碼工具', 'Claude Code', '視訂閱方案'],
        ['目前每月固定費用合計', '', 'NT$ 0（或僅 Claude Code 費用）'],
      ], 3000, 3000, 2500),
      spacer(),
      h2('5.2　日常維護工作清單'),
      h3('5.2.1　每週例行（約 30 分鐘）'),
      ...bullet([
        '查看 Cloudflare 儀表板：確認 Workers 是否正常，KV 讀取是否有異常',
        '查看 Google Alerts 通知：有無侵權或異常引用',
        '閱讀並回覆 Google Form 的問題回報（目前唯一的使用者回饋管道）',
      ]),
      spacer(),
      h3('5.2.2　每月例行（約 2 小時）'),
      ...bullet([
        [bold('法規更新確認：'), normal('至主計總處網站確認是否有新發布的解釋函令或修訂要點')],
        [bold('新增情境卡 1～3 張：'), normal('根據使用者反饋或法規更新，可用 Claude Code 輔助')],
        [bold('內容校對抽查：'), normal('隨機抽 5 張卡片核對摘要是否仍準確')],
        [bold('備份確認：'), normal('確認 GitHub 上的最新 commit 存在（這就是你的主要備份）')],
      ]),
      spacer(),
      h3('5.2.3　每季例行（約 4 小時）'),
      ...bullet([
        [bold('全面功能測試：'), normal('用手機和電腦各打開一次，測試搜尋、情境問答、試算是否正常')],
        [bold('Copyscape 文字比對：'), normal('上傳幾個頁面確認無大規模抄襲')],
        [bold('外部連結有效性：'), normal('確認法規原始出處連結是否仍有效（主計總處網站偶爾改版）')],
        [bold('about.md / terms.md 更新：'), normal('確認網站描述的節點數、功能描述仍然準確')],
        [bold('用量評估：'), normal('確認 CF Workers 用量未超出免費額度，GitHub Actions 分鐘數無異常')],
      ]),
      spacer(),
      h2('5.3　自訂網域（建議在有第一個付費客戶後才做）'),
      p([bold('現況：'), normal('你目前使用 ntnick-web.github.io，這個網址是免費的，但看起來較不正式。')]),
      spacer(),
      p([bold('建議時機：'), normal('在你確定有第一個付費客戶要付費之前，先不換網域以節省費用。一旦有付費收入，立刻換——自訂網域會大幅提升政府機關對你的信任感。')]),
      spacer(),
      table2([
        ['方案', '說明', true],
        ['購買 .com.tw 網域', '年費約 NT$ 300～600。.com.tw 需有公司或商業登記（行號即可）。建議 .com.tw 以提升機關信任感。推薦 Gandi、DNSPark 或 GoDaddy。'],
        ['搭配 Cloudflare 免費 SSL', 'CF 已提供免費 HTTPS 憑證，換網域後在 CF 設定即可，無額外費用。'],
        ['GitHub Pages 自訂網域設定', '在 GitHub Pages 設定中填入你的網域，5 分鐘完成，不需技術背景。'],
      ], 3000, 5500),
      spacer(),
      h2('5.4　讓 Claude Code 成為你的技術支援'),
      h3('5.4.1　標準提問格式'),
      p([bold('不好的問法：'), normal('「網站壞了怎麼辦？」')]),
      p([bold('好的問法：'), normal('「在 04_web/static/js/02_data.js 第 XX 行，出現了 XX 錯誤訊息（貼上 Console 錯誤），我需要怎麼修改？」')]),
      spacer(),
      ...bullet([
        '提問時永遠附上：問題出現在哪個檔案、哪個操作、出現什麼症狀',
        '如果有 Console 錯誤訊息，直接貼上，不要描述（描述永遠比原文不準確）',
        '先說你想要達到什麼目標，再說遇到什麼問題',
      ]),
      spacer(),
      h3('5.4.2　定期維護 Session 範本'),
      p('建議每月安排一次「維護 Session」，讓 Claude Code 幫你做系統性檢查：'),
      ...bullet([
        '「請幫我檢查 04_web/index.html 中是否有任何可能影響行動版使用者的佈局問題，並列出建議修正清單」',
        '「請幫我確認所有情境卡的 flow 節點是否有 conclusion，並列出缺少 conclusion 的卡片 ID」',
        '「請幫我掃描 02_markdown/ 內有無 summary_pending: true 的條目，並列出需要補充摘要的卡片」',
      ]),
      spacer(),
      h2('5.5　備份與災難恢復策略'),
      p([bold('最大風險：'), normal('GitHub 帳號被駭或誤刪 repo，造成網站內容遺失。')]),
      spacer(),
      ...numbered([
        [bold('方案一（免費，強烈建議）：OneDrive 完整本機副本')],
      ]),
      ...subbullet([
        '你目前已把專案放在 OneDrive 桌面，這本身就是一個雲端備份',
        'OneDrive 會自動同步，每次保存都是一個版本快照',
        '確保 OneDrive 自動備份功能已開啟即可',
      ]),
      ...numbered([
        [bold('方案二（免費，建議）：GitLab Mirror 作為第二備份')],
      ]),
      ...subbullet([
        '在 GitLab 建立一個 Mirror（鏡像），設定後自動同步',
        '即使 GitHub 出問題，GitLab 仍有完整備份',
      ]),
      ...numbered([
        [bold('方案三：CF KV 資料定期匯出')],
      ]),
      ...subbullet([
        'nodes.json 和 scenarios_manual.json 是最重要的資料，目前只在 CF KV 裡',
        '建議每次更新後，在本機和 OneDrive 各保留一份最新備份',
        '每次 build 後手動把這兩個檔案複製到 OneDrive 的「KV 備份」資料夾',
      ]),
      spacer(),
      h2('5.6　降低維護負擔的工具（均免費）'),
      table2([
        ['工具/做法', '用途與好處', true],
        ['GitHub Actions（已設定）', '每次 push 自動驗證和建置，避免手動錯誤。維持現有設定即可。'],
        ['Cloudflare Web Analytics（已設定）', '每週 5 分鐘看數據，了解哪些頁面最多人用、從哪裡來的訪客。'],
        ['Google Alerts（建議新增）', '被動監控抄襲和品牌提及，設定一次，持續有效。'],
        ['Google Docs 維護日誌', '記錄每次做了什麼、發現了什麼問題，這對追蹤進度非常有用。'],
        ['瀏覽器書籤整理', '把常用管理頁面（CF 儀表板、GitHub repo、Google Form）加入書籤資料夾，節省找頁面的時間。'],
      ], 3000, 5500),
      pageBreak(),

      // ══ 第六章 ════════════════════════════
      h1('第六章　費用控制與財務規劃'),
      h2('6.1　第一筆收入前：零費用策略'),
      table3([
        ['項目', '建議', '時機', true],
        ['自訂網域（.com.tw）', '延後', '等第一個付費客戶確認後立刻買，年費 NT$ 500'],
        ['律師費（合約草擬）', '延後', '等有具體商業洽談時才做，或先用 AI 草擬'],
        ['稅籍登記（行號）', '建議現在就做', '費用幾乎為零，只是去國稅局一趟，帶身分證'],
        ['會計服務', '延後', '年收入超過 NT$ 10 萬後才需要'],
        ['額外 Cloudflare 方案', '暫不需要', '目前免費方案的 KV 讀寫量遠低於上限'],
        ['行銷廣告投放', '暫不建議', '政府機關客戶不靠廣告，靠口碑和信任'],
      ], 3000, 2800, 2700),
      spacer(),
      h2('6.2　第一筆收入後的資金配置建議'),
      p('假設第一筆機關授權費為 NT$ 5,000：'),
      ...bullet([
        [bold('50%（NT$ 2,500）：立刻買自訂網域，'), normal('這是提升機關信任感的最高 CP 值投資，一次買 2 年')],
        [bold('30%（NT$ 1,500）：存入「商轉準備金」，'), normal('用於日後可能需要的律師費或其他一次性行政費用')],
        [bold('20%（NT$ 1,000）：個人收入，'), normal('對自己的時間投入給予回報，心理上確認「商轉有意義」')],
      ]),
      spacer(),
      h2('6.3　損益平衡點估算'),
      table2([
        ['科目', '數字（估計）', true],
        ['目標月收入（覺得有意義的金額）', 'NT$ 3,000～5,000（相當於每月一個週末的兼職薪資）'],
        ['達到此收入所需付費客戶數', '5 個機關 × NT$ 8,000/年 ÷ 12 ≈ NT$ 3,333/月'],
        ['每月時間投入估計', '16～20 小時（含維護、客服、新增內容）'],
        ['相當於時薪', 'NT$ 3,333 ÷ 18 小時 ≈ NT$ 185/小時（已超過最低薪資）'],
        ['損益平衡時間點估計', '第一個付費客戶出現後 12～18 個月達到 5 個以上'],
      ], 4000, 4500),
      spacer(),
      p([bold('結論：'), normal('在「不離職、最小化投入」的前提下，每月 NT$ 3,000 的副業收入是合理可達成的目標，時間軸約 2～3 年。這不是快速致富，但是穩健且可持續的路徑。')]),
      pageBreak(),

      // ══ 第七章 ════════════════════════════
      h1('第七章　90 天行動計畫'),
      h2('7.1　優先順序矩陣'),
      table3([
        ['行動項目', '重要性', '緊急性', true],
        ['辦理稅籍登記（行號）', '高', '高（做了才能正式收費）'],
        ['設定 Google Alerts 監控', '高', '高（做一次，持續有效）'],
        ['GitHub 帳號開啟兩步驟驗證', '高', '高（防災準備）'],
        ['OneDrive 備份確認', '高', '高（防災準備）'],
        ['在公務員社群分享介紹文', '高', '中（越早開始曝光越好）'],
        ['建立 Email 訂閱功能', '高', '中（越早開始累積名單越好）'],
        ['起草基礎授權合約範本', '高', '中（有洽商機會時才需要）'],
        ['建立維護日誌習慣', '中', '低（好習慣，但不緊迫）'],
        ['自訂網域', '中', '低（等第一個付費客戶才做）'],
        ['CF Workers D1 事件追蹤啟用', '低', '低（有更多用戶後再做）'],
      ], 4500, 1700, 2300),
      spacer(),
      h2('7.2　90 天具體行動表'),
      table2([
        ['時間', '行動', true],
        ['第 1 週', [bold('【必做】'), normal('設定 Google Alerts（30 分鐘）；GitHub / Cloudflare 開啟兩步驟驗證（20 分鐘）')]],
        ['第 1～2 週', '草擬一篇「國內外旅費報支完整指南」文章，準備在公務員社群分享'],
        ['第 2 週', [bold('【建議】'), normal('去附近的國稅局辦理稅籍登記（行號），帶身分證即可，約半天')]],
        ['第 2～3 週', '在 Google Form 問題回報中增加「您希望新增什麼功能」的開放式問題'],
        ['第 3 週', '在網站 landing 頁面加入 Email 訂閱功能（Google Forms 最快）'],
        ['第 4 週', '發布第一篇社群分享文章，觀察反應，記錄哪些地方收到最多詢問'],
        ['第 30～45 天', '蒐集前 30 天使用反饋，整理成清單，決定下一步優先新增的內容'],
        ['第 45～60 天', '用 Claude Code 起草基礎授權合約範本（1～2 小時），存入私人文件'],
        ['第 60 天', '複盤：是否有人主動詢問商業合作？Email 訂閱人數達到多少？'],
        ['第 60～75 天', '如有訂閱者，發送第一封「產品更新」Email，詢問是否有機關合作意向'],
        ['第 75～90 天', '根據反饋確定「付費版差異化功能」，準備下一階段商業化測試'],
      ], 2500, 6000),
      spacer(),
      h2('7.3　90 天後的評估標準'),
      p('不要無止境地投入時間在一個未被驗證的商業模式。以下是 90 天後的評估標準：'),
      spacer(),
      table2([
        ['指標', '判斷基準', true],
        ['Email 訂閱人數', '達到 30 人以上：繼續。未達 15 人：重新評估曝光管道'],
        ['網站月活躍用戶（UV）', '超過 100 人/月：有潛力。低於 50 人：曝光策略需調整'],
        ['主動詢問合作的次數', '90 天內有 1 次以上主動詢問：繼續。完全沒有：需要更主動的市場接觸'],
        ['自己的感受', '維護工作是否讓你覺得有意義？如果每次都像在做苦差，需要重新評估定位'],
      ], 3000, 5500),
      pageBreak(),

      // ══ 附錄 ════════════════════════════
      h1('附錄一　商業化前必做事項速查表'),
      spacer(),
      table3([
        ['項目', '預估時間', '難度', true],
        ['設定 Google Alerts 關鍵字監控', '30 分鐘', '低'],
        ['GitHub / Cloudflare 帳號開啟兩步驟驗證', '20 分鐘', '低'],
        ['確認 OneDrive 自動備份已開啟', '10 分鐘', '低'],
        ['在問題回報表單加入「功能建議」問題', '20 分鐘', '低'],
        ['在 landing 頁面加入 Email 訂閱功能', '1 小時（用 Google Forms）', '低'],
        ['辦理稅籍登記（行號）', '半天（去國稅局，帶身分證）', '中'],
        ['撰寫第一篇社群介紹文章', '2～3 小時', '中'],
        ['起草基礎授權合約範本（用 Claude 輔助）', '1～2 小時', '中'],
        ['購買自訂網域（等第一個付費客戶後）', '30 分鐘', '低'],
        ['CF Workers D1 事件追蹤啟用（有用量後）', '3～4 小時（有詳細 SOP）', '高'],
      ], 4800, 2500, 1200),
      spacer(),
      h1('附錄二　常見問題 Q&A'),
      spacer(),
      p([bold('Q1：我需要公司才能收費嗎？')]),
      p([bold('A：'), normal('不需要。個人只需辦理稅籍登記取得統一編號，就可以開立「收據」。若機關需要統一發票，則需另辦加入統一發票系統（需要固定年費），初期先確認是否必要。')]),
      spacer(),
      p([bold('Q2：政府機關可以用「訂閱 SaaS」的科目付費嗎？')]),
      p([bold('A：'), normal('可以，但要看各機關科目彈性。更保險的做法是把你的服務定位為「資料庫訂閱費」或「授權使用費」，這兩個名目在政府機關更容易走採購流程。')]),
      spacer(),
      p([bold('Q3：如果對方說「法規是公開資訊，為什麼要付費？」怎麼回應？')]),
      p([bold('A：'), normal('「法規原文是公開的，但整理、連結、分類、提供情境問答和試算的工作是我花了大量時間做的。您付費使用的是這份整理工作的成果，以及未來持續更新維護的服務，而不是法規本身。」這個邏輯和購買法源資料庫 Pro 版相同。')]),
      spacer(),
      p([bold('Q4：萬一有機關問我「有沒有 ISO 認證或政府採購資格」怎麼辦？')]),
      p([bold('A：'), normal('初期的客戶應該是「已建立信任的熟識管道」，不是冷門的陌生機關招標。對於有嚴格資格要求的機關，誠實說明你目前的規模（獨立開發者）。強行進入有嚴格資格審查的採購流程，不是目前的目標市場。')]),
      spacer(),
      p([bold('Q5：我擔心有人說「你的資料有錯」然後要求賠償，怎麼辦？')]),
      p([bold('A：'), normal('terms.md §3 已有免責聲明：「本工具僅供查詢輔助，正式引用以主管機關版本為準，維護者不負法律或財務責任。」只要免責聲明夠清楚且使用者使用前有機會看到，法律責任風險極低。你是「整理者」而非「法律服務提供者」，這是關鍵。')]),
      spacer(),
      p([bold('Q6：如果我想找人一起做，應該怎麼處理著作權？')]),
      p([bold('A：'), normal('在找任何合作夥伴之前，必須先以書面確認著作權歸屬（由你持有）、合作夥伴的貢獻以「工作報酬」或「授權費分潤」計算，而不是「共同著作」。共同著作在臺灣法律下意味著需要共同同意才能授權，會大幅增加未來的法律複雜度。')]),
      spacer(),
      h1('附錄三　重要資源連結'),
      spacer(),
      table2([
        ['資源', '用途', true],
        ['Google Alerts（alerts.google.com）', '免費品牌和抄襲監控，設定一次長期有效'],
        ['Copyscape（copyscape.com）', '文字抄襲比對，免費版每月 10 次'],
        ['DMCA 申請（dmca.com）', '向平台申請下架侵權內容，免費'],
        ['Cloudflare Dashboard（dash.cloudflare.com）', 'CF Workers 和 KV 管理'],
        ['GitHub Settings > Security（開啟 2FA）', '帳號安全防護'],
        ['Creative Commons 臺灣（creativecommons.tw）', 'CC 授權中文說明和臺灣版資源'],
        ['財政部稅籍登記說明', '辦理行號稅籍（去最近的國稅局分局即可）'],
        ['Mailchimp（mailchimp.com）免費方案', 'Email 訂閱名單管理，每月 500 封免費'],
        ['Google Forms（forms.google.com）', '最簡單的 Email 訂閱功能建置方式'],
        ['各地方法院律師免費諮詢', '著作權侵害事件的第一線法律諮詢，每次 30 分鐘免費'],
      ], 3500, 5000),
      spacer(), spacer(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 8 } },
        children: [new TextRun({ text: '本報告依據 2026 年 5 月實際情況撰寫，建議定期複盤並依現況調整。', size: 18, color: C_GRAY, font: '標楷體' })]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUTPUT, buf);
  console.log('DONE:', OUTPUT);
}).catch(e => { console.error(e); process.exit(1); });

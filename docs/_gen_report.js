const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat
} = require('docx');
const fs = require('fs');

const OUTPUT = 'C:\\Users\\user\\OneDrive\\桌面\\支出規定視覺化資料庫\\docs\\全面盤點調整優化報告_2026-05-03.docx';

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const CELL_MARGINS = { top: 80, bottom: 80, left: 120, right: 120 };
const TBL_W = 8500;
const COL1 = 5500, COL2 = 3000;
const H_FILL = 'E8EAF6'; // 淡紫色表頭

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, bold: true })] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, bold: true })] });
}
function p(runs) {
  if (typeof runs === 'string') return new Paragraph({ children: [new TextRun(runs)] });
  return new Paragraph({ children: runs });
}
function bold(text) { return new TextRun({ text, bold: true }); }
function normal(text) { return new TextRun(text); }
function bullet(items) {
  return items.map(item => new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    children: typeof item === 'string' ? [new TextRun(item)] : item
  }));
}
function numbered(items) {
  return items.map(item => new Paragraph({
    numbering: { reference: 'numbers', level: 0 },
    children: typeof item === 'string' ? [new TextRun(item)] : item
  }));
}
function sub(items) {
  return items.map(item => new Paragraph({
    numbering: { reference: 'sub-bullets', level: 0 },
    children: typeof item === 'string' ? [new TextRun(item)] : item
  }));
}
function spacer() { return new Paragraph({ children: [] }); }
function hr() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '9C27B0', space: 1 } },
    children: []
  });
}

function tableRow(col1, col2, isHeader = false) {
  const fill = isHeader ? H_FILL : 'FFFFFF';
  return new TableRow({
    children: [
      new TableCell({
        borders: BORDERS, width: { size: COL1, type: WidthType.DXA },
        shading: { fill, type: ShadingType.CLEAR }, margins: CELL_MARGINS,
        children: [new Paragraph({ children: [isHeader ? bold(col1) : new TextRun(col1)] })]
      }),
      new TableCell({
        borders: BORDERS, width: { size: COL2, type: WidthType.DXA },
        shading: { fill, type: ShadingType.CLEAR }, margins: CELL_MARGINS,
        children: [new Paragraph({ children: [isHeader ? bold(col2) : new TextRun(col2)] })]
      })
    ]
  });
}

const doc = new Document({
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•',
          alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: 'sub-bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '–',
          alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 360 } } } }] },
      { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.',
          alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, color: '4A148C' },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '7B1FA2', space: 4 } } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, color: '311B92' },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1440, right: 1300, bottom: 1440, left: 1300 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 4 } },
          children: [new TextRun({ text: '政府支出法規知識庫 全面盤點調整優化報告', size: 16, color: '888888' })]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 4 } },
          children: [
            new TextRun({ text: '第 ', size: 18, color: '888888' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '888888' }),
            new TextRun({ text: ' 頁', size: 18, color: '888888' }),
          ]
        })]
      })
    },
    children: [
      // ─── 封面 ───
      spacer(), spacer(), spacer(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '政府支出法規知識庫', size: 52, bold: true, color: '4A148C' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '全面盤點調整優化報告', size: 44, bold: true, color: '4A148C' })]
      }),
      spacer(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '網站功能・資料流程・授權管理・商轉建議', size: 24, color: '666666' })]
      }),
      spacer(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '2026 年 5 月 3 日　v1.0', size: 22, color: '888888' })]
      }),
      spacer(), spacer(),
      hr(),
      spacer(),

      // ─── 執行摘要 ───
      h1('執行摘要'),
      p('本報告針對「政府支出法規知識庫（核銷這樣做!!!）」進行全面性盤點，涵蓋網站各頁面功能完整性、使用者體驗評估、資料保護架構、法律文件一致性、資料流程優化建議，以及以機關學校為授權對象之商轉設計建議。'),
      spacer(),
      p([bold('本次盤點發現 6 項高優先度問題：')]),
      ...bullet([
        [bold('P0：'), normal('Footer 授權聲明與 LICENSE.md 不一致（已修正）')],
        [bold('P0：'), normal('README.md 授權聲明過舊（已修正）')],
        [bold('P0：'), normal('about.md 功能描述與現況不符（已修正）')],
        [bold('P1：'), normal('試算表 switchView 邊緣案例（已修正）')],
        [bold('P1：'), normal('事件追蹤系統未啟用，缺乏使用數據（待辦）')],
        [bold('P1：'), normal('缺乏機關學校授權管理機制（商轉前必要）')],
      ]),
      spacer(),
      p([normal('建議採「'), bold('機關學校年費授權 + 客製服務加值'), normal('」雙軌模式推進商轉，初期目標 50 個機關單位，中期達 200 個，年營收目標 NT$ 500 萬以上。')]),

      // ─── 第一章 ───
      new Paragraph({ children: [new PageBreak()] }),
      h1('第一章　商轉定位與目標客群'),
      h2('1.1　產品定位'),
      p([normal('本知識庫定位為「'), bold('政府支出法規數位化工具'), normal('」，將主計總處、行政院公告之旅費、支出憑證、酬勞費等法規及解釋函令，轉化為具情境引導、條文查詢、互動試算功能的靜態網頁應用，協助機關學校：')]),
      ...bullet([
        [bold('新人訓練：'), normal('透過情境視圖快速了解核銷流程與法規依據')],
        [bold('核銷疑義：'), normal('透過條件問答（Decision Tree）自助澄清常見疑問')],
        [bold('法規查詢：'), normal('直接查閱條文原文、函釋、問答集，附具體法源')],
        [bold('互動試算：'), normal('日支生活費、外交部保險費等費率即時查詢')],
      ]),
      spacer(),
      h2('1.2　目標客群分析'),
      p([bold('主要客群（直接付費）：')]),
      ...bullet([
        '機關主計室 / 會計室：負責審核、培訓新進人員，需要簡易查詢工具',
        '各單位業務承辦人：差旅費、外聘講座、採購後的核銷操作，需要情境式引導',
        '學校總務 / 研究事務組：國科會補助、教育部計畫費用核銷，需要跨母題查詢',
      ]),
      spacer(),
      p([bold('次要客群（間接受益）：')]),
      ...bullet([
        '會計師事務所 / 顧問公司：輔導公法人、政府單位財務審核',
        '訓練機構 / 政府採購師資：使用案例教材',
        '媒體 / 法規研究單位：參考引用',
      ]),
      spacer(),
      p([bold('目標規模（估算）：')]),
      ...bullet([
        '全國機關學校約 5,000+ 單位（含中央部會、地方政府、公立大學、國中小）',
        '初期鎖定 50～200 個機關單位，年費模式',
        '中期擴大至財政、審計體系相關人員（約 2 萬人以上）',
      ]),

      // ─── 第二章 ───
      new Paragraph({ children: [new PageBreak()] }),
      h1('第二章　網站功能完整性檢視'),
      h2('2.1　功能清單（現況）'),
      p('本次盤點透過瀏覽器實際操作，完整檢視 3 個主視圖及 10 項核心功能，現況如下：'),
      spacer(),
      p([bold('視圖完整性：')]),
      ...bullet([
        [bold('情境視圖（Scenarios）：'), normal('正常。73 張情境卡（含 6 個情境樹根節點），支援關鍵字搜尋（防抖 120ms）、支出類別篩選、母題篩選。情境卡顯示 caveats 紅色警示、attachments 附件清單、decision tree 條件問答（30 張有 flow）。網路請求全部 200 OK，無失敗請求。')],
        [bold('條文庫（Library）：'), normal('正常。572 筆節點（555 顯示＋5 已廢止），4 排 chip filter（母題 / 類別 / 支出類別 / 熱門標籤），每排各自獨立計數，無空集合問題。抽屜含 MD 全文渲染、rate_table 費率表、條文版本歷史 timeline、上下張導航、複製功能。')],
        [bold('試算表（Calc）：'), normal('正常。生活費試算（城市輸入→日支金額）、外交部保險費試算（天數×險種）均可正常使用。邊緣案例已修正（直接呼叫 switchView(\'calc\') 現在亦可正確渲染）。')],
        [bold('Landing 首頁：'), normal('已封存。進站直接以 Splash 畫面 → 情境視圖。')],
      ]),
      spacer(),
      p([bold('核心功能狀態：')]),
      ...bullet([
        '全文搜尋（topbar ＋ Spotlight ⌘K）：正常，bigram+trigram 倒排索引，51 組同義詞展開，0.50ms/query',
        '比較模式（最多 3 張並排）：正常，差異欄位自動黃色 highlight',
        '深色模式：正常，localStorage 記憶',
        '鍵盤捷徑（Ctrl+K, Esc, ←/→）：正常',
        '行動版 RWD（375px）：正常，底部 tabbar 3 tab，抽屜全螢幕',
        'Footer 法律連結（關於本站/使用條款/隱私聲明）：正常載入 MD 並渲染',
        'Cloudflare Web Analytics：已部署',
        [bold('事件追蹤（CF Workers ＋ D1）：'), normal('程式碼完整，但 window.EVENTS_ENDPOINT = null，目前未啟用')],
      ]),
      spacer(),
      h2('2.2　發現問題項目'),
      p([bold('P0 — 立即修正（已於本次盤點完成）：')]),
      spacer(),
      p([bold('問題一：Footer 授權聲明與 LICENSE.md 不一致')]),
      ...bullet([
        '原況：index.html footer 顯示「內容 CC BY 4.0」；實際授權已改為 CC BY-NC-ND 4.0',
        '風險：可能被援引「依網站聲明 CC BY 4.0 合法商業使用」，削弱智慧財產保護效力',
        '處置：已修正為「程式 All Rights Reserved · 內容 CC BY-NC-ND 4.0」',
      ]),
      spacer(),
      p([bold('問題二：README.md 授權聲明過舊')]),
      ...bullet([
        '原況：仍寫「MIT（程式碼）/ CC BY 4.0（整理內容）」',
        '處置：已更新為 All Rights Reserved / CC BY-NC-ND 4.0',
      ]),
      spacer(),
      p([bold('問題三：about.md 功能描述與現況不符')]),
      ...bullet([
        '原況：描述有「母題泡泡圖」「關聯圖」共 6 個視圖，節點數寫 520',
        '處置：已更新為 3 個視圖、555 節點、正確授權聲明',
      ]),
      spacer(),
      p([bold('P1 — 近期修正：')]),
      spacer(),
      p([bold('問題四：試算表首次渲染邊緣案例（已修正）')]),
      ...bullet([
        '原況：透過 switchView(\'calc\') 直接跳轉時，calc-grid 不渲染',
        '處置：在 switchView() 加入冪等保護，直接呼叫亦可正確渲染',
      ]),
      spacer(),
      p([bold('問題五：事件追蹤未啟用，缺乏使用數據（待辦）')]),
      ...bullet([
        '影響：無法取得使用者行為數據，難以評估付費功能優先順序、展示商轉數據',
        '建議：正式商轉前設定 window.EVENTS_ENDPOINT，建立 7 天統計看板',
      ]),
      spacer(),
      p([bold('問題六：缺乏機關學校授權管理機制（商轉前必要）')]),
      ...bullet([
        '影響：CF Workers Origin 白名單硬編碼，機關學校自訂網域無法存取 API',
        '建議：設計 License Token 機制（詳見第五章）',
      ]),
      spacer(),
      h2('2.3　使用者體驗評估'),
      p([bold('正面評價：')]),
      ...numbered([
        '情境視圖條件問答（Decision Tree）設計優秀，引導性強，適合新人訓練',
        'Ctrl+K Spotlight 全域搜尋體驗流暢，同義詞展開減少使用者輸入負擔',
        '馬卡龍 7 色設計系統整體視覺清爽，適合政府機關使用',
        '條文抽屜含法源位階（A/B/C/D）、review_level 徽章、版本歷史，專業性充足',
        'caveats 紅色警示條設計直覺，新人能快速識別禁止事項',
      ]),
      spacer(),
      p([bold('改善建議：')]),
      ...numbered([
        [bold('新手引導機制缺失：'), normal('進站直接是情境列表，對不知道要找什麼的新進人員缺少引導動線，建議加入「新手指引 tour」')],
        [bold('情境搜尋缺乏提示：'), normal('sc-q 搜尋框缺少 placeholder 範例或熱門關鍵字提示')],
        [bold('試算表說明不足：'), normal('使用者需嘗試後才知道能輸入城市名，建議補充說明文字')],
        [bold('行動版篩選 chip 過多：'), normal('375px 下 4 排 chip filter 展開後操作困難')],
        [bold('無「最近查看」紀錄：'), normal('頻繁使用者每次需重新查詢，建議 localStorage 存近 5 筆')],
        [bold('缺少明顯列印按鈕：'), normal('已有 @media print 樣式但使用者不易發現')],
      ]),

      // ─── 第三章 ───
      new Paragraph({ children: [new PageBreak()] }),
      h1('第三章　資料庫資料流程評估'),
      h2('3.1　現有資料流程'),
      p('完整的資料流程如下（由上至下）：'),
      ...numbered([
        '原始文件（00_source/ PDF/DOCX）',
        '01_extract.py → 01_extracted/ 純文字＋meta.json',
        '02_parse.py → 02_markdown/ 結構化 MD（SSOT）',
        '03_build_index.py → 03_index/nodes.json ＋ edges.json ＋ rate_lookup.json',
        '_build_scenarios_manual.py → 04_web/data/scenarios_manual.json',
        'wrangler kv key put（手動）→ CF Workers KV（核心資料，不進 GitHub）',
        'Origin 驗證 CORS → 前端 fetch API（生產環境）',
      ]),
      spacer(),
      h2('3.2　資料流程優化建議'),
      p([bold('優化一：CF KV 上傳步驟自動化（目前為手動）')]),
      ...bullet([
        '現況：每次 build 後需手動執行 3 條 wrangler kv key put 指令',
        '風險：若忘記上傳，GitHub Pages 前端與 CF KV 資料不同步，使用者看到舊資料',
        '建議：將 wrangler kv key put 整合進 GitHub Actions workflow，設定 CF_API_TOKEN 為 GitHub Secret，push to main 自動觸發',
      ]),
      spacer(),
      p([bold('優化二：scenarios source 檔案仍在 public repo')]),
      ...bullet([
        '現況：04_web/data/scenarios/domestic.json 等 source 分散檔案（共 408KB）在 public GitHub repo',
        '風險：包含完整情境設計（caveats、flow、template），屬智慧財產',
        '建議：評估是否將 scenarios/ source 資料夾移至 private repo，或加入 .gitignore 排除',
      ]),
      spacer(),
      p([bold('優化三：nodes.json 768KB 的讀取效率')]),
      ...bullet([
        '現況：每次前端初始化載入 768KB，Cache-Control: no-store 不開放快取',
        '影響：慢速網路（3G）約需 3～5 秒才能載入',
        '建議：改為版本號快取（ETag 或 ?v= 比對），版本未變則使用 localStorage 快取',
      ]),
      spacer(),
      p([bold('優化四：build 管線文件化')]),
      ...bullet([
        '現況：完整 SOP 只存於 CLAUDE.md，非技術人員難以獨立執行',
        '建議：在 docs/05_workflow.md 補充完整「發布 SOP」章節（含 wrangler kv 步驟）',
      ]),
      spacer(),
      p([bold('優化五：02_markdown 版本控制策略')]),
      ...bullet([
        '現況：02_markdown/ 直接在 main branch，重大錯誤直接影響生產環境',
        '建議：建立 content-staging 分支，重大內容更新先在 staging 驗證後再合併 main',
      ]),

      // ─── 第四章 ───
      new Paragraph({ children: [new PageBreak()] }),
      h1('第四章　法律文件與內容保護評估'),
      h2('4.1　現有保護機制清單'),
      p([bold('技術層面：')]),
      ...bullet([
        'robots.txt 封鎖 22＋個 AI 爬蟲（GPTBot、ClaudeBot、CCBot 等）',
        'CF Workers CORS Origin 驗證（限允許 Origin 才回傳核心資料）',
        'nodes.json（768KB）、scenarios_manual.json（424KB）不進 public GitHub repo',
        '上傳 Token（X-Upload-Token header）保護資料寫入端點',
        'CF Bot Fight Mode 可啟用阻擋自動化請求',
      ]),
      spacer(),
      p([bold('法律層面：')]),
      ...bullet([
        'LICENSE.md：程式碼 All Rights Reserved / 整理內容 CC BY-NC-ND 4.0（禁商業、禁改作）',
        'docs/terms.md：明文禁止爬蟲、競爭性服務、AI 訓練、鏡像複製',
        '準據法：中華民國法律，臺北地方法院管轄',
        '保護措施聲明：§6 技術保護措施 / §7 執行與救濟',
      ]),
      spacer(),
      h2('4.2　保護缺口分析'),
      p([bold('缺口一：scenarios source JSON 未保護'), normal('（見第三章優化二）')]),
      spacer(),
      p([bold('缺口二：商業使用界定不清')]),
      ...bullet([
        'terms.md 禁止「建立競爭性商業服務」，但未定義機關學校付費授權屬合法使用',
        '建議：在 terms.md 加入「授權例外條款」，說明持有有效授權序號的機關學校不受 CC BY-NC-ND 商業限制（另立授權合約）',
      ]),
      spacer(),
      p([bold('缺口三：沒有侵權監控機制')]),
      ...bullet([
        '建議：定期 Google 搜尋特徵性文字，或設定 Google Alerts 監控',
      ]),
      spacer(),
      h2('4.3　建議修正的法律文件'),
      p('以下文件修正已在本次盤點完成：'),
      ...numbered([
        'index.html footer：CC BY 4.0 → CC BY-NC-ND 4.0，MIT → All Rights Reserved',
        'README.md 授權章節：更新為 All Rights Reserved / CC BY-NC-ND 4.0',
        'docs/about.md：移除母題泡泡圖和關聯圖的介紹，更新功能說明與授權聲明',
      ]),
      spacer(),
      p([bold('待辦：'), normal('docs/terms.md §5 補充「授權例外條款」（說明付費機關授權的合法使用範疇）')]),

      // ─── 第五章 ───
      new Paragraph({ children: [new PageBreak()] }),
      h1('第五章　授權管理細節設計'),
      h2('5.1　授權模式架構'),
      p([normal('建議採用「'), bold('公開基礎版 ＋ 付費授權版'), normal('」雙層架構：')]),
      spacer(),
      p([bold('公開基礎版（現有 GitHub Pages）：')]),
      ...bullet([
        '任何人可免費瀏覽、查詢',
        '限個人非商業使用',
        '資料每季手動更新',
        '無客服支援',
      ]),
      spacer(),
      p([bold('付費授權版（機關學校 SaaS 模式）：')]),
      ...bullet([
        '機關學校付費取得授權序號（License Token）',
        '解鎖進階功能：API 存取、自動更新通知、Email 客服',
        '可選嵌入機關內網（允許特定 Origin）',
        '授權合約明確定義使用範圍',
      ]),
      spacer(),
      h2('5.2　技術授權管理系統設計'),
      p([bold('核心元件一：License Token 系統')]),
      p('建議新增 license_worker.js（Cloudflare Workers）：'),
      ...bullet([
        '授權序號格式：GEK-{機關代碼4碼}-{年份2碼}-{隨機8碼}，例：GEK-NTNU-26-A3F7B2C1',
        'Token 驗證：前端 localStorage 存 Token，fetch 時以 X-License-Token header 帶入，Worker 比對 KV 有效授權列表',
        '授權等級：Basic（查詢）/ Professional（API＋客製情境）/ Enterprise（嵌入＋白標）',
      ]),
      spacer(),
      p([bold('核心元件二：Origin 白名單動態管理')]),
      p('現有 data_worker.js 的 isAllowedOrigin() 需擴充：'),
      ...bullet([
        '新增 KV 命名空間 ALLOWED_ORIGINS，儲存 {origin: tokenId} 映射',
        '授權機關學校提供其使用 domain（如 ntnu.edu.tw），寫入 ALLOWED_ORIGINS KV',
        'Worker 路由：先查靜態白名單（localhost、GitHub Pages），再查 KV 動態白名單',
      ]),
      spacer(),
      p([bold('核心元件三：授權管理後台')]),
      p('初期以 Cloudflare D1 ＋ 簡單 HTML 管理介面：'),
      ...bullet([
        'licenses 表欄位：id, org_name, org_code, token, tier, origin_domain, issue_date, expiry_date, contact_email',
        '後台功能：新增授權 / 查看使用統計 / 停用授權 / 寄送更新通知',
        '存取保護：X-Admin-Token header 驗證',
      ]),
      spacer(),
      h2('5.3　授權合約核心條款'),
      p('每個付費機關需簽署《授權使用合約》，建議條款：'),
      ...bullet([
        [bold('授權範圍：'), normal('授權機關及其附屬單位人員，於授權期間內非商業性查詢、學習、業務使用')],
        [bold('禁止行為：'), normal('再轉售、建立衍生系統、訓練 AI、公開 API 存取')],
        [bold('更新服務：'), normal('授權期間內法規更新自動同步，主計總處新公告 7 個工作天內更新')],
        [bold('免責聲明：'), normal('本系統為查詢輔助，正式核銷以主管機關公告版本為準')],
        [bold('終止條款：'), normal('違約立即終止授權，已付費用不退還')],
        [bold('準據法：'), normal('中華民國法律，臺北地方法院管轄')],
      ]),

      // ─── 第六章 ───
      new Paragraph({ children: [new PageBreak()] }),
      h1('第六章　商轉建議'),
      h2('6.1　定價模式建議'),
      p([bold('方案 A：機關學校年費授權（主力產品）')]),
      spacer(),
      new Table({
        width: { size: TBL_W, type: WidthType.DXA },
        columnWidths: [2000, 2000, 4500],
        rows: [
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, width: { size: 2000, type: WidthType.DXA }, shading: { fill: H_FILL, type: ShadingType.CLEAR }, margins: CELL_MARGINS, children: [new Paragraph({ children: [bold('方案')] })] }),
            new TableCell({ borders: BORDERS, width: { size: 2000, type: WidthType.DXA }, shading: { fill: H_FILL, type: ShadingType.CLEAR }, margins: CELL_MARGINS, children: [new Paragraph({ children: [bold('年費')] })] }),
            new TableCell({ borders: BORDERS, width: { size: 4500, type: WidthType.DXA }, shading: { fill: H_FILL, type: ShadingType.CLEAR }, margins: CELL_MARGINS, children: [new Paragraph({ children: [bold('包含內容')] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, width: { size: 2000, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: CELL_MARGINS, children: [new Paragraph({ children: [new TextRun('Basic（小型機關）')] })] }),
            new TableCell({ borders: BORDERS, width: { size: 2000, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: CELL_MARGINS, children: [new Paragraph({ children: [new TextRun('NT$ 12,000')] })] }),
            new TableCell({ borders: BORDERS, width: { size: 4500, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: CELL_MARGINS, children: [new Paragraph({ children: [new TextRun('完整網站功能、每季法規更新通知 Email、Email 諮詢（5 天回覆）')] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, width: { size: 2000, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: CELL_MARGINS, children: [new Paragraph({ children: [new TextRun('Standard（中型機關）')] })] }),
            new TableCell({ borders: BORDERS, width: { size: 2000, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: CELL_MARGINS, children: [new Paragraph({ children: [new TextRun('NT$ 36,000')] })] }),
            new TableCell({ borders: BORDERS, width: { size: 4500, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: CELL_MARGINS, children: [new Paragraph({ children: [new TextRun('Basic 全部＋每月更新通知、3 天客服回覆、1 小時線上說明')] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, width: { size: 2000, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: CELL_MARGINS, children: [new Paragraph({ children: [new TextRun('Professional（部會/大學）')] })] }),
            new TableCell({ borders: BORDERS, width: { size: 2000, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: CELL_MARGINS, children: [new Paragraph({ children: [new TextRun('NT$ 96,000')] })] }),
            new TableCell({ borders: BORDERS, width: { size: 4500, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: CELL_MARGINS, children: [new Paragraph({ children: [new TextRun('Standard 全部＋API 存取＋客製情境卡（每年 5 張）＋電話支援')] })] }),
          ]}),
        ]
      }),
      spacer(),
      p([bold('方案 B：客製加值服務（一次性收費）')]),
      ...bullet([
        '新增法規母題：NT$ 80,000～150,000 / 母題（含資料蒐集、解析、情境設計）',
        '客製情境卡：NT$ 5,000～15,000 / 張（含 decision tree、caveats、範本）',
        '嵌入機關網站：NT$ 20,000（Origin 設定＋白標設計諮詢）',
        '教育訓練課程：NT$ 8,000 / 場（含講師費、教材，2 小時）',
        '年度法規維護：NT$ 30,000 / 年（季度審查、法規異動更新）',
      ]),
      spacer(),
      p([bold('方案 C：顧問服務（可選）')]),
      ...bullet([
        '主計室新人訓練包：NT$ 15,000 / 場（4 小時，含實作演練）',
        '法規疑義諮詢：NT$ 3,000 / 小時（e-mail 書面＋線上會議）',
      ]),
      spacer(),
      h2('6.2　銷售策略建議'),
      p([bold('階段一（0～6 個月）：種子客戶建立')]),
      ...bullet([
        '目標：5～10 個種子機關（含大學、中央機關各 2～3 個）',
        '策略：提供免費 6 個月 Standard 試用，換取使用回饋、推薦',
        '管道：直接接觸相識的主計人員、參加主計總處辦理的研習活動',
        '行動：準備機關採購用的「產品說明書」（含功能說明、定價、免責說明）',
      ]),
      spacer(),
      p([bold('階段二（6～18 個月）：規模化擴展')]),
      ...bullet([
        '目標：50 個付費機關',
        '策略：口碑行銷（機關間主計室社群口耳相傳）、主計月刊投稿介紹',
        '管道：主計總處 eBasnew 友善專區合作、地方政府主計處採購提案',
        '行動：啟動事件追蹤，收集使用數據支持商業提案',
      ]),
      spacer(),
      p([bold('階段三（18 個月以上）：穩定成長')]),
      ...bullet([
        '目標：200 個付費機關，年營收 NT$ 500 萬以上',
        '策略：建立機關學校「標竿案例」，發布功能比較白皮書',
        '管道：政府電子採購網（GWEB）刊登，爭取政府採購框架合約資格',
      ]),
      spacer(),
      h2('6.3　維運模式建議'),
      p([bold('技術維運：')]),
      ...bullet([
        '法規更新頻率：主計總處每年約 1～3 次重大修正，解釋彙編持續新增',
        '建議每月巡查主計總處法規系統、友善專區，偵測更新',
        'CF Workers / GitHub Pages 費用極低（CF Free plan 每日 10 萬次請求免費）',
      ]),
      spacer(),
      p([bold('人力規模（初期）：')]),
      ...bullet([
        '技術維護：0.2 FTE（每週約 8 小時）',
        '客服：0.1 FTE（Email 回覆，初期可兼任）',
        '業務拓展：0.3 FTE（初期）',
      ]),
      spacer(),
      h2('6.4　商轉法律準備事項'),
      ...numbered([
        [bold('公司 / 工作室設立：'), normal('個人名義收款有稅務風險，建議設立獨資商號或有限公司')],
        [bold('統一發票：'), normal('機關付費需能開立統一發票，考量申請一般稅籍')],
        [bold('政府採購法合規：'), normal('單次採購 NT$ 10,000 以上屬採購法管轄，需確認機關採購程序')],
        [bold('資料處理協議（DPA）：'), normal('若機關要求，需提供個人資料處理說明（目前本站不蒐集個資）')],
        [bold('服務等級協議（SLA）：'), normal('明訂服務可用率（建議 99% 以上）、資料更新時限、支援回覆時限')],
      ]),

      // ─── 第七章 ───
      new Paragraph({ children: [new PageBreak()] }),
      h1('第七章　近期行動計畫'),
      h2('7.1　立即執行（本週內，已完成 4 項）'),
      ...numbered([
        [bold('✅ 已完成 — '), normal('修正 footer 授權聲明（CC BY 4.0 → CC BY-NC-ND 4.0）')],
        [bold('✅ 已完成 — '), normal('更新 README.md 授權章節')],
        [bold('✅ 已完成 — '), normal('更新 docs/about.md 功能描述（移除已下線視圖）')],
        [bold('✅ 已完成 — '), normal('修正試算表 switchView(\'calc\') 邊緣案例')],
        [bold('⏳ 待辦 — '), normal('docs/terms.md 補充授權例外條款（1 小時）')],
      ]),
      spacer(),
      h2('7.2　短期計畫（1～2 個月）'),
      ...numbered([
        '啟用事件追蹤：設定 window.EVENTS_ENDPOINT，建立 7 天統計看板',
        'CF KV 上傳自動化：GitHub Actions 整合 wrangler kv key put',
        '設計 License Token 系統（CF Workers ＋ D1）',
        '準備商轉說明文件（產品 Deck、授權合約範本）',
        '完成公司 / 商號設立（配合發票需求）',
        '評估 scenarios source 檔案移至 private repo',
      ]),
      spacer(),
      h2('7.3　中期計畫（3～6 個月）'),
      ...numbered([
        '酬勞費母題完整建立（18～25 張情境卡）',
        '新手引導 tour 機制（首次進站互動引導）',
        '「最近查看」localStorage 功能',
        'nodes.json 版本快取優化',
        '機關學校授權管理後台（D1 ＋ 簡易 HTML）',
        '種子機關 5～10 個開始試用',
      ]),

      // ─── 附錄一 ───
      new Paragraph({ children: [new PageBreak()] }),
      h1('附錄一　頁面功能對照表'),
      spacer(),
      p([bold('情境視圖功能清單：')]),
      spacer(),
      new Table({
        width: { size: TBL_W, type: WidthType.DXA },
        columnWidths: [COL1, COL2],
        rows: [
          tableRow('功能項目', '狀態', true),
          tableRow('情境卡搜尋（關鍵字、防抖 120ms）', '✅ 正常'),
          tableRow('母題篩選 chip', '✅ 正常'),
          tableRow('支出類別下拉', '✅ 正常'),
          tableRow('情境卡 caveats 紅色警示', '✅ 正常'),
          tableRow('情境卡 attachments 附件清單', '✅ 正常'),
          tableRow('Decision Tree 條件問答（30 張）', '✅ 正常'),
          tableRow('情境樹根節點＋子情境 chip', '✅ 正常'),
          tableRow('scope banner 條件問答入口', '✅ 正常'),
          tableRow('scope banner 試算連動按鈕', '✅ 正常'),
          tableRow('計算範例（example，8 張已填）', '✅ 正常'),
        ]
      }),
      spacer(),
      p([bold('條文庫功能清單：')]),
      spacer(),
      new Table({
        width: { size: TBL_W, type: WidthType.DXA },
        columnWidths: [COL1, COL2],
        rows: [
          tableRow('功能項目', '狀態', true),
          tableRow('4 排 chip filter（母題/類別/支出類別/標籤）', '✅ 正常'),
          tableRow('Spotlight ⌘K 搜尋', '✅ 正常'),
          tableRow('同義詞展開（51 組 213 alias）', '✅ 正常'),
          tableRow('麵包屑導覽', '✅ 正常'),
          tableRow('並排比較模式（最多 3 張）', '✅ 正常'),
          tableRow('抽屜 MD 全文渲染', '✅ 正常'),
          tableRow('rate_table 費率表（8 張 B 類）', '✅ 正常'),
          tableRow('保險費試算 widget（B-006/007）', '✅ 正常'),
          tableRow('條文版本歷史 timeline（A-005 範例）', '✅ 正常'),
          tableRow('抽屜上下張導航（←/→）', '✅ 正常'),
          tableRow('複製條文內文', '✅ 正常'),
          tableRow('原始出處連結（99.8% 涵蓋）', '✅ 正常'),
          tableRow('已廢止節點隱藏（HIDE_OBSOLETE）', '✅ 正常'),
          tableRow('信度徽章（review_level）', '✅ 正常'),
        ]
      }),

      // ─── 附錄二 ───
      new Paragraph({ children: [new PageBreak()] }),
      h1('附錄二　本次盤點完成的程式碼變更'),
      spacer(),
      p([bold('變更一（footer 授權）')]),
      ...bullet([
        '檔案：04_web/index.html 第 212～214 行',
        '改為：程式 All Rights Reserved · 內容 CC BY-NC-ND 4.0',
      ]),
      spacer(),
      p([bold('變更二（README.md 授權）')]),
      ...bullet([
        '檔案：README.md 授權章節',
        '改為：All Rights Reserved（程式碼）/ CC BY-NC-ND 4.0（整理內容）/ 公有領域（法規原文）',
      ]),
      spacer(),
      p([bold('變更三（about.md 功能描述）')]),
      ...bullet([
        '檔案：docs/about.md',
        '移除母題泡泡圖、關聯圖描述，更新為 3 個視圖、555 節點、正確授權聲明',
      ]),
      spacer(),
      p([bold('變更四（試算表邊緣案例）')]),
      ...bullet([
        '檔案：04_web/static/js/02_data.js，switchView() 函式',
        '加入：v === \'calc\' 時若 calc-grid 為空則自動觸發 renderCalc()',
      ]),
      spacer(),
      p('所有變更已 commit（commit hash: 5c7cc0a）。'),
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(OUTPUT, buf);
  console.log('DONE: ' + OUTPUT);
}).catch(e => { console.error(e); process.exit(1); });

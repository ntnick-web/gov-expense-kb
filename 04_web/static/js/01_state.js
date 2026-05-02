// 01_state.js — auto-split from app.js (2026-05-02 #2 ESM 拆檔 Phase 2-4)
// 此檔為 plain script,共享 window scope;與 02/03/04 配合使用,載入順序固定。

/* ──────── compare state (hoisted to top to avoid TDZ in renderCards) ──────── */
let compareList = [];

/* ──────── 真實資料載入 (561 nodes / 105 scenarios from 03_index/) ──────── */
const DATA_VERSION = '2026-05-02m';  // 酬勞費母題暫時隱藏(整備中)
let DATA = [];                 // 對外用的卡片資料 (mapped from nodes.json)
let NODES_BY_ID = new Map();   // id → original node (含 file_path 等)
let INCOMING_EDGES = new Map();// id → [from1, from2, ...] 反向引用
let SCENARIOS = [];

// 母題 → 簡稱 (sidebar 用)
const PARENTS = ['國內旅費', '國外旅費', '支出憑證與結報', '酬勞費'];
// 整備中母題:chip 顯示為灰色不可點按;卡片與情境全部隱藏
const WIP_PARENTS = new Set(['酬勞費']);
// 母題 → 正式法規名稱 + 顯示用簡稱 (A 類條文卡片標題前綴)
const PARENT_LAW = {
  '國內旅費':       { full: '中央政府各機關員工國內出差旅費報支要點', short: '國內旅費要點' },
  '國外旅費':       { full: '國外出差旅費報支要點',                       short: '國外旅費要點' },
  '支出憑證與結報': { full: '政府支出憑證處理要點',                       short: '支出憑證處理要點' },
};
// 類別代碼 → art (色點 + label)
const CAT_ART = { A: 'travel', B: 'rate', C: 'fn', D: 'qa', E: 'annex' };
const CAT_LABEL = { A: '核心法規', B: '支出標準', C: '解釋函令', D: '問答集', E: '附屬資料' };

// 把節點 title 拆成 no + 主標 ("第一條 訂定目的" → no: "第一條", title: "訂定目的")
function splitTitle(rawTitle, id) {
  if (!rawTitle) return { no: id, title: id };
  // 條 / 點 / 第 N 條 / Q14 / （一）...
  const m = rawTitle.match(/^(第[一二三四五六七八九十百零0-9]+[條點]|Q\d+|附表[\d一二三四五六七八九十]*|（[一二三四五六七八九十]+）)\s*(.*)$/);
  if (m && m[2]) return { no: m[1], title: m[2] };
  return { no: '', title: rawTitle };
}

// 卡片標題組裝:A 類有「第N條」結構才加母題法規前綴(mode='short' 用簡稱、mode='full' 用完整正式名稱);
// 無條次結構者(獨立法規/支給標準如派外進修補助表)直接用 title;B 類沿用 title;C/D 類僅 title 不顯示 Q/(N) 序號
function buildCardTitle(d, mode = 'short') {
  const cat = d.id.split('-')[0];
  if (cat === 'A') {
    if (!d.no) return { prefix: '', no: '', title: d.title || '' };  // 無條次 = 獨立法規,title 已完整
    const law = PARENT_LAW[d.cat];
    const prefix = law ? (mode === 'full' ? law.full : law.short) : '';
    return { prefix, no: d.no, title: d.title || '' };
  }
  // B / C / D:不加前綴、不顯示 no(去掉 Q1 / (六) 等序號)
  return { prefix: '', no: '', title: d.title || '' };
}
function buildCardTitleText(d, mode = 'short') {
  const t = buildCardTitle(d, mode);
  return [t.prefix, t.no, t.title].filter(Boolean).join(' ');
}

let CITY_ALIASES = {};  // 未列載城市 → 國家中文主名 (city_aliases.json)
let COUNTRY_NEIGHBORS = {};  // 未列載國家 → 比照鄰國中文主名 (country_neighbors.json,2026-05-01 加)
let SYNONYMS = [];       // [{canonical, aliases:[...]}, ...] (synonyms.json)
let BASELINE_ATTACHMENTS = {};  // 情境共通標配憑證 (baseline_attachments.json) — 2026-05-01 加
let SYNONYM_INDEX = new Map();  // 任一詞 → 該組所有詞 (含 canonical),供 expandSynonyms 用
async function loadAllData() {
  const v = '?v=' + DATA_VERSION;
  // 2026-05-01 (A1):auto 卡停用、舊 scenarios.json monolith 退役 — 情境視圖只載手寫 manual 卡。
  const [nodes, edges, scnManual, aliases, neighbors, synonyms, baseline] = await Promise.all([
    fetch('../03_index/nodes.json' + v).then(r => r.json()),
    fetch('../03_index/edges.json' + v).then(r => r.json()),
    fetch('data/scenarios_manual.json' + v).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch('data/city_aliases.json' + v).then(r => r.ok ? r.json() : { aliases: {} }).catch(() => ({ aliases: {} })),
    fetch('data/country_neighbors.json' + v).then(r => r.ok ? r.json() : { neighbors: {} }).catch(() => ({ neighbors: {} })),
    fetch('data/synonyms.json' + v).then(r => r.ok ? r.json() : { groups: [] }).catch(() => ({ groups: [] })),
    fetch('data/baseline_attachments.json' + v).then(r => r.ok ? r.json() : { groups: {} }).catch(() => ({ groups: {} })),
  ]);
  BASELINE_ATTACHMENTS = baseline.groups || {};
  CITY_ALIASES = aliases.aliases || {};
  COUNTRY_NEIGHBORS = neighbors.neighbors || {};
  SYNONYMS = synonyms.groups || [];
  // 建反查表:每個詞(canonical + aliases)指向該組所有詞
  SYNONYM_INDEX = new Map();
  for (const g of SYNONYMS) {
    const all = [g.canonical, ...(g.aliases || [])];
    for (const w of all) {
      SYNONYM_INDEX.set(w.toLowerCase(), all);
    }
  }
  // 建 NODES_BY_ID + 反向 edges
  for (const n of nodes) NODES_BY_ID.set(n.id, n);
  const edgeArr = edges.edges || edges;
  for (const e of edgeArr) {
    if (!INCOMING_EDGES.has(e.to)) INCOMING_EDGES.set(e.to, []);
    INCOMING_EDGES.get(e.to).push(e.from);
  }
  // 2026-05-01:只載 manual(auto / legacy 兩份 JSON 已退役);整備中母題情境一併隱藏
  const m = scnManual ? (scnManual.scenarios || scnManual) : [];
  SCENARIOS = (m || []).filter(s => s.source !== 'auto' && !WIP_PARENTS.has(s.parent || ''));
  // map nodes → DATA (隱藏已廢止節點,但保留有 effective_period 的歷史費率表;隱藏整備中母題)
  DATA = nodes
    .filter(n => {
      if (n.status === '已廢止' && !n.effective_period) return false;
      if (WIP_PARENTS.has(n.parent || '')) return false;
      return true;
    })
    .sort((a, b) => {
      // 1. 母題序(PARENTS 定義)
      const pi = PARENTS.indexOf(a.parent || '') - PARENTS.indexOf(b.parent || '');
      if (pi !== 0) return pi;
      // 2. 類別代碼 A < B < C < D
      const ca = a.id.split('-')[0], cb = b.id.split('-')[0];
      if (ca !== cb) return ca < cb ? -1 : 1;
      // 3. 有「第N條」結構者(splitTitle no 不空)優先;獨立法規(無條次)排最後
      const aHasNo = /^第[一二三四五六七八九十百零0-9]+[條點]/.test(a.title || '') || /^Q\d+/.test(a.title || '') || /^（[一二三四五六七八九十]+）/.test(a.title || '');
      const bHasNo = /^第[一二三四五六七八九十百零0-9]+[條點]/.test(b.title || '') || /^Q\d+/.test(b.title || '') || /^（[一二三四五六七八九十]+）/.test(b.title || '');
      if (aHasNo !== bHasNo) return aHasNo ? -1 : 1;
      // 4. 同類內按 ID 末段數字升序
      const ia = parseInt(a.id.split('-').pop(), 10) || 0;
      const ib = parseInt(b.id.split('-').pop(), 10) || 0;
      return ia - ib;
    })
    .map(n => {
      const cat = n.id.split('-')[0];
      const { no, title } = splitTitle(n.title, n.id);
      return {
        id: n.id,
        no, title,
        status: n.status || '現行',
        cat: n.parent || '',
        art: CAT_ART[cat] || 'travel',
        type: n.type,
        catLabel: CAT_LABEL[cat] || '',
        tags: n.tags || [],
        summary: n.summary || '',
        updated: n.reviewed || n.version || '',
        reviewLevel: n.review_level || '',
        sourceUrl: n.source_url || '',
        filePath: n.file_path || '',
        rateTable: n.rate_table || null,
        effectivePeriod: n.effective_period || '',
        supersededBy: n.superseded_by || '',
        // Phase 4 信度系統(2026-04-29)
        certainty: n.certainty || 'explicit',
        disclaimerLevel: n.disclaimer_level || 'standard',
        noInferenceNote: n.no_inference_note || '',
        // 2026-05-02 #23:條文修法歷史
        versionHistory: Array.isArray(n.version_history) ? n.version_history : [],
      };
    });
  // 2026-05-02 #24:建 bigram/trigram 反向索引(query → 候選 ID Set,加速 substring 搜尋)
  if (window.SearchIndex) {
    const docs = DATA.map(d => ({
      id: d.id,
      text: [d.id, d.title, (d.tags || []).join(' '), d.summary].filter(Boolean).join(' '),
    }));
    window.SearchIndex.build(docs);
    console.log('[SearchIndex] built:', window.SearchIndex.stats());
  }
  return DATA;
}

// 為了向下相容 (避免 inline mock data 殘留), 這個區塊不再使用
const _mock_data_removed_ = [
  {
    id: "A-國內旅費-001", no: "第一條", title: "訂定目的",
    status: "現行", cat: "國內旅費", art: "travel",
    tags: ["公務事項", "旅費支給", "中央機關"],
    summary: "本要點之訂定目的，係依中央政府各機關員工因公差派國內出差旅費報支事項，據以審查各「中央政府各機關員工」，俾由各「凡具」報支標準。",
    article: "本要點依「國內出差旅費報支要點」第一點規定訂定。中央政府各機關員工因公差派國內出差，其旅費之支給，依本要點辦理。但其他法令另有規定者，從其規定。",
    keypoints: [
      "適用對象：中央政府各機關員工",
      "適用情境：因公差派國內出差",
      "排除規定：其他法令另有規定者，從其規定"
    ],
    related: [
      { kind: "qa", title: "聘僱人員出差是否適用本要點？", meta: "Q&A · 出差身分" },
      { kind: "fn", title: "行政院主計總處 113.2.15 主預字第 1130100123 號函", meta: "解釋函釋 · 適用範圍" },
      { kind: "qa", title: "離職前最後一日出差，旅費如何處理？", meta: "Q&A · 申請程序" }
    ],
    updated: "2026-04-25"
  },
  {
    id: "A-國內旅費-002", no: "第二條", title: "旅費項目",
    status: "現行", cat: "國內旅費", art: "travel",
    tags: ["交通費", "住宿費", "雜支上限"],
    summary: "旅費分為交通費、住宿費、雜費三項。報支金額依本要點所附「報支要點附表」辦理；報支單據及支付方式，依規定辦理。",
    article: `旅費分為下列三項：
一、交通費：包含高鐵、火車、船舶、飛機、市區交通、自用汽車及機車燃料費等。
二、住宿費：依出差地區及職等支給，並以實際住宿之單據核實列支。
三、雜費：包含必要之過路費、停車費、行李超重費、簽證費及其他與公務有關之必要支出。

前項各款報支金額，依「中央政府各機關員工國內出差旅費報支要點附表」辦理。報支時應檢附原始憑證；無法取得者，應依規定填具切結書。`,
    keypoints: [
      "交通費：含高鐵 / 火車 / 船舶 / 飛機 / 市區 / 自用車",
      "住宿費：依地區與職等核實列支",
      "雜費：過路、停車、行李超重、簽證等",
      "無原始憑證：須填切結書"
    ],
    related: [
      { kind: "qa", title: "自用汽車油資怎麼計算？每公里幾元？", meta: "Q&A · 交通費" },
      { kind: "qa", title: "搭高鐵商務艙可以全額報支嗎？", meta: "Q&A · 交通費" },
      { kind: "fn", title: "行政院 114.1.10 院授主預字第 1140012345 號函", meta: "解釋函釋 · 雜費項目" },
      { kind: "qa", title: "出差期間私人行程的住宿費用如何切割？", meta: "Q&A · 住宿費" }
    ],
    updated: "2026-04-25"
  },
  {
    id: "A-國內旅費-003", no: "第三條", title: "公差派遣與行程核定",
    status: "現行", cat: "公差派遣", art: "travel",
    tags: ["交通費", "公差派遣", "出差報告書"],
    summary: "公差派遣前，任務內容、公差地點、日期等即可填寫公文/簽辦/email 處理者不得派遣；其他類型公差須填寫「出差申請表」並先行陳核後始得出發。",
    article: "公差派遣前，應就任務內容、公差地點、起訖日期等，填寫公差派遣表並陳機關首長核定。能以公文、簽辦或電子郵件方式處理者，不得派遣公差。",
    keypoints: [
      "派遣前：須填公差派遣表並陳首長核定",
      "排除：能以公文 / 簽辦 / email 處理者不得派遣"
    ],
    related: [
      { kind: "qa", title: "口頭核准的出差事後補簽可以嗎？", meta: "Q&A · 申請程序" },
      { kind: "fn", title: "考試院 113.6.20 考臺組貳字第 1130056789 號函", meta: "解釋函釋 · 派遣核定" }
    ],
    updated: "2026-04-25"
  },
  {
    id: "A-國內旅費-004", no: "第四條", title: "出差報支程序",
    status: "現行", cat: "國內旅費", art: "travel",
    tags: ["交通費", "公差派遣", "出差報告書"],
    summary: "出差事畢之報支自十五日內檢具附表二「出差旅費報告表」，連同各項收據及憑證辦理。十五日為計算期限，逾期應檢附說明。",
    article: "出差事畢，應於十五日內檢具附表二「出差旅費報告表」，連同各項收據及憑證辦理結報。逾期者，應敘明事由。",
    keypoints: [
      "結報期限：事畢後 15 日內",
      "應檢附：附表二 + 收據與憑證",
      "逾期：須敘明事由"
    ],
    related: [
      { kind: "qa", title: "出差結報逾期會怎樣？", meta: "Q&A · 結報" }
    ],
    updated: "2026-04-25"
  },
  {
    id: "A-國內旅費-006", no: "第六條", title: "陪同外賓出差",
    status: "現行", cat: "國內旅費", art: "travel",
    tags: ["交通費", "住宿費", "雜費"],
    summary: "陪同外賓在地內以機關所在地為起點，按公務交通費上限規定之例外...",
    article: "陪同外賓出差者，其交通費、住宿費及雜費之報支，依外賓接待規定辦理；無外賓接待規定者，依本要點辦理。",
    keypoints: ["優先依：外賓接待規定", "次依：本要點"],
    related: [],
    updated: "2026-04-25"
  },
  {
    id: "A-國內旅費-007", no: "第七條", title: "調任視同出差",
    status: "現行", cat: "公差派遣", art: "travel",
    tags: ["公差派遣", "調任"],
    summary: "調任視同出差，旅費依「新任機關」（非原機關）規定辦理。",
    article: "員工因調任至他機關，其報到差旅，視同出差，旅費由新任機關依本要點辦理。",
    keypoints: ["調任報到視同出差", "由新任機關辦理"],
    related: [],
    updated: "2026-04-25"
  },
  {
    id: "B-國外旅費-001", no: "附表一", title: "各機關員工國內出差旅費支數額表",
    status: "現行", cat: "費率表", art: "rate",
    tags: ["交通費", "住宿費", "雜費"],
    summary: "各機關員工國內出差旅費支數額表（自113年1月15日生效）：住宿費每日上限平日 3,500 元、假日 4,500 元；雜費每日 400 元；公務員依公務人員身份等級分。",
    article: `自 113 年 1 月 15 日生效

【住宿費上限 / 每人每日】
平日：3,500 元
假日：4,500 元
（依實際住宿單據核實列支，不得超過上限）

【雜費 / 每人每日】
400 元

【交通費 / 自用車】
汽車：3 元 / 公里
機車：2 元 / 公里
（不得另報油料費）`,
    keypoints: [
      "住宿：平日 3,500 / 假日 4,500（核實）",
      "雜費：每日 400 元",
      "自用汽車：3 元 / 公里",
      "自用機車：2 元 / 公里"
    ],
    related: [
      { kind: "qa", title: "假日定義是什麼？週六算假日嗎？", meta: "Q&A · 住宿費" },
      { kind: "fn", title: "行政院主計總處 113.1.5 函", meta: "解釋函釋 · 數額調整" }
    ],
    updated: "2026-04-27"
  },
  {
    id: "B-國外旅費-004", no: "附表（114年版）", title: "國外日支數額表（114年版；已過期）",
    status: "已廢止", cat: "國外旅費", art: "overseas",
    tags: ["日支生活費", "國外旅費", "已廢止"],
    summary: "中央政府各機關派員出國各地區生活費日支數額表 114 年版（已過期）；本表自 114 年 1 月 1 日生效至民國 114 年 12 月 31 日，自 115 年 1 月 1 日起改依新版。",
    article: "本表自民國 114 年 1 月 1 日生效，至民國 114 年 12 月 31 日止。自民國 115 年 1 月 1 日起，改依「中央政府各機關派員出國各地區生活費日支數額表（115 年版）」辦理。",
    keypoints: ["有效期間：114.1.1 – 114.12.31", "115.1.1 起改依新版"],
    related: [
      { kind: "fn", title: "現行版：B-國外旅費-003", meta: "替代規定" }
    ],
    updated: "2026-04-28"
  }
];



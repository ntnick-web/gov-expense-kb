// 02_data.js — auto-split from app.js (2026-05-02 #2 ESM 拆檔 Phase 2-4)
// 此檔為 plain script,共享 window scope;與 02/03/04 配合使用,載入順序固定。

/* ──────── filter / view state ──────── */
let currentView = 'scenarios'; // 'library' | 'scenarios' | 'calc'(2026-05-XX 起 splash 後直接進 scenarios;landing 已封存)
const filterState = {
  parent: null,   // 母題:國內旅費 / 國外旅費 / 支出憑證與結報 / null
  type: null,     // 類別代碼:A / B / C / D / null
  tag: null,      // 標籤
  query: '',      // 搜尋字
  scenario: null, // 情境 ID (套後限定 primary_ids ∪ tags)
  expense: null,  // 支出類別 (交通費/住宿費/生活費/...)
  showObsolete: false, // 是否包含已廢止節點 (預設 false)
};

function switchView(v) {
  // 第一次切 view 後拿掉 pre-paint flash 防護屬性,
  // 否則 html[data-init-view="scenarios"] #view-scenarios{display:block} 會永久蓋過 .active 切換,
  // 導致從情境切到試算 / 條文庫時舊 view 內容仍堆在新 view 下方。
  document.documentElement.removeAttribute('data-init-view');
  if (v !== currentView) {
    if (typeof track === 'function') track('view_change', v);
    if (typeof ga4 === 'function') ga4('view_change', { view_name: v });
  }
  currentView = v;
  document.getElementById('view-landing')?.classList.toggle('active', v === 'landing');
  document.getElementById('view-library').classList.toggle('hidden', v !== 'library');
  document.getElementById('view-scenarios').classList.toggle('active', v === 'scenarios');
  document.getElementById('view-calc').classList.toggle('active', v === 'calc');
  // landing 時隱藏 topbar 搜尋(避免跟 hero 視覺打架)
  const topbar = document.querySelector('.topbar');
  if (topbar) topbar.style.display = (v === 'landing') ? 'none' : '';
  // 桌面 topnav-tab 高亮 + landing 時 tab 不選中
  document.querySelectorAll('.topnav-tab[data-entry]').forEach(it => {
    it.classList.toggle('active', it.dataset.entry === v);
  });
  // Sidebar 殘留(已 display:none 但保留邏輯避免錯誤)
  document.querySelectorAll('.nav-item[data-entry]').forEach(it => {
    it.classList.toggle('active', it.dataset.entry === v);
  });
  // Mobile tabbar 入口高亮(若已掛載)
  document.querySelectorAll('.mobile-tabbar .mobile-tab').forEach(it => {
    it.classList.toggle('active', it.dataset.entry === v);
  });
  // 若直接呼叫 switchView('calc') 而非透過 _enterView，補觸發 renderCalc
  if (v === 'calc' && typeof renderCalc === 'function') {
    const grid = document.getElementById('calc-grid');
    if (grid && !grid.children.length) renderCalc();
  }
}
let currentList = [];   // filteredNodes 結果
let currentIdx = -1;    // 抽屜目前指到 currentList 的 index
const grid = document.getElementById("grid");
const hint = document.getElementById("hint");

function statusBadge(s) {
  if (s === "已廢止") return `<span class="badge stop">${s}</span>`;
  if (s === "部分修正") return `<span class="badge warn">${s}</span>`;
  return `<span class="badge ok">${s}</span>`;
}
function dotClass(art) {
  return ({ travel: "dot-travel", fn: "dot-overseas", qa: "dot-food", rate: "dot-rate", overseas: "dot-overseas", food: "dot-food" })[art] || "";
}
function flashHint(msg) {
  hint.textContent = msg;
  hint.classList.add("show");
  setTimeout(()=>hint.classList.remove("show"), 1400);
}

/* 城市 alias fallback helper:輸入未列載城市 → 推測國家 → 找該國「其他」費率
   2026-05-01 擴充:再無命中時 fallback 到 country_neighbors(未列載國家 → 鄰國「其他」)*/
function inferCountryByAlias(q) {
  if (!q) return null;
  const ql = q.trim().toLowerCase();
  if (!ql) return null;
  // 1) city → country(未列載城市)
  for (const [k, country] of Object.entries(CITY_ALIASES)) {
    const kl = k.toLowerCase();
    if (kl === ql || kl.includes(ql) || ql.includes(kl)) {
      return { aliasKey: k, country, kind: 'city' };
    }
  }
  // 2) country → neighbor country(未列載國家比照鄰國)
  for (const [k, neighbor] of Object.entries(COUNTRY_NEIGHBORS)) {
    const kl = k.toLowerCase();
    if (kl === ql || kl.includes(ql) || ql.includes(kl)) {
      return { aliasKey: k, country: neighbor, kind: 'neighbor' };
    }
  }
  return null;
}
// 從 rows array (扁平 [編號, 國家, 城市, 數額]) 找指定國家的「其他」列
function findOtherRowForCountry(rows, country) {
  if (!Array.isArray(rows) || !country) return null;
  const cl = country.toLowerCase();
  return rows.find(r => {
    const c = String((r && (r.country ?? r[1])) || '').toLowerCase();
    const city = String((r && (r.city ?? r[2])) || '');
    return c.includes(cl) && (city.includes('其他') || /Other/i.test(city));
  });
}

/* 支出類別 (用於篩選與情境分組) — 與 tag 同名比對即可 */
const EXPENSE_LIST = [
  // 現有母題
  '交通費','住宿費','生活費','雜費','保險費','手續費','行政費','禮品交際及雜費',
  '收據與發票','採購結報','系統化結報','補助與分攤','差旅費結報','酬勞與會議',
  '大陸港澳','出國進修',
  '講座鐘點費','出席費','稿費','兼職費','健保補充保費',
  '程序與通則',
  // WIP 母題子類別(已定義供未來篩選用,母題未公開前不顯示)
  '膳食費','茶水費',                                  // 餐費(公務膳費+便當費合併為膳食費)
  '採購程序','採購憑證','履約管理',                   // 採購及履約
  '財物領用','財物保管','財物盤點','財物報廢',         // 物品管理
  '補助支出','特支費','罰款賠償','通信費',             // 其他支出
  '訓練費補助',                                       // 教育訓練
];
// 母題 → 該母題支出類別 chip 允許顯示的白名單(空字串 key = 全域無 parent filter 時不限制)
// 確保各母題 chip filter 不會因跨類 tag 汙染而出現不相干類別
const EXPENSE_LAYER = {
  '國內旅費':       ['交通費', '住宿費', '雜費', '程序與通則'],
  '國外旅費':       ['大陸港澳', '出國進修', '交通費', '生活費', '手續費', '保險費', '行政費', '禮品交際及雜費', '程序與通則'],
  '支出憑證與結報': ['收據與發票', '採購結報', '系統化結報', '補助與分攤', '差旅費結報', '酬勞與會議', '程序與通則'],
  '酬勞費':         ['講座鐘點費', '出席費', '稿費', '兼職費', '健保補充保費', '程序與通則'],
  // WIP 母題 — 子類別已定義,待母題正式公開時移除 WIP_PARENTS 即生效
  '國科會專章':     ['計畫申請資格', '補助項目支用', '經費報銷', '研究人力費', '彈性支用額度'],
  '餐費':           ['膳食費', '茶水費'],
  '採購及履約':     ['採購程序', '採購憑證', '履約管理', '程序與通則'],
  '物品管理':       ['財物領用', '財物保管', '財物盤點', '財物報廢', '程序與通則'],
  '其他支出':       ['補助支出', '特支費', '罰款賠償', '通信費', '程序與通則'],
  '教育訓練':       ['訓練費補助', '程序與通則'],
};
/* 類別排序(A→B→C→D)與母題排序(條文庫無 query/scenario 時的主排序鍵) */
const TYPE_ORDER = {'核心法規': 0, '支出標準': 1, '解釋函令': 2, '問答集': 3};
// 注意:03_render.js 另有同名陣列版 PARENT_ORDER(用於情境分組排序);此處改名 PARENT_SORT_IDX 避免衝突
const PARENT_SORT_IDX = Object.fromEntries(
  ['支出憑證與結報','國內旅費','酬勞費','國外旅費','國外專家','教育部專章','國科會專章','其他',
   '餐費','採購及履約','物品管理','其他支出','教育訓練']
  .map((p, i) => [p, i])
);

// 情境 expense 值 → 條文 tag 比對 (節點 tag 中沒有「程序與通則」這詞,故額外處理)
function nodeMatchesExpense(d, expense) {
  if (!expense) return true;
  if (expense === '程序與通則') {
    // 沒具體費用 tag (沒命中任何具體 expense) 才算「通則」
    const concreteHit = (d.tags || []).some(t => EXPENSE_LIST.includes(t) && t !== '程序與通則');
    return !concreteHit;
  }
  return (d.tags || []).includes(expense);
}

/* 取得 query 的同義詞展開集合(含原 query)。
   例:輸入「自駕」→ ["自駕", "自用汽車", "自駕租賃", "共享汽車", "租賃汽車"]
   匹配規則:① 完全等於 alias/canonical → 整組 OR  ② substring 命中任一 alias → 也展開 */
function expandSynonyms(q) {
  const ql = q.toLowerCase().trim();
  if (!ql) return [ql];
  const expanded = new Set([ql]);
  // 1) 完全相等的快速路徑
  const exact = SYNONYM_INDEX.get(ql);
  if (exact) for (const w of exact) expanded.add(w.toLowerCase());
  // 2) substring 命中任一詞:展開該組(讓「自用」也能撈到「自駕」)
  for (const [w, group] of SYNONYM_INDEX.entries()) {
    if (w === ql) continue;
    if (w.includes(ql) || ql.includes(w)) {
      for (const x of group) expanded.add(x.toLowerCase());
    }
  }
  return [...expanded];
}

/* 套用 filter → 回傳符合的 DATA 子集 */
function filteredData() {
  const qRaw = filterState.query.trim();
  const q = qRaw.toLowerCase();
  // 同義詞展開:多詞 OR 比對(查命中時也記錄是哪一個 alias 命中,供 UI 標示)
  const queryTerms = q ? expandSynonyms(q) : [];
  // 2026-05-02 #24:用 bigram/trigram 索引取候選 IDs(避免每張卡跑 substring,加速 5-10x)
  let candidateIds = null;
  if (q && q.length >= 2 && window.SearchIndex) {
    candidateIds = new Set();
    for (const term of queryTerms) {
      const cset = window.SearchIndex.candidates(term);
      if (cset && cset.size) for (const id of cset) candidateIds.add(id);
    }
    // 若所有 term 都找不到任何候選,直接回空(避免 fallback 跑滿全集)
    if (candidateIds.size === 0) candidateIds = new Set();
  }
  // scenario filter:取該情境的 primary_ids ∪ tag 命中
  const sc = filterState.scenario ? SCENARIOS.find(s => s.id === filterState.scenario) : null;
  const scPrimary = sc ? new Set(sc.primary_ids || []) : null;
  const scTags = sc ? new Set(sc.tags || []) : null;
  // 含相關度分數,以便情境模式下排序:primary_ids 命中 > tag 多命中 > tag 少命中
  const TAG_MATCH_THRESHOLD = 2;  // 純 tag 命中需 ≥ 2 個 tag 才視為相關
  const scored = [];
  for (const d of DATA) {
    // 2026-05-02 #24:bigram 候選預過濾(query mode 下大幅縮小迴圈)
    if (candidateIds !== null && !candidateIds.has(d.id)) continue;
    // 只顯示已確認上線的母題(PARENTS);其他母題(國外專家/教育部專章等)全數隱藏
    if (!PARENTS.includes(d.cat)) continue;
    // 已廢止預設隱藏,但有 effective_period 的歷史費率表例外保留
    if (!filterState.showObsolete && d.status === '已廢止' && !d.effectivePeriod) continue;
    if (filterState.parent && d.cat !== filterState.parent) continue;
    // E類附屬資料：除非明確選 E chip，否則不顯示
    if (d.id.split('-')[0] === 'E' && filterState.type !== 'E') continue;
    if (filterState.type && d.id.split('-')[0] !== filterState.type) continue;
    if (filterState.tag && !d.tags.includes(filterState.tag)) continue;
    if (filterState.expense && !nodeMatchesExpense(d, filterState.expense)) continue;
    let scenarioRelevance = 0;
    if (sc) {
      const inP = scPrimary.has(d.id);
      // 2026-05-01 (P4-29) 收緊:泛 tag 不單獨支撐 ≥2 命中、必須有具體 tag 1+,並要求節點含同 expense
      const GENERIC_TAGS = new Set(['報支上限', '覈實報支', '結報核銷', '出差規定', '原始憑證', '誠信原則']);
      const concreteScTags = new Set([...scTags].filter(t => !GENERIC_TAGS.has(t)));
      const tagOverlap = (d.tags || []).filter(t => scTags.has(t)).length;
      const concreteOverlap = (d.tags || []).filter(t => concreteScTags.has(t)).length;
      if (inP) {
        scenarioRelevance = 1000 + tagOverlap;  // primary 永遠置頂
      } else if (tagOverlap >= TAG_MATCH_THRESHOLD && concreteOverlap >= 1) {
        // 進一步若 sc.expense 存在於 EXPENSE_LIST,節點 tag 也須含同 expense
        if (sc.expense && EXPENSE_LIST.includes(sc.expense) && !(d.tags || []).includes(sc.expense)) {
          continue;
        }
        scenarioRelevance = tagOverlap + concreteOverlap;  // 具體 tag 加權
      } else {
        continue;  // 排除「只命中泛 tag」的雜訊
      }
    }
    let queryRelevance = 0;
    let matchedSynonym = null;  // 若是同義詞命中(非原 query 字面),記下實際命中詞
    if (q) {
      const titleL = (d.title || '').toLowerCase();
      const tagsL = (d.tags || []).join(' ').toLowerCase();
      const summaryL = (d.summary || '').toLowerCase();
      const idL = d.id.toLowerCase();
      let r = 0;
      // 跑全部 queryTerms 一輪,任一命中即計分(原詞權重 + 30%,讓直接命中優先排序)
      for (let i = 0; i < queryTerms.length; i++) {
        const term = queryTerms[i];
        const isOriginal = (i === 0);  // queryTerms[0] 永遠是原 query
        let termR = 0;
        if (titleL.includes(term)) termR += 100;
        if (idL.includes(term)) termR += 80;
        if (tagsL.includes(term)) termR += 60;
        if (summaryL.includes(term)) termR += 30;
        if (termR > 0) {
          r += isOriginal ? termR : Math.floor(termR * 0.7);  // 同義詞命中權重 70%
          if (!isOriginal && !matchedSynonym) matchedSynonym = term;
        }
      }
      if (r === 0) continue;
      queryRelevance = r;
    }
    // 把 matchedSynonym 暫存到 d 物件給卡片渲染用(下輪 render 會 reset)
    d._matchedSynonym = matchedSynonym;
    scored.push({d, scenarioRelevance, queryRelevance});
  }
  // 排序優先序:scenario/query 相關度 > 類別(A→B→C→D) > 母題 > sort_order > ID 末段
  if (sc || q) {
    scored.sort((a, b) => {
      const s = b.scenarioRelevance - a.scenarioRelevance;
      if (s !== 0) return s;
      return b.queryRelevance - a.queryRelevance;
    });
  } else {
    // 無 query/scenario:依母題(支出憑證→國內→酬勞→國外)→類別(A→B→C→D)→sort_order→ID 末段數字升序
    scored.sort((a, b) => {
      const pa = PARENT_SORT_IDX[a.d.cat] ?? 99;
      const pb = PARENT_SORT_IDX[b.d.cat] ?? 99;
      if (pa !== pb) return pa - pb;
      const ta = TYPE_ORDER[a.d.type] ?? 99;
      const tb = TYPE_ORDER[b.d.type] ?? 99;
      if (ta !== tb) return ta - tb;
      // A 類:有條次(no)的條文優先於無條次的獨立文件,確保 group header 不重複
      if (ta === 0) {
        const na = a.d.no ? 0 : 1;
        const nb = b.d.no ? 0 : 1;
        if (na !== nb) return na - nb;
      }
      const sa = a.d.sortOrder ?? Infinity;
      const sb = b.d.sortOrder ?? Infinity;
      if (sa !== sb) return sa - sb;
      const ia = parseInt(a.d.id.split('-').pop(), 10) || 0;
      const ib = parseInt(b.d.id.split('-').pop(), 10) || 0;
      return ia - ib;
    });
  }
  return scored.map(x => x.d);
}


/* 把 query 字詞用 <mark> 包起來高亮(html-safe)。多次呼叫不會疊套。 */
function highlightQuery(html, q) {
  if (!q) return html;
  q = String(q).trim();
  if (!q) return html;
  // q 可能是純文字也可能是已編碼,只把 plain text 的 substring 替換
  // 處理多個關鍵字以空白分隔
  const terms = q.split(/\s+/).filter(t => t.length > 0);
  if (!terms.length) return html;
  for (const t of terms) {
    // escape regex 特殊字元
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 不替換 HTML 標籤內的字串 — 用簡單 split-on-tags
    html = html.replace(/(<[^>]+>)|([^<]+)/g, (_, tag, txt) => {
      if (tag) return tag;
      return txt.replace(new RegExp(esc, 'gi'), m => `<mark class="search-hit">${m}</mark>`);
    });
  }
  return html;
}

/* ──────── 麵包屑導覽 (條文庫頂部) ──────── */
function renderBreadcrumb() {
  const $bc = document.getElementById('lib-breadcrumb');
  if (!$bc) return;
  const parts = [];
  // 永遠先有「全部」
  parts.push({ label: '全部', action: 'all' });
  if (filterState.scenario) {
    const sc = SCENARIOS.find(s => s.id === filterState.scenario);
    if (sc) parts.push({ label: `情境 · ${sc.title}`, action: 'scenario' });
  }
  if (filterState.parent) parts.push({ label: filterState.parent, action: 'parent' });
  if (filterState.expense) {
    // 拆 expense__parent 複合 key 顯示乾淨的中文(若為複合 key 則只取前段)
    const exp = String(filterState.expense).split('__')[0];
    parts.push({ label: exp, action: 'expense' });
  }
  if (filterState.type) {
    const typeLabel = (typeof CAT_LABEL !== 'undefined' && CAT_LABEL[filterState.type]) || filterState.type;
    parts.push({ label: typeLabel, action: 'type' });
  }
  if (filterState.tag) parts.push({ label: `#${filterState.tag}`, action: 'tag' });
  if (filterState.query && filterState.query.trim()) parts.push({ label: `🔍 「${filterState.query.trim()}」`, action: 'query' });
  // 若只有「全部」一層,不顯示麵包屑
  if (parts.length <= 1) {
    $bc.innerHTML = '';
    $bc.style.display = 'none';
    return;
  }
  $bc.style.display = 'flex';
  $bc.innerHTML = parts.map((p, i) => {
    const isLast = i === parts.length - 1;
    const sep = i < parts.length - 1 ? '<span class="breadcrumb-sep">›</span>' : '';
    return `<button class="breadcrumb-item${isLast ? ' is-current' : ''}" data-bc="${p.action}" type="button">${escapeHtml(p.label)}</button>${sep}`;
  }).join('');
  // 綁 click — 點任一層 → 把該層之後的 filter 全部清掉
  $bc.querySelectorAll('.breadcrumb-item').forEach(btn => {
    btn.onclick = () => {
      const action = btn.dataset.bc;
      // 從該層往下逐層清(由內到外)
      switch (action) {
        case 'all':
          filterState.scenario = null;
          filterState.parent = null;
          filterState.expense = null;
          filterState.type = null;
          filterState.tag = null;
          filterState.query = '';
          { const $q = document.getElementById('q'); if ($q) $q.value = ''; }
          break;
        case 'scenario':
          filterState.expense = null; filterState.type = null;
          filterState.tag = null; filterState.query = '';
          { const $q = document.getElementById('q'); if ($q) $q.value = ''; }
          break;
        case 'parent':
          filterState.scenario = null;
          filterState.expense = null; filterState.type = null;
          filterState.tag = null; filterState.query = '';
          { const $q = document.getElementById('q'); if ($q) $q.value = ''; }
          break;
        case 'expense':
          filterState.type = null; filterState.tag = null;
          filterState.query = '';
          { const $q = document.getElementById('q'); if ($q) $q.value = ''; }
          break;
        case 'type':
          filterState.tag = null; filterState.query = '';
          { const $q = document.getElementById('q'); if ($q) $q.value = ''; }
          break;
        case 'tag':
          filterState.query = '';
          { const $q = document.getElementById('q'); if ($q) $q.value = ''; }
          break;
        case 'query':
          // 點當前層相當於不變;放著也無妨
          return;
      }
      renderSidebar?.(); renderChips?.(); renderCards();
    };
  });
}

/* ──────── 採購流程圖(2026-05-XX 加,P1-9)
    依《政府採購法》§22 公告金額(150 萬)+ §49 (10 萬)+ 中央機關小額採購共通供應契約
    級距 → 程序 → 憑證 → 簽核層級 — 4 層橫向流程圖 ──────── */
function renderProcurementFlowChart() {
  const tiers = [
    {
      label: '小額採購',
      range: '≤ NT$ 150,000',
      color: 'matcha',
      icon: '🟢',
      procedure: ['可指定廠商或詢價 1 家以上', '無公開比價要求', '採購法 §49(小額採購為公告金額 1/10)'],
      vouchers: ['統一發票或收據', '簽核單', '驗收紀錄(實物)'],
      sign: ['承辦人 → 主管 → 出納', '機關首長依授權層級'],
      pitfalls: ['切勿拆單規避公告金額', '同性質連續採購視為一案'],
    },
    {
      label: '未達公告金額',
      range: 'NT$ 150,001 – 1,500,000',
      color: 'sky',
      icon: '🟡',
      procedure: ['公開取得書面報價或企劃書 ≥ 3 家', '比價或議價', '採購法 §49'],
      vouchers: ['公開取得邀標公告', '3 家以上報價單', '比價/議價紀錄', '決標紀錄', '統一發票或收據', '驗收紀錄'],
      sign: ['承辦 → 採購承辦 → 政風(高風險)', '主管 → 機關首長'],
      pitfalls: ['未滿 3 家須說明原因', '比價廠商家數 ≥ 3 為原則'],
    },
    {
      label: '公開招標',
      range: '≥ NT$ 1,500,000',
      color: 'strawberry',
      icon: '🔴',
      procedure: ['政府電子採購網公告', '招標公告期 ≥ 14 日', '開標 → 評選 → 決標'],
      vouchers: ['招標公告', '招標文件 / 規範書', '投標文件 / 廠商資格', '開標決標紀錄', '契約', '履約 / 驗收紀錄', '統一發票'],
      sign: ['採購工作小組 / 評選委員會', '機關首長 + 主計核章'],
      pitfalls: ['超過巨額採購(2 億)需上網公告招標方式', '評選委員迴避規定'],
    },
  ];
  const blocks = tiers.map(t => `
    <details class="proc-tier proc-tier-${t.color}">
      <summary class="proc-tier-h">
        <span class="proc-tier-icon">${t.icon}</span>
        <span class="proc-tier-label">${t.label}</span>
        <span class="proc-tier-range">${t.range}</span>
        <span class="proc-tier-arrow">▶</span>
      </summary>
      <div class="proc-tier-body">
        <div class="proc-block">
          <div class="proc-block-h">📋 程序</div>
          <ol class="proc-block-list">${t.procedure.map(x => `<li>${x}</li>`).join('')}</ol>
        </div>
        <div class="proc-block">
          <div class="proc-block-h">📎 必備憑證</div>
          <ol class="proc-block-list">${t.vouchers.map(x => `<li>${x}</li>`).join('')}</ol>
        </div>
        <div class="proc-block">
          <div class="proc-block-h">✍️ 簽核層級</div>
          <ol class="proc-block-list">${t.sign.map(x => `<li>${x}</li>`).join('')}</ol>
        </div>
        <div class="proc-block proc-block-warn">
          <div class="proc-block-h">⚠ 常見陷阱</div>
          <ol class="proc-block-list">${t.pitfalls.map(x => `<li>${x}</li>`).join('')}</ol>
        </div>
      </div>
    </details>
  `).join('');
  return `
    <div class="proc-flow">
      <div class="proc-flow-h">📊 採購金額決策樹 — 點任一級距展開「程序 / 憑證 / 簽核 / 陷阱」</div>
      <div class="proc-flow-body">${blocks}</div>
      <div class="proc-flow-foot">⚖️ 金額級距以《政府採購法》§22、§49 為準。<strong>公告金額 = NT$ 1,500,000;小額採購 = 公告金額之 1/10 = NT$ 150,000</strong>(行政院公告)。實際以主計室審核為準。</div>
    </div>`;
}

/* ──────── 情境 banner (條文庫頂部, 套情境/有 filter 時顯示) ──────── */
function renderScopeBanner() {
  const $slot = document.getElementById('scope-banner-slot');
  if (!$slot) return;
  if (filterState.scenario) {
    const sc = SCENARIOS.find(s => s.id === filterState.scenario);
    if (!sc) { $slot.innerHTML = ''; return; }
    // ── 紅線 caveats(2026-05-01 加)— 最高優先,放最頂部紅色 banner ──
    const caveats = Array.isArray(sc.caveats) ? sc.caveats : [];
    const caveatsHtml = caveats.length ? `
      <div class="scope-caveats">
        <div class="scope-caveats-h">⚠ 紅線 — 容易被退件 / 審計糾正</div>
        <ul class="scope-caveats-list">
          ${caveats.map(c => {
            const text = (typeof c === 'string') ? c : (c.text || '');
            const ref = (typeof c === 'object' && c.legal_ref) ? c.legal_ref : '';
            const sev = (typeof c === 'object' && c.severity) ? c.severity : 'stop';
            return `<li class="caveat-${sev}">${escapeHtml(text)}${ref ? ` <code class="caveat-ref">[${escapeHtml(ref)}]</code>` : ''}</li>`;
          }).join('')}
        </ul>
      </div>` : '';
    // ── baseline 標配憑證(2026-05-01 加)— 條文卡只列差異,共通項拉到 banner ──
    const baselineId = sc.baseline_attachments_id;
    const baseline = baselineId ? BASELINE_ATTACHMENTS[baselineId] : null;
    const baselineHtml = baseline ? `
      <details class="scope-baseline">
        <summary class="scope-baseline-h">${baseline.icon || '✅'} ${escapeHtml(baseline.title)}(共通標配,${baseline.items.length} 項) <span style="font-size:11px;color:var(--ink-3)">— 點擊展開</span></summary>
        <ol class="scope-baseline-list">
          ${baseline.items.map((it, i) => `<li><span class="scope-att-num">${String(i + 1).padStart(2, '0')}</span><span>${escapeHtml(it)}</span></li>`).join('')}
        </ol>
      </details>` : '';
    // ── 計算範例 example(2026-05-01 加)──
    const examples = Array.isArray(sc.example) ? sc.example : [];
    const exampleHtml = examples.length ? `
      <div class="scope-examples">
        <div class="scope-examples-h">🧮 計算範例</div>
        ${examples.map(e => {
          const caseTxt = (typeof e === 'string') ? e : (e.case || '');
          const formula = (typeof e === 'object') ? (e.formula || '') : '';
          const total = (typeof e === 'object') ? (e.total || '') : '';
          return `<div class="scope-example">
            ${caseTxt ? `<div class="scope-example-case">情境:${escapeHtml(caseTxt)}</div>` : ''}
            ${formula ? `<div class="scope-example-formula"><code>${escapeHtml(formula)}</code></div>` : ''}
            ${total ? `<div class="scope-example-total">合計:<strong>${escapeHtml(total)}</strong></div>` : ''}
          </div>`;
        }).join('')}
      </div>` : '';
    // ── 子情境連結 sub_scenarios(2026-05-01 加,P2-D)──
    const subScenarios = Array.isArray(sc.sub_scenarios) ? sc.sub_scenarios : [];
    const subItems = subScenarios.map(id => SCENARIOS.find(x => x.id === id)).filter(Boolean);
    const subHtml = subItems.length ? `
      <details class="scope-subs" open>
        <summary class="scope-subs-h">🗂 子情境(${subItems.length} 項)— 點擊跳到對應情境</summary>
        <div class="scope-subs-grid">
          ${subItems.map(sub => `<button class="scope-sub-chip" data-sub-jump="${sub.id}" type="button">
            <span class="scope-sub-icon">${sub.icon || '•'}</span>
            <span class="scope-sub-text"><strong>${escapeHtml(sub.title)}</strong>${sub.subtitle ? `<br><span class="scope-sub-sub">${escapeHtml(sub.subtitle)}</span>` : ''}</span>
          </button>`).join('')}
        </div>
      </details>` : '';
    // ── 簽呈樣張 template(2026-05-01 加)──
    const templates = Array.isArray(sc.template) ? sc.template : (sc.template ? [sc.template] : []);
    const templateHtml = templates.length ? `
      <details class="scope-template">
        <summary class="scope-template-h">📝 簽呈核准事由樣張(${templates.length} 份)— 點擊展開可複製</summary>
        ${templates.map((t, i) => {
          const ttype = (typeof t === 'object') ? (t.type || '') : '';
          const tbody = (typeof t === 'object') ? (t.body || '') : t;
          return `<div class="scope-template-item">
            ${ttype ? `<div class="scope-template-type">${escapeHtml(ttype === 'approval_memo' ? '簽呈' : ttype === 'request_letter' ? '請示函' : ttype)}</div>` : ''}
            <pre class="scope-template-body" data-template-idx="${i}">${escapeHtml(tbody)}</pre>
          </div>`;
        }).join('')}
      </details>` : '';
    // 需附單據清單(若 scenario 有 attachments 欄位)
    const attachments = Array.isArray(sc.attachments) ? sc.attachments : [];
    const attHtml = attachments.length ? `
      <div class="scope-attachments">
        <div class="scope-attachments-h">📎 需附單據${baseline ? '(本情境差異 / 額外附件)' : ''}</div>
        <ol class="scope-attachments-list">
          ${attachments.map((a, i) => `<li><span class="scope-att-num">${String(i + 1).padStart(2, '0')}</span><span>${escapeHtml(a)}</span></li>`).join('')}
        </ol>
      </div>` : '';
    // 條件問答按鈕(若 scenario 有 flow)
    const flowBtnHtml = (sc.flow && sc.flow.start) ? `<button class="scope-flow-btn" data-banner-flow>🤔 開始條件問答</button>` : '';
    // 試算表聯動(2026-05-01 加,P4-32)— 若 scenario 含 calc_link 或 expense ∈ {生活費, 住宿費, 保險費},顯示「🧮 開啟試算」
    const linkToCalc = sc.calc_link === true || ['生活費', '保險費'].includes(sc.expense || '') || (sc.parent === '國外旅費' && ['住宿費'].includes(sc.expense || ''));
    const calcBtnHtml = linkToCalc ? `<button class="scope-calc-btn" data-banner-calc title="跳到試算表查具體金額">🧮 開啟試算</button>` : '';
    // 採購流程圖(2026-05-XX 加,P1-9)— 僅 voucher-procurement 顯示
    const procurementFlowHtml = sc.id === 'voucher-procurement' ? renderProcurementFlowChart() : '';
    $slot.innerHTML = `
      <div class="scope-banner">
        <span class="scope-banner-icon">${sc.icon || '🧭'}</span>
        <div class="scope-banner-text">情境:<strong>${sc.title}</strong>${sc.subtitle ? ` · <span style="color:var(--ink-3)">${sc.subtitle}</span>` : ''}</div>
        ${flowBtnHtml}
        ${calcBtnHtml}
        <button class="scope-banner-back" data-banner-back>← 回情境列表</button>
        <button class="scope-banner-clear" data-banner-clear>✕ 清除情境</button>
      </div>
      ${caveatsHtml}
      ${procurementFlowHtml}
      ${baselineHtml}
      ${subHtml}
      ${attHtml}
      ${exampleHtml}
      ${templateHtml}`;
    // 子情境跳轉 — 套用該子情境並滾頂
    $slot.querySelectorAll('[data-sub-jump]').forEach(b => {
      b.onclick = () => {
        const subId = b.dataset.subJump;
        const sub = SCENARIOS.find(x => x.id === subId);
        if (!sub) return;
        filterState.scenario = subId;
        filterState.parent = sub.parent || null;
        filterState.type = null; filterState.tag = null; filterState.expense = null;
        renderScopeBanner(); renderSidebar(); renderChips(); renderCards();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        flashHint(`套用子情境:${sub.title}`);
      };
    });
    $slot.querySelector('[data-banner-back]').onclick = () => {
      // 2026-05-01:完整清除所有 filter,確保「回情境列表」回到全集情境檢索
      filterState.scenario = null; filterState.parent = null;
      filterState.type = null; filterState.tag = null;
      filterState.expense = null; filterState.query = '';
      // 同步清空 topbar 搜尋框
      const $topQ = document.getElementById('q'); if ($topQ) $topQ.value = '';
      // 重置情境視圖內的 chip filter state
      if (typeof scenarioFilterParent !== 'undefined') scenarioFilterParent = null;
      if (typeof scenarioFilterExpense !== 'undefined') scenarioFilterExpense = null;
      // 同步清空情境視圖內的關鍵字搜尋框
      const $scQ = document.getElementById('sc-q'); const $scQClear = document.getElementById('sc-q-clear');
      if ($scQ) $scQ.value = '';
      if ($scQClear) $scQClear.hidden = true;
      if (typeof scenarioQuery !== 'undefined') scenarioQuery = '';
      switchView('scenarios'); renderScenarios(); renderSidebar();
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    $slot.querySelector('[data-banner-clear]').onclick = () => {
      filterState.scenario = null;
      renderScopeBanner(); renderSidebar(); renderChips(); renderCards();
    };
    const $flowBtn = $slot.querySelector('[data-banner-flow]');
    if ($flowBtn) $flowBtn.onclick = () => openFlowModal(sc);
    const $calcBtn = $slot.querySelector('[data-banner-calc]');
    if ($calcBtn) $calcBtn.onclick = () => {
      switchView('calc');
      if (typeof renderCalc === 'function') renderCalc();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      flashHint('已切到試算表 — 輸入城市/天數即可查上限');
    };
  } else {
    $slot.innerHTML = '';
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}



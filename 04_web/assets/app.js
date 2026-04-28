// 政府支出法規知識庫 — 前端主程式
// 純 ES6,無框架。從 03_index/*.json 載入資料,渲染條文庫主介面。

const DATA_VERSION = '2026-04-28q';
const DATA_BASE = '../03_index/';
const MD_BASE = '../';
const DATA_QS = '?v=' + DATA_VERSION;

const CATEGORY_LABEL = {
  A: '核心法規', B: '支出標準', C: '解釋函令', D: '問答集', N: '分類節點'
};
const CATEGORY_ORDER = ['A', 'B', 'C', 'D', 'N'];
const PLACEHOLDER_RE = /\(待人工補\)|TODO|待補/;

// 泡泡圖:目前僅顯示有資料的母題(0 筆者隱藏)
const PARENTS_ALL = [
  '國內旅費', '國外旅費', '支出憑證與結報',
];
// beta 母題(尚在校對中,UI 上加 BETA 標)
const BETA_PARENTS = new Set(['國內旅費', '國外旅費', '支出憑證與結報']);
// 已廢止節點是否從卡片網格 / 分類樹 / 母題泡泡中隱藏(關聯圖與搜尋仍會顯示)
const HIDE_OBSOLETE = true;
function isVisible(n) {
  if (!HIDE_OBSOLETE) return true;
  if (n.status !== '已廢止') return true;
  // 例外:有 effective_period 的歷史費率表,保留供歷史核銷查詢
  if (n.effective_period) return true;
  return false;
}
const PARENT_COLOR = {
  '國內旅費':       '#4A90E2',
  '國外旅費':       '#F8C471',  // 淺橘色
  '講座鐘點費':     '#48C9B0',
  '酬勞費':         '#F4D03F',
  '國外專家':       '#EB984E',
  '其他':           '#95A5A6',
  '支出憑證與結報': '#A569BD',
  '教育部專章':     '#16A085',
  '國科會專章':     '#E74C3C',
};
const DECORATIVE_COLORS = [
  '#4A90E2', '#F8C471', '#48C9B0', '#F4D03F', '#EB984E',
  '#A569BD', '#16A085', '#E74C3C', '#95A5A6',
];
const SVG_NS = 'http://www.w3.org/2000/svg';

// 條文庫第 2 層「支出類別」:依 tags 推斷,最後 fallback 為「其他」
// 母標籤定義來自 docs/06_tags_taxonomy.md §2;match 為觸發該支出類別的 tag 詞庫
const EXPENSE_LAYER = {
  '國內旅費': [
    { name: '交通費', match: ['交通費', '自駕租賃', '自用汽車', '機車', '租賃汽車', '高鐵', '飛機', '火車', '商務車廂', '票根', '購票證明', '必要路程', '公里數'] },
    { name: '住宿費', match: ['住宿費', '長期派駐', '同一地點超過一個月'] },
    { name: '雜費', match: ['雜費', '住院雜費'] },
    { name: '通則與其他', match: ['總則', '法源依據', '公差派遣', '出差行程', '報支期限', '調任', '準用', '懲處', '休職', '撤職', '停職', '免職', '起程日', '差竣日', '結報核銷'] },
    { name: '其他', match: null },
  ],
  '國外旅費': [
    // 特殊情境(地區/事由)優先過濾
    { name: '大陸港澳', match: ['大陸港澳旅費', '大陸地區', '香港', '澳門'] },
    { name: '出國進修', match: ['出國進修', '教育訓練費', '研究實習'] },
    // 具體費用類
    { name: '交通費', match: ['交通費', '機票', '飛機', '艙等', '經濟艙', '商務艙', '頭等艙', '搭乘飛機', '計程車', '租車', '大眾陸運', '長途陸運'] },
    { name: '生活費', match: ['生活費', '日支生活費', '住宿費', '膳食費', '零用費', '日支數額', '住宿'] },
    { name: '手續費', match: ['手續費', '簽證費', '護照費', '護照', '簽證', '黃皮書', '護照簽證'] },
    { name: '保險費', match: ['保險費', '保險', '健康保險', '綜合保險', '旅遊平安險'] },
    { name: '行政費', match: ['行政費', '辦公費', '資料費', '文件費', '補助核定', '補助', '採購', '電子憑證', '原始憑證', '支出憑證', '業務費', '顧問費'] },
    { name: '禮品交際及雜費', match: ['禮品', '禮品交際', '交際費', '會議費', '出席費', '會議', '雜費', '短程車資', '耗材物品'] },
    // 「程序總則」:命中泛 tag 或行政事項 tag(僅未命中前面具體類別者落入)
    { name: '通則與其他', match: ['結報核銷', '國外旅費', '總則', '法源依據', '公差派遣', '調任', '準用', '懲處', '休職', '撤職', '停職', '免職'] },
    { name: '其他', match: null },
  ],
  '支出憑證與結報': [
    // 結報通則(法源、定義、誠信原則、簽章、跨年度等)優先過濾,
    // 但具體憑證/採購/補助等若先命中則歸入該細項
    { name: '收據與發票', match: ['原始憑證', '電子憑證'] },
    { name: '採購結報', match: ['採購'] },
    { name: '系統化結報', match: ['憑證存管'] },
    { name: '補助與分攤', match: ['補助核定'] },
    // 與其他母題費目的交叉(問答提及差旅費/出席費/鐘點費等的結報疑義)
    { name: '差旅費結報', match: ['國內旅費', '國外旅費', '住宿費', '大陸港澳旅費', '出國進修', '教育訓練費'] },
    { name: '酬勞與會議', match: ['出席費', '鐘點費', '稿費', '顧問費', '會議費', '膳費', '保險費'] },
    // 命中泛 tag(結報核銷)且未落入上面者 → 程序總則
    { name: '通則與其他', match: ['結報核銷', '法源依據', '總則'] },
    { name: '其他', match: null },
  ],
};

// 各支出類別的說明文字(顯示在分類樹滑鼠提示)
const EXPENSE_TOOLTIP = {
  '通則與其他': '法源、定義、誠信原則、跨年度結報等綜合性條文(無具體費目歸類者)',
  '交通費':     '高鐵、火車、計程車、自駕、機票艙等等交通工具費用',
  '住宿費':     '旅館住宿、長期派駐、住宿事實認定',
  '雜費':       '雜項支出、住院雜費等',
  '大陸港澳':   '赴大陸地區、香港、澳門出差適用',
  '出國進修':   '出國進修、研究實習、海外教育訓練',
  '生活費':     '日支生活費、膳食費、零用費',
  '手續費':     '簽證費、護照費、出國手續費',
  '保險費':     '旅遊平安險、健康保險、綜合保險',
  '行政費':     '辦公費、業務費、資料費、顧問費',
  '禮品交際及雜費': '禮品、交際費、會議費、出席費、雜費、短程車資',
  '收據與發票': '原始憑證、電子發票、單據要件',
  '採購結報':   '政府採購法相關結報疑義',
  '系統化結報': '憑證存管、保存與銷毀',
  '補助與分攤': '補助核定、跨機關/跨計畫經費分攤',
  '差旅費結報': '結報程序中與差旅費(國內/國外)交叉的疑義',
  '酬勞與會議': '出席費、鐘點費、稿費、會議費等酬勞類結報',
  '其他':       '未分類至以上類別者',
};

function nodeExpenseLayer(node) {
  const cats = EXPENSE_LAYER[node.parent];
  if (!cats || !node.tags) return null;
  for (const c of cats) {
    if (c.match === null) return c.name;
    if (node.tags.some(t => c.match.includes(t))) return c.name;
  }
  return '其他';
}

// ─────────────────────────────────────────────
// 全域狀態
// ─────────────────────────────────────────────

const state = {
  nodes: [],
  edges: [],
  tags: { 母標籤: {}, 自由標籤: {} },
  searchCorpus: [],
  scenarios: [],                    // 從 data/scenarios.json 載入
  scenariosById: new Map(),
  synonyms: [],                     // 從 data/synonyms.json 載入,搜尋時 OR 展開
  indexMeta: null,                  // 從 03_index/_meta.json 載入(last_indexed 等)
  nodeById: new Map(),
  incomingEdges: new Map(),  // to → [edges]
  filter: { parent: null, expense: null, category: null, tag: null, scenario: null, query: '' },
  compareList: [],   // 比較模式:儲存最多 3 個 node ID
  activeId: null,
  treeOpen: new Set(),
  searchFocusIdx: -1,
  flowAnswers: {},          // 條件問答進度:{ questionId: optionIndex }
  flowConclusion: null,     // 走到的 conclusion id
};

// ─────────────────────────────────────────────
// 載入
// ─────────────────────────────────────────────

async function loadData() {
  const [nodes, edges, tags, search, scenarios, synonyms, indexMeta, rateLookup, cityAliases] = await Promise.all([
    fetch(DATA_BASE + 'nodes.json' + DATA_QS).then(r => r.json()),
    fetch(DATA_BASE + 'edges.json' + DATA_QS).then(r => r.json()),
    fetch(DATA_BASE + 'tags.json' + DATA_QS).then(r => r.json()),
    fetch(DATA_BASE + 'search_index.json' + DATA_QS).then(r => r.json()),
    fetch('data/scenarios.json' + DATA_QS).then(r => r.json()).catch(() => ({ scenarios: [] })),
    fetch('data/synonyms.json' + DATA_QS).then(r => r.json()).catch(() => ({ groups: [] })),
    fetch(DATA_BASE + '_meta.json' + DATA_QS).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(DATA_BASE + 'rate_lookup.json' + DATA_QS).then(r => r.ok ? r.json() : { entries: [] }).catch(() => ({ entries: [] })),
    fetch('data/city_aliases.json' + DATA_QS).then(r => r.ok ? r.json() : { aliases: {} }).catch(() => ({ aliases: {} })),
  ]);
  state.nodes = nodes;
  state.edges = edges;
  state.tags = tags;
  state.searchCorpus = search.documents || [];
  state.scenarios = scenarios.scenarios || [];
  state.scenariosById = new Map(state.scenarios.map(s => [s.id, s]));
  state.synonyms = synonyms.groups || [];
  state.indexMeta = indexMeta;
  state.rateLookup = rateLookup.entries || [];
  state.cityAliases = cityAliases.aliases || {};
  state.nodeById = new Map(nodes.map(n => [n.id, n]));
  state.incomingEdges = new Map();
  for (const e of edges) {
    if (!state.incomingEdges.has(e.to)) state.incomingEdges.set(e.to, []);
    state.incomingEdges.get(e.to).push(e);
  }
}

// 把 query 展開為 [query, ...同義詞]:命中任一 group 的 canonical 或 alias 時,
// 全組詞都進候選。回傳去重 lowercase 詞列。
function expandSynonyms(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out = new Set([q]);
  for (const g of state.synonyms || []) {
    const all = [g.canonical, ...(g.aliases || [])].map(s => s.toLowerCase());
    if (all.some(t => t === q || q.includes(t) || t.includes(q))) {
      all.forEach(t => out.add(t));
    }
  }
  return [...out];
}

// ─────────────────────────────────────────────
// 分類樹
// ─────────────────────────────────────────────

function buildTreeData() {
  // parent → expense(若有定義)→ category → nodes[]
  // 若 parent 無 EXPENSE_LAYER,expense 層用 sentinel '_' 跳過顯示
  const tree = new Map();
  for (const n of state.nodes) {
    if (!isVisible(n)) continue;
    const cat = n.id.split('-')[0];
    const expKey = nodeExpenseLayer(n) || '_';
    if (!tree.has(n.parent)) tree.set(n.parent, new Map());
    const byExp = tree.get(n.parent);
    if (!byExp.has(expKey)) byExp.set(expKey, new Map());
    const byCat = byExp.get(expKey);
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(n);
  }
  return tree;
}

// 取出某 parent 的 expense 順序(依 EXPENSE_LAYER 定義);無則回 ['_']
function expenseOrder(parent) {
  const cats = EXPENSE_LAYER[parent];
  return cats ? cats.map(c => c.name) : ['_'];
}

function renderTree() {
  const tree = buildTreeData();
  const $tree = document.getElementById('tree');
  $tree.innerHTML = '';

  const scope = state.filter.parent;

  if (scope) {
    // 鎖定母題模式:從泡泡圖進入或選定母題後,根直接顯示為該母題,
    // 不顯示其他母題,支出類別預設展開
    renderScopedTree($tree, tree, scope);
  } else {
    // 全部母題模式:根「全部」+ 各母題折疊
    renderAllParentsTree($tree, tree);
  }
}

function renderAllParentsTree($tree, tree) {
  const $allItem = el('div', { class: 'tree-item' + (state.filter.parent === null ? ' is-active' : '') });
  const visibleTotal = state.nodes.filter(isVisible).length;
  $allItem.innerHTML = `<span class="twirl"></span>全部<span class="count">${visibleTotal}</span>`;
  $allItem.onclick = () => { setFilter({ parent: null, expense: null, category: null, tag: null }); };
  $tree.appendChild($allItem);

  for (const [parent, byExp] of [...tree.entries()].sort()) {
    const totalParent = [...byExp.values()].reduce(
      (s, byCat) => s + [...byCat.values()].reduce((s2, arr) => s2 + arr.length, 0), 0);
    const $parent = el('div', { class: 'tree-item' });
    const betaTag = BETA_PARENTS.has(parent) ? '<span class="parent-beta-tag">BETA</span>' : '';
    $parent.innerHTML = `<span class="twirl">▶</span>${esc(parent)}${betaTag}<span class="count">${totalParent}</span>`;
    $parent.onclick = (ev) => {
      ev.stopPropagation();
      setFilter({ parent, expense: null, category: null, tag: null });
    };
    $tree.appendChild($parent);
  }
}

function renderScopedTree($tree, tree, parent) {
  const byExp = tree.get(parent) || new Map();
  const totalParent = [...byExp.values()].reduce(
    (s, byCat) => s + [...byCat.values()].reduce((s2, arr) => s2 + arr.length, 0), 0);
  const hasExpenseLayer = !!EXPENSE_LAYER[parent];

  // 根:該母題本身,點擊回到「全部支出類別」
  const isRootActive = !state.filter.expense && !state.filter.category && !state.filter.tag;
  const $root = el('div', { class: 'tree-item is-scope-root is-open' + (isRootActive ? ' is-active' : '') });
  $root.innerHTML = `<span class="twirl"></span>${esc(parent)}<span class="count">${totalParent}</span>`;
  $root.onclick = () => setFilter({ expense: null, category: null, tag: null });
  $tree.appendChild($root);

  const $children = el('div', { class: 'tree-children is-open' });

  for (const expName of expenseOrder(parent)) {
    if (!byExp.has(expName)) continue;
    const byCat = byExp.get(expName);
    const totalExp = [...byCat.values()].reduce((s, arr) => s + arr.length, 0);

    let $catContainer = $children;

    if (hasExpenseLayer && expName !== '_') {
      const expOpenKey = `${parent}/${expName}`;
      // 鎖定模式下:當前選中或之前展開過的就展開
      const isExpOpen = state.treeOpen.has(expOpenKey) || state.filter.expense === expName;
      const isExpActive = state.filter.expense === expName && !state.filter.category;
      const $exp = el('div', {
        class: 'tree-item is-level-2' + (isExpOpen ? ' is-open' : '') + (isExpActive ? ' is-active' : ''),
        title: EXPENSE_TOOLTIP[expName] || expName,
      });
      $exp.innerHTML = `<span class="twirl">▶</span>${esc(expName)}<span class="count">${totalExp}</span>`;
      $exp.onclick = (ev) => {
        ev.stopPropagation();
        if (state.treeOpen.has(expOpenKey)) state.treeOpen.delete(expOpenKey);
        else state.treeOpen.add(expOpenKey);
        setFilter({ parent, expense: expName, category: null, tag: null });
      };
      $children.appendChild($exp);

      $catContainer = el('div', { class: 'tree-children' + (isExpOpen ? ' is-open' : '') });
      $children.appendChild($catContainer);
    }

    for (const cat of CATEGORY_ORDER) {
      if (!byCat.has(cat)) continue;
      const list = byCat.get(cat);
      const isCatActive = state.filter.category === cat &&
                          (hasExpenseLayer ? state.filter.expense === expName : true);
      const lvl = hasExpenseLayer && expName !== '_' ? 'is-level-3' : 'is-level-2';
      const $cat = el('div', { class: `tree-item ${lvl}` + (isCatActive ? ' is-active' : '') });
      $cat.innerHTML = `<span class="twirl"></span>${esc(CATEGORY_LABEL[cat])}<span class="count">${list.length}</span>`;
      $cat.onclick = (ev) => {
        ev.stopPropagation();
        setFilter({
          parent,
          expense: hasExpenseLayer && expName !== '_' ? expName : null,
          category: cat,
          tag: null,
        });
      };
      $catContainer.appendChild($cat);
    }
  }
  $tree.appendChild($children);

  // 「← 全部母題」離開鎖定模式
  const $exit = el('div', { class: 'tree-item tree-item-exit' });
  $exit.innerHTML = `<span class="twirl">↩</span>← 全部母題`;
  $exit.onclick = () => setFilter({ parent: null, expense: null, category: null, tag: null });
  $tree.appendChild($exit);
}

// ─────────────────────────────────────────────
// 卡片網格
// ─────────────────────────────────────────────

function filteredNodes() {
  const sc = state.filter.scenario ? state.scenariosById.get(state.filter.scenario) : null;
  const scenarioPrimary = sc ? new Set(sc.primary_ids || []) : null;
  const scenarioTags = sc ? new Set(sc.tags || []) : null;
  // query 過濾:標題 / 標籤 / 內文 任一命中即顯示(含同義詞展開)
  const q = (state.filter.query || '').trim().toLowerCase();
  const expandedQ = q ? expandSynonyms(q) : [];
  // 預先建 search corpus by id 對照(避免每筆都遍歷)
  if (q && !state._searchCorpusById) {
    state._searchCorpusById = new Map(state.searchCorpus.map(d => [d.id, d]));
  }
  return state.nodes.filter(n => {
    if (!isVisible(n)) return false;
    if (state.filter.parent && n.parent !== state.filter.parent) return false;
    if (state.filter.expense && nodeExpenseLayer(n) !== state.filter.expense) return false;
    const cat = n.id.split('-')[0];
    if (state.filter.category && cat !== state.filter.category) return false;
    if (state.filter.tag && !(n.tags || []).includes(state.filter.tag)) return false;
    if (sc) {
      const inPrimary = scenarioPrimary.has(n.id);
      const tagHit = (n.tags || []).some(t => scenarioTags.has(t));
      if (!inPrimary && !tagHit) return false;
    }
    if (q) {
      const titleLower = n.title.toLowerCase();
      const tags = (n.tags || []).map(t => t.toLowerCase());
      const doc = state._searchCorpusById?.get(n.id);
      const bodyLower = (doc?.body || '').toLowerCase();
      const summaryLower = (doc?.summary || '').toLowerCase();
      const hit = expandedQ.some(term =>
        titleLower.includes(term) ||
        tags.some(t => t.includes(term)) ||
        bodyLower.includes(term) ||
        summaryLower.includes(term));
      if (!hit) return false;
    }
    return true;
  });
}

function renderCards() {
  const $cards = document.getElementById('cards');
  const $count = document.getElementById('cards-count');
  const $empty = document.getElementById('empty-msg');
  const $bc = document.getElementById('breadcrumb');
  const $treeClear = document.getElementById('tree-clear');

  const list = filteredNodes();
  $cards.innerHTML = '';
  $count.textContent = `${list.length} 筆`;
  $empty.hidden = list.length > 0;

  // 麵包屑(政府支出 › 母題 › 支出類別 › 類別 › #tag)
  const crumbs = [{ label: '政府支出', filter: { parent: null, expense: null, category: null, tag: null } }];
  if (state.filter.parent) {
    crumbs.push({ label: state.filter.parent, filter: { parent: state.filter.parent, expense: null, category: null, tag: null } });
  }
  if (state.filter.expense) {
    crumbs.push({ label: state.filter.expense, filter: { parent: state.filter.parent, expense: state.filter.expense, category: null, tag: null } });
  }
  if (state.filter.category) {
    crumbs.push({ label: CATEGORY_LABEL[state.filter.category], filter: null });
  }
  if (state.filter.tag) {
    crumbs.push({ label: `#${state.filter.tag}`, filter: null });
  }
  $bc.innerHTML = crumbs.map((c, i) =>
    i === crumbs.length - 1 || !c.filter
      ? `<span>${esc(c.label)}</span>`
      : `<a data-bc="${i}">${esc(c.label)}</a>`
  ).join(' › ');
  $bc.querySelectorAll('a').forEach(a => {
    a.onclick = () => {
      const idx = +a.dataset.bc;
      const target = crumbs[idx];
      if (target?.filter) setFilter(target.filter);
    };
  });
  $treeClear.hidden = !(state.filter.parent || state.filter.expense || state.filter.category || state.filter.tag || state.filter.scenario || state.filter.query);

  // 情境 banner
  const $scBanner = document.getElementById('scenario-banner');
  if ($scBanner) {
    if (state.filter.scenario) {
      const sc = state.scenariosById.get(state.filter.scenario);
      if (sc) {
        document.getElementById('scenario-banner-icon').textContent = sc.icon || '📌';
        document.getElementById('scenario-banner-title').textContent = `情境:${sc.title}`;
        document.getElementById('scenario-banner-subtitle').textContent = sc.subtitle || '';
        $scBanner.hidden = false;
      } else {
        $scBanner.hidden = true;
      }
    } else {
      $scBanner.hidden = true;
    }
  }
  renderScenarioDetail();

  // Beta banner(視當前 parent 是否為 beta 母題)
  const $betaBanner = document.getElementById('beta-banner');
  if ($betaBanner) {
    $betaBanner.hidden = !(state.filter.parent && BETA_PARENTS.has(state.filter.parent));
  }

  // Query banner — 顯示目前以搜尋字詞過濾,可一鍵清除
  let $qBanner = document.getElementById('query-banner');
  if (!$qBanner) {
    $qBanner = el('div', { id: 'query-banner', class: 'query-banner' });
    $betaBanner?.parentNode?.insertBefore($qBanner, $betaBanner.nextSibling);
  }
  if (state.filter.query) {
    $qBanner.hidden = false;
    $qBanner.innerHTML = `
      <span class="query-banner-icon">🔍</span>
      <span class="query-banner-text">搜尋條件:<strong>${esc(state.filter.query)}</strong> · 命中 ${list.length} 筆</span>
      <button class="link-btn" id="query-banner-clear" type="button">✕ 清除搜尋</button>
    `;
    document.getElementById('query-banner-clear')?.addEventListener('click', () => {
      setFilter({ query: '' });
      const $si = document.getElementById('search-input');
      if ($si) $si.value = '';
    });
  } else {
    $qBanner.hidden = true;
    $qBanner.innerHTML = '';
  }

  // 依類別群組顯示
  const byCat = new Map();
  for (const n of list) {
    const cat = n.id.split('-')[0];
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(n);
  }
  for (const cat of CATEGORY_ORDER) {
    if (!byCat.has(cat)) continue;
    const items = byCat.get(cat);
    const $section = el('div', { class: 'card-section-title' });
    $section.textContent = `${CATEGORY_LABEL[cat]} — ${items.length} 筆`;
    $cards.appendChild($section);
    for (const n of items) $cards.appendChild(renderCard(n));
  }

  // 標籤雲(取頂前 20 自由標籤)
  renderTagCloud(list);
}

function renderCard(n) {
  const cat = n.id.split('-')[0];
  const isReviewed = !!n.reviewed;
  const reviewLevel = n.review_level || '';
  const status = n.status || '現行';
  const inCompare = state.compareList.includes(n.id);
  const $c = el('div', {
    class: 'card' + (isReviewed ? ' is-reviewed' : '') + (state.activeId === n.id ? ' is-active' : '') + (inCompare ? ' is-comparing' : ''),
    role: 'listitem',
    'data-cat': cat,
    'data-id': n.id,
    'data-status': status,
    'data-review-level': reviewLevel,
  });
  const summaryHTML = n.summary
    ? esc(n.summary)
    : `<span class="card-tag">未填摘要</span>`;
  const tagsHTML = (n.tags || []).slice(0, 3).map(t =>
    `<span class="card-tag">${esc(t)}</span>`
  ).join('');
  const flag = isReviewed ? '' : '<span class="card-flag">草稿</span>';
  const statusBadge = `<span class="status-badge" data-status="${esc(status)}">${esc(status)}</span>`;
  // 卡片底部:校對日(分人工/自動)+ 原始出處
  const reviewIcon = reviewLevel === '人工' ? '✅' : (reviewLevel ? '🤖' : '📅');
  const reviewLabel = reviewLevel === '人工'
    ? '人工校對'
    : (reviewLevel === '自動初校' ? '自動初校(待人工潤飾)' : (reviewLevel ? esc(reviewLevel) : '校對'));
  const reviewedHtml = n.reviewed
    ? `<span class="reviewed-date" data-level="${esc(reviewLevel)}" title="${esc(reviewLabel)}">${reviewIcon} ${esc(n.reviewed)} ${esc(reviewLabel)}</span>`
    : `<span class="draft-flag">⚠ 尚未校對</span>`;
  const sourceHtml = n.source_url
    ? `<a class="source-link" href="${esc(n.source_url)}" target="_blank" rel="noopener" title="開啟原始出處">🔗 原始出處</a>`
    : '';
  const compareBtnLabel = inCompare ? '✓ 已加入' : '+ 比較';
  const compareBtnTitle = inCompare ? '已加入比較,點擊移除' : '加入並排比較 (最多 3 張)';
  $c.innerHTML = `
    ${flag}
    <button class="card-compare-btn${inCompare ? ' is-active' : ''}" data-compare-toggle title="${compareBtnTitle}" type="button">${compareBtnLabel}</button>
    <div class="card-id">${esc(n.id)}</div>
    <h3 class="card-title">${esc(n.title)}${statusBadge}</h3>
    <div class="card-summary">${summaryHTML}</div>
    <div class="card-tags">${tagsHTML}</div>
    <div class="card-footer">
      ${reviewedHtml}
      ${sourceHtml}
    </div>
  `;
  // 阻止 source-link / compare-btn 觸發 openDrawer
  $c.onclick = (ev) => {
    if (ev.target.closest('.source-link')) return;
    if (ev.target.closest('[data-compare-toggle]')) {
      ev.stopPropagation();
      toggleCompare(n.id);
      return;
    }
    openDrawer(n.id);
  };
  return $c;
}

// 比較模式 helper:加入 / 移除一個節點
function toggleCompare(id) {
  const idx = state.compareList.indexOf(id);
  if (idx >= 0) {
    state.compareList.splice(idx, 1);
    toast('已從比較中移除');
  } else {
    if (state.compareList.length >= 3) {
      toast('比較最多 3 張卡(請先移除其他項)');
      return;
    }
    state.compareList.push(id);
    toast(`已加入比較 (${state.compareList.length}/3)`);
  }
  renderCompareBar();
  renderCards();  // 重渲染讓卡片狀態同步
  // 抽屜也同步(若開著)
  if (state.activeId) updateDrawerCompareBtn();
}

function clearCompare() {
  state.compareList = [];
  renderCompareBar();
  renderCards();
  if (state.activeId) updateDrawerCompareBtn();
}

// 渲染浮動比較條(底部固定):chips + 比較 / 清空 按鈕
function renderCompareBar() {
  const $bar = document.getElementById('compare-bar');
  const $chips = document.getElementById('compare-bar-chips');
  const $show = document.getElementById('compare-bar-show');
  if (!$bar || !$chips) return;
  if (state.compareList.length === 0) {
    $bar.hidden = true;
    return;
  }
  $bar.hidden = false;
  $chips.innerHTML = state.compareList.map(id => {
    const n = state.nodeById.get(id);
    if (!n) return '';
    return `<span class="compare-chip" data-id="${esc(id)}">
      <span class="compare-chip-id">${esc(id)}</span>
      <span class="compare-chip-title">${esc(n.title)}</span>
      <button class="compare-chip-x" data-remove="${esc(id)}" type="button" aria-label="移除">✕</button>
    </span>`;
  }).join('');
  $chips.querySelectorAll('[data-remove]').forEach(b => {
    b.onclick = (ev) => { ev.stopPropagation(); toggleCompare(b.dataset.remove); };
  });
  if ($show) {
    $show.disabled = state.compareList.length < 2;
    $show.textContent = state.compareList.length < 2
      ? `📊 並排比較 (還需 ${2 - state.compareList.length} 張)`
      : `📊 並排比較 (${state.compareList.length} 張)`;
  }
}

// 抽屜「+ 加入比較」按鈕同步狀態
function updateDrawerCompareBtn() {
  const $btn = document.getElementById('drawer-compare-btn');
  if (!$btn || !state.activeId) return;
  const inCompare = state.compareList.includes(state.activeId);
  $btn.textContent = inCompare ? '✓ 已加入比較' : '+ 加入比較';
  $btn.classList.toggle('is-active', inCompare);
}

// 開啟並排比較 modal
function openCompareModal() {
  if (state.compareList.length < 2) return;
  const $modal = document.getElementById('compare-modal');
  const $body = document.getElementById('compare-modal-body');
  if (!$modal || !$body) return;
  const nodes = state.compareList.map(id => state.nodeById.get(id)).filter(Boolean);
  // 收集所有 metadata 欄位 → 偵測哪些有差異
  const META_FIELDS = [
    ['類別', n => CATEGORY_LABEL[n.id.split('-')[0]] || ''],
    ['母題', n => n.parent || ''],
    ['機關', n => n.agency || ''],
    ['版本', n => n.version || ''],
    ['校對', n => `${n.reviewed || ''}${n.review_level ? '(' + n.review_level + ')' : ''}`],
    ['狀態', n => n.status || '現行'],
    ['標籤', n => (n.tags || []).join('、')],
  ];
  const isDiff = META_FIELDS.map(([_, fn]) => {
    const vals = nodes.map(fn);
    return new Set(vals).size > 1;
  });
  $body.innerHTML = `<div class="compare-cols" data-cols="${nodes.length}">
    ${nodes.map((n, i) => `
      <div class="compare-col">
        <div class="compare-col-header">
          <span class="badge">${esc(n.id)}</span>
          <h3>${esc(n.title)}</h3>
          <button class="compare-col-remove icon-btn" data-remove="${esc(n.id)}" aria-label="移除此卡">✕</button>
        </div>
        <div class="compare-col-meta">
          ${META_FIELDS.map(([k, fn], idx) => `
            <div class="compare-meta-row${isDiff[idx] ? ' is-diff' : ''}">
              <span class="compare-meta-key">${esc(k)}</span>
              <span class="compare-meta-val">${esc(fn(n) || '—')}</span>
            </div>
          `).join('')}
        </div>
        <div class="compare-col-body" data-id="${esc(n.id)}">
          <p style="color:var(--text-muted);font-size:12px">載入中…</p>
        </div>
        <div class="compare-col-footer">
          <button class="link-btn" data-open="${esc(n.id)}">📑 開啟此卡完整抽屜 →</button>
        </div>
      </div>
    `).join('')}
  </div>`;
  // 載入各 column 的 markdown body
  for (const n of nodes) {
    fetch(MD_BASE + n.file_path).then(r => r.text()).then(text => {
      const $col = $body.querySelector(`.compare-col-body[data-id="${cssEsc(n.id)}"]`);
      if (!$col) return;
      let md = stripFrontMatter(text);
      let rateHtml = '';
      if (n.rate_table) {
        rateHtml = renderRateTable(n.rate_table, n);
        md = stripSection(md, '標準全文');
      }
      $col.innerHTML = rateHtml + renderMarkdown(md);
      wireRateTableInteractions($col);
      wireInsuranceWidgets($col);
    }).catch(e => {
      const $col = $body.querySelector(`.compare-col-body[data-id="${cssEsc(n.id)}"]`);
      if ($col) $col.innerHTML = `<p style="color:#c00">載入失敗:${esc(e.message)}</p>`;
    });
  }
  // 綁 remove / open 按鈕
  $body.querySelectorAll('[data-remove]').forEach(b => {
    b.onclick = () => { toggleCompare(b.dataset.remove); if (state.compareList.length < 2) closeCompareModal(); else openCompareModal(); };
  });
  $body.querySelectorAll('[data-open]').forEach(b => {
    b.onclick = () => { closeCompareModal(); openDrawer(b.dataset.open); };
  });
  $modal.hidden = false;
}

function closeCompareModal() {
  const $modal = document.getElementById('compare-modal');
  if ($modal) $modal.hidden = true;
}

function renderTagCloud(visibleNodes) {
  const $cloud = document.getElementById('tag-cloud');
  const counts = new Map();
  for (const n of visibleNodes) {
    for (const t of (n.tags || [])) {
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  $cloud.innerHTML = '';
  for (const [tag, count] of top) {
    const $chip = el('span', {
      class: 'tag-chip' + (state.filter.tag === tag ? ' is-selected' : ''),
    });
    $chip.textContent = `${tag} (${count})`;
    $chip.onclick = () => {
      setFilter({ tag: state.filter.tag === tag ? null : tag });
    };
    $cloud.appendChild($chip);
  }
}

// ─────────────────────────────────────────────
// 泡泡概覽圖(SVG,雙環)
// ─────────────────────────────────────────────

function renderOverview() {
  const svg = document.getElementById('bubble-svg');
  if (!svg) return;
  svg.innerHTML = '';

  // 取 SVG 元素實際尺寸並動態設 viewBox,讓泡泡填滿全頁面
  const rect = svg.getBoundingClientRect();
  const W = Math.max(800, Math.round(rect.width));
  const H = Math.max(500, Math.round(rect.height));
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const cx = W / 2, cy = H / 2;

  // 統計每個母題的節點數,過濾 0 筆母題(已廢止節點不算入泡泡尺寸)
  const counts = new Map();
  const tagFreq = new Map();   // parent → Map<tag, n>
  for (const n of state.nodes) {
    if (!isVisible(n)) continue;
    counts.set(n.parent, (counts.get(n.parent) || 0) + 1);
    if (!tagFreq.has(n.parent)) tagFreq.set(n.parent, new Map());
    const tf = tagFreq.get(n.parent);
    for (const t of (n.tags || [])) tf.set(t, (tf.get(t) || 0) + 1);
  }
  const visibleParents = PARENTS_ALL.filter(p => (counts.get(p) || 0) > 0);
  const maxCount = Math.max(1, ...visibleParents.map(p => counts.get(p)));
  // 計算每個母題前 3 高頻 tag(供 hover 提示)
  const topTagsByParent = new Map();
  for (const p of visibleParents) {
    const tf = tagFreq.get(p) || new Map();
    const top = [...tf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
    topTagsByParent.set(p, top);
  }

  // 主泡泡尺寸依容器較短邊縮放
  const baseDim = Math.min(W, H);
  const MAIN_MIN_R = baseDim * 0.045;
  const MAIN_MAX_R = baseDim * 0.13;

  const bubbles = [];
  visibleParents.forEach((parent, i) => {
    const c = counts.get(parent) || 0;
    const ratio = c / maxCount;
    const r = MAIN_MIN_R + ratio * (MAIN_MAX_R - MAIN_MIN_R);
    const color = PARENT_COLOR[parent] || '#95A5A6';
    const angle = (i / visibleParents.length) * Math.PI * 2;
    const initR = baseDim * 0.28;
    bubbles.push({
      kind: 'main',
      parent,
      label: parent,
      count: c,
      color,
      r,
      topTags: topTagsByParent.get(parent) || [],
      x: cx + initR * Math.cos(angle),
      y: cy + initR * Math.sin(angle),
    });
  });

  // 裝飾泡泡:依面積比例計算數量,確保填滿大畫面但不擁擠
  const targetArea = W * H * 0.30;       // 占畫面 30% 面積
  const avgDecoR = baseDim * 0.04;        // 平均半徑
  const DECORATIVE_COUNT = Math.max(20, Math.min(60,
    Math.round(targetArea / (Math.PI * avgDecoR * avgDecoR))
  ));
  for (let i = 0; i < DECORATIVE_COUNT; i++) {
    const r = baseDim * (0.018 + Math.random() * 0.045);
    const color = DECORATIVE_COLORS[i % DECORATIVE_COLORS.length];
    bubbles.push({
      kind: 'decorative',
      r,
      color,
      x: Math.random() * W,
      y: Math.random() * H,
    });
  }

  packBubbles(bubbles, W, H, cx, cy);

  bubbles.forEach((b, i) => {
    svg.appendChild(makeBubble({ ...b, delay: i * 0.015 }));
  });
}

// circle packing:跑 N 次迭代解決重疊與邊界
// 策略:主泡泡輕微往中心、裝飾泡泡輕微往邊緣,以填滿全版面
function packBubbles(bubbles, W, H, cx, cy) {
  const ITER = 700;
  const margin = 18;
  const gap = 5;
  // 主泡泡聚中央(targetMain ~30% 短邊)、裝飾泡泡推離中心(targetDeco ~45% 短邊)
  const baseDim = Math.min(W, H);
  const targetMain = baseDim * 0.30;
  const targetDeco = baseDim * 0.45;

  for (let t = 0; t < ITER; t++) {
    for (const b of bubbles) {
      if (b.kind === 'main') {
        // 主泡泡:輕中心引力,聚向中心
        b.x += (cx - b.x) * 0.003;
        b.y += (cy - b.y) * 0.003;
      } else {
        // 裝飾泡泡:推離中心至 targetDeco 半徑,散布到邊緣
        const dx = b.x - cx, dy = b.y - cy;
        const dist = Math.hypot(dx, dy) || 1;
        const force = (targetDeco - dist) * 0.0035;
        const ux = dx / dist, uy = dy / dist;
        b.x += ux * force;
        b.y += uy * force;
      }
    }
    // 互斥(O(n²) 對 ~40 個圓 OK)
    for (let i = 0; i < bubbles.length; i++) {
      const a = bubbles[i];
      for (let j = i + 1; j < bubbles.length; j++) {
        const b = bubbles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const min = a.r + b.r + gap;
        if (dist < min) {
          const overlap = (min - dist) / 2;
          const ux = dx / dist, uy = dy / dist;
          a.x += ux * overlap;
          a.y += uy * overlap;
          b.x -= ux * overlap;
          b.y -= uy * overlap;
        }
      }
    }
    // 邊界限制
    for (const b of bubbles) {
      b.x = Math.max(margin + b.r, Math.min(W - margin - b.r, b.x));
      b.y = Math.max(margin + b.r, Math.min(H - margin - b.r, b.y));
    }
  }

  // 重心校正:大泡泡權重高,平移整個 layout 讓視覺重心對齊畫面中心
  let cmx = 0, cmy = 0, totalArea = 0;
  for (const b of bubbles) {
    const a = b.r * b.r;
    cmx += b.x * a;
    cmy += b.y * a;
    totalArea += a;
  }
  cmx /= totalArea;
  cmy /= totalArea;
  const shiftX = cx - cmx;
  const shiftY = cy - cmy;
  for (const b of bubbles) {
    b.x = Math.max(margin + b.r, Math.min(W - margin - b.r, b.x + shiftX));
    b.y = Math.max(margin + b.r, Math.min(H - margin - b.r, b.y + shiftY));
  }
}

function makeBubble({ kind, x, y, r, label, color, parent, topTags, count, delay = 0 }) {
  const g = document.createElementNS(SVG_NS, 'g');
  const classes = ['bubble', `bubble-${kind}`];
  if (parent) classes.push('is-clickable');
  g.setAttribute('class', classes.join(' '));
  g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  g.style.animationDelay = delay + 's';

  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('r', r);
  circle.setAttribute('fill', color);
  g.appendChild(circle);

  if (kind === 'main') {
    // 標籤字級依 r 線性縮放
    const fontSize = Math.max(12, Math.min(20, r * 0.30));
    const labelText = document.createElementNS(SVG_NS, 'text');
    labelText.setAttribute('class', 'bubble-label');
    labelText.setAttribute('y', '5');
    labelText.setAttribute('font-size', fontSize.toFixed(1));
    labelText.textContent = label;
    g.appendChild(labelText);

    // beta 母題加 BETA 標記(右下方)
    if (parent && BETA_PARENTS.has(parent)) {
      const beta = document.createElementNS(SVG_NS, 'text');
      beta.setAttribute('class', 'bubble-beta-mark');
      beta.setAttribute('y', (r * 0.7).toFixed(1));
      beta.setAttribute('x', '0');
      beta.setAttribute('font-size', Math.max(9, r * 0.16).toFixed(1));
      beta.textContent = 'BETA';
      g.appendChild(beta);
    }

    const title = document.createElementNS(SVG_NS, 'title');
    const betaSuffix = parent && BETA_PARENTS.has(parent) ? ' [BETA — 校對中]' : '';
    const tagLine = (topTags && topTags.length > 0)
      ? `\n常見 tag:${topTags.join('、')}`
      : '';
    const countLine = count ? `\n${count} 個節點` : '';
    title.textContent = parent
      ? `${parent}${betaSuffix}${countLine}${tagLine}\n(點擊進入該母題情境)`
      : label;
    g.appendChild(title);

    if (parent) {
      g.setAttribute('role', 'button');
      g.setAttribute('tabindex', '0');
      const enterScenario = () => {
        // 點泡泡進入該母題的「情境」視圖(取代原本直接跳條文庫)
        setFilter({ parent, expense: null, category: null, tag: null, scenario: null });
        switchView('scenarios');
      };
      g.addEventListener('click', enterScenario);
      g.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          enterScenario();
        }
      });
    }
  }

  return g;
}

function switchView(name) {
  document.body.dataset.view = name;
  document.querySelectorAll('.view-tab').forEach(b =>
    b.classList.toggle('is-active', b.dataset.view === name)
  );
  ['library', 'overview', 'graph', 'scenarios'].forEach(v => {
    const $v = document.getElementById('view-' + v);
    if ($v) $v.hidden = v !== name;
  });
  if (name === 'scenarios') renderScenariosView();
  if (name === 'overview') renderOverview();
  if (name === 'graph') renderGraph();
  else stopGraphSimulation();
}

// ─────────────────────────────────────────────
// 核銷情境視圖
// ─────────────────────────────────────────────

function renderScenariosView() {
  const $grid = document.getElementById('scenarios-grid');
  const $empty = document.getElementById('scenarios-empty');
  const $title = document.getElementById('scenarios-title');
  const $subtitle = document.getElementById('scenarios-subtitle');
  const $scopeLabel = document.getElementById('scenarios-scope-label');
  const $scopeClear = document.getElementById('scenarios-scope-clear');
  const $quickStrip = document.getElementById('scenarios-quick-strip');
  if (!$grid) return;

  const scope = state.filter.parent;
  const expenseFilterRaw = state.filter.expense;
  // expense filter 可能含母題後綴:「交通費__國內旅費」格式 → 同時過濾 expense + parent
  let expenseFilterName = null;
  let expenseFilterParent = null;
  if (expenseFilterRaw) {
    const parts = expenseFilterRaw.split('__');
    expenseFilterName = parts[0];
    expenseFilterParent = parts[1] || null;
  }
  const inScope = scope
    ? state.scenarios.filter(sc => sc.parent === scope)
    : state.scenarios;
  const visible = expenseFilterName
    ? inScope.filter(sc => (sc.expense || '其他') === expenseFilterName
        && (!expenseFilterParent || sc.parent === expenseFilterParent))
    : inScope;

  // 標題與 scope toolbar
  if (scope) {
    $title.textContent = `${scope} · 常見核銷情境`;
    $subtitle.textContent = '點選下方卡片直接帶到對應的條文與 Q&A;或回上一層瀏覽其他母題。';
    $scopeLabel.textContent = `範圍:${scope}${BETA_PARENTS.has(scope) ? ' (BETA)' : ''}`;
    $scopeLabel.hidden = false;
    $scopeClear.hidden = false;
  } else {
    $title.textContent = '常見核銷情境';
    $subtitle.textContent = '用使用者語言列出實務常見問題,點選後直接帶到對應的條文與 Q&A。';
    $scopeLabel.hidden = true;
    $scopeClear.hidden = true;
  }

  // 計算可見 scenario 的 expense 分布 (供下拉選單計數)
  // 統計每個 expense 在每個 parent 下的數量,用以判斷哪些跨母題需拆分
  const expenseParentCount = new Map(); // key: expense → Map(parent → count)
  const expenseTotalCount = new Map();  // key: expense → total
  for (const sc of inScope) {
    const e = sc.expense || '其他';
    if (!expenseParentCount.has(e)) expenseParentCount.set(e, new Map());
    const pmap = expenseParentCount.get(e);
    pmap.set(sc.parent, (pmap.get(sc.parent) || 0) + 1);
    expenseTotalCount.set(e, (expenseTotalCount.get(e) || 0) + 1);
  }
  // 情境視圖專屬類別排序(具體費用 → 一般行政 → 通則 → 特殊地區 → 其他)。
  // 不沿用 EXPENSE_LAYER 順序(後者把 大陸港澳 放最前作為條文庫過濾優先級),
  // 情境視圖以「使用者瀏覽常見度」排序更直覺,大陸港澳屬特殊情境放後段。
  const expenseOrderForFilter = ['交通費','住宿費','雜費','出國進修','生活費','手續費','保險費','行政費','禮品交際及雜費','收據與發票','採購結報','系統化結報','補助與分攤','差旅費結報','酬勞與會議','通則與其他','大陸港澳','其他'];
  const sortedExpenses = [...expenseParentCount.keys()].sort((a, b) => {
    const ai = expenseOrderForFilter.indexOf(a);
    const bi = expenseOrderForFilter.indexOf(b);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
  // 母題簡稱(用於 dropdown 後綴):國內旅費 → 國內 / 國外旅費 → 國外 / 支出憑證與結報 → 支出
  const parentShort = { '國內旅費': '國內', '國外旅費': '國外', '支出憑證與結報': '支出' };
  const parentOrder = ['國內旅費','國外旅費','支出憑證與結報'];
  const dropdownOptions = [`<option value="">📑 全部 (${inScope.length})</option>`];
  for (const e of sortedExpenses) {
    const pmap = expenseParentCount.get(e);
    // 無 scope 時且該 expense 跨多個母題 → 拆分為多個選項
    if (!scope && pmap.size > 1) {
      const parents = [...pmap.keys()].sort((x, y) => parentOrder.indexOf(x) - parentOrder.indexOf(y));
      for (const p of parents) {
        const val = `${e}__${p}`;
        const sel = expenseFilterRaw === val ? ' selected' : '';
        const short = parentShort[p] || p;
        dropdownOptions.push(`<option value="${esc(val)}"${sel}>${esc(e)}(${esc(short)}) (${pmap.get(p)})</option>`);
      }
    } else {
      // 單一母題 (或有 scope 時) → 單一選項
      const sel = expenseFilterRaw === e ? ' selected' : '';
      dropdownOptions.push(`<option value="${esc(e)}"${sel}>${esc(e)} (${expenseTotalCount.get(e)})</option>`);
    }
  }
  const dropdownHtml = `
    <span class="qstrip-divider" aria-hidden="true">|</span>
    <label class="qstrip-filter-label" for="scenarios-filter-select">📂 類別</label>
    <select id="scenarios-filter-select" class="qstrip-filter-select" aria-label="依類別過濾">
      ${dropdownOptions.join('')}
    </select>
  `;

  // 橫式快捷查詢條 + 類別下拉:全部/國外scope 含 3 按鈕,其他 scope 只有下拉
  if ($quickStrip) {
    $quickStrip.hidden = false;
    const showButtons = !scope || scope === '國外旅費';
    const buttonsHtml = showButtons ? `
      <span class="qstrip-label">🚀 最新標準表:</span>
      <button class="qstrip-btn" data-jump="B-國外旅費-003" type="button" title="6 區域 524 城市,含跨地區搜尋">
        <span class="qstrip-icon">💰</span><span class="qstrip-text">日支生活費(全球)</span>
      </button>
      <button class="qstrip-btn" data-jump="B-國外旅費-002" type="button" title="19 城市,含香港澳門">
        <span class="qstrip-icon">🇨🇳</span><span class="qstrip-text">大陸港澳日支</span>
      </button>
      <button class="qstrip-btn" data-jump="B-國外旅費-006" type="button" title="一般險 / 申根險試算">
        <span class="qstrip-icon">🛡️</span><span class="qstrip-text">外交部保險表</span>
      </button>
    ` : '';
    $quickStrip.innerHTML = buttonsHtml + dropdownHtml;
    for (const btn of $quickStrip.querySelectorAll('.qstrip-btn')) {
      btn.addEventListener('click', () => {
        const id = btn.dataset.jump;
        if (!id) return;
        const node = state.nodeById?.get(id);
        switchView('library');
        setFilter({
          parent: node?.parent || '國外旅費',
          expense: null,
          category: null,
          tag: null,
          scenario: null,
        });
        openDrawer(id);
      });
    }
    const $select = document.getElementById('scenarios-filter-select');
    $select?.addEventListener('change', () => {
      setFilter({ expense: $select.value || null });
      renderScenariosView();
    });
  }

  $grid.innerHTML = '';

  if (visible.length === 0) {
    // 空狀態:該母題/類別還沒建立情境,引導去條文庫
    $grid.hidden = true;
    $empty.hidden = false;
    const isBeta = scope && BETA_PARENTS.has(scope);
    const labelExpense = expenseFilterName
      ? `「${expenseFilterName}${expenseFilterParent ? '(' + (parentShort[expenseFilterParent] || expenseFilterParent) + ')' : ''}」類別`
      : '';
    const where = labelExpense || (scope || '此母題');
    $empty.innerHTML = `
      <p><strong>${esc(where)}</strong> 尚未建立情境卡。</p>
      ${isBeta ? '<p style="font-size:13px">(本類別仍在校對中)</p>' : ''}
      <p>你可以:</p>
      <p>
        ${expenseFilterName ? '<button class="link-btn" id="empty-clear-expense">↩ 看「全部」類別</button> &nbsp; · &nbsp; ' : ''}
        <button class="link-btn" id="empty-go-library">📑 直接前往條文庫瀏覽</button>
        ${scope ? '&nbsp; · &nbsp; <button class="link-btn" id="empty-show-all">🎯 看全部母題的情境</button>' : ''}
      </p>
    `;
    document.getElementById('empty-clear-expense')?.addEventListener('click', () => {
      setFilter({ expense: null });
      renderScenariosView();
    });
    document.getElementById('empty-go-library')?.addEventListener('click', () => {
      switchView('library');
    });
    document.getElementById('empty-show-all')?.addEventListener('click', () => {
      setFilter({ parent: null, expense: null, category: null, tag: null });
      renderScenariosView();
    });
    return;
  }
  $grid.hidden = false;
  $empty.hidden = true;

  // 分組:依 expense 類別(scope 內) 或 母題 + expense (跨母題)
  // expense 已選定時只剩一個分組,但仍保留 group header 顯示類別說明
  const groups = new Map();
  for (const sc of visible) {
    const expense = sc.expense || '其他';
    const key = scope ? expense : `${sc.parent}|${expense}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sc);
  }

  // section 排序:沿用上方下拉選單同一順序(大陸港澳放最後,屬特殊情境)
  const expenseOrder = expenseOrderForFilter;
  function expRank(name) {
    const i = expenseOrder.indexOf(name);
    return i < 0 ? 999 : i;
  }
  function keyRank(k) {
    if (scope) return expRank(k);
    const [p, e] = k.split('|');
    const parentOrder = ['國內旅費','國外旅費','支出憑證與結報'];
    const pi = parentOrder.indexOf(p);
    return (pi < 0 ? 999 : pi) * 100 + expRank(e);
  }
  const sortedKeys = [...groups.keys()].sort((a, b) => keyRank(a) - keyRank(b));

  for (const key of sortedKeys) {
    const items = groups.get(key);
    let groupTitle, groupSubtitle = '';
    if (scope) {
      groupTitle = key;
      groupSubtitle = EXPENSE_TOOLTIP[key] || '';
    } else {
      const [p, e] = key.split('|');
      groupTitle = `${p} · ${e}`;
      groupSubtitle = EXPENSE_TOOLTIP[e] || '';
    }
    const $section = el('section', { class: 'scenarios-group' });
    $section.innerHTML = `
      <h3 class="scenarios-group-title" title="${esc(groupSubtitle)}">${esc(groupTitle)} <span class="scenarios-group-count">${items.length}</span></h3>
      <div class="scenarios-group-grid"></div>
    `;
    const $sub = $section.querySelector('.scenarios-group-grid');

    for (const sc of items) {
      const matchedCount = countScenarioMatches(sc);
      const hasFlow = sc.flow && sc.flow.start && sc.flow.questions;
      const flowMark = hasFlow ? '<span class="scenario-flow-badge" title="此情境提供條件問答">🤔 條件問答</span>' : '';
      const $c = el('div', {
        class: 'scenario-card' + (hasFlow ? ' has-flow' : ''),
        role: 'listitem',
        'data-id': sc.id,
        'data-has-flow': hasFlow ? '1' : '0',
      });
      const parentTag = !scope && sc.parent
        ? `<span class="card-tag" style="margin-left:auto">${esc(sc.parent)}</span>`
        : '';
      $c.innerHTML = `
        <div class="scenario-icon">${esc(sc.icon || '📌')}</div>
        <h3 class="scenario-title">${esc(sc.title)} ${flowMark}</h3>
        <p class="scenario-subtitle">${esc(sc.subtitle || '')}</p>
        <div class="scenario-meta">
          <span class="scenario-count">${matchedCount} 張相關卡</span>
          ${parentTag}
          <span class="scenario-arrow">查看 →</span>
        </div>
      `;
      $c.onclick = () => applyScenario(sc.id);
      $c.tabIndex = 0;
      $c.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          applyScenario(sc.id);
        }
      });
      $sub.appendChild($c);
    }
    $grid.appendChild($section);
  }
}

function countScenarioMatches(sc) {
  const primary = new Set(sc.primary_ids || []);
  const tags = new Set(sc.tags || []);
  let n = 0;
  for (const node of state.nodes) {
    if (sc.parent && node.parent !== sc.parent) continue;
    if (primary.has(node.id)) { n++; continue; }
    if ((node.tags || []).some(t => tags.has(t))) n++;
  }
  return n;
}

function applyScenario(scenarioId) {
  const sc = state.scenariosById.get(scenarioId);
  if (!sc) return;
  // 切情境時重置 flow 進度
  state.flowAnswers = {};
  state.flowConclusion = null;
  switchView('library');
  setFilter({
    parent: sc.parent || null,
    expense: null,
    category: null,
    tag: null,
    scenario: scenarioId,
  });
  // 寫進 hash 方便分享
  history.replaceState(null, '', '#scenario=' + encodeURIComponent(scenarioId));
}

function clearScenario() {
  setFilter({ scenario: null });
  state.flowAnswers = {};
  state.flowConclusion = null;
  if (location.hash.startsWith('#scenario=')) {
    history.replaceState(null, '', location.pathname);
  }
}

// 情境細節面板:附件、簽核、條件問答 flow
function renderScenarioDetail() {
  const $box = document.getElementById('scenario-detail');
  if (!$box) return;
  const sid = state.filter.scenario;
  if (!sid) { $box.hidden = true; $box.innerHTML = ''; return; }
  const sc = state.scenariosById.get(sid);
  if (!sc) { $box.hidden = true; $box.innerHTML = ''; return; }

  const blocks = [];

  if (sc.flow) {
    blocks.push(renderFlowBlock(sc));
  }
  if (sc.attachments && sc.attachments.length) {
    blocks.push(`
      <section class="scenario-block">
        <h4>📎 所需附件</h4>
        <ul>${sc.attachments.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
      </section>
    `);
  }
  if (sc.approvers && sc.approvers.length) {
    blocks.push(`
      <section class="scenario-block">
        <h4>✍️ 簽核層級</h4>
        <ol>${sc.approvers.map(a => `<li>${esc(a)}</li>`).join('')}</ol>
      </section>
    `);
  }

  if (blocks.length === 0) { $box.hidden = true; $box.innerHTML = ''; return; }

  $box.innerHTML = blocks.join('');
  $box.hidden = false;
  bindFlowEvents($box, sc);
}

function renderFlowBlock(sc) {
  const flow = sc.flow;
  const answers = state.flowAnswers || {};
  const conclusionId = state.flowConclusion;

  if (conclusionId && flow.conclusions && flow.conclusions[conclusionId]) {
    const c = flow.conclusions[conclusionId];
    const refsHtml = (c.refs || []).map(rid => {
      const n = state.nodeById.get(rid);
      return n
        ? `<a class="ref-jump" data-jump="${esc(rid)}">${esc(n.title)} <small>(${esc(rid)})</small></a>`
        : `<span class="ref-missing">${esc(rid)}</span>`;
    }).join('、');
    const noteHtml = c.note ? `<p class="conclusion-note">${esc(c.note)}</p>` : '';
    const limitHtml = c.limit ? `<p class="conclusion-limit"><strong>金額上限:</strong>${esc(c.limit)}</p>` : '';
    return `
      <section class="scenario-block scenario-conclusion">
        <h4>✅ 結論</h4>
        <h5>${esc(c.title)}</h5>
        ${limitHtml}
        ${noteHtml}
        ${refsHtml ? `<p class="conclusion-refs"><strong>法源:</strong>${refsHtml}</p>` : ''}
        <button class="link-btn flow-restart" type="button">↩ 重新作答</button>
      </section>
    `;
  }

  // 找下一題:從 start 沿著答過的選項走,看落到哪一題
  let qid = flow.start;
  const path = [];
  while (qid && flow.questions[qid]) {
    const q = flow.questions[qid];
    const ans = answers[qid];
    path.push({ qid, q, ans });
    if (ans === undefined) break;
    const opt = q.options[ans];
    if (!opt) break;
    if (opt.conclude) {
      // 不該到這(已被上面 conclusionId 攔截),保險起見
      break;
    }
    qid = opt.next;
  }

  const items = path.map(({ qid, q, ans }) => {
    const optsHtml = q.options.map((opt, i) => {
      const isAns = ans === i;
      return `<button class="flow-option${isAns ? ' is-selected' : ''}" data-q="${esc(qid)}" data-opt="${i}" type="button">${esc(opt.label)}</button>`;
    }).join('');
    const hint = q.hint ? `<p class="flow-hint">${esc(q.hint)}</p>` : '';
    return `
      <div class="flow-step">
        <p class="flow-question">Q. ${esc(q.label)}</p>
        ${hint}
        <div class="flow-options">${optsHtml}</div>
      </div>
    `;
  }).join('');

  const restartBtn = path.length > 1
    ? `<button class="link-btn flow-restart" type="button">↩ 重新作答</button>`
    : '';

  return `
    <section class="scenario-block scenario-flow">
      <h4>🤔 條件問答</h4>
      ${items}
      ${restartBtn}
    </section>
  `;
}

function bindFlowEvents($box, sc) {
  $box.querySelectorAll('.flow-option').forEach(btn => {
    btn.onclick = () => {
      const qid = btn.dataset.q;
      const optIdx = +btn.dataset.opt;
      const opt = sc.flow.questions[qid].options[optIdx];
      state.flowAnswers = { ...(state.flowAnswers || {}), [qid]: optIdx };
      if (opt.conclude) {
        state.flowConclusion = opt.conclude;
      } else {
        state.flowConclusion = null;
      }
      renderScenarioDetail();
    };
  });
  $box.querySelectorAll('.flow-restart').forEach(btn => {
    btn.onclick = () => {
      state.flowAnswers = {};
      state.flowConclusion = null;
      renderScenarioDetail();
    };
  });
  $box.querySelectorAll('.ref-jump').forEach(a => {
    a.onclick = (ev) => { ev.preventDefault(); openDrawer(a.dataset.jump); };
  });
}

// ─────────────────────────────────────────────
// 關聯圖(自製力導向,純 SVG)
// ─────────────────────────────────────────────

const graphState = {
  nodes: [],
  links: [],
  rafId: null,
  alpha: 1,         // 模擬「能量」,逐 tick 衰減
  filter: { cats: new Set(['A', 'B', 'C', 'D']), rels: new Set(['cites', 'explains', 'answers']),
            showInferred: true, showIsolated: true, showLabels: true },
  initialized: false,
  drag: null,       // { node, offsetX, offsetY }
  lastBounds: null, // 上次 packing 用的 inner box,供尺寸變更偵測
};

// 計算可用畫布範圍。右側「過濾」面板與左上「目前範圍」banner 會壓住部分區域,
// 用實際 DOM 矩形計算可用 inner box(left, top, right, bottom)以避免節點/標籤
// 跑到面板底下或畫布外。額外 PADDING_X 預留標籤寬度(節點標題置中於圓上方,
// 約 ±60px),PADDING_Y 預留 label 高度。
function computeGraphBounds() {
  const svg = document.getElementById('graph-svg');
  const svgRect = svg.getBoundingClientRect();
  const PADDING_X = 70;   // 標籤約 10 字 × CJK 寬,單側預留
  const PADDING_Y = 24;   // 標籤位於節點上方 -14px,加自身高度
  let left = PADDING_X;
  let top = PADDING_Y;
  let right = svgRect.width - PADDING_X;
  let bottom = svgRect.height - PADDING_Y;

  // 右側過濾面板:讓出右側空間給面板,但只有在 SVG 夠寬時才扣除;
  // 若扣除後可用寬度過窄(<面板寬度的 1.4 倍),就放棄避讓 — 這時節點寧可
  // 跑到面板下方(使用者仍可拖曳),也不要被擠成一條直線。
  const panel = document.querySelector('.graph-panel');
  if (panel) {
    const r = panel.getBoundingClientRect();
    if (r.width > 0) {
      const panelLeft = r.left - svgRect.left - 12;
      const remainingW = panelLeft - left;
      if (panelLeft < right && remainingW >= r.width * 1.4) {
        right = panelLeft;
      }
    }
  }
  // 左上 scope banner
  const banner = document.getElementById('graph-scope-banner');
  if (banner && !banner.hidden) {
    const r = banner.getBoundingClientRect();
    if (r.height > 0) {
      const bannerBottom = r.bottom - svgRect.top + 8;
      if (bannerBottom > top) top = bannerBottom;
    }
  }
  return { left, top, right, bottom, w: right - left, h: bottom - top };
}

function renderGraph() {
  const svg = document.getElementById('graph-svg');
  if (!svg) return;
  const b = computeGraphBounds();
  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;

  if (!graphState.initialized) {
    // 初始化節點:從 nodes.json 來,給較開散的初始位置避免堆疊
    const minDim = Math.min(b.w, b.h);
    const initR = minDim * 0.32;
    graphState.nodes = state.nodes.map((n, i) => {
      const angle = (i / state.nodes.length) * Math.PI * 2 + Math.random() * 0.3;
      const radius = initR * (0.7 + Math.random() * 0.4);
      return {
        id: n.id,
        cat: n.id.split('-')[0],
        parent: n.parent,
        title: n.title,
        type: n.type,
        reviewed: !!n.reviewed,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        vx: 0, vy: 0,
        fx: null, fy: null,
      };
    });
    const idIdx = new Map(graphState.nodes.map((n, i) => [n.id, i]));
    graphState.links = state.edges
      .filter(e => idIdx.has(e.from) && idIdx.has(e.to))
      .map(e => ({
        source: graphState.nodes[idIdx.get(e.from)],
        target: graphState.nodes[idIdx.get(e.to)],
        relation: e.relation,
        inferred: !!e.inferred,
      }));
    // 同步跑 packing 收斂(無動畫,初始打開即顯示穩定布局)
    runPackingSync(b, 320);
    graphState.lastBounds = b;
    graphState.initialized = true;
    bindGraphInteraction();
  } else {
    // 已初始化:若 SVG 大小相對上次 packing 改變顯著(>15% 任一維度),
    // 重新分布節點以利用新空間;否則只夾回邊界。
    const last = graphState.lastBounds;
    const changedSignificantly = !last ||
      Math.abs(b.w - last.w) / Math.max(last.w, 1) > 0.15 ||
      Math.abs(b.h - last.h) / Math.max(last.h, 1) > 0.15;
    if (changedSignificantly && b.w > 0 && b.h > 0) {
      // 把節點按比例縮放到新 box,然後跑短迭代 re-pack
      const sx = b.w / Math.max(last ? last.w : b.w, 1);
      const sy = b.h / Math.max(last ? last.h : b.h, 1);
      const lastCx = last ? (last.left + last.right) / 2 : (b.left + b.right) / 2;
      const lastCy = last ? (last.top + last.bottom) / 2 : (b.top + b.bottom) / 2;
      const cx = (b.left + b.right) / 2;
      const cy = (b.top + b.bottom) / 2;
      for (const n of graphState.nodes) {
        n.x = cx + (n.x - lastCx) * sx;
        n.y = cy + (n.y - lastCy) * sy;
        n.vx = 0; n.vy = 0;
        if (n.fx !== null) n.fx = n.x;
        if (n.fy !== null) n.fy = n.y;
      }
      runPackingSync(b, 80);
      graphState.lastBounds = b;
    } else {
      clampGraphNodesToBounds();
    }
  }
  renderGraphElements();
  paintGraph();
  updateGraphScopeBanner();
}

// 同步力 packing(取代 RAF 動畫,讓初始 layout 一次到位)
// 參數 b:由 computeGraphBounds() 算出的可用 inner box。
function runPackingSync(b, iter) {
  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;
  const nodes = graphState.nodes;
  const links = graphState.links;
  for (let t = 0; t < iter; t++) {
    // 中心引力(略增強,避免外圍節點漂出 inner box)
    for (const n of nodes) {
      if (n.fx !== null) continue;
      n.vx += (cx - n.x) * 0.005;
      n.vy += (cy - n.y) * 0.005;
    }
    // 互斥(O(n²))
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b2 = nodes[j];
        const dx = a.x - b2.x;
        const dy = a.y - b2.y;
        const distSq = dx * dx + dy * dy + 0.5;
        const dist = Math.sqrt(distSq);
        const force = 5000 / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (a.fx === null) { a.vx += fx; a.vy += fy; }
        if (b2.fx === null) { b2.vx -= fx; b2.vy -= fy; }
      }
    }
    // 連結拉力
    for (const l of links) {
      const dx = l.target.x - l.source.x;
      const dy = l.target.y - l.source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const ideal = 110;
      const f = (dist - ideal) * 0.04;
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      if (l.source.fx === null) { l.source.vx += fx; l.source.vy += fy; }
      if (l.target.fx === null) { l.target.vx -= fx; l.target.vy -= fy; }
    }
    // 阻尼 + 位置更新 + 邊界限制(以 inner box 為界)
    for (const n of nodes) {
      if (n.fx !== null) continue;
      n.vx *= 0.82;
      n.vy *= 0.82;
      n.x += n.vx;
      n.y += n.vy;
      // 邊界外加一道反向推力,避免節點貼邊
      if (n.x < b.left)   { n.x = b.left;   n.vx = Math.abs(n.vx) * 0.3; }
      if (n.x > b.right)  { n.x = b.right;  n.vx = -Math.abs(n.vx) * 0.3; }
      if (n.y < b.top)    { n.y = b.top;    n.vy = Math.abs(n.vy) * 0.3; }
      if (n.y > b.bottom) { n.y = b.bottom; n.vy = -Math.abs(n.vy) * 0.3; }
    }
  }
}

// 把所有節點重新夾回可用範圍內(用於 scope 變更或視窗 resize)
function clampGraphNodesToBounds() {
  const b = computeGraphBounds();
  for (const n of graphState.nodes) {
    n.x = Math.max(b.left, Math.min(b.right, n.x));
    n.y = Math.max(b.top, Math.min(b.bottom, n.y));
    if (n.fx !== null) n.fx = n.x;
    if (n.fy !== null) n.fy = n.y;
  }
}

function renderGraphElements() {
  const $links = document.getElementById('graph-links');
  const $nodes = document.getElementById('graph-nodes');
  $links.innerHTML = '';
  $nodes.innerHTML = '';

  // 連結
  for (const l of graphState.links) {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'graph-link');
    // 推斷邊用基底 relation(去掉 _inferred 後綴)以共用 dasharray 規則
    const baseRel = l.relation.replace(/_inferred$/, '');
    line.setAttribute('data-rel', baseRel);
    if (l.inferred) line.setAttribute('data-inferred', 'true');
    line.setAttribute('data-from', l.source.id);
    line.setAttribute('data-to', l.target.id);
    $links.appendChild(line);
    l._el = line;
  }

  // 節點
  for (const n of graphState.nodes) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'graph-node' + (n.reviewed ? ' is-reviewed' : ''));
    g.setAttribute('data-cat', n.cat);
    g.setAttribute('data-id', n.id);
    g.setAttribute('tabindex', '0');

    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('r', n.cat === 'A' ? 9 : 7);
    g.appendChild(c);

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('class', 'graph-label');
    label.setAttribute('y', -14);
    label.textContent = shortLabel(n.title);
    g.appendChild(label);

    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = `${n.id} · ${n.title}`;
    g.appendChild(title);

    $nodes.appendChild(g);
    n._el = g;
  }

  applyGraphFilter();
}

function shortLabel(title) {
  // 截斷長標題,以利圖上閱讀
  const t = String(title).replace(/^(第[一二三四五六七八九十]+條)\s*/, (_, m) => m + ' ');
  return t.length > 10 ? t.slice(0, 10) + '…' : t;
}

// ── 渲染 paint(靜態,無動畫) ──

function paintGraph() {
  for (const n of graphState.nodes) {
    if (n._el) n._el.setAttribute('transform', `translate(${n.x.toFixed(2)},${n.y.toFixed(2)})`);
  }
  for (const l of graphState.links) {
    if (!l._el) continue;
    l._el.setAttribute('x1', l.source.x.toFixed(2));
    l._el.setAttribute('y1', l.source.y.toFixed(2));
    l._el.setAttribute('x2', l.target.x.toFixed(2));
    l._el.setAttribute('y2', l.target.y.toFixed(2));
  }
}

// 廢棄(改為同步 packing);保留 stub 避免外部呼叫出錯
function startGraphSimulation() { /* no-op */ }
function stopGraphSimulation() { /* no-op */ }

// ── 過濾 ──

function applyGraphFilter() {
  const f = graphState.filter;
  const scope = state.filter.parent;  // 比照條文庫 scope:依母題過濾關聯圖

  // 步驟 1:scope 過濾。若有 scope,只顯示該母題節點 + 跨母題鄰居
  let inScope;
  if (scope) {
    inScope = new Set(graphState.nodes.filter(n => n.parent === scope).map(n => n.id));
    // 加上有跨母題邊的鄰居
    for (const l of graphState.links) {
      if (inScope.has(l.source.id)) inScope.add(l.target.id);
      if (inScope.has(l.target.id)) inScope.add(l.source.id);
    }
  } else {
    inScope = null;  // null = 全部顯示
  }

  // 步驟 2:依過濾條件決定每條邊與每個節點的可見性
  const linkedIds = new Set();
  for (const l of graphState.links) {
    const baseRel = l.relation.replace(/_inferred$/, '');
    const scopeOk = !inScope || (inScope.has(l.source.id) && inScope.has(l.target.id));
    const visible = scopeOk
                    && f.cats.has(l.source.cat) && f.cats.has(l.target.cat)
                    && f.rels.has(baseRel)
                    && (!l.inferred || f.showInferred);
    if (l._el) l._el.style.display = visible ? '' : 'none';
    if (visible) {
      linkedIds.add(l.source.id);
      linkedIds.add(l.target.id);
    }
  }
  for (const n of graphState.nodes) {
    if (!n._el) continue;
    const scopeOk = !inScope || inScope.has(n.id);
    const catVisible = f.cats.has(n.cat);
    const isolated = !linkedIds.has(n.id);
    const visible = scopeOk && catVisible && (f.showIsolated || !isolated);
    n._el.style.display = visible ? '' : 'none';
    const label = n._el.querySelector('.graph-label');
    if (label) label.style.display = f.showLabels ? '' : 'none';
  }
}

function updateGraphScopeBanner() {
  const banner = document.getElementById('graph-scope-banner');
  if (!banner) return;
  const scope = state.filter.parent;
  if (scope) {
    document.getElementById('graph-scope-name').textContent = scope;
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
  applyGraphFilter();
}

// ── 互動 ──

function bindGraphInteraction() {
  const svg = document.getElementById('graph-svg');
  const tooltip = document.getElementById('graph-tooltip');

  // 拖曳
  svg.addEventListener('mousedown', (ev) => {
    const g = ev.target.closest('.graph-node');
    if (!g) return;
    const node = graphState.nodes.find(n => n.id === g.dataset.id);
    if (!node) return;
    const pt = svgPoint(svg, ev);
    graphState.drag = { node, dx: pt.x - node.x, dy: pt.y - node.y, moved: false };
    node.fx = node.x;
    node.fy = node.y;
    g.classList.add('is-dragging');
    ev.preventDefault();
  });
  window.addEventListener('mousemove', (ev) => {
    if (!graphState.drag) return;
    const pt = svgPoint(svg, ev);
    const b = computeGraphBounds();
    const node = graphState.drag.node;
    // 限制拖曳範圍在可用畫布內,避免拖出邊界或滑進過濾面板下方
    node.fx = Math.max(b.left, Math.min(b.right,  pt.x - graphState.drag.dx));
    node.fy = Math.max(b.top,  Math.min(b.bottom, pt.y - graphState.drag.dy));
    node.x = node.fx;
    node.y = node.fy;
    graphState.drag.moved = true;
    paintGraph();
  });
  window.addEventListener('mouseup', () => {
    if (!graphState.drag) return;
    const { node, moved } = graphState.drag;
    node._el?.classList.remove('is-dragging');
    if (!moved) {
      // 點擊節點:跳到條文庫並開抽屜
      switchView('library');
      const n = state.nodeById.get(node.id);
      if (n) setFilter({ parent: n.parent, category: null, tag: null });
      openDrawer(node.id);
    } else {
      // 拖曳完釋放固定(節點停在新位置)
      node.fx = null;
      node.fy = null;
    }
    graphState.drag = null;
  });

  // Hover tooltip + 高亮一階關聯
  svg.addEventListener('mouseover', (ev) => {
    const g = ev.target.closest('.graph-node');
    if (!g) return;
    const node = graphState.nodes.find(n => n.id === g.dataset.id);
    if (!node) return;
    const meta = state.nodeById.get(node.id);
    tooltip.innerHTML = `<strong>${esc(meta?.title || node.title)}</strong>
      <div class="meta">${esc(node.id)} · ${esc(node.type || '')} · ${esc(node.parent)}</div>
      ${meta?.summary ? `<div>${esc(meta.summary.slice(0, 60))}${meta.summary.length > 60 ? '…' : ''}</div>` : ''}`;
    tooltip.hidden = false;
    highlightNeighbors(node.id, true);
  });
  svg.addEventListener('mousemove', (ev) => {
    if (tooltip.hidden) return;
    const rect = svg.getBoundingClientRect();
    tooltip.style.left = (ev.clientX - rect.left + 14) + 'px';
    tooltip.style.top = (ev.clientY - rect.top + 14) + 'px';
  });
  svg.addEventListener('mouseout', (ev) => {
    if (ev.relatedTarget && ev.relatedTarget.closest && ev.relatedTarget.closest('.graph-node')) return;
    tooltip.hidden = true;
    highlightNeighbors(null, false);
  });

  // 過濾 checkbox
  document.querySelectorAll('[data-filter-cat]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) graphState.filter.cats.add(cb.dataset.filterCat);
      else graphState.filter.cats.delete(cb.dataset.filterCat);
      applyGraphFilter();
    });
  });
  document.querySelectorAll('[data-filter-rel]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) graphState.filter.rels.add(cb.dataset.filterRel);
      else graphState.filter.rels.delete(cb.dataset.filterRel);
      applyGraphFilter();
    });
  });
  document.getElementById('filter-isolated').addEventListener('change', (ev) => {
    graphState.filter.showIsolated = ev.target.checked;
    applyGraphFilter();
  });
  document.getElementById('filter-labels').addEventListener('change', (ev) => {
    graphState.filter.showLabels = ev.target.checked;
    applyGraphFilter();
  });
  document.getElementById('filter-inferred').addEventListener('change', (ev) => {
    graphState.filter.showInferred = ev.target.checked;
    applyGraphFilter();
  });

  // 「顯示全部」清 scope(也清 library 的 filter.parent)
  document.getElementById('graph-scope-clear').addEventListener('click', () => {
    setFilter({ parent: null, expense: null, category: null, tag: null });
    updateGraphScopeBanner();
  });

  // 重新排版(同步 packing,無動畫)
  document.getElementById('graph-restart').addEventListener('click', () => {
    const b = computeGraphBounds();
    const cx = (b.left + b.right) / 2;
    const cy = (b.top + b.bottom) / 2;
    const initR = Math.min(b.w, b.h) * 0.32;
    graphState.nodes.forEach((n, i) => {
      const angle = (i / graphState.nodes.length) * Math.PI * 2 + Math.random() * 0.3;
      const r = initR * (0.7 + Math.random() * 0.4);
      n.x = cx + r * Math.cos(angle);
      n.y = cy + r * Math.sin(angle);
      n.vx = 0; n.vy = 0;
      n.fx = null; n.fy = null;
    });
    runPackingSync(b, 320);
    graphState.lastBounds = b;
    paintGraph();
  });

  // 視窗縮放時把節點夾回新可用範圍(避免 resize 後節點留在邊界外)
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (!graphState.initialized) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      clampGraphNodesToBounds();
      paintGraph();
    }, 150);
  });
}

function highlightNeighbors(focusId, on) {
  if (!on || !focusId) {
    for (const n of graphState.nodes) n._el?.classList.remove('is-active', 'is-dimmed');
    for (const l of graphState.links) l._el?.classList.remove('is-highlighted', 'is-dimmed');
    return;
  }
  const neighbors = new Set([focusId]);
  for (const l of graphState.links) {
    if (l.source.id === focusId) neighbors.add(l.target.id);
    if (l.target.id === focusId) neighbors.add(l.source.id);
  }
  for (const n of graphState.nodes) {
    if (!n._el) continue;
    n._el.classList.toggle('is-active', n.id === focusId);
    n._el.classList.toggle('is-dimmed', !neighbors.has(n.id));
  }
  for (const l of graphState.links) {
    if (!l._el) continue;
    const involved = l.source.id === focusId || l.target.id === focusId;
    l._el.classList.toggle('is-highlighted', involved);
    l._el.classList.toggle('is-dimmed', !involved);
  }
}

function svgPoint(svg, evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

// ─────────────────────────────────────────────
// 抽屜
// ─────────────────────────────────────────────

async function openDrawer(id, opts = {}) {
  const node = state.nodeById.get(id);
  if (!node) return;
  // 第一次開抽屜時記下 cards 區的 scrollTop,稍後關閉時還原
  const $cards = document.getElementById('cards');
  if (!$drawer_isOpen() && $cards) {
    state._cardsScrollTop = $cards.scrollTop;
  }
  state.activeId = id;
  document.querySelectorAll('.card.is-active').forEach(c => c.classList.remove('is-active'));
  document.querySelector(`.card[data-id="${cssEsc(id)}"]`)?.classList.add('is-active');

  const $drawer = document.getElementById('drawer');
  $drawer.hidden = false;
  document.getElementById('drawer-id').textContent = id;
  document.getElementById('drawer-title').textContent = node.title;
  updateDrawerNav();

  // metadata 行
  const status = node.status || '現行';
  const meta = [
    ['類別', CATEGORY_LABEL[id.split('-')[0]]],
    ['母題', node.parent],
    node.agency && ['機關', node.agency],
    ['版本', node.version],
    node.doc_no && ['發文字號', node.doc_no],
    node.reviewed ? ['校對', node.reviewed + (node.review_level ? `(${node.review_level})` : '')] : ['校對', '尚未校對'],
  ].filter(Boolean);
  let metaHtml = meta.map(([k, v]) =>
    `<span><strong>${esc(k)}:</strong>${esc(String(v))}</span>`
  ).join('');
  metaHtml += `<span><strong>狀態:</strong><span class="status-badge" data-status="${esc(status)}">${esc(status)}</span></span>`;
  if (node.source_url) {
    metaHtml += `<span><a class="source-link" href="${esc(node.source_url)}" target="_blank" rel="noopener">🔗 原始出處</a></span>`;
  }
  document.getElementById('drawer-meta').innerHTML = metaHtml;
  updateDrawerCompareBtn();

  // body
  const $body = document.getElementById('drawer-body');
  $body.innerHTML = '<p style="color:var(--text-muted)">載入中…</p>';
  try {
    const r = await fetch(MD_BASE + node.file_path);
    if (!r.ok) throw new Error(`HTTP ${r.status} ${node.file_path}`);
    const text = await r.text();
    let body = stripFrontMatter(text);
    let rateHtml = '';
    if (node.rate_table) {
      rateHtml = renderRateTable(node.rate_table, node);
      // 結構化表格已是 SSOT,剝掉 MD 內重複的「## 標準全文」避免雙寫
      body = stripSection(body, '標準全文');
    }
    $body.innerHTML = rateHtml + renderMarkdown(body);
    appendRelatedSection($body, node);
    wireRateTableInteractions($body);
    wireInsuranceWidgets($body);
  } catch (e) {
    $body.innerHTML = `<p style="color:#c00">載入失敗:${esc(e.message)}</p>`;
  }
  $body.scrollTop = 0;
  if (opts.scrollToRow != null) {
    // 等下一輪 paint 再找 row(innerHTML 已就位但要等 layout)
    requestAnimationFrame(() => {
      const tr = $body.querySelector(`tr[data-row-index="${opts.scrollToRow}"]`);
      if (!tr) return;
      tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
      tr.classList.add('is-highlight');
      setTimeout(() => tr.classList.remove('is-highlight'), 2400);
    });
  }
}

function closeDrawer() {
  document.getElementById('drawer').hidden = true;
  state.activeId = null;
  document.querySelectorAll('.card.is-active').forEach(c => c.classList.remove('is-active'));
  // 還原 cards 區的捲動位置(避免關抽屜後跳回頂端)
  const $cards = document.getElementById('cards');
  if ($cards && state._cardsScrollTop != null) {
    requestAnimationFrame(() => { $cards.scrollTop = state._cardsScrollTop; });
  }
}

function $drawer_isOpen() {
  return !document.getElementById('drawer')?.hidden;
}

// 計算目前抽屜在 filtered 列表中的位置 + 控制 ← / → 按鈕
function updateDrawerNav() {
  const $prev = document.getElementById('drawer-prev');
  const $next = document.getElementById('drawer-next');
  const $pos = document.getElementById('drawer-pos');
  if (!$prev || !$next || !$pos) return;
  const list = filteredNodes();
  const idx = list.findIndex(n => n.id === state.activeId);
  if (idx < 0) {
    $prev.disabled = true;
    $next.disabled = true;
    $pos.textContent = '';
    return;
  }
  $prev.disabled = idx === 0;
  $next.disabled = idx === list.length - 1;
  $pos.textContent = `${idx + 1} / ${list.length}`;
  $prev.onclick = () => { if (idx > 0) openDrawer(list[idx - 1].id); };
  $next.onclick = () => { if (idx < list.length - 1) openDrawer(list[idx + 1].id); };
}

function appendRelatedSection($body, node) {
  // 出連結:本節點引用了誰
  const outgoing = (node.related || [])
    .map(rid => state.nodeById.get(rid))
    .filter(Boolean);
  // 入連結:本節點被誰引用
  const incoming = (state.incomingEdges.get(node.id) || [])
    .map(e => state.nodeById.get(e.from))
    .filter(Boolean);
  // 同類別 siblings:同 parent + 同 expense layer 的其他節點(去除已在 outgoing/incoming 內者)
  const seenIds = new Set([node.id, ...outgoing.map(n => n.id), ...incoming.map(n => n.id)]);
  const myExpense = nodeExpenseLayer(node);
  const siblings = state.nodes
    .filter(n => !seenIds.has(n.id)
              && n.parent === node.parent
              && isVisible(n)
              && (myExpense ? nodeExpenseLayer(n) === myExpense : true))
    .slice(0, 8);  // 限制 8 個避免太長

  if (outgoing.length === 0 && incoming.length === 0 && siblings.length === 0) return;

  // 渲染單一分組(icon + 標題 + 計數 + 連結列表)
  const renderGroup = (icon, label, hint, list, cls) => {
    if (list.length === 0) return '';
    const links = list.map(n => {
      const cat = (n.id.split('-')[0]) || '';
      return `<a class="related-link" data-jump="${esc(n.id)}" title="${esc(n.id)} · ${esc(n.parent)}"><span class="related-link-cat dot-${esc(cat)}">${esc(cat)}</span>${esc(n.title)}</a>`;
    }).join('');
    return `
      <div class="related-group ${cls}">
        <div class="related-group-header">
          <span class="related-group-icon">${icon}</span>
          <strong>${label}</strong>
          <span class="related-group-count">${list.length}</span>
          <span class="related-group-hint">${hint}</span>
        </div>
        <div class="related-group-links">${links}</div>
      </div>`;
  };

  const $box = el('div', { class: 'related-section' });
  $box.innerHTML = `
    <div class="related-section-title">🔗 相關規定</div>
    ${renderGroup('→', '本節點引用', '此節點明文提及的條文 / 函釋', outgoing, 'is-outgoing')}
    ${renderGroup('←', '被以下引用', '其他節點提及此節點之處', incoming, 'is-incoming')}
    ${renderGroup('≈', '同類別其他', `同${esc(node.parent)}${myExpense ? ' · ' + esc(myExpense) : ''}的其他條文`, siblings, 'is-siblings')}
  `.trim();

  $box.querySelectorAll('a[data-jump]').forEach(a => {
    a.onclick = (ev) => { ev.preventDefault(); openDrawer(a.dataset.jump); };
  });
  $body.appendChild($box);
}

// ─────────────────────────────────────────────
// 簡易 Markdown 渲染
// ─────────────────────────────────────────────

function stripFrontMatter(text) {
  if (!text.startsWith('---')) return text;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return text;
  return text.slice(end + 4).replace(/^\n+/, '');
}

// 從 markdown body 移除指定 H2 區塊(從 `## {heading}` 到下一個 `## ` 之前)
function stripSection(md, heading) {
  const re = new RegExp('(^|\\n)##\\s+' + heading.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '[\\s\\S]*?(?=\\n##\\s|$)', '');
  return md.replace(re, '').replace(/^\n+/, '');
}

// 渲染結構化費率表(B 類標準表用)
// 支援兩種模式:
//   flat:     {headers, rows, notes?}
//   sectioned: {sections: [{title, headers?, rows?, summary?, notes?}, ...], notes?}
function renderRateTable(rt, node) {
  if (!rt) return '';
  const hasFlat = Array.isArray(rt.headers) && Array.isArray(rt.rows);
  const hasSections = Array.isArray(rt.sections) && rt.sections.length > 0;
  if (!hasFlat && !hasSections) return '';

  const html = ['<div class="rate-table-wrap">'];

  // 已逾期 banner — node.status === '已廢止' + 有 effective_period
  if (node && node.status === '已廢止' && node.effective_period) {
    const supersededHint = node.superseded_by
      ? ` 現行版本：<a class="expired-banner-link" data-jump="${esc(node.superseded_by)}">${esc(node.superseded_by)}</a>`
      : '';
    html.push(`<div class="expired-banner">⏰ <strong>此表已逾期</strong>　適用期間：${esc(node.effective_period)}　|　保留供歷史核銷參考。${supersededHint}</div>`);
  }

  if (rt.caption) html.push(`<div class="rate-caption">${esc(rt.caption)}</div>`);
  const metaParts = [];
  if (rt.unit) metaParts.push('單位:' + esc(rt.unit));
  if (rt.effective) metaParts.push('生效:' + esc(rt.effective));
  if (metaParts.length) html.push(`<div class="rate-meta">${metaParts.join(' · ')}</div>`);

  // 保險試算 widget — 有 sections + lookup_type:insurance 才出現
  const isInsurance = rt.lookup_type === 'insurance' && hasSections;
  if (isInsurance) {
    html.push(renderInsuranceWidget(rt.sections));
  }

  if (hasFlat) {
    if (rt.searchable) {
      html.push(renderRateSearchInput(rt.search_placeholder));
    }
    html.push(renderRateTableBlock(rt.headers, rt.rows));
  }

  // Sections 模式 + rt.searchable:渲染跨 section 的全域搜尋框
  if (hasSections && rt.searchable) {
    html.push(renderRateSearchInput(rt.search_placeholder, true));
  }

  if (hasSections) {
    for (const sec of rt.sections) {
      html.push('<div class="rate-section">');
      if (sec.title) html.push(`<div class="rate-section-title">${esc(sec.title)}</div>`);
      if (Array.isArray(sec.headers) && Array.isArray(sec.rows)) {
        if (sec.searchable) html.push(renderRateSearchInput(sec.search_placeholder));
        html.push(renderRateTableBlock(sec.headers, sec.rows));
      }
      if (sec.summary) {
        html.push(`<div class="rate-section-summary">${esc(sec.summary)}</div>`);
      }
      if (Array.isArray(sec.notes) && sec.notes.length) {
        html.push('<ol class="rate-section-notes">');
        for (const n of sec.notes) html.push(`<li>${esc(String(n))}</li>`);
        html.push('</ol>');
      }
      html.push('</div>');
    }
  }

  if (Array.isArray(rt.notes) && rt.notes.length) {
    const title = hasSections ? '附記' : '備註';
    html.push(`<div class="rate-notes"><div class="rate-notes-title">${title}</div><ol>`);
    for (const n of rt.notes) html.push(`<li>${esc(String(n))}</li>`);
    html.push('</ol></div>');
  }
  html.push('</div>');
  return html.join('');
}

// 保險表互動試算 — 險種選擇 + 天數輸入 → 即顯保費
function renderInsuranceWidget(sections) {
  const sectionData = sections
    .filter(s => Array.isArray(s.rows) && s.rows.length)
    .map(s => ({
      title: s.title || '',
      // 抽出 險種關鍵字 (一般險 / 申根險)
      key: (s.title || '').replace(/\s*15足歲.*$/, '').trim(),
      rows: s.rows,  // [[day, premium_str], ...]
    }));
  if (sectionData.length === 0) return '';
  const buttons = sectionData.map((s, i) => {
    const aria = i === 0 ? 'true' : 'false';
    const cls = 'ins-tab' + (i === 0 ? ' is-active' : '');
    return `<button class="${cls}" type="button" role="tab" aria-selected="${aria}" data-ins-key="${esc(s.key)}">${esc(s.key)}</button>`;
  }).join('');
  // 預先序列化資料給 JS 用
  const dataPayload = JSON.stringify(sectionData.map(s => ({
    key: s.key,
    rows: s.rows,
  }))).replace(/</g, '\\u003c');
  return `<div class="ins-widget" data-ins-payload='${esc(dataPayload)}'>
    <div class="ins-widget-title">💰 保費試算</div>
    <div class="ins-widget-tabs" role="tablist">${buttons}</div>
    <div class="ins-widget-input">
      <label>天數 (1-365)</label>
      <input type="number" min="1" max="365" step="1" class="ins-days-input" placeholder="輸入天數,如 30">
    </div>
    <div class="ins-widget-result" aria-live="polite">請先選擇險種並輸入天數</div>
  </div>`;
}

// 綁定保險試算 widget 互動
function wireInsuranceWidgets($scope) {
  const widgets = $scope.querySelectorAll('.ins-widget');
  for (const w of widgets) {
    let payload;
    try { payload = JSON.parse(w.getAttribute('data-ins-payload')); }
    catch { continue; }
    const tabs = [...w.querySelectorAll('.ins-tab')];
    const input = w.querySelector('.ins-days-input');
    const result = w.querySelector('.ins-widget-result');
    let activeKey = tabs[0]?.dataset.insKey || '';

    function lookup() {
      const days = parseInt(input.value, 10);
      if (!activeKey) {
        result.textContent = '請先選擇險種';
        result.className = 'ins-widget-result';
        return;
      }
      if (!days || days < 1 || days > 365) {
        result.textContent = '請輸入 1~365 之間的整數天數';
        result.className = 'ins-widget-result';
        return;
      }
      const sect = payload.find(s => s.key === activeKey);
      if (!sect) { result.textContent = '找不到此險種資料'; return; }
      // sect.rows: [[dayStr, premiumStr], ...]
      const found = sect.rows.find(r => parseInt(String(r[0]), 10) === days);
      if (!found) {
        result.textContent = `${activeKey} ${days} 天:無對應費率`;
        result.className = 'ins-widget-result';
        return;
      }
      result.innerHTML = `<span class="ins-result-label">${esc(activeKey)} ${days} 天</span><span class="ins-result-value">NT$ ${esc(String(found[1]))}</span>`;
      result.className = 'ins-widget-result is-hit';
    }

    tabs.forEach(t => {
      t.addEventListener('click', () => {
        tabs.forEach(x => {
          x.classList.toggle('is-active', x === t);
          x.setAttribute('aria-selected', x === t ? 'true' : 'false');
        });
        activeKey = t.dataset.insKey;
        lookup();
      });
    });
    input.addEventListener('input', lookup);
  }
  // 已逾期 banner 內的「現行版本」連結 → 跳節點
  const links = $scope.querySelectorAll('.expired-banner-link[data-jump]');
  for (const a of links) {
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      const id = a.dataset.jump;
      if (id) openDrawer(id);
    });
  }
}

function renderRateTableBlock(headers, rows) {
  const html = ['<div class="rate-table-scroll"><table class="rate-table"><thead><tr>'];
  for (const h of headers) html.push(`<th>${esc(h)}</th>`);
  html.push('</tr></thead><tbody>');
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    html.push(`<tr data-row-index="${i}">`);
    for (const cell of row) {
      if (cell == null) {
        html.push('<td></td>');
      } else if (typeof cell === 'object') {
        const cs = cell.colspan ? ` colspan="${parseInt(cell.colspan, 10) || 1}"` : '';
        const cls = cell.multiline ? ' class="multiline"' : '';
        const v = cell.v != null ? cell.v : '';
        const escaped = esc(String(v));
        const rendered = cell.multiline ? escaped.replace(/\n/g, '<br>') : escaped;
        html.push(`<td${cs}${cls}>${rendered}</td>`);
      } else {
        html.push(`<td>${esc(String(cell))}</td>`);
      }
    }
    html.push('</tr>');
  }
  html.push('</tbody></table></div>');
  return html.join('');
}

function renderRateSearchInput(placeholder, isGlobal) {
  const ph = placeholder || '搜尋…';
  const cls = 'rate-search-wrap' + (isGlobal ? ' is-global' : '');
  return `<div class="${cls}">
    <input type="search" class="rate-search-input" placeholder="${esc(ph)}" aria-label="${esc(ph)}">
    <span class="rate-search-empty" hidden>無符合結果</span>
  </div>`;
}

// 在 drawer body 內為每個 .rate-search-input 綁定即時過濾。
// 兩種模式:
//   1. .rate-search-wrap.is-global → 過濾整個 .rate-table-wrap 內所有 .rate-section,
//      並隱藏全部列被過濾掉的 section(連同 title)
//   2. 一般 .rate-search-wrap → 只過濾下一個 sibling 的 .rate-table-scroll
function wireRateTableInteractions($scope) {
  const wraps = $scope.querySelectorAll('.rate-search-wrap');
  for (const wrap of wraps) {
    const input = wrap.querySelector('.rate-search-input');
    const empty = wrap.querySelector('.rate-search-empty');
    if (!input) continue;

    if (wrap.classList.contains('is-global')) {
      // 全域跨 section 過濾
      const rateWrap = wrap.closest('.rate-table-wrap');
      if (!rateWrap) continue;
      const sections = [...rateWrap.querySelectorAll('.rate-section')];
      const sectionData = sections.map(sec => ({
        el: sec,
        rows: [...sec.querySelectorAll('tbody tr')],
      }));
      input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        let totalVisible = 0;
        for (const { el, rows } of sectionData) {
          let secVisible = 0;
          for (const tr of rows) {
            if (!q) {
              tr.hidden = false;
              secVisible++;
            } else {
              const hit = tr.textContent.toLowerCase().includes(q);
              tr.hidden = !hit;
              if (hit) secVisible++;
            }
          }
          // section 全部被過濾掉時隱藏整個 section(含標題)
          el.hidden = q !== '' && secVisible === 0;
          totalVisible += secVisible;
        }
        if (empty) empty.hidden = totalVisible !== 0;
      });
    } else {
      // 單一 section 過濾(舊行為)
      let target = wrap.nextElementSibling;
      while (target && !target.classList.contains('rate-table-scroll')) target = target.nextElementSibling;
      if (!target) continue;
      const rows = [...target.querySelectorAll('tbody tr')];
      input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        let visible = 0;
        for (const tr of rows) {
          if (!q) {
            tr.hidden = false;
            visible++;
          } else {
            const hit = tr.textContent.toLowerCase().includes(q);
            tr.hidden = !hit;
            if (hit) visible++;
          }
        }
        if (empty) empty.hidden = visible !== 0;
      });
    }
  }
}

// 全域 rate lookup 子集查詢(用於 Ctrl+K 直接顯示「💰 大陸港澳 — 成都 256 美元」)
// 比對策略(優先級):
//   1. label exact == query → 100
//   2. label startsWith query → 60
//   3. label substring match → 40
//   4. country substring match → 20(讓「日本」查到所有日本城市)
// 若全部 0 命中,套 city_aliases fallback:用戶輸入城市未列載,自動 suggest 該國「其他」
function runRateLookup(query) {
  const q = query.trim().toLowerCase();
  if (!q || !state.rateLookup) return [];
  const hits = [];
  for (const e of state.rateLookup) {
    const lblLower = (e.label || '').toLowerCase();
    const countryLower = (e.country || '').toLowerCase();
    let score = 0;
    if (lblLower === q) score = 100;
    else if (lblLower.startsWith(q)) score = 60;
    else if (lblLower.includes(q)) score = 40;
    else if (countryLower && countryLower.includes(q)) score = 20;
    if (score > 0) {
      // 國家查詢時,「其他」加 5 分讓它更容易進前幾名(整國通用 fallback 答案)
      if (score === 20 && e.is_other) score = 25;
      hits.push({ entry: e, score });
    }
  }
  hits.sort((a, b) => b.score - a.score || (a.entry.row_index ?? 0) - (b.entry.row_index ?? 0));
  if (hits.length > 0) return hits.slice(0, 8).map(h => h.entry);

  // Fallback:無直接命中時查 city_aliases,推測使用者輸入的城市屬於哪個國家
  const aliases = state.cityAliases || {};
  for (const [aliasKey, country] of Object.entries(aliases)) {
    const ak = aliasKey.toLowerCase();
    // 雙向 includes:處理「東京都」/「Tokyo Bay」等部分輸入
    if (q === ak || q.includes(ak) || ak.includes(q)) {
      // 找該國的「其他」entry
      const otherEntry = state.rateLookup.find(e =>
        e.is_other && (e.country || '').includes(country)
      );
      if (otherEntry) {
        return [{
          ...otherEntry,
          via_alias: aliasKey,
          alias_country: country,
        }];
      }
    }
  }
  return [];
}

function renderMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let buf = [];
  let listType = null;  // 'ul' | 'ol' | null
  let inSection = false;

  const flushPara = () => {
    if (buf.length === 0) return;
    const text = buf.join(' ').trim();
    if (text) {
      const isPlaceholder = PLACEHOLDER_RE.test(text);
      const cls = isPlaceholder ? ' class="placeholder-section"' : '';
      out.push(`<p${cls}>${inline(text)}</p>`);
    }
    buf = [];
  };
  const flushList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const ln of lines) {
    const stripped = ln.trim();
    // H2/H3
    const h = ln.match(/^(#{2,3})\s+(.+)$/);
    if (h) {
      flushPara(); flushList();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      inSection = true;
      continue;
    }
    // 列表
    const ul = ln.match(/^\s*[-*+]\s+(.+)$/);
    const ol = ln.match(/^\s*\d+\.\s+(.+)$/);
    if (ul || ol) {
      flushPara();
      const tag = ul ? 'ul' : 'ol';
      if (listType !== tag) { flushList(); out.push(`<${tag}>`); listType = tag; }
      out.push(`<li>${inline((ul || ol)[1])}</li>`);
      continue;
    }
    if (!stripped) {
      flushPara(); flushList();
      continue;
    }
    buf.push(stripped);
  }
  flushPara(); flushList();
  return out.join('\n');
}

function inline(s) {
  // [text](url) → 連結
  s = esc(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>') /* 已 esc,改回 */;
  s = s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, u) => `<a href="${u}">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  return s;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cssEsc(s) {
  return CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, '\\$&');
}

// ─────────────────────────────────────────────
// 搜尋(simple substring,中文無需分詞)
// ─────────────────────────────────────────────

function runSearch(query) {
  const q = query.trim();
  if (q.length < 1) return [];
  const qLower = q.toLowerCase();
  const expanded = expandSynonyms(q);     // 含 q 自己 + 命中組同義詞
  const isExpanded = expanded.length > 1;
  const results = [];
  for (const doc of state.searchCorpus) {
    let score = 0;
    let snippet = '';
    let matchedTerm = '';   // 命中的 term(用於 snippet 與高亮)
    const titleLower = doc.title.toLowerCase();
    const bodyLower = (doc.body || '').toLowerCase();
    const summaryLower = (doc.summary || '').toLowerCase();
    const tagLowers = (doc.tags || []).map(t => t.toLowerCase());

    for (const term of expanded) {
      // 主查詢權重最重,同義詞展開稍降權避免噪音
      const isOriginal = term === qLower;
      const wTitle = isOriginal ? 5 : 3;
      const wTag   = isOriginal ? 3 : 2;
      const wBody  = isOriginal ? 1 : 0.5;

      if (titleLower.includes(term)) {
        score += wTitle;
        if (!matchedTerm) matchedTerm = term;
      }
      if (tagLowers.some(t => t.includes(term))) {
        score += wTag;
        if (!matchedTerm) matchedTerm = term;
      }
      const idx = bodyLower.indexOf(term);
      if (idx >= 0) {
        score += wBody;
        if (!snippet) {
          const start = Math.max(0, idx - 20);
          snippet = doc.body.slice(start, idx + term.length + 40);
          if (start > 0) snippet = '…' + snippet;
          if (!matchedTerm) matchedTerm = term;
        }
      } else {
        const sIdx = summaryLower.indexOf(term);
        if (sIdx >= 0) {
          score += wBody;
          if (!snippet) snippet = doc.summary;
          if (!matchedTerm) matchedTerm = term;
        }
      }
    }
    if (score > 0) results.push({ doc, score, snippet, matchedTerm, viaSynonym: isExpanded && matchedTerm !== qLower });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 12);
}

function renderSearchResults(results, query, rateHits) {
  const $list = document.getElementById('search-results');
  rateHits = rateHits || [];
  if (results.length === 0 && rateHits.length === 0) {
    $list.hidden = true;
    return;
  }
  $list.innerHTML = '';
  state.searchFocusIdx = -1;

  // 直接答案:rate lookup hits(直接命中 + alias fallback)
  for (const e of rateHits) {
    const cls = 'search-result-rate-hit' + (e.via_alias ? ' is-fallback' : '');
    const $li = el('li', { 'data-rate-row': String(e.row_index), 'data-id': e.node_id, role: 'option', class: cls });
    const valueText = e.value ? `${e.value}${e.unit ? ' ' + e.unit : ''}` : '';
    if (e.via_alias) {
      // Fallback:推測為某國 → 顯示該國「其他」
      const aliasHl = highlightMany(e.via_alias, [query]);
      $li.innerHTML = `
        <div class="search-result-title">💡 推測「${aliasHl}」屬<strong>${esc(e.alias_country)}</strong>(未列載) <span class="rate-hit-arrow">→</span> ${esc(e.country || '')} / ${esc(e.label)} <span class="rate-hit-arrow">→</span> <span class="rate-hit-value">${esc(valueText)}</span></div>
        <div class="search-result-meta">依附註 §1：未列載城市按該國「其他」支給 · ${esc(e.table_caption || e.node_title)}${e.section_title ? ' · ' + esc(e.section_title) : ''}</div>
      `;
    } else {
      $li.innerHTML = `
        <div class="search-result-title">💰 ${highlightMany(e.label, [query])} <span class="rate-hit-arrow">→</span> <span class="rate-hit-value">${esc(valueText)}</span></div>
        <div class="search-result-meta">${esc(e.table_caption || e.node_title)}${e.section_title ? ' · ' + esc(e.section_title) : ''}</div>
      `;
    }
    $li.onclick = () => { closeSearch(); openDrawer(e.node_id, { scrollToRow: e.row_index }); };
    $list.appendChild($li);
  }

  for (let i = 0; i < results.length; i++) {
    const { doc, snippet, matchedTerm, viaSynonym } = results[i];
    const $li = el('li', { 'data-id': doc.id, role: 'option' });
    const synBadge = viaSynonym && matchedTerm
      ? `<span class="search-result-synbadge" title="同義詞展開命中">≈ ${esc(matchedTerm)}</span>`
      : '';
    const hlTerms = [query, matchedTerm].filter(Boolean);
    $li.innerHTML = `
      <div class="search-result-title">${highlightMany(doc.title, hlTerms)}${synBadge}</div>
      <div class="search-result-meta">${esc(doc.id)} · ${esc(CATEGORY_LABEL[doc.id.split('-')[0]] || '')} · ${esc(doc.parent)}</div>
      ${snippet ? `<div class="search-result-snippet">${highlightMany(snippet, hlTerms)}</div>` : ''}
    `;
    $li.onclick = () => { closeSearch(); openDrawer(doc.id); };
    $list.appendChild($li);
  }
  // 「在條文庫看全部」按鈕(套 query 過濾,跳到條文庫主畫面)
  if (results.length > 0 && query.trim()) {
    const $more = el('li', { class: 'search-result-more', role: 'option' });
    $more.innerHTML = `<button type="button">📑 在條文庫看「<strong>${esc(query)}</strong>」全部相關條文 →</button>`;
    $more.onclick = () => {
      closeSearch();
      switchView('library');
      setFilter({ parent: null, expense: null, category: null, tag: null, scenario: null, query: query.trim() });
    };
    $list.appendChild($more);
  }
  $list.hidden = false;
}

function highlight(text, query) {
  if (!query) return esc(text);
  const safeQ = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return esc(text).replace(new RegExp(safeQ, 'gi'), '<mark>$&</mark>');
}

function highlightMany(text, terms) {
  const uniq = [...new Set((terms || []).filter(Boolean).map(t => t.trim()).filter(t => t.length > 0))];
  if (uniq.length === 0) return esc(text);
  const safe = uniq.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // 長 term 優先,避免短 term 先吃掉部分匹配
  safe.sort((a, b) => b.length - a.length);
  return esc(text).replace(new RegExp(safe.join('|'), 'gi'), '<mark>$&</mark>');
}

function closeSearch() {
  document.getElementById('search-results').hidden = true;
  state.searchFocusIdx = -1;
}

function moveSearchFocus(delta) {
  const $list = document.getElementById('search-results');
  if ($list.hidden) return;
  const items = [...$list.querySelectorAll('li')];
  if (items.length === 0) return;
  state.searchFocusIdx = (state.searchFocusIdx + delta + items.length) % items.length;
  items.forEach((li, i) => li.classList.toggle('is-focused', i === state.searchFocusIdx));
  items[state.searchFocusIdx].scrollIntoView({ block: 'nearest' });
}

// ─────────────────────────────────────────────
// State 變更
// ─────────────────────────────────────────────

function setFilter(patch) {
  Object.assign(state.filter, patch);
  if (patch.parent) state.treeOpen.add(patch.parent);
  renderTree();
  renderCards();
  // 若關聯圖已初始化,同步更新 scope banner 與過濾
  if (graphState.initialized) updateGraphScopeBanner();
}

// ─────────────────────────────────────────────
// 工具:DOM
// ─────────────────────────────────────────────

function el(tag, attrs = {}) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  return e;
}

function toast(msg) {
  const $t = document.getElementById('toast');
  $t.textContent = msg;
  $t.hidden = false;
  clearTimeout(toast._tid);
  toast._tid = setTimeout(() => { $t.hidden = true; }, 1800);
}

// ─────────────────────────────────────────────
// 互動 binding
// ─────────────────────────────────────────────

function bindEvents() {
  // 搜尋
  const $search = document.getElementById('search-input');
  let lastQuery = '';
  $search.addEventListener('input', () => {
    const q = $search.value;
    if (q === lastQuery) return;
    lastQuery = q;
    if (q.trim().length === 0) { closeSearch(); return; }
    renderSearchResults(runSearch(q), q, runRateLookup(q));
  });
  $search.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); moveSearchFocus(1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); moveSearchFocus(-1); }
    else if (ev.key === 'Enter') {
      const $list = document.getElementById('search-results');
      const items = [...$list.querySelectorAll('li')];
      const target = items[state.searchFocusIdx >= 0 ? state.searchFocusIdx : 0];
      if (target) target.click();
    } else if (ev.key === 'Escape') {
      $search.value = ''; closeSearch();
    }
  });
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('.search-wrap')) closeSearch();
  });

  // 抽屜
  document.getElementById('drawer-close').onclick = closeDrawer;

  // 抽屜「+ 加入比較」
  document.getElementById('drawer-compare-btn')?.addEventListener('click', () => {
    if (state.activeId) toggleCompare(state.activeId);
  });

  // 比較模式 — 浮動條按鈕
  document.getElementById('compare-bar-show')?.addEventListener('click', openCompareModal);
  document.getElementById('compare-bar-clear')?.addEventListener('click', clearCompare);
  document.querySelectorAll('[data-compare-close]').forEach(el => {
    el.addEventListener('click', closeCompareModal);
  });

  // 引用
  document.getElementById('copy-citation').onclick = () => {
    const id = state.activeId;
    const node = id && state.nodeById.get(id);
    if (!node) return;
    const txt = `${node.title}(${node.source}, ${node.version})`;
    navigator.clipboard?.writeText(txt).then(() => toast('已複製引用'));
  };
  document.getElementById('copy-link').onclick = () => {
    if (!state.activeId) return;
    const url = location.origin + location.pathname + '#' + state.activeId;
    navigator.clipboard?.writeText(url).then(() => toast('已複製連結'));
  };
  // 複製抽屜內文(純文字,去除 HTML)
  document.getElementById('copy-content').onclick = () => {
    const $body = document.getElementById('drawer-body');
    if (!$body || !state.activeId) return;
    const node = state.nodeById.get(state.activeId);
    const header = node ? `${node.title}\n${state.activeId}\n出處:${node.source || ''}\n${'─'.repeat(40)}\n\n` : '';
    const plain = $body.innerText.trim();
    navigator.clipboard?.writeText(header + plain).then(() => toast('已複製內文(純文字)'));
  };

  // 分類樹清除 — master clear:同時清掉 parent/expense/category/tag/scenario/query
  document.getElementById('tree-clear').onclick = () => {
    setFilter({ parent: null, expense: null, category: null, tag: null, scenario: null, query: '' });
    const $si = document.getElementById('search-input');
    if ($si) $si.value = '';
    if (location.hash.startsWith('#scenario=')) {
      history.replaceState(null, '', location.pathname);
    }
  };

  // 情境 banner 清除
  const $scClear = document.getElementById('scenario-banner-clear');
  if ($scClear) $scClear.onclick = clearScenario;

  // 情境視圖:↩ 顯示全部母題
  const $sScopeClear = document.getElementById('scenarios-scope-clear');
  if ($sScopeClear) $sScopeClear.onclick = () => {
    setFilter({ parent: null, expense: null, category: null, tag: null });
    renderScenariosView();
  };

  // 情境視圖:← 回母題泡泡圖
  const $sBack = document.getElementById('scenarios-back-overview');
  if ($sBack) $sBack.onclick = () => switchView('overview');

  // 主題
  document.getElementById('theme-toggle').onclick = () => {
    const cur = document.body.dataset.theme;
    const next = cur === 'dark' ? 'light' : 'dark';
    document.body.dataset.theme = next;
    document.getElementById('theme-toggle').textContent = next === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('theme', next);
  };
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') document.getElementById('theme-toggle').click();

  // 列印
  document.getElementById('print-btn').onclick = () => window.print();

  // 視圖切換
  document.querySelectorAll('.view-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      switchView(btn.dataset.view);
    });
  });

  // 鍵盤捷徑
  document.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'k') {
      ev.preventDefault(); $search.focus(); $search.select();
    } else if (ev.key === '/' && document.activeElement.tagName !== 'INPUT') {
      ev.preventDefault(); $search.focus();
    } else if (ev.key === 'Escape') {
      // 優先順序:比較 modal → 抽屜
      const $cmp = document.getElementById('compare-modal');
      if ($cmp && !$cmp.hidden) { closeCompareModal(); return; }
      const $drawer = document.getElementById('drawer');
      if (!$drawer.hidden) closeDrawer();
    } else if ((ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') &&
               !document.getElementById('drawer').hidden &&
               document.activeElement.tagName !== 'INPUT') {
      const list = filteredNodes();
      const idx = list.findIndex(n => n.id === state.activeId);
      if (idx >= 0) {
        const next = ev.key === 'ArrowRight' ? idx + 1 : idx - 1;
        if (list[next]) { ev.preventDefault(); openDrawer(list[next].id); }
      }
    }
  });

  // 載入時清除 hash:確保「重新整理 / 連結網頁」一律從母題泡泡圖開始,
  // 不再自動帶到 #scenario=xxx 或 #節點 ID。in-app 內互動仍會更新 hash(供 copy-link / 瀏覽器前後),
  // 但不會在初始載入時觸發 view 切換。
  if (location.hash) {
    history.replaceState(null, '', location.pathname);
  }
}

// ─────────────────────────────────────────────
// 啟動
// ─────────────────────────────────────────────

function renderFooterStat() {
  const $stat = document.getElementById('footer-data-stat');
  if (!$stat) return;
  const m = state.indexMeta;
  if (!m) return;
  const parts = [];
  if (m.last_indexed) parts.push(`資料更新日:${m.last_indexed}`);
  if (m.node_count) parts.push(`${m.node_count} 節點`);
  if (parts.length === 0) return;
  $stat.textContent = ' · ' + parts.join(' · ');
  $stat.hidden = false;
}

async function init() {
  try {
    await loadData();
  } catch (e) {
    document.body.innerHTML = `<div style="padding:40px">
      <h2>資料載入失敗</h2>
      <p style="color:#c00">${esc(e.message)}</p>
      <p>請從專案根目錄啟動 HTTP server,例如:</p>
      <pre style="background:#f5f5f5;padding:8px">python -m http.server 8000</pre>
      <p>然後訪問 <code>http://localhost:8000/04_web/</code></p>
    </div>`;
    return;
  }
  renderTree();
  renderCards();
  bindEvents();
  bindInfoModal();
  renderFooterStat();
  // 啟動時若預設視圖非 library,主動觸發其渲染
  const v = document.body.dataset.view;
  if (v === 'overview') renderOverview();
  else if (v === 'graph') renderGraph();
  else if (v === 'scenarios') renderScenariosView();
}

// ─────────────────────────────────────────────
// Info modal — 顯示 about / terms / privacy / LICENSE 的 markdown
// ─────────────────────────────────────────────

const INFO_TITLES = {
  'docs/about.md':   '關於本站',
  'docs/terms.md':   '使用條款',
  'docs/privacy.md': '隱私聲明',
  'LICENSE.md':      '授權聲明',
};
const INFO_MD_CACHE = new Map();
const REPO_BLOB_BASE = 'https://github.com/ntnick-web/gov-expense-kb/blob/main/';

async function openInfoModal(path) {
  const $modal = document.getElementById('info-modal');
  const $title = document.getElementById('info-modal-title');
  const $body = document.getElementById('info-modal-body');
  const $src = document.getElementById('info-modal-source');
  if (!$modal || !$body) return;

  $title.textContent = INFO_TITLES[path] || path;
  $src.href = REPO_BLOB_BASE + path;
  $modal.hidden = false;
  $body.innerHTML = '<p>載入中…</p>';
  document.body.classList.add('modal-open');

  try {
    let md = INFO_MD_CACHE.get(path);
    if (!md) {
      const r = await fetch('../' + path + '?v=' + DATA_VERSION);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      md = await r.text();
      INFO_MD_CACHE.set(path, md);
    }
    // 移除 markdown 內的 H1(modal 已有自己的標題列),其餘交給 renderMarkdown
    const stripped = md.replace(/^#\s+.+\n+/, '');
    $body.innerHTML = renderMarkdown(stripped);
    $body.scrollTop = 0;
  } catch (e) {
    $body.innerHTML = `<p style="color:#c00">載入失敗:${esc(e.message)}</p>
      <p>您可以<a href="${REPO_BLOB_BASE + path}" target="_blank" rel="noopener">直接於 GitHub 檢視</a>。</p>`;
  }
}

function closeInfoModal() {
  const $modal = document.getElementById('info-modal');
  if ($modal) $modal.hidden = true;
  document.body.classList.remove('modal-open');
}

function bindInfoModal() {
  // footer / 任何 [data-info="path"] 的連結 → 開 modal
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-info]');
    if (link) {
      e.preventDefault();
      openInfoModal(link.dataset.info);
      return;
    }
    if (e.target.closest('[data-info-close]')) {
      closeInfoModal();
    }
  });
  // ESC 關閉
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('info-modal')?.hidden) {
      closeInfoModal();
    }
  });
}

init();

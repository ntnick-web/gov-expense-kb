// 政府支出法規知識庫 — 前端主程式
// 純 ES6,無框架。從 03_index/*.json 載入資料,渲染條文庫主介面。

const DATA_BASE = '../03_index/';
const MD_BASE = '../';

const CATEGORY_LABEL = {
  A: '核心法規', B: '支出標準', C: '解釋函令', D: '問答集', N: '分類節點'
};
const CATEGORY_ORDER = ['A', 'B', 'C', 'D', 'N'];
const PLACEHOLDER_RE = /\(待人工補\)|TODO|待補/;

// 泡泡圖:9 個母題(原雙環設計已合併,中心「政府支出」移除)
const PARENTS_ALL = [
  '國內旅費', '國外旅費', '講座鐘點費', '酬勞費', '國外專家',
  '其他', '支出憑證與結報', '教育部專章', '國科會專章',
];
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
    { name: '程序總則', match: ['總則', '法源依據', '公差派遣', '出差行程', '報支期限', '調任', '準用', '懲處', '休職', '撤職', '停職', '免職', '起程日', '差竣日', '結報核銷'] },
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
    { name: '程序總則', match: ['結報核銷', '國外旅費', '總則', '法源依據', '公差派遣', '調任', '準用', '懲處', '休職', '撤職', '停職', '免職'] },
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
    { name: '程序總則', match: ['結報核銷', '法源依據', '總則'] },
    { name: '其他', match: null },
  ],
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
  nodeById: new Map(),
  incomingEdges: new Map(),  // to → [edges]
  filter: { parent: null, expense: null, category: null, tag: null, query: '' },
  activeId: null,
  treeOpen: new Set(),
  searchFocusIdx: -1,
};

// ─────────────────────────────────────────────
// 載入
// ─────────────────────────────────────────────

async function loadData() {
  const [nodes, edges, tags, search] = await Promise.all([
    fetch(DATA_BASE + 'nodes.json').then(r => r.json()),
    fetch(DATA_BASE + 'edges.json').then(r => r.json()),
    fetch(DATA_BASE + 'tags.json').then(r => r.json()),
    fetch(DATA_BASE + 'search_index.json').then(r => r.json()),
  ]);
  state.nodes = nodes;
  state.edges = edges;
  state.tags = tags;
  state.searchCorpus = search.documents || [];
  state.nodeById = new Map(nodes.map(n => [n.id, n]));
  state.incomingEdges = new Map();
  for (const e of edges) {
    if (!state.incomingEdges.has(e.to)) state.incomingEdges.set(e.to, []);
    state.incomingEdges.get(e.to).push(e);
  }
}

// ─────────────────────────────────────────────
// 分類樹
// ─────────────────────────────────────────────

function buildTreeData() {
  // parent → expense(若有定義)→ category → nodes[]
  // 若 parent 無 EXPENSE_LAYER,expense 層用 sentinel '_' 跳過顯示
  const tree = new Map();
  for (const n of state.nodes) {
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
  $allItem.innerHTML = `<span class="twirl"></span>全部<span class="count">${state.nodes.length}</span>`;
  $allItem.onclick = () => { setFilter({ parent: null, expense: null, category: null, tag: null }); };
  $tree.appendChild($allItem);

  for (const [parent, byExp] of [...tree.entries()].sort()) {
    const totalParent = [...byExp.values()].reduce(
      (s, byCat) => s + [...byCat.values()].reduce((s2, arr) => s2 + arr.length, 0), 0);
    const $parent = el('div', { class: 'tree-item' });
    $parent.innerHTML = `<span class="twirl">▶</span>${esc(parent)}<span class="count">${totalParent}</span>`;
    $parent.onclick = (ev) => {
      ev.stopPropagation();
      // 進入該母題的鎖定模式
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
  return state.nodes.filter(n => {
    if (state.filter.parent && n.parent !== state.filter.parent) return false;
    if (state.filter.expense && nodeExpenseLayer(n) !== state.filter.expense) return false;
    const cat = n.id.split('-')[0];
    if (state.filter.category && cat !== state.filter.category) return false;
    if (state.filter.tag && !(n.tags || []).includes(state.filter.tag)) return false;
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
  $treeClear.hidden = !(state.filter.parent || state.filter.expense || state.filter.category || state.filter.tag);

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
  const $c = el('div', {
    class: 'card' + (isReviewed ? ' is-reviewed' : '') + (state.activeId === n.id ? ' is-active' : ''),
    role: 'listitem',
    'data-cat': cat,
    'data-id': n.id,
  });
  const summaryHTML = n.summary
    ? esc(n.summary)
    : `<span class="card-tag">未填摘要</span>`;
  const tagsHTML = (n.tags || []).slice(0, 3).map(t =>
    `<span class="card-tag">${esc(t)}</span>`
  ).join('');
  const flag = isReviewed ? '' : '<span class="card-flag">草稿</span>';
  $c.innerHTML = `
    ${flag}
    <div class="card-id">${esc(n.id)}</div>
    <h3 class="card-title">${esc(n.title)}</h3>
    <div class="card-summary">${summaryHTML}</div>
    <div class="card-tags">${tagsHTML}</div>
  `;
  $c.onclick = () => openDrawer(n.id);
  return $c;
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

  // 統計每個母題的節點數
  const counts = new Map();
  for (const n of state.nodes) {
    counts.set(n.parent, (counts.get(n.parent) || 0) + 1);
  }
  const maxCount = Math.max(1, ...PARENTS_ALL.map(p => counts.get(p) || 0));

  // 主泡泡尺寸依容器較短邊縮放
  const baseDim = Math.min(W, H);
  const MAIN_MIN_R = baseDim * 0.045;
  const MAIN_MAX_R = baseDim * 0.13;

  const bubbles = [];
  PARENTS_ALL.forEach((parent, i) => {
    const c = counts.get(parent) || 0;
    const ratio = c / maxCount;
    const r = MAIN_MIN_R + ratio * (MAIN_MAX_R - MAIN_MIN_R);
    // 0 筆 → 灰色;> 0 筆 → 母題色彩
    const color = c > 0 ? PARENT_COLOR[parent] : '#95A5A6';
    const angle = (i / PARENTS_ALL.length) * Math.PI * 2;
    const initR = baseDim * 0.28;
    bubbles.push({
      kind: 'main',
      parent,
      label: parent,
      count: c,
      color,
      isEmpty: c === 0,
      r,
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

function makeBubble({ kind, x, y, r, label, color, parent, delay = 0 }) {
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

    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = parent ? `${parent}(點擊進入)` : label;
    g.appendChild(title);

    if (parent) {
      g.setAttribute('role', 'button');
      g.setAttribute('tabindex', '0');
      g.addEventListener('click', () => {
        switchView('library');
        setFilter({ parent, expense: null, category: null, tag: null });
      });
      g.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          switchView('library');
          setFilter({ parent, expense: null, category: null, tag: null });
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
  ['library', 'overview', 'graph'].forEach(v => {
    document.getElementById('view-' + v).hidden = v !== name;
  });
  if (name === 'overview') renderOverview();
  if (name === 'graph') renderGraph();
  else stopGraphSimulation();
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

async function openDrawer(id) {
  const node = state.nodeById.get(id);
  if (!node) return;
  state.activeId = id;
  document.querySelectorAll('.card.is-active').forEach(c => c.classList.remove('is-active'));
  document.querySelector(`.card[data-id="${cssEsc(id)}"]`)?.classList.add('is-active');

  const $drawer = document.getElementById('drawer');
  $drawer.hidden = false;
  document.getElementById('drawer-id').textContent = id;
  document.getElementById('drawer-title').textContent = node.title;

  // metadata 行
  const meta = [
    ['類別', CATEGORY_LABEL[id.split('-')[0]]],
    ['母題', node.parent],
    node.agency && ['機關', node.agency],
    ['版本', node.version],
    node.doc_no && ['發文字號', node.doc_no],
    node.reviewed ? ['校對', node.reviewed] : ['狀態', '草稿'],
  ].filter(Boolean);
  document.getElementById('drawer-meta').innerHTML = meta.map(([k, v]) =>
    `<span><strong>${esc(k)}:</strong>${esc(String(v))}</span>`
  ).join('');

  // body
  const $body = document.getElementById('drawer-body');
  $body.innerHTML = '<p style="color:var(--text-muted)">載入中…</p>';
  try {
    const text = await fetch(MD_BASE + node.file_path).then(r => r.text());
    const body = stripFrontMatter(text);
    $body.innerHTML = renderMarkdown(body);
    appendRelatedSection($body, node);
  } catch (e) {
    $body.innerHTML = `<p style="color:#c00">載入失敗:${esc(e.message)}</p>`;
  }
  $body.scrollTop = 0;
}

function closeDrawer() {
  document.getElementById('drawer').hidden = true;
  state.activeId = null;
  document.querySelectorAll('.card.is-active').forEach(c => c.classList.remove('is-active'));
}

function appendRelatedSection($body, node) {
  // 入連結:本節點被誰引用
  const incoming = state.incomingEdges.get(node.id) || [];
  if (incoming.length === 0) return;
  const $box = el('div', { class: 'related-incoming' });
  $box.style.cssText = 'margin-top:18px;padding:10px 12px;background:var(--bg-secondary);border-radius:6px;font-size:13px';
  const links = incoming.map(e => {
    const from = state.nodeById.get(e.from);
    if (!from) return null;
    return `<a data-jump="${esc(from.id)}">${esc(from.title)}</a>`;
  }).filter(Boolean).join('、');
  $box.innerHTML = `<strong style="color:var(--text-secondary)">本節點被以下引用 (${incoming.length}):</strong> ${links}`;
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
  const results = [];
  for (const doc of state.searchCorpus) {
    let score = 0;
    let snippet = '';
    if (doc.title.toLowerCase().includes(qLower)) score += 5;
    if ((doc.tags || []).some(t => t.toLowerCase().includes(qLower))) score += 3;
    const idx = (doc.body || '').toLowerCase().indexOf(qLower);
    if (idx >= 0) {
      score += 1;
      const start = Math.max(0, idx - 20);
      snippet = doc.body.slice(start, idx + q.length + 40);
      if (start > 0) snippet = '…' + snippet;
    }
    if (idx < 0) {
      const sIdx = (doc.summary || '').toLowerCase().indexOf(qLower);
      if (sIdx >= 0) {
        score += 1;
        snippet = doc.summary;
      }
    }
    if (score > 0) results.push({ doc, score, snippet });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 12);
}

function renderSearchResults(results, query) {
  const $list = document.getElementById('search-results');
  if (results.length === 0) {
    $list.hidden = true;
    return;
  }
  $list.innerHTML = '';
  state.searchFocusIdx = -1;
  for (let i = 0; i < results.length; i++) {
    const { doc, snippet } = results[i];
    const $li = el('li', { 'data-id': doc.id, role: 'option' });
    $li.innerHTML = `
      <div class="search-result-title">${highlight(doc.title, query)}</div>
      <div class="search-result-meta">${esc(doc.id)} · ${esc(CATEGORY_LABEL[doc.id.split('-')[0]] || '')} · ${esc(doc.parent)}</div>
      ${snippet ? `<div class="search-result-snippet">${highlight(snippet, query)}</div>` : ''}
    `;
    $li.onclick = () => { closeSearch(); openDrawer(doc.id); };
    $list.appendChild($li);
  }
  $list.hidden = false;
}

function highlight(text, query) {
  if (!query) return esc(text);
  const safeQ = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return esc(text).replace(new RegExp(safeQ, 'gi'), '<mark>$&</mark>');
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
    renderSearchResults(runSearch(q), q);
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

  // 分類樹清除
  document.getElementById('tree-clear').onclick = () => {
    setFilter({ parent: null, expense: null, category: null, tag: null });
  };

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

  // hash 直接打開節點
  if (location.hash) {
    const id = decodeURIComponent(location.hash.slice(1));
    if (state.nodeById.has(id)) {
      const node = state.nodeById.get(id);
      setFilter({ parent: node.parent, category: id.split('-')[0], tag: null });
      openDrawer(id);
    }
  }
}

// ─────────────────────────────────────────────
// 啟動
// ─────────────────────────────────────────────

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
  // 啟動時若預設視圖非 library,主動觸發其渲染
  if (document.body.dataset.view === 'overview') renderOverview();
  else if (document.body.dataset.view === 'graph') renderGraph();
}

init();

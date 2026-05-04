// 03_render.js — auto-split from app.js (2026-05-02 #2 ESM 拆檔 Phase 2-4)
// 此檔為 plain script,共享 window scope;與 02/03/04 配合使用,載入順序固定。

/* ──────── render cards (chunked lazy-render) ──────── */
const _LIB_CHUNK_SIZE = 30;
let _libDisplayList = [];  // interleaved: { kind:'header', label } | { kind:'card', data }
let _libDisplayPos = 0;    // position in _libDisplayList
let _libCardCount = 0;     // cards rendered so far (for sentinel progress text)
let _libObserver = null;

function _renderCardHtml(d, q) {
  const inCmp = compareList.includes(d.id);
  const isQa = d.art === 'qa';
  const isRate = d.art === 'rate';
  const summary = d.summary || '<em style="color:var(--ink-3)">(摘要待補)</em>';
  const titleObj = buildCardTitle(d);
  const titleHtml = `${titleObj.prefix ? `<span style="color:var(--ink-3);font-weight:500;font-size:13px">${titleObj.prefix}</span> ` : ''}${titleObj.no ? `<span style="color:var(--ink-3);font-weight:500">${titleObj.no}</span> ` : ''}${titleObj.title}`;
  const tagsHtml = (d.tags || []).slice(0,3).map(t=>`<span class="tag">${t}</span>`).join("");
  // 高亮:除原 query 外,同義詞命中也高亮(讓使用者看到實際命中的詞)
  const hlTerms = q ? [q, ...(d._matchedSynonym ? [d._matchedSynonym] : [])] : [];
  const titleHl = q ? highlightTerms(titleHtml, hlTerms) : titleHtml;
  const summaryHl = q ? highlightTerms(summary, hlTerms) : summary;
  const tagsHl = q ? highlightTerms(tagsHtml, hlTerms) : tagsHtml;
  // 若是同義詞命中,在標題後加灰色「≈ 命中詞」徽章告訴使用者為什麼跑出來
  const synBadge = d._matchedSynonym ? `<span class="syn-badge" title="同義詞展開命中">≈ ${escapeHtml(d._matchedSynonym)}</span>` : '';
  return `
    <article class="card${inCmp ? ' compared' : ''}${isQa ? ' is-qa' : ''}${isRate ? ' is-rate' : ''}" data-id="${d.id}" tabindex="0">
      <button class="card-compare${inCmp ? ' on' : ''}" data-cmp-toggle title="${inCmp ? '已加入比較,點擊移除' : '加入並排比較 (最多 3 張)'}">
        ${inCmp ? '✓ 已加入' : '+ 比較'}
      </button>
      <div class="card-eyebrow">
        <span class="card-no"><span class="card-art ${dotClass(d.art)}"></span>&nbsp;&nbsp;${d.id}</span>
        ${d.certainty && d.certainty !== 'explicit' ? `<span class="badge-certainty ${d.certainty}" title="${d.certainty === 'contested' ? '實務見解不一,本站不提供判斷' : '法規無明文,屬推論'}">⚠ ${d.certainty === 'contested' ? '爭議' : '推論'}</span>` : ''}
        ${statusBadge(d.status)}
      </div>
      <h3 class="card-title">${titleHl}${synBadge}</h3>
      <p class="card-summary">${summaryHl}</p>
      <div class="card-foot">
        <div class="card-tags">${tagsHl}</div>
        <span>${d.updated}</span>
      </div>
    </article>
  `;
}

/* 對多個 term 都做 highlightQuery(供同義詞展開命中用)*/
function highlightTerms(html, terms) {
  if (!terms || !terms.length) return html;
  for (const t of terms) {
    if (t) html = highlightQuery(html, t);
  }
  return html;
}

function renderCards() {
  renderBreadcrumb();
  renderScopeBanner();
  currentList = filteredData();
  // 重置 lazy-render state
  if (_libObserver) { _libObserver.disconnect(); _libObserver = null; }
  _libDisplayPos = 0;
  _libCardCount = 0;

  // 建立 displayList：無搜尋/情境 filter 時在類別切換處插入群組節頭
  const _qTrim = (filterState.query || '').trim();
  if (!_qTrim && !filterState.scenario) {
    _libDisplayList = [];

    // 取得非 A 類卡的主要支出類別(依 EXPENSE_LAYER 順序首個命中)
    const _getExp = (d) => {
      const el = EXPENSE_LAYER[d.cat];
      if (!el) return '程序與通則';
      for (const exp of el) {
        if (exp === '程序與通則') continue;
        if (nodeMatchesExpense(d, exp)) return exp;
      }
      return '程序與通則';
    };

    // 預計算非 A 類的支出類別
    const _expMap = new Map();
    for (const d of currentList) {
      if (d.id.split('-')[0] !== 'A') _expMap.set(d.id, _getExp(d));
    }

    // 重新排序:母題 → A 類優先(法規) → 非 A 類依支出類別順序 → 類型 → sortOrder
    const _expOrd = (d) => {
      const el = EXPENSE_LAYER[d.cat];
      if (!el) return 99;
      const i = el.indexOf(_expMap.get(d.id));
      return i >= 0 ? i : 99;
    };
    const _sorted = [...currentList].sort((a, b) => {
      const pa = PARENT_SORT_IDX[a.cat] ?? 99, pb = PARENT_SORT_IDX[b.cat] ?? 99;
      if (pa !== pb) return pa - pb;
      const ta = TYPE_ORDER[a.type] ?? 99, tb = TYPE_ORDER[b.type] ?? 99;
      const aA = (ta === 0), bA = (tb === 0);
      if (aA !== bA) return aA ? -1 : 1;           // A 類在非 A 類之前
      if (aA) {
        // 兩者皆 A:有條次先、再 sortOrder
        const na = a.no ? 0 : 1, nb = b.no ? 0 : 1;
        if (na !== nb) return na - nb;
        const sa = a.sortOrder ?? Infinity, sb = b.sortOrder ?? Infinity;
        if (sa !== sb) return sa - sb;
        return (parseInt(a.id.split('-').pop(),10)||0) - (parseInt(b.id.split('-').pop(),10)||0);
      }
      // 兩者皆非 A:支出類別順序 → 類型 → sortOrder
      const ea = _expOrd(a), eb = _expOrd(b);
      if (ea !== eb) return ea - eb;
      if (ta !== tb) return ta - tb;
      const sa = a.sortOrder ?? Infinity, sb = b.sortOrder ?? Infinity;
      if (sa !== sb) return sa - sb;
      return (parseInt(a.id.split('-').pop(),10)||0) - (parseInt(b.id.split('-').pop(),10)||0);
    });
    currentList = _sorted;   // 同步更新,使抽屜 prev/next 與畫面順序一致

    // 預計算各群組卡片數(A 類 key: cat|A|subKey;其他 key: cat|exp)
    const _groupCounts = new Map();
    for (const d of _sorted) {
      const _tp = d.id.split('-')[0];
      const gk = _tp === 'A'
        ? `${d.cat}|A|${d.no ? 'main' : d.id}`
        : `${d.cat}|${_expMap.get(d.id)}`;
      _groupCounts.set(gk, (_groupCounts.get(gk) || 0) + 1);
    }

    // 建立 displayList
    let _lastKey = '';
    for (const d of _sorted) {
      const _tp = d.id.split('-')[0];
      let _key;
      if (_tp === 'A') {
        const _subKey = d.no ? 'main' : d.id;
        _key = `${d.cat}|A|${_subKey}`;
        if (_key !== _lastKey) {
          _lastKey = _key;
          const _label = (d.no && PARENT_LAW[d.cat])
            ? `${d.cat} · 核心法規 ─ ${PARENT_LAW[d.cat].full}`
            : `${d.cat} · 核心法規 ─ ${d.title}`;
          _libDisplayList.push({ kind: 'header', label: _label, count: _groupCounts.get(_key) || 0 });
        }
      } else {
        const _exp = _expMap.get(d.id);
        _key = `${d.cat}|${_exp}`;
        if (_key !== _lastKey) {
          _lastKey = _key;
          _libDisplayList.push({ kind: 'header', label: `${d.cat} · ${_exp}`, count: _groupCounts.get(_key) || 0 });
        }
      }
      _libDisplayList.push({ kind: 'card', data: d });
    }
  } else {
    _libDisplayList = currentList.map(d => ({ kind: 'card', data: d }));
  }

  if (currentList.length === 0) {
    grid.innerHTML = `<div class="cmp-empty" style="grid-column:1/-1;padding:60px 24px"><strong>沒有符合條件的條文</strong>清除過濾條件再試試</div>`;
    const _q = (filterState.query || '').trim();
    if (_q.length >= 2 && typeof ga4 === 'function') ga4('search_no_results', { search_term: _q });
    return;
  }
  grid.innerHTML = '';
  appendLibraryChunk();
}

function appendLibraryChunk() {
  if (_libDisplayPos >= _libDisplayList.length) return;
  const q = (filterState.query || '').trim();
  // 移除舊 sentinel 再 append
  grid.querySelector('.lazy-sentinel')?.remove();
  let cardsThisChunk = 0;
  const htmlParts = [];
  while (_libDisplayPos < _libDisplayList.length && cardsThisChunk < _LIB_CHUNK_SIZE) {
    const item = _libDisplayList[_libDisplayPos];
    if (item.kind === 'header') {
      const cntHtml = item.count != null ? `<span class="lib-group-count">${item.count}</span>` : '';
      htmlParts.push(`<div class="lib-group-header"><span class="lib-group-label">${escapeHtml(item.label)}</span>${cntHtml}</div>`);
    } else {
      htmlParts.push(_renderCardHtml(item.data, q));
      cardsThisChunk++;
    }
    _libDisplayPos++;
  }
  _libCardCount += cardsThisChunk;
  grid.insertAdjacentHTML('beforeend', htmlParts.join(''));

  // 還有未 render 的就放 sentinel
  if (_libDisplayPos < _libDisplayList.length) {
    const sentinel = document.createElement('div');
    sentinel.className = 'lazy-sentinel';
    sentinel.style.gridColumn = '1/-1';
    sentinel.innerHTML = `<button class="btn lazy-loadmore" type="button" style="width:100%;padding:14px;color:var(--ink-3);background:var(--surface-2);border:1px dashed var(--line-strong)">載入更多 ↓ <span style="opacity:.7;margin-left:6px">已顯示 ${_libCardCount} / ${currentList.length}</span></button>`;
    grid.appendChild(sentinel);
    sentinel.querySelector('.lazy-loadmore').onclick = () => appendLibraryChunk();
    // IntersectionObserver 自動載入(scroll 接近 sentinel 時)
    _libObserver = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        _libObserver?.disconnect();
        _libObserver = null;
        appendLibraryChunk();
      }
    }, { rootMargin: '400px' });
    _libObserver.observe(sentinel);
  }
}


/* ──────── drawer (動態 fetch MD) ──────── */
const drawer = document.getElementById("drawer");
const scrim = document.getElementById("scrim");
const MD_BASE = '../';

// 簡易 MD parser:把 H2/H3、表格、列表等基本格式轉 HTML
function renderMarkdown(md) {
  // 移除 front-matter
  if (md.startsWith('---')) {
    const end = md.indexOf('\n---', 3);
    if (end > 0) md = md.slice(end + 4).replace(/^\n+/, '');
  }
  // 簡單語法處理
  let html = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h4 style="font-size:13px;font-weight:600;color:var(--ink-2);margin:14px 0 6px">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin:0 0 10px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-3);display:flex;align-items:center;gap:8px"><span style="content:\\\"\\\";display:inline-block;width:14px;height:1px;background:var(--line-strong)"></span>$1</h3>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="font-family:var(--font-mono);background:var(--surface-2);padding:1px 5px;border-radius:4px;font-size:12.5px">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--brand)">$1</a>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^\n*/, '<p>') + '</p>';
  return html;
}

// 從 MD 抽特定 H2 區塊內容
function extractSection(md, heading) {
  const re = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);
  const m = md.match(re);
  return m ? m[1].trim() : '';
}

// 渲染 rate_table (B 類專用) — 含保險 widget + sticky 跨節搜尋
// ── lookup_type widget renderer registry(2026-05-01 加,#18 通用化)──
// 新增 widget:在此加一筆,並在 wireRateTableInteractions 加對應 wirer。
const LOOKUP_TYPE_RENDERERS = {
  insurance(rt, node) {
    const sections = rt.sections.filter(s => Array.isArray(s.rows) && s.rows.length);
    const tabs = sections.map((s, i) => {
      const key = (s.title || '').replace(/\s*15足歲.*$/, '').trim();
      return `<button class="ins-tab${i === 0 ? ' active' : ''}" data-ins-key="${key}">${key}</button>`;
    }).join('');
    const payload = JSON.stringify(sections.map(s => ({ key: (s.title || '').replace(/\s*15足歲.*$/, '').trim(), rows: s.rows })));
    return `<div class="ins-widget" data-ins='${payload.replace(/'/g, "&#39;").replace(/</g, "&lt;")}' style="background:var(--brand-soft);border:1px solid var(--brand-line);border-radius:var(--radius);padding:12px 14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:var(--brand);margin-bottom:8px">💰 保費試算</div>
      <div class="ins-tabs" style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">${tabs}</div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <label style="font-size:12px;color:var(--ink-2);font-weight:500">天數 (1-365)</label>
        <input type="number" class="ins-days" min="1" max="365" placeholder="輸入天數,如 30" style="flex:1;max-width:180px;padding:5px 10px;border:1px solid var(--brand-line);border-radius:6px;font-size:13px;background:var(--surface);color:var(--ink)">
      </div>
      <div class="ins-result" style="background:var(--surface);border:1px dashed var(--line-strong);border-radius:6px;padding:8px 12px;font-size:13px;color:var(--ink-3);text-align:center">請先選擇險種並輸入天數</div>
    </div>`;
  },
  // 未來範例:
  //   range_table(rt, node) { /* 級距試算(輸入金額 → 適用級距) */ },
  //   monthly_to_daily(rt, node) { /* 月支轉日支推算 */ },
};

function renderRateTableHtml(rt, node) {
  if (!rt) return '';
  const wrapId = `rt-${node.id.replace(/[^a-z0-9]/gi, '_')}`;
  const html = [`<div id="${wrapId}" class="rt-wrap" style="background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius);padding:14px;margin-bottom:18px">`];
  // 已逾期 banner
  if (node.status === '已廢止' && node.effectivePeriod) {
    html.push(`<div style="background:var(--warn-soft);border:1px solid var(--warn);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:13px;color:var(--warn)">⏰ <strong>此表已逾期</strong> · 適用 ${node.effectivePeriod}${node.supersededBy ? ` · 現行版本 <strong>${node.supersededBy}</strong>` : ''}</div>`);
  }
  if (rt.caption) html.push(`<div style="font-weight:600;font-size:14px;margin-bottom:4px">${rt.caption}</div>`);
  if (rt.unit || rt.effective) html.push(`<div style="font-size:12px;color:var(--ink-3);margin-bottom:10px">${rt.unit ? '單位: ' + rt.unit : ''}${rt.unit && rt.effective ? ' · ' : ''}${rt.effective ? '生效: ' + rt.effective : ''}</div>`);

  const isCrossSection = rt.searchable && Array.isArray(rt.sections) && rt.sections.length > 1;

  // ── lookup_type widget dispatch(2026-05-01 抽出 — 為未來新型 widget 做準備)──
  // 新增 widget:① 在 LOOKUP_TYPE_RENDERERS 加 renderer 回 HTML 字串
  //              ② 在 wireRateTableInteractions 對應加 wirer
  //              ③ MD front-matter 設 lookup_type: 'your_type'
  if (rt.lookup_type && Array.isArray(rt.sections)) {
    const widgetHtml = (LOOKUP_TYPE_RENDERERS[rt.lookup_type] || (() => ''))(rt, node);
    if (widgetHtml) html.push(widgetHtml);
  }

  // 跨節 sticky 全域搜尋框
  if (isCrossSection) {
    html.push(`<div class="rt-search-global" style="position:sticky;top:0;z-index:5;background:var(--brand-soft);border:1px solid var(--brand-line);border-radius:6px;padding:6px 10px;margin-bottom:12px;display:flex;align-items:center;gap:8px">
      <span style="font-size:11px;font-weight:700;color:var(--brand);white-space:nowrap">🔍 跨地區搜尋:</span>
      <input type="search" class="rt-q" placeholder="${rt.search_placeholder || '搜尋…'}" style="flex:1;border:1px solid var(--line);border-radius:4px;padding:4px 8px;font-size:13px;background:var(--surface);color:var(--ink)">
    </div>`);
  }

  // 各 section / 整表 notes 渲染 helper
  const renderRtNotes = (notes, headlineForTable) => {
    if (!Array.isArray(notes) || !notes.length) return '';
    if (headlineForTable) {
      return `<div style="margin-top:12px;padding:10px 12px;background:var(--surface-2);border-radius:6px;border-left:3px solid var(--ink-3)"><div style="font-size:11px;font-weight:700;color:var(--ink-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">📝 整表備註</div><ol style="margin:0;padding-left:20px;font-size:12px;color:var(--ink-2);line-height:1.7">${notes.map(n => `<li>${n}</li>`).join('')}</ol></div>`;
    }
    return `<ol style="margin:6px 0 0;padding-left:20px;font-size:11.5px;color:var(--ink-3);line-height:1.65">${notes.map(n => `<li>${n}</li>`).join('')}</ol>`;
  };

  // sections 模式 — 顯示全部 sections(原 limit=4 會漏掉長表的後段章節)
  if (Array.isArray(rt.sections)) {
    for (const sec of rt.sections) {
      html.push(`<div class="rt-section" data-sec-title="${sec.title || ''}">`);
      if (sec.title) html.push(`<div style="font-weight:600;font-size:13px;margin:12px 0 6px;color:var(--ink-2)">${sec.title}</div>`);
      if (Array.isArray(sec.headers) && Array.isArray(sec.rows)) {
        const rows = isCrossSection ? sec.rows : sec.rows.slice(0, 8);
        html.push('<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>');
        for (const h of sec.headers) html.push(`<th style="text-align:left;padding:4px 8px;border-bottom:1px solid var(--line);color:var(--ink-3);font-weight:600">${h}</th>`);
        html.push('</tr></thead><tbody>');
        for (const r of rows) {
          html.push('<tr>');
          for (const c of r) html.push(`<td style="padding:4px 8px;border-bottom:1px solid var(--line)">${typeof c === 'object' ? (c.v || '') : (c || '')}</td>`);
          html.push('</tr>');
        }
        html.push('</tbody></table></div>');
        if (!isCrossSection && sec.rows.length > 8) html.push(`<div style="font-size:11px;color:var(--ink-3);margin-top:4px">…還有 ${sec.rows.length - 8} 列</div>`);
      } else if (sec.summary) {
        html.push(`<div style="padding:8px 12px;background:var(--surface);border-radius:6px;font-size:13px">${sec.summary}</div>`);
      }
      // 各 section 備註(計算規則/折扣/排除等)
      html.push(renderRtNotes(sec.notes));
      html.push('</div>');
    }
  } else if (Array.isArray(rt.headers) && Array.isArray(rt.rows)) {
    // flat 模式
    const rows = rt.rows.slice(0, 50);
    html.push('<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr>');
    for (const h of rt.headers) html.push(`<th style="text-align:left;padding:4px 8px;border-bottom:1px solid var(--line);color:var(--ink-3);font-weight:600">${h}</th>`);
    html.push('</tr></thead><tbody>');
    for (const r of rows) {
      html.push('<tr>');
      for (const c of r) html.push(`<td style="padding:4px 8px;border-bottom:1px solid var(--line)">${typeof c === 'object' ? (c.v || '') : (c || '')}</td>`);
      html.push('</tr>');
    }
    html.push('</tbody></table></div>');
    if (rt.rows.length > 50) html.push(`<div style="font-size:11px;color:var(--ink-3);margin-top:4px">…還有 ${rt.rows.length - 50} 列</div>`);
  }
  // 整表備註(rt.notes)— 適用範圍/通則/法源等,放在所有 sections / flat table 之後
  html.push(renderRtNotes(rt.notes, true));
  html.push('</div>');
  return html.join('');
}

// ── lookup_type widget wirer registry(2026-05-01 加,搭配 LOOKUP_TYPE_RENDERERS)──
const LOOKUP_TYPE_WIRERS = {
  insurance(scope) {
    scope.querySelectorAll('.ins-widget').forEach(w => {
      let payload;
      try { payload = JSON.parse(w.getAttribute('data-ins').replace(/&#39;/g, "'").replace(/&lt;/g, '<')); }
      catch { return; }
      const tabs = [...w.querySelectorAll('.ins-tab')];
      const input = w.querySelector('.ins-days');
      const result = w.querySelector('.ins-result');
      let activeKey = tabs[0]?.dataset.insKey;
      function lookup() {
        const days = parseInt(input.value, 10);
        if (!days || days < 1 || days > 365) {
          result.textContent = '請輸入 1~365 之間的整數天數';
          result.style.background = 'var(--surface)';
          return;
        }
        const sect = payload.find(s => s.key === activeKey);
        const found = sect?.rows.find(r => parseInt(r[0], 10) === days);
        if (!found) {
          result.textContent = `${activeKey} ${days} 天:無對應費率`;
          result.style.background = 'var(--surface)';
          return;
        }
        result.innerHTML = `<span style="font-size:12px;color:var(--ink-3)">${activeKey} ${days} 天</span> &nbsp; <span style="font-size:18px;font-weight:700;color:var(--brand);font-family:var(--font-mono)">NT$ ${found[1]}</span>`;
        result.style.background = 'var(--warn-soft)';
        result.style.borderColor = 'var(--warn)';
        result.style.borderStyle = 'solid';
      }
      tabs.forEach(t => t.onclick = () => {
        tabs.forEach(x => x.classList.toggle('active', x === t));
        activeKey = t.dataset.insKey;
        lookup();
      });
      input.oninput = lookup;
    });
  },
};

// 綁 rate_table 互動 (各種 lookup_type widget + 跨節搜尋) — drawer 載入後呼叫
function wireRateTableInteractions(scope) {
  // 各 lookup_type widget(透過 registry dispatch)
  for (const wirer of Object.values(LOOKUP_TYPE_WIRERS)) {
    try { wirer(scope); } catch (e) { console.warn('lookup_type wirer error', e); }
  }
  // 跨節 sticky 搜尋 (0 命中時自動套 alias fallback,顯示該國「其他」列並 highlight)
  scope.querySelectorAll('.rt-search-global .rt-q').forEach(q => {
    const wrap = q.closest('.rt-wrap');
    if (!wrap) return;
    const sections = [...wrap.querySelectorAll('.rt-section')];
    // banner 容器,放在搜尋框後
    const searchWrap = q.closest('.rt-search-global');
    let $banner = searchWrap?.parentElement?.querySelector('.rt-fallback-banner');
    if (!$banner && searchWrap) {
      $banner = document.createElement('div');
      $banner.className = 'rt-fallback-banner';
      $banner.style.cssText = 'display:none;margin:0 0 10px;padding:8px 12px;background:var(--pastel-sky);border:1px solid var(--ink-sky);border-left:3px solid var(--ink-sky);border-radius:6px;font-size:12.5px;color:var(--ink-sky)';
      searchWrap.insertAdjacentElement('afterend', $banner);
    }
    q.oninput = () => {
      const termRaw = q.value.trim();
      const term = termRaw.toLowerCase();
      // 清掉前次 highlight
      wrap.querySelectorAll('tbody tr.rt-fallback-row').forEach(tr => tr.classList.remove('rt-fallback-row'));
      let totalHits = 0;
      for (const sec of sections) {
        let visible = 0;
        const trs = sec.querySelectorAll('tbody tr');
        for (const tr of trs) {
          if (!term) { tr.hidden = false; visible++; }
          else {
            const hit = tr.textContent.toLowerCase().includes(term);
            tr.hidden = !hit;
            if (hit) visible++;
          }
        }
        sec.hidden = term !== '' && visible === 0;
        totalHits += visible;
      }
      // 0 命中 + 有輸入 → 嘗試 alias fallback
      if (term && totalHits === 0) {
        const info = inferCountryByAlias(termRaw);
        if (info) {
          // 在所有 sections 內找該國「其他」列(雙向 substring 比對 country 欄)
          let matched = null;
          for (const sec of sections) {
            const trs = sec.querySelectorAll('tbody tr');
            for (const tr of trs) {
              const cells = tr.querySelectorAll('td');
              if (cells.length < 4) continue;
              const country = (cells[1]?.textContent || '').toLowerCase();
              const city = cells[2]?.textContent || '';
              if (country.includes(info.country.toLowerCase()) && (city.includes('其他') || /Other/i.test(city))) {
                tr.hidden = false;
                tr.classList.add('rt-fallback-row');
                sec.hidden = false;
                matched = { tr, country: cells[1]?.textContent || info.country, rate: cells[3]?.textContent || '' };
                break;
              }
            }
            if (matched) break;
          }
          if (matched && $banner) {
            $banner.style.display = '';
            const note = info.kind === 'neighbor'
              ? `比照鄰國 <strong>${info.country}</strong>(政府附註 §2)`
              : `屬 <strong>${info.country}</strong>(未列載,政府附註 §1)`;
            $banner.innerHTML = `💡 推測「<strong>${termRaw}</strong>」${note} → 自動套 <strong>${matched.country} / 其他</strong> → <strong style="font-family:var(--font-mono)">${matched.rate}</strong>`;
            return;
          }
        }
      }
      if ($banner) $banner.style.display = 'none';
    };
  });
}

async function openDrawer(idx) {
  const d = currentList[idx];
  if (!d) return;
  // 第一次開啟前記下卡片網格的 scroll 位置(關抽屜時還原,避免跳回頂端)
  if (currentIdx < 0) {
    const $main = document.querySelector('.main') || document.scrollingElement || document.documentElement;
    window._cardsScrollTop = $main?.scrollTop || window.scrollY || 0;
  }
  currentIdx = idx;
  document.querySelectorAll(".card").forEach(c => c.classList.toggle("active", c.dataset.id === d.id));
  // 更新翻頁 counter + disabled 狀態
  updateDrawerNav();
  // metadata 行 + 類別膠囊
  const reviewMeta = d.reviewLevel ? ` ${d.reviewLevel}` : '';
  document.getElementById("d-meta").innerHTML = `${d.id} <span class="sep"></span> ${d.updated || '尚未校對'}${reviewMeta} <span class="sep"></span> ${d.cat} · ${d.catLabel}`;
  if (typeof track === 'function') track('drawer_open', d.id, { parent: d.cat });
  if (typeof ga4 === 'function') ga4('view_item', { item_id: d.id, item_name: (d.title || d.id).slice(0, 80), item_category: d.cat });
  // 2026-05-02 #23:條文修法歷史 timeline(僅 A 類核心法規條文有意義)
  // 必須插在 .drawer-head 之外、.drawer-body 之上,否則會擠到 .drawer-row 的 flex 寬度
  let $vh = document.getElementById('d-version-history');
  if (Array.isArray(d.versionHistory) && d.versionHistory.length) {
    if (!$vh) {
      $vh = document.createElement('div');
      $vh.id = 'd-version-history';
      $vh.className = 'version-timeline';
      const $body = document.getElementById('d-body');
      if ($body && $body.parentNode) {
        $body.parentNode.insertBefore($vh, $body);
      }
    }
    $vh.innerHTML = `<div class="vh-head"><span class="vh-icon">📜</span><span>條文修法歷史(${d.versionHistory.length} 筆)</span></div>` +
      d.versionHistory.map((h, i) => {
        const isLatest = i === 0;
        return `<div class="vh-item${isLatest ? ' is-latest' : ''}">
          <span class="vh-dot"></span>
          <span class="vh-date">${escapeHtml(h.date || '')}</span>
          <span class="vh-change">${escapeHtml(h.change || '')}</span>
          ${h.replaces ? `<span class="vh-replaces" title="替代節點 ${h.replaces}">↩ ${escapeHtml(h.replaces)}</span>` : ''}
        </div>`;
      }).join('');
  } else if ($vh) {
    $vh.remove();
  }
  document.getElementById("d-title").textContent = buildCardTitleText(d, 'full');
  document.getElementById("d-tags").innerHTML = (d.tags || []).map(t => `<span class="tag">${t}</span>`).join("");
  // 重置 status badge 元素
  const oldStatus = document.getElementById("d-status");
  if (oldStatus) {
    oldStatus.outerHTML = statusBadge(d.status).replace("<span", "<span id=\"d-status\"");
  }
  // 載入 MD body
  const $body = document.getElementById("d-body");
  $body.innerHTML = '<p style="color:var(--ink-3);text-align:center;padding:30px">載入中…</p>';
  drawer.classList.add("show");
  scrim.classList.add("show");
  drawer.setAttribute("aria-hidden","false");
  document.body.classList.add("drawer-open");  // for browsers without :has()

  try {
    const r = await fetch(MD_BASE + d.filePath);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const md = await r.text();

    let bodyHtml = '';
    // Phase 4 信度系統強警示(2026-04-29):inferred / contested 節點頂部 banner
    if (d.certainty && d.certainty !== 'explicit') {
      const isContested = d.certainty === 'contested';
      const tag = isContested ? '⚠ 實務見解不一' : '⚠ 法規未明文,屬推論';
      const body = d.noInferenceNote || (isContested
        ? '此情形實務見解不一或法規未明確規範,本站不提供判斷,請逕洽主計室確認。'
        : '此情形依機關權責或實務認定,本站僅彙整法規條文,實際結果以主計室認定為準。');
      bodyHtml += `<div style="margin-bottom:14px;padding:12px 14px;background:var(--pastel-strawberry);border:1px solid var(--ink-strawberry);border-radius:var(--radius);color:var(--ink-strawberry);font-size:13px;line-height:1.6">
        <div style="font-weight:600;margin-bottom:4px">${tag}</div>
        <div>${body}</div>
        <div style="margin-top:6px;font-size:11.5px;color:var(--ink-strawberry);opacity:.85">📞 請勿以本站查詢結果作為報銷依據;如有疑義請逕洽主計室確認。</div>
      </div>`;
    }
    // 原始出處明顯連結 (放在 body 頂部, 比小 icon btn-source 更易發現)
    const srcUrl = resolveSourceUrl(d);
    if (srcUrl) {
      const cat = d.id.split('-')[0];
      // 依 URL 判斷目標,給出說明文字讓使用者知道會看到什麼
      let label, hint = '';
      if (srcUrl.includes('law.dgbas.gov.tw/LawContent.aspx')) {
        label = '主計總處法規查詢系統 — 完整法規';
        if (cat === 'A') hint = '官方系統不支援單一條文錨點,連結為整份法規,請於頁內搜尋條號';
        else if (cat === 'B') hint = '此費率表收錄於整份法規附表,請於頁內捲動查找';
      }
      else if (srcUrl.includes('News.aspx?n=1522')) { label = '主計總處 — 解釋彙編 / 公告索引'; hint = '官方僅提供索引列表,需於頁內查找對應彙編 PDF'; }
      else if (srcUrl.includes('cp.aspx?n=4322')) { label = '主計總處 — 經費結報常見疑義問答集'; hint = '官方僅提供 Q&A 集首頁,需於頁內捲動查找對應 Q'; }
      else if (srcUrl.includes('cp.aspx?n=4342')) { label = '主計總處 — 國內外旅費 Q&A 集'; hint = '官方僅提供 Q&A 集首頁,需於頁內捲動查找對應 Q'; }
      else if (srcUrl.includes('ebasnew.dgbas.gov.tw')) label = '主計總處內部審核公告';
      else if (srcUrl.includes('mofa.gov.tw')) label = '外交部相關公告';
      else label = '原始出處';
      bodyHtml += `<div style="margin-bottom:14px;padding:10px 12px;background:var(--brand-soft);border:1px solid var(--brand-line);border-radius:var(--radius);font-size:13px">
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:16px">📖</span>
          <span style="flex:1;color:var(--ink-2);font-weight:500">${label}</span>
          <a href="${srcUrl}" target="_blank" rel="noopener" style="color:var(--brand);font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:4px">前往 →</a>
        </div>
        ${hint ? `<div style="margin-top:6px;font-size:11.5px;color:var(--ink-3);line-height:1.5">💡 ${hint}</div>` : ''}
      </div>`;
    }
    // 重點摘要 (D 類通常是 Q&A,用「問題」+「回答」結構)
    if (d.art === 'qa') {
      const question = extractSection(md, '問題');
      const answer = extractSection(md, '回答') || extractSection(md, '答覆');
      if (question) bodyHtml += `<div class="section"><h3>問題</h3><div class="article" style="border-left:3px solid var(--brand);background:var(--brand-soft)">${question.replace(/\n/g, '<br>')}</div></div>`;
      if (answer) bodyHtml += `<div class="section"><h3>回答</h3><div class="article">${answer.replace(/\n/g, '<br>')}</div></div>`;
    }
    // B 類:rate_table 結構化渲染
    if (d.rateTable) {
      bodyHtml += `<div class="section"><h3>結構化費率表</h3>${renderRateTableHtml(d.rateTable, d)}</div>`;
    }
    // 重點摘要 (一般)
    const summary = extractSection(md, '重點摘要');
    if (summary && d.art !== 'qa') {
      bodyHtml += `<div class="section"><h3>重點摘要</h3><div class="article" style="background:var(--brand-soft);border-color:var(--brand-line)">${summary.replace(/\n/g, '<br>')}</div></div>`;
    }
    // 條文全文 / 函釋全文 / 標準全文
    const fullText = extractSection(md, '條文全文') || extractSection(md, '函釋全文') || extractSection(md, '標準全文') || extractSection(md, '函釋內容');
    if (fullText && !d.rateTable) {
      const heading = d.art === 'fn' ? '函釋全文' : (d.art === 'rate' ? '標準全文' : '條文全文');
      bodyHtml += `<div class="section"><h3>${heading}</h3><div class="article">${fullText.replace(/\n/g, '<br>')}</div></div>`;
    }
    // 相關規定 (從 node.related + INCOMING_EDGES)— 分「引用」與「被引用」兩段加方向標題
    const node = NODES_BY_ID.get(d.id);
    const outgoing = (node?.related || []).map(rid => NODES_BY_ID.get(rid)).filter(Boolean);
    const incoming = (INCOMING_EDGES.get(d.id) || []).map(rid => NODES_BY_ID.get(rid)).filter(Boolean);
    if (outgoing.length || incoming.length) {
      bodyHtml += `<div class="section"><h3>相關規定</h3>`;
      if (outgoing.length) {
        bodyHtml += `<div style="font-size:12px;color:var(--ink-3);font-weight:600;margin:6px 0 4px;letter-spacing:.04em">📤 本條引用了 <span style="color:var(--brand);font-weight:700">${outgoing.length}</span> 條</div><div class="related">`;
        for (const r of outgoing) {
          const cat = r.id.split('-')[0];
          const kind = cat === 'D' ? 'qa' : 'fn';
          bodyHtml += `<div class="related-item" data-jump="${r.id}">
            <span class="related-kind ${kind}">→ ${CAT_LABEL[cat] || cat}</span>
            <div class="related-text">${r.title}<small>${r.id} · ${r.parent}</small></div>
          </div>`;
        }
        bodyHtml += `</div>`;
      }
      if (incoming.length) {
        const shownIncoming = incoming.slice(0, 6);
        bodyHtml += `<div style="font-size:12px;color:var(--ink-3);font-weight:600;margin:14px 0 4px;letter-spacing:.04em">📥 本條被以下 <span style="color:var(--ok);font-weight:700">${incoming.length}</span> 條引用${incoming.length > 6 ? `(顯示前 6 條)` : ''}</div><div class="related">`;
        for (const r of shownIncoming) {
          const cat = r.id.split('-')[0];
          const kind = cat === 'D' ? 'qa' : 'fn';
          bodyHtml += `<div class="related-item" data-jump="${r.id}" style="border-left:3px solid var(--ok)">
            <span class="related-kind ${kind}">← ${CAT_LABEL[cat] || cat}</span>
            <div class="related-text">${r.title}<small>${r.id} · ${r.parent}</small></div>
          </div>`;
        }
        bodyHtml += `</div>`;
      }
      bodyHtml += `</div>`;
    }
    // 備註
    const note = extractSection(md, '備註');
    if (note && note.trim()) {
      bodyHtml += `<div class="section"><h3>備註</h3><div style="font-size:13px;color:var(--ink-2);padding:8px 12px;background:var(--surface-2);border-radius:6px">${note.replace(/\n/g, '<br>')}</div></div>`;
    }

    // Phase 4 標準免責(2026-04-29):每張卡都顯示,40 字版,常駐
    bodyHtml += `<div style="margin-top:18px;padding:10px 12px;background:var(--surface-2);border-left:3px solid var(--ink-3);border-radius:4px;font-size:12px;color:var(--ink-3);line-height:1.6">
      ⚖️ 本回答依現行法規及函釋整理,僅供查詢輔助使用,不構成行政核准依據。實際核銷以主計室審核為準,如有疑義請逕洽主計室確認。
    </div>`;

    if (!bodyHtml) bodyHtml = '<p style="color:var(--ink-3)">(此節點無詳細內容)</p>';
    $body.innerHTML = bodyHtml;
    // 綁 rate_table 互動 (保險 widget + 跨節搜尋)
    wireRateTableInteractions($body);
    // 綁 related-item 跳轉
    $body.querySelectorAll('[data-jump]').forEach(el => {
      el.style.cursor = 'pointer';
      el.onclick = () => {
        const target = el.dataset.jump;
        const targetIdx = currentList.findIndex(x => x.id === target);
        if (targetIdx >= 0) {
          openDrawer(targetIdx);
        } else {
          // 不在當前過濾結果內,重置 filter 後再開
          filterState.parent = null;
          filterState.type = null;
          filterState.tag = null;
          filterState.query = '';
          renderCards();
          const newIdx = currentList.findIndex(x => x.id === target);
          if (newIdx >= 0) openDrawer(newIdx);
        }
      };
    });
  } catch (e) {
    $body.innerHTML = `<p style="color:var(--stop)">載入失敗: ${e.message}</p>`;
  }
}

function closeDrawer() {
  drawer.classList.remove("show");
  scrim.classList.remove("show");
  drawer.setAttribute("aria-hidden","true");
  document.body.classList.remove("drawer-open");
  document.querySelectorAll(".card.active").forEach(c => c.classList.remove("active"));
  currentIdx = -1;
  // 還原卡片網格 scrollTop(避免關抽屜時跳回頂端)
  if (typeof window._cardsScrollTop === 'number') {
    const $main = document.querySelector('.main') || document.scrollingElement || document.documentElement;
    if ($main) $main.scrollTop = window._cardsScrollTop;
    else window.scrollTo({ top: window._cardsScrollTop });
    window._cardsScrollTop = undefined;
  }
}

function updateDrawerNav() {
  const $counter = document.getElementById('d-nav-counter');
  const $prev = document.getElementById('btn-prev');
  const $next = document.getElementById('btn-next');
  if (!$counter || !$prev || !$next) return;
  const total = currentList.length;
  if (currentIdx < 0 || total === 0) {
    $counter.textContent = '— / —';
    $prev.disabled = true;
    $next.disabled = true;
    return;
  }
  $counter.textContent = `${currentIdx + 1} / ${total}`;
  $prev.disabled = currentIdx === 0;
  $next.disabled = currentIdx === total - 1;
}

function move(delta) {
  if (currentIdx < 0) return;
  const n = currentIdx + delta;
  // 到頭 / 到尾就不再循環(配合 disabled 按鈕)
  if (n < 0 || n >= currentList.length) return;
  openDrawer(n);
  const card = document.querySelector(`.card[data-id="${currentList[n].id}"]`);
  card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

grid.addEventListener("click", e => {
  if (e.target.closest("[data-cmp-toggle]")) {
    e.stopPropagation();
    const card = e.target.closest(".card");
    if (card) toggleCompare(card.dataset.id);
    return;
  }
  const card = e.target.closest(".card");
  if (!card) return;
  const idx = currentList.findIndex(d => d.id === card.dataset.id);
  if (idx >= 0) openDrawer(idx);
});
grid.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const card = e.target.closest(".card");
    if (card) {
      const idx = currentList.findIndex(d => d.id === card.dataset.id);
      if (idx >= 0) openDrawer(idx);
    }
  }
});

document.getElementById("btn-prev").addEventListener("click", () => move(-1));
document.getElementById("btn-next").addEventListener("click", () => move(1));
document.getElementById("btn-close").addEventListener("click", closeDrawer);
scrim.addEventListener("click", closeDrawer);

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !document.getElementById('cmp-modal').classList.contains('show')) closeDrawer();
  if (drawer.classList.contains("show")) {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); move(1); }
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openCmdK();
  }
});


/* ──────── Spotlight Command Palette (⌘K) ──────── */
const CMDK_LIMIT = 60;
let _cmdkActiveIdx = 0;

function openCmdK() {
  const $ov = document.getElementById('cmdk-overlay');
  if (!$ov) return;
  $ov.classList.add('show');
  $ov.setAttribute('aria-hidden', 'false');
  const $input = document.getElementById('cmdk-input');
  if ($input) {
    $input.value = '';
    setTimeout(() => $input.focus(), 50);
  }
  _cmdkActiveIdx = 0;
  renderCmdK('');
}
function closeCmdK() {
  const $ov = document.getElementById('cmdk-overlay');
  if (!$ov) return;
  $ov.classList.remove('show');
  $ov.setAttribute('aria-hidden', 'true');
}

/* 取得目前所有可選項目(view + scenarios + nodes)*/
function _cmdkAllItems() {
  const items = [];
  // 三個主 view
  items.push({ kind: 'view', kindLabel: '頁面', label: '前往 · 情境檢索', sub: '依情境快速找對應規定', action: () => { closeCmdK(); switchView('scenarios'); renderScenarios?.(); } });
  items.push({ kind: 'view', kindLabel: '頁面', label: '前往 · 條文庫', sub: '所有條文與函釋', action: () => { closeCmdK(); switchView('library'); renderCards?.(); } });
  items.push({ kind: 'view', kindLabel: '頁面', label: '前往 · 試算表', sub: '生活費 + 保險費試算', action: () => { closeCmdK(); switchView('calc'); renderCalc?.(); } });
  // scenarios
  for (const s of (SCENARIOS || [])) {
    items.push({
      kind: 'scenario', kindLabel: '情境',
      label: `${s.icon || '🧭'} ${s.title}`,
      sub: s.subtitle || '',
      action: () => { closeCmdK(); applyScenarioFromCmdK(s); }
    });
  }
  // nodes
  for (const d of (DATA || [])) {
    items.push({
      kind: 'node', kindLabel: d.id.split('-')[0],
      label: d.title || d.id,
      sub: `${d.id} · ${d.parent || ''}`,
      action: () => { closeCmdK(); jumpToCard(d.id); }
    });
  }
  return items;
}

function applyScenarioFromCmdK(sc) {
  filterState.scenario = sc.id;
  filterState.parent = sc.parent || null;
  filterState.type = null; filterState.tag = null; filterState.expense = null;
  filterState.query = '';
  const $q = document.getElementById('q'); if ($q) $q.value = '';
  switchView('library');
  renderSidebar?.(); renderChips?.(); renderCards?.();
  if (typeof flashHint === 'function') flashHint(`套用情境:${sc.title}`);
}

function _cmdkFilter(items, q) {
  if (!q) {
    // 空 query:常用情境置頂(前 3 view + 前 8 scenarios)
    const out = [];
    out.push(...items.filter(it => it.kind === 'view'));
    out.push(...items.filter(it => it.kind === 'scenario').slice(0, 12));
    return out.slice(0, CMDK_LIMIT);
  }
  const ql = q.toLowerCase().trim();
  // 同義詞展開
  const expanded = (typeof expandSynonyms === 'function') ? expandSynonyms(ql) : [ql];
  return items
    .map(it => {
      const hay = (it.label + ' ' + (it.sub || '')).toLowerCase();
      // 檢查任一展開詞是否命中,記下實際命中的詞
      let hit = false; let matchedSyn = null;
      for (let i = 0; i < expanded.length; i++) {
        if (hay.includes(expanded[i])) {
          hit = true;
          if (i > 0 && !matchedSyn) matchedSyn = expanded[i];
          break;
        }
      }
      if (!hit) return null;
      // 排序:view > scenario > node;同分內標題命中優先
      const score = (it.kind === 'view' ? 30 : it.kind === 'scenario' ? 20 : 10)
        + (it.label.toLowerCase().includes(ql) ? 50 : 0);
      return { it, score, matchedSyn };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, CMDK_LIMIT)
    .map(x => ({ ...x.it, matchedSyn: x.matchedSyn }));
}

function renderCmdK(q) {
  const $list = document.getElementById('cmdk-list');
  if (!$list) return;
  const all = _cmdkAllItems();
  const filtered = _cmdkFilter(all, q);
  if (!filtered.length) {
    $list.innerHTML = `<div class="cmdk-empty">沒有結果。試試更短的關鍵字,或空白看常用情境清單。</div>`;
    return;
  }
  // 分組顯示:view / scenario / node 各一段
  const groups = [
    { kind: 'view', title: '頁面' },
    { kind: 'scenario', title: '情境' },
    { kind: 'node', title: '條文 / 函釋 / 標準 / 問答' },
  ];
  let html = '';
  let runningIdx = 0;
  for (const g of groups) {
    const items = filtered.filter(it => it.kind === g.kind);
    if (!items.length) continue;
    html += `<div class="cmdk-group-h">${g.title}</div>`;
    for (const it of items) {
      const synSuffix = it.matchedSyn ? ` <span class="syn-badge" style="vertical-align:baseline">≈ ${escapeHtml(it.matchedSyn)}</span>` : '';
      const idx = runningIdx++;
      html += `<button class="cmdk-item kind-${it.kind} ${idx === _cmdkActiveIdx ? 'on' : ''}" data-cmdk-i="${idx}" type="button">
        <span class="cmdk-kind">${escapeHtml(it.kindLabel)}</span>
        <span class="cmdk-label">
          <span class="cmdk-label-main">${escapeHtml(it.label)}${synSuffix}</span>
          ${it.sub ? `<span class="cmdk-label-sub">${escapeHtml(it.sub)}</span>` : ''}
        </span>
        <span class="cmdk-arrow">↵</span>
      </button>`;
    }
  }
  $list.innerHTML = html;
  // 暫存平展後的順序給 keyboard nav 用
  $list._items = filtered;
  // click handlers
  $list.querySelectorAll('[data-cmdk-i]').forEach(el => {
    el.onclick = () => {
      const i = parseInt(el.dataset.cmdkI, 10);
      filtered[i]?.action?.();
    };
    el.onmouseenter = () => {
      _cmdkActiveIdx = parseInt(el.dataset.cmdkI, 10);
      $list.querySelectorAll('.cmdk-item').forEach((b, j) => b.classList.toggle('on', j === _cmdkActiveIdx));
    };
  });
  // 若 active idx 超出範圍,reset
  if (_cmdkActiveIdx >= filtered.length) _cmdkActiveIdx = 0;
}

/* 鍵盤事件:input + window 雙層 */
document.addEventListener('input', (e) => {
  if (e.target?.id === 'cmdk-input') {
    _cmdkActiveIdx = 0;
    renderCmdK(e.target.value);
  }
});
document.addEventListener('keydown', (e) => {
  const $ov = document.getElementById('cmdk-overlay');
  if (!$ov || !$ov.classList.contains('show')) return;
  const $list = document.getElementById('cmdk-list');
  const items = $list?._items || [];
  if (e.key === 'Escape') {
    e.preventDefault(); closeCmdK(); return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _cmdkActiveIdx = Math.min(items.length - 1, _cmdkActiveIdx + 1);
    $list.querySelectorAll('.cmdk-item').forEach((b, j) => b.classList.toggle('on', j === _cmdkActiveIdx));
    $list.querySelector('.cmdk-item.on')?.scrollIntoView({ block: 'nearest' });
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    _cmdkActiveIdx = Math.max(0, _cmdkActiveIdx - 1);
    $list.querySelectorAll('.cmdk-item').forEach((b, j) => b.classList.toggle('on', j === _cmdkActiveIdx));
    $list.querySelector('.cmdk-item.on')?.scrollIntoView({ block: 'nearest' });
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    items[_cmdkActiveIdx]?.action?.();
  }
});
/* 點 backdrop 關閉 */
document.getElementById('cmdk-overlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'cmdk-overlay') closeCmdK();
});

document.getElementById("btn-copy").addEventListener("click", () => {
  if (currentIdx < 0) return;
  const d = currentList[currentIdx];
  navigator.clipboard?.writeText(`${d.id} ${buildCardTitleText(d, 'full')}`);
  flashHint("已複製：" + d.id);
});
// 已知 source_url 過弱 (連到首頁/列表) 的節點 → 改連更精確 URL
// 主計總處 News.aspx 與 cp.aspx 為彙編/Q&A 列表,沒辦法 deep link 但已是官方提供最深 URL,維持原樣
// mofa.gov.tw 首頁太弱 → 改連到主計總處國外旅費要點 (保險規定的法源依據)
const SOURCE_URL_OVERRIDE = {
  'B-國外旅費-006': 'https://law.dgbas.gov.tw/LawContent.aspx?id=FL017584',
  'B-國外旅費-007': 'https://law.dgbas.gov.tw/LawContent.aspx?id=FL017584',
};
function resolveSourceUrl(d) {
  return SOURCE_URL_OVERRIDE[d.id] || d.sourceUrl || '';
}
function openSourceUrlForCurrent() {
  if (currentIdx < 0) return;
  const d = currentList[currentIdx];
  const url = resolveSourceUrl(d);
  if (url) window.open(url, '_blank', 'noopener');
  else flashHint('此節點無原始出處');
}
document.getElementById("btn-source").addEventListener("click", openSourceUrlForCurrent);
// drawer footer 主按鈕「查看法規全文 →」=同 btn-source 功能,連到主計總處原始出處
document.getElementById("btn-prev-next")?.addEventListener("click", openSourceUrlForCurrent);


/* ──────── sidebar / chip / search 動態渲染 ──────── */
function renderSidebar() {
  // 入口計數 (核心法規 / 解釋函令 / 問答集 / 支出標準)
  const byType = { A: 0, B: 0, C: 0, D: 0 };
  for (const d of DATA) {
    const t = d.id.split('-')[0];
    if (byType[t] != null) byType[t]++;
  }
  // 母題計數
  const byParent = {};
  for (const d of DATA) byParent[d.cat] = (byParent[d.cat] || 0) + 1;

  const sideItems = [`
    <div class="nav-group">
      <div class="nav-label">入口</div>
      <div class="nav-item${currentView === 'scenarios' ? ' active' : ''}" data-entry="scenarios"><span>🧭 情境檢索</span><span class="nav-count">${SCENARIOS.length}</span></div>
      <div class="nav-item${currentView === 'library' ? ' active' : ''}" data-entry="library"><span>📑 條文庫</span><span class="nav-count">${DATA.length}</span></div>
      <div class="nav-item${currentView === 'calc' ? ' active' : ''}" data-entry="calc"><span>🧮 試算表</span><span class="nav-count">2</span></div>
    </div>
    <div class="nav-group">
      <div class="nav-label">母題</div>
      <div class="nav-item${filterState.parent === null ? ' active' : ''}" data-parent=""><span>全部</span><span class="nav-count">${DATA.length}</span></div>
      ${PARENTS.map(p => `<div class="nav-item${filterState.parent === p ? ' active' : ''}" data-parent="${p}"><span>${p}</span><span class="nav-count">${byParent[p] || 0}</span></div>`).join('')}
    </div>
    <div class="nav-group">
      <div class="nav-label">類別</div>
      <div class="nav-item${filterState.type === null ? ' active' : ''}" data-type=""><span>全部</span><span class="nav-count">${DATA.length}</span></div>
      <div class="nav-item${filterState.type === 'A' ? ' active' : ''}" data-type="A"><span>📑 核心法規</span><span class="nav-count">${byType.A}</span></div>
      <div class="nav-item${filterState.type === 'B' ? ' active' : ''}" data-type="B"><span>📊 支出標準</span><span class="nav-count">${byType.B}</span></div>
      <div class="nav-item${filterState.type === 'C' ? ' active' : ''}" data-type="C"><span>📜 解釋函令</span><span class="nav-count">${byType.C}</span></div>
      <div class="nav-item${filterState.type === 'D' ? ' active' : ''}" data-type="D"><span>💬 問答集</span><span class="nav-count">${byType.D}</span></div>
    </div>
  `];
  // 替換 sidebar 內 nav-group
  const side = document.querySelector('.side');
  if (!side) return;   // sidebar 已於 0623e9c 移除,以 topnav 取代;此函式保留邏輯但不渲染
  // 保留 brand,只替換之後的 nav-group
  const brand = side.querySelector('.brand');
  side.innerHTML = '';
  side.appendChild(brand);
  // 更新節點數副標
  const brandText = brand.querySelector('.brand-text small');
  if (brandText) brandText.textContent = `${DATA.length} 節點`;
  side.insertAdjacentHTML('beforeend', sideItems.join(''));

  // 綁 click
  side.querySelectorAll('.nav-item').forEach(it => {
    it.onclick = () => {
      if (it.dataset.entry) {
        switchView(it.dataset.entry);
        if (it.dataset.entry === 'scenarios') renderScenarios();
        if (it.dataset.entry === 'calc') renderCalc();
        renderSidebar();
        return;
      }
      // type / parent filter 點擊也要切回 library view
      if (currentView !== 'library') switchView('library');
      if (it.dataset.type !== undefined) {
        filterState.type = it.dataset.type || null;
      }
      if (it.dataset.parent !== undefined) {
        filterState.parent = it.dataset.parent || null;
      }
      renderSidebar();
      renderChips();
      renderCards();
    };
  });
}

function renderChips() {
  const $parentRow = document.getElementById('lib-parent-row');
  const $typeRow = document.getElementById('lib-type-row');
  const $expRow = document.getElementById('lib-expense-row');
  const $tagRow = document.getElementById('lib-tag-row');
  if (!$expRow || !$tagRow) return;

  const TAG_MATCH_THRESHOLD = 2;

  /* 第一排:母題 chips(國內旅費 / 國外旅費 / 支出憑證與結報)
     基準:忽略 parent filter 後其他條件下的命中,點擊即套用 filterState.parent */
  const passNonParent = (d) => {
    if (!PARENTS.includes(d.cat)) return false;
    if (!filterState.showObsolete && d.status === '已廢止' && !d.effectivePeriod) return false;
    if (filterState.type && d.id.split('-')[0] !== filterState.type) return false;
    if (filterState.expense && !nodeMatchesExpense(d, filterState.expense)) return false;
    if (filterState.scenario) {
      const sc = SCENARIOS.find(s => s.id === filterState.scenario);
      if (sc) {
        const inP = (sc.primary_ids || []).includes(d.id);
        const tagOverlap = (d.tags || []).filter(t => (sc.tags || []).includes(t)).length;
        if (!inP && tagOverlap < TAG_MATCH_THRESHOLD) return false;
      }
    }
    return true;
  };
  const byParent = new Map();
  let parentAll = 0;
  for (const d of DATA) {
    if (!passNonParent(d)) continue;
    parentAll++;
    const p = d.cat || '其他';
    byParent.set(p, (byParent.get(p) || 0) + 1);
  }
  if ($parentRow) {
    const visibleParents = PARENTS.filter(p => !WIP_PARENTS.has(p) && byParent.has(p));
    const wipChips = [...WIP_PARENTS].map(p =>
      `<button class="chip chip-wip" disabled title="整備中，內容尚未完整">${p} <span class="chip-count">–</span></button>`
    ).join('');
    $parentRow.innerHTML = `
      <span class="filterrow-label">母題</span>
      <button class="chip${!filterState.parent ? ' on' : ''}" data-parent="">全部 <span class="chip-count">${parentAll}</span></button>
      ${visibleParents.map(p => `<button class="chip${filterState.parent === p ? ' on' : ''}" data-parent="${p}">${p} <span class="chip-count">${byParent.get(p)}</span></button>`).join('')}
      ${wipChips}
    `;
  }

  /* 第二排:類別 chips(A 核心法規 / B 支出標準 / C 解釋函令 / D 問答集)
     基準:忽略 type filter 後其他條件下的命中,點擊即套用 filterState.type */
  const passNonType = (d) => {
    if (!PARENTS.includes(d.cat)) return false;
    if (!filterState.showObsolete && d.status === '已廢止' && !d.effectivePeriod) return false;
    if (filterState.parent && d.cat !== filterState.parent) return false;
    if (filterState.expense && !nodeMatchesExpense(d, filterState.expense)) return false;
    if (filterState.scenario) {
      const sc = SCENARIOS.find(s => s.id === filterState.scenario);
      if (sc) {
        const inP = (sc.primary_ids || []).includes(d.id);
        const tagOverlap = (d.tags || []).filter(t => (sc.tags || []).includes(t)).length;
        if (!inP && tagOverlap < TAG_MATCH_THRESHOLD) return false;
      }
    }
    return true;
  };
  const byType = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  let typeAll = 0;
  for (const d of DATA) {
    if (!passNonType(d)) continue;
    const t = d.id.split('-')[0];
    if (byType[t] !== undefined) byType[t]++;
    if (t !== 'E') typeAll++;  // E類不計入「全部」計數
  }
  if ($typeRow) {
    const TYPES = [
      { k: 'A', label: '核心法規', icon: '📑' },
      { k: 'B', label: '支出標準', icon: '📊' },
      { k: 'C', label: '解釋函令', icon: '📜' },
      { k: 'D', label: '問答集',   icon: '💬' },
    ];
    $typeRow.innerHTML = `
      <span class="filterrow-label">類別</span>
      <button class="chip${!filterState.type ? ' on' : ''}" data-type="">全部 <span class="chip-count">${typeAll}</span></button>
      ${TYPES.map(t => `<button class="chip${filterState.type === t.k ? ' on' : ''}" data-type="${t.k}">${t.icon} ${t.label} <span class="chip-count">${byType[t.k]}</span></button>`).join('')}
      <button class="chip chip-e-hidden${filterState.type === 'E' ? ' on' : ''}" data-type="E">📎 附屬資料 <span class="chip-count">${byType.E}</span></button>
    `;
  }

  /* 第二排:支出類別 chips(基準:忽略 expense filter 後其他條件下的命中)
     scenario filter 用與 filteredData 相同的「primary 或 ≥2 tag」收緊邏輯,
     避免 chip count 與實際卡片數字不一致。*/
  const baseline = DATA.filter(d => {
    if (!PARENTS.includes(d.cat)) return false;
    if (!filterState.showObsolete && d.status === '已廢止' && !d.effectivePeriod) return false;
    if (filterState.parent && d.cat !== filterState.parent) return false;
    // E類附屬資料不計入支出類別 chip 計數
    if (d.id.split('-')[0] === 'E' && filterState.type !== 'E') return false;
    if (filterState.type && d.id.split('-')[0] !== filterState.type) return false;
    if (filterState.scenario) {
      const sc = SCENARIOS.find(s => s.id === filterState.scenario);
      if (sc) {
        const inP = (sc.primary_ids || []).includes(d.id);
        const tagOverlap = (d.tags || []).filter(t => (sc.tags || []).includes(t)).length;
        if (!inP && tagOverlap < TAG_MATCH_THRESHOLD) return false;
      }
    }
    return true;
  });
  const expCount = {};
  for (const e of EXPENSE_LIST) expCount[e] = 0;
  for (const d of baseline) {
    let matched = false;
    for (const t of (d.tags || [])) {
      if (EXPENSE_LIST.includes(t) && t !== '程序與通則') {
        expCount[t] = (expCount[t] || 0) + 1;
        matched = true;
      }
    }
    if (!matched) expCount['程序與通則']++;
  }
  /* 支出類別:預設只顯示 top 6 + 「+ N 類」展開按鈕(目前選中的也保留可見)
     若有 parent filter 且 EXPENSE_LAYER 有定義,只顯示該母題允許的支出類別,
     避免跨類 tag 汙染(如 normalize_tags 替 酬勞費 節點加了 交通費 tag)。*/
  const _expAllowed = (filterState.parent && EXPENSE_LAYER[filterState.parent])
    ? new Set(EXPENSE_LAYER[filterState.parent])
    : null;
  const visibleExpenses = EXPENSE_LIST.filter(e => expCount[e] > 0 && (!_expAllowed || _expAllowed.has(e)));
  const TOP_EXP = 6;
  const expanded = window._expExpanded === true;
  let visibleSet;
  if (expanded || visibleExpenses.length <= TOP_EXP) {
    visibleSet = new Set(visibleExpenses);
  } else {
    // 取前 6 名(依命中數,但保證 selected 在內)
    const sorted = [...visibleExpenses].sort((a,b) => expCount[b] - expCount[a]).slice(0, TOP_EXP);
    visibleSet = new Set(sorted);
    if (filterState.expense) visibleSet.add(filterState.expense);
  }
  const hiddenCount = visibleExpenses.length - visibleSet.size;
  $expRow.innerHTML = `
    <span class="filterrow-label">支出類別</span>
    <button class="chip${!filterState.expense ? ' on' : ''}" data-expense="">全部 <span class="chip-count">${baseline.length}</span></button>
    ${visibleExpenses.filter(e => visibleSet.has(e)).map(e =>
      `<button class="chip${filterState.expense === e ? ' on' : ''}" data-expense="${e}">${e} <span class="chip-count">${expCount[e]}</span></button>`
    ).join('')}
    ${hiddenCount > 0 ? `<button class="chip chip-toggle-more" data-toggle-exp="expand">+ ${hiddenCount} 類別 ▾</button>` : ''}
    ${expanded && visibleExpenses.length > TOP_EXP ? `<button class="chip chip-toggle-more" data-toggle-exp="collapse">收起 ▴</button>` : ''}
  `;

  /* 第三排:依當前過濾後熱門 tags(動態) */
  const tagCount = new Map();
  const filtered = filteredData();
  for (const d of filtered) {
    for (const t of (d.tags || [])) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  }
  const topTags = [...tagCount.entries()]
    .filter(([t]) => !EXPENSE_LIST.includes(t))   // 已是 expense 的不重複出現
    .sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (topTags.length) {
    /* 熱門標籤:預設摺疊(除非已選中其中一個)以節省 first fold */
    const tagExpanded = window._tagExpanded === true || !!filterState.tag;
    if (tagExpanded) {
      $tagRow.innerHTML = `
        <span class="filterrow-label">熱門標籤</span>
        <button class="chip${!filterState.tag ? ' on' : ''}" data-tag="">全部</button>
        ${topTags.map(([t, c]) => `<button class="chip${filterState.tag === t ? ' on' : ''}" data-tag="${t}">${t} <span class="chip-count">${c}</span></button>`).join('')}
        <button class="chip chip-toggle-more" data-toggle-tag="collapse">收起 ▴</button>
      `;
    } else {
      $tagRow.innerHTML = `
        <span class="filterrow-label">熱門標籤</span>
        <button class="chip chip-toggle-more" data-toggle-tag="expand">展開 ${topTags.length} 個熱門標籤 ▾</button>
      `;
    }
  } else {
    $tagRow.innerHTML = '';
  }

  // 綁 click
  if ($parentRow) {
    $parentRow.querySelectorAll('[data-parent]').forEach(b => b.onclick = () => {
      filterState.parent = b.dataset.parent || null;
      // 切換母題時清掉支出類別與類別 filter,避免空集合
      filterState.expense = null;
      filterState.type = null;
      renderSidebar?.(); renderChips(); renderCards();
    });
  }
  if ($typeRow) {
    $typeRow.querySelectorAll('[data-type]').forEach(b => b.onclick = () => {
      filterState.type = b.dataset.type || null;
      renderChips(); renderCards();
    });
  }
  $expRow.querySelectorAll('[data-expense]').forEach(b => b.onclick = () => {
    filterState.expense = b.dataset.expense || null;
    renderChips(); renderCards();
  });
  $expRow.querySelectorAll('[data-toggle-exp]').forEach(b => b.onclick = () => {
    window._expExpanded = b.dataset.toggleExp === 'expand';
    renderChips();
  });
  $tagRow.querySelectorAll('[data-toggle-tag]').forEach(b => b.onclick = () => {
    window._tagExpanded = b.dataset.toggleTag === 'expand';
    renderChips();
  });
  $tagRow.querySelectorAll('[data-tag]').forEach(b => b.onclick = () => {
    filterState.tag = b.dataset.tag || null;
    renderChips(); renderCards();
  });
}

// 搜尋 input(全站共用)— 打字時自動切到條文庫並過濾
document.getElementById('q').addEventListener('input', (ev) => {
  filterState.query = ev.target.value;
  // 若在情境/試算表視圖,有搜尋字時自動切到條文庫
  if (filterState.query.trim() && currentView !== 'library') {
    switchView('library');
    renderSidebar();
  }
  renderChips();
  renderCards();
});

/* 2026-04-29:topbar 篩選 popup 已移除,改成 view-library 內的 inline 三排 chip(由 renderChips() 負責)。 */


/* ──────── scenarios view ──────── */
const PARENT_ORDER = ['支出憑證與結報', '國內旅費', '酬勞費', '國外旅費', '國外專家', '教育部專章', '國科會專章', '其他'];
const EXPENSE_ORDER = ['交通費','住宿費','雜費','出國進修','生活費','手續費','保險費','行政費','禮品交際及雜費','收據與發票','採購結報','系統化結報','補助與分攤','差旅費結報','酬勞與會議','講座鐘點費','出席費','稿費','兼職費','健保補充保費','程序與通則','通則與其他','大陸港澳','其他'];
// 顯示時將舊用語「通則與其他」一律呈現為「程序與通則」(資料源不動,維持向下相容)
const EXPENSE_DISPLAY_RENAME = { '通則與其他': '程序與通則' };
function renameExpense(e) { return EXPENSE_DISPLAY_RENAME[e] || e; }
let scenarioQuery = '';
// 情境視圖 chip filter state(2026-04-29 加)
let scenarioFilterParent = null;   // null = 全部
let scenarioFilterExpense = null;  // null = 全部

/* ─── 情境 lazy-render state(2026-04-30 加,行動版避免一次 render 117 卡)─── */
const _SCN_INITIAL_SECTIONS = 3;   // 首屏 render 的 section 數
const _SCN_CHUNK_SECTIONS = 3;     // 每次補幾個 section
let _scnSortedKeys = [];
let _scnGroups = new Map();
let _scnSeenParent = new Set();
let _scnSectionsRendered = 0;
let _scnObserver = null;

function _renderScenarioSectionHtml(key) {
  const [parent, expense] = key.split('|');
  const items = _scnGroups.get(key) || [];
  let anchorHtml = '';
  if (!_scnSeenParent.has(parent)) {
    _scnSeenParent.add(parent);
    anchorHtml = `<div id="sc-anchor-${parent}" style="position:relative;top:-60px"></div>`;
  }
  return `${anchorHtml}
    <section class="sc-group">
      <h3 class="sc-group-title">
        <span>${parent} · ${expense}</span>
        <span class="sc-group-count">${items.length}</span>
      </h3>
      <div class="sc-grid">
        ${items.map(s => {
          const hasFlow = s.flow && s.flow.start && s.flow.questions;
          const flowBadge = hasFlow ? '<span class="sc-flow-badge">🤔 條件問答</span>' : '';
          const isRoot = s.flow_root === true && Array.isArray(s.sub_scenarios) && s.sub_scenarios.length > 0;
          const rootBadge = isRoot ? `<span class="sc-root-badge" title="此為情境樹根節點 — 整合 ${s.sub_scenarios.length} 個子情境">🗂 ${s.sub_scenarios.length} 子情境</span>` : '';
          const matched = countScenarioMatches(s);
          // 2026-05-XX:has-flow 卡加雙按鈕「開始問答」+「📑 看條文」(P0-6),讓不想走問答的人也能直跳法源
          const actionsHtml = hasFlow ? `
            <div class="sc-actions">
              <button class="sc-flow-start" data-flow="${s.id}" type="button"><svg class="icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></svg>開始問答</button>
              <button class="sc-view-lib" data-view-lib="${s.id}" type="button" title="跳到條文庫,看相關法源(不走問答)">📑 看條文</button>
            </div>` : '';
          return `
            <article class="sc-card${hasFlow ? ' has-flow' : ''}${isRoot ? ' is-root' : ''}" data-sc="${s.id}" tabindex="0">
              <div class="sc-icon">${s.icon || '📌'}</div>
              <h3 class="sc-title">${s.title}${flowBadge}${rootBadge}</h3>
              <p class="sc-subtitle">${s.subtitle || ''}</p>
              ${actionsHtml}
              <div class="sc-meta">
                <span class="sc-meta-count">${matched} 張相關卡</span>
                <span class="sc-meta-arrow">查看 →</span>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </section>`;
}

function appendScenarioChunk() {
  const $list = document.getElementById('sc-list');
  if (!$list || _scnSectionsRendered >= _scnSortedKeys.length) return;
  const start = _scnSectionsRendered;
  const chunkSize = _scnSectionsRendered === 0 ? _SCN_INITIAL_SECTIONS : _SCN_CHUNK_SECTIONS;
  const end = Math.min(start + chunkSize, _scnSortedKeys.length);
  // 移除舊 sentinel
  $list.querySelector('.lazy-sentinel-scn')?.remove();
  let html = '';
  for (let i = start; i < end; i++) html += _renderScenarioSectionHtml(_scnSortedKeys[i]);
  $list.insertAdjacentHTML('beforeend', html);
  _scnSectionsRendered = end;
  // 還有未渲染的 section → 放 sentinel
  if (_scnSectionsRendered < _scnSortedKeys.length) {
    const remaining = _scnSortedKeys.length - _scnSectionsRendered;
    const sentinel = document.createElement('div');
    sentinel.className = 'lazy-sentinel-scn';
    sentinel.innerHTML = `<button class="btn lazy-loadmore" type="button" style="width:100%;padding:14px;color:var(--ink-3);background:var(--surface-2);border:1px dashed var(--line-strong);margin:8px 0">載入更多情境分組 ↓ <span style="opacity:.7;margin-left:6px">(還有 ${remaining} 組)</span></button>`;
    $list.appendChild(sentinel);
    sentinel.querySelector('.lazy-loadmore').onclick = () => appendScenarioChunk();
    _scnObserver = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        _scnObserver?.disconnect();
        _scnObserver = null;
        appendScenarioChunk();
      }
    }, { rootMargin: '600px' });
    _scnObserver.observe(sentinel);
  }
}

function countScenarioMatches(sc) {
  // 2026-05-01 (P4-29) 計數收緊:
  // - primary_ids 命中(權威)→ 計入
  // - 純 tag 命中要 ≥2 tag AND 有具體支出類別 tag 重疊(避免「報支上限/覈實報支」泛 tag 誤命中)
  // - 若 scenario 有 expense,該節點 tag 中也要含同 expense(進一步收緊)
  // 結果:從原本 ~44 張誤命中收斂到 5-15 張真實相關
  const primary = new Set(sc.primary_ids || []);
  const tags = new Set(sc.tags || []);
  // 泛 tag(過於通用,不應單獨支撐 ≥2 命中)
  const GENERIC_TAGS = new Set(['報支上限', '覈實報支', '結報核銷', '出差規定', '原始憑證', '誠信原則']);
  const concreteTags = new Set([...tags].filter(t => !GENERIC_TAGS.has(t)));
  const TAG_MATCH_THRESHOLD = 2;
  let n = 0;
  for (const d of DATA) {
    if (sc.parent && d.cat !== sc.parent) continue;
    if (primary.has(d.id)) { n++; continue; }
    // 通泛 tag 不計入 overlap
    const overlapAll = (d.tags || []).filter(t => tags.has(t)).length;
    const overlapConcrete = (d.tags || []).filter(t => concreteTags.has(t)).length;
    // 必須:全 tag overlap ≥2 + 至少 1 個具體 tag(非全是泛 tag)
    if (overlapAll < TAG_MATCH_THRESHOLD || overlapConcrete < 1) continue;
    // 若 scenario 有 expense,節點也須含同 expense tag(若 expense 不在 EXPENSE_LIST 中視為跳過此檢)
    if (sc.expense && EXPENSE_LIST.includes(sc.expense)) {
      const hasExp = (d.tags || []).includes(sc.expense);
      if (!hasExp) continue;
    }
    n++;
  }
  return n;
}

function matchScenarioQuery(sc, q) {
  if (!q) return true;
  const ql = q.toLowerCase();
  const hay = (sc.title + ' ' + (sc.subtitle || '') + ' ' + (sc.tags || []).join(' ') + ' ' + (sc.parent || '') + ' ' + renameExpense(sc.expense || '')).toLowerCase();
  return hay.includes(ql);
}

function renderScenarioChips() {
  const $parentBar = document.getElementById('sc-parent-chips');
  const $expBar = document.getElementById('sc-expense-chips');
  if (!$parentBar || !$expBar) return;

  // 母題 chip 列(基於 query-filtered 集合計數;deprecated 卡不計)
  const queryFiltered = SCENARIOS.filter(s => !s.deprecated && matchScenarioQuery(s, scenarioQuery));
  const parentCount = new Map();
  for (const s of queryFiltered) {
    const p = s.parent || '其他';
    parentCount.set(p, (parentCount.get(p) || 0) + 1);
  }
  // library-link chips：已確認上線的母題中，有條文但尚無情境的母題，點擊跳條文庫
  const libLinkChips = PARENTS
    .filter(p => !parentCount.has(p) && !WIP_PARENTS.has(p))
    .map(p => {
      const cnt = DATA.filter(d => d.cat === p).length;
      return cnt > 0
        ? `<button class="chip chip-lib-link" data-sc-lib-parent="${p}" title="${p}目前尚無情境卡，點擊前往條文庫查閱 ${cnt} 筆條文">📑 ${p} <span class="chip-count">${cnt}</span></button>`
        : '';
    }).filter(Boolean);
  const parentChips = [
    `<button class="chip${!scenarioFilterParent ? ' on' : ''}" data-sc-parent="">全部 <span class="chip-count">${queryFiltered.length}</span></button>`,
    ...PARENT_ORDER.filter(p => parentCount.has(p)).map(p =>
      `<button class="chip${scenarioFilterParent === p ? ' on' : ''}" data-sc-parent="${p}">${p} <span class="chip-count">${parentCount.get(p)}</span></button>`
    ),
    ...libLinkChips,
  ];
  $parentBar.innerHTML = `<span class="sc-filterbar-label">母題</span>${parentChips.join('')}`;

  // 支出類別 chip 列(在當前母題 scope 下計數)
  const inScope = queryFiltered.filter(s => !scenarioFilterParent || s.parent === scenarioFilterParent);
  const expenseCount = new Map();
  for (const s of inScope) {
    const e = renameExpense(s.expense || '其他');
    expenseCount.set(e, (expenseCount.get(e) || 0) + 1);
  }
  if (expenseCount.size <= 1) {
    // 只有一類或無資料 → 隱藏支出類別列
    $expBar.innerHTML = '';
  } else {
    /* 預設顯示 top 6(依命中數)+「+N 類別 ▾」展開按鈕,選中的也保留可見 */
    const TOP_EXP = 6;
    const allExpenses = EXPENSE_ORDER.filter(e => expenseCount.has(e));
    const expanded = window._scExpExpanded === true;
    let visibleSet;
    if (expanded || allExpenses.length <= TOP_EXP) {
      visibleSet = new Set(allExpenses);
    } else {
      const sorted = [...allExpenses].sort((a, b) => expenseCount.get(b) - expenseCount.get(a)).slice(0, TOP_EXP);
      visibleSet = new Set(sorted);
      if (scenarioFilterExpense) visibleSet.add(scenarioFilterExpense);
    }
    const hiddenCount = allExpenses.length - visibleSet.size;
    const expChips = [
      `<button class="chip${!scenarioFilterExpense ? ' on' : ''}" data-sc-exp="">全部 <span class="chip-count">${inScope.length}</span></button>`,
      ...allExpenses.filter(e => visibleSet.has(e)).map(e =>
        `<button class="chip${scenarioFilterExpense === e ? ' on' : ''}" data-sc-exp="${e}">${e} <span class="chip-count">${expenseCount.get(e)}</span></button>`
      ),
    ];
    if (hiddenCount > 0) {
      expChips.push(`<button class="chip chip-toggle-more" data-toggle-sc-exp="expand">+ ${hiddenCount} 類別 ▾</button>`);
    } else if (expanded && allExpenses.length > TOP_EXP) {
      expChips.push(`<button class="chip chip-toggle-more" data-toggle-sc-exp="collapse">收起 ▴</button>`);
    }
    $expBar.innerHTML = `<span class="sc-filterbar-label">支出類別</span>${expChips.join('')}`;
  }

  // 綁 click
  $parentBar.querySelectorAll('[data-sc-parent]').forEach(b => {
    b.onclick = () => {
      scenarioFilterParent = b.dataset.scParent || null;
      scenarioFilterExpense = null;  // 切換母題時清掉支出類別 filter
      renderScenarios();
    };
  });
  // library-link chip：跳轉條文庫並套用母題 filter
  $parentBar.querySelectorAll('[data-sc-lib-parent]').forEach(b => {
    b.onclick = () => {
      filterState.parent = b.dataset.scLibParent;
      filterState.type = null; filterState.tag = null; filterState.expense = null; filterState.scenario = null; filterState.query = '';
      switchView('library');
      renderCards();
    };
  });
  $expBar.querySelectorAll('[data-sc-exp]').forEach(b => {
    b.onclick = () => {
      scenarioFilterExpense = b.dataset.scExp || null;
      renderScenarios();
    };
  });
  $expBar.querySelectorAll('[data-toggle-sc-exp]').forEach(b => {
    b.onclick = () => {
      window._scExpExpanded = b.dataset.toggleScExp === 'expand';
      renderScenarioChips();
    };
  });
}

function renderScenarios() {
  const $list = document.getElementById('sc-list');
  if (!$list) return;

  // 先 render 兩排 chip
  renderScenarioChips();

  // 套用 in-view query + chip filters
  const filtered = SCENARIOS.filter(s => {
    // 2026-05-01 (P2):deprecated 卡(被整併入 root flow)從主清單隱藏;
    // 仍可透過 hash 深 link 或 root 卡的 sub_scenarios 進入。
    if (s.deprecated) return false;
    // 只顯示已確認上線的母題
    if (!PARENTS.includes(s.parent)) return false;
    if (!matchScenarioQuery(s, scenarioQuery)) return false;
    if (scenarioFilterParent && s.parent !== scenarioFilterParent) return false;
    if (scenarioFilterExpense && renameExpense(s.expense || '其他') !== scenarioFilterExpense) return false;
    return true;
  });

  // 2026-05-01:Q&A strip 已移除(冗餘 — has-flow 卡本身已有「🤔 條件問答」徽章與「▶ 開始問答」按鈕)

  // 分組 by parent → expense
  const groups = new Map();
  for (const sc of filtered) {
    const expRaw = sc.expense || '其他';
    const exp = renameExpense(expRaw);
    const key = `${sc.parent}|${exp}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sc);
  }
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    const [pa, ea] = a.split('|'); const [pb, eb] = b.split('|');
    const pi = PARENT_ORDER.indexOf(pa) - PARENT_ORDER.indexOf(pb);
    if (pi !== 0) return pi;
    return EXPENSE_ORDER.indexOf(ea) - EXPENSE_ORDER.indexOf(eb);
  });

  // sc-toc 已移除(2026-04-30):功能與母題 chip 100% 重複,改用 chip 即可

  // 空結果
  if (sortedKeys.length === 0) {
    const queryHint = scenarioQuery ? `「${scenarioQuery}」` : '目前條件';
    $list.innerHTML = `<div class="sc-empty"><strong>找不到符合${queryHint}的情境</strong><br><span style="font-size:13px;color:var(--ink-3)">請改用更短關鍵字、清除搜尋,或切換母題 / 支出類別 chip</span><br><button class="btn" data-clear-q style="margin-top:10px">清除所有條件</button></div>`;
    $list.querySelector('[data-clear-q]')?.addEventListener('click', () => {
      const $input = document.getElementById('sc-q');
      const $clear = document.getElementById('sc-q-clear');
      if ($input) $input.value = '';
      if ($clear) $clear.hidden = true;
      scenarioQuery = '';
      scenarioFilterParent = null;
      scenarioFilterExpense = null;
      renderScenarios();
    });
    return;
  }

  // 延遲渲染:先 render 前 N section,捲到底再補
  _scnSortedKeys = sortedKeys;
  _scnGroups = groups;
  _scnSeenParent = new Set();
  _scnSectionsRendered = 0;
  if (_scnObserver) { _scnObserver.disconnect(); _scnObserver = null; }
  $list.innerHTML = '';
  appendScenarioChunk();

  // 用事件委派(在 $list 一次綁,後續 lazy-render 不需重綁)
  $list.onclick = (ev) => {
    const flowBtn = ev.target.closest('[data-flow]');
    if (flowBtn) {
      ev.stopPropagation();
      const sc = SCENARIOS.find(x => x.id === flowBtn.dataset.flow);
      if (sc) openFlowModal(sc);
      return;
    }
    // 2026-05-XX:「📑 看條文」次按鈕(P0-6)— 行為等同點卡片本體,但避免被 [data-flow] 攔截
    const viewLibBtn = ev.target.closest('[data-view-lib]');
    if (viewLibBtn) {
      ev.stopPropagation();
      // fallthrough 走下面卡片邏輯,但用 dataset.viewLib 當 id
      const id = viewLibBtn.dataset.viewLib;
      const sc = SCENARIOS.find(x => x.id === id);
      if (!sc) return;
      filterState.scenario = id;
      filterState.parent = sc.parent || null;
      filterState.type = null; filterState.tag = null; filterState.expense = null;
      switchView('library');
      renderSidebar(); renderChips(); renderCards();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      flashHint(`套用情境:${sc.title} · ${currentList.length} 張相關卡`);
      return;
    }
    const card = ev.target.closest('[data-sc]');
    if (!card) return;
    const id = card.dataset.sc;
    const sc = SCENARIOS.find(x => x.id === id);
    if (!sc) return;
    filterState.scenario = id;
    filterState.parent = sc.parent || null;
    filterState.type = null;
    filterState.tag = null;
    filterState.expense = null;
    switchView('library');
    renderSidebar();
    renderChips();
    renderCards();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (typeof track === 'function') track('scenario_apply', id);
    if (typeof ga4 === 'function') ga4('select_content', { content_type: 'scenario', item_id: id, content_id: (sc.title || '').slice(0, 80) });
    flashHint(`套用情境:${sc.title} · ${currentList.length} 張相關卡`);
  };
}



/* ──────── 試算表 view (日支生活費 + 保險費) ──────── */
function getRateTableNode(id) {
  return DATA.find(d => d.id === id);
}

// rate_table 儲存格可能是 string 或 {v, multiline, colspan} 物件,統一取字串值
function _cellStr(cell) {
  if (cell == null) return '';
  if (typeof cell === 'object') return String(cell.v ?? '').replace(/\n/g, ' / ');
  return String(cell);
}

function renderCalc() {
  const $g = document.getElementById('calc-grid');
  if (!$g) return;
  // 日支生活費資料來源:B-國外旅費-003 (全球 sectioned) + B-國外旅費-002 (大陸港澳 flat)
  const global = getRateTableNode('B-國外旅費-003');
  const mainland = getRateTableNode('B-國外旅費-002');
  // 派外進修補助表 (A-國外-024) — 月支生活費級距
  const studyAbroad = getRateTableNode('A-國外旅費-024');
  // 收集 (region, country, city, value) 給 select 用
  const rows = [];
  if (global?.rateTable?.sections) {
    for (const sec of global.rateTable.sections) {
      const region = sec.title || '';
      if (Array.isArray(sec.rows)) {
        for (const r of sec.rows) {
          // [編號, 國家, 城市, 數額]
          rows.push({
            label: `${region} · ${r[1]} · ${r[2]}`,
            shortLabel: `${r[1]} · ${r[2]}`,
            value: _cellStr(r[3]),
            country: _cellStr(r[1]),
            city: _cellStr(r[2]),
            sourceId: 'B-國外旅費-003',
            unit: global.rateTable.unit || '美元',
          });
        }
      }
    }
  }
  if (mainland?.rateTable?.rows) {
    for (const r of mainland.rateTable.rows) {
      rows.push({
        label: `大陸港澳 · ${r[1]}`,
        shortLabel: _cellStr(r[1]),
        value: _cellStr(r[2]),
        country: '大陸港澳',
        city: _cellStr(r[1]),
        sourceId: 'B-國外旅費-002',
        unit: mainland.rateTable.unit || '美元',
      });
    }
  }

  // 月支生活費級距 (A-國外-024 第一個 section)
  const monthlySection = studyAbroad?.rateTable?.sections?.[0];
  const monthlyRows = Array.isArray(monthlySection?.rows) ? monthlySection.rows : [];
  // [['410 以上', '1,700'], ['370–409', '1,600'], ...] — 解析為 {min, max, monthly}
  function parseMonthlyTier(row) {
    const range = (row[0] || '').replace(/\s/g, '');
    const monthly = parseInt((row[1] || '').replace(/,/g, ''), 10);
    let min, max;
    const m1 = range.match(/^(\d+)以上/);
    const m2 = range.match(/^(\d+)以下/);
    const m3 = range.match(/^(\d+)[–\-~](\d+)/);
    if (m1) { min = +m1[1]; max = Infinity; }
    else if (m2) { min = 0; max = +m2[1]; }
    else if (m3) { min = +m3[1]; max = +m3[2]; }
    return { range: row[0], min, max, monthly };
  }
  const monthlyTiers = monthlyRows.map(parseMonthlyTier).filter(t => Number.isFinite(t.min));
  function findMonthlyByDailyRate(daily) {
    return monthlyTiers.find(t => daily >= t.min && daily <= t.max);
  }

  // 保險費資料 (B-國外旅費-006 一般險/申根險)
  const insurance = getRateTableNode('B-國外旅費-006');
  const insSections = insurance?.rateTable?.sections?.filter(s => Array.isArray(s.rows) && s.rows.length).map(s => ({
    key: (s.title || '').replace(/\s*15足歲.*$/, '').trim(),
    rows: s.rows,
  })) || [];

  $g.innerHTML = `
    <div class="calc-card" id="calc-living">
      <h2><span class="calc-icon">💰</span>生活費試算<span style="font-size:11px;font-weight:500;color:var(--ink-3);margin-left:6px">(日支 + 派外進修月支)</span></h2>
      <p class="calc-card-desc">輸入城市 → 同時顯示日支 (B-國外-002/003) 與派外進修/研究/實習適用之月支 (A-國外-024)</p>
      <div class="calc-row">
        <label for="calc-city">選擇地區 / 城市 (共 ${rows.length} 筆)</label>
        <input type="search" id="calc-city" list="calc-city-list" placeholder="輸入城市,如 東京、Beijing、紐約、巴黎…">
        <datalist id="calc-city-list">
          ${rows.slice(0, 600).map(r => `<option value="${r.shortLabel}">`).join('')}
        </datalist>
      </div>
      <div class="calc-row calc-row-aux">
        <label for="calc-living-days">出差天數(可選 · 用於計算總額)</label>
        <input type="number" id="calc-living-days" min="1" max="365" placeholder="例如 7">
      </div>
      <div class="calc-row calc-row-aux">
        <label for="calc-living-pct">供膳宿情形</label>
        <div class="calc-tabs" id="calc-living-pct-tabs">
          ${[
            { v: 100, label: '100% 自理' },
            { v: 80,  label: '80% 供膳' },
            { v: 30,  label: '30% 供膳宿' },
            { v: 10,  label: '10% 全包' },
          ].map((o, i) => `<button class="calc-tab${i === 0 ? ' active' : ''}" data-pct="${o.v}" title="${o.label}">${o.v}%</button>`).join('')}
        </div>
      </div>
      <div class="calc-row calc-row-aux">
        <label for="calc-living-rate">💱 換算匯率(USD → NTD,可調整;預設 30)</label>
        <input type="number" id="calc-living-rate" min="20" max="40" step="0.1" value="30" inputmode="decimal" style="max-width:120px">
      </div>
      <div class="calc-result" id="calc-living-result">
        <div class="calc-result-label">請輸入或選擇地區</div>
      </div>
      <details class="calc-card-desc" style="margin-top:10px;font-size:12px"><summary style="cursor:pointer;color:var(--ink-2)">📋 月支級距對照表 + 計算規則</summary>
        <div style="margin-top:8px;background:var(--surface-2);border-radius:6px;padding:8px 10px">
          <div style="font-size:11px;color:var(--ink-3);margin-bottom:6px">日支數額級距(美元) → 月支生活費(美元)</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:12px">
            ${monthlyTiers.map(t => `<div style="display:flex;justify-content:space-between"><span>${t.range}</span><strong>${t.monthly?.toLocaleString() || ''}</strong></div>`).join('')}
          </div>
          <div style="font-size:11px;color:var(--ink-3);margin-top:8px;line-height:1.6">補充:出國 1~15 日按日支表全額;16~30 日每日為日支表 1/20;31 日起按月支表;畸零日按月支表 1/30。供膳宿 3 折、供宿不供膳 4 折、供膳不供宿 9 折。</div>
        </div>
      </details>
    </div>

    <div class="calc-card" id="calc-insurance">
      <h2><span class="calc-icon">🛡️</span>外交部保險費試算</h2>
      <p class="calc-card-desc">外交部因公赴國外出差綜合保險表(115 年版,15 足歲含以上)。資料來源:B-國外-006</p>
      <div class="calc-row">
        <label>險種</label>
        <div class="calc-tabs" id="calc-ins-tabs">
          ${insSections.map((s, i) => `<button class="calc-tab${i === 0 ? ' active' : ''}" data-ins-key="${s.key}">${s.key}</button>`).join('')}
        </div>
      </div>
      <div class="calc-row">
        <label for="calc-days">天數 (1-365)</label>
        <input type="number" id="calc-days" min="1" max="365" placeholder="輸入天數,如 30">
      </div>
      <div class="calc-result" id="calc-ins-result">
        <div class="calc-result-label">請選擇險種並輸入天數</div>
      </div>
    </div>
  `;

  // ── 生活費互動 (日支 + 月支同步顯示, 含未列載城市 alias fallback) ──
  const $cityInput = document.getElementById('calc-city');
  const $livingResult = document.getElementById('calc-living-result');
  const $livingDays = document.getElementById('calc-living-days');
  const $livingPctTabs = document.querySelectorAll('#calc-living-pct-tabs .calc-tab');
  let livingPct = 100;
  $livingPctTabs.forEach(t => t.onclick = () => {
    $livingPctTabs.forEach(x => x.classList.toggle('active', x === t));
    livingPct = parseInt(t.dataset.pct, 10);
    lookupLiving();
  });
  function lookupLiving() {
    const qRaw = ($cityInput.value || '').trim();
    const q = qRaw.toLowerCase();
    if (!q) {
      $livingResult.className = 'calc-result';
      $livingResult.innerHTML = '<div class="calc-result-label">請輸入或選擇地區</div>';
      return;
    }
    // 1) 直接命中:city / shortLabel substring 比對
    const exact = rows.find(r => r.city.toLowerCase() === q || r.shortLabel.toLowerCase() === q);
    let partial = exact || rows.find(r => r.city.toLowerCase().includes(q) || r.shortLabel.toLowerCase().includes(q));
    let isFallback = false;
    let aliasInfo = null;
    // 2) 找不到 → 走 alias fallback (推測國家 → 該國「其他」)
    if (!partial) {
      aliasInfo = inferCountryByAlias(qRaw);
      if (aliasInfo) {
        const otherRow = rows.find(r => r.country.toLowerCase().includes(aliasInfo.country.toLowerCase()) && (r.city.includes('其他') || /Other/i.test(r.city)));
        if (otherRow) {
          partial = otherRow;
          isFallback = true;
        }
      }
    }
    if (!partial) {
      $livingResult.className = 'calc-result';
      $livingResult.innerHTML = `<div class="calc-result-label">查無「${qRaw}」</div><div style="font-size:12px">試試輸入英文(Tokyo)、中文(東京)、或國家名(日本)。本表收錄之 ~40 個未列載城市可自動 fallback 至該國「其他」費率。</div>`;
      return;
    }
    const dailyVal = parseInt(String(partial.value).replace(/,/g, ''), 10);
    const tier = monthlyTiers.length ? findMonthlyByDailyRate(dailyVal) : null;
    const fallbackNote = aliasInfo && aliasInfo.kind === 'neighbor'
      ? `比照鄰國<strong>${aliasInfo.country}</strong>(政府附註 §2)`
      : `屬<strong>${aliasInfo?.country}</strong>(未列載,政府附註 §1)`;
    const fallbackBanner = isFallback ? `
      <div style="margin-bottom:8px;padding:8px 12px;background:var(--pastel-sky);border:1px solid var(--ink-sky);border-left:3px solid var(--ink-sky);border-radius:6px;font-size:12.5px;color:var(--ink-sky)">
        💡 推測「<strong>${qRaw}</strong>」${fallbackNote},自動取「其他」費率
      </div>` : '';
    // 計算總額(若使用者輸入了天數)
    const daysVal = parseInt($livingDays?.value, 10);
    const hasDays = Number.isFinite(daysVal) && daysVal > 0;
    // 匯率(預設 30,使用者可調整)— 僅 USD 適用
    const $rateInput = document.getElementById('calc-living-rate');
    const rawRate = parseFloat($rateInput?.value);
    const rate = Number.isFinite(rawRate) && rawRate > 0 ? rawRate : 30;
    const isUSD = /美元|USD/i.test(partial.unit);
    let formulaHtml = '';
    if (hasDays) {
      const dailyEffective = Math.round(dailyVal * livingPct / 100);
      const total = dailyEffective * daysVal;
      const pctNote = livingPct === 100 ? '' : ` × ${livingPct}%`;
      const ntdLine = isUSD ? `
        <div class="calc-formula-aux" style="margin-top:6px;display:flex;align-items:baseline;gap:6px;flex-wrap:wrap">
          <span style="color:var(--ink-3);font-size:12px">≈</span>
          <strong style="font-family:var(--font-mono);color:var(--ink-strawberry);font-size:16px">NT$ ${Math.round(total * rate).toLocaleString()}</strong>
          <span style="color:var(--ink-3);font-size:11.5px">(匯率 ${rate}${rawRate === 30 || !Number.isFinite(rawRate) ? ' · 預設' : ''} · 僅供估算,實際以核銷時銀行匯率為準)</span>
        </div>` : '';
      formulaHtml = `
        <div class="calc-formula">
          <span class="calc-formula-eq">${partial.value} ${partial.unit}/日${pctNote} × ${daysVal} 天</span>
          <span class="calc-formula-arrow">=</span>
          <span class="calc-formula-total">${total.toLocaleString()} ${partial.unit}</span>
        </div>
        ${ntdLine}`;
    } else {
      // 無天數 — 只顯示單日換算
      const ntdHint = isUSD ? `<div class="calc-formula-aux" style="margin-top:4px;color:var(--ink-3);font-size:12px">💱 單日 ≈ <strong style="color:var(--ink-strawberry);font-family:var(--font-mono)">NT$ ${Math.round(dailyVal * rate).toLocaleString()}</strong>(匯率 ${rate})</div>` : '';
      formulaHtml = `<div class="calc-formula calc-formula-hint">💡 輸入天數即可自動算總額</div>${ntdHint}`;
    }
    $livingResult.className = 'calc-result hit' + (isFallback ? ' is-fallback' : '');
    $livingResult.innerHTML = `
      ${fallbackBanner}
      <div class="calc-result-label">${partial.label}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:6px 0">
        <div style="padding:8px 10px;background:var(--surface);border:1px solid var(--brand-line);border-radius:6px">
          <div style="font-size:11px;color:var(--ink-3);font-weight:600;margin-bottom:2px">日支(短期 ≤15 日)</div>
          <div style="font-size:20px;font-weight:700;color:var(--brand);font-family:var(--font-mono);line-height:1.2">${partial.value}</div>
          <div style="font-size:11px;color:var(--ink-2)">${partial.unit}/日</div>
          <a class="calc-jump" data-jump-card="${partial.sourceId}" style="font-size:11px;margin-top:4px;display:inline-block">📑 ${partial.sourceId}</a>
        </div>
        <div style="padding:8px 10px;background:var(--surface);border:1px solid ${tier ? 'var(--brand-line)' : 'var(--line)'};border-radius:6px${tier ? '' : ';opacity:.55'}">
          <div style="font-size:11px;color:var(--ink-3);font-weight:600;margin-bottom:2px">月支(進修/實習 &gt;15 日)</div>
          ${tier ? `
            <div style="font-size:20px;font-weight:700;color:var(--brand);font-family:var(--font-mono);line-height:1.2">${tier.monthly.toLocaleString()}</div>
            <div style="font-size:11px;color:var(--ink-2)">美元/月 · 級距 ${tier.range}</div>
            <a class="calc-jump" data-jump-card="A-國外旅費-024" style="font-size:11px;margin-top:4px;display:inline-block">📑 A-國外-024</a>
          ` : `
            <div style="font-size:13px;color:var(--ink-3);margin-top:6px">無對應級距</div>
          `}
        </div>
      </div>
      ${formulaHtml}
      <div class="calc-result-meta">日支為每日全額上限;月支適用派外進修/研究/實習 &gt;15 日</div>
    `;
  }
  $cityInput.addEventListener('input', lookupLiving);
  $cityInput.addEventListener('change', lookupLiving);
  if ($livingDays) $livingDays.addEventListener('input', lookupLiving);
  // 匯率變動即時重算(2026-05-XX 加,P1-8 台幣換算)
  const $livingRate = document.getElementById('calc-living-rate');
  if ($livingRate) $livingRate.addEventListener('input', lookupLiving);

  // ── 保險費互動 ──
  const $tabs = document.querySelectorAll('#calc-ins-tabs .calc-tab');
  const $daysInput = document.getElementById('calc-days');
  const $insResult = document.getElementById('calc-ins-result');
  let activeInsKey = insSections[0]?.key || '';
  function lookupIns() {
    const days = parseInt($daysInput.value, 10);
    if (!activeInsKey || !days) {
      $insResult.className = 'calc-result';
      $insResult.innerHTML = '<div class="calc-result-label">請選擇險種並輸入天數</div>';
      return;
    }
    if (days < 1 || days > 365) {
      $insResult.className = 'calc-result';
      $insResult.innerHTML = '<div class="calc-result-label">天數請介於 1~365</div>';
      return;
    }
    const sect = insSections.find(s => s.key === activeInsKey);
    const found = sect?.rows.find(r => parseInt(r[0], 10) === days);
    if (!found) {
      $insResult.className = 'calc-result';
      $insResult.innerHTML = `<div class="calc-result-label">${activeInsKey} ${days} 天:無對應費率</div>`;
      return;
    }
    // 計算每日均價(顯示用)— 從查表值 ÷ 天數
    const totalNum = parseInt(String(found[1]).replace(/,/g, ''), 10);
    const perDay = Number.isFinite(totalNum) && days > 0 ? (totalNum / days) : null;
    $insResult.className = 'calc-result hit';
    $insResult.innerHTML = `
      <div class="calc-result-label">${activeInsKey} · ${days} 天</div>
      <div class="calc-result-value">NT$ ${found[1]}</div>
      <div class="calc-formula">
        <span class="calc-formula-eq">${activeInsKey} 共同供應契約費率表(${days} 天)</span>
        <span class="calc-formula-arrow">=</span>
        <span class="calc-formula-total">NT$ ${found[1]}</span>
      </div>
      ${perDay !== null ? `<div class="calc-formula-aux">≈ NT$ ${perDay.toFixed(2)}/天(費率為原表查得,非按日線性計算)</div>` : ''}
      <div class="calc-result-meta">外交部共同供應契約費率 (115 年版)</div>
      <a class="calc-jump" data-jump-card="B-國外旅費-006">📑 查看完整保險表 →</a>
    `;
  }
  $tabs.forEach(t => t.onclick = () => {
    $tabs.forEach(x => x.classList.toggle('active', x === t));
    activeInsKey = t.dataset.insKey;
    lookupIns();
  });
  $daysInput.addEventListener('input', lookupIns);

  // 卡片內「查看完整法源」跳 drawer (reset filter 確保目標可見)
  $g.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-jump-card]');
    if (!a) return;
    jumpToCard(a.dataset.jumpCard);
  });
}

// 共用跳卡 helper:reset 必要的 filter 後切到 library + open drawer
function jumpToCard(id) {
  const node = NODES_BY_ID.get(id);
  if (!node) { flashHint('找不到節點:' + id); return; }
  // 為了確保 currentList 一定含此節點:清掉所有可能擋住它的 filter
  filterState.scenario = null;
  filterState.tag = null;
  filterState.expense = null;
  filterState.query = '';
  filterState.parent = node.parent || null;
  filterState.type = null;
  // 已廢止節點若預設隱藏會看不到 — 偵測並暫開
  if (node.status === '已廢止' && !node.effective_period) filterState.showObsolete = true;
  const $q = document.getElementById('q'); if ($q) $q.value = '';
  switchView('library');
  renderSidebar(); renderChips(); renderCards();
  const idx = currentList.findIndex(x => x.id === id);
  if (idx >= 0) openDrawer(idx);
  else flashHint('節點被過濾隱藏:' + id);
}

/* ──────── 條件問答 modal (flow decision tree) ──────── */

function openFlowModal(scenario) {
  if (!scenario.flow || !scenario.flow.start) return;
  if (typeof ga4 === 'function') ga4('tutorial_begin', { content_id: scenario.id || '' });
  // 2026-05-XX:防止抽屜疊在 flow modal 之上(P0-5)— flow 開啟時關掉所有 overlay
  const $drawer = document.querySelector('.drawer.show');
  if ($drawer) $drawer.classList.remove('show');
  const $scrim = document.querySelector('.scrim.show');
  if ($scrim) $scrim.classList.remove('show');
  document.body.classList.remove('drawer-open');
  const flow = scenario.flow;
  let modal = document.getElementById('flow-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'flow-modal';
    modal.className = 'cmp-modal';
    modal.innerHTML = `
      <div class="cmp-backdrop" data-flow-close></div>
      <div class="cmp-panel" style="max-width:680px;height:auto;max-height:80vh">
        <header class="cmp-head">
          <h2 id="flow-title"></h2>
          <button class="iconbtn" data-flow-close title="關閉"><svg class="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6l-12 12"/></svg></button>
        </header>
        <div class="cmp-body" id="flow-body" style="padding:22px 24px;overflow-y:auto;display:block"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-flow-close]').forEach(el => el.onclick = () => modal.classList.remove('show'));
  }
  document.getElementById('flow-title').innerHTML = `<span style="font-size:18px">🤔</span> ${scenario.title}`;
  const $body = document.getElementById('flow-body');

  const answered = []; // [{qid, q, optLabel}] — 加 qid 以支援「上一步」回溯
  function renderStep(step) {
    // step 可能是:
    //   - 字串 qid (要顯示問題)
    //   - opt 物件 {label, next} → 跳到 next
    //   - opt 物件 {label, conclude} → 顯示結論
    let html = '';
    let conclusionId = null;
    let questionQid = null;
    if (typeof step === 'string') {
      questionQid = step;
    } else if (step && step.conclude) {
      conclusionId = step.conclude;
    } else if (step && step.next) {
      questionQid = step.next;
    }

    // 已回答的問題
    for (const a of answered) {
      html += `<div style="margin-bottom:14px;padding:10px 14px;background:var(--surface-2);border-radius:8px;border-left:3px solid var(--ok)">
        <div style="font-size:11px;color:var(--ink-3);margin-bottom:2px">已回答</div>
        <div style="font-size:13px;color:var(--ink-2)">${a.q.label}</div>
        <div style="margin-top:4px;display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--ok)">✓ ${a.optLabel}</div>
      </div>`;
    }
    // 結論
    if (conclusionId) {
      if (typeof ga4 === 'function') ga4('tutorial_complete', { content_id: scenario.id || '', conclusion_id: conclusionId });
      const c = flow.conclusions?.[conclusionId];
      if (c) {
        html += `<div style="padding:18px;background:var(--brand-soft);border:2px solid var(--brand);border-radius:var(--radius);margin-top:8px">
          <div style="font-size:11px;color:var(--brand);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">結論</div>
          <div style="font-size:18px;font-weight:600;color:var(--ink);margin-bottom:6px">${c.title || ''}</div>
          ${c.limit ? `<div style="font-size:14px;color:var(--ink-2);margin-bottom:6px">📋 ${c.limit}</div>` : ''}
          ${c.note ? `<div style="font-size:12.5px;color:var(--ink-3);font-style:italic">${c.note}</div>` : ''}
          ${(c.refs || []).length ? `
            <div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--brand-line)">
              <div style="font-size:11px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">📑 相關法源</div>
              <div style="display:flex;flex-direction:column;gap:6px">
                ${c.refs.map(r => {
                  const node = NODES_BY_ID.get(r);
                  return `<button class="btn" data-flow-jump="${r}" style="text-align:left;justify-content:flex-start"><span style="font-family:var(--font-mono);font-size:11px;background:var(--surface);padding:1px 6px;border-radius:4px;border:1px solid var(--line)">${r}</span> ${node?.title || ''}</button>`;
                }).join('')}
              </div>
            </div>
          ` : ''}
          ${c.redirect_scenario ? (() => {
            const tgt = SCENARIOS.find(s => s.id === c.redirect_scenario);
            return tgt ? `<div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--brand-line)">
              <button class="btn primary" data-flow-redirect="${c.redirect_scenario}" style="font-size:14px;width:100%;justify-content:center">→ 前往「${tgt.title}」條件問答</button>
            </div>` : '';
          })() : ''}
        </div>
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
          ${answered.length > 0 ? `<button class="btn" data-flow-back>← 上一步</button>` : ''}
          <button class="btn" data-flow-restart>↩ 重新開始</button>
          <button class="btn" data-flow-close style="margin-left:auto">關閉</button>
        </div>`;
      }
    } else if (questionQid) {
      // 顯示當前問題
      const q = flow.questions?.[questionQid];
      if (q) {
        html += `<div style="padding:16px;background:var(--surface);border:1px solid var(--brand-line);border-radius:var(--radius)">
          <div style="font-size:11px;color:var(--brand);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">問題 ${answered.length + 1}</div>
          <div style="font-size:16px;font-weight:600;color:var(--ink);margin-bottom:4px">${q.label}</div>
          ${q.hint ? `<div style="font-size:12.5px;color:var(--ink-3);margin-bottom:14px">💡 ${q.hint}</div>` : '<div style="height:8px"></div>'}
          <div style="display:flex;flex-direction:column;gap:8px">
            ${(q.options || []).map((opt, i) => `<button class="btn" data-flow-opt="${i}" style="text-align:left;justify-content:flex-start;padding:10px 14px;font-size:14px">${opt.label}</button>`).join('')}
          </div>
        </div>
        ${answered.length > 0 ? `
          <div style="margin-top:12px;display:flex;gap:8px">
            <button class="btn" data-flow-back style="font-size:13px">← 上一步</button>
            <button class="btn" data-flow-restart style="font-size:13px">↩ 從頭開始</button>
          </div>
        ` : ''}`;
      }
    }
    $body.innerHTML = html;
    // 綁 event
    $body.querySelectorAll('[data-flow-opt]').forEach(b => {
      b.onclick = () => {
        const i = parseInt(b.dataset.flowOpt, 10);
        const q = flow.questions?.[questionQid];
        const opt = q?.options?.[i];
        if (!opt) return;
        answered.push({ qid: questionQid, q, optLabel: opt.label });  // 記 qid 以支援上一步
        renderStep(opt);
      };
    });
    // ← 上一步:pop 最後一筆 answered,回該題未答狀態
    $body.querySelectorAll('[data-flow-back]').forEach(b => {
      b.onclick = () => {
        if (answered.length === 0) return;
        const last = answered.pop();
        renderStep(last.qid);
      };
    });
    $body.querySelectorAll('[data-flow-jump]').forEach(b => {
      b.onclick = () => {
        modal.classList.remove('show');
        jumpToCard(b.dataset.flowJump);
      };
    });
    $body.querySelectorAll('[data-flow-restart]').forEach(b => {
      b.onclick = () => { answered.length = 0; renderStep(flow.start); };
    });
    $body.querySelectorAll('[data-flow-close]').forEach(b => {
      b.onclick = () => modal.classList.remove('show');
    });
    $body.querySelectorAll('[data-flow-redirect]').forEach(b => {
      b.onclick = (e) => {
        e.stopPropagation();
        modal.classList.remove('show');
        const targetId = b.dataset.flowRedirect;
        const targetSc = SCENARIOS.find(s => s.id === targetId);
        if (targetSc && targetSc.flow) {
          // 直接接續目標情境的條件問答,不切換 view
          setTimeout(() => openFlowModal(targetSc), 60);
        }
      };
    });
    // 鍵盤:← 觸發上一步;Esc 由 modal 既有監聽器處理
    if (!modal.dataset.kbWired) {
      modal.dataset.kbWired = '1';
      modal.addEventListener('keydown', (e) => {
        if (!modal.classList.contains('show')) return;
        if (e.key === 'ArrowLeft') {
          const $back = $body.querySelector('[data-flow-back]');
          if ($back) { $back.click(); e.preventDefault(); }
        }
      });
    }
  }
  // 將 currentQid 解讀為 q.next 或直接 string
  function expandRef(ref) {
    if (typeof ref === 'string') return ref;
    return ref.next || (ref.conclude ? ref : null);
  }
  // start 是 string (qid)
  renderStep(flow.start);
  modal.classList.add('show');
}



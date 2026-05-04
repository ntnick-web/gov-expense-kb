// 04_main.js — auto-split from app.js (2026-05-02 #2 ESM 拆檔 Phase 2-4)
// 此檔為 plain script,共享 window scope;與 02/03/04 配合使用,載入順序固定。

/* ──────── Splash 啟動畫面控制(2026-05-XX 加)──────── */
function dismissSplash(immediate = false) {
  const $sp = document.getElementById('splash');
  if (!$sp || $sp.dataset.dismissed === '1') return;
  $sp.dataset.dismissed = '1';
  $sp.classList.add('fading-out');
  // 等 fade-out 動畫(0.42s)結束再 remove,避免 flash
  setTimeout(() => { $sp.remove(); }, immediate ? 200 : 420);
}
(function wireSplash() {
  const $sp = document.getElementById('splash');
  if (!$sp) return;
  // 點擊任意處跳過
  $sp.addEventListener('click', () => dismissSplash(true));
  // 按鍵跳過(Esc / Enter / Space)
  const onKey = (e) => {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      dismissSplash(true);
      window.removeEventListener('keydown', onKey);
    }
  };
  window.addEventListener('keydown', onKey);
  // 自動消失時長(2026-05-XX 從 1800 → 3000 → 3500):動畫進場到 brand 浮現約 1.85s,
  // 給 ~1.65s 駐留呼吸感讓使用者讀完「將法律語言變成使用者的語言」+ fade 0.42s
  const splashHold = sessionStorage.getItem('verifyMode') === '1' ? 60000 : 3500;
  setTimeout(() => dismissSplash(false), splashHold);
})();

/* ──────── 後端事件追蹤 (2026-05-02 #25) ────────
   - 條件:window.EVENTS_ENDPOINT 設定才啟用(預設 null = 關閉)
   - 寫法:track('view_change', 'library') / track('drawer_open', 'A-國內旅費-005')
   - 隱私:不發 IP / cookie;search query 由 worker 側 hash;90 天滾動清
   - 部署:見 06_workers/README.md(目前未 deploy,本前端代碼預設 inert) */
window.EVENTS_ENDPOINT = window.EVENTS_ENDPOINT || null;  // e.g. 'https://events.ntnick-web.workers.dev/api/track'
const _EVENTS_BUFFER = [];
function track(type, target, ctx) {
  if (!window.EVENTS_ENDPOINT) return;  // disabled
  if (!navigator.onLine) return;
  const evt = { type, target: target || null, context: ctx || null, ts: Date.now() };
  _EVENTS_BUFFER.push(evt);
  // beacon flush 防抖(每 2s 或滿 10 筆送一次)
  clearTimeout(track._flushT);
  if (_EVENTS_BUFFER.length >= 10) flushEvents();
  else track._flushT = setTimeout(flushEvents, 2000);
}
function flushEvents() {
  if (!window.EVENTS_ENDPOINT || _EVENTS_BUFFER.length === 0) return;
  const batch = _EVENTS_BUFFER.splice(0);
  const url = window.EVENTS_ENDPOINT.replace(/\/track$/, '/track/batch');
  // sendBeacon 在 page unload 時也能送出(navigator.sendBeacon)
  const blob = new Blob([JSON.stringify(batch)], { type: 'application/json' });
  if (navigator.sendBeacon && navigator.sendBeacon(url, blob)) return;
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch), keepalive: true }).catch(() => {});
}
// page 即將離開時 flush 殘留
window.addEventListener('pagehide', flushEvents);
window.addEventListener('beforeunload', flushEvents);

/* ──────── GA4 自訂事件追蹤 ────────
   ga4(event_name, params) — 安全 wrapper:gtag 未載入(或 localhost 無 GA4)時靜默忽略
   事件命名:snake_case / ≤40 chars / 避開 GA4 保留字
   完整事件清單:
     view_change         視圖切換      view_name
     view_item           抽屜開啟      item_id / item_name / item_category
     select_content      情境套用      content_type='scenario' / item_id / content_id
     search              搜尋          search_term / search_location
     filter_select       chip 篩選    filter_type / filter_value
     tutorial_begin      問答啟動      content_id
     tutorial_complete   問答結論      content_id / conclusion_id
     compare_view        並排比較開啟  count                              */
function ga4(event_name, params) {
  if (typeof gtag !== 'function') return;
  try { gtag('event', event_name, params || {}); } catch (_) {}
}

/* ──────── init ──────── */
async function init() {
  try {
    await loadAllData();
    renderChips();
    renderCards();
    // 2026-05-XX:landing 已封存,進站預設 scenarios(splash 期間使用者不會感受到延遲)
    switchView('scenarios');
    renderScenarios();
    wireScenarioSearch();
    syncMobileTabbar?.();
    track('page_view', location.pathname);
  } catch (e) {
    grid.innerHTML = `<div style="color:var(--stop);padding:40px">資料載入失敗: ${e.message}</div>`;
    console.error(e);
  }
}
init();

/* 情境視圖內關鍵字搜尋(2026-05-01 加)— 接通 sc-q input 與 scenarioQuery 變數 */
function wireScenarioSearch() {
  const $input = document.getElementById('sc-q');
  const $clear = document.getElementById('sc-q-clear');
  if (!$input || !$clear) return;
  // 防抖,避免每按一鍵就跑全 117 張卡的 filter
  let _scQDebounce = null;
  $input.addEventListener('input', () => {
    const v = $input.value || '';
    $clear.hidden = !v.trim();
    clearTimeout(_scQDebounce);
    _scQDebounce = setTimeout(() => {
      scenarioQuery = v.trim();
      renderScenarios();
    }, 120);
  });
  $clear.addEventListener('click', () => {
    $input.value = '';
    scenarioQuery = '';
    $clear.hidden = true;
    renderScenarios();
    $input.focus();
  });
  // Esc 清空
  $input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && $input.value) {
      ev.preventDefault();
      $clear.click();
    }
  });
}

/* ──────── compare mode (compareList declared at top of script) ──────── */
function toggleCompare(id) {
  const i = compareList.indexOf(id);
  if (i >= 0) {
    compareList.splice(i, 1);
    flashHint("已從比較中移除");
  } else {
    if (compareList.length >= 3) {
      flashHint("比較最多 3 張卡");
      return;
    }
    compareList.push(id);
    flashHint(`已加入比較 (${compareList.length}/3)`);
  }
  renderCards();        // 同步卡片狀態 (chip on/off + .compared outline)
  renderCompareBar();
  updateDrawerCmpBtn();
}
function clearCompare() {
  compareList = [];
  renderCards();
  renderCompareBar();
  updateDrawerCmpBtn();
}
function renderCompareBar() {
  const bar = document.getElementById("compare-bar");
  const chips = document.getElementById("compare-chips");
  const showBtn = document.getElementById("btn-show-compare");
  if (compareList.length === 0) {
    bar.classList.remove("show");
    return;
  }
  bar.classList.add("show");
  chips.innerHTML = compareList.map(id => {
    const d = DATA.find(x => x.id === id);
    if (!d) return "";
    return `<span class="cmp-chip">
      <span class="cmp-chip-no">${d.id}</span>
      <span class="cmp-chip-title">${buildCardTitleText(d)}</span>
      <button class="cmp-chip-x" data-cmp-rm="${id}" title="移除">✕</button>
    </span>`;
  }).join("");
  chips.querySelectorAll("[data-cmp-rm]").forEach(b => {
    b.onclick = (e) => { e.stopPropagation(); toggleCompare(b.dataset.cmpRm); };
  });
  showBtn.disabled = compareList.length < 2;
  showBtn.textContent = compareList.length < 2
    ? `並排比較 (還需 ${2 - compareList.length} 張)`
    : `並排比較 (${compareList.length} 張)`;
}
function updateDrawerCmpBtn() {
  const btn = document.getElementById("btn-add-compare");
  if (!btn || currentIdx < 0) {
    if (btn) { btn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>加入比較`; }
    return;
  }
  const id = currentList[currentIdx]?.id;
  if (!id) return;
  const inCmp = compareList.includes(id);
  btn.innerHTML = inCmp
    ? `<svg class="icon" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>已加入比較`
    : `<svg class="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>加入比較`;
  btn.classList.toggle("primary", inCmp);
}

/* hook drawer open to update btn — async safe */
const _origOpenDrawer = openDrawer;
window.openDrawer = async function(idx) { await _origOpenDrawer(idx); updateDrawerCmpBtn(); };

document.getElementById("btn-add-compare").addEventListener("click", () => {
  if (currentIdx < 0) return;
  toggleCompare(currentList[currentIdx].id);
});
document.getElementById("btn-clear-compare").addEventListener("click", clearCompare);

/* compare modal */
const cmpModal = document.getElementById("cmp-modal");
const cmpBody = document.getElementById("cmp-body");

const META_FIELDS = [
  ["條號",     n => n.id],
  ["條名",     n => buildCardTitleText(n)],
  ["分類",     n => n.cat],
  ["狀態",     n => n.status],
  ["更新日",   n => n.updated],
  ["標籤",     n => (n.tags || []).join("、")],
];

async function openCompareModal() {
  if (compareList.length < 2) return;
  const nodes = compareList.map(id => DATA.find(x => x.id === id)).filter(Boolean);
  const colsClass = nodes.length === 3 ? "cmp-cols-3" : "cmp-cols-2";

  // 偵測哪些 metadata 欄位有差異
  const isDiff = META_FIELDS.map(([_, fn]) => new Set(nodes.map(fn)).size > 1);

  cmpBody.className = "cmp-body " + colsClass;
  cmpBody.innerHTML = nodes.map((d, i) => `
    <div class="cmp-col">
      <div class="cmp-col-head">
        <div class="cmp-col-row">
          <span class="cmp-col-no">${d.id}</span>
          <button class="cmp-col-rm" data-cmp-rm-modal="${d.id}" title="從比較中移除">
            <svg class="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6l-12 12"/></svg>
          </button>
        </div>
        <h3 class="cmp-col-title">${buildCardTitleText(d, 'full')}</h3>
        <div>${statusBadge(d.status)}</div>
      </div>
      <div class="cmp-meta">
        ${META_FIELDS.map(([k, fn], idx) => `
          <div class="cmp-meta-row${isDiff[idx] ? ' diff' : ''}">
            <span class="cmp-meta-k">${k}</span>
            <span class="cmp-meta-v">${(fn(d) || "—")}</span>
          </div>
        `).join("")}
      </div>
      <div class="cmp-col-body" data-load="${d.id}">
        <p style="color:var(--ink-3);font-size:12px">載入中…</p>
      </div>
      <div class="cmp-col-foot">
        <button class="btn" data-cmp-open="${d.id}">
          <svg class="icon" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          開啟此卡完整抽屜
        </button>
      </div>
    </div>
  `).join("");

  // 載入各 column 的內容 (摘要 + 條文 + rate_table)
  for (const d of nodes) {
    const $col = cmpBody.querySelector(`[data-load="${d.id}"]`);
    if (!$col) continue;
    try {
      const r = await fetch(MD_BASE + d.filePath);
      const md = await r.text();
      let html = '';
      const summary = extractSection(md, '重點摘要');
      if (summary) html += `<div class="section"><h3>重點摘要</h3><div class="article" style="background:var(--brand-soft);border-color:var(--brand-line)">${summary.replace(/\n/g, '<br>')}</div></div>`;
      if (d.rateTable) {
        html += `<div class="section"><h3>結構化費率表</h3>${renderRateTableHtml(d.rateTable, d)}</div>`;
      } else {
        const full = extractSection(md, '條文全文') || extractSection(md, '函釋全文') || extractSection(md, '標準全文') || extractSection(md, '函釋內容');
        if (full) {
          const heading = d.art === 'fn' ? '函釋全文' : (d.art === 'qa' ? '回答' : '條文全文');
          html += `<div class="section"><h3>${heading}</h3><div class="article">${full.replace(/\n/g, '<br>')}</div></div>`;
        }
      }
      if (!html) html = '<p style="color:var(--ink-3)">(無內容)</p>';
      $col.innerHTML = html;
      wireRateTableInteractions($col);  // 比較欄裡的 rate_table 也綁互動
    } catch (e) {
      $col.innerHTML = `<p style="color:var(--stop);font-size:12px">載入失敗: ${e.message}</p>`;
    }
  }

  // 綁 column 內的「移除」與「開啟抽屜」
  cmpBody.querySelectorAll("[data-cmp-rm-modal]").forEach(b => {
    b.onclick = () => {
      toggleCompare(b.dataset.cmpRmModal);
      if (compareList.length < 2) closeCompareModal();
      else openCompareModal();
    };
  });
  cmpBody.querySelectorAll("[data-cmp-open]").forEach(b => {
    b.onclick = () => {
      closeCompareModal();
      const idx = currentList.findIndex(x => x.id === b.dataset.cmpOpen);
      if (idx >= 0) openDrawer(idx);
      else flashHint('該卡片不在當前過濾結果內,請先清除過濾');
    };
  });

  cmpModal.classList.add("show");
  ga4('compare_view', { count: nodes.length });
}
function closeCompareModal() {
  cmpModal.classList.remove("show");
}
document.getElementById("btn-show-compare").addEventListener("click", openCompareModal);
document.querySelectorAll("[data-cmp-close]").forEach(el => el.addEventListener("click", closeCompareModal));

// ESC 優先關 compare modal
const _origKeyHandler = document.onkeydown;
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && cmpModal.classList.contains("show")) {
    e.stopPropagation();
    closeCompareModal();
  }
}, true);  // capture phase 搶在 drawer 之前

// ───── 通用 view 切換 wiring(2026-04-30 加 landing + 桌面 topnav)─────
function _enterView(v) {
  if (!v) return;
  switchView(v);
  if (v === 'scenarios') renderScenarios();
  if (v === 'calc') renderCalc();
  if (v === 'library') renderCards();   // 確保 library 切入時刷新
  syncMobileTabbar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Mobile bottom tabbar
document.querySelectorAll('.mobile-tabbar .mobile-tab').forEach(btn => {
  btn.addEventListener('click', () => _enterView(btn.dataset.entry));
});
function syncMobileTabbar() {
  document.querySelectorAll('.mobile-tabbar .mobile-tab').forEach(it => {
    it.classList.toggle('active', it.dataset.entry === currentView);
  });
}

// 桌面 topnav-tab
document.querySelectorAll('.topnav-tab').forEach(btn => {
  btn.addEventListener('click', () => _enterView(btn.dataset.entry));
});

// Landing 卡片(已封存,但保留 wiring 以防將來恢復 — querySelector 找不到時 forEach 為空)
document.querySelectorAll('.landing-card').forEach(card => {
  card.addEventListener('click', () => _enterView(card.dataset.entry));
});

// 品牌名點擊 → 重置 filter + 回情境視圖(2026-05-XX 起 landing 已封存,brand 等同「重新開始」)
document.getElementById('brand-home')?.addEventListener('click', () => {
  filterState.scenario = null; filterState.parent = null;
  filterState.tag = null; filterState.expense = null;
  filterState.query = ''; filterState.type = null;
  const $q = document.getElementById('q'); if ($q) $q.value = '';
  const $scq = document.getElementById('sc-q'); if ($scq) $scq.value = '';
  if (typeof scenarioQuery !== 'undefined') scenarioQuery = '';
  if (typeof scenarioFilterParent !== 'undefined') scenarioFilterParent = null;
  if (typeof scenarioFilterExpense !== 'undefined') scenarioFilterExpense = null;
  _enterView('scenarios');
});

// 進站預設 view 已由 init() 處理(scenarios)

/* ──────── GA4 搜尋 / 篩選 埋點 (2026-05-04) ──────── */

// 主 topbar 搜尋:1.5s 防抖後送(代表使用者已完成輸入)
(function () {
  const $q = document.getElementById('q');
  if (!$q) return;
  let _t = null;
  $q.addEventListener('input', function () {
    clearTimeout(_t);
    _t = setTimeout(function () {
      const v = ($q.value || '').trim();
      if (v.length >= 2) ga4('search', { search_term: v, search_location: 'topbar' });
    }, 1500);
  });
})();

// Spotlight CmdK 搜尋
(function () {
  const $ck = document.getElementById('cmdk-input');
  if (!$ck) return;
  let _t = null;
  $ck.addEventListener('input', function () {
    clearTimeout(_t);
    _t = setTimeout(function () {
      const v = ($ck.value || '').trim();
      if (v.length >= 2) ga4('search', { search_term: v, search_location: 'spotlight' });
    }, 1500);
  });
})();

// Chip 篩選 — 事件委派(filterrow 在 renderChips 後才有內容,用 click 冒泡捕捉)
document.getElementById('lib-parent-row')?.addEventListener('click', function (e) {
  const b = e.target.closest('[data-parent]');
  if (b && b.dataset.parent) ga4('filter_select', { filter_type: 'topic', filter_value: b.dataset.parent });
});
document.getElementById('lib-type-row')?.addEventListener('click', function (e) {
  const b = e.target.closest('[data-type]');
  if (b && b.dataset.type) ga4('filter_select', { filter_type: 'type', filter_value: b.dataset.type });
});
document.getElementById('lib-expense-row')?.addEventListener('click', function (e) {
  const b = e.target.closest('[data-expense]');
  if (b && b.dataset.expense) ga4('filter_select', { filter_type: 'expense', filter_value: b.dataset.expense });
});
document.getElementById('lib-tag-row')?.addEventListener('click', function (e) {
  const b = e.target.closest('[data-tag]');
  if (b && b.dataset.tag) ga4('filter_select', { filter_type: 'tag', filter_value: b.dataset.tag });
});


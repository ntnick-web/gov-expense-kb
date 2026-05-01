/**
 * events_worker.js — Cloudflare Worker for event tracking
 *
 * 接收前端 beacon POST,寫入 D1 database。
 *
 * 路由:
 *   POST /api/track          — 寫入單一事件
 *   POST /api/track/batch    — 寫入批次事件(beacon flush 用)
 *   GET  /api/stats?token=X  — 內部查詢 7 天統計(token 比對 STATS_TOKEN env)
 *
 * 部署:
 *   wrangler deploy events_worker.js --name gov-expense-events --route events.ntnick-web.workers.dev/api/*
 *
 * D1 schema: 見 06_workers/d1_schema.sql
 */

// ─── CORS 允許清單(限本站 origin)─────────────────────────────
const ALLOWED_ORIGINS = new Set([
  'https://ntnick-web.github.io',
  'https://gov-expense-kb.pages.dev',
  'http://127.0.0.1:8765',     // 本地 dev
  'http://localhost:8765',
]);

function corsHeaders(origin) {
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

// ─── Event 驗證 ─────────────────────────────────────────────
const VALID_EVENTS = new Set([
  'page_view',
  'view_change',       // landing/library/scenarios/calc
  'scenario_apply',    // 套用情境(card click)
  'drawer_open',       // 開條文抽屜
  'search',            // 搜尋(query 已 hash)
  'flow_start',        // 開條件問答 modal
  'flow_conclude',     // 走到 conclusion
  'compare_open',      // 並排比較
  'rate_lookup',       // 試算表查詢
]);

function validateEvent(e) {
  if (!e || typeof e !== 'object') return '事件須為物件';
  if (!VALID_EVENTS.has(e.type)) return `未知事件 type: ${e.type}`;
  // 大小限制(避免濫用)
  if (e.target && String(e.target).length > 100) return 'target 過長';
  if (e.context && JSON.stringify(e.context).length > 500) return 'context 過長';
  return null;
}

// ─── PII 防護 ──────────────────────────────────────────────
// search query 一律 hash(不存原文,僅看分布)
async function hashQuery(s) {
  const data = new TextEncoder().encode(String(s).trim().toLowerCase());
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hashBuf)].slice(0, 8)
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sanitize(event) {
  const out = { ...event };
  if (out.type === 'search' && out.target) {
    out.target = await hashQuery(out.target);  // 8 byte hash 取代原 query
  }
  return out;
}

// ─── 寫入 D1 ──────────────────────────────────────────────
async function insertEvents(env, events) {
  if (!events.length) return 0;
  const stmt = env.DB.prepare(
    `INSERT INTO events (ts, type, target, parent, expense, context_json, ua_key, country)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const now = Date.now();
  const batch = events.map(e =>
    stmt.bind(
      e.ts || now,
      e.type,
      e.target || null,
      e.parent || null,
      e.expense || null,
      e.context ? JSON.stringify(e.context) : null,
      e.ua_key || null,
      e.country || null,
    )
  );
  await env.DB.batch(batch);
  return batch.length;
}

// ─── Stats 查詢 ────────────────────────────────────────────
async function buildStats(env) {
  // 7 天熱門事件
  const sevenDays = Date.now() - 7 * 24 * 3600 * 1000;
  const queries = [
    {
      key: 'event_counts_7d',
      sql: `SELECT type, COUNT(*) AS n FROM events WHERE ts >= ? GROUP BY type ORDER BY n DESC`,
    },
    {
      key: 'top_scenarios_7d',
      sql: `SELECT target, COUNT(*) AS n FROM events
            WHERE ts >= ? AND type = 'scenario_apply'
            GROUP BY target ORDER BY n DESC LIMIT 20`,
    },
    {
      key: 'top_drawer_7d',
      sql: `SELECT target, COUNT(*) AS n FROM events
            WHERE ts >= ? AND type = 'drawer_open'
            GROUP BY target ORDER BY n DESC LIMIT 30`,
    },
    {
      key: 'top_search_7d',
      sql: `SELECT target AS qhash, COUNT(*) AS n FROM events
            WHERE ts >= ? AND type = 'search' AND target IS NOT NULL
            GROUP BY target ORDER BY n DESC LIMIT 20`,
    },
  ];
  const out = {};
  for (const q of queries) {
    const r = await env.DB.prepare(q.sql).bind(sevenDays).all();
    out[q.key] = r.results || [];
  }
  return out;
}

// ─── Main fetch handler ────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    // OPTIONS 預檢
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    try {
      // ── POST /api/track ────────────────────────
      if (request.method === 'POST' && url.pathname === '/api/track') {
        const body = await request.json();
        const err = validateEvent(body);
        if (err) return new Response(JSON.stringify({ error: err }), { status: 400, headers });
        const sanitized = await sanitize(body);
        sanitized.country = request.cf?.country || null;
        sanitized.ua_key = (request.headers.get('User-Agent') || '').slice(0, 16);
        await insertEvents(env, [sanitized]);
        return new Response(JSON.stringify({ ok: 1 }), { status: 200, headers });
      }

      // ── POST /api/track/batch ──────────────────
      if (request.method === 'POST' && url.pathname === '/api/track/batch') {
        const body = await request.json();
        if (!Array.isArray(body) || body.length === 0)
          return new Response(JSON.stringify({ error: 'body 須為非空陣列' }), { status: 400, headers });
        if (body.length > 50)
          return new Response(JSON.stringify({ error: '單批最多 50 筆' }), { status: 400, headers });
        const ua = (request.headers.get('User-Agent') || '').slice(0, 16);
        const country = request.cf?.country || null;
        const events = [];
        for (const e of body) {
          const err = validateEvent(e);
          if (err) continue;  // skip invalid,不阻擋整批
          const s = await sanitize(e);
          s.ua_key = ua;
          s.country = country;
          events.push(s);
        }
        const n = await insertEvents(env, events);
        return new Response(JSON.stringify({ ok: 1, inserted: n }), { status: 200, headers });
      }

      // ── GET /api/stats?token=XXX ──────────────
      if (request.method === 'GET' && url.pathname === '/api/stats') {
        const token = url.searchParams.get('token');
        if (!env.STATS_TOKEN || token !== env.STATS_TOKEN)
          return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers });
        const stats = await buildStats(env);
        return new Response(JSON.stringify(stats), { status: 200, headers });
      }

      return new Response(JSON.stringify({ error: 'route not found' }), { status: 404, headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'internal', detail: e.message }), { status: 500, headers });
    }
  },
};

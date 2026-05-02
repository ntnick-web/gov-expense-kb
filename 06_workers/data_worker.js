/**
 * data_worker.js — Cloudflare Worker：受保護資料 API
 *
 * 核心資料(nodes / scenarios)存於 KV，不直接暴露在 GitHub 靜態檔案。
 * 前端改為呼叫此 Worker，Worker 驗證 Origin 後才回傳資料。
 *
 * 路由:
 *   GET /data/nodes?v=XXX      — 回傳 nodes.json 全文（Origin 驗證）
 *   GET /data/scenarios?v=XXX  — 回傳 scenarios_manual.json（Origin 驗證）
 *   GET /data/meta?v=XXX       — 回傳 _meta.json（公開，供 footer 顯示）
 *   POST /admin/upload         — 上傳資料到 KV（需 UPLOAD_TOKEN env）
 *
 * 部署步驟：見本檔底部「## 部署 SOP」
 *
 * Bindings（wrangler_data.toml 設定）:
 *   KV namespace: DATA_KV
 *   Env vars:     UPLOAD_TOKEN（上傳金鑰）、ALLOWED_ORIGIN（自訂允許 origin）
 */

// ─── 允許的前端 Origin ────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  'https://ntnick-web.github.io',
  'https://gov-expense-kb.pages.dev',   // 若遷移到 CF Pages
  'http://127.0.0.1:8765',              // 本地 dev
  'http://localhost:8765',
]);

function isAllowedOrigin(origin, env) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // 支援從 env 追加自訂 origin（部署後彈性調整）
  if (env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN) return true;
  return false;
}

function corsHeaders(origin, env) {
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  };
  if (isAllowedOrigin(origin, env)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type, X-Upload-Token';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

// ─── 來源驗證（核心保護）─────────────────────────────────────
// Origin 標頭是瀏覽器自動加、無法被 JS 偽造。
// curl/Python 可偽造 Origin，但配合 CF Bot Fight Mode 可擋住大多數自動化工具。
function checkOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (!isAllowedOrigin(origin, env)) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: 未授權來源。本 API 僅供官方前端使用。' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return null; // 通過
}

// ─── KV 讀取 helper ──────────────────────────────────────────
async function kvGet(env, key) {
  if (!env.DATA_KV) {
    return { error: 'KV 尚未綁定，請先部署並設定 wrangler_data.toml', status: 503 };
  }
  const val = await env.DATA_KV.get(key, { type: 'text' });
  if (val === null) {
    return { error: `資料尚未上傳（key: ${key}），請執行上傳指令`, status: 404 };
  }
  return { data: val, status: 200 };
}

// ─── 管理員上傳（POST /admin/upload）────────────────────────
async function handleUpload(request, env, headers) {
  const token = request.headers.get('X-Upload-Token') || '';
  if (!env.UPLOAD_TOKEN || token !== env.UPLOAD_TOKEN) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return new Response(JSON.stringify({ error: 'body 須為 JSON 物件' }), { status: 400, headers });
  }
  const allowed = ['nodes', 'scenarios', 'meta'];
  const results = {};
  for (const key of allowed) {
    if (body[key] !== undefined) {
      const val = typeof body[key] === 'string' ? body[key] : JSON.stringify(body[key]);
      await env.DATA_KV.put(key, val);
      results[key] = 'ok';
    }
  }
  return new Response(JSON.stringify({ ok: 1, updated: results }), { status: 200, headers });
}

// ─── Main fetch handler ─────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin, env);

    // OPTIONS 預檢
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    try {
      // ── GET /data/nodes ───────────────────────────────
      if (request.method === 'GET' && url.pathname === '/data/nodes') {
        const denied = checkOrigin(request, env);
        if (denied) return denied;
        const result = await kvGet(env, 'nodes');
        if (result.error) {
          return new Response(JSON.stringify({ error: result.error }), { status: result.status, headers });
        }
        return new Response(result.data, { status: 200, headers });
      }

      // ── GET /data/scenarios ───────────────────────────
      if (request.method === 'GET' && url.pathname === '/data/scenarios') {
        const denied = checkOrigin(request, env);
        if (denied) return denied;
        const result = await kvGet(env, 'scenarios');
        if (result.error) {
          return new Response(JSON.stringify({ error: result.error }), { status: result.status, headers });
        }
        return new Response(result.data, { status: 200, headers });
      }

      // ── GET /data/meta（公開，供 footer 顯示節點數）──
      if (request.method === 'GET' && url.pathname === '/data/meta') {
        const result = await kvGet(env, 'meta');
        if (result.error) {
          return new Response(JSON.stringify({ error: result.error }), { status: result.status, headers });
        }
        return new Response(result.data, { status: 200, headers });
      }

      // ── POST /admin/upload ────────────────────────────
      if (request.method === 'POST' && url.pathname === '/admin/upload') {
        return handleUpload(request, env, headers);
      }

      return new Response(JSON.stringify({ error: 'route not found' }), { status: 404, headers });

    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'internal', detail: e.message }),
        { status: 500, headers }
      );
    }
  },
};

/*
## 部署 SOP（約 15 分鐘）

### 前置
1. 安裝 wrangler: npm install -g wrangler
2. 登入: wrangler login

### 建立 KV namespace
wrangler kv:namespace create DATA_KV
# 記下回傳的 id，填入 wrangler_data.toml 的 [[kv_namespaces]] id 欄位

### 部署 Worker
wrangler deploy 06_workers/data_worker.js --config 06_workers/wrangler_data.toml

### 設定環境變數
wrangler secret put UPLOAD_TOKEN --config 06_workers/wrangler_data.toml
# 輸入一組隨機長字串（如 openssl rand -hex 32 的輸出）

### 上傳資料到 KV（每次 build 後執行）
# 方式 A：使用 /admin/upload API（需 UPLOAD_TOKEN）
curl -X POST https://gov-expense-data.YOUR_SUBDOMAIN.workers.dev/admin/upload \
  -H "Content-Type: application/json" \
  -H "X-Upload-Token: YOUR_UPLOAD_TOKEN" \
  -d "{\"nodes\": $(cat 03_index/nodes.json), \"scenarios\": $(cat 04_web/data/scenarios_manual.json), \"meta\": $(cat 03_index/_meta.json)}"

# 方式 B：直接用 wrangler KV CLI
wrangler kv:key put --binding=DATA_KV nodes "$(cat 03_index/nodes.json)"
wrangler kv:key put --binding=DATA_KV scenarios "$(cat 04_web/data/scenarios_manual.json)"
wrangler kv:key put --binding=DATA_KV meta "$(cat 03_index/_meta.json)"

### 前端啟用 API 模式
在 04_web/index.html 的 <head> 加入：
  <script>window.DATA_API_BASE = 'https://gov-expense-data.YOUR_SUBDOMAIN.workers.dev';</script>

### 從 GitHub repo 移除敏感 JSON（資料已在 KV，不再需要公開）
git rm 03_index/nodes.json
git rm 04_web/data/scenarios_manual.json
git commit -m "security: 核心資料移至 CF Workers KV，不再公開於 GitHub"

### 選項：移至 Cloudflare Pages（完整保護）
可將整個 04_web/ 目錄部署到 Cloudflare Pages，獲得：
  - Bot Fight Mode（免費）
  - WAF 基礎規則（免費）
  - 原生 Workers Integration
部署方式：CF Dashboard → Pages → Create → Connect to Git → 選此 repo
Build output: 04_web/   Build command: （空白，純靜態）
*/

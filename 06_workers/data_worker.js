/**
 * data_worker.js — Cloudflare Worker：受保護資料 API + License Key 多租戶驗證
 *
 * 路由:
 *   GET /data/nodes?v=XXX      — 回傳 nodes.json（Origin 驗證 + License 驗證）
 *   GET /data/scenarios?v=XXX  — 回傳 scenarios_manual.json（同上）
 *   GET /data/meta?v=XXX       — 回傳 _meta.json（公開，供 footer 顯示）
 *   POST /admin/upload         — 上傳資料到 KV（需 UPLOAD_TOKEN env）
 *
 * License Key 邏輯:
 *   - 請求帶 X-License-Key header → 查 KV: license_{key} → 取得 tenant config
 *   - 無 key 或查無 → 套用 DEFAULT_CONFIG（公開版：4 主母題）
 *   - 到期 → 降回 DEFAULT_CONFIG（不中斷服務，只是降級）
 *   - 回傳 X-Tenant-Config header（base64 JSON）→ 前端動態設定 WIP_PARENTS
 *
 * Bindings（wrangler_data.toml 設定）:
 *   KV namespace: DATA_KV
 *   Env vars:     UPLOAD_TOKEN（上傳金鑰）、ALLOWED_ORIGIN（自訂允許 origin）
 */

// ─── 公開版預設 config（無 key 或 key 查無時套用）────────────
const DEFAULT_CONFIG = {
  tenant_id: 'public',
  visible_parents: ['支出憑證與結報', '國內旅費', '酬勞費', '國外旅費'],
  org_specific_parents: [],
  features: ['flow', 'comparison', 'calc', 'spotlight'],
  expires_at: null,
};

// ─── 允許的前端 Origin ────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  'https://ntnick-web.github.io',
  'https://gov-expense-kb.pages.dev',
  'http://127.0.0.1:8765',
  'http://localhost:8765',
]);

function isAllowedOrigin(origin, env) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
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
    h['Access-Control-Allow-Headers'] = 'Content-Type, X-Upload-Token, X-License-Key';
    h['Access-Control-Expose-Headers'] = 'X-Tenant-Config';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

// ─── 來源驗證（核心保護）─────────────────────────────────────
// Origin 標頭是瀏覽器自動加、無法被 JS 偽造。
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

// ─── License Key 驗證 ─────────────────────────────────────────
async function getLicenseConfig(key, env) {
  if (!key || !env.DATA_KV) return DEFAULT_CONFIG;
  try {
    const raw = await env.DATA_KV.get('license_' + key, { type: 'text' });
    if (!raw) return DEFAULT_CONFIG;
    const config = JSON.parse(raw);
    // 到期：降回公開版（不中斷服務）
    if (config.expires_at && new Date(config.expires_at) < new Date()) {
      return DEFAULT_CONFIG;
    }
    return config;
  } catch (e) {
    return DEFAULT_CONFIG;
  }
}

// X-Tenant-Config header：base64 encode，前端 atob 解碼後動態調整 WIP_PARENTS
function buildTenantConfigHeader(config) {
  const payload = {
    tenant_id: config.tenant_id || 'public',
    visible_parents: config.visible_parents || DEFAULT_CONFIG.visible_parents,
    org_specific_parents: config.org_specific_parents || [],
    features: config.features || DEFAULT_CONFIG.features,
    expires_at: config.expires_at || null,
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
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
        const key = request.headers.get('X-License-Key') || '';
        const config = await getLicenseConfig(key, env);
        const tenantHeader = buildTenantConfigHeader(config);
        const result = await kvGet(env, 'nodes');
        if (result.error) {
          return new Response(JSON.stringify({ error: result.error }), { status: result.status, headers });
        }
        return new Response(result.data, {
          status: 200,
          headers: { ...headers, 'X-Tenant-Config': tenantHeader },
        });
      }

      // ── GET /data/scenarios ───────────────────────────
      if (request.method === 'GET' && url.pathname === '/data/scenarios') {
        const denied = checkOrigin(request, env);
        if (denied) return denied;
        const key = request.headers.get('X-License-Key') || '';
        const config = await getLicenseConfig(key, env);
        const tenantHeader = buildTenantConfigHeader(config);
        const result = await kvGet(env, 'scenarios');
        if (result.error) {
          return new Response(JSON.stringify({ error: result.error }), { status: result.status, headers });
        }
        return new Response(result.data, {
          status: 200,
          headers: { ...headers, 'X-Tenant-Config': tenantHeader },
        });
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
## 部署 SOP

### 部署 Worker
wrangler deploy 06_workers/data_worker.js --config 06_workers/wrangler_data.toml

### 建立三筆 License KV（執行一次）
KV_ID="b06a21e042db46c38ae57ebf1225f430"

# 公開測試版（自己測試用，不公開宣傳）
wrangler kv key put --namespace-id "$KV_ID" --remote "license_lk_TEST_2026" \
  '{"tenant_id":"test","visible_parents":["支出憑證與結報","國內旅費","酬勞費","國外旅費","餐費","採購及履約","物品管理","其他支出","教育訓練","教育部專章","國科會專章"],"org_specific_parents":[],"features":["flow","comparison","calc","spotlight"],"expires_at":null}' \
  --config 06_workers/wrangler_data.toml

# 國立成功大學
wrangler kv key put --namespace-id "$KV_ID" --remote "license_lk_NCKU_2026" \
  '{"tenant_id":"NCKU","tenant_name":"國立成功大學","visible_parents":["支出憑證與結報","國內旅費","酬勞費","國外旅費","餐費","採購及履約","物品管理","其他支出","教育訓練"],"org_specific_parents":["教育部專章","國科會專章"],"features":["flow","comparison","calc","spotlight","org_overlay"],"max_monthly_users":2000,"expires_at":"2027-06-30"}' \
  --config 06_workers/wrangler_data.toml

### 上傳核心資料（每次 build 後執行）
wrangler kv key put --namespace-id "$KV_ID" --remote "nodes"     --path "03_index/nodes.json"               --config 06_workers/wrangler_data.toml
wrangler kv key put --namespace-id "$KV_ID" --remote "scenarios" --path "04_web/data/scenarios_manual.json"  --config 06_workers/wrangler_data.toml
wrangler kv key put --namespace-id "$KV_ID" --remote "meta"      --path "03_index/_meta.json"               --config 06_workers/wrangler_data.toml
*/

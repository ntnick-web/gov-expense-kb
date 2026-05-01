# Cloudflare Workers + D1 事件追蹤(報告 1 #25)

這套系統將前端互動事件透過 Cloudflare Worker beacon 寫入 D1 SQLite,90 天滾動保留,提供 DAU/MAU 與功能熱度分析。

**狀態:程式碼完整,等候人工部署**(本目錄純 code,未 deploy 至 CF)。

## 檔案

| 檔案 | 用途 |
|---|---|
| `events_worker.js` | Worker 接 POST /api/track 寫 D1 + GET /api/stats(token 保護)|
| `d1_schema.sql` | D1 資料表 + 索引 + 90 天清理註解 |
| `wrangler.toml` | 部署設定;`database_id` 部署時要填 |

## 部署 SOP

```bash
# 1. 安裝 wrangler(只需第一次)
npm install -g wrangler

# 2. 登入 CF
wrangler login

# 3. 進入本目錄
cd 06_workers

# 4. 創建 D1
wrangler d1 create gov-expense-events
# 輸出 database_id = "abc123..." → 貼到 wrangler.toml

# 5. 套用 schema
wrangler d1 execute gov-expense-events --file=d1_schema.sql

# 6. 設定 stats 查詢 token
wrangler secret put STATS_TOKEN
# 輸入 32 字元亂碼 token,妥善保管

# 7. 部署 Worker
wrangler deploy

# 8. 設定路由(CF dashboard)或用自訂域:
#    events.ntnick-web.workers.dev/api/* → 本 worker
```

## 前端整合(已在 04_main.js)

```javascript
// 04_main.js — 已在 init() 之後 wireEventTracking()
const ENDPOINT = 'https://events.ntnick-web.workers.dev/api/track';
function track(type, target, ctx) {
  if (!navigator.onLine) return;
  fetch(ENDPOINT, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({type, target, context: ctx, ts: Date.now()}),
    keepalive: true,
  }).catch(() => {});
}
```

## 隱私邊界

- **不存 IP**(Cloudflare 已剝離)
- **不存 cookie**(Worker 不發 set-cookie)
- **search query 已 SHA-256 hash**(只看分布,看不到原文)
- **country** 僅 ISO code(粗略)
- **ua_key** 取前 16 字(粗略 device,非 fingerprint)
- **90 天滾動刪除**(每月跑一次清理 SQL)

## 查 stats

```bash
curl "https://events.ntnick-web.workers.dev/api/stats?token=YOUR_TOKEN" | jq
```

回傳:`event_counts_7d` / `top_scenarios_7d` / `top_drawer_7d` / `top_search_7d`

## 成本

- D1 free tier:每天 5M reads / 100K writes,本站每月寫入估 < 50K(遠低於上限)
- Worker free tier:每天 100K requests,本站每月 < 200K(免費內)
- **總成本 NT$0 / 月**

## 何時部署?

報告 1 §16 建議:DAU/MAU 起量(> 10 人/日)且要決定付費功能優先級時,再啟用。當前 PV 較低不必急著部署。

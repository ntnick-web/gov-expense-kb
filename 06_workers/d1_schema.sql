-- d1_schema.sql — Cloudflare D1 schema for event tracking (2026-05-02 #25)
--
-- Apply via Wrangler:
--   wrangler d1 create gov-expense-events
--   wrangler d1 execute gov-expense-events --file 06_workers/d1_schema.sql
--
-- 90 day retention via TTL job(每月跑一次):
--   DELETE FROM events WHERE ts < (strftime('%s','now') - 90*86400) * 1000;

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,                 -- Unix epoch ms
  type        TEXT NOT NULL,                    -- page_view / view_change / scenario_apply / drawer_open / search / flow_start / flow_conclude / compare_open / rate_lookup
  target      TEXT,                             -- 對象 ID(節點 ID / scenario ID / view name / search hash)
  parent      TEXT,                             -- 母題(若適用):國內旅費 / 國外旅費 / 支出憑證與結報
  expense     TEXT,                             -- 支出類別(若適用)
  context_json TEXT,                            -- 自由 JSON 補充欄位(必要時)
  ua_key      TEXT,                             -- User-Agent 前 16 字(粗略 device 分類,非 fingerprint)
  country     TEXT                              -- ISO country code (Cloudflare cf.country)
);

-- 索引(查詢效能)
CREATE INDEX IF NOT EXISTS idx_events_ts ON events (ts);
CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events (type, ts);
CREATE INDEX IF NOT EXISTS idx_events_target_type ON events (target, type);

-- 隱私聲明:
-- - 不存 IP、不存 cookie、不存原始 query(query 已 SHA-256 hash 取前 8 byte)
-- - country 僅 ISO code(粗略地理),非精確位置
-- - ua_key 僅 16 字粗略 device 分類,非完整 fingerprint
-- - 90 天滾動刪除

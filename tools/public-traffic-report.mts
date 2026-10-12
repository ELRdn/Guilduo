import { spawnSync } from "node:child_process";

const days = Number(process.argv[2] || 28);
if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error("Days must be an integer from 1 to 90.");
const database = process.env.D1_DATABASE_NAME || "questforge-integrations";
const sql = `SELECT date(created_at, '+9 hours') AS day_jst,
  json_extract(metrics_json, '$.kind') AS page,
  json_extract(metrics_json, '$.status') AS language,
  json_extract(metrics_json, '$.source') AS source,
  SUM(name = 'public_page_view') AS consenting_page_views,
  SUM(name = 'app_cta_click') AS app_clicks
  FROM telemetry_events
  WHERE name IN ('public_page_view', 'app_cta_click')
    AND datetime(created_at) >= datetime('now', '-${days} days')
  GROUP BY day_jst, page, language, source ORDER BY day_jst, page, language, source`;
// Operator-only D1 access; no public analytics or account-data endpoint.
const result = spawnSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", database, "--remote", "--json", "--command", sql], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

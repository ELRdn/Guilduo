import { writeFile } from "node:fs/promises";
import { OFFICIAL_SITE_ORIGIN } from "../site-routing.ts";

const required = [
  "APPWRITE_ENDPOINT", "APPWRITE_PROJECT_ID", "APPWRITE_DATABASE_ID", "APPWRITE_STATE_TABLE_ID", "APPWRITE_LEGACY_TABLE_ID",
  "WORKER_BASE_URL", "WEB_APP_URL", "D1_DATABASE_NAME", "D1_DATABASE_ID", "KV_NAMESPACE_ID", "R2_BUCKET_NAME",
];
for (const name of required) {
  if (!String(process.env[name] || "").trim()) throw new Error(`Missing release variable: ${name}`);
}

const json = (value: unknown): string => JSON.stringify(value, null, 2);
const normalizeBaseUrl = (value: string, name: string): string => {
  const normalized = String(value || "").trim().replace(/\/+$/, "");
  try {
    const url = new URL(normalized);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("invalid URL");
    return url.origin;
  } catch {
    throw new Error(`Invalid release URL: ${name}`);
  }
};
const workerBaseUrl = normalizeBaseUrl(process.env.WORKER_BASE_URL || "", "WORKER_BASE_URL");
const mcpBaseUrl = normalizeBaseUrl(process.env.MCP_BASE_URL || "https://mcp.guilduo.com", "MCP_BASE_URL");
const providerOAuthBaseUrl = normalizeBaseUrl(process.env.PROVIDER_OAUTH_BASE_URL || workerBaseUrl, "PROVIDER_OAUTH_BASE_URL");
const webAppUrl = normalizeBaseUrl(process.env.WEB_APP_URL || "", "WEB_APP_URL");
const publicSiteUrl = normalizeBaseUrl(process.env.PUBLIC_SITE_URL || OFFICIAL_SITE_ORIGIN, "PUBLIC_SITE_URL");
const mcpAllowedOrigins = String(process.env.MCP_ALLOWED_ORIGINS || `${workerBaseUrl},${mcpBaseUrl}`).trim();
const allowedWebOrigins = [...new Set([webAppUrl, publicSiteUrl, "http://localhost:5173", "http://127.0.0.1:5173"])].join(",");
const placementRegion = String(process.env.WORKER_PLACEMENT_REGION || "").trim();
const revisionBatch = String(process.env.APPWRITE_REVISION_BATCH || "false").trim();
const webApiZone = String(process.env.WEB_API_ROUTE_ZONE_ID || "").trim();
const webApiBrowser = String(process.env.WEB_API_BROWSER_ENABLED || "false").trim();
const webApiManagement = String(process.env.WEB_API_ROUTE_MANAGEMENT || "wrangler").trim();
if (!["wrangler", "dashboard"].includes(webApiManagement) || (webApiManagement === "dashboard" && !webApiZone)) {
  throw new Error("Web API route management must be wrangler or dashboard with a configured zone.");
}
if ((webApiZone && (!/^[a-f0-9]{32}$/.test(webApiZone) || !webAppUrl.startsWith("https://")))
  || !["true", "false"].includes(webApiBrowser) || (webApiBrowser === "true" && !webApiZone)) {
  throw new Error("Web API routing requires a valid zone, HTTPS Web App, and explicit browser switch.");
}
if (revisionBatch !== "true" && revisionBatch !== "false") {
  throw new Error("Invalid APPWRITE_REVISION_BATCH: expected true or false");
}
if (placementRegion && !/^(aws|gcp|azure):[a-z][a-z0-9-]{1,63}$/.test(placementRegion)) {
  throw new Error("Invalid WORKER_PLACEMENT_REGION: expected provider:region");
}
const appwrite = {
  endpoint: process.env.APPWRITE_ENDPOINT,
  projectId: process.env.APPWRITE_PROJECT_ID,
};
const runtime = {
  gatewayUrl: mcpBaseUrl,
  webApiBaseUrl: webApiBrowser === "true" ? `${webAppUrl}/api` : "",
  sourceUrl: process.env.SOURCE_URL || "",
  externalOAuthEnabled: String(process.env.EXTERNAL_OAUTH_ENABLED || "false").toLowerCase() === "true",
  telemetryEndpoint: process.env.TELEMETRY_ENDPOINT || `${mcpBaseUrl}/telemetry`,
  appwriteEndpoint: process.env.APPWRITE_ENDPOINT,
  appwriteProjectId: process.env.APPWRITE_PROJECT_ID,
  joinGuildUrl: process.env.JOIN_GUILD_URL || `${webAppUrl}/`,
};
const wrangler = {
  $schema: "node_modules/wrangler/config-schema.json",
  name: "questforge-gateway",
  main: "worker/src/index.ts",
  compatibility_date: "2026-07-31",
  compatibility_flags: ["nodejs_compat"],
  workers_dev: true,
  ...(placementRegion ? { placement: { region: placementRegion } } : {}),
  routes: [
    { pattern: new URL(mcpBaseUrl).hostname, custom_domain: true },
    ...(webApiZone && webApiManagement === "wrangler" ? [{ pattern: `${webAppUrl}/api/v1/*`, zone_id: webApiZone }] : []),
  ],
  vars: {
    APPWRITE_ENDPOINT: process.env.APPWRITE_ENDPOINT,
    APPWRITE_PROJECT_ID: process.env.APPWRITE_PROJECT_ID,
    APPWRITE_DATABASE_ID: process.env.APPWRITE_DATABASE_ID,
    APPWRITE_STATE_TABLE_ID: process.env.APPWRITE_STATE_TABLE_ID,
    APPWRITE_LEGACY_TABLE_ID: process.env.APPWRITE_LEGACY_TABLE_ID,
    APPWRITE_REVISION_BATCH: revisionBatch,
    PUBLIC_BASE_URL: workerBaseUrl,
    PROVIDER_OAUTH_BASE_URL: providerOAuthBaseUrl,
    MCP_ALLOWED_ORIGINS: mcpAllowedOrigins,
    WEB_APP_URL: webAppUrl,
    WEB_API_ENABLED: webApiZone ? "true" : "false",
    ALLOWED_ORIGINS: allowedWebOrigins,
  },
  triggers: { crons: ["*/15 * * * *"] },
  d1_databases: [{ binding: "QUESTFORGE_DB", database_name: process.env.D1_DATABASE_NAME, database_id: process.env.D1_DATABASE_ID }],
  kv_namespaces: [{ binding: "QUESTFORGE_KV", id: process.env.KV_NAMESPACE_ID, remote: true }],
  // Agent avatar image bytes (worker/src/agent-avatar-store.ts). The bucket
  // itself is created out-of-band with `wrangler r2 bucket create` — this
  // only wires the binding, so a missing R2_BUCKET_NAME must fail the whole
  // generation (see the `required` check above) rather than silently
  // producing a config where Avatar PUT 503s despite the bucket existing.
  r2_buckets: [{ binding: "AGENT_AVATARS", bucket_name: process.env.R2_BUCKET_NAME }],
};

await writeFile("appwrite-config.js", `export default ${json(appwrite)};\n`);
await writeFile("runtime-config.js", `const runtimeConfig = ${json(runtime)};\nglobalThis.QuestForgeConfig = runtimeConfig;\nexport default runtimeConfig;\n`);
await writeFile("wrangler.jsonc", `${json(wrangler)}\n`);
console.log("Generated ignored release configuration files.");

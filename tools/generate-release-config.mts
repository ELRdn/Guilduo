import { writeFile } from "node:fs/promises";

const required = [
  "APPWRITE_ENDPOINT", "APPWRITE_PROJECT_ID", "APPWRITE_DATABASE_ID", "APPWRITE_STATE_TABLE_ID", "APPWRITE_LEGACY_TABLE_ID",
  "WORKER_BASE_URL", "WEB_APP_URL", "D1_DATABASE_NAME", "D1_DATABASE_ID", "KV_NAMESPACE_ID", "R2_BUCKET_NAME",
];
for (const name of required) {
  if (!String(process.env[name] || "").trim()) throw new Error(`Missing release variable: ${name}`);
}

const json = (value: unknown): string => JSON.stringify(value, null, 2);
const appwrite = {
  endpoint: process.env.APPWRITE_ENDPOINT,
  projectId: process.env.APPWRITE_PROJECT_ID,
};
const runtime = {
  gatewayUrl: process.env.WORKER_BASE_URL,
  sourceUrl: process.env.SOURCE_URL || "",
  externalOAuthEnabled: String(process.env.EXTERNAL_OAUTH_ENABLED || "false").toLowerCase() === "true",
  telemetryEndpoint: process.env.TELEMETRY_ENDPOINT || `${process.env.WORKER_BASE_URL}/telemetry`,
  appwriteEndpoint: process.env.APPWRITE_ENDPOINT,
  appwriteProjectId: process.env.APPWRITE_PROJECT_ID,
  joinGuildUrl: process.env.JOIN_GUILD_URL || "/next/",
};
const wrangler = {
  $schema: "node_modules/wrangler/config-schema.json",
  name: "questforge-gateway",
  main: "worker/src/index.ts",
  compatibility_date: "2026-07-31",
  compatibility_flags: ["nodejs_compat"],
  workers_dev: true,
  vars: {
    APPWRITE_ENDPOINT: process.env.APPWRITE_ENDPOINT,
    APPWRITE_PROJECT_ID: process.env.APPWRITE_PROJECT_ID,
    APPWRITE_DATABASE_ID: process.env.APPWRITE_DATABASE_ID,
    APPWRITE_STATE_TABLE_ID: process.env.APPWRITE_STATE_TABLE_ID,
    APPWRITE_LEGACY_TABLE_ID: process.env.APPWRITE_LEGACY_TABLE_ID,
    PUBLIC_BASE_URL: process.env.WORKER_BASE_URL,
    WEB_APP_URL: process.env.WEB_APP_URL,
    ALLOWED_ORIGINS: `${process.env.WEB_APP_URL},http://localhost:5173,http://127.0.0.1:5173`,
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

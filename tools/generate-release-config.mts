// @ts-nocheck
import { writeFile } from "node:fs/promises";

const required = [
  "FIREBASE_PROJECT_ID", "FIREBASE_DATABASE_URL", "FIREBASE_API_KEY", "FIREBASE_AUTH_DOMAIN",
  "FIREBASE_STORAGE_BUCKET", "FIREBASE_MESSAGING_SENDER_ID", "FIREBASE_APP_ID",
  "WORKER_BASE_URL", "WEB_APP_URL", "D1_DATABASE_NAME", "D1_DATABASE_ID", "KV_NAMESPACE_ID",
];
for (const name of required) {
  if (!String(process.env[name] || "").trim()) throw new Error(`Missing release variable: ${name}`);
}

const json = (value) => JSON.stringify(value, null, 2);
const firebase = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};
const runtime = {
  gatewayUrl: process.env.WORKER_BASE_URL,
  sourceUrl: process.env.SOURCE_URL || "",
  externalOAuthEnabled: String(process.env.EXTERNAL_OAUTH_ENABLED || "false").toLowerCase() === "true",
  telemetryEndpoint: process.env.TELEMETRY_ENDPOINT || `${process.env.WORKER_BASE_URL}/telemetry`,
};
const wrangler = {
  $schema: "node_modules/wrangler/config-schema.json",
  name: "questforge-gateway",
  main: "worker/src/index.ts",
  compatibility_date: "2026-07-31",
  compatibility_flags: ["nodejs_compat"],
  workers_dev: true,
  vars: {
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_DATABASE_URL: process.env.FIREBASE_DATABASE_URL,
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
    PUBLIC_BASE_URL: process.env.WORKER_BASE_URL,
    WEB_APP_URL: process.env.WEB_APP_URL,
    ALLOWED_ORIGINS: `${process.env.WEB_APP_URL},http://localhost:5173,http://127.0.0.1:5173`,
  },
  triggers: { crons: ["*/15 * * * *"] },
  d1_databases: [{ binding: "QUESTFORGE_DB", database_name: process.env.D1_DATABASE_NAME, database_id: process.env.D1_DATABASE_ID }],
  kv_namespaces: [{ binding: "QUESTFORGE_KV", id: process.env.KV_NAMESPACE_ID, remote: true }],
};

await writeFile("firebase-config.js", `export default ${json(firebase)};\n`);
await writeFile("runtime-config.js", `const runtimeConfig = ${json(runtime)};\nglobalThis.QuestForgeConfig = runtimeConfig;\nexport default runtimeConfig;\n`);
await writeFile("wrangler.jsonc", `${json(wrangler)}\n`);
console.log("Generated ignored release configuration files.");

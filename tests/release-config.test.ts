const test = require("node:test");
const assert = require("node:assert/strict");
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/*
 * `tools/generate-release-config.mts` writes `wrangler.jsonc` (and the other
 * gitignored release files) to the *current working directory* — never the
 * real repo root here, since that would clobber the developer's own local
 * `wrangler.jsonc`. Each test spawns the real script via `tsx` with `cwd` set
 * to a throwaway temp directory, so this exercises the actual generator, not
 * a reimplementation of it.
 */

const root = path.join(__dirname, "..");
const scriptPath = path.join(root, "tools", "generate-release-config.mts");
const tsxCli = require.resolve("tsx/cli");

const BASE_ENV = {
  WEB_API_ROUTE_ZONE_ID: "",
  WEB_API_ROUTE_MANAGEMENT: "wrangler",
  WEB_API_BROWSER_ENABLED: "false",
  APPWRITE_REVISION_BATCH: "",
  WORKER_PLACEMENT_REGION: "",
  APPWRITE_ENDPOINT: "https://example.cloud.appwrite.io/v1",
  APPWRITE_PROJECT_ID: "example-project",
  APPWRITE_DATABASE_ID: "guilduo",
  APPWRITE_STATE_TABLE_ID: "user_states",
  APPWRITE_LEGACY_TABLE_ID: "legacy_states",
  WORKER_BASE_URL: "https://example-gateway.example.workers.dev",
  WEB_APP_URL: "https://example-site.appwrite.network",
  D1_DATABASE_NAME: "questforge-data",
  D1_DATABASE_ID: "d1-database-id",
  KV_NAMESPACE_ID: "kv-namespace-id",
};

function withTempDir<T>(run: (dir: string) => T): T {
  const dir = mkdtempSync(path.join(tmpdir(), "guilduo-release-config-"));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runGenerator(dir: string, env: NodeJS.ProcessEnv): string {
  return execFileSync(process.execPath, [tsxCli, scriptPath], {
    cwd: dir,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

test("Web API route and browser rollout are separate and leave MCP/static URLs intact", () => {
  for (const enabled of ["false", "true"]) withTempDir(dir => {
    runGenerator(dir, { ...process.env, ...BASE_ENV, R2_BUCKET_NAME: "avatars", WEB_APP_URL: "https://app.example.test", WEB_API_ROUTE_ZONE_ID: "a".repeat(32), WEB_API_BROWSER_ENABLED: enabled });
    const wrangler = JSON.parse(readFileSync(path.join(dir, "wrangler.jsonc"), "utf8"));
    const runtime = JSON.parse(readFileSync(path.join(dir, "runtime-config.js"), "utf8").replace(/^const runtimeConfig = /, "").replace(/;\nglobalThis[\s\S]+$/, ""));
    assert.deepEqual(wrangler.routes, [{ pattern: "mcp.guilduo.com", custom_domain: true }, { pattern: "https://app.example.test/api/v1/*", zone_id: "a".repeat(32) }]);
    assert.equal(wrangler.vars.WEB_API_ENABLED, "true");
    assert.equal(runtime.gatewayUrl, "https://mcp.guilduo.com");
    assert.equal(runtime.webApiBaseUrl, enabled === "true" ? "https://app.example.test/api" : "");
  });
  for (const extra of [
    { WEB_API_ROUTE_ZONE_ID: "invalid" }, { WEB_API_BROWSER_ENABLED: "true" },
    { WEB_API_BROWSER_ENABLED: "typo" }, { WEB_API_ROUTE_ZONE_ID: "a".repeat(32), WEB_APP_URL: "http://app.example.test" },
  ]) withTempDir(dir => {
    assert.throws(() => runGenerator(dir, { ...process.env, ...BASE_ENV, R2_BUCKET_NAME: "avatars", ...extra }));
    assert.equal(existsSync(path.join(dir, "wrangler.jsonc")), false);
  });
});

test("dashboard-managed route preserves Worker support without route API permissions", () => {
  withTempDir(dir => {
    runGenerator(dir, { ...process.env, ...BASE_ENV, R2_BUCKET_NAME: "avatars", WEB_API_ROUTE_ZONE_ID: "a".repeat(32), WEB_API_ROUTE_MANAGEMENT: "dashboard", WEB_API_BROWSER_ENABLED: "true" });
    const config = JSON.parse(readFileSync(path.join(dir, "wrangler.jsonc"), "utf8"));
    assert.deepEqual(config.routes, [{ pattern: "mcp.guilduo.com", custom_domain: true }]);
    assert.equal(config.vars.WEB_API_ENABLED, "true");
    assert.match(readFileSync(path.join(dir, "runtime-config.js"), "utf8"), /webApiBaseUrl/);
  });
  for (const extra of [{ WEB_API_ROUTE_MANAGEMENT: "typo" }, { WEB_API_ROUTE_MANAGEMENT: "dashboard" }]) withTempDir(dir => {
    assert.throws(() => runGenerator(dir, { ...process.env, ...BASE_ENV, R2_BUCKET_NAME: "avatars", ...extra }));
    assert.equal(existsSync(path.join(dir, "wrangler.jsonc")), false);
  });
});

test("release placement is optional, validated and never changes the Appwrite endpoint", () => {
  for (const region of ["", "aws:ap-southeast-1"]) {
    withTempDir((dir) => {
      runGenerator(dir, { ...process.env, ...BASE_ENV, R2_BUCKET_NAME: "avatars", WORKER_PLACEMENT_REGION: region });
      const config = JSON.parse(readFileSync(path.join(dir, "wrangler.jsonc"), "utf8"));
      assert.deepEqual(config.placement, region ? { region } : undefined);
      assert.equal(config.vars.APPWRITE_ENDPOINT, BASE_ENV.APPWRITE_ENDPOINT);
      assert.deepEqual(config.compatibility_flags, ["nodejs_compat"]);
    });
  }
  withTempDir((dir) => {
    assert.throws(() => runGenerator(dir, { ...process.env, ...BASE_ENV, R2_BUCKET_NAME: "avatars", WORKER_PLACEMENT_REGION: "https://untrusted.invalid" }));
    assert.equal(existsSync(path.join(dir, "wrangler.jsonc")), false);
  });
});

test("revision batching is explicitly configurable with a safe default and rejects typos", () => {
  for (const flag of ["", "false", "true"]) {
    withTempDir((dir) => {
      runGenerator(dir, { ...process.env, ...BASE_ENV, R2_BUCKET_NAME: "avatars", APPWRITE_REVISION_BATCH: flag });
      const config = JSON.parse(readFileSync(path.join(dir, "wrangler.jsonc"), "utf8"));
      assert.equal(config.vars.APPWRITE_REVISION_BATCH, flag || "false");
    });
  }
  withTempDir((dir) => {
    assert.throws(() => runGenerator(dir, { ...process.env, ...BASE_ENV, R2_BUCKET_NAME: "avatars", APPWRITE_REVISION_BATCH: "treu" }));
    assert.equal(existsSync(path.join(dir, "wrangler.jsonc")), false);
  });
});

test("release config generation wires the AGENT_AVATARS R2 binding from R2_BUCKET_NAME", () => {
  withTempDir((dir) => {
    runGenerator(dir, { ...process.env, ...BASE_ENV, R2_BUCKET_NAME: "guilduo-agent-avatars-prod" });
    const wrangler = JSON.parse(readFileSync(path.join(dir, "wrangler.jsonc"), "utf8")) as {
      r2_buckets?: Array<{ binding: string; bucket_name: string }>;
      routes?: Array<{ pattern: string; custom_domain?: boolean }>;
      vars?: { PUBLIC_BASE_URL?: string; PROVIDER_OAUTH_BASE_URL?: string; MCP_ALLOWED_ORIGINS?: string; WEB_APP_URL?: string; ALLOWED_ORIGINS?: string };
    };
    const runtime = JSON.parse(readFileSync(path.join(dir, "runtime-config.js"), "utf8").replace(/^const runtimeConfig = /, "").replace(/;\nglobalThis[\s\S]+$/, "")) as { gatewayUrl?: string; joinGuildUrl?: string };
    assert.deepEqual(wrangler.r2_buckets, [{ binding: "AGENT_AVATARS", bucket_name: "guilduo-agent-avatars-prod" }]);
    assert.equal(runtime.gatewayUrl, "https://mcp.guilduo.com");
    assert.equal(runtime.joinGuildUrl, `${BASE_ENV.WEB_APP_URL}/`);
    assert.equal(wrangler.vars?.PUBLIC_BASE_URL, BASE_ENV.WORKER_BASE_URL);
    assert.equal(wrangler.vars?.PROVIDER_OAUTH_BASE_URL, BASE_ENV.WORKER_BASE_URL);
    assert.equal(wrangler.vars?.MCP_ALLOWED_ORIGINS, `${BASE_ENV.WORKER_BASE_URL},https://mcp.guilduo.com`);
    assert.equal(wrangler.vars?.WEB_APP_URL, BASE_ENV.WEB_APP_URL);
    assert.equal(wrangler.vars?.ALLOWED_ORIGINS, `${BASE_ENV.WEB_APP_URL},https://guilduo.com,http://localhost:5173,http://127.0.0.1:5173`);
    assert.deepEqual(wrangler.routes, [{ pattern: "mcp.guilduo.com", custom_domain: true }]);
    // The bucket name is a public-ish identifier, not a secret — but nothing
    // else about the R2 config should leak beyond this one binding entry.
    assert.equal(wrangler.r2_buckets?.length, 1);
  });
});

test("release config allows an explicit MCP origin without moving Provider OAuth callbacks", () => {
  withTempDir((dir) => {
    const env = {
      ...process.env,
      ...BASE_ENV,
      R2_BUCKET_NAME: "guilduo-agent-avatars-prod",
      MCP_BASE_URL: "https://mcp.example.com",
      PROVIDER_OAUTH_BASE_URL: BASE_ENV.WORKER_BASE_URL,
      MCP_ALLOWED_ORIGINS: `${BASE_ENV.WORKER_BASE_URL},https://mcp.example.com`,
      PUBLIC_SITE_URL: "https://site.example.com",
    };
    runGenerator(dir, env);
    const wrangler = JSON.parse(readFileSync(path.join(dir, "wrangler.jsonc"), "utf8")) as {
      vars?: { PROVIDER_OAUTH_BASE_URL?: string; MCP_ALLOWED_ORIGINS?: string; ALLOWED_ORIGINS?: string };
      routes?: Array<{ pattern: string; custom_domain?: boolean }>;
    };
    assert.equal(wrangler.vars?.PROVIDER_OAUTH_BASE_URL, BASE_ENV.WORKER_BASE_URL);
    assert.equal(wrangler.vars?.MCP_ALLOWED_ORIGINS, `${BASE_ENV.WORKER_BASE_URL},https://mcp.example.com`);
    assert.equal(wrangler.vars?.ALLOWED_ORIGINS, `${BASE_ENV.WEB_APP_URL},https://site.example.com,http://localhost:5173,http://127.0.0.1:5173`);
    assert.deepEqual(wrangler.routes, [{ pattern: "mcp.example.com", custom_domain: true }]);
  });
});

test("release config generation fails closed — not silently — when R2_BUCKET_NAME is missing", () => {
  withTempDir((dir) => {
    const env: NodeJS.ProcessEnv = { ...process.env, ...BASE_ENV };
    delete env.R2_BUCKET_NAME;
    assert.throws(() => runGenerator(dir, env));
    assert.equal(existsSync(path.join(dir, "wrangler.jsonc")), false, "no half-generated config should be left behind");
  });
});

test("release config rejects a path-bearing public origin instead of silently changing URL roles", () => {
  withTempDir((dir) => {
    const env: NodeJS.ProcessEnv = { ...process.env, ...BASE_ENV, R2_BUCKET_NAME: "guilduo-agent-avatars-prod", PUBLIC_SITE_URL: "https://guilduo.com/lp/" };
    assert.throws(() => runGenerator(dir, env), /Invalid release URL: PUBLIC_SITE_URL/);
    assert.equal(existsSync(path.join(dir, "wrangler.jsonc")), false);
  });
});

test("release config generation still emits the AGENT_AVATARS binding on a second (tagged-release) regeneration pass", () => {
  // The workflow calls the generator twice: once before the Appwrite Site
  // deploy, once after (to pick up the real Site URL). The binding must
  // survive being regenerated, not just appear on a first run.
  withTempDir((dir) => {
    const env = { ...process.env, ...BASE_ENV, R2_BUCKET_NAME: "guilduo-agent-avatars-prod" };
    runGenerator(dir, env);
    runGenerator(dir, { ...env, WEB_APP_URL: "https://real-deployment.appwrite.network" });
    const wrangler = JSON.parse(readFileSync(path.join(dir, "wrangler.jsonc"), "utf8")) as {
      r2_buckets?: Array<{ binding: string; bucket_name: string }>;
      vars?: { WEB_APP_URL?: string };
    };
    assert.deepEqual(wrangler.r2_buckets, [{ binding: "AGENT_AVATARS", bucket_name: "guilduo-agent-avatars-prod" }]);
    assert.equal(wrangler.vars?.WEB_APP_URL, "https://real-deployment.appwrite.network");
  });
});

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

test("release config generation wires the AGENT_AVATARS R2 binding from R2_BUCKET_NAME", () => {
  withTempDir((dir) => {
    runGenerator(dir, { ...process.env, ...BASE_ENV, R2_BUCKET_NAME: "guilduo-agent-avatars-prod" });
    const wrangler = JSON.parse(readFileSync(path.join(dir, "wrangler.jsonc"), "utf8")) as {
      r2_buckets?: Array<{ binding: string; bucket_name: string }>;
    };
    assert.deepEqual(wrangler.r2_buckets, [{ binding: "AGENT_AVATARS", bucket_name: "guilduo-agent-avatars-prod" }]);
    // The bucket name is a public-ish identifier, not a secret — but nothing
    // else about the R2 config should leak beyond this one binding entry.
    assert.equal(wrangler.r2_buckets?.length, 1);
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

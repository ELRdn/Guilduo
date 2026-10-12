import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const { parseDocument } = createRequire(import.meta.url)("yaml");
type Step = { name?: string; run?: string; shell?: string; if?: unknown; "continue-on-error"?: unknown };
type Workflow = { jobs: { test: { env: Record<string, string>; steps: Step[]; if?: unknown; "continue-on-error"?: unknown } } };
const phases = [
  ["Verify landing page in preview server", [
    "node --import tsx tools/verify-launch-analytics.mts --built",
    "node --import tsx tools/verify-relay-battle.mts http://127.0.0.1:4173 --built",
    "node --import tsx tools/verify-relay-connections.mts http://127.0.0.1:4173 --built",
  ]],
  ["Verify workspace refresh against isolated Worker", [
    "node --import tsx tools/verify-relay-settings.mts http://127.0.0.1:4174",
    "node --import tsx tools/verify-billing-ui.mts",
    "node --import tsx tools/verify-launch-analytics.mts",
    "node --import tsx tools/verify-launch-operations.mts",
    "node --import tsx tools/verify-relay-battle.mts http://127.0.0.1:4174",
    "node --import tsx tools/verify-relay-connections.mts http://127.0.0.1:4174",
  ]],
] as const;

test("launch CI runs isolated acceptance in the correct phases and fails on every verifier error", () => {
  const document = parseDocument(readFileSync(".github/workflows/ci.yml", "utf8"), { uniqueKeys: true });
  assert.deepEqual(document.errors, []);
  const job = (document.toJS() as Workflow).jobs.test;
  assert.equal(job.if, undefined);
  assert.equal(job["continue-on-error"], undefined);
  assert.equal(job.env.QF_CHROME_PATH, "/usr/bin/google-chrome");
  assert.ok(job.steps.some(step => step.run === "npm test"), "npm test discovers this YAML regression check");

  for (const [name, commands] of phases) {
    const step = job.steps.find(step => step.name === name);
    assert.ok(step?.run, name);
    assert.equal(step.shell, "bash");
    assert.equal(step.if, undefined);
    assert.equal(step["continue-on-error"], undefined);
    for (const command of commands) {
      assert.equal(step.run.split("\n").filter(line => line.trim() === command).length, 1, command);
    }
    if (name === "Verify workspace refresh against isolated Worker") {
      for (const tool of ["billing-ui", "launch-analytics", "launch-operations"]) {
        assert.ok(step.run.indexOf(`node --import tsx tools/verify-${tool}.mts`) < step.run.indexOf("npm run dev --"),
          "Self-hosted fixtures finish before dev starts, preventing Vite dependency cache invalidation");
      }
    }

    // Execute the YAML block with Actions' explicit Bash flags. All commands
    // are shell stubs: no servers, browsers, providers or filesystem writes.
    const script = `
      check() { if [[ "$*" == "$FAIL_COMMAND" ]]; then return 23; fi; }
      npm() { check npm "$@"; }
      node() { check node "$@"; }
      curl() { return 0; }
      kill() { return 0; }
      ${step.run.replace(/> \/tmp\/guilduo-[\w-]+\.log/g, "> /dev/null")}
      printf '__reached_end__\\n'
    `;
    for (const failure of ["", ...commands]) {
      const result = spawnSync(process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash",
        ["--noprofile", "--norc", "-e", "-o", "pipefail", "-s"], {
          input: script, encoding: "utf8", timeout: 10_000,
          env: { ...process.env, FAIL_COMMAND: failure },
        });
      assert.ifError(result.error);
      assert.equal(result.status, failure ? 23 : 0, `${name}: ${failure || "success"}: ${result.stderr}`);
      assert.equal(result.stdout.includes("__reached_end__"), !failure, "failure stops subsequent commands");
    }
  }
});

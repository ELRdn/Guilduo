import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

test("Firebase migration dry run accepts retained state beyond 60,000 encoded characters", async () => {
  const history = Array.from({ length: 2400 }, (_, index) => createHash("sha256").update(`migration-history-${index}`).digest("hex")).join("");
  const state = { schemaVersion: 7, tasks: [], migrationSnapshots: { retained: { history } } };
  assert.ok(`gzip:${gzipSync(JSON.stringify(state)).toString("base64")}`.length > 60_000);
  const directory = await mkdtemp(join(tmpdir(), "guilduo-migration-test-"));
  try {
    const statePath = join(directory, "state.json");
    const usersPath = join(directory, "users.json");
    await writeFile(statePath, JSON.stringify({ users: { "fixture-owner": { state: { current: { state } } } } }));
    await writeFile(usersPath, JSON.stringify({ users: [{ localId: "fixture-owner", email: "fixture@example.invalid" }] }));
    const result = spawnSync(process.execPath, ["--import", "tsx", "tools/migrate-firebase-to-appwrite.mts", "--state-export", statePath, "--users-export", usersPath, "--summary-only"], { encoding: "utf8", timeout: 30_000 });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { mode: "dry-run", usersInDatabase: 1, usersWithAuthEmail: 1, ready: 1, skipped: 0 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

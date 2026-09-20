import test from "node:test";
import assert from "node:assert/strict";
import { reloadResourceTiming } from "../interaction-lab/relay-forge/gui-resource-timing.ts";

test("reload timing omits URLs, queries and private identifiers and bounds repeated requests", () => {
  const sample = (name: string, duration = 100) => ({ name, startTime: 10, duration, responseEnd: 10 + duration });
  const result = reloadResourceTiming([
    sample("https://api.example.test/v1/account?secret=private"),
    sample("https://app.example.test/api/v1/workspace/bootstrap"),
    sample("https://app.example.test/api/v1/quests/private-task"),
    sample("https://app.example.test/assets/app-Hash0001.js", 1),
    sample("https://other.test/assets/other.js", 9000),
    ...Array.from({ length: 20 }, () => sample("https://api.example.test/v1/account/jwts")),
  ], "https://app.example.test");
  assert.deepEqual(result.account, [{ startMs: 10, durationMs: 100 }]);
  assert.equal((result.token as unknown[]).length, 5);
  assert.equal(result.lastAssetResponseMs, 11);
  assert.doesNotMatch(JSON.stringify(result), /https|secret|private|Hash0001/);
});

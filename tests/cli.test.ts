const test = require("node:test");
const assert = require("node:assert/strict");
type CapturedRequest = { url: string; options: RequestInit & { headers?: Record<string, string> } };

test("QuestForge CLI parses safe dry-run options and builds a quest payload", async () => {
  const cli = await import("../cli/questforge.ts");
  const parsed = cli.parseArgs(["quests", "add", "--title", "公開準備", "--due", "2026-08-20", "--minutes", "45", "--json"]);
  assert.equal(parsed.options.json, true);
  assert.equal(parsed.options.execute, false);
  assert.deepEqual(cli.buildQuestPayload(parsed.options), {
    kind: "todo",
    title: "公開準備",
    notes: "",
    dueDate: "2026-08-20",
    scheduledDate: "2026-08-20",
    planningMode: "until_due",
    planningState: "scheduled",
    lifecycleState: "active",
    estimatedMinutes: 45,
    difficulty: "medium",
  });
});

test("QuestForge CLI keeps writes as dry-run until --execute", async () => {
  const cli = await import("../cli/questforge.ts");
  const originalFetch = global.fetch;
  const requests: CapturedRequest[] = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options: options as CapturedRequest["options"] });
    return Response.json({ preview: [{ questId: "q-1" }], dryRun: true });
  };
  try {
    const result = await cli.run(["quests", "complete", "q-1"], { QUESTFORGE_API_URL: "https://worker.example", QUESTFORGE_TOKEN: "secret" }) as { dryRun: boolean };
    assert.equal(result.dryRun, true);
    const request = requests[0];
    assert.ok(request);
    assert.match(request.options.headers?.authorization || "", /^Bearer /);
    const body = JSON.parse(String(request.options.body || "{}"));
    assert.equal(body.dryRun, true);
  } finally { global.fetch = originalFetch; }
});

test("QuestForge CLI exposes a stable remote MCP config without credentials", async () => {
  const cli = await import("../cli/questforge.ts");
  const config = cli.mcpConfig("https://worker.example/");
  assert.equal(config.mcpServers.questforge.url, "https://worker.example/mcp");
  assert.equal(config.mcpServers.questforge.authentication, "oauth");
  assert.doesNotMatch(JSON.stringify(config), /token|secret|authorization/i);
});

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeMcpTool,
  normalizeSkillsModel,
} from "../interaction-lab/relay-forge/screens/skills-model.ts";

test("Skills: live MCP records are grouped by human-readable capability and keep the technical name", () => {
  const model = normalizeSkillsModel({
    tools: [
      { name: "create_quest", title: "Create Quest", description: "Create work." },
      { name: "link_agent", title: "Link Agent", description: "Choose an Agent.", category: "agent" },
    ],
    sourceUrl: "https://mcp.guilduo.com/mcp",
    connectionLabel: "Current session",
  });
  assert.equal(model.status, "ready");
  assert.equal(model.totalToolCount, 2);
  assert.deepEqual(model.groups.map((group) => group.id), ["quest-management", "agent-relay"]);
  assert.equal(model.groups[1]?.tools[0]?.title, "Link Agent");
  assert.equal(model.groups[1]?.tools[0]?.name, "link_agent");
});

test("Skills: known metadata wins over the name fallback, while an unknown category is safe in Other / Utilities", () => {
  const metadata = normalizeMcpTool({
    name: "get_quest",
    title: "Read Quest",
    description: "Read a Quest.",
    category: "review",
  });
  const unknown = normalizeMcpTool({
    name: "future_command",
    title: "Future Command",
    description: "A future capability.",
    metadata: { category: "not-a-real-category" },
  });
  assert.equal(metadata?.categoryId, "review-activity");
  assert.equal(unknown?.categoryId, "other");
  assert.equal(unknown?.categoryTitle, "Other / Utilities");
});

test("Skills: search covers title, description, raw name and category, and empty search restores groups", () => {
  const input = [
    { name: "create_quest", title: "Create Quest", description: "Make a new work item." },
    { name: "get_agent_link", title: "Connection Identity", description: "See which Agent acts for this connection." },
  ];
  const byRawName = normalizeSkillsModel({ tools: input, sourceUrl: "https://mcp.guilduo.com/mcp", query: "get_agent_link" });
  const byDescription = normalizeSkillsModel({ tools: input, sourceUrl: "https://mcp.guilduo.com/mcp", query: "acts for" });
  const byCategory = normalizeSkillsModel({ tools: input, sourceUrl: "https://mcp.guilduo.com/mcp", query: "agent & relay" });
  const all = normalizeSkillsModel({ tools: input, sourceUrl: "https://mcp.guilduo.com/mcp" });
  assert.equal(byRawName.visibleToolCount, 1);
  assert.equal(byDescription.visibleToolCount, 1);
  assert.equal(byCategory.visibleToolCount, 1);
  assert.equal(all.visibleToolCount, 2);
});

test("Skills: loading, unconnected, error and zero-tool states are distinct", () => {
  assert.equal(normalizeSkillsModel({ tools: [], sourceUrl: "https://mcp.guilduo.com/mcp", loading: true }).status, "loading");
  assert.equal(normalizeSkillsModel({ tools: [], sourceUrl: "", connected: false }).status, "unconnected");
  assert.equal(normalizeSkillsModel({ tools: [], sourceUrl: "https://mcp.guilduo.com/mcp", error: "network" }).status, "error");
  assert.equal(normalizeSkillsModel({ tools: [], sourceUrl: "https://mcp.guilduo.com/mcp" }).status, "empty");
});

test("Skills: duplicate or malformed protocol entries never inflate the catalogue", () => {
  const model = normalizeSkillsModel({
    tools: [
      { name: "get_quest", title: "First" },
      { name: "get_quest", title: "Duplicate" },
      null,
      { description: "Missing a protocol name" },
    ],
    sourceUrl: "https://mcp.guilduo.com/mcp",
  });
  assert.equal(model.totalToolCount, 1);
  assert.equal(model.groups[0]?.tools[0]?.title, "First");
});

test("Skills: the checked-in MCP contract is fully catalogued without an unknown bucket", () => {
  const contract = JSON.parse(readFileSync(new URL("../api/mcp-tools.json", import.meta.url), "utf8")) as { tools?: unknown[] };
  const model = normalizeSkillsModel({ tools: contract.tools ?? [], sourceUrl: "https://mcp.guilduo.com/mcp" });
  assert.equal(model.totalToolCount, 56);
  assert.equal(model.status, "ready");
  assert.equal(model.groups.some((group) => group.id === "other"), false);
  assert.deepEqual(
    model.groups.map((group) => group.id),
    ["quest-management", "agent-relay", "connections-sync", "profile-social", "party", "toggl-focus", "character", "battle-rewards", "review-activity"],
  );
});

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Quest } from "../types/questforge.ts";
import { fixtureActors } from "../interaction-lab/relay-forge/fixtures.ts";
import { normalizeQuestsModel } from "../interaction-lab/relay-forge/screens/quests-model.ts";
import { normalizeNetworkModel } from "../interaction-lab/relay-forge/screens/network-model.ts";
import {
  centreNetworkCamera,
  fitNetworkCamera,
  layoutNetworkWorld,
  zoomNetworkCameraAt,
} from "../interaction-lab/relay-forge/screens/network-layout.ts";
import { normalizePartyModel } from "../interaction-lab/relay-forge/screens/party-model.ts";
import { normalizeBattleModel } from "../interaction-lab/relay-forge/screens/battle-model.ts";
import { FixtureBattlePort, fixtureBattleState } from "../interaction-lab/relay-forge/screens/battle-port.ts";
import { normalizeConnectionsModel } from "../interaction-lab/relay-forge/screens/connections-model.ts";
import { FixtureConnectionsPort, REQUIRED_SCOPES } from "../interaction-lab/relay-forge/screens/connections-port.ts";

/**
 * These tests exercise the five screen adapters against real domain values —
 * `types/questforge.ts` Quests, the OpenAPI record shapes, and for Battle the
 * actual `shared/battle-rules.ts` engine. Nothing here asserts a fixture
 * against itself: every expectation is a property the production data must also
 * satisfy.
 */

const NOW = Date.parse("2026-08-26T11:20:00.000Z");
const TODAY = "2026-08-26";

function quest(overrides: Partial<Quest> & Pick<Quest, "id" | "title">): Quest {
  return {
    kind: "todo",
    notes: "",
    category: "delivery",
    tags: [],
    difficulty: "medium",
    repeat: "none",
    planningState: "scheduled",
    lifecycleState: "active",
    planningMode: "on_date",
    scheduledDate: "2026-08-26",
    scheduledTime: "",
    dueDate: "2026-08-28",
    estimatedMinutes: 60,
    actualMinutes: 0,
    manualActualMinutes: 0,
    togglActualMinutes: 0,
    completionCriteria: "",
    nextAction: "",
    impact: "medium",
    isBlockingOthers: false,
    rolloverCount: 0,
    dependencyIds: [],
    parentQuestId: "",
    completedAt: "",
    archivedAt: "",
    createdAt: "2026-08-18T09:00:00.000Z",
    updatedAt: "2026-08-26T09:00:00.000Z",
    done: false,
    assignee: { type: "agent", id: "a-forge", label: "Forge Runner", handoffState: "working" },
    handoff: {
      note: "", blockedReason: "", artifactUrl: "",
      startedAt: "2026-08-26T08:40:00.000Z", reviewRequestedAt: "", reviewedAt: "", reviewedBy: "",
    },
    externalLinks: [],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ *
 * Quests
 * ------------------------------------------------------------------ */

test("Quests: buckets come from the domain's own handoff and lifecycle fields", () => {
  const model = normalizeQuestsModel({
    quests: [
      quest({ id: "q-1", title: "review", assignee: { type: "agent", id: "a-forge", label: "F", handoffState: "review_required" } }),
      quest({ id: "q-2", title: "blocked", assignee: { type: "agent", id: "a-forge", label: "F", handoffState: "blocked" } }),
      quest({ id: "q-3", title: "working" }),
      quest({ id: "q-4", title: "done", done: true, lifecycleState: "completed" }),
      quest({ id: "q-5", title: "backlog", planningState: "backlog", assignee: { type: "self", id: "me", label: "Me", handoffState: "none" } }),
    ],
    selfUid: "hironao",
    now: NOW,
    today: TODAY,
  });
  const bucket = (id: string): string => model.rows.find((row) => row.id === id)?.bucket ?? "";
  assert.equal(bucket("q-1"), "review");
  assert.equal(bucket("q-2"), "blocked");
  assert.equal(bucket("q-3"), "working");
  assert.equal(bucket("q-4"), "done");
  assert.equal(bucket("q-5"), "working", "a backlog Quest with no handoff is still in flight, not scheduled");
});

test("Quests: an unmet dependency blocks the dependant, a completed one does not", () => {
  const model = normalizeQuestsModel({
    quests: [
      quest({ id: "q-root", title: "root" }),
      quest({ id: "q-done", title: "done", done: true, lifecycleState: "completed" }),
      quest({ id: "q-waits-open", title: "waits on open", dependencyIds: ["q-root"] }),
      quest({ id: "q-waits-done", title: "waits on done", dependencyIds: ["q-done"] }),
    ],
    selfUid: "hironao",
    now: NOW,
    today: TODAY,
  });
  const open = model.rows.find((row) => row.id === "q-waits-open");
  const closed = model.rows.find((row) => row.id === "q-waits-done");
  assert.equal(open?.bucket, "blocked");
  assert.deepEqual(open?.blockedByIds, ["q-root"]);
  assert.equal(closed?.bucket, "working");
  assert.deepEqual(closed?.blockedByIds, []);
});

test("Quests: downstream cost counts the whole chain, and survives a dependency cycle", () => {
  const model = normalizeQuestsModel({
    quests: [
      quest({ id: "q-a", title: "a" }),
      quest({ id: "q-b", title: "b", dependencyIds: ["q-a"] }),
      quest({ id: "q-c", title: "c", dependencyIds: ["q-b"] }),
      quest({ id: "q-d", title: "d", dependencyIds: ["q-c"] }),
      // A cycle would hang a naive traversal.
      quest({ id: "q-x", title: "x", dependencyIds: ["q-y"] }),
      quest({ id: "q-y", title: "y", dependencyIds: ["q-x"] }),
    ],
    selfUid: "hironao",
    now: NOW,
    today: TODAY,
  });
  const a = model.rows.find((row) => row.id === "q-a");
  assert.equal(a?.downstreamTotal, 3, "the transitive closure, not just the direct edge");
  assert.deepEqual(a?.downstreamIds, ["q-b"]);
  const x = model.rows.find((row) => row.id === "q-x");
  assert.ok(x !== undefined && x.downstreamTotal <= 2, "a cycle terminates instead of looping");
});

test("Quests: overdue is measured against today and never applies to a completed Quest", () => {
  const model = normalizeQuestsModel({
    quests: [
      quest({ id: "q-late", title: "late", dueDate: "2026-08-20" }),
      quest({ id: "q-soon", title: "soon", dueDate: "2026-08-30" }),
      quest({ id: "q-none", title: "none", dueDate: "" }),
      quest({ id: "q-late-done", title: "late but finished", dueDate: "2026-08-20", done: true, lifecycleState: "completed" }),
    ],
    selfUid: "hironao",
    now: NOW,
    today: TODAY,
  });
  const overdue = (id: string): boolean => model.rows.find((row) => row.id === id)?.overdue === true;
  assert.equal(overdue("q-late"), true);
  assert.equal(overdue("q-soon"), false);
  assert.equal(overdue("q-none"), false, "no due date is not an overdue date");
  assert.equal(overdue("q-late-done"), false);
});

test("Quests: owner ids match the ids the identity map is keyed by", () => {
  const model = normalizeQuestsModel({
    quests: [
      quest({ id: "q-1", title: "agent", assignee: { type: "agent", id: "a-forge", label: "F", handoffState: "working" } }),
      quest({ id: "q-2", title: "human", assignee: { type: "human", id: "mika", label: "Mika", handoffState: "working" } }),
      quest({ id: "q-3", title: "self", assignee: { type: "self", id: "me", label: "Me", handoffState: "none" } }),
    ],
    selfUid: "hironao",
    now: NOW,
    today: TODAY,
  });
  const owner = (id: string): string => model.rows.find((row) => row.id === id)?.ownerActorId ?? "";
  assert.equal(owner("q-1"), "a-forge");
  assert.equal(owner("q-2"), "u-mika");
  assert.equal(owner("q-3"), "u-hironao", "a self-assigned Quest belongs to the signed-in profile");
  for (const id of ["q-1", "q-2", "q-3"]) {
    assert.ok(fixtureActors.has(owner(id)), `${owner(id)} resolves in the shared identity map`);
  }
});

/* ------------------------------------------------------------------ *
 * Network
 * ------------------------------------------------------------------ */

test("Network: every edge is backed by a domain field, and each kind is distinguished", () => {
  const model = normalizeNetworkModel({
    quests: [
      quest({ id: "q-parent", title: "parent" }),
      quest({
        id: "q-child", title: "child", parentQuestId: "q-parent", dependencyIds: ["q-parent"],
        externalLinks: [{
          service: "notion", externalId: "p1", type: "task", sourceType: "provider", url: "",
          projectId: "", organizationId: "", workspaceId: "", taskId: "", entryStartAt: "", entryStopAt: "",
          durationMinutes: 0, direction: "import", syncedAt: "", remoteUpdatedAt: "", localUpdatedAt: "",
          remoteEtag: "", syncStatus: "unverified",
        }],
      }),
    ],
    actors: fixtureActors,
    connections: [{ id: "notion", name: "Notion", status: "reconnect_required", questIds: ["q-child"] }],
    selfUid: "hironao",
  });
  const kinds = new Set(model.edges.map((edge) => edge.kind));
  assert.ok(kinds.has("dependency"));
  assert.ok(kinds.has("contains"));
  assert.ok(kinds.has("assignment"));
  assert.ok(kinds.has("sync"));
  for (const edge of model.edges) {
    assert.ok(edge.reason.length > 8, `edge ${edge.kind} explains itself in words`);
    assert.ok(model.nodes.has(edge.fromId) && model.nodes.has(edge.toId), "an edge never points at a missing node");
  }
});

test("Network: containment never blocks, an unmet dependency always does", () => {
  const model = normalizeNetworkModel({
    quests: [
      quest({ id: "q-parent", title: "parent" }),
      quest({ id: "q-child", title: "child", parentQuestId: "q-parent", dependencyIds: ["q-parent"] }),
    ],
    actors: fixtureActors,
    connections: [],
    selfUid: "hironao",
  });
  const contains = model.edges.find((edge) => edge.kind === "contains");
  const dependency = model.edges.find((edge) => edge.kind === "dependency");
  assert.equal(contains?.blocking, false);
  assert.equal(dependency?.blocking, true);
});

test("Network: a blocked chain names its root cause and everything waiting behind it", () => {
  const model = normalizeNetworkModel({
    quests: [
      quest({
        id: "q-root", title: "root",
        assignee: { type: "agent", id: "a-forge", label: "F", handoffState: "blocked" },
        handoff: { note: "", blockedReason: "スコープ不足", artifactUrl: "", startedAt: "", reviewRequestedAt: "", reviewedAt: "", reviewedBy: "" },
      }),
      quest({ id: "q-mid", title: "mid", dependencyIds: ["q-root"] }),
      quest({ id: "q-leaf", title: "leaf", dependencyIds: ["q-mid"] }),
    ],
    actors: fixtureActors,
    connections: [],
    selfUid: "hironao",
  });
  assert.equal(model.chains.length, 1, "only the root cause is a chain, not every blocked Quest");
  assert.equal(model.chains[0]?.rootId, "q-root");
  assert.equal(model.chains[0]?.reason, "スコープ不足", "the domain's own reason, not a generated one");
  assert.deepEqual([...(model.chains[0]?.waitingIds ?? [])].sort(), ["q-leaf", "q-mid"]);
});

test("Network: an actor with no Quests is not drawn", () => {
  const model = normalizeNetworkModel({
    quests: [quest({ id: "q-1", title: "one" })],
    actors: fixtureActors,
    connections: [{ id: "notion", name: "Notion", status: "connected", questIds: [] }],
    selfUid: "hironao",
  });
  const kinds = [...model.nodes.values()].map((node) => node.kind);
  assert.equal(kinds.filter((kind) => kind === "actor").length, 1, "only the one actor that holds something");
  assert.equal(kinds.filter((kind) => kind === "connection").length, 0, "an integration with no Quests is not a node");
});

test("Network: a 50-node neighbourhood uses a non-overlapping four-column world grid", () => {
  const downstream = Array.from({ length: 50 }, (_, index) => `q-${index + 1}`);
  const layout = layoutNetworkWorld(["up-1", "up-2"], "focus", downstream);
  const nodes = [...layout.nodes.values()];
  assert.equal(nodes.length, 53);
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    const left = nodes[leftIndex];
    assert.ok(left !== undefined);
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const right = nodes[rightIndex];
      assert.ok(right !== undefined);
      const overlaps = Math.abs(left.x - right.x) < (left.width + right.width) / 2
        && Math.abs(left.y - right.y) < (left.height + right.height) / 2;
      assert.equal(overlaps, false, `${left.id} and ${right.id} must not overlap`);
    }
  }
  assert.ok(layout.height > 620, "large neighbourhoods expand the world instead of squeezing the viewport");
});

test("Network: zoom preserves the world point under the cursor and fit stays readable", () => {
  const layout = layoutNetworkWorld([], "focus", Array.from({ length: 12 }, (_, index) => `q-${index}`));
  const camera = centreNetworkCamera(1000, 620, layout.focus, 1);
  const cursor = { x: 180, y: 220 };
  const before = { x: (cursor.x - camera.x) / camera.scale, y: (cursor.y - camera.y) / camera.scale };
  const zoomed = zoomNetworkCameraAt(camera, 1.35, cursor);
  const after = { x: (cursor.x - zoomed.x) / zoomed.scale, y: (cursor.y - zoomed.y) / zoomed.scale };
  assert.ok(Math.abs(before.x - after.x) < 0.0001);
  assert.ok(Math.abs(before.y - after.y) < 0.0001);
  const fitted = fitNetworkCamera(1000, 620, layout);
  assert.ok(fitted.scale <= 1 && fitted.scale >= 0.42);
});

/* ------------------------------------------------------------------ *
 * Party
 * ------------------------------------------------------------------ */

test("Party: workload counts are real Quests and no capacity ceiling is invented", () => {
  const model = normalizePartyModel({
    quests: [
      quest({ id: "q-1", title: "a", assignee: { type: "agent", id: "a-forge", label: "F", handoffState: "working" } }),
      quest({ id: "q-2", title: "b", assignee: { type: "agent", id: "a-forge", label: "F", handoffState: "review_required" } }),
      quest({ id: "q-3", title: "c", assignee: { type: "agent", id: "a-forge", label: "F", handoffState: "blocked" } }),
      quest({ id: "q-4", title: "d", assignee: { type: "human", id: "mika", label: "Mika", handoffState: "working" } }),
      quest({ id: "q-5", title: "closed", done: true, lifecycleState: "completed", assignee: { type: "agent", id: "a-forge", label: "F", handoffState: "accepted" } }),
    ],
    actors: fixtureActors,
    members: [{ uid: "mika", displayName: "Mika", handle: "mika", role: "member", joinedAt: "2026-06-14T10:30:00.000Z", level: 17 }],
    agents: [{ agentId: "a-forge", displayName: "Forge Runner", provider: "generic", role: "builder", status: "active", allowedScopes: ["quests:read"], reviewRequired: true, dryRunDefault: true }],
    selfUid: "hironao",
    partyName: "Relay Forge",
    now: NOW,
  });
  const forge = model.members.find((member) => member.actorId === "a-forge");
  assert.equal(forge?.workload.total, 3, "a completed Quest is not current workload");
  assert.equal(forge?.workload.working, 1);
  assert.equal(forge?.workload.review, 1);
  assert.equal(forge?.workload.blocked, 1);
  assert.equal(model.busiestTotal, 3, "the comparison scale is the busiest actor, not a fabricated limit");
  const keys = Object.keys(forge ?? {});
  assert.ok(!keys.includes("capacity"), "the ViewModel has no capacity field to render");
  assert.ok(!keys.includes("availability"));
});

test("Party: Humans lead the roster and Agent capability comes from the registry record", () => {
  const model = normalizePartyModel({
    quests: [],
    actors: fixtureActors,
    members: [{ uid: "hironao", displayName: "Hironao", handle: "hironao", role: "owner", joinedAt: "2026-05-02T08:00:00.000Z", level: 24 }],
    agents: [{
      agentId: "a-warden", displayName: "Warden", provider: "generic", role: "Contract checker",
      status: "active", allowedScopes: ["quests:read", "handoff:write"], reviewRequired: true, dryRunDefault: false,
      defaultHandoffState: "review_required",
    }],
    selfUid: "hironao",
    partyName: "Relay Forge",
    now: NOW,
  });
  assert.equal(model.members[0]?.kind, "human");
  const warden = model.members.find((member) => member.actorId === "a-warden");
  assert.equal(warden?.reviewRequired, true);
  const labels = (warden?.capabilities ?? []).map((capability) => capability.label);
  assert.deepEqual(labels, ["Provider", "Role", "権限スコープ", "既定の受け渡し", "既定 dry-run"]);
  const scopes = warden?.capabilities.find((capability) => capability.label === "権限スコープ");
  assert.equal(scopes?.value, "quests:read, handoff:write", "the registry's scopes verbatim");
});

test("Party: an agent with no granted scopes says so instead of showing nothing", () => {
  const model = normalizePartyModel({
    quests: [],
    actors: fixtureActors,
    members: [],
    agents: [{ agentId: "a-scribe", displayName: "Scribe", allowedScopes: [] }],
    selfUid: "hironao",
    partyName: "",
    now: NOW,
  });
  const scopes = model.members[0]?.capabilities.find((capability) => capability.label === "権限スコープ");
  assert.equal(scopes?.value, "付与なし");
});

/* ------------------------------------------------------------------ *
 * Battle — against the real battle engine
 * ------------------------------------------------------------------ */

test("Battle: the model reads the session the domain produced, including blocked commands", () => {
  const port = new FixtureBattlePort(fixtureBattleState([]));
  const model = normalizeBattleModel({ session: port.session() });
  assert.ok(model.bossMaxHp > 0);
  assert.ok(model.turn > 0);
  assert.equal(model.commands.length, 5);
  for (const command of model.commands) {
    if (!command.enabled) assert.ok(command.blockedReason.length > 0, `${command.id} says why it cannot run`);
  }
  const tooExpensive = model.commands.find((command) => command.mpCost > model.mp);
  assert.ok(tooExpensive !== undefined && !tooExpensive.enabled, "a command that costs more MP than is held is not offered");
});

test("Battle: log entries stored as inline HTML by the root UI render as plain text", () => {
  const session = new FixtureBattlePort(fixtureBattleState([])).session();
  const battle = session.battle as unknown as { log: unknown[] };
  battle.log = [{ text: "<strong>一回クエスト</strong> MP +34 / Focus +2", kind: "info", at: "2026-09-23T00:00:00.000Z" }];
  const model = normalizeBattleModel({ session });
  assert.equal(model.timeline[0]?.text, "一回クエスト MP +34 / Focus +2");
});

test("Battle: a dry run computes the outcome and writes nothing", async () => {
  const port = new FixtureBattlePort(fixtureBattleState([]));
  const before = normalizeBattleModel({ session: port.session() });
  const preview = await port.runCommand({ command: "attack", expectedTurn: before.turn, commandId: "preview", dryRun: true });
  assert.equal(preview.ok, true);
  assert.equal(preview.dryRun, true);
  assert.ok(preview.before !== null && preview.after !== null);
  const after = normalizeBattleModel({ session: port.session() });
  assert.equal(after.turn, before.turn, "the turn did not advance");
  assert.equal(after.bossHp, before.bossHp, "no damage was applied");
});

test("Battle: executing applies exactly what the preview showed", async () => {
  const port = new FixtureBattlePort(fixtureBattleState([]));
  const start = normalizeBattleModel({ session: port.session() });
  const preview = await port.runCommand({ command: "attack", expectedTurn: start.turn, commandId: "preview", dryRun: true });
  const applied = await port.runCommand({ command: "attack", expectedTurn: start.turn, commandId: "run-1", dryRun: false });
  assert.equal(applied.ok, true);
  assert.equal(applied.after?.bossHp, preview.after?.bossHp, "the executed result matches the previewed one");
  const after = normalizeBattleModel({ session: applied.session });
  assert.equal(after.turn, start.turn + 1);
  assert.ok(after.bossHp < start.bossHp);
});

test("Battle: a stale expectedTurn is refused by the domain and nothing is applied", async () => {
  const port = new FixtureBattlePort(fixtureBattleState([]), { failure: "stale" });
  const before = normalizeBattleModel({ session: port.session() });
  const outcome = await port.runCommand({ command: "attack", expectedTurn: before.turn, commandId: "run-1", dryRun: false });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, "battle_turn_stale");
  const after = normalizeBattleModel({ session: port.session() });
  assert.equal(after.turn, before.turn);
  assert.equal(after.bossHp, before.bossHp);
});

test("Battle: a missing scope is refused before the domain is reached", async () => {
  const port = new FixtureBattlePort(fixtureBattleState([]), { failure: "permission" });
  const outcome = await port.runCommand({ command: "attack", expectedTurn: 1, commandId: "run-1", dryRun: false });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, "insufficient_scope");
  assert.doesNotMatch(outcome.message, /https?:\/\//);
  assert.doesNotMatch(outcome.message, /Bearer|token/i);
});

test("Battle: execution and decision events stay separate channels", () => {
  const port = new FixtureBattlePort(fixtureBattleState([]));
  const model = normalizeBattleModel({
    session: port.session(),
    decisions: [{ channel: "decision", text: "attack を実行しました", tone: "info", at: "2026-08-26T11:19:00.000Z" }],
  });
  const channels = new Set(model.timeline.map((event) => event.channel));
  assert.ok(channels.has("execution"));
  assert.ok(channels.has("decision"));
  assert.equal(model.timeline.filter((event) => event.channel === "decision").length, 1);
  // Newest first, so the most recent event leads on both compositions.
  for (let index = 1; index < model.timeline.length; index += 1) {
    assert.ok(
      (model.timeline[index - 1]?.at ?? "") >= (model.timeline[index]?.at ?? ""),
      "the timeline is ordered newest first",
    );
  }
});

/* ------------------------------------------------------------------ *
 * Connections
 * ------------------------------------------------------------------ */

test("Connections: the required-scope table matches api/integration-adapters.json", () => {
  const contract = JSON.parse(readFileSync(new URL("../api/integration-adapters.json", import.meta.url), "utf8")) as {
    adapters: Array<{ id: string; minimumScopes?: string[] }>;
  };
  for (const adapter of contract.adapters) {
    const expected = adapter.minimumScopes ?? [];
    const actual = REQUIRED_SCOPES[adapter.id];
    assert.ok(actual !== undefined, `${adapter.id} has a scope entry in the screen table`);
    assert.deepEqual(
      [...actual],
      expected,
      `${adapter.id} scopes stay identical to the contract; update the table when the contract changes`,
    );
  }
});

test("Connections: health is derived from the fields the gateway actually returns", () => {
  const base = { auth: "oauth2", capabilities: ["import"], configurationStatus: "ready" };
  const model = normalizeConnectionsModel({
    integrations: [
      { id: "google-tasks", name: "Google Tasks", ...base, status: "connected", account: { status: "connected", providerAccountName: "a", lastSyncedAt: "2026-08-26T11:05:00.000Z", lastError: "" } },
      { id: "google-calendar", name: "Google Calendar", ...base, status: "connected", account: { status: "connected", providerAccountName: "a", lastSyncedAt: "", lastError: "3件が変換対象外でした" } },
      { id: "notion", name: "Notion", ...base, status: "reconnect_required", account: { status: "reconnect_required", providerAccountName: "w", lastSyncedAt: "", lastError: "失効しました" } },
      { id: "toggl-track", name: "Toggl Track", ...base, status: "not_connected", account: null },
      { id: "toggl-focus", name: "Toggl Focus", ...base, status: "not_connected", configurationStatus: "admin_setup_required", account: null },
    ],
    requiredScopes: REQUIRED_SCOPES,
    questLinks: [],
    agents: [],
  });
  const health = (id: string): string => model.connections.find((entry) => entry.id === id)?.health ?? "";
  assert.equal(health("google-tasks"), "connected");
  assert.equal(health("google-calendar"), "degraded", "a live connection with a failure is degraded, not healthy");
  assert.equal(health("notion"), "expired");
  assert.equal(health("toggl-track"), "not_connected");
  assert.equal(health("toggl-focus"), "permission_required");
  assert.equal(model.connections[0]?.health, "expired", "what needs attention sorts first");
});

test("Connections: affected Quests come from externalLinks, and only live connections can sync", () => {
  const model = normalizeConnectionsModel({
    integrations: [
      { id: "notion", name: "Notion", auth: "oauth2", capabilities: [], configurationStatus: "ready", status: "reconnect_required", account: { status: "reconnect_required", providerAccountName: "w", lastSyncedAt: "", lastError: "失効" } },
      { id: "google-tasks", name: "Google Tasks", auth: "oauth2", capabilities: [], configurationStatus: "ready", status: "connected", account: { status: "connected", providerAccountName: "a", lastSyncedAt: "2026-08-26T11:05:00.000Z", lastError: "" } },
    ],
    requiredScopes: REQUIRED_SCOPES,
    questLinks: [
      { id: "q-176", title: "OAuth", services: ["notion"] },
      { id: "q-174", title: "Tree", services: ["google-tasks"] },
    ],
    agents: [],
  });
  const notion = model.connections.find((entry) => entry.id === "notion");
  const tasks = model.connections.find((entry) => entry.id === "google-tasks");
  assert.deepEqual(notion?.affectedQuests.map((quest) => quest.ref), ["QF-176"]);
  assert.equal(notion?.canSync, false, "an expired connection cannot be synced");
  assert.equal(notion?.canReconnect, true);
  assert.equal(tasks?.canSync, true);
  assert.equal(tasks?.canReconnect, false, "a live connection is not offered a reconnect");
});

test("Connections: the ViewModel cannot carry a credential", () => {
  const model = normalizeConnectionsModel({
    integrations: [{
      id: "notion", name: "Notion", auth: "oauth2", capabilities: [], configurationStatus: "ready",
      status: "connected",
      account: { status: "connected", providerAccountName: "Guilduo Workspace", lastSyncedAt: "", lastError: "" },
    }],
    requiredScopes: REQUIRED_SCOPES,
    questLinks: [],
    agents: [],
  });
  const serialized = JSON.stringify(model.connections);
  for (const forbidden of ["accessToken", "refreshToken", "tokenExpiresAt", "client_secret", "Bearer"]) {
    assert.ok(!serialized.includes(forbidden), `${forbidden} is not part of the Connections ViewModel`);
  }
  assert.equal(model.grantedScopesUnavailable, true, "the missing granted-scope data is declared, not faked");
});

test("Connections: a sync reports exactly what its preview promised", async () => {
  const port = new FixtureConnectionsPort();
  const preview = await port.previewSync("google-tasks");
  assert.equal(preview.ok, true);
  assert.ok(preview.preview !== undefined);
  const run = await port.runSync("google-tasks");
  assert.equal(run.ok, true);
  assert.ok(
    run.message.includes(String(preview.preview?.imported)) && run.message.includes(String(preview.preview?.updated)),
    "the execution message carries the previewed counts, not a second calculation",
  );
});

test("Connections: permission, offline and conflict all refuse every action", async () => {
  for (const mode of ["permission", "network", "conflict"] as const) {
    const port = new FixtureConnectionsPort(mode);
    for (const action of [
      () => port.previewSync("notion"),
      () => port.runSync("notion"),
      () => port.reconnect("notion"),
      () => port.disconnect("notion"),
    ]) {
      const result = await action();
      assert.equal(result.ok, false, `${mode} refuses the action`);
      assert.ok(result.message.length > 0);
      assert.doesNotMatch(result.message, /https?:\/\//);
    }
  }
});

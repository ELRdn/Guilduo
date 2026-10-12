const test = require("node:test");
const assert = require("node:assert/strict");
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createQuest } from "../server/questforge-domain.ts";
import { writeState } from "../worker/src/appwrite-store.ts";
import type { QuestForgeState } from "../types/questforge.ts";
import { asQuestForgeState, json, required, type TestContext } from "./test-helpers.ts";
import type { WorkerEnv } from "../worker/src/worker-types.ts";

type RequestRecord = {
  url: string;
  method: string;
  body: string;
  headers: Record<string, string>;
};

const env: WorkerEnv = {
  APPWRITE_ENDPOINT: "https://api.example/v1",
  APPWRITE_PROJECT_ID: "project",
  APPWRITE_DATABASE_ID: "guilduo",
  APPWRITE_STATE_TABLE_ID: "user_states",
  APPWRITE_API_KEY: "test-api-key",
  DEV_BEARER_TOKEN: "state-test-token",
  DEV_USER_ID: "owner-1",
  ALLOWED_ORIGINS: "http://localhost:5173",
};

function initialState(): QuestForgeState {
  const now = "2026-08-31T00:00:00.000Z";
  const state = asQuestForgeState({
    schemaVersion: 7,
    createdAt: now,
    updatedAt: now,
    sortMode: "created",
    taskFilter: "all",
    theme: "soft",
    preferences: { soundEnabled: true, motionEnabled: true },
    lastProcessedDate: "",
    lastRolloverSummary: { date: "", rolledOver: [], archived: [], cleared: [] },
    tasks: [],
    taskEvents: [],
    syncEvents: [],
    rewardClaims: {},
    character: { level: 1, hp: 50, maxHp: 50, xp: 0, nextXp: 100, gems: 0, ownedItems: [], equippedItems: [] },
    battle: { mp: 0, maxMp: 80 },
    boss: { hp: 100, maxHp: 100 },
  });
  createQuest(state, { kind: "todo", title: "Start me" });
  return state;
}

function response(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function largeState(): QuestForgeState {
  const state = initialState();
  state.tasks[0].lastCompletedDate = "";
  state.tasks[0].lastRolledOverDate = "";
  // Synthetic migration history must survive as Quest data grows beyond 60,000 encoded characters.
  const history = Array.from({ length: 2400 }, (_, index) => createHash("sha256").update(`state-history-${index}`).digest("hex")).join("");
  state.migrationSnapshots = { schema6To7: { schemaVersion: 6, tasks: [], history } };
  state.taskEvents.push({ id: "retained-event", type: "test-history", text: "Keep this event" });
  state.rewardClaims = { "retained-claim": "2026-08-30" };
  return state;
}

function compressedState(state: QuestForgeState): string {
  return `gzip:${gzipSync(JSON.stringify(state)).toString("base64")}`;
}

class FakeAppwriteStateApi {
  readonly requests: RequestRecord[] = [];
  readonly row: Record<string, unknown>;
  private readonly transactions = new Map<string, { staged?: Record<string, unknown> }>();
  failStage = false;

  constructor(state: QuestForgeState) {
    this.row = {
      $id: "owner-1",
      ownerId: "owner-1",
      schemaVersion: 7,
      revision: 4,
      clientUpdatedAt: "2026-08-31T00:00:00.000Z",
      deviceId: "test-device",
      stateJson: JSON.stringify(state),
    };
  }

  async fetch(urlInput: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = new URL(String(urlInput));
    const method = init?.method || "GET";
    const body = String(init?.body || "");
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    this.requests.push({ url: url.toString(), method, body, headers });
    const parsedBody = body ? JSON.parse(body) as Record<string, unknown> : {};
    const rowPath = "/v1/tablesdb/guilduo/tables/user_states/rows/owner-1";

    if (url.pathname === "/v1/tablesdb/transactions" && method === "POST") {
      if (Number(parsedBody.ttl) < 60) {
        return response({ message: "Invalid `ttl` param: Value must be a valid range between 60 and 3,600", code: 400, type: "general_argument_invalid", version: "1.9.6" }, 400);
      }
      this.transactions.set("tx-1", {});
      return response({ $id: "tx-1" }, 201);
    }

    if (url.pathname === rowPath && method === "GET") return response(this.row, 200);

    if (url.pathname === rowPath && method === "PATCH") {
      if (this.failStage) {
        return response({ code: 401, type: "general_unauthorized_scope", message: "Missing rows.write scope" }, 401);
      }
      const transactionId = String(parsedBody.transactionId || "");
      const transaction = this.transactions.get(transactionId);
      if (!transaction) return response({ code: 400, type: "transaction_not_found", message: "Transaction not found" }, 400);
      transaction.staged = parsedBody.data as Record<string, unknown>;
      return response({ ...this.row, ...transaction.staged }, 200);
    }

    if (url.pathname === "/v1/tablesdb/transactions/tx-1" && method === "PATCH") {
      const transaction = this.transactions.get("tx-1");
      if (parsedBody.commit === true && transaction?.staged) Object.assign(this.row, transaction.staged);
      return response({ $id: "tx-1", status: parsedBody.commit === true ? "committed" : "pending" }, 200);
    }

    if (url.pathname === "/v1/tablesdb/transactions/tx-1" && method === "DELETE") {
      this.transactions.delete("tx-1");
      return new Response(null, { status: 204 });
    }

    return response({ code: 500, type: "unexpected_test_request", message: `Unexpected Appwrite request: ${method} ${url.pathname}` }, 500);
  }

  async persistedState(): Promise<QuestForgeState> {
    const encoded = String(this.row.stateJson);
    if (!encoded.startsWith("gzip:")) return JSON.parse(encoded) as QuestForgeState;
    const binary = atob(encoded.slice(5));
    const compressed = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const compressedBuffer = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength) as ArrayBuffer;
    const decompressed = await new Response(new Blob([compressedBuffer]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    return JSON.parse(new TextDecoder().decode(decompressed)) as QuestForgeState;
  }
}

function context(pending: Promise<unknown>[]): TestContext {
  return { waitUntil(promise: Promise<unknown>): void { pending.push(promise); } };
}

async function withFakeAppwrite<T>(api: FakeAppwriteStateApi, run: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = api.fetch.bind(api) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function patchQuest(api: FakeAppwriteStateApi, patch: Record<string, unknown>, questId?: string): Promise<Response> {
  const targetQuestId = questId || (await api.persistedState()).tasks[0].id;
  return withFakeAppwrite(api, async () => {
    const worker = (await import("../worker/src/index.ts")).default;
    const pending: Promise<unknown>[] = [];
    const result = await worker.fetch(new Request(`http://worker.test/v1/quests/${encodeURIComponent(targetQuestId)}`, {
      method: "PATCH",
      headers: { authorization: "Bearer state-test-token", origin: "http://localhost:5173", "content-type": "application/json" },
      body: JSON.stringify(patch),
    }), env, context(pending));
    await Promise.allSettled(pending);
    return result;
  });
}

test("existing state read and Start Quest PATCH persist through Appwrite transaction", async () => {
  const api = new FakeAppwriteStateApi(initialState());
  const quest = (await api.persistedState()).tasks[0];
  const result = await patchQuest(api, {
    assignee: { type: "self", id: "self", label: "自分", handoffState: "working" },
    handoff: { startedAt: "2026-08-31T00:01:00.000Z" },
  });

  assert.equal(result.status, 200);
  const body = await json<{ quest: { id: string; assignee: { handoffState: string }; handoff: { startedAt: string } } }>(result);
  assert.equal(body.quest.id, quest.id);
  assert.equal(body.quest.assignee.handoffState, "working");
  assert.equal(body.quest.handoff.startedAt, "2026-08-31T00:01:00.000Z");

  const persisted = (await api.persistedState()).tasks.find((item) => item.id === quest.id);
  assert.equal(persisted?.assignee.handoffState, "working");
  assert.equal(persisted?.handoff.startedAt, "2026-08-31T00:01:00.000Z");
  assert.equal(api.row.revision, 5);

  const transactionCreate = api.requests.find((request) => request.method === "POST" && request.url.endsWith("/tablesdb/transactions"));
  const transactionRequest = required(transactionCreate);
  assert.equal(JSON.parse(transactionRequest.body).ttl, 60);
  assert.equal(transactionRequest.headers["x-appwrite-project"], "project");
  assert.equal(transactionRequest.headers["x-appwrite-key"], "test-api-key");
  assert.ok(api.requests.some((request) => request.method === "GET" && request.url.includes("transactionId=tx-1")));
  const stage = api.requests.find((request) => request.method === "PATCH" && request.url.endsWith("/rows/owner-1"));
  const stageRequest = required(stage);
  assert.equal(JSON.parse(stageRequest.body).transactionId, "tx-1");
  assert.equal(JSON.parse(stageRequest.body).data.revision, 5);
  assert.ok(api.requests.some((request) => request.method === "PATCH" && request.url.endsWith("/transactions/tx-1")));
});

test("Appwrite state write failure maps to generic 500 and logs only sanitized downstream metadata", async () => {
  const state = largeState();
  const api = new FakeAppwriteStateApi(state);
  api.failStage = true;
  const logs: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]): void => { logs.push(args); };
  let result: Response;
  try {
    result = await patchQuest(api, {
      assignee: { type: "self", id: "self", label: "自分", handoffState: "working" },
      handoff: { startedAt: "2026-08-31T00:01:00.000Z" },
    });
  } finally {
    console.error = originalError;
  }

  assert.equal(result!.status, 500);
  const error = await json<{ error: { code: string; message: string } }>(result!);
  assert.equal(error.error.code, "state_persistence_failed");
  assert.equal(error.error.message, "Guilduo server error.");

  const entry = logs.find((args) => args[0] === "appwrite_state_persistence_failed");
  assert.ok(entry);
  assert.deepEqual(entry?.[1], {
    operation: "stage_state_update",
    downstreamStatus: 401,
    appwriteCode: "401",
    appwriteType: "general_unauthorized_scope",
    message: "Missing rows.write scope",
  });
  assert.equal(JSON.stringify(logs).includes("test-api-key"), false);
  assert.equal(JSON.stringify(logs).includes("stateJson"), false);

  const persisted = (await api.persistedState()).tasks[0];
  assert.equal(persisted.assignee.handoffState, "none");
  assert.equal(api.row.revision, 4);
  assert.deepEqual(await api.persistedState(), state);
});

for (const encoding of ["json", "gzip"] as const) {
  test(`large ${encoding} state accepts a new Quest and subsequent edit without discarding retained data`, async () => {
    const state = largeState();
    const encoded = compressedState(state);
    assert.ok(encoded.length > 60_000, "fixture must exceed the obsolete string-column limit");
    const api = new FakeAppwriteStateApi(state);
    if (encoding === "gzip") api.row.stateJson = encoded;

    const result = await withFakeAppwrite(api, async () => {
      const worker = (await import("../worker/src/index.ts")).default;
      const pending: Promise<unknown>[] = [];
      const created = await worker.fetch(new Request("http://worker.test/v1/quests", {
        method: "POST",
        headers: { authorization: "Bearer state-test-token", "content-type": "application/json" },
        body: JSON.stringify({ kind: "todo", title: "Capacity regression child", parentQuestId: state.tasks[0].id, planningState: "backlog" }),
      }), env, context(pending));
      await Promise.allSettled(pending);
      return created;
    });
    assert.equal(result.status, 201);
    const { quest } = await json<{ quest: { id: string } }>(result);
    const updated = await patchQuest(api, { notes: "Saved after creating the child" }, quest.id);
    assert.equal(updated.status, 200);

    const persisted = await api.persistedState();
    assert.equal(persisted.tasks.length, state.tasks.length + 1);
    assert.deepEqual(persisted.tasks.filter((item) => item.id !== quest.id), state.tasks);
    const child = required(persisted.tasks.find((item) => item.id === quest.id));
    assert.equal(child.parentQuestId, state.tasks[0].id);
    assert.equal(child.notes, "Saved after creating the child");
    for (const key of ["migrationSnapshots", "rewardClaims", "character", "battle", "boss"] as const) {
      assert.deepEqual(persisted[key], state[key], `${key} must survive both saves`);
    }
    for (const event of state.taskEvents) assert.ok(persisted.taskEvents.some((item) => JSON.stringify(item) === JSON.stringify(event)));
    assert.ok(String(api.row.stateJson).startsWith("gzip:"));
    assert.ok(String(api.row.stateJson).length > 60_000);
    assert.equal(api.row.revision, 6);
  });
}

test("large state still rejects a stale revision without overwriting the stored row", async () => {
  const state = largeState();
  const api = new FakeAppwriteStateApi(state);
  api.row.stateJson = compressedState(state);
  const before = structuredClone(api.row);
  const saved = await withFakeAppwrite(api, () => writeState(env, "owner-1", { state }, "3"));
  assert.equal(saved, false);
  assert.deepEqual(api.row, before);
  assert.ok(api.requests.some((request) => request.method === "DELETE" && request.url.endsWith("/transactions/tx-1")));
  assert.equal(api.requests.some((request) => request.method === "PATCH"), false);
});

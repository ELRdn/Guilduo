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

async function patchQuest(api: FakeAppwriteStateApi, patch: Record<string, unknown>, questId?: string, workerEnv: WorkerEnv = env): Promise<Response> {
  const targetQuestId = questId || (await api.persistedState()).tasks[0].id;
  return withFakeAppwrite(api, async () => {
    const worker = (await import("../worker/src/index.ts")).default;
    const pending: Promise<unknown>[] = [];
    const result = await worker.fetch(new Request(`http://worker.test/v1/quests/${encodeURIComponent(targetQuestId)}`, {
      method: "PATCH",
      headers: { authorization: "Bearer state-test-token", origin: "http://localhost:5173", "content-type": "application/json" },
      body: JSON.stringify(patch),
    }), workerEnv, context(pending));
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
  assert.equal(api.requests.filter((request) => request.method === "DELETE" && request.url.endsWith("/transactions/tx-1")).length, 1);

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

test("mutation starts transaction while the independent state read is still pending", async () => {
  const api = new FakeAppwriteStateApi(initialState());
  const fetch = api.fetch.bind(api);
  let releaseRead!: () => void;
  const readGate = new Promise<void>(resolve => { releaseRead = resolve; });
  let transactionStarted = false;
  api.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/transactions") && init?.method === "POST") transactionStarted = true;
    if (url.pathname.endsWith("/rows/owner-1") && (!init?.method || init.method === "GET") && !url.searchParams.has("transactionId")) await readGate;
    return fetch(input, init);
  };
  const pending = patchQuest(api, { nextAction: "parallel save" });
  try {
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(transactionStarted, true, "transaction creation must not wait for the first state read");
  } finally { releaseRead(); }
  assert.equal((await pending).status, 200);
});

test("concurrent state change is retried without losing the other writer's data", async () => {
  const api = new FakeAppwriteStateApi(initialState());
  const fetch = api.fetch.bind(api);
  let changed = false;
  api.fetch = async (input, init) => {
    if (String(input).includes("transactionId=") && !changed) {
      changed = true;
      const concurrent = await api.persistedState();
      concurrent.tasks[0].notes = "Another writer's data";
      api.row.stateJson = JSON.stringify(concurrent);
      api.row.revision = 5;
    }
    return fetch(input, init);
  };
  assert.equal((await patchQuest(api, { nextAction: "Our update" })).status, 200);
  const saved = (await api.persistedState()).tasks[0];
  assert.equal(saved.notes, "Another writer's data");
  assert.equal(saved.nextAction, "Our update");
  assert.equal(api.row.revision, 6);
  assert.equal(api.requests.filter((request) => request.method === "DELETE" && request.url.endsWith("/transactions/tx-1")).length, 1);
});

// Models Appwrite's transaction replay + bounded numeric updates, not a live
// provider acceptance test. Production opt-in requires the separate probe.
type StagedOperation = { action: string; rowId: string; data: Record<string, unknown> };
class AtomicRevisionApi extends FakeAppwriteStateApi {
  private sequence = 0;
  private batches = new Map<string, StagedOperation[]>();
  beforeStage?: () => Promise<void>;
  failCommit = false;
  async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = new URL(String(input));
    const method = init?.method || "GET";
    if (!url.pathname.includes("/transactions")) return super.fetch(input, init);
    this.requests.push({ url: String(url), method, body: String(init?.body || ""), headers: {} });
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    if (url.pathname.endsWith("/transactions") && method === "POST") {
      const id = `batch-${++this.sequence}`;
      this.batches.set(id, []);
      return response({ $id: id }, 201);
    }
    const id = url.pathname.split("/")[4];
    assert.ok(this.batches.has(id), "operation must address its own live transaction");
    if (method === "DELETE") { this.batches.delete(id); return new Response(null, { status: 204 }); }
    if (url.pathname.endsWith("/operations") && method === "POST") {
      await this.beforeStage?.();
      if (this.failStage) return response({ type: "general_unauthorized_scope" }, 401);
      this.batches.set(id, body.operations as StagedOperation[]);
      return response({ $id: id }, 201);
    }
    if (method === "PATCH" && body.commit === true) {
      if (this.failCommit) return response({ type: "general_server_error" }, 500);
      // Apply to a private copy, publishing only after every operation succeeds.
      const next = structuredClone(this.row);
      for (const operation of this.batches.get(id) || []) {
        assert.equal(operation.rowId, "owner-1");
        const data = operation.data;
        if (operation.action === "increment" || operation.action === "decrement") {
          assert.equal(data.column, "revision");
          const value = Number(next.revision) + (operation.action === "increment" ? 1 : -1) * Number(data.value);
          if (data.max !== undefined && value > Number(data.max) || data.min !== undefined && value < Number(data.min)) {
            return response({ type: "attribute_limit_exceeded" }, 400);
          }
          next.revision = value;
        } else {
          assert.equal(operation.action, "update");
          Object.assign(next, data);
        }
      }
      Object.assign(this.row, next);
      return response({ $id: id, status: "committed" }, 200);
    }
    return response({ type: "unexpected_test_request" }, 500);
  }
}
const batchEnv: WorkerEnv = { ...env, APPWRITE_REVISION_BATCH: "true" };

test("opt-in batch commits full state with no transactional snapshot re-download", async () => {
  const state = largeState();
  const api = new AtomicRevisionApi(state);
  assert.equal((await patchQuest(api, { nextAction: "batched" }, undefined, batchEnv)).status, 200);
  const saved = await api.persistedState();
  assert.equal(saved.tasks[0].nextAction, "batched");
  assert.deepEqual(saved.migrationSnapshots, state.migrationSnapshots);
  assert.equal(api.row.revision, 5);
  assert.equal(api.requests.filter(r => r.method === "GET" && r.url.includes("/rows/")).length, 1);
  assert.equal(api.requests.filter(r => r.method === "POST" && r.url.endsWith("/operations")).length, 1);
});

test("batch rejects both stale and future revisions and rolls back a passed first bound", async () => {
  for (const revision of ["3", "5"]) {
    const state = initialState(), api = new AtomicRevisionApi(state);
    const before = structuredClone(api.row);
    assert.equal(await withFakeAppwrite(api, () => writeState(batchEnv, "owner-1", { state }, revision)), false);
    assert.deepEqual(api.row, before);
    assert.ok(api.requests.some(r => r.method === "DELETE"));
  }
});

test("batch retries a concurrent change between read and stage without losing that writer's fields", async () => {
  const api = new AtomicRevisionApi(initialState());
  api.beforeStage = async () => {
    api.beforeStage = undefined;
    const concurrent = await api.persistedState();
    concurrent.tasks[0].notes = "keep concurrent edit";
    api.row.stateJson = JSON.stringify(concurrent);
    api.row.revision = 5;
  };
  assert.equal((await patchQuest(api, { nextAction: "our edit" }, undefined, batchEnv)).status, 200);
  const saved = await api.persistedState();
  assert.equal(saved.tasks[0].notes, "keep concurrent edit");
  assert.equal(saved.tasks[0].nextAction, "our edit");
  assert.equal(api.row.revision, 6);
  assert.equal(api.requests.filter(r => r.method === "DELETE").length, 1);
});

test("only one of two writes based on the same revision can commit", async () => {
  const state = initialState(), api = new AtomicRevisionApi(state);
  const left = structuredClone(state), right = structuredClone(state);
  left.tasks[0].notes = "left"; right.tasks[0].notes = "right";
  const outcomes = await withFakeAppwrite(api, () => Promise.all([
    writeState(batchEnv, "owner-1", { state: left }, "4"),
    writeState(batchEnv, "owner-1", { state: right }, "4"),
  ]));
  assert.deepEqual([...outcomes].sort(), [false, true]);
  assert.equal((await api.persistedState()).tasks[0].notes, outcomes[0] ? "left" : "right");
  assert.equal(api.row.revision, 5);
});

test("revision zero is guarded exactly and malformed revisions never reach Appwrite", async () => {
  const state = initialState(), api = new AtomicRevisionApi(state); api.row.revision = 0;
  assert.equal(await withFakeAppwrite(api, () => writeState(batchEnv, "owner-1", { state }, "1")), false);
  assert.equal(api.row.revision, 0);
  assert.equal(await withFakeAppwrite(api, () => writeState(batchEnv, "owner-1", { state }, "0")), true);
  assert.equal(api.row.revision, 1);
  for (const invalid of ["04", "-1", "4.5", "NaN", String(Number.MAX_SAFE_INTEGER)]) {
    const count = api.requests.length;
    await assert.rejects(withFakeAppwrite(api, () => writeState(batchEnv, "owner-1", { state }, invalid)), /Invalid state revision/);
    assert.equal(api.requests.length, count);
  }
});

test("unknown commit errors do not become automatic retries", async () => {
  for (const status of [400, 401, 503]) {
    const api = new AtomicRevisionApi(initialState());
    const fetch = api.fetch.bind(api);
    api.fetch = async (input, init) => {
      if (new URL(String(input)).pathname.includes("/transactions/") && init?.method === "PATCH") {
        return response({ type: "general_unknown_error" }, status);
      }
      return fetch(input, init);
    };
    const before = structuredClone(api.row);
    assert.equal((await patchQuest(api, { nextAction: "must not replay" }, undefined, batchEnv)).status, 500);
    assert.deepEqual(api.row, before);
    assert.equal(api.requests.filter(r => r.method === "POST" && r.url.endsWith("/transactions")).length, 1);
    assert.equal(api.requests.filter(r => r.method === "DELETE").length, 1);
  }
});

test("batch never retries uncertain stage or commit errors as a known revision conflict", async () => {
  for (const mode of ["failStage", "failCommit"] as const) {
    const api = new AtomicRevisionApi(initialState()); api[mode] = true;
    const before = structuredClone(api.row);
    assert.equal((await patchQuest(api, { nextAction: "must fail" }, undefined, batchEnv)).status, 500);
    assert.deepEqual(api.row, before);
    assert.equal(api.requests.filter(r => r.method === "POST" && r.url.endsWith("/transactions")).length, 1);
    assert.equal(api.requests.filter(r => r.method === "DELETE").length, 1);
  }
});

const test = require("node:test");
const assert = require("node:assert/strict");
import { createQuest } from "../server/questforge-domain.ts";
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
  const api = new FakeAppwriteStateApi(initialState());
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
});

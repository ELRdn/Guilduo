const test = require("node:test");
const assert = require("node:assert/strict");
import { authenticateRequest } from "../worker/src/security.ts";
import { QuestForgeRepository } from "../interaction-lab/repository.ts";
import { createGuilduoAuth } from "../appwrite-auth.ts";
import type { WorkerEnv } from "../worker/src/worker-types.ts";

test("JWT requests verify with Appwrite without looking up opaque OAuth records", async () => {
  const original = globalThis.fetch;
  let verified = 0;
  globalThis.fetch = async () => { verified++; return Response.json({ $id: "owner" }); };
  const env = { APPWRITE_ENDPOINT: "https://fake.invalid", APPWRITE_PROJECT_ID: "p", QUESTFORGE_KV: { get: async () => { throw new Error("Unexpected OAuth lookup"); } } } as unknown as WorkerEnv;
  try {
    const identity = await authenticateRequest(new Request("https://worker.invalid", { headers: { authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvd25lciJ9.signature" } }), env);
    assert.equal(identity?.uid, "owner"); assert.equal(verified, 1);
    globalThis.fetch = async () => new Response(null, { status: 401 });
    assert.equal(await authenticateRequest(new Request("https://worker.invalid", { headers: { authorization: "Bearer fake.claims.signature" } }), env), null);
  } finally { globalThis.fetch = original; }
});

test("concurrent JWT consumers share one issuance and forced refresh issues a new token", async () => {
  let issued = 0;
  const auth = createGuilduoAuth({ account: {
    get: async () => ({ $id: "owner" }),
    createJWT: async () => { issued++; await new Promise(resolve => setTimeout(resolve, 5)); return { jwt: `fake-${issued}` }; },
    createOAuth2Token: () => {}, createSession: async () => ({}), deleteSession: async () => ({}),
  }, getOAuthCallback: () => null });
  await auth.refreshAccount();
  assert.deepEqual(await Promise.all(Array.from({ length: 9 }, () => auth.getAccessToken())), Array(9).fill("fake-1"));
  assert.equal(issued, 1);
  assert.equal(await auth.getAccessToken(true), "fake-2");
});

test("boot snapshot does not start or wait for auxiliary panels", async () => {
  const original = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname; paths.push(path);
    if (path === "/v1/quests") return Response.json({ quests: [], total: 0 });
    if (path === "/v1/profile") return Response.json({ profile: { uid: "owner" } });
    if (path === "/v1/agents") return Response.json({ agents: [] });
    return Response.json({});
  };
  try {
    const repo = new QuestForgeRepository({ baseUrl: "https://fake.invalid", getToken: async () => "fake" });
    const snapshot = await repo.loadSnapshot({ deferPanels: true });
    assert.deepEqual(paths.sort(), ["/v1/agents", "/v1/profile", "/v1/quests"]);
    assert.ok(snapshot.loadDeferred);
    await snapshot.loadDeferred!();
    assert.equal(paths.length, 9);
    assert.equal(snapshot.quests.length, 0);
  } finally { globalThis.fetch = original; }
});

test("JWT issuance completing after sign-out cannot restore the token cache", async () => {
  let release!: (result: { jwt: string }) => void;
  const pendingJwt = new Promise<{ jwt: string }>(resolve => { release = resolve; });
  let signedOut = false;
  const auth = createGuilduoAuth({ account: {
    get: async () => { if (signedOut) throw { code: 401 }; return { $id: "owner" }; },
    createJWT: () => pendingJwt, createOAuth2Token: () => {}, createSession: async () => ({}),
    deleteSession: async () => { signedOut = true; return {}; },
  }, getOAuthCallback: () => null });
  await auth.refreshAccount();
  const token = auth.getAccessToken();
  await auth.signOutAccount();
  release({ jwt: "stale-token" });
  assert.equal(await token, "");
  assert.equal(await auth.getAccessToken(), "");
  assert.equal(auth.currentAccount(), null);
});

test("read requests have a deadline while writes are neither aborted nor retried on 503", async () => {
  const original = globalThis.fetch;
  const calls: RequestInit[] = [];
  globalThis.fetch = async (_input, init) => {
    calls.push(init || {});
    return init?.method === "PATCH" ? Response.json({}, { status: 503 }) : Response.json({});
  };
  try {
    const repo = new QuestForgeRepository({ baseUrl: "https://fake.invalid", getToken: async () => "fake" });
    await repo.getQuest("q");
    await repo.listMcpTools();
    await assert.rejects(() => repo.updateQuest("q", { title: "changed" }), { status: 503 });
    assert.equal(calls.length, 3);
    assert.ok(calls[0].signal instanceof AbortSignal);
    assert.ok(calls[1].signal instanceof AbortSignal);
    assert.equal(calls[2].signal, undefined);
  } finally { globalThis.fetch = original; }
});

test("preflight cache applies only to allowed origins", async () => {
  const worker = (await import("../worker/src/index.ts")).default;
  const env = { ALLOWED_ORIGINS: "https://app.guilduo.com" } as WorkerEnv;
  const context = { waitUntil(_promise: Promise<unknown>) {} };
  for (const origin of ["https://app.guilduo.com", "https://untrusted.invalid"]) {
    const response = await worker.fetch(new Request("https://worker.invalid/v1/quests", { method: "OPTIONS", headers: { origin } }), env, context);
    assert.equal(response.headers.get("access-control-max-age"), origin === "https://app.guilduo.com" ? "600" : null);
    assert.equal(response.headers.get("access-control-allow-origin"), origin === "https://app.guilduo.com" ? origin : null);
  }
});

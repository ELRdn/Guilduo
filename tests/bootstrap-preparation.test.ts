import assert from "node:assert/strict";
import test from "node:test";
import { createGuilduoAuth } from "../appwrite-auth.ts";
import { QuestForgeRepository } from "../interaction-lab/repository.ts";
import { prepareWorkspaceReads } from "../interaction-lab/relay-forge/bootstrap-preparation.ts";

const tokenFor = (userId: string) => `header.${Buffer.from(JSON.stringify({ userId })).toString("base64url")}.signature`;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));
function harness() {
  const account = deferred<{ $id: string }>();
  const jwt = deferred<{ jwt: string }>();
  const read = deferred<Awaited<ReturnType<QuestForgeRepository["loadSnapshot"]>>>();
  let calls = 0;
  let repo: QuestForgeRepository | undefined;
  const auth = createGuilduoAuth({ getOAuthCallback: () => null, account: {
    get: () => account.promise, createJWT: () => jwt.promise,
    createSession: async () => ({}), createOAuth2Token: () => {}, deleteSession: async () => ({}),
  } });
  const preparation = prepareWorkspaceReads(force => auth.getAccessToken(force), getToken => {
    repo = new QuestForgeRepository({ baseUrl: "https://example.test", getToken });
    repo.loadSnapshot = async options => { assert.equal(options?.deferPanels, true); calls++; return read.promise; };
    return repo;
  });
  return { account, jwt, read, auth, preparation, calls: () => calls, repo: () => repo };
}

test("initial GETs may overlap account verification but are only usable for the verified matching account", async () => {
  const h = harness();
  const state = h.auth.resolveAuthState(h.preparation.onSessionToken);
  h.jwt.resolve({ jwt: tokenFor("owner") }); await nextTurn();
  assert.equal(h.calls(), 1);
  assert.equal(h.auth.currentAccount(), null);
  assert.equal(await h.repo()!.getToken(true), "", "speculation must not initiate token refresh");
  h.account.resolve({ $id: "owner" });
  assert.equal((await state).status, "authenticated");
  const usable = h.preparation.finish("owner");
  assert.ok(usable);
  assert.equal(await usable.repository.getToken(), tokenFor("owner"));
  assert.equal(h.preparation.finish("owner"), undefined, "consume preparation only once");
  h.read.reject(new Error("read failure"));
  await assert.rejects(usable.snapshot, /read failure/);
});

test("a fast account response closes preparation before a slow token can start duplicate reads", async () => {
  const h = harness();
  const state = h.auth.resolveAuthState(h.preparation.onSessionToken);
  h.account.resolve({ $id: "owner" }); await state;
  assert.equal(h.preparation.finish("owner"), undefined);
  h.jwt.resolve({ jwt: tokenFor("owner") }); await nextTurn();
  assert.equal(h.calls(), 0);
});

test("failed auth or demo cancellation discards already-started reads without unhandled rejection", async () => {
  for (const failure of [401, 503]) {
    const h = harness();
    const state = h.auth.resolveAuthState(h.preparation.onSessionToken);
    h.jwt.resolve({ jwt: tokenFor("owner") }); await nextTurn();
    assert.equal(h.calls(), 1);
    h.account.reject({ code: failure }); await state;
    assert.equal(h.preparation.finish(), undefined);
    h.read.reject(new Error("ignored speculative error")); await nextTurn();
    assert.equal(h.auth.currentAccount(), null);
  }
});

test("mismatched subject is discarded and the stale cached JWT is not reused", async () => {
  const h = harness();
  const state = h.auth.resolveAuthState(h.preparation.onSessionToken);
  h.jwt.resolve({ jwt: tokenFor("old-owner") }); await nextTurn();
  h.account.resolve({ $id: "new-owner" }); await state;
  assert.equal(h.preparation.finish("new-owner"), undefined);
  // The injected issuer always returns the old token; reissuance must fail closed.
  await assert.rejects(h.auth.getAccessToken(), /session changed/);
  h.read.reject(new Error("discarded")); await nextTurn();
});

test("sign-out suppresses a late token's speculative reads", async () => {
  const h = harness();
  const state = h.auth.resolveAuthState(h.preparation.onSessionToken);
  await h.auth.signOutAccount();
  h.jwt.resolve({ jwt: tokenFor("owner") }); h.account.resolve({ $id: "owner" });
  assert.equal((await state).status, "signed-out"); await nextTurn();
  assert.equal(h.calls(), 0);
});

test("malformed tokens disable the optional prefetch without granting account identity", async () => {
  const h = harness();
  const state = h.auth.resolveAuthState(h.preparation.onSessionToken);
  h.jwt.resolve({ jwt: "not-a-jwt" }); await nextTurn();
  assert.equal(h.calls(), 0); assert.equal(h.auth.currentAccount(), null);
  h.account.resolve({ $id: "owner" }); assert.equal((await state).status, "authenticated");
});

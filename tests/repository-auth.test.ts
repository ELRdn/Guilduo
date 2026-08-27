import assert from "node:assert/strict";
import test from "node:test";

import { QuestForgeRepository } from "../interaction-lab/repository.ts";

test("repository refreshes an Appwrite JWT once after an authenticated 401", async () => {
  const originalFetch = globalThis.fetch;
  const forceRefreshCalls: boolean[] = [];
  const authorizationHeaders: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    const authorization = headers.get("authorization") || "";
    authorizationHeaders.push(authorization);
    if (authorization === "Bearer stale-jwt") {
      return new Response(JSON.stringify({ error: { code: "unauthorized", message: "expired" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ quests: [], total: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const repository = new QuestForgeRepository({
      baseUrl: "https://gateway.example",
      getToken: async (forceRefresh = false) => {
        forceRefreshCalls.push(forceRefresh);
        return forceRefresh ? "fresh-jwt" : "stale-jwt";
      },
    });
    assert.deepEqual(await repository.request("/v1/quests"), { quests: [], total: 0 });
    assert.deepEqual(forceRefreshCalls, [false, true]);
    assert.deepEqual(authorizationHeaders, ["Bearer stale-jwt", "Bearer fresh-jwt"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("repository never loops when a refreshed Appwrite JWT is also rejected", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response(JSON.stringify({ error: { code: "unauthorized", message: "rejected" } }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const repository = new QuestForgeRepository({
      baseUrl: "https://gateway.example",
      getToken: async (forceRefresh = false) => forceRefresh ? "fresh-jwt" : "stale-jwt",
    });
    await assert.rejects(repository.request("/v1/quests"), (error: unknown) => {
      return Boolean(error && typeof error === "object" && "status" in error && error.status === 401);
    });
    assert.equal(requests, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

import assert from "node:assert/strict";
import test from "node:test";

test("Appwrite OAuth return restores the authenticated Guilduo user", async () => {
  const authModule = await import("../appwrite-auth.ts");
  const createAuth = (authModule as unknown as {
    createGuilduoAuth?: (options: unknown) => {
      resolveAuthState: () => Promise<{ status: string; user?: { uid: string; email: string; displayName: string } }>;
    };
  }).createGuilduoAuth;

  assert.equal(typeof createAuth, "function", "the auth facade must expose an injectable Appwrite account seam");

  let sessionCreated = false;
  let callbackCleared = false;
  const auth = createAuth!({
    account: {
      createSession: async ({ userId, secret }: { userId: string; secret: string }) => {
        assert.deepEqual({ userId, secret }, { userId: "user-1", secret: "single-use-secret" });
        sessionCreated = true;
        return {};
      },
      get: async () => {
        if (!sessionCreated) throw { code: 401 };
        return { $id: "user-1", email: "hironao@example.com", name: "Hironao", prefs: {} };
      },
    },
    getOAuthCallback: () => ({ userId: "user-1", secret: "single-use-secret" }),
    clearOAuthCallback: () => { callbackCleared = true; },
    now: () => 1_000,
  });

  assert.deepEqual(await auth.resolveAuthState(), {
    status: "authenticated",
    user: { uid: "user-1", email: "hironao@example.com", displayName: "Hironao" },
  });
  assert.equal(callbackCleared, true);
});

test("auth state distinguishes a missing session from an Appwrite connection failure", async () => {
  const authModule = await import("../appwrite-auth.ts");
  const createAuth = (authModule as unknown as {
    createGuilduoAuth: (options: unknown) => {
      resolveAuthState: () => Promise<{ status: string }>;
    };
  }).createGuilduoAuth;

  const signedOut = createAuth({
    account: { get: async () => { throw { code: 401 }; } },
  });
  const disconnected = createAuth({
    account: { get: async () => { throw new TypeError("Failed to fetch"); } },
  });

  assert.deepEqual(await signedOut.resolveAuthState(), { status: "signed-out" });
  assert.equal((await disconnected.resolveAuthState()).status, "connection-error");
});

test("auth facade delegates OAuth, JWT, and logout to one Appwrite account client", async () => {
  const authModule = await import("../appwrite-auth.ts");
  const createAuth = (authModule as unknown as {
    createGuilduoAuth: (options: unknown) => {
      refreshAccount: () => Promise<unknown>;
      getAccessToken: () => Promise<string>;
      beginGoogleSignIn: () => void;
      signOutAccount: () => Promise<void>;
      currentAccount: () => unknown;
    };
  }).createGuilduoAuth;
  const calls = { jwt: 0, oauth: [] as unknown[], logout: 0 };
  const auth = createAuth({
    account: {
      get: async () => ({ $id: "user-1", email: "hironao@example.com", name: "Hironao", prefs: {} }),
      createJWT: async () => { calls.jwt += 1; return { jwt: "jwt-1" }; },
      createOAuth2Token: (input: unknown) => { calls.oauth.push(input); },
      deleteSession: async () => { calls.logout += 1; return {}; },
    },
    getReturnUrl: () => "https://guilduo.example/next/relay-forge/",
    now: () => 1_000,
  });

  await auth.refreshAccount();
  assert.equal(await auth.getAccessToken(), "jwt-1");
  assert.equal(await auth.getAccessToken(), "jwt-1");
  assert.equal(calls.jwt, 1);
  auth.beginGoogleSignIn();
  assert.deepEqual(calls.oauth, [{
    provider: "google",
    success: "https://guilduo.example/next/relay-forge/",
    failure: "https://guilduo.example/next/relay-forge/?auth=failed",
  }]);
  await auth.signOutAccount();
  assert.equal(calls.logout, 1);
  assert.equal(auth.currentAccount(), null);
});

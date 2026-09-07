import { strict as assert } from "node:assert";
import test from "node:test";
import {
  effectiveTheme,
  nextQuickToggleTheme,
  parseThemePreference,
  THEME_KEY,
} from "../interaction-lab/relay-forge/theme.ts";
import {
  deriveMcpUrl,
  normalizeSettingsModel,
  effectiveConnectionScopes,
  type SettingsMcpConnectionRow,
} from "../interaction-lab/relay-forge/screens/settings-model.ts";

test("Settings: execution scopes intersect active Agent permissions without losing the control-plane grant", () => {
  const connection: SettingsMcpConnectionRow = { clientId: "client", clientName: "My client", scopes: ["quests:read", "quests:write", "agents:write"], linkedAgentId: "my-agent", authorized: true, revokedAt: null, linkRevokedAt: null, firstConnectedAt: "", lastUsedAt: "" };
  const model = { agents: [{ agentId: "my-agent", displayName: "My Agent", status: "active", provider: "mine", role: "assistant", allowedScopes: ["quests:read", "agents:read"] }] };
  assert.deepEqual(effectiveConnectionScopes(model, connection), ["quests:read"]);
  assert.ok(connection.scopes.includes("agents:write"));
  for (const patch of [{ authorized: false }, { revokedAt: "now" }, { linkRevokedAt: "now" }, { linkedAgentId: "missing" }]) assert.deepEqual(effectiveConnectionScopes(model, { ...connection, ...patch }), []);
  assert.deepEqual(effectiveConnectionScopes({ agents: [{ ...model.agents[0], status: "disabled" }] }, connection), []);
});

/* ------------------------------------------------------------------ *
 * Theme — the fix for the Rail quick-toggle no-op bug.
 * ------------------------------------------------------------------ */

test("Theme: storage key is unchanged, so an existing saved preference still applies", () => {
  assert.equal(THEME_KEY, "qf-relay-forge-theme");
});

test("Theme: effectiveTheme resolves system against the OS, and passes explicit choices through untouched", () => {
  assert.equal(effectiveTheme("system", true), "dark");
  assert.equal(effectiveTheme("system", false), "light");
  assert.equal(effectiveTheme("dark", false), "dark");
  assert.equal(effectiveTheme("light", true), "light");
});

test("Theme: the quick toggle is never a visual no-op from system, in either OS state", () => {
  // The bug: system + OS dark cycled to "dark", which was already on screen.
  assert.equal(nextQuickToggleTheme("system", true), "light");
  assert.equal(nextQuickToggleTheme("system", false), "dark");
});

test("Theme: the quick toggle flips an explicit choice regardless of OS state", () => {
  assert.equal(nextQuickToggleTheme("dark", true), "light");
  assert.equal(nextQuickToggleTheme("dark", false), "light");
  assert.equal(nextQuickToggleTheme("light", true), "dark");
  assert.equal(nextQuickToggleTheme("light", false), "dark");
});

test("Theme: an invalid or corrupted stored value falls back to system, not a crash", () => {
  for (const bad of [null, "", "sepia", "true", "1", "SYSTEM", undefined]) {
    assert.equal(parseThemePreference(bad), "system");
  }
  assert.equal(parseThemePreference("light"), "light");
  assert.equal(parseThemePreference("dark"), "dark");
  assert.equal(parseThemePreference("system"), "system");
});

/* ------------------------------------------------------------------ *
 * MCP URL derivation
 * ------------------------------------------------------------------ */

test("Settings: the MCP URL is the gateway URL plus exactly one /mcp, no doubled or missing slash", () => {
  assert.equal(deriveMcpUrl("https://questforge-gateway.example.workers.dev"), "https://questforge-gateway.example.workers.dev/mcp");
  assert.equal(deriveMcpUrl("https://questforge-gateway.example.workers.dev/"), "https://questforge-gateway.example.workers.dev/mcp");
  assert.equal(deriveMcpUrl("https://questforge-gateway.example.workers.dev///"), "https://questforge-gateway.example.workers.dev/mcp");
  assert.equal(deriveMcpUrl(""), "");
  assert.equal(deriveMcpUrl("   "), "");
});

test("Settings: the MCP URL never points at /mcp-next", () => {
  const url = deriveMcpUrl("https://questforge-gateway.example.workers.dev");
  assert.doesNotMatch(url, /mcp-next/);
});

/* ------------------------------------------------------------------ *
 * Settings model — never carries a secret, never fabricates a handle.
 * ------------------------------------------------------------------ */

test("Settings: the model never carries a token, client secret, or API key field", () => {
  const model = normalizeSettingsModel({
    isDemo: false,
    profile: { displayName: "Hironao", handle: "hironao" },
    theme: "system",
    effectiveTheme: "dark",
    gatewayUrl: "https://questforge-gateway.example.workers.dev",
    agents: [],
  });
  const serialized = JSON.stringify(model).toLowerCase();
  for (const forbidden of ["token", "secret", "apikey", "bearer"]) {
    assert.equal(serialized.includes(forbidden), false, `model must not contain "${forbidden}"`);
  }
});

test("Settings: a profile without a handle is reported, not silently generated", () => {
  const model = normalizeSettingsModel({
    isDemo: false,
    profile: { displayName: "Hironao" },
    theme: "system",
    effectiveTheme: "light",
    gatewayUrl: "https://questforge-gateway.example.workers.dev",
    agents: [],
  });
  assert.equal(model.profile?.hasHandle, false);
  assert.equal(model.profile?.handle, "");
});

test("Settings: a missing profile is distinguished from an empty one", () => {
  const model = normalizeSettingsModel({
    isDemo: false,
    profile: null,
    theme: "system",
    effectiveTheme: "light",
    gatewayUrl: "https://questforge-gateway.example.workers.dev",
    agents: [],
  });
  assert.equal(model.profile, null);
});

test("Settings: demo mode is carried on the model so the UI can refuse to fake a save", () => {
  const model = normalizeSettingsModel({
    isDemo: true,
    profile: null,
    theme: "system",
    effectiveTheme: "light",
    gatewayUrl: "",
    agents: [],
  });
  assert.equal(model.isDemo, true);
  assert.equal(model.mcpUrl, "");
});

test("Settings: Agent rows pass through untouched — this screen lists, it does not compute workload", () => {
  const model = normalizeSettingsModel({
    isDemo: false,
    profile: { displayName: "Hironao", handle: "hironao" },
    theme: "dark",
    effectiveTheme: "dark",
    gatewayUrl: "https://questforge-gateway.example.workers.dev",
    agents: [
      { agentId: "forge-runner", displayName: "Forge Runner", provider: "anthropic", role: "assistant", status: "active" },
      { agentId: "reviewer", displayName: "Reviewer", provider: "", role: "reviewer", status: "disabled" },
    ],
  });
  assert.equal(model.agents.length, 2);
  assert.equal(model.agents[1].status, "disabled");
});

test("Settings: MCP connection rows keep a linked Agent separate from OAuth authorization", () => {
  const model = normalizeSettingsModel({
    isDemo: false,
    profile: { displayName: "Hironao", handle: "hironao" },
    theme: "dark",
    effectiveTheme: "dark",
    gatewayUrl: "https://mcp.guilduo.com",
    agents: [{ agentId: "forge", displayName: "Forge", provider: "generic", role: "assistant", status: "active" }],
    mcpConnections: [{
      clientId: "client-1",
      clientName: "Claude",
      scopes: ["agents:read"],
      firstConnectedAt: "2026-08-30T00:00:00.000Z",
      lastUsedAt: "2026-08-30T01:00:00.000Z",
      linkedAgentId: "forge",
      linkRevokedAt: null,
      authorized: true,
      revokedAt: null,
    }],
  });
  assert.equal(model.mcpConnections[0]?.linkedAgentId, "forge");
  assert.equal(model.mcpConnections[0]?.authorized, true);
  assert.equal(model.mcpConnections[0]?.scopes[0], "agents:read");
});

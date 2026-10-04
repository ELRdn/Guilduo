import assert from "node:assert/strict";
import test from "node:test";
import { staticRoutingPayload } from "../tools/ensure-static-site-routing.mts";

const site = { $id: "guilduo-web", name: "Guilduo", framework: "other", adapter: "static",
  fallbackFile: "index.html", enabled: true, logging: false, timeout: 15,
  buildCommand: "npm run build", installCommand: "npm ci", outputDirectory: "dist",
  providerBranch: "main", providerBranches: ["main"], providerPaths: [],
  scopes: ["sites.read"], deploymentId: "active", $createdAt: "2026-10-05", providerAccessToken: "private" };

test("static not-found update preserves supported configuration and excludes metadata/secrets", () => {
  const payload = staticRoutingPayload(site, site.$id)!;
  assert.equal(payload.fallbackFile, "");
  for (const key of ["name", "framework", "enabled", "logging", "timeout", "buildCommand",
    "installCommand", "outputDirectory", "providerBranch", "providerBranches", "providerPaths", "scopes"]) {
    assert.deepEqual(payload[key], site[key as keyof typeof site]);
  }
  for (const key of ["$id", "$createdAt", "deploymentId", "providerAccessToken"]) assert.ok(!(key in payload));
});

test("static not-found update is idempotent and rejects other Site/routing contracts", () => {
  assert.equal(staticRoutingPayload({ ...site, fallbackFile: "" }, site.$id), undefined);
  assert.throws(() => staticRoutingPayload(site, "another-site"));
  assert.throws(() => staticRoutingPayload({ ...site, adapter: "ssr" }, site.$id));
  assert.throws(() => staticRoutingPayload({ ...site, fallbackFile: "custom.html" }, site.$id));
  assert.throws(() => staticRoutingPayload({ ...site, fallbackFile: undefined }, site.$id));
});

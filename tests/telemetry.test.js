const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("telemetry is opt-in, allowlisted, and does not include quest content", async () => {
  const telemetry = await import("../telemetry.mjs");
  telemetry.resetTelemetryForTests();
  assert.equal(telemetry.getTelemetryConsent(), "unknown");
  assert.equal(telemetry.setTelemetryConsent("granted"), "granted");
  assert.equal(telemetry.setTelemetryConsent("invalid"), "unknown");
  telemetry.resetTelemetryForTests();
  const source = fs.readFileSync(path.join(root, "telemetry.mjs"), "utf8");
  assert.match(source, /ALLOWED_EVENTS/);
  assert.match(source, /questforge-telemetry-consent/);
  assert.doesNotMatch(source, /task\.title|task\.notes|firebase.*uid|authorization/i);
});

test("telemetry ingestion is bounded, anonymous, and retained for 90 days", () => {
  const worker = fs.readFileSync(path.join(root, "worker/src/index.mjs"), "utf8");
  const migration = fs.readFileSync(path.join(root, "migrations/0006_telemetry.sql"), "utf8");
  assert.match(worker, /path === "\/telemetry"/);
  assert.match(worker, /payload_too_large/);
  assert.match(worker, /slice\(0, 20\)/);
  assert.match(worker, /TELEMETRY_EVENT_NAMES/);
  assert.match(worker, /-90 days/);
  assert.match(migration, /telemetry_events/);
  assert.doesNotMatch(worker, /request\.headers\.get\("(cookie|user-agent|x-forwarded-for)"\)/i);
});

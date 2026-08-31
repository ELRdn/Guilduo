import { strict as assert } from "node:assert";
import test from "node:test";
import { createLifecycleGuard, runLifecycleStep } from "../interaction-lab/relay-forge/primitives/lifecycle-guard.ts";

/*
 * `shell.ts` has no DOM in this test environment (no `document`/`window`),
 * so `mountRelayForge` itself cannot be exercised here. What *is* directly
 * testable — and is the actual mechanism the Settings avatar-save flow uses
 * between resize, profile API, and state application — is the lifecycle
 * guard plus `runLifecycleStep()`. These tests pin the stage boundaries as
 * well as disposal semantics.
 */

test("lifecycle guard: starts un-disposed", () => {
  const guard = createLifecycleGuard();
  assert.equal(guard.disposed, false);
});

test("lifecycle guard: a pending fetch that resolves after dispose is discarded, not applied", () => {
  const guard = createLifecycleGuard();
  let applied = false;
  function onFetchResolved(): void {
    // Mirrors the exact pattern in shell.ts: check before doing anything
    // observable with the result.
    if (guard.disposed) return;
    applied = true;
  }

  // unmount() happens first...
  guard.dispose();
  // ...then the in-flight fetch's `.then` callback finally runs.
  onFetchResolved();

  assert.equal(applied, false, "a result that lands after dispose must never be applied");
});

test("lifecycle guard: a fetch that resolves before dispose is applied normally", () => {
  const guard = createLifecycleGuard();
  let applied = false;
  function onFetchResolved(): void {
    if (guard.disposed) return;
    applied = true;
  }

  onFetchResolved();
  guard.dispose();

  assert.equal(applied, true, "disposing after a result already landed must not retroactively discard it");
});

test("lifecycle guard: dispose is idempotent — a second call never throws and disposed stays true", () => {
  const guard = createLifecycleGuard();
  guard.dispose();
  assert.doesNotThrow(() => guard.dispose());
  assert.equal(guard.disposed, true);
});

test("lifecycle guard: two independent guards (two mounts) do not share state", () => {
  const mountOne = createLifecycleGuard();
  const mountTwo = createLifecycleGuard();
  mountOne.dispose();
  assert.equal(mountOne.disposed, true);
  assert.equal(mountTwo.disposed, false);
});

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("lifecycle step: disposing during image resize prevents the profile API stage from starting", async () => {
  const lifecycle = createLifecycleGuard();
  const resize = deferred<{ dataUrl: string }>();
  let profileUpdateCalls = 0;

  const flow = (async () => {
    const resized = await runLifecycleStep(lifecycle, () => resize.promise);
    if (resized.status === "disposed") return;
    profileUpdateCalls += 1;
  })();

  lifecycle.dispose();
  resize.resolve({ dataUrl: "data:image/webp;base64,test" });
  await flow;
  assert.equal(profileUpdateCalls, 0);
});

test("lifecycle step: disposing during the profile API call discards its result", async () => {
  const lifecycle = createLifecycleGuard();
  const update = deferred<{ displayName: string }>();
  let applied = false;

  const flow = (async () => {
    const response = await runLifecycleStep(lifecycle, () => update.promise);
    if (response.status === "disposed") return;
    applied = true;
  })();

  lifecycle.dispose();
  update.resolve({ displayName: "Updated" });
  await flow;
  assert.equal(applied, false);
});

test("lifecycle step: an already-disposed mount does not start a new operation", async () => {
  const lifecycle = createLifecycleGuard();
  lifecycle.dispose();
  let calls = 0;
  const result = await runLifecycleStep(lifecycle, async () => {
    calls += 1;
    return "unreachable";
  });
  assert.equal(result.status, "disposed");
  assert.equal(calls, 0);
});

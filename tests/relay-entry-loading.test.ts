import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { ObservedAuthState } from "../interaction-lab/auth.ts";

const source = stripTypeScriptTypes(readFileSync(new URL("../interaction-lab/relay-forge/main.ts", import.meta.url), "utf8"));
// Exercise the actual entry orchestration without a browser or network; the
// existing entry:verify --built remains the real DOM/SDK/Worker acceptance gate.
const script = source.replace(/^import .*;\r?$/gm, "").replace(/\bimport\(/g, "loadModule(") + "\n({ checkAuth });";
const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
class Element {
  children: Array<Element | string> = [];
  textContent = "";
  dataset = {};
  isConnected = true;
  listeners = new Map<string, () => void>();
  append(...children: Array<Element | string>) { this.children.push(...children); }
  replaceChildren(...children: Element[]) { this.children = children; }
  setAttribute() {}
  focus() {}
  querySelector() { return null; }
  addEventListener(event: string, callback: () => void) { this.listeners.set(event, callback); }
}
type Runtime = { owner: string; signOut?: () => Promise<void> };
function harness(search = "") {
  const root = new Element();
  const shellGate = deferred<void>();
  const runtimeGate = deferred<void>();
  const imports: string[] = [];
  const mounts: Array<Runtime | null> = [];
  const owners: string[] = [];
  const observers: Array<{ callback: (state: ObservedAuthState) => void; active: boolean }> = [];
  let disposals = 0;
  let timings = 0;
  const entry = runInNewContext(script, {
    URLSearchParams, performance,
    window: { location: { search } },
    document: { createElement: () => new Element(), documentElement: {} },
    requireElement: () => root,
    loadModule: async (path: string) => {
      imports.push(path);
      if (path === "./shell.ts") {
        await shellGate.promise;
        return { mountRelayForge: (_root: Element, runtime: Runtime | null) => {
          mounts.push(runtime);
          root.replaceChildren(new Element());
          return () => { disposals++; };
        } };
      }
      assert.equal(path, "./production.ts");
      return { createProductionRuntime: async (_repository: unknown, owner: string) => {
        owners.push(owner);
        await runtimeGate.promise;
        return { owner };
      } };
    },
    observeAuthState: (callback: (state: ObservedAuthState) => void) => {
      const observer = { callback, active: true };
      observers.push(observer);
      callback({ status: "checking" });
      return () => { observer.active = false; };
    },
    prepareWorkspaceReads: () => ({ finish: () => undefined, onSessionToken: () => {} }),
    QuestForgeRepository: class {}, QuestForgeApiError: Error,
    signOutUser: async () => {}, signIn: async () => {}, getIdToken: async () => "",
    dismissOAuthFailure: () => {}, clearAcquisitionHandoff: () => {},
    relayText: (key: string) => key,
    getLocale: () => "ja", setLocale: () => {},
    SUPPORTED_LOCALES: ["ja"], LOCALE_METADATA: { ja: { label: "日本語" } },
    reportGuiTiming: (_action: string, _start: number, valid: () => boolean) => { if (valid()) timings++; },
  }) as { checkAuth: () => void };
  const auth = (owner: string) => observers.at(-1)!.callback({ status: "authenticated", user: { uid: owner, email: "owner@example.test", displayName: "Owner", photoURL: "" } });
  const signedOut = () => observers.at(-1)!.callback({ status: "signed-out" });
  const heading = () => (root.children[0] as Element).children[1] as Element;
  const click = (label: string) => {
    const actions = (root.children[0] as Element).children[3] as Element;
    const button = actions.children.find(child => child instanceof Element && child.textContent === label) as Element | undefined;
    assert.ok(button, `Missing entry action ${label}`);
    button.listeners.get("click")!();
  };
  return { entry, imports, mounts, owners, observers, shellGate, runtimeGate, auth, signedOut, click,
    heading: () => heading().textContent, disposals: () => disposals, timings: () => timings };
}

test("entry loads Shell/production on demand and discards late imports/runtime after auth changes", async () => {
  assert.doesNotMatch(source, /^import .* from ["']\.\/(?:shell|production)\.ts["']/m);
  const h = harness();
  h.signedOut();
  assert.equal(h.heading(), "signInTitle");
  assert.deepEqual(h.imports, [], "signed-out entry must not load Shell/production");
  const previousObserver = h.observers.at(-1)!;
  h.entry.checkAuth();
  assert.equal(previousObserver.active, false, "stopAuth must unsubscribe the old observer");
  previousObserver.callback({ status: "connection-error", error: new Error("late auth") });
  assert.equal(h.heading(), "authChecking", "an old auth observer must not replace the new generation");
  h.auth("old-owner");
  assert.deepEqual(h.imports, ["./production.ts", "./shell.ts"]);
  h.entry.checkAuth();
  h.signedOut();
  h.shellGate.resolve();
  await nextTurn();
  assert.deepEqual(h.owners, [], "stale imports must not start private runtime reads");
  assert.equal(h.heading(), "signInTitle");
  h.entry.checkAuth();
  h.auth("new-owner");
  await nextTurn();
  h.entry.checkAuth();
  h.signedOut();
  h.runtimeGate.resolve();
  await nextTurn();
  assert.equal(h.mounts.length, 0, "late runtime must not replace signed-out UI");
  assert.equal(h.timings(), 0);
  h.entry.checkAuth();
  h.auth("current-owner");
  await nextTurn();
  assert.equal(h.mounts[0]?.owner, "current-owner");
  await h.mounts[0]!.signOut!();
  assert.equal(h.disposals(), 1, "sign-out must use the Shell's unmount");
  h.signedOut();
  assert.equal(h.heading(), "signInTitle");
  assert.equal(h.disposals(), 1, "bootstrap disposal must remain idempotent");
  assert.equal(h.observers.filter(observer => observer.active).length, 1);

  const demo = harness();
  demo.signedOut();
  demo.click("demoButton");
  assert.deepEqual(demo.imports, ["./shell.ts"]);
  demo.shellGate.resolve();
  await nextTurn();
  assert.deepEqual(demo.mounts, [null], "demo must never create a production runtime");
  const cancelledDemo = harness();
  cancelledDemo.signedOut();
  cancelledDemo.click("demoButton");
  const stoppedObserver = cancelledDemo.observers.at(-1)!;
  assert.equal(stoppedObserver.active, false, "demo selection must stop the auth subscription");
  cancelledDemo.click("signIn");
  stoppedObserver.callback({ status: "connection-error", error: new Error("stopped auth") });
  assert.equal(cancelledDemo.heading(), "authSigning", "stopped observer stays invalid after leaving demo mode");
  cancelledDemo.shellGate.resolve();
  await nextTurn();
  assert.equal(cancelledDemo.heading(), "authSigning");
  assert.equal(cancelledDemo.mounts.length, 0, "a pending demo must not replace the sign-in transition");
  const fixture = harness("?fixture=command");
  fixture.shellGate.resolve();
  await nextTurn();
  assert.deepEqual(fixture.imports, ["./shell.ts"]);
  assert.equal(fixture.observers.length, 0);
  assert.deepEqual(fixture.mounts, [null]);

  const failed = harness();
  failed.auth("owner");
  failed.shellGate.reject(new Error("chunk unavailable"));
  await nextTurn();
  assert.equal(failed.heading(), "workspaceFailed");
  assert.equal(failed.mounts.length, 0);
  const failedDemo = harness("?state=default");
  failedDemo.shellGate.reject(new Error("demo chunk unavailable"));
  await nextTurn();
  assert.equal(failedDemo.heading(), "workspaceFailed", "demo import failure must be handled too");
});

test("the current auth observer invalidates imports/runtime and disposes mounted UI on later auth events", async () => {
  const events: Array<{ state: ObservedAuthState; heading: string }> = [
    { state: { status: "signed-out" }, heading: "signInTitle" },
    { state: { status: "connection-error", error: new Error("session expired") }, heading: "authFailed" },
    { state: { status: "checking" }, heading: "authChecking" },
    { state: { status: "oauth-failed" }, heading: "oauthFailed" },
  ];
  for (const phase of ["import", "runtime", "mounted"]) {
    for (const { state, heading } of events) {
      const h = harness();
      const observer = h.observers.at(-1)!;
      h.auth("owner");
      if (phase !== "import") { h.shellGate.resolve(); await nextTurn(); }
      if (phase === "mounted") { h.runtimeGate.resolve(); await nextTurn(); }
      assert.equal(h.mounts.length, phase === "mounted" ? 1 : 0);
      assert.equal(h.observers.at(-1), observer, "keep the same current observer");
      assert.equal(observer.active, true);
      observer.callback(state);
      assert.equal(h.heading(), heading, `${phase}: current observer must accept ${state.status}`);
      h.shellGate.resolve();
      h.runtimeGate.resolve();
      await nextTurn();
      assert.equal(h.heading(), heading, `${phase}: late work must not restore private UI`);
      assert.equal(h.mounts.length, phase === "mounted" ? 1 : 0);
      assert.equal(h.disposals(), phase === "mounted" ? 1 : 0);
      assert.equal(h.timings(), phase === "mounted" ? 1 : 0);
      if (phase === "import") assert.deepEqual(h.owners, [], "invalidated imports must not start runtime reads");
    }
  }
});

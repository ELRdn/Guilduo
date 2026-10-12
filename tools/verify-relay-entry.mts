import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { startRelayWorkerFixture } from "../tests/browser/worker-fixture.ts";
import { relayText } from "../interaction-lab/relay-forge/relay-copy.ts";

const base = process.argv[2] || "http://127.0.0.1:5184";
const built = process.argv.includes("--built");
const origin = new URL(base).origin;
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const appPath = built ? "/next/relay-forge/" : "/interaction-lab/relay-forge/";
const output = `.qa-artifacts/relay-entry${built ? "-built" : ""}`;
await mkdir(output, { recursive:true });
const browser = await chromium.launch({ executablePath:process.env.QF_CHROME_PATH || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome"), headless:true });
const owners: Awaited<ReturnType<typeof startRelayWorkerFixture>>[] = [];
const results: string[] = [];
const errors: string[] = [];
const releases: Array<() => void> = [];
function hold() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  releases.push(release);
  return { promise, release };
}
const jwt = (uid: string) => `e30.${Buffer.from(JSON.stringify({ userId:uid, exp:Math.floor(Date.now()/1000)+900 })).toString("base64url")}.isolated-fixture`;
async function client(width = 1440, owner = owners[0]) {
  const page = await browser.newPage({ viewport:{ width, height:1000 }, locale:"ja", reducedMotion:"reduce" });
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install();
  const control = { uid:owner.uid, firstTokenUid:owner.uid, accountStatus:200, signedOut:false, jwtRequests:0, primaryReads:0, sessionCreates:0, accountGate:Promise.resolve(), workspaceGate:Promise.resolve() };
  // Appwrite is a synthetic port; all API data/mutations still reach the real
  // isolated Worker. Unexpected external traffic is rejected, never forwarded.
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) { await route.continue(); return; }
    if (url.hostname === "api.guilduo.com" && url.pathname.startsWith("/v1/account")) {
      if (url.pathname === "/v1/account" && request.method() === "GET") {
        await control.accountGate;
        const status = control.signedOut ? 401 : control.accountStatus;
        await route.fulfill({ status, json:status === 200 ? { $id:control.uid, name:"Synthetic account", email:"entry@example.test", prefs:{} } : { code:status, type:"user_unauthorized", message:"Isolated account response" } });
      } else if (url.pathname === "/v1/account/jwts" && request.method() === "POST") {
        control.jwtRequests++;
        await route.fulfill({ status:control.signedOut ? 401 : 201, json:control.signedOut ? { code:401, message:"Signed out" } : { jwt:jwt(control.jwtRequests === 1 ? control.firstTokenUid : control.uid) } });
      } else if (url.pathname === "/v1/account/sessions/current" && request.method() === "DELETE") {
        control.signedOut = true;
        await route.fulfill({ status:204 });
      } else if (url.pathname === "/v1/account/sessions/token" && request.method() === "POST") {
        assert.deepEqual(request.postDataJSON(), { userId:control.uid, secret:"synthetic-callback" });
        control.sessionCreates++;
        await route.fulfill({ status:201, json:{} });
      } else { errors.push(`Unexpected Appwrite route: ${request.method()} ${url.pathname}`); await route.abort(); }
      return;
    }
    if (url.hostname === "mcp.guilduo.com" && (url.pathname.startsWith("/v1/") || url.pathname === "/mcp" || url.pathname === "/health")) {
      const token = request.headers().authorization?.replace(/^Bearer /, "") || "";
      const uid = token ? (JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as { userId:string }).userId : control.uid;
      const fixture = owners.find(item => item.uid === uid);
      assert.ok(fixture, "Only synthetic owners may access the test bridge");
      const response = await route.fetch({ url:`${fixture.baseUrl}${url.pathname}${url.search}`, headers:{ ...request.headers(), authorization:"Bearer local-relay-human-test-token", origin } });
      if (url.pathname === "/v1/workspace/bootstrap") { control.primaryReads++; await control.workspaceGate; }
      await route.fulfill({ response });
      return;
    }
    errors.push(`Unexpected network target: ${url.origin}${url.pathname}`);
    await route.abort();
  });
  return { page, control };
}
try {
  owners.push(await startRelayWorkerFixture(origin));
  owners.push(await startRelayWorkerFixture(origin));
  const task = (await owners[0].web("/v1/quests", "POST", { kind:"todo", title:"Verified owner A task" })).quest;
  const other = (await owners[1].web("/v1/quests", "POST", { kind:"todo", title:"Verified owner B task" })).quest;
  assert.equal((await owners[0].mcp("get_quest", { questId:task.id })).quest.id, task.id);
  assert.equal((await owners[1].mcp("get_quest", { questId:other.id })).quest.id, other.id);
  await assert.rejects(owners[0].mcp("get_quest", { questId:other.id }), /Fixture MCP failed/);
  results.push("Simultaneous isolated Workers retain independent Agent credentials and deny another owner's Quest");
  const human = (await owners[0].web("/v1/quests", "POST", { kind:"todo", title:"External Human work", assignee:{ type:"human", id:"other-human", label:"External reviewer", handoffState:"working" } })).quest;
  const desktop = await client();
  const authGate = hold();
  desktop.control.accountGate = authGate.promise;
  const preparedRead = desktop.page.waitForRequest(request => new URL(request.url()).pathname === "/v1/workspace/bootstrap");
  await desktop.page.goto(`${base}${appPath}`);
  await desktop.page.locator('.rf-bootstrap[data-state="loading"]').waitFor();
  await preparedRead;
  assert.equal(await desktop.page.locator(".rf-shell").count(), 0);
  authGate.release();
  await desktop.page.locator(".rf-shell").waitFor();
  assert.equal(await desktop.page.locator(".rf-demo-label").count(), 0);
  results.push("Actual app entry prepares reads while account verification is held and mounts only after verification");
  await desktop.page.locator(`.rf-spine-row[data-quest-id="${task.id}"]`).click();
  await desktop.page.keyboard.press("Escape");

  await desktop.page.locator(`.rf-spine-row[data-quest-id="${human.id}"]`).click();
  assert.ok((await desktop.page.locator(".rf-selected-state:visible").textContent())?.includes("External reviewer"));
  await desktop.page.keyboard.press("Escape");
  await desktop.page.locator(`.rf-spine-row[data-quest-id="${task.id}"]`).click();
  await desktop.page.keyboard.press("Escape");
  const mobile = await client(412);
  await mobile.page.goto(`${base}${appPath}`);
  await mobile.page.locator(".rf-shell").waitFor();
  await mobile.page.locator(".rf-m-questflow").click();
  const modalBackgroundFocus = await mobile.page.evaluate(`(function () {
    var button = document.querySelector(".rf-rail .rf-nav-item");
    if (button) button.focus();
    return button !== null && document.activeElement === button;
  })()`);
  assert.equal(modalBackgroundFocus, false);
  assert.equal(await mobile.page.locator("dialog:modal").count(), 1);
  results.push("Actual-entry mobile modal prevents focus from escaping into background navigation");
  await mobile.page.locator(`.rf-sheet-panel .rf-spine-row[data-quest-id="${task.id}"]`).click();
  assert.equal(await mobile.page.locator(".rf-m-relay-step").count(), 1);
  assert.notEqual(await mobile.page.locator(".rf-m-relay-state").textContent(), relayText("commandNextHolder", "ja"));
  results.push("Command preserves the named external Human and shows a single actual holder for self work");
  await desktop.page.locator('[data-quest-action="start"]:visible').click();
  await desktop.page.locator('.rf-decision-result[data-tone="success"]:visible').waitFor();
  await mobile.page.clock.fastForward(30001);
  await mobile.page.locator('[data-quest-action="stop"]:visible').waitFor();
  await mobile.page.locator('[data-quest-action="stop"]:visible').click();
  await mobile.page.locator('.rf-decision-result[data-tone="success"]:visible').waitFor();
  await desktop.page.evaluate("window.dispatchEvent(new Event('focus'))");
  await desktop.page.locator('[data-quest-action="start"]:visible').waitFor();
  results.push("Actual authenticated app entry synchronizes desktop and mobile writes through the real Worker");
  await mobile.page.reload();
  await mobile.page.locator(".rf-shell").waitFor();
  assert.equal(await mobile.page.locator(".rf-demo-label").count(), 0);
  await mobile.page.locator(".rf-m-questflow").click();
  await mobile.page.locator(`.rf-sheet-panel .rf-spine-row[data-quest-id="${task.id}"]`).click();
  await mobile.page.locator('[data-quest-action="start"]:visible').waitFor();
  assert.equal((await owners[0].web(`/v1/quests/${task.id}`)).quest.assignee.handoffState, "none");
  results.push("Authenticated reload restores canonical task data through the production composition root");

  const switched = await client(1440, owners[1]);
  switched.control.firstTokenUid = owners[0].uid;
  const switchGate = hold();
  switched.control.accountGate = switchGate.promise;
  const switchedRead = switched.page.waitForRequest(request => new URL(request.url()).pathname === "/v1/workspace/bootstrap");
  await switched.page.goto(`${base}${appPath}`);
  await switchedRead;
  switchGate.release();
  await switched.page.locator(".rf-shell").waitFor();
  assert.equal(await switched.page.locator(`.rf-spine-row[data-quest-id="${task.id}"]`).count(), 0);
  assert.equal(await switched.page.locator(`.rf-spine-row[data-quest-id="${other.id}"]`).count(), 1);
  assert.ok(switched.control.jwtRequests >= 2);
  results.push("Account mismatch discards owner A's prepared data and token and mounts only owner B's verified workspace");

  const denied = await client();
  denied.control.accountStatus = 401;
  const deniedGate = hold();
  denied.control.accountGate = deniedGate.promise;
  const deniedRead = denied.page.waitForRequest(request => new URL(request.url()).pathname === "/v1/workspace/bootstrap");
  await denied.page.goto(`${base}${appPath}`);
  await deniedRead;
  deniedGate.release();
  await denied.page.getByRole("heading", { name:relayText("signInTitle", "ja"), exact:true }).waitFor();
  assert.equal(await denied.page.locator(".rf-shell").count(), 0);
  results.push("Account rejection never mounts a successful speculative API response");

  const malformed = await client();
  malformed.control.uid = "";
  const malformedGate = hold();
  malformed.control.accountGate = malformedGate.promise;
  const malformedRead = malformed.page.waitForRequest(request => new URL(request.url()).pathname === "/v1/workspace/bootstrap");
  await malformed.page.goto(`${base}${appPath}`);
  await malformedRead;
  malformedGate.release();
  await malformed.page.getByRole("heading", { name:relayText("authFailed", "ja"), exact:true }).waitFor();
  assert.equal(await malformed.page.locator(".rf-shell").count(), 0);
  results.push("Malformed successful account identity rejects prepared data and remains in the authentication error screen");
  const callback = await client();
  await callback.page.goto(`${base}${appPath}?userId=${encodeURIComponent(owners[0].uid)}&secret=synthetic-callback`);
  await callback.page.locator(".rf-shell").waitFor();
  assert.equal(callback.control.sessionCreates, 1);
  assert.equal(new URL(callback.page.url()).searchParams.has("secret"), false);
  assert.equal(new URL(callback.page.url()).searchParams.has("userId"), false);
  results.push("Synthetic OAuth callback creates one SDK session and clears callback credentials before mounting");

  const unavailable = await client();
  unavailable.control.accountStatus = 503;
  await unavailable.page.goto(`${base}${appPath}`);
  await unavailable.page.getByRole("heading", { name:relayText("authFailed", "ja"), exact:true }).waitFor();
  unavailable.control.accountStatus = 200;
  await unavailable.page.getByRole("button", { name:relayText("retry", "ja"), exact:true }).click();
  await unavailable.page.locator(".rf-shell").waitFor();
  results.push("Account transport failure offers a working real-entry retry instead of mounting demo data");

  const readsBefore = desktop.control.primaryReads;
  const late = hold();
  desktop.control.workspaceGate = late.promise;
  const lateRead = desktop.page.waitForResponse(response => new URL(response.url()).pathname === "/v1/workspace/bootstrap");
  await desktop.page.evaluate("window.dispatchEvent(new Event('focus'))");
  await desktop.page.locator('.rf-shell[data-sync-state="syncing"]').waitFor();
  await desktop.page.locator(".rf-account-trigger").click();
  await desktop.page.locator(".rf-account-menu-item--danger").click();
  await desktop.page.getByRole("heading", { name:relayText("signInTitle", "ja"), exact:true }).waitFor();
  late.release();
  await lateRead;
  await desktop.page.clock.fastForward(60001);
  assert.equal(await desktop.page.locator(".rf-shell").count(), 0);
  assert.equal(desktop.control.primaryReads, readsBefore + 1);
  results.push("Actual SDK sign-out during refresh disposes the Shell; late reads and polling cannot restore private data");
  assert.deepEqual(errors, []);
  await mobile.page.screenshot({ path:`${output}/authenticated-mobile.png`, fullPage:true });
  await writeFile(`${output}/results.json`, JSON.stringify({ results, errors, built, scope:"Real app composition root, bundled Appwrite SDK with synthetic account/session responses, and isolated real HTTP Workers. Production Google OAuth, Appwrite storage and physical devices remain unverified." }, null, 2));
  console.log(`PASS ${results.length} actual-entry scenarios${built ? " in public build" : ""}`);
} finally { releases.forEach(release => release()); await browser.close(); await Promise.all(owners.map(owner => owner.close())); }

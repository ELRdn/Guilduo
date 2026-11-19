import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Page } from "playwright-core";
import { createServer } from "vite";
import { startRelayWorkerFixture } from "../tests/browser/worker-fixture.ts";
import { SqliteD1Database } from "../tests/test-helpers.ts";
import { getOAuthRecordStore } from "../worker/src/oauth-record-store.ts";
import { createAgent, linkAgentConnection } from "../worker/src/agent-store.ts";
import { captureKnowledge, readKnowledge } from "../worker/src/knowledge-store.ts";

const devServer = process.argv[2] ? null : await createServer({ server: { host: "127.0.0.1", port: 0, open: false, hmr: false, watch: null }, logLevel: "error" });
await devServer?.listen();
const base = (process.argv[2] || devServer!.resolvedUrls!.local[0]!).replace(/\/+$/, "");
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = ".qa-artifacts/knowledge"; await mkdir(output, { recursive: true });
const fixture = await startRelayWorkerFixture(new URL(base).origin);
fixture.env.QUESTFORGE_DB = new SqliteD1Database(); fixture.env.KNOWLEDGE_ENABLED = "true"; fixture.env.KNOWLEDGE_OWNER_UID = fixture.uid;
await createAgent(fixture.env, fixture.uid, { agentId: "review-agent", displayName: "My Review Agent", allowedScopes: ["quests:read", "knowledge:read", "knowledge:write"] });
const clientId = "relay-memory-browser-client", scopes = ["quests:read", "knowledge:read", "knowledge:write"];
const grant = { uid: fixture.uid, email: "browser@example.test", clientId, clientName: "Local Relay Memory", scopes, firstConnectedAt: new Date().toISOString(), lastUsedAt: "", revokedAt: "" };
await getOAuthRecordStore(fixture.env).put(`user-client:${fixture.uid}:${clientId}`, JSON.stringify(grant));
await linkAgentConnection(fixture.env, fixture.uid, "review-agent", { clientId, clientName: grant.clientName, scopes });
const original = (await captureKnowledge(fixture.env, { uid: fixture.uid, email: "", authType: "dev", scopes: ["knowledge:write"] }, {
  requestId: "browser-seed", title: "UI/APIの合意", content: "saveDraft API を使い、保存中は二重送信を防ぐ。", kind: "constraint", scope: "global", epistemic: "human_statement", reason: "Human chose this behavior",
  sources: [{ reference: "fixture:requirements#1", version: "1", excerpt: "saveDraft", availability: "reported" }],
})).knowledge;
const browser = await chromium.launch({ executablePath: process.env.QF_CHROME_PATH || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome"), headless: true });
const errors: string[] = [], results: string[] = [];
let activePage: Page | null = null;
try {
  for (const width of [1440, 390]) {
    const page = activePage = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
    page.setDefaultTimeout(30000); page.on("pageerror", error => errors.push(error.message));
    await page.clock.install();
    await page.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    await page.goto(`${base}/tests/browser/production-relay.html?api=${encodeURIComponent(fixture.baseUrl)}&uid=${fixture.uid}&lang=ja`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator(".rf-shell").waitFor(); await page.keyboard.press("Escape");
    if (width <= 900) { await page.locator(".rf-nav-more").click({ noWaitAfter: true }); await page.locator(".rf-nav-more-panel").getByRole("button", { name: "Settings", exact: true }).click({ noWaitAfter: true }); }
    else await page.locator(".rf-rail-utility:has(.rf-settings-mark)").click({ noWaitAfter: true });
    const knowledge = page.locator(".rf-knowledge");
    await knowledge.getByRole("heading", { name: "Relay Memory", exact: true }).waitFor();
    await knowledge.getByRole("heading", { name: original.title }).waitFor();
    await knowledge.getByRole("checkbox", { name: "選択したAgentと知識全体を共有する" }).check();
    await knowledge.getByRole("checkbox", { name: "My Review Agent · Local Relay Memory" }).check();
    await knowledge.getByRole("button", { name: "保存", exact: true }).click();
    await knowledge.getByText("保存を確認しました。", { exact: true }).waitFor();
    const item = knowledge.locator("article").filter({ has: page.getByRole("heading", { name: original.title }) });
    await item.getByRole("button", { name: "編集", exact: true }).click();
    await writeFile(`${output}/editor-${width}.html`, await knowledge.innerHTML());
    await writeFile(`${output}/labels-${width}.json`, await page.evaluate("JSON.stringify([...document.querySelectorAll('textarea')].map(el=>({id:el.id,labels:[...el.labels].map(label=>label.textContent),sameId:document.querySelectorAll('[id=\"'+el.id+'\"]').length,connected:el.isConnected})))") as string);
    await knowledge.getByLabel("内容", { exact: true }).fill(`saveDraft ${width}: 保存中は二重送信を防ぐ。`);
    await knowledge.getByLabel("変更理由", { exact: true }).fill("UI verification");
    await page.clock.fastForward(31000);
    assert.equal(await knowledge.getByLabel("内容", { exact: true }).inputValue(), `saveDraft ${width}: 保存中は二重送信を防ぐ。`, "Workspace refresh must preserve the active knowledge draft");
    await knowledge.locator("form").filter({ has: page.getByLabel("変更理由", { exact: true }) }).getByRole("button", { name: "保存", exact: true }).click();
    await item.getByText(`saveDraft ${width}: 保存中は二重送信を防ぐ。`, { exact: true }).waitFor();
    await item.getByRole("button", { name: "履歴・取り消し" }).click();
    const revision = item.locator("details").filter({ has: page.locator("summary").filter({ hasText: /^v1 ·/ }) });
    await revision.locator("summary").click(); await revision.getByRole("button", { name: "この版へ復元" }).click();
    await item.locator(":scope > p").filter({ hasText: original.content }).waitFor();
    // Focus a native labelled field and navigate by keyboard; content stays text, never parsed as HTML.
    await knowledge.getByLabel("知識を検索", { exact: true }).focus(); await page.keyboard.press("Tab");
    assert.equal(await page.evaluate("document.activeElement?.textContent"), "検索");
    assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    await page.screenshot({ path: `${output}/knowledge-${width}.png`, fullPage: true, timeout: 10000, animations: "disabled" });
    results.push(`${width}: real local REST save, readback, history, undo, keyboard and no horizontal overflow`);
    if (width === 1440) {
      await item.getByRole("button", { name: "編集", exact: true }).click();
      const draftText = "残してほしいローカル下書き";
      await knowledge.getByLabel("内容", { exact: true }).fill(draftText);
      await knowledge.getByLabel("変更理由", { exact: true }).fill("Keep the local draft");
      await page.route("**/v1/knowledge/capture", route => route.abort("connectionreset"), { times: 1 });
      await knowledge.locator("form").filter({ has: page.getByLabel("変更理由", { exact: true }) }).getByRole("button", { name: "保存", exact: true }).click();
      const reconcile = knowledge.getByRole("button", { name: "保存状況を確認・同じ内容で再試行", exact: true });
      await reconcile.waitFor();
      const identity = { uid: fixture.uid, email: "", authType: "dev" as const, scopes: ["knowledge:read", "knowledge:write"] };
      const current = await readKnowledge(fixture.env, fixture.uid, original.id);
      await captureKnowledge(fixture.env, identity, {
        requestId: "concurrent-browser-fixture", knowledgeId: current.id, expectedRevision: current.revision,
        title: current.title, content: "別のセッションで保存した版", reason: "Separate owner session",
        kind: current.kind, scope: current.scope, epistemic: current.epistemic, sources: current.sources, change: "explicit",
      });
      await reconcile.click();
      await knowledge.getByRole("button", { name: "最新版を確認", exact: true }).click();
      await knowledge.getByRole("button", { name: "最新版に対する編集として続ける", exact: true }).click();
      assert.equal(await knowledge.getByLabel("内容", { exact: true }).inputValue(), draftText);
      await knowledge.getByRole("button", { name: "キャンセル", exact: true }).click();
      results.push("1440: outcome reconciliation handles confirmed conflicts without losing the draft");
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/browser-results.json`, JSON.stringify({ scope: "local fixture only; not real host or production acceptance", results, errors }, null, 2));
  console.log(results.join("\n"));
} catch (error) {
  if (activePage && !activePage.isClosed()) await writeFile(`${output}/failure.html`, await activePage.content());
  console.error("knowledge_browser_verification_failed", { errors, error }); throw error;
}
finally { await browser.close(); await fixture.close(); await devServer?.close(); }

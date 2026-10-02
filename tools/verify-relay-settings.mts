import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { startRelayWorkerFixture } from "../tests/browser/worker-fixture.ts";
import { getKv } from "../worker/src/security.ts";
import { linkAgentConnection } from "../worker/src/agent-store.ts";
import { relayText } from "../interaction-lab/relay-forge/relay-copy.ts";
import { SUPPORTED_LOCALES } from "../i18n.ts";

const base = process.argv[2] || "http://127.0.0.1:5183";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = ".qa-artifacts/settings";
await mkdir(output, { recursive: true });
const fixture = await startRelayWorkerFixture(new URL(base).origin);
const browser = await chromium.launch({ executablePath: process.env.QF_CHROME_PATH || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome"), headless: true });
const errors: string[] = [];
const results: string[] = [];
try {
  const clientId = "inactive-local-client";
  await getKv(fixture.env).put(`user-client:${fixture.uid}:${clientId}`, JSON.stringify({ uid: fixture.uid, clientId, clientName: "Inactive MCP", scopes: ["quests:read", "quests:write"], revokedAt: "2026-09-01T00:00:00.000Z" }));
  // Legacy grants can be revoked while their Agent relation remains active.
  await linkAgentConnection(fixture.env, fixture.uid, "review-agent", { clientId, clientName: "Inactive MCP", scopes: ["quests:read", "quests:write"] });
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: "dark", reducedMotion: "reduce" });
    page.setDefaultTimeout(10000);
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.install();
    await page.goto(`${base}/tests/browser/production-relay.html?api=${encodeURIComponent(fixture.baseUrl)}&uid=${fixture.uid}&lang=ja`);
    await page.locator(".rf-shell").waitFor();
    await page.keyboard.press("Escape");
    if (width <= 900) {
      await page.locator(".rf-nav-more").click();
      await page.locator(".rf-nav-more-panel").getByRole("button", { name: "Settings", exact: true }).click();
    } else await page.locator(".rf-rail-utility:has(.rf-settings-mark)").click();
    const inactive = page.locator(`.rf-set-connection-card[data-client-id="${clientId}"]`);
    const active = page.locator('.rf-set-connection-card[data-authorized="true"]');
    await inactive.waitFor();
    assert.equal(await active.locator(".rf-set-connection-delete").count(), 0);
    assert.equal(await inactive.locator(".rf-set-connection-delete").isEnabled(), true);
    assert.equal(await inactive.locator(".rf-set-connection-permissions").textContent(), relayText("mcpNoQuestAccess"));
    assert.equal(await active.locator(".rf-set-connection-permissions").textContent(), relayText("mcpQuestReadWrite"));
    assert.equal(await page.locator(".rf-relay-onboarding").innerText().then(text => text.includes("quests:read")), false);
    assert.equal(await active.locator(".rf-set-connection-id").isVisible(), false);
    assert.equal((await active.innerText()).includes("quests:read"), false);
    const details = active.locator(".rf-set-connection-details summary");
    await details.focus();
    await page.keyboard.press("Enter");
    assert.ok((await active.innerText()).includes("quests:read"));
    assert.ok((await active.innerText()).includes("quests:write"));
    assert.ok(!(await active.locator(".rf-set-connection-details").innerText()).includes("agents:write"), "only intersection permissions are shown");
    await page.keyboard.press("Enter");
    for (const locale of SUPPORTED_LOCALES) {
      await page.evaluate(`window.dispatchEvent(new CustomEvent("test:locale", { detail: ${JSON.stringify(locale)} }))`);
      assert.equal(await inactive.locator(".rf-set-connection-delete").textContent(), relayText("mcpDelete", locale));
      assert.equal(await active.locator(".rf-set-connection-permissions").textContent(), relayText("mcpQuestReadWrite", locale));
      assert.ok(await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), `${width}/${locale}: page overflow`);
      assert.ok(await page.locator(".rf-set-screen").evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${width}/${locale}: Settings overflow`);
    }
    await page.evaluate('window.dispatchEvent(new CustomEvent("test:locale", { detail: "ja" }))');
    await page.locator(".rf-set-mcp").screenshot({ path: `${output}/settings-${width}.png` });
    results.push(`${width}px: permissions summary, hidden technical names, keyboard details and all nine locales`);
    if (width === 390) {
      let mutations = 0;
      page.on("request", request => { if (request.method() === "DELETE") mutations++; });
      page.once("dialog", dialog => dialog.dismiss());
      await inactive.locator(".rf-set-connection-delete").click();
      assert.equal(mutations, 0, "cancel writes nothing");
      await page.route(`${fixture.baseUrl}/v1/agent-connections`, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "fixture_read_failed", message: "Fixture read failure" } }) }));
      page.once("dialog", async dialog => {
        assert.equal(dialog.message(), relayText("mcpDeleteConfirm"));
        await dialog.accept();
      });
      await inactive.locator(".rf-set-connection-delete").click();
      await page.locator(".rf-set-mcp-connections").getByRole("button", { name: relayText("retry"), exact: true }).waitFor();
      assert.equal(await page.locator(".rf-set-connection-delete").count(), 0, "failed reads hide stale write controls");
      assert.equal(mutations, 2, "disconnect and delete run once, without OAuth reconnect");
      await page.unroute(`${fixture.baseUrl}/v1/agent-connections`);
      await page.locator(".rf-set-mcp-connections").getByRole("button", { name: relayText("retry"), exact: true }).click();
      await inactive.waitFor({ state: "detached" });
      await active.waitFor();
      assert.equal(await inactive.count(), 0);
      const agents = await fixture.web("/v1/agents") as unknown as { agents: { agentId: string }[] };
      assert.ok(agents.agents.some(agent => agent.agentId === "review-agent"));
      const quests = await fixture.web("/v1/quests") as unknown as { quests: { id: string }[] };
      assert.ok(quests.quests.some(quest => quest.id === fixture.first.source.id));
      await page.reload();
      await page.locator(".rf-shell").waitFor();
      await page.locator(".rf-nav-more").click();
      await page.locator(".rf-nav-more-panel").getByRole("button", { name: "Settings", exact: true }).click();
      await active.waitFor();
      assert.equal(await inactive.count(), 0);
      results.push("Cancelled deletion is inert; inactive legacy connection is deleted without reconnect; failed refresh uses read-only retry; Agent and Quests survive reload");
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
  console.log(results.join("\n"));
} finally {
  await browser.close();
  await fixture.close();
}

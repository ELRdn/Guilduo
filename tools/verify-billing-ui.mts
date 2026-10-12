/** Run: node --import tsx tools/verify-billing-ui.mts
 * Uses an isolated owner Worker and fake billing/Jev responses. Never calls a live provider.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { createServer as httpServer } from "node:http";
import { once } from "node:events";
import { extname, resolve, sep } from "node:path";
import { build, createServer } from "vite";
import { chromium, type Page } from "playwright-core";
import { startRelayWorkerFixture } from "../tests/browser/worker-fixture.ts";
import { createAgent } from "../worker/src/agent-store.ts";
import { SUPPORTED_LOCALES } from "../i18n.ts";
import { billingText } from "../interaction-lab/relay-forge/billing-copy.ts";
import { formatBillingMoney } from "../interaction-lab/relay-forge/screens/settings-model.ts";
import { billingPricingFixture } from "../tests/browser/billing-pricing-fixture.ts";

const output = resolve(".qa-artifacts/launch-implementation/billing-ui");
const buildRoot = resolve(output, "build");
const workspaceRoot = realpathSync(process.cwd());
await mkdir(output, { recursive: true });
await build({ configFile: false, root: workspaceRoot, logLevel: "warn", base: "/", build: { outDir: buildRoot, emptyOutDir: false, rollupOptions: { input: { ui: resolve(workspaceRoot, "tests/browser/production-relay.html"), ja: resolve(workspaceRoot, "lp/index.html"), en: resolve(workspaceRoot, "lp/en/index.html") } } } });
const source = await createServer({ configFile: false, root: workspaceRoot, logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
await source.listen();
const sourceAddress = source.httpServer!.address();
assert.ok(sourceAddress && typeof sourceAddress === "object");
const staticServer = httpServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || "/", "http://local").pathname);
    const file = resolve(buildRoot, `.${pathname.endsWith("/") ? pathname + "index.html" : pathname}`);
    if (!file.startsWith(buildRoot + sep)) throw new Error("Outside fixture");
    const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".webp": "image/webp" };
    let bytes: Buffer;
    try { bytes = await readFile(file); }
    catch { if (!pathname.startsWith("/assets/")) throw new Error("Not found"); bytes = await readFile(resolve(process.cwd(), `.${pathname}`)); }
    response.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" }); response.end(bytes);
  } catch { response.writeHead(404); response.end("Not found"); }
});
staticServer.listen(0, "127.0.0.1"); await once(staticServer, "listening");
const address = staticServer.address(); assert.ok(address && typeof address === "object");
const browser = await chromium.launch({ executablePath: process.env.QF_CHROME_PATH || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome"), headless: true });
const results: string[] = [];
const errors: string[] = [];

async function settings(page: Page, width: number) {
  if (width <= 900) { await page.locator(".rf-nav-more").click(); await page.locator(".rf-nav-more-panel").getByRole("button", { name: "Settings", exact: true }).click(); }
  else await page.locator(".rf-rail-utility:has(.rf-settings-mark)").click();
  await page.locator('[data-billing="true"]').waitFor();
}
try {
  for (const [surface, base] of [["source", `http://127.0.0.1:${sourceAddress.port}`], ["built", `http://127.0.0.1:${address.port}`]] as const) {
    const fixture = await startRelayWorkerFixture(base);
    try {
      await createAgent(fixture.env, fixture.uid, { agentId: "writer-agent", displayName: "Writer Agent", role: "Writer", allowedScopes: ["quests:read", "quests:write"] });
      await createAgent(fixture.env, fixture.uid, { agentId: "extra-agent", displayName: "Extra Agent", role: "Editor", allowedScopes: ["quests:read", "quests:write"] });
      for (const width of [320, 412, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: 1050 }, reducedMotion: "reduce" });
        page.setDefaultTimeout(12000);
        page.on("pageerror", error => errors.push(`${surface}/${width}: ${error.message}`));
        const calls: { path: string; method: string; input: Record<string, unknown>; cursor?: string }[] = [];
        let statusError = true;
        let saveError = false;
        let estimateError = false;
        let executeError = false;
        let mode = "pending";
        let version = "";
        let selected = ["review-agent", "writer-agent"];
        let decisionInput: Record<string, unknown> = {};
        let pricing: ReturnType<typeof billingPricingFixture> | null = null;
        let configured = false;
        let salesReady = false;
        let checkoutError = true;
        let ledgerPageError = true;
        const network: string[] = [];
        await page.route("**/*", route => {
          const url = new URL(route.request().url());
          if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
            // Existing fonts are decoration. Any external API/auth/payment request is a failure.
            if (!/fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) network.push(url.href);
            return route.abort();
          }
          return route.continue();
        });
        const status = () => ({ enabled: true, configured, salesReady, mode: "test", plan: "free", agentLimit: 2, periodEnd: null, selectedAgentIds: selected, registeredAgentCount: 3, pricing,
          nextRenewal: "2099-02-01T00:00:00.000Z", cancelAtPeriodEnd: width === 412,
          credits: { available: 50, reserved: 0, debt: 0 }, referral: { code: "local-friend", attributed: false, rewarded: true } });
        await page.route(`${fixture.baseUrl}/v1/billing**`, async route => {
          const request = route.request(); const path = new URL(request.url()).pathname; const input = request.postDataJSON() as Record<string, unknown> | null;
          const cursor = new URL(request.url()).searchParams.get("cursor") || "";
          calls.push({ path, method: request.method(), input: input || {}, ...(cursor ? { cursor } : {}) });
          if (path === "/v1/billing/checkout") {
            await new Promise(done => setTimeout(done, 80));
            if (checkoutError) return route.abort("failed");
            return route.fulfill({ contentType: "application/json", body: JSON.stringify({ url: "https://checkout.stripe.com.attacker.invalid/pay" }) });
          }
          if (path === "/v1/billing/portal") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ url: "https://user:secret@billing.stripe.com/session" }) });
          if (path === "/v1/billing/credits") {
            if (cursor && ledgerPageError) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "fixture_failure", message: "Private ledger failure" } }) });
            await new Promise(done => setTimeout(done, 80));
            const entry = { id: "private-entry-one", kind: "grant", amount: 50, createdAt: "2026-10-03T00:00:00.000Z", source: "private-processor-id" };
            return route.fulfill({ contentType: "application/json", body: JSON.stringify({ entries: cursor ? [entry, { ...entry, id: "private-entry-two", kind: "commit", amount: -3 }] : [entry], nextCursor: cursor ? null : "fixture/+next=" }) });
          }
          if (path === "/v1/billing" && statusError || path === "/v1/billing/agents" && saveError) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "fixture_failure", message: "Private provider detail must not appear" } }) });
          if (path === "/v1/billing/agents") { selected = input!.agentIds as string[]; await new Promise(done => setTimeout(done, 80)); }
          return route.fulfill({ contentType: "application/json", body: JSON.stringify(path === "/v1/billing/credits" ? { entries: [{ kind: "grant", amount: 50, createdAt: "2026-10-03T00:00:00.000Z", source: "private-processor-id" }] } : status()) });
        });
        await page.route(`${fixture.baseUrl}/v1/decisions**`, async route => {
          const request = route.request(); const path = new URL(request.url()).pathname; const input = request.postDataJSON() as Record<string, unknown> | null;
          calls.push({ path, method: request.method(), input: input || {} });
          if (path.endsWith("/estimate")) {
            if (estimateError) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "jev_unavailable", message: "secret provider configuration" } }) });
            version = String(input!.expectedUpdatedAt);
            return route.fulfill({ contentType: "application/json", body: JSON.stringify({ credits: 3, available: true, expectedUpdatedAt: version, candidateAgentIds: input!.agentIds }) });
          }
          if (path === "/v1/decisions") { decisionInput = input!; await new Promise(done => setTimeout(done, 80)); if (executeError) return route.abort("failed"); }
          if (path.endsWith("/apply")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ quest: fixture.first.source }) });
          const agentId = (decisionInput.agentIds as string[])[0];
          const confidence = mode === "manual" ? 0.3 : 0.95;
          return route.fulfill({ contentType: "application/json", body: JSON.stringify({ id: decisionInput.requestId, questId: decisionInput.questId, expectedUpdatedAt: version, status: mode, agentId, action: "continue", result: mode === "pending" ? null : { answers: { agent: { choice: `agent:${agentId}`, confidence }, action: { choice: "continue", confidence } } } }) });
        });
        await page.goto(`${base}/tests/browser/production-relay.html?api=${encodeURIComponent(fixture.baseUrl)}&uid=${fixture.uid}&lang=ja`);
        await page.locator(".rf-shell").waitFor(); await page.keyboard.press("Escape");
        assert.equal(calls.length, 0, "no billing/Jev request before Settings entry");
        await settings(page, width);
        const billing = page.locator('[data-billing="true"]');
        await billing.locator('[role="alert"]').waitFor();
        assert.equal((await billing.innerText()).includes("Private provider"), false);
        statusError = false;
        await billing.locator('[data-billing-action="retry"]').first().click();
        await billing.locator(".rf-billing-picker").first().waitFor();
        assert.equal(calls.filter(call => call.path === "/v1/billing").length, 2);
        assert.equal(await billing.locator('[data-billing-action="monthly"], [data-billing-action="yearly"]').count(), 0);
        for (const locale of SUPPORTED_LOCALES) {
          await page.evaluate(`window.dispatchEvent(new CustomEvent("test:locale", { detail: ${JSON.stringify(locale)} }))`);
          assert.equal(await billing.locator("..").getAttribute("aria-label"), billingText("title", locale));
          assert.equal(await billing.locator('[data-billing-action="saveAgents"]').innerText(), billingText("saveAgents", locale));
          assert.ok(await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), `${surface}/${width}/${locale}: document overflow`);
          assert.ok(await billing.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${surface}/${width}/${locale}: billing overflow`);
        }
        assert.equal(calls.filter(call => call.path === "/v1/billing").length, 2, "locale redraws do not poll billing");
        await page.evaluate('window.dispatchEvent(new CustomEvent("test:locale", { detail: "ja" }))');
        const free = billing.locator(".rf-billing-picker").first();
        assert.equal(await free.locator('input[type="checkbox"]:checked').count(), 2);
        assert.equal(await free.locator('input[type="checkbox"]:not(:checked)').isDisabled(), true);
        await free.getByLabel("My Review Agent").uncheck();
        await free.getByLabel("Extra Agent").check();
        saveError = true;
        await billing.locator('[data-billing-action="saveAgents"]').click(); await billing.locator('[role="alert"]').waitFor();
        assert.equal(await free.getByLabel("Extra Agent").isChecked(), true, "draft survives failed save");
        saveError = false;
        await billing.locator('[data-billing-action="saveAgents"]').click();
        await billing.locator('[data-billing-action="saveAgents"]').dispatchEvent("click");
        await page.waitForFunction('document.querySelector("[data-billing=true]")?.getAttribute("aria-busy") === "false"');
        assert.equal(calls.filter(call => call.path === "/v1/billing/agents").length, 2);
        await billing.locator(".rf-billing-history summary").click();
        await billing.locator(".rf-billing-history li").waitFor();
        assert.equal((await billing.innerText()).includes("private-processor-id"), false);
        const history = billing.locator(".rf-billing-history");
        await history.locator('[data-billing-action="loadMore"]').click();
        await history.locator('[role="alert"]').waitFor();
        assert.equal(await history.locator("li").count(), 1, "ledger page failure preserves existing rows");
        assert.equal((await history.innerText()).includes("Private ledger"), false);
        ledgerPageError = false;
        await history.locator('[data-billing-action="retry"]').click();
        await history.locator('[data-billing-action="loadMore"]').dispatchEvent("click");
        await page.waitForFunction('document.querySelector("[data-billing=true]")?.getAttribute("aria-busy") === "false"');
        assert.equal(await history.locator("li").count(), 2, "overlapping ledger rows are not duplicated");
        assert.equal(await history.locator('[data-billing-action="loadMore"]').count(), 0);
        const ledgerCalls = calls.filter(call => call.path === "/v1/billing/credits");
        assert.equal(ledgerCalls.length, 3);
        assert.equal(ledgerCalls[1]!.cursor, "fixture/+next=");
        assert.equal(ledgerCalls[2]!.cursor, "fixture/+next=");
        const jev = billing.locator('[data-jev="true"]');
        await jev.locator("select").selectOption(fixture.first.source.id);
        await jev.getByLabel("Extra Agent", { exact: true }).check();
        assert.equal(await jev.locator('[data-billing-action="estimate"]').isDisabled(), true);
        await jev.locator('[data-billing-focus="consent"]').focus(); await page.keyboard.press("Space");
        assert.equal(await jev.locator('[data-billing-focus="consent"]').isChecked(), true);
        assert.equal(await page.evaluate('document.querySelector("[data-billing-focus=consent]") === document.activeElement'), true);
        estimateError = true;
        await jev.locator('[data-billing-action="estimate"]').click(); await billing.locator('[role="alert"]').waitFor();
        assert.equal(await jev.locator("select").inputValue(), fixture.first.source.id);
        assert.equal(await jev.getByLabel("Extra Agent", { exact: true }).isChecked(), true);
        estimateError = false;
        await jev.locator('[data-billing-action="estimate"]').click();
        await page.waitForFunction('document.querySelector("[data-billing-action=execute]")?.disabled === false');
        if (width === 320) executeError = true;
        await jev.locator('[data-billing-action="execute"]').click();
        await jev.locator('[data-billing-action="execute"]').dispatchEvent("click");
        await page.waitForFunction('document.querySelector("[data-billing=true]")?.getAttribute("aria-busy") === "false"');
        assert.equal(calls.filter(call => call.path === "/v1/decisions").length, 1);
        assert.equal(await jev.locator('[data-billing-action="execute"]').isDisabled(), true);
        assert.equal(await jev.locator('[data-billing-action="apply"]').isDisabled(), true);
        assert.equal(calls.some(call => call.path.endsWith("/apply")), false);
        mode = "manual"; await jev.locator('[data-billing-action="refresh"]').click();
        await page.waitForFunction('document.querySelector("[data-billing=true]")?.getAttribute("aria-busy") === "false"');
        assert.equal(await jev.locator('[data-billing-action="apply"]').isDisabled(), true);
        mode = "suggestion"; await jev.locator('[data-billing-action="refresh"]').click();
        await page.waitForFunction('document.querySelector("[data-billing-action=apply]")?.disabled === false');
        assert.equal(calls.some(call => call.path.endsWith("/apply")), false, "a suggestion never applies automatically");
        page.once("dialog", dialog => dialog.dismiss()); await jev.locator('[data-billing-action="apply"]').click();
        assert.equal(calls.some(call => call.path.endsWith("/apply")), false, "cancel confirmation is inert");
        page.once("dialog", dialog => dialog.accept()); await jev.locator('[data-billing-action="apply"]').click();
        await page.waitForFunction('document.querySelector("[data-billing=true]")?.getAttribute("aria-busy") === "false"');
        assert.equal(calls.filter(call => call.path.endsWith("/apply")).length, 1);
        assert.equal(calls.find(call => call.path.endsWith("/apply"))!.input.expectedUpdatedAt, version);
        assert.equal(calls.some(call => /checkout|portal/.test(call.path)), false);
        await jev.scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve(output, `${surface}-${width}.png`) });
        if (width <= 412) {
          await page.evaluate('document.querySelector(".rf-set-screen h1")?.scrollIntoView({ block: "start" }); window.scrollTo(0, 0);');
          await page.screenshot({ path: resolve(output, `${surface}-${width}-settings-top.png`) });
        }
        // Prices are synthetic. These tests never enable a live account or follow a payment URL.
        const reload = async () => {
          await billing.locator('[data-billing-action="retry"]').first().click();
          await page.waitForFunction('document.querySelector("[data-billing=true]")?.getAttribute("aria-busy") === "false"');
        };
        pricing = billingPricingFixture();
        await reload();
        const prices = billing.locator('[data-billing-pricing="true"]');
        assert.equal(await prices.locator("details").count(), 1, "typed conditions render even while webhook/setup is missing");
        assert.equal(await prices.locator('[data-billing-action="monthly"], [data-billing-action="yearly"]').count(), 0);
        configured = true;
        await reload();
        assert.equal(await prices.locator('[data-billing-action="monthly"], [data-billing-action="yearly"]').count(), 0, "salesReady=false still prevents checkout");
        salesReady = true;
        await reload();
        const pricingLoadCalls = calls.length;
        for (const locale of SUPPORTED_LOCALES) {
          await page.evaluate(`window.dispatchEvent(new CustomEvent("test:locale", { detail: ${JSON.stringify(locale)} }))`);
          const text = await prices.innerText();
          for (const key of ["creditsCadence", "creditExpiryFromGrant", "cancelPolicy", "taxExclusive", "autoTax", "refundPolicy", "referralRules", "referralReward", "discountPriority", "renewalPrice", "testMode", "redeemUntil"] as const) assert.ok(text.includes(billingText(key, locale)), `${surface}/${width}/${locale}: ${key}`);
          assert.ok(text.includes(formatBillingMoney(1234, "USD", locale)));
          assert.ok(text.includes(formatBillingMoney(12345, "USD", locale)));
          assert.equal(await prices.getByLabel(billingText("checkoutConsent", locale), { exact: true }).count(), 1);
          assert.equal(await prices.locator('[data-billing-action="monthly"]').isDisabled(), true, "explicit purchase consent required");
          assert.ok((await billing.innerText()).includes(billingText(width === 412 ? "cancelScheduled" : "nextRenewal", locale)));
          assert.ok(await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), `${surface}/${width}/${locale}: pricing document overflow`);
          assert.ok(await prices.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${surface}/${width}/${locale}: pricing overflow`);
          const inaccessible = await page.evaluate(`Array.from(document.querySelectorAll('[data-billing-pricing] button, [data-billing-pricing] summary, [data-billing-pricing] .rf-billing-check, [data-billing-pricing] input[type=text]')).filter(node => node.getBoundingClientRect().height < 44 || node.getBoundingClientRect().width < 44).length`);
          assert.equal(inaccessible, 0, `${surface}/${width}/${locale}: 44px targets`);
        }
        assert.equal(calls.length, pricingLoadCalls, "pricing redraws and consent do not auto-request providers");
        await page.evaluate('window.dispatchEvent(new CustomEvent("test:locale", { detail: "ja" }))');
        const summary = prices.locator("summary");
        await summary.focus(); await page.keyboard.press("Space");
        assert.equal(await prices.locator("details").getAttribute("open"), null, "native keyboard disclosure closes");
        await page.keyboard.press("Enter");
        assert.notEqual(await prices.locator("details").getAttribute("open"), null, "native keyboard disclosure opens");
        assert.equal(await page.evaluate('getComputedStyle(document.querySelector("[data-billing-focus=terms]")).outlineStyle'), "solid");
        const buyConsent = prices.locator('[data-billing-focus="purchase-consent"]');
        const referral = prices.locator('[data-billing-focus="referral"]');
        await referral.fill("fixture-friend");
        await buyConsent.focus(); await page.keyboard.press("Space");
        assert.equal(await buyConsent.isChecked(), true);
        assert.equal(await page.evaluate('document.activeElement?.getAttribute("data-billing-focus")'), "purchase-consent");
        await referral.fill("fixture-friend-updated");
        assert.equal(await buyConsent.isChecked(), false, "changing referral clears visible consent immediately");
        assert.equal(await prices.locator('[data-billing-action="monthly"]').isDisabled(), true);
        await buyConsent.check();
        const interval = width === 412 ? "yearly" : "monthly";
        await prices.locator(`[data-billing-action="${interval}"]`).click();
        await prices.locator('[data-billing-action="checkoutRetry"]').dispatchEvent("click");
        await page.waitForFunction('document.querySelector("[data-billing=true]")?.getAttribute("aria-busy") === "false"');
        const firstCheckout = calls.filter(call => call.path === "/v1/billing/checkout");
        assert.equal(firstCheckout.length, 1, "pending checkout dispatch is deduplicated");
        assert.equal(firstCheckout[0]!.input.interval, width === 412 ? "annual" : "monthly");
        assert.equal(firstCheckout[0]!.input.referralCode, "fixture-friend-updated");
        assert.ok(firstCheckout[0]!.input.requestId);
        assert.equal(await referral.isDisabled(), true, "unknown outcomes preserve the purchase attempt");
        assert.equal(await prices.locator('[data-billing-action="monthly"], [data-billing-action="yearly"]').count(), 0);
        checkoutError = false;
        await prices.locator('[data-billing-action="checkoutRetry"]').click();
        await page.waitForFunction('document.querySelector("[data-billing=true]")?.getAttribute("aria-busy") === "false"');
        const checkoutCalls = calls.filter(call => call.path === "/v1/billing/checkout");
        assert.equal(checkoutCalls.length, 2);
        assert.deepEqual(checkoutCalls[1]!.input, checkoutCalls[0]!.input, "uncertain checkout retries the identical request");
        assert.ok((await billing.locator('[role="alert"]').innerText()).includes(billingText("unsafeUrl", "ja")));
        await billing.locator('[data-billing-action="portal"]').click();
        await page.waitForFunction('document.querySelector("[data-billing=true]")?.getAttribute("aria-busy") === "false"');
        assert.ok((await billing.locator('[role="alert"]').innerText()).includes(billingText("unsafeUrl", "ja")));
        assert.equal((await billing.innerText()).includes("user:secret"), false);
        assert.deepEqual(network, [], "no unexpected external network calls or unsafe navigation");
        await prices.scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve(output, `${surface}-${width}-pricing.png`) });
        results.push(`${surface}/${width}: nine locales; typed monthly/annual prices, discounts/renewal, Credit cadence/expiry, tax/refund/referral; salesReady gate, native keyboard/focus/44px, no overflow; identical checkout retry and pending dedup, unsafe URL rejection; Free selection and Jev confirmed apply; zero live requests`);
        await page.close();
      }
      for (const path of ["/lp/", "/lp/en/"]) {
        const page = await browser.newPage({ viewport: { width: 320, height: 900 }, javaScriptEnabled: false });
        await page.goto(base + path);
        assert.equal(await page.locator('[data-pricing-availability="pending"]').count(), 1);
        assert.ok(!/\$\s*(10|96)\b/.test(await page.locator('[data-pricing-availability="pending"]').innerText()));
        await page.close();
      }
    } finally { await fixture.close(); }
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, "results.json"), JSON.stringify({ results, errors, liveProviderRequests: 0 }, null, 2));
  console.log(results.join("\n"));
} finally {
  await browser.close(); await source.close();
  await new Promise<void>(done => { staticServer.close(() => done()); staticServer.closeAllConnections(); });
}

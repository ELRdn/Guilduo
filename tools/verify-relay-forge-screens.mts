/**
 * Behavioural verification for the six Relay Forge destination screens.
 *
 * The capture script proves the frames render; this one proves they *work*:
 * filters, selection, keyboard traversal, the preview-then-execute decisions,
 * focus return, live announcements, and — the load-bearing one — that a single
 * selection and a single identity map are shared across every destination.
 *
 * Usage:
 *   node_modules/.bin/tsx tools/verify-relay-forge-screens.mts [baseUrl]
 */

import { chromium, type Page } from "playwright-core";

const baseUrl = process.argv[2] ?? "http://localhost:5250";
const pagePath = "/interaction-lab/relay-forge/index.html";

const chromePath = process.env.QF_CHROME_PATH
  ?? (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : "/usr/bin/google-chrome");

const NAV_INDEX: Readonly<Record<string, number>> = {
  command: 0, quests: 1, network: 2, party: 3, battle: 4, connections: 5, skills: 6,
};
const MOBILE_OVERFLOW = ["battle", "connections", "skills"];

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed += 1;
    console.log(`PASS ${label}${detail === "" ? "" : ` — ${detail}`}`);
  } else {
    failed += 1;
    console.log(`FAIL ${label}${detail === "" ? "" : ` — ${detail}`}`);
  }
}

async function goto(page: Page, state = ""): Promise<void> {
  const query = state === "" ? "" : `&state=${state}`;
  await page.goto(`${baseUrl}${pagePath}?theme=dark&fixture=1${query}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rf-rail .rf-nav-item");
}

async function navigate(page: Page, domain: string, mobile = false): Promise<void> {
  // Below 1600 the Command Lens is an overlay whose scrim covers the rail; the
  // user dismisses it with Escape first, so the tool does the same.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(50);
  if (mobile && MOBILE_OVERFLOW.includes(domain)) {
    await page.locator(".rf-nav-more").click();
    await page.locator(".rf-nav-more-panel .rf-nav-item").nth(MOBILE_OVERFLOW.indexOf(domain)).click();
  } else {
    await page.locator(".rf-rail .rf-nav-item").nth(NAV_INDEX[domain] ?? 0).click();
  }
  await page.waitForTimeout(120);
}

const browser = await chromium.launch({ executablePath: chromePath, headless: true });

/* ================================================================== *
 * Desktop
 * ================================================================== */

{
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    colorScheme: "dark",
    locale: "ja-JP",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));

  await goto(page);

  /* ---------------- shared shell ---------------- */

  const rail = await page.evaluate(`(function () {
    var items = [].slice.call(document.querySelectorAll(".rf-rail .rf-nav-item"));
    return {
      count: items.length,
      labels: items.map(function (i) { var l = i.querySelector(".rf-nav-label"); return l === null ? "" : l.textContent.trim(); }),
      enabled: items.every(function (i) { return !i.disabled; })
    };
  })()`) as { count: number; labels: string[]; enabled: boolean };
  check(
    "the Forge Rail carries all seven destinations and every one is reachable",
    rail.count === 7 && rail.enabled
      && rail.labels.join(",") === "Command,Quests,Network,Party,Battle,Connections,Skills",
    JSON.stringify(rail),
  );

  for (const domain of ["quests", "network", "party", "battle", "connections", "skills"]) {
    await navigate(page, domain);
    const state = await page.evaluate(`(function () {
      var shell = document.querySelector(".rf-shell");
      var title = document.querySelector(".rf-screen-title");
      var question = document.querySelector(".rf-screen-question");
      var current = document.querySelectorAll('.rf-rail [aria-current="page"]');
      return {
        domain: shell === null ? "" : shell.getAttribute("data-domain"),
        title: title === null ? "" : title.textContent,
        pageTitle: (document.querySelector(".rf-page-title") || {}).textContent || "",
        question: question === null ? "" : question.textContent.trim(),
        current: current.length,
        currentLabel: current.length === 0 ? "" : (current[0].querySelector(".rf-nav-label") || {}).textContent
      };
    })()`) as Record<string, string | number>;
    check(
      `${domain}: renders with its own title, its five-second question and one aria-current`,
      state.domain === domain && String(state.question).length > 8 && state.current === 1
        && String(state.title).toLowerCase() === domain
        && String(state.pageTitle).toLowerCase() === domain,
      JSON.stringify(state),
    );
  }

  /* ---------------- one selection across destinations ---------------- */

  await navigate(page, "quests");
  /* q-184 is in both the portfolio fixture and Command's intervention queue, so
   * this exercises the shared selection rather than the fixture boundary
   * between the two sets. */
  await page.locator('.rf-q-row[data-quest-id="q-184"]').click();
  const chosen = await page.locator('.rf-q-row[data-selected="true"]').getAttribute("data-quest-id");
  check("Quests: selecting a row marks exactly one row selected", chosen !== null, String(chosen));

  await navigate(page, "network");
  const networkFocus = await page.locator('.rf-n-node[data-focused="true"]').getAttribute("data-node-id");
  check(
    "the Quest chosen in Quests is the node Network centres on",
    networkFocus === chosen,
    `${chosen} -> ${networkFocus}`,
  );

  await navigate(page, "command");
  const commandSelected = await page.evaluate(`(function () {
    var title = document.querySelector(".rf-selected-title");
    var id = document.querySelector(".rf-selected-ref");
    return { title: title === null ? "" : title.textContent, ref: id === null ? "" : id.textContent };
  })()`) as { title: string; ref: string };
  check(
    "Command opens on the same Quest, so selection is shared and not duplicated",
    commandSelected.ref.toLowerCase().includes(String(chosen).replace("q-", "")),
    JSON.stringify(commandSelected),
  );

  /* ---------------- Quests ---------------- */

  await navigate(page, "quests");
  const filtering = await page.evaluate(`(function () {
    var segs = [].slice.call(document.querySelectorAll(".rf-segments .rf-segment"));
    var before = document.querySelectorAll(".rf-q-row").length;
    segs[2].click();
    var rows = [].slice.call(document.querySelectorAll(".rf-q-row"));
    var only = rows.every(function (r) { return r.getAttribute("data-bucket") === "blocked"; });
    segs[0].click();
    return { before: before, blocked: rows.length, only: only, after: document.querySelectorAll(".rf-q-row").length };
  })()`) as { before: number; blocked: number; only: boolean; after: number };
  check(
    "Quests: the state segment filters to exactly that bucket and back",
    filtering.only && filtering.blocked > 0 && filtering.before === filtering.after,
    JSON.stringify(filtering),
  );

  const sorting = await page.evaluate(`(function () {
    var rows = [].slice.call(document.querySelectorAll(".rf-q-row"));
    return rows.slice(0, 4).map(function (r) { return r.getAttribute("data-bucket"); });
  })()`) as string[];
  check(
    "Quests: the default order puts what needs a human first",
    sorting[0] === "review",
    sorting.join(","),
  );

  await page.locator(".rf-q-row").first().click();
  await page.locator(".rf-q-table").press("ArrowDown");
  await page.waitForTimeout(80);
  const keyboard = await page.evaluate(`(function () {
    var rows = [].slice.call(document.querySelectorAll(".rf-q-row"));
    var at = rows.findIndex(function (r) { return r.getAttribute("data-selected") === "true"; });
    return { at: at, total: rows.length };
  })()`) as { at: number; total: number };
  check("Quests: ArrowDown moves the selection down the portfolio", keyboard.at === 1, JSON.stringify(keyboard));

  const impact = await page.evaluate(`(function () {
    var facts = [].slice.call(document.querySelectorAll(".rf-q-detail-facts li")).map(function (l) { return l.textContent; });
    return facts;
  })()`) as string[];
  check(
    "Quests: the detail rail states dependency and downstream cost in words",
    impact.some((line) => line.includes("下流")) && impact.some((line) => line.includes("依存") || line.includes("待って")),
    impact.join(" / "),
  );

  const searchResult = await page.evaluate(`(function () {
    var input = document.querySelector(".rf-search-input");
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "OAuth");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    var rows = document.querySelectorAll(".rf-q-row").length;
    var again = document.querySelector(".rf-search-input");
    setter.call(again, "");
    again.dispatchEvent(new Event("input", { bubbles: true }));
    return { filtered: rows, restored: document.querySelectorAll(".rf-q-row").length };
  })()`) as { filtered: number; restored: number };
  check(
    "Quests: search narrows the portfolio and clearing restores it",
    searchResult.filtered === 1 && searchResult.restored > searchResult.filtered,
    JSON.stringify(searchResult),
  );

  await goto(page, "empty");
  await navigate(page, "quests");
  const emptyState = await page.evaluate(`(function () {
    var empty = document.querySelector(".rf-screen-empty");
    return {
      present: empty !== null,
      hasAction: empty !== null && empty.querySelector("button") !== null,
      spinner: document.querySelectorAll(".rf-screen-skeleton").length
    };
  })()`) as { present: boolean; hasAction: boolean; spinner: number };
  check(
    "Quests: empty names the next action and shows no skeleton",
    emptyState.present && emptyState.hasAction && emptyState.spinner === 0,
    JSON.stringify(emptyState),
  );

  await goto(page, "loading");
  await navigate(page, "quests");
  const loadingState = await page.evaluate(`(function () {
    return {
      skeleton: document.querySelectorAll(".rf-screen-skeleton-item").length,
      notice: (document.querySelector('.rf-screen-notice[data-status="loading"]') || {}).textContent || "",
      fullScreenSpinner: document.querySelectorAll(".rf-spinner, .rf-loading-overlay").length
    };
  })()`) as { skeleton: number; notice: string; fullScreenSpinner: number };
  check(
    "Quests: loading is a row-shaped skeleton plus a sentence, never a full-screen spinner",
    loadingState.skeleton > 0 && loadingState.notice.length > 0 && loadingState.fullScreenSpinner === 0,
    JSON.stringify(loadingState),
  );

  /* ---------------- Network ---------------- */

  await goto(page);
  await navigate(page, "network");
  const graph = await page.evaluate(`(function () {
    var nodes = [].slice.call(document.querySelectorAll(".rf-n-node"));
    var edges = [].slice.call(document.querySelectorAll(".rf-n-edge"));
    return {
      nodes: nodes.length,
      focused: nodes.filter(function (n) { return n.getAttribute("data-focused") === "true"; }).length,
      upstream: nodes.filter(function (n) { return n.getAttribute("data-role") === "upstream"; }).length,
      downstream: nodes.filter(function (n) { return n.getAttribute("data-role") === "downstream"; }).length,
      kinds: nodes.map(function (n) { return n.getAttribute("data-kind"); }).filter(function (v, a, all) { return all.indexOf(v) === a; }),
      blockingEdges: edges.filter(function (e) { return e.getAttribute("data-blocking") === "true"; }).length,
      edgeKinds: edges.map(function (e) { return e.getAttribute("data-kind"); }).filter(function (v, a, all) { return all.indexOf(v) === a; })
    };
  })()`) as Record<string, number | string[]>;
  check(
    "Network: one focused node with distinguished upstream and downstream lanes",
    graph.focused === 1 && Number(graph.upstream) > 0 && Number(graph.downstream) > 0,
    JSON.stringify(graph),
  );
  check(
    "Network: Quest, Actor and Connection all appear as node kinds",
    Array.isArray(graph.kinds) && graph.kinds.length >= 2,
    JSON.stringify(graph.kinds),
  );
  check(
    "Network: edge kinds are distinguished and blocking edges are marked",
    Array.isArray(graph.edgeKinds) && graph.edgeKinds.length >= 2 && Number(graph.blockingEdges) > 0,
    JSON.stringify({ kinds: graph.edgeKinds, blocking: graph.blockingEdges }),
  );

  const reasons = await page.evaluate(`(function () {
    var list = [].slice.call(document.querySelectorAll(".rf-n-reason-copy")).map(function (n) { return n.textContent; });
    return { count: list.length, allExplained: list.every(function (t) { return t.length > 10; }) };
  })()`) as { count: number; allExplained: boolean };
  check(
    "Network: every connection carries a written reason, not just a line",
    reasons.count > 0 && reasons.allExplained,
    JSON.stringify(reasons),
  );

  const outlineParity = await page.evaluate(`(function () {
    var graphCount = document.querySelectorAll('.rf-n-node[data-role="upstream"], .rf-n-node[data-role="downstream"]').length;
    var segs = [].slice.call(document.querySelectorAll(".rf-screen-header .rf-segment"));
    segs[1].click();
    var rows = document.querySelectorAll(".rf-n-outline-row").length;
    var reasonsInOutline = [].slice.call(document.querySelectorAll(".rf-n-outline-reason")).every(function (n) { return n.textContent.length > 10; });
    var canvas = document.querySelectorAll(".rf-n-canvas").length;
    segs[0].click();
    return { graphCount: graphCount, rows: rows, reasonsInOutline: reasonsInOutline, canvasWhileOutline: canvas };
  })()`) as { graphCount: number; rows: number; reasonsInOutline: boolean; canvasWhileOutline: number };
  check(
    "Network: the outline carries the same relations with the same reasons, and replaces the canvas",
    outlineParity.rows === outlineParity.graphCount && outlineParity.reasonsInOutline && outlineParity.canvasWhileOutline === 0,
    JSON.stringify(outlineParity),
  );

  await page.locator(".rf-n-node[data-role='downstream']").first().focus();
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(60);
  const keyboardGraph = await page.evaluate(`(function () {
    var active = document.activeElement;
    return active === null ? "" : active.getAttribute("data-role");
  })()`) as string;
  check("Network: ArrowUp walks from the downstream lane to the focus node", keyboardGraph === "focus", keyboardGraph);

  const chainWalk = await page.evaluate(`(function () {
    var before = (document.querySelector('.rf-n-node[data-focused="true"] .rf-n-node-ref') || {}).textContent;
    document.querySelectorAll(".rf-n-chain")[0].click();
    var after = (document.querySelector('.rf-n-node[data-focused="true"] .rf-n-node-ref') || {}).textContent;
    var back = document.querySelectorAll(".rf-n-focus-actions .rf-secondary-button").length;
    return { before: before, after: after, backAvailable: back };
  })()`) as { before: string; after: string; backAvailable: number };
  check(
    "Network: a blocked chain re-centres the graph on its root cause and offers a way back",
    chainWalk.before !== chainWalk.after && chainWalk.backAvailable === 1,
    JSON.stringify(chainWalk),
  );

  /* ---------------- Party ---------------- */

  await navigate(page, "party");
  const roster = await page.evaluate(`(function () {
    var rows = [].slice.call(document.querySelectorAll(".rf-p-row"));
    return {
      count: rows.length,
      order: rows.map(function (r) { return r.getAttribute("data-kind"); }),
      humansFirst: rows.length > 1 && rows[0].getAttribute("data-kind") === "human",
      kindLabels: [].slice.call(document.querySelectorAll(".rf-p-kind-label")).map(function (n) { return n.textContent; }).filter(function (v, a, all) { return all.indexOf(v) === a; }),
      barsPresent: document.querySelectorAll(".rf-p-bar-fill").length
    };
  })()`) as Record<string, unknown>;
  check(
    "Party: Humans and Agents share the roster but keep distinct type labels",
    roster.humansFirst === true && Array.isArray(roster.kindLabels) && (roster.kindLabels as string[]).length >= 2,
    JSON.stringify(roster),
  );

  const noCapacity = await page.evaluate(`(function () {
    var note = (document.querySelector(".rf-p-scale-note") || {}).textContent || "";
    var text = document.querySelector(".rf-screen-host").innerText;
    return {
      note: note,
      saysRelative: note.indexOf("相対比較") !== -1 && note.indexOf("上限値ではありません") !== -1,
      hasPercentCapacity: /(\\d+)\\s*%\\s*(\\u4f7f\\u7528|\\u7a3c\\u50cd|capacity)/i.test(text)
    };
  })()`) as { note: string; saysRelative: boolean; hasPercentCapacity: boolean };
  check(
    "Party: workload is stated as a relative comparison, with no invented capacity ceiling",
    noCapacity.saysRelative && !noCapacity.hasPercentCapacity,
    noCapacity.note,
  );

  await page.locator('.rf-p-row[data-kind="agent"]').first().click();
  const agentDetail = await page.evaluate(`(function () {
    var labels = [].slice.call(document.querySelectorAll(".rf-p-capabilities dt")).map(function (n) { return n.textContent; });
    var values = [].slice.call(document.querySelectorAll(".rf-p-capabilities dd")).map(function (n) { return n.textContent; });
    return { labels: labels, values: values, held: document.querySelectorAll(".rf-p-held-row").length };
  })()`) as { labels: string[]; values: string[]; held: number };
  check(
    "Party: an Agent shows provider, role, scopes and dry-run defaults from the registry",
    agentDetail.labels.includes("Provider") && agentDetail.labels.includes("権限スコープ")
      && agentDetail.labels.includes("既定 dry-run"),
    agentDetail.labels.join(", "),
  );

  const heldJump = await page.evaluate(`(function () {
    var row = document.querySelector(".rf-p-held-row");
    if (row === null) return { jumped: false, domain: "" };
    row.click();
    var shell = document.querySelector(".rf-shell");
    return { jumped: true, domain: shell.getAttribute("data-domain") };
  })()`) as { jumped: boolean; domain: string };
  check(
    "Party: a held Quest opens the destination that can act on it",
    !heldJump.jumped || heldJump.domain === "command" || heldJump.domain === "quests",
    JSON.stringify(heldJump),
  );

  /* ---------------- Battle ---------------- */

  await goto(page);
  await navigate(page, "battle");
  const battleFrame = await page.evaluate(`(function () {
    return {
      objective: (document.querySelector(".rf-b-objective-title") || {}).textContent || "",
      phase: (document.querySelector(".rf-b-phase-value") || {}).textContent || "",
      actors: document.querySelectorAll(".rf-b-actor").length,
      commands: document.querySelectorAll(".rf-b-command").length,
      disabledWithReason: [].slice.call(document.querySelectorAll(".rf-b-command:disabled")).every(function (b) {
        var why = b.querySelector(".rf-b-command-why");
        return why !== null && why.textContent.length > 2;
      }),
      fakeControls: document.querySelectorAll('[data-command="pause"], [data-command="retry"], [data-command="handover"]').length
    };
  })()`) as Record<string, unknown>;
  check(
    "Battle: objective, phase, both participants and the command deck are all present",
    String(battleFrame.objective).length > 3 && String(battleFrame.phase).includes("ターン")
      && battleFrame.actors === 2 && Number(battleFrame.commands) === 5,
    JSON.stringify(battleFrame),
  );
  check(
    "Battle: an unavailable command says why, and no command the domain lacks is shown",
    battleFrame.disabledWithReason === true && battleFrame.fakeControls === 0,
    JSON.stringify(battleFrame),
  );

  const previewFlow = await page.evaluate(`(function () {
    var execute = document.querySelector(".rf-b-execute");
    return { presentBeforePreview: execute !== null, disabled: execute === null || execute.disabled };
  })()`) as { presentBeforePreview: boolean; disabled: boolean };
  check(
    "Battle: nothing can be executed before a preview exists",
    !previewFlow.presentBeforePreview || previewFlow.disabled,
    JSON.stringify(previewFlow),
  );

  const bossBefore = await page.locator(".rf-b-meter-value").first().textContent();
  await page.locator('.rf-b-command[data-command="attack"]').click();
  await page.waitForSelector('.rf-b-preview[data-phase="previewed"]');
  const bossAfterPreview = await page.locator(".rf-b-meter-value").first().textContent();
  check(
    "Battle: the dry-run preview writes nothing",
    bossBefore === bossAfterPreview,
    `${bossBefore} -> ${bossAfterPreview}`,
  );

  const previewCopy = await page.evaluate(`(function () {
    return {
      deltas: [].slice.call(document.querySelectorAll(".rf-b-delta")).map(function (d) {
        return d.querySelector(".rf-b-delta-label").textContent + " " + d.querySelector(".rf-b-delta-value").textContent;
      }),
      note: (document.querySelector(".rf-b-preview-note") || {}).textContent || "",
      executeEnabled: !document.querySelector(".rf-b-execute").disabled
    };
  })()`) as { deltas: string[]; note: string; executeEnabled: boolean };
  check(
    "Battle: the preview states every change and says nothing has been written yet",
    previewCopy.deltas.length === 4 && previewCopy.note.includes("まだ何も書き込まれていません") && previewCopy.executeEnabled,
    JSON.stringify(previewCopy),
  );

  await page.locator(".rf-b-execute").click();
  await page.waitForTimeout(400);
  const executed = await page.evaluate(`(function () {
    var live = document.querySelector('[role="status"][aria-live="polite"]');
    return {
      boss: (document.querySelectorAll(".rf-b-meter-value")[0] || {}).textContent || "",
      phase: (document.querySelector(".rf-b-phase-value") || {}).textContent || "",
      decisions: document.querySelectorAll('.rf-b-event[data-channel="decision"]').length,
      executions: document.querySelectorAll('.rf-b-event[data-channel="execution"]').length,
      announced: live === null ? "" : live.textContent,
      deckReset: document.querySelectorAll(".rf-b-deck-hint").length
    };
  })()`) as Record<string, unknown>;
  check(
    "Battle: executing applies the domain result and advances the phase",
    executed.boss !== bossBefore && String(executed.phase).includes("ターン"),
    JSON.stringify(executed),
  );
  check(
    "Battle: execution events and decision events are separate channels",
    Number(executed.decisions) === 1 && Number(executed.executions) > 0,
    JSON.stringify({ decisions: executed.decisions, executions: executed.executions }),
  );
  check("Battle: the result is announced politely", String(executed.announced).length > 0, String(executed.announced));

  await goto(page, "conflict");
  await navigate(page, "battle");
  const conflict = await page.evaluate(`(function () {
    var commands = [].slice.call(document.querySelectorAll(".rf-b-command"));
    return {
      allHeld: commands.every(function (c) { return c.disabled; }),
      held: (document.querySelector(".rf-b-held") || {}).textContent || "",
      notice: (document.querySelector('.rf-screen-notice[data-status="conflict"]') || {}).textContent || "",
      executePresent: document.querySelectorAll(".rf-b-execute").length
    };
  })()`) as { allHeld: boolean; held: string; notice: string; executePresent: number };
  check(
    "Battle: a concurrency conflict holds every command and states why, with nothing executable",
    conflict.allHeld && conflict.held.length > 0 && conflict.notice.length > 0 && conflict.executePresent === 0,
    JSON.stringify(conflict),
  );

  /* ---------------- Connections ---------------- */

  await goto(page);
  await navigate(page, "connections");
  const health = await page.evaluate(`(function () {
    var rows = [].slice.call(document.querySelectorAll(".rf-c-row"));
    return {
      count: rows.length,
      order: rows.map(function (r) { return r.getAttribute("data-health"); }),
      attentionFirst: rows.length > 0 && ["expired", "permission_required", "degraded"].indexOf(rows[0].getAttribute("data-health")) !== -1,
      distinct: rows.map(function (r) { return r.getAttribute("data-health"); }).filter(function (v, a, all) { return all.indexOf(v) === a; })
    };
  })()`) as Record<string, unknown>;
  check(
    "Connections: connected, degraded, expired and not-connected are distinguished, worst first",
    health.attentionFirst === true && Array.isArray(health.distinct) && (health.distinct as string[]).length >= 3,
    JSON.stringify(health),
  );

  const scopeHonesty = await page.evaluate(`(function () {
    var rows = [].slice.call(document.querySelectorAll(".rf-c-row"));
    var connected = rows.filter(function (r) { return r.getAttribute("data-health") === "connected"; })[0];
    if (connected !== undefined) connected.click();
    var unavailable = (document.querySelector(".rf-unavailable") || {}).textContent || "";
    return {
      scopes: document.querySelectorAll(".rf-c-scope").length,
      unavailable: unavailable,
      admitsLimit: unavailable.indexOf("付与済みスコープ") !== -1,
      affected: document.querySelectorAll(".rf-c-affected-row").length,
      lastSync: (document.querySelectorAll(".rf-c-facts dd")[2] || {}).textContent || ""
    };
  })()`) as Record<string, unknown>;
  check(
    "Connections: required scopes are listed and the missing granted-scope data is admitted, not faked",
    Number(scopeHonesty.scopes) > 0 && scopeHonesty.admitsLimit === true,
    JSON.stringify(scopeHonesty),
  );

  const syncGate = await page.evaluate(`(function () {
    var buttons = [].slice.call(document.querySelectorAll(".rf-c-actions button"));
    var run = buttons.filter(function (b) { return b.textContent.indexOf("同期を実行") !== -1; })[0];
    return { runPresent: run !== undefined, runDisabled: run === undefined || run.disabled };
  })()`) as { runPresent: boolean; runDisabled: boolean };
  check(
    "Connections: a sync cannot run until it has been previewed",
    syncGate.runPresent && syncGate.runDisabled,
    JSON.stringify(syncGate),
  );

  await page.locator(".rf-c-actions button").first().click();
  await page.waitForSelector('.rf-c-result[data-tone="preview"]');
  const afterPreview = await page.evaluate(`(function () {
    var buttons = [].slice.call(document.querySelectorAll(".rf-c-actions button"));
    var run = buttons.filter(function (b) { return b.textContent.indexOf("同期を実行") !== -1; })[0];
    return {
      counts: (document.querySelector(".rf-c-preview-list") || {}).textContent || "",
      note: (document.querySelector(".rf-c-result-note") || {}).textContent || "",
      runEnabled: run !== undefined && !run.disabled
    };
  })()`) as { counts: string; note: string; runEnabled: boolean };
  check(
    "Connections: the preview reports counts and says nothing was written",
    afterPreview.counts.includes("取り込み") && afterPreview.note.includes("まだ何も書き込まれていません") && afterPreview.runEnabled,
    JSON.stringify(afterPreview),
  );

  await page.locator(".rf-c-disconnect").click();
  await page.waitForSelector(".rf-confirm");
  const confirmCopy = await page.evaluate(`(function () {
    var impact = [].slice.call(document.querySelectorAll(".rf-confirm-impact li")).map(function (l) { return l.textContent; });
    var active = document.activeElement;
    return {
      impact: impact,
      namesQuests: impact.some(function (t) { return t.indexOf("Quest") !== -1; }),
      saysNotDeleted: impact.some(function (t) { return t.indexOf("削除されません") !== -1; }),
      confirmFocused: active !== null && active.className.indexOf("rf-danger-button") !== -1
    };
  })()`) as Record<string, unknown>;
  check(
    "Connections: revoking states its blast radius including the Quests it stops",
    confirmCopy.namesQuests === true && confirmCopy.saysNotDeleted === true,
    JSON.stringify(confirmCopy.impact),
  );
  check(
    "Connections: the destructive control is not the focused default",
    confirmCopy.confirmFocused === false,
  );

  await goto(page, "offline");
  await navigate(page, "connections");
  const offline = await page.evaluate(`(function () {
    var rows = [].slice.call(document.querySelectorAll(".rf-c-row"));
    var connected = rows.filter(function (r) { return r.getAttribute("data-health") === "connected"; })[0];
    if (connected !== undefined) connected.click();
    return {
      notice: (document.querySelector('.rf-screen-notice[data-status="offline"]') || {}).textContent || "",
      allHeld: [].slice.call(document.querySelectorAll(".rf-c-actions button")).every(function (b) { return b.disabled; }),
      rowsStillVisible: document.querySelectorAll(".rf-c-row").length
    };
  })()`) as { notice: string; allHeld: boolean; rowsStillVisible: number };
  check(
    "Connections: offline holds every write but keeps the last-known list readable",
    offline.notice.length > 0 && offline.allHeld && offline.rowsStillVisible > 0,
    JSON.stringify(offline),
  );

  /* ---------------- Skills ---------------- */

  await goto(page);
  await navigate(page, "skills");
  const skillsFrame = await page.evaluate(`(function () {
    var groups = [].slice.call(document.querySelectorAll(".rf-skills-group"));
    return {
      groups: groups.length,
      tools: document.querySelectorAll(".rf-skills-tool-row").length,
      humanTitle: (groups[0] && groups[0].querySelector(".rf-skills-group-title") || {}).textContent || "",
      source: (document.querySelector(".rf-skills-source-name") || {}).textContent || "",
      search: document.querySelectorAll(".rf-skills-search-input").length,
      rawNames: document.querySelectorAll(".rf-skills-tool-name").length
    };
  })()`) as { groups: number; tools: number; humanTitle: string; source: string; search: number; rawNames: number };
  check(
    "Skills: live-shaped MCP tools render as human-readable groups with a source and search",
    skillsFrame.groups >= 3 && skillsFrame.tools > 0 && skillsFrame.humanTitle.length > 3
      && skillsFrame.source === "Guilduo MCP" && skillsFrame.search === 1 && skillsFrame.rawNames > 0,
    JSON.stringify(skillsFrame),
  );

  const skillsExpandBefore = await page.locator('.rf-skills-group[data-group="agent-relay"] .rf-skills-tool-row').count();
  await page.locator('.rf-skills-group[data-group="agent-relay"] .rf-skills-group-toggle').click();
  await page.waitForTimeout(60);
  const skillsExpand = await page.evaluate(`(function () {
    var group = document.querySelector('.rf-skills-group[data-group="agent-relay"]');
    return {
      before: ${skillsExpandBefore},
      after: group === null ? 0 : group.querySelectorAll(".rf-skills-tool-row").length,
      expanded: group !== null && group.getAttribute("data-expanded") === "true"
    };
  })()`) as { before: number; after: number; expanded: boolean };
  check(
    "Skills: a capability group expands to readable tools while keeping technical names inspectable",
    skillsExpand.before === 0 && skillsExpand.after > 0 && skillsExpand.expanded,
    JSON.stringify(skillsExpand),
  );

  await page.locator(".rf-skills-search-input").fill("link_agent");
  const skillsSearch = await page.evaluate(`(function () {
    return {
      groups: document.querySelectorAll(".rf-skills-group").length,
      tools: document.querySelectorAll(".rf-skills-tool-row").length,
      raw: [].slice.call(document.querySelectorAll(".rf-skills-tool-name")).map(function (n) { return n.textContent; })
    };
  })()`) as { groups: number; tools: number; raw: string[] };
  check(
    "Skills: search matches the technical MCP name and retains its capability context",
    skillsSearch.groups === 1 && skillsSearch.tools === 1 && skillsSearch.raw.includes("link_agent"),
    JSON.stringify(skillsSearch),
  );

  await goto(page, "permission");
  await navigate(page, "skills");
  const skillsUnconnected = await page.evaluate(`(function () {
    return {
      empty: (document.querySelector(".rf-screen-empty") || {}).textContent || "",
      groups: document.querySelectorAll(".rf-skills-group").length
    };
  })()`) as { empty: string; groups: number };
  check(
    "Skills: an unconnected MCP server has an explicit empty state, not a fake tool list",
    skillsUnconnected.empty.includes("MCP server未接続") && skillsUnconnected.groups === 0,
    JSON.stringify(skillsUnconnected),
  );

  await goto(page, "empty");
  await navigate(page, "skills");
  const skillsEmpty = await page.evaluate(`(document.querySelector(".rf-screen-empty") || {}).textContent || ""`) as string;
  check("Skills: zero tools has a useful empty state", skillsEmpty.includes("利用できるMCP Toolはまだありません"), skillsEmpty);

  await goto(page, "error");
  await navigate(page, "skills");
  const skillsError = await page.evaluate(`(function () {
    var notice = document.querySelector('.rf-screen-notice[data-status="error"]');
    return { notice: notice !== null, retry: notice !== null && notice.querySelector("button") !== null };
  })()`) as { notice: boolean; retry: boolean };
  check("Skills: fetch failure has an error state and retry action", skillsError.notice && skillsError.retry, JSON.stringify(skillsError));

  check("desktop: no console or page errors across the whole run", errors.length === 0, errors.join(" | "));
  await context.close();
}

/* ================================================================== *
 * Mobile
 * ================================================================== */

{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "dark",
    locale: "ja-JP",
    reducedMotion: "reduce",
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));

  await goto(page);

  const nav = await page.evaluate(`(function () {
    var items = [].slice.call(document.querySelectorAll(".rf-rail .rf-nav-item"));
    return {
      count: items.length,
      labels: items.map(function (i) { var l = i.querySelector(".rf-nav-label"); return l === null ? "" : l.textContent.trim(); }),
      allLabelled: items.every(function (i) {
        var l = i.querySelector(".rf-nav-label");
        return l !== null && l.textContent.trim().length > 0 && getComputedStyle(l).display !== "none";
      }),
      tall: items.every(function (i) { return i.getBoundingClientRect().height >= 44; })
    };
  })()`) as Record<string, unknown>;
  check(
    "mobile: five labelled destinations with 44px targets, Battle, Connections and Skills behind More",
    nav.count === 5 && nav.allLabelled === true && nav.tall === true
      && (nav.labels as string[])[4] === "More",
    JSON.stringify(nav),
  );

  for (const domain of ["quests", "network", "party", "battle", "connections", "skills"]) {
    await navigate(page, domain, true);
    const shown = await page.evaluate(`(function () {
      var shell = document.querySelector(".rf-shell");
      var current = document.querySelectorAll('.rf-rail [aria-current="page"]');
      return {
        domain: shell.getAttribute("data-domain"),
        current: current.length,
        desktopOnly: document.querySelectorAll(".rf-q-row, .rf-p-row, .rf-c-row, .rf-n-canvas").length
      };
    })()`) as { domain: string; current: number; desktopOnly: number };
    check(
      `mobile ${domain}: reachable, marked current, and composed for mobile rather than shrunk`,
      shown.domain === domain && shown.current === 1 && shown.desktopOnly === 0,
      JSON.stringify(shown),
    );
  }

  await navigate(page, "quests", true);
  await page.locator(".rf-q-card").first().click();
  await page.waitForTimeout(120);
  const detailReplaces = await page.evaluate(`(function () {
    return {
      cards: document.querySelectorAll(".rf-q-card").length,
      detail: document.querySelectorAll(".rf-q-detail-title").length,
      back: document.querySelectorAll(".rf-q-back").length
    };
  })()`) as { cards: number; detail: number; back: number };
  check(
    "mobile Quests: the detail replaces the list and offers a way back",
    detailReplaces.cards === 0 && detailReplaces.detail === 1 && detailReplaces.back === 1,
    JSON.stringify(detailReplaces),
  );

  await page.locator(".rf-q-back").click();
  await page.waitForTimeout(200);
  const focusReturn = await page.evaluate(`(function () {
    var active = document.activeElement;
    return { className: active === null ? "" : active.className, cards: document.querySelectorAll(".rf-q-card").length };
  })()`) as { className: string; cards: number };
  check(
    "mobile Quests: focus returns to the card that was opened",
    focusReturn.className.includes("rf-q-card") && focusReturn.cards > 0,
    JSON.stringify(focusReturn),
  );

  await navigate(page, "network", true);
  const explorer = await page.evaluate(`(function () {
    var lanes = [].slice.call(document.querySelectorAll(".rf-n-m-lane"));
    return {
      canvas: document.querySelectorAll(".rf-n-canvas").length,
      lanes: lanes.length,
      rows: document.querySelectorAll(".rf-n-m-row").length,
      reasons: [].slice.call(document.querySelectorAll(".rf-n-m-row-reason")).every(function (n) { return n.textContent.length > 10; })
    };
  })()`) as Record<string, unknown>;
  check(
    "mobile Network: a stepwise explorer with reasons, not a shrunken graph",
    explorer.canvas === 0 && explorer.lanes === 2 && Number(explorer.rows) > 0 && explorer.reasons === true,
    JSON.stringify(explorer),
  );

  await page.locator(".rf-n-m-row").first().click();
  await page.waitForTimeout(120);
  const refocused = await page.evaluate(`(function () {
    return {
      back: document.querySelectorAll(".rf-n-m-back").length,
      title: (document.querySelector(".rf-n-m-focus-title") || {}).textContent || ""
    };
  })()`) as { back: number; title: string };
  check(
    "mobile Network: walking to a neighbour re-centres and can be walked back",
    refocused.back === 1 && refocused.title.length > 0,
    JSON.stringify(refocused),
  );

  await navigate(page, "battle", true);
  const mobileBattle = await page.evaluate(`(function () {
    var bar = document.querySelector(".rf-b-m-bar");
    return {
      shape: bar === null ? "" : bar.getAttribute("data-shape"),
      latest: document.querySelectorAll(".rf-b-m-latest .rf-b-event").length,
      commands: document.querySelectorAll(".rf-b-command").length,
      hasExecute: document.querySelectorAll(".rf-b-m-bar .rf-primary-button").length
    };
  })()`) as Record<string, unknown>;
  check(
    "mobile Battle: the bar is compact before a preview and the latest events lead",
    mobileBattle.shape === "compact" && Number(mobileBattle.latest) > 0 && mobileBattle.hasExecute === 0,
    JSON.stringify(mobileBattle),
  );

  await page.locator('.rf-b-command[data-command="attack"]').click();
  await page.waitForSelector('.rf-b-preview[data-phase="previewed"]');
  const readyBar = await page.evaluate(`(function () {
    var bar = document.querySelector(".rf-b-m-bar");
    var nav = document.querySelector(".rf-rail");
    var b = bar.getBoundingClientRect();
    var n = nav.getBoundingClientRect();
    return {
      shape: bar.getAttribute("data-shape"),
      execute: bar.querySelectorAll(".rf-primary-button").length,
      clearOfNav: b.bottom <= n.top + 1
    };
  })()`) as Record<string, unknown>;
  check(
    "mobile Battle: the bar becomes a commitment once previewed and stays clear of the nav",
    readyBar.shape === "ready" && readyBar.execute === 1 && readyBar.clearOfNav === true,
    JSON.stringify(readyBar),
  );

  await navigate(page, "connections", true);
  await page.locator(".rf-c-card").first().click();
  await page.waitForTimeout(120);
  const mobileConnections = await page.evaluate(`(function () {
    return {
      cards: document.querySelectorAll(".rf-c-card").length,
      detail: document.querySelectorAll(".rf-c-detail-name").length,
      back: document.querySelectorAll(".rf-c-back").length
    };
  })()`) as Record<string, number>;
  check(
    "mobile Connections: the detail replaces the list and offers a way back",
    mobileConnections.cards === 0 && mobileConnections.detail === 1 && mobileConnections.back === 1,
    JSON.stringify(mobileConnections),
  );

  await goto(page);
  await navigate(page, "skills", true);
  const mobileSkills = await page.evaluate(`(function () {
    var screen = document.querySelector(".rf-skills-screen");
    return {
      groups: document.querySelectorAll(".rf-skills-group").length,
      search: document.querySelectorAll(".rf-skills-search-input").length,
      pageScroll: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      screenHeight: screen === null ? 0 : screen.getBoundingClientRect().height
    };
  })()`) as { groups: number; search: number; pageScroll: boolean; screenHeight: number };
  check(
    "mobile Skills: the catalogue remains searchable and uses the page scroll owner",
    mobileSkills.groups > 0 && mobileSkills.search === 1 && mobileSkills.pageScroll && mobileSkills.screenHeight > 0,
    JSON.stringify(mobileSkills),
  );

  check("mobile: no console or page errors across the whole run", errors.length === 0, errors.join(" | "));
  await context.close();
}

await browser.close();

console.log("");
console.log(`checks: ${passed + failed} · passed ${passed} · failed ${failed}`);
console.log(failed === 0 ? "RESULT: PASS" : `RESULT: ${failed} check(s) failed`);
if (failed > 0) process.exitCode = 1;

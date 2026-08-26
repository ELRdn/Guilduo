/**
 * Behavioural verification for the Relay Forge Command screen.
 *
 * The capture script proves geometry and typography; this one proves the
 * interactions the brief lists under VALIDATION actually work: selection sync,
 * the Review / Decide split, header clipping, avatar fallback, keyboard
 * navigation, and the mobile bottom sheet's focus contract.
 *
 * Usage:
 *   node_modules/.bin/tsx tools/verify-relay-forge-command.mts [baseUrl]
 */

import { chromium, type Browser, type Page } from "playwright-core";

const baseUrl = process.argv[2] ?? "http://localhost:5173";
const pagePath = "/interaction-lab/relay-forge/index.html?theme=dark";

const chromePath = process.env.QF_CHROME_PATH
  ?? (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : "/usr/bin/google-chrome");

const results: string[] = [];
let failures = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failures += 1;
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail === "" ? "" : ` — ${detail}`}`);
}

async function openPage(browser: Browser, width: number, height: number): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") check("console clean", false, message.text());
  });
  page.on("pageerror", (error) => check("no page error", false, error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) check("no HTTP 4xx/5xx", false, `${response.status()} ${response.url()}`);
  });
  await page.goto(`${baseUrl}${pagePath}`, { waitUntil: "networkidle" });
  // Desktop and mobile render different Shelf DOM; wait for the one in play.
  await page.waitForSelector(width <= 900 ? ".rf-m-page" : ".rf-shelf-card");
  return page;
}

/** Every surface that shows the selected Quest must agree at once. */
async function selectionState(page: Page): Promise<Record<string, string>> {
  return page.evaluate(`(function () {
    var text = function (s) { var e = document.querySelector(s); return e === null ? "" : (e.textContent || "").trim(); };
    var shelf = document.querySelector('.rf-shelf-card[data-selected="true"]');
    var hub = document.querySelector('.rf-spine-row[data-relation="hub"]');
    return {
      shelf: shelf === null ? "" : shelf.getAttribute("data-quest-id") || "",
      hub: hub === null ? "" : hub.getAttribute("data-quest-id") || "",
      centre: text(".rf-selected-ref"),
      lens: text(".rf-lens-ref"),
      chronicle: text(".rf-chronicle-latest .rf-chronicle-object")
    };
  })()`);
}

async function verifyDesktop(browser: Browser): Promise<void> {
  const page = await openPage(browser, 1920, 1080);

  // --- selection sync from the Attention Shelf ---
  await page.locator('.rf-shelf-card[data-severity="waiting"]').click();
  await page.waitForTimeout(80);
  let state = await selectionState(page);
  check(
    "Shelf selection syncs Shelf / Loom hub / centre / Lens",
    state.shelf === "q-190" && state.hub === "q-190" && state.centre === "QF-190" && state.lens === "QF-190",
    JSON.stringify(state),
  );

  // --- selection sync from the Quest Loom ---
  await page.locator('.rf-spine-row[data-quest-id="q-191"]').click();
  await page.waitForTimeout(80);
  state = await selectionState(page);
  check(
    "Loom selection syncs every surface",
    state.shelf === "q-191" && state.hub === "q-191" && state.centre === "QF-191" && state.lens === "QF-191",
    JSON.stringify(state),
  );

  // --- A3: the header must be fully visible after a selection change ---
  const afterSelect = await page.evaluate(`(function () {
    var scroll = document.querySelector(".rf-selected-scroll");
    var region = document.querySelector(".rf-selected");
    var title = document.querySelector(".rf-selected-title");
    if (scroll === null || region === null || title === null) return null;
    return {
      scrollTop: Math.round(scroll.scrollTop),
      clipped: title.getBoundingClientRect().top < region.getBoundingClientRect().top - 0.5
    };
  })()`) as { scrollTop: number; clipped: boolean } | null;
  check(
    "selection resets workspace scroll and never clips the title",
    afterSelect !== null && afterSelect.scrollTop === 0 && !afterSelect.clipped,
    JSON.stringify(afterSelect),
  );

  // --- back to the review Quest for the remaining checks ---
  await page.locator('.rf-shelf-card[data-severity="review"]').click();
  await page.waitForTimeout(80);

  // --- A4: Approve handoff exists only in the Lens ---
  const approveInCentre = await page.locator(".rf-selected .rf-decision-approve").count();
  const approveInLens = await page.locator(".rf-lens .rf-decision-approve").count();
  check("Approve handoff lives only in the Lens", approveInCentre === 0 && approveInLens === 1);

  // --- A5: Review output opens the preview, and closing returns focus ---
  await page.locator(".rf-review-button").click();
  await page.waitForTimeout(80);
  check("Review output opens the Output preview", await page.locator(".rf-preview").count() === 1);
  check(
    "preview focus lands on its close control",
    await page.evaluate(`document.activeElement === null ? "" : document.activeElement.className`) === "rf-quiet-button rf-preview-close",
  );
  await page.locator(".rf-preview-close").click();
  await page.waitForTimeout(80);
  check("closing the preview returns focus to Review output", await page.evaluate(
    `document.activeElement === null ? "" : (document.activeElement.className || "").indexOf("rf-review-button") >= 0`,
  ) === true);

  // --- A4: Request revision moves focus into the Lens decision, runs nothing ---
  await page.locator(".rf-selected .rf-secondary-button").first().click();
  await page.waitForTimeout(80);
  check("Request revision focuses the Lens revision field", await page.evaluate(
    `(function () { var a = document.activeElement; return a !== null && a.classList.contains("rf-revision-input"); })()`,
  ) === true);
  check("Request revision runs no command by itself",
    await page.locator('.rf-decision-result').count() === 0);
  // Cancel so the following checks see the normal decision actions.
  await page.locator(".rf-revision .rf-secondary-button").click();
  await page.waitForTimeout(80);

  // --- Approve handoff enable / disable comes from the domain state ---
  await page.locator('.rf-shelf-card[data-severity="review"]').click();
  await page.waitForTimeout(80);
  // Approve stays gated until the output is reviewed; the Handoff section below
  // exercises the full unlock path.
  check("Approve handoff starts gated on a reviewable Quest",
    await page.locator(".rf-decision-approve").isDisabled() === true);
  await page.locator('.rf-shelf-card[data-severity="blocked"]').click();
  await page.waitForTimeout(80);
  check("Approve handoff disabled upstream-blocked, with a reason",
    await page.locator(".rf-decision-approve").isDisabled() === true
    && await page.locator(".rf-decision-blocked").count() === 1);

  // --- stale locks writes ---
  await page.locator('.rf-capacity-slot[data-slot="health"]').click();
  await page.waitForTimeout(80);
  check("stale state locks Approve handoff",
    await page.locator(".rf-decision-approve").isDisabled() === true);
  await page.locator('.rf-capacity-slot[data-slot="health"]').click();
  await page.waitForTimeout(80);

  // --- Handoff Command: approve runs a dry run then executes ---
  await page.locator('.rf-shelf-card[data-severity="review"]').click();
  await page.waitForTimeout(80);
  check("Approve is gated until the output is reviewed",
    await page.locator(".rf-decision-approve").isDisabled() === true
    && (await page.locator(".rf-decision-blocked").textContent())?.includes("Evidence") === true);
  await page.locator(".rf-review-button").click();
  await page.waitForTimeout(120);
  check("Approve unlocks after Review output", await page.locator(".rf-decision-approve").isDisabled() === false);
  check("verification summary is shown once approval is possible",
    (await page.locator(".rf-decision-verified").textContent())?.includes("verified") === true);

  await page.locator(".rf-decision-approve").click();
  await page.waitForTimeout(500);
  const approved = await page.evaluate(`(function () {
    var result = document.querySelector('.rf-decision-result[data-tone="success"]');
    var live = document.querySelector('[role="status"][aria-live="polite"]');
    return {
      success: result !== null,
      message: result === null ? "" : (result.textContent || "").trim(),
      announced: live === null ? "" : (live.textContent || "").trim(),
      shelf: document.querySelectorAll(".rf-shelf-card").length,
      chronicleTop: (document.querySelector(".rf-chronicle-latest .rf-chronicle-object") || {}).textContent || ""
    };
  })()`) as { success: boolean; message: string; announced: string; shelf: number; chronicleTop: string };
  check(
    "Approve applies the server result to Shelf, Chronicle and Capacity",
    approved.success && approved.shelf === 2 && approved.chronicleTop.includes("QF-184"),
    JSON.stringify(approved),
  );
  check("decision result is announced politely", approved.announced.length > 0, approved.announced);

  // --- conflict: expectedState mismatch is surfaced, nothing is applied ---
  await page.goto(`${baseUrl}${pagePath}&state=conflict`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rf-shelf-card");
  await page.locator('.rf-shelf-card[data-severity="review"]').click();
  await page.locator(".rf-review-button").click();
  await page.waitForTimeout(120);
  check("concurrency conflict blocks the decision before any write",
    await page.locator(".rf-decision-approve").isDisabled() === true
    && (await page.locator(".rf-decision-blocked").textContent())?.includes("更新") === true);
  check("conflict keeps the existing Quest data on screen",
    await page.locator(".rf-shelf-card").count() === 3);

  // --- permission denied ---
  await page.goto(`${baseUrl}${pagePath}&state=permission`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rf-shelf-card");
  await page.locator('.rf-shelf-card[data-severity="review"]').click();
  await page.locator(".rf-review-button").click();
  await page.waitForTimeout(120);
  check("permission denied blocks the decision and names the scope",
    await page.locator(".rf-decision-approve").isDisabled() === true
    && (await page.locator(".rf-decision-blocked").textContent())?.includes("スコープ") === true);

  // --- network error surfaces without destroying state ---
  await page.goto(`${baseUrl}${pagePath}&state=network`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rf-shelf-card");
  await page.locator('.rf-shelf-card[data-severity="review"]').click();
  await page.locator(".rf-review-button").click();
  await page.waitForTimeout(120);
  await page.locator(".rf-decision-approve").click();
  await page.waitForTimeout(400);
  check("network failure reports an error and keeps the Quest",
    await page.locator('.rf-decision-result[data-tone="error"]').count() === 1
    && await page.locator(".rf-shelf-card").count() === 3);
  check("a failed decision can be retried", await page.locator(".rf-decision-approve").isDisabled() === false);

  // --- double submit is refused while a request is in flight ---
  await page.goto(`${baseUrl}${pagePath}&state=submitting`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rf-shelf-card");
  await page.locator('.rf-shelf-card[data-severity="review"]').click();
  await page.locator(".rf-review-button").click();
  await page.waitForTimeout(120);
  await page.locator(".rf-decision-approve").click();
  await page.waitForTimeout(250);
  check("the control disables itself while submitting",
    await page.locator(".rf-decision-approve").isDisabled() === true
    && await page.evaluate(`(function () { var d = document.querySelector(".rf-decision"); return d !== null && d.getAttribute("data-phase") === "submitting"; })()`) === true);

  // --- back to a clean page for the identity checks ---
  await page.goto(`${baseUrl}${pagePath}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rf-shelf-card");

  // --- Actor identity reaches every surface from one source ---
  const identity = await page.evaluate(`(function () {
    var count = function (s) { return document.querySelectorAll(s).length; };
    var img = document.querySelector('.rf-avatar-frame[data-resolved="crest"] .rf-avatar-image');
    return {
      shelf: count(".rf-shelf-actor .rf-avatar"),
      loom: count(".rf-spine-row .rf-avatar"),
      relay: count(".rf-resp-step .rf-avatar"),
      lens: count(".rf-lens-relay-row .rf-avatar"),
      chronicle: count(".rf-chronicle-strip .rf-avatar"),
      crestSrc: img === null ? "" : img.getAttribute("src") || ""
    };
  })()`) as Record<string, number | string>;
  check(
    "one identity source reaches Shelf / Loom / Relay / Lens / Chronicle",
    Number(identity.shelf) >= 3 && Number(identity.loom) >= 6 && Number(identity.relay) === 3
    && Number(identity.lens) === 3 && Number(identity.chronicle) === 1,
    JSON.stringify(identity),
  );
  check(
    "role crest resolves to a real repository asset",
    String(identity.crestSrc).includes("assets/avatar-role-"),
    String(identity.crestSrc),
  );

  // --- avatar fallback: a broken image degrades without moving layout ---
  const fallback = await page.evaluate(`(function () {
    var avatar = document.querySelector('.rf-avatar-frame[data-resolved="crest"]');
    if (avatar === null) return null;
    var before = Math.round(avatar.getBoundingClientRect().width);
    var img = avatar.querySelector("img");
    if (img === null) return null;
    img.dispatchEvent(new Event("error"));
    return {
      before: before,
      after: Math.round(avatar.getBoundingClientRect().width),
      resolved: avatar.getAttribute("data-resolved"),
      hasInitials: (avatar.textContent || "").trim().length > 0
    };
  })()`) as { before: number; after: number; resolved: string; hasInitials: boolean } | null;
  check(
    "broken avatar falls back to initials without layout shift",
    fallback !== null && fallback.before === fallback.after
    && fallback.resolved === "initials" && fallback.hasInitials,
    JSON.stringify(fallback),
  );

  // --- keyboard: roving tabindex moves the Loom selection ---
  await page.locator('.rf-spine-row[data-relation="hub"]').focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(80);
  const keyboardState = await selectionState(page);
  check(
    "keyboard selection updates every surface",
    keyboardState.hub !== "" && keyboardState.centre === `QF-${keyboardState.hub.replace("q-", "")}`,
    JSON.stringify(keyboardState),
  );
  const keyboardClip = await page.evaluate(`(function () {
    var region = document.querySelector(".rf-selected");
    var title = document.querySelector(".rf-selected-title");
    return region !== null && title !== null
      && title.getBoundingClientRect().top >= region.getBoundingClientRect().top - 0.5;
  })()`);
  check("keyboard selection does not clip the header", keyboardClip === true);

  // --- resize must not reintroduce clipping ---
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(120);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(120);
  check("header survives a resize round trip", await page.evaluate(`(function () {
    var region = document.querySelector(".rf-selected");
    var title = document.querySelector(".rf-selected-title");
    return region !== null && title !== null
      && title.getBoundingClientRect().top >= region.getBoundingClientRect().top - 0.5;
  })()`) === true);

  // --- Lens scroll must not detach the Decision Bar ---
  check("Decision Bar stays pinned while the Lens body scrolls", await page.evaluate(`(function () {
    var body = document.querySelector(".rf-lens-body");
    var decision = document.querySelector(".rf-decision");
    var lens = document.querySelector(".rf-lens");
    if (body === null || decision === null || lens === null) return false;
    body.scrollTop = body.scrollHeight;
    return Math.abs(decision.getBoundingClientRect().bottom - lens.getBoundingClientRect().bottom) < 1.5;
  })()`) === true);

  await page.context().close();
}

async function verifyMobile(browser: Browser): Promise<void> {
  const page = await openPage(browser, 390, 844);

  check("mobile renders its own composition, not the desktop one", await page.evaluate(
    `(function () {
      var mobile = document.querySelector(".rf-m-page");
      var desktop = document.querySelector(".rf-workfield");
      return mobile !== null && (desktop === null || getComputedStyle(desktop).display === "none");
    })()`,
  ) === true);

  // --- B2: the Decision Bar is visible without scrolling and clears the nav ---
  const decision = await page.evaluate(`(function () {
    var bar = document.querySelector(".rf-m-decision-region");
    var nav = document.querySelector(".rf-rail");
    if (bar === null || nav === null) return null;
    var b = bar.getBoundingClientRect();
    var n = nav.getBoundingClientRect();
    return {
      insideViewport: b.bottom <= window.innerHeight + 0.5 && b.top >= 0,
      clearsNav: b.bottom <= n.top + 0.5
    };
  })()`) as { insideViewport: boolean; clearsNav: boolean } | null;
  check(
    "Decision Bar is fixed in view and clears the bottom navigation",
    decision !== null && decision.insideViewport && decision.clearsNav,
    JSON.stringify(decision),
  );

  // --- B1: the first viewport answers what and what next ---
  check("first viewport shows state, ID, title, why and the primary action", await page.evaluate(
    `(function () {
      var need = [".rf-m-selected .rf-selected-state", ".rf-m-selected .rf-selected-ref", ".rf-m-quest-title", ".rf-m-reason", ".rf-m-review"];
      return need.every(function (s) {
        var e = document.querySelector(s);
        if (e === null) return false;
        var b = e.getBoundingClientRect();
        return b.top < window.innerHeight && b.bottom > 0;
      });
    })()`,
  ) === true);

  // --- B2: decision is reachable without opening the Loom ---
  check("Quest Loom is not on the page until it is asked for",
    await page.locator(".rf-m-page .rf-spine").count() === 0
    && await page.locator(".rf-m-questflow").count() === 1);

  // --- B3: sheet focus contract ---
  await page.locator(".rf-m-questflow").click();
  await page.waitForSelector(".rf-sheet-panel");
  check("sheet is a modal dialog", await page.evaluate(
    `(function () {
      var p = document.querySelector(".rf-sheet-panel");
      return p !== null && p.getAttribute("role") === "dialog" && p.getAttribute("aria-modal") === "true";
    })()`,
  ) === true);
  check("sheet has an explicit close control", await page.locator(".rf-sheet-close").count() === 1);
  check("focus moves into the sheet on open", await page.evaluate(
    `(function () { var a = document.activeElement; return a !== null && a.closest(".rf-sheet-panel") !== null; })()`,
  ) === true);

  // Tab from the last focusable must wrap back inside the panel.
  await page.evaluate(`(function () {
    var items = document.querySelectorAll(".rf-sheet-panel a[href], .rf-sheet-panel button, .rf-sheet-panel [tabindex]:not([tabindex='-1'])");
    if (items.length > 0) items[items.length - 1].focus();
  })()`);
  await page.keyboard.press("Tab");
  check("focus trap keeps Tab inside the sheet", await page.evaluate(
    `(function () { var a = document.activeElement; return a !== null && a.closest(".rf-sheet-panel") !== null; })()`,
  ) === true);

  // --- B3: selecting from the sheet closes it and updates the page ---
  await page.locator('.rf-sheet-panel .rf-spine-row[data-quest-id="q-190"]').click();
  await page.waitForTimeout(120);
  check("selecting in the sheet closes it and moves the selection",
    await page.locator(".rf-sheet-panel").count() === 0
    && (await page.locator(".rf-m-selected .rf-selected-ref").textContent())?.trim() === "QF-190");

  // --- Escape closes the sheet and focus returns to the trigger ---
  await page.locator(".rf-m-questflow").click();
  await page.waitForSelector(".rf-sheet-panel");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(120);
  check("Escape closes the sheet", await page.locator(".rf-sheet-panel").count() === 0);
  check("focus returns to the Quest flow trigger", await page.evaluate(
    `(function () {
      var a = document.activeElement;
      return a !== null && (a.className || "").indexOf("rf-m-questflow") >= 0;
    })()`,
  ) === true);

  // --- B1.1: five primary destinations plus More, all labelled ---
  const nav = await page.evaluate(`(function () {
    var items = [].slice.call(document.querySelectorAll(".rf-rail .rf-nav-item"));
    return {
      count: items.length,
      labels: items.map(function (i) { var l = i.querySelector(".rf-nav-label"); return l === null ? "" : (l.textContent || "").trim(); }),
      allLabelled: items.every(function (i) {
        var l = i.querySelector(".rf-nav-label");
        return l !== null && (l.textContent || "").trim().length > 0 && getComputedStyle(l).display !== "none";
      }),
      tallEnough: items.every(function (i) { return i.getBoundingClientRect().height >= 44; }),
      current: document.querySelectorAll('.rf-rail [aria-current="page"]').length
    };
  })()`) as { count: number; labels: string[]; allLabelled: boolean; tallEnough: boolean; current: number };
  check(
    "bottom navigation is five labelled items with 44px targets and aria-current",
    nav.count === 5 && nav.allLabelled && nav.tallEnough && nav.current === 1
    && nav.labels[nav.labels.length - 1] === "More",
    JSON.stringify(nav),
  );

  // --- B1.2: the selected Attention card is fully visible on first paint ---
  const snapped = await page.evaluate(`(function () {
    var track = document.querySelector(".rf-m-shelf-track");
    var card = document.querySelector('.rf-m-shelf-card[data-selected="true"]');
    if (track === null || card === null) return null;
    var t = track.getBoundingClientRect();
    var c = card.getBoundingClientRect();
    return { visible: c.left >= t.left - 1 && c.right <= t.right + 1, id: card.getAttribute("data-quest-id") };
  })()`) as { visible: boolean; id: string } | null;
  check("selected Attention card is fully visible on load", snapped !== null && snapped.visible, JSON.stringify(snapped));

  // Selecting the last card must bring it into view too.
  await page.locator('.rf-m-shelf-card[data-severity="waiting"]').click();
  await page.waitForTimeout(400);
  const snappedAfter = await page.evaluate(`(function () {
    var track = document.querySelector(".rf-m-shelf-track");
    var card = document.querySelector('.rf-m-shelf-card[data-selected="true"]');
    if (track === null || card === null) return null;
    var t = track.getBoundingClientRect();
    var c = card.getBoundingClientRect();
    return { visible: c.left >= t.left - 1 && c.right <= t.right + 1, id: card.getAttribute("data-quest-id") };
  })()`) as { visible: boolean; id: string } | null;
  check("selection change brings its card into view", snappedAfter !== null && snappedAfter.visible, JSON.stringify(snappedAfter));

  // --- B1.3: compact before review, ready after ---
  await page.locator('.rf-m-shelf-card[data-severity="review"]').click();
  await page.waitForTimeout(120);
  check("Decision Bar is compact before the output is reviewed", await page.evaluate(
    `(function () { var d = document.querySelector(".rf-m-decision"); return d !== null && d.getAttribute("data-shape") === "compact"; })()`,
  ) === true);
  check("compact bar offers no Approve control", await page.locator(".rf-m-decision .rf-decision-approve").count() === 0);
  await page.locator(".rf-m-review").click();
  await page.waitForTimeout(120);
  check("Decision Bar expands to ready after review", await page.evaluate(
    `(function () { var d = document.querySelector(".rf-m-decision"); return d !== null && d.getAttribute("data-shape") === "ready"; })()`,
  ) === true);
  // --- B1.4: verification summary comes from the real Evidence result ---
  const verification = await page.locator(".rf-m-decision .rf-decision-verified").textContent();
  check(
    "ready bar shows a verification summary derived from Evidence",
    (verification ?? "").includes("verified") && (verification ?? "").includes("12/12"),
    String(verification),
  );
  check("Approve handoff is enabled once evidence is reviewed",
    await page.locator(".rf-m-decision .rf-decision-approve").isDisabled() === false);

  // --- Request revision: cancel, empty rejection, then success ---
  await page.locator(".rf-m-decision .rf-secondary-button").click();
  await page.waitForTimeout(120);
  check("Request revision opens the reason field", await page.locator(".rf-m-decision .rf-revision-input").count() === 1);
  await page.locator('.rf-m-decision .rf-secondary-button').click();
  await page.waitForTimeout(120);
  check("cancel closes the revision field without writing", await page.evaluate(
    `(function () { var d = document.querySelector(".rf-m-decision"); return d !== null && d.getAttribute("data-shape") === "ready"; })()`,
  ) === true);

  await page.locator(".rf-m-decision .rf-secondary-button").click();
  await page.waitForTimeout(120);
  await page.locator(".rf-m-decision .rf-revision-submit").click();
  await page.waitForTimeout(200);
  check("empty revision reason is rejected before any request",
    await page.locator(".rf-m-decision .rf-revision-error").count() === 1);

  await page.locator(".rf-m-decision .rf-revision-input").fill("契約差分の権限セクションを直してください");
  await page.locator(".rf-m-decision .rf-revision-submit").click();
  await page.waitForTimeout(400);
  check("revision succeeds and the Quest leaves the intervention queue", await page.evaluate(
    `(function () {
      var result = document.querySelector('.rf-decision-result[data-tone="success"]');
      var shelf = document.querySelectorAll(".rf-m-shelf-card").length;
      return result !== null && shelf === 2;
    })()`,
  ) === true);

  // --- stale / permission / conflict never allow a write ---
  for (const forced of ["stale", "permission", "conflict"]) {
    await page.goto(`${baseUrl}${pagePath}&state=${forced}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".rf-m-page");
    await page.locator(".rf-m-review").click().catch(() => undefined);
    await page.waitForTimeout(120);
    const shape = await page.evaluate(`(function () { var d = document.querySelector(".rf-m-decision"); return d === null ? "" : d.getAttribute("data-shape"); })()`);
    check(`${forced} state keeps the bar compact and states why`,
      shape === "compact" && await page.locator(".rf-m-decision .rf-decision-blocked").count() === 1,
      String(shape));
  }

  // --- long-label resilience: nothing overflows at 35% expansion ---
  await page.goto(`${baseUrl}${pagePath}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rf-m-page");
  const expanded = await page.evaluate(`(function () {
    document.querySelectorAll(".rf-nav-label").forEach(function (node) {
      node.textContent = node.textContent + "-erweiterungstest";
    });
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  })()`);
  check("35%-expanded navigation labels do not overflow", Number(expanded) <= 1, String(expanded));

  await page.context().close();
}

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--force-device-scale-factor=1"],
});

try {
  await verifyDesktop(browser);
  await verifyMobile(browser);
} finally {
  await browser.close();
}

for (const line of results) console.log(line);
console.log(failures === 0 ? "RESULT: PASS" : `RESULT: ${failures} check(s) failed`);
if (failures > 0) process.exitCode = 1;

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
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { startRelayWorkerFixture } from "../tests/browser/worker-fixture.ts";
import { SUPPORTED_LOCALES } from "../i18n.ts";
import { relayText } from "../interaction-lab/relay-forge/relay-copy.ts";

const baseUrl = process.argv[2] ?? "http://localhost:5173";
const built = process.argv.includes("--built");
const pagePath = `${built ? "/next/relay-forge/" : "/interaction-lab/relay-forge/index.html"}?theme=dark&fixture=1`;

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

async function openPage(browser: Browser, width: number, height: number, locale = "ja", touch = false): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale,
    timezoneId: "Asia/Tokyo",
    colorScheme: "dark",
    reducedMotion: "reduce",
    isMobile: touch,
    hasTouch: touch,
  });
  await context.addInitScript(value => localStorage.setItem("questforge-locale", value), locale);
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
  check("Create opens a real action; inert overflow controls are absent",
    await page.locator(".rf-create").textContent() === relayText("createQuest", "ja")
    && await page.locator(".rf-create-more, .rf-selected [title='More actions']").count() === 0);

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
  check("upstream-blocked Agent Quest offers no handoff approval",
    await page.locator(".rf-decision-approve:not([data-quest-action])").count() === 0);

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
    && await page.locator(".rf-lens .rf-external-check input").isChecked() === false);
  await page.locator(".rf-review-button").click();
  await page.waitForTimeout(120);
  check("Preview alone keeps approval gated", await page.locator(".rf-decision-approve").isDisabled());
  await page.locator(".rf-lens .rf-external-check input").check();
  check("Approve unlocks after explicit external confirmation", await page.locator(".rf-decision-approve").isDisabled() === false);
  check("verification summary is shown once approval is possible",
    (await page.locator(".rf-decision-verified").textContent())?.includes("verified") === true);

  await page.locator(".rf-lens .rf-external-check input").check();
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
    approved.success && await page.locator('.rf-shelf-card[data-quest-id="q-184"][data-severity="review"]').count() === 0 && approved.chronicleTop.includes("QF-184"),
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
  await page.waitForTimeout(120);
  check("missing protected Quest data exposes no approval or mutation control",
    await page.locator(".rf-decision-approve").count() === 0
    && await page.locator("[data-quest-action]").count() === 0);

  // --- network error surfaces without destroying state ---
  await page.goto(`${baseUrl}${pagePath}&state=network`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rf-shelf-card");
  await page.locator('.rf-shelf-card[data-severity="review"]').click();
  await page.locator(".rf-review-button").click();
  await page.waitForTimeout(120);
  await page.locator(".rf-lens .rf-external-check input").check();
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
  await page.locator(".rf-lens .rf-external-check input").check();
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
      var p = document.querySelector(".rf-sheet");
      return p !== null && p.matches("dialog:modal") && p.getAttribute("aria-modal") === "true";
    })()`,
  ) === true);
  check("sheet has an explicit close control", await page.locator(".rf-sheet-close").count() === 1);
  check("focus moves into the sheet on open", await page.evaluate(
    `(function () { var a = document.activeElement; return a !== null && a.closest(".rf-sheet-panel") !== null; })()`,
  ) === true);

  const sheetAccessibility = await page.context().newCDPSession(page);
  const sheetTree = await sheetAccessibility.send("Accessibility.getFullAXTree");
  const exposedNavigation = sheetTree.nodes.filter(node => !node.ignored && node.role?.value === "button" && ["Quests", "Network", "Party"].includes(String(node.name?.value)));
  const backgroundFocus = await page.evaluate(`(function () {
    var button = document.querySelector(".rf-rail .rf-nav-item");
    if (button !== null) button.focus();
    return button !== null && document.activeElement === button;
  })()`);
  check("modal sheet excludes background navigation from accessibility and focus", exposedNavigation.length === 0 && !backgroundFocus);
  await sheetAccessibility.detach();

  // Tab from the last focusable must wrap back inside the panel.
  await page.evaluate(`(function () {
    var items = document.querySelectorAll(".rf-sheet-panel a[href], .rf-sheet-panel button, .rf-sheet-panel [tabindex]:not([tabindex='-1'])");
    if (items.length > 0) items[items.length - 1].focus();
  })()`);
  await page.keyboard.press("Tab");
  check("focus trap keeps Tab inside the sheet", await page.evaluate(
    `(function () { var a = document.activeElement; return a !== null && a.closest(".rf-sheet-panel") !== null; })()`,
  ) === true);
  await page.locator(".rf-sheet-close").focus();
  await page.keyboard.press("Shift+Tab");
  check("focus trap keeps reverse Tab inside the sheet", await page.evaluate(
    `document.activeElement?.closest(".rf-sheet-panel") !== null`,
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

  await page.locator(".rf-m-questflow").click();
  await page.locator(".rf-sheet-close").click();
  check("explicit sheet close restores background navigation and trigger focus",
    await page.getByRole("button", { name:"Quests", exact:true }).isVisible()
    && await page.locator(".rf-m-questflow").evaluate(el => el === el.ownerDocument.activeElement));
  await page.locator(".rf-m-questflow").click();
  await page.locator(".rf-sheet-scrim").click({ position:{ x:10, y:10 } });
  check("scrim closes the native sheet without retaining modality",
    await page.locator("dialog:modal").count() === 0
    && await page.locator(".rf-m-questflow").evaluate(el => el === el.ownerDocument.activeElement));
  const mobileViewport = page.viewportSize()!;
  await page.locator(".rf-m-questflow").click();
  await page.setViewportSize({ width:1440, height:mobileViewport.height });
  await page.locator(".rf-sheet-panel").waitFor({ state:"detached" });
  check("desktop resize releases an open sheet and restores navigation",
    await page.locator("dialog:modal").count() === 0
    && await page.getByRole("button", { name:"Quests", exact:true }).isVisible());
  await page.setViewportSize(mobileViewport);
  await page.locator(".rf-nav-more").waitFor({ state:"visible" });

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
  check("Decision Bar is checking before external confirmation", await page.evaluate(
    `(function () { var d = document.querySelector(".rf-m-decision"); return d !== null && d.getAttribute("data-shape") === "checking"; })()`,
  ) === true);
  check("compact bar offers no Approve control", await page.locator(".rf-m-decision .rf-decision-approve").count() === 0);
  await page.locator(".rf-m-review").click();
  await page.waitForTimeout(120);
  check("Preview alone keeps mobile approval gated", await page.locator(".rf-m-decision").getAttribute("data-shape") === "checking");
  await page.locator(".rf-m-decision .rf-external-check input").check();
  check("Decision Bar expands after explicit external confirmation", await page.evaluate(
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
      var reviewed = document.querySelector('.rf-m-shelf-card[data-quest-id="q-184"][data-severity="review"]');
      return result !== null && reviewed === null;
    })()`,
  ) === true);

  // --- stale / permission / conflict never allow a write ---
  for (const forced of ["stale", "permission", "conflict"]) {
    await page.goto(`${baseUrl}${pagePath}&state=${forced}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".rf-m-page");
    await page.locator(".rf-m-review").click().catch(() => undefined);
    await page.waitForTimeout(120);
    const shape = await page.evaluate(`(function () { var d = document.querySelector(".rf-m-decision"); return d === null ? "" : d.getAttribute("data-shape"); })()`);
    check(`${forced} state exposes no executable approval`,
      forced === "permission"
        ? await page.locator(".rf-m-decision .rf-decision-approve").count() === 0
        : shape === "checking" && await page.locator(".rf-m-decision .rf-decision-blocked").count() === 1,
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

async function verifyWorkerDecisions(browser: Browser): Promise<void> {
  const fixture = await startRelayWorkerFixture(new URL(baseUrl).origin);
  const page = await browser.newPage({ viewport:{ width:1440, height:1000 }, reducedMotion:"reduce" });
  page.setDefaultTimeout(10000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  let release: (() => void) | undefined;
  try {
    const reviews = [];
    for (const title of ["Decision A", "Decision B"]) {
      const { quest } = await fixture.web("/v1/quests", "POST", { kind:"todo", title,
        assignee:{ type:"agent", id:"review-agent", label:"My Review Agent", handoffState:"working" } });
      reviews.push((await fixture.web(`/v1/quests/${quest.id}/handoff`, "POST", { state:"review_required", expectedState:"working", dryRun:false })).quest);
    }
    const [first, second] = reviews;
    const task = (await fixture.web("/v1/quests", "POST", { kind:"todo", title:"My real task" })).quest;
    const input = () => page.locator(".rf-revision-input:visible");
    const decision = () => page.locator(".rf-lens:visible, .rf-m-decision:visible");
    async function choose(id: string): Promise<void> {
      const mobile = page.viewportSize()!.width <= 900;
      await page.locator(`${mobile ? ".rf-m-shelf-card" : ".rf-spine-row"}[data-quest-id="${id}"]`).click();
    }
    await page.goto(`${baseUrl}/tests/browser/production-relay.html?api=${encodeURIComponent(fixture.baseUrl)}&uid=${fixture.uid}&lang=ja`);
    await choose(first.id);
    await decision().locator(".rf-external-check input").check();
    await decision().getByRole("button", { name:relayText("requestRevision", "ja"), exact:true }).click();
    await input().fill("日本語の修正依頼 — retained draft");
    await mkdir(".qa-artifacts/command", { recursive:true });
    for (const width of [1440, 412, 320]) {
      await page.setViewportSize({ width, height:1000 });
      // Resizing into mobile keeps the same revision draft and decision gate.
      for (const locale of SUPPORTED_LOCALES) {
        await input().focus();
        await input().evaluate(field => (field as unknown as { setSelectionRange(start:number, end:number):void }).setSelectionRange(3, 7));
        await page.evaluate(`window.dispatchEvent(new CustomEvent('test:locale', { detail:${JSON.stringify(locale)} }))`);
        assert.equal(await input().inputValue(), "日本語の修正依頼 — retained draft");
        assert.deepEqual(await input().evaluate(field => {
          const text = field as unknown as { selectionStart:number; selectionEnd:number; ownerDocument:{ activeElement:unknown } };
          return [text.selectionStart, text.selectionEnd, text.ownerDocument.activeElement === field];
        }), [3, 7, true]);
        assert.equal(await decision().locator(".rf-revision-submit").textContent(), relayText("sendRevision", locale));
        assert.equal(await input().getAttribute("placeholder"), relayText("revisionPlaceholder", locale));
        assert.equal(await page.locator(".rf-selected-state:visible").textContent(), relayText("commandRequestedReview", locale).replace("{actor}", "My Review Agent"));
        assert.equal(await page.locator(width <= 900 ? ".rf-m-reason" : ".rf-selected-reason").textContent(), width <= 900 ? relayText("commandSummaryReview", locale) : `${relayText("commandReason", locale)}: ${relayText("commandSummaryReview", locale)}`);
        assert.ok((await page.locator(width <= 900 ? `.rf-m-shelf-card[data-quest-id="${first.id}"]` : `.rf-shelf-card[data-quest-id="${first.id}"]`).textContent())?.includes(relayText("commandRequestedReview", locale).replace("{actor}", "My Review Agent")));
        assert.equal(await page.locator(width <= 900 ? ".rf-m-quest-title" : ".rf-selected-title").textContent(), first.title);
        if (width > 900) assert.equal(await page.locator(".rf-capacity-slot .rf-capacity-label--full").first().textContent(), relayText("commandAttention", locale));
        const revisionFits = await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1");
        if (!revisionFits) {
          await page.screenshot({ path:`.qa-artifacts/command/revision-overflow-${locale}-${width}.png`, fullPage:true });
          console.log("Revision overflow", locale, width, await page.evaluate(`Array.from(document.querySelectorAll('.rf-shell *')).filter(el => { var r=el.getBoundingClientRect(); return r.width>0 && (r.left < -1 || r.right > innerWidth+1); }).slice(0,12).map(el => ({class:el.className, left:el.getBoundingClientRect().left, right:el.getBoundingClientRect().right}))`));
        }
        assert.equal(revisionFits, true, `${locale}/${width}: revision must fit the viewport`);
        if (locale === "de") await page.screenshot({ path:`.qa-artifacts/command/revision-de-${width}.png` });
        check(`${locale}/${width}: cached Command copy, revision draft, caret and locale focus`, true);
      }
    }
    await input().dispatchEvent("compositionstart");
    await page.evaluate("window.dispatchEvent(new CustomEvent('test:locale', { detail:'de' }))");
    assert.equal(await input().evaluate(field => field.ownerDocument.activeElement === field), true);
    await input().fill("変換中の日本語 — retained draft");
    await input().dispatchEvent("compositionend");
    await page.waitForFunction("document.querySelector('.rf-revision-submit')?.textContent === 'Änderungswunsch senden'");
    assert.equal(await input().inputValue(), "変換中の日本語 — retained draft");
    check("IME composition survives a locale rerender", true);
    await page.screenshot({ path:".qa-artifacts/command/revision-de-320.png" });

    // Delay one real execute request; a controlled refusal must retain the draft.
    let executes = 0;
    let fail = true;
    await page.route(`${fixture.baseUrl}/v1/quests/${first.id}/handoff`, async route => {
      if (route.request().method() !== "POST" || route.request().postDataJSON().dryRun) { await route.continue(); return; }
      executes += 1;
      await new Promise<void>(resolve => { release = resolve; });
      if (fail) await route.fulfill({ status:409, contentType:"application/json", body:JSON.stringify({ error:{ code:"stale_handoff_state", message:"Changed" } }) });
      else await route.continue();
    });
    await decision().locator(".rf-revision-submit").click();
    await page.waitForFunction("document.querySelector('.rf-revision-input')?.disabled === true");
    assert.equal(await input().isDisabled(), true);
    assert.equal(await decision().getByRole("button", { name:relayText("dialogCancel", "de"), exact:true }).isDisabled(), true);
    assert.equal(await decision().locator(".rf-external-check input").isDisabled(), true);
    await page.evaluate("document.querySelector('.rf-revision-submit').click()");
    await page.waitForTimeout(80);
    assert.equal(executes, 1);
    release!();
    await decision().locator('[data-tone="error"]').waitFor();
    assert.equal(await input().inputValue(), "変換中の日本語 — retained draft");
    assert.equal((await fixture.web(`/v1/quests/${first.id}`)).quest.assignee.handoffState, "review_required");
    check("Delayed refusal blocks input/cancel/duplicate writes and keeps the draft", true);
    await page.evaluate("window.dispatchEvent(new CustomEvent('test:locale', { detail:'en' }))");
    assert.equal(await decision().locator('[data-tone="error"]').textContent(), relayText("handoffConflict", "en"));
    check("Stored failure follows locale changes without replacing the draft", true);

    await page.setViewportSize({ width:1440, height:1000 });
    await choose(first.id);
    await decision().locator(".rf-external-check input").check();
    fail = false;
    release = undefined;
    await decision().locator(".rf-revision-submit").click();
    await page.waitForTimeout(80);
    assert.equal(executes, 2);
    assert.equal(await input().isDisabled(), true);
    assert.equal(await page.locator(".rf-selected").getByRole("button", { name:relayText("requestRevision", "en"), exact:true }).isDisabled(), true);
    await page.locator(".rf-selected").getByRole("button", { name:relayText("requestRevision", "en"), exact:true }).evaluate(button => button.click());
    assert.equal(await input().isDisabled(), true);
    check("Desktop centre cannot reopen a revision and reset the in-flight guard", true);
    await decision().getByRole("button", { name:relayText("closeLens", "en"), exact:true }).click();
    await choose(second.id);
    assert.equal(await decision().locator(".rf-external-check input").isDisabled(), true);
    await decision().locator(".rf-external-check input").evaluate(element => element.click());
    assert.equal(await decision().locator('[data-tone="error"], [data-tone="success"]').count(), 0);
    release!();
    await page.waitForFunction("document.querySelector('.rf-external-check input')?.disabled === false");
    assert.equal((await fixture.web(`/v1/quests/${first.id}`)).quest.assignee.handoffState, "working");
    assert.equal((await fixture.web(`/v1/quests/${first.id}`)).quest.handoff.note, "変換中の日本語 — retained draft");
    assert.equal((await fixture.web(`/v1/quests/${second.id}`)).quest.assignee.handoffState, "review_required");
    assert.equal(await decision().locator('[data-tone="error"], [data-tone="success"]').count(), 0);
    assert.equal(await decision().locator(".rf-external-check input").isChecked(), false);
    assert.equal(await page.locator(`.rf-spine-row[data-quest-id="${second.id}"]`).evaluate(element => element === element.ownerDocument.activeElement), true);
    check("Late Worker success updates only its Quest without stealing selection, feedback or focus", true);
    await decision().locator(".rf-external-check input").check();
    await decision().getByRole("button", { name:relayText("requestRevision", "en"), exact:true }).click();
    assert.equal(await input().inputValue(), "");
    check("Changing Quest starts an independent revision draft and explicit check", true);

    await page.keyboard.press("Escape");
    await choose(task.id);
    await page.keyboard.press("Escape");
    let taskWrites = 0;
    let taskFail = true;
    await page.route(`${fixture.baseUrl}/v1/quests/${task.id}`, async route => {
      if (route.request().method() !== "PATCH") { await route.continue(); return; }
      taskWrites += 1;
      await new Promise<void>(resolve => { release = resolve; });
      if (taskFail) await route.fulfill({ status:500, contentType:"application/json", body:JSON.stringify({ error:{ code:"internal_error", message:"private-token https://secret.invalid/payload" } }) });
      else await route.continue();
    });
    await page.locator('[data-quest-action="start"]:visible').click();
    await page.waitForFunction("document.querySelector('[data-quest-action=start]')?.disabled === true");
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height:1000 });
      for (const locale of SUPPORTED_LOCALES) {
        await page.evaluate(`window.dispatchEvent(new CustomEvent('test:locale', { detail:${JSON.stringify(locale)} }))`);
        assert.equal(await page.locator(width <= 900 ? ".rf-m-decision .rf-decision-status" : ".rf-selected-header .rf-decision-result").textContent(), relayText("savingQuest", locale));
        assert.equal(await page.locator('[data-quest-action="start"]:visible').isDisabled(), true);
      }
    }
    release!();
    const taskResult = () => page.locator('.rf-decision-result[data-tone]:visible').first();
    await taskResult().waitFor();
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height:1000 });
      for (const locale of SUPPORTED_LOCALES) {
        await page.evaluate(`window.dispatchEvent(new CustomEvent('test:locale', { detail:${JSON.stringify(locale)} }))`);
        assert.equal(await taskResult().textContent(), relayText("questSaveFailed", locale));
        assert.equal((await fixture.web(`/v1/quests/${task.id}`)).quest.assignee.handoffState, "none");
      }
    }
    taskFail = false;
    release = undefined;
    await page.locator('[data-quest-action="start"]:visible').click();
    await page.waitForTimeout(100);
    assert.equal(taskWrites, 2);
    release!();
    await page.locator('.rf-decision-result[data-tone="success"]:visible').waitFor();
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height:1000 });
      for (const locale of SUPPORTED_LOCALES) {
        await page.evaluate(`window.dispatchEvent(new CustomEvent('test:locale', { detail:${JSON.stringify(locale)} }))`);
        assert.equal(await taskResult().textContent(), relayText("questStarted", locale));
      }
    }
    assert.equal((await fixture.web(`/v1/quests/${task.id}`)).quest.assignee.handoffState, "working");
    check("Real Worker task pending, safe failure and retry success follow nine locales on desktop/mobile", true);
    assert.deepEqual(errors, []);
    check("Real Worker decision browser has no uncaught errors", true);
  } finally { release?.(); await page.close(); await fixture.close(); }
}

async function verifyCommandMobileChrome(browser: Browser): Promise<void> {
  await mkdir(".qa-artifacts/command", { recursive:true });
  for (const locale of SUPPORTED_LOCALES) for (const width of [320, 412, 1024, 1440]) {
    const page = await openPage(browser, width, 900, locale);
    try {
      if (width >= 901) {
        await page.locator('.rf-shelf-card[data-quest-id="q-184"]').click();
        await page.keyboard.press("Escape");
        assert.equal(await page.locator(".rf-shelf .rf-region-label").textContent(), relayText("commandAttention", locale));
        assert.equal(await page.locator(".rf-resp .rf-region-label").textContent(), relayText("commandResponsibility", locale));
        assert.equal(await page.locator(".rf-details .rf-region-label").textContent(), relayText("commandDetails", locale));
        assert.equal(await page.locator(".rf-evidence-summary .rf-region-label").textContent(), relayText("commandEvidenceSummary", locale));
        assert.equal(await page.locator("#rf-output-preview").isVisible(), false);
        await page.locator('[data-command-control="review-output"]').click();
        assert.equal(await page.locator("#rf-output-preview").isVisible(), true);
        assert.equal(await page.locator(".rf-preview .rf-region-label").textContent(), relayText("commandOutputPreview", locale));
        assert.equal(await page.locator(".rf-preview-close").evaluate(el => el === el.ownerDocument.activeElement), true);
        await page.locator(".rf-preview-close").click();
        assert.equal(await page.locator('[data-command-control="review-output"]').evaluate(el => el === el.ownerDocument.activeElement), true);
        const row = page.locator(".rf-evidence-list .rf-evidence-row:not(:disabled)").first();
        await row.click();
        await page.locator(".rf-preview-close").click();
        assert.equal(await row.evaluate(el => el === el.ownerDocument.activeElement), true);
        for (const button of [".rf-chronicle-toggle", ".rf-chronicle-viewall"]) {
          for (const open of [true, false]) {
            await page.locator(button).click();
            assert.equal(await page.locator("#rf-command-history").isVisible(), open);
            assert.equal(await page.locator(button).getAttribute("aria-expanded"), String(open));
            assert.equal(await page.locator(button).evaluate(el => el === el.ownerDocument.activeElement), true);
          }
        }
        await page.locator(".rf-spine-collapse").click();
        assert.equal(await page.locator(".rf-spine").getAttribute("data-collapsed"), "true");
        assert.equal(await page.locator(".rf-spine-collapse").evaluate(el => el === el.ownerDocument.activeElement), true);
        assert.ok(await page.locator('.rf-spine-row[data-relation="hub"]').getAttribute("aria-label"));
        await page.locator(".rf-spine-collapse").click();
        await page.locator('.rf-shelf-card[data-quest-id="q-184"]').click();
        assert.equal(await page.locator(".rf-lens-header .rf-region-label").textContent(), relayText("commandLens", locale));
        await page.locator(".rf-lens").getByRole("button", { name:relayText("requestRevision", locale), exact:true }).click();
        assert.ok((await page.locator(".rf-revision-impact").textContent())?.includes("Forge Runner"));
        const clipping = await page.evaluate("(() => Array.from(document.querySelectorAll('.rf-selected-actions > button, .rf-shelf-head, .rf-spine-head, .rf-lens-header, .rf-revision-impact, .rf-capacity-slot, .rf-chronicle-strip')).filter(el => el.getClientRects().length).flatMap(el => { const r=el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth+1 || el.scrollWidth > el.clientWidth+1 ? [el.className] : []; }))()");
        assert.deepEqual(clipping, [], `${locale}/${width}: desktop fit`);
        if (["de", "ru"].includes(locale)) await page.screenshot({ path:`.qa-artifacts/command/chrome-${locale}-${width}${built ? "-built" : ""}.png`, fullPage:true });
        check(`Command desktop ${locale}/${width}: copy, preview origin, disclosure focus, collapsed names, revision assignee, fit`, true);
        continue;
      }
      await page.locator('.rf-m-shelf-card[data-quest-id="q-184"]').click();
      assert.equal(await page.locator(".rf-m-shelf-track [tabindex='0']").count(), 1);
      assert.equal(await page.locator(".rf-m-review").textContent(), relayText("commandReviewOutput", locale));
      assert.equal(await page.locator("#rf-m-output").isVisible(), false);
      for (const [button, target] of [["#rf-m-review", "#rf-m-output"], ["#rf-m-supporting-toggle", "#rf-m-supporting"], ["#rf-m-chronicle-toggle", "#rf-m-history"]]) {
        assert.equal(await page.locator(button).getAttribute("aria-controls"), target.slice(1));
        assert.equal(await page.locator(target).count(), 1);
        assert.equal(await page.locator(target).isVisible(), false);
        await page.locator(button).click();
        assert.equal(await page.locator(button).getAttribute("aria-expanded"), "true");
        assert.equal(await page.locator(target).isVisible(), true);
        assert.equal(await page.locator(button).evaluate(el => el === el.ownerDocument.activeElement), true);
        await page.locator(button).click();
        assert.equal(await page.locator(target).isVisible(), false);
        assert.equal(await page.locator(button).evaluate(el => el === el.ownerDocument.activeElement), true);
      }
      const track = page.locator(".rf-m-shelf-track");
      await track.evaluate(el => { el.scrollLeft = el.scrollWidth; });
      await page.waitForTimeout(120);
      const offset = await track.evaluate(el => el.scrollLeft);
      await page.locator("#rf-m-chronicle-toggle").click();
      await page.waitForTimeout(120);
      assert.ok(Math.abs(await track.evaluate(el => el.scrollLeft) - offset) < 2, `${locale}/${width}: shelf scroll retained`);
      await page.locator('.rf-m-shelf-card[data-selected="true"]').focus();
      await page.keyboard.press("Home");
      assert.equal(await page.locator('.rf-m-shelf-card').first().getAttribute("aria-selected"), "true");
      assert.equal(await page.locator(".rf-m-shelf-controls button").first().isDisabled(), true);
      await page.keyboard.press("ArrowRight");
      assert.equal(await page.locator('.rf-m-shelf-card').nth(1).getAttribute("aria-selected"), "true");
      await page.keyboard.press("End");
      assert.equal(await page.locator('.rf-m-shelf-card').last().getAttribute("aria-selected"), "true");
      assert.equal(await page.locator(".rf-m-shelf-controls button").last().isDisabled(), true);
      assert.equal(await page.locator(".rf-m-review").isDisabled(), false);
      assert.equal(await page.locator('.rf-m-shelf-card[data-selected="true"]').evaluate(el => el === el.ownerDocument.activeElement), true);
      assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, `${locale}/${width}: page fit`);
      const overflow = await page.evaluate("(() => Array.from(document.querySelectorAll('.rf-m-header > *, .rf-m-actions button, .rf-m-supporting-toggle, .rf-m-section-head')).filter(el => el.getClientRects().length).flatMap(el => { const r=el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth+1 || el.scrollWidth > el.clientWidth+1 ? [el.className] : []; }))()");
      assert.deepEqual(overflow, [], `${locale}/${width}: control fit`);
      assert.equal(await page.evaluate("(() => Array.from(document.querySelectorAll('.rf-m-relay-step')).every(row => row.querySelector('.rf-m-relay-copy').getBoundingClientRect().left < row.querySelector('.rf-m-relay-time').getBoundingClientRect().left))()"), true, `${locale}/${width}: relay columns`);
      if (["de", "ru"].includes(locale)) await page.screenshot({ path:`.qa-artifacts/command/chrome-${locale}-${width}${built ? "-built" : ""}.png`, fullPage:true });
      await page.locator(".rf-m-questflow").click();
      const modalSession = await page.context().newCDPSession(page);
      const modalTree = await modalSession.send("Accessibility.getFullAXTree");
      const exposedNodes = modalTree.nodes.filter(node => !node.ignored);
      check(`${locale}/${width}: named modal exposes its list and excludes background navigation`,
        exposedNodes.some(node => node.role?.value === "dialog" && String(node.name?.value).toLocaleLowerCase(locale) === relayText("commandFlow", locale).toLocaleLowerCase(locale))
        && !exposedNodes.some(node => node.role?.value === "button" && ["Quests", "Network", "Party"].includes(String(node.name?.value))));
      await modalSession.detach();
      await page.locator('.rf-sheet-panel .rf-spine-row[data-quest-id="q-187"]').click();
      assert.equal(await page.locator(".rf-m-review").isDisabled(), true);
      assert.equal(await page.locator(".rf-m-review").getAttribute("aria-controls"), null);
      await page.goto(`${baseUrl}${pagePath}&state=empty`);
      await page.locator(".rf-m-page").waitFor();
      assert.equal(await page.locator(".rf-m-selected .rf-state-title").textContent(), relayText("commandNoAttention", locale));
      assert.equal(await page.locator(".rf-m-selected .rf-state-body").textContent(), relayText("commandBrowseHint", locale));
      assert.equal(await page.locator(".rf-m-shelf-controls button:disabled").count(), 2);
      assert.equal(await page.locator(".rf-m-shelf-track").getAttribute("aria-activedescendant"), null);
      await page.goto(`${baseUrl}${pagePath}&state=stale`);
      await page.locator(".rf-m-page").waitFor();
      assert.ok((await page.locator(".rf-m-sync").textContent())?.includes(relayText("statusStale", locale)));
      assert.equal(await page.locator(".rf-m-sync").getAttribute("data-state"), "stale");
      assert.equal(await page.locator(".rf-m-decision button[data-quest-action]:enabled").count(), 0);
      check(`Command mobile ${locale}/${width}: copy, disclosure focus, keyboard selection, scroll, empty state`, true);
    } catch (error) {
      await page.screenshot({ path:`.qa-artifacts/command/chrome-failure-${locale}-${width}.png`, fullPage:true });
      throw error;
    } finally { await page.context().close(); }
  }
}

async function verifyMobileNavScroll(browser: Browser): Promise<void> {
  for (const [width, height] of [[320, 640], [412, 915], [844, 390]]) {
    const page = await openPage(browser, width, height, "ja", true);
    try {
      await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
      await page.waitForFunction("window.scrollY > 0");
      const assertNav = async () => {
        const geometry = await page.evaluate(`(() => {
          const nav = document.querySelector('.rf-rail').getBoundingClientRect();
          const bar = document.querySelector('.rf-m-decision-region').getBoundingClientRect();
          const viewport = window.visualViewport;
          return { bottom: nav.bottom, top: nav.top, viewportBottom: viewport.offsetTop + viewport.height,
            clearsNav: bar.bottom <= nav.top + 0.5, scrollY: window.scrollY };
        })()`) as { bottom: number; top: number; viewportBottom: number; clearsNav: boolean; scrollY: number };
        assert.ok(Math.abs(geometry.bottom - geometry.viewportBottom) < 1 && geometry.top >= 0 && geometry.clearsNav,
          JSON.stringify(geometry));
      };
      await assertNav();
      await page.waitForFunction(`document.querySelector('.rf-m-chronicle').getBoundingClientRect().bottom
        <= document.querySelector('.rf-m-decision-region').getBoundingClientRect().top`);
      const beforeGesture = await page.evaluate("window.scrollY") as number;
      const cdp = await page.context().newCDPSession(page);
      const startY = Math.min(220, height / 3);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: width / 2, y: startY }] });
      for (let step = 1; step <= 8; step++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: width / 2, y: startY + step * 10 }] });
        await page.waitForTimeout(20);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(200);
      assert.ok((await page.evaluate("window.scrollY") as number) < beforeGesture, "touch gesture must scroll the document");
      await assertNav();
      await page.locator('.rf-nav-item').filter({ has: page.locator('.rf-nav-label', { hasText: /^Quests$/ }) }).tap();
      await page.locator('.rf-shell[data-domain="quests"]').waitFor();
      await page.locator('.rf-nav-item').filter({ has: page.locator('.rf-nav-label', { hasText: /^Command$/ }) }).tap();
      await page.locator('.rf-m-page').waitFor();
      await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
      await assertNav();
      await page.locator('.rf-nav-more').tap();
      const settings = page.locator('.rf-nav-more-panel .rf-nav-item').filter({ hasText: /^Settings$/ });
      await settings.tap();
      await page.locator('.rf-shell[data-domain="settings"]').waitFor();
      check(`Touch navigation ${width}/${height}: viewport bottom after document/gesture scroll and Command return; More tap`, true);
    } catch (error) {
      await page.screenshot({ path: `.qa-artifacts/command/nav-scroll-${width}-${height}.png` });
      throw error;
    } finally { await page.context().close(); }
  }
}

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--force-device-scale-factor=1"],
});

try {
  if (!process.argv.includes("--chrome-only")) {
    await verifyDesktop(browser);
    await verifyMobile(browser);
  }
  await verifyMobileNavScroll(browser);
  await verifyCommandMobileChrome(browser);
  if (!built && !process.argv.includes("--chrome-only")) await verifyWorkerDecisions(browser);
} finally {
  await browser.close();
}

for (const line of results) console.log(line);
console.log(failures === 0 ? "RESULT: PASS" : `RESULT: ${failures} check(s) failed`);
if (failures > 0) process.exitCode = 1;

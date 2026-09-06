/**
 * Guilduo LPv2.1 motion-variant validation (Chromium via playwright-core).
 *
 * Usage:
 *   tsx tools/verify-lpv21.mts [origin]
 *
 * Defaults to http://127.0.0.1:5183. The Chrome executable follows the existing
 * QF_CHROME_PATH convention. QA screenshots land in .qa-artifacts/lpv21/.
 *
 * Covers: responsive overflow (reduced-motion for speed), default-open MCP
 * details, brand images, demo feedback->revised->confirm->complete->restart
 * with mobile view switching, keyboard entry, motion toggle persistence,
 * live reduced-motion settling, hidden-document settling, no-JS fallback,
 * canonical routes, JS errors, and remote/write requests. No image analysis.
 */
import { chromium, type Page } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:5183";
const official = process.argv[3] === "official";
const output = join(process.cwd(), ".qa-artifacts", official ? "lp" : "lpv21");
await mkdir(output, { recursive: true });

const chromePath =
  process.env.QF_CHROME_PATH ??
  (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : "/usr/bin/google-chrome");
const origin = new URL(base).origin;

let failures = 0;
const results: string[] = [];
function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failures += 1;
  results.push((ok ? "PASS " : "FAIL ") + name + (detail ? " - " + detail : ""));
}

const pathFor = (language: string): string =>
  official ? (language === "en" ? "/lp/en/" : "/lp/") : (language === "en" ? "/lpv2-1/en/" : "/lpv2-1/");
const canonicalFor = (language: string): string =>
  official ? "https://guilduo.com/" + (language === "en" ? "lp/en/" : "") : "https://guilduo.com/lpv2-1/" + (language === "en" ? "en/" : "");

const awaitState = (page: Page, value: string): Promise<void> =>
  page
    .locator('#experience[data-state="' + value + '"]')
    .waitFor({ timeout: 15000 })
    .then((): void => undefined);
const clickAction = (page: Page, value: string): Promise<void> =>
  page.locator('[data-action="' + value + '"]').click();
const ensureView = (page: Page, width: number, view: "guilduo" | "external"): Promise<void> =>
  width < 760
    ? page.locator('button[data-view="' + view + '"]').click()
    : Promise.resolve();

async function overflowDetail(page: Page): Promise<string> {
  const sizes = (await page.evaluate(
    "({ width: window.innerWidth, scroll: document.documentElement.scrollWidth })",
  )) as { width: number; scroll: number };
  return "innerWidth=" + String(sizes.width) + " scrollWidth=" + String(sizes.scroll);
}
async function fitsViewport(page: Page): Promise<boolean> {
  return (await page.evaluate(
    "document.documentElement.scrollWidth <= window.innerWidth",
  )) as boolean;
}

async function brandImageStatus(page: Page): Promise<{ count: number; loaded: number }> {
  const count = await page.locator("img.brand-mark").count();
  let loaded = 0;
  for (let index = 0; index < count; index += 1) {
    const ready = await page.evaluate((position: number): boolean => {
      const scope = globalThis as unknown as {
        document: {
          querySelectorAll(selector: string): ArrayLike<{ complete: boolean; naturalWidth: number }>;
        };
      };
      const image = scope.document.querySelectorAll("img.brand-mark")[position];
      return !!image && image.complete === true && image.naturalWidth > 0;
    }, index);
    if (ready) loaded += 1;
  }
  return { count, loaded };
}

async function setDocumentHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((value: boolean): void => {
    const scope = globalThis as unknown as {
      document: Record<string, unknown> & { dispatchEvent(event: unknown): void };
      Event: new (type: string) => unknown;
    };
    try {
      Object.defineProperty(scope.document, "hidden", {
        value,
        configurable: true,
      });
    } catch {
      // Best effort: the visibilitychange dispatch below still exercises the handler.
    }
    scope.document.dispatchEvent(new scope.Event("visibilitychange"));
  }, hidden);
}

const NO_RUNNING_ANIMATIONS =
  "document.getAnimations({ subtree: true }).filter(function (a) { return a.playState === 'running'; }).length === 0";

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const jsErrors: string[] = [];
const unsafeRequests: string[] = [];
function watch(page: Page): void {
  page.on("pageerror", (error) => {
    jsErrors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") jsErrors.push(message.text());
  });
  page.on("request", (request) => {
    const url = request.url();
    let sameOrigin = false;
    try {
      sameOrigin = new URL(url).origin === origin;
    } catch {
      sameOrigin = false;
    }
    if (!["GET", "HEAD"].includes(request.method()) || !sameOrigin) {
      unsafeRequests.push(request.method() + " " + url);
    }
  });
}

try {
  // 1. Responsive: JA/EN x 4 widths. Reduced motion keeps demo timers short.
  for (const width of [320, 390, 768, 1440]) {
    for (const language of ["ja", "en"]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      watch(page);
      const label = language + "/" + String(width);
      await page.goto(base + pathFor(language), { waitUntil: "networkidle" });
      check(label + " serves " + language + " document", (await page.locator("html").getAttribute("lang")) === (language === "en" ? "en" : "ja"));
      check(label + " canonical points at new route", (await page.locator('link[rel="canonical"]').getAttribute("href")) === canonicalFor(language));
      check(label + " has no initial overflow", await fitsViewport(page), await overflowDetail(page));
      const brand = await brandImageStatus(page);
      check(label + " loads brand images", brand.count >= 4 && brand.loaded === brand.count, "count=" + String(brand.count) + " loaded=" + String(brand.loaded));
      check(
        label + " relay stage is decorative with SVG paths",
        (await page.locator("[data-relay-stage]").getAttribute("aria-hidden")) === "true" &&
          (await page.locator("[data-relay-stage] svg path").count()) >= 1,
        "paths=" + String(await page.locator("[data-relay-stage] svg path").count()),
      );
      check(label + " motion settles off under reduced motion", (await page.locator("html").getAttribute("data-motion")) === "off");
      check(label + " MCP disclosure starts open", (await page.locator("#mcp details").getAttribute("open")) === "");
      await page.locator("#mcp summary").click();
      const closed = (await page.locator("#mcp details").getAttribute("open")) === null;
      await page.locator("#mcp summary").click();
      const reopened = (await page.locator("#mcp details").getAttribute("open")) === "";
      check(label + " MCP disclosure closes and reopens", closed && reopened);
      await ensureView(page, width, "guilduo");
      await clickAction(page, "start");
      await awaitState(page, "human_task");
      check(label + " has no review overflow", await fitsViewport(page), await overflowDetail(page));
      if (language === "ja" && (width === 390 || width === 1440)) {
        await page.locator("#experience").screenshot({ path: join(output, language + "-" + String(width) + "-review.png") });
      }
      await context.close();
    }
  }

  // 2. Demo flow: feedback -> revised -> confirm -> complete -> restart.
  for (const [language, width] of [["ja", 1440], ["ja", 390], ["en", 390]] as const) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    watch(page);
    const label = "demo/" + language + "/" + String(width);
    await page.goto(base + pathFor(language), { waitUntil: "networkidle" });
    await ensureView(page, width, "guilduo");
    await clickAction(page, "start");
    await awaitState(page, "human_task");
    await ensureView(page, width, "guilduo");
    await clickAction(page, "feedback");
    await awaitState(page, "revised");
    check(label + " reaches revised after feedback", true);
    check(label + " revised bumps preview revision", (await page.locator("[data-revision]").textContent()) === "v2");
    await ensureView(page, width, "guilduo");
    await clickAction(page, "confirm");
    await awaitState(page, "complete");
    check(label + " reaches complete after confirm", true);
    if (language === "ja" && width === 1440) {
      await page.locator("#experience").screenshot({ path: join(output, language + "-" + String(width) + "-complete.png") });
    }
    if (await page.locator('[data-action="replay"]').isVisible()) {
      await clickAction(page, "replay");
    } else {
      await clickAction(page, "restart");
    }
    await awaitState(page, "intro");
    check(label + " restarts to intro", true);
    await context.close();
  }

  // 3. Motion toggle, live reduced-motion, and hidden-document in one normal context.
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    watch(page);
    await page.goto(base + pathFor("ja"), { waitUntil: "networkidle" });
    await page.keyboard.press("Tab");
    check(
      "keyboard focus enters through skip link",
      await page.evaluate((): boolean => {
        const scope = globalThis as unknown as {
          document: { activeElement: unknown; querySelector(selector: string): unknown };
        };
        return scope.document.activeElement === scope.document.querySelector(".skip-link");
      }),
    );
    const toggle = page.locator("[data-motion-toggle]");
    check("motion toggle is visible", await toggle.isVisible());
    check(
      "motion starts enabled",
      (await toggle.getAttribute("aria-pressed")) === "true" &&
        (await page.locator("html").getAttribute("data-motion")) === "on",
    );
    const relayMoves = await page.evaluate(`(() => {
      const token = document.querySelector('[data-relay-token="out"]');
      const animation = token.getAnimations()[0];
      if (!animation) return false;
      animation.pause(); animation.currentTime = 800;
      const first = getComputedStyle(token).transform;
      animation.currentTime = 1800;
      const second = getComputedStyle(token).transform;
      animation.play();
      return first !== second && first !== 'none';
    })()`);
    check("task travels along the hero relay", relayMoves === true);
    await page.locator("#mcp").scrollIntoViewIfNeeded();
    await page.waitForFunction(`document.querySelector('[data-relay-token="out"]').getAnimations().every(a => a.playState === 'paused')`);
    check("hero relay pauses offscreen", true);
    await page.locator(".hero").scrollIntoViewIfNeeded();
    await page.waitForFunction(`document.querySelector('[data-relay-token="out"]').getAnimations().some(a => a.playState === 'running')`);
    check("hero relay resumes on return", true);
    await toggle.click();
    await page.locator('html[data-motion="off"]').waitFor({ timeout: 5000 });
    check("motion toggle disables motion", (await toggle.getAttribute("aria-pressed")) === "false");
    await page.reload({ waitUntil: "networkidle" });
    check(
      "motion off persists across reload",
      (await page.locator("html").getAttribute("data-motion")) === "off" &&
        (await page.locator("[data-motion-toggle]").getAttribute("aria-pressed")) === "false",
    );
    await page.locator("[data-motion-toggle]").click();
    await page.locator('html[data-motion="on"]').waitFor({ timeout: 5000 });
    check("motion on resumes", (await page.locator("[data-motion-toggle]").getAttribute("aria-pressed")) === "true");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator('html[data-motion="off"]').waitFor({ timeout: 5000 });
    const settledReduced = await page
      .waitForFunction(NO_RUNNING_ANIMATIONS, undefined, { timeout: 5000 })
      .then((): boolean => true)
      .catch((): boolean => false);
    check("live reduced-motion settles with no running animation", settledReduced);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.reload({ waitUntil: "networkidle" });
    check("persisted motion returns after reduced-motion ends", (await page.locator("html").getAttribute("data-motion")) === "on");
    await setDocumentHidden(page, true);
    const settledHidden = await page
      .waitForFunction(NO_RUNNING_ANIMATIONS, undefined, { timeout: 5000 })
      .then((): boolean => true)
      .catch((): boolean => false);
    check("motion settles while document hidden", settledHidden);
    await setDocumentHidden(page, false);
    check("hidden period keeps motion preference", (await page.locator("html").getAttribute("data-motion")) === "on");
    // Ambient diagrams repeat beyond their first cycle and pause independently.
    for (const selector of ['.guild-symbols', '.connection-map', '.relay-story']) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await page.locator(selector + '[data-loop-visible="true"]').waitFor();
      const loopExpression = (extra: string): string =>
        'document.querySelector(' + JSON.stringify(selector) + ').getAnimations({subtree:true}).filter(a => a.effect.getTiming().iterations === Infinity)' + extra;
      await page.waitForFunction(loopExpression('.some(a => a.playState === "running")'));
      const repeats = await page.evaluate(loopExpression(`.every(a => {
        const timing = a.effect.getTiming();
        a.currentTime = Math.max(0, Number(timing.delay)) + Number(timing.duration) * 2.25;
        const iteration = a.effect.getComputedTiming().currentIteration;
        return iteration >= 2 && a.playState === 'running';
      })`));
      check(selector + ' repeats beyond two cycles', repeats === true);
      await page.locator('.hero').scrollIntoViewIfNeeded();
      await page.locator(selector + '[data-loop-visible="false"]').waitFor();
      await page.waitForFunction(loopExpression('.every(a => a.playState === "paused")'));
      check(selector + ' pauses offscreen', true);
    }
    await page.locator('.guild-symbols').scrollIntoViewIfNeeded();
    await page.locator('.guild-symbols[data-loop-visible="true"]').waitFor();
    await setDocumentHidden(page, true);
    await page.waitForFunction(NO_RUNNING_ANIMATIONS);
    check('floating symbols pause in a hidden document', true);
    await setDocumentHidden(page, false);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(NO_RUNNING_ANIMATIONS);
    check('floating symbols respect live reduced motion', true);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('html[data-motion="on"]').waitFor();
    const revealTargets = await page.locator(".relationship > div, .control-section > div, .guild-section h2, .open-section > div, .final-cta h2").count();
    if (revealTargets > 0) {
      for (let index = 0; index < revealTargets; index += 1) {
        await page.locator(".relationship > div, .control-section > div, .guild-section h2, .open-section > div, .final-cta h2").nth(index).scrollIntoViewIfNeeded();
      }
      await page.waitForFunction("document.getAnimations().filter(a => a.effect.getTiming().iterations !== Infinity).every(a => a.playState !== 'running')", undefined, { timeout: 5000 });
      const visibleTargets = await page.evaluate((total: number): number => {
        const scope = globalThis as unknown as {
          document: {
            querySelectorAll(selector: string): ArrayLike<{ getBoundingClientRect(): { width: number; height: number } }>;
          };
        };
        void total;
        return Array.from(scope.document.querySelectorAll(".relationship > div, .control-section > div, .guild-section h2, .open-section > div, .final-cta h2")).filter(
          (element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0,
        ).length;
      }, revealTargets);
      check("one-shot reveal targets settle visible", visibleTargets === revealTargets, String(visibleTargets) + "/" + String(revealTargets));
    } else {
      check("scroll reveal sections are present", false);
    }
    await context.close();
  }

  // 4. No-JS fallback: content and static hero stay visible, no JS-only motion state.
  {
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    for (const language of ["ja", "en"]) {
      const page = await noJs.newPage();
      await page.goto(base + pathFor(language));
      const label = "nojs/" + language;
      check(label + " heading stays visible", await page.locator("h1").isVisible());
      check(label + " hero stays visible", await page.locator(".hero, #hero-title").first().isVisible());
      check(label + " experience copy stays visible", await page.locator("#experience").isVisible());
      check(label + " root has no JS-only motion state", (await page.locator("html").getAttribute("data-motion")) === null);
      if (language === "en") {
        check(label + " fallback copy is present", await page.locator("noscript").isVisible());
        const href = await page.locator("[data-join-cta]").first().getAttribute("href");
        check(label + " join CTA keeps a static href", !!href && href.length > 0, href ?? "");
      }
      await page.close();
    }
    await noJs.close();
  }

  check("no browser JS errors", jsErrors.length === 0, jsErrors.slice(0, 3).join(" | "));
  check("motion and demo make no remote or write requests", unsafeRequests.length === 0, unsafeRequests.slice(0, 3).join(" | "));
  console.log(results.join("\n"));
  if (failures > 0) process.exitCode = 1;
  else console.log("LPv2.1 verification passed; screenshots: " + output);
} finally {
  await browser.close();
}

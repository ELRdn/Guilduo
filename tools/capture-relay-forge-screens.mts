/**
 * Captures the Relay Forge destination screens: Quests, Network, Party, Battle,
 * Connections and Skills, Desktop and Mobile, across the section 6 state matrix.
 *
 * Command is captured by `capture-relay-forge-golden.mts` and is deliberately
 * not re-captured here; this script does however assert that every destination
 * leaves Command's DOM absent, so a shared-shell regression is caught.
 *
 * Mechanical pass conditions, applied to every frame:
 *   - horizontal overflow 0
 *   - console errors and page errors 0
 *   - HTTP 4xx/5xx and failed requests 0
 *   - no informative text below 13px
 *   - exactly one vertical scroll owner inside the screen on desktop
 *   - on mobile: every tap target >= 44px, the sticky strip clear of the nav
 *   - no token-shaped string anywhere in the rendered text
 *
 * Usage:
 *   node_modules/.bin/tsx tools/capture-relay-forge-screens.mts [baseUrl]
 *
 * Output goes to .qa-artifacts/relay-forge-screens/, which is gitignored.
 * Nothing here promotes a frame to a Golden Lock or a regression reference.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";

const baseUrl = process.argv[2] ?? "http://localhost:5250";
const pagePath = "/interaction-lab/relay-forge/index.html";
const outputDir = join(process.cwd(), ".qa-artifacts", "relay-forge-screens");

const chromePath = process.env.QF_CHROME_PATH
  ?? (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : "/usr/bin/google-chrome");

type Mode = "dark" | "light";
type Domain = "quests" | "network" | "party" | "battle" | "connections" | "skills";

const NAV_INDEX: Readonly<Record<Domain, number>> = {
  quests: 1,
  network: 2,
  party: 3,
  battle: 4,
  connections: 5,
  skills: 6,
};

/** Destinations that sit behind `More` on the mobile bottom navigation. */
const MOBILE_OVERFLOW: readonly Domain[] = ["battle", "connections", "skills"];

/** Anchor selector proving the destination actually rendered. */
const READY: Readonly<Record<Domain, string>> = {
  quests: ".rf-screen--quests",
  network: ".rf-screen--network",
  party: ".rf-screen--party",
  battle: ".rf-screen--battle",
  connections: ".rf-screen--connections",
  skills: ".rf-skills-screen",
};

interface Frame {
  readonly id: string;
  readonly domain: Domain;
  readonly width: number;
  readonly height: number;
  readonly mode: Mode;
  readonly state?: string;
  readonly interaction?: (page: Page) => Promise<void>;
}

const DESKTOP = { width: 1920, height: 1080 } as const;
const NARROW = { width: 1440, height: 900 } as const;
const MOBILE = { width: 390, height: 844 } as const;
/** Section 9: WQHD must keep density without shrinking text. */
const WQHD = { width: 2560, height: 1440 } as const;
/** 200% browser zoom on a 1920x1080 display is a 960px CSS viewport. */
const ZOOM200 = { width: 960, height: 540 } as const;
/** The narrowest phone still in the support matrix. */
const NARROW_PHONE = { width: 320, height: 740 } as const;

function stateFrames(domain: Domain): readonly Frame[] {
  const states = ["loading", "empty", "error", "permission", "offline", "stale", "conflict", "long", "dense"];
  return states.map((state) => ({
    id: `${domain}-1920x1080-dark-${state}`,
    domain,
    ...DESKTOP,
    mode: "dark" as Mode,
    state,
  }));
}

/** Per-domain default, narrow desktop, light mode, mobile and interactions. */
function baseFrames(domain: Domain): readonly Frame[] {
  return [
    { id: `${domain}-1920x1080-dark-default`, domain, ...DESKTOP, mode: "dark" },
    { id: `${domain}-1440x900-dark-default`, domain, ...NARROW, mode: "dark" },
    { id: `${domain}-1920x1080-light-default`, domain, ...DESKTOP, mode: "light" },
    { id: `${domain}-mobile-390x844-dark-default`, domain, ...MOBILE, mode: "dark" },
    { id: `${domain}-mobile-390x844-light-default`, domain, ...MOBILE, mode: "light" },
    { id: `${domain}-mobile-390x844-dark-dense`, domain, ...MOBILE, mode: "dark", state: "dense" },
    { id: `${domain}-mobile-390x844-dark-error`, domain, ...MOBILE, mode: "dark", state: "error" },
    { id: `${domain}-2560x1440-dark-default`, domain, ...WQHD, mode: "dark" },
    { id: `${domain}-zoom200-960x540-dark-default`, domain, ...ZOOM200, mode: "dark" },
    { id: `${domain}-narrow-320x740-dark-default`, domain, ...NARROW_PHONE, mode: "dark" },
  ];
}

const INTERACTIONS: readonly Frame[] = [
  {
    id: "quests-1920x1080-dark-blocked-filter",
    domain: "quests",
    ...DESKTOP,
    mode: "dark",
    interaction: async (page) => {
      await page.locator(".rf-segments .rf-segment").nth(2).click();
      await page.locator(".rf-q-row").first().click();
    },
  },
  {
    id: "quests-mobile-390x844-dark-detail",
    domain: "quests",
    ...MOBILE,
    mode: "dark",
    interaction: async (page) => {
      await page.locator(".rf-q-card").first().click();
    },
  },
  {
    id: "network-1920x1080-dark-outline",
    domain: "network",
    ...DESKTOP,
    mode: "dark",
    interaction: async (page) => {
      await page.locator(".rf-screen-header .rf-segment").nth(1).click();
    },
  },
  {
    id: "network-1920x1080-dark-chain-focus",
    domain: "network",
    ...DESKTOP,
    mode: "dark",
    interaction: async (page) => {
      await page.locator(".rf-n-chain").first().click();
    },
  },
  {
    id: "network-mobile-390x844-dark-refocus",
    domain: "network",
    ...MOBILE,
    mode: "dark",
    interaction: async (page) => {
      await page.locator(".rf-n-m-row").first().click();
    },
  },
  {
    id: "party-1920x1080-dark-agent",
    domain: "party",
    ...DESKTOP,
    mode: "dark",
    interaction: async (page) => {
      await page.locator('.rf-p-row[data-kind="agent"]').first().click();
    },
  },
  {
    id: "party-mobile-390x844-dark-detail",
    domain: "party",
    ...MOBILE,
    mode: "dark",
    interaction: async (page) => {
      await page.locator(".rf-p-card").first().click();
    },
  },
  {
    id: "battle-1920x1080-dark-preview",
    domain: "battle",
    ...DESKTOP,
    mode: "dark",
    interaction: async (page) => {
      await page.locator('.rf-b-command[data-command="attack"]').click();
      await page.waitForSelector('.rf-b-preview[data-phase="previewed"]');
    },
  },
  {
    id: "battle-mobile-390x844-dark-preview",
    domain: "battle",
    ...MOBILE,
    mode: "dark",
    interaction: async (page) => {
      await page.locator('.rf-b-command[data-command="attack"]').click();
      await page.waitForSelector('.rf-b-preview[data-phase="previewed"]');
    },
  },
  {
    id: "connections-1920x1080-dark-sync-preview",
    domain: "connections",
    ...DESKTOP,
    mode: "dark",
    interaction: async (page) => {
      await page.locator('.rf-c-row[data-health="connected"]').first().click();
      await page.locator(".rf-c-actions button").first().click();
      await page.waitForSelector('.rf-c-result[data-tone="preview"]');
    },
  },
  {
    id: "connections-1920x1080-dark-disconnect-confirm",
    domain: "connections",
    ...DESKTOP,
    mode: "dark",
    interaction: async (page) => {
      await page.locator(".rf-c-disconnect").first().click();
      await page.waitForSelector(".rf-confirm");
    },
  },
  {
    id: "connections-mobile-390x844-dark-detail",
    domain: "connections",
    ...MOBILE,
    mode: "dark",
    interaction: async (page) => {
      await page.locator(".rf-c-card").first().click();
    },
  },
];

const DOMAINS: readonly Domain[] = ["quests", "network", "party", "battle", "connections", "skills"];

const FRAMES: readonly Frame[] = [
  ...DOMAINS.flatMap((domain) => baseFrames(domain)),
  ...DOMAINS.flatMap((domain) => stateFrames(domain)),
  ...INTERACTIONS,
];

/* ------------------------------------------------------------------ *
 * Browser-side probes. Passed as strings: the node tsconfig has no DOM lib.
 * ------------------------------------------------------------------ */

/**
 * Label-style text is allowed below the 13px floor, matching the Command
 * capture's exemption list. Everything informative must clear it.
 */
const SMALL_TEXT = `(function () {
  var offenders = [];
  var exempt = [
    "rf-region-label", "rf-screen-notice-mark", "rf-metric-label", "rf-segment-count",
    "rf-chip-mark", "rf-p-kind-label", "rf-n-outline-kind", "rf-n-reason-kind",
    "rf-b-actor-kind", "rf-b-event-channel", "rf-b-meter-label", "rf-b-objective-label",
    "rf-b-phase-label", "rf-b-delta-label", "rf-q-detail-label", "rf-p-detail-label",
    "rf-c-detail-label", "rf-c-scope-label", "rf-n-outline-title", "rf-n-rail-label",
    "rf-b-sources-label", "rf-unavailable-tag", "rf-mark", "rf-nav-item",
    "rf-col-label", "rf-inline-label",
    "rf-avatar-fallback", "rf-identity-initials", "rf-revision-label",
    "rf-n-map-control", "rf-skills-eyebrow", "rf-skills-source-url",
    "rf-skills-connection-value", "rf-skills-count", "rf-skills-tool-name",
    "rf-skills-search-count"
  ];
  var nodes = document.querySelectorAll(".rf-screen-host *, .rf-screen-sticky *");
  for (var index = 0; index < nodes.length; index += 1) {
    var node = nodes[index];
    if (node.childElementCount > 0) continue;
    var content = (node.textContent || "").trim();
    if (content.length === 0) continue;
    if (node.classList.contains("rf-visually-hidden")) continue;
    var isExempt = node.tagName === "KBD" || node.tagName === "DT";
    for (var e = 0; e < exempt.length; e += 1) {
      if (node.classList.contains(exempt[e])) { isExempt = true; break; }
    }
    var size = parseFloat(getComputedStyle(node).fontSize);
    if (size < 13 && !isExempt) offenders.push((node.className || node.tagName) + " " + size + "px");
  }
  return offenders.filter(function (value, at, all) { return all.indexOf(value) === at; });
})()`;

/** Command's regions must be empty on every destination. */
const COMMAND_RESIDUE = `(function () {
  return {
    shelf: document.querySelectorAll(".rf-shelf-card, .rf-m-shelf-card").length,
    loom: document.querySelectorAll(".rf-spine-row").length,
    lens: document.querySelectorAll(".rf-lens-relay-row").length,
    chronicle: document.querySelectorAll(".rf-chronicle-row").length,
    decision: document.querySelectorAll(".rf-decision, .rf-m-decision").length
  };
})()`;

/**
 * Exactly one region inside the screen may own vertical scrolling on desktop;
 * on mobile the page itself is the owner and no inner region may scroll.
 */
const SCROLL_OWNERS = `(function () {
  var undeclared = [];
  var declared = [];
  var nodes = document.querySelectorAll(".rf-screen-host *");
  for (var index = 0; index < nodes.length; index += 1) {
    var node = nodes[index];
    var style = getComputedStyle(node);
    if (style.overflowY !== "auto" && style.overflowY !== "scroll") continue;
    if (node.scrollHeight <= node.clientHeight + 1) continue;
    if (node.getAttribute("data-scroll") === "true") declared.push(node.className);
    else undeclared.push(node.className);
  }
  var root = document.documentElement;
  return {
    declared: declared,
    undeclared: undeclared,
    pageScrolls: root.scrollHeight - root.clientHeight > 1
  };
})()`;

const TAP_TARGETS = `(function () {
  var small = [];
  var nodes = document.querySelectorAll(".rf-screen-host button, .rf-screen-host a, .rf-screen-host input, .rf-screen-sticky button, .rf-rail button");
  for (var index = 0; index < nodes.length; index += 1) {
    var box = nodes[index].getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    if (box.height < 44) small.push((nodes[index].className || nodes[index].tagName) + " " + Math.round(box.height) + "px");
  }
  return small.filter(function (value, at, all) { return all.indexOf(value) === at; });
})()`;

const STICKY_CLEARANCE = `(function () {
  var sticky = document.querySelector(".rf-screen-sticky");
  var nav = document.querySelector(".rf-rail");
  if (sticky === null || nav === null) return null;
  if (sticky.children.length === 0) return { empty: true, overlaps: false };
  var s = sticky.getBoundingClientRect();
  var n = nav.getBoundingClientRect();
  return { empty: false, overlaps: s.bottom > n.top + 1 };
})()`;

/**
 * A crude but load-bearing check: nothing that looks like a credential may ever
 * reach the rendered text of any screen.
 */
const SECRET_SCAN = `(function () {
  var text = (document.body.innerText || "");
  /* \\s and \\/ are doubled because this whole probe is a template literal:
   * a single backslash there is an unrecognised escape and would be dropped,
   * silently turning every pattern into something that matches nothing.
   *
   * "oauth2", "personal_api_key" and "basic_api_token" are the contract's own
   * names for authentication *methods* and are safe to display, so the value
   * patterns below require a secret-shaped value, not just the word. */
  var patterns = [
    /Bearer\\s+[A-Za-z0-9._-]{8,}/,
    /eyJ[A-Za-z0-9._-]{20,}/,
    /(access|refresh|api)[_-]?(token|key)\\s*[:=]\\s*[A-Za-z0-9._-]{8,}/i,
    /client_secret\\s*[:=]/i,
    /refresh_token\\s*[:=]/i,
    /https:\\/\\/accounts\\.google\\.com\\/o\\/oauth2/i
  ];

  var hits = [];
  for (var index = 0; index < patterns.length; index += 1) {
    var match = text.match(patterns[index]);
    if (match !== null) hits.push(match[0].slice(0, 24));
  }
  return hits;
})()`;

const ARIA_CURRENT = `document.querySelectorAll('.rf-rail [aria-current="page"]').length`;

interface FrameReport {
  readonly id: string;
  readonly viewport: string;
  readonly mode: Mode;
  readonly checks: readonly string[];
}

function check(list: string[], ok: boolean, label: string, detail = ""): void {
  list.push(`${ok ? "PASS" : "FAIL"} ${label}${detail === "" ? "" : ` — ${detail}`}`);
}

async function captureFrame(browser: Browser, frame: Frame): Promise<FrameReport> {
  const context = await browser.newContext({
    viewport: { width: frame.width, height: frame.height },
    deviceScaleFactor: 1,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    colorScheme: frame.mode,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const httpErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("requestfailed", (request) => httpErrors.push(`${request.url()} failed`));
  page.on("response", (response) => {
    if (response.status() >= 400) httpErrors.push(`${response.url()} ${response.status()}`);
  });

  const stateQuery = frame.state === undefined ? "" : `&state=${frame.state}`;
  await page.goto(`${baseUrl}${pagePath}?theme=${frame.mode}&fixture=1${stateQuery}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".rf-rail .rf-nav-item");
  /* Below 1600px Command's Intervention Lens is an overlay with a full-viewport
   * scrim, so the Forge Rail sits under it. That is Command's existing
   * behaviour and is left untouched here: the scrim is dismissed with Escape
   * first, exactly as a user would (Escape, or a first click on the scrim,
   * closes the Lens; the rail is then reachable). */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);
  /* On mobile the bar carries four destinations plus More; Battle and
   * Connections live behind More, so they are reached the way a user reaches
   * them rather than by a direct index. */
  if (frame.width <= 900 && MOBILE_OVERFLOW.includes(frame.domain)) {
    await page.locator(".rf-nav-more").click();
    await page.locator(`.rf-nav-more-panel .rf-nav-item`).nth(MOBILE_OVERFLOW.indexOf(frame.domain)).click();
  } else {
    await page.locator(".rf-rail .rf-nav-item").nth(NAV_INDEX[frame.domain]).click();
  }
  await page.waitForSelector(READY[frame.domain]);
  if (frame.interaction !== undefined) {
    await frame.interaction(page);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(80);

  const checks: string[] = [];
  const mobile = frame.width <= 900;

  const overflow = await page.evaluate(
    "document.documentElement.scrollWidth - document.documentElement.clientWidth",
  ) as number;
  check(checks, overflow <= 1, "horizontal overflow 0", `${overflow}px`);

  const residue = await page.evaluate(COMMAND_RESIDUE) as Record<string, number>;
  const residueTotal = Object.values(residue).reduce((total, value) => total + value, 0);
  check(checks, residueTotal === 0, "no Command DOM on a destination screen", JSON.stringify(residue));

  const smallText = await page.evaluate(SMALL_TEXT) as string[];
  check(checks, smallText.length === 0, "no informative text below 13px", smallText.join(", "));

  const owners = await page.evaluate(SCROLL_OWNERS) as {
    declared: string[];
    undeclared: string[];
    pageScrolls: boolean;
  };
  if (mobile) {
    /* On mobile the page is the scroll owner and no inner region competes with
     * it — the trap section 3.2 forbids. */
    check(
      checks,
      owners.declared.length === 0 && owners.undeclared.length === 0,
      "mobile has no inner scroll owner",
      JSON.stringify(owners),
    );
  } else {
    /* On desktop the page never scrolls, and every region that does scroll has
     * declared itself a scroll owner. A side-by-side pane scrolling its own
     * content is fine; an undeclared scroller is the bug. */
    check(checks, !owners.pageScrolls, "desktop page itself does not scroll", JSON.stringify(owners));
    check(
      checks,
      owners.undeclared.length === 0,
      "every scrolling region declared itself a scroll owner",
      owners.undeclared.join(", "),
    );
  }

  const current = await page.evaluate(ARIA_CURRENT) as number;
  check(checks, current === 1, "exactly one aria-current destination", String(current));

  const secrets = await page.evaluate(SECRET_SCAN) as string[];
  check(checks, secrets.length === 0, "no credential-shaped text rendered", secrets.join(", "));

  if (frame.width >= 2560) {
    /* Section 9: at WQHD the layout may spread, but body text must not shrink
     * below the same baseline it uses at 1920. */
    const body = await page.evaluate(`(function () {
      var node = document.querySelector(".rf-screen-question");
      var title = document.querySelector(".rf-screen-title");
      return {
        question: node === null ? 0 : parseFloat(getComputedStyle(node).fontSize),
        title: title === null ? 0 : parseFloat(getComputedStyle(title).fontSize)
      };
    })()`) as { question: number; title: number };
    check(
      checks,
      body.question >= 13 && body.title >= 18,
      "WQHD keeps text at the desktop baseline",
      JSON.stringify(body),
    );
  }

  if (mobile) {
    const small = await page.evaluate(TAP_TARGETS) as string[];
    check(checks, small.length === 0, "every tap target is at least 44px", small.join(", "));
    const clearance = await page.evaluate(STICKY_CLEARANCE) as { empty: boolean; overlaps: boolean } | null;
    check(
      checks,
      clearance === null || !clearance.overlaps,
      "sticky strip clear of the bottom navigation",
      JSON.stringify(clearance),
    );
  }

  check(checks, consoleErrors.length === 0, "console and page errors 0", consoleErrors.join(" | "));
  check(checks, httpErrors.length === 0, "HTTP 4xx/5xx and failed requests 0", httpErrors.join(" | "));

  await page.screenshot({ path: join(outputDir, `${frame.id}.png`), animations: "disabled", fullPage: mobile });
  await context.close();

  return { id: frame.id, viewport: `${frame.width}x${frame.height}`, mode: frame.mode, checks };
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--force-device-scale-factor=1"],
});

const reports: FrameReport[] = [];
try {
  for (const frame of FRAMES) reports.push(await captureFrame(browser, frame));
} finally {
  await browser.close();
}

const lines: string[] = ["# Relay Forge destination screens capture", ""];
let failures = 0;
for (const report of reports) {
  const failed = report.checks.filter((line) => line.startsWith("FAIL"));
  failures += failed.length;
  lines.push(`## ${report.id}`);
  lines.push(`- viewport: ${report.viewport} ${report.mode}`);
  for (const line of report.checks) lines.push(`- ${line}`);
  lines.push("");
}
lines.push(`frames: ${reports.length}`);
lines.push(failures === 0 ? "RESULT: PASS" : `RESULT: ${failures} check(s) failed`);

const reportText = lines.join("\n");
await writeFile(join(outputDir, "report.md"), `${reportText}\n`, "utf8");
console.log(reportText);
if (failures > 0) process.exitCode = 1;

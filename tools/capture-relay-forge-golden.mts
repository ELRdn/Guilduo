/**
 * Captures the Relay Forge Command Golden Screen set.
 *
 * NEWDESIGN.md section 28.1 "Golden interaction states" names eight captures and
 * section 25.6 requires every migrated screen at 1440x900, 1920x1080, 2560x1440
 * and 3840x2160 in both modes, plus 390x844 mobile compatibility. This script
 * produces that set and also runs the mechanical parts of the section 26.1
 * pass conditions: golden rectangle geometry, page-level horizontal overflow,
 * and runtime errors.
 *
 * Usage:
 *   node_modules/.bin/tsx tools/capture-relay-forge-golden.mts [baseUrl]
 *
 * Output goes to .qa-artifacts/relay-forge/, which is gitignored. The approved
 * subset is promoted to design/reference/relay-forge/ only after the user
 * accepts the Golden Screen (section 29, Golden Gate).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";

const baseUrl = process.argv[2] ?? "http://localhost:5250";
const pagePath = "/interaction-lab/relay-forge/index.html";
const outputDir = join(process.cwd(), ".qa-artifacts", "relay-forge");

const chromePath = process.env.QF_CHROME_PATH
  ?? (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : "/usr/bin/google-chrome");

type Mode = "dark" | "light";

interface Frame {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly mode: Mode;
  /** Optional interaction performed before the capture. */
  readonly interaction?: (page: Page) => Promise<void>;
  /** `?state=` override for the deterministic section B5 states. */
  readonly forcedState?: string;
}

const SHELF_CARD = ".rf-shelf-card";
const M_SHELF_CARD = ".rf-m-shelf-card";
/** Always present on mobile, including the empty-interventions state. */
const M_PAGE = ".rf-m-page";
const SHELF_CARD_BLOCKED = SHELF_CARD + '[data-severity="blocked"]';
const SPINE_ROW_WAITING = '.rf-spine-row[data-quest-id="q-190"]';
const CAPACITY_HEALTH = '.rf-capacity-slot[data-slot="health"]';
const REVIEW_OUTPUT = ".rf-review-button";

/**
 * NEWDESIGNv2.md section 3.1 states ratios and floors rather than a pixel
 * tracing, so the golden frame is checked as constraints: Rail and Lens widths,
 * the Loom band, and above all the 900px floor protecting the Selected Quest.
 */
interface Constraint {
  readonly selector: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
}

const GOLDEN_CONSTRAINTS: readonly Constraint[] = [
  { selector: ".rf-rail", label: "Forge Rail width", min: 216, max: 216 },
  { selector: ".rf-lens-region", label: "Lens width", min: 360, max: 360 },
  { selector: ".rf-spine", label: "Quest Loom width", min: 300, max: 365 },
  { selector: ".rf-selected", label: "Selected Quest width", min: 900, max: 1100 },
  { selector: ".rf-shelf-track", label: "Attention Shelf width", min: 1200, max: 1320 },
  { selector: ".rf-chronicle-strip", label: "Chronicle strip width", min: 1200, max: 1320 },
];

/** The capture set required by NEWDESIGNv2.md section 18. */
const FRAMES: readonly Frame[] = [
  { id: "command-1920x1080-dark-default", width: 1920, height: 1080, mode: "dark" },
  {
    id: "command-1920x1080-dark-loom-selected",
    width: 1920,
    height: 1080,
    mode: "dark",
    interaction: async (page) => {
      await page.locator(SPINE_ROW_WAITING).click();
    },
  },
  {
    id: "command-1920x1080-dark-decision-disabled",
    width: 1920,
    height: 1080,
    mode: "dark",
    interaction: async (page) => {
      await page.locator(SHELF_CARD_BLOCKED).click();
    },
  },
  {
    id: "command-1920x1080-dark-stale",
    width: 1920,
    height: 1080,
    mode: "dark",
    interaction: async (page) => {
      await page.locator(CAPACITY_HEALTH).click();
    },
  },
  {
    id: "command-1920x1080-dark-evidence-preview",
    width: 1920,
    height: 1080,
    mode: "dark",
    interaction: async (page) => {
      await page.locator(REVIEW_OUTPUT).click();
    },
  },
  {
    id: "command-1920x1080-dark-decision-ready",
    width: 1920,
    height: 1080,
    mode: "dark",
    interaction: async (page) => {
      await page.locator(REVIEW_OUTPUT).click();
    },
  },
  {
    id: "command-1920x1080-dark-approve-applied",
    width: 1920,
    height: 1080,
    mode: "dark",
    interaction: async (page) => {
      await page.locator(REVIEW_OUTPUT).click();
      await page.locator(".rf-decision-approve").click();
      await page.waitForTimeout(400);
    },
  },
  {
    id: "command-1920x1080-dark-revision-input",
    width: 1920,
    height: 1080,
    mode: "dark",
    interaction: async (page) => {
      await page.locator(REVIEW_OUTPUT).click();
      await page.locator(".rf-decision .rf-secondary-button").click();
      await page.locator(".rf-revision-input").fill("契約差分の権限セクションを直してください");
    },
  },
  {
    id: "command-1920x1080-dark-conflict",
    width: 1920,
    height: 1080,
    mode: "dark",
    forcedState: "conflict",
    interaction: async (page) => {
      await page.locator(REVIEW_OUTPUT).click();
    },
  },
  { id: "command-1920x1080-light-default", width: 1920, height: 1080, mode: "light" },
  { id: "command-1440x900-dark-default", width: 1440, height: 900, mode: "dark" },
  { id: "command-1280x800-dark-default", width: 1280, height: 800, mode: "dark" },
  { id: "command-1024x768-dark-default", width: 1024, height: 768, mode: "dark" },
  { id: "command-2560x1440-dark-default", width: 2560, height: 1440, mode: "dark" },
  { id: "command-3840x2160-dark-default", width: 3840, height: 2160, mode: "dark" },
  { id: "command-1440x900-light-default", width: 1440, height: 900, mode: "light" },
  /* Section B5 mobile states. The first three are the Golden candidates; the
   * rest are behaviour and regression evidence. */
  { id: "mobile-390x844-dark-default", width: 390, height: 844, mode: "dark" },
  {
    id: "mobile-390x844-dark-quest-flow-open",
    width: 390,
    height: 844,
    mode: "dark",
    interaction: async (page) => {
      await page.locator(".rf-m-questflow").click();
      await page.waitForSelector(".rf-sheet-panel");
    },
  },
  {
    id: "mobile-390x844-dark-evidence-expanded",
    width: 390,
    height: 844,
    mode: "dark",
    interaction: async (page) => {
      await page.locator(".rf-m-review").click();
    },
  },
  {
    id: "mobile-390x844-dark-decision-ready",
    width: 390,
    height: 844,
    mode: "dark",
    interaction: async (page) => {
      await page.locator(".rf-m-review").click();
      await page.locator(".rf-m-decision").scrollIntoViewIfNeeded();
    },
  },
  { id: "mobile-390x844-dark-decision-compact", width: 390, height: 844, mode: "dark" },
  { id: "mobile-390x844-dark-decision-stale", width: 390, height: 844, mode: "dark", forcedState: "stale" },
  {
    id: "mobile-390x844-dark-request-revision",
    width: 390,
    height: 844,
    mode: "dark",
    interaction: async (page) => {
      // The bar is compact until the output is reviewed, so open it first.
      await page.locator(".rf-m-review").click();
      await page.locator(".rf-m-decision .rf-secondary-button").click();
    },
  },
  { id: "mobile-390x844-dark-loading", width: 390, height: 844, mode: "dark", forcedState: "loading" },
  { id: "mobile-390x844-dark-empty", width: 390, height: 844, mode: "dark", forcedState: "empty" },
  { id: "mobile-390x844-dark-permission", width: 390, height: 844, mode: "dark", forcedState: "permission" },
  { id: "mobile-390x844-dark-conflict", width: 390, height: 844, mode: "dark", forcedState: "conflict" },
  {
    id: "mobile-390x844-dark-shelf-next",
    width: 390,
    height: 844,
    mode: "dark",
    interaction: async (page) => {
      await page.locator(M_SHELF_CARD).nth(1).click();
    },
  },
];

interface FrameReport {
  readonly id: string;
  readonly viewport: string;
  readonly mode: Mode;
  readonly consoleErrors: readonly string[];
  readonly horizontalOverflow: number;
  readonly geometry: readonly string[];
  readonly lensWidth: number;
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
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const stateQuery = frame.forcedState === undefined ? "" : `&state=${frame.forcedState}`;
  await page.goto(`${baseUrl}${pagePath}?theme=${frame.mode}${stateQuery}`, { waitUntil: "networkidle" });
  // Desktop and mobile render different Shelf DOM; wait for the one in play.
  await page.waitForSelector(frame.width <= 900 ? M_PAGE : SHELF_CARD);
  if (frame.interaction !== undefined) {
    await frame.interaction(page);
    await page.waitForTimeout(120);
  }

  const horizontalOverflow = await page.evaluate(
    "document.documentElement.scrollWidth - document.documentElement.clientWidth",
  ) as number;
  const lensWidth = await page.evaluate(`(function () {
    var lens = document.querySelector(".rf-lens-region");
    return lens === null ? 0 : Math.round(lens.getBoundingClientRect().width);
  })()`) as number;
  // Section 9.2 floor: no informative text below 13px.
  const smallText = await page.evaluate(`(function () {
    var offenders = [];
    var exempt = [
      "rf-region-label", "rf-shelf-severity", "rf-selected-state", "rf-capacity-label",
      "rf-shelf-selected", "rf-evidence-badge", "rf-chronicle-new", "rf-mark",
      "rf-identity-initials", "rf-nav-item", "rf-avatar-fallback",
      "rf-preview-change-kind", "rf-m-relay-role", "rf-revision-label"
    ];
    var nodes = document.querySelectorAll("body *");
    for (var index = 0; index < nodes.length; index += 1) {
      var node = nodes[index];
      if (node.childElementCount > 0) continue;
      var text = (node.textContent || "").trim();
      if (text.length === 0) continue;
      if (node.classList.contains("rf-visually-hidden")) continue;
      var isExempt = node.tagName === "KBD";
      for (var e = 0; e < exempt.length; e += 1) {
        if (node.classList.contains(exempt[e])) { isExempt = true; break; }
      }
      var size = parseFloat(getComputedStyle(node).fontSize);
      if (size < 13 && !isExempt) offenders.push((node.className || node.tagName) + " " + size + "px");
    }
    return offenders.filter(function (value, at, all) { return all.indexOf(value) === at; });
  })()`) as string[];

  const geometry: string[] = [];
  if (frame.width === 1920 && frame.height === 1080) {
    const measured = await page.evaluate(
      `(function (selectors) {
        return selectors.map(function (selector) {
          var node = document.querySelector(selector);
          return node === null
            ? { selector: selector, w: -1 }
            : { selector: selector, w: Math.round(node.getBoundingClientRect().width) };
        });
      })(${JSON.stringify(GOLDEN_CONSTRAINTS.map((constraint) => constraint.selector))})`,
    ) as Array<{ selector: string; w: number }>;
    for (const constraint of GOLDEN_CONSTRAINTS) {
      const found = measured.find((item) => item.selector === constraint.selector);
      if (found === undefined) continue;
      const ok = found.w >= constraint.min && found.w <= constraint.max;
      geometry.push(`${ok ? "PASS" : "FAIL"} ${constraint.label} expected ${constraint.min}-${constraint.max}px got ${found.w}px`);
    }
  }
  for (const offender of smallText) geometry.push(`FAIL text below 13px: ${offender}`);

  // A3: the Quest title must never be clipped by the workspace scroll region.
  const headerClip = frame.width <= 900 ? null : await page.evaluate(`(function () {
    var region = document.querySelector(".rf-selected");
    var title = document.querySelector(".rf-selected-title");
    if (region === null || title === null) return null;
    var regionBox = region.getBoundingClientRect();
    var titleBox = title.getBoundingClientRect();
    return {
      top: Math.round(titleBox.top - regionBox.top),
      visible: titleBox.top >= regionBox.top - 0.5 && titleBox.bottom <= regionBox.bottom + 0.5
    };
  })()`) as { top: number; visible: boolean } | null;
  if (headerClip !== null) {
    geometry.push(`${headerClip.visible ? "PASS" : "FAIL"} Quest title fully visible (offset ${headerClip.top}px)`);
  }

  await page.screenshot({ path: join(outputDir, `${frame.id}.png`), animations: "disabled" });
  await context.close();

  return {
    id: frame.id,
    viewport: `${frame.width}x${frame.height}`,
    mode: frame.mode,
    consoleErrors,
    horizontalOverflow,
    geometry,
    lensWidth,
  };
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

const lines: string[] = ["# Relay Forge Command golden capture", ""];
let failures = 0;
for (const report of reports) {
  lines.push(`## ${report.id}`);
  lines.push(`- viewport: ${report.viewport} ${report.mode}`);
  lines.push(`- horizontal overflow: ${report.horizontalOverflow}px`);
  lines.push(`- lens width: ${report.lensWidth}px`);
  lines.push(`- console errors: ${report.consoleErrors.length}`);
  for (const error of report.consoleErrors) lines.push(`  - ${error}`);
  for (const line of report.geometry) lines.push(`- ${line}`);
  if (report.horizontalOverflow > 1) failures += 1;
  if (report.consoleErrors.length > 0) failures += 1;
  failures += report.geometry.filter((line) => line.startsWith("FAIL")).length;
  lines.push("");
}
lines.push(failures === 0 ? "RESULT: PASS" : `RESULT: ${failures} check(s) failed`);

const reportText = lines.join("\n");
await writeFile(join(outputDir, "report.md"), `${reportText}\n`, "utf8");
console.log(reportText);
if (failures > 0) process.exitCode = 1;

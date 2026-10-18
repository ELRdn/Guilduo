/**
 * Cognitive-load baseline for a Relay surface in demo mode.
 *
 * Counts, per screen and viewport, what a user must scan before acting:
 * visible interactive controls (in the first viewport and in total), competing
 * primary actions, product-specific jargon, and the controls inside the
 * Quest creation dialog. The same numbers are re-measured on the new surface
 * so the redesign is judged against data, not taste.
 *
 * Usage:
 *   tsx tools/measure-ui-load.mts [baseUrl] [path] [--json out.json]
 */

import { chromium, type Page } from "playwright-core";
import { writeFile } from "node:fs/promises";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:5173";
const path = process.argv[3]?.startsWith("/") ? process.argv[3] : "/interaction-lab/relay-forge/";
const jsonOut = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;
const chromePath = process.env.QF_CHROME_PATH
  ?? (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");

const JARGON = ["Relay", "Loom", "Lens", "Chronicle", "Handoff", "Evidence", "Intervention", "Command", "Workfield", "Shelf", "Party", "MP", "XP"];
// The calm surface navigates with its own tabs and captures inline instead of in a dialog.
const calm = path.includes("all-for-adhd");
const SCREENS = calm ? ["今", "予定", "やること"] : ["ホーム", "Quests", "カレンダー", "ノート"];
const NAV = calm ? ".a4-tabs" : ".rf-rail";

interface Metrics {
  readonly viewport: string;
  readonly screen: string;
  readonly controlsAboveFold: number;
  readonly controlsTotal: number;
  readonly primaryActions: number;
  readonly jargonHits: number;
  readonly textChars: number;
  readonly fixedAreaRatio: number;
}

// Runs in the page; kept as plain JavaScript so the Node typecheck needs no DOM lib.
const MEASURE = `(({ viewport, screen, jargon }) => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !el.closest("[hidden],dialog:not([open])");
  };
  const onScreen = (el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0; };
  const controls = [...document.querySelectorAll("button,a[href],input,select,textarea,summary,[role=button],[role=tab],[role=option]")].filter(visible);
  const primary = controls.filter(el => el.matches(".rf-primary-button,.a4-primary,[data-primary]"));
  const text = document.body.innerText;
  const hits = jargon.reduce((sum, word) => sum + (text.match(new RegExp("\\\\b" + word + "\\\\b", "g")) || []).length, 0);
  // Viewport share covered by fixed/sticky chrome. A fixed element inside a sticky
  // one still covers its own area; anything else nested is already counted.
  const position = (el) => getComputedStyle(el).position;
  const fixed = [...document.querySelectorAll("body *")].filter(el => {
    const own = position(el);
    if ((own !== "fixed" && own !== "sticky") || !visible(el) || !onScreen(el)) return false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const parent = position(p);
      if (parent === "fixed" || (parent === "sticky" && own === "sticky")) return false;
    }
    return true;
  });
  const covered = fixed.reduce((sum, el) => { const r = el.getBoundingClientRect(); return sum + Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) * Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)); }, 0);
  return {
    viewport, screen,
    controlsAboveFold: controls.filter(onScreen).length,
    controlsTotal: controls.length,
    primaryActions: primary.length,
    jargonHits: hits,
    textChars: text.replace(/\\s+/g, "").length,
    fixedAreaRatio: Math.round(Math.min(1, covered / (innerWidth * innerHeight)) * 100) / 100,
  };
})`;

async function measure(page: Page, viewport: string, screen: string): Promise<Metrics> {
  return page.evaluate(`${MEASURE}(${JSON.stringify({ viewport, screen, jargon: JARGON })})`) as Promise<Metrics>;
}

async function openDemo(page: Page): Promise<void> {
  await page.goto(`${baseUrl}${path}${calm ? "?demo" : ""}`, { waitUntil: "networkidle" });
  const demo = page.getByRole("button", { name: "デモを見る" });
  if (await demo.count()) await demo.click();
  await page.waitForTimeout(1200);
}

async function goTo(page: Page, label: string): Promise<boolean> {
  const target = page.locator(NAV).getByRole(calm ? "link" : "button", { name: label, exact: true }).first();
  if (!(await target.count()) || !(await target.isVisible())) return false;
  await target.click();
  await page.waitForTimeout(600);
  return true;
}

async function createDialogLoad(page: Page): Promise<{ fields: number; requiredFields: number; stepsToSave: number }> {
  // Inline capture: type the title and press Enter.
  if (calm) return { fields: await page.locator(".a4-capture input:visible").count(), requiredFields: 1, stepsToSave: 2 };
  const trigger = page.locator(".rf-create:visible, .rf-m-create:visible, [data-create]:visible").first();
  if (!(await trigger.count())) return { fields: -1, requiredFields: -1, stepsToSave: -1 };
  await trigger.click();
  await page.waitForSelector("dialog[open]");
  const result = await page.evaluate(`(() => {
    const fields = [...document.querySelector("dialog[open]").querySelectorAll("input,select,textarea")].filter(el => el.offsetParent !== null);
    return { fields: fields.length, requiredFields: fields.filter(el => el.required).length };
  })()`) as { fields: number; requiredFields: number };
  await page.keyboard.press("Escape");
  // open + type title + save, plus one step per extra required field.
  return { ...result, stepsToSave: 3 + Math.max(0, result.requiredFields - 1) };
}

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const rows: Metrics[] = [];
const create: Record<string, unknown> = {};
try {
  for (const [name, width, height, touch] of [["desktop", 1440, 900, false], ["mobile", 390, 844, true]] as const) {
    const context = await browser.newContext({ viewport: { width, height }, locale: "ja", timezoneId: "Asia/Tokyo", colorScheme: "dark", reducedMotion: "reduce", isMobile: touch, hasTouch: touch });
    await context.addInitScript("localStorage.setItem('questforge-locale', 'ja');");
    const page = await context.newPage();
    await openDemo(page);
    for (const screen of SCREENS) {
      if (screen !== SCREENS[0] && !(await goTo(page, screen))) continue;
      rows.push(await measure(page, name, screen));
    }
    await goTo(page, SCREENS[0]);
    create[name] = await createDialogLoad(page);
    await context.close();
  }
} finally {
  await browser.close();
}

console.table(rows);
console.log("create dialog", create);
if (jsonOut) await writeFile(jsonOut, JSON.stringify({ baseUrl, path, measuredAt: new Date().toISOString(), rows, create }, null, 2));

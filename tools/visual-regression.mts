import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium, type Browser, type ConsoleMessage, type Page } from "playwright-core";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

type Command = "capture" | "diff" | "check" | "matrix";
interface BrowserElement {
  dataset: { vfId?: string; qfResolvedMode?: string };
  getBoundingClientRect(): { x: number; y: number; width: number; height: number; right: number };
  tagName: string;
  className: string;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
  id: string;
  getAttribute(name: string): string | null;
  querySelectorAll(selector: string): BrowserElement[];
}

declare const document: {
  documentElement: BrowserElement & { scrollWidth: number };
  body: { scrollWidth: number };
  fonts: { ready: Promise<void> };
  querySelector(selector: string): BrowserElement | null;
  querySelectorAll(selector: string): BrowserElement[];
};
declare const window: { innerWidth: number };

declare function getComputedStyle(element: BrowserElement): {
  display: string;
  overflowX: string;
  overflowY: string;
  backgroundColor: string;
  color: string;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  letterSpacing: string;
};

interface ReferenceScreen {
  id: string;
  normalized: string;
  route: string;
  region: string;
}

interface Manifest {
  capture: { viewport: { width: number; height: number }; sourceCrop: { width: number; height: number } };
  thresholds: { globalDiffPercent: number; signatureRegionDiffPercent: number; geometryDeltaPx: number };
  screens: ReferenceScreen[];
}

interface RegionSnapshot {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  display: string;
  overflowX: string;
  overflowY: string;
}

interface CaptureReport {
  id: string;
  route: string;
  consoleErrors: string[];
  responseErrors: string[];
  overflow: string[];
  regions: RegionSnapshot[];
  islandErrors: string[];
  computedStyles: Array<{ id: string; backgroundColor: string; color: string; fontFamily: string; fontSize: string; lineHeight: string; letterSpacing: string }>;
  lineWraps: string[];
  islandReadyMs: number;
  captureReadyMs: number;
  duplicateVfIds: string[];
}

const root = resolve(process.cwd());
const referenceRoot = join(root, "design/reference/v3-lock");
const artifactRoot = join(root, ".qa-artifacts/visual-v4");
const command = (process.argv[2] || "check") as Command;
const manifest = JSON.parse(await readFile(join(referenceRoot, "manifest.json"), "utf8")) as Manifest;
const regionIds = new Set(["MissionSpine", "StatusStrip", "InspectorShell", "FormationBoard", "IntegrationNetwork", "DependencyGraph", "AgentGrid", "CampaignMap"]);

function urlFor(route: string): string {
  return new URL(route, process.env.QF_VISUAL_URL || "http://127.0.0.1:5188/interaction-lab/").toString();
}

function candidatePath(id: string): string {
  return join(artifactRoot, "candidates", `${id}.png`);
}

function reportPath(id: string): string {
  return join(artifactRoot, "reports", `${id}.json`);
}

async function collectReport(page: Page, id: string, route: string, consoleErrors: string[], responseErrors: string[], captureReadyMs: number): Promise<CaptureReport> {
  const inspection = await page.evaluate((allowedIds) => {
    const regionElements = [...document.querySelectorAll("[data-vf-id]")] as unknown as BrowserElement[];
    const regions = regionElements.map((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { id: element.dataset.vfId || "", x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height), display: style.display, overflowX: style.overflowX, overflowY: style.overflowY };
    }).filter((region) => allowedIds.includes(region.id) && region.width > 0 && region.height > 0);
    const computedStyles = regionElements.map((element) => {
      const style = getComputedStyle(element);
      return { id: element.dataset.vfId || "", backgroundColor: style.backgroundColor, color: style.color, fontFamily: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing };
    }).filter((style) => allowedIds.includes(style.id));
    const lineWraps = regionElements.flatMap((element) => {
      if (!allowedIds.includes(element.dataset.vfId || "")) return [];
      const root = element as unknown as BrowserElement;
      return [...root.querySelectorAll("[data-vf-no-wrap]")].filter((child) => child.scrollWidth > child.clientWidth || child.scrollHeight > child.clientHeight).map((child) => child.id || child.getAttribute("data-vf-no-wrap") || child.className);
    });
    const documentOverflow = document.documentElement.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1;
    const overflow = documentOverflow ? ["document:" + document.documentElement.scrollWidth + "/" + window.innerWidth] : [];
    const islandErrors = [...document.querySelectorAll("[data-island-load='error'], [data-island-error='true']")].map((element: BrowserElement) => element.id || element.className);
    const visibleCounts = new Map<string, number>();
    for (const region of regions) visibleCounts.set(region.id, (visibleCounts.get(region.id) || 0) + 1);
    const duplicateVfIds = [...visibleCounts.entries()].filter(([, count]) => count > 1).map(([duplicateId, count]) => `${duplicateId} x${count}`);
    return { regions, computedStyles, lineWraps, overflow, islandErrors, islandReadyMs: Math.round(performance.now()), duplicateVfIds };
  }, [...regionIds]);
  return { id, route, consoleErrors, responseErrors, overflow: inspection.overflow, regions: inspection.regions, islandErrors: inspection.islandErrors, computedStyles: inspection.computedStyles, lineWraps: inspection.lineWraps, islandReadyMs: inspection.islandReadyMs, captureReadyMs, duplicateVfIds: inspection.duplicateVfIds };
}

async function capture(): Promise<void> {
  await mkdir(join(artifactRoot, "candidates"), { recursive: true });
  await mkdir(join(artifactRoot, "reports"), { recursive: true });
  const chromePath = process.env.QF_CHROME_PATH || (process.platform === "win32"
    ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
    : "/usr/bin/google-chrome");
  const browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ["--force-device-scale-factor=1"] });
  try {
    for (const screen of manifest.screens) {
      const consoleErrors: string[] = [];
      const responseErrors: string[] = [];
      const captureStartedAt = Date.now();
      const page = await browser.newPage({ viewport: manifest.capture.viewport, deviceScaleFactor: 1, locale: "ja-JP", timezoneId: "Asia/Tokyo", colorScheme: "dark" });
      await page.addInitScript(() => {
        const fixed = 1_759_046_400_000;
        Date.now = () => fixed;
        Math.random = () => 0.314159265;
      });
      page.on("console", (message: ConsoleMessage) => { if (message.type() === "error") consoleErrors.push(`${message.text()} @ ${message.location().url}`); });
      page.on("response", (response) => { if (response.status() >= 400) responseErrors.push(`${response.status()} ${response.url()}`); });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const captureUrl = new URL(urlFor(screen.route));
      captureUrl.searchParams.set("visualFixture", "v3");
      await page.goto(captureUrl.toString(), { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: candidatePath(screen.id), animations: "disabled" });
      const report = await collectReport(page, screen.id, screen.route, consoleErrors, responseErrors, Date.now() - captureStartedAt);
      await writeFile(reportPath(screen.id), JSON.stringify(report, null, 2) + "\n");
      await page.close();
      console.log(`captured ${screen.id}`);
    }
  } finally {
    await browser.close();
  }
}

function diffPath(id: string, suffix?: string): string {
  return join(artifactRoot, "diffs", suffix ? `${id}-${suffix}.png` : `${id}.png`);
}

async function diffPng(referencePath: string, candidate: string, id: string): Promise<{ percent: number; width: number; height: number }> {
  const reference = PNG.sync.read(await readFile(referencePath));
  const actual = PNG.sync.read(await readFile(candidate));
  if (reference.width !== actual.width || reference.height !== actual.height) throw new Error(`image size differs: reference ${reference.width}×${reference.height}, candidate ${actual.width}×${actual.height}`);
  const output = new PNG({ width: reference.width, height: reference.height });
  const count = pixelmatch(reference.data, actual.data, output.data, reference.width, reference.height, { threshold: 0.1 });
  await mkdir(join(artifactRoot, "diffs"), { recursive: true });
  await writeFile(diffPath(id), PNG.sync.write(output));
  return { percent: count / (reference.width * reference.height) * 100, width: reference.width, height: reference.height };
}


async function diffRegion(referencePath: string, candidatePathValue: string, region: RegionSnapshot, id: string): Promise<number> {
  const reference = PNG.sync.read(await readFile(referencePath));
  const actual = PNG.sync.read(await readFile(candidatePathValue));
  const x = Math.max(0, Math.min(region.x, reference.width - 1));
  const y = Math.max(0, Math.min(region.y, reference.height - 1));
  const width = Math.max(1, Math.min(region.width, reference.width - x, actual.width - x));
  const height = Math.max(1, Math.min(region.height, reference.height - y, actual.height - y));
  const referenceCrop = new PNG({ width, height });
  const actualCrop = new PNG({ width, height });
  PNG.bitblt(reference, referenceCrop, x, y, width, height, 0, 0);
  PNG.bitblt(actual, actualCrop, x, y, width, height, 0, 0);
  const diff = new PNG({ width, height });
  const count = pixelmatch(referenceCrop.data, actualCrop.data, diff.data, width, height, { threshold: 0.1 });
  await mkdir(join(artifactRoot, "diffs"), { recursive: true });
  await writeFile(diffPath(id, region.id), PNG.sync.write(diff));
  return count / (width * height) * 100;
}

async function evaluate(): Promise<string[]> {
  const failures: string[] = [];
  for (const screen of manifest.screens) {
    const report = JSON.parse(await readFile(reportPath(screen.id), "utf8")) as CaptureReport;
    const global = await diffPng(join(referenceRoot, screen.normalized), candidatePath(screen.id), screen.id);
    const referenceImage = PNG.sync.read(await readFile(join(referenceRoot, screen.normalized)));
    const candidateImage = PNG.sync.read(await readFile(candidatePath(screen.id)));
    console.log(screen.id + ": ref " + dominantColors(referenceImage) + " | candidate " + dominantColors(candidateImage));
    if (global.percent > manifest.thresholds.globalDiffPercent) failures.push(`${screen.id}: global diff ${global.percent.toFixed(2)}% > ${manifest.thresholds.globalDiffPercent}%`);
    const region = report.regions.find((item) => item.id === screen.region);
    if (!region) failures.push(`${screen.id}: missing Signature Region ${screen.region}`);
    const regionDiff = region ? await diffRegion(join(referenceRoot, screen.normalized), candidatePath(screen.id), region, screen.id) : null;
    if (regionDiff !== null && regionDiff > manifest.thresholds.signatureRegionDiffPercent) failures.push(`${screen.id}: ${screen.region} diff ${regionDiff.toFixed(2)}% > ${manifest.thresholds.signatureRegionDiffPercent}%`);
    if (report.consoleErrors.length) failures.push(`${screen.id}: console errors ${report.consoleErrors.length}`);
    if (report.responseErrors.length) failures.push(`${screen.id}: HTTP errors ${report.responseErrors.length}`);
    if (report.overflow.length) failures.push(`${screen.id}: horizontal overflow ${report.overflow.length}`);
    if (report.islandErrors.length) failures.push(`${screen.id}: Island failures ${report.islandErrors.length}`);
    if ((report.lineWraps || []).length) failures.push(screen.id + ": line-wrap violations " + report.lineWraps.length);
    if ((report.duplicateVfIds || []).length) failures.push(`${screen.id}: duplicate data-vf-id ${report.duplicateVfIds.join(", ")}`);
    console.log(screen.id + ": global diff " + global.percent.toFixed(2) + "%, region " + (region ? region.id + " " + region.width + "×" + region.height + " diff " + (regionDiff === null ? "n/a" : regionDiff.toFixed(2) + "%") : "missing") + ", ready " + report.captureReadyMs + "ms");
  }
  return failures;
}



async function matrixSmoke(): Promise<void> {
  const browser = await chromium.launch({ executablePath: process.env.QF_CHROME_PATH || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome"), headless: true, args: ["--force-device-scale-factor=1"] });
  const tabs = ["today", "quests", "tree", "agents", "reviews", "battle", "party", "integrations", "profile", "settings"];
  const themes = ["arcane", "soft-ops", "retro"];
  const modes = ["light", "dark"];
  const viewports = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
  const failures: string[] = [];
  try {
    for (const viewport of viewports) for (const theme of themes) for (const mode of modes) for (const tab of tabs) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1, locale: "ja-JP", timezoneId: "Asia/Tokyo", colorScheme: mode as "light" | "dark" });
      const errors: string[] = [];
      page.on("console", (message: ConsoleMessage) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("response", (response) => { if (response.status() >= 400) errors.push(response.url()); });
      await page.addInitScript(({ selectedTheme, selectedMode }) => {
        localStorage.setItem("questforge-interaction-settings", JSON.stringify({ theme: selectedTheme, mode: selectedMode }));
        const fixed = 1_759_046_400_000;
        Date.now = () => fixed;
        Math.random = () => 0.314159265;
      }, { selectedTheme: theme, selectedMode: mode });
      await page.goto(urlFor("#" + tab), { waitUntil: "networkidle" });
      await page.waitForTimeout(220);
      const result = await page.evaluate(() => ({
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
        resolvedMode: document.documentElement.dataset.qfResolvedMode,
        active: document.querySelector(".view.is-active")?.getAttribute("data-panel"),
        offenders: [...document.querySelectorAll("*")].filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 8).map((element) => ({ tag: element.tagName, id: element.id, className: String(element.className), right: Math.round(element.getBoundingClientRect().right), width: Math.round(element.getBoundingClientRect().width) })),
      }));
      if (result.overflow > 1) failures.push(tab + "/" + theme + "/" + mode + "/" + viewport.width + ": overflow " + result.overflow + " offenders " + JSON.stringify(result.offenders));
      if (errors.length) failures.push(tab + "/" + theme + "/" + mode + "/" + viewport.width + ": runtime " + errors.length);
      if (result.active !== (tab === "quests" ? "today" : tab)) failures.push(tab + ": active panel " + (result.active || "missing"));
      await page.close();
    }
    for (const colorScheme of ["light", "dark"] as const) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "ja-JP", timezoneId: "Asia/Tokyo", colorScheme });
      await page.addInitScript(() => localStorage.setItem("questforge-interaction-settings", JSON.stringify({ theme: "soft-ops", mode: "system" })));
      await page.emulateMedia({ colorScheme });
      await page.goto(urlFor("#today"), { waitUntil: "networkidle" });
      await page.waitForTimeout(220);
      const resolved = await page.evaluate(() => document.documentElement.dataset.qfResolvedMode);
      if (resolved !== colorScheme) failures.push("system mode did not resolve to " + colorScheme);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  if (failures.length) {
    console.error(failures.slice(0, 40).map((failure) => "- " + failure).join("\n"));
    process.exitCode = 1;
  } else console.log("matrix smoke gate: ok");
}

if (command === "capture") await capture();
else if (command === "matrix") await matrixSmoke();
else if (command === "diff") {
  const failures = await evaluate();
  if (failures.length) process.exitCode = 1;
} else {
  const failures = await evaluate();
  if (failures.length) {
    console.error(failures.map((failure) => `- ${failure}`).join("\n"));
    process.exitCode = 1;
  } else console.log("visual gate: ok");
}

function dominantColors(image: PNG): string {
  const colors = new Map<string, number>();
  for (let index = 0; index < image.data.length; index += 4) {
    const color = [image.data[index], image.data[index + 1], image.data[index + 2]].map((channel) => channel.toString(16).padStart(2, "0")).join("");
    colors.set(color, (colors.get(color) || 0) + 1);
  }
  return [...colors.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5).map(([color, count]) => "#" + color + "=" + count).join(" ");
}

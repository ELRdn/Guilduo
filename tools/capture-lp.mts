import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.argv[2] ?? "http://localhost:5173";
const outputDir = join(process.cwd(), ".qa-artifacts", "lp");
const chromePath = process.env.QF_CHROME_PATH
  ?? (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");

const frames = [
  { id: "ja-320-dark", path: "/lp/", width: 320, height: 740, theme: "dark", reduced: false },
  { id: "ja-375-dark", path: "/lp/", width: 375, height: 812, theme: "dark", reduced: false },
  { id: "ja-390-dark", path: "/lp/", width: 390, height: 844, theme: "dark", reduced: false },
  { id: "ja-414-dark", path: "/lp/", width: 414, height: 896, theme: "dark", reduced: false },
  { id: "ja-768-dark", path: "/lp/", width: 768, height: 1024, theme: "dark", reduced: false },
  { id: "ja-1024-dark", path: "/lp/", width: 1024, height: 768, theme: "dark", reduced: false },
  { id: "ja-1440-dark", path: "/lp/", width: 1440, height: 900, theme: "dark", reduced: false },
  { id: "ja-1920-dark", path: "/lp/", width: 1920, height: 1080, theme: "dark", reduced: false },
  { id: "ja-390-light", path: "/lp/", width: 390, height: 844, theme: "light", reduced: false },
  { id: "ja-1440-light", path: "/lp/", width: 1440, height: 900, theme: "light", reduced: false },
  { id: "en-390-dark", path: "/lp/en/", width: 390, height: 844, theme: "dark", reduced: false },
  { id: "en-1440-dark", path: "/lp/en/", width: 1440, height: 900, theme: "dark", reduced: false },
  { id: "ja-390-reduced", path: "/lp/", width: 390, height: 844, theme: "dark", reduced: true },
] as const;

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
try {
  for (const frame of frames) {
    const context = await browser.newContext({
      viewport: { width: frame.width, height: frame.height },
      locale: frame.path.includes("/en/") ? "en-US" : "ja-JP",
      colorScheme: frame.theme,
      reducedMotion: frame.reduced ? "reduce" : "no-preference",
      deviceScaleFactor: 1,
    });
    await context.addInitScript((theme) => localStorage.setItem("guilduo-lp-theme", theme), frame.theme);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`${baseUrl}${frame.path}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".hero-loom");
    if (frame.id === "ja-390-dark" || frame.id === "ja-1440-dark" || frame.id === "ja-1920-dark") {
      await page.screenshot({ path: join(outputDir, `${frame.id}-hero.png`), fullPage: false });
    }
    for (const selector of ["#relationship", "#product", "#control", "#guild", "#comparison", "#join"]) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await page.waitForTimeout(80);
    }
    await page.waitForFunction(() => {
      const browser = globalThis as unknown as { document: { images: ArrayLike<{ src: string; complete: boolean }> } };
      return Array.from(browser.document.images).every((image) => !image.src || image.complete);
    });
    await page.evaluate(() => {
      const browser = globalThis as unknown as { scrollTo(options: { top: number; behavior: "auto" }): void };
      browser.scrollTo({ top: 0, behavior: "auto" });
    });
    await page.waitForTimeout(100);
    const overflow = await page.evaluate(() => {
      const browser = globalThis as unknown as { document: { documentElement: { scrollWidth: number; clientWidth: number } } };
      return browser.document.documentElement.scrollWidth - browser.document.documentElement.clientWidth;
    });
    if (overflow > 0 || errors.length > 0) throw new Error(`${frame.id}: overflow=${overflow}, errors=${errors.join(" | ")}`);
    await page.screenshot({ path: join(outputDir, `${frame.id}.png`), fullPage: true });
    if (frame.id === "ja-1920-dark") {
      for (const [name, selector] of [
        ["command-heading", "#product .section-heading"],
        ["relay-heading", "#relay .section-heading"],
        ["guild-heading", "#guild .section-heading"],
        ["comparison-heading", "#comparison .section-heading"],
        ["footer", ".site-footer"],
      ] as const) {
        await page.locator(selector).screenshot({ path: join(outputDir, `${frame.id}-${name}.png`) });
      }
    }
    console.log(`captured ${frame.id}`);
    await context.close();
  }
} finally {
  await browser.close();
}

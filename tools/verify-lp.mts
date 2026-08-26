import { chromium, type BrowserContext, type Page } from "playwright-core";

const baseUrl = process.argv[2] ?? "http://localhost:5173";
const chromePath = process.env.QF_CHROME_PATH
  ?? (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome");

let failures = 0;
const results: string[] = [];
function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failures += 1;
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function open(context: BrowserContext, path: string): Promise<Page> {
  const page = await context.newPage();
  page.on("pageerror", (error) => check("no page error", false, error.message));
  page.on("console", (message) => {
    if (message.type() === "error") check("console clean", false, message.text());
  });
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".hero-loom");
  return page;
}

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
try {
  for (const frame of [
    { width: 320, height: 740 },
    { width: 375, height: 812 },
    { width: 414, height: 896 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    const context = await browser.newContext({ viewport: frame, locale: "ja-JP", colorScheme: "dark" });
    const page = await open(context, "/lp/");
    const metrics = await page.evaluate(() => {
      const browser = globalThis as unknown as {
        document: {
          documentElement: { scrollWidth: number; clientWidth: number; lang: string };
          querySelector(selector: string): {
            textContent?: string | null;
            disabled?: boolean;
            tagName?: string;
            href?: string;
            dataset?: { state?: string };
          } | null;
        };
      };
      const joinCta = browser.document.querySelector("[data-join-cta]");
      return {
        scrollWidth: browser.document.documentElement.scrollWidth,
        clientWidth: browser.document.documentElement.clientWidth,
        lang: browser.document.documentElement.lang,
        toolCount: browser.document.querySelector("[data-tool-count]")?.textContent,
        joinCta: joinCta ? {
          tagName: joinCta.tagName,
          disabled: joinCta.disabled,
          href: joinCta.href,
          state: joinCta.dataset?.state,
        } : null,
      };
    });
    check(`${frame.width}px has no horizontal overflow`, metrics.scrollWidth <= metrics.clientWidth, JSON.stringify(metrics));
    check(`${frame.width}px hydrates source-backed facts`, metrics.toolCount === "51", JSON.stringify(metrics));
    const joinCtaValid = metrics.joinCta?.tagName === "A"
      ? metrics.joinCta.state === "ready" && new URL(metrics.joinCta.href ?? "", baseUrl).pathname === "/next/"
      : metrics.joinCta?.tagName === "BUTTON" && metrics.joinCta.disabled === true;
    check(`${frame.width}px CTA follows runtime configuration`, joinCtaValid, JSON.stringify(metrics));
    const brokenPhraseLocks = await page.evaluate(() => {
      const browser = globalThis as unknown as {
        document: {
          createRange(): {
            selectNodeContents(node: unknown): void;
            getClientRects(): ArrayLike<{ top: number; width: number }>;
          };
          querySelectorAll(selector: string): ArrayLike<{ textContent?: string | null }>;
        };
      };
      const selector = ".phrase-lock, .hero .display-line, .site-footer .display-line";
      return Array.from(browser.document.querySelectorAll(selector)).flatMap((element) => {
        const range = browser.document.createRange();
        range.selectNodeContents(element);
        const tops = Array.from(range.getClientRects())
          .filter((rect) => rect.width > 0)
          .map((rect) => rect.top);
        const spansMultipleLines = tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 4;
        return spansMultipleLines ? [element.textContent?.trim() ?? "unknown"] : [];
      });
    });
    check(`${frame.width}px keeps intentional phrases on one line`, brokenPhraseLocks.length === 0, JSON.stringify(brokenPhraseLocks));
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, locale: "en-US", colorScheme: "light", reducedMotion: "reduce" });
  const page = await open(context, "/lp/en/");
  check("English route has English document language", await page.getAttribute("html", "lang") === "en");
  await page.selectOption("[data-theme-control]", "light");
  check("theme control applies light mode", await page.getAttribute("html", "data-theme") === "light");
  await page.reload({ waitUntil: "networkidle" });
  check("theme preference persists", await page.getAttribute("html", "data-theme-choice") === "light");
  const reduced = await page.evaluate(() => {
    const browser = globalThis as unknown as {
      document: { querySelector(selector: string): { getBoundingClientRect(): { height: number } } | null };
      innerHeight: number;
      getComputedStyle(element: unknown): { display: string };
    };
    const relayDot = browser.document.querySelector(".quest-relay-dot");
    return {
      relationshipHeight: Math.round(browser.document.querySelector(".relationship")?.getBoundingClientRect().height ?? 0),
      viewport: browser.innerHeight,
      relayDot: relayDot ? browser.getComputedStyle(relayDot).display : "missing",
    };
  });
  check("Reduced Motion disables relay travel", reduced.relayDot === "none", JSON.stringify(reduced));
  await page.keyboard.press("Tab");
  check("keyboard focus enters the page", await page.evaluate(() => {
    const browser = globalThis as unknown as { document: { activeElement: unknown; body: unknown } };
    return browser.document.activeElement !== browser.document.body;
  }));
  const initiallyDeferred = await page.locator("#product img").evaluate((image: { naturalWidth: number }) => image.naturalWidth === 0);
  check("Below-fold Product Proof stays deferred above the fold", initiallyDeferred);
  await page.locator("#product").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const browser = globalThis as unknown as { document: { querySelector(selector: string): { naturalWidth?: number } | null } };
    return (browser.document.querySelector("#product img")?.naturalWidth ?? 0) > 0;
  });
  const imageReady = await page.locator("#product img").evaluate((image: { complete: boolean; naturalWidth: number }) => image.complete && image.naturalWidth === 1920);
  check("Product Proof loads at the workbench", imageReady);
  await context.close();
} finally {
  await browser.close();
}

console.log(results.join("\n"));
if (failures > 0) process.exitCode = 1;

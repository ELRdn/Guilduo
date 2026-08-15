from pathlib import Path

from playwright.sync_api import sync_playwright


BASE_URL = "http://127.0.0.1:5192/next/"
OUTPUT = Path("screenshots/public-beta")


def wait_for_page(page):
    page.goto(BASE_URL, wait_until="domcontentloaded")
    try:
        page.wait_for_load_state("networkidle", timeout=10000)
    except Exception:
        pass
    page.wait_for_timeout(700)


def inspect_layout(page, width):
    return page.evaluate(
        """
        (width) => {
          const rect = (selector) => {
            const node = document.querySelector(selector);
            if (!node) return null;
            const value = node.getBoundingClientRect();
            return {left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height};
          };
          const questList = document.querySelector('#questList');
          const overlaps = [...document.querySelectorAll('.quest-row')].slice(0, 30).filter((row) => {
            const number = row.querySelector('.quest-number')?.getBoundingClientRect();
            const summary = row.querySelector('.quest-summary')?.getBoundingClientRect();
            return number && summary && number.right > summary.left - 2;
          }).length;
          return {
            viewportWidth: width,
            bodyScrollWidth: document.documentElement.scrollWidth,
            bodyClientWidth: document.documentElement.clientWidth,
            bodyScrollHeight: document.documentElement.scrollHeight,
            bodyClientHeight: document.documentElement.clientHeight,
            questList: questList ? {scrollHeight: questList.scrollHeight, clientHeight: questList.clientHeight, overflowY: getComputedStyle(questList).overflowY} : null,
            todaySide: rect('.today-side'),
            taskBoard: rect('.quest-board'),
            numberSummaryOverlaps: overlaps,
            syncStatus: document.querySelector('#dataSourceStatus')?.textContent || '',
          };
        }
        """,
        width,
    )


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    report = []
    console_errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for name, width, height in [
            ("desktop-1920", 1920, 1080),
            ("desktop-1280", 1280, 720),
            ("tablet-1024", 1024, 900),
            ("tablet-901", 901, 900),
            ("mobile-pixel9", 412, 915),
            ("mobile-small", 390, 844),
        ]:
            page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
            page.on("console", lambda message: console_errors.append(f"{name}: console {message.type}: {message.text}") if message.type == "error" else None)
            page.on("pageerror", lambda error: console_errors.append(f"{name}: pageerror: {error}"))
            wait_for_page(page)
            page.screenshot(path=str(OUTPUT / f"{name}-today.png"), full_page=True)
            layout = inspect_layout(page, width)
            assert layout["bodyScrollWidth"] <= width + 2, layout
            assert layout["numberSummaryOverlaps"] == 0, layout
            if width >= 901:
                assert layout["questList"]["overflowY"] in ("auto", "scroll"), layout
                assert layout["questList"]["scrollHeight"] >= layout["questList"]["clientHeight"], layout
            else:
                assert layout["questList"]["overflowY"] == "visible", layout

            settings = page.locator('[data-view="settings"]').first
            settings.click()
            page.wait_for_timeout(250)
            page.screenshot(path=str(OUTPUT / f"{name}-settings.png"), full_page=True)
            page.select_option("#labLocaleSelect", "en")
            page.wait_for_timeout(150)
            page.screenshot(path=str(OUTPUT / f"{name}-english.png"), full_page=True)
            assert page.locator("#pageTitle").inner_text() == "Settings", page.locator("#pageTitle").inner_text()

            integrations = page.locator('[data-view="integrations"]').first
            integrations.click()
            page.wait_for_timeout(250)
            page.screenshot(path=str(OUTPUT / f"{name}-integrations.png"), full_page=True)
            note = page.locator("#integrationPublicBetaNote")
            assert note.is_visible(), name
            assert "preparation" in note.inner_text().lower() or "OAuth" in note.inner_text(), note.inner_text()
            assert page.locator("#previewButton").is_disabled()
            assert page.locator("#syncButton").is_disabled()
            report.append({"name": name, "layout": layout})
            page.close()
        browser.close()

    (OUTPUT / "report.json").write_text(__import__("json").dumps({"screens": report, "consoleErrors": console_errors}, ensure_ascii=False, indent=2), encoding="utf-8")
    if console_errors:
        raise AssertionError("Browser errors found: " + " | ".join(console_errors))
    print(__import__("json").dumps({"screens": report, "consoleErrors": console_errors}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

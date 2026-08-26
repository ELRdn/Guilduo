from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173/interaction-lab/relay-forge/"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    console_errors = []
    page_errors = []
    failed = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.on("requestfailed", lambda req: failed.append(f"{req.method} {req.url}"))

    page.goto(BASE, wait_until="networkidle")
    page.get_by_role("heading", name="Guilduoへサインイン").wait_for()
    assert page.get_by_role("button", name="Googleでサインイン").is_visible()
    assert page.get_by_role("button", name="デモを見る").is_visible()

    page.goto(BASE + "?fixture=1", wait_until="networkidle")
    page.get_by_role("heading", name="Command").wait_for()
    for destination in ["Quests", "Network", "Party", "Battle", "Connections", "Command"]:
        page.locator(".rf-nav-item", has=page.locator(".rf-nav-label", has_text=destination)).first.click()
        page.wait_for_timeout(100)
        assert page.locator(".rf-shell").get_attribute("data-domain") == destination.lower()

    assert page.locator("body").evaluate("(el) => el.scrollWidth <= el.clientWidth")
    assert not console_errors, console_errors
    assert not page_errors, page_errors
    assert not failed, failed
    browser.close()

print("Guilduo runtime browser verification passed")

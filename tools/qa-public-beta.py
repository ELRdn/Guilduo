import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get("GUILDUO_QA_BASE", "http://127.0.0.1:5197")
ARTIFACTS = Path(".qa-artifacts/appwrite-cutover")
ARTIFACTS.mkdir(parents=True, exist_ok=True)


def assert_no_page_errors(errors, label):
    if errors:
        raise AssertionError(f"{label} page errors: {errors}")


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # Interaction Lab: the complete guest CRUD path must remain usable without cloud auth.
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(f"{BASE}/next/", wait_until="domcontentloaded")
    page.locator("#openAddDialog").wait_for()
    page.locator("#openAddDialog").click()
    page.locator("#questNameInput").fill("Appwrite cutover QA")
    page.locator("#addForm button.primary-action").click()
    page.get_by_text("Appwrite cutover QA", exact=True).first.wait_for()
    page.get_by_text("Appwrite cutover QA", exact=True).first.click()
    page.locator("#editQuestButton").click()
    page.locator("#editQuestTitle").fill("Appwrite cutover QA edited")
    page.locator("#editForm button.primary-action").click()
    page.get_by_text("Appwrite cutover QA edited", exact=True).first.wait_for()
    page.screenshot(path=str(ARTIFACTS / "interaction-lab-desktop.png"), full_page=True)
    assert_no_page_errors(errors, "interaction-lab desktop")

    # Relay Forge: desktop and mobile shells must render and expose Quest creation.
    for label, viewport in (("desktop", {"width": 1920, "height": 1080}), ("mobile", {"width": 390, "height": 844})):
        relay = browser.new_page(viewport=viewport)
        relay_errors = []
        relay.on("pageerror", lambda error, target=relay_errors: target.append(str(error)))
        relay.goto(f"{BASE}/next/relay-forge/", wait_until="domcontentloaded")
        relay.get_by_role("button", name="デモを見る", exact=True).click()
        relay.locator("#rf-workfield").wait_for(state="attached")
        if label == "desktop":
            relay.locator(".rf-create").click()
            relay.locator("dialog[open]").wait_for()
        relay.screenshot(path=str(ARTIFACTS / f"relay-forge-{label}.png"), full_page=True)
        assert_no_page_errors(relay_errors, f"relay-forge {label}")
        relay.close()

    browser.close()

print("public beta browser QA passed")

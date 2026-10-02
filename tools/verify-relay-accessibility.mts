import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Locator } from "playwright-core";
import { SUPPORTED_LOCALES } from "../i18n.ts";
import { relayText } from "../interaction-lab/relay-forge/relay-copy.ts";
import { startRelayWorkerFixture } from "../tests/browser/worker-fixture.ts";

const base = process.argv[2] || "http://127.0.0.1:5183";
const built = process.argv.includes("--built");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const results: string[] = [];
const errors: string[] = [];
await mkdir(".qa-artifacts/relay-accessibility", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.QF_CHROME_PATH || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "/usr/bin/google-chrome"), headless: true });
async function selected(group: Locator, index: number): Promise<void> {
  await group.getByRole("radio").nth(index).waitFor();
  assert.equal(await group.getByRole("radio").nth(index).getAttribute("aria-checked"), "true");
  assert.equal(await group.getByRole("radio").nth(index).evaluate(el => el.ownerDocument.activeElement === el), true);
  assert.equal(await group.locator('[tabindex="0"]').count(), 1);
}
try {
  for (const locale of SUPPORTED_LOCALES) {
    for (const width of [320, 412, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale, timezoneId: SUPPORTED_LOCALES.indexOf(locale) % 2 === 0 ? "Asia/Tokyo" : "America/Los_Angeles", reducedMotion: "reduce" });
      await context.addInitScript(value => localStorage.setItem("questforge-locale", value), locale);
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${base}${built ? "/next/relay-forge/" : "/interaction-lab/relay-forge/"}?fixture=1&theme=dark`);
      if (locale === 'ja' && width === 320) {
        await page.locator('.rf-nav-more').click();
        for (const button of await page.locator('.rf-nav-more-panel button').all()) {
          assert.equal(await button.evaluate(element => {
            const rect = element.getBoundingClientRect();
            return element.contains(element.ownerDocument.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
          }), true, 'More entry must receive taps above the Command decision bar');
        }
        await page.screenshot({ path:`.qa-artifacts/relay-accessibility/more-320${built ? '-built' : ''}.png` });
        await page.locator('.rf-nav-more-panel').getByRole('button', { name:'Settings', exact:true }).click();
        await page.locator('.rf-set-screen').waitFor();
        results.push('Mobile Command More entries stay above the decision bar and Settings receives normal taps');
      }
      await page.getByRole("button", { name: "Quests", exact: true }).click();
      assert.equal(await page.locator("html").getAttribute("lang"), locale);
      const filter = page.getByRole("radiogroup", { name: relayText("filterStatus", locale), exact: true });
      const radios = filter.getByRole("radio");
      assert.equal(await radios.count(), 6);
      assert.equal(await radios.first().locator(".rf-segment-label").textContent(), relayText("all", locale));
      assert.equal(await page.locator(".rf-screen-question").textContent(), relayText("questsQuestion", locale));
      await radios.first().focus();
      for (const [key, index] of [["ArrowLeft", 5], ["Home", 0], ["ArrowRight", 1], ["ArrowDown", 2], ["ArrowUp", 1], ["End", 5]] as const) {
        await page.keyboard.press(key);
        await selected(filter, index);
      }
      results.push(`${locale}/${width}: filter roving focus, wrap, Home/End, arrows after rerender`);
      await page.keyboard.press("Home");
      await selected(filter, 0);
      if (width === 1440) {
        assert.equal(await page.evaluate(`Array.from(document.querySelectorAll('.rf-q-cell-state .rf-chip')).every(chip => {
          const cell = chip.parentElement.getBoundingClientRect();
          const rect = chip.getBoundingClientRect();
          const label = chip.querySelector('.rf-chip-label');
          return rect.right <= cell.right + 1 && label.scrollWidth <= label.clientWidth + 1;
        })`), true, `${locale}: state labels clipped`);
        assert.equal(await page.locator('.rf-q-row[tabindex="-1"]').count(), await page.locator('.rf-q-row').count());
        const expectedDue = new Intl.DateTimeFormat(locale, { month: "2-digit", day: "2-digit", timeZone: "UTC" }).format(new Date("2026-08-27T00:00:00Z"));
        assert.equal(await page.locator('.rf-q-row[data-quest-id="q-171"] .rf-q-due').textContent(), expectedDue, `${locale}: deadline must keep its calendar date across timezones`);
        const sort = page.getByRole("radiogroup", { name: relayText("sortBy", locale), exact: true });
        await sort.getByRole("radio").first().focus();
        await page.keyboard.press("End");
        await selected(sort, 3);
        assert.equal(await filter.getByRole("radio").first().getAttribute("aria-checked"), "true");
        await page.keyboard.press("ArrowRight");
        await selected(sort, 0);
        results.push(`${locale}/${width}: independent sort selection and focus`);
        await page.locator(".rf-q-table").focus();
        await page.keyboard.press("ArrowDown");
        assert.equal(await page.locator(".rf-q-table").evaluate(el => el.ownerDocument.activeElement === el), true);
        assert.equal(await page.locator('.rf-q-row[data-selected="true"]').count(), 1);
        results.push(`${locale}/${width}: single portfolio tab stop, keyboard selection and date-only timezone fidelity`);
      }
      assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `${locale}/${width}: horizontal overflow`);
      await page.screenshot({ path: `.qa-artifacts/relay-accessibility/${locale}-${width}${built ? "-built" : ""}.png` });
      results.push(`${locale}/${width}: locale and viewport fit`);
      await page.getByRole('button', { name:'Network', exact:true }).click();
      assert.equal(await page.locator('.rf-screen-question').textContent(), relayText('networkQuestion', locale));
      if (width === 1440) {
        const modes = page.getByRole('radiogroup', { name:relayText('networkView', locale), exact:true });
        await modes.getByRole('radio').first().focus();
        await page.keyboard.press('Home');
        await selected(modes, 0);
        await page.locator('.rf-n-world').waitFor({ state:'visible' });
        assert.equal(await page.locator('.rf-n-node[tabindex="0"]').count(), 1);
        await page.locator('.rf-n-node[data-focused="true"]').focus();
        await page.keyboard.press('ArrowUp');
        const upstreamId = await page.locator('.rf-n-node:focus').getAttribute('data-node-id');
        assert.ok(upstreamId);
        await page.keyboard.press('Enter');
        await page.waitForFunction('document.activeElement?.matches(\'.rf-n-node[data-focused="true"]\') === true');
        assert.equal(await page.locator('.rf-n-node[data-focused="true"]').getAttribute('data-node-id'), upstreamId);
        await page.locator('.rf-n-back').click();
        await page.waitForFunction('document.activeElement?.matches(\'.rf-n-node[data-focused="true"]\') === true');
        await page.locator('[data-network-control="networkZoomIn"]').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('[data-network-control="networkZoomIn"]').evaluate(el => el.ownerDocument.activeElement === el), true);
        assert.equal(await page.locator('.rf-n-map-controls').evaluate(group => Array.from(group.querySelectorAll('button')).every(button => {
          const rect = (button as { getBoundingClientRect():{ width:number; height:number } }).getBoundingClientRect(); return rect.width >= 44 && rect.height >= 44;
        })), true);
        assert.equal(await page.evaluate("Array.from(document.querySelectorAll('.rf-n-node')).every(node => node.scrollHeight <= node.clientHeight + 1)"), true, `${locale}: graph node contents overflow`);
        if (locale === 'de') await page.screenshot({ path:`.qa-artifacts/relay-accessibility/network-de-graph${built ? '-built' : ''}.png` });
        results.push(`${locale}/${width}: Network single graph entry, arrow/Enter, back focus and native zoom`);
        await modes.getByRole('radio').first().focus();
        await page.keyboard.press('End');
        await selected(modes, 1);
        assert.equal(await page.locator('.rf-n-canvas').count(), 0);
        assert.equal(await page.locator('[data-variant="outline"]').getAttribute('data-scroll'), 'true');
        const rootRef = await page.locator('.rf-n-outline-focus .rf-srow-id').textContent();
        await page.locator('.rf-n-outline-row .rf-jump').first().click();
        await page.waitForFunction('document.activeElement?.matches(".rf-n-outline-focus") === true');
        await page.locator('.rf-n-back').click();
        assert.equal(await page.locator('.rf-n-outline-focus .rf-srow-id').textContent(), rootRef);
        results.push(`${locale}/${width}: Network outline parity, scroll owner and traversal focus`);
      } else {
        const lane = page.locator('.rf-n-m-lane-head[data-lane="upstream"]');
        await lane.click();
        await page.waitForFunction('document.activeElement?.matches(\'.rf-n-m-lane-head[data-lane="upstream"]\') === true');
        assert.equal(await lane.getAttribute('aria-expanded'), 'false');
        await page.keyboard.press('Enter');
        assert.equal(await lane.getAttribute('aria-expanded'), 'true');
        const original = await page.locator('.rf-n-m-focus .rf-srow-id').textContent();
        await page.locator('.rf-n-m-row').first().click();
        await page.waitForFunction('document.activeElement?.matches(".rf-n-m-focus-title") === true');
        await page.locator('.rf-n-m-back').click();
        assert.equal(await page.locator('.rf-n-m-focus .rf-srow-id').textContent(), original);
        results.push(`${locale}/${width}: Network mobile collapse, keyboard reopen and walk/back focus`);
      }
      assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true);
      await page.screenshot({ path:`.qa-artifacts/relay-accessibility/network-${locale}-${width}${built ? '-built' : ''}.png` });
      results.push(`${locale}/${width}: Network translated copy and viewport fit`);
      if (width < 900) await page.locator('.rf-nav-more').click();
      await page.getByRole('button', { name:'Skills', exact:true }).click();
      assert.equal(await page.locator('.rf-screen-question').textContent(), relayText('skillsQuestion', locale));
      const skillsInput = page.locator('.rf-skills-search-input');
      assert.equal(await skillsInput.getAttribute('aria-label'), relayText('skillsSearch', locale));
      assert.equal(await page.locator('[data-group="agent-relay"] .rf-skills-group-title').textContent(), relayText('skillsAgentTitle', locale));
      const toggle = page.locator('[data-group-toggle="agent-relay"]');
      await toggle.focus();
      await page.keyboard.press('Enter');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      assert.equal(await toggle.evaluate(element => element.ownerDocument.activeElement === element), true);
      assert.equal(await toggle.evaluate(element => { const r=element.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; }), true);
      assert.equal(await toggle.evaluate(element => element.ownerDocument.getElementById(element.getAttribute('aria-controls')!)?.hidden), false);
      results.push(`${locale}/${width}: Skills localized categories, keyboard expansion, focus and 44px controls`);
      await skillsInput.fill('create_quest');
      await skillsInput.fill('');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true', 'Search must retain previously expanded categories');
      await skillsInput.fill('link_agent ');
      assert.equal(await skillsInput.inputValue(), 'link_agent ');
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.type('x');
      assert.equal(await skillsInput.inputValue(), 'lxink_agent ');
      assert.equal(await skillsInput.evaluate(element => (element as { selectionStart:number }).selectionStart), 2);
      await page.keyboard.press('Backspace');
      assert.equal(await skillsInput.inputValue(), 'link_agent ');
      assert.equal(await skillsInput.evaluate(element => element.ownerDocument.activeElement === element), true);
      assert.equal(await page.locator('.rf-skills-tool-list:not([hidden]) .rf-skills-tool-name').textContent(), 'link_agent');
      await page.evaluate(`(function () {
        const element = document.querySelector('.rf-skills-search-input');
        window.skillsCompositionInput = element;
        element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles:true }));
        element.value = 'zz_unmatched_確認';
        element.dispatchEvent(new InputEvent('input', { bubbles:true, isComposing:true }));
        window.dispatchEvent(new CustomEvent('questforge:locale-changed'));
      })()`);
      assert.equal(await page.evaluate('document.querySelector(".rf-skills-search-input") === window.skillsCompositionInput'), true);
      await page.evaluate('document.querySelector(".rf-skills-search-input").dispatchEvent(new CompositionEvent("compositionend", { bubbles:true }))');
      await page.waitForFunction('document.activeElement?.matches(".rf-skills-search-input") === true');
      assert.equal(await skillsInput.inputValue(), 'zz_unmatched_確認');
      assert.equal(await page.locator('.rf-screen-empty-title').textContent(), relayText('skillsNoMatches', locale));
      results.push(`${locale}/${width}: Skills raw query, mid-input caret, expansion memory and IME DOM retention`);
      await skillsInput.fill('');
      assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true);
      assert.equal(await page.locator('.rf-skills-screen').evaluate(element => [...element.querySelectorAll('.rf-skills-group-title, .rf-skills-count, .rf-skills-tool-name')].every(label => label.scrollWidth <= label.clientWidth + 1)), true, `${locale}: Skills labels clipped`);
      await page.screenshot({ path:`.qa-artifacts/relay-accessibility/skills-${locale}-${width}${built ? '-built' : ''}.png` });
      results.push(`${locale}/${width}: Skills long labels, protocol names and viewport fit`);
      await page.getByRole('button', { name:'Party', exact:true }).click();
      assert.equal(await page.locator('.rf-screen-question').textContent(), relayText('partyQuestion', locale));
      const partyFilter = page.getByRole('radiogroup', { name:relayText('partyFilter', locale), exact:true });
      await partyFilter.getByRole('radio').first().focus();
      await page.keyboard.press('End');
      await selected(partyFilter, 2);
      assert.equal(await page.locator('.rf-p-row[data-kind="companion"], .rf-p-card[data-kind="companion"]').count(), 0);
      await page.keyboard.press('Home');
      await selected(partyFilter, 0);
      if (width === 1440) {
        const roster = page.locator('.rf-p-row');
        assert.equal(await page.locator('.rf-p-row[tabindex="0"]').count(), 1);
        await roster.first().focus();
        for (const key of ['End', 'Home', 'ArrowDown', 'ArrowUp']) {
          await page.keyboard.press(key);
          await page.waitForFunction("document.activeElement?.matches('.rf-p-row[data-selected=\"true\"]')");
          assert.equal(await page.locator('.rf-p-row[tabindex="0"]').count(), 1);
        }
        await page.locator('.rf-p-row[data-kind="agent"]').first().click();
        await page.waitForFunction("document.activeElement?.matches('.rf-p-row[data-selected=\"true\"]')");
        assert.equal(await page.locator('.rf-p-capabilities dt').nth(2).textContent(), relayText('partyScopes', locale));
        assert.equal(await page.locator('.rf-p-capabilities dt').nth(4).textContent(), relayText('partyDryRun', locale));
        assert.equal(await roster.evaluateAll(rows => rows.every(row => row.scrollWidth <= row.clientWidth + 1)), true, `${locale}: Party roster clips content`);
      } else {
        const card = page.locator('.rf-p-card[data-kind="agent"]').first();
        const actorId = await card.getAttribute('data-actor-id');
        await card.click();
        await page.waitForFunction("document.activeElement?.matches('.rf-p-back')");
        assert.equal(await page.locator('.rf-p-capabilities dt').nth(2).textContent(), relayText('partyScopes', locale));
        assert.equal(await page.locator('.rf-p-back').textContent(), relayText('backToList', locale));
        await page.screenshot({ path:`.qa-artifacts/relay-accessibility/party-detail-${locale}-${width}${built ? '-built' : ''}.png` });
        await page.locator('.rf-p-back').click();
        await page.waitForFunction(`document.activeElement?.getAttribute('data-actor-id') === ${JSON.stringify(actorId)}`);
      }
      assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `${locale}/${width}: Party horizontal overflow`);
      await page.screenshot({ path:`.qa-artifacts/relay-accessibility/party-${locale}-${width}${built ? '-built' : ''}.png` });
      assert.equal(await page.locator('.rf-p-count[data-kind="total"]').first().textContent(), `${relayText('partyHolding', locale)} 3`);

      results.push(`${locale}/${width}: Party translations, workload, filter and roster/detail focus`);
      if (width === 1440) {
        for (const compactWidth of [1024, 1280]) {
          await page.setViewportSize({ width:compactWidth, height:900 });
          assert.equal(await page.locator('.rf-p-row').evaluateAll(rows => rows.every(row => row.scrollWidth <= row.clientWidth + 1)), true);
          assert.equal(await page.locator('.rf-p-identity-copy').evaluateAll(copies => copies.every(copy => copy.clientWidth >= 96)), true, `${locale}/${compactWidth}: Actor identity needs readable width`);
          assert.equal(await page.locator('.rf-p-row .rf-srow-title').evaluateAll(labels => labels.every(label => label.scrollWidth <= label.clientWidth + 1)), true);
          assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
          await page.screenshot({ path:`.qa-artifacts/relay-accessibility/party-${locale}-${compactWidth}${built ? '-built' : ''}.png` });
          results.push(`${locale}/${compactWidth}: compact Party responsibility columns keep Actor names readable`);
        }
        await page.setViewportSize({ width, height:900 });
      }
      if (width === 1440) await page.locator('.rf-rail-utility').last().click();
      else {
        await page.locator('.rf-nav-more').click();
        await page.locator('.rf-nav-more-panel .rf-nav-item').nth(3).click();
      }
      await page.locator('.rf-set-screen').waitFor();
      assert.equal(await page.locator('.rf-screen-question').textContent(), relayText("settingsQuestion", locale));
      assert.equal(await page.locator('.rf-set-screen .rf-region-label').first().textContent(), relayText("accountTitle", locale));
      await page.waitForFunction("document.activeElement?.tagName === 'H1'");
      const theme = page.locator('input[name="rf-set-theme"]');
      await theme.nth(0).focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await theme.nth(1).isChecked(), true);
      assert.equal(await theme.nth(1).evaluate(el => el.ownerDocument.activeElement === el), true);
      await page.keyboard.press("ArrowRight");
      assert.equal(await theme.nth(2).isChecked(), true);
      assert.equal(await theme.nth(2).evaluate(el => el.ownerDocument.activeElement === el), true);
      results.push(`${locale}/${width}: Settings heading and theme keyboard focus survives rerender`);
      assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `${locale}/${width}: Settings horizontal overflow`);
      await page.screenshot({ path: `.qa-artifacts/relay-accessibility/settings-${locale}-${width}${built ? "-built" : ""}.png` });
      const nextLocale = locale === "en" ? "ja" : "en";
      await page.locator('.rf-set-theme-select').selectOption(nextLocale);
      assert.equal(await page.locator('.rf-screen-question').textContent(), relayText("settingsQuestion", nextLocale));
      assert.equal(await page.locator('.rf-set-theme-select').evaluate(el => el.ownerDocument.activeElement === el), true);
      results.push(`${locale}/${width}: Settings locale changes live without losing native select focus`);
      await page.getByRole('button', { name:'Party', exact:true }).click();
      assert.equal(await page.locator('.rf-screen-question').textContent(), relayText('partyQuestion', nextLocale));
      if (width === 1440) {
        assert.equal(await page.locator('.rf-p-detail-name').textContent(), 'Scribe');
        assert.equal(await page.locator('.rf-p-capabilities dt').nth(2).textContent(), relayText('partyScopes', nextLocale));
        await page.locator('.rf-rail-utility').last().click();
      } else {
        await page.locator('.rf-nav-more').click();
        await page.getByRole('button', { name:'Settings', exact:true }).click();
      }
      await page.locator('.rf-set-theme-select').selectOption(locale);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator('.rf-create').click();
      await page.setViewportSize({ width, height: 900 });
      const editor = page.locator('dialog[open]');
      assert.equal(await editor.locator('h2').textContent(), relayText("createQuest", locale));
      assert.equal(await editor.locator('input[name="title"]').getAttribute('placeholder'), relayText("questTitlePlaceholder", locale));
      assert.equal(await editor.locator('input[name="estimatedMinutes"]').locator('..').locator('.rf-create-label').textContent(), relayText("minutesEstimate", locale));
      await editor.locator('input[name="title"]').fill('User title stays intact');
      await editor.locator('input[name="nextAction"]').fill('User action stays intact');
      await editor.locator('input[name="estimatedMinutes"]').fill('0');
      await editor.locator('input[name="title"]').focus();
      await page.locator('.rf-set-theme-select').evaluate((select, locale) => {
        (select as unknown as { value: string }).value = locale;
        select.dispatchEvent(new Event('change', { bubbles:true }));
      }, nextLocale);
      assert.equal(await editor.locator('h2').textContent(), relayText("createQuest", nextLocale));
      assert.equal(await editor.locator('input[name="title"]').evaluate(el => el.ownerDocument.activeElement === el), true);
      assert.equal(await editor.locator('input[name="title"]').inputValue(), 'User title stays intact');
      assert.equal(await editor.locator('input[name="nextAction"]').inputValue(), 'User action stays intact');
      assert.equal(await editor.locator('input[name="estimatedMinutes"]').inputValue(), '0');
      await editor.locator('.rf-create-submit').click();
      assert.equal(await editor.locator('[role="alert"]').textContent(), relayText("demoSaveBlocked", nextLocale));
      assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
      await page.screenshot({ path: `.qa-artifacts/relay-accessibility/quest-editor-${locale}-${width}${built ? "-built" : ""}.png` });
      await page.keyboard.press('Escape');
      await editor.waitFor({ state:'hidden' });
      results.push(`${locale}/${width}: Quest editor translations, draft preservation, demo feedback and viewport fit`);
      await context.close();
    }
  }
  if (!built) {
    const fixture = await startRelayWorkerFixture(new URL(base).origin);
    try {
      const rootIds: string[] = [];
      for (const title of ['Network root A', 'Network root B']) {
        const { quest } = await fixture.web('/v1/quests', 'POST', { kind:'todo', title, assignee:{ type:'agent', id:'review-agent', label:'My Review Agent', handoffState:'blocked' } });
        rootIds.push(quest.id);
      }
      await fixture.web('/v1/quests', 'POST', { kind:'todo', title:'Shared waiting Quest', dependencyIds:rootIds });
      const networkPage = await browser.newPage({ viewport:{ width:1440, height:900 }, reducedMotion:'reduce' });
      networkPage.on('pageerror', error => errors.push(error.message));
      await networkPage.goto(`${base}/tests/browser/production-relay.html?api=${encodeURIComponent(fixture.baseUrl)}&uid=${fixture.uid}&lang=ja`);
      await networkPage.getByRole('button', { name:'Network', exact:true }).click();
      await networkPage.locator('.rf-n-world').waitFor({ state:'visible' });
      assert.equal(await networkPage.locator('.rf-metric-value').nth(1).textContent(), '1');
      results.push('HTTP Worker Network counts a shared downstream Quest once across two root causes');
      await networkPage.locator('[data-network-control="networkZoomIn"]').focus();
      await networkPage.keyboard.press('Enter');
      await networkPage.waitForTimeout(30);
      const camera = await networkPage.locator('.rf-n-world').getAttribute('style');
      await networkPage.evaluate("window.dispatchEvent(new CustomEvent('test:locale', { detail:'de' }))");
      await networkPage.waitForFunction('document.activeElement?.dataset.networkControl === "networkZoomIn"');
      assert.equal(await networkPage.locator('[data-network-control="networkZoomIn"]').getAttribute('aria-label'), relayText('networkZoomIn', 'de'));
      assert.equal(await networkPage.locator('.rf-n-world').getAttribute('style'), camera);
      results.push('HTTP Worker Network locale change preserves map camera and control focus');
      await networkPage.locator('[data-network-control="networkFit"]').click();
      const actor = networkPage.locator('.rf-n-node[data-kind="actor"]').first();
      const actorId = await actor.getAttribute('data-node-id');
      await actor.click();
      await networkPage.locator('.rf-n-open').click();
      assert.equal(await networkPage.locator('.rf-p-row[data-selected="true"]').getAttribute('data-actor-id'), actorId);
      results.push('HTTP Worker Network Actor opens the corresponding Party identity');
      await networkPage.getByRole('button', { name:'Skills', exact:true }).click();
      const liveSkillsInput = networkPage.locator('.rf-skills-search-input');
      await liveSkillsInput.fill('link_agent');
      await networkPage.evaluate('document.querySelector(".rf-skills-search-input").setSelectionRange(2, 7)');
      await networkPage.evaluate("window.dispatchEvent(new CustomEvent('test:locale', { detail:'ru' }))");
      assert.equal(await liveSkillsInput.getAttribute('aria-label'), relayText('skillsSearch', 'ru'));
      assert.deepEqual(await networkPage.evaluate('(function () { const element = document.querySelector(".rf-skills-search-input"); return [element.value, element.selectionStart, element.selectionEnd, document.activeElement === element]; })()'), ['link_agent', 2, 7, true]);
      assert.ok((await networkPage.locator('.rf-skills-tool-list:not([hidden]) .rf-skills-tool-name').allTextContents()).includes('link_agent'));
      await networkPage.evaluate(`(function () {
        const element = document.querySelector('.rf-skills-search-input');
        window.skillsCompositionInput = element;
        element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles:true }));
        element.value = 'zz_unmatched_確認';
        element.dispatchEvent(new InputEvent('input', { bubbles:true, isComposing:true }));
        window.dispatchEvent(new CustomEvent('test:locale', { detail:'en' }));
      })()`);
      assert.equal(await networkPage.evaluate('document.querySelector(".rf-skills-search-input") === window.skillsCompositionInput'), true);
      await networkPage.evaluate('document.querySelector(".rf-skills-search-input").dispatchEvent(new CompositionEvent("compositionend", { bubbles:true }))');
      await networkPage.locator('html[lang="en"]').waitFor();
      assert.equal(await liveSkillsInput.inputValue(), 'zz_unmatched_確認');
      assert.equal(await networkPage.locator('.rf-screen-empty-title').textContent(), relayText('skillsNoMatches', 'en'));
      results.push('HTTP Worker Skills preserves raw protocol names, query, selection and IME DOM across real locale changes');
      await networkPage.close();
      for (const locale of SUPPORTED_LOCALES) {
        for (const width of [320, 412, 1440]) {
          const context = await browser.newContext({ viewport:{ width, height:900 }, locale, reducedMotion:'reduce' });
          const page = await context.newPage();
          page.on('pageerror', error => errors.push(error.message));
          await page.goto(`${base}/tests/browser/production-relay.html?api=${encodeURIComponent(fixture.baseUrl)}&uid=${fixture.uid}&lang=${locale}`);
          try { await page.locator('.rf-shell').waitFor(); }
          catch (error) {
            await page.screenshot({ path:'.qa-artifacts/relay-accessibility/worker-bootstrap-failure.png' });
            console.error({ locale, width, errors });
            throw error;
          }
          if (width === 1440) await page.locator('.rf-rail-utility').last().click();
          else {
            await page.locator('.rf-nav-more').click();
            await page.getByRole('button', { name:'Settings', exact:true }).click();
          }
          await page.getByRole('region', { name:relayText('agentsTitle', locale), exact:true }).getByRole('button', { name:relayText('registerAgent', locale), exact:true }).click();
          const editor = page.locator('dialog[open]');
          assert.equal(await editor.locator('h2').textContent(), relayText('agentRegister', locale));
          assert.equal(await editor.locator('select[name="status"]').isDisabled(), true);
          assert.equal(await editor.locator('select[name="status"]').inputValue(), 'active');
          assert.equal(await editor.locator('textarea[name="instructions"]').getAttribute('placeholder'), relayText('agentInstructionsPlaceholder', locale));
          assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
          await page.screenshot({ path:`.qa-artifacts/relay-accessibility/agent-editor-${locale}-${width}.png` });
          await editor.locator('input[name="agentId"]').fill('review-agent');
          await editor.locator('input[name="displayName"]').fill('User name stays intact');
          await editor.locator('textarea[name="instructions"]').fill('User instructions stay intact');
          await editor.locator('select[name="defaultHandoffState"]').selectOption('blocked');
          await editor.locator('select[name="allowedScopes"]').selectOption(['quests:read', 'quests:write']);
          await editor.locator('input[name="reviewRequired"]').uncheck();
          await editor.locator('.rf-create-submit').click();
          await editor.getByText(relayText('agentExists', locale), { exact:true }).waitFor();
          assert.equal(await editor.locator('input[name="agentId"]').isDisabled(), false);
          assert.equal(await editor.locator('input[name="displayName"]').inputValue(), 'User name stays intact');
          const nextLocale = locale === 'en' ? 'ja' : 'en';
          await editor.locator('textarea[name="instructions"]').focus();
          await page.locator('.rf-set-theme-select').evaluate((select, value) => {
            (select as unknown as { value:string }).value = value;
            select.dispatchEvent(new Event('change', { bubbles:true }));
          }, nextLocale);
          assert.equal(await editor.locator('h2').textContent(), relayText('agentRegister', nextLocale));
          assert.equal(await editor.locator('[role="alert"]').textContent(), relayText('agentExists', nextLocale));
          assert.equal(await editor.locator('textarea[name="instructions"]').evaluate(el => el.ownerDocument.activeElement === el), true);
          assert.equal(await editor.locator('textarea[name="instructions"]').inputValue(), 'User instructions stay intact');
          assert.equal(await editor.locator('select[name="defaultHandoffState"]').inputValue(), 'blocked');
          assert.deepEqual(await editor.locator('select[name="allowedScopes"]').evaluate(select => Array.from((select as unknown as { selectedOptions:ArrayLike<{ value:string }> }).selectedOptions, option => option.value)), ['quests:read', 'quests:write']);
          assert.equal(await editor.locator('input[name="reviewRequired"]').isChecked(), false);
          await page.keyboard.press('Escape');
          const agentRow = page.locator('.rf-set-agent-row').filter({ has:page.locator('.rf-set-agent-name', { hasText:'My Review Agent' }) });
          await agentRow.getByRole('button').click();
          assert.equal(await editor.locator('h2').textContent(), relayText('agentEdit', nextLocale));
          assert.equal(await editor.locator('input[name="agentId"]').isDisabled(), true);
          assert.equal(await editor.locator('select[name="status"]').isDisabled(), false);
          await page.keyboard.press('Escape');
          assert.equal(await agentRow.getByRole('button').evaluate(el => el.ownerDocument.activeElement === el), true);
          await page.getByRole('button', { name:'Party', exact:true }).click();
          await page.locator('.rf-agent-create').click();
          assert.equal(await editor.locator('h2').textContent(), relayText('agentRegister', nextLocale));
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('.rf-agent-create').evaluate(el => el.ownerDocument.activeElement === el), true);
          if (width === 1440) await page.locator('.rf-p-row[data-actor-id="review-agent"]').click();
          else await page.locator('.rf-p-card[data-actor-id="review-agent"]').click();
          const edit = page.getByRole('region', { name:relayText('partySelectedActor', nextLocale), exact:true }).getByRole('button', { name:relayText('agentEdit', nextLocale), exact:true });
          await edit.click();
          assert.equal(await editor.locator('input[name="agentId"]').inputValue(), 'review-agent');
          assert.equal(await editor.locator('input[name="agentId"]').isDisabled(), true);
          await page.keyboard.press('Escape');
          assert.equal(await edit.evaluate(el => el.ownerDocument.activeElement === el), true);
          results.push(`${locale}/${width}: real Worker Party registration/edit entry points and dialog return focus`);
          results.push(`${locale}/${width}: Agent create/edit labels, duplicate-ID feedback, immutable ID, draft and focus preservation`);
          await context.close();
        }
      }
    } finally { await fixture.close(); }
    const page = await browser.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/privacy/`);
    const imageValidation = await page.evaluate(`(async () => {
      const { setLocale } = await import('/i18n.ts');
      const { relayText } = await import('/interaction-lab/relay-forge/relay-copy.ts');
      const { AvatarImageError, resizeAvatarImage } = await import('/interaction-lab/relay-forge/primitives/image-resize.ts');
      let passed = 0;
      for (const locale of ${JSON.stringify(SUPPORTED_LOCALES)}) {
        setLocale(locale);
        for (const [file, key] of [
          [new File(['not an image'], 'avatar.svg', { type:'image/svg+xml' }), 'imageTypeError'],
          [new File([new Uint8Array(8*1024*1024+1)], 'avatar.png', { type:'image/png' }), 'imageSizeError'],
          [new File(['not an image'], 'avatar.png', { type:'image/png' }), 'imageReadError']
        ]) {
          try { await resizeAvatarImage(file); }
          catch (error) { if (error instanceof AvatarImageError && error.message === relayText(key)) passed++; }
        }
      }
      return passed;
    })()`);
    assert.equal(imageValidation, SUPPORTED_LOCALES.length * 3);
    results.push("Nine locales: avatar MIME, size and decode errors remain enforced and localized");
    const checks = await page.evaluate(`(async () => {
      const { setLocale } = await import('/i18n.ts');
      const { screenNotice, confirmPanel } = await import('/interaction-lab/relay-forge/screens/runtime.ts');
      const { relayText } = await import('/interaction-lab/relay-forge/relay-copy.ts');
      let calls = 0;
      const checks = [];
      for (const locale of ${JSON.stringify(SUPPORTED_LOCALES)}) {
        setLocale(locale);
        for (const status of ['loading','empty','partial','error','permission','offline','stale','conflict']) {
          const notice = screenNotice({status, detail:'User text stays intact'});
          const key = 'status' + status[0].toUpperCase() + status.slice(1);
          checks.push(notice.querySelector('strong').textContent === relayText(key));
          checks.push(notice.getAttribute('role') === (['error','permission','conflict'].includes(status) ? 'alert' : 'status'));
        }
        const panel = confirmPanel({ action:'Remove', impact:['User text stays intact'], confirmLabel:'Remove', busy:true, onConfirm:() => calls++, onCancel:() => calls++ });
        document.body.append(panel);
        for (const button of panel.querySelectorAll('button')) { checks.push(button.disabled); button.click(); }
        checks.push(panel.getAttribute('aria-busy') === 'true', panel.textContent.includes(relayText('executing')), panel.getAttribute('aria-label') === relayText('confirmAction').replace('{action}','Remove'));
        panel.remove();
      }
      return { passed: checks.every(Boolean), calls };
    })()`);
    assert.deepEqual(checks, { passed: true, calls: 0 });
    results.push("Nine locales: notice roles and titles; pending confirmation guards both actions");
    const archiveMetrics = await page.evaluate(`(async () => {
      const { renderQuestsDesktop, initialQuestsState } = await import('/interaction-lab/relay-forge/screens/quests.ts');
      const row = { id:'active', ref:'QF-A', title:'User title', bucket:'scheduled', archived:false, nextAction:'', ownerActorId:'', relay:{ reviewerActorId:'', heldForMinutes:0 }, impact:'low', dueDate:'', overdue:false, blockedByIds:[], blockedReason:'', downstreamIds:[], downstreamTotal:0, hasEvidence:false, updatedAt:'', interventionCandidate:false };
      const model = {rows:[row, {...row, id:'archived', archived:true, bucket:'blocked', overdue:true, downstreamTotal:7}], notices:[], unavailable:[]};
      const context = {actors:new Map(), isMobile:false, writeLocked:false, onSelectQuest:()=>{}, onNavigate:()=>{}, announce:()=>{}, rerender:()=>{}};
      const callbacks = {onSendToCommand:()=>{}, onInspectNetwork:()=>{}};
      const state = initialQuestsState();
      const values = () => {
        const main = renderQuestsDesktop(model,state,context,callbacks,null).main;
        return [...main.querySelectorAll('.rf-metric-value')].map(el=>el.textContent);
      };
      const hidden = values(); state.showArchived = true;
      return {hidden, shown:values()};
    })()`);
    assert.deepEqual(archiveMetrics, { hidden: ["0", "0", "0", "0", "1"], shown: ["0", "1", "0", "1", "2"] });
    results.push("Archived Quests excluded from overdue and blocked metrics until explicitly shown");
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(`.qa-artifacts/relay-accessibility/results${built ? "-built" : ""}.json`, JSON.stringify({ results, errors, scope: "Local Chrome fixtures. Physical device, NVDA and production acceptance pending." }, null, 2));
  console.log(`PASS ${results.length} Relay accessibility scenarios`);
} finally { await browser.close(); }

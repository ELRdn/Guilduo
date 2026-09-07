const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

type ContractTool = { name: string; outputSchema?: unknown; title?: string };

const localeFiles = Object.freeze({
  ja: "ja.ts",
  en: "en.ts",
  es: "es.ts",
  "pt-BR": "pt-BR.ts",
  fr: "fr.ts",
  de: "de.ts",
  ko: "ko.ts",
  "zh-Hans": "zh-Hans.ts",
  ru: "ru.ts",
});

function placeholderNames(message: string): string[] {
  return [...String(message).matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort();
}

test("i18n supports nine locales with BCP 47 resolution and Intl formatting", async () => {
  const i18n = await import("../i18n.ts");
  assert.deepEqual(i18n.SUPPORTED_LOCALES, Object.keys(localeFiles));
  assert.equal(i18n.resolveLocale("es-MX"), "es");
  assert.equal(i18n.resolveLocale("pt_br"), "pt-BR");
  assert.equal(i18n.resolveLocale("ko-KR"), "ko");
  assert.equal(i18n.resolveLocale("zh-CN"), "zh-Hans");
  assert.equal(i18n.resolveLocale("zh-TW"), null);

  i18n.setLocale("en");
  assert.equal(i18n.t("nav.tasks"), "Quests");
  assert.match(i18n.formatDate("2026-08-09"), /2026/);
  assert.equal(i18n.compareText("Quest 2", "Quest 10") < 0, true);
  i18n.setLocale("es-MX");
  assert.equal(i18n.getLocale(), "es");
  assert.equal(i18n.t("nav.tasks"), "Misiones");
  for (const locale of Object.keys(localeFiles)) {
    i18n.setLocale(locale);
    assert.notEqual(i18n.t("view.integrations"), "view.integrations", locale);
    assert.match(i18n.formatDate("2026-08-09"), /2026/, locale);
  }
  i18n.setLocale("ja");
  assert.equal(i18n.t("nav.tasks"), "クエスト");
});

test("all locale catalogs have complete keys, placeholders, and valid ICU messages", async () => {
  const { IntlMessageFormat } = await import("intl-messageformat");
  const english = (await import("../locales/en.ts")).default as Record<string, string>;
  const englishKeys = Object.keys(english);
  assert.equal(englishKeys.length, 484);

  for (const [locale, filename] of Object.entries(localeFiles)) {
    const catalog = (await import(`../locales/${filename}`)).default as Record<string, string>;
    assert.deepEqual(Object.keys(catalog), englishKeys, `${locale} key order`);
    for (const key of englishKeys) {
      const expectedNames = placeholderNames(english[key]);
      const actualNames = placeholderNames(catalog[key]);
      assert.deepEqual(actualNames, expectedNames, `${locale}:${key} placeholders`);
      const values = Object.fromEntries(actualNames.map((name) => [name, 1]));
      assert.doesNotThrow(() => new IntlMessageFormat(catalog[key], locale).format(values), `${locale}:${key} ICU`);
    }
  }
});

test("all locale catalogs use the Guilduo and Appwrite public names", async () => {
  for (const [locale, filename] of Object.entries(localeFiles)) {
    const catalog = (await import(`../locales/${filename}`)).default as Record<string, string>;
    const publicCopy = Object.values(catalog).join("\n");
    assert.doesNotMatch(publicCopy, /QuestForge|Firebase/, locale);
    assert.match(publicCopy, /Guilduo/, locale);
  }
});

test("locale preference is device-local and PWA fallback manifests are available", async () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.ts"), "utf8");
  const i18n = await import("../i18n.ts");
  const englishManifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.en.webmanifest"), "utf8"));
  const japaneseManifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  assert.match(html, /id="localeSelect"/);
  for (const locale of i18n.SUPPORTED_LOCALES) assert.match(html, new RegExp(`value="${locale}"`), locale);
  assert.match(app, /QuestForgeI18n/);
  assert.equal(englishManifest.lang, "en");
  assert.equal(japaneseManifest.lang, "ja");
  assert.equal(englishManifest.id, japaneseManifest.id);
  assert.equal(i18n.LOCALE_METADATA.ja.manifest, "/manifest.webmanifest");
  for (const locale of i18n.SUPPORTED_LOCALES.filter((value) => value !== "ja")) {
    assert.equal(i18n.LOCALE_METADATA[locale].manifest, "/manifest.en.webmanifest", locale);
  }
});

test("release metadata, license, public docs, and CI are present", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(packageJson.version, "0.6.0-beta.8");
  assert.equal(packageJson.license, "AGPL-3.0-only");
  assert.match(fs.readFileSync(path.join(root, "LICENSE"), "utf8"), /GNU AFFERO GENERAL PUBLIC LICENSE/);
  for (const file of ["README.md", "ASSETS.md", "CONTRIBUTING.md", "SECURITY.md", "PRIVACY.md", "TERMS.md", "RELEASE_SETUP.md", ".github/workflows/ci.yml", ".github/workflows/release.yml"]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
  }
});

test("public API and plugin metadata use the Guilduo brand and Appwrite auth", () => {
  const openapi = JSON.parse(fs.readFileSync(path.join(root, "api", "openapi.json"), "utf8"));
  const mcpTools = JSON.parse(fs.readFileSync(path.join(root, "api", "mcp-tools.json"), "utf8"));
  const plugin = JSON.parse(fs.readFileSync(path.join(root, "api", "plugin-manifest.example.json"), "utf8"));

  assert.equal(openapi.info.title, "Guilduo API");
  assert.match(openapi.info.description, /^Guilduo REST API/);
  assert.equal(openapi.components.securitySchemes.bearerAuth.bearerFormat, "Appwrite JWT");
  assert.doesNotMatch(JSON.stringify(mcpTools), /QuestForge/);
  assert.equal(plugin.author, "Guilduo");
});

test("public examples omit local absolute paths and private deployment identifiers", () => {
  const files = [
    "README.md", "API_MCP_SETUP.md", "mcp-local/client-configs.md", "runtime-config.example.js",
    "wrangler.example.jsonc", "appwrite-config.example.js", "api/openapi.json",
  ];
  const content = files.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  assert.doesNotMatch(content, /C:\\Users\\hiron|C:\/Users\/hiron/i);
  assert.doesNotMatch(content, /guangchuannaito|questforge-cb6ba|AIzaSyAs44|5a8a50b8|98241f88/i);
  const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  for (const ignored of ["runtime-config.js", "appwrite-config.js", "wrangler.jsonc", "unity-battle-prototype/"]) assert.match(gitignore, new RegExp(ignored.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("public URL references keep site, app, MCP, and Appwrite API roles separate", () => {
  const files = [
    "README.md", "API_MCP_SETUP.md", "RELEASE_SETUP.md", "index.html", "lp/index.html", "lp/en/index.html",
    "mcp-local/client-configs.md", "plugins/questforge/.app.json.example", "plugins/questforge/.mcp.json",
    "plugins/questforge/openai-submission.json", "api/openapi.json", "tools/update-api-contracts.mts", "vite.config.ts",
  ];
  const content = files.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  assert.doesNotMatch(content, /6a90bb258248d43363a2\.appwrite\.network/);
  assert.doesNotMatch(content, /your-questforge-worker\.example\.workers\.dev/);
  assert.match(content, /https:\/\/guilduo\.com/);
  assert.match(content, /https:\/\/app\.guilduo\.com/);
  assert.match(content, /https:\/\/mcp\.guilduo\.com/);
  assert.match(content, /https:\/\/api\.guilduo\.com/);
  assert.match(content, /https:\/\/api\.guilduo\.com\/v1/);
  assert.match(content, /PUBLIC_SITE_URL/);
});

test("generated contracts expose Agent Registry, social, Quest Tree, battle, and MCP v2.7 operations", () => {
  const openapi = JSON.parse(fs.readFileSync(path.join(root, "api/openapi.json"), "utf8"));
  const mcp = JSON.parse(fs.readFileSync(path.join(root, "api/mcp-tools.json"), "utf8")) as { version: string; tools: ContractTool[] };
  assert.equal(openapi.info.version, "2.7.0");
  assert.equal(mcp.version, "2.7.0");
  assert.equal(mcp.tools.length, 56);
  for (const pathName of ["/v1/agents", "/v1/agents/{agentId}", "/v1/agent-connections", "/v1/agents/{agentId}/connections/{clientId}", "/v1/profile", "/v1/friends", "/v1/party", "/v1/battle/session", "/v1/battle/commands", "/v1/quests/tree", "/v1/quests/batch-score", "/v1/agent-handoffs", "/v1/quests/{questId}/handoff", "/v1/quests/{questId}/toggl-focus-task", "/v1/integrations/toggl-focus/connect", "/v1/integrations/toggl-focus/disconnect", "/v1/integrations/toggl-focus/tracking", "/v1/integrations/toggl-focus/time-entries", "/v1/integrations/toggl-focus/attributions"]) assert.ok(openapi.paths[pathName], pathName);
  assert.ok(openapi.components.schemas.Assignee);
  assert.ok(mcp.tools.some((tool) => tool.name === "battle_command"));
  assert.ok(mcp.tools.some((tool) => tool.name === "get_quest_tree"));
  assert.ok(mcp.tools.some((tool) => tool.name === "transition_quest_handoff"));
  assert.ok(mcp.tools.some((tool) => tool.name === "batch_score_quests"));
  assert.ok(mcp.tools.some((tool) => tool.name === "assign_quest_to_agent"));
  assert.ok(mcp.tools.some((tool) => tool.name === "find_profile_by_handle"));
  assert.ok(mcp.tools.some((tool) => tool.name === "get_toggl_focus_status"));
  assert.ok(mcp.tools.some((tool) => tool.name === "apply_toggl_attribution"));
  for (const name of ["get_daily_brief", "get_review_summary", "list_agent_handoffs", "list_activity_events", "get_calendar_schedule", "convert_calendar_event_to_quest"]) {
    const tool = mcp.tools.find((candidate: ContractTool) => candidate.name === name);
    assert.ok(tool, name);
    if (!tool) throw new Error(`Missing MCP tool: ${name}`);
    assert.ok(tool.outputSchema, `${name} output schema`);
  }
});

test("QuestForge workflow skill covers safe reviews, social actions, battles, and Toggl Focus", () => {
  const skill = fs.readFileSync(path.join(root, "skills/questforge-workflows/SKILL.md"), "utf8");
  assert.match(skill, /dryRun/);
  assert.match(skill, /Weekly Review/);
  assert.match(skill, /exact `@handle`/);
  assert.match(skill, /get_battle_session/);
  assert.match(skill, /battle_command/);
  assert.match(skill, /get_toggl_focus_status/);
  assert.match(skill, /apply_toggl_attribution/);
  assert.match(skill, /Personal API key/);
});

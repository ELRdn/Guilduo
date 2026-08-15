// @ts-nocheck
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("beta UI exposes persistent BETA and legacy routes plus Agent and Quest controls", () => {
  const html = read("interaction-lab/index.html");
  assert.match(html, /class="beta-badge">BETA/);
  assert.match(html, /現行版へ戻る/);
  for (const id of ["agentForm", "agentRegistryList", "linkAgentClient", "agentClientInput", "agentConnectionList", "profileAvatarInput", "toggleArchived", "toggleArchivedTree", "selectedBackdrop", "editQuestButton", "archiveQuestButton", "editDialog"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /data-detail-mode="sheet"/);
  assert.match(html, /data-detail-mode="modal"/);
  assert.match(html, /class="quest-board" role="region"/);
  assert.match(html, /class="quest-list" role="region"[^>]+tabindex="0"/);
  for (const key of ["ui.todayPurpose", "ui.nearDue", "ui.bossPressureCopy", "ui.partyBriefTitle", "ui.recentHandoffs", "telemetry.title"]) assert.match(html, new RegExp(`data-i18n="${key}"`), key);
});

test("beta UI exposes archive wording, selection controls, and compact detail actions", () => {
  const html = fs.readFileSync(path.join(root, "interaction-lab/index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "interaction-lab/styles.css"), "utf8");
  assert.match(html, /id="bulkSelectionBar"/);
  assert.match(html, /id="bulkCompleteButton">完了</);
  assert.match(html, /id="reviewButton">確認</);
  assert.match(html, /id="archiveQuestButton">保管</);
  assert.match(css, /\.selected-actions\s*\{\s*display:\s*grid/);
  assert.match(css, /white-space:\s*nowrap/);
});

test("Today scroll boundary is desktop-only and keeps mobile page scrolling", () => {
  const css = read("interaction-lab/styles.css");
  const app = read("interaction-lab/app.ts");
  assert.match(app, /is-today-view/);
  assert.match(css, /body\.is-today-view \.quest-list[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /body\.is-today-view \.quest-list[\s\S]*?overscroll-behavior:\s*contain/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?body\.is-today-view \.quest-list[\s\S]*?overflow:\s*visible/);
});

test("beta repository keeps Quest loading independent from optional panels", () => {
  const repository = read("interaction-lab/repository.ts");
  assert.match(repository, /const questPage = await this\.request/);
  assert.match(repository, /Promise\.allSettled/);
  assert.match(repository, /panelErrors/);
});

test("public beta keeps external provider OAuth in preparation while Firebase and MCP remain available", () => {
  const runtime = read("runtime-config.example.js");
  const lab = read("interaction-lab/app.ts");
  const labHtml = read("interaction-lab/index.html");
  const app = read("app.ts");
  const readme = read("README.md");
  assert.match(runtime, /externalOAuthEnabled:\s*false/);
  assert.match(lab, /externalOAuthEnabled === true/);
  assert.match(lab, /earlyAccess/);
  assert.match(labHtml, /公開βでは外部サービスのOAuth接続を準備中/);
  assert.match(app, /const externalOAuthEnabled/);
  assert.match(app, /integration\.status\.public_beta/);
  assert.match(readme, /Early Access \/ OAuth準備中/);
});

test("CLI, Skill bundle, and MCP App handoff package are present without credentials", () => {
  const packageJson = JSON.parse(read("package.json"));
  const plugin = JSON.parse(read("plugins/questforge/.codex-plugin/plugin.json"));
  const mcp = read("plugins/questforge/.mcp.json");
  const submission = read("plugins/questforge/openai-submission.json");
  assert.equal(packageJson.bin.questforge, "cli/questforge.ts");
  assert.equal(plugin.mcpServers, "./.mcp.json");
  assert.equal(plugin.apps, "./.app.json");
  assert.match(mcp, /authentication/);
  assert.match(submission, /registration_pending|not_submitted|operator/);
  assert.doesNotMatch([mcp, submission].join("\n"), /AIzaSy|client_secret|private_key|Bearer\s+[A-Za-z0-9]/i);
});

test("tagged release gates Firebase behind D1, Worker, and health verification", () => {
  const workflow = read(".github/workflows/release.yml");
  const d1 = workflow.indexOf("d1 migrations apply");
  const worker = workflow.indexOf("wrangler-action@v3");
  const health = workflow.indexOf("Verify Worker before Firebase");
  const firebase = workflow.indexOf("Deploy Firebase rules and hosting");
  assert.match(workflow, /tags: \["v\*"\]/);
  assert.ok(d1 > 0 && d1 < worker && worker < health && health < firebase);
  assert.match(workflow, /agentStorage!=="d1"/);
  assert.doesNotMatch(workflow, /firebase deploy.*\|\| true/);
});

test("anonymous telemetry is opt-in, delayed, and retained in the Worker only", () => {
  const main = read("main.ts");
  const next = read("interaction-lab/app.ts");
  const telemetry = read("telemetry.ts");
  const worker = read("worker/src/index.ts");
  const migration = read("migrations/0006_telemetry.sql");
  assert.match(main, /import\("\.\/telemetry\.ts"\)/);
  assert.match(next, /import\("\.\.\/telemetry\.ts"\)/);
  assert.match(telemetry, /ALLOWED_EVENTS/);
  assert.match(telemetry, /telemetryEndpoint/);
  assert.match(worker, /path === "\/telemetry"/);
  assert.match(worker, /TELEMETRY_EVENT_NAMES/);
  assert.match(migration, /telemetry_events/);
  assert.match(worker, /90/);
});

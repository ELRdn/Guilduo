const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
import { QuestForgeRepository } from "../interaction-lab/repository.ts";

const root = path.join(__dirname, "..");
const read = (file: string): string => fs.readFileSync(path.join(root, file), "utf8");

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

test("beta repository keeps Quest loading independent from optional panels", async () => {
  const repository = read("interaction-lab/repository.ts");
  const relayForge = read("interaction-lab/relay-forge/main.ts");
  const originalFetch = globalThis.fetch;
  let questsFail = false;
  globalThis.fetch = async (input) => {
    const isQuests = new URL(String(input)).pathname === "/v1/quests";
    return isQuests && !questsFail
      ? Response.json({ quests: [], total: 0 })
      : Response.json({ error: "unavailable" }, { status: 503 });
  };
  try {
    const repo = new QuestForgeRepository({ baseUrl: "https://fake.invalid", getToken: async () => "fake" });
    const snapshot = await repo.loadSnapshot();
    assert.deepEqual(snapshot.quests, []);
    assert.equal(snapshot.panelErrors.length, 8);
    questsFail = true;
    await assert.rejects(() => repo.loadSnapshot(), { status: 503 });
  } finally { globalThis.fetch = originalFetch; }
  assert.match(repository, /getToken\(true\)/);
  assert.match(relayForge, /API \$\{error\.status\} \/ \$\{error\.code\}/);
});

test("public beta keeps external provider OAuth in preparation while Appwrite and MCP remain available", () => {
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
  assert.match(readme, /Early Access \/ OAuth preparation/);
});

test("CLI and direct MCP template keep the optional App example separate and credential-free", () => {
  const packageJson = JSON.parse(read("package.json"));
  const plugin = JSON.parse(read("plugins/questforge/.codex-plugin/plugin.json"));
  const mcp = read("plugins/questforge/.mcp.json");
  const submission = read("plugins/questforge/openai-submission.json");
  const appExample = JSON.parse(read("plugins/questforge/.app.json"));
  assert.equal(packageJson.bin.questforge, "cli/questforge.ts");
  assert.equal(packageJson.version, "0.6.0-beta.8");
  assert.equal(plugin.name, "questforge");
  assert.equal(plugin.version, "0.6.0-beta.12");
  assert.equal(plugin.mcpServers, "./.mcp.json");
  assert.equal(plugin.apps, undefined);
  assert.equal(appExample.apps.questforge.id, "questforge-mcp-app-registration-pending");
  assert.match(mcp, /authentication/);
  assert.match(submission, /registration_pending|not_submitted|operator/);
  assert.doesNotMatch([mcp, submission, JSON.stringify(appExample)].join("\n"), /AIzaSy|client_secret|private_key|Bearer\s+[A-Za-z0-9]/i);
});

test("tagged release validates the source candidate without production writes or secrets", () => {
  const workflow = read(".github/workflows/release.yml");
  assert.match(workflow, /tags: \["v\*"\]/);
  assert.match(workflow, /git merge-base --is-ancestor HEAD origin\/main/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /assert.equal\(process.env.GITHUB_REF_NAME,`v\$\{version\}`\)/);
  assert.doesNotMatch(workflow, /environment: production|secrets\.|d1 migrations|deploy-appwrite|wrangler-action|wrangler (?:deploy|secret)|project\/platforms|--remote/);
  for (const gate of ["api:generate", "design:check", "npm run check", "npm test", "npm run build", "lp:verify", "docs:verify", "solutions:verify", "launch:verify"]) {
    assert.ok(workflow.indexOf(gate) > 0 && workflow.indexOf(gate) < workflow.indexOf("softprops/action-gh-release"), gate);
  }
  assert.match(workflow, /body_path: docs\/releases\/\$\{\{ github.ref_name \}\}\.md/);
  for (const file of ["deploy-appwrite-site.yml", "deploy-appwrite-worker.yml"]) {
    const deploy = read(`.github/workflows/${file}`);
    assert.match(deploy, /workflow_dispatch:/);
    assert.match(deploy, /environment: production/);
    assert.doesNotMatch(deploy, /\n  push:/);
  }
});

test("release tag guard rejects another version and path-like tags before publication", () => {
  const script = read(".github/workflows/release.yml").match(/node -e '([^'\n]+)'/)![1];
  const version = JSON.parse(read("package.json")).version;
  const run = (tag: string) => execFileSync(process.execPath, ["-e", script], {
    cwd: root, env: { ...process.env, GITHUB_REF_NAME: tag }, stdio: "pipe",
  });
  assert.doesNotThrow(() => run(`v${version}`));
  for (const tag of ["v0.6.0-beta.7", "v0.6.0", "../../package.json", `v${version}/../other`]) assert.throws(() => run(tag), tag);
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

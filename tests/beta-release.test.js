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
  for (const id of ["agentForm", "agentRegistryList", "linkAgentClient", "editQuestButton", "archiveQuestButton", "editDialog"]) assert.match(html, new RegExp(`id="${id}"`), id);
});

test("beta repository keeps Quest loading independent from optional panels", () => {
  const repository = read("interaction-lab/repository.mjs");
  assert.match(repository, /const questPage = await this\.request/);
  assert.match(repository, /Promise\.allSettled/);
  assert.match(repository, /panelErrors/);
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

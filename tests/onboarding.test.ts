const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("guest starts without developer To Do samples and can add the first quest", () => {
  const app = fs.readFileSync(path.join(root, "app.ts"), "utf8");
  const appwrite = fs.readFileSync(path.join(root, "appwrite-client.ts"), "utf8");
  const japaneseCatalog = fs.readFileSync(path.join(root, "locales/ja.ts"), "utf8");

  assert.doesNotMatch(app, /id: "t1"/);
  assert.doesNotMatch(app, /id: "t2"/);
  assert.match(app, /task\.emptyTodoAction/);
  assert.match(appwrite, /sync\.local/);
  assert.match(japaneseCatalog, /"task\.emptyTodoAction": "最初のTo Doを追加"/);
  assert.match(japaneseCatalog, /"sync\.local": "この端末に保存中"/);
});

test("integration onboarding exposes four steps and provider setup status", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.ts"), "utf8");
  const japaneseCatalog = fs.readFileSync(path.join(root, "locales/ja.ts"), "utf8");
  const integrations = fs.readFileSync(path.join(root, "worker/src/integrations.ts"), "utf8");

  for (const id of ["integrationStepLogin", "integrationStepConnect", "integrationStepResource", "integrationStepSync"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="integrationLoginButton"/);
  assert.match(app, /provider_not_configured/);
  assert.match(app, /integration\.status/);
  assert.match(japaneseCatalog, /"integration\.status\.admin_setup_required": "管理者設定待ち"/);
  assert.match(integrations, /configurationStatus/);
});

test("battle cards explicitly support quests without notes", () => {
  const app = fs.readFileSync(path.join(root, "app.ts"), "utf8");
  const core = fs.readFileSync(path.join(root, "questforge-core.ts"), "utf8");
  const japaneseCatalog = fs.readFileSync(path.join(root, "locales/ja.ts"), "utf8");

  assert.match(app, /core\.isBattleTaskEligible\(task\)/);
  assert.match(app, /i18n\.t\("battle\.noNotes"\)/);
  assert.match(japaneseCatalog, /"battle\.noNotes": "説明なしでもMPへ変換できます。"/);
  assert.doesNotMatch(app, /core\.isBattleTaskEligible\(task\)[\s\S]{0,500}\.slice\(0, 6\)/);
  assert.match(core, /function isBattleTaskEligible\(task\)/);
});

test("the separated Unity prototype uses the versioned battle contract and an empty-notes fixture", () => {
  const contract = JSON.parse(fs.readFileSync(path.join(root, "api/battle-contract.v1.json"), "utf8"));
  const fixture = JSON.parse(fs.readFileSync(path.join(root, "unity-battle-prototype/Assets/Resources/Fixtures/battle-session.json"), "utf8"));

  assert.equal(contract.properties.schemaVersion.const, 1);
  assert.equal(fixture.schemaVersion, 1);
  assert.ok(fixture.quests.some((quest: { notes: string; eligible: boolean }) => quest.notes === "" && quest.eligible === true));
});

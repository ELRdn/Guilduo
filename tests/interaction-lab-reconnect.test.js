const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Quest Tree exposes an isolated desktop scroll region and a personalized summary", () => {
  const html = read("interaction-lab/index.html");
  const css = read("interaction-lab/styles.css");
  const app = read("interaction-lab/app.js");

  assert.match(html, /id="treeList" class="tree-list" role="region"[^>]+tabindex="0"/);
  assert.match(html, /id="treeNoteAccount"/);
  assert.match(html, /id="treeWorkingCount"/);
  assert.match(app, /document\.body\.classList\.toggle\("is-tree-view", view === "tree"\)/);
  assert.match(app, /function renderTreeNote\(treeQuests\)/);
  assert.match(css, /body\.is-tree-view \.tree-list[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /body\.is-tree-view \.tree-note[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?body\.is-tree-view \.tree-list[\s\S]*?overflow:\s*visible/);
});

test("interaction lab restores authenticated remote data without storing tokens", () => {
  const app = read("interaction-lab/app.js");
  const repository = read("interaction-lab/repository.mjs");
  const html = read("interaction-lab/index.html");

  assert.match(repository, /LAB_AUTO_CONNECT_KEY/);
  assert.match(repository, /LAB_REMOTE_SNAPSHOT_KEY/);
  assert.match(repository, /hasAutoConnectPreference/);
  assert.match(repository, /ownerUid/);
  assert.match(app, /observeAuth\(async \(user\) =>/);
  assert.match(app, /loadRemoteData\(\{ announce: false, source: "auto" \}\)/);
  assert.match(app, /remoteLoadPromise/);
  assert.match(app, /remoteLoadGeneration/);
  assert.match(app, /本体データを再接続中です/);
  assert.match(app, /ensureRemoteWritable/);
  assert.match(html, /id="autoConnectToggle" type="checkbox"/);
  assert.doesNotMatch(repository, /localStorage\.setItem\([^\n]*(token|authorization|secret)/i);
});

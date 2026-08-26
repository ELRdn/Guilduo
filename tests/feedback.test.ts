const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("feedback controls expose previews and clear accessible names", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

  assert.match(html, /id="feedbackSettingsButton"[\s\S]*?音・演出/);
  assert.match(html, /id="previewSoundButton"/);
  assert.match(html, /id="previewMotionButton"/);
  assert.match(html, /aria-label="バックアップJSONを読み込む"/);
  assert.match(html, /aria-label="バックアップJSONを保存する"/);
});

test("task completion and battle feedback use visible motion hooks", () => {
  const app = fs.readFileSync(path.join(root, "app.ts"), "utf8");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

  assert.match(app, /task-complete-mark/);
  assert.match(app, /window\.setTimeout\(\(\) => render\(\), 520\)/);
  assert.match(app, /showBattleFloat\(els\.battleDamageText/);
  assert.match(css, /animation: archive-soft 500ms/);
  assert.match(css, /@keyframes battle-float-pop/);
});

test("audio diagnostics expose Web Audio and media playback routes", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "app.ts"), "utf8");
  assert.match(html, /id="audioDiagnosticStatus"/);
  assert.match(html, /id="testWebAudioButton"/);
  assert.match(html, /id="testMediaAudioButton"/);
  assert.match(app, /function testWebAudio\(\)/);
  assert.match(app, /function testMediaAudio\(\)/);
  assert.match(app, /AudioContext:/);
});

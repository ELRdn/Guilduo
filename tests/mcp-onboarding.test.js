const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("the public app reads one production MCP endpoint from local runtime config", () => {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const example = fs.readFileSync(path.join(root, "runtime-config.example.js"), "utf8");

  assert.match(app, /QuestForgeConfig\?\.gatewayUrl/);
  assert.match(app, /return productionGatewayUrl/);
  assert.match(main, /runtime-config\.js/);
  assert.match(example, /your-questforge-worker\.example\.workers\.dev/);
  assert.doesNotMatch(app, /guangchuannaito/);
  assert.match(html, /id="mcpEndpointInput"[^>]*readonly/);
  assert.match(html, /id="copyMcpUrlButton"/);
  assert.match(html, /ChatGPT/);
  assert.match(html, /Claude/);
  assert.match(html, /Codex/);
  assert.match(html, /Gemini/);
});

test("infrastructure overrides stay inside developer settings", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const detailsStart = html.indexOf('<details class="developer-settings">');
  const gatewayInput = html.indexOf('id="gatewayUrlInput"');
  const detailsEnd = html.indexOf("</details>", detailsStart);

  assert.ok(detailsStart >= 0);
  assert.ok(gatewayInput > detailsStart);
  assert.ok(gatewayInput < detailsEnd);
  assert.match(html, /data-view="integrations">AI連携<\/button>/);
});

test("OAuth delegates the signed-in Firebase session without an admin key", () => {
  const oauth = fs.readFileSync(path.join(root, "worker", "src", "oauth.mjs"), "utf8");
  const security = fs.readFileSync(path.join(root, "worker", "src", "security.mjs"), "utf8");
  const store = fs.readFileSync(path.join(root, "worker", "src", "firebase-store.mjs"), "utf8");

  assert.match(oauth, /firebaseRefreshToken=result\.user\.refreshToken/);
  assert.match(oauth, /securetoken\.googleapis\.com\/v1\/token/);
  assert.match(oauth, /accessRecord\?\.refreshHash/);
  assert.match(security, /firebaseIdToken: token/);
  assert.match(store, /url\.searchParams\.set\("auth", normalized\.firebaseIdToken\)/);
});

test("dynamic OAuth registration rejects insecure remote callbacks", () => {
  const oauth = fs.readFileSync(path.join(root, "worker", "src", "oauth.mjs"), "utf8");

  assert.match(oauth, /uri\.protocol === "https:"/);
  assert.match(oauth, /\["127\.0\.0\.1", "localhost", "\[::1\]"\]/);
  assert.match(oauth, /if \(uri\.hash \|\| uri\.username \|\| uri\.password\) return false/);
});

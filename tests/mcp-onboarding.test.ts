const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("the public app reads one production MCP endpoint from local runtime config", () => {
  const app = fs.readFileSync(path.join(root, "app.ts"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.ts"), "utf8");
  const example = fs.readFileSync(path.join(root, "runtime-config.example.js"), "utf8");

  assert.match(app, /QuestForgeConfig\?\.gatewayUrl/);
  assert.match(app, /return productionGatewayUrl/);
  assert.match(main, /runtime-config\.js/);
  assert.match(example, /https:\/\/mcp\.guilduo\.com/);
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

test("OAuth delegates a short-lived Appwrite JWT without exposing an API key", () => {
  const oauth = fs.readFileSync(path.join(root, "worker", "src", "oauth.ts"), "utf8");
  const security = fs.readFileSync(path.join(root, "worker", "src", "security.ts"), "utf8");
  const store = fs.readFileSync(path.join(root, "worker", "src", "appwrite-store.ts"), "utf8");

  assert.match(oauth, /account\/jwts/);
  assert.match(oauth, /verifyAppwriteJwt/);
  assert.match(oauth, /accessRecord\?\.refreshHash/);
  assert.match(security, /x-appwrite-jwt/);
  assert.match(store, /x-appwrite-key/);
  assert.doesNotMatch(oauth, /APPWRITE_API_KEY|x-appwrite-key/);
});

test("OAuth consent presents the Guilduo public brand", () => {
  const oauth = fs.readFileSync(path.join(root, "worker", "src", "oauth.ts"), "utf8");

  assert.match(oauth, /Guilduoへ接続/);
  assert.match(oauth, /Connect to Guilduo/);
  assert.doesNotMatch(oauth, /QuestForgeへ接続|Connect to QuestForge|Authorize QuestForge/);
});

test("dynamic OAuth registration rejects insecure remote callbacks", () => {
  const oauth = fs.readFileSync(path.join(root, "worker", "src", "oauth.ts"), "utf8");

  assert.match(oauth, /uri\.protocol === "https:"/);
  assert.match(oauth, /\["127\.0\.0\.1", "localhost", "\[::1\]"\]/);
  assert.match(oauth, /if \(uri\.hash \|\| uri\.username \|\| uri\.password\) return false/);
});

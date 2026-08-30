import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(__dirname, "..");
const read = (relativePath: string): string => readFileSync(join(root, relativePath), "utf8");

const officialSite = "https://guilduo.com/";
const englishLandingPage = "https://guilduo.com/lp/en/";
const webApp = "https://app.guilduo.com/";
const mcpEndpoint = "https://mcp.guilduo.com/mcp";
const appwriteEndpoint = "https://api.guilduo.com/v1";

test("public URL guide defines the five stable service entry points", () => {
  const guide = read("docs/public-urls.md");
  for (const url of [officialSite, englishLandingPage, webApp, mcpEndpoint, appwriteEndpoint]) {
    assert.equal(guide.includes(url), true, url);
  }
  assert.match(guide, /Guilduo \/ Relay Forge/);
  assert.match(guide, /Reserved \/ Future/);
  assert.match(guide, /APPWRITE_SITE_ENDPOINT/);
});

test("README puts new users on the official Relay Forge URL", () => {
  const readme = read("README.md");
  const start = readme.indexOf("### 新規ユーザーはここから");
  const end = readme.indexOf("### 公開URLの役割", start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const newcomerSection = readme.slice(start, end);
  assert.match(newcomerSection, /https:\/\/guilduo\.com\//);
  assert.match(newcomerSection, /https:\/\/app\.guilduo\.com\//);
  assert.match(newcomerSection, /https:\/\/mcp\.guilduo\.com\/mcp/);
  const newcomerLinkTargets = [...newcomerSection.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
  assert.equal(newcomerLinkTargets.includes("https://app.guilduo.com/next/relay-forge/"), false);
  assert.equal(readme.includes("](https://app.guilduo.com/next/relay-forge/)"), false);
});

test("public docs keep the MCP endpoint and Appwrite API roles separate", () => {
  const docs = ["README.md", "ROADMAP.md", "API_MCP_SETUP.md", "RELEASE_SETUP.md", "docs/public-urls.md"]
    .map(read)
    .join("\n");
  assert.equal(docs.includes(mcpEndpoint), true);
  assert.equal(docs.includes(appwriteEndpoint), true);
  assert.match(docs, /APPWRITE_ENDPOINT/);
  assert.match(docs, /APPWRITE_SITE_ENDPOINT/);
  assert.equal(docs.includes("https://api.guilduo.com/mcp"), false);
});

test("legacy and internal paths are described as compatibility surfaces", () => {
  const guide = read("docs/public-urls.md");
  assert.match(guide, /内部デプロイ・互換path/);
  assert.match(guide, /旧Workerの互換・rollback URL/);
  assert.match(guide, /新規MCP登録に使わない/);
  assert.equal(read("interaction-lab/README.md").includes("Firebase Hosting"), false);
  assert.match(read("interaction-lab/README.md"), /Appwrite Sites/);
  assert.match(read("interaction-lab/README.md"), /https:\/\/app\.guilduo\.com\//);
});

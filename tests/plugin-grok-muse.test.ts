import assert from "node:assert/strict";
import test from "node:test";
import { cp, link, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { candidateVersion, validateGrokMuseSource } from "../tools/freeze-guilduo-grok-muse.mts";
import { museQAEnvironment } from "../tools/guilduo-muse-native-env.mts";

const root = fileURLToPath(new URL("../", import.meta.url));
const qa = join(root, ".qa-artifacts", "guilduo-next-hosts", "grok-muse", "static-tests");
async function fixture(check: (path: string) => Promise<void>): Promise<void> {
  await mkdir(qa, { recursive: true });
  const path = await mkdtemp(join(qa, "case-"));
  try { await check(path); } finally {
    assert(relative(qa, resolve(path)).startsWith("case-"));
    await rm(path, { recursive: true, force: true });
  }
}

for (const target of ["grok", "muse"] as const) test(`${target}: beta.12 closed whitelist, canonical bytes and onboarding`, async () => {
  const result = await validateGrokMuseSource(root, target);
  assert.equal(result.files.length, 11);
  assert(!result.files.some(file => /^(?:hooks|auth|profile|node_modules)\//.test(file.path)));
});

test("Grok monorepo catalog resolves only the portable candidate; no acceptance claim", async () => {
  const catalog = JSON.parse(await readFile(join(root, ".cursor-plugin", "marketplace.json"), "utf8"));
  assert.equal(catalog.plugins.length, 1);
  const entry = catalog.plugins[0];
  assert.equal(entry.source, "plugins/guilduo-grok");
  const manifest = JSON.parse(await readFile(join(root, entry.source, "plugin.json"), "utf8"));
  assert.equal(entry.name, manifest.name);
  assert.equal(entry.version, candidateVersion);
  assert.equal(manifest.version, candidateVersion);
  assert.match(catalog.metadata.description, /native host acceptance/);
});

test("Muse is Skill-only; separate native MCP example has no credential transport", async () => {
  const manifest = JSON.parse(await readFile(join(root, "plugins/guilduo-muse/.muse-plugin/plugin.json"), "utf8"));
  assert.deepEqual(manifest.capabilities, { skills: [{ id: "guilduo-workflows", path: "skills/guilduo-workflows/SKILL.md" }] });
  const settings = JSON.parse(await readFile(join(root, "plugins/guilduo-muse/settings.example.json"), "utf8"));
  assert.equal(settings.schema_version, 1);
  assert.deepEqual(Object.keys(settings.mcpServers), ["questforge"]);
  assert.deepEqual(settings.mcpServers.questforge, { transport: "streamable_http", url: "https://mcp.guilduo.com/mcp", enabled: true, mode: "optional" });
});

test("candidate staging rejects unexpected private files and changed canonical Skill", async () => fixture(async path => {
  const source = join(path, "plugin");
  await cp(join(root, "plugins/guilduo-muse"), source, { recursive: true });
  const rogue = join(source, "private-auth.json");
  await writeFile(rogue, "{}\n");
  await assert.rejects(validateGrokMuseSource(root, "muse", source), /Unexpected candidate file/);
  await rm(rogue);
  await writeFile(join(source, "skills/guilduo-workflows/SKILL.md"), "altered guidance");
  await assert.rejects(validateGrokMuseSource(root, "muse", source), /Canonical byte mismatch/);
}));

test("candidate staging rejects hardlinked files and linked Skill directories", async () => fixture(async path => {
  const source = join(path, "plugin");
  await cp(join(root, "plugins/guilduo-grok"), source, { recursive: true });
  const readme = join(source, "README.jp.md");
  const ownFile = join(path, "separate.md");
  await writeFile(ownFile, "untrusted");
  await rm(readme);
  await link(ownFile, readme);
  await assert.rejects(validateGrokMuseSource(root, "grok", source), /Unsafe candidate file/);
  await rm(readme);
  await cp(join(root, "plugins/guilduo-grok/README.jp.md"), readme);
  const skills = join(source, "skills");
  await rm(skills, { recursive: true });
  await symlink(join(root, "skills"), skills, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(validateGrokMuseSource(root, "grok", source), /Linked candidate/);
}));

test("candidate rejects README traversal and credential-shaped content", async () => fixture(async path => {
  const source = join(path, "plugin");
  await cp(join(root, "plugins/guilduo-muse"), source, { recursive: true });
  const readme = join(source, "README.md");
  const original = await readFile(readme, "utf8");
  await writeFile(readme, original + "\n[escape](../../outside.md)\n");
  await assert.rejects(validateGrokMuseSource(root, "muse", source), /Unsafe README link/);
  await writeFile(readme, original + "\nBearer " + "synthetic_example_".repeat(3) + "\n");
  await assert.rejects(validateGrokMuseSource(root, "muse", source), /Credential-like/);
}));

test("Muse native profile refuses real locations and linked ancestors; strips provider environment", async () => fixture(async path => {
  await assert.rejects(museQAEnvironment(root, join(root, "plugins", "fake-profile")), /owned child/);
  const linked = join(path, "linked");
  await symlink(join(path, "destination"), linked, process.platform === "win32" ? "junction" : "dir").catch(async () => {
    await mkdir(join(path, "destination"));
    await symlink(join(path, "destination"), linked, process.platform === "win32" ? "junction" : "dir");
  });
  await assert.rejects(museQAEnvironment(root, join(linked, "child")), /Linked Muse QA ancestor/);
  const environment = await museQAEnvironment(root, join(path, "profile"));
  assert.equal(environment.MUSE_LOGIN, "0");
  assert.equal(environment.MUSE_NO_AUTO_UPDATE, "1");
  assert(!Object.keys(environment).some(key => /(?:API_KEY|TOKEN|SECRET|APPWRITE)/.test(key)));
}));

for (const child of ["workspace", "config/muse", "logs"]) test(`Muse rejects existing ${child} junction before creating or writing anything`, async () => fixture(async path => {
  const profile = join(path, "profile");
  const destination = join(path, "outside-profile");
  await mkdir(destination);
  const sentinel = join(destination, "settings.json");
  const bytes = Buffer.from('{"unrelated":"must stay unchanged"}\n');
  await writeFile(sentinel, bytes);
  const linked = join(profile, child);
  await mkdir(dirname(linked), { recursive: true });
  await symlink(destination, linked, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(museQAEnvironment(root, profile), /Linked Muse QA ancestor or directory/);
  assert((await readFile(sentinel)).equals(bytes));
  await assert.rejects(lstat(join(profile, "home")), { code: "ENOENT" });
}));

import assert from "node:assert/strict";
import { cp, link, mkdir, mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { prepareGuilduoPlugin } from "../tools/prepare-guilduo-plugin.mts";

async function copySources(root: string): Promise<void> {
  await cp(new URL("../LICENSE", import.meta.url), join(root, "LICENSE"));
  await cp(new URL("../plugins/questforge/", import.meta.url), join(root, "plugins", "questforge"), { recursive: true });
  await cp(new URL("../skills/guilduo-workflows/", import.meta.url), join(root, "skills", "guilduo-workflows"), { recursive: true });
}

test('generator rejects hardlinked source before replacing the existing OpenAI candidate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guilduo-source-hardlink-'));
  try {
    await copySources(root);
    const output = await prepareGuilduoPlugin(undefined, root, {submission:true});
    const staged = join(output,'plugin/.codex-plugin/plugin.json');
    const prior = await readFile(staged);
    const source = join(root,'plugins/questforge/.codex-plugin/plugin.json');
    const linked = join(root,'shared-source.json');
    await link(source, linked);
    await assert.rejects(prepareGuilduoPlugin(undefined,root,{submission:true}), /Refusing linked or invalid package source/);
    assert.deepEqual(await readFile(staged),prior);
    await unlink(linked);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test("canonical Codex Git bundle exactly matches fresh generation and its compatibility catalog", async () => {
  const root = await mkdtemp(join(tmpdir(), "guilduo-codex-git-"));
  try {
    await copySources(root);
    const output = await prepareGuilduoPlugin(undefined, root, { target:'openai', hooks:true });
    const staged = join(output, 'plugin');
    const frozen = fileURLToPath(new URL('../plugins/guilduo-workflows/', import.meta.url));
    const compare = async (expected: string, actual: string): Promise<void> => {
      const names = (await readdir(expected)).sort();
      assert.deepEqual((await readdir(actual)).sort(), names);
      for (const entry of await readdir(expected, {withFileTypes:true})) {
        if (entry.isDirectory()) await compare(join(expected, entry.name), join(actual, entry.name));
        else assert.deepEqual(await readFile(join(actual, entry.name)), await readFile(join(expected, entry.name)), entry.name);
      }
    };
    await compare(staged, frozen);
    const catalog = JSON.parse(await readFile(new URL('../.agents/plugins/marketplace.json', import.meta.url), 'utf8'));
    assert.equal(catalog.name, 'guilduo-local');
    assert.deepEqual(catalog.plugins, [{name:'guilduo-workflows',source:{source:'local',path:'./plugins/guilduo-workflows'},
      policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'},category:'Productivity'}]);
  } finally { await rm(root, {recursive:true,force:true}); }
});

test("optional Claude and Muse hooks retain legacy behavior without Codex receipts or Interrupt", async () => {
  const root = await mkdtemp(join(tmpdir(), "guilduo-legacy-hooks-"));
  try {
    await copySources(root);
    for (const target of ["claude", "muse"] as const) {
      const output = await prepareGuilduoPlugin(undefined, root, { target, hooks: true });
      const plugin = join(output, "plugin");
      const docs = await readFile(join(plugin, "hooks/README.md"), "utf8");
      assert.match(docs, /historical opt-in/);
      if (target === "claude") {
        const config = JSON.parse(await readFile(join(plugin, "hooks/hooks.json"), "utf8"));
        assert.deepEqual(Object.keys(config.hooks).sort(), ["SessionStart", "Stop"]);
        assert.ok(!JSON.stringify(config).includes(' --codex'));
      } else {
        const config = await readFile(join(plugin, ".muse-plugin/plugin.json"), "utf8");
        assert.ok(!config.includes('Interrupt'));
        assert.ok(!(await readFile(join(plugin, "hooks/stop.mjs"), "utf8")).includes('--codex'));
      }
      const data = join(root, `${target}-data`);
      const script = join(plugin, "hooks/lifecycle.mjs");
      const env = { ...process.env, PLUGIN_DATA: data };
      const bound = spawnSync(process.execPath, [script, 'bind', 'legacy-session', 'quest', 'agent', root], { cwd: root, env, encoding: 'utf8' });
      assert.equal(bound.status, 0);
      for (let repeat = 0; repeat < 2; repeat++) {
        const stop = spawnSync(process.execPath, [target === 'muse' ? join(plugin, 'hooks/stop.mjs') : script, ...(target === 'muse' ? [] : ['Stop'])], {
          cwd: root, env, encoding: 'utf8', input: JSON.stringify({hook_event_name:'Stop',session_id:'legacy-session',cwd:root,stop_hook_active:false}) });
        assert.equal(stop.status, 0);
        assert.equal(JSON.parse(stop.stdout).decision, 'block');
      }
      await assert.rejects(readFile(join(data, 'guilduo-receipts')), {code:'ENOENT'});
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Guilduo companion bundles the canonical Skill with exactly one connection and rejects invalid App IDs", async () => {
  const root = await mkdtemp(join(tmpdir(), "guilduo-plugin-"));
  try {
    await copySources(root);
    const appId = "asdk_app_0123456789abcdef0123456789abcdef";
    const output = await prepareGuilduoPlugin(appId, root);
    const plugin = join(output, "plugin");
    const readJson = async (path: string): Promise<Record<string, unknown>> => JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    const desktop = await readJson(join(plugin, ".codex-plugin", "plugin.json"));
    assert.equal(desktop.name, "guilduo-workflows");
    assert.equal(desktop.skills, "./skills/");
    assert.equal(desktop.apps, "./.app.json");
    assert.equal(desktop.mcpServers, undefined);
    await assert.rejects(readFile(join(plugin, "plugin.json")), { code: "ENOENT" });
    await assert.rejects(readFile(join(plugin, "mcp.json")), { code: "ENOENT" });
    await assert.rejects(readFile(join(plugin, "package.json")), { code: "ENOENT" });
    assert.deepEqual(await readJson(join(plugin, ".app.json")), { apps: { guilduo: { id: appId } } });
    assert.equal(await readFile(join(plugin, "assets", "guilduo-icon.png")).then((bytes) => bytes.readUInt32BE(16)), 48);
    assert.equal(await readFile(join(plugin, "skills", "guilduo-workflows", "SKILL.md"), "utf8"),
      await readFile(new URL("../skills/guilduo-workflows/SKILL.md", import.meta.url), "utf8"));
    await readFile(join(plugin, "skills", "guilduo-workflows", "references", "tools.md"), "utf8");
    await readFile(join(plugin, "skills", "guilduo-workflows", "agents", "openai.yaml"), "utf8");
    const marketplace = await readJson(join(output, ".agents", "plugins", "marketplace.json"));
    assert.deepEqual(marketplace.plugins, [{ name: "guilduo-workflows", source: { source: "local", path: "./plugin" },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Productivity" }]);
    await prepareGuilduoPlugin(undefined, root);
    const direct = await readJson(join(plugin, ".codex-plugin", "plugin.json"));
    assert.equal(direct.apps, undefined);
    assert.equal(direct.mcpServers, "./.mcp.json");
    await assert.rejects(readFile(join(plugin, ".app.json")), { code: "ENOENT" });
    assert.match(await readFile(join(plugin, ".mcp.json"), "utf8"), /https:\/\/mcp\.guilduo\.com\/mcp/);
    await prepareGuilduoPlugin(`plugin_${appId}`, root);
    await assert.rejects(readFile(join(plugin, ".mcp.json")), { code: "ENOENT" });
    for (const invalid of ["", "https://mcp.guilduo.com/mcp", "Bearer secret", `${appId}/../other`]) {
      await assert.rejects(prepareGuilduoPlugin(invalid, root), /registered Guilduo/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("package CLI runs through a workspace junction instead of silently skipping generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "guilduo-cli-"));
  try {
    const repository = join(root, "repository");
    await mkdir(join(repository, "tools"), { recursive: true });
    await cp(new URL("../tools/prepare-guilduo-plugin.mts", import.meta.url), join(repository, "tools", "prepare-guilduo-plugin.mts"));
    await copySources(repository);
    const alias = join(root, "alias");
    await symlink(repository, alias, "junction");
    const output = execFileSync(process.execPath, [fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url)),
      join(alias, "tools", "prepare-guilduo-plugin.mts"), "--submission"], { encoding: "utf8" }).trim();
    assert.equal(output, join(repository, ".qa-artifacts", "guilduo-submission"));
    await readFile(join(output, "plugin", ".codex-plugin", "plugin.json"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("public generation refuses linked output ancestors and preserves their existing contents", async () => {
  const root = await mkdtemp(join(tmpdir(), "guilduo-output-"));
  try {
    await copySources(root);
    const external = join(root, "other-directory");
    const marker = join(external, "guilduo-submission", "plugin", "existing-file.txt");
    await mkdir(join(external, "guilduo-submission", "plugin"), { recursive: true });
    await writeFile(marker, "keep this file");
    await symlink(external, join(root, ".qa-artifacts"), "junction");
    await assert.rejects(prepareGuilduoPlugin(undefined, root, { submission: true }), /Refusing linked/);
    assert.equal(await readFile(marker, "utf8"), "keep this file");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("public package has review metadata, assets, and direct MCP only, with no stale files or hooks", async () => {
  const root = await mkdtemp(join(tmpdir(), "guilduo-submission-"));
  try {
    await copySources(root);
    const output = await prepareGuilduoPlugin(undefined, root, { submission: true });
    const plugin = join(output, "plugin");
    const manifest = JSON.parse(await readFile(join(plugin, ".codex-plugin", "plugin.json"), "utf8"));
    assert.equal(manifest.apps, undefined);
    assert.equal(manifest.hooks, undefined);
    assert.equal(manifest.mcpServers, "./.mcp.json");
    assert.deepEqual(await readdir(plugin).then((names) => names.sort()), [".codex-plugin", ".mcp.json", "LICENSE", "assets", "mcp.json", "plugin.json", "skills"]);
    assert.equal(await readFile(join(plugin, "LICENSE"), "utf8"), await readFile(new URL("../LICENSE", import.meta.url), "utf8"));
    assert.deepEqual(JSON.parse(await readFile(join(plugin, ".mcp.json"), "utf8")),
      { mcpServers: { questforge: { url: "https://mcp.guilduo.com/mcp" } } });
    const listing = manifest.interface;
    assert.ok(listing.displayName.length <= 30);
    assert.ok(listing.shortDescription.length <= 30);
    for (const field of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) {
      const url = new URL(listing[field]);
      assert.equal(url.protocol, "https:");
      assert.equal(url.username + url.password, "");
    }
    for (const field of ["logo", "composerIcon"]) {
      const icon = await readFile(join(plugin, listing[field]));
      assert.equal(icon.readUInt32BE(16), 48);
      assert.equal(icon.readUInt32BE(20), 48);
    }
    const review = manifest.extensions["com.openai"].review;
    assert.equal(review.test_cases.positive.length, 5);
    assert.equal(review.test_cases.negative.length, 3);
    const catalog = JSON.parse(await readFile(new URL("../api/mcp-tools.json", import.meta.url), "utf8"));
    const tools = new Set(catalog.tools.map((tool: { name: string }) => tool.name));
    for (const scenario of review.test_cases.positive) {
      assert.ok(scenario.prompt && scenario.description && scenario.expected_behavior);
      for (const name of scenario.tools_triggered.split(", ")) assert.ok(tools.has(name), name);
    }
    assert.equal(review.demo_recording_url, undefined, "A real recording must be supplied in the dashboard, never fabricated.");
    await writeFile(join(plugin, "leftover-secret.txt"), "fake leftover");
    await mkdir(join(plugin, "skills", "questforge-workflows"));
    await writeFile(join(plugin, "skills", "questforge-workflows", "SKILL.md"), "old staged Skill");
    await prepareGuilduoPlugin(undefined, root, { submission: true });
    assert.deepEqual(await readdir(join(plugin, "skills")), ["guilduo-workflows"]);
    await assert.rejects(readFile(join(plugin, "leftover-secret.txt")), { code: "ENOENT" });
    await assert.rejects(prepareGuilduoPlugin(undefined, root, { submission: true, hooks: true }), /exclude/);
    await assert.rejects(prepareGuilduoPlugin("asdk_app_0123456789abcdef0123456789abcdef", root, { submission: true }), /exclude/);
    const local = await prepareGuilduoPlugin(undefined, root, { hooks: true });
    const localManifest = JSON.parse(await readFile(join(local, "plugin", ".codex-plugin", "plugin.json"), "utf8"));
    assert.equal(localManifest.hooks, "./hooks/hooks.json");
    await readFile(join(local, "plugin", "hooks", "hooks.json"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

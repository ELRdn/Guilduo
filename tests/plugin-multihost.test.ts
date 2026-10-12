import assert from "node:assert/strict";
import { cp, link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { prepareGuilduoPlugin, pluginTargets, type PluginTarget } from "../tools/prepare-guilduo-plugin.mts";

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "guilduo-multihost-"));
  await cp(new URL("../LICENSE", import.meta.url), join(root, "LICENSE"));
  await cp(new URL("../plugins/questforge/", import.meta.url), join(root, "plugins", "questforge"), { recursive: true });
  await cp(new URL("../skills/guilduo-workflows/", import.meta.url), join(root, "skills", "guilduo-workflows"), { recursive: true });
  return root;
}

test("five host packages share canonical files and keep host authentication and lifecycle boundaries", async () => {
  const root = await fixture();
  try {
    // A stale mirror and nearby secrets must never enter a package.
    await mkdir(join(root, "plugins", "questforge", "skills", "guilduo-workflows"), { recursive: true });
    await writeFile(join(root, "plugins", "questforge", "skills", "guilduo-workflows", "SKILL.md"), "stale mirror");
    for (const directory of [join(root, "skills"), join(root, "plugins", "questforge", "skills")]) {
      await mkdir(join(directory, "questforge-workflows"), { recursive: true });
      await writeFile(join(directory, "questforge-workflows", "SKILL.md"), "---\nname: questforge-workflows\n---\nOld Skill\n");
    }
    await writeFile(join(root, "skills", "guilduo-workflows", ".env"), "SECRET=not-for-distribution");
    await writeFile(join(root, "plugins", "questforge", "assets", "private.json"), "private");
    await writeFile(join(root, "skills", "guilduo-workflows", "references", "additional.md"), "# Additional canonical reference\n");
    const canonicalReferences = await readdir(join(root, "skills", "guilduo-workflows", "references"));
    const common = ["SKILL.md", "agents/openai.yaml", ...canonicalReferences.map((name) => `references/${name}`)];
    for (const target of pluginTargets) {
      for (const hooks of target === "grok" ? [false] : [false, true]) {
        const output = await prepareGuilduoPlugin(undefined, root, { target, hooks });
        const plugin = join(output, "plugin");
        assert.deepEqual(await readdir(join(plugin, "skills")), ["guilduo-workflows"], `${target}: only the renamed Skill is discoverable`);
        assert.match(await readFile(join(plugin, "skills", "guilduo-workflows", "SKILL.md"), "utf8"), /^---\r?\nname: guilduo-workflows\r?\n/);
        for (const path of common) assert.deepEqual(await readFile(join(plugin, "skills", "guilduo-workflows", path)),
          await readFile(join(root, "skills", "guilduo-workflows", path)), `${target}:${path}`);
        await assert.rejects(readFile(join(plugin, "skills", "guilduo-workflows", ".env")), { code: "ENOENT" });
        await assert.rejects(readFile(join(plugin, "assets", "private.json")), { code: "ENOENT" });
        await assert.rejects(readFile(join(plugin, ".app.json")), { code: "ENOENT" });
        const readJson = async (path: string): Promise<Record<string, unknown>> => JSON.parse(await readFile(join(plugin, path), "utf8")) as Record<string, unknown>;
        if (target === "openai") {
          const manifest = await readJson(".codex-plugin/plugin.json");
          assert.equal(manifest.name, "guilduo-workflows");
          assert.equal(manifest.skills, "./skills/");
          assert.equal(manifest.hooks, hooks ? "./hooks/hooks.json" : undefined);
          await assert.rejects(readFile(join(plugin, "plugin.json")), { code: "ENOENT" });
          assert.deepEqual(await readJson(".mcp.json"), { mcpServers: { questforge: { type: "http", url: "https://mcp.guilduo.com/mcp", authentication: "oauth" } } });
        } else if (target === "grok") {
          const manifest = await readJson("plugin.json");
          assert.equal(manifest.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
          assert.equal(manifest.name, "guilduo-workflows");
          assert.equal(manifest.extensions, undefined);
          assert.deepEqual(await readJson("mcp.json"), { $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json", mcpServers: { questforge: { type: "streamable-http", url: "https://mcp.guilduo.com/mcp" } } });
        } else if (target === "pi") {
          const manifest = await readJson("package.json");
          assert.equal(manifest.name, "guilduo-workflows");
          assert.deepEqual(manifest.peerDependencies, { "@earendil-works/pi-coding-agent": "1.0.4" });
          assert.deepEqual(manifest.files, ["skills/guilduo-workflows", "assets", "LICENSE", "README.md", ...(hooks ? ["extensions"] : [])]);
          assert.deepEqual(manifest.pi, { skills: ["./skills"], ...(hooks ? { extensions: ["./extensions/phase-sync.ts"] } : {}) });
          if (hooks) assert.deepEqual(await readFile(join(plugin, "extensions", "phase-sync.ts")),
            await readFile(join(root, "plugins", "questforge", "pi", "phase-sync.ts")));
        } else if (target === "muse") {
          const manifest = await readJson(".muse-plugin/plugin.json");
          assert.equal(manifest.name, "guilduo-workflows");
          assert.equal(manifest.schemaVersion, 1);
          assert.deepEqual(manifest.compat, { source: "native", manifestDir: ".muse-plugin" });
          const capabilities = manifest.capabilities as { skills: unknown[]; hooks?: { command: string[] }[] };
          assert.deepEqual(capabilities.skills, [{ id: "guilduo-workflows", path: "skills/guilduo-workflows/SKILL.md" }]);
          assert.deepEqual(capabilities.hooks?.map((hook) => hook.command), hooks ? [["node", "hooks/session-start.mjs"], ["node", "hooks/stop.mjs"]] : undefined);
          await assert.rejects(readFile(join(plugin, ".claude-plugin/plugin.json")), { code: "ENOENT" });
          await assert.rejects(readFile(join(plugin, "hooks/hooks.json")), { code: "ENOENT" });
          if (hooks) for (const [file, event] of [["session-start", "SessionStart"], ["stop", "Stop"]]) {
            assert.match(await readFile(join(plugin, `hooks/${file}.mjs`), "utf8"), new RegExp(event!));
          }
        } else {
          const manifest = await readJson(".claude-plugin/plugin.json");
          assert.equal(manifest.name, "guilduo-workflows");
          assert.equal(manifest.skills, "./skills/");
          assert.equal(manifest.mcpServers, target === "claude" ? "./.mcp.json" : undefined);
          assert.equal(manifest.hooks, undefined, "Default hooks/hooks.json discovery must not also declare the same hooks explicitly.");
          if (hooks) await readFile(join(plugin, "hooks", "hooks.json"));
          const marketplace = JSON.parse(await readFile(join(output, ".claude-plugin", "marketplace.json"), "utf8")) as {
            description: string; plugins: { source: string }[];
          };
          assert.equal(marketplace.description, manifest.description);
          assert.deepEqual(marketplace.plugins.map((entry) => entry.source), ["./plugin"]);
        }
        if (target === "pi" || target === "muse") {
          for (const path of ["mcp.json", ".mcp.json", ".app.json"]) await assert.rejects(readFile(join(plugin, path)), { code: "ENOENT" });
          assert.match(await readFile(join(plugin, "README.md"), "utf8"), /native user MCP settings/);
        }
        if (hooks && target !== "pi" && target !== "muse") {
          const hookText = await readFile(join(plugin, "hooks", "hooks.json"), "utf8");
          assert.match(hookText, target === "openai" ? /PLUGIN_ROOT/ : /CLAUDE_PLUGIN_ROOT|MUSE_PLUGIN_ROOT/);
        }
        const validation = JSON.parse(await readFile(join(output, "validation.json"), "utf8")) as {
          liveAcceptance: string; target: string; version: string; files: { path: string; sha256: string }[];
        };
        assert.equal(validation.liveAcceptance, "pending");
        assert.equal(validation.target, target);
        assert.ok(validation.files.some(file => file.path === "skills/guilduo-workflows/SKILL.md"));
        assert.ok(!validation.files.some(file => file.path.includes("questforge-workflows")));
        const sourceVersion = (JSON.parse(await readFile(join(root, "plugins", "questforge", ".codex-plugin", "plugin.json"), "utf8")) as { version: string }).version;
        assert.equal(validation.version, `${sourceVersion}${hooks && (target === "claude" || target === "muse") ? ".hooks" : ""}`);
        for (const file of validation.files) assert.equal(file.sha256,
          createHash("sha256").update(await readFile(join(plugin, file.path))).digest("hex"));
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("unsupported target combinations, unsafe references, credentials and linked sources fail closed", async () => {
  const root = await fixture();
  try {
    await assert.rejects(prepareGuilduoPlugin(undefined, root, { target: "invalid" as PluginTarget }), /Unknown/);
    await assert.rejects(prepareGuilduoPlugin(undefined, root, { target: "grok", hooks: true }), /verified execution/);
    for (const target of ["grok", "claude", "muse", "pi"] as const) {
      await assert.rejects(prepareGuilduoPlugin("asdk_app_0123456789abcdef0123456789abcdef", root, { target }), /OpenAI-only/);
      await assert.rejects(prepareGuilduoPlugin(undefined, root, { target, submission: true }), /only OpenAI/);
    }
    const skill = join(root, "skills", "guilduo-workflows", "SKILL.md");
    const original = await readFile(skill, "utf8");
    for (const malformed of [original.replace("name: guilduo-workflows", "name: questforge-workflows"), original.replace(/^---[\s\S]*?---\r?\n/, "")]) {
      await writeFile(skill, malformed);
      for (const target of pluginTargets) await assert.rejects(prepareGuilduoPlugin(undefined, root, { target }), /frontmatter name must match/);
    }
    await writeFile(skill, `${original}\n[escape](../../.env)\n`);
    await assert.rejects(prepareGuilduoPlugin(undefined, root), /unsafe Skill reference/);
    await writeFile(skill, `${original}\nBearer ${"a".repeat(30)}\n`);
    await assert.rejects(prepareGuilduoPlugin(undefined, root), /Credential-like/);
    await writeFile(skill, original);
    const references = join(root, "skills", "guilduo-workflows", "references");
    const external = join(root, "other-references");
    await mkdir(external);
    await rm(references, { recursive: true });
    await symlink(external, references, "junction");
    await assert.rejects(prepareGuilduoPlugin(undefined, root), /Refusing linked/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("target CLI through junction preserves default output and rejects unknown hosts", async () => {
  const root = await fixture();
  try {
    await mkdir(join(root, "tools"));
    await cp(new URL("../tools/prepare-guilduo-plugin.mts", import.meta.url), join(root, "tools", "prepare-guilduo-plugin.mts"));
    const alias = `${root}-alias`;
    await symlink(root, alias, "junction");
    try {
      const command = [fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url)), join(alias, "tools", "prepare-guilduo-plugin.mts")];
      assert.equal(execFileSync(process.execPath, [...command, "--target", "muse"], { encoding: "utf8" }).trim(),
        join(root, ".qa-artifacts", "guilduo-plugin-muse"));
      assert.throws(() => execFileSync(process.execPath, [...command, "--target", "invalid"], { stdio: "pipe" }), /failed/);
    } finally { await rm(alias); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Claude marketplace rejects linked metadata without overwriting the external catalog", async () => {
  const root = await fixture();
  try {
    const output = join(root, ".qa-artifacts", "guilduo-plugin-claude");
    const external = join(root, "other-marketplace");
    await mkdir(output, { recursive: true });
    await mkdir(external);
    await writeFile(join(external, "marketplace.json"), "existing catalog");
    await symlink(external, join(output, ".claude-plugin"), "junction");
    await assert.rejects(prepareGuilduoPlugin(undefined, root, { target: "claude" }), /Refusing linked output metadata/);
    assert.equal(await readFile(join(external, "marketplace.json"), "utf8"), "existing catalog");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("generator refuses hardlinked validation and marketplace metadata without changing their targets", async () => {
  const root = await fixture();
  try {
    for (const [target, metadata] of [["openai", "validation.json"], ["claude", ".claude-plugin/marketplace.json"]] as const) {
      const output = join(root, ".qa-artifacts", target === "openai" ? "guilduo-plugin" : "guilduo-plugin-claude");
      const outside = join(root, `${target}-unrelated.json`);
      await mkdir(join(output, metadata === "validation.json" ? "." : ".claude-plugin"), { recursive: true });
      await writeFile(outside, "unrelated content");
      await link(outside, join(output, metadata));
      await assert.rejects(prepareGuilduoPlugin(undefined, root, { target }), /Refusing linked output metadata file/);
      assert.equal(await readFile(outside, "utf8"), "unrelated content");
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

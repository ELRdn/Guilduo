import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareGuilduoPlugin } from "../tools/prepare-guilduo-plugin.mts";

test("Guilduo companion bundles the canonical Skill with exactly one connection and rejects invalid App IDs", async () => {
  const root = await mkdtemp(join(tmpdir(), "guilduo-plugin-"));
  try {
    await cp(new URL("../plugins/questforge/", import.meta.url), join(root, "plugins", "questforge"), { recursive: true });
    const appId = "asdk_app_0123456789abcdef0123456789abcdef";
    const output = await prepareGuilduoPlugin(appId, root);
    const plugin = join(output, "plugin");
    const readJson = async (path: string): Promise<Record<string, unknown>> => JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    const desktop = await readJson(join(plugin, ".codex-plugin", "plugin.json"));
    assert.equal(desktop.name, "guilduo-workflows");
    assert.equal(desktop.skills, "./skills/");
    assert.equal(desktop.apps, "./.app.json");
    assert.equal(desktop.mcpServers, undefined);
    assert.deepEqual(await readJson(join(plugin, ".app.json")), { apps: { guilduo: { id: appId } } });
    assert.equal(await readFile(join(plugin, "skills", "questforge-workflows", "SKILL.md"), "utf8"),
      await readFile(new URL("../skills/questforge-workflows/SKILL.md", import.meta.url), "utf8"));
    await readFile(join(plugin, "skills", "questforge-workflows", "references", "tools.md"), "utf8");
    await readFile(join(plugin, "skills", "questforge-workflows", "agents", "openai.yaml"), "utf8");
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

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

/** Build a separate companion package; never modify an installed/legacy plugin. */
export async function prepareGuilduoPlugin(appId?: string, root = repositoryRoot): Promise<string> {
  if (appId !== undefined && !/^(?:plugin_)?asdk_app_[a-f0-9]{32}$/.test(appId)) {
    throw new Error("Expected the registered Guilduo asdk_app_... or plugin_asdk_app_... ID, not a URL or token.");
  }
  const output = join(root, ".qa-artifacts", "guilduo-plugin");
  const pluginRoot = join(output, "plugin");
  const source = join(root, "plugins", "questforge");
  const manifest = JSON.parse(await readFile(join(source, ".codex-plugin", "plugin.json"), "utf8")) as Record<string, unknown>;
  manifest.name = "guilduo-workflows";
  delete manifest.apps;
  delete manifest.mcpServers;
  manifest[appId ? "apps" : "mcpServers"] = appId ? "./.app.json" : "./.mcp.json";
  await mkdir(join(pluginRoot, ".codex-plugin"), { recursive: true });
  await cp(join(source, "skills"), join(pluginRoot, "skills"), { recursive: true });
  const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(join(pluginRoot, ".codex-plugin", "plugin.json"), json(manifest));
  if (appId) {
    await writeFile(join(pluginRoot, ".app.json"), json({ apps: { guilduo: { id: appId } } }));
    await rm(join(pluginRoot, ".mcp.json"), { force: true });
  } else {
    await cp(join(source, ".mcp.json"), join(pluginRoot, ".mcp.json"));
    await rm(join(pluginRoot, ".app.json"), { force: true });
  }
  await mkdir(join(output, ".agents", "plugins"), { recursive: true });
  await writeFile(join(output, ".agents", "plugins", "marketplace.json"), json({
    name: "guilduo-local",
    interface: { displayName: "Guilduo Local" },
    plugins: [{ name: "guilduo-workflows", source: { source: "local", path: "./plugin" },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Productivity" }],
  }));
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { "app-id": { type: "string" } } });
  void prepareGuilduoPlugin(values["app-id"]).then(console.log).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

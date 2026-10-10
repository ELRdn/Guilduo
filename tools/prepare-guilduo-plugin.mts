import { lstat, mkdir, readFile, realpath, readdir, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
export const pluginTargets = ["openai", "grok", "claude", "muse", "pi"] as const;
export type PluginTarget = typeof pluginTargets[number];
const skillRoot = "skills/guilduo-workflows";
const endpoint = "https://mcp.guilduo.com/mcp";
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** Build a separate companion package; never modify an installed/legacy plugin. */
export async function prepareGuilduoPlugin(appId?: string, root = repositoryRoot,
  options: { hooks?: boolean; submission?: boolean; target?: PluginTarget } = {}): Promise<string> {
  const target = options.target ?? "openai";
  if (!pluginTargets.includes(target)) throw new Error("Unknown plugin target.");
  if (appId !== undefined && !/^(?:plugin_)?asdk_app_[a-f0-9]{32}$/.test(appId)) {
    throw new Error("Expected the registered Guilduo asdk_app_... or plugin_asdk_app_... ID, not a URL or token.");
  }
  if (options.submission && (target !== "openai" || appId !== undefined || options.hooks)) {
    throw new Error("Public submissions must use the MCP URL and exclude App references and lifecycle hooks; only OpenAI submission is supported.");
  }
  if (appId !== undefined && target !== "openai") throw new Error("Registered App references are OpenAI-only.");
  if (target === "grok" && options.hooks) throw new Error("Grok Bot hooks have no verified execution contract.");
  root = await realpath(root);
  const outputName = target === "openai"
    ? options.submission ? "guilduo-submission" : options.hooks ? "guilduo-plugin-hooks" : "guilduo-plugin"
    : `guilduo-plugin-${target}${options.hooks ? "-hooks" : ""}`;
  const output = join(root, ".qa-artifacts", outputName);
  const pluginRoot = resolve(output, "plugin");
  const source = "plugins/questforge";
  // Copy only approved files, never a credential-bearing directory or host settings.
  const sourceFile = async (path: string): Promise<Buffer> => {
    const absolute = resolve(root, path);
    const info = await lstat(absolute);
    const canonical = await realpath(absolute);
    if (canonical !== absolute || relative(root, canonical).startsWith(`..${sep}`)
      || !info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error(`Refusing linked or invalid package source: ${path}`);
    const content = await readFile(absolute);
    if (!path.endsWith(".png") && /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}|\bBearer [A-Za-z0-9_.-]{24,}/.test(content.toString())) {
      throw new Error(`Credential-like content in package source: ${path}`);
    }
    return content;
  };
  const manifest = JSON.parse((await sourceFile(`${source}/.codex-plugin/plugin.json`)).toString()) as Record<string, unknown>;
  if (manifest.license !== "AGPL-3.0-only") throw new Error("Plugin must retain AGPL-3.0-only.");
  // Claude keeps same-version caches during update; optional hook contents need a distinct version.
  if (options.hooks && (target === "claude" || target === "muse")) manifest.version = `${manifest.version}.hooks`;
  manifest.name = "guilduo-workflows";
  delete manifest.apps;
  delete manifest.mcpServers;
  delete manifest.hooks;
  const openai = (manifest.extensions as Record<string, Record<string, unknown>>)["com.openai"];
  delete openai.apps;
  delete openai.hooks;
  manifest[appId ? "apps" : "mcpServers"] = appId ? "./.app.json" : "./.mcp.json";
  const referenceDirectory = join(root, skillRoot, "references");
  if (await realpath(referenceDirectory) !== referenceDirectory) throw new Error("Refusing linked Skill reference directory.");
  const references = await readdir(referenceDirectory, { withFileTypes: true });
  const skillFiles = ["SKILL.md", "agents/openai.yaml", ...references.filter((entry) => entry.name.endsWith(".md")).map((entry) => `references/${entry.name}`)];
  const common = new Map<string, Buffer>();
  for (const path of skillFiles) common.set(`${skillRoot}/${path}`, await sourceFile(`${skillRoot}/${path}`));
  const frontmatter = common.get(`${skillRoot}/SKILL.md`)!.toString().match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  if (!frontmatter || !/^name: guilduo-workflows\r?$/m.test(frontmatter)) throw new Error("Canonical Skill frontmatter name must match guilduo-workflows directory and manifest ID.");
  for (const [path, content] of common) {
    if (!path.endsWith(".md")) continue;
    for (const match of content.toString().matchAll(/\]\(([^)]+)\)/g)) {
      const reference = match[1]!.split("#")[0]!;
      if (!reference || /^https:\/\//.test(reference)) continue;
      const destination = relative(pluginRoot, resolve(pluginRoot, dirname(path), reference)).split(sep).join("/");
      if (!common.has(destination)) throw new Error(`Missing or unsafe Skill reference: ${reference}`);
    }
  }
  common.set("assets/guilduo-icon.png", await sourceFile(`${source}/assets/guilduo-icon.png`));
  const license = await sourceFile(`${source}/LICENSE`);
  if (!license.equals(await sourceFile("LICENSE"))) throw new Error("Plugin LICENSE must match the repository LICENSE.");
  common.set("LICENSE", license);
  const hookFiles = new Map<string, Buffer>();
  if (options.hooks) {
    if (target === "pi") hookFiles.set("extensions/phase-sync.ts", await sourceFile(`${source}/pi/phase-sync.ts`));
    else {
      for (const path of target === "muse" ? ["lifecycle.mjs", "README.md"] : ["hooks.json", "lifecycle.mjs", "README.md"]) {
        hookFiles.set(`hooks/${path}`, await sourceFile(`${source}/hooks/${path === "README.md" && target !== "openai" ? "legacy-README.md" : path}`));
      }
      if (target !== "openai" && hookFiles.has("hooks/hooks.json")) {
        const config = JSON.parse(hookFiles.get("hooks/hooks.json")!.toString()) as { hooks: Record<string, { hooks: { command: string }[] }[]> };
        delete config.hooks.Interrupt;
        for (const groups of Object.values(config.hooks)) for (const group of groups) for (const handler of group.hooks) {
          handler.command = handler.command.replace(/ --codex$/, "");
        }
        hookFiles.set("hooks/hooks.json", Buffer.from(json(config)));
      }
      if (target === "muse") for (const [file, event] of [["session-start", "SessionStart"], ["stop", "Stop"]]) {
        hookFiles.set(`hooks/${file}.mjs`, Buffer.from(`process.argv.splice(2, 0, '${event}'); await import('./lifecycle.mjs');\n`));
      }
    }
  }
  // Only rebuild this generator's staging directory; reject junctions before deleting.
  if (dirname(pluginRoot) !== resolve(output)) throw new Error("Invalid plugin staging directory.");
  for (const directory of [join(root, ".qa-artifacts"), output, pluginRoot]) {
    const info = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    });
    if (!info) break;
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(directory) !== resolve(directory)) {
      throw new Error("Refusing linked or invalid plugin staging directories.");
    }
  }
  await rm(pluginRoot, { recursive: true, force: true });
  const files = new Set<string>();
  const put = async (path: string, content: string | Buffer): Promise<void> => {
    await mkdir(dirname(join(pluginRoot, path)), { recursive: true });
    await writeFile(join(pluginRoot, path), content);
    files.add(path);
  };
  for (const [path, content] of [...common, ...hookFiles]) await put(path, content);
  const portable: Record<string, unknown> = { $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json" };
  for (const key of ["name", "version", "description", "author", "homepage", "repository", "license"]) portable[key] = manifest[key];
  if (target === "openai") {
    if (options.hooks) manifest.hooks = "./hooks/hooks.json";
    const extensions = manifest.extensions as Record<string, Record<string, unknown>>;
    portable.extensions = { "com.openai": { ...extensions["com.openai"], interface: manifest.interface,
      ...(appId ? { apps: "./.app.json" } : {}), ...(options.hooks ? { hooks: "./hooks/hooks.json" } : {}) } };
    await put(".codex-plugin/plugin.json", json(manifest));
    if (appId) await put(".app.json", json({ apps: { guilduo: { id: appId } } }));
    else await put(".mcp.json", options.submission
      ? json({ mcpServers: { questforge: { url: endpoint } } })
      : json({ mcpServers: { questforge: { type: "http", url: endpoint, authentication: "oauth" } } }));
  }
  // Codex 0.159.2 skips bundled hooks when root plugin.json selects AgentPlugin.
  // Native Codex/App bundles must select the compatibility manifest instead.
  if ((target === "openai" && options.submission) || target === "grok") {
    await put("plugin.json", json(portable));
    if (!appId) await put("mcp.json", json({ $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: { questforge: { type: "streamable-http", url: endpoint } } }));
  } else if (target === "muse") {
    await put(".muse-plugin/plugin.json", json({ schemaVersion: 1, ...Object.fromEntries(Object.entries(portable).filter(([key]) => key !== "$schema")),
      compat: { source: "native", manifestDir: ".muse-plugin" }, capabilities: {
        skills: [{ id: "guilduo-workflows", path: `${skillRoot}/SKILL.md` }],
        ...(options.hooks ? { hooks: [
          { id: "session-start", event: "SessionStart", command: ["node", "hooks/session-start.mjs"], timeoutMs: 3000 },
          { id: "stop", event: "Stop", command: ["node", "hooks/stop.mjs"], timeoutMs: 10000 },
        ] } : {}),
      } }));
  } else if (target === "claude") {
    const claude = Object.fromEntries(Object.entries(portable).filter(([key]) => key !== "$schema"));
    claude.skills = "./skills/";
    if (target === "claude") {
      claude.mcpServers = "./.mcp.json";
      await put(".mcp.json", json({ mcpServers: { questforge: { type: "http", url: endpoint } } }));
    }
    // Claude merges explicit hooks with hooks/hooks.json; default discovery avoids duplicate loading.
    await put(".claude-plugin/plugin.json", json(claude));
  } else if (target === "pi") {
    await put("package.json", json({ ...Object.fromEntries(Object.entries(portable).filter(([key]) => key !== "$schema")),
      type: "module", keywords: ["pi-package"], engines: { node: ">=22.19.0" },
      files: [skillRoot, "assets", "LICENSE", "README.md", ...(options.hooks ? ["extensions"] : [])],
      peerDependencies: { "@earendil-works/pi-coding-agent": "1.0.4" },
      pi: { skills: ["./skills"], ...(options.hooks ? { extensions: ["./extensions/phase-sync.ts"] } : {}) } }));
  }
  if (target !== "openai") await put("README.md", `# Guilduo Workflows (${target})\n\nAGPL-3.0-only. Common Skill: skills/guilduo-workflows/.\n\n`
    + (target === "pi" || target === "muse"
      ? `Configure ${endpoint} separately in your host's native user MCP settings and complete OAuth there. This package does not copy or change existing MCP configuration or credentials.\n\n`
      : `The bundled remote MCP uses ${endpoint}; complete OAuth in your host.\n\n`)
    + (target === "pi" ? "Requires @earendil-works/pi-coding-agent 1.0.4 and Node >=22.19.0. Install this plugin directory with pi install. Native MCP OAuth needs no bridge. See https://github.com/earendil-works/pi/blob/v1.0.4/packages/coding-agent/docs/mcp.md for user configuration.\n\n" : "")
    + (target === "muse" ? "Targets Muse Code 1.4.4-R5419.1. Validate and install this directory with muse plugins validate/install. The native .muse-plugin manifest declares skills and optional argv hooks; review/trust hooks in Muse before using them in a real session.\n\n" : "")
    + (target === "pi" && options.hooks ? "After MCP verifies standing permission, use /guilduo-sync bind [\"sessionId\",\"questId\",\"actingAgentId\",\"canonicalCwd\"] with exact verified values. /guilduo-sync off, readonly, plan or unbind revoke reminders. Requires trusted interactive TUI mode; forks and tree changes invalidate bindings.\n\n" : "")
    + (options.hooks ? "Optional lifecycle assistance only reminds the Agent. Bind the exact session, Quest, Agent and cwd after standing permission; revoke or unbind to stop reminders. It does not write to MCP, store tokens, or grant authorization.\n\n" : "Lifecycle assistance is not included.\n\n")
    + "Plan Mode, read-only work and revoked permission must not sync. Host confirmation policy remains in force. Packaging checks do not prove live OAuth, Human feedback or proactive sync acceptance.\n");
  if (target === "openai" && !options.submission) await put("README.md", `# Guilduo Workflows for Codex\n\nVersion ${manifest.version}. AGPL-3.0-only.\n\n`
    + (appId ? "Local companion for the existing registered Guilduo App. Reuse its connection; no second MCP server is bundled. Do not submit this App-reference package to the public directory.\n\n"
      : "Connect the bundled https://mcp.guilduo.com/mcp through native OAuth. Keep the questforge MCP identifier. Do not enable a duplicate registered-App companion or standalone Skill.\n\n")
    + (options.hooks ? "Review and trust these exact hooks with Codex /hooks, then explicitly bind a verified session/Quest/Agent/cwd after standing permission. See hooks/README.md for beta.12 receipts. Installation never grants permission.\n\n"
      : "Lifecycle hooks are not included.\n\n")
    + "The canonical Skill and all its references are copied unchanged. Public OpenAI submission uses a separate hooks-free, App-free ZIP. Fresh MCP schemas, actual OAuth and Human feedback remain acceptance gates.\n");
  // Check every generated file and every canonical Skill copy; no broad source copies.
  const inspect = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await inspect(absolute);
      else if (!entry.isFile() || !files.has(relative(pluginRoot, absolute).split(sep).join("/"))) throw new Error("Unexpected package file.");
    }
  };
  await inspect(pluginRoot);
  for (const [path, content] of common) if (!(await readFile(join(pluginRoot, path))).equals(content)) throw new Error("Package content mismatch.");
  const referencedFiles = target === "openai"
    ? [".codex-plugin/plugin.json", appId ? ".app.json" : ".mcp.json", ...(options.submission ? ["plugin.json", "mcp.json"] : [])]
    : target === "grok" ? ["plugin.json", "mcp.json"]
    : target === "pi" ? ["package.json"] : target === "muse" ? [".muse-plugin/plugin.json"] : [".claude-plugin/plugin.json", ".mcp.json"];
  for (const path of [...referencedFiles, ...(options.hooks && target !== "pi" && target !== "muse" ? ["hooks/hooks.json"] : [])]) JSON.parse(await readFile(join(pluginRoot, path), "utf8"));
  if (target === "openai") {
    const listing = manifest.interface as Record<string, string>;
    for (const field of ["logo", "composerIcon"]) {
      if (listing[field] !== "./assets/guilduo-icon.png") throw new Error(`Invalid package asset reference: ${field}`);
    }
  }
  const writeOutput = async (path: string, value: unknown): Promise<void> => {
    let directory = output;
    for (const part of path.split("/").slice(0, -1)) {
      directory = join(directory, part);
      const info = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return undefined;
      });
      if (info && (!info.isDirectory() || await realpath(directory) !== directory)) throw new Error("Refusing linked output metadata directory.");
      await mkdir(directory, { recursive: true });
    }
    const absolute = join(output, path);
    const info = await lstat(absolute).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    });
    if (info && (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)) throw new Error("Refusing linked output metadata file.");
    await writeFile(absolute, json(value));
  };
  await writeOutput("validation.json", { target, version: manifest.version, hooks: Boolean(options.hooks),
    submission: Boolean(options.submission), connection: appId ? "registered-app" : target === "pi" || target === "muse" ? "user-settings" : "remote-mcp",
    checks: { commonSkill: "passed", references: "passed", fileAllowlist: "passed" }, liveAcceptance: "pending",
    files: await Promise.all([...files].sort().map(async (path) => ({ path,
      sha256: createHash("sha256").update(await readFile(join(pluginRoot, path))).digest("hex") }))) });
  if (options.submission) return output;
  if (target === "openai") {
    await writeOutput(".agents/plugins/marketplace.json", {
      name: "guilduo-local", interface: { displayName: "Guilduo Local" },
      plugins: [{ name: "guilduo-workflows", source: { source: "local", path: "./plugin" },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Productivity" }],
    });
  } else if (target === "claude") {
    const author = manifest.author as { name: string; email?: string };
    await writeOutput(".claude-plugin/marketplace.json", {
      name: `guilduo-${target}-local`, description: manifest.description, owner: { name: author.name, email: author.email },
      plugins: [{ name: "guilduo-workflows", source: "./plugin", description: manifest.description }],
    });
  }
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  const { values } = parseArgs({ options: { "app-id": { type: "string" }, target: { type: "string" },
    hooks: { type: "boolean" }, submission: { type: "boolean" } } });
  if (values.target && !pluginTargets.includes(values.target as PluginTarget)) {
    console.error(`Expected --target ${pluginTargets.join("|")}`);
    process.exitCode = 1;
  } else void prepareGuilduoPlugin(values["app-id"], repositoryRoot, { ...values, target: values.target as PluginTarget | undefined }).then(console.log).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

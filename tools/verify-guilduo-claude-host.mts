import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Run with: node --import tsx tools/verify-guilduo-claude-host.mts
// Native plugin management and isolated MCP-setting sentinel setup; no login, MCP calls, or inference.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(repo, ".qa-artifacts", "guilduo-claude-host");
const run = join(output, `run-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`);
const executable = process.env.GUILDUO_CLAUDE_EXECUTABLE || "claude";
const baseVersion = (await json(join(repo, "plugins", "questforge", ".codex-plugin", "plugin.json"))).version as string;
assert(typeof baseVersion === "string" && /^\d+\.\d+\.\d+-[\w.-]+$/.test(baseVersion), "Expected prerelease source version");
const hooksVersion = `${baseVersion}.hooks`;
const marketplace = "guilduo-claude-local";
const plugin = `guilduo-workflows@${marketplace}`;
const report = {
  startedAt: new Date().toISOString(), completedAt: "", hostVersion: "", state: "running", inferenceCommands: 0,
  baseToHooksUpdate: "not-tested", generatedVersions: { base: baseVersion, hooks: hooksVersion },
  mcpSentinel: { name: "guilduo-preservation-sentinel", type: "http", url: "http://127.0.0.1:1/guilduo-test-sentinel" },
  isolation: "Fresh CLAUDE_CONFIG_DIR, HOME, USERPROFILE, APPDATA, LOCALAPPDATA and cwd; environment allowlist; no inherited credentials",
  limits: ["Local CLI acceptance only; public marketplace, OAuth, Code/Chat/Cowork sessions, live Stop events and Human acceptance remain unverified.",
    "Update fixture changes only an owned copy's version; it is not a published release or a reconstruction of beta.9."],
  findings: [] as string[],
  shellProbes: [] as { event: string; code: number | null; stdout: string; stderr: string; kind: string }[],
  steps: [] as { variant: string; args: string[]; code: number | null; stdout: string; stderr: string; elapsedMs: number; timedOut: boolean }[],
  variants: [] as { name: string; state: string; checks: string[]; files: Record<string, string>; error?: string }[],
};
function clean(value: string) {
  let sanitized = value.replace(/\x1b\[[0-9;]*m/g, "");
  for (const [path, placeholder] of [[run, "<run>"], [repo, "<repo>"]]) {
    for (const width of [4, 2, 1]) sanitized = sanitized.replaceAll(path.replaceAll("\\", "\\".repeat(width)), placeholder);
  }
  return sanitized.replace(/(?:Bearer\s+|(?:access_token|refresh_token|api_key|authorization)["'\s:=]+)[^\s,"'}]+/gi, "[redacted]")
    .replace(/\b(?:sk-ant-[\w-]+|sk-[\w-]{20,})\b/g, "[redacted]");
}
async function save() {
  await writeFile(join(run, "evidence.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(output, "latest.json"), `${JSON.stringify({ run: relative(repo, run), state: report.state }, null, 2)}\n`);
}
async function files(root: string): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  async function visit(directory: string) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      assert(!entry.isSymbolicLink(), "Fixture must not contain symlinks");
      if (entry.isDirectory()) await visit(path);
      else hashes[relative(root, path).replaceAll("\\", "/")] = createHash("sha256").update(await readFile(path)).digest("hex");
    }
  }
  await visit(root);
  return hashes;
}
async function json(path: string) { return JSON.parse(await readFile(path, "utf8")); }
async function command(variant: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  assert(args[0] === "--version" || (args[0] === "plugin" && ["marketplace", "list", "install", "details", "update", "disable", "enable", "uninstall"].includes(args[1]))
    || (args[0] === "mcp" && args[1] === "add" && args.includes(report.mcpSentinel.name) && args.includes(report.mcpSentinel.url))
    || (args[0] === "--plugin-dir" && args[2] === "plugin" && args[3] === "details"), "No inference commands allowed");
  const started = Date.now();
  const result = await new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>((accept, reject) => {
    const child = spawn(executable, args, { cwd, env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", timedOut = false;
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 45_000);
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => { clearTimeout(timer); accept({ code, stdout, stderr, timedOut }); });
  });
  report.steps.push({ variant, args: args.map(clean), ...result, stdout: clean(result.stdout), stderr: clean(result.stderr), elapsedMs: Date.now() - started });
  await save();
  assert(!result.timedOut && result.code === 0, `CLI failed: ${args.join(" ")} (exit ${result.code})`);
  return result.stdout;
}

await mkdir(run, { recursive: true });
try {
  for (const hooks of [false, true]) {
    const name = hooks ? "hooks" : "without-hooks";
    const root = join(run, name);
    const cwd = join(root, "workspace");
    const profile = join(root, "profile");
    const source = join(root, "marketplace");
    const expectedVersion = hooks ? hooksVersion : baseVersion;
    const home = join(root, "home");
    const env: NodeJS.ProcessEnv = {};
    for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "CLAUDE_CODE_GIT_BASH_PATH"]) {
      if (process.env[key]) env[key] = process.env[key];
    }
    Object.assign(env, { CLAUDE_CONFIG_DIR: profile, HOME: home, USERPROFILE: home,
      APPDATA: join(home, "AppData", "Roaming"), LOCALAPPDATA: join(home, "AppData", "Local"),
      TEMP: join(root, "tmp"), TMP: join(root, "tmp"), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      DISABLE_AUTOUPDATER: "1", DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1", NO_COLOR: "1" });
    for (const path of [cwd, profile, home, env.APPDATA!, env.LOCALAPPDATA!, env.TEMP!]) await mkdir(path, { recursive: true });
    const result: typeof report.variants[number] = { name, state: "running", checks: [], files: {} };
    report.variants.push(result);
    const cli = (args: string[]) => command(name, args, cwd, env);
    const check = (label: string, condition: unknown) => { assert(condition, label); result.checks.push(label); };
    const installed = async () => JSON.parse(await cli(["plugin", "list", "--json"]));
    try {
      report.hostVersion = (await cli(["--version"])).trim();
      check("fresh isolated profile has no installed plugins", (await installed()).length === 0);
      await cli(["mcp", "add", "--transport", "http", "--scope", "user", report.mcpSentinel.name, report.mcpSentinel.url]);
      const sentinelPath = join(profile, ".claude.json");
      const sentinel = (await json(sentinelPath)).mcpServers?.[report.mcpSentinel.name];
      check("pre-existing isolated user MCP sentinel has the exact test setting", JSON.stringify(sentinel) === JSON.stringify({ type: report.mcpSentinel.type, url: report.mcpSentinel.url }));
      const sentinelUnchanged = async (stage: string) => check(`pre-existing MCP sentinel survives ${stage}`,
        JSON.stringify((await json(sentinelPath)).mcpServers?.[report.mcpSentinel.name]) === JSON.stringify(sentinel));
      const generated = join(repo, ".qa-artifacts", `guilduo-plugin-claude${hooks ? "-hooks" : ""}`);
      await mkdir(source, { recursive: true });
      await cp(join(generated, "plugin"), join(source, "plugin"), { recursive: true });
      await cp(join(generated, ".claude-plugin"), join(source, ".claude-plugin"), { recursive: true });
      check(`generated manifest version is ${expectedVersion}`, (await json(join(source, "plugin", ".claude-plugin", "plugin.json"))).version === expectedVersion);
      result.files = await files(join(source, "plugin"));
      check("owned snapshot exactly matches generated input", JSON.stringify(result.files) === JSON.stringify(await files(join(generated, "plugin"))));
      await cli(["plugin", "marketplace", "add", source, "--scope", "user"]);
      await cli(["plugin", "install", plugin, "--scope", "user", "--json"]);
      let entry = (await installed()).find((item: { id: string }) => item.id === plugin);
      check("real native install is enabled at the generated version", entry?.enabled === true && entry?.version === expectedVersion);
      check("installed cache manifest carries the generated version", (await json(join(entry.installPath, ".claude-plugin", "plugin.json"))).version === expectedVersion);
      check("installed cache contents exactly match generated bundle", JSON.stringify(await files(entry.installPath)) === JSON.stringify(result.files));
      const inventory = await cli(["plugin", "details", plugin]);
      check("host discovers exactly one canonical Skill", /Skills \(1\)\s+guilduo-workflows(?:\s|$)/.test(inventory));
      check("host discovers exactly one questforge MCP declaration", /MCP servers \(1\)\s+questforge\s/.test(inventory));
      check(hooks ? "host discovers SessionStart and Stop exactly once" : "host discovers no hooks in default bundle",
        hooks ? /Hooks \(2\)\s+SessionStart, Stop/.test(inventory) : /Hooks \(0\)/.test(inventory));
      const cacheInventory = await cli(["--plugin-dir", entry.installPath, "plugin", "details", "guilduo-workflows"]);
      check("native parser discovers the installed cache's hook inventory", hooks ? /Hooks \(2\)\s+SessionStart, Stop/.test(cacheInventory) : /Hooks \(0\)/.test(cacheInventory));
      if (hooks && process.platform === "win32") {
        const bash = env.CLAUDE_CODE_GIT_BASH_PATH || join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe");
        const hookEnv = { ...env, CLAUDE_PLUGIN_ROOT: entry.installPath, CLAUDE_PLUGIN_DATA: join(root, "hook data") };
        const event = { session_id: "host-shell-fixture", cwd, permission_mode: "default", stop_hook_active: false };
        const configuration = await json(join(entry.installPath, "hooks", "hooks.json"));
        const probe = (eventName: string) => {
          const handler = configuration.hooks[eventName][0].hooks[0];
          const child = spawnSync(bash, ["--noprofile", "--norc", "-c", handler.command], {
            cwd, env: hookEnv, encoding: "utf8", windowsHide: true, timeout: 10_000,
            input: JSON.stringify({ ...event, hook_event_name: eventName }),
          });
          report.shellProbes.push({ event: eventName, code: child.status, stdout: clean(child.stdout || ""), stderr: clean(child.stderr || ""), kind: "direct Git Bash execution with synthetic hook event; not a live Claude session" });
          check(`bundled ${eventName} command runs through Git Bash`, child.status === 0 && !child.error);
          return JSON.parse(child.stdout);
        };
        check("SessionStart command returns context using Claude-only environment", probe("SessionStart").hookSpecificOutput?.hookEventName === "SessionStart");
        check("unbound Stop shell command does not request continuation", Object.keys(probe("Stop")).length === 0);
      }
      await cli(["plugin", "marketplace", "update", marketplace]);
      await cli(["plugin", "update", plugin, "--scope", "user", "--json"]);
      entry = (await installed()).find((item: { id: string }) => item.id === plugin);
      check("same-version update retains generated version", entry?.version === expectedVersion);
      if (!hooks) {
        // Same marketplace/plugin ID; the generated .hooks version must replace the installed cache.
        const generatedHooks = join(repo, ".qa-artifacts", "guilduo-plugin-claude-hooks", "plugin");
        await cp(generatedHooks, join(source, "plugin"), { recursive: true });
        check("hook transition uses the actual generated .hooks manifest", (await json(join(source, "plugin", ".claude-plugin", "plugin.json"))).version === hooksVersion);
        await cli(["plugin", "marketplace", "update", marketplace]);
        const transition = JSON.parse(await cli(["plugin", "update", plugin, "--scope", "user", "--json"]));
        const transitionedInventory = await cli(["plugin", "details", plugin]);
        check("base-to-hooks update reports actual version replacement", transition.updateOutcome === "updated" && transition.oldVersion === baseVersion && transition.newVersion === hooksVersion);
        entry = (await installed()).find((item: { id: string }) => item.id === plugin);
        check("base-to-hooks installed registration uses .hooks version with unchanged ID", entry?.version === hooksVersion && entry?.enabled === true && entry?.id === plugin);
        check("base-to-hooks cache manifest has the generated .hooks version", (await json(join(entry.installPath, ".claude-plugin", "plugin.json"))).version === hooksVersion);
        check("base-to-hooks installed cache exactly matches generated hook bundle", JSON.stringify(await files(entry.installPath)) === JSON.stringify(await files(generatedHooks)));
        const transitionedCache = await cli(["--plugin-dir", entry.installPath, "plugin", "details", "guilduo-workflows"]);
        check("marketplace and installed cache both discover SessionStart and Stop", /Hooks \(2\)\s+SessionStart, Stop/.test(transitionedInventory) && /Hooks \(2\)\s+SessionStart, Stop/.test(transitionedCache));
        report.baseToHooksUpdate = "pass";
        await sentinelUnchanged("base-to-hooks update");
      }
      const manifestPath = join(source, "plugin", ".claude-plugin", "plugin.json");
      const manifest = await json(manifestPath);
      const previousVersion = manifest.version;
      manifest.version = `${previousVersion}.host-fixture.1`;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await cli(["plugin", "marketplace", "update", marketplace]);
      const fixtureUpdate = JSON.parse(await cli(["plugin", "update", plugin, "--scope", "user", "--json"]));
      check("derived fixture version update reports the exact transition", fixtureUpdate.updateOutcome === "updated" && fixtureUpdate.oldVersion === previousVersion && fixtureUpdate.newVersion === manifest.version);
      entry = (await installed()).find((item: { id: string }) => item.id === plugin);
      check("real native update installs distinct fixture version", entry?.version === manifest.version && entry?.enabled === true);
      check("updated cache exactly matches fixture", JSON.stringify(await files(entry.installPath)) === JSON.stringify(await files(join(source, "plugin"))));
      check("version-changing update loads optional hooks from installed cache", /Hooks \(2\)\s+SessionStart, Stop/.test(await cli(["--plugin-dir", entry.installPath, "plugin", "details", "guilduo-workflows"])));
      await cli(["plugin", "disable", plugin, "--scope", "user", "--json"]);
      entry = (await installed()).find((item: { id: string }) => item.id === plugin);
      check("native disable persists", entry?.enabled === false);
      await sentinelUnchanged("plugin disable");
      await cli(["plugin", "enable", plugin, "--scope", "user", "--json"]);
      entry = (await installed()).find((item: { id: string }) => item.id === plugin);
      check("native enable persists", entry?.enabled === true);
      await cli(["plugin", "uninstall", plugin, "--scope", "user", "--json"]);
      check("native uninstall removes installed registration", (await installed()).length === 0);
      await sentinelUnchanged("plugin uninstall");
      await cli(["plugin", "marketplace", "remove", marketplace, "--scope", "user"]);
      check("native marketplace removal persists", JSON.parse(await cli(["plugin", "marketplace", "list", "--json"])).length === 0);
      await sentinelUnchanged("marketplace removal");
      const settings = await json(join(profile, "settings.json"));
      check("uninstall and removal leave no enabled plugin or marketplace declaration", Object.keys(settings.enabledPlugins ?? {}).length === 0 && Object.keys(settings.extraKnownMarketplaces ?? {}).length === 0);
      result.state = "pass";
    } catch (error) {
      result.state = "fail";
      result.error = clean(error instanceof Error ? error.message : String(error));
    }
    await save();
    console.log(`${name}: ${result.state} (${result.checks.length} checks)`);
  }
  report.state = report.variants.every(variant => variant.state === "pass") ? "pass" : "fail";
} catch (error) {
  report.state = "fail";
  console.error(clean(error instanceof Error ? error.message : String(error)));
} finally {
  report.completedAt = new Date().toISOString();
  await save();
  console.log(`Evidence: ${relative(repo, join(run, "evidence.json"))}`);
  if (report.state !== "pass") process.exitCode = 1;
}

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const pluginId = "guilduo-workflows@guilduo-local";
const cli = process.platform === "win32"
  ? [process.execPath, join(process.env.APPDATA!, "npm/node_modules/@openai/codex/bin/codex.js")]
  : ["codex"];
type Tool = { inputSchema?: { properties?: Record<string, unknown> } };
type Hook = { eventName: string; command: string; handlerType: string; pluginId: string | null;
  sourcePath: string; enabled: boolean; trustStatus: string; currentHash: string };
type Inventory = { name: string; pluginId: string | null; httpOrigin: string | null;
  authStatus: string; runtimeStatus: string | null; toolsError: string | null; tools: Record<string, Tool> };

export function assertFreshGuilduoSchemas(tools: Record<string, Tool>): void {
  for (const [name, fields] of [
    ["update_quest", ["expectedUpdatedAt", "actingAgentId"]],
    ["get_current_agent_context", ["actingAgentId"]],
    ["get_quest", ["actingAgentId"]],
    ["list_human_requests", ["actingAgentId"]],
    ["request_human_review", ["expectedUpdatedAt", "actingAgentId"]],
  ] as const) {
    const properties = tools[name]?.inputSchema?.properties;
    assert.ok(properties && fields.every(field => Object.hasOwn(properties, field)), `stale-native-schema:${name}`);
  }
}

function native(args: string[], cwd: string, env: NodeJS.ProcessEnv): string {
  const result = spawnSync(cli[0]!, [...cli.slice(1), ...args], { cwd, env, encoding: "utf8", timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  assert.equal(result.status, 0, `native-command-failed:${args.slice(0, 2).join("/")}`);
  return args[0] === "login" && args[1] === "status" ? result.stdout + result.stderr : result.stdout;
}

async function assertFrozenPlugin(source: string, installed: string): Promise<void> {
  assert.equal(await realpath(installed), installed, "linked-native-plugin");
  const expected = (await readdir(source)).sort();
  assert.deepEqual((await readdir(installed)).sort(), expected, "native-plugin-member-drift");
  for (const name of expected) {
    const input = join(source, name);
    const output = join(installed, name);
    const info = await lstat(output);
    if ((await lstat(input)).isDirectory()) {
      assert.ok(info.isDirectory() && !info.isSymbolicLink(), "linked-native-plugin-directory");
      await assertFrozenPlugin(input, output);
    } else {
      assert.ok(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, "linked-native-plugin-file");
      assert.deepEqual(await readFile(output), await readFile(input), "native-plugin-byte-drift");
    }
  }
}

function rpc(cwd: string, env: NodeJS.ProcessEnv, live: boolean) {
  const child = spawn(cli[0]!, [...cli.slice(1), "app-server", "--stdio",
    "-c", "features.hooks=true", "-c", "features.plugins=true",
    "-c", "features.remote_plugin=false", "-c", "features.recommended_plugins=false",
    "-c", `plugins.\"${pluginId}\".mcp_servers.questforge.enabled=${live}`],
  { cwd, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let nextId = 0;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  const hookNotifications: { method: string; eventName: string; status: string; source: string | null;
    turnIdPresent: boolean; entryKinds: string[]; publishedFields: string[] }[] = [];
  child.stderr.resume();
  const lines = createInterface({ input: child.stdout });
  lines.on("line", line => {
    if (Buffer.byteLength(line) > 2 * 1024 * 1024) { child.kill(); return; }
    try {
      const message = JSON.parse(line) as { id?: number; error?: unknown; result?: unknown; method?: string;
        params?: { turnId?: string | null; run?: { eventName?: string; status?: string; source?: string;
          entries?: { kind?: string }[] } } };
      if ((message.method === "hook/started" || message.method === "hook/completed") && message.params?.run
        && hookNotifications.length < 100) {
        const { run } = message.params;
        hookNotifications.push({ method: message.method, eventName: run.eventName ?? "unknown", status: run.status ?? "unknown",
          source: run.source ?? null, turnIdPresent: typeof message.params.turnId === "string",
          entryKinds: (run.entries ?? []).map(entry => entry.kind ?? "unknown"), publishedFields: Object.keys(run).sort() });
      }
      if (message.id === undefined) return;
      const request = pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer); pending.delete(message.id);
      if (message.error) request.reject(new Error("native-rpc-rejected"));
      else request.resolve(message.result);
    } catch { child.kill(); }
  });
  const fail = () => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error("native-rpc-stopped")); }
    pending.clear();
  };
  child.on("error", fail); child.on("exit", fail);
  const allowed = new Set(["initialize", "skills/list", "hooks/list", "thread/start", "config/mcpServer/reload",
    "mcpServerStatus/list", "mcpServer/tool/call"]);
  const call = (method: string, params: unknown): Promise<unknown> => {
    assert.ok(allowed.has(method), "disallowed-native-method");
    return new Promise((resolveRequest, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("native-rpc-timeout")); child.kill(); }, 30_000);
      pending.set(id, { resolve: resolveRequest, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  };
  return { call, hookNotifications, initialized: () => child.stdin.write('{"method":"initialized"}\n'),
    close: () => { lines.close(); child.stdin.end(); child.kill(); fail(); } };
}

export async function verifyGuilduoCodexHost(root = repositoryRoot,
  options: { profile?: string; live?: boolean; actingAgentId?: string; trustUi?: boolean } = {}) {
  root = await realpath(root);
  const artifacts = join(root, ".qa-artifacts");
  await mkdir(artifacts, { recursive: true });
  assert.equal(await realpath(artifacts), artifacts, "linked-artifacts");
  const run = join(artifacts, `guilduo-codex-${randomUUID()}`);
  await mkdir(run);
  const cwd = join(run, "workspace");
  await mkdir(cwd);
  const profile = resolve(options.profile ?? join(run, "profile"));
  const contained = relative(artifacts, profile);
  assert.ok(contained && contained !== ".." && !contained.startsWith(`..${sep}`) && !isAbsolute(contained), "profile-outside-artifacts");
  if (options.live) {
    assert.ok(options.profile, "live-requires-prepared-profile");
    assert.match(options.actingAgentId ?? "", /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/, "live-requires-Agent-selection");
  }
  await mkdir(profile, { recursive: true });
  assert.equal(await realpath(profile), profile, "linked-profile");
  const env: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: profile };
  for (const key of ["OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_ACCESS_TOKEN", "AZURE_OPENAI_API_KEY"]) delete env[key];
  const config = join(profile, "config.toml");
  if (!(await lstat(config).catch(error => { if (error.code !== "ENOENT") throw error; return undefined; }))) {
    await writeFile(config, 'approval_policy = "never"\nsandbox_mode = "read-only"\n[analytics]\nenabled = false\n[features]\nremote_plugin = false\nrecommended_plugins = false\n', { flag: "wx" });
  }
  const evidence: Record<string, unknown> = { hostVersion: native(["--version"], cwd, env).trim(), profile,
    modelCalls: 0, accountWrites: 0, oauthInitiated: false, actualHumanRoundtrip: false, actualMcpWrite: false,
    liveRequested: Boolean(options.live), status: "running", checks: {} };
  const checks = evidence.checks as Record<string, unknown>;
  let server: ReturnType<typeof rpc> | undefined;
  try {
    if (options.live) assert.match(native(["login", "status"], cwd, env), /Logged in using ChatGPT/, "existing-ChatGPT-login-required");
    const marketplace = join(run, "marketplace");
    await mkdir(join(marketplace, ".agents/plugins"), { recursive: true });
    await cp(join(root, "plugins/guilduo-workflows"), join(marketplace, "plugin"), { recursive: true });
    await writeFile(join(marketplace, ".agents/plugins/marketplace.json"), JSON.stringify({ name: "guilduo-local",
      plugins: [{ name: "guilduo-workflows", source: { source: "local", path: "./plugin" },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Productivity" }] }));
    const catalogs = JSON.parse(native(["plugin", "marketplace", "list", "--json"], cwd, env)) as {
      marketplaces: { name: string; root: string }[] };
    const existing = catalogs.marketplaces.filter(item => item.name === "guilduo-local");
    assert.ok(existing.length <= 1, "duplicate-isolated-marketplace");
    if (existing.length) {
      // A prepared QA profile may already register this compatibility identity.
      // Reuse its catalog rather than removing it or changing its registration.
      const catalogRoot = resolve(existing[0]!.root);
      const catalogRelative = relative(artifacts, catalogRoot);
      assert.ok(catalogRelative && catalogRelative !== ".." && !catalogRelative.startsWith(`..${sep}`)
        && !isAbsolute(catalogRelative), "existing-marketplace-outside-artifacts");
      assert.equal(await realpath(catalogRoot), catalogRoot, "linked-isolated-marketplace");
      checks.marketplaceRegistration = "reused_existing_QA_catalog";
    } else {
      native(["plugin", "marketplace", "add", marketplace, "--json"], cwd, env);
      checks.marketplaceRegistration = "created_isolated_QA_catalog";
    }
    const installed = JSON.parse(native(["plugin", "add", pluginId, "--json"], cwd, env)) as { installedPath: string; version: string };
    assert.equal(installed.version, "0.6.0-beta.12");
    const installedRelative = relative(profile, resolve(installed.installedPath));
    assert.ok(installedRelative && installedRelative !== ".." && !installedRelative.startsWith(`..${sep}`)
      && !isAbsolute(installedRelative), "installed-plugin-outside-QA-profile");
    await assertFrozenPlugin(join(root, "plugins/guilduo-workflows"), resolve(installed.installedPath));
    checks.install = { status: "passed", version: installed.version };
    server = rpc(cwd, env, Boolean(options.live));
    await server.call("initialize", { clientInfo: { name: "guilduo_native_acceptance", version: installed.version }, capabilities: { experimentalApi: true } });
    server.initialized();
    const discoveryThread = await server.call("thread/start", { cwd, ephemeral: true, sandbox: "read-only", approvalPolicy: "never",
      modelProvider: "openai", model: "gpt-6-astra" }) as { modelProvider: string; model: string };
    assert.equal(discoveryThread.modelProvider, "openai", "unexpected-native-provider");
    assert.equal(discoveryThread.model, "gpt-6-astra", "unexpected-native-model");
    checks.threadConfiguration = { modelProvider: discoveryThread.modelProvider, model: discoveryThread.model,
      assertedReturnedConfiguration: true, modelTurnStarted: false };
    const skills = await server.call("skills/list", { cwds: [cwd], forceReload: true }) as { data: { skills: { name: string; pluginId: string; path: string; enabled: boolean }[]; errors: unknown[] }[] };
    const loaded = skills.data.flatMap(entry => entry.skills).filter(skill => skill.pluginId === pluginId && skill.enabled);
    checks.discoveredSkills = loaded.map(({ name, pluginId }) => ({ name, pluginId }));
    assert.equal(loaded.length, 1, "duplicate-or-missing-Skill");
    assert.equal(loaded[0]!.name, "guilduo-workflows:guilduo-workflows", "unexpected-Skill-name");
    assert.deepEqual(skills.data.flatMap(entry => entry.errors), [], "native-Skill-discovery-errors");
    assert.deepEqual(await readFile(loaded[0]!.path), await readFile(join(root, "skills/guilduo-workflows/SKILL.md")));
    checks.skillDiscovery = "passed";
    const hooks = await server.call("hooks/list", { cwds: [cwd] }) as { data: { hooks: Hook[]; errors: unknown[] }[] };
    checks.discoveredHooks = hooks.data.flatMap(entry => entry.hooks).map(({ eventName, pluginId }) => ({ eventName, pluginId }));
    const bundled = hooks.data.flatMap(entry => entry.hooks).filter(hook => hook.pluginId === pluginId);
    assert.deepEqual(hooks.data.flatMap(entry => entry.errors), [], "native-hook-discovery-errors");
    checks.nativeHookTrust = bundled.map(({ eventName, trustStatus, enabled, currentHash }) => ({ eventName, trustStatus, enabled, currentHash }));
    const pluginData = join(run, "fixture-data");
    const fixtureEnv = { ...env, PLUGIN_ROOT: installed.installedPath, PLUGIN_DATA: pluginData };
    const script = join(installed.installedPath, "hooks/lifecycle.mjs");
    const invoke = (args: string[], input?: string) => {
      const result = spawnSync(process.execPath, [script, ...args, ...(["SessionStart", "Stop", "Interrupt"].includes(args[0]!) ? ["--codex"] : [])], { cwd, env: fixtureEnv, input, encoding: "utf8", timeout: 10_000, windowsHide: true });
      assert.equal(result.status, 0, "hook-fixture-failed");
      return JSON.parse(result.stdout) as { decision?: string };
    };
    const event = (extra = {}) => JSON.stringify({ hook_event_name: "Stop", session_id: "fixture-session", turn_id: "fixture-turn",
      cwd, permission_mode: "default", stop_hook_active: false, ...extra });
    assert.deepEqual(invoke(["Stop"], event()), {});
    invoke(["bind", "fixture-session", "fixture-quest", "fixture-agent", cwd]);
    assert.equal(invoke(["Stop"], event()).decision, "block");
    assert.deepEqual(invoke(["Stop"], event()), {});
    invoke(["unbind", "fixture-session", cwd]);
    invoke(["bind", "fixture-session", "different-quest", "different-agent", cwd]);
    assert.deepEqual(invoke(["Stop"], event()), {});
    assert.deepEqual(invoke(["Interrupt"], event({ hook_event_name: "Interrupt", turn_id: "interrupted-turn" })), {});
    assert.deepEqual(invoke(["Stop"], event({ turn_id: "interrupted-turn" })), {});
    checks.installedScriptFixtures = "passed_synthetic_not_native_trusted_execution";
    if (options.live) {
      await server.call("config/mcpServer/reload", {});
      const started = await server.call("thread/start", { cwd, ephemeral: true, sandbox: "read-only", approvalPolicy: "never",
        modelProvider: "openai", model: "gpt-6-astra" }) as { thread: { id: string }; modelProvider: string; model: string };
      assert.equal(started.modelProvider, "openai", "unexpected-native-provider");
      assert.equal(started.model, "gpt-6-astra", "unexpected-native-model");
      const servers: Inventory[] = [];
      let cursor: string | null = null;
      const cursors = new Set<string>();
      do {
        const page = await server.call("mcpServerStatus/list", { threadId: started.thread.id, cursor, limit: 100 }) as { data: Inventory[]; nextCursor: string | null };
        servers.push(...page.data); cursor = page.nextCursor;
        if (cursor) {
          assert.ok(!cursors.has(cursor) && cursors.size < 20, "unbounded-native-inventory");
          cursors.add(cursor);
        }
      } while (cursor);
      const mcp = servers.filter(item => item.pluginId === pluginId && item.httpOrigin === "https://mcp.guilduo.com");
      assert.equal(mcp.length, 1, "missing-or-duplicate-Guilduo-connection");
      assert.equal(mcp[0]!.toolsError, null, "native-tool-discovery-failed");
      assert.equal(mcp[0]!.runtimeStatus, "connected", "fresh-native-connection-required");
      assert.equal(mcp[0]!.authStatus, "oAuth", "native-Guilduo-OAuth-required");
      assertFreshGuilduoSchemas(mcp[0]!.tools);
      checks.freshSchemas = { status: "passed", source: "new_native_thread_after_mcp_reload", toolCount: Object.keys(mcp[0]!.tools).length };
      const result = await server.call("mcpServer/tool/call", { threadId: started.thread.id, server: mcp[0]!.name,
        tool: "get_current_agent_context", arguments: { actingAgentId: options.actingAgentId } }) as { isError?: boolean; structuredContent?: {agent?: {id?: unknown}} };
      assert.ok(result.isError !== true && result.structuredContent, "native-Agent-context-read-failed");
      assert.equal(result.structuredContent.agent?.id, options.actingAgentId, "native-Agent-selection-mismatch");
      checks.agentContextRead = { status: "passed", responseHash: createHash("sha256").update(JSON.stringify(result.structuredContent)).digest("hex") };
    }
    assert.deepEqual(bundled.map(hook => hook.eventName).sort(), ["interrupt", "sessionStart", "stop"], "unexpected-native-hook-events");
    if (options.trustUi) {
      // Inspect native login status only; never read/copy authentication stores or initiate login.
      const login = spawnSync(cli[0]!, [...cli.slice(1), "login", "status"], { cwd, env, encoding: "utf8",
        timeout: 10_000, maxBuffer: 64 * 1024, windowsHide: true });
      const chatgpt = login.status === 0 && /Logged in using ChatGPT/.test(login.stdout + login.stderr);
      checks.nativeTrustUi = { status: chatgpt ? "ready_for_manual_review" : "blocked_isolated_ChatGPT_login_required",
        isolatedChatGptLogin: chatgpt, persistedTrustChangedByDriver: false, modelTurnStarted: false };
      assert.ok(chatgpt, "isolated-ChatGPT-login-required-before-trust-ui");
      const child = spawn(cli[0]!, [...cli.slice(1), "--no-daemon", "--no-alt-screen", "-C", cwd,
        "-m", "gpt-6-astra", "-c", 'model_provider="openai"', "-c", "features.hooks=true", "-c", "features.plugins=true",
        "-c", "features.remote_plugin=false", "-c", "features.recommended_plugins=false",
        "-c", `plugins.\"${pluginId}\".mcp_servers.questforge.enabled=false`], { cwd, env, stdio: "inherit", windowsHide: true });
      await new Promise<void>(resolveChild => {
        const timer = setTimeout(() => { child.kill(); resolveChild(); }, 60_000);
        const done = () => { clearTimeout(timer); resolveChild(); };
        child.once("exit", done); child.once("error", done);
      });
      checks.nativeTrustUi = { status: "manual_UI_closed_not_an_acceptance_assertion", isolatedChatGptLogin: true,
        persistedTrustChangedByDriver: false, modelTurnStartedByDriver: false, manualUserActionsObserved: false };
    }
    evidence.status = "passed_bounded_checks";
  } catch (error) {
    evidence.status = "blocked";
    evidence.blocker = error instanceof assert.AssertionError ? String(error.message).split("\n")[0] : "native-check-failed";
  } finally {
    checks.nativeHookNotifications = server?.hookNotifications ?? [];
    checks.nativeEventCoverage = { sessionStart: server?.hookNotifications.some(item => item.eventName === "sessionStart")
      ? "notification_observed_stdin_not_available" : "not_observed_after_thread_start_without_model_turn",
      stop: "not_triggered_requires_a_real_turn", interrupt: "not_triggered_requires_an_active_turn",
      stdinPayloadObserved: false, nativeTrustExecutionAccepted: false };
    server?.close();
    await writeFile(join(run, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
  }
  return { run, profile, evidence };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { profile: { type: "string" }, live: { type: "boolean" },
    "acting-agent-id": { type: "string" }, "trust-ui": { type: "boolean" } } });
  void verifyGuilduoCodexHost(repositoryRoot, { profile: values.profile, live: values.live,
    actingAgentId: values["acting-agent-id"], trustUi: values["trust-ui"] }).then(result => {
    console.log(JSON.stringify(result));
    if (result.evidence.status === "blocked") process.exitCode = 1;
  }).catch(() => { console.error("Codex native acceptance: invalid profile or input."); process.exitCode = 1; });
}

// SPDX-License-Identifier: AGPL-3.0-only
// QA operator adapter for a pinned exported Codex-harness SDK. Not shipped.
// Caller must authorize the exact tool/arguments on stdin; no model is run.
import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const qa = await realpath(join(base, '.qa-artifacts'));
const root = await realpath(resolve(process.argv[2]));
assert.ok(root.startsWith(qa + sep), 'Only this package isolated QA homes are accepted');
const host = resolve(process.argv[3]);
const build = JSON.parse(await readFile(join(dirname(host), 'dist/build-info.json'), 'utf8'));
assert.equal(build.commit, 'bcfc88812a35243893585dbeca87ca41b48272ca');
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, env, {
  HOME: join(root, 'home'), USERPROFILE: join(root, 'home'), OPENCLAW_HOME: join(root, 'home'),
  OPENCLAW_STATE_DIR: join(root, 'state'), OPENCLAW_CONFIG_PATH: join(root, 'state/openclaw.json'),
  APPDATA: join(root, 'config'), LOCALAPPDATA: join(root, 'cache'),
  XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'), XDG_CACHE_HOME: join(root, 'cache'), XDG_STATE_HOME: join(root, 'state'),
  TEMP: join(root, 'tmp'), TMP: join(root, 'tmp'), TMPDIR: join(root, 'tmp'),
  OPENCLAW_NO_RESPAWN: '1', OPENCLAW_HIDE_BANNER: '1', OPENCLAW_SKIP_UPDATE_CHECK: '1',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(root, 'empty.gitconfig'),
});
if (process.argv[4]) {
  const certificate = await realpath(resolve(process.argv[4]));
  assert.ok(certificate.startsWith(root + sep), 'Trust certificate must belong to this QA home');
  process.env.NODE_EXTRA_CA_CERTS = certificate;
}
process.chdir(join(root, 'workspace'));
let input = '';
for await (const chunk of process.stdin) { input += chunk; assert.ok(input.length < 1048576); }
const { tool: name, args } = JSON.parse(input);
assert.match(name, /^guilduo__[A-Za-z0-9_-]+$/);
assert.ok(args && typeof args === 'object' && !Array.isArray(args));
const hostRequire = createRequire(join(dirname(host), 'package.json'));
const sdk = async name => import(pathToFileURL(hostRequire.resolve(`openclaw/plugin-sdk/${name}`)).href);
const { loadConfig } = await sdk('config-runtime');
const { materializeStaticMcpToolsForHarnessRun } = await sdk('codex-mcp-projection');
// The public harness helper requires its native lifecycle owner. These named
// shipped-module exports are pinned host internals, not stable package SDK APIs.
const { GatewayScheduler } = await import(pathToFileURL(join(dirname(host), 'dist/infra/gateway-scheduler.js')).href);
const { setSessionMcpRuntimeScheduler, disposeAllSessionMcpRuntimes } = await import(pathToFileURL(join(dirname(host), 'dist/agents/agent-bundle-mcp-manager-api.js')).href);
const scheduler = new GatewayScheduler();
await setSessionMcpRuntimeScheduler(scheduler);
const cfg = loadConfig();
let runtime;
try {
runtime = await materializeStaticMcpToolsForHarnessRun({
  cfg, agentId: 'main', sessionId: `guilduo-qa-${randomUUID()}`, sessionKey: 'agent:main:guilduo-qa-tools',
  workspaceDir: join(root, 'workspace'), agentDir: join(root, 'state/agents/main/agent'),
  toolsAllow: [name], retireSessionRuntimeAfterDispose: true,
  requestInteractiveCodexApproval: async request => {
    assert.equal(request.safeToolName, name, 'Only the explicitly requested tool is authorized');
    assert.ok(request.isActive());
  },
});
  const tool = runtime.tools.find(tool => tool.name === name);
  assert.ok(tool, 'Requested tool was not projected; inspect native MCP probe and policy');
  const result = await tool.execute(`guilduo-qa-${randomUUID()}`, args, AbortSignal.timeout(60000));
  process.stdout.write(JSON.stringify(result) + '\n');
} finally {
  try { await runtime?.dispose(); }
  finally { try { await disposeAllSessionMcpRuntimes(); } finally { await scheduler.stop(); } }
}

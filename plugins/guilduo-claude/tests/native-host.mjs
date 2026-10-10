// SPDX-License-Identifier: AGPL-3.0-only
// Native Claude Code plugin lifecycle in a fresh isolated profile. No sign-in, MCP tool call or inference;
// `claude mcp list` health-checks the public endpoint without credentials.
// Local (plugin loads in place from a copy of this checkout):  node plugins/guilduo-claude/tests/native-host.mjs
// Published branch (GitHub sparse clone into the plugin cache):  node plugins/guilduo-claude/tests/native-host.mjs ELRdn/Guilduo#<branch>
// GUILDUO_CLAUDE_EXECUTABLE overrides `claude`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const executable = process.env.GUILDUO_CLAUDE_EXECUTABLE || 'claude';
const id = 'guilduo@guilduo';
const remote = process.argv[2];
const sentinel = { name: 'guilduo-preservation-sentinel', type: 'http', url: 'http://127.0.0.1:1/guilduo-test-sentinel' };
const run = await mkdtemp(join(tmpdir(), 'guilduo-claude-host-'));
const home = join(run, 'home'), profile = join(run, 'profile'), cwd = join(run, 'workspace'), source = join(run, 'marketplace');
const env = { CLAUDE_CONFIG_DIR: profile, HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData', 'Roaming'), LOCALAPPDATA: join(home, 'AppData', 'Local'),
  TEMP: join(run, 'tmp'), TMP: join(run, 'tmp'), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1', NO_COLOR: '1' };
for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'CLAUDE_CODE_GIT_BASH_PATH']) if (process.env[key]) env[key] = process.env[key];

const allowed = [['--version'], ['mcp', 'add'], ['mcp', 'list'], ['plugin', 'marketplace'], ['plugin', 'list'], ['plugin', 'install'], ['plugin', 'details'], ['plugin', 'update'], ['plugin', 'disable'], ['plugin', 'enable'], ['plugin', 'uninstall']];
function cli(...args) {
  assert(allowed.some(prefix => prefix.every((part, index) => args[index] === part)), `Not an inference-free command: ${args.join(' ')}`);
  const result = spawnSync(executable, args, { cwd, env, encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
const json = async path => JSON.parse(await readFile(path, 'utf8'));
async function hashes(root) {
  const out = {};
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else out[relative(root, path).replaceAll('\\', '/')] = createHash('sha256').update(await readFile(path)).digest('hex');
    }
  }
  await visit(root);
  return JSON.stringify(Object.fromEntries(Object.entries(out).sort()));
}
const checks = [];
const check = (label, condition) => { assert(condition, label); checks.push(label); console.log(`ok - ${label}`); };
const entry = () => JSON.parse(cli('plugin', 'list', '--json')).find(item => item.id === id);

try {
  for (const path of [home, profile, cwd, env.APPDATA, env.LOCALAPPDATA, env.TEMP]) await mkdir(path, { recursive: true });
  console.log(`host ${cli('--version').trim()}`);
  check('fresh profile has no plugins', JSON.parse(cli('plugin', 'list', '--json')).length === 0);
  cli('mcp', 'add', '--transport', 'http', '--scope', 'user', sentinel.name, sentinel.url);
  await writeFile(join(profile, 'settings.json'), `${JSON.stringify({ guilduoSentinel: 'keep', ...await json(join(profile, 'settings.json')).catch(() => ({})) }, null, 2)}\n`);
  const userMcp = async () => JSON.stringify((await json(join(profile, '.claude.json'))).mcpServers?.[sentinel.name]);
  const before = await userMcp();
  check('sentinel user MCP is configured', before === JSON.stringify({ type: sentinel.type, url: sentinel.url }));
  const preserved = async stage => check(`unrelated MCP and settings survive ${stage}`,
    await userMcp() === before && (await json(join(profile, 'settings.json'))).guilduoSentinel === 'keep');

  const local = join(repo, 'plugins', 'guilduo-claude');
  const version = (await json(join(local, '.claude-plugin', 'plugin.json'))).version;
  if (remote) {
    cli('plugin', 'marketplace', 'add', remote, '--sparse', '.claude-plugin', 'plugins/guilduo-claude', '--scope', 'user');
  } else {
    await cp(join(repo, '.claude-plugin'), join(source, '.claude-plugin'), { recursive: true });
    await cp(local, join(source, 'plugins', 'guilduo-claude'), { recursive: true });
    cli('plugin', 'marketplace', 'add', source, '--scope', 'user');
  }
  cli('plugin', 'install', id, '--scope', 'user');
  let installed = entry();
  check(`install is enabled at ${version}`, installed?.enabled === true && installed.version === version);
  if (remote) {
    check('GitHub install is a cached copy outside the checkout', relative(repo, installed.installPath).startsWith('..') && relative(profile, installed.installPath).split(/[\/]/)[0] === 'plugins');
    check('installed files match this checkout byte for byte', await hashes(installed.installPath) === await hashes(local));
  }
  const details = cli('plugin', 'details', id);
  check('discovers exactly the guilduo-workflows Skill', /Skills \(1\)\s+guilduo-workflows(\s|$)/.test(details));
  check('discovers exactly the guilduo MCP server', /MCP servers \(1\)\s+guilduo\s/.test(details));
  check('declares no hooks, agents or commands', /Hooks \(0\)/.test(details) && !/Agents \([1-9]/.test(details) && !/Commands \([1-9]/.test(details));
  check('plugin MCP is listed without credentials', /plugin:guilduo:guilduo/.test(cli('mcp', 'list')));
  await preserved('install');

  cli('plugin', 'marketplace', 'update', 'guilduo');
  cli('plugin', 'update', id, '--scope', 'user');
  installed = entry();
  check('native update keeps the plugin enabled at the published version', installed?.enabled === true && installed.version === version);
  await preserved('update');

  cli('plugin', 'disable', id, '--scope', 'user');
  check('disable persists', entry()?.enabled === false);
  cli('plugin', 'enable', id, '--scope', 'user');
  check('enable persists', entry()?.enabled === true);
  cli('plugin', 'uninstall', id, '--scope', 'user');
  check('uninstall removes the plugin', entry() === undefined);
  cli('plugin', 'marketplace', 'remove', 'guilduo');
  check('marketplace removal persists', JSON.parse(cli('plugin', 'marketplace', 'list', '--json')).length === 0);
  await preserved('uninstall and marketplace removal');
  console.log(`pass (${checks.length} checks)`);
} finally {
  await rm(run, { recursive: true, force: true }).catch(() => {});
}

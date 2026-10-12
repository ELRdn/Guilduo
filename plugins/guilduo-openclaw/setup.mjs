// SPDX-License-Identifier: AGPL-3.0-only
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const endpoint = 'https://mcp.guilduo.com/mcp';

export function planSetup(servers) {
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) throw new Error('Invalid native MCP config; no changes made.');
  const aliases = Object.entries(servers).filter(([, server]) => server?.url === endpoint);
  if (Object.hasOwn(servers, 'guilduo')) {
    const server = servers.guilduo;
    if (server?.url !== endpoint) throw new Error('The guilduo name is occupied; resolve it in Settings → MCP. No changes made.');
    return { name: 'guilduo', add: false, ready: isReady(server), accounts: isReady(server) };
  }
  if (aliases.length) return { name: aliases[0][0], add: false, ready: isReady(aliases[0][1]), accounts: false };
  return { name: 'guilduo', add: true, ready: true, accounts: true };
}

function isReady(server) {
  return server.enabled !== false && server.transport === 'streamable-http' && server.auth === 'oauth'
    && server.command === undefined && server.oauth?.identity !== 'per-requester' && !server.oauth?.authProfileId;
}

export function setup(run) {
  let servers;
  const output = run(['mcp', 'show', '--json']);
  try { servers = JSON.parse(output); }
  catch { throw new Error('Invalid native MCP config output; no changes made.'); }
  const plan = planSetup(servers);
  if (plan.add) run(['mcp', 'add', plan.name, '--url', endpoint, '--transport', 'streamable-http', '--auth', 'oauth', '--no-probe']);
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const entry = process.argv[2];
    if (process.argv.length > 3) throw new Error('Usage: node setup.mjs [absolute-path-to-openclaw.mjs]. Uses the host-selected profile.');
    if (entry && !/^(?:[A-Za-z]:[\\/]|\/)/.test(entry)) throw new Error('Optional OpenClaw entry must be an absolute path.');
    const plan = setup(args => {
      // PATH mode receives only fixed arguments; no config-derived name enters a shell.
      const result = spawnSync(entry ? process.execPath : 'openclaw', entry ? [entry, ...args] : args, {
        shell: !entry && process.platform === 'win32', encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024,
      });
      // Native output can contain existing sensitive config. Never echo it on failure.
      if (result.error || result.status !== 0) throw new Error('Native OpenClaw command failed; inspect it directly. No config replacement attempted.');
      return result.stdout;
    });
    console.log(`${plan.add ? 'Added' : 'Preserved existing'} MCP entry. ${plan.ready ? 'Use Settings → MCP → Sign in.' : 'Review enablement, transport and OAuth in Settings → MCP; existing settings were preserved.'}`);
    if (!plan.accounts) console.log('The plugin Accounts section requires the exact guilduo name and URL with shared native OAuth; your existing alias/settings were preserved.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

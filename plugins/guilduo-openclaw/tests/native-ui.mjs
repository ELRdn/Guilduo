// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startOAuthFixture } from './oauth-fixture.mjs';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const host = resolve(process.argv[2]);
const build = JSON.parse(await readFile(join(dirname(host), 'dist/build-info.json'), 'utf8'));
assert.equal(build.commit, 'bcfc88812a35243893585dbeca87ca41b48272ca');
const qa = join(base, '.qa-artifacts');
assert.ok((await realpath(qa)).startsWith((await realpath(base)) + sep));
const root = await mkdtemp(join(qa, 'browser-'));
for (const name of ['home', 'state', 'tmp', 'cache', 'config', 'data', 'workspace']) await mkdir(join(root, name));
const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, {
  HOME: join(root, 'home'), USERPROFILE: join(root, 'home'), OPENCLAW_HOME: join(root, 'home'),
  OPENCLAW_STATE_DIR: join(root, 'state'), OPENCLAW_CONFIG_PATH: join(root, 'state/openclaw.json'),
  APPDATA: join(root, 'config'), LOCALAPPDATA: join(root, 'cache'),
  XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'), XDG_CACHE_HOME: join(root, 'cache'), XDG_STATE_HOME: join(root, 'state'),
  TEMP: join(root, 'tmp'), TMP: join(root, 'tmp'), TMPDIR: join(root, 'tmp'),
  OPENCLAW_NO_RESPAWN: '1', OPENCLAW_HIDE_BANNER: '1', OPENCLAW_SKIP_UPDATE_CHECK: '1',
  npm_config_cache: join(root, 'cache/npm'), npm_config_userconfig: join(root, 'empty.npmrc'), npm_config_globalconfig: join(root, 'empty-global.npmrc'),
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(root, 'empty.gitconfig'),
});
for (const name of ['npm_config_userconfig', 'npm_config_globalconfig', 'GIT_CONFIG_GLOBAL']) await writeFile(env[name], '');
async function run(args) {
  const child = spawn(process.execPath, [host, ...args], { env, cwd: join(root, 'workspace'), stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', () => {});
  const timer = setTimeout(() => child.kill(), 90000);
  const status = await new Promise((res, rej) => { child.once('error', rej); child.once('close', res); }).finally(() => clearTimeout(timer));
  assert.equal(status, 0, `${args[0]} ${args[1]} failed; output is not logged`);
  return stdout;
}
const socket = createServer();
await new Promise(res => socket.listen(0, '127.0.0.1', res));
const port = socket.address().port;
await new Promise(res => socket.close(res));
// The native browser carrier requires HTTPS. Keep the ephemeral private key in
// memory; only the public certificate enters this isolated QA home.
const certificateChild = spawn('C:/Users/hiron/anaconda3/Library/bin/openssl.exe', [
  'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', '-', '-out', '-',
  '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-days', '1',
], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let certificateOutput = '';
certificateChild.stdout.on('data', data => { certificateOutput += data; });
certificateChild.stderr.on('data', () => {});
assert.equal(await new Promise((res, rej) => { certificateChild.once('error', rej); certificateChild.once('close', res); }), 0, 'ephemeral certificate creation failed');
const key = certificateOutput.match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/)[0];
const cert = certificateOutput.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)[0];
certificateOutput = '';
const certificateFile = join(root, 'fixture-public-cert.pem');
await writeFile(certificateFile, cert);
env.NODE_EXTRA_CA_CERTS = certificateFile;
const fixture = await startOAuthFixture({ tls: { key, cert } });
let gateway, browser, page;
const checks = [];
let gatewayOutput = '';
try {
  await writeFile(env.OPENCLAW_CONFIG_PATH, JSON.stringify({
    gateway: { mode: 'local', bind: 'loopback', port, auth: { mode: 'none' } },
    logging: { level: 'silent', consoleLevel: 'silent', file: join(root, 'gateway.log') },
    agents: { defaults: { workspace: join(root, 'workspace'), model: { primary: 'opencode-go/deepseek-v4.1-flash' } } },
    mcp: { servers: { guilduo: { url: `${fixture.origin}/mcp`, transport: 'streamable-http', auth: 'oauth' } } },
  }));
  await run(['plugins', 'install', join(qa, 'guilduo-openclaw-plugin-0.6.0-beta.16.tgz'), '--force', '--accept-capabilities']);
  const manifestFile = join(root, 'state/extensions/guilduo/openclaw.plugin.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  manifest.mcpServers.guilduo.url = `${fixture.origin}/mcp`;
  await writeFile(manifestFile, JSON.stringify(manifest));
  gateway = spawn(process.execPath, [host, 'gateway', 'run', '--port', String(port), '--bind', 'loopback', '--auth', 'none'], {
    env, cwd: join(root, 'workspace'), stdio: ['ignore', 'pipe', 'pipe'],
  });
  gateway.stdout.on('data', data => { gatewayOutput += data; }); gateway.stderr.on('data', data => { gatewayOutput += data; });
  const origin = `http://localhost:${port}`;
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (gateway.exitCode !== null) throw new Error(`Isolated Gateway exited ${gateway.exitCode}: ${gatewayOutput.slice(0, 1200)}`);
    try { ready = (await fetch(origin)).ok; } catch {}
    if (ready) break;
    await new Promise(res => setTimeout(res, 1000));
  }
  assert.ok(ready, 'Gateway did not serve Control UI');
  checks.push('gateway-control-ui-served');
  console.log('PASS isolated Gateway serves Control UI');
  const { chromium } = createRequire(join(base, '../../package.json'))('playwright-core');
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, env });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'en-US' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort();
  });
  page = await context.newPage();
  await page.goto(`${origin}/settings/plugins`);
  await page.getByText('Guilduo', { exact: true }).first().waitFor({ timeout: 60000 });
  await page.getByText('Guilduo', { exact: true }).first().click();
  await page.getByText(/^(Accounts|アカウント)$/).first().waitFor({ timeout: 30000 });
  await page.screenshot({ path: join(root, 'accounts-before.png'), fullPage: true });
  checks.push('accounts-rendered');
  console.log('PASS native Accounts renders');
  const popup = page.waitForEvent('popup', { timeout: 60000 }).catch(error => ({ error }));
  await page.locator('button').filter({ hasText: /^\s*(Connect|接続)\s*$/ }).click();
  const signIn = await popup;
  if (signIn.error) throw signIn.error;
  await signIn.waitForURL(url => url.hostname === 'localhost' || url.hostname === '127.0.0.1', { timeout: 30000 });
  await page.getByText(/^(Connected|接続済み)$/).last().waitFor({ timeout: 60000 });
  assert.ok(fixture.pkceVerified());
  checks.push('accounts-connect-browser-oauth-pkce');
  await page.screenshot({ path: join(root, 'accounts-connected.png'), fullPage: true });
  await page.locator('button').filter({ hasText: /^\s*(Edit|編集)\s*$/ }).last().click();
  await page.waitForURL('**/settings/mcp');
  checks.push('accounts-edit-opens-mcp-settings');
  await page.screenshot({ path: join(root, 'mcp-settings.png'), fullPage: true });
  await run(['mcp', 'doctor', 'guilduo', '--probe', '--json']);
  assert.ok(fixture.probed()); checks.push('native-probe');
  const httpInvoke = await fetch(`${origin}/tools/invoke`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool: 'guilduo__read_fixture', args: {}, sessionKey: 'main' }),
  });
  checks.push(`gateway-http-configured-mcp-status-${httpInvoke.status}`);
  const invoke = spawn(process.execPath, [join(base, 'tests/native-invoke.mjs'), root, host, certificateFile], {
    env, cwd: join(root, 'workspace'), stdio: ['pipe', 'pipe', 'pipe'],
  });
  let invokeOutput = '';
  invoke.stdout.on('data', data => { invokeOutput += data; }); invoke.stderr.on('data', () => {});
  invoke.stdin.end(JSON.stringify({ tool: 'guilduo__read_fixture', args: {} }));
  const invokeTimer = setTimeout(() => invoke.kill(), 120000);
  const invokeStatus = await new Promise((res, rej) => { invoke.once('error', rej); invoke.once('close', res); }).finally(() => clearTimeout(invokeTimer));
  assert.equal(invokeStatus, 0, 'exported Codex harness SDK invoke failed; output is not logged');
  assert.ok(invokeOutput.includes('synthetic fixture read accepted'));
  assert.ok(fixture.invoked()); checks.push('exported-harness-sdk-stored-oauth-tool-execution');
  await run(['mcp', 'logout', 'guilduo']);
  checks.push('native-logout');
} catch (error) {
  if (page) {
    await page.screenshot({ path: join(root, 'failure.png'), fullPage: true }).catch(() => {});
    await writeFile(join(root, 'failure-text.txt'), await page.locator('body').innerText().catch(() => ''));
  }
  await writeFile(join(root, 'receipt.json'), JSON.stringify({ host: build, checks, result: 'failed', error: error.message, publicOAuth: 'unverified', modelRequests: 0 }, null, 2));
  throw error;
} finally {
  await browser?.close();
  if (gateway && gateway.exitCode === null) { gateway.kill(); await new Promise(res => gateway.once('close', res)); }
  await fixture.close();
}
await writeFile(join(root, 'receipt.json'), JSON.stringify({ host: build, checks, result: 'passed', publicOAuth: 'unverified', modelRequests: 0 }, null, 2));
console.log(`Native browser receipt: ${join(root, 'receipt.json')}`);

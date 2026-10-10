// SPDX-License-Identifier: AGPL-3.0-only
// Real browser + installed shell singletons/slot renderer + native carrier; synthetic owners/OAuth only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire, registerHooks } from 'node:module';
import { request } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

assert.ok(process.argv[2], 'Supply installed DSH lib/bin.js; no DSH profile is booted');
globalThis.fetch = () => { throw new Error('Node network fetch forbidden; OAuth/MCP are synthetic'); };
const hostRequire = createRequire(resolve(process.argv[2]));
const host = hostRequire('@deepseek-ai/dsh/package.json');
assert.equal(host.version, '0.2.0-rc.2');
const directory = fileURLToPath(new URL('../', import.meta.url));
const rootRequire = createRequire(new URL('../../../package.json', import.meta.url));
const { chromium } = rootRequire('playwright-core');
const candidate = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
assert.equal(candidate.version, '0.6.0-beta.17');
const load = name => import(pathToFileURL(hostRequire.resolve(`@deepseek-ai/${name}`)).href);
const publicPackages = join(dirname(dirname(resolve(process.argv[2]))), 'node_modules/@deepseek-ai');
const assets = join(publicPackages, 'dsh-web-frontend/dist/assets');
const hashes = {};
async function bytes(path, label) {
  const value = await readFile(path);
  hashes[label] = createHash('sha256').update(value).digest('hex');
  return value.toString('utf8');
}
let shell;
for (const file of (await readdir(assets)).filter(name => /^index-.*\.js$/.test(name))) {
  const source = await readFile(join(assets, file), 'utf8');
  const seed = /function ([\w$]+)\(\)\{return\{react:[^}]+\}\}/.exec(source);
  if (seed) { assert.equal(shell, undefined); shell = { file, source, seed }; }
}
assert.ok(shell, 'Installed frontend must expose the investigated singleton seed');
await bytes(join(assets, shell.file), 'installed/shell');
// ponytail: the pinned seed extraction needs updating if a future DSH changes its shell output.
const seedBuild = await build({ stdin: {
  contents: shell.source.slice(0, shell.seed.index + shell.seed[0].length) + `;globalThis.nativeSeed=${shell.seed[1]}();`,
  resolveDir: assets, sourcefile: shell.file,
}, bundle: true, write: false, treeShaking: true, platform: 'browser', format: 'iife', target: 'es2022', logLevel: 'silent' });
const scripts = new Map([
  ['/seed.js', seedBuild.outputFiles[0].text],
  ['/renderer.js', await bytes(join(publicPackages, 'dsh-client-ui-renderer/lib/client.js'), 'installed/renderer')],
  ['/candidate.js', await bytes(join(directory, 'lib/client.js'), 'candidate/client')],
]);
const styles = (await readdir(assets)).filter(name => /^(index|vendor)-.*\.css$/.test(name));
for (const file of styles) scripts.set(`/assets/${file}`, await bytes(join(assets, file), `installed/${file}`));
await bytes(join(directory, 'lib/index.js'), 'candidate/host');
await bytes(join(directory, 'lib/settings.js'), 'candidate/settings');
await bytes(join(directory, 'lib/settings-gateway.js'), 'candidate/gateway');
await bytes(join(directory, 'lib/persistence.js'), 'candidate/persistence');

const hooks = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.startsWith(new URL('../lib/', import.meta.url).href) && specifier.startsWith('@deepseek-ai/')) {
    return { url: pathToFileURL(hostRequire.resolve(specifier)).href, shortCircuit: true };
  }
  return next(specifier, context);
} });
let createHostControl, installSettingsGateway, candidateInject, createGrantStore;
try {
  ({ createHostControl, inject: candidateInject } = await import('../lib/index.js'));
  ({ installSettingsGateway } = await import('../lib/settings-gateway.js'));
  ({ createGrantStore } = await import('../lib/persistence.js'));
} finally { hooks.deregister(); }
const { Context, Service } = await load('cordis');
const { WebServer } = await load('dsh-host-webserver');
const Connection = await load('dsh-client-connection');
const { TypertRegistry } = await load('dsh-typert-registry');
const { TypertGatewayService } = await load('dsh-api-gateway');
const ctx = new Context();
const mounted = [];
const handles = [];
let agent, fork;
const calls = [];
let redirect, browser, browserContext, control, modelCalls = 0;
const artifacts = resolve(directory, '../../.qa-artifacts/guilduo-dsh-shared-beta14');
const runId = new Date().toISOString().replaceAll(':', '-');
const failures = [];
const check = (label, operation) => {
  try { operation(); } catch (error) { failures.push({ label, error: error.stack }); }
};
class MemoryCredentials extends Service {
  records = new Map();
  constructor(ctx) { super(ctx, 'credentials'); }
  async readRecord(key) { return this.records.get(key); }
  async modifyRecord(key, modify) { const next = await modify(this.records.get(key)); if (next) this.records.set(key, next); return this.records.get(key); }
  async deleteRecord(key) { this.records.delete(key); }
}
const dependencies = {
  async authorize(provider, options) {
    if (options.authorizationCode) {
      assert.equal(options.authorizationCode, 'SYNTHETIC_RENDER_CODE');
      await provider.saveTokens({ access_token: 'SYNTHETIC_RENDER_TOKEN', token_type: 'Bearer' });
      return 'AUTHORIZED';
    }
    redirect = new URL(String(provider.redirectUrl));
    await provider.saveCodeVerifier('SYNTHETIC_RENDER_PKCE');
    const url = new URL('https://mcp.guilduo.com/oauth/authorize');
    url.searchParams.set('state', await provider.state());
    await provider.redirectToAuthorization(url);
    return 'REDIRECT';
  },
  client: () => ({ async connect() {}, async close() {}, async listTools() {
    return { tools: [{ name: 'get_agent_context', inputSchema: { type: 'object' } }] };
  }, async callTool() { throw new Error('This UI probe must never run a tool or model'); } }),
  transport: () => ({ async start() {}, async send() {}, async close() {} }),
};

function bootstrap() {
  const seed = window.nativeSeed;
  if (seed.react.version !== '18.3.1') throw new Error('Unexpected shell React');
  const factories = new Map();
  // Delivery/materialization was checked separately; this fixture binds the unmodified native facades.
  window.__ModuleLoader__ = { load: row => factories.set(row.id, row.factory) };
  window.materialize = id => {
    if (!(id in seed)) {
      if (!factories.has(id)) throw new Error(`Missing native facade: ${id}`);
      seed[id] = factories.get(id)(window.materialize);
    }
    return seed[id];
  };
}
async function mount() {
  const seed = window.nativeSeed;
  const ctx = new seed['@deepseek-ai/cordis'].Context();
  const selection = seed['@deepseek-ai/dsh-client-store'].createSnapshotStore({ key: undefined });
  const generation = seed['@deepseek-ai/dsh-client-store'].createSnapshotStore({ id: 1 });
  const wireFetch = window.fetch.bind(window);
  const rpc = { async call(channel, endpoint, payload, signal) {
    if (channel !== '/api' || !/^guilduo\/(status|connect|disconnect|cancel|share)$/.test(endpoint)) throw new Error('Unexpected RPC');
    const response = await wireFetch(`${channel}/${endpoint}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal,
      body: JSON.stringify({ type: 'client-request', rpcId: 'render-fixture', method: endpoint, payload }),
    });
    if (!response.ok) throw new Error('Native carrier rejected request');
    return (await response.json()).result;
  } };
  ctx.provide('connection', { rpc, isLoopback: true, generation });
  ctx.provide('uiSession', { adapter: { current: selection } });
  window.ui = { ctx, selection, generation, rpc };
  await ctx.plugin(window.materialize('@deepseek-ai/dsh-client-ui-renderer'));
  ctx.slots.installScope('session', { current: selection });
  // Minimal owner for the real settings.section slot, without the rest of the DSH application.
  ctx.slots.register({ name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' } } },
    props => props.renderSlot('settings.section', { close() {} }, { only: 'guilduo' }));
  const plugin = await ctx.plugin(window.materialize('@guilduo/dsh-oauth-poc'));
  window.ui.plugin = plugin;
  window.ui.showSettings = () => { window.ui.unmount = ctx.uiRenderer.mount(document.getElementById('root')); };
}

const deadline = setTimeout(() => {
  process.stderr.write('Isolated UI probe exceeded 60 seconds.\n');
  process.exitCode = 1;
  void browser?.close();
}, 60_000);
const pageErrors = [], blocked = [];
try {
  mounted.push(await ctx.plugin(MemoryCredentials));
  mounted.push(await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 }));
  mounted.push(await ctx.plugin(Connection));
  for (const name of ['dsh-agent', 'dsh-session', 'dsh-session-projection', 'dsh-system-prompt', 'dsh-tools', 'dsh-llm']) {
    mounted.push(await ctx.plugin((await load(name)).default));
  }
  for (const method of ['stream', 'prepareCall']) ctx.llm[method] = () => {
    modelCalls++; throw new Error('Inference forbidden in native browser fixture');
  };
  mounted.push(await ctx.plugin((await load('dsh-agent-loop')).default, { agents: [] }));
  for (const [id, options] of [
    ['synthetic-render-main', {}],
    ['synthetic-render-root-fork', { seed: [], inheritedEventCount: 0,
      meta: { parentSession: 'synthetic-render-main', isSeeded: true } }],
  ]) handles.push(await ctx.agents.create({ sessionId: id, ...options }));
  [agent, fork] = handles.map(handle => handle.agent);
  assert.ok(ctx.agents.roots().includes(fork));
  assert.equal(ctx.sessions.get(fork.id), fork.session);
  mounted.push(await ctx.plugin({ inject: ['agents'], apply(host) {
    host.provide('sessionController', { async resolveAgent(id) {
      const owner = host.agents.get(id); return owner ? { agent: owner } : { error: 'unavailable' };
    } });
    host.provide('skills', {});
  } }));
  mounted.push(await ctx.plugin({ inject: candidateInject, apply(host) { control = createHostControl(host, dependencies); } }));
  mounted.push(await ctx.plugin(TypertRegistry));
  mounted.push(await ctx.plugin(TypertGatewayService));
  mounted.push(await installSettingsGateway(ctx, control));
  // A protected legacy grant exercises operator Share; no fixture token goes to the browser.
  await createGrantStore(ctx.credentials, agent.id, agent.session.header.createdAt, () => true)
    .save({ tokens: { access_token: 'SYNTHETIC_RENDER_LEGACY', token_type: 'Bearer' } });
  scripts.set('/bootstrap.js', `(${bootstrap})();`);
  scripts.set('/mount.js', `(${mount})();`);
  ctx.webServer.register({ kind: 'exact', path: '/', handler(req, res) {
    if (!ctx.connection.authorizeIndex(req, res)) return;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Isolated DSH Guilduo Settings</title>${styles.map(file => `<link rel="stylesheet" href="/assets/${file}">`).join('')}</head><body><div id="root"></div><script src="/seed.js"></script><script src="/bootstrap.js"></script><script src="/renderer.js"></script><script src="/candidate.js"></script><script src="/mount.js"></script></body></html>`);
  } });
  for (const [path, text] of scripts) ctx.webServer.register({ kind: 'exact', path, handler(_req, res) {
    res.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(text);
  } });
  const origin = `http://127.0.0.1:${ctx.webServer.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true, timeout: 15_000 });
  browserContext = await browser.newContext({ viewport: { width: 1000, height: 760 }, serviceWorkers: 'block' });
  browserContext.setDefaultTimeout(8000);
  await browserContext.addInitScript(() => {
    const forbidden = () => { throw new Error('Profile persistence forbidden in this fixture'); };
    for (const key of ['localStorage', 'sessionStorage', 'indexedDB']) Object.defineProperty(window, key, { get: forbidden });
    window.WebSocket = class { constructor() { forbidden(); } };
  });
  await browserContext.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) {
      if (url.pathname.startsWith('/api/')) calls.push(JSON.parse(route.request().postData()).method);
      return route.continue();
    }
    if (url.origin === 'https://mcp.guilduo.com' && url.pathname === '/oauth/authorize') {
      assert.ok(redirect, 'Consent cannot precede explicit Connect');
      const callback = new URL(redirect);
      callback.searchParams.set('state', url.searchParams.get('state'));
      callback.searchParams.set('code', 'SYNTHETIC_RENDER_CODE');
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body:
        `<title>Synthetic consent only</title><a href="${callback.href.replaceAll('&', '&amp;')}">Accept synthetic consent</a>` });
    }
    if (redirect && url.origin === redirect.origin && url.pathname === redirect.pathname) return route.continue();
    blocked.push(`${url.origin}${url.pathname}`);
    return route.abort('blockedbyclient');
  });
  const page = await browserContext.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
  page.setDefaultTimeout(8000);
  await page.goto(ctx.connection.authenticatedUrl(`${origin}/`));
  await page.waitForFunction(() => !!window.ui?.showSettings);
  assert.equal(await page.locator('section').count(), 0);
  assert.equal(calls.length, 0, 'Empty selection must make no RPC even without Settings');
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/guilduo/status')),
    page.evaluate(id => window.ui.selection.set({ key: id }), agent.id),
  ]);
  assert.ok(calls.includes('guilduo/status'), 'Auto status starts without rendering Settings');
  assert.equal(await page.locator('section').count(), 0);
  assert.equal(control.status(agent.id).connected, true);
  assert.equal(control.status(agent.id).scope, 'session');
  await page.evaluate(() => { window.ui.selection.set({ key: undefined }); window.ui.showSettings(); });
  const section = page.getByRole('region', { name: 'Guilduo', exact: true });
  await section.waitFor();
  const connect = section.getByRole('button', { name: '接続', exact: true });
  const disconnect = section.getByRole('button', { name: '切断', exact: true });
  assert.equal(await connect.isDisabled(), true);
  assert.match(await section.innerText(), /会話を開いてから/);
  const emptyCalls = calls.length;
  await page.evaluate(() => window.ui.selection.set({ key: undefined }));
  assert.equal(calls.length, emptyCalls, 'Empty selection must make no RPC');
  await page.evaluate(id => window.ui.selection.set({ key: id }), agent.id);
  const share = section.getByRole('button', { name: '全会話で使う', exact: true });
  await share.waitFor();
  assert.match(await section.innerText(), /この会話のみ（旧接続）/);
  assert.equal(await share.isDisabled(), false);
  await share.click();
  await page.waitForFunction(() => document.querySelector('section').textContent.includes('接続範囲: 全会話で共有'));
  assert.equal(await share.count(), 0);
  assert.equal(await connect.isDisabled(), true);
  await disconnect.click();
  await page.waitForFunction(() => document.querySelector('[role=status]').textContent === '未接続');
  assert.equal(await disconnect.isDisabled(), true);
  await connect.click();
  const link = section.getByRole('link', { name: 'ブラウザーで認証' });
  await link.waitFor();
  assert.equal(await link.getAttribute('target'), '_blank');
  assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(await connect.isDisabled(), true);
  const popupReady = browserContext.waitForEvent('page');
  await link.click();
  const popup = await popupReady;
  popup.on('pageerror', error => pageErrors.push(error.message));
  popup.setDefaultTimeout(8000);
  await popup.getByRole('link', { name: 'Accept synthetic consent' }).click();
  await popup.waitForURL(url => url.origin === redirect.origin && url.pathname === '/callback' && !url.search);
  await page.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('接続済み'));
  assert.match(await section.innerText(), /ツール 1 件/);
  assert.equal(await link.count(), 0);
  assert.equal(await disconnect.isDisabled(), false);
  assert.equal(await popup.evaluate(() => window.opener), null);
  assert.match(await section.innerText(), /接続範囲: 全会話で共有（通常の会話・フォーク）/);
  await mkdir(artifacts, { recursive: true });
  const screenshot = resolve(artifacts, `native-ui-render-${runId}-shared.png`);
  await page.screenshot({ path: screenshot });
  const buttons = await section.getByRole('button').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect(); return { height: rect.height, width: rect.width };
  }));
  assert.ok(buttons.every(rect => rect.height >= 44 && rect.width > 0));
  assert.equal(await page.locator('[data-slot-error]').count(), 0);
  const disconnects = () => calls.filter(method => method === 'guilduo/disconnect').length;
  const establishedDisconnects = disconnects();
  await page.evaluate(() => window.ui.unmount());
  await page.waitForFunction(() => document.querySelectorAll('section').length === 0);
  assert.equal(disconnects(), establishedDisconnects, 'Closing connected Settings must not disconnect shared OAuth');
  assert.equal(control.status(agent.id).connected, true);
  await page.evaluate(id => window.ui.selection.set({ key: id }), fork.id);
  await control.restore(fork.id, fork);
  assert.equal(control.status(fork.id).connected, true);
  await page.evaluate(() => window.ui.showSettings());
  await page.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('接続済み'));
  assert.match(await section.innerText(), /全会話で共有/);
  assert.equal(await connect.isDisabled(), true);
  assert.equal(disconnects(), establishedDisconnects, 'Switching registered roots must not disconnect sharing');
  await page.evaluate(() => window.ui.selection.set({ key: 'synthetic-render-invalid-owner' }));
  await page.waitForFunction(() => document.querySelector('[role=status]').textContent === '失敗');
  assert.equal(await link.count(), 0);
  await connect.click();
  await page.waitForFunction(() => !document.querySelector('section button').disabled);
  await section.getByRole('alert').waitFor();
  assert.match(await section.getByRole('alert').innerText(), /もう一度お試しください/);
  assert.equal(await link.count(), 0);
  assert.equal(control.status(agent.id).connected, true, 'invalid-owner cannot disconnect the shared owner');
  await page.evaluate(id => window.ui.selection.set({ key: id }), agent.id);
  await page.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('接続済み'));
  await disconnect.click();
  await page.waitForFunction(() => document.querySelector('[role=status]').textContent === '未接続');
  assert.equal(await connect.isDisabled(), false);
  assert.equal(await disconnect.isDisabled(), true);
  // Switching a pending login cancels its callback without global disconnect.
  await connect.click(); await link.waitFor();
  const switchedCallback = redirect.href;
  const cancellation = calls.filter(method => method === 'guilduo/cancel').length;
  const beforeSwitch = disconnects();
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith('/api/guilduo/status')),
    page.waitForResponse(response => response.url().endsWith('/api/guilduo/cancel')),
    page.evaluate(id => window.ui.selection.set({ key: id }), fork.id),
  ]);
  await page.waitForFunction(() => !document.querySelector('[role=status]').textContent.includes('確認中'));
  const switchedStatus = await section.getByRole('status').innerText();
  check('Disconnected registered root fork is available', () => assert.equal(switchedStatus, '未接続'));
  assert.ok(calls.filter(method => method === 'guilduo/cancel').length > cancellation);
  assert.equal(disconnects(), beforeSwitch);
  const callbackClosed = url => new Promise((done, reject) => {
    const req = request(url, { agent: false }, res => { res.resume(); done(res.statusCode); });
    req.on('error', reject); req.setTimeout(2000, () => req.destroy(new Error('Callback cleanup timeout'))); req.end();
  });
  await assert.rejects(callbackClosed(switchedCallback), { code: 'ECONNREFUSED' });
  // Closing only the rendered section must exercise the real effect cleanup.
  await connect.click(); await link.waitFor();
  const pendingCallback = redirect.href;
  const beforeUnmount = calls.filter(method => method === 'guilduo/cancel').length;
  const cancelResponse = page.waitForResponse(response => response.url().endsWith('/api/guilduo/cancel'));
  await page.evaluate(() => window.ui.unmount());
  await cancelResponse;
  await page.waitForFunction(() => document.querySelectorAll('section').length === 0);
  await assert.rejects(callbackClosed(pendingCallback), { code: 'ECONNREFUSED' });
  assert.ok(calls.filter(method => method === 'guilduo/cancel').length > beforeUnmount);
  assert.equal(disconnects(), beforeSwitch);
  // A registered native top-level fork can also be the first shared-login owner.
  await page.evaluate(() => window.ui.showSettings());
  await page.waitForFunction(() => !!document.querySelector('[role=status]') && !document.querySelector('[role=status]').textContent.includes('確認中'));
  const remountedStatus = await section.getByRole('status').innerText();
  check('Cancelled registered root fork is available', () => assert.equal(remountedStatus, '未接続'));
  await connect.click(); await link.waitFor();
  const forkPopupReady = browserContext.waitForEvent('page');
  await link.click();
  const forkPopup = await forkPopupReady;
  forkPopup.on('pageerror', error => pageErrors.push(error.message));
  await forkPopup.getByRole('link', { name: 'Accept synthetic consent' }).click();
  await forkPopup.waitForURL(url => url.origin === redirect.origin && url.pathname === '/callback' && !url.search);
  await page.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('接続済み'));
  assert.match(await section.innerText(), /全会話で共有/);
  await page.evaluate(id => window.ui.selection.set({ key: id }), agent.id);
  await page.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('接続済み'));
  const beforeDispose = disconnects();
  await page.evaluate(async () => { window.ui.unmount(); await window.ui.plugin.dispose(); await window.ui.ctx.fiber.dispose(); });
  assert.equal(disconnects(), beforeDispose);
  assert.equal(control.status(agent.id).connected, true);
  assert.equal(control.status(fork.id).connected, true);
  assert.equal(calls.filter(method => method === 'guilduo/connect').length, 5);
  assert.equal(calls.filter(method => method === 'guilduo/share').length, 1);
  assert.equal(disconnects(), 2);
  assert.equal(modelCalls, 0);
  assert.deepEqual(pageErrors, []);
  assert.ok(blocked.every(url => /\.(woff2?|ttf)$/.test(url) || url.endsWith('/favicon.ico')), `Unexpected network: ${blocked.join(', ')}`);
  for (const [file, label] of [['client.js', 'client'], ['index.js', 'host'], ['settings.js', 'settings'],
    ['settings-gateway.js', 'gateway'], ['persistence.js', 'persistence']]) {
    assert.equal(createHash('sha256').update(await readFile(join(directory, 'lib', file))).digest('hex'), hashes[`candidate/${label}`],
      'Parent changed built lib during this run; rerun against the completed build');
  }
  await bytes(fileURLToPath(import.meta.url), 'tests/native-ui-render');
  const result = { result: failures.length ? 'FAIL_NATIVE_UI_RENDER' : 'PASS_NATIVE_UI_RENDER', failures,
    dsh: host.version, candidate: candidate.version,
    browser: browser.version(), shellReact: '18.3.1', nativeSlotRenderer: true, nativeCarrier: true, scopedCordisServices: true,
    autoStatusWithoutSettings: true, emptySessionNoRpc: true, clickedSyntheticConsentAndCallback: true, disconnect: true,
    legacyOperatorShare: true, registeredNativeRootForkAccepted: true, initialLoginOwners: [agent.id, fork.id],
    invalidOwnerDenied: true, failedConnectRendersSafeAlert: true,
    switchAndUnmountCancelPending: true, unmountPreservesSharedConnection: true, callbackCleanupRequires: 'ECONNREFUSED', calls,
    shellSettingsOwner: 'synthetic minimal settings.section owner',
    pageErrors, blocked, hashes, screenshot, realProfileAccess: false, publicOAuth: false, modelCalls };
  const report = resolve(artifacts, `native-ui-render-${runId}.json`);
  await writeFile(report, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ ...result, report }, null, 2));
  assert.equal(failures.length, 0, 'Native fork status must satisfy the contract; see report for failures');
} catch (error) {
  process.stderr.write(`${JSON.stringify({ pageErrors, blocked })}\n`);
  throw error;
} finally {
  clearTimeout(deadline);
  try { await browserContext?.close(); } finally {
    try { await browser?.close(); } finally {
      for (const handle of handles.reverse()) await handle.dispose();
      for (const fiber of mounted.reverse()) await fiber.dispose();
      await control?.dispose();
      await ctx.fiber.dispose();
    }
  }
}

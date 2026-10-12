// SPDX-License-Identifier: AGPL-3.0-only
// Public installed code only: synthetic Loader entries/DOM, real Registry, module system and shell seed.
// No profile, network, host plugin activation, browser render, or OAuth invocation.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { build } from 'esbuild';

const directory = fileURLToPath(new URL('../', import.meta.url));
const installed = resolve(process.argv[2] ?? join(process.env.APPDATA, 'npm/node_modules/@deepseek-ai/dsh'));
const publicPackages = join(installed, 'node_modules/@deepseek-ai');
const deadline = setTimeout(() => { process.stderr.write('Native discovery exceeded 15 seconds.\n'); process.exit(1); }, 15_000);
let host;
try {
  const dsh = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  assert.equal(dsh.version, '0.2.0-rc.2', 'This installed-code check is pinned to the investigated release');
  const { Context } = await import(pathToFileURL(join(publicPackages, 'cordis/lib/index.js')).href);
  const { ClientModuleRegistry, bootInjections } = await import(pathToFileURL(join(publicPackages, 'dsh-client-modules/lib/index.js')).href);
  const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  assert.equal(pkg.dsh.client.platform, 'web');
  const entry = (modulePath) => ({
    options: { name: pathToFileURL(modulePath).href }, fiber: {}, disabled: false,
    parent: { tree: { ctx: { baseUrl: pathToFileURL(`${directory}/`).href } } },
  });
  const activeEntries = [];
  const seen = new Set();
  async function include(name) {
    if (seen.has(name)) return;
    assert.ok(name.startsWith('@deepseek-ai/'), 'Only public native packages may enter the synthetic stock graph');
    assert.ok(seen.size < 100, 'Bound the native package dependency closure');
    seen.add(name);
    const nativeDirectory = join(publicPackages, name.slice('@deepseek-ai/'.length));
    const manifest = JSON.parse(await readFile(join(nativeDirectory, 'package.json'), 'utf8'));
    if (manifest.dsh?.client?.platform !== 'web') return;
    activeEntries.push(entry(join(nativeDirectory, manifest.main)));
    for (const dependency of manifest.dsh.client.inject ?? []) await include(dependency);
    for (const dependency of manifest.dsh.client.external ?? []) {
      if (dependency.startsWith('@deepseek-ai/')) await include(dependency.replace(/\/client$/, ''));
    }
  }
  for (const name of ['dsh-client-modules', 'dsh-client-ui-settings', 'dsh-client-ui-session', 'dsh-client-connection']) {
    await include(`@deepseek-ai/${name}`);
  }
  for (const name of pkg.dsh.client.inject ?? []) await include(name);
  host = new Context();
  // Loader enumeration alone is synthetic. The Registry performs its unmodified metadata scan and graph composition.
  host.provide('loader', { entries: () => activeEntries });
  const registry = new ClientModuleRegistry(host);
  assert.equal(registry.graph().entries.some((row) => row.id === pkg.name), false);
  const guilduoEntry = entry(join(directory, 'lib/index.js'));
  activeEntries.push(guilduoEntry);
  host.emit('internal/plugin', { entry: guilduoEntry });
  await new Promise((done) => queueMicrotask(done));
  const graph = registry.graph();
  const discovered = graph.entries.find((row) => row.id === pkg.name);
  assert.ok(discovered, 'Automatic internal/plugin discovery must add the real package');
  assert.equal(registry.clientPath(pkg.name), join(directory, 'lib/client.js'));
  assert.deepEqual(discovered.inject ?? [], pkg.dsh.client.inject ?? []);
  for (const dependency of discovered.inject ?? []) assert.ok(graph.entries.some((row) => row.id === dependency), dependency);
  assert.ok(registry.artifactBaseline(pkg.name).size > 0);
  const resource = (url, method = 'GET') => registry.fetchBundle(new Request(new URL(url, 'http://127.0.0.1/'), { method }));
  const served = await resource(discovered.url);
  assert.equal(served.status, 200);
  assert.match(served.headers.get('content-type'), /javascript/);
  assert.equal((await resource(discovered.url, 'HEAD')).status, 200);
  assert.equal((await resource('plugins/missing/client.js')).status, 404);

  // Materialize the real shell singletons, rather than substitutes from Node React or mocked primitives.
  // Stop the public asset at its seed factory, before application boot; tree-shake unrelated declarations.
  const assets = join(publicPackages, 'dsh-web-frontend/dist/assets');
  let shell;
  for (const file of (await readdir(assets)).filter((name) => /^index-.*\.js$/.test(name))) {
    const source = await readFile(join(assets, file), 'utf8');
    const seed = /function ([\w$]+)\(\)\{return\{react:[^}]+\}\}/.exec(source);
    if (seed) {
      assert.equal(shell, undefined, 'Expected one public shell seed factory');
      shell = { file, source, seed };
    }
  }
  assert.ok(shell, 'Installed frontend must publish its real module-table seed');
  const seedCode = await build({
    stdin: { contents: shell.source.slice(0, shell.seed.index + shell.seed[0].length) +
      `;globalThis.nativeSeed=${shell.seed[1]}();`, resolveDir: assets, sourcefile: shell.file },
    bundle: true, write: false, treeShaking: true, platform: 'browser', format: 'iife', target: 'es2022', logLevel: 'silent',
  });
  const element = () => ({ relList: { supports: () => true }, style: {}, setAttribute() {},
    append() {}, addEventListener() {}, removeEventListener() {}, getContext: () => null });
  const forbidden = () => { throw new Error('Network, storage, rendering and asynchronous page activity are forbidden'); };
  const queuedTimers = new Set();
  const sandbox = {
    console, URL, AbortController, TextEncoder, TextDecoder, performance, queueMicrotask,
    // Hold shell startup warm-up work (e.g. Shiki) without launching the application or rendering.
    setTimeout() {
      assert.ok(queuedTimers.size < 64, 'Bound shell warm-up scheduling');
      const timer = { unref() {} }; queuedTimers.add(timer); return timer;
    },
    clearTimeout(timer) { queuedTimers.delete(timer); }, requestAnimationFrame: forbidden,
    fetch: forbidden, WebSocket: class { constructor() { forbidden(); } },
    XMLHttpRequest: class { constructor() { forbidden(); } },
    navigator: { userAgent: 'synthetic-native-discovery' }, addEventListener() {}, removeEventListener() {},
    document: { compatMode: 'CSS1Compat', createElement: element, querySelectorAll: () => [],
      head: element(), body: element(), documentElement: element(), addEventListener() {}, removeEventListener() {} },
  };
  for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(sandbox, key, { get: forbidden });
  sandbox.window = sandbox;
  const browser = createContext(sandbox);
  runInContext(seedCode.outputFiles[0].text, browser, { timeout: 5000 });
  const seed = sandbox.nativeSeed;
  assert.equal(seed.react.version, '18.3.1');
  assert.equal(typeof seed['@deepseek-ai/dsh-client-store'].createSnapshotStore, 'function');
  assert.ok(seed['@deepseek-ai/dsh-client-ui-primitives'].Button);
  assert.equal(typeof seed['@deepseek-ai/cordis'].Context, 'function');

  // Use the actual registry HTML queue, its bootstrap resources, and native ClientModuleSystem.
  const injections = bootInjections(graph);
  runInContext(injections.find((row) => row.kind === 'script').text, browser, { timeout: 5000 });
  async function loadBundle(url) {
    const response = await resource(url);
    assert.equal(response.status, 200, url);
    runInContext(await response.text(), browser, { timeout: 5000 });
  }
  for (const row of injections.filter((row) => row.kind === 'script-src')) await loadBundle(row.src);
  const modules = sandbox.window.__ModuleLoader__.create({ boot: graph, staticModules: seed, loadBundle });
  const plugin = await modules.import(pkg.name);
  assert.equal(typeof plugin.apply, 'function');
  assert.equal(typeof plugin.GuilduoSection, 'function');
  assert.equal([...plugin.inject].join(','), 'slots,connection,uiSession');
  const requested = [...modules.loadCache.get(pkg.name).edges];
  assert.ok(requested.length > 0);
  for (const specifier of requested) {
    assert.ok(Object.hasOwn(seed, specifier), `Plugin request must resolve to a real shell singleton: ${specifier}`);
    assert.equal(await modules.import(specifier), seed[specifier]);
  }
  const selection = seed['@deepseek-ai/dsh-client-store'].createSnapshotStore({ key: undefined });
  const control = plugin.createClientControl({ call: forbidden }, selection, true);
  await control.connect(); await control.disconnect();
  assert.equal(control.state.getSnapshot().state, 'disconnected');
  control.dispose();
  // The Registry must also remove the row through its actual incremental discovery lifecycle.
  activeEntries.splice(activeEntries.indexOf(guilduoEntry), 1);
  host.emit('internal/plugin', { entry: guilduoEntry });
  await new Promise((done) => queueMicrotask(done));
  assert.equal(registry.graph().entries.some((row) => row.id === pkg.name), false);
  console.log(JSON.stringify({ result: 'PASS', dsh: dsh.version, stockClientRows: graph.entries.length - 1,
    discovered: pkg.name, inject: discovered.inject ?? [], nativeFacadeRequests: requested,
    shellReact: seed.react.version, nativeStoreEmptySession: 'no RPC', heldShellWarmupTimers: queuedTimers.size,
    scope: 'synthetic discovery, bundle delivery and module materialization; no visual, profile or OAuth acceptance' }, null, 2));
} finally {
  if (host) await host.fiber.dispose();
  clearTimeout(deadline);
}

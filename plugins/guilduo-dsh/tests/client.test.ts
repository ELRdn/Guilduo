import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { readFile } from 'node:fs/promises';
import type { createClientControl, GuilduoSection } from '../src/client.js';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { buildClient } = await import(new URL('../build-client.mjs', import.meta.url).href);
const bundle = await buildClient(false);

function snapshot<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    set(next: T) { value = next; for (const listener of listeners) listener(); },
  };
}

let exports: { createClientControl: typeof createClientControl; GuilduoSection: typeof GuilduoSection; apply: (ctx: unknown) => void; inject: string[] };
const requests = new Set<string>();
const timers = new Map<number, () => void>();
let timerId = 0;
const baseline: Record<string, unknown> = {
  react: React,
  'react/jsx-runtime': require('react/jsx-runtime'),
  '@deepseek-ai/dsh-client-store': { createSnapshotStore: snapshot },
  '@deepseek-ai/dsh-client-ui-primitives': {
    Button: ({ variant: _variant, ...props }: Record<string, unknown>) => React.createElement('button', props),
  },
};
runInNewContext(bundle.outputFiles[0].text, {
  window: { __ModuleLoader__: { load(row: { id: string; factory: (require: (name: string) => unknown) => typeof exports }) {
    assert.equal(row.id, '@guilduo/dsh-oauth-poc');
    exports = row.factory((name) => { requests.add(name); assert.ok(name in baseline, name); return baseline[name]; });
  } } },
  URL, AbortController,
  setTimeout(callback: () => void) { timers.set(++timerId, callback); return timerId; },
  clearTimeout(id: number) { timers.delete(id); },
});

type Call = { endpoint: string; sessionId: string; signal?: AbortSignal };
function fixture(key: string | undefined, respond: (call: Call) => unknown | Promise<unknown> = (call) =>
  call.endpoint !== 'guilduo/connect'
    ? { state: 'disconnected', tools: 0, scope: 'none', canShare: false }
    : { authorizationUrl: 'https://mcp.guilduo.com/oauth/authorize?state=MOCK_ONLY' }, isLoopback = true,
  generation?: Parameters<typeof createClientControl>[3]) {
  const selection = snapshot<{ key: string | undefined }>({ key });
  const calls: Call[] = [];
  const rpc = { async call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal) {
    assert.equal(channel, '/api');
    assert.ok(['guilduo/status', 'guilduo/connect', 'guilduo/disconnect', 'guilduo/cancel', 'guilduo/share'].includes(endpoint));
    assert.deepEqual(Object.keys(payload as object), ['args']);
    const args = (payload as { args: { sessionId: string } }).args;
    assert.deepEqual(Object.keys(args), ['sessionId']);
    const call = { endpoint, sessionId: args.sessionId, signal };
    assert.ok(call.sessionId.trim()); calls.push(call);
    return { ok: true as const, value: { ok: true, value: await respond(call) } };
  } };
  const control = exports.createClientControl(rpc, selection, isLoopback, generation);
  return { selection, calls, control };
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('native facade requests only shell baseline; no bundled React/Cordis or node modules', () => {
  assert.ok(requests.has('react'));
  assert.ok(requests.has('@deepseek-ai/dsh-client-ui-primitives'));
  assert.deepEqual(Object.keys(bundle.metafile.inputs), ['src/client.tsx']);
  assert.match(bundle.outputFiles[0].text, /window\.__ModuleLoader__\.load/);
  assert.doesNotMatch(bundle.outputFiles[0].text, /node:|localStorage|sessionStorage|console\./);
});

test('empty selection never calls RPC and renders an accessible disabled page', async () => {
  const f = fixture(undefined); await settle();
  const html = renderToStaticMarkup(React.createElement(exports.GuilduoSection, { control: f.control, close() {} }));
  assert.equal(f.calls.length, 0);
  assert.match(html, /会話を開いてから/); assert.match(html, /disabled/);
  assert.match(html, /role="status"/); assert.match(html, /https:\/\/mcp.guilduo.com\/mcp/);
  assert.doesNotMatch(html, /<input|<a/);
  f.control.dispose();
});

test('a remote Host is refused even for explicit connect and disconnect', async () => {
  const f = fixture('A', () => { throw new Error('Remote Host must issue no RPC'); }, false);
  await settle(); await f.control.connect(); await f.control.disconnect(); await f.control.cancel(); await f.control.share();
  const html = renderToStaticMarkup(React.createElement(exports.GuilduoSection, { control: f.control, close() {} }));
  assert.equal(f.calls.length, 0);
  assert.match(html, /ローカルのDSHから/); assert.match(html, /disabled/);
  assert.doesNotMatch(html, /<a/);
  f.selection.set({ key: 'B' }); await settle();
  assert.equal(f.calls.length, 0); f.control.dispose();
});

test('neither Gateway failures nor bridge failures expose upstream error details', async () => {
  for (const response of [
    null, { ok: false, error: { message: 'MOCK_ONLY_SECRET' } },
    { ok: true, value: { ok: false, error: { message: 'MOCK_ONLY_SECRET' } } },
    { ok: true, value: { state: 'connected', tools: 2, scope: 'shared', canShare: false } },
    { ok: true, value: { ok: true } },
    { ok: true, value: { ok: true, value: { state: 'connected', tools: 2, scope: 'shared', canShare: false }, authorizationUrl: 'MOCK_ONLY_SECRET' } },
  ]) {
    const selection = snapshot({ key: 'A' });
    const rpc = { async call() { return response; } } as unknown as Parameters<typeof createClientControl>[0];
    const control = exports.createClientControl(rpc, selection, true);
    await settle();
    assert.equal(control.state.getSnapshot().state, 'failed');
    const html = renderToStaticMarkup(React.createElement(exports.GuilduoSection, { control, close() {} }));
    assert.match(html, /もう一度お試しください/); assert.doesNotMatch(html, /MOCK_ONLY_SECRET|<a/);
    control.dispose();
  }
});

test('only explicit connect yields a RAM URL and a deliberate external browser link', async () => {
  let connected = false; let started = false;
  const f = fixture('A', (call) => {
    if (call.endpoint === 'guilduo/connect') { started = true; return { authorizationUrl: 'https://mcp.guilduo.com/oauth/authorize?state=MOCK_ONLY' }; }
    return { state: connected ? 'connected' : started ? 'connecting' : 'disconnected', tools: connected ? 4 : 0, scope: connected ? 'shared' : 'none', canShare: false };
  });
  await settle(); assert.equal(f.calls.length, 1);
  assert.equal(f.control.state.getSnapshot().authorizationUrl, undefined);
  await f.control.connect(); await settle();
  assert.equal(f.calls.filter((c) => c.endpoint === 'guilduo/connect').length, 1);
  const html = renderToStaticMarkup(React.createElement(exports.GuilduoSection, { control: f.control, close() {} }));
  assert.match(html, /target="_blank"/); assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /ブラウザーで認証/);
  connected = true;
  for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
  await settle();
  assert.equal(f.control.state.getSnapshot().state, 'connected');
  assert.equal(f.control.state.getSnapshot().tools, 4);
  assert.equal(f.control.state.getSnapshot().authorizationUrl, undefined);
  assert.equal(timers.size, 0);
  f.control.dispose();
  assert.equal(f.control.state.getSnapshot().authorizationUrl, undefined);
  assert.equal(f.calls.filter((c) => c.endpoint === 'guilduo/disconnect').length, 0);
});

test('session switch aborts pending connect, closes its host attempt, and drops a late URL', async () => {
  let finish: (value: unknown) => void = () => {};
  const f = fixture('A', (call) => call.endpoint === 'guilduo/connect'
    ? new Promise((resolve) => { finish = resolve; }) : { state: 'disconnected', tools: 0, scope: 'none', canShare: false });
  await settle(); const pending = f.control.connect();
  const connect = f.calls.at(-1)!;
  f.selection.set({ key: 'B' }); await settle();
  assert.equal(connect.signal?.aborted, true);
  assert.ok(f.calls.some((c) => c.endpoint === 'guilduo/cancel' && c.sessionId === 'A'));
  assert.equal(f.calls.filter((c) => c.endpoint === 'guilduo/disconnect').length, 0);
  finish({ authorizationUrl: 'https://mcp.guilduo.com/oauth/authorize?state=MOCK_OLD' });
  await pending; await settle();
  assert.equal(f.control.state.getSnapshot().sessionId, 'B');
  assert.equal(f.control.state.getSnapshot().authorizationUrl, undefined);
  assert.equal(timers.size, 0);
  f.control.dispose();
});

test('legacy session remains local until explicitly promoted', async () => {
  const f = fixture('A', (call) => ({ state: call.sessionId === 'A' ? 'connected' : 'disconnected', tools: call.sessionId === 'A' ? 5 : 0, scope: call.sessionId === 'A' ? 'session' : 'none', canShare: call.sessionId === 'A' }));
  await settle(); assert.equal(f.control.state.getSnapshot().tools, 5);
  f.selection.set({ key: 'B' }); await settle();
  assert.equal(f.control.state.getSnapshot().state, 'disconnected');
  assert.equal(f.control.state.getSnapshot().tools, 0);
  assert.equal(f.calls.filter((c) => c.endpoint === 'guilduo/disconnect').length, 0);
  f.control.dispose();
});

test('legacy promotion uses one share action and exposes its scope and global disconnect impact', async () => {
  let shared = false;
  let connected = true;
  const f = fixture('A', (call) => {
    if (call.endpoint === 'guilduo/share') shared = true;
    if (call.endpoint === 'guilduo/disconnect') connected = false;
    return { state: connected ? 'connected' : 'disconnected', tools: connected ? 5 : 0,
      scope: connected ? shared ? 'shared' : 'session' : 'none', canShare: connected && !shared };
  });
  await settle();
  let html = renderToStaticMarkup(React.createElement(exports.GuilduoSection, { control: f.control, close() {} }));
  assert.match(html, /接続範囲: この会話のみ/);
  assert.equal((html.match(/<button[^>]*>全会話で使う<\/button>/g) ?? []).length, 1);
  await f.control.share(); await settle();
  assert.equal(f.control.state.getSnapshot().scope, 'shared');
  assert.equal(f.control.state.getSnapshot().canShare, false);
  assert.equal(f.control.state.getSnapshot().tools, 5);
  html = renderToStaticMarkup(React.createElement(exports.GuilduoSection, { control: f.control, close() {} }));
  assert.match(html, /接続範囲: 全会話で共有/);
  assert.match(html, /通常の会話・フォーク/);
  assert.match(html, /切断すると、Web／Desktopを含む全会話/);
  assert.doesNotMatch(html, />全会話で使う<\/button>/);
  await f.control.share(); await f.control.cancel();
  assert.equal(f.calls.filter((call) => call.endpoint === 'guilduo/share').length, 1);
  assert.equal(f.calls.filter((call) => call.endpoint === 'guilduo/cancel').length, 0);
  await f.control.disconnect(); await settle();
  assert.equal(f.calls.filter((call) => call.endpoint === 'guilduo/disconnect').length, 1);
  assert.equal(f.control.state.getSnapshot().state, 'disconnected');
  assert.equal(f.control.state.getSnapshot().scope, 'none');
  f.control.dispose();
});

test('shared status follows normal and fork conversations without reconnecting or cancelling', async () => {
  const f = fixture('A', () => ({ state: 'connected', tools: 5, scope: 'shared', canShare: false }));
  await settle();
  for (const key of ['B', 'FORK_OF_A']) {
    f.selection.set({ key }); await settle();
    assert.equal(f.control.state.getSnapshot().sessionId, key);
    assert.equal(f.control.state.getSnapshot().scope, 'shared');
    assert.equal(f.control.state.getSnapshot().state, 'connected');
    assert.equal(f.control.state.getSnapshot().tools, 5);
    await f.control.connect(); await f.control.cancel(); await f.control.share();
  }
  f.control.dispose();
  assert.deepEqual(f.calls.map((call) => call.endpoint), ['guilduo/status', 'guilduo/status', 'guilduo/status']);
  assert.equal(timers.size, 0);
});

test('share is refused unless the host allows a connected legacy session', async () => {
  for (const value of [
    { state: 'connected', tools: 5, scope: 'session', canShare: false },
    { state: 'connected', tools: 5, scope: 'shared', canShare: true },
    { state: 'disconnected', tools: 0, scope: 'none', canShare: true },
  ]) {
    const f = fixture('A', () => value);
    await f.control.share(); await settle(); await f.control.share();
    const html = renderToStaticMarkup(React.createElement(exports.GuilduoSection, { control: f.control, close() {} }));
    assert.doesNotMatch(html, />全会話で使う<\/button>/);
    assert.deepEqual(f.calls.map((call) => call.endpoint), ['guilduo/status']);
    f.control.dispose();
  }
});

test('duplicate share is blocked and a late promotion reply cannot overwrite another conversation', async () => {
  let finish: (value: unknown) => void = () => {};
  const f = fixture('A', (call) => call.endpoint === 'guilduo/share'
    ? new Promise((resolve) => { finish = resolve; })
    : { state: 'connected', tools: 5, scope: 'session', canShare: true });
  await settle(); const pending = f.control.share();
  const share = f.calls.at(-1)!;
  assert.equal(f.control.state.getSnapshot().busy, true);
  const html = renderToStaticMarkup(React.createElement(exports.GuilduoSection, { control: f.control, close() {} }));
  assert.match(html, /<button[^>]*disabled[^>]*>全会話で使う<\/button>/);
  await f.control.share();
  assert.equal(f.calls.filter((call) => call.endpoint === 'guilduo/share').length, 1);
  f.selection.set({ key: 'B' }); await settle();
  assert.equal(share.signal?.aborted, true);
  finish({ state: 'connected', tools: 99, scope: 'shared', canShare: false });
  await pending; await settle();
  assert.equal(f.control.state.getSnapshot().sessionId, 'B');
  assert.equal(f.control.state.getSnapshot().scope, 'session');
  assert.equal(f.control.state.getSnapshot().tools, 5);
  assert.equal(f.calls.filter((call) => call.endpoint === 'guilduo/cancel' || call.endpoint === 'guilduo/disconnect').length, 0);
  f.control.dispose();
});

test('share and disconnect failures retain known scope and show only a safe error', async () => {
  for (const action of ['share', 'disconnect'] as const) {
    const f = fixture('A', (call) => {
      if (call.endpoint !== 'guilduo/status') throw new Error('MOCK_ONLY_SECRET');
      return { state: 'connected', tools: 5, scope: action === 'share' ? 'session' : 'shared', canShare: action === 'share' };
    });
    await settle(); await f.control[action](); await settle();
    assert.equal(f.control.state.getSnapshot().state, 'failed');
    assert.equal(f.control.state.getSnapshot().scope, action === 'share' ? 'session' : 'shared');
    const html = renderToStaticMarkup(React.createElement(exports.GuilduoSection, { control: f.control, close() {} }));
    assert.match(html, /もう一度お試しください/);
    assert.doesNotMatch(html, /MOCK_ONLY_SECRET/);
    f.control.dispose();
  }
});

test('old status and failure responses cannot replace the newly selected conversation', async () => {
  for (const rejectOld of [false, true]) {
    let finish: (value: unknown) => void = () => {};
    let fail: (reason: Error) => void = () => {};
    const f = fixture('A', (call) => call.sessionId === 'A'
      ? new Promise((resolve, reject) => { finish = resolve; fail = reject; })
      : { state: 'disconnected', tools: 0, scope: 'none', canShare: false });
    const initial = f.calls[0];
    f.selection.set({ key: 'B' }); await settle();
    assert.equal(initial.signal?.aborted, true);
    if (rejectOld) fail(new Error('MOCK_ONLY_SECRET'));
    else finish({ state: 'connected', tools: 99, scope: 'shared', canShare: false });
    await settle();
    assert.equal(f.control.state.getSnapshot().sessionId, 'B');
    assert.equal(f.control.state.getSnapshot().state, 'disconnected');
    assert.equal(f.control.state.getSnapshot().tools, 0);
    assert.equal(f.control.state.getSnapshot().authorizationUrl, undefined);
    assert.equal(timers.size, 0); f.control.dispose();
  }
});

test('connection generation loss and replacement revoke old links and late replies', async () => {
  const generation = snapshot<{ id: number; host: { home: string } } | undefined>(undefined);
  let finish: (value: unknown) => void = () => {};
  const f = fixture('A', (call) => call.endpoint === 'guilduo/connect'
    ? new Promise((resolve) => { finish = resolve; }) : { state: 'disconnected', tools: 0, scope: 'none', canShare: false }, true, generation);
  await f.control.connect(); await f.control.disconnect(); await f.control.cancel(); await f.control.share();
  assert.equal(f.calls.length, 0);
  generation.set({ id: 1, host: { home: 'MOCK_ONLY' } }); await settle();
  assert.equal(f.calls.length, 1);
  const pending = f.control.connect(); const oldCall = f.calls.at(-1)!;
  generation.set(undefined); await settle();
  assert.equal(oldCall.signal?.aborted, true);
  assert.equal(f.control.isReady(), false);
  generation.set({ id: 2, host: { home: 'MOCK_ONLY' } }); await settle();
  finish({ authorizationUrl: 'https://mcp.guilduo.com/oauth/authorize?state=MOCK_OLD' });
  await pending; await settle();
  assert.equal(f.control.state.getSnapshot().authorizationUrl, undefined);
  assert.equal(f.control.state.getSnapshot().state, 'disconnected');
  assert.equal(timers.size, 0);
  // Neither a logout for the old Host nor a stale connect is replayed to the replacement.
  assert.deepEqual(f.calls.map((call) => call.endpoint), ['guilduo/status', 'guilduo/connect', 'guilduo/status']);
  const again = f.control.connect();
  finish({ authorizationUrl: 'https://mcp.guilduo.com/oauth/authorize?state=MOCK_NEW' });
  await again; await settle();
  // Explicitly delivered link can still disappear on a reset with the same selected conversation.
  generation.set(undefined);
  assert.equal(f.control.state.getSnapshot().authorizationUrl, undefined);
  f.control.dispose();
  const count = f.calls.length;
  generation.set({ id: 3, host: { home: 'MOCK_ONLY' } }); await settle();
  assert.equal(f.calls.length, count);
});

test('malformed status, authorization URL, and transport errors render only a fixed safe error', async () => {
  for (const response of [null, { authorizationUrl: 'javascript:alert(1)' }, { authorizationUrl: 'https://evil.example/oauth/authorize' },
    { authorizationUrl: 'https://mcp.guilduo.com/oauth/authorize', access_token: 'MOCK_ONLY_SECRET' }]) {
    const f = fixture('A', (call) => call.endpoint === 'guilduo/connect' ? response : { state: 'disconnected', tools: 0, scope: 'none', canShare: false });
    await settle(); await f.control.connect(); await settle();
    assert.equal(f.control.state.getSnapshot().state, 'failed');
    const html = renderToStaticMarkup(React.createElement(exports.GuilduoSection, { control: f.control, close() {} }));
    assert.match(html, /もう一度お試しください/); assert.doesNotMatch(html, /evil|javascript|MOCK_ONLY_SECRET/);
    f.control.dispose();
  }
  const badStatus = fixture('A', () => ({ state: 'connected', tools: -1, scope: 'shared', canShare: false }));
  await settle(); assert.equal(badStatus.control.state.getSnapshot().state, 'failed'); badStatus.control.dispose();
  for (const response of [
    { state: 'connected', tools: 4 },
    { state: 'connected', tools: 4, scope: 'unknown', canShare: false },
    { state: 'connected', tools: 4, scope: 'shared', canShare: 'true' },
    { state: 'connected', tools: 4, scope: 'shared', canShare: false, access_token: 'MOCK_ONLY_SECRET' },
  ]) {
    const f = fixture('A', () => response); await settle();
    assert.equal(f.control.state.getSnapshot().state, 'failed');
    const html = renderToStaticMarkup(React.createElement(exports.GuilduoSection, { control: f.control, close() {} }));
    assert.doesNotMatch(html, /MOCK_ONLY_SECRET/); f.control.dispose();
  }
  const failed = fixture('A', () => { throw new Error('MOCK_ONLY_SECRET'); });
  await settle(); assert.equal(failed.control.state.getSnapshot().state, 'failed'); failed.control.dispose();
});

test('cutting a pending attempt clears its URL and stops polling', async () => {
  let connecting = false;
  const f = fixture('A', (call) => {
    if (call.endpoint === 'guilduo/connect') { connecting = true; return { authorizationUrl: 'https://mcp.guilduo.com/oauth/authorize?state=MOCK_ONLY' }; }
    if (call.endpoint === 'guilduo/disconnect') connecting = false;
    return { state: connecting ? 'connecting' : 'disconnected', tools: 0, scope: 'none', canShare: false };
  });
  await settle(); await f.control.connect(); await settle();
  await f.control.disconnect(); await settle();
  assert.equal(f.control.state.getSnapshot().state, 'disconnected');
  assert.equal(f.control.state.getSnapshot().authorizationUrl, undefined);
  f.control.dispose();
});

test('settings cancellation, disposal, and polling failure cancel only the initiating pending auth', async () => {
  for (const reason of ['cancel', 'dispose', 'poll-failure']) {
    let connecting = false;
    const f = fixture('A', (call) => {
      if (call.endpoint === 'guilduo/connect') {
        connecting = true;
        return { authorizationUrl: 'https://mcp.guilduo.com/oauth/authorize?state=MOCK_ONLY' };
      }
      if (call.endpoint === 'guilduo/cancel') connecting = false;
      if (call.endpoint === 'guilduo/status' && connecting && reason === 'poll-failure') throw new Error('MOCK_ONLY_SECRET');
      return { state: connecting ? 'connecting' : 'disconnected', tools: 0, scope: 'none', canShare: false };
    });
    await settle(); await f.control.connect(); await settle();
    if (reason === 'dispose') f.control.dispose();
    if (reason === 'cancel') await f.control.cancel();
    await settle();
    assert.equal(f.calls.filter((call) => call.endpoint === 'guilduo/cancel' && call.sessionId === 'A').length, 1);
    assert.equal(f.calls.filter((call) => call.endpoint === 'guilduo/disconnect').length, 0);
    assert.equal(f.control.state.getSnapshot().authorizationUrl, undefined);
    assert.equal(timers.size, 0);
    f.control.dispose();
  }
});

test('observing another pending auth never cancels it or globally disconnects', async () => {
  const f = fixture('A', () => ({ state: 'connecting', tools: 0, scope: 'none', canShare: false }));
  await settle(); await f.control.cancel();
  f.selection.set({ key: 'B' }); await settle();
  f.control.dispose();
  assert.deepEqual(f.calls.map((call) => call.endpoint), ['guilduo/status', 'guilduo/status']);
  assert.equal(timers.size, 0);
});

test('settings effect cleanup cancels pending auth and preserves a completed shared connection', async () => {
  for (const connected of [false, true]) {
    let started = false;
    const f = fixture('A', (call) => {
      if (call.endpoint === 'guilduo/connect') {
        started = true;
        return { authorizationUrl: 'https://mcp.guilduo.com/oauth/authorize?state=MOCK_ONLY' };
      }
      if (call.endpoint === 'guilduo/cancel') started = false;
      return { state: connected ? 'connected' : started ? 'connecting' : 'disconnected',
        tools: connected ? 5 : 0, scope: connected ? 'shared' : 'none', canShare: false };
    });
    await settle();
    let cleanup: (() => void) | undefined;
    const originalEffect = React.useEffect;
    React.useEffect = (install: () => () => void) => { cleanup = install(); };
    try {
      renderToStaticMarkup(React.createElement(exports.GuilduoSection, { control: f.control, close() {} }));
    } finally { React.useEffect = originalEffect; }
    await settle();
    if (!connected) { await f.control.connect(); await settle(); }
    assert.ok(cleanup); cleanup(); await settle();
    assert.equal(f.calls.filter((call) => call.endpoint === 'guilduo/cancel').length, connected ? 0 : 1);
    assert.equal(f.calls.filter((call) => call.endpoint === 'guilduo/disconnect').length, 0);
    assert.equal(f.control.state.getSnapshot().state, connected ? 'connected' : 'disconnected');
    assert.equal(timers.size, 0); f.control.dispose();
  }
});

test('cancellation accepts a shared connection completed before the host handles cancel', async () => {
  let shared = false; let started = false;
  const f = fixture('A', (call) => {
    if (call.endpoint === 'guilduo/connect') {
      started = true;
      return { authorizationUrl: 'https://mcp.guilduo.com/oauth/authorize?state=MOCK_ONLY' };
    }
    return { state: shared ? 'connected' : started ? 'connecting' : 'disconnected', tools: shared ? 5 : 0,
      scope: shared ? 'shared' : 'none', canShare: false };
  });
  await settle(); await f.control.connect(); await settle();
  shared = true;
  await f.control.cancel(); await settle();
  assert.equal(f.control.state.getSnapshot().state, 'connected');
  assert.equal(f.control.state.getSnapshot().scope, 'shared');
  assert.equal(f.control.state.getSnapshot().tools, 5);
  assert.equal(f.control.state.getSnapshot().authorizationUrl, undefined);
  assert.equal(f.calls.filter((call) => call.endpoint === 'guilduo/disconnect').length, 0);
  assert.equal(timers.size, 0); f.control.dispose();
});

test('cancelling while connect is in flight aborts it and drops a late auth URL', async () => {
  let finish: (value: unknown) => void = () => {};
  const f = fixture('A', (call) => call.endpoint === 'guilduo/connect'
    ? new Promise((resolve) => { finish = resolve; })
    : { state: 'disconnected', tools: 0, scope: 'none', canShare: false });
  await settle(); const pending = f.control.connect();
  const connect = f.calls.at(-1)!;
  await f.control.cancel(); await settle();
  assert.equal(connect.signal?.aborted, true);
  finish({ authorizationUrl: 'https://mcp.guilduo.com/oauth/authorize?state=MOCK_OLD' });
  await pending; await settle();
  assert.equal(f.control.state.getSnapshot().state, 'disconnected');
  assert.equal(f.control.state.getSnapshot().authorizationUrl, undefined);
  assert.equal(f.calls.filter((call) => call.endpoint === 'guilduo/cancel').length, 1);
  assert.equal(f.calls.filter((call) => call.endpoint === 'guilduo/disconnect').length, 0);
  assert.equal(timers.size, 0); f.control.dispose();
});

test('settings reopening refreshes status for the same conversation after host auth expires', async () => {
  let expired = false;
  const f = fixture('A', () => ({ state: expired ? 'disconnected' : 'connected', tools: expired ? 0 : 4, scope: expired ? 'none' : 'shared', canShare: false }));
  await settle(); assert.equal(f.control.state.getSnapshot().state, 'connected');
  expired = true;
  f.control.refresh(); await settle();
  assert.equal(f.control.state.getSnapshot().state, 'disconnected');
  assert.equal(f.control.state.getSnapshot().tools, 0);
  assert.deepEqual(f.calls.map((call) => call.sessionId), ['A', 'A']);
  f.control.dispose();
});

test('slot registration uses the native Session adapter and owns disposal', async () => {
  const f = fixture(undefined);
  let registered: { name: string; id: string; label: string; inject: () => unknown } | undefined;
  let dispose: (() => void) | undefined;
  let onReset: (() => void) | undefined;
  exports.apply({
    get: () => ({ isLoopback: true, rpc: { call() { throw new Error('No Session must issue no RPC'); } } }),
    uiSession: { adapter: { current: f.selection } },
    effect(install: () => () => void) { dispose = install(); },
    on(event: string, listener: () => void) { assert.equal(event, 'connection/reset'); onReset = listener; },
    slots: {
      inject(name: string, install: () => void) { assert.equal(name, 'settings.section'); install(); },
      register(options: typeof registered, component: typeof exports.GuilduoSection) {
        registered = options; assert.equal(component, exports.GuilduoSection); return () => {};
      },
    },
  });
  assert.equal(registered?.id, 'guilduo'); assert.equal(registered?.label, 'Guilduo');
  assert.equal(exports.inject.join(','), 'slots,connection,uiSession');
  onReset?.();
  dispose?.(); f.control.dispose();
  const source = await readFile(new URL('../src/client.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /window\.open|localStorage|sessionStorage|\.send\(|\.prompt\(/);
});

test('native connection/reset aborts an old same-id attempt and drops its late auth URL', async () => {
  let finish: (value: unknown) => void = () => {};
  const selection = snapshot({ key: 'A' });
  // Bind the native listener and capture the same store that the slot receives.
  let onReset: (() => void) | undefined;
  let control: ReturnType<typeof createClientControl> | undefined;
  let dispose: (() => void) | undefined;
  const nativeRpc = { async call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal) {
    assert.equal(channel, '/api');
    const sessionId = (payload as { args: { sessionId: string } }).args.sessionId;
    assert.equal(sessionId, 'A');
    if (endpoint === 'guilduo/connect') {
      signal?.addEventListener('abort', () => { aborted = true; });
      return { ok: true as const, value: { ok: true, value: await new Promise((resolve) => { finish = resolve; }) } };
    }
    return { ok: true as const, value: { ok: true, value: { state: 'disconnected', tools: 0, scope: 'none', canShare: false } } };
  } };
  let aborted = false;
  exports.apply({
    get: () => ({ isLoopback: true, rpc: nativeRpc }),
    uiSession: { adapter: { current: selection } },
    effect(install: () => () => void) { dispose = install(); },
    on(event: string, listener: () => void) { assert.equal(event, 'connection/reset'); onReset = listener; },
    slots: {
      inject(_name: string, install: () => void) { install(); },
      register(options: { inject: () => { control: ReturnType<typeof createClientControl> } }) {
        control = options.inject().control; return () => {};
      },
    },
  });
  await settle();
  const pending = control!.connect();
  onReset!(); await settle();
  assert.equal(aborted, true);
  finish({ authorizationUrl: 'https://mcp.guilduo.com/oauth/authorize?state=MOCK_OLD' });
  await pending; await settle();
  assert.equal(control!.state.getSnapshot().sessionId, 'A');
  assert.equal(control!.state.getSnapshot().state, 'disconnected');
  assert.equal(control!.state.getSnapshot().authorizationUrl, undefined);
  dispose?.();
});

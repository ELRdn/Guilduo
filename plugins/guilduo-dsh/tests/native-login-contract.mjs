// SPDX-License-Identifier: AGPL-3.0-only
// Inspect public installed code and exercise only the native in-memory command registry.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

assert.ok(process.argv[2], 'Supply the installed DSH lib/bin.js; no profile is booted');
const entry = resolve(process.argv[2]);
const require = createRequire(entry);
const host = JSON.parse(await readFile(resolve(dirname(entry), '../package.json'), 'utf8'));
assert.equal(host.name, '@deepseek-ai/dsh');
assert.equal(host.version, '0.2.0-rc.2', 'Reinspect the native contract before changing the target version');
const hashes = {};
const declarations = {};
for (const name of ['dsh-commands', 'dsh-host-webserver', 'dsh-client-connection', 'dsh-web-app', 'dsh-api-account-controller']) {
  const manifestPath = require.resolve(`@deepseek-ai/${name}/package.json`);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.version, host.version);
  declarations[name] = await readFile(resolve(dirname(manifestPath), manifest.types), 'utf8');
  for (const file of [manifest.types, manifest.main]) {
    hashes[`${name}/${file}`] = createHash('sha256').update(await readFile(resolve(dirname(manifestPath), file))).digest('hex');
  }
}
assert.match(declarations['dsh-commands'], /readonly agent: Agent/);
assert.match(declarations['dsh-commands'], /recordInput\?: boolean/);
assert.match(declarations['dsh-host-webserver'], /register\(route: WebRoute\)/);
assert.match(declarations['dsh-web-app'], /Test hooks[\s\S]*internals:[\s\S]*openBrowser:/);
assert.match(declarations['dsh-api-account-controller'], /startSignIn\(client: AccountClientMetadata, callbackOrigin: string, loginSource:/);
const connectionManifest = require.resolve('@deepseek-ai/dsh-client-connection/package.json');
const trustFile = 'dsh-client-connection/lib/types/rpc-host.d.ts';
const trust = await readFile(resolve(dirname(connectionManifest), 'lib/types/rpc-host.d.ts'), 'utf8');
assert.match(trust, /requestRejection\(request: ConnectionTrustRequest\)/);
hashes[trustFile] = createHash('sha256').update(trust).digest('hex');
for (const file of ['package.json', 'src/index.ts', 'src/adapter.ts']) {
  hashes[`guilduo-dsh/${file}`] = createHash('sha256').update(await readFile(fileURLToPath(new URL(`../${file}`, import.meta.url)))).digest('hex');
}

let networkRequests = 0;
globalThis.fetch = async () => { networkRequests++; throw new Error('Native contract inspection forbids network'); };
const load = (name) => import(pathToFileURL(require.resolve(`@deepseek-ai/${name}`)).href);
const { Context } = await load('cordis');
const { CommandRuntime } = await load('dsh-commands');
const ctx = new Context();
const mounted = await ctx.plugin(CommandRuntime);
// Fixture Agents have only identity and an append-only log; no Agent/model runtime is created.
const logs = [[], []];
const agents = logs.map((log, index) => ({
  id: `synthetic-session-${index}`,
  session: { append(type, data) { log.push({ type, data }); return log.length; } },
}));
let invoked = 0;
try {
  const unregister = ctx.commands.register({
    name: 'native-contract-probe', description: 'Synthetic native command binding check', recordInput: false,
    handler(invocation) {
      assert.equal(invocation.agent, agents[invoked++]);
      assert.equal(invocation.rawInput, ' SYNTHETIC_INPUT_NOT_FOR_HISTORY');
      return { kind: 'success', text: 'Synthetic command complete' };
    },
  });
  for (const agent of agents) {
    const execution = await ctx.commands.execute(agent, '/native-contract-probe SYNTHETIC_INPUT_NOT_FOR_HISTORY', [], new AbortController().signal);
    assert.equal(execution.result.kind, 'success');
  }
  assert.equal(invoked, 2);
  assert.ok(logs.every((log) => log.length === 2));
  assert.ok(!JSON.stringify(logs).includes('SYNTHETIC_INPUT_NOT_FOR_HISTORY'));
  unregister();
  assert.equal(ctx.commands.find(agents[0], 'native-contract-probe'), undefined);

  const removeFailure = ctx.commands.register({
    name: 'native-contract-failure', description: 'Synthetic exception persistence check', recordInput: false,
    handler() { throw new Error('SYNTHETIC_OAUTH_ERROR_DETAIL'); },
  });
  await assert.rejects(ctx.commands.execute(agents[0], '/native-contract-failure', [], new AbortController().signal), /SYNTHETIC_OAUTH_ERROR_DETAIL/);
  assert.equal(logs[0].at(-1).data.text, 'SYNTHETIC_OAUTH_ERROR_DETAIL');
  removeFailure();
} finally {
  await mounted.dispose();
}
assert.equal(networkRequests, 0);
console.log(JSON.stringify({
  result: 'PASS_NATIVE_PRIMITIVES; TRUSTED_LOGIN_CALLBACK_GATE_OPEN',
  checkedAt: new Date().toISOString(),
  hostVersion: host.version, nodeVersion: process.version,
  sourceReference: '5badb15009ae1756c3afe0ae0cef1faafc290ccc',
  sourceBuildEquality: 'not established; installed public code identified by hashes below',
  nativeCommandFixture: { exactAgentObject: true, sessions: 2, recordInputSuppressed: true, unregister: true, thrownErrorPersisted: true },
  browserOpener: 'web-app.internals.openBrowser is documented as a test hook, not an injected service',
  callbackOwner: 'no Guilduo login/callback wiring is composed by the current candidate',
  hashes, networkRequests, modelCalls: 0, publicOAuth: 'not attempted', profileBoot: false,
}, null, 2));

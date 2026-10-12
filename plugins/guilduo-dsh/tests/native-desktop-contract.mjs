// SPDX-License-Identifier: AGPL-3.0-only
// Read installed public ASAR code; execute only extracted callbacks with synthetic stubs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

assert.ok(process.argv[2], 'Supply installed Desktop resources directory; no application is launched');
const resources = resolve(process.argv[2]);
const archive = await readFile(resolve(resources, 'app.asar'));
assert.equal(archive.readUInt32LE(0), 4);
const dataOffset = 8 + archive.readUInt32LE(4);
const jsonSize = archive.readUInt32LE(12);
assert.ok(jsonSize > 0 && 16 + jsonSize <= dataOffset && dataOffset <= archive.length);
const header = JSON.parse(archive.subarray(16, 16 + jsonSize).toString('utf8'));
const hashes = {};
const evidence = [];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
hashes['app.asar'] = digest(archive);
function source(path) {
  let entry = header;
  for (const segment of path.split('/')) {
    assert.ok(segment && segment !== '.' && segment !== '..');
    entry = entry.files?.[segment];
    assert.ok(entry, `Missing public source ${path}`);
  }
  // ponytail: packed entries only; reject unpacked/link entries rather than resolve outside the archive.
  assert.ok(!entry.unpacked && !entry.link && !entry.files);
  const start = dataOffset + Number(entry.offset);
  assert.ok(Number.isSafeInteger(start) && start >= dataOffset && Number.isSafeInteger(entry.size) && entry.size >= 0 && start + entry.size <= archive.length);
  const bytes = archive.subarray(start, start + entry.size);
  hashes[path] = digest(bytes);
  return bytes.toString('utf8');
}
function excerpt(path, text, pattern) {
  const match = text.match(pattern);
  assert.ok(match, `Public contract changed: ${path}: ${pattern}`);
  evidence.push({ path, startLine: text.slice(0, match.index).split('\n').length, text: match[0] });
  return match[0];
}
const desktop = JSON.parse(source('package.json'));
assert.equal(desktop.name, '@deepseek-ai/dsh-desktop');
assert.equal(desktop.version, '0.2.0-rc.2');
const mainPath = 'lib/main.js';
const main = source(mainPath);
const native = name => `dsh/node_modules/@deepseek-ai/${name}`;
const hostPath = `${native('dsh-desktop-host')}/lib/index.js`;
const host = source(hostPath);
const webPatchPath = `${native('dsh-web-app')}/cordis.patch.yml`;
const webPatch = source(webPatchPath);
const basePatchPath = `${native('dsh-base')}/cordis.patch.yml`;
const basePatch = source(basePatchPath);
excerpt(hostPath, host, /const application = runProfile\([\s\S]*?profile: "desktop"[\s\S]*?\n\t\}\);/);
excerpt(hostPath, host, /const url = ctx\.connection\.authenticatedUrl\([^\n]+\);[\s\S]*?injections: ctx\.webServer\.collectIndexInjections\(\)/);
excerpt(webPatchPath, webPatch, /- id: connection\s+name: '@deepseek-ai\/dsh-client-connection'\s+inject: \[webRuntime\]/);
excerpt(webPatchPath, webPatch, /- id: webserver\s+name: '@deepseek-ai\/dsh-host-webserver'/);
excerpt(basePatchPath, basePatch, /- id: typert-gateway\s+name: '@deepseek-ai\/dsh-api-gateway'/);
const connectionPath = `${native('dsh-client-connection')}/lib/index.js`;
const connection = source(connectionPath);
excerpt(connectionPath, connection, /requestRejection\(request\) \{[\s\S]*?\n\t\}/);
excerpt(connectionPath, connection, /const admission = connection\.admit\(req\);[\s\S]*?await webCtx\.waterfall\([^\n]+/);
const gatewayPath = `${native('dsh-api-gateway')}/lib/index.js`;
const gateway = source(gatewayPath);
excerpt(gatewayPath, gateway, /connectionCtx\.connection\.rpc\.intercept\("\/api",[^\n]+/);
excerpt(gatewayPath, gateway, /operatorPeer\(\) \{[\s\S]*?\n\t\}/);
for (const name of ['dsh-desktop-host', 'dsh-client-connection', 'dsh-api-gateway']) {
  assert.equal(JSON.parse(source(`${native(name)}/package.json`)).version, desktop.version);
}

const windowOpen = excerpt(mainPath, main, /window\.webContents\.setWindowOpenHandler\(\(\{ url \}\) => \{\s+if \(\["http:", "https:"\][\s\S]*?\n\t\}\);/);
const callback = windowOpen.slice(windowOpen.indexOf('(({ url })') + 1, -2);
const externalCalls = [];
const openWindow = runInNewContext(`(${callback})`, { URL, shell: { openExternal(url) { externalCalls.push(url); } } }, { timeout: 1000 });
for (const [url, opens] of [
  ['https://synthetic.example/authorize', true], ['http://synthetic.example/', true],
  ['javascript:synthetic()', false], ['file:///synthetic', false], ['dsh-app://app/', false],
]) {
  const before = externalCalls.length;
  assert.equal(openWindow({ url }).action, 'deny');
  assert.equal(externalCalls.length - before, Number(opens));
}
excerpt(mainPath, main, /window\.webContents\.on\("will-navigate", \(event, url\) => \{\s+const destination = new URL\(url\);[\s\S]*?\n\t\}\);/);

const authenticate = excerpt(mainPath, main, /async function authenticateWebHost\(url\) \{[\s\S]*?\n\}/);
let syntheticStatus = 303;
let syntheticCookie = 'synthetic-cookie=value; HttpOnly; SameSite=Strict';
let authenticationCalls = 0;
const authenticateHost = runInNewContext(`(${authenticate})`, { fetch: async (url, options) => {
  authenticationCalls++;
  assert.equal(url, 'http://127.0.0.1:1/?token=synthetic');
  assert.equal(options.redirect, 'manual');
  return { status: syntheticStatus, headers: new Headers(syntheticCookie ? { 'set-cookie': syntheticCookie } : {}), body: null };
} }, { timeout: 1000 });
assert.equal(await authenticateHost('http://127.0.0.1:1/?token=synthetic'), 'synthetic-cookie=value');
syntheticStatus = 200;
await assert.rejects(authenticateHost('http://127.0.0.1:1/?token=synthetic'), /authentication failed/);
syntheticStatus = 303; syntheticCookie = '';
await assert.rejects(authenticateHost('http://127.0.0.1:1/?token=synthetic'), /authentication failed/);
excerpt(mainPath, main, /hostCookie = await authenticateWebHost\(ready\.url\);\s+hostUrl = ready\.url;/);

const forwardSource = excerpt(mainPath, main, /async function forwardWebRequest\(request, host, cookie\) \{[\s\S]*?\n\}/);
const withheld = excerpt(mainPath, main, /const WITHHELD_RESPONSE_HEADERS = \[[\s\S]*?\];/);
const bundlePattern = excerpt(mainPath, main, /const PLUGIN_BUNDLE_PATH =[^\n]+/);
const forwarded = [];
const forward = runInNewContext(`${withheld}\n${bundlePattern}\n(${forwardSource})`, { URL, Headers, Response, fetch: async (url, init) => {
  forwarded.push({ url: url.href, init });
  return Response.json({ synthetic: true }, { headers: { 'set-cookie': 'synthetic-upstream-cookie', 'content-length': '18' } });
} }, { timeout: 1000 });
for (const origin of [undefined, 'dsh-app://app']) {
  const response = await forward(new Request('dsh-app://app/api/guilduo/status?synthetic=1', {
    method: 'POST', body: '{}', headers: { ...(origin ? { origin } : {}), host: 'synthetic-attacker.invalid', cookie: 'synthetic-forged', 'sec-fetch-site': 'cross-site' },
  }), 'http://127.0.0.1:1/?token=synthetic', 'synthetic-owned-cookie');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('content-length'), null);
  const call = forwarded.at(-1);
  assert.equal(call.url, 'http://127.0.0.1:1/api/guilduo/status?synthetic=1');
  assert.equal(call.init.headers.get('cookie'), 'synthetic-owned-cookie');
  for (const header of ['origin', 'host', 'sec-fetch-site']) assert.equal(call.init.headers.get(header), null);
  assert.equal(call.init.redirect, 'manual');
}
const beforeForbidden = forwarded.length;
assert.equal((await forward(new Request('dsh-app://app/api/guilduo/status', { headers: { origin: 'https://synthetic-attacker.invalid' } }), 'http://127.0.0.1:1/', 'synthetic-owned-cookie')).status, 403);
assert.equal(forwarded.length, beforeForbidden);
excerpt(mainPath, main, /protocol\.handle\(SCHEME, \(request\) => \{[\s\S]*?\n\t\}\);/);
const sourceEquality = {};
if (process.argv[3]) {
  const require = createRequire(resolve(process.argv[3]));
  for (const [name, path] of [['dsh-client-connection', connectionPath], ['dsh-api-gateway', gatewayPath]]) {
    const bytes = await readFile(require.resolve(`@deepseek-ai/${name}`));
    hashes[`npm-host/${name}`] = digest(bytes);
    sourceEquality[name] = hashes[path] === hashes[`npm-host/${name}`];
    assert.equal(sourceEquality[name], true, 'Desktop carrier source differs from the tested npm host');
  }
}
const probe = fileURLToPath(import.meta.url);
hashes['guilduo-dsh/tests/native-desktop-contract.mjs'] = digest(await readFile(probe));
const result = { result: 'PASS_INSTALLED_DESKTOP_SOURCE_AND_SYNTHETIC_CALLBACKS', checkedAt: new Date().toISOString(), resources,
  desktopVersion: desktop.version, desktopBuildCommit: desktop.dshBuildCommit, sourceEquality,
  checks: { nativeConnectionInShippedComposition: true, existingGateway: true, externalHttpHttpsDelegatedToShell: true,
    electronPopupDenied: true, authenticationCalls, forwardingCalls: forwarded.length, crossOriginDeniedBeforeForward: true,
    hostCookieOverwritesRendererCookie: true, cookieWithheldFromRenderer: true },
  limits: ['Shipped source contract only; actual profile composition was not inspected.', 'Electron event delivery, OS browser launch and live host authentication were not exercised.', 'External handler accepts HTTP/HTTPS without hostname/userinfo validation; Guilduo UI must validate authorization URL.'],
  networkRequests: 0, applicationLaunches: 0, realProfileCredentialSessionAccess: false, hashes, evidence };
const artifacts = resolve(dirname(probe), '../../../.qa-artifacts/guilduo-dsh-ui-carrier');
await mkdir(artifacts, { recursive: true });
const report = resolve(artifacts, `desktop-${new Date().toISOString().replaceAll(':', '-')}.json`);
await writeFile(report, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ ...result, evidence: `${evidence.length} source excerpts in report`, report }, null, 2));

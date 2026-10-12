import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Uses an already installed, isolated host; never installs/updates the user's Pi.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = join(root, '.qa-artifacts/guilduo-pi-host');
const host = join(artifacts, 'runtime/node_modules/@earendil-works/pi-coding-agent');
const cli = join(host, 'dist/bundle/cli.js');
const manifest = JSON.parse(await readFile(join(host, 'package.json'), 'utf8'));
assert.equal(manifest.version, '1.0.4');
if (process.argv[2] === '--native-engine') {
  await verifyNativeEngine(process.argv[3]!, process.argv[4]!);
  process.exit(0);
}
await mkdir(artifacts, { recursive: true });
const run = await mkdtemp(join(artifacts, 'run-'));
const profile = join(run, 'profile');
const cwd = join(run, 'workspace with spaces');
const userProfile = join(run, 'home');
await mkdir(profile); await mkdir(cwd); await mkdir(userProfile);
const env: NodeJS.ProcessEnv = {};
for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP']) {
  if (process.env[key]) env[key] = process.env[key];
}
Object.assign(env, { USERPROFILE: userProfile, HOME: userProfile, PI_CODING_AGENT_DIR: profile,
  PI_TELEMETRY: '0', PI_OFFLINE: '1', NO_COLOR: '1' });
const logs: { label: string; args: string[]; status: number | null; stdout: string; stderr: string }[] = [];
function command(label: string, args: string[], expected = 0) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: 'utf8', timeout: 60_000 });
  logs.push({ label, args, status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' });
  assert.ifError(result.error);
  assert.equal(result.status, expected, `${label}: ${result.stderr}`);
  return result.stdout;
}
async function asyncCommand(label: string, args: string[], expected = 0) {
  const child = spawn(process.execPath, [cli, ...args], { cwd, env });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const timer = setTimeout(() => child.kill(), 45_000);
  try {
    const status = await new Promise<number | null>((resolve, reject) => {
      child.on('error', reject); child.on('exit', resolve);
    });
    logs.push({ label, args, status, stdout, stderr });
    assert.equal(status, expected, `${label}: ${stderr}`);
    return stdout;
  } finally { clearTimeout(timer); }
}
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const preservedPaths = [
  ...(process.env.APPDATA ? [join(process.env.APPDATA, 'npm/pi.ps1'), join(process.env.APPDATA, 'npm/pi.cmd')] : []),
  ...(process.env.USERPROFILE ? [join(process.env.USERPROFILE, '.pi/agent/settings.json')] : []),
];
async function preserved() {
  return Promise.all(preservedPaths.map(async path => ({ path, sha256: await readFile(path).then(hash).catch(e => {
    if (e.code === 'ENOENT') return null;
    throw e;
  }) })));
}
const before = await preserved();
const evidence: Record<string, unknown> = {
  host: `${manifest.name}@${manifest.version}`, node: process.version, run,
  isolation: { profile, cwd, userProfile, inheritedEnvironmentKeys: Object.keys(env), credentialCopy: false },
  modelInferenceRequests: 0, publicOAuth: 'not attempted', humanAcceptance: 'pending',
  limits: ['RPC discovery is not interactive TUI phase-sync acceptance.',
    'Loopback MCP fixture is not public Guilduo OAuth or real Quest persistence.',
    'Local package update reconciles a directory reference; it is not a registry release upgrade.'],
};
async function rpc(label: string) {
  const child = spawn(process.execPath, [cli, '--mode', 'rpc', '--no-mcp', '--no-context-files', '--no-approve'],
    { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  const records: Record<string, unknown>[] = [];
  let buffer = ''; let stderr = '';
  const pending = new Map<string, (record: Record<string, unknown>) => void>();
  const failure = new Promise<never>((_, reject) => {
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`RPC exited (${code}): ${stderr}`)));
  });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let end: number;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      const record = JSON.parse(line) as Record<string, unknown>;
      records.push(record);
      if (record.type === 'response') pending.get(String(record.id))?.(record);
    }
  });
  let sequence = 0;
  async function send(type: string, data: object = {}) {
    const id = `${label}-${++sequence}`;
    let timer: ReturnType<typeof setTimeout>;
    try {
      const response = await Promise.race([
        new Promise<Record<string, unknown>>(resolve => {
          pending.set(id, resolve); child.stdin.write(JSON.stringify({ id, type, ...data }) + '\n');
        }), failure, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('RPC timeout')), 45_000); }),
      ]);
      assert.equal(response.success, true, JSON.stringify(response));
      return response.data as Record<string, unknown>;
    } finally { clearTimeout(timer!); pending.delete(id); }
  }
  return { send, async close() {
    child.stdin.end();
    await Promise.race([new Promise<void>(resolve => child.once('exit', () => resolve())),
      new Promise<void>(resolve => setTimeout(() => { child.kill(); resolve(); }, 3000).unref())]);
    await writeFile(join(run, `${label}-rpc.json`), JSON.stringify({ records, stderr }, null, 2));
    assert.ok(!records.some(record => ['agent_start', 'message_start', 'turn_start'].includes(String(record.type))),
      'Unexpected inference/run event');
  } };
}
try {
  assert.equal(command('version', ['--version']).trim(), '1.0.4');
  const apiCheck = join(run, 'native-api.mts');
  const importPath = (path: string) => relative(run, path).replaceAll('\\', '/');
  await writeFile(apiCheck, `import type { ExtensionFactory } from ${JSON.stringify(importPath(join(host, 'dist/core/extensions/types.js')))};\n`
    + `import phaseSync from ${JSON.stringify(importPath(join(root, 'plugins/questforge/pi/phase-sync.ts')))};\n`
    + 'const extension: ExtensionFactory = phaseSync;\nvoid extension;\n');
  const typecheck = spawnSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--ignoreConfig',
    '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'ESNext',
    '--moduleResolution', 'Bundler', '--allowImportingTsExtensions', '--types', 'node', apiCheck],
  { cwd: root, env, encoding: 'utf8', timeout: 30_000 });
  assert.ifError(typecheck.error); assert.equal(typecheck.status, 0, typecheck.stdout + typecheck.stderr);
  evidence.nativeApiTypecheck = { path: apiCheck, status: typecheck.status, skipLibCheck: true };
  const packageDir = join(root, '.qa-artifacts/guilduo-plugin-pi-hooks');
  const validationBytes = await readFile(join(packageDir, 'validation.json'));
  const validation = JSON.parse(validationBytes.toString()) as {
    target: string; hooks: boolean; version: string; files: { path: string; sha256: string }[];
  };
  assert.equal(validation.target, 'pi'); assert.equal(validation.hooks, true);
  assert.match(validation.version, /^[0-9A-Za-z.-]+$/);
  const expected = new Map(validation.files.map(file => [file.path, file.sha256]));
  assert.equal(expected.size, validation.files.length);
  for (const [path, sha256] of expected) {
    assert.ok(path.split('/').every(part => /^[A-Za-z0-9_.-]+$/.test(part) && !['.', '..'].includes(part)),
      'Unsafe generated package path');
    assert.match(sha256, /^[a-f0-9]{64}$/);
  }
  assert.ok(expected.has('extensions/phase-sync.ts'));
  const tgz = join(packageDir, `guilduo-workflows-${validation.version}.tgz`);
  const bytes = await readFile(tgz);
  const reportPath = join(root, '.qa-artifacts/guilduo-plugin-packages.json');
  const reportBytes = await readFile(reportPath);
  const report = JSON.parse(reportBytes.toString()) as { packages: {
    target: string; hooks: boolean; submission: boolean; path: string; sha256: string; files: number; bytes: number;
  }[] };
  const releases = report.packages.filter(item => item.target === 'pi' && item.hooks && !item.submission);
  assert.equal(releases.length, 1, 'Expected one authoritative Pi hooks release');
  const release = releases[0]!;
  assert.equal(resolve(release.path), tgz); assert.equal(release.sha256, hash(bytes), 'Release report archive hash mismatch');
  assert.equal(release.bytes, bytes.length); assert.equal(release.files, expected.size);
  // Snapshot exactly the generated release, including its manifest. Never patch/repack it.
  const candidate = join(run, 'release.tgz');
  await writeFile(candidate, bytes); await writeFile(join(run, 'validation.json'), validationBytes);
  await writeFile(join(run, 'package-report.json'), reportBytes);
  const unpacked = join(run, 'unpacked'); await mkdir(unpacked);
  const listing = spawnSync('tar', ['-tzf', candidate], { env, encoding: 'utf8', timeout: 30_000 });
  assert.ifError(listing.error); assert.equal(listing.status, 0, listing.stderr);
  const archiveFiles = listing.stdout.trim().split(/\r?\n/).sort();
  assert.deepEqual(archiveFiles, [...expected.keys()].map(path => `package/${path}`).sort());
  const types = spawnSync('tar', ['-tvzf', candidate], { env, encoding: 'utf8', timeout: 30_000 });
  assert.ifError(types.error); assert.equal(types.status, 0, types.stderr);
  assert.ok(types.stdout.trim().split(/\r?\n/).every(line => line.startsWith('-')), 'Release contains linked/non-file entries');
  const unpack = spawnSync('tar', ['-xzf', candidate, '-C', unpacked], { env, encoding: 'utf8', timeout: 30_000 });
  assert.ifError(unpack.error); assert.equal(unpack.status, 0, unpack.stderr);
  const source = join(unpacked, 'package');
  const extension = await readFile(join(root, 'plugins/questforge/pi/phase-sync.ts'));
  async function verifyFiles(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      assert.ok(!entry.isSymbolicLink(), 'Linked release file');
      if (entry.isDirectory()) await verifyFiles(path);
      else {
        assert.ok(entry.isFile(), 'Non-file release entry');
        const key = relative(source, path).replaceAll('\\', '/');
        assert.equal(hash(await readFile(path)), expected.get(key), `Generated manifest mismatch: ${key}`);
      }
    }
  }
  await verifyFiles(source);
  const packagedExtensionHash = hash(await readFile(join(source, 'extensions/phase-sync.ts')));
  assert.equal(hash(await readFile(candidate)), hash(bytes), 'Release snapshot bytes changed');
  evidence.package = { original: { path: tgz, sha256: hash(bytes) },
    candidate: { path: candidate, sha256: hash(await readFile(candidate)), extensionSha256: packagedExtensionHash },
    canonicalExtensionSha256: hash(extension),
    authoritativeReport: { path: reportPath, sha256: hash(reportBytes), archiveHashVerified: true },
    generatedManifestHash: hash(validationBytes), manifestFilesChecked: expected.size, modified: false,
    manifest: JSON.parse(await readFile(join(source, 'package.json'), 'utf8')) };
  assert.equal(packagedExtensionHash, hash(extension),
    'Generated Pi release is stale: parent must repack the current canonical extension. Nothing was patched.');
  const engine = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--native-engine', source, run],
    { cwd, env, encoding: 'utf8', timeout: 45_000 });
  await writeFile(join(run, 'native-engine.log'), engine.stdout + engine.stderr);
  assert.ifError(engine.error); assert.equal(engine.status, 0, engine.stdout + engine.stderr);
  evidence.nativeEngine = JSON.parse(await readFile(join(run, 'native-engine.json'), 'utf8'));
  command('install', ['install', source]);
  assert.ok(command('list-installed', ['list']).includes('unpacked'));
  let client = await rpc('installed');
  try {
    const data = await client.send('get_commands');
    const commands = data.commands as { name: string; source: string; sourceInfo: { path: string } }[];
    assert.ok(commands.every(c => c.sourceInfo.path.startsWith('builtin:') || c.sourceInfo.path.startsWith(source)),
      'Resources escaped isolated profile/package');
    assert.ok(commands.some(c => c.name === 'guilduo-sync' && c.source === 'extension'));
    assert.ok(commands.some(c => c.name === 'skill:guilduo-workflows' && c.source === 'skill'));
    assert.ok(!commands.some(c => c.name === 'skill:questforge-workflows'), 'Host still discovers the legacy Skill');
    // Extension slash commands are handled by Pi without starting an agent run.
    const handled = await client.send('prompt', { message: '/guilduo-sync off' });
    assert.equal(handled.disposition, 'handled');
    const state = await client.send('get_state');
    const denied = await client.send('prompt', { message: `/guilduo-sync bind ${JSON.stringify([
      state.sessionId, 'quest-local-fixture', 'agent-local-fixture', cwd])}` });
    assert.equal(denied.disposition, 'handled');
    const entries = await client.send('get_entries');
    assert.ok(!JSON.stringify(entries).includes('quest-local-fixture'), 'RPC mode accepted a binding');
    evidence.rpcBindingRejected = true;
    evidence.cliDiscovery = data;
  } finally { await client.close(); }
  command('update-local', ['update', '--extensions']);
  const settingsPath = join(profile, 'settings.json');
  const settings = JSON.parse(await readFile(settingsPath, 'utf8'));
  const installed = settings.packages[0];
  settings.packages = [{ source: typeof installed === 'string' ? installed : installed.source, extensions: [], skills: [] }];
  await writeFile(settingsPath, JSON.stringify(settings, null, 2));
  client = await rpc('disabled');
  try {
    const data = await client.send('get_commands');
    const commands = data.commands as { name: string }[];
    assert.ok(!commands.some(c => ['guilduo-sync', 'skill:guilduo-workflows'].includes(c.name)));
    evidence.disabledDiscovery = data;
  } finally { await client.close(); }
  command('remove', ['remove', source]);
  assert.deepEqual(JSON.parse(await readFile(settingsPath, 'utf8')).packages, []);
  evidence.removal = command('list-removed', ['list']);
  // Genuine CLI transport/discovery against a deliberately unauthenticated local fixture.
  const methods: string[] = [];
  const metadataRequests: string[] = [];
  let origin = '';
  const server = createServer(async (req, res) => {
    if (req.method === 'GET') {
      metadataRequests.push(req.url ?? '');
      const document = req.url === '/.well-known/oauth-protected-resource/protected'
        ? { resource: `${origin}/protected`, authorization_servers: [origin] }
        : req.url === '/.well-known/oauth-authorization-server'
          ? { issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`,
            response_types_supported: ['code'], code_challenge_methods_supported: ['S256'] } : undefined;
      res.writeHead(document ? 200 : 404, { 'content-type': 'application/json' }).end(JSON.stringify(document)); return;
    }
    if (req.url === '/protected') {
      res.writeHead(401, { 'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/protected"` }).end(); return;
    }
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    const message = JSON.parse(body); methods.push(message.method);
    if (!('id' in message)) { res.writeHead(202).end(); return; }
    const result = message.method === 'initialize'
      ? { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'local-guilduo-pi-fixture', version: '1' } }
      : message.method === 'tools/list' ? { tools: [{ name: 'get_current_agent_context', description: 'Local fixture only', inputSchema: { type: 'object', properties: {} } }] } : {};
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    origin = `http://127.0.0.1:${address.port}`;
    command('mcp-add-loopback', ['mcp', 'add', 'guilduo_local_fixture', '--url', `http://127.0.0.1:${address.port}/mcp`]);
    const discovery = JSON.parse(await asyncCommand('mcp-list-loopback', ['mcp', 'list', '--json']));
    assert.ok(methods.includes('initialize') && methods.includes('tools/list'));
    assert.ok(JSON.stringify(discovery).includes('get_current_agent_context'));
    assert.ok(!methods.includes('tools/call'));
    evidence.localMcpDiscovery = { discovery, methods };
    command('mcp-remove-loopback', ['mcp', 'remove', 'guilduo_local_fixture']);
    command('mcp-add-auth-fixture', ['mcp', 'add', 'guilduo_auth_fixture', '--url', `${origin}/protected`]);
    const auth = JSON.parse(await asyncCommand('mcp-list-auth-fixture', ['mcp', 'list', '--json'], 1));
    assert.equal(auth.servers[0].state, 'needs-auth');
    assert.deepEqual(auth.errors, []);
    const discoveryApi = await import(pathToFileURL(join(artifacts,
      'runtime/node_modules/@earendil-works/pi-mcp/dist/oauth/discovery.js')).href);
    const metadata = await discoveryApi.discoverOAuthServerInfo(`${origin}/protected`);
    assert.equal(metadata.authorizationServerUrl, origin);
    assert.equal(metadata.resourceMetadata.resource, `${origin}/protected`);
    assert.equal(metadata.authorizationServerMetadata.issuer, origin);
    evidence.localOAuthMetadata = { auth, metadata, requests: metadataRequests, login: 'not attempted' };
    command('mcp-remove-auth-fixture', ['mcp', 'remove', 'guilduo_auth_fixture']);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  assert.deepEqual(await preserved(), before);
  await verifyFiles(source);
  evidence.preservedUserFiles = before;
  evidence.checks = 'passed';
} catch (error) {
  evidence.checks = 'failed'; evidence.error = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  await writeFile(join(run, 'cli.json'), JSON.stringify(logs, null, 2));
  await writeFile(join(run, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(join(run, 'evidence.json'));
}

async function verifyNativeEngine(sourceArg: string, runArg: string) {
  // Bounded structural view of the native APIs used by this offline fixture.
  interface NativeEntry {
    type: string;
    customType?: string;
    data?: unknown;
    content?: unknown;
  }
  interface NativeSessionManager {
    getBranch(): NativeEntry[];
    getSessionId(): string;
    getSessionFile(): string | undefined;
    getLeafId(): string | null;
    createBranchedSession(leafId: string): string | undefined;
    buildSessionProjection(): { entries: unknown[]; messages: unknown[] };
  }
  interface NativeBoundaryPreview {
    contextEntries: unknown[];
    contextMessages: unknown[];
    llmMessages: { role: string }[];
    pendingMessages: unknown[];
    canContinue: boolean;
  }
  interface NativeSession {
    sessionId: string;
    isIdle: boolean;
    sessionManager: NativeSessionManager;
    prompt(text: string, options?: { source: 'interactive' | 'rpc' | 'extension' }): Promise<void>;
    subscribe(listener: (event: { type: string }) => void): () => void;
    bindExtensions(bindings: { mode: 'tui' | 'rpc' | 'print'; onError?: (error: unknown) => void }): Promise<void>;
    reload(): Promise<void>;
    dispose(): void;
    extensionRunner: {
      hasHandlers(name: string): boolean;
      emitInput(text: string, images: undefined, source: 'interactive'): Promise<unknown>;
      emitBoundary(event: { type: 'agent_before_settle'; outcome: 'completed' },
        buildContext: (entries: unknown[]) => NativeBoundaryPreview): Promise<{
          entries: unknown[]; continue: boolean; valid: boolean;
        }>;
    };
  }
  assert.ok(sourceArg && runArg, 'Supply the verified unpacked release and a fresh isolated run directory.');
  const source = await realpath(resolve(sourceArg));
  const run = await realpath(resolve(runArg));
  for (const target of [source, run, process.cwd(), process.env.PI_CODING_AGENT_DIR!, process.env.USERPROFILE!]) {
    assert.ok(target && !isAbsolute(relative(artifacts, target)) && !relative(artifacts, target).startsWith('..'),
      'Native check must remain inside owned QA artifacts');
  }
  assert.equal(process.env.PI_OFFLINE, '1');
  assert.ok(!Object.keys(process.env).some(key => /(?:API_KEY|TOKEN|SECRET|CREDENTIAL)/i.test(key)));
  const native = (path: string) => import(pathToFileURL(join(host, 'dist/core', path)).href);
  const [{ createAgentSession }, { ModelRuntime }, { SettingsManager }, { DefaultResourceLoader },
    { SessionManager }, { ProjectTrustStore }, { resolveProjectTrusted }, { convertToLlm }] =
    await Promise.all(['sdk.js', 'model-runtime.js', 'settings-manager.js', 'resource-loader.js',
      'session-manager.js', 'trust-manager.js', 'project-trust.js', 'messages.js'].map(native));
  const { createAssistantMessageEventStream } = await import(pathToFileURL(join(artifacts,
    'runtime/node_modules/@earendil-works/pi-ai/dist/utils/event-stream.js')).href);
  const cwd = await realpath(process.cwd());
  const profile = process.env.PI_CODING_AGENT_DIR!;
  const extensionPath = join(source, 'extensions/phase-sync.ts');
  const extensionHash = await readFile(extensionPath);
  assert.deepEqual(extensionHash, await readFile(join(artifacts, '../../plugins/questforge/pi/phase-sync.ts')));
  // Use the native saved-decision resolver, never trustOverride or a replacement trust predicate.
  await mkdir(join(cwd, '.pi'), { recursive: true });
  await writeFile(join(cwd, '.pi/settings.json'), '{}');
  const trustStore = new ProjectTrustStore(profile);
  const trust = () => resolveProjectTrusted({ cwd, trustStore,
    projectTrustContext: { cwd, hasUI: false, ui: {} } });
  assert.equal(await trust(), false, 'Unknown project with local resources must fail closed without UI.');
  trustStore.set(cwd, false);
  assert.equal(await trust(), false);
  await writeFile(join(profile, 'settings.json'), JSON.stringify({
    compaction: { enabled: false }, retry: { enabled: false }, cacheWarming: 'off',
  }));
  const settings = SettingsManager.create(cwd, profile, { projectTrusted: await trust() });
  const models = await ModelRuntime.create({ authPath: join(profile, 'auth.json'),
    modelsPath: join(profile, 'models.json'), allowModelNetwork: false });
  const errors: unknown[] = [];
  const events: { sessionId: string; type: string }[] = [];
  let syntheticRequests = 0;
  let currentSession: NativeSession;
  const provider = 'guilduo-qa-synthetic';
  models.registerProvider(provider, {
    api: 'guilduo-qa-synthetic', baseUrl: 'http://127.0.0.1:1/never-used', apiKey: 'synthetic-fixture-only',
    models: [{ id: 'fixed', name: 'Fixed local response', input: ['text'], reasoning: false,
      contextWindow: 65536, maxTokens: 64, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
    streamSimple(model: { api: string; provider: string; id: string }) {
      assert.ok(++syntheticRequests <= 32, 'Unexpected continuation loop');
      const message = { role: 'assistant', content: [{ type: 'text', text: 'Synthetic response; no Quest writes.' }],
        api: model.api, provider: model.provider, model: model.id, stopReason: 'stop', timestamp: Date.now(),
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      const stream = createAssistantMessageEventStream();
      stream.push({ type: 'start', partial: message });
      stream.push({ type: 'done', reason: 'stop', message });
      stream.end(message);
      return stream;
    },
  });
  const model = models.getModel(provider, 'fixed'); assert.ok(model);
  const loader = new DefaultResourceLoader({ cwd, agentDir: profile, settingsManager: settings,
    noExtensions: true, additionalExtensionPaths: [extensionPath], noSkills: true,
    noPromptTemplates: true, noThemes: true, noContextFiles: true });
  const sessions: Awaited<ReturnType<typeof start>>[] = [];
  async function start(manager: NativeSessionManager, reason = 'startup'): Promise<NativeSession> {
    // Native dispose invalidates its extension runtime; a new host needs a fresh load.
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    assert.equal(loader.getExtensions().extensions.length, 1);
    const { session }: { session: NativeSession } = await createAgentSession({ cwd, agentDir: profile, settingsManager: settings,
      resourceLoader: loader, modelRuntime: models, model, tools: [], sessionManager: manager,
      sessionStartEvent: { type: 'session_start', reason } });
    sessions.push(session); currentSession = session;
    session.subscribe(event => { events.push({ sessionId: session.sessionId, type: event.type }); });
    await session.bindExtensions({ mode: 'tui', onError: (error: unknown) => errors.push(error) });
    for (const name of ['session_start', 'session_tree', 'input', 'agent_before_settle']) {
      assert.ok(session.extensionRunner.hasHandlers(name), `Missing native registration: ${name}`);
    }
    return session;
  }
  const entries = (session = currentSession) => session.sessionManager.getBranch();
  const reminders = () => entries().filter(entry =>
    entry.type === 'custom_message' && entry.customType === 'guilduo-phase-check');
  const isSyncMetadata = (entry: NativeEntry): entry is NativeEntry & { data: Record<string, unknown> } =>
    entry.type === 'custom' && entry.customType === 'guilduo-phase-sync-v1'
      && typeof entry.data === 'object' && entry.data !== null;
  const metadata = () => entries().filter(isSyncMetadata);
  const binding = () => metadata().filter(entry => entry.data.kind === 'binding').at(-1)?.data.binding;
  const bind = () => currentSession.prompt(`/guilduo-sync bind ${JSON.stringify([
    currentSession.sessionId, 'quest-native-fixture', 'agent-native-fixture', cwd])}`);
  async function turn(source: 'interactive' | 'rpc' | 'extension', expectedReminders: number) {
    const before = reminders().length; const requests = syntheticRequests;
    await currentSession.prompt('Local synthetic acceptance input.', { source });
    assert.equal(reminders().length - before, expectedReminders);
    assert.equal(syntheticRequests - requests, 1 + expectedReminders);
    assert.equal(currentSession.isIdle, true);
    assert.deepEqual(errors, []);
  }
  // Manually dispatch only suppressed boundaries; projection is from the native SessionManager.
  // Positive continuation/draft commitment is exercised by AgentSession's actual run loop above.
  async function suppressedBoundary() {
    const result = await currentSession.extensionRunner.emitBoundary({ type: 'agent_before_settle', outcome: 'completed' },
      (drafts: unknown[]) => {
        assert.deepEqual(drafts, [], 'Reload/fork restored an input budget');
        const projection = currentSession.sessionManager.buildSessionProjection();
        const llmMessages: NativeBoundaryPreview['llmMessages'] = convertToLlm(projection.messages);
        return { contextEntries: projection.entries, contextMessages: projection.messages, llmMessages,
          pendingMessages: [], canContinue: llmMessages.some(message => message.role !== 'system')
            && llmMessages.at(-1)?.role !== 'assistant' };
      });
    assert.equal(result.valid, true); assert.equal(result.continue, false); assert.deepEqual(result.entries, []);
    assert.deepEqual(errors, []);
  }
  const checks: string[] = [];
  try {
    currentSession = await start(SessionManager.create(cwd, join(run, 'native-sessions')));
    await bind(); assert.equal(binding(), null); await turn('interactive', 0);
    checks.push('unknown/denied saved trust rejects exact TUI binding and reminder');
    trustStore.set(cwd, true); assert.equal(await trust(), true); settings.setProjectTrusted(await trust());
    for (const mode of ['rpc', 'print'] as const) {
      await currentSession.bindExtensions({ mode });
      await bind(); assert.equal(binding(), null); await turn('interactive', 0);
    }
    checks.push('native rpc/print contexts reject exact binding');
    await currentSession.bindExtensions({ mode: 'tui' }); await bind(); assert.ok(binding());
    await turn('rpc', 0); await turn('extension', 0);
    await turn('interactive', 1);
    const reminder = reminders().at(-1);
    assert.ok(reminder && typeof reminder.content === 'string');
    assert.match(reminder.content, /quest-native-fixture, actingAgentId agent-native-fixture/);
    const receipt = metadata().filter(entry => entry.data.kind === 'turn').at(-1);
    assert.ok(receipt);
    assert.equal(receipt.data.state, 'consumed');
    assert.ok(entries().indexOf(receipt) < entries().indexOf(reminder));
    checks.push('interactive input commits exactly one reminder and performs exactly one native continuation; receipt precedes draft');
    await currentSession.extensionRunner.emitInput('Arm before reload', undefined, 'interactive');
    await currentSession.reload(); await suppressedBoundary(); assert.ok(binding());
    await turn('interactive', 1);
    await currentSession.reload(); await suppressedBoundary();
    await turn('extension', 0);
    checks.push('native reload preserves binding but suppresses inherited armed/consumed budgets');
    const sessionPath = currentSession.sessionManager.getSessionFile(); assert.ok(sessionPath);
    currentSession.dispose();
    await start(SessionManager.open(sessionPath, join(run, 'native-sessions')));
    await suppressedBoundary(); await turn('interactive', 1);
    checks.push('native disk reopen suppresses inherited budget while accepting a fresh interactive input');
    await currentSession.extensionRunner.emitInput('Arm before fork', undefined, 'interactive');
    const parentSessionId = currentSession.sessionId;
    const leafId = currentSession.sessionManager.getLeafId(); assert.ok(leafId);
    const forkPath = currentSession.sessionManager.createBranchedSession(leafId);
    assert.ok(forkPath); const fork: NativeSessionManager = SessionManager.open(forkPath, join(run, 'native-sessions'));
    assert.notEqual(fork.getSessionId(), parentSessionId);
    assert.ok(fork.getBranch().some(entry => isSyncMetadata(entry) && entry.data.kind === 'binding' && entry.data.binding));
    currentSession.dispose(); await start(fork, 'fork');
    await suppressedBoundary(); assert.equal(binding(), null); await turn('interactive', 0);
    await bind(); await turn('interactive', 1);
    checks.push('native branched session inherits metadata but suppresses fork reminder until exact rebind');
    settings.setProjectTrusted(false); await turn('interactive', 0); assert.equal(binding(), null);
    checks.push('trust revocation disables an existing binding');
    assert.deepEqual(errors, []);
    assert.ok(events.some(event => event.type === 'agent_settled'));
    await writeFile(join(run, 'native-engine.json'), JSON.stringify({ checks, events, syntheticRequests,
      host: '@earendil-works/pi-coding-agent@1.0.4', packagedExtension: extensionPath,
      actualNative: ['loader/registration', 'AgentSession.prompt', 'input/agent_before_settle', 'continuation/draft commit',
        'disk SessionManager reopen/fork', 'reload', 'saved project trust resolver'],
      synthetic: ['fixed local provider responses', 'engine TUI mode (no real TUI input)', 'saved isolated QA trust decisions',
        'direct suppressed-boundary dispatch after reload/reopen/fork'],
      modelInferenceRequests: 0, realQuestWrites: 0, realCredentials: false,
      humanTuiAcceptance: 'pending', publicOAuth: 'not attempted', status: 'passed' }, null, 2));
    console.log(`Native engine: ${checks.length} checks passed; ${syntheticRequests} fixed local responses, zero model inference.`);
  } finally { for (const session of sessions) session.dispose(); }

}

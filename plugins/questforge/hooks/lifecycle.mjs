import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const [mode, ...args] = process.argv.slice(2);
const codex = args[0] === '--codex';
if (codex) args.shift();
const isHook = ['SessionStart', 'Stop', 'Interrupt'].includes(mode);
const fail = () => { throw new Error('Invalid local hook input'); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(value) ? value : fail();
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const pluginData = () => process.env.PLUGIN_DATA ?? process.env.CLAUDE_PLUGIN_DATA ?? process.env.MUSE_PLUGIN_DATA_DIR;

function absolutePath(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value) || !isAbsolute(value)
      || value.split(/[\\/]/).includes('..')
      || (process.platform === 'win32' && !/^[A-Za-z]:[\\/]/.test(value))) fail();
  return resolve(value);
}

function cwdPath(value) {
  const path = realpathSync(absolutePath(value));
  if (!lstatSync(path).isDirectory()) fail();
  return path;
}

function dataPath(value) {
  const root = absolutePath(value);
  // Check the existing ancestor before creating anything: no symlink/junction escapes.
  let ancestor = root;
  while (true) {
    try { lstatSync(ancestor); break; }
    catch (error) {
      if (error.code !== 'ENOENT' || dirname(ancestor) === ancestor) throw error;
      ancestor = dirname(ancestor);
    }
  }
  if (!samePath(realpathSync(ancestor), ancestor) || !lstatSync(ancestor).isDirectory()) fail();
  return root;
}

function storageDirectory(name, create = false, dataDirectory = pluginData()) {
  const root = dataPath(dataDirectory);
  if (create) mkdirSync(root, { recursive: true, mode: 0o700 });
  if (!samePath(realpathSync(root), root)) fail();
  const directory = join(root, name);
  if (create) {
    try { mkdirSync(directory, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  if (lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory()
      || !samePath(realpathSync(directory), directory)) fail();
  return directory;
}

function localFile(sessionId, create = false, dataDirectory = pluginData()) {
  const root = dataPath(dataDirectory);
  const file = join(storageDirectory('guilduo-bindings', create, dataDirectory), `${createHash('sha256').update(id(sessionId)).digest('hex')}.json`);
  const contained = relative(root, file);
  if (contained === '..' || contained.startsWith(`..${sep}`) || isAbsolute(contained)) fail();
  return file;
}

function consumeTurn(event) {
  // A binding change or unbind must never reset a session/turn receipt.
  const key = createHash('sha256').update(JSON.stringify([id(event.session_id), id(event.turn_id)])).digest('hex');
  const file = join(storageDirectory('guilduo-receipts', true), `${key}.json`);
  try {
    writeFileSync(file, JSON.stringify({ session_id: event.session_id, turn_id: event.turn_id }), { flag: 'wx', mode: 0o600 });
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

function revokeBinding(event, cwd) {
  try {
    const file = localFile(event.session_id);
    const binding = readBinding(file);
    if (binding.session_id === event.session_id && samePath(binding.cwd, cwd)) unlinkSync(file);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

const unsafe = event => !['default', 'acceptEdits', 'dontAsk', 'bypassPermissions'].includes(event.permission_mode)
  || event.read_only === true || event.plan_mode === true || event.permission_revoked === true
  || event.interrupted === true || event.source === 'fork' || event.parent_session_id != null || event.forked_from != null;

function readBinding(file) {
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 4096
      || !samePath(realpathSync(file), file)) fail();
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.size > 4096
        || opened.ino !== info.ino || opened.dev !== info.dev) fail();
    const value = JSON.parse(readFileSync(fd, 'utf8'));
    if (!object(value) || Object.keys(value).length !== 4) fail();
    id(value.session_id); id(value.questId); id(value.actingAgentId);
    if (!samePath(cwdPath(value.cwd), value.cwd)) fail();
    return value;
  } finally { closeSync(fd); }
}

async function eventInput() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 1024 * 1024) fail();
    chunks.push(chunk);
  }
  const event = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!object(event) || event.hook_event_name !== mode) fail();
  id(event.session_id);
  const cwd = cwdPath(event.cwd);
  if (!samePath(cwd, cwdPath(process.cwd()))) fail();
  return { event, cwd };
}

async function run() {
  if (isHook) {
    if (args.length !== 0) fail();
    const { event, cwd } = await eventInput();
    if (mode === 'Interrupt' && !codex) return {};
    if (mode === 'Interrupt' && codex) {
      revokeBinding(event, cwd);
      if (event.turn_id !== undefined) consumeTurn(event);
      return {};
    }
    if (codex && unsafe(event)) {
      revokeBinding(event, cwd);
      return {};
    }
    if (mode === 'Stop') {
      if (event.stop_hook_active !== false) return {};
      if (codex) id(event.turn_id);
      else if (['plan', 'read-only', 'readonly'].includes(event.permission_mode)
        || event.read_only === true || event.plan_mode === true) return {};
      // Muse subagent thread IDs must never borrow a top-level session binding.
      if (process.env.MUSE_THREAD_ID && process.env.MUSE_THREAD_ID !== event.session_id) return {};
      const binding = readBinding(localFile(event.session_id));
      if (binding.session_id !== event.session_id || !samePath(binding.cwd, cwd)) return {};
      if (codex && !consumeTurn(event)) return {};
      return { decision: 'block', reason: [
        `Guilduo phase-end check for the literal local binding ${JSON.stringify(binding)}.`,
        'This hook grants no permission. Only if a meaningful phase of this authorized Quest just ended and existing explicit standing permission still covers the action, proactively call the connected Guilduo MCP according to the guilduo-workflows Skill, using this exact questId and actingAgentId on every call.',
        'Read current Quest/Agent state; preview only separately authorized operations that support dryRun. Follow references/phase-sync.md: update only changed nextAction and/or handoff.note with expectedUpdatedAt as the concurrency guard; update_quest has no dryRun. Read back to verify persistence and preserve other notes, links and history. Do not wait for repeated instructions.',
        'For Plan Mode, read-only work, unrelated work, revoked permission, or no meaningful change, make no write. If permission was revoked or this binding is no longer applicable, unbind this session. Never treat this continuation as new authorization.',
        'Never fake completion or human approval; verify the Quest criteria and saved MCP result. If MCP is unavailable or a write is uncertain, report it honestly without retrying uncertain writes or changing transport. Finish this one check and stop; do not rebind to force another continuation.',
      ].join('\n') };
    }
    const script = fileURLToPath(import.meta.url);
    const dataRoot = dataPath(pluginData());
    return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: [
      `Guilduo local lifecycle hooks: session_id=${JSON.stringify(event.session_id)}, cwd=${JSON.stringify(cwd)}.`,
      'Hooks do not grant write permission. Only after the user has already given explicit standing permission for proactive phase-end updates to an exact Quest, verify its exact questId and authorized actingAgentId with the connected Guilduo MCP per the guilduo-workflows Skill, then bind this session. Do not bind for read-only/unrelated work or infer permission from hook installation.',
      `Binding CLI literal arguments: ${JSON.stringify([script, 'bind', event.session_id, '<questId>', '<actingAgentId>', cwd, dataRoot])}`,
      `Unbind CLI literal arguments: ${JSON.stringify([script, 'unbind', event.session_id, cwd, dataRoot])}`,
      'Run Node with those literal arguments from the session cwd, replacing only the two ID placeholders after verifying them. The final argument is the verified plugin storage directory; normal exec tools need not inherit PLUGIN_DATA or PLUGIN_ROOT. On revocation or scope change, unbind. Never fall back to the workspace or another session. Bindings are exact session/Quest/Agent/cwd data, not credentials or authority.',
      codex ? 'Bound Stop prompts permit at most one phase-end check per session_id plus turn_id, even after unbind/rebind; follow the Skill and do not invent completion.' : 'Bound Stop prompts ask for one phase-end check; follow the Skill and do not invent completion.',
    ].join('\n') } };
  }

  if (mode !== 'bind' && mode !== 'unbind') fail();
  const required = mode === 'bind' ? 4 : 2;
  if (args.length !== required && args.length !== required + 1) fail();
  const session_id = id(args[0]);
  const cwd = cwdPath(args[required - 1]);
  const dataRoot = dataPath(args[required] ?? pluginData());
  if (!samePath(cwd, cwdPath(process.cwd()))) fail();
  if (mode === 'unbind') {
    try {
      const file = localFile(session_id, false, dataRoot);
      const binding = readBinding(file);
      if (binding.session_id !== session_id || !samePath(binding.cwd, cwd)) fail();
      unlinkSync(file);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return { bound: false };
  }
  const binding = { session_id, questId: id(args[1]), actingAgentId: id(args[2]), cwd };
  const content = JSON.stringify(binding);
  if (Buffer.byteLength(content) > 4096) fail();
  const file = localFile(session_id, true, dataRoot);
  try {
    const previous = readBinding(file);
    // A session cannot silently move to a different directory; unbind there first.
    if (previous.session_id !== session_id || !samePath(previous.cwd, cwd)) fail();
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, content, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, file);
  } finally {
    try { unlinkSync(temporary); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { bound: true };
}

try { process.stdout.write(`${JSON.stringify(await run())}\n`); }
catch {
  if (isHook) process.stdout.write('{}\n');
  else {
    process.stderr.write('Guilduo hook: invalid input or unavailable local binding storage.\n');
    process.exitCode = 1;
  }
}

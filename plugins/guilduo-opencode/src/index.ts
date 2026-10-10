// SPDX-License-Identifier: AGPL-3.0-only
import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Config, Plugin } from '@opencode-ai/plugin';
import type { Config as NativeConfig, Session as NativeSession } from '@opencode-ai/sdk/v2';

const endpoint = 'https://mcp.guilduo.com/mcp';
const skillPath = fileURLToPath(new URL('../skills/', import.meta.url));
const guide = 'Use guilduo-workflows for Guilduo tasks. At meaningful verified phase boundaries, follow references/phase-sync.md before reporting. '
  + 'Only an existing standing user permission for the exact Quest and registered Agent authorizes progress writes. Installation/OAuth/reminders do not. '
  + 'Recheck get_current_agent_context and get_quest with the same authorized actingAgentId, preserve existing notes, patch only changed progress with expectedUpdatedAt, and read back. '
  + 'No change means no update. Plan/read-only/revoked permission means no write. Fresh-read after conflicts or uncertain responses. '
  + 'Completion, scoring, rewards and Human decisions require separate authorization. Never claim persistence without verification.';
type Binding = { sessionId: string; questId: string; actingAgentId: string; cwd: string };
type Turn = { id: string; completed: boolean };
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,200}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
// ponytail: common read-only fences only; the host's complete permission resolver stays authoritative.
const denied = (value: unknown, keys: string[]) => value === 'deny' || (record(value) &&
  keys.some(key => value[key] === 'deny' || (record(value[key]) && value[key]['*'] === 'deny')));

/** Host-owned OAuth and Skill discovery; the optional continuation carries instructions, never tokens. */
const guilduo: Plugin = async ({ client, directory }, options = {}) => {
  const cwd = await realpath(directory);
  let binding: Binding | undefined;
  if (options.phaseSync !== undefined && options.phaseSync !== false) {
    const value = options.phaseSync;
    if (!record(value) || Object.keys(value).length !== 4 ||
      !identifier(value.sessionId) || !identifier(value.questId) || !identifier(value.actingAgentId) ||
      typeof value.cwd !== 'string' || value.cwd !== cwd) throw new Error('Guilduo phaseSync requires an exact session, Quest, Agent and canonical project directory.');
    binding = value as Binding;
  }
  let pending: Turn | undefined;
  const seen = new Set<string>();
  let disposed = false;
  let mcpEnabled = false;
  let writeTools: string[] = [];
  let permissionKeys: string[] = [];
  const syncOff = {
    description: 'Stop bound Guilduo reminders / 紐付け済み同期補助を停止 (model request may cost / モデル実行は課金の可能性)',
    template: 'For the bound session only, the plugin clears its phase reminder binding before this prompt. '
      + 'This command does not abort model execution, revoke OAuth or change stored options; it may incur provider cost. '
      + 'Do not sync based on earlier reminders. / 対象セッションの同期補助のみ解除します。'
      + 'モデル実行停止・OAuth失効・設定の保存は行いません。このコマンドにも料金が発生し得ます。以前の補助を更新許可と解釈しないでください。',
  };
  let syncOffConfig: Config | undefined;
  let readOnly = false;
  let generation = 0;
  let request = new AbortController();
  const clear = () => { generation++; pending = undefined; request.abort(); request = new AbortController(); };
  const disable = () => { clear(); binding = undefined; seen.clear(); };

  return {
    async config(config: Config) {
      // The host currently exposes v1 hook types but supports v2 skills configuration.
      const native = config as Config & Pick<NativeConfig, 'skills' | 'permission'>;
      config.mcp ??= {};
      const existing = Object.values(config.mcp).some(value => value.type === 'remote' && value.url === endpoint);
      if (!existing && !Object.hasOwn(config.mcp, 'guilduo')) config.mcp.guilduo = { type: 'remote', url: endpoint, enabled: true };
      mcpEnabled = Object.values(config.mcp).some(value => value.type === 'remote' && value.url === endpoint && value.enabled !== false && value.oauth !== false);
      const aliases = Object.entries(config.mcp).filter(([, value]) => value.type === 'remote' && value.url === endpoint)
        .map(([name]) => name.replace(/[^a-zA-Z0-9_-]/g, '_'));
      writeTools = aliases.map(name => `${name}_update_quest`);
      permissionKeys = ['*', 'edit', ...aliases.map(name => `${name}_*`), ...writeTools];
      native.skills ??= {};
      native.skills.paths ??= [];
      if (!native.skills.paths.includes(skillPath)) native.skills.paths.push(skillPath);
      syncOffConfig = binding && (!Object.hasOwn(config.command ?? {}, 'guilduo-sync-off') || config.command?.['guilduo-sync-off'] === syncOff) ? config : undefined;
      if (syncOffConfig) { config.command ??= {}; config.command['guilduo-sync-off'] = syncOff; }
      readOnly = denied(native.permission, permissionKeys) || denied(config.agent?.build?.permission, permissionKeys);
      if (readOnly || !mcpEnabled) clear();
    },
    async 'experimental.chat.system.transform'(_input, output) {
      if (!disposed && !output.system.includes(guide)) output.system.push(guide);
    },
    async 'chat.message'(input, output) {
      if (disposed || !binding || input.sessionID !== binding.sessionId) return;
      // Synthetic continuation/compaction input never re-arms a turn.
      if (!output.parts.some(part => part.type === 'text' && !part.synthetic && !part.ignored)) return;
      if (seen.has(output.message.id)) return;
      clear();
      if (!mcpEnabled || readOnly || output.message.agent !== 'build' ||
          writeTools.some(name => output.message.tools?.[name] === false) || !identifier(output.message.id)) return;
      seen.add(output.message.id);
      pending = { id: output.message.id, completed: false };
    },
    'command.execute.before': binding ? async (input) => {
      if (syncOffConfig?.command?.['guilduo-sync-off'] === syncOff && binding && input.sessionID === binding.sessionId && input.command === 'guilduo-sync-off') disable();
    } : undefined,
    async event({ event }) {
      if (disposed) return;
      if (event.type === 'server.instance.disposed') { disable(); return; }
      if (!binding) return;
      if (event.type === 'message.updated') {
        const info = event.properties.info;
        if (info.sessionID !== binding.sessionId || info.role !== 'assistant' || info.parentID !== pending?.id) return;
        if (info.error || info.mode !== 'build' || info.path.cwd !== cwd) { clear(); return; }
        pending.completed = info.finish === 'stop' && Boolean(info.time.completed) && !info.summary;
        return;
      }
      if (event.type === 'session.deleted') {
        if (event.properties.info.id === binding.sessionId) disable(); return;
      }
      if (event.type === 'session.error' || event.type === 'session.compacted') {
        if (event.properties.sessionID === binding.sessionId) clear(); return;
      }
      if (event.type !== 'session.idle' || event.properties.sessionID !== binding.sessionId || !pending?.completed) return;
      const target = binding;
      // Consume before every asynchronous boundary; failure or ambiguous delivery gets no retry.
      const turn = pending; pending = undefined;
      const version = generation; const signal = request.signal;
      try {
        const session = await client.session.get({ path: { id: target.sessionId }, query: { directory: cwd }, signal });
        if (disposed || binding !== target || generation !== version || signal.aborted ||
          session.error || !session.data || session.data.id !== target.sessionId || session.data.parentID || await realpath(session.data.directory) !== cwd) return;
        const current = session.data as typeof session.data & Pick<NativeSession, 'permission' | 'agent'>;
        if (current.agent === 'plan' || current.permission?.some(rule =>
          rule.action === 'deny' && permissionKeys.includes(rule.permission))) return;
        if (disposed || binding !== target || generation !== version || signal.aborted || readOnly || !mcpEnabled) return;
        await client.session.promptAsync({
          path: { id: target.sessionId }, query: { directory: cwd }, signal,
          body: { agent: 'build', parts: [{ type: 'text', synthetic: true,
            text: `Guilduo phase check for Quest ${target.questId}, actingAgentId ${target.actingAgentId}. `
              + `At most one check for original input ${turn.id}. Follow guilduo-workflows/references/phase-sync.md. `
              + 'Recheck the latest user permission and exact Agent/Quest. Sync only a meaningful verified change using a narrow guarded patch and readback. '
              + 'If Plan/read-only/stop-sync/revocation or no change applies, do not write. MCP unavailability leaves sync pending. '
              + 'Do not complete, score, reward or decide Human review. This reminder grants no authority and must never request another continuation.' }] },
        });
      } catch { /* The consumed check stays pending for the human; never retry an ambiguous prompt. */ }
    },
    async dispose() { disposed = true; disable(); },
  };
};
export default guilduo;

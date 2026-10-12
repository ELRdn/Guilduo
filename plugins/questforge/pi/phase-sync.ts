import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';

// Structural subset of Pi 1.0.4's native API. No runtime SDK import or root dependency.
// https://github.com/earendil-works/pi/blob/v1.0.4/packages/coding-agent/src/core/extensions/types.ts
export interface SyncContext {
  mode: string;
  cwd: string;
  signal?: AbortSignal;
  isIdle(): boolean;
  isProjectTrusted(): boolean;
  sessionManager: {
    getSessionId(): string;
    getBranch(): readonly { type: string; customType?: string; data?: unknown }[];
  };
  ui: { notify(message: string, type?: 'info' | 'warning' | 'error'): void };
}

interface Draft {
  type: 'custom_message';
  customType: string;
  content: string;
  display: boolean;
}

interface Events {
  session_start: { reason: 'startup' | 'reload' | 'new' | 'resume' | 'fork' };
  session_tree: unknown;
  input: { source: 'interactive' | 'rpc' | 'extension' };
  agent_before_settle: { outcome: 'completed' | 'aborted' | 'error'; entries: unknown[] };
}

export interface SyncAPI {
  on(event: 'session_start', handler: (event: Events['session_start'], ctx: SyncContext) => void): unknown;
  on(event: 'session_tree', handler: (event: Events['session_tree'], ctx: SyncContext) => void): unknown;
  on(event: 'input', handler: (event: Events['input'], ctx: SyncContext) => void): unknown;
  on(event: 'agent_before_settle', handler: (event: Events['agent_before_settle'], ctx: SyncContext) =>
    void | { continue: true }): unknown;
  registerCommand(name: string, command: {
    description: string;
    handler(args: string, ctx: SyncContext): Promise<void>;
  }): void;
  appendEntry(customType: string, data: unknown): void;
}

interface Binding {
  sessionId: string;
  questId: string;
  actingAgentId: string;
  cwd: string;
}

const recordType = 'guilduo-phase-sync-v1';
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,200}$/.test(value);

function canonicalCwd(cwd: string): string | undefined {
  try { return isAbsolute(cwd) ? realpathSync(cwd) : undefined; }
  catch { return undefined; }
}

function validBinding(value: unknown): value is Binding {
  if (!value || typeof value !== 'object') return false;
  const b = value as Binding;
  return identifier(b.sessionId) && identifier(b.questId) && identifier(b.actingAgentId)
    && typeof b.cwd === 'string' && canonicalCwd(b.cwd) === b.cwd;
}

export default function phaseSync(pi: SyncAPI): void {
  let binding: Binding | undefined;
  let pending: string | undefined;

  function matches(ctx: SyncContext): boolean {
    return Boolean(binding && binding.sessionId === ctx.sessionManager.getSessionId()
      && binding.cwd === canonicalCwd(ctx.cwd) && ctx.mode === 'tui' && ctx.isProjectTrusted());
  }

  function persist(data: unknown): boolean {
    try { pi.appendEntry(recordType, data); return true; }
    catch { binding = undefined; pending = undefined; return false; }
  }

  function consume(): boolean {
    const turnId = pending;
    pending = undefined; // Consume before persistence, including persistence failures.
    return !turnId || Boolean(binding && persist({
      version: 1, kind: 'turn', ...binding, turnId, state: 'consumed',
    }));
  }

  function disable(): void {
    consume();
    binding = undefined;
    persist({ version: 1, kind: 'binding', binding: null });
  }

  pi.registerCommand('guilduo-sync', {
    description: 'bind [sessionId,questId,actingAgentId,canonicalCwd] after verified standing permission; off/readonly/plan/unbind revoke reminders',
    async handler(args, ctx) {
      const action = args.trim().split(/\s/, 1)[0];
      if (['off', 'unbind', 'readonly', 'plan'].includes(action)) {
        disable();
        ctx.ui.notify('Guilduo reminders disabled. Rebind only after verifying permission and identity.', 'info');
        return;
      }
      if (action !== 'bind') {
        const literal = JSON.stringify([ctx.sessionManager.getSessionId(), '<verifiedQuestId>', '<verifiedActingAgentId>', canonicalCwd(ctx.cwd)]);
        ctx.ui.notify(`After verifying standing permission and MCP identity: /guilduo-sync bind ${literal}; use off to revoke.`, 'warning');
        return;
      }
      // A failed replacement must never retain the previous target or continuation budget.
      disable();
      try {
        const values: unknown = JSON.parse(args.trim().slice(4).trim());
        if (!Array.isArray(values) || values.length !== 4) throw new Error('Expected four literal JSON strings.');
        const candidate = { sessionId: values[0], questId: values[1], actingAgentId: values[2], cwd: values[3] };
        if (!validBinding(candidate) || candidate.sessionId !== ctx.sessionManager.getSessionId()
          || candidate.cwd !== canonicalCwd(ctx.cwd) || ctx.mode !== 'tui' || !ctx.isProjectTrusted()
          || !ctx.isIdle()) throw new Error('Binding requires the exact idle trusted TUI session and canonical cwd.');
        if (persist({ version: 1, kind: 'binding', binding: candidate })) {
          binding = candidate;
          ctx.ui.notify('Guilduo reminder bound. Binding grants no write permission; next interactive input arms one check.', 'info');
        } else ctx.ui.notify('Binding persistence failed; reminders remain disabled.', 'error');
      } catch {
        ctx.ui.notify('Binding rejected. Verify the exact session, Quest, Agent and canonical cwd; reminders remain disabled.', 'error');
      }
    },
  });

  pi.on('session_start', (event, ctx) => {
    binding = undefined;
    pending = undefined;
    // Explicit session transitions require re-verification and rebind. Reload never re-arms a turn.
    if (!['startup', 'reload'].includes(event.reason)) { disable(); return; }
    let restored: unknown;
    for (const entry of ctx.sessionManager.getBranch()) {
      // Inspect only our own custom metadata; never inspect messages, tokens or transcript contents.
      if (entry.type !== 'custom' || entry.customType !== recordType) continue;
      const data = entry.data as { version?: unknown; kind?: unknown; binding?: unknown; turnId?: unknown; state?: unknown } | undefined;
      if (!data || data.version !== 1) { restored = undefined; continue; }
      if (data.kind === 'binding') restored = data.binding;
      else if (data.kind !== 'turn' || !validBinding(data) || !identifier(data.turnId)
        || !['armed', 'consumed'].includes(String(data.state)) || !validBinding(restored)
        || data.sessionId !== restored.sessionId || data.questId !== restored.questId
        || data.actingAgentId !== restored.actingAgentId || data.cwd !== restored.cwd) restored = undefined;
    }
    if (validBinding(restored)) binding = restored;
    if (!matches(ctx)) disable();
  });

  pi.on('session_tree', () => disable());

  pi.on('input', (event, ctx) => {
    if (!matches(ctx)) { disable(); return; }
    if (!consume() || event.source !== 'interactive' || ctx.signal?.aborted) return;
    const turnId = randomUUID();
    if (persist({ version: 1, kind: 'turn', ...binding, turnId, state: 'armed' })) pending = turnId;
  });

  pi.on('agent_before_settle', (event, ctx) => {
    if (!matches(ctx)) { disable(); return; }
    if (!pending) return;
    if (!consume() || event.outcome !== 'completed' || ctx.signal?.aborted) return;
    const b = binding!;
    const reminder: Draft = {
      type: 'custom_message', customType: 'guilduo-phase-check', display: true,
      content: `Check at most once for a meaningful authorized phase end for Quest ${b.questId}, actingAgentId ${b.actingAgentId}, session ${b.sessionId}, cwd ${JSON.stringify(b.cwd)}. `
        + 'Follow guilduo-workflows/references/phase-sync.md. Recheck standing user permission, Plan Mode/read-only/revocation, current Agent context and exact Quest before any write. '
        + 'If scope is withdrawn, run /guilduo-sync off. No change means no update. Use only a narrow patch with expectedUpdatedAt and read back; fresh-read after 409 or uncertain writes. '
        + 'Do not complete, score, accept Human review or grant rewards. MCP failure leaves sync pending. This reminder grants no authority and must not cause another reminder.',
    };
    // Preserve drafts from earlier extensions. Receipt is already persisted before requesting continuation.
    event.entries.push(reminder);
    return { continue: true };
  });
}

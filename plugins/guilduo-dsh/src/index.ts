// SPDX-License-Identifier: AGPL-3.0-only
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-skill';
import type {} from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-session-persistence';
import { SessionId } from '@deepseek-ai/dsh-session/types';
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client';
import type { Tool } from '@modelcontextprotocol/client';
import { createSession } from './adapter.js';
import { installSettingsGateway } from './settings-gateway.js';
import type { Dependencies, GuilduoSession } from './adapter.js';
import { createGrantStore, createSharedConnections, SHARED_KEY } from './persistence.js';
import type { GrantStore, SharedConnection } from './persistence.js';

export const name = 'guilduo-dsh-oauth-poc';
export const inject = ['tools', 'skills', 'credentials', 'agents', 'sessions', 'sessionController'];
export const DSH_VERSION = '0.2.0-rc.2';
export const INSPECTED_SHA = '5badb15009ae1756c3afe0ae0cef1faafc290ccc';
export const RESTORE_TIMEOUT_MS = 15_000;

/** Host UI integration only: these methods are deliberately absent from the tool registry. */
export function createHostControl(ctx: Context, deps?: Dependencies) {
  const sessions = new Map<string, GuilduoSession>();
  const stores = new Map<string, GrantStore>();
  const sources = new Map<string, { owner: string; createdAt: number }>();
  const connectionIds = new Map<string, string>();
  const pending = new Map<string, { expected?: SharedConnection }>();
  const failures = new Set<string>();
  const restoring = new Map<string, Promise<boolean>>();
  const generations = new Map<string, number>();
  const unregister: (() => void)[] = [];
  let catalog: readonly Tool[] | undefined;
  let disposed = false;
  let stopping = false;
  const live = () => { if (disposed || stopping) throw new Error('Plugin disposed'); };
  const credentials = ctx.get('credentials');
  const shared = credentials ? createSharedConnections(credentials) : undefined;
  let sharedState: SharedConnection | undefined;
  const refreshShared = async () => sharedState = await shared?.read();
  const nativeOwner = async (sessionId: string, allowFork: boolean, supplied?: Agent) => {
    const nativeId = SessionId(sessionId);
    const version = generations.get(sessionId);
    const resolved = supplied ? { agent: supplied } : await ctx.sessionController.resolveAgent(nativeId);
    live();
    if ('error' in resolved || resolved.agent.id !== sessionId || ctx.agents.get(nativeId) !== resolved.agent ||
        generations.get(sessionId) !== version) throw new Error('Exact live credential owner unavailable');
    const owner = resolved.agent;
    const session = owner.session;
    const header = session?.header;
    if (!header || header.id !== sessionId || !Number.isSafeInteger(header.createdAt) || header.createdAt < 0 ||
        header.origin === 'subagent' || ctx.sessions.get(nativeId) !== session || !ctx.agents.roots().includes(owner) ||
        ((!allowFork || !header.parentSession) && (header.parentSession || header.isSeeded))) {
      throw new Error('Exact ordinary native Session or top-level fork required');
    }
    return { owner, header, allowed: () => !disposed && generations.get(sessionId) === version &&
      ctx.agents.get(nativeId) === owner && ctx.sessions.get(nativeId) === session && ctx.agents.roots().includes(owner) };
  };
  const storeFor = async (sessionId: string, supplied?: Agent, fresh = false) => {
    if (!credentials) return;
    const connection = await refreshShared();
    const native = await nativeOwner(sessionId, fresh || connection?.state === 'active', supplied);
    if (!fresh && connection?.state === 'disconnected') return;
    const source = fresh ? { owner: `connection-${randomUUID()}`, createdAt: Date.now() }
      : connection?.state === 'active' ? connection : { owner: sessionId, createdAt: native.header.createdAt };
    const sharedId = !fresh && connection?.state === 'active' ? connection.connectionId : undefined;
    const legacyAdmitted = (current: SharedConnection | undefined) => !current ||
      (current.state === 'active' && current.owner === source.owner && current.createdAt === source.createdAt);
    const allowed = () => native.allowed() && (sharedId ?
      sharedState?.state === 'active' && sharedState.connectionId === sharedId : fresh || legacyAdmitted(sharedState));
    const store = createGrantStore(credentials, source.owner, source.createdAt, allowed, deps?.protection,
      sharedId ? () => shared!.admit(connection!) : fresh ? undefined : async () => {
        if (!legacyAdmitted(await shared!.read())) throw new Error('Legacy connection was superseded');
      });
    if (sharedId) {
      const deleteGrant = store.delete;
      store.delete = async () => {
        await shared!.deactivate(sharedId); await refreshShared(); await deleteGrant();
      };
      connectionIds.set(sessionId, sharedId);
    } else connectionIds.delete(sessionId);
    sources.set(sessionId, { owner: source.owner, createdAt: source.createdAt });
    stores.set(sessionId, store); return store;
  };
  const registerTools = (tools: readonly Tool[]) => {
    // ponytail: one stable catalog per plugin lifetime; restart plugin after server schema changes.
    if (catalog && !isDeepStrictEqual(catalog, tools)) throw new Error('Tool catalog changed; reload the plugin');
    if (catalog) return;
    if (tools.some(tool => !/^[A-Za-z0-9_-]{1,50}$/.test(tool.name))) throw new Error('Unsupported tool name');
    try {
      for (const tool of tools) unregister.push(ctx.tools.register(createMcpToolDefinition(ctx, {
        name: `mcp__guilduo__${tool.name}`, rawName: tool.name,
        description: tool.description ?? '', inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema, taskRequired: tool.execution?.taskSupport === 'required',
        call: (args, execution) => {
          const caller = execution.agent?.id;
          const authenticated = caller ? sessions.get(caller) : undefined;
          if (!authenticated || pending.has(caller!) || (credentials && ctx.agents.get(SessionId(caller!)) !== execution.agent)) throw new Error('This DSH session has not authenticated with Guilduo');
          return authenticated.call(caller, tool.name, args, execution.signal).catch(() => {
            throw new Error('Guilduo could not complete this call. Check the connection in Settings.');
          });
        },
      })));
      catalog = tools;
    } catch (error) {
      for (const dispose of unregister.splice(0)) { try { dispose(); } catch { /* Complete registry cleanup. */ } }
      throw error;
    }
  };
  const control = {
    status(sessionId: string) {
      const connected = !pending.has(sessionId) && (sessions.get(sessionId)?.connected ?? false);
      const scope = sharedState?.state === 'active' ? 'shared' as const : connected ? 'session' as const : 'none' as const;
      return { connected, tools: connected ? catalog?.length ?? 0 : 0, scope,
        canShare: connected && !sharedState && !!credentials && !pending.has(sessionId), failed: failures.has(sessionId) };
    },
    async restore(sessionId: string, supplied?: Agent): Promise<boolean> {
      live();
      if (!credentials) return false;
      if (restoring.has(sessionId)) return restoring.get(sessionId)!;
      const task = (async () => {
        const connection = await refreshShared();
        const native = await nativeOwner(sessionId, true, supplied);
        if (sessions.has(sessionId)) {
          if (pending.has(sessionId) || (!connection && !connectionIds.has(sessionId)) ||
              (connection?.state === 'active' && connectionIds.get(sessionId) === connection.connectionId)) {
            return sessions.get(sessionId)!.connected;
          }
          await control.release(sessionId);
        }
        if (connection?.state === 'disconnected' || (!connection && native.header.parentSession)) {
          failures.delete(sessionId); return false;
        }
        const store = await storeFor(sessionId, supplied);
        live(); if (!store || sessions.has(sessionId)) return false;
        // No callback is opened or restored; refresh cannot initiate interactive authorization.
        const session = createSession(sessionId, 'http://127.0.0.1:1/callback', deps, store);
        sessions.set(sessionId, session);
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const tools = await Promise.race([session.restore(), new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              void session.close(true).catch(() => {});
              reject(new Error('Guilduo restoration timed out'));
            }, RESTORE_TIMEOUT_MS);
          })]); live();
          if (sessions.get(sessionId) !== session) throw new Error('Session restoration superseded');
          if (!tools) {
            sessions.delete(sessionId); await session.close();
            if (connection?.state === 'active') failures.add(sessionId);
            return false;
          }
          registerTools(tools); failures.delete(sessionId); return true;
        } catch (error) {
          failures.add(sessionId);
          if (sessions.get(sessionId) === session) sessions.delete(sessionId);
          void session.close().catch(() => {}); throw error;
        } finally { clearTimeout(timer); }
      })();
      restoring.set(sessionId, task);
      try { return await task; } finally { if (restoring.get(sessionId) === task) restoring.delete(sessionId); }
    },
    async begin(sessionId: string, redirectUrl: string, open: (url: URL) => void | Promise<void>) {
      live();
      if (sessions.has(sessionId)) throw new Error('Session already exists; logout before restarting login');
      const expected = await refreshShared();
      if (expected?.state === 'active' || pending.size) throw new Error('A shared connection or login already exists');
      const store = await storeFor(sessionId, undefined, true); live();
      if (sessions.has(sessionId) || pending.size) throw new Error('Session already exists; logout before restarting login');
      const session = createSession(sessionId, redirectUrl, deps, store);
      sessions.set(sessionId, session);
      pending.set(sessionId, { expected }); failures.delete(sessionId);
      try {
        const result = await session.begin(open);
        live();
        if (sessions.get(sessionId) !== session) throw new Error('Session login superseded');
        return result;
      } catch (error) {
        if (sessions.get(sessionId) === session) { sessions.delete(sessionId); pending.delete(sessionId); }
        await session.close().catch(() => {});
        await store?.delete().catch(() => {});
        throw error;
      }
    },
    async finish(sessionId: string, callbackUrl: string) {
      live();
      const session = sessions.get(sessionId);
      if (!session) throw new Error('No pending session login');
      const tools = await session.finish(callbackUrl);
      try {
        live();
        if (sessions.get(sessionId) !== session) throw new Error('Session login superseded');
        registerTools(tools);
        await session.commit(); live();
        if (sessions.get(sessionId) !== session) throw new Error('Session login superseded');
        if (shared) {
          const source = sources.get(sessionId)!;
          sharedState = await shared.publish(source.owner, source.createdAt, pending.get(sessionId)?.expected, async () => {
            live();
            if (sessions.get(sessionId) !== session || !pending.has(sessionId) || !await stores.get(sessionId)!.read()) {
              throw new Error('Pending login is no longer admitted');
            }
            live();
            if (sessions.get(sessionId) !== session || !pending.has(sessionId)) throw new Error('Pending login was cancelled');
          });
          pending.delete(sessionId);
          await control.release(sessionId);
          if (!await control.restore(sessionId) || !control.status(sessionId).connected) throw new Error('Shared connection was interrupted');
        } else pending.delete(sessionId);
        return tools.length;
      } catch (error) {
        if (!catalog) for (const dispose of unregister.splice(0)) {
          try { dispose(); } catch { /* Continue credential cleanup after a registry failure. */ }
        }
        await control.cancelLogin(sessionId, session);
        throw error;
      }
    },
    async logout(sessionId: string) {
      if (shared) await refreshShared();
      if (shared) {
        const expectedId = sharedState?.connectionId;
        let legacy = sharedState?.state !== 'active' ? sources.get(sessionId) : undefined;
        if (sharedState?.state !== 'active' && !legacy) {
          try {
            const owner = ctx.agents.get(SessionId(sessionId));
            if (owner) { const native = await nativeOwner(sessionId, false, owner); legacy = { owner: sessionId, createdAt: native.header.createdAt }; }
          }
          catch { /* An absent exact owner cannot authorize clearing another birth's credential. */ }
        }
        const unpublished = [...pending.keys()].map(id => sources.get(id)).filter(source => source !== undefined);
        for (const id of sessions.keys()) generations.set(id, (generations.get(id) ?? 0) + 1);
        const closing = [...sessions.values()]; sessions.clear(); stores.clear(); sources.clear(); connectionIds.clear(); pending.clear(); failures.clear();
        await Promise.allSettled(closing.map(session => session.close()));
        const invalidated = await shared.deactivate(expectedId, true);
        await refreshShared();
        if (invalidated) await createGrantStore(credentials!, invalidated.owner, invalidated.createdAt, () => false, deps?.protection).delete();
        if (legacy && invalidated) await createGrantStore(credentials!, legacy.owner, legacy.createdAt, () => true, deps?.protection, async () => {
          const current = await shared.read();
          if (current?.state === 'active' && current.owner === legacy!.owner) throw new Error('Legacy source was shared');
        }).clear();
        await Promise.all(unpublished.map(source => shared.discardUnpublished(source.owner, source.createdAt)));
        return;
      }
      generations.set(sessionId, (generations.get(sessionId) ?? 0) + 1);
      const session = sessions.get(sessionId); sessions.delete(sessionId);
      const store = stores.get(sessionId) ?? (credentials ? createGrantStore(credentials, sessionId, -1, () => false, deps?.protection) : undefined);
      stores.delete(sessionId); sources.delete(sessionId); connectionIds.delete(sessionId); pending.delete(sessionId); failures.delete(sessionId);
      await Promise.all([session?.close(), store?.delete()]);
    },
    async cancelLogin(sessionId: string, expected?: GuilduoSession) {
      if (!pending.has(sessionId) || (expected && sessions.get(sessionId) !== expected)) return;
      const store = stores.get(sessionId);
      const source = sources.get(sessionId);
      pending.delete(sessionId);
      await control.release(sessionId);
      if (shared && source) await shared.discardUnpublished(source.owner, source.createdAt);
      else await store?.delete();
    },
    async share(sessionId: string, signal?: AbortSignal) {
      live();
      signal?.throwIfAborted();
      if (!shared || await refreshShared() || !control.status(sessionId).canShare) throw new Error('No legacy connection to share');
      const native = await nativeOwner(sessionId, false);
      const store = stores.get(sessionId)!;
      sharedState = await shared.publish(sessionId, native.header.createdAt, undefined, async () => {
        signal?.throwIfAborted();
        live(); if (!native.allowed() || !await store.read()) throw new Error('Legacy grant is unavailable');
        signal?.throwIfAborted(); live(); if (!native.allowed()) throw new Error('Legacy owner is no longer admitted');
      });
      await control.release(sessionId);
      await control.restore(sessionId);
    },
    async release(sessionId: string) {
      const session = sessions.get(sessionId); sessions.delete(sessionId); stores.delete(sessionId); sources.delete(sessionId); connectionIds.delete(sessionId);
      await session?.close(true);
      if (!sessions.has(sessionId)) generations.set(sessionId, (generations.get(sessionId) ?? 0) + 1);
    },
    async sessionDisposed(sessionId: string) {
      if (!disposed && pending.has(sessionId)) { await control.cancelLogin(sessionId); return; }
      // Native disposal means memory detachment; an invisible persistence entry cannot authorize grant deletion.
      await control.release(sessionId);
    },
    async dispose() {
      stopping = true;
      const unpublished = [...pending.keys()].map(id => sources.get(id)).filter(source => source !== undefined);
      const closing = [...sessions.values()]; sessions.clear(); stores.clear(); catalog = undefined;
      pending.clear(); sources.clear(); connectionIds.clear();
      const results = await Promise.allSettled([
        ...unregister.splice(0).map((dispose) => Promise.resolve().then(dispose)),
        ...closing.map((session) => session.close(true)),
      ]);
      if (shared) results.push(...await Promise.allSettled(unpublished.map(source => shared.discardUnpublished(source.owner, source.createdAt))));
      disposed = true;
      const failures = results.filter((result) => result.status === 'rejected');
      if (failures.length) throw new AggregateError(failures.map((result) => result.reason), 'Plugin cleanup failed');
    },
  };
  if (credentials) ctx.on('credentials/record-updated', (key) => {
    if (key === SHARED_KEY) void refreshShared().catch(() => {});
  });
  return control;
}
export type HostControl = ReturnType<typeof createHostControl>;
declare module '@deepseek-ai/cordis' {
  interface Context { guilduoDshOAuth: HostControl }
}

export async function installAutoRestore(ctx: Context, control: HostControl) {
  const restore = async (agent: Agent) => {
    try { await control.restore(agent.id, agent); }
    catch { /* MCP unavailable must not reject native Agent creation. */ }
  };
  ctx.on('agent/created', async ({ agent }) => { await restore(agent); });
  ctx.on('credentials/record-updated', key => {
    if (key === SHARED_KEY) void Promise.allSettled(ctx.agents.roots().map(restore));
  });
  if (ctx.get('credentials')) await Promise.allSettled(ctx.agents.roots().map(restore));
}

/** Native activation may restore a granted connection; never initiate OAuth or a model run. */
export async function apply(ctx: Context): Promise<void> {
  const base = new URL('../skills/guilduo-workflows/', import.meta.url);
  const markdown = await readFile(new URL('SKILL.md', base), 'utf8');
  const header = /^---\r?\nname: guilduo-workflows\r?\ndescription: ([^\r\n]+)\r?\n---\r?\n/.exec(markdown);
  if (!header) throw new Error('Canonical Skill metadata missing');
  ctx.skills.register({
    name: 'guilduo-workflows', description: header[1], source: 'bundled',
    provider: 'guilduo-dsh-oauth-poc', content: markdown.slice(header[0].length),
    resourceBase: { kind: 'directory', path: fileURLToPath(base) },
  });
  const control = createHostControl(ctx);
  ctx.provide('guilduoDshOAuth', control);
  ctx.on('session/disposed', (session) => {
    const current = ctx.get('sessions')?.get(session.id);
    if (current && current !== session) return;
    return control.sessionDisposed(session.id);
  });
  ctx.effect(() => () => control.dispose(), 'guilduo-dsh-oauth-poc.sessions');
  installSettingsGateway(ctx, control);
  await installAutoRestore(ctx, control);
}

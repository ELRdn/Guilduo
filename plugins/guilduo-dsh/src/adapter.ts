// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport, auth } from '@modelcontextprotocol/client';
import type {
  OAuthClientProvider, OAuthDiscoveryState, StoredOAuthClientInformation, StoredOAuthTokens,
  Tool, Transport,
} from '@modelcontextprotocol/client';
import type { Grant, GrantStore, Protection } from './persistence.js';

export const MCP_URL = 'https://mcp.guilduo.com/mcp';
export const SDK_VERSION = '2.0.0';
type McpClient = Pick<Client, 'connect' | 'listTools' | 'callTool' | 'close'>;
export type Dependencies = {
  authorize: typeof auth;
  client: () => McpClient;
  transport: (provider: OAuthClientProvider, signal?: AbortSignal) => Transport;
  protection?: Protection;
};
const sdk: Dependencies = {
  authorize: auth,
  client: () => new Client({ name: 'guilduo-dsh-oauth-poc', version: '0.6.0-beta.17' }),
  transport: (authProvider, signal) => new StreamableHTTPClientTransport(new URL(MCP_URL), {
    authProvider, onInsufficientScope: 'throw', requestInit: { signal },
  }),
};

/** One host-owned session; only successfully granted credentials may become durable. */
export function createSession(sessionId: string, redirect: string, deps: Dependencies = sdk, store?: GrantStore) {
  if (!sessionId.trim()) throw new Error('An exact host session ID is required');
  const redirectUrl = new URL(redirect);
  const loopback = redirectUrl.protocol === 'http:' &&
    ['127.0.0.1', '[::1]'].includes(redirectUrl.hostname) && Boolean(redirectUrl.port);
  if ((!loopback && redirectUrl.protocol !== 'https:') || redirectUrl.username ||
      redirectUrl.password || redirectUrl.search || redirectUrl.hash) {
    throw new Error('Use an explicit loopback port or HTTPS callback without credentials/query/fragment');
  }
  let clientInfo: StoredOAuthClientInformation | undefined;
  let tokens: StoredOAuthTokens | undefined;
  let verifier: string | undefined;
  let state: string | undefined;
  let discovery: OAuthDiscoveryState | undefined;
  let open: ((url: URL) => void | Promise<void>) | undefined;
  let client: McpClient | undefined;
  let tools: Tool[] = [];
  let closed = false;
  let busy = false;
  let calling = false;
  let durable = false;
  let invalidated = false;
  let flight: Promise<unknown> | undefined;
  let draining = false;
  let retainedGrant: Grant | undefined;
  const lifecycle = new AbortController();
  const authFetch: typeof fetch = (input, init) => fetch(input, { ...init,
    signal: AbortSignal.any([lifecycle.signal, ...(init?.signal ? [init.signal] : [])]) });
  let closing: Promise<void> | undefined;
  const live = () => { if (closed) throw new Error('Session closed'); if (store && !store.isLive()) throw new Error('Credential owner is no longer admitted'); };
  const provider: OAuthClientProvider = {
    redirectUrl,
    clientMetadata: {
      client_name: 'Guilduo DSH isolated PoC', redirect_uris: [redirectUrl.href],
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
    state: () => {
      live();
      if (!open) throw new Error('Interactive authentication requires an explicit host login');
      return state ??= randomUUID();
    },
    discoveryState: () => { live(); return structuredClone(discovery); },
    saveDiscoveryState: (value) => { live(); discovery = structuredClone(value); },
    clientInformation: () => { live(); return clientInfo; },
    saveClientInformation: (value) => { live(); clientInfo = structuredClone(value); },
    tokens: () => { live(); return tokens; },
    saveTokens: (value) => { live(); tokens = structuredClone(value); },
    saveCodeVerifier: (value) => { live(); verifier = value; },
    codeVerifier: () => { live(); if (!verifier) throw new Error('No pending PKCE verifier'); return verifier; },
    redirectToAuthorization: async (url) => {
      live();
      if (!open) throw new Error('Interactive authentication requires an explicit host login');
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Unsafe authorization URL');
      if (!state || url.searchParams.get('state') !== state) throw new Error('Authorization state mismatch');
      await open(new URL(url));
    },
    validateResourceURL: async (serverUrl, resource) => {
      if (new URL(serverUrl).href !== MCP_URL || (resource && resource !== MCP_URL)) {
        throw new Error('Guilduo resource mismatch');
      }
      return new URL(MCP_URL);
    },
    invalidateCredentials: (scope) => {
      if (durable && !closed && (scope === 'all' || scope === 'client' || scope === 'tokens')) invalidated = true;
      if (scope === 'all' || scope === 'client') clientInfo = undefined;
      if (scope === 'all' || scope === 'client' || scope === 'tokens') tokens = undefined;
      if (scope === 'all' || scope === 'verifier') { verifier = undefined; state = undefined; }
      if (scope === 'all' || scope === 'discovery') discovery = undefined;
    },
  };
  const grant = (): Grant => {
    if (!tokens) throw new Error('No granted credentials');
    return { tokens: structuredClone(tokens), clientInfo: structuredClone(clientInfo), discovery: structuredClone(discovery) };
  };
  const useGrant = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (!store || !durable) return operation();
    try {
      const outcome = await store.locked(async saved => {
        live(); tokens = saved.tokens; clientInfo = saved.clientInfo; discovery = saved.discovery;
        let result: { ok: true; value: T } | { ok: false; error: unknown };
        try { result = { ok: true, value: await operation() }; }
        catch (error) { result = { ok: false, error }; }
        // A refresh can rotate credentials even when the following MCP request fails.
        return { result, grant: retainedGrant ?? grant() };
      });
      if (!outcome.ok) throw outcome.error;
      return outcome.value;
    } catch (error) {
      if (invalidated) await store.delete();
      throw error;
    }
  };
  const discover = async (): Promise<readonly Tool[]> => {
    client = deps.client();
    await client.connect(deps.transport(provider, lifecycle.signal), { signal: lifecycle.signal, timeout: 15_000 }); live();
    const cursors = new Set<string>(); let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined, { signal: lifecycle.signal, timeout: 15_000 }); live();
      tools.push(...page.tools); cursor = page.nextCursor;
      if (cursor && (cursors.has(cursor) || cursors.size >= 100)) throw new Error('Invalid tools pagination');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    if (new Set(tools.map(tool => tool.name)).size !== tools.length) throw new Error('Duplicate tool name');
    return structuredClone(tools);
  };
  return {
    sessionId,
    get connected() { return !closed && !busy && (!store || store.isLive()) && Boolean(client && tokens); },
    async commit() {
      live(); if (store) { await store.save(grant()); live(); durable = true; }
    },
    async restore(): Promise<readonly Tool[] | undefined> {
      live(); if (!store || busy || client) return;
      if (!await store.read()) return;
      busy = true; durable = true;
      try { return await useGrant(discover); }
      catch (error) {
        const failed = client as McpClient | undefined; client = undefined; tools = []; durable = false;
        provider.invalidateCredentials?.('all'); await failed?.close().catch(() => {}); throw error;
      } finally { busy = false; }
    },
    async begin(openAuthorization: (url: URL) => void | Promise<void>) {
      live();
      if (typeof openAuthorization !== 'function') throw new Error('An explicit host URL opener is required');
      if (busy || state || client) throw new Error('Login already pending or connected');
      busy = true; open = openAuthorization;
      try {
        const result = await deps.authorize(provider, { serverUrl: MCP_URL, fetchFn: authFetch });
        live();
        return result;
      }
      catch (error) { provider.invalidateCredentials?.('all'); throw error; }
      finally { open = undefined; busy = false; }
    },
    async finish(callback: string): Promise<readonly Tool[]> {
      live();
      const url = new URL(callback);
      if (busy || client || !state || url.origin !== redirectUrl.origin || url.pathname !== redirectUrl.pathname ||
          url.hash || url.username || url.password || url.searchParams.getAll('state').length !== 1 ||
          url.searchParams.get('state') !== state || url.searchParams.getAll('code').length !== 1 ||
          !url.searchParams.get('code') || url.searchParams.has('error') || url.searchParams.getAll('iss').length > 1) {
        throw new Error('Invalid or replayed session OAuth callback');
      }
      busy = true;
      // Consume before exchange: an ambiguous exchange must start a new explicit login.
      state = undefined;
      try {
        const result = await deps.authorize(provider, {
          serverUrl: MCP_URL, fetchFn: authFetch, authorizationCode: url.searchParams.get('code')!,
          iss: url.searchParams.get('iss') ?? undefined,
        });
        live();
        if (result !== 'AUTHORIZED' || !tokens) throw new Error('OAuth did not authorize this session');
        await discover();
        verifier = undefined;
        return structuredClone(tools);
      } catch (error) {
        const failed = client as McpClient | undefined; client = undefined; tools = [];
        provider.invalidateCredentials?.('all');
        await failed?.close().catch(() => {});
        throw error;
      } finally { busy = false; }
    },
    async call(callerSessionId: string | undefined, name: string, args: Record<string, unknown>, signal: AbortSignal) {
      live();
      if (callerSessionId !== sessionId || draining || busy || !client || !tokens || !tools.some((tool) => tool.name === name)) {
        throw new Error('Tool requires the exact authenticated host session and discovered name');
      }
      signal.throwIfAborted();
      // ponytail: one in-flight call per session prevents concurrent SDK refresh-token rotation;
      // support parallel calls only with single-flight authorization in the transport.
      if (calling) throw new Error('Another tool call is in flight for this session');
      calling = true;
      const requestSignal = AbortSignal.any([signal, lifecycle.signal]);
      try {
        const pending = useGrant(() => {
          requestSignal.throwIfAborted();
          return client!.callTool({ name, arguments: args }, { signal: requestSignal, timeout: 60_000 });
        });
        flight = pending;
        const result = await pending;
        live();
        requestSignal.throwIfAborted();
        return result;
      } finally { calling = false; flight = undefined; }
    },
    async close(retainGrant = false) {
      if (closing) return closing;
      const shutdown = () => {
        if (retainGrant && durable && tokens) retainedGrant = grant();
        closed = true;
        const previous = client; client = undefined;
        lifecycle.abort(new Error('Session closed'));
        provider.invalidateCredentials?.('all');
        tools = []; open = undefined;
        return previous?.close();
      };
      if (retainGrant && store && flight) {
        draining = true;
        closing = flight.catch(() => {}).then(shutdown);
      } else closing = Promise.resolve(shutdown());
      return closing;
    },
  };
}
export type GuilduoSession = ReturnType<typeof createSession>;

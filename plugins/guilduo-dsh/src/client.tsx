// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';

export const inject = ['slots', 'connection', 'uiSession'];
const MCP_ENDPOINT = 'https://mcp.guilduo.com/mcp';
const SAFE_ERROR = '接続操作に失敗しました。もう一度お試しください。';
type Status = {
  state: 'disconnected' | 'connecting' | 'connected' | 'failed'; tools: number;
  scope: 'none' | 'session' | 'shared'; canShare: boolean;
};
const DISCONNECTED: Status = { state: 'disconnected', tools: 0, scope: 'none', canShare: false };
type ClientState = Status & { sessionId?: string; authorizationUrl?: string; busy: boolean };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function status(value: unknown): Status {
  if (!record(value) || Object.keys(value).length !== 4 ||
      typeof value.state !== 'string' || !['disconnected', 'connecting', 'connected', 'failed'].includes(value.state) ||
      !Number.isSafeInteger(value.tools) || (value.tools as number) < 0 ||
      typeof value.scope !== 'string' || !['none', 'session', 'shared'].includes(value.scope) ||
      typeof value.canShare !== 'boolean') throw new Error(SAFE_ERROR);
  return value as Status;
}

function authorization(value: unknown): string {
  if (!record(value) || Object.keys(value).length !== 1 || typeof value.authorizationUrl !== 'string') {
    throw new Error(SAFE_ERROR);
  }
  const url = new URL(value.authorizationUrl);
  if (url.origin !== 'https://mcp.guilduo.com' || url.pathname !== '/oauth/authorize' ||
      url.username || url.password || url.hash) throw new Error(SAFE_ERROR);
  return url.href;
}

/** Own only RAM state; the native Session adapter supplies the main Conversation identity. */
export function createClientControl(
  rpc: ConnectionHandle['rpc'],
  selection: ObservableSnapshot<{ readonly key: string | undefined }>,
  isLoopback: boolean,
  connectionGeneration?: ConnectionHandle['generation'],
) {
  const state = createSnapshotStore<ClientState>({ ...DISCONNECTED, busy: false });
  let generation = 0;
  let request = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let pendingAuth = false;
  let hostGeneration = connectionGeneration?.getSnapshot()?.id;
  const isReady = () => !connectionGeneration || connectionGeneration.getSnapshot() !== undefined;
  const current = (id: string, version: number) => !disposed && version === generation && state.getSnapshot().sessionId === id;
  const stop = () => { generation++; request.abort(); request = new AbortController(); clearTimeout(timer); };
  const invoke = async (method: 'status' | 'connect' | 'disconnect' | 'cancel' | 'share', id: string, signal?: AbortSignal) => {
    const result = await rpc.call('/api', `guilduo/${method}`, { args: { sessionId: id } }, signal);
    // Gateway returns the method value inside its carrier result; the bridge owns a second result.
    if (!record(result) || result.ok !== true || !record(result.value) ||
        result.value.ok !== true || Object.keys(result.value).length !== 2 || !('value' in result.value)) {
      throw new Error(SAFE_ERROR);
    }
    return result.value.value;
  };
  const cancelAttempt = (id: string) => {
    if (!pendingAuth) return;
    pendingAuth = false;
    void invoke('cancel', id).catch(() => {});
  };
  const fail = (id: string, version: number) => {
    if (current(id, version)) state.set({ ...state.getSnapshot(), state: 'failed', tools: 0,
      canShare: false, authorizationUrl: undefined, busy: false });
  };
  const refresh = async (id: string, version: number) => {
    try {
      const next = status(await invoke('status', id, request.signal));
      if (!current(id, version)) return;
      if (next.state !== 'connecting') pendingAuth = false;
      state.set({ sessionId: id, ...next, busy: false,
        ...(next.state === 'connecting' ? { authorizationUrl: state.getSnapshot().authorizationUrl } : {}) });
      if (next.state === 'connecting') timer = setTimeout(() => { void refresh(id, version); }, 1000);
    } catch {
      if (current(id, version)) cancelAttempt(id);
      fail(id, version);
    }
  };
  const select = () => {
    const key = selection.getSnapshot().key;
    const id = typeof key === 'string' && key.trim() ? key : undefined;
    const previous = state.getSnapshot();
    if (id === previous.sessionId) return;
    stop();
    if (previous.sessionId) cancelAttempt(previous.sessionId);
    state.set({ sessionId: id, ...DISCONNECTED, busy: id !== undefined && isLoopback && isReady() });
    if (id && isLoopback && isReady()) void refresh(id, generation);
  };
  const unsubscribe = selection.subscribe(select);
  const reset = () => {
    if (disposed) return;
    stop();
    pendingAuth = false;
    state.set({ ...DISCONNECTED, busy: false });
    select();
  };
  const unsubscribeGeneration = connectionGeneration?.subscribe(() => {
    const next = connectionGeneration.getSnapshot()?.id;
    if (next === hostGeneration) return;
    hostGeneration = next;
    // An old Host's attempt cannot be cancelled by sending to its replacement.
    reset();
  });
  select();
  const action = async (method: 'cancel' | 'disconnect' | 'share') => {
    const before = state.getSnapshot();
    if (disposed || !isLoopback || !isReady() || !before.sessionId) return;
    stop();
    pendingAuth = false;
    const id = before.sessionId;
    const version = generation;
    state.set({ ...before, authorizationUrl: undefined, busy: true });
    try {
      const next = status(await invoke(method, id, request.signal));
      if (current(id, version)) state.set({ sessionId: id, ...next, busy: false });
    } catch { fail(id, version); }
  };
  return {
    state,
    isLoopback,
    isReady,
    reset,
    refresh: reset,
    async connect() {
      const before = state.getSnapshot();
      if (disposed || !isLoopback || !isReady() || !before.sessionId || before.busy || before.state === 'connecting' || before.state === 'connected') return;
      stop();
      const id = before.sessionId;
      const version = generation;
      pendingAuth = true;
      state.set({ sessionId: id, ...DISCONNECTED, state: 'connecting', busy: true });
      try {
        const url = authorization(await invoke('connect', id, request.signal));
        if (!current(id, version)) return;
        state.set({ sessionId: id, ...DISCONNECTED, state: 'connecting', busy: false, authorizationUrl: url });
        void refresh(id, version);
      } catch {
        if (current(id, version)) { cancelAttempt(id); fail(id, version); }
      }
    },
    disconnect: () => action('disconnect'),
    async cancel() {
      if (!pendingAuth || state.getSnapshot().state !== 'connecting') return;
      await action('cancel');
    },
    async share() {
      const before = state.getSnapshot();
      if (before.busy || before.state !== 'connected' || before.scope !== 'session' || !before.canShare) return;
      await action('share');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      unsubscribeGeneration?.();
      stop();
      const previous = state.getSnapshot();
      if (previous.sessionId) cancelAttempt(previous.sessionId);
      state.set({ ...DISCONNECTED, busy: false });
    },
  };
}

type Control = ReturnType<typeof createClientControl>;
const labels = { disconnected: '未接続', connecting: '接続中', connected: '接続済み', failed: '失敗' };

export function GuilduoSection({ control }: SettingsSectionOwnerProps & { control: Control }) {
  const snapshot = useSyncExternalStore(control.state.subscribe, control.state.getSnapshot, control.state.getSnapshot);
  const disabled = !control.isLoopback || !control.isReady() || !snapshot.sessionId || snapshot.busy;
  useEffect(() => {
    control.refresh();
    return () => {
      // Closing settings cancels only this flow's OAuth, never a shared connection.
      void control.cancel();
    };
  }, [control]);
  return <section aria-label="Guilduo" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    <h2>Guilduo</h2>
    <p>Guilduo MCPへの接続は、通常の会話とフォークを含む全会話で使えます。同じWindowsユーザー・DSH HomeのWeb／Desktopで共有します。</p>
    <p role="status" aria-live="polite">{snapshot.busy ? '接続状態を確認中…' : labels[snapshot.state]}
      {snapshot.state === 'connected' ? `（ツール ${snapshot.tools} 件）` : ''}</p>
    {snapshot.scope === 'shared' && <p>接続範囲: 全会話で共有（通常の会話・フォーク）。切断すると、Web／Desktopを含む全会話でGuilduoが使えなくなります。</p>}
    {snapshot.scope === 'session' && <p>接続範囲: この会話のみ（旧接続）。{snapshot.canShare ? '「全会話で使う」で共有できます。' : ''}</p>}
    {!snapshot.sessionId && <p>会話を開いてから接続してください。</p>}
    {!control.isLoopback && <p>ローカルのDSHから接続してください。</p>}
    {control.isLoopback && !control.isReady() && <p>DSHとの接続を待っています。</p>}
    {snapshot.state === 'failed' && <p role="alert">{SAFE_ERROR}</p>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <Button type="button" variant="primary" style={{ minHeight: 44 }}
        disabled={disabled || snapshot.state === 'connecting' || snapshot.state === 'connected'}
        onClick={() => { void control.connect(); }}>接続</Button>
      {snapshot.scope === 'session' && snapshot.canShare && <Button type="button" variant="primary" style={{ minHeight: 44 }}
        disabled={disabled || snapshot.state !== 'connected'}
        onClick={() => { void control.share(); }}>全会話で使う</Button>}
      {snapshot.authorizationUrl && <a href={snapshot.authorizationUrl} target="_blank" rel="noopener noreferrer"
        style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>ブラウザーで認証</a>}
      <Button type="button" variant="outline" style={{ minHeight: 44 }}
        disabled={!control.isLoopback || !control.isReady() || !snapshot.sessionId || snapshot.busy && snapshot.state !== 'connecting' || snapshot.state === 'disconnected'}
        onClick={() => { void control.disconnect(); }}>切断</Button>
    </div>
    <p style={{ overflowWrap: 'anywhere' }}>MCP endpoint: <code>{MCP_ENDPOINT}</code></p>
  </section>;
}

export function apply(ctx: Context): void {
  // Host and Client share Cordis declarations; this injected face is the Client Connection contract.
  const connection = ctx.get('connection') as unknown as ConnectionHandle;
  const control = createClientControl(connection.rpc, ctx.uiSession.adapter.current, connection.isLoopback === true, connection.generation);
  ctx.effect(() => () => control.dispose(), 'guilduo.client');
  ctx.on('connection/reset', control.reset);
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'guilduo', order: 60, label: 'Guilduo', inject: () => ({ control }),
  }, GuilduoSection));
}

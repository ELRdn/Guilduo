import type { Context } from '@deepseek-ai/cordis';
import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection';
import type { HostControl } from './index.js';
export declare const LOGIN_TIMEOUT_MS: number;
/** Authenticated human UI only; no model-facing login tools or durable secrets. */
export declare function createSettingsBridge(ctx: Context, control: HostControl, timeoutMs?: number): {
    handle: ConnectionRpcHandler;
    dispose(): Promise<void>;
};

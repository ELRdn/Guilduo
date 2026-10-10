import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Context } from '@deepseek-ai/cordis';
import type { Dependencies, GuilduoSession } from './adapter.js';
export declare const name = "guilduo-dsh-oauth-poc";
export declare const inject: string[];
export declare const DSH_VERSION = "0.2.0-rc.2";
export declare const INSPECTED_SHA = "5badb15009ae1756c3afe0ae0cef1faafc290ccc";
export declare const RESTORE_TIMEOUT_MS = 15000;
/** Host UI integration only: these methods are deliberately absent from the tool registry. */
export declare function createHostControl(ctx: Context, deps?: Dependencies): {
    status(sessionId: string): {
        connected: boolean;
        tools: number;
        scope: "none" | "session" | "shared";
        canShare: boolean;
        failed: boolean;
    };
    restore(sessionId: string, supplied?: Agent): Promise<boolean>;
    begin(sessionId: string, redirectUrl: string, open: (url: URL) => void | Promise<void>): Promise<import("@modelcontextprotocol/client").AuthResult>;
    finish(sessionId: string, callbackUrl: string): Promise<number>;
    logout(sessionId: string): Promise<void>;
    cancelLogin(sessionId: string, expected?: GuilduoSession): Promise<void>;
    share(sessionId: string, signal?: AbortSignal): Promise<void>;
    release(sessionId: string): Promise<void>;
    sessionDisposed(sessionId: string): Promise<void>;
    dispose(): Promise<void>;
};
export type HostControl = ReturnType<typeof createHostControl>;
declare module '@deepseek-ai/cordis' {
    interface Context {
        guilduoDshOAuth: HostControl;
    }
}
export declare function installAutoRestore(ctx: Context, control: HostControl): Promise<void>;
/** Native activation may restore a granted connection; never initiate OAuth or a model run. */
export declare function apply(ctx: Context): Promise<void>;

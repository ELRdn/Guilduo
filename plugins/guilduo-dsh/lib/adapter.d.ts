import { Client, auth } from '@modelcontextprotocol/client';
import type { OAuthClientProvider, Tool, Transport } from '@modelcontextprotocol/client';
import type { GrantStore, Protection } from './persistence.js';
export declare const MCP_URL = "https://mcp.guilduo.com/mcp";
export declare const SDK_VERSION = "2.0.0";
type McpClient = Pick<Client, 'connect' | 'listTools' | 'callTool' | 'close'>;
export type Dependencies = {
    authorize: typeof auth;
    client: () => McpClient;
    transport: (provider: OAuthClientProvider, signal?: AbortSignal) => Transport;
    protection?: Protection;
};
/** One host-owned session; only successfully granted credentials may become durable. */
export declare function createSession(sessionId: string, redirect: string, deps?: Dependencies, store?: GrantStore): {
    sessionId: string;
    readonly connected: boolean;
    commit(): Promise<void>;
    restore(): Promise<readonly Tool[] | undefined>;
    begin(openAuthorization: (url: URL) => void | Promise<void>): Promise<import("@modelcontextprotocol/client").AuthResult>;
    finish(callback: string): Promise<readonly Tool[]>;
    call(callerSessionId: string | undefined, name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<{
        [x: string]: unknown;
        _meta?: {
            [x: string]: unknown;
            "io.modelcontextprotocol/serverInfo"?: {
                version: string;
                websiteUrl?: string | undefined;
                description?: string | undefined;
                icons?: {
                    src: string;
                    mimeType?: string | undefined;
                    sizes?: string[] | undefined;
                    theme?: "dark" | "light" | undefined;
                }[] | undefined;
                name: string;
                title?: string | undefined;
            } | undefined;
        } | undefined;
        content: ({
            type: "text";
            text: string;
            annotations?: {
                audience?: ("assistant" | "user")[] | undefined;
                priority?: number | undefined;
                lastModified?: string | undefined;
            } | undefined;
            _meta?: {
                [x: string]: unknown;
            } | undefined;
        } | {
            type: "image";
            data: string;
            mimeType: string;
            annotations?: {
                audience?: ("assistant" | "user")[] | undefined;
                priority?: number | undefined;
                lastModified?: string | undefined;
            } | undefined;
            _meta?: {
                [x: string]: unknown;
            } | undefined;
        } | {
            type: "audio";
            data: string;
            mimeType: string;
            annotations?: {
                audience?: ("assistant" | "user")[] | undefined;
                priority?: number | undefined;
                lastModified?: string | undefined;
            } | undefined;
            _meta?: {
                [x: string]: unknown;
            } | undefined;
        } | {
            uri: string;
            description?: string | undefined;
            mimeType?: string | undefined;
            size?: number | undefined;
            annotations?: {
                audience?: ("assistant" | "user")[] | undefined;
                priority?: number | undefined;
                lastModified?: string | undefined;
            } | undefined;
            _meta?: {
                [x: string]: unknown;
            } | undefined;
            icons?: {
                src: string;
                mimeType?: string | undefined;
                sizes?: string[] | undefined;
                theme?: "dark" | "light" | undefined;
            }[] | undefined;
            name: string;
            title?: string | undefined;
            type: "resource_link";
        } | {
            type: "resource";
            resource: {
                uri: string;
                mimeType?: string | undefined;
                _meta?: {
                    [x: string]: unknown;
                } | undefined;
                text: string;
            } | {
                uri: string;
                mimeType?: string | undefined;
                _meta?: {
                    [x: string]: unknown;
                } | undefined;
                blob: string;
            };
            annotations?: {
                audience?: ("assistant" | "user")[] | undefined;
                priority?: number | undefined;
                lastModified?: string | undefined;
            } | undefined;
            _meta?: {
                [x: string]: unknown;
            } | undefined;
        })[];
        structuredContent?: unknown;
        isError?: boolean | undefined;
    }>;
    close(retainGrant?: boolean): Promise<void>;
};
export type GuilduoSession = ReturnType<typeof createSession>;
export {};

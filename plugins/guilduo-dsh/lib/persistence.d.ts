import type { CredentialProvider } from '@deepseek-ai/dsh-credentials';
import type { OAuthDiscoveryState, StoredOAuthClientInformation, StoredOAuthTokens } from '@modelcontextprotocol/client';
export type Grant = {
    tokens: StoredOAuthTokens;
    clientInfo?: StoredOAuthClientInformation;
    discovery?: OAuthDiscoveryState;
};
export type Protection = {
    protect(value: string, owner: string): Promise<string>;
    unprotect(value: string, owner: string): Promise<string>;
};
export declare const windowsProtection: Protection;
export declare function createGrantStore(credentials: Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>, owner: string, createdAt: number, allowed: () => boolean, protection?: Protection, admit?: () => Promise<void>): {
    isLive: () => boolean;
    read(): Promise<Grant | undefined>;
    save(grant: Grant): Promise<void>;
    locked<T>(operation: (grant: Grant) => Promise<{
        result: T;
        grant: Grant;
    }>): Promise<T>;
    clear(): Promise<void>;
    delete(): Promise<void>;
};
export type GrantStore = ReturnType<typeof createGrantStore>;
export type SharedConnection = {
    version: 1;
    connectionId: string;
    state: 'active' | 'disconnected';
    owner: string;
    createdAt: number;
};
export declare const SHARED_KEY: import("@deepseek-ai/dsh-credentials").CredentialKey;
/** A reference only: every client refreshes the same protected record under the native file lock. */
export declare function createSharedConnections(credentials: Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>): {
    read: () => Promise<SharedConnection | undefined>;
    publish(owner: string, createdAt: number, expected: SharedConnection | undefined, validate: () => Promise<void>): Promise<SharedConnection>;
    deactivate(expectedId?: string, requireExpected?: boolean): Promise<SharedConnection | undefined>;
    admit(connection: SharedConnection): Promise<void>;
    discardUnpublished(owner: string, createdAt: number): Promise<void>;
};

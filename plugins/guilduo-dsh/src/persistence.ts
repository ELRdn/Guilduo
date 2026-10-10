// SPDX-License-Identifier: AGPL-3.0-only
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import type { CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials';
import type { OAuthDiscoveryState, StoredOAuthClientInformation, StoredOAuthTokens } from '@modelcontextprotocol/client';

export type Grant = {
  tokens: StoredOAuthTokens;
  clientInfo?: StoredOAuthClientInformation;
  discovery?: OAuthDiscoveryState;
};
export type Protection = { protect(value: string, owner: string): Promise<string>; unprotect(value: string, owner: string): Promise<string> };
const endpoint = 'https://mcp.guilduo.com/mcp';
const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$inputValue = [Console]::In.ReadToEnd() | ConvertFrom-Json
$data = [Convert]::FromBase64String($inputValue.value)
$entropy = [Convert]::FromBase64String($inputValue.entropy)
$scope = [Security.Cryptography.DataProtectionScope]::CurrentUser
if ($inputValue.decrypt) { $result = [Security.Cryptography.ProtectedData]::Unprotect($data, $entropy, $scope) }
else { $result = [Security.Cryptography.ProtectedData]::Protect($data, $entropy, $scope) }
[Console]::Out.Write([Convert]::ToBase64String($result))
`;
function dpapi(value: string, owner: string, decrypt: boolean): Promise<string> {
  if (process.platform !== 'win32' || !process.env.SystemRoot) return Promise.reject(new Error('Durable Guilduo credentials require Windows DPAPI'));
  return new Promise((resolve, reject) => {
    const child = spawn(join(process.env.SystemRoot!, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let size = 0;
    const timer = setTimeout(() => child.kill(), 10_000);
    child.stdout.on('data', chunk => { size += chunk.length; if (size > 1024 * 1024) child.kill(); else output += chunk; });
    // Never expose PowerShell's diagnostic output, which may contain input values.
    child.stderr.resume(); child.stdin.on('error', () => {});
    child.on('error', () => { clearTimeout(timer); reject(new Error('Windows credential protection unavailable')); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(output)) { reject(new Error('Windows credential protection failed')); return; }
      resolve(decrypt ? Buffer.from(output, 'base64').toString('utf8') : output);
    });
    child.stdin.end(JSON.stringify({ value: decrypt ? value : Buffer.from(value).toString('base64'),
      entropy: createHash('sha256').update(`${endpoint}\0${owner}`).digest('base64'), decrypt }));
  });
}
export const windowsProtection: Protection = {
  protect: (value, owner) => dpapi(value, owner, false),
  unprotect: (value, owner) => dpapi(value, owner, true),
};
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function snapshot(grant: Grant): Grant {
  // Persist credential fields only; registration metadata includes the ephemeral callback URI.
  const { access_token, token_type, refresh_token, expires_in, scope, issuer } = grant.tokens;
  const client = grant.clientInfo;
  return { tokens: { access_token, token_type, refresh_token, expires_in, scope, issuer },
    ...(client ? { clientInfo: { client_id: client.client_id, client_secret: client.client_secret,
      client_id_issued_at: client.client_id_issued_at, client_secret_expires_at: client.client_secret_expires_at, issuer: client.issuer } } : {}),
    ...(grant.discovery ? { discovery: { authorizationServerUrl: grant.discovery.authorizationServerUrl,
      authorizationServerMetadata: grant.discovery.authorizationServerMetadata, resourceMetadata: grant.discovery.resourceMetadata,
      resourceMetadataUrl: grant.discovery.resourceMetadataUrl } } : {}),
  };
}
export function createGrantStore(credentials: Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>,
  owner: string, createdAt: number, allowed: () => boolean, protection: Protection = windowsProtection,
  admit: () => Promise<void> = async () => {}) {
  if (protection === windowsProtection && (process.platform !== 'win32' || !process.env.SystemRoot)) {
    throw new Error('Durable Guilduo authentication requires Windows DPAPI; login was not started');
  }
  const key = credentialKey('guilduo-dsh-oauth-poc', `session-${createHash('sha256').update(owner).digest('hex')}`);
  let revoked = false;
  const live = () => { if (revoked || !allowed()) throw new Error('Credential owner is no longer admitted'); };
  const decode = async (stored: CredentialRecord | undefined): Promise<Grant | undefined> => {
    if (!stored) return;
    if (stored.kind !== 'grant' || !record(stored.payload) || stored.payload.protection !== 'dpapi-current-user-v1' ||
        typeof stored.payload.ciphertext !== 'string') throw new Error('Unsupported stored Guilduo credential');
    const value: unknown = JSON.parse(await protection.unprotect(stored.payload.ciphertext, `${owner}\0${createdAt}`));
    live();
    if (!record(value) || value.version !== 1 || value.owner !== owner || value.createdAt !== createdAt || value.endpoint !== endpoint ||
        !record(value.grant) || !record(value.grant.tokens) || typeof value.grant.tokens.access_token !== 'string' ||
        !value.grant.tokens.access_token || typeof value.grant.tokens.token_type !== 'string' ||
        value.grant.tokens.token_type.toLowerCase() !== 'bearer') throw new Error('Invalid stored Guilduo grant');
    const grant = value.grant as Grant;
    if (grant.discovery?.resourceMetadata?.resource && grant.discovery.resourceMetadata.resource !== endpoint) throw new Error('Stored resource mismatch');
    return snapshot(grant);
  };
  const encode = async (grant: Grant): Promise<CredentialRecord> => {
    const ciphertext = await protection.protect(JSON.stringify({ version: 1, owner, createdAt, endpoint, grant: snapshot(grant) }), `${owner}\0${createdAt}`);
    live(); return { kind: 'grant', payload: { protection: 'dpapi-current-user-v1', ciphertext } };
  };
  return {
    isLive: () => !revoked && allowed(),
    async read() { live(); await admit(); const grant = await decode(await credentials.readRecord(key)); live(); return grant; },
    async save(grant: Grant) {
      live(); await credentials.modifyRecord(key, async () => { live(); await admit(); return encode(grant); }); live();
    },
    async locked<T>(operation: (grant: Grant) => Promise<{ result: T; grant: Grant }>): Promise<T> {
      live(); let result!: T;
      await credentials.modifyRecord(key, async stored => {
        live(); await admit(); const current = await decode(stored); if (!current) throw new Error('Guilduo grant was removed');
        const next = await operation(current); result = next.result; live(); await admit(); return encode(next.grant);
      });
      live(); return result;
    },
    async clear() {
      try {
        await credentials.modifyRecord(key, async stored => {
          if (!stored || (stored.kind === 'grant' && record(stored.payload) &&
              Object.keys(stored.payload).length === 1 && stored.payload.discarded === true)) return;
          await decode(stored); await admit();
          // Native delete has no compare-and-delete: never erase a replacement record.
          return { kind: 'grant', payload: { discarded: true } };
        });
      } catch { throw new Error('Saved Guilduo credentials could not be cleared'); }
      finally { revoked = true; }
    },
    async delete() { revoked = true; await credentials.deleteRecord(key); },
  };
}
export type GrantStore = ReturnType<typeof createGrantStore>;

export type SharedConnection = {
  version: 1; connectionId: string; state: 'active' | 'disconnected'; owner: string; createdAt: number;
};
export const SHARED_KEY = credentialKey('guilduo-dsh-oauth-poc', 'shared-connection');
/** A reference only: every client refreshes the same protected record under the native file lock. */
export function createSharedConnections(credentials: Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>) {
  const decode = (stored: CredentialRecord | undefined): SharedConnection | undefined => {
    if (!stored) return;
    if (stored.kind !== 'grant') throw new Error('Invalid shared Guilduo connection');
    const value = stored.payload;
    if (!record(value) || Object.keys(value).length !== 5 || value.version !== 1 ||
        typeof value.connectionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.connectionId) ||
        !['active', 'disconnected'].includes(String(value.state)) || typeof value.owner !== 'string' ||
        !/^[A-Za-z0-9_-]{1,256}$/.test(value.owner) || !Number.isSafeInteger(value.createdAt) || Number(value.createdAt) < 0) {
      throw new Error('Invalid shared Guilduo connection');
    }
    return value as SharedConnection;
  };
  const read = async () => decode(await credentials.readRecord(SHARED_KEY));
  return {
    read,
    async publish(owner: string, createdAt: number, expected: SharedConnection | undefined,
      validate: () => Promise<void>): Promise<SharedConnection> {
      const connection: SharedConnection = { version: 1, connectionId: randomUUID(), state: 'active', owner, createdAt };
      await credentials.modifyRecord(SHARED_KEY, async stored => {
        const current = decode(stored);
        if (current?.state === 'active' || current?.connectionId !== expected?.connectionId || current?.state !== expected?.state) {
          throw new Error('Shared Guilduo connection changed');
        }
        // validate may read a grant, but must never nest a native modifyRecord lock.
        await validate();
        return { kind: 'grant', payload: connection };
      });
      return connection;
    },
    async deactivate(expectedId?: string, requireExpected = false): Promise<SharedConnection | undefined> {
      let result: SharedConnection | undefined;
      await credentials.modifyRecord(SHARED_KEY, async stored => {
        const current = decode(stored);
        if ((requireExpected || expectedId) && current?.connectionId !== expectedId) return undefined;
        result = { ...(current ?? { version: 1 as const, owner: `connection-${randomUUID()}`, createdAt: Date.now() }),
          connectionId: randomUUID(), state: 'disconnected' };
        return { kind: 'grant', payload: result };
      });
      return result;
    },
    async admit(connection: SharedConnection) {
      // Called inside the grant writer lock: the provider has reconciled all records from disk.
      const current = await read();
      if (current?.state !== 'active' || current.connectionId !== connection.connectionId ||
          current.owner !== connection.owner || current.createdAt !== connection.createdAt) {
        throw new Error('Shared Guilduo connection is no longer active');
      }
    },
    async discardUnpublished(owner: string, createdAt: number) {
      const key = credentialKey('guilduo-dsh-oauth-poc', `session-${createHash('sha256').update(owner).digest('hex')}`);
      let discard = false;
      await credentials.modifyRecord(key, async stored => {
        const current = await read();
        if (current?.state === 'active' && current.owner === owner && current.createdAt === createdAt) return undefined;
        discard = true;
        // Remove token material while holding the file lock; the unpublished source cannot be adopted later.
        return stored ? { kind: 'grant', payload: { discarded: true } } : undefined;
      });
      if (discard) await credentials.deleteRecord(key);
    },
  };
}

/**
 * Connections ports and the adapter scope table.
 *
 * `REQUIRED_SCOPES` mirrors `minimumScopes` in `api/integration-adapters.json`,
 * which is a compatibility boundary (AGENTS.md). It is duplicated here rather
 * than imported so the browser bundle does not pull a contract file in, and a
 * unit test asserts the two stay identical — if the contract changes and this
 * table does not, the test fails rather than the screen quietly lying about
 * which permissions a service needs.
 *
 * `FixtureConnectionsPort` produces deterministic outcomes for the state matrix.
 * It never fabricates a success: a preview returns counts, and an execution only
 * reports what the preview said it would do.
 *
 * `RepositoryConnectionsPort` calls the real endpoints. No token, code or
 * authorization URL is exposed in the returned action result.
 */

import { connectionSyncDirection, type ConnectionActionResult, type ConnectionsPort } from "./connections-model.ts";
import { relayText, type RelayCopyKey } from "../relay-copy.ts";
import { countLabel } from "./screen-state.ts";

/** Keyed by adapter id. Source of truth: api/integration-adapters.json. */
export const REQUIRED_SCOPES: Readonly<Record<string, readonly string[]>> = {
  "google-calendar": [
    "https://www.googleapis.com/auth/calendar.events.readonly",
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  ],
  "google-tasks": ["https://www.googleapis.com/auth/tasks"],
  "toggl-focus": [],
  "toggl-track": [],
  // The Notion adapter declares no `minimumScopes` in the contract file. An
  // absent list is an empty list here, never an unknown one.
  notion: [],
};

export type ConnectionFailure = "none" | "permission" | "network" | "conflict";

const FAILURE_COPY: Readonly<Record<string, RelayCopyKey>> = {
  insufficient_scope: "connectionScopeMissing",
  offline: "statusOffline",
  integration_conflict: "statusConflict",
  reconnect_required: "connectionExpiredHint",
  integration_not_connected: "connectionDisconnectedHint",
  provider_not_configured: "connectionHeld",
  integration_busy: "executing",
  busy: "executing",
  invalid_response: "connectionInvalidResponse",
  integration_uses_dedicated_api: "connectionDedicated",
};

function failure(code: string): ConnectionActionResult {
  return { ok: false, code, get message() { return relayText(FAILURE_COPY[code] ?? "connectionFailed"); } };
}

function success(code: string, key: RelayCopyKey, preview?: ConnectionActionResult["preview"]): ConnectionActionResult {
  return { ok:true, code, preview, get message() { return relayText(key) + (preview === undefined ? "" : ` ${relayText("connectionCreated")}: ${countLabel(preview.imported)}, ${relayText("connectionUpdated")}: ${countLabel(preview.updated)}, ${relayText("connectionConflicts")}: ${countLabel(preview.conflicts ?? 0)}`); } };
}

export class FixtureConnectionsPort implements ConnectionsPort {
  private inFlight = false;

  constructor(private readonly mode: ConnectionFailure = "none") {}

  private guard(): ConnectionActionResult | null {
    if (this.mode === "permission") return failure("insufficient_scope");
    if (this.mode === "network") return failure("offline");
    if (this.mode === "conflict") return failure("integration_conflict");
    if (this.inFlight) return failure("busy");
    return null;
  }

  /* Deterministic counts derived from the adapter id, so the same preview
   * appears in every capture run rather than a random number. */
  private counts(id: string): { imported: number; updated: number; skipped: number } {
    const seed = [...id].reduce((total, character) => total + character.charCodeAt(0), 0);
    return { imported: seed % 5, updated: seed % 3, skipped: seed % 2 };
  }

  async previewSync(id: string): Promise<ConnectionActionResult> {
    const blocked = this.guard();
    if (blocked !== null) return blocked;
    return success("preview_ok", "connectionPreviewOnly", this.counts(id));
  }

  async runSync(id: string): Promise<ConnectionActionResult> {
    const blocked = this.guard();
    if (blocked !== null) return blocked;
    this.inFlight = true;
    try {
      // The execution reports exactly what the preview promised: the same
      // counts, from the same function, not a second independent calculation.
      const counts = this.counts(id);
      return success("sync_ok", "connectionDemo", counts);
    } finally {
      this.inFlight = false;
    }
  }

  async reconnect(_id: string): Promise<ConnectionActionResult> {
    const blocked = this.guard();
    if (blocked !== null) return blocked;
    /* A real reconnect leaves the app for the provider's consent screen. The
     * fixture says so rather than pretending the connection is now live. */
    return success("reconnect_started", "connectionDemo");
  }

  async disconnect(_id: string): Promise<ConnectionActionResult> {
    const blocked = this.guard();
    if (blocked !== null) return blocked;
    this.inFlight = true;
    try {
      return success("disconnect_ok", "connectionDemo");
    } finally {
      this.inFlight = false;
    }
  }
}

/** The subset of `QuestForgeRepository` this screen needs. */
export interface ConnectionsRepository {
  previewSync(service: string, direction?: string): Promise<Record<string, unknown>>;
  syncService(service: string, direction?: string): Promise<Record<string, unknown>>;
  connectIntegration(service: string): Promise<Record<string, unknown>>;
  disconnectIntegration(service: string): Promise<Record<string, unknown>>;
}

function counts(result: Record<string, unknown>): ConnectionActionResult["preview"] {
  const read = (key: string): number => {
    const value = result[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw Object.assign(new Error(), { code:"invalid_response" });
    return value;
  };
  return { imported: read("created"), updated: read("updated"), skipped: read("skipped"), conflicts: read("conflicts") };
}

export class RepositoryConnectionsPort implements ConnectionsPort {
  constructor(private readonly repository: ConnectionsRepository, private readonly navigate: (url: string) => void = url => (globalThis as unknown as { location: { assign(url: string): void } }).location.assign(url)) {}

  private async call(
    work: () => Promise<Record<string, unknown>>,
    id: string,
    code: "preview_ok" | "sync_ok" | "disconnect_ok",
  ): Promise<ConnectionActionResult> {
    try {
      const result = await work();
      if (code === "disconnect_ok") {
        if (!Array.isArray(result.disconnected) || !result.disconnected.includes(id)) throw Object.assign(new Error(), { code:"invalid_response" });
        return success(code, "connectionDisconnected");
      }
      if (result.service !== id || result.direction !== connectionSyncDirection(id) || result.dryRun !== (code === "preview_ok")) throw Object.assign(new Error(), { code:"invalid_response" });
      return success(code, code === "preview_ok" ? "connectionPreviewOnly" : "connectionSyncDone", counts(result));
    } catch (error) {
      const domain = error as { code?: string } | null;
      return failure(domain?.code ?? "failed");
    }
  }

  previewSync(id: string): Promise<ConnectionActionResult> {
    return this.call(() => this.repository.previewSync(id, connectionSyncDirection(id)), id, "preview_ok");
  }

  runSync(id: string): Promise<ConnectionActionResult> {
    return this.call(() => this.repository.syncService(id, connectionSyncDirection(id)), id, "sync_ok");
  }

  async reconnect(id: string): Promise<ConnectionActionResult> {
    try {
      const result = await this.repository.connectIntegration(id);
      const expected = id === "google-calendar" || id === "google-tasks" ? "https://accounts.google.com/o/oauth2/v2/auth" : id === "notion" ? "https://api.notion.com/v1/oauth/authorize" : "";
      const url = new URL(typeof result.authorizationUrl === "string" ? result.authorizationUrl : "");
      if (result.service !== id || `${url.origin}${url.pathname}` !== expected || url.username || url.password || url.hash || !url.searchParams.get("state")) return failure("invalid_response");
      this.navigate(url.href);
      return success("reconnect_started", "connectionReconnectStarted");
    } catch (error) {
      return failure((error as { code?: string } | null)?.code ?? "invalid_response");
    }
  }

  disconnect(id: string): Promise<ConnectionActionResult> {
    return this.call(() => this.repository.disconnectIntegration(id), id, "disconnect_ok");
  }
}

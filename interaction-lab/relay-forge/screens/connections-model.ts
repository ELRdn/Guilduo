/**
 * Connections — ViewModel, port and production adapter.
 *
 * DOM-free. The ViewModel has no field that could carry a token, a refresh
 * value or an authorization URL; see the header of `connections.ts`.
 */

import { questRef } from "../model.ts";
import type { ScreenNotice } from "./screen-state.ts";

/* ------------------------------------------------------------------ *
 * ViewModel
 * ------------------------------------------------------------------ */

/**
 * Health, derived from the fields the gateway actually returns:
 *   connected           status connected, no lastError
 *   degraded            status connected, lastError present
 *   expired             status reconnect_required
 *   permission_required configurationStatus admin_setup_required
 *   not_connected       status not_connected
 *   unavailable         status planned — the adapter is not shipped yet
 */
export type ConnectionHealth =
  | "connected"
  | "degraded"
  | "expired"
  | "permission_required"
  | "not_connected"
  | "unavailable";

export interface AffectedQuest {
  readonly id: string;
  readonly ref: string;
  readonly title: string;
}

export interface ConnectionView {
  readonly id: string;
  readonly name: string;
  /** oauth2 / personal_api_key / basic_api_token, verbatim from the adapter. */
  readonly auth: string;
  readonly health: ConnectionHealth;
  /** One sentence: what is true about this connection right now. */
  readonly summary: string;
  /** The provider's own failure text, when there is one. Never a token. */
  readonly lastError: string;
  readonly lastSyncedAt: string;
  /** Minimum scopes the adapter declares it needs. */
  readonly requiredScopes: readonly string[];
  readonly capabilities: readonly string[];
  readonly affectedQuests: readonly AffectedQuest[];
  /** Agent ids whose allowed scopes reference this integration. */
  readonly affectedAgents: readonly string[];
  /** The account label the gateway returns. Not an address we invented. */
  readonly accountLabel: string;
  readonly canSync: boolean;
  readonly canReconnect: boolean;
  readonly canDisconnect: boolean;
}

export interface ConnectionsModel {
  readonly connections: readonly ConnectionView[];
  readonly notices: readonly ScreenNotice[];
  readonly writeHeld: boolean;
  /** True when the gateway cannot report the granted scope set. */
  readonly grantedScopesUnavailable: boolean;
}

/* ------------------------------------------------------------------ *
 * Production adapter
 * ------------------------------------------------------------------ */

export const HEALTH_CHIP: Readonly<Record<ConnectionHealth, { label: string; mark: string; tone: "done" | "waiting" | "blocked" | "danger" | "neutral" | "review" }>> = {
  connected: { label: "接続中", mark: "==", tone: "done" },
  degraded: { label: "劣化", mark: "~~", tone: "waiting" },
  expired: { label: "失効", mark: "!!", tone: "danger" },
  permission_required: { label: "権限が必要", mark: "!?", tone: "review" },
  not_connected: { label: "未接続", mark: "--", tone: "neutral" },
  unavailable: { label: "提供前", mark: "..", tone: "neutral" },
};

/** Health ordering: what needs attention first. */
const HEALTH_WEIGHT: Readonly<Record<ConnectionHealth, number>> = {
  expired: 0,
  permission_required: 1,
  degraded: 2,
  connected: 3,
  not_connected: 4,
  unavailable: 5,
};

export interface IntegrationRecord {
  readonly id: string;
  readonly name: string;
  readonly auth: string;
  readonly status: string;
  readonly capabilities: readonly string[];
  readonly configurationStatus: string;
  readonly account: {
    readonly status: string;
    readonly providerAccountName: string;
    readonly lastSyncedAt: string;
    readonly lastError: string;
  } | null;
}

export interface QuestLinkRecord {
  readonly id: string;
  readonly title: string;
  /** `externalLinks[].service` values on this Quest. */
  readonly services: readonly string[];
}

export interface AgentScopeRecord {
  readonly agentId: string;
  readonly displayName: string;
  readonly allowedScopes: readonly string[];
}

export interface NormalizeConnectionsOptions {
  readonly integrations: readonly IntegrationRecord[];
  /** `minimumScopes` per adapter id, read from api/integration-adapters.json. */
  readonly requiredScopes: Readonly<Record<string, readonly string[]>>;
  readonly questLinks: readonly QuestLinkRecord[];
  readonly agents: readonly AgentScopeRecord[];
  readonly notices?: readonly ScreenNotice[];
  readonly writeHeld?: boolean;
}

function healthOf(record: IntegrationRecord): ConnectionHealth {
  if (record.status === "planned") return "unavailable";
  if (record.configurationStatus === "admin_setup_required") return "permission_required";
  if (record.status === "reconnect_required") return "expired";
  if (record.status === "connected") {
    return record.account !== null && record.account.lastError !== "" ? "degraded" : "connected";
  }
  return "not_connected";
}

function summaryOf(health: ConnectionHealth, record: IntegrationRecord): string {
  switch (health) {
    case "connected":
      return "正常に同期しています。";
    case "degraded":
      return "接続は生きていますが、直近の同期で問題が出ています。";
    case "expired":
      return "アクセス権が失効しました。再接続するまで同期は止まります。";
    case "permission_required":
      return "この環境ではプロバイダ設定が未完了です。管理者の設定が必要です。";
    case "not_connected":
      return "まだ接続していません。接続するとQuestの取り込みが始まります。";
    default:
      return `${record.name} はまだ提供されていません。`;
  }
}

export function normalizeConnectionsModel(options: NormalizeConnectionsOptions): ConnectionsModel {
  const connections = options.integrations.map((record): ConnectionView => {
    const health = healthOf(record);
    const affectedQuests = options.questLinks
      .filter((link) => link.services.includes(record.id))
      .map((link) => ({ id: link.id, ref: questRef(link.id), title: link.title }));
    const affectedAgents = options.agents
      .filter((agent) => agent.allowedScopes.some((scope) => scope.startsWith("integrations:")))
      .map((agent) => agent.displayName);
    return {
      id: record.id,
      name: record.name,
      auth: record.auth,
      health,
      summary: summaryOf(health, record),
      lastError: record.account?.lastError ?? "",
      lastSyncedAt: record.account?.lastSyncedAt ?? "",
      requiredScopes: options.requiredScopes[record.id] ?? [],
      capabilities: record.capabilities,
      affectedQuests,
      affectedAgents,
      accountLabel: record.account?.providerAccountName ?? "",
      // Only a live connection can be synced; only a real one can be revoked.
      canSync: health === "connected" || health === "degraded",
      canReconnect: health === "expired" || health === "not_connected",
      canDisconnect: health === "connected" || health === "degraded" || health === "expired",
    };
  });

  connections.slice().sort();
  const sorted = [...connections].sort((left, right) => {
    const byHealth = HEALTH_WEIGHT[left.health] - HEALTH_WEIGHT[right.health];
    if (byHealth !== 0) return byHealth;
    return right.affectedQuests.length - left.affectedQuests.length;
  });

  return {
    connections: sorted,
    notices: options.notices ?? [],
    writeHeld: options.writeHeld ?? false,
    // The gateway has no field for the granted set; this is not a load failure.
    grantedScopesUnavailable: true,
  };
}

/* ------------------------------------------------------------------ *
 * Port
 * ------------------------------------------------------------------ */

export interface ConnectionActionResult {
  readonly ok: boolean;
  readonly code: string;
  readonly message: string;
  /** For a sync preview: what the run would change. Counts only. */
  readonly preview?: { readonly imported: number; readonly updated: number; readonly skipped: number };
}

export interface ConnectionsPort {
  /** `POST /v1/integrations/{id}/sync` with `dryRun: true`. Writes nothing. */
  previewSync(id: string): Promise<ConnectionActionResult>;
  /** The same endpoint with `dryRun: false`. */
  runSync(id: string): Promise<ConnectionActionResult>;
  /** `POST /v1/integrations/{id}/connect`. */
  reconnect(id: string): Promise<ConnectionActionResult>;
  /** `POST /v1/integrations/{id}/disconnect`. Revokes, keeps the Quests. */
  disconnect(id: string): Promise<ConnectionActionResult>;
}

/** Health values that require a human to do something. Pure, so it is shared. */
export function needsAttention(connection: ConnectionView): boolean {
  return connection.health === "expired"
    || connection.health === "degraded"
    || connection.health === "permission_required";
}

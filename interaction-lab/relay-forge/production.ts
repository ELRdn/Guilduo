import type { Quest, BattleSession } from "../../types/questforge.ts";
import { QuestForgeRepository } from "../repository.ts";
import {
  normalizeCommandModel,
  type AgentRecordView,
  type HandoffPort,
  type ProfileRecord,
} from "./adapter.ts";
import type { CommandModel } from "./model.ts";
import { RepositoryBattlePort } from "./screens/battle-port.ts";
import type { BattlePort } from "./screens/battle-model.ts";
import {
  RepositoryConnectionsPort,
} from "./screens/connections-port.ts";
import type { ConnectionsPort } from "./screens/connections-model.ts";
import type { AgentRecord, PartyMemberRecord } from "./screens/party-model.ts";
import type { IntegrationRecord } from "./screens/connections-model.ts";
import type { SettingsMcpConnectionRow } from "./screens/settings-model.ts";

type JsonRecord = Record<string, unknown>;

export interface RelayForgeRuntime {
  readonly mode: "production";
  readonly model: CommandModel;
  readonly profile: ProfileRecord | null;
  readonly email: string;
  readonly profileLoadError: string | null;
  readonly quests: readonly Quest[];
  readonly selfUid: string;
  readonly members: readonly PartyMemberRecord[];
  readonly agents: readonly AgentRecord[];
  readonly integrations: readonly IntegrationRecord[];
  readonly partyName: string;
  readonly questPort: Pick<QuestForgeRepository, "createQuest" | "updateQuest">;
  readonly agentPort: Pick<QuestForgeRepository, "createAgent" | "updateAgent">;
  readonly handoffPort: HandoffPort;
  readonly battlePort: BattlePort;
  readonly battleSession: BattleSession | null;
  readonly connectionsPort: ConnectionsPort;
  /** The Gateway base URL actually in use — Settings derives the MCP URL from this. */
  readonly gatewayUrl: string;
  readonly profilePort: Pick<QuestForgeRepository, "getProfile" | "updateProfile">;
  readonly profileAvatarPort: Pick<QuestForgeRepository, "uploadProfileAvatar" | "fetchProfileAvatar" | "deleteProfileAvatar">;
  readonly agentAvatarPort: Pick<QuestForgeRepository, "uploadAgentAvatar" | "fetchAgentAvatar">;
  readonly agentConnectionPort: Pick<QuestForgeRepository, "listAgentConnections" | "linkAgentConnection" | "unlinkAgentConnection" | "revokeMcpConnection" | "disconnectMcpConnection" | "deleteMcpConnection">;
  readonly agentConnections: readonly SettingsMcpConnectionRow[];
  readonly agentConnectionsLoadError: string | null;
  readonly mcpToolsPort: Pick<QuestForgeRepository, "listMcpTools">;
  readonly mcpTools: readonly unknown[];
  readonly mcpToolsLoadError: string | null;
  /**
   * Injected by the composition root (`main.ts`), never imported by the shell
   * directly, so Appwrite Auth stays a swappable port rather than a hard
   * dependency of the Relay Forge UI.
   */
  readonly signOut?: () => Promise<void>;
}

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeAgentConnections(value: unknown): SettingsMcpConnectionRow[] {
  const source = record(value);
  const rows = new Map<string, SettingsMcpConnectionRow>();
  const authorizedClients = Array.isArray(source.authorizedClients) ? source.authorizedClients : [];
  for (const item of authorizedClients) {
    const client = record(item);
    const clientId = text(client.clientId);
    if (!clientId) continue;
    rows.set(clientId, {
      clientId,
      clientName: text(client.clientName) || "Guilduo MCP client",
      scopes: strings(client.scopes),
      firstConnectedAt: text(client.firstConnectedAt),
      lastUsedAt: text(client.lastUsedAt),
      linkedAgentId: null,
      linkRevokedAt: null,
      authorized: !text(client.revokedAt),
      revokedAt: text(client.revokedAt) || null,
    });
  }
  const connections = Array.isArray(source.connections) ? source.connections : [];
  for (const item of connections) {
    const connection = record(item);
    const clientId = text(connection.clientId);
    if (!clientId) continue;
    const previous = rows.get(clientId);
    rows.set(clientId, {
      clientId,
      clientName: text(connection.clientName) || previous?.clientName || "Guilduo MCP client",
      scopes: strings(connection.scopes).length > 0 ? strings(connection.scopes) : previous?.scopes ?? [],
      firstConnectedAt: text(connection.firstConnectedAt) || previous?.firstConnectedAt || "",
      lastUsedAt: text(connection.lastUsedAt) || previous?.lastUsedAt || "",
      linkedAgentId: text(connection.agentId) || previous?.linkedAgentId || null,
      linkRevokedAt: text(connection.revokedAt) || null,
      authorized: previous?.authorized ?? false,
      revokedAt: previous?.revokedAt ?? null,
    });
  }
  return [...rows.values()].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt) || a.clientName.localeCompare(b.clientName));
}

export function normalizeProfileRecord(item: unknown): ProfileRecord | null {
  const profile = record(item);
  if (Object.keys(profile).length === 0) return null;
  const avatarVersion = Number(profile.avatarVersion);
  return {
    uid: text(profile.uid),
    displayName: text(profile.displayName),
    handle: text(profile.handle).trim().replace(/^@+/, ""),
    bio: text(profile.bio),
    avatarUrl: text(profile.avatarUrl),
    avatarRole: text(profile.avatarRole),
    avatarVariant: text(profile.avatarVariant),
    hasCustomAvatar: profile.hasCustomAvatar === true && Number.isSafeInteger(avatarVersion) && avatarVersion > 0,
    avatarVersion: Number.isSafeInteger(avatarVersion) && avatarVersion > 0 ? avatarVersion : 0,
  };
}

export function normalizePartyMembers(
  party: JsonRecord,
  selfUid: string,
  profile: ProfileRecord,
): PartyMemberRecord[] {
  const source = Array.isArray(party.members) ? party.members : [];
  const members = source.map((item) => {
    const member = record(item);
    return {
      uid: text(member.uid),
      displayName: text(member.displayName) || text(member.handle) || "Member",
      handle: text(member.handle),
      role: member.role === "owner" ? "owner" as const : "member" as const,
      joinedAt: text(member.joinedAt),
      level: typeof member.level === "number" ? member.level : 0,
    };
  }).filter((member) => member.uid !== "");
  if (selfUid !== "" && !members.some((member) => member.uid === selfUid)) {
    members.unshift({
      uid: selfUid,
      displayName: text(profile.displayName) || text(profile.handle) || "あなた",
      handle: text(profile.handle),
      role: "owner",
      joinedAt: "",
      level: 0,
    });
  }
  return members;
}

/**
 * The image bytes never pass through this function or through `/v1/agents` —
 * `hasCustomAvatar` and `avatarVersion` only tell the caller whether one
 * exists and which version it is. Resolving that into a displayable
 * `avatarUrl` (a Blob object URL, fetched over the authenticated avatar
 * route) is the shell's job, not this normalizer's — see
 * `withCachedAvatar`/`refreshAgentAvatars` in `shell.ts`.
 */
export function normalizeAgentRecord(item: unknown): AgentRecord | null {
    const agent = record(item);
    const agentId = text(agent.agentId);
    const avatarVersion = typeof agent.avatarVersion === "number" && agent.avatarVersion > 0 ? agent.avatarVersion : 0;
    const hasCustomAvatar = agent.hasCustomAvatar === true && avatarVersion > 0;
    const normalized: AgentRecord = {
      agentId,
      displayName: text(agent.displayName) || agentId || "Agent",
      provider: text(agent.provider),
      role: text(agent.role),
      instructions: text(agent.instructions),
      status: text(agent.status),
      allowedScopes: strings(agent.allowedScopes),
      reviewRequired: agent.reviewRequired === true,
      dryRunDefault: agent.dryRunDefault !== false,
      defaultHandoffState: text(agent.defaultHandoffState),
      updatedAt: text(agent.updatedAt),
      avatarVersion,
      hasCustomAvatar,
    };
    return normalized.agentId === "" ? null : normalized;
}

function normalizeAgents(source: readonly unknown[]): AgentRecord[] {
  return source.map((item) => normalizeAgentRecord(item)).filter((agent): agent is AgentRecord => agent !== null);
}

function normalizeIntegrations(source: readonly unknown[]): IntegrationRecord[] {
  return source.map((item) => {
    const integration = record(item);
    const accountValue = record(integration.account);
    const account = Object.keys(accountValue).length === 0 ? null : {
      status: text(accountValue.status),
      providerAccountName: text(accountValue.providerAccountName),
      lastSyncedAt: text(accountValue.lastSyncedAt),
      lastError: text(accountValue.lastError),
    };
    return {
      id: text(integration.id),
      name: text(integration.name) || text(integration.id),
      auth: text(integration.auth),
      status: text(integration.status),
      capabilities: strings(integration.capabilities),
      configurationStatus: text(integration.configurationStatus),
      account,
    };
  }).filter((integration) => integration.id !== "");
}

export async function createProductionRuntime(
  repository: QuestForgeRepository,
  selfUid: string,
  email = "",
): Promise<RelayForgeRuntime> {
  const snapshot = await repository.loadSnapshot();
  const quests = snapshot.quests as Quest[];
  const profile = normalizeProfileRecord(snapshot.profile);
  const effectiveProfile: ProfileRecord = profile ?? { uid: selfUid, displayName: "あなた" };
  const agents = normalizeAgents(snapshot.agents);
  const integrations = normalizeIntegrations(snapshot.integrations);
  const party = record(snapshot.party);
  const model = normalizeCommandModel({
    profile: effectiveProfile,
    agents: agents as AgentRecordView[],
    quests,
    syncLabel: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
  });

  return {
    mode: "production",
    model,
    profile,
    email: email.trim(),
    profileLoadError: snapshot.panelErrors.find((entry) => entry.index === 3)?.message ?? null,
    quests,
    selfUid,
    members: normalizePartyMembers(party, selfUid, effectiveProfile),
    agents,
    integrations,
    partyName: text(party.name) || "Guild Party",
    questPort: repository,
    agentPort: repository,
    handoffPort: repository,
    battlePort: new RepositoryBattlePort(repository),
    battleSession: Object.keys(snapshot.battle).length === 0 ? null : snapshot.battle as unknown as BattleSession,
    connectionsPort: new RepositoryConnectionsPort(repository),
    gatewayUrl: repository.baseUrl,
    profilePort: repository,
    profileAvatarPort: repository,
    agentAvatarPort: repository,
    agentConnectionPort: repository,
    agentConnections: normalizeAgentConnections(snapshot.agentConnections),
    agentConnectionsLoadError: snapshot.panelErrors.find((entry) => entry.index === 6)?.message ?? null,
    mcpToolsPort: repository,
    mcpTools: snapshot.mcpTools,
    mcpToolsLoadError: snapshot.panelErrors.find((entry) => entry.index === 7)?.message ?? null,
  };
}

export { normalizeAgentConnections };

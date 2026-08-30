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

type JsonRecord = Record<string, unknown>;

export interface RelayForgeRuntime {
  readonly mode: "production";
  readonly model: CommandModel;
  readonly profile: ProfileRecord | null;
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
  readonly profilePort: Pick<QuestForgeRepository, "updateProfile">;
  readonly agentAvatarPort: Pick<QuestForgeRepository, "uploadAgentAvatar" | "fetchAgentAvatar">;
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
): Promise<RelayForgeRuntime> {
  const snapshot = await repository.loadSnapshot();
  const quests = snapshot.quests as Quest[];
  const profile = snapshot.profile as ProfileRecord | null;
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
    agentAvatarPort: repository,
  };
}

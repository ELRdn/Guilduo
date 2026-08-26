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
  readonly handoffPort: HandoffPort;
  readonly battlePort: BattlePort;
  readonly battleSession: BattleSession | null;
  readonly connectionsPort: ConnectionsPort;
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

function normalizeMembers(party: JsonRecord): PartyMemberRecord[] {
  const source = Array.isArray(party.members) ? party.members : [];
  return source.map((item) => {
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
}

function normalizeAgents(source: readonly unknown[]): AgentRecord[] {
  return source.map((item) => {
    const agent = record(item);
    return {
      agentId: text(agent.agentId),
      displayName: text(agent.displayName) || text(agent.agentId) || "Agent",
      provider: text(agent.provider),
      role: text(agent.role),
      status: text(agent.status),
      allowedScopes: strings(agent.allowedScopes),
      reviewRequired: agent.reviewRequired === true,
      dryRunDefault: agent.dryRunDefault !== false,
      defaultHandoffState: text(agent.defaultHandoffState),
      updatedAt: text(agent.updatedAt),
    };
  }).filter((agent) => agent.agentId !== "");
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
  const agents = normalizeAgents(snapshot.agents);
  const integrations = normalizeIntegrations(snapshot.integrations);
  const party = record(snapshot.party);
  const model = normalizeCommandModel({
    profile,
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
    members: normalizeMembers(party),
    agents,
    integrations,
    partyName: text(party.name) || "Guild Party",
    questPort: repository,
    handoffPort: repository,
    battlePort: new RepositoryBattlePort(repository),
    battleSession: Object.keys(snapshot.battle).length === 0 ? null : snapshot.battle as unknown as BattleSession,
    connectionsPort: new RepositoryConnectionsPort(repository),
  };
}

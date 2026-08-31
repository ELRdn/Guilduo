/**
 * Skills — the MCP capability catalogue.
 *
 * MCP exposes tools as a flat protocol list, but a flat list is a poor product
 * explanation. This adapter keeps the protocol name intact while grouping the
 * same records into human-readable capabilities. It is deliberately DOM-free
 * so grouping and search can be tested without a browser.
 */

export type SkillsStatus = "loading" | "unconnected" | "empty" | "error" | "ready";
export type SkillToolAvailability = "available" | "unavailable";

export interface SkillToolView {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly availability: SkillToolAvailability;
  readonly categoryId: string;
  readonly categoryTitle: string;
}

export interface SkillGroupView {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly tools: readonly SkillToolView[];
  readonly availableCount: number;
}

export interface SkillsModel {
  readonly status: SkillsStatus;
  readonly sourceLabel: string;
  readonly sourceUrl: string;
  readonly connectionLabel: string;
  readonly query: string;
  readonly totalToolCount: number;
  readonly visibleToolCount: number;
  readonly groups: readonly SkillGroupView[];
  readonly error: string | null;
}

export interface NormalizeSkillsOptions {
  readonly tools: readonly unknown[];
  readonly sourceLabel?: string;
  readonly sourceUrl?: string;
  readonly connectionLabel?: string;
  readonly query?: string;
  readonly loading?: boolean;
  readonly connected?: boolean;
  readonly error?: string | null;
}

export interface SkillsState {
  query: string;
  /** A record keeps the state serialisable and avoids a DOM-coupled Set. */
  expandedGroups: Record<string, boolean>;
}

export function initialSkillsState(): SkillsState {
  return {
    query: "",
    expandedGroups: { "quest-management": true },
  };
}

interface CategoryDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly aliases: readonly string[];
}

export const SKILL_CATEGORIES: readonly CategoryDefinition[] = [
  {
    id: "quest-management",
    title: "Quest Management",
    description: "Questの作成・更新・担当・進行を管理します。",
    aliases: ["quest", "quests", "quest-management", "task", "tasks"],
  },
  {
    id: "agent-relay",
    title: "Agent & Relay",
    description: "Agent、接続、担当、Handoffを管理します。",
    aliases: ["agent", "agents", "agent-relay", "relay", "handoff"],
  },
  {
    id: "connections-sync",
    title: "Connections & Sync",
    description: "外部サービスの接続、同期、Toggl連携を扱います。",
    aliases: ["connection", "connections", "connections-sync", "sync", "integration", "integrations"],
  },
  {
    id: "profile-social",
    title: "Profile & Social",
    description: "プロフィール、Friends、Partyを管理します。",
    aliases: ["profile", "social", "friends", "party"],
  },
  {
    id: "battle-rewards",
    title: "Battle & Rewards",
    description: "Character、Battle、Rewardの状態を扱います。",
    aliases: ["battle", "rewards", "reward", "character"],
  },
  {
    id: "review-activity",
    title: "Review & Activity",
    description: "Daily brief、Review、Activityの履歴を確認します。",
    aliases: ["review", "activity", "brief"],
  },
  {
    id: "other",
    title: "Other / Utilities",
    description: "まだ分類できないToolをここにまとめています。",
    aliases: ["other", "utility", "utilities", "misc"],
  },
];

const CATEGORY_BY_ID = new Map(SKILL_CATEGORIES.map((category) => [category.id, category]));
const CATEGORY_BY_ALIAS = new Map(
  SKILL_CATEGORIES.flatMap((category) => category.aliases.map((alias) => [alias, category.id] as const)),
);

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function humanizeToolName(name: string): string {
  return name
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim() || "MCP Tool";
}

function normalizedCategory(value: string): string | null {
  const key = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  const alias = CATEGORY_BY_ALIAS.get(key);
  if (alias !== undefined) return alias;
  return CATEGORY_BY_ID.has(key) ? key : null;
}

/** Metadata is authoritative when it maps to a known catalogue category. */
function metadataCategory(source: JsonRecord): string | null {
  const metadata = record(source.metadata);
  const annotations = record(source.annotations);
  const candidates = [
    source.category,
    source.skill,
    source.group,
    source.domain,
    metadata.category,
    metadata.skill,
    metadata.group,
    annotations.category,
    annotations.skill,
    annotations.group,
  ];
  for (const candidate of candidates) {
    const category = normalizedCategory(text(candidate));
    if (category !== null) return category;
  }
  return null;
}

/** Existing tool names are a compatibility fallback until metadata is added. */
function nameCategory(name: string): string {
  if (/^(list_today_quests|list_quests|create_quest|update_quest|batch_.*_quests?|archive_quests|link_external_record|score_quest|get_quest(?:_tree)?|get_calendar_schedule|convert_calendar_event_to_quest)$/.test(name)) return "quest-management";
  if (/^(list_agent_handoffs|list_registered_agents|get_current_agent_context|get_agent_link|link_agent|unlink_agent|assign_quest_to_agent|transition_quest_handoff)$/.test(name)) return "agent-relay";
  if (/^(list_integrations|.*toggl.*|preview_external_sync|sync_external_service)$/.test(name)) return "connections-sync";
  if (/^(get_my_profile|find_profile_by_handle|update_profile|list_friends|list_friend_requests|send_friend_request|respond_friend_request|remove_friend|get_party|create_party|invite_party_member|accept_party_invite|leave_party|remove_party_member)$/.test(name)) return "profile-social";
  if (/^(get_character_state|buy_reward|get_battle_session|battle_command)$/.test(name)) return "battle-rewards";
  if (/^(get_daily_brief|get_review_summary|list_activity_events)$/.test(name)) return "review-activity";
  return "other";
}

function categoryFor(source: JsonRecord, name: string): string {
  return metadataCategory(source) ?? nameCategory(name);
}

function availabilityFor(source: JsonRecord): SkillToolAvailability {
  if (source.available === false || source.enabled === false) return "unavailable";
  const status = text(source.status).toLowerCase();
  return status === "disabled" || status === "unavailable" ? "unavailable" : "available";
}

export function normalizeMcpTool(value: unknown): SkillToolView | null {
  const source = record(value);
  const name = text(source.name) || text(source.toolName);
  if (name === "") return null;
  const categoryId = categoryFor(source, name);
  const category = CATEGORY_BY_ID.get(categoryId) ?? CATEGORY_BY_ID.get("other") as CategoryDefinition;
  return {
    name,
    title: text(source.title) || text(source.displayName) || humanizeToolName(name),
    description: text(source.description) || "Guilduo MCPで利用できるToolです。",
    availability: availabilityFor(source),
    categoryId: category.id,
    categoryTitle: category.title,
  };
}

function normalizedTools(values: readonly unknown[]): SkillToolView[] {
  const unique = new Map<string, SkillToolView>();
  for (const value of values) {
    const tool = normalizeMcpTool(value);
    if (tool !== null && !unique.has(tool.name)) unique.set(tool.name, tool);
  }
  return [...unique.values()];
}

function matches(tool: SkillToolView, category: CategoryDefinition, query: string): boolean {
  if (query === "") return true;
  return [tool.title, tool.name, tool.description, category.title, category.description]
    .some((value) => value.toLocaleLowerCase().includes(query));
}

/**
 * Groups the live `tools/list` response. A future tool automatically lands in
 * the explicit metadata category, the name fallback, or Other / Utilities.
 */
export function normalizeSkillsModel(options: NormalizeSkillsOptions): SkillsModel {
  const query = options.query?.trim().toLocaleLowerCase() ?? "";
  const tools = normalizedTools(options.tools);
  const connected = options.connected ?? (options.sourceUrl?.trim() !== "");
  const error = options.error?.trim() || null;
  const status: SkillsStatus = options.loading === true
    ? "loading"
    : !connected
      ? "unconnected"
      : error !== null
        ? "error"
        : tools.length === 0
          ? "empty"
          : "ready";
  const groups = SKILL_CATEGORIES.map((category): SkillGroupView => {
    const visible = tools.filter((tool) => tool.categoryId === category.id && matches(tool, category, query));
    return {
      id: category.id,
      title: category.title,
      description: category.description,
      tools: visible,
      availableCount: visible.filter((tool) => tool.availability === "available").length,
    };
  }).filter((group) => group.tools.length > 0);
  return {
    status,
    sourceLabel: options.sourceLabel?.trim() || "Guilduo MCP",
    sourceUrl: options.sourceUrl?.trim() || "",
    connectionLabel: options.connectionLabel?.trim() || "Current authenticated session",
    query: options.query?.trim() || "",
    totalToolCount: tools.length,
    visibleToolCount: groups.reduce((total, group) => total + group.tools.length, 0),
    groups,
    error,
  };
}

/** Representative fixture data for the local visual lab only; production uses tools/list. */
export const FIXTURE_MCP_TOOLS: readonly unknown[] = [
  { name: "create_quest", title: "Create Quest", description: "Create a Guilduo Quest with planning details." },
  { name: "update_quest", title: "Update Quest", description: "Update Quest fields and progress safely." },
  { name: "get_quest_tree", title: "Get Quest Tree", description: "Read parent and child Quest progress." },
  { name: "get_agent_link", title: "Get Agent Link", description: "Check the Agent linked to this MCP connection." },
  { name: "link_agent", title: "Link MCP Connection to Agent", description: "Choose which Agent this connection acts as." },
  { name: "transition_quest_handoff", title: "Transition Quest Handoff", description: "Move an Agent handoff through its lifecycle." },
  { name: "list_integrations", title: "List Integrations", description: "Inspect available external services and health." },
  { name: "sync_external_service", title: "Sync External Service", description: "Synchronize a connected service." },
  { name: "get_my_profile", title: "Get My Profile", description: "Read the authenticated Guilduo profile." },
  { name: "get_party", title: "Get Party", description: "Read the current Guilduo Party." },
  { name: "get_battle_session", title: "Get Battle Session", description: "Read the current Battle session." },
  { name: "get_review_summary", title: "Get Review Summary", description: "Summarize completed work and activity." },
];

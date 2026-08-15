// @ts-nocheck
import {
  DomainError,
  archiveQuests,
  assertScope,
  batchScoreQuests,
  batchUpdateQuests,
  battleCommand,
  buyReward,
  characterState,
  createQuest,
  getBattleSession,
  getQuest,
  getQuestTree,
  linkExternalRecord,
  listAgentHandoffs,
  listEvents,
  listQuestPage,
  listQuests,
  patchQuest,
  purgeManagedFocusLinks,
  scoreQuest,
  migrateState,
  todayText,
  transitionQuestHandoff,
} from "../../server/questforge-domain.ts";
import { mutateState, readState } from "./firebase-store.ts";
import { authenticateRequest } from "./security.ts";
import {
  approveAuthorization,
  authorizePage,
  getAuthorizedClient,
  listAuthorizedClients,
  noteAuthorizedClientUse,
  oauthMetadata,
  protectedResourceMetadata,
  registerClient,
  revokeAuthorizedClient,
  revokeToken,
  tokenEndpoint,
} from "./oauth.ts";
import {
  createAgent,
  getAgent,
  getAgentForClient,
  linkAgentConnection,
  listAgentConnections,
  listAgents,
  noteAgentConnectionUse,
  unlinkAgentConnection,
  updateAgent,
} from "./agent-store.ts";
import {
  calendarSchedule,
  configureIntegration,
  convertCalendarEvent,
  exportQuestToGoogleTasks,
  listIntegrationResources,
  listIntegrations,
  resolveGoogleTaskConflict,
  syncIntegration,
} from "./integrations.ts";
import {
  applyTogglFocusAttribution,
  configureTogglFocus,
  connectTogglFocus,
  getTogglFocusEstimateInsights,
  getTogglFocusTracking,
  isTogglFocusAutoCreateEnabled,
  isTogglFocusService,
  listTogglFocusEntries,
  listTogglFocusResources,
  previewTogglFocusAttribution,
  purgeTogglFocus,
  startTogglFocusTracking,
  stopTogglFocusTracking,
  syncQuestToTogglFocus,
} from "./toggl-focus.ts";
import { listDueIntegrationAccounts } from "./integration-store.ts";
import { beginIntegrationConnect, disconnectIntegration, handleProviderCallback } from "./provider-oauth.ts";
import { handleMcpNext } from "./mcp-server.ts";
import {
  createWebhook,
  deleteWebhook,
  deliverEvent,
  installPlugin,
  listPlugins,
  listWebhooks,
  retryDeliveries,
  validateManifest,
} from "./extensions.ts";
import {
  acceptFriendRequest,
  acceptPartyInvite,
  createParty,
  declineFriendRequest,
  findProfileByHandle,
  getOwnProfile,
  getParty,
  inviteToParty,
  leaveParty,
  listFriendRequests,
  listFriends,
  removeFriend,
  removePartyMember,
  sendFriendRequest,
  upsertProfile,
} from "./social-store.ts";

const QUEST_INPUT_PROPERTIES = {
  kind: { type: "string", enum: ["habit", "daily", "todo", "reward"] },
  title: { type: "string", maxLength: 80 }, notes: { type: "string", maxLength: 180 }, category: { type: "string", maxLength: 40 },
  planningState: { type: "string", enum: ["scheduled", "backlog"] }, lifecycleState: { type: "string", enum: ["active", "completed", "archived"] },
  planningMode: { type: "string", enum: ["on_date", "until_due"] }, scheduledDate: { type: "string", format: "date" },
  scheduledTime: { type: "string", pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" }, dueDate: { type: "string", format: "date" },
  repeat: { type: "string", enum: ["none", "daily", "weekdays", "weekly", "monthly"] },
  difficulty: { type: "string", enum: ["trivial", "easy", "medium", "hard"] }, tags: { type: "array", items: { type: "string" }, maxItems: 6 },
  estimatedMinutes: { type: "integer", minimum: 0 }, actualMinutes: { type: "integer", minimum: 0 },
  completionCriteria: { type: "string", maxLength: 300 }, nextAction: { type: "string", maxLength: 180 },
  impact: { type: "string", enum: ["low", "medium", "high"] }, isBlockingOthers: { type: "boolean" },
  dependencyIds: { type: "array", items: { type: "string" }, maxItems: 20 },
  parentQuestId: { type: "string", maxLength: 120 },
  handoff: {
    type: "object",
    properties: {
      note: { type: "string", maxLength: 500 },
      blockedReason: { type: "string", maxLength: 500 },
      artifactUrl: { type: "string", format: "uri" },
      startedAt: { type: "string", format: "date-time" },
      reviewRequestedAt: { type: "string", format: "date-time" },
      reviewedAt: { type: "string", format: "date-time" },
      reviewedBy: { type: "string", maxLength: 120 },
    },
  },
  assignee: {
    type: "object",
    required: ["type", "id", "label"],
    properties: {
      type: { type: "string", enum: ["self", "human", "agent"] },
      id: { type: "string", minLength: 1, maxLength: 120 },
      label: { type: "string", minLength: 1, maxLength: 80 },
      handoffState: { type: "string", enum: ["none", "ready", "working", "blocked", "review_required", "accepted"], default: "none" },
    },
  },
};

const LIST_QUEST_PROPERTIES = {
  view: { type: "string", enum: ["today", "week", "future", "backlog", "completed", "archive", "all"], default: "all" },
  date: { type: "string", format: "date" }, kind: QUEST_INPUT_PROPERTIES.kind, category: { type: "string" }, tag: { type: "string" },
  planningState: QUEST_INPUT_PROPERTIES.planningState, lifecycleState: QUEST_INPUT_PROPERTIES.lifecycleState,
  parentQuestId: QUEST_INPUT_PROPERTIES.parentQuestId, rootOnly: { type: "boolean", default: false },
  from: { type: "string", format: "date" }, to: { type: "string", format: "date" }, search: { type: "string" },
  limit: { type: "integer", minimum: 1, maximum: 200, default: 100 }, cursor: { type: "string" },
};

const READ_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const IDEMPOTENT_WRITE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const DESTRUCTIVE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };
const DESTRUCTIVE_IDEMPOTENT_ANNOTATIONS = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
const OPEN_WORLD_READ_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const OPEN_WORLD_WRITE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const OPEN_WORLD_IDEMPOTENT_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const TELEMETRY_EVENT_NAMES = new Set(["web_vitals", "js_error", "sync_success", "sync_failure", "first_quest_complete", "mcp_connection_success", "agent_assignment_success"]);

const QUEST_OBJECT = { type: "object" };
const QUEST_LIST_PAGE_OUTPUT = {
  type: "object",
  properties: { quests: { type: "array", items: QUEST_OBJECT }, total: { type: "integer" }, limit: { type: "integer" }, nextCursor: { type: ["string", "null"] } },
  additionalProperties: false,
};
const QUEST_AND_EVENT_OUTPUT = {
  type: "object",
  properties: { quest: QUEST_OBJECT, event: QUEST_OBJECT, events: { type: "array", items: QUEST_OBJECT } },
  additionalProperties: false,
};
const AGENT_ASSIGNMENT_OUTPUT = {
  type: "object",
  properties: { dryRun: { type: "boolean" }, quest: QUEST_OBJECT, event: QUEST_OBJECT, events: { type: "array", items: QUEST_OBJECT } },
  additionalProperties: false,
};
const BATCH_OUTPUT = {
  type: "object",
  properties: { dryRun: { type: "boolean" }, count: { type: "integer" }, quests: { type: "array", items: QUEST_OBJECT }, events: { type: "array", items: QUEST_OBJECT } },
  additionalProperties: false,
};
const CHARACTER_OUTPUT = { type: "object", properties: { character: QUEST_OBJECT }, additionalProperties: false };
const SCORE_OUTPUT = {
  type: "object",
  properties: { quest: QUEST_OBJECT, reward: QUEST_OBJECT, rewardGranted: { type: "boolean" }, character: QUEST_OBJECT, battle: QUEST_OBJECT, event: QUEST_OBJECT },
  additionalProperties: false,
};
const BATCH_SCORE_OUTPUT = {
  type: "object",
  properties: {
    dryRun: { type: "boolean" }, count: { type: "integer" },
    quests: { type: "array", items: QUEST_OBJECT },
    rewards: { type: "array", items: QUEST_OBJECT },
    character: QUEST_OBJECT, battle: QUEST_OBJECT,
    events: { type: "array", items: QUEST_OBJECT },
  },
  additionalProperties: false,
};
const REWARD_OUTPUT = { type: "object", properties: { quest: QUEST_OBJECT, cost: { type: "integer" }, character: QUEST_OBJECT, event: QUEST_OBJECT }, additionalProperties: false };
const SYNC_OUTPUT = {
  type: "object",
  properties: {
    service: { type: "string" }, direction: { type: "string" }, dryRun: { type: "boolean" },
    created: { type: "integer" }, updated: { type: "integer" }, skipped: { type: "integer" }, conflicts: { type: "integer" },
    preview: { type: "array", items: QUEST_OBJECT },
  },
  additionalProperties: false,
};
const GENERIC_OBJECT_OUTPUT = { type: "object", additionalProperties: true };
const DAILY_BRIEF_OUTPUT = {
  type: "object",
  properties: { date: { type: "string" }, quests: QUEST_LIST_PAGE_OUTPUT, character: QUEST_OBJECT, calendar: GENERIC_OBJECT_OUTPUT },
  additionalProperties: false,
};
const REVIEW_SUMMARY_OUTPUT = {
  type: "object",
  properties: {
    period: { type: "string", enum: ["day", "week"] }, anchorDate: { type: "string" }, from: { type: "string" },
    questsCompleted: { type: "integer" }, questsCreated: { type: "integer" }, questsFailed: { type: "integer" },
    rewardsEarned: { type: "integer" }, eventsLogged: { type: "integer" }, focusMinutes: { type: "integer" },
    topTags: { type: "array", items: QUEST_OBJECT }, character: QUEST_OBJECT,
  },
  additionalProperties: false,
};
const PAGED_EVENTS_OUTPUT = {
  type: "object",
  properties: { events: { type: "array", items: QUEST_OBJECT }, total: { type: "integer" }, limit: { type: "integer" }, nextCursor: { type: ["string", "null"] } },
  additionalProperties: false,
};
const QUEST_TREE_OUTPUT = {
  type: "object",
  properties: {
    roots: { type: "array", items: QUEST_OBJECT },
    nodes: { type: "array", items: QUEST_OBJECT },
    total: { type: "integer" },
    summary: { type: "object", properties: { childrenTotal: { type: "integer" }, childrenCompleted: { type: "integer" }, progressPercent: { type: "integer" } }, additionalProperties: false },
  },
  additionalProperties: false,
};
const HANDOFF_OUTPUT = {
  type: "object",
  properties: { dryRun: { type: "boolean" }, quest: QUEST_OBJECT, event: QUEST_OBJECT, events: { type: "array", items: QUEST_OBJECT } },
  additionalProperties: false,
};
const AGENT_SCOPES = [
  "quests:read", "quests:write", "character:read", "rewards:write",
  "integrations:read", "integrations:sync", "events:read", "webhooks:manage", "plugins:manage", "profiles:read", "profiles:write",
  "friends:read", "friends:write", "parties:read", "parties:write",
  "battle:read", "battle:write", "agents:read",
];
const AGENT_OBJECT = {
  type: "object",
  properties: {
    uid: { type: "string" }, agentId: { type: "string" }, displayName: { type: "string" }, provider: { type: "string" },
    role: { type: "string" }, instructions: { type: "string" }, status: { type: "string", enum: ["active", "disabled", "archived"] },
    allowedScopes: { type: "array", items: { type: "string", enum: AGENT_SCOPES } },
    defaultHandoffState: { type: "string", enum: ["none", "ready", "working", "blocked", "review_required", "accepted"] }, reviewRequired: { type: "boolean" }, dryRunDefault: { type: "boolean" },
    createdAt: { type: "string" }, updatedAt: { type: "string" },
  },
  additionalProperties: false,
};
const AGENT_LIST_OUTPUT = { type: "object", properties: { agents: { type: "array", items: AGENT_OBJECT } }, additionalProperties: false };
const CALENDAR_OVERRIDE_PROPERTIES = {
  title: QUEST_INPUT_PROPERTIES.title, notes: QUEST_INPUT_PROPERTIES.notes, category: QUEST_INPUT_PROPERTIES.category,
  dueDate: QUEST_INPUT_PROPERTIES.dueDate, scheduledDate: QUEST_INPUT_PROPERTIES.scheduledDate,
  scheduledTime: QUEST_INPUT_PROPERTIES.scheduledTime, repeat: QUEST_INPUT_PROPERTIES.repeat,
  difficulty: QUEST_INPUT_PROPERTIES.difficulty, tags: QUEST_INPUT_PROPERTIES.tags,
  estimatedMinutes: QUEST_INPUT_PROPERTIES.estimatedMinutes, actualMinutes: QUEST_INPUT_PROPERTIES.actualMinutes,
  completionCriteria: QUEST_INPUT_PROPERTIES.completionCriteria, nextAction: QUEST_INPUT_PROPERTIES.nextAction,
  impact: QUEST_INPUT_PROPERTIES.impact, isBlockingOthers: QUEST_INPUT_PROPERTIES.isBlockingOthers,
};

const TOGGL_FOCUS_CONFIGURATION_PROPERTIES = {
  organizationId: { type: "string", pattern: "^\\d+$" },
  workspaceId: { type: "string", pattern: "^\\d+$" },
  projectId: { type: "string", pattern: "^\\d+$" },
  autoCreateTasks: { type: "boolean", default: false },
};
const TOGGL_FOCUS_ENTRY_PROPERTIES = {
  dateFrom: { type: "string", format: "date" },
  dateTo: { type: "string", format: "date" },
  days: { type: "integer", minimum: 1, maximum: 30, default: 30 },
  limit: { type: "integer", minimum: 1, maximum: 200, default: 100 },
  includeTaskless: { type: "boolean", default: false },
};

const MCP_TOOLS = [
  { name: "list_today_quests", title: "List Today's Quests", description: "List active scheduled QuestForge quests visible today, including overdue work.", inputSchema: { type: "object", properties: { date: { type: "string", format: "date" } }, additionalProperties: false }, outputSchema: QUEST_LIST_PAGE_OUTPUT, annotations: READ_ANNOTATIONS },
  { name: "list_quests", title: "List Quests", description: "List QuestForge quests by today, week, future, backlog, completed, archive, or all views.", inputSchema: { type: "object", properties: LIST_QUEST_PROPERTIES, additionalProperties: false }, outputSchema: QUEST_LIST_PAGE_OUTPUT, annotations: READ_ANNOTATIONS },
  { name: "create_quest", title: "Create Quest", description: "Create a QuestForge habit, daily, todo, or reward with planning and priority details.", inputSchema: { type: "object", required: ["kind", "title"], properties: QUEST_INPUT_PROPERTIES, additionalProperties: false }, outputSchema: QUEST_AND_EVENT_OUTPUT, annotations: WRITE_ANNOTATIONS },
  { name: "update_quest", title: "Update Quest", description: "Edit one QuestForge quest. Moving a scheduled date later increments rolloverCount.", inputSchema: { type: "object", required: ["questId"], properties: { questId: { type: "string" }, ...QUEST_INPUT_PROPERTIES }, additionalProperties: false }, outputSchema: QUEST_AND_EVENT_OUTPUT, annotations: IDEMPOTENT_WRITE_ANNOTATIONS },
  { name: "batch_update_quests", title: "Batch Update Quests", description: "Preview or atomically update up to 100 quests, including postponing or moving them to backlog.", inputSchema: { type: "object", required: ["questIds"], properties: { questIds: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 100 }, patch: { type: "object", properties: QUEST_INPUT_PROPERTIES }, postponeDays: { type: "integer", minimum: -365, maximum: 365 }, dryRun: { type: "boolean", default: true } }, additionalProperties: false }, outputSchema: BATCH_OUTPUT, annotations: IDEMPOTENT_WRITE_ANNOTATIONS },
  { name: "batch_score_quests", title: "Batch Score Quests", description: "Preview or atomically complete or reopen up to 100 quests. One-off todo quests become archived when completed.", inputSchema: { type: "object", required: ["questIds", "direction"], properties: { questIds: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 100 }, direction: { type: "string", enum: ["up", "down"] }, dryRun: { type: "boolean", default: true } }, additionalProperties: false }, outputSchema: BATCH_SCORE_OUTPUT, annotations: WRITE_ANNOTATIONS },
  { name: "archive_quests", title: "Archive Quests", description: "Preview or archive completed one-off todo quests. Archived quests are retained permanently.", inputSchema: { type: "object", properties: { questIds: { type: "array", items: { type: "string" }, maxItems: 100 }, throughDate: { type: "string", format: "date" }, dryRun: { type: "boolean", default: true } }, additionalProperties: false }, outputSchema: BATCH_OUTPUT, annotations: DESTRUCTIVE_IDEMPOTENT_ANNOTATIONS },
  { name: "link_external_record", title: "Link External Record", description: "Link a Google Calendar, Toggl, or other external record to a quest.", inputSchema: { type: "object", required: ["questId", "service", "externalId"], properties: { questId: { type: "string" }, service: { type: "string" }, externalId: { type: "string" }, type: { type: "string" }, url: { type: "string", format: "uri" }, projectId: { type: "string" }, durationMinutes: { type: "integer", minimum: 0 }, syncedAt: { type: "string" } }, additionalProperties: false }, outputSchema: { type: "object", properties: { quest: QUEST_OBJECT, link: QUEST_OBJECT, event: QUEST_OBJECT }, additionalProperties: false }, annotations: OPEN_WORLD_IDEMPOTENT_ANNOTATIONS },
  { name: "score_quest", title: "Score Quest", description: "Complete, reopen, or score a quest and apply its HP, XP, Gem, and MP effects. A completed one-off todo is archived automatically.", inputSchema: { type: "object", required: ["questId", "direction"], properties: { questId: { type: "string" }, direction: { type: "string", enum: ["up", "down"] } }, additionalProperties: false }, outputSchema: SCORE_OUTPUT, annotations: WRITE_ANNOTATIONS },
  { name: "get_character_state", title: "Get Character State", description: "Return the current character, MP, equipment, and boss state.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: CHARACTER_OUTPUT, annotations: READ_ANNOTATIONS },
  { name: "buy_reward", title: "Buy Reward", description: "Redeem a reward quest using Gems.", inputSchema: { type: "object", required: ["questId"], properties: { questId: { type: "string" } }, additionalProperties: false }, outputSchema: REWARD_OUTPUT, annotations: DESTRUCTIVE_ANNOTATIONS },
  { name: "list_integrations", title: "List Integrations", description: "List per-user integration connection, configuration, and reconnect status without exposing provider tokens.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: { type: "object", properties: { integrations: { type: "array", items: QUEST_OBJECT } }, additionalProperties: false }, annotations: READ_ANNOTATIONS },
  { name: "get_toggl_focus_status", title: "Get Toggl Focus Status", description: "Read the user's Toggl Focus connection configuration and current timer without exposing the personal API key.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: GENERIC_OBJECT_OUTPUT, annotations: OPEN_WORLD_READ_ANNOTATIONS },
  { name: "list_toggl_focus_entries", title: "List Toggl Focus Entries", description: "List up to 30 days of Toggl Focus time entries and their current QuestForge attribution state.", inputSchema: { type: "object", properties: TOGGL_FOCUS_ENTRY_PROPERTIES, additionalProperties: false }, outputSchema: GENERIC_OBJECT_OUTPUT, annotations: OPEN_WORLD_READ_ANNOTATIONS },
  { name: "sync_quest_to_toggl_focus", title: "Sync Quest to Toggl Focus", description: "Preview or create/update one active To Do or Daily as a Toggl Focus task. Tags may be created in Focus on execution.", inputSchema: { type: "object", required: ["questId"], properties: { questId: { type: "string" }, dryRun: { type: "boolean", default: true } }, additionalProperties: false }, outputSchema: GENERIC_OBJECT_OUTPUT, annotations: OPEN_WORLD_IDEMPOTENT_ANNOTATIONS },
  { name: "get_toggl_focus_tracking", title: "Get Toggl Focus Tracking", description: "Read the current Toggl Focus timer and its linked Focus task when available.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: GENERIC_OBJECT_OUTPUT, annotations: OPEN_WORLD_READ_ANNOTATIONS },
  { name: "start_toggl_focus_tracking", title: "Start Toggl Focus Tracking", description: "Preview or start a Focus timer for a linked Quest. If another timer is running, confirm its exact entry ID first.", inputSchema: { type: "object", required: ["questId"], properties: { questId: { type: "string" }, expectedCurrentEntryId: { type: "string" }, dryRun: { type: "boolean", default: true } }, additionalProperties: false }, outputSchema: GENERIC_OBJECT_OUTPUT, annotations: OPEN_WORLD_WRITE_ANNOTATIONS },
  { name: "stop_toggl_focus_tracking", title: "Stop Toggl Focus Tracking", description: "Preview or stop the exact currently running Toggl Focus timer. The expected entry ID prevents stopping a different device's timer.", inputSchema: { type: "object", properties: { expectedEntryId: { type: "string" }, end: { type: "string", format: "date-time" }, dryRun: { type: "boolean", default: true } }, additionalProperties: false }, outputSchema: GENERIC_OBJECT_OUTPUT, annotations: OPEN_WORLD_WRITE_ANNOTATIONS },
  { name: "preview_toggl_attribution", title: "Preview Toggl Focus Attribution", description: "Preview direct Focus-task time entry attribution or manual candidate attribution without changing QuestForge.", inputSchema: { type: "object", properties: { ...TOGGL_FOCUS_ENTRY_PROPERTIES, questId: { type: "string" }, entryIds: { type: "array", items: { type: "string" }, maxItems: 100 } }, additionalProperties: false }, outputSchema: GENERIC_OBJECT_OUTPUT, annotations: OPEN_WORLD_READ_ANNOTATIONS },
  { name: "apply_toggl_attribution", title: "Apply Toggl Focus Attribution", description: "Preview or confirm one-to-one Focus time entry attribution. A Focus entry can belong to only one Quest.", inputSchema: { type: "object", properties: { ...TOGGL_FOCUS_ENTRY_PROPERTIES, questId: { type: "string" }, entryIds: { type: "array", items: { type: "string" }, maxItems: 100 }, dryRun: { type: "boolean", default: true } }, additionalProperties: false }, outputSchema: GENERIC_OBJECT_OUTPUT, annotations: OPEN_WORLD_IDEMPOTENT_ANNOTATIONS },
  { name: "get_toggl_estimate_insights", title: "Get Toggl Estimate Insights", description: "Suggest future Quest estimates from completed Toggl Focus-linked work. Suggestions never change Quest data automatically.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: GENERIC_OBJECT_OUTPUT, annotations: OPEN_WORLD_READ_ANNOTATIONS },
  { name: "preview_external_sync", title: "Preview External Sync", description: "Preview connected Google Calendar, Google Tasks, or Notion changes without saving them.", inputSchema: { type: "object", required: ["service"], properties: { service: { type: "string", enum: ["google-calendar", "google-tasks", "notion"] }, direction: { type: "string", enum: ["import", "export", "bidirectional"] } }, additionalProperties: false }, outputSchema: SYNC_OUTPUT, annotations: OPEN_WORLD_READ_ANNOTATIONS },
  { name: "sync_external_service", title: "Sync External Service", description: "Run a configured external sync. dryRun defaults to true and provider writes require explicit execution.", inputSchema: { type: "object", required: ["service", "direction"], properties: { service: { type: "string", enum: ["google-calendar", "google-tasks", "notion"] }, direction: { type: "string", enum: ["import", "export", "bidirectional"] }, dryRun: { type: "boolean", default: true } }, additionalProperties: false }, outputSchema: SYNC_OUTPUT, annotations: OPEN_WORLD_WRITE_ANNOTATIONS },
  { name: "get_my_profile", title: "Get My Profile", description: "Get the authenticated user's QuestForge public profile settings.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: { type: "object", properties: { profile: QUEST_OBJECT }, additionalProperties: false }, annotations: READ_ANNOTATIONS },
  { name: "find_profile_by_handle", title: "Find Profile by Handle", description: "Find one QuestForge public profile by an exact @handle.", inputSchema: { type: "object", required: ["handle"], properties: { handle: { type: "string", minLength: 3, maxLength: 21 } }, additionalProperties: false }, outputSchema: { type: "object", properties: { profile: QUEST_OBJECT }, additionalProperties: false }, annotations: READ_ANNOTATIONS },
  { name: "update_profile", title: "Update Profile", description: "Create or update the authenticated user's public QuestForge profile, including the selected character icon.", inputSchema: { type: "object", properties: { displayName: { type: "string", minLength: 1, maxLength: 40 }, handle: { type: "string", minLength: 3, maxLength: 21 }, bio: { type: "string", maxLength: 160 }, avatarRole: { type: "string", maxLength: 40 }, avatarVariant: { type: "string", maxLength: 40 }, avatarUrl: { type: "string", maxLength: 700000, pattern: "^data:image/(png|jpeg|webp);base64," }, level: { type: "integer", minimum: 1 } }, additionalProperties: false }, outputSchema: { type: "object", properties: { profile: QUEST_OBJECT }, additionalProperties: false }, annotations: IDEMPOTENT_WRITE_ANNOTATIONS },
  { name: "list_friends", title: "List Friends", description: "List accepted friends using minimal public profile fields.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: { type: "object", properties: { friends: { type: "array", items: QUEST_OBJECT } }, additionalProperties: false }, annotations: READ_ANNOTATIONS },
  { name: "list_friend_requests", title: "List Friend Requests", description: "List pending incoming and outgoing friend requests.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: { type: "object", properties: { requests: { type: "array", items: QUEST_OBJECT } }, additionalProperties: false }, annotations: READ_ANNOTATIONS },
  { name: "send_friend_request", title: "Send Friend Request", description: "Send a friend request to a stable QuestForge user ID after exact-handle lookup.", inputSchema: { type: "object", required: ["receiverUid"], properties: { receiverUid: { type: "string" } }, additionalProperties: false }, outputSchema: { type: "object", properties: { request: QUEST_OBJECT }, additionalProperties: false }, annotations: WRITE_ANNOTATIONS },
  { name: "respond_friend_request", title: "Respond to Friend Request", description: "Accept or decline a pending incoming friend request.", inputSchema: { type: "object", required: ["requestId", "decision"], properties: { requestId: { type: "string" }, decision: { type: "string", enum: ["accept", "decline"] } }, additionalProperties: false }, outputSchema: QUEST_OBJECT, annotations: WRITE_ANNOTATIONS },
  { name: "remove_friend", title: "Remove Friend", description: "Remove an existing friendship for both users.", inputSchema: { type: "object", required: ["friendUid"], properties: { friendUid: { type: "string" } }, additionalProperties: false }, outputSchema: QUEST_OBJECT, annotations: DESTRUCTIVE_ANNOTATIONS },
  { name: "get_party", title: "Get Party", description: "Get the authenticated user's active party and minimal member profiles.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: { type: "object", properties: { party: { type: ["object", "null"] } }, additionalProperties: false }, annotations: READ_ANNOTATIONS },
  { name: "create_party", title: "Create Party", description: "Create a party with the authenticated user as owner. One active party per user, four members maximum.", inputSchema: { type: "object", required: ["name"], properties: { name: { type: "string", minLength: 1, maxLength: 40 } }, additionalProperties: false }, outputSchema: { type: "object", properties: { party: QUEST_OBJECT }, additionalProperties: false }, annotations: WRITE_ANNOTATIONS },
  { name: "invite_party_member", title: "Invite Party Member", description: "Create a seven-day party invite. Only the party owner can use this tool.", inputSchema: { type: "object", properties: { inviteeUid: { type: "string" } }, additionalProperties: false }, outputSchema: QUEST_OBJECT, annotations: WRITE_ANNOTATIONS },
  { name: "accept_party_invite", title: "Accept Party Invite", description: "Accept a party invite using its one-time token or invite ID.", inputSchema: { type: "object", properties: { token: { type: "string" }, inviteId: { type: "string" } }, additionalProperties: false }, outputSchema: { type: "object", properties: { party: QUEST_OBJECT }, additionalProperties: false }, annotations: WRITE_ANNOTATIONS },
  { name: "leave_party", title: "Leave Party", description: "Leave the active party. Ownership transfers to the earliest remaining member.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: QUEST_OBJECT, annotations: DESTRUCTIVE_ANNOTATIONS },
  { name: "remove_party_member", title: "Remove Party Member", description: "Remove a party member. Only the owner can use this tool.", inputSchema: { type: "object", required: ["memberUid"], properties: { memberUid: { type: "string" } }, additionalProperties: false }, outputSchema: { type: "object", properties: { party: QUEST_OBJECT }, additionalProperties: false }, annotations: DESTRUCTIVE_ANNOTATIONS },
  { name: "get_battle_session", title: "Get Battle Session", description: "Get the current QuestForge command battle state, available commands, and MP-generating quests.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: { type: "object", properties: { session: QUEST_OBJECT }, additionalProperties: false }, annotations: READ_ANNOTATIONS },
  { name: "battle_command", title: "Battle Command", description: "Preview or execute one deterministic command battle turn. Execution requires the current turn and a unique commandId.", inputSchema: { type: "object", required: ["command"], properties: { command: { type: "string", enum: ["attack", "skill", "guard", "heal", "burst"] }, expectedTurn: { type: "integer", minimum: 1 }, commandId: { type: "string", maxLength: 120 }, dryRun: { type: "boolean", default: true } }, additionalProperties: false }, outputSchema: QUEST_OBJECT, annotations: IDEMPOTENT_WRITE_ANNOTATIONS },
  { name: "get_quest", title: "Get One Quest", description: "Read one QuestForge quest by ID, including child progress.", inputSchema: { type: "object", required: ["questId"], properties: { questId: { type: "string", minLength: 1 } }, additionalProperties: false }, outputSchema: { type: "object", properties: { quest: QUEST_OBJECT }, additionalProperties: false }, annotations: READ_ANNOTATIONS },
  { name: "get_quest_tree", title: "Get Quest Tree", description: "Read the parent Quest and nested child Quests with progress summaries.", inputSchema: { type: "object", properties: { rootQuestId: { type: "string" }, includeArchived: { type: "boolean", default: false }, maxDepth: { type: "integer", minimum: 1, maximum: 8, default: 8 } }, additionalProperties: false }, outputSchema: QUEST_TREE_OUTPUT, annotations: READ_ANNOTATIONS },
  { name: "get_daily_brief", title: "Get Daily Brief", description: "Return today's quests, character state, and an optional cached Calendar schedule.", inputSchema: { type: "object", properties: { date: { type: "string", format: "date" }, includeCalendar: { type: "boolean", default: false } }, additionalProperties: false }, outputSchema: DAILY_BRIEF_OUTPUT, annotations: OPEN_WORLD_READ_ANNOTATIONS },
  { name: "get_review_summary", title: "Get Review Summary", description: "Summarize completed work and activity for one day or a rolling seven-day review window.", inputSchema: { type: "object", properties: { period: { type: "string", enum: ["day", "week"], default: "day" }, anchorDate: { type: "string", format: "date" } }, additionalProperties: false }, outputSchema: REVIEW_SUMMARY_OUTPUT, annotations: READ_ANNOTATIONS },
  { name: "list_agent_handoffs", title: "List Agent Handoffs", description: "List agent-assigned QuestForge handoffs by lifecycle state.", inputSchema: { type: "object", properties: { assigneeId: { type: "string", maxLength: 120 }, state: { type: "string", enum: ["none", "ready", "working", "blocked", "review_required", "accepted", "pending", "all"], default: "all" }, cursor: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100, default: 25 } }, additionalProperties: false }, outputSchema: { type: "object", properties: { handoffs: { type: "array", items: QUEST_OBJECT }, total: { type: "integer" }, limit: { type: "integer" }, nextCursor: { type: ["string", "null"] } }, additionalProperties: false }, annotations: READ_ANNOTATIONS },
  { name: "list_registered_agents", title: "List Registered Agents", description: "List the authenticated user's private QuestForge Agent Registry profiles.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: AGENT_LIST_OUTPUT, annotations: READ_ANNOTATIONS },
  { name: "get_current_agent_context", title: "Get Current Agent Context", description: "Return the registered Agent profile linked to the current OAuth MCP client and its effective scopes.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: GENERIC_OBJECT_OUTPUT, annotations: READ_ANNOTATIONS },
  { name: "assign_quest_to_agent", title: "Assign Quest to Agent", description: "Preview or assign one Quest to a registered Agent. Execution requires the Quest's current updatedAt value.", inputSchema: { type: "object", required: ["questId", "agentId"], properties: { questId: { type: "string" }, agentId: { type: "string", pattern: "^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$" }, expectedUpdatedAt: { type: "string" }, handoffState: { type: "string", enum: ["none", "ready", "working", "blocked", "review_required", "accepted"] }, note: { type: "string", maxLength: 500 }, dryRun: { type: "boolean", default: true } }, additionalProperties: false }, outputSchema: AGENT_ASSIGNMENT_OUTPUT, annotations: IDEMPOTENT_WRITE_ANNOTATIONS },
  { name: "transition_quest_handoff", title: "Transition Quest Handoff", description: "Preview or transition an agent-assigned Quest between none, ready, working, blocked, review_required, and accepted.", inputSchema: { type: "object", required: ["questId", "state"], properties: { questId: { type: "string" }, state: { type: "string", enum: ["none", "ready", "working", "blocked", "review_required", "accepted"] }, expectedState: { type: "string", enum: ["none", "ready", "working", "blocked", "review_required", "accepted"] }, note: { type: "string", maxLength: 500 }, blockedReason: { type: "string", maxLength: 500 }, artifactUrl: { type: "string", format: "uri" }, dryRun: { type: "boolean", default: true } }, additionalProperties: false }, outputSchema: HANDOFF_OUTPUT, annotations: IDEMPOTENT_WRITE_ANNOTATIONS },
  { name: "list_activity_events", title: "List Activity Events", description: "Paginate QuestForge activity events, optionally filtering by event type.", inputSchema: { type: "object", properties: { eventType: { type: "string", maxLength: 60 }, cursor: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 250, default: 50 } }, additionalProperties: false }, outputSchema: PAGED_EVENTS_OUTPUT, annotations: READ_ANNOTATIONS },
  { name: "get_calendar_schedule", title: "Get Calendar Schedule", description: "Read the cached Google Calendar schedule for a date. Connect and sync Calendar first.", inputSchema: { type: "object", properties: { date: { type: "string", format: "date" } }, additionalProperties: false }, outputSchema: { type: "object", properties: { schedule: GENERIC_OBJECT_OUTPUT }, additionalProperties: false }, annotations: OPEN_WORLD_READ_ANNOTATIONS },
  { name: "convert_calendar_event_to_quest", title: "Convert Calendar Event to Quest", description: "Create a QuestForge quest from a cached Calendar event and optional safe task-field overrides.", inputSchema: { type: "object", required: ["eventId"], properties: { eventId: { type: "string", minLength: 1 }, calendarId: { type: "string", minLength: 1 }, overrides: { type: "object", properties: CALENDAR_OVERRIDE_PROPERTIES, additionalProperties: false } }, additionalProperties: false }, outputSchema: QUEST_AND_EVENT_OUTPUT, annotations: OPEN_WORLD_WRITE_ANNOTATIONS },
];

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}

function errorResponse(error) {
  const status = Number(error.status || (error instanceof DomainError ? error.status : 500));
  return json({ error: { code: error.code || "internal_error", message: status >= 500 ? "QuestForge server error." : error.message, details: error.details } }, status);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  const allowed = String(env.ALLOWED_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173").split(",").map((item) => item.trim());
  const localDevelopmentOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || "");
  return origin && (allowed.includes(origin) || localDevelopmentOrigin)
    ? { "access-control-allow-origin": origin, vary: "Origin" }
    : {};
}

function withCors(response, request, env) {
  const next = new Response(response.body, response);
  Object.entries(corsHeaders(request, env)).forEach(([key, value]) => next.headers.set(key, value));
  next.headers.set("access-control-allow-headers", "authorization,content-type,mcp-protocol-version");
  next.headers.set("access-control-allow-methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  return next;
}

async function acceptTelemetry(request, env) {
  if (request.method !== "POST") return json({ error: { code: "method_not_allowed", message: "POST is required." } }, 405);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 20000) return json({ error: { code: "payload_too_large", message: "Telemetry payload is too large." } }, 413);
  const body = await request.json().catch(() => null);
  const events = Array.isArray(body?.events) ? body.events.slice(0, 20) : [];
  if (body?.schemaVersion !== 1 || !events.length) return json({ accepted: 0 }, 202);
  const safeEvents = events.map((event) => {
    const name = String(event?.name || "");
    const surface = String(event?.surface || "unknown").slice(0, 24);
    if (!TELEMETRY_EVENT_NAMES.has(name) || !/^[a-z0-9_-]+$/.test(surface)) return null;
    const metrics = {};
    for (const key of ["lcp", "cls", "inp", "duration", "count"]) {
      if (Number.isFinite(Number(event?.[key]))) metrics[key] = Math.round(Number(event[key]) * 100) / 100;
    }
    for (const key of ["kind", "source", "status"]) {
      if (typeof event?.[key] === "string" && event[key].length <= 40 && /^[a-z0-9_-]+$/i.test(event[key])) metrics[key] = event[key];
    }
    return { name, surface, metrics };
  }).filter(Boolean);
  if (!safeEvents.length) return json({ accepted: 0 }, 202);
  if (env.QUESTFORGE_DB) {
    const createdAt = new Date().toISOString();
    await env.QUESTFORGE_DB.batch(safeEvents.map((event) => env.QUESTFORGE_DB.prepare(
      "INSERT INTO telemetry_events (event_id, name, surface, metrics_json, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), event.name, event.surface, JSON.stringify(event.metrics), createdAt)));
  }
  return json({ accepted: safeEvents.length }, 202);
}

function assertTogglFocusWebConnection(request, env, identity) {
  if (!identity || !["firebase", "dev"].includes(identity.authType)) {
    throw new DomainError(403, "focus_web_connection_required", "Toggl Focus API keys can only be connected from the QuestForge web app.");
  }
  if (identity.authType === "firebase" && !corsHeaders(request, env)["access-control-allow-origin"]) {
    throw new DomainError(403, "focus_web_origin_required", "Open QuestForge in an approved browser origin to connect Toggl Focus.");
  }
}

function assertAgentRegistryWebMutation(request, env, identity) {
  if (!identity || !["firebase", "dev"].includes(identity.authType)) {
    throw new DomainError(403, "agent_registry_web_required", "Agent Registry settings can only be changed from the QuestForge web app.");
  }
  if (identity.authType === "firebase" && !corsHeaders(request, env)["access-control-allow-origin"]) {
    throw new DomainError(403, "agent_registry_origin_required", "Open QuestForge in an approved browser origin to change Agent Registry settings.");
  }
}

async function identityWithAgentContext(env, identity) {
  if (identity?.authType !== "oauth" || !identity.clientId) return identity;
  await noteAuthorizedClientUse(env, identity);
  const agent = await getAgentForClient(env, identity.uid, identity.clientId);
  if (!agent || agent.uid !== identity.uid) return identity;
  await noteAgentConnectionUse(env, identity.uid, identity.clientId).catch(() => undefined);
  const allowed = new Set(agent.allowedScopes || []);
  return { ...identity, scopes: (identity.scopes || []).filter((scope) => allowed.has(scope)), agent };
}

async function assignQuestToAgent(env, identity, context, input) {
  assertScope(identity.scopes, "quests:write");
  const agent = await getAgent(env, identity.uid, input.agentId);
  if (agent.status !== "active") throw new DomainError(409, "agent_inactive", "Only an active registered Agent can receive a Quest.");
  const state = await stateFor(env, identity);
  const current = getQuest(state, input.questId).quest;
  if (input.expectedUpdatedAt && input.expectedUpdatedAt !== current.updatedAt) {
    throw new DomainError(409, "stale_quest", "The Quest changed before this assignment was applied.", { expectedUpdatedAt: input.expectedUpdatedAt, actualUpdatedAt: current.updatedAt });
  }
  const patch = {
    assignee: { type: "agent", id: agent.agentId, label: agent.displayName, handoffState: input.handoffState || agent.defaultHandoffState || "ready" },
    handoff: { ...current.handoff, note: input.note || current.handoff?.note || "" },
  };
  if (input.dryRun !== false) {
    const previewState = structuredClone(state);
    return { dryRun: true, ...patchQuest(previewState, input.questId, patch, { source: "mcp", returnEvent: true }) };
  }
  if (!input.expectedUpdatedAt) throw new DomainError(400, "expected_updated_at_required", "expectedUpdatedAt is required when executing an Agent assignment.");
  return { dryRun: false, ...await mutateAndNotify(env, identity, context, (next) => {
    const latest = getQuest(next, input.questId).quest;
    if (latest.updatedAt !== input.expectedUpdatedAt) throw new DomainError(409, "stale_quest", "The Quest changed before this assignment was applied.", { expectedUpdatedAt: input.expectedUpdatedAt, actualUpdatedAt: latest.updatedAt });
    return patchQuest(next, input.questId, patch, { source: "mcp", returnEvent: true });
  }) };
}

function validDateValue(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
}

function addDaysText(dateText, amount) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return todayText(date);
}

async function stateFor(env, identity) {
  const { payload } = await readState(env, identity);
  if (!payload?.state) { const error = new Error("Open QuestForge and complete Firebase sync before connecting an AI client."); error.status = 409; error.code = "state_unavailable"; throw error; }
  if (Number(payload.state.schemaVersion || 0) < 7) {
    const migrated = await mutateState(env, identity, (state) => {
      migrateState(state);
      return null;
    });
    return migrated.state;
  }
  return payload.state;
}

async function mutateAndNotify(env, identity, context, mutation) {
  const { result } = await mutateState(env, identity, mutation);
  const events = Array.isArray(result?.events) ? result.events : result?.event ? [result.event] : [];
  for (const event of events) context.waitUntil(deliverEvent(env, identity.uid, event));
  return result;
}

async function routeApi(request, env, context, identity, path) {
  const method = request.method;
  if (path === "/v1/agents" && method === "GET") {
    assertScope(identity.scopes, "agents:read");
    const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
    return json({ agents: await listAgents(env, identity.uid, { includeArchived }) });
  }
  if (path === "/v1/agents" && method === "POST") {
    assertAgentRegistryWebMutation(request, env, identity);
    return json({ agent: await createAgent(env, identity.uid, await request.json()) }, 201);
  }
  if (path === "/v1/agent-connections" && method === "GET") {
    assertAgentRegistryWebMutation(request, env, identity);
    const agents = await listAgents(env, identity.uid, { includeArchived: true });
    const linked = (await Promise.all(agents.map((agent) => listAgentConnections(env, identity.uid, agent.agentId)))).flat();
    return json({ authorizedClients: await listAuthorizedClients(env, identity.uid), connections: linked });
  }
  const agentMatch = path.match(/^\/v1\/agents\/([^/]+)$/);
  if (agentMatch && method === "GET") {
    assertScope(identity.scopes, "agents:read");
    return json({ agent: await getAgent(env, identity.uid, decodeURIComponent(agentMatch[1]), { includeArchived: true }) });
  }
  if (agentMatch && method === "PATCH") {
    assertAgentRegistryWebMutation(request, env, identity);
    const agentId = decodeURIComponent(agentMatch[1]);
    const agent = await updateAgent(env, identity.uid, agentId, await request.json());
    if (["disabled", "archived"].includes(agent.status)) {
      const connections = await listAgentConnections(env, identity.uid, agentId);
      await Promise.all(connections.map((connection) => revokeAuthorizedClient(env, identity.uid, connection.clientId)));
    }
    return json({ agent });
  }
  const agentConnectionMatch = path.match(/^\/v1\/agents\/([^/]+)\/connections\/([^/]+)$/);
  if (agentConnectionMatch && method === "PUT") {
    assertAgentRegistryWebMutation(request, env, identity);
    const agentId = decodeURIComponent(agentConnectionMatch[1]);
    const clientId = decodeURIComponent(agentConnectionMatch[2]);
    const client = await getAuthorizedClient(env, identity.uid, clientId);
    if (!client) throw new DomainError(404, "oauth_client_not_found", "An active OAuth MCP client with this ID was not found for the signed-in user.");
    return json({ connection: await linkAgentConnection(env, identity.uid, agentId, {
      clientId: client.clientId,
      clientName: client.clientName,
      scopes: client.scopes,
      firstConnectedAt: client.firstConnectedAt,
      lastUsedAt: client.lastUsedAt,
    }) });
  }
  if (agentConnectionMatch && method === "DELETE") {
    assertAgentRegistryWebMutation(request, env, identity);
    const agentId = decodeURIComponent(agentConnectionMatch[1]);
    const clientId = decodeURIComponent(agentConnectionMatch[2]);
    const existing = (await listAgentConnections(env, identity.uid, agentId)).find((connection) => connection.clientId === clientId);
    if (!existing) throw new DomainError(404, "agent_connection_not_found", "This connection is not linked to the requested Agent.");
    const connection = await unlinkAgentConnection(env, identity.uid, clientId);
    await revokeAuthorizedClient(env, identity.uid, clientId);
    return json({ connection });
  }
  if (path === "/v1/profile" && method === "GET") {
    assertScope(identity.scopes, "profiles:read");
    return json({ profile: await getOwnProfile(env, identity.uid) });
  }
  if (path === "/v1/profile" && method === "PATCH") {
    assertScope(identity.scopes, "profiles:write");
    return json({ profile: await upsertProfile(env, identity.uid, await request.json()) });
  }
  const profileHandleMatch = path.match(/^\/v1\/profiles\/([^/]+)$/);
  if (profileHandleMatch && method === "GET") {
    assertScope(identity.scopes, "profiles:read");
    return json({ profile: await findProfileByHandle(env, decodeURIComponent(profileHandleMatch[1])) });
  }
  if (path === "/v1/friends" && method === "GET") {
    assertScope(identity.scopes, "friends:read");
    return json({ friends: await listFriends(env, identity.uid) });
  }
  if (path === "/v1/friend-requests" && method === "GET") {
    assertScope(identity.scopes, "friends:read");
    return json({ requests: await listFriendRequests(env, identity.uid) });
  }
  if (path === "/v1/friend-requests" && method === "POST") {
    assertScope(identity.scopes, "friends:write");
    const input = await request.json();
    return json({ request: await sendFriendRequest(env, identity.uid, input.receiverUid) }, 201);
  }
  const friendDecisionMatch = path.match(/^\/v1\/friend-requests\/([^/]+)\/(accept|decline)$/);
  if (friendDecisionMatch && method === "POST") {
    assertScope(identity.scopes, "friends:write");
    const action = friendDecisionMatch[2] === "accept" ? acceptFriendRequest : declineFriendRequest;
    const result = await action(env, identity.uid, decodeURIComponent(friendDecisionMatch[1]));
    return json(friendDecisionMatch[2] === "accept" ? { friends: result } : { requests: result });
  }
  const friendMatch = path.match(/^\/v1\/friends\/([^/]+)$/);
  if (friendMatch && method === "DELETE") {
    assertScope(identity.scopes, "friends:write");
    return json(await removeFriend(env, identity.uid, decodeURIComponent(friendMatch[1])));
  }
  if (path === "/v1/party" && method === "GET") {
    assertScope(identity.scopes, "parties:read");
    return json({ party: await getParty(env, identity.uid) });
  }
  if (path === "/v1/party" && method === "POST") {
    assertScope(identity.scopes, "parties:write");
    return json({ party: await createParty(env, identity.uid, await request.json()) }, 201);
  }
  if (path === "/v1/party/invites" && method === "POST") {
    assertScope(identity.scopes, "parties:write");
    return json(await inviteToParty(env, identity.uid, await request.json()), 201);
  }
  if (path === "/v1/party/invites/accept" && method === "POST") {
    assertScope(identity.scopes, "parties:write");
    return json({ party: await acceptPartyInvite(env, identity.uid, await request.json()) });
  }
  if (path === "/v1/party/leave" && method === "POST") {
    assertScope(identity.scopes, "parties:write");
    return json(await leaveParty(env, identity.uid));
  }
  const partyMemberMatch = path.match(/^\/v1\/party\/members\/([^/]+)$/);
  if (partyMemberMatch && method === "DELETE") {
    assertScope(identity.scopes, "parties:write");
    return json({ party: await removePartyMember(env, identity.uid, decodeURIComponent(partyMemberMatch[1])) });
  }
  if (path === "/v1/battle/session" && method === "GET") {
    assertScope(identity.scopes, "battle:read");
    return json({ session: getBattleSession(await stateFor(env, identity)) });
  }
  if (path === "/v1/battle/commands" && method === "POST") {
    assertScope(identity.scopes, "battle:write");
    const input = await request.json();
    if (input.dryRun !== false) return json(battleCommand(await stateFor(env, identity), input, { source: "api" }));
    return json(await mutateAndNotify(env, identity, context, (state) => battleCommand(state, input, { source: "api" })));
  }
  if (path === "/v1/quests" && method === "GET") {
    assertScope(identity.scopes, "quests:read");
    const query = Object.fromEntries(new URL(request.url).searchParams);
    return json(listQuestPage(await stateFor(env, identity), query));
  }
  if (path === "/v1/quests" && method === "POST") {
    assertScope(identity.scopes, "quests:write");
    const input = await request.json();
    const created = await mutateAndNotify(env, identity, context, (state) => createQuest(state, input, { source: "api", returnEvent: true }));
    if (created.quest && await isTogglFocusAutoCreateEnabled(env, identity)) {
      try {
        const synced = await mutateAndNotify(env, identity, context, (state) => syncQuestToTogglFocus(env, identity, state, created.quest.id, { dryRun: false }));
        created.focus = { queued: false, synced: true, external: synced.external };
      } catch (error) {
        created.focus = { queued: false, synced: false, error: error.code || "focus_sync_failed" };
      }
    }
    return json(created, 201);
  }
  if (path === "/v1/quests/tree" && method === "GET") {
    assertScope(identity.scopes, "quests:read");
    const query = Object.fromEntries(new URL(request.url).searchParams);
    return json(getQuestTree(await stateFor(env, identity), query));
  }
  if (path === "/v1/agent-handoffs" && method === "GET") {
    assertScope(identity.scopes, "quests:read");
    const query = Object.fromEntries(new URL(request.url).searchParams);
    return json(listAgentHandoffs(await stateFor(env, identity), query));
  }
  if (path === "/v1/quests/batch-update" && method === "POST") {
    assertScope(identity.scopes, "quests:write");
    const input = await request.json();
    if (input.dryRun !== false) return json(batchUpdateQuests(await stateFor(env, identity), input, { source: "api" }));
    return json(await mutateAndNotify(env, identity, context, (state) => batchUpdateQuests(state, input, { source: "api" })));
  }
  if (path === "/v1/quests/batch-score" && method === "POST") {
    assertScope(identity.scopes, "quests:write");
    const input = await request.json();
    if (input.dryRun !== false) return json(batchScoreQuests(await stateFor(env, identity), input, { source: "api" }));
    return json(await mutateAndNotify(env, identity, context, (state) => batchScoreQuests(state, input, { source: "api" })));
  }
  if (path === "/v1/quests/archive" && method === "POST") {
    assertScope(identity.scopes, "quests:write");
    const input = await request.json();
    if (input.dryRun !== false) return json(archiveQuests(await stateFor(env, identity), input, { source: "api" }));
    return json(await mutateAndNotify(env, identity, context, (state) => archiveQuests(state, input, { source: "api" })));
  }
  const externalLinkMatch = path.match(/^\/v1\/quests\/([^/]+)\/external-links$/);
  if (externalLinkMatch && method === "POST") {
    assertScope(identity.scopes, "quests:write");
    const input = await request.json();
    return json(await mutateAndNotify(env, identity, context, (state) => linkExternalRecord(state, decodeURIComponent(externalLinkMatch[1]), input, { source: "api" })), 201);
  }
  const togglFocusTaskMatch = path.match(/^\/v1\/quests\/([^/]+)\/toggl-focus-task$/);
  if (togglFocusTaskMatch && method === "POST") {
    assertScope(identity.scopes, "integrations:sync");
    const input = await request.json();
    const questId = decodeURIComponent(togglFocusTaskMatch[1]);
    if (input.dryRun !== false) return json(await syncQuestToTogglFocus(env, identity, await stateFor(env, identity), questId, input));
    return json(await mutateAndNotify(env, identity, context, (state) => syncQuestToTogglFocus(env, identity, state, questId, input)), 201);
  }
  const questMatch = path.match(/^\/v1\/quests\/([^/]+)$/);
  if (questMatch && method === "PATCH") {
    assertScope(identity.scopes, "quests:write");
    const input = await request.json();
    return json(await mutateAndNotify(env, identity, context, (state) => patchQuest(state, decodeURIComponent(questMatch[1]), input, { source: "api", returnEvent: true })));
  }
  const handoffMatch = path.match(/^\/v1\/quests\/([^/]+)\/handoff$/);
  if (handoffMatch && method === "POST") {
    assertScope(identity.scopes, "quests:write");
    const input = await request.json();
    const questId = decodeURIComponent(handoffMatch[1]);
    const contextWithReviewer = { source: "api", reviewedBy: identity.uid };
    if (input.dryRun !== false) return json(transitionQuestHandoff(await stateFor(env, identity), questId, input, contextWithReviewer));
    return json(await mutateAndNotify(env, identity, context, (state) => transitionQuestHandoff(state, questId, input, contextWithReviewer)));
  }
  const scoreMatch = path.match(/^\/v1\/quests\/([^/]+)\/score$/);
  if (scoreMatch && method === "POST") {
    assertScope(identity.scopes, "quests:write");
    const input = await request.json();
    return json(await mutateAndNotify(env, identity, context, (state) => scoreQuest(state, decodeURIComponent(scoreMatch[1]), input.direction || "up", { source: "api" })));
  }
  if (path === "/v1/character" && method === "GET") {
    assertScope(identity.scopes, "character:read");
    return json({ character: characterState(await stateFor(env, identity)) });
  }
  if (path === "/v1/integrations" && method === "GET") {
    assertScope(identity.scopes, "integrations:read");
    return json({ integrations: await listIntegrations(env, identity) });
  }
  const connectMatch = path.match(/^\/v1\/integrations\/([^/]+)\/connect$/);
  if (connectMatch && method === "POST") {
    assertScope(identity.scopes, "integrations:sync");
    if (isTogglFocusService(decodeURIComponent(connectMatch[1]))) {
      assertTogglFocusWebConnection(request, env, identity);
      return json(await connectTogglFocus(env, identity, await request.json()));
    }
    return json(await beginIntegrationConnect(env, identity, decodeURIComponent(connectMatch[1])));
  }
  if (path === "/v1/integrations/toggl-focus/tracking" && method === "GET") {
    assertScope(identity.scopes, "integrations:read");
    return json(await getTogglFocusTracking(env, identity));
  }
  if (path === "/v1/integrations/toggl-focus/tracking/start" && method === "POST") {
    assertScope(identity.scopes, "integrations:sync");
    const input = await request.json();
    return json(await startTogglFocusTracking(env, identity, await stateFor(env, identity), input));
  }
  if (path === "/v1/integrations/toggl-focus/tracking/stop" && method === "POST") {
    assertScope(identity.scopes, "integrations:sync");
    return json(await stopTogglFocusTracking(env, identity, await request.json()));
  }
  if (path === "/v1/integrations/toggl-focus/time-entries" && method === "GET") {
    assertScope(identity.scopes, "integrations:read");
    const query = Object.fromEntries(new URL(request.url).searchParams);
    return json(await listTogglFocusEntries(env, identity, query));
  }
  if (path === "/v1/integrations/toggl-focus/attributions" && method === "POST") {
    assertScope(identity.scopes, "integrations:sync");
    const input = await request.json();
    if (input.dryRun !== false) return json(await previewTogglFocusAttribution(env, identity, await stateFor(env, identity), input));
    return json(await mutateAndNotify(env, identity, context, (state) => applyTogglFocusAttribution(env, identity, state, input)));
  }
  if (path === "/v1/integrations/toggl-focus/purge" && method === "POST") {
    assertScope(identity.scopes, "integrations:sync");
    const input = await request.json();
    if (input.dryRun !== false) return json(purgeManagedFocusLinks(await stateFor(env, identity), input, { source: "toggl-focus" }));
    return json(await mutateAndNotify(env, identity, context, (state) => purgeTogglFocus(env, identity, state, input)));
  }
  const resourcesMatch = path.match(/^\/v1\/integrations\/([^/]+)\/resources$/);
  if (resourcesMatch && method === "GET") {
    assertScope(identity.scopes, "integrations:read");
    if (isTogglFocusService(decodeURIComponent(resourcesMatch[1]))) return json(await listTogglFocusResources(env, identity));
    return json(await listIntegrationResources(env, identity, decodeURIComponent(resourcesMatch[1])));
  }
  const disconnectMatch = path.match(/^\/v1\/integrations\/([^/]+)\/disconnect$/);
  if (disconnectMatch && method === "POST") {
    assertScope(identity.scopes, "integrations:sync");
    return json(await disconnectIntegration(env, identity.uid, decodeURIComponent(disconnectMatch[1])));
  }
  const integrationMatch = path.match(/^\/v1\/integrations\/([^/]+)$/);
  if (integrationMatch && method === "PATCH") {
    assertScope(identity.scopes, "integrations:sync");
    if (isTogglFocusService(decodeURIComponent(integrationMatch[1]))) return json(await configureTogglFocus(env, identity, await request.json()));
    return json(await configureIntegration(env, identity, decodeURIComponent(integrationMatch[1]), await request.json()));
  }
  if (path === "/v1/calendar/schedule" && method === "GET") {
    assertScope(identity.scopes, "integrations:read");
    return json(await calendarSchedule(env, identity, new URL(request.url).searchParams.get("date")));
  }
  const calendarConvertMatch = path.match(/^\/v1\/calendar\/events\/([^/]+)\/convert$/);
  if (calendarConvertMatch && method === "POST") {
    assertScope(identity.scopes, "quests:write");
    return json(await mutateAndNotify(env, identity, context, (state) => convertCalendarEvent(env, identity, state, decodeURIComponent(calendarConvertMatch[1]))), 201);
  }
  const taskExportMatch = path.match(/^\/v1\/quests\/([^/]+)\/google-tasks$/);
  if (taskExportMatch && method === "POST") {
    assertScope(identity.scopes, "integrations:sync");
    return json(await mutateAndNotify(env, identity, context, (state) => exportQuestToGoogleTasks(env, identity, state, decodeURIComponent(taskExportMatch[1]))), 201);
  }
  const taskConflictMatch = path.match(/^\/v1\/quests\/([^/]+)\/google-tasks\/resolve$/);
  if (taskConflictMatch && method === "POST") {
    assertScope(identity.scopes, "integrations:sync");
    const input = await request.json();
    return json(await mutateAndNotify(env, identity, context, (state) => resolveGoogleTaskConflict(env, identity, state, decodeURIComponent(taskConflictMatch[1]), input.strategy)));
  }
  const syncMatch = path.match(/^\/v1\/integrations\/([^/]+)\/sync$/);
  if (syncMatch && method === "POST") {
    assertScope(identity.scopes, "integrations:sync");
    const input = await request.json();
    const dryRun = input.dryRun !== false;
    if (dryRun) return json(await syncIntegration(env, identity, await stateFor(env, identity), decodeURIComponent(syncMatch[1]), input.direction || "import", true));
    const result = await mutateAndNotify(env, identity, context, (state) => syncIntegration(env, identity, state, decodeURIComponent(syncMatch[1]), input.direction || "import", false));
    return json(result);
  }
  if (path === "/v1/sync-events" && method === "GET") {
    assertScope(identity.scopes, "events:read");
    return json({ events: (await stateFor(env, identity)).syncEvents || [] });
  }
  if (path === "/v1/events" && method === "GET") {
    assertScope(identity.scopes, "events:read");
    return json({ events: listEvents(await stateFor(env, identity), new URL(request.url).searchParams.get("limit")) });
  }
  if (path === "/v1/webhooks" && method === "GET") { assertScope(identity.scopes, "webhooks:manage"); return json({ webhooks: await listWebhooks(env, identity.uid) }); }
  if (path === "/v1/webhooks" && method === "POST") { assertScope(identity.scopes, "webhooks:manage"); return json({ webhook: await createWebhook(env, identity.uid, await request.json()) }, 201); }
  const webhookMatch = path.match(/^\/v1\/webhooks\/([^/]+)$/);
  if (webhookMatch && method === "DELETE") { assertScope(identity.scopes, "webhooks:manage"); await deleteWebhook(env, identity.uid, decodeURIComponent(webhookMatch[1])); return new Response(null, { status: 204 }); }
  if (path === "/v1/plugins/validate" && method === "POST") { assertScope(identity.scopes, "plugins:manage"); return json(validateManifest(await request.json())); }
  if (path === "/v1/plugins" && method === "GET") { assertScope(identity.scopes, "plugins:manage"); return json({ plugins: await listPlugins(env, identity.uid) }); }
  if (path === "/v1/plugins" && method === "POST") { assertScope(identity.scopes, "plugins:manage"); return json({ plugin: await installPlugin(env, identity.uid, await request.json()) }, 201); }
  return json({ error: { code: "not_found", message: "Endpoint not found." } }, 404);
}

const SAFE_QUEST_OVERRIDE_KEYS = new Set([
  "title", "notes", "category", "dueDate", "scheduledDate", "scheduledTime", "repeat", "difficulty", "tags",
  "estimatedMinutes", "actualMinutes", "completionCriteria", "nextAction", "impact", "isBlockingOthers",
]);

function safeQuestOverrides(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const safe = {};
  for (const key of Object.keys(input)) {
    if (SAFE_QUEST_OVERRIDE_KEYS.has(key) && input[key] !== undefined) safe[key] = input[key];
  }
  return safe;
}

function reviewSummary(state, period, anchorDate) {
  const from = period === "week" ? addDaysText(anchorDate, -6) : anchorDate;
  const inRange = (text) => {
    const day = String(text || "").slice(0, 10);
    return day >= from && day <= anchorDate;
  };
  const events = state.taskEvents || [];
  const completed = (state.tasks || []).filter((task) => inRange(task.completedAt) || inRange(task.lastCompletedDate));
  const created = (state.tasks || []).filter((task) => inRange(task.createdAt));
  const scored = events.filter((event) => inRange(event.at) && event.type === "quest.scored" && event.details?.rewardGranted === true);
  const failed = events.filter((event) => inRange(event.at) && event.type === "quest.failed");
  const focusMinutes = completed.reduce((sum, task) => sum + Number(task.actualMinutes || 0), 0);
  const tagCounts = {};
  for (const task of completed) for (const tag of task.tags || []) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  return {
    period,
    anchorDate,
    from,
    questsCompleted: completed.length,
    questsCreated: created.length,
    questsFailed: failed.length,
    rewardsEarned: scored.length,
    eventsLogged: events.filter((event) => inRange(event.at)).length,
    focusMinutes,
    topTags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag, count]) => ({ tag, count })),
    character: { level: Number(state.character?.level || 1), xp: Number(state.character?.xp || 0), gems: Number(state.character?.gems || 0) },
  };
}

async function calendarBrief(env, identity, date) {
  try {
    assertScope(identity.scopes, "integrations:read");
    return { requested: true, available: true, schedule: await calendarSchedule(env, identity, date) };
  } catch (error) {
    const missingScope = error.code === "insufficient_scope";
    return {
      requested: true,
      available: false,
      code: error.code || "integration_unavailable",
      reason: missingScope ? "missing_scope" : "integration_unavailable",
      action: missingScope
        ? "Connect with the integrations:read scope to include your Calendar schedule."
        : "Connect Google Calendar in QuestForge settings, run a calendar sync, then try again.",
    };
  }
}

async function convertCalendarEventWithOverrides(env, identity, state, args) {
  if (args.calendarId) {
    const schedule = await calendarSchedule(env, identity, todayText());
    const event = schedule.events.find((item) => item.externalId === args.eventId && item.calendarId === args.calendarId);
    if (!event) throw new DomainError(404, "calendar_event_not_found", "Calendar event is not available in today's schedule cache for the requested calendar.");
  }
  const overrides = safeQuestOverrides(args.overrides);
  const converted = await convertCalendarEvent(env, identity, state, args.eventId);
  const events = [converted.event];
  if (Object.keys(overrides).length) {
    converted.quest = patchQuest(state, converted.quest.id, overrides, { source: "mcp", countRollover: false, returnEvent: false });
    events.push(state.taskEvents[0]);
  }
  return { ...converted, events };
}

async function callMcpTool(name, args, env, context, identity) {
  if (name === "list_registered_agents") {
    assertScope(identity.scopes, "agents:read");
    return { agents: await listAgents(env, identity.uid) };
  }
  if (name === "get_current_agent_context") {
    assertScope(identity.scopes, "agents:read");
    return {
      agent: identity.agent || null,
      clientId: identity.clientId || null,
      effectiveScopes: identity.scopes || [],
      linked: Boolean(identity.agent),
    };
  }
  if (name === "assign_quest_to_agent") {
    assertScope(identity.scopes, "agents:read");
    return assignQuestToAgent(env, identity, context, args);
  }
  if (name === "get_my_profile") { assertScope(identity.scopes, "profiles:read"); return { profile: await getOwnProfile(env, identity.uid) }; }
  if (name === "find_profile_by_handle") { assertScope(identity.scopes, "profiles:read"); return { profile: await findProfileByHandle(env, args.handle) }; }
  if (name === "update_profile") { assertScope(identity.scopes, "profiles:write"); return { profile: await upsertProfile(env, identity.uid, args) }; }
  if (name === "list_friends") { assertScope(identity.scopes, "friends:read"); return { friends: await listFriends(env, identity.uid) }; }
  if (name === "list_friend_requests") { assertScope(identity.scopes, "friends:read"); return { requests: await listFriendRequests(env, identity.uid) }; }
  if (name === "send_friend_request") { assertScope(identity.scopes, "friends:write"); return { request: await sendFriendRequest(env, identity.uid, args.receiverUid) }; }
  if (name === "respond_friend_request") {
    assertScope(identity.scopes, "friends:write");
    const result = args.decision === "accept"
      ? await acceptFriendRequest(env, identity.uid, args.requestId)
      : await declineFriendRequest(env, identity.uid, args.requestId);
    return args.decision === "accept" ? { friends: result } : { requests: result };
  }
  if (name === "remove_friend") { assertScope(identity.scopes, "friends:write"); return removeFriend(env, identity.uid, args.friendUid); }
  if (name === "get_party") { assertScope(identity.scopes, "parties:read"); return { party: await getParty(env, identity.uid) }; }
  if (name === "create_party") { assertScope(identity.scopes, "parties:write"); return { party: await createParty(env, identity.uid, args) }; }
  if (name === "invite_party_member") { assertScope(identity.scopes, "parties:write"); return inviteToParty(env, identity.uid, args); }
  if (name === "accept_party_invite") { assertScope(identity.scopes, "parties:write"); return { party: await acceptPartyInvite(env, identity.uid, args) }; }
  if (name === "leave_party") { assertScope(identity.scopes, "parties:write"); return leaveParty(env, identity.uid); }
  if (name === "remove_party_member") { assertScope(identity.scopes, "parties:write"); return { party: await removePartyMember(env, identity.uid, args.memberUid) }; }
  if (name === "get_battle_session") { assertScope(identity.scopes, "battle:read"); return { session: getBattleSession(await stateFor(env, identity)) }; }
  if (name === "battle_command") {
    assertScope(identity.scopes, "battle:write");
    if (args.dryRun !== false) return battleCommand(await stateFor(env, identity), args, { source: "mcp" });
    return mutateAndNotify(env, identity, context, (state) => battleCommand(state, args, { source: "mcp" }));
  }
  if (name === "list_today_quests") { assertScope(identity.scopes, "quests:read"); return listQuestPage(await stateFor(env, identity), { view: "today", date: args.date }); }
  if (name === "list_quests") { assertScope(identity.scopes, "quests:read"); return listQuestPage(await stateFor(env, identity), args); }
  if (name === "create_quest") {
    assertScope(identity.scopes, "quests:write");
    const created = await mutateAndNotify(env, identity, context, (state) => createQuest(state, args, { source: "mcp", returnEvent: true }));
    if (created.quest && await isTogglFocusAutoCreateEnabled(env, identity)) {
      try {
        const synced = await mutateAndNotify(env, identity, context, (state) => syncQuestToTogglFocus(env, identity, state, created.quest.id, { dryRun: false }));
        created.focus = { queued: false, synced: true, external: synced.external };
      } catch (error) {
        created.focus = { queued: false, synced: false, error: error.code || "focus_sync_failed" };
      }
    }
    return created;
  }
  if (name === "update_quest") {
    assertScope(identity.scopes, "quests:write");
    const { questId, ...patch } = args;
    return mutateAndNotify(env, identity, context, (state) => patchQuest(state, questId, patch, { source: "mcp", returnEvent: true }));
  }
  if (name === "batch_update_quests") {
    assertScope(identity.scopes, "quests:write");
    if (args.dryRun !== false) return batchUpdateQuests(await stateFor(env, identity), args, { source: "mcp" });
    return mutateAndNotify(env, identity, context, (state) => batchUpdateQuests(state, args, { source: "mcp" }));
  }
  if (name === "batch_score_quests") {
    assertScope(identity.scopes, "quests:write");
    if (args.dryRun !== false) return batchScoreQuests(await stateFor(env, identity), args, { source: "mcp" });
    return mutateAndNotify(env, identity, context, (state) => batchScoreQuests(state, args, { source: "mcp" }));
  }
  if (name === "archive_quests") {
    assertScope(identity.scopes, "quests:write");
    if (args.dryRun !== false) return archiveQuests(await stateFor(env, identity), args, { source: "mcp" });
    return mutateAndNotify(env, identity, context, (state) => archiveQuests(state, args, { source: "mcp" }));
  }
  if (name === "link_external_record") {
    assertScope(identity.scopes, "quests:write");
    const { questId, ...link } = args;
    return mutateAndNotify(env, identity, context, (state) => linkExternalRecord(state, questId, link, { source: "mcp" }));
  }
  if (name === "score_quest") { assertScope(identity.scopes, "quests:write"); return mutateAndNotify(env, identity, context, (state) => scoreQuest(state, args.questId, args.direction, { source: "mcp" })); }
  if (name === "get_character_state") { assertScope(identity.scopes, "character:read"); return { character: characterState(await stateFor(env, identity)) }; }
  if (name === "buy_reward") { assertScope(identity.scopes, "rewards:write"); return mutateAndNotify(env, identity, context, (state) => buyReward(state, args.questId, { source: "mcp" })); }
  if (name === "list_integrations") { assertScope(identity.scopes, "integrations:read"); return { integrations: await listIntegrations(env, identity) }; }
  if (name === "get_toggl_focus_status") {
    assertScope(identity.scopes, "integrations:read");
    return getTogglFocusTracking(env, identity);
  }
  if (name === "list_toggl_focus_entries") {
    assertScope(identity.scopes, "integrations:read");
    return listTogglFocusEntries(env, identity, args);
  }
  if (name === "sync_quest_to_toggl_focus") {
    assertScope(identity.scopes, "integrations:sync");
    if (args.dryRun !== false) return syncQuestToTogglFocus(env, identity, await stateFor(env, identity), args.questId, args);
    return mutateAndNotify(env, identity, context, (state) => syncQuestToTogglFocus(env, identity, state, args.questId, args));
  }
  if (name === "get_toggl_focus_tracking") {
    assertScope(identity.scopes, "integrations:read");
    return getTogglFocusTracking(env, identity);
  }
  if (name === "start_toggl_focus_tracking") {
    assertScope(identity.scopes, "integrations:sync");
    return startTogglFocusTracking(env, identity, await stateFor(env, identity), args);
  }
  if (name === "stop_toggl_focus_tracking") {
    assertScope(identity.scopes, "integrations:sync");
    return stopTogglFocusTracking(env, identity, args);
  }
  if (name === "preview_toggl_attribution") {
    assertScope(identity.scopes, "integrations:read");
    return previewTogglFocusAttribution(env, identity, await stateFor(env, identity), args);
  }
  if (name === "apply_toggl_attribution") {
    assertScope(identity.scopes, "integrations:sync");
    if (args.dryRun !== false) return previewTogglFocusAttribution(env, identity, await stateFor(env, identity), args);
    return mutateAndNotify(env, identity, context, (state) => applyTogglFocusAttribution(env, identity, state, args));
  }
  if (name === "get_toggl_estimate_insights") {
    assertScope(identity.scopes, "integrations:read");
    return getTogglFocusEstimateInsights(env, identity, await stateFor(env, identity));
  }
  if (name === "preview_external_sync") { assertScope(identity.scopes, "integrations:read"); return syncIntegration(env, identity, await stateFor(env, identity), args.service, args.direction || "import", true); }
  if (name === "sync_external_service") {
    assertScope(identity.scopes, "integrations:sync");
    if (args.dryRun !== false) return syncIntegration(env, identity, await stateFor(env, identity), args.service, args.direction || "import", true);
    return mutateAndNotify(env, identity, context, (state) => syncIntegration(env, identity, state, args.service, args.direction || "import", false));
  }
  if (name === "get_quest") {
    assertScope(identity.scopes, "quests:read");
    return getQuest(await stateFor(env, identity), args.questId);
  }
  if (name === "get_quest_tree") {
    assertScope(identity.scopes, "quests:read");
    return getQuestTree(await stateFor(env, identity), args);
  }
  if (name === "get_daily_brief") {
    assertScope(identity.scopes, "quests:read");
    assertScope(identity.scopes, "character:read");
    const date = validDateValue(args.date) || todayText();
    const state = await stateFor(env, identity);
    const brief = {
      date,
      quests: listQuestPage(state, { view: "today", date }),
      character: characterState(state),
    };
    brief.calendar = args.includeCalendar
      ? await calendarBrief(env, identity, date)
      : { requested: false, available: false, reason: "not_requested", action: "Call get_calendar_schedule or pass includeCalendar to include your Calendar schedule." };
    return brief;
  }
  if (name === "get_review_summary") {
    assertScope(identity.scopes, "quests:read");
    assertScope(identity.scopes, "events:read");
    const period = args.period === "week" ? "week" : "day";
    const anchorDate = validDateValue(args.anchorDate) || todayText();
    return reviewSummary(await stateFor(env, identity), period, anchorDate);
  }
  if (name === "list_agent_handoffs") {
    assertScope(identity.scopes, "quests:read");
    return listAgentHandoffs(await stateFor(env, identity), args);
  }
  if (name === "transition_quest_handoff") {
    assertScope(identity.scopes, "quests:write");
    const input = { ...args, reviewedBy: identity.uid };
    if (args.dryRun !== false) return transitionQuestHandoff(await stateFor(env, identity), args.questId, input, { source: "mcp", reviewedBy: identity.uid });
    return mutateAndNotify(env, identity, context, (state) => transitionQuestHandoff(state, args.questId, input, { source: "mcp", reviewedBy: identity.uid }));
  }
  if (name === "list_activity_events") {
    assertScope(identity.scopes, "events:read");
    const state = await stateFor(env, identity);
    let events = state.taskEvents || [];
    if (args.eventType) events = events.filter((event) => event.type === args.eventType);
    const total = events.length;
    const limit = Math.max(1, Math.min(250, Number(args.limit) || 50));
    const offset = Math.max(0, Number(args.cursor) || 0);
    return { events: events.slice(offset, offset + limit), total, limit, nextCursor: offset + limit < total ? String(offset + limit) : null };
  }
  if (name === "get_calendar_schedule") {
    assertScope(identity.scopes, "integrations:read");
    return { schedule: await calendarSchedule(env, identity, validDateValue(args.date) || undefined) };
  }
  if (name === "convert_calendar_event_to_quest") {
    assertScope(identity.scopes, "quests:write");
    assertScope(identity.scopes, "integrations:sync");
    return mutateAndNotify(env, identity, context, (state) => convertCalendarEventWithOverrides(env, identity, state, args));
  }
  throw new DomainError(404, "tool_not_found", `Unknown MCP tool: ${name}`);
}

async function handleMcp(request, env, context, identity) {
  if (request.method === "GET") return json({ name: "questforge-mcp", transport: "streamable-http", protocol: "2025-06-18" });
  const message = await request.json();
  if (message.method === "notifications/initialized") return new Response(null, { status: 202 });
  let result;
  if (message.method === "initialize") result = { protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: true } }, serverInfo: { name: "questforge-mcp", version: "2.7.0" }, instructions: "Use QuestForge to organize quests, Quest Trees, registered Agents, daily plans, reviews, agent handoffs, profiles, friends, parties, command battles, and Toggl Focus. Read before writing. Preview Agent assignments, batch updates, batch scoring, archives, handoff transitions, battle commands, Focus tasks, timers, and time attribution before execution. Never request or accept API keys through MCP. Ask for confirmation before destructive actions. Quest deletion is not supported." };
  else if (message.method === "tools/list") result = { tools: MCP_TOOLS };
  else if (message.method === "tools/call") {
    try {
      const value = await callMcpTool(message.params?.name, message.params?.arguments || {}, env, context, identity);
      result = { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value, isError: false };
    } catch (error) {
      result = {
        content: [{ type: "text", text: error.message || "QuestForge tool failed." }],
        structuredContent: { error: { code: error.code || "tool_error", message: error.message } },
        isError: true,
      };
    }
  } else return json({ jsonrpc: "2.0", id: message.id ?? null, error: { code: -32601, message: "Method not found" } });
  return json({ jsonrpc: "2.0", id: message.id ?? null, result }, 200, { "mcp-protocol-version": "2025-06-18" });
}

async function handleRequest(request, env, context) {
  const url = new URL(request.url); const path = url.pathname;
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (path === "/health") return json({ ok: true, service: "questforge-gateway", version: "2.7.0", schemaVersion: 7, mcp: { stable: "/mcp", preview: "/mcp-next", tools: MCP_TOOLS.length }, oauthStorage: env.QUESTFORGE_KV ? "persistent" : "ephemeral", integrationStorage: env.QUESTFORGE_DB ? "d1" : "ephemeral", socialStorage: env.QUESTFORGE_DB ? "d1" : "ephemeral", agentStorage: env.QUESTFORGE_DB ? "d1" : "ephemeral" });
  if (path === "/.well-known/oauth-authorization-server") return json(oauthMetadata(request, env));
  if (path === "/.well-known/oauth-protected-resource" || path === "/.well-known/oauth-protected-resource/mcp") return json(protectedResourceMetadata(request, env));
  if (path === "/oauth/register" && request.method === "POST") return registerClient(request, env);
  if (path === "/oauth/authorize" && request.method === "GET") return authorizePage(request, env);
  if (path === "/oauth/approve" && request.method === "POST") return approveAuthorization(request, env);
  if (path === "/oauth/token" && request.method === "POST") return tokenEndpoint(request, env);
  if (path === "/oauth/revoke" && request.method === "POST") return revokeToken(request, env);
  if (path === "/telemetry") return acceptTelemetry(request, env);
  const providerCallbackMatch = path.match(/^\/oauth\/callback\/(google|notion)$/);
  if (providerCallbackMatch && request.method === "GET") return handleProviderCallback(request, env, providerCallbackMatch[1]);
  if (path === "/openapi.json") return fetch(new URL("/api/openapi.json", env.WEB_APP_URL || "http://localhost:5173"));

  const authenticated = await authenticateRequest(request, env);
  if (!authenticated) return json({ error: { code: "unauthorized", message: "A valid OAuth or Firebase bearer token is required." } }, 401, { "www-authenticate": `Bearer resource_metadata="${url.origin}/.well-known/oauth-protected-resource/mcp"` });
  const identity = await identityWithAgentContext(env, authenticated);
  if (path === "/mcp") return handleMcp(request, env, context, identity);
  if (path === "/mcp-next") return handleMcpNext(request, env, context, identity);
  if (path.startsWith("/v1/")) return routeApi(request, env, context, identity, path);
  return json({ error: { code: "not_found", message: "Route not found." } }, 404);
}

export default {
  async fetch(request, env, context) {
    try { return withCors(await handleRequest(request, env, context), request, env); }
    catch (error) { console.error(error); return withCors(errorResponse(error), request, env); }
  },
  async scheduled(_controller, env, context) {
    context.waitUntil(retryDeliveries(env));
    context.waitUntil(runScheduledIntegrations(env));
    context.waitUntil(purgeTelemetry(env));
  },
};

async function purgeTelemetry(env) {
  if (!env.QUESTFORGE_DB) return;
  await env.QUESTFORGE_DB.prepare("DELETE FROM telemetry_events WHERE created_at < datetime('now', '-90 days')").run();
}

async function runScheduledIntegrations(env) {
  const accounts = await listDueIntegrationAccounts(env, 20);
  for (const account of accounts) {
    try {
      const direction = account.service === "notion" ? "export" : account.service === "google-tasks" ? "bidirectional" : "import";
      await mutateState(env, { uid: account.uid }, (state) => syncIntegration(env, { uid: account.uid }, state, account.service, direction, false));
    } catch (error) {
      console.error("Scheduled integration sync failed", { uid: account.uid, service: account.service, code: error.code || "sync_failed" });
    }
  }
}

export { MCP_TOOLS, callMcpTool, handleMcp, routeApi };

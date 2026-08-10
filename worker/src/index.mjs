import {
  DomainError,
  archiveQuests,
  assertScope,
  batchUpdateQuests,
  battleCommand,
  buyReward,
  characterState,
  createQuest,
  getBattleSession,
  linkExternalRecord,
  listEvents,
  listQuestPage,
  listQuests,
  patchQuest,
  scoreQuest,
} from "../../server/questforge-domain.mjs";
import { mutateState, readState } from "./firebase-store.mjs";
import { authenticateRequest } from "./security.mjs";
import {
  approveAuthorization,
  authorizePage,
  oauthMetadata,
  protectedResourceMetadata,
  registerClient,
  revokeToken,
  tokenEndpoint,
} from "./oauth.mjs";
import {
  calendarSchedule,
  configureIntegration,
  convertCalendarEvent,
  exportQuestToGoogleTasks,
  listIntegrationResources,
  listIntegrations,
  resolveGoogleTaskConflict,
  syncIntegration,
} from "./integrations.mjs";
import { listDueIntegrationAccounts } from "./integration-store.mjs";
import { beginIntegrationConnect, disconnectIntegration, handleProviderCallback } from "./provider-oauth.mjs";
import {
  createWebhook,
  deleteWebhook,
  deliverEvent,
  installPlugin,
  listPlugins,
  listWebhooks,
  retryDeliveries,
  validateManifest,
} from "./extensions.mjs";
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
} from "./social-store.mjs";

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
  assignee: {
    type: "object",
    required: ["type", "id", "label"],
    properties: {
      type: { type: "string", enum: ["self", "human", "agent"] },
      id: { type: "string", minLength: 1, maxLength: 120 },
      label: { type: "string", minLength: 1, maxLength: 80 },
      handoffState: { type: "string", enum: ["none", "ready"], default: "none" },
    },
  },
};

const LIST_QUEST_PROPERTIES = {
  view: { type: "string", enum: ["today", "week", "future", "backlog", "completed", "archive", "all"], default: "all" },
  date: { type: "string", format: "date" }, kind: QUEST_INPUT_PROPERTIES.kind, category: { type: "string" }, tag: { type: "string" },
  planningState: QUEST_INPUT_PROPERTIES.planningState, lifecycleState: QUEST_INPUT_PROPERTIES.lifecycleState,
  from: { type: "string", format: "date" }, to: { type: "string", format: "date" }, search: { type: "string" },
  limit: { type: "integer", minimum: 1, maximum: 200, default: 100 }, cursor: { type: "string" },
};

const MCP_TOOLS = [
  { name: "list_today_quests", description: "List active scheduled QuestForge quests visible today, including overdue work.", inputSchema: { type: "object", properties: { date: { type: "string", format: "date" } } }, annotations: { readOnlyHint: true } },
  { name: "list_quests", description: "List QuestForge quests by today, week, future, backlog, completed, archive, or all views.", inputSchema: { type: "object", properties: LIST_QUEST_PROPERTIES }, annotations: { readOnlyHint: true } },
  { name: "create_quest", description: "Create a QuestForge habit, daily, todo, or reward with planning and priority details.", inputSchema: { type: "object", required: ["kind", "title"], properties: QUEST_INPUT_PROPERTIES }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: "update_quest", description: "Edit one QuestForge quest. Moving a scheduled date later increments rolloverCount.", inputSchema: { type: "object", required: ["questId"], properties: { questId: { type: "string" }, ...QUEST_INPUT_PROPERTIES } }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: "batch_update_quests", description: "Preview or atomically update up to 100 quests, including postponing or moving them to backlog.", inputSchema: { type: "object", required: ["questIds"], properties: { questIds: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 100 }, patch: { type: "object", properties: QUEST_INPUT_PROPERTIES }, postponeDays: { type: "integer", minimum: -365, maximum: 365 }, dryRun: { type: "boolean", default: true } } }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: "archive_quests", description: "Preview or archive completed one-off todo quests. Archived quests are retained permanently.", inputSchema: { type: "object", properties: { questIds: { type: "array", items: { type: "string" }, maxItems: 100 }, throughDate: { type: "string", format: "date" }, dryRun: { type: "boolean", default: true } } }, annotations: { readOnlyHint: false, destructiveHint: true } },
  { name: "link_external_record", description: "Link a Google Calendar, Toggl, or other external record to a quest.", inputSchema: { type: "object", required: ["questId", "service", "externalId"], properties: { questId: { type: "string" }, service: { type: "string" }, externalId: { type: "string" }, type: { type: "string" }, url: { type: "string", format: "uri" }, projectId: { type: "string" }, durationMinutes: { type: "integer", minimum: 0 }, syncedAt: { type: "string" } } }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true } },
  { name: "score_quest", description: "Complete, reopen, or score a quest and apply its HP, XP, Gem, and MP effects.", inputSchema: { type: "object", required: ["questId", "direction"], properties: { questId: { type: "string" }, direction: { type: "string", enum: ["up", "down"] } } }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: "get_character_state", description: "Return the current character, MP, equipment, and boss state.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  { name: "buy_reward", description: "Redeem a reward quest using Gems.", inputSchema: { type: "object", required: ["questId"], properties: { questId: { type: "string" } } }, annotations: { readOnlyHint: false, destructiveHint: true } },
  { name: "list_integrations", description: "List per-user integration connection, configuration, and reconnect status without exposing provider tokens.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  { name: "preview_external_sync", description: "Preview connected Google Calendar, Google Tasks, or Notion changes without saving them.", inputSchema: { type: "object", required: ["service"], properties: { service: { type: "string", enum: ["google-calendar", "google-tasks", "notion"] }, direction: { type: "string", enum: ["import", "export", "bidirectional"] } } }, annotations: { readOnlyHint: true, openWorldHint: true } },
  { name: "sync_external_service", description: "Run a configured external sync. dryRun defaults to true and provider writes require explicit execution.", inputSchema: { type: "object", required: ["service", "direction"], properties: { service: { type: "string", enum: ["google-calendar", "google-tasks", "notion"] }, direction: { type: "string", enum: ["import", "export", "bidirectional"] }, dryRun: { type: "boolean", default: true } } }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true } },
  { name: "get_my_profile", description: "Get the authenticated user's QuestForge public profile settings.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  { name: "find_profile_by_handle", description: "Find one QuestForge public profile by an exact @handle.", inputSchema: { type: "object", required: ["handle"], properties: { handle: { type: "string", minLength: 3, maxLength: 21 } } }, annotations: { readOnlyHint: true } },
  { name: "update_profile", description: "Create or update the authenticated user's public QuestForge profile.", inputSchema: { type: "object", properties: { displayName: { type: "string", minLength: 1, maxLength: 40 }, handle: { type: "string", minLength: 3, maxLength: 21 }, bio: { type: "string", maxLength: 160 }, avatarRole: { type: "string", maxLength: 40 }, avatarVariant: { type: "string", maxLength: 40 }, level: { type: "integer", minimum: 1 } } }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: "list_friends", description: "List accepted friends using minimal public profile fields.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  { name: "list_friend_requests", description: "List pending incoming and outgoing friend requests.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  { name: "send_friend_request", description: "Send a friend request to a stable QuestForge user ID after exact-handle lookup.", inputSchema: { type: "object", required: ["receiverUid"], properties: { receiverUid: { type: "string" } } }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: "respond_friend_request", description: "Accept or decline a pending incoming friend request.", inputSchema: { type: "object", required: ["requestId", "decision"], properties: { requestId: { type: "string" }, decision: { type: "string", enum: ["accept", "decline"] } } }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: "remove_friend", description: "Remove an existing friendship for both users.", inputSchema: { type: "object", required: ["friendUid"], properties: { friendUid: { type: "string" } } }, annotations: { readOnlyHint: false, destructiveHint: true } },
  { name: "get_party", description: "Get the authenticated user's active party and minimal member profiles.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  { name: "create_party", description: "Create a party with the authenticated user as owner. One active party per user, four members maximum.", inputSchema: { type: "object", required: ["name"], properties: { name: { type: "string", minLength: 1, maxLength: 40 } } }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: "invite_party_member", description: "Create a seven-day party invite. Only the party owner can use this tool.", inputSchema: { type: "object", properties: { inviteeUid: { type: "string" } } }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: "accept_party_invite", description: "Accept a party invite using its one-time token or invite ID.", inputSchema: { type: "object", properties: { token: { type: "string" }, inviteId: { type: "string" } } }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: "leave_party", description: "Leave the active party. Ownership transfers to the earliest remaining member.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: false, destructiveHint: true } },
  { name: "remove_party_member", description: "Remove a party member. Only the owner can use this tool.", inputSchema: { type: "object", required: ["memberUid"], properties: { memberUid: { type: "string" } } }, annotations: { readOnlyHint: false, destructiveHint: true } },
  { name: "get_battle_session", description: "Get the current QuestForge command battle state, available commands, and MP-generating quests.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  { name: "battle_command", description: "Preview or execute one deterministic command battle turn. Execution requires the current turn and a unique commandId.", inputSchema: { type: "object", required: ["command"], properties: { command: { type: "string", enum: ["attack", "skill", "guard", "heal", "burst"] }, expectedTurn: { type: "integer", minimum: 1 }, commandId: { type: "string", maxLength: 120 }, dryRun: { type: "boolean", default: true } } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } },
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

async function stateFor(env, identity) {
  const { payload } = await readState(env, identity);
  if (!payload?.state) { const error = new Error("Open QuestForge and complete Firebase sync before connecting an AI client."); error.status = 409; error.code = "state_unavailable"; throw error; }
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
    return json(await mutateAndNotify(env, identity, context, (state) => createQuest(state, input, { source: "api", returnEvent: true })), 201);
  }
  if (path === "/v1/quests/batch-update" && method === "POST") {
    assertScope(identity.scopes, "quests:write");
    const input = await request.json();
    if (input.dryRun !== false) return json(batchUpdateQuests(await stateFor(env, identity), input, { source: "api" }));
    return json(await mutateAndNotify(env, identity, context, (state) => batchUpdateQuests(state, input, { source: "api" })));
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
  const questMatch = path.match(/^\/v1\/quests\/([^/]+)$/);
  if (questMatch && method === "PATCH") {
    assertScope(identity.scopes, "quests:write");
    const input = await request.json();
    return json(await mutateAndNotify(env, identity, context, (state) => patchQuest(state, decodeURIComponent(questMatch[1]), input, { source: "api", returnEvent: true })));
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
    return json(await beginIntegrationConnect(env, identity, decodeURIComponent(connectMatch[1])));
  }
  const resourcesMatch = path.match(/^\/v1\/integrations\/([^/]+)\/resources$/);
  if (resourcesMatch && method === "GET") {
    assertScope(identity.scopes, "integrations:read");
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

async function callMcpTool(name, args, env, context, identity) {
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
  if (name === "create_quest") { assertScope(identity.scopes, "quests:write"); return mutateAndNotify(env, identity, context, (state) => createQuest(state, args, { source: "mcp", returnEvent: true })); }
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
  if (name === "preview_external_sync") { assertScope(identity.scopes, "integrations:read"); return syncIntegration(env, identity, await stateFor(env, identity), args.service, args.direction || "import", true); }
  if (name === "sync_external_service") {
    assertScope(identity.scopes, "integrations:sync");
    if (args.dryRun !== false) return syncIntegration(env, identity, await stateFor(env, identity), args.service, args.direction || "import", true);
    return mutateAndNotify(env, identity, context, (state) => syncIntegration(env, identity, state, args.service, args.direction || "import", false));
  }
  throw new DomainError(404, "tool_not_found", `Unknown MCP tool: ${name}`);
}

async function handleMcp(request, env, context, identity) {
  if (request.method === "GET") return json({ name: "questforge-mcp", transport: "streamable-http", protocol: "2025-06-18" });
  const message = await request.json();
  if (message.method === "notifications/initialized") return new Response(null, { status: 202 });
  let result;
  if (message.method === "initialize") result = { protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "questforge-mcp", version: "2.2.0" }, instructions: "Use QuestForge to organize quests, profiles, friends, parties, and command battles. Use exact @handle lookup before friend requests. Preview batch updates, archives, battle commands, and external sync before execution. Ask for confirmation before destructive actions. Quest deletion is not supported." };
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
  if (path === "/health") return json({ ok: true, service: "questforge-gateway", version: "2.2.0", schemaVersion: 5, oauthStorage: env.QUESTFORGE_KV ? "persistent" : "ephemeral", integrationStorage: env.QUESTFORGE_DB ? "d1" : "ephemeral", socialStorage: env.QUESTFORGE_DB ? "d1" : "ephemeral" });
  if (path === "/.well-known/oauth-authorization-server") return json(oauthMetadata(request, env));
  if (path === "/.well-known/oauth-protected-resource" || path === "/.well-known/oauth-protected-resource/mcp") return json(protectedResourceMetadata(request, env));
  if (path === "/oauth/register" && request.method === "POST") return registerClient(request, env);
  if (path === "/oauth/authorize" && request.method === "GET") return authorizePage(request, env);
  if (path === "/oauth/approve" && request.method === "POST") return approveAuthorization(request, env);
  if (path === "/oauth/token" && request.method === "POST") return tokenEndpoint(request, env);
  if (path === "/oauth/revoke" && request.method === "POST") return revokeToken(request, env);
  const providerCallbackMatch = path.match(/^\/oauth\/callback\/(google|notion)$/);
  if (providerCallbackMatch && request.method === "GET") return handleProviderCallback(request, env, providerCallbackMatch[1]);
  if (path === "/openapi.json") return fetch(new URL("/api/openapi.json", env.WEB_APP_URL || "http://localhost:5173"));

  const identity = await authenticateRequest(request, env);
  if (!identity) return json({ error: { code: "unauthorized", message: "A valid OAuth or Firebase bearer token is required." } }, 401, { "www-authenticate": `Bearer resource_metadata="${url.origin}/.well-known/oauth-protected-resource/mcp"` });
  if (path === "/mcp") return handleMcp(request, env, context, identity);
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
  },
};

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

export { MCP_TOOLS, handleMcp, routeApi };

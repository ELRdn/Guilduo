import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MCP_TOOLS } from "../worker/src/index.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const apiDirectory = join(root, "api");
const openApiPath = join(apiDirectory, "openapi.json");
const openapi = JSON.parse(await readFile(openApiPath, "utf8"));
openapi.components ||= openapi.paths?.components || { securitySchemes: {}, schemas: {} };
if (openapi.paths?.components) delete openapi.paths.components;

const jsonContent = (schema) => ({ content: { "application/json": { schema } } });
const ok = (description, schema = { type: "object" }) => ({ "200": { description, ...jsonContent(schema) } });
const body = (schema) => ({ required: true, ...jsonContent(schema) });
const parameter = (name) => ({ name, in: "path", required: true, schema: { type: "string" } });

const questListPath = openapi.paths["/v1/quests"];
if (questListPath?.get) {
  questListPath.get.parameters ||= [];
  const existingParameters = new Set(questListPath.get.parameters.map((item) => item.name));
  for (const item of [
    { name: "parentQuestId", in: "query", schema: { type: "string", maxLength: 120 } },
    { name: "rootOnly", in: "query", schema: { type: "boolean", default: false } },
  ]) {
    if (!existingParameters.has(item.name)) questListPath.get.parameters.push(item);
  }
}

openapi.info = {
  title: "QuestForge API",
  version: "2.4.0",
  description: "QuestForge REST API for quests, Quest Trees, agent handoffs, work-management reviews, profiles, friends, parties, command battles, integrations, plugins, and signed webhooks.",
};
openapi.servers = [
  { url: "https://your-questforge-worker.example.workers.dev", description: "Cloudflare Worker" },
  { url: "http://127.0.0.1:8787", description: "Local Wrangler" },
];

Object.assign(openapi.paths, {
  "/v1/profile": {
    get: { summary: "Get the authenticated user's profile", responses: ok("Own profile", { type: "object", properties: { profile: { anyOf: [{ $ref: "#/components/schemas/OwnProfile" }, { type: "null" }] } } }) },
    patch: { summary: "Create or update the authenticated user's profile", requestBody: body({ $ref: "#/components/schemas/ProfileInput" }), responses: ok("Updated profile", { type: "object", properties: { profile: { $ref: "#/components/schemas/OwnProfile" } } }) },
  },
  "/v1/profiles/{handle}": {
    get: { summary: "Find a public profile by exact @handle", parameters: [parameter("handle")], responses: ok("Public profile", { type: "object", properties: { profile: { anyOf: [{ $ref: "#/components/schemas/PublicProfile" }, { type: "null" }] } } }) },
  },
  "/v1/friends": {
    get: { summary: "List accepted friends", responses: ok("Friend list", { type: "object", properties: { friends: { type: "array", items: { $ref: "#/components/schemas/PublicProfile" } } } }) },
  },
  "/v1/friends/{friendUid}": {
    delete: { summary: "Remove a friendship", parameters: [parameter("friendUid")], responses: ok("Friendship removed") },
  },
  "/v1/friend-requests": {
    get: { summary: "List pending friend requests", responses: ok("Friend request list", { type: "object", properties: { requests: { type: "array", items: { $ref: "#/components/schemas/FriendRequest" } } } }) },
    post: { summary: "Send a friend request", requestBody: body({ type: "object", required: ["receiverUid"], properties: { receiverUid: { type: "string" } } }), responses: { "201": { description: "Friend request created" } } },
  },
  "/v1/friend-requests/{requestId}/{decision}": {
    post: { summary: "Accept or decline an incoming friend request", parameters: [parameter("requestId"), { ...parameter("decision"), schema: { type: "string", enum: ["accept", "decline"] } }], responses: ok("Friend request updated") },
  },
  "/v1/party": {
    get: { summary: "Get the active party", responses: ok("Active party", { type: "object", properties: { party: { anyOf: [{ $ref: "#/components/schemas/Party" }, { type: "null" }] } } }) },
    post: { summary: "Create a party", requestBody: body({ type: "object", required: ["name"], properties: { name: { type: "string", minLength: 1, maxLength: 40 } } }), responses: { "201": { description: "Party created" } } },
  },
  "/v1/party/invites": {
    post: { summary: "Create a seven-day party invite", requestBody: body({ type: "object", properties: { inviteeUid: { type: "string" } } }), responses: { "201": { description: "Invite created; raw token is returned once" } } },
  },
  "/v1/party/invites/accept": {
    post: { summary: "Accept a party invite", requestBody: body({ type: "object", properties: { token: { type: "string" }, inviteId: { type: "string" } } }), responses: ok("Party joined") },
  },
  "/v1/party/leave": {
    post: { summary: "Leave the active party", responses: ok("Party left") },
  },
  "/v1/party/members/{memberUid}": {
    delete: { summary: "Remove a party member as owner", parameters: [parameter("memberUid")], responses: ok("Member removed") },
  },
  "/v1/battle/session": {
    get: { summary: "Get the current command battle session", responses: ok("Battle session", { type: "object", properties: { session: { $ref: "#/components/schemas/BattleSession" } } }) },
  },
  "/v1/battle/commands": {
    post: { summary: "Preview or execute one command battle turn", requestBody: body({ $ref: "#/components/schemas/BattleCommandInput" }), responses: { ...ok("Battle command result"), "409": { description: "Stale turn, reused command ID, ended battle, or insufficient MP" } } },
  },
  "/v1/quests/tree": {
    get: { summary: "List parent and child quests as a Quest Tree", parameters: [
      { name: "rootQuestId", in: "query", schema: { type: "string" } },
      { name: "includeArchived", in: "query", schema: { type: "boolean", default: false } },
      { name: "maxDepth", in: "query", schema: { type: "integer", minimum: 1, maximum: 8, default: 8 } },
    ], responses: ok("Quest Tree", { $ref: "#/components/schemas/QuestTree" }) },
  },
  "/v1/agent-handoffs": {
    get: { summary: "List agent-assigned Quest handoffs", parameters: [
      { name: "assigneeId", in: "query", schema: { type: "string", maxLength: 120 } },
      { name: "state", in: "query", schema: { type: "string", enum: ["none", "ready", "working", "blocked", "review_required", "accepted", "pending", "all"], default: "all" } },
      { name: "cursor", in: "query", schema: { type: "string" } },
      { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
    ], responses: ok("Agent handoffs", { $ref: "#/components/schemas/AgentHandoffPage" }) },
  },
  "/v1/quests/{questId}/handoff": {
    post: { summary: "Preview or transition an agent handoff", parameters: [parameter("questId")], requestBody: body({ $ref: "#/components/schemas/HandoffTransitionInput" }), responses: ok("Handoff transition", { $ref: "#/components/schemas/HandoffTransitionResult" }) },
  },
});

const scopes = openapi.components.securitySchemes.oauth2.flows.authorizationCode.scopes;
openapi.components.securitySchemes.oauth2.flows.authorizationCode.authorizationUrl = "https://your-questforge-worker.example.workers.dev/oauth/authorize";
openapi.components.securitySchemes.oauth2.flows.authorizationCode.tokenUrl = "https://your-questforge-worker.example.workers.dev/oauth/token";
Object.assign(scopes, {
  "profiles:read": "Read public profile data",
  "profiles:write": "Create and update the user's public profile",
  "friends:read": "Read friends and pending requests",
  "friends:write": "Send, respond to, and remove friend connections",
  "parties:read": "Read the active party and public members",
  "parties:write": "Create, invite, join, leave, and manage a party",
  "battle:read": "Read command battle state",
  "battle:write": "Preview and execute command battle turns",
});

const schemas = openapi.components.schemas;
schemas.Assignee = {
  type: "object",
  required: ["type", "id", "label", "handoffState"],
  properties: {
    type: { type: "string", enum: ["self", "human", "agent"] },
    id: { type: "string", minLength: 1, maxLength: 120 },
    label: { type: "string", minLength: 1, maxLength: 80 },
    handoffState: { type: "string", enum: ["none", "ready", "working", "blocked", "review_required", "accepted"] },
  },
};
schemas.Handoff = {
  type: "object",
  properties: {
    note: { type: "string", maxLength: 500 }, blockedReason: { type: "string", maxLength: 500 }, artifactUrl: { type: "string", format: "uri" },
    startedAt: { type: "string", format: "date-time" }, reviewRequestedAt: { type: "string", format: "date-time" }, reviewedAt: { type: "string", format: "date-time" }, reviewedBy: { type: "string", maxLength: 120 },
  },
};
schemas.HandoffTransitionInput = {
  type: "object", required: ["state"], properties: {
    state: { type: "string", enum: ["none", "ready", "working", "blocked", "review_required", "accepted"] }, expectedState: { type: "string", enum: ["none", "ready", "working", "blocked", "review_required", "accepted"] },
    note: { type: "string", maxLength: 500 }, blockedReason: { type: "string", maxLength: 500 }, artifactUrl: { type: "string", format: "uri" }, dryRun: { type: "boolean", default: true },
  },
};
schemas.HandoffTransitionResult = { type: "object", properties: { dryRun: { type: "boolean" }, quest: { $ref: "#/components/schemas/Quest" }, event: { type: "object" }, events: { type: "array", items: { type: "object" } } } };
schemas.AgentHandoffPage = { type: "object", properties: { handoffs: { type: "array", items: { $ref: "#/components/schemas/Quest" } }, total: { type: "integer" }, limit: { type: "integer" }, nextCursor: { type: ["string", "null"] } } };
schemas.QuestTree = { type: "object", properties: { roots: { type: "array", items: { type: "object" } }, nodes: { type: "array", items: { $ref: "#/components/schemas/Quest" } }, total: { type: "integer" }, summary: { type: "object", properties: { childrenTotal: { type: "integer" }, childrenCompleted: { type: "integer" }, progressPercent: { type: "integer" } } } } };
schemas.QuestInput.properties.assignee = { $ref: "#/components/schemas/Assignee" };
schemas.QuestInput.properties.parentQuestId = { type: "string", maxLength: 120 };
schemas.QuestInput.properties.handoff = { $ref: "#/components/schemas/Handoff" };
const questOutputProperties = { handoff: { $ref: "#/components/schemas/Handoff" }, childrenSummary: { type: "object" } };
if (Array.isArray(schemas.Quest.allOf)) {
  const outputPart = schemas.Quest.allOf.find((part) => part?.properties?.id && part?.properties?.createdAt) || schemas.Quest.allOf[schemas.Quest.allOf.length - 1];
  outputPart.properties = { ...(outputPart.properties || {}), ...questOutputProperties };
  delete schemas.Quest.properties;
} else {
  schemas.Quest.properties = { ...(schemas.Quest.properties || {}), ...questOutputProperties };
}
schemas.ProfileInput = {
  type: "object",
  required: ["displayName", "handle"],
  properties: {
    displayName: { type: "string", minLength: 1, maxLength: 40 },
    handle: { type: "string", pattern: "^@?[A-Za-z0-9_]{3,20}$" },
    bio: { type: "string", maxLength: 160 },
    avatarRole: { type: "string", maxLength: 40 },
    avatarVariant: { type: "string", maxLength: 40 },
    level: { type: "integer", minimum: 1 },
  },
};
schemas.PublicProfile = {
  type: "object",
  required: ["uid", "displayName", "handle", "bio", "avatarRole", "avatarVariant", "level"],
  properties: {
    uid: { type: "string" }, displayName: { type: "string" }, handle: { type: "string" }, bio: { type: "string" },
    avatarRole: { type: "string" }, avatarVariant: { type: "string" }, level: { type: "integer" },
  },
};
schemas.OwnProfile = { allOf: [{ $ref: "#/components/schemas/PublicProfile" }, { type: "object", properties: { handleChangedAt: { type: "string", format: "date-time" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } } }] };
schemas.FriendRequest = { type: "object", properties: { id: { type: "string" }, direction: { type: "string", enum: ["incoming", "outgoing"] }, senderUid: { type: "string" }, receiverUid: { type: "string" }, status: { type: "string" }, profile: { $ref: "#/components/schemas/PublicProfile" } } };
schemas.Party = { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, ownerUid: { type: "string" }, maxMembers: { type: "integer", maximum: 4 }, members: { type: "array", maxItems: 4, items: { allOf: [{ $ref: "#/components/schemas/PublicProfile" }, { type: "object", properties: { role: { type: "string", enum: ["owner", "member"] }, joinedAt: { type: "string", format: "date-time" } } }] } } } };
schemas.BattleCommandInput = { type: "object", required: ["command"], properties: { command: { type: "string", enum: ["attack", "skill", "guard", "heal", "burst"] }, expectedTurn: { type: "integer", minimum: 1 }, commandId: { type: "string", maxLength: 120 }, dryRun: { type: "boolean", default: true } } };
schemas.BattleSession = { type: "object", required: ["schemaVersion", "character", "boss", "battle", "quests", "commands"], properties: { schemaVersion: { type: "integer", const: 1 }, character: { type: "object" }, boss: { type: "object" }, battle: { type: "object" }, quests: { type: "array", items: { type: "object" } }, commands: { type: "array", items: { type: "object" } } } };

await writeFile(openApiPath, `${JSON.stringify(openapi, null, 2)}\n`);
await writeFile(join(apiDirectory, "mcp-tools.json"), `${JSON.stringify({ serverName: "questforge-mcp", version: "2.4.0", tools: MCP_TOOLS }, null, 2)}\n`);

console.log(`Updated OpenAPI and ${MCP_TOOLS.length} MCP tools.`);

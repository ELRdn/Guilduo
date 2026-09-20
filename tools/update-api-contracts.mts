import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MCP_TOOLS } from "../worker/src/index.ts";

interface OpenApiSchema {
  type?: string | string[];
  properties?: Record<string, OpenApiSchema>;
  allOf?: OpenApiSchema[];
  [key: string]: unknown;
}

interface OpenApiOperation extends OpenApiSchema {
  parameters?: OpenApiSchema[];
}

interface OpenApiPath extends OpenApiSchema {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  patch?: OpenApiOperation;
  put?: OpenApiOperation;
  delete?: OpenApiOperation;
}

interface OpenApiDocument extends OpenApiSchema {
  paths: Record<string, OpenApiPath>;
  components: { securitySchemes: OpenApiSchema; schemas: Record<string, OpenApiSchema> };
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const apiDirectory = join(root, "api");
const openApiPath = join(apiDirectory, "openapi.json");
const openapi = JSON.parse(await readFile(openApiPath, "utf8")) as OpenApiDocument;
const legacyComponents = (openapi.paths as OpenApiSchema).components as OpenApiDocument["components"] | undefined;
openapi.components ||= legacyComponents || { securitySchemes: {}, schemas: {} };
const pathContainer = openapi.paths as unknown as Record<string, unknown>;
if (pathContainer.components) delete pathContainer.components;

const jsonContent = (schema: OpenApiSchema): OpenApiSchema => ({ content: { "application/json": { schema } } });
const ok = (description: string, schema: OpenApiSchema = { type: "object" }): OpenApiSchema => ({ "200": { description, ...jsonContent(schema) } });
const body = (schema: OpenApiSchema): OpenApiSchema => ({ required: true, ...jsonContent(schema) });
const parameter = (name: string): OpenApiSchema => ({ name, in: "path", required: true, schema: { type: "string" } });

openapi.paths["/v1/workspace/bootstrap"] = {
  get: {
    operationId: "getWorkspaceBootstrap",
    summary: "Load the signed-in Web workspace with one authenticated request",
    description: "Web bearer authentication only; OAuth Agent clients use the existing scoped resources. Returns the same all-view Quest page (limit 200), own profile, and public Agent records including archived Agents. Optional profile/Agent failures are explicit panelErrors. Responses are never cached.",
    responses: {
      ...ok("Initial workspace data", { type: "object", required: ["quests", "total", "profile", "agents", "panelErrors"], properties: {
        quests: { type: "array", items: { $ref: "#/components/schemas/Quest" }, maxItems: 200 },
        total: { type: "integer", minimum: 0 }, profile: { type: ["object", "null"] },
        agents: { type: "array", items: { type: "object" } },
        panelErrors: { type: "array", items: { type: "object", required: ["index", "message"], properties: {
          index: { type: "integer", enum: [3, 5] }, message: { type: "string" },
        } } },
      } }),
      "401": { description: "Authentication required" }, "403": { description: "Web access or required scope denied" },
      "409": { description: "Workspace is not synchronized" },
    },
  },
};

const questListPath = openapi.paths["/v1/quests"];
if (questListPath?.get) {
  questListPath.get.parameters ||= [];
  const existingParameters = new Set(questListPath.get.parameters.map((item: OpenApiSchema) => String(item.name || "")));
  for (const item of [
    { name: "parentQuestId", in: "query", schema: { type: "string", maxLength: 120 } },
    { name: "rootOnly", in: "query", schema: { type: "boolean", default: false } },
  ]) {
    if (!existingParameters.has(item.name)) questListPath.get.parameters.push(item);
  }
}

openapi.info = {
  title: "Guilduo API",
  version: "2.7.0",
  description: "Guilduo REST API for quests, Quest Trees, agent handoffs, work-management reviews, profiles, friends, parties, command battles, Toggl Focus, integrations, plugins, and signed webhooks.",
};
openapi.servers = [
  { url: "https://mcp.guilduo.com", description: "Guilduo Worker REST / MCP gateway" },
  { url: "http://127.0.0.1:8787", description: "Local Wrangler" },
];

Object.assign(openapi.paths, {
  "/v1/human-requests": {
    get: { summary: "List human confirmation Quests", parameters: [{ name: "status", in: "query", schema: { type: "string", enum: ["pending", "deferred", "answered", "all"], default: "pending" } }, { name: "sourceQuestId", in: "query", schema: { type: "string" } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }, { name: "cursor", in: "query", schema: { type: "string" } }], responses: ok("Human request page", { $ref: "#/components/schemas/HumanRequestPage" }) },
  },
  "/v1/quests/{questId}/review-requests": {
    post: { summary: "Preview or request a human confirmation of Agent work", description: "The assigned registered Agent or authenticated web user may create an independent confirmation Quest. Reusing the same requestKey and content returns the existing Quest; changed content conflicts. No external artifact is fetched or embedded.", parameters: [parameter("questId")], requestBody: body({ $ref: "#/components/schemas/HumanReviewInput" }), responses: { ...ok("Human confirmation request", { $ref: "#/components/schemas/HumanReviewResult" }), "403": { description: "Agent missing or not the assignee" }, "409": { description: "Stale Quest, conflicting requestKey, or an unanswered request already exists" } } },
  },
  "/v1/quests/{questId}/review-response": {
    post: { summary: "Read, defer, resume, or answer a human confirmation", description: "Authenticated web user only; OAuth/MCP Agents cannot answer. An explicit confirmed checkbox is required for approve/revise, and revise requires text feedback. Answering completes only this confirmation Quest, once. Original work and Handoff remain unchanged.", parameters: [parameter("questId")], requestBody: body({ $ref: "#/components/schemas/HumanReviewResponse" }), responses: { ...ok("Human response", { $ref: "#/components/schemas/HumanReviewResult" }), "403": { description: "Only the intended authenticated human may respond" }, "409": { description: "Stale or already answered request" } } },
  },
  "/v1/agents": {
    get: { summary: "List the signed-in user's private Agent Registry", parameters: [{ name: "includeArchived", in: "query", schema: { type: "boolean", default: false } }], responses: ok("Agent list", { type: "object", properties: { agents: { type: "array", items: { $ref: "#/components/schemas/RegisteredAgent" } } } }) },
    post: { summary: "Register an Agent from the Appwrite-authenticated web app", requestBody: body({ $ref: "#/components/schemas/RegisteredAgentInput" }), responses: { "201": { description: "Agent registered" } } },
  },
  "/v1/agents/{agentId}": {
    get: { summary: "Get one registered Agent", parameters: [parameter("agentId")], responses: ok("Registered Agent", { type: "object", properties: { agent: { $ref: "#/components/schemas/RegisteredAgent" } } }) },
    patch: { summary: "Update, disable, or archive an Agent from the Appwrite-authenticated web app", parameters: [parameter("agentId")], requestBody: body({ $ref: "#/components/schemas/RegisteredAgentPatch" }), responses: ok("Updated Agent") },
  },
  "/v1/agents/{agentId}/avatar": {
    put: { summary: "Upload one Agent's avatar image from the Appwrite-authenticated web app", description: "Body is the raw image (PNG/JPEG/WebP, max 300 KB); the server independently validates format and size regardless of Content-Type, streaming the body and rejecting mid-transfer once the cap is exceeded. Bumps avatarVersion and, optionally, checks X-Expected-Updated-At against the Agent's current updatedAt, returning 409 agent_conflict on a mismatch.", parameters: [parameter("agentId")], requestBody: { required: true, content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } }, responses: { ...ok("Avatar stored", { type: "object", properties: { agent: { $ref: "#/components/schemas/RegisteredAgent" }, avatarVersion: { type: "integer" } } }), "409": { description: "Agent changed since it was last read (agent_conflict)" }, "413": { description: "Image exceeds 300 KB (avatar_too_large)" }, "415": { description: "Body is not a real PNG/JPEG/WebP image (avatar_format_invalid)" }, "503": { description: "Avatar storage is not configured; nothing was saved (avatar_storage_unavailable)" } } },
    get: { summary: "Fetch one Agent's avatar image", description: "Bearer-authenticated like every other Agent route. Clients fetch this with `fetch()` and an Authorization header and convert the response into a Blob URL, since a plain <img src> cannot carry the header. Supports conditional GET via If-None-Match / ETag. `v` is required and must be a positive integer matching the Agent's current avatarVersion exactly — only that exact match gets the year-long `immutable` Cache-Control; anything else (missing, zero, negative, decimal, or a non-matching version) never does.", parameters: [parameter("agentId"), { name: "v", in: "query", required: true, schema: { type: "integer", minimum: 1 }, description: "The exact current avatarVersion. Required; a missing or malformed value is 400, a non-matching one is 404 — neither is ever served with an immutable cache header." }], responses: { "200": { description: "Image bytes, with a one-year immutable Cache-Control" }, "304": { description: "Not modified" }, "400": { description: "v is missing or not a positive integer (avatar_version_required)" }, "401": { description: "Missing or invalid Bearer token" }, "404": { description: "No avatar stored for this Agent, foreign agentId, or v does not match the current version (avatar_version_stale)" } } },
  },
  "/v1/agent-connections": {
    get: { summary: "List OAuth MCP clients and Agent links for the signed-in web user", responses: ok("Agent connections") },
  },
  "/v1/agent-connections/{clientId}": {
    delete: { summary: "Revoke one OAuth MCP client grant for the signed-in web user", description: "Revokes the OAuth grant and its refresh session without deleting the linked Agent. A later OAuth authorization creates a new grant.", parameters: [parameter("clientId")], responses: ok("OAuth connection revoked") },
  },
  "/v1/agents/{agentId}/connections/{clientId}": {
    put: { summary: "Link an OAuth MCP client to one Agent", parameters: [parameter("agentId"), parameter("clientId")], responses: ok("Linked connection") },
    delete: { summary: "Unlink an OAuth MCP client from an Agent without revoking its OAuth grant", parameters: [parameter("agentId"), parameter("clientId")], responses: ok("Unlinked connection") },
  },
  "/v1/profile": {
    get: { summary: "Get the authenticated user's profile", responses: ok("Own profile", { type: "object", properties: { profile: { anyOf: [{ $ref: "#/components/schemas/OwnProfile" }, { type: "null" }] } } }) },
    patch: { summary: "Create or update the authenticated user's profile", requestBody: body({ $ref: "#/components/schemas/ProfileInput" }), responses: ok("Updated profile", { type: "object", properties: { profile: { $ref: "#/components/schemas/OwnProfile" } } }) },
  },
  "/v1/profile/avatar": {
    put: { summary: "Upload the authenticated user's private profile avatar", description: "Body is the raw image (PNG/JPEG/WebP, max 300 KB). The server validates the real image signature and size, stores the bytes in private R2 storage, and advances avatarVersion. This route is for the authenticated Guilduo web app.", requestBody: { required: true, content: {
      "image/png": { schema: { type: "string", format: "binary" } },
      "image/jpeg": { schema: { type: "string", format: "binary" } },
      "image/webp": { schema: { type: "string", format: "binary" } },
      "application/octet-stream": { schema: { type: "string", format: "binary" } },
    } }, responses: { ...ok("Profile avatar stored", { type: "object", properties: { profile: { $ref: "#/components/schemas/OwnProfile" }, avatarVersion: { type: "integer" } } }), "401": { description: "Missing or invalid Bearer token" }, "413": { description: "Image exceeds 300 KB (avatar_too_large)" }, "415": { description: "Body is not a real PNG/JPEG/WebP image (avatar_format_invalid)" }, "503": { description: "Avatar storage is not configured; nothing was saved (avatar_storage_unavailable)" } } },
    get: { summary: "Fetch the authenticated user's private profile avatar", description: "Bearer-authenticated image response. Clients fetch with Authorization and convert the response into a Blob URL. The required v query must exactly match the current avatarVersion; stale or missing versions are not served.", parameters: [{ name: "v", in: "query", required: true, schema: { type: "integer", minimum: 1 } }], responses: { "200": { description: "Private image bytes with a version-safe immutable cache header" }, "304": { description: "Not modified" }, "400": { description: "v is missing or malformed (avatar_version_required)" }, "401": { description: "Missing or invalid Bearer token" }, "404": { description: "No avatar exists or v is stale (avatar_not_found / avatar_version_stale)" } } },
    delete: { summary: "Remove the authenticated user's profile avatar", description: "Removes the current profile avatar, advances avatarVersion to invalidate stale image links, and returns the updated profile.", responses: ok("Profile avatar removed", { type: "object", properties: { profile: { $ref: "#/components/schemas/OwnProfile" }, avatarVersion: { type: "integer" } } }) },
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
  "/v1/quests/batch-score": {
    post: { summary: "Preview or atomically score up to 100 quests", description: "Completing a one-off todo also archives it. dryRun defaults to true.", requestBody: body({ $ref: "#/components/schemas/BatchScoreInput" }), responses: ok("Batch score result", { $ref: "#/components/schemas/BatchScoreResult" }) },
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
  "/v1/quests/{questId}/toggl-focus-task": {
    post: { summary: "Preview or create/update a Toggl Focus task for one Quest", parameters: [parameter("questId")], requestBody: body({ type: "object", properties: { dryRun: { type: "boolean", default: true } } }), responses: ok("Focus task sync") },
  },
  "/v1/integrations/toggl-focus/connect": {
    post: { summary: "Connect Toggl Focus from the Guilduo web app", description: "Web/Appwrite-authenticated endpoint only. The personal API key is encrypted in D1 and never returned by REST or MCP.", requestBody: body({ $ref: "#/components/schemas/TogglFocusConnectInput" }), responses: ok("Focus connection") },
  },
  "/v1/integrations/toggl-focus/resources": {
    get: { summary: "List configured Toggl Focus projects and tags", responses: ok("Focus resources") },
  },
  "/v1/integrations/toggl-focus": {
    patch: { summary: "Save Toggl Focus organization, workspace, project, and auto-create settings", requestBody: body({ $ref: "#/components/schemas/TogglFocusConfiguration" }), responses: ok("Focus configuration") },
  },
  "/v1/integrations/toggl-focus/disconnect": {
    post: { summary: "Disconnect Toggl Focus and remove the encrypted personal API key from Guilduo", responses: ok("Focus disconnection") },
  },
  "/v1/integrations/toggl-focus/tracking": {
    get: { summary: "Read the current Toggl Focus timer", responses: ok("Focus current tracking") },
  },
  "/v1/integrations/toggl-focus/tracking/start": {
    post: { summary: "Preview or start a Focus timer for a Quest", requestBody: body({ $ref: "#/components/schemas/TogglFocusStartInput" }), responses: ok("Focus timer result") },
  },
  "/v1/integrations/toggl-focus/tracking/stop": {
    post: { summary: "Preview or stop the exact current Focus timer", requestBody: body({ $ref: "#/components/schemas/TogglFocusStopInput" }), responses: ok("Focus timer result") },
  },
  "/v1/integrations/toggl-focus/time-entries": {
    get: { summary: "List up to 30 days of Toggl Focus time entries", parameters: [
      { name: "dateFrom", in: "query", schema: { type: "string", format: "date" } }, { name: "dateTo", in: "query", schema: { type: "string", format: "date" } },
      { name: "days", in: "query", schema: { type: "integer", minimum: 1, maximum: 30, default: 30 } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 100 } },
    ], responses: ok("Focus time entries") },
  },
  "/v1/integrations/toggl-focus/attributions": {
    post: { summary: "Preview or confirm one-to-one Focus entry attribution", requestBody: body({ $ref: "#/components/schemas/TogglFocusAttributionInput" }), responses: ok("Focus attribution") },
  },
  "/v1/integrations/toggl-focus/purge": {
    post: { summary: "Preview or remove all Guilduo-side Toggl Focus links", requestBody: body({ type: "object", properties: { dryRun: { type: "boolean", default: true } } }), responses: ok("Focus link purge") },
  },
});

openapi.paths["/v1/quests/{questId}"] ||= {};
openapi.paths["/v1/quests/{questId}"].get = { summary: "Read one Quest with requester and human confirmation metadata", parameters: [parameter("questId")], responses: ok("Quest", { type: "object", properties: { quest: { $ref: "#/components/schemas/Quest" } } }) };

const oauth2 = openapi.components.securitySchemes.oauth2 as OpenApiSchema;
const bearerAuth = openapi.components.securitySchemes.bearerAuth as OpenApiSchema;
bearerAuth.bearerFormat = "Appwrite JWT";
const flows = oauth2.flows as OpenApiSchema;
const authorizationCode = flows.authorizationCode as OpenApiSchema;
const scopes = authorizationCode.scopes as Record<string, string>;
authorizationCode.authorizationUrl = "https://mcp.guilduo.com/oauth/authorize";
authorizationCode.tokenUrl = "https://mcp.guilduo.com/oauth/token";
Object.assign(scopes, {
  "agents:read": "Read registered Agent profiles and the current Agent context",
  "agents:write": "Link and unlink the current OAuth MCP connection to a registered Agent",
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
schemas.RegisteredAgentInput = { type: "object", required: ["agentId", "displayName"], properties: { agentId: { type: "string", pattern: "^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$" }, displayName: { type: "string", minLength: 1, maxLength: 40 }, provider: { type: "string", maxLength: 40 }, role: { type: "string", maxLength: 60 }, instructions: { type: "string", maxLength: 4000 }, allowedScopes: { type: "array", items: { type: "string" } }, defaultHandoffState: { type: "string", enum: ["none", "ready", "working", "blocked", "review_required", "accepted"] }, reviewRequired: { type: "boolean" }, dryRunDefault: { type: "boolean" } }, additionalProperties: false };
schemas.RegisteredAgentPatch = { type: "object", properties: { displayName: { type: "string", minLength: 1, maxLength: 40 }, provider: { type: "string", maxLength: 40 }, role: { type: "string", maxLength: 60 }, instructions: { type: "string", maxLength: 4000 }, status: { type: "string", enum: ["active", "disabled", "archived"] }, allowedScopes: { type: "array", items: { type: "string" } }, defaultHandoffState: { type: "string", enum: ["none", "ready", "working", "blocked", "review_required", "accepted"] }, reviewRequired: { type: "boolean" }, dryRunDefault: { type: "boolean" }, expectedUpdatedAt: { type: "string", format: "date-time" } }, additionalProperties: false };
schemas.RegisteredAgent = { allOf: [{ $ref: "#/components/schemas/RegisteredAgentInput" }, { type: "object", required: ["status", "createdAt", "updatedAt"], properties: { uid: { type: "string" }, status: { type: "string", enum: ["active", "disabled", "archived"] }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" }, avatarVersion: { type: "integer", minimum: 0, description: "Bumped on every avatar upload. The image itself is never embedded here or in the list response." }, hasCustomAvatar: { type: "boolean", description: "Derived from whether an avatar asset is currently active. Fetch the image with GET .../agents/{agentId}/avatar?v={avatarVersion} using a Bearer header." } } }] };
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
schemas.QuestInput.properties ||= {};
schemas.QuestInput.properties.assignee = { $ref: "#/components/schemas/Assignee" };
schemas.QuestInput.properties.parentQuestId = { type: "string", maxLength: 120 };
schemas.QuestInput.properties.handoff = { $ref: "#/components/schemas/Handoff" };
schemas.QuestRequester = { type: ["object", "null"], readOnly: true, required: ["type", "id", "label"], properties: { type: { type: "string", enum: ["human", "agent"] }, id: { type: "string" }, label: { type: "string" } }, additionalProperties: false, description: "Trusted creator identity. null means the legacy or unlinked creator is unknown." };
schemas.HumanRequest = { type: ["object", "null"], readOnly: true, required: ["sourceQuestId", "requestKey", "recipientId", "reason", "checkTarget", "artifactUrl", "status", "seenAt", "respondedAt", "response", "outcome"], properties: { sourceQuestId: { type: "string" }, requestKey: { type: "string" }, recipientId: { type: "string" }, reason: { type: "string" }, checkTarget: { type: "string" }, artifactUrl: { type: "string" }, status: { type: "string", enum: ["pending", "deferred", "answered"] }, seenAt: { type: "string" }, respondedAt: { type: "string" }, response: { type: "string" }, outcome: { type: "string", enum: ["", "approved", "changes_requested"] } }, additionalProperties: false };
schemas.HumanReviewInput = { ...(MCP_TOOLS.find((tool) => tool.name === "request_human_review")!.inputSchema as OpenApiSchema), required: ["requestKey", "title", "reason", "checkTarget", "completionCriteria"] };
schemas.HumanReviewResponse = { type: "object", required: ["action"], properties: { action: { type: "string", enum: ["seen", "defer", "resume", "approve", "revise"] }, expectedUpdatedAt: { type: "string", description: "Required for execution; use the latest Quest timestamp." }, response: { type: "string", maxLength: 2000 }, confirmed: { type: "boolean", default: false }, dryRun: { type: "boolean", default: true } }, additionalProperties: false };
schemas.HumanReviewResult = { type: "object", required: ["dryRun", "reused", "quest", "events"], properties: { dryRun: { type: "boolean" }, reused: { type: "boolean" }, quest: { $ref: "#/components/schemas/Quest" }, events: { type: "array", items: { type: "object" } } }, additionalProperties: false };
schemas.HumanRequestPage = { type: "object", required: ["quests", "total", "limit", "nextCursor"], properties: { quests: { type: "array", items: { $ref: "#/components/schemas/Quest" } }, total: { type: "integer" }, limit: { type: "integer" }, nextCursor: { type: ["string", "null"] } }, additionalProperties: false };
const questOutputProperties = { handoff: { $ref: "#/components/schemas/Handoff" }, childrenSummary: { type: "object" }, requester: { $ref: "#/components/schemas/QuestRequester" }, humanRequest: { $ref: "#/components/schemas/HumanRequest" } };
if (Array.isArray(schemas.Quest.allOf)) {
  const outputPart = schemas.Quest.allOf.find((part: OpenApiSchema) => part.properties?.id && part.properties?.createdAt) || schemas.Quest.allOf[schemas.Quest.allOf.length - 1];
  outputPart.properties = { ...(outputPart.properties || {}), ...questOutputProperties };
  delete schemas.Quest.properties;
} else {
  schemas.Quest.properties = { ...(schemas.Quest.properties || {}), ...questOutputProperties };
}
schemas.ProfileInput = {
  type: "object",
  required: ["displayName", "handle"],
  properties: {
    displayName: { type: "string", minLength: 1, maxLength: 60 },
    handle: { type: "string", pattern: "^@?[A-Za-z0-9_]{3,20}$" },
    bio: { type: "string", maxLength: 160 },
    avatarRole: { type: "string", maxLength: 40 },
    avatarVariant: { type: "string", maxLength: 40 },
    level: { type: "integer", minimum: 1 },
  },
};
schemas.PublicProfile = {
  type: "object",
  required: ["uid", "displayName", "handle", "bio", "avatarRole", "avatarVariant", "avatarUrl", "hasCustomAvatar", "avatarVersion", "level"],
  properties: {
    uid: { type: "string" }, displayName: { type: "string" }, handle: { type: "string" }, bio: { type: "string" },
    avatarRole: { type: "string" }, avatarVariant: { type: "string" }, avatarUrl: { type: "string", maxLength: 0, description: "Compatibility field; always empty because image bytes are private." },
    hasCustomAvatar: { type: "boolean" }, avatarVersion: { type: "integer", minimum: 0 }, level: { type: "integer" },
  },
};
schemas.OwnProfile = { allOf: [{ $ref: "#/components/schemas/PublicProfile" }, { type: "object", properties: { handleChangedAt: { type: "string", format: "date-time" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } } }] };
schemas.FriendRequest = { type: "object", properties: { id: { type: "string" }, direction: { type: "string", enum: ["incoming", "outgoing"] }, senderUid: { type: "string" }, receiverUid: { type: "string" }, status: { type: "string" }, profile: { $ref: "#/components/schemas/PublicProfile" } } };
schemas.Party = { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, ownerUid: { type: "string" }, maxMembers: { type: "integer", maximum: 4 }, members: { type: "array", maxItems: 4, items: { allOf: [{ $ref: "#/components/schemas/PublicProfile" }, { type: "object", properties: { role: { type: "string", enum: ["owner", "member"] }, joinedAt: { type: "string", format: "date-time" } } }] } } } };
schemas.BattleCommandInput = { type: "object", required: ["command"], properties: { command: { type: "string", enum: ["attack", "skill", "guard", "heal", "burst"] }, expectedTurn: { type: "integer", minimum: 1 }, commandId: { type: "string", maxLength: 120 }, dryRun: { type: "boolean", default: true } } };
schemas.BattleSession = { type: "object", required: ["schemaVersion", "character", "boss", "battle", "quests", "commands"], properties: { schemaVersion: { type: "integer", const: 1 }, character: { type: "object" }, boss: { type: "object" }, battle: { type: "object" }, quests: { type: "array", items: { type: "object" } }, commands: { type: "array", items: { type: "object" } } } };
schemas.BatchScoreInput = { type: "object", required: ["questIds", "direction"], properties: { questIds: { type: "array", minItems: 1, maxItems: 100, items: { type: "string" } }, direction: { type: "string", enum: ["up", "down"] }, dryRun: { type: "boolean", default: true } }, additionalProperties: false };
schemas.BatchScoreResult = { type: "object", properties: { dryRun: { type: "boolean" }, count: { type: "integer" }, quests: { type: "array", items: { $ref: "#/components/schemas/Quest" } }, rewards: { type: "array", items: { type: "object" } }, character: { type: "object" }, battle: { type: "object" }, events: { type: "array", items: { type: "object" } } }, additionalProperties: false };
schemas.TogglFocusConnectInput = { type: "object", required: ["apiKey"], properties: { apiKey: { type: "string", pattern: "^toggl_sk_" }, organizationId: { type: "string", pattern: "^\\d+$" }, workspaceId: { type: "string", pattern: "^\\d+$" }, projectId: { type: "string", pattern: "^\\d+$" }, autoCreateTasks: { type: "boolean", default: false } } };
schemas.TogglFocusConfiguration = { type: "object", properties: { organizationId: { type: "string", pattern: "^\\d+$" }, workspaceId: { type: "string", pattern: "^\\d+$" }, projectId: { type: "string", pattern: "^\\d+$" }, autoCreateTasks: { type: "boolean", default: false } } };
schemas.TogglFocusStartInput = { type: "object", required: ["questId"], properties: { questId: { type: "string" }, expectedCurrentEntryId: { type: "string" }, dryRun: { type: "boolean", default: true } } };
schemas.TogglFocusStopInput = { type: "object", properties: { expectedEntryId: { type: "string" }, end: { type: "string", format: "date-time" }, dryRun: { type: "boolean", default: true } } };
schemas.TogglFocusAttributionInput = { type: "object", properties: { questId: { type: "string" }, entryIds: { type: "array", items: { type: "string" }, maxItems: 100 }, dateFrom: { type: "string", format: "date" }, dateTo: { type: "string", format: "date" }, days: { type: "integer", minimum: 1, maximum: 30, default: 30 }, dryRun: { type: "boolean", default: true } } };

await writeFile(openApiPath, `${JSON.stringify(openapi, null, 2)}\n`);
await writeFile(join(apiDirectory, "mcp-tools.json"), `${JSON.stringify({ serverName: "questforge-mcp", version: "2.7.0", tools: MCP_TOOLS }, null, 2)}\n`);

console.log(`Updated OpenAPI and ${MCP_TOOLS.length} MCP tools.`);

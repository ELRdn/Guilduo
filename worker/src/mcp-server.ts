import { McpServer, ResourceTemplate, fromJsonSchema } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { callMcpTool, MCP_TOOLS } from "./index.ts";
import type { AuthIdentity } from "./security.ts";
import type { WorkerEnv } from "./worker-types.ts";
import type { AuthInfo, CallToolResult, JsonSchemaType, McpRequestContext, StandardSchemaWithJSON } from "@modelcontextprotocol/server";

const SERVER_INFO = { name: "questforge-mcp-next", version: "2.7.0" };
const ROUTE = "/mcp-next";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT_LENGTH = 8000;

const dateString = z.string().regex(DATE_PATTERN, "Use YYYY-MM-DD.");

const GENERIC_OUTPUT_SCHEMA = z.object({}).catchall(z.unknown());

type McpContext = unknown;
type McpToolArguments = Record<string, unknown>;
type McpJsonSchema = StandardSchemaWithJSON<Record<string, unknown>, Record<string, unknown>>;
type McpFactoryContext = {
  authInfo?: AuthInfo & {
    env?: WorkerEnv;
    context?: McpContext;
    identity?: AuthIdentity;
  };
};

function hostRules(env: WorkerEnv): { allowedHostnames: string[]; allowedOriginHostnames: string[] } {
  const hosts = new Set(["localhost", "127.0.0.1", "[::1]", "worker.test"]);
  const origins = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const configured = String(env?.PUBLIC_BASE_URL || "").trim();
  if (configured) {
    try {
      const hostname = new URL(configured).hostname;
      if (hostname) { hosts.add(hostname); origins.add(hostname); }
    } catch { /* ignore malformed configuration */ }
  }
  return { allowedHostnames: [...hosts], allowedOriginHostnames: [...origins] };
}

function conciseText(value: unknown): string {
  if (value === undefined) return "OK";
  const text = JSON.stringify(value, null, 2);
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return `${text.slice(0, MAX_TEXT_LENGTH)}\n… (truncated; full data is in structuredContent)`;
}

function safeToolError(error: unknown): string {
  const item = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = typeof item.message === "string" && item.message.trim() ? item.message.trim() : "QuestForge tool failed.";
  return message.slice(0, 500);
}

async function runTool(name: string, args: McpToolArguments, env: WorkerEnv, context: McpContext, identity: AuthIdentity): Promise<CallToolResult> {
  try {
    const value = await callMcpTool(name, args || {}, env, context, identity);
    return { content: [{ type: "text", text: conciseText(value) }], structuredContent: value, isError: false };
  } catch (error: unknown) {
    const message = safeToolError(error);
    const item = error && typeof error === "object" ? error as Record<string, unknown> : {};
    return {
      content: [{ type: "text", text: message }],
      structuredContent: { error: { code: item.code || "tool_error", message } },
      isError: true,
    };
  }
}

function registerToolHandlers(server: McpServer, env: WorkerEnv, context: McpContext, identity: AuthIdentity): void {
  for (const tool of MCP_TOOLS) {
    const inputSchema = fromJsonSchema<Record<string, unknown>>(tool.inputSchema as JsonSchemaType) as McpJsonSchema;
    const outputSchema = (tool.outputSchema ? fromJsonSchema<Record<string, unknown>>(tool.outputSchema as JsonSchemaType) : GENERIC_OUTPUT_SCHEMA) as McpJsonSchema;
    server.registerTool<McpJsonSchema, McpJsonSchema>(tool.name, {
      title: tool.title,
      description: tool.description,
      inputSchema,
      outputSchema,
      annotations: tool.annotations,
    }, (args: McpToolArguments) => runTool(tool.name, args, env, context, identity));
  }
}

function resourceJson(uri: URL, value?: unknown, error?: unknown): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
  const errorRecord = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const text = error
    ? JSON.stringify({ error: { code: errorRecord.code || "resource_error", message: errorRecord.message || "QuestForge resource unavailable." } }, null, 2)
    : JSON.stringify(value, null, 2);
  return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
}

function registerResources(server: McpServer, env: WorkerEnv, context: McpContext, identity: AuthIdentity): void {
  const readSafe = async (uri: URL, loader: () => Promise<unknown>) => {
    try { return resourceJson(uri, await loader()); } catch (error: unknown) { return resourceJson(uri, undefined, error); }
  };

  server.registerResource(
    "questforge-today",
    "questforge://quests/today",
    { title: "Today's Quests", mimeType: "application/json", description: "QuestForge quests visible today, including overdue work." },
    (uri) => readSafe(uri, () => callMcpTool("list_today_quests", {}, env, context, identity)),
  );
  server.registerResource(
    "questforge-backlog",
    "questforge://quests/backlog",
    { title: "Backlog Quests", mimeType: "application/json", description: "QuestForge quests in the backlog view." },
    (uri) => readSafe(uri, () => callMcpTool("list_quests", { view: "backlog" }, env, context, identity)),
  );
  server.registerResource(
    "questforge-tree",
    "questforge://quests/tree",
    { title: "Quest Tree", mimeType: "application/json", description: "QuestForge parent quests, child quests, and progress summaries." },
    (uri) => readSafe(uri, () => callMcpTool("get_quest_tree", {}, env, context, identity)),
  );
  server.registerResource(
    "questforge-quest-by-id",
    new ResourceTemplate("questforge://quest/{questId}", {
      list: async () => {
        try {
          const page = await callMcpTool("list_quests", { view: "all", limit: 200 }, env, context, identity);
          const quests = Array.isArray(page?.quests) ? page.quests as Array<{ id?: unknown; title?: unknown }> : [];
          return { resources: quests.map((quest) => ({ uri: `questforge://quest/${encodeURIComponent(String(quest.id || ""))}`, name: String(quest.title || quest.id || "Quest") })) };
        } catch { return { resources: [] }; }
      },
    }),
    { title: "One Quest by ID", mimeType: "application/json", description: "One QuestForge quest, addressed by questId." },
    (uri, variables) => readSafe(uri, () => callMcpTool("get_quest", { questId: variables.questId }, env, context, identity)),
  );
  server.registerResource(
    "questforge-character",
    "questforge://character",
    { title: "Character State", mimeType: "application/json", description: "Current QuestForge character, MP, equipment, and boss state." },
    (uri) => readSafe(uri, () => callMcpTool("get_character_state", {}, env, context, identity)),
  );
  server.registerResource(
    "questforge-activity",
    "questforge://activity",
    { title: "Activity Events", mimeType: "application/json", description: "Recent QuestForge quest activity events." },
    (uri) => readSafe(uri, () => callMcpTool("list_activity_events", { limit: 100 }, env, context, identity)),
  );
  server.registerResource(
    "questforge-agent-handoffs",
    "questforge://agent-handoffs",
    { title: "Agent Handoffs", mimeType: "application/json", description: "Agent-assigned quests and their current handoff state." },
    (uri) => readSafe(uri, () => callMcpTool("list_agent_handoffs", { state: "all" }, env, context, identity)),
  );
  server.registerResource(
    "questforge-registered-agents",
    "questforge://agents/registered",
    { title: "Registered Agents", mimeType: "application/json", description: "Private Agent Registry profiles available to the current QuestForge user." },
    (uri) => readSafe(uri, () => callMcpTool("list_registered_agents", {}, env, context, identity)),
  );
  server.registerResource(
    "questforge-current-agent-context",
    "questforge://agents/current",
    { title: "Current Agent Context", mimeType: "application/json", description: "The Agent Registry profile linked to this OAuth MCP client and its effective scopes." },
    (uri) => readSafe(uri, () => callMcpTool("get_current_agent_context", {}, env, context, identity)),
  );
  server.registerResource(
    "questforge-toggl-focus-status",
    "questforge://toggl-focus/status",
    { title: "Toggl Focus Status", mimeType: "application/json", description: "Toggl Focus connection configuration and current timer without the personal API key." },
    (uri) => readSafe(uri, () => callMcpTool("get_toggl_focus_status", {}, env, context, identity)),
  );
  server.registerResource(
    "questforge-toggl-focus-insights",
    "questforge://toggl-focus/estimate-insights",
    { title: "Toggl Focus Estimate Insights", mimeType: "application/json", description: "Suggestion-only estimates from completed Toggl Focus-linked Quests." },
    (uri) => readSafe(uri, () => callMcpTool("get_toggl_estimate_insights", {}, env, context, identity)),
  );
}

function promptMessages(text: string): { messages: Array<{ role: "user"; content: { type: "text"; text: string } }> } {
  return { messages: [{ role: "user", content: { type: "text", text } }] };
}

// Prompt argument schemas accept a missing `arguments` field (the protocol
// allows it) by wrapping the strict object in `.optional()`.
const OPTIONAL_ARGUMENT = <T extends z.ZodTypeAny>(schema: T): z.ZodOptional<T> => schema.optional();

function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "plan_today",
    { title: "Plan Today", description: "Plan today's QuestForge work from the daily brief.", argsSchema: OPTIONAL_ARGUMENT(z.strictObject({ date: dateString.optional() })) },
    (rawArgs) => {
      const { date } = rawArgs || {};
      return promptMessages([
        "Help me plan today's QuestForge work.",
        "",
        "Read first:",
        `1. Call get_daily_brief (date: ${date || "today"}) to load today's quests, character state, and the Calendar schedule.`,
        "2. Call list_activity_events for recent context when helpful.",
        "",
        "Then propose a short plan:",
        "- Identify overdue work and the highest-impact quests first.",
        "- Suggest a realistic order using quest titles, scheduled times, and due dates.",
        "- Keep the plan concise and actionable.",
        "",
        "Only change data after I confirm:",
        "- Ask before calling create_quest, update_quest, score_quest, batch_score_quests, batch_update_quests, or convert_calendar_event_to_quest.",
        "- Prefer dryRun wherever a tool supports it.",
        "- Never archive quests, remove friends or party members, or spend Gems without explicit confirmation.",
      ].join("\n"));
    },
  );
  server.registerPrompt(
    "review_day",
    { title: "Review Day", description: "Review a single day of QuestForge activity.", argsSchema: OPTIONAL_ARGUMENT(z.strictObject({ anchorDate: dateString.optional() })) },
    (rawArgs) => {
      const { anchorDate } = rawArgs || {};
      return promptMessages([
        "Help me review one day of QuestForge activity.",
        "",
        "Read first (read-only):",
        `1. Call get_review_summary (period: "day", anchorDate: ${anchorDate || "today"}).`,
        "2. Call list_activity_events to inspect the event log for that day.",
        "3. Call get_daily_brief for the day's quests and character state when context is needed.",
        "",
        "Summarize: completed and failed quests, rewards earned, focus minutes, and anything overdue or surprising.",
        "Do not update, score, archive, or create any quests unless I explicitly ask and confirm.",
      ].join("\n"));
    },
  );
  server.registerPrompt(
    "review_week",
    { title: "Review Week", description: "Review a week of QuestForge activity.", argsSchema: OPTIONAL_ARGUMENT(z.strictObject({ anchorDate: dateString.optional() })) },
    (rawArgs) => {
      const { anchorDate } = rawArgs || {};
      return promptMessages([
        "Help me review one week of QuestForge activity.",
        "",
        "Read first (read-only):",
        `1. Call get_review_summary (period: "week", anchorDate: ${anchorDate || "today"}).`,
        "2. Call list_activity_events to inspect the event log for the week.",
        "3. Call get_character_state to see the current character.",
        "",
        "Summarize: completion and failure counts, rewards earned, focus minutes, top tags, and weekly trends.",
        "Suggest improvements only as a proposal. Do not write to QuestForge without explicit confirmation.",
      ].join("\n"));
    },
  );
  server.registerPrompt(
    "capture_quest",
    { title: "Capture a Quest", description: "Capture a new QuestForge quest with the user's confirmation.", argsSchema: OPTIONAL_ARGUMENT(z.strictObject({ hint: z.string().max(300).optional() })) },
    (rawArgs) => {
      const { hint } = rawArgs || {};
      return promptMessages([
        "Help me capture a new QuestForge quest.",
        "",
        "First clarify what to capture" + (hint ? ` (draft: ${hint})` : "") + ":",
        "- kind: habit, daily, todo, or reward",
        "- title (required), notes, category, tags, and due or scheduled date",
        "- difficulty, estimated minutes, impact, and dependencies when known",
        "",
        "Then ask me to confirm the complete create_quest arguments before calling the tool.",
        "After creating, summarize the quest ID and any resulting event.",
      ].join("\n"));
    },
  );
  server.registerPrompt(
    "process_agent_handoffs",
    { title: "Process Agent Handoffs", description: "Work through agent-assigned quest handoffs.", argsSchema: OPTIONAL_ARGUMENT(z.strictObject({ assigneeId: z.string().max(120).optional() })) },
    (rawArgs) => {
      const { assigneeId } = rawArgs || {};
      return promptMessages([
        "Help me process agent-assigned QuestForge handoffs.",
        "",
        "Read first:",
        `1. Call list_agent_handoffs (state: "ready"${assigneeId ? `, assigneeId: "${assigneeId}"` : ""}).`,
        "2. For each handoff, read the quest with get_quest to understand its context.",
        "3. Call get_quest_tree when the quest has child work that affects the review.",
        "",
        "Then propose per-quest next actions.",
        "Only write after I confirm:",
        "- transition_quest_handoff with dryRun first, then review_required when the agent returns work",
        "- update_quest to edit notes, nextAction, parentQuestId, or assignee details",
        "- score_quest for one quest, or batch_score_quests for a confirmed group; one-off To Dos are stored automatically when completed",
        "Do not remove assignments or archive quests without explicit confirmation.",
      ].join("\n"));
    },
  );
  server.registerPrompt(
    "assign_registered_agent",
    { title: "Assign a Registered Agent", description: "Safely assign one Quest to a registered Agent.", argsSchema: OPTIONAL_ARGUMENT(z.strictObject({ questId: z.string().max(120).optional() })) },
    (rawArgs) => {
      const { questId } = rawArgs || {};
      return promptMessages([
        "Help me assign a QuestForge Quest to one registered Agent.",
        "",
        "Read first:",
        "1. Call list_registered_agents and use only an active Agent.",
        `2. Call get_quest${questId ? ` with questId: \"${questId}\"` : " after I choose the Quest"} to obtain its current updatedAt value.`,
        "3. Call assign_quest_to_agent with dryRun: true.",
        "",
        "Show the proposed assignee, handoff state, and note. Execute with dryRun: false and expectedUpdatedAt only after I confirm.",
        "Never create, modify, archive, or expand Agent permissions through MCP.",
      ].join("\n"));
    },
  );
  server.registerPrompt(
    "review_focus_time",
    { title: "Review Focus Time", description: "Review Toggl Focus time entries and safely attribute them to Quests.", argsSchema: OPTIONAL_ARGUMENT(z.strictObject({ dateFrom: dateString.optional(), dateTo: dateString.optional() })) },
    (rawArgs) => {
      const { dateFrom, dateTo } = rawArgs || {};
      return promptMessages([
        "Help me review recent Toggl Focus time in QuestForge.",
        "",
        "Read first:",
        "1. Call get_toggl_focus_status to confirm the Focus connection and current timer.",
        `2. Call list_toggl_focus_entries${dateFrom || dateTo ? ` with dateFrom: ${dateFrom || ""}, dateTo: ${dateTo || ""}` : " for the default 30-day window"}.`,
        "3. Call preview_toggl_attribution before proposing any attribution.",
        "",
        "Rules:",
        "- Never ask for or accept a Toggl API key through MCP.",
        "- Direct Focus-task matches can be proposed; unlinked entries require a human-selected Quest.",
        "- Explain any conflict or unlinked entry, then request explicit confirmation.",
        "- Call apply_toggl_attribution with dryRun false only after confirmation.",
        "- Do not stop a running timer unless the user explicitly approves the exact expected entry ID.",
      ].join("\n"));
    },
  );
}

function buildQuestforgeServer(factoryContext: McpRequestContext): McpServer {
  const authInfo = factoryContext.authInfo as (AuthInfo & { env?: WorkerEnv; context?: McpContext; identity?: AuthIdentity }) | undefined;
  const { env, context, identity } = authInfo || {};
  const server = new McpServer(SERVER_INFO);
  if (env && context && identity) {
    registerToolHandlers(server, env, context, identity);
    registerResources(server, env, context, identity);
    registerPrompts(server);
  }
  return server;
}

export async function handleMcpNext(request: Request, env: WorkerEnv, context: McpContext, identity: AuthIdentity): Promise<Response> {
  const handler = createMcpHandler(buildQuestforgeServer, {
    route: ROUTE,
    corsOptions: false,
    legacy: "stateless",
    ...hostRules(env),
  });
  const authInfo = { env, context, identity } as unknown as AuthInfo;
  return handler.fetch(request, { authInfo });
}

export { buildQuestforgeServer };

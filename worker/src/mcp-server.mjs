import { McpServer, ResourceTemplate, fromJsonSchema } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { callMcpTool, MCP_TOOLS } from "./index.mjs";

const SERVER_INFO = { name: "questforge-mcp-next", version: "2.3.0" };
const ROUTE = "/mcp-next";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT_LENGTH = 8000;

const dateString = z.string().regex(DATE_PATTERN, "Use YYYY-MM-DD.");

const GENERIC_OUTPUT_SCHEMA = z.object({}).catchall(z.unknown());

function hostRules(env) {
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

function conciseText(value) {
  if (value === undefined) return "OK";
  const text = JSON.stringify(value, null, 2);
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return `${text.slice(0, MAX_TEXT_LENGTH)}\n… (truncated; full data is in structuredContent)`;
}

function safeToolError(error) {
  const message = typeof error?.message === "string" && error.message.trim() ? error.message.trim() : "QuestForge tool failed.";
  return message.slice(0, 500);
}

async function runTool(name, args, env, context, identity) {
  try {
    const value = await callMcpTool(name, args || {}, env, context, identity);
    return { content: [{ type: "text", text: conciseText(value) }], structuredContent: value, isError: false };
  } catch (error) {
    const message = safeToolError(error);
    return {
      content: [{ type: "text", text: message }],
      structuredContent: { error: { code: error?.code || "tool_error", message } },
      isError: true,
    };
  }
}

function registerToolHandlers(server, env, context, identity) {
  for (const tool of MCP_TOOLS) {
    server.registerTool(tool.name, {
      title: tool.title,
      description: tool.description,
      inputSchema: fromJsonSchema(tool.inputSchema),
      outputSchema: tool.outputSchema ? fromJsonSchema(tool.outputSchema) : GENERIC_OUTPUT_SCHEMA,
      annotations: tool.annotations,
    }, (args) => runTool(tool.name, args, env, context, identity));
  }
}

function resourceJson(uri, value, error) {
  const text = error
    ? JSON.stringify({ error: { code: error.code || "resource_error", message: error.message || "QuestForge resource unavailable." } }, null, 2)
    : JSON.stringify(value, null, 2);
  return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
}

function registerResources(server, env, context, identity) {
  const readSafe = async (uri, loader) => {
    try { return resourceJson(uri, await loader()); } catch (error) { return resourceJson(uri, undefined, error); }
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
    "questforge-quest-by-id",
    new ResourceTemplate("questforge://quest/{questId}", {
      list: async () => {
        try {
          const page = await callMcpTool("list_quests", { view: "all", limit: 200 }, env, context, identity);
          return { resources: (page.quests || []).map((quest) => ({ uri: `questforge://quest/${encodeURIComponent(quest.id)}`, name: quest.title || quest.id })) };
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
}

function promptMessages(text) {
  return { messages: [{ role: "user", content: { type: "text", text } }] };
}

// Prompt argument schemas accept a missing `arguments` field (the protocol
// allows it) by wrapping the strict object in `.optional()`.
const OPTIONAL_ARGUMENT = (schema) => schema.optional();

function registerPrompts(server) {
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
        "- Ask before calling create_quest, update_quest, score_quest, batch_update_quests, or convert_calendar_event_to_quest.",
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
        "",
        "Then propose per-quest next actions.",
        "Only write after I confirm:",
        "- update_quest to edit notes, nextAction, or assignee details",
        "- score_quest to complete work",
        "Do not remove assignments or archive quests without explicit confirmation.",
      ].join("\n"));
    },
  );
}

function buildQuestforgeServer(factoryContext) {
  const { env, context, identity } = factoryContext?.authInfo || {};
  const server = new McpServer(SERVER_INFO);
  if (env && context && identity) {
    registerToolHandlers(server, env, context, identity);
    registerResources(server, env, context, identity);
    registerPrompts(server);
  }
  return server;
}

export async function handleMcpNext(request, env, context, identity) {
  const handler = createMcpHandler(buildQuestforgeServer, {
    route: ROUTE,
    corsOptions: false,
    legacy: "stateless",
    ...hostRules(env),
  });
  return handler.fetch(request, { authInfo: { env, context, identity } });
}

export { buildQuestforgeServer };

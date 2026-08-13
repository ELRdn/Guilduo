import { McpServer, ResourceTemplate, fromJsonSchema } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { callMcpTool, MCP_TOOLS } from "./index.mjs";

const SERVER_INFO = { name: "questforge-mcp-next", version: "2.5.0" };
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
  server.registerResource(
    "questforge-agent-handoffs",
    "questforge://agent-handoffs",
    { title: "Agent Handoffs", mimeType: "application/json", description: "Agent-assigned quests and their current handoff state." },
    (uri) => readSafe(uri, () => callMcpTool("list_agent_handoffs", { state: "all" }, env, context, identity)),
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
        "3. Call get_quest_tree when the quest has child work that affects the review.",
        "",
        "Then propose per-quest next actions.",
        "Only write after I confirm:",
        "- transition_quest_handoff with dryRun first, then review_required when the agent returns work",
        "- update_quest to edit notes, nextAction, parentQuestId, or assignee details",
        "- score_quest to complete work",
        "Do not remove assignments or archive quests without explicit confirmation.",
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

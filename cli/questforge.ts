#!/usr/bin/env node
// @ts-nocheck

import { pathToFileURL } from "node:url";

export const DEFAULT_API_URL = "https://questforge-gateway.example.workers.dev";

function optionValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name}には値が必要です。`);
  return value;
}

export function parseArgs(argv) {
  const positional = [];
  const options = { json: false, execute: false, tokenStdin: false, url: "", view: "today", search: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--execute") options.execute = true;
    else if (arg === "--token-stdin") options.tokenStdin = true;
    else if (arg === "--url") options.url = optionValue(argv, index++, "--url");
    else if (arg === "--view") options.view = optionValue(argv, index++, "--view");
    else if (arg === "--search") options.search = optionValue(argv, index++, "--search");
    else if (arg === "--title") options.title = optionValue(argv, index++, "--title");
    else if (arg === "--notes") options.notes = optionValue(argv, index++, "--notes");
    else if (arg === "--due") options.dueDate = optionValue(argv, index++, "--due");
    else if (arg === "--kind") options.kind = optionValue(argv, index++, "--kind");
    else if (arg === "--minutes") options.estimatedMinutes = Number(optionValue(argv, index++, "--minutes"));
    else if (arg === "--difficulty") options.difficulty = optionValue(argv, index++, "--difficulty");
    else if (arg === "--expected-state") options.expectedState = optionValue(argv, index++, "--expected-state");
    else if (arg === "--note") options.note = optionValue(argv, index++, "--note");
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("--")) throw new Error(`未対応のオプションです: ${arg}`);
    else positional.push(arg);
  }
  return { positional, options };
}

async function readTokenFromStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}

export function buildQuestPayload(options) {
  const title = String(options.title || "").trim();
  if (!title) throw new Error("Quest追加には --title が必要です。");
  const estimatedMinutes = Number(options.estimatedMinutes || 30);
  if (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 1440) {
    throw new Error("--minutesは1〜1440の整数で指定してください。");
  }
  const dueDate = String(options.dueDate || "").trim();
  return {
    kind: options.kind || "todo",
    title,
    notes: String(options.notes || ""),
    dueDate,
    scheduledDate: dueDate,
    planningMode: dueDate ? "until_due" : "on_date",
    planningState: dueDate ? "scheduled" : "backlog",
    lifecycleState: "active",
    estimatedMinutes,
    difficulty: options.difficulty || "medium",
  };
}

class QuestForgeApi {
  constructor({ baseUrl, token = "" }) {
    this.baseUrl = String(baseUrl || DEFAULT_API_URL).replace(/\/$/, "");
    this.token = token;
  }

  async request(path, options = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        accept: "application/json",
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = { message: text }; }
    if (!response.ok) {
      const error = body?.error || {};
      throw new Error(error.message || body?.message || `QuestForge API HTTP ${response.status}`);
    }
    return body;
  }
}

function usage() {
  return `QuestForge CLI 0.5\n\n使い方:\n  questforge doctor [--json]\n  questforge quests list [--view today|week|future|backlog|completed|archive|all] [--search 文字] [--json]\n  questforge quests add --title "..." [--due YYYY-MM-DD] [--execute] [--json]\n  questforge quests complete <questId> [--execute] [--json]\n  questforge agents list [--json]\n  questforge handoff <questId> <state> [--expected-state 状態] [--execute] [--json]\n  questforge mcp-config [--json]\n\n認証:\n  QUESTFORGE_API_URL  接続先Worker URL\n  QUESTFORGE_TOKEN     開発用Bearer token（本番はOAuth推奨）\n  --token-stdin        stdinから一度だけtokenを読む\n\n書き込みは安全のため確認結果だけを返します。実行する場合だけ --execute を付けます。`;
}

function output(value, asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  if (typeof value === "string") {
    process.stdout.write(`${value}\n`);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) process.stdout.write(`${item.id || "-"}\t${item.title || item.displayName || item.name || ""}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function mcpConfig(baseUrl = process.env.QUESTFORGE_API_URL || DEFAULT_API_URL) {
  return {
    mcpServers: {
      questforge: {
        type: "http",
        url: `${String(baseUrl).replace(/\/$/, "")}/mcp`,
        authentication: "oauth",
      },
    },
  };
}

export async function run(argv, env = process.env) {
  const { positional, options } = parseArgs(argv);
  if (options.help || !positional.length) return usage();
  const token = options.tokenStdin ? await readTokenFromStdin() : String(env.QUESTFORGE_TOKEN || "");
  const baseUrl = options.url || env.QUESTFORGE_API_URL || DEFAULT_API_URL;
  const api = new QuestForgeApi({ baseUrl, token });
  const [command, subcommand, id, state] = positional;

  if (command === "doctor") return api.request("/health");
  if (command === "mcp-config") return mcpConfig(baseUrl);
  if (command === "quests" && subcommand === "list") {
    const params = new URLSearchParams({ view: options.view, limit: "200" });
    if (options.search) params.set("search", options.search);
    const response = await api.request(`/v1/quests?${params}`);
    return response?.quests || response;
  }
  if (command === "quests" && subcommand === "add") {
    const payload = buildQuestPayload(options);
    if (!options.execute) return { dryRun: true, action: "create_quest", quest: payload };
    return api.request("/v1/quests", { method: "POST", body: JSON.stringify(payload) });
  }
  if (command === "quests" && subcommand === "complete") {
    if (!id) throw new Error("完了対象のquestIdが必要です。");
    return api.request("/v1/quests/batch-score", {
      method: "POST",
      body: JSON.stringify({ questIds: [id], direction: "up", dryRun: !options.execute, source: "questforge-cli" }),
    });
  }
  if (command === "agents" && subcommand === "list") {
    const response = await api.request("/v1/agents?includeArchived=true");
    return response?.agents || response;
  }
  if (command === "handoff") {
    if (!id || !state) throw new Error("handoffにはquestIdと状態が必要です。");
    return api.request(`/v1/quests/${encodeURIComponent(id)}/handoff`, {
      method: "POST",
      body: JSON.stringify({ state, expectedState: options.expectedState, note: options.note || "", dryRun: !options.execute, source: "questforge-cli" }),
    });
  }
  throw new Error("コマンドが不明です。--helpで使い方を確認してください。");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).then((value) => output(value, parseArgs(process.argv.slice(2)).options.json)).catch((error) => {
    const asJson = (() => { try { return parseArgs(process.argv.slice(2)).options.json; } catch { return false; } })();
    output(asJson ? { ok: false, error: error.message } : `エラー: ${error.message}`, asJson);
    process.exitCode = 1;
  });
}

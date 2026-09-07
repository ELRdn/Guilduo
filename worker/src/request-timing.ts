import { AsyncLocalStorage } from "node:async_hooks";

// Fixed labels only: never put paths, IDs, credentials, bodies or errors here.
const phases = ["auth", "agent_context", "route", "state_read", "state_decode", "state_encode", "tx_begin", "tx_read", "tx_stage", "tx_commit", "tx_discard", "state_create", "domain"] as const;
type Phase = typeof phases[number];
type Metric = { duration: number; count: number };
const timings = new AsyncLocalStorage<Partial<Record<Phase, Metric>>>();

export async function timePhase<T>(phase: Phase, operation: () => Promise<T>): Promise<T> {
  const metrics = timings.getStore();
  if (!metrics || !phases.includes(phase)) return operation();
  const start = performance.now();
  try { return await operation(); }
  finally {
    const metric = metrics[phase] ??= { duration: 0, count: 0 };
    metric.duration += Math.max(0, performance.now() - start);
    metric.count++;
  }
}

function routeLabel(request: Request): string | null {
  if (request.method === "OPTIONS" || !request.headers.has("authorization")) return null;
  const path = new URL(request.url).pathname;
  if (path === "/mcp" || path === "/mcp-next") return "mcp";
  if (path === "/v1/state") return "state";
  if (/^\/v1\/quests(?:\/|$)/.test(path)) return "quests";
  if (path.startsWith("/v1/")) return "api";
  return null;
}

export async function withRequestTiming(request: Request, respond: () => Promise<Response>): Promise<Response> {
  const route = routeLabel(request);
  if (!route) return respond();
  return timings.run({}, async () => {
    const start = performance.now();
    const response = await respond();
    const durations: Record<string, number> = { total: Math.round(performance.now() - start) };
    const counts: Record<string, number> = {};
    const metrics = timings.getStore()!;
    for (const phase of phases) {
      const metric = metrics[phase];
      if (!metric) continue;
      durations[phase] = Math.round(metric.duration);
      counts[phase] = metric.count;
    }
    const method = ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(request.method) ? request.method : "OTHER";
    console.log("guilduo_request_timing", { route, method, status: response.status, durations, counts });
    const next = new Response(response.body, response);
    next.headers.set("server-timing", Object.entries(durations).map(([name, ms]) => `${name};dur=${ms}`).join(", "));
    return next;
  });
}

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { buildJevRequest, callJev, getJevConfig, JEV_CONFIDENCE_MIN, type JevEnv, type JevResult } from "../worker/src/jev.ts";

/** Synthetic, labeled text only. No production account/Quest is loaded.
 * Usage cost is an estimate against approved official prices, never an invoice.
 * Each in-flight/error entry consumes its full ceiling forever until operator reconciliation.
 * Evidence is cumulative and locked; reruns do not reset the $1 lifetime budget.
 * Dry-run: node --env-file=.dev.vars --import tsx tools/evaluate-jev.mts
 * Execute: node --env-file=.dev.vars --import tsx tools/evaluate-jev.mts --execute
 * Required vars (no defaults): JEV_ENABLED=true, JEV_MODEL=jev-1.13.0,
 * JEV_INPUT_USD_PER_MILLION=0.042, JEV_OUTPUT_USD_PER_MILLION=0,
 * JEV_DATA_POLICY_APPROVED=true, JEV_EVALUATION_BUDGET_USD=1, TYPESAFE_API_KEY.
 * Data-policy approval is separate from possessing credentials; default is unapproved.
 * Native Node --env-file loads the ignored local file without logging credentials.
 */
export const JEV_EVALUATION_CASES = [
  { id: "code-en", title: "Implement a deterministic parser", completionCriteria: "Unit checks pass", nextAction: "Engineer implements the parser", agent: "agent:engineer", action: "continue" },
  { id: "human-en", title: "Owner must decide the paid price", completionCriteria: "Human owner approves a price", nextAction: "Ask the Human to choose; agents cannot decide pricing", agent: "manual", action: "ask_human" },
  { id: "review-en", title: "Review the completed code", completionCriteria: "Reviewer checks the diff", nextAction: "Reviewer evaluates the completed implementation", agent: "agent:reviewer", action: "review" },
  { id: "wait-en", title: "Waiting for owner-provided license", completionCriteria: "The prerequisite license is provided", nextAction: "No work is possible until the prerequisite arrives", agent: "manual", action: "wait" },
  { id: "code-ja", title: "決定的なパーサーを実装する", completionCriteria: "テストが通る", nextAction: "実装担当のエンジニアがパーサーを実装する", agent: "agent:engineer", action: "continue" },
  { id: "human-ja", title: "販売価格を本人に決めてもらう", completionCriteria: "運営者本人が価格を承認する", nextAction: "人間本人に価格の選択を依頼する", agent: "manual", action: "ask_human" },
] as const;

interface EvaluationEntry {
  caseId: string;
  startedAt: string;
  status: "pending" | "success" | "error";
  maxCostNanoUsd: number;
  costNanoUsd?: number;
  latencyMs?: number;
  providerRequestId?: string | null;
  httpStatus?: number;
  usage?: JevResult["usage"];
  agentCorrect?: boolean;
  actionCorrect?: boolean;
  confident?: boolean;
  errorCode?: string;
}
interface Evidence {
  schemaVersion: 1;
  model: string | null;
  inputRate: number | null;
  outputRate: number | null;
  mode: "dry-run" | "execute";
  updatedAt: string;
  entries: EvaluationEntry[];
}

export function evaluationBudgetUsed(entries: EvaluationEntry[]): number {
  return entries.reduce((sum, entry) => sum + (entry.status === "success" ? entry.costNanoUsd ?? entry.maxCostNanoUsd : entry.maxCostNanoUsd), 0);
}
export function summarizeEvaluation(entries: EvaluationEntry[]) {
  const success = entries.filter(entry => entry.status === "success");
  const times = success.map(entry => entry.latencyMs ?? 0).sort((a, b) => a - b);
  const confident = success.filter(entry => entry.confident);
  const ratio = (n: number, d: number) => d ? n / d : null;
  const quantile = (p: number) => times.length ? times[Math.max(0, Math.ceil(times.length * p) - 1)] : null;
  return {
    attempts: entries.length, success: success.length, failureRate: ratio(entries.length - success.length, entries.length),
    quality: { agentAccuracy: ratio(success.filter(entry => entry.agentCorrect).length, success.length), actionAccuracy: ratio(success.filter(entry => entry.actionCorrect).length, success.length), confidenceCoverage: ratio(confident.length, success.length), confidentPairAccuracy: ratio(confident.filter(entry => entry.agentCorrect && entry.actionCorrect).length, confident.length) },
    latency: { samples: times.length, p50Ms: quantile(0.5), p95Ms: quantile(0.95) },
    reservedOrEstimatedCostUsd: evaluationBudgetUsed(entries) / 1e9,
    invoiceVerified: false,
  };
}

function persist(path: string, evidence: Evidence): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify({ ...evidence, summary: summarizeEvaluation(evidence.entries) }, null, 2) + "\n", { mode: 0o600, flush: true });
  renameSync(temporary, path);
}
function readEvidence(path: string): Evidence | null {
  if (!existsSync(path)) return null;
  const value = JSON.parse(readFileSync(path, "utf8")) as Evidence;
  if (value.schemaVersion !== 1 || !Array.isArray(value.entries) || value.entries.some(entry => !Number.isSafeInteger(entry.maxCostNanoUsd) || entry.maxCostNanoUsd <= 0
    || !["pending", "success", "error"].includes(entry.status) || (entry.costNanoUsd !== undefined && (!Number.isSafeInteger(entry.costNanoUsd) || entry.costNanoUsd < 0 || entry.costNanoUsd > entry.maxCostNanoUsd)))) {
    throw new Error("Invalid cumulative evaluation evidence; reconcile before executing.");
  }
  return value;
}

export async function runEvaluation(env: JevEnv, execute = false, root = process.cwd()) {
  const path = resolve(root, ".qa-artifacts", "jev", "evaluation.json");
  mkdirSync(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  const lock = openSync(lockPath, "wx", 0o600);
  try {
    const previous = readEvidence(path);
    // Evaluation can never borrow a commercial period's budget or reset its own lifetime cap.
    env = { ...env, JEV_BUDGET_SCOPE: "evaluation", JEV_COMMERCIAL_CONFIG: undefined };
    const config = execute ? getJevConfig(env) : null;
    if (config && previous?.entries.some(entry => entry.status !== "success")) throw new Error("A previous evaluation has an unresolved outcome. Reconcile its cost before authorizing another execution.");
    if (config && previous?.entries.length && (previous.model !== config.model || previous.inputRate !== config.inputRate || previous.outputRate !== config.outputRate)) throw new Error("Existing evaluation has different approved model/prices; reconcile before executing.");
    const evidence: Evidence = previous ?? { schemaVersion: 1, model: env.JEV_MODEL ?? null, inputRate: null, outputRate: null, mode: "dry-run", updatedAt: new Date().toISOString(), entries: [] };
    // A dry-run must preserve evidence that earlier entries were actual executions.
    evidence.mode = execute || evidence.entries.length ? "execute" : "dry-run";
    evidence.updatedAt = new Date().toISOString();
    if (config) { evidence.model = config.model; evidence.inputRate = config.inputRate; evidence.outputRate = config.outputRate; }
    persist(path, evidence);
    if (!config) return { evidencePath: path, syntheticCases: JEV_EVALUATION_CASES.length, externalCallsThisRun: 0, ...summarizeEvaluation(evidence.entries) };
    let calls = 0;
    for (const sample of JEV_EVALUATION_CASES) {
      if (evaluationBudgetUsed(evidence.entries) + config.maxCostNanoUsd > Math.min(config.budgetNanoUsd, 1e9)) break;
      const request = buildJevRequest(config.model, { ...sample, lifecycleState: "active", planningState: "backlog" }, [{ agentId: "engineer", role: "Implement software and write tests" }, { agentId: "reviewer", role: "Review completed work" }]);
      const entry: EvaluationEntry = { caseId: sample.id, startedAt: new Date().toISOString(), status: "pending", maxCostNanoUsd: config.maxCostNanoUsd };
      evidence.entries.push(entry);
      persist(path, evidence); // Durable reservation precedes even the first outbound byte.
      const started = performance.now();
      calls += 1;
      try {
        const { result, providerRequestId, httpStatus } = await callJev(env, request);
        entry.status = "success";
        entry.costNanoUsd = result.usage.input_tokens * 42;
        entry.usage = result.usage;
        entry.providerRequestId = providerRequestId;
        entry.httpStatus = httpStatus;
        entry.latencyMs = performance.now() - started;
        entry.agentCorrect = result.answers.agent.choice === sample.agent;
        entry.actionCorrect = result.answers.action.choice === sample.action;
        entry.confident = Math.min(result.answers.agent.confidence, result.answers.action.confidence) >= JEV_CONFIDENCE_MIN;
      } catch (error) {
        const metadata = error as { code?: string; providerRequestId?: string | null; httpStatus?: number };
        entry.status = "error";
        entry.errorCode = metadata.code === "jev_provider_error" || metadata.code === "jev_protocol_error" ? metadata.code : "jev_outcome_unknown";
        entry.providerRequestId = metadata.providerRequestId ?? null;
        entry.httpStatus = metadata.httpStatus;
        entry.latencyMs = performance.now() - started;
      }
      evidence.updatedAt = new Date().toISOString();
      persist(path, evidence);
      // Unknown/protocol failure can represent an unbounded contract breach; stop this run.
      if (entry.status !== "success") break;
    }
    return { evidencePath: path, syntheticCases: JEV_EVALUATION_CASES.length, externalCallsThisRun: calls, ...summarizeEvaluation(evidence.entries) };
  } finally { closeSync(lock); unlinkSync(lockPath); }
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--execute")) throw new Error("Usage: evaluate-jev.mts [--execute]");
  console.log(JSON.stringify(await runEvaluation(process.env as JevEnv, args.includes("--execute")), null, 2));
}

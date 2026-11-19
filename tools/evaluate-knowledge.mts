import { readFile } from "node:fs/promises";
import { scoreKnowledgeRun, selectKnowledgeEmbedding, type KnowledgeEvaluationCase, type KnowledgeEvaluationResult } from "../shared/knowledge-evaluation.ts";

const [casesPath, resultsPath, split = "development"] = process.argv.slice(2);
if (!casesPath || !resultsPath || !["development", "final"].includes(split)) throw new Error("Usage: tsx tools/evaluate-knowledge.mts <confirmed-cases.json> <observed-results.json> [development|final]. Offline only; never calls a provider.");
const suite = JSON.parse(await readFile(casesPath, "utf8")) as { humanConfirmed: boolean; cases: KnowledgeEvaluationCase[] };
if (!suite.humanConfirmed || suite.cases.length !== 24 || suite.cases.filter(c => c.split === "development").length !== 12 || suite.cases.filter(c => c.split === "final").length !== 12) throw new Error("Confirm the 24 human expectations and freeze the 12/12 split before scoring.");
const runs = JSON.parse(await readFile(resultsPath, "utf8")) as { frozenModel?: string; runs: { model: string; results: KnowledgeEvaluationResult[] }[] };
if (split === "final" && !runs.frozenModel) throw new Error("Freeze the development-selected model before opening the final evaluation.");
const cases = suite.cases.filter(c => c.split === split);
const reports = runs.runs.map(run => ({ model: run.model, ...scoreKnowledgeRun(cases, run.results) }));
const models = reports.filter((r): r is typeof r & { model: "bge-m3" | "plamo-embedding-1b" } => r.model === "bge-m3" || r.model === "plamo-embedding-1b");
console.log(JSON.stringify({ split, scope: "Observed local/host evidence only; not production acceptance", reports,
  ...(split === "development" && models.length === 2 ? { selectedModel: selectKnowledgeEmbedding(models) } : {}) }, null, 2));
if (split === "final" && reports.some(r => !r.accepted)) process.exitCode = 1;

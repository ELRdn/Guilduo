export interface KnowledgeEvaluationCase { id: string; split: "development" | "final"; expectedKeys: string[] }
export interface KnowledgeEvaluationResult {
  caseId: string;
  retrievedKeys: string[];
  latencyMs: number;
  captureCorrect: boolean;
  continued: boolean;
  criticalRequirementsMet: boolean;
  humanReviewed: boolean;
  repeatedExplanations: number;
  reworkCount: number;
  resumeMs: number;
  violations: string[];
}
export function scoreKnowledgeRun(cases: KnowledgeEvaluationCase[], results: KnowledgeEvaluationResult[]) {
  if (!cases.length || new Set(cases.map(c => c.id)).size !== cases.length || results.length !== cases.length || new Set(results.map(r => r.caseId)).size !== results.length) throw new Error("Each frozen case needs exactly one result.");
  let misses = 0, expected = 0;
  for (const test of cases) {
    const result = results.find(r => r.caseId === test.id);
    if (!result || !Array.isArray(result.retrievedKeys) || !Array.isArray(result.violations) || [result.latencyMs, result.resumeMs, result.reworkCount, result.repeatedExplanations].some(n => !Number.isFinite(n) || n < 0)
      || [result.captureCorrect, result.continued, result.criticalRequirementsMet, result.humanReviewed].some(b => typeof b !== "boolean")) throw new Error(`Missing/invalid observed evidence for ${test.id}`);
    expected += test.expectedKeys.length;
    misses += test.expectedKeys.filter(key => !result.retrievedKeys.includes(key)).length;
  }
  const violations = results.flatMap(r => r.violations), continued = results.filter(r => r.continued).length;
  const reviewed = results.every(r => r.humanReviewed);
  return { cases: cases.length, expected, misses, recall: expected ? (expected - misses) / expected : 1,
    meanLatencyMs: results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length,
    continued, captureCorrect: results.filter(r => r.captureCorrect).length,
    repeatedExplanations: results.reduce((sum, r) => sum + r.repeatedExplanations, 0),
    reworkCount: results.reduce((sum, r) => sum + r.reworkCount, 0),
    meanResumeMs: results.reduce((sum, r) => sum + r.resumeMs, 0) / results.length,
    violations, humanReviewed: reviewed,
    accepted: reviewed && violations.length === 0 && results.every(r => r.captureCorrect && r.criticalRequirementsMet) && continued >= Math.ceil(cases.length * 11 / 12) };
}
export function selectKnowledgeEmbedding(candidates: { model: "bge-m3" | "plamo-embedding-1b"; misses: number; meanLatencyMs: number }[]) {
  if (candidates.length !== 2 || new Set(candidates.map(c => c.model)).size !== 2 || candidates.some(c => !Number.isInteger(c.misses) || c.misses < 0 || !Number.isFinite(c.meanLatencyMs) || c.meanLatencyMs < 0)) throw new Error("Both measured embedding candidates are required.");
  return [...candidates].sort((a, b) => a.misses - b.misses || a.meanLatencyMs - b.meanLatencyMs || (a.model === "bge-m3" ? -1 : 1))[0].model;
}

const modelNames = ["baseline", "lexical", "bge-m3", "plamo-embedding-1b"] as const;
type EvaluationModel = typeof modelNames[number];
const isModel = (value: unknown): value is EvaluationModel => modelNames.some(name => value === name);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function evaluateKnowledgeCampaign(suiteInput: unknown, campaignInput: unknown, split: KnowledgeEvaluationCase["split"]) {
  const suite = record(suiteInput), campaign = record(campaignInput);
  const cases: KnowledgeEvaluationCase[] = Array.isArray(suite.cases) ? suite.cases : [];
  if (suite.humanConfirmed !== true || cases.length !== 24 || new Set(cases.map(c => c?.id)).size !== 24
    || cases.filter(c => c?.split === "development").length !== 12 || cases.filter(c => c?.split === "final").length !== 12
    || cases.some(c => typeof c?.id !== "string" || !c.id.trim() || !Array.isArray(c.expectedKeys) || !c.expectedKeys.length
      || c.expectedKeys.some(key => typeof key !== "string" || !key.trim()) || new Set(c.expectedKeys).size !== c.expectedKeys.length)) {
    throw new Error("Confirm the 24 human expectations and freeze the 12/12 split before scoring.");
  }
  if (!Array.isArray(campaign.runs) || !campaign.runs.length || new Set(campaign.runs.map(run => record(run).model)).size !== campaign.runs.length) {
    throw new Error("Supply an observed run for each evaluated model.");
  }
  const reports = campaign.runs.map(value => {
    const run = record(value);
    if (!isModel(run.model) || !Array.isArray(run.results)) throw new Error("Supply a valid model and its observed results.");
    return { model: run.model, ...scoreKnowledgeRun(cases.filter(entry => entry.split === split), run.results) };
  });
  if (split === "final" && (!isModel(campaign.frozenModel) || reports.length !== 1 || reports[0].model !== campaign.frozenModel)) {
    throw new Error("Final evaluation requires a complete run of the frozen model.");
  }
  const models = reports.filter((r): r is typeof r & { model: "bge-m3" | "plamo-embedding-1b" } => r.model === "bge-m3" || r.model === "plamo-embedding-1b");
  return { reports, ...(split === "development" && models.length === 2 ? { selectedModel: selectKnowledgeEmbedding(models) } : {}) };
}

import test from "node:test";
import assert from "node:assert/strict";
import { evaluateKnowledgeCampaign, scoreKnowledgeRun, selectKnowledgeEmbedding } from "../shared/knowledge-evaluation.ts";
test("knowledge evaluation counts missing retrieval separately; human review and serious violations gate acceptance", () => {
  const cases = Array.from({ length: 12 }, (_, n) => ({ id: String(n), split: "final" as const, expectedKeys: [`fact-${n}`] }));
  const results = cases.map(c => ({ caseId: c.id, retrievedKeys: c.expectedKeys, latencyMs: 10, captureCorrect: true, continued: c.id !== "0", criticalRequirementsMet: true, humanReviewed: true, repeatedExplanations: 0, reworkCount: 0, resumeMs: 100, violations: [] as string[] }));
  assert.equal(scoreKnowledgeRun(cases, results).accepted, true);
  results[0].retrievedKeys = []; assert.equal(scoreKnowledgeRun(cases, results).misses, 1);
  results[1].violations = ["wrong_project_application"]; assert.equal(scoreKnowledgeRun(cases, results).accepted, false);
  results[1].violations = []; results[1].humanReviewed = false; assert.equal(scoreKnowledgeRun(cases, results).accepted, false);
  assert.throws(() => scoreKnowledgeRun(cases, results.slice(1)));
});
test("embedding selection uses retrieval misses first, latency next, then BGE-M3; absent observations never pass", () => {
  assert.equal(selectKnowledgeEmbedding([{ model: "bge-m3", misses: 0, meanLatencyMs: 100 }, { model: "plamo-embedding-1b", misses: 1, meanLatencyMs: 1 }]), "bge-m3");
  assert.equal(selectKnowledgeEmbedding([{ model: "bge-m3", misses: 0, meanLatencyMs: 100 }, { model: "plamo-embedding-1b", misses: 0, meanLatencyMs: 1 }]), "plamo-embedding-1b");
  assert.equal(selectKnowledgeEmbedding([{ model: "plamo-embedding-1b", misses: 0, meanLatencyMs: 1 }, { model: "bge-m3", misses: 0, meanLatencyMs: 1 }]), "bge-m3");
  assert.throws(() => selectKnowledgeEmbedding([]));
});

test("final campaign rejects missing evidence and a different model", () => {
  const cases = Array.from({ length: 24 }, (_, n) => ({ id: String(n), split: n < 12 ? "development" : "final", expectedKeys: ["expected"] }));
  const results = cases.slice(12).map(c => ({
    caseId: c.id, retrievedKeys: ["expected"], violations: [], latencyMs: 10, resumeMs: 100, captureCorrect: true,
    continued: true, criticalRequirementsMet: true, humanReviewed: true, repeatedExplanations: 0, reworkCount: 0,
  }));
  const suite = { humanConfirmed: true, cases };
  assert.throws(() => evaluateKnowledgeCampaign(suite, { frozenModel: "lexical", runs: [] }, "final"));
  assert.throws(() => evaluateKnowledgeCampaign(suite, { frozenModel: "lexical", runs: [{ model: "baseline", results }] }, "final"));
  assert.throws(() => evaluateKnowledgeCampaign({ ...suite, humanConfirmed: "false" }, { frozenModel: "lexical", runs: [{ model: "lexical", results }] }, "final"));
  assert.equal(evaluateKnowledgeCampaign(suite, { frozenModel: "lexical", runs: [{ model: "lexical", results }] }, "final").reports[0].accepted, true);
});

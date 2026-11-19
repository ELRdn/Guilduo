import { readFile } from "node:fs/promises";
import { evaluateKnowledgeCampaign } from "../shared/knowledge-evaluation.ts";

const [casesPath, resultsPath, split = "development"] = process.argv.slice(2);
if (!casesPath || !resultsPath || (split !== "development" && split !== "final")) {
  throw new Error("Usage: tsx tools/evaluate-knowledge.mts <confirmed-cases.json> <observed-results.json> [development|final]. Offline only; never calls a provider.");
}
const suite: unknown = JSON.parse(await readFile(casesPath, "utf8"));
const campaign: unknown = JSON.parse(await readFile(resultsPath, "utf8"));
const report = evaluateKnowledgeCampaign(suite, campaign, split);
console.log(JSON.stringify({ split, scope: "Observed local/host evidence only; not production acceptance", ...report }, null, 2));
if (split === "final" && report.reports.some(run => !run.accepted)) process.exitCode = 1;

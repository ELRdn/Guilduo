import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, link, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { archiveGuilduoPlugin } from "../tools/package-guilduo-plugins.mts";
import { prepareGuilduoPlugin } from "../tools/prepare-guilduo-plugin.mts";
import { prepareGuilduoReview, reviewToolDrafts } from "../tools/prepare-guilduo-review.mts";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const hash = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

test("review tool drafts include real compound scopes and reject unclassified or incomplete tools", async () => {
  const catalog = JSON.parse(await readFile(join(repositoryRoot, "api/mcp-tools.json"), "utf8")) as {
    tools: Parameters<typeof reviewToolDrafts>[0] };
  const tools = reviewToolDrafts(catalog.tools);
  assert.equal(tools.length, catalog.tools.length);
  assert.deepEqual(tools.find(tool => tool.name === "get_daily_brief")?.requiredScopesDraft, ["quests:read", "character:read"]);
  assert.deepEqual(tools.find(tool => tool.name === "assign_quest_to_agent")?.requiredScopesDraft, ["agents:read", "quests:write"]);
  assert.deepEqual(tools.find(tool => tool.name === "convert_calendar_event_to_quest")?.requiredScopesDraft, ["quests:write", "integrations:sync"]);
  assert.equal(tools.find(tool => tool.name === "get_current_agent_context")?.scopeBoundary, "OAuth connection grant");
  for (const tool of tools) {
    assert.equal(tool.operatorVerification, "pending");
    assert.equal(tool.liveExecution, "not_run");
    assert.equal(Object.keys(tool.justificationDrafts).length, 3);
  }
  assert.throws(() => reviewToolDrafts([{ ...catalog.tools[0]!, name: "unknown_future_tool" }]), /Missing scope review/);
  assert.throws(() => reviewToolDrafts([{ ...catalog.tools[0]!, annotations: {} }]), /Missing annotation/);
  assert.throws(() => reviewToolDrafts([catalog.tools[0]!, catalog.tools[0]!]), /Invalid tool catalog/);
});

test("review bundle verifies existing bytes, keeps expectations unrun and preserves evidence on failure", { skip: process.platform !== "win32" }, async t => {
  const root = await mkdtemp(join(repositoryRoot, ".qa-artifacts", "review-test-"));
  try {
    for (const path of ["LICENSE", "plugins/questforge", "skills/guilduo-workflows", "api/mcp-tools.json",
      "worker/src/index.ts", "docs/guilduo-plugin-submission.md"]) {
      await mkdir(join(root, path, ".."), { recursive: true });
      await cp(join(repositoryRoot, path), join(root, path), { recursive: true });
    }
    const staging = await prepareGuilduoPlugin(undefined, root, { submission: true });
    const archive = { ...await archiveGuilduoPlugin(staging, "openai", root), hooks: false, submission: true };
    const archiveBytes = await readFile(archive.path);
    const reportPath = join(root, ".qa-artifacts/guilduo-plugin-packages.json");
    const reportBytes = Buffer.from(JSON.stringify({ packages: [archive], liveAcceptance: "passed", submitted: true, published: true }));
    await writeFile(reportPath, reportBytes);

    await t.test("copies exact archives and hashes without inheriting claimed external passes", async () => {
      const resultPath = await prepareGuilduoReview(root);
      const result = JSON.parse(await readFile(resultPath, "utf8")) as {
        readyForSubmission: boolean; submitted: boolean; published: boolean; dshArchiveIncluded: boolean;
        gates: { id: string; status: string }[];
        packages: { path: string; sha256: string; liveAcceptance: string }[];
        fileHashes: { path: string; sha256: string }[];
      };
      assert.equal(result.readyForSubmission, false);
      assert.equal(result.submitted, false);
      assert.equal(result.published, false);
      assert.equal(result.dshArchiveIncluded, false);
      assert.equal(result.packages[0]!.liveAcceptance, "not_verified");
      for (const id of ["reviewer_account", "live_acceptance", "domain_verification", "demo_video", "portal_access", "portal_scans", "submit", "approval", "publish"]) {
        assert.equal(result.gates.find(gate => gate.id === id)?.status, "not_verified");
      }
      const bundle = join(resultPath, "..");
      assert.deepEqual(await readFile(join(bundle, result.packages[0]!.path)), archiveBytes);
      assert.equal(result.packages[0]!.sha256, hash(archiveBytes));
      for (const file of result.fileHashes) assert.equal(hash(await readFile(join(bundle, file.path))), file.sha256);
      const cases = JSON.parse(await readFile(join(bundle, "case-execution-templates.json"), "utf8")) as {
        actualRun: boolean; cases: { kind: string; status: string; packageSha256: string; actualResult: unknown; executedAt: unknown }[] };
      assert.equal(cases.actualRun, false);
      assert.equal(cases.cases.filter(entry => entry.kind === "positive").length, 5);
      assert.equal(cases.cases.filter(entry => entry.kind === "negative").length, 3);
      for (const entry of cases.cases) {
        assert.equal(entry.status, "not_run");
        assert.equal(entry.packageSha256, archive.sha256);
        assert.equal(entry.actualResult, null);
        assert.equal(entry.executedAt, null);
      }
      const before = await readFile(resultPath);
      await assert.rejects(prepareGuilduoReview(root), /already exists/);
      assert.deepEqual(await readFile(resultPath), before);
      await assert.rejects(prepareGuilduoReview(root, "../outside"), /simple output directory/);
    });

    const noOutput = async (): Promise<void> => {
      await assert.rejects(lstat(join(root, ".qa-artifacts", "rejected")), { code: "ENOENT" });
    };
    await t.test("archive drift stops before producing a bundle and never replaces the archive", async () => {
      await writeFile(archive.path, Buffer.concat([archiveBytes, Buffer.from("drift")]));
      await assert.rejects(prepareGuilduoReview(root, "rejected"), /Archive hash\/size drift/);
      await noOutput();
      assert.equal((await readFile(archive.path)).length, archiveBytes.length + 5);
      await writeFile(archive.path, archiveBytes);
    });
    await t.test("legacy Skill paths in review metadata are rejected before any output", async () => {
      const validationPath = join(staging, "validation.json");
      const validationBytes = await readFile(validationPath);
      const validation = JSON.parse(validationBytes.toString()) as { files: { path: string }[] };
      validation.files.find(file => file.path === "skills/guilduo-workflows/SKILL.md")!.path = "skills/questforge-workflows/SKILL.md";
      await writeFile(validationPath, JSON.stringify(validation));
      await assert.rejects(prepareGuilduoReview(root, "rejected"), /canonical Skill archive paths/);
      await noOutput();
      assert.deepEqual(await readFile(archive.path), archiveBytes);
      await writeFile(validationPath, validationBytes);
    });
    await t.test("changed staged files and current canonical Skill are rejected", async () => {
      const staged = join(staging, "plugin/LICENSE");
      const license = await readFile(staged);
      await writeFile(staged, "drift");
      await assert.rejects(prepareGuilduoReview(root, "rejected"), /Archive entry drift/);
      await noOutput();
      await writeFile(staged, license);
      const skill = join(root, "skills/guilduo-workflows/SKILL.md");
      const skillBytes = await readFile(skill);
      await writeFile(skill, "changed canonical Skill");
      await assert.rejects(prepareGuilduoReview(root, "rejected"), /Canonical source drift/);
      await noOutput();
      await writeFile(skill, skillBytes);
    });
    await t.test("outside and hardlinked inputs are rejected without exposing their content", async () => {
      await writeFile(reportPath, JSON.stringify({ packages: [{ ...archive, path: join(root, "LICENSE") }] }));
      await assert.rejects(prepareGuilduoReview(root, "rejected"), /outside approved/);
      await noOutput();
      await writeFile(reportPath, reportBytes);
      const alias = join(root, "archive-alias.zip");
      await link(archive.path, alias);
      await assert.rejects(prepareGuilduoReview(root, "rejected"), /Linked or invalid/);
      await noOutput();
      await rm(alias);
    });
    await t.test("even hash-consistent staging with a wrong public endpoint is rejected before repacking", async () => {
      const path = join(staging, "plugin/.mcp.json");
      const mcpBytes = await readFile(path);
      const validationPath = join(staging, "validation.json");
      const validationBytes = await readFile(validationPath);
      const validation = JSON.parse(validationBytes.toString()) as { files: { path: string; sha256: string }[] };
      const wrong = Buffer.from(JSON.stringify({ mcpServers: { questforge: { url: "https://example.invalid/mcp" } } }));
      await writeFile(path, wrong);
      validation.files.find(file => file.path === ".mcp.json")!.sha256 = hash(wrong);
      await writeFile(validationPath, JSON.stringify(validation));
      await assert.rejects(archiveGuilduoPlugin(staging, "openai", root), /Invalid package MCP boundary/);
      assert.deepEqual(await readFile(archive.path), archiveBytes);
      await noOutput();
      await writeFile(path, mcpBytes);
      await writeFile(validationPath, validationBytes);
      await writeFile(archive.path, archiveBytes);
      await writeFile(reportPath, reportBytes);
    });
    await t.test("updated review metadata requires a new packaged candidate", async () => {
      const path = join(root, "plugins/questforge/.codex-plugin/plugin.json");
      const manifest = JSON.parse(await readFile(path, "utf8")) as { interface: { displayName: string } };
      manifest.interface.displayName = "Changed candidate";
      await writeFile(path, JSON.stringify(manifest));
      await assert.rejects(prepareGuilduoReview(root, "rejected"), /Submission manifest drift/);
      await noOutput();
    });
    assert.deepEqual(await readFile(archive.path), archiveBytes);
  } finally {
    // This literal test child was created under the repository artifacts directory above.
    assert.equal(join(root, "..").toLowerCase(), join(repositoryRoot, ".qa-artifacts").toLowerCase());
    await rm(root, { recursive: true, force: true });
  }
});

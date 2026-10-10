import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

type ReviewCase = { description: string; prompt: string; tools_triggered?: string; expected_behavior: string };
type Manifest = { version: string; apps?: unknown; hooks?: unknown; interface: unknown;
  extensions: { "com.openai": { review: { test_cases: { positive: ReviewCase[]; negative: ReviewCase[] };
    demo_recording_url?: string }; publication: unknown } } };
type Tool = { name: string; title: string; description: string; annotations: Record<string, boolean> };
type Archive = { target?: string; host?: string; path: string; sha256: string; bytes: number;
  files: number; hooks: boolean; submission: boolean };
type Validation = { version: string; files: { path: string; sha256: string }[] };
type BundleArchive = { target: string; version: string; hooks: boolean; submission: boolean; path: string;
  sourcePath: string; sha256: string; bytes: number; files: number; archiveEntries: string;
  entryHashes: Validation["files"]; canonicalSkillAndLicense: string; liveAcceptance: string };
const hash = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

// shortcut: scope drafts are not runtime authorization, reinspect after MCP policy changes.
const scopeGroups: [string[], string[]][] = [
  [["agents:read"], ["list_registered_agents", "get_current_agent_context", "get_agent_link"]],
  [["agents:write"], ["link_agent", "unlink_agent"]],
  [["agents:read", "quests:write"], ["assign_quest_to_agent"]],
  [["quests:read"], ["list_today_quests", "list_quests", "list_human_requests", "get_quest", "get_quest_tree", "list_agent_handoffs"]],
  [["quests:write"], ["request_human_review", "create_quest", "update_quest", "batch_update_quests", "batch_score_quests", "archive_quests", "link_external_record", "score_quest", "transition_quest_handoff"]],
  [["quests:read", "character:read"], ["get_daily_brief"]],
  [["quests:read", "events:read"], ["get_review_summary"]],
  [["character:read"], ["get_character_state"]],
  [["rewards:write"], ["buy_reward"]],
  [["integrations:read"], ["list_integrations", "get_toggl_focus_status", "list_toggl_focus_entries", "get_toggl_focus_tracking", "preview_toggl_attribution", "get_toggl_estimate_insights", "preview_external_sync", "get_calendar_schedule"]],
  [["integrations:sync"], ["sync_quest_to_toggl_focus", "start_toggl_focus_tracking", "stop_toggl_focus_tracking", "apply_toggl_attribution", "sync_external_service"]],
  [["quests:write", "integrations:sync"], ["convert_calendar_event_to_quest"]],
  [["profiles:read"], ["get_my_profile", "find_profile_by_handle"]],
  [["profiles:write"], ["update_profile"]],
  [["friends:read"], ["list_friends", "list_friend_requests"]],
  [["friends:write"], ["send_friend_request", "respond_friend_request", "remove_friend"]],
  [["parties:read"], ["get_party"]],
  [["parties:write"], ["create_party", "invite_party_member", "accept_party_invite", "leave_party", "remove_party_member"]],
  [["battle:read"], ["get_battle_session"]],
  [["battle:write"], ["battle_command"]],
  [["events:read"], ["list_activity_events"]],
];

export function reviewToolDrafts(tools: Tool[]) {
  if (!tools.length || new Set(tools.map(tool => tool.name)).size !== tools.length) throw new Error("Invalid tool catalog");
  return tools.map(tool => {
    const scopes = scopeGroups.find(([, names]) => names.includes(tool.name))?.[0];
    if (!scopes) throw new Error(`Missing scope review: ${tool.name}`);
    for (const key of ["readOnlyHint", "destructiveHint", "openWorldHint"]) {
      if (typeof tool.annotations?.[key] !== "boolean") throw new Error(`Missing annotation: ${tool.name}/${key}`);
    }
    return { ...tool, requiredScopesDraft: scopes,
      scopeBoundary: tool.name === "list_registered_agents" || tool.name === "get_current_agent_context"
        || tool.name === "get_agent_link" || tool.name === "link_agent" || tool.name === "unlink_agent"
        ? "OAuth connection grant" : "OAuth grant intersected with selected Agent policy",
      justificationDrafts: {
        readOnlyHint: `${tool.name}: source declares readOnlyHint=${tool.annotations.readOnlyHint}. Verify the described action: ${tool.description}`,
        destructiveHint: `${tool.name}: source declares destructiveHint=${tool.annotations.destructiveHint}. Verify replacement, removal and execution behavior; retain host confirmation.`,
        openWorldHint: `${tool.name}: source declares openWorldHint=${tool.annotations.openWorldHint}. Verify external provider access and optional integration side effects.`,
      }, operatorVerification: "pending", liveExecution: "not_run" };
  });
}

/** Assemble existing archives only; never rebuild packages, use credentials or infer external acceptance. */
export async function prepareGuilduoReview(root = repositoryRoot, outputName = "guilduo-review-bundle") {
  root = await realpath(root);
  const artifacts = join(root, ".qa-artifacts");
  if (await realpath(artifacts) !== artifacts) throw new Error("Linked artifacts directory");
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(outputName)) throw new Error("Expected a simple output directory name");
  const output = join(artifacts, outputName);
  if (await lstat(output).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return false;
  })) throw new Error("Review output already exists; use --output to preserve existing evidence");
  const sources: { path: string; sha256: string }[] = [];
  const safeRead = async (path: string): Promise<Buffer> => {
    const absolute = resolve(root, path);
    const local = relative(root, absolute);
    if (local === ".." || local.startsWith(`..${sep}`) || resolve(root, local) !== absolute
      || await realpath(absolute) !== absolute) throw new Error("Linked or outside review input");
    const info = await lstat(absolute);
    if (!info.isFile() || info.nlink !== 1) throw new Error("Linked or invalid review input");
    return readFile(absolute);
  };
  const source = async (path: string): Promise<Buffer> => {
    const bytes = await safeRead(path);
    sources.push({ path, sha256: hash(bytes) });
    return bytes;
  };
  const sourceManifest = JSON.parse((await source("plugins/questforge/.codex-plugin/plugin.json")).toString()) as Manifest;
  const submission = JSON.parse((await source("plugins/questforge/openai-submission.json")).toString()) as {
    pluginVersion: string; mcpEndpoint: string; minimumPhaseSyncScopes: string[] };
  if (submission.pluginVersion !== sourceManifest.version || submission.mcpEndpoint !== "https://mcp.guilduo.com/mcp") {
    throw new Error("Submission metadata differs from the current candidate");
  }
  const catalogBytes = await source("api/mcp-tools.json");
  const catalog = JSON.parse(catalogBytes.toString()) as { tools: Tool[] };
  const tools = reviewToolDrafts(catalog.tools);
  await source("worker/src/index.ts");
  await source("docs/guilduo-plugin-submission.md");
  const report = JSON.parse((await source(".qa-artifacts/guilduo-plugin-packages.json")).toString()) as { packages: Archive[] };
  if (!report.packages.length || report.packages.filter(item => item.submission).length !== 1) throw new Error("Expected one submission archive");
  const contents = new Map<string, Buffer>();
  const packages: BundleArchive[] = [];
  let manifest: Manifest | undefined;
  for (const item of report.packages) {
    const target = item.target ?? item.host;
    if (target !== "openai") throw new Error("Invalid archive target: this review is OpenAI-only");
    const archive = resolve(item.path);
    if (!relative(artifacts, archive).startsWith(`guilduo-`) || dirname(dirname(archive)) !== artifacts
      || !/^guilduo-[a-z0-9.-]+\.(zip|tgz)$/.test(basename(archive))) throw new Error("Archive outside approved package directory");
    const bytes = await safeRead(archive);
    if (hash(bytes) !== item.sha256 || bytes.length !== item.bytes) throw new Error(`Archive hash/size drift: ${target}`);
    const validation = JSON.parse((await source(relative(root, join(dirname(archive), "validation.json")))).toString()) as Validation;
    const files = validation.files;
    if (!files.length || files.length !== item.files || new Set(files.map(file => file.path)).size !== files.length) throw new Error("Invalid archive file manifest");
    if (!files.some(file => file.path === "skills/guilduo-workflows/SKILL.md")
      || files.some(file => file.path.startsWith("skills/") && !file.path.startsWith("skills/guilduo-workflows/"))) throw new Error("Invalid canonical Skill archive paths");
    const version = validation.version;
    const expectedVersion = `${sourceManifest.version}${item.hooks && ["claude", "muse"].includes(target) ? ".hooks" : ""}`;
    if (version !== expectedVersion) throw new Error(`Stale archive version: ${target}`);
    const tar = (args: string[]): Buffer => execFileSync("tar", args, { timeout: 30_000, maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    const names = tar(["-tf", archive]).toString().trim().split(/\r?\n/);
    const prefix = archive.endsWith(".tgz") ? "package/" : "";
    const expectedNames = files.map(file => `${prefix}${file.path}`);
    if (names.length !== expectedNames.length || new Set(names).size !== names.length
      || names.some(name => !expectedNames.includes(name))
      || tar(["-tvf", archive]).toString().trim().split(/\r?\n/).some(line => !line.startsWith("-"))) throw new Error("Unexpected or linked archive entries");
    for (const file of files) {
      if (!/^[A-Za-z0-9._/-]+$/.test(file.path) || file.path.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Unsafe archive entry");
      const entry = tar(["-xOf", archive, "--", `${prefix}${file.path}`]);
      const staged = join(dirname(archive), "plugin", file.path);
      if (hash(entry) !== file.sha256 || !(await safeRead(staged)).equals(entry)) throw new Error(`Archive entry drift: ${target}/${file.path}`);
      if (file.path.startsWith("skills/guilduo-workflows/") || file.path === "LICENSE") {
        if (!(await safeRead(file.path)).equals(entry)) throw new Error(`Canonical source drift: ${file.path}`);
      }
      if (!file.path.endsWith(".png") && /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}|\bBearer [A-Za-z0-9_.-]{24,}|"(?:test_credentials|reviewer_instructions)"\s*:/.test(entry.toString())) {
        throw new Error("Credential-like archive content");
      }
      if (item.submission) {
        if (target !== "openai" || item.hooks || /^(?:hooks\/|\.app\.json$|\.agents\/)/.test(file.path)) throw new Error("Unsafe public submission package");
        if (file.path === ".codex-plugin/plugin.json") manifest = JSON.parse(entry.toString()) as Manifest;
        if (file.path === ".mcp.json" || file.path === "mcp.json") {
          const mcp = JSON.parse(entry.toString()) as { mcpServers: Record<string, { url: string }> };
          if (Object.keys(mcp.mcpServers).length !== 1 || mcp.mcpServers.questforge?.url !== submission.mcpEndpoint) throw new Error("Public MCP endpoint differs from the official endpoint");
        }
      }
    }
    if (!(await safeRead(archive)).equals(bytes)) throw new Error("Archive changed during review");
    const bundlePath = `archives/${target}${item.submission ? "-submission" : item.hooks ? "-hooks" : ""}/${basename(archive)}`;
    if (contents.has(bundlePath)) throw new Error("Duplicate archive destination");
    contents.set(bundlePath, bytes);
    packages.push({ target, version, hooks: item.hooks, submission: item.submission, path: bundlePath,
      sourcePath: relative(root, archive).split(sep).join("/"), sha256: hash(bytes), bytes: bytes.length,
      files: files.length, entryHashes: files, archiveEntries: "matched_staging_hashes", canonicalSkillAndLicense: "matched", liveAcceptance: "not_verified" });
  }
  if (!manifest || manifest.apps || manifest.hooks || manifest.version !== sourceManifest.version
    || JSON.stringify(manifest.extensions) !== JSON.stringify(sourceManifest.extensions)
    || JSON.stringify(manifest.interface) !== JSON.stringify(sourceManifest.interface)) throw new Error("Submission manifest drift or prohibited references");
  const cases = manifest.extensions["com.openai"].review.test_cases;
  if (cases.positive.length !== 5 || cases.negative.length !== 3) throw new Error("Expected 5 positive and 3 negative cases");
  const templates = Object.entries(cases).flatMap(([kind, entries]) => entries.map((entry, index) => {
    for (const value of [entry.description, entry.prompt, entry.expected_behavior, ...(kind === "positive" ? [entry.tools_triggered] : [])]) {
      if (typeof value !== "string" || !value.trim()) throw new Error("Incomplete review case");
    }
    if (entry.tools_triggered?.split(",").some(name => !tools.some(tool => tool.name === name.trim()))) throw new Error("Unknown case tool");
    return { id: `${kind === "positive" ? "P" : "N"}${index + 1}`, kind, ...entry, status: "not_run",
      packageSha256: packages.find(item => item.submission)!.sha256, fixtureAlias: null, host: null,
      surface: null, executedAt: null, actualTools: [], actualResult: null, unintendedWrites: null, evidencePaths: [] };
  }));
  const gates = [
    ["reviewer_account", "Dedicated login, fixture aliases, access expiry and revocation owner; credentials only in secure portal Review details."],
    ["live_acceptance", "Candidate-bound OAuth, 8 real cases, Human Web answer/readback/resumption, proactive sync, conflict and unknown-response safety; parent owns evidence."],
    ["tool_annotations", "Check each flag and justification against behavior and the live scanned catalog; scope drafts are not authorization policy."],
    ["domain_verification", "Portal-issued challenge, exact public response and successful Verify Domain; do not store the token in this bundle."],
    ["demo_video", "Record, redact, host and verify a real accessible demo URL; metadata presence alone is not verification."],
    ["legal_and_publisher", "Confirm current Privacy, Terms, support content and verified publisher identity."],
    ["portal_access", "Existing Guilduo draft, owner/Apps Management Write, verified identity and attestations."],
    ["portal_scans", "Upload candidate ZIP, successful Skill/security scan, OAuth Connect/Rescan and per-tool annotations."],
    ["submit", "Operator submits the exact reviewed candidate after preceding gates are satisfied."],
    ["approval", "Record approval for this version and hash."],
    ["publish", "Publish the approved version separately and verify its listing."],
  ].map(([id, requiredEvidence]) => ({ id, status: "not_verified", requiredEvidence }));
  contents.set("mcp-tools.json", catalogBytes);
  contents.set("submission-manifest.json", json(manifest));
  contents.set("tool-review-drafts.json", json({ basis: "Current source catalog and manually inspected callMcpTool requirements; no live scan",
    minimumPhaseSyncScopes: submission.minimumPhaseSyncScopes,
    notes: "P1 get_daily_brief also requires character:read. Optional Calendar/provider branches need separate review. Agent discovery uses the connection grant; execution uses its intersection with Agent policy.", tools }));
  contents.set("case-execution-templates.json", json({ candidateVersion: manifest.version, actualRun: false, cases: templates }));
  contents.set("REVIEW.md", Buffer.from(`# Guilduo review preparation: ${manifest.version}\n\nLocal bundle assembled; NOT cleared for submission. Only archives/openai-submission/ is the public upload candidate. Other archives are host-local distribution candidates.\n\nArchives are copied unchanged, with SHA256, entry/staging hashes and canonical Skill/LICENSE comparisons. No external acceptance is inferred. Tool requirements and per-flag justifications are drafts requiring operator review, including optional integration behavior.\n\nCase templates are expectations, all not_run; use dedicated fixture aliases and redact evidence. Keep credentials, full user IDs, cookies, Authorization headers, domain tokens and private conversation/task content out of this bundle. Reviewer access belongs only in secure portal Review details.\n\nreview.json records reviewer, live, annotation, domain, video, legal, portal scan, Submit, approval and Publish gates as not_verified. Parent owns live evidence and handoff. A configured demo URL does not prove recording or reachability.\n\nRegenerate into a new --output name after package or catalog changes; existing execution evidence is never overwritten. No deployment, submission or publication is performed.\n`));
  const result = { generatedAt: new Date().toISOString(), candidateVersion: manifest.version,
    readyForSubmission: false, submitted: false, published: false, gates, packages, sourceHashes: sources,
    demoUrlPresentInManifest: Boolean(manifest.extensions["com.openai"].review.demo_recording_url),
    dshArchiveIncluded: packages.some(item => item.target === "dsh"),
    fileHashes: [...contents].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: hash(bytes) })) };
  contents.set("review.json", json(result));
  await mkdir(output);
  for (const [path, bytes] of contents) {
    await mkdir(dirname(join(output, path)), { recursive: true });
    await writeFile(join(output, path), bytes, { flag: "wx" });
  }
  return join(output, "review.json");
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  const { values } = parseArgs({ options: { output: { type: "string" } } });
  void prepareGuilduoReview(undefined, values.output).then(console.log).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Review preparation failed");
    process.exitCode = 1;
  });
}

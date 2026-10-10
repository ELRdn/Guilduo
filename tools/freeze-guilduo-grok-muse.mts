import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { archiveGuilduoPlugin } from "./package-guilduo-plugins.mts";

export const candidateVersion = "0.6.0-beta.12";
export const candidateTargets = ["grok", "muse"] as const;
export type CandidateTarget = typeof candidateTargets[number];
const repository = fileURLToPath(new URL("../", import.meta.url));
export const digest = (value: Buffer): string => createHash("sha256").update(value).digest("hex");

async function regularFile(path: string): Promise<Buffer> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || await realpath(path) !== resolve(path)) {
    throw new Error(`Unsafe candidate file: ${path}`);
  }
  return readFile(path);
}

/** Closed whitelist: no profiles, credentials, hooks, executables or arbitrary user config. */
export async function validateGrokMuseSource(root: string, target: CandidateTarget, source?: string) {
  root = await realpath(root);
  if (!candidateTargets.includes(target)) throw new Error("Only Grok/Muse candidates are owned here");
  source = resolve(source ?? join(root, "plugins", `guilduo-${target}`));
  const skill = "skills/guilduo-workflows";
  const references = await readdir(join(root, skill, "references"));
  const common = ["LICENSE", "assets/guilduo-icon.png", `${skill}/SKILL.md`, `${skill}/agents/openai.yaml`,
    ...references.filter(name => name.endsWith(".md")).map(name => `${skill}/references/${name}`)];
  const allowed = new Set([...common, "README.md", "README.jp.md", ...(target === "grok"
    ? ["plugin.json", "mcp.json"] : [".muse-plugin/plugin.json", "settings.example.json"])]);
  const contents = new Map<string, Buffer>();
  async function inspect(directory: string): Promise<void> {
    if (await realpath(directory) !== resolve(directory) || !(await lstat(directory)).isDirectory()) {
      throw new Error("Linked candidate directory");
    }
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Linked candidate entry");
      if (entry.isDirectory()) await inspect(path);
      else {
        const name = relative(source!, path).replaceAll("\\", "/");
        if (!allowed.has(name)) throw new Error(`Unexpected candidate file: ${name}`);
        const bytes = await regularFile(path);
        if (!name.endsWith(".png") && /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}|\bBearer [A-Za-z0-9_.-]{24,}/.test(bytes.toString())) {
          throw new Error("Credential-like candidate content");
        }
        contents.set(name, bytes);
      }
    }
  }
  await inspect(source);
  if (contents.size !== allowed.size) throw new Error("Missing candidate whitelist file");
  for (const path of common) {
    const origin = path.startsWith("assets/") ? `plugins/questforge/${path}` : path;
    if (!contents.get(path)!.equals(await regularFile(join(root, origin)))) throw new Error(`Canonical byte mismatch: ${path}`);
  }
  const manifestPath = target === "grok" ? "plugin.json" : ".muse-plugin/plugin.json";
  const manifest = JSON.parse(contents.get(manifestPath)!.toString()) as Record<string, unknown>;
  if (manifest.name !== "guilduo-workflows" || manifest.version !== candidateVersion || manifest.license !== "AGPL-3.0-only"
    || manifest.hooks || manifest.apps || manifest.mcpServers) throw new Error("Invalid candidate manifest");
  if (target === "muse") {
    const capabilities = manifest.capabilities as Record<string, unknown>;
    if (manifest.schemaVersion !== 1 || JSON.stringify(capabilities) !== JSON.stringify({
      skills: [{ id: "guilduo-workflows", path: `${skill}/SKILL.md` }],
    })) throw new Error("Muse candidate must be native Skill only");
    const settings = JSON.parse(contents.get("settings.example.json")!.toString()) as unknown;
    if (JSON.stringify(settings) !== JSON.stringify({ schema_version: 1, mcpServers: {
      questforge: { transport: "streamable_http", url: "https://mcp.guilduo.com/mcp", enabled: true, mode: "optional" },
    } })) throw new Error("Invalid separate Muse user-settings example");
  } else {
    const mcp = JSON.parse(contents.get("mcp.json")!.toString()) as unknown;
    if (JSON.stringify(mcp) !== JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: { questforge: { type: "streamable-http", url: "https://mcp.guilduo.com/mcp" } },
    })) throw new Error("Invalid portable remote MCP");
  }
  for (const name of ["README.md", "README.jp.md"]) {
    const text = contents.get(name)!.toString();
    if (!text.includes(candidateVersion) || !text.includes("actingAgentId") || !text.includes("get_agent_link")
      || target === "muse" && (!text.includes("1.4.4-R5419.1") || text.includes("1.4.3-R5018.1"))) throw new Error("Stale candidate onboarding");
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const link = match[1]!;
      if (!link.startsWith("https://") && !allowed.has(link.split("#")[0]!)) throw new Error("Unsafe README link");
    }
  }
  return { source, contents, files: [...contents].sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => ({ path, sha256: digest(bytes) })) };
}

async function ownedWrite(root: string, path: string, data: string | Buffer): Promise<void> {
  // Check existing ancestors before creating anything; only the fixed QA output is writable.
  const absolute = resolve(path);
  const qa = resolve(root, ".qa-artifacts", "guilduo-next-hosts", "grok-muse", "frozen");
  if (!absolute.startsWith(qa + "\\") && !absolute.startsWith(qa + "/")) throw new Error("Outside owned freeze output");
  let parent = dirname(absolute);
  while (parent !== root) {
    const info = await lstat(parent).catch(error => { if (error.code === "ENOENT") return undefined; throw error; });
    if (info && (!info.isDirectory() || await realpath(parent) !== parent)) throw new Error("Linked freeze ancestor");
    const next = dirname(parent);
    if (next === parent) throw new Error("Outside repository");
    parent = next;
  }
  await mkdir(dirname(absolute), { recursive: true });
  const previous = await lstat(absolute).catch(error => { if (error.code === "ENOENT") return undefined; throw error; });
  if (previous && (!previous.isFile() || previous.nlink !== 1 || previous.isSymbolicLink())) throw new Error("Linked freeze file");
  await writeFile(absolute, data);
}

export async function freezeGrokMuse(root = repository) {
  root = await realpath(root);
  const packages = [];
  for (const target of candidateTargets) {
    const validated = await validateGrokMuseSource(root, target);
    const output = join(root, ".qa-artifacts", "guilduo-next-hosts", "grok-muse", "frozen", target);
    for (const [path, bytes] of validated.contents) await ownedWrite(root, join(output, "plugin", path), bytes);
    await ownedWrite(root, join(output, "validation.json"), JSON.stringify({ target, version: candidateVersion, hooks: false,
      connection: target === "muse" ? "user-settings" : "remote-mcp", files: validated.files,
      checks: { canonicalBytes: "passed", whitelist: "passed", links: "passed" }, liveAcceptance: "pending" }, null, 2) + "\n");
    const archive = await archiveGuilduoPlugin(output, target);
    // .NET Framework CreateFromDirectory on Windows can use backslashes in ZIP member names.
    // Re-encode only these owned candidates using the validated whitelist and explicit portable names.
    // The shared archive implementation remains the other owner's file; runtime/source bytes do not change.
    const portable = join(output, `.portable-${randomUUID()}.zip`);
    const archiveEnv: NodeJS.ProcessEnv = {};
    for (const key of ["PATH", "COMSPEC", "PATHEXT", "SystemRoot", "WINDIR"]) if (process.env[key]) archiveEnv[key] = process.env[key];
    Object.assign(archiveEnv, { GUILDUO_QA_MANIFEST: join(output, "validation.json"),
      GUILDUO_QA_SOURCE: join(output, "plugin"), GUILDUO_QA_OUTPUT: portable });
    try {
      execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; $files = (Get-Content -LiteralPath $env:GUILDUO_QA_MANIFEST -Raw | ConvertFrom-Json).files; $z = [System.IO.Compression.ZipFile]::Open($env:GUILDUO_QA_OUTPUT, [System.IO.Compression.ZipArchiveMode]::Create); try { foreach ($f in $files) { $entry = $z.CreateEntry($f.path, [System.IO.Compression.CompressionLevel]::Optimal); $entry.LastWriteTime = [DateTimeOffset]::Parse('2000-01-01T00:00:00+00:00'); $inputFile = [System.IO.File]::OpenRead((Join-Path $env:GUILDUO_QA_SOURCE $f.path)); $outputStream = $entry.Open(); try { $inputFile.CopyTo($outputStream) } finally { $inputFile.Dispose(); $outputStream.Dispose() } } } finally { $z.Dispose() }"],
        { env: archiveEnv, windowsHide: true, encoding: "utf8", timeout: 25_000 });
      const bytes = await regularFile(portable);
      await rename(portable, archive.path);
      archive.bytes = bytes.length;
      archive.sha256 = digest(bytes);
    } finally { await rm(portable, { force: true }); }
    packages.push({ ...archive, version: candidateVersion, source: relative(root, validated.source).replaceAll("\\", "/"),
      path: relative(root, archive.path).replaceAll("\\", "/"), hooks: false, portableZipMembers: true });
  }
  const report = { checkedAt: new Date().toISOString(), packages, published: false, submitted: false, modelCalls: 0 };
  await ownedWrite(root, join(root, ".qa-artifacts", "guilduo-next-hosts", "grok-muse", "frozen", "archives.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  void freezeGrokMuse().then(report => console.log(JSON.stringify(report, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
}

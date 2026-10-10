import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, readdir, realpath, rename, rm, writeFile, mkdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { prepareGuilduoPlugin, pluginTargets, type PluginTarget } from "./prepare-guilduo-plugin.mts";

type Validation = { target: PluginTarget; version: string; hooks: boolean; submission?: boolean; connection: string; files: { path: string; sha256: string }[] };
const hash = (data: Buffer): string => createHash("sha256").update(data).digest("hex");
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

async function checkPackageBoundary(plugin: string, validation: Validation, members: Set<string>, sourceRoot: string) {
  const { target, hooks, submission, connection } = validation;
  if (submission && (target !== 'openai' || hooks || connection !== 'remote-mcp')) throw new Error('Invalid submission boundary');
  if (target === 'grok' && hooks) throw new Error('Invalid Grok hook boundary');
  const manifestPath = target === 'openai' ? '.codex-plugin/plugin.json' : target === 'claude' ? '.claude-plugin/plugin.json'
    : target === 'muse' ? '.muse-plugin/plugin.json' : target === 'pi' ? 'package.json' : 'plugin.json';
  const jsonFile = async (path: string) => JSON.parse(await readFile(join(plugin, path), 'utf8'));
  const manifest = await jsonFile(manifestPath);
  if (manifest.name !== 'guilduo-workflows' || manifest.version !== validation.version || manifest.license !== 'AGPL-3.0-only') {
    throw new Error('Manifest identity differs from validation');
  }
  const expectedConnection = target === 'pi' || target === 'muse' ? 'user-settings'
    : target === 'openai' && manifest.apps !== undefined ? 'registered-app' : 'remote-mcp';
  if (connection !== expectedConnection) throw new Error('Connection differs from manifest');
  const common = ['LICENSE', 'assets/guilduo-icon.png', 'skills/guilduo-workflows/SKILL.md', 'skills/guilduo-workflows/agents/openai.yaml'];
  // Canonical source is explicit, so nested freeze outputs keep the same boundary.
  const references = join(sourceRoot, 'skills/guilduo-workflows/references');
  if (await realpath(references) !== references) throw new Error('Linked canonical references');
  for (const entry of await readdir(references, {withFileTypes:true})) if (entry.name.endsWith('.md')) {
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Invalid canonical reference');
    common.push(`skills/guilduo-workflows/references/${entry.name}`);
  }
  const allowed = new Set([...common, manifestPath]);
  if (!submission) allowed.add('README.md');
  // The approved bilingual Grok/Muse distributions have these extra data files.
  if ((target === 'grok' || target === 'muse') && members.has('README.jp.md')) allowed.add('README.jp.md');
  if (target === 'muse' && members.has('settings.example.json')) {
    allowed.add('settings.example.json');
    const settings = await jsonFile('settings.example.json');
    if (JSON.stringify(settings) !== JSON.stringify({schema_version:1,mcpServers:{questforge:{
      transport:'streamable_http',url:'https://mcp.guilduo.com/mcp',enabled:true,mode:'optional'}}})) throw new Error('Invalid Muse settings example');
  }
  if (target === 'openai') {
    if (manifest.mcpServers !== (connection === 'remote-mcp' ? './.mcp.json' : undefined)
      || manifest.apps !== (connection === 'registered-app' ? './.app.json' : undefined)
      || manifest.hooks !== (hooks ? './hooks/hooks.json' : undefined)) throw new Error('Invalid Codex manifest boundary');
    allowed.add(connection === 'registered-app' ? '.app.json' : '.mcp.json');
    if (connection === 'registered-app') {
      const app = await jsonFile('.app.json');
      if (Object.keys(app.apps ?? {}).join() !== 'guilduo' || !/^(?:plugin_)?asdk_app_[a-f0-9]{32}$/.test(app.apps.guilduo.id ?? '')) {
        throw new Error('Invalid registered App identity');
      }
    }
    if (submission) {
      allowed.add('plugin.json'); allowed.add('mcp.json');
      const portable = await jsonFile('plugin.json');
      if (portable.name !== manifest.name || portable.version !== manifest.version || portable.license !== manifest.license
        || portable.extensions?.['com.openai']?.apps !== undefined || portable.extensions?.['com.openai']?.hooks !== undefined) {
        throw new Error('Invalid public portable manifest');
      }
    }
  } else if (target === 'claude') {
    if (manifest.mcpServers !== './.mcp.json' || manifest.apps !== undefined || manifest.hooks !== undefined) throw new Error('Invalid Claude manifest boundary');
    allowed.add('.mcp.json');
  } else if (target === 'grok') {
    if (manifest.apps !== undefined || manifest.hooks !== undefined || manifest.extensions?.['com.openai']?.apps !== undefined
      || manifest.extensions?.['com.openai']?.hooks !== undefined) throw new Error('Invalid Grok manifest boundary');
    allowed.add('mcp.json');
  } else if (target === 'muse') {
    const declared = manifest.capabilities?.hooks;
    if (hooks ? !Array.isArray(declared) || declared.length !== 2 || declared[0]?.event !== 'SessionStart' || declared[1]?.event !== 'Stop'
      : declared !== undefined) throw new Error('Invalid Muse hook boundary');
  } else if (target === 'pi') {
    if (JSON.stringify(manifest.pi?.extensions) !== JSON.stringify(hooks ? ['./extensions/phase-sync.ts'] : undefined)) throw new Error('Invalid Pi hook boundary');
  }
  if (hooks) for (const path of target === 'pi' ? ['extensions/phase-sync.ts'] : target === 'muse'
    ? ['hooks/lifecycle.mjs', 'hooks/README.md', 'hooks/session-start.mjs', 'hooks/stop.mjs']
    : ['hooks/hooks.json', 'hooks/lifecycle.mjs', 'hooks/README.md']) allowed.add(path);
  if (members.size !== allowed.size || [...members].some(path => !allowed.has(path))) throw new Error('Package members do not match target metadata');
  for (const path of ['.mcp.json', 'mcp.json'].filter(path => allowed.has(path))) {
    const config = await jsonFile(path);
    const server = config.mcpServers?.questforge;
    if (Object.keys(config.mcpServers ?? {}).join() !== 'questforge' || server?.url !== 'https://mcp.guilduo.com/mcp') throw new Error('Invalid package MCP boundary');
  }
}

/** Archive only a generator-validated, unchanged staging tree; preserve the old archive on failure. */
export async function archiveGuilduoPlugin(output: string, target: PluginTarget, sourceRoot = repositoryRoot) {
  sourceRoot = await realpath(sourceRoot);
  output = resolve(output);
  if (await realpath(output) !== output) throw new Error("Linked package output");
  const metadata = join(output, 'validation.json');
  const info = await lstat(metadata);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 1024 * 1024
    || await realpath(metadata) !== metadata) throw new Error('Linked or invalid validation metadata');
  const validation = JSON.parse(await readFile(metadata, "utf8")) as Validation;
  if (!pluginTargets.includes(target) || validation.target !== target || typeof validation.hooks !== 'boolean'
    || (typeof validation.submission !== 'boolean' && !(target !== 'openai' && validation.submission === undefined))
    || typeof validation.connection !== 'string'
    || typeof validation.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(validation.version)
    || !Array.isArray(validation.files) || validation.files.some(file => typeof file?.path !== 'string'
      || !/^[a-f0-9]{64}$/.test(file.sha256))) throw new Error('Invalid package target metadata');
  const plugin = join(output, "plugin");
  const expected = new Map(validation.files.map(file => [file.path, file.sha256]));
  if (!expected.size || expected.size !== validation.files.length) throw new Error("Invalid package file manifest");
  if (!expected.has("skills/guilduo-workflows/SKILL.md")
    || [...expected.keys()].some(path => path.startsWith("skills/") && !path.startsWith("skills/guilduo-workflows/"))) throw new Error("Invalid canonical Skill archive paths");
  const seen = new Set<string>();
  const inspect = async (directory: string): Promise<void> => {
    if (await realpath(directory) !== directory) throw new Error("Linked package directory");
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Linked package file");
      if (entry.isDirectory()) await inspect(absolute);
      else {
        const path = absolute.slice(plugin.length + 1).replaceAll("\\", "/");
        if (!entry.isFile() || (await lstat(absolute)).nlink !== 1 || !expected.has(path)
          || hash(await readFile(absolute)) !== expected.get(path)) throw new Error("Package content differs from validation");
        seen.add(path);
      }
    }
  };
  await inspect(plugin);
  if (seen.size !== expected.size) throw new Error("Missing validated package files");
  await checkPackageBoundary(plugin, validation, seen, sourceRoot);
  const variant = target === "openai" ? validation.submission ? "openai" : validation.connection === "registered-app" ? "codex-app" : "codex" : target;
  const name = target === "pi" ? `guilduo-workflows-${validation.version}.tgz` : `guilduo-workflows-${variant}-${validation.version}.zip`;
  if (!/^guilduo-workflows-[0-9A-Za-z.-]+\.(tgz|zip)$/.test(name)) throw new Error("Invalid archive name");
  const destination = join(output, name);
  const previous = await lstat(destination).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
  if (previous && (!previous.isFile() || previous.isSymbolicLink() || previous.nlink !== 1)) throw new Error("Linked archive destination");
  const staging = join(output, `.archive-${randomUUID()}`);
  await mkdir(staging);
  try {
    const env = { ...process.env, GUILDUO_ARCHIVE_SOURCE: plugin, GUILDUO_ARCHIVE_OUTPUT: staging };
    let packed: string;
    if (target === "pi") {
      const args = ["pack", "--ignore-scripts", "--json", "--pack-destination", staging];
      const stdout = process.platform === "win32"
        ? execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
          "& npm.cmd pack --ignore-scripts --json --pack-destination $env:GUILDUO_ARCHIVE_OUTPUT; exit $LASTEXITCODE"], { cwd: plugin, env, encoding: "utf8", timeout: 60_000 })
        : execFileSync("npm", args, { cwd: plugin, env, encoding: "utf8", timeout: 60_000 });
      const info = (JSON.parse(stdout) as { filename: string; files: { path: string }[] }[])[0]!;
      if (info.filename !== name || info.files.length !== expected.size
        || info.files.some(file => !expected.has(file.path))) throw new Error("npm archive file manifest mismatch");
      packed = join(staging, name);
    } else {
      if (process.platform !== "win32") throw new Error("ZIP creation currently requires Windows native .NET compression");
      execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        ["Add-Type -AssemblyName System.IO.Compression -ErrorAction Stop",
          "Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop",
          "$taskSource = [IO.Path]::GetFullPath($env:GUILDUO_ARCHIVE_SOURCE).TrimEnd([char]92, [char]47)",
          "$taskZip = [IO.Compression.ZipFile]::Open((Join-Path $env:GUILDUO_ARCHIVE_OUTPUT 'guilduo-workflows.zip'), [IO.Compression.ZipArchiveMode]::Create)",
          "try { foreach ($taskFile in [IO.Directory]::GetFiles($taskSource, '*', [IO.SearchOption]::AllDirectories)) {",
          "$taskEntry = $taskFile.Substring($taskSource.Length + 1).Replace([char]92, [char]47)",
          "[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip, $taskFile, $taskEntry, [IO.Compression.CompressionLevel]::Optimal) | Out-Null",
          "} } finally { $taskZip.Dispose() }"].join("\n")], { env, encoding: "utf8", timeout: 60_000 });
      packed = join(staging, "guilduo-workflows.zip");
    }
    const bytes = await readFile(packed);
    await rename(packed, destination);
    return { target, path: destination, bytes: bytes.length, sha256: hash(bytes), files: expected.size, liveAcceptance: "pending" };
  } finally {
    // This literal child was created above inside the checked output; no shell deletion.
    await rm(staging, { recursive: true, force: true });
  }
}

export async function packageGuilduoPlugins(root = fileURLToPath(new URL("../", import.meta.url)), appId?: string) {
  const packages = [];
  const codex = await prepareGuilduoPlugin(appId, root, { target: "openai", hooks: true });
  packages.push({ ...(await archiveGuilduoPlugin(codex, "openai", root)), hooks: true, submission: false });
  const submission = await prepareGuilduoPlugin(undefined, root, { submission: true });
  packages.push({ ...(await archiveGuilduoPlugin(submission, "openai", root)), hooks: false, submission: true });
  const report = { generatedAt: new Date().toISOString(), packages, sourceHashesChecked: true,
    liveAcceptance: "pending", submitted: false, published: false };
  const reportPath = join(dirname(submission), "guilduo-plugin-packages.json");
  const info = await lstat(reportPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
  if (info && (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)) throw new Error("Linked package report");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  const { values } = parseArgs({ options: { "app-id": { type: "string" } } });
  void packageGuilduoPlugins(undefined, values["app-id"]).then(console.log).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, readdir, realpath, rename, rm, writeFile, mkdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { prepareGuilduoPlugin, pluginTargets, type PluginTarget } from "./prepare-guilduo-plugin.mts";

type Validation = { version: string; files: { path: string; sha256: string }[] };
const hash = (data: Buffer): string => createHash("sha256").update(data).digest("hex");

/** Archive only a generator-validated, unchanged staging tree; preserve the old archive on failure. */
export async function archiveGuilduoPlugin(output: string, target: PluginTarget) {
  output = resolve(output);
  if (await realpath(output) !== output) throw new Error("Linked package output");
  const validation = JSON.parse(await readFile(join(output, "validation.json"), "utf8")) as Validation;
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
  const name = target === "pi" ? `guilduo-workflows-${validation.version}.tgz` : "guilduo-workflows.zip";
  if (!/^guilduo-workflows(?:-[0-9A-Za-z.-]+\.tgz|\.zip)$/.test(name)) throw new Error("Invalid archive name");
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
        "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:GUILDUO_ARCHIVE_SOURCE, (Join-Path $env:GUILDUO_ARCHIVE_OUTPUT 'guilduo-workflows.zip'))"], { env, encoding: "utf8", timeout: 60_000 });
      packed = join(staging, name);
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
  for (const target of pluginTargets) {
    for (const hooks of target === "grok" ? [false] : [false, true]) {
      const output = await prepareGuilduoPlugin(target === "openai" && hooks ? appId : undefined, root, { target, hooks });
      packages.push({ ...(await archiveGuilduoPlugin(output, target)), hooks, submission: false });
    }
  }
  const submission = await prepareGuilduoPlugin(undefined, root, { submission: true });
  packages.push({ ...(await archiveGuilduoPlugin(submission, "openai")), hooks: false, submission: true });
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

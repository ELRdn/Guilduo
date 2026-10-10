import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { museQAEnvironment } from "./guilduo-muse-native-env.mts";
import { createMuseQAFile, replaceMuseQAFile } from "./guilduo-muse-safe-files.mts";
import { candidateVersion, digest } from "./freeze-guilduo-grok-muse.mts";

const repository = fileURLToPath(new URL("../", import.meta.url));
export const nativeVersion = "1.4.4-R5419.1";
export const nativeSHA256 = "5caacb02eea2734405786e50cb42aeea3eeb46b4fa9801cfa666cda225101749";
const owned = join(repository, ".qa-artifacts", "guilduo-next-hosts", "grok-muse");
const exe = join(owned, `native-${nativeVersion}`, "muse-x86-windows.exe");

/** Bounded CLI-only acceptance. Never run a turn, provider login, API/model, or personal profile. */
export async function verifyMuseNative(smokeOnly = false) {
  assert.equal(createHash("sha256").update(await readFile(exe)).digest("hex"), nativeSHA256);
  const profile = join(owned, `${smokeOnly ? "final-smoke" : "lifecycle"}-${randomUUID()}`);
  const environment = await museQAEnvironment(repository, profile);
  const settingsPath = join(profile, "config", "muse", "settings.json");
  const settingsBytes = Buffer.from(JSON.stringify({ schema_version: 1, mcpServers: {
    qa_unrelated: { transport: "streamable_http", url: "http://127.0.0.1:1/unrelated", enabled: false, mode: "optional" },
  } }, null, 2) + "\n");
  await createMuseQAFile(repository, settingsPath, settingsBytes);
  const logs: string[] = [];
  const settingsSerializationChanges: string[][] = [];
  async function command(args: string[], expected = 0) {
    assert(args[0] === "--version" || ["plugins", "skills", "mcp"].includes(args[0]!));
    if (args[0] === "mcp") assert(args[1] === "login" && args[2] === "qa_schema");
    const result = spawnSync(exe, args, { cwd: join(profile, "workspace"), env: environment,
      input: "", windowsHide: true, timeout: 25_000, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
    const path = join(profile, "logs", `${String(logs.length + 1).padStart(3, "0")}-${args[0]}-${args[1] ?? "version"}.json`);
    await createMuseQAFile(repository, path, JSON.stringify({ args, exitCode: result.status, signal: result.signal,
      error: result.error?.message ?? null, stdout: result.stdout, stderr: result.stderr }, null, 2) + "\n");
    logs.push(relative(repository, path).replaceAll("\\", "/"));
    assert.ifError(result.error);
    assert.equal(result.status, expected, `Native command failed: ${args.join(" ")} ${result.stderr}`);
    if (args[0] !== "mcp") {
      const current = await readFile(settingsPath);
      assert.deepEqual(JSON.parse(current.toString()), JSON.parse(settingsBytes.toString()), "Unrelated settings values changed");
      if (!current.equals(settingsBytes)) settingsSerializationChanges.push(args);
    }
    return { raw: result.stdout, stderr: result.stderr, json: () => JSON.parse(result.stdout) };
  }
  assert.match((await command(["--version"])).raw, /Muse Code 1\.4\.4 \(1\.4\.4-R5419\.1\)/);
  const archives = JSON.parse(await readFile(join(owned, "frozen", "archives.json"), "utf8"));
  const archive = archives.packages.find((value: { target: string }) => value.target === "muse");
  assert(archive && archive.version === candidateVersion);
  const zip = join(repository, archive.path);
  assert.equal(digest(await readFile(zip)), archive.sha256);
  const validation = JSON.parse(await readFile(join(owned, "frozen", "muse", "validation.json"), "utf8"));
  const extracted = join(profile, "archive-source");
  const zipEnvironment = { ...environment, GUILDUO_QA_ZIP: zip, GUILDUO_QA_DEST: extracted,
    GUILDUO_QA_MANIFEST: join(owned, "frozen", "muse", "validation.json") };
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem; $expected = (Get-Content -LiteralPath $env:GUILDUO_QA_MANIFEST -Raw | ConvertFrom-Json).files.path; $z = [System.IO.Compression.ZipFile]::OpenRead($env:GUILDUO_QA_ZIP); try { if ($z.Entries.Count -ne $expected.Count) { throw 'ZIP count mismatch' }; foreach ($e in $z.Entries) { if ($e.FullName.Replace('\\','/') -notin $expected) { throw 'Unexpected ZIP member' } } } finally { $z.Dispose() }; [System.IO.Compression.ZipFile]::ExtractToDirectory($env:GUILDUO_QA_ZIP, $env:GUILDUO_QA_DEST)"],
    { env: zipEnvironment, windowsHide: true, timeout: 25_000, encoding: "utf8" });
  for (const file of validation.files) assert.equal(digest(await readFile(join(extracted, file.path))), file.sha256);
  const valid = (await command(["plugins", "validate", extracted, "--json"])).json();
  assert.equal(valid.valid, true);
  assert.equal(valid.plugin.manifest_family, "native");
  assert.equal(valid.capabilities.hooks.length, 0);
  assert.equal(valid.capabilities.mcp_servers.length, 0);

  if (smokeOnly) {
    let installed = false;
    try {
      const result = (await command(["plugins", "install", extracted, "--json"])).json();
      installed = true;
      assert.equal(result.installed.version, candidateVersion);
      const inspection = (await command(["plugins", "inspect", "guilduo-workflows", "--json"])).json();
      assert.equal(inspection.active, true);
      assert.equal(inspection.plugin.manifest_family, "native");
      assert.equal(inspection.record.source.path.replace(/^\\\\\?\\/, ""), extracted);
      assert((await command(["skills", "list", "--source", "plugin", "--json"])).json().skills
        .some((skill: { id: string }) => skill.id === "plugin:guilduo-workflows:guilduo-workflows"));
    } finally {
      if (installed) await command(["plugins", "remove", "guilduo-workflows", "--delete-data", "--json"]);
    }
    assert.equal((await command(["plugins", "list", "--json"])).json().plugins.length, 0);
    for (const file of validation.files) assert.equal(digest(await readFile(join(extracted, file.path))), file.sha256);
    const receipt = { checkedAt: new Date().toISOString(), nativeVersion, nativeSHA256, candidateVersion,
      profile: relative(repository, profile).replaceAll("\\", "/"), archive: archive.path, archiveSHA256: archive.sha256,
      immutableZipMembersAndBytes: "passed", finalValidateInstallInspectDiscoveryRemove: "passed",
      finalPluginStoreEmpty: true, unrelatedSettingsValuesPreserved: true, modelCalls: 0, logs };
    await replaceMuseQAFile(repository, join(owned, "final-native-smoke-receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
    return receipt;
  }

  const sentinelSource = join(profile, "unrelated-plugin");
  await mkdir(join(sentinelSource, ".muse-plugin"), { recursive: true });
  await mkdir(join(sentinelSource, "skills", "qa-unrelated"), { recursive: true });
  await createMuseQAFile(repository, join(sentinelSource, ".muse-plugin", "plugin.json"), JSON.stringify({ schemaVersion: 1,
    name: "qa-unrelated", version: "1.0.0", description: "Unrelated offline QA sentinel", compat: { source: "native", manifestDir: ".muse-plugin" },
    capabilities: { skills: [{ id: "qa-unrelated", path: "skills/qa-unrelated/SKILL.md" }] } }));
  await createMuseQAFile(repository, join(sentinelSource, "skills", "qa-unrelated", "SKILL.md"), "---\nname: qa-unrelated\ndescription: Offline unrelated QA sentinel.\n---\n# Sentinel\n");
  await command(["plugins", "install", sentinelSource, "--json"]);
  const sentinel = (await command(["plugins", "inspect", "qa-unrelated", "--json"])).json();
  const mutableSource = join(profile, "update-fixture");
  await cp(extracted, mutableSource, { recursive: true });
  const manifestPath = join(mutableSource, ".muse-plugin", "plugin.json");
  const finalManifest = await readFile(manifestPath);
  const older = JSON.parse(finalManifest.toString());
  older.version = "0.6.0-beta.11";
  await replaceMuseQAFile(repository, manifestPath, JSON.stringify(older, null, 2) + "\n");
  let installed = false;
  try {
    const installation = (await command(["plugins", "install", mutableSource, "--json"])).json();
    installed = true;
    assert.equal(installation.installed.version, "0.6.0-beta.11");
    await replaceMuseQAFile(repository, manifestPath, finalManifest);
    const updated = (await command(["plugins", "update", "guilduo-workflows", "--json"])).json();
    assert.equal(updated.updated.version, candidateVersion);
    let inspected = (await command(["plugins", "inspect", "guilduo-workflows", "--json"])).json();
    assert.equal(inspected.active, true);
    assert.equal(inspected.record.version, candidateVersion);
    const skills = (await command(["skills", "list", "--source", "plugin", "--json"])).json();
    assert(skills.skills.some((skill: { id: string }) => skill.id === "plugin:guilduo-workflows:guilduo-workflows"));
    assert(skills.skills.some((skill: { id: string }) => skill.id === "plugin:qa-unrelated:qa-unrelated"));
    await command(["plugins", "disable", "guilduo-workflows", "--json"]);
    assert.equal((await command(["plugins", "inspect", "guilduo-workflows", "--json"])).json().active, false);
    const disabled = (await command(["skills", "list", "--source", "plugin", "--enabled-only", "--json"])).json();
    assert(!disabled.skills.some((skill: { id: string }) => skill.id === "plugin:guilduo-workflows:guilduo-workflows"));
    assert(disabled.skills.some((skill: { id: string }) => skill.id === "plugin:qa-unrelated:qa-unrelated"));
    await command(["plugins", "enable", "guilduo-workflows", "--json"]);
    assert.equal((await command(["plugins", "inspect", "guilduo-workflows", "--json"])).json().active, true);
    await command(["plugins", "remove", "guilduo-workflows", "--delete-data", "--json"]);
    installed = false;
    // Install the immutable extracted payload itself after the mutable upgrade fixture.
    const final = (await command(["plugins", "install", extracted, "--json"])).json();
    installed = true;
    assert.equal(final.installed.version, candidateVersion);
    inspected = (await command(["plugins", "inspect", "guilduo-workflows", "--json"])).json();
    assert.equal(inspected.active, true);
    assert.equal(inspected.record.version, candidateVersion);
    assert.equal(inspected.record.source.path.replace(/^\\\\\?\\/, ""), extracted);
    assert((await command(["skills", "list", "--source", "plugin", "--json"])).json().skills
      .some((skill: { id: string }) => skill.id === "plugin:guilduo-workflows:guilduo-workflows"));
  } finally {
    if (installed) await command(["plugins", "remove", "guilduo-workflows", "--delete-data", "--json"]);
  }
  const remaining = (await command(["plugins", "list", "--json"])).json();
  assert.equal(remaining.plugins.length, 1);
  assert.equal(remaining.plugins[0].record.id, "qa-unrelated");
  assert.deepEqual((await command(["plugins", "inspect", "qa-unrelated", "--json"])).json(), sentinel);
  // Alias parsing against a closed loopback port, never OAuth issuance or provider/model login.
  const schemaChecks = [];
  try { for (const spelling of ["mcpServers", "mcp_servers", "both", "invalid-mode"]) {
    const entry = { qa_schema: { transport: "streamable_http", url: "http://127.0.0.1:1/mcp", enabled: true,
      mode: spelling === "invalid-mode" ? "all" : "optional" } };
    const settings = spelling === "both" ? { schema_version: 1, mcpServers: entry, mcp_servers: entry }
      : { schema_version: 1, [spelling === "invalid-mode" ? "mcpServers" : spelling]: entry };
    await replaceMuseQAFile(repository, settingsPath, JSON.stringify(settings));
    const result = await command(["mcp", "login", "qa_schema", "--headless"], 1);
    const recognized = result.stderr.includes("OAuth HTTP request failed");
    assert.equal(recognized, spelling === "mcpServers" || spelling === "mcp_servers");
    if (!recognized) assert.match(result.stderr, /no MCP server named|MCP configuration is faulted/);
    schemaChecks.push({ spelling, recognized, oauthIssued: false });
  } } finally { await replaceMuseQAFile(repository, settingsPath, settingsBytes); }
  await command(["plugins", "remove", "qa-unrelated", "--delete-data", "--json"]);
  assert.equal((await command(["plugins", "list", "--json"])).json().plugins.length, 0);
  for (const file of validation.files) assert.equal(digest(await readFile(join(extracted, file.path))), file.sha256);
  const receipt = { checkedAt: new Date().toISOString(), nativeVersion, nativeSHA256, candidateVersion,
    profile: relative(repository, profile).replaceAll("\\", "/"), archive: archive.path, archiveSHA256: archive.sha256,
    zipMembersAndBytes: "passed", validateInstallDiscoveryUpdateDisableEnableRemove: "passed",
    upgradeFixture: "Synthetic beta.11 manifest on final Skill payload; not historical beta.11 acceptance",
    finalImmutablePayloadInstall: "passed", unrelatedPluginExactInspectionPreserved: true,
    unrelatedSettingsValuesPreserved: true, unrelatedSettingsBytesPreserved: settingsSerializationChanges.length === 0,
    settingsSerializationChanges, finalPluginStoreEmpty: true, schemaChecks,
    perCommandTimeoutMs: 25_000, automaticRetries: 0, modelCalls: 0, publicOAuth: "pending", logs };
  await replaceMuseQAFile(repository, join(owned, "native-lifecycle-receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  void verifyMuseNative(process.argv.includes("--smoke")).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
}

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { candidateTargets, digest, validateGrokMuseSource } from "./freeze-guilduo-grok-muse.mts";
import { museQAEnvironment } from "./guilduo-muse-native-env.mts";

const root = fileURLToPath(new URL("../", import.meta.url));
const owned = join(root, ".qa-artifacts", "guilduo-next-hosts", "grok-muse");
const report = JSON.parse(await readFile(join(owned, "frozen", "archives.json"), "utf8"));
const environment = await museQAEnvironment(root, join(owned, "zip-verification-profile"));
const results = [];
for (const target of candidateTargets) {
  const source = await validateGrokMuseSource(root, target);
  const archive = report.packages.find((value: { target: string }) => value.target === target);
  const path = join(root, archive.path);
  const bytes = await readFile(path);
  assert.equal(digest(bytes), archive.sha256);
  assert.equal(bytes.length, archive.bytes);
  const stdout = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem; $z = [System.IO.Compression.ZipFile]::OpenRead($env:GUILDUO_QA_ZIP); try { $files = @(foreach ($e in $z.Entries) { $s = $e.Open(); $h = [System.Security.Cryptography.SHA256]::Create(); try { @{path=$e.FullName; bytes=$e.Length; sha256=([BitConverter]::ToString($h.ComputeHash($s))).Replace('-','').ToLowerInvariant()} } finally { $s.Dispose(); $h.Dispose() } }); ConvertTo-Json -InputObject $files -Compress } finally { $z.Dispose() }"],
    { env: { ...environment, GUILDUO_QA_ZIP: path }, encoding: "utf8", windowsHide: true, timeout: 25_000, maxBuffer: 1024 * 1024 });
  const members = JSON.parse(stdout) as { path: string; sha256: string; bytes: number }[];
  assert.equal(members.length, source.files.length);
  assert.equal(new Set(members.map(member => member.path)).size, members.length);
  for (const member of members) {
    assert(!member.path.includes("\\"), "Portable ZIP member names must use forward slashes");
    assert(source.contents.has(member.path), `Unexpected ZIP member ${member.path}`);
    assert.equal(member.sha256, digest(source.contents.get(member.path)!));
    assert.equal(member.bytes, source.contents.get(member.path)!.length);
  }
  results.push({ target, path: archive.path, sha256: archive.sha256, bytes: bytes.length,
    memberCount: members.length, sourceBytes: "passed", canonicalSkillBytes: "passed", forwardSlashPaths: "passed", members });
}
const receipt = { checkedAt: new Date().toISOString(), results, published: false, submitted: false };
await writeFile(join(owned, "frozen", "byte-verification.json"), JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt, null, 2));

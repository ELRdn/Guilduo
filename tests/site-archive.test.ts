import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSiteArchiveSafe } from "../tools/check-site-archive.mts";
import { ASSET_RETENTION_MS, previousShellProbe } from "../tools/retain-site-assets.mts";

const now = Date.UTC(2026, 8, 21);
const origin = "https://app.example.test";
const oldName = "app-OldHash01.js", lazyName = "lazy-OldHash02.js", newName = "app-NewHash03.js";
const contents = { [oldName]: `import './${lazyName}'`, [lazyName]: "export default 1", [newName]: "new" };
const asset = (name: string, retiredAt: number | null) => ({ name, retiredAt,
  size: Buffer.byteLength(contents[name as keyof typeof contents]),
  sha256: createHash("sha256").update(contents[name as keyof typeof contents]).digest("hex"),
});
type Member = { name: string; text: string; link?: boolean };
const shell = (name: string) => `<html><head><script type="module" src="/assets/${name}"></script></head><body></body></html>`;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const oldProbe = () => previousShellProbe(shell(oldName), new URL(origin));
const manifest = () => ({ version: 1, generatedAt: now, assets: [asset(oldName, now), asset(lazyName, now), asset(newName, null)] });
const members = (): Member[] => [
  ...Object.entries(contents).map(([name, text]) => ({ name: `./assets/${name}`, text })),
  { name: "./assets/retained-releases.json", text: JSON.stringify(manifest()) },
  { name: "./next/relay-forge/index.html", text: shell(newName) },
  { name: "./deployment-check/previous-shell.html", text: oldProbe() },
  { name: "./deployment-check/previous-shell.json", text: JSON.stringify({ version: 1, capturedAt: now, sourcePath: "/next/relay-forge/", sourceSha256: sha(shell(oldName)), probeSha256: sha(oldProbe()) }) },
];
async function archive(t: { after: (fn: () => Promise<void>) => void }, entries: Member[]) {
  const directory = await mkdtemp(join(tmpdir(), "guilduo-archive-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "site.tar.gz");
  execFileSync(process.platform === "win32" ? "python" : "python3", ["-c", `
import io, json, sys, tarfile
with tarfile.open(sys.argv[1], 'w:gz') as tar:
    for item in json.loads(sys.argv[2]):
        info = tarfile.TarInfo(item['name'])
        data = item['text'].encode()
        if item.get('link'):
            info.type = tarfile.SYMTYPE
            info.linkname = '../outside'
            tar.addfile(info)
        else:
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
`, path, JSON.stringify(entries)], { timeout: 10000 });
  return path;
}
const server = (previous = { version: 1, generatedAt: now - 1000, assets: [asset(oldName, null), asset(lazyName, null)] }): typeof fetch => async (input, options) => {
  assert.equal(options?.headers, undefined);
  assert.equal(options?.redirect, "error");
  assert.equal(new URL(String(input)).origin, origin);
  return String(input).endsWith("retained-releases.json") ? Response.json(previous)
    : new Response(shell(oldName), { headers: { "content-type": "text/html" } });
};
const check = (path: string, fetcher = server()) => assertSiteArchiveSafe({ archive: path, siteUrl: origin, now, fetcher });

test("actual tar retains both the previous entry and its lazy imports", async t => {
  await check(await archive(t, members()));
});

test("missing, altered or falsely attributed previous HTML cannot pass archive verification", async t => {
  const missing = members().filter(m => !m.name.endsWith("previous-shell.html"));
  const altered = members().map(m => m.name.endsWith("previous-shell.html") ? { ...m, text: shell(newName) } : m);
  const forged = members().map(m => m.name.endsWith("previous-shell.json") ? { ...m, text: m.text.replace(sha(shell(oldName)), sha("unrelated")) } : m);
  for (const entries of [missing, altered, forged]) await assert.rejects(check(await archive(t, entries)), /previous-shell|Previous-shell/);
});

test("archive omissions and changed bytes cannot pass a valid manifest", async t => {
  for (const entries of [members().filter(m => !m.name.endsWith(lazyName)), members().map(m => m.name.endsWith(oldName) ? { ...m, text: "corrupt" } : m)]) {
    await assert.rejects(check(await archive(t, entries)), /missing or corrupted/);
  }
});

test("even a self-consistent replacement archive must retain published chunks", async t => {
  const next = manifest();
  next.assets = next.assets.filter(a => a.name !== lazyName);
  const entries = members().filter(m => !m.name.endsWith(lazyName)).map(m => m.name.endsWith(".json") ? { ...m, text: JSON.stringify(next) } : m);
  await assert.rejects(check(await archive(t, entries)), /required previous asset/);
});

test("stale rollback archives and altered retirement dates are rejected", async t => {
  for (const mode of ["stale", "retirement", "previous"]) {
    const next = manifest();
    if (mode === "stale") next.generatedAt = now - 3600001;
    if (mode === "retirement") next.assets[0].retiredAt = now - ASSET_RETENTION_MS;
    if (mode === "previous") next.generatedAt = now - 2000;
    const entries = members().map(m => m.name.endsWith(".json") ? { ...m, text: JSON.stringify(next) } : m);
    await assert.rejects(check(await archive(t, entries)), /stale|retirement|predates|Invalid/);
  }
});

test("untracked chunks and broken new-shell references are rejected", async t => {
  await assert.rejects(check(await archive(t, [...members(), { name: "assets/extra-Hash0001.js", text: "extra" }])), /untracked/);
  const entries = members().map(m => m.name.endsWith(".html") ? { ...m, text: shell("missing-Hash0001.js") } : m);
  await assert.rejects(check(await archive(t, entries)), /Shell references/);
});

test("unsafe tar paths, duplicates and links fail without extraction", async t => {
  for (const entry of [
    { name: "../outside", text: "bad" }, { name: "/absolute", text: "bad" },
    { name: "assets\\outside", text: "bad" }, { name: "./assets/app-OldHash01.js", text: "duplicate" },
    { name: "assets/link", text: "", link: true },
  ]) await assert.rejects(check(await archive(t, [...members(), entry])), /Command failed/);
});

test("missing public manifest and failed reads stop the actual upload path", async t => {
  const path = await archive(t, members());
  await assert.rejects(check(path, async () => new Response("fallback", { headers: { "content-type": "text/html" } })), /published retention/);
  await assert.rejects(check(path, async () => { throw new Error("offline"); }), /offline/);
  const script = await readFile("tools/deploy-appwrite-site.sh", "utf8");
  assert.ok(script.indexOf("check-site-archive.mts") < script.indexOf('while (( offset < total_size ))'));
  assert.match(script, /max_chunk_attempts=5/);
  assert.match(script, /for chunk_attempt in \$\(seq 1 "\$max_chunk_attempts"\)/);
  assert.match(script, /failed after \$chunk_attempt attempts/);
});

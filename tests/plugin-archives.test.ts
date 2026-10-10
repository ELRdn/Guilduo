import assert from "node:assert/strict";
import { cp, link, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareGuilduoPlugin } from "../tools/prepare-guilduo-plugin.mts";
import { archiveGuilduoPlugin } from "../tools/package-guilduo-plugins.mts";

test('archive rejects linked validation and contradictory target/connection/member metadata, retaining the prior ZIP', {skip:process.platform !== 'win32'}, async () => {
  const root = await mkdtemp(join(tmpdir(),'guilduo-archive-metadata-'));
  try {
    for (const path of ['LICENSE','plugins/questforge','skills/guilduo-workflows']) {
      await cp(new URL(`../${path}`,import.meta.url),join(root,path),{recursive:true});
    }
    const output = await prepareGuilduoPlugin(undefined,root,{submission:true});
    const archive = await archiveGuilduoPlugin(output,'openai',root);
    const previous = await readFile(archive.path);
    const metadata = join(output,'validation.json');
    const bytes = await readFile(metadata);
    const validation = JSON.parse(bytes.toString());
    const linkPath = join(root,'linked-validation.json');
    await link(metadata,linkPath);
    await assert.rejects(archiveGuilduoPlugin(output,'openai',root), /validation metadata/);
    await unlink(linkPath);
    await writeFile(linkPath,bytes); await unlink(metadata); await symlink(linkPath,metadata,'file');
    await assert.rejects(archiveGuilduoPlugin(output,'openai',root), /validation metadata/);
    await unlink(metadata); await writeFile(metadata,bytes);
    for (const mutation of [{target:'muse'},{connection:'registered-app'},{submission:false},{hooks:true},{version:'0.6.0-beta.999'}]) {
      await writeFile(metadata,JSON.stringify({...validation,...mutation}));
      await assert.rejects(archiveGuilduoPlugin(output,'openai',root));
      assert.deepEqual(await readFile(archive.path),previous);
    }
    await writeFile(metadata,bytes);
    await assert.rejects(archiveGuilduoPlugin(output,'muse',root), /target metadata/);
    const extra = join(output,'plugin/.env'); const extraBytes = Buffer.from('PRIVATE_SENTINEL'); await writeFile(extra,extraBytes);
    await writeFile(metadata,JSON.stringify({...validation,files:[...validation.files,{path:'.env',sha256:createHash('sha256').update(extraBytes).digest('hex')}]}));
    await assert.rejects(archiveGuilduoPlugin(output,'openai',root), /members do not match target metadata/);
    assert.deepEqual(await readFile(archive.path),previous);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test("OpenAI ZIP refuses drift before replacing an existing artifact", { skip: process.platform !== "win32" }, async () => {
  const root = await mkdtemp(join(tmpdir(), "guilduo-archive-"));
  try {
    for (const path of ["LICENSE", "plugins/questforge", "skills/guilduo-workflows"]) {
      await cp(new URL(`../${path}`, import.meta.url), join(root, path), { recursive: true });
    }
    const output = await prepareGuilduoPlugin(undefined, root, { submission: true });
    const archive = await archiveGuilduoPlugin(output, "openai", root);
    const previous = await readFile(archive.path);
    assert.ok(archive.files > 0);
    assert.equal(archive.liveAcceptance, "pending");
    const entries = execFileSync("tar", ["-tf", archive.path], { encoding: "utf8" }).trim().split(/\r?\n/);
    assert.equal(entries.length, archive.files);
    assert.ok(entries.every(path => !path.includes('\\') && !path.startsWith('/')));
    const rawEntries = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "Add-Type -AssemblyName System.IO.Compression.FileSystem; $taskZip = [IO.Compression.ZipFile]::OpenRead($env:GUILDUO_TEST_ZIP); try { ConvertTo-Json -Compress -InputObject @($taskZip.Entries | ForEach-Object { $_.FullName }) } finally { $taskZip.Dispose() }"],
    {encoding:'utf8',env:{...process.env,GUILDUO_TEST_ZIP:archive.path}})) as string[];
    assert.equal(rawEntries.length, archive.files);
    assert.ok(rawEntries.every(path => !path.includes('\\') && !path.startsWith('/')));
    assert.ok(entries.includes("skills/guilduo-workflows/SKILL.md"));
    assert.ok(!entries.some(path => path.includes("questforge-workflows")));
    const skill = execFileSync("tar", ["-xOf", archive.path, "skills/guilduo-workflows/SKILL.md"], { encoding: "utf8" });
    const manifest = JSON.parse(execFileSync("tar", ["-xOf", archive.path, "plugin.json"], { encoding: "utf8" }));
    assert.equal(manifest.name, "guilduo-workflows");
    assert.match(skill, /^---\r?\nname: guilduo-workflows\r?\n/);
    const validationPath = join(output, "validation.json");
    const validationBytes = await readFile(validationPath);
    const validation = JSON.parse(validationBytes.toString());
    const legacySkill = "skills/questforge-workflows/SKILL.md";
    const legacyBytes = Buffer.from("---\nname: questforge-workflows\n---\nOld Skill\n");
    await mkdir(join(output, "plugin", "skills", "questforge-workflows"));
    await writeFile(join(output, "plugin", legacySkill), legacyBytes);
    validation.files.push({ path: legacySkill, sha256: createHash("sha256").update(legacyBytes).digest("hex") });
    await writeFile(validationPath, JSON.stringify(validation));
    await assert.rejects(archiveGuilduoPlugin(output, "openai", root), /canonical Skill archive paths/);
    assert.deepEqual(await readFile(archive.path), previous);
    await rm(join(output, "plugin", "skills", "questforge-workflows"), { recursive: true });
    await writeFile(validationPath, validationBytes);
    await writeFile(join(output, "plugin", "LICENSE"), "unexpected drift");
    await assert.rejects(archiveGuilduoPlugin(output, "openai", root), /differs from validation/);
    assert.deepEqual(await readFile(archive.path), previous);
    await prepareGuilduoPlugin(undefined, root, { submission: true });
    await writeFile(join(output, "plugin", ".env"), "not distributable");
    await assert.rejects(archiveGuilduoPlugin(output, "openai", root), /differs from validation/);
    assert.deepEqual(await readFile(archive.path), previous);
  } finally { await rm(root, { recursive: true, force: true }); }
});

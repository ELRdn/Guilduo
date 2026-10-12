import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareGuilduoPlugin } from "../tools/prepare-guilduo-plugin.mts";
import { archiveGuilduoPlugin } from "../tools/package-guilduo-plugins.mts";

test("release archive refuses drift before replacing an existing artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "guilduo-archive-"));
  try {
    for (const path of ["LICENSE", "plugins/questforge", "skills/guilduo-workflows"]) {
      await cp(new URL(`../${path}`, import.meta.url), join(root, path), { recursive: true });
    }
    const output = await prepareGuilduoPlugin(undefined, root, { target: "pi" });
    const archive = await archiveGuilduoPlugin(output, "pi");
    const previous = await readFile(archive.path);
    assert.ok(archive.files > 0);
    assert.equal(archive.liveAcceptance, "pending");
    const entries = execFileSync("tar", ["-tf", archive.path], { encoding: "utf8" }).trim().split(/\r?\n/);
    assert.ok(entries.includes("package/skills/guilduo-workflows/SKILL.md"));
    assert.ok(!entries.some(path => path.includes("questforge-workflows")));
    const skill = execFileSync("tar", ["-xOf", archive.path, "package/skills/guilduo-workflows/SKILL.md"], { encoding: "utf8" });
    const manifest = JSON.parse(execFileSync("tar", ["-xOf", archive.path, "package/package.json"], { encoding: "utf8" }));
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
    await assert.rejects(archiveGuilduoPlugin(output, "pi"), /canonical Skill archive paths/);
    assert.deepEqual(await readFile(archive.path), previous);
    await rm(join(output, "plugin", "skills", "questforge-workflows"), { recursive: true });
    await writeFile(validationPath, validationBytes);
    await writeFile(join(output, "plugin", "LICENSE"), "unexpected drift");
    await assert.rejects(archiveGuilduoPlugin(output, "pi"), /differs from validation/);
    assert.deepEqual(await readFile(archive.path), previous);
    await prepareGuilduoPlugin(undefined, root, { target: "pi" });
    await writeFile(join(output, "plugin", ".env"), "not distributable");
    await assert.rejects(archiveGuilduoPlugin(output, "pi"), /differs from validation/);
    assert.deepEqual(await readFile(archive.path), previous);
  } finally { await rm(root, { recursive: true, force: true }); }
});

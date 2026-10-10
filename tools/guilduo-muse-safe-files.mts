import { randomUUID } from "node:crypto";
import { lstat, open, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

/** QA files only. Directory guards do not protect the final symlink/hardlink component. */
async function ownedPath(repository: string, path: string): Promise<string> {
  const root = await realpath(repository);
  const absolute = resolve(path);
  const inside = relative(resolve(root, ".qa-artifacts", "guilduo-next-hosts", "grok-muse"), absolute);
  if (!inside || isAbsolute(inside) || inside === ".." || inside.startsWith(`..${sep}`)) {
    throw new Error("Outside owned Grok/Muse QA files");
  }
  for (let parent = dirname(absolute); parent !== root; parent = dirname(parent)) {
    const info = await lstat(parent);
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(parent) !== parent) {
      throw new Error("Linked Muse QA file ancestor");
    }
    if (dirname(parent) === parent) throw new Error("Outside Muse QA repository");
  }
  return absolute;
}

export async function assertMuseQAFile(repository: string, path: string, allowMissing = true): Promise<void> {
  const absolute = await ownedPath(repository, path);
  const info = await lstat(absolute).catch(error => {
    if (allowMissing && error.code === "ENOENT") return undefined;
    throw error;
  });
  if (info && (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)) {
    throw new Error("Unsafe Muse QA file: links and non-regular files are refused");
  }
}

/** Prepare/new evidence must never replace an existing file, including a dangling link. */
export async function createMuseQAFile(repository: string, path: string, data: string | Buffer): Promise<void> {
  const absolute = await ownedPath(repository, path);
  await writeFile(absolute, data, { flag: "wx", mode: 0o600 });
}

/** Replace safe receipts without opening/truncating the old inode or following a final link. */
export async function replaceMuseQAFile(repository: string, path: string, data: string | Buffer): Promise<void> {
  const absolute = await ownedPath(repository, path);
  await assertMuseQAFile(repository, absolute);
  const temporary = `${absolute}.tmp-${randomUUID()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(data);
    await handle.close();
    await assertMuseQAFile(repository, temporary, false);
    await assertMuseQAFile(repository, absolute);
    // Same-directory rename replaces the directory entry; it never writes through its old target.
    await rename(temporary, absolute);
  } finally {
    await handle.close();
    await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
}

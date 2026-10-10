import { lstat, mkdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** Empty native profile: never inherit provider keys, host settings, or personal Skill roots. */
export async function museQAEnvironment(repository: string, profile: string): Promise<NodeJS.ProcessEnv> {
  repository = await realpath(repository);
  const qa = resolve(repository, ".qa-artifacts");
  profile = resolve(profile);
  const inside = relative(qa, profile);
  if (!inside || isAbsolute(inside) || inside.startsWith(`..${sep}`) || inside === ".." || resolve(qa, inside) !== profile) {
    throw new Error("Muse QA profile must be an owned child of .qa-artifacts");
  }
  const homes: Record<string, string> = { HOME: "home", USERPROFILE: "home", APPDATA: "appdata",
    LOCALAPPDATA: "localappdata", XDG_CONFIG_HOME: "config", XDG_DATA_HOME: "data",
    XDG_CACHE_HOME: "cache", TEMP: "temp", TMP: "temp", CODEX_HOME: "empty-codex" };
  async function checkDirectory(path: string): Promise<void> {
    for (let ancestor = path; ancestor !== repository; ancestor = dirname(ancestor)) {
      const info = await lstat(ancestor).catch(error => { if (error.code === "ENOENT") return undefined; throw error; });
      if (info && (!info.isDirectory() || info.isSymbolicLink() || await realpath(ancestor) !== ancestor)) {
        throw new Error("Linked Muse QA ancestor or directory");
      }
      if (dirname(ancestor) === ancestor) throw new Error("Outside Muse QA repository");
    }
  }
  const directories = [profile, ...[...new Set([...Object.values(homes), "workspace", "config/muse", "logs"])]
    .map(directory => join(profile, directory))];
  // Preflight every child and its ancestors before the first mkdir or caller settings write.
  for (const path of directories) await checkDirectory(path);
  for (const path of directories) {
    await checkDirectory(path);
    await mkdir(path, { recursive: true });
    await checkDirectory(path);
  }
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "COMSPEC", "PATHEXT", "SystemRoot", "WINDIR"]) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  for (const [key, directory] of Object.entries(homes)) {
    const path = join(profile, directory);
    environment[key] = path;
  }
  Object.assign(environment, { MUSE_AUTH_PATH: join(profile, "config", "unprovided-auth.json"),
    MUSE_LOGIN: "0", MUSE_NO_AUTO_UPDATE: "1" });
  return environment;
}

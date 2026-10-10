import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { museQAEnvironment } from "./guilduo-muse-native-env.mts";
import { digest, validateGrokMuseSource } from "./freeze-guilduo-grok-muse.mts";
import { nativeVersion, nativeSHA256 } from "./verify-guilduo-muse-native.mts";

// Parent/user operated OAuth-only path: never run a model, extract native tokens or import a personal profile.
const repository = fileURLToPath(new URL("../", import.meta.url));
const owned = join(repository, ".qa-artifacts", "guilduo-next-hosts", "grok-muse");
const profile = join(owned, `public-oauth-${nativeVersion}`);
const readyPath = join(profile, "ready.json");
const mode = process.argv[2];
assert(["prepare", "login", "login-headless", "logout"].includes(mode ?? ""), "Use prepare | login | login-headless | logout");
// Stable 1.4.4 does not open a browser from non-TTY login: it prints the URL and waits.
// Require the owner's visible terminal before any profile action. Never send OAuth output to a tool log.
if (mode === "login" || mode === "login-headless") {
  assert(process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY,
    "Run OAuth login only in your visible PowerShell/Windows Terminal, without redirection, tee or transcript. Native normal login asks Enter to open the browser; headless uses native protected input only.");
}
const exe = join(owned, `native-${nativeVersion}`, "muse-x86-windows.exe");
assert.equal(digest(await readFile(exe)), nativeSHA256);
const environment = await museQAEnvironment(repository, profile);
if (mode === "prepare") {
  const existing = await lstat(readyPath).catch(error => { if (error.code === "ENOENT") return undefined; throw error; });
  assert(!existing, "Public OAuth profile already prepared; do not overwrite its user-owned authorization");
  const source = await validateGrokMuseSource(repository, "muse");
  const settingsPath = join(profile, "config", "muse", "settings.json");
  await writeFile(settingsPath, await readFile(join(source.source, "settings.example.json")));
  const native = spawnSync(exe, ["plugins", "install", source.source, "--json"], {
    cwd: join(profile, "workspace"), env: environment, input: "", encoding: "utf8", windowsHide: true,
    timeout: 25_000, maxBuffer: 1024 * 1024,
  });
  assert.ifError(native.error);
  assert.equal(native.status, 0, native.stderr);
  const installed = JSON.parse(native.stdout);
  const ready = { preparedAt: new Date().toISOString(), nativeVersion, nativeSHA256,
    profile: relative(repository, profile).replaceAll("\\", "/"),
    settingsPath: relative(repository, settingsPath).replaceAll("\\", "/"),
    pluginVersion: installed.installed.version, publicEndpoint: "https://mcp.guilduo.com/mcp",
    nativeMCPServer: "questforge", callback: "native ephemeral loopback port", modelCalls: 0,
    publicOAuth: "pending-user-action", instruction: "Run login in your visible terminal and press Enter at the native browser prompt; callback is automatic loopback. Use login-headless only in a user-visible terminal; paste final redirect only into native protected input. No transcript or tee." };
  await writeFile(readyPath, JSON.stringify(ready, null, 2) + "\n");
  console.log(JSON.stringify(ready, null, 2));
} else {
  assert.equal(JSON.parse(await readFile(readyPath, "utf8")).nativeVersion, nativeVersion);
  // In a real terminal normal login asks Enter to open the browser, then handles the loopback callback.
  // Explicit headless fallback requires a user-visible terminal for protected redirect input.
  // Both login modes inherit only the owner's visible terminal; never tee or transcribe them.
  // This driver never buffers or serializes stdout/stderr, authorization codes, or token bytes.
  const args = mode === "logout" ? ["mcp", "logout", "questforge"]
    : ["mcp", "login", "questforge", ...(mode === "login-headless" ? ["--headless"] : [])];
  const child = spawn(exe, args, { cwd: join(profile, "workspace"), env: environment,
    stdio: "inherit", windowsHide: mode === "logout" });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, mode === "logout" ? 25_000 : 180_000);
  const cancel = () => { child.kill(); };
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  const [exitCode, signal] = await once(child, "close");
  clearTimeout(timer);
  process.removeListener("SIGINT", cancel);
  process.removeListener("SIGTERM", cancel);
  await writeFile(join(profile, `${mode}-receipt.json`), JSON.stringify({ checkedAt: new Date().toISOString(),
    mode, exitCode, signal, timedOut, nativeVersion, modelCalls: 0, secretsRecorded: false }, null, 2) + "\n");
  process.exitCode = timedOut || exitCode !== 0 ? 1 : 0;
}

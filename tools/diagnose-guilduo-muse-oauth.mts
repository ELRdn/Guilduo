import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { museQAEnvironment } from "./guilduo-muse-native-env.mts";
import { createMuseQAFile } from "./guilduo-muse-safe-files.mts";
import { digest } from "./freeze-guilduo-grok-muse.mts";
import { nativeVersion, nativeSHA256 } from "./verify-guilduo-muse-native.mts";

// Synthetic-only diagnostic: no public authorization, browser launch, codes, tokens or model.
const repository = fileURLToPath(new URL("../", import.meta.url));
const terminalInput = process.argv.includes("--terminal-input");
if (terminalInput) assert(process.stdin.isTTY, "Synthetic terminal comparison requires a real terminal");
const owned = join(repository, ".qa-artifacts", "guilduo-next-hosts", "grok-muse");
const profile = join(owned, `oauth-prompt-diagnostic-${Date.now()}`);
const exe = join(owned, `native-${nativeVersion}`, "muse-x86-windows.exe");
assert.equal(digest(await readFile(exe)), nativeSHA256);
const environment = await museQAEnvironment(repository, profile);
const counts = { resource: 0, metadata: 0, registration: 0, authorization: 0, token: 0 };
let origin = "";
const server = createServer((request, response) => {
  const path = new URL(request.url ?? "/", origin).pathname;
  response.setHeader("Content-Type", "application/json");
  if (path === "/mcp") {
    counts.resource++;
    response.writeHead(401, { "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"` });
    response.end("{}");
  } else if (path.startsWith("/.well-known/oauth-protected-resource")) {
    response.end(JSON.stringify({ resource: `${origin}/mcp`, authorization_servers: [origin] }));
  } else if (path === "/.well-known/oauth-authorization-server" || path === "/.well-known/openid-configuration") {
    counts.metadata++;
    response.end(JSON.stringify({ issuer: origin, authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`, registration_endpoint: `${origin}/register`,
      response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"] }));
  } else if (path === "/register") {
    counts.registration++;
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      const registration = JSON.parse(body);
      response.writeHead(201);
      response.end(JSON.stringify({ client_id: "synthetic-public-diagnostic", token_endpoint_auth_method: "none",
        redirect_uris: registration.redirect_uris, grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }));
    });
  } else {
    if (path === "/authorize") counts.authorization++;
    if (path === "/token") counts.token++;
    response.writeHead(400);
    response.end("{}");
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert(address && typeof address !== "string");
origin = `http://127.0.0.1:${address.port}`;
let child: ReturnType<typeof spawn> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
const observed = { authorizePagePrompt: false, enterToOpenBrowserPrompt: false, browserOpening: false,
  browserFailure: false, authorizationWaiting: false, loginFailure: false };
try {
  await createMuseQAFile(repository, join(profile, "config", "muse", "settings.json"), JSON.stringify({ schema_version: 1,
    mcpServers: { qa_diagnostic: { transport: "streamable_http", url: `${origin}/mcp`, enabled: true, mode: "optional" } } }));
  child = spawn(exe, ["mcp", "login", "qa_diagnostic"], { cwd: join(profile, "workspace"),
    env: environment, stdio: [terminalInput ? "inherit" : "pipe", "pipe", "pipe"], windowsHide: true });
  // Output stays in bounded memory; only allowlisted boolean classifications are persisted.
  let pending = "";
  const classify = (chunk: Buffer) => {
    pending = (pending + chunk.toString("utf8")).slice(-4096);
    observed.authorizePagePrompt ||= pending.includes("Open this page to authorize MCP server");
    observed.enterToOpenBrowserPrompt ||= pending.includes("Press Enter to open it in your browser");
    observed.browserOpening ||= pending.includes("Opening your browser");
    observed.browserFailure ||= pending.includes("Couldn't open a browser");
    observed.authorizationWaiting ||= pending.includes("Waiting for authorization");
    observed.loginFailure ||= /muse mcp login[^\n]*failed:/.test(pending);
    // Never send Enter: this diagnostic must not launch a browser or authorize anything.
    if (observed.enterToOpenBrowserPrompt || (!terminalInput && observed.authorizationWaiting)) child?.kill();
  };
  child.stdout!.on("data", classify);
  child.stderr!.on("data", classify);
  timer = setTimeout(() => child?.kill(), 15_000);
  const [exitCode, signal] = await once(child, "close");
  const receipt = { checkedAt: new Date().toISOString(), nativeVersion, kind: "synthetic-prompt-only",
    observed, requests: counts, exitCode, signal, terminalInput, inputSent: false, publicOAuthAttempted: false,
    secretsRecorded: false, modelCalls: 0 };
  await createMuseQAFile(repository, join(profile, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify(receipt));
  assert.equal(counts.authorization, 0);
  assert.equal(counts.token, 0);
  assert(observed.authorizePagePrompt, "Native authorization prompt was not established; do not retry public login");
  assert(terminalInput ? observed.enterToOpenBrowserPrompt : observed.authorizationWaiting,
    "Expected native terminal behavior was not established; do not retry public login");
} finally {
  if (timer) clearTimeout(timer);
  if (child && child.exitCode === null && child.signalCode === null) child.kill();
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}

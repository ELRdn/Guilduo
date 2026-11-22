import "../../interaction-lab/relay-forge/tokens.css";
import "../../interaction-lab/relay-forge/foundation.css";
import "../../interaction-lab/relay-forge/shell.css";
import "../../interaction-lab/relay-forge/primitives.css";
import "../../interaction-lab/relay-forge/mobile.css";
import "../../interaction-lab/relay-forge/screens/screens.css";
import "../../interaction-lab/relay-forge/screens/quests.css";
import "../../interaction-lab/relay-forge/screens/network.css";
import "../../interaction-lab/relay-forge/screens/party.css";
import "../../interaction-lab/relay-forge/screens/battle.css";
import "../../interaction-lab/relay-forge/screens/connections.css";
import "../../interaction-lab/relay-forge/screens/settings.css";
import "../../interaction-lab/relay-forge/screens/skills.css";
import "../../interaction-lab/relay-forge/screens/productivity.css";
import { QuestForgeRepository } from "../../interaction-lab/repository.ts";
import { createProductionRuntime } from "../../interaction-lab/relay-forge/production.ts";
import { mountRelayForge } from "../../interaction-lab/relay-forge/shell.ts";
import { setLocale } from "../../i18n.ts";
import { captureAcquisitionHandoff } from "../../launch-analytics-client.ts";

const params = new URLSearchParams(location.search);
if(globalThis.QuestForgeConfig?.analyticsEnabled===true)captureAcquisitionHandoff();
const baseUrl = params.get("api") || "";
if (new URL(baseUrl).hostname !== "127.0.0.1") throw new Error("This fixture only connects to an isolated local Worker.");
setLocale(params.get("lang") || "ja");
window.addEventListener("test:locale", event => setLocale((event as CustomEvent).detail));
const repository = new QuestForgeRepository({ baseUrl, getToken: async () => "local-relay-human-test-token" });
const runtime = await createProductionRuntime(repository, params.get("uid") || "");
if (params.has("dropWorkResponse")) {
  const productivity = repository.productivity.bind(repository);
  let dropped = false;
  repository.productivity = async <T = Record<string, unknown>>(path: string, input?: Record<string, unknown>, method = input ? "POST" : "GET"): Promise<T> => {
    const result = await productivity<T>(path, input, method);
    if (!dropped && path === "/notes" && method === "POST") { dropped = true; throw new Error("Isolated saved response loss"); }
    return result;
  };
}
const previewSync = runtime.connectionsPort!.previewSync.bind(runtime.connectionsPort);
window.addEventListener("test:connection-preview-failure", event => {
  runtime.connectionsPort!.previewSync = (event as CustomEvent).detail
    ? async () => { throw new Error("Isolated test rejection"); }
    : previewSync;
});
const root = document.querySelector<HTMLElement>("#relay-forge-root")!;
let unmount: () => void;
if (params.get("surface") === "afa") {
  await import("../../interaction-lab/all-for-adhd/styles.css");
  await import("../../interaction-lab/all-for-adhd/polish.css");
  await import("../../interaction-lab/all-for-adhd/forge-skin.css");
  const { mountAllFor } = await import("../../interaction-lab/all-for-adhd/app.ts");
  const unavailable = async (): Promise<never> => { throw new Error("Outside the Notes fixture."); };
  unmount = mountAllFor(root, {
    runtime, demo: false, self: () => ({ id: params.get("uid")!, label: "Fixture owner" }),
    agents: () => [], members: () => [], today: () => "2026-11-22", quests: () => runtime.quests,
    answer: unavailable, review: unavailable, activity: async () => [], registerAgent: unavailable, removeAgent: unavailable,
    mcp: { url: baseUrl + "/mcp", connections: async () => [], link: unavailable, revoke: unavailable },
    notifications: { load: unavailable, save: unavailable, device: async () => false, enable: unavailable, disable: unavailable, test: unavailable },
    create: unavailable, update: unavailable, complete: unavailable,
  });
} else {
  unmount = mountRelayForge(root, runtime);
}
window.addEventListener("test:unmount", () => { unmount(); root.replaceChildren("Signed out"); });

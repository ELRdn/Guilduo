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
import { QuestForgeRepository } from "../../interaction-lab/repository.ts";
import { createProductionRuntime } from "../../interaction-lab/relay-forge/production.ts";
import { mountRelayForge } from "../../interaction-lab/relay-forge/shell.ts";
import { setLocale } from "../../i18n.ts";

const params = new URLSearchParams(location.search);
const baseUrl = params.get("api") || "";
if (new URL(baseUrl).hostname !== "127.0.0.1") throw new Error("This fixture only connects to an isolated local Worker.");
setLocale(params.get("lang") || "ja");
window.addEventListener("test:locale", event => setLocale((event as CustomEvent).detail));
const repository = new QuestForgeRepository({ baseUrl, getToken: async () => "local-relay-human-test-token" });
const runtime = await createProductionRuntime(repository, params.get("uid") || "");
const previewSync = runtime.connectionsPort!.previewSync.bind(runtime.connectionsPort);
window.addEventListener("test:connection-preview-failure", event => {
  runtime.connectionsPort!.previewSync = (event as CustomEvent).detail
    ? async () => { throw new Error("Isolated test rejection"); }
    : previewSync;
});
const root = document.querySelector<HTMLElement>("#relay-forge-root")!;
const unmount = mountRelayForge(root, runtime);
window.addEventListener("test:unmount", () => { unmount(); root.replaceChildren("Signed out"); });

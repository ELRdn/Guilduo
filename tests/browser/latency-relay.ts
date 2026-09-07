import "../../interaction-lab/relay-forge/tokens.css";
import "../../interaction-lab/relay-forge/foundation.css";
import "../../interaction-lab/relay-forge/shell.css";
import "../../interaction-lab/relay-forge/primitives.css";
import "../../interaction-lab/relay-forge/mobile.css";
import "../../interaction-lab/relay-forge/screens/screens.css";
import "../../interaction-lab/relay-forge/screens/quests.css";
import "../../interaction-lab/relay-forge/screens/party.css";
import { QuestForgeRepository } from "../../interaction-lab/repository.ts";
import { createProductionRuntime } from "../../interaction-lab/relay-forge/production.ts";
import { mountRelayForge } from "../../interaction-lab/relay-forge/shell.ts";
import { createQuest, patchQuest } from "../../server/questforge-domain.ts";
import type { QuestForgeState } from "../../types/questforge.ts";

// Entirely synthetic, no network or persisted user data.
if (!["127.0.0.1", "localhost"].includes(location.hostname)) throw new Error("Local diagnostic fixture only");
const state = { schemaVersion: 7, tasks: [], taskEvents: [], syncEvents: [], rewardClaims: {}, character: { level: 1, hp: 50, maxHp: 50, xp: 0, nextXp: 100, gems: 0, ownedItems: [], equippedItems: [] }, battle: { mp: 0, maxMp: 80 } } as unknown as QuestForgeState;
createQuest(state, { kind: "todo", title: "遅延回帰テスト", nextAction: "変更前" });
let release!: () => void;
const gate = new Promise<void>(resolve => { release = resolve; });
let failOnce = new URLSearchParams(location.search).has("failure");
let releaseSave!: () => void;
const saveGate = new URLSearchParams(location.search).has("saving")
  ? new Promise<void>(resolve => { releaseSave = resolve; }) : Promise.resolve();
document.querySelector("#release-save")!.addEventListener("click", () => releaseSave?.());
document.querySelector("#release-panels")!.addEventListener("click", release);
class FixtureRepository extends QuestForgeRepository {
  override async request<T = Record<string, unknown>>(path: string, options: { method?: string; body?: string } = {}): Promise<T> {
    let result: unknown = {};
    if (path.startsWith("/v1/quests?")) result = { quests: structuredClone(state.tasks), total: state.tasks.length };
    else if (path.startsWith("/v1/quests/") && options.method === "PATCH") {
      await saveGate;
      result = { quest: patchQuest(state, decodeURIComponent(path.split("/").at(-1)!), JSON.parse(options.body || "{}")) };
    }
    else if (path === "/v1/profile") result = { profile: { uid: "latency-owner", displayName: "テストユーザー" } };
    else if (path.startsWith("/v1/agents")) result = { agents: [] };
    else if (path === "/v1/party") {
      await gate;
      if (failOnce) { failOnce = false; throw new Error("計測用の一時エラー"); }
      result = { party: { name: "読み込み済みのParty", members: [] } };
    } else if (path.startsWith("/v1/human-requests")) result = { quests: [], total: 0 };
    return result as T;
  }
}
const runtime = await createProductionRuntime(new FixtureRepository({ baseUrl: "http://127.0.0.1", getToken: async () => "synthetic" }), "latency-owner");
const root = document.querySelector<HTMLElement>("#relay-forge-root")!;
const unmount = mountRelayForge(root, { ...runtime, loadDeferred: async () => {
  const panels = await runtime.loadDeferred!();
  document.querySelector("#panel-status")!.textContent = "補助処理完了";
  return panels;
} });
document.querySelector("#dispose-shell")!.addEventListener("click", () => { unmount(); root.replaceChildren(); });

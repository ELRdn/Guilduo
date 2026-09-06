// This Vite-only fixture imports the real UI and domain. No network or persisted task writes.
import "../../interaction-lab/relay-forge/tokens.css";
import "../../interaction-lab/relay-forge/foundation.css";
import { humanInbox } from "../../interaction-lab/relay-forge/human-inbox.ts";
import { relayPreferences } from "../../interaction-lab/relay-forge/screens/relay-onboarding.ts";
import { relayText } from "../../interaction-lab/relay-forge/relay-copy.ts";
import { el } from "../../interaction-lab/relay-forge/primitives/dom.ts";
import { setLocale } from "../../i18n.ts";
import { createQuest, getQuest, migrateState } from "../../server/questforge-domain.ts";
import { requestHumanReview, respondHumanReview, listHumanRequests, type RelayContext } from "../../server/human-requests.ts";
import type { QuestForgeState } from "../../types/questforge.ts";

const params = new URLSearchParams(location.search);
setLocale(params.get("lang") || "ja");
document.documentElement.dataset.theme = params.get("theme") || "dark";
const state = migrateState({ schemaVersion: 7 } as QuestForgeState);
const human: RelayContext = { ownerId: "fixture-human", requester: { type: "human", id: "fixture-human", label: "Test Human" } };
const agent: RelayContext = { ownerId: "fixture-human", requester: { type: "agent", id: "fixture-agent", label: "My Coding Agent" } };
function requestRound(key: string) {
  const source = createQuest(state, { kind: "todo", title: `Mobile menu ${key}`, assignee: { type: "agent", id: "fixture-agent", label: "My Coding Agent", handoffState: "working" } }, { ...human, returnEvent: true }).quest;
  return requestHumanReview(state, source.id, { requestKey: key, title: `Mobile menu review ${key}`, reason: "Check the comfort of the touch targets on your phone.", checkTarget: "Open the menu, then close it with one hand.", completionCriteria: "Return text feedback about any difficulty.", artifactUrl: "https://example.test/preview", dryRun: false, expectedUpdatedAt: source.updatedAt }, agent).quest;
}
const first = requestRound("first");
let forcedError = "";
let calls = 0;
const root = document.querySelector<HTMLElement>("#relay-test")!;
root.style.padding = "20px";
const status = el("output", { id: "relay-test-status" });
status.style.display = "block";
status.style.overflowWrap = "anywhere";
const open = el("button", { type: "button", id: "relay-test-open" }, relayText("inbox"));
const report = () => {
  status.textContent = JSON.stringify({ calls, originalDone: getQuest(state, first.humanRequest!.sourceQuestId).quest.done, requests: state.tasks.filter((quest) => quest.humanRequest).map((quest) => ({ id: quest.id, status: quest.humanRequest?.status, response: quest.humanRequest?.response, done: quest.done })) });
};
const inbox = humanInbox({
  quests: state.tasks, onCount() {}, onSource(id) { status.textContent = `Source: ${id}`; }, onQuest() { report(); },
  port: {
    async listHumanRequests() { return structuredClone(listHumanRequests(state, { status: "all" })); },
    async respondHumanReview(id, input) {
      calls += 1;
      report();
      if (forcedError) {
        const code = forcedError; forcedError = "";
        throw Object.assign(new Error("Fixture error"), { code });
      }
      return structuredClone(respondHumanReview(state, id, input, human));
    },
  },
});
open.addEventListener("click", () => inbox.open(open, first.id));
root.append(el("h1", {}, "Local verification fixture"), el("p", {}, "Browser memory only. No real account, task, or external service is modified."), relayPreferences(), open, status, inbox.element);
for (const [id, code] of [["network", "network_error"], ["stale", "quest_conflict"]]) {
  const button = el("button", { type: "button", id: `relay-test-${id}` }, `Simulate ${id}`);
  button.addEventListener("click", () => { forcedError = code; });
  root.append(button);
}
const add = el("button", { type: "button", id: "relay-test-add" }, "Receive another request");
add.addEventListener("click", () => { requestRound(`round-${state.tasks.length}`); void inbox.refresh(true); report(); });
root.append(add);
report();

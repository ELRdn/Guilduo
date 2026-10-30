import { QuestForgeRepository } from "../../interaction-lab/repository.ts";
import { questImageEditor } from "../../interaction-lab/all-for-adhd/images.ts";
import { setLocale } from "../../i18n.ts";
import type { Quest } from "../../types/questforge.ts";
import type { AllForPort } from "../../interaction-lab/all-for-adhd/app.ts";

const params = new URL(location.href).searchParams;
const baseUrl = params.get("api") || "";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(baseUrl)) throw new Error("Local fixture only");
setLocale(params.get("lang") || "ja");
document.documentElement.dataset.theme = params.get("theme") || "light";
const repository = new QuestForgeRepository({ baseUrl, getToken: async () => "local-relay-human-test-token" });
const result = await repository.getQuest(params.get("quest") || "");
const quest = result.quest as Quest;
const response = params.get("context") === "response";
if (params.get("surface") === "decision") {
  const { mountAllFor } = await import("../../interaction-lab/all-for-adhd/app.ts");
  const source = quest.humanRequest ? (await repository.getQuest(quest.humanRequest.sourceQuestId)).quest as Quest : null;
  let quests = source ? [quest, source] : [quest];
  const unavailable = async (): Promise<never> => { throw new Error("Not part of the image fixture"); };
  const port: AllForPort = {
    demo: true, self: () => ({ id: "self", label: "Fixture Human" }), today: () => "2026-10-30", quests: () => quests,
    agents: () => [{ id: "review-agent", name: "Review Agent", role: "assistant", active: true, startState: "ready" }], members: () => [],
    images: repository.questImages(), activity: async () => [], create: unavailable, update: unavailable, complete: unavailable,
    refresh: async () => { quests = await Promise.all(quests.map(async item => (await repository.getQuest(item.id)).quest as Quest)); },
    answer: async (current, action, text, attachmentIds) => {
      const input = { action, response: text, attachmentIds, confirmed: true, expectedUpdatedAt: current.updatedAt };
      await repository.respondHumanReview(current.id, { ...input, dryRun: true });
      const saved = (await repository.respondHumanReview(current.id, { ...input, dryRun: false })).quest as Quest;
      quests = quests.map(item => item.id === saved.id ? saved : item); return saved;
    },
    review: unavailable, registerAgent: unavailable, removeAgent: unavailable,
    mcp: { url: baseUrl + "/mcp", connections: async () => [], link: unavailable, revoke: unavailable },
    notifications: { load: unavailable, save: unavailable, device: async () => false, enable: unavailable, disable: unavailable, test: unavailable },
  };
  const root = document.querySelector<HTMLElement>("#root")!; root.removeAttribute("style");
  const dispose = mountAllFor(root, port); window.addEventListener("pagehide", dispose);
} else {
const editor = questImageEditor(repository.questImages(), quest, response ? "response" : "reference");
const form = document.createElement("form");
const save = document.createElement("button"); save.textContent = "Save fixture"; save.className = "a4-button";
const status = document.createElement("p"); status.id = "fixture-status"; status.setAttribute("role", "status");
form.append(editor.element, save, status);
form.addEventListener("submit", event => {
  event.preventDefault(); save.disabled = true;
  void editor.save().then(async attachmentIds => {
    if (response) {
      const input = { action: "revise", response: "Please use the marked image.", attachmentIds, confirmed: true, expectedUpdatedAt: quest.updatedAt };
      await repository.respondHumanReview(quest.id, { ...input, dryRun: true });
      await repository.respondHumanReview(quest.id, { ...input, dryRun: false });
    }
    status.textContent = "Saved";
  }).catch(() => { status.textContent = "Failed; draft retained"; }).finally(() => { save.disabled = false; });
});
document.querySelector("#root")!.append(form);
window.addEventListener("pagehide", () => editor.dispose());
}

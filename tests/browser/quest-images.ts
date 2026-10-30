import { QuestForgeRepository } from "../../interaction-lab/repository.ts";
import { questImageEditor } from "../../interaction-lab/all-for-adhd/images.ts";
import { setLocale } from "../../i18n.ts";
import type { Quest } from "../../types/questforge.ts";

const params = new URL(location.href).searchParams;
const baseUrl = params.get("api") || "";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(baseUrl)) throw new Error("Local fixture only");
setLocale(params.get("lang") || "ja");
document.documentElement.dataset.theme = params.get("theme") || "light";
const repository = new QuestForgeRepository({ baseUrl, getToken: async () => "local-relay-human-test-token" });
const result = await repository.getQuest(params.get("quest") || "");
const quest = result.quest as Quest;
const response = params.get("context") === "response";
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

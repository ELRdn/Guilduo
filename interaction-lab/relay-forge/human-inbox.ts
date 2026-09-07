import type { Quest } from "../../types/questforge.ts";
import type { QuestForgeRepository } from "../repository.ts";
import { normalizeHumanRequest } from "../../shared/relay.ts";
import { el } from "./primitives/dom.ts";
import { relayText as t } from "./relay-copy.ts";
import { relaySuccess } from "./relay-motion.ts";
import "./human-inbox.css";

type Status = "pending" | "deferred" | "answered";
type Action = "seen" | "defer" | "resume" | "approve" | "revise";
type Port = Pick<QuestForgeRepository, "listHumanRequests" | "respondHumanReview">;
interface Draft { text: string; checked: boolean; version: string; }
interface Options {
  quests: readonly Quest[];
  port: Port | null;
  onQuest: (quest: Quest) => void;
  onSource: (questId: string) => void;
  onCount: (pending: number, unread: number) => void;
}

export function humanInbox(options: Options) {
  let requests = options.quests.filter((quest) => quest.humanRequest);
  let filter: Status = "pending";
  let busy = false;
  let loading = false;
  let needsRender = false;
  let disposed = false;
  let trigger: HTMLElement | null = null;
  const drafts = new Map<string, Draft>();
  const expanded = new Set<string>();
  const dialog = el("dialog", { class: "rf-human-inbox", "aria-labelledby": "rf-human-inbox-title" });
  const notice = el("p", { class: "rf-human-inbox-notice", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  const filters = el("div", { class: "rf-human-inbox-filters", role: "group", "aria-label": t("inbox") });
  const list = el("div", { class: "rf-human-inbox-list" });
  const hint = el("p", {}, t("hint"));
  const close = button(t("close"), () => dialog.close());
  const refreshButton = button(t("refresh"), () => { void refresh(true); });
  dialog.append(el("header", {}, el("h2", { id: "rf-human-inbox-title" }, t("inbox")), close), hint, filters, el("div", {}, refreshButton), notice, list);
  dialog.addEventListener("close", () => trigger?.focus());
  dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });

  function button(label: string, run: () => void, disabled = false) {
    const element = el("button", { type: "button", disabled }, label);
    element.addEventListener("click", run);
    return element;
  }

  function draftFor(quest: Quest): Draft {
    let draft = drafts.get(quest.id);
    if (!draft) { draft = { text: "", checked: false, version: quest.updatedAt }; drafts.set(quest.id, draft); }
    if (draft.version !== quest.updatedAt) { draft.checked = false; draft.version = quest.updatedAt; }
    return draft;
  }

  function counts() {
    options.onCount(requests.filter((quest) => quest.humanRequest?.status === "pending").length, requests.filter((quest) => quest.humanRequest?.status !== "answered" && !quest.humanRequest?.seenAt).length);
  }

  function render() {
    dialog.querySelector("h2")!.textContent = t("inbox");
    close.textContent = t("close");
    refreshButton.textContent = t("refresh");
    hint.textContent = t("hint");
    filters.setAttribute("aria-label", t("inbox"));
    counts();
    filters.replaceChildren(...(["pending", "deferred", "answered"] as const).map((status) => {
      const count = requests.filter((quest) => quest.humanRequest?.status === status).length;
      const tab = button(`${t(status)} · ${count}`, () => { filter = status; render(); filters.querySelector<HTMLButtonElement>(`[data-status="${status}"]`)?.focus(); }, busy);
      tab.dataset.status = status;
      tab.setAttribute("aria-pressed", String(filter === status));
      return tab;
    }));
    refreshButton.disabled = busy || loading || !options.port;
    const visible = requests.filter((quest) => quest.humanRequest?.status === filter).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    list.replaceChildren(...(visible.length ? visible.map(card) : [el("p", { class: "rf-human-inbox-empty" }, t("empty"))]));
    if (!options.port) notice.textContent = t("demo");
  }

  function card(quest: Quest): HTMLElement {
    const request = quest.humanRequest!;
    const details = el("details", { class: "rf-human-request", "data-request-id": quest.id });
    details.open = expanded.has(quest.id);
    details.addEventListener("toggle", () => { if (details.open) expanded.add(quest.id); else expanded.delete(quest.id); });
    const status = request.status === "answered" ? t(request.outcome === "approved" ? "approved" : "changes_requested") : !request.seenAt ? t("new") : t("seen");
    details.append(el("summary", {}, el("strong", {}, quest.title), el("span", { class: "rf-human-request-state" }, status)));
    const body = el("div", { class: "rf-human-request-body" });
    body.append(el("p", { class: "rf-human-request-author" }, `${t("from")}: ${quest.requester?.label || t("unknown")}`));
    for (const [label, value] of [[t("reason"), request.reason], [t("target"), request.checkTarget], [t("criteria"), quest.completionCriteria]]) {
      body.append(el("h3", {}, label), el("p", { class: "rf-human-request-text" }, value));
    }
    const source = button(t("source"), () => { dialog.close(); options.onSource(request.sourceQuestId); });
    body.append(source);
    if (safeExternal(request.artifactUrl)) body.append(el("a", { href: request.artifactUrl, target: "_blank", rel: "noopener noreferrer", class: "rf-human-external" }, t("external"), " ↗"));
    body.append(el("p", { class: "rf-human-request-separate" }, t("separate")));
    if (request.status === "answered") {
      body.append(el("p", { class: "rf-human-request-text" }, request.response || t("approved")), el("time", { datetime: request.respondedAt }, new Date(request.respondedAt).toLocaleString()));
    } else if (request.status === "deferred") {
      body.append(button(t("resume"), () => { void respond(quest, "resume"); }, busy || !options.port));
    } else {
      const draft = draftFor(quest);
      const checked = el("input", { type: "checkbox", disabled: busy || !options.port });
      checked.checked = draft.checked;
      const field = el("textarea", { rows: 4, maxlength: 2000, disabled: busy || !options.port });
      field.value = draft.text;
      const approve = button(t("approve"), () => { void respond(quest, "approve"); });
      const revise = button(t("revise"), () => { void respond(quest, "revise"); });
      const syncButtons = () => {
        approve.disabled = busy || !options.port || !draft.checked;
        revise.disabled = busy || !options.port || !draft.checked || !draft.text.trim();
      };
      checked.addEventListener("change", () => { draft.checked = checked.checked; syncButtons(); });
      field.addEventListener("input", () => { draft.text = field.value; syncButtons(); });
      syncButtons();
      body.append(el("label", { class: "rf-human-request-check" }, checked, t("checked")), el("label", { class: "rf-human-request-feedback" }, t("feedback"), field));
      body.append(el("div", { class: "rf-human-request-actions" }, approve, revise, button(t("defer"), () => { void respond(quest, "defer"); }, busy || !options.port), !request.seenAt ? button(t("markSeen"), () => { void respond(quest, "seen"); }, busy || !options.port) : null));
    }
    details.append(body);
    return details;
  }

  async function respond(quest: Quest, action: Action) {
    if (busy || !options.port) return;
    const draft = draftFor(quest);
    if ((action === "approve" || action === "revise") && (!draft.checked || (action === "revise" && !draft.text.trim()))) return;
    busy = true;
    notice.textContent = t("sending");
    const input = { action, response: draft.text, confirmed: draft.checked, expectedUpdatedAt: quest.updatedAt };
    render();
    try {
      await options.port.respondHumanReview(quest.id, { ...input, dryRun: true });
      const response = await options.port.respondHumanReview(quest.id, { ...input, dryRun: false });
      const saved = responseQuest(response.quest, quest.id);
      if (disposed) return;
      requests = requests.map((item) => item.id === saved.id ? saved : item);
      options.onQuest(saved);
      if (saved.humanRequest?.status === "answered") drafts.delete(saved.id);
      notice.textContent = t(action === "defer" ? "deferredSaved" : action === "resume" ? "resumed" : action === "seen" ? "seen" : "saved");
      if ((action === "approve" || action === "revise") && !response.reused) relaySuccess(notice);
    } catch (error) {
      if (disposed) return;
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      notice.textContent = t(code === "quest_conflict" || code === "human_request_answered" ? "stale" : code === "human_response_required" || code === "insufficient_scope" ? "permission" : "failed");
      if (code === "quest_conflict" || code === "human_request_answered") draft.checked = false;
    } finally {
      busy = false;
      if (!disposed) { render(); notice.tabIndex = -1; notice.focus(); }
    }
  }

  async function refresh(explicit = false) {
    if (!options.port || busy || loading || disposed || document.hidden) return;
    loading = true;
    refreshButton.disabled = true;
    try {
      const result = await options.port.listHumanRequests("all");
      if (disposed) return;
      if (!Array.isArray(result.quests)) throw new Error("Invalid request list");
      const next = result.quests.map((quest) => responseQuest(quest));
      const previous = new Set(requests.map((quest) => quest.id));
      const additions = next.filter((quest) => !previous.has(quest.id) && quest.humanRequest?.status === "pending");
      const changed = JSON.stringify(next) !== JSON.stringify(requests);
      requests = next;
      needsRender ||= changed;
      counts();
      if (additions.length) notice.textContent = `${t("new")}: ${additions.length}`;
      // Refresh counts while the user interacts, without removing the focused
      // input, action, summary, or filter from the DOM.
      const interacting = dialog.open && (list.contains(document.activeElement) || filters.contains(document.activeElement));
      if (explicit || (needsRender && !interacting)) { render(); needsRender = false; }
    } catch {
      if (!disposed && explicit) notice.textContent = t("failed");
    } finally { loading = false; if (!disposed) refreshButton.disabled = busy || !options.port; }
  }

  const onFocus = () => { void refresh(); };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onFocus);
  const interval = window.setInterval(onFocus, 30000);
  render();
  return {
    element: dialog,
    open(origin?: HTMLElement, questId?: string) {
      if (questId) {
        const quest = requests.find((item) => item.id === questId);
        if (quest?.humanRequest) { filter = quest.humanRequest.status; expanded.add(questId); }
      }
      trigger = origin || document.activeElement as HTMLElement | null;
      render();
      if (!dialog.open) dialog.showModal();
      const target = questId ? Array.from(list.querySelectorAll<HTMLElement>("[data-request-id]")).find((card) => card.dataset.requestId === questId)?.querySelector<HTMLElement>("summary") : null;
      (target || close).focus();
      void refresh();
    },
    refresh,
    destroy() { disposed = true; window.clearInterval(interval); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); dialog.remove(); },
  };
}

export function safeExternal(value: string): boolean {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}

function responseQuest(value: unknown, expectedId?: string): Quest {
  if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string" || (expectedId && value.id !== expectedId) || !("humanRequest" in value) || !normalizeHumanRequest(value.humanRequest)) throw new Error("Invalid human request response");
  return value as Quest;
}

/**
 * All for ADHD — a calmer Guilduo surface.
 *
 * Same Quests, Agents and API as Relay Forge; only the UI differs. Each screen
 * offers one primary action, capture is a single field on every screen, time is
 * shown rather than typed, and destructive or committing actions get an undo
 * window instead of a confirmation dialog. Japanese-only while prototyping.
 */

import { createElement, Sun, Moon, CalendarDays, ListTodo, Users, Settings, Plus, Play, Clock3, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Repeat2, MessageSquare, Check, Search, MoreHorizontal, Flag, X, Pause, TriangleAlert, GripVertical, type IconNode } from "lucide";
import type { CharacterState, Quest } from "../../types/questforge.ts";
import { el, replaceChildren, svg } from "../relay-forge/primitives/dom.ts";
import { celebrate } from "./celebrate.ts";
import { getLocale, setLocale, LOCALE_METADATA, SUPPORTED_LOCALES } from "../../i18n.ts";
import { tx } from "./copy.ts";
import { questImageEditor, type QuestImagePort } from "./images.ts";
import { normalizeProfileRecord, type RelayForgeRuntime } from "../relay-forge/production.ts";
import { resizeAvatarImage } from "../relay-forge/primitives/image-resize.ts";
import { productivityWorkspace } from "../relay-forge/screens/productivity.ts";
import { createBillingUi } from "../relay-forge/screens/billing.ts";
import { createAnalyticsUi } from "../relay-forge/screens/analytics.ts";
import { billingView } from "./billing-view.ts";
import { forgeScreens, type ForgeScreen } from "./forge.ts";
import { parseCapture, isBig } from "./capture.ts";
import { iconChoices, iconFor } from "./emoji.ts";
import { forDay, agentSummary, addDays, AGENT_STATE, blockers, stepsOf, AGENT_STATE_ORDER, clock, dayPlan, DEFAULT_BLOCK, endOf, ESTIMATES, fitForGap, freeAhead, habitDays, proposalFor, groups, onDay, isOpen, isWorking, minutesLabel, needsDecision, nextCandidates, plannedMinutes, toMinutes, weekOf, type Bucket } from "./model.ts";

export interface AllForAgent {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly active: boolean;
  readonly reviewRequired?: boolean;
  /** Handoff state a Quest enters when given to this Agent. */
  readonly startState: string;
}

export type RequestAnswer = "approve" | "revise" | "defer" | "resume";

/** One Agent's turn in a relay; `check` puts your confirmation before the next turn. */
export interface RelayLeg { readonly agentId: string; readonly ask: string; readonly check: boolean }
export interface Relay { readonly legs: readonly RelayLeg[]; readonly at: number }

/** A Guilduo activity event (`/v1/events`); `source` is "mcp" when an Agent acted. */
export interface AllForActivity { readonly id: string; readonly at: string; readonly type: string; readonly questId: string; readonly source: string; readonly details: Record<string, unknown> }
export interface AllForConnection { readonly clientId: string; readonly clientName: string; readonly lastUsedAt: string; readonly authorized: boolean; readonly agentIds: readonly string[] }
export interface NotifySettings { readonly before: number; readonly atStart: boolean; readonly summary: string; readonly review: boolean; readonly proposal: boolean; readonly report: boolean }
export interface AgentDraft { readonly agentId: string; readonly displayName: string; readonly role: string; readonly instructions: string; readonly allowedScopes: readonly string[]; readonly reviewRequired: boolean }

export interface AllForPort {
  readonly demo: boolean;
  readonly self: () => { readonly id: string; readonly label: string };
  readonly agents: () => readonly AllForAgent[];
  readonly members: () => readonly { readonly id: string; readonly name: string; readonly owner: boolean }[];
  /** Answers a review request; the server validates with a dry run before writing. */
  answer(quest: Quest, action: RequestAnswer, response: string, attachmentIds?: string[]): Promise<Quest>;
  readonly images?: QuestImagePort;
  /** Accepts an Agent's finished work, or sends it back with a note. Dry run first. */
  review(quest: Quest, accept: boolean, note: string): Promise<Quest>;
  /** Sequential relays share the Quest's server-protected current holder and stage history. */
  readonly relay?: { get(id: string): Relay | null; set(quest: Quest, legs: readonly RelayLeg[]): Promise<Quest> };
  /** Data changed outside this UI (the demo's simulated Agents). */
  subscribe?(listener: () => void): () => void;
  activity(): Promise<readonly AllForActivity[]>;
  registerAgent(input: AgentDraft): Promise<AllForAgent>;
  /** Archives an Agent (Relay Forge's delete); its tasks keep their history. */
  removeAgent(agentId: string): Promise<void>;
  readonly mcp: {
    readonly url: string;
    connections(): Promise<readonly AllForConnection[]>;
    /** Sets which Agents a client acts as; an empty list unlinks it. */
    link(connection: AllForConnection, agentIds: readonly string[]): Promise<void>;
    /** Signs the client out of Guilduo; it must authorize again to reconnect. */
    revoke(connection: AllForConnection): Promise<void>;
  };
  /** Web Push: what to hear about, and whether this browser receives it. */
  readonly notifications: {
    load(): Promise<{ readonly settings: NotifySettings; readonly devices: number }>;
    save(settings: NotifySettings): Promise<NotifySettings>;
    device(): Promise<boolean>;
    /** Subscribes this browser (permission already granted) and stores the settings with it. */
    enable(settings: NotifySettings): Promise<NotifySettings>;
    disable(): Promise<void>;
    /** Sends a test notification to every device; the count of devices it reached. */
    test(): Promise<number>;
  };
  readonly today: () => string;
  readonly quests: () => readonly Quest[];
  create(input: Record<string, unknown>): Promise<Quest>;
  update(quest: Quest, patch: Record<string, unknown>): Promise<Quest>;
  complete(quest: Quest): Promise<{ quest: Quest; character: CharacterState | null }>;
  refresh?(): Promise<void>;
  readonly signOut?: () => Promise<void>;
  /** Relay Forge services reused as-is for calendar, notes, time and plan. Absent in the demo. */
  readonly runtime?: RelayForgeRuntime;
}

type Extra = "profile" | "billing" | Exclude<ForgeScreen, "list">;
type View = "now" | "plan" | "all" | "guild" | "settings" | Extra;
const VIEWS: readonly { id: View; label: string }[] = [
  { id: "now", label: tx("今日") },
  { id: "plan", label: tx("カレンダー") },
  { id: "all", label: tx("タスク") },
  { id: "guild", label: tx("ギルド") },
  { id: "settings", label: tx("設定") },
];
/** The rest of Relay Forge, reached from Settings so the five tabs stay calm. */
const EXTRAS: readonly { id: Extra; label: string; hint: string }[] = [
  { id: "profile", label: tx("プロフィール"), hint: tx("表示名・ユーザー名・ひとこと") },
  { id: "network", label: tx("つながり"), hint: tx("止まっているタスクと、その理由が分かります") },
  { id: "battle", label: tx("バトル"), hint: tx("終えたタスクで戦うゲーム") },
  { id: "connections", label: tx("連携"), hint: tx("Google などの外部サービスと同期") },
  { id: "skills", label: tx("スキル"), hint: tx("Agentが使えるMCPツールの一覧") },
  { id: "billing", label: tx("利用プラン"), hint: tx("利用プランと支払い") },
];
const FORGE: readonly Extra[] = ["network", "battle", "connections", "skills"];
const isExtra = (view: View): view is Extra => EXTRAS.some(item => item.id === view);
const UNDO_MS = 5000;
// The language is fixed for a page load; changing it in Settings reloads the page.
const LOCALE = getLocale();
// The Web App root may serve this page, so a relative link would miss Relay Forge.
const RELAY_FORGE_URL = location.pathname.startsWith("/interaction-lab/") ? "../relay-forge/" : "/next/relay-forge/";
const dayLabel = new Intl.DateTimeFormat(LOCALE, { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" });
const weekdayLabel = new Intl.DateTimeFormat(LOCALE, { weekday: "short", timeZone: "UTC" });
const monthLabel = new Intl.DateTimeFormat(LOCALE, { year: "numeric", month: "long", timeZone: "UTC" });
const dateLabel = new Intl.DateTimeFormat(LOCALE, { month: "long", day: "numeric", timeZone: "UTC" });
const weekdayLong = new Intl.DateTimeFormat(LOCALE, { weekday: "long", timeZone: "UTC" });
const shortDateLabel = new Intl.DateTimeFormat(LOCALE, { month: "numeric", day: "numeric", timeZone: "UTC" });
const noon = (date: string) => new Date(`${date}T12:00:00Z`);
const shortDate = (date: string) => shortDateLabel.format(noon(date));
/** Week grid scale: pixels per minute. */
const GRID_PX = 64 / 60;
/** Side-by-side cards per overlap in the week grid before the rest fold away. */
const MAX_LANES = 2;
const MONTH_PILLS = 2;
const store = {
  get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string | null): void { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage is a convenience */ } },
};

export function mountAllFor(root: HTMLElement, port: AllForPort): () => void {
  // "#today" is the previous name of the plan view.
  const viewFromHash = (): View => location.hash === "#today" ? "plan" : [...VIEWS, ...EXTRAS].find(v => location.hash === `#${v.id}`)?.id ?? "now";
  let view: View = viewFromHash();
  let viewUrl = location.href;
  let focusId: string | null = null;
  let planDate = port.today();
  // Guild: which decision is shown, whether "please fix" is open, and what was typed.
  let decisionId: string | null = new URL(location.href).searchParams.get("quest");
  let reviseFor: string | null = null;
  const confirmed = new Set<string>();
  let activity: readonly AllForActivity[] | null = null;
  let activityLoading = false, activityError = false;
  let connections: readonly AllForConnection[] | null = null;
  let connectionsLoading = false, connectionsError = false;
  let notify: { settings: NotifySettings; device: boolean } | null = null;
  let notifyLoading = false, notifyError = false;
  const linkDrafts = new Map<string, string[]>();
  let memberOpen = "";
  let settingsPage: "" | "notify" | "mcp" | "time" | "analytics" = "";
  let revokingClient: string | null = null;
  let profile: RelayForgeRuntime["profile"] = null;
  let avatarSrc = "";
  let avatarFor = 0;
  // Folded step lists stay open across rerenders.
  const openFolds = new Set<string>();
  let search = "";
  const replies = new Map<string, string>();
  type PlanMode = "day" | "week" | "month";
  const storedPlanMode = store.get("a4-plan-mode");
  let planMode: PlanMode = storedPlanMode === "week" || storedPlanMode === "month" ? storedPlanMode : "day";
  let sheet: HTMLDialogElement | null = null;
  let closeSheet: ((after?: () => void) => void) | null = null;
  let sheetDirty: (() => boolean) | null = null;
  let refreshError = false;
  let repaintSheet: (() => void) | null = null;
  // Free stretches the person chose to rest in, and later stretches whose suggestions were opened (this session only).
  let workOpen = false;
  // The Now card's task, for the S shortcut.
  let focusQuest: Quest | null = null;
  // Relay Forge's detailed views live inside the tab they belong to.
  let allMode: "list" | "board" | "gantt" | "table" | "notes" = "list";
  let boardAll = false;
  let boardCol = 0;
  let busy = false;
  let game = store.get("a4-game") !== "off";
  let cheer = store.get("a4-cheer") !== "off";
  // Confetti starts where the person tapped; keyboard use falls back to the focused control.
  let lastPointer = { x: 0, y: 0, at: 0 };
  const onPointer = (event: PointerEvent) => { lastPointer = { x: event.clientX, y: event.clientY, at: Date.now() }; };
  let disposed = false;
  const reviewImageEditors = new Map<string, ReturnType<typeof questImageEditor>>();
  const reviewImageGalleries = new Map<string, ReturnType<typeof questImageEditor>>();
  // Completions wait out the undo window before they are sent: the undo timer while waiting, 0 while the
  // save is in flight. They stay hidden until the server answers, so the old copy never flashes back.
  const pending = new Map<string, number>();
  let toastTimer = 0;

  const quests = () => port.quests().filter(q => !pending.has(q.id)).map(q => forDay(q, port.today()));
  const displayQuests = () => port.quests().map(q => pending.has(q.id) ? { ...q, done: true, lastCompletedDate: port.today() } : q);
  const glyph = (icon: IconNode) => createElement(icon, { width: 18, height: 18, "stroke-width": 1.75, "aria-hidden": "true" });

  // Relay Forge's own calendar, notes, time and plan modules, so nothing is lost by switching.
  const runtime = port.runtime;
  const workUi = productivityWorkspace({
    port: runtime?.productivityPort, knowledgePort: runtime?.knowledgePort, quests: port.quests, held: () => busy,
    refresh: () => render(),
    navigate: (screen, id) => {
      if (screen === "calendar") { planMode = "month"; go("plan"); return; }
      allMode = screen === "notes" ? "notes" : "list";
      go("all");
      if (screen === "quests" && id) { const quest = port.quests().find(q => q.id === id); if (quest) openSheet(quest); }
    },
    schedule: (id, date, time, minutes) => {
      const quest = port.quests().find(q => q.id === id);
      if (quest) update(quest, { scheduledDate: date, scheduledTime: time, estimatedMinutes: minutes, planningState: "scheduled", planningMode: "on_date" }, tx("予定に入れました"), previousPlan(quest));
    },
  });
  const billingUi = createBillingUi({
    port: runtime?.billingPort ?? null,
    agents: () => (runtime?.agents ?? []).filter(agent => agent.status !== "archived").map(agent => ({
      agentId: agent.agentId, displayName: agent.displayName, status: agent.status ?? "active",
      role: agent.role ?? "", provider: agent.provider ?? "", allowedScopes: agent.allowedScopes,
    })),
    quests: port.quests, render: () => render(), alive: () => !disposed, writeLocked: () => busy,
    refreshWorkspace: async () => { await port.refresh?.(); },
  });
  const billingPage = billingView(billingUi.api, () => render(), message => say(message));
  const forge = runtime ? forgeScreens({
    runtime: () => port.runtime!, quests: port.quests, busy: () => busy, render: () => render(),
    announce: message => say(message),
    openQuest: id => { const quest = port.quests().find(q => q.id === id); if (quest) openSheet(quest); },
    navigate: screen => {
      if (screen === "list") { allMode = "table"; go("all"); }
      else if (screen === "calendar") { planMode = "month"; go("plan"); } else go(screen);
    },
    refresh: async () => { await port.refresh?.(); },
    workTime: quest => workUi.totals(quest),
    relatedNotes: id => workUi.relatedNotes(id),
    openMcpSettings: () => { settingsPage = "mcp"; go("settings"); },
  }) : null;
  if (runtime) void workUi.load();
  const analyticsUi = createAnalyticsUi({ port: runtime?.analyticsPort ?? null, render: () => render(), alive: () => !disposed });
  const byId = (id: string | null) => (id === null ? null : port.quests().find(q => q.id === id) ?? null);

  const toast = el("div", { class: "a4-toast", role: "status", "aria-live": "polite", hidden: true });
  const main = el("main", { class: "a4-main", id: "a4-main", tabindex: -1 });
  const dockHost = el("div", { class: "a4-dock-host" });
  const nav = el("nav", { class: "a4-tabs", "aria-label": tx("画面") });
  const captureInput = el("input", { class: "a4-capture-input", type: "text", name: "title", placeholder: tx("例：明日15時 30分 画面案を見比べる"), "aria-label": tx("やることを書き出す"), autocomplete: "off", enterkeyhint: "done", maxlength: 200 });
  const captureToday = el("button", { type: "button", class: "a4-chip", "aria-pressed": "false" }, tx("今日やる"));
  const captureParse = el("p", { class: "a4-parse", id: "a4-parse", "aria-live": "polite" });
  captureInput.setAttribute("aria-describedby", "a4-parse");
  const captureError = el("p", { class: "a4-save-error", role: "alert", hidden: true });
  const captureAdded = el("ul", { class: "a4-capture-added", "aria-live": "polite" });
  const captureForm = el("form", { class: "a4-capture" }, captureInput, captureParse, captureError,
    el("div", { class: "a4-capture-row" }, captureToday, el("button", { type: "submit", class: "a4-button a4-primary" }, tx("追加する"))), captureAdded);
  let added: { quest: Quest; where: string; agent: AllForAgent | null }[] = [];
  function paintAdded(): void {
    replaceChildren(captureAdded, ...added.map((item, index) => {
      const last = index === added.length - 1;
      const agent = item.agent;
      return el("li", {}, glyph(Check), el("span", {}, item.quest.icon ? item.quest.icon + " " : "", item.quest.title, " · ", item.where),
        // Tasks cannot be deleted, so undo puts the new one away and hands its text back.
        last ? button(tx("元に戻す"), () => {
          void run(async () => {
            await port.update(item.quest, { lifecycleState: "archived" });
            added = added.filter(other => other !== item);
            if (!captureInput.value.trim()) captureInput.value = item.quest.title;
            paintAdded(); paintParse(); captureInput.focus();
          }, tx("元に戻せませんでした"));
        }, "link") : null,
        last && agent ? button(tx("{name}にステップに分けてもらう", { name: agent.name }), () => { askToSplit(item.quest, agent); item.agent = null; paintAdded(); }) : null);
    }));
  }
  const addButton = el("button", { type: "button", class: "a4-button a4-top-add" }, glyph(Plus), tx("タスクを追加"));
  const mobileAdd = el("button", { type: "button", class: "a4-mobile-add", "aria-label": tx("タスクを追加") }, glyph(Plus));
  const isDark = () => document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  const themeButton = el("button", { type: "button", class: "a4-icon-button", "aria-label": tx("表示テーマ") }, glyph(isDark() ? Sun : Moon));
  themeButton.addEventListener("click", () => {
    const dark = isDark();
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    store.set("qf-relay-forge-theme", dark ? "light" : "dark");
    replaceChildren(themeButton, glyph(dark ? Moon : Sun));
    paintThemeColor();
  });
  const breadcrumb = el("span", { class: "a4-breadcrumb" });
  const header = el("header", { class: "a4-top" }, el("span", { class: "a4-top-brand" }, "Guilduo"), breadcrumb, el("div", { class: "a4-top-actions" }, themeButton, addButton));
  const brand = el("a", { class: "a4-brand", href: "#now" },
    el("img", { src: "/assets/brand/guilduo-mark-ink.svg", class: "a4-brand-light", alt: "", width: 19, height: 26 }),
    el("img", { src: "/assets/brand/guilduo-mark-gold.svg", class: "a4-brand-dark", alt: "", width: 19, height: 26 }), "Guilduo");
  brand.addEventListener("click", event => { event.preventDefault(); go("now"); });
  const rail = el("aside", { class: "a4-rail" }, brand, nav,
    el("div", { class: "a4-profile" }, el("span", { class: "a4-avatar", "aria-hidden": "true" }, port.self().label.slice(0, 2)),
      el("span", { class: "a4-profile-copy" }, el("strong", {}, port.self().label), el("small", {}, tx("個人ワークスペース")))));
  const banner = port.demo ? el("p", { class: "a4-demo" }, el("span", {}, tx("デモです。変更は保存されません。")), el("a", { href: location.pathname }, tx("Googleでサインイン"))) : null;
  replaceChildren(root, el("div", { class: "a4-app" }, banner, rail, header, main, mobileAdd, dockHost, toast));
  let captureDialog: HTMLDialogElement | null = null;
  function openCapture(): void {
    if (sheet) { closeSheet?.(openCapture); return; }
    if (captureDialog?.open) { captureInput.focus(); return; }
    const opener = document.activeElement;
    const close = el("button", { type: "button", class: "a4-icon-button", "aria-label": tx("閉じる") }, glyph(X));
    const dialog = el("dialog", { class: "a4-capture-dialog a4-add-dialog", "aria-label": tx("タスクを追加") },
      el("div", { class: "a4-sheet-head" }, el("h2", { class: "a4-subtitle" }, tx("タスクを追加")), close), captureForm);
    close.addEventListener("click", () => { if (!busy) dialog.close(); });
    dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
    dialog.addEventListener("close", () => { dialog.remove(); captureDialog = null; added = []; captureError.hidden = true; paintAdded(); paintParse(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); });
    captureDialog = dialog;
    document.body.append(dialog);
    dialog.showModal();
    captureInput.focus();
  }
  function addOn(date: string, time = ""): void {
    openCapture();
    captureInput.value = `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日 ${time ? time + " " : ""}`;
    paintParse();
  }
  addButton.addEventListener("click", openCapture);
  mobileAdd.addEventListener("click", openCapture);

  captureToday.addEventListener("click", () => captureToday.setAttribute("aria-pressed", String(captureToday.getAttribute("aria-pressed") !== "true")));
  // A dated line wins over the "今日やる" toggle; time alone means today.
  const readCapture = () => {
    const parsed = parseCapture(captureInput.value, port.today(), LOCALE);
    const date = parsed.date || (parsed.time || captureToday.getAttribute("aria-pressed") === "true" ? port.today() : "");
    return { ...parsed, date };
  };
  const paintParse = () => {
    const parsed = readCapture();
    const read = parsed.date !== (captureToday.getAttribute("aria-pressed") === "true" ? port.today() : "") || parsed.time || parsed.minutes || parsed.tags.length > 0;
    if (!captureInput.value.trim() || !read) { captureParse.textContent = !captureInput.value.trim() && added.length ? tx("空のままEnterで閉じます。") : ""; return; }
    const day = !parsed.date ? tx("受け箱") : parsed.date === port.today() ? tx("今日") : parsed.date === addDays(port.today(), 1) ? tx("明日") : dayLabel.format(noon(parsed.date));
    const when = parsed.time ? `${parsed.time}${parsed.minutes ? `–${clock(toMinutes(parsed.time) + parsed.minutes)}` : ""}` : "";
    replaceChildren(captureParse, iconFor(parsed.title) ? `${iconFor(parsed.title)} ` : "", el("b", {}, parsed.title), " · ",
      [day, when, parsed.minutes ? tx("目安 {time}", { time: minutesLabel(parsed.minutes) }) : "", ...parsed.tags.map((tag: string) => `#${tag}`)].filter(Boolean).join(" · "));
  };
  captureInput.addEventListener("input", paintParse);
  captureToday.addEventListener("click", paintParse);
  captureForm.addEventListener("submit", event => {
    event.preventDefault();
    if (busy) return;
    if (!captureInput.value.trim()) { captureDialog?.close(); return; }
    const parsed = readCapture();
    const icon = iconFor(parsed.title);
    captureError.hidden = true;
    void run(async () => {
      let created: Quest;
      try {
        created = await port.create({
          kind: "todo", title: parsed.title.slice(0, 80), notes: "", difficulty: "medium", impact: "medium", lifecycleState: "active",
          nextAction: "", estimatedMinutes: parsed.minutes, dueDate: "", tags: parsed.tags, icon, iconSource: icon ? "auto" : "",
          scheduledDate: parsed.date, scheduledTime: parsed.time, planningMode: "on_date", planningState: parsed.date ? "scheduled" : "backlog",
        });
      } catch {
        // The dialog covers the toast, so the failure is said here and the line stays as typed.
        captureError.textContent = tx("追加できませんでした。入力は残しています。"); captureError.hidden = false;
        return;
      }
      const day = !parsed.date ? tx("受け箱") : parsed.date === port.today() ? tx("今日") : parsed.date === addDays(port.today(), 1) ? tx("明日") : dayLabel.format(noon(parsed.date));
      // Big work is easier to start in steps; one tap asks an Agent to split it through the usual handoff.
      const agent = port.agents().find(item => item.active) ?? null;
      added.push({ quest: created, where: [day, parsed.time].filter(Boolean).join(" "), agent: agent && isBig(parsed.title, parsed.minutes) ? agent : null });
      captureInput.value = "";
      captureToday.setAttribute("aria-pressed", "false");
      paintAdded(); paintParse();
      if (captureDialog?.open) captureInput.focus(); else say(tx("追加しました"));
    }, tx("追加できませんでした。入力は残しています。"));
  });

  function askToSplit(quest: Quest, agent: AllForAgent): void {
    update(quest, {
      assignee: { type: "agent", id: agent.id, label: agent.name, handoffState: agent.startState || "ready" },
      handoff: { ...quest.handoff, note: tx("ステップに分けて、各ステップに目安と絵文字を付けてください。終わったら私に戻してください。") },
    }, tx("{name} に渡しました", { name: agent.name }));
  }

  let toastRest = 0;
  const hideToast = () => { window.clearTimeout(toastTimer); toast.hidden = true; };
  const armToast = () => { window.clearTimeout(toastTimer); if (toastRest > 0) toastTimer = window.setTimeout(() => { toast.hidden = true; }, toastRest); };
  for (const type of ["pointerenter", "focusin"] as const) toast.addEventListener(type, () => window.clearTimeout(toastTimer));
  for (const type of ["pointerleave", "focusout"] as const) toast.addEventListener(type, () => { if (!toast.hidden) armToast(); });
  function say(message: string, undo?: () => void, actionLabel = tx("元に戻す"), sticky = false): void {
    replaceChildren(toast, sticky ? glyph(TriangleAlert) : null, el("span", {}, message), undo ? (() => {
      const button = el("button", { type: "button", class: "a4-link" }, actionLabel);
      button.addEventListener("click", () => { hideToast(); undo(); });
      return button;
    })() : null, sticky ? (() => {
      const close = el("button", { type: "button", class: "a4-icon-button", "aria-label": tx("閉じる") }, glyph(X));
      close.addEventListener("click", hideToast);
      return close;
    })() : null);
    toast.dataset.sticky = String(sticky);
    toast.hidden = false;
    toastRest = sticky ? 0 : undo ? UNDO_MS : 3000;
    armToast();
  }

  async function run(action: () => Promise<void>, failure: string): Promise<void> {
    if (busy) return;
    busy = true;
    render();
    try { await action(); }
    catch { say(failure); }
    finally { busy = false; if (!disposed) render(); }
  }

  function update(quest: Quest, patch: Record<string, unknown>, message: string, revert?: Record<string, unknown>): void {
    void run(async () => {
      const saved = await port.update(quest, patch);
      say(message, revert ? () => { void run(async () => { await port.update(saved, revert); }, tx("元に戻せませんでした")); } : undefined);
    }, tx("保存できませんでした。もう一度試してください。"));
  }

  function acceptProposal(quest: Quest): void {
    const proposal = quest.proposal;
    if (!proposal) return;
    update(quest, { scheduledDate: proposal.date, scheduledTime: proposal.time, estimatedMinutes: quest.estimatedMinutes || proposal.minutes, planningState: "scheduled", planningMode: "on_date", proposal: null, expectedUpdatedAt: quest.updatedAt },
      tx("{time}に「{title}」を入れました", { time: proposal.time, title: quest.title }), previousPlan(quest));
  }

  let lastLevel: number | null = null;
  function complete(quest: Quest): void {
    if (pending.has(quest.id)) return;
    if (focusId === quest.id) focusId = null;
    store.set(`a4-start:${quest.id}`, null);
    store.set(`a4-paused:${quest.id}`, null);
    stopTracking(quest);
    const send = () => {
      if (disposed) return;
      // Another save holds the screen; wait for it instead of dropping the completion.
      if (busy) { pending.set(quest.id, window.setTimeout(send, 500)); return; }
      pending.set(quest.id, 0);
      void run(async () => {
        try {
          const result = await port.complete(quest);
          // Experience is only known after the save, so the second toast is kept for a level-up.
          const level = result.character?.level ?? null;
          if (game && level !== null && lastLevel !== null && level > lastLevel) say(tx("レベルが上がりました · Lv {level}", { level }));
          if (level !== null) lastLevel = level;
        } catch {
          say(tx("完了を保存できませんでした"), () => complete(quest), tx("もう一度"), true);
        } finally { pending.delete(quest.id); }
      }, tx("完了を保存できませんでした"));
    };
    pending.set(quest.id, window.setTimeout(send, UNDO_MS));
    const today = port.today();
    const dayDone = onDay(quest, today) && groups(quests(), today).today.length === 0;
    if (cheer) {
      const focused = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement.getBoundingClientRect() : null;
      const origin = Date.now() - lastPointer.at < 1000 ? lastPointer
        : focused ? { x: focused.left + focused.width / 2, y: focused.top + focused.height / 2 } : { x: innerWidth / 2, y: innerHeight * 0.6 };
      celebrate(origin.x, origin.y, dayDone);
    }
    // Completions inside the undo window share one toast, and one undo takes them all back.
    const batch = [...pending].filter(([, timer]) => timer !== 0).map(([id]) => id);
    say(dayDone ? tx("今日の分、ぜんぶ終わりました！") : batch.length > 1 ? tx("{count}件 完了しました", { count: batch.length }) : cheer ? tx("おつかれさま！ ひとつ前へ。") : tx("完了しました"), () => {
      for (const id of batch) {
        const timer = pending.get(id);
        if (!timer) continue;
        window.clearTimeout(timer);
        pending.delete(id);
      }
      render();
    });
    render();
  }

  /** Sends waiting completions now (the page is being hidden or closed); they stay hidden until saved. */
  function flushPending(): void {
    for (const [id, timer] of pending) {
      if (!timer) continue;
      window.clearTimeout(timer);
      const quest = byId(id);
      if (!quest) { pending.delete(id); continue; }
      pending.set(id, 0);
      void port.complete(quest).catch(() => undefined).finally(() => { pending.delete(id); if (!disposed) render(); });
    }
  }

  const plan = (date: string) => ({ scheduledDate: date, scheduledTime: "", planningMode: "on_date", planningState: date ? "scheduled" : "backlog" });
  const previousPlan = (q: Quest) => ({ scheduledDate: q.scheduledDate, scheduledTime: q.scheduledTime, planningMode: q.planningMode, planningState: q.planningState });

  function start(quest: Quest): void {
    store.set(`a4-start:${quest.id}`, String(Date.now()));
    focusId = quest.id;
    // Starting also records time, so there is one start button, not two. Track before saving:
    // the save marks the app busy, and the time recorder refuses writes while it is busy.
    if (runtime) workUi.track(quest.id);
    update(quest, { assignee: { ...quest.assignee, handoffState: "working" }, handoff: { ...quest.handoff, startedAt: new Date().toISOString() } }, tx("始めました。まずは次の一歩だけ。"));
  }

  const stopTracking = (quest: Quest) => { if (runtime && workUi.trackedQuest() === quest.id) workUi.track(null); };

  const pausedMinutes = (quest: Quest) => Number(store.get(`a4-paused:${quest.id}`)) || 0;
  function pause(quest: Quest): void {
    // Shown on the card only; the time record itself is kept by the tracker.
    store.set(`a4-paused:${quest.id}`, String(Math.max(1, pausedMinutes(quest) + Math.round((Date.now() - startedAtOf(quest)) / 60_000))));
    store.set(`a4-start:${quest.id}`, null);
    stopTracking(quest);
    void run(async () => {
      const saved = await port.update(quest, { assignee: { ...quest.assignee, handoffState: "none" } });
      say(tx("一時停止しました。続きはいつでもここから。"), () => start(saved));
    }, tx("保存できませんでした。もう一度試してください。"));
  }

  /* ------------------------------ pieces ------------------------------ */

  const button = (label: string, action: () => void, kind: "primary" | "secondary" | "link" = "secondary", disabled = false) => {
    const node = el("button", { type: "button", class: kind === "primary" ? "a4-button a4-primary" : kind === "link" ? "a4-link" : "a4-button", disabled: disabled || busy });
    node.textContent = label;
    node.addEventListener("click", action);
    return node;
  };

  const startedAtOf = (quest: Quest) => Number(store.get(`a4-start:${quest.id}`)) || Date.parse(quest.handoff?.startedAt ?? "") || Date.now();
  const running = (quest: Quest, minutes: number) => isWorking(quest)
    ? { "data-run-start": String(startedAtOf(quest)), "data-run-goal": String((quest.estimatedMinutes > 0 ? quest.estimatedMinutes : minutes) * 60) } : {};
  function paintProgress(): void {
    for (const node of root.querySelectorAll<HTMLElement>("[data-run-start]")) {
      const seconds = (Date.now() - Number(node.dataset.runStart)) / 1000;
      node.style.setProperty("--a4-progress", `${Math.min(100, Math.max(0, (seconds / Number(node.dataset.runGoal)) * 100))}%`);
    }
  }

  function timer(quest: Quest, small = false): HTMLElement {
    const startedAt = startedAtOf(quest);
    const goal = quest.estimatedMinutes * 60;
    const ring = svg("circle", { class: "a4-ring-value", cx: 60, cy: 60, r: 52, pathLength: 100 });
    const label = el("span", { class: "a4-ring-label", "data-a4-elapsed": "" });
    const paint = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      label.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
      ring.setAttribute("stroke-dasharray", `${goal > 0 ? Math.min(100, (seconds / goal) * 100) : 0} 100`);
    };
    paint();
    const node = el("div", { class: small ? "a4-ring a4-ring-sm" : "a4-ring", role: "timer", "aria-label": goal > 0 ? tx("経過時間。目安は{time}", { time: minutesLabel(quest.estimatedMinutes) }) : tx("経過時間") },
      svg("svg", { viewBox: "0 0 120 120", "aria-hidden": "true" }, svg("circle", { class: "a4-ring-track", cx: 60, cy: 60, r: 52 }), ring),
      el("div", { class: "a4-ring-text" }, label, small ? null : el("small", {}, goal > 0 ? `/ ${minutesLabel(quest.estimatedMinutes)}` : tx("経過"))));
    (node as HTMLElement & { a4Paint?: () => void }).a4Paint = paint;
    return node;
  }

  /** The focus card's running clock: elapsed time, what is left of the estimate, and a thin bar. */
  function runTimer(quest: Quest): HTMLElement {
    const startedAt = startedAtOf(quest);
    const goal = quest.estimatedMinutes * 60;
    const value = el("strong", { "data-a4-elapsed": "" });
    const left = el("span", { class: "a4-run-left" });
    const bar = el("span", { class: "a4-progress", "aria-hidden": "true" });
    const paint = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      value.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
      left.textContent = goal > seconds ? tx("あと{time}", { time: minutesLabel(Math.ceil((goal - seconds) / 60)) }) : "";
      bar.style.setProperty("--a4-done", `${goal > 0 ? Math.min(100, (seconds / goal) * 100) : 0}%`);
    };
    paint();
    const node = el("div", { class: "a4-run", role: "timer", "aria-label": goal > 0 ? tx("経過時間。目安は{time}", { time: minutesLabel(quest.estimatedMinutes) }) : tx("経過時間") },
      el("p", {}, value, el("small", {}, tx("経過")), left), bar);
    (node as HTMLElement & { a4Paint?: () => void }).a4Paint = paint;
    return node;
  }

  function decisionNotice(): HTMLElement | null {
    const ai = agentSummary(quests(), port.today());
    const count = quests().filter(needsDecision).length;
    if (count === 0 && ai.blocked.length === 0) return null;
    const link = el("a", { class: "a4-notice", href: "#guild" }, glyph(MessageSquare), el("strong", {}, tx("あなたの判断 {count}件", { count: count + ai.blocked.length })),
      el("span", {}, tx("確認 {review} · 止まっている {blocked}", { review: count, blocked: ai.blocked.length })), glyph(ChevronRight));
    link.addEventListener("click", event => { event.preventDefault(); go("guild"); });
    return link;
  }

  const isDone = (quest: Quest) => quest.done || pending.has(quest.id);
  const children = (quest: Quest) => port.quests().filter(q => q.parentQuestId === quest.id && q.lifecycleState !== "archived");

  const hue = (_quest: Quest) => "";

  function tone(quest: Quest): string {
    if (isDone(quest)) return "done";
    if (needsDecision(quest)) return "decision";
    if (quest.assignee.type !== "self") return "agent";
    if ((view === "now" || view === "plan" || view === "all") && (quest.id === focusQuest?.id || quest.id === focusQuest?.parentQuestId)) return "focus";
    return isWorking(quest) ? "working" : quest.kind === "daily" ? "daily" : "self";
  }

  const recentIcons = () => (store.get("a4-icons") ?? "").split(" ").filter(Boolean);
  /** The Quest's emoji in a pastel circle of its colour; without one the colour dot stands in. Decorative: the title is what is read. */
  const iconCircle = (quest: Quest, size: "" | "lg" | "sm" = "") => el("span", { class: size ? `a4-emoji a4-emoji-${size}` : "a4-emoji",
    "data-tone": tone(quest), "data-hue": hue(quest), "data-empty": String(!quest.icon), "aria-hidden": "true" }, quest.icon ?? "");

  function checkButton(quest: Quest, date = port.today()): HTMLElement {
    if (isDone(quest)) return el("span", { class: "a4-check", "data-done": "true", role: "img", "aria-label": tx("完了") });
    // Only the person's own tasks can be ticked off here; others show no dead control.
    if (quest.assignee.type !== "self" || needsDecision(quest)) return el("span", { class: "a4-check-space", "aria-hidden": "true" });
    const node = el("button", { type: "button", class: "a4-check", "aria-label": tx("{title} を完了", { title: quest.title }), disabled: busy || (quest.kind === "daily" && date !== port.today()) });
    node.addEventListener("click", () => complete(quest));
    return node;
  }

  function titleButton(quest: Quest): HTMLElement {
    const node = el("button", { type: "button", class: "a4-row-title", "aria-haspopup": "dialog", "data-done": String(isDone(quest)), "data-quest-id": quest.id }, quest.title);
    node.addEventListener("click", () => openSheet(quest));
    return node;
  }

  function meta(quest: Quest, withTime = true): string {
    const steps = children(quest);
    const parts = [withTime ? quest.scheduledTime : "", quest.estimatedMinutes > 0 ? tx("目安 {time}", { time: minutesLabel(quest.estimatedMinutes) }) : "",
      steps.length > 0 ? tx("ステップ {done}/{total}", { done: steps.filter(isDone).length, total: steps.length }) : "",
      quest.dueDate ? tx("締切 {date}", { date: shortDate(quest.dueDate) }) : ""];
    if (quest.assignee.type !== "self") parts.push(tx("担当 {name}", { name: quest.assignee.label || "Agent" }));
    return parts.filter(Boolean).join(" · ");
  }

  function rowText(quest: Quest, withTime = true): HTMLElement {
    const info = meta(quest, withTime);
    return el("div", { class: "a4-row-text" }, titleButton(quest), info ? el("span", { class: "a4-meta" }, info) : null);
  }

  function row(quest: Quest, bucket: Bucket): HTMLElement {
    const quick = bucket === "inbox" || bucket === "review" || bucket === "later"
      ? button(tx("今日やる"), () => update(quest, { ...plan(port.today()), expectedUpdatedAt: quest.updatedAt }, tx("今日に入れました"), previousPlan(quest)), "link")
      : bucket === "decision" ? button(tx("確認する"), () => go("guild", quest.id), "link") : null;
    const steps = openSteps(quest);
    const next = steps.find(step => blockers(step, port.quests()).length === 0);
    return el("li", { class: "a4-row", "data-bucket": bucket }, el("div", { class: "a4-row-main" }, checkButton(quest), iconCircle(quest), rowText(quest), quick),
      steps.length === 0 ? null : (() => {
        const fold = el("details", { class: "a4-row-steps", open: openFolds.has(quest.id) },
          el("summary", {}, (next ? tx("ステップ（残り {count}）· 次は「{title}」", { count: steps.length, title: shortTitle(next.title) }) : tx("ステップ（残り {count}）", { count: steps.length }))),
          stepList(quest, false));
        fold.addEventListener("toggle", () => { if (fold.open) openFolds.add(quest.id); else openFolds.delete(quest.id); });
        return fold;
      })());
  }

  const openSteps = (quest: Quest) => stepsOf(quest, port.quests()).filter(step => !pending.has(step.id));
  /** "[LA-01] …" reads as LA-01; other titles are cut short. */
  const shortTitle = (title: string) => title.match(/^\[([^\]]{1,12})\]/)?.[1] ?? (title.length > 14 ? `${title.slice(0, 14)}…` : title);

  /** A parent's steps in order: the next one marked, waiting ones say what they wait for. Titles open the step's own sheet. */
  function stepList(quest: Quest, withDone = true): HTMLElement | null {
    const open = openSteps(quest);
    const done = withDone ? children(quest).filter(isDone) : [];
    if (open.length + done.length === 0) return null;
    const next = open.find(step => blockers(step, port.quests()).length === 0);
    return el("ul", { class: "a4-steps", "aria-label": tx("小さなステップ") },
      ...[...open, ...done].map(step => {
        const waits = isDone(step) ? [] : blockers(step, port.quests());
        return el("li", { "data-waiting": String(waits.length > 0) }, checkButton(step), titleButton(step),
          step === next ? el("span", { class: "a4-step-tag", "data-kind": "next" }, tx("次はこれ"))
            : waits.length > 0 ? el("span", { class: "a4-step-tag" }, (waits.length > 2 ? tx("待ち（{names} ほか{count}件 のあと）", { names: waits.slice(0, 2).map(item => shortTitle(item.title)).join(tx("・")), count: waits.length - 2 }) : tx("待ち（{names} のあと）", { names: waits.map(item => shortTitle(item.title)).join(tx("・")) }))) : null);
      }));
  }

  /* ------------------------------ detail sheet ------------------------------ */

  /**
   * Who carries the task: a vertical relay of nodes from you, through Agents, back
   * to you. Drag to reorder or to drop an Agent in (long-press on touch), tap
   * "＋" to append, Alt+↑/↓ from the keyboard. Without `port.relay` (production
   * for now) the chain holds at most one Agent, which maps onto the assignee.
   */
  function relayEditor(quest: Quest) {
    const multi = Boolean(port.relay);
    const editable = !isDone(quest) && !quest.humanRequest && quest.assignee.type !== "human";
    const agents = port.agents().filter(agent => agent.active);
    const nameOf = (id: string) => port.agents().find(agent => agent.id === id)?.name || (quest.assignee.id === id ? quest.assignee.label : "") || "Agent";
    const stored = port.relay?.get(quest.id) ?? null;
    const initial: RelayLeg[] = stored ? [...stored.legs] : quest.assignee.type === "agent" ? [{ agentId: quest.assignee.id, ask: "", check: false }] : [];
    let legs = initial.map(leg => ({ ...leg }));
    let palette = false;
    let suppressClickUntil = 0;
    const list = el("ol", { class: "a4-relay", "aria-label": tx("担当のリレー") });
    const hint = el("small", { class: "a4-muted", "aria-live": "polite" });
    const host = el("div", { class: "a4-relay-host" }, list, hint);
    const position = () => {
      const live = byId(quest.id) ?? quest;
      const started = live.assignee.type === "agent";
      return { started, at: started ? (port.relay?.get(quest.id)?.at ?? 0) : -1, state: live.assignee.handoffState };
    };
    // Legs already handed over stay put; only what comes after can change.
    const firstFree = () => (multi ? position().at + 1 : 0);
    const max = multi ? 6 : 1;

    function indexAt(y: number, dragged: HTMLElement): number {
      const free = firstFree();
      for (const node of list.querySelectorAll<HTMLElement>(".a4-relay-node[data-index]")) {
        const index = Number(node.dataset.index);
        if (index < free || node === dragged) continue;
        const rect = node.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) return index;
      }
      return legs.length;
    }
    function mark(index: number): void {
      for (const node of list.querySelectorAll<HTMLElement>("[data-drop]")) node.removeAttribute("data-drop");
      const target = index < legs.length ? list.querySelector<HTMLElement>(`.a4-relay-node[data-index="${index}"]`) : list.querySelector<HTMLElement>(".a4-relay-node[data-end]");
      target?.setAttribute("data-drop", "true");
    }
    /** Mouse drags at once; touch waits for a long-press so the sheet still scrolls. */
    function dragify(node: HTMLElement, drop: (index: number) => void): void {
      let pointer = -1, startX = 0, startY = 0, active = false, timer = 0, target = -1;
      const begin = () => { active = true; node.dataset.dragging = "true"; navigator.vibrate?.(10); };
      const end = (commit: boolean) => {
        window.clearTimeout(timer);
        if (active && commit && target >= 0) { suppressClickUntil = Date.now() + 300; drop(target); }
        active = false; pointer = -1; target = -1;
        node.style.transform = ""; node.removeAttribute("data-dragging"); mark(-1);
      };
      node.addEventListener("pointerdown", event => {
        const from = event.target as Element;
        if (event.button !== 0 || (from !== node && from.closest("input, button"))) return;
        pointer = event.pointerId; startX = event.clientX; startY = event.clientY;
        node.setPointerCapture(pointer);
        if (event.pointerType !== "mouse") timer = window.setTimeout(begin, 350);
      });
      node.addEventListener("pointermove", event => {
        if (event.pointerId !== pointer) return;
        const dx = event.clientX - startX, dy = event.clientY - startY;
        if (!active) {
          if (Math.hypot(dx, dy) < 6) return;
          if (event.pointerType !== "mouse") { end(false); return; }
          begin();
        }
        node.style.transform = `translate(${dx}px, ${dy}px)`;
        target = indexAt(event.clientY, node);
        mark(target);
      });
      node.addEventListener("pointerup", () => end(true));
      node.addEventListener("pointercancel", () => end(false));
      node.addEventListener("touchmove", event => { if (active) event.preventDefault(); }, { passive: false });
      node.addEventListener("contextmenu", event => { if (pointer >= 0) event.preventDefault(); });
    }
    const moveLeg = (from: number, to: number) => {
      const [leg] = legs.splice(from, 1);
      legs.splice(to > from ? to - 1 : to, 0, leg!);
      paint();
    };
    const addLeg = (agentId: string, index = legs.length) => {
      legs.splice(Math.max(index, firstFree()), 0, { agentId, ask: "", check: false });
      if (legs.length >= max) palette = false;
      paint();
    };

    const status = (label: string, state: string) => el("span", { class: "a4-state", "data-state": state }, label);
    function selfNode(label: string, note: HTMLElement | null, end = false): HTMLElement {
      return el("li", { class: "a4-relay-node", "data-kind": "self", ...(end ? { "data-end": "true" } : {}) },
        el("span", { class: "a4-avatar", "data-kind": "self", "aria-hidden": "true" }, port.self().label.slice(0, 1)),
        el("div", { class: "a4-relay-body" }, el("div", { class: "a4-relay-line" }, el("strong", {}, label), note)));
    }
    function legNode(leg: RelayLeg, index: number, started: boolean, at: number, state: string): HTMLElement {
      const locked = !editable || index < firstFree();
      const name = nameOf(leg.agentId);
      const badge = !started || index > at ? status(tx("これから"), "none") : index < at ? status(tx("済み"), "accepted") : status(AGENT_STATE[state] ?? state, state);
      const ask = multi && !locked ? el("input", { class: "a4-relay-ask", value: leg.ask, maxlength: 60, placeholder: tx("頼みごと（例：下書き）"), "aria-label": tx("{name}への頼みごと", { name }) }) : null;
      ask?.addEventListener("input", () => { legs[index] = { ...legs[index]!, ask: ask.value }; paintHint(); });
      const remove = locked ? null : el("button", { type: "button", class: "a4-relay-x", "aria-label": tx("{name}を外す", { name }) }, glyph(X));
      remove?.addEventListener("click", () => { legs.splice(index, 1); paint(); });
      const node = el("li", { class: "a4-relay-node", "data-kind": "agent", "data-index": String(index), "data-status": !started || index > at ? "next" : index < at ? "done" : "now",
        "data-draggable": String(multi && !locked), "aria-label": tx("{index}番目 {name}", { index: index + 1, name }) + (leg.ask ? `${tx("：")}${leg.ask}` : "") },
        multi && !locked ? el("span", { class: "a4-relay-grip", "aria-hidden": "true" }, glyph(GripVertical)) : null,
        el("span", { class: "a4-avatar", "data-kind": "agent", "aria-hidden": "true" }, name.slice(0, 1)),
        el("div", { class: "a4-relay-body" },
          el("div", { class: "a4-relay-line" }, el("strong", {}, name), badge),
          ask ?? (leg.ask ? el("span", { class: "a4-meta" }, leg.ask) : null)),
        remove);
      if (multi && !locked) {
        dragify(node, to => moveLeg(index, to));
        node.addEventListener("keydown", event => {
          if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
          event.preventDefault();
          const to = event.key === "ArrowUp" ? index - 1 : index + 2;
          if (to < firstFree() || to > legs.length) return;
          moveLeg(index, to);
          list.querySelector<HTMLElement>(`.a4-relay-node[data-index="${event.key === "ArrowUp" ? index - 1 : index + 1}"] input`)?.focus();
        });
      }
      return node;
    }
    function link(after: number | null, at: number, label = ""): HTMLElement {
      if (after === null || !multi) return el("li", { class: "a4-relay-link", "aria-hidden": label ? null : "true" }, label ? el("span", { class: "a4-meta" }, label) : null);
      const leg = legs[after]!;
      const required = after === legs.length - 1 || Boolean(port.agents().find(agent => agent.id === leg.agentId)?.reviewRequired);
      const checked = leg.check || required;
      if (!editable || after < at) return el("li", { class: "a4-relay-link" }, el("span", { class: "a4-meta" }, checked ? tx("あなたが確認してから次へ") : tx("そのまま次へ")));
      const toggle = el("button", { type: "button", class: "a4-relay-check", disabled: required, "aria-pressed": String(checked) }, checked ? tx("確認を挟む") : tx("そのまま次へ"));
      toggle.addEventListener("click", () => { legs[after] = { ...legs[after]!, check: !legs[after]!.check }; paint(); });
      return el("li", { class: "a4-relay-link" }, toggle);
    }
    function paintHint(): void {
      const { started } = position();
      const first = legs[0];
      hint.textContent = !changed() ? (legs.length === 0 && editable ? (multi ? tx("Agentを足すと、順番にバトンを渡します。最後はあなたが確認します。") : tx("Agentに任せると、終わったところであなたが確認します。")) : "")
        : legs.length === 0 ? tx("保存すると自分の担当に戻します。")
        : !started || (!multi && first?.agentId !== quest.assignee.id) ? (legs.length > 1 ? tx("保存すると {first} に渡します。終わったら {rest} へ回り、最後にあなたが確認します。", { first: nameOf(first!.agentId), rest: legs.slice(1).map(leg => nameOf(leg.agentId)).join(" → ") }) : tx("保存すると {first} に渡します。終わったら、最後にあなたが確認します。", { first: nameOf(first!.agentId) }))
        : tx("保存すると、このあとの順番を変えます。");
    }
    // Candidates read as rows: who, what they do, and how much they already hold.
    const loadOf = (id: string) => quests().filter(q => isOpen(q) && q.assignee.type === "agent" && q.assignee.id === id).length;
    function candidates(): HTMLElement {
      if (agents.length === 0) {
        const register = withArrow(button(tx("ギルドで登録する"), () => { if (closeSheet) closeSheet(() => go("guild")); else go("guild"); }, "link"));
        return el("div", { class: "a4-relay-palette", role: "group", "aria-label": tx("足すAgent") }, el("p", {}, tx("使えるAgentがいません。")), register);
      }
      return el("div", { class: "a4-relay-palette", role: "group", "aria-label": tx("足すAgent") }, el("p", { class: "a4-step-label" }, tx("足すAgent")),
        el("ul", {}, ...agents.map(agent => {
          const load = loadOf(agent.id);
          const row = el("button", { type: "button", class: "a4-relay-cand" },
            el("span", { class: "a4-avatar", "data-kind": "agent", "aria-hidden": "true" }, agent.name.slice(0, 1)),
            el("span", { class: "a4-relay-cand-copy" }, el("strong", {}, agent.name), agent.role ? el("small", {}, agent.role) : null),
            el("span", { class: "a4-meta" }, load ? tx("{count}件 進行中", { count: load }) : tx("手が空いています")));
          row.addEventListener("click", () => { if (Date.now() > suppressClickUntil) addLeg(agent.id); });
          if (multi) dragify(row, to => addLeg(agent.id, to));
          return el("li", {}, row);
        })));
    }
    const openPalette = () => {
      palette = !palette; paint();
      const box = host.querySelector<HTMLElement>(".a4-relay-palette");
      // Phones keep the footer over the sheet's end; bring the list up and start on its first row.
      box?.scrollIntoView({ block: "nearest" });
      box?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    };
    const addButton = () => { const node = el("button", { type: "button", class: "a4-button a4-relay-add", "aria-expanded": String(palette) }, glyph(Plus), tx("Agentを足す")); node.addEventListener("click", openPalette); return node; };
    function paint(): void {
      const { started, at, state } = position();
      if (legs.length === 0) {
        // Your own task: one line, and the way to hand it on.
        replaceChildren(list, el("li", { class: "a4-relay-solo" },
          el("span", { class: "a4-avatar", "data-kind": "self", "aria-hidden": "true" }, port.self().label.slice(0, 1)),
          el("span", { class: "a4-relay-cand-copy" }, el("strong", {}, port.self().label), el("small", {}, tx("あなたが進める"))),
          editable ? addButton() : null), palette && editable ? el("li", {}, candidates()) : null);
        paintHint();
        return;
      }
      const items: HTMLElement[] = [selfNode(tx("{name}（あなた）", { name: port.self().label }), null)];
      legs.forEach((leg, index) => {
        items.push(index === 0 ? link(null, at, tx("渡す")) : link(index - 1, at));
        items.push(legNode(leg, index, started, at, state));
      });
      const last = started && at === legs.length - 1;
      items.push(link(null, at, legs.length > 0 ? tx("終わったら") : ""));
      items.push(selfNode(legs.length > 0 ? tx("あなたが最後の確認") : tx("あなたが進める"),
        last && state === "review_required" ? status(tx("あなたの番"), "review_required") : last && state === "accepted" ? status(tx("完了"), "accepted") : null, true));
      const add = editable && legs.length < max ? addButton() : null;
      const chips = palette && add ? el("li", {}, candidates()) : null;
      replaceChildren(list, ...items, add ? el("li", { class: "a4-relay-tail" }, add) : null, chips);
      paintHint();
    }
    const changed = () => JSON.stringify(legs.map(leg => ({ ...leg, ask: leg.ask.trim() }))) !== JSON.stringify(initial);
    paint();
    return { node: host, paint, changed, legs: () => legs.map(leg => ({ ...leg, ask: leg.ask.trim() })), nameOf };
  }

  function openSheet(quest: Quest): void {
    if (sheet) { closeSheet?.(() => openSheet(quest)); return; }
    quest = byId(quest.id) ?? quest;
    const today = port.today();
    // Single-line values that wrap so long titles stay readable; Enter never adds a line break.
    const line = (attrs: Record<string, string | number | boolean>, value: string) => {
      const node = el("textarea", { ...attrs, rows: 1 });
      node.value = value;
      node.addEventListener("keydown", event => { if (event.key === "Enter" && !event.isComposing) event.preventDefault(); });
      // Browsers without CSS field-sizing still grow the box.
      const fit = () => { node.style.height = "auto"; node.style.height = `${node.scrollHeight}px`; };
      node.addEventListener("input", () => { node.value = node.value.replace(/\n/g, " "); fit(); });
      requestAnimationFrame(fit);
      return node;
    };
    const title = line({ class: "a4-sheet-title", name: "title", required: true, maxlength: 200, "aria-label": tx("やること") }, quest.title);
    let icon = quest.icon ?? "";
    let iconTouched = false;
    const iconButton = el("button", { type: "button", class: "a4-emoji a4-emoji-lg a4-emoji-pick", "data-tone": tone(quest), "data-hue": hue(quest), "aria-expanded": "false", "aria-label": tx("絵文字を変える") });
    const iconPane = el("div", { class: "a4-sheet-pane a4-icon-pane", role: "group", "aria-label": tx("絵文字"), hidden: true });
    const showIcons = (open: boolean) => { iconPane.hidden = !open; iconButton.setAttribute("aria-expanded", String(open)); if (open) paintIcon(); };
    const pickIcon = (value: string) => { icon = value; iconTouched = true; showIcons(false); paintIcon(); iconButton.focus(); };
    function paintIcon(): void {
      iconButton.textContent = icon || tx("絵文字");
      iconButton.dataset.empty = String(!icon);
      if (iconPane.hidden) return;
      const choice = (value: string, label: string) => {
        const node = el("button", { type: "button", class: value ? "a4-chip a4-icon-choice" : "a4-chip", "aria-pressed": String(value === icon) }, label);
        node.addEventListener("click", () => pickIcon(value));
        return node;
      };
      // Any other emoji is typed behind a link, one emoji only.
      const typed = el("input", { class: "a4-input a4-icon-typed", maxlength: 16, "aria-label": tx("ほかの絵文字を入力"), hidden: true });
      const typedHint = el("p", { class: "a4-meta", hidden: true }, tx("絵文字を1つだけ入れられます。"));
      const other = button(tx("ほかの絵文字を入力"), () => { typed.hidden = false; typedHint.hidden = false; other.setAttribute("aria-expanded", "true"); typed.focus(); }, "link");
      other.setAttribute("aria-expanded", "false");
      typed.addEventListener("input", () => {
        const parts = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(typed.value.trim())].map(part => part.segment);
        if (parts.length === 1 && /\p{Extended_Pictographic}/u.test(parts[0]!)) pickIcon(parts[0]!);
      });
      replaceChildren(iconPane, el("p", { class: "a4-step-label" }, tx("絵文字")),
        el("div", { class: "a4-icon-choices" }, ...iconChoices(title.value, icon ? [icon, ...recentIcons()] : recentIcons()).map(value => choice(value, value))),
        el("div", { class: "a4-icon-more" }, choice("", tx("なし")), other), typed, typedHint);
    }
    iconButton.addEventListener("click", () => showIcons(iconPane.hidden === true));
    paintIcon();
    const step = line({ class: "a4-sheet-next", name: "nextAction", placeholder: tx("次の一歩：最初の1分でできること"), "aria-label": tx("次の一歩"), maxlength: 180 }, quest.nextAction);
    const date = el("input", { class: "a4-input", type: "date", name: "scheduledDate", value: quest.scheduledDate, "aria-label": tx("日付") });
    const time = el("input", { class: "a4-input", type: "time", name: "scheduledTime", value: quest.scheduledTime, step: 300, "aria-label": tx("時刻") });
    const due = el("input", { class: "a4-input", type: "date", name: "dueDate", value: quest.dueDate, "aria-label": tx("締め切り") });
    const notes = el("textarea", { class: "a4-input a4-textarea", name: "notes", rows: 4, maxlength: 180, "aria-label": tx("メモ"), placeholder: tx("メモ") });
    const criteria = el("textarea", { class: "a4-input a4-textarea", name: "completionCriteria", rows: 3, maxlength: 300, "aria-label": tx("完了の条件"), placeholder: tx("例：対象SHAで、ログインから同期まで確認できたら完了") });
    criteria.value = quest.completionCriteria ?? "";
    notes.value = quest.notes;
    let estimate = quest.estimatedMinutes;

    // Values read as chips; an editor opens only for the one being changed.
    const shortDay = (value: string) => value === today ? tx("今日") : value === addDays(today, 1) ? tx("明日") : dayLabel.format(noon(value));
    const quick = (label: string, apply: () => void) => {
      const chip = el("button", { type: "button", class: "a4-chip" }, label);
      chip.addEventListener("click", () => { apply(); paintChips(); });
      return chip;
    };
    // Length can be picked, typed freely (up to a day), or implied by an end time.
    const hours = el("input", { class: "a4-input a4-num", type: "number", min: 0, max: 24, step: 1, inputmode: "numeric", "aria-label": tx("目安（時間）") });
    const mins = el("input", { class: "a4-input a4-num", type: "number", min: 0, max: 59, step: 5, inputmode: "numeric", "aria-label": tx("目安（分）") });
    const end = el("input", { class: "a4-input", type: "time", step: 300, "aria-label": tx("終わる時刻") });
    const estimateChips = el("div", { class: "a4-chips", role: "group", "aria-label": tx("目安の時間") }, ...[...ESTIMATES, 90, 120].map(minutes => {
      const chip = el("button", { type: "button", class: "a4-chip", "data-minutes": String(minutes) }, minutesLabel(minutes));
      chip.addEventListener("click", () => setEstimate(estimate === minutes ? 0 : minutes));
      return chip;
    }));
    function setEstimate(minutes: number, from?: HTMLInputElement): void {
      estimate = Math.min(1440, Math.max(0, Math.round(minutes)));
      for (const node of estimateChips.children) node.setAttribute("aria-pressed", String(Number((node as HTMLElement).dataset.minutes) === estimate));
      if (from !== hours && from !== mins) { hours.value = estimate ? String(Math.floor(estimate / 60)) : ""; mins.value = estimate ? String(estimate % 60) : ""; }
      if (from !== end) end.value = time.value && estimate > 0 ? clock(toMinutes(time.value) + estimate) : "";
      end.disabled = !time.value;
      paintChips();
    }
    const typed = () => setEstimate((Number(hours.value) || 0) * 60 + (Number(mins.value) || 0), document.activeElement as HTMLInputElement);
    hours.addEventListener("input", typed);
    mins.addEventListener("input", typed);
    // An end before the start means it runs past midnight.
    end.addEventListener("input", () => { if (time.value && end.value) setEstimate((toMinutes(end.value) - toMinutes(time.value) + 1440) % 1440 || 1440, end); });
    time.addEventListener("input", () => setEstimate(estimate));
    // Our own 15-minute list instead of the browser's spinner popup; typing still works.
    const slots = el("div", { class: "a4-timelist", role: "listbox", "aria-label": tx("時刻を選ぶ") });
    let slotFor: HTMLInputElement = time;
    function paintSlots(): void {
      const isEnd = slotFor === end;
      const start = time.value ? toMinutes(time.value) : 0;
      const current = slotFor.value ? toMinutes(slotFor.value) : -1;
      const now = new Date().getHours() * 60 + new Date().getMinutes();
      const items = Array.from({ length: 96 }, (_, index) => isEnd ? start + (index + 1) * 15 : index * 15);
      replaceChildren(slots, ...items.map(minutes => {
        const value = clock(minutes);
        const slot = el("button", { type: "button", class: "a4-slot-pick", role: "option", "aria-selected": String(toMinutes(value) === current) },
          el("span", {}, value), isEnd ? el("span", { class: "a4-meta" }, minutesLabel(minutes - start)) : null);
        slot.addEventListener("click", () => {
          slotFor.value = value;
          slotFor.dispatchEvent(new Event("input", { bubbles: true }));
          if (slotFor === time) { slotFor = end; paintSlots(); end.focus(); } else paintSlots();
        });
        return slot;
      }));
      const target = slots.querySelector<HTMLElement>('[aria-selected="true"]')
        ?? (isEnd ? slots.querySelector<HTMLElement>(`:nth-child(${Math.max(1, (estimate || 30) / 15)})`) : slots.children[Math.floor(now / 15)] as HTMLElement | undefined);
      queueMicrotask(() => { if (target) slots.scrollTop = target.offsetTop - slots.offsetTop - 8; });
    }
    for (const input of [time, end]) input.addEventListener("focus", () => { if (slotFor !== input) { slotFor = input; paintSlots(); } });
    // A task's own reminder overrides the notification settings; "default" follows them.
    const reminderValue = (list: readonly number[] | undefined) => list === undefined ? "default" : JSON.stringify(list);
    const reminderChoices: [string, string][] = [["default", tx("いつもの通知設定")], ["[]", tx("知らせない")], ["[0]", tx("始まる時刻")],
      ...[5, 10, 15, 30, 60].map(n => [`[${n}]`, tx("{n}分前", { n })] as [string, string])];
    const currentReminder = reminderValue(quest.reminders);
    if (!reminderChoices.some(([value]) => value === currentReminder)) {
      reminderChoices.push([currentReminder, (quest.reminders ?? []).map(n => n ? tx("{n}分前", { n }) : tx("始まる時刻")).join(" · ")]);
    }
    const reminder = el("select", { class: "a4-input" }, ...reminderChoices.map(([value, label]) => el("option", { value, selected: value === currentReminder }, label)));
    const panes = {
      date: el("div", { class: "a4-sheet-pane", hidden: true }, date, quick(tx("今日"), () => { date.value = today; }), quick(tx("明日"), () => { date.value = addDays(today, 1); }), quick(tx("なし"), () => { date.value = ""; time.value = ""; setEstimate(estimate); })),
      time: el("div", { class: "a4-sheet-pane", hidden: true },
        el("label", { class: "a4-pane-field" }, el("span", { class: "a4-step-label" }, tx("始まり")), time),
        el("span", { class: "a4-meta", "aria-hidden": "true" }, "〜"),
        el("label", { class: "a4-pane-field" }, el("span", { class: "a4-step-label" }, tx("終わり")), end),
        quick(tx("なし"), () => { time.value = ""; setEstimate(estimate); paintSlots(); }), slots,
        el("label", { class: "a4-pane-field" }, el("span", { class: "a4-step-label" }, tx("リマインド")), reminder)),
      estimate: el("div", { class: "a4-sheet-pane", hidden: true }, estimateChips,
        el("div", { class: "a4-pane-free" }, el("span", { class: "a4-step-label" }, tx("自由に")), hours, el("span", {}, tx("時間")), mins, el("span", {}, tx("分")))),
      due: el("div", { class: "a4-sheet-pane", hidden: true }, due, quick(tx("なし"), () => { due.value = ""; })),
    };
    type Pane = keyof typeof panes;
    let open: Pane | null = null;
    const memo = el("div", { class: "a4-field-row", hidden: !quest.notes }, el("span", { class: "a4-step-label" }, tx("メモ")), notes);
    const memoChip = el("button", { type: "button", class: "a4-chip" }, tx("＋メモ"));
    memoChip.addEventListener("click", () => { memo.hidden = false; memoChip.hidden = true; notes.focus(); });
    memoChip.hidden = !memo.hidden;
    const done = el("div", { class: "a4-field-row", hidden: !quest.completionCriteria }, el("span", { class: "a4-step-label" }, tx("完了の条件")), criteria);
    const doneChip = el("button", { type: "button", class: "a4-chip" }, tx("＋完了の条件"));
    doneChip.hidden = !done.hidden;
    doneChip.addEventListener("click", () => { done.hidden = false; doneChip.hidden = true; criteria.focus(); });
    // What has to finish first; each opens its own sheet.
    const deps = (quest.dependencyIds ?? []).map(id => byId(id)).filter((item): item is Quest => item !== null);
    const depList = deps.length === 0 ? null : el("section", { class: "a4-group" }, el("h3", { class: "a4-step-label" }, tx("先にやること")),
      el("ul", { class: "a4-steps" }, ...deps.map(dep => el("li", {}, checkButton(dep), titleButton(dep)))));
    const parent = quest.parentQuestId ? byId(quest.parentQuestId) : null;
    const chipFor = (key: Pane) => {
      const chip = el("button", { type: "button", class: "a4-chip", "aria-expanded": "false" });
      chip.addEventListener("click", () => {
        open = open === key ? null : key;
        paintChips();
        const input = panes[key].querySelector<HTMLInputElement>("input, button");
        input?.focus();
        if (key === "time") paintSlots();
        if (open === key && input instanceof HTMLInputElement && input.type === "date") try { input.showPicker(); } catch { /* not every browser opens pickers on demand */ }
      });
      return chip;
    };
    const chips = { date: chipFor("date"), time: chipFor("time"), estimate: chipFor("estimate"), due: chipFor("due") };
    function paintChips(): void {
      const labels: Record<Pane, [string, boolean]> = {
        date: date.value ? [shortDay(date.value), true] : [tx("＋日付"), false],
        time: time.value ? [estimate > 0 ? `${time.value}–${clock(toMinutes(time.value) + estimate)}` : time.value, true] : [tx("＋時刻"), false],
        estimate: estimate > 0 ? [minutesLabel(estimate), true] : [tx("＋目安"), false],
        due: due.value ? [tx("締め切り {date}", { date: shortDay(due.value) }), true] : [tx("＋締め切り"), false],
      };
      for (const key of Object.keys(panes) as Pane[]) {
        chips[key].textContent = labels[key][0];
        chips[key].dataset.set = String(labels[key][1]);
        chips[key].setAttribute("aria-expanded", String(open === key));
        panes[key].hidden = open !== key;
      }
    }
    for (const input of [date, time, due]) input.addEventListener("input", paintChips);
    setEstimate(estimate);

    const relay = relayEditor(quest);
    const form = el("form", { class: "a4-sheet-form", id: "a4-sheet-form" },
      el("div", { class: "a4-sheet-titlerow" }, iconButton, title), iconPane, step,
      el("div", { class: "a4-chips a4-sheet-chips" }, chips.date, chips.time, chips.estimate, chips.due, doneChip, memoChip),
      ...Object.values(panes), done, memo);

    const mine = quest.assignee.type === "self" && !isDone(forDay(quest, today));
    const nextBox = el("div", { class: "a4-sheet-nextbox" });
    step.replaceWith(nextBox);
    nextBox.append(el("label", { class: "a4-sheet-nextcopy" }, el("span", { class: "a4-step-label" }, tx("次の一歩")), step));
    if (mine) nextBox.append(button(tx("今やる"), () => requestClose(() => { start(forDay(quest, port.today())); go("now"); })));
    const steps = el("div", { class: "a4-sheet-steps" });
    const stepCount = el("span", { class: "a4-meta" });
    const drafts = children(quest).map(q => ({ quest: q as Quest | null, title: q.title, done: isDone(forDay(q, today)), removed: false }));
    const stepInput = el("input", { class: "a4-input", placeholder: tx("ステップを追加"), "aria-label": tx("小さなステップを追加"), maxlength: 200, enterkeyhint: "done" });
    const stepForm = el("div", { class: "a4-step-add" }, glyph(Plus), stepInput);
    const paintSteps = () => {
      const shown = drafts.filter(d => !d.removed);
      stepCount.textContent = shown.length ? `${shown.filter(d => d.done).length} / ${shown.length}` : "";
      replaceChildren(steps, ...shown.map(draft => {
        const check = el("input", { type: "checkbox", checked: draft.done, disabled: busy || (draft.quest != null && (draft.quest.assignee.type !== "self" || (draft.quest.kind === "daily" && draft.done))), "aria-label": draft.title });
        check.addEventListener("change", () => { draft.done = check.checked; paintSteps(); });
        const away = el("button", { type: "button", class: "a4-icon-button", "aria-label": tx("「{title}」をしまう", { title: draft.title }) }, glyph(X));
        away.addEventListener("click", () => { draft.removed = true; paintSteps(); });
        return el("div", { class: "a4-step-draft" }, el("label", { class: "a4-option" }, check, draft.title), away);
      }));
    };
    // Enter adds a step; it must not submit the sheet.
    stepInput.addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      const value = stepInput.value.trim();
      if (!value || busy) return;
      drafts.push({ quest: null, title: value, done: false, removed: false });
      stepInput.value = ""; paintSteps(); stepInput.focus();
    });
    repaintSheet = () => {
      // Keep the draft and cursor intact when the workspace refreshes.
      for (const control of dialog.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement | HTMLSelectElement>("button,input,textarea,select")) {
        if (busy) { if (!control.disabled) { control.dataset.savingDisabled = ""; control.disabled = true; } }
        else if (control.hasAttribute("data-saving-disabled")) { control.disabled = false; delete control.dataset.savingDisabled; }
      }
    };

    const images = questImageEditor(port.images, quest);
    const repeatOptions: [Quest["repeat"], string][] = [["none", tx("繰り返さない")], ["daily", tx("毎日")], ["weekdays", tx("平日")], ["weekly", tx("毎週")], ["monthly", tx("毎月")]];
    const repeat = el("select", { class: "a4-input", "aria-label": tx("繰り返し") }, ...repeatOptions.map(([value, label]) => el("option", { value, selected: value === quest.repeat }, label)));
    panes.date.append(el("label", { class: "a4-pane-field" }, el("span", { class: "a4-step-label" }, tx("繰り返し")), repeat));
    const close = el("button", { type: "button", class: "a4-icon-button", "aria-label": tx("閉じる") }, glyph(X));
    // Putting away is reversible from search and the toast, so it needs no confirm step.
    const menu = el("details", { class: "a4-menu" }, el("summary", { class: "a4-icon-button", "aria-label": tx("ほかの操作") }, glyph(MoreHorizontal)),
      el("div", { class: "a4-menu-list" },
        quest.lifecycleState === "archived"
          ? button(tx("戻す"), () => requestClose(() => update(quest, { lifecycleState: "active" }, tx("やることに戻しました"), { lifecycleState: "archived" })), "link")
          : button(tx("しまう"), () => requestClose(() => update(quest, { lifecycleState: "archived" }, tx("しまいました。「やること」の検索から戻せます。"), { lifecycleState: quest.lifecycleState })), "link"),
        el("a", { class: "a4-link", href: RELAY_FORGE_URL }, tx("詳しい画面で開く"))));
    form.append(...([
      quest.proposal ? (proposal => el("section", { class: "a4-group a4-proposal" },
        el("h3", { class: "a4-step-label" }, tx("{name}の提案", { name: proposal.label })),
        el("p", { class: "a4-proposal-when" }, `${shortDay(proposal.date)} ${proposal.time}–${clock(toMinutes(proposal.time) + proposal.minutes)}`, proposal.note ? el("span", { class: "a4-meta" }, proposal.note) : null),
        el("div", { class: "a4-actions" },
          button(tx("この時間に入れる"), () => requestClose(() => acceptProposal(quest))),
          button(tx("断る"), () => requestClose(() => update(quest, { proposal: null, expectedUpdatedAt: quest.updatedAt }, tx("提案を断りました"))), "link"))))(quest.proposal) : null,
      depList,
      el("section", { class: "a4-group a4-sheet-stepsec" }, el("h3", { class: "a4-step-label" }, tx("小さなステップ"), stepCount), steps, mine ? stepForm : null),
      done, memo,
      el("section", { class: "a4-group" }, el("h3", { class: "a4-step-label" }, tx("担当")), relay.node),
      images.element] as (HTMLElement | null)[]).filter(node => node !== null));
    const dialog = el("dialog", { class: "a4-sheet", "aria-label": tx("詳しく：{title}", { title: quest.title }) },
      el("div", { class: "a4-sheet-head" },
        parent ? button(tx("← 「{title}」の一部", { title: shortTitle(parent.title) }), () => openSheet(parent), "link") : el("h2", { id: "a4-sheet-title", class: "a4-sheet-name" }, tx("タスクの詳細")), menu, close),
      form,
      el("div", { class: "a4-actions a4-sheet-foot" },
        button(tx("キャンセル"), () => requestClose(), "link"),
        el("button", { type: "submit", class: "a4-button a4-primary", form: "a4-sheet-form" }, tx("変更を保存"))));
    const error = el("p", { class: "a4-save-error", role: "alert", hidden: true });
    form.append(error);
    const body = el("div", { class: "a4-sheet-body" });
    const contents = [...dialog.children].filter(node => !node.classList.contains("a4-sheet-head") && !node.classList.contains("a4-sheet-foot"));
    body.append(...contents);
    dialog.querySelector(".a4-sheet-foot")!.before(body);
    paintSteps();
    const snapshot = () => JSON.stringify([title.value, step.value, date.value, time.value, due.value, notes.value, criteria.value, estimate, icon, reminder.value, repeat.value, images.fingerprint(), relay.legs(), drafts.map(d => [d.title, d.done, d.removed]), stepInput.value]);
    const original = snapshot();
    sheetDirty = () => snapshot() !== original;
    let saving = false;
    const requestClose = (after?: () => void) => {
      if (saving || busy) return;
      const finish = () => {
        sheet = null; closeSheet = null; sheetDirty = null; repaintSheet = null;
        dialog.close(); after?.();
      };
      if (snapshot() === original) { finish(); return; }
      if (document.querySelector(".a4-discard-dialog")) return;
      const confirmation = el("dialog", { class: "a4-capture-dialog a4-discard-dialog", "aria-label": tx("保存していない変更を破棄しますか？") },
        el("h2", { class: "a4-subtitle" }, tx("保存していない変更を破棄しますか？")),
        el("div", { class: "a4-actions" },
          button(tx("編集を続ける"), () => confirmation.close(), "primary"),
          button(tx("破棄する"), () => { confirmation.close(); finish(); })));
      confirmation.addEventListener("close", () => confirmation.remove());
      document.body.append(confirmation); confirmation.showModal();
    };
    closeSheet = requestClose;
    close.addEventListener("click", () => requestClose());
    dialog.addEventListener("cancel", event => { event.preventDefault(); requestClose(); });
    const resizeFields = () => { for (const node of [title, step]) { node.style.height = "auto"; node.style.height = node.scrollHeight + "px"; } };
    window.addEventListener("resize", resizeFields);
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (busy || saving) return;
      const current = quest;
      const patch: Record<string, unknown> = {};
      const set = (key: keyof Quest, value: unknown) => { if (current[key] !== value) patch[key] = value; };
      set("title", title.value.trim() || current.title);
      set("nextAction", step.value.trim());
      set("notes", notes.value);
      if ((current.completionCriteria ?? "") !== criteria.value.trim()) patch.completionCriteria = criteria.value.trim();
      set("estimatedMinutes", estimate);
      if (iconTouched && icon !== (current.icon ?? "")) {
        Object.assign(patch, { icon, iconSource: icon ? "user" : "" });
        if (icon) store.set("a4-icons", [icon, ...recentIcons().filter(item => item !== icon)].slice(0, 8).join(" "));
      }
      set("dueDate", due.value);
      set("repeat", repeat.value);
      if (reminder.value !== reminderValue(current.reminders)) patch.reminders = reminder.value === "default" ? null : JSON.parse(reminder.value);
      const legs = relay.legs();
      const handOver = relay.changed();
      // Without relay support the chain is the assignee: one Agent, or yourself.
      if (handOver && !port.relay) {
        const agent = port.agents().find(item => item.id === legs[0]?.agentId);
        patch.assignee = agent
          ? { type: "agent", id: agent.id, label: agent.name, handoffState: agent.startState || "ready" }
          : { type: "self", id: port.self().id, label: port.self().label, handoffState: "none" };
      }
      // A time without a day lands on the day being looked at.
      const day = date.value || (time.value ? planDate : "");
      const at = day ? time.value : "";
      if (day !== current.scheduledDate || at !== current.scheduledTime) {
        Object.assign(patch, { scheduledDate: day, scheduledTime: at, planningState: day ? "scheduled" : "backlog", ...(day ? {} : { planningMode: "on_date" }) });
      }
      const relayWrite = handOver && port.relay ? port.relay : null;

      const firstHand = handOver && current.assignee.type !== "agent" && legs.length > 0;
      saving = true; error.hidden = true;
      const saveButton = dialog.querySelector<HTMLButtonElement>('button[form="a4-sheet-form"]')!;
      saveButton.textContent = tx("保存中…");
      void run(async () => {
        try {
        let saved = current;
        if (Object.keys(patch).length > 0) saved = await port.update(current, { ...patch, expectedUpdatedAt: current.updatedAt });
        quest = saved;
        if (relayWrite) quest = await relayWrite.set(saved, legs);
        await images.save();
        if (stepInput.value.trim()) {
          drafts.push({ quest: null, title: stepInput.value.trim(), done: false, removed: false }); stepInput.value = "";
        }
        for (const draft of drafts) {
          if (draft.removed) {
            if (draft.quest && draft.quest.lifecycleState !== "archived")
              draft.quest = await port.update(draft.quest, { lifecycleState: "archived", expectedUpdatedAt: draft.quest.updatedAt });
            continue;
          }
          if (!draft.quest) draft.quest = await port.create({ kind: "todo", title: draft.title, notes: "", difficulty: "easy", impact: "medium", lifecycleState: "active", nextAction: "", estimatedMinutes: 0, dueDate: "",
            scheduledDate: "", scheduledTime: "", planningMode: "on_date", planningState: "backlog", parentQuestId: quest.id });
          if (draft.done !== forDay(draft.quest, today).done) {
            draft.quest = draft.done ? (await port.complete(draft.quest)).quest : await port.update(draft.quest, { lifecycleState: "active", expectedUpdatedAt: draft.quest.updatedAt });
          }
        }
        dialog.close();
        say(firstHand ? tx("{name} に渡しました", { name: relay.nameOf(legs[0]!.agentId) }) : tx("保存しました"));
        } catch (cause) {
          error.textContent = tx("保存できませんでした。入力を残しています。最新の状態を確認してから再試行してください。");
          error.hidden = false; throw cause;
        } finally { saving = false; saveButton.textContent = tx("保存"); }
      }, tx("保存できませんでした。もう一度試してください。"));
    });
    const opener = document.activeElement;
    dialog.addEventListener("close", () => {
      images.dispose();
      window.removeEventListener("resize", resizeFields);
      dialog.remove();
      if (sheet === dialog) { sheet = null; closeSheet = null; sheetDirty = null; repaintSheet = null; }
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      else main.querySelector<HTMLElement>('[data-quest-id="' + CSS.escape(quest.id) + '"]')?.focus({ preventScroll: true });
    });
    sheet = dialog;
    document.body.append(dialog);
    dialog.showModal();
    title.focus();
  }

  /* ------------------------------ screens ------------------------------ */

  /** A centered picker on wide screens and a bottom sheet on phones. */
  function picker(title: string, sub: string, ...body: (HTMLElement | null)[]): HTMLDialogElement {
    const close = el("button", { type: "button", class: "a4-icon-button", "aria-label": tx("閉じる") }, glyph(X));
    const dialog = el("dialog", { class: "a4-capture-dialog a4-picker", "aria-label": title },
      el("div", { class: "a4-sheet-head" }, el("div", {}, el("h2", { class: "a4-subtitle" }, title), sub ? el("p", { class: "a4-meta" }, sub) : null), close), ...body);
    close.addEventListener("click", () => dialog.close());
    const opener = document.activeElement;
    dialog.addEventListener("close", () => { dialog.remove(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); });
    document.body.append(dialog); dialog.showModal();
    return dialog;
  }
  function pickRow(icon: string | HTMLElement, title: string, hint: string, tail: IconNode | null, action: () => void): HTMLElement {
    const node = el("button", { type: "button", class: "a4-pick" }, typeof icon === "string" ? el("span", { class: "a4-pick-icon", "aria-hidden": "true" }, icon) : icon,
      el("span", { class: "a4-pick-copy" }, el("strong", {}, title), hint ? el("small", {}, hint) : null), tail ? glyph(tail) : null);
    node.addEventListener("click", action);
    return el("li", {}, node);
  }

  function chooseTask(): void {
    if (sheet) { closeSheet?.(chooseTask); return; }
    const today = port.today();
    const candidates = nextCandidates(quests(), today).filter(q => q.id !== focusQuest?.id);
    const at = nowMinutes();
    const next = candidates.filter(q => q.scheduledTime && toMinutes(q.scheduledTime) > at).sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime))[0];
    // A few short untimed tasks first; everything else waits behind one line.
    const quick = candidates.filter(q => !q.scheduledTime).sort((a, b) => (a.estimatedMinutes || 999) - (b.estimatedMinutes || 999)).slice(0, 3);
    const rest = candidates.filter(q => !quick.includes(q));
    const row = (q: Quest) => {
      const parent = q.parentQuestId ? byId(q.parentQuestId) : null;
      return pickRow(q.icon || "", q.title, [parent ? parent.title : q.scheduledTime || tx("時刻未定"), q.estimatedMinutes > 0 ? minutesLabel(q.estimatedMinutes) : ""].filter(Boolean).join(" · "), ChevronRight,
        () => { focusId = q.id; dialog.close(); render(); });
    };
    const more = rest.length === 0 ? null : el("details", { class: "a4-pick-more", open: quick.length === 0 },
      el("summary", {}, tx("ほかのタスク {count}件", { count: rest.length })), el("ul", { class: "a4-picks" }, ...rest.map(row)));
    const dialog = picker(tx("今やるタスクを選ぶ"), next ? tx("次の予定 {time} まで、あと{left}", { time: next.scheduledTime, left: minutesLabel(toMinutes(next.scheduledTime) - at) }) : "",
      candidates.length === 0 ? el("div", { class: "a4-pick-empty" }, el("p", {}, tx("今日の候補はありません。")), button(tx("タスクを見る"), () => { dialog.close(); go("all"); }))
        : el("ul", { class: "a4-picks" }, ...quick.map(row)), more,
      candidates.length === 0 ? null : (() => { const all = button(tx("タスクの一覧から選ぶ"), () => { dialog.close(); go("all"); }, "link"); all.classList.add("a4-pick-all"); all.append(glyph(ArrowRight)); return all; })());
  }

  /** What to do with a free stretch: place something that fits, write a new task, or leave it open. */
  function chooseGap(gap: { start: number; minutes: number }): void {
    const today = port.today();
    const proposed = proposalFor(quests(), gap, today);
    const fits = groups(quests(), today).inbox.filter(q => q.estimatedMinutes > 0 && q.estimatedMinutes <= gap.minutes && q.id !== proposed?.id).slice(0, 3);
    const put = (q: Quest) => { dialog.close(); if (q.proposal) acceptProposal(q); else update(q, { ...plan(today), scheduledTime: clock(gap.start), expectedUpdatedAt: q.updatedAt }, tx("{time}に「{title}」を入れました", { time: clock(gap.start), title: q.title }), previousPlan(q)); };
    const dialog = picker(tx("この余白をどう使う？"), `${clock(gap.start)}–${clock(gap.start + gap.minutes)} · ${minutesLabel(gap.minutes)}`,
      el("ul", { class: "a4-picks" },
        proposed?.proposal ? pickRow(el("span", { class: "a4-avatar", "data-kind": "agent", "aria-hidden": "true" }, proposed.proposal.label.slice(0, 1)), proposed.title,
          `${minutesLabel(proposed.proposal.minutes)} · ${tx("{name}の提案", { name: proposed.proposal.label })}`, Plus, () => put(proposed)) : null,
        ...fits.map(q => pickRow(q.icon || "", q.title, minutesLabel(q.estimatedMinutes), Plus, () => put(q))),
        pickRow(glyphNode(Plus), tx("新しく書く"), tx("この時間に入れるタスクを追加します"), null, () => { dialog.close(); openCapture(); captureInput.value = `${clock(gap.start)} `; paintParse(); }),
        pickRow(glyphNode(Sun), tx("ひと息つく"), tx("何も入れず、この時間を残します。"), null, () => {
          dialog.close(); rests.add(gap.start); store.set("a4-rest:" + today, [...rests].join(",")); say(tx("この時間は、そのまま空けておきます")); render();
        })));
  }
  const glyphNode = (icon: IconNode) => el("span", { class: "a4-pick-icon", "aria-hidden": "true" }, glyph(icon));
  const rests = new Set((store.get("a4-rest:" + port.today()) ?? "").split(",").filter(Boolean).map(Number));

  function aiRail(): HTMLElement {
    const ai = agentSummary(quests(), port.today());
    const asks = [...quests().filter(needsDecision), ...ai.blocked];
    const open = (label: string, action: () => void) => { const node = button(label, action, "link"); node.append(glyph(ArrowRight)); return node; };
    return el("aside", { class: "a4-ai", "aria-label": tx("ギルド") },
      el("div", { class: "a4-group-head" }, glyph(Users), el("h2", { class: "a4-subtitle" }, tx("ギルド")),
        asks.length ? el("span", { class: "a4-ask-count" }, tx("あなたの判断 {count}件", { count: asks.length })) : null),
      ...asks.slice(0, 3).map(q => {
        const blocked = !needsDecision(q);
        const note = blocked ? q.handoff?.blockedReason || q.nextAction : "";
        const name = q.assignee.label || "Agent";
        const act = button(blocked ? tx("判断する") : tx("内容を確認"), () => go("guild", q.id));
        act.append(glyph(ArrowRight));
        return el("div", { class: "a4-ask" }, el("p", { class: "a4-ask-state" }, blocked ? tx("止まっています") : tx("確認待ち")),
          el("strong", {}, q.title), note ? el("p", { class: "a4-ask-note" }, note) : null,
          el("div", { class: "a4-ask-row" }, el("span", { class: "a4-avatar a4-avatar-agent", "aria-hidden": "true" }, name.slice(0, 1)), el("span", {}, name), act));
      }),
      asks.length ? null : el("p", { class: "a4-muted" }, tx("いま、あなたの判断を待っているものはありません。")),
      el("div", { class: "a4-ai-foot" },
        ai.working.length + ai.ready.length ? el("p", { class: "a4-muted" }, tx("作業中 {working}件 · 受け取り待ち {ready}件", { working: ai.working.length, ready: ai.ready.length })) : null,
        open(tx("ギルドを開く"), () => go("guild"))));
  }

  function currentFocus(): Quest | null {
    const candidates = nextCandidates(quests(), port.today());
    return candidates.find(isWorking) ?? candidates.find(q => q.id === focusId) ?? candidates[0] ?? null;
  }

  function nowView(): HTMLElement {
    const today = port.today();
    const focus = currentFocus();
    focusQuest = focus;
    const focusParent = focus?.parentQuestId ? byId(focus.parentQuestId) : null;
    const focusDisplay = focusParent ?? focus;
    const { anytime, timed } = dayPlan(displayQuests(), today);
    const todays = [...anytime, ...timed];
    const next = timed.find(q => !isDone(q) && q.id !== focus?.id && q.id !== focusParent?.id && toMinutes(q.scheduledTime) > nowMinutes());
    const doneToday = todays.filter(isDone);
    const doneCount = doneToday.length;
    const summary = el("p", { class: "a4-summary" }, el("strong", {}, `${doneCount} / ${todays.length}`), el("span", {}, tx("完了")),
      el("span", { class: "a4-progress", "aria-hidden": "true", style: `--a4-done: ${todays.length ? Math.round(doneCount / todays.length * 100) : 0}%` }),
      el("span", {}, tx("残り {time}", { time: minutesLabel(plannedMinutes(todays.filter(q => !isDone(q)))) })));
    const at = nowMinutes();
    const focusSteps = focusDisplay ? children(focusDisplay) : [];
    const focusSpan = focusDisplay?.scheduledTime ? `${focusDisplay.scheduledTime}–${clock(endOf(focusDisplay))}` : "";
    // Inside its planned slot the card counts down to the slot's end; otherwise it shows the estimate.
    const focusLeft = focusDisplay?.scheduledTime && toMinutes(focusDisplay.scheduledTime) <= at && endOf(focusDisplay) > at ? tx("あと{time}", { time: minutesLabel(endOf(focusDisplay) - at) }) : "";
    const withIcon = (node: HTMLElement, icon: IconNode, first = false) => { if (first) node.prepend(glyph(icon)); else node.append(glyph(icon)); return node; };
    const heading = el("div", { class: "a4-page-heading" },
      el("h1", { class: "a4-date", tabindex: -1 }, dateLabel.format(noon(today)), el("small", {}, weekdayLong.format(noon(today)))), todays.length ? summary : null);
    const running = focus && isWorking(focus);
    const paused = focus && !running ? pausedMinutes(focus) : 0;
    const pausedLeft = paused && focus && focus.estimatedMinutes > paused ? tx("あと{time}", { time: minutesLabel(focus.estimatedMinutes - paused) }) : "";
    const card = focus ? el("article", { class: "a4-focus", "data-running": String(running) },
      el("div", { class: "a4-focus-head" }, el("span", { class: "a4-focus-label" }, glyph(running ? Play : paused ? Pause : Flag), running ? tx("いま取り組んでいます") : paused ? tx("一時停止中 · {time} 進めました", { time: minutesLabel(paused) }) : tx("今の1件")),
        focusSpan ? el("span", { class: "a4-focus-span" }, focusSpan) : null,
        (() => { const more = button("", () => openSheet(focus)); more.className = "a4-icon-button"; more.setAttribute("aria-label", tx("詳しく")); more.append(glyph(MoreHorizontal)); return more; })()),
      el("div", { class: "a4-focus-title" }, iconCircle(focusDisplay!, "sm"), titleButton(focusDisplay!)),
      el("div", { class: "a4-step" },
        el("p", { class: "a4-step-head" }, el("span", { class: "a4-step-label" }, tx("次の一歩")),
          focusSteps.length ? el("span", {}, tx("ステップ {done}/{total}", { done: focusSteps.filter(isDone).length, total: focusSteps.length })) : null),
        el("p", { class: "a4-step-text" }, focus.nextAction || (focusParent ? focus.title : tx("まずは、できるところから。")))),
      el("div", { class: "a4-actions" },
        running ? withIcon(button(tx("完了する"), () => complete(focus), "primary"), Check, true) : withIcon(button(paused ? tx("続ける") : tx("始める"), () => start(focus), "primary"), Play, true),
        running ? el("span", { class: "a4-focus-time a4-run-inline" }, glyph(Clock3), (() => { const node = runTimer(focus); node.querySelector("small")!.textContent = focus.estimatedMinutes > 0 ? `/ ${minutesLabel(focus.estimatedMinutes)}` : ""; return node; })()) : focusLeft || pausedLeft || focus.estimatedMinutes ? el("span", { class: "a4-focus-time" }, glyph(Clock3), focusLeft || pausedLeft || minutesLabel(focus.estimatedMinutes)) : button(tx("＋目安"), () => openSheet(focus), "link"),
        running ? button(tx("一時停止"), () => pause(focus), "link") : withIcon(button(tx("別のタスク"), chooseTask, "link"), ChevronRight)))
      : doneToday.length > 0
        // Everything planned for today is done: say so, and do not push another task.
        ? el("div", { class: "a4-focus a4-all-done" },
          el("div", { class: "a4-focus-head" }, el("span", { class: "a4-focus-label" }, glyph(Sun), tx("今日"))),
          el("h2", { class: "a4-focus-title" }, tx("今日の分は終わりました")),
          el("p", { class: "a4-muted" }, tx("{count}件 完了 · 合計 {time}", { count: doneToday.length, time: minutesLabel(doneToday.reduce((sum, q) => sum + q.estimatedMinutes, 0)) })),
          el("div", { class: "a4-actions" }, button(tx("明日の予定を見る"), () => { planDate = addDays(today, 1); go("plan"); }), button(tx("もう1件だけ選ぶ"), chooseTask, "link")))
        : el("div", { class: "a4-empty a4-empty-focus" }, glyph(Sun), el("h2", { class: "a4-subtitle" }, tx("今日の1件を、ここから。")),
          el("p", { class: "a4-muted" }, tx("頭にあることを書き出すところから。")), withIcon(button(tx("タスクを追加"), openCapture, "primary"), Plus, true));
    const nextRow = next ? button("", () => openSheet(next), "link") : el("p", { class: "a4-next-preview a4-muted" });
    nextRow.className = "a4-next-preview";
    nextRow.append(el("span", { class: "a4-step-label" }, tx("次の予定")));
    if (next) nextRow.append(el("strong", {}, next.scheduledTime), el("span", { class: "a4-next-title" }, next.title),
      el("span", { class: "a4-next-left" }, tx("あと{time}", { time: minutesLabel(toMinutes(next.scheduledTime) - at) })), glyph(ArrowRight));
    else nextRow.append(el("span", {}, tx("時刻の決まった予定はありません。")));
    return el("div", { class: "a4-today-page" }, heading,
      refreshError ? el("p", { class: "a4-refresh-error", role: "status" }, tx("再取得できませんでした。表示中の内容を残しています。"), button(tx("もう一度"), onFocus, "link")) : null,
      el("div", { class: "a4-today-grid" },
        el("section", { class: "a4-home" }, el("div", { class: "a4-now" }, card, focus || todays.length ? nextRow : null, decisionNotice()),
          focus || todays.length ? el("div", { class: "a4-today-flow" }, todayTimeline(), runtime && focus ? workFold(focus) : null) : null),
        aiRail()));
  }

  /** Month at a glance in the week grid's language: Monday-first weeks, a few pills per day, "+N件" opens the day. */
  function monthGrid(list: readonly Quest[]): HTMLElement {
    const today = port.today();
    const month = planDate.slice(0, 7);
    const start = weekOf(`${month}-01`)[0]!;
    const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    const openDay = (date: string) => { planDate = date; planMode = "day"; store.set("a4-plan-mode", null); render(); };
    const cells = days.map(date => {
      const { anytime, timed } = dayPlan(list, date);
      // Habits sit on the line above the month, so the cells keep to planned work.
      const items = [...timed, ...anytime].filter(q => q.kind !== "daily").sort((a, b) => Number(isDone(a)) - Number(isDone(b)));
      const shown = items.slice(0, MONTH_PILLS);
      const head = el("button", { type: "button", class: "a4-wk-day a4-mo-day", "aria-pressed": String(date === planDate), "data-today": String(date === today),
        "aria-label": calendarLabel(date, items) },
        el("span", { class: "a4-day-num" }, String(Number(date.slice(8)))),
        loadOf(items) > 0 ? loadMarks(items)[0]! : null);
      // Phones show the load only; the chosen day's tasks are listed under the grid.
      head.addEventListener("click", () => { planDate = date; render(); });
      const hidden = items.length - shown.length;
      const more = hidden === 0 ? null : el("button", { type: "button", class: "a4-mo-more", "aria-label": tx("{day} ほか{count}件を日表示で見る", { day: dayLabel.format(noon(date)), count: hidden }) }, tx("+{count}件", { count: hidden }));
      more?.addEventListener("click", () => openDay(date));
      return el("div", { class: "a4-mo-cell", "data-selected": String(date === planDate), "data-outside": String(date.slice(0, 7) !== month) },
        head,
        ...shown.map(q => el("div", { class: "a4-mo-item", "data-tone": tone(q) }, titleButton(q))),
        more);
    });
    const chosen = (({ anytime, timed }) => [...timed, ...anytime])(dayPlan(list, planDate)).filter(q => q.kind !== "daily" && !isDone(q));
    const openLink = button(tx("この日を開く"), () => openDay(planDate), "link");
    openLink.append(glyph(ArrowRight));
    return el("div", { class: "a4-mo-wrap" },
      el("div", { class: "a4-mo" },
        ...weekOf(start).map(date => el("span", { class: "a4-day-name a4-mo-name" }, weekdayLabel.format(noon(date)))),
        ...cells),
      el("section", { class: "a4-mo-preview" },
        el("div", { class: "a4-group-head" }, el("h2", { class: "a4-subtitle" }, `${dateLabel.format(noon(planDate))} ${weekdayLong.format(noon(planDate))}`), openLink),
        chosen.length === 0 ? el("p", { class: "a4-muted" }, tx("予定なし")) : el("ul", { class: "a4-wl" }, ...chosen.map(q => {
          const node = el("button", { type: "button", class: "a4-wl-item", "data-tone": tone(q), "data-quest-id": q.id },
            el("span", { class: "a4-wl-time" }, q.scheduledTime || tx("未定")), el("span", { class: "a4-wl-title" }, q.icon ? q.icon + " " : "", q.title));
          node.addEventListener("click", () => openSheet(q));
          return el("li", {}, node);
        }))));
  }

  const shiftMonth = (date: string, months: number) => {
    const first = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
    first.setUTCMonth(first.getUTCMonth() + months);
    return first.toISOString().slice(0, 10);
  };

  /** Recorded time for the task in focus and its history, folded under 今; the time settings live in 設定. */
  function workFold(focus: Quest): HTMLElement {
    const fold = el("details", { class: "a4-after a4-extra a4-work-fold", open: workOpen },
      el("summary", { class: "a4-subtitle" }, glyph(Clock3), tx("時間の記録")),
      el("p", { class: "a4-muted" }, tx("この作業の記録：{time}", { time: workUi.totals(focus) })),
      el("p", {}, button(tx("記録の履歴"), () => workUi.history(), "link")));
    fold.addEventListener("toggle", () => { workOpen = fold.open; });
    return fold;
  }

  /** Week at a glance: an "anytime" row, then an hourly axis with cards sized by duration. */
  /** A day's load counts planned work; habits that come back every day are left out. */
  const loadOf = (items: readonly Quest[]) => plannedMinutes(items.filter(q => q.kind !== "daily"));
  const loadMarks = (items: readonly Quest[]) => [
    // The bar fills at six planned hours.
    el("span", { class: "a4-progress a4-day-load", "aria-hidden": "true", style: `--a4-done: ${Math.min(100, Math.round(loadOf(items) / 3.6))}%` }),
    el("span", { class: "a4-day-total" }, loadOf(items) > 0 ? minutesLabel(loadOf(items)) : tx("予定なし"))];

  /** Habits appear once above the week or month instead of in every day. */
  function dailyLine(list: readonly Quest[]): HTMLElement | null {
    const dailies = list.filter(q => q.kind === "daily" && q.lifecycleState !== "archived" && !q.parentQuestId);
    if (dailies.length === 0) return null;
    return el("div", { class: "a4-daily-line" }, el("span", { class: "a4-daily" }, glyph(Repeat2), tx("毎日")),
      ...dailies.map(q => { const node = button("", () => openSheet(q), "link"); node.append(q.icon ? q.icon + " " : "", el("strong", {}, q.title), q.estimatedMinutes > 0 ? el("small", {}, minutesLabel(q.estimatedMinutes)) : ""); return node; }));
  }

  /** The week on a phone: one block per day from today on, earlier days folded. Finished work is only counted. */
  function weekList(list: readonly Quest[]): HTMLElement {
    const today = port.today();
    const blank = weekOf(planDate).every(date => { const plan = dayPlan(list, date); return plan.timed.length + plan.anytime.filter(q => q.kind !== "daily").length === 0; });
    const block = (date: string) => {
      const plan = dayPlan(list, date);
      const items = [...plan.timed, ...plan.anytime].filter(q => q.kind !== "daily");
      const done = items.filter(isDone).length;
      const head = el("button", { type: "button", class: "a4-wl-date", "data-today": String(date === today), "aria-label": calendarLabel(date, items) },
        el("span", { class: "a4-day-name" }, weekdayLabel.format(noon(date))), el("span", { class: "a4-day-num" }, String(Number(date.slice(8)))));
      head.addEventListener("click", () => { planDate = date; planMode = "day"; store.set("a4-plan-mode", null); render(); window.scrollTo(0, 0); });
      return el("li", { class: "a4-wl-day" }, head,
        el("div", { class: "a4-wl-plan" },
          blank ? (date < today ? null : (() => { const add = button(tx("予定を入れる"), () => addOn(date), "link"); add.classList.add("a4-wl-add"); add.append(glyph(Plus)); return add; })())
            : el("p", { class: "a4-wl-top" }, ...loadMarks(items), done ? el("span", { class: "a4-wl-done" }, tx("完了 {count}", { count: done })) : null),
          ...items.filter(q => !isDone(q)).map(q => {
            const node = el("button", { type: "button", class: "a4-wl-item", "data-tone": tone(q), "data-quest-id": q.id },
              el("span", { class: "a4-wl-time" }, q.scheduledTime || tx("未定")), el("span", { class: "a4-wl-title" }, q.icon ? q.icon + " " : "", q.title));
            node.addEventListener("click", () => openSheet(q));
            return node;
          })));
    };
    const days = weekOf(planDate);
    const past = days.filter(date => date < today);
    const shown = days.filter(date => past.length === 7 || date >= today);
    const fold = el("details", { class: "a4-earlier", open: openFolds.has("week-past") },
      el("summary", {}, tx("それより前"), el("span", {}, tx("{count}日", { count: past.length }))), el("ul", { class: "a4-wl" }, ...past.map(block)));
    fold.addEventListener("toggle", () => { if (fold.open) openFolds.add("week-past"); else openFolds.delete("week-past"); });
    return el("div", { class: "a4-wl-wrap" }, past.length && past.length < 7 && !blank ? fold : null, el("ul", { class: "a4-wl" }, ...shown.map(block)));
  }

  function weekGrid(list: readonly Quest[]): HTMLElement {
    const today = port.today();
    const days = weekOf(planDate);
    const plans = days.map(date => dayPlan(list, date));
    const blank = plans.every(plan => plan.timed.length + plan.anytime.filter(q => q.kind !== "daily").length === 0);
    const timed = plans.flatMap(p => p.timed);
    const first = Math.min(8, ...timed.map(q => Math.floor(toMinutes(q.scheduledTime) / 60)));
    const last = Math.min(24, Math.max(20, ...timed.map(q => Math.ceil(endOf(q) / 60))));
    const top = (minutes: number) => `${(minutes - first * 60) * GRID_PX}px`;
    const card = (quest: Quest, date: string, extra: Record<string, unknown> = {}) => {
      const steps = children(quest);
      const length = quest.scheduledTime ? endOf(quest) - toMinutes(quest.scheduledTime) : 0;
      const info = [quest.scheduledTime ? `${quest.scheduledTime}–${clock(endOf(quest))}` : "", length >= 30 || !quest.scheduledTime ? (quest.estimatedMinutes > 0 ? minutesLabel(quest.estimatedMinutes) : "") : "",
        steps.length > 0 ? `${steps.filter(isDone).length}/${steps.length}` : ""].filter(Boolean).join(" · ");
      const node = el("button", { type: "button", class: "a4-wk-item", "data-tone": tone(quest), "data-quest-id": quest.id, "aria-label": quest.title + " · " + date + " · " + info, ...extra },
        el("span", { class: "a4-wk-text" }, el("span", { class: "a4-wk-title" }, quest.icon ? quest.icon + " " : "", quest.title),
          !quest.scheduledTime && quest.estimatedMinutes > 0 ? el("span", { class: "a4-meta" }, minutesLabel(quest.estimatedMinutes)) : null),
        isDone(quest) ? glyph(Check) : null);
      node.addEventListener("click", () => openSheet(quest));
      return node;
    };
    const head = days.map((date, index) => {
      const node = el("button", { type: "button", class: "a4-wk-day", "aria-pressed": String(date === planDate), "data-today": String(date === today),
        "aria-label": calendarLabel(date, [...plans[index]!.anytime, ...plans[index]!.timed]) },
        el("span", { class: "a4-day-name" }, weekdayLabel.format(noon(date))),
        el("span", { class: "a4-day-num" }, String(Number(date.slice(8)))),
        ...(blank ? [] : loadMarks([...plans[index]!.anytime, ...plans[index]!.timed])));
      node.addEventListener("click", () => { planDate = date; render(); window.scrollTo(0, 0); });
      return node;
    });
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const hours = Array.from({ length: last - first }, (_, i) => el("span", { style: `top: ${top((first + i) * 60)}` }, clock((first + i) * 60)));
    const columns = days.map((date, index) => {
      // Overlapping cards split the column into lanes; past MAX_LANES the rest fold into "+N件".
      const clusters: { start: number; end: number; items: { quest: Quest; lane: number }[]; lanes: number }[] = [];
      let laneEnds: number[] = [];
      for (const quest of plans[index]!.timed) {
        const start = toMinutes(quest.scheduledTime), end = Math.max(Math.min(1440, endOf(quest)), start + 30 / GRID_PX);
        let current = clusters[clusters.length - 1];
        if (!current || start >= current.end) { current = { start, end, items: [], lanes: 0 }; clusters.push(current); laneEnds = []; }
        let lane = laneEnds.findIndex(laneEnd => laneEnd <= start);
        if (lane < 0) lane = laneEnds.push(0) - 1;
        laneEnds[lane] = end;
        current.end = Math.max(current.end, end);
        current.lanes = laneEnds.length;
        current.items.push({ quest, lane });
      }
      const items = clusters.flatMap(cluster => {
        const folded = cluster.lanes > MAX_LANES;
        const lanes = Math.min(cluster.lanes, MAX_LANES);
        const shown = folded ? cluster.items.filter(item => item.lane < MAX_LANES - 1) : cluster.items;
        const place = (lane: number) => `left: calc(${(lane / lanes) * 100}% + 3px); width: calc(${100 / lanes}% - 6px)`;
        const cards = shown.map(({ quest, lane }) => {
          const start = toMinutes(quest.scheduledTime), height = Math.max(28, (Math.min(1440, endOf(quest)) - start) * GRID_PX - 2);
          return card(quest, date, { "data-short": String(height < 44), "data-narrow": String(lanes > 1), style: `top: calc(${top(start)} + 1px); height: ${height}px; ${place(lane)}` });
        });
        if (!folded) return cards;
        const hidden = cluster.items.length - shown.length;
        const more = el("button", { type: "button", class: "a4-wk-more", "aria-label": tx("{day} ほか{count}件を日表示で見る", { day: dayLabel.format(noon(date)), count: hidden }),
          style: `top: ${top(cluster.start)}; height: ${Math.max(28, (cluster.end - cluster.start) * GRID_PX - 2)}px; ${place(MAX_LANES - 1)}` }, tx("+{count}件", { count: hidden }));
        more.addEventListener("click", () => { planDate = date; planMode = "day"; store.set("a4-plan-mode", null); render(); });
        return [...cards, more];
      });
      const nowLine = date === today && nowMinutes >= first * 60 && nowMinutes <= last * 60 ? el("div", { class: "a4-wk-now", style: `top: ${top(nowMinutes)}`, "aria-hidden": "true" }) : null;
      if (nowLine) hours.push(el("span", { class: "a4-wk-now-time", style: `top: ${top(nowMinutes)}` }, clock(nowMinutes)));
      const col = el("div", { class: "a4-wk-col", "data-selected": String(date === today) }, nowLine, ...items);
      col.addEventListener("click", event => {
        if (event.target !== col || date < today) return;
        addOn(date, clock(first * 60 + Math.floor(event.offsetY / GRID_PX / 30) * 30));
      });
      return col;
    });
    return el("div", { class: "a4-wk-scroll", tabindex: 0, role: "region", "aria-label": tx("この週"), "data-blank": String(blank) },
      blank ? el("p", { class: "a4-wk-hint" }, tx("時間を選ぶと、そこに予定を入れられます。")) : null,
      el("div", { class: "a4-wk", style: `--a4-wk-height: ${(last - first) * 60 * GRID_PX}px; --a4-wk-hour: ${60 * GRID_PX}px` },
        el("span", { class: "a4-wk-corner" }), ...head,
        ...(blank ? [] : [el("span", { class: "a4-wk-label" }, tx("未定")),
          ...plans.map((plan, index) => el("div", { class: "a4-wk-allday" }, ...plan.anytime.filter(q => q.kind !== "daily").map(q => card(q, days[index]!))))]),
        el("div", { class: "a4-wk-hours", "aria-hidden": "true" }, ...hours),
        ...columns));
  }

  const nowMinutes = () => { const now = new Date(); return now.getHours() * 60 + now.getMinutes(); };
  const nowLine = (at: number) => el("li", { class: "a4-now-line" }, el("span", { class: "a4-slot-time" }, clock(at)), el("span", { class: "a4-now-label" }, tx("いま")));

  /** Timed tasks sized by duration, with the current time and free stretches worth noticing (the plan view). */
  /**
   * A free stretch ahead today, offered as a choice: one inbox task that fits, or a rest. Only the next
   * stretch shows its choices; later ones open on request so the same suggestion is not repeated.
   */
  function freeRow(gap: { start: number; minutes: number }, offer: boolean): HTMLElement {
    const today = port.today();
    if (rests.has(gap.start)) {
      const rest = button(tx("休憩 {time}", { time: minutesLabel(gap.minutes) }), () => { rests.delete(gap.start); store.set("a4-rest:" + today, [...rests].join(",") || null); render(); }, "link");
      rest.setAttribute("aria-label", tx("休憩 {time}", { time: minutesLabel(gap.minutes) }) + " · " + tx("やめる"));
      return el("li", { class: "a4-free a4-rest" }, rest);
    }
    const add = button(tx("予定を入れる"), () => chooseGap(gap), "link");
    add.append(glyph(Plus));
    const proposed = offer ? proposalFor(quests(), gap, today) : null;
    const fit = offer && !proposed ? fitForGap(quests(), gap.minutes, today) : null;
    const pick = proposed ?? fit;
    const take = pick ? button(tx("ここに入れる"), () => proposed?.proposal ? acceptProposal(proposed)
      : update(pick, { ...plan(today), scheduledTime: clock(gap.start), expectedUpdatedAt: pick.updatedAt }, tx("{time}に「{title}」を入れました", { time: clock(gap.start), title: pick.title }), previousPlan(pick)), "link") : null;
    return el("li", { class: "a4-free" },
      el("div", { class: "a4-free-line" }, el("p", { class: "a4-free-head" }, tx("{time}の余白", { time: minutesLabel(gap.minutes) })), add),
      pick ? el("div", { class: "a4-free-pick" },
        el("div", {}, el("small", {}, proposed?.proposal ? `${tx("{name}の提案", { name: proposed.proposal.label })} · ${minutesLabel(proposed.proposal.minutes)}` : `${tx("受け箱から")} · ${minutesLabel(pick.estimatedMinutes)}`), el("strong", {}, pick.title)), take) : null);
  }

  /** A timeline card's quiet line: how long, and what marks it as the one in hand. */
  function slotMeta(quest: Quest): HTMLElement | null {
    const steps = children(quest);
    const parts = [quest.estimatedMinutes > 0 ? minutesLabel(quest.estimatedMinutes) : "",
      steps.length > 0 ? tx("ステップ {done}/{total}", { done: steps.filter(isDone).length, total: steps.length }) : "",
      quest.assignee.type !== "self" ? tx("担当 {name}", { name: quest.assignee.label || "Agent" }) : ""].filter(Boolean).join(" · ");
    const mark = isWorking(quest) ? tx("作業中") : tone(quest) === "focus" ? tx("今の1件") : "";
    return mark || parts ? el("span", { class: "a4-meta" }, mark ? el("strong", {}, mark) : null, parts) : null;
  }

  /** Today's rows for the Now screen: evenly spaced cards; duration shows in the pill's height. */
  function homeRows(timed: readonly Quest[], isToday: boolean, date = port.today()): HTMLElement[] {
    const at = nowMinutes();
    const free = isToday ? freeAhead(timed, at) : [];
    let nowShown = !isToday;
    const rows: HTMLElement[] = [];
    for (const quest of timed) {
      const start = toMinutes(quest.scheduledTime), end = endOf(quest);
      if (!nowShown && at < start) { rows.push(nowLine(at)); nowShown = true; }
      const gap = free.find(g => g.before === quest.id);
      if (gap) rows.push(freeRow(gap, view === "now" && gap === free[0]));
      rows.push(el("li", { class: "a4-slot", "data-tone": tone(quest), "data-hue": hue(quest), ...running(quest, end - start), style: `--a4-cap: ${Math.round(Math.max(40, Math.min(96, 24 + (end - start) * 0.6)))}px` },
        el("span", { class: "a4-slot-time" }, quest.scheduledTime, el("small", {}, clock(end))),
        el("span", { class: "a4-slot-pill", "aria-hidden": "true" }, quest.icon ?? ""),
        el("div", { class: "a4-slot-card" }, el("div", { class: "a4-row-text" }, titleButton(quest), slotMeta(quest)), checkButton(quest, date))));
    }
    if (!nowShown && timed.length > 0) rows.push(nowLine(at));
    return rows;
  }

  /** Today beside the focus card, with finished stretches more than an hour back folded away. */
  function dayTimeline(date: string): HTMLElement {
    const today = port.today();
    const day = dayPlan(displayQuests(), date);
    const earlier = date === today ? day.timed.filter(q => !isWorking(q) && endOf(q) <= nowMinutes()) : [];
    const timed = day.timed.filter(q => !earlier.includes(q));
    const fold = el("details", { class: "a4-earlier", open: openFolds.has("past:" + date), "data-fold": "past:" + date },
      el("summary", {}, tx("それより前"), el("span", {}, String(earlier.length))),
      el("ol", { class: "a4-timeline", "data-even": "" }, ...homeRows(earlier, false, date)));
    fold.addEventListener("toggle", () => { if (fold.open) openFolds.add("past:" + date); else openFolds.delete("past:" + date); });
    return el("div", { class: "a4-day-flow" },
      earlier.length ? fold : null,
      el("div", { class: "a4-today-panel" },
        timed.length ? el("ol", { class: "a4-timeline", "data-even": "" }, ...homeRows(timed, date === today, date))
          : el("p", { class: "a4-muted" }, tx("時刻の決まった予定はありません。"))),
      day.anytime.length ? el("section", { class: "a4-anytime" }, el("h3", { class: "a4-step-label" }, tx("時刻未定"), el("span", {}, String(day.anytime.length))),
        el("ul", { class: "a4-list" }, ...day.anytime.map(q => el("li", { class: "a4-anytime-row", "data-tone": tone(q) },
          iconCircle(q, "sm"), titleButton(q),
          q.kind === "daily" ? el("span", { class: "a4-daily" }, glyph(Repeat2), tx("毎日")) : null,
          q.estimatedMinutes > 0 ? el("span", { class: "a4-meta" }, minutesLabel(q.estimatedMinutes)) : null, checkButton(q, date))))) : null);
  }

  function todayTimeline(): HTMLElement {
    return el("section", { class: "a4-today", "aria-labelledby": "a4-today-title" },
      el("div", { class: "a4-group-head" }, el("h2", { class: "a4-subtitle", id: "a4-today-title" }, tx("今日のタイムライン")),
        (() => { const link = button(tx("カレンダー"), () => go("plan"), "link"); link.append(glyph(ArrowUpRight)); return link; })()), dayTimeline(port.today()));
  }

  function calendarLabel(date: string, items: readonly Quest[]): string {
    return tx("{day} {count}件、完了 {done}件、作業中 {working}件", { day: dayLabel.format(noon(date)), count: items.length, done: items.filter(isDone).length, working: items.filter(isWorking).length });
  }

  function dayDots(items: readonly Quest[]): HTMLElement {
    return el("span", { class: "a4-dots", "aria-hidden": "true" },
      ...items.slice(0, 3).map(q => el("i", { "data-tone": tone(q) })),
      items.length > 3 ? el("small", {}, "+" + (items.length - 3)) : null);
  }

  function planView(): HTMLElement {
    const today = port.today();
    const dayName = (date: string) => date === today ? tx("今日") : dayLabel.format(noon(date));
    const list = displayQuests();
    const day = dayPlan(list, planDate);
    const dayItems = [...day.anytime, ...day.timed];
    focusQuest = currentFocus();
    // The head sums what the view shows; over a week habits sit on their own line and are left out.
    const spanDays = planMode === "day" ? [planDate] : planMode === "week" ? weekOf(planDate) : [];
    const spanItems = spanDays.flatMap(date => { const plan = dayPlan(list, date); return [...plan.anytime, ...plan.timed]; });
    const headItems = planMode === "day" ? dayItems.filter(q => q.kind !== "daily").concat(dayItems.filter(q => q.kind === "daily").map(q => ({ ...q, estimatedMinutes: 0 })))
      : spanItems.filter(q => q.kind !== "daily");

    const modeButton = (mode: PlanMode, label: string) => {
      const node = el("button", { type: "button", class: "a4-seg-button", "aria-pressed": String(planMode === mode) }, label);
      node.addEventListener("click", () => { planMode = mode; store.set("a4-plan-mode", mode === "day" ? null : mode); render(); });
      return node;
    };
    const shift = (icon: IconNode, step: number, aria: string) => {
      const node = button("", () => { planDate = planMode === "month" ? shiftMonth(planDate, step) : addDays(planDate, step * 7); render(); });
      node.className = "a4-icon-button";
      node.setAttribute("aria-label", aria);
      node.append(glyph(icon));
      return node;
    };
    const weekBlank = weekOf(planDate).every(date => { const plan = dayPlan(list, date); return plan.anytime.length + plan.timed.length === 0; });
    const week = el("div", { class: "a4-week", role: "group", "aria-label": tx("この週") }, ...weekOf(planDate).map(date => {
      const items = (({ anytime, timed }) => [...anytime, ...timed])(dayPlan(list, date));
      const node = el("button", { type: "button", class: "a4-day", "aria-pressed": String(date === planDate), "data-today": String(date === today), "aria-label": calendarLabel(date, items) },
        el("span", { class: "a4-day-name" }, weekdayLabel.format(noon(date))),
        el("span", { class: "a4-day-num" }, String(Number(date.slice(8)))),
        // Load, not a count: the bar fills at six planned hours.
        ...(weekBlank ? [] : loadMarks(items)));
      node.addEventListener("click", () => { planDate = date; render(); window.scrollTo(0, 0); });
      return node;
    }));


    // Undated work sits beside the day (below it on phones), one tap from being planned.
    const all = groups(quests(), today);
    const place = (quest: Quest, move = false) => {
      if (planMode !== "day") {
        const pick = button(tx("日付を選ぶ"), () => openSheet(quest));
        pick.classList.add("a4-place");
        return pick;
      }
      const node = el("button", { type: "button", class: "a4-button a4-place", "aria-label": tx("{title} を{day}に入れる", { title: quest.title, day: dayName(planDate) }), disabled: busy }, move ? tx("{day}日に移す", { day: Number(planDate.slice(8)) }) : tx("{day}日に入れる", { day: Number(planDate.slice(8)) }));
      node.addEventListener("click", () => update(quest, { ...plan(planDate), expectedUpdatedAt: quest.updatedAt }, tx("{day}に入れました", { day: dayName(planDate) }), previousPlan(quest)));
      return node;
    };
    const sideList = (items: readonly Quest[], overdue = false) => el("ul", { class: "a4-list" }, ...items.map(q => el("li", { class: "a4-inbox-row" },
      el("div", { class: "a4-inbox-title" }, iconCircle(q, "sm"), titleButton(q)),
      el("div", { class: "a4-inbox-act" }, el("span", { class: "a4-meta" }, overdue && q.scheduledDate ? tx("予定日 {date}", { date: dateLabel.format(noon(q.scheduledDate)) }) : q.estimatedMinutes > 0 ? minutesLabel(q.estimatedMinutes) : ""), place(q, overdue)))));
    const review = planDate === today ? all.review : [];
    // Below 1380px the inbox is one line that opens a sheet.
    const openInbox = () => {
      const close = button(tx("閉じる"), () => dialog.close(), "link");
      const dialog = el("dialog", { class: "a4-capture-dialog a4-inbox-sheet", "aria-label": tx("受け箱") },
        el("div", { class: "a4-sheet-head" }, el("h2", { class: "a4-subtitle" }, tx("受け箱"), el("span", {}, String(all.inbox.length))), close),
        el("div", { class: "a4-inbox-body" },
          all.inbox.length === 0 ? el("p", { class: "a4-muted" }, tx("受け箱は空です。")) : sideList(all.inbox),
          review.length === 0 ? null : el("h3", { class: "a4-inbox-sub" }, tx("日付を見直す"), el("span", {}, String(review.length))),
          review.length === 0 ? null : sideList(review, true)));
      dialog.addEventListener("click", event => { if (event.target instanceof HTMLElement && event.target.closest(".a4-place, .a4-row-title")) dialog.close(); });
      dialog.addEventListener("close", () => dialog.remove());
      document.body.append(dialog);
      dialog.showModal();
    };
    const inboxLine: HTMLElement | null = all.inbox.length + review.length === 0 ? null : button("", openInbox);
    inboxLine?.classList.add("a4-inbox-line");
    inboxLine?.append(el("strong", {}, tx("受け箱")), el("span", {}, String(all.inbox.length)),
      ...(review.length ? [el("span", { "aria-hidden": "true" }, "·"), el("span", { class: "a4-inbox-line-review" }, tx("日付を見直す"), " ", String(review.length))] : []), glyph(ChevronRight));

    return el("section", { class: "a4-view a4-plan", "data-mode": planMode },
        el("div", { class: "a4-plan-head" },
          el("div", { class: "a4-plan-title" },
            el("h1", { class: "a4-title", tabindex: -1 }, planMode === "month" ? monthLabel.format(noon(planDate)) : planMode === "week" ? `${dateLabel.format(noon(weekOf(planDate)[0]!))} – ${dateLabel.format(noon(weekOf(planDate)[6]!))}` : `${dateLabel.format(noon(planDate))} ${weekdayLong.format(noon(planDate))}`),
            el("p", { class: "a4-plan-sub" }, headItems.length ? tx("{count}件 · {time} · {done}件完了", { count: headItems.length, time: minutesLabel(plannedMinutes(headItems)), done: headItems.filter(isDone).length }) : planMode === "month" ? "" : tx("予定なし"))),
          el("div", { class: "a4-plan-nav" },
            el("div", { class: "a4-seg", role: "group", "aria-label": tx("表示") }, modeButton("day", tx("日")), modeButton("week", tx("週")), modeButton("month", tx("月"))),
            planMode === "month" ? shift(ChevronLeft, -1, tx("前の月")) : shift(ChevronLeft, -1, tx("前の週")),
            planMode === "month" ? shift(ChevronRight, 1, tx("次の月")) : shift(ChevronRight, 1, tx("次の週")),
            button(tx("今日"), () => { planDate = today; render(); }, "link"))),
      el("div", { class: "a4-plan-main" },
        ...(planMode === "month" ? [dailyLine(list), inboxLine, monthGrid(list)] : planMode === "week" ? [dailyLine(list), inboxLine, weekGrid(list), weekList(list)] : [week, inboxLine,
        // An empty day says so once; past days are not offered to fill.
        ...(dayItems.length > 0 ? [dayTimeline(planDate)] : planDate < today ? [el("p", { class: "a4-day-empty" }, tx("この日の予定はありませんでした。"))]
          : [el("div", { class: "a4-day-empty" }, el("p", {}, tx("まだ予定はありません。空いている時間も、大切に。")),
            (() => { const add = button(tx("{day}日に追加", { day: Number(planDate.slice(8)) }), () => addOn(planDate)); add.prepend(glyph(Plus)); return add; })())])])),

      el("aside", { class: "a4-plan-side", "aria-label": tx("日付のないもの") },
        el("h2", { class: "a4-subtitle" }, tx("受け箱"), el("span", {}, String(all.inbox.length))),
        all.inbox.length === 0 ? el("p", { class: "a4-muted" }, tx("受け箱は空です。")) : sideList(all.inbox),
        review.length === 0 ? null : (() => {
          const fold = el("details", { class: "a4-earlier a4-review-fold", open: openFolds.has("review") },
            el("summary", {}, tx("日付を見直す"), el("span", {}, String(review.length))),
            el("p", { class: "a4-muted" }, tx("予定日を過ぎたものです。今日に入れるか、タイトルから日付を変えます。")),
            sideList(review, true));
          fold.addEventListener("toggle", () => { if (fold.open) openFolds.add("review"); else openFolds.delete("review"); });
          return fold;
        })()));
  }

  /** Three numbers for this week (Spine's review): finished, planned time, moved later. */
  function habitSection(): HTMLElement | null {
    const today = port.today();
    const habits = quests().filter(q => q.kind === "daily" && isOpen(q) && q.assignee.type === "self");
    if (habits.length === 0) return null;
    const fold = el("details", { class: "a4-group-fold", open: openFolds.has("group:habit") },
      el("summary", {}, tx("習慣"), el("span", {}, String(habits.length))),
      el("p", { class: "a4-muted" }, tx("この2週間。埋まった点が、できた日です。")),
      el("ul", { class: "a4-list a4-habits" }, ...habits.map(q => {
        const days = habitDays(q, today);
        return el("li", { class: "a4-row a4-habit" }, el("div", { class: "a4-row-main" }, iconCircle(q, "sm"), el("div", { class: "a4-row-text" }, titleButton(q)),
          el("span", { class: "a4-habit-dots", role: "img", "data-tone": "self", "data-hue": hue(q), "aria-label": tx("この2週間で {count} 日", { count: days.filter(Boolean).length }) },
            ...days.map(done => el("i", { "data-done": String(done) })))));
      })));
    fold.addEventListener("toggle", () => { if (fold.open) openFolds.add("group:habit"); else openFolds.delete("group:habit"); });
    return fold;
  }

  /** One line per task: tick, emoji, title, then when and how long on the right. */
  function taskRow(quest: Quest, bucket: Bucket | "done"): HTMLElement {
    const today = port.today();
    const minutes = quest.estimatedMinutes > 0 ? minutesLabel(quest.estimatedMinutes) : "";
    const when = bucket === "today" ? quest.scheduledTime || (quest.kind === "daily" ? "" : tx("時刻未定"))
      : quest.scheduledDate && quest.scheduledDate !== today ? [dateLabel.format(noon(quest.scheduledDate)), quest.scheduledTime].filter(Boolean).join(" ") : "";
    const info = [when, minutes, quest.assignee.type !== "self" ? tx("担当 {name}", { name: quest.assignee.label || "Agent" }) : ""].filter(Boolean).join(" · ");
    const quick = bucket === "inbox" || bucket === "review"
      ? button(tx("今日に入れる"), () => update(quest, { ...plan(today), expectedUpdatedAt: quest.updatedAt }, tx("今日に入れました"), previousPlan(quest)), "link") : null;
    return el("li", { class: "a4-task-row", "data-tone": tone(quest), "data-bucket": bucket }, checkButton(quest), iconCircle(quest), titleButton(quest),
      el("span", { class: "a4-meta" }, tone(quest) === "focus" ? el("strong", {}, tx("今の1件")) : null,
        quest.kind === "daily" ? el("span", { class: "a4-daily" }, glyph(Repeat2), tx("毎日")) : null, info), quick);
  }

  function allView(): HTMLElement {
    const today = port.today();
    focusQuest = currentFocus();
    const all = groups(quests(), today);
    const finished = quests().filter(q => q.done && q.kind !== "reward" && q.kind !== "daily" && q.lifecycleState !== "archived" && !q.parentQuestId).slice(0, 50);
    // Groups a person works from stay open; the rest open on request.
    const section = (key: Bucket | "done", title: string, items: readonly Quest[], shut = false, hint = "") => {
      if (!items.length) return null;
      const id = (shut ? "group:" : "shut:") + key;
      const fold = el("details", { class: "a4-group-fold", open: shut ? openFolds.has(id) : !openFolds.has(id) },
        el("summary", {}, title, el("span", {}, String(items.length))), hint ? el("p", { class: "a4-muted" }, hint) : null,
        el("ul", { class: "a4-list" }, ...items.map(q => taskRow(q, key))));
      fold.addEventListener("toggle", () => { if (fold.open === shut) openFolds.add(id); else openFolds.delete(id); });
      return fold;
    };
    const empty = Object.values(all).every(list => list.length === 0);
    // Search covers finished and put-away tasks too, so nothing is lost; typing repaints only the results.
    const results = el("div", { "aria-live": "polite" });
    const body = el("div", { class: "a4-all-body" });
    const paintSearch = () => {
      const words = search.trim().toLowerCase();
      body.hidden = words !== "";
      if (!words) { replaceChildren(results); clear.hidden = true; return; }
      const rank = (q: Quest) => q.lifecycleState === "archived" ? 2 : isDone(q) ? 1 : 0;
      const all = quests().filter(q => q.kind !== "reward" && `${q.title} ${q.notes ?? ""} ${q.nextAction ?? ""}`.toLowerCase().includes(words))
        .sort((a, b) => rank(a) - rank(b));
      const found = all.slice(0, 50);
      // The hit is marked; a hit only in the memo or next step shows that line so the result explains itself.
      const mark = (text: string) => {
        const parts: (string | HTMLElement)[] = [];
        let rest = text;
        for (let at = rest.toLowerCase().indexOf(words); at >= 0 && words; at = rest.toLowerCase().indexOf(words)) {
          parts.push(rest.slice(0, at), el("mark", {}, rest.slice(at, at + words.length)));
          rest = rest.slice(at + words.length);
        }
        return [...parts, rest];
      };
      const snippet = (text: string) => {
        const at = text.toLowerCase().indexOf(words);
        return (at > 24 ? "…" : "") + text.slice(Math.max(0, at - 24), at + words.length + 40);
      };
      const row = (q: Quest) => {
        const archived = q.lifecycleState === "archived";
        const title = titleButton(q);
        replaceChildren(title, ...mark(q.title));
        const where = q.title.toLowerCase().includes(words) ? null
          : (q.notes ?? "").toLowerCase().includes(words) ? [tx("メモ"), q.notes] as const : [tx("次の一歩"), q.nextAction] as const;
        return el("li", { class: "a4-task-row a4-hit", "data-tone": tone(q), "data-state": archived ? "archived" : isDone(q) ? "done" : "open" },
          archived ? el("span", { class: "a4-check-space", "aria-hidden": "true" }) : checkButton(q),
          el("div", { class: "a4-hit-text" }, title, where ? el("span", { class: "a4-hit-line" }, el("span", {}, where[0]), ...mark(snippet(where[1] ?? ""))) : null),
          el("span", { class: "a4-meta" }, [archived ? tx("しまったもの") : isDone(q) ? tx("完了") : "", meta(q)].filter(Boolean).join(" · ")),
          archived ? button(tx("戻す"), () => update(q, { lifecycleState: "active" }, tx("やることに戻しました"), { lifecycleState: q.lifecycleState }), "link") : null);
      };
      clear.hidden = false;
      replaceChildren(results, found.length === 0 ? el("div", { class: "a4-search-none" },
        el("h2", { class: "a4-subtitle" }, tx("「{text}」は見つかりませんでした", { text: search.trim() })),
        el("p", { class: "a4-muted" }, tx("完了としまったものも探しました。")),
        el("div", { class: "a4-actions" },
          (() => { const add = button(tx("「{text}」を追加", { text: search.trim() }), () => { openCapture(); captureInput.value = search.trim(); paintParse(); }); add.prepend(glyph(Plus)); return add; })(),
          button(tx("検索を消す"), () => { search = ""; field.value = ""; paintSearch(); field.focus(); }, "link")))
        : el("div", { class: "a4-hits" }, el("p", { class: "a4-hit-count" }, tx("{count}件", { count: all.length })), el("ul", { class: "a4-list" }, ...found.map(row)),
          all.length > found.length ? el("p", { class: "a4-muted" }, tx("ほか{count}件。言葉を足すと絞れます。", { count: all.length - found.length })) : null));
    };
    const field = el("input", { class: "a4-input", type: "search", value: search, placeholder: tx("タスクを探す"), "aria-label": tx("タスクを探す") });
    // Japanese input searches once the word is converted, not on every keystroke of the reading.
    field.addEventListener("input", event => { if ((event as InputEvent).isComposing) return; search = field.value; paintSearch(); });
    field.addEventListener("compositionend", () => { search = field.value; paintSearch(); });
    const clear = el("button", { type: "button", class: "a4-icon-button a4-search-clear", "aria-label": tx("検索を消す"), hidden: !search.trim() }, glyph(X));
    clear.addEventListener("click", () => { search = ""; field.value = ""; paintSearch(); field.focus(); });
    const modes = modeSwitch([["list", tx("一覧")], ["board", tx("ボード")], ["gantt", tx("ガント")], ["notes", tx("メモ")]], allMode === "table" ? "list" : allMode, mode => { allMode = mode; });
    const head = el("div", { class: "a4-all-head" }, allMode === "notes" ? null : el("label", { class: "a4-search" }, glyph(Search), field, clear), modes,
      el("h1", { class: "a4-sr", tabindex: -1 }, tx("タスク")));
    if ((allMode === "table" || allMode === "notes") && runtime) {
      return el("section", { class: "a4-view a4-wide a4-all" }, head,
        embed(allMode === "table" ? forge!.render("list") : workUi.screen("notes").main));
    }
    if (allMode === "notes") replaceChildren(body, el("p", { class: "a4-lead" }, tx("メモはサインイン後に使えます。")));
    else if (allMode === "board") replaceChildren(body, boardView(finished));
    else if (allMode === "gantt") replaceChildren(body, ganttView());
    else replaceChildren(body,
      decisionNotice(),
      empty ? finished.length ? el("p", { class: "a4-all-clear" }, tx("やることは全部終わりました。")) : noTasks() : null,
      section("today", tx("今日"), all.today),
      section("review", tx("日付を見直す"), all.review, true),
      section("inbox", tx("受け箱"), all.inbox),
      section("later", tx("これから"), all.later),
      habitSection(),
      section("agent", tx("Agentが担当"), all.agent.filter(q => !needsDecision(q)), true),
      section("done", tx("完了"), finished, true));
    paintSearch();
    return el("section", { class: "a4-view a4-wide a4-all", "data-mode": allMode }, head, results, body);
  }

  /** Nothing at all yet: one box, one way in. */
  const noTasks = () => el("div", { class: "a4-empty a4-empty-box" }, glyph(ListTodo), el("h2", { class: "a4-subtitle" }, tx("タスクはありません")),
    el("p", { class: "a4-muted" }, tx("思いついたことから、書き出してみましょう。")),
    (() => { const add = button(tx("タスクを追加"), openCapture, "primary"); add.prepend(glyph(Plus)); return add; })());

  /** Four columns by where the work stands. The first shows a handful and opens the rest on request. */
  function boardView(finished: readonly Quest[]): HTMLElement {
    const today = port.today();
    const list = quests().map(q => forDay(q, today)).filter(q => q.kind !== "reward" && q.lifecycleState !== "archived" && !q.humanRequest || needsDecision(q));
    const ai = agentSummary(quests(), today);
    const asks = [...quests().filter(needsDecision), ...ai.blocked];
    const working = list.filter(q => isOpen(q) && !asks.includes(q) && q.assignee.handoffState === "working");
    const open = groups(quests(), today);
    const ahead = [...open.today, ...open.review, ...open.inbox, ...open.later, ...open.agent].filter(q => !asks.some(a => a.id === q.id) && !working.some(w => w.id === q.id));
    const card = (quest: Quest, state = "") => {
      const node = el("button", { type: "button", class: "a4-card", "data-tone": tone(quest), "data-quest-id": quest.id },
        el("strong", {}, quest.icon ? quest.icon + " " : "", quest.title),
        el("span", { class: "a4-meta" },
          state ? el("b", {}, state) : tone(quest) === "focus" ? el("strong", {}, tx("今の1件")) : null,
          quest.kind === "daily" ? el("span", { class: "a4-daily" }, glyph(Repeat2), tx("毎日")) : null,
          quest.assignee.type !== "self" ? quest.assignee.label || "Agent"
            : [quest.scheduledDate === today ? quest.scheduledTime || (quest.kind === "daily" ? "" : tx("時刻未定")) : quest.scheduledDate ? dateLabel.format(noon(quest.scheduledDate)) : "", quest.estimatedMinutes > 0 ? minutesLabel(quest.estimatedMinutes) : ""].filter(Boolean).join(" · ")),
        isDone(quest) ? glyph(Check) : null);
      node.addEventListener("click", () => asks.includes(quest) ? go("guild", quest.id) : openSheet(quest));
      return node;
    };
    const more = ahead.length > 5 && !boardAll ? withArrow(button(tx("ほか {count}件を見る", { count: ahead.length - 5 }), () => { boardAll = true; render(); }, "link")) : null;
    const names: string[] = [], counts: number[] = [];
    const column = (title: string, count: number, ...items: (HTMLElement | null)[]) => {
      names.push(title); counts.push(count);
      return el("section", { class: "a4-col", "data-active": String(names.length - 1 === boardCol) }, el("h2", {}, title, el("span", {}, String(count))), ...items);
    };
    const columns = [
      column(tx("これから"), ahead.length, ...(boardAll ? ahead : ahead.slice(0, 5)).map(q => card(q)), more),
      column(tx("作業中"), working.length, ...working.map(q => card(q))),
      column(tx("確認待ち"), asks.length, ...asks.map(q => card(q, needsDecision(q) ? tx("確認待ち") : tx("止まっています")))),
      column(tx("完了"), finished.length, ...finished.slice(0, 20).map(q => card(q)))];
    // Phones show one column at a time.
    const tabs = el("div", { class: "a4-col-tabs", role: "tablist", "aria-label": tx("ボード") }, ...names.map((name, index) => {
      const tab = el("button", { type: "button", role: "tab", "aria-selected": String(index === boardCol) }, name, el("span", {}, String(counts[index])));
      tab.addEventListener("click", () => { boardCol = index; render(); });
      return tab;
    }));
    if (counts.every(count => count === 0)) return noTasks();
    return el("div", { class: "a4-board-wrap" }, tabs, el("div", { class: "a4-board" }, ...columns));
  }
  const withArrow = (node: HTMLElement) => { node.append(glyph(ChevronRight)); return node; };

  /** Seven days from today, one row per planned task of your own. */
  function ganttView(): HTMLElement {
    const today = port.today();
    const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
    const rows = quests().map(q => forDay(q, today)).filter(q => isOpen(q) && q.assignee.type === "self" && q.kind !== "daily" && q.kind !== "reward" && !needsDecision(q) && days.includes(q.scheduledDate ?? ""))
      .sort((a, b) => `${a.scheduledDate} ${a.scheduledTime || "99"}`.localeCompare(`${b.scheduledDate} ${b.scheduledTime || "99"}`));
    if (rows.length === 0) return el("div", { class: "a4-gantt-empty" }, el("h2", { class: "a4-subtitle" }, tx("この7日間に日付のあるタスクはありません")),
      el("p", { class: "a4-muted" }, tx("日付を入れると、ここに並びます。")), withArrow(button(tx("一覧で見る"), () => { allMode = "list"; render(); }, "link")));
    return el("div", { class: "a4-gantt", role: "table", "aria-label": tx("ガント") },
      el("div", { class: "a4-gantt-row a4-gantt-head", role: "row" }, el("span", { role: "columnheader" }, tx("タスク")),
        ...days.map(date => el("span", { role: "columnheader", "data-today": String(date === today) }, weekdayLabel.format(noon(date)), el("b", {}, String(Number(date.slice(8))))))),
      ...rows.map(q => el("div", { class: "a4-gantt-row", role: "row", "data-tone": tone(q) },
        (() => { const title = titleButton(q); if (q.icon) title.prepend(q.icon + " "); return el("span", { role: "cell" }, title); })(),
        el("span", { class: "a4-gantt-bar", role: "cell", style: `grid-column: ${days.indexOf(q.scheduledDate ?? "") + 2}` }, q.scheduledTime || (q.estimatedMinutes > 0 ? minutesLabel(q.estimatedMinutes) : "")))));
  }

  function modeSwitch<T extends string>(options: readonly (readonly [T, string])[], current: T, choose: (mode: T) => void): HTMLElement {
    return el("div", { class: "a4-seg", role: "group", "aria-label": tx("表示") }, ...options.map(([mode, label]) => {
      const node = el("button", { type: "button", class: "a4-seg-button", "aria-pressed": String(current === mode) }, label);
      node.addEventListener("click", () => { choose(mode); render(); });
      return node;
    }));
  }

  /** A Relay Forge screen inside an AFA tab: the tab supplies the heading, the skin supplies the look. */
  function embed(screen: HTMLElement): HTMLElement {
    return el("div", { class: "a4-extra a4-embed" }, screen);
  }

  /** Shows a request's link only when it is a plain web address. */
  const safeUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return url.protocol === "https:" || url.protocol === "http:" ? url.href : null; } catch { return null; } };

  function artifactLink(value: string | undefined, current: Quest): HTMLAnchorElement | null {
    const href = safeUrl(value);
    if (!href) return null;
    const url = new URL(href);
    const paths = [location.pathname, "/next/all-for-adhd/", "/interaction-lab/all-for-adhd/"];
    if (location.origin === "https://app.guilduo.com") paths.push("/");
    const next = url.hash === "#today" ? "plan" : !url.hash ? "now" : [...VIEWS, ...EXTRAS].find(item => url.hash === `#${item.id}`)?.id;
    const ids = url.searchParams.getAll("quest");
    const questId = ids[0];
    const internal = url.origin === location.origin && !url.username && !url.password && paths.includes(url.pathname)
      && next !== undefined && [...url.searchParams.keys()].every(key => key === "quest") && ids.length <= 1
      && (ids.length === 0 || (questId && next === "guild" && quests().some(q => q.id === questId && needsDecision(q))));
    if (internal && next === view && (!questId || questId === current.id)) return null;
    const link = el("a", { class: "a4-link", href, target: internal ? null : "_blank", rel: "noopener noreferrer" }, internal ? tx("成果物を開く") : tx("成果物を開く ↗"));
    if (internal) link.addEventListener("click", event => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); go(next, questId);
    });
    return link;
  }

  function disposeDecisionImages(id: string): void {
    reviewImageEditors.get(id)?.dispose(); reviewImageEditors.delete(id);
    reviewImageGalleries.get(id)?.dispose(); reviewImageGalleries.delete(id);
  }

  function clearDecisionGalleries(): void {
    for (const gallery of reviewImageGalleries.values()) gallery.dispose();
    reviewImageGalleries.clear();
  }

  function answer(quest: Quest, action: RequestAnswer): void {
    const text = (replies.get(quest.id) ?? "").trim();
    void run(async () => {
      const editor = reviewImageEditors.get(quest.id);
      const attachmentIds = action === "approve" || action === "revise" ? await editor?.save() : undefined;
      await port.answer(quest, action, text, attachmentIds);
      if (action === "approve" || action === "revise") disposeDecisionImages(quest.id);
      replies.delete(quest.id); confirmed.delete(quest.id); reviseFor = null; decisionId = null;
      if (cheer && action === "approve") celebrate(innerWidth / 2, innerHeight * 0.55);
      say(action === "approve" ? tx("OKを伝えました") : action === "revise" ? tx("直してほしい点を伝えました") : action === "defer" ? tx("あとで見るに移しました") : tx("判断待ちに戻しました"));
    }, tx("送れませんでした。内容が更新されていないか確認して、もう一度試してください。"));
  }

  function review(quest: Quest, accept: boolean): void {
    const note = (replies.get(quest.id) ?? "").trim();
    void run(async () => {
      const saved = await port.review(quest, accept, note);
      disposeDecisionImages(quest.id);
      replies.delete(quest.id); confirmed.delete(quest.id); reviseFor = null; decisionId = null;
      const passed = accept && saved.assignee.type === "agent" && saved.assignee.id !== quest.assignee.id ? saved.assignee.label : "";
      if (cheer && accept) celebrate(innerWidth / 2, innerHeight * 0.55);
      say(passed ? tx("{name} に回しました", { name: passed }) : accept ? tx("受け取りました") : tx("やり直しをお願いしました"));
    }, tx("送れませんでした。Agentの状態が変わっていないか確認して、もう一度試してください。"));
  }

  /** One decision at a time, like the Now screen: what is asked, what to check, then a single clear answer. */
  function decisionCard(quest: Quest, index: number, total: number, next: () => void): HTMLElement {
    const request = quest.humanRequest ?? null;
    const name = (request ? quest.requester?.label : quest.assignee.label) || "Agent";
    const from = (label: string, stuck = false) => el("p", { class: "a4-dec-from", "data-stuck": String(stuck) },
      el("span", { class: "a4-avatar", "data-kind": "agent", "aria-hidden": "true" }, name.slice(0, 1)), label);
    const onward = total > 1 ? withArrow(button(tx("次の判断へ"), next, "link")) : null;
    onward?.classList.add("a4-dec-next");
    // Stopped work is a decision too: say why it stopped, then open the task to unblock it.
    if (!needsDecision(quest)) {
      const note = quest.handoff?.blockedReason || quest.nextAction;
      const open = button(tx("判断する"), () => openSheet(quest), "primary");
      open.append(glyph(ArrowRight));
      return el("div", { class: "a4-dec" }, from(tx("{name}が止まっています", { name }), true),
        el("h3", { class: "a4-dec-title" }, quest.title), note ? el("p", { class: "a4-dec-lead" }, note) : null,
        el("div", { class: "a4-dec-actions" }, open, onward));
    }
    const source = request?.sourceQuestId ? byId(request.sourceQuestId) : null;
    const link = artifactLink(request?.artifactUrl || quest.handoff?.artifactUrl, quest);
    const detail = (label: string, value: string | undefined) => value ? el("p", { class: "a4-step" }, el("span", { class: "a4-step-label" }, label), value) : null;
    const relay = !request ? port.relay?.get(quest.id) ?? null : null;
    const leg = relay?.legs[relay.at];
    const nextLeg = relay?.legs[relay.at + 1];
    const nextName = nextLeg ? port.agents().find(agent => agent.id === nextLeg.agentId)?.name ?? "Agent" : "";
    const lead = request?.checkTarget || quest.nextAction;
    const notes = quest.notes || source?.notes || "";
    const details = [detail(tx("理由"), request?.reason), detail(tx("完了の条件"), quest.completionCriteria), detail(tx("報告"), request ? undefined : quest.handoff?.note)].filter(Boolean) as HTMLElement[];
    let gallery = reviewImageGalleries.get(quest.id);
    if (gallery && !gallery.element.isConnected) { gallery.dispose(); reviewImageGalleries.delete(quest.id); gallery = undefined; }
    if (!gallery) { gallery = questImageEditor(port.images, quest, "review"); reviewImageGalleries.set(quest.id, gallery); }
    const check = el("input", { type: "checkbox", checked: confirmed.has(quest.id) });
    const reply = el("textarea", { class: "a4-input a4-textarea", rows: 3, maxlength: 2000, "aria-label": tx("直してほしいこと"), placeholder: tx("例：見出しをもう少し短く") });
    reply.value = replies.get(quest.id) ?? "";
    const ok = button(request ? tx("OK、これで良い") : nextLeg ? tx("受け取って {name} に回す", { name: nextName }) : tx("受け取る"), () => request ? answer(quest, "approve") : review(quest, true), "primary", !confirmed.has(quest.id));
    const send = button(tx("送る"), () => request ? answer(quest, "revise") : review(quest, false), "secondary", !confirmed.has(quest.id) || !reply.value.trim());
    const sync = () => { ok.disabled = busy || !check.checked; send.disabled = busy || !check.checked || !reply.value.trim(); };
    check.addEventListener("change", () => { if (check.checked) confirmed.add(quest.id); else confirmed.delete(quest.id); sync(); });
    reply.addEventListener("input", () => { replies.set(quest.id, reply.value); sync(); });
    const revising = reviseFor === quest.id;
    const links = [source ? button(tx("元のタスク"), () => openSheet(source), "link") : null, link].filter(Boolean) as HTMLElement[];
    return el("div", { class: "a4-dec" },
      from(request ? tx("{name}からの確認依頼", { name }) : leg?.ask ? tx("{name} が「{ask}」を終えました", { name, ask: leg.ask }) : tx("{name}が「終わった」と報告しています", { name })),
      el("h3", { class: "a4-dec-title" }, quest.title),
      lead ? el("p", { class: "a4-dec-lead" }, lead) : null,
      el("div", { class: "a4-dec-body" },
        notes ? el("div", { class: "a4-dec-notes" }, el("span", { class: "a4-step-label" }, tx("説明")), el("p", {}, notes)) : null,
        gallery.element),
      details.length + links.length > 0 ? el("div", { class: "a4-dec-more" },
        details.length > 0 ? el("details", { class: "a4-more" }, el("summary", {}, tx("詳しく")), el("div", { class: "a4-more-body" }, ...details)) : null,
        el("span", { class: "a4-dec-links" }, ...links)) : null,
      request ? (() => { let editor = reviewImageEditors.get(quest.id); if (!editor) { editor = questImageEditor(port.images, quest, "response"); reviewImageEditors.set(quest.id, editor); } return editor.element; })() : null,
      el("label", { class: "a4-option" }, check, tx("中身を確認しました")),
      revising ? el("div", { class: "a4-field-row" }, el("span", { class: "a4-step-label" }, request ? tx("直してほしいこと") : tx("やり直してほしいこと")), reply) : null,
      el("div", { class: "a4-dec-actions" },
        revising ? send : ok,
        revising ? button(tx("やめる"), () => { reviseFor = null; render(); }, "link") : button(tx("直してほしい"), () => { reviseFor = quest.id; render(); main.querySelector<HTMLElement>(".a4-dec textarea")?.focus(); }),
        request && !revising ? button(tx("あとで"), () => answer(quest, "defer"), "link") : null,
        revising ? null : onward));
  }
  const timeLabel = (iso: string) => {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "";
    const hm = at.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
    return at.toDateString() === new Date().toDateString() ? hm : `${at.toLocaleDateString(LOCALE, { month: "numeric", day: "numeric" })} ${hm}`;
  };

  function loadActivity(): void {
    if (activityLoading) return;
    activityLoading = true;
    void port.activity().then(items => { activity = items; activityError = false; }, () => { activityError = true; })
      .finally(() => { activityLoading = false; if (!disposed) render(); });
  }

  /** One sentence per event: who, what, which task. Agents act through MCP, you through the app. */
  function activityLine(event: AllForActivity): HTMLElement {
    const quest = byId(event.questId);
    const title = quest?.title ?? tx("タスク");
    const actor = event.details.actor;
    const agentName = actor && typeof actor === "object" && "label" in actor && typeof actor.label === "string" ? actor.label || "Agent" : "Agent";
    const who = event.source === "mcp" ? agentName : tx("あなた");
    const assignee = event.details.assignee as { label?: string; handoffState?: string } | undefined;
    const to = String(event.details.to ?? assignee?.handoffState ?? "");
    const vars = { who, title, name: assignee?.label || "Agent", state: AGENT_STATE[to as keyof typeof AGENT_STATE] ?? to };
    const line = event.type === "quest.created" ? tx("{who} が「{title}」を作りました", vars)
      : event.type === "quest.assignment.ready" ? tx("{who} が「{title}」を {name} に渡しました", vars)
      : event.type === "quest.handoff.transitioned" && to ? tx("{who} が「{title}」を「{state}」にしました", vars)
      : event.type === "quest.scored" ? tx("{who} が「{title}」を完了しました", vars)
      : event.type === "quest.reopened" ? tx("{who} が「{title}」を戻しました", vars)
      : event.type === "quest.archived" ? tx("{who} が「{title}」をしまいました", vars)
      : tx("{who} が「{title}」を更新しました", vars);
    return el("li", { class: "a4-activity" },
      el("span", { class: "a4-activity-time" }, timeLabel(event.at)),

      el("span", {}, line));
  }

  /** A person or Agent and what they are on right now. */
  /** Load as one stacked bar: open tasks by state, scaled against the busiest member so loads compare at a glance. */
  /** One line per member: who, what they are on now, how many they hold. The row opens their work. */
  function memberRow(kind: "self" | "human" | "agent", key: string, name: string, now: readonly [string, string, string] | null, load: readonly Quest[], inactive = false, agentId = ""): HTMLElement {
    const open = memberOpen === key;
    // Registered but not linked over MCP yet: the Agent cannot pick up work until it is.
    const unlinked = agentId !== "" && load.length === 0 && connections !== null && !connections.some(item => item.agentIds.includes(agentId));
    const row = el("button", { type: "button", class: "a4-member-row", "aria-expanded": String(open) },
      el("span", { class: "a4-avatar", "data-kind": kind, "aria-hidden": "true" }, kind === "self" ? name.slice(0, 2) : name.slice(0, 1)),
      el("span", { class: "a4-member-copy" }, el("strong", {}, kind === "self" ? tx("{name}（あなた）", { name }) : name),
        el("span", { class: "a4-member-now" }, now ? el("b", { "data-state": now[2] }, now[0]) : null,
          now ? now[1] : inactive ? tx("停止中") : unlinked ? tx("まだMCPにつながっていません") : kind === "agent" ? tx("いまは手が空いています") : tx("担当しているタスクはありません"))),
      load.length ? el("span", { class: "a4-member-count" }, tx("{count}件", { count: load.length })) : null, load.length ? glyph(ChevronRight) : null);
    if (!load.length) { row.setAttribute("disabled", ""); row.removeAttribute("aria-expanded"); }
    row.addEventListener("click", () => { memberOpen = open ? "" : key; render(); });
    const toMcp = () => { go("settings"); settingsPage = "mcp"; render(); };
    const link = unlinked ? withArrow(button(tx("つなぐ"), toMcp, "link")) : null;
    link?.classList.add("a4-member-link");
    const menu = agentId === "" ? null : el("details", { class: "a4-menu a4-member-menu" },
      el("summary", { class: "a4-icon-button", "aria-label": tx("{name}の操作", { name }) }, glyph(MoreHorizontal)),
      el("div", { class: "a4-menu-list" }, button(tx("MCP接続を設定"), toMcp, "link"), button(tx("外す"), () => { menu!.open = false; removeAgentDialog(agentId, name, load); }, "link")));
    return el("li", { class: "a4-member", "data-inactive": String(inactive), "data-open": String(open) },
      el("div", { class: "a4-member-line" }, row, link, menu),
      !open ? null : el("div", { class: "a4-member-work" },
        el("ul", { class: "a4-doing-list" }, ...load.slice(0, 8).map(quest => el("li", {},
          kind === "agent" ? el("span", { class: "a4-state", "data-state": quest.assignee.handoffState }, AGENT_STATE[quest.assignee.handoffState] ?? quest.assignee.handoffState) : null,
          titleButton(quest)))),
        load.length > 8 ? el("span", { class: "a4-meta" }, tx("ほか {count} 件", { count: load.length - 8 })) : null));
  }

  /** Removing an Agent archives it; its open tasks come back to you unless you say otherwise. */
  function removeAgentDialog(agentId: string, name: string, load: readonly Quest[]): void {
    const back = el("input", { type: "checkbox", checked: true });
    const close = el("button", { type: "button", class: "a4-icon-button", "aria-label": tx("閉じる") }, glyph(X));
    const stay = el("button", { type: "button", class: "a4-link" }, tx("やめる"));
    const remove = el("button", { type: "button", class: "a4-button" }, tx("外す"));
    const dialog = el("dialog", { class: "a4-capture-dialog a4-confirm", "aria-labelledby": "a4-remove-title" },
      el("div", { class: "a4-sheet-head" }, el("h2", { id: "a4-remove-title", class: "a4-subtitle" }, tx("{name}を外しますか？", { name })), close),
      el("div", { class: "a4-confirm-body" },
        el("p", {}, tx("担当に選べなくなり、MCPの紐付けも使えなくなります。")),
        load.length === 0 ? null : el("label", { class: "a4-option" }, back, el("strong", {}, tx("担当中の{count}件を自分に戻す", { count: load.length }))),
        load.length === 0 ? null : el("ul", { class: "a4-confirm-list" }, ...load.slice(0, 3).map(quest => el("li", {},
          el("span", { class: "a4-state", "data-state": quest.assignee.handoffState }, AGENT_STATE[quest.assignee.handoffState] ?? quest.assignee.handoffState), quest.title)),
          load.length > 3 ? el("li", { class: "a4-meta" }, tx("ほか {count} 件", { count: load.length - 3 })) : null)),
      el("div", { class: "a4-actions a4-confirm-foot" }, stay, remove));
    close.addEventListener("click", () => dialog.close());
    stay.addEventListener("click", () => dialog.close());
    remove.addEventListener("click", () => {
      dialog.close();
      void run(async () => {
        if (back.checked) for (const quest of load) await port.update(quest, { assignee: { type: "self", id: port.self().id, label: port.self().label, handoffState: "none" } });
        await port.removeAgent(agentId);
        memberOpen = "";
        say(tx("{name} を外しました", { name }));
      }, tx("外せませんでした。もう一度試してください。"));
    });
    dialog.addEventListener("close", () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
    // The safe choice takes the first focus.
    stay.focus();
  }

  const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

  /** Register an Agent with plain choices; the raw scopes stay in Relay Forge. */
  function openAgentForm(): void {
    sheet?.close();
    const name = el("input", { class: "a4-input", required: true, maxlength: 60, placeholder: tx("例：Scribe"), "aria-label": tx("名前"), autocomplete: "off" });
    const id = el("input", { class: "a4-input", required: true, maxlength: 80, pattern: "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?", placeholder: tx("例：scribe"), "aria-label": "Agent ID", autocapitalize: "off", spellcheck: false });
    const role = el("input", { class: "a4-input", maxlength: 80, placeholder: tx("例：文書をまとめる"), "aria-label": tx("何をするAgent？") });
    const instructions = el("textarea", { class: "a4-input a4-textarea", rows: 3, maxlength: 2000, placeholder: tx("例：下書きは箇条書きで。数字は必ず出典を書く。"), "aria-label": tx("お願いしておくこと") });
    // A name with no ASCII (e.g. 書類係) still gets an ID, so registering never stops on an empty one.
    const fallback = `agent-${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`;
    let idTouched = false;
    const idText = el("strong", {});
    const paintId = () => { if (!idTouched) id.value = slug(name.value) || fallback; idText.textContent = id.value; };
    name.addEventListener("input", paintId);
    id.addEventListener("input", () => { idTouched = true; });
    const errorOf = () => el("small", { class: "a4-field-error", role: "alert", hidden: true });
    const nameError = errorOf(), idError = errorOf();
    const idField = el("label", { class: "a4-field-row", hidden: true }, el("span", { class: "a4-step-label" }, "Agent ID"), id,
      el("small", { class: "a4-muted" }, tx("英小文字・数字・ハイフン。MCPでAgentを指すときに使います。あとから変えられません。")), idError);
    const idEdit = button(tx("変更"), () => { idLine.hidden = true; idField.hidden = false; id.focus(); }, "link");
    const idLine = el("p", { class: "a4-agent-id" }, el("span", {}, "ID"), idText, idEdit);
    const power = (value: string, label: string, hint: string, checked: boolean) =>
      el("label", { class: "a4-power" }, el("input", { type: "radio", name: "a4-agent-power", value, checked }), el("span", {}, el("strong", {}, label), el("small", {}, hint)));
    const review = el("input", { type: "checkbox", checked: true });
    // Waiting for your check only means something for an Agent that changes tasks.
    const reviewRow = el("label", { class: "a4-option a4-agent-review" }, review, tx("終わったら、あなたの確認を待つ"));
    const instructionsField = el("label", { class: "a4-field-row", hidden: true }, el("span", { class: "a4-step-label" }, tx("お願いしておくこと")), instructions);
    const more = button(tx("＋お願いしておくこと"), () => { more.hidden = true; instructionsField.hidden = false; instructions.focus(); });
    more.classList.add("a4-chip");
    const error = el("p", { class: "a4-save-error", role: "alert", hidden: true });
    const field = (label: HTMLElement | string, control: HTMLElement, ...after: (HTMLElement | null)[]) => el("label", { class: "a4-field-row" }, typeof label === "string" ? el("span", { class: "a4-step-label" }, label) : label, control, ...after);
    const form = el("form", { class: "a4-sheet-form a4-agent-form", id: "a4-agent-form", novalidate: true },
      field(tx("名前"), name, nameError),
      idLine, idField,
      field(el("span", { class: "a4-step-label" }, tx("何をするAgent？"), el("small", {}, tx("任意"))), role, el("small", { class: "a4-muted" }, tx("担当を選ぶときに表示されます。"))),
      el("fieldset", { class: "a4-field a4-powers" }, el("legend", { class: "a4-step-label" }, tx("やってよいこと")),
        power("read", tx("見るだけ"), tx("タスクを読むだけで、変えません"), false),
        power("write", tx("タスクを進める"), tx("タスクを読み、状態や中身を書き換えます"), true)),
      reviewRow, more, instructionsField, error);
    form.addEventListener("change", () => { reviewRow.hidden = form.querySelector<HTMLInputElement>('input[name="a4-agent-power"]:checked')?.value !== "write"; });
    const close = el("button", { type: "button", class: "a4-icon-button", "aria-label": tx("閉じる") }, glyph(X));
    const cancel = el("button", { type: "button", class: "a4-link" }, tx("キャンセル"));
    const dialog = el("dialog", { class: "a4-sheet a4-agent-sheet", "aria-labelledby": "a4-agent-title" },
      el("div", { class: "a4-sheet-head" }, el("h2", { id: "a4-agent-title", class: "a4-subtitle" }, tx("Agentを登録")), close),
      form,
      el("div", { class: "a4-actions a4-sheet-foot" }, cancel, el("button", { type: "submit", class: "a4-button a4-primary", form: "a4-agent-form" }, tx("登録する"))));
    close.addEventListener("click", () => dialog.close());
    cancel.addEventListener("click", () => dialog.close());
    // Each problem is said under its own field.
    const fail = (target: HTMLElement, message: string, focus: HTMLElement) => { target.textContent = message; target.hidden = false; focus.setAttribute("aria-invalid", "true"); focus.focus(); };
    form.addEventListener("submit", event => {
      event.preventDefault();
      for (const node of [nameError, idError, error]) node.hidden = true;
      for (const node of [name, id]) node.removeAttribute("aria-invalid");
      paintId();
      const agentId = id.value.trim().toLowerCase();
      const showId = () => { idLine.hidden = true; idField.hidden = false; };
      if (!name.value.trim()) return fail(nameError, tx("名前を入れてください。"), name);
      if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(agentId)) { showId(); return fail(idError, tx("Agent ID は英小文字・数字・ハイフンで入れてください。"), id); }
      if (port.agents().some(agent => agent.id === agentId)) { showId(); return fail(idError, tx("この Agent ID はもう使われています。"), id); }
      const write = form.querySelector<HTMLInputElement>('input[name="a4-agent-power"]:checked')?.value === "write";
      void run(async () => {
        try {
          const agent = await port.registerAgent({
            agentId, displayName: name.value.trim(), role: role.value.trim(), instructions: instructions.value.trim(),
            allowedScopes: write ? ["quests:read", "quests:write"] : ["quests:read"], reviewRequired: write && review.checked,
          });
          dialog.close();
          say(tx("{name}を登録しました。担当に選べます。", { name: agent.name }));
        } catch {
          error.textContent = tx("登録できませんでした。もう一度試してください。"); error.hidden = false;
        }
      }, tx("登録できませんでした。もう一度試してください。"));
    });
    dialog.addEventListener("close", () => { dialog.remove(); if (sheet === dialog) sheet = null; });
    sheet = dialog;
    paintId();
    document.body.append(dialog);
    dialog.showModal();
    name.focus();
  }

  /* ------------------------------ settings: notifications ------------------------------ */

  // iPhone and iPad only expose Web Push to a site added to the Home Screen.
  const pushSupport = (): "ok" | "unsupported" | "denied" =>
    !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) ? "unsupported" : Notification.permission === "denied" ? "denied" : "ok";

  function loadNotify(): void {
    if (notifyLoading) return;
    notifyLoading = true;
    void Promise.all([port.notifications.load(), pushSupport() === "ok" ? port.notifications.device().catch(() => false) : false])
      .then(([loaded, device]) => { notify = { settings: loaded.settings, device: device && Notification.permission === "granted" }; notifyError = false; }, () => { notifyError = true; })
      .finally(() => { notifyLoading = false; if (!disposed) render(); });
  }

  /** One settings line: what it is, a short hint, then a control, a value or a way in. */
  function setRow(label: string, hint: string, tail: HTMLElement | string | null, open?: (() => void) | string): HTMLElement {
    const copy = el("span", { class: "a4-set-copy" }, el("strong", {}, label), hint ? el("small", {}, hint) : null);
    if (typeof open === "string") return el("a", { class: "a4-set-row", href: open }, copy, glyph(ChevronRight));
    if (open) {
      const node = el("button", { type: "button", class: "a4-set-row" }, copy, tail ? el("span", { class: "a4-set-value" }, tail) : null, glyph(ChevronRight));
      node.addEventListener("click", open);
      return node;
    }
    return el(tail instanceof HTMLInputElement ? "label" : "div", { class: "a4-set-row" }, copy, tail);
  }
  function toggle(checked: boolean, change: (on: boolean) => void, label = ""): HTMLInputElement {
    const input = el("input", { type: "checkbox", class: "a4-switch", role: "switch", checked });
    if (label) input.setAttribute("aria-label", label);
    input.addEventListener("change", () => change(input.checked));
    return input;
  }
  function setPage(title: string, lead: string, ...body: (HTMLElement | null)[]): HTMLElement {
    return el("section", { class: "a4-view a4-wide a4-set-page" }, button(tx("← 設定"), () => { settingsPage = ""; render(); }, "link"),
      el("h1", { class: "a4-title", tabindex: -1 }, title), lead ? el("p", { class: "a4-lead" }, lead) : null, ...body);
  }

  function notifyPage(): HTMLElement {
    if (notify === null && !notifyLoading && !notifyError) loadNotify();
    const lead = tx("アプリを閉じていても、この端末に届きます。変更はすぐ保存されます。");
    if (notify === null) {
      return setPage(tx("通知"), lead, notifyError
        ? el("p", { class: "a4-muted" }, tx("通知の設定を読み込めませんでした。"), button(tx("もう一度"), loadNotify, "link"))
        : el("p", { class: "a4-muted" }, tx("通知の設定を読み込んでいます…")));
    }
    const state = notify;
    const save = (patch: Partial<NotifySettings>) => {
      const next = { ...state.settings, ...patch };
      state.settings = next;
      void run(async () => { state.settings = await port.notifications.save(next); say(tx("通知の設定を保存しました")); }, tx("通知の設定を保存できませんでした。"));
    };
    const support = pushSupport();
    const enable = async () => {
      if (await Notification.requestPermission() !== "granted") { render(); return; }
      void run(async () => {
        state.settings = await port.notifications.enable(state.settings);
        state.device = true;
        say(tx("この端末で通知を受け取ります"));
      }, tx("通知をオンにできませんでした。もう一度試してください。"));
    };
    const device = support === "unsupported"
      ? el("p", { class: "a4-set-banner", "data-off": "true" }, tx("このブラウザは通知に対応していません。iPhone と iPad では、共有メニューの「ホーム画面に追加」から開くと使えます。"))
      : support === "denied"
        ? el("p", { class: "a4-set-banner", "data-off": "true" }, tx("このサイトの通知がブラウザでブロックされています。サイトの設定で通知を許可してください。"))
        : state.device
          ? el("div", { class: "a4-set-banner" }, el("strong", {}, tx("この端末で受け取っています")),
            button(tx("テスト通知を送る"), () => { void run(async () => { const sent = await port.notifications.test(); say(sent > 0 ? tx("テスト通知を送りました") : tx("届けられる端末がありませんでした。もう一度オンにしてください。")); }, tx("テスト通知を送れませんでした。")); }, "link"),
            button(tx("この端末では止める"), () => { void run(async () => { await port.notifications.disable(); state.device = false; say(tx("この端末の通知を止めました")); }, tx("通知を止められませんでした。")); }, "link"))
          : el("div", { class: "a4-set-banner", "data-off": "true" }, button(tx("この端末で通知を受け取る"), () => { void enable(); }, "primary"));
    const check = (key: "atStart" | "review" | "proposal" | "report", text: string) => setRow(text, "", toggle(state.settings[key], on => save({ [key]: on })));
    const before = el("select", { class: "a4-input", "aria-label": tx("始まる前のリマインド") },
      ...[0, 5, 10, 15, 30, 60].map(minutes => el("option", { value: String(minutes), selected: state.settings.before === minutes }, minutes ? tx("{n}分前", { n: minutes }) : tx("知らせない"))));
    before.addEventListener("change", () => save({ before: Number(before.value) }));
    const summaryAt = el("input", { type: "time", class: "a4-input", value: state.settings.summary || "08:00", disabled: state.settings.summary === "", "aria-label": tx("朝のまとめの時刻") });
    const summaryOn = toggle(state.settings.summary !== "", on => { summaryAt.disabled = !on; save({ summary: on ? summaryAt.value || "08:00" : "" }); }, tx("朝のまとめ"));
    summaryAt.addEventListener("change", () => { if (summaryAt.value) save({ summary: summaryAt.value }); });
    return setPage(tx("通知"), lead, device,
      el("h2", { class: "a4-set-head" }, tx("タスク")),
      setRow(tx("始まる前"), "", before),
      check("atStart", tx("始まる時刻ちょうど")),
      setRow(tx("朝のまとめ"), "", el("span", { class: "a4-set-pair" }, summaryAt, summaryOn)),
      el("h2", { class: "a4-set-head" }, tx("Agent")),
      check("review", tx("確認を頼まれたとき")),
      check("proposal", tx("時間を提案されたとき")),
      check("report", tx("作業を終えた・止まったとき")));
  }

  /* ------------------------------ settings: MCP ------------------------------ */

  function loadConnections(): void {
    if (connectionsLoading) return;
    connectionsLoading = true;
    void port.mcp.connections().then(items => { connections = items; connectionsError = false; }, () => { connectionsError = true; })
      .finally(() => { connectionsLoading = false; if (!disposed) render(); });
  }

  function mcpPage(): HTMLElement {
    if (connections === null && !connectionsLoading && !connectionsError) loadConnections();
    const url = el("input", { class: "a4-input a4-mono", readonly: true, value: port.mcp.url, "aria-label": tx("MCP の接続URL") });
    url.addEventListener("focus", () => url.select());
    const copy = button(tx("コピー"), () => {
      void navigator.clipboard.writeText(port.mcp.url).then(() => say(tx("接続URLをコピーしました")), () => { url.focus(); say(tx("コピーできませんでした。URLを選んで手動でコピーしてください。")); });
    });
    const agents = port.agents().filter(agent => agent.active);
    const nameOf = (agentId: string) => port.agents().find(agent => agent.id === agentId)?.name ?? agentId;
    const card = (connection: AllForConnection) => {
      const editing = linkDrafts.get(connection.clientId);
      const head = el("div", { class: "a4-conn-main" },
        el("span", { class: "a4-avatar", "data-kind": "agent", "aria-hidden": "true" }, connection.clientName.slice(0, 1)),
        el("div", { class: "a4-conn-text" }, el("strong", {}, connection.clientName),
          el("span", {}, [connection.authorized ? "" : tx("接続が切れています"), connection.lastUsedAt ? tx("最後に使ったのは {time}", { time: timeLabel(connection.lastUsedAt) }) : ""].filter(Boolean).join(" · ")),
          el("span", {}, connection.agentIds.length ? tx("{names} として動きます", { names: connection.agentIds.map(nameOf).join(tx("・")) }) : tx("まだAgentに紐付いていません"))),
        editing ? null : button(connection.agentIds.length ? tx("変える") : tx("Agentを紐付ける"), () => { linkDrafts.set(connection.clientId, [...connection.agentIds]); render(); }, "link"));
      if (!editing) return el("li", { class: "a4-conn" }, head);
      const chips = el("div", { class: "a4-chips", role: "group", "aria-label": tx("紐付ける Agent") }, ...(agents.length === 0
        ? [el("span", { class: "a4-muted" }, tx("先にギルドで Agent を登録してください。"))]
        : agents.map(agent => {
          const chip = el("button", { type: "button", class: "a4-chip", "aria-pressed": String(editing.includes(agent.id)) }, agent.name);
          chip.addEventListener("click", () => {
            linkDrafts.set(connection.clientId, editing.includes(agent.id) ? editing.filter(item => item !== agent.id) : [...editing, agent.id]);
            render();
          });
          return chip;
        })));
      return el("li", { class: "a4-conn" }, head,
        el("div", { class: "a4-conn-edit" },
          el("p", { class: "a4-muted" }, tx("この接続で動かす Agent を選んでください。複数選ぶと、最初の Agent が既定になります。")),
          chips,
          el("div", { class: "a4-actions" },
            button(tx("保存"), () => {
              const next = linkDrafts.get(connection.clientId) ?? [];
              void run(async () => {
                await port.mcp.link(connection, next);
                linkDrafts.delete(connection.clientId);
                connections = await port.mcp.connections();
                say(next.length ? tx("{names} に紐付けました", { names: next.map(nameOf).join(tx("・")) }) : tx("紐付けを外しました"));
              }, tx("保存できませんでした。もう一度試してください。"));
            }, "primary"),
            button(tx("やめる"), () => { linkDrafts.delete(connection.clientId); revokingClient = null; render(); }, "link")),
          revokingClient === connection.clientId
            ? el("div", { class: "a4-conn-edit", role: "group", "aria-label": tx("接続を切る") },
              el("p", {}, tx("{name} の接続を切ります。もう一度使うには、クライアント側でサインインし直します。", { name: connection.clientName })),
              el("div", { class: "a4-actions" },
                button(tx("接続を切る"), () => {
                  void run(async () => {
                    await port.mcp.revoke(connection);
                    linkDrafts.delete(connection.clientId); revokingClient = null;
                    connections = await port.mcp.connections();
                    say(tx("{name} の接続を切りました", { name: connection.clientName }));
                  }, tx("接続を切れませんでした。もう一度試してください。"));
                }, "primary"),
                button(tx("やめる"), () => { revokingClient = null; render(); }, "link")))
            : button(tx("この接続を切る…"), () => { revokingClient = connection.clientId; render(); }, "link")));
    };
    // Connections left alone for a month fold away, so the ones in use stay easy to find.
    const stale = (connection: AllForConnection) => connection.lastUsedAt !== "" && Date.now() - Date.parse(connection.lastUsedAt) > 30 * 86_400_000 && !linkDrafts.has(connection.clientId);
    const all = connections ?? [];
    const live = all.filter(connection => !stale(connection));
    const old = all.filter(stale);
    const fold = old.length === 0 ? null : el("details", { class: "a4-guild-fold", open: openFolds.has("mcp:old") },
      el("summary", {}, tx("30日以上使っていない接続"), el("span", {}, String(old.length))), el("ul", { class: "a4-conns" }, ...old.map(card)));
    fold?.addEventListener("toggle", () => { if (fold.open) openFolds.add("mcp:old"); else openFolds.delete("mcp:old"); });
    return setPage(tx("MCP接続"), tx("ClaudeやCodexなどにこのURLを追加してサインインすると、下に接続が出ます。"),
      el("div", { class: "a4-step-form" }, url, copy),
      connectionsLoading && connections === null ? el("p", { class: "a4-muted" }, tx("接続を読み込んでいます…"))
        : connectionsError ? el("p", { class: "a4-muted" }, tx("接続を読み込めませんでした。"), button(tx("もう一度"), loadConnections, "link"))
        : all.length === 0 ? el("p", { class: "a4-muted" }, tx("まだ接続はありません。"))
        : el("h2", { class: "a4-set-head" }, tx("接続中"), el("span", {}, String(live.length))),
      live.length ? el("ul", { class: "a4-conns" }, ...live.map(card)) : null, fold);
  }

  function guildView(): HTMLElement {
    const today = port.today();
    const ai = agentSummary(quests(), today);
    const list = [...quests().filter(needsDecision).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), ...ai.blocked];
    const index = Math.max(0, list.findIndex(q => q.id === decisionId));
    const current = list[index] ?? null;
    const agentWork = quests().filter(q => isOpen(q) && q.assignee.type === "agent");
    const byAgent = (id: string) => (["working", "ready", "accepted", ...AGENT_STATE_ORDER, "review_required"] as const).flatMap(state => agentWork.filter(q => q.assignee.id === id && q.assignee.handoffState === state))
      .filter((q, i, all) => all.indexOf(q) === i);
    if (activity === null && !activityLoading && !activityError) loadActivity();
    if (connections === null && !connectionsLoading && !connectionsError) loadConnections();
    const later = quests().filter(q => q.humanRequest?.status === "deferred" && isOpen(q));
    const agents = [...port.agents()].sort((a, b) => Number(byAgent(b.id)[0]?.assignee.handoffState === "working") - Number(byAgent(a.id)[0]?.assignee.handoffState === "working"));
    const others = port.members().filter(member => member.id !== port.self().id);
    const mine = quests().filter(q => isOpen(q) && q.assignee.type === "self" && q.kind !== "reward" && !q.parentQuestId);
    const focus = currentFocus();
    const human = (id: string) => quests().filter(q => isOpen(q) && q.assignee.type === "human" && q.assignee.id === id);
    const nowOf = (quest: Quest | undefined): readonly [string, string, string] | null => quest
      ? [AGENT_STATE[quest.assignee.handoffState] ?? quest.assignee.handoffState, quest.title, quest.assignee.handoffState] : null;
    const activityBody = () => activity === null ? el("p", { class: "a4-muted" }, activityError ? tx("活動を読み込めませんでした。") : tx("読み込んでいます…"), activityError ? button(tx("もう一度"), loadActivity, "link") : null)
      : activity.length === 0 ? el("p", { class: "a4-muted" }, tx("まだ活動はありません。"))
      : el("ul", { class: "a4-activity-list" }, ...activity.slice(0, 10).map(activityLine));
    const places = () => extraLinks((game ? ["battle", "skills", "network"] : ["skills", "network"]).map(id => EXTRAS.find(item => item.id === id)!));
    const fold = el("details", { class: "a4-guild-fold", open: openFolds.has("guild:activity") },
      el("summary", {}, tx("最近の活動"), activity?.length ? el("span", {}, String(Math.min(10, activity.length))) : null), activityBody());
    fold.addEventListener("toggle", () => { if (fold.open) openFolds.add("guild:activity"); else openFolds.delete("guild:activity"); });
    return el("section", { class: "a4-view a4-wide a4-guild" },
      el("h1", { class: "a4-sr", tabindex: -1 }, tx("ギルド")),
      el("div", { class: "a4-guild-main" },
        el("section", { class: "a4-guild-part" },
          el("h2", { class: "a4-guild-head" }, tx("あなたの判断"), list.length ? el("span", { class: "a4-guild-count" }, tx("{count}件", { count: list.length })) : null,
            list.length > 1 ? el("span", { class: "a4-guild-at" }, `${index + 1} / ${list.length}`) : null),
          current ? decisionCard(current, index, list.length, () => { reviseFor = null; go("guild", list[(index + 1) % list.length]!.id); })
            : el("p", { class: "a4-muted" }, tx("いま、判断を待っているものはありません。"))),
        later.length === 0 ? null : el("details", { class: "a4-guild-fold" },
          el("summary", {}, tx("あとで見る"), el("span", {}, String(later.length))),
          el("ul", { class: "a4-list" }, ...later.map(q => el("li", { class: "a4-row" }, el("div", { class: "a4-row-main" }, rowText(q), button(tx("判断待ちに戻す"), () => answer(q, "resume"), "link")))))),
        el("section", { class: "a4-guild-part" },
          el("div", { class: "a4-guild-head" }, el("h2", {}, tx("人とAgent")), agents.length ? button(tx("＋ Agentを登録"), openAgentForm, "link") : null),
          el("ul", { class: "a4-members" },
            ...agents.map(agent => memberRow("agent", "agent:" + agent.id, agent.name, nowOf(byAgent(agent.id)[0]), byAgent(agent.id), !agent.active, agent.id)),
            ...others.map(member => memberRow("human", "human:" + member.id, member.name, human(member.id)[0] ? [member.owner ? tx("オーナー") : tx("メンバー"), human(member.id)[0]!.title, "none"] : null, human(member.id))),
            memberRow("self", "self", port.self().label, focus ? [isWorking(focus) ? tx("いまやっている") : tx("今の1件"), focus.title, "working"] : null, mine)),
          // Without an Agent the guild has little to show; say what one is for.
          agents.length ? null : el("div", { class: "a4-guild-none" }, el("p", { class: "a4-muted" }, tx("まだAgentはいません。登録すると、タスクを任せて、結果をここで確認できます。")),
            (() => { const add = button(tx("Agentを登録"), openAgentForm); add.prepend(glyph(Plus)); return add; })())),
        activity?.length ? fold : el("section", { class: "a4-guild-part a4-guild-quiet" }, el("h2", { class: "a4-guild-head" }, tx("最近の活動")), activityBody()), places()),
      el("aside", { class: "a4-guild-side", "aria-label": tx("最近の活動") },
        el("h2", { class: "a4-guild-head" }, tx("最近の活動")), activityBody(), places()));
  }

  function profileView(back: HTMLElement): HTMLElement {
    const current = profile ?? runtime!.profile ?? {};
    const initial = { displayName: current.displayName ?? "", handle: current.handle ?? "", bio: current.bio ?? "" };
    const name = el("input", { class: "a4-input", value: initial.displayName, maxlength: 60, autocomplete: "nickname", "aria-label": tx("表示名") });
    const handle = el("input", { class: "a4-input", value: initial.handle, maxlength: 21, autocomplete: "username", spellcheck: "false", "aria-label": tx("ユーザー名") });
    const bio = el("textarea", { class: "a4-input a4-textarea", maxlength: 160, rows: 3, "aria-label": tx("ひとこと") }, initial.bio);
    const count = el("small", { class: "a4-meta a4-count" });
    const errorOf = () => el("small", { class: "a4-field-error", role: "alert", hidden: true });
    const nameError = errorOf(), handleError = errorOf();
    const save = el("button", { type: "submit", class: "a4-button a4-primary", disabled: true }, tx("保存"));
    const read = () => ({ displayName: name.value.trim(), handle: handle.value.trim().replace(/^@+/, "").toLowerCase(), bio: bio.value.trim() });
    // Saving is offered only when something changed.
    const paint = () => { count.textContent = `${bio.value.length} / 160`; save.disabled = JSON.stringify(read()) === JSON.stringify(initial); };
    for (const field of [name, handle, bio]) field.addEventListener("input", paint);
    paint();

    // The picture comes first, as in Relay Forge: change it, or take it off.
    const version = current.hasCustomAvatar ? current.avatarVersion ?? 0 : 0;
    if (version && avatarFor !== version) {
      avatarFor = version;
      void runtime!.profileAvatarPort.fetchProfileAvatar(version).then(blob => { avatarSrc = URL.createObjectURL(blob); render(); }, () => { avatarFor = 0; });
    }
    const label = (initial.displayName || port.self().label).slice(0, 2);
    const face = el("span", { class: "a4-profile-face", "aria-hidden": "true" }, version && avatarSrc ? el("img", { src: avatarSrc, alt: "" }) : label);
    const fileInput = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp", hidden: true, "aria-label": tx("画像を変更") });
    const avatarError = errorOf();
    const settle = (response: Record<string, unknown>) => { const next = normalizeProfileRecord(response.profile); if (next) profile = next; avatarFor = 0; avatarSrc = ""; };
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      avatarError.hidden = true;
      void run(async () => {
        try {
          const resized = await resizeAvatarImage(file);
          settle(await runtime!.profileAvatarPort.uploadProfileAvatar(resized.blob));
          say(tx("画像を変えました"));
        } catch (error) {
          avatarError.textContent = error instanceof Error && error.message ? error.message : tx("画像を保存できませんでした。もう一度試してください。");
          avatarError.hidden = false;
        }
      }, tx("画像を保存できませんでした。もう一度試してください。"));
    });
    const change = button(tx("画像を変更"), () => fileInput.click());
    const remove = version ? button(tx("外す"), () => {
      void run(async () => { settle(await runtime!.profileAvatarPort.deleteProfileAvatar()); say(tx("画像を外しました")); }, tx("画像を外せませんでした。もう一度試してください。"));
    }, "link") : null;

    const form = el("form", { class: "a4-form a4-profile-form", novalidate: true },
      el("div", { class: "a4-profile-avatar" }, face, change, remove, fileInput), avatarError,
      el("label", { class: "a4-field-row" }, el("span", { class: "a4-step-label" }, tx("表示名")), name, nameError),
      el("label", { class: "a4-field-row" }, el("span", { class: "a4-step-label" }, tx("ユーザー名")),
        el("span", { class: "a4-at-field" }, el("span", { "aria-hidden": "true" }, "@"), handle),
        el("small", { class: "a4-muted" }, tx("英小文字・数字・_ で 3〜20 文字。ほかの人があなたを探すときに使います。")), handleError),
      el("label", { class: "a4-field-row" }, el("span", { class: "a4-step-label" }, tx("ひとこと")), bio, count),
      el("div", { class: "a4-actions" }, save));
    const fail = (target: HTMLElement, field: HTMLElement, message: string) => { target.textContent = message; target.hidden = false; field.setAttribute("aria-invalid", "true"); field.focus(); };
    form.addEventListener("submit", event => {
      event.preventDefault();
      for (const node of [nameError, handleError]) node.hidden = true;
      for (const node of [name, handle]) node.removeAttribute("aria-invalid");
      const input = read();
      if (input.displayName.length < 1) return fail(nameError, name, tx("表示名を入れてください。"));
      if (!/^[a-z0-9_]{3,20}$/.test(input.handle)) return fail(handleError, handle, tx("ユーザー名は英小文字・数字・_ で 3〜20 文字にしてください。"));
      void run(async () => {
        try {
          const response = await runtime!.profilePort.updateProfile(input) as { profile?: typeof profile };
          profile = response.profile ?? { ...current, ...input };
          say(tx("プロフィールを保存しました"));
        } catch {
          // A failed save stays next to the field it is most likely about.
          fail(handleError, handle, tx("保存できませんでした。ユーザー名がほかの人と重なっていないか確かめてください。"));
        }
      }, tx("保存できませんでした。ユーザー名がほかの人と重なっていないか確かめてください。"));
    });
    return el("section", { class: "a4-view a4-wide a4-set-page a4-profile" }, back,
      el("h1", { class: "a4-title", tabindex: -1 }, tx("プロフィール")), el("p", { class: "a4-lead" }, tx("ほかの人に見える情報です。")), form);
  }

  /** Relay Forge modules keep their own heading; this adds only the way back. */
  function extraView(id: Extra): HTMLElement {
    const back = button(["network", "battle", "skills"].includes(id) ? tx("← ギルド") : tx("← 設定"), () => go(["network", "battle", "skills"].includes(id) ? "guild" : "settings"), "link");
    if (!runtime) {
      return el("section", { class: "a4-view" }, back,
        el("h1", { class: "a4-title", tabindex: -1 }, EXTRAS.find(item => item.id === id)!.label),
        el("p", { class: "a4-lead" }, tx("サインインすると使えます。デモでは表示できません。")));
    }
    if (id === "profile") return profileView(back);
    if (id === "billing") { billingUi.enter(); return billingPage.render(back, billingUi.retry); }
    // Every way in loads the screen's data, a reload included; both calls only load once.
    if (FORGE.includes(id)) forge!.enter(id as ForgeScreen);
    const leads: Partial<Record<Extra, string>> = {
      network: tx("止まっているタスクと、その理由が分かります。"), battle: tx("タスクを終えるとMPがたまり、コマンドで戦えます。"),
      connections: tx("外のサービスとの同期を管理します。"), skills: tx("Agentがタスクを進めるときに使える機能です。"),
    };
    const content = forge!.render(id as ForgeScreen);
    // The same frame as a settings child page: back, title, one line; Relay Forge's own question and counters stay out.
    // A child page (a root on a phone) brings its own back link and title.
    return el("section", { class: "a4-view a4-wide a4-set-page a4-extra a4-extra-page", "data-extra": id },
      ...(content.dataset.ownFrame ? [] : [back, el("h1", { class: "a4-title", tabindex: -1 }, EXTRAS.find(item => item.id === id)!.label),
        leads[id] ? el("p", { class: "a4-lead" }, leads[id]) : null]),
      content);
  }

  function extraLinks(items: readonly (typeof EXTRAS)[number][]): HTMLElement {
    return el("nav", { class: "a4-group" }, el("ul", { class: "a4-list a4-extras" }, ...items.map(item => {
      const open = el("a", { class: "a4-row-title", href: "#" + item.id }, item.label);
      open.addEventListener("click", event => { event.preventDefault(); go(item.id); });
      return el("li", { class: "a4-row" }, el("div", { class: "a4-row-main" }, el("div", { class: "a4-row-text" }, open, el("span", { class: "a4-meta" }, item.hint)), glyph(ChevronRight)));
    })));
  }

  function settingsView(): HTMLElement {
    if (settingsPage === "notify") return notifyPage();
    if (settingsPage === "mcp") return mcpPage();
    if (settingsPage === "time" && runtime) return setPage(tx("時間の記録"), "", embed(workUi.settings()));
    if (settingsPage === "analytics" && runtime) return setPage(tx("任意の利用計測"), "", el("div", { class: "a4-extra" }, analyticsUi.render()));
    if (notify === null && !notifyLoading && !notifyError) loadNotify();
    if (connections === null && !connectionsLoading && !connectionsError) loadConnections();
    const open = (page: typeof settingsPage) => () => { settingsPage = page; if (page === "analytics") analyticsUi.enter(); render(); main.querySelector<HTMLElement>("h1")?.focus(); };
    const theme = document.documentElement.getAttribute("data-theme") ?? "system";
    const themes = modeSwitch([["system", tx("端末")], ["light", tx("ライト")], ["dark", tx("ダーク")]] as const, theme as "system" | "light" | "dark", value => {
      if (value === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", value);
      store.set("qf-relay-forge-theme", value === "system" ? null : value);
      paintThemeColor();
    });
    themes.setAttribute("aria-label", tx("テーマ"));
    // Copy is resolved once at load, so a language change reloads the page.
    const language = el("select", { class: "a4-input", "aria-label": tx("言語") },
      ...SUPPORTED_LOCALES.map(code => el("option", { value: code, selected: code === LOCALE, lang: code }, LOCALE_METADATA[code].label)));
    language.addEventListener("change", () => { setLocale(language.value); location.reload(); });
    const group = (title: string, ...rows: (HTMLElement | null)[]) => el("section", { class: "a4-set-group" }, el("h2", { class: "a4-set-head" }, title), ...rows);
    const signOut = port.signOut ? el("button", { type: "button", class: "a4-set-row a4-set-out" }, el("span", { class: "a4-set-copy" }, el("strong", {}, tx("サインアウト")))) : null;
    signOut?.addEventListener("click", () => { void port.signOut?.(); });
    return el("section", { class: "a4-view a4-wide a4-settings" },
      el("h1", { class: "a4-sr", tabindex: -1 }, tx("設定")),
      el("div", { class: "a4-set-col" },
        group(tx("表示"),
          setRow(tx("テーマ"), "", themes),
          setRow(tx("言語"), "", language),
          setRow(tx("完了のお祝い"), tx("完了したら紙吹雪を出します"), toggle(cheer, on => { cheer = on; store.set("a4-cheer", on ? null : "off"); })),
          setRow(tx("レベル・XP"), tx("ゲーム要素を表示します"), toggle(game, on => { game = on; store.set("a4-game", on ? null : "off"); say(on ? tx("ゲーム要素を表示します") : tx("ゲーム要素を隠しました")); }))),
        group(tx("通知と連携"),
          setRow(tx("通知"), tx("リマインド・朝のまとめ・Agentからの知らせ"), notify ? notify.device ? tx("オン") : tx("オフ") : null, open("notify")),
          setRow(tx("外部サービス"), tx("カレンダーや時間の記録をつなぐ"), null, () => go("connections")),
          setRow(tx("MCP接続"), tx("Claude・CodexなどのAIクライアント"), connections ? tx("{count}件", { count: connections.length }) : null, open("mcp")))),
      el("div", { class: "a4-set-col" },
        group(tx("アカウントとデータ"),
          runtime ? setRow(tx("時間の記録"), tx("記録元・タイムゾーン・書き出し"), null, open("time")) : null,
          setRow(tx("プロフィール"), tx("表示名・ユーザー名・ひとこと"), port.self().label, () => go("profile")),
          setRow(tx("利用プラン"), tx("プランの確認と管理"), null, () => go("billing")),
          runtime ? setRow(tx("任意の利用計測"), tx("同意の確認と撤回"), null, open("analytics")) : null),
        group(tx("その他"),
          setRow(tx("キーボード操作"), tx("N か / で書き出し、J と K で行を移動、X で完了、S で今のタスクを始める"), null),
          setRow("Guilduo / Relay Forge", tx("詳しい画面を開く"), null, RELAY_FORGE_URL),
          signOut)));
  }

  function dock(): HTMLElement | null {
    const running = view === "now" ? undefined : quests().find(isWorking);
    if (!running) return null;
    const open = el("button", { type: "button", class: "a4-row-title" }, running.title);
    open.addEventListener("click", () => { focusId = running.id; go("now"); });
    const stop = el("button", { type: "button", class: "a4-icon-button", "aria-label": tx("一時停止") }, glyph(Pause));
    stop.addEventListener("click", () => pause(running));
    const node = runTimer(running);
    if (running.estimatedMinutes > 0) node.querySelector("small")!.textContent = `/ ${minutesLabel(running.estimatedMinutes)}`;
    return el("aside", { class: "a4-dock", "aria-label": tx("作業中") }, node,
      el("div", { class: "a4-row-text" }, open, el("span", { class: "a4-meta" }, tx("作業中"))),
      stop, (() => { const done = button(tx("完了"), () => complete(running)); done.prepend(glyph(Check)); return done; })());
  }

  /* ------------------------------ shell ------------------------------ */

  function go(next: View, questId?: string | null): void {
    if (sheet) { closeSheet?.(() => go(next, questId)); return; }
    // An unsaved note asks before it is left behind.
    if (workUi.dirty() && next !== view) { workUi.guard(() => { workUi.clearCalendar(); leave(next, questId); }); return; }
    leave(next, questId);
  }

  function leave(next: View, questId?: string | null): void {
    if (questId && !quests().some(q => q.id === questId && (needsDecision(q) || q.assignee.handoffState === "blocked"))) { say(tx("見つかりませんでした。")); return; }
    if (isExtra(next) && next !== view) {
      if (next === "billing") { billingPage.reset(); billingUi.enter(); }
      else if (FORGE.includes(next)) forge?.enter(next as ForgeScreen);
      void workUi.load();
    }
    if (next === "guild" && view !== "guild") { activity = null; activityError = false; }
    if (next === "settings" && view !== "settings") { connections = null; connectionsError = false; notify = null; notifyError = false; }
    const url = new URL(location.href);
    if (questId !== undefined) {
      decisionId = questId;
      if (questId) url.searchParams.set("quest", questId); else url.searchParams.delete("quest");
    }
    view = next;
    settingsPage = "";
    url.hash = next;
    if (url.href !== location.href) history.pushState(null, "", url);
    viewUrl = url.href;
    render();
    main.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  /** The browser chrome follows the canvas, including an explicit theme choice. */
  function paintThemeColor(): void {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", getComputedStyle(document.body).backgroundColor);
  }

  function render(): void {
    if (disposed) return;
    const active = document.activeElement;
    const scroll = window.scrollY;
    const weekScroll = main.querySelector(".a4-wk-scroll")?.scrollLeft ?? 0;
    const focusTaskId = active instanceof HTMLElement ? active.dataset.questId : undefined;
    const keepFocus = active instanceof HTMLElement && main.contains(active) && active.matches("input") ? null : active instanceof HTMLElement && main.contains(active) ? active.textContent : null;
    replaceChildren(nav, ...VIEWS.map(item => {
      const waiting = item.id === "guild" ? quests().filter(needsDecision).length + agentSummary(quests(), port.today()).blocked.length : 0;
      const tab = el("a", { class: "a4-tab", href: `#${item.id}`, "aria-current": view === item.id || (item.id === (["network", "battle", "skills"].includes(view) ? "guild" : "settings") && isExtra(view)) ? "page" : null, "data-view": item.id }, glyph(({ now: Sun, plan: CalendarDays, all: ListTodo, guild: Users, settings: Settings } as Record<string, IconNode>)[item.id]!), el("span", {}, item.label),
        waiting > 0 ? el("span", { class: "a4-badge", "aria-label": tx("判断待ち {count} 件", { count: waiting }) }, String(waiting)) : null);
      tab.addEventListener("click", event => { event.preventDefault(); go(item.id); });
      return tab;
    }));
    root.querySelector(".a4-app")?.setAttribute("data-busy", String(busy));
    main.setAttribute("data-view", view);
    document.title = `${[...VIEWS, ...EXTRAS].find(item => item.id === view)?.label} — Guilduo`;
    replaceChildren(breadcrumb, el("span", {}, tx("マイワークスペース")), glyph(ChevronRight), ...(view === "settings" && settingsPage
      ? [el("span", {}, tx("設定")), " › ", el("strong", {}, { notify: tx("通知"), mcp: tx("MCP接続"), time: tx("時間の記録"), analytics: tx("任意の利用計測") }[settingsPage])]
      : isExtra(view) ? [el("span", {}, ["network", "battle", "skills"].includes(view) ? tx("ギルド") : tx("設定")), " › ", el("strong", {}, EXTRAS.find(item => item.id === view)!.label)]
      : [el("strong", {}, [...VIEWS, ...EXTRAS].find(item => item.id === view)?.label ?? "")]));
    paintThemeColor();
    workUi.clearCalendar();
    replaceChildren(main, view === "now" ? nowView() : view === "plan" ? planView() : view === "all" ? allView() : view === "guild" ? guildView() : isExtra(view) ? extraView(view) : settingsView());
    replaceChildren(dockHost, dock());
    repaintSheet?.();
    paintProgress();
    // Keep keyboard users on the control they used when it survives the rerender.
    if (keepFocus) [...main.querySelectorAll<HTMLElement>("button")].find(node => focusTaskId ? node.dataset.questId === focusTaskId : node.textContent === keepFocus)?.focus({ preventScroll: true });
    const weekRegion = main.querySelector(".a4-wk-scroll");
    if (weekRegion) weekRegion.scrollLeft = weekScroll;
    window.scrollTo(0, scroll);
    // A background refresh must not take the search box away mid-typing.
    if (active instanceof HTMLInputElement && active.type === "search" && !main.contains(active)) {
      const field = main.querySelector<HTMLInputElement>('input[type="search"]');
      field?.focus({ preventScroll: true });
      field?.setSelectionRange(field.value.length, field.value.length);
    }
  }

  const tick = window.setInterval(() => { for (const node of root.querySelectorAll<HTMLElement & { a4Paint?: () => void }>(".a4-ring, .a4-run")) node.a4Paint?.(); paintProgress(); }, 1000);
  const onFocus = () => { if (port.refresh && !busy && pending.size === 0 && !sheet && !captureDialog && !document.querySelector(".a4-image-viewer[open]")) void port.refresh().then(() => { clearDecisionGalleries(); refreshError = false; render(); }, () => { refreshError = true; say(tx("再取得できませんでした。表示中の内容を残しています。")); render(); }); };
  const onHide = () => { if (document.visibilityState === "hidden") flushPending(); else onFocus(); };
  // Agents move work while the page sits open; pick that up unless someone is typing.
  const poll = window.setInterval(() => {
    if (document.visibilityState === "visible" && !document.activeElement?.matches("input, textarea, select")) onFocus();
  }, 60_000);
  const onHash = () => {
    const next = viewFromHash();
    const requested = next === "guild" ? new URL(location.href).searchParams.get("quest") : undefined;
    const questId = requested === null || (requested && quests().some(q => q.id === requested && (needsDecision(q) || q.assignee.handoffState === "blocked"))) ? requested : undefined;
    if (next !== view || (questId !== undefined && questId !== decisionId)) {
      if (sheet || workUi.dirty()) history.replaceState(null, "", viewUrl);
      go(next, questId);
    }
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || sheet || disposed) return;
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && key === "k") { event.preventDefault(); openCapture(); return; }
    if (event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement | null)?.matches?.("input, textarea, select, [contenteditable]")) return;
    if (key === "n" || key === "/") { event.preventDefault(); openCapture(); return; }
    if (key === "j" || key === "k") {
      const titles = [...main.querySelectorAll<HTMLElement>(".a4-row-title[data-quest-id]")].filter(node => node.offsetParent !== null);
      const index = titles.indexOf(document.activeElement as HTMLElement);
      const next = titles[index < 0 ? 0 : Math.min(titles.length - 1, Math.max(0, index + (key === "j" ? 1 : -1)))];
      if (!next) return;
      event.preventDefault();
      next.focus();
      next.scrollIntoView({ block: "nearest" });
      return;
    }
    if (key === "x") {
      const quest = byId((document.activeElement as HTMLElement | null)?.dataset?.questId ?? null);
      if (quest && quest.assignee.type === "self" && !isDone(quest) && !needsDecision(quest) && !busy) { event.preventDefault(); complete(quest); }
      return;
    }
    if (key === "s" && view === "now" && focusQuest && !isWorking(focusQuest) && !busy) { event.preventDefault(); start(focusQuest); }
  };

  const onUnload = (event: BeforeUnloadEvent) => { if (sheetDirty?.() || captureInput.value.trim()) { event.preventDefault(); event.returnValue = ""; } };
  window.addEventListener("beforeunload", onUnload);
  document.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onHide);
  root.addEventListener("pointerdown", onPointer, true);
  window.addEventListener("hashchange", onHash);
  window.addEventListener("popstate", onHash);
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onFocus);
  const unsubscribe = port.subscribe?.(() => { clearDecisionGalleries(); if (!busy) render(); });
  render();

  return () => {
    disposed = true;
    for (const id of new Set([...reviewImageEditors.keys(), ...reviewImageGalleries.keys()])) disposeDecisionImages(id);
    flushPending();
    sheet?.close();
    captureDialog?.close();
    window.clearInterval(tick);
    window.clearInterval(poll);
    window.clearTimeout(toastTimer);
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("beforeunload", onUnload);
    document.removeEventListener("keydown", onKey);
    root.removeEventListener("pointerdown", onPointer, true);
    window.removeEventListener("hashchange", onHash);
    window.removeEventListener("popstate", onHash);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("online", onFocus);
    unsubscribe?.();
    workUi.dispose();
  };
}

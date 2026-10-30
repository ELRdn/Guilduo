/**
 * All for ADHD — a calmer Guilduo surface.
 *
 * Same Quests, Agents and API as Relay Forge; only the UI differs. Each screen
 * offers one primary action, capture is a single field on every screen, time is
 * shown rather than typed, and destructive or committing actions get an undo
 * window instead of a confirmation dialog. Japanese-only while prototyping.
 */

import { createElement, Sun, Moon, CalendarDays, ListTodo, Users, Settings, Plus, Play, Clock3, ArrowRight, MoreHorizontal, Flag, type IconNode } from "lucide";
import type { CharacterState, Quest } from "../../types/questforge.ts";
import { el, replaceChildren, svg } from "../relay-forge/primitives/dom.ts";
import { celebrate } from "./celebrate.ts";
import { getLocale, setLocale, LOCALE_METADATA, SUPPORTED_LOCALES } from "../../i18n.ts";
import { tx } from "./copy.ts";
import { questImageEditor, type QuestImagePort } from "./images.ts";
import type { RelayForgeRuntime } from "../relay-forge/production.ts";
import { productivityWorkspace } from "../relay-forge/screens/productivity.ts";
import { createBillingUi } from "../relay-forge/screens/billing.ts";
import { createAnalyticsUi } from "../relay-forge/screens/analytics.ts";
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
  { id: "network", label: tx("つながり"), hint: tx("タスクと人と連携の関係を図で見る") },
  { id: "battle", label: tx("バトル"), hint: tx("終えたタスクで戦うゲーム") },
  { id: "connections", label: tx("連携"), hint: tx("Google などの外部サービスと同期") },
  { id: "skills", label: tx("スキル"), hint: tx("Agent が使える MCP ツールの一覧") },
  { id: "billing", label: tx("プラン"), hint: tx("利用プランと支払い") },
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
const GRID_PX = 1.6;
/** Side-by-side cards per overlap in the week grid before the rest fold away. */
const MAX_LANES = 2;
const MONTH_PILLS = 3;
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
  let removingAgent: string | null = null;
  let revokingClient: string | null = null;
  let profile: RelayForgeRuntime["profile"] = null;
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
  const rested = new Set<string>();
  const openGaps = new Set<string>();
  let workOpen = false;
  // The Now card's task, for the S shortcut.
  let focusQuest: Quest | null = null;
  // Relay Forge's detailed views live inside the tab they belong to.
  let allMode: "list" | "table" | "notes" = "list";
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
    port: runtime?.productivityPort, quests: port.quests, held: () => busy,
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
  }) : null;
  if (runtime) void workUi.load();
  const analyticsUi = createAnalyticsUi({ port: runtime?.analyticsPort ?? null, render: () => render(), alive: () => !disposed });
  const byId = (id: string | null) => (id === null ? null : port.quests().find(q => q.id === id) ?? null);

  const toast = el("div", { class: "a4-toast", role: "status", "aria-live": "polite", hidden: true });
  const main = el("main", { class: "a4-main", id: "a4-main", tabindex: -1 });
  const dockHost = el("div", { class: "a4-dock-host" });
  const nav = el("nav", { class: "a4-tabs", "aria-label": tx("画面") });
  const captureInput = el("input", { class: "a4-capture-input", type: "text", name: "title", placeholder: tx("思いついたら書く"), "aria-label": tx("やることを書き出す"), autocomplete: "off", enterkeyhint: "done", maxlength: 200 });
  const captureToday = el("button", { type: "button", class: "a4-chip", "aria-pressed": "false" }, tx("今日やる"));
  const captureParse = el("p", { class: "a4-parse", id: "a4-parse", "aria-live": "polite" });
  captureInput.setAttribute("aria-describedby", "a4-parse");
  const captureForm = el("form", { class: "a4-capture" }, captureInput, captureToday, el("button", { type: "submit", class: "a4-button" }, tx("追加")), captureParse);
  const addButton = el("button", { type: "button", class: "a4-button a4-top-add" }, glyph(Plus), tx("タスクを追加"));
  const mobileAdd = el("button", { type: "button", class: "a4-mobile-add", "aria-label": tx("タスクを追加") }, glyph(Plus));
  const themeButton = el("button", { type: "button", class: "a4-icon-button", "aria-label": tx("表示テーマ") }, glyph(Moon));
  themeButton.addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    store.set("qf-relay-forge-theme", dark ? "light" : "dark");
    replaceChildren(themeButton, glyph(dark ? Moon : Sun));
    paintThemeColor();
  });
  const breadcrumb = el("span", { class: "a4-breadcrumb" });
  const header = el("header", { class: "a4-top" }, breadcrumb, el("div", { class: "a4-top-actions" }, themeButton, addButton));
  const brand = el("a", { class: "a4-brand", href: "#now" },
    el("img", { src: "/assets/brand/guilduo-mark-ink.svg", class: "a4-brand-light", alt: "", width: 19, height: 26 }),
    el("img", { src: "/assets/brand/guilduo-mark-gold.svg", class: "a4-brand-dark", alt: "", width: 19, height: 26 }), "Guilduo");
  brand.addEventListener("click", event => { event.preventDefault(); go("now"); });
  const rail = el("aside", { class: "a4-rail" }, brand, nav,
    el("div", { class: "a4-profile" }, el("span", { class: "a4-avatar", "aria-hidden": "true" }, port.self().label.slice(0, 2)),
      el("span", {}, port.self().label)));
  const banner = port.demo ? el("p", { class: "a4-demo" }, tx("デモ（保存されません） "), el("a", { href: location.pathname }, tx("サインイン"))) : null;
  replaceChildren(root, el("div", { class: "a4-app" }, banner, rail, header, main, mobileAdd, dockHost, toast));
  let captureDialog: HTMLDialogElement | null = null;
  function openCapture(): void {
    if (sheet) { closeSheet?.(openCapture); return; }
    if (captureDialog?.open) { captureInput.focus(); return; }
    const opener = document.activeElement;
    const close = el("button", { type: "button", class: "a4-button" }, tx("閉じる"));
    const dialog = el("dialog", { class: "a4-capture-dialog", "aria-label": tx("タスクを追加") },
      el("div", { class: "a4-sheet-head" }, el("h2", { class: "a4-subtitle" }, tx("タスクを追加")), close), captureForm);
    close.addEventListener("click", () => { if (!busy) dialog.close(); });
    dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
    dialog.addEventListener("close", () => { dialog.remove(); captureDialog = null; if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); });
    captureDialog = dialog;
    document.body.append(dialog);
    dialog.showModal();
    captureInput.focus();
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
    if (!captureInput.value.trim() || !read) { captureParse.textContent = ""; return; }
    const day = !parsed.date ? tx("受け箱") : parsed.date === port.today() ? tx("今日") : parsed.date === addDays(port.today(), 1) ? tx("明日") : dayLabel.format(noon(parsed.date));
    const when = parsed.time ? `${parsed.time}${parsed.minutes ? `–${clock(toMinutes(parsed.time) + parsed.minutes)}` : ""}` : "";
    replaceChildren(captureParse, iconFor(parsed.title) ? `${iconFor(parsed.title)} ` : "", el("b", {}, parsed.title), " · ",
      [day, when, parsed.minutes ? tx("目安 {time}", { time: minutesLabel(parsed.minutes) }) : "", ...parsed.tags.map((tag: string) => `#${tag}`)].filter(Boolean).join(" · "));
  };
  captureInput.addEventListener("input", paintParse);
  captureToday.addEventListener("click", paintParse);
  captureForm.addEventListener("submit", event => {
    event.preventDefault();
    if (!captureInput.value.trim() || busy) return;
    const parsed = readCapture();
    const icon = iconFor(parsed.title);
    void run(async () => {
      const created = await port.create({
        kind: "todo", title: parsed.title.slice(0, 80), notes: "", difficulty: "medium", impact: "medium", lifecycleState: "active",
        nextAction: "", estimatedMinutes: parsed.minutes, dueDate: "", tags: parsed.tags, icon, iconSource: icon ? "auto" : "",
        scheduledDate: parsed.date, scheduledTime: parsed.time, planningMode: "on_date", planningState: parsed.date ? "scheduled" : "backlog",
      });
      captureInput.value = "";
      captureDialog?.close();
      paintParse();
      const message = !parsed.date ? tx("受け箱に追加しました") : parsed.date === port.today() ? tx("今日のやることに追加しました") : tx("{day}に追加しました", { day: dayLabel.format(noon(parsed.date)) });
      // Big work is easier to start in steps; one tap asks an Agent to split it through the usual handoff.
      const agent = port.agents().find(item => item.active);
      if (agent && isBig(parsed.title, parsed.minutes)) say(message, () => askToSplit(created, agent), tx("{name}にステップに分けてもらう", { name: agent.name }));
      else say(message);
    }, tx("追加できませんでした。入力は残しています。"));
  });

  function askToSplit(quest: Quest, agent: AllForAgent): void {
    update(quest, {
      assignee: { type: "agent", id: agent.id, label: agent.name, handoffState: agent.startState || "ready" },
      handoff: { ...quest.handoff, note: tx("ステップに分けて、各ステップに目安と絵文字を付けてください。終わったら私に戻してください。") },
    }, tx("{name} に渡しました", { name: agent.name }));
  }

  function say(message: string, undo?: () => void, actionLabel = tx("元に戻す")): void {
    window.clearTimeout(toastTimer);
    replaceChildren(toast, el("span", {}, message), undo ? (() => {
      const button = el("button", { type: "button", class: "a4-link" }, actionLabel);
      button.addEventListener("click", () => { undo(); toast.hidden = true; });
      return button;
    })() : null);
    toast.hidden = false;
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, undo ? UNDO_MS : 3000);
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

  function complete(quest: Quest): void {
    if (pending.has(quest.id)) return;
    if (focusId === quest.id) focusId = null;
    store.set(`a4-start:${quest.id}`, null);
    stopTracking(quest);
    const send = () => {
      if (disposed) return;
      // Another save holds the screen; wait for it instead of dropping the completion.
      if (busy) { pending.set(quest.id, window.setTimeout(send, 500)); return; }
      pending.set(quest.id, 0);
      void run(async () => {
        try {
          const result = await port.complete(quest);
          if (game && result.character) say(tx("完了！ Lv {level} · XP {xp}/{next}", { level: result.character.level, xp: result.character.xp, next: result.character.nextXp }));
        } finally { pending.delete(quest.id); }
      }, tx("完了を保存できませんでした。もう一度試してください。"));
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
    say(dayDone ? tx("今日の分、ぜんぶ終わりました！") : game ? tx("完了！ よくできました") : tx("完了しました"), () => {
      const timer = pending.get(quest.id);
      if (!timer) return;
      window.clearTimeout(timer);
      pending.delete(quest.id);
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

  function pause(quest: Quest): void {
    store.set(`a4-start:${quest.id}`, null);
    stopTracking(quest);
    update(quest, { assignee: { ...quest.assignee, handoffState: "none" } }, tx("一時停止しました。続きはいつでもここから。"));
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

  function decisionNotice(): HTMLElement | null {
    const ai = agentSummary(quests(), port.today());
    const count = quests().filter(needsDecision).length;
    if (count === 0 && ai.blocked.length === 0) return null;
    const link = el("a", { class: "a4-notice", href: "#guild" }, tx("確認 {review}件 · 停止 {blocked}件", { review: count, blocked: ai.blocked.length }), el("span", { "aria-hidden": "true" }, " →"));
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
    if (view === "now" && (quest.id === focusQuest?.id || quest.id === focusQuest?.parentQuestId)) return "focus";
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
      const remove = locked ? null : el("button", { type: "button", class: "a4-relay-x", "aria-label": tx("{name}を外す", { name }) }, "×");
      remove?.addEventListener("click", () => { legs.splice(index, 1); paint(); });
      const node = el("li", { class: "a4-relay-node", "data-kind": "agent", "data-index": String(index), "data-status": !started || index > at ? "next" : index < at ? "done" : "now",
        "data-draggable": String(multi && !locked), "aria-label": tx("{index}番目 {name}", { index: index + 1, name }) + (leg.ask ? `${tx("：")}${leg.ask}` : "") },
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
      hint.textContent = !changed() ? (legs.length === 0 && editable ? (multi ? tx("Agentを足すと、順番にバトンを渡します。最後はあなたが確認します。") : tx("Agentを足すと、そのAgentに渡します。終わったらあなたが確認します。")) : "")
        : legs.length === 0 ? tx("保存すると自分の担当に戻します。")
        : !started || (!multi && first?.agentId !== quest.assignee.id) ? (legs.length > 1 ? tx("保存すると {first} に渡します。終わったら {rest} へ回り、最後にあなたが確認します。", { first: nameOf(first!.agentId), rest: legs.slice(1).map(leg => nameOf(leg.agentId)).join(" → ") }) : tx("保存すると {first} に渡します。終わったら、最後にあなたが確認します。", { first: nameOf(first!.agentId) }))
        : tx("保存すると、このあとの順番を変えます。");
    }
    function paint(): void {
      const { started, at, state } = position();
      const items: HTMLElement[] = [selfNode(tx("{name}（あなた）", { name: port.self().label }), null)];
      legs.forEach((leg, index) => {
        items.push(index === 0 ? link(null, at, tx("渡す")) : link(index - 1, at));
        items.push(legNode(leg, index, started, at, state));
      });
      const last = started && at === legs.length - 1;
      items.push(link(null, at, legs.length > 0 ? tx("終わったら") : ""));
      items.push(selfNode(legs.length > 0 ? tx("あなたが最後の確認") : tx("あなたが進める"),
        last && state === "review_required" ? status(tx("あなたの番"), "review_required") : last && state === "accepted" ? status(tx("完了"), "accepted") : null, true));
      const add = editable && legs.length < max ? (() => {
        const button = el("button", { type: "button", class: "a4-relay-add", "aria-expanded": String(palette) }, tx("＋ Agent を足す"));
        button.addEventListener("click", () => { palette = !palette; paint(); list.querySelector<HTMLElement>(".a4-relay-palette button")?.focus(); });
        return button;
      })() : null;
      const chips = palette && add ? el("li", { class: "a4-relay-palette", role: "group", "aria-label": tx("足すAgent") }, ...(agents.length === 0
        ? [el("span", { class: "a4-muted" }, tx("使えるAgentがいません。登録は詳しい画面で行います。"))]
        : agents.map(agent => {
          const chip = el("button", { type: "button", class: "a4-chip", title: agent.role }, agent.name);
          chip.addEventListener("click", () => { if (Date.now() > suppressClickUntil) addLeg(agent.id); });
          if (multi) dragify(chip, to => addLeg(agent.id, to));
          return chip;
        }))) : null;
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
      replaceChildren(iconPane, ...iconChoices(title.value, recentIcons()).map(value => choice(value, value)), choice("", tx("なし")));
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
    const steps = el("div", { class: "a4-sheet-steps" });
    const drafts = children(quest).map(q => ({ quest: q as Quest | null, title: q.title, done: isDone(forDay(q, today)), removed: false }));
    const stepInput = el("input", { class: "a4-input", placeholder: tx("ステップを追加"), "aria-label": tx("小さなステップを追加"), maxlength: 200, enterkeyhint: "done" });
    const stepForm = el("form", { class: "a4-step-form" }, stepInput, el("button", { type: "submit", class: "a4-button" }, tx("追加")));
    const paintSteps = () => replaceChildren(steps, ...drafts.filter(d => !d.removed).map(draft => {
      const check = el("input", { type: "checkbox", checked: draft.done, disabled: busy || (draft.quest != null && (draft.quest.assignee.type !== "self" || (draft.quest.kind === "daily" && draft.done))), "aria-label": draft.title });
      check.addEventListener("change", () => { draft.done = check.checked; });
      return el("div", { class: "a4-step-draft" }, el("label", { class: "a4-option" }, check, draft.title),
        button(tx("しまう"), () => { draft.removed = true; paintSteps(); }, "link"));
    }));
    stepForm.addEventListener("submit", event => {
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
    form.append(el("details", { class: "a4-more" }, el("summary", { class: "a4-chip" }, tx("繰り返し")), repeat), images.element);
    const close = el("button", { type: "button", class: "a4-button" }, tx("閉じる"));
    const dialog = el("dialog", { class: "a4-sheet", "aria-label": tx("詳しく：{title}", { title: quest.title }) },
      el("div", { class: "a4-sheet-head" },
        parent ? button(tx("← 「{title}」の一部", { title: shortTitle(parent.title) }), () => openSheet(parent), "link") : el("h2", { id: "a4-sheet-title", class: "a4-eyebrow" }, tx("詳しく")), close),
      form,
      quest.proposal ? (proposal => el("section", { class: "a4-group a4-proposal" },
        el("h3", { class: "a4-step-label" }, tx("{name}の提案", { name: proposal.label })),
        el("p", { class: "a4-proposal-when" }, `${shortDay(proposal.date)} ${proposal.time}–${clock(toMinutes(proposal.time) + proposal.minutes)}`, proposal.note ? el("span", { class: "a4-meta" }, proposal.note) : null),
        el("div", { class: "a4-actions" },
          button(tx("この時間に入れる"), () => requestClose(() => acceptProposal(quest))),
          button(tx("断る"), () => requestClose(() => update(quest, { proposal: null, expectedUpdatedAt: quest.updatedAt }, tx("提案を断りました"))), "link"))))(quest.proposal) : null,
      depList,
      el("section", { class: "a4-group" }, el("h3", { class: "a4-step-label" }, tx("担当")), relay.node),
      el("section", { class: "a4-group" }, el("h3", { class: "a4-step-label" }, tx("小さなステップ")), steps, mine ? stepForm : null),
      el("div", { class: "a4-actions a4-sheet-foot" },
        el("button", { type: "submit", class: "a4-button a4-primary", form: "a4-sheet-form" }, tx("保存")),
        mine ? button(tx("今やる"), () => requestClose(() => { start(forDay(quest, port.today())); go("now"); })) : null,
        // Putting away is reversible from search and the toast, so it needs no confirm step.
        quest.lifecycleState === "archived"
          ? button(tx("戻す"), () => requestClose(() => update(quest, { lifecycleState: "active" }, tx("やることに戻しました"), { lifecycleState: "archived" })), "link")
          : button(tx("しまう"), () => requestClose(() => update(quest, { lifecycleState: "archived" }, tx("しまいました。「やること」の検索から戻せます。"), { lifecycleState: quest.lifecycleState })), "link"),
        el("a", { class: "a4-link", href: RELAY_FORGE_URL }, tx("詳しい画面で開く"))));
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

  function chooseTask(): void {
    if (sheet) { closeSheet?.(chooseTask); return; }
    const candidates = nextCandidates(quests(), port.today());
    const close = button(tx("閉じる"), () => dialog.close());
    const dialog = el("dialog", { class: "a4-capture-dialog", "aria-label": tx("別のタスク") },
      el("div", { class: "a4-sheet-head" }, el("h2", { class: "a4-subtitle" }, tx("別のタスク")), close),
      el("ul", { class: "a4-list" }, ...candidates.map(q => {
        const pick = button(q.title, () => { focusId = q.id; dialog.close(); render(); });
        return el("li", {}, pick);
      })), button(tx("タスク"), () => { dialog.close(); go("all"); }, "link"));
    const opener = document.activeElement;
    dialog.addEventListener("close", () => { dialog.remove(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); });
    document.body.append(dialog); dialog.showModal();
  }

  function aiRail(): HTMLElement {
    const ai = agentSummary(quests(), port.today());
    return el("aside", { class: "a4-ai", "aria-label": tx("AIの状況") },
      el("div", { class: "a4-group-head" }, el("h2", { class: "a4-subtitle" }, tx("AIの状況")), button(tx("ギルド"), () => go("guild"), "link")),
      el("div", { class: "a4-ai-counts" }, ...[[tx("確認待ち"), ai.review.length], [tx("止まっている"), ai.blocked.length], [tx("作業中"), ai.working.length]].map(([label, count]) =>
        el("div", {}, el("strong", {}, String(count)), el("span", {}, String(label))))),
      ...ai.visible.map(q => {
        const item = button("", () => { if (needsDecision(q)) go("guild", q.id); else openSheet(q); });
        item.className = "a4-ai-row";
        const state = needsDecision(q) ? tx("確認待ち") : AGENT_STATE[q.assignee.handoffState] ?? tx("担当");
        item.append(el("span", { class: "a4-avatar a4-avatar-agent", "aria-hidden": "true" }, (q.assignee.label || "AI").slice(0, 2)),
          el("span", { class: "a4-ai-copy" }, el("small", {}, q.assignee.label || "Agent", " · ", state), el("strong", {}, q.title)));
        return item;
      }),
      ai.visible.length ? null : el("p", { class: "a4-muted" }, tx("いま、あなたの判断を待っているものはありません。")),
      ai.ready.length ? el("p", { class: "a4-muted" }, tx("受け取り待ち {count}件", { count: ai.ready.length })) : null,
      button(tx("ギルドを開く"), () => go("guild"), "link"));
  }

  function nowView(): HTMLElement {
    const today = port.today();
    const candidates = nextCandidates(quests(), today);
    const focus = candidates.find(isWorking) ?? candidates.find(q => q.id === focusId) ?? candidates[0] ?? null;
    focusQuest = focus;
    const focusParent = focus?.parentQuestId ? byId(focus.parentQuestId) : null;
    const focusDisplay = focusParent ?? focus;
    const { anytime, timed } = dayPlan(displayQuests(), today);
    const todays = [...anytime, ...timed];
    const next = timed.find(q => !isDone(q) && q.id !== focus?.id && q.id !== focusParent?.id && toMinutes(q.scheduledTime) > nowMinutes());
    const summary = el("p", { class: "a4-summary" }, tx("今日 {done} / {total} 完了 · 予定 {time}", {
      done: todays.filter(isDone).length, total: todays.length, time: minutesLabel(plannedMinutes(todays.filter(q => !isDone(q)))) }));
    const heading = el("div", { class: "a4-page-heading" },
      el("h1", { class: "a4-date", tabindex: -1 }, dateLabel.format(noon(today)), el("small", {}, weekdayLong.format(noon(today)))), summary);
    const running = focus && isWorking(focus);
    const card = focus ? el("article", { class: "a4-focus", "data-running": String(running) },
      el("div", { class: "a4-focus-head" }, el("span", { class: "a4-focus-label" }, glyph(running ? Play : Flag), running ? tx("作業中") : tx("今の1件")),
        (() => { const more = button("", () => openSheet(focus)); more.className = "a4-icon-button"; more.setAttribute("aria-label", tx("詳しく")); more.append(glyph(MoreHorizontal)); return more; })()),
      el("div", { class: "a4-focus-title" }, iconCircle(focusDisplay!, "sm"), titleButton(focusDisplay!)),
      el("p", { class: "a4-step" }, el("span", { class: "a4-step-label" }, tx("次の一歩")), el("span", {}, focus.nextAction || (focusParent ? focus.title : tx("まずは、できるところから。")))),
      el("div", { class: "a4-actions" },
        button(running ? tx("完了") : tx("始める"), () => running ? complete(focus) : start(focus), "primary"),
        running ? timer(focus, true) : focus.estimatedMinutes ? el("span", { class: "a4-focus-time" }, glyph(Clock3), minutesLabel(focus.estimatedMinutes)) : button(tx("＋目安"), () => openSheet(focus), "link"),
        button(running ? tx("一時停止") : tx("別のタスク"), () => running ? pause(focus) : chooseTask(), "link")))
      : el("div", { class: "a4-empty" }, el("h2", { class: "a4-subtitle" }, tx("今日の1件を、ここから。")),
        el("p", { class: "a4-muted" }, tx("タスクから今日やるものを選びましょう。")), button(tx("タスクを追加"), openCapture, "primary"), button(tx("タスク"), () => go("all"), "link"));
    const nextRow = next ? button("", () => openSheet(next), "link") : el("p", { class: "a4-next-preview a4-muted" });
    nextRow.className = "a4-next-preview";
    nextRow.append(el("span", { class: "a4-step-label" }, tx("次の予定")));
    if (next) nextRow.append(el("strong", {}, next.scheduledTime), el("span", { class: "a4-next-title" }, next.title), glyph(ArrowRight));
    else nextRow.append(el("span", {}, tx("時刻の決まった予定はありません。")));
    return el("div", { class: "a4-today-page" }, heading,
      refreshError ? el("p", { class: "a4-refresh-error", role: "status" }, tx("再取得できませんでした。表示中の内容を残しています。"), button(tx("もう一度"), onFocus, "link")) : null,
      el("div", { class: "a4-today-grid" },
        el("section", { class: "a4-home" }, decisionNotice(), el("div", { class: "a4-now" }, card, nextRow),
          el("div", { class: "a4-today-flow" }, todayTimeline(), runtime && focus ? workFold(focus) : null)),
        aiRail()));
  }

  /** Month at a glance in the week grid's language: Monday-first weeks, a few pills per day, "+N件" opens the day. */
  function monthGrid(list: readonly Quest[]): HTMLElement {
    const today = port.today();
    const month = planDate.slice(0, 7);
    const start = weekOf(`${month}-01`)[0]!;
    const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    if (days[35]!.slice(0, 7) !== month) days.length = 35;
    const openDay = (date: string) => { planDate = date; planMode = "day"; store.set("a4-plan-mode", null); render(); };
    const cells = days.map(date => {
      const { anytime, timed } = dayPlan(list, date);
      const items = [...timed, ...anytime];
      const shown = items.slice(0, items.length > MONTH_PILLS ? MONTH_PILLS - 1 : MONTH_PILLS);
      const head = el("button", { type: "button", class: "a4-wk-day a4-mo-day", "aria-pressed": String(date === planDate), "data-today": String(date === today),
        "aria-label": calendarLabel(date, items) },
        el("span", { class: "a4-day-num" }, String(Number(date.slice(8)))),
        dayDots(items));
      // Phones show dots only, so a tap opens the day itself.
      head.addEventListener("click", () => { if (matchMedia("(max-width: 760px)").matches) openDay(date); else { planDate = date; render(); } });
      const hidden = items.length - shown.length;
      const more = hidden === 0 ? null : el("button", { type: "button", class: "a4-mo-more", "aria-label": tx("{day} ほか{count}件を日表示で見る", { day: dayLabel.format(noon(date)), count: hidden }) }, tx("+{count}件", { count: hidden }));
      more?.addEventListener("click", () => openDay(date));
      return el("div", { class: "a4-mo-cell", "data-selected": String(date === planDate), "data-outside": String(date.slice(0, 7) !== month) },
        head,
        ...shown.map(q => el("div", { class: "a4-wk-item a4-mo-item", "data-tone": tone(q), "data-hue": hue(q) },
          q.scheduledTime ? el("span", { class: "a4-meta" }, q.scheduledTime) : null, titleButton(q))),
        more);
    });
    return el("div", { class: "a4-mo" },
      ...weekOf(start).map(date => el("span", { class: "a4-day-name a4-mo-name" }, weekdayLabel.format(noon(date)))),
      ...cells);
  }

  const shiftMonth = (date: string, months: number) => {
    const first = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
    first.setUTCMonth(first.getUTCMonth() + months);
    return first.toISOString().slice(0, 10);
  };

  /** Recorded time for the task in focus and its history, folded under 今; the time settings live in 設定. */
  function workFold(focus: Quest): HTMLElement {
    const fold = el("details", { class: "a4-after a4-extra a4-work-fold", open: workOpen },
      el("summary", { class: "a4-subtitle" }, tx("時間の記録")),
      el("p", { class: "a4-muted" }, tx("この作業の記録：{time}", { time: workUi.totals(focus) })),
      el("p", {}, button(tx("記録の履歴"), () => workUi.history(), "link")));
    fold.addEventListener("toggle", () => { workOpen = fold.open; });
    return fold;
  }

  /** Week at a glance: an "anytime" row, then an hourly axis with cards sized by duration. */
  function weekGrid(list: readonly Quest[]): HTMLElement {
    const today = port.today();
    const days = weekOf(planDate);
    const plans = days.map(date => dayPlan(list, date));
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
        el("span", { class: "a4-wk-text" }, el("span", { class: "a4-wk-title" }, quest.icon ? quest.icon + " " : "", quest.title), info ? el("span", { class: "a4-meta" }, info) : null));
      node.addEventListener("click", () => openSheet(quest));
      return node;
    };
    const head = days.map((date, index) => {
      const total = plannedMinutes([...plans[index]!.anytime, ...plans[index]!.timed]);
      const node = el("button", { type: "button", class: "a4-wk-day", "aria-pressed": String(date === planDate), "data-today": String(date === today),
        "aria-label": calendarLabel(date, [...plans[index]!.anytime, ...plans[index]!.timed]) },
        el("span", { class: "a4-day-name" }, weekdayLabel.format(noon(date))),
        el("span", { class: "a4-day-num" }, String(Number(date.slice(8)))),
        dayDots([...plans[index]!.anytime, ...plans[index]!.timed]),
        el("span", { class: "a4-day-total", "aria-hidden": "true" }, total > 0 ? minutesLabel(total) : ""));
      node.addEventListener("click", () => { planDate = date; render(); window.scrollTo(0, 0); });
      return node;
    });
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const columns = days.map((date, index) => {
      // Overlapping cards split the column into lanes; past MAX_LANES the rest fold into "+N件".
      const clusters: { start: number; end: number; items: { quest: Quest; lane: number }[]; lanes: number }[] = [];
      let laneEnds: number[] = [];
      for (const quest of plans[index]!.timed) {
        const start = toMinutes(quest.scheduledTime), end = Math.max(Math.min(1440, endOf(quest)), start + 48 / GRID_PX);
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
          const start = toMinutes(quest.scheduledTime), height = Math.max(44, (Math.min(1440, endOf(quest)) - start) * GRID_PX - 4);
          return card(quest, date, { "data-short": String(height < 60), "data-narrow": String(lanes > 1), style: `top: ${top(start)}; height: ${height}px; ${place(lane)}` });
        });
        if (!folded) return cards;
        const hidden = cluster.items.length - shown.length;
        const more = el("button", { type: "button", class: "a4-wk-more", "aria-label": tx("{day} ほか{count}件を日表示で見る", { day: dayLabel.format(noon(date)), count: hidden }),
          style: `top: ${top(cluster.start)}; height: ${Math.max(44, (cluster.end - cluster.start) * GRID_PX - 4)}px; ${place(MAX_LANES - 1)}` }, tx("+{count}件", { count: hidden }));
        more.addEventListener("click", () => { planDate = date; planMode = "day"; store.set("a4-plan-mode", null); render(); });
        return [...cards, more];
      });
      const nowLine = date === today && nowMinutes >= first * 60 && nowMinutes <= last * 60 ? el("div", { class: "a4-wk-now", style: `top: ${top(nowMinutes)}`, "aria-hidden": "true" }) : null;
      return el("div", { class: "a4-wk-col", "data-selected": String(date === planDate) }, nowLine, ...items);
    });
    const hours = Array.from({ length: last - first }, (_, i) => el("span", { style: `top: ${top((first + i) * 60)}` }, clock((first + i) * 60)));
    return el("div", { class: "a4-wk-scroll", tabindex: 0, role: "region", "aria-label": tx("この週") },
      el("div", { class: "a4-wk", style: `--a4-wk-height: ${(last - first) * 60 * GRID_PX + 44}px; --a4-wk-hour: ${60 * GRID_PX}px` },
        el("span", { class: "a4-wk-corner" }), ...head,
        el("span", { class: "a4-wk-label" }, tx("いつでも")),
        ...plans.map((plan, index) => el("div", { class: "a4-wk-allday", "data-selected": String(days[index] === planDate) }, ...plan.anytime.map(q => card(q, days[index]!)))),
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
  function freeRow(gap: { start: number; minutes: number }): HTMLElement {
    const today = port.today();
    const key = `${today}:${gap.start}`;
    const time = el("span", { class: "a4-slot-time" }, clock(gap.start));
    const pill = el("span", { class: "a4-slot-pill", "aria-hidden": "true" });
    if (rested.has(key)) return el("li", { class: "a4-free", "data-rest": "" }, time, pill, el("p", { class: "a4-free-head" }, tx("休憩 {time}", { time: minutesLabel(gap.minutes) })));
    const head = el("p", { class: "a4-free-head" }, tx("{time} 空いています", { time: minutesLabel(gap.minutes) }));
    if (!openGaps.has(key)) {
      const more = button(tx("提案を見る"), () => { openGaps.add(key); render(); }, "link");
      return el("li", { class: "a4-free" }, time, pill, el("div", {}, head, more));
    }
    const proposed = proposalFor(quests(), gap, today);
    const fit = fitForGap(quests().filter(q => q !== proposed), gap.minutes, today);
    const chip = (label: string, minutes: string, dot: HTMLElement | null, action: () => void) => {
      const node = el("button", { type: "button", class: "a4-suggest", disabled: busy }, dot, el("span", {}, label), minutes ? el("small", {}, minutes) : null);
      node.addEventListener("click", action);
      return node;
    };
    return el("li", { class: "a4-free" }, time, pill,
      el("div", {}, head,
        el("div", { class: "a4-suggests", role: "group", "aria-label": tx("空き時間にすること") },
          proposed?.proposal ? chip(proposed.title, `${minutesLabel(proposed.proposal.minutes)} · ${tx("{name}の提案", { name: proposed.proposal.label })}`, iconCircle(proposed, "sm"), () => acceptProposal(proposed)) : null,
          fit ? chip(fit.title, minutesLabel(fit.estimatedMinutes), iconCircle(fit, "sm"), () =>
            update(fit, { ...plan(today), scheduledTime: clock(gap.start), expectedUpdatedAt: fit.updatedAt }, tx("{time}に「{title}」を入れました", { time: clock(gap.start), title: fit.title }), previousPlan(fit))) : null,
          chip(tx("休む"), "", null, () => {
            rested.add(key);
            say(tx("休憩にしました"), () => { rested.delete(key); render(); });
            render();
          }))));
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
      if (gap) rows.push(freeRow(gap));
      rows.push(el("li", { class: "a4-slot", "data-tone": tone(quest), "data-hue": hue(quest), ...running(quest, end - start), style: `--a4-cap: ${Math.round(Math.max(40, Math.min(96, 24 + (end - start) * 0.6)))}px` },
        el("span", { class: "a4-slot-time" }, quest.scheduledTime, el("small", {}, clock(end))),
        el("span", { class: "a4-slot-pill", "aria-hidden": "true" }, quest.icon ?? ""),
        el("div", { class: "a4-slot-card" }, rowText(quest, false), checkButton(quest, date))));
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
      el("summary", {}, tx("それより前（{count}）", { count: earlier.length })),
      el("ol", { class: "a4-timeline", "data-even": "" }, ...homeRows(earlier, false, date)));
    fold.addEventListener("toggle", () => { if (fold.open) openFolds.add("past:" + date); else openFolds.delete("past:" + date); });
    return el("div", { class: "a4-day-flow" },
      day.anytime.length ? el("section", { class: "a4-anytime" }, el("h3", { class: "a4-step-label" }, tx("いつでも")),
        el("ul", { class: "a4-list" }, ...day.anytime.map(q => el("li", { class: "a4-anytime-row", "data-tone": tone(q) },
          iconCircle(q, "sm"), rowText(q), checkButton(q, date))))) : null,
      earlier.length ? fold : null,
      el("div", { class: "a4-today-panel" },
        timed.length ? el("ol", { class: "a4-timeline", "data-even": "" }, ...homeRows(timed, date === today, date))
          : el("p", { class: "a4-muted" }, tx("時刻の決まった予定はありません。"))));
  }

  function todayTimeline(): HTMLElement {
    return el("section", { class: "a4-today", "aria-labelledby": "a4-today-title" },
      el("div", { class: "a4-group-head" }, el("h2", { class: "a4-subtitle", id: "a4-today-title" }, tx("今日のタイムライン")),
        button(tx("カレンダー"), () => go("plan"), "link")), dayTimeline(port.today()));
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
    const open = [...day.anytime, ...day.timed].filter(q => !isDone(q));

    const modeButton = (mode: PlanMode, label: string) => {
      const node = el("button", { type: "button", class: "a4-seg-button", "aria-pressed": String(planMode === mode) }, label);
      node.addEventListener("click", () => { planMode = mode; store.set("a4-plan-mode", mode === "day" ? null : mode); render(); });
      return node;
    };
    const shift = (label: string, step: number, aria: string) => {
      const node = button(label, () => { planDate = planMode === "month" ? shiftMonth(planDate, step) : addDays(planDate, step * 7); render(); });
      node.setAttribute("aria-label", aria);
      return node;
    };
    const week = el("div", { class: "a4-week", role: "group", "aria-label": tx("この週") }, ...weekOf(planDate).map(date => {
      const items = (({ anytime, timed }) => [...anytime, ...timed])(dayPlan(list, date));
      const node = el("button", { type: "button", class: "a4-day", "aria-pressed": String(date === planDate), "data-today": String(date === today), "aria-label": calendarLabel(date, items) },
        el("span", { class: "a4-day-name" }, weekdayLabel.format(noon(date))),
        el("span", { class: "a4-day-num" }, String(Number(date.slice(8)))),
        dayDots(items));
      node.addEventListener("click", () => { planDate = date; render(); window.scrollTo(0, 0); });
      return node;
    }));


    // Undated work sits beside the day (below it on phones), one tap from being planned.
    const all = groups(quests(), today);
    const place = (quest: Quest) => {
      const node = el("button", { type: "button", class: "a4-add", "aria-label": tx("{title} を{day}に入れる", { title: quest.title, day: dayName(planDate) }), disabled: busy }, tx("＋"));
      node.addEventListener("click", () => update(quest, { ...plan(planDate), expectedUpdatedAt: quest.updatedAt }, tx("{day}に入れました", { day: dayName(planDate) }), previousPlan(quest)));
      return node;
    };
    const sideList = (items: readonly Quest[]) => el("ul", { class: "a4-list" }, ...items.map(q => el("li", { class: "a4-row" }, el("div", { class: "a4-row-main" }, rowText(q), place(q)))));
    const review = planDate === today ? all.review : [];

    return el("section", { class: "a4-view a4-plan", "data-mode": planMode },
      el("div", { class: "a4-plan-main" },
        el("div", { class: "a4-plan-head" },
          el("h1", { class: "a4-title", tabindex: -1 }, planMode !== "day" ? monthLabel.format(noon(planDate)) : planDate === today ? tx("今日 {day}", { day: dayLabel.format(noon(planDate)) }) : dayLabel.format(noon(planDate))),
          el("div", { class: "a4-plan-nav" },
            el("div", { class: "a4-seg", role: "group", "aria-label": tx("表示") }, modeButton("day", tx("日")), modeButton("week", tx("週")), modeButton("month", tx("月"))),
            planDate === today ? null : button(tx("今日へ"), () => { planDate = today; render(); }, "link"),
            planMode === "month" ? shift("‹", -1, tx("前の月")) : shift("‹", -1, tx("前の週")),
            planMode === "month" ? shift("›", 1, tx("次の月")) : shift("›", 1, tx("次の週")))),
        ...(planMode === "month" ? [monthGrid(list)] : planMode === "week" ? [reviewStrip(), weekGrid(list)] : [week,
        el("p", { class: "a4-lead" }, day.timed.length + day.anytime.length === 0
          ? tx("この日の予定はありません。受け箱から＋で入れるか、上の欄に書き出しましょう。")
          : open.length === 0 ? tx("この日の分はすべて終わりました。") : tx("残り {count} 件 · 目安 {time}", { count: open.length, time: minutesLabel(plannedMinutes(open)) })),
        dayTimeline(planDate)])),

      el("aside", { class: "a4-plan-side", "aria-label": tx("日付のないもの") },
        el("h2", { class: "a4-subtitle" }, tx("受け箱（{count}）", { count: all.inbox.length })),
        all.inbox.length === 0 ? el("p", { class: "a4-muted" }, tx("受け箱は空です。")) : sideList(all.inbox),
        review.length === 0 ? null : el("section", { class: "a4-group" },
          el("h2", { class: "a4-subtitle" }, tx("日付を見直す（{count}）", { count: review.length })),
          el("p", { class: "a4-muted" }, tx("予定日を過ぎたものです。＋で今日に入れるか、タイトルから日付を変えます。")),
          sideList(review))));
  }

  /** Three numbers for this week (Spine's review): finished, planned time, moved later. */
  function reviewStrip(): HTMLElement {
    const items = weekOf(planDate).flatMap(date => { const day = dayPlan(displayQuests(), date); return [...day.anytime, ...day.timed]; });
    const stat = (label: string, value: string) => el("div", { class: "a4-review-stat" }, el("dt", {}, label), el("dd", {}, value));
    return el("section", { class: "a4-review", "aria-labelledby": "a4-review-title" },
      el("h2", { class: "a4-subtitle", id: "a4-review-title" }, tx("今週のふりかえり")),
      el("dl", {}, stat(tx("タスク"), tx("{count}件", { count: items.length })), stat(tx("予定した時間"), minutesLabel(plannedMinutes(items))), stat(tx("終えた"), tx("{count}件", { count: items.filter(isDone).length }))));
  }

  /** Dailies with the last two weeks as dots, filled on done days. */
  function habitSection(): HTMLElement | null {
    const today = port.today();
    const habits = quests().filter(q => q.kind === "daily" && isOpen(q) && q.assignee.type === "self");
    if (habits.length === 0) return null;
    return el("section", { class: "a4-group" },
      el("h2", { class: "a4-subtitle" }, tx("習慣（{count}）", { count: habits.length })),
      el("p", { class: "a4-muted" }, tx("この2週間。埋まった点が、できた日です。")),
      el("ul", { class: "a4-list a4-habits" }, ...habits.map(q => {
        const days = habitDays(q, today);
        return el("li", { class: "a4-row a4-habit" }, el("div", { class: "a4-row-main" }, iconCircle(q, "sm"), el("div", { class: "a4-row-text" }, titleButton(q)),
          el("span", { class: "a4-habit-dots", role: "img", "data-tone": "self", "data-hue": hue(q), "aria-label": tx("この2週間で {count} 日", { count: days.filter(Boolean).length }) },
            ...days.map(done => el("i", { "data-done": String(done) })))));
      })));
  }

  function allView(): HTMLElement {
    const all = groups(quests(), port.today());
    const section = (bucket: Bucket, title: string, hint = "") => {
      if (!all[bucket].length) return null;
      const label = tx("{title}（{count}）", { title, count: all[bucket].length });
      const list = el("ul", { class: "a4-list" }, ...all[bucket].map(q => row(q, bucket)));
      if (["review", "later", "agent"].includes(bucket)) {
        const key = "group:" + bucket;
        const fold = el("details", { class: "a4-group-fold", open: openFolds.has(key) }, el("summary", {}, label), hint ? el("p", { class: "a4-muted" }, hint) : null, list);
        fold.addEventListener("toggle", () => { if (fold.open) openFolds.add(key); else openFolds.delete(key); });
        return fold;
      }
      return el("section", { class: "a4-group" }, el("h2", { class: "a4-subtitle" }, label), hint ? el("p", { class: "a4-muted" }, hint) : null, list);
    };
    const empty = Object.values(all).every(list => list.length === 0);
    // Search covers finished and put-away tasks too, so nothing is lost; typing repaints only the results.
    const results = el("div", { "aria-live": "polite" });
    const sections = el("div", {});
    const paintSearch = () => {
      const words = search.trim().toLowerCase();
      sections.hidden = words !== "";
      if (!words) { replaceChildren(results); return; }
      const found = quests().filter(q => q.kind !== "reward" && `${q.title} ${q.notes ?? ""} ${q.nextAction ?? ""}`.toLowerCase().includes(words)).slice(0, 50);
      replaceChildren(results, found.length === 0 ? el("p", { class: "a4-muted" }, tx("見つかりませんでした。")) : el("ul", { class: "a4-list" }, ...found.map(q => {
        const away = q.lifecycleState === "archived" || isDone(q);
        const state = q.lifecycleState === "archived" ? tx("しまったもの") : isDone(q) ? tx("完了") : "";
        return el("li", { class: "a4-row" }, el("div", { class: "a4-row-main" },
          el("div", { class: "a4-row-text" }, titleButton(q), el("span", { class: "a4-meta" }, [state, meta(q)].filter(Boolean).join(" · "))),
          away ? button(tx("戻す"), () => update(q, { lifecycleState: "active" }, tx("やることに戻しました"), { lifecycleState: q.lifecycleState }), "link") : null));
      })));
    };
    const field = el("input", { class: "a4-input", type: "search", value: search, placeholder: tx("やることを探す"), "aria-label": tx("やることを探す") });
    field.addEventListener("input", () => { search = field.value; paintSearch(); });
    replaceChildren(sections,
      empty ? el("p", { class: "a4-lead" }, tx("やることはありません。")) : null,
      section("decision", tx("あなたの判断待ち"), tx("Agentや他の人からの確認依頼です。「確認する」から内容を見て判断します。")),
      section("today", tx("今日")),
      habitSection(),
      section("review", tx("日付を見直す")),
      section("inbox", tx("受け箱"), tx("日付のないものです。今日やるものだけ選べば十分です。")),
      section("later", tx("これから")),
      section("agent", tx("Agentが担当")));
    paintSearch();
    const head = el("div", { class: "a4-plan-head" }, el("h1", { class: "a4-title", tabindex: -1 }, tx("タスク")),
      runtime ? modeSwitch([["list", tx("まとめ")], ["table", tx("表・ボード・ガント")], ["notes", tx("メモ")]], allMode, mode => { allMode = mode; }) : null);
    if (allMode !== "list" && runtime) {
      return el("section", { class: "a4-view a4-wide" }, head,
        embed(allMode === "table" ? forge!.render("list") : workUi.screen("notes").main));
    }
    return el("section", { class: "a4-view" }, head, el("div", { class: "a4-search" }, field), results, sections);
  }

  /** A small pill group that switches views inside one tab. */
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
    const source = request?.sourceQuestId ? byId(request.sourceQuestId) : null;
    const link = artifactLink(request?.artifactUrl || quest.handoff?.artifactUrl, quest);
    const detail = (label: string, value: string | undefined) => value ? el("p", { class: "a4-step" }, el("span", { class: "a4-step-label" }, label), value) : null;
    const relay = !request ? port.relay?.get(quest.id) ?? null : null;
    const leg = relay?.legs[relay.at];
    const nextLeg = relay?.legs[relay.at + 1];
    const nextName = nextLeg ? port.agents().find(agent => agent.id === nextLeg.agentId)?.name ?? "Agent" : "";
    const details = [request?.checkTarget ? el("p", { class: "a4-step" }, request.checkTarget) : null, detail(tx("理由"), request?.reason), detail(tx("完了の条件"), quest.completionCriteria), detail(tx("報告"), request ? undefined : quest.handoff?.note)].filter(Boolean) as HTMLElement[];
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
    return el("div", { class: "a4-focus a4-decision" },
      el("p", { class: "a4-eyebrow" }, request ? tx("{name} からの確認依頼", { name: quest.requester?.label || "Agent" }) : leg?.ask ? tx("{name} が「{ask}」を終えました", { name: quest.assignee.label || "Agent", ask: leg.ask }) : tx("{name} が「終わった」と報告しています", { name: quest.assignee.label || "Agent" }),
        total > 1 ? el("span", { class: "a4-meta" }, `  ${index + 1} / ${total}`) : null),
      el("h2", { class: "a4-focus-title" }, quest.title),
      gallery.element,
      details.length > 0 ? el("details", { class: "a4-more" }, el("summary", {}, tx("詳しく")), el("div", { class: "a4-more-body" }, ...details)) : null,
      el("div", { class: "a4-actions" },
        source ? button(tx("元のタスクを見る"), () => openSheet(source), "link") : null,
        link),
      request ? (() => { let editor = reviewImageEditors.get(quest.id); if (!editor) { editor = questImageEditor(port.images, quest, "response"); reviewImageEditors.set(quest.id, editor); } return editor.element; })() : null,
      el("label", { class: "a4-option" }, check, tx("中身を確認しました")),
      revising ? el("div", { class: "a4-field-row" }, el("span", { class: "a4-step-label" }, request ? tx("直してほしいこと") : tx("やり直してほしいこと")), reply) : null,
      el("div", { class: "a4-actions" },
        revising ? send : ok,
        revising ? button(tx("やめる"), () => { reviseFor = null; render(); }, "link") : button(tx("直してほしい"), () => { reviseFor = quest.id; render(); main.querySelector<HTMLElement>(".a4-decision textarea")?.focus(); }),
        request && !revising ? button(tx("あとで"), () => answer(quest, "defer"), "link") : null,
        total > 1 && !revising ? button(tx("次の判断へ"), next, "link") : null));
  }

  /* ------------------------------ guild: people, activity, registration ------------------------------ */

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
    const agentName = quest?.assignee.type === "agent" ? quest.assignee.label || "Agent" : "Agent";
    const who = event.source === "mcp" ? agentName : tx("あなた");
    const assignee = (event.details.assignee as { label?: string } | undefined)?.label;
    const to = String(event.details.to ?? "");
    const vars = { who, title, name: assignee || "Agent", state: AGENT_STATE[to as keyof typeof AGENT_STATE] ?? to };
    const line = event.type === "quest.created" ? tx("{who} が「{title}」を作りました", vars)
      : event.type === "quest.assignment.ready" ? tx("{who} が「{title}」を {name} に渡しました", vars)
      : event.type === "quest.handoff.transitioned" ? tx("{who} が「{title}」を「{state}」にしました", vars)
      : event.type === "quest.scored" ? tx("{who} が「{title}」を完了しました", vars)
      : event.type === "quest.reopened" ? tx("{who} が「{title}」を戻しました", vars)
      : event.type === "quest.archived" ? tx("{who} が「{title}」をしまいました", vars)
      : tx("{who} が「{title}」を更新しました", vars);
    return el("li", { class: "a4-activity" },
      el("span", { class: "a4-activity-time" }, timeLabel(event.at)),
      el("span", { class: "a4-avatar a4-avatar-sm", "data-kind": event.source === "mcp" ? "agent" : "self", "aria-hidden": "true" }, who.slice(0, 1)),
      el("span", {}, line));
  }

  /** A person or Agent and what they are on right now. */
  /** Load as one stacked bar: open tasks by state, scaled against the busiest member so loads compare at a glance. */
  function loadBar(load: readonly Quest[], scale: number): HTMLElement | null {
    if (load.length === 0) return null;
    const all = port.quests();
    const state = (quest: Quest): string => needsDecision(quest) ? "review_required"
      : quest.assignee.handoffState === "none" && blockers(quest, all).length > 0 ? "waiting" : quest.assignee.handoffState;
    const parts = ["working", "review_required", "blocked", "waiting", "ready", "accepted", "none"]
      .map(key => ({ key, count: load.filter(q => state(q) === key).length })).filter(part => part.count > 0);
    const label = (key: string) => key === "none" ? tx("これから") : key === "waiting" ? tx("前の作業待ち") : AGENT_STATE[key] ?? key;
    const summary = [tx("{count} 件を担当", { count: load.length }), ...parts.map(part => `${label(part.key)} ${part.count}`)].join(" · ");
    return el("div", { class: "a4-load" },
      el("div", { class: "a4-load-track", role: "img", "aria-label": summary },
        el("div", { class: "a4-load-bar", style: `width: ${Math.max(6, (load.length / scale) * 100)}%` },
          ...parts.map(part => el("i", { "data-state": part.key, style: `flex-grow: ${part.count}` })))),
      el("span", { class: "a4-meta", "aria-hidden": "true" }, summary));
  }

  function memberRow(kind: "self" | "human" | "agent", name: string, sub: string, doing: readonly Quest[], load: HTMLElement | null, inactive = false, agentId = ""): HTMLElement {
    const shown = doing.slice(0, 3);
    const confirming = agentId !== "" && removingAgent === agentId;
    const remove = agentId === "" ? null : confirming ? null : button(tx("外す"), () => { removingAgent = agentId; render(); }, "link");
    return el("li", { class: "a4-row a4-member", "data-inactive": String(inactive) },
      el("div", { class: "a4-row-main" },
        el("span", { class: "a4-avatar", "data-kind": kind, "aria-hidden": "true" }, name.slice(0, 1)),
        el("div", { class: "a4-row-text" }, el("strong", {}, name), sub ? el("span", { class: "a4-meta" }, sub) : null), remove),
      confirming ? el("div", { class: "a4-conn-edit", role: "group", "aria-label": tx("{name}を外す", { name }) },
        el("p", { class: "a4-muted" }, tx("{name} をギルドから外します。", { name }) + (doing.length > 0 ? tx("担当中の {count} 件はそのまま残るので、必要なら担当を変えてください。", { count: doing.length }) : "") + tx("外した Agent は担当に選べなくなり、MCP の紐付けも使えなくなります。")),
        el("div", { class: "a4-actions" },
          button(tx("外す"), () => {
            void run(async () => { await port.removeAgent(agentId); removingAgent = null; say(tx("{name} を外しました", { name })); }, tx("外せませんでした。もう一度試してください。"));
          }, "primary"),
          button(tx("やめる"), () => { removingAgent = null; render(); }, "link"))) : null,
      el("div", { class: "a4-doing" }, load,
        shown.length === 0 ? el("span", { class: "a4-meta" }, inactive ? tx("停止中") : kind === "human" ? tx("担当しているタスクはありません") : tx("いまは手が空いています"))
          : el("ul", { class: "a4-doing-list" }, ...shown.map(quest => el("li", {},
            el("span", { class: "a4-state", "data-state": kind === "agent" ? quest.assignee.handoffState : "working" },
              kind === "agent" ? AGENT_STATE[quest.assignee.handoffState] ?? quest.assignee.handoffState : tx("いまやっている")),
            titleButton(quest)))),
        doing.length > shown.length ? el("span", { class: "a4-meta" }, tx("ほか {count} 件", { count: doing.length - shown.length })) : null));
  }

  const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

  /** Register an Agent with plain choices; the raw scopes stay in Relay Forge. */
  function openAgentForm(): void {
    sheet?.close();
    const name = el("input", { class: "a4-sheet-title", required: true, maxlength: 60, placeholder: tx("Agent の名前（例：Scribe）"), "aria-label": tx("Agent の名前") });
    const id = el("input", { class: "a4-input", required: true, maxlength: 80, pattern: "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?", placeholder: tx("例：scribe"), "aria-label": "Agent ID", autocapitalize: "off", spellcheck: false });
    const role = el("input", { class: "a4-input", maxlength: 80, placeholder: tx("例：文書をまとめる"), "aria-label": tx("何をする Agent か") });
    const instructions = el("textarea", { class: "a4-input a4-textarea", rows: 3, maxlength: 2000, placeholder: tx("例：下書きは箇条書きで。数字は必ず出典を書く。"), "aria-label": tx("お願いしておくこと") });
    let idTouched = false;
    name.addEventListener("input", () => { if (!idTouched) id.value = slug(name.value); });
    id.addEventListener("input", () => { idTouched = true; });
    const power = (value: string, label: string, hint: string, checked: boolean) =>
      el("label", { class: "a4-option a4-choice" }, el("input", { type: "radio", name: "a4-agent-power", value, checked }), el("span", {}, el("strong", {}, label), el("small", { class: "a4-muted" }, hint)));
    const review = el("input", { type: "checkbox", checked: true });
    const error = el("p", { class: "a4-error", role: "alert", hidden: true });
    const field = (label: string, control: HTMLElement, hint = "") => el("label", { class: "a4-field-row" }, el("span", { class: "a4-step-label" }, label), control, hint ? el("small", { class: "a4-muted" }, hint) : null);
    const form = el("form", { class: "a4-sheet-form", id: "a4-agent-form", novalidate: true },
      name,
      field(tx("何をする Agent ？"), role),
      field("Agent ID", id, tx("英小文字・数字・ハイフン。MCP で Agent を指すときに使います。あとから変えられません。")),
      el("fieldset", { class: "a4-field" }, el("legend", { class: "a4-step-label" }, tx("やってよいこと")),
        power("read", tx("見るだけ"), tx("タスクを読むだけで、変えません"), false),
        power("write", tx("タスクを進める"), tx("タスクを読み、状態や中身を書き換えます"), true)),
      el("label", { class: "a4-option" }, review, tx("終わったら、あなたの確認を待つ")),
      field(tx("お願いしておくこと（任意）"), instructions),
      error);
    const close = el("button", { type: "button", class: "a4-button" }, tx("閉じる"));
    const dialog = el("dialog", { class: "a4-sheet", "aria-labelledby": "a4-agent-title" },
      el("div", { class: "a4-sheet-head" }, el("h2", { id: "a4-agent-title", class: "a4-eyebrow" }, tx("Agent を登録")), close),
      form,
      el("div", { class: "a4-actions a4-sheet-foot" }, el("button", { type: "submit", class: "a4-button a4-primary", form: "a4-agent-form" }, tx("登録する"))));
    close.addEventListener("click", () => dialog.close());
    const fail = (message: string, focus: HTMLElement) => { error.textContent = message; error.hidden = false; focus.focus(); };
    form.addEventListener("submit", event => {
      event.preventDefault();
      const agentId = id.value.trim().toLowerCase();
      if (!name.value.trim()) return fail(tx("名前を入れてください。"), name);
      if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(agentId)) return fail(tx("Agent ID は英小文字・数字・ハイフンで入れてください。"), id);
      if (port.agents().some(agent => agent.id === agentId)) return fail(tx("この Agent ID はもう使われています。"), id);
      const write = form.querySelector<HTMLInputElement>('input[name="a4-agent-power"]:checked')?.value === "write";
      error.hidden = true;
      void run(async () => {
        const agent = await port.registerAgent({
          agentId, displayName: name.value.trim(), role: role.value.trim(), instructions: instructions.value.trim(),
          allowedScopes: write ? ["quests:read", "quests:write"] : ["quests:read"], reviewRequired: review.checked,
        });
        dialog.close();
        say(tx("{name} を登録しました。担当のリレーで選べます。", { name: agent.name }));
      }, tx("登録できませんでした。もう一度試してください。"));
    });
    dialog.addEventListener("close", () => { dialog.remove(); if (sheet === dialog) sheet = null; });
    sheet = dialog;
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

  function notifySection(): HTMLElement {
    if (notify === null && !notifyLoading && !notifyError) loadNotify();
    const head = el("h2", { class: "a4-subtitle" }, tx("通知"));
    if (notify === null) {
      return el("section", { class: "a4-group" }, head, notifyError
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
      ? el("p", { class: "a4-muted" }, tx("このブラウザは通知に対応していません。iPhone と iPad では、共有メニューの「ホーム画面に追加」から開くと使えます。"))
      : support === "denied"
        ? el("p", { class: "a4-muted" }, tx("このサイトの通知がブラウザでブロックされています。サイトの設定で通知を許可してください。"))
        : state.device
          ? el("div", { class: "a4-actions" }, el("span", { class: "a4-meta" }, tx("この端末で受け取っています")),
            button(tx("テスト通知を送る"), () => { void run(async () => { const sent = await port.notifications.test(); say(sent > 0 ? tx("テスト通知を送りました") : tx("届けられる端末がありませんでした。もう一度オンにしてください。")); }, tx("テスト通知を送れませんでした。")); }, "link"),
            button(tx("この端末では止める"), () => { void run(async () => { await port.notifications.disable(); state.device = false; say(tx("この端末の通知を止めました")); }, tx("通知を止められませんでした。")); }, "link"))
          : el("div", { class: "a4-actions" }, button(tx("この端末で通知を受け取る"), () => { void enable(); }, "primary"));
    const check = (key: "atStart" | "review" | "proposal" | "report", text: string) => {
      const input = el("input", { type: "checkbox", checked: state.settings[key] });
      input.addEventListener("change", () => save({ [key]: input.checked }));
      return el("label", { class: "a4-option" }, input, text);
    };
    const before = el("select", { class: "a4-input", "aria-label": tx("始まる前のリマインド") },
      ...[0, 5, 10, 15, 30, 60].map(minutes => el("option", { value: String(minutes), selected: state.settings.before === minutes }, minutes ? tx("{n}分前", { n: minutes }) : tx("知らせない"))));
    before.addEventListener("change", () => save({ before: Number(before.value) }));
    const summaryOn = el("input", { type: "checkbox", checked: state.settings.summary !== "" });
    const summaryAt = el("input", { type: "time", class: "a4-input", value: state.settings.summary || "08:00", disabled: state.settings.summary === "", "aria-label": tx("朝のまとめの時刻") });
    summaryOn.addEventListener("change", () => { summaryAt.disabled = !summaryOn.checked; save({ summary: summaryOn.checked ? summaryAt.value || "08:00" : "" }); });
    summaryAt.addEventListener("change", () => { if (summaryAt.value) save({ summary: summaryAt.value }); });
    return el("section", { class: "a4-group" }, head,
      el("p", { class: "a4-muted" }, tx("アプリを閉じていても、この端末に届きます。")), device,
      el("h3", { class: "a4-step-label" }, tx("タスク")),
      el("label", { class: "a4-field-row" }, el("span", { class: "a4-meta" }, tx("始まる前")), before),
      check("atStart", tx("始まる時刻ちょうどに知らせる")),
      el("div", { class: "a4-field-row" }, el("label", { class: "a4-option" }, summaryOn, tx("朝のまとめ")), summaryAt),
      el("h3", { class: "a4-step-label" }, tx("Agent")),
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

  function mcpSection(): HTMLElement {
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
      const head = el("div", { class: "a4-row-main" },
        el("span", { class: "a4-avatar", "data-kind": "agent", "aria-hidden": "true" }, connection.clientName.slice(0, 1)),
        el("div", { class: "a4-row-text" }, el("strong", {}, connection.clientName),
          el("span", { class: "a4-meta" }, [connection.authorized ? tx("接続中") : tx("接続が切れています"), connection.lastUsedAt ? tx("最後に使ったのは {time}", { time: timeLabel(connection.lastUsedAt) }) : ""].filter(Boolean).join(" · "))),
        editing ? null : button(connection.agentIds.length ? tx("変える") : tx("Agent を紐付ける"), () => { linkDrafts.set(connection.clientId, [...connection.agentIds]); render(); }));
      const linked = el("p", { class: "a4-muted a4-conn-line" }, connection.agentIds.length
        ? tx("この接続は {names} として動きます。", { names: connection.agentIds.map(nameOf).join(tx("・")) })
        : tx("まだ Agent に紐付いていません。紐付けると、この接続での作業がその Agent の担当として記録されます。"));
      if (!editing) return el("li", { class: "a4-row" }, head, linked);
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
      return el("li", { class: "a4-row" }, head,
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
    return el("section", { class: "a4-group" },
      el("h2", { class: "a4-subtitle" }, tx("MCP 接続")),
      el("p", { class: "a4-muted" }, tx("Claude や Codex などの MCP クライアントにこの URL を追加してサインインすると、下に接続が表示されます。")),
      el("div", { class: "a4-step-form" }, url, copy),
      connectionsLoading && connections === null ? el("p", { class: "a4-muted" }, tx("接続を読み込んでいます…"))
        : connectionsError ? el("p", { class: "a4-muted" }, tx("接続を読み込めませんでした。"), button(tx("もう一度"), loadConnections, "link"))
        : (connections ?? []).length === 0 ? el("p", { class: "a4-muted" }, tx("まだ接続はありません。"))
        : el("ul", { class: "a4-list" }, ...(connections ?? []).map(card)));
  }

  function guildView(): HTMLElement {
    const list = quests().filter(needsDecision).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const index = Math.max(0, list.findIndex(q => q.id === decisionId));
    const current = list[index] ?? null;
    const agentWork = quests().filter(q => isOpen(q) && q.assignee.type === "agent");
    const byAgent = (id: string) => (["review_required", ...AGENT_STATE_ORDER] as const).flatMap(state => agentWork.filter(q => q.assignee.id === id && q.assignee.handoffState === state));
    if (activity === null && !activityLoading && !activityError) loadActivity();
    const later = quests().filter(q => q.humanRequest?.status === "deferred" && isOpen(q));
    const agents = port.agents();
    const others = port.members().filter(member => member.id !== port.self().id);
    const loads = {
      self: quests().filter(q => isOpen(q) && q.assignee.type === "self"),
      human: (id: string) => quests().filter(q => isOpen(q) && q.assignee.type === "human" && q.assignee.id === id),
      agent: (id: string) => agentWork.filter(q => q.assignee.id === id),
    };
    const scale = Math.max(1, loads.self.length, ...others.map(m => loads.human(m.id).length), ...agents.map(a => loads.agent(a.id).length));
    return el("section", { class: "a4-view" },
      el("h1", { class: "a4-title", tabindex: -1 }, tx("ギルド")),
      el("p", { class: "a4-lead" }, tx("Agentや仲間と一緒に進めるための場所です。あなたが決めることだけ、ここに集まります。")),
      el("section", { class: "a4-group" },
        el("h2", { class: "a4-subtitle" }, tx("あなたの判断待ち（{count}）", { count: list.length })),
        current ? decisionCard(current, index, list.length, () => { reviseFor = null; go("guild", list[(index + 1) % list.length]!.id); })
          : el("p", { class: "a4-muted" }, tx("いま、あなたの判断を待っているものはありません。"))),
      later.length === 0 ? null : el("section", { class: "a4-group" },
        el("h2", { class: "a4-subtitle" }, tx("あとで見る（{count}）", { count: later.length })),
        el("ul", { class: "a4-list" }, ...later.map(q => el("li", { class: "a4-row" }, el("div", { class: "a4-row-main" }, rowText(q), button(tx("判断待ちに戻す"), () => answer(q, "resume"), "link")))))),
      el("section", { class: "a4-group" },
        el("div", { class: "a4-group-head" }, el("h2", { class: "a4-subtitle" }, tx("人と Agent")), button(tx("＋ Agent を登録"), openAgentForm)),
        el("ul", { class: "a4-list" },
          memberRow("self", tx("{name}（あなた）", { name: port.self().label }), "", quests().filter(q => q.assignee.type === "self" && isWorking(q)), loadBar(loads.self, scale)),
          ...others.map(member => memberRow("human", member.name, member.owner ? tx("オーナー") : tx("メンバー"), loads.human(member.id), loadBar(loads.human(member.id), scale))),
          ...agents.map(agent => memberRow("agent", agent.name, agent.role ? `Agent · ${agent.role}` : "Agent", byAgent(agent.id), loadBar(loads.agent(agent.id), scale), !agent.active, agent.id)))),
      el("section", { class: "a4-group" },
        el("h2", { class: "a4-subtitle" }, tx("最近の活動")),
        activity === null ? el("p", { class: "a4-muted" }, activityError ? tx("活動を読み込めませんでした。") : tx("読み込んでいます…"), activityError ? button(tx("もう一度"), loadActivity, "link") : null)
          : activity.length === 0 ? el("p", { class: "a4-muted" }, tx("まだ活動はありません。"))
          : el("ul", { class: "a4-activity-list" }, ...activity.slice(0, 10).map(activityLine))),
      extraLinks(EXTRAS.filter(item => ["network", "battle", "skills"].includes(item.id))));
  }

  /** Same fields and limits as Relay Forge's profile form; the server re-validates. */
  function profileView(back: HTMLElement): HTMLElement {
    const current = profile ?? runtime!.profile ?? {};
    const name = el("input", { class: "a4-input", value: current.displayName ?? "", maxlength: 60, autocomplete: "nickname" });
    const handle = el("input", { class: "a4-input", value: current.handle ?? "", maxlength: 21, autocomplete: "username", spellcheck: "false" });
    const bio = el("textarea", { class: "a4-input a4-textarea", maxlength: 160 }, current.bio ?? "");
    const form = el("form", { class: "a4-form" },
      el("label", { class: "a4-field-row" }, el("span", { class: "a4-meta" }, tx("表示名")), name),
      el("label", { class: "a4-field-row" }, el("span", { class: "a4-meta" }, tx("ユーザー名")), handle,
        el("span", { class: "a4-muted" }, tx("英小文字・数字・_ で 3〜20 文字。ほかの人があなたを探すときに使います。"))),
      el("label", { class: "a4-field-row" }, el("span", { class: "a4-meta" }, tx("ひとこと")), bio),
      el("div", { class: "a4-actions" }, el("button", { type: "submit", class: "a4-button a4-primary" }, tx("保存"))));
    form.addEventListener("submit", event => {
      event.preventDefault();
      const input = { displayName: name.value.trim(), handle: handle.value.trim().replace(/^@+/, "").toLowerCase(), bio: bio.value.trim() };
      if (input.displayName.length < 1) { say(tx("表示名を入れてください。")); name.focus(); return; }
      if (!/^[a-z0-9_]{3,20}$/.test(input.handle)) { say(tx("ユーザー名は英小文字・数字・_ で 3〜20 文字にしてください。")); handle.focus(); return; }
      void run(async () => {
        const response = await runtime!.profilePort.updateProfile(input) as { profile?: typeof profile };
        profile = response.profile ?? { ...current, ...input };
        say(tx("プロフィールを保存しました"));
      }, tx("保存できませんでした。ユーザー名がほかの人と重なっていないか確かめてください。"));
    });
    return el("section", { class: "a4-view a4-extra" }, back,
      el("h1", { class: "a4-title", tabindex: -1 }, tx("プロフィール")), form);
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
    if (id === "billing") {
      return el("section", { class: "a4-view a4-extra" }, back,
        el("h1", { class: "a4-title", tabindex: -1 }, tx("プラン")), billingUi.render(), analyticsUi.render());
    }
    const screen = forge!.render(id as ForgeScreen);
    // Relay Forge titles are English destination names; AFA names the screen in the reader's language.
    screen.querySelector(".rf-screen-title")?.replaceChildren(EXTRAS.find(item => item.id === id)!.label);
    return el("section", { class: "a4-view a4-extra" }, back, screen);
  }

  function extraLinks(items: readonly (typeof EXTRAS)[number][]): HTMLElement {
    return el("nav", { class: "a4-group" }, el("ul", { class: "a4-list a4-extras" }, ...items.map(item => {
      const open = el("a", { class: "a4-row-title", href: "#" + item.id }, item.label);
      open.addEventListener("click", event => { event.preventDefault(); go(item.id); });
      return el("li", { class: "a4-row" }, el("div", { class: "a4-row-main" }, el("div", { class: "a4-row-text" }, open, el("span", { class: "a4-meta" }, item.hint))));
    })));
  }

  function settingsView(): HTMLElement {
    const cheerToggle = el("input", { type: "checkbox", checked: cheer });
    cheerToggle.addEventListener("change", () => { cheer = cheerToggle.checked; store.set("a4-cheer", cheer ? null : "off"); });
    const gameToggle = el("input", { type: "checkbox", checked: game });
    gameToggle.addEventListener("change", () => { game = gameToggle.checked; store.set("a4-game", game ? null : "off"); say(game ? tx("ゲーム要素を表示します") : tx("ゲーム要素を隠しました")); });
    const theme = document.documentElement.getAttribute("data-theme") ?? "system";
    const themes = el("fieldset", { class: "a4-field" }, el("legend", {}, tx("表示テーマ")),
      ...[["system", tx("端末に合わせる")], ["light", tx("ライト")], ["dark", tx("ダーク")]].map(([value, label]) => {
        const input = el("input", { type: "radio", name: "a4-theme", value, checked: theme === value });
        input.addEventListener("change", () => {
          if (value === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", value!);
          store.set("qf-relay-forge-theme", value === "system" ? null : value!);
          paintThemeColor();
        });
        return el("label", { class: "a4-option" }, input, label!);
      }));
    // Copy is resolved once at load, so a language change reloads the page.
    const language = el("select", { class: "a4-input", "aria-label": tx("言語") },
      ...SUPPORTED_LOCALES.map(code => el("option", { value: code, selected: code === LOCALE, lang: code }, LOCALE_METADATA[code].label)));
    language.addEventListener("change", () => { setLocale(language.value); location.reload(); });
    return el("section", { class: "a4-view" },
      el("h1", { class: "a4-title", tabindex: -1 }, tx("設定")),
      el("label", { class: "a4-field-row" }, el("span", { class: "a4-meta" }, tx("言語")), language),
      el("label", { class: "a4-option" }, cheerToggle, tx("完了したら紙吹雪でお祝いする")),
      el("label", { class: "a4-option" }, gameToggle, tx("ゲーム要素（レベル・XP）を表示する")),
      themes,
      el("p", { class: "a4-muted" }, tx("キーボード：N か / で書き出し、J と K で行を移動、X で完了、S で今のタスクを始める")),
      notifySection(),
      extraLinks(EXTRAS.filter(item => item.id === "connections")),
      mcpSection(),
      runtime ? el("section", { class: "a4-group" }, el("h2", { class: "a4-subtitle" }, tx("時間の記録")), embed(workUi.settings())) : null,
      extraLinks(EXTRAS.filter(item => item.id === "profile" || item.id === "billing")),
      el("p", {}, el("a", { class: "a4-link", href: RELAY_FORGE_URL }, tx("Relay Forge（詳しい画面）を開く"))),
      port.signOut ? button(tx("サインアウト"), () => { void port.signOut?.(); }, "link") : null);
  }

  /** The running task follows the person to every other screen. */
  function dock(): HTMLElement | null {
    const running = view === "now" ? undefined : quests().find(isWorking);
    if (!running) return null;
    const open = el("button", { type: "button", class: "a4-row-title" }, running.title);
    open.addEventListener("click", () => { focusId = running.id; go("now"); });
    return el("aside", { class: "a4-dock", "aria-label": tx("作業中") }, timer(running, true),
      el("div", { class: "a4-row-text" }, el("span", { class: "a4-meta" }, tx("作業中")), open),
      button(tx("一時停止"), () => pause(running)), button(tx("完了"), () => complete(running)));
  }

  /* ------------------------------ shell ------------------------------ */

  function go(next: View, questId?: string | null): void {
    if (sheet) { closeSheet?.(() => go(next, questId)); return; }
    // An unsaved note asks before it is left behind.
    if (workUi.dirty() && next !== view) { workUi.guard(() => { workUi.clearCalendar(); leave(next, questId); }); return; }
    leave(next, questId);
  }

  function leave(next: View, questId?: string | null): void {
    if (questId && !quests().some(q => q.id === questId && needsDecision(q))) { say(tx("見つかりませんでした。")); return; }
    if (isExtra(next) && next !== view) {
      if (next === "billing") { billingUi.enter(); analyticsUi.enter(); }
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
      const waiting = item.id === "guild" ? quests().filter(needsDecision).length : 0;
      const tab = el("a", { class: "a4-tab", href: `#${item.id}`, "aria-current": view === item.id || (item.id === (["network", "battle", "skills"].includes(view) ? "guild" : "settings") && isExtra(view)) ? "page" : null, "data-view": item.id }, glyph(({ now: Sun, plan: CalendarDays, all: ListTodo, guild: Users, settings: Settings } as Record<string, IconNode>)[item.id]!), el("span", {}, item.label),
        waiting > 0 ? el("span", { class: "a4-badge", "aria-label": tx("判断待ち {count} 件", { count: waiting }) }, String(waiting)) : null);
      tab.addEventListener("click", event => { event.preventDefault(); go(item.id); });
      return tab;
    }));
    root.querySelector(".a4-app")?.setAttribute("data-busy", String(busy));
    main.setAttribute("data-view", view);
    document.title = `${[...VIEWS, ...EXTRAS].find(item => item.id === view)?.label} — Guilduo`;
    breadcrumb.textContent = [...VIEWS, ...EXTRAS].find(item => item.id === view)?.label ?? "";
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

  const tick = window.setInterval(() => { for (const node of root.querySelectorAll<HTMLElement & { a4Paint?: () => void }>(".a4-ring")) node.a4Paint?.(); paintProgress(); }, 1000);
  const onFocus = () => { if (port.refresh && !busy && pending.size === 0 && !sheet && !captureDialog && !document.querySelector(".a4-image-viewer[open]")) void port.refresh().then(() => { clearDecisionGalleries(); refreshError = false; render(); }, () => { refreshError = true; say(tx("再取得できませんでした。表示中の内容を残しています。")); render(); }); };
  const onHide = () => { if (document.visibilityState === "hidden") flushPending(); else onFocus(); };
  // Agents move work while the page sits open; pick that up unless someone is typing.
  const poll = window.setInterval(() => {
    if (document.visibilityState === "visible" && !document.activeElement?.matches("input, textarea, select")) onFocus();
  }, 60_000);
  const onHash = () => {
    const next = viewFromHash();
    const requested = next === "guild" ? new URL(location.href).searchParams.get("quest") : undefined;
    const questId = requested === null || (requested && quests().some(q => q.id === requested && needsDecision(q))) ? requested : undefined;
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

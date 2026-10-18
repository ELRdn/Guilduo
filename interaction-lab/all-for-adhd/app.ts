/**
 * All for ADHD — a calmer Guilduo surface.
 *
 * Same Quests, Agents and API as Relay Forge; only the UI differs. Each screen
 * offers one primary action, capture is a single field on every screen, time is
 * shown rather than typed, and destructive or committing actions get an undo
 * window instead of a confirmation dialog. Japanese-only while prototyping.
 */

import type { CharacterState, Quest } from "../../types/questforge.ts";
import { el, replaceChildren, svg } from "../relay-forge/primitives/dom.ts";
import { celebrate } from "./celebrate.ts";
import { addDays, AGENT_STATE, blockers, stepsOf, AGENT_STATE_ORDER, clock, dayPlan, DEFAULT_BLOCK, endOf, ESTIMATES, gaps, groups, onDay, isOpen, isWorking, minutesLabel, needsDecision, nextCandidates, plannedMinutes, toMinutes, weekOf, type Bucket } from "./model.ts";

export interface AllForAgent {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly active: boolean;
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
export interface AgentDraft { readonly agentId: string; readonly displayName: string; readonly role: string; readonly instructions: string; readonly allowedScopes: readonly string[]; readonly reviewRequired: boolean }

export interface AllForPort {
  readonly demo: boolean;
  readonly self: () => { readonly id: string; readonly label: string };
  readonly agents: () => readonly AllForAgent[];
  readonly members: () => readonly { readonly id: string; readonly name: string; readonly owner: boolean }[];
  /** Answers a review request; the server validates with a dry run before writing. */
  answer(quest: Quest, action: RequestAnswer, response: string): Promise<Quest>;
  /** Accepts an Agent's finished work, or sends it back with a note. Dry run first. */
  review(quest: Quest, accept: boolean, note: string): Promise<Quest>;
  /** Multi-Agent relays. Demo-only until the storage is decided; absent means one Agent at most. */
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
  };
  readonly today: () => string;
  readonly quests: () => readonly Quest[];
  create(input: Record<string, unknown>): Promise<Quest>;
  update(quest: Quest, patch: Record<string, unknown>): Promise<Quest>;
  complete(quest: Quest): Promise<{ quest: Quest; character: CharacterState | null }>;
  refresh?(): Promise<void>;
  readonly signOut?: () => Promise<void>;
}

type View = "now" | "plan" | "all" | "guild" | "settings";
const VIEWS: readonly { id: View; label: string }[] = [
  { id: "now", label: "今" },
  { id: "plan", label: "予定" },
  { id: "all", label: "やること" },
  { id: "guild", label: "ギルド" },
  { id: "settings", label: "設定" },
];
const UNDO_MS = 5000;
const dayLabel = new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" });
const weekdayLabel = new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: "UTC" });
const monthLabel = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", timeZone: "UTC" });
const noon = (date: string) => new Date(`${date}T12:00:00Z`);
/** Week grid scale: pixels per minute. */
const GRID_PX = 1.4;
/** Side-by-side cards per overlap in the week grid before the rest fold away. */
const MAX_LANES = 2;
const store = {
  get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string | null): void { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage is a convenience */ } },
};

export function mountAllFor(root: HTMLElement, port: AllForPort): () => void {
  // "#today" is the previous name of the plan view.
  const viewFromHash = (): View => location.hash === "#today" ? "plan" : VIEWS.find(v => location.hash === `#${v.id}`)?.id ?? "now";
  let view: View = viewFromHash();
  let focusId: string | null = null;
  const skipped = new Set<string>();
  let planDate = port.today();
  // Guild: which decision is shown, whether "please fix" is open, and what was typed.
  let decisionId: string | null = null;
  let reviseFor: string | null = null;
  const confirmed = new Set<string>();
  let activity: readonly AllForActivity[] | null = null;
  let activityLoading = false, activityError = false;
  let connections: readonly AllForConnection[] | null = null;
  let connectionsLoading = false, connectionsError = false;
  const linkDrafts = new Map<string, string[]>();
  let removingAgent: string | null = null;
  // Folded step lists stay open across rerenders.
  const openFolds = new Set<string>();
  const replies = new Map<string, string>();
  let planMode: "day" | "week" = store.get("a4-plan-mode") === "week" ? "week" : "day";
  let sheet: HTMLDialogElement | null = null;
  let repaintSheet: (() => void) | null = null;
  let stepDraftFor: string | null = null;
  let estimateFor: string | null = null;
  let afterOpen = false;
  let busy = false;
  let game = store.get("a4-game") !== "off";
  let cheer = store.get("a4-cheer") !== "off";
  // Confetti starts where the person tapped; keyboard use falls back to the focused control.
  let lastPointer = { x: 0, y: 0, at: 0 };
  const onPointer = (event: PointerEvent) => { lastPointer = { x: event.clientX, y: event.clientY, at: Date.now() }; };
  let disposed = false;
  // Completions wait out the undo window before they are sent.
  const pending = new Map<string, number>();
  let toastTimer = 0;

  const quests = () => port.quests().filter(q => !pending.has(q.id));
  const byId = (id: string | null) => (id === null ? null : port.quests().find(q => q.id === id) ?? null);

  const toast = el("div", { class: "a4-toast", role: "status", "aria-live": "polite", hidden: true });
  const main = el("main", { class: "a4-main", id: "a4-main", tabindex: -1 });
  const dockHost = el("div", { class: "a4-dock-host" });
  const nav = el("nav", { class: "a4-tabs", "aria-label": "画面" });
  const captureInput = el("input", { class: "a4-capture-input", type: "text", name: "title", placeholder: "思いついたら書く", "aria-label": "やることを書き出す", autocomplete: "off", enterkeyhint: "done", maxlength: 200 });
  const captureToday = el("button", { type: "button", class: "a4-chip", "aria-pressed": "false" }, "今日やる");
  const captureForm = el("form", { class: "a4-capture" }, captureInput, captureToday, el("button", { type: "submit", class: "a4-button" }, "追加"));
  const header = el("header", { class: "a4-top" },
    el("span", { class: "a4-brand" }, "Guilduo"),
    captureForm,
    nav,
  );
  const banner = port.demo ? el("p", { class: "a4-demo" }, "デモ（保存されません） ", el("a", { href: location.pathname }, "サインイン")) : null;
  replaceChildren(root, el("div", { class: "a4-app" }, banner, header, main, dockHost, toast));

  captureToday.addEventListener("click", () => captureToday.setAttribute("aria-pressed", String(captureToday.getAttribute("aria-pressed") !== "true")));
  captureForm.addEventListener("submit", event => {
    event.preventDefault();
    const title = captureInput.value.trim();
    if (!title || busy) return;
    const today = captureToday.getAttribute("aria-pressed") === "true";
    void run(async () => {
      await port.create({
        kind: "todo", title, notes: "", difficulty: "medium", impact: "medium", lifecycleState: "active",
        nextAction: "", estimatedMinutes: 0, dueDate: "",
        scheduledDate: today ? port.today() : "", scheduledTime: "", planningMode: "on_date", planningState: today ? "scheduled" : "backlog",
      });
      captureInput.value = "";
      say(today ? "今日のやることに追加しました" : "受け箱に追加しました");
    }, "追加できませんでした。入力は残しています。");
  });

  function say(message: string, undo?: () => void): void {
    window.clearTimeout(toastTimer);
    replaceChildren(toast, el("span", {}, message), undo ? (() => {
      const button = el("button", { type: "button", class: "a4-link" }, "元に戻す");
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
      say(message, revert ? () => { void run(async () => { await port.update(saved, revert); }, "元に戻せませんでした"); } : undefined);
    }, "保存できませんでした。もう一度試してください。");
  }

  function complete(quest: Quest): void {
    if (pending.has(quest.id)) return;
    if (focusId === quest.id) focusId = null;
    store.set(`a4-start:${quest.id}`, null);
    const timer = window.setTimeout(() => {
      pending.delete(quest.id);
      void run(async () => {
        const result = await port.complete(quest);
        if (game && result.character) say(`完了！ Lv ${result.character.level} · XP ${result.character.xp}/${result.character.nextXp}`);
      }, "完了を保存できませんでした。もう一度試してください。");
    }, UNDO_MS);
    pending.set(quest.id, timer);
    const today = port.today();
    const dayDone = onDay(quest, today) && groups(quests(), today).today.length === 0;
    if (cheer) {
      const focused = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement.getBoundingClientRect() : null;
      const origin = Date.now() - lastPointer.at < 1000 ? lastPointer
        : focused ? { x: focused.left + focused.width / 2, y: focused.top + focused.height / 2 } : { x: innerWidth / 2, y: innerHeight * 0.6 };
      celebrate(origin.x, origin.y, dayDone);
    }
    say(dayDone ? "今日の分、ぜんぶ終わりました！" : game ? "完了！ よくできました" : "完了しました", () => { window.clearTimeout(timer); pending.delete(quest.id); render(); });
    render();
  }

  function flushPending(): void {
    for (const [id, timer] of pending) {
      window.clearTimeout(timer);
      pending.delete(id);
      const quest = byId(id);
      if (quest) void port.complete(quest).catch(() => undefined);
    }
  }

  const plan = (date: string) => ({ scheduledDate: date, scheduledTime: "", planningMode: "on_date", planningState: date ? "scheduled" : "backlog" });
  const previousPlan = (q: Quest) => ({ scheduledDate: q.scheduledDate, scheduledTime: q.scheduledTime, planningMode: q.planningMode, planningState: q.planningState });

  function start(quest: Quest): void {
    store.set(`a4-start:${quest.id}`, String(Date.now()));
    focusId = quest.id;
    update(quest, { assignee: { ...quest.assignee, handoffState: "working" }, handoff: { ...quest.handoff, startedAt: quest.handoff?.startedAt || new Date().toISOString() } }, "始めました。まずは次の一歩だけ。");
  }

  function pause(quest: Quest): void {
    store.set(`a4-start:${quest.id}`, null);
    update(quest, { assignee: { ...quest.assignee, handoffState: "none" } }, "一時停止しました。続きはいつでもここから。");
  }

  /* ------------------------------ pieces ------------------------------ */

  const button = (label: string, action: () => void, kind: "primary" | "secondary" | "link" = "secondary", disabled = false) => {
    const node = el("button", { type: "button", class: kind === "primary" ? "a4-button a4-primary" : kind === "link" ? "a4-link" : "a4-button", disabled: disabled || busy });
    node.textContent = label;
    node.addEventListener("click", action);
    return node;
  };

  function estimateChips(quest: Quest): HTMLElement {
    return el("div", { class: "a4-chips", role: "group", "aria-label": "目安の時間" },
      ...ESTIMATES.map(minutes => {
        const chip = button(`${minutes}分`, () => {
          estimateFor = null;
          update(quest, { estimatedMinutes: quest.estimatedMinutes === minutes ? 0 : minutes, expectedUpdatedAt: quest.updatedAt }, `目安を${minutes}分にしました`);
        });
        chip.className = "a4-chip";
        chip.setAttribute("aria-pressed", String(quest.estimatedMinutes === minutes));
        return chip;
      }));
  }

  function stepEditor(quest: Quest): HTMLElement {
    const input = el("input", { class: "a4-input", type: "text", value: quest.nextAction, "aria-label": "次の一歩", placeholder: "例：ファイルを開くだけ", maxlength: 180 });
    const form = el("form", { class: "a4-step-form" }, input, el("button", { type: "submit", class: "a4-button", disabled: busy }, "保存"));
    form.addEventListener("submit", event => { event.preventDefault(); stepDraftFor = null; update(quest, { nextAction: input.value.trim(), expectedUpdatedAt: quest.updatedAt }, "次の一歩を保存しました"); });
    queueMicrotask(() => input.focus());
    return form;
  }

  const startedAtOf = (quest: Quest) => Number(store.get(`a4-start:${quest.id}`)) || Date.parse(quest.handoff?.startedAt ?? "") || Date.now();
  /** A running task's bar fills as time passes; the tick moves `--a4-progress`. */
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
    const node = el("div", { class: small ? "a4-ring a4-ring-sm" : "a4-ring", role: "timer", "aria-label": goal > 0 ? `経過時間。目安は${minutesLabel(quest.estimatedMinutes)}` : "経過時間" },
      svg("svg", { viewBox: "0 0 120 120", "aria-hidden": "true" }, svg("circle", { class: "a4-ring-track", cx: 60, cy: 60, r: 52 }), ring),
      el("div", { class: "a4-ring-text" }, label, small ? null : el("small", {}, goal > 0 ? `/ ${minutesLabel(quest.estimatedMinutes)}` : "経過")));
    (node as HTMLElement & { a4Paint?: () => void }).a4Paint = paint;
    return node;
  }

  function decisionNotice(): HTMLElement | null {
    const count = quests().filter(needsDecision).length;
    if (count === 0) return null;
    const link = el("a", { class: "a4-notice", href: "#guild" }, `あなたの判断待ちが ${count} 件あります`, el("span", { "aria-hidden": "true" }, " →"));
    link.addEventListener("click", event => { event.preventDefault(); go("guild"); });
    return link;
  }

  const isDone = (quest: Quest) => quest.done || pending.has(quest.id);
  const children = (quest: Quest) => port.quests().filter(q => q.parentQuestId === quest.id && q.lifecycleState !== "archived");

  // A stable colour slot per task; only palettes that define hues use it.
  const hue = (quest: Quest) => String([...quest.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % 5);

  function tone(quest: Quest): string {
    if (isDone(quest)) return "done";
    if (needsDecision(quest)) return "decision";
    if (quest.assignee.type !== "self") return "agent";
    return isWorking(quest) ? "working" : "self";
  }

  function checkButton(quest: Quest): HTMLElement {
    if (isDone(quest)) return el("span", { class: "a4-check", "data-done": "true", role: "img", "aria-label": "完了" });
    // Only the person's own tasks can be ticked off here; others show no dead control.
    if (quest.assignee.type !== "self" || needsDecision(quest)) return el("span", { class: "a4-check-space", "aria-hidden": "true" });
    const node = el("button", { type: "button", class: "a4-check", "aria-label": `${quest.title} を完了`, disabled: busy });
    node.addEventListener("click", () => complete(quest));
    return node;
  }

  function titleButton(quest: Quest): HTMLElement {
    const node = el("button", { type: "button", class: "a4-row-title", "aria-haspopup": "dialog", "data-done": String(isDone(quest)) }, quest.title);
    node.addEventListener("click", () => openSheet(quest));
    return node;
  }

  function meta(quest: Quest, withTime = true): string {
    const steps = children(quest);
    const parts = [withTime ? quest.scheduledTime : "", quest.estimatedMinutes > 0 ? `目安 ${minutesLabel(quest.estimatedMinutes)}` : "",
      steps.length > 0 ? `ステップ ${steps.filter(isDone).length}/${steps.length}` : "",
      quest.dueDate ? `締切 ${Number(quest.dueDate.slice(5, 7))}/${Number(quest.dueDate.slice(8))}` : ""];
    if (quest.assignee.type !== "self") parts.push(`担当 ${quest.assignee.label || "Agent"}`);
    return parts.filter(Boolean).join(" · ");
  }

  function rowText(quest: Quest, withTime = true): HTMLElement {
    const info = meta(quest, withTime);
    return el("div", { class: "a4-row-text" }, titleButton(quest), info ? el("span", { class: "a4-meta" }, info) : null);
  }

  function row(quest: Quest, bucket: Bucket): HTMLElement {
    const quick = bucket === "inbox" || bucket === "review" || bucket === "later"
      ? button("今日やる", () => update(quest, { ...plan(port.today()), expectedUpdatedAt: quest.updatedAt }, "今日に入れました", previousPlan(quest)), "link")
      : bucket === "decision" ? button("確認する", () => { decisionId = quest.id; go("guild"); }, "link") : null;
    const steps = openSteps(quest);
    const next = steps.find(step => blockers(step, port.quests()).length === 0);
    return el("li", { class: "a4-row", "data-bucket": bucket }, el("div", { class: "a4-row-main" }, checkButton(quest), rowText(quest), quick),
      steps.length === 0 ? null : (() => {
        const fold = el("details", { class: "a4-row-steps", open: openFolds.has(quest.id) },
          el("summary", {}, `ステップ（残り ${steps.length}）${next ? `· 次は「${shortTitle(next.title)}」` : ""}`),
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
    return el("ul", { class: "a4-steps", "aria-label": "小さなステップ" },
      ...[...open, ...done].map(step => {
        const waits = isDone(step) ? [] : blockers(step, port.quests());
        return el("li", { "data-waiting": String(waits.length > 0) }, checkButton(step), titleButton(step),
          step === next ? el("span", { class: "a4-step-tag", "data-kind": "next" }, "次はこれ")
            : waits.length > 0 ? el("span", { class: "a4-step-tag" }, `待ち（${waits.slice(0, 2).map(item => shortTitle(item.title)).join("・")}${waits.length > 2 ? ` ほか${waits.length - 2}件` : ""} のあと）`) : null);
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
    const initial: RelayLeg[] = stored ? [...stored.legs] : quest.assignee.type === "agent" ? [{ agentId: quest.assignee.id, ask: "", check: true }] : [];
    let legs = initial.map(leg => ({ ...leg }));
    let palette = false;
    let suppressClickUntil = 0;
    const list = el("ol", { class: "a4-relay", "aria-label": "担当のリレー" });
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
      const badge = !started || index > at ? status("これから", "none") : index < at ? status("済み", "accepted") : status(AGENT_STATE[state] ?? state, state);
      const ask = multi && !locked ? el("input", { class: "a4-relay-ask", value: leg.ask, maxlength: 60, placeholder: "頼みごと（例：下書き）", "aria-label": `${name}への頼みごと` }) : null;
      ask?.addEventListener("input", () => { legs[index] = { ...legs[index]!, ask: ask.value }; paintHint(); });
      const remove = locked ? null : el("button", { type: "button", class: "a4-relay-x", "aria-label": `${name}を外す` }, "×");
      remove?.addEventListener("click", () => { legs.splice(index, 1); paint(); });
      const node = el("li", { class: "a4-relay-node", "data-kind": "agent", "data-index": String(index), "data-status": !started || index > at ? "next" : index < at ? "done" : "now",
        "data-draggable": String(multi && !locked), "aria-label": `${index + 1}番目 ${name}${leg.ask ? `：${leg.ask}` : ""}` },
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
      if (!editable || after < at) return el("li", { class: "a4-relay-link" }, el("span", { class: "a4-meta" }, leg.check ? "あなたが確認してから次へ" : "そのまま次へ"));
      const toggle = el("button", { type: "button", class: "a4-relay-check", "aria-pressed": String(leg.check) }, leg.check ? "確認を挟む" : "そのまま次へ");
      toggle.addEventListener("click", () => { legs[after] = { ...legs[after]!, check: !legs[after]!.check }; paint(); });
      return el("li", { class: "a4-relay-link" }, toggle);
    }
    function paintHint(): void {
      const { started } = position();
      const first = legs[0];
      hint.textContent = !changed() ? (legs.length === 0 && editable ? (multi ? "Agentを足すと、順番にバトンを渡します。最後はあなたが確認します。" : "Agentを足すと、そのAgentに渡します。終わったらあなたが確認します。") : "")
        : legs.length === 0 ? "保存すると自分の担当に戻します。"
        : !started || (!multi && first?.agentId !== quest.assignee.id) ? `保存すると ${nameOf(first!.agentId)} に渡します。${legs.length > 1 ? `終わったら ${legs.slice(1).map(leg => nameOf(leg.agentId)).join(" → ")} へ回り、` : "終わったら、"}最後にあなたが確認します。`
        : "保存すると、このあとの順番を変えます。";
    }
    function paint(): void {
      const { started, at, state } = position();
      const items: HTMLElement[] = [selfNode(`${port.self().label}（あなた）`, null)];
      legs.forEach((leg, index) => {
        items.push(index === 0 ? link(null, at, "渡す") : link(index - 1, at));
        items.push(legNode(leg, index, started, at, state));
      });
      const last = started && at === legs.length - 1;
      items.push(link(null, at, legs.length > 0 ? "終わったら" : ""));
      items.push(selfNode(legs.length > 0 ? "あなたが最後の確認" : "あなたが進める",
        last && state === "review_required" ? status("あなたの番", "review_required") : last && state === "accepted" ? status("完了", "accepted") : null, true));
      const add = editable && legs.length < max ? (() => {
        const button = el("button", { type: "button", class: "a4-relay-add", "aria-expanded": String(palette) }, "＋ Agent を足す");
        button.addEventListener("click", () => { palette = !palette; paint(); list.querySelector<HTMLElement>(".a4-relay-palette button")?.focus(); });
        return button;
      })() : null;
      const chips = palette && add ? el("li", { class: "a4-relay-palette", role: "group", "aria-label": "足すAgent" }, ...(agents.length === 0
        ? [el("span", { class: "a4-muted" }, "使えるAgentがいません。登録は詳しい画面で行います。")]
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
    sheet?.close();
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
    const title = line({ class: "a4-sheet-title", name: "title", required: true, maxlength: 200, "aria-label": "やること" }, quest.title);
    const step = line({ class: "a4-sheet-next", name: "nextAction", placeholder: "次の一歩：最初の1分でできること", "aria-label": "次の一歩", maxlength: 180 }, quest.nextAction);
    const date = el("input", { class: "a4-input", type: "date", name: "scheduledDate", value: quest.scheduledDate, "aria-label": "日付" });
    const time = el("input", { class: "a4-input", type: "time", name: "scheduledTime", value: quest.scheduledTime, step: 300, "aria-label": "時刻" });
    const due = el("input", { class: "a4-input", type: "date", name: "dueDate", value: quest.dueDate, "aria-label": "締め切り" });
    const notes = el("textarea", { class: "a4-input a4-textarea", name: "notes", rows: 4, maxlength: 180, "aria-label": "メモ", placeholder: "メモ" });
    const criteria = el("textarea", { class: "a4-input a4-textarea", name: "completionCriteria", rows: 3, maxlength: 300, "aria-label": "完了の条件", placeholder: "例：対象SHAで、ログインから同期まで確認できたら完了" });
    criteria.value = quest.completionCriteria ?? "";
    notes.value = quest.notes;
    let estimate = quest.estimatedMinutes;

    // Values read as chips; an editor opens only for the one being changed.
    const shortDay = (value: string) => value === today ? "今日" : value === addDays(today, 1) ? "明日" : dayLabel.format(noon(value));
    const quick = (label: string, apply: () => void) => {
      const chip = el("button", { type: "button", class: "a4-chip" }, label);
      chip.addEventListener("click", () => { apply(); paintChips(); });
      return chip;
    };
    // Length can be picked, typed freely (up to a day), or implied by an end time.
    const hours = el("input", { class: "a4-input a4-num", type: "number", min: 0, max: 24, step: 1, inputmode: "numeric", "aria-label": "目安（時間）" });
    const mins = el("input", { class: "a4-input a4-num", type: "number", min: 0, max: 59, step: 5, inputmode: "numeric", "aria-label": "目安（分）" });
    const end = el("input", { class: "a4-input", type: "time", step: 300, "aria-label": "終わる時刻" });
    const estimateChips = el("div", { class: "a4-chips", role: "group", "aria-label": "目安の時間" }, ...[...ESTIMATES, 90, 120].map(minutes => {
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
    const slots = el("div", { class: "a4-timelist", role: "listbox", "aria-label": "時刻を選ぶ" });
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
    const panes = {
      date: el("div", { class: "a4-sheet-pane", hidden: true }, date, quick("今日", () => { date.value = today; }), quick("明日", () => { date.value = addDays(today, 1); }), quick("なし", () => { date.value = ""; time.value = ""; setEstimate(estimate); })),
      time: el("div", { class: "a4-sheet-pane", hidden: true },
        el("label", { class: "a4-pane-field" }, el("span", { class: "a4-step-label" }, "始まり"), time),
        el("span", { class: "a4-meta", "aria-hidden": "true" }, "〜"),
        el("label", { class: "a4-pane-field" }, el("span", { class: "a4-step-label" }, "終わり"), end),
        quick("なし", () => { time.value = ""; setEstimate(estimate); paintSlots(); }), slots),
      estimate: el("div", { class: "a4-sheet-pane", hidden: true }, estimateChips,
        el("div", { class: "a4-pane-free" }, el("span", { class: "a4-step-label" }, "自由に"), hours, el("span", {}, "時間"), mins, el("span", {}, "分"))),
      due: el("div", { class: "a4-sheet-pane", hidden: true }, due, quick("なし", () => { due.value = ""; })),
    };
    type Pane = keyof typeof panes;
    let open: Pane | null = null;
    const memo = el("div", { class: "a4-field-row", hidden: !quest.notes }, el("span", { class: "a4-step-label" }, "メモ"), notes);
    const memoChip = el("button", { type: "button", class: "a4-chip" }, "＋メモ");
    memoChip.addEventListener("click", () => { memo.hidden = false; memoChip.hidden = true; notes.focus(); });
    memoChip.hidden = !memo.hidden;
    const done = el("div", { class: "a4-field-row", hidden: !quest.completionCriteria }, el("span", { class: "a4-step-label" }, "完了の条件"), criteria);
    const doneChip = el("button", { type: "button", class: "a4-chip" }, "＋完了の条件");
    doneChip.hidden = !done.hidden;
    doneChip.addEventListener("click", () => { done.hidden = false; doneChip.hidden = true; criteria.focus(); });
    // What has to finish first; each opens its own sheet.
    const deps = (quest.dependencyIds ?? []).map(id => byId(id)).filter((item): item is Quest => item !== null);
    const depList = deps.length === 0 ? null : el("section", { class: "a4-group" }, el("h3", { class: "a4-step-label" }, "先にやること"),
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
        date: date.value ? [shortDay(date.value), true] : ["＋日付", false],
        time: time.value ? [estimate > 0 ? `${time.value}–${clock(toMinutes(time.value) + estimate)}` : time.value, true] : ["＋時刻", false],
        estimate: estimate > 0 ? [minutesLabel(estimate), true] : ["＋目安", false],
        due: due.value ? [`締め切り ${shortDay(due.value)}`, true] : ["＋締め切り", false],
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
      title, step,
      el("div", { class: "a4-chips a4-sheet-chips" }, chips.date, chips.time, chips.estimate, chips.due, doneChip, memoChip),
      ...Object.values(panes), done, memo);

    const mine = quest.assignee.type === "self" && !isDone(quest);
    const steps = el("div", { class: "a4-sheet-steps" });
    const stepInput = el("input", { class: "a4-input", placeholder: "ステップを追加", "aria-label": "小さなステップを追加", maxlength: 200, enterkeyhint: "done" });
    const stepForm = el("form", { class: "a4-step-form" }, stepInput, el("button", { type: "submit", class: "a4-button" }, "追加"));
    stepForm.addEventListener("submit", event => {
      event.preventDefault();
      const value = stepInput.value.trim();
      if (!value) return;
      void run(async () => {
        await port.create({ kind: "todo", title: value, notes: "", difficulty: "easy", impact: "medium", lifecycleState: "active", nextAction: "", estimatedMinutes: 0, dueDate: "",
          scheduledDate: "", scheduledTime: "", planningMode: "on_date", planningState: "backlog", parentQuestId: quest.id });
        stepInput.value = "";
        stepInput.focus();
      }, "ステップを追加できませんでした。");
    });
    repaintSheet = () => {
      replaceChildren(steps, stepList(quest) ?? el("p", { class: "a4-muted" }, "大きいときは、ステップに分けると始めやすくなります。"));
      if (!relay.node.contains(document.activeElement)) relay.paint();
    };

    const close = el("button", { type: "button", class: "a4-button" }, "閉じる");
    const dialog = el("dialog", { class: "a4-sheet", "aria-label": `詳しく：${quest.title}` },
      el("div", { class: "a4-sheet-head" },
        parent ? button(`← 「${shortTitle(parent.title)}」の一部`, () => openSheet(parent), "link") : el("h2", { id: "a4-sheet-title", class: "a4-eyebrow" }, "詳しく"), close),
      form,
      depList,
      el("section", { class: "a4-group" }, el("h3", { class: "a4-step-label" }, "担当"), relay.node),
      el("section", { class: "a4-group" }, el("h3", { class: "a4-step-label" }, "小さなステップ"), steps, mine ? stepForm : null),
      el("div", { class: "a4-actions a4-sheet-foot" },
        el("button", { type: "submit", class: "a4-button a4-primary", form: "a4-sheet-form" }, "保存"),
        mine ? button("今やる", () => { dialog.close(); focusId = quest.id; skipped.delete(quest.id); go("now"); }) : null,
        el("a", { class: "a4-link", href: "../relay-forge/" }, "詳しい画面で開く")));
    repaintSheet();
    close.addEventListener("click", () => dialog.close());
    form.addEventListener("submit", event => {
      event.preventDefault();
      const current = byId(quest.id) ?? quest;
      const patch: Record<string, unknown> = {};
      const set = (key: keyof Quest, value: unknown) => { if (current[key] !== value) patch[key] = value; };
      set("title", title.value.trim() || current.title);
      set("nextAction", step.value.trim());
      set("notes", notes.value);
      if ((current.completionCriteria ?? "") !== criteria.value.trim()) patch.completionCriteria = criteria.value.trim();
      set("estimatedMinutes", estimate);
      set("dueDate", due.value);
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
      dialog.close();
      const relayWrite = handOver && port.relay ? port.relay : null;
      if (Object.keys(patch).length === 0 && !relayWrite) return;
      const firstHand = handOver && current.assignee.type !== "agent" && legs.length > 0;
      void run(async () => {
        let saved = current;
        if (Object.keys(patch).length > 0) saved = await port.update(current, { ...patch, expectedUpdatedAt: current.updatedAt });
        if (relayWrite) await relayWrite.set(saved, legs);
        say(firstHand ? `${relay.nameOf(legs[0]!.agentId)} に渡しました` : "保存しました");
      }, "保存できませんでした。もう一度試してください。");
    });
    const opener = document.activeElement;
    dialog.addEventListener("close", () => {
      dialog.remove();
      if (sheet === dialog) { sheet = null; repaintSheet = null; }
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    });
    sheet = dialog;
    document.body.append(dialog);
    dialog.showModal();
    title.focus();
  }

  /* ------------------------------ screens ------------------------------ */

  function nowView(): HTMLElement {
    const today = port.today();
    const candidates = nextCandidates(quests(), today);
    const pinned = byId(focusId);
    const focus = pinned && !pending.has(pinned.id) && candidates.includes(pinned) ? pinned : candidates.find(q => !skipped.has(q.id)) ?? candidates[0] ?? null;
    const rest = candidates.filter(q => q !== focus).slice(0, 3);
    const agentBusy = quests().filter(q => q.assignee.type === "agent" && !needsDecision(q)).length;
    if (!focus) {
      return el("section", { class: "a4-view a4-now" }, decisionNotice(),
        el("h1", { class: "a4-title", tabindex: -1 }, "今やることはありません"),
        el("p", { class: "a4-lead" }, "上の欄に、頭にあることを1つ書き出してみましょう。"));
    }
    const running = isWorking(focus);
    const actions = running
      ? [button("完了", () => complete(focus), "primary"), button("一時停止", () => pause(focus))]
      : [button("始める", () => start(focus), "primary"),
        candidates.length > 1 ? button("別のにする", () => { skipped.add(focus.id); if (skipped.size >= candidates.length) skipped.clear(); focusId = null; render(); }) : null,
        button("明日にする", () => update(focus, { ...plan(addDays(today, 1)), expectedUpdatedAt: focus.updatedAt }, "明日に移しました", previousPlan(focus)), "link")];
    return el("section", { class: "a4-view a4-now" },
      decisionNotice(),
      el("div", { class: "a4-focus", "data-running": String(running) },
        el("p", { class: "a4-eyebrow" }, running ? "続きから" : "次はこれ"),
        el("h1", { class: "a4-focus-title", tabindex: -1 }, focus.title),
        stepDraftFor === focus.id ? stepEditor(focus)
          : focus.nextAction ? el("p", { class: "a4-step" }, el("span", { class: "a4-step-label" }, "次の一歩"), focus.nextAction, " ", button("変える", () => { stepDraftFor = focus.id; render(); }, "link"))
            : button("次の一歩を書く（小さくてOK）", () => { stepDraftFor = focus.id; render(); }, "link"),
        stepList(focus),
        running ? timer(focus)
          // A set estimate collapses to one line so the start button stays the obvious next move.
          : focus.estimatedMinutes > 0 && estimateFor !== focus.id
            ? el("p", { class: "a4-step" }, el("span", { class: "a4-step-label" }, "目安"), minutesLabel(focus.estimatedMinutes), " ", button("変える", () => { estimateFor = focus.id; render(); }, "link"))
            : el("div", { class: "a4-estimate" }, el("span", { class: "a4-step-label" }, "どのくらい？"), estimateChips(focus)),
        el("div", { class: "a4-actions" }, ...actions)),
      rest.length === 0 ? null : (() => {
        const after = el("details", { class: "a4-after", open: afterOpen },
          el("summary", { class: "a4-subtitle" }, `このあと（${rest.length}）`),
          el("ul", { class: "a4-list" }, ...rest.map(q => {
            const pick = el("button", { type: "button", class: "a4-pick" }, el("span", {}, q.title), el("span", { class: "a4-meta" }, meta(q)));
            pick.addEventListener("click", () => { focusId = q.id; render(); });
            return el("li", {}, pick);
          })));
        after.addEventListener("toggle", () => { afterOpen = after.open; });
        return after;
      })(),
      agentBusy === 0 ? null : el("p", { class: "a4-muted" }, `Agentが ${agentBusy} 件を進めています。`));
  }

  /** Week at a glance: an "anytime" row, then an hourly axis with cards sized by duration. */
  function weekGrid(list: readonly Quest[]): HTMLElement {
    const today = port.today();
    const days = weekOf(planDate);
    const plans = days.map(date => dayPlan(list, date));
    const timed = plans.flatMap(p => p.timed);
    const first = Math.min(8, ...timed.map(q => Math.floor(toMinutes(q.scheduledTime) / 60)));
    const last = Math.max(20, ...timed.map(q => Math.ceil(endOf(q) / 60)));
    const top = (minutes: number) => `${(minutes - first * 60) * GRID_PX}px`;
    const card = (quest: Quest, extra: Record<string, unknown> = {}) => {
      const steps = children(quest);
      const length = quest.scheduledTime ? endOf(quest) - toMinutes(quest.scheduledTime) : 0;
      const info = [quest.scheduledTime ? `${quest.scheduledTime}–${clock(endOf(quest))}` : "", length >= 30 || !quest.scheduledTime ? (quest.estimatedMinutes > 0 ? minutesLabel(quest.estimatedMinutes) : "") : "",
        steps.length > 0 ? `${steps.filter(isDone).length}/${steps.length}` : ""].filter(Boolean).join(" · ");
      return el("div", { class: "a4-wk-item", "data-tone": tone(quest), "data-hue": hue(quest), ...running(quest, length || DEFAULT_BLOCK), ...extra },
        el("div", { class: "a4-wk-text" }, titleButton(quest), info ? el("span", { class: "a4-meta" }, info) : null),
        checkButton(quest));
    };
    const head = days.map(date => {
      const node = el("button", { type: "button", class: "a4-wk-day", "aria-pressed": String(date === planDate), "data-today": String(date === today), "aria-label": dayLabel.format(noon(date)) },
        el("span", { class: "a4-day-name" }, weekdayLabel.format(noon(date))),
        el("span", { class: "a4-day-num" }, String(Number(date.slice(8)))));
      node.addEventListener("click", () => { planDate = date; render(); });
      return node;
    });
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const columns = days.map((date, index) => {
      // Overlapping cards split the column into lanes; past MAX_LANES the rest fold into "+N件".
      const clusters: { start: number; end: number; items: { quest: Quest; lane: number }[]; lanes: number }[] = [];
      let laneEnds: number[] = [];
      for (const quest of plans[index]!.timed) {
        const start = toMinutes(quest.scheduledTime), end = endOf(quest);
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
          const start = toMinutes(quest.scheduledTime), height = Math.max(40, (endOf(quest) - start) * GRID_PX - 4);
          return card(quest, { "data-short": String(height < 60), "data-narrow": String(lanes > 1), style: `top: ${top(start)}; height: ${height}px; ${place(lane)}` });
        });
        if (!folded) return cards;
        const hidden = cluster.items.length - shown.length;
        const more = el("button", { type: "button", class: "a4-wk-more", "aria-label": `${dayLabel.format(noon(date))} ほか${hidden}件を日表示で見る`,
          style: `top: ${top(cluster.start)}; height: ${Math.max(40, (cluster.end - cluster.start) * GRID_PX - 4)}px; ${place(MAX_LANES - 1)}` }, `+${hidden}件`);
        more.addEventListener("click", () => { planDate = date; planMode = "day"; store.set("a4-plan-mode", null); render(); });
        return [...cards, more];
      });
      const nowLine = date === today && nowMinutes >= first * 60 && nowMinutes <= last * 60 ? el("div", { class: "a4-wk-now", style: `top: ${top(nowMinutes)}`, "aria-hidden": "true" }) : null;
      return el("div", { class: "a4-wk-col", "data-selected": String(date === planDate) }, nowLine, ...items);
    });
    const hours = Array.from({ length: last - first }, (_, i) => el("span", { style: `top: ${top((first + i) * 60)}` }, clock((first + i) * 60)));
    return el("div", { class: "a4-wk-scroll" },
      el("div", { class: "a4-wk", style: `--a4-wk-height: ${(last - first) * 60 * GRID_PX}px; --a4-wk-hour: ${60 * GRID_PX}px` },
        el("span", { class: "a4-wk-corner" }), ...head,
        el("span", { class: "a4-wk-label" }, "いつでも"),
        ...plans.map((plan, index) => el("div", { class: "a4-wk-allday", "data-selected": String(days[index] === planDate) }, ...plan.anytime.map(q => card(q)))),
        el("div", { class: "a4-wk-hours", "aria-hidden": "true" }, ...hours),
        ...columns));
  }

  function planView(): HTMLElement {
    const today = port.today();
    const dayName = (date: string) => date === today ? "今日" : dayLabel.format(noon(date));
    const list = port.quests();
    const day = dayPlan(list, planDate);
    const open = [...day.anytime, ...day.timed].filter(q => !isDone(q));

    const modeButton = (mode: "day" | "week", label: string) => {
      const node = el("button", { type: "button", class: "a4-seg-button", "aria-pressed": String(planMode === mode) }, label);
      node.addEventListener("click", () => { planMode = mode; store.set("a4-plan-mode", mode === "week" ? "week" : null); render(); });
      return node;
    };
    const shift = (label: string, days: number, aria: string) => {
      const node = button(label, () => { planDate = addDays(planDate, days); render(); });
      node.setAttribute("aria-label", aria);
      return node;
    };
    const week = el("div", { class: "a4-week", role: "group", "aria-label": "この週" }, ...weekOf(planDate).map(date => {
      const items = (({ anytime, timed }) => [...anytime, ...timed])(dayPlan(list, date));
      const node = el("button", { type: "button", class: "a4-day", "aria-pressed": String(date === planDate), "data-today": String(date === today), "aria-label": `${dayLabel.format(noon(date))} ${items.length}件` },
        el("span", { class: "a4-day-name" }, weekdayLabel.format(noon(date))),
        el("span", { class: "a4-day-num" }, String(Number(date.slice(8)))),
        el("span", { class: "a4-dots", "aria-hidden": "true" }, ...items.slice(0, 4).map(q => el("i", { "data-tone": tone(q), "data-hue": hue(q) }))));
      node.addEventListener("click", () => { planDate = date; render(); });
      return node;
    }));

    // Timeline: tasks with a time, the current time, and free stretches worth noticing.
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const free = gaps(day.timed);
    let nowShown = planDate !== today;
    const nowLine = () => el("li", { class: "a4-now-line" }, el("span", { class: "a4-slot-time" }, clock(nowMinutes)), el("span", { class: "a4-now-label" }, "いま"));
    const slots: HTMLElement[] = [];
    for (const quest of day.timed) {
      const start = toMinutes(quest.scheduledTime), end = endOf(quest);
      const gap = free.find(g => g.before === quest.id);
      if (!nowShown && nowMinutes < start) { slots.push(nowLine()); nowShown = true; }
      if (gap) slots.push(el("li", { class: "a4-gap" }, el("span", { class: "a4-slot-time" }), el("span", { class: "a4-muted" }, `空き ${minutesLabel(gap.minutes)}。ひと息つけます。`)));
      slots.push(el("li", { class: "a4-slot", "data-tone": tone(quest), "data-hue": hue(quest), ...running(quest, end - start), style: `--a4-len: ${Math.min(end - start, 180)}` },
        el("span", { class: "a4-slot-time" }, quest.scheduledTime, el("small", {}, clock(end))),
        el("span", { class: "a4-slot-pill", "aria-hidden": "true" }),
        rowText(quest, false),
        checkButton(quest)));
    }
    if (!nowShown && day.timed.length > 0) slots.push(nowLine());

    // Undated work sits beside the day (below it on phones), one tap from being planned.
    const all = groups(quests(), today);
    const place = (quest: Quest) => {
      const node = el("button", { type: "button", class: "a4-add", "aria-label": `${quest.title} を${dayName(planDate)}に入れる`, disabled: busy }, "＋");
      node.addEventListener("click", () => update(quest, { ...plan(planDate), expectedUpdatedAt: quest.updatedAt }, `${dayName(planDate)}に入れました`, previousPlan(quest)));
      return node;
    };
    const sideList = (items: readonly Quest[]) => el("ul", { class: "a4-list" }, ...items.map(q => el("li", { class: "a4-row" }, el("div", { class: "a4-row-main" }, rowText(q), place(q)))));
    const review = planDate === today ? all.review : [];

    return el("section", { class: "a4-view a4-plan", "data-mode": planMode },
      el("div", { class: "a4-plan-main" },
        el("div", { class: "a4-plan-head" },
          el("h1", { class: "a4-title", tabindex: -1 }, planMode === "week" ? monthLabel.format(noon(planDate)) : planDate === today ? `今日 ${dayLabel.format(noon(planDate))}` : dayLabel.format(noon(planDate))),
          el("div", { class: "a4-plan-nav" },
            el("div", { class: "a4-seg", role: "group", "aria-label": "表示" }, modeButton("day", "日"), modeButton("week", "週")),
            planDate === today ? null : button("今日へ", () => { planDate = today; render(); }, "link"), shift("‹", -7, "前の週"), shift("›", 7, "次の週"))),
        ...(planMode === "week" ? [weekGrid(list)] : [week,
        el("p", { class: "a4-lead" }, day.timed.length + day.anytime.length === 0
          ? "この日の予定はありません。受け箱から＋で入れるか、上の欄に書き出しましょう。"
          : open.length === 0 ? "この日の分はすべて終わりました。" : `残り ${open.length} 件 · 目安 ${minutesLabel(plannedMinutes(open))}`),
        day.anytime.length === 0 ? null : el("section", { class: "a4-group" },
          el("h2", { class: "a4-subtitle" }, "いつでも"),
          el("ul", { class: "a4-list" }, ...day.anytime.map(q => el("li", { class: "a4-row", "data-tone": tone(q), "data-hue": hue(q) }, el("div", { class: "a4-row-main" }, checkButton(q), rowText(q)))))),
        slots.length === 0 ? null : el("section", { class: "a4-group" },
          el("h2", { class: "a4-subtitle" }, "時間で"),
          el("ol", { class: "a4-timeline" }, ...slots))])),
      el("aside", { class: "a4-plan-side", "aria-label": "日付のないもの" },
        el("h2", { class: "a4-subtitle" }, `受け箱（${all.inbox.length}）`),
        all.inbox.length === 0 ? el("p", { class: "a4-muted" }, "受け箱は空です。") : sideList(all.inbox),
        review.length === 0 ? null : el("section", { class: "a4-group" },
          el("h2", { class: "a4-subtitle" }, `日付を見直す（${review.length}）`),
          el("p", { class: "a4-muted" }, "予定日を過ぎたものです。＋で今日に入れるか、タイトルから日付を変えます。"),
          sideList(review))));
  }

  function allView(): HTMLElement {
    const all = groups(quests(), port.today());
    const section = (bucket: Bucket, title: string, hint = "") => all[bucket].length === 0 ? null : el("section", { class: "a4-group" },
      el("h2", { class: "a4-subtitle" }, `${title}（${all[bucket].length}）`),
      hint ? el("p", { class: "a4-muted" }, hint) : null,
      el("ul", { class: "a4-list" }, ...all[bucket].map(q => row(q, bucket))));
    const empty = Object.values(all).every(list => list.length === 0);
    return el("section", { class: "a4-view" },
      el("h1", { class: "a4-title", tabindex: -1 }, "やること"),
      empty ? el("p", { class: "a4-lead" }, "やることはありません。") : null,
      section("decision", "あなたの判断待ち", "Agentや他の人からの確認依頼です。「確認する」から内容を見て判断します。"),
      section("today", "今日"),
      section("review", "日付を見直す"),
      section("inbox", "受け箱", "日付のないものです。今日やるものだけ選べば十分です。"),
      section("later", "これから"),
      section("agent", "Agentが担当"));
  }

  /** Shows a request's link only when it is a plain web address. */
  const safeUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return url.protocol === "https:" || url.protocol === "http:" ? url.href : null; } catch { return null; } };

  function answer(quest: Quest, action: RequestAnswer): void {
    const text = (replies.get(quest.id) ?? "").trim();
    void run(async () => {
      await port.answer(quest, action, text);
      replies.delete(quest.id); confirmed.delete(quest.id); reviseFor = null; decisionId = null;
      if (cheer && action === "approve") celebrate(innerWidth / 2, innerHeight * 0.55);
      say(action === "approve" ? "OKを伝えました" : action === "revise" ? "直してほしい点を伝えました" : action === "defer" ? "あとで見るに移しました" : "判断待ちに戻しました");
    }, "送れませんでした。内容が更新されていないか確認して、もう一度試してください。");
  }

  function review(quest: Quest, accept: boolean): void {
    const note = (replies.get(quest.id) ?? "").trim();
    void run(async () => {
      const saved = await port.review(quest, accept, note);
      replies.delete(quest.id); confirmed.delete(quest.id); reviseFor = null; decisionId = null;
      const passed = accept && saved.assignee.type === "agent" && saved.assignee.id !== quest.assignee.id ? saved.assignee.label : "";
      if (cheer && accept) celebrate(innerWidth / 2, innerHeight * 0.55);
      say(passed ? `${passed} に回しました` : accept ? "受け取りました" : "やり直しをお願いしました");
    }, "送れませんでした。Agentの状態が変わっていないか確認して、もう一度試してください。");
  }

  /** One decision at a time, like the Now screen: what is asked, what to check, then a single clear answer. */
  function decisionCard(quest: Quest, index: number, total: number, next: () => void): HTMLElement {
    const request = quest.humanRequest ?? null;
    const source = request?.sourceQuestId ? byId(request.sourceQuestId) : null;
    const link = safeUrl(request?.artifactUrl || quest.handoff?.artifactUrl);
    const detail = (label: string, value: string | undefined) => value ? el("p", { class: "a4-step" }, el("span", { class: "a4-step-label" }, label), value) : null;
    const relay = !request ? port.relay?.get(quest.id) ?? null : null;
    const leg = relay?.legs[relay.at];
    const nextLeg = relay?.legs[relay.at + 1];
    const nextName = nextLeg ? port.agents().find(agent => agent.id === nextLeg.agentId)?.name ?? "Agent" : "";
    const headline = request?.checkTarget || quest.title;
    const details = [detail("理由", request?.reason), detail("完了の条件", quest.completionCriteria), detail("報告", request ? undefined : quest.handoff?.note)].filter(Boolean) as HTMLElement[];
    const check = el("input", { type: "checkbox", checked: confirmed.has(quest.id) });
    const reply = el("textarea", { class: "a4-input a4-textarea", rows: 3, maxlength: 2000, "aria-label": "直してほしいこと", placeholder: "例：見出しをもう少し短く" });
    reply.value = replies.get(quest.id) ?? "";
    const ok = button(request ? "OK、これで良い" : nextLeg ? `受け取って ${nextName} に回す` : "受け取る", () => request ? answer(quest, "approve") : review(quest, true), "primary", !confirmed.has(quest.id));
    const send = button("送る", () => request ? answer(quest, "revise") : review(quest, false), "secondary", !confirmed.has(quest.id) || !reply.value.trim());
    const sync = () => { ok.disabled = busy || !check.checked; send.disabled = busy || !check.checked || !reply.value.trim(); };
    check.addEventListener("change", () => { if (check.checked) confirmed.add(quest.id); else confirmed.delete(quest.id); sync(); });
    reply.addEventListener("input", () => { replies.set(quest.id, reply.value); sync(); });
    const revising = reviseFor === quest.id;
    return el("div", { class: "a4-focus a4-decision" },
      el("p", { class: "a4-eyebrow" }, request ? `${quest.requester?.label || "Agent"} からの確認依頼` : leg?.ask ? `${quest.assignee.label || "Agent"} が「${leg.ask}」を終えました` : `${quest.assignee.label || "Agent"} が「終わった」と報告しています`,
        total > 1 ? el("span", { class: "a4-meta" }, `  ${index + 1} / ${total}`) : null),
      el("h2", { class: "a4-focus-title" }, headline),
      headline !== quest.title ? el("p", { class: "a4-meta a4-decision-sub" }, quest.title) : null,
      details.length > 0 ? el("details", { class: "a4-more" }, el("summary", {}, "詳しく"), el("div", { class: "a4-more-body" }, ...details)) : null,
      el("div", { class: "a4-actions" },
        source ? button("元のタスクを見る", () => openSheet(source), "link") : null,
        link ? el("a", { class: "a4-link", href: link, target: "_blank", rel: "noopener noreferrer" }, "成果物を開く ↗") : null),
      el("label", { class: "a4-option" }, check, "中身を確認しました"),
      revising ? el("div", { class: "a4-field-row" }, el("span", { class: "a4-step-label" }, request ? "直してほしいこと" : "やり直してほしいこと"), reply) : null,
      el("div", { class: "a4-actions" },
        revising ? send : ok,
        revising ? button("やめる", () => { reviseFor = null; render(); }, "link") : button("直してほしい", () => { reviseFor = quest.id; render(); main.querySelector<HTMLElement>(".a4-decision textarea")?.focus(); }),
        request && !revising ? button("あとで", () => answer(quest, "defer"), "link") : null,
        total > 1 && !revising ? button("次の判断へ", next, "link") : null));
  }

  /* ------------------------------ guild: people, activity, registration ------------------------------ */

  const timeLabel = (iso: string) => {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "";
    const hm = at.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
    return at.toDateString() === new Date().toDateString() ? hm : `${at.getMonth() + 1}/${at.getDate()} ${hm}`;
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
    const title = quest ? `「${quest.title}」` : "タスク";
    const agentName = quest?.assignee.type === "agent" ? quest.assignee.label || "Agent" : "Agent";
    const who = event.source === "mcp" ? agentName : "あなた";
    const assignee = (event.details.assignee as { label?: string } | undefined)?.label;
    const to = String(event.details.to ?? "");
    const what = event.type === "quest.created" ? `${title}を作りました`
      : event.type === "quest.assignment.ready" ? `${title}を ${assignee || "Agent"} に渡しました`
      : event.type === "quest.handoff.transitioned" ? `${title}を「${AGENT_STATE[to as keyof typeof AGENT_STATE] ?? to}」にしました`
      : event.type === "quest.scored" ? `${title}を完了しました`
      : event.type === "quest.reopened" ? `${title}を戻しました`
      : event.type === "quest.archived" ? `${title}をしまいました`
      : `${title}を更新しました`;
    return el("li", { class: "a4-activity" },
      el("span", { class: "a4-activity-time" }, timeLabel(event.at)),
      el("span", { class: "a4-avatar a4-avatar-sm", "data-kind": event.source === "mcp" ? "agent" : "self", "aria-hidden": "true" }, who.slice(0, 1)),
      el("span", {}, el("strong", {}, who), ` が${what}`));
  }

  /** A person or Agent and what they are on right now. */
  function memberRow(kind: "self" | "human" | "agent", name: string, sub: string, doing: readonly Quest[], inactive = false, agentId = ""): HTMLElement {
    const shown = doing.slice(0, 3);
    const confirming = agentId !== "" && removingAgent === agentId;
    const remove = agentId === "" ? null : confirming ? null : button("外す", () => { removingAgent = agentId; render(); }, "link");
    return el("li", { class: "a4-row a4-member", "data-inactive": String(inactive) },
      el("div", { class: "a4-row-main" },
        el("span", { class: "a4-avatar", "data-kind": kind, "aria-hidden": "true" }, name.slice(0, 1)),
        el("div", { class: "a4-row-text" }, el("strong", {}, name), sub ? el("span", { class: "a4-meta" }, sub) : null), remove),
      confirming ? el("div", { class: "a4-conn-edit", role: "group", "aria-label": `${name}を外す` },
        el("p", { class: "a4-muted" }, `${name} をギルドから外します。${doing.length > 0 ? `担当中の ${doing.length} 件はそのまま残るので、必要なら担当を変えてください。` : ""}外した Agent は担当に選べなくなり、MCP の紐付けも使えなくなります。`),
        el("div", { class: "a4-actions" },
          button("外す", () => {
            void run(async () => { await port.removeAgent(agentId); removingAgent = null; say(`${name} を外しました`); }, "外せませんでした。もう一度試してください。");
          }, "primary"),
          button("やめる", () => { removingAgent = null; render(); }, "link"))) : null,
      el("div", { class: "a4-doing" },
        shown.length === 0 ? el("span", { class: "a4-meta" }, inactive ? "停止中" : kind === "human" ? "担当しているタスクはありません" : "いまは手が空いています")
          : el("ul", { class: "a4-doing-list" }, ...shown.map(quest => el("li", {},
            el("span", { class: "a4-state", "data-state": kind === "agent" ? quest.assignee.handoffState : "working" },
              kind === "agent" ? AGENT_STATE[quest.assignee.handoffState] ?? quest.assignee.handoffState : "いまやっている"),
            titleButton(quest)))),
        doing.length > shown.length ? el("span", { class: "a4-meta" }, `ほか ${doing.length - shown.length} 件`) : null));
  }

  const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

  /** Register an Agent with plain choices; the raw scopes stay in Relay Forge. */
  function openAgentForm(): void {
    sheet?.close();
    const name = el("input", { class: "a4-sheet-title", required: true, maxlength: 60, placeholder: "Agent の名前（例：Scribe）", "aria-label": "Agent の名前" });
    const id = el("input", { class: "a4-input", required: true, maxlength: 80, pattern: "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?", placeholder: "例：scribe", "aria-label": "Agent ID", autocapitalize: "off", spellcheck: false });
    const role = el("input", { class: "a4-input", maxlength: 80, placeholder: "例：文書をまとめる", "aria-label": "何をする Agent か" });
    const instructions = el("textarea", { class: "a4-input a4-textarea", rows: 3, maxlength: 2000, placeholder: "例：下書きは箇条書きで。数字は必ず出典を書く。", "aria-label": "お願いしておくこと" });
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
      field("何をする Agent ？", role),
      field("Agent ID", id, "英小文字・数字・ハイフン。MCP で Agent を指すときに使います。あとから変えられません。"),
      el("fieldset", { class: "a4-field" }, el("legend", { class: "a4-step-label" }, "やってよいこと"),
        power("read", "見るだけ", "タスクを読むだけで、変えません", false),
        power("write", "タスクを進める", "タスクを読み、状態や中身を書き換えます", true)),
      el("label", { class: "a4-option" }, review, "終わったら、あなたの確認を待つ"),
      field("お願いしておくこと（任意）", instructions),
      error);
    const close = el("button", { type: "button", class: "a4-button" }, "閉じる");
    const dialog = el("dialog", { class: "a4-sheet", "aria-labelledby": "a4-agent-title" },
      el("div", { class: "a4-sheet-head" }, el("h2", { id: "a4-agent-title", class: "a4-eyebrow" }, "Agent を登録"), close),
      form,
      el("div", { class: "a4-actions a4-sheet-foot" }, el("button", { type: "submit", class: "a4-button a4-primary", form: "a4-agent-form" }, "登録する")));
    close.addEventListener("click", () => dialog.close());
    const fail = (message: string, focus: HTMLElement) => { error.textContent = message; error.hidden = false; focus.focus(); };
    form.addEventListener("submit", event => {
      event.preventDefault();
      const agentId = id.value.trim().toLowerCase();
      if (!name.value.trim()) return fail("名前を入れてください。", name);
      if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(agentId)) return fail("Agent ID は英小文字・数字・ハイフンで入れてください。", id);
      if (port.agents().some(agent => agent.id === agentId)) return fail("この Agent ID はもう使われています。", id);
      const write = form.querySelector<HTMLInputElement>('input[name="a4-agent-power"]:checked')?.value === "write";
      error.hidden = true;
      void run(async () => {
        const agent = await port.registerAgent({
          agentId, displayName: name.value.trim(), role: role.value.trim(), instructions: instructions.value.trim(),
          allowedScopes: write ? ["quests:read", "quests:write"] : ["quests:read"], reviewRequired: review.checked,
        });
        dialog.close();
        say(`${agent.name} を登録しました。担当のリレーで選べます。`);
      }, "登録できませんでした。もう一度試してください。");
    });
    dialog.addEventListener("close", () => { dialog.remove(); if (sheet === dialog) sheet = null; });
    sheet = dialog;
    document.body.append(dialog);
    dialog.showModal();
    name.focus();
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
    const url = el("input", { class: "a4-input a4-mono", readonly: true, value: port.mcp.url, "aria-label": "MCP の接続URL" });
    url.addEventListener("focus", () => url.select());
    const copy = button("コピー", () => {
      void navigator.clipboard.writeText(port.mcp.url).then(() => say("接続URLをコピーしました"), () => { url.focus(); say("コピーできませんでした。URLを選んで手動でコピーしてください。"); });
    });
    const agents = port.agents().filter(agent => agent.active);
    const nameOf = (agentId: string) => port.agents().find(agent => agent.id === agentId)?.name ?? agentId;
    const card = (connection: AllForConnection) => {
      const editing = linkDrafts.get(connection.clientId);
      const head = el("div", { class: "a4-row-main" },
        el("span", { class: "a4-avatar", "data-kind": "agent", "aria-hidden": "true" }, connection.clientName.slice(0, 1)),
        el("div", { class: "a4-row-text" }, el("strong", {}, connection.clientName),
          el("span", { class: "a4-meta" }, [connection.authorized ? "接続中" : "接続が切れています", connection.lastUsedAt ? `最後に使ったのは ${timeLabel(connection.lastUsedAt)}` : ""].filter(Boolean).join(" · "))),
        editing ? null : button(connection.agentIds.length ? "変える" : "Agent を紐付ける", () => { linkDrafts.set(connection.clientId, [...connection.agentIds]); render(); }));
      const linked = el("p", { class: "a4-muted a4-conn-line" }, connection.agentIds.length
        ? `この接続は ${connection.agentIds.map(nameOf).join("・")} として動きます。`
        : "まだ Agent に紐付いていません。紐付けると、この接続での作業がその Agent の担当として記録されます。");
      if (!editing) return el("li", { class: "a4-row" }, head, linked);
      const chips = el("div", { class: "a4-chips", role: "group", "aria-label": "紐付ける Agent" }, ...(agents.length === 0
        ? [el("span", { class: "a4-muted" }, "先にギルドで Agent を登録してください。")]
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
          el("p", { class: "a4-muted" }, "この接続で動かす Agent を選んでください。複数選ぶと、最初の Agent が既定になります。"),
          chips,
          el("div", { class: "a4-actions" },
            button("保存", () => {
              const next = linkDrafts.get(connection.clientId) ?? [];
              void run(async () => {
                await port.mcp.link(connection, next);
                linkDrafts.delete(connection.clientId);
                connections = await port.mcp.connections();
                say(next.length ? `${next.map(nameOf).join("・")} に紐付けました` : "紐付けを外しました");
              }, "保存できませんでした。もう一度試してください。");
            }, "primary"),
            button("やめる", () => { linkDrafts.delete(connection.clientId); render(); }, "link"))));
    };
    return el("section", { class: "a4-group" },
      el("h2", { class: "a4-subtitle" }, "MCP 接続"),
      el("p", { class: "a4-muted" }, "Claude や Codex などの MCP クライアントにこの URL を追加してサインインすると、下に接続が表示されます。"),
      el("div", { class: "a4-step-form" }, url, copy),
      connectionsLoading && connections === null ? el("p", { class: "a4-muted" }, "接続を読み込んでいます…")
        : connectionsError ? el("p", { class: "a4-muted" }, "接続を読み込めませんでした。", button("もう一度", loadConnections, "link"))
        : (connections ?? []).length === 0 ? el("p", { class: "a4-muted" }, "まだ接続はありません。")
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
    return el("section", { class: "a4-view" },
      el("h1", { class: "a4-title", tabindex: -1 }, "ギルド"),
      el("p", { class: "a4-lead" }, "Agentや仲間と一緒に進めるための場所です。あなたが決めることだけ、ここに集まります。"),
      el("section", { class: "a4-group" },
        el("h2", { class: "a4-subtitle" }, `あなたの判断待ち（${list.length}）`),
        current ? decisionCard(current, index, list.length, () => { decisionId = list[(index + 1) % list.length]!.id; reviseFor = null; render(); })
          : el("p", { class: "a4-muted" }, "いま、あなたの判断を待っているものはありません。")),
      later.length === 0 ? null : el("section", { class: "a4-group" },
        el("h2", { class: "a4-subtitle" }, `あとで見る（${later.length}）`),
        el("ul", { class: "a4-list" }, ...later.map(q => el("li", { class: "a4-row" }, el("div", { class: "a4-row-main" }, rowText(q), button("判断待ちに戻す", () => answer(q, "resume"), "link")))))),
      el("section", { class: "a4-group" },
        el("div", { class: "a4-group-head" }, el("h2", { class: "a4-subtitle" }, "人と Agent"), button("＋ Agent を登録", openAgentForm)),
        el("ul", { class: "a4-list" },
          memberRow("self", `${port.self().label}（あなた）`, "", quests().filter(q => q.assignee.type === "self" && isWorking(q))),
          ...others.map(member => memberRow("human", member.name, member.owner ? "オーナー" : "メンバー", quests().filter(q => isOpen(q) && q.assignee.type === "human" && q.assignee.id === member.id))),
          ...agents.map(agent => memberRow("agent", agent.name, agent.role ? `Agent · ${agent.role}` : "Agent", byAgent(agent.id), !agent.active, agent.id)))),
      el("section", { class: "a4-group" },
        el("h2", { class: "a4-subtitle" }, "最近の活動"),
        activity === null ? el("p", { class: "a4-muted" }, activityError ? "活動を読み込めませんでした。" : "読み込んでいます…", activityError ? button("もう一度", loadActivity, "link") : null)
          : activity.length === 0 ? el("p", { class: "a4-muted" }, "まだ活動はありません。")
          : el("ul", { class: "a4-activity-list" }, ...activity.slice(0, 10).map(activityLine))));
  }

  function settingsView(): HTMLElement {
    const cheerToggle = el("input", { type: "checkbox", checked: cheer });
    cheerToggle.addEventListener("change", () => { cheer = cheerToggle.checked; store.set("a4-cheer", cheer ? null : "off"); });
    const gameToggle = el("input", { type: "checkbox", checked: game });
    gameToggle.addEventListener("change", () => { game = gameToggle.checked; store.set("a4-game", game ? null : "off"); say(game ? "ゲーム要素を表示します" : "ゲーム要素を隠しました"); });
    const theme = document.documentElement.getAttribute("data-theme") ?? "system";
    const themes = el("fieldset", { class: "a4-field" }, el("legend", {}, "表示テーマ"),
      ...[["system", "端末に合わせる"], ["light", "ライト"], ["dark", "ダーク"]].map(([value, label]) => {
        const input = el("input", { type: "radio", name: "a4-theme", value, checked: theme === value });
        input.addEventListener("change", () => {
          if (value === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", value!);
          store.set("qf-relay-forge-theme", value === "system" ? null : value!);
        });
        return el("label", { class: "a4-option" }, input, label!);
      }));
    const bloom = el("input", { type: "checkbox", checked: document.documentElement.hasAttribute("data-a4-palette") });
    bloom.addEventListener("change", () => {
      if (bloom.checked) document.documentElement.setAttribute("data-a4-palette", "bloom"); else document.documentElement.removeAttribute("data-a4-palette");
      store.set("a4-palette", bloom.checked ? null : "plain");
    });
    return el("section", { class: "a4-view" },
      el("h1", { class: "a4-title", tabindex: -1 }, "設定"),
      el("label", { class: "a4-option" }, cheerToggle, "完了したら紙吹雪でお祝いする"),
      el("label", { class: "a4-option" }, gameToggle, "ゲーム要素（レベル・XP）を表示する"),
      themes,
      el("label", { class: "a4-option" }, bloom, "やわらかい色分け（背景のグラデーションとタスクごとの色）"),
      mcpSection(),
      el("p", {}, el("a", { class: "a4-link", href: "../relay-forge/" }, "Relay Forge（詳しい画面）を開く")),
      port.signOut ? button("サインアウト", () => { void port.signOut?.(); }, "link") : null);
  }

  /** The running task follows the person to every other screen. */
  function dock(): HTMLElement | null {
    const running = view === "now" ? undefined : quests().find(isWorking);
    if (!running) return null;
    const open = el("button", { type: "button", class: "a4-row-title" }, running.title);
    open.addEventListener("click", () => { focusId = running.id; go("now"); });
    return el("aside", { class: "a4-dock", "aria-label": "作業中" }, timer(running, true),
      el("div", { class: "a4-row-text" }, el("span", { class: "a4-meta" }, "作業中"), open),
      button("一時停止", () => pause(running)), button("完了", () => complete(running)));
  }

  /* ------------------------------ shell ------------------------------ */

  function go(next: View): void {
    if (next === "guild" && view !== "guild") { activity = null; activityError = false; }
    if (next === "settings" && view !== "settings") { connections = null; connectionsError = false; }
    view = next;
    stepDraftFor = null;
    if (location.hash !== `#${next}`) history.pushState(null, "", `#${next}`);
    render();
    main.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  function render(): void {
    if (disposed) return;
    const active = document.activeElement;
    const keepFocus = active instanceof HTMLElement && main.contains(active) && active.matches("input") ? null : active instanceof HTMLElement && main.contains(active) ? active.textContent : null;
    replaceChildren(nav, ...VIEWS.map(item => {
      const waiting = item.id === "guild" ? quests().filter(needsDecision).length : 0;
      const tab = el("a", { class: "a4-tab", href: `#${item.id}`, "aria-current": view === item.id ? "page" : null, "data-view": item.id }, item.label,
        waiting > 0 ? el("span", { class: "a4-badge", "aria-label": `判断待ち ${waiting} 件` }, String(waiting)) : null);
      tab.addEventListener("click", event => { event.preventDefault(); go(item.id); });
      return tab;
    }));
    root.querySelector(".a4-app")?.setAttribute("data-busy", String(busy));
    main.setAttribute("data-view", view);
    replaceChildren(main, view === "now" ? nowView() : view === "plan" ? planView() : view === "all" ? allView() : view === "guild" ? guildView() : settingsView());
    replaceChildren(dockHost, dock());
    repaintSheet?.();
    paintProgress();
    // Keep keyboard users on the control they used when it survives the rerender.
    if (keepFocus) [...main.querySelectorAll<HTMLElement>("button")].find(node => node.textContent === keepFocus)?.focus({ preventScroll: true });
  }

  const tick = window.setInterval(() => { for (const node of root.querySelectorAll<HTMLElement & { a4Paint?: () => void }>(".a4-ring")) node.a4Paint?.(); paintProgress(); }, 1000);
  const onHide = () => { if (document.visibilityState === "hidden") flushPending(); };
  const onFocus = () => { if (port.refresh && !busy && pending.size === 0 && !sheet) void port.refresh().then(render, () => undefined); };
  const onHash = () => { if (viewFromHash() !== view) go(viewFromHash()); };
  document.addEventListener("visibilitychange", onHide);
  root.addEventListener("pointerdown", onPointer, true);
  window.addEventListener("hashchange", onHash);
  window.addEventListener("popstate", onHash);
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onFocus);
  const unsubscribe = port.subscribe?.(() => { if (!busy) render(); });
  render();

  return () => {
    disposed = true;
    flushPending();
    sheet?.close();
    window.clearInterval(tick);
    window.clearTimeout(toastTimer);
    document.removeEventListener("visibilitychange", onHide);
    root.removeEventListener("pointerdown", onPointer, true);
    window.removeEventListener("hashchange", onHash);
    window.removeEventListener("popstate", onHash);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("online", onFocus);
    unsubscribe?.();
  };
}

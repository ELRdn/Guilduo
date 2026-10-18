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
import { addDays, clock, dayPlan, DEFAULT_BLOCK, endOf, ESTIMATES, gaps, groups, onDay, isWorking, minutesLabel, needsDecision, nextCandidates, plannedMinutes, toMinutes, weekOf, type Bucket } from "./model.ts";

export interface AllForPort {
  readonly demo: boolean;
  readonly today: () => string;
  readonly quests: () => readonly Quest[];
  create(input: Record<string, unknown>): Promise<Quest>;
  update(quest: Quest, patch: Record<string, unknown>): Promise<Quest>;
  complete(quest: Quest): Promise<{ quest: Quest; character: CharacterState | null }>;
  refresh?(): Promise<void>;
  readonly signOut?: () => Promise<void>;
}

type View = "now" | "plan" | "all" | "settings";
const VIEWS: readonly { id: View; label: string }[] = [
  { id: "now", label: "今" },
  { id: "plan", label: "予定" },
  { id: "all", label: "やること" },
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
    const input = el("input", { class: "a4-input", type: "text", value: quest.nextAction, "aria-label": "次の一歩", placeholder: "例：ファイルを開くだけ", maxlength: 200 });
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
    return count === 0 ? null : el("a", { class: "a4-notice", href: "../relay-forge/" }, `あなたの判断待ちが ${count} 件あります`, el("span", { "aria-hidden": "true" }, " →"));
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
      : bucket === "decision" ? el("a", { class: "a4-link", href: "../relay-forge/" }, "確認する") : null;
    return el("li", { class: "a4-row", "data-bucket": bucket }, el("div", { class: "a4-row-main" }, checkButton(quest), rowText(quest), quick));
  }

  function stepList(quest: Quest): HTMLElement | null {
    const steps = children(quest);
    return steps.length === 0 ? null : el("ul", { class: "a4-steps", "aria-label": "小さなステップ" },
      ...steps.map(step => el("li", {}, checkButton(step), el("span", { "data-done": String(isDone(step)) }, step.title))));
  }

  /* ------------------------------ detail sheet ------------------------------ */

  function openSheet(quest: Quest): void {
    sheet?.close();
    const field = (label: string, control: HTMLElement, hint = "") => el("label", { class: "a4-field-row" }, el("span", { class: "a4-step-label" }, label), control, hint ? el("small", { class: "a4-muted" }, hint) : null);
    const title = el("input", { class: "a4-input", name: "title", value: quest.title, required: true, maxlength: 200 });
    const step = el("input", { class: "a4-input", name: "nextAction", value: quest.nextAction, placeholder: "例：ファイルを開くだけ", maxlength: 200 });
    const date = el("input", { class: "a4-input", type: "date", name: "scheduledDate", value: quest.scheduledDate });
    const time = el("input", { class: "a4-input", type: "time", name: "scheduledTime", value: quest.scheduledTime, step: 300 });
    const due = el("input", { class: "a4-input", type: "date", name: "dueDate", value: quest.dueDate });
    const notes = el("textarea", { class: "a4-input a4-textarea", name: "notes", rows: 4, maxlength: 4000 });
    notes.value = quest.notes;
    let estimate = quest.estimatedMinutes;
    const chips = el("div", { class: "a4-chips", role: "group", "aria-label": "目安の時間" }, ...ESTIMATES.map(minutes => {
      const chip = el("button", { type: "button", class: "a4-chip", "aria-pressed": String(estimate === minutes) }, `${minutes}分`);
      chip.addEventListener("click", () => {
        estimate = estimate === minutes ? 0 : minutes;
        for (const node of chips.children) node.setAttribute("aria-pressed", String(node === chip && estimate === minutes));
      });
      return chip;
    }));
    const form = el("form", { class: "a4-sheet-form", id: "a4-sheet-form" },
      field("やること", title),
      field("次の一歩", step, "小さくてOK。最初の1分でできること。"),
      el("div", { class: "a4-field-pair" }, field("日付", date), field("時刻", time)),
      el("div", { class: "a4-field-row" }, el("span", { class: "a4-step-label" }, "目安"), chips),
      field("締め切り", due),
      field("メモ", notes));

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
    repaintSheet = () => replaceChildren(steps, stepList(quest) ?? el("p", { class: "a4-muted" }, "大きいときは、ステップに分けると始めやすくなります。"));
    repaintSheet();

    const close = el("button", { type: "button", class: "a4-button" }, "閉じる");
    const dialog = el("dialog", { class: "a4-sheet", "aria-labelledby": "a4-sheet-title" },
      el("div", { class: "a4-sheet-head" }, el("h2", { id: "a4-sheet-title", class: "a4-subtitle" }, "詳しく"), close),
      quest.assignee.type !== "self" ? el("p", { class: "a4-muted" }, `担当：${quest.assignee.label || "Agent"}。担当の変更や受け渡しは詳しい画面で行います。`) : null,
      form,
      el("section", { class: "a4-group" }, el("h3", { class: "a4-step-label" }, "小さなステップ"), steps, mine ? stepForm : null),
      el("div", { class: "a4-actions a4-sheet-foot" },
        el("button", { type: "submit", class: "a4-button a4-primary", form: "a4-sheet-form" }, "保存"),
        mine ? button("今やる", () => { dialog.close(); focusId = quest.id; skipped.delete(quest.id); go("now"); }) : null,
        el("a", { class: "a4-link", href: "../relay-forge/" }, "詳しい画面で開く")));
    close.addEventListener("click", () => dialog.close());
    form.addEventListener("submit", event => {
      event.preventDefault();
      const current = byId(quest.id) ?? quest;
      const patch: Record<string, unknown> = {};
      const set = (key: keyof Quest, value: unknown) => { if (current[key] !== value) patch[key] = value; };
      set("title", title.value.trim() || current.title);
      set("nextAction", step.value.trim());
      set("notes", notes.value);
      set("estimatedMinutes", estimate);
      set("dueDate", due.value);
      // A time without a day lands on the day being looked at.
      const day = date.value || (time.value ? planDate : "");
      const at = day ? time.value : "";
      if (day !== current.scheduledDate || at !== current.scheduledTime) {
        Object.assign(patch, { scheduledDate: day, scheduledTime: at, planningState: day ? "scheduled" : "backlog", ...(day ? {} : { planningMode: "on_date" }) });
      }
      dialog.close();
      if (Object.keys(patch).length > 0) update(current, { ...patch, expectedUpdatedAt: current.updatedAt }, "保存しました");
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
      const tab = el("a", { class: "a4-tab", href: `#${item.id}`, "aria-current": view === item.id ? "page" : null, "data-view": item.id }, item.label);
      tab.addEventListener("click", event => { event.preventDefault(); go(item.id); });
      return tab;
    }));
    root.querySelector(".a4-app")?.setAttribute("data-busy", String(busy));
    main.setAttribute("data-view", view);
    replaceChildren(main, view === "now" ? nowView() : view === "plan" ? planView() : view === "all" ? allView() : settingsView());
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
  };
}

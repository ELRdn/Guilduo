import type { Quest } from "../../../types/questforge.ts";
import { addDays, calendarItems, clockTime, entrySeconds, localDate, splitEntryDays, timeTotals, wallClockInstant, type NoteRecord, type ProductivityData, type RecordPage, type TimeEntry, type TimeSource } from "../../../shared/productivity.ts";
import { getLocale } from "../../../i18n.ts";
import type { RelayForgeRuntime } from "../production.ts";
import { workText as w } from "../productivity-copy.ts";
import { el, replaceChildren } from "../primitives/dom.ts";
import { segmentControl, screenHeader } from "./runtime.ts";
import { calendarSelection } from "./calendar-selection.ts";

type RecordInput = Record<string, unknown>;
type Pending = { path: string; input: RecordInput; method: string; done?: (result: RecordInput) => void };
function record(value: unknown): value is RecordInput { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function validNote(value: unknown): value is NoteRecord { return record(value) && ["id", "title", "body", "questId", "updatedAt"].every(k => typeof value[k] === "string") && Boolean(value.id) && Boolean(String(value.title).trim()) && Number.isFinite(Date.parse(value.updatedAt as string)) && typeof value.archived === "boolean"; }
function validEntry(value: unknown): value is TimeEntry { return record(value) && ["id", "questId", "note", "startAt", "stopAt", "updatedAt"].every(k => typeof value[k] === "string") && Boolean(value.id) && Boolean(value.questId) && Number.isFinite(Date.parse(value.updatedAt as string)) && typeof value.archived === "boolean" && Number.isFinite(Date.parse(value.startAt as string)) && (!value.stopAt || Number.isFinite(Date.parse(value.stopAt as string))); }

export function productivityWorkspace(options: {
  port: RelayForgeRuntime["productivityPort"]; quests: () => readonly Quest[]; held: () => boolean;
  refresh: () => void; navigate: (screen: "calendar" | "notes" | "quests", id?: string) => void;
  schedule: (questId: string, date: string, time: string, minutes: number) => void;
}) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  let data: ProductivityData = { revision: 0, notes: [], entries: [], preferences: { timeSource: "native", timezone: zone, updatedAt: "" } };
  let disposed = false, loading = false, loaded = false, busy = false, failed = false, message = () => "", pending: Pending | null = null;
  let draft: NoteRecord | null = null, original: NoteRecord | null = null, mobileEditor = false, includeArchived = false;
  let calendarMode = "month", calendarDate = localDate(), calendarSelected = "", query = "", historyOpen = false;
  let selecting = false;
  let selections: (() => void)[] = [];
  let entryDraft: TimeEntry | null = null, timerQuest = "", timerHost: HTMLElement | null = null, modal: HTMLDialogElement | null = null;
  let preferenceDraft: { timeSource: TimeSource; timezone: string; expectedUpdatedAt: string } | null = null;
  const dirty = () => draft !== null && JSON.stringify(draft) !== JSON.stringify(original);
  const held = () => !options.port || options.held() || busy || failed || !loaded || pending !== null || !navigator.onLine;
  const refresh = () => { if (!disposed && !selecting) options.refresh(); };
  const current = () => data.entries.find(e => !e.stopAt && !e.archived) ?? null;
  const timezone = () => data.preferences.timezone || zone;
  const minutes = (value: number) => `${new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 1 }).format(value)} ${w("minutes")}`;
  const button = (label: string, action: () => void, disabled = false) => { const node = el("button", { type: "button", class: "rf-secondary-button", disabled }, label); node.addEventListener("click", action); return node; };
  const field = (label: string, input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => el("label", { class: "rf-work-field" }, el("span", {}, label), input);
  const questSelect = (value: string, change: (value: string) => void, optional = true, activeOnly = false) => {
    const select = el("select", { "aria-label": w("quest") }, el("option", { value: "" }, optional ? "—" : w("quest")), ...options.quests().filter(q => !activeOnly || (q.lifecycleState === "active" && q.kind !== "reward")).map(q => el("option", { value: q.id, selected: q.id === value }, q.title)));
    select.value = value; select.addEventListener("change", () => change(select.value)); return select;
  };
  function errorText(error: unknown): string {
    const code = (error as { code?: string })?.code;
    if (code === "productivity_capacity") return w("capacity");
    return `${w("error")}${code ? ` (${code})` : ""}`;
  }
  function openModal(title: string, content: HTMLElement, actions: HTMLElement[]): void {
    if (modal?.open) return;
    const active = document.activeElement;
    const dialog = el("dialog", { class: "rf-work-dialog", "aria-labelledby": "rf-work-dialog-title" }, el("h2", { id: "rf-work-dialog-title" }, title), content, el("div", { class: "rf-work-toolbar" }, ...actions));
    modal = dialog;
    dialog.addEventListener("close", () => { dialog.remove(); if (modal === dialog) { modal = null; if (active instanceof HTMLElement && active.isConnected) active.focus(); } });
    document.body.append(dialog); dialog.showModal();
  }
  function guard(action: () => void): void {
    if (!dirty()) { action(); return; }
    openModal(w("unsaved"), el("p", {}, draft?.title ?? ""), [
      button(w("save"), () => { void saveNote(() => { modal?.close(); action(); }); }, held()),
      button(w("discard"), () => { draft = original ? { ...original } : null; modal?.close(); action(); }),
      button(w("cancel"), () => modal?.close()),
    ]);
  }
  function confirmAction(title: string, action: () => void): void {
    openModal(title, el("p", {}, title), [button(w("confirm"), () => { modal?.close(); action(); }, held()), button(w("cancel"), () => modal?.close())]);
  }
  async function pages<T>(path: string, validator: (value: unknown) => value is T): Promise<{ items: T[]; revision: number }> {
    const items: T[] = []; let cursor: string | null = null, revision: number | null = null;
    do {
      const result: RecordPage<T> = await options.port!.productivity<RecordPage<T>>(`${path}?archived=true&limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}&revision=${revision}` : ""}`);
      if (!result || !Array.isArray(result.items) || !result.items.every(validator) || !Number.isInteger(result.revision) || !(result.nextCursor === null || typeof result.nextCursor === "string")) throw new Error("Invalid productivity page");
      if (revision !== null && revision !== result.revision) throw new Error("Changed productivity page");
      items.push(...result.items); revision = result.revision;
      if (result.nextCursor === cursor && cursor) throw new Error("Repeated cursor"); cursor = result.nextCursor;
    } while (cursor);
    return { items, revision: revision! };
  }
  async function load(): Promise<void> {
    if (disposed || loading || busy || selecting || !options.port) return;
    loading = true;
    try {
      let snapshot: ProductivityData | null = null;
      for (let attempt = 0; attempt < 3 && !snapshot; attempt++) {
        const [notes, entries, prefs] = await Promise.all([pages("/notes", validNote), pages("/entries", validEntry), options.port.productivity<{ preferences: ProductivityData["preferences"]; revision: number }>("/preferences")]);
        if (!prefs?.preferences || !["native", "toggl", "separate"].includes(prefs.preferences.timeSource) || typeof prefs.preferences.updatedAt !== "string" || typeof prefs.preferences.timezone !== "string") throw new Error("Invalid preferences");
        if (notes.revision === entries.revision && notes.revision === prefs.revision) snapshot = { revision: prefs.revision, notes: notes.items, entries: entries.items, preferences: prefs.preferences };
      }
      if (!snapshot) throw new Error("Workspace changed during read");
      if (disposed) return;
      if (calendarDate === localDate(new Date(), timezone())) calendarDate = localDate(new Date(), snapshot.preferences.timezone || zone);
      data = snapshot; loaded = true; failed = false;
      if (original && !dirty()) { original = data.notes.find(n => n.id === original?.id) ?? null; draft = original ? { ...original } : null; }
    } catch (error) { if (!disposed) { failed = true; message = () => errorText(error); } }
    finally { loading = false; refresh(); }
  }
  async function perform(operation: Pending): Promise<boolean> {
    if (!options.port || busy || disposed || !navigator.onLine || options.held()) return false;
    busy = true; message = () => ""; refresh();
    let success = false;
    try {
      let result: RecordInput;
      if (pending === operation) {
        const receipt = await options.port.productivity<{ result: RecordInput | null }>(`/operations/${operation.input.operationId}`);
        result = receipt.result ?? await options.port.productivity<RecordInput>(operation.path, operation.input, operation.method);
      } else result = await options.port.productivity<RecordInput>(operation.path, operation.input, operation.method);
      const verified = record(result) && (operation.path.startsWith("/notes") ? validNote(result.note) : operation.path.startsWith("/entries") ? validEntry(result.entry) : operation.path === "/timer/start" ? validEntry(result.current) : operation.path === "/timer/stop" ? result.current === null && validEntry(result.entry) && Boolean(result.entry.stopAt) : operation.path === "/preferences" ? record(result.preferences) && ["native", "toggl", "separate"].includes(String(result.preferences.timeSource)) && Number.isFinite(Date.parse(String(result.preferences.updatedAt))) : operation.path === "/import" ? result.restored === true : operation.path === "" && result.deleted === true);
      if (!verified) throw new Error("Unverified save");
      if (disposed) return false;
      pending = null; operation.done?.(result); message = () => w("saved"); success = true;
    } catch (error) {
      if (disposed) return false;
      message = () => errorText(error);
      const status = (error as { status?: number }).status;
      if (!status || status === 408 || status >= 500) pending = operation;
      else pending = null;
    } finally { busy = false; }
    if (!disposed) { await load(); refresh(); const feedback = modal?.querySelector("[data-work-modal-status]"); if (feedback) replaceChildren(feedback, status()); } return success;
  }
  function write(path: string, input: RecordInput, method = "POST", done?: Pending["done"]): Promise<boolean> {
    if (held()) return Promise.resolve(false);
    return perform({ path, input: { ...input, operationId: crypto.randomUUID() }, method, done });
  }
  function status(): HTMLElement {
    const feedback = message(), error = feedback !== "" && feedback !== w("saved");
    const actions = pending ? [button(w("retry"), () => { if (pending) void perform(pending); }, busy || options.held() || !navigator.onLine)] : [button(w("retry"), () => { message = () => ""; void load(); }, loading || busy)];
    return el("div", { class: "rf-work-status", role: failed || pending || error ? "alert" : "status" }, feedback || (!options.port ? w("unavailable") : loading ? "…" : ""), ...(options.port && (error || !loaded) ? actions : []));
  }
  async function saveNote(after?: () => void): Promise<void> {
    if (!draft) return;
    const input = { title: draft.title, body: draft.body, questId: draft.questId, ...(original?.id ? { expectedUpdatedAt: original.updatedAt } : {}) };
    await write(original?.id ? `/notes/${encodeURIComponent(original.id)}` : "/notes", input, original?.id ? "PATCH" : "POST", result => {
      const unchanged = draft?.title === input.title && draft?.body === input.body && draft?.questId === input.questId;
      const latest = draft;
      original = result.note as NoteRecord;
      draft = unchanged || !latest ? { ...original } : { ...original, title: latest.title, body: latest.body, questId: latest.questId };
      if (unchanged) after?.();
    });
  }
  function chooseNote(note: NoteRecord | null): void {
    guard(() => { original = note; draft = note ? { ...note } : { id: "", title: "", body: "", questId: "", archived: false, updatedAt: "" }; mobileEditor = true; refresh();
      window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-work-focus="note-title"]')?.focus()); });
  }
  function notesScreen(): HTMLElement {
    const list = el("div", { class: "rf-work-note-list" }, button(`${w("add")} ${w("notes")}`, () => chooseNote(null), held()), ...data.notes.filter(n => includeArchived || !n.archived).map(n => button(`${n.archived ? `[${w("archive")}] ` : ""}${n.title}`, () => chooseNote(n))));
    const checkbox = el("input", { type: "checkbox", checked: includeArchived }); checkbox.addEventListener("change", () => { includeArchived = checkbox.checked; refresh(); }); list.prepend(field(w("archived"), checkbox));
    const editor = el("div", { class: "rf-work-note-editor" });
    if (draft) {
      const title = el("input", { value: draft.title, maxlength: 120, required: true, "data-work-focus": "note-title" }); title.addEventListener("input", () => { draft!.title = title.value; });
      const body = el("textarea", { rows: 18, maxlength: 50000, "data-work-focus": "note-body" }, draft.body); body.addEventListener("input", () => { draft!.body = body.value; });
      editor.append(button(w("list"), () => guard(() => { mobileEditor = false; refresh(); })), field(w("title"), title), field(w("body"), body), field(w("quest"), questSelect(draft.questId, value => { draft!.questId = value; })), el("div", { class: "rf-work-toolbar" }, button(w("save"), () => { void saveNote(); }, held()), button(w("discard"), () => { draft = original ? { ...original } : null; refresh(); }, busy || pending !== null), ...(original ? [button(w(original.archived ? "restore" : "archive"), () => guard(() => { void write(`/notes/${original!.id}`, { archived: !original!.archived, expectedUpdatedAt: original!.updatedAt }, "PATCH", result => { original = result.note as NoteRecord; draft = { ...original }; }); }), held())] : [])));
    } else editor.append(el("p", {}, w("empty")));
    return el("section", { class: "rf-screen rf-work-screen" }, screenHeader({ title: w("notes"), question: "" }), status(), el("div", { class: "rf-work-notes", "data-editor": String(mobileEditor) }, list, editor));
  }
  function calendarScreen(): HTMLElement {
    const mobile = window.matchMedia("(max-width:900px)").matches;
    const today = localDate(new Date(), timezone());
    const first = calendarMode === "month" ? `${calendarDate.slice(0, 7)}-01` : calendarDate;
    const from = calendarMode === "day" ? first : addDays(first, -new Date(`${first}T12:00:00Z`).getUTCDay());
    const count = calendarMode === "month" ? 42 : calendarMode === "day" ? 1 : 7, to = addDays(from, count - 1);
    if (calendarSelected < from || calendarSelected > to) calendarSelected = today >= from && today <= to ? today : from;
    const events = calendarItems(options.quests(), data.entries, from, to, timezone()).filter(item => item.title.toLowerCase().includes(query.toLowerCase()));
    const search = el("input", { type: "search", value: query, placeholder: w("search"), "aria-label": w("search"), "data-work-focus": "calendar-search" }); search.addEventListener("input", () => { query = search.value; refresh(); });
    const navigateDate = (direction: number) => { if (calendarMode !== "month") calendarDate = addDays(calendarDate, direction * (calendarMode === "day" ? 1 : 7)); else { const at = new Date(`${calendarDate.slice(0, 7)}-01T12:00:00Z`); at.setUTCMonth(at.getUTCMonth() + direction); calendarDate = at.toISOString().slice(0, 10); } refresh(); };
    const eventButton = (item: (typeof events)[number]) => {
      const node = button(`${w(item.kind)} · ${item.time || "—"} ${item.title}${item.minutes > 0 || item.kind === "recorded" ? ` · ${minutes(item.minutes)}` : ""}`, () => {
        if (item.entryId) { historyOpen = true; entryDraft = { ...data.entries.find(e => e.id === item.entryId)! }; openHistory(); } else options.navigate("quests", item.questId);
      }); node.classList.add("rf-work-event"); node.dataset.kind = item.kind;
      if (calendarMode !== "month" && item.time && item.minutes > 0) { node.classList.add("rf-work-timed-event"); const [hour, minute] = item.time.split(":").map(Number); const start = hour! * 60 + minute!; node.style.top = `${start / 1440 * 100}%`; node.style.height = `${Math.max(28, Math.min(item.minutes, 1440 - start) / 1440 * 720)}px`; }
      return node;
    };
    const days = Array.from({ length: count }, (_, i) => {
      const date = addDays(from, i), dayItems = events.filter(item => item.date === date);
      if (mobile && calendarMode === "month") {
        const choose = button(`${Number(date.slice(-2))}${dayItems.length ? ` · ${dayItems.length}` : ""}`, () => { calendarSelected = date; refresh(); });
        choose.setAttribute("aria-label", `${date} (${dayItems.length})`); choose.setAttribute("aria-pressed", String(date === calendarSelected));
        return el("section", { class: "rf-work-calendar-day rf-work-compact-day", "data-today": String(date === today) }, choose);
      }
      const day = el("section", { class: "rf-work-calendar-day", "data-today": String(date === today), "aria-label": date }, el("h2", {}, new Intl.DateTimeFormat(getLocale(), { timeZone: "UTC", month: "short", day: "numeric", weekday: "short" }).format(new Date(`${date}T12:00:00Z`))));
      if (calendarMode === "month") { day.append(...dayItems.map(eventButton)); return day; }
      const showClock = calendarMode === "day" || mobile || i === 0;
      const axis = el("div", { class: "rf-work-hours", "data-clock": String(showClock) }, ...Array.from({ length: 24 }, (_, hour) => el("span", { style: `top:${hour / 24 * 100}%`, class: "rf-work-hour", "aria-hidden": "true" }, `${hour}:00`)));
      const timed = dayItems.filter(item => item.time && item.minutes > 0);
      // Equal lanes keep overlapping events selectable without hiding the time axis.
      const ends: number[] = [], lanes = timed.map(item => { const [h, m] = item.time.split(":").map(Number); const start = h! * 60 + m!; let lane = ends.findIndex(end => end <= start); if (lane < 0) lane = ends.length; ends[lane] = start + item.minutes; return lane; });
      timed.forEach((item, i) => { const node = eventButton(item), gutter = showClock ? 44 : 4; node.title = node.textContent!; node.setAttribute("aria-label", node.textContent!); node.textContent = `${w(item.kind)} · ${item.title}`; node.style.left = `calc(${gutter}px + (100% - ${gutter + 4}px) * ${lanes[i]! / ends.length})`; node.style.width = `calc((100% - ${gutter + 4}px) / ${ends.length})`; axis.append(node); });
      if (!mobile || calendarMode === "day" || date === calendarSelected) selections.push(calendarSelection(axis, { label: `${date} · ${w("selectTime")}`, busy: active => { selecting = active; }, select: (start, end) => selectRange(date, start, end) }));
      day.append(el("div", { class: "rf-work-all-day" }, ...dayItems.filter(item => !item.time || item.minutes === 0).map(eventButton)), axis); return day;
    });
    const daySelector = mobile && calendarMode !== "day" ? calendarMode === "week" ? el("div", { class: "rf-work-day-selector" }, ...Array.from({ length: 7 }, (_, i) => { const date = addDays(from, i); const choose = button(String(Number(date.slice(-2))), () => { calendarSelected = date; refresh(); }); choose.setAttribute("aria-label", date); choose.setAttribute("aria-pressed", String(date === calendarSelected)); return choose; })) : el("div", { class: "rf-work-day-selector" }, ...Array.from({ length: 7 }, (_, i) => el("span", {}, new Intl.DateTimeFormat(getLocale(), { timeZone: "UTC", weekday: "narrow" }).format(new Date(`${addDays(from, i)}T12:00:00Z`))))) : null;
    const agenda = mobile && calendarMode === "month" ? el("section", { class: "rf-work-day-agenda" }, el("h2", {}, calendarSelected), ...events.filter(item => item.date === calendarSelected).map(eventButton)) : null;
    return el("section", { class: "rf-screen rf-work-screen" }, screenHeader({ title: w("calendar"), question: `${from} — ${to} · ${timezone()}` }), status(), el("div", { class: "rf-work-toolbar" }, segmentControl(w("view"), ["month", "week", "day"].map(id => ({ id, label: w(id as "month" | "week" | "day") })), calendarMode, id => { calendarMode = id; if (id === "day") calendarDate = calendarSelected; refresh(); }), button(w("previous"), () => navigateDate(-1)), button(w("today"), () => { calendarDate = today; calendarSelected = today; refresh(); }), button(w("next"), () => navigateDate(1)), search), ...(calendarMode !== "month" ? [el("p", { class: "rf-work-selection-hint" }, w("selectionHint"))] : events.length === 0 ? [el("p", { class: "rf-work-selection-hint" }, w("empty"), " ", button(w("week"), () => { calendarMode = "week"; calendarDate = calendarSelected; refresh(); }))] : []), daySelector, el("div", { class: "rf-work-calendar", "data-mode": calendarMode }, ...(mobile && calendarMode === "week" ? [days[Math.floor((Date.parse(calendarSelected) - Date.parse(from)) / 86400000)]!] : days)), agenda, el("h2", {}, w("unscheduled")), ...options.quests().filter(q => q.lifecycleState === "active" && !q.scheduledDate && !q.dueDate && q.title.toLowerCase().includes(query.toLowerCase())).map(q => button(q.title, () => options.navigate("quests", q.id))));
  }
  function selectRange(date: string, from: number, to: number): void {
    if (held()) return;
    let startAt: string, stopAt: string;
    try { startAt = wallClockInstant(date, from, timezone()); stopAt = wallClockInstant(date, to, timezone()); }
    catch { message = () => w("invalidTime"); refresh(); return; }
    const future = Date.parse(stopAt) > Date.now();
    let questId = timerQuest || options.quests().find(q => q.lifecycleState === "active" && q.kind !== "reward" && !q.humanRequest)?.id || "";
    const kind = el("select", {}, el("option", { value: "recorded", selected: !future, disabled: future }, w("recorded")), el("option", { value: "schedule", selected: future }, w("schedule")));
    openModal(`${date} · ${clockTime(from)} — ${clockTime(to)}`, el("div", { class: "rf-work-history" }, field(w("view"), kind), field(w("quest"), questSelect(questId, value => { questId = value; }, false, true)), el("p", {}, timezone())), [
      button(w("confirm"), () => {
        if (!questId) return;
        if (kind.value === "schedule") { modal?.close(); options.schedule(questId, date, clockTime(from), to - from); }
        else { entryDraft = { id: "", questId, note: "", startAt, stopAt, archived: false, updatedAt: "" }; modal?.close(); openHistory(); }
      }), button(w("cancel"), () => modal?.close()),
    ]);
  }
  function dateInput(value: string, change: (value: string) => void): HTMLInputElement {
    const date = value ? new Date(value) : new Date(); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const node = el("input", { type: "datetime-local", value: local, required: true }); node.addEventListener("change", () => {
      node.setCustomValidity(""); if (!node.value) return;
      const at = new Date(node.value), normalized = new Date(at.getTime() - at.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      if (normalized !== node.value) { node.setCustomValidity(w("invalidTime")); node.reportValidity(); return; }
      change(at.toISOString());
    }); return node;
  }
  function openHistory(): void {
    if (modal?.open) return;
    const body = el("div", { class: "rf-work-history" });
    if (entryDraft) {
      const edit = entryDraft;
      const note = el("input", { value: edit.note, maxlength: 1000 }); note.addEventListener("input", () => { edit.note = note.value; });
      body.append(el("div", { "data-work-modal-status": "true" }, status()), field(w("quest"), questSelect(edit.questId, value => { edit.questId = value; }, false)), field(`${w("from")} (${zone})`, dateInput(edit.startAt, value => { edit.startAt = value; })), field(`${w("to")} (${zone})`, dateInput(edit.stopAt, value => { edit.stopAt = value; })), field(w("body"), note), button(w("save"), () => {
        if (![...body.querySelectorAll<HTMLInputElement>("input")].every(input => input.reportValidity())) return;
        void write(edit.id ? `/entries/${edit.id}` : "/entries", { questId: edit.questId, startAt: edit.startAt, stopAt: edit.stopAt, note: edit.note, ...(edit.id ? { expectedUpdatedAt: edit.updatedAt } : {}) }, edit.id ? "PATCH" : "POST", () => { entryDraft = null; modal?.close(); });
      }, held()), ...(edit.id ? [button(w(edit.archived ? "restore" : "archive"), () => { void write(`/entries/${edit.id}`, { archived: !edit.archived, expectedUpdatedAt: edit.updatedAt }, "PATCH", () => { entryDraft = null; modal?.close(); }); }, held())] : []));
    } else {
      const daily: Record<string, number> = {};
      for (const entry of data.entries) for (const [day, value] of Object.entries(splitEntryDays(entry, timezone()))) daily[day] = (daily[day] ?? 0) + value;
      const today = localDate(new Date(), timezone()), weekStart = addDays(today, -new Date(`${today}T12:00:00Z`).getUTCDay());
      body.append(el("p", {}, `${w("today")}: ${minutes(daily[today] ?? 0)} · ${w("week")}: ${minutes(Object.entries(daily).filter(([day]) => day >= weekStart && day <= today).reduce((sum, [, value]) => sum + value, 0))}`),
        button(w("add"), () => { entryDraft = { id: "", questId: timerQuest || options.quests().find(q => q.kind !== "reward")?.id || "", note: "", startAt: new Date(Date.now() - 3600000).toISOString(), stopAt: new Date().toISOString(), archived: false, updatedAt: "" }; modal?.close(); openHistory(); }, held()));
      for (const quest of options.quests()) { const totals = timeTotals(quest, data.entries, data.preferences.timeSource); if (totals.nativePresent || totals.togglPresent) body.append(el("p", {}, `${quest.title}: ${totals.selectedMinutes === null ? `Guilduo: ${totals.nativePresent ? minutes(totals.native) : "—"} · Toggl: ${totals.togglPresent ? minutes(totals.toggl) : "—"}` : minutes(totals.selectedMinutes)}`)); }
      for (const entry of [...data.entries].sort((a, b) => b.startAt.localeCompare(a.startAt))) body.append(button(`${entry.archived ? `[${w("archive")}] ` : ""}${options.quests().find(q => q.id === entry.questId)?.title ?? entry.questId} · ${new Date(entry.startAt).toLocaleString(getLocale(), { timeZone: timezone() })} · ${minutes(entrySeconds(entry) / 60)}${entry.stopAt ? "" : ` (${w("provisional")})`}`, () => { entryDraft = { ...entry }; modal?.close(); openHistory(); }, !entry.stopAt));
    }
    openModal(w("history"), body, [button(w("cancel"), () => { entryDraft = null; modal?.close(); historyOpen = false; })]);
  }
  function renderTimer(): HTMLElement {
    // Without a storage port the timer can never run; keep the shell free of a dead bar.
    if (!options.port) return el("section", { class: "rf-work-timer", hidden: true });
    const running = current();
    const selector = questSelect(timerQuest || running?.questId || "", value => { timerQuest = value; renderTimerHost(); }, false, true); selector.disabled = held();
    const action = button(w(running ? (timerQuest && timerQuest !== running.questId ? "switch" : "stop") : "start"), () => {
      const switchTo = running && timerQuest && timerQuest !== running.questId;
      const apply = () => { void write(running && !switchTo ? "/timer/stop" : "/timer/start", { questId: timerQuest || running?.questId, expectedEntryId: running?.id ?? "", ...(running ? { expectedUpdatedAt: running.updatedAt } : {}) }); };
      if (switchTo) confirmAction(w("switch"), apply); else apply();
    }, held() || (!running && !timerQuest));
    const elapsed = el("span", { "data-work-elapsed": "true", class: "rf-work-elapsed", hidden: !running }, elapsedText());
    return el("section", { class: "rf-work-timer", "aria-label": w("time"), "data-running": running ? "true" : "false" }, selector, elapsed, action, button(w("history"), () => { entryDraft = null; historyOpen = true; openHistory(); }, !loaded), ...(message() || !loaded ? [status()] : []));
  }
  function elapsedText(): string { const running = current(); if (!running) return "00:00:00"; const seconds = Math.floor(entrySeconds(running)); return `${w("provisional")} ${[Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, "0")).join(":")}`; }
  function renderTimerHost(): void { if (timerHost && !disposed) replaceChildren(timerHost, renderTimer()); }
  function settings(): HTMLElement {
    const preference = preferenceDraft ?? { timeSource: data.preferences.timeSource, timezone: timezone(), expectedUpdatedAt: data.preferences.updatedAt };
    const source = el("select", { "data-work-focus": "time-source" }, ...(["native", "toggl", "separate"] as TimeSource[]).map(id => el("option", { value: id, selected: preference.timeSource === id }, w(id))));
    const tz = el("input", { value: preference.timezone, maxlength: 80, "data-work-focus": "timezone" });
    source.addEventListener("change", () => { preferenceDraft = { ...preference, timeSource: source.value as TimeSource, timezone: tz.value }; });
    tz.addEventListener("input", () => { preferenceDraft = { ...preference, timeSource: source.value as TimeSource, timezone: tz.value }; });
    source.disabled = held(); tz.disabled = held();
    const restore = el("input", { type: "file", accept: ".json,application/json", "aria-label": w("import"), disabled: held() });
    restore.addEventListener("change", () => {
      const file = restore.files?.[0]; if (!file) return;
      if (file.size > 1100000) { message = () => w("capacity"); refresh(); return; }
      void file.text().then(content => { const backup: unknown = JSON.parse(content); restore.value = ""; confirmAction(w("import"), () => { void write("/import", { expectedRevision: data.revision, backup }); }); }).catch(error => { message = () => errorText(error); refresh(); });
    });
    return el("section", { class: "rf-screen-region rf-work-settings", "aria-label": w("time") }, el("h2", {}, w("time")), status(), field(w("source"), source), field(w("timezone"), tz), button(w("save"), () => { void write("/preferences", { timeSource: source.value, timezone: tz.value, expectedUpdatedAt: preference.expectedUpdatedAt }, "PUT", () => { preferenceDraft = null; }); }, held()),
      button(w("export"), () => { void options.port?.productivity<RecordInput>("/export").then(backup => { if (disposed || !backup || backup.format !== "guilduo-productivity") return; const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" })); const link = el("a", { href: url, download: `guilduo-work-${localDate()}.json` }); link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }).catch(error => { message = () => errorText(error); refresh(); }); }, !loaded || busy), field(w("import"), restore),
      button(w("delete"), () => confirmAction(w("delete"), () => { void write("", { expectedRevision: data.revision, confirm: "delete-productivity" }, "DELETE", () => { original = null; draft = null; }); }), held()));
  }
  const tick = window.setInterval(() => { if (disposed) return; const elapsed = timerHost?.querySelector("[data-work-elapsed]"); if (elapsed) elapsed.textContent = elapsedText(); }, 1000);
  const poll = window.setInterval(() => { if (!dirty() && !modal?.open && document.visibilityState !== "hidden") void load(); }, 30000);
  const resume = () => { renderTimerHost(); if (!dirty() && !modal?.open && !busy) void load(); };
  const timerSize = new ResizeObserver(() => { if (timerHost) document.documentElement.style.setProperty("--work-timer-height", `${timerHost.getBoundingClientRect().height}px`); });
  const unload = (event: BeforeUnloadEvent) => { if (dirty() || busy || pending) { event.preventDefault(); event.returnValue = ""; } };
  window.addEventListener("beforeunload", unload); window.addEventListener("online", resume); window.addEventListener("offline", renderTimerHost); window.addEventListener("focus", resume);
  return {
    guard, dirty, busy: () => busy || pending !== null || selecting || Boolean(modal?.open), load,
    clearCalendar() { const previous = selections; selections = []; previous.forEach(dispose => dispose()); },
    attachTimer(host: HTMLElement) { timerHost = host; timerSize.observe(host); renderTimerHost(); },
    renderTimer: renderTimerHost,
    screen: (id: "calendar" | "notes") => ({ main: id === "calendar" ? calendarScreen() : notesScreen() }), settings,
    relatedNotes(questId: string): HTMLElement { return el("div", {}, ...data.notes.filter(n => !n.archived && n.questId === questId).map(n => button(n.title, () => guard(() => { original = n; draft = { ...n }; mobileEditor = true; options.navigate("notes"); })))); },
    totals(quest: Quest): string { if (!loaded) return "—"; const value = timeTotals(quest, data.entries, data.preferences.timeSource); return value.selectedMinutes === null ? `Guilduo: ${value.nativePresent ? minutes(value.native) : "—"} · Toggl: ${value.togglPresent ? minutes(value.toggl) : "—"}` : minutes(value.selectedMinutes); },
    preserveFocus() {
      const node = document.activeElement; if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) || !node.dataset.workFocus) return () => {};
      const key = node.dataset.workFocus, start = node.selectionStart, end = node.selectionEnd;
      return () => { const target = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-work-focus="${key}"]`); target?.focus({ preventScroll: true }); if (target && start !== null && end !== null) target.setSelectionRange(start, end); };
    },
    dispose() { disposed = true; selections.forEach(dispose => dispose()); selections = []; timerSize.disconnect(); document.documentElement.style.removeProperty("--work-timer-height"); window.clearInterval(tick); window.clearInterval(poll); window.removeEventListener("beforeunload", unload); window.removeEventListener("online", resume); window.removeEventListener("offline", renderTimerHost); window.removeEventListener("focus", resume); modal?.close(); modal?.remove(); timerHost = null; },
  };
}

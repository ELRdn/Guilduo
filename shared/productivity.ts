import type { Quest } from "../types/questforge.ts";
import { nextDueDateForTask } from "../questforge-core.ts";

export type TimeSource = "native" | "toggl" | "separate";
export interface NoteRecord { id: string; title: string; body: string; questId: string; archived: boolean; updatedAt: string; }
export interface TimeEntry { id: string; questId: string; note: string; startAt: string; stopAt: string; archived: boolean; updatedAt: string; }
export interface WorkPreferences { timeSource: TimeSource; timezone: string; updatedAt: string; }
export interface ProductivityData { revision: number; notes: NoteRecord[]; entries: TimeEntry[]; preferences: WorkPreferences; }
export interface RecordPage<T> { items: T[]; nextCursor: string | null; revision: number; }

export function localDate(at = new Date(), timezone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function addDays(date: string, count: number): string {
  const at = new Date(`${date}T12:00:00Z`); at.setUTCDate(at.getUTCDate() + count); return at.toISOString().slice(0, 10);
}
export function snapTimeRange(start: number, end: number): { from: number; to: number } {
  const first = Math.max(0, Math.min(1425, Math.floor(Math.min(start, end) / 15) * 15));
  const last = Math.max(first + 15, Math.min(1440, Math.ceil(Math.max(start, end) / 15) * 15));
  return { from: first, to: last };
}
export function clockTime(minutes: number): string { return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; }
/** shortcut: repeated wall times choose the earlier offset; add offset selection for DST-fold editing. */
export function wallClockInstant(date: string, minutes: number, timezone: string): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) throw new RangeError("Invalid minutes");
  const day = minutes === 1440 ? addDays(date, 1) : date, time = clockTime(minutes % 1440), wanted = `${day}T${time}`;
  const base = Date.parse(`${wanted}:00Z`);
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const wall = (at: number) => { const parts = formatter.formatToParts(new Date(at)); const p = (key: string) => parts.find(v => v.type === key)!.value; return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}`; };
  const offsets = new Set([-36, 0, 36].map(hours => { const at = base + hours * 3600000; return Date.parse(`${wall(at)}:00Z`) - at; }));
  const candidates = [...offsets].map(offset => base - offset).filter(at => wall(at) === wanted).sort((a, b) => a - b);
  if (!candidates.length) throw new RangeError("Nonexistent local time");
  return new Date(candidates[0]!).toISOString();
}
export function entrySeconds(entry: TimeEntry, now = Date.now()): number {
  return Math.max(0, ((entry.stopAt ? Date.parse(entry.stopAt) : now) - Date.parse(entry.startAt)) / 1000);
}
export function timeTotals(quest: Quest, entries: readonly TimeEntry[], source: TimeSource) {
  const nativeEntries = entries.filter(e => e.questId === quest.id && !e.archived && e.stopAt);
  const native = (quest.manualActualMinutes ?? 0) + nativeEntries.reduce((sum, e) => sum + entrySeconds(e) / 60, 0);
  const nativePresent = nativeEntries.length > 0 || (quest.manualActualMinutes ?? 0) > 0;
  const toggl = quest.togglActualMinutes ?? 0;
  const togglPresent = toggl > 0 || quest.externalLinks.some(link => ["toggl-track", "toggl-focus"].includes(link.service) && (link.type === "time_entry" || link.sourceType.endsWith("time_entry")));
  const chosen = source === "separate" ? null : source === "native" ? (nativePresent ? native : togglPresent ? toggl : null) : (togglPresent ? toggl : nativePresent ? native : null);
  return { native, nativePresent, toggl, togglPresent, selectedMinutes: chosen };
}

/** Split by local midnight via a binary search; a DST day is not assumed to be 24 hours. */
export function splitEntryDays(entry: TimeEntry, timezone: string): Record<string, number> {
  const result: Record<string, number> = {};
  if (!entry.stopAt || entry.archived) return result;
  let start = Date.parse(entry.startAt); const end = Date.parse(entry.stopAt);
  while (start < end) {
    const day = localDate(new Date(start), timezone);
    let stop = end;
    if (localDate(new Date(end - 1), timezone) !== day) {
      let lo = start, hi = Math.min(end, start + 27 * 3600000);
      while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (localDate(new Date(mid), timezone) === day) lo = mid; else hi = mid; }
      stop = hi;
    }
    result[day] = (result[day] ?? 0) + (stop - start) / 60000; start = stop;
  }
  return result;
}

export interface CalendarItem { id: string; questId: string; entryId?: string; date: string; time: string; minutes: number; kind: "schedule" | "deadline" | "recorded"; title: string; }
export function calendarItems(quests: readonly Quest[], entries: readonly TimeEntry[], from: string, to: string, timezone: string): CalendarItem[] {
  const items: CalendarItem[] = [];
  for (const quest of quests) {
    if (quest.lifecycleState === "archived" || quest.kind === "reward") continue;
    if (quest.dueDate >= from && quest.dueDate <= to) items.push({ id: `${quest.id}:due`, questId: quest.id, date: quest.dueDate, time: "", minutes: 0, kind: "deadline", title: quest.title });
    if (quest.planningState !== "scheduled") continue;
    const scheduled = quest.scheduledDate;
    if (scheduled >= from && scheduled <= to) items.push({ id: `${quest.id}:${scheduled}`, questId: quest.id, date: scheduled, time: quest.scheduledTime, minutes: quest.estimatedMinutes, kind: "schedule", title: quest.title });
    if (quest.repeat === "none" || quest.lifecycleState !== "active") continue;
    let date = scheduled ? (from > scheduled ? from : addDays(scheduled, 1)) : from;
    const recurring = { ...quest, dueDate: quest.dueDate || scheduled || (Number.isFinite(Date.parse(quest.createdAt)) ? localDate(new Date(quest.createdAt), timezone) : from) };
    for (let n = 0; n < 366 && date <= to; n++) {
      const next = nextDueDateForTask(recurring, date);
      if (!next || next < date) break; date = next;
      if (date >= from && date <= to) items.push({ id: `${quest.id}:${date}`, questId: quest.id, date, time: quest.scheduledTime, minutes: quest.estimatedMinutes, kind: "schedule", title: quest.title });
      date = addDays(date, 1);
    }
  }
  const byId = new Map(quests.map(q => [q.id, q]));
  for (const entry of entries) for (const [date, minutes] of Object.entries(splitEntryDays(entry, timezone))) if (date >= from && date <= to) {
    const time = date === localDate(new Date(entry.startAt), timezone) ? new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(entry.startAt)) : "00:00";
    items.push({ id: `${entry.id}:${date}`, entryId: entry.id, questId: entry.questId, date, time, minutes, kind: "recorded", title: byId.get(entry.questId)?.title ?? entry.note });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

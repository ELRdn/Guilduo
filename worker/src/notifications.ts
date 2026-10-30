/**
 * Notifications: task reminders, a daily summary and Agent events, sent as Web Push.
 * Every state write reschedules the person's reminders and queues Agent events;
 * the per-minute cron sends whatever is due. Nothing here may fail a state write.
 */
import { DomainError } from "../../server/questforge-domain.ts";
import type { Quest, QuestForgeState } from "../../types/questforge.ts";
import { sendPush, vapidKeys, type PushTarget } from "./web-push.ts";
import type { WorkerEnv } from "./worker-types.ts";
import { calendarItems } from "../../shared/productivity.ts";
import { isRecurringQuest } from "../../shared/quest-schedule.ts";

export interface NotificationSettings {
  timeZone: string;
  locale: string;
  /** Minutes before a timed task starts; 0 turns the early reminder off. */
  before: number;
  atStart: boolean;
  /** Local "HH:MM" for the morning summary; "" turns it off. */
  summary: string;
  review: boolean;
  proposal: boolean;
  report: boolean;
}

export interface NotificationJob { id: string; kind: "reminder" | "daily" | "agent"; fireAt: number; payload: { title: string; body: string; tag: string; url: string } }

export const DEFAULT_SETTINGS: NotificationSettings = { timeZone: "UTC", locale: "ja", before: 10, atStart: true, summary: "08:00", review: true, proposal: true, report: true };
export const BEFORE_CHOICES = [0, 5, 10, 15, 30, 60] as const;
const LOCALES = ["ja", "en", "es", "pt-BR", "fr", "de", "ko", "zh-Hans", "ru"] as const;
// Endpoints are only ever these push services, so the gateway never posts to an arbitrary URL.
const PUSH_HOSTS = /^(?:fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$/;
const HOUR = 3_600_000;
const APP = "/next/all-for-adhd/";

type Copy = "soon" | "start" | "summaryTitle" | "summaryBody" | "review" | "proposal" | "done" | "blocked" | "testTitle" | "testBody";
const COPY: Record<(typeof LOCALES)[number], Record<Copy, string>> = {
  ja: { soon: "{n}分後に始まります", start: "始める時間です", summaryTitle: "今日の予定", summaryBody: "{n}件。最初は {time} {title}", review: "{agent} が確認を待っています", proposal: "{agent} から時間の提案", done: "{agent} が終えました", blocked: "{agent} が止まっています", testTitle: "通知はこう届きます", testBody: "Guilduo からのテスト通知です" },
  en: { soon: "Starts in {n} min", start: "Time to start", summaryTitle: "Today's plan", summaryBody: "{n} planned. First: {time} {title}", review: "{agent} is waiting for your check", proposal: "{agent} suggested a time", done: "{agent} finished", blocked: "{agent} is stuck", testTitle: "This is how notifications look", testBody: "A test notification from Guilduo" },
  es: { soon: "Empieza en {n} min", start: "Hora de empezar", summaryTitle: "El plan de hoy", summaryBody: "{n} previstas. Primero: {time} {title}", review: "{agent} espera tu revisión", proposal: "{agent} propuso una hora", done: "{agent} terminó", blocked: "{agent} está bloqueado", testTitle: "Así se ven las notificaciones", testBody: "Una notificación de prueba de Guilduo" },
  "pt-BR": { soon: "Começa em {n} min", start: "Hora de começar", summaryTitle: "O plano de hoje", summaryBody: "{n} planejadas. Primeiro: {time} {title}", review: "{agent} aguarda sua revisão", proposal: "{agent} sugeriu um horário", done: "{agent} terminou", blocked: "{agent} está travado", testTitle: "É assim que as notificações aparecem", testBody: "Uma notificação de teste do Guilduo" },
  fr: { soon: "Commence dans {n} min", start: "C'est l'heure de commencer", summaryTitle: "Le programme du jour", summaryBody: "{n} prévues. D'abord : {time} {title}", review: "{agent} attend votre vérification", proposal: "{agent} propose un horaire", done: "{agent} a terminé", blocked: "{agent} est bloqué", testTitle: "Voici à quoi ressemblent les notifications", testBody: "Une notification de test de Guilduo" },
  de: { soon: "Beginnt in {n} Min.", start: "Zeit anzufangen", summaryTitle: "Der Plan für heute", summaryBody: "{n} geplant. Zuerst: {time} {title}", review: "{agent} wartet auf deine Prüfung", proposal: "{agent} hat eine Zeit vorgeschlagen", done: "{agent} ist fertig", blocked: "{agent} kommt nicht weiter", testTitle: "So sehen Benachrichtigungen aus", testBody: "Eine Testbenachrichtigung von Guilduo" },
  ko: { soon: "{n}분 후에 시작해요", start: "시작할 시간이에요", summaryTitle: "오늘의 일정", summaryBody: "{n}건. 첫 번째: {time} {title}", review: "{agent}이(가) 확인을 기다리고 있어요", proposal: "{agent}이(가) 시간을 제안했어요", done: "{agent}이(가) 끝냈어요", blocked: "{agent}이(가) 멈춰 있어요", testTitle: "알림은 이렇게 도착해요", testBody: "Guilduo 테스트 알림입니다" },
  "zh-Hans": { soon: "{n} 分钟后开始", start: "该开始了", summaryTitle: "今天的安排", summaryBody: "{n} 项。第一项：{time} {title}", review: "{agent} 在等你确认", proposal: "{agent} 提议了一个时间", done: "{agent} 完成了", blocked: "{agent} 卡住了", testTitle: "通知会这样显示", testBody: "来自 Guilduo 的测试通知" },
  ru: { soon: "Начало через {n} мин", start: "Пора начинать", summaryTitle: "План на сегодня", summaryBody: "Запланировано: {n}. Первое: {time} {title}", review: "{agent} ждёт вашей проверки", proposal: "{agent} предложил время", done: "{agent} закончил", blocked: "{agent} застрял", testTitle: "Так выглядят уведомления", testBody: "Тестовое уведомление от Guilduo" },
};

function say(settings: NotificationSettings, key: Copy, vars: Record<string, string | number> = {}): string {
  const table = COPY[settings.locale as keyof typeof COPY] ?? COPY.en;
  return table[key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ""));
}

/* ------------------------------ local time ------------------------------ */

const validZone = (zone: unknown): zone is string => {
  if (typeof zone !== "string" || !zone || zone.length > 64) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; }
};

function wallClock(at: number, timeZone: string): { date: string; ms: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(at).map(part => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, ms: Date.parse(`${date}T${parts.hour}:${parts.minute}:${parts.second}Z`) };
}

/** A local date and time in the zone, as a UTC timestamp. Two passes settle DST edges. */
export function localToUtc(date: string, time: string, timeZone: string): number {
  const wall = Date.parse(`${date}T${time}:00Z`);
  const offset = (at: number) => wallClock(at, timeZone).ms - Math.floor(at / 1000) * 1000;
  const guess = wall - offset(wall);
  return wall - offset(guess);
}

const addDay = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 24 * HOUR).toISOString().slice(0, 10);

/* ------------------------------ scheduling ------------------------------ */

const isOpen = (quest: Quest) => !quest.done && quest.lifecycleState === "active";
const isMine = (quest: Quest) => (quest.assignee?.type ?? "self") === "self" && !quest.humanRequest;
const label = (quest: Quest) => `${quest.icon ? `${quest.icon} ` : ""}${quest.title}`;
const needsDecision = (quest: Quest) => isOpen(quest)
  && (quest.humanRequest ? quest.humanRequest.status === "pending" : quest.assignee?.type === "agent" && quest.assignee.handoffState === "review_required");

/** Reminders for the person's own timed tasks in the next 48 hours. A task's own list wins over the settings. */
export function reminderJobs(uid: string, state: QuestForgeState, settings: NotificationSettings, now: number): NotificationJob[] {
  const defaults = [...(settings.before > 0 ? [settings.before] : []), ...(settings.atStart ? [0] : [])];
  const date = wallClock(now, settings.timeZone).date;
  const quests = new Map(state.tasks.map(quest => [quest.id, quest]));
  return calendarItems(state.tasks, [], date, addDay(date, 2), settings.timeZone).flatMap(item => {
    const quest = quests.get(item.questId)!;
    if (item.kind !== "schedule" || !["todo", "daily"].includes(quest.kind) || quest.lifecycleState === "archived" || (!isOpen(quest) && (!isRecurringQuest(quest) || !quest.lastCompletedDate)) || !isMine(quest) || quest.lastCompletedDate === item.date || !/^\d{2}:\d{2}$/.test(item.time)) return [];
    const start = localToUtc(item.date, item.time, settings.timeZone);
    const offsets = Array.isArray(quest.reminders) ? quest.reminders as number[] : defaults;
    return [...new Set(offsets)].flatMap(minutes => {
      const fireAt = start - minutes * 60_000;
      if (fireAt <= now || fireAt > now + 48 * HOUR) return [];
      return [{ id: `reminder:${uid}:${quest.id}:${item.date}T${item.time}:${minutes}`, kind: "reminder" as const, fireAt,
        payload: { title: label(quest), body: minutes ? say(settings, "soon", { n: minutes }) : say(settings, "start"), tag: `quest-${quest.id}`, url: `${APP}#now` } }];
    });
  });
}

/** The next daily run: it sends the summary (when on) and tops up reminders beyond 48 hours. */
export function dailyJob(uid: string, settings: NotificationSettings, now: number): NotificationJob {
  const time = settings.summary || "03:00";
  const today = wallClock(now, settings.timeZone).date;
  const date = localToUtc(today, time, settings.timeZone) > now ? today : addDay(today, 1);
  return { id: `daily:${uid}:${date}`, kind: "daily", fireAt: localToUtc(date, time, settings.timeZone), payload: { title: "", body: "", tag: "daily", url: `${APP}#plan` } };
}

/** What an Agent did between two states that the person asked to hear about. */
export function agentJobs(uid: string, before: QuestForgeState | null, after: QuestForgeState, settings: NotificationSettings, now: number): NotificationJob[] {
  const relayCopy: Record<string, string> = { ja: "{agent} に仕事が渡りました", en: "Work was handed to {agent}", es: "Trabajo entregado a {agent}", "pt-BR": "Trabalho entregue a {agent}", fr: "Travail transmis à {agent}", de: "Arbeit an {agent} übergeben", ko: "{agent}에게 작업을 넘겼어요", "zh-Hans": "任务已交给 {agent}", ru: "Работа передана {agent}" };
  const previous = new Map((before?.tasks ?? []).map(quest => [quest.id, quest]));
  const job = (id: string, title: string, quest: Quest, url = `${APP}?quest=${encodeURIComponent(quest.id)}#guild`): NotificationJob =>
    ({ id: `agent:${uid}:${quest.id}:${id}`, kind: "agent", fireAt: now, payload: { title, body: label(quest), tag: `agent-${quest.id}`, url } });
  return after.tasks.flatMap(quest => {
    const old = previous.get(quest.id);
    const agent = quest.assignee?.type === "agent" ? quest.assignee.label || "Agent" : quest.requester?.label || "Agent";
    const jobs: NotificationJob[] = [];
    if (settings.review && needsDecision(quest) && !(old && needsDecision(old))) jobs.push(job(`review:${quest.updatedAt}`, say(settings, "review", { agent }), quest));
    if (settings.proposal && quest.proposal && quest.proposal.createdAt !== old?.proposal?.createdAt) {
      jobs.push(job(`proposal:${quest.proposal.createdAt}`, say(settings, "proposal", { agent: quest.proposal.label || agent }), quest, `${APP}#now`));
    }
    if (settings.report && old && quest.assignee?.type === "agent" && old.assignee?.type === "agent") {
      if (quest.relay && old.relay && quest.relay.at !== old.relay.at && quest.relay.at < quest.relay.legs.length) jobs.push(job(`relay:${quest.updatedAt}`, (relayCopy[settings.locale] || relayCopy.en!).replace("{agent}", agent), quest));
      if (quest.done && !old.done) jobs.push(job(`done:${quest.updatedAt}`, say(settings, "done", { agent }), quest));
      else if (quest.assignee.handoffState === "blocked" && old.assignee.handoffState !== "blocked") jobs.push(job(`blocked:${quest.updatedAt}`, say(settings, "blocked", { agent }), quest));
    }
    return jobs;
  });
}

/* ------------------------------ storage ------------------------------ */

export function normalizeSettings(input: unknown, base: NotificationSettings = DEFAULT_SETTINGS): NotificationSettings {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const flag = (key: "atStart" | "review" | "proposal" | "report") => typeof value[key] === "boolean" ? value[key] as boolean : base[key];
  return {
    timeZone: validZone(value.timeZone) ? value.timeZone : base.timeZone,
    locale: LOCALES.includes(value.locale as never) ? value.locale as string : base.locale,
    before: BEFORE_CHOICES.includes(value.before as never) ? value.before as number : base.before,
    atStart: flag("atStart"),
    summary: value.summary === "" || (typeof value.summary === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.summary)) ? value.summary : base.summary,
    review: flag("review"), proposal: flag("proposal"), report: flag("report"),
  };
}

export async function loadSettings(env: WorkerEnv, uid: string): Promise<NotificationSettings | null> {
  const row = await env.QUESTFORGE_DB?.prepare("SELECT value_json FROM notification_settings WHERE uid = ?").bind(uid).first<{ value_json: string }>();
  return row ? normalizeSettings(JSON.parse(row.value_json)) : null;
}

async function saveSettings(env: WorkerEnv, uid: string, settings: NotificationSettings): Promise<void> {
  await env.QUESTFORGE_DB!.prepare("INSERT INTO notification_settings (uid, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(uid) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at")
    .bind(uid, JSON.stringify(settings), new Date().toISOString()).run();
}

function insertJobs(env: WorkerEnv, uid: string, jobs: NotificationJob[]) {
  return jobs.map(job => env.QUESTFORGE_DB!.prepare("INSERT OR IGNORE INTO notification_jobs (id, uid, kind, fire_at, payload_json) VALUES (?, ?, ?, ?, ?)")
    .bind(job.id, uid, job.kind, job.fireAt, JSON.stringify(job.payload)));
}

/**
 * Replaces the future reminders and the next daily run. Sent ones keep their ids, so they are never sent twice;
 * due ones stay for the cron, so a write in the minute before it runs cannot drop them.
 */
async function reschedule(env: WorkerEnv, uid: string, state: QuestForgeState | null, settings: NotificationSettings, extra: NotificationJob[] = [], now = Date.now()): Promise<void> {
  const db = env.QUESTFORGE_DB!;
  await db.batch([
    db.prepare("DELETE FROM notification_jobs WHERE uid = ? AND kind IN ('reminder', 'daily') AND sent_at IS NULL AND fire_at > ?").bind(uid, now),
    ...insertJobs(env, uid, [...(state ? reminderJobs(uid, state, settings, now) : []), dailyJob(uid, settings, now), ...extra]),
  ]);
}

/** Called after every committed state write. Only people who turned notifications on have settings. */
export async function onStateWritten(env: WorkerEnv, uid: string, before: QuestForgeState | null, after: QuestForgeState | null): Promise<void> {
  if (!env.QUESTFORGE_DB || !after) return;
  try {
    const settings = await loadSettings(env, uid);
    if (!settings) return;
    const now = Date.now();
    await reschedule(env, uid, after, settings, agentJobs(uid, before, after, settings, now), now);
  } catch (error) {
    console.error("notification_schedule_failed", { message: error instanceof Error ? error.message : String(error) });
  }
}

/* ------------------------------ sending ------------------------------ */

const subject = (env: WorkerEnv) => String(env.WEB_APP_URL || "https://app.guilduo.com");

async function deliver(env: WorkerEnv, uid: string, payload: NotificationJob["payload"], keys: Awaited<ReturnType<typeof vapidKeys>>, ttl: number): Promise<number> {
  const db = env.QUESTFORGE_DB!;
  const { results = [] } = await db.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE uid = ?").bind(uid).all<PushTarget>();
  let sent = 0;
  for (const target of results) {
    try {
      const status = await sendPush(target, JSON.stringify(payload), keys, subject(env), ttl);
      if (status === 404 || status === 410) await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(target.endpoint).run();
      else if (status < 300) sent += 1;
      else console.error("push_rejected", { status, host: new URL(target.endpoint).host });
    } catch (error) {
      console.error("push_failed", { message: error instanceof Error ? error.message : String(error) });
    }
  }
  return sent;
}

/** The per-minute cron. Each job is claimed before it is sent, so overlapping runs never double-send. */
export async function sendDueNotifications(env: WorkerEnv, readState: (uid: string) => Promise<QuestForgeState | null>, now = Date.now()): Promise<void> {
  const db = env.QUESTFORGE_DB;
  if (!db) return;
  const { results = [] } = await db.prepare("SELECT id, uid, kind, fire_at, payload_json FROM notification_jobs WHERE sent_at IS NULL AND fire_at <= ? ORDER BY fire_at LIMIT 100")
    .bind(now).all<{ id: string; uid: string; kind: string; fire_at: number; payload_json: string }>();
  if (results.length > 0) {
    const keys = await vapidKeys(env);
    for (const job of results) {
      const claimed = await db.prepare("UPDATE notification_jobs SET sent_at = ? WHERE id = ? AND sent_at IS NULL").bind(now, job.id).run();
      if (!claimed.meta?.changes) continue;
      try {
        if (job.kind === "daily") await runDaily(env, job.uid, readState, keys, now);
        // A reminder that missed its minute by half an hour would only confuse.
        else if (job.fire_at >= now - HOUR / 2) await deliver(env, job.uid, JSON.parse(job.payload_json), keys, job.kind === "reminder" ? 900 : 86_400);
      } catch (error) {
        console.error("notification_job_failed", { kind: job.kind, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  await db.prepare("DELETE FROM notification_jobs WHERE sent_at IS NOT NULL AND sent_at < ?").bind(now - 7 * 24 * HOUR).run();
}

async function runDaily(env: WorkerEnv, uid: string, readState: (uid: string) => Promise<QuestForgeState | null>, keys: Awaited<ReturnType<typeof vapidKeys>>, now: number): Promise<void> {
  const settings = await loadSettings(env, uid);
  if (!settings) return;
  const state = await readState(uid);
  if (!state) return;
  await reschedule(env, uid, state, settings, [], now);
  if (!settings.summary) return;
  const today = wallClock(now, settings.timeZone).date;
  const todays = state.tasks.filter(quest => quest.kind === "todo" && isOpen(quest) && isMine(quest) && quest.scheduledDate === today)
    .sort((a, b) => (a.scheduledTime || "99:99").localeCompare(b.scheduledTime || "99:99"));
  if (todays.length === 0) return;
  const first = todays[0]!;
  await deliver(env, uid, { title: say(settings, "summaryTitle"), body: say(settings, "summaryBody", { n: todays.length, time: first.scheduledTime, title: label(first) }).replace(/\s+/g, " ").trim(), tag: "summary", url: `${APP}#plan` }, keys, 4 * 3600);
}

/* ------------------------------ routes ------------------------------ */

async function body(request: Request): Promise<Record<string, unknown>> {
  const value = await request.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DomainError(400, "invalid_json", "The request body must be a JSON object.");
  return value as Record<string, unknown>;
}

/** `/v1/notifications/*`, for the person's own browser only. */
export async function handleNotifications(request: Request, env: WorkerEnv, identity: { uid: string; authType: string }, readState: (uid: string) => Promise<QuestForgeState | null>): Promise<Response> {
  if (identity.authType === "oauth") throw new DomainError(403, "notifications_web_only", "Notifications are managed from the Guilduo app.");
  if (!env.QUESTFORGE_DB) throw new DomainError(503, "push_unavailable", "Notifications need D1 storage.");
  const db = env.QUESTFORGE_DB;
  const path = new URL(request.url).pathname;
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  const { uid } = identity;

  if (path === "/v1/notifications" && request.method === "GET") {
    const [keys, settings, devices] = await Promise.all([vapidKeys(env), loadSettings(env, uid),
      db.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE uid = ?").bind(uid).first<{ count: number }>()]);
    return json({ publicKey: keys.publicKey, settings: settings ?? DEFAULT_SETTINGS, devices: Number(devices?.count ?? 0) });
  }
  if (path === "/v1/notifications/settings" && request.method === "PUT") {
    const settings = normalizeSettings(await body(request), (await loadSettings(env, uid)) ?? DEFAULT_SETTINGS);
    await saveSettings(env, uid, settings);
    await reschedule(env, uid, await readState(uid), settings);
    return json({ settings });
  }
  if (path === "/v1/notifications/subscriptions" && request.method === "POST") {
    const input = await body(request);
    const keys = (input.keys && typeof input.keys === "object" ? input.keys : {}) as Record<string, unknown>;
    const endpoint = String(input.endpoint ?? "");
    let host = "";
    try { const url = new URL(endpoint); host = url.protocol === "https:" ? url.hostname : ""; } catch { /* rejected below */ }
    if (endpoint.length > 1024 || !PUSH_HOSTS.test(host)) throw new DomainError(400, "invalid_push_endpoint", "endpoint must be a known Web Push service URL.");
    const key = (name: string, max: number) => {
      const value = String(keys[name] ?? "");
      if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > max) throw new DomainError(400, `invalid_${name}`, `keys.${name} must be base64url.`);
      return value;
    };
    const p256dh = key("p256dh", 120), auth = key("auth", 40);
    const count = await db.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE uid = ? AND endpoint <> ?").bind(uid, endpoint).first<{ count: number }>();
    if (Number(count?.count ?? 0) >= 10) throw new DomainError(409, "too_many_devices", "Turn notifications off on another device first.");
    const settings = normalizeSettings(input.settings, (await loadSettings(env, uid)) ?? DEFAULT_SETTINGS);
    // The same browser re-subscribing (or another account on it) takes the endpoint over.
    await db.batch([
      db.prepare("INSERT INTO push_subscriptions (endpoint, uid, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET uid = excluded.uid, p256dh = excluded.p256dh, auth = excluded.auth")
        .bind(endpoint, uid, p256dh, auth, new Date().toISOString()),
      db.prepare("INSERT INTO notification_settings (uid, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(uid) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at")
        .bind(uid, JSON.stringify(settings), new Date().toISOString()),
    ]);
    await reschedule(env, uid, await readState(uid), settings);
    return json({ settings }, 201);
  }
  if (path === "/v1/notifications/subscriptions" && request.method === "DELETE") {
    const input = await body(request);
    await db.prepare("DELETE FROM push_subscriptions WHERE uid = ? AND endpoint = ?").bind(uid, String(input.endpoint ?? "")).run();
    return json({ ok: true });
  }
  if (path === "/v1/notifications/test" && request.method === "POST") {
    const settings = (await loadSettings(env, uid)) ?? DEFAULT_SETTINGS;
    const sent = await deliver(env, uid, { title: say(settings, "testTitle"), body: say(settings, "testBody"), tag: "test", url: APP }, await vapidKeys(env), 300);
    return json({ sent });
  }
  throw new DomainError(404, "not_found", "Unknown notifications route.");
}

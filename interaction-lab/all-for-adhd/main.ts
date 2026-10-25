/**
 * All for ADHD entry point. Auth, repository and runtime are the Relay Forge
 * ones, so this surface reads and writes exactly the same Quests.
 */

import { tx } from "./copy.ts";
import { iconFor } from "./emoji.ts";
import { getLocale } from "../../i18n.ts";
import "../../runtime-config.js";
import "../relay-forge/tokens.css";
// Relay Forge modules reused for calendar, notes, time and plan bring their scoped styles.
import "../relay-forge/primitives.css";
import "../relay-forge/screens/screens.css";
import "../relay-forge/screens/settings.css";
import "../relay-forge/screens/productivity.css";
import "../relay-forge/screens/quests.css";
import "../relay-forge/screens/network.css";
import "../relay-forge/screens/party.css";
import "../relay-forge/screens/battle.css";
import "../relay-forge/screens/connections.css";
import "../relay-forge/screens/skills.css";
import "./forge-skin.css";
import "./styles.css";
import type { CharacterState, Quest } from "../../types/questforge.ts";
import { requireElement } from "../relay-forge/primitives/dom.ts";
import { observeAuthState, signIn, signOutUser, getIdToken } from "../auth.ts";
import { QuestForgeRepository } from "../repository.ts";
import { mountAllFor, type AllForActivity, type AllForAgent, type AllForConnection, type AllForPort, type Relay } from "./app.ts";

const root = requireElement<HTMLElement>(document, "#a4-root");
document.documentElement.lang = getLocale();
const skip = document.querySelector(".a4-skip");
if (skip) skip.textContent = tx("本文へ移動");
let unmount: (() => void) | null = null;
let stopAuth: (() => void) | null = null;

const localToday = () => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

type BootKind = "loading" | "welcome" | "error";

/** Boot screens share one calm layout: wordmark, a headline, one line, then either a quiet placeholder or the actions. */
function message(title: string, body: string, actions: readonly [string, () => void][] = [], kind: BootKind = actions.length ? "error" : "loading", points: readonly string[] = []): void {
  unmount?.(); unmount = null;
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") => {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text) item.textContent = text;
    return item;
  };
  const panel = node("main", "a4-boot");
  panel.dataset.kind = kind;
  panel.setAttribute("aria-busy", String(kind === "loading"));
  const h1 = node("h1", "", title); h1.tabIndex = -1;
  panel.append(node("p", "a4-boot-mark", "Guilduo"), h1, node("p", "a4-boot-lead", body));
  if (points.length) {
    const list = node("ul", "a4-boot-points");
    for (const point of points) list.append(node("li", "", point));
    panel.append(list);
  }
  if (kind === "loading") {
    // A faint outline of the Now card, so the wait looks like the screen that is coming.
    const ghost = node("div", "a4-boot-ghost");
    ghost.setAttribute("aria-hidden", "true");
    for (const width of ["30%", "72%", "52%"]) { const bar = node("span"); bar.style.width = width; ghost.append(bar); }
    const chips = node("div", "a4-boot-ghost-chips");
    for (let i = 0; i < 3; i++) chips.append(node("i"));
    ghost.append(chips);
    panel.append(ghost);
  }
  const row = node("div", "a4-boot-actions");
  actions.forEach(([label, run], index) => {
    const button = node("button", index === 0 ? "a4-button a4-primary" : "a4-button", label);
    button.type = "button";
    button.addEventListener("click", run);
    row.append(button);
  });
  if (actions.length) panel.append(row);
  root.replaceChildren(panel);
  if (actions.length) h1.focus();
}

function questOf(response: Record<string, unknown>, id?: string): Quest {
  const quest = response.quest as Quest | undefined;
  if (!quest || typeof quest !== "object" || typeof quest.id !== "string" || (id !== undefined && quest.id !== id)) throw new Error("save_unverified");
  return quest;
}

async function showDemo(): Promise<void> {
  stopAuth?.();
  const [{ fixtureRawQuests }, { FIXTURE_TODAY, fixtureAgentsFor, fixturePartyMembersFor }] = await Promise.all([import("../relay-forge/fixtures.ts"), import("../relay-forge/screens/fixtures.ts")]);
  const stamp = () => new Date().toISOString();
  // The Relay fixtures are Agent-heavy; a few personal tasks make the demo representative.
  const mine = (id: string, title: string, patch: Partial<Quest>): Quest => ({
    ...(fixtureRawQuests[0] as Quest), id, title, nextAction: "", estimatedMinutes: 0, dueDate: "", scheduledDate: "", scheduledTime: "",
    planningMode: "on_date", planningState: "backlog", lifecycleState: "active", done: false, humanRequest: null, parentQuestId: "", notes: "", dependencyIds: [],
    assignee: { type: "self", id: "self", label: "", handoffState: "none" }, icon: iconFor(title), iconSource: iconFor(title) ? "auto" : "", proposal: null,
    createdAt: stamp(), updatedAt: stamp(), ...patch,
  } as Quest);
  const day = (offset: number) => { const at = new Date(`${FIXTURE_TODAY}T12:00:00Z`); at.setUTCDate(at.getUTCDate() + offset); return at.toISOString().slice(0, 10); };
  let quests: Quest[] = [
    mine("demo-morning", tx("朝の支度"), { scheduledDate: FIXTURE_TODAY, scheduledTime: "08:30", planningState: "scheduled", estimatedMinutes: 30, done: true, lifecycleState: "completed" }),
    mine("demo-mail", tx("請求書のメールに返信する"), { scheduledDate: FIXTURE_TODAY, scheduledTime: "10:00", planningState: "scheduled", estimatedMinutes: 15, nextAction: tx("メールを開いて宛名だけ書く") }),
    mine("demo-meet", tx("打ち合わせの準備"), { scheduledDate: FIXTURE_TODAY, scheduledTime: "13:00", planningState: "scheduled", estimatedMinutes: 30 }),
    mine("demo-walk", tx("散歩する"), { scheduledDate: FIXTURE_TODAY, scheduledTime: "16:00", planningState: "scheduled", estimatedMinutes: 30 }),
    mine("demo-slide", tx("来週の発表スライドを作る"), { scheduledDate: FIXTURE_TODAY, planningState: "scheduled", estimatedMinutes: 60 }),
    mine("demo-slide-1", tx("構成を3行で書く"), { parentQuestId: "demo-slide" }),
    mine("demo-slide-2", tx("図を1枚つくる"), { parentQuestId: "demo-slide" }),
    mine("demo-review", tx("週報の下書きを確認する"), {
      requester: { type: "agent", id: "a-scribe", label: "Scribe" },
      completionCriteria: tx("数字と日付が先週の記録と一致している"),
      humanRequest: { sourceQuestId: "demo-slide", requestKey: "demo-review", recipientId: "admin", reason: tx("来週の発表で使う週報の下書きができました。"), checkTarget: tx("売上の数字と日付が合っているか"), artifactUrl: "", status: "pending", seenAt: "", respondedAt: "", response: "", outcome: "" },
    }),
    mine("demo-gym", tx("ジムに行く"), { scheduledDate: day(1), scheduledTime: "19:00", planningState: "scheduled", estimatedMinutes: 60 }),
    mine("demo-tax", tx("確定申告の書類を集める"), { dueDate: day(-3), planningState: "scheduled" }),
    mine("demo-dentist", tx("歯医者を予約する"), { estimatedMinutes: 15 }),
    mine("demo-book", tx("借りた本を返す"), { proposal: { agentId: "a-scribe", label: "Scribe", date: FIXTURE_TODAY, time: "14:00", minutes: 30, note: tx("図書館は14時台が空いています"), createdAt: stamp() } }),
    mine("demo-pill", tx("薬を飲む"), { kind: "daily", repeat: "daily", scheduledDate: day(-30), planningState: "scheduled", streak: 4, lastCompletedDate: day(-1) }),
    mine("demo-plan", tx("旅行の候補を3つ挙げる"), { scheduledDate: day(2), planningState: "scheduled" }),
    ...fixtureRawQuests.map(q => ({ ...q })),
  ];
  const replace = (next: Quest) => { quests = [next, ...quests.filter(q => q.id !== next.id)]; return next; };
  // A small in-memory activity log so the Guild's "最近の活動" reflects what happens in the demo.
  const events: AllForActivity[] = [];
  const log = (type: string, quest: Quest, source: "app" | "mcp", details: Record<string, unknown> = {}) => {
    events.unshift({ id: `evt-${events.length}-${Date.now()}`, at: stamp(), type, questId: quest.id, source, details });
  };
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  for (const [minutes, type, id, source, details] of [
    [180, "quest.created", "demo-slide", "app", {}],
    [95, "quest.handoff.transitioned", fixtureRawQuests[0]?.id ?? "", "mcp", { to: "working" }],
    [40, "quest.scored", "demo-morning", "app", {}],
  ] as const) events.push({ id: `seed-${minutes}`, at: ago(minutes), type, questId: id, source, details });
  let connections: AllForConnection[] = [
    { clientId: "demo-claude", clientName: "Claude Code", lastUsedAt: ago(30), authorized: true, agentIds: ["a-scribe"] },
    { clientId: "demo-codex", clientName: "Codex", lastUsedAt: ago(60 * 26), authorized: true, agentIds: [] },
  ];
  const agents: AllForAgent[] = fixtureAgentsFor("default").map(agent => ({ id: agent.agentId, name: agent.displayName, role: agent.role, active: agent.status === "active", startState: agent.defaultHandoffState }));
  const members = fixturePartyMembersFor("default").map(member => ({ id: member.uid, name: member.displayName, owner: member.role === "owner" }));
  const relays = new Map<string, Relay>();
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const current = (id: string) => quests.find(q => q.id === id);
  const handTo = (quest: Quest, agentId: string) => {
    const agent = agents.find(item => item.id === agentId);
    const next = replace({ ...quest, assignee: { type: "agent", id: agentId, label: agent?.name ?? "Agent", handoffState: "ready" }, updatedAt: stamp() } as Quest);
    log("quest.assignment.ready", next, "app", { assignee: next.assignee });
    return next;
  };
  /** Pretends the Agent picks the work up, does it, and either passes it on or asks you. */
  const simulate = (id: string, agentId: string) => {
    window.setTimeout(() => {
      const quest = current(id);
      if (quest?.assignee.id !== agentId || quest.assignee.handoffState !== "ready") return;
      log("quest.handoff.transitioned", replace({ ...quest, assignee: { ...quest.assignee, handoffState: "working" }, updatedAt: stamp() }), "mcp", { to: "working" });
      notify();
    }, 2500);
    window.setTimeout(() => {
      const quest = current(id);
      const relay = relays.get(id);
      if (quest?.assignee.id !== agentId || quest.assignee.handoffState !== "working") return;
      const leg = relay?.legs[relay.at];
      const next = relay?.legs[relay.at + 1];
      if (relay && leg && next && !leg.check) {
        relays.set(id, { ...relay, at: relay.at + 1 });
        handTo(quest, next.agentId);
        simulate(id, next.agentId);
      } else {
        log("quest.handoff.transitioned", replace({ ...quest, assignee: { ...quest.assignee, handoffState: "review_required" }, handoff: { ...quest.handoff, note: tx("{ask}が終わりました。確認をお願いします。", { ask: leg?.ask || tx("作業") }) }, updatedAt: stamp() }), "mcp", { to: "review_required" });
      }
      notify();
    }, 9000);
  };
  const port: AllForPort = {
    demo: true,
    relay: {
      get: id => relays.get(id) ?? null,
      set: async (quest, legs) => {
        const started = quest.assignee.type === "agent";
        if (legs.length === 0) { relays.delete(quest.id); return replace({ ...quest, assignee: { type: "self", id: "self", label: "", handoffState: "none" }, updatedAt: stamp() } as Quest); }
        relays.set(quest.id, { legs, at: started ? relays.get(quest.id)?.at ?? 0 : 0 });
        if (started) return quest;
        simulate(quest.id, legs[0]!.agentId);
        return handTo(quest, legs[0]!.agentId);
      },
    },
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    activity: async () => [...events].sort((a, b) => b.at.localeCompare(a.at)),
    registerAgent: async input => {
      const agent: AllForAgent = { id: input.agentId, name: input.displayName, role: input.role, active: true, startState: "ready" };
      agents.push(agent);
      return agent;
    },
    removeAgent: async agentId => { agents.splice(agents.findIndex(agent => agent.id === agentId), 1); },
    mcp: {
      url: "https://mcp.guilduo.com/mcp",
      connections: async () => connections,
      link: async (connection, agentIds) => { connections = connections.map(item => item.clientId === connection.clientId ? { ...item, agentIds: [...agentIds] } : item); },
      revoke: async connection => { connections = connections.filter(item => item.clientId !== connection.clientId); },
    },
    self: () => ({ id: "admin", label: "admin" }),
    agents: () => agents,
    members: () => members,
    answer: async (quest, action, response) => {
      const request = quest.humanRequest!;
      const answered = action === "approve" || action === "revise";
      return replace({ ...quest, humanRequest: { ...request, status: answered ? "answered" : action === "defer" ? "deferred" : "pending",
        response: answered ? response : request.response, outcome: action === "approve" ? "approved" : action === "revise" ? "changes_requested" : request.outcome,
        respondedAt: answered ? stamp() : request.respondedAt }, updatedAt: stamp() });
    },
    review: async (quest, accept, note) => {
      const relay = relays.get(quest.id);
      const next = relay?.legs[relay.at + 1];
      if (accept && relay && next) {
        relays.set(quest.id, { ...relay, at: relay.at + 1 });
        simulate(quest.id, next.agentId);
        return handTo(quest, next.agentId);
      }
      if (!accept) window.setTimeout(() => simulate(quest.id, quest.assignee.id), 0);
      log("quest.handoff.transitioned", quest, "app", { to: accept ? "accepted" : "working" });
      return replace({ ...quest, assignee: { ...quest.assignee, handoffState: accept ? "accepted" : "working" }, handoff: { ...quest.handoff, note: note || quest.handoff.note }, updatedAt: stamp() });
    },
    today: () => FIXTURE_TODAY,
    quests: () => quests,
    create: async input => { const quest = replace({ ...(fixtureRawQuests[0] as Quest), id: `demo-${Date.now()}`, assignee: { type: "self", id: "self", label: "", handoffState: "none" }, humanRequest: null, parentQuestId: "", ...input, createdAt: stamp(), updatedAt: stamp() } as Quest); log("quest.created", quest, "app"); return quest; },
    update: async (quest, patch) => { const next = replace({ ...quest, ...patch, ...("lifecycleState" in patch ? { done: patch.lifecycleState === "completed" } : {}), updatedAt: stamp() } as Quest); log("quest.updated", next, "app"); return next; },
    complete: async quest => { const done = replace({ ...quest, lifecycleState: "completed", done: true, updatedAt: stamp() }); log("quest.scored", done, "app"); return { quest: done, character: { level: 12, xp: 340, nextXp: 500 } as CharacterState }; },
  };
  unmount?.();
  unmount = mountAllFor(root, port);
}

async function showProduction(uid: string, email: string): Promise<void> {
  message(tx("読み込んでいます"), tx("やることを取り出しています。少しだけ待ってください。"));
  try {
    const [{ createProductionRuntime, normalizeAgentRecord, normalizeAgentConnections }, { runHandoff }, { deriveMcpUrl }] = await Promise.all([
      import("../relay-forge/production.ts"), import("../relay-forge/adapter.ts"), import("../relay-forge/screens/settings-model.ts")]);
    const repository = new QuestForgeRepository({ getToken: force => getIdToken(force) });
    let runtime = await createProductionRuntime(repository, uid, email);
    let quests: Quest[] = [...runtime.quests];
    const savedDuringRefresh = new Set<Set<string>>();
    const replace = (next: Quest) => {
      quests = [next, ...quests.filter(q => q.id !== next.id)];
      for (const touched of savedDuringRefresh) touched.add(next.id);
      return next;
    };
    const port: AllForPort = {
      demo: false,
      self: () => ({ id: runtime.selfUid, label: runtime.profile?.displayName || tx("自分") }),
      agents: () => runtime.agents.filter(agent => agent.status !== "archived").map(agent => ({ id: agent.agentId, name: agent.displayName, role: agent.role ?? "", active: (agent.status ?? "active") === "active", startState: agent.defaultHandoffState || "ready" })),
      members: () => runtime.members.map(member => ({ id: member.uid, name: member.displayName, owner: member.role === "owner" })),
      answer: async (quest, action, response) => {
        const requests = runtime.humanRequestPort;
        if (!requests) throw new Error("human_requests_unavailable");
        // Same contract as Relay Forge's inbox: a dry run validates, then the real write.
        const input = { action, response, confirmed: true, expectedUpdatedAt: quest.updatedAt };
        await requests.respondHumanReview(quest.id, { ...input, dryRun: true });
        return replace(questOf(await requests.respondHumanReview(quest.id, { ...input, dryRun: false }), quest.id));
      },
      review: async (quest, accept, note) => {
        const outcome = await runHandoff(runtime.handoffPort, { questId: quest.id, state: accept ? "accepted" : "working", expectedState: quest.assignee.handoffState, note, dryRun: false });
        if (!outcome.ok || !outcome.quest) throw new Error(outcome.code);
        return replace(outcome.quest);
      },
      activity: async () => {
        const response = await repository.request<{ events?: unknown }>("/v1/events?limit=30");
        if (!Array.isArray(response.events)) throw new Error("invalid_events");
        return response.events.map((item: Record<string, unknown>) => ({
          id: String(item.id ?? ""), at: String(item.at ?? item.createdAt ?? ""), type: String(item.type ?? ""), questId: String(item.taskId ?? ""),
          source: String(item.source ?? ""), details: (item.details && typeof item.details === "object" ? item.details : {}) as Record<string, unknown>,
        }));
      },
      registerAgent: async input => {
        // Same fields and safe defaults as Relay Forge's Agent dialog.
        const response = await runtime.agentPort.createAgent({ ...input, provider: "generic", role: input.role || "assistant", defaultHandoffState: "ready", dryRunDefault: true });
        const saved = normalizeAgentRecord(response.agent);
        if (!saved) throw new Error("save_unverified");
        runtime = { ...runtime, agents: [...runtime.agents.filter(agent => agent.agentId !== saved.agentId), saved] };
        return { id: saved.agentId, name: saved.displayName, role: saved.role ?? "", active: (saved.status || "active") === "active", startState: saved.defaultHandoffState || "ready" };
      },
      removeAgent: async agentId => {
        const agent = runtime.agents.find(item => item.agentId === agentId);
        if (!agent) return;
        // Relay Forge's delete is an archive with the same conflict guard.
        await runtime.agentPort.updateAgent(agentId, { status: "archived", expectedUpdatedAt: agent.updatedAt });
        runtime = { ...runtime, agents: runtime.agents.filter(item => item.agentId !== agentId) };
      },
      mcp: {
        url: deriveMcpUrl(runtime.gatewayUrl),
        connections: async () => normalizeAgentConnections(await runtime.agentConnectionPort.listAgentConnections())
          .filter(row => !row.revokedAt)
          .map(row => ({ clientId: row.clientId, clientName: row.clientName, lastUsedAt: row.lastUsedAt, authorized: row.authorized,
            agentIds: row.linkRevokedAt ? [] : [...new Set([row.linkedAgentId ?? "", ...(row.allowedAgentIds ?? [])])].filter(Boolean) })),
        link: async (connection, agentIds) => {
          if (agentIds.length > 0) await runtime.agentConnectionPort.linkAgentConnection(agentIds[0]!, connection.clientId, agentIds);
          else if (connection.agentIds[0]) await runtime.agentConnectionPort.unlinkAgentConnection(connection.agentIds[0], connection.clientId);
        },
        revoke: async connection => { await runtime.agentConnectionPort.revokeMcpConnection(connection.clientId); },
      },
      today: localToday,
      quests: () => quests,
      create: async input => replace(questOf(await runtime.questPort.createQuest(input))),
      update: async (quest, patch) => replace(questOf(await runtime.questPort.updateQuest(quest.id, { ...patch, expectedUpdatedAt: quest.updatedAt }), quest.id)),
      complete: async quest => {
        const response = await runtime.questPort.scoreQuest(quest.id, "up", quest.updatedAt);
        return { quest: replace(questOf(response, quest.id)), character: (response.character as CharacterState | undefined) ?? null };
      },
      refresh: runtime.refreshWorkspace ? async () => {
        const touched = new Set<string>();
        savedDuringRefresh.add(touched);
        try { runtime = await runtime.refreshWorkspace!(); } finally { savedDuringRefresh.delete(touched); }
        // A save that lands while the refresh is in flight is newer than its snapshot; keep it.
        const newer = quests.filter(q => touched.has(q.id));
        quests = [...newer, ...runtime.quests.filter(q => !touched.has(q.id))];
      } : undefined,
      signOut: async () => { await signOutUser(); checkAuth(); },
      get runtime() { return runtime; },
    };
    unmount?.();
    unmount = mountAllFor(root, port);
  } catch {
    message(tx("読み込めませんでした"), tx("通信を確認して、もう一度試してください。データは変更されていません。"), [[tx("再試行"), () => { void showProduction(uid, email); }], [tx("デモを見る"), () => { void showDemo(); }]]);
  }
}

function checkAuth(): void {
  stopAuth?.();
  stopAuth = observeAuthState(state => {
    if (state.status === "authenticated") { void showProduction(state.user.uid, state.user.email); return; }
    if (state.status === "checking") { message(tx("ようこそ"), tx("サインインの状態を確かめています。")); return; }
    message(tx("ひとつずつ、迷わず進める。"), tx("Googleでサインインすると、いつものやることがそのまま使えます。"), [
      [tx("Googleでサインイン"), () => { void signIn().catch(() => message(tx("サインインできませんでした"), tx("もう一度試してください。"), [[tx("再試行"), checkAuth]])); }],
      [tx("デモを見る"), () => { void showDemo(); }],
    ], "welcome", [tx("今やることは、いつも1つだけ"), tx("予定は時間の帯で見える"), tx("Agent に任せて、あなたは判断だけ")]);
  });
}

if (new URLSearchParams(location.search).has("demo")) void showDemo();
else checkAuth();

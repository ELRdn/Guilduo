/**
 * All for ADHD entry point. Auth, repository and runtime are the Relay Forge
 * ones, so this surface reads and writes exactly the same Quests.
 */

import "../../runtime-config.js";
import "../relay-forge/tokens.css";
import "./styles.css";
import type { CharacterState, Quest } from "../../types/questforge.ts";
import { requireElement } from "../relay-forge/primitives/dom.ts";
import { observeAuthState, signIn, signOutUser, getIdToken } from "../auth.ts";
import { QuestForgeRepository } from "../repository.ts";
import { mountAllFor, type AllForPort } from "./app.ts";

const root = requireElement<HTMLElement>(document, "#a4-root");
let unmount: (() => void) | null = null;
let stopAuth: (() => void) | null = null;

const localToday = () => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function message(title: string, body: string, actions: readonly [string, () => void][] = []): void {
  unmount?.(); unmount = null;
  const panel = document.createElement("main");
  panel.className = "a4-boot";
  const h1 = document.createElement("h1"); h1.textContent = title; h1.tabIndex = -1;
  const p = document.createElement("p"); p.textContent = body;
  const row = document.createElement("div"); row.className = "a4-actions";
  actions.forEach(([label, run], index) => {
    const button = document.createElement("button");
    button.type = "button"; button.className = index === 0 ? "a4-button a4-primary" : "a4-button";
    button.textContent = label; button.addEventListener("click", run);
    row.append(button);
  });
  panel.append(h1, p, row);
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
  const [{ fixtureRawQuests }, { FIXTURE_TODAY }] = await Promise.all([import("../relay-forge/fixtures.ts"), import("../relay-forge/screens/fixtures.ts")]);
  const stamp = () => new Date().toISOString();
  // The Relay fixtures are Agent-heavy; a few personal tasks make the demo representative.
  const mine = (id: string, title: string, patch: Partial<Quest>): Quest => ({
    ...(fixtureRawQuests[0] as Quest), id, title, nextAction: "", estimatedMinutes: 0, dueDate: "", scheduledDate: "", scheduledTime: "",
    planningMode: "on_date", planningState: "backlog", lifecycleState: "active", done: false, humanRequest: null, parentQuestId: "", notes: "",
    assignee: { type: "self", id: "self", label: "", handoffState: "none" }, createdAt: stamp(), updatedAt: stamp(), ...patch,
  } as Quest);
  const day = (offset: number) => { const at = new Date(`${FIXTURE_TODAY}T12:00:00Z`); at.setUTCDate(at.getUTCDate() + offset); return at.toISOString().slice(0, 10); };
  let quests: Quest[] = [
    mine("demo-morning", "朝の支度", { scheduledDate: FIXTURE_TODAY, scheduledTime: "08:30", planningState: "scheduled", estimatedMinutes: 30, done: true, lifecycleState: "completed" }),
    mine("demo-mail", "請求書のメールに返信する", { scheduledDate: FIXTURE_TODAY, scheduledTime: "10:00", planningState: "scheduled", estimatedMinutes: 15, nextAction: "メールを開いて宛名だけ書く" }),
    mine("demo-meet", "打ち合わせの準備", { scheduledDate: FIXTURE_TODAY, scheduledTime: "13:00", planningState: "scheduled", estimatedMinutes: 30 }),
    mine("demo-walk", "散歩する", { scheduledDate: FIXTURE_TODAY, scheduledTime: "16:00", planningState: "scheduled", estimatedMinutes: 30 }),
    mine("demo-slide", "来週の発表スライドを作る", { scheduledDate: FIXTURE_TODAY, planningState: "scheduled", estimatedMinutes: 60 }),
    mine("demo-slide-1", "構成を3行で書く", { parentQuestId: "demo-slide" }),
    mine("demo-slide-2", "図を1枚つくる", { parentQuestId: "demo-slide" }),
    mine("demo-gym", "ジムに行く", { scheduledDate: day(1), scheduledTime: "19:00", planningState: "scheduled", estimatedMinutes: 60 }),
    mine("demo-tax", "確定申告の書類を集める", { dueDate: day(-3), planningState: "scheduled" }),
    mine("demo-dentist", "歯医者を予約する", {}),
    mine("demo-book", "借りた本を返す", {}),
    mine("demo-plan", "旅行の候補を3つ挙げる", { scheduledDate: day(2), planningState: "scheduled" }),
    ...fixtureRawQuests.map(q => ({ ...q })),
  ];
  const replace = (next: Quest) => { quests = [next, ...quests.filter(q => q.id !== next.id)]; return next; };
  const port: AllForPort = {
    demo: true,
    today: () => FIXTURE_TODAY,
    quests: () => quests,
    create: async input => replace({ ...(fixtureRawQuests[0] as Quest), id: `demo-${Date.now()}`, assignee: { type: "self", id: "self", label: "", handoffState: "none" }, humanRequest: null, parentQuestId: "", ...input, createdAt: stamp(), updatedAt: stamp() } as Quest),
    update: async (quest, patch) => replace({ ...quest, ...patch, updatedAt: stamp() } as Quest),
    complete: async quest => ({ quest: replace({ ...quest, lifecycleState: "completed", done: true, updatedAt: stamp() }), character: { level: 12, xp: 340, nextXp: 500 } as CharacterState }),
  };
  unmount?.();
  unmount = mountAllFor(root, port);
}

async function showProduction(uid: string, email: string): Promise<void> {
  message("読み込んでいます", "やることを取得しています…");
  try {
    const { createProductionRuntime } = await import("../relay-forge/production.ts");
    const repository = new QuestForgeRepository({ getToken: force => getIdToken(force) });
    let runtime = await createProductionRuntime(repository, uid, email);
    let quests: Quest[] = [...runtime.quests];
    const replace = (next: Quest) => { quests = [next, ...quests.filter(q => q.id !== next.id)]; return next; };
    const port: AllForPort = {
      demo: false,
      today: localToday,
      quests: () => quests,
      create: async input => replace(questOf(await runtime.questPort.createQuest(input))),
      update: async (quest, patch) => replace(questOf(await runtime.questPort.updateQuest(quest.id, { ...patch, expectedUpdatedAt: quest.updatedAt }), quest.id)),
      complete: async quest => {
        const response = await runtime.questPort.scoreQuest(quest.id, "up", quest.updatedAt);
        return { quest: replace(questOf(response, quest.id)), character: (response.character as CharacterState | undefined) ?? null };
      },
      refresh: runtime.refreshWorkspace ? async () => { runtime = await runtime.refreshWorkspace!(); quests = [...runtime.quests]; } : undefined,
      signOut: async () => { await signOutUser(); checkAuth(); },
    };
    unmount?.();
    unmount = mountAllFor(root, port);
  } catch {
    message("読み込めませんでした", "通信を確認して、もう一度試してください。データは変更されていません。", [["再試行", () => { void showProduction(uid, email); }], ["デモを見る", () => { void showDemo(); }]]);
  }
}

function checkAuth(): void {
  stopAuth?.();
  stopAuth = observeAuthState(state => {
    if (state.status === "authenticated") { void showProduction(state.user.uid, state.user.email); return; }
    if (state.status === "checking") { message("確認しています", "サインイン状態を確認しています…"); return; }
    message("Guilduo — All for ADHD", "ひとつずつ、迷わず進めるための画面です。Googleでサインインすると、いつものやることがそのまま使えます。", [
      ["Googleでサインイン", () => { void signIn().catch(() => message("サインインできませんでした", "もう一度試してください。", [["再試行", checkAuth]])); }],
      ["デモを見る", () => { void showDemo(); }],
    ]);
  });
}

if (new URLSearchParams(location.search).has("demo")) void showDemo();
else checkAuth();

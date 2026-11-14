/**
 * Battle in All for ADHD's layout (Penpot page 17): one card for the fight,
 * equal command buttons, a preview before anything is written, and the MP
 * sources and the record folded after three and one. Rules and requests stay
 * Relay Forge's own (preview, then execute; a stale turn needs a refresh).
 */

import { createElement, ChevronDown } from "lucide";
import { el } from "../relay-forge/primitives/dom.ts";
import {
  battleBusy, cancelBattlePreview, executeCommand, previewCommand, refreshBattle,
  type BattleCallbacks, type BattleModel, type BattleState,
} from "../relay-forge/screens/battle-model.ts";
import { tx } from "./copy.ts";

export interface BattleViewHost {
  readonly rerender: () => void;
  readonly announce: (message: string) => void;
  readonly openQuest: (id: string) => void;
}

const chevron = () => createElement(ChevronDown, { width: 16, height: 16, "stroke-width": 1.75, "aria-hidden": "true" });
const WEAK: Record<string, () => string> = { todo: () => tx("1回きり"), daily: () => tx("毎日"), habit: () => tx("習慣") };

function bar(label: string, value: number, max: number, tone: string): HTMLElement {
  const percent = max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0;
  return el("div", { class: "a4-bt-bar", "data-tone": tone },
    el("span", { class: "a4-bt-bar-head" }, el("span", {}, label), el("span", {}, `${value} / ${max}`)),
    el("span", { class: "a4-bt-track", role: "meter", "aria-label": label, "aria-valuemin": "0", "aria-valuemax": String(max), "aria-valuenow": String(value) },
      el("span", { class: "a4-bt-fill", style: `width:${percent}%` })));
}

function fold(summary: string, items: readonly HTMLElement[]): HTMLElement | null {
  if (!items.length) return null;
  return el("details", { class: "a4-bill-fold a4-bt-fold" }, el("summary", {}, summary, chevron()), el("ul", { class: "a4-bt-rows" }, ...items));
}

export function battleView(model: BattleModel, state: BattleState, callbacks: BattleCallbacks, host: BattleViewHost, empty: boolean): HTMLElement {
  const busy = battleBusy(state);
  const refresh = el("button", { type: "button", class: "a4-link", disabled: busy }, tx("更新"));
  refresh.addEventListener("click", () => { void refreshBattle(state, callbacks, host.rerender); });
  if (empty) {
    return el("div", { class: "a4-bt" }, el("div", { class: "a4-bill-card a4-bt-card" },
      el("div", { class: "a4-bt-head" }, el("p", { class: "a4-meta" }, state.phase === "refreshing" ? tx("読み込んでいます") : tx("戦闘の状態を読み込めませんでした。")), refresh)));
  }
  // Boss names come in the reader's language; server log lines follow suit.
  const boss = model.bossLabel || model.bossName;
  const words = (text: string) => text.replace(/(\d+)\s*damage/gi, (_m, n: string) => tx("{count}ダメージ", { count: n })).split(model.bossName).join(boss);

  const card = el("section", { class: "a4-bill-card a4-bt-card", "aria-label": boss },
    el("div", { class: "a4-bt-head" },
      el("strong", { class: "a4-bt-boss" }, boss), el("span", { class: "a4-bill-chip" }, tx("ターン {turn}", { turn: model.turn })), refresh),
    model.weakKind ? el("p", { class: "a4-meta" }, tx("弱点は{kind}のタスク", { kind: WEAK[model.weakKind]?.() ?? model.weakKind })) : null,
    bar(tx("ボスのHP"), model.bossHp, model.bossMaxHp, "boss"),
    bar(tx("自分のHP"), model.playerHp, model.playerMaxHp, "self"),
    bar("MP", model.mp, model.maxMp, "mp"),
    model.statuses.length ? el("div", { class: "a4-bt-statuses" }, ...model.statuses.map(status =>
      el("span", { class: "a4-net-chip", "data-tone": status.tone === "review" || status.tone === "blocked" ? "review" : "done" }, `${status.label} ${status.value}`))) : null,
    model.ended ? el("p", { class: "a4-meta" }, tx("この戦闘は終わりました。")) : null);

  // Equal buttons; a command short of MP says how much is missing.
  const hand = el("div", { class: "a4-bt-hand" }, ...model.commands.map(command => {
    const short = command.mpCost - model.mp;
    const node = el("button", { type: "button", class: "a4-bt-cmd", disabled: busy || !command.enabled || state.needsRefresh, "aria-pressed": String(state.pendingCommand === command.id), "data-short": String(short > 0) },
      el("strong", {}, command.label),
      el("span", { class: "a4-meta" }, `MP ${command.mpCost}`, short > 0 ? el("span", { class: "a4-bt-short" }, tx("あと {count}", { count: short })) : null));
    if (!command.enabled && command.blockedReason) node.title = command.blockedReason;
    node.addEventListener("click", () => { void previewCommand(model, state, callbacks, command.id, host.rerender); });
    return node;
  }));

  let preview: HTMLElement | null = null;
  if (state.pendingCommand) {
    const label = model.commands.find(command => command.id === state.pendingCommand)?.label ?? state.pendingCommand;
    const before = state.preview?.before;
    const after = state.preview?.after;
    const change = (name: string, from: number, to: number, signed = true) => el("div", { class: "a4-bt-change" }, el("span", {}, name),
      el("strong", {}, from === to ? String(from) : `${from} → ${to}`),
      el("span", { class: "a4-meta" }, from === to ? tx("変化なし") : signed ? `${to - from > 0 ? "+" : "−"}${Math.abs(to - from)}` : ""));
    const again = el("button", { type: "button", class: "a4-button", disabled: busy }, tx("選び直す"));
    again.addEventListener("click", () => { if (cancelBattlePreview(state)) host.rerender(); });
    const run = el("button", { type: "button", class: "a4-button a4-primary", disabled: busy || state.phase !== "previewed" }, tx("この手を実行"));
    run.addEventListener("click", () => { void executeCommand(model, state, callbacks, host.rerender, host.announce); });
    preview = el("section", { class: "a4-bill-card a4-bt-preview", "aria-live": "polite" },
      el("h3", { class: "a4-bt-sub" }, tx("{command} を実行すると", { command: label })),
      before && after ? el("div", {}, change(tx("ボスのHP"), before.bossHp, after.bossHp), change(tx("自分のHP"), before.playerHp, after.playerHp),
        change("MP", before.mp, after.mp), change(tx("ターン"), before.turn, after.turn, false))
        : el("p", { class: "a4-meta" }, state.phase === "previewing" ? tx("結果を計算しています") : ""),
      el("p", { class: "a4-meta" }, state.phase === "submitting" ? tx("実行しています") : tx("まだ実行していません。")),
      el("div", { class: "a4-actions" }, again, run));
  }
  const failure = state.failure ? el("div", { class: "a4-bill-alert", role: "alert" }, el("span", {}, state.failure.code === "battle_mp_insufficient" ? tx("MPが足りません。タスクを終えてMPをためてください。") : state.failure.message),
    state.needsRefresh ? (() => { const again = el("button", { type: "button", class: "a4-link", disabled: busy }, tx("最新にする")); again.addEventListener("click", () => { void refreshBattle(state, callbacks, host.rerender); }); return again; })() : null) : null;

  const source = (item: BattleModel["mpSources"][number]) => {
    const open = el("button", { type: "button", class: "a4-bt-row" }, el("span", {}, item.title), el("span", { class: "a4-bt-mp" }, `MP +${item.mpGain}`));
    open.addEventListener("click", () => host.openQuest(item.id));
    return el("li", {}, open);
  };
  const record = (event: BattleModel["timeline"][number]) => {
    const at = Date.parse(event.at);
    return el("li", { class: "a4-bt-row" }, el("span", {}, words(event.text)),
      el("span", { class: "a4-meta" }, Number.isFinite(at) ? new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""));
  };
  const sources = model.mpSources;
  const timeline = model.timeline;
  return el("div", { class: "a4-bt" }, card,
    el("h2", { class: "a4-bt-sub" }, tx("次の一手")), hand, failure, preview,
    sources.length ? el("h2", { class: "a4-bt-sub" }, tx("タスクを終えてMPをためる")) : null,
    sources.length ? el("ul", { class: "a4-bt-rows" }, ...sources.slice(0, 3).map(source)) : null,
    fold(tx("ほかのタスク {count}件", { count: sources.length - 3 }), sources.slice(3).map(source)),
    timeline.length ? el("h2", { class: "a4-bt-sub" }, tx("これまでの記録")) : null,
    timeline.length ? el("ul", { class: "a4-bt-rows" }, record(timeline[0]!)) : null,
    fold(tx("記録をすべて見る {count}件", { count: timeline.length - 1 }), timeline.slice(1).map(record)));
}

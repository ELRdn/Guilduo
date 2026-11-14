/**
 * Connections in All for ADHD's layout (Penpot page 17): what needs attention
 * first, a state chip instead of a colour line, the action on the row, and the
 * authentication details folded. Requests and the disconnect confirmation
 * content stay Relay Forge's own.
 */

import { createElement, ChevronDown, ChevronRight } from "lucide";
import { t } from "../../i18n.ts";
import { el } from "../relay-forge/primitives/dom.ts";
import { relayText } from "../relay-forge/relay-copy.ts";
import { connectionSyncDirection, needsAttention, type ConnectionActionResult, type ConnectionsModel, type ConnectionView } from "../relay-forge/screens/connections-model.ts";
import type { ConnectionsState } from "../relay-forge/screens/connections.ts";
import { tx } from "./copy.ts";

export interface ConnectionsViewHost {
  readonly mobile: boolean;
  readonly rerender: () => void;
  readonly announce: (message: string) => void;
  readonly openQuest: (id: string) => void;
  readonly agentName: (id: string) => string;
  readonly port: {
    previewSync(id: string): Promise<ConnectionActionResult>;
    runSync(id: string): Promise<ConnectionActionResult>;
    reconnect(id: string): Promise<ConnectionActionResult>;
    disconnect(id: string): Promise<ConnectionActionResult>;
  };
}

const icon = (node: typeof ChevronDown) => createElement(node, { width: 16, height: 16, "stroke-width": 1.75, "aria-hidden": "true" });
const when = (value: string) => {
  const at = Date.parse(value);
  return Number.isFinite(at) ? new Date(at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
};
function chip(connection: ConnectionView): HTMLElement {
  const map: Record<ConnectionView["health"], [string, string]> = {
    expired: [tx("再接続が必要"), "review"], permission_required: [tx("許可が必要"), "review"], degraded: [tx("同期に問題"), "review"],
    connected: [tx("接続済み"), "done"], not_connected: [tx("未接続"), "neutral"], unavailable: [tx("近日対応"), "neutral"],
  };
  const [label, tone] = map[connection.health];
  return el("span", { class: "a4-net-chip", "data-tone": tone }, label);
}
function rowLine(connection: ConnectionView): string {
  if (connection.health === "unavailable") return tx("次の開発段階で使えるようになります");
  if (connection.health === "not_connected") return connection.summary;
  if (needsAttention(connection) && connection.affectedQuests.length && connection.health !== "degraded") return tx("タスク{count}件の同期が止まっています", { count: connection.affectedQuests.length });
  if (connection.health === "degraded" && connection.lastSyncedAt) return tx("{time} の同期で問題がありました", { time: when(connection.lastSyncedAt) });
  return connection.lastSyncedAt ? tx("{time} に同期", { time: when(connection.lastSyncedAt) }) : tx("まだ同期していません");
}

export function connectionsView(model: ConnectionsModel, state: ConnectionsState, host: ConnectionsViewHost): HTMLElement {
  const busy = state.busyId !== null;
  const select = (id: string, detail: boolean) => {
    state.selectedId = id; state.result = null; state.resultId = null; state.confirmingDisconnect = false;
    if (!busy) state.phase = "idle";
    state.mobileDetailOpen = detail;
    host.rerender();
  };
  async function run(connection: ConnectionView, phase: ConnectionsState["phase"], work: () => Promise<ConnectionActionResult>): Promise<void> {
    if (state.busyId !== null || model.writeHeld) return;
    state.busyId = connection.id; state.phase = phase; state.result = null; state.resultId = null;
    host.rerender();
    let result: ConnectionActionResult;
    try { result = await work(); } catch { result = { ok: false, code: "failed", message: relayText("connectionFailed") }; }
    if (phase === "previewing" && result.ok && result.preview === undefined) result = { ok: false, code: "invalid_response", message: relayText("connectionInvalidResponse") };
    state.busyId = null;
    if (state.selectedId === connection.id) { state.result = result; state.resultId = connection.id; state.phase = result.ok ? (phase === "previewing" ? "previewed" : "done") : "failed"; }
    else state.phase = "idle";
    host.rerender();
    host.announce(`${connection.name}: ${result.message}`);
  }
  const reconnect = (connection: ConnectionView) => { void run(connection, "running", () => host.port.reconnect(connection.id)); };

  // The row carries its one action: reconnect, check, or set up.
  function row(connection: ConnectionView): HTMLElement {
    const selected = !host.mobile && connection.id === state.selectedId;
    const open = el("button", { type: "button", class: "a4-cn-open", "aria-current": String(selected) },
      el("span", { class: "a4-cn-name" }, connection.name, chip(connection)), el("span", { class: "a4-meta" }, rowLine(connection)));
    open.addEventListener("click", () => select(connection.id, host.mobile));
    let action: HTMLElement | null = null;
    if (connection.health === "degraded") { action = el("button", { type: "button", class: "a4-button", disabled: busy }, tx("確認")); action.addEventListener("click", () => select(connection.id, host.mobile)); }
    else if (connection.canReconnect && connection.health !== "connected") {
      action = el("button", { type: "button", class: "a4-button", disabled: busy || model.writeHeld }, connection.health === "not_connected" ? tx("設定する") : tx("再接続"));
      action.addEventListener("click", () => reconnect(connection));
    }
    return el("li", { class: "a4-cn-row", "data-selected": String(selected), "data-muted": String(connection.health === "unavailable") }, open, action);
  }

  function detail(connection: ConnectionView): HTMLElement {
    if (state.confirmingDisconnect && !busy) {
      // The confirmation says the same as before; stopping is the main choice.
      const keep = el("button", { type: "button", class: "a4-button a4-primary" }, tx("やめる"));
      keep.addEventListener("click", () => { state.confirmingDisconnect = false; host.rerender(); });
      const go = el("button", { type: "button", class: "a4-button", disabled: model.writeHeld }, tx("接続を解除"));
      go.addEventListener("click", () => { state.confirmingDisconnect = false; void run(connection, "running", () => host.port.disconnect(connection.id)); });
      requestAnimationFrame(() => keep.focus());
      return el("div", { class: "a4-bill-card a4-cn-confirm", role: "alertdialog", "aria-label": tx("接続を解除すると次のことが起きます") },
        el("h3", { class: "a4-bt-sub" }, tx("接続を解除すると次のことが起きます")),
        el("ul", { class: "a4-bill-points" }, ...[`${connection.name}: ${relayText("connectionRevokeHint")}`,
          ...(connection.id === "google-calendar" || connection.id === "google-tasks" ? [relayText("connectionGoogleRevoke")] : []),
          tx("紐づくタスクの同期が止まります。タスクは削除しません。")].map(line => el("li", {}, line))),
        el("div", { class: "a4-actions" }, keep, go));
    }
    const primary: HTMLElement[] = [];
    if (connection.canReconnect && connection.health !== "connected") {
      const button = el("button", { type: "button", class: "a4-button a4-primary", disabled: busy || model.writeHeld }, connection.health === "not_connected" ? tx("設定する") : tx("再接続する"));
      button.addEventListener("click", () => reconnect(connection));
      primary.push(button);
    }
    if (connection.canSync) {
      const preview = el("button", { type: "button", class: "a4-button", disabled: busy || model.writeHeld }, t("integration.previewLive"));
      preview.addEventListener("click", () => { void run(connection, "previewing", () => host.port.previewSync(connection.id)); });
      const ready = state.phase === "previewed" && state.resultId === connection.id && state.result?.preview !== undefined;
      const sync = el("button", { type: "button", class: "a4-button a4-primary", disabled: busy || model.writeHeld || !ready }, t("integration.confirmSync"));
      sync.addEventListener("click", () => { if (ready) void run(connection, "running", () => host.port.runSync(connection.id)); });
      primary.push(el("div", { class: "a4-actions" }, preview, sync));
    }
    let outcome: HTMLElement | null = null;
    if (state.busyId === connection.id) outcome = el("p", { class: "a4-meta", role: "status" }, state.phase === "previewing" ? relayText("connectionPreviewing") : tx("実行しています"));
    else if (state.result && state.resultId === connection.id) {
      const preview = state.result.preview;
      outcome = !state.result.ok ? el("div", { class: "a4-bill-alert", role: "alert" }, state.result.message)
        : state.phase === "previewed" && preview ? el("div", { class: "a4-cn-preview", role: "status" }, el("strong", {}, t("integration.preview")),
          el("ul", { class: "a4-bill-points" }, ...[[relayText("connectionCreated"), preview.imported], [relayText("connectionUpdated"), preview.updated], [relayText("connectionSkipped"), preview.skipped], [relayText("connectionConflicts"), preview.conflicts ?? 0]].map(([label, count]) => el("li", {}, `${label}: ${count}`))),
          el("p", { class: "a4-meta" }, relayText("connectionPreviewOnly")))
        : el("p", { class: "a4-meta", role: "status" }, state.result.message);
    }
    const quests = connection.affectedQuests.map(quest => {
      const open = el("button", { type: "button", class: "a4-set-row" }, el("span", { class: "a4-set-copy" }, el("strong", {}, quest.title)), icon(ChevronRight));
      open.addEventListener("click", () => host.openQuest(quest.id));
      return open;
    });
    const fact = (label: string, value: string) => value ? el("div", { class: "a4-cn-fact" }, el("span", { class: "a4-meta" }, label), el("span", {}, value)) : null;
    const disconnect = connection.canDisconnect ? el("button", { type: "button", class: "a4-link a4-cn-disconnect", disabled: busy || model.writeHeld }, tx("接続を解除")) : null;
    disconnect?.addEventListener("click", () => { state.confirmingDisconnect = true; host.rerender(); });
    return el("div", { class: "a4-cn-detail" },
      host.mobile ? el("div", { class: "a4-cn-name" }, chip(connection)) : el("div", { class: "a4-cn-name a4-cn-title" }, el("h2", { tabindex: -1 }, connection.name), chip(connection)),
      el("p", { class: "a4-cn-summary" }, connection.summary),
      connection.lastError ? el("div", { class: "a4-cn-error" }, connection.lastError) : null,
      ...primary, outcome,
      quests.length ? el("section", {}, el("h3", { class: "a4-net-group-head" }, tx("止まっているタスク"), el("span", { class: "a4-meta" }, String(quests.length))), el("div", { class: "a4-set-group" }, ...quests)) : null,
      el("div", { class: "a4-cn-facts" },
        fact(tx("接続先"), connection.accountLabel), fact(tx("最後の同期"), when(connection.lastSyncedAt)),
        fact(tx("操作できるAgent"), connection.affectedAgents.map(host.agentName).join(", "))),
      el("details", { class: "a4-bill-fold" }, el("summary", {}, tx("認証方式と権限を見る"), icon(ChevronDown)),
        el("div", { class: "a4-cn-auth" }, fact(tx("認証方式"), connection.auth),
          connection.requiredScopes.length ? fact(tx("必要な権限"), connection.requiredScopes.join(", ")) : null,
          connection.canSync ? fact(tx("同期の向き"), t(`integration.direction.${connectionSyncDirection(connection.id)}`)) : null)),
      disconnect);
  }

  const counts = { all: model.connections.length, attention: model.connections.filter(needsAttention).length, connected: model.connections.filter(entry => entry.health === "connected").length };
  const current = model.connections.find(entry => entry.id === state.selectedId) ?? null;
  // A phone shows one connection as its own page.
  if (host.mobile && state.mobileDetailOpen && current) {
    const back = el("button", { type: "button", class: "a4-link" }, tx("← 連携"));
    back.addEventListener("click", () => { state.mobileDetailOpen = false; state.confirmingDisconnect = false; host.rerender(); });
    return el("div", { class: "a4-cn", "data-own-frame": "true" }, back, el("h1", { class: "a4-title", tabindex: -1 }, current.name), detail(current));
  }
  const filters = el("div", { class: "a4-net-switch", role: "group", "aria-label": tx("表示") }, ...([["all", tx("すべて")], ["attention", tx("要対応")], ["connected", tx("接続中")]] as const).map(([id, label]) => {
    const pill = el("button", { type: "button", class: "a4-net-pill", "aria-pressed": String(state.filter === id) }, `${label} ${counts[id]}`);
    pill.addEventListener("click", () => { state.filter = id; host.rerender(); });
    return pill;
  }));
  const shown = model.connections.filter(entry => state.filter === "all" || (state.filter === "attention" ? needsAttention(entry) : entry.health === "connected"));
  if (!host.mobile && !current && shown[0]) state.selectedId = shown[0].id;
  const groups = ([[tx("要対応"), shown.filter(needsAttention)], [tx("接続中"), shown.filter(entry => entry.health === "connected")],
    [tx("未接続"), shown.filter(entry => !needsAttention(entry) && entry.health !== "connected")]] as const)
    .filter(([, entries]) => entries.length)
    .map(([title, entries]) => el("section", { class: "a4-cn-group" }, el("h2", { class: "a4-bt-sub" }, `${title} ${entries.length}`), el("ul", { class: "a4-cn-rows" }, ...entries.map(row))));
  const list = el("div", { class: "a4-cn-list" }, ...(groups.length ? groups : [el("p", { class: "a4-net-empty" }, tx("表示できる連携はありません。"))]));
  const selected = model.connections.find(entry => entry.id === state.selectedId) ?? null;
  return el("div", { class: "a4-cn" }, filters,
    host.mobile ? list : el("div", { class: "a4-cn-split" }, list, selected ? el("div", { class: "a4-bill-card a4-cn-side" }, detail(selected)) : null));
}

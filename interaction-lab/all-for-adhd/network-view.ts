/**
 * Network in All for ADHD's layout (Penpot page 17): the blocked roots come
 * first as a list with their reasons; the drawing stays Relay Forge's own and
 * opens from the switch. On a phone a root opens as its own page.
 */

import { el } from "../relay-forge/primitives/dom.ts";
import type { NetworkModel, NetworkNode, NetworkEdge } from "../relay-forge/screens/network-model.ts";
import { tx } from "./copy.ts";

export interface NetworkViewHost {
  readonly mobile: boolean;
  readonly mode: "list" | "graph";
  readonly selected: string | null;
  readonly detailOpen: boolean;
  readonly blockedReason: (questId: string) => string;
  readonly setMode: (mode: "list" | "graph") => void;
  readonly select: (rootId: string) => void;
  readonly closeDetail: () => void;
  readonly openQuest: (questId: string) => void;
  readonly reconnect: (connectionId: string) => void;
  /** Relay Forge's drawing centred on a root, labels already in the reader's words. */
  readonly graph: (rootId: string | null) => HTMLElement;
}

type Entry = { readonly node: NetworkNode; readonly edge: NetworkEdge };

export const kindLabel = (kind: NetworkNode["kind"]) => kind === "quest" ? tx("タスク") : kind === "connection" ? tx("連携") : tx("担当");
export function stateLabel(node: NetworkNode): { label: string; tone: string } | null {
  if (node.kind === "actor") return null;
  if (node.kind === "connection") return node.state === "healthy" ? { label: tx("接続中"), tone: "done" } : { label: tx("再接続が必要"), tone: "review" };
  const labels: Record<string, [string, string]> = {
    review: [tx("判断待ち"), "review"], blocked: [tx("止まっている"), "review"], working: [tx("進行中"), "done"],
    scheduled: [tx("未着手"), "neutral"], done: [tx("完了"), "done"],
  };
  const pick = labels[node.state];
  return pick ? { label: pick[0], tone: pick[1] } : null;
}

const chip = (label: string, tone: string) => el("span", { class: "a4-net-chip", "data-tone": tone }, label);

export function networkView(model: NetworkModel, host: NetworkViewHost): HTMLElement {
  const blockersOf = (id: string): Entry[] => model.edges
    .filter(edge => edge.toId === id && edge.blocking && (edge.kind === "dependency" || edge.kind === "sync"))
    .map(edge => ({ node: model.nodes.get(edge.fromId)!, edge })).filter(entry => entry.node);
  const reason = (id: string): string => {
    const written = host.blockedReason(id);
    if (written) return written;
    const blockers = blockersOf(id);
    const connection = blockers.find(entry => entry.node.kind === "connection");
    if (connection) return tx("{name}の再接続が必要です", { name: connection.node.label });
    if (blockers.some(entry => entry.node.state === "review")) return tx("あなたの確認を待っています");
    if (blockers.length) return tx("前のタスクが終わっていません");
    return tx("止まっている理由はまだ書かれていません");
  };
  const chains = model.chains;
  const selected = chains.find(chain => chain.rootId === host.selected)?.rootId ?? chains[0]?.rootId ?? null;
  const waiting = new Set(chains.flatMap(chain => chain.waitingIds)).size;

  const entryRow = (node: NetworkNode, forcedChip?: { label: string; tone: string }) => {
    const state = forcedChip ?? stateLabel(node);
    const action = node.kind === "connection" ? el("button", { type: "button", class: "a4-button" }, tx("再接続")) : null;
    action?.addEventListener("click", () => host.reconnect(node.id));
    const open = node.kind === "quest" ? el("button", { type: "button", class: "a4-net-entry-title" }, node.label) : el("strong", { class: "a4-net-entry-title" }, node.label);
    if (node.kind === "quest") open.addEventListener("click", () => host.openQuest(node.id));
    return el("li", { class: "a4-net-entry" },
      el("div", { class: "a4-net-entry-main" },
        el("span", { class: "a4-net-kind" }, kindLabel(node.kind), state ? chip(state.label, state.tone) : null),
        open, node.kind === "connection" || !node.sub ? null : el("span", { class: "a4-meta" }, node.sub)),
      action);
  };
  const group = (title: string, entries: readonly HTMLElement[], empty: string) => el("section", { class: "a4-net-group" },
    el("h3", { class: "a4-net-group-head" }, title, el("span", { class: "a4-meta" }, String(entries.length))),
    entries.length ? el("ul", { class: "a4-net-entries" }, ...entries) : el("p", { class: "a4-meta" }, empty));

  function detail(rootId: string): HTMLElement {
    const root = model.nodes.get(rootId)!;
    const chain = chains.find(item => item.rootId === rootId)!;
    const open = el("button", { type: "button", class: "a4-button" }, tx("開く"));
    open.addEventListener("click", () => host.openQuest(rootId));
    return el("div", { class: "a4-net-detail" },
      el("div", { class: "a4-net-detail-head" },
        el("div", {}, el("h2", { class: "a4-net-detail-title", tabindex: -1 }, root.label), root.sub ? el("span", { class: "a4-meta" }, root.sub) : null), open),
      group(tx("このタスクを止めているもの"), blockersOf(rootId).map(entry => entryRow(entry.node)), tx("止めているものは見つかりません。")),
      group(tx("このタスクを待っているもの"), chain.waitingIds.map(id => model.nodes.get(id)).filter((node): node is NetworkNode => !!node)
        .map(node => entryRow(node, { label: tx("待機中"), tone: "neutral" })), tx("待っているタスクはありません。")));
  }

  // A phone shows one root at a time as its own page.
  if (host.mobile && host.detailOpen && selected) {
    const back = el("button", { type: "button", class: "a4-link" }, tx("← つながり"));
    back.addEventListener("click", host.closeDetail);
    return el("div", { class: "a4-net", "data-own-frame": "true" }, back, el("h1", { class: "a4-title", tabindex: -1 }, tx("止まっている理由")), detail(selected));
  }

  const toggle = el("div", { class: "a4-net-switch", role: "group", "aria-label": tx("表示") }, ...(["list", "graph"] as const).map(mode => {
    const node = el("button", { type: "button", class: "a4-net-pill", "aria-pressed": String(host.mode === mode) }, mode === "list" ? tx("一覧") : tx("図"));
    node.addEventListener("click", () => host.setMode(mode));
    return node;
  }));
  const summary = el("p", { class: "a4-net-summary" }, tx("止まっている起点 {roots}件・待っているタスク {waiting}件", { roots: chains.length, waiting }));
  const head = el("div", { class: "a4-net-head" }, summary, toggle);
  if (host.mode === "graph") return el("div", { class: "a4-net", "data-mode": "graph" }, head, host.graph(selected));
  if (!chains.length) return el("div", { class: "a4-net" }, head, el("p", { class: "a4-net-empty" }, tx("止まっているタスクはありません。")));
  const list = el("ul", { class: "a4-net-roots" }, ...chains.map(chain => {
    const node = model.nodes.get(chain.rootId)!;
    const row = el("button", { type: "button", class: "a4-net-root", "aria-current": String(!host.mobile && chain.rootId === selected) },
      el("span", { class: "a4-net-root-title" }, node.label, chain.waitingIds.length ? el("span", { class: "a4-meta" }, tx("待ち {count}", { count: chain.waitingIds.length })) : null),
      el("span", { class: "a4-meta" }, reason(chain.rootId)));
    row.addEventListener("click", () => host.select(chain.rootId));
    return el("li", {}, row);
  }));
  return el("div", { class: "a4-net" }, head, host.mobile ? list : el("div", { class: "a4-net-split" }, list, detail(selected!)));
}

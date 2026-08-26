/**
 * Network — the relationship explorer.
 *
 * The question: "どのQuest、Actor、Connectionが、何へ影響しているか".
 *
 * This is not a decorative node graph. Three rules shape it:
 *
 *  1. There is always exactly one focused node, and the drawing is its
 *     neighbourhood — upstream above, downstream below — never the whole graph.
 *     A whole-graph hairball answers no question.
 *  2. Every edge carries a reason in words ("QF-176 が未完了のため停止"), because
 *     "why are these connected" is the actual question, not "are they".
 *  3. The outline is a first-class view, not an accessibility afterthought. It
 *     is one segment away at all times and carries the identical information,
 *     so the screen works with no SVG, no pointer and no colour.
 *
 * Scroll ownership: the explanation rail scrolls; the canvas does not — it
 * re-lays out to fit, because a graph you must scroll to see is a graph you
 * cannot read.
 */

import type { Actor } from "../model.ts";
import { actorAvatar } from "../primitives/avatar.ts";
import { el, svg } from "../primitives/dom.ts";
import {
  EDGE_LABEL,
  type NetworkEdge,
  type NetworkModel,
  type NetworkNode,
} from "./network-model.ts";
import {
  type Metric,
  metricRow,
  type ScreenContext,
  type ScreenRender,
  screenEmpty,
  screenHeader,
  screenNotice,
  screenRegion,
  screenSkeleton,
  segmentControl,
  stateChip,
} from "./runtime.ts";

export * from "./network-model.ts";

/* ------------------------------------------------------------------ *
 * Screen state
 * ------------------------------------------------------------------ */

export interface NetworkState {
  /** The node the drawing is centred on. Null until the first selection. */
  focusId: string | null;
  view: "graph" | "outline";
  /** Focus history, so a walk through the graph can be walked back. */
  trail: string[];
  /** Mobile only. */
  upstreamOpen: boolean;
  downstreamOpen: boolean;
}

export function initialNetworkState(): NetworkState {
  return { focusId: null, view: "graph", trail: [], upstreamOpen: true, downstreamOpen: true };
}

interface Neighbourhood {
  readonly focus: NetworkNode;
  readonly upstream: ReadonlyArray<{ readonly node: NetworkNode; readonly edge: NetworkEdge }>;
  readonly downstream: ReadonlyArray<{ readonly node: NetworkNode; readonly edge: NetworkEdge }>;
}

function neighbourhood(model: NetworkModel, focusId: string): Neighbourhood | null {
  const focus = model.nodes.get(focusId);
  if (focus === undefined) return null;
  const upstream: Array<{ node: NetworkNode; edge: NetworkEdge }> = [];
  const downstream: Array<{ node: NetworkNode; edge: NetworkEdge }> = [];
  for (const edge of model.edges) {
    if (edge.toId === focusId) {
      const node = model.nodes.get(edge.fromId);
      if (node !== undefined) upstream.push({ node, edge });
    } else if (edge.fromId === focusId) {
      const node = model.nodes.get(edge.toId);
      if (node !== undefined) downstream.push({ node, edge });
    }
  }
  // Blocking edges first: the reason something is stuck outranks the rest.
  const rank = (entry: { edge: NetworkEdge }): number => (entry.edge.blocking ? 0 : 1);
  upstream.sort((left, right) => rank(left) - rank(right));
  downstream.sort((left, right) => rank(left) - rank(right));
  return { focus, upstream, downstream };
}

function defaultFocus(model: NetworkModel, selectedQuestId: string | null): string | null {
  if (selectedQuestId !== null && model.nodes.has(selectedQuestId)) return selectedQuestId;
  if (model.chains.length > 0) return model.chains[0]?.rootId ?? null;
  const first = model.nodes.keys().next();
  return first.done ? null : first.value;
}

/* ------------------------------------------------------------------ *
 * Node rendering
 * ------------------------------------------------------------------ */

const STATE_CHIP: Readonly<Record<NetworkNode["state"], { label: string; mark: string; tone: "review" | "blocked" | "working" | "scheduled" | "done" | "neutral" | "danger" }>> = {
  review: { label: "要判断", mark: "!?", tone: "review" },
  blocked: { label: "停止", mark: "//", tone: "blocked" },
  working: { label: "進行中", mark: ">>", tone: "working" },
  scheduled: { label: "予定", mark: "..", tone: "scheduled" },
  done: { label: "完了", mark: "OK", tone: "done" },
  healthy: { label: "接続中", mark: "==", tone: "working" },
  degraded: { label: "要対応", mark: "!!", tone: "danger" },
  neutral: { label: "", mark: "", tone: "neutral" },
};

function nodeChip(node: NetworkNode): HTMLElement | null {
  const chip = STATE_CHIP[node.state];
  return chip.label === "" ? null : stateChip({ tone: chip.tone, label: chip.label, mark: chip.mark });
}

function nodeCard(
  node: NetworkNode,
  context: ScreenContext,
  options: { readonly focused?: boolean; readonly role: "focus" | "upstream" | "downstream"; readonly onFocus: () => void },
): HTMLElement {
  const actor = node.kind === "actor" ? context.actors.get(node.id) ?? null : null;
  const card = el(
    "button",
    {
      type: "button",
      class: "rf-n-node",
      "data-kind": node.kind,
      "data-state": node.state,
      "data-role": options.role,
      "data-focused": options.focused === true ? "true" : "false",
      "data-node-id": node.id,
      "aria-current": options.focused === true ? "true" : null,
    },
    el(
      "span",
      { class: "rf-n-node-top" },
      actor === null
        ? el("span", { class: "rf-n-node-ref" }, node.ref)
        : actorAvatar(actor, { size: "row" }),
      actor === null ? null : el("span", { class: "rf-n-node-ref" }, node.ref),
      nodeChip(node),
    ),
    el("span", { class: "rf-n-node-label" }, node.label),
    el("span", { class: "rf-n-node-sub" }, node.sub),
    options.focused === true ? el("span", { class: "rf-visually-hidden" }, "中心のノード") : null,
  );
  card.addEventListener("click", () => options.onFocus());
  return card;
}

/* ------------------------------------------------------------------ *
 * Graph canvas
 *
 * Nodes are real buttons positioned on a deterministic grid; the edge layer is
 * an SVG using the same coordinates. Nothing is measured, so the drawing is
 * stable across re-renders and identical between a browser and a capture.
 * ------------------------------------------------------------------ */

const VIEW_W = 1000;
const VIEW_H = 620;
const ROW_UP = 84;
const ROW_MID = 310;
const ROW_DOWN = 536;

function laneX(index: number, total: number): number {
  if (total <= 1) return VIEW_W / 2;
  const margin = 130;
  return margin + ((VIEW_W - margin * 2) * index) / (total - 1);
}

/** Orthogonal route with one joint, matching the Quest Loom's connector language. */
function edgePath(fromX: number, fromY: number, toX: number, toY: number): string {
  const mid = (fromY + toY) / 2;
  return `M ${fromX} ${fromY} L ${fromX} ${mid} L ${toX} ${mid} L ${toX} ${toY}`;
}

function graphCanvas(
  view: Neighbourhood,
  context: ScreenContext,
  state: NetworkState,
  onFocus: (id: string) => void,
): HTMLElement {
  const nodes = el("div", { class: "rf-n-nodes" });
  const lines: SVGElement[] = [];

  const place = (element: HTMLElement, x: number, y: number): void => {
    element.style.left = `${(x / VIEW_W) * 100}%`;
    element.style.top = `${(y / VIEW_H) * 100}%`;
    nodes.append(element);
  };

  view.upstream.forEach((entry, index) => {
    const x = laneX(index, view.upstream.length);
    place(
      nodeCard(entry.node, context, { role: "upstream", onFocus: () => onFocus(entry.node.id) }),
      x,
      ROW_UP,
    );
    lines.push(
      svg("path", {
        class: "rf-n-edge",
        "data-kind": entry.edge.kind,
        "data-blocking": entry.edge.blocking ? "true" : "false",
        d: edgePath(x, ROW_UP + 46, VIEW_W / 2, ROW_MID - 52),
        fill: "none",
      }),
      svg("rect", { class: "rf-n-joint", x: String(x - 3), y: String((ROW_UP + 46 + ROW_MID - 52) / 2 - 3), width: "6", height: "6" }),
    );
  });

  view.downstream.forEach((entry, index) => {
    const x = laneX(index, view.downstream.length);
    place(
      nodeCard(entry.node, context, { role: "downstream", onFocus: () => onFocus(entry.node.id) }),
      x,
      ROW_DOWN,
    );
    lines.push(
      svg("path", {
        class: "rf-n-edge",
        "data-kind": entry.edge.kind,
        "data-blocking": entry.edge.blocking ? "true" : "false",
        d: edgePath(VIEW_W / 2, ROW_MID + 52, x, ROW_DOWN - 46),
        fill: "none",
      }),
      svg("rect", { class: "rf-n-joint", x: String(x - 3), y: String((ROW_MID + 52 + ROW_DOWN - 46) / 2 - 3), width: "6", height: "6" }),
    );
  });

  place(
    nodeCard(view.focus, context, { role: "focus", focused: true, onFocus: () => onFocus(view.focus.id) }),
    VIEW_W / 2,
    ROW_MID,
  );

  const canvas = el(
    "div",
    { class: "rf-n-canvas", role: "group", "aria-label": `${view.focus.label} の関係図` },
    el(
      "div",
      { class: "rf-n-lane-labels", "aria-hidden": "true" },
      el("span", null, "上流 — これが終わらないと進めない"),
      el("span", null, "下流 — これを待っている"),
    ),
    svg(
      "svg",
      { class: "rf-n-edges", viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, preserveAspectRatio: "none", "aria-hidden": "true" },
      ...lines,
    ) as unknown as Node,
    nodes,
  );

  /* Keyboard traversal: Up/Down move between the lanes, Left/Right along a
   * lane, Enter re-centres. The whole canvas is one tab stop. */
  canvas.addEventListener("keydown", (event) => {
    const key = event.key;
    if (key !== "ArrowUp" && key !== "ArrowDown" && key !== "ArrowLeft" && key !== "ArrowRight") return;
    const active = document.activeElement as HTMLElement | null;
    const role = active?.dataset.role ?? "focus";
    const lane = role === "upstream" ? view.upstream : role === "downstream" ? view.downstream : [];
    event.preventDefault();
    if (key === "ArrowLeft" || key === "ArrowRight") {
      if (lane.length === 0) return;
      const at = lane.findIndex((entry) => entry.node.id === active?.dataset.nodeId);
      const next = Math.min(lane.length - 1, Math.max(0, at + (key === "ArrowRight" ? 1 : -1)));
      canvas.querySelector<HTMLElement>(`[data-node-id="${lane[next]?.node.id ?? ""}"]`)?.focus();
      return;
    }
    const target = key === "ArrowUp"
      ? (role === "downstream" ? view.focus.id : view.upstream[0]?.node.id)
      : (role === "upstream" ? view.focus.id : view.downstream[0]?.node.id);
    if (target === undefined) return;
    canvas.querySelector<HTMLElement>(`[data-node-id="${target}"]`)?.focus();
  });

  return canvas;
}

/* ------------------------------------------------------------------ *
 * Outline — the same information, no drawing required
 * ------------------------------------------------------------------ */

function outlineView(view: Neighbourhood, context: ScreenContext, onFocus: (id: string) => void): HTMLElement {
  const lane = (
    title: string,
    entries: Neighbourhood["upstream"],
    emptyCopy: string,
  ): HTMLElement =>
    el(
      "section",
      { class: "rf-n-outline-lane" },
      el("h3", { class: "rf-n-outline-title" }, title),
      entries.length === 0
        ? el("p", { class: "rf-n-outline-empty" }, emptyCopy)
        : el(
          "ul",
          { class: "rf-n-outline-list" },
          ...entries.map((entry) => {
            const jump = el("button", { type: "button", class: "rf-jump" }, "中心にする");
            jump.addEventListener("click", () => onFocus(entry.node.id));
            return el(
              "li",
              { class: "rf-n-outline-row", "data-blocking": entry.edge.blocking ? "true" : "false" },
              el(
                "div",
                { class: "rf-n-outline-head" },
                el("span", { class: "rf-srow-id" }, entry.node.ref),
                el("span", { class: "rf-n-outline-kind" }, EDGE_LABEL[entry.edge.kind]),
                nodeChip(entry.node),
              ),
              el("p", { class: "rf-n-outline-label" }, entry.node.label),
              el("p", { class: "rf-n-outline-reason" }, entry.edge.reason),
              jump,
            );
          }),
        ),
    );

  return el(
    "div",
    { class: "rf-n-outline" },
    el(
      "div",
      { class: "rf-n-outline-focus" },
      el("span", { class: "rf-srow-id" }, view.focus.ref),
      el("strong", null, view.focus.label),
      nodeChip(view.focus),
    ),
    lane("上流 — これが終わらないと進めない", view.upstream, "上流はありません。このノードは誰も待っていません。"),
    lane("下流 — これを待っている", view.downstream, "下流はありません。止まっても他へ波及しません。"),
  );
}

/* ------------------------------------------------------------------ *
 * Explanation rail
 * ------------------------------------------------------------------ */

function reasonRail(
  model: NetworkModel,
  view: Neighbourhood,
  state: NetworkState,
  context: ScreenContext,
  onFocus: (id: string) => void,
): HTMLElement {
  const blocking = [...view.upstream, ...view.downstream].filter((entry) => entry.edge.blocking);
  const open = el("button", { type: "button", class: "rf-primary-button" }, view.focus.kind === "quest" ? "この Quest を開く" : "この対象を開く");
  open.addEventListener("click", () => context.onNavigate(view.focus.destination, view.focus.kind === "quest" ? view.focus.id : undefined));

  const back = el("button", { type: "button", class: "rf-secondary-button" }, "ひとつ戻る");
  back.addEventListener("click", () => {
    const previous = state.trail.pop();
    if (previous !== undefined) {
      state.focusId = previous;
      context.rerender();
    }
  });

  return screenRegion(
    "なぜ繋がっているか",
    { scroll: true, variant: "reasons" },
    el(
      "div",
      { class: "rf-n-focus-head" },
      el("span", { class: "rf-srow-id" }, view.focus.ref),
      nodeChip(view.focus),
    ),
    el("h3", { class: "rf-n-focus-title" }, view.focus.label),
    el("p", { class: "rf-n-focus-sub" }, view.focus.sub),
    el(
      "div",
      { class: "rf-n-focus-actions" },
      open,
      state.trail.length === 0 ? null : back,
    ),
    el("h4", { class: "rf-n-rail-label" }, blocking.length === 0 ? "停止させている接続" : `停止させている接続 ${blocking.length}件`),
    blocking.length === 0
      ? el("p", { class: "rf-n-rail-empty" }, "このノードを止めている接続はありません。")
      : el(
        "ul",
        { class: "rf-n-reasons" },
        ...blocking.map((entry) => el(
          "li",
          { class: "rf-n-reason", "data-kind": entry.edge.kind },
          el("span", { class: "rf-n-reason-kind" }, EDGE_LABEL[entry.edge.kind]),
          el("span", { class: "rf-n-reason-copy" }, entry.edge.reason),
        )),
      ),
    el("h4", { class: "rf-n-rail-label" }, "すべての接続"),
    el(
      "ul",
      { class: "rf-n-reasons" },
      ...[...view.upstream, ...view.downstream].map((entry) => {
        const row = el(
          "li",
          { class: "rf-n-reason", "data-kind": entry.edge.kind, "data-blocking": entry.edge.blocking ? "true" : "false" },
          el("span", { class: "rf-n-reason-kind" }, EDGE_LABEL[entry.edge.kind]),
          el("span", { class: "rf-n-reason-copy" }, entry.edge.reason),
        );
        return row;
      }),
    ),
    el("h4", { class: "rf-n-rail-label" }, "停止の連鎖"),
    model.chains.length === 0
      ? el("p", { class: "rf-n-rail-empty" }, "停止している連鎖はありません。")
      : el(
        "ul",
        { class: "rf-n-chains" },
        ...model.chains.map((chain) => {
          const button = el(
            "button",
            { type: "button", class: "rf-n-chain", "data-selected": chain.rootId === view.focus.id ? "true" : "false" },
            el("span", { class: "rf-srow-id" }, chain.rootRef),
            el("span", { class: "rf-n-chain-reason" }, chain.reason),
            el("span", { class: "rf-n-chain-count" }, `${chain.waitingIds.length}件が待機`),
          );
          button.addEventListener("click", () => onFocus(chain.rootId));
          return el("li", null, button);
        }),
      ),
  );
}

/* ------------------------------------------------------------------ *
 * Desktop
 * ------------------------------------------------------------------ */

function networkMetrics(model: NetworkModel): readonly Metric[] {
  const quests = [...model.nodes.values()].filter((node) => node.kind === "quest");
  const waiting = model.chains.reduce((total, chain) => total + chain.waitingIds.length, 0);
  return [
    { label: "停止の起点", value: String(model.chains.length), note: "根本原因のQuest", tone: "blocked" },
    { label: "待機中", value: String(waiting), note: "起点の下流", tone: "waiting" },
    { label: "Quest", value: String(quests.length), tone: "neutral" },
    { label: "接続", value: String(model.edges.length), note: "依存 / 包含 / 担当 / 同期", tone: "neutral" },
  ];
}

export function renderNetworkDesktop(
  model: NetworkModel,
  state: NetworkState,
  context: ScreenContext,
  selectedQuestId: string | null,
): ScreenRender {
  const loading = model.notices.some((notice) => notice.status === "loading");
  /* The resolved default is written back to state, so the very first move away
   * from it is recorded in the trail and can be walked back. */
  const focusId = state.focusId ?? defaultFocus(model, selectedQuestId);
  state.focusId = focusId;
  const view = focusId === null ? null : neighbourhood(model, focusId);

  const onFocus = (id: string): void => {
    if (state.focusId !== null && state.focusId !== id) state.trail.push(state.focusId);
    state.focusId = id;
    // A Quest node also moves the shared selection, so Command and Quests agree.
    if (model.nodes.get(id)?.kind === "quest") context.onSelectQuest(id);
    else context.rerender();
    context.announce(`${model.nodes.get(id)?.label ?? id} を中心にしました`);
  };

  const body = loading
    ? screenSkeleton(3, "node")
    : view === null
      ? screenEmpty(
        "関係を表示できる対象がありません",
        "Quest が読み込まれると、依存、担当、同期の接続がここに現れます。",
      )
      : state.view === "graph"
        ? graphCanvas(view, context, state, onFocus)
        : outlineView(view, context, onFocus);

  const main = el(
    "div",
    { class: "rf-screen rf-screen--network" },
    screenHeader({
      title: "Network",
      question: "どのQuest、Actor、Connectionが、何へ影響しているか。",
      meta: view === null ? [] : [{ label: "中心", value: view.focus.ref }],
      actions: [
        segmentControl(
          "表示",
          [
            { id: "graph", label: "関係図", count: view === null ? 0 : view.upstream.length + view.downstream.length },
            { id: "outline", label: "アウトライン", count: view === null ? 0 : view.upstream.length + view.downstream.length },
          ],
          state.view,
          (id) => {
            state.view = id as NetworkState["view"];
            context.rerender();
          },
        ),
      ],
    }),
    ...model.notices.map((notice) => screenNotice(notice)),
    metricRow(networkMetrics(model)),
    el(
      "div",
      { class: "rf-n-workspace" },
      screenRegion(state.view === "graph" ? "関係図" : "関係アウトライン", { variant: "canvas" }, body),
      view === null
        ? screenRegion("なぜ繋がっているか", { variant: "reasons" }, screenEmpty("対象がありません", "中心にするノードを選ぶと理由が出ます。"))
        : reasonRail(model, view, state, context, onFocus),
    ),
  );

  return { main };
}

/* ------------------------------------------------------------------ *
 * Mobile — a stepwise explorer, never a shrunken graph
 * ------------------------------------------------------------------ */

export function renderNetworkMobile(
  model: NetworkModel,
  state: NetworkState,
  context: ScreenContext,
  selectedQuestId: string | null,
): ScreenRender {
  const loading = model.notices.some((notice) => notice.status === "loading");
  const focusId = state.focusId ?? defaultFocus(model, selectedQuestId);
  state.focusId = focusId;
  const view = focusId === null ? null : neighbourhood(model, focusId);

  const onFocus = (id: string): void => {
    if (state.focusId !== null && state.focusId !== id) state.trail.push(state.focusId);
    state.focusId = id;
    if (model.nodes.get(id)?.kind === "quest") context.onSelectQuest(id);
    else context.rerender();
    context.announce(`${model.nodes.get(id)?.label ?? id} を中心にしました`);
  };

  if (loading) {
    return {
      main: el(
        "div",
        { class: "rf-screen rf-screen--network" },
        screenHeader({ title: "Network", question: "どのQuest、Actor、Connectionが、何へ影響しているか。" }),
        ...model.notices.map((notice) => screenNotice(notice)),
        screenSkeleton(4, "row"),
      ),
    };
  }

  if (view === null) {
    return {
      main: el(
        "div",
        { class: "rf-screen rf-screen--network" },
        screenHeader({ title: "Network", question: "どのQuest、Actor、Connectionが、何へ影響しているか。" }),
        ...model.notices.map((notice) => screenNotice(notice)),
        screenEmpty("関係を表示できる対象がありません", "Quest が読み込まれると接続が現れます。"),
      ),
    };
  }

  const lane = (
    title: string,
    entries: Neighbourhood["upstream"],
    open: boolean,
    toggle: () => void,
    emptyCopy: string,
  ): HTMLElement => {
    const header = el(
      "button",
      { type: "button", class: "rf-n-m-lane-head", "aria-expanded": open ? "true" : "false" },
      el("span", null, title),
      el("span", { class: "rf-n-m-lane-count" }, String(entries.length)),
    );
    header.addEventListener("click", () => {
      toggle();
      context.rerender();
    });
    return el(
      "section",
      { class: "rf-n-m-lane", "data-open": open ? "true" : "false" },
      header,
      !open
        ? null
        : entries.length === 0
          ? el("p", { class: "rf-n-outline-empty" }, emptyCopy)
          : el(
            "ul",
            { class: "rf-n-m-list" },
            ...entries.map((entry) => {
              const row = el(
                "button",
                { type: "button", class: "rf-n-m-row", "data-blocking": entry.edge.blocking ? "true" : "false" },
                el(
                  "span",
                  { class: "rf-n-m-row-top" },
                  el("span", { class: "rf-srow-id" }, entry.node.ref),
                  el("span", { class: "rf-n-outline-kind" }, EDGE_LABEL[entry.edge.kind]),
                  nodeChip(entry.node),
                ),
                el("span", { class: "rf-n-m-row-label" }, entry.node.label),
                el("span", { class: "rf-n-m-row-reason" }, entry.edge.reason),
              );
              row.addEventListener("click", () => onFocus(entry.node.id));
              return el("li", null, row);
            }),
          ),
    );
  };

  const back = el("button", { type: "button", class: "rf-secondary-button rf-n-m-back" }, "ひとつ戻る");
  back.addEventListener("click", () => {
    const previous = state.trail.pop();
    if (previous !== undefined) {
      state.focusId = previous;
      context.rerender();
    }
  });

  const open = el("button", { type: "button", class: "rf-primary-button" }, "この対象を開く");
  open.addEventListener("click", () => context.onNavigate(view.focus.destination, view.focus.kind === "quest" ? view.focus.id : undefined));

  const main = el(
    "div",
    { class: "rf-screen rf-screen--network", "data-mobile-view": "explorer" },
    screenHeader({
      title: "Network",
      question: "どのQuest、Actor、Connectionが、何へ影響しているか。",
      meta: [{ label: "停止の起点", value: String(model.chains.length) }],
    }),
    ...model.notices.map((notice) => screenNotice(notice)),
    el(
      "div",
      { class: "rf-n-m-focus", "data-kind": view.focus.kind, "data-state": view.focus.state },
      el(
        "div",
        { class: "rf-n-m-focus-top" },
        el("span", { class: "rf-srow-id" }, view.focus.ref),
        nodeChip(view.focus),
      ),
      el("h3", { class: "rf-n-m-focus-title" }, view.focus.label),
      el("p", { class: "rf-n-m-focus-sub" }, view.focus.sub),
      state.trail.length === 0 ? null : back,
    ),
    lane(
      "上流 — これが終わらないと進めない",
      view.upstream,
      state.upstreamOpen,
      () => { state.upstreamOpen = !state.upstreamOpen; },
      "上流はありません。",
    ),
    lane(
      "下流 — これを待っている",
      view.downstream,
      state.downstreamOpen,
      () => { state.downstreamOpen = !state.downstreamOpen; },
      "下流はありません。",
    ),
  );

  return { main, sticky: el("div", { class: "rf-n-m-sticky" }, open) };
}

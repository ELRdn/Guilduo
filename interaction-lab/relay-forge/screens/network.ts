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
 * Scroll ownership: the explanation rail scrolls. The graph is a map-like
 * viewport over a deterministic world: drag/pinch/wheel move its camera without
 * creating a second document scroller or rebuilding the screen DOM.
 */

import type { Actor } from "../model.ts";
import { relayText, type RelayCopyKey } from "../relay-copy.ts";
import { actorAvatar } from "../primitives/avatar.ts";
import { el, svg } from "../primitives/dom.ts";
import {
  EDGE_LABEL,
  type NetworkEdge,
  type NetworkModel,
  type NetworkNode,
} from "./network-model.ts";
import {
  centreNetworkCamera,
  fitNetworkCamera,
  layoutNetworkWorld,
  NETWORK_MAX_SCALE,
  NETWORK_MIN_SCALE,
  orthogonalNetworkPath,
  type NetworkCamera,
  type NetworkWorldNode,
  zoomNetworkCameraAt,
} from "./network-layout.ts";
import {
  countLabel,
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
  camera: NetworkCamera;
  cameraFocusId: string | null;
}

export function initialNetworkState(): NetworkState {
  return {
    focusId: null,
    view: "graph",
    trail: [],
    upstreamOpen: true,
    downstreamOpen: true,
    camera: { x: 0, y: 0, scale: 1 },
    cameraFocusId: null,
  };
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

function focusNetworkCentre(): void {
  window.requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>('.rf-screen--network .rf-n-node[data-focused="true"], .rf-screen--network .rf-n-m-focus-title, .rf-screen--network .rf-n-outline-focus');
    if (target) { if (!target.matches(".rf-n-node")) target.tabIndex = -1; target.focus({ preventScroll:true }); }
  });
}

/* ------------------------------------------------------------------ *
 * Node rendering
 * ------------------------------------------------------------------ */

const STATE_CHIP: Readonly<Record<NetworkNode["state"], { label: string; mark: string; tone: "review" | "blocked" | "working" | "scheduled" | "done" | "neutral" | "danger" }>> = {
  review: { get label() { return relayText("stateReview"); }, mark: "!?", tone: "review" },
  blocked: { get label() { return relayText("stateBlocked"); }, mark: "//", tone: "blocked" },
  working: { get label() { return relayText("stateWorking"); }, mark: ">>", tone: "working" },
  scheduled: { get label() { return relayText("stateScheduled"); }, mark: "..", tone: "scheduled" },
  done: { get label() { return relayText("stateDone"); }, mark: "OK", tone: "done" },
  healthy: { get label() { return relayText("networkConnected"); }, mark: "==", tone: "working" },
  degraded: { get label() { return relayText("networkAttention"); }, mark: "!!", tone: "danger" },
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
      tabindex: options.focused === true ? 0 : -1,
      "aria-current": options.focused === true ? "true" : null,
    },
    el(
      "span",
      { class: "rf-n-node-top" },
      actor === null
        ? el("span", { class: "rf-n-node-ref", title: node.ref }, node.ref)
        : actorAvatar(actor, { size: "row" }),
      actor === null ? null : el("span", { class: "rf-n-node-ref", title: node.ref }, node.ref),
      nodeChip(node),
    ),
    el("span", { class: "rf-n-node-label", title: node.label }, node.label),
    el("span", { class: "rf-n-node-sub", title: node.sub }, node.sub),
    options.focused === true ? el("span", { class: "rf-visually-hidden" }, relayText("networkFocusedNode")) : null,
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

function graphCanvas(
  view: Neighbourhood,
  context: ScreenContext,
  state: NetworkState,
  onFocus: (id: string) => void,
): HTMLElement {
  const layout = layoutNetworkWorld(
    view.upstream.map((entry) => entry.node.id),
    view.focus.id,
    view.downstream.map((entry) => entry.node.id),
  );
  const nodes = el("div", { class: "rf-n-nodes" });
  const lines: SVGElement[] = [];

  const place = (element: HTMLElement, point: NetworkWorldNode): void => {
    element.style.left = `${point.x}px`;
    element.style.top = `${point.y}px`;
    nodes.append(element);
  };

  view.upstream.forEach((entry) => {
    const point = layout.nodes.get(entry.node.id);
    if (point === undefined) return;
    place(
      nodeCard(entry.node, context, { role: "upstream", onFocus: () => onFocus(entry.node.id) }),
      point,
    );
    lines.push(
      svg("path", {
        class: "rf-n-edge",
        "data-kind": entry.edge.kind,
        "data-blocking": entry.edge.blocking ? "true" : "false",
        d: orthogonalNetworkPath(point, layout.focus),
        fill: "none",
      }),
    );
  });

  view.downstream.forEach((entry) => {
    const point = layout.nodes.get(entry.node.id);
    if (point === undefined) return;
    place(
      nodeCard(entry.node, context, { role: "downstream", onFocus: () => onFocus(entry.node.id) }),
      point,
    );
    lines.push(
      svg("path", {
        class: "rf-n-edge",
        "data-kind": entry.edge.kind,
        "data-blocking": entry.edge.blocking ? "true" : "false",
        d: orthogonalNetworkPath(layout.focus, point),
        fill: "none",
      }),
    );
  });

  place(
    nodeCard(view.focus, context, { role: "focus", focused: true, onFocus: () => onFocus(view.focus.id) }),
    layout.focus,
  );

  const edges = svg(
    "svg",
    {
      class: "rf-n-edges",
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      width: String(layout.width),
      height: String(layout.height),
      "aria-hidden": "true",
    },
    ...lines,
  ) as unknown as SVGElement;
  const world = el("div", { class: "rf-n-world", "aria-hidden": "false" }, edges as unknown as Node, nodes);
  world.style.width = `${layout.width}px`;
  world.style.height = `${layout.height}px`;
  world.style.visibility = "hidden";

  const control = (key: RelayCopyKey, text: string, act: () => void): HTMLButtonElement => {
    const label = relayText(key);
    const button = el("button", { type: "button", class: "rf-n-map-control", "data-network-control":key, "aria-label": label, title: label }, text);
    button.addEventListener("click", act);
    return button;
  };

  const canvas = el(
    "div",
    {
      class: "rf-n-canvas",
      role: "group",
      tabindex: -1,
      "aria-label": relayText("networkMapAria").replace("{name}", () => view.focus.label),
    },
    el(
      "div",
      { class: "rf-n-lane-labels", "aria-hidden": "true" },
      el("span", null, relayText("networkUpstream")),
      el("span", null, relayText("networkDownstream")),
    ),
    world,
  );

  let frame: number | null = null;
  const applyCamera = (): void => {
    frame = null;
    world.style.transform = `translate3d(${state.camera.x}px, ${state.camera.y}px, 0) scale(${state.camera.scale})`;
    world.style.visibility = "visible";
    canvas.setAttribute("aria-valuetext", `${Math.round(state.camera.scale * 100)}%`);
  };
  const scheduleCamera = (): void => {
    if (frame === null) frame = window.requestAnimationFrame(applyCamera);
  };
  const setCamera = (camera: NetworkCamera): void => {
    state.camera = camera;
    scheduleCamera();
  };
  const centreOn = (point: NetworkWorldNode, scale = state.camera.scale): void => {
    setCamera(centreNetworkCamera(canvas.clientWidth, canvas.clientHeight, point, scale));
  };

  const controls = el(
    "div",
    { class: "rf-n-map-controls", role: "group", "aria-label": relayText("networkMapControls") },
    control("networkZoomIn", "+", () => {
      const centre = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
      setCamera(zoomNetworkCameraAt(state.camera, state.camera.scale * 1.2, centre));
    }),
    control("networkZoomOut", "−", () => {
      const centre = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
      setCamera(zoomNetworkCameraAt(state.camera, state.camera.scale / 1.2, centre));
    }),
    control("networkCentreOn", relayText("networkFocus"), () => centreOn(layout.focus)),
    control("networkFit", relayText("networkFit"), () => setCamera(fitNetworkCamera(canvas.clientWidth, canvas.clientHeight, layout))),
  );
  canvas.append(controls);

  window.requestAnimationFrame(() => {
    if (state.cameraFocusId !== view.focus.id) {
      state.camera = centreNetworkCamera(canvas.clientWidth, canvas.clientHeight, layout.focus, state.cameraFocusId === null ? 1 : state.camera.scale);
      state.cameraFocusId = view.focus.id;
    }
    applyCamera();
  });

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const factor = Math.exp(-event.deltaY * 0.0015);
    setCamera(zoomNetworkCameraAt(state.camera, state.camera.scale * factor, point));
  }, { passive: false });

  const pointers = new Map<number, { x: number; y: number }>();
  let previousCentroid: { x: number; y: number } | null = null;
  let previousDistance = 0;
  const pointerGeometry = (): { centroid: { x: number; y: number }; distance: number } | null => {
    const values = [...pointers.values()];
    if (values.length === 0) return null;
    if (values.length === 1) return { centroid: values[0] as { x: number; y: number }, distance: 0 };
    const first = values[0] as { x: number; y: number };
    const second = values[1] as { x: number; y: number };
    return {
      centroid: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
      distance: Math.hypot(second.x - first.x, second.y - first.y),
    };
  };
  const updatePointerBaseline = (): void => {
    const geometry = pointerGeometry();
    previousCentroid = geometry?.centroid ?? null;
    previousDistance = geometry?.distance ?? 0;
  };
  canvas.addEventListener("pointerdown", (event) => {
    if ((event.target as Element).closest(".rf-n-node, .rf-n-map-controls") !== null) return;
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    updatePointerBaseline();
    canvas.dataset.dragging = "true";
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId) || previousCentroid === null) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const geometry = pointerGeometry();
    if (geometry === null) return;
    let next: NetworkCamera = {
      x: state.camera.x + geometry.centroid.x - previousCentroid.x,
      y: state.camera.y + geometry.centroid.y - previousCentroid.y,
      scale: state.camera.scale,
    };
    if (geometry.distance > 0 && previousDistance > 0) {
      const rect = canvas.getBoundingClientRect();
      next = zoomNetworkCameraAt(next, next.scale * (geometry.distance / previousDistance), {
        x: geometry.centroid.x - rect.left,
        y: geometry.centroid.y - rect.top,
      });
    }
    state.camera = next;
    previousCentroid = geometry.centroid;
    previousDistance = geometry.distance;
    scheduleCamera();
  });
  const releasePointer = (event: PointerEvent): void => {
    pointers.delete(event.pointerId);
    updatePointerBaseline();
    if (pointers.size === 0) delete canvas.dataset.dragging;
  };
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);

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
      const id = lane[next]?.node.id;
      if (id === undefined) return;
      canvas.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
      const point = layout.nodes.get(id);
      if (point !== undefined) centreOn(point);
      return;
    }
    const target = key === "ArrowUp"
      ? (role === "downstream" ? view.focus.id : view.upstream[0]?.node.id)
      : (role === "upstream" ? view.focus.id : view.downstream[0]?.node.id);
    if (target === undefined) return;
    canvas.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(target)}"]`)?.focus({ preventScroll: true });
    const point = layout.nodes.get(target);
    if (point !== undefined) centreOn(point);
  });

  canvas.addEventListener("keydown", (event) => {
    if (event.key !== "+" && event.key !== "-" && event.key !== "0") return;
    event.preventDefault();
    if (event.key === "0") centreOn(layout.focus);
    else {
      const centre = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
      const factor = event.key === "+" ? 1.2 : 1 / 1.2;
      setCamera(zoomNetworkCameraAt(state.camera, state.camera.scale * factor, centre));
    }
  });

  canvas.dataset.minScale = String(NETWORK_MIN_SCALE);
  canvas.dataset.maxScale = String(NETWORK_MAX_SCALE);

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
            const jump = el("button", { type: "button", class: "rf-jump", "data-focus-id":entry.node.id }, relayText("networkCentreOn"));
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
    lane(relayText("networkUpstream"), view.upstream, relayText("networkNoUpstream")),
    lane(relayText("networkDownstream"), view.downstream, relayText("networkNoDownstream")),
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
  const blocking = view.upstream.filter((entry) => entry.edge.blocking);
  const open = el("button", { type: "button", class: "rf-primary-button rf-n-open" }, relayText("networkOpenTarget"));
  open.addEventListener("click", () => context.onNavigate(view.focus.destination, view.focus.id));

  const back = el("button", { type: "button", class: "rf-secondary-button rf-n-back" }, relayText("networkBack"));
  back.addEventListener("click", () => {
    const previous = state.trail.pop();
    if (previous !== undefined) {
      state.focusId = previous;
      if (model.nodes.get(previous)?.kind === "quest") context.onSelectQuest(previous);
      else context.rerender();
      focusNetworkCentre();
    }
  });

  return screenRegion(
    relayText("networkReasons"),
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
    el("h4", { class: "rf-n-rail-label" }, `${relayText("networkBlockingEdges")} · ${countLabel(blocking.length)}`),
    blocking.length === 0
      ? el("p", { class: "rf-n-rail-empty" }, relayText("networkNoBlockingEdges"))
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
    el("h4", { class: "rf-n-rail-label" }, relayText("networkEdges")),
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
    el("h4", { class: "rf-n-rail-label" }, relayText("networkChains")),
    model.chains.length === 0
      ? el("p", { class: "rf-n-rail-empty" }, relayText("networkNoChains"))
      : el(
        "ul",
        { class: "rf-n-chains" },
        ...model.chains.map((chain) => {
          const button = el(
            "button",
            { type: "button", class: "rf-n-chain", "data-selected": chain.rootId === view.focus.id ? "true" : "false" },
            el("span", { class: "rf-srow-id" }, chain.rootRef),
            el("span", { class: "rf-n-chain-reason" }, chain.reason),
            el("span", { class: "rf-n-chain-count" }, `${relayText("waiting")} · ${countLabel(chain.waitingIds.length)}`),
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
  const waiting = new Set(model.chains.flatMap(chain => chain.waitingIds)).size;
  return [
    { label: relayText("networkRoots"), value: String(model.chains.length), note: relayText("networkRootNote"), tone: "blocked" },
    { label: relayText("waiting"), value: String(waiting), note: relayText("networkWaitingNote"), tone: "waiting" },
    { label: "Quest", value: String(quests.length), tone: "neutral" },
    { label: relayText("networkEdges"), value: String(model.edges.length), note: relayText("networkEdgeNote"), tone: "neutral" },
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
  const focusId = state.focusId !== null && model.nodes.has(state.focusId) ? state.focusId : defaultFocus(model, selectedQuestId);
  state.trail = state.trail.filter(id => model.nodes.has(id));
  state.focusId = focusId;
  const view = focusId === null ? null : neighbourhood(model, focusId);

  const onFocus = (id: string): void => {
    if (state.focusId === id) return;
    if (state.focusId !== null && state.focusId !== id) state.trail.push(state.focusId);
    state.focusId = id;
    // A Quest node also moves the shared selection, so Command and Quests agree.
    if (model.nodes.get(id)?.kind === "quest") context.onSelectQuest(id);
    else context.rerender();
    context.announce(relayText("networkCentred").replace("{name}", () => model.nodes.get(id)?.label ?? id));
    focusNetworkCentre();
  };

  const body = loading
    ? screenSkeleton(3, "node")
    : view === null
      ? screenEmpty(
        relayText("networkEmpty"),
        relayText("networkEmptyHint"),
      )
      : state.view === "graph"
        ? graphCanvas(view, context, state, onFocus)
        : outlineView(view, context, onFocus);

  const main = el(
    "div",
    { class: "rf-screen rf-screen--network" },
    screenHeader({
      title: "Network",
      question: relayText("networkQuestion"),
      meta: view === null ? [] : [{ label: relayText("networkFocus"), value: view.focus.ref }],
      actions: [
        segmentControl(
          relayText("networkView"),
          [
            { id: "graph", label: relayText("networkGraph"), count: view === null ? 0 : view.upstream.length + view.downstream.length },
            { id: "outline", label: relayText("networkOutline"), count: view === null ? 0 : view.upstream.length + view.downstream.length },
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
      screenRegion(relayText(state.view === "graph" ? "networkGraph" : "networkOutline"), { variant: state.view === "graph" ? "canvas" : "outline", scroll:state.view === "outline" }, body),
      view === null
        ? screenRegion(relayText("networkReasons"), { variant: "reasons" }, screenEmpty(relayText("networkEmpty"), relayText("networkChooseHint")))
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
  const focusId = state.focusId !== null && model.nodes.has(state.focusId) ? state.focusId : defaultFocus(model, selectedQuestId);
  state.trail = state.trail.filter(id => model.nodes.has(id));
  state.focusId = focusId;
  const view = focusId === null ? null : neighbourhood(model, focusId);

  const onFocus = (id: string): void => {
    if (state.focusId === id) return;
    if (state.focusId !== null && state.focusId !== id) state.trail.push(state.focusId);
    state.focusId = id;
    if (model.nodes.get(id)?.kind === "quest") context.onSelectQuest(id);
    else context.rerender();
    context.announce(relayText("networkCentred").replace("{name}", () => model.nodes.get(id)?.label ?? id));
    focusNetworkCentre();
  };

  if (loading) {
    return {
      main: el(
        "div",
        { class: "rf-screen rf-screen--network" },
        screenHeader({ title: "Network", question: relayText("networkQuestion") }),
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
        screenHeader({ title: "Network", question: relayText("networkQuestion") }),
        ...model.notices.map((notice) => screenNotice(notice)),
        screenEmpty(relayText("networkEmpty"), relayText("networkEmptyHint")),
      ),
    };
  }

  const lane = (
    id: "upstream" | "downstream",
    title: string,
    entries: Neighbourhood["upstream"],
    open: boolean,
    toggle: () => void,
    emptyCopy: string,
  ): HTMLElement => {
    const header = el(
      "button",
      { type: "button", class: "rf-n-m-lane-head", "data-lane":id, "aria-expanded": open ? "true" : "false" },
      el("span", null, title),
      el("span", { class: "rf-n-m-lane-count" }, String(entries.length)),
    );
    header.addEventListener("click", () => {
      toggle();
      context.rerender();
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`.rf-n-m-lane-head[data-lane="${id}"]`)?.focus());
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
                { type: "button", class: "rf-n-m-row", "data-node-id":entry.node.id, "data-blocking": entry.edge.blocking ? "true" : "false" },
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

  const back = el("button", { type: "button", class: "rf-secondary-button rf-n-m-back rf-n-back" }, relayText("networkBack"));
  back.addEventListener("click", () => {
    const previous = state.trail.pop();
    if (previous !== undefined) {
      state.focusId = previous;
      if (model.nodes.get(previous)?.kind === "quest") context.onSelectQuest(previous);
      else context.rerender();
      focusNetworkCentre();
    }
  });

  const open = el("button", { type: "button", class: "rf-primary-button rf-n-open" }, relayText("networkOpenTarget"));
  open.addEventListener("click", () => context.onNavigate(view.focus.destination, view.focus.id));

  const main = el(
    "div",
    { class: "rf-screen rf-screen--network", "data-mobile-view": "explorer" },
    screenHeader({
      title: "Network",
      question: relayText("networkQuestion"),
      meta: [{ label: relayText("networkRoots"), value: String(model.chains.length) }],
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
      "upstream",
      relayText("networkUpstream"),
      view.upstream,
      state.upstreamOpen,
      () => { state.upstreamOpen = !state.upstreamOpen; },
      relayText("networkNoUpstream"),
    ),
    lane(
      "downstream",
      relayText("networkDownstream"),
      view.downstream,
      state.downstreamOpen,
      () => { state.downstreamOpen = !state.downstreamOpen; },
      relayText("networkNoDownstream"),
    ),
  );

  return { main, sticky: el("div", { class: "rf-n-m-sticky" }, open) };
}

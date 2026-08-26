/**
 * Quest Loom — NEWDESIGN.md sections 14.3 and 22.3.
 *
 * The Loom weaves a stable chronological spine, orthogonally routed dependency
 * threads, and Actor ownership into one row system. It is explicitly not a table
 * with decorative lines: time owns a fixed axis, dependencies own six stable
 * routing tracks, and the current holder is the only filled Actor node.
 *
 * Column grid at >= 900px inline size (section 14.3):
 *   32 | 72 | 96 | minmax(300px, 1fr) | 184 | 152
 *   control | time | dependency | quest identity | actor relay | state/action
 *
 * The SVG routing coordinates below are mathematical geometry, which section
 * 25.1 point 3 permits. Row height comes from the --qf-relay-* tokens and is
 * read back from CSS so the two never drift.
 */

import { type Actor, type LoomQuest, stateSignal } from "../model.ts";
import { el, svg } from "./dom.ts";
import { relaySpine } from "./relay.ts";

/** Dependency lane geometry: six 12px tracks inside 12px edge padding. */
const DEPENDENCY_LANE_WIDTH = 96;
const DEPENDENCY_EDGE_PADDING = 12;
const DEPENDENCY_TRACK_STEP = 12;
const DEPENDENCY_TRACK_COUNT = 6;
/** Crossings use a 4px bridge gap on the lower-priority edge (section 14.3). */
const BRIDGE_GAP = 4;

export interface LoomOptions {
  readonly rowHeight: number;
  readonly selectedQuestId: string | null;
  /** Section 6.10: writes are locked while the workspace is stale. */
  readonly writeLocked: boolean;
  readonly onSelect: (questId: string) => void;
  readonly onAct: (questId: string) => void;
}

interface RoutedEdge {
  readonly sourceIndex: number;
  readonly targetIndex: number;
  readonly track: number;
  readonly critical: boolean;
  readonly blocking: boolean;
  readonly label: string;
}

/**
 * Assigns each edge a stable track. Track order is derived from the target row
 * index, so filtering or selecting never makes lines jump. The critical path
 * takes the track nearest the Quest title, as required by section 14.3.
 */
function routeEdges(quests: readonly LoomQuest[]): readonly RoutedEdge[] {
  const indexById = new Map(quests.map((quest, index) => [quest.id, index]));
  const edges: Omit<RoutedEdge, "track">[] = [];
  quests.forEach((quest, targetIndex) => {
    for (const dependency of quest.dependencies) {
      const sourceIndex = indexById.get(dependency.questId);
      if (sourceIndex === undefined) continue;
      edges.push({
        sourceIndex,
        targetIndex,
        critical: dependency.critical,
        blocking: dependency.blocking,
        label: `${dependency.ref} → ${quest.ref}`,
      });
    }
  });
  // Stable ordering: critical last so it lands on the highest track number,
  // which is the track closest to the Quest identity column.
  const ordered = [...edges].sort((left, right) => {
    if (left.critical !== right.critical) return left.critical ? 1 : -1;
    if (left.targetIndex !== right.targetIndex) return left.targetIndex - right.targetIndex;
    return left.sourceIndex - right.sourceIndex;
  });
  return ordered.map((edge, position) => ({
    ...edge,
    track: Math.min(position, DEPENDENCY_TRACK_COUNT - 1),
  }));
}

function trackX(track: number): number {
  return DEPENDENCY_EDGE_PADDING + track * DEPENDENCY_TRACK_STEP;
}

/**
 * Builds one orthogonal edge path: it enters from the chronological spine side,
 * occupies its track, then turns 90 degrees into the target row. Horizontal runs
 * are split with a bridge gap wherever they cross a higher-priority track.
 */
function edgePath(edge: RoutedEdge, rowHeight: number, crossings: readonly number[]): string {
  const sourceY = edge.sourceIndex * rowHeight + rowHeight / 2;
  const targetY = edge.targetIndex * rowHeight + rowHeight / 2;
  const x = trackX(edge.track);
  const entry = crossings
    .filter((crossX) => crossX > 0 && crossX < x)
    .sort((left, right) => left - right);

  let path = `M0 ${sourceY}`;
  let cursor = 0;
  for (const crossX of entry) {
    path += ` H${crossX - BRIDGE_GAP / 2} M${crossX + BRIDGE_GAP / 2} ${sourceY}`;
    cursor = crossX;
  }
  if (cursor <= x) path += ` H${x}`;
  path += ` V${targetY} H${DEPENDENCY_LANE_WIDTH}`;
  return path;
}

function dependencyLayer(
  quests: readonly LoomQuest[],
  edges: readonly RoutedEdge[],
  rowHeight: number,
): SVGElement {
  const height = quests.length * rowHeight;
  const shapes: SVGElement[] = edges.map((edge) => {
    const higherPriority = edges
      .filter((other) => other !== edge && other.track > edge.track)
      .map((other) => trackX(other.track));
    return svg("path", {
      d: edgePath(edge, rowHeight, higherPriority),
      class: "rf-loom-edge",
      "data-critical": edge.critical ? "true" : "false",
      "data-blocking": edge.blocking ? "true" : "false",
      fill: "none",
    });
  });
  // Arrowheads sit at the lane boundary, pointing into the Quest title column.
  for (const edge of edges) {
    const targetY = edge.targetIndex * rowHeight + rowHeight / 2;
    shapes.push(svg("path", {
      d: `M${DEPENDENCY_LANE_WIDTH - 5} ${targetY - 3.5} L${DEPENDENCY_LANE_WIDTH} ${targetY} L${DEPENDENCY_LANE_WIDTH - 5} ${targetY + 3.5}`,
      class: "rf-loom-edge-head",
      "data-critical": edge.critical ? "true" : "false",
      "data-blocking": edge.blocking ? "true" : "false",
      fill: "none",
    }));
  }
  return svg(
    "svg",
    {
      class: "rf-loom-threads",
      width: DEPENDENCY_LANE_WIDTH,
      height,
      viewBox: `0 0 ${DEPENDENCY_LANE_WIDTH} ${height}`,
      "aria-hidden": "true",
      focusable: "false",
    },
    ...shapes,
  );
}

/** Contiguous runs of three or more rows sharing one blocker get a shared rail. */
interface BlockerRun {
  readonly groupId: string;
  readonly startIndex: number;
  readonly length: number;
}

function blockerRuns(quests: readonly LoomQuest[]): readonly BlockerRun[] {
  const runs: BlockerRun[] = [];
  let index = 0;
  while (index < quests.length) {
    const groupId = quests[index].blockerGroupId;
    if (groupId === null) {
      index += 1;
      continue;
    }
    let length = 1;
    while (index + length < quests.length && quests[index + length].blockerGroupId === groupId) length += 1;
    if (length >= 3) runs.push({ groupId, startIndex: index, length });
    index += length;
  }
  return runs;
}

function questRow(
  quest: LoomQuest,
  actors: ReadonlyMap<string, Actor>,
  options: LoomOptions,
): HTMLElement {
  const selected = options.selectedQuestId === quest.id;
  const row = el(
    "div",
    {
      class: "rf-loom-row",
      role: "row",
      tabindex: 0,
      "data-quest-id": quest.id,
      "data-state": quest.state,
      "data-signal": stateSignal(quest.state),
      "data-selected": selected ? "true" : "false",
      "aria-selected": selected ? "true" : "false",
    },
    el(
      "div",
      { class: "rf-loom-cell rf-loom-control", role: "gridcell" },
      el("span", { class: "rf-loom-priority", "data-priority": quest.priority, title: quest.priority },
        el("span", { class: "rf-visually-hidden" }, quest.priority)),
    ),
    el(
      "div",
      { class: "rf-loom-cell rf-loom-time", role: "gridcell" },
      el("span", { class: "rf-loom-start" }, quest.startLabel),
      el("span", { class: "rf-loom-due" }, `due ${quest.dueLabel}`),
    ),
    el(
      "div",
      { class: "rf-loom-cell rf-loom-dependency", role: "gridcell" },
      quest.dependencies.length === 0
        ? null
        : el(
          "span",
          { class: "rf-visually-hidden" },
          `depends on ${quest.dependencies.map((dependency) => dependency.ref).join(", ")}`,
        ),
    ),
    el(
      "div",
      { class: "rf-loom-cell rf-loom-identity", role: "gridcell" },
      el(
        "span",
        { class: "rf-loom-title-line" },
        el("span", { class: "rf-loom-ref" }, quest.ref),
        el("span", { class: "rf-loom-title" }, quest.title),
      ),
      el("span", { class: "rf-loom-context" }, quest.context),
    ),
    el(
      "div",
      { class: "rf-loom-cell rf-loom-relay", role: "gridcell" },
      relaySpine(quest.relay, actors, { compact: true }),
    ),
    el(
      "div",
      { class: "rf-loom-cell rf-loom-state", role: "gridcell" },
      el("span", { class: "rf-loom-state-label" }, quest.stateLabel),
      el(
        "button",
        {
          type: "button",
          class: "rf-quiet-button rf-loom-action",
          "data-quest-id": quest.id,
          disabled: options.writeLocked ? true : null,
        },
        quest.actionLabel,
      ),
    ),
    quest.needsIntervention
      ? el("span", { class: "rf-loom-notch", "aria-hidden": "true" })
      : null,
  );

  row.addEventListener("click", () => options.onSelect(quest.id));
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      options.onSelect(quest.id);
    }
  });
  const action = row.querySelector<HTMLButtonElement>(".rf-loom-action");
  action?.addEventListener("click", (event) => {
    event.stopPropagation();
    options.onAct(quest.id);
  });
  return row;
}

export function questLoom(
  quests: readonly LoomQuest[],
  actors: ReadonlyMap<string, Actor>,
  options: LoomOptions,
): HTMLElement {
  const edges = routeEdges(quests);
  const body = el(
    "div",
    { class: "rf-loom-body", role: "rowgroup" },
    dependencyLayer(quests, edges, options.rowHeight),
    ...blockerRuns(quests).map((run) => el("span", {
      class: "rf-loom-blocker-rail",
      style: `top:${run.startIndex * options.rowHeight}px;height:${run.length * options.rowHeight}px`,
      role: "note",
      "aria-label": `${run.length} Quests share one blocker`,
    })),
    ...quests.map((quest) => questRow(quest, actors, options)),
    // Terminal marker plus a ruled floor: on tall viewports the remaining space
    // reads as unused Loom capacity rather than the empty island section 26.1
    // forbids, and the whitespace is explained rather than accidental.
    el(
      "div",
      { class: "rf-loom-end", role: "row" },
      el("span", { class: "rf-loom-end-copy", role: "gridcell" }, "本日の Quest は以上です"),
    ),
    el("div", { class: "rf-loom-floor", "aria-hidden": "true" }),
  );

  return el(
    "div",
    { class: "rf-loom", role: "grid", "aria-label": "Quest Loom" },
    el(
      "div",
      { class: "rf-loom-header", role: "row" },
      el("span", { class: "rf-loom-cell", role: "columnheader" }, ""),
      el("span", { class: "rf-loom-cell", role: "columnheader" }, "Time"),
      el("span", { class: "rf-loom-cell", role: "columnheader" }, "Deps"),
      el("span", { class: "rf-loom-cell", role: "columnheader" }, "Quest"),
      el("span", { class: "rf-loom-cell", role: "columnheader" }, "Relay"),
      el("span", { class: "rf-loom-cell", role: "columnheader" }, "State"),
    ),
    body,
  );
}

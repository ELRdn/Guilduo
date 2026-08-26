/**
 * Quest Loom — NEWDESIGNv2.md section 5.
 *
 * Not a navigation list and not a dependency graph. Time runs top to bottom on a
 * single spine; dependency is expressed by indent plus one orthogonal thread per
 * relation; the selected Quest is the hub the threads converge on.
 *
 * The row order is derived from the real dependency data of the selected Quest,
 * so the structure re-weaves whenever selection changes:
 *
 *   upstream (what the hub waits for)
 *     → hub (selected)
 *       → branch (what the hub is blocking)
 *   → standalone rows in chronological order
 *
 * Connectors are information, never decoration: a row only grows a thread when a
 * real relation exists, and same-cause branches share one trunk.
 */

import { type Actor, type LoomQuest, type QuestVisualState, stateSignal } from "../model.ts";
import { actorAvatar } from "./avatar.ts";
import { el } from "./dom.ts";

type Relation = "upstream" | "hub" | "branch" | "standalone";

interface WovenRow {
  readonly quest: LoomQuest;
  readonly relation: Relation;
  /**
   * Position in the whole spine. Caps are global so the chronology line runs
   * continuously from the first Quest, through the hub, to the last.
   */
  readonly first: boolean;
  readonly last: boolean;
  /** First row of a branch run: only that row draws the orthogonal turn. */
  readonly branchHead: boolean;
}

/** Short verb-first state word shown at the row's trailing edge. */
const STATE_WORD: Readonly<Record<QuestVisualState, string>> = {
  planned: "planned",
  ready: "ready",
  working: "executing",
  review_required: "review",
  waiting: "waiting",
  blocked: "blocked",
  completed: "completed",
  archived: "archived",
};

function weave(quests: readonly LoomQuest[], selectedId: string | null): readonly WovenRow[] {
  const hub = quests.find((quest) => quest.id === selectedId) ?? null;

  const ordered: { quest: LoomQuest; relation: Relation }[] = [];
  if (hub === null) {
    for (const quest of quests) ordered.push({ quest, relation: "standalone" });
  } else {
    const upstreamIds = new Set(hub.dependencies.map((dependency) => dependency.questId));
    const branch = quests.filter((quest) =>
      quest.dependencies.some((dependency) => dependency.questId === hub.id));
    const branchIds = new Set(branch.map((quest) => quest.id));

    for (const quest of quests.filter((quest) => upstreamIds.has(quest.id))) {
      ordered.push({ quest, relation: "upstream" });
    }
    ordered.push({ quest: hub, relation: "hub" });
    for (const quest of branch) ordered.push({ quest, relation: "branch" });
    for (const quest of quests) {
      if (quest.id === hub.id || upstreamIds.has(quest.id) || branchIds.has(quest.id)) continue;
      ordered.push({ quest, relation: "standalone" });
    }
  }

  return ordered.map((entry, index) => ({
    quest: entry.quest,
    relation: entry.relation,
    first: index === 0,
    last: index === ordered.length - 1,
    branchHead: entry.relation === "branch" && ordered[index - 1]?.relation !== "branch",
  }));
}

export interface QuestLoomOptions {
  readonly actors: ReadonlyMap<string, Actor>;
  readonly selectedQuestId: string | null;
  readonly onSelect: (questId: string, trigger: HTMLElement) => void;
  readonly collapsed: boolean;
  readonly onToggleCollapse: () => void;
}

function loomRow(row: WovenRow, options: QuestLoomOptions): HTMLElement {
  const { quest, relation } = row;
  const selected = relation === "hub";
  const blocker = quest.dependencies.find((dependency) => dependency.blocking);
  // Current holder of this Quest, so the list reads as ownership at a glance.
  const holder = options.actors.get(quest.relay.legs[quest.relay.currentIndex]?.actorId ?? "");

  const node = el(
    "span",
    {
      class: "rf-spine-node",
      "data-state": quest.state,
      "data-signal": stateSignal(quest.state),
      "aria-hidden": "true",
    },
  );

  const element = el(
    "div",
    {
      class: "rf-spine-row",
      role: "option",
      tabindex: selected ? 0 : -1,
      "data-quest-id": quest.id,
      "data-relation": relation,
      "data-state": quest.state,
      "data-first": row.first ? "true" : "false",
      "data-last": row.last ? "true" : "false",
      "data-branch-head": row.branchHead ? "true" : "false",
      "aria-selected": selected ? "true" : "false",
    },
    el("span", { class: "rf-spine-thread", "aria-hidden": "true" }),
    node,
    el(
      "span",
      { class: "rf-spine-body" },
      el(
        "span",
        { class: "rf-spine-head" },
        holder === undefined ? null : actorAvatar(holder, { size: "row" }),
        el("span", { class: "rf-spine-ref" }, quest.ref),
        el("span", { class: "rf-spine-state-word" }, STATE_WORD[quest.state]),
      ),
      el("span", { class: "rf-spine-title" }, quest.title),
      relation === "branch" && blocker !== undefined
        ? el("span", { class: "rf-spine-blocker" }, `blocked by ${blocker.ref}`)
        : null,
    ),
    selected ? el("span", { class: "rf-spine-chevron", "aria-hidden": "true" }) : null,
  );

  element.addEventListener("click", () => options.onSelect(quest.id, element));
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      options.onSelect(quest.id, element);
    }
  });
  return element;
}

export function questLoom(
  quests: readonly LoomQuest[],
  options: QuestLoomOptions,
): HTMLElement {
  const rows = weave(quests, options.selectedQuestId);

  const collapse = el(
    "button",
    {
      type: "button",
      class: "rf-icon-button rf-spine-collapse",
      title: options.collapsed ? "Expand Quest Loom" : "Collapse Quest Loom",
      "aria-expanded": options.collapsed ? "false" : "true",
    },
    el("span", { class: "rf-visually-hidden" }, options.collapsed ? "Expand Quest Loom" : "Collapse Quest Loom"),
    el("span", { class: "rf-collapse-mark", "aria-hidden": "true" }),
  );
  collapse.addEventListener("click", options.onToggleCollapse);

  const list = el(
    "div",
    { class: "rf-spine-list", role: "listbox", "aria-label": "Quest Loom" },
    ...rows.map((row) => loomRow(row, options)),
  );

  // Section 5.3: roving tabindex with ArrowUp/Down and Home/End.
  list.addEventListener("keydown", (event) => {
    const keys = ["ArrowUp", "ArrowDown", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const items = [...list.querySelectorAll<HTMLElement>(".rf-spine-row")];
    if (items.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const current = active === null ? -1 : items.indexOf(active);
    let next = current;
    if (event.key === "ArrowUp") next = current <= 0 ? items.length - 1 : current - 1;
    if (event.key === "ArrowDown") next = current === items.length - 1 ? 0 : current + 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    if (next === current || items[next] === undefined) return;
    event.preventDefault();
    for (const item of items) item.setAttribute("tabindex", "-1");
    items[next].setAttribute("tabindex", "0");
    items[next].focus();
  });

  return el(
    "section",
    { class: "rf-spine", "aria-label": "Quest Loom", "data-collapsed": options.collapsed ? "true" : "false" },
    el(
      "div",
      { class: "rf-spine-header" },
      el("span", { class: "rf-spine-grip", "aria-hidden": "true" }),
      el("h2", { class: "rf-region-label" }, "Quest Loom"),
      collapse,
    ),
    list,
  );
}

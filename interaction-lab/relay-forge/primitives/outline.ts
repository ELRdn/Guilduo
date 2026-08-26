/**
 * Dependency outline — NEWDESIGN.md sections 6.5, 19 and 23.
 *
 * The Auxiliary Lane carries a second synchronized view rather than a dumping
 * ground for secondary cards. On Command that view is the textual dependency
 * outline for the selected Quest, which section 19 also requires as the
 * assistive-technology alternative to graph routing.
 */

import { type Actor, type LoomQuest } from "../model.ts";
import { actorAvatar } from "./avatar.ts";
import { el } from "./dom.ts";

function relation(
  label: string,
  quests: readonly LoomQuest[],
  actors: ReadonlyMap<string, Actor>,
  emptyCopy: string,
): HTMLElement {
  return el(
    "section",
    { class: "rf-outline-section" },
    el("h3", { class: "rf-outline-title" }, label),
    quests.length === 0
      ? el("p", { class: "rf-outline-empty" }, emptyCopy)
      : el(
        "ul",
        { class: "rf-outline-list" },
        ...quests.map((quest) => {
          const holder = actors.get(quest.relay.legs[quest.relay.currentIndex]?.actorId ?? "");
          return el(
            "li",
            { class: "rf-outline-row", "data-state": quest.state },
            el("span", { class: "rf-outline-ref" }, quest.ref),
            el(
              "span",
              { class: "rf-outline-copy" },
              el("span", { class: "rf-outline-quest" }, quest.title),
              el("span", { class: "rf-outline-state" }, quest.stateLabel),
            ),
            holder === undefined ? null : actorAvatar(holder, { size: "row" }),
          );
        }),
      ),
  );
}

export function dependencyOutline(
  selected: LoomQuest | null,
  quests: readonly LoomQuest[],
  actors: ReadonlyMap<string, Actor>,
): HTMLElement {
  if (selected === null) {
    return el(
      "div",
      { class: "rf-outline" },
      el("p", { class: "rf-outline-empty" }, "Quest を選ぶと依存関係の文字アウトラインが表示されます。"),
    );
  }
  const byId = new Map(quests.map((quest) => [quest.id, quest]));
  const upstream = selected.dependencies
    .map((dependency) => byId.get(dependency.questId))
    .filter((quest): quest is LoomQuest => quest !== undefined);
  const downstream = quests.filter((quest) =>
    quest.dependencies.some((dependency) => dependency.questId === selected.id));

  return el(
    "div",
    { class: "rf-outline", "aria-label": "Dependency outline" },
    el(
      "p",
      { class: "rf-outline-subject" },
      el("span", { class: "rf-outline-ref" }, selected.ref),
      el("span", { class: "rf-outline-quest" }, selected.title),
    ),
    relation("この Quest が待っているもの", upstream, actors, "上流の依存はありません。"),
    relation("この Quest を待っているもの", downstream, actors, "下流で待っている Quest はありません。"),
  );
}

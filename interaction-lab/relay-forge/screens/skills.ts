/**
 * Skills — human-readable MCP capability catalogue.
 *
 * The protocol names stay visible as a tertiary label, while the screen leads
 * with the live tool title and capability group. The renderer owns no data
 * fetching; the shell supplies the authenticated tools/list snapshot.
 */

import { el } from "../primitives/dom.ts";
import { relayText } from "../relay-copy.ts";
import {
  type SkillGroupView,
  type SkillToolView,
  type SkillsModel,
  type SkillsState,
} from "./skills-model.ts";
import {
  type ScreenContext,
  type ScreenRender,
  screenEmpty,
  screenHeader,
  screenNotice,
  screenRegion,
  screenSkeleton,
  stateChip,
  searchField,
  countLabel,
} from "./runtime.ts";

export * from "./skills-model.ts";

export interface SkillsCallbacks {
  readonly onSearch: (query: string) => void;
  readonly onToggleGroup: (groupId: string) => void;
  readonly onRetry: () => void;
}

function toolAvailability(tool: SkillToolView): HTMLElement {
  return tool.availability === "available"
    ? stateChip({ tone: "done", label: relayText("skillsAvailable"), mark: "OK" })
    : stateChip({ tone: "neutral", label: relayText("skillsUnavailable"), mark: "--" });
}

function toolRow(tool: SkillToolView): HTMLElement {
  return el(
    "li",
    { class: "rf-skills-tool-row", "data-availability": tool.availability },
    el(
      "div",
      { class: "rf-skills-tool-copy" },
      el("strong", { class: "rf-skills-tool-title" }, tool.title),
      el("span", { class: "rf-skills-tool-description" }, tool.description),
      el("code", { class: "rf-skills-tool-name" }, tool.name),
    ),
    toolAvailability(tool),
  );
}

function groupCard(
  group: SkillGroupView,
  expanded: boolean,
  callbacks: SkillsCallbacks,
): HTMLElement {
  const listId = `rf-skills-tools-${group.id}`;
  const toggle = el(
    "button",
    {
      type: "button",
      class: "rf-skills-group-toggle",
      "aria-expanded": expanded ? "true" : "false",
      "aria-controls": listId,
      "data-group-toggle": group.id,
      "aria-label": `${expanded ? relayText("skillsCollapse") : relayText("skillsExpand")}: ${group.title}`,
    },
    el("span", { class: "rf-skills-toggle-mark", "aria-hidden": "true" }, expanded ? "−" : "+"),
  );
  toggle.addEventListener("click", () => callbacks.onToggleGroup(group.id));
  return el(
    "article",
    { class: "rf-skills-group", "data-group": group.id, "data-expanded": expanded ? "true" : "false" },
    el(
      "header",
      { class: "rf-skills-group-header" },
      el(
        "div",
        { class: "rf-skills-group-copy" },
        el("h3", { class: "rf-skills-group-title" }, group.title),
        el("p", { class: "rf-skills-group-description" }, group.description),
      ),
      el(
        "div",
        { class: "rf-skills-group-meta" },
        el("span", { class: "rf-skills-count" }, `${relayText("skillsTools")}: ${countLabel(group.tools.length)}`),
        group.availableCount === group.tools.length
          ? null
          : el("span", { class: "rf-skills-availability" }, `${relayText("skillsAvailable")}: ${countLabel(group.availableCount)}`),
        toggle,
      ),
    ),
    el(
      "ul",
      { class: "rf-skills-tool-list", id: listId, hidden: !expanded },
      ...group.tools.map(toolRow),
    ),
  );
}

function sourceBar(model: SkillsModel): HTMLElement {
  return el(
    "div",
    { class: "rf-skills-source" },
    el(
      "div",
      { class: "rf-skills-source-copy" },
      el("span", { class: "rf-skills-eyebrow" }, relayText("skillsSource")),
      el("strong", { class: "rf-skills-source-name" }, model.sourceLabel),
      model.sourceUrl === "" ? null : el("code", { class: "rf-skills-source-url" }, model.sourceUrl),
    ),
    el(
      "div",
      { class: "rf-skills-connection" },
      el("span", { class: "rf-skills-eyebrow" }, relayText("skillsConnection")),
      el("span", { class: "rf-skills-connection-value" }, model.connectionLabel),
    ),
  );
}

function searchControl(model: SkillsModel, callbacks: SkillsCallbacks): HTMLElement {
  const field = searchField(relayText("skillsSearch"), model.query, relayText("skillsSearchPlaceholder"), callbacks.onSearch);
  const input = field.querySelector<HTMLInputElement>("input")!;
  input.classList.add("rf-skills-search-input");
  input.spellcheck = false;
  return el(
    "div",
    { class: "rf-skills-search" },
    el("span", { class: "rf-skills-search-glyph", "aria-hidden": "true" }),
    input,
    model.query === "" ? null : el("span", { class: "rf-skills-search-count" }, `${model.visibleToolCount}/${model.totalToolCount}`),
  );
}

function statusBody(model: SkillsModel, callbacks: SkillsCallbacks): HTMLElement {
  if (model.status === "loading") return screenSkeleton(4, "card");
  if (model.status === "unconnected") {
    return screenEmpty(relayText("skillsNoConnection"), relayText("skillsConnectHint"));
  }
  if (model.status === "error") {
    return screenNotice({
      status: "error",
      detail: relayText("skillsLoadFailed"),
      action: { label: relayText("retry"), onAct: callbacks.onRetry },
    });
  }
  if (model.status === "empty") {
    return screenEmpty(relayText("skillsEmpty"), relayText("skillsEmptyHint"));
  }
  if (model.groups.length === 0) {
    return screenEmpty(relayText("skillsNoMatches"), relayText("skillsNoMatchesHint"));
  }
  return screenNotice({
    status: "error",
    detail: relayText("skillsLoadFailed"),
    action: { label: relayText("retry"), onAct: callbacks.onRetry },
  });
}

function renderSkillsMain(model: SkillsModel, state: SkillsState, context: ScreenContext, callbacks: SkillsCallbacks): HTMLElement {
  void context;
  const groups = model.groups.map((group) => group.id);
  // Show matching tools immediately while preserving an explicit collapse.
  if (model.query) for (const id of groups) state.expandedGroups[id] ??= true;
  const body = model.status === "ready" && model.groups.length > 0
    ? el(
      "div",
      { class: "rf-skills-groups" },
      ...model.groups.map((group) => groupCard(group, state.expandedGroups[group.id] === true, callbacks)),
    )
    : statusBody(model, callbacks);
  return el(
    "div",
    { class: "rf-screen rf-skills-screen", "data-scroll": "true" },
    screenHeader({
      title: "Skills",
      question: relayText("skillsQuestion"),
      meta: [
        { label: relayText("skillsTools"), value: model.query === "" ? countLabel(model.totalToolCount) : `${model.visibleToolCount}/${model.totalToolCount}` },
        { label: relayText("skillsGroups"), value: countLabel(model.groups.length) },
      ],
    }),
    sourceBar(model),
    el(
      "div",
      { class: "rf-skills-toolbar" },
      searchControl(model, callbacks),
      el("p", { class: "rf-skills-toolbar-note" }, relayText("skillsSearchHint")),
    ),
    screenRegion(
      relayText("skillsCapabilities"),
      { variant: "skills" },
      el("p", { class: "rf-skills-region-note", role:"status" }, model.query === "" ? relayText("skillsBrowse") : `${relayText("skillsTools")}: ${countLabel(model.visibleToolCount)}`),
      body,
    ),
  );
}

function renderSkills(
  model: SkillsModel,
  state: SkillsState,
  context: ScreenContext,
  callbacks: SkillsCallbacks,
): ScreenRender {
  void context;
  const main = renderSkillsMain(model, state, context, callbacks);
  return { main };
}

export function renderSkillsDesktop(
  model: SkillsModel,
  state: SkillsState,
  context: ScreenContext,
  callbacks: SkillsCallbacks,
): ScreenRender {
  return renderSkills(model, state, context, callbacks);
}

export function renderSkillsMobile(
  model: SkillsModel,
  state: SkillsState,
  context: ScreenContext,
  callbacks: SkillsCallbacks,
): ScreenRender {
  const rendered = renderSkills(model, state, context, callbacks);
  rendered.main.dataset.scroll = "false";
  return rendered;
}

/**
 * Skills — human-readable MCP capability catalogue.
 *
 * The protocol names stay visible as a tertiary label, while the screen leads
 * with the live tool title and capability group. The renderer owns no data
 * fetching; the shell supplies the authenticated tools/list snapshot.
 */

import { el } from "../primitives/dom.ts";
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
} from "./runtime.ts";

export * from "./skills-model.ts";

export interface SkillsCallbacks {
  readonly onSearch: (query: string) => void;
  readonly onToggleGroup: (groupId: string) => void;
  readonly onRetry: () => void;
}

function toolAvailability(tool: SkillToolView): HTMLElement {
  return tool.availability === "available"
    ? stateChip({ tone: "done", label: "Available", mark: "OK" })
    : stateChip({ tone: "neutral", label: "Unavailable", mark: "--" });
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
      title: expanded ? "Tool一覧を折りたたむ" : "Tool一覧を展開する",
    },
    el("span", { class: "rf-skills-toggle-mark", "aria-hidden": "true" }, expanded ? "−" : "+"),
    el("span", { class: "rf-visually-hidden" }, expanded ? "折りたたむ" : "展開する"),
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
        el("span", { class: "rf-skills-count" }, `${group.tools.length} tools`),
        group.availableCount === group.tools.length
          ? null
          : el("span", { class: "rf-skills-availability" }, `${group.availableCount} available`),
        toggle,
      ),
    ),
    expanded
      ? el(
        "ul",
        { class: "rf-skills-tool-list", id: listId },
        ...group.tools.map(toolRow),
      )
      : null,
  );
}

function sourceBar(model: SkillsModel): HTMLElement {
  return el(
    "div",
    { class: "rf-skills-source" },
    el(
      "div",
      { class: "rf-skills-source-copy" },
      el("span", { class: "rf-skills-eyebrow" }, "MCP SOURCE"),
      el("strong", { class: "rf-skills-source-name" }, model.sourceLabel),
      model.sourceUrl === "" ? null : el("code", { class: "rf-skills-source-url" }, model.sourceUrl),
    ),
    el(
      "div",
      { class: "rf-skills-connection" },
      el("span", { class: "rf-skills-eyebrow" }, "CONNECTION"),
      el("span", { class: "rf-skills-connection-value" }, model.connectionLabel),
    ),
  );
}

function searchControl(model: SkillsModel, callbacks: SkillsCallbacks): HTMLElement {
  const input = el("input", {
    type: "search",
    class: "rf-skills-search-input",
    value: model.query,
    placeholder: "Search capabilities or MCP tool names",
    "aria-label": "Skillsを検索",
    autocomplete: "off",
    spellcheck: false,
  });
  input.addEventListener("input", () => callbacks.onSearch(input.value));
  return el(
    "label",
    { class: "rf-skills-search" },
    el("span", { class: "rf-skills-search-glyph", "aria-hidden": "true" }),
    input,
    model.query === "" ? null : el("span", { class: "rf-skills-search-count" }, `${model.visibleToolCount}/${model.totalToolCount}`),
  );
}

function statusBody(model: SkillsModel, callbacks: SkillsCallbacks): HTMLElement {
  if (model.status === "loading") return screenSkeleton(4, "card");
  if (model.status === "unconnected") {
    return screenEmpty("MCP server未接続", "Guilduo MCPへ接続すると、利用できるCapabilityとToolがここに表示されます。");
  }
  if (model.status === "error") {
    return screenNotice({
      status: "error",
      detail: "MCP Tool一覧を取得できませんでした。既存の操作には影響ありません。",
      action: { label: "再試行", onAct: callbacks.onRetry },
    });
  }
  if (model.status === "empty") {
    return screenEmpty("利用できるMCP Toolはまだありません", "接続先にToolが公開されると、Capabilityごとに整理して表示します。");
  }
  if (model.groups.length === 0) {
    return screenEmpty("該当するToolがありません", "検索語を変えると、Capability名・説明・MCPの技術名から再検索できます。");
  }
  return screenNotice({
    status: "error",
    detail: "Capabilityを表示できません。Tool一覧を再読み込みしてください。",
    action: { label: "再試行", onAct: callbacks.onRetry },
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
  // Prune expansion state for categories that disappeared after a search, but
  // leave it untouched for categories that remain so search does not surprise
  // the user by collapsing their open group.
  for (const key of Object.keys(state.expandedGroups)) if (!groups.includes(key)) delete state.expandedGroups[key];
  return el(
    "div",
    { class: "rf-screen rf-skills-screen", "data-scroll": "true" },
    screenHeader({
      title: "Skills",
      question: "MCPで何ができるかを、Capabilityから探せます。",
      meta: [
        { label: "TOOLS", value: model.query === "" ? String(model.totalToolCount) : `${model.visibleToolCount}/${model.totalToolCount}` },
        { label: "GROUPS", value: String(model.groups.length) },
      ],
    }),
    sourceBar(model),
    el(
      "div",
      { class: "rf-skills-toolbar" },
      searchControl(model, callbacks),
      el("p", { class: "rf-skills-toolbar-note" }, "名前、説明、カテゴリ、technical nameを検索できます。"),
    ),
    screenRegion(
      "Capabilities",
      { variant: "skills" },
      el("p", { class: "rf-skills-region-note" }, model.query === "" ? "Capability groupからToolを開いて確認できます。" : `${model.visibleToolCount}件のToolが検索に一致しました。`),
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

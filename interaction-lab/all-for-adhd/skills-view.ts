/**
 * Skills in All for ADHD's layout (Penpot page 17): the MCP endpoint with a
 * copy button, one search field, one column of categories, and a mark only on
 * a tool that cannot be used. Tool names and descriptions are the server's.
 */

import { createElement, ChevronDown, ChevronRight, Search } from "lucide";
import { el } from "../relay-forge/primitives/dom.ts";
import type { SkillsModel, SkillsState } from "../relay-forge/screens/skills-model.ts";
import { tx } from "./copy.ts";

export interface SkillsViewHost {
  readonly authorized: number;
  readonly rerender: () => void;
  readonly announce: (message: string) => void;
  readonly openMcpSettings: () => void;
  readonly retry: () => void;
}

// Category names in this product's words (task, hand-over, friends, battle).
const CATEGORY: Record<string, () => readonly [string, string]> = {
  "quest-management": () => [tx("タスクの管理"), tx("タスクの作成・更新・担当・進行を管理します。")],
  "agent-relay": () => [tx("Agentとリレー"), tx("Agent、接続、担当、受け渡しを管理します。")],
  "profile-social": () => [tx("プロフィールと交流"), tx("プロフィールとフレンドを管理します。")],
  "battle-rewards": () => [tx("バトルと報酬"), tx("バトルと報酬の状態を確認・操作します。")],
};
const icon = (node: typeof Search) => createElement(node, { width: 18, height: 18, "stroke-width": 1.75, "aria-hidden": "true" });

export function skillsView(model: SkillsModel, state: SkillsState, host: SkillsViewHost): HTMLElement {
  const copy = el("button", { type: "button", class: "a4-link", disabled: !model.sourceUrl }, tx("URLをコピー"));
  copy.addEventListener("click", () => { void navigator.clipboard?.writeText(model.sourceUrl).then(() => host.announce(tx("コピーしました")), () => host.announce(tx("コピーできませんでした"))); });
  const setup = el("button", { type: "button", class: "a4-link" }, tx("接続を設定"));
  setup.addEventListener("click", host.openMcpSettings);
  const source = el("section", { class: "a4-bill-card a4-sk-source" },
    el("div", { class: "a4-bt-head" }, el("strong", {}, model.sourceLabel), copy),
    el("code", { class: "a4-sk-url" }, model.sourceUrl || "—"),
    el("div", { class: "a4-bt-head" }, el("span", { class: "a4-meta" }, host.authorized === 0 ? tx("まだつながっているAgentはいません") : tx("{count}件のクライアントがつながっています", { count: host.authorized })), setup));

  // One field; typing in Japanese waits for the composition to finish.
  const input = el("input", { type: "search", class: "a4-sk-input", value: state.query, placeholder: tx("機能やツール名を検索"), "aria-label": tx("機能やツール名を検索") });
  const apply = () => {
    state.query = input.value; host.rerender();
    requestAnimationFrame(() => { const next = document.querySelector<HTMLInputElement>(".a4-sk-input"); if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); } });
  };
  input.addEventListener("input", event => { if (!(event as InputEvent).isComposing) apply(); });
  input.addEventListener("compositionend", apply);
  const search = el("label", { class: "a4-sk-search" }, icon(Search), input);

  let body: HTMLElement;
  if (model.status === "loading") body = el("p", { class: "a4-meta", role: "status" }, tx("読み込んでいます"));
  else if (model.status === "error") {
    const again = el("button", { type: "button", class: "a4-link" }, tx("もう一度"));
    again.addEventListener("click", host.retry);
    body = el("div", { class: "a4-bill-alert", role: "alert" }, el("span", {}, tx("機能の一覧を読み込めませんでした。")), again);
  } else if (!model.groups.length) body = el("p", { class: "a4-net-empty" }, model.query ? tx("「{query}」に合う機能はありません。", { query: model.query }) : tx("使える機能はまだありません。"));
  else body = el("section", {},
    el("h2", { class: "a4-net-group-head" }, tx("使える機能"), el("span", { class: "a4-meta" }, tx("{count}件", { count: model.visibleToolCount }))),
    el("ul", { class: "a4-sk-groups" }, ...model.groups.map(group => {
      const open = model.query !== "" || state.expandedGroups[group.id] === true;
      const head = el("button", { type: "button", class: "a4-sk-group-head", "aria-expanded": String(open) },
        el("span", { class: "a4-set-copy" }, el("strong", {}, CATEGORY[group.id]?.()[0] ?? group.title), el("small", {}, CATEGORY[group.id]?.()[1] ?? group.description)),
        el("span", { class: "a4-meta" }, tx("{count}件", { count: group.tools.length })), icon(open ? ChevronDown : ChevronRight));
      head.addEventListener("click", () => { state.expandedGroups[group.id] = !open; host.rerender(); });
      return el("li", { class: "a4-sk-group" }, head, open ? el("ul", { class: "a4-sk-tools" }, ...group.tools.map(tool => el("li", { class: "a4-sk-tool" },
        el("strong", {}, tool.title, tool.availability === "unavailable" ? el("span", { class: "a4-net-chip", "data-tone": "review" }, tx("使えません")) : null),
        tool.description ? el("span", {}, tool.description) : null, el("code", { class: "a4-meta" }, tool.name)))) : null);
    })));
  return el("div", { class: "a4-sk" }, source, search, body);
}

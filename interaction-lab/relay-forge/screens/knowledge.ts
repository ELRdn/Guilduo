import { getLocale } from "../../../i18n.ts";
import type { KnowledgeConnection, KnowledgeGrant, KnowledgeItem, KnowledgeSearch, KnowledgeSettings } from "../../../shared/knowledge.ts";
import type { RelayForgeRuntime } from "../production.ts";
import { el } from "../primitives/dom.ts";
import { screenRegion } from "./runtime.ts";

const copy = {
  title: ["Relay Memory", "Relay Memory"], open: ["知識を読み込む", "Load knowledge"], reload: ["再読込", "Reload"],
  description: ["決定・理由・制約・出典を、許可したAIと共有します。メモは本人が選んだ一節だけ共有します。", "Share decisions, reasons, constraints and sources with permitted AI Agents. Notes share only the excerpt selected by the owner."],
  enabled: ["選択したAgentと知識全体を共有する", "Share all knowledge with selected Agents"], save: ["保存", "Save"],
  agents: ["共有する接続とAgent", "Connections and Agents to share with"],
  missingScope: ["知識の権限が必要です。接続を再認可し、Agentの権限を確認してください。", "Authorize knowledge scopes on the connection and check the Agent permissions."],
  noConnections: ["MCP接続をAgentに紐付けると共有先を選べます。", "Link an MCP connection to an Agent to select it here."],
  loading: ["読込中…", "Loading…"], failed: ["通信に失敗しました。保存状況を再読込で確認してください。", "Request failed. Reload to check what was saved."],
  unknown: ["保存結果が不明です。確認するまで再送や別の編集はできません。", "Save outcome is unknown. Reconcile before another edit."],
  reconcile: ["保存状況を確認・同じ内容で再試行", "Reconcile and retry the same save"],
  stale: ["同時に変更されました。最新版と下書きを比較してください。", "This changed concurrently. Compare the current version with your draft."],
  latest: ["最新版を確認", "Review current version"], rebase: ["最新版に対する編集として続ける", "Continue editing against this version"],
  pageChanged: ["検索結果が変わりました。最初のページから検索してください。", "Results changed. Restart from the first page."],
  truncated: ["意味検索の候補に上限があります。必要なら語句や範囲を変えて検索してください。", "Semantic candidates are limited. Narrow the scope or change the query if needed."],
  saved: ["保存を確認しました。", "Saved and verified."],
  query: ["知識を検索", "Search knowledge"], search: ["検索", "Search"], empty: ["該当する知識はありません。", "No matching knowledge."],
  next: ["続きを表示", "Show more"], edit: ["編集", "Edit"], cancel: ["キャンセル", "Cancel"], history: ["履歴・取り消し", "History and undo"],
  restore: ["この版へ復元", "Restore this revision"], remove: ["永久削除", "Permanently delete"],
  confirmDelete: ["本文・出典・履歴を永久削除します。取り消せません。", "Permanently delete content, sources and history? This cannot be undone."],
  name: ["タイトル", "Title"], content: ["内容", "Content"], reason: ["変更理由", "Reason for change"],
  scope: ["適用範囲", "Applicability"], global: ["全体共通", "Global"], project: ["プロジェクト", "Project"], quest: ["Quest", "Quest"],
  sharedNote: ["本人の共有メモ", "Owner-shared note"], manageNote: ["元のメモで共有を管理できます。", "Manage sharing in the original note."],
  sources: ["出典（参照先の閲覧確認とは別）", "Sources (listing a reference does not verify access)"],
  conflict: ["矛盾あり・確定事項として使用しない", "Unresolved conflict — do not treat as authoritative"],
  selectWinner: ["この内容を採用する", "Choose this version"], compare: ["矛盾の内容を比較", "Compare conflicting versions"],
  reviewRemaining: ["残った内容を確認して確定する", "Review and confirm the remaining decision"],
  referenceOnly: ["別案件の参考情報（今回の判断には適用しない）", "Other work, for reference only"], related: ["Relay Memory", "Relay Memory"],
  projectName: ["新しいプロジェクト名", "New project name"], createProject: ["プロジェクト作成", "Create project"],
  link: ["Questと関連付ける", "Link Quest to project"], export: ["JSONをエクスポート", "Export JSON"],
  exportNote: ["全件の本文・出典・履歴を端末へ保存します。他人に渡す前に内容を確認してください。", "Download all content, sources and revisions to this device. Review before sharing."],
  unavailable: ["この環境ではRelay Memoryが無効です。", "Relay Memory is disabled in this environment."],
  approximate: ["意味検索は利用できません。キーワード検索結果を表示しています。", "Semantic search is unavailable; showing lexical results."],
  inactive: ["過去の決定も表示", "Include superseded knowledge"],
  active: ["現在の知識", "Current knowledge"], superseded: ["以前の知識（適用しない）", "Superseded (do not apply)"],
  human: ["本人", "Owner"], humanStatement: ["本人の発言", "Owner statement"], reportedStatement: ["人の発言についての報告", "Reported human statement"],
  observation: ["Agentの観察", "Agent observation"], inference: ["推測", "Inference"], verified: ["システム確認済み", "System verified"],
  reported: ["参照先の閲覧は未確認", "Source access not verified"], unavailableSource: ["参照不可", "Source unavailable"],
} as const;
type Key = keyof typeof copy;
export const knowledgeText = (key: Key) => copy[key][getLocale() === "ja" ? 0 : 1];
type Input = Record<string, unknown>;
type Project = { id: string; name: string };
type Draft = { item: KnowledgeItem; stale?: boolean; latest?: KnowledgeItem; confirmReview?: boolean; title: string; content: string; reason: string; scope: string; projectId: string; questId: string };

export function knowledgeWorkspace(options: {
  port: RelayForgeRuntime["knowledgePort"]; agents: () => readonly { agentId: string; displayName: string; status?: string }[];
  quests: () => readonly { id: string; title: string }[]; refresh: () => void; held: () => boolean; alive: () => boolean;
}) {
  const w = knowledgeText;
  let settings: KnowledgeSettings | null = null, connections: KnowledgeConnection[] = [], projects: Project[] = [], page: KnowledgeSearch | null = null;
  let loading = false, busy = false, failed = false, disabled = false, status: Key | null = null, query = "", projectName = "", includeSuperseded = false;
  let draft: Draft | null = null, history: { id: string; revisions: KnowledgeItem[]; nextCursor: number | null } | null = null;
  let comparison: { left: KnowledgeItem; right: KnowledgeItem } | null = null;
  let pending: { path: string; input: Input; method: string } | null = null;
  const related = new Map<string, { page?: KnowledgeSearch; loading?: boolean; failed?: boolean }>();
  const held = () => !options.port || options.held() || busy || loading || failed || pending !== null;
  const refresh = () => { if (options.alive()) options.refresh(); };
  const call = <T>(path: string, input?: Input, method?: string) => options.port!.knowledge<T>(path, input, method);
  function button(label: Key, action: () => void, locked = held()): HTMLButtonElement {
    const node = el("button", { type: "button", class: "rf-secondary-button", disabled: locked }, w(label));
    node.addEventListener("click", action); return node;
  }
  const statusOf = (error: unknown) => error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
  const codeOf = (error: unknown) => error && typeof error === "object" && "code" in error ? error.code : undefined;
  function markConflict() {
    status = "stale"; comparison = null;
    if (draft) { draft.stale = true; draft.latest = undefined; }
  }
  async function load() {
    if (!options.port || loading || busy || pending) return;
    loading = true; failed = false; refresh();
    try {
      const result = await Promise.all([call<KnowledgeSettings & { availableConnections: KnowledgeConnection[] }>("/settings"), call<{ projects: Project[] }>("/projects"), call<KnowledgeSearch>("/search", { query, includeSuperseded })]);
      if (!options.alive()) return;
      [settings, { projects }, page] = result; connections = result[0].availableConnections; disabled = false;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "knowledge_disabled") disabled = true;
      else { failed = true; status = "failed"; }
    } finally { loading = false; refresh(); }
  }
  async function search(more = false) {
    if (held()) return;
    loading = true; refresh();
    try {
      const result = await call<KnowledgeSearch>("/search", { query, includeSuperseded, ...(more ? { cursor: page?.nextCursor ?? 0, pageVersion: page?.pageVersion } : {}) });
      if (!options.alive()) return;
      page = more && page ? { ...result, items: [...page.items, ...result.items] } : result;
      if (status === "pageChanged") status = null;
    } catch (error) {
      if (codeOf(error) === "knowledge_page_changed") { status = "pageChanged"; page = null; }
      else { failed = true; status = "failed"; }
    }
    finally { loading = false; refresh(); }
  }
  async function write(path: string, input: Input, method = "POST") {
    if (held()) return;
    busy = true; status = null; refresh();
    try {
      await call(path, input, method);
      if (!options.alive()) return;
      status = "saved"; draft = null; history = null; comparison = null; related.clear();
    } catch (error) {
      const httpStatus = statusOf(error);
      // Retry only the original idempotent capture/restore; other uncertain writes require a readback.
      if ((!httpStatus || httpStatus >= 500) && input.requestId) pending = { path, input, method };
      if (httpStatus === 409) markConflict();
      else { failed = true; status = pending ? "unknown" : "failed"; }
    } finally { busy = false; if (!failed) await load(); refresh(); }
  }
  async function reconcile() {
    if (!pending || busy) return;
    const original = pending; let resubmitting = false; busy = true; refresh();
    try {
      const result = await call<{ saved: boolean }>(`/operations/${encodeURIComponent(String(original.input.requestId))}`);
      if (!result.saved) {
        resubmitting = true;
        await call(original.path, original.input, original.method);
      }
      if (!options.alive()) return;
      pending = null; failed = false; status = "saved"; draft = null; history = null; comparison = null; related.clear();
    } catch (error) {
      const httpStatus = statusOf(error);
      if (resubmitting && httpStatus >= 400 && httpStatus < 500) {
        pending = null; failed = false;
        if (httpStatus === 409 || httpStatus === 404) markConflict();
        else status = "failed";
      } else status = "unknown";
    }
    finally { busy = false; if (!pending) await load(); refresh(); }
  }
  async function showHistory(item: KnowledgeItem, more = false) {
    if (held()) return; loading = true; refresh();
    try {
      const result = await call<{ revisions: KnowledgeItem[]; nextCursor: number | null }>(`/${item.id}/history${more ? `?cursor=${history?.nextCursor ?? 0}` : ""}`);
      if (options.alive()) history = { id: item.id, revisions: [...(more ? history?.revisions ?? [] : []), ...result.revisions], nextCursor: result.nextCursor };
    } catch { failed = true; status = "failed"; }
    finally { loading = false; refresh(); }
  }
  function itemView(item: KnowledgeItem, controls = true): HTMLElement {
    const sourceActor = item.sourceActor ?? item.actor;
    const attribution = sourceActor === "human" ? w("human") : options.agents().find(a => `agent:${a.agentId}` === sourceActor)?.displayName ?? sourceActor;
    const epistemic = item.epistemic === "human_statement" ? w(sourceActor === "human" ? "humanStatement" : "reportedStatement") : w(item.epistemic === "inference" ? "inference" : item.epistemic === "system_verified" ? "verified" : "observation");
    const node = el("article", { class: "rf-knowledge-item" }, el("h4", {}, item.title), el("p", {}, item.content),
      item.origin === "private_note" ? el("p", {}, w("sharedNote")) : null,
      el("p", {}, `${w(item.status === "superseded" ? "superseded" : "active")} · ${w(item.scope)} · ${projects.find(p => p.id === item.projectId)?.name ?? options.quests().find(q => q.id === item.questId)?.title ?? ""} · v${item.revision} · ${attribution} · ${epistemic}`), el("p", {}, item.reason));
    const sources = el("details", {}, el("summary", {}, w("sources")));
    for (const source of item.sources) {
      if (item.origin === "private_note") sources.append(el("p", {}, `${w("sharedNote")} · ${source.version}`));
      else sources.append(el("p", {}, `${source.reference} · ${source.version} · ${w(source.availability === "unavailable" ? "unavailableSource" : source.availability === "verified" ? "verified" : "reported")}`), el("blockquote", {}, source.excerpt));
    }
    node.append(sources);
    if (item.applicability === "reference" && !controls) node.append(el("p", {}, w("referenceOnly")));
    if (item.conflicts.length || item.reviewRequired) {
      node.append(el("p", { role: "status" }, w("conflict")));
      if (controls) for (const peer of item.conflicts) node.append(button("compare", () => { void compare(item.id, peer); }));
    }
    if (controls && item.origin === "private_note") node.append(el("p", {}, w("manageNote")));
    if (controls && item.origin !== "private_note") {
      const startEdit = (confirmReview = false) => {
        draft = { item, title: item.title, content: item.content, reason: "", scope: item.scope,
          projectId: item.projectId ?? "", questId: item.questId ?? "", confirmReview };
        refresh();
      };
      if (item.reviewRequired && !item.conflicts.length && item.status === "active") node.append(button("reviewRemaining", () => startEdit(true)));
      node.append(button("edit", () => startEdit()),
        button("history", () => { void showHistory(item); }), button("remove", () => { if (window.confirm(w("confirmDelete"))) void write(`/${item.id}`, { expectedRevision: item.revision }, "DELETE"); }));
      if (history?.id === item.id) {
        for (const revision of history.revisions) node.append(el("details", {}, el("summary", {}, `v${revision.revision} · ${revision.updatedAt} · ${revision.actor}`), el("p", {}, revision.content),
          button("restore", () => { void write(`/${item.id}/restore`, { requestId: crypto.randomUUID(), expectedRevision: item.revision, restoreRevision: revision.revision }); })));
        if (history.nextCursor !== null) node.append(button("next", () => { void showHistory(item, true); }));
      }
    }
    return node;
  }
  async function compare(leftId: string, rightId: string) {
    if (held()) return; loading = true; refresh();
    try {
      const [left, right] = (await Promise.all([leftId, rightId].map(knowledgeId => call<KnowledgeSearch>("/search", { knowledgeId })))).map(result => result.items[0]);
      if (!left || !right) throw new Error("Missing conflict decision");
      if (options.alive()) comparison = { left, right };
    } catch { failed = true; status = "failed"; }
    finally { loading = false; refresh(); }
  }
  async function reviewDraft(active: Draft) {
    if (held()) return; loading = true; refresh();
    try {
      const result = await call<KnowledgeSearch>("/search", { knowledgeId: active.item.id });
      if (options.alive() && draft === active) active.latest = result.items[0];
    } catch { status = "failed"; }
    finally { loading = false; refresh(); }
  }
  function field(label: Key, value: string, update: (value: string) => void, multiline = false, required = true): HTMLElement {
    const id = `rf-knowledge-${label}`;
    const maxLength = label === "content" ? 6000 : label === "reason" ? 1000 : label === "query" ? 500 : label === "projectName" ? 120 : 160;
    const input = multiline ? el("textarea", { id, class: "rf-set-input", required, maxLength, rows: 5, disabled: held() }, value) : el("input", { id, class: "rf-set-input", required, maxLength, value, disabled: held() });
    input.addEventListener("input", () => update(input.value));
    return el("div", { class: "rf-knowledge-field" }, el("label", { for: id }, w(label)), input);
  }
  function selection(label: Key, value: string, rows: readonly { id: string; name: string }[], update: (id: string) => void): HTMLElement {
    const id = `rf-knowledge-${label}`;
    const select = el("select", { id, class: "rf-set-input", disabled: held() }, el("option", { value: "" }, "—"), ...rows.map(row => el("option", { value: row.id }, row.name)));
    select.value = value; select.addEventListener("change", () => update(select.value));
    return el("div", { class: "rf-knowledge-field" }, el("label", { for: id }, w(label)), select);
  }
  function editor(): HTMLElement | null {
    if (!draft) return null;
    const active = draft;
    const form = el("form", { class: "rf-set-profile-form" }, field("name", active.title, v => { active.title = v; }), field("content", active.content, v => { active.content = v; }, true), field("reason", active.reason, v => { active.reason = v; }),
      selection("scope", active.scope, ["global", "project", "quest"].map(id => ({ id, name: w(id as Key) })), v => { active.scope = v; refresh(); }),
      active.scope === "project" ? selection("project", active.projectId, projects, v => { active.projectId = v; }) : null,
      active.scope === "quest" ? selection("quest", active.questId, options.quests().map(q => ({ id: q.id, name: q.title })), v => { active.questId = v; }) : null,
      el("button", { type: "submit", class: "rf-primary-button", disabled: held() || active.stale }, w(active.confirmReview ? "reviewRemaining" : "save")), button("cancel", () => { draft = null; refresh(); }, busy || pending !== null));
    if (active.stale) {
      form.prepend(el("p", { role: "status" }, w("stale")),
        active.latest ? itemView(active.latest, false) : button("latest", () => { void reviewDraft(active); }));
      if (active.latest) form.append(button("rebase", () => {
        active.item = active.latest!;
        active.stale = false;
        active.latest = undefined;
        active.confirmReview = active.confirmReview && active.item.reviewRequired;
        status = null;
        refresh();
      }));
    }
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (active.stale) return;
      void write("/capture", { requestId: crypto.randomUUID(), knowledgeId: active.item.id, expectedRevision: active.item.revision, title: active.title, content: active.content, reason: active.reason,
        kind: active.item.kind, epistemic: active.title.trim() === active.item.title && active.content.trim() === active.item.content && active.item.epistemic !== "system_verified"
          ? active.item.epistemic : "human_statement", sources: active.item.sources,
        change: "explicit", scope: active.scope, ...(active.confirmReview ? { confirmReview: true } : {}),
        ...(active.scope === "project" ? { projectId: active.projectId } : active.scope === "quest" ? { questId: active.questId } : {}) });
    });
    return form;
  }
  async function exportAll() {
    if (held()) return; busy = true; refresh();
    try {
      const projectMetadata = await call<{ projects: Project[]; questProjects: { questId: string; projectId: string }[] }>("/projects");
      const items: { knowledge: KnowledgeItem; revisions: KnowledgeItem[] }[] = []; let cursor: number | null = 0; let pageVersion = "";
      do {
        const result: KnowledgeSearch = await call<KnowledgeSearch>(`?cursor=${cursor}&limit=50&includeSuperseded=true${pageVersion ? "&pageVersion=" + pageVersion : ""}`);
        for (const item of result.items) {
          let next: number | null = 0; const revisions: KnowledgeItem[] = [];
          do { const part: { revisions: KnowledgeItem[]; nextCursor: number | null } = await call(`/${item.id}/history?cursor=${next}`); revisions.push(...part.revisions); next = part.nextCursor; } while (next !== null);
          items.push({ knowledge: item, revisions });
        }
        cursor = result.nextCursor; pageVersion = result.pageVersion ?? "";
      } while (cursor !== null);
      if (!options.alive()) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), settings, ...projectMetadata, items }, null, 2)], { type: "application/json" }));
      const anchor = el("a", { href: url, download: "guilduo-knowledge.json" }); anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { failed = true; status = "failed"; }
    finally { busy = false; refresh(); }
  }
  function render(): HTMLElement | null {
    if (!options.port) return null;
    const region = screenRegion(w("title"), {}, el("p", {}, w("description"))); region.classList.add("rf-knowledge");
    region.append(el("p", { role: "status", "aria-live": "polite" }, w(loading || busy ? "loading" : disabled ? "unavailable" : status ?? "description")));
    if (pending) region.append(button("reconcile", () => { void reconcile(); }, busy || options.held()));
    region.append(button(settings ? "reload" : "open", () => { void load(); }, loading || busy || pending !== null));
    if (!settings || disabled) return region;
    const enabled = el("input", { type: "checkbox", checked: settings.enabled, disabled: held() });
    const choices: { grant: KnowledgeGrant; check: HTMLInputElement }[] = [];
    const chooser = el("fieldset", {}, el("legend", {}, w("agents")));
    if (!connections.length) chooser.append(el("p", {}, w("noConnections")));
    for (const { agentId, clientId, clientName, scopes } of connections) {
      const selected = settings.grants.some(grant => grant.clientId === clientId && grant.agentId === agentId);
      const check = el("input", { type: "checkbox", checked: selected, disabled: held() || (!selected && !scopes.length) });
      const name = options.agents().find(agent => agent.agentId === agentId)?.displayName ?? agentId;
      choices.push({ grant: { clientId, agentId }, check });
      chooser.append(el("label", { class: "rf-billing-check" }, check, name + " · " + clientName),
        el("p", {}, scopes.length ? scopes.join(" · ") : w("missingScope")));
    }
    region.append(el("label", { class: "rf-billing-check" }, enabled, w("enabled")), chooser, button("save", () => {
      const grants = enabled.checked ? choices.filter(({ check }) => check.checked).map(({ grant }) => grant) : [];
      const agentIds = [...new Set(grants.map(grant => grant.agentId))];
      void write("/settings", { expectedRevision: settings!.revision, enabled: enabled.checked, agentIds, grants }, "PUT");
    }));
    region.append(field("projectName", projectName, v => { projectName = v; }), button("createProject", () => { void write("/projects", { name: projectName }); }));
    const inactive = el("input", { type: "checkbox", checked: includeSuperseded, disabled: held() });
    inactive.addEventListener("change", () => { includeSuperseded = inactive.checked; void search(); });
    region.append(el("label", { class: "rf-billing-check" }, inactive, w("inactive")));
    const searchForm = el("form", {}, field("query", query, v => { query = v; }, false, false), el("button", { type: "submit", class: "rf-secondary-button", disabled: held() }, w("search")));
    searchForm.addEventListener("submit", e => { e.preventDefault(); void search(); }); region.append(searchForm);
    const edit = editor(); if (edit) region.append(edit);
    if (!page?.items.length) region.append(el("p", {}, w("empty")));
    if (page?.semanticTruncated) region.append(el("p", { role: "status" }, w("truncated")));
    if (page?.semantic === "unavailable") region.append(el("p", { role: "status" }, w("approximate")));
    if (comparison) {
      const { left, right } = comparison;
      const panel = el("section", {}, el("h3", {}, w("compare")),
        button("cancel", () => { comparison = null; refresh(); }));
      for (const candidate of [left, right]) {
        panel.append(itemView(candidate, false), button("selectWinner", () => {
          void write("/" + left.id + "/resolve", {
            rightId: right.id, expectedRevision: left.revision, expectedRightRevision: right.revision, winnerId: candidate.id,
          });
        }, held() || candidate.status !== "active"));
      }
      region.append(panel);
    }
    for (const item of page?.items ?? []) region.append(itemView(item));
    if (page?.nextCursor !== null && page?.nextCursor !== undefined) region.append(button("next", () => { void search(true); }));
    region.append(el("p", {}, w("exportNote")), button("export", () => { void exportAll(); }));
    return region;
  }
  function relatedView(questId: string): HTMLElement | null {
    if (!options.port) return null;
    const value = related.get(questId);
    const node = el("section", {}, el("h4", {}, w("related")));
    if (value?.page) {
      for (const item of value.page.items) node.append(itemView(item, false));
      if (!value.page.items.length) node.append(el("p", {}, w("empty")));
      if (value.page.nextCursor !== null) node.append(button("next", () => { void loadRelated(questId, true); }, Boolean(value.loading)));
    }
    else node.append(button(value?.failed ? "reload" : "open", () => { void loadRelated(questId); }, Boolean(value?.loading)));
    if (value?.loading) node.append(el("p", { role: "status" }, w("loading")));
    let selected = value?.page?.projectId ?? "";
    if (projects.length) node.append(selection("project", selected, projects, id => { selected = id; }), button("link", () => { void write("/quest-project", { questId, projectId: selected }, "PUT"); }));
    return node;
  }
  async function loadRelated(questId: string, more = false) {
    if (!options.port || related.get(questId)?.loading) return;
    const previous = related.get(questId)?.page;
    related.set(questId, { page: previous, loading: true }); refresh();
    try {
      const [page, projectList] = await Promise.all([call<KnowledgeSearch>("/context", { questId, limit: 5, ...(more ? { cursor: previous?.nextCursor ?? 0, pageVersion: previous?.pageVersion } : {}) }), call<{ projects: Project[] }>("/projects")]);
      if (options.alive()) { projects = projectList.projects; related.set(questId, { page: more && previous ? { ...page, items: [...previous.items, ...page.items] } : page }); }
    }
    catch { related.set(questId, { failed: true }); }
    finally { refresh(); }
  }
  return { render, related: relatedView, busy: () => busy || loading || pending !== null, dirty: () => draft !== null,
    enter: () => { if (!settings && !loading) void load(); } };
}

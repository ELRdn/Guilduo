/**
 * Quests — the Quest portfolio workspace.
 *
 * The question: "何を進め、何が止まり、次に何を選ぶべきか".
 *
 * This is deliberately not Command's three-column composition and not a todo
 * list. Command answers "which single Quest needs me now"; Quests answers
 * "across everything, what is moving, what is stuck, and what does stuck cost".
 * So the star here is the *portfolio* — a dense, comparable table — with one
 * detail rail that explains the selected row's relay, blockage and downstream
 * cost, and offers only the actions the domain actually has.
 *
 * Scroll ownership: the portfolio table is the single scrolling region on
 * desktop. Header, metrics, filters and the detail rail are fixed.
 *
 * Mobile is re-composed, not shrunk: the table becomes a compact stack, the
 * filters collapse into a scrollable segment strip plus a search field, and the
 * detail rail becomes a sheet-like panel that replaces the list in place.
 */

import type { Actor } from "../model.ts";
import { actorAvatar } from "../primitives/avatar.ts";
import { el } from "../primitives/dom.ts";
import type { Impact } from "../../../types/questforge.ts";
import {
  BUCKET_LABEL,
  BUCKET_MARK,
  BUCKET_TONE,
  type PortfolioBucket,
  type QuestRow,
  type QuestsModel,
} from "./quests-model.ts";
import {
  countLabel,
  elapsedLabel,
  instantLabel,
  type Metric,
  metricRow,
  type ScreenContext,
  type ScreenRender,
  screenEmpty,
  screenHeader,
  screenNotice,
  screenRegion,
  screenSkeleton,
  searchField,
  segmentControl,
  stateChip,
  unavailableAction,
} from "./runtime.ts";

export * from "./quests-model.ts";

/* ------------------------------------------------------------------ *
 * Screen state
 * ------------------------------------------------------------------ */

export interface QuestsState {
  segment: PortfolioBucket | "all";
  query: string;
  sort: "priority" | "due" | "updated" | "impact";
  /** Mobile only: the detail panel replaces the list rather than stacking. */
  mobileDetailOpen: boolean;
}

export function initialQuestsState(): QuestsState {
  return { segment: "all", query: "", sort: "priority", mobileDetailOpen: false };
}

const SORT_LABEL: Readonly<Record<QuestsState["sort"], string>> = {
  priority: "介入優先",
  due: "期限",
  updated: "更新",
  impact: "影響度",
};

const IMPACT_WEIGHT: Readonly<Record<Impact, number>> = { high: 0, medium: 1, low: 2 };
const BUCKET_WEIGHT: Readonly<Record<PortfolioBucket, number>> = {
  review: 0,
  blocked: 1,
  working: 2,
  scheduled: 3,
  done: 4,
};

function visibleRows(model: QuestsModel, state: QuestsState): readonly QuestRow[] {
  const query = state.query.trim().toLowerCase();
  const filtered = model.rows.filter((row) => {
    if (state.segment !== "all" && row.bucket !== state.segment) return false;
    if (query === "") return true;
    return row.title.toLowerCase().includes(query) || row.ref.toLowerCase().includes(query);
  });
  const sorted = [...filtered];
  sorted.sort((left, right) => {
    if (state.sort === "due") {
      // A Quest with no due date sorts last rather than first.
      const l = left.dueDate === "" ? "9999-12-31" : left.dueDate;
      const r = right.dueDate === "" ? "9999-12-31" : right.dueDate;
      return l < r ? -1 : l > r ? 1 : 0;
    }
    if (state.sort === "updated") return left.updatedAt < right.updatedAt ? 1 : left.updatedAt > right.updatedAt ? -1 : 0;
    if (state.sort === "impact") {
      const byImpact = IMPACT_WEIGHT[left.impact] - IMPACT_WEIGHT[right.impact];
      return byImpact !== 0 ? byImpact : right.downstreamTotal - left.downstreamTotal;
    }
    // "介入優先": what needs a human first, then what costs most while stuck.
    const byBucket = BUCKET_WEIGHT[left.bucket] - BUCKET_WEIGHT[right.bucket];
    if (byBucket !== 0) return byBucket;
    if (left.downstreamTotal !== right.downstreamTotal) return right.downstreamTotal - left.downstreamTotal;
    return right.relay.heldForMinutes - left.relay.heldForMinutes;
  });
  return sorted;
}

function bucketCount(model: QuestsModel, bucket: PortfolioBucket): number {
  return model.rows.filter((row) => row.bucket === bucket).length;
}

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

function bucketChip(bucket: PortfolioBucket): HTMLElement {
  return stateChip({ tone: BUCKET_TONE[bucket], label: BUCKET_LABEL[bucket], mark: BUCKET_MARK[bucket] });
}

function actorFor(context: ScreenContext, id: string): Actor | null {
  return context.actors.get(id) ?? null;
}

/**
 * Owner cell. The avatar is the identity, the name is the label, and the actor
 * type is in the accessible name — the same grammar as Command's Relay so a
 * Human and an Agent never read as interchangeable.
 */
function ownerCell(context: ScreenContext, row: QuestRow): HTMLElement {
  const actor = actorFor(context, row.ownerActorId);
  if (actor === null) {
    return el("div", { class: "rf-q-owner" }, el("span", { class: "rf-srow-sub" }, "未割り当て"));
  }
  return el(
    "div",
    { class: "rf-q-owner" },
    actorAvatar(actor, { size: "row", state: row.bucket === "review" ? "review" : row.bucket === "blocked" ? "blocked" : "idle" }),
    el(
      "div",
      { class: "rf-q-owner-copy" },
      el("span", { class: "rf-srow-title" }, actor.name),
      el("span", { class: "rf-srow-sub" }, actor.role),
    ),
  );
}

/** `依存2 → 下流5`. Reads as a cost, not as a decoration. */
function impactCell(row: QuestRow): HTMLElement {
  return el(
    "div",
    { class: "rf-q-impact" },
    el(
      "span",
      { class: "rf-q-impact-down", "data-heavy": row.downstreamTotal >= 3 ? "true" : "false" },
      row.downstreamTotal === 0 ? "下流なし" : `下流 ${row.downstreamTotal}`,
    ),
    row.blockedByIds.length === 0
      ? null
      : el("span", { class: "rf-q-impact-up" }, `待ち ${row.blockedByIds.length}`),
  );
}

function dueCell(row: QuestRow): HTMLElement {
  return el(
    "span",
    { class: "rf-q-due", "data-overdue": row.overdue ? "true" : "false" },
    row.dueDate === "" ? "期限なし" : row.dueDate.slice(5).replace("-", "/"),
  );
}

function evidenceCell(row: QuestRow): HTMLElement {
  return el(
    "span",
    { class: "rf-q-evidence", "data-present": row.hasEvidence ? "true" : "false" },
    row.hasEvidence ? "Evidence" : "—",
  );
}

/* ------------------------------------------------------------------ *
 * Detail rail
 * ------------------------------------------------------------------ */

export interface QuestsCallbacks {
  /** Assign the Quest to a different actor. Backed by `updateQuest`. */
  readonly onAssign?: (questId: string, actorId: string) => void;
  /** Move to Command with this Quest selected. */
  readonly onSendToCommand: (questId: string) => void;
  /** Open Network focused on this Quest's dependency chain. */
  readonly onInspectNetwork: (questId: string) => void;
  /** Start a new Quest. Backed by `createQuest`. */
  readonly onCreate?: () => void;
}

function relayLine(context: ScreenContext, row: QuestRow): HTMLElement {
  const owner = actorFor(context, row.ownerActorId);
  const reviewer = actorFor(context, row.relay.reviewerActorId);
  return el(
    "div",
    { class: "rf-q-relay" },
    el(
      "div",
      { class: "rf-q-relay-leg" },
      owner === null ? null : actorAvatar(owner, { size: "row", state: "current" }),
      el(
        "div",
        { class: "rf-q-relay-copy" },
        el("span", { class: "rf-srow-title" }, owner === null ? "未割り当て" : owner.name),
        el("span", { class: "rf-srow-sub" }, `保持 ${elapsedLabel(row.relay.heldForMinutes)}`),
      ),
    ),
    el("span", { class: "rf-q-relay-arrow", "aria-hidden": "true" }),
    el(
      "div",
      { class: "rf-q-relay-leg" },
      reviewer === null ? null : actorAvatar(reviewer, { size: "row", state: row.bucket === "review" ? "review" : "idle" }),
      el(
        "div",
        { class: "rf-q-relay-copy" },
        el("span", { class: "rf-srow-title" }, reviewer === null ? "レビュアー未設定" : reviewer.name),
        el("span", { class: "rf-srow-sub" }, row.bucket === "review" ? "判断待ち" : "次の受け手"),
      ),
    ),
  );
}

function detailRail(
  model: QuestsModel,
  state: QuestsState,
  context: ScreenContext,
  callbacks: QuestsCallbacks,
  selectedId: string | null,
): HTMLElement {
  const row = model.rows.find((entry) => entry.id === selectedId) ?? null;
  if (row === null) {
    return screenRegion(
      "選択中のQuest",
      { variant: "detail" },
      screenEmpty("Questを選んでください", "左の一覧から1件選ぶと、受け渡し、停止理由、下流への影響がここに出ます。"),
    );
  }

  const sendToCommand = el(
    "button",
    { type: "button", class: "rf-primary-button rf-q-send" },
    "Commandで判断する",
  );
  sendToCommand.addEventListener("click", () => callbacks.onSendToCommand(row.id));

  const inspect = el("button", { type: "button", class: "rf-secondary-button" }, "依存を追跡");
  inspect.addEventListener("click", () => callbacks.onInspectNetwork(row.id));

  return screenRegion(
    "選択中のQuest",
    { variant: "detail", scroll: true },
    el(
      "div",
      { class: "rf-q-detail-head" },
      el("span", { class: "rf-srow-id" }, row.ref),
      bucketChip(row.bucket),
      row.overdue ? stateChip({ tone: "danger", label: "期限超過", mark: "!!" }) : null,
    ),
    el("h3", { class: "rf-q-detail-title" }, row.title),
    row.nextAction === "" ? null : el("p", { class: "rf-q-detail-next" }, el("b", { class: "rf-inline-label" }, "次の一手 "), row.nextAction),
    el("h4", { class: "rf-q-detail-label" }, "受け渡し"),
    relayLine(context, row),
    el("h4", { class: "rf-q-detail-label" }, "停止と影響"),
    el(
      "ul",
      { class: "rf-q-detail-facts" },
      el(
        "li",
        null,
        row.blockedByIds.length === 0
          ? "待っている依存はありません。"
          : `${row.blockedByIds.length}件の依存が未完了です（${row.blockedByIds.join(", ")}）。`,
      ),
      el(
        "li",
        null,
        row.downstreamTotal === 0
          ? "このQuestを待っているQuestはありません。"
          : `${row.downstreamTotal}件が下流で待機しています（直接 ${row.downstreamIds.length}件）。`,
      ),
      row.blockedReason === "" ? null : el("li", null, `停止理由: ${row.blockedReason}`),
      el("li", null, row.hasEvidence ? "Evidenceが登録されています。" : "Evidenceはまだありません。"),
      el("li", null, `最終更新 ${instantLabel(row.updatedAt)}`),
    ),
    el("h4", { class: "rf-q-detail-label" }, "次の操作"),
    row.interventionCandidate
      ? el("div", { class: "rf-q-detail-actions" }, sendToCommand, inspect)
      : el("div", { class: "rf-q-detail-actions" }, inspect),
    row.interventionCandidate
      ? null
      : el("p", { class: "rf-q-detail-note" }, "このQuestは人間の判断待ちではないため、Commandへは送りません。"),
    ...model.unavailable.map((entry) => unavailableAction(entry.what, entry.why)),
  );
}

/* ------------------------------------------------------------------ *
 * Desktop
 * ------------------------------------------------------------------ */

function portfolioMetrics(model: QuestsModel, state: QuestsState, context: ScreenContext): readonly Metric[] {
  const overdue = model.rows.filter((row) => row.overdue).length;
  const blockedDownstream = model.rows
    .filter((row) => row.bucket === "blocked")
    .reduce((total, row) => total + row.downstreamTotal, 0);
  const select = (segment: QuestsState["segment"]) => () => {
    state.segment = segment;
    context.rerender();
  };
  return [
    { label: "要判断", value: String(bucketCount(model, "review")), note: "Commandへ送れます", tone: "review", onAct: select("review") },
    { label: "停止", value: String(bucketCount(model, "blocked")), note: `下流 ${blockedDownstream}件が待機`, tone: "blocked", onAct: select("blocked") },
    { label: "進行中", value: String(bucketCount(model, "working")), note: "Agent / 自分が実行中", tone: "working", onAct: select("working") },
    { label: "期限超過", value: String(overdue), note: "完了以外", tone: overdue > 0 ? "danger" : "neutral" },
    { label: "全体", value: String(model.rows.length), note: "読み込み済み", tone: "neutral", onAct: select("all") },
  ];
}

function filterBar(model: QuestsModel, state: QuestsState, context: ScreenContext): HTMLElement {
  const sort = el("div", { class: "rf-q-sort", role: "radiogroup", "aria-label": "並び順" });
  for (const key of ["priority", "due", "updated", "impact"] as const) {
    const button = el(
      "button",
      {
        type: "button",
        class: "rf-q-sort-option",
        role: "radio",
        "aria-checked": state.sort === key ? "true" : "false",
        "data-selected": state.sort === key ? "true" : "false",
      },
      SORT_LABEL[key],
    );
    button.addEventListener("click", () => {
      state.sort = key;
      context.rerender();
    });
    sort.append(button);
  }
  return el(
    "div",
    { class: "rf-q-filters" },
    segmentControl(
      "状態で絞り込む",
      [
        { id: "all", label: "すべて", count: model.rows.length },
        { id: "review", label: BUCKET_LABEL.review, count: bucketCount(model, "review") },
        { id: "blocked", label: BUCKET_LABEL.blocked, count: bucketCount(model, "blocked") },
        { id: "working", label: BUCKET_LABEL.working, count: bucketCount(model, "working") },
        { id: "scheduled", label: BUCKET_LABEL.scheduled, count: bucketCount(model, "scheduled") },
        { id: "done", label: BUCKET_LABEL.done, count: bucketCount(model, "done") },
      ],
      state.segment,
      (id) => {
        state.segment = id as QuestsState["segment"];
        context.rerender();
      },
    ),
    searchField("Questを検索", state.query, "タイトル / QF-ID", (value) => {
      state.query = value;
      context.rerender();
    }),
    sort,
  );
}

function portfolioRow(
  row: QuestRow,
  context: ScreenContext,
  selectedId: string | null,
  onSelect: (id: string) => void,
): HTMLElement {
  const selected = row.id === selectedId;
  const element = el(
    "button",
    {
      type: "button",
      class: "rf-srow rf-q-row",
      role: "row",
      "data-selected": selected ? "true" : "false",
      "data-bucket": row.bucket,
      "data-quest-id": row.id,
      "aria-current": selected ? "true" : null,
    },
    el("span", { class: "rf-q-cell rf-q-cell-state", role: "cell" }, bucketChip(row.bucket)),
    el("span", { class: "rf-q-cell rf-srow-id", role: "cell" }, row.ref),
    el(
      "span",
      { class: "rf-q-cell rf-q-cell-title", role: "cell" },
      el("span", { class: "rf-srow-title rf-q-title" }, row.title),
      el("span", { class: "rf-srow-sub" }, row.nextAction === "" ? BUCKET_LABEL[row.bucket] : row.nextAction),
    ),
    el("span", { class: "rf-q-cell rf-q-cell-owner", role: "cell" }, ownerCell(context, row)),
    el("span", { class: "rf-q-cell rf-q-cell-impact", role: "cell" }, impactCell(row)),
    el("span", { class: "rf-q-cell rf-q-cell-due", role: "cell" }, dueCell(row)),
    el("span", { class: "rf-q-cell rf-q-cell-evidence", role: "cell" }, evidenceCell(row)),
    selected ? el("span", { class: "rf-visually-hidden" }, "選択中") : null,
  );
  element.addEventListener("click", () => onSelect(row.id));
  return element;
}

export function renderQuestsDesktop(
  model: QuestsModel,
  state: QuestsState,
  context: ScreenContext,
  callbacks: QuestsCallbacks,
  selectedId: string | null,
): ScreenRender {
  const loading = model.notices.some((notice) => notice.status === "loading");
  const rows = visibleRows(model, state);

  const create = el("button", { type: "button", class: "rf-primary-button" }, "Questを作成");
  if (callbacks.onCreate !== undefined) create.addEventListener("click", () => callbacks.onCreate?.());

  const table = el(
    "div",
    {
      class: "rf-q-table",
      role: "table",
      "aria-label": "Quest portfolio",
      "aria-rowcount": String(rows.length),
      /* One tab stop for the whole portfolio; arrow keys walk the rows. A
       * 60-row table that put every row in the tab order would be unusable
       * with a keyboard, and the table has to be focusable for the arrow keys
       * to reach its handler at all. */
      tabindex: 0,
    },
    el(
      "div",
      { class: "rf-q-head", role: "row" },
      el("span", { class: "rf-col-label", role: "columnheader" }, "状態"),
      el("span", { class: "rf-col-label", role: "columnheader" }, "ID"),
      el("span", { class: "rf-col-label", role: "columnheader" }, "Quest"),
      el("span", { class: "rf-col-label", role: "columnheader" }, "担当"),
      el("span", { class: "rf-col-label", role: "columnheader" }, "影響"),
      el("span", { class: "rf-col-label", role: "columnheader" }, "期限"),
      el("span", { class: "rf-col-label", role: "columnheader" }, "証拠"),
    ),
    loading
      ? screenSkeleton(8, "row")
      : rows.length === 0
        ? screenEmpty(
          state.query === "" ? "この条件のQuestはありません" : "検索に一致しませんでした",
          state.query === ""
            ? "別の状態タブを選ぶか、新しいQuestを作成してください。"
            : "検索語を短くするか、状態タブを「すべて」に戻してください。",
          state.query === "" && callbacks.onCreate !== undefined
            ? { label: "Questを作成", onAct: () => callbacks.onCreate?.() }
            : { label: "条件をリセット", onAct: () => { state.query = ""; state.segment = "all"; context.rerender(); } },
        )
        : el(
          "div",
          { class: "rf-q-body" },
          ...rows.map((row) => portfolioRow(row, context, selectedId, (id) => {
            context.onSelectQuest(id);
            context.announce(`${row.ref} を選択しました`);
          })),
        ),
  );

  // Roving selection: the list is one tab stop and arrow keys walk it, which
  // keeps a 60-row portfolio out of the tab order.
  table.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    if (rows.length === 0) return;
    event.preventDefault();
    const at = rows.findIndex((row) => row.id === selectedId);
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? rows.length - 1
        : Math.min(rows.length - 1, Math.max(0, (at === -1 ? 0 : at) + (event.key === "ArrowDown" ? 1 : -1)));
    const target = rows[next];
    if (target === undefined) return;
    context.onSelectQuest(target.id);
    context.announce(`${target.ref} ${target.title}`);
  });

  const main = el(
    "div",
    { class: "rf-screen rf-screen--quests" },
    screenHeader({
      title: "Quests",
      question: "何を進め、何が止まり、次に何を選ぶべきか。",
      meta: [
        { label: "対象", value: countLabel(model.rows.length) },
        { label: "表示中", value: countLabel(rows.length) },
      ],
      actions: callbacks.onCreate === undefined ? [] : [create],
    }),
    ...model.notices.map((notice) => screenNotice(notice)),
    metricRow(portfolioMetrics(model, state, context)),
    filterBar(model, state, context),
    el(
      "div",
      { class: "rf-q-workspace" },
      screenRegion("Quest portfolio", { scroll: true, variant: "portfolio" }, table),
      detailRail(model, state, context, callbacks, selectedId),
    ),
  );

  return { main };
}

/* ------------------------------------------------------------------ *
 * Mobile — a different composition from the same ViewModel
 * ------------------------------------------------------------------ */

function mobileCard(
  row: QuestRow,
  context: ScreenContext,
  selectedId: string | null,
  onOpen: (id: string) => void,
): HTMLElement {
  const owner = actorFor(context, row.ownerActorId);
  const card = el(
    "button",
    {
      type: "button",
      class: "rf-q-card",
      "data-bucket": row.bucket,
      "data-quest-id": row.id,
      "data-selected": row.id === selectedId ? "true" : "false",
    },
    el(
      "span",
      { class: "rf-q-card-top" },
      bucketChip(row.bucket),
      el("span", { class: "rf-srow-id" }, row.ref),
      row.overdue ? stateChip({ tone: "danger", label: "超過", mark: "!!" }) : null,
    ),
    el("span", { class: "rf-q-card-title" }, row.title),
    el(
      "span",
      { class: "rf-q-card-bottom" },
      owner === null ? el("span", { class: "rf-srow-sub" }, "未割り当て") : actorAvatar(owner, { size: "row" }),
      el("span", { class: "rf-srow-sub" }, owner === null ? "" : owner.name),
      el("span", { class: "rf-q-card-spacer" }),
      el("span", { class: "rf-srow-sub" }, row.downstreamTotal === 0 ? "下流なし" : `下流 ${row.downstreamTotal}`),
    ),
  );
  card.addEventListener("click", () => onOpen(row.id));
  return card;
}

export function renderQuestsMobile(
  model: QuestsModel,
  state: QuestsState,
  context: ScreenContext,
  callbacks: QuestsCallbacks,
  selectedId: string | null,
): ScreenRender {
  const loading = model.notices.some((notice) => notice.status === "loading");
  const rows = visibleRows(model, state);
  const selectedRow = model.rows.find((row) => row.id === selectedId) ?? null;

  /* The detail replaces the list rather than sitting under it: on a 390px
   * screen a stacked detail means the list is never reachable again without a
   * long scroll, and a second scroll owner appears. */
  if (state.mobileDetailOpen && selectedRow !== null) {
    const back = el("button", { type: "button", class: "rf-secondary-button rf-q-back" }, "一覧へ戻る");
    back.addEventListener("click", () => {
      state.mobileDetailOpen = false;
      context.rerender();
      // Focus returns to the card the user opened, not to the top of the page.
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`.rf-q-card[data-quest-id="${selectedRow.id}"]`)?.focus();
      });
    });
    const send = el("button", { type: "button", class: "rf-primary-button" }, "Commandで判断する");
    send.addEventListener("click", () => callbacks.onSendToCommand(selectedRow.id));
    return {
      main: el(
        "div",
        { class: "rf-screen rf-screen--quests", "data-mobile-view": "detail" },
        el("div", { class: "rf-q-mobile-bar" }, back),
        detailRail(model, state, context, callbacks, selectedId),
      ),
      sticky: selectedRow.interventionCandidate
        ? el("div", { class: "rf-q-sticky" }, send)
        : null,
    };
  }

  const create = el("button", { type: "button", class: "rf-primary-button" }, "Questを作成");
  if (callbacks.onCreate !== undefined) create.addEventListener("click", () => callbacks.onCreate?.());

  const main = el(
    "div",
    { class: "rf-screen rf-screen--quests", "data-mobile-view": "list" },
    screenHeader({
      title: "Quests",
      question: "何を進め、何が止まり、次に何を選ぶべきか。",
      meta: [
        { label: "要判断", value: String(bucketCount(model, "review")) },
        { label: "停止", value: String(bucketCount(model, "blocked")) },
      ],
    }),
    ...model.notices.map((notice) => screenNotice(notice)),
    segmentControl(
      "状態で絞り込む",
      [
        { id: "all", label: "すべて", count: model.rows.length },
        { id: "review", label: BUCKET_LABEL.review, count: bucketCount(model, "review") },
        { id: "blocked", label: BUCKET_LABEL.blocked, count: bucketCount(model, "blocked") },
        { id: "working", label: BUCKET_LABEL.working, count: bucketCount(model, "working") },
        { id: "scheduled", label: BUCKET_LABEL.scheduled, count: bucketCount(model, "scheduled") },
        { id: "done", label: BUCKET_LABEL.done, count: bucketCount(model, "done") },
      ],
      state.segment,
      (id) => {
        state.segment = id as QuestsState["segment"];
        context.rerender();
      },
    ),
    searchField("Questを検索", state.query, "タイトル / QF-ID", (value) => {
      state.query = value;
      context.rerender();
    }),
    loading
      ? screenSkeleton(5, "card")
      : rows.length === 0
        ? screenEmpty(
          state.query === "" ? "この条件のQuestはありません" : "検索に一致しませんでした",
          "状態タブを切り替えるか、検索語を短くしてください。",
          { label: "条件をリセット", onAct: () => { state.query = ""; state.segment = "all"; context.rerender(); } },
        )
        : el(
          "div",
          { class: "rf-q-cards" },
          ...rows.map((row) => mobileCard(row, context, selectedId, (id) => {
            context.onSelectQuest(id);
            state.mobileDetailOpen = true;
            context.rerender();
          })),
        ),
  );

  return {
    main,
    sticky: callbacks.onCreate === undefined ? null : el("div", { class: "rf-q-sticky" }, create),
  };
}

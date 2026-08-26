/**
 * Connections — the integration control surface.
 *
 * The question: "どの外部サービスが、どの権限で、安全につながっているか".
 *
 * This is not a settings list. A settings list tells you a toggle is on; this
 * screen tells you what a connection is currently *doing to your work* — which
 * Quests it feeds, when it last succeeded, why it failed, and what breaks if
 * you revoke it. Health leads, scope is second, and the dangerous actions state
 * their blast radius before the button.
 *
 * A deliberate limit, stated on screen rather than papered over: the gateway's
 * `GET /v1/integrations` returns `status`, `configurationStatus`,
 * `account.lastSyncedAt` and `account.lastError`, but it does NOT return the
 * scopes actually granted by the provider. So this screen shows the *required*
 * scopes (from `api/integration-adapters.json`) against the connection's health,
 * and says plainly that the granted set cannot be read. Inventing a "granted"
 * column would be a security claim the product cannot back.
 *
 * Nothing here ever renders a token, a refresh value, an authorization URL or a
 * provider account id. `publicAccount()` does not return them, and the
 * ViewModel has no field that could carry them.
 */

import { el } from "../primitives/dom.ts";
import {
  type ConnectionActionResult,
  type ConnectionHealth,
  type ConnectionsModel,
  type ConnectionsPort,
  type ConnectionView,
  HEALTH_CHIP,
  needsAttention,
} from "./connections-model.ts";
import {
  confirmPanel,
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
  segmentControl,
  stateChip,
  unavailableAction,
} from "./runtime.ts";

export * from "./connections-model.ts";

/* ------------------------------------------------------------------ *
 * Screen state
 * ------------------------------------------------------------------ */

export type ConnectionPhase = "idle" | "previewing" | "previewed" | "running" | "done" | "failed";

export interface ConnectionsState {
  selectedId: string | null;
  filter: "all" | "attention" | "connected";
  phase: ConnectionPhase;
  result: ConnectionActionResult | null;
  /** Set while the disconnect confirmation is open. */
  confirmingDisconnect: boolean;
  mobileDetailOpen: boolean;
}

export function initialConnectionsState(): ConnectionsState {
  return {
    selectedId: null,
    filter: "all",
    phase: "idle",
    result: null,
    confirmingDisconnect: false,
    mobileDetailOpen: false,
  };
}

function visible(model: ConnectionsModel, state: ConnectionsState): readonly ConnectionView[] {
  if (state.filter === "attention") return model.connections.filter(needsAttention);
  if (state.filter === "connected") return model.connections.filter((entry) => entry.health === "connected");
  return model.connections;
}

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

function healthChip(health: ConnectionHealth): HTMLElement {
  const chip = HEALTH_CHIP[health];
  return stateChip({ tone: chip.tone, label: chip.label, mark: chip.mark });
}

function connectionRow(
  connection: ConnectionView,
  selected: boolean,
  onSelect: () => void,
): HTMLElement {
  const row = el(
    "button",
    {
      type: "button",
      class: "rf-srow rf-c-row",
      "data-health": connection.health,
      "data-connection-id": connection.id,
      "data-selected": selected ? "true" : "false",
      "aria-current": selected ? "true" : null,
    },
    el(
      "span",
      { class: "rf-c-cell rf-c-cell-name" },
      el("span", { class: "rf-srow-title" }, connection.name),
      el("span", { class: "rf-srow-sub" }, connection.auth),
    ),
    el("span", { class: "rf-c-cell" }, healthChip(connection.health)),
    el(
      "span",
      { class: "rf-c-cell rf-c-cell-impact" },
      connection.affectedQuests.length === 0
        ? el("span", { class: "rf-srow-sub" }, "影響Questなし")
        : el("span", { class: "rf-c-impact-count" }, `Quest ${connection.affectedQuests.length}件`),
    ),
    el(
      "span",
      { class: "rf-c-cell rf-c-cell-sync" },
      el("span", { class: "rf-srow-sub" }, connection.lastSyncedAt === "" ? "同期なし" : instantLabel(connection.lastSyncedAt)),
    ),
    selected ? el("span", { class: "rf-visually-hidden" }, "選択中") : null,
  );
  row.addEventListener("click", () => onSelect());
  return row;
}

/* ------------------------------------------------------------------ *
 * Detail
 * ------------------------------------------------------------------ */

function actionResult(state: ConnectionsState): HTMLElement | null {
  if (state.phase === "previewing" || state.phase === "running") {
    return el(
      "p",
      { class: "rf-c-result", "data-tone": "busy", role: "status" },
      state.phase === "previewing" ? "変更内容を確認しています…" : "実行しています…",
    );
  }
  if (state.result === null) return null;
  if (!state.result.ok) {
    return el("p", { class: "rf-c-result", "data-tone": "error", role: "alert" }, state.result.message);
  }
  if (state.phase === "previewed" && state.result.preview !== undefined) {
    const preview = state.result.preview;
    return el(
      "div",
      { class: "rf-c-result", "data-tone": "preview", role: "status" },
      el("p", { class: "rf-c-result-title" }, "同期するとこうなります"),
      el(
        "ul",
        { class: "rf-c-preview-list" },
        el("li", null, `取り込み ${preview.imported}件`),
        el("li", null, `更新 ${preview.updated}件`),
        el("li", null, `対象外 ${preview.skipped}件`),
      ),
      el("p", { class: "rf-c-result-note" }, "ここまでは確認のみで、まだ何も書き込まれていません。"),
    );
  }
  return el("p", { class: "rf-c-result", "data-tone": "success", role: "status" }, state.result.message);
}

function detailPanel(
  model: ConnectionsModel,
  state: ConnectionsState,
  context: ScreenContext,
  port: ConnectionsPort,
): HTMLElement {
  const connection = model.connections.find((entry) => entry.id === state.selectedId) ?? null;
  if (connection === null) {
    return screenRegion(
      "選択中の接続",
      { variant: "detail" },
      screenEmpty("接続を選んでください", "左の一覧から1件選ぶと、権限、最終同期、影響するQuestがここに出ます。"),
    );
  }

  const run = async (
    phase: ConnectionPhase,
    work: () => Promise<ConnectionActionResult>,
  ): Promise<void> => {
    if (state.phase === "previewing" || state.phase === "running") return;
    state.phase = phase;
    state.result = null;
    context.rerender();
    const result = await work();
    state.result = result;
    state.phase = result.ok ? (phase === "previewing" ? "previewed" : "done") : "failed";
    context.rerender();
    context.announce(result.message);
  };

  const actions: HTMLElement[] = [];

  if (connection.canSync) {
    const preview = el("button", { type: "button", class: "rf-secondary-button", disabled: model.writeHeld ? true : null }, "同期を確認");
    preview.addEventListener("click", () => { void run("previewing", () => port.previewSync(connection.id)); });
    actions.push(preview);
    const sync = el(
      "button",
      {
        type: "button",
        class: "rf-primary-button",
        // Executing a sync requires having previewed it, exactly like the
        // Handoff decision on Command.
        disabled: model.writeHeld || state.phase !== "previewed" ? true : null,
      },
      state.phase === "running" ? "同期中…" : "同期を実行",
    );
    sync.addEventListener("click", () => { void run("running", () => port.runSync(connection.id)); });
    actions.push(sync);
  }

  if (connection.canReconnect) {
    const reconnect = el("button", { type: "button", class: "rf-primary-button", disabled: model.writeHeld ? true : null }, "再接続する");
    reconnect.addEventListener("click", () => { void run("running", () => port.reconnect(connection.id)); });
    actions.push(reconnect);
  }

  if (connection.canDisconnect) {
    const disconnect = el("button", { type: "button", class: "rf-secondary-button rf-c-disconnect", disabled: model.writeHeld ? true : null }, "接続を解除");
    disconnect.addEventListener("click", () => {
      state.confirmingDisconnect = true;
      context.rerender();
    });
    actions.push(disconnect);
  }

  return screenRegion(
    "選択中の接続",
    { variant: "detail", scroll: true },
    el(
      "div",
      { class: "rf-c-detail-head" },
      el("h3", { class: "rf-c-detail-name" }, connection.name),
      healthChip(connection.health),
    ),
    el("p", { class: "rf-c-detail-summary" }, connection.summary),
    connection.lastError === ""
      ? null
      : el("p", { class: "rf-c-detail-error" }, el("b", { class: "rf-inline-label" }, "直近の失敗 "), connection.lastError),

    el("h4", { class: "rf-c-detail-label" }, "認証と権限"),
    el(
      "dl",
      { class: "rf-c-facts" },
      el("dt", null, "認証方式"),
      el("dd", null, connection.auth),
      el("dt", null, "アカウント"),
      el("dd", null, connection.accountLabel === "" ? "未接続" : connection.accountLabel),
      el("dt", null, "最終同期"),
      el("dd", null, connection.lastSyncedAt === "" ? "同期の記録はありません" : instantLabel(connection.lastSyncedAt)),
    ),
    el("h5", { class: "rf-c-scope-label" }, `必要なスコープ ${connection.requiredScopes.length}件`),
    connection.requiredScopes.length === 0
      ? el("p", { class: "rf-c-detail-note" }, "このアダプタはOAuthスコープを必要としません。")
      : el(
        "ul",
        { class: "rf-c-scopes" },
        ...connection.requiredScopes.map((scope) => el(
          "li",
          { class: "rf-c-scope", "data-state": connection.health === "connected" || connection.health === "degraded" ? "satisfied" : "unmet" },
          el("span", { class: "rf-c-scope-mark", "aria-hidden": "true" }),
          el("span", { class: "rf-c-scope-name" }, scope),
        )),
      ),
    /* The honest limit, stated where the comparison would otherwise be. */
    model.grantedScopesUnavailable
      ? unavailableAction(
        "付与済みスコープの照合",
        "ゲートウェイは付与済みスコープを返さないため、必要スコープと接続状態のみ表示しています",
      )
      : null,

    el("h4", { class: "rf-c-detail-label" }, `影響する対象 ${connection.affectedQuests.length + connection.affectedAgents.length}件`),
    connection.affectedQuests.length === 0
      ? el("p", { class: "rf-c-detail-note" }, "この接続に紐づくQuestはありません。")
      : el(
        "ul",
        { class: "rf-c-affected" },
        ...connection.affectedQuests.map((quest) => {
          const jump = el(
            "button",
            { type: "button", class: "rf-c-affected-row" },
            el("span", { class: "rf-srow-id" }, quest.ref),
            el("span", { class: "rf-c-affected-title" }, quest.title),
          );
          jump.addEventListener("click", () => context.onNavigate("quests", quest.id));
          return el("li", null, jump);
        }),
      ),
    connection.affectedAgents.length === 0
      ? null
      : el(
        "p",
        { class: "rf-c-detail-note" },
        `連携スコープを持つAgent: ${connection.affectedAgents.join(", ")}`,
      ),

    el("h4", { class: "rf-c-detail-label" }, "操作"),
    model.writeHeld
      ? el("p", { class: "rf-c-detail-note" }, "接続または鮮度の問題により、書き込みは保留されています。")
      : null,
    actions.length === 0
      ? el("p", { class: "rf-c-detail-note" }, "この接続に対して実行できる操作はありません。")
      : el("div", { class: "rf-c-actions" }, ...actions),
    actionResult(state),
    state.confirmingDisconnect
      ? confirmPanel({
        action: "接続を解除",
        impact: [
          `${connection.name} のアクセス権を失効させます。`,
          connection.affectedQuests.length === 0
            ? "紐づいているQuestはありません。"
            : `${connection.affectedQuests.length}件のQuestの同期が止まります（Quest自体は削除されません）。`,
          "再度使うには、あらためて接続の許可が必要です。",
        ],
        confirmLabel: "解除する",
        busy: state.phase === "running",
        onConfirm: () => {
          state.confirmingDisconnect = false;
          void (async () => {
            state.phase = "running";
            context.rerender();
            const result = await port.disconnect(connection.id);
            state.result = result;
            state.phase = result.ok ? "done" : "failed";
            context.rerender();
            context.announce(result.message);
          })();
        },
        onCancel: () => {
          state.confirmingDisconnect = false;
          context.rerender();
        },
      })
      : null,
  );
}

/* ------------------------------------------------------------------ *
 * Desktop
 * ------------------------------------------------------------------ */

function connectionMetrics(model: ConnectionsModel): readonly Metric[] {
  const attention = model.connections.filter(needsAttention).length;
  const connected = model.connections.filter((entry) => entry.health === "connected").length;
  const affected = model.connections
    .filter(needsAttention)
    .reduce((total, entry) => total + entry.affectedQuests.length, 0);
  return [
    { label: "要対応", value: String(attention), note: "失効 / 劣化 / 権限", tone: attention > 0 ? "danger" : "done" },
    { label: "影響中のQuest", value: String(affected), note: "要対応の接続に紐づく", tone: "blocked" },
    { label: "接続中", value: String(connected), tone: "done" },
    { label: "登録済み", value: String(model.connections.length), tone: "neutral" },
  ];
}

export function renderConnectionsDesktop(
  model: ConnectionsModel,
  state: ConnectionsState,
  context: ScreenContext,
  port: ConnectionsPort,
): ScreenRender {
  const loading = model.notices.some((notice) => notice.status === "loading");
  const rows = visible(model, state);
  if (state.selectedId === null && rows.length > 0) state.selectedId = rows[0]?.id ?? null;

  const list = el(
    "div",
    { class: "rf-c-list" },
    ...rows.map((connection) => connectionRow(connection, connection.id === state.selectedId, () => {
      state.selectedId = connection.id;
      state.phase = "idle";
      state.result = null;
      state.confirmingDisconnect = false;
      context.rerender();
      context.announce(`${connection.name} を選択しました`);
    })),
  );

  list.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (rows.length === 0) return;
    event.preventDefault();
    const at = rows.findIndex((connection) => connection.id === state.selectedId);
    const next = Math.min(rows.length - 1, Math.max(0, (at === -1 ? 0 : at) + (event.key === "ArrowDown" ? 1 : -1)));
    state.selectedId = rows[next]?.id ?? state.selectedId;
    state.phase = "idle";
    state.result = null;
    context.rerender();
  });

  const main = el(
    "div",
    { class: "rf-screen rf-screen--connections" },
    screenHeader({
      title: "Connections",
      question: "どの外部サービスが、どの権限で、安全につながっているか。",
      meta: [{ label: "登録済み", value: String(model.connections.length) }],
      actions: [
        segmentControl(
          "状態で絞り込む",
          [
            { id: "all", label: "すべて", count: model.connections.length },
            { id: "attention", label: "要対応", count: model.connections.filter(needsAttention).length },
            { id: "connected", label: "接続中", count: model.connections.filter((entry) => entry.health === "connected").length },
          ],
          state.filter,
          (id) => {
            state.filter = id as ConnectionsState["filter"];
            state.selectedId = null;
            context.rerender();
          },
        ),
      ],
    }),
    ...model.notices.map((notice) => screenNotice(notice)),
    metricRow(connectionMetrics(model)),
    el(
      "div",
      { class: "rf-c-workspace" },
      screenRegion(
        "接続",
        { scroll: true, variant: "list" },
        el(
          "div",
          { class: "rf-c-head" },
          el("span", { class: "rf-col-label" }, "サービス"),
          el("span", { class: "rf-col-label" }, "状態"),
          el("span", { class: "rf-col-label" }, "影響"),
          el("span", { class: "rf-col-label" }, "最終同期"),
        ),
        loading
          ? screenSkeleton(6, "row")
          : rows.length === 0
            ? screenEmpty(
              state.filter === "attention" ? "対応が必要な接続はありません" : "接続がありません",
              state.filter === "attention"
                ? "すべての接続が正常です。タブを「すべて」に戻すと一覧が見られます。"
                : "サービスを接続すると、Questの取り込みと書き出しが行えます。",
            )
            : list,
      ),
      detailPanel(model, state, context, port),
    ),
  );

  return { main };
}

/* ------------------------------------------------------------------ *
 * Mobile
 * ------------------------------------------------------------------ */

export function renderConnectionsMobile(
  model: ConnectionsModel,
  state: ConnectionsState,
  context: ScreenContext,
  port: ConnectionsPort,
): ScreenRender {
  const loading = model.notices.some((notice) => notice.status === "loading");
  const rows = visible(model, state);

  if (state.mobileDetailOpen && state.selectedId !== null) {
    const returnTo = state.selectedId;
    const back = el("button", { type: "button", class: "rf-secondary-button rf-c-back" }, "一覧へ戻る");
    back.addEventListener("click", () => {
      state.mobileDetailOpen = false;
      state.confirmingDisconnect = false;
      context.rerender();
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`.rf-c-card[data-connection-id="${returnTo}"]`)?.focus();
      });
    });
    return {
      main: el(
        "div",
        { class: "rf-screen rf-screen--connections", "data-mobile-view": "detail" },
        el("div", { class: "rf-c-mobile-bar" }, back),
        detailPanel(model, state, context, port),
      ),
    };
  }

  const main = el(
    "div",
    { class: "rf-screen rf-screen--connections", "data-mobile-view": "list" },
    screenHeader({
      title: "Connections",
      question: "どの外部サービスが、どの権限で、安全につながっているか。",
      meta: [{ label: "要対応", value: String(model.connections.filter(needsAttention).length) }],
    }),
    ...model.notices.map((notice) => screenNotice(notice)),
    segmentControl(
      "状態で絞り込む",
      [
        { id: "all", label: "すべて", count: model.connections.length },
        { id: "attention", label: "要対応", count: model.connections.filter(needsAttention).length },
        { id: "connected", label: "接続中", count: model.connections.filter((entry) => entry.health === "connected").length },
      ],
      state.filter,
      (id) => {
        state.filter = id as ConnectionsState["filter"];
        context.rerender();
      },
    ),
    loading
      ? screenSkeleton(4, "card")
      : rows.length === 0
        ? screenEmpty("この条件の接続はありません", "タブを切り替えてください。")
        : el(
          "div",
          { class: "rf-c-cards" },
          ...rows.map((connection) => {
            const card = el(
              "button",
              {
                type: "button",
                class: "rf-c-card",
                "data-health": connection.health,
                "data-connection-id": connection.id,
              },
              el(
                "span",
                { class: "rf-c-card-top" },
                el("span", { class: "rf-srow-title" }, connection.name),
                healthChip(connection.health),
              ),
              el("span", { class: "rf-c-card-summary" }, connection.summary),
              el(
                "span",
                { class: "rf-c-card-bottom" },
                el("span", { class: "rf-srow-sub" }, connection.affectedQuests.length === 0 ? "影響Questなし" : `Quest ${connection.affectedQuests.length}件`),
                el("span", { class: "rf-srow-sub" }, connection.lastSyncedAt === "" ? "同期なし" : instantLabel(connection.lastSyncedAt)),
              ),
            );
            card.addEventListener("click", () => {
              state.selectedId = connection.id;
              state.mobileDetailOpen = true;
              state.phase = "idle";
              state.result = null;
              context.rerender();
            });
            return card;
          }),
        ),
  );

  return { main };
}

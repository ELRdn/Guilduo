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
import { relayText } from "../relay-copy.ts";
import { t } from "../../../i18n.ts";
import {
  type ConnectionActionResult,
  type ConnectionHealth,
  type ConnectionsModel,
  type ConnectionsPort,
  type ConnectionView,
  HEALTH_CHIP,
  connectionSyncDirection,
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
  countLabel,
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
  resultId: string | null;
  busyId: string | null;
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
    resultId: null,
    busyId: null,
    confirmingDisconnect: false,
    mobileDetailOpen: false,
  };
}

function visible(model: ConnectionsModel, state: ConnectionsState): readonly ConnectionView[] {
  if (state.filter === "attention") return model.connections.filter(needsAttention);
  if (state.filter === "connected") return model.connections.filter((entry) => entry.health === "connected");
  return model.connections;
}

function selectConnection(state: ConnectionsState, id: string | null): void {
  state.selectedId = id;
  state.result = null;
  state.resultId = null;
  state.confirmingDisconnect = false;
  if (state.busyId === null) state.phase = "idle";
}

function focusConnection(id: string): void {
  window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`.rf-screen--connections [data-connection-id="${CSS.escape(id)}"]`)?.focus({ preventScroll:true }));
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
      tabindex: selected ? 0 : -1,
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
        ? el("span", { class: "rf-srow-sub" }, relayText("connectionNoQuests"))
        : el("span", { class: "rf-c-impact-count" }, `Quest ${countLabel(connection.affectedQuests.length)}`),
    ),
    el(
      "span",
      { class: "rf-c-cell rf-c-cell-sync" },
      el("span", { class: "rf-srow-sub" }, connection.lastSyncedAt === "" ? relayText("connectionNoSync") : instantLabel(connection.lastSyncedAt)),
    ),
    selected ? el("span", { class: "rf-visually-hidden" }, relayText("selected")) : null,
  );
  row.addEventListener("click", () => onSelect());
  return row;
}

/* ------------------------------------------------------------------ *
 * Detail
 * ------------------------------------------------------------------ */

function actionResult(state: ConnectionsState): HTMLElement | null {
  if (state.busyId === state.selectedId && (state.phase === "previewing" || state.phase === "running")) {
    return el(
      "p",
      { class: "rf-c-result", "data-tone": "busy", role: "status" },
      state.phase === "previewing" ? relayText("connectionPreviewing") : relayText("executing"),
    );
  }
  if (state.result === null || state.resultId !== state.selectedId) return null;
  if (!state.result.ok) {
    return el("p", { class: "rf-c-result", "data-tone": "error", role: "alert" }, state.result.message);
  }
  if (state.phase === "previewed" && state.result.preview !== undefined) {
    const preview = state.result.preview;
    return el(
      "div",
      { class: "rf-c-result", "data-tone": "preview", role: "status" },
      el("p", { class: "rf-c-result-title" }, t("integration.preview")),
      el(
        "ul",
        { class: "rf-c-preview-list" },
        el("li", null, `${relayText("connectionCreated")}: ${countLabel(preview.imported)}`),
        el("li", null, `${relayText("connectionUpdated")}: ${countLabel(preview.updated)}`),
        el("li", null, `${relayText("connectionSkipped")}: ${countLabel(preview.skipped)}`),
        el("li", null, `${relayText("connectionConflicts")}: ${countLabel(preview.conflicts ?? 0)}`),
      ),
      el("p", { class: "rf-c-result-note" }, relayText("connectionPreviewOnly")),
    );
  }
  return el("p", { class: "rf-c-result", "data-tone": state.result.code === "refresh_failed" ? "error" : "success", role: "status" }, state.result.message);
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
      relayText("connectionDetail"),
      { variant: "detail" },
      screenEmpty(relayText("connectionSelect"), relayText("connectionSelectHint")),
    );
  }

  const run = async (
    phase: ConnectionPhase,
    work: () => Promise<ConnectionActionResult>,
    reload = false,
  ): Promise<void> => {
    if (state.busyId !== null || (model.writeHeld && !reload)) return;
    state.busyId = connection.id;
    state.phase = phase;
    state.result = null;
    state.resultId = null;
    context.rerender();
    let result: ConnectionActionResult;
    try { result = await work(); }
    catch { result = { ok:false, code:"failed", get message() { return relayText("connectionFailed"); } }; }
    if (phase === "previewing" && result.ok && result.preview === undefined) result = { ok:false, code:"invalid_response", get message() { return relayText("connectionInvalidResponse"); } };
    state.busyId = null;
    if (state.selectedId === connection.id) {
      state.result = result;
      state.resultId = connection.id;
      state.phase = result.ok ? (phase === "previewing" ? "previewed" : "done") : "failed";
    } else state.phase = "idle";
    context.rerender();
    context.announce(`${connection.name}: ${result.message}`);
  };

  const actions: HTMLElement[] = [];
  const busy = state.busyId !== null;

  if (connection.canSync) {
    const preview = el("button", { type: "button", class: "rf-secondary-button", "data-connection-action":"preview", disabled: model.writeHeld || busy }, t("integration.previewLive"));
    preview.addEventListener("click", () => { void run("previewing", () => port.previewSync(connection.id)); });
    actions.push(preview);
    const sync = el(
      "button",
      {
        type: "button",
        class: "rf-primary-button",
        // Executing a sync requires having previewed it, exactly like the
        // Handoff decision on Command.
        "data-connection-action":"sync",
        disabled: model.writeHeld || busy || state.phase !== "previewed" || state.resultId !== connection.id || state.result?.preview === undefined,
      },
      state.phase === "running" ? relayText("executing") : t("integration.confirmSync"),
    );
    sync.addEventListener("click", () => { if (state.phase === "previewed" && state.resultId === connection.id && state.result?.preview !== undefined) void run("running", () => port.runSync(connection.id)); });
    actions.push(sync);
  }

  if (connection.canReconnect) {
    const reconnect = el("button", { type: "button", class: "rf-primary-button", "data-connection-action":"reconnect", disabled: model.writeHeld || busy }, t("integration.reconnect"));
    reconnect.addEventListener("click", () => { void run("running", () => port.reconnect(connection.id)); });
    actions.push(reconnect);
  }

  if (connection.canDisconnect) {
    const disconnect = el("button", { type: "button", class: "rf-secondary-button rf-c-disconnect", "data-connection-action":"disconnect", disabled: model.writeHeld || busy }, t("integration.disconnect"));
    disconnect.addEventListener("click", () => {
      if (state.busyId !== null || model.writeHeld) return;
      state.confirmingDisconnect = true;
      context.rerender();
    });
    actions.push(disconnect);
  }
  if (port.refresh && model.refreshFailed) {
    const reload = el("button", { type:"button", class:"rf-secondary-button", "data-connection-action":"reload", disabled:busy }, relayText("connectionReload"));
    reload.addEventListener("click", () => { void run("running", () => port.refresh!(), true); });
    actions.push(reload);
  }

  return screenRegion(
    relayText("connectionDetail"),
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
      : el("p", { class: "rf-c-detail-error" }, el("b", { class: "rf-inline-label" }, `${relayText("connectionLastError")}: `), connection.lastError),

    el("h4", { class: "rf-c-detail-label" }, relayText("connectionAuthScopes")),
    el(
      "dl",
      { class: "rf-c-facts" },
      el("dt", null, relayText("connectionAuthMethod")),
      el("dd", null, connection.auth),
      el("dt", null, t("integration.connectedAccount")),
      el("dd", null, connection.accountLabel === "" ? relayText("unconnected") : connection.accountLabel),
      el("dt", null, relayText("connectionLastSync")),
      el("dd", null, connection.lastSyncedAt === "" ? relayText("connectionNoSync") : instantLabel(connection.lastSyncedAt)),
      connection.canSync ? el("dt", null, t("integration.direction")) : null,
      connection.canSync ? el("dd", null, t(`integration.direction.${connectionSyncDirection(connection.id)}`)) : null,
    ),
    el("h5", { class: "rf-c-scope-label" }, `${relayText("connectionRequiredScopes")}: ${countLabel(connection.requiredScopes.length)}`),
    connection.requiredScopes.length === 0
      ? el("p", { class: "rf-c-detail-note" }, relayText("connectionNoScopeList"))
      : el(
        "ul",
        { class: "rf-c-scopes" },
        ...connection.requiredScopes.map((scope) => el(
          "li",
          { class: "rf-c-scope", "data-state": "required" },
          el("span", { class: "rf-c-scope-mark", "aria-hidden": "true" }),
          el("span", { class: "rf-c-scope-name" }, scope),
        )),
      ),
    /* The honest limit, stated where the comparison would otherwise be. */
    model.grantedScopesUnavailable
      ? el("p", { class:"rf-c-detail-note" }, `${relayText("connectionGrantedScopes")}: ${relayText("connectionScopeLimit")}`)
      : null,

    el("h4", { class: "rf-c-detail-label" }, `${relayText("connectionImpact")}: Quest ${countLabel(connection.affectedQuests.length)}`),
    connection.affectedQuests.length === 0
      ? el("p", { class: "rf-c-detail-note" }, relayText("connectionNoQuests"))
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
        `${relayText("connectionAllowedAgents")}: ${connection.affectedAgents.join(", ")}`,
      ),

    el("h4", { class: "rf-c-detail-label" }, relayText("connectionActions")),
    model.refreshFailed ? el("p", { class:"rf-c-result", "data-tone":"error", role:"alert" }, relayText("connectionRefreshFailed")) : null,
    model.writeHeld
      ? el("p", { class: "rf-c-detail-note" }, relayText("connectionHeld"))
      : null,
    actions.length === 0
      ? el("p", { class: "rf-c-detail-note" }, relayText(connection.id.startsWith("toggl-") ? "connectionDedicated" : "connectionNoActions"))
      : el("div", { class: "rf-c-actions" }, ...actions),
    actionResult(state),
    state.confirmingDisconnect && !busy
      ? confirmPanel({
        action: t("integration.disconnect"),
        impact: [
          `${connection.name}: ${relayText("connectionRevokeHint")}`,
          ...(connection.id === "google-calendar" || connection.id === "google-tasks" ? [relayText("connectionGoogleRevoke")] : []),
          relayText("connectionStopSync"),
        ],
        confirmLabel: t("integration.disconnect"),
        busy: busy || model.writeHeld,
        onConfirm: () => {
          if (state.busyId !== null || model.writeHeld) return;
          state.confirmingDisconnect = false;
          void run("running", () => port.disconnect(connection.id));
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
  const affected = new Set(model.connections.filter(needsAttention).flatMap(entry => entry.affectedQuests.map(quest => quest.id))).size;
  return [
    { label: relayText("networkAttention"), value: countLabel(attention), tone: attention > 0 ? "danger" : "done" },
    { label: relayText("connectionImpact"), value: countLabel(affected), tone: "blocked" },
    { label: relayText("networkConnected"), value: countLabel(connected), tone: "done" },
    { label: relayText("registered"), value: countLabel(model.connections.length), tone: "neutral" },
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
  if (!rows.some(entry => entry.id === state.selectedId)) selectConnection(state, rows[0]?.id ?? null);

  const list = el(
    "div",
    { class: "rf-c-list" },
    ...rows.map((connection) => connectionRow(connection, connection.id === state.selectedId, () => {
      selectConnection(state, connection.id);
      context.rerender();
      focusConnection(connection.id);
      context.announce(`${connection.name}: ${relayText("selected")}`);
    })),
  );

  list.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    if (rows.length === 0) return;
    event.preventDefault();
    const at = rows.findIndex((connection) => connection.id === state.selectedId);
    const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.min(rows.length - 1, Math.max(0, (at === -1 ? 0 : at) + (event.key === "ArrowDown" ? 1 : -1)));
    selectConnection(state, rows[next]?.id ?? null);
    context.rerender();
    if (state.selectedId) focusConnection(state.selectedId);
  });

  const main = el(
    "div",
    { class: "rf-screen rf-screen--connections" },
    screenHeader({
      title: "Connections",
      question: relayText("connectionQuestion"),
      meta: [{ label: relayText("registered"), value: countLabel(model.connections.length) }],
      actions: [
        segmentControl(
          relayText("filterStatus"),
          [
            { id: "all", label: relayText("all"), count: model.connections.length },
            { id: "attention", label: relayText("networkAttention"), count: model.connections.filter(needsAttention).length },
            { id: "connected", label: relayText("networkConnected"), count: model.connections.filter((entry) => entry.health === "connected").length },
          ],
          state.filter,
          (id) => {
            state.filter = id as ConnectionsState["filter"];
            selectConnection(state, null);
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
        "Connections",
        { scroll: true, variant: "list" },
        el(
          "div",
          { class: "rf-c-head" },
          el("span", { class: "rf-col-label" }, t("integration.service")),
          el("span", { class: "rf-col-label" }, relayText("status")),
          el("span", { class: "rf-col-label" }, relayText("impact")),
          el("span", { class: "rf-col-label" }, relayText("connectionLastSync")),
        ),
        loading
          ? screenSkeleton(6, "row")
          : rows.length === 0
            ? screenEmpty(
              relayText(state.filter === "attention" ? "connectionNoAttention" : "connectionEmpty"),
              relayText("connectionEmptyHint"),
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
    const back = el("button", { type: "button", class: "rf-secondary-button rf-c-back", "data-connection-action":"back" }, relayText("backToList"));
    back.addEventListener("click", () => {
      state.mobileDetailOpen = false;
      state.confirmingDisconnect = false;
      context.rerender();
      focusConnection(returnTo);
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
      question: relayText("connectionQuestion"),
      meta: [{ label: relayText("networkAttention"), value: countLabel(model.connections.filter(needsAttention).length) }],
    }),
    ...model.notices.map((notice) => screenNotice(notice)),
    segmentControl(
      relayText("filterStatus"),
      [
        { id: "all", label: relayText("all"), count: model.connections.length },
        { id: "attention", label: relayText("networkAttention"), count: model.connections.filter(needsAttention).length },
        { id: "connected", label: relayText("networkConnected"), count: model.connections.filter((entry) => entry.health === "connected").length },
      ],
      state.filter,
      (id) => {
        state.filter = id as ConnectionsState["filter"];
        selectConnection(state, null);
        context.rerender();
      },
    ),
    loading
      ? screenSkeleton(4, "card")
      : rows.length === 0
        ? screenEmpty(relayText("connectionEmpty"), relayText("connectionEmptyHint"))
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
                el("span", { class: "rf-srow-sub" }, connection.affectedQuests.length === 0 ? relayText("connectionNoQuests") : `Quest ${countLabel(connection.affectedQuests.length)}`),
                el("span", { class: "rf-srow-sub" }, connection.lastSyncedAt === "" ? relayText("connectionNoSync") : instantLabel(connection.lastSyncedAt)),
              ),
            );
            card.addEventListener("click", () => {
              selectConnection(state, connection.id);
              state.mobileDetailOpen = true;
              context.rerender();
              window.requestAnimationFrame(() => document.querySelector<HTMLElement>(".rf-c-back")?.focus({ preventScroll:true }));
            });
            return card;
          }),
        ),
  );

  return { main };
}

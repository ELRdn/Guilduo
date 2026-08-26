/**
 * Relay Forge App Shell and the Command Golden Screen.
 *
 * Composition follows NEWDESIGNv2.md section 3:
 *
 *   Forge Rail | Operation Bar + Capacity Band
 *              | Attention Shelf                       | Intervention
 *              | Quest Loom (26%) | Selected Quest (74%)|   Lens
 *              | Execution Chronicle strip             |
 *
 * Section 10 is the load-bearing rule here: there is exactly one selection
 * state. `selectedQuestId` drives the Shelf, the Loom weave, the centre
 * workspace, the Lens and the Chronicle context; no region keeps its own copy.
 *
 * Command is the only screen implemented. The remaining Forge Rail destinations
 * exist as navigation structure and are intentionally not migrated.
 */

import {
  createFixtureCommandModel,
  fixtureCapacity,
  fixtureCapacityStale,
} from "./fixtures.ts";
import {
  type CapacitySlot,
  type CommandModel,
  deriveSelectedQuestView,
  type Intervention,
  type LoomQuest,
  type SelectedQuestView,
} from "./model.ts";
import {
  blockingReason,
  type DecisionKind,
  type DecisionResult,
  IDLE_DECISION,
  submitDecision,
} from "./decision.ts";
import { FixtureHandoffPort } from "./fixture-port.ts";
import { fixtureRawQuests } from "./fixtures.ts";
import { mobileCommand, mobileDecisionBar } from "./mobile.ts";
import { capacityBand } from "./primitives/capacity.ts";
import { chronicleStrip, executionChronicle } from "./primitives/chronicle.ts";
import { el, replaceChildren } from "./primitives/dom.ts";
import { interventionLens, type LensState } from "./primitives/lens.ts";
import { selectedQuestWorkspace } from "./primitives/selected-quest.ts";
import { attentionShelf } from "./primitives/shelf.ts";
import { bottomSheet, type SheetHandle } from "./primitives/sheet.ts";
import { questLoom } from "./primitives/spine.ts";
import {
  fixtureAgentsFor,
  fixtureIntegrationsFor,
  fixturePartyMembersFor,
  fixturePartyNameFor,
  fixtureQuestsFor,
  FIXTURE_NOW,
  FIXTURE_TODAY,
  isScreenVariant,
  noticesFor,
  type ScreenVariant,
  writeHeldFor,
} from "./screens/fixtures.ts";
import type { ScreenContext, ScreenRender } from "./screens/runtime.ts";
import {
  initialQuestsState,
  normalizeQuestsModel,
  type QuestsState,
  renderQuestsDesktop,
  renderQuestsMobile,
} from "./screens/quests.ts";
import {
  initialNetworkState,
  type NetworkState,
  normalizeNetworkModel,
  renderNetworkDesktop,
  renderNetworkMobile,
} from "./screens/network.ts";
import {
  initialPartyState,
  normalizePartyModel,
  type PartyState,
  renderPartyDesktop,
  renderPartyMobile,
} from "./screens/party.ts";
import {
  type BattleState as BattleScreenState,
  initialBattleState,
  normalizeBattleModel,
  renderBattleDesktop,
  renderBattleMobile,
} from "./screens/battle.ts";
import { type BattleFailure, FixtureBattlePort, fixtureBattleState } from "./screens/battle-port.ts";
import type { BattleSession, Quest } from "../../types/questforge.ts";
import {
  type ConnectionsState,
  initialConnectionsState,
  normalizeConnectionsModel,
  renderConnectionsDesktop,
  renderConnectionsMobile,
} from "./screens/connections.ts";
import {
  type ConnectionFailure,
  FixtureConnectionsPort,
  REQUIRED_SCOPES,
} from "./screens/connections-port.ts";
import type { RelayForgeRuntime } from "./production.ts";
import { normalizeCommandModel } from "./adapter.ts";
import { questActionState, type QuestActionId } from "./quest-actions.ts";

/**
 * Section 5.1 primary domains of NEWDESIGN.md.
 *
 * Command remains the visual reference; the other five are separate screens
 * that share the shell, the tokens, the identity map and the state vocabulary,
 * and nothing else. Each owns its own composition and scroll ownership.
 */
const DOMAINS = [
  { id: "command", label: "Command", mnemonic: "C", migrated: true, primaryOnMobile: true },
  { id: "quests", label: "Quests", mnemonic: "Q", migrated: true, primaryOnMobile: true },
  { id: "network", label: "Network", mnemonic: "N", migrated: true, primaryOnMobile: true },
  { id: "party", label: "Party", mnemonic: "P", migrated: true, primaryOnMobile: true },
  { id: "battle", label: "Battle", mnemonic: "B", migrated: true, primaryOnMobile: false },
  { id: "connections", label: "Connections", mnemonic: "X", migrated: true, primaryOnMobile: false },
] as const;

/**
 * At 390px the bar carries four primary destinations plus `More`, so every
 * label stays legible rather than being truncated to fit six (brief 1.1).
 * Battle and Connections move under `More`.
 */
const MOBILE_OVERFLOW = DOMAINS.filter((domain) => !domain.primaryOnMobile);

type DomainId = (typeof DOMAINS)[number]["id"];

interface ShellState {
  model: CommandModel;
  domain: DomainId;
  /** Section 10: the single source of truth for selection across all regions. */
  selectedQuestId: string | null;
  lensState: LensState;
  railCollapsed: boolean;
  loomCollapsed: boolean;
  chronicleExpanded: boolean;
  /** Artifact whose Output preview is open in the centre workspace (A5). */
  previewArtifactId: string | null;
  stale: boolean;
  /* Mobile-only view state. Selection itself stays shared with desktop. */
  mobileEvidenceOpen: boolean;
  mobileSupportingOpen: boolean;
  mobileChronicleOpen: boolean;
  questFlowOpen: boolean;
  moreOpen: boolean;
  /** Set once the user scrolls the Shelf, so auto-snap stops interfering. */
  shelfUserScrolled: boolean;
  /* Decision flow. `decision` is the last result from the Handoff Command. */
  revisionOpen: boolean;
  revisionReason: string;
  revisionError: string | null;
  decision: DecisionResult;
  taskSubmitting: boolean;
  taskMessage: string;
  taskTone: "success" | "error" | null;
  theme: "light" | "dark" | "system";
  /** Element focus returns to when the Lens closes. */
  lensTrigger: HTMLElement | null;
  /**
   * Per-screen view state. Selection is NOT in here: `selectedQuestId` above
   * stays the single source of truth across all six destinations, so a Quest
   * chosen in Quests is the Quest Command opens (section 10, extended).
   */
  screens: {
    quests: QuestsState;
    network: NetworkState;
    party: PartyState;
    battle: BattleScreenState;
    connections: ConnectionsState;
  };
  /** The forced fixture state, shared by every screen for the capture set. */
  variant: ScreenVariant;
}

function resolveTheme(preference: ShellState["theme"]): void {
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
}

export function mountRelayForge(root: HTMLElement, runtime: RelayForgeRuntime | null = null): void {
  const production = runtime !== null;
  const initialModel = runtime?.model ?? createFixtureCommandModel();
  const initialQuestId = initialModel.interventions[0]?.questId ?? initialModel.quests[0]?.id ?? null;
  let sharedQuests = [...(runtime?.quests ?? fixtureQuestsFor(readVariant()))];
  const state: ShellState = {
    model: initialModel,
    domain: "command",
    selectedQuestId: production ? initialQuestId : "q-184",
    lensState: window.matchMedia("(max-width: 900px)").matches ? "closed" : "open",
    railCollapsed: false,
    loomCollapsed: false,
    chronicleExpanded: false,
    previewArtifactId: null,
    stale: false,
    mobileEvidenceOpen: false,
    mobileSupportingOpen: false,
    mobileChronicleOpen: false,
    questFlowOpen: false,
    moreOpen: false,
    shelfUserScrolled: false,
    revisionOpen: false,
    revisionReason: "",
    revisionError: null,
    decision: IDLE_DECISION,
    taskSubmitting: false,
    taskMessage: "",
    taskTone: null,
    theme: readStoredTheme(),
    lensTrigger: null,
    screens: {
      quests: initialQuestsState(),
      network: initialNetworkState(),
      party: initialPartyState(),
      battle: initialBattleState(),
      connections: initialConnectionsState(),
    },
    variant: readVariant(),
  };
  resolveTheme(state.theme);

  /* `?state=` selects one of the section B5 states deterministically for the
   * capture set. It only ever restricts what the UI will do (locking writes,
   * emptying the queue, surfacing an error); it never fabricates a success. */
  const forcedState = new URLSearchParams(window.location.search).get("state");
  /* The Handoff Command port. `FixtureHandoffPort` mirrors the domain rules of
   * `transitionQuestHandoff`; a signed-in deployment substitutes
   * `QuestForgeRepository`, which satisfies the same `HandoffPort` interface. */
  const fixtureHandoffPort = new FixtureHandoffPort(fixtureRawQuests, {
    failure: forcedState === "permission" ? "permission"
      : forcedState === "conflict" ? "conflict"
      : forcedState === "network" ? "network"
      : forcedState === "invalid" ? "invalid"
      : null,
    latencyMs: forcedState === "submitting" ? 4000 : 0,
  });
  const handoffPort = runtime?.handoffPort ?? fixtureHandoffPort;
  const rawHandoffStates = new Map(
    (runtime?.quests ?? fixtureRawQuests).map((quest) => [quest.id, quest.assignee.handoffState]),
  );
  if (forcedState === "stale") state.stale = true;
  if (forcedState === "empty") {
    state.model = { ...state.model, interventions: [] };
    state.selectedQuestId = null;
  }

  const lensAsSheet = window.matchMedia("(max-width: 900px)");
  const isMobile = (): boolean => lensAsSheet.matches;
  let questFlowSheet: SheetHandle | null = null;
  /** Quest the Shelf was last aligned to, so auto-snap runs once per change. */
  let shelfAlignedTo: string | null = null;

  /* The Battle port runs the real `executeBattleCommand`, so a preview and an
   * execution here obey the same rules the gateway applies. `battleSession` is
   * only ever replaced by what the domain returns — never by a local guess. */
  const battleFailure: BattleFailure = state.variant === "permission"
    ? "permission"
    : state.variant === "offline" || state.variant === "error"
      ? "network"
      : state.variant === "conflict"
        ? "stale"
        : "none";
  const fixtureBattlePort = new FixtureBattlePort(
    fixtureBattleState(fixtureQuestsFor(state.variant)),
    { failure: battleFailure },
  );
  const battlePort = runtime?.battlePort ?? fixtureBattlePort;
  let battleSession: BattleSession | null = runtime?.battleSession ?? (state.variant === "empty" || state.variant === "loading"
    ? null
    : fixtureBattlePort.session());

  const connectionFailure: ConnectionFailure = state.variant === "permission"
    ? "permission"
    : state.variant === "offline" || state.variant === "error"
      ? "network"
      : state.variant === "conflict"
        ? "conflict"
        : "none";
  const connectionsPort = runtime?.connectionsPort ?? new FixtureConnectionsPort(connectionFailure);

  const screenQuests = () => production ? sharedQuests : fixtureQuestsFor(state.variant);
  const screenAgents = () => runtime?.agents ?? fixtureAgentsFor(state.variant);
  const screenIntegrations = () => runtime?.integrations ?? fixtureIntegrationsFor(state.variant);
  const screenMembers = () => runtime?.members ?? fixturePartyMembersFor(state.variant);
  const screenPartyName = () => runtime?.partyName ?? fixturePartyNameFor(state.variant);
  const screenNotices = (label: string, retry: () => void) => production ? [] : noticesFor(state.variant, label, retry);
  const screenWriteHeld = () => production ? state.stale : writeHeldFor(state.variant);
  const screenNow = () => production ? Date.now() : FIXTURE_NOW;
  const screenToday = () => production ? new Date().toISOString().slice(0, 10) : FIXTURE_TODAY;

  const rail = el("nav", { class: "rf-rail", "aria-label": "Guilduo domains" });
  const operationBar = el("header", { class: "rf-operation-bar" });
  operationBar.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest(".rf-create, .rf-create-more") : null;
    if (target !== null) openCreate();
  });
  const bandRegion = el("div", { class: "rf-band-region" });
  const shelfRegion = el("div", { class: "rf-shelf-region" });
  const workfield = el("main", { class: "rf-workfield", id: "rf-workfield" });
  const chronicleRegion = el("div", { class: "rf-chronicle-region" });
  const lensRegion = el("div", { class: "rf-lens-region" });
  /* Below 1600 the Lens is an overlay (section 12.1), so it needs a scrim to
   * read as one rather than as content clipped by a floating panel. */
  const lensScrim = el("div", { class: "rf-lens-scrim", "aria-hidden": "true" });
  lensScrim.addEventListener("click", () => closeLens());
  /* Mobile owns its own composition: the same state, re-ordered down the page
   * with the decision hoisted out of the Lens into a fixed bar (brief B2). */
  const mobileRegion = el("div", { class: "rf-m-region" });
  const mobileDecision = el("div", { class: "rf-m-decision-region" });
  const sheetHost = el("div", { class: "rf-sheet-host" });
  const liveRegion = el("p", { class: "rf-visually-hidden", role: "status", "aria-live": "polite" });
  /* The host for every non-Command destination. Command never renders into it,
   * and it is emptied whenever Command is active, so no off-screen Command DOM
   * and no off-screen screen DOM can ever coexist in the accessibility tree. */
  const screenHost = el("div", { class: "rf-screen-host", id: "rf-screen-host" });
  const screenSticky = el("div", { class: "rf-screen-sticky" });

  function createField(label: string, control: HTMLElement, hint = ""): HTMLLabelElement {
    return el(
      "label",
      { class: "rf-create-field" },
      el("span", { class: "rf-create-label" }, label),
      control,
      hint === "" ? null : el("small", { class: "rf-create-hint" }, hint),
    );
  }

  const createTitle = el("input", {
    class: "rf-create-input",
    name: "title",
    type: "text",
    maxlength: "160",
    autocomplete: "off",
    required: true,
    placeholder: "何を完了させますか？",
  });
  const createNextAction = el("input", {
    class: "rf-create-input",
    name: "nextAction",
    type: "text",
    maxlength: "160",
    autocomplete: "off",
    placeholder: "次に実行する具体的な一手",
  });
  const createDue = el("input", { class: "rf-create-input", name: "dueDate", type: "date" });
  const createEstimate = el("input", {
    class: "rf-create-input",
    name: "estimatedMinutes",
    type: "number",
    min: "5",
    max: "1440",
    step: "5",
    value: "30",
    inputmode: "numeric",
  });
  const createAssignee = el("select", { class: "rf-create-input", name: "assignee" });
  createAssignee.append(el("option", { value: "self" }, runtime?.profile?.displayName || "自分"));
  for (const agent of runtime?.agents ?? []) {
    createAssignee.append(el("option", { value: agent.agentId }, `${agent.displayName} · Agent`));
  }
  const createError = el("p", { class: "rf-create-error", role: "alert", hidden: true });
  const createHeading = el("h2", { class: "rf-create-title", id: "rf-create-title" }, "Questを作成");
  const createKicker = el("p", { class: "rf-region-label" }, "NEW QUEST");
  const createSubmit = el("button", { type: "submit", class: "rf-primary-button rf-create-submit" }, "Questを作成");
  const createCancel = el("button", { type: "button", class: "rf-secondary-button" }, "キャンセル");
  const createClose = el(
    "button",
    { type: "button", class: "rf-icon-button rf-create-close", title: "閉じる" },
    el("span", { class: "rf-visually-hidden" }, "閉じる"),
    el("span", { class: "rf-close-mark", "aria-hidden": "true" }),
  );
  const createForm = el(
    "form",
    { class: "rf-create-form" },
    el(
      "header",
      { class: "rf-create-header" },
      el("div", null, createKicker, createHeading),
      createClose,
    ),
    el(
      "div",
      { class: "rf-create-body" },
      createField("Quest名", createTitle),
      createField("次の一手", createNextAction, "空欄でも作成できます"),
      el(
        "div",
        { class: "rf-create-pair" },
        createField("期限", createDue),
        createField("見積時間（分）", createEstimate),
      ),
      createField("担当", createAssignee, "登録済みAgentへ直接渡すこともできます"),
      createError,
    ),
    el("footer", { class: "rf-create-actions" }, createCancel, createSubmit),
  );
  const createDialog = el(
    "dialog",
    { class: "rf-create-dialog", "aria-labelledby": "rf-create-title" },
    createForm,
  );

  let editingQuestId: string | null = null;

  function closeCreate(): void {
    if (createDialog.open) createDialog.close();
  }

  function openCreate(): void {
    editingQuestId = null;
    createKicker.textContent = "NEW QUEST";
    createHeading.textContent = "Questを作成";
    createSubmit.textContent = "Questを作成";
    createError.hidden = true;
    createError.textContent = "";
    if (!createDialog.open) createDialog.showModal();
    queueMicrotask(() => createTitle.focus());
  }

  function openEdit(quest: Quest): void {
    editingQuestId = quest.id;
    createKicker.textContent = "EDIT QUEST";
    createHeading.textContent = "Questを編集";
    createSubmit.textContent = "変更を保存";
    createTitle.value = quest.title;
    createNextAction.value = quest.nextAction;
    createDue.value = quest.dueDate;
    createEstimate.value = String(quest.estimatedMinutes || 30);
    createAssignee.value = quest.assignee.type === "agent" ? quest.assignee.id : "self";
    createError.hidden = true;
    createError.textContent = "";
    if (!createDialog.open) createDialog.showModal();
    queueMicrotask(() => createTitle.focus());
  }

  createCancel.addEventListener("click", closeCreate);
  createClose.addEventListener("click", closeCreate);
  createDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeCreate();
  });
  createDialog.addEventListener("close", () => {
    createForm.reset();
    createEstimate.value = "30";
    editingQuestId = null;
    createError.hidden = true;
    queueMicrotask(() => shell.querySelector<HTMLElement>(".rf-create")?.focus());
  });
  createForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitCreate();
  });

  async function submitCreate(): Promise<void> {
    const title = createTitle.value.trim();
    if (title === "") {
      createError.textContent = "Quest名を入力してください。";
      createError.hidden = false;
      createTitle.focus();
      return;
    }
    if (runtime === null) {
      createError.textContent = "デモでは保存できません。Googleでサインインしてから作成してください。";
      createError.hidden = false;
      return;
    }

    const dueDate = createDue.value;
    const estimatedMinutes = Math.max(5, Math.min(1440, Number(createEstimate.value) || 30));
    const selectedAgent = runtime.agents.find((agent) => agent.agentId === createAssignee.value);
    const editing = editingQuestId !== null;
    const editedQuest = editingQuestId === null ? null : sharedQuests.find((quest) => quest.id === editingQuestId) ?? null;
    const assigneePatch = editing
      ? selectedAgent === undefined
        ? { type: "self" as const, id: runtime.selfUid, label: runtime.profile?.displayName || "自分", handoffState: "none" as const }
        : {
          type: "agent" as const,
          id: selectedAgent.agentId,
          label: selectedAgent.displayName,
          handoffState: editedQuest?.assignee.type === "agent"
            ? editedQuest.assignee.handoffState
            : selectedAgent.defaultHandoffState || "ready",
        }
      : selectedAgent === undefined ? null : {
        type: "agent" as const,
        id: selectedAgent.agentId,
        label: selectedAgent.displayName,
        handoffState: selectedAgent.defaultHandoffState || "ready",
      };
    createSubmit.disabled = true;
    createSubmit.textContent = "作成しています…";
    createError.hidden = true;

    try {
      const payload = {
        title,
        nextAction: createNextAction.value.trim(),
        estimatedMinutes,
        dueDate,
        scheduledDate: dueDate,
        planningMode: dueDate === "" ? "on_date" : "until_due",
        planningState: dueDate === "" ? "backlog" : "scheduled",
        ...(assigneePatch === null ? {} : { assignee: assigneePatch }),
      };
      const response = editingQuestId === null
        ? await runtime.questPort.createQuest({
          kind: "todo",
          notes: "",
          difficulty: "medium",
          lifecycleState: "active",
          impact: "medium",
          ...payload,
        })
        : await runtime.questPort.updateQuest(editingQuestId, payload);
      const value = response.quest;
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("作成結果にQuestが含まれていません。");
      }
      const created = value as Quest;
      if (typeof created.id !== "string" || created.id === "" || typeof created.title !== "string") {
        throw new Error("作成されたQuestの形式を確認できませんでした。");
      }

      sharedQuests = [created, ...sharedQuests.filter((quest) => quest.id !== created.id)];
      rawHandoffStates.set(created.id, created.assignee.handoffState);
      const normalized = normalizeCommandModel({
        profile: runtime.profile,
        agents: runtime.agents,
        quests: sharedQuests,
        syncLabel: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
      });
      state.model = { ...normalized, chronicle: state.model.chronicle };
      state.selectedQuestId = created.id;
      state.shelfUserScrolled = false;
      closeCreate();
      render();
      announce(editing ? `${created.title}を更新しました。` : `${created.title}を作成しました。`);
    } catch (error) {
      createError.textContent = error instanceof Error ? error.message : "Questを作成できませんでした。もう一度お試しください。";
      createError.hidden = false;
    } finally {
      createSubmit.disabled = false;
      createSubmit.textContent = editing ? "変更を保存" : "Questを作成";
    }
  }
  const shell = el(
    "div",
    { class: "rf-shell" },
    rail,
    operationBar,
    bandRegion,
    shelfRegion,
    workfield,
    chronicleRegion,
    lensScrim,
    lensRegion,
    mobileRegion,
    mobileDecision,
    screenHost,
    screenSticky,
    sheetHost,
    createDialog,
    liveRegion,
  );
  replaceChildren(root, shell);

  /* ---------------------------------------------------------------- *
   * Derivations from the single selection state (section 10)
   * ---------------------------------------------------------------- */

  function selectedQuest(): LoomQuest | null {
    if (state.selectedQuestId === null) return null;
    return state.model.quests.find((quest) => quest.id === state.selectedQuestId) ?? null;
  }


  function selectedRawQuest(): Quest | null {
    if (state.selectedQuestId === null) return null;
    return sharedQuests.find((quest) => quest.id === state.selectedQuestId) ?? null;
  }

  function selectedQuestActions() {
    return questActionState(selectedRawQuest());
  }

  function applyQuestRecord(quest: Quest): void {
    sharedQuests = sharedQuests.map((entry) => entry.id === quest.id ? quest : entry);
    rawHandoffStates.set(quest.id, quest.assignee.handoffState);
    if (runtime === null) return;
    const normalized = normalizeCommandModel({
      profile: runtime.profile,
      agents: runtime.agents,
      quests: sharedQuests,
      syncLabel: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
    });
    state.model = { ...normalized, chronicle: state.model.chronicle };
    if (!state.model.quests.some((entry) => entry.id === state.selectedQuestId)) {
      state.selectedQuestId = state.model.interventions[0]?.questId ?? state.model.quests[0]?.id ?? null;
    }
  }

  async function runQuestAction(action: QuestActionId): Promise<void> {
    const quest = selectedRawQuest();
    if (quest === null || runtime === null || state.taskSubmitting) return;
    if (action === "edit") { openEdit(quest); return; }
    if (action === "archive" && !window.confirm(`「${quest.title}」をアーカイブしますか？`)) return;

    const patch: Record<string, unknown> = action === "complete"
      ? { lifecycleState: "completed" }
      : action === "archive"
        ? { lifecycleState: "archived" }
        : {
          assignee: { ...quest.assignee, handoffState: action === "start" ? "working" : "none" },
          ...(action === "start" ? { handoff: { ...quest.handoff, startedAt: quest.handoff.startedAt || new Date().toISOString() } } : {}),
        };
    state.taskSubmitting = true;
    state.taskMessage = "";
    state.taskTone = null;
    render();
    try {
      const response = await runtime.questPort.updateQuest(quest.id, patch);
      const value = response.quest;
      if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("更新結果にQuestが含まれていません。");
      applyQuestRecord(value as Quest);
      state.taskTone = "success";
      state.taskMessage = action === "start" ? "Questを開始しました"
        : action === "stop" ? "Questを停止しました"
          : action === "complete" ? "Questを完了しました"
            : "Questをアーカイブしました";
      announce(state.taskMessage);
    } catch (error) {
      state.taskTone = "error";
      state.taskMessage = error instanceof Error ? error.message : "Questを更新できませんでした。";
      announce(state.taskMessage);
    } finally {
      state.taskSubmitting = false;
      render();
    }
  }
  /**
   * Every selectable Quest gets a workspace. Curated intervention views win;
   * anything else is derived from the Quest already on screen so the Loom is
   * never a dead end.
   */
  function selectedView(): SelectedQuestView | null {
    if (state.selectedQuestId === null) return null;
    const curated = state.model.selectedViews.get(state.selectedQuestId);
    if (curated !== undefined) return curated;
    const quest = selectedQuest();
    return quest === null ? null : deriveSelectedQuestView(quest);
  }

  function selectedIntervention(): Intervention | null {
    if (state.selectedQuestId === null) return null;
    return state.model.interventions.find((item) => item.questId === state.selectedQuestId) ?? null;
  }

  /** Chronicle context: events naming the selected Quest come first. */
  function chronicleForSelection() {
    const quest = selectedQuest();
    if (quest === null) return state.model.chronicle;
    const related = state.model.chronicle.filter((event) => event.object.includes(quest.ref));
    const rest = state.model.chronicle.filter((event) => !event.object.includes(quest.ref));
    return [...related, ...rest];
  }

  function select(questId: string, trigger: HTMLElement): void {
    state.selectedQuestId = questId;
    // Mobile has no Lens panel — the decision lives in the fixed bar — so
    // selection must not open one behind the page.
    if (state.lensState === "closed" && !isMobile()) state.lensState = "open";
    state.lensTrigger = trigger;
    // A3: a new Quest starts at the top of its workspace. Without this the
    // previous Quest's scroll offset would carry over and clip the new title.
    state.previewArtifactId = null;
    state.shelfUserScrolled = false;
    keepScroll = false;
    render();
    keepScroll = true;
    // Selection moves focus back to the equivalent control in the new tree so
    // keyboard users are not dropped at the document root.
    const restored = shell.querySelector<HTMLElement>(`[data-quest-id="${questId}"]`);
    restored?.focus({ preventScroll: true });
  }

  function closeQuestFlow(): void {
    questFlowSheet?.release();
    questFlowSheet = null;
    state.questFlowOpen = false;
    replaceChildren(sheetHost);
  }

  /** Opens the Quest Loom as a modal sheet (brief B3). */
  function openQuestFlow(trigger: HTMLElement): void {
    if (questFlowSheet !== null) return;
    state.questFlowOpen = true;
    const sheet = bottomSheet(
      {
        title: "Quest flow",
        // Re-resolved on close: selecting inside the sheet re-renders the page
        // and replaces the button this was opened from.
        returnFocusTo: () => shell.querySelector<HTMLElement>(".rf-m-questflow") ?? trigger,
        onClose: () => {
          questFlowSheet = null;
          state.questFlowOpen = false;
          replaceChildren(sheetHost);
        },
      },
      buildLoom(true),
    );
    questFlowSheet = sheet;
    replaceChildren(sheetHost, sheet.element);
  }

  /** Gate inputs shared by the Lens and the mobile bar. */
  function decisionGate() {
    return {
      evidenceReviewed: isMobile() ? state.mobileEvidenceOpen : state.previewArtifactId !== null,
      writeLocked: state.stale,
      permissionMissing: forcedState === "permission"
        ? "handoff:write スコープが不足しています。Connections で権限を追加してください。"
        : null,
      conflict: forcedState === "conflict"
        ? "他の Actor が先に状態を更新しました。最新の内容を確認してから再実行してください。"
        : null,
    };
  }

  /** Verification summary, derived only from a real Evidence result. */
  function verificationSummary(): string | null {
    const view = selectedView();
    if (view === null) return null;
    const primary = view.evidence.find((artifact) => artifact.primary);
    if (primary === undefined || primary.verified !== true) return null;
    const preview = primary.preview;
    return preview === undefined || preview.verdict !== "pass"
      ? `Evidence verified · ${primary.name}`
      : `Evidence verified · ${preview.verdictLabel}`;
  }

  /** Current handoff state of the selected Quest, read from the raw record. */
  function expectedStateFor(questId: string) {
    return rawHandoffStates.get(questId) ?? "review_required";
  }

  async function runDecision(kind: DecisionKind): Promise<void> {
    const questId = state.selectedQuestId;
    if (questId === null) return;
    state.revisionError = null;
    const result = await submitDecision(
      handoffPort,
      { kind, questId, expectedState: expectedStateFor(questId), reason: state.revisionReason },
      decisionGate(),
      state.decision.phase,
      (next) => {
        state.decision = next;
        if (next.code === "reason_required") state.revisionError = next.message;
        render();
      },
    );
    if (result.phase === "succeeded" && result.quest !== null) {
      applyHandoffResult(result, kind);
    }
    render();
    announce(result.message);
    // Focus returns to the control that started the decision.
    const target = state.revisionOpen
      ? shell.querySelector<HTMLElement>(".rf-revision-submit")
      : shell.querySelector<HTMLElement>(".rf-decision-approve");
    target?.focus();
  }

  /**
   * Applies the Quest the server returned. Relay, Lens, Chronicle and the
   * Capacity Band all re-derive from this one update; nothing is written
   * optimistically before the result arrives.
   */
  function applyHandoffResult(result: DecisionResult, kind: DecisionKind): void {
    const quest = result.quest;
    if (quest === null) return;
    rawHandoffStates.set(quest.id, quest.assignee.handoffState);
    sharedQuests = sharedQuests.map((entry) => entry.id === quest.id ? quest : entry);
    const updated = state.model.quests.map((row) => row.id !== quest.id ? row : {
      ...row,
      state: kind === "approve" ? "completed" as const : "working" as const,
      stateLabel: kind === "approve" ? "Hironao accepted the output" : "Forge Runner is executing",
      needsIntervention: false,
    });
    const chronicle = [
      {
        id: `ev-${quest.id}-${result.code}`,
        timeLabel: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
        actorId: "u-hironao",
        kind: kind === "approve" ? "review_result" as const : "handoff" as const,
        verb: kind === "approve" ? "accepted" : "requested revision on",
        object: `${quest.id.replace("q-", "QF-")} ${quest.title}`,
        detail: kind === "approve" ? "handoff accepted" : state.revisionReason.trim().slice(0, 60),
      },
      ...state.model.chronicle,
    ];
    const remaining = state.model.interventions.filter((item) => item.questId !== quest.id);
    const capacity = state.model.capacity.map((slot) => slot.id !== "attention" ? slot : {
      ...slot,
      value: `${remaining.filter((item) => item.severity === "review").length} review · ${remaining.filter((item) => item.severity === "waiting").length} waiting`,
    });
    /* The curated intervention view described the pre-decision state, so it is
     * dropped: `selectedView()` then derives the workspace from the Quest the
     * server just returned, keeping centre, Relay, Lens and Chronicle in
     * agreement instead of leaving a stale "review required" behind. */
    const selectedViews = new Map(state.model.selectedViews);
    selectedViews.delete(quest.id);
    state.model = { ...state.model, quests: updated, chronicle, interventions: remaining, capacity, selectedViews };
    state.revisionOpen = false;
    state.revisionReason = "";
    state.previewArtifactId = null;
    state.mobileEvidenceOpen = false;
  }

  /** Polite announcement for decision results (section 13 accessibility). */
  function announce(message: string): void {
    if (message === "") return;
    liveRegion.textContent = "";
    window.setTimeout(() => { liveRegion.textContent = message; }, 30);
  }

  /** Moves focus to the Lens revision control without running a second command. */
  function focusRevision(): void {
    if (state.lensState === "closed") state.lensState = "open";
    state.revisionOpen = true;
    state.decision = IDLE_DECISION;
    render();
    const field = lensRegion.querySelector<HTMLElement>(".rf-revision-input");
    field?.focus();
    field?.scrollIntoView({ block: "nearest" });
  }

  function closeLens(): void {
    state.lensState = "closed";
    const trigger = state.lensTrigger;
    render();
    trigger?.focus();
  }

  /* ---------------------------------------------------------------- *
   * Region renderers
   * ---------------------------------------------------------------- */

  function renderRail(): void {
    replaceChildren(
      rail,
      el(
        "div",
        { class: "rf-rail-top" },
        el("span", { class: "rf-mark", "aria-hidden": "true" }, "GD"),
        el(
          "span",
          { class: "rf-rail-workspace" },
          el("b", null, "Guilduo"),
          el("small", null, "Relay Forge"),
        ),
      ),
      el(
        "ul",
        { class: "rf-rail-domains" },
        ...DOMAINS.filter((domain) => !isMobile() || domain.primaryOnMobile).map((domain) => {
          const selected = state.domain === domain.id;
          const button = el(
            "button",
            {
              type: "button",
              class: "rf-nav-item",
              "data-selected": selected ? "true" : "false",
              "aria-current": selected ? "page" : null,
              title: `${domain.label} (G then ${domain.mnemonic})`,
              disabled: domain.migrated ? null : true,
            },
            el("span", { class: "rf-nav-glyph", "data-domain": domain.id, "aria-hidden": "true" }),
            el("span", { class: "rf-nav-label" }, domain.label),
            domain.id === "command"
              ? el("span", { class: "rf-nav-attention" }, String(state.model.interventions.length))
              : null,
            domain.migrated ? null : el("span", { class: "rf-visually-hidden" }, "未移行"),
          );
          if (domain.migrated) {
            button.addEventListener("click", () => {
              state.domain = domain.id;
              render();
            });
          }
          return el("li", null, button);
        }),
        isMobile()
          ? el(
            "li",
            null,
            (() => {
              /* When the active destination lives behind `More`, the More
               * entry is the bar's representation of it, so it carries
               * `aria-current` and the selected treatment — otherwise the bar
               * would announce no current page at all on Battle and
               * Connections. */
              const overflowActive = MOBILE_OVERFLOW.some((domain) => domain.id === state.domain);
              const more = el(
                "button",
                {
                  type: "button",
                  class: "rf-nav-item rf-nav-more",
                  "aria-haspopup": "true",
                  "aria-expanded": state.moreOpen ? "true" : "false",
                  "aria-current": overflowActive ? "page" : null,
                  "data-selected": overflowActive ? "true" : "false",
                  title: MOBILE_OVERFLOW.map((domain) => domain.label).join(" / "),
                },
                el("span", { class: "rf-nav-glyph", "data-domain": "more", "aria-hidden": "true" }),
                el("span", { class: "rf-nav-label" }, "More"),
              );
              more.addEventListener("click", () => {
                state.moreOpen = !state.moreOpen;
                render();
              });
              return more;
            })(),
          )
          : null,
      ),
      isMobile() && state.moreOpen
        ? el(
          "ul",
          { class: "rf-nav-more-panel", "aria-label": "More destinations" },
          ...MOBILE_OVERFLOW.map((domain) => {
            const selected = state.domain === domain.id;
            const button = el(
              "button",
              {
                type: "button",
                class: "rf-nav-item",
                "data-selected": selected ? "true" : "false",
                "aria-current": selected ? "page" : null,
              },
              el("span", { class: "rf-nav-glyph", "data-domain": domain.id, "aria-hidden": "true" }),
              el("span", { class: "rf-nav-label" }, domain.label),
            );
            button.addEventListener("click", () => {
              state.domain = domain.id;
              state.moreOpen = false;
              render();
            });
            return el("li", null, button);
          }),
        )
        : null,
      el(
        "div",
        { class: "rf-rail-bottom" },
        (() => {
          const toggle = el(
            "button",
            { type: "button", class: "rf-rail-utility", title: "Theme" },
            el("span", { class: "rf-nav-label" }, "Theme"),
            el(
              "span",
              { class: "rf-theme-switch", "data-theme-mode": state.theme },
              el("span", { class: "rf-theme-glyph", "data-mode": "dark", "aria-hidden": "true" }),
              el("span", { class: "rf-theme-glyph", "data-mode": "light", "aria-hidden": "true" }),
            ),
          );
          toggle.addEventListener("click", () => {
            state.theme = state.theme === "dark" ? "light" : state.theme === "light" ? "system" : "dark";
            storeTheme(state.theme);
            resolveTheme(state.theme);
            render();
          });
          return toggle;
        })(),
        (() => {
          const collapse = el(
            "button",
            { type: "button", class: "rf-rail-utility", title: "Collapse rail" },
            el("span", { class: "rf-nav-label" }, "Collapse"),
            el("kbd", { class: "rf-kbd" }, "⌘K"),
            el("span", { class: "rf-collapse-mark", "aria-hidden": "true" }),
          );
          collapse.addEventListener("click", () => {
            state.railCollapsed = !state.railCollapsed;
            render();
          });
          return collapse;
        })(),
      ),
    );
  }

  function renderOperationBar(): void {
    const search = el(
      "button",
      { type: "button", class: "rf-search-trigger", title: "Search and commands" },
      el("span", { class: "rf-search-glyph", "aria-hidden": "true" }),
      el("span", { class: "rf-search-copy" }, "Quest, Actor, Connection を検索"),
      el("kbd", { class: "rf-kbd" }, "⌘K"),
    );
    replaceChildren(
      operationBar,
      el(
        "div",
        { class: "rf-operation-left" },
        el("h1", { class: "rf-page-title" }, domainLabel(state.domain)),
      ),
      el("div", { class: "rf-operation-center" }, search),
      el(
        "div",
        { class: "rf-operation-right" },
        el(
          "span",
          { class: "rf-create-group" },
          el("button", { type: "button", class: "rf-primary-button rf-create" }, "Create"),
          el(
            "button",
            { type: "button", class: "rf-primary-button rf-create-more", title: "Create options" },
            el("span", { class: "rf-visually-hidden" }, "Create options"),
            el("span", { class: "rf-caret-mark", "aria-hidden": "true" }),
          ),
        ),
        el(
          "button",
          { type: "button", class: "rf-quiet-button rf-alerts", title: "Notifications" },
          el("span", { class: "rf-bell-mark", "aria-hidden": "true" }),
          `Alerts ${state.model.interventions.length}`,
        ),
        el(
          "span",
          { class: "rf-identity", title: "Hironao" },
          el("span", { class: "rf-identity-initials" }, "HN"),
        ),
      ),
    );
  }

  function renderBand(): void {
    const slots = state.stale ? fixtureCapacityStale : fixtureCapacity;
    replaceChildren(
      bandRegion,
      capacityBand(slots, {
        expandHealth: state.stale,
        onSelect: (slot: CapacitySlot) => {
          if (slot.filter === "health") {
            state.stale = !state.stale;
            render();
            return;
          }
          const match = state.model.interventions.find((item) => item.severity === slot.filter);
          if (match !== undefined) {
            const trigger = bandRegion.querySelector<HTMLElement>(`[data-slot="${slot.id}"]`);
            state.selectedQuestId = match.questId;
            state.lensTrigger = trigger;
            render();
          }
        },
      }),
    );
  }

  function renderShelf(): void {
    replaceChildren(
      shelfRegion,
      attentionShelf(state.model.interventions, state.model.actors, {
        selectedQuestId: state.selectedQuestId,
        onSelect: select,
      }),
    );
  }

  /**
   * `keepScroll` is false whenever the selected Quest changed, so the new
   * workspace opens at its header instead of inheriting an offset (A3).
   */
  let keepScroll = false;

  function buildLoom(inSheet: boolean): HTMLElement {
    return questLoom(state.model.quests, {
      actors: state.model.actors,
      selectedQuestId: state.selectedQuestId,
      onSelect: (questId, trigger) => {
        select(questId, trigger);
        // Selecting from the sheet returns to the Selected Quest (brief B3).
        if (inSheet) closeQuestFlow();
      },
      collapsed: inSheet ? false : state.loomCollapsed,
      onToggleCollapse: () => {
        state.loomCollapsed = !state.loomCollapsed;
        render();
      },
    });
  }

  function renderWorkfield(): void {
    const loom = buildLoom(false);

    const view = selectedView();
    const centre = view === null
      ? el(
        "section",
        { class: "rf-selected rf-selected--empty" },
        el(
          "div",
          { class: "rf-state rf-state--empty", role: "status" },
          el("p", { class: "rf-state-title" }, "判断対象の Quest を選んでください"),
          el("p", { class: "rf-state-body" }, "Attention Shelf または Quest Loom から Quest を選ぶと、Relay と Evidence がここに開きます。"),
        ),
      )
      : selectedQuestWorkspace(view, state.model.actors, {
        writeLocked: state.stale,
        previewArtifactId: state.previewArtifactId,
        /* Evidence inspection only. The final decision lives in the Lens
         * Decision Bar (v2 section 7.4), so these never share a command. */
        onReviewOutput: (artifactId) => {
          state.previewArtifactId = artifactId;
          render();
          // Bring the whole preview into view, then take focus without letting
          // the focus call scroll it again.
          const preview = workfield.querySelector<HTMLElement>(".rf-preview");
          preview?.scrollIntoView({ block: "start", behavior: "auto" });
          workfield.querySelector<HTMLElement>(".rf-preview-close")?.focus({ preventScroll: true });
        },
        onClosePreview: () => {
          state.previewArtifactId = null;
          render();
          workfield.querySelector<HTMLElement>(".rf-review-button")?.focus();
        },
        onRequestRevision: focusRevision,
        questActions: selectedQuestActions(),
        onQuestAction: (action) => { void runQuestAction(action); },
      });

    // A3: the workspace scroll offset belongs to the current Quest only.
    const previousScroll = workfield.querySelector(".rf-selected-scroll")?.scrollTop ?? 0;
    replaceChildren(workfield, el("div", { class: "rf-panes" }, loom, centre));
    const scroller = workfield.querySelector<HTMLElement>(".rf-selected-scroll");
    if (scroller !== null && keepScroll) scroller.scrollTop = previousScroll;
  }

  function renderChronicle(): void {
    replaceChildren(
      chronicleRegion,
      chronicleStrip(chronicleForSelection(), state.model.actors, {
        newCount: 5,
        expanded: state.chronicleExpanded,
        onToggle: () => {
          state.chronicleExpanded = !state.chronicleExpanded;
          render();
        },
      }),
      state.chronicleExpanded
        ? el(
          "div",
          { class: "rf-chronicle-expanded" },
          executionChronicle(chronicleForSelection(), state.model.actors),
        )
        : null,
    );
  }

  function renderLens(): void {
    const view = selectedView();
    const content = view === null ? null : { intervention: selectedIntervention(), view };
    replaceChildren(
      lensRegion,
      interventionLens(state.lensState === "closed" ? null : content, state.model.actors, {
        state: state.lensState,
        writeLocked: state.stale,
        blockedReason: blockingReason(decisionGate(), state.decision.phase),
        submitting: selectedQuestActions().mode === "handoff-decision" ? state.decision.phase === "submitting" : state.taskSubmitting,
        verification: verificationSummary(),
        revisionOpen: state.revisionOpen,
        revisionReason: state.revisionReason,
        revisionError: state.revisionError,
        resultTone: selectedQuestActions().mode === "handoff-decision"
          ? (state.decision.phase === "succeeded" ? "success"
            : state.decision.phase === "failed" && state.decision.code !== "blocked" ? "error" : null)
          : state.taskTone,
        resultMessage: selectedQuestActions().mode === "handoff-decision" ? state.decision.message : state.taskMessage,
        onClose: closeLens,
        onTogglePin: () => {
          state.lensState = state.lensState === "pinned" ? "open" : "pinned";
          render();
        },
        onApprove: () => { void runDecision("approve"); },
        onOpenRevision: () => {
          state.revisionOpen = true;
          state.decision = IDLE_DECISION;
          render();
          lensRegion.querySelector<HTMLElement>(".rf-revision-input")?.focus();
        },
        onCancelRevision: () => {
          state.revisionOpen = false;
          state.revisionReason = "";
          state.revisionError = null;
          render();
          lensRegion.querySelector<HTMLElement>(".rf-decision-approve")?.focus();
        },
        onRevisionInput: (value: string) => { state.revisionReason = value; },
        onSubmitRevision: () => { void runDecision("revise"); },
        questActions: selectedQuestActions(),
        onQuestAction: (action) => { void runQuestAction(action); },
      }),
    );
  }

  function mobileState() {
    return {
      model: state.model,
      selectedQuestId: state.selectedQuestId,
      view: selectedView(),
      intervention: selectedIntervention(),
      questActions: selectedQuestActions(),
      evidenceOpen: state.mobileEvidenceOpen,
      supportingOpen: state.mobileSupportingOpen,
      chronicleOpen: state.mobileChronicleOpen,
      writeLocked: state.stale,
      blockedReason: blockingReason(decisionGate(), state.decision.phase),
      verification: verificationSummary(),
      revisionOpen: state.revisionOpen,
      revisionReason: state.revisionReason,
      revisionError: state.revisionError,
      resultTone: selectedQuestActions().mode === "handoff-decision"
        ? (state.decision.phase === "succeeded" ? "success" as const
        : state.decision.phase === "failed" && state.decision.code !== "blocked" ? "error" as const
        : null)
        : state.taskTone,
      resultMessage: selectedQuestActions().mode === "handoff-decision" ? state.decision.message : state.taskMessage,
      submitting: selectedQuestActions().mode === "handoff-decision" ? state.decision.phase === "submitting" : state.taskSubmitting,
      permissionMissing: forcedState === "permission"
        ? "handoff:write スコープが不足しています。Connections で権限を追加してください。"
        : null,
      conflict: forcedState === "conflict"
        ? "他の Actor が 10:58 に状態を更新しました。最新の内容を確認してから再実行してください。"
        : null,
      loading: forcedState === "loading",
    };
  }

  /**
   * Keeps the Attention Shelf aligned with the selection (brief 1.2).
   *
   * The card for `selectedQuestId` is brought fully into view on first paint and
   * whenever the selection changes. Once the user has scrolled the track
   * themselves, the position is left alone — only an explicit selection change
   * moves it again. Reduced Motion gets an instant jump.
   */
  function syncShelfPosition(): void {
    const track = mobileRegion.querySelector<HTMLElement>(".rf-m-shelf-track");
    if (track === null || state.selectedQuestId === null) return;
    if (!track.dataset.scrollBound) {
      track.dataset.scrollBound = "true";
      track.addEventListener("scroll", () => { state.shelfUserScrolled = true; }, { passive: true });
    }
    if (state.shelfUserScrolled && state.selectedQuestId === shelfAlignedTo) return;
    const card = track.querySelector<HTMLElement>(`.rf-m-shelf-card[data-quest-id="${state.selectedQuestId}"]`);
    if (card === null) return;
    const trackBox = track.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const fullyVisible = cardBox.left >= trackBox.left - 0.5 && cardBox.right <= trackBox.right + 0.5;
    if (!fullyVisible) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      track.scrollTo({
        left: track.scrollLeft + (cardBox.left - trackBox.left),
        behavior: reduce ? "auto" : "smooth",
      });
    }
    shelfAlignedTo = state.selectedQuestId;
    state.shelfUserScrolled = false;
  }

  function renderMobile(): void {
    if (!isMobile()) {
      replaceChildren(mobileRegion);
      replaceChildren(mobileDecision);
      return;
    }
    const snapshot = mobileState();
    const callbacks = {
      onSelect: select,
      onOpenQuestFlow: openQuestFlow,
      onToggleEvidence: () => {
        state.mobileEvidenceOpen = !state.mobileEvidenceOpen;
        render();
      },
      onToggleSupporting: () => {
        state.mobileSupportingOpen = !state.mobileSupportingOpen;
        render();
      },
      onToggleChronicle: () => {
        state.mobileChronicleOpen = !state.mobileChronicleOpen;
        render();
      },
      onApprove: () => { void runDecision("approve"); },
      onRequestRevision: () => {
        state.revisionOpen = true;
        state.decision = IDLE_DECISION;
        render();
        mobileDecision.querySelector<HTMLElement>(".rf-revision-input")?.focus();
      },
      onRevisionInput: (value: string) => { state.revisionReason = value; },
      onSubmitRevision: () => { void runDecision("revise"); },
      onQuestAction: (action: QuestActionId) => { void runQuestAction(action); },
      onCancelRevision: () => {
        state.revisionOpen = false;
        state.revisionReason = "";
        state.revisionError = null;
        render();
      },
    };
    replaceChildren(mobileRegion, mobileCommand(snapshot, callbacks));
    replaceChildren(mobileDecision, mobileDecisionBar(snapshot.view, snapshot, callbacks));
    // Measure after layout: a re-render resets the track's scroll offset, so the
    // alignment has to be re-applied once the new DOM has been laid out.
    window.requestAnimationFrame(() => syncShelfPosition());
  }

  /* ---------------------------------------------------------------- *
   * Screens
   * ---------------------------------------------------------------- */

  /**
   * The one context every screen receives. Screens cannot touch shell state
   * directly; they ask through these callbacks, which is what keeps a single
   * selection and a single identity map across six destinations.
   */
  function screenContext(): ScreenContext {
    return {
      actors: state.model.actors,
      isMobile: isMobile(),
      writeLocked: state.stale || writeHeldFor(state.variant),
      onSelectQuest: (questId: string) => {
        state.selectedQuestId = questId;
        render();
      },
      onNavigate: (domain: string, questId?: string) => {
        const target = DOMAINS.find((entry) => entry.id === domain);
        if (target === undefined) return;
        if (questId !== undefined) {
          /* Command works from the intervention queue, which is a subset of the
           * portfolio. Handing it a Quest it does not hold would blank its
           * workspace with no explanation, so the previous selection is kept
           * and the reason is announced instead of silently losing context. */
          const known = target.id !== "command" || state.model.quests.some((quest) => quest.id === questId);
          if (known) state.selectedQuestId = questId;
          else {
            liveRegion.textContent = "この Quest は現在の介入キューにないため、Command の選択は変更していません。";
          }
        }
        state.domain = target.id;
        state.moreOpen = false;
        render();
        // Focus lands on the destination, not back at the rail.
        window.requestAnimationFrame(() => {
          screenHost.querySelector<HTMLElement>("h1")?.focus();
        });
      },
      announce: (message: string) => {
        liveRegion.textContent = message;
      },
      rerender: render,
    };
  }

  function renderScreen(): ScreenRender | null {
    const context = screenContext();
    const retry = () => {
      state.variant = "default";
      render();
    };
    if (state.domain === "quests") {
      const model = normalizeQuestsModel({
        quests: screenQuests(),
        selfUid: runtime?.selfUid ?? "hironao",
        notices: screenNotices("Quest", retry),
        writeHeld: screenWriteHeld(),
        now: screenNow(),
        today: screenToday(),
      });
      const callbacks = {
        onCreate: openCreate,
        onEdit: (questId: string) => {
          const quest = sharedQuests.find((entry) => entry.id === questId);
          if (quest !== undefined) openEdit(quest);
        },
        onSendToCommand: (questId: string) => context.onNavigate("command", questId),
        onInspectNetwork: (questId: string) => context.onNavigate("network", questId),
      };
      return isMobile()
        ? renderQuestsMobile(model, state.screens.quests, context, callbacks, state.selectedQuestId)
        : renderQuestsDesktop(model, state.screens.quests, context, callbacks, state.selectedQuestId);
    }
    if (state.domain === "network") {
      const networkQuests = screenQuests();
      const model = normalizeNetworkModel({
        quests: networkQuests,
        actors: state.model.actors,
        /* Connection edges come from `externalLinks[].service`, the same field
         * Connections reads, so the two screens can never disagree about which
         * Quests an integration touches. */
        connections: screenIntegrations().map((entry) => ({
          id: entry.id,
          name: entry.name,
          status: entry.status,
          questIds: networkQuests
            .filter((quest) => quest.externalLinks.some((link) => link.service === entry.id))
            .map((quest) => quest.id),
        })),
        selfUid: runtime?.selfUid ?? "hironao",
        notices: screenNotices("関係データ", retry),
      });
      return isMobile()
        ? renderNetworkMobile(model, state.screens.network, context, state.selectedQuestId)
        : renderNetworkDesktop(model, state.screens.network, context, state.selectedQuestId);
    }
    if (state.domain === "party") {
      const model = normalizePartyModel({
        quests: screenQuests(),
        actors: state.model.actors,
        members: screenMembers(),
        agents: screenAgents(),
        selfUid: runtime?.selfUid ?? "hironao",
        partyName: screenPartyName(),
        notices: screenNotices("パーティとAgent台帳", retry),
        unavailable: [{
          what: "メンバーの招待と離脱",
          why: "この画面からは接続していません（Party の書き込み操作は未接続です）",
        }],
        now: screenNow(),
      });
      return isMobile()
        ? renderPartyMobile(model, state.screens.party, context)
        : renderPartyDesktop(model, state.screens.party, context);
    }
    if (state.domain === "battle") {
      const model = normalizeBattleModel({
        session: battleSession,
        notices: screenNotices("戦闘の状態", retry),
        writeHeld: screenWriteHeld(),
        decisions: state.screens.battle.decisions,
      });
      const callbacks = {
        port: battlePort,
        onSession: (session: BattleSession) => { battleSession = session; },
      };
      return isMobile()
        ? renderBattleMobile(model, state.screens.battle, context, callbacks)
        : renderBattleDesktop(model, state.screens.battle, context, callbacks);
    }
    if (state.domain === "connections") {
      const quests = screenQuests();
      const model = normalizeConnectionsModel({
        integrations: screenIntegrations(),
        requiredScopes: REQUIRED_SCOPES,
        questLinks: quests.map((quest) => ({
          id: quest.id,
          title: quest.title,
          services: quest.externalLinks.map((link) => link.service),
        })),
        agents: screenAgents().map((agent) => ({
          agentId: agent.agentId,
          displayName: agent.displayName,
          allowedScopes: agent.allowedScopes ?? [],
        })),
        notices: screenNotices("連携", retry),
        writeHeld: screenWriteHeld(),
      });
      return isMobile()
        ? renderConnectionsMobile(model, state.screens.connections, context, connectionsPort)
        : renderConnectionsDesktop(model, state.screens.connections, context, connectionsPort);
    }
    return null;
  }

  function render(): void {
    shell.setAttribute("data-domain", state.domain);
    shell.setAttribute("data-mobile", isMobile() ? "true" : "false");
    shell.setAttribute("data-questflow", state.questFlowOpen ? "open" : "closed");
    shell.setAttribute("data-rail", state.railCollapsed ? "collapsed" : "expanded");
    shell.setAttribute("data-lens", state.lensState);
    shell.setAttribute("data-loom", state.loomCollapsed ? "collapsed" : "expanded");
    shell.setAttribute("data-stale", state.stale ? "true" : "false");
    shell.setAttribute("data-chronicle", state.chronicleExpanded ? "expanded" : "strip");
    renderRail();
    renderOperationBar();
    if (state.domain === "command") {
      replaceChildren(screenHost);
      replaceChildren(screenSticky);
      renderBand();
      renderShelf();
      renderWorkfield();
      renderChronicle();
      renderLens();
      renderMobile();
      return;
    }
    /* A non-Command destination owns the whole workfield. Every Command region
     * is emptied rather than hidden, so nothing Command-shaped survives in the
     * DOM, the tab order or a capture. */
    replaceChildren(bandRegion);
    replaceChildren(shelfRegion);
    replaceChildren(workfield);
    replaceChildren(chronicleRegion);
    replaceChildren(lensRegion);
    replaceChildren(mobileRegion);
    replaceChildren(mobileDecision);
    const screen = renderScreen();
    if (screen === null) {
      replaceChildren(screenHost);
      replaceChildren(screenSticky);
      return;
    }
    replaceChildren(screenHost, screen.main);
    if (screen.sticky === null || screen.sticky === undefined) replaceChildren(screenSticky);
    else replaceChildren(screenSticky, screen.sticky);
  }

  lensAsSheet.addEventListener("change", (event) => {
    state.lensState = event.matches ? "closed" : "open";
    if (!event.matches) closeQuestFlow();
    render();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    // A sheet owns Escape while it is open, and mobile has no Lens to close.
    if (state.questFlowOpen || isMobile()) return;
    if (state.lensState === "open" || state.lensState === "peek") {
      event.preventDefault();
      closeLens();
    }
  });

  render();
}

function domainLabel(id: DomainId): string {
  return DOMAINS.find((domain) => domain.id === id)?.label ?? "Command";
}

/**
 * `?state=` already selects a Command state; the same parameter selects the
 * screen fixture state so one capture run can drive all six destinations.
 * It only ever restricts what the UI will do — it never fabricates a success.
 */
function readVariant(): ScreenVariant {
  const requested = new URLSearchParams(window.location.search).get("state");
  return isScreenVariant(requested) ? requested : "default";
}

const THEME_KEY = "qf-relay-forge-theme";

/**
 * Theme initialization follows OS preference on first run; a saved choice wins.
 * `?theme=` is accepted so the capture set can be taken deterministically.
 */
function readStoredTheme(): ShellState["theme"] {
  const requested = new URLSearchParams(window.location.search).get("theme");
  if (requested === "light" || requested === "dark" || requested === "system") return requested;
  const stored = window.localStorage.getItem(THEME_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

function storeTheme(theme: ShellState["theme"]): void {
  window.localStorage.setItem(THEME_KEY, theme);
}

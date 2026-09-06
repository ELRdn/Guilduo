import { humanInbox } from "./human-inbox.ts";
import { relayText } from "./relay-copy.ts";
import { relaySuccess } from "./relay-motion.ts";
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
import { actorAvatar } from "./primitives/avatar.ts";
import { fixtureRawQuests } from "./fixtures.ts";
import { mobileCommand, mobileDecisionBar } from "./mobile.ts";
import { capacityBand } from "./primitives/capacity.ts";
import { chronicleStrip, executionChronicle } from "./primitives/chronicle.ts";
import { el, replaceChildren } from "./primitives/dom.ts";
import { createLifecycleGuard, runLifecycleStep } from "./primitives/lifecycle-guard.ts";
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
  type AgentRecord,
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
import { normalizeAgentConnections, normalizeAgentRecord, normalizeProfileRecord, type RelayForgeRuntime } from "./production.ts";
import { initialsFor, normalizeCommandModel, type ProfileRecord, resolveActors } from "./adapter.ts";
import { questActionState, type QuestActionId } from "./quest-actions.ts";
import {
  deriveMcpUrl,
  initialSettingsState,
  normalizeSettingsModel,
  renderSettingsDesktop,
  renderSettingsMobile,
  type ProfileDraft,
  type ProfileDraftField,
  type SettingsSection,
  type SettingsState,
} from "./screens/settings.ts";
import {
  FIXTURE_MCP_TOOLS,
  initialSkillsState,
  normalizeSkillsModel,
  renderSkillsDesktop,
  renderSkillsMobile,
  type SkillsState,
} from "./screens/skills.ts";
import { AvatarImageError, resizeAvatarImage } from "./primitives/image-resize.ts";
import { gatewayDefaultUrl } from "../repository.ts";
import { effectiveTheme, nextQuickToggleTheme, parseThemePreference, THEME_KEY, type ThemePreference } from "./theme.ts";

/**
 * Section 5.1 primary domains of NEWDESIGN.md.
 *
 * Command remains the visual reference; the other destinations are separate screens
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
  { id: "skills", label: "Skills", mnemonic: "S", migrated: true, primaryOnMobile: false },
] as const;

/**
 * At 390px the bar carries four primary destinations plus `More`, so every
 * label stays legible rather than being truncated to fit six (brief 1.1).
 * Battle, Connections and Skills move under `More`.
 */
const MOBILE_OVERFLOW = DOMAINS.filter((domain) => !domain.primaryOnMobile);

type DomainId = (typeof DOMAINS)[number]["id"];
/**
 * Settings is account-level chrome, not a Quest domain: it never joins
 * `DOMAINS` (the Forge Rail / Mobile primary bar), it is reached only from
 * the Rail's bottom utility area and the Mobile More panel.
 */
type NavId = DomainId | "settings";

interface ShellState {
  model: CommandModel;
  domain: NavId;
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
   * stays the single source of truth across all seven destinations, so a Quest
   * chosen in Quests is the Quest Command opens (section 10, extended).
   */
  screens: {
    quests: QuestsState;
    network: NetworkState;
    party: PartyState;
    battle: BattleScreenState;
    connections: ConnectionsState;
    skills: SkillsState;
    settings: SettingsState;
  };
  /** The forced fixture state, shared by every screen for the capture set. */
  variant: ScreenVariant;
  /** Popover state for the Operation Bar account menu (Phase 2). */
  accountMenuOpen: boolean;
  /** Section Settings should scroll/focus into view on its next render. */
  settingsFocusSection: SettingsSection | null;
}

function resolveTheme(preference: ShellState["theme"]): void {
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
}

const prefersDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");

/** Binds the DOM-free decision in `theme.ts` to the real OS media query. */
function currentEffectiveTheme(preference: ShellState["theme"]): "light" | "dark" {
  return effectiveTheme(preference, prefersDarkQuery.matches);
}

export function mountRelayForge(root: HTMLElement, runtime: RelayForgeRuntime | null = null): () => void {
  const production = runtime !== null;
  const initialModel = runtime?.model ?? createFixtureCommandModel();
  const initialQuestId = initialModel.interventions[0]?.questId ?? initialModel.quests[0]?.id ?? null;
  let sharedQuests = [...(runtime?.quests ?? fixtureQuestsFor(readVariant()))];
  let sharedAgents: AgentRecord[] = [...(runtime?.agents ?? fixtureAgentsFor(readVariant()))];
  /** Mutable so a saved Account avatar is reflected everywhere the profile is read. */
  let sharedProfile: ProfileRecord | null = runtime?.profile ?? null;
  let profileLoadError = runtime?.profileLoadError ?? null;
  let sharedAgentConnections = [...(runtime?.agentConnections ?? [])];
  let agentConnectionsLoadError = runtime?.agentConnectionsLoadError ?? null;
  let agentConnectionsLoading = false;
  let sharedMcpTools = [...(runtime?.mcpTools ?? [])];
  let mcpToolsLoadError = runtime?.mcpToolsLoadError ?? null;
  let mcpToolsLoading = false;

  /*
   * Agent avatar images. The server never hands out a usable URL — every
   * fetch is a Bearer-authenticated GET — so the shell owns a small cache of
   * Blob object URLs, keyed by namespace plus identity and version, so a new
   * upload (a version bump) never serves the stale image out of cache.
   */
  const avatarBlobUrls = new Map<string, string>();
  const avatarFetchInFlight = new Set<string>();
  const profileAvatarFetchInFlight = new Set<string>();
  let profilePreviewUrl: string | null = null;
  /**
   * Guards every avatar fetch this mount starts: `fetchAgentAvatar` is a
   * plain Bearer-authenticated network call with no way to cancel it, so a
   * fetch begun just before unmount can still resolve afterward. Every
   * continuation that would otherwise create a Blob URL, mutate
   * `sharedAgents`/`state`, or call `render()` checks `.disposed` first —
   * `unmountRelayForge` below calls `.dispose()` before doing anything else.
   */
  const lifecycle = createLifecycleGuard();

  function avatarCacheKey(agentId: string, version: number): string {
    return `agent:${agentId}:${version}`;
  }

  function profileAvatarCacheKey(version: number): string {
    return `profile:${runtime?.selfUid ?? "self"}:${version}`;
  }

  function clearProfileAvatarCache(keepKey: string | null = null): void {
    for (const [key, url] of avatarBlobUrls) {
      if (!key.startsWith("profile:") || key === keepKey) continue;
      URL.revokeObjectURL(url);
      avatarBlobUrls.delete(key);
    }
  }

  function syncProfileActors(): void {
    state.model = {
      ...state.model,
      actors: resolveActors(sharedProfile, sharedAgents, [...state.model.actors.values()]),
    };
  }

  /** Reattaches a cached Blob URL when one already exists for the Agent's current version. */
  function withCachedAvatar(agent: AgentRecord): AgentRecord {
    if (!agent.hasCustomAvatar) return agent;
    const cached = avatarBlobUrls.get(avatarCacheKey(agent.agentId, agent.avatarVersion ?? 0));
    return cached === undefined ? agent : { ...agent, avatarUrl: cached };
  }

  /**
   * Fetches and caches the image for every Agent that has a custom avatar but
   * no cached Blob for its current version yet. Runs in the background: it
   * never blocks the caller, and each fetch that lands rebuilds the actor map
   * and re-renders so the portrait appears in place once ready.
   */
  function refreshAgentAvatars(): void {
    if (runtime === null) return;
    for (const agent of sharedAgents) {
      if (!agent.hasCustomAvatar) continue;
      const version = agent.avatarVersion ?? 0;
      const key = avatarCacheKey(agent.agentId, version);
      if (avatarBlobUrls.has(key) || avatarFetchInFlight.has(key)) continue;
      avatarFetchInFlight.add(key);
      void runtime.agentAvatarPort.fetchAgentAvatar(agent.agentId, version)
        .then((blob) => {
          avatarFetchInFlight.delete(key);
          // The mount may have been torn down while this fetch was in
          // flight (sign-out, remount, the "デモを見る" fallback); a result
          // that lands after that must not resurrect a disposed Shell's
          // Blob URLs, shared state, or trigger a render against DOM this
          // mount no longer owns.
          if (lifecycle.disposed) return;
          // The Agent may have moved on to a newer version while this was in
          // flight; a superseded fetch is simply discarded.
          const current = sharedAgents.find((entry) => entry.agentId === agent.agentId);
          if (current === undefined || (current.avatarVersion ?? 0) !== version) return;
          const url = URL.createObjectURL(blob);
          if (lifecycle.disposed) {
            // Disposed between the check above and here (e.g. a synchronous
            // unmount triggered by a `.then` microtask ordered ahead of this
            // one) — release the URL immediately rather than caching one
            // nothing will ever revoke.
            URL.revokeObjectURL(url);
            return;
          }
          avatarBlobUrls.set(key, url);
          sharedAgents = sharedAgents.map((entry) => entry.agentId === agent.agentId ? { ...entry, avatarUrl: url } : entry);
          state.model = { ...state.model, actors: resolveActors(sharedProfile, sharedAgents, [...state.model.actors.values()]) };
          render();
        })
        .catch(() => {
          avatarFetchInFlight.delete(key);
        });
    }
  }

  /** Fetches the signed-in user's private profile image using the same
   * Bearer + exact-version contract as Agent avatars. */
  function refreshProfileAvatar(): void {
    if (runtime === null || sharedProfile === null || sharedProfile.hasCustomAvatar !== true) return;
    const version = sharedProfile.avatarVersion ?? 0;
    if (version < 1) return;
    const key = profileAvatarCacheKey(version);
    if (avatarBlobUrls.has(key) || profileAvatarFetchInFlight.has(key)) return;
    profileAvatarFetchInFlight.add(key);
    void runtime.profileAvatarPort.fetchProfileAvatar(version)
      .then((blob) => {
        profileAvatarFetchInFlight.delete(key);
        if (lifecycle.disposed) return;
        const current = sharedProfile;
        if (current === null || current.hasCustomAvatar !== true || (current.avatarVersion ?? 0) !== version) return;
        const url = URL.createObjectURL(blob);
        if (lifecycle.disposed) {
          URL.revokeObjectURL(url);
          return;
        }
        clearProfileAvatarCache(key);
        avatarBlobUrls.set(key, url);
        if (profilePreviewUrl !== null) {
          URL.revokeObjectURL(profilePreviewUrl);
          profilePreviewUrl = null;
        }
        sharedProfile = { ...current, avatarUrl: url };
        syncProfileActors();
        render();
      })
      .catch(() => {
        profileAvatarFetchInFlight.delete(key);
      });
  }

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
      skills: initialSkillsState(),
      settings: initialSettingsState(),
    },
    variant: readVariant(),
    accountMenuOpen: false,
    settingsFocusSection: null,
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
  const screenAgents = () => production ? sharedAgents : fixtureAgentsFor(state.variant);
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
  createAssignee.append(el("option", { value: "self" }, sharedProfile?.displayName || "自分"));
  for (const agent of sharedAgents) {
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
    if (quest.humanRequest) { inbox.open(undefined, quest.id); return; }
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
    const selectedAgent = sharedAgents.find((agent) => agent.agentId === createAssignee.value);
    const editing = editingQuestId !== null;
    const editedQuest = editingQuestId === null ? null : sharedQuests.find((quest) => quest.id === editingQuestId) ?? null;
    const assigneePatch = editing
      ? selectedAgent === undefined
        ? { type: "self" as const, id: runtime.selfUid, label: sharedProfile?.displayName || "自分", handoffState: "none" as const }
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
        profile: sharedProfile ?? { uid: runtime.selfUid, displayName: "あなた" },
        agents: sharedAgents,
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

  const agentIdInput = el("input", {
    class: "rf-create-input",
    name: "agentId",
    type: "text",
    maxlength: "80",
    autocomplete: "off",
    spellcheck: "false",
    placeholder: "forge-runner",
  });
  const agentNameInput = el("input", {
    class: "rf-create-input",
    name: "displayName",
    type: "text",
    maxlength: "40",
    autocomplete: "off",
    placeholder: "Forge Runner",
  });
  const agentProviderInput = el("input", {
    class: "rf-create-input",
    name: "provider",
    type: "text",
    maxlength: "40",
    autocomplete: "off",
    placeholder: "generic",
  });
  const agentRoleInput = el("input", {
    class: "rf-create-input",
    name: "role",
    type: "text",
    maxlength: "60",
    autocomplete: "off",
    placeholder: "Build and test executor",
  });
  const agentInstructionsInput = el("textarea", {
    class: "rf-create-input",
    name: "instructions",
    maxlength: "4000",
    rows: "5",
    placeholder: "このAgentに任せる役割と制約",
  });
  const agentHandoffInput = el(
    "select",
    { class: "rf-create-input", name: "defaultHandoffState" },
    el("option", { value: "ready" }, "Ready"),
    el("option", { value: "working" }, "Working"),
    el("option", { value: "review_required" }, "Review required"),
    el("option", { value: "blocked" }, "Blocked"),
    el("option", { value: "none" }, "None"),
    el("option", { value: "accepted" }, "Accepted"),
  );
  const agentStatusInput = el("select", { class: "rf-create-input", name: "status" },
    el("option", { value: "active" }, "Active"),
    el("option", { value: "disabled" }, "Disabled"));
  const agentScopeValues = [
    "quests:read", "quests:write", "character:read", "rewards:write", "integrations:read",
    "integrations:sync", "events:read", "profiles:read", "friends:read", "friends:write",
    "parties:read", "parties:write", "battle:read", "battle:write", "agents:read",
    "profiles:write", "webhooks:manage", "plugins:manage",
  ] as const;
  const agentScopesInput = el("select", {
    class: "rf-create-input", name: "allowedScopes", multiple: true, size: "6",
  }, ...agentScopeValues.map((scope) => el("option", { value: scope }, scope)));
  const agentReviewInput = el("input", { type: "checkbox", name: "reviewRequired", checked: true });
  const agentDryRunInput = el("input", { type: "checkbox", name: "dryRunDefault", checked: true });

  /* Avatar picker, shared by Party and Settings because this is the one Agent
   * Dialog (brief Phase 3, "PartyとSettingsで別々の保存処理を持たない"). The
   * image is resized client-side and held in memory until submit — it is
   * never uploaded ahead of the Agent existing, since the server derives the
   * R2 key from the owner UID and this Agent ID. */
  const agentAvatarInput = el("input", {
    type: "file",
    class: "rf-visually-hidden",
    accept: "image/png,image/jpeg,image/webp",
    id: "rf-agent-avatar-input",
  }) as HTMLInputElement;
  const agentAvatarImg = el("img", { class: "rf-agent-avatar-image", alt: "", hidden: true }) as HTMLImageElement;
  const agentAvatarFallback = el("span", { class: "rf-agent-avatar-fallback", "aria-hidden": "true" }, "?");
  agentAvatarImg.addEventListener("error", () => {
    agentAvatarImg.hidden = true;
    agentAvatarImg.removeAttribute("src");
    agentAvatarFallback.hidden = false;
  });
  const agentAvatarStatus = el("p", { class: "rf-agent-avatar-status", role: "status" });
  const agentAvatarField = el(
    "div",
    { class: "rf-agent-avatar-field" },
    el("span", { class: "rf-agent-avatar-preview" }, agentAvatarFallback, agentAvatarImg),
    el(
      "div",
      { class: "rf-agent-avatar-controls" },
      el("label", { for: "rf-agent-avatar-input", class: "rf-secondary-button" }, "画像を選択"),
      agentAvatarInput,
      agentAvatarStatus,
    ),
  );
  let pendingAgentAvatar: { readonly blob: Blob; readonly dataUrl: string } | null = null;
  agentAvatarInput.addEventListener("change", () => {
    const file = agentAvatarInput.files?.[0];
    agentAvatarInput.value = "";
    if (file === undefined) return;
    agentAvatarStatus.textContent = "画像を処理しています…";
    void resizeAvatarImage(file).then((resized) => {
      pendingAgentAvatar = { blob: resized.blob, dataUrl: resized.dataUrl };
      agentAvatarImg.src = resized.dataUrl;
      agentAvatarImg.hidden = false;
      agentAvatarFallback.hidden = true;
      agentAvatarStatus.textContent = "保存時にこの画像を反映します。";
    }).catch((error: unknown) => {
      agentAvatarStatus.textContent = error instanceof AvatarImageError ? error.message : "画像を読み込めませんでした。";
    });
  });

  const agentError = el("p", { class: "rf-create-error", role: "alert", hidden: true });
  const agentHeading = el("h2", { class: "rf-create-title", id: "rf-agent-title" }, "Agentを登録");
  const agentKicker = el("p", { class: "rf-region-label" }, "NEW AGENT");
  const agentSubmit = el("button", { type: "submit", class: "rf-primary-button rf-create-submit" }, "Agentを登録");
  const agentCancel = el("button", { type: "button", class: "rf-secondary-button" }, "キャンセル");
  const agentClose = el(
    "button",
    { type: "button", class: "rf-icon-button rf-create-close", title: "閉じる" },
    el("span", { class: "rf-visually-hidden" }, "閉じる"),
    el("span", { class: "rf-close-mark", "aria-hidden": "true" }),
  );
  const agentForm = el(
    "form",
    { class: "rf-create-form" },
    el(
      "header",
      { class: "rf-create-header" },
      el("div", null, agentKicker, agentHeading),
      agentClose,
    ),
    el(
      "div",
      { class: "rf-create-body" },
      createField("Agent ID", agentIdInput, "半角小文字・数字・ハイフン。登録後は変更できません"),
      createField("表示名", agentNameInput),
      agentAvatarField,
      el(
        "div",
        { class: "rf-create-pair" },
        createField("Provider", agentProviderInput),
        createField("Role", agentRoleInput),
      ),
      createField("指示", agentInstructionsInput, "秘密情報やAPIキーは入力しないでください"),
      createField("既定の受け渡し", agentHandoffInput),
      createField("Allowed Scopes", agentScopesInput, "Ctrl / Commandを押しながら複数選択できます"),
      createField("状態", agentStatusInput, "Disabledにすると既存のMCP接続は失効します"),
      el(
        "div",
        { class: "rf-create-pair" },
        createField("人間のレビューを必須にする", agentReviewInput),
        createField("既定でdry-runにする", agentDryRunInput),
      ),
      agentError,
    ),
    el("footer", { class: "rf-create-actions" }, agentCancel, agentSubmit),
  );
  const agentDialog = el(
    "dialog",
    { class: "rf-create-dialog", "aria-labelledby": "rf-agent-title" },
    agentForm,
  );
  let editingAgentId: string | null = null;
  let agentDialogReturnFocus: HTMLElement | null = null;

  function closeAgentDialog(): void {
    if (agentDialog.open) agentDialog.close();
  }

  function resetAgentDialog(): void {
    agentForm.reset();
    agentIdInput.disabled = false;
    agentReviewInput.checked = true;
    agentDryRunInput.checked = true;
    agentHandoffInput.value = "ready";
    agentStatusInput.value = "active";
    for (const option of agentScopesInput.options) option.selected = option.value === "quests:read";
    agentError.hidden = true;
    agentError.textContent = "";
    pendingAgentAvatar = null;
    agentAvatarImg.hidden = true;
    agentAvatarImg.removeAttribute("src");
    agentAvatarFallback.hidden = false;
    agentAvatarStatus.textContent = "";
  }

  function openCreateAgent(): void {
    if (runtime === null || state.stale) return;
    agentDialogReturnFocus = document.activeElement as HTMLElement | null;
    editingAgentId = null;
    resetAgentDialog();
    agentKicker.textContent = "NEW AGENT";
    agentHeading.textContent = "Agentを登録";
    agentSubmit.textContent = "Agentを登録";
    if (!agentDialog.open) agentDialog.showModal();
    queueMicrotask(() => agentIdInput.focus());
  }

  function openEditAgent(agentId: string): void {
    if (runtime === null || state.stale) return;
    const agent = sharedAgents.find((entry) => entry.agentId === agentId);
    if (agent === undefined) return;
    agentDialogReturnFocus = document.activeElement as HTMLElement | null;
    editingAgentId = agent.agentId;
    resetAgentDialog();
    agentKicker.textContent = "EDIT AGENT";
    agentHeading.textContent = "Agentを編集";
    agentSubmit.textContent = "変更を保存";
    agentIdInput.value = agent.agentId;
    agentIdInput.disabled = true;
    agentNameInput.value = agent.displayName;
    agentProviderInput.value = agent.provider ?? "";
    agentRoleInput.value = agent.role ?? "";
    agentInstructionsInput.value = agent.instructions ?? "";
    agentHandoffInput.value = agent.defaultHandoffState || "ready";
    agentStatusInput.value = agent.status === "disabled" ? "disabled" : "active";
    const selectedScopes = new Set(agent.allowedScopes ?? []);
    for (const option of agentScopesInput.options) option.selected = selectedScopes.has(option.value);
    agentReviewInput.checked = agent.reviewRequired !== false;
    agentDryRunInput.checked = agent.dryRunDefault !== false;
    if (agent.avatarUrl !== undefined && agent.avatarUrl !== "") {
      agentAvatarImg.src = agent.avatarUrl;
      agentAvatarImg.hidden = false;
      agentAvatarFallback.hidden = true;
    }
    if (!agentDialog.open) agentDialog.showModal();
    queueMicrotask(() => agentNameInput.focus());
  }

  function syncAgentAssigneeOptions(): void {
    const selected = createAssignee.value;
    replaceChildren(
      createAssignee,
      el("option", { value: "self" }, sharedProfile?.displayName || "自分"),
      ...sharedAgents
        .filter((agent) => agent.status !== "archived" && agent.status !== "disabled")
        .map((agent) => el("option", { value: agent.agentId }, `${agent.displayName} · Agent`)),
    );
    createAssignee.value = [...createAssignee.options].some((option) => option.value === selected) ? selected : "self";
  }

  agentCancel.addEventListener("click", closeAgentDialog);
  agentClose.addEventListener("click", closeAgentDialog);
  agentDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeAgentDialog();
  });
  agentDialog.addEventListener("close", () => {
    const returnFocus = agentDialogReturnFocus;
    resetAgentDialog();
    editingAgentId = null;
    agentDialogReturnFocus = null;
    queueMicrotask(() => returnFocus?.isConnected
      ? returnFocus.focus()
      : shell.querySelector<HTMLElement>(".rf-agent-create")?.focus());
  });
  agentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitAgent();
  });

  async function submitAgent(): Promise<void> {
    if (runtime === null) return;
    const agentId = agentIdInput.value.trim().toLowerCase();
    const displayName = agentNameInput.value.trim();
    if (editingAgentId === null && (agentId.length > 80 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(agentId))) {
      agentError.textContent = "Agent IDは半角小文字・数字・ハイフンのslugで入力してください。";
      agentError.hidden = false;
      agentIdInput.focus();
      return;
    }
    if (displayName === "") {
      agentError.textContent = "表示名を入力してください。";
      agentError.hidden = false;
      agentNameInput.focus();
      return;
    }
    const editing = editingAgentId !== null;
    const existing = editingAgentId === null ? null : sharedAgents.find((agent) => agent.agentId === editingAgentId) ?? null;
    agentSubmit.disabled = true;
    agentSubmit.textContent = editing ? "保存しています…" : "登録しています…";
    agentError.hidden = true;
    try {
      const values = {
        displayName,
        provider: agentProviderInput.value.trim() || "generic",
        role: agentRoleInput.value.trim() || "assistant",
        instructions: agentInstructionsInput.value.trim(),
        defaultHandoffState: agentHandoffInput.value,
        allowedScopes: [...agentScopesInput.selectedOptions].map((option) => option.value),
        reviewRequired: agentReviewInput.checked,
        dryRunDefault: agentDryRunInput.checked,
      };
      const response = editingAgentId === null
        ? await runtime.agentPort.createAgent({ agentId, ...values })
        : await runtime.agentPort.updateAgent(editingAgentId, {
          ...values,
          status: agentStatusInput.value,
          expectedUpdatedAt: existing?.updatedAt,
        });
      const normalizedSaved = normalizeAgentRecord(response.agent);
      if (normalizedSaved === null) throw new Error("保存結果にAgentが含まれていません。");
      let saved = withCachedAvatar(normalizedSaved);

      /* Metadata is already saved at this point. The avatar is a second,
       * independent write against the same conflict guard (`updatedAt`), so a
       * failure here must not roll back or hide the successful save — it
       * leaves the dialog open on the avatar step so the user can retry just
       * the image, instead of losing the Agent ID / role / scopes they just
       * entered (brief Phase 3, "古い編集画面から新しい画像を上書きしない"). */
      let avatarWarning: string | null = null;
      const previousAvatarKey = existing?.hasCustomAvatar === true
        ? avatarCacheKey(existing.agentId, existing.avatarVersion ?? 0)
        : null;
      if (pendingAgentAvatar !== null) {
        try {
          const avatarResponse = await runtime.agentAvatarPort.uploadAgentAvatar(saved.agentId, pendingAgentAvatar.blob, saved.updatedAt);
          const updated = normalizeAgentRecord(avatarResponse.agent);
          if (updated !== null) saved = updated;
          pendingAgentAvatar = null;
          // Refetch the image the server just stored — over the same
          // authenticated route every other viewer uses — instead of trusting
          // the client-resized preview, and cache it under the new version.
          try {
            const newKey = avatarCacheKey(saved.agentId, saved.avatarVersion ?? 0);
            const blob = await runtime.agentAvatarPort.fetchAgentAvatar(saved.agentId, saved.avatarVersion ?? 0);
            // The dialog's Save action can outlive the Shell it was opened
            // in (sign-out, remount, mid-flight demo fallback) — a result
            // landing after that must not populate a disposed mount's Blob
            // cache or shared state (see `refreshAgentAvatars` above for the
            // same guard on the background refresh path).
            if (lifecycle.disposed) return;
            const url = URL.createObjectURL(blob);
            avatarBlobUrls.set(newKey, url);
            saved = { ...saved, avatarUrl: url };
            if (previousAvatarKey !== null && previousAvatarKey !== newKey) {
              const staleUrl = avatarBlobUrls.get(previousAvatarKey);
              if (staleUrl !== undefined) {
                URL.revokeObjectURL(staleUrl);
                avatarBlobUrls.delete(previousAvatarKey);
              }
            }
          } catch {
            avatarWarning = "画像は保存されましたが、表示の更新に失敗しました。ページを再読み込みすると反映されます。";
          }
        } catch (avatarError) {
          const apiError = avatarError as { status?: number; code?: string };
          avatarWarning = apiError.status === 409 || apiError.code === "agent_conflict"
            ? "ほかの場所でAgentが更新されたため、画像は反映されませんでした。最新の状態を読み込み直してから、もう一度お試しください。"
            : "Agentは保存しましたが、画像を保存できませんでした。もう一度お試しください。";
        }
      }

      // The metadata save itself already reached the server; only the local
      // state application below needs to be skipped for a disposed mount.
      if (lifecycle.disposed) return;
      sharedAgents = [saved, ...sharedAgents.filter((agent) => agent.agentId !== saved!.agentId)];
      const profile = sharedProfile ?? { uid: runtime.selfUid, displayName: "あなた" };
      state.model = {
        ...state.model,
        actors: resolveActors(profile, sharedAgents, [...state.model.actors.values()]),
      };
      state.screens.party.selectedActorId = saved.agentId;
      state.screens.party.filter = "all";
      syncAgentAssigneeOptions();

      if (avatarWarning !== null) {
        editingAgentId = saved.agentId;
        agentIdInput.disabled = true;
        agentError.textContent = avatarWarning;
        agentError.hidden = false;
        announce(avatarWarning);
      } else {
        closeAgentDialog();
        announce(editing ? `${saved.displayName}を更新しました。` : `${saved.displayName}を登録しました。`);
      }
      render();
      refreshAgentAvatars();
    } catch (error) {
      const apiError = error as { status?: number; code?: string };
      agentError.textContent = apiError.status === 409 || apiError.code === "agent_conflict"
        ? "ほかの場所でAgentが更新されました。最新の状態を読み込み直してから、もう一度編集してください。"
        : error instanceof Error ? error.message : "Agentを保存できませんでした。もう一度お試しください。";
      agentError.hidden = false;
    } finally {
      agentSubmit.disabled = false;
      agentSubmit.textContent = editing ? "変更を保存" : "Agentを登録";
    }
  }
  /* ---------------------------------------------------------------- *
   * Account menu (Phase 2) — replaces the fixed "Hironao" / "HN" span.
   * ---------------------------------------------------------------- */

  /* A plain disclosure (APG "Disclosure (Show/Hide)" pattern), not a menu
   * widget — `aria-expanded` on the trigger and a plain button panel is the
   * whole contract. `aria-haspopup`/`role="menu"`/`role="menuitem"` were
   * dropped: they claim a full ARIA menu (roving tabindex, Up/Down/Home/End
   * navigation) that was never implemented, which is worse for screen-reader
   * users than no menu semantics at all — Tab/Shift+Tab through the plain
   * buttons below already works correctly without them. */
  const accountMenuButton = el("button", {
    type: "button",
    class: "rf-account-trigger",
    "aria-expanded": "false",
  });
  const accountMenuPanel = el("div", {
    class: "rf-account-menu",
    "aria-label": "アカウントメニュー",
    hidden: true,
  });
  /* A single positioning context for the trigger and its popover — the panel
   * is `position: absolute` against this, not against the button alone, so it
   * can be a plain DOM sibling instead of needing JS-computed coordinates. */
  const accountMenuHost = el("span", { class: "rf-account-menu-host" }, accountMenuButton, accountMenuPanel);

  function closeAccountMenu(returnFocus: boolean): void {
    if (!state.accountMenuOpen) return;
    state.accountMenuOpen = false;
    render();
    if (returnFocus) accountMenuButton.focus();
  }

  accountMenuButton.addEventListener("click", () => {
    state.accountMenuOpen = !state.accountMenuOpen;
    render();
    if (state.accountMenuOpen) {
      window.requestAnimationFrame(() => {
        accountMenuPanel.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
      });
    }
  });

  function handleAccountMenuOutsideClick(event: MouseEvent): void {
    if (!state.accountMenuOpen) return;
    /* Not `event.target` + `.contains()`: the trigger's own click handler
     * re-renders synchronously (rebuilding its inner avatar/initials) before
     * this listener runs, so `target` can already reference a node that was
     * just detached from the button — `.contains()` would then read as
     * "outside" on the very click that opened the menu. `composedPath()` is
     * captured at dispatch time and survives that mutation. */
    const path = event.composedPath();
    if (path.includes(accountMenuButton) || path.includes(accountMenuPanel)) return;
    closeAccountMenu(false);
  }
  document.addEventListener("click", handleAccountMenuOutsideClick);

  function handleAccountMenuKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !state.accountMenuOpen) return;
    event.preventDefault();
    closeAccountMenu(true);
  }
  document.addEventListener("keydown", handleAccountMenuKeydown);

  async function handleSignOut(): Promise<void> {
    if (runtime === null || runtime.signOut === undefined) return;
    closeAccountMenu(false);
    try {
      await runtime.signOut();
    } catch {
      announce("ログアウトに失敗しました。もう一度お試しください。");
    }
  }

  /** Rebuilds the trigger's content and the menu's items from current state. */
  function renderAccountMenu(): void {
    const selfActor = [...state.model.actors.values()].find((actor) => actor.kind === "human") ?? null;
    const displayName = sharedProfile?.displayName?.trim() || (production ? "あなた" : "デモ");
    accountMenuButton.setAttribute("aria-expanded", state.accountMenuOpen ? "true" : "false");
    accountMenuButton.setAttribute("aria-label", `アカウントメニューを開く（${displayName}）`);
    accountMenuButton.title = displayName;
    replaceChildren(
      accountMenuButton,
      selfActor === null
        ? el("span", { class: "rf-identity-initials" }, initialsFor(displayName))
        : actorAvatar(selfActor, { size: "row", showMarker: false }),
    );

    const accountItem = el("button", { type: "button", class: "rf-account-menu-item" }, "アカウント");
    accountItem.addEventListener("click", () => openSettings("account"));
    const settingsItem = el("button", { type: "button", class: "rf-account-menu-item" }, "設定");
    settingsItem.addEventListener("click", () => openSettings("top"));
    const signOutItem = el(
      "button",
      {
        type: "button",
        class: "rf-account-menu-item rf-account-menu-item--danger",
        disabled: production ? null : true,
      },
      "ログアウト",
    );
    if (production) signOutItem.addEventListener("click", () => { void handleSignOut(); });

    replaceChildren(
      accountMenuPanel,
      el(
        "div",
        { class: "rf-account-menu-header" },
        el("p", { class: "rf-account-menu-name" }, displayName),
        production
          ? (sharedProfile?.handle ? el("p", { class: "rf-account-menu-handle" }, `@${sharedProfile.handle}`) : null)
          : el("p", { class: "rf-account-menu-demo" }, "デモ表示です。実際の操作にはGoogleサインインが必要です。"),
      ),
      el("div", { class: "rf-account-menu-items" }, accountItem, settingsItem, signOutItem),
    );
    accountMenuPanel.hidden = !state.accountMenuOpen;
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
    agentDialog,
    liveRegion,
  );
  replaceChildren(root, shell);
  let checkedReview: string | null = null;
  let humanPending = 0;
  let humanUnread = 0;
  let inboxInitialized = false;
  const inbox = humanInbox({
    quests: sharedQuests,
    port: runtime?.humanRequestPort ?? null,
    onQuest: (quest) => { applyQuestRecord(quest); render(); },
    onSource: (questId) => { void openSourceQuest(questId); },
    onCount: (pending, unread) => {
      const previousUnread = humanUnread;
      humanPending = pending; humanUnread = unread;
      for (const button of shell.querySelectorAll<HTMLElement>(".rf-human-inbox-trigger")) {
        button.textContent = inboxLabel();
        button.setAttribute("aria-label", inboxLabel());
      }
      if (inboxInitialized && unread > previousUnread) announce(inboxLabel());
      inboxInitialized = true;
    },
  });
  shell.append(inbox.element);
  async function openSourceQuest(questId: string): Promise<void> {
    try {
      if (runtime?.humanRequestPort) {
        const response = await runtime.humanRequestPort.getQuest(questId);
        const quest = response.quest;
        if (!quest || typeof quest !== "object" || !("id" in quest) || quest.id !== questId) throw new Error("Invalid Quest response");
        applyQuestRecord(quest as Quest);
      }
      checkedReview = null;
      state.domain = "command";
      state.selectedQuestId = questId;
      state.lensState = "closed";
      render();
      const heading = shell.querySelector<HTMLElement>(isMobile() ? ".rf-m-quest-title" : ".rf-selected-title");
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    } catch { announce(relayText("loadFailed")); }
  }
  function inboxLabel(): string { return relayText("inbox") + " · " + humanPending + (humanUnread ? " / " + relayText("new") + " " + humanUnread : ""); }
  function reviewVersion(): string | null {
    const quest = selectedRawQuest();
    return quest ? quest.id + ":" + quest.updatedAt : null;
  }
  function setExternalChecked(checked: boolean): void {
    checkedReview = checked ? reviewVersion() : null;
    render();
    (isMobile() ? mobileDecision : lensRegion).querySelector<HTMLInputElement>(".rf-external-check input")?.focus();
  }

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
    sharedQuests = sharedQuests.some((entry) => entry.id === quest.id) ? sharedQuests.map((entry) => entry.id === quest.id ? quest : entry) : [quest, ...sharedQuests];
    rawHandoffStates.set(quest.id, quest.assignee.handoffState);
    if (runtime === null) return;
    const normalized = normalizeCommandModel({
      profile: sharedProfile ?? { uid: runtime.selfUid, displayName: "あなた" },
      agents: sharedAgents,
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
    if (action === "reply" && quest?.humanRequest) { inbox.open(undefined, quest.id); return; }
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
    const previousLoom = workfield.querySelector<HTMLElement>(".rf-spine-list");
    const triggerLoom = trigger.closest<HTMLElement>(".rf-spine-list");
    const triggerWasInLoom = previousLoom !== null && triggerLoom === previousLoom;
    const loomSnapshot = previousLoom === null
      ? null
      : {
          top: previousLoom.scrollTop,
          anchorOffset: triggerWasInLoom
            ? trigger.getBoundingClientRect().top - previousLoom.getBoundingClientRect().top
            : null,
        };
    checkedReview = null;
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
    const nextLoom = workfield.querySelector<HTMLElement>(".rf-spine-list");
    const restored = triggerWasInLoom
      ? [...(nextLoom?.querySelectorAll<HTMLElement>(".rf-spine-row") ?? [])]
          .find((row) => row.dataset.questId === questId) ?? null
      : shell.querySelector<HTMLElement>(`[data-quest-id="${questId}"]`);
    if (loomSnapshot !== null && nextLoom !== null) {
      if (loomSnapshot.anchorOffset !== null && restored !== null) {
        const nextOffset = restored.getBoundingClientRect().top - nextLoom.getBoundingClientRect().top;
        nextLoom.scrollTop = loomSnapshot.top + nextOffset - loomSnapshot.anchorOffset;
      } else {
        nextLoom.scrollTop = loomSnapshot.top;
      }
    }
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
      evidenceReviewed: checkedReview !== null && checkedReview === reviewVersion(),
      writeLocked: state.stale,
      permissionMissing: forcedState === "permission"
        ? "quests:write スコープが不足しています。Connections で接続権限とAgentの許可設定を確認してください。"
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
    if (result.phase === "succeeded") relaySuccess(isMobile() ? mobileDecision : lensRegion);
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
  function applyHandoffResult(result: DecisionResult, _kind: DecisionKind): void {
    const quest = result.quest;
    if (quest === null) return;
    rawHandoffStates.set(quest.id, quest.assignee.handoffState);
    sharedQuests = sharedQuests.map((entry) => entry.id === quest.id ? quest : entry);
    const normalized = normalizeCommandModel({
      profile: sharedProfile ?? (runtime ? { uid: runtime.selfUid, displayName: "Human" } : null),
      agents: sharedAgents,
      quests: sharedQuests,
      syncLabel: state.model.lastSyncLabel,
    });
    state.model = { ...normalized, chronicle: state.model.chronicle };
    checkedReview = null;
    state.taskTone = "success";
    state.taskMessage = result.message;
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
   * Settings — Account, Appearance, MCP Connection (Phase 1/2)
   * ---------------------------------------------------------------- */

  function openSettings(section: SettingsSection): void {
    state.domain = "settings";
    state.settingsFocusSection = section;
    state.moreOpen = false;
    state.accountMenuOpen = false;
    render();
    window.requestAnimationFrame(() => {
      screenHost.querySelector<HTMLElement>("h1")?.focus();
    });
  }

  function selectTheme(next: ThemePreference): void {
    state.theme = next;
    storeTheme(next);
    resolveTheme(next);
    render();
  }

  function currentProfileDraft(): ProfileDraft {
    const profile = sharedProfile;
    return state.screens.settings.profileDraft ?? {
      displayName: profile?.displayName ?? "",
      handle: profile?.handle ?? "",
      bio: profile?.bio ?? "",
    };
  }

  function profileFromResponse(value: unknown): ProfileRecord | null {
    const normalized = normalizeProfileRecord(value);
    if (normalized === null || normalized.hasCustomAvatar !== true || normalized.avatarVersion === undefined) return normalized;
    const cached = avatarBlobUrls.get(profileAvatarCacheKey(normalized.avatarVersion));
    return cached === undefined ? normalized : { ...normalized, avatarUrl: cached };
  }

  function profileErrorMessage(error: unknown, fallback: string): string {
    const apiError = error as { status?: number };
    if (apiError.status === 401) return "認証の有効期限が切れました。ページを再読み込みしてサインインし直してください。";
    return error instanceof Error ? error.message : fallback;
  }

  function updateProfileDraft(field: ProfileDraftField, value: string): void {
    const draft = currentProfileDraft();
    state.screens.settings.profileDraft = { ...draft, [field]: value };
  }

  async function retryProfile(): Promise<void> {
    if (runtime === null || state.screens.settings.profileSaving) return;
    state.screens.settings.profileMessage = "";
    state.screens.settings.profileTone = null;
    render();
    try {
      const response = await runLifecycleStep(lifecycle, () => runtime!.profilePort.getProfile());
      if (response.status === "disposed") return;
      profileLoadError = null;
      sharedProfile = profileFromResponse(response.value.profile);
      state.screens.settings.profileDraft = null;
      syncProfileActors();
      render();
      refreshProfileAvatar();
    } catch (error) {
      if (lifecycle.disposed) return;
      profileLoadError = profileErrorMessage(error, "プロフィールを読み込めませんでした。再試行してください。");
      render();
    }
  }

  async function saveProfile(): Promise<void> {
    const settings = state.screens.settings;
    if (runtime === null) {
      settings.profileTone = "error";
      settings.profileMessage = "デモでは保存できません。Googleでサインインしてから設定してください。";
      render();
      return;
    }
    const draft = currentProfileDraft();
    const displayName = draft.displayName.trim();
    const handle = draft.handle.trim().replace(/^@+/, "").toLowerCase();
    const bio = draft.bio.trim();
    if (displayName.length < 1 || displayName.length > 60) {
      settings.profileTone = "error";
      settings.profileMessage = "Display Nameは1〜60文字で入力してください。";
      render();
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
      settings.profileTone = "error";
      settings.profileMessage = "Username / Handleは英数字と _ の3〜20文字で入力してください。";
      render();
      return;
    }
    if (bio.length > 160) {
      settings.profileTone = "error";
      settings.profileMessage = "Bioは160文字以内で入力してください。";
      render();
      return;
    }
    settings.profileSaving = true;
    settings.profileMessage = "";
    settings.profileTone = null;
    render();
    try {
      const response = await runLifecycleStep(lifecycle, () => runtime!.profilePort.updateProfile({ displayName, handle, bio }));
      if (response.status === "disposed") return;
      const updated = profileFromResponse(response.value.profile);
      if (updated === null) throw new Error("保存結果にプロフィールが含まれていません。");
      profileLoadError = null;
      sharedProfile = updated;
      settings.profileDraft = null;
      syncProfileActors();
      settings.profileTone = "success";
      settings.profileMessage = "プロフィールを保存しました。";
      announce("プロフィールを保存しました。");
      render();
      refreshProfileAvatar();
    } catch (error) {
      if (lifecycle.disposed) return;
      settings.profileTone = "error";
      settings.profileMessage = profileErrorMessage(error, "プロフィールを保存できませんでした。もう一度お試しください。");
    } finally {
      if (lifecycle.disposed) return;
      settings.profileSaving = false;
      render();
    }
  }

  /** Reused by the Account section and the account menu's own avatar. */
  async function saveProfileAvatar(file: File): Promise<void> {
    const settings = state.screens.settings;
    if (runtime === null) {
      settings.avatarTone = "error";
      settings.avatarMessage = "デモでは保存できません。Googleでサインインしてから変更してください。";
      render();
      return;
    }
    if (sharedProfile === null) {
      settings.avatarTone = "error";
      settings.avatarMessage = "先にプロフィールを保存してから、Avatarを追加してください。";
      render();
      return;
    }
    settings.avatarSaving = true;
    settings.avatarProgress = 0;
    settings.avatarMessage = "";
    settings.avatarTone = null;
    render();
    const previousProfile = sharedProfile;
    let previewUrl: string | null = null;
    let committed = false;
    try {
      const resized = await runLifecycleStep(lifecycle, () => resizeAvatarImage(file));
      if (resized.status === "disposed") return;
      previewUrl = URL.createObjectURL(resized.value.blob);
      profilePreviewUrl = previewUrl;
      sharedProfile = { ...previousProfile, avatarUrl: previewUrl, hasCustomAvatar: true };
      syncProfileActors();
      render();
      const response = await runLifecycleStep(lifecycle, () => runtime!.profileAvatarPort.uploadProfileAvatar(
        resized.value.blob,
        (loaded, total) => {
          if (lifecycle.disposed) return;
          settings.avatarProgress = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
          render();
        },
      ));
      if (response.status === "disposed") return;
      const updated = normalizeProfileRecord(response.value.profile);
      if (updated === null || updated.hasCustomAvatar !== true || updated.avatarVersion === undefined || updated.avatarVersion < 1) {
        throw new Error("保存結果にAvatar情報が含まれていません。");
      }
      committed = true;
      profileLoadError = null;
      const newKey = profileAvatarCacheKey(updated.avatarVersion);
      clearProfileAvatarCache(newKey);
      sharedProfile = { ...updated, avatarUrl: previewUrl };
      syncProfileActors();
      settings.avatarProgress = 100;
      render();
      try {
        const image = await runLifecycleStep(lifecycle, () => runtime!.profileAvatarPort.fetchProfileAvatar(updated.avatarVersion!));
        if (image.status === "disposed") return;
        const finalUrl = URL.createObjectURL(image.value);
        if (lifecycle.disposed) {
          URL.revokeObjectURL(finalUrl);
          return;
        }
        avatarBlobUrls.set(newKey, finalUrl);
        if (profilePreviewUrl === previewUrl && previewUrl !== null) {
          URL.revokeObjectURL(previewUrl);
          profilePreviewUrl = null;
        }
        sharedProfile = { ...updated, avatarUrl: finalUrl };
        syncProfileActors();
        settings.avatarTone = "success";
        settings.avatarMessage = "Avatarを更新しました。";
        announce("Avatarを更新しました。");
      } catch {
        settings.avatarTone = "success";
        settings.avatarMessage = "Avatarを保存しました。表示の更新は再読み込み後に反映されます。";
      }
    } catch (error) {
      if (lifecycle.disposed) return;
      settings.avatarTone = "error";
      settings.avatarMessage = committed
        ? "Avatarは保存されましたが、表示の更新に失敗しました。再読み込みしてください。"
        : profileErrorMessage(error, "Avatarを保存できませんでした。もう一度お試しください。");
      if (!committed) {
        sharedProfile = previousProfile;
        syncProfileActors();
        if (previewUrl !== null && profilePreviewUrl === previewUrl) {
          URL.revokeObjectURL(previewUrl);
          profilePreviewUrl = null;
        }
      }
    } finally {
      if (lifecycle.disposed) return;
      settings.avatarProgress = null;
      settings.avatarSaving = false;
      render();
    }
  }

  async function removeProfileAvatar(): Promise<void> {
    const settings = state.screens.settings;
    if (runtime === null || sharedProfile === null || sharedProfile.hasCustomAvatar !== true || settings.avatarSaving) return;
    settings.avatarSaving = true;
    settings.avatarProgress = null;
    settings.avatarMessage = "";
    settings.avatarTone = null;
    render();
    try {
      const response = await runLifecycleStep(lifecycle, () => runtime!.profileAvatarPort.deleteProfileAvatar());
      if (response.status === "disposed") return;
      const updated = normalizeProfileRecord(response.value.profile);
      if (updated === null) throw new Error("保存結果にプロフィールが含まれていません。");
      clearProfileAvatarCache();
      if (profilePreviewUrl !== null) {
        URL.revokeObjectURL(profilePreviewUrl);
        profilePreviewUrl = null;
      }
      sharedProfile = updated;
      syncProfileActors();
      settings.avatarTone = "success";
      settings.avatarMessage = "Avatarを削除しました。";
      announce("Avatarを削除しました。");
    } catch (error) {
      if (lifecycle.disposed) return;
      settings.avatarTone = "error";
      settings.avatarMessage = profileErrorMessage(error, "Avatarを削除できませんでした。もう一度お試しください。");
    } finally {
      if (lifecycle.disposed) return;
      settings.avatarSaving = false;
      render();
    }
  }

  async function copyMcpUrl(url: string): Promise<void> {
    const settings = state.screens.settings;
    if (url === "") {
      settings.mcpCopyTone = "error";
      settings.mcpCopyMessage = "MCP URLを取得できませんでした。";
      render();
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      settings.mcpCopyTone = "success";
      settings.mcpCopyMessage = "コピーしました。";
    } catch {
      settings.mcpCopyTone = "error";
      settings.mcpCopyMessage = "コピーできませんでした。手動で選択してコピーしてください。";
    }
    render();
  }

  function toolsFromResponse(value: unknown): unknown[] {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
    const tools = (value as { tools?: unknown }).tools;
    return Array.isArray(tools) ? tools : [];
  }

  async function retryMcpTools(): Promise<void> {
    if (runtime === null || mcpToolsLoading) return;
    mcpToolsLoading = true;
    mcpToolsLoadError = null;
    render();
    try {
      const response = await runLifecycleStep(lifecycle, () => runtime!.mcpToolsPort.listMcpTools());
      if (response.status === "disposed") return;
      sharedMcpTools = toolsFromResponse(response.value);
    } catch (error) {
      if (lifecycle.disposed) return;
      mcpToolsLoadError = profileErrorMessage(error, "MCP Tool一覧を取得できませんでした。再試行してください。");
    } finally {
      if (lifecycle.disposed) return;
      mcpToolsLoading = false;
      render();
    }
  }

  async function refreshAgentConnections(): Promise<void> {
    if (runtime === null) return;
    const response = await runLifecycleStep(lifecycle, () => runtime!.agentConnectionPort.listAgentConnections());
    if (response.status === "disposed") return;
    sharedAgentConnections = normalizeAgentConnections(response.value);
    agentConnectionsLoadError = null;
  }

  async function retryAgentConnections(): Promise<void> {
    if (runtime === null || agentConnectionsLoading) return;
    agentConnectionsLoading = true;
    agentConnectionsLoadError = null;
    render();
    try {
      await refreshAgentConnections();
    } catch (error) {
      if (lifecycle.disposed) return;
      agentConnectionsLoadError = profileErrorMessage(error, "MCP接続の一覧を取得できませんでした。再試行してください。");
    } finally {
      if (lifecycle.disposed) return;
      agentConnectionsLoading = false;
      render();
    }
  }

  function openAgentPicker(clientId: string): void {
    const row = sharedAgentConnections.find((connection) => connection.clientId === clientId);
    state.screens.settings.connectionDrafts[clientId] = row?.linkedAgentId ?? "";
    state.screens.settings.connectionMessage = "";
    state.screens.settings.connectionTone = null;
    render();
  }

  function cancelAgentPicker(clientId: string): void {
    delete state.screens.settings.connectionDrafts[clientId];
    render();
  }

  function selectConnectionAgent(clientId: string, agentId: string): void {
    state.screens.settings.connectionDrafts[clientId] = agentId;
    render();
  }

  async function linkAgent(clientId: string, agentId: string): Promise<void> {
    const settings = state.screens.settings;
    if (runtime === null || agentId === "" || settings.connectionBusyId !== null) return;
    settings.connectionBusyId = clientId;
    settings.connectionMessage = "";
    settings.connectionTone = null;
    render();
    try {
      await runLifecycleStep(lifecycle, () => runtime!.agentConnectionPort.linkAgentConnection(agentId, clientId));
      await refreshAgentConnections();
      delete settings.connectionDrafts[clientId];
      settings.connectionTone = "success";
      settings.connectionMessage = "Linked Agentを更新しました。";
      announce("Linked Agentを更新しました。");
    } catch (error) {
      if (lifecycle.disposed) return;
      settings.connectionTone = "error";
      settings.connectionMessage = profileErrorMessage(error, "Linked Agentを更新できませんでした。再試行してください。");
    } finally {
      if (lifecycle.disposed) return;
      settings.connectionBusyId = null;
      render();
    }
  }

  async function unlinkAgent(clientId: string, agentId: string): Promise<void> {
    const settings = state.screens.settings;
    if (runtime === null || agentId === "" || settings.connectionBusyId !== null) return;
    settings.connectionBusyId = clientId;
    settings.connectionMessage = "";
    settings.connectionTone = null;
    render();
    try {
      await runLifecycleStep(lifecycle, () => runtime!.agentConnectionPort.unlinkAgentConnection(agentId, clientId));
      await refreshAgentConnections();
      delete settings.connectionDrafts[clientId];
      settings.connectionTone = "success";
      settings.connectionMessage = "Agentのリンクを解除しました。MCP接続は維持されています。";
      announce("Agentのリンクを解除しました。");
    } catch (error) {
      if (lifecycle.disposed) return;
      settings.connectionTone = "error";
      settings.connectionMessage = profileErrorMessage(error, "Agentのリンクを解除できませんでした。再試行してください。");
    } finally {
      if (lifecycle.disposed) return;
      settings.connectionBusyId = null;
      render();
    }
  }

  async function revokeMcpConnection(clientId: string): Promise<void> {
    const settings = state.screens.settings;
    if (runtime === null || clientId === "" || settings.connectionBusyId !== null) return;
    settings.connectionBusyId = clientId;
    settings.connectionMessage = "";
    settings.connectionTone = null;
    render();
    try {
      await runLifecycleStep(lifecycle, () => runtime!.agentConnectionPort.revokeMcpConnection(clientId));
      await refreshAgentConnections();
      delete settings.connectionDrafts[clientId];
      settings.connectionTone = "success";
      settings.connectionMessage = "MCP接続を解除しました。Agent本体は削除されません。";
      announce("MCP接続を解除しました。");
    } catch (error) {
      if (lifecycle.disposed) return;
      settings.connectionTone = "error";
      settings.connectionMessage = profileErrorMessage(error, "MCP接続を解除できませんでした。もう一度お試しください。");
    } finally {
      if (lifecycle.disposed) return;
      settings.connectionBusyId = null;
      render();
    }
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
        el("img", {
          class: "rf-mark",
          src: "../../assets/brand/guilduo-mark-gold.svg",
          alt: "",
          "aria-hidden": "true",
        }),
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
          (() => {
            const selected = state.domain === "settings";
            const button = el(
              "button",
              {
                type: "button",
                class: "rf-nav-item",
                "data-selected": selected ? "true" : "false",
                "aria-current": selected ? "page" : null,
              },
              el("span", { class: "rf-nav-glyph", "data-domain": "settings", "aria-hidden": "true" }),
              el("span", { class: "rf-nav-label" }, "Settings"),
            );
            button.addEventListener("click", () => openSettings("top"));
            return el("li", null, button);
          })(),
        )
        : null,
      el(
        "div",
        { class: "rf-rail-bottom" },
        (() => {
          const current = currentEffectiveTheme(state.theme);
          const label = state.theme === "system" ? `Theme: System (${current === "dark" ? "Dark" : "Light"})` : `Theme: ${current === "dark" ? "Dark" : "Light"}`;
          const toggle = el(
            "button",
            {
              type: "button",
              class: "rf-rail-utility",
              title: `${label} — click to switch to ${current === "dark" ? "Light" : "Dark"}. Choose System in Settings.`,
            },
            el("span", { class: "rf-nav-label" }, "Theme"),
            el(
              "span",
              { class: "rf-theme-switch", "data-theme-mode": current },
              el("span", { class: "rf-theme-glyph", "data-mode": "dark", "aria-hidden": "true" }),
              el("span", { class: "rf-theme-glyph", "data-mode": "light", "aria-hidden": "true" }),
            ),
          );
          toggle.addEventListener("click", () => {
            // A quick toggle only ever flips the theme actually on screen. From
            // `system` it switches to the explicit opposite of what OS dark/light
            // is currently rendering, so the click is never a visual no-op; going
            // back to `system` is a Settings action, not part of this cycle.
            state.theme = nextQuickToggleTheme(state.theme, prefersDarkQuery.matches);
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
        (() => {
          const settingsButton = el(
            "button",
            {
              type: "button",
              class: "rf-rail-utility",
              title: "Settings",
              "aria-current": state.domain === "settings" ? "page" : null,
              "data-selected": state.domain === "settings" ? "true" : "false",
            },
            el("span", { class: "rf-nav-label" }, "Settings"),
            el("span", { class: "rf-settings-mark", "aria-hidden": "true" }),
          );
          settingsButton.addEventListener("click", () => openSettings("top"));
          return settingsButton;
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
          { type: "button", class: "rf-quiet-button rf-alerts rf-human-inbox-trigger", title: relayText("inbox") },
          el("span", { class: "rf-bell-mark", "aria-hidden": "true" }),
          inboxLabel(),
        ),
        accountMenuHost,
      ),
    );
    operationBar.querySelector<HTMLButtonElement>(".rf-alerts")?.addEventListener("click", (event) => inbox.open(event.currentTarget as HTMLElement));
    renderAccountMenu();
  }

  function renderBand(): void {
    const slots = runtime ? state.model.capacity : state.stale ? fixtureCapacityStale : fixtureCapacity;
    replaceChildren(
      bandRegion,
      capacityBand(slots, {
        expandHealth: state.stale,
        onSelect: (slot: CapacitySlot) => {
          if (slot.filter === "health") {
            if (runtime) { openSettings("mcp"); return; }
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
        newCount: runtime ? 0 : 5,
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
        externalChecked: decisionGate().evidenceReviewed,
        onExternalChecked: setExternalChecked,
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
      externalChecked: decisionGate().evidenceReviewed,
      humanPending,
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
        ? "quests:write スコープが不足しています。Connections で接続権限とAgentの許可設定を確認してください。"
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
      onExternalChecked: setExternalChecked,
      onInbox: (trigger: HTMLElement) => inbox.open(trigger),
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
   * selection and a single identity map across every destination.
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
        onSendToCommand: (questId: string) => {
          if (sharedQuests.some((quest) => quest.id === questId && quest.humanRequest)) inbox.open(undefined, questId);
          else context.onNavigate("command", questId);
        },
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
      const callbacks = {
        canManageAgents: runtime !== null,
        onCreateAgent: openCreateAgent,
        onEditAgent: openEditAgent,
      };
      return isMobile()
        ? renderPartyMobile(model, state.screens.party, context, callbacks)
        : renderPartyDesktop(model, state.screens.party, context, callbacks);
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
    if (state.domain === "skills") {
      const mcpUrl = deriveMcpUrl(runtime?.gatewayUrl ?? gatewayDefaultUrl());
      const authorizedConnections = sharedAgentConnections.filter((connection) => connection.authorized).length;
      const fixtureTools = state.variant === "empty" || state.variant === "loading"
        ? []
        : FIXTURE_MCP_TOOLS;
      const model = normalizeSkillsModel({
        tools: production ? sharedMcpTools : fixtureTools,
        sourceLabel: "Guilduo MCP",
        sourceUrl: mcpUrl,
        connectionLabel: production
          ? authorizedConnections === 0 ? "No external OAuth client connected" : `${authorizedConnections} authorized OAuth connection${authorizedConnections === 1 ? "" : "s"}`
          : "Preview catalog",
        query: state.screens.skills.query,
        loading: production ? mcpToolsLoading : state.variant === "loading",
        connected: production ? mcpUrl !== "" : state.variant !== "permission",
        error: production ? mcpToolsLoadError : state.variant === "error" ? "fixture_error" : null,
      });
      const callbacks = {
        onSearch: (query: string) => {
          state.screens.skills.query = query;
          render();
          window.requestAnimationFrame(() => {
            const input = screenHost.querySelector<HTMLInputElement>(".rf-skills-search-input");
            if (input !== null) {
              input.focus();
              const position = Math.min(query.length, input.value.length);
              input.setSelectionRange(position, position);
            }
          });
        },
        onToggleGroup: (groupId: string) => {
          state.screens.skills.expandedGroups[groupId] = state.screens.skills.expandedGroups[groupId] !== true;
          render();
        },
        onRetry: () => { void retryMcpTools(); },
      };
      return isMobile()
        ? renderSkillsMobile(model, state.screens.skills, context, callbacks)
        : renderSkillsDesktop(model, state.screens.skills, context, callbacks);
    }
    if (state.domain === "settings") {
      const model = normalizeSettingsModel({
        isDemo: runtime === null,
        profile: sharedProfile,
        email: runtime?.email ?? "",
        profileLoadError,
        theme: state.theme,
        effectiveTheme: currentEffectiveTheme(state.theme),
        gatewayUrl: runtime?.gatewayUrl ?? gatewayDefaultUrl(),
        agents: screenAgents().map((agent) => ({
          agentId: agent.agentId,
          displayName: agent.displayName,
          provider: agent.provider ?? "",
          role: agent.role || "assistant",
          status: agent.status ?? "active",
          allowedScopes: agent.allowedScopes,
        })),
        mcpConnections: sharedAgentConnections,
        mcpConnectionLoadError: agentConnectionsLoadError,
      });
      const callbacks = {
        onThemeSelect: selectTheme,
        onAvatarFileSelected: (file: File) => { void saveProfileAvatar(file); },
        onRemoveAvatar: () => { void removeProfileAvatar(); },
        onProfileDraftChange: updateProfileDraft,
        onSaveProfile: () => { void saveProfile(); },
        onRetryProfile: () => { void retryProfile(); },
        onCopyMcpUrl: () => { void copyMcpUrl(model.mcpUrl); },
        onRetryMcpConnections: () => { void retryAgentConnections(); },
        onOpenAgentPicker: openAgentPicker,
        onCancelAgentPicker: cancelAgentPicker,
        onSelectConnectionAgent: selectConnectionAgent,
        onLinkAgent: (clientId: string, agentId: string) => { void linkAgent(clientId, agentId); },
        onUnlinkAgent: (clientId: string, agentId: string) => { void unlinkAgent(clientId, agentId); },
        onRevokeConnection: (clientId: string) => { void revokeMcpConnection(clientId); },
        canManageAgents: runtime !== null,
        onCreateAgent: openCreateAgent,
        onEditAgent: openEditAgent,
      };
      const focusSection = state.settingsFocusSection;
      state.settingsFocusSection = null;
      return isMobile()
        ? renderSettingsMobile(model, state.screens.settings, context, callbacks, focusSection)
        : renderSettingsDesktop(model, state.screens.settings, context, callbacks, focusSection);
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

  function handleLensAsSheetChange(event: MediaQueryListEvent): void {
    state.lensState = event.matches ? "closed" : "open";
    if (!event.matches) closeQuestFlow();
    render();
  }
  lensAsSheet.addEventListener("change", handleLensAsSheetChange);

  // `system` tracks the OS live: the Rail glyph, the Settings Appearance
  // section and the CSS itself must all agree the instant it changes.
  function handlePrefersDarkChange(): void {
    if (state.theme === "system") render();
  }
  prefersDarkQuery.addEventListener("change", handlePrefersDarkChange);

  function handleLensKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    // A sheet owns Escape while it is open, and mobile has no Lens to close.
    if (state.questFlowOpen || isMobile()) return;
    if (state.lensState === "open" || state.lensState === "peek") {
      event.preventDefault();
      closeLens();
    }
  }
  document.addEventListener("keydown", handleLensKeydown);
  window.addEventListener("questforge:locale-changed", render);

  render();
  refreshAgentAvatars();
  refreshProfileAvatar();
  void inbox.refresh();

  return function unmountRelayForge(): void {
    // First, so every in-flight avatar fetch's continuation (however many
    // microtask hops away it still is) observes disposal before it can
    // create a Blob URL, mutate shared state, or render.
    lifecycle.dispose();
    window.removeEventListener("questforge:locale-changed", render);
    inbox.destroy();
    document.removeEventListener("click", handleAccountMenuOutsideClick);
    document.removeEventListener("keydown", handleAccountMenuKeydown);
    lensAsSheet.removeEventListener("change", handleLensAsSheetChange);
    prefersDarkQuery.removeEventListener("change", handlePrefersDarkChange);
    document.removeEventListener("keydown", handleLensKeydown);
    for (const url of avatarBlobUrls.values()) URL.revokeObjectURL(url);
    avatarBlobUrls.clear();
    if (profilePreviewUrl !== null) URL.revokeObjectURL(profilePreviewUrl);
    profilePreviewUrl = null;
  };
}

function domainLabel(id: NavId): string {
  if (id === "settings") return "Settings";
  return DOMAINS.find((domain) => domain.id === id)?.label ?? "Command";
}

/**
 * `?state=` already selects a Command state; the same parameter selects the
 * screen fixture state so one capture run can drive every destination.
 * It only ever restricts what the UI will do — it never fabricates a success.
 */
function readVariant(): ScreenVariant {
  const requested = new URLSearchParams(window.location.search).get("state");
  return isScreenVariant(requested) ? requested : "default";
}

/**
 * Theme initialization follows OS preference on first run; a saved choice wins.
 * `?theme=` is accepted so the capture set can be taken deterministically.
 * An invalid stored value (hand-edited storage, an old format) falls back to
 * `system` rather than crashing or rendering unthemed.
 */
function readStoredTheme(): ShellState["theme"] {
  const requested = new URLSearchParams(window.location.search).get("theme");
  if (requested === "light" || requested === "dark" || requested === "system") return requested;
  return parseThemePreference(window.localStorage.getItem(THEME_KEY));
}

function storeTheme(theme: ShellState["theme"]): void {
  window.localStorage.setItem(THEME_KEY, theme);
}

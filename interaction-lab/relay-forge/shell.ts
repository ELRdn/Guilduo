import { humanInbox } from "./human-inbox.ts";
import { reportGuiTiming } from "./gui-timing.ts";
import { relayText } from "./relay-copy.ts";
import { relaySuccess } from "./relay-motion.ts";
import { getLocale, t } from "../../i18n.ts";
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
import { countLabel, screenNotice } from "./screens/runtime.ts";
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
  battleBusy,
  refreshBattle,
  normalizeBattleModel,
  renderBattleDesktop,
  renderBattleMobile,
} from "./screens/battle.ts";
import { type BattleFailure, FixtureBattlePort, fixtureBattleState, validateBattleSession } from "./screens/battle-port.ts";
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
  { id: "command", label: "Command", migrated: true, primaryOnMobile: true },
  { id: "quests", label: "Quests", migrated: true, primaryOnMobile: true },
  { id: "network", label: "Network", migrated: true, primaryOnMobile: true },
  { id: "party", label: "Party", migrated: true, primaryOnMobile: true },
  { id: "battle", label: "Battle", migrated: true, primaryOnMobile: false },
  { id: "connections", label: "Connections", migrated: true, primaryOnMobile: false },
  { id: "skills", label: "Skills", migrated: true, primaryOnMobile: false },
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
  /* Decision flow. `decision` is the last result from the Handoff Command. */
  revisionOpen: boolean;
  revisionReason: string;
  revisionError: string | null;
  decision: DecisionResult;
  taskSubmitting: boolean;
  taskMessage: () => string;
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
  let connectionMutation = 0;
  let connectionRefreshFailed = false;
  let humanResponseBusy = false;
  let workspaceRefreshing = false;
  let workspaceOffline = false;
  let sharedIntegrations = runtime?.integrations;
  let sharedMembers = runtime?.members;
  let sharedPartyName = runtime?.partyName;
  let deferredLoading = Boolean(runtime?.loadDeferred);
  let deferredError: string | null = null;
  let deferredPanelErrors = runtime?.panelErrors ?? [];
  let battleMutation = 0;
  let battleLoadError: string | null = null;

  async function loadDeferredPanels(): Promise<void> {
    if (!runtime?.loadDeferred || lifecycle.disposed) return;
    deferredLoading = true;
    deferredError = null;
    render();
    try {
      const version = battleMutation;
      const connectionVersion = connectionMutation;
      const panels = await runtime.loadDeferred();
      if (lifecycle.disposed) return;
      // Never replace Quests, profile or Agents: the user may have edited them
      // while auxiliary requests were pending.
      if (connectionVersion === connectionMutation) sharedIntegrations = panels.integrations;
      sharedMembers = panels.members;
      sharedPartyName = panels.partyName;
      if (version === battleMutation) battleSession = panels.battleSession;
      sharedAgentConnections = [...panels.agentConnections];
      agentConnectionsLoadError = panels.agentConnectionsLoadError;
      sharedMcpTools = [...panels.mcpTools];
      mcpToolsLoadError = panels.mcpToolsLoadError;
      deferredPanelErrors = (panels.panelErrors ?? []).filter(entry => version === battleMutation || entry.index !== 1);
    } catch (error) {
      if (!lifecycle.disposed) deferredError = error instanceof Error ? error.message : relayText("loadFailed");
    } finally {
      if (!lifecycle.disposed) { deferredLoading = false; render(); }
    }
  }

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
    lensState: window.matchMedia("(min-width: 1600px)").matches ? "open" : "closed",
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
    revisionOpen: false,
    revisionReason: "",
    revisionError: null,
    decision: IDLE_DECISION,
    taskSubmitting: false,
    taskMessage: () => "",
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
  let battleSession: BattleSession | null = runtime !== null ? runtime.battleSession : (state.variant === "empty" || state.variant === "loading"
    ? null
    : fixtureBattlePort.session());

  const connectionFailure: ConnectionFailure = state.variant === "permission"
    ? "permission"
    : state.variant === "offline" || state.variant === "error"
      ? "network"
      : state.variant === "conflict"
        ? "conflict"
        : "none";
  const baseConnectionsPort = runtime?.connectionsPort ?? new FixtureConnectionsPort(connectionFailure);
  const refreshConnections = async () => {
    connectionMutation += 1;
    try {
      const next = await runtime!.refreshConnections!();
      if (lifecycle.disposed) return { ok:false, code:"disposed", message:"" };
      sharedIntegrations = next.integrations;
      sharedQuests = [...next.quests];
      rawHandoffStates.clear();
      for (const quest of sharedQuests) rawHandoffStates.set(quest.id, quest.assignee.handoffState);
      rebuildQuestModel();
      connectionRefreshFailed = false;
      return { ok:true, code:"refreshed", get message() { return relayText("connectionRefreshed"); } };
    } catch {
      if (!lifecycle.disposed) connectionRefreshFailed = true;
      return { ok:false, code:"refresh_failed", get message() { return relayText("connectionRefreshFailed"); } };
    }
  };
  const connectionChange = async (work: () => ReturnType<typeof baseConnectionsPort.runSync>) => {
    const result = await work();
    if (!result.ok || lifecycle.disposed) return result;
    const refreshed = await refreshConnections();
    return refreshed.ok ? result : { ok:true, code:refreshed.code, get message() { return refreshed.message; } };
  };
  const connectionsPort = runtime?.refreshConnections ? {
    previewSync: (id: string) => baseConnectionsPort.previewSync(id),
    runSync: (id: string) => connectionChange(() => baseConnectionsPort.runSync(id)),
    reconnect: (id: string) => baseConnectionsPort.reconnect(id),
    disconnect: (id: string) => connectionChange(() => baseConnectionsPort.disconnect(id)),
    refresh: refreshConnections,
  } : baseConnectionsPort;
  const connectionWriteHeld = () => state.screens.connections.busyId !== null || connectionRefreshFailed;

  const screenQuests = () => production ? sharedQuests : fixtureQuestsFor(state.variant);
  const screenAgents = () => production ? sharedAgents : fixtureAgentsFor(state.variant);
  const screenIntegrations = () => sharedIntegrations ?? fixtureIntegrationsFor(state.variant);
  const screenMembers = () => sharedMembers ?? fixturePartyMembersFor(state.variant);
  const screenPartyName = () => sharedPartyName ?? fixturePartyNameFor(state.variant);
  const screenNotices = (label: string, retry: () => void) => production ? [] : noticesFor(state.variant, label, retry);
  // ponytail: serialize UI writes; use per-resource locks only if parallel writes are needed.
  const mutationBusy = () => connectionWriteHeld() || humanResponseBusy || state.taskSubmitting || state.decision.phase === "submitting" || state.screens.battle.phase === "submitting" || state.screens.battle.phase === "refreshing" || state.screens.settings.profileSaving || state.screens.settings.avatarSaving || state.screens.settings.connectionBusyId !== null || createSubmit.disabled || agentSubmit.disabled;
  const workspaceWriteHeld = () => workspaceRefreshing || workspaceOffline || (production && state.model.syncState === "error");
  const screenWriteHeld = () => mutationBusy() || workspaceWriteHeld() || state.screens.battle.needsRefresh || Boolean(battleLoadError) || state.stale || (!production && writeHeldFor(state.variant));

  async function refreshWorkspace(): Promise<void> {
    if (!runtime?.refreshWorkspace || lifecycle.disposed || workspaceRefreshing || mutationBusy() || deferredLoading || createDialog.open || agentDialog.open || inputComposing) return;
    if (navigator.onLine === false) { markWorkspaceOffline(); return; }
    const origin = document.activeElement;
    const field = origin instanceof HTMLInputElement || origin instanceof HTMLTextAreaElement ? origin : null;
    const focus = field ? { domain:state.domain, questId:state.selectedQuestId, selector:field.id ? `#${CSS.escape(field.id)}` : field.name ? `[name="${CSS.escape(field.name)}"]` : field.matches(".rf-revision-input") ? ".rf-revision-input" : ".rf-search-input", start:field.selectionStart, end:field.selectionEnd, direction:field.selectionDirection } : null;
    const refreshControl = origin instanceof HTMLElement && origin.matches('.rf-screen-notice button, .rf-m-sync, [data-slot="health"]') ? state.domain : null;
    workspaceRefreshing = true;
    workspaceOffline = false;
    state.model = { ...state.model, syncState:"syncing" };
    render();
    try {
      const next = await runtime.refreshWorkspace();
      if (lifecycle.disposed) return;
      if (workspaceOffline) { state.model = { ...state.model, syncState:"error" }; return; }
      const failed = new Set(next.panelErrors?.map(panel => panel.index));
      const selectedVersion = selectedRawQuest()?.updatedAt;
      sharedQuests = [...next.quests];
      rawHandoffStates.clear();
      for (const quest of sharedQuests) rawHandoffStates.set(quest.id, quest.assignee.handoffState);
      if (!failed.has(3)) {
        const cached = next.profile?.hasCustomAvatar ? avatarBlobUrls.get(profileAvatarCacheKey(next.profile.avatarVersion ?? 0)) : undefined;
        sharedProfile = next.profile === null ? null : { ...next.profile, ...(cached ? { avatarUrl:cached } : {}) };
        profileLoadError = next.profileLoadError;
      }
      if (!failed.has(5)) sharedAgents = next.agents.map(withCachedAvatar);
      if (!failed.has(1)) { battleSession = next.battleSession; battleMutation += 1; battleLoadError = null; }
      if (!failed.has(2)) { sharedIntegrations = next.integrations; connectionMutation += 1; }
      if (!failed.has(4)) { sharedMembers = next.members; sharedPartyName = next.partyName; }
      if (!failed.has(6)) { sharedAgentConnections = [...next.agentConnections]; agentConnectionsLoadError = next.agentConnectionsLoadError; }
      if (!failed.has(7)) { sharedMcpTools = [...next.mcpTools]; mcpToolsLoadError = next.mcpToolsLoadError; }
      deferredPanelErrors = next.panelErrors ?? [];
      rebuildQuestModel();
      if (selectedVersion !== selectedRawQuest()?.updatedAt) {
        checkedReview = null;
        state.decision = IDLE_DECISION;
        taskQuestId = null;
      }
      refreshAgentAvatars();
      refreshProfileAvatar();
      void inbox.refresh();
    } catch {
      if (!lifecycle.disposed) state.model = { ...state.model, syncState:"error" };
    } finally {
      workspaceRefreshing = false;
      if (!lifecycle.disposed) {
        const restoreFocus = document.activeElement === document.body || document.activeElement === origin || Boolean(focus && document.activeElement instanceof HTMLElement && document.activeElement.matches(focus.selector));
        render();
        if (restoreFocus && focus && focus.domain === state.domain && focus.questId === state.selectedQuestId) {
          const restored = [...shell.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(focus.selector)].find(element => element.getClientRects().length > 0);
          if (restored && !restored.disabled) { restored.focus({ preventScroll:true }); if (focus.start !== null && focus.end !== null) restored.setSelectionRange(focus.start, focus.end, focus.direction ?? undefined); }
        } else if (restoreFocus && refreshControl === state.domain) {
          const restored = (state.domain === "command" ? shell.querySelector<HTMLElement>(isMobile() ? ".rf-m-sync" : '[data-slot="health"]') : screenHost.querySelector<HTMLElement>(".rf-screen-notice button, h1, h2"));
          if (restored) { if (restored.matches("h1, h2")) restored.tabIndex = -1; restored.focus({ preventScroll:true }); }
        }
      }
    }
  }

  function markWorkspaceOffline(): void {
    if (!runtime?.refreshWorkspace || lifecycle.disposed) return;
    workspaceOffline = true;
    state.model = { ...state.model, syncState:"error" };
    render();
  }

  function workspaceNotice(): HTMLElement | null {
    if (!runtime?.refreshWorkspace) return null;
    const partial = !workspaceOffline && state.model.syncState !== "error" && deferredPanelErrors.length > 0;
    if (!partial && !workspaceOffline && state.model.syncState !== "error") return null;
    return screenNotice({ status:partial ? "partial" : workspaceOffline ? "offline" : "error", detail:relayText(partial ? "statusPartial" : "writePaused"), action:{ label:relayText("retry"), onAct:() => { void refreshWorkspace(); } } });
  }
  const screenNow = () => production ? Date.now() : FIXTURE_NOW;
  const screenToday = () => production ? new Date().toISOString().slice(0, 10) : FIXTURE_TODAY;

  const rail = el("nav", { class: "rf-rail", "aria-label": "Guilduo domains" });
  const operationBar = el("header", { class: "rf-operation-bar" });
  operationBar.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest(".rf-create") : null;
    if (target !== null) openCreate();
  });

  function openQuestSearch(): void {
    if (shell.querySelector("dialog[open]") || state.questFlowOpen) return;
    state.domain = "quests";
    state.lensState = "closed";
    state.screens.quests.segment = "all";
    state.screens.quests.mobileDetailOpen = false;
    render();
    screenHost.querySelector<HTMLInputElement>('.rf-search-input')?.focus();
  }

  function handleSearchShortcut(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "k") return;
    if (shell.querySelector("dialog[open]") || state.questFlowOpen) return;
    event.preventDefault();
    openQuestSearch();
  }
  document.addEventListener("keydown", handleSearchShortcut);
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
  const mobileFooterObserver = new ResizeObserver(() => {
    if (lifecycle.disposed) return;
    mobileRegion.style.setProperty("--rf-mobile-footer-height",
      `${mobileDecision.getBoundingClientRect().height + rail.getBoundingClientRect().height}px`);
  });
  mobileFooterObserver.observe(mobileDecision);
  mobileFooterObserver.observe(rail);
  const sheetHost = el("div", { class: "rf-sheet-host" });
  const liveRegion = el("p", { class: "rf-visually-hidden", role: "status", "aria-live": "polite" });
  /* The host for every non-Command destination. Command never renders into it,
   * and it is emptied whenever Command is active, so no off-screen Command DOM
   * and no off-screen screen DOM can ever coexist in the accessibility tree. */
  const screenHost = el("div", { class: "rf-screen-host", id: "rf-screen-host" });
  const screenSticky = el("div", { class: "rf-screen-sticky" });

  const editorLabels: Array<() => void> = [];
  function createField(label: string | (() => string), control: HTMLElement, hint: string | (() => string) = ""): HTMLLabelElement {
    const labelNode = el("span", { class: "rf-create-label" }, typeof label === "function" ? label() : label);
    const hintNode = hint === "" ? null : el("small", { class: "rf-create-hint" }, typeof hint === "function" ? hint() : hint);
    if (typeof label === "function") editorLabels.push(() => { labelNode.textContent = label(); });
    if (typeof hint === "function" && hintNode !== null) editorLabels.push(() => { hintNode.textContent = hint(); });
    return el(
      "label",
      { class: "rf-create-field" },
      labelNode,
      control,
      hintNode,
    );
  }

  const createTitle = el("input", {
    class: "rf-create-input",
    name: "title",
    type: "text",
    maxlength: "160",
    autocomplete: "off",
    required: true,
    placeholder: relayText("questTitlePlaceholder"),
  });
  const createNextAction = el("input", {
    class: "rf-create-input",
    name: "nextAction",
    type: "text",
    maxlength: "160",
    autocomplete: "off",
    placeholder: relayText("nextActionPlaceholder"),
  });
  const createDue = el("input", { class: "rf-create-input", name: "dueDate", type: "date" });
  const createEstimate = el("input", {
    class: "rf-create-input",
    name: "estimatedMinutes",
    type: "number",
    min: "0",
    max: "1440",
    step: "1",
    value: "30",
    inputmode: "numeric",
  });
  const createAssignee = el("select", { class: "rf-create-input", name: "assignee" });
  createAssignee.append(el("option", { value: "self" }, sharedProfile?.displayName || t("task.assignee.self")));
  for (const agent of sharedAgents) {
    createAssignee.append(el("option", { value: agent.agentId }, `${agent.displayName} · Agent`));
  }
  const createError = el("p", { class: "rf-create-error", role: "alert", hidden: true });
  const createHeading = el("h2", { class: "rf-create-title", id: "rf-create-title" }, relayText("createQuest"));
  const createKicker = el("p", { class: "rf-region-label" }, relayText("newQuest"));
  const createSubmit = el("button", { type: "submit", class: "rf-primary-button rf-create-submit" }, relayText("createQuest"));
  const createCancel = el("button", { type: "button", class: "rf-secondary-button" }, relayText("dialogCancel"));
  const createClose = el(
    "button",
    { type: "button", class: "rf-icon-button rf-create-close", title: relayText("close") },
    el("span", { class: "rf-visually-hidden" }, relayText("close")),
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
      createField(() => t("task.title"), createTitle),
      createField(() => relayText("nextOperation"), createNextAction, () => relayText("optionalActionHint")),
      el(
        "div",
        { class: "rf-create-pair" },
        createField(() => t("task.date"), createDue),
        createField(() => relayText("minutesEstimate"), createEstimate),
      ),
      createField(() => t("task.assignee"), createAssignee, () => relayText("assigneeHint")),
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

  function refreshQuestEditorCopy(): void {
    createTitle.placeholder = relayText("questTitlePlaceholder");
    createNextAction.placeholder = relayText("nextActionPlaceholder");
    createKicker.textContent = relayText(editingQuestId === null ? "newQuest" : "editQuest");
    createHeading.textContent = relayText(editingQuestId === null ? "createQuest" : "editQuest");
    createSubmit.textContent = relayText(createSubmit.disabled ? "saving" : editingQuestId === null ? "createQuest" : "saveChanges");
    createCancel.textContent = relayText("dialogCancel");
    createClose.title = relayText("close");
    createClose.querySelector('.rf-visually-hidden')!.textContent = relayText("close");
  }

  function closeCreate(): void {
    if (createSubmit.disabled) return;
    if (createDialog.open) createDialog.close();
  }

  function openCreate(): void {
    if (screenWriteHeld()) return;
    editingQuestId = null;
    syncAgentAssigneeOptions();
    refreshQuestEditorCopy();
    createError.hidden = true;
    createError.textContent = "";
    if (!createDialog.open) createDialog.showModal();
    queueMicrotask(() => createTitle.focus());
  }

  function openEdit(quest: Quest): void {
    if (screenWriteHeld()) return;
    if (quest.humanRequest) { inbox.open(undefined, quest.id); return; }
    editingQuestId = quest.id;
    refreshQuestEditorCopy();
    createTitle.value = quest.title;
    createNextAction.value = quest.nextAction;
    createDue.value = quest.dueDate;
    createEstimate.value = String(quest.estimatedMinutes);
    syncAgentAssigneeOptions();
    createAssignee.value = quest.assignee.type === "self" ? "self" : quest.assignee.type === "human" ? ":current"
      : [...createAssignee.options].some(option => option.value === quest.assignee.id) ? quest.assignee.id : ":current";
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
    if (screenWriteHeld() || lifecycle.disposed) return;
    const title = createTitle.value.trim();
    if (title === "") {
      createError.textContent = relayText("questTitleRequired");
      createError.hidden = false;
      createTitle.focus();
      return;
    }
    if (runtime === null) {
      createError.textContent = relayText("demoSaveBlocked");
      createError.hidden = false;
      return;
    }

    const dueDate = createDue.value;
    const estimatedMinutes = Math.max(0, Math.min(1440, Number(createEstimate.value) || 0));
    const selectedAgent = sharedAgents.find((agent) => agent.agentId === createAssignee.value);
    const editing = editingQuestId !== null;
    const editedQuest = editingQuestId === null ? null : sharedQuests.find((quest) => quest.id === editingQuestId) ?? null;
    const sameAssignee = editedQuest !== null && (createAssignee.value === ":current" || editedQuest.assignee.type !== "human" && createAssignee.value === (editedQuest.assignee.type === "agent" ? editedQuest.assignee.id : "self"));
    const assigneePatch = sameAssignee ? null : editing
      ? selectedAgent === undefined
        ? { type: "self" as const, id: runtime.selfUid, label: sharedProfile?.displayName || t("task.assignee.self"), handoffState: "none" as const }
        : {
          type: "agent" as const,
          id: selectedAgent.agentId,
          label: selectedAgent.displayName,
          handoffState: selectedAgent.defaultHandoffState || "ready",
        }
      : selectedAgent === undefined ? null : {
        type: "agent" as const,
        id: selectedAgent.agentId,
        label: selectedAgent.displayName,
        handoffState: selectedAgent.defaultHandoffState || "ready",
      };
    const saveStarted = performance.now();
    createSubmit.disabled = true;
    createCancel.disabled = true;
    createClose.disabled = true;
    for (const input of createForm.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) input.disabled = true;
    refreshQuestEditorCopy();
    createError.hidden = true;

    try {
      const payload = {
        title,
        nextAction: createNextAction.value.trim(),
        estimatedMinutes,
        dueDate,
        ...(editing ? {} : {
          scheduledDate: dueDate,
          planningMode: dueDate === "" ? "on_date" : "until_due",
          planningState: dueDate === "" ? "backlog" : "scheduled",
        }),
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
      if (lifecycle.disposed) return;
      const value = response.quest;
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(relayText("saveUnverified"));
      }
      const created = value as Quest;
      if (typeof created.id !== "string" || created.id === "" || typeof created.title !== "string") {
        throw new Error(relayText("saveUnverified"));
      }

      sharedQuests = [created, ...sharedQuests.filter((quest) => quest.id !== created.id)];
      rawHandoffStates.set(created.id, created.assignee.handoffState);
      const normalized = normalizeCommandModel({
        profile: sharedProfile ?? { uid: runtime.selfUid },
        agents: sharedAgents,
        quests: sharedQuests,
        syncLabel: new Date().toLocaleTimeString(getLocale(), { hour: "2-digit", minute: "2-digit" }),
      });
      state.model = { ...normalized, chronicle: state.model.chronicle };
      state.selectedQuestId = created.id;
      shelfAlignedTo = null;
      createSubmit.disabled = false;
      closeCreate();
      render();
      announce(relayText(editing ? "questUpdated" : "questCreated"));
      reportGuiTiming(editing ? "edit" : "create", saveStarted, () => shell.isConnected);
    } catch (error) {
      if (lifecycle.disposed) return;
      createError.textContent = profileErrorMessage(error, relayText("questSaveFailed"));
      createError.hidden = false;
    } finally {
      if (lifecycle.disposed) return;
      createSubmit.disabled = false;
      createCancel.disabled = false;
      createClose.disabled = false;
      for (const input of createForm.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) input.disabled = false;
      refreshQuestEditorCopy();
    }
  }

  let editingAgentId: string | null = null;
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
    placeholder: relayText("agentRolePlaceholder"),
  });
  const agentInstructionsInput = el("textarea", {
    class: "rf-create-input",
    name: "instructions",
    maxlength: "4000",
    rows: "5",
    placeholder: relayText("agentInstructionsPlaceholder"),
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
    tabindex: -1,
  }) as HTMLInputElement;
  const agentAvatarImg = el("img", { class: "rf-agent-avatar-image", alt: "", hidden: true }) as HTMLImageElement;
  const agentAvatarFallback = el("span", { class: "rf-agent-avatar-fallback", "aria-hidden": "true" }, "?");
  agentAvatarImg.addEventListener("error", () => {
    agentAvatarImg.hidden = true;
    agentAvatarImg.removeAttribute("src");
    agentAvatarFallback.hidden = false;
  });
  const agentAvatarStatus = el("p", { class: "rf-agent-avatar-status", role: "status" });
  let agentAvatarCopy: (() => string) | null = null;
  const agentAvatarChoose = el("button", { type: "button", class: "rf-secondary-button" }, relayText("imageChoose"));
  agentAvatarChoose.addEventListener("click", () => agentAvatarInput.click());
  const agentAvatarField = el(
    "div",
    { class: "rf-agent-avatar-field" },
    el("span", { class: "rf-agent-avatar-preview" }, agentAvatarFallback, agentAvatarImg),
    el(
      "div",
      { class: "rf-agent-avatar-controls" },
      agentAvatarChoose,
      agentAvatarInput,
      agentAvatarStatus,
    ),
  );
  let pendingAgentAvatar: { readonly blob: Blob; readonly dataUrl: string } | null = null;
  let agentImageProcessing = false;
  agentAvatarInput.addEventListener("change", () => {
    const file = agentAvatarInput.files?.[0];
    agentAvatarInput.value = "";
    if (file === undefined || agentSubmit.disabled || lifecycle.disposed) return;
    agentImageProcessing = true;
    agentAvatarCopy = () => relayText("imageProcessing");
    setAgentBusy(true);
    void resizeAvatarImage(file).then((resized) => {
      if (lifecycle.disposed) return;
      pendingAgentAvatar = { blob: resized.blob, dataUrl: resized.dataUrl };
      agentAvatarImg.src = resized.dataUrl;
      agentAvatarImg.hidden = false;
      agentAvatarFallback.hidden = true;
      agentAvatarCopy = () => relayText("imagePending");
    }).catch((error: unknown) => {
      if (lifecycle.disposed) return;
      agentAvatarCopy = () => error instanceof AvatarImageError ? error.message : relayText("imageReadError");
    }).finally(() => {
      if (!lifecycle.disposed) { agentImageProcessing = false; setAgentBusy(false); }
    });
  });

  const agentError = el("p", { class: "rf-create-error", role: "alert", hidden: true });
  let agentErrorCopy: (() => string) | null = null;
  function showAgentError(copy: () => string): void {
    agentErrorCopy = copy;
    agentError.textContent = copy();
    agentError.hidden = false;
  }
  const agentHeading = el("h2", { class: "rf-create-title", id: "rf-agent-title" }, relayText("agentRegister"));
  const agentKicker = el("p", { class: "rf-region-label" }, relayText("agentNew"));
  const agentSubmit = el("button", { type: "submit", class: "rf-primary-button rf-create-submit" }, relayText("agentRegister"));
  const agentCancel = el("button", { type: "button", class: "rf-secondary-button" }, relayText("dialogCancel"));
  const agentClose = el(
    "button",
    { type: "button", class: "rf-icon-button rf-create-close", title: relayText("close") },
    el("span", { class: "rf-visually-hidden" }, relayText("close")),
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
      createField("Agent ID", agentIdInput, () => relayText("agentIdHint")),
      createField(() => t("social.displayName"), agentNameInput),
      agentAvatarField,
      el(
        "div",
        { class: "rf-create-pair" },
        createField("Provider", agentProviderInput),
        createField(() => t("character.role"), agentRoleInput),
      ),
      createField(() => relayText("agentInstructions"), agentInstructionsInput, () => relayText("agentNoSecrets")),
      createField(() => relayText("agentDefaultHandoff"), agentHandoffInput),
      createField(() => relayText("agentScopesLabel"), agentScopesInput, () => relayText("agentScopesHint")),
      createField(() => relayText("status"), agentStatusInput, () => relayText(editingAgentId === null ? "agentStartsActive" : "agentDisabledHint")),
      el(
        "div",
        { class: "rf-create-pair" },
        createField(() => relayText("agentReviewRequired"), agentReviewInput),
        createField(() => relayText("agentDryRunDefault"), agentDryRunInput),
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
  let agentDialogReturnFocus: HTMLElement | null = null;

  function refreshAgentEditorCopy(): void {
    for (const refresh of editorLabels) refresh();
    agentKicker.textContent = relayText(editingAgentId === null ? "agentNew" : "agentEdit");
    agentHeading.textContent = relayText(editingAgentId === null ? "agentRegister" : "agentEdit");
    agentSubmit.textContent = relayText(agentImageProcessing ? "imageProcessing" : agentSubmit.disabled ? "saving" : editingAgentId === null ? "agentRegister" : "saveChanges");
    agentCancel.textContent = relayText("dialogCancel");
    agentClose.title = relayText("close");
    agentClose.querySelector('.rf-visually-hidden')!.textContent = relayText("close");
    agentAvatarChoose.textContent = relayText("imageChoose");
    agentRoleInput.placeholder = relayText("agentRolePlaceholder");
    agentInstructionsInput.placeholder = relayText("agentInstructionsPlaceholder");
    for (const option of agentHandoffInput.options) option.textContent = t(`task.handoffStates.${option.value}`);
    for (const option of agentStatusInput.options) option.textContent = relayText(option.value === "active" ? "agentActive" : "disabled");
    agentStatusInput.disabled = agentSubmit.disabled || editingAgentId === null;
    agentAvatarStatus.textContent = agentAvatarCopy?.() ?? "";
    if (!agentError.hidden && agentErrorCopy !== null) agentError.textContent = agentErrorCopy();
  }

  function setAgentBusy(busy: boolean): void {
    for (const control of [agentSubmit, agentCancel, agentClose, agentAvatarChoose, agentAvatarInput]) control.disabled = busy;
    for (const input of agentForm.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")) input.disabled = busy || (input === agentIdInput && editingAgentId !== null);
    refreshAgentEditorCopy();
  }

  function closeAgentDialog(): void {
    if (agentSubmit.disabled) return;
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
    agentErrorCopy = null;
    pendingAgentAvatar = null;
    agentAvatarCopy = null;
    agentAvatarImg.hidden = true;
    agentAvatarImg.removeAttribute("src");
    agentAvatarFallback.hidden = false;
    agentAvatarStatus.textContent = "";
  }

  function openCreateAgent(): void {
    if (runtime === null || screenWriteHeld()) return;
    agentDialogReturnFocus = document.activeElement as HTMLElement | null;
    editingAgentId = null;
    resetAgentDialog();
    refreshAgentEditorCopy();
    if (!agentDialog.open) agentDialog.showModal();
    queueMicrotask(() => agentIdInput.focus());
  }

  function openEditAgent(agentId: string): void {
    if (runtime === null || screenWriteHeld()) return;
    const agent = sharedAgents.find((entry) => entry.agentId === agentId);
    if (agent === undefined) return;
    agentDialogReturnFocus = document.activeElement as HTMLElement | null;
    editingAgentId = agent.agentId;
    resetAgentDialog();
    refreshAgentEditorCopy();
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
      el("option", { value: "self" }, sharedProfile?.displayName || t("task.assignee.self")),
      ...sharedAgents
        .filter((agent) => agent.status !== "archived" && agent.status !== "disabled")
        .map((agent) => el("option", { value: agent.agentId }, `${agent.displayName} · Agent`)),
    );
    const editing = sharedQuests.find(quest => quest.id === editingQuestId);
    if (editing && (editing.assignee.type === "human" || editing.assignee.type === "agent" && ![...createAssignee.options].some(option => option.value === editing.assignee.id))) {
      createAssignee.append(el("option", { value: ":current" }, `${editing.assignee.label} · ${editing.assignee.type === "human" ? "Human" : "Agent"}`));
    }
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
    if (runtime === null || screenWriteHeld() || lifecycle.disposed) return;
    const agentId = agentIdInput.value.trim().toLowerCase();
    const displayName = agentNameInput.value.trim();
    if (editingAgentId === null && (agentId.length > 80 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(agentId))) {
      showAgentError(() => relayText("agentIdInvalid"));
      agentIdInput.focus();
      return;
    }
    if (displayName === "") {
      showAgentError(() => relayText("displayNameRequired"));
      agentNameInput.focus();
      return;
    }
    const existing = editingAgentId === null ? null : sharedAgents.find((agent) => agent.agentId === editingAgentId) ?? null;
    setAgentBusy(true);
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
      if (lifecycle.disposed) return;
      const normalizedSaved = normalizeAgentRecord(response.agent);
      if (normalizedSaved === null) throw new Error(relayText("saveUnverified"));
      let saved = withCachedAvatar(normalizedSaved);

      /* Metadata is already saved at this point. The avatar is a second,
       * independent write against the same conflict guard (`updatedAt`), so a
       * failure here must not roll back or hide the successful save — it
       * leaves the dialog open on the avatar step so the user can retry just
       * the image, instead of losing the Agent ID / role / scopes they just
       * entered (brief Phase 3, "古い編集画面から新しい画像を上書きしない"). */
      let avatarWarning: "avatarRefreshHint" | "agentImageConflict" | "agentImageFailed" | null = null;
      const previousAvatarKey = existing?.hasCustomAvatar === true
        ? avatarCacheKey(existing.agentId, existing.avatarVersion ?? 0)
        : null;
      if (pendingAgentAvatar !== null) {
        try {
          const avatarResponse = await runtime.agentAvatarPort.uploadAgentAvatar(saved.agentId, pendingAgentAvatar.blob, saved.updatedAt);
          if (lifecycle.disposed) return;
          const updated = normalizeAgentRecord(avatarResponse.agent);
          if (updated !== null) saved = updated;
          pendingAgentAvatar = null;
          agentAvatarCopy = null;
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
            avatarWarning = "avatarRefreshHint";
          }
        } catch (avatarError) {
          const apiError = avatarError as { status?: number; code?: string };
          avatarWarning = apiError.status === 409 || apiError.code === "agent_conflict"
            ? "agentImageConflict"
            : "agentImageFailed";
        }
      }

      // The metadata save itself already reached the server; only the local
      // state application below needs to be skipped for a disposed mount.
      if (lifecycle.disposed) return;
      sharedAgents = [saved, ...sharedAgents.filter((agent) => agent.agentId !== saved!.agentId)];
      const profile = sharedProfile ?? { uid: runtime.selfUid };
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
        const warningKey = avatarWarning;
        showAgentError(() => relayText(warningKey));
        announce(relayText(warningKey));
      } else {
        agentSubmit.disabled = false;
        closeAgentDialog();
        announce(relayText("agentSaved").replace("{name}", saved.displayName));
      }
      render();
      refreshAgentAvatars();
    } catch (error) {
      const apiError = error as { status?: number; code?: string };
      if (lifecycle.disposed) return;
      showAgentError(() => apiError.code === "agent_exists" ? relayText("agentExists")
        : apiError.code === "agent_conflict" ? relayText("agentConflict")
        : profileErrorMessage(error, relayText("agentSaveFailed")));
    } finally {
      if (lifecycle.disposed) return;
      setAgentBusy(false);
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
    "aria-label": relayText("accountMenu"),
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
      announce(relayText("signOutFailed"));
    }
  }

  /** Rebuilds the trigger's content and the menu's items from current state. */
  function renderAccountMenu(): void {
    const selfActor = [...state.model.actors.values()].find((actor) => actor.kind === "human") ?? null;
    const displayName = sharedProfile?.displayName?.trim() || (production ? t("task.assignee.self") : relayText("demoLabel"));
    accountMenuButton.setAttribute("aria-expanded", state.accountMenuOpen ? "true" : "false");
    accountMenuButton.setAttribute("aria-label", `${relayText("accountMenu")} (${displayName})`);
    accountMenuButton.title = displayName;
    replaceChildren(
      accountMenuButton,
      selfActor === null
        ? el("span", { class: "rf-identity-initials" }, initialsFor(displayName))
        : actorAvatar(selfActor, { size: "row", showMarker: false }),
    );

    const accountItem = el("button", { type: "button", class: "rf-account-menu-item" }, relayText("accountTitle"));
    accountItem.addEventListener("click", () => openSettings("account"));
    const settingsItem = el("button", { type: "button", class: "rf-account-menu-item" }, relayText("settings"));
    settingsItem.addEventListener("click", () => openSettings("top"));
    const signOutItem = el(
      "button",
      {
        type: "button",
        class: "rf-account-menu-item rf-account-menu-item--danger",
        disabled: production ? null : true,
      },
      t("sync.signOut"),
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
          : el("p", { class: "rf-account-menu-demo" }, relayText("demoHint")),
      ),
      el("div", { class: "rf-account-menu-items" }, accountItem, settingsItem,
        production ? signOutItem : el("a", { class: "rf-account-menu-item", href: window.location.pathname }, relayText("signIn"))),
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
  let decisionQuestId: string | null = null;
  let taskQuestId: string | null = null;
  let revisionSelection = state.selectedQuestId;
  let inputComposing = false;

  function decisionFeedback(): DecisionResult {
    return decisionQuestId === state.selectedQuestId ? state.decision : IDLE_DECISION;
  }
  function resultTone(): "success" | "error" | null {
    if (state.decision.phase === "submitting" || state.taskSubmitting) return null;
    const decision = decisionFeedback();
    if (decision.phase === "succeeded") return "success";
    if (decision.phase === "failed" && decision.code !== "blocked") return "error";
    return taskQuestId === state.selectedQuestId ? state.taskTone : null;
  }
  function resultMessage(): string {
    if (state.decision.phase === "submitting") return decisionQuestId === state.selectedQuestId ? relayText("sending") : "";
    const decision = decisionFeedback();
    if (decision.phase === "succeeded" || decision.phase === "failed") return decision.message;
    return taskQuestId === state.selectedQuestId ? state.taskMessage() : "";
  }
  let humanPending = 0;
  let humanUnread = 0;
  let inboxInitialized = false;
  const inbox = humanInbox({
    quests: sharedQuests,
    port: runtime?.humanRequestPort ?? null,
    writeHeld: screenWriteHeld,
    onBusy: (busy) => { humanResponseBusy = busy; render(); },
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
    if (state.decision.phase === "submitting" || state.taskSubmitting) return;
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
    rebuildQuestModel();
  }

  function rebuildQuestModel(): void {
    if (runtime === null) return;
    const normalized = normalizeCommandModel({
      profile: sharedProfile ?? { uid: runtime.selfUid },
      agents: sharedAgents,
      quests: sharedQuests,
      syncLabel: new Date().toLocaleTimeString(getLocale(), { hour: "2-digit", minute: "2-digit" }),
    });
    state.model = { ...normalized, chronicle: state.model.chronicle };
    if (!state.model.quests.some((entry) => entry.id === state.selectedQuestId)) {
      state.selectedQuestId = state.model.interventions[0]?.questId ?? state.model.quests[0]?.id ?? null;
    }
  }

  async function runQuestAction(action: QuestActionId): Promise<void> {
    const quest = selectedRawQuest();
    if (action === "reply" && quest?.humanRequest) { inbox.open(undefined, quest.id); return; }
    if (quest === null || runtime === null || screenWriteHeld() || lifecycle.disposed) return;
    if (!questActionState(quest).actions.includes(action)) return;
    if (action === "edit") { openEdit(quest); return; }
    if (action === "archive" && !window.confirm(relayText("archiveConfirm").replace("{title}", quest.title))) return;

    const patch: Record<string, unknown> = action === "complete"
      ? { lifecycleState: "completed" }
      : action === "archive"
        ? { lifecycleState: "archived" }
        : {
          assignee: { ...quest.assignee, handoffState: action === "start" ? "working" : "none" },
          ...(action === "start" ? { handoff: { ...quest.handoff, startedAt: quest.handoff.startedAt || new Date().toISOString() } } : {}),
        };
    const actionStarted = performance.now();
    taskQuestId = quest.id;
    state.decision = IDLE_DECISION;
    state.taskSubmitting = true;
    state.taskMessage = () => relayText(action === "complete" ? "completingQuest" : "savingQuest");
    state.taskTone = null;
    render();
    try {
      const response = action === "complete"
        ? await runtime.questPort.scoreQuest(quest.id)
        : await runtime.questPort.updateQuest(quest.id, patch);
      if (lifecycle.disposed) return;
      const value = response.quest;
      if (value === null || typeof value !== "object" || Array.isArray(value) || (value as Quest).id !== quest.id) throw { code: "save_unverified" };
      applyQuestRecord(value as Quest);
      state.taskTone = "success";
      state.taskMessage = () => relayText(action === "start" ? "questStarted"
        : action === "stop" ? "questStopped"
          : action === "complete" ? "questCompleted" : "questArchived");
      announce(state.taskMessage());
      if (action === "complete") {
        battleMutation += 1;
        await refreshBattleSession();
      }
    } catch (error) {
      if (lifecycle.disposed) return;
      state.taskTone = "error";
      state.taskMessage = () => profileErrorMessage(error, relayText("questSaveFailed"));
      announce(state.taskMessage());
    } finally {
      state.taskSubmitting = false;
      render();
      if (!lifecycle.disposed && action === "complete" && state.taskTone === "success") reportGuiTiming("complete", actionStarted, () => shell.isConnected);
    }
  }

  async function refreshBattleSession(): Promise<boolean> {
    if (lifecycle.disposed) return false;
    const version = ++battleMutation;
    if (!runtime) { battleSession = fixtureBattlePort.session(); return true; }
    try {
      const latest = await runtime.questPort.getBattleSession();
      if (lifecycle.disposed || version !== battleMutation) return false;
      validateBattleSession(latest.session);
      battleSession = latest.session;
      battleLoadError = null;
      deferredPanelErrors = deferredPanelErrors.filter(entry => entry.index !== 1);
      return true;
    } catch {
      if (!lifecycle.disposed && version === battleMutation) battleLoadError = relayText("loadFailed");
      return false;
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
    shelfAlignedTo = null;
    keepScroll = false;
    render();
    keepScroll = true;
    // Selection moves focus back to the equivalent control in the new tree so
    // keyboard users are not dropped at the document root.
    const nextLoom = workfield.querySelector<HTMLElement>(".rf-spine-list");
    const restored = triggerWasInLoom
      ? [...(nextLoom?.querySelectorAll<HTMLElement>(".rf-spine-row") ?? [])]
          .find((row) => row.dataset.questId === questId) ?? null
      : (isMobile() ? mobileRegion : shell).querySelector<HTMLElement>(`[data-quest-id="${CSS.escape(questId)}"]`);
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
        title: relayText("commandFlow"),
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
        ? relayText("actionPermission")
        : null,
      conflict: forcedState === "conflict"
        ? relayText("handoffConflict")
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
    if (questId === null || screenWriteHeld() || lifecycle.disposed) return;
    if (selectedQuestActions().mode !== "handoff-decision") return;
    decisionQuestId = questId;
    state.revisionError = null;
    const result = await submitDecision(
      handoffPort,
      { kind, questId, expectedState: expectedStateFor(questId), reason: state.revisionReason },
      decisionGate(),
      state.decision.phase,
      (next) => {
        if (lifecycle.disposed) return;
        state.decision = next;
        if (next.code === "reason_required") state.revisionError = next.message;
        render();
      },
    );
    if (lifecycle.disposed) return;
    if (result.phase === "succeeded" && result.quest !== null) {
      applyHandoffResult(result, kind);
    }
    render();
    announce(result.message);
    if (state.selectedQuestId !== questId || state.domain !== "command") return;
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
      profile: sharedProfile ?? (runtime ? { uid: runtime.selfUid } : null),
      agents: sharedAgents,
      quests: sharedQuests,
      syncLabel: state.model.lastSyncLabel,
    });
    state.model = { ...normalized, chronicle: state.model.chronicle };
    if (state.selectedQuestId !== quest.id) return;
    checkedReview = null;
    taskQuestId = quest.id;
    state.taskTone = "success";
    state.taskMessage = () => result.message;
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
    if (state.decision.phase === "submitting" || state.taskSubmitting) return;
    if (state.lensState === "closed") state.lensState = "open";
    state.revisionOpen = true;
    state.decision = IDLE_DECISION;
    state.taskTone = null;
    state.taskMessage = () => "";
    render();
    const field = (isMobile() ? mobileDecision : lensRegion).querySelector<HTMLElement>(".rf-revision-input");
    field?.focus();
    field?.scrollIntoView({ block: "nearest" });
  }

  function cancelRevision(): void {
    if (state.decision.phase === "submitting" || state.taskSubmitting) return;
    state.revisionOpen = false;
    state.revisionReason = "";
    state.revisionError = null;
    render();
    (isMobile() ? mobileDecision : lensRegion).querySelector<HTMLElement>(".rf-decision-approve")?.focus();
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
    const apiError = error as { status?: number; code?: string };
    if (apiError.status === 401) return relayText("sessionExpired");
    if (apiError.code === "handle_cooldown") return relayText("handleCooldown");
    if (apiError.code === "handle_taken") return relayText("handleTaken");
    if (apiError.code === "save_unverified") return relayText("saveUnverified");
    if (error instanceof AvatarImageError) return error.message;
    return fallback;
  }

  function updateProfileDraft(field: ProfileDraftField, value: string): void {
    const draft = currentProfileDraft();
    state.screens.settings.profileDraft = { ...draft, [field]: value };
  }

  async function retryProfile(): Promise<void> {
    if (runtime === null || state.screens.settings.profileSaving || state.screens.settings.avatarSaving) return;
    state.screens.settings.profileMessage = () => "";
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
      profileLoadError = profileErrorMessage(error, relayText("profileLoadFailed"));
      render();
    }
  }

  async function saveProfile(): Promise<void> {
    const settings = state.screens.settings;
    if (screenWriteHeld() || lifecycle.disposed) return;
    if (runtime === null) {
      settings.profileTone = "error";
      settings.profileMessage = () => relayText("demoSaveBlocked");
      render();
      return;
    }
    const draft = currentProfileDraft();
    const displayName = draft.displayName.trim();
    const handle = draft.handle.trim().replace(/^@+/, "").toLowerCase();
    const bio = draft.bio.trim();
    if (displayName.length < 1 || displayName.length > 60) {
      settings.profileTone = "error";
      settings.profileMessage = () => `${t("social.displayName")}: ${relayText("displayNameHint")}`;
      render();
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
      settings.profileTone = "error";
      settings.profileMessage = () => `${relayText("username")}: ${relayText("handleHint")}`;
      render();
      return;
    }
    if (bio.length > 160) {
      settings.profileTone = "error";
      settings.profileMessage = () => `${t("social.bio")}: ${relayText("bioHint")}`;
      render();
      return;
    }
    settings.profileSaving = true;
    settings.profileMessage = () => "";
    settings.profileTone = null;
    render();
    try {
      const response = await runLifecycleStep(lifecycle, () => runtime!.profilePort.updateProfile({ displayName, handle, bio }));
      if (response.status === "disposed") return;
      const updated = profileFromResponse(response.value.profile);
      if (updated === null) throw new Error(relayText("saveUnverified"));
      profileLoadError = null;
      sharedProfile = updated;
      settings.profileDraft = null;
      syncProfileActors();
      settings.profileTone = "success";
      settings.profileMessage = () => relayText("profileSaved");
      announce(relayText("profileSaved"));
      render();
      refreshProfileAvatar();
    } catch (error) {
      if (lifecycle.disposed) return;
      settings.profileTone = "error";
      settings.profileMessage = () => profileErrorMessage(error, relayText("profileSaveFailed"));
    } finally {
      if (lifecycle.disposed) return;
      settings.profileSaving = false;
      render();
    }
  }

  /** Reused by the Account section and the account menu's own avatar. */
  async function saveProfileAvatar(file: File): Promise<void> {
    const settings = state.screens.settings;
    if (screenWriteHeld() || lifecycle.disposed) return;
    if (runtime === null) {
      settings.avatarTone = "error";
      settings.avatarMessage = () => relayText("demoSaveBlocked");
      render();
      return;
    }
    if (sharedProfile === null) {
      settings.avatarTone = "error";
      settings.avatarMessage = () => relayText("profileSetupHint");
      render();
      return;
    }
    settings.avatarSaving = true;
    settings.avatarProgress = 0;
    settings.avatarMessage = () => "";
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
        throw new Error(relayText("saveUnverified"));
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
        settings.avatarMessage = () => relayText("avatarUpdated");
        announce(relayText("avatarUpdated"));
      } catch {
        settings.avatarTone = "success";
        settings.avatarMessage = () => relayText("avatarRefreshHint");
      }
    } catch (error) {
      if (lifecycle.disposed) return;
      settings.avatarTone = "error";
      settings.avatarMessage = () => committed
        ? relayText("avatarRefreshHint")
        : profileErrorMessage(error, relayText("avatarSaveFailed"));
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
    if (runtime === null || sharedProfile === null || sharedProfile.hasCustomAvatar !== true || screenWriteHeld()) return;
    settings.avatarSaving = true;
    settings.avatarProgress = null;
    settings.avatarMessage = () => "";
    settings.avatarTone = null;
    render();
    try {
      const response = await runLifecycleStep(lifecycle, () => runtime!.profileAvatarPort.deleteProfileAvatar());
      if (response.status === "disposed") return;
      const updated = normalizeProfileRecord(response.value.profile);
      if (updated === null) throw new Error(relayText("saveUnverified"));
      clearProfileAvatarCache();
      if (profilePreviewUrl !== null) {
        URL.revokeObjectURL(profilePreviewUrl);
        profilePreviewUrl = null;
      }
      sharedProfile = updated;
      syncProfileActors();
      settings.avatarTone = "success";
      settings.avatarMessage = () => relayText("avatarRemoved");
      announce(relayText("avatarRemoved"));
    } catch (error) {
      if (lifecycle.disposed) return;
      settings.avatarTone = "error";
      settings.avatarMessage = () => profileErrorMessage(error, relayText("avatarRemoveFailed"));
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
      settings.mcpCopyMessage = () => relayText("mcpUrlMissing");
      render();
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      settings.mcpCopyTone = "success";
      settings.mcpCopyMessage = () => relayText("copied");
    } catch {
      settings.mcpCopyTone = "error";
      settings.mcpCopyMessage = () => relayText("copyFailed");
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
      mcpToolsLoadError = profileErrorMessage(error, relayText("loadFailed"));
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
      agentConnectionsLoadError = profileErrorMessage(error, relayText("mcpListFailed"));
    } finally {
      if (lifecycle.disposed) return;
      agentConnectionsLoading = false;
      render();
    }
  }

  function openAgentPicker(clientId: string): void {
    const row = sharedAgentConnections.find((connection) => connection.clientId === clientId);
    state.screens.settings.connectionDrafts[clientId] = row?.linkedAgentId ?? "";
    state.screens.settings.connectionMessage = () => "";
    state.screens.settings.connectionTone = null;
    render();
    const card = connectionCard(clientId);
    (card?.querySelector<HTMLButtonElement>('.rf-set-agent-picker button[aria-pressed="true"]') ?? card?.querySelector<HTMLButtonElement>('.rf-set-agent-picker button'))?.focus({ preventScroll: true });
  }

  function connectionCard(clientId: string): HTMLElement | null {
    return screenHost.querySelector<HTMLElement>(`.rf-set-connection-card[data-client-id="${CSS.escape(clientId)}"]`);
  }

  function cancelAgentPicker(clientId: string): void {
    if (state.screens.settings.connectionBusyId === clientId) return;
    delete state.screens.settings.connectionDrafts[clientId];
    render();
    connectionCard(clientId)?.querySelector<HTMLButtonElement>('.rf-set-connection-actions button')?.focus({ preventScroll: true });
  }

  function selectConnectionAgent(clientId: string, agentId: string): void {
    if (state.screens.settings.connectionBusyId === clientId) return;
    state.screens.settings.connectionDrafts[clientId] = agentId;
    render();
    const card = connectionCard(clientId);
    card?.querySelector<HTMLButtonElement>(`button[data-agent-id="${CSS.escape(agentId)}"]`)?.focus({ preventScroll: true });
  }

  async function linkAgent(clientId: string, agentId: string): Promise<void> {
    const settings = state.screens.settings;
    if (runtime === null || agentId === "" || screenWriteHeld()) return;
    settings.connectionBusyId = clientId;
    settings.connectionMessage = () => "";
    settings.connectionTone = null;
    render();
    try {
      await runLifecycleStep(lifecycle, () => runtime!.agentConnectionPort.linkAgentConnection(agentId, clientId));
      await refreshAgentConnections();
      delete settings.connectionDrafts[clientId];
      settings.connectionTone = "success";
      settings.connectionMessage = () => relayText("agentLinked");
      announce(relayText("agentLinked"));
    } catch (error) {
      if (lifecycle.disposed) return;
      settings.connectionTone = "error";
      settings.connectionMessage = () => profileErrorMessage(error, relayText("agentLinkFailed"));
    } finally {
      if (lifecycle.disposed) return;
      settings.connectionBusyId = null;
      render();
      const card = connectionCard(clientId);
      (card?.querySelector<HTMLButtonElement>('.rf-set-agent-picker-actions button') ?? card?.querySelector<HTMLButtonElement>('.rf-set-connection-actions button'))?.focus({ preventScroll: true });
    }
  }

  async function unlinkAgent(clientId: string, agentId: string): Promise<void> {
    const settings = state.screens.settings;
    if (runtime === null || agentId === "" || screenWriteHeld()) return;
    settings.connectionBusyId = clientId;
    settings.connectionMessage = () => "";
    settings.connectionTone = null;
    render();
    try {
      await runLifecycleStep(lifecycle, () => runtime!.agentConnectionPort.unlinkAgentConnection(agentId, clientId));
      await refreshAgentConnections();
      delete settings.connectionDrafts[clientId];
      settings.connectionTone = "success";
      settings.connectionMessage = () => relayText("agentUnlinked");
      announce(relayText("agentUnlinked"));
    } catch (error) {
      if (lifecycle.disposed) return;
      settings.connectionTone = "error";
      settings.connectionMessage = () => profileErrorMessage(error, relayText("agentUnlinkFailed"));
    } finally {
      if (lifecycle.disposed) return;
      settings.connectionBusyId = null;
      render();
    }
  }

  async function revokeMcpConnection(clientId: string): Promise<void> {
    const settings = state.screens.settings;
    if (runtime === null || clientId === "" || screenWriteHeld()) return;
    settings.connectionBusyId = clientId;
    settings.connectionMessage = () => "";
    settings.connectionTone = null;
    render();
    try {
      await runLifecycleStep(lifecycle, () => runtime!.agentConnectionPort.revokeMcpConnection(clientId));
      await refreshAgentConnections();
      delete settings.connectionDrafts[clientId];
      settings.connectionTone = "success";
      settings.connectionMessage = () => relayText("mcpRevoked");
      announce(relayText("mcpRevoked"));
    } catch (error) {
      if (lifecycle.disposed) return;
      settings.connectionTone = "error";
      settings.connectionMessage = () => profileErrorMessage(error, relayText("mcpRevokeFailed"));
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
              title: domain.label,
              disabled: domain.migrated ? null : true,
            },
            el("span", { class: "rf-nav-glyph", "data-domain": domain.id, "aria-hidden": "true" }),
            el("span", { class: "rf-nav-label" }, domain.label),
            domain.id === "command"
              ? el("span", { class: "rf-nav-attention" }, String(state.model.interventions.length))
              : null,

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
              const overflowActive = state.domain === "settings"
                || MOBILE_OVERFLOW.some((domain) => domain.id === state.domain);
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
          (() => {
            if (!production) return el("li", null,
              el("p", { class: "rf-demo-label" }, relayText("demoHint")),
              el("a", { class: "rf-nav-item", href: window.location.pathname }, relayText("signIn")));
            const signOut = el("button", { type: "button", class: "rf-nav-item" }, t("sync.signOut"));
            signOut.addEventListener("click", () => { void handleSignOut(); });
            return el("li", null, signOut);
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
            { type: "button", class: "rf-rail-utility", title: relayText(state.railCollapsed ? "expandRail" : "collapseRail"), "aria-expanded": String(!state.railCollapsed) },
            el("span", { class: "rf-nav-label" }, relayText(state.railCollapsed ? "expandRail" : "collapseRail")),
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
      { type: "button", class: "rf-search-trigger", title: relayText("questSearch") },
      el("span", { class: "rf-search-glyph", "aria-hidden": "true" }),
      el("span", { class: "rf-search-copy" }, relayText("questSearch")),
      el("kbd", { class: "rf-kbd" }, /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"),
    );
    search.addEventListener("click", openQuestSearch);
    replaceChildren(
      operationBar,
      el(
        "div",
        { class: "rf-operation-left" },
        el("h1", { class: "rf-page-title" }, domainLabel(state.domain)),
        production ? null : el("span", { class: "rf-demo-label", role: "status", title: relayText("demoHint") }, relayText("demoLabel")),
      ),
      el("div", { class: "rf-operation-center" }, search),
      el(
        "div",
        { class: "rf-operation-right" },
        el("button", { type: "button", class: "rf-primary-button rf-create", disabled:screenWriteHeld() }, relayText("createQuest")),
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
    const slots = runtime ? state.model.capacity.map(slot => slot.id === "health" ? { ...slot, value:`${workspaceOffline ? relayText("statusOffline") : state.model.syncState === "error" ? relayText("statusError") : state.model.syncState === "synced" && deferredPanelErrors.length > 0 ? relayText("statusPartial") : t(`sync.${state.model.syncState}`)} · ${state.model.lastSyncLabel}`, tone:state.model.syncState === "error" ? "danger" as const : slot.tone } : slot) : state.stale ? fixtureCapacityStale : fixtureCapacity;
    replaceChildren(
      bandRegion,
      capacityBand(slots, {
        expandHealth: state.stale,
        onSelect: (slot: CapacitySlot) => {
          if (slot.filter === "health") {
            if (runtime) { void refreshWorkspace(); return; }
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
  let previewReturnControl: string | null = null;

  function buildLoom(inSheet: boolean): HTMLElement {
    return questLoom(state.model.quests, {
      listId: inSheet ? "rf-sheet-loom" : "rf-command-loom",
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
          el("p", { class: "rf-state-title" }, relayText("shellChooseQuest")),
          el("p", { class: "rf-state-body" }, relayText("shellChooseHint")),
        ),
      )
      : selectedQuestWorkspace(view, state.model.actors, {
        writeLocked: screenWriteHeld(),
        pendingMessage: state.taskSubmitting && taskQuestId === state.selectedQuestId ? state.taskMessage() : undefined,
        resultMessage: taskQuestId === state.selectedQuestId && !state.taskSubmitting ? state.taskMessage() : undefined,
        resultTone: taskQuestId === state.selectedQuestId && !state.taskSubmitting ? state.taskTone : null,
        previewArtifactId: state.previewArtifactId,
        /* Evidence inspection only. The final decision lives in the Lens
         * Decision Bar (v2 section 7.4), so these never share a command. */
        onReviewOutput: (artifactId) => {
          previewReturnControl = document.activeElement?.getAttribute("data-command-control") ?? null;
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
          workfield.querySelector<HTMLElement>(previewReturnControl === null ? ".rf-review-button" : `[data-command-control="${CSS.escape(previewReturnControl)}"]`)?.focus();
          previewReturnControl = null;
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
      el(
          "div",
          { class: "rf-chronicle-expanded", id:"rf-command-history", hidden:!state.chronicleExpanded },
          executionChronicle(chronicleForSelection(), state.model.actors),
        ),
    );
  }

  function renderLens(): void {
    const view = selectedView();
    const content = view === null ? null : { intervention: selectedIntervention(), view };
    replaceChildren(
      lensRegion,
      interventionLens(state.lensState === "closed" ? null : content, state.model.actors, {
        state: state.lensState,
        writeLocked: screenWriteHeld(),
        blockedReason: blockingReason(decisionGate(), state.decision.phase),
        submitting: state.decision.phase === "submitting" || state.taskSubmitting,
        verification: verificationSummary(),
        revisionOpen: state.revisionOpen,
        revisionReason: state.revisionReason,
        revisionError: state.revisionError,
        resultTone: resultTone(),
        resultMessage: resultMessage(),
        onClose: closeLens,
        onTogglePin: () => {
          state.lensState = state.lensState === "pinned" ? "open" : "pinned";
          render();
        },
        externalChecked: decisionGate().evidenceReviewed,
        onExternalChecked: setExternalChecked,
        onApprove: () => { void runDecision("approve"); },
        onOpenRevision: focusRevision,
        onCancelRevision: cancelRevision,
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
      writeLocked: screenWriteHeld(),
      syncState: state.stale || state.model.syncState === "synced" && deferredPanelErrors.length > 0 ? "stale" : state.model.syncState,
      blockedReason: blockingReason(decisionGate(), state.decision.phase),
      verification: verificationSummary(),
      revisionOpen: state.revisionOpen,
      revisionReason: state.revisionReason,
      revisionError: state.revisionError,
      resultTone: resultTone(),
      resultMessage: resultMessage(),
      submitting: state.decision.phase === "submitting" || state.taskSubmitting,
      permissionMissing: forcedState === "permission"
        ? relayText("actionPermission")
        : null,
      conflict: forcedState === "conflict"
        ? relayText("handoffConflict")
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
    if (state.selectedQuestId === shelfAlignedTo) return;
    const card = track.querySelector<HTMLElement>(`.rf-m-shelf-card[data-quest-id="${CSS.escape(state.selectedQuestId)}"]`);
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
  }

  function renderMobile(): void {
    if (!isMobile()) {
      shelfAlignedTo = null;
      replaceChildren(mobileRegion);
      replaceChildren(mobileDecision);
      return;
    }
    const snapshot = mobileState();
    const track = mobileRegion.querySelector<HTMLElement>(".rf-m-shelf-track");
    const shelfScroll = snapshot.selectedQuestId === shelfAlignedTo ? track?.scrollLeft : undefined;
    const callbacks = {
      onSelect: select,
      onOpenQuestFlow: openQuestFlow,
      onToggleEvidence: () => {
        if (!snapshot.view?.evidence.find(artifact => artifact.primary)?.preview) return;
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
      onRefreshWorkspace: runtime?.refreshWorkspace ? () => { void refreshWorkspace(); } : undefined,
      onApprove: () => { void runDecision("approve"); },
      onRequestRevision: focusRevision,
      onRevisionInput: (value: string) => { state.revisionReason = value; },
      onSubmitRevision: () => { void runDecision("revise"); },
      onQuestAction: (action: QuestActionId) => { void runQuestAction(action); },
      onCancelRevision: cancelRevision,
    };
    replaceChildren(mobileRegion, mobileCommand(snapshot, callbacks));
    replaceChildren(mobileDecision, mobileDecisionBar(snapshot.view, snapshot, callbacks));
    if (shelfScroll !== undefined) mobileRegion.querySelector<HTMLElement>(".rf-m-shelf-track")?.scrollTo({ left:shelfScroll });
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
      writeLocked: screenWriteHeld(),
      onSelectQuest: (questId: string) => {
        state.selectedQuestId = questId;
        render();
      },
      onNavigate: (domain: string, questId?: string) => {
        const target = DOMAINS.find((entry) => entry.id === domain);
        if (target === undefined) return;
        if (questId !== undefined) {
          if (target.id === "party") {
            state.screens.party.selectedActorId = questId;
            state.screens.party.filter = "all";
            state.screens.party.mobileDetailOpen = true;
          } else if (target.id === "connections") {
            state.screens.connections.selectedId = questId;
            state.screens.connections.filter = "all";
            state.screens.connections.mobileDetailOpen = true;
          } else {
            /* Command works from the intervention queue, which is a subset of the
             * portfolio. Handing it a Quest it does not hold would blank its
             * workspace with no explanation, so the previous selection is kept
             * and the reason is announced instead of silently losing context. */
            const known = target.id !== "command" || state.model.quests.some((quest) => quest.id === questId);
            if (known) state.selectedQuestId = questId;
            else {
              liveRegion.textContent = relayText("interventionUnavailable");
            }
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
    if (state.domain === "battle" && battleLoadError) {
      const retry = el("button", { type: "button", class:"rf-secondary-button", "data-battle-action":"refresh", disabled:battleBusy(state.screens.battle) }, relayText("retry"));
      retry.addEventListener("click", () => { void refreshBattle(state.screens.battle, { port:battlePort, onSession:() => {}, onRefresh:refreshBattleSession, isDisposed:() => lifecycle.disposed }, render); });
      return { main: el("section", { class: "rf-deferred-panel" }, el("h2", {}, "Battle"), el("p", { role:battleBusy(state.screens.battle) ? "status" : "alert", tabindex:"-1", "data-battle-action":"status" }, battleBusy(state.screens.battle) ? relayText("statusLoading") : battleLoadError), retry) };
    }
    const panelIndices: Partial<Record<NavId, readonly number[]>> = { network: [2], party: [4], battle: [1], connections: [2], skills: [7], settings: [6] };
    const indices = panelIndices[state.domain];
    const panelError = deferredError ?? deferredPanelErrors.find((entry) => indices?.includes(entry.index))?.message;
    if (runtime?.loadDeferred && indices && (deferredLoading || panelError)) {
      const retry = el("button", { type: "button" }, relayText("retry"));
      retry.addEventListener("click", () => { if (!deferredLoading) void loadDeferredPanels(); });
      return { main: el("section", { class: "rf-deferred-panel", "aria-busy": String(deferredLoading) },
        el("h2", {}, domainLabel(state.domain)),
        el("p", { role: deferredLoading ? "status" : "alert" }, deferredLoading ? relayText("panelLoading") : panelError || relayText("loadFailed")),
        ...(deferredLoading ? [] : [retry])), sticky: null };
    }
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
        notices: screenNotices(relayText("networkData"), retry),
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
        notices: screenNotices(relayText("agentsTitle"), retry),
        unavailable: [{
          what: relayText("partyInvite"),
          why: relayText("partyInviteHint"),
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
        notices: screenNotices("Battle", retry),
        writeHeld: screenWriteHeld(),
        decisions: state.screens.battle.decisions,
      });
      const callbacks = {
        port: battlePort,
        isDisposed: () => lifecycle.disposed,
        onRefresh: refreshBattleSession,
        onSession: (session: BattleSession) => { battleMutation += 1; battleSession = session; battleLoadError = null; deferredPanelErrors = deferredPanelErrors.filter(entry => entry.index !== 1); },
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
          lifecycleState: quest.lifecycleState,
          services: quest.externalLinks.map((link) => link.service),
        })),
        agents: screenAgents().map((agent) => ({
          agentId: agent.agentId,
          displayName: agent.displayName,
          allowedScopes: agent.allowedScopes ?? [],
        })),
        notices: screenNotices("Connections", retry),
        writeHeld: screenWriteHeld(),
        refreshFailed: connectionRefreshFailed,
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
          ? authorizedConnections === 0 ? relayText("skillsNoClients") : `${relayText("skillsOAuth")}: ${countLabel(authorizedConnections)}`
          : relayText("skillsPreview"),
        query: state.screens.skills.query,
        loading: production ? mcpToolsLoading : state.variant === "loading",
        connected: production ? mcpUrl !== "" : state.variant !== "permission",
        error: production ? mcpToolsLoadError : state.variant === "error" ? "fixture_error" : null,
      });
      const callbacks = {
        onSearch: (query: string) => {
          state.screens.skills.query = query;
          render();
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

  /* A destination change starts at the top; re-renders within one keep their scroll. */
  let renderedDomain: NavId | null = null;
  function resetScrollOnDomainChange(): void {
    if (renderedDomain !== null && renderedDomain !== state.domain) {
      screenHost.scrollTop = 0;
      window.scrollTo(0, 0);
    }
    renderedDomain = state.domain;
  }

  function render(): void {
    if (lifecycle.disposed || inputComposing) return;
    if (revisionSelection !== state.selectedQuestId) {
      revisionSelection = state.selectedQuestId;
      state.revisionOpen = false;
      state.revisionReason = "";
      state.revisionError = null;
      checkedReview = null;
    }
    if (decisionQuestId === state.selectedQuestId && state.decision.code === "reason_required") state.revisionError = state.decision.message;
    const revisionField = document.activeElement instanceof HTMLTextAreaElement && document.activeElement.matches(".rf-revision-input")
      ? { start:document.activeElement.selectionStart, end:document.activeElement.selectionEnd, direction:document.activeElement.selectionDirection }
      : null;
    const focusedQuest = document.activeElement instanceof HTMLElement && document.activeElement.matches(".rf-spine-row, .rf-shelf-card, .rf-m-shelf-card")
      ? { id:document.activeElement.dataset.questId, selector:["rf-spine-row", "rf-shelf-card", "rf-m-shelf-card"].find(name => document.activeElement?.classList.contains(name)) }
      : null;
    const commandToggle = document.activeElement instanceof HTMLElement && document.activeElement.matches(".rf-m-review, .rf-m-supporting-toggle, .rf-m-chronicle-toggle")
      ? document.activeElement.id : null;
    const commandControl = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.commandControl : undefined;
    const networkElement = document.activeElement instanceof HTMLElement && document.activeElement.closest(".rf-screen--network") ? document.activeElement : null;
    const networkAttribute = networkElement === null ? undefined : ["data-node-id", "data-network-control", "data-lane", "data-focus-id"].find(name => networkElement.hasAttribute(name));
    const networkFocus = networkAttribute === undefined ? null : { attribute:networkAttribute, value:networkElement!.getAttribute(networkAttribute)! };
    const skillsElement = document.activeElement instanceof HTMLElement && document.activeElement.closest(".rf-skills-screen") ? document.activeElement : null;
    const searchElement = document.activeElement instanceof HTMLInputElement && screenHost.contains(document.activeElement) && document.activeElement.matches(".rf-search-input") ? document.activeElement : null;
    const searchInput = searchElement === null ? null : { domain:state.domain, start:searchElement.selectionStart, end:searchElement.selectionEnd, direction:searchElement.selectionDirection };
    const skillsGroup = skillsElement?.dataset.groupToggle;
    const skillsScroll = screenHost.querySelector<HTMLElement>(".rf-skills-screen")?.scrollTop;
    const connectionElement = document.activeElement instanceof HTMLElement && document.activeElement.closest(".rf-screen--connections") ? document.activeElement : null;
    const connectionAttribute = connectionElement === null ? undefined : ["data-connection-id", "data-connection-action"].find(name => connectionElement.hasAttribute(name));
    const connectionFocus = connectionAttribute === undefined ? null : { attribute:connectionAttribute, value:connectionElement!.getAttribute(connectionAttribute)! };
    const connectionConfirm = connectionElement?.closest(".rf-confirm-actions") ? [...connectionElement.parentElement!.children].indexOf(connectionElement) : -1;
    const connectionFilter = connectionElement?.matches('.rf-segment') === true;
    const battleElement = document.activeElement instanceof HTMLElement && (document.activeElement.closest(".rf-screen--battle") || document.activeElement.hasAttribute("data-battle-action")) ? document.activeElement : null;
    const battleAttribute = battleElement === null ? undefined : ["data-command", "data-battle-action"].find(name => battleElement.hasAttribute(name));
    const battlePreviewFocus = battleElement?.matches(".rf-b-preview") === true;
    const battleFocus = battleAttribute === undefined ? null : { attribute:battleAttribute, value:battleElement!.getAttribute(battleAttribute)! };
    refreshQuestEditorCopy();
    refreshAgentEditorCopy();
    if (createDialog.open) syncAgentAssigneeOptions();
    document.documentElement.lang = getLocale();
    shell.setAttribute("data-domain", state.domain);
    shell.setAttribute("data-mobile", isMobile() ? "true" : "false");
    shell.setAttribute("data-questflow", state.questFlowOpen ? "open" : "closed");
    shell.setAttribute("data-rail", state.railCollapsed ? "collapsed" : "expanded");
    shell.setAttribute("data-lens", state.lensState);
    shell.setAttribute("data-loom", state.loomCollapsed ? "collapsed" : "expanded");
    shell.setAttribute("data-stale", state.stale ? "true" : "false");
    shell.setAttribute("data-sync-state", state.model.syncState);
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
      const notice = workspaceNotice();
      if (notice) (isMobile() ? mobileRegion.querySelector(".rf-m-page") : workfield.querySelector(".rf-selected-header") ?? workfield)?.prepend(notice);
      if (revisionField !== null) {
        const field = (isMobile() ? mobileDecision : lensRegion).querySelector<HTMLTextAreaElement>(".rf-revision-input");
        if (field && !field.disabled) { field.focus({ preventScroll:true }); field.setSelectionRange(revisionField.start, revisionField.end, revisionField.direction); }
      }
      if (focusedQuest?.id && focusedQuest.selector) shell.querySelector<HTMLElement>(`.${focusedQuest.selector}[data-quest-id="${CSS.escape(focusedQuest.id)}"]`)?.focus({ preventScroll:true });
      if (commandToggle) shell.querySelector<HTMLElement>(`#${commandToggle}`)?.focus({ preventScroll:true });
      if (commandControl) shell.querySelector<HTMLElement>(`[data-command-control="${CSS.escape(commandControl)}"]`)?.focus({ preventScroll:true });
      resetScrollOnDomainChange();
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
    const syncNotice = workspaceNotice();
    if (syncNotice) screen.main.prepend(syncNotice);
    if (screen.sticky === null || screen.sticky === undefined) replaceChildren(screenSticky);
    else replaceChildren(screenSticky, screen.sticky);
    if ((battleFocus !== null || battlePreviewFocus) && state.domain === "battle") {
      const selector = battleFocus === null ? '[data-battle-action="execute"]' : `[${battleFocus.attribute}="${CSS.escape(battleFocus.value)}"]`;
      const target = screenHost.querySelector<HTMLButtonElement>(selector) ?? screenSticky.querySelector<HTMLButtonElement>(selector);
      (target && !target.disabled ? target : screenHost.querySelector<HTMLElement>('.rf-b-preview[tabindex], .rf-b-command:not(:disabled), [data-battle-action="status"], [data-battle-action="refresh"]'))?.focus({ preventScroll:true });
    }
    if (connectionFocus !== null || connectionConfirm >= 0 || connectionFilter) {
      const target = connectionFocus !== null ? screenHost.querySelector<HTMLButtonElement>(`[${connectionFocus.attribute}="${CSS.escape(connectionFocus.value)}"]`)
        : connectionConfirm >= 0 ? screenHost.querySelectorAll<HTMLButtonElement>(".rf-confirm-actions button")[connectionConfirm]
        : screenHost.querySelector<HTMLButtonElement>('.rf-segment[aria-checked="true"]');
      (target && !target.disabled ? target : screenHost.querySelector<HTMLButtonElement>('.rf-c-back, .rf-c-row[data-selected="true"]'))?.focus({ preventScroll:true });
    }
    if (networkFocus !== null) window.requestAnimationFrame(() => screenHost.querySelector<HTMLElement>(`[${networkFocus.attribute}="${CSS.escape(networkFocus.value)}"]`)?.focus({ preventScroll:true }));
    if (skillsScroll !== undefined) screen.main.scrollTop = skillsScroll;
    if (searchInput !== null && searchInput.domain === state.domain) {
      const input = screenHost.querySelector<HTMLInputElement>(".rf-search-input");
      input?.focus({ preventScroll:true });
      if (searchInput.start !== null && searchInput.end !== null) input?.setSelectionRange(searchInput.start, searchInput.end, searchInput.direction ?? undefined);
    } else if (skillsGroup) screenHost.querySelector<HTMLElement>(`[data-group-toggle="${CSS.escape(skillsGroup)}"]`)?.focus({ preventScroll:true });
    resetScrollOnDomainChange();
  }

  function handleLensAsSheetChange(event: MediaQueryListEvent): void {
    state.lensState = window.matchMedia("(min-width: 1600px)").matches ? "open" : "closed";
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
  const handleRevisionComposition = (event: CompositionEvent) => {
    if (!(event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) || !event.target.matches(".rf-revision-input, .rf-search-input")) return;
    inputComposing = event.type === "compositionstart";
    if (!inputComposing) window.requestAnimationFrame(render);
  };
  shell.addEventListener("compositionstart", handleRevisionComposition);
  shell.addEventListener("compositionend", handleRevisionComposition);
  window.addEventListener("questforge:locale-changed", render);
  const onWorkspaceResume = () => { if (document.visibilityState !== "hidden") void refreshWorkspace(); };
  const workspaceInterval = runtime?.refreshWorkspace ? window.setInterval(onWorkspaceResume, 30000) : null;
  if (runtime?.refreshWorkspace) {
    window.addEventListener("focus", onWorkspaceResume);
    window.addEventListener("online", onWorkspaceResume);
    window.addEventListener("offline", markWorkspaceOffline);
    document.addEventListener("visibilitychange", onWorkspaceResume);
  }

  render();
  refreshAgentAvatars();
  refreshProfileAvatar();
  void loadDeferredPanels();
  void inbox.refresh();

  return function unmountRelayForge(): void {
    // First, so every in-flight avatar fetch's continuation (however many
    // microtask hops away it still is) observes disposal before it can
    // create a Blob URL, mutate shared state, or render.
    lifecycle.dispose();
    mobileFooterObserver.disconnect();
    if (workspaceInterval !== null) window.clearInterval(workspaceInterval);
    window.removeEventListener("focus", onWorkspaceResume);
    window.removeEventListener("online", onWorkspaceResume);
    window.removeEventListener("offline", markWorkspaceOffline);
    document.removeEventListener("visibilitychange", onWorkspaceResume);
    window.removeEventListener("questforge:locale-changed", render);
    shell.removeEventListener("compositionstart", handleRevisionComposition);
    shell.removeEventListener("compositionend", handleRevisionComposition);
    inbox.destroy();
    document.removeEventListener("click", handleAccountMenuOutsideClick);
    document.removeEventListener("keydown", handleAccountMenuKeydown);
    document.removeEventListener("keydown", handleSearchShortcut);
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

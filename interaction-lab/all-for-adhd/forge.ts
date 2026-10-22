/**
 * The Relay Forge destinations (list/board/gantt, network, battle,
 * connections, skills) mounted inside All for ADHD. The renderers, models and
 * ports are Relay Forge's own, wired the way its shell wires them, so every
 * feature stays available after the switch; only the frame around them is ours.
 */

import type { BattleSession, Quest } from "../../types/questforge.ts";
import type { RelayForgeRuntime } from "../relay-forge/production.ts";
import { relayText } from "../relay-forge/relay-copy.ts";
import { deriveMcpUrl } from "../relay-forge/screens/settings.ts";
import type { ScreenContext } from "../relay-forge/screens/runtime.ts";
import { initialQuestsState, normalizeQuestsModel, renderQuestsDesktop, renderQuestsMobile } from "../relay-forge/screens/quests.ts";
import { initialNetworkState, normalizeNetworkModel, renderNetworkDesktop, renderNetworkMobile } from "../relay-forge/screens/network.ts";
import { initialBattleState, normalizeBattleModel, renderBattleDesktop, renderBattleMobile } from "../relay-forge/screens/battle.ts";
import { validateBattleSession } from "../relay-forge/screens/battle-port.ts";
import { initialConnectionsState, normalizeConnectionsModel, renderConnectionsDesktop, renderConnectionsMobile } from "../relay-forge/screens/connections.ts";
import { REQUIRED_SCOPES } from "../relay-forge/screens/connections-port.ts";
import type { ConnectionActionResult } from "../relay-forge/screens/connections-model.ts";
import { initialSkillsState, normalizeSkillsModel, renderSkillsDesktop, renderSkillsMobile } from "../relay-forge/screens/skills.ts";

export type ForgeScreen = "list" | "network" | "battle" | "connections" | "skills";

export interface ForgeHost {
  readonly runtime: () => RelayForgeRuntime;
  readonly quests: () => readonly Quest[];
  readonly busy: () => boolean;
  readonly render: () => void;
  readonly announce: (message: string) => void;
  readonly openQuest: (id: string) => void;
  readonly navigate: (screen: ForgeScreen | "guild" | "all" | "calendar") => void;
  readonly refresh: () => Promise<void>;
  readonly workTime?: (quest: Quest) => string;
  readonly relatedNotes?: (questId: string) => HTMLElement;
}

const DOMAIN: Readonly<Record<string, ForgeScreen | "guild" | "all" | "calendar">> = {
  command: "guild", quests: "list", network: "network", party: "guild", battle: "battle",
  connections: "connections", skills: "skills", calendar: "calendar", notes: "all",
};

export function forgeScreens(host: ForgeHost) {
  const state = {
    quests: initialQuestsState(), network: initialNetworkState(),
    battle: initialBattleState(), connections: initialConnectionsState(), skills: initialSkillsState(),
  };
  let battle: BattleSession | null = null;
  let battleVersion = 0;
  let integrations: RelayForgeRuntime["integrations"] | null = null;
  let tools: readonly unknown[] | null = null;
  let toolsLoading = false;
  let toolsError: string | null = null;
  let selected: string | null = null;
  const mobile = () => matchMedia("(max-width: 760px)").matches;

  const context = (): ScreenContext => ({
    actors: host.runtime().model.actors,
    isMobile: mobile(),
    writeLocked: host.busy() || state.connections.busyId !== null,
    onSelectQuest: id => { selected = id; host.openQuest(id); },
    onNavigate: (domain, id) => {
      const target = DOMAIN[domain];
      if (!target) return;
      if (id && target === "connections") { state.connections.selectedId = id; state.connections.mobileDetailOpen = true; }
      if (id && target !== "connections") selected = id;
      host.navigate(target);
    },
    announce: host.announce,
    rerender: host.render,
  });

  async function refreshBattle(): Promise<boolean> {
    const version = ++battleVersion;
    try {
      const latest = await host.runtime().questPort.getBattleSession();
      if (version !== battleVersion) return false;
      validateBattleSession(latest.session);
      battle = latest.session;
      return true;
    } catch { return false; } finally { host.render(); }
  }

  async function refreshConnections(): Promise<ConnectionActionResult> {
    const reload = host.runtime().refreshConnections;
    if (!reload) return { ok: true, code: "ok", message: "" };
    try {
      const next = await reload();
      integrations = next.integrations;
      await host.refresh();
      return { ok: true, code: "ok", message: "" };
    } catch {
      return { ok: false, code: "refresh_failed", message: "" };
    } finally { host.render(); }
  }

  async function loadTools(): Promise<void> {
    if (toolsLoading) return;
    toolsLoading = true; toolsError = null; host.render();
    try {
      const response = await host.runtime().mcpToolsPort.listMcpTools() as { tools?: unknown };
      tools = Array.isArray(response?.tools) ? response.tools : [];
    } catch { toolsError = "load_failed"; } finally { toolsLoading = false; host.render(); }
  }

  function connectionsPort() {
    const base = host.runtime().connectionsPort;
    const change = async (work: () => ReturnType<typeof base.runSync>) => {
      const result = await work();
      if (result.ok) await refreshConnections();
      return result;
    };
    return {
      previewSync: (id: string) => base.previewSync(id),
      runSync: (id: string) => change(() => base.runSync(id)),
      reconnect: (id: string) => base.reconnect(id),
      disconnect: (id: string) => change(() => base.disconnect(id)),
      refresh: refreshConnections,
    };
  }

  function enter(screen: ForgeScreen): void {
    if (screen === "battle" && battle === null) { battle = host.runtime().battleSession; void refreshBattle(); }
    if (screen === "skills" && tools === null && !toolsLoading) {
      const runtime = host.runtime();
      if (runtime.mcpToolsLoadError === null && runtime.mcpTools.length > 0) tools = runtime.mcpTools; else void loadTools();
    }
  }

  function render(screen: ForgeScreen): HTMLElement {
    const runtime = host.runtime();
    const quests = host.quests();
    const ctx = context();
    const pick = <T>(desktop: () => T, phone: () => T) => (ctx.isMobile ? phone() : desktop());
    if (screen === "list") {
      const model = normalizeQuestsModel({ quests, selfUid: runtime.selfUid, notices: [], writeHeld: ctx.writeLocked, now: Date.now(), today: new Date().toISOString().slice(0, 10) });
      const timed = { ...model, rows: model.rows.map(row => { const quest = quests.find(q => q.id === row.id); return { ...row, workTime: quest && host.workTime ? host.workTime(quest) : "—" }; }) };
      const callbacks = {
        relatedNotes: host.relatedNotes,
        onEdit: host.openQuest,
        onAssign: host.openQuest,
        onSendToCommand: () => host.navigate("guild"),
        onInspectNetwork: (id: string) => { selected = id; host.navigate("network"); },
      };
      return pick(() => renderQuestsDesktop(timed, state.quests, ctx, callbacks, selected), () => renderQuestsMobile(timed, state.quests, ctx, callbacks, selected)).main;
    }
    if (screen === "network") {
      const model = normalizeNetworkModel({
        quests, actors: ctx.actors, selfUid: runtime.selfUid, notices: [],
        connections: (integrations ?? runtime.integrations).map(entry => ({
          id: entry.id, name: entry.name, status: entry.status,
          questIds: quests.filter(q => q.externalLinks.some(link => link.service === entry.id)).map(q => q.id),
        })),
      });
      return pick(() => renderNetworkDesktop(model, state.network, ctx, selected), () => renderNetworkMobile(model, state.network, ctx, selected)).main;
    }
    if (screen === "battle") {
      const model = normalizeBattleModel({ session: battle, notices: [], writeHeld: ctx.writeLocked, decisions: state.battle.decisions });
      const callbacks = {
        port: runtime.battlePort, isDisposed: () => false, onRefresh: refreshBattle,
        onSession: (session: BattleSession) => { battleVersion += 1; battle = session; },
      };
      return pick(() => renderBattleDesktop(model, state.battle, ctx, callbacks), () => renderBattleMobile(model, state.battle, ctx, callbacks)).main;
    }
    if (screen === "connections") {
      const model = normalizeConnectionsModel({
        integrations: integrations ?? runtime.integrations,
        requiredScopes: REQUIRED_SCOPES,
        questLinks: quests.map(q => ({ id: q.id, title: q.title, lifecycleState: q.lifecycleState, services: q.externalLinks.map(link => link.service) })),
        agents: runtime.agents.map(agent => ({ agentId: agent.agentId, displayName: agent.displayName, allowedScopes: agent.allowedScopes ?? [] })),
        notices: [], writeHeld: ctx.writeLocked, refreshFailed: false,
      });
      const port = connectionsPort();
      return pick(() => renderConnectionsDesktop(model, state.connections, ctx, port), () => renderConnectionsMobile(model, state.connections, ctx, port)).main;
    }
    const authorized = runtime.agentConnections.filter(connection => connection.authorized).length;
    const model = normalizeSkillsModel({
      tools: tools ?? [], sourceLabel: "Guilduo MCP", sourceUrl: deriveMcpUrl(runtime.gatewayUrl),
      connectionLabel: authorized === 0 ? relayText("skillsNoClients") : `${relayText("skillsOAuth")}: ${authorized}`, query: state.skills.query,
      loading: toolsLoading, connected: true, error: toolsError,
    });
    const callbacks = {
      onSearch: (query: string) => { state.skills.query = query; host.render(); },
      onToggleGroup: (groupId: string) => { state.skills.expandedGroups[groupId] = state.skills.expandedGroups[groupId] !== true; host.render(); },
      onRetry: () => { void loadTools(); },
    };
    return pick(() => renderSkillsDesktop(model, state.skills, ctx, callbacks), () => renderSkillsMobile(model, state.skills, ctx, callbacks)).main;
  }

  return { enter, render };
}

export interface IslandHandle<TViewModel> {
  update(model: TViewModel): void;
  unmount(): void;
}

export interface IslandBridge<TViewModel, TActions> {
  mount(element: HTMLElement, model: TViewModel, actions: TActions): IslandHandle<TViewModel>;
}

export type MetricTone = "human" | "agent" | "rpg" | "danger" | "neutral";

export interface FormationMetric {
  label: string;
  value: string;
  tone?: MetricTone;
}

export type FormationIdentity = "human" | "astra" | "agent";

export interface FormationMember {
  id: string;
  name: string;
  identity: FormationIdentity;
  identityLabel: string;
  role: string;
  avatarSrc?: string;
  state: string;
  stateLabel: string;
  currentQuest?: string;
  metrics: FormationMetric[];
  capabilities?: string[];
}

export interface PartyFormationViewModel {
  title: string;
  subtitle: string;
  connectionLabel: string;
  members: FormationMember[];
  socialMemberCount: number;
  registeredAgentCount: number;
  emptyAgentCopy: string;
}

export interface PartyFormationActions {
  onOpenAgentRegistry: () => void;
  onSelectMember?: (memberId: string) => void;
  onOpenMemberQuest?: (memberId: string) => void;
}

export type IntegrationNodeStatus = "connected" | "syncing" | "early-access" | "error" | "not-configured" | "unsupported";

export interface IntegrationNode {
  id: string;
  name: string;
  type: string;
  endpoint: string;
  status: IntegrationNodeStatus;
  statusLabel: string;
  latency?: string;
  auth?: string;
}

export interface IntegrationTableRow {
  id: string;
  name: string;
  type: string;
  endpoint: string;
  status: IntegrationNodeStatus;
  statusLabel: string;
  latency?: string;
  auth?: string;
}

export interface IntegrationControlPlaneViewModel {
  title: string;
  subtitle: string;
  selectedId: string;
  nodes: IntegrationNode[];
  tableRows: IntegrationTableRow[];
  connectedCount: number;
  previewCount: number;
  safeRuleCount: number;
}

export interface IntegrationControlPlaneActions {
  onSelect: (id: string) => void;
  onOpenSettings: (id: string) => void;
}

export interface QuestGraphNode {
  id: string;
  code: string;
  title: string;
  summary: string;
  kind: string;
  status: string;
  statusLabel: string;
  progress: number;
  createdAt: string;
  order?: number;
  parentQuestId: string;
  dependencyIds: string[];
}

export interface QuestGraphViewModel {
  title: string;
  subtitle: string;
  nodes: QuestGraphNode[];
  selectedId: string;
  hideCompleted: boolean;
  statusFilter: string;
}

export interface QuestGraphActions {
  onSelect: (id: string) => void;
}

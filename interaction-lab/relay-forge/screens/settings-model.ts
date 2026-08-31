/**
 * Settings — state, model and normalization. Deliberately DOM-free (no
 * `primitives/dom.ts`, no `window`/`document`), matching the split every
 * other screen already uses (`quests-model.ts`, `party-model.ts`, etc.), so
 * this half can be unit-tested directly under `node:test` without pulling in
 * a DOM-typed render file.
 */

import type { ThemePreference } from "../theme.ts";

export type SettingsSection = "top" | "account" | "appearance" | "mcp" | "agents";

export type ProfileDraftField = "displayName" | "handle" | "bio";

export interface ProfileDraft {
  displayName: string;
  handle: string;
  bio: string;
}

export interface SettingsState {
  avatarSaving: boolean;
  avatarProgress: number | null;
  avatarMessage: string;
  avatarTone: "success" | "error" | null;
  profileSaving: boolean;
  profileMessage: string;
  profileTone: "success" | "error" | null;
  profileDraft: ProfileDraft | null;
  mcpCopyMessage: string;
  mcpCopyTone: "success" | "error" | null;
  connectionBusyId: string | null;
  connectionMessage: string;
  connectionTone: "success" | "error" | null;
  connectionDrafts: Record<string, string>;
  /** Section to bring into view on the next render — consumed once, then cleared. */
  pendingFocus: SettingsSection | null;
}

export function initialSettingsState(): SettingsState {
  return {
    avatarSaving: false,
    avatarProgress: null,
    avatarMessage: "",
    avatarTone: null,
    profileSaving: false,
    profileMessage: "",
    profileTone: null,
    profileDraft: null,
    mcpCopyMessage: "",
    mcpCopyTone: null,
    connectionBusyId: null,
    connectionMessage: "",
    connectionTone: null,
    connectionDrafts: {},
    pendingFocus: "top",
  };
}

export interface SettingsAgentRow {
  readonly agentId: string;
  readonly displayName: string;
  readonly provider: string;
  readonly role: string;
  readonly status: string;
}

export interface SettingsMcpConnectionRow {
  readonly clientId: string;
  readonly clientName: string;
  readonly scopes: readonly string[];
  readonly firstConnectedAt: string;
  readonly lastUsedAt: string;
  /** The last/current relation target, retained for a useful legacy state. */
  readonly linkedAgentId: string | null;
  /** Non-null when the relation exists but is no longer active. */
  readonly linkRevokedAt: string | null;
  /** True when an active OAuth grant exists for this client. */
  readonly authorized: boolean;
  /** OAuth grant revocation, distinct from an Agent unlink. */
  readonly revokedAt: string | null;
}

export interface SettingsModel {
  /** True in the fixture/demo lab — no runtime, so no write ever pretends to succeed. */
  readonly isDemo: boolean;
  readonly profile: {
    readonly displayName: string;
    readonly handle: string;
    readonly bio: string;
    readonly hasHandle: boolean;
    readonly hasCustomAvatar: boolean;
    readonly avatarVersion: number;
  } | null;
  readonly email: string;
  readonly profileLoadError: string | null;
  readonly theme: ThemePreference;
  readonly effectiveTheme: "light" | "dark";
  readonly mcpUrl: string;
  readonly agents: readonly SettingsAgentRow[];
  readonly mcpConnections: readonly SettingsMcpConnectionRow[];
  readonly mcpConnectionLoadError: string | null;
}

export interface NormalizeSettingsOptions {
  readonly isDemo: boolean;
  readonly profile: { readonly displayName?: string; readonly handle?: string; readonly bio?: string; readonly hasCustomAvatar?: boolean; readonly avatarVersion?: number } | null;
  readonly email?: string;
  readonly profileLoadError?: string | null;
  readonly theme: ThemePreference;
  readonly effectiveTheme: "light" | "dark";
  readonly gatewayUrl: string;
  readonly agents: readonly SettingsAgentRow[];
  readonly mcpConnections?: readonly SettingsMcpConnectionRow[];
  readonly mcpConnectionLoadError?: string | null;
}

/** `{gatewayUrl}/mcp` with no doubled or missing slash — the one normal-use MCP URL. */
export function deriveMcpUrl(gatewayUrl: string): string {
  const trimmed = gatewayUrl.trim().replace(/\/+$/, "");
  return trimmed === "" ? "" : `${trimmed}/mcp`;
}

export function normalizeSettingsModel(options: NormalizeSettingsOptions): SettingsModel {
  const displayName = options.profile?.displayName?.trim() ?? "";
  const handle = options.profile?.handle?.trim().replace(/^@+/, "") ?? "";
  const avatarVersion = Number(options.profile?.avatarVersion);
  return {
    isDemo: options.isDemo,
    profile: options.profile === null ? null : {
      displayName: displayName === "" ? "あなた" : displayName,
      handle,
      bio: options.profile?.bio?.trim() ?? "",
      hasHandle: handle !== "",
      hasCustomAvatar: options.profile?.hasCustomAvatar === true && Number.isSafeInteger(avatarVersion) && avatarVersion > 0,
      avatarVersion: Number.isSafeInteger(avatarVersion) && avatarVersion > 0 ? avatarVersion : 0,
    },
    email: options.email?.trim() ?? "",
    profileLoadError: options.profileLoadError?.trim() || null,
    theme: options.theme,
    effectiveTheme: options.effectiveTheme,
    mcpUrl: deriveMcpUrl(options.gatewayUrl),
    agents: options.agents,
    mcpConnections: options.mcpConnections ?? [],
    mcpConnectionLoadError: options.mcpConnectionLoadError?.trim() || null,
  };
}

export interface SettingsCallbacks {
  readonly onThemeSelect: (theme: ThemePreference) => void;
  readonly onAvatarFileSelected: (file: File) => void;
  readonly onRemoveAvatar: () => void;
  readonly onProfileDraftChange: (field: ProfileDraftField, value: string) => void;
  readonly onSaveProfile: () => void;
  readonly onRetryProfile: () => void;
  readonly onCopyMcpUrl: () => void;
  readonly onRetryMcpConnections: () => void;
  readonly onOpenAgentPicker: (clientId: string) => void;
  readonly onCancelAgentPicker: (clientId: string) => void;
  readonly onSelectConnectionAgent: (clientId: string, agentId: string) => void;
  readonly onLinkAgent: (clientId: string, agentId: string) => void;
  readonly onUnlinkAgent: (clientId: string, agentId: string) => void;
  readonly canManageAgents: boolean;
  readonly onCreateAgent: () => void;
  readonly onEditAgent: (agentId: string) => void;
}

/**
 * Settings — state, model and normalization. Deliberately DOM-free (no
 * `primitives/dom.ts`, no `window`/`document`), matching the split every
 * other screen already uses (`quests-model.ts`, `party-model.ts`, etc.), so
 * this half can be unit-tested directly under `node:test` without pulling in
 * a DOM-typed render file.
 */

import type { ThemePreference } from "../theme.ts";

export type SettingsSection = "top" | "account" | "appearance" | "mcp" | "agents";

export interface SettingsState {
  avatarSaving: boolean;
  avatarMessage: string;
  avatarTone: "success" | "error" | null;
  mcpCopyMessage: string;
  mcpCopyTone: "success" | "error" | null;
  /** Section to bring into view on the next render — consumed once, then cleared. */
  pendingFocus: SettingsSection | null;
}

export function initialSettingsState(): SettingsState {
  return {
    avatarSaving: false,
    avatarMessage: "",
    avatarTone: null,
    mcpCopyMessage: "",
    mcpCopyTone: null,
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

export interface SettingsModel {
  /** True in the fixture/demo lab — no runtime, so no write ever pretends to succeed. */
  readonly isDemo: boolean;
  readonly profile: { readonly displayName: string; readonly handle: string; readonly hasHandle: boolean } | null;
  readonly theme: ThemePreference;
  readonly effectiveTheme: "light" | "dark";
  readonly mcpUrl: string;
  readonly agents: readonly SettingsAgentRow[];
}

export interface NormalizeSettingsOptions {
  readonly isDemo: boolean;
  readonly profile: { readonly displayName?: string; readonly handle?: string } | null;
  readonly theme: ThemePreference;
  readonly effectiveTheme: "light" | "dark";
  readonly gatewayUrl: string;
  readonly agents: readonly SettingsAgentRow[];
}

/** `{gatewayUrl}/mcp` with no doubled or missing slash — the one normal-use MCP URL. */
export function deriveMcpUrl(gatewayUrl: string): string {
  const trimmed = gatewayUrl.trim().replace(/\/+$/, "");
  return trimmed === "" ? "" : `${trimmed}/mcp`;
}

export function normalizeSettingsModel(options: NormalizeSettingsOptions): SettingsModel {
  const displayName = options.profile?.displayName?.trim() ?? "";
  const handle = options.profile?.handle?.trim() ?? "";
  return {
    isDemo: options.isDemo,
    profile: options.profile === null ? null : {
      displayName: displayName === "" ? "あなた" : displayName,
      handle,
      hasHandle: handle !== "",
    },
    theme: options.theme,
    effectiveTheme: options.effectiveTheme,
    mcpUrl: deriveMcpUrl(options.gatewayUrl),
    agents: options.agents,
  };
}

export interface SettingsCallbacks {
  readonly onThemeSelect: (theme: ThemePreference) => void;
  readonly onAvatarFileSelected: (file: File) => void;
  readonly onCopyMcpUrl: () => void;
  readonly canManageAgents: boolean;
  readonly onCreateAgent: () => void;
  readonly onEditAgent: (agentId: string) => void;
}

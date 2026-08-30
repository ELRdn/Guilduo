/**
 * Settings — account, appearance and MCP connection.
 *
 * The question: "自分のアイコン、テーマ、MCP接続先を、安全に確認・変更できるか".
 *
 * This is not a dumping ground for every future preference. Section 3 is
 * fixed to what the brief asked for: Account (identity + avatar), Appearance
 * (explicit Light/Dark/System) and MCP Connection (the stable URL, read-only).
 * A fourth region, Agents, exists only because Party and Settings must open
 * the *same* Agent editor — this screen lists Agents and hands off to it, it
 * does not duplicate Party's roster or workload view.
 *
 * Nothing here starts a network request on mount: the caller already has the
 * profile, theme and Agent list from the shared Command model, so opening
 * Settings costs nothing extra (brief Phase 4).
 */

import { actorAvatar } from "../primitives/avatar.ts";
import { el } from "../primitives/dom.ts";
import type { ThemePreference } from "../theme.ts";
import {
  type SettingsAgentRow,
  type SettingsCallbacks,
  type SettingsModel,
  type SettingsSection,
  type SettingsState,
} from "./settings-model.ts";
import {
  type Metric,
  metricRow,
  type ScreenContext,
  type ScreenRender,
  screenHeader,
  screenRegion,
  stateChip,
} from "./runtime.ts";

export * from "./settings-model.ts";

/* ------------------------------------------------------------------ *
 * Account
 * ------------------------------------------------------------------ */

function accountRegion(
  model: SettingsModel,
  state: SettingsState,
  context: ScreenContext,
  callbacks: SettingsCallbacks,
): HTMLElement {
  const selfActor = [...context.actors.values()].find((actor) => actor.kind === "human") ?? null;
  const fileInput = el("input", {
    type: "file",
    class: "rf-visually-hidden",
    accept: "image/png,image/jpeg,image/webp",
    id: "rf-set-avatar-input",
  }) as HTMLInputElement;
  const canUpload = model.profile !== null && model.profile.hasHandle && !model.isDemo;
  fileInput.disabled = !canUpload || state.avatarSaving;
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file !== undefined) callbacks.onAvatarFileSelected(file);
    fileInput.value = "";
  });

  const uploadButton = el(
    "label",
    { for: "rf-set-avatar-input", class: `rf-secondary-button rf-set-avatar-trigger${canUpload ? "" : " rf-set-disabled"}` },
    state.avatarSaving ? "保存しています…" : "画像を変更",
  );

  const guidance = model.profile === null
    ? "プロフィールを読み込めませんでした。"
    : model.isDemo
      ? "デモ表示です。Googleでサインインすると本人アイコンを変更できます。"
      : !model.profile.hasHandle
        ? "表示名とhandleが未設定です。プロフィールを先に作成すると、アイコンを変更できます。"
        : "PNG、JPEG、WebPから選択できます。256×256のWebPに自動で縮小されます。";

  return screenRegion(
    "Account",
    {},
    el(
      "div",
      { class: "rf-set-account" },
      el(
        "div",
        { class: "rf-set-avatar-block" },
        selfActor === null
          ? el("span", { class: "rf-set-avatar-placeholder", "aria-hidden": "true" }, "?")
          : actorAvatar(selfActor, { size: "profile" }),
        el("div", { class: "rf-set-avatar-controls" }, uploadButton, fileInput),
      ),
      el(
        "div",
        { class: "rf-set-identity" },
        el("p", { class: "rf-set-name" }, model.profile?.displayName ?? "あなた"),
        el("p", { class: "rf-set-handle" }, model.profile !== null && model.profile.hasHandle ? `@${model.profile.handle}` : "@未設定"),
        el("p", { class: "rf-set-guidance" }, guidance),
        state.avatarMessage === ""
          ? null
          : el(
            "p",
            { class: "rf-set-avatar-status", "data-tone": state.avatarTone, role: state.avatarTone === "error" ? "alert" : "status" },
            state.avatarMessage,
          ),
      ),
    ),
  );
}

/* ------------------------------------------------------------------ *
 * Appearance
 * ------------------------------------------------------------------ */

const THEME_OPTIONS: ReadonlyArray<{ readonly id: ThemePreference; readonly label: string }> = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

function themeControl(model: SettingsModel, callbacks: SettingsCallbacks): HTMLElement {
  return el(
    "fieldset",
    { class: "rf-set-theme-group" },
    el("legend", { class: "rf-visually-hidden" }, "テーマ"),
    ...THEME_OPTIONS.map((option) => {
      const checked = model.theme === option.id;
      const input = el("input", {
        type: "radio",
        name: "rf-set-theme",
        class: "rf-visually-hidden",
        value: option.id,
        checked,
      });
      input.addEventListener("change", () => callbacks.onThemeSelect(option.id));
      return el(
        "label",
        { class: "rf-set-theme-option", "data-selected": checked ? "true" : "false" },
        input,
        el("span", { class: "rf-set-theme-mark", "aria-hidden": "true" }),
        el("span", { class: "rf-set-theme-label" }, option.label),
      );
    }),
  );
}

function appearanceRegion(model: SettingsModel, callbacks: SettingsCallbacks): HTMLElement {
  const effectiveLabel = model.effectiveTheme === "dark" ? "Dark" : "Light";
  return screenRegion(
    "Appearance",
    {},
    el(
      "div",
      { class: "rf-set-appearance" },
      themeControl(model, callbacks),
      el(
        "p",
        { class: "rf-set-theme-status" },
        model.theme === "system"
          ? `System を使用中 · 現在の表示は ${effectiveLabel}（OSの設定に追従します）`
          : `${model.theme === "dark" ? "Dark" : "Light"} を使用中（OSの設定に関わらず固定です）`,
      ),
    ),
  );
}

/* ------------------------------------------------------------------ *
 * MCP Connection
 * ------------------------------------------------------------------ */

function mcpRegion(model: SettingsModel, state: SettingsState, callbacks: SettingsCallbacks): HTMLElement {
  const copyButton = el("button", { type: "button", class: "rf-secondary-button" }, "Copy");
  copyButton.addEventListener("click", () => callbacks.onCopyMcpUrl());
  return screenRegion(
    "MCP Connection",
    {},
    el(
      "div",
      { class: "rf-set-mcp" },
      el(
        "div",
        { class: "rf-set-mcp-row" },
        el("input", {
          type: "text",
          class: "rf-set-mcp-url",
          value: model.mcpUrl,
          readonly: true,
          "aria-label": "安定版 MCP URL",
        }),
        copyButton,
      ),
      state.mcpCopyMessage === ""
        ? null
        : el(
          "p",
          { class: "rf-set-mcp-status", "data-tone": state.mcpCopyTone, role: state.mcpCopyTone === "error" ? "alert" : "status" },
          state.mcpCopyMessage,
        ),
      el("p", { class: "rf-set-mcp-note" }, "OAuth接続です。APIキー、Bearer Token、Client Secretの入力は不要です。"),
    ),
  );
}

/* ------------------------------------------------------------------ *
 * Agents — lists what exists; editing happens in the shared Agent Dialog.
 * ------------------------------------------------------------------ */

function agentRow(row: SettingsAgentRow, context: ScreenContext, callbacks: SettingsCallbacks): HTMLElement {
  const actor = context.actors.get(row.agentId);
  const edit = el("button", { type: "button", class: "rf-secondary-button" }, "編集");
  edit.addEventListener("click", () => callbacks.onEditAgent(row.agentId));
  return el(
    "div",
    { class: "rf-set-agent-row" },
    actor === undefined ? null : actorAvatar(actor, { size: "shelf" }),
    el(
      "div",
      { class: "rf-set-agent-copy" },
      el("span", { class: "rf-set-agent-name" }, row.displayName),
      el("span", { class: "rf-set-agent-meta" }, row.provider === "" ? row.role : `${row.role} · ${row.provider}`),
    ),
    row.status === "disabled" ? stateChip({ tone: "neutral", label: "Disabled", mark: "‖" }) : null,
    edit,
  );
}

function agentsRegion(model: SettingsModel, context: ScreenContext, callbacks: SettingsCallbacks): HTMLElement {
  const create = el("button", { type: "button", class: "rf-primary-button" }, "Agentを登録");
  create.addEventListener("click", () => callbacks.onCreateAgent());
  return screenRegion(
    "Agents",
    {},
    metricRow([{ label: "登録済み", value: String(model.agents.length) } as Metric]),
    !callbacks.canManageAgents
      ? el("p", { class: "rf-unavailable" }, "Googleでサインインすると Agent を登録・編集できます。")
      : model.agents.length === 0
        ? el("p", { class: "rf-set-agent-empty" }, "登録済みの Agent はまだありません。")
        : el("div", { class: "rf-set-agent-list" }, ...model.agents.map((row) => agentRow(row, context, callbacks))),
    callbacks.canManageAgents ? create : null,
  );
}

/* ------------------------------------------------------------------ *
 * Screen assembly
 * ------------------------------------------------------------------ */

const SECTION_LABEL: Readonly<Record<SettingsSection, string>> = {
  top: "Settings",
  account: "Account",
  appearance: "Appearance",
  mcp: "MCP Connection",
  agents: "Agents",
};

function settingsMain(
  model: SettingsModel,
  state: SettingsState,
  context: ScreenContext,
  callbacks: SettingsCallbacks,
): HTMLElement {
  const main = el(
    "div",
    { class: "rf-screen rf-set-screen", "data-scroll": "true" },
    screenHeader({ title: "Settings", question: "アカウント、テーマ、MCP接続をここで管理します。" }),
    accountRegion(model, state, context, callbacks),
    appearanceRegion(model, callbacks),
    mcpRegion(model, state, callbacks),
    agentsRegion(model, context, callbacks),
  );
  return main;
}

/** Scrolls the requested section into view once, after the DOM is attached. */
function applyPendingFocus(main: HTMLElement, section: SettingsSection | null): void {
  if (section === null || section === "top") {
    main.querySelector("h1")?.focus();
    return;
  }
  const label = SECTION_LABEL[section];
  const region = [...main.querySelectorAll<HTMLElement>(".rf-screen-region")]
    .find((node) => node.getAttribute("aria-label") === label);
  region?.scrollIntoView({ block: "start" });
  region?.querySelector<HTMLElement>("h2")?.focus();
}

export function renderSettingsDesktop(
  model: SettingsModel,
  state: SettingsState,
  context: ScreenContext,
  callbacks: SettingsCallbacks,
  focusSection: SettingsSection | null,
): ScreenRender {
  const main = settingsMain(model, state, context, callbacks);
  window.requestAnimationFrame(() => applyPendingFocus(main, focusSection));
  return { main };
}

export function renderSettingsMobile(
  model: SettingsModel,
  state: SettingsState,
  context: ScreenContext,
  callbacks: SettingsCallbacks,
  focusSection: SettingsSection | null,
): ScreenRender {
  const main = settingsMain(model, state, context, callbacks);
  main.dataset.scroll = "false";
  window.requestAnimationFrame(() => applyPendingFocus(main, focusSection));
  return { main };
}

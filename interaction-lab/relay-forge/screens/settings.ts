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
  type SettingsMcpConnectionRow,
  type SettingsSection,
  type SettingsState,
  type ProfileDraft,
} from "./settings-model.ts";
import {
  type Metric,
  metricRow,
  type ScreenContext,
  type ScreenRender,
  screenEmpty,
  screenHeader,
  screenNotice,
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
  const profile = model.profile;
  const draft: ProfileDraft = state.profileDraft ?? {
    displayName: profile === null ? "" : profile.displayName === "あなた" ? "" : profile.displayName,
    handle: profile?.handle ?? "",
    bio: profile?.bio ?? "",
  };
  const profileBusy = state.profileSaving || model.profileLoadError !== null;
  const controlsDisabled = model.isDemo || profileBusy;
  const fileInput = el("input", {
    type: "file",
    class: "rf-visually-hidden",
    accept: "image/png,image/jpeg,image/webp",
    id: "rf-set-avatar-input",
  }) as HTMLInputElement;
  const canUpload = model.profile !== null && !model.isDemo && !state.avatarSaving && model.profileLoadError === null;
  fileInput.disabled = !canUpload || state.avatarSaving;
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file !== undefined) callbacks.onAvatarFileSelected(file);
    fileInput.value = "";
  });

  const uploadButton = el(
    "label",
    { for: "rf-set-avatar-input", class: `rf-secondary-button rf-set-avatar-trigger${canUpload ? "" : " rf-set-disabled"}` },
    state.avatarSaving ? "保存しています…" : profile?.hasCustomAvatar ? "画像を変更" : "画像をアップロード",
  );

  const removeButton = el("button", {
    type: "button",
    class: "rf-secondary-button rf-set-avatar-remove",
    disabled: !canUpload || !profile?.hasCustomAvatar,
  }, "画像を削除");
  removeButton.addEventListener("click", () => callbacks.onRemoveAvatar());

  const progress = state.avatarProgress === null
    ? null
    : el(
      "div",
      { class: "rf-set-avatar-progress", role: "status", "aria-live": "polite" },
      el("progress", { max: 100, value: state.avatarProgress, "aria-label": "Avatarのアップロード進捗" }),
      el("span", {}, `${state.avatarProgress}%`),
    );

  const guidance = model.profileLoadError !== null
    ? "プロフィールの通信に失敗しました。再試行してください。"
    : model.isDemo
      ? "デモ表示です。Googleでサインインすると本人アイコンを変更できます。"
      : model.profile === null
        ? "プロフィールを設定して、Guilduoでの表示名を決めましょう。保存後にAvatarを追加できます。"
        : "PNG、JPEG、WebPから選択できます。256×256のWebPに自動で縮小されます。";

  const email = el("dd", { class: "rf-set-account-value" }, model.email || "未取得");
  const profileForm = el("form", { class: "rf-set-profile-form" });
  const displayNameInput = el("input", {
    class: "rf-set-input",
    type: "text",
    name: "displayName",
    value: draft.displayName,
    maxlength: 60,
    autocomplete: "name",
    required: true,
    disabled: controlsDisabled,
  }) as HTMLInputElement;
  const handleInput = el("input", {
    class: "rf-set-input rf-set-input-handle",
    type: "text",
    name: "handle",
    value: draft.handle,
    maxlength: 20,
    minlength: 3,
    pattern: "[A-Za-z0-9_]{3,20}",
    autocomplete: "username",
    spellcheck: false,
    required: true,
    disabled: controlsDisabled,
  }) as HTMLInputElement;
  const bioInput = el("textarea", {
    class: "rf-set-input rf-set-bio",
    name: "bio",
    maxlength: 160,
    rows: 3,
    autocomplete: "off",
    disabled: controlsDisabled,
  }) as HTMLTextAreaElement;
  bioInput.value = draft.bio;
  displayNameInput.addEventListener("input", () => callbacks.onProfileDraftChange("displayName", displayNameInput.value));
  handleInput.addEventListener("input", () => callbacks.onProfileDraftChange("handle", handleInput.value));
  bioInput.addEventListener("input", () => callbacks.onProfileDraftChange("bio", bioInput.value));
  profileForm.append(
    el("p", { class: "rf-set-form-title" }, "プロフィール情報"),
    el("label", { class: "rf-set-field" }, el("span", { class: "rf-set-field-label" }, "Display Name"), displayNameInput, el("small", { class: "rf-set-field-hint" }, "1〜60文字")),
    el("label", { class: "rf-set-field" }, el("span", { class: "rf-set-field-label" }, "Username / Handle"), el("span", { class: "rf-set-handle-input-wrap" }, el("span", { class: "rf-set-handle-prefix", "aria-hidden": "true" }, "@"), handleInput), el("small", { class: "rf-set-field-hint" }, "英数字と _、3〜20文字")),
    el("label", { class: "rf-set-field" }, el("span", { class: "rf-set-field-label" }, "Bio"), bioInput, el("small", { class: "rf-set-field-hint" }, "160文字以内")),
  );
  const saveProfileButton = el("button", {
    type: "submit",
    class: "rf-primary-button rf-set-profile-submit",
    disabled: controlsDisabled,
  }, state.profileSaving ? "保存しています…" : "保存");
  profileForm.append(saveProfileButton);
  if (state.profileMessage !== "") {
    profileForm.append(el(
      "p",
      { class: "rf-set-profile-status", "data-tone": state.profileTone, role: state.profileTone === "error" ? "alert" : "status" },
      state.profileMessage,
    ));
  }
  profileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    callbacks.onSaveProfile();
  });

  const profileError = model.profileLoadError === null
    ? null
    : el(
      "div",
      { class: "rf-set-profile-error", role: "alert" },
      el("p", {}, "プロフィールを読み込めませんでした。通信状態を確認してください。"),
      el("button", { type: "button", class: "rf-secondary-button" }, "再試行"),
    );
  profileError?.querySelector("button")?.addEventListener("click", () => callbacks.onRetryProfile());

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
        el("div", { class: "rf-set-avatar-controls" }, uploadButton, removeButton, progress, fileInput),
      ),
      el(
        "div",
        { class: "rf-set-identity" },
        el("p", { class: "rf-set-name" }, profile?.displayName ?? "あなた"),
        el("p", { class: "rf-set-handle" }, profile !== null && profile.hasHandle ? `@${profile.handle}` : "@未設定"),
        el("dl", { class: "rf-set-account-info" }, el("dt", {}, "Email"), email),
        el("p", { class: "rf-set-guidance" }, guidance),
        state.avatarMessage === ""
          ? null
          : el(
            "p",
            { class: "rf-set-avatar-status", "data-tone": state.avatarTone, role: state.avatarTone === "error" ? "alert" : "status" },
            state.avatarMessage,
          ),
      ),
      profileError,
      model.profileLoadError === null ? profileForm : null,
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

function agentOption(
  agent: SettingsAgentRow,
  selected: boolean,
  context: ScreenContext,
  clientId: string,
  callbacks: SettingsCallbacks,
): HTMLElement {
  const actor = context.actors.get(agent.agentId);
  const option = el(
    "button",
    {
      type: "button",
      class: "rf-set-agent-picker-option",
      role: "option",
      "aria-selected": selected ? "true" : "false",
      "data-agent-id": agent.agentId,
    },
    actor === undefined ? el("span", { class: "rf-set-agent-picker-fallback", "aria-hidden": "true" }, "A") : actorAvatar(actor, { size: "row", showMarker: false }),
    el(
      "span",
      { class: "rf-set-agent-picker-copy" },
      el("span", { class: "rf-set-agent-picker-name" }, agent.displayName),
      el("span", { class: "rf-set-agent-picker-meta" }, agent.provider === "" ? agent.role : `${agent.role} · ${agent.provider}`),
    ),
    selected ? el("span", { class: "rf-set-agent-picker-check", "aria-hidden": "true" }, "✓") : null,
  );
  option.addEventListener("click", () => callbacks.onSelectConnectionAgent(clientId, agent.agentId));
  return option;
}

function connectionAgentSummary(
  row: SettingsMcpConnectionRow,
  model: SettingsModel,
  context: ScreenContext,
): { readonly agent: SettingsAgentRow | null; readonly stale: boolean } {
  void context;
  const agent = row.linkedAgentId === null
    ? null
    : model.agents.find((candidate) => candidate.agentId === row.linkedAgentId) ?? null;
  return {
    agent,
    stale: row.linkedAgentId !== null && (row.linkRevokedAt !== null || agent === null || agent.status !== "active"),
  };
}

function connectionRow(
  row: SettingsMcpConnectionRow,
  model: SettingsModel,
  state: SettingsState,
  context: ScreenContext,
  callbacks: SettingsCallbacks,
): HTMLElement {
  const summary = connectionAgentSummary(row, model, context);
  const activeLink = row.authorized && summary.agent !== null && !summary.stale && row.linkRevokedAt === null;
  const relationActive = row.linkedAgentId !== null && row.linkRevokedAt === null;
  const pickerOpen = Object.prototype.hasOwnProperty.call(state.connectionDrafts, row.clientId);
  const selectedAgentId = state.connectionDrafts[row.clientId] ?? (activeLink ? row.linkedAgentId ?? "" : "");
  const activeAgents = model.agents.filter((agent) => agent.status === "active");
  const busy = state.connectionBusyId === row.clientId;
  const canLink = row.authorized && callbacks.canManageAgents && !busy;
  const canDisconnect = row.authorized && !busy;
  const canReconnect = !row.authorized && !busy;
  const canDelete = !row.authorized && !relationActive && !busy;
  const avatar = summary.agent === null
    ? el("span", { class: "rf-set-connection-agent-placeholder", "aria-hidden": "true" }, "—")
    : (() => {
      const actor = context.actors.get(summary.agent!.agentId);
      return actor === undefined ? el("span", { class: "rf-set-connection-agent-placeholder", "aria-hidden": "true" }, "A") : actorAvatar(actor, { size: "row", showMarker: false });
    })();
  const openPicker = el("button", { type: "button", class: "rf-secondary-button", disabled: canLink ? null : true }, activeLink ? "Agentを変更" : "Agentをリンク");
  openPicker.addEventListener("click", () => callbacks.onOpenAgentPicker(row.clientId));
  const unlink = relationActive
    ? el("button", { type: "button", class: "rf-secondary-button rf-set-connection-unlink", disabled: busy ? true : null }, busy ? "処理中…" : "Unlink")
    : null;
  unlink?.addEventListener("click", () => callbacks.onUnlinkAgent(row.clientId, row.linkedAgentId ?? ""));
  const disconnect = canDisconnect
    ? el("button", { type: "button", class: "rf-secondary-button rf-set-connection-revoke", disabled: busy ? true : null }, busy ? "処理中…" : "Disconnect")
    : null;
  disconnect?.addEventListener("click", () => {
    if (window.confirm("このMCP接続を解除しますか？OAuth認可を取り消し、Agentリンクを無効化します。Agent本体は削除されません。")) callbacks.onDisconnectConnection(row.clientId);
  });
  const reconnect = canReconnect
    ? el("button", { type: "button", class: "rf-secondary-button rf-set-connection-reconnect", disabled: busy ? true : null }, "Reconnect")
    : null;
  reconnect?.addEventListener("click", () => callbacks.onReconnectConnection(row.clientId));
  const remove = canDelete
    ? el("button", { type: "button", class: "rf-secondary-button rf-set-connection-delete", disabled: busy ? true : null }, busy ? "処理中…" : "Delete")
    : null;
  remove?.addEventListener("click", () => {
    if (window.confirm("このMCP接続の履歴とOAuth認可情報を完全に削除しますか？Agent本体は削除されません。この操作は元に戻せません。")) callbacks.onDeleteConnection(row.clientId);
  });
  const picker = pickerOpen
    ? el(
      "div",
      { class: "rf-set-agent-picker", role: "listbox", "aria-label": `${row.clientName}のLinked Agent` },
      activeAgents.length === 0
        ? el("p", { class: "rf-set-agent-picker-empty" }, "リンクできるActive Agentがありません。先にAgentsで登録してください。")
        : activeAgents.map((agent) => agentOption(agent, selectedAgentId === agent.agentId, context, row.clientId, callbacks)),
      el(
        "div",
        { class: "rf-set-agent-picker-actions" },
        el("button", { type: "button", class: "rf-primary-button", disabled: !canLink || selectedAgentId === "" ? true : null }, busy ? "保存中…" : activeLink ? "変更を保存" : "リンクする"),
        el("button", { type: "button", class: "rf-secondary-button", disabled: busy ? true : null }, "キャンセル"),
      ),
    )
    : null;
  const pickerButtons = picker?.querySelectorAll("button");
  if (picker !== null && pickerButtons !== undefined && pickerButtons.length > 0) {
    const actionButtons = [...pickerButtons].slice(-2);
    actionButtons[0]?.addEventListener("click", () => {
      if (selectedAgentId !== "") callbacks.onLinkAgent(row.clientId, selectedAgentId);
    });
    actionButtons[1]?.addEventListener("click", () => callbacks.onCancelAgentPicker(row.clientId));
  }
  return el(
    "article",
    { class: "rf-set-connection-card", "data-authorized": row.authorized ? "true" : "false", "data-linked": activeLink ? "true" : "false" },
    el(
      "div",
      { class: "rf-set-connection-head" },
      el(
        "div",
        { class: "rf-set-connection-copy" },
        el("strong", { class: "rf-set-connection-name" }, row.clientName),
        el("span", { class: "rf-set-connection-id" }, row.clientId),
      ),
      row.authorized
        ? stateChip({ tone: "done", label: "Authorized", mark: "OK" })
        : stateChip({ tone: "neutral", label: "Disconnected", mark: "--" }),
    ),
    el(
      "div",
      { class: "rf-set-connection-link" },
      el("span", { class: "rf-set-connection-label" }, "Linked Agent"),
      avatar,
      el(
        "div",
        { class: "rf-set-connection-agent-copy" },
        el("strong", {}, activeLink ? summary.agent!.displayName : row.linkedAgentId !== null && summary.stale ? "Agentを利用できません" : row.linkedAgentId !== null && !row.authorized ? "接続解除済みのAgentリンク" : "No agent linked"),
        el("span", {}, activeLink ? "このMCP接続はこのAgentとして動作します。" : row.linkedAgentId !== null && summary.stale ? "以前のリンク先が削除または無効になっています。" : row.linkedAgentId !== null && !row.authorized ? "再接続後にAgentリンクを再設定できます。" : "接続はAgentなしでも利用できます。"),
      ),
      el("div", { class: "rf-set-connection-actions" }, openPicker, unlink, disconnect, reconnect, remove),
    ),
    picker,
    state.connectionMessage === "" || state.connectionBusyId !== row.clientId
      ? null
      : el("p", { class: "rf-set-connection-status", "data-tone": state.connectionTone, role: state.connectionTone === "error" ? "alert" : "status" }, state.connectionMessage),
  );
}

function mcpRegion(model: SettingsModel, state: SettingsState, context: ScreenContext, callbacks: SettingsCallbacks): HTMLElement {
  const copyButton = el("button", { type: "button", class: "rf-secondary-button" }, "Copy");
  copyButton.addEventListener("click", () => callbacks.onCopyMcpUrl());
  const connectionBody = model.mcpConnectionLoadError !== null
    ? screenNotice({
      status: "error",
      detail: "MCP接続の一覧を取得できませんでした。Tool利用自体は継続できます。",
      action: { label: "再試行", onAct: callbacks.onRetryMcpConnections },
    })
    : model.isDemo
      ? screenEmpty("MCP接続はPreviewです", "Googleでサインインすると、OAuth MCP clientとLinked Agentをここで管理できます。")
      : model.mcpConnections.length === 0
        ? screenEmpty("接続済みMCP clientはまだありません", "MCP clientを接続すると、ここでどのAgentとして動作するかを設定できます。")
        : el("div", { class: "rf-set-connection-list" }, ...model.mcpConnections.map((row) => connectionRow(row, model, state, context, callbacks)));
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
      el(
        "div",
        { class: "rf-set-mcp-connections" },
        el("div", { class: "rf-set-mcp-subhead" }, el("h3", {}, "Linked Agent"), el("p", {}, "MCP clientがどのAgentとして動作するかを設定します。")),
        state.connectionMessage === ""
          ? null
          : el("p", { class: "rf-set-connection-status", "data-tone": state.connectionTone, role: state.connectionTone === "error" ? "alert" : "status" }, state.connectionMessage),
        connectionBody,
      ),
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
    mcpRegion(model, state, context, callbacks),
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

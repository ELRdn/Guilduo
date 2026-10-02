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

import { t } from "../../../i18n.ts";
import { relayText } from "../relay-copy.ts";
import { actorAvatar } from "../primitives/avatar.ts";
import { el } from "../primitives/dom.ts";
import { relayOnboarding, relayPreferences } from "./relay-onboarding.ts";
import type { ThemePreference } from "../theme.ts";
import {
  effectiveConnectionScopes,
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
    displayName: profile?.displayName ?? "",
    handle: profile?.handle ?? "",
    bio: profile?.bio ?? "",
  };
  const profileBusy = state.profileSaving || state.avatarSaving || model.profileLoadError !== null;
  const controlsDisabled = model.isDemo || profileBusy || context.writeLocked;
  const fileInput = el("input", {
    type: "file",
    class: "rf-visually-hidden",
    accept: "image/png,image/jpeg,image/webp",
    id: "rf-set-avatar-input",
  }) as HTMLInputElement;
  const canUpload = model.profile !== null && !model.isDemo && !profileBusy && !context.writeLocked;
  fileInput.disabled = !canUpload || state.avatarSaving;
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file !== undefined) callbacks.onAvatarFileSelected(file);
    fileInput.value = "";
  });

  const uploadButton = el(
    "button",
    { type: "button", disabled: !canUpload, class: "rf-secondary-button rf-set-avatar-trigger" },
    state.avatarSaving ? relayText("saving") : profile?.hasCustomAvatar ? relayText("imageChange") : relayText("imageUpload"),
  );
  fileInput.tabIndex = -1;
  uploadButton.addEventListener("click", () => fileInput.click());

  const removeButton = el("button", {
    type: "button",
    class: "rf-secondary-button rf-set-avatar-remove",
    disabled: !canUpload || !profile?.hasCustomAvatar,
  }, relayText("imageRemove"));
  removeButton.addEventListener("click", () => callbacks.onRemoveAvatar());

  const progress = state.avatarProgress === null
    ? null
    : el(
      "div",
      { class: "rf-set-avatar-progress", role: "status", "aria-live": "polite" },
      el("progress", { max: 100, value: state.avatarProgress, "aria-label": relayText("avatarProgress") }),
      el("span", {}, `${state.avatarProgress}%`),
    );

  const guidance = model.profileLoadError !== null
    ? relayText("profileLoadFailed")
    : model.isDemo
      ? relayText("profileDemoHint")
      : model.profile === null
        ? relayText("profileSetupHint")
        : relayText("avatarFormats");

  const email = el("dd", { class: "rf-set-account-value" }, model.email || relayText("notLoaded"));
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
    el("p", { class: "rf-set-form-title" }, relayText("profileInformation")),
    el("label", { class: "rf-set-field" }, el("span", { class: "rf-set-field-label" }, t("social.displayName")), displayNameInput, el("small", { class: "rf-set-field-hint" }, relayText("displayNameHint"))),
    el("label", { class: "rf-set-field" }, el("span", { class: "rf-set-field-label" }, relayText("username")), el("span", { class: "rf-set-handle-input-wrap" }, el("span", { class: "rf-set-handle-prefix", "aria-hidden": "true" }, "@"), handleInput), el("small", { class: "rf-set-field-hint" }, `${relayText("handleHint")} · ${relayText("handleCooldown")}`)),
    el("label", { class: "rf-set-field" }, el("span", { class: "rf-set-field-label" }, t("social.bio")), bioInput, el("small", { class: "rf-set-field-hint" }, relayText("bioHint"))),
  );
  const saveProfileButton = el("button", {
    type: "submit",
    class: "rf-primary-button rf-set-profile-submit",
    disabled: controlsDisabled,
  }, state.profileSaving ? relayText("saving") : t("common.save"));
  profileForm.append(saveProfileButton);
  if (state.profileMessage() !== "") {
    profileForm.append(el(
      "p",
      { class: "rf-set-profile-status", "data-tone": state.profileTone, role: state.profileTone === "error" ? "alert" : "status" },
      state.profileMessage(),
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
      el("p", {}, relayText("profileLoadFailed")),
      el("button", { type: "button", class: "rf-secondary-button" }, relayText("retry")),
    );
  profileError?.querySelector("button")?.addEventListener("click", () => callbacks.onRetryProfile());

  return screenRegion(
    relayText("accountTitle"),
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
        el("p", { class: "rf-set-name" }, profile?.displayName || relayText("you")),
        el("p", { class: "rf-set-handle" }, profile !== null && profile.hasHandle ? `@${profile.handle}` : t("account.handleMissing")),
        el("dl", { class: "rf-set-account-info" }, el("dt", {}, "Email"), email),
        el("p", { class: "rf-set-guidance" }, guidance),
        state.avatarMessage() === ""
          ? null
          : el(
            "p",
            { class: "rf-set-avatar-status", "data-tone": state.avatarTone, role: state.avatarTone === "error" ? "alert" : "status" },
            state.avatarMessage(),
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
  { id: "light", get label() { return t("appearance.light"); } },
  { id: "dark", get label() { return t("appearance.dark"); } },
  { id: "system", get label() { return t("appearance.system"); } },
];

function themeControl(model: SettingsModel, callbacks: SettingsCallbacks): HTMLElement {
  return el(
    "fieldset",
    { class: "rf-set-theme-group" },
    el("legend", { class: "rf-visually-hidden" }, t("appearance.menu")),
    ...THEME_OPTIONS.map((option) => {
      const checked = model.theme === option.id;
      const input = el("input", {
        type: "radio",
        name: "rf-set-theme",
        class: "rf-visually-hidden",
        value: option.id,
        checked,
      });
      input.addEventListener("change", () => {
        callbacks.onThemeSelect(option.id);
        queueMicrotask(() => document.querySelector<HTMLInputElement>(`input[name="rf-set-theme"][value="${option.id}"]`)?.focus({ preventScroll: true }));
      });
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
  const effectiveLabel = t(`appearance.${model.effectiveTheme}`);
  return screenRegion(
    relayText("appearanceTitle"),
    {},
    el(
      "div",
      { class: "rf-set-appearance" },
      themeControl(model, callbacks),
      relayPreferences(),
      el(
        "p",
        { class: "rf-set-theme-status" },
        model.theme === "system"
          ? relayText("themeSystemStatus").replace("{mode}", effectiveLabel)
          : relayText("themeFixedStatus").replace("{mode}", effectiveLabel),
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
  busy: boolean,
): HTMLElement {
  const actor = context.actors.get(agent.agentId);
  const option = el(
    "button",
    {
      type: "button",
      class: "rf-set-agent-picker-option",
      "aria-pressed": selected ? "true" : "false",
      "data-agent-id": agent.agentId,
      disabled: busy,
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
  const primary = row.linkedAgentId === null
    ? null
    : model.agents.find((candidate) => candidate.agentId === row.linkedAgentId) ?? null;
  const agent = primary?.status === "active" ? primary : model.agents.find(candidate => row.allowedAgentIds?.includes(candidate.agentId) && candidate.status === "active") ?? primary;
  return {
    agent,
    stale: row.linkedAgentId !== null && (!row.authorized || row.linkRevokedAt !== null || agent === null || agent.status !== "active"),
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
  const activeLink = summary.agent !== null && !summary.stale && row.linkRevokedAt === null;
  const pickerOpen = Object.prototype.hasOwnProperty.call(state.connectionDrafts, row.clientId);
  const allowedAgentIds = row.allowedAgentIds ?? (row.linkedAgentId ? [row.linkedAgentId] : []);
  const selectedAgentIds = state.connectionDrafts[row.clientId] ?? (activeLink ? allowedAgentIds : []);
  const shared = allowedAgentIds.length > 1;
  const activeAgents = model.agents.filter((agent) => agent.status === "active");
  const busy = state.connectionBusyId === row.clientId || context.writeLocked;
  const canLink = row.authorized && callbacks.canManageAgents && !busy;
  const canRevoke = row.authorized;
  const scopes = effectiveConnectionScopes(model, row);
  const avatar = summary.agent === null
    ? el("span", { class: "rf-set-connection-agent-placeholder", "aria-hidden": "true" }, "—")
    : (() => {
      const actor = context.actors.get(summary.agent!.agentId);
      return actor === undefined ? el("span", { class: "rf-set-connection-agent-placeholder", "aria-hidden": "true" }, "A") : actorAvatar(actor, { size: "row", showMarker: false });
    })();
  const openPicker = el("button", { type: "button", class: "rf-secondary-button", disabled: canLink ? null : true }, activeLink ? relayText("agentChange") : relayText("agentLink"));
  openPicker.addEventListener("click", () => callbacks.onOpenAgentPicker(row.clientId));
  const unlink = activeLink || (row.linkedAgentId !== null && row.linkRevokedAt === null)
    ? el("button", { type: "button", class: "rf-secondary-button rf-set-connection-unlink", disabled: busy ? true : null }, busy ? relayText("executing") : relayText("agentUnlink"))
    : null;
  unlink?.addEventListener("click", () => callbacks.onUnlinkAgent(row.clientId, row.linkedAgentId ?? ""));
  const revoke = canRevoke
    ? el("button", { type: "button", class: "rf-secondary-button rf-set-connection-revoke", disabled: busy ? true : null }, busy ? relayText("executing") : relayText("mcpDisconnect"))
    : null;
  revoke?.addEventListener("click", () => {
    if (window.confirm(relayText("disconnectConfirm"))) callbacks.onRevokeConnection(row.clientId);
  });
  const remove = !row.authorized
    ? el("button", { type: "button", class: "rf-secondary-button rf-set-connection-delete", disabled: busy }, busy ? relayText("executing") : relayText("mcpDelete"))
    : null;
  remove?.addEventListener("click", () => {
    if (window.confirm(relayText("mcpDeleteConfirm"))) callbacks.onDeleteConnection(row.clientId);
  });
  const picker = pickerOpen
    ? el(
      "div",
      { class: "rf-set-agent-picker", role: "group", "aria-label": `${relayText("selectSharedAgents")}: ${row.clientName}` },
      el("p", {}, relayText("selectSharedAgents")),
      activeAgents.length === 0
        ? el("p", { class: "rf-set-agent-picker-empty" }, relayText("noActiveAgents"))
        : activeAgents.map((agent) => agentOption(agent, selectedAgentIds.includes(agent.agentId), context, row.clientId, callbacks, busy)),
      el(
        "div",
        { class: "rf-set-agent-picker-actions" },
        el("button", { type: "button", class: "rf-primary-button", disabled: !canLink || selectedAgentIds.length === 0 ? true : null }, busy ? relayText("saving") : activeLink ? relayText("saveChanges") : relayText("link")),
        el("button", { type: "button", class: "rf-secondary-button", disabled: busy ? true : null }, relayText("dialogCancel")),
      ),
    )
    : null;
  const pickerButtons = picker?.querySelectorAll("button");
  if (picker !== null && pickerButtons !== undefined && pickerButtons.length > 0) {
    const actionButtons = [...pickerButtons].slice(-2);
    actionButtons[0]?.addEventListener("click", () => {
      if (selectedAgentIds[0]) callbacks.onLinkAgent(row.clientId, selectedAgentIds[0]);
    });
    actionButtons[1]?.addEventListener("click", () => callbacks.onCancelAgentPicker(row.clientId));
  }
  return el(
    "article",
    { class: "rf-set-connection-card", "data-client-id": row.clientId, "data-authorized": row.authorized ? "true" : "false", "data-linked": activeLink ? "true" : "false" },
    el(
      "div",
      { class: "rf-set-connection-head" },
      el(
        "div",
        { class: "rf-set-connection-copy" },
        el("strong", { class: "rf-set-connection-name" }, row.clientName),
      ),
      row.authorized
        ? stateChip({ tone: "done", label: relayText("authorized"), mark: "OK" })
        : stateChip({ tone: "neutral", label: t("integration.status.reconnect_required"), mark: "--" }),
    ),
    el(
      "div",
      { class: "rf-set-connection-link" },
      el("span", { class: "rf-set-connection-label" }, relayText(shared ? "sharedAgents" : "linkedAgent")),
      avatar,
      el(
        "div",
        { class: "rf-set-connection-agent-copy" },
        el("strong", {}, activeLink ? (shared ? allowedAgentIds.map(id => model.agents.find(agent => agent.agentId === id)?.displayName ?? id).join(" · ") : summary.agent!.displayName) : row.linkedAgentId !== null && summary.stale ? relayText("agentUnavailable") : relayText("noAgentLinked")),
        el("span", {}, !row.authorized ? t("integration.status.reconnect_required") : activeLink ? relayText(shared ? "sharedAgentHint" : "linkedAgentHint") : row.linkedAgentId !== null && summary.stale ? relayText("staleAgentHint") : relayText("noAgentHint")),
      ),
      el("div", { class: "rf-set-connection-actions" }, openPicker, unlink, revoke, remove),
    ),
    el("p", { class: "rf-set-connection-permissions" }, relayText(shared ? "sharedAgentScopes" : scopes.includes("quests:write") ? (scopes.includes("quests:read") ? "mcpQuestReadWrite" : "mcpQuestWrite") : scopes.includes("quests:read") ? "mcpQuestRead" : "mcpNoQuestAccess")),
    el("details", { class: "rf-set-connection-details" },
      el("summary", {}, relayText("mcpDetails")),
      el("p", {}, el("span", { class: "rf-set-connection-id" }, row.clientId)),
      el("p", {}, relayText("effectiveScopes")),
      shared ? el("ul", {}, ...allowedAgentIds.map(id => el("li", {},
        el("strong", {}, model.agents.find(agent => agent.agentId === id)?.displayName ?? id),
        el("code", {}, `: ${effectiveConnectionScopes(model, { ...row, linkedAgentId:id }).join(", ") || relayText("noScopes")}`),
      ))) : scopes.length === 0 ? el("p", {}, relayText("noScopes")) : el("ul", {}, ...scopes.map(scope => el("li", {}, el("code", {}, scope)))),
    ),
    picker,
    state.connectionMessage() === "" || state.connectionBusyId !== row.clientId
      ? null
      : el("p", { class: "rf-set-connection-status", "data-tone": state.connectionTone, role: state.connectionTone === "error" ? "alert" : "status" }, state.connectionMessage()),
  );
}

function mcpRegion(model: SettingsModel, state: SettingsState, context: ScreenContext, callbacks: SettingsCallbacks): HTMLElement {
  const copyButton = el("button", { type: "button", class: "rf-secondary-button" }, t("common.copy"));
  copyButton.addEventListener("click", () => callbacks.onCopyMcpUrl());
  const connectionBody = model.mcpConnectionLoadError !== null
    ? screenNotice({
      status: "error",
      detail: relayText("mcpListFailed"),
      action: { label: relayText("retry"), onAct: callbacks.onRetryMcpConnections },
    })
    : model.isDemo
      ? screenEmpty(relayText("mcpDemoTitle"), relayText("mcpDemoHint"))
      : model.mcpConnections.length === 0
        ? screenEmpty(relayText("mcpEmptyTitle"), relayText("mcpEmptyHint"))
        : el("div", { class: "rf-set-connection-list" }, ...model.mcpConnections.map((row) => connectionRow(row, model, state, context, callbacks)));
  return screenRegion(
    relayText("mcpConnectionTitle"),
    {},
    el(
      "div",
      { class: "rf-set-mcp" },
      relayOnboarding(model, callbacks),
      el(
        "div",
        { class: "rf-set-mcp-row" },
        el("input", {
          type: "text",
          class: "rf-set-mcp-url",
          value: model.mcpUrl,
          readonly: true,
          "aria-label": relayText("stableMcpUrl"),
        }),
        copyButton,
      ),
      state.mcpCopyMessage() === ""
        ? null
        : el(
          "p",
          { class: "rf-set-mcp-status", "data-tone": state.mcpCopyTone, role: state.mcpCopyTone === "error" ? "alert" : "status" },
          state.mcpCopyMessage(),
        ),
      el("p", { class: "rf-set-mcp-note" }, relayText("mcpOAuthHint")),
      el(
        "div",
        { class: "rf-set-mcp-connections" },
        el("div", { class: "rf-set-mcp-subhead" }, el("h3", { tabindex: "-1" }, relayText("linkedAgent")), el("p", {}, relayText("linkedAgentSetupHint"))),
        state.connectionMessage() === ""
          ? null
          : el("p", { class: "rf-set-connection-status", "data-tone": state.connectionTone, role: state.connectionTone === "error" ? "alert" : "status" }, state.connectionMessage()),
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
  const edit = el("button", { type: "button", class: "rf-secondary-button", disabled:context.writeLocked }, t("common.edit"));
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
    row.status === "disabled" ? stateChip({ tone: "neutral", label: relayText("disabled"), mark: "‖" }) : null,
    edit,
  );
}

function agentsRegion(model: SettingsModel, context: ScreenContext, callbacks: SettingsCallbacks): HTMLElement {
  const create = el("button", { type: "button", class: "rf-primary-button", disabled:context.writeLocked }, relayText("registerAgent"));
  create.addEventListener("click", () => callbacks.onCreateAgent());
  return screenRegion(
    relayText("agentsTitle"),
    {},
    metricRow([{ label: relayText("registered"), value: String(model.agents.length) } as Metric]),
    !callbacks.canManageAgents
      ? el("p", { class: "rf-unavailable" }, relayText("agentSignInHint"))
      : model.agents.length === 0
        ? el("p", { class: "rf-set-agent-empty" }, relayText("agentsEmpty"))
        : el("div", { class: "rf-set-agent-list" }, ...model.agents.map((row) => agentRow(row, context, callbacks))),
    callbacks.canManageAgents ? create : null,
  );
}

/* ------------------------------------------------------------------ *
 * Screen assembly
 * ------------------------------------------------------------------ */

const SECTION_LABEL: Readonly<Record<SettingsSection, string>> = {
  top: "Settings",
  get account() { return relayText("accountTitle"); },
  get appearance() { return relayText("appearanceTitle"); },
  get mcp() { return relayText("mcpConnectionTitle"); },
  get agents() { return relayText("agentsTitle"); },
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
    screenHeader({ title: "Settings", question: relayText("settingsQuestion") }),
    accountRegion(model, state, context, callbacks),
    appearanceRegion(model, callbacks),
    mcpRegion(model, state, context, callbacks),
    agentsRegion(model, context, callbacks),
  );
  return main;
}

/** Scrolls the requested section into view once, after the DOM is attached. */
function applyPendingFocus(main: HTMLElement, section: SettingsSection | null): void {
  if (section === null) return;
  if (section === "top") {
    const heading = main.querySelector<HTMLElement>("h1");
    if (heading) { heading.tabIndex = -1; heading.focus(); }
    return;
  }
  const label = SECTION_LABEL[section];
  const region = [...main.querySelectorAll<HTMLElement>(".rf-screen-region")]
    .find((node) => node.getAttribute("aria-label") === label);
  region?.scrollIntoView({ block: "start" });
  const heading = region?.querySelector<HTMLElement>("h2");
  if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
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

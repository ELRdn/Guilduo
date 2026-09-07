import { el } from "../primitives/dom.ts";
import { relayText as t } from "../relay-copy.ts";
import { getLocale, setLocale, SUPPORTED_LOCALES, LOCALE_METADATA } from "../../../i18n.ts";
import { effectiveConnectionScopes, type SettingsCallbacks, type SettingsModel } from "./settings-model.ts";

export function relayOnboarding(model: SettingsModel, callbacks: SettingsCallbacks): HTMLElement {
  const section = el("section", { class: "rf-relay-onboarding", "aria-label": t("onboard") });
  const registered = model.agents.some((agent) => agent.status === "active");
  const connected = model.mcpConnections.some((row) => row.authorized && !row.revokedAt);
  const linked = model.mcpConnections.some((row) => effectiveConnectionScopes(model, row).includes("quests:read"));
  const steps = el("ol", { class: "rf-relay-onboarding-steps" });
  for (const [label, ready] of [[t("registerAgent"), registered], [t("connectClient"), connected], [t("linkConnection"), linked]] as const) {
    steps.append(el("li", {}, el("strong", {}, label), el("span", { class: "rf-relay-step-status" }, model.isDemo ? t("missing") : ready ? t("ready") : t("missing"))));
  }
  const create = el("button", { type: "button", class: "rf-secondary-button", disabled: model.isDemo || !callbacks.canManageAgents }, t("registerAgent"));
  create.addEventListener("click", callbacks.onCreateAgent);
  steps.firstElementChild?.append(create);
  steps.append(el("li", {}, el("strong", {}, t("firstExchange")), el("p", {}, t("firstHint")), el("code", {}, "get_current_agent_context → list_quests → get_quest → update_quest")));
  section.append(el("h3", {}, t("onboard")), el("p", {}, t("ownership")), steps);
  for (const row of model.mcpConnections) {
    const scopes = effectiveConnectionScopes(model, row);
    const agent = model.agents.find((entry) => entry.agentId === row.linkedAgentId);
    section.append(el("p", {}, `${row.clientName} → ${agent?.displayName || "—"}`, el("br"), `${t("effectiveScopes")}: ${scopes.length ? scopes.join(", ") : t("noScopes")}`));
    if (!scopes.includes("quests:write")) section.append(el("p", {}, t("readOnlyHint")));
  }
  return section;
}

export function relayPreferences(): HTMLElement {
  const language = el("select", { "aria-label": t("language"), class: "rf-set-theme-select" }, ...SUPPORTED_LOCALES.map((locale) => el("option", { value: locale }, LOCALE_METADATA[locale].label)));
  language.value = getLocale();
  language.addEventListener("change", () => setLocale(language.value));
  const motion = el("input", { type: "checkbox" });
  try { motion.checked = localStorage.getItem("questforge-relay-motion") !== "off"; } catch { motion.checked = true; }
  motion.addEventListener("change", () => { try { localStorage.setItem("questforge-relay-motion", motion.checked ? "on" : "off"); } catch { /* Optional preference. */ } });
  return el("div", { class: "rf-relay-preferences" }, el("label", {}, t("language"), language), el("label", { class: "rf-human-request-check" }, motion, t("motion")));
}

import { IntlMessageFormat } from "intl-messageformat";
import ja from "./locales/ja.mjs";
import en from "./locales/en.mjs";
import es from "./locales/es.mjs";
import ptBR from "./locales/pt-BR.mjs";
import fr from "./locales/fr.mjs";
import de from "./locales/de.mjs";
import ko from "./locales/ko.mjs";
import zhHans from "./locales/zh-Hans.mjs";
import ru from "./locales/ru.mjs";

export const SUPPORTED_LOCALES = Object.freeze(["ja", "en", "es", "pt-BR", "fr", "de", "ko", "zh-Hans", "ru"]);
export const LOCALE_STORAGE_KEY = "questforge-locale";

export const LOCALE_METADATA = Object.freeze({
  ja: Object.freeze({
    tag: "ja",
    label: "日本語",
    direction: "ltr",
    manifest: "/manifest.webmanifest",
    fallbackManifest: "/manifest.webmanifest",
    fallback: "en",
  }),
  en: Object.freeze({
    tag: "en",
    label: "English",
    direction: "ltr",
    manifest: "/manifest.en.webmanifest",
    fallbackManifest: "/manifest.webmanifest",
    fallback: "ja",
  }),
  es: Object.freeze({
    tag: "es",
    label: "Español",
    direction: "ltr",
    manifest: "/manifest.en.webmanifest",
    fallbackManifest: "/manifest.en.webmanifest",
    fallback: "en",
  }),
  "pt-BR": Object.freeze({
    tag: "pt-BR",
    label: "Português (Brasil)",
    direction: "ltr",
    manifest: "/manifest.en.webmanifest",
    fallbackManifest: "/manifest.en.webmanifest",
    fallback: "en",
  }),
  fr: Object.freeze({
    tag: "fr",
    label: "Français",
    direction: "ltr",
    manifest: "/manifest.en.webmanifest",
    fallbackManifest: "/manifest.en.webmanifest",
    fallback: "en",
  }),
  de: Object.freeze({
    tag: "de",
    label: "Deutsch",
    direction: "ltr",
    manifest: "/manifest.en.webmanifest",
    fallbackManifest: "/manifest.en.webmanifest",
    fallback: "en",
  }),
  ko: Object.freeze({
    tag: "ko",
    label: "한국어",
    direction: "ltr",
    manifest: "/manifest.en.webmanifest",
    fallbackManifest: "/manifest.en.webmanifest",
    fallback: "en",
  }),
  "zh-Hans": Object.freeze({
    tag: "zh-Hans",
    label: "简体中文",
    direction: "ltr",
    manifest: "/manifest.en.webmanifest",
    fallbackManifest: "/manifest.en.webmanifest",
    fallback: "en",
  }),
  ru: Object.freeze({
    tag: "ru",
    label: "Русский",
    direction: "ltr",
    manifest: "/manifest.en.webmanifest",
    fallbackManifest: "/manifest.en.webmanifest",
    fallback: "en",
  }),
});

const messages = Object.freeze({
  ja: Object.freeze(ja),
  en: Object.freeze(en),
  es: Object.freeze(es),
  "pt-BR": Object.freeze(ptBR),
  fr: Object.freeze(fr),
  de: Object.freeze(de),
  ko: Object.freeze(ko),
  "zh-Hans": Object.freeze(zhHans),
  ru: Object.freeze(ru),
});

const formatterCache = new Map();
const normalizedLocales = new Map(SUPPORTED_LOCALES.map((locale) => [locale.toLowerCase(), locale]));
const localeAliases = new Map([
  ["pt", "pt-BR"],
  ["zh", "zh-Hans"],
  ["zh-cn", "zh-Hans"],
  ["zh-sg", "zh-Hans"],
  ["zh-hans", "zh-Hans"],
]);

function normalizeLanguageTag(tag) {
  return String(tag ?? "").trim().toLowerCase().replace(/_/g, "-");
}

export function resolveLocale(tag) {
  const normalized = normalizeLanguageTag(tag);
  if (!normalized) return null;
  if (normalizedLocales.has(normalized)) return normalizedLocales.get(normalized);
  if (localeAliases.has(normalized)) return localeAliases.get(normalized);
  if (normalized === "zh-hant" || /^zh-(tw|hk|mo|hant)(-|$)/.test(normalized)) return null;
  const primary = normalized.split("-")[0];
  return normalizedLocales.get(primary) || localeAliases.get(primary) || null;
}

function browserLocale() {
  const navigator = globalThis.navigator;
  let candidates = [];
  if (navigator) {
    if (Array.isArray(navigator.languages)) {
      candidates = navigator.languages.filter((tag) => String(tag || "").trim());
    }
    if (!candidates.length && String(navigator.language || "").trim()) {
      candidates = [navigator.language];
    }
  }
  if (!candidates.length) candidates = ["ja"];
  for (const tag of candidates) {
    const locale = resolveLocale(tag);
    if (locale) return locale;
  }
  return "en";
}

let activeLocale;

export function getLocale() {
  if (activeLocale) return activeLocale;
  let stored = "";
  try { stored = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY) || ""; } catch { /* Device storage is optional. */ }
  activeLocale = resolveLocale(stored) || browserLocale();
  return activeLocale;
}

function getFormatter(locale, key) {
  const cacheKey = `${locale}\u0000${key}`;
  if (formatterCache.has(cacheKey)) return formatterCache.get(cacheKey);
  const template = messages[locale]?.[key];
  let formatter = null;
  if (typeof template === "string") {
    try {
      formatter = new IntlMessageFormat(template, locale);
    } catch {
      formatter = null;
    }
  }
  formatterCache.set(cacheKey, formatter);
  return formatter;
}

export function t(key, variables = {}) {
  const locale = getLocale();
  for (const candidate of [...new Set([locale, "en", "ja"])]) {
    const formatter = getFormatter(candidate, key);
    if (!formatter) continue;
    try {
      const formatted = formatter.format(variables);
      return typeof formatted === "string" ? formatted : formatted.join("");
    } catch {
      // Malformed message or missing variable: try the next fallback.
    }
  }
  return key;
}

export function formatDate(value, options = {}) {
  const date = value instanceof Date ? value : new Date(String(value).includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return new Intl.DateTimeFormat(getLocale(), { year: "numeric", month: "short", day: "numeric", ...options }).format(date);
}

export function formatNumber(value, options = {}) {
  return new Intl.NumberFormat(getLocale(), options).format(Number(value || 0));
}

export function compareText(a, b) {
  return new Intl.Collator(getLocale(), { numeric: true, sensitivity: "base" }).compare(String(a), String(b));
}

const viewKeys = {
  tasks: "nav.tasks", bosses: "nav.bosses", battle: "nav.battle", character: "nav.character",
  shop: "nav.shop", party: "nav.party", inventory: "nav.inventory", integrations: "nav.integrations",
};

export function applyDocumentTranslations(root = globalThis.document) {
  if (!root) return;
  const locale = getLocale();
  const metadata = LOCALE_METADATA[locale];
  root.documentElement.lang = locale;
  root.documentElement.dir = metadata?.direction || "ltr";
  root.querySelectorAll("[data-i18n]").forEach((element) => { element.textContent = t(element.dataset.i18n); });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  root.querySelectorAll("[data-i18n-aria-label]").forEach((element) => { element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel)); });
  root.querySelectorAll("[data-i18n-title]").forEach((element) => { element.title = t(element.dataset.i18nTitle); });
  root.querySelectorAll("[data-i18n-label]").forEach((element) => { element.label = t(element.dataset.i18nLabel); });
  root.querySelectorAll("[data-view]").forEach((element) => {
    const key = viewKeys[element.dataset.view];
    if (key && !element.classList.contains("sync-integrations-button")) element.textContent = t(key);
  });
  const signIn = root.querySelector("#syncSignInButton");
  const settings = root.querySelector(".sync-integrations-button");
  if (signIn) signIn.textContent = t("sync.signIn");
  if (settings) settings.textContent = t("sync.settings");
  const localeSelect = root.querySelector("#localeSelect");
  if (localeSelect) localeSelect.value = locale;
  for (const [selector, prefix] of [["#taskKind", "kind"], ["#taskDifficulty", "difficulty"], ["#taskRepeat", "repeat"]]) {
    root.querySelectorAll(`${selector} option`).forEach((option) => {
      const label = t(`${prefix}.${option.value}`);
      if (label !== `${prefix}.${option.value}`) option.textContent = label;
    });
  }
  const selfAssignee = root.querySelector('#taskAssignee option[value="self:self"]');
  const customAssignee = root.querySelector('#taskAssignee option[value="agent:custom"]');
  if (selfAssignee) selfAssignee.textContent = t("task.assignee.self");
  if (customAssignee) customAssignee.textContent = t("task.assignee.custom");
  const manifest = root.querySelector('link[rel="manifest"]');
  if (manifest) manifest.href = metadata?.manifest || (locale === "en" ? "/manifest.en.webmanifest" : "/manifest.webmanifest");
}

export function setLocale(locale) {
  const resolved = resolveLocale(locale);
  if (!resolved) return getLocale();
  activeLocale = resolved;
  try { globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, resolved); } catch { /* Device storage is optional. */ }
  applyDocumentTranslations();
  globalThis.dispatchEvent?.(new CustomEvent("questforge:locale-changed", { detail: { locale: resolved } }));
  return resolved;
}

export function resetLocaleForTests() {
  activeLocale = undefined;
}

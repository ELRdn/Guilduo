import { IntlMessageFormat } from "intl-messageformat";
import ja from "./locales/ja.ts";
import en from "./locales/en.ts";
import es from "./locales/es.ts";
import ptBR from "./locales/pt-BR.ts";
import fr from "./locales/fr.ts";
import de from "./locales/de.ts";
import ko from "./locales/ko.ts";
import zhHans from "./locales/zh-Hans.ts";
import ru from "./locales/ru.ts";

export const SUPPORTED_LOCALES = Object.freeze(["ja", "en", "es", "pt-BR", "fr", "de", "ko", "zh-Hans", "ru"] as const);
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const LOCALE_STORAGE_KEY = "questforge-locale";

type MessageCatalog = Readonly<Record<string, string>>;
type TranslationElement = {
  textContent: string | null;
  dataset: Record<string, string | undefined>;
  placeholder?: string;
  title?: string;
  label?: string;
  value?: string;
  href?: string;
  classList: { contains: (name: string) => boolean };
  setAttribute: (name: string, value: string) => void;
  querySelector: (selector: string) => TranslationElement | null;
};
type TranslationRoot = {
  documentElement: { lang: string; dir: string };
  querySelectorAll: (selector: string) => TranslationElement[];
  querySelector: (selector: string) => TranslationElement | null;
};
type I18nRuntime = {
  document?: TranslationRoot;
  localStorage?: { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };
  navigator?: { languages?: readonly string[]; language?: string };
  dispatchEvent?: (event: unknown) => boolean;
};

const runtimeGlobal = globalThis as unknown as I18nRuntime;

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

const messages: Readonly<Record<SupportedLocale, MessageCatalog>> = Object.freeze({
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

const formatterCache = new Map<string, IntlMessageFormat | null>();
const normalizedLocales = new Map<string, SupportedLocale>(SUPPORTED_LOCALES.map((locale) => [locale.toLowerCase(), locale]));
const localeAliases = new Map<string, SupportedLocale>([
  ["pt", "pt-BR"],
  ["zh", "zh-Hans"],
  ["zh-cn", "zh-Hans"],
  ["zh-sg", "zh-Hans"],
  ["zh-hans", "zh-Hans"],
]);

function normalizeLanguageTag(tag: unknown): string {
  return String(tag ?? "").trim().toLowerCase().replace(/_/g, "-");
}

export function resolveLocale(tag: unknown): SupportedLocale | null {
  const normalized = normalizeLanguageTag(tag);
  if (!normalized) return null;
  if (normalizedLocales.has(normalized)) return normalizedLocales.get(normalized) ?? null;
  if (localeAliases.has(normalized)) return localeAliases.get(normalized) ?? null;
  if (normalized === "zh-hant" || /^zh-(tw|hk|mo|hant)(-|$)/.test(normalized)) return null;
  const primary = normalized.split("-")[0];
  return normalizedLocales.get(primary) ?? localeAliases.get(primary) ?? null;
}

function browserLocale(): SupportedLocale {
  const navigator = runtimeGlobal.navigator;
  let candidates: string[] = [];
  if (navigator) {
    if (Array.isArray(navigator.languages)) {
      candidates = navigator.languages.filter((tag) => String(tag || "").trim());
    }
    const language = navigator.language;
    if (!candidates.length && language && String(language).trim()) {
      candidates = [language];
    }
  }
  if (!candidates.length) candidates = ["ja"];
  for (const tag of candidates) {
    const locale = resolveLocale(tag);
    if (locale) return locale;
  }
  return "en";
}

let activeLocale: SupportedLocale | undefined;

export function getLocale(): SupportedLocale {
  if (activeLocale) return activeLocale;
  let stored = "";
  try { stored = runtimeGlobal.localStorage?.getItem(LOCALE_STORAGE_KEY) || ""; } catch { /* Device storage is optional. */ }
  activeLocale = resolveLocale(stored) || browserLocale();
  return activeLocale;
}

function getFormatter(locale: SupportedLocale, key: string): IntlMessageFormat | null {
  const cacheKey = `${locale}\u0000${key}`;
  const cached = formatterCache.get(cacheKey);
  if (cached !== undefined) return cached;
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

export function t(key: string, variables: Record<string, unknown> = {}): string {
  const locale = getLocale();
  const candidates: SupportedLocale[] = [locale, "en", "ja"].filter((candidate, index, all) => all.indexOf(candidate) === index) as SupportedLocale[];
  for (const candidate of candidates) {
    const formatter = getFormatter(candidate, key);
    if (!formatter) continue;
    try {
      const formatted = formatter.format(variables);
      return typeof formatted === "string" ? formatted : Array.isArray(formatted) ? formatted.join("") : String(formatted);
    } catch {
      // Malformed message or missing variable: try the next fallback.
    }
  }
  return key;
}

export function formatDate(value: unknown, options: Intl.DateTimeFormatOptions = {}): string {
  const dateText = String(value ?? "");
  const date = value instanceof Date ? value : new Date(dateText.includes("T") ? dateText : `${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return new Intl.DateTimeFormat(getLocale(), { year: "numeric", month: "short", day: "numeric", ...options }).format(date);
}

export function formatNumber(value: unknown, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(getLocale(), options).format(Number(value || 0));
}

export function compareText(a: unknown, b: unknown): number {
  return new Intl.Collator(getLocale(), { numeric: true, sensitivity: "base" }).compare(String(a), String(b));
}

const viewKeys: Record<string, string> = {
  tasks: "nav.tasks", bosses: "nav.bosses", battle: "nav.battle", character: "nav.character",
  shop: "nav.shop", party: "nav.party", inventory: "nav.inventory", integrations: "nav.integrations",
};

export function applyDocumentTranslations(root: TranslationRoot | undefined = runtimeGlobal.document) {
  if (!root) return;
  const locale = getLocale();
  const metadata = LOCALE_METADATA[locale];
  root.documentElement.lang = locale;
  root.documentElement.dir = metadata?.direction || "ltr";
  root.querySelectorAll("[data-i18n]").forEach((element) => { element.textContent = t(element.dataset.i18n || ""); });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder || ""); });
  root.querySelectorAll("[data-i18n-aria-label]").forEach((element) => { element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel || "")); });
  root.querySelectorAll("[data-i18n-title]").forEach((element) => { element.title = t(element.dataset.i18nTitle || ""); });
  root.querySelectorAll("[data-i18n-label]").forEach((element) => { element.label = t(element.dataset.i18nLabel || ""); });
  root.querySelectorAll("[data-view]").forEach((element) => {
    const key = viewKeys[element.dataset.view || ""];
    if (key && !element.classList.contains("sync-integrations-button")) {
      const labelTarget = element.querySelector("b");
      if (labelTarget) labelTarget.textContent = t(key);
      else element.textContent = t(key);
    }
  });
  const signIn = root.querySelector("#syncSignInButton");
  const settings = root.querySelector(".sync-integrations-button");
  if (signIn) signIn.textContent = t("sync.signIn");
  if (settings) settings.textContent = t("sync.settings");
  const localeSelect = root.querySelector("#localeSelect");
  if (localeSelect) localeSelect.value = locale;
  for (const [selector, prefix] of [["#taskKind", "kind"], ["#taskDifficulty", "difficulty"], ["#taskRepeat", "repeat"]] as const) {
    root.querySelectorAll(`${selector} option`).forEach((option) => {
      const value = option.value || "";
      const label = t(`${prefix}.${value}`);
      if (label !== `${prefix}.${value}`) option.textContent = label;
    });
  }
  const selfAssignee = root.querySelector('#taskAssignee option[value="self:self"]');
  const customAssignee = root.querySelector('#taskAssignee option[value="agent:custom"]');
  if (selfAssignee) selfAssignee.textContent = t("task.assignee.self");
  if (customAssignee) customAssignee.textContent = t("task.assignee.custom");
  const manifest = root.querySelector('link[rel="manifest"]');
  if (manifest) manifest.href = metadata.manifest || (locale === "en" ? "/manifest.en.webmanifest" : "/manifest.webmanifest");
}

export function setLocale(locale: unknown): SupportedLocale {
  const resolved = resolveLocale(locale);
  if (!resolved) return getLocale();
  activeLocale = resolved;
  try { runtimeGlobal.localStorage?.setItem(LOCALE_STORAGE_KEY, resolved); } catch { /* Device storage is optional. */ }
  applyDocumentTranslations();
  runtimeGlobal.dispatchEvent?.(new CustomEvent("questforge:locale-changed", { detail: { locale: resolved } }));
  return resolved;
}

export function resetLocaleForTests() {
  activeLocale = undefined;
}

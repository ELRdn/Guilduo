import mcpContract from "../api/mcp-tools.json";
import openApiContract from "../api/openapi.json";
import packageMetadata from "../package.json";
import "../runtime-config.js";
import "./styles.css";
import { resolvePublicUrl } from "./config";

type ThemeChoice = "dark" | "light" | "system";

const THEME_KEY = "guilduo-lp-theme";
const root = document.documentElement;
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function storedTheme(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    if (value === "dark" || value === "light" || value === "system") return value;
  } catch {
    // Dark remains the marketing default when storage is unavailable.
  }
  return "dark";
}

function resolveTheme(choice: ThemeChoice): "dark" | "light" {
  return choice === "system" ? (systemDark.matches ? "dark" : "light") : choice;
}

function applyTheme(choice: ThemeChoice): void {
  const resolved = resolveTheme(choice);
  root.dataset.theme = resolved;
  root.dataset.themeChoice = choice;
  root.style.colorScheme = resolved;
  document.querySelectorAll<HTMLSelectElement>("[data-theme-control]").forEach((control) => {
    control.value = choice;
  });
  document.querySelectorAll<HTMLImageElement>("[data-theme-image]").forEach((image) => {
    const nextSource = resolved === "light" ? image.dataset.lightSrc : image.dataset.darkSrc;
    if (!nextSource) return;
    if (image.hasAttribute("data-deferred-src")) {
      image.dataset.deferredSrc = nextSource;
    } else if (image.src !== new URL(nextSource, window.location.href).href) {
      image.src = nextSource;
    }
  });
}

function saveTheme(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    // The selected theme still applies for this page view.
  }
  applyTheme(choice);
}

function activateCta(selector: string, configuredUrl: unknown): void {
  const href = resolvePublicUrl(configuredUrl, window.location.href, window.location.origin);
  document.querySelectorAll<HTMLButtonElement>(selector).forEach((button) => {
    if (!href) return;
    const link = document.createElement("a");
    link.className = button.className;
    link.textContent = button.textContent;
    link.href = href;
    Object.assign(link.dataset, button.dataset);
    link.dataset.state = "ready";
    if (new URL(href).origin !== window.location.origin) {
      link.target = "_blank";
      link.rel = "noreferrer";
    }
    button.replaceWith(link);
  });
}

function contractToolCount(): number {
  if (Array.isArray(mcpContract)) return mcpContract.length;
  const contract = mcpContract as { tools?: unknown[] };
  return Array.isArray(contract.tools) ? contract.tools.length : 0;
}

function hydrateFacts(): void {
  const toolCount = contractToolCount();
  document.querySelectorAll<HTMLElement>("[data-tool-count]").forEach((node) => {
    node.textContent = String(toolCount);
  });
  document.querySelectorAll<HTMLElement>("[data-mcp-version]").forEach((node) => {
    node.textContent = openApiContract.info.version;
  });
  document.querySelectorAll<HTMLElement>("[data-product-version]").forEach((node) => {
    node.textContent = packageMetadata.version;
  });
}

function hydrateSeoLinks(): void {
  const canonicalPath = document.querySelector<HTMLMetaElement>('meta[name="guilduo:canonical-path"]')?.content
    ?? (document.documentElement.lang === "en" ? "/lp/en/" : "/");
  const links = [
    { rel: "canonical", href: canonicalPath },
    { rel: "alternate", href: "/", hreflang: "ja" },
    { rel: "alternate", href: "/lp/en/", hreflang: "en" },
    { rel: "alternate", href: "/", hreflang: "x-default" },
  ];
  for (const definition of links) {
    const selector = definition.hreflang
      ? `link[rel="${definition.rel}"][hreflang="${definition.hreflang}"]`
      : `link[rel="${definition.rel}"]`;
    if (document.head.querySelector(selector)) continue;
    const link = document.createElement("link");
    link.rel = definition.rel;
    link.href = new URL(definition.href, window.location.origin).href;
    if (definition.hreflang) link.hreflang = definition.hreflang;
    document.head.append(link);
  }
}

function loadDeferredImages(): void {
  const images = document.querySelectorAll<HTMLImageElement>("img[data-deferred-src]");
  const load = (image: HTMLImageElement) => {
    const source = image.dataset.deferredSrc;
    if (!source) return;
    image.src = source;
    image.removeAttribute("data-deferred-src");
  };
  if (!("IntersectionObserver" in window)) {
    images.forEach(load);
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      load(entry.target as HTMLImageElement);
      observer.unobserve(entry.target);
    }
  }, { rootMargin: "160px 0px" });
  images.forEach((image) => observer.observe(image));
}

function bindBridgeMotion(): void {
  const bridge = document.querySelector<HTMLElement>("[data-relay-bridge]");
  if (!bridge || reducedMotion.matches) return;
  let queued = false;
  const update = () => {
    queued = false;
    const rect = bridge.getBoundingClientRect();
    const viewport = window.innerHeight;
    const progress = Math.min(1, Math.max(0, (viewport * 0.78 - rect.top) / Math.max(viewport, rect.height - viewport * 0.35)));
    bridge.style.setProperty("--bridge-progress", progress.toFixed(3));
  };
  const requestUpdate = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(update);
  };
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  requestUpdate();
}

function bindStickyCta(): void {
  const bar = document.querySelector<HTMLElement>("[data-sticky-cta]");
  const trigger = document.querySelector<HTMLElement>("#guild");
  const finalCta = document.querySelector<HTMLElement>("#join");
  if (!bar || !trigger || !finalCta || !("IntersectionObserver" in window)) return;
  let reachedProof = false;
  const update = () => {
    const finalVisible = finalCta.getBoundingClientRect().top < window.innerHeight;
    bar.dataset.visible = reachedProof && !finalVisible ? "true" : "false";
  };
  new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) reachedProof = true;
    update();
  }, { threshold: 0.1 }).observe(trigger);
  window.addEventListener("scroll", update, { passive: true });
}

const initialTheme = storedTheme();
applyTheme(initialTheme);
document.querySelectorAll<HTMLSelectElement>("[data-theme-control]").forEach((control) => {
  control.addEventListener("change", () => saveTheme(control.value as ThemeChoice));
});
systemDark.addEventListener("change", () => {
  if (root.dataset.themeChoice === "system") applyTheme("system");
});

activateCta("[data-join-cta]", globalThis.QuestForgeConfig?.joinGuildUrl);
activateCta("[data-source-cta]", globalThis.QuestForgeConfig?.sourceUrl);
hydrateFacts();
hydrateSeoLinks();
loadDeferredImages();
bindBridgeMotion();
bindStickyCta();

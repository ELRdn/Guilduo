import "./runtime-config.js";
import "./public-measurement.css";
import { getTelemetryConsent, setTelemetryConsent, initializeTelemetry, trackTelemetry, flushTelemetry, stopTelemetry } from "./telemetry";
import { classifyPublicSource, publicPageLabel, PUBLIC_SOURCES } from "./shared/public-measurement";
import { setPublicGa4Consent, trackPublicGa4 } from "./public-ga4";

const SOURCE_KEY = "questforge-public-source";
const NOTICE_KEY = "questforge-public-analytics-notice";

export function installPublicMeasurement(): void {
  const page = publicPageLabel(location.pathname);
  if (!page || document.querySelector(".public-measurement")) return;
  const language = document.documentElement.lang === "en" ? "en" : "ja";
  const text = (ja: string, en: string): string => language === "ja" ? ja : en;
  initializeTelemetry({ surface: page === "home" ? "public_lp" : page.startsWith("docs_") ? "public_docs" : "public_solutions" });
  let recorded = false;
  let source = "direct_unknown";
  const clearSource = (): void => { try { sessionStorage.removeItem(SOURCE_KEY); } catch { /* Optional storage. */ } };
  const recordView = (): void => {
    if (recorded || getTelemetryConsent() !== "granted") return;
    source = classifyPublicSource(location.href, document.referrer);
    let internal = false;
    try { internal = new URL(document.referrer).origin === location.origin; } catch { /* Direct arrival. */ }
    try {
      if (internal && source === "direct_unknown") {
        const saved = JSON.parse(sessionStorage.getItem(SOURCE_KEY) || "null") as { source?: string; at?: number } | null;
        if (saved?.source && PUBLIC_SOURCES.has(saved.source) && typeof saved.at === "number" && Date.now() - saved.at >= 0 && Date.now() - saved.at < 30 * 60_000) source = saved.source;
      }
      sessionStorage.setItem(SOURCE_KEY, JSON.stringify({ source, at: Date.now() }));
    } catch { /* Measurement still works without storage. */ }
    trackTelemetry("public_page_view", { kind: page, source, status: language });
    trackPublicGa4("page_view", location.pathname, source, language);
    recorded = true;
  };
  const details = document.createElement("details");
  details.className = "public-measurement";
  const summary = document.createElement("summary");
  summary.textContent = text("アクセス解析の設定", "Analytics settings");
  const explanation = document.createElement("p");
  explanation.textContent = text("同意すると、運営者の匿名計測とGoogle Analytics 4でページ閲覧・検索やAIからの流入区分・アプリへのクリックを計測します。GA4はブラウザ識別用Cookieを使います。URLのクエリ・検索語・アカウントID・タスク内容は送りません。運営者の記録は最長90日。登録成果の計測ではありません。", "With consent, operator telemetry and Google Analytics 4 measure page views, search/AI referral categories and App clicks. GA4 uses browser identifier cookies. URL queries, search terms, account IDs and task content are not sent. Operator records are retained for at most 90 days. These are not signup counts.");
  const state = document.createElement("p");
  state.setAttribute("role", "status");
  const refresh = (): void => {
    let acknowledged = false;
    try { acknowledged = localStorage.getItem(NOTICE_KEY) === "ga4-v1"; } catch { /* Consent stays disabled without storage. */ }
    // A previous anonymous-telemetry opt-in does not authorize a new vendor.
    if (getTelemetryConsent() === "granted" && !acknowledged) { setTelemetryConsent("unknown"); return; }
    const consent = getTelemetryConsent();
    setPublicGa4Consent(consent === "granted");
    state.textContent = consent === "granted" ? text("計測に同意済み", "Measurement enabled") : text("計測は無効です", "Measurement disabled");
    if (consent === "granted") recordView();
    else { recorded = false; stopTelemetry(); clearSource(); }
  };
  details.append(summary, explanation, state);
  for (const [value, label] of [
    ["granted", text("同意する", "Allow")],
    ["denied", text("拒否・同意を取り消す", "Decline / withdraw")],
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      try { localStorage.setItem(NOTICE_KEY, "ga4-v1"); } catch { /* Consent stays disabled without storage. */ }
      setTelemetryConsent(value);
      refresh();
    });
    details.append(button);
  }
  const policy = document.createElement("a");
  policy.href = "/privacy/";
  policy.textContent = text("プライバシーポリシー", "Privacy policy");
  details.append(policy);
  (document.querySelector("footer") || document.body).append(details);
  window.addEventListener("questforge:telemetry-consent-changed", refresh);
  window.addEventListener("storage", refresh);
  const click = (event: MouseEvent): void => {
    if (event.defaultPrevented || (event.type === "auxclick" && event.button !== 1) || getTelemetryConsent() !== "granted") return;
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(link instanceof HTMLAnchorElement) || new URL(link.href).origin !== "https://app.guilduo.com") return;
    trackTelemetry("app_cta_click", { kind: page, source, status: language });
    trackPublicGa4("app_cta_click", location.pathname, source, language);
    flushTelemetry();
  };
  document.addEventListener("click", click);
  document.addEventListener("auxclick", click);
  window.addEventListener("pagehide", flushTelemetry);
  refresh();
}

if (typeof document !== "undefined") installPublicMeasurement();

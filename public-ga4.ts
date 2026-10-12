import { getTelemetryConsent } from "./telemetry";
import { publicPageLabel, PUBLIC_SOURCES } from "./shared/public-measurement";

type AnalyticsScript = { id:string; async:boolean; src:string; referrerPolicy:string; onerror:(() => void) | null; remove():void };
type AnalyticsGlobal = {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  document?: { documentElement:{lang:string}; cookie:string; head:{append(script:AnalyticsScript):void}; createElement(tag:string):AnalyticsScript };
  location?: { pathname:string };
  [key: `ga-disable-${string}`]: boolean | undefined;
};
const analytics = globalThis as unknown as AnalyticsGlobal;
const measurementId = String(globalThis.QuestForgeConfig?.ga4MeasurementId || "");
let initialized = false;
const denied = { analytics_storage:"denied", ad_storage:"denied", ad_user_data:"denied", ad_personalization:"denied" };

export function setPublicGa4Consent(granted: boolean): void {
  const { document, location } = analytics;
  if (!document || !location) return;
  granted = granted && getTelemetryConsent() === "granted";
  const page = publicPageLabel(location.pathname);
  if (!/^G-[A-Z0-9]{6,16}$/.test(measurementId) || !page) return;
  analytics[`ga-disable-${measurementId}`] = !granted;
  if (!granted) {
    if (initialized) {
      analytics.gtag?.("consent", "update", denied);
      analytics.dataLayer?.splice(0);
      for (const name of ["guilduo_public_ga", `guilduo_public_ga_${measurementId.slice(2)}`]) document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    }
    return;
  }
  const first = !initialized;
  if (first) {
    initialized = true;
    analytics.dataLayer = [];
    analytics.gtag = function (..._args: unknown[]): void { analytics.dataLayer!.push(arguments); };
    analytics.gtag("consent", "default", denied);
    analytics.gtag("js", new Date());
  }
  analytics.gtag?.("consent", "update", { ...denied, analytics_storage:"granted" });
  const language = document.documentElement.lang === "en" ? "en" : "ja";
  const canonicalPath = page === "home" ? (language === "en" ? "/lp/en/" : "/") : location.pathname;
  analytics.gtag?.("config", measurementId, {
    send_page_view:false, allow_google_signals:false, allow_ad_personalization_signals:false,
    cookie_domain:"none", cookie_prefix:"guilduo_public", cookie_expires:90 * 86400, cookie_update:false,
    page_location:"https://guilduo.com" + canonicalPath, page_referrer:"", page_title:page,
    campaign_id:"", campaign_name:"", campaign_term:"", campaign_content:"",
    ads_data_redaction:true, url_passthrough:false,
  });
  if (!first) return;
  const script = document.createElement("script");
  script.id = "guilduo-ga4";
  script.async = true;
  script.referrerPolicy = "no-referrer";
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  script.onerror = () => { initialized = false; script.remove(); analytics.dataLayer?.splice(0); };
  document.head.append(script);
}

export function trackPublicGa4(name: "page_view" | "app_cta_click", path: string, source: string, language: string): void {
  if (!["page_view", "app_cta_click"].includes(name)) return;
  const page = publicPageLabel(path);
  if (getTelemetryConsent() !== "granted" || analytics[`ga-disable-${measurementId}`] || !initialized || !page || !PUBLIC_SOURCES.has(source) || !["ja","en"].includes(language)) return;
  const canonicalPath = page === "home" ? (language === "en" ? "/lp/en/" : "/") : path;
  const medium = source === "organic_search" ? "organic" : ["ai_referral","referral"].includes(source) ? "referral" : source === "campaign" ? "campaign" : "(none)";
  analytics.gtag?.("event", name, {
    send_to:measurementId, page_location:"https://guilduo.com" + canonicalPath, page_referrer:"",
    page_title:page, page_label:page, traffic_source:source, language,
    campaign_source:source === "direct_unknown" ? "(direct)" : source,
    campaign_medium:medium, campaign_id:"", campaign_name:"", campaign_term:"", campaign_content:"",
  });
}

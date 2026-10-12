import test from "node:test";
import assert from "node:assert/strict";
import { PUBLIC_PAGES, PUBLIC_SOURCES } from "../shared/public-measurement.ts";

const measurementId = "G-TEST123456";
const consentKey = "questforge-telemetry-consent";
const disableKey = `ga-disable-${measurementId}` as const;
const denied = { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
type Script = { id: string; src: string; async: boolean; referrerPolicy: string; onerror: (() => void) | null; remove: () => void };
const analytics = globalThis as typeof globalThis & {
  dataLayer?: ArrayLike<unknown>[];
  gtag?: (...args: unknown[]) => void;
  [disableKey]?: boolean;
};

test("public GA4: consent, bounded payloads, withdrawal and recovery without a browser", async (t) => {
  const keys = ["QuestForgeConfig", "QuestForgeTelemetry", "document", "location", "localStorage", "dataLayer", "gtag", disableKey, "fetch"];
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = new Map<string, string>([["accountUID", "private-account-sentinel"]]);
  const cookies = new Map<string, string>();
  const cookieWrites: string[] = [];
  const scripts: Script[] = [];
  const created: Script[] = [];
  const location = new URL("https://guilduo.com/?q=private-query-sentinel&gclid=private-click-sentinel#private-hash-sentinel");
  const document = {
    documentElement: { lang: "ja" },
    title: "private-title-sentinel",
    referrer: "https://google.com/search?q=private-referrer-sentinel",
    head: { append: (script: Script) => { scripts.push(script); } },
    createElement: (tag: string): Script => {
      assert.equal(tag, "script");
      const script: Script = {
        id: "", src: "", async: false, referrerPolicy: "", onerror: null,
        remove: () => { const index = scripts.indexOf(script); if (index >= 0) scripts.splice(index, 1); },
      };
      created.push(script);
      return script;
    },
    querySelector: (selector: string) => {
      assert.equal(selector, "#guilduo-ga4");
      return scripts.find(script => script.id === "guilduo-ga4") || null;
    },
    get cookie() { return [...cookies].map(([key, value]) => `${key}=${value}`).join("; "); },
    set cookie(value: string) {
      cookieWrites.push(value);
      const [name, content] = value.split(";")[0].split("=");
      if (/Max-Age=0(?:;|$)/i.test(value)) cookies.delete(name);
      else cookies.set(name, content);
    },
  };
  let networkCalls = 0;
  const globals = {
    QuestForgeConfig: { ga4MeasurementId: measurementId },
    document, location,
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
      clear: () => { values.clear(); },
    },
    fetch: () => { networkCalls++; throw new Error("Real network is forbidden in this test"); },
  };
  for (const key of ["dataLayer", "gtag", disableKey]) Reflect.deleteProperty(globalThis, key);
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const calls = () => (analytics.dataLayer || []).map(entry => Array.from(entry));
  const commands = (name: string) => calls().filter(entry => entry[0] === name);
  const consent = (value: string) => { values.set(consentKey, value); };
  const navigate = (path: string, language: string) => { location.pathname = path; document.documentElement.lang = language; };
  const assertCanonical = (payload: Record<string, unknown>, path: string, page: string) => {
    assert.equal(payload.page_location, `https://guilduo.com${path}`);
    const url = new URL(String(payload.page_location));
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
    assert.equal(payload.page_referrer, "");
    assert.equal(payload.page_title, page);
    for (const key of ["campaign_id", "campaign_name", "campaign_term", "campaign_content"]) assert.equal(payload[key], "");
    assert.doesNotMatch(JSON.stringify(payload), /private-.*-sentinel/);
    for (const key of ["user_id", "user_properties", "accountUID"]) assert.equal(Object.hasOwn(payload, key), false);
  };

  try {
    // Import only after installing config: the adapter captures the ID at module load.
    const { setPublicGa4Consent, trackPublicGa4 } = await import("../public-ga4.ts");
    const { getTelemetryConsent } = await import("../telemetry.ts");

    await t.test("public GA4: unknown and denied consent create no script or events", () => {
      assert.equal(getTelemetryConsent(), "unknown");
      assert.equal(created.length, 0);
      assert.deepEqual(calls(), []);
      for (const value of ["unknown", "denied"]) {
        consent(value);
        setPublicGa4Consent(false);
        trackPublicGa4("page_view", "/", "organic_search", "ja");
        trackPublicGa4("app_cta_click", "/docs/", "ai_referral", "en");
        assert.equal(analytics[disableKey], true);
        assert.equal(created.length, 0);
        assert.deepEqual(calls(), []);
        assert.deepEqual(cookieWrites, []);
      }
      consent("granted");
      trackPublicGa4("page_view", "/", "organic_search", "ja");
      assert.deepEqual(calls(), [], "stored consent alone must not initialize GA");
      assert.equal(created.length, 0);
    });

    await t.test("public GA4: consent initializes canonical config with advertising disabled", () => {
      consent("granted");
      setPublicGa4Consent(true);
      assert.equal(analytics[disableKey], false);
      assert.equal(scripts.length, 1);
      assert.equal(created.length, 1);
      assert.equal(scripts[0].id, "guilduo-ga4");
      assert.equal(scripts[0].src, `https://www.googletagmanager.com/gtag/js?id=${measurementId}`);
      assert.equal(scripts[0].async, true);
      assert.equal(scripts[0].referrerPolicy, "no-referrer");
      assert.deepEqual(commands("consent"), [["consent", "default", denied], ["consent", "update", { ...denied, analytics_storage: "granted" }]]);
      const config = commands("config");
      assert.equal(config.length, 1);
      assert.equal(config[0][1], measurementId);
      const payload = config[0][2] as Record<string, unknown>;
      assertCanonical(payload, "/", "home");
      for (const key of ["send_page_view", "allow_google_signals", "allow_ad_personalization_signals", "url_passthrough", "cookie_update"]) assert.equal(payload[key], false, key);
      assert.equal(payload.ads_data_redaction, true);
      assert.equal(payload.cookie_domain, "none");
      assert.equal(payload.cookie_prefix, "guilduo_public");
      assert.equal(payload.cookie_expires, 90 * 86400);
      assert.equal(commands("event").length, 0, "page views must be explicit");
    });

    await t.test("public GA4: all reviewed pages, sources and languages emit only finite public payloads", () => {
      const pages: [string, string][] = [["/", "home"], ["/lp/", "home"], ["/lp/en/", "home"]];
      for (const prefix of ["/docs/", "/docs/en/"]) {
        pages.push([prefix, "docs_index"]);
        for (const slug of ["getting-started", "mcp-connection", "codex", "claude", "dsh", "opencode", "openclaw", "quests", "agents", "human-relay", "permissions", "troubleshooting", "faq", "api", "openai", "grok", "muse"]) pages.push([`${prefix}${slug}/`, `docs_${slug}`]);
      }
      for (const prefix of ["/solutions/", "/solutions/en/"]) for (const slug of ["mcp-task-management", "ai-agent-handoff"]) pages.push([`${prefix}${slug}/`, `solution_${slug}`]);
      assert.deepEqual(new Set(pages.map(([, label]) => label)), PUBLIC_PAGES);
      const sources = [["organic_search", "organic"], ["ai_referral", "referral"], ["campaign", "campaign"], ["referral", "referral"], ["direct_unknown", "(none)"]];
      assert.deepEqual(new Set(sources.map(([source]) => source)), PUBLIC_SOURCES);
      for (const [path, page] of pages) for (const [source, medium] of sources) for (const language of ["ja", "en"]) {
        navigate(path, language);
        setPublicGa4Consent(true);
        const canonical = page === "home" ? (language === "en" ? "/lp/en/" : "/") : path;
        assertCanonical(commands("config").at(-1)![2] as Record<string, unknown>, canonical, page);
        for (const name of ["page_view", "app_cta_click"] as const) {
          const before = commands("event").length;
          trackPublicGa4(name, path, source, language);
          const events = commands("event");
          assert.equal(events.length, before + 1, `${name} ${path} ${source} ${language}`);
          const event = events.at(-1)!;
          assert.equal(event[1], name);
          const payload = event[2] as Record<string, unknown>;
          assertCanonical(payload, canonical, page);
          assert.deepEqual(payload, {
            send_to: measurementId, page_location: `https://guilduo.com${canonical}`, page_referrer: "",
            page_title: page, page_label: page, traffic_source: source, language,
            campaign_source: source === "direct_unknown" ? "(direct)" : source,
            campaign_medium: medium,
            campaign_id: "", campaign_name: "", campaign_term: "", campaign_content: "",
          });
        }
      }
      assert.equal(created.length, 1, "repeat grants must reuse the script");
    });

    await t.test("public GA4: arbitrary labels, query/hash paths and private paths never queue events", () => {
      const before = calls();
      for (const path of ["/next/", "/next/relay-forge/", "/interaction-lab/", "/private/", "/quests/private-id/", "/api/", "/docs/secret/", "/docs/index/", "/solutions/secret/", "/docs/codex/?q=private", "/docs/codex/#private", "https://guilduo.com/docs/"]) trackPublicGa4("page_view", path, "organic_search", "ja");
      for (const source of ["", "google", "https://private.example/", "private-account-sentinel", "__proto__"]) trackPublicGa4("page_view", "/", source, "ja");
      for (const language of ["", "JA", "en-US", "fr", "private-account-sentinel"]) trackPublicGa4("app_cta_click", "/docs/", "ai_referral", language);
      assert.deepEqual(calls(), before);
    });

    await t.test("public GA4: storage consent gates events even while the script is initialized", () => {
      const before = calls();
      for (const value of ["denied", "unknown", "invalid"]) {
        consent(value);
        trackPublicGa4("page_view", "/", "direct_unknown", "ja");
      }
      values.delete(consentKey);
      trackPublicGa4("app_cta_click", "/", "direct_unknown", "ja");
      assert.deepEqual(calls(), before);
      consent("granted");
    });

    const retainedScript = created[0];
    const queuedBeforeWithdrawal = analytics.dataLayer;
    await t.test("public GA4: withdrawal disables GA, empties its queue and expires only analytics cookies", () => {
      navigate("/", "ja");
      trackPublicGa4("app_cta_click", "/", "ai_referral", "ja");
      assert.ok(commands("event").length > 0);
      cookies.set("guilduo_public_ga", "client-id");
      cookies.set(`guilduo_public_ga_${measurementId.slice(2)}`, "session-id");
      cookies.set("account_session", "keep-session");
      consent("denied");
      setPublicGa4Consent(false);
      assert.equal(analytics[disableKey], true);
      assert.deepEqual(calls(), []);
      assert.equal(queuedBeforeWithdrawal?.length, 0, "discard the actual existing queue");
      assert.equal(cookies.has("guilduo_public_ga"), false);
      assert.equal(cookies.has(`guilduo_public_ga_${measurementId.slice(2)}`), false);
      assert.equal(cookies.get("account_session"), "keep-session");
      assert.equal(cookieWrites.length, 2);
      for (const value of cookieWrites) assert.match(value, /^guilduo_public_ga(?:_TEST123456)?=; Max-Age=0; Path=\/; SameSite=Lax$/);
      assert.deepEqual(scripts, [retainedScript], "keep the script available for reconsent");
    });

    await t.test("public GA4: the disable flag blocks events even if storage still says granted", () => {
      consent("granted");
      assert.equal(analytics[disableKey], true);
      const before = calls();
      trackPublicGa4("page_view", "/", "direct_unknown", "ja");
      assert.deepEqual(calls(), before);
    });

    await t.test("public GA4: reconsent reconfigures the retained script without replaying withdrawn events", () => {
      navigate("/lp/en/", "en");
      consent("granted");
      setPublicGa4Consent(true);
      assert.equal(analytics[disableKey], false);
      assert.deepEqual(scripts, [retainedScript]);
      assert.equal(created.length, 1);
      assert.equal(commands("config").length, 1);
      assert.equal(commands("config")[0][1], measurementId);
      assertCanonical(commands("config")[0][2] as Record<string, unknown>, "/lp/en/", "home");
      assert.deepEqual(commands("consent"), [["consent", "update", { ...denied, analytics_storage: "granted" }]]);
      assert.equal(commands("event").length, 0);
      trackPublicGa4("page_view", "/lp/en/", "organic_search", "en");
      assert.equal(commands("event").length, 1);
      assert.equal(commands("event")[0][1], "page_view");
    });

    await t.test("public GA4: script failure discards queued events and the next grant retries successfully", () => {
      assert.ok(retainedScript.onerror);
      retainedScript.onerror();
      assert.equal(scripts.length, 0);
      assert.deepEqual(calls(), []);
      trackPublicGa4("app_cta_click", "/lp/en/", "ai_referral", "en");
      assert.deepEqual(calls(), [], "failed initialization must not accept events");
      setPublicGa4Consent(true);
      assert.equal(created.length, 2);
      assert.equal(scripts.length, 1);
      assert.notEqual(scripts[0], retainedScript);
      assert.equal(commands("config").length, 1);
      assertCanonical(commands("config")[0][2] as Record<string, unknown>, "/lp/en/", "home");
      assert.equal(commands("event").length, 0);
      trackPublicGa4("app_cta_click", "/lp/en/", "ai_referral", "en");
      assert.equal(commands("event").length, 1);
      assert.equal(commands("event")[0][1], "app_cta_click");
    });

    await t.test("public GA4: private locations cannot initialize or configure analytics", () => {
      scripts[0].onerror!();
      const count = created.length;
      for (const path of ["/next/", "/next/relay-forge/", "/interaction-lab/", "/private/", "/quests/private-id/", "/api/", "/docs/secret/"]) {
        navigate(path, "ja");
        consent("granted");
        setPublicGa4Consent(true);
        trackPublicGa4("page_view", path, "direct_unknown", "ja");
        assert.equal(created.length, count, path);
        assert.equal(scripts.length, 0, path);
        assert.deepEqual(calls(), [], path);
      }
    });
    assert.equal(networkCalls, 0);
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

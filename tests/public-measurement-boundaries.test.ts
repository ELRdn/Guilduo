import test from "node:test";
import assert from "node:assert/strict";
import { classifyPublicSource, publicPageLabel, validPublicEvent } from "../shared/public-measurement.ts";

const base = "https://guilduo.com/docs/en/codex/";
const good = { kind: "docs_codex", source: "organic_search", status: "en", surface: "public_docs" };

test("public measurement boundaries: canonical Japanese and English routes share finite labels", () => {
  for (const path of ["/", "/lp/", "/lp/en/"]) assert.equal(publicPageLabel(path), "home", path);
  for (const locale of ["", "en/"]) {
    assert.equal(publicPageLabel(`/docs/${locale}`), "docs_index");
    for (const slug of ["getting-started", "mcp-connection", "codex", "claude", "dsh", "opencode", "openclaw", "quests", "agents", "human-relay", "permissions", "troubleshooting", "faq", "api", "openai", "grok", "muse"]) {
      assert.equal(publicPageLabel(`/docs/${locale}${slug}/`), `docs_${slug}`);
    }
    for (const slug of ["mcp-task-management", "ai-agent-handoff"]) {
      assert.equal(publicPageLabel(`/solutions/${locale}${slug}/`), `solution_${slug}`);
    }
  }
});

test("public measurement boundaries: private, unknown, malformed and unsupported locale paths are excluded", () => {
  for (const path of ["", "/docs", "/docs/index/", "/docs/en/index/", "/docs/secret/", "/docs/ja/codex/", "/docs/fr/codex/", "/docs/en/codex/private/", "/docs//codex/", "/docs/Codex/", "/docs/%63odex/", "/docs/codex/?token=secret", "/docs/codex/#private", "/solutions/", "/solutions/fr/ai-agent-handoff/", "/lp/ja/", "/next/", "/next/relay-forge/", "/interaction-lab/", "/api/", "/privacy/", "https://guilduo.com/docs/codex/"]) {
    assert.equal(publicPageLabel(path), undefined, path);
  }
  for (const value of [null, undefined, 42, {}, ["/docs/codex/"]]) {
    assert.equal(publicPageLabel(value as string), undefined);
  }
});

test("public measurement boundaries: recognized search and AI hosts include legitimate subdomains", () => {
  for (const host of ["google.com", "www.google.co.jp", "bing.com", "search.yahoo.com", "search.yahoo.co.jp", "duckduckgo.com", "search.brave.com", "WWW.GOOGLE.COM."]) {
    assert.equal(classifyPublicSource(base, `https://${host}/search?q=private`), "organic_search", host);
  }
  for (const host of ["chatgpt.com", "chat.openai.com", "www.perplexity.ai", "claude.ai", "copilot.microsoft.com", "gemini.google.com", "CHATGPT.COM."]) {
    assert.equal(classifyPublicSource(base, `https://${host}/private`), "ai_referral", host);
  }
});

test("public measurement boundaries: hostname and userinfo spoofing never become organic or AI", () => {
  for (const host of ["google.com", "google.co.jp", "bing.com", "search.yahoo.com", "duckduckgo.com", "search.brave.com", "chatgpt.com", "chat.openai.com", "perplexity.ai", "claude.ai", "copilot.microsoft.com", "gemini.google.com", "googleadservices.com", "doubleclick.net"]) {
    for (const referrer of [`https://${host}.attacker.example/`, `https://fake${host}.attacker.example/`, `https://${host}@attacker.example/`, `https://attacker.example/?host=${host}#${host}`]) {
      assert.equal(classifyPublicSource(base, referrer), "referral", referrer);
    }
  }
  assert.equal(classifyPublicSource(base, "https://fakegoogle.com/"), "referral");
  assert.equal(classifyPublicSource(base, "https://fakechatgpt.com/"), "referral");
  assert.equal(classifyPublicSource(base, "https://fakegemini.google.com/"), "organic_search");
});

test("public measurement boundaries: click IDs take precedence over declared organic and AI tags", () => {
  for (const key of ["gclid", "dclid", "msclkid", "fbclid"]) {
    for (const tags of ["utm_source=google&utm_medium=organic", "utm_source=chatgpt&utm_medium=referral"]) {
      for (const value of ["", "private"]) assert.equal(classifyPublicSource(`${base}?${key}=${value}&${tags}`, "https://google.com/"), "campaign");
    }
  }
});

test("public measurement boundaries: explicit organic and AI tags are bounded and case insensitive", () => {
  for (const source of ["google", "bing", "yahoo", "duckduckgo", "brave"]) {
    for (const medium of ["organic", "organic_search"]) assert.equal(classifyPublicSource(`${base}?utm_source=${source}&utm_medium=${medium.toUpperCase()}`, ""), "organic_search");
  }
  for (const source of ["chatgpt", "perplexity", "claude", "copilot", "gemini"]) {
    for (const medium of ["", "referral", "ai", "ai_referral"]) assert.equal(classifyPublicSource(`${base}?utm_source=${source.toUpperCase()}&utm_medium=${medium}`, ""), "ai_referral");
  }
});

test("public measurement boundaries: paid, unknown, empty and ambiguous campaign tags cannot inherit organic", () => {
  for (const query of ["utm_source=google&utm_medium=cpc", "utm_source=chatgpt&utm_medium=paid", "utm_source=unknown&utm_medium=organic", "utm_source=google", "utm_medium=organic", "utm_campaign=launch", "utm_source=", "utm_medium=", "utm_campaign=", "utm_source=google&utm_medium=organic&utm_medium=cpc", "utm_medium=cpc&utm_medium=organic&utm_source=google", "utm_source=chatgpt&utm_source=unknown&utm_medium=referral"]) {
    assert.equal(classifyPublicSource(`${base}?${query}`, "https://google.com/search"), "campaign", query);
  }
});

test("public measurement boundaries: ad referrers override otherwise organic or AI UTM tags", () => {
  for (const referrer of ["https://googleadservices.com/pagead/aclk", "https://www.googlesyndication.com/", "https://ad.doubleclick.net/", "https://www.google.com/aclk", "https://www.google.co.jp/aclk"]) {
    for (const query of ["", "?utm_source=google&utm_medium=organic", "?utm_source=chatgpt&utm_medium=referral"]) {
      assert.equal(classifyPublicSource(base + query, referrer), "campaign", referrer + query);
    }
  }
  assert.equal(classifyPublicSource(base, "https://unrelated.example/aclk"), "referral");
});

test("public measurement boundaries: same-origin navigation stays unknown unless explicitly tagged", () => {
  for (const referrer of ["https://guilduo.com/", "https://guilduo.com/docs/codex/?gclid=old", "https://guilduo.com/aclk", "https://GUILDUO.COM:443/solutions/en/ai-agent-handoff/"]) {
    assert.equal(classifyPublicSource(base, referrer), "direct_unknown", referrer);
    assert.equal(classifyPublicSource(`${base}?utm_source=google&utm_medium=organic`, referrer), "organic_search");
    assert.equal(classifyPublicSource(`${base}?gclid=new`, referrer), "campaign");
  }
  for (const referrer of ["http://guilduo.com/", "https://guilduo.com:444/", "https://app.guilduo.com/"]) {
    assert.equal(classifyPublicSource(base, referrer), "referral", referrer);
  }
});

test("public measurement boundaries: malformed URLs and non-web schemes safely return unknown", () => {
  for (const href of ["", "broken", "/docs/", "https://[", "javascript:alert(1)", "data:text/plain,private", "ftp://guilduo.com/docs/", "file:///docs/", "blob:https://guilduo.com/private", null, undefined, {}]) {
    assert.equal(classifyPublicSource(href as string, "https://google.com/"), "direct_unknown");
  }
  for (const referrer of ["", "broken", "/docs/", "https://[", "javascript:alert(1)", "data:text/plain,private", "ftp://google.com/", "file:///docs/", "blob:https://chatgpt.com/private", null, undefined, {}]) {
    assert.equal(classifyPublicSource(base, referrer as string), "direct_unknown");
  }
});

test("public measurement boundaries: finite event labels accept both languages on their matching surface", () => {
  for (const [kind, surface] of [["home", "public_lp"], ["docs_index", "public_docs"], ["docs_codex", "public_docs"], ["solution_ai-agent-handoff", "public_solutions"]]) {
    for (const source of ["organic_search", "ai_referral", "campaign", "referral", "direct_unknown"]) {
      for (const status of ["ja", "en"]) {
        assert.equal(validPublicEvent({ kind, source, status, surface }), true);
        for (const wrongSurface of ["public_lp", "public_docs", "public_solutions", "relay-forge"]) {
          if (surface !== wrongSurface) assert.equal(validPublicEvent({ kind, source, status, surface: wrongSurface }), false);
        }
      }
    }
  }
});

test("public measurement boundaries: malformed event shapes and unbounded values are rejected", () => {
  for (const event of [null, undefined, [], "private", 42, true, {}]) assert.equal(validPublicEvent(event as Record<string, unknown>), false);
  for (const key of ["kind", "source", "status", "surface"]) {
    const missing: Record<string, unknown> = { ...good };
    delete missing[key];
    assert.equal(validPublicEvent(missing), false);
    for (const value of [null, undefined, 42, true, [good[key as keyof typeof good]], {}, "", "https://private.example/", "private title", "__proto__"]) {
      assert.equal(validPublicEvent({ ...good, [key]: value }), false, key);
    }
  }
  for (const status of ["JA", "EN", "ja-JP", "en-US", "fr", " ja "]) assert.equal(validPublicEvent({ ...good, status }), false);
});

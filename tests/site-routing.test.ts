import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  CLOUDFLARE_SITE_REWRITE_RULES,
  COMPATIBILITY_PATHS,
  CLOUDFLARE_WWW_REDIRECT_RULE,
  LP_ENTRY_PATH,
  OFFICIAL_SITE_HOST,
  RELAY_FORGE_ENTRY_PATH,
  WWW_HOST,
  WEB_APP_HOST,
  applyPublicHostRewrite,
  isCompatibilityPath,
  resolvePublicHostRoute,
  resolveWwwRedirect,
} from "../site-routing.ts";

const root = join(__dirname, "..");

test("official and app roots resolve to separate entries in the same deployment", () => {
  assert.deepEqual(resolvePublicHostRoute(OFFICIAL_SITE_HOST, "/"), {
    host: OFFICIAL_SITE_HOST,
    publicPath: "/",
    deploymentPath: LP_ENTRY_PATH,
  });
  assert.deepEqual(resolvePublicHostRoute(WEB_APP_HOST, "/"), {
    host: WEB_APP_HOST,
    publicPath: "/",
    deploymentPath: RELAY_FORGE_ENTRY_PATH,
  });
});

test("host routing is narrow and preserves query parameters", () => {
  assert.equal(resolvePublicHostRoute("GUILDUO.COM.", "/")?.deploymentPath, LP_ENTRY_PATH);
  assert.equal(resolvePublicHostRoute(WEB_APP_HOST, "/assets/app.js"), null);
  assert.equal(resolvePublicHostRoute(WEB_APP_HOST, "/next/relay-forge/"), null);
  assert.equal(resolvePublicHostRoute("www.guilduo.com", "/"), null);

  const rewritten = applyPublicHostRewrite("https://app.guilduo.com/?theme=dark&from=invite");
  assert.equal(rewritten.hostname, WEB_APP_HOST);
  assert.equal(rewritten.pathname, RELAY_FORGE_ENTRY_PATH);
  assert.equal(rewritten.search, "?theme=dark&from=invite");
});

test("www redirect keeps path and query while moving only to the HTTPS apex", () => {
  const redirected = resolveWwwRedirect("http://www.guilduo.com/lp/en/?from=share");
  assert.equal(redirected?.origin, "https://guilduo.com");
  assert.equal(redirected?.pathname, "/lp/en/");
  assert.equal(redirected?.search, "?from=share");
  assert.equal(resolveWwwRedirect(`https://${OFFICIAL_SITE_HOST}/`), null);
  assert.equal(CLOUDFLARE_WWW_REDIRECT_RULE.expression, `(http.host eq "${WWW_HOST}")`);
  assert.equal(CLOUDFLARE_WWW_REDIRECT_RULE.preservePathAndQuery, true);
});

test("legacy paths remain explicitly available without becoming root rewrite targets", () => {
  assert.deepEqual([...COMPATIBILITY_PATHS], ["/lp/", "/lp/en/", "/next/", "/next/relay-forge/"]);
  for (const pathname of COMPATIBILITY_PATHS) assert.equal(isCompatibilityPath(pathname), true, pathname);
  assert.equal(isCompatibilityPath("/assets/"), false);
  assert.equal(isCompatibilityPath("/"), false);
});

test("the versioned routing contract contains exactly the two Cloudflare rewrites", () => {
  assert.equal(CLOUDFLARE_SITE_REWRITE_RULES.length, 2);
  assert.deepEqual(CLOUDFLARE_SITE_REWRITE_RULES.map((rule) => rule.deploymentPath), [LP_ENTRY_PATH, RELAY_FORGE_ENTRY_PATH]);
  assert.ok(CLOUDFLARE_SITE_REWRITE_RULES.every((rule) => rule.expression.includes("http.request.uri.path eq \"/\"")));
});

test("built-site routing documentation keeps Appwrite and Cloudflare responsibilities separate", () => {
  const docs = readFileSync(join(root, "docs", "appwrite-site-routing.md"), "utf8");
  assert.match(docs, /同じactive deployment/);
  assert.match(docs, /guilduo\.com.*\/lp\//s);
  assert.match(docs, /app\.guilduo\.com.*\/next\/relay-forge\//s);
  assert.match(docs, /query string.*Preserve/);
  assert.match(docs, /guilduo\.com.*Active deployment/);
});

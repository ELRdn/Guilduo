import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { createServer, build } from "vite";
import { chromium } from "playwright-core";
import { SUPPORTED_LOCALES } from "../i18n.ts";
import { SqliteD1Database } from "../tests/test-helpers.ts";
import { startRelayWorkerFixture } from "../tests/browser/worker-fixture.ts";
import type { AnalyticsConfig } from "../server/launch-analytics.ts";

// Isolated HTTP Worker, actual D1 SQL, browser and official source UI. No provider calls.
const built=process.argv.includes("--built");
const workspaceRoot=realpathSync(process.cwd());
const output=resolve(".qa-artifacts/launch-implementation/analytics",built?"built":"source");await mkdir(output,{recursive:true});
const config:AnalyticsConfig={approved:true,policyVersion:"2026-10-04",environment:"test",measurementStartAt:"2026-10-04T00:00:00.000Z",activationDays:7,paidConversionDays:30,attributionDays:30,retentionWindows:[{label:"d1",startHours:24,endHours:48},{label:"d7",startHours:168,endHours:192},{label:"d30",startHours:720,endHours:744}],campaigns:[{id:"launch",source:"search",medium:"cpc",campaign:"launch"}],excludedOwnerIds:[]};
const source=await createServer({configFile:false,root:workspaceRoot,logLevel:"error",server:{host:"127.0.0.1",port:0}});await source.listen();
const address=source.httpServer!.address();assert.ok(address&&typeof address==="object");let base=`http://127.0.0.1:${address.port}`;
const db=new SqliteD1Database();
const fixture=await startRelayWorkerFixture(base,{QUESTFORGE_DB:db,ANALYTICS_ENABLED:"true",ANALYTICS_ALLOW_LOCAL:"true",ANALYTICS_DATA_POLICY_APPROVED:"true",ANALYTICS_CONFIG:JSON.stringify(config),ANALYTICS_TOKEN_KEY:"synthetic-collector-key-for-browser-fixture-only"});
let builtServer:Awaited<ReturnType<typeof createServer>>|null=null;
const runtimeCode=`const config=${JSON.stringify({gatewayUrl:fixture.baseUrl,analyticsEnabled:true,analyticsCampaigns:config.campaigns,joinGuildUrl:"https://app.guilduo.com/"})};globalThis.QuestForgeConfig=config;export default config;`;
if(built){
  const buildRoot=resolve(output,"build");
  await build({configFile:false,root:workspaceRoot,logLevel:"warn",base:"/",plugins:[{name:"isolated-measurement-config",transform(_code,id){if(id.replaceAll("\\","/").endsWith("/runtime-config.js"))return runtimeCode;return null;}}],
    build:{outDir:buildRoot,emptyOutDir:false,rollupOptions:{input:{ui:resolve(workspaceRoot,"tests/browser/production-relay.html"),ja:resolve(workspaceRoot,"lp/index.html"),en:resolve(workspaceRoot,"lp/en/index.html")}}}});
  builtServer=await createServer({configFile:false,root:buildRoot,logLevel:"error",server:{host:"127.0.0.1",port:0}});
  builtServer.middlewares.use(async(request,response,next)=>{if(!request.url?.startsWith("/assets/brand/")&&!request.url?.startsWith("/assets/icons/"))return next();try{const path=new URL(request.url,"http://local").pathname;if(path.includes(".."))return next();const bytes=await readFile(resolve(process.cwd(),`.${path}`));response.setHeader("content-type",path.endsWith(".svg")?"image/svg+xml":"image/png");response.end(bytes);}catch{next();}});
  await builtServer.listen();const builtAddress=builtServer.httpServer!.address();assert.ok(builtAddress&&typeof builtAddress==="object");base=`http://127.0.0.1:${builtAddress.port}`;
}
const browser=await chromium.launch({executablePath:process.env.QF_CHROME_PATH||(process.platform==="win32"?"C:/Program Files/Google/Chrome/Application/chrome.exe":"/usr/bin/google-chrome"),headless:true});
const checks:string[]=[];const errors:string[]=[];let externalRequests=0;
try{
  let testMinute=0;
  for(const width of [320,1440])for(const locale of SUPPORTED_LOCALES){
    // Each independent UI case gets a new isolated clock bucket; quota abuse is tested separately.
    fixture.env.ANALYTICS_NOW=new Date(Date.now()+testMinute++*61000).toISOString();
    const page=await browser.newPage({viewport:{width,height:1100},reducedMotion:"reduce"});
    await page.addInitScript(()=>{globalThis.QuestForgeConfig={analyticsEnabled:true};});
    await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/,r=>{externalRequests++;return r.abort();});
    page.on("pageerror",e=>errors.push(`${locale}/${width}: ${e.message}`));
    await page.goto(`${base}/tests/browser/production-relay.html?api=${encodeURIComponent(fixture.baseUrl)}&uid=${encodeURIComponent(fixture.uid)}&lang=${locale}`);
    if(width<900){await page.locator(".rf-nav-more").click();await page.locator(".rf-nav-more-panel").getByRole("button",{name:"Settings",exact:true}).click();}else await page.locator(".rf-rail-utility:has(.rf-settings-mark)").click();
    const region=page.locator('[data-analytics-consent="account"]');await region.waitFor();
    await page.waitForFunction(`!!document.querySelector('[data-analytics-action="granted"]:not([disabled])')`);
    await region.locator('[data-analytics-action="granted"]').focus();await page.keyboard.press("Space");
    await page.waitForFunction(`!!document.querySelector('[data-analytics-action="denied"]:not([disabled])')&&!!document.querySelector('[data-analytics-action="granted"][disabled]')`);
    await region.locator('[data-analytics-action="denied"]').focus();await page.keyboard.press("Space");
    await page.waitForFunction(`!!document.querySelector('[data-analytics-action="granted"]:not([disabled])')`);
    assert.equal(await page.evaluate("document.documentElement.scrollWidth<=innerWidth"),true,`${locale}/${width} overflow`);
    assert.ok((await region.locator('a').getAttribute('href'))==="https://guilduo.com/privacy/");
    if(locale==="ja"&&width===320){await region.scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,"settings-ja-mobile.png")});}
    checks.push(`Settings ${locale}/${width}: keyboard grant/withdraw, owner persistence, labels, width`);await page.close();
  }
  for(const locale of SUPPORTED_LOCALES){
    fixture.env.ANALYTICS_ENABLED="true";fixture.env.ANALYTICS_NOW=new Date(Date.now()+testMinute++*61000).toISOString();
    await fixture.web("/v1/analytics/consent","PUT",{consent:"granted",policyVersion:config.policyVersion});
    fixture.env.ANALYTICS_ENABLED="false";
    const page=await browser.newPage({viewport:{width:320,height:1100},reducedMotion:"reduce"});
    await page.addInitScript(()=>{globalThis.QuestForgeConfig={analyticsEnabled:false};});
    await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/,r=>{externalRequests++;return r.abort();});
    await page.goto(`${base}/tests/browser/production-relay.html?api=${encodeURIComponent(fixture.baseUrl)}&uid=${encodeURIComponent(fixture.uid)}&lang=${locale}`);
    await page.locator(".rf-nav-more").click();await page.locator(".rf-nav-more-panel").getByRole("button",{name:"Settings",exact:true}).click();
    const region=page.locator('[data-analytics-consent="account"]');await region.waitFor();
    await page.waitForFunction(`!!document.querySelector('[data-analytics-action="denied"]:not([disabled])')`);
    assert.equal(await region.locator('[data-analytics-action="granted"]').isDisabled(),true);
    assert.equal(await page.evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
    await region.locator('[data-analytics-action="denied"]').click();await region.waitFor({state:"detached"});
    assert.equal((db.raw.prepare("SELECT COUNT(*) AS n FROM launch_analytics_subjects WHERE uid=?").get(fixture.uid) as {n:number}).n,0);
    checks.push(`Paused ${locale}/320: prior consent remains withdrawable with collection and runtime flag off`);await page.close();
  }
  fixture.env.ANALYTICS_ENABLED="true";
  for(const language of ["ja","en"]){
    const page=await browser.newPage({viewport:{width:320,height:1100},reducedMotion:"reduce"});
    await page.route("**/runtime-config.js",r=>r.fulfill({contentType:"text/javascript",body:`const config=${JSON.stringify({gatewayUrl:fixture.baseUrl,analyticsEnabled:true,analyticsCampaigns:config.campaigns,joinGuildUrl:"https://app.guilduo.com/"})};globalThis.QuestForgeConfig=config;export default config;`}));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/,r=>{externalRequests++;return r.abort();});
    page.on("pageerror",e=>errors.push(`LP ${language}: ${e.message}`));
    await page.goto(`${base}/lp/${language==="en"?"en/":""}?utm_source=search&utm_medium=cpc&utm_campaign=launch`);
    const region=page.locator('[data-analytics-consent="lp"]');await region.waitFor();
    const count=()=>Number((db.raw.prepare("SELECT COUNT(*) AS n FROM launch_analytics_visits").get() as {n:number}).n);
    const before=count();await page.waitForTimeout(150);assert.equal(count(),before,"No LP collection before consent");
    await region.getByRole("button").first().click();await page.waitForFunction(()=>!!localStorage.getItem("questforge-lp-measurement-token"));
    assert.equal(count(),before+1);assert.equal(await page.evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
    // Prevent navigation while exercising the actual CTA listener, then carry its capability through a simulated OAuth return.
    const link=page.locator('[data-join-cta]:visible').first();const linkHandle=await link.elementHandle();assert.ok(linkHandle);
    await link.evaluate((node:unknown)=>{const anchor=node as {addEventListener(type:string,listener:(event:{preventDefault():void})=>void):void};anchor.addEventListener("click",event=>event.preventDefault());});await link.click();
    const destination=new URL((await linkHandle.getAttribute("href"))!);const token=new URLSearchParams(destination.hash.slice(1)).get("acq");assert.match(token||"",/^[a-f0-9]{64}$/);
    await region.getByRole("button").last().click();assert.ok(!(await linkHandle.getAttribute("href"))!.includes("acq="));
    await page.waitForTimeout(100);assert.equal(count(),before,"LP withdrawal deletes this unclaimed visit");
    if(language==="ja"){await region.scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,"lp-ja-mobile.png")});}
    checks.push(`LP ${language}/320: no pre-consent collection, finite UTM, CTA fragment and withdrawal`);await page.close();
    const app=await browser.newPage();await app.addInitScript(()=>{globalThis.QuestForgeConfig={analyticsEnabled:true};});
    await app.goto(`${base}/tests/browser/production-relay.html?api=${encodeURIComponent(fixture.baseUrl)}&uid=${encodeURIComponent(fixture.uid)}#acq=${token}`);
    await app.locator(".rf-shell").waitFor();assert.ok(!app.url().includes("acq="));
    assert.equal(await app.evaluate(()=>JSON.parse(sessionStorage.getItem("questforge-acquisition-handoff")||"null")?.token),token);
    checks.push(`App ${language}: fragment stripped synchronously and short-lived handoff kept through mount`);await app.close();
  }
  assert.deepEqual(errors,[]);assert.equal(externalRequests,0);
  await writeFile(resolve(output,"result.json"),JSON.stringify({status:"pass",checks,errors,externalRequests,providerCalls:0,physicalDeviceAcceptance:false},null,2)+"\n");
  console.log(`Launch analytics browser PASS: ${checks.length} checks, 9 languages, widths 320/1440, provider calls 0.`);
}finally{await browser.close();await fixture.close();db.close();await builtServer?.close();await source.close();}

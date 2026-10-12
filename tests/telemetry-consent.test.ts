import test from "node:test";
import assert from "node:assert/strict";
import { getTelemetryConsent, setTelemetryConsent, initializeTelemetry, trackTelemetry, flushTelemetry, resetTelemetryForTests } from "../telemetry.ts";

test("no events before consent; refusal and withdrawal discard queued events, including after reconsent", async () => {
  const values = new Map<string,string>();
  const calls: string[] = [];
  const storage = Object.getOwnPropertyDescriptor(globalThis,"localStorage");
  const config = globalThis.QuestForgeConfig;
  const fetcher = globalThis.fetch;
  Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>values.set(key,value)}});
  globalThis.QuestForgeConfig = {telemetryEndpoint:"https://example.test/telemetry"};
  globalThis.fetch = async (_input, init) => { calls.push(String(init?.body)); return new Response(null,{status:202}); };
  try {
    resetTelemetryForTests();
    initializeTelemetry({surface:"public_lp"});
    assert.equal(getTelemetryConsent(),"unknown");
    trackTelemetry("public_page_view",{kind:"home",source:"ai_referral",status:"ja",url:"secret"});
    flushTelemetry();
    assert.equal(calls.length,0);
    setTelemetryConsent("denied");
    trackTelemetry("public_page_view");
    flushTelemetry();
    assert.equal(calls.length,0);
    setTelemetryConsent("granted");
    trackTelemetry("public_page_view",{kind:"home",source:"ai_referral",status:"ja",url:"secret"});
    setTelemetryConsent("denied");
    setTelemetryConsent("granted");
    flushTelemetry();
    assert.equal(calls.length,0);
    trackTelemetry("app_cta_click",{kind:"home",source:"ai_referral",status:"ja",url:"secret"});
    flushTelemetry();
    assert.equal(calls.length,1);
    assert.equal(JSON.parse(calls[0]).events[0].name,"app_cta_click");
    assert.ok(!calls[0].includes("secret"));
    globalThis.fetch = () => { throw new Error("blocked"); };
    trackTelemetry("public_page_view");
    assert.doesNotThrow(flushTelemetry);
  } finally {
    resetTelemetryForTests();
    if(storage) Object.defineProperty(globalThis,"localStorage",storage);
    else Reflect.deleteProperty(globalThis,"localStorage");
    globalThis.fetch=fetcher;
    globalThis.QuestForgeConfig=config;
  }
});

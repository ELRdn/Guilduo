import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.ts";

test("public ingestion accepts known categories, rejects private values and preserves old events", async () => {
  const events = [
    {name:"public_page_view",surface:"public_docs",kind:"docs_codex",source:"ai_referral",status:"en"},
    {name:"app_cta_click",surface:"public_lp",kind:"home",source:"organic_search",status:"ja"},
    {name:"public_page_view",surface:"public_docs",kind:"private-title",source:"ai_referral",status:"en"},
    {name:"public_page_view",surface:"public_docs",kind:"docs_codex",source:"raw-url",status:"en"},
    {name:"public_page_view",surface:"public_docs",kind:["docs_codex"],source:"ai_referral",status:"en"},
    {name:"sync_success",surface:"relay-forge",duration:10},
  ];
  const response = await worker.fetch(new Request("https://worker.test/telemetry", {
    method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({schemaVersion:1,events}),
  }), {}, {waitUntil:() => {}});
  assert.equal(response.status,202);
  assert.deepEqual(await response.json(),{accepted:3});
});

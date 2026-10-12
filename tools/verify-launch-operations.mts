import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { SqliteD1Database, FakeR2Bucket, asQuestForgeState } from "../tests/test-helpers.ts";
import { migrateState, createQuest } from "../server/questforge-domain.ts";
import { readState, writeState } from "../worker/src/appwrite-store.ts";
import { analyticsSubject, setAnalyticsConsent, deleteAnalyticsAccount } from "../worker/src/launch-analytics.ts";
import { grantCredits, reserveCredits, getBillingStatus, attributeReferral, rewardReferral, markStripeEventProcessed } from "../worker/src/billing-store.ts";
import type { WorkerEnv } from "../worker/src/worker-types.ts";

// Synthetic local records only. Never loads .dev.vars or connects to a provider.
const directory=resolve(".qa-artifacts/launch-implementation/operations",crypto.randomUUID());
await mkdir(directory,{recursive:true});
const checks:string[]=[];
const source=new SqliteD1Database();
const config={approved:true,policyVersion:"2026-10-04",environment:"test",measurementStartAt:"2026-10-01T00:00:00.000Z",activationDays:7,paidConversionDays:30,attributionDays:30,retentionWindows:[{label:"d1",startHours:24,endHours:48}],campaigns:[],excludedOwnerIds:[]};
const uid=`ops-${crypto.randomUUID()}`,sentinel=`sentinel-${crypto.randomUUID()}`,replica=`replica-${crypto.randomUUID()}`;
const env:WorkerEnv={QUESTFORGE_DB:source,ANALYTICS_ENABLED:"true",ANALYTICS_CONFIG:JSON.stringify(config),ANALYTICS_DATA_POLICY_APPROVED:"true",ANALYTICS_TOKEN_KEY:"synthetic-operations-key-no-real-secrets",ANALYTICS_NOW:"2026-10-04T02:00:00.000Z"};
let restored:DatabaseSync|null=null;
try{
  await setAnalyticsConsent(env,{uid,email:"synthetic@example.test",authType:"appwrite",scopes:[],accountCreatedAt:env.ANALYTICS_NOW},{consent:"granted",policyVersion:config.policyVersion});
  const subject=await analyticsSubject(env,uid);assert.ok(subject);
  await setAnalyticsConsent(env,{uid:sentinel,email:"sentinel@example.test",authType:"appwrite",scopes:[],accountCreatedAt:env.ANALYTICS_NOW},{consent:"granted",policyVersion:config.policyVersion});
  const sentinelSubject=await analyticsSubject(env,sentinel);assert.ok(sentinelSubject);
  // Synthetic Test configuration and invoice IDs only; no Stripe payment or sales acceptance.
  const billingEnv={...env,BILLING_ENABLED:"true",BILLING_MODE:"test",BILLING_NOW:env.ANALYTICS_NOW,BILLING_CONFIG:JSON.stringify({approved:true,currency:"usd",monthlyPriceId:"price_opsmonthly",annualPriceId:"price_opsannual",monthlyCredits:10,annualMonthlyCredits:10,creditLifetimeDays:30,decisionCredits:1,referralCredits:5})};
  for(const owner of [uid,sentinel]){
    await grantCredits(billingEnv,owner,"synthetic-grant",20);
    assert.equal((await reserveCredits(billingEnv,owner,"synthetic-pending",3)).status,"reserved");
  }
  for(const [referred,referrer] of [[uid,sentinel],[sentinel,uid]]){
    await attributeReferral(billingEnv,referred,(await getBillingStatus(billingEnv,referrer)).referral.code);
    await rewardReferral(billingEnv,referred,`in_synthetic_${referred}`,billingEnv.BILLING_NOW!);
    await markStripeEventProcessed(billingEnv,`evt_synthetic_${referred}`);
  }
  const inventory=(database:DatabaseSync,pattern="*")=>{
    const schema=database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND tbl_name GLOB ? ORDER BY type,name").all(pattern);
    const tables=database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name GLOB ? ORDER BY name").all(pattern) as {name:string}[];
    const records=Object.fromEntries(tables.map(({name})=>[name,database.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all().map(row=>JSON.stringify(row)).sort()]));
    return JSON.stringify({schema,records});
  };
  const before=inventory(source.raw);
  const snapshot=resolve(directory,"synthetic-d1.sqlite");source.raw.prepare("VACUUM INTO ?").run(snapshot);
  restored=new DatabaseSync(snapshot);
  assert.equal((restored.prepare("PRAGMA integrity_check").get() as {integrity_check:string}).integrity_check,"ok");
  assert.deepEqual(restored.prepare("PRAGMA foreign_key_check").all(),[]);
  assert.equal(inventory(restored),before);checks.push("D1 populated schema, every table/record, integrity and foreign keys restored");
  const state=migrateState(asQuestForgeState({schemaVersion:7,tasks:[],taskEvents:[],character:{},battle:{},boss:{}}));
  createQuest(state,{kind:"todo",title:"Synthetic recovery work"});
  state.launchAnalyticsOutbox={subjectId:subject.subject_id,events:[{key:"saved",name:"meaningful_activity",at:env.ANALYTICS_NOW!,reference:"synthetic"}],overflow:0};
  const sentinelState=structuredClone(state);sentinelState.launchAnalyticsOutbox={subjectId:sentinelSubject.subject_id,events:[{key:"saved",name:"meaningful_activity",at:env.ANALYTICS_NOW!,reference:"synthetic"}],overflow:0};
  assert.equal(await writeState(env,uid,{schemaVersion:7,state},null),true);assert.equal(await writeState(env,sentinel,{schemaVersion:7,state:sentinelState},null),true);
  const payload=(await readState(env,uid)).payload;
  await writeFile(resolve(directory,"synthetic-appwrite-payload.json"),JSON.stringify(payload));
  const loaded=JSON.parse(await readFile(resolve(directory,"synthetic-appwrite-payload.json"),"utf8"));
  assert.equal(await writeState(env,replica,loaded,null),true);
  assert.deepEqual((await readState(env,replica)).payload,payload);checks.push("Appwrite payload local adapter restored; provider permissions/export NOT accepted");
  const bucket=new FakeR2Bucket(),copy=new FakeR2Bucket();const key="agents/avatars/synthetic-asset";
  await bucket.put(key,new TextEncoder().encode("synthetic-object"),{httpMetadata:{contentType:"application/x-guilduo-fixture"}});
  const object=await bucket.get(key);assert.ok(object);const bytes=new Uint8Array(await object.arrayBuffer());
  const originalHeaders=new Headers();object.writeHttpMetadata(originalHeaders);
  const manifest={key,size:object.size,contentType:originalHeaders.get("content-type"),sha256:createHash("sha256").update(bytes).digest("hex")};
  await writeFile(resolve(directory,"synthetic-r2-object.bin"),bytes);
  await writeFile(resolve(directory,"synthetic-r2-manifest.json"),JSON.stringify(manifest));
  const restoredManifest=JSON.parse(await readFile(resolve(directory,"synthetic-r2-manifest.json"),"utf8")) as typeof manifest;
  assert.deepEqual(restoredManifest,manifest);
  const restoredBytes=new Uint8Array(await readFile(resolve(directory,"synthetic-r2-object.bin")));
  assert.equal(createHash("sha256").update(restoredBytes).digest("hex"),restoredManifest.sha256);
  await copy.put(restoredManifest.key,restoredBytes,{httpMetadata:{contentType:restoredManifest.contentType!}});
  const copied=await copy.get(key);assert.ok(copied);assert.deepEqual(new Uint8Array(await copied.arrayBuffer()),bytes);assert.equal(copied.size,manifest.size);
  const headers=new Headers();copied.writeHttpMetadata(headers);assert.equal(headers.get("content-type"),manifest.contentType);
  checks.push("R2 fixture object bytes, key, size and content type restored; real R2 NOT accepted");
  const financialRecords=inventory(source.raw,"billing_*");
  const financialTableCounts=Object.fromEntries(Object.entries(JSON.parse(financialRecords).records as Record<string,string[]>).map(([table,rows])=>{
    assert.ok(rows.length>0,`${table} must contain synthetic financial records`);
    return [table,rows.length];
  }));
  const sentinelEvents=source.raw.prepare("SELECT * FROM launch_analytics_events WHERE subject_id=? ORDER BY event_key").all(sentinelSubject.subject_id);
  assert.ok(sentinelEvents.length>0);
  assert.ok(source.raw.prepare("SELECT 1 FROM launch_analytics_events WHERE subject_id=?").get(subject.subject_id));
  const deletion=await deleteAnalyticsAccount(env,uid);assert.equal(deletion.privateSnapshotCleanupPending,false);
  const businessState=structuredClone(state);delete businessState.launchAnalyticsOutbox;
  assert.deepEqual((await readState(env,uid)).payload.state,businessState);
  assert.deepEqual((await readState(env,sentinel)).payload.state,sentinelState);
  assert.deepEqual(await analyticsSubject(env,sentinel),sentinelSubject);
  assert.deepEqual(source.raw.prepare("SELECT * FROM launch_analytics_events WHERE subject_id=? ORDER BY event_key").all(sentinelSubject.subject_id),sentinelEvents);
  assert.equal(inventory(source.raw,"billing_*"),financialRecords,"Optional deletion must preserve every financial table and record");
  assert.deepEqual(source.raw.prepare("SELECT * FROM launch_analytics_events WHERE subject_id=?").all(subject.subject_id),[]);
  assert.deepEqual(source.raw.prepare("SELECT * FROM launch_analytics_preferences WHERE uid=?").all(uid),[]);
  assert.equal(await analyticsSubject(env,uid),null);checks.push("Optional deletion removes owner analytics and preserves business state, sentinel owner and all populated billing tables including credit ledger, pending reservations and rewarded referrals");
  const result={status:"LOCAL_SYNTHETIC_PASS",at:new Date().toISOString(),checks,financialTableCounts,providerCalls:0,productionAcceptance:false,snapshotSha256:createHash("sha256").update(await readFile(snapshot)).digest("hex"),limitations:["No production export or provider permissions verified","No identity/OAuth revocation or full-account deletion","No Site/Worker rollback executed","Deletion tombstones and encrypted backup custody need operator acceptance","No capacity, cost, RPO/RTO, monitoring delivery or operational-owner acceptance","Synthetic financial records only; no Stripe payment or provider reconciliation"]};
  await writeFile(resolve(directory,"result.json"),JSON.stringify(result,null,2)+"\n");
  await writeFile(resolve(directory,"../latest.json"),JSON.stringify({directory,result},null,2)+"\n");
  console.log(`Local operations rehearsal PASS (${checks.length} groups); zero provider calls. ${directory}`);
}finally{restored?.close();source.close();}

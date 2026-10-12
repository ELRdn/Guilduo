import assert from "node:assert/strict";
import { test } from "node:test";
import { analyticsReport, campaignFor, parseAnalyticsConfig, type AnalyticsEvent, type AnalyticsConfig } from "../server/launch-analytics.ts";
import { analyticsAdminReport, analyticsBackground, cleanupAnalyticsOutboxes, deleteAnalyticsAccount, analyticsSubject, appendAnalyticsOutbox, boundedAnalyticsBody, flushAnalyticsOutbox, handleAnalyticsPublic, handleAnalyticsOwner, analyticsPreference, purgeLaunchAnalytics, recordAgentConnection, recordAnalyticsPayment, setAnalyticsConsent } from "../worker/src/launch-analytics.ts";
import { mutateState, readState, writeState } from "../worker/src/appwrite-store.ts";
import type { WorkerEnv } from "../worker/src/worker-types.ts";
import type { AuthIdentity } from "../worker/src/security.ts";
import { createQuest, migrateState, transitionQuestHandoff } from "../server/questforge-domain.ts";
import { requestHumanReview, respondHumanReview } from "../server/human-requests.ts";
import { SqliteD1Database, asQuestForgeState, required } from "./test-helpers.ts";

const config: AnalyticsConfig={approved:true,policyVersion:"2026-10-04",environment:"test",measurementStartAt:"2026-10-01T00:00:00.000Z",activationDays:7,paidConversionDays:30,attributionDays:30,
  retentionWindows:[{label:"d1",startHours:24,endHours:48},{label:"d7",startHours:168,endHours:192},{label:"d30",startHours:720,endHours:744}],
  campaigns:[{id:"launch",source:"search",medium:"cpc",campaign:"launch"}],excludedOwnerIds:["operator"]};
const human:AuthIdentity={uid:"owner-a",email:"private@example.test",authType:"appwrite",scopes:[],accountCreatedAt:"2026-10-04T01:00:00.000Z"};
const agent:AuthIdentity={...human,authType:"oauth"};
const grant={consent:"granted",policyVersion:config.policyVersion};
function setup(t: {after(fn:()=>void):void}){
  const database=new SqliteD1Database();t.after(()=>database.close());
  const env:WorkerEnv={QUESTFORGE_DB:database,ANALYTICS_ENABLED:"true",ANALYTICS_DATA_POLICY_APPROVED:"true",ANALYTICS_CONFIG:JSON.stringify(config),ANALYTICS_TOKEN_KEY:"synthetic-secret-key-never-used-outside-tests",ANALYTICS_ADMIN_TOKEN:"synthetic-analytics-admin-isolated-token",ANALYTICS_NOW:"2026-10-04T01:01:00.000Z"};
  const req=(input:unknown,origin="https://guilduo.com")=>new Request("https://mcp.guilduo.com/analytics/acquisition",{method:"POST",headers:{origin,"content-type":"application/json","cf-connecting-ip":"192.0.2.1"},body:JSON.stringify(input)});
  return {database,env,req};
}
test("measurement config accepts finite registry and explicitly rejects extra, ambiguous or identifying campaign values",()=>{
  assert.equal(parseAnalyticsConfig(JSON.stringify(config)).activationDays,7);
  assert.equal(campaignFor(config,{source:"search",medium:"cpc",campaign:"launch"}),"launch");
  assert.equal(campaignFor(config,{}),"direct");
  assert.equal(campaignFor(config,{source:"private@example.test"}),"unknown");
  assert.equal(campaignFor(config,{source:"search",medium:"cpc",campaign:"launch",email:"private"}),"unknown");
  for(const bad of [{...config,approved:false},{...config,activationDays:0},{...config,campaigns:[...config.campaigns,...config.campaigns]},{...config,retentionWindows:[{label:"d1",startHours:48,endHours:24}]}])assert.throws(()=>parseAnalyticsConfig(JSON.stringify(bad)));
});
test("optional analytics is off by default; clients cannot set another owner's consent or send business facts",async t=>{
  const {env,database}=setup(t);env.ANALYTICS_ENABLED="false";
  assert.equal(await analyticsSubject(env,human.uid),null);
  const request=new Request("https://app.guilduo.com/api/v1/analytics/consent",{headers:{origin:"https://app.guilduo.com"}});
  assert.deepEqual(await (await handleAnalyticsOwner(request,env,human)).json(),{enabled:false,consent:"unknown",policyVersion:config.policyVersion});
  await assert.rejects(setAnalyticsConsent(env,human,{...grant,uid:"owner-b"}));
  await assert.rejects(handleAnalyticsOwner(request,env,agent));
  assert.equal((database.raw.prepare("SELECT COUNT(*) AS n FROM launch_analytics_subjects").get() as {n:number}).n,0);
});
test("cross-origin attribution uses single-claim expiring random capability and concurrent owners cannot steal it",async t=>{
  const {env,database,req}=setup(t);
  const response=await handleAnalyticsPublic(req({...grant,campaign:{source:"search",medium:"cpc",campaign:"launch"}}),env);
  const {token}=await response.json() as {token:string};assert.match(token,/^[a-f0-9]{64}$/);
  const acquiredHuman={...human,accountCreatedAt:env.ANALYTICS_NOW};
  await Promise.all([setAnalyticsConsent(env,acquiredHuman,{...grant,acquisitionToken:token}),setAnalyticsConsent(env,{...acquiredHuman,uid:"owner-b"},{...grant,acquisitionToken:token})]);
  const subjects=(database.raw.prepare("SELECT first_campaign FROM launch_analytics_subjects").all() as {first_campaign:string}[]);
  assert.equal(subjects.filter(s=>s.first_campaign==="launch").length,1);
  const visit=database.raw.prepare("SELECT * FROM launch_analytics_visits").get();assert.ok(!JSON.stringify(visit).includes(token));assert.ok(!JSON.stringify(visit).includes(human.email));
  const late=(await (await handleAnalyticsPublic(req(grant),env)).json() as {token:string}).token;
  env.ANALYTICS_NOW="2026-10-04T02:00:00.000Z";
  await setAnalyticsConsent(env,{...human,uid:"owner-c"},{...grant,acquisitionToken:late});
  assert.equal((await analyticsSubject(env,"owner-c"))?.first_campaign,"unknown");
});
test("collector requires consent, trusted origin, JSON and actual byte bounds; IP bucket is bounded and pseudonymous",async t=>{
  const {env,req,database}=setup(t);
  await assert.rejects(handleAnalyticsPublic(req({...grant,consent:"denied"}),env));
  await assert.rejects(handleAnalyticsPublic(req(grant,"https://attacker.example"),env));
  await assert.rejects(boundedAnalyticsBody(req({...grant,large:"x".repeat(4096)})));
  const outcomes=await Promise.allSettled(Array.from({length:31},()=>handleAnalyticsPublic(req(grant),env)));
  assert.equal(outcomes.filter(r=>r.status==="fulfilled").length,29); // refused consent also consumes a quota
  assert.ok(!JSON.stringify(database.raw.prepare("SELECT * FROM launch_analytics_rate").all()).includes("192.0.2.1"));
});
test("real saved Human-Agent round trip activates once; replay, wrong work and stale consent cannot fabricate it",async t=>{
  const {env,database}=setup(t);await setAnalyticsConsent(env,human,grant);
  const subject=required(await analyticsSubject(env,human.uid));
  await recordAgentConnection(env,human.uid,"cyan");
  // Use real domain mutations; timestamps are normalized to the test clock after commit.
  const state=migrateState(asQuestForgeState({schemaVersion:7,tasks:[],taskEvents:[],character:{},battle:{},boss:{}}));
  const humanContext={ownerId:human.uid,requester:{type:"human" as const,id:human.uid,label:"Human"},source:"web"};
  const agentContext={ownerId:human.uid,requester:{type:"agent" as const,id:"cyan",label:"Cyan"},source:"mcp"};
  const creation=createQuest(state,{kind:"todo",title:"private Quest should never appear in report",assignee:{type:"agent",id:"cyan",label:"Cyan",handoffState:"working"}},{...humanContext,returnEvent:true});
  creation.event.at=env.ANALYTICS_NOW!;
  await appendAnalyticsOutbox(env,human.uid,state,creation,human);
  const review=requestHumanReview(state,creation.quest.id,{requestKey:"review",title:"Review",reason:"Human feedback",checkTarget:"Result",completionCriteria:"Confirm",expectedUpdatedAt:creation.quest.updatedAt,dryRun:false},agentContext);
  const answer=respondHumanReview(state,review.quest.id,{action:"revise",response:"private answer",confirmed:true,expectedUpdatedAt:review.quest.updatedAt,dryRun:false},humanContext);
  for(const e of answer.events)e.at=env.ANALYTICS_NOW!;
  await appendAnalyticsOutbox(env,human.uid,state,answer,human);
  creation.quest.assignee.handoffState="blocked";
  const source=required(state.tasks.find(q=>q.id===creation.quest.id));source.assignee.handoffState="blocked";
  const resume=transitionQuestHandoff(state,source.id,{state:"working",expectedUpdatedAt:source.updatedAt,dryRun:false},agentContext);
  resume.event.at=env.ANALYTICS_NOW!;
  await appendAnalyticsOutbox(env,human.uid,state,resume,agent);
  await Promise.all([flushAnalyticsOutbox(env,human.uid,state),flushAnalyticsOutbox(env,human.uid,state)]);
  assert.equal((database.raw.prepare("SELECT COUNT(*) AS n FROM launch_analytics_events WHERE name='activation_completed'").get() as {n:number}).n,1);
  const report=await analyticsAdminReport(env,env.ANALYTICS_ADMIN_TOKEN!);assert.equal(report.stages.activation_completed,1);assert.ok(!JSON.stringify(report).includes("private"));assert.ok(!JSON.stringify(report).includes(human.uid));
  await setAnalyticsConsent(env,human,{...grant,consent:"denied"});await flushAnalyticsOutbox(env,human.uid,state);
  assert.equal((database.raw.prepare("SELECT COUNT(*) AS n FROM launch_analytics_events").get() as {n:number}).n,0);
  await setAnalyticsConsent(env,human,grant);await flushAnalyticsOutbox(env,human.uid,state);
  assert.equal((database.raw.prepare("SELECT COUNT(*) AS n FROM launch_analytics_events WHERE name='activation_completed'").get() as {n:number}).n,0);
});
test("durable outbox survives failed ingestion and restart; acknowledged events are pruned only after durable success",async t=>{
  const {env,database}=setup(t);await setAnalyticsConsent(env,human,grant);const subject=required(await analyticsSubject(env,human.uid));
  const e:AnalyticsEvent={key:"saved:activity",name:"meaningful_activity",at:env.ANALYTICS_NOW!,reference:"hashed"};
  const state=asQuestForgeState({tasks:[],launchAnalyticsOutbox:{subjectId:subject.subject_id,events:[e],overflow:0}});
  database.raw.exec("CREATE TRIGGER fail_events BEFORE INSERT ON launch_analytics_events BEGIN SELECT RAISE(ABORT,'isolated outage'); END;");
  await assert.rejects(flushAnalyticsOutbox(env,human.uid,state));assert.equal((state.launchAnalyticsOutbox as {events:unknown[]}).events.length,1);
  database.raw.exec("DROP TRIGGER fail_events;");await flushAnalyticsOutbox({...env},human.uid,structuredClone(state));
  await appendAnalyticsOutbox(env,human.uid,state,{},human);assert.equal((state.launchAnalyticsOutbox as {events:unknown[]}).events.length,0);
});
test("existing accounts and unknown registration are reported separately; refund projection is idempotent and owner isolated",async t=>{
  const {env,database}=setup(t);await setAnalyticsConsent(env,human,grant);
  await setAnalyticsConsent(env,{...human,uid:"existing",accountCreatedAt:"2026-01-01T00:00:00.000Z"},grant);
  await setAnalyticsConsent(env,{...human,uid:"unknown",accountCreatedAt:undefined},grant);
  const payment={invoiceId:"in_test",paidAt:env.ANALYTICS_NOW!,currency:"usd",paidMinor:1000,refundedMinor:0,disputed:false,interval:"monthly" as const,initial:true};
  await recordAnalyticsPayment(env,human.uid,payment);await recordAnalyticsPayment(env,human.uid,payment);
  await recordAnalyticsPayment(env,human.uid,{...payment,refundedMinor:1000});await recordAnalyticsPayment(env,"absent",payment);
  assert.equal((database.raw.prepare("SELECT COUNT(*) AS n FROM launch_analytics_payments").get() as {n:number}).n,1);
  const report=await analyticsAdminReport(env,env.ANALYTICS_ADMIN_TOKEN!);assert.equal(report.coverage.existingAccounts,1);assert.equal(report.coverage.unknownRegistration,1);assert.equal(report.finances.usd?.refundedMinor,1000);assert.equal(report.finances.usd?.cacMinor,null);
  await assert.rejects(analyticsAdminReport(env,"owner-token"));await assert.rejects(analyticsAdminReport({...env,BILLING_ADMIN_TOKEN:env.ANALYTICS_ADMIN_TOKEN},env.ANALYTICS_ADMIN_TOKEN!));
});
test("mature denominators, boundary exclusion, early payment and missing observations are explicit",()=>{
  const start=Date.parse("2026-10-04T00:00:00.000Z");const day=86400000;
  const subjects=[{subject_id:"a",consent_at:new Date(start).toISOString(),account_created_at:new Date(start).toISOString(),cohort:"new",first_campaign:"direct",last_campaign:"direct"}];
  const events=[{key:"activate",name:"activation_completed" as const,reference:"",subject_id:"a",at:new Date(start+day).toISOString()},{key:"return",name:"meaningful_activity" as const,reference:"",subject_id:"a",at:new Date(start+48*3600000).toISOString()}];
  const payments=[{subject_id:"a",paid_at:new Date(start+3600000).toISOString(),paid_minor:1000,refunded_minor:0,disputed:0,currency:"usd",interval:"monthly",is_initial:1}];
  const early=analyticsReport(subjects,events,payments,config,start+2*day);assert.equal(early.activation.rate,null);assert.equal(early.activation.pendingN,1);assert.equal(early.retention.d1?.reached,0);assert.equal(early.paidConversion.rate,null);
  const mature=analyticsReport(subjects,events,payments,config,start+31*day);assert.equal(mature.activation.rate,1);assert.equal(mature.paidConversion.rate,1);assert.equal(mature.retention.d30?.rate,0);assert.equal(mature.ttv.medianMs,day);
});
test("expired handoff does not delete LP denominators; 90-day purge removes optional data without touching billing",async t=>{
  const {env,database,req}=setup(t);await handleAnalyticsPublic(req(grant),env);await setAnalyticsConsent(env,human,grant);
  env.ANALYTICS_NOW="2026-10-05T00:00:00.000Z";await purgeLaunchAnalytics(env);
  assert.equal((database.raw.prepare("SELECT COUNT(*) AS n FROM launch_analytics_visits").get() as {n:number}).n,1);
  env.ANALYTICS_NOW="2027-01-05T00:00:00.000Z";await purgeLaunchAnalytics(env);
  assert.equal((database.raw.prepare("SELECT COUNT(*) AS n FROM launch_analytics_subjects").get() as {n:number}).n,0);
  assert.equal((database.raw.prepare("SELECT COUNT(*) AS n FROM launch_analytics_visits").get() as {n:number}).n,0);
});


test("unknown acquisition freezes at first consent; later LP visits and reconsent never rewrite it",async t=>{
  const {env,req,database}=setup(t);await setAnalyticsConsent(env,human,grant);
  const visit=(await (await handleAnalyticsPublic(req({...grant,campaign:{source:"search",medium:"cpc",campaign:"launch"}}),env)).json() as {token:string}).token;
  await setAnalyticsConsent(env,human,{...grant,acquisitionToken:visit});
  assert.equal((await analyticsSubject(env,human.uid))?.first_campaign,"unknown");
  await setAnalyticsConsent(env,human,{...grant,consent:"denied"});
  const later=(await (await handleAnalyticsPublic(req({...grant,campaign:{source:"search",medium:"cpc",campaign:"launch"}}),env)).json() as {token:string}).token;
  await setAnalyticsConsent(env,{...human,accountCreatedAt:env.ANALYTICS_NOW},{...grant,acquisitionToken:later});
  assert.equal((await analyticsSubject(env,human.uid))?.first_campaign,"unknown");
  assert.equal((database.raw.prepare("SELECT acquisition_frozen AS n FROM launch_analytics_subjects").get() as {n:number}).n,1);
});

test("expired subjects stop ingestion before cron; persistent cleanup retries and never scrubs a new epoch",async t=>{
  const {env,database}=setup(t);await setAnalyticsConsent(env,human,grant);const old=required(await analyticsSubject(env,human.uid));
  env.ANALYTICS_NOW="2027-01-03T01:01:00.000Z";
  assert.equal(await analyticsSubject(env,human.uid),null);
  await recordAgentConnection(env,human.uid,"cyan");
  assert.equal((database.raw.prepare("SELECT COUNT(*) AS n FROM launch_analytics_events WHERE name='agent_connected'").get() as {n:number}).n,0);
  await setAnalyticsConsent(env,human,grant);const fresh=required(await analyticsSubject(env,human.uid));assert.notEqual(fresh.subject_id,old.subject_id);
  await cleanupAnalyticsOutboxes(env,async()=>{throw Error("Appwrite unavailable")});
  assert.equal((database.raw.prepare("SELECT attempts FROM launch_analytics_cleanup").get() as {attempts:number}).attempts,1);
  env.ANALYTICS_NOW="2027-01-03T03:01:00.000Z";
  const scrubbed:string[]=[];await cleanupAnalyticsOutboxes(env,async(uid,subject)=>{assert.equal(uid,human.uid);scrubbed.push(subject)});
  assert.deepEqual(scrubbed,[old.subject_id]);assert.equal((database.raw.prepare("SELECT COUNT(*) AS n FROM launch_analytics_cleanup").get() as {n:number}).n,0);
  await deleteAnalyticsAccount(env,human.uid);
  assert.equal((database.raw.prepare("SELECT COUNT(*) AS n FROM launch_analytics_preferences").get() as {n:number}).n,0);
});

test("optional failures increment health; ambiguous shared-charge refunds report null exact cash",async t=>{
  const {env,database}=setup(t);await setAnalyticsConsent(env,human,grant);
  await analyticsBackground(env,Promise.reject(Error("private error text")));
  assert.equal((database.raw.prepare("SELECT failures FROM launch_analytics_health").get() as {failures:number}).failures,1);
  await recordAnalyticsPayment(env,human.uid,{invoiceId:"shared",paidAt:env.ANALYTICS_NOW!,currency:"usd",paidMinor:1000,refundedMinor:300,refundExact:false,disputed:false,interval:"monthly",initial:true});
  const report=await analyticsAdminReport(env,env.ANALYTICS_ADMIN_TOKEN!);
  assert.equal(report.finances.usd?.refundedMinor,null);assert.equal(report.finances.usd?.refundUpperBoundMinor,300);assert.equal(report.finances.usd?.refundAllocationUnknownN,1);
});


test("snapshot cleanup removes withdrawn delivery records with persisted revision and preserves another owner and financial ledger",async t=>{
  const {env,database}=setup(t);const uid=`scrub-${crypto.randomUUID()}`;const other=`sentinel-${crypto.randomUUID()}`;
  const identity={...human,uid};await setAnalyticsConsent(env,identity,grant);const subject=required(await analyticsSubject(env,uid));
  const state=migrateState(asQuestForgeState({schemaVersion:7,tasks:[],taskEvents:[],character:{},battle:{},boss:{}}));
  state.launchAnalyticsOutbox={subjectId:subject.subject_id,events:[{key:"saved",name:"meaningful_activity",at:env.ANALYTICS_NOW!,reference:"hash"}],overflow:0};
  await writeState(env,uid,{state},null);await writeState(env,other,{state:structuredClone(state)},null);
  database.raw.prepare("INSERT INTO billing_accounts(mode,uid,referral_code,balance,state_json) VALUES ('test',?,'isolated-financial-sentinel',7,'{}')").run(uid);
  await setAnalyticsConsent(env,identity,{...grant,consent:"denied"});
  await cleanupAnalyticsOutboxes(env);
  assert.equal((await readState(env,uid)).payload.state?.launchAnalyticsOutbox,undefined);
  assert.ok((await readState(env,other)).payload.state?.launchAnalyticsOutbox);
  assert.equal((database.raw.prepare("SELECT balance FROM billing_accounts WHERE uid=?").get(uid) as {balance:number}).balance,7);
  const revision=(await readState(env,uid)).etag;await cleanupAnalyticsOutboxes(env);assert.equal((await readState(env,uid)).etag,revision);
});

test("late Quest saves after completed withdrawal cleanup are scrubbed even with collection paused",async t=>{
  const {env,database}=setup(t);const uid=`late-${crypto.randomUUID()}`;const identity={...human,uid};
  await setAnalyticsConsent(env,identity,grant);const subject=required(await analyticsSubject(env,uid));
  const state=migrateState(asQuestForgeState({schemaVersion:7,tasks:[],taskEvents:[],character:{},battle:{},boss:{}}));
  createQuest(state,{kind:"todo",title:"Keep actual work"});
  const outbox={subjectId:subject.subject_id,events:[{key:"late",name:"meaningful_activity" as const,at:env.ANALYTICS_NOW!,reference:"hash"}],overflow:0};
  state.launchAnalyticsOutbox=outbox;await writeState(env,uid,{state},null);
  await setAnalyticsConsent(env,identity,{...grant,consent:"denied"});await cleanupAnalyticsOutboxes(env);
  assert.equal((database.raw.prepare("SELECT COUNT(*) AS n FROM launch_analytics_cleanup").get() as {n:number}).n,0);
  const late=await mutateState(env,uid,next=>{next.launchAnalyticsOutbox=outbox;return null;});
  env.ANALYTICS_ENABLED="false";
  await flushAnalyticsOutbox(env,uid,late.state);
  const recovered=(await readState(env,uid)).payload.state;
  assert.equal(recovered?.launchAnalyticsOutbox,undefined);
  assert.deepEqual(recovered?.tasks,state.tasks);
  assert.equal((database.raw.prepare("SELECT COUNT(*) AS n FROM launch_analytics_events WHERE subject_id=?").get(subject.subject_id) as {n:number}).n,0);
});

test("an older cleanup DELETE cannot consume a same-clock retry after a late save",{timeout:5000},async t=>{
  const {env,database}=setup(t);const uid=`race-${crypto.randomUUID()}`;const identity={...human,uid};
  await setAnalyticsConsent(env,identity,grant);const subject=required(await analyticsSubject(env,uid));
  const state=migrateState(asQuestForgeState({schemaVersion:7,tasks:[],taskEvents:[],character:{},battle:{},boss:{}}));
  const outbox={subjectId:subject.subject_id,events:[{key:"late",name:"meaningful_activity" as const,at:env.ANALYTICS_NOW!,reference:"hash"}],overflow:0};
  state.launchAnalyticsOutbox=outbox;await writeState(env,uid,{state},null);
  await setAnalyticsConsent(env,identity,{...grant,consent:"denied"});
  let release!:()=>void;let reached!:()=>void;let deletes=0;
  const paused=new Promise<void>(resolve=>{reached=resolve;});const resume=new Promise<void>(resolve=>{release=resolve;});
  const prepare=database.prepare.bind(database);
  database.prepare=sql=>{
    const statement=prepare(sql);
    if(sql.startsWith("DELETE FROM launch_analytics_cleanup")){
      const bind=statement.bind.bind(statement);
      statement.bind=(...values)=>{
        const bound=bind(...values);const run=bound.run.bind(bound);
        bound.run=async()=>{
          if(++deletes===1){reached();await resume;}
          else if(deletes===2)throw Error("Retry deletion interrupted");
          return run();
        };
        return bound;
      };
    }
    return statement;
  };
  const older=cleanupAnalyticsOutboxes(env);
  try{
    await paused;
    assert.equal((await readState(env,uid)).payload.state?.launchAnalyticsOutbox,undefined);
    const late=await mutateState(env,uid,next=>{next.launchAnalyticsOutbox=outbox;return null;});
    await flushAnalyticsOutbox(env,uid,late.state);
    assert.equal((await readState(env,uid)).payload.state?.launchAnalyticsOutbox,undefined);
    const newer=required(database.raw.prepare("SELECT requested_at,attempts FROM launch_analytics_cleanup WHERE uid=?").get(uid) as {requested_at:string;attempts:number}|undefined);
    assert.ok(newer.requested_at>env.ANALYTICS_NOW!);assert.equal(newer.attempts,1);
  }finally{release();await older;database.prepare=prepare;}
  assert.equal((database.raw.prepare("SELECT COUNT(*) AS n FROM launch_analytics_cleanup WHERE uid=?").get(uid) as {n:number}).n,1);
  env.ANALYTICS_NOW="2026-10-04T03:01:00.000Z";await cleanupAnalyticsOutboxes(env);
  assert.equal((database.raw.prepare("SELECT COUNT(*) AS n FROM launch_analytics_cleanup WHERE uid=?").get(uid) as {n:number}).n,0);
});

test("Stripe Test and Live projections only enter matching measurement environments",async t=>{
  const {env,database}=setup(t);
  const payment={invoiceId:"mode-boundary",paidAt:env.ANALYTICS_NOW!,currency:"usd",paidMinor:1000,refundedMinor:0,disputed:false,interval:"monthly" as const,initial:true};
  for(const environment of ["test","live"] as const){
    const uid=`mode-${environment}`;env.ANALYTICS_CONFIG=JSON.stringify({...config,environment});
    await setAnalyticsConsent(env,{...human,uid},grant);
    env.BILLING_MODE=environment==="live"?"test":"live";
    await recordAnalyticsPayment(env,uid,payment);
    assert.equal((database.raw.prepare("SELECT COUNT(*) AS n FROM launch_analytics_payments").get() as {n:number}).n,environment==="test"?0:1);
    env.BILLING_MODE=environment;await recordAnalyticsPayment(env,uid,payment);
  }
  assert.equal((database.raw.prepare("SELECT COUNT(*) AS n FROM launch_analytics_payments").get() as {n:number}).n,2);
});

test("LP session signup rates await mature windows and exclude existing-account returns",async t=>{
  const {env,req}=setup(t);
  const getToken=async()=> (await (await handleAnalyticsPublic(req(grant),env)).json() as {token:string}).token;
  const before=await getToken();await setAnalyticsConsent(env,{...human,accountCreatedAt:env.ANALYTICS_NOW},{...grant,acquisitionToken:before});
  const returning=await getToken();await setAnalyticsConsent(env,{...human,uid:"old",accountCreatedAt:"2025-01-01T00:00:00.000Z"},{...grant,acquisitionToken:returning});
  await getToken();
  const early=await analyticsAdminReport(env,env.ANALYTICS_ADMIN_TOKEN!);assert.equal(early.campaigns[0]?.signupRate,null);
  env.ANALYTICS_NOW="2026-11-05T00:00:00.000Z";
  const mature=await analyticsAdminReport(env,env.ANALYTICS_ADMIN_TOKEN!);assert.equal(mature.campaigns[0]?.matureN,3);assert.equal(mature.campaigns[0]?.newSignups,1);assert.equal(mature.campaigns[0]?.signupRate,1/3);
});


test("collection switched off still lets a previously consenting Human withdraw",async t=>{
  const {env,database}=setup(t);await setAnalyticsConsent(env,human,grant);env.ANALYTICS_ENABLED="false";
  assert.equal((await analyticsPreference(env,human.uid)).consent,"granted");
  await setAnalyticsConsent(env,human,{...grant,consent:"denied"});
  assert.equal((await analyticsPreference(env,human.uid)).consent,"unknown");
  assert.equal((database.raw.prepare("SELECT COUNT(*) AS n FROM launch_analytics_subjects").get() as {n:number}).n,0);
});

import { DomainError } from "../../server/questforge-domain.ts";
import { ANALYTICS_EVENTS, ANALYTICS_POLICY_VERSION, analyticsReport, campaignFor, parseAnalyticsConfig, type AnalyticsConfig, type AnalyticsEvent, type AnalyticsSubject, type ReportEvent, type ReportPayment } from "../../server/launch-analytics.ts";
import type { QuestForgeState } from "../../types/questforge.ts";
import type { AuthIdentity } from "./security.ts";
import type { JsonRecord, WorkerEnv } from "./worker-types.ts";
import { mutateState, readState } from "./appwrite-store.ts";
import { billingMode } from "./billing-store.ts";

const fail = (status: number, code: string) => new DomainError(status, code, "Optional measurement request could not be accepted.");
const record = (v: unknown): JsonRecord => v !== null && typeof v === "object" && !Array.isArray(v) ? v as JsonRecord : {};
const stamp = (env: WorkerEnv) => env.ANALYTICS_NOW || new Date().toISOString();
const db = (env: WorkerEnv) => { if (!env.QUESTFORGE_DB) throw fail(503,"analytics_unavailable"); return env.QUESTFORGE_DB; };
export function analyticsConfig(env: WorkerEnv): AnalyticsConfig {
  if (env.ANALYTICS_ENABLED !== "true" || env.ANALYTICS_DATA_POLICY_APPROVED !== "true" || !env.ANALYTICS_TOKEN_KEY || env.ANALYTICS_TOKEN_KEY.length < 32) throw fail(503,"analytics_unavailable");
  try { return parseAnalyticsConfig(env.ANALYTICS_CONFIG || ""); } catch { throw fail(503,"analytics_unavailable"); }
}
export async function analyticsHash(env: WorkerEnv, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.ANALYTICS_TOKEN_KEY), { name:"HMAC",hash:"SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,"0")).join("");
}
function trustedOrigin(request: Request, env: WorkerEnv, surface: "lp" | "app") {
  const supplied = request.headers.get("origin");
  const origin = surface === "lp" ? "https://guilduo.com" : "https://app.guilduo.com";
  const local = env.ANALYTICS_ALLOW_LOCAL === "true" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(supplied || "");
  if (supplied !== origin && !local && !(surface === "app" && !supplied && request.headers.get("sec-fetch-site") === "same-origin" && new URL(request.url).origin === origin)) throw fail(403,"analytics_origin_required");
}
export async function boundedAnalyticsBody(request: Request, maxBytes = 4096): Promise<JsonRecord> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw fail(415,"analytics_json_required");
  if (Number(request.headers.get("content-length")) > maxBytes) throw fail(413,"analytics_payload_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw fail(400,"analytics_invalid_body");
  const chunks: Uint8Array[]=[]; let length=0;
  for (;;) { const part=await reader.read(); if(part.done)break; length+=part.value.byteLength; if(length>maxBytes){await reader.cancel();throw fail(413,"analytics_payload_too_large");} chunks.push(part.value); }
  const bytes=new Uint8Array(length); let offset=0; for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  try { const value=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)); if(!value || typeof value!=="object" || Array.isArray(value)) throw Error(); return value as JsonRecord; } catch { throw fail(400,"analytics_invalid_body"); }
}
function fields(input: JsonRecord, allowed: string[]) { if(Object.keys(input).some(k=>!allowed.includes(k)))throw fail(400,"analytics_invalid_body"); }
async function rateLimit(env: WorkerEnv, request: Request, operation: string) {
  const at=Date.parse(stamp(env)); const minute=Math.floor(at/60000); const expires=new Date((minute+2)*60000).toISOString();
  // The platform-set client IP is HMAC'd in a minute bucket; no raw IP or fingerprint is stored.
  const caller=await analyticsHash(env,`rate:${minute}:${request.headers.get("cf-connecting-ip") || "unknown"}`);
  const buckets=[{key:`${operation}:${minute}:global`,limit:1000},{key:`${operation}:${minute}:${caller}`,limit:30}];
  const results=await db(env).batch(buckets.map(b=>db(env).prepare("INSERT INTO launch_analytics_rate(bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count<?").bind(b.key,expires,b.limit)));
  if(results.some(r=>r.meta?.changes!==1))throw fail(429,"analytics_rate_limited");
}
type Subject = AnalyticsSubject & { uid: string; environment: string; excluded: number; consent_version: string };
export async function analyticsSubject(env: WorkerEnv, uid: string): Promise<Subject | null> {
  if(env.ANALYTICS_ENABLED!=="true")return null;
  const config=analyticsConfig(env);
  const cutoff=new Date(Date.parse(stamp(env))-90*86400000).toISOString();
  return db(env).prepare("SELECT * FROM launch_analytics_subjects WHERE uid=? AND environment=? AND consent_version=? AND consent_at>?").bind(uid,config.environment,config.policyVersion,cutoff).first<Subject>();
}
export async function analyticsPreference(env: WorkerEnv, uid: string) {
  if(env.ANALYTICS_ENABLED!=="true"){
    const existing=await env.QUESTFORGE_DB?.prepare("SELECT subject_id FROM launch_analytics_subjects WHERE uid=?").bind(uid).first().catch(()=>null);
    return {enabled:false,consent:existing?"granted":"unknown",policyVersion:ANALYTICS_POLICY_VERSION};
  }
  const config=analyticsConfig(env);
  const preference=await db(env).prepare("SELECT state,policy_version FROM launch_analytics_preferences WHERE uid=?").bind(uid).first<{state:string;policy_version:string}>();
  const subject=await analyticsSubject(env,uid);
  return {enabled:true,consent:preference?.state==="denied"?"denied":subject?"granted":"unknown",policyVersion:config.policyVersion};
}
async function withdraw(env: WorkerEnv, uid: string) {
  await db(env).batch([
    db(env).prepare("INSERT INTO launch_analytics_cleanup(uid,subject_id,requested_at,next_attempt_at) SELECT uid,subject_id,?,? FROM launch_analytics_subjects WHERE uid=? ON CONFLICT(uid,subject_id) DO NOTHING").bind(stamp(env),stamp(env),uid),
    db(env).prepare("DELETE FROM launch_analytics_visits WHERE claimed_subject IN (SELECT subject_id FROM launch_analytics_subjects WHERE uid=?)").bind(uid),
    db(env).prepare("DELETE FROM launch_analytics_events WHERE subject_id IN (SELECT subject_id FROM launch_analytics_subjects WHERE uid=?)").bind(uid),
    db(env).prepare("DELETE FROM launch_analytics_payments WHERE subject_id IN (SELECT subject_id FROM launch_analytics_subjects WHERE uid=?)").bind(uid),
    db(env).prepare("DELETE FROM launch_analytics_subjects WHERE uid=?").bind(uid),
    db(env).prepare("INSERT INTO launch_analytics_preferences(uid,state,policy_version,updated_at) VALUES (?,'denied',?,?) ON CONFLICT(uid) DO UPDATE SET state='denied',policy_version=excluded.policy_version,updated_at=excluded.updated_at").bind(uid,ANALYTICS_POLICY_VERSION,stamp(env)),
  ]);
}
export async function setAnalyticsConsent(env: WorkerEnv, identity: AuthIdentity, input: JsonRecord) {
  fields(input,["consent","policyVersion","acquisitionToken"]);
  if(input.policyVersion!==ANALYTICS_POLICY_VERSION || !["granted","denied"].includes(String(input.consent)))throw fail(400,"analytics_invalid_consent");
  if(input.acquisitionToken!==undefined && (typeof input.acquisitionToken!=="string" || !/^[a-f0-9]{64}$/.test(input.acquisitionToken)))throw fail(400,"analytics_invalid_token");
  // Withdrawal remains available even if collection has been switched off.
  if(input.consent==="denied"){await withdraw(env,identity.uid);return {enabled:env.ANALYTICS_ENABLED==="true",consent:"denied",policyVersion:ANALYTICS_POLICY_VERSION};}
  const config=analyticsConfig(env);const now=stamp(env);
  const previousPreference=await db(env).prepare("SELECT state FROM launch_analytics_preferences WHERE uid=?").bind(identity.uid).first<{state:string}>();
  const old = await db(env).prepare("SELECT environment,consent_version FROM launch_analytics_subjects WHERE uid=?").bind(identity.uid).first<{environment:string;consent_version:string}>();
  if(old && (old.environment!==config.environment || old.consent_version!==config.policyVersion || !await analyticsSubject(env,identity.uid)))await withdraw(env,identity.uid);
  const created=identity.accountCreatedAt && Number.isFinite(Date.parse(identity.accountCreatedAt)) && Date.parse(identity.accountCreatedAt)<=Date.parse(now)?identity.accountCreatedAt:null;
  const cohort=!created?"unknown":Date.parse(created)>=Date.parse(config.measurementStartAt)?"new":"existing";
  await db(env).batch([
    db(env).prepare("INSERT INTO launch_analytics_subjects(uid,subject_id,consent_version,consent_at,account_created_at,cohort,environment,excluded) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(uid) DO NOTHING")
      .bind(identity.uid,crypto.randomUUID(),config.policyVersion,now,created,cohort,config.environment,config.excludedOwnerIds.includes(identity.uid)?1:0),
    db(env).prepare("INSERT INTO launch_analytics_preferences(uid,state,policy_version,updated_at) VALUES (?,'granted',?,?) ON CONFLICT(uid) DO UPDATE SET state='granted',policy_version=excluded.policy_version,updated_at=excluded.updated_at").bind(identity.uid,config.policyVersion,now),
  ]);
  const subject=await analyticsSubject(env,identity.uid);if(!subject)throw fail(409,"analytics_reconsent_required");
  if(subject.cohort==="new" && subject.account_created_at)await insertEvents(env,subject,[{key:"registration",name:"signup_completed",at:subject.account_created_at,reference:""}],true);
  // Reconsent starts a new measurement epoch, not a second acquisition.
  if(previousPreference)await db(env).prepare("UPDATE launch_analytics_subjects SET acquisition_frozen=1 WHERE uid=?").bind(identity.uid).run();
  if(typeof input.acquisitionToken==="string")await claimVisit(env,subject,input.acquisitionToken);
  await db(env).prepare("UPDATE launch_analytics_subjects SET acquisition_frozen=1 WHERE uid=?").bind(identity.uid).run();
  return analyticsPreference(env,identity.uid);
}
async function claimVisit(env: WorkerEnv, subject: Subject, token: string) {
  const hash=await analyticsHash(env,`visit:${token}`);const now=stamp(env);const config=analyticsConfig(env);
  const visit=await db(env).prepare("SELECT campaign,created_at FROM launch_analytics_visits WHERE token_hash=? AND environment=? AND consent_version=? AND expires_at>? AND claimed_subject IS NULL").bind(hash,config.environment,config.policyVersion,now).first<{campaign:string;created_at:string}>();
  if(!visit || Date.parse(now)-Date.parse(visit.created_at)>config.attributionDays*86400000)return;
  const changed=await db(env).batch([
    db(env).prepare("UPDATE launch_analytics_visits SET claimed_subject=? WHERE token_hash=? AND claimed_subject IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM launch_analytics_subjects WHERE subject_id=?)").bind(subject.subject_id,hash,now,subject.subject_id),
    db(env).prepare("UPDATE launch_analytics_subjects SET first_campaign=CASE WHEN acquisition_frozen=0 AND cohort='new' AND account_created_at>=? THEN ? ELSE first_campaign END,acquisition_frozen=1,last_campaign=? WHERE subject_id=? AND changes()=1").bind(visit.created_at,visit.campaign,visit.campaign,subject.subject_id),
  ]);
  if(!changed[0]?.meta?.changes)return;
}
async function insertEvents(env: WorkerEnv, subject: Subject, events: AnalyticsEvent[], registration=false) {
  const now=stamp(env);const min=new Date(Date.parse(now)-90*86400000).toISOString();
  const accepted=events.filter(e=>ANALYTICS_EVENTS.includes(e.name) && e.key.length<=160 && (registration || e.at>=subject.consent_at) && e.at>=min && e.at<=now);
  if(!accepted.length)return;
  await db(env).batch(accepted.map(e=>db(env).prepare("INSERT OR IGNORE INTO launch_analytics_events(subject_id,event_key,name,at,reference,agent_reference) SELECT subject_id,?,?,?,?,? FROM launch_analytics_subjects WHERE subject_id=? AND consent_version=?")
    .bind(e.key,e.name,e.at,e.reference,e.agentReference||"",subject.subject_id,ANALYTICS_POLICY_VERSION)));
}
export async function recordAgentConnection(env: WorkerEnv, uid: string, agentId: string) {
  const observedAt=stamp(env);
  const subject=await analyticsSubject(env,uid);if(!subject)return;
  const reference=await analyticsHash(env,`${subject.subject_id}:agent:${agentId}`);
  await insertEvents(env,subject,[{key:`connection:${reference}`,name:"agent_connected",at:observedAt,reference}]);
}
type Outbox={subjectId:string;events:AnalyticsEvent[];overflow:number};
export async function appendAnalyticsOutbox(env: WorkerEnv, uid: string, next: QuestForgeState, result: unknown, actor: AuthIdentity) {
  // Each revision retry checks current consent rather than reusing an earlier subject.
  const subject=await analyticsSubject(env,uid);
  if(!subject)return;
  const current=record(next.launchAnalyticsOutbox);let previous=current.subjectId===subject.subject_id && Array.isArray(current.events)?current.events as AnalyticsEvent[]:[];
  if(previous.length){
    // Remove only events durably acknowledged in D1; retain the saved outbox through outages.
    const published = await db(env).prepare("SELECT event_key FROM launch_analytics_events WHERE subject_id=?").bind(subject.subject_id).all<{event_key:string}>().catch(()=>({results:[]}));
    const keys=new Set(published.results?.map(e=>e.event_key));previous=previous.filter(e=>!keys.has(e.key));
  }
  const source=record(result);const raw=Array.isArray(source.events)?source.events:source.event?[source.event]:[];
  const events:AnalyticsEvent[]=[];
  for(const value of raw){
    const e=record(value);const details=record(e.details);const task=next.tasks.find(q=>q.id===e.taskId);const at=typeof e.at==="string"?e.at:stamp(env);
    if(!task || typeof e.id!=="string" || at<subject.consent_at)continue;
    const sourceId=task.humanRequest?.sourceQuestId || task.id;
    const work=next.tasks.find(q=>q.id===sourceId);
    const reference=await analyticsHash(env,`${subject.subject_id}:quest:${sourceId}`);
    const agentReference=work?.assignee?.type==="agent"?await analyticsHash(env,`${subject.subject_id}:agent:${work.assignee.id}`):"";
    const emit=(name:AnalyticsEvent["name"])=>events.push({key:`${e.id}:${name}`,name,at,reference,agentReference});
    const assignment=Array.isArray(details.fields) && details.fields.includes("assignee");
    if((e.type==="quest.created" || e.type==="quest.updated" && assignment) && task.assignee.type==="agent" && !task.humanRequest)emit("quest_requested");
    if(e.type==="quest.human_request.answered" && actor.authType!=="oauth" && task.humanRequest?.status==="answered")emit("human_feedback_saved");
    if(e.type==="quest.handoff.transitioned" && details.to==="working" && actor.authType==="oauth")emit("agent_resumed");
    if(["quest.created","quest.updated","quest.scored","quest.handoff.transitioned","quest.human_request.answered"].includes(String(e.type)))emit("meaningful_activity");
  }
  const combined=[...previous,...events];
  next.launchAnalyticsOutbox={subjectId:subject.subject_id,events:combined.slice(0,512),overflow:Number(current.overflow||0)+Math.max(0,combined.length-512)} satisfies Outbox;
}
async function cleanupInvalidOutbox(env: WorkerEnv, uid: string, subjectId: string) {
  const now=stamp(env);const cutoff=new Date(Date.parse(now)-90*86400000).toISOString();
  const queued=await db(env).prepare(`INSERT INTO launch_analytics_cleanup(uid,subject_id,requested_at,next_attempt_at)
    SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM launch_analytics_subjects WHERE uid=? AND subject_id=? AND consent_at>?)
    ON CONFLICT(uid,subject_id) DO UPDATE SET next_attempt_at=excluded.next_attempt_at,
    requested_at=CASE WHEN requested_at>=excluded.requested_at THEN strftime('%Y-%m-%dT%H:%M:%fZ',requested_at,'+0.001 seconds') ELSE excluded.requested_at END`)
    .bind(uid,subjectId,now,now,uid,subjectId,cutoff).run();
  // A changed request timestamp prevents a concurrent older scrub from removing this retry.
  if(queued.meta?.changes)await cleanupAnalyticsOutboxes(env);
}
export async function flushAnalyticsOutbox(env: WorkerEnv, uid: string, state: QuestForgeState) {
  const outbox=record(state.launchAnalyticsOutbox);if(typeof outbox.subjectId!=="string" || !Array.isArray(outbox.events))return;
  const subject=await analyticsSubject(env,uid);
  if(!subject || outbox.subjectId!==subject.subject_id){await cleanupInvalidOutbox(env,uid,outbox.subjectId);return;}
  try {
  await insertEvents(env,subject,outbox.events as AnalyticsEvent[]);
  // All four facts refer to the same saved work and the actual connected Agent.
  await db(env).prepare(`INSERT OR IGNORE INTO launch_analytics_events(subject_id,event_key,name,at,reference)
    SELECT ?, 'activation', 'activation_completed', MIN(r.at), '' FROM launch_analytics_events r
    JOIN launch_analytics_events f ON f.subject_id=r.subject_id AND f.reference=r.reference AND f.name='human_feedback_saved' AND f.at<=r.at
    JOIN launch_analytics_events q ON q.subject_id=r.subject_id AND q.reference=r.reference AND q.agent_reference=r.agent_reference AND q.name='quest_requested' AND q.at<=f.at
    JOIN launch_analytics_events c ON c.subject_id=r.subject_id AND c.reference=q.agent_reference AND c.name='agent_connected' AND c.at<=q.at
    WHERE r.subject_id=? AND r.name='agent_resumed' AND EXISTS(SELECT 1 FROM launch_analytics_subjects WHERE subject_id=?) HAVING COUNT(*)>0`).bind(subject.subject_id,subject.subject_id,subject.subject_id).run();
  await db(env).prepare("UPDATE launch_analytics_health SET last_success_at=?,outbox_overflow=MAX(outbox_overflow,?) WHERE id='collector'").bind(stamp(env),Number(outbox.overflow||0)).run();
  } finally {
    // Withdrawal can complete between consent lookup and the originating Quest save.
    await cleanupInvalidOutbox(env,uid,outbox.subjectId);
  }
}
export function analyticsBackground(env: WorkerEnv, work: Promise<unknown>): Promise<void> {
  return work.then(()=>undefined,async()=>{
    console.warn("launch_analytics_unavailable");
    // An unavailable D1 cannot acknowledge its own failure; never claim full coverage.
    await env.QUESTFORGE_DB?.prepare("UPDATE launch_analytics_health SET failures=MIN(failures+1,2147483647) WHERE id='collector'").run().catch(()=>undefined);
  });
}
export async function recordAnalyticsPayment(env: WorkerEnv, uid: string, payment: {invoiceId:string;paidAt:string;currency:string;paidMinor:number;refundedMinor:number;refundExact?:boolean;disputed:boolean;interval:"monthly"|"annual";initial:boolean}) {
  const subject=await analyticsSubject(env,uid);if(!subject || subject.environment!==billingMode(env) || payment.paidAt<subject.consent_at || payment.paidMinor<=0)return;
  const key=await analyticsHash(env,`${subject.subject_id}:invoice:${payment.invoiceId}`);
  await db(env).prepare(`INSERT INTO launch_analytics_payments(subject_id,invoice_key,paid_at,currency,paid_minor,refunded_minor,refund_exact,disputed,interval,reconciled_at,is_initial)
    SELECT subject_id,?,?,?,?,?,?,?,?,?,? FROM launch_analytics_subjects WHERE subject_id=?
    ON CONFLICT(subject_id,invoice_key) DO UPDATE SET refunded_minor=MAX(refunded_minor,excluded.refunded_minor),refund_exact=MIN(refund_exact,excluded.refund_exact),disputed=MAX(disputed,excluded.disputed),reconciled_at=excluded.reconciled_at,is_initial=excluded.is_initial`)
    .bind(key,payment.paidAt,payment.currency,payment.paidMinor,payment.refundedMinor,payment.refundExact===false?0:1,payment.disputed?1:0,payment.interval,stamp(env),payment.initial?1:0,subject.subject_id).run();
}
export async function handleAnalyticsPublic(request: Request, env: WorkerEnv): Promise<Response> {
  const config=analyticsConfig(env);trustedOrigin(request,env,"lp");if(request.method!=="POST")throw fail(405,"method_not_allowed");await rateLimit(env,request,"visit");
  const input=await boundedAnalyticsBody(request);fields(input,["consent","policyVersion","campaign","token","action"]);
  if(input.consent!=="granted" || input.policyVersion!==config.policyVersion)throw fail(400,"analytics_consent_required");
  if(input.action==="click" || input.action==="withdraw"){
    if(typeof input.token!=="string" || !/^[a-f0-9]{64}$/.test(input.token))throw fail(400,"analytics_invalid_token");
    const hash=await analyticsHash(env,`visit:${input.token}`);
    if(input.action==="withdraw")await db(env).prepare("DELETE FROM launch_analytics_visits WHERE token_hash=? AND claimed_subject IS NULL").bind(hash).run();
    else await db(env).prepare("UPDATE launch_analytics_visits SET clicked_at=COALESCE(clicked_at,?) WHERE token_hash=? AND expires_at>?").bind(stamp(env),hash,stamp(env)).run();
    return Response.json({accepted:true},{headers:{"cache-control":"no-store"}});
  }
  if(input.action!==undefined && input.action!=="visit")throw fail(400,"analytics_invalid_body");
  const bytes=crypto.getRandomValues(new Uint8Array(32));const token=[...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");const now=stamp(env);const expires=new Date(Date.parse(now)+15*60000).toISOString();
  await db(env).prepare("INSERT INTO launch_analytics_visits(token_hash,visit_id,campaign,created_at,expires_at,environment,consent_version) VALUES (?,?,?,?,?,?,?)").bind(await analyticsHash(env,`visit:${token}`),crypto.randomUUID(),campaignFor(config,input.campaign),now,expires,config.environment,config.policyVersion).run();
  return Response.json({token,expiresAt:expires},{status:201,headers:{"cache-control":"no-store"}});
}
export async function handleAnalyticsOwner(request: Request, env: WorkerEnv, identity: AuthIdentity): Promise<Response> {
  if(!["appwrite","dev"].includes(identity.authType))throw fail(403,"analytics_owner_required");trustedOrigin(request,env,"app");
  if(request.method==="GET")return Response.json(await analyticsPreference(env,identity.uid),{headers:{"cache-control":"no-store"}});
  if(request.method!=="PUT")throw fail(405,"method_not_allowed");
  const input=await boundedAnalyticsBody(request);
  if(input.consent==="granted"){analyticsConfig(env);await rateLimit(env,request,"consent");}
  return Response.json(await setAnalyticsConsent(env,identity,input),{headers:{"cache-control":"no-store"}});
}
export function requireAnalyticsAdmin(env: WorkerEnv, token: string) {
  if(!env.ANALYTICS_ADMIN_TOKEN || env.ANALYTICS_ADMIN_TOKEN.length<32 || token!==env.ANALYTICS_ADMIN_TOKEN || token===env.BILLING_ADMIN_TOKEN)throw fail(403,"analytics_admin_required");
}
export async function analyticsAdminReport(env: WorkerEnv, token: string) {
  requireAnalyticsAdmin(env,token);
  const config=analyticsConfig(env);const database=db(env);
  const cutoff=new Date(Date.parse(stamp(env))-90*86400000).toISOString();
  const subjects=(await database.prepare("SELECT * FROM launch_analytics_subjects WHERE environment=? AND excluded=0 AND consent_at>? LIMIT 10001").bind(config.environment,cutoff).all<Subject>()).results||[];
  // Bounded reports fail explicitly instead of silently truncating a denominator.
  if(subjects.length>10000)throw fail(503,"analytics_report_capacity");
  const events=(await database.prepare("SELECT e.* FROM launch_analytics_events e JOIN launch_analytics_subjects s ON s.subject_id=e.subject_id WHERE s.environment=? AND s.excluded=0 LIMIT 100001").bind(config.environment).all<ReportEvent&{event_key:string}>()).results||[];
  const payments=(await database.prepare("SELECT p.* FROM launch_analytics_payments p JOIN launch_analytics_subjects s ON s.subject_id=p.subject_id WHERE s.environment=? AND s.excluded=0 LIMIT 100001").bind(config.environment).all<ReportPayment>()).results||[];
  if(events.length>100000 || payments.length>100000)throw fail(503,"analytics_report_capacity");
  const maturity=new Date(Date.parse(stamp(env))-config.attributionDays*86400000).toISOString();
  const visits=(await database.prepare(`SELECT v.campaign,COUNT(*) AS visits,SUM(v.clicked_at IS NOT NULL) AS clicks,
    SUM(v.claimed_subject IS NOT NULL) AS linked,SUM(v.created_at<=?) AS matureN,
    SUM(v.created_at<=? AND s.cohort='new' AND v.created_at<=s.account_created_at AND julianday(s.account_created_at)<=julianday(v.created_at)+?) AS newSignups
    FROM launch_analytics_visits v LEFT JOIN launch_analytics_subjects s ON s.subject_id=v.claimed_subject AND s.consent_at>?
    WHERE v.environment=? AND v.created_at>? AND COALESCE(s.excluded,0)=0 GROUP BY v.campaign`)
    .bind(maturity,maturity,config.attributionDays,cutoff,config.environment,cutoff).all<{campaign:string;visits:number;clicks:number;linked:number;matureN:number;newSignups:number}>()).results||[];
  const ids=new Set(subjects.map(s=>s.subject_id));
  const reportEvents=events.filter(e=>ids.has(e.subject_id)).map(e=>({...e,key:e.event_key}));const now=Date.parse(stamp(env));
  const activePayments=payments.filter(p=>ids.has(p.subject_id));
  const byCampaign=Object.fromEntries([...new Set(subjects.map(s=>s.first_campaign))].map(campaign=>{
    const group=subjects.filter(s=>s.first_campaign===campaign);const ids=new Set(group.map(s=>s.subject_id));
    const report=analyticsReport(group,reportEvents.filter(e=>ids.has(e.subject_id)),activePayments.filter(p=>ids.has(p.subject_id)),config,now);
    return [campaign,{coverage:report.coverage,activation:report.activation,retention:report.retention,paidConversion:report.paidConversion,netPaidConversion:report.netPaidConversion,ttv:report.ttv}];
  }));
  return {...analyticsReport(subjects,reportEvents,activePayments,config,now),byCampaign,
    cleanup:await database.prepare("SELECT COUNT(*) AS pending,MIN(requested_at) AS oldestRequestedAt,SUM(attempts>0) AS retrying FROM launch_analytics_cleanup").first(),
    collectionCoverage:"partial-consent-only; failures during D1 outage cannot be counted reliably",
    campaigns:visits.map(v=>({...v,pendingN:v.visits-v.matureN,signupRate:v.matureN?v.newSignups/v.matureN:null})),lpUnit:"consenting-visit-sessions-not-unique-people",collector:await database.prepare("SELECT last_success_at,failures,outbox_overflow FROM launch_analytics_health WHERE id='collector'").first(),
    attribution:{firstTouch:subjects.reduce<Record<string,number>>((out,s)=>(out[s.first_campaign]=(out[s.first_campaign]||0)+1,out),{}),lastTouch:subjects.reduce<Record<string,number>>((out,s)=>(out[s.last_campaign]=(out[s.last_campaign]||0)+1,out),{})}};
}
export async function purgeLaunchAnalytics(env: WorkerEnv) {
  if(!env.QUESTFORGE_DB)return;
  const now=stamp(env);const cutoff=new Date(Date.parse(now)-90*86400000).toISOString();
  await db(env).batch([
    db(env).prepare("INSERT INTO launch_analytics_cleanup(uid,subject_id,requested_at,next_attempt_at) SELECT uid,subject_id,?,? FROM launch_analytics_subjects WHERE consent_at<=? ON CONFLICT(uid,subject_id) DO NOTHING").bind(now,now,cutoff),
    db(env).prepare("DELETE FROM launch_analytics_visits WHERE created_at<?").bind(cutoff),
    db(env).prepare("DELETE FROM launch_analytics_subjects WHERE consent_at<=?").bind(cutoff),
    db(env).prepare("DELETE FROM launch_analytics_events WHERE at<?").bind(cutoff),
    db(env).prepare("DELETE FROM launch_analytics_payments WHERE reconciled_at<?").bind(cutoff),
    db(env).prepare("DELETE FROM launch_analytics_rate WHERE expires_at<?").bind(now),
  ]);
  await cleanupAnalyticsOutboxes(env);
}

/** Bounded, persistent retries; revision-aware mutation cannot overwrite a Quest save. */
export async function cleanupAnalyticsOutboxes(env: WorkerEnv, scrub: (uid:string,expiredSubjectId:string)=>Promise<void> = async (uid,expired) => {
  const snapshot=await readState(env,uid);
  if(snapshot.etag===null && !snapshot.payload.state)return;
  await mutateState(env,uid,state=>{
    if(record(state.launchAnalyticsOutbox).subjectId===expired)delete state.launchAnalyticsOutbox;
    return null;
  });
}) {
  const now=stamp(env);
  const pending=(await db(env).prepare("SELECT uid,subject_id,requested_at FROM launch_analytics_cleanup WHERE next_attempt_at<=? ORDER BY next_attempt_at LIMIT 25").bind(now).all<{uid:string;subject_id:string;requested_at:string}>()).results||[];
  for(const entry of pending){
    try {
      await scrub(entry.uid,entry.subject_id);
      await db(env).prepare("DELETE FROM launch_analytics_cleanup WHERE uid=? AND subject_id=? AND requested_at=?").bind(entry.uid,entry.subject_id,entry.requested_at).run();
    } catch {
      await db(env).prepare("UPDATE launch_analytics_cleanup SET attempts=MIN(attempts+1,2147483647),next_attempt_at=? WHERE uid=? AND subject_id=? AND requested_at=?").bind(new Date(Date.parse(now)+3600000).toISOString(),entry.uid,entry.subject_id,entry.requested_at).run();
      await analyticsBackground(env,Promise.reject(Error("cleanup")));
    }
  }
}

/** Operator account-deletion step; the statutory billing ledger is deliberately separate. */
export async function deleteAnalyticsAccount(env: WorkerEnv,uid:string){
  await withdraw(env,uid);
  await db(env).prepare("DELETE FROM launch_analytics_preferences WHERE uid=?").bind(uid).run();
  await cleanupAnalyticsOutboxes(env);
  const pending=await db(env).prepare("SELECT COUNT(*) AS n FROM launch_analytics_cleanup WHERE uid=?").bind(uid).first<{n:number}>();
  return {optionalDataDeleted:true,privateSnapshotCleanupPending:Number(pending?.n||0)>0};
}

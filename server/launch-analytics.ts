/** Measurement windows are explicit configuration, never silently product approval. */
export const ANALYTICS_POLICY_VERSION = "2026-10-04";
export type AnalyticsPort = {
  getAnalyticsConsent(): Promise<{enabled:boolean;consent:string;policyVersion:string}>;
  setAnalyticsConsent(input:{consent:"granted"|"denied";policyVersion:string;acquisitionToken?:string}): Promise<{enabled:boolean;consent:string;policyVersion:string}>;
};
export const ANALYTICS_EVENTS = ["signup_completed", "agent_connected", "quest_requested", "human_feedback_saved", "agent_resumed", "activation_completed", "meaningful_activity"] as const;
export type AnalyticsEventName = typeof ANALYTICS_EVENTS[number];
export type AnalyticsEvent = { key: string; name: AnalyticsEventName; at: string; reference: string; agentReference?: string };
export type AnalyticsSubject = { subject_id: string; consent_at: string; account_created_at: string | null; cohort: string; first_campaign: string; last_campaign: string };
export type AnalyticsConfig = {
  approved: true; policyVersion: typeof ANALYTICS_POLICY_VERSION; environment: "test" | "live";
  measurementStartAt: string; activationDays: number; paidConversionDays: number; attributionDays: number;
  retentionWindows: { label: string; startHours: number; endHours: number }[];
  campaigns: { id: string; source: string; medium: string; campaign: string }[];
  excludedOwnerIds: string[];
};
const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function parseAnalyticsConfig(raw: string): AnalyticsConfig {
  const v = record(JSON.parse(raw));
  const allowed = ["approved", "policyVersion", "environment", "measurementStartAt", "activationDays", "paidConversionDays", "attributionDays", "retentionWindows", "campaigns", "excludedOwnerIds"];
  const days = (n: unknown) => Number.isSafeInteger(n) && Number(n) > 0 && Number(n) <= 90;
  if (Object.keys(v).some(k => !allowed.includes(k)) || v.approved !== true || v.policyVersion !== ANALYTICS_POLICY_VERSION || !["test", "live"].includes(String(v.environment))
    || typeof v.measurementStartAt !== "string" || !Number.isFinite(Date.parse(v.measurementStartAt)) || !days(v.activationDays) || !days(v.paidConversionDays) || !days(v.attributionDays)
    || !Array.isArray(v.retentionWindows) || !v.retentionWindows.length || v.retentionWindows.length > 5
    || !Array.isArray(v.campaigns) || v.campaigns.length > 100 || !Array.isArray(v.excludedOwnerIds) || v.excludedOwnerIds.length > 100) throw new Error("Invalid approved measurement contract");
  const tokens = /^[a-z0-9][a-z0-9_-]{0,47}$/;
  for (const item of v.campaigns) {
    const c = record(item);
    if (Object.keys(c).length !== 4 || !["id", "source", "medium", "campaign"].every(k => typeof c[k] === "string" && tokens.test(c[k] as string)) || ["direct", "unknown"].includes(String(c.id))) throw new Error("Invalid finite campaign registry");
  }
  if (new Set(v.campaigns.map(c => record(c).id)).size !== v.campaigns.length || new Set(v.campaigns.map(c => JSON.stringify([record(c).source, record(c).medium, record(c).campaign]))).size !== v.campaigns.length) throw new Error("Duplicate campaign registry");
  for (const item of v.retentionWindows) {
    const w = record(item);
    if (Object.keys(w).length !== 3 || typeof w.label !== "string" || !tokens.test(w.label) || !Number.isSafeInteger(w.startHours) || !Number.isSafeInteger(w.endHours)
      || Number(w.startHours) < 0 || Number(w.endHours) <= Number(w.startHours) || Number(w.endHours) > 2160) throw new Error("Invalid retention window");
  }
  if (new Set(v.retentionWindows.map(w => record(w).label)).size !== v.retentionWindows.length || v.excludedOwnerIds.some(id => typeof id !== "string" || !id || id.length > 240)) throw new Error("Invalid report exclusions");
  return v as unknown as AnalyticsConfig;
}
export function campaignFor(config: AnalyticsConfig, input: unknown): string {
  const v = record(input);
  if (!Object.keys(v).length) return "direct";
  if (Object.keys(v).some(k => !["source", "medium", "campaign"].includes(k))) return "unknown";
  return config.campaigns.find(c => c.source === v.source && c.medium === v.medium && c.campaign === v.campaign)?.id ?? "unknown";
}
export type ReportEvent = AnalyticsEvent & { subject_id: string };
export type ReportPayment = { subject_id: string; paid_at: string; paid_minor: number; refunded_minor: number; refund_exact?:number; disputed: number; currency: string; interval: string; is_initial: number };
export function analyticsReport(subjects: AnalyticsSubject[], events: ReportEvent[], payments: ReportPayment[], config: AnalyticsConfig, now: number) {
  const day = 86400000;
  const bySubject=new Map<string,ReportEvent[]>();
  for(const event of events){const rows=bySubject.get(event.subject_id)||[];rows.push(event);bySubject.set(event.subject_id,rows);}
  const paymentsBySubject=new Map<string,ReportPayment[]>();
  for(const payment of payments){const rows=paymentsBySubject.get(payment.subject_id)||[];rows.push(payment);paymentsBySubject.set(payment.subject_id,rows);}
  const eligible = subjects.filter(s => s.cohort === "new" && s.account_created_at !== null && Date.parse(s.account_created_at) <= now);
  const metric = (endMs: number, predicate: (s: AnalyticsSubject, start: number) => boolean) => {
    const mature = eligible.filter(s => now >= Date.parse(s.account_created_at!) + endMs);
    const reached = mature.filter(s => predicate(s, Date.parse(s.account_created_at!))).length;
    return { matureN: mature.length, reached, pendingN: eligible.length - mature.length, rate: mature.length ? reached / mature.length : null };
  };
  const has = (s: AnalyticsSubject, name: string, start: number, end: number) => (bySubject.get(s.subject_id)||[]).some(e => e.name === name && Date.parse(e.at) >= start && Date.parse(e.at) < end);
  const pays = (s: AnalyticsSubject) => (paymentsBySubject.get(s.subject_id)||[]).filter(p => p.is_initial===1 && p.paid_minor > 0 && Date.parse(p.paid_at) <= now).sort((a,b) => a.paid_at.localeCompare(b.paid_at));
  const activationWindow = config.activationDays * day;
  const paidWindow = config.paidConversionDays * day;
  const timings = eligible.flatMap(s => {
    const start = Date.parse(s.account_created_at!);
    const first = (bySubject.get(s.subject_id)||[]).filter(e => e.name === "activation_completed" && Date.parse(e.at) >= start && Date.parse(e.at) < start + activationWindow && Date.parse(e.at) <= now).sort((a,b) => a.at.localeCompare(b.at))[0];
    return first ? [Date.parse(first.at) - start] : [];
  }).sort((a,b) => a-b);
  const finances = Object.fromEntries([...new Set(payments.map(p => p.currency))].map(currency => {
    const rows = payments.filter(p => p.currency === currency && Date.parse(p.paid_at) <= now);
    return [currency, { paidMinor: rows.reduce((n,p) => n + p.paid_minor, 0), refundedMinor: rows.some(p=>p.refund_exact===0)?null:rows.reduce((n,p) => n + p.refunded_minor, 0),
      refundUpperBoundMinor:rows.reduce((n,p)=>n+p.refunded_minor,0),refundAllocationUnknownN:rows.filter(p=>p.refund_exact===0).length,
      taxMinor: null, paymentFeesMinor: null, infrastructureCostMinor: null, providerCostMinor: null, supportCostMinor: null, contributionMinor: null, cacMinor: null,
      note: "Cash for consenting accounts only; taxes, fees, MRR, costs and CAC require reconciled source records." }];
  }));
  return {
    schemaVersion: 1, policyVersion: config.policyVersion, environment: config.environment, asOf: new Date(now).toISOString(),
    windows: { activationDays: config.activationDays, paidConversionDays: config.paidConversionDays, retention: config.retentionWindows, boundaries: "inclusive-start-exclusive-end" },
    coverage: { consentingAccounts: subjects.length, newAccounts: eligible.length, existingAccounts: subjects.filter(s => s.cohort === "existing").length, unknownRegistration: subjects.filter(s => s.cohort === "unknown").length, consentRate: null, totalRegistrations: null },
    activation: metric(activationWindow, (s,start) => has(s,"activation_completed",start,start+activationWindow)),
    ttv: { successfulN: timings.length, medianMs: timings.length ? (timings[Math.floor((timings.length-1)/2)]! + timings[Math.floor(timings.length/2)]!) / 2 : null, minMs: timings[0] ?? null, maxMs: timings.at(-1) ?? null },
    retention: Object.fromEntries(config.retentionWindows.map(w => [w.label, metric(w.endHours * 3600000, (s,start) => has(s,"meaningful_activity",start+w.startHours*3600000,start+w.endHours*3600000))])),
    paidConversion: metric(paidWindow, (s,start) => { const p=pays(s)[0]; return !!p && Date.parse(p.paid_at)>=start && Date.parse(p.paid_at)<start+paidWindow; }),
    netPaidConversion: metric(paidWindow, (s,start) => { const p=pays(s)[0]; return !!p && Date.parse(p.paid_at)>=start && Date.parse(p.paid_at)<start+paidWindow && p.refunded_minor===0 && p.refund_exact!==0 && !p.disputed; }),
    stages: Object.fromEntries(ANALYTICS_EVENTS.map(name => [name,new Set(events.filter(e=>e.name===name && Date.parse(e.at)<=now).map(e=>e.subject_id)).size])),
    finances,
    limitations: ["Consent coverage and unmatched visits must accompany CVR.", "No inferred identity across devices or consent refusal.", "Small cohorts do not establish demand or advertising profitability."],
  };
}

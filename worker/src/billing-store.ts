import type { D1DatabaseLike, WorkerEnv, WorkerError } from "./worker-types.ts";
import { listAgents } from "./agent-store.ts";

export type BillingMode = "test" | "live";
export interface BillingEnv extends WorkerEnv {
  BILLING_ENABLED?: string; BILLING_MODE?: string; BILLING_CONFIG?: string;
  STRIPE_SECRET_KEY?: string; STRIPE_WEBHOOK_SECRET?: string; BILLING_ADMIN_TOKEN?: string; BILLING_NOW?: string;
}
export interface BillingConfig {
  approved: boolean; currency: string; monthlyPriceId: string; annualPriceId: string;
  monthlyCredits: number; annualMonthlyCredits: number; creditLifetimeDays: number;
  decisionCredits: number; referralCredits: number; launchCouponId?: string; referralCouponId?: string;
  refundPolicy?: "revoke_invoice_benefits"; taxBehavior?: "inclusive" | "exclusive"; automaticTax?: boolean;
  portalConfigurationId?: string;
}
export interface Entitlement {
  plan: "free" | "pro"; periodEnd: string | null; selectedAgentIds: string[];
  enabled: boolean; agentLimit: number | null; selectionRequired: boolean;
}
export interface CreditSummary { balance: number; available: number; debt: number; reserved: number }
export interface CreditReservation { requestId: string; amount: number; status: "reserved" | "commit" | "return"; createdAt: string }
export interface CreditLedgerEntry {
  id: string; kind: "grant" | "reserve" | "commit" | "return" | "expire" | "reverse";
  source: string; requestId: string | null; amount: number; balance: number; createdAt: string;
}
export interface CreditLedgerPage { entries: CreditLedgerEntry[]; nextCursor: string | null }
export interface PublishedBillingPrice { priceId: string; amount: number; interval: "month" | "year"; intervalCount: number; taxBehavior: string; creditsPerMonth: number }
export interface PublishedBillingDiscount { couponId: string; percentOff: number | null; amountOff: number | null; currency: string | null; duration: string; durationMonths: number | null; redeemBy: string | null }
export interface BillingPricing {
  approved: true; month: PublishedBillingPrice & { currency: string }; year: PublishedBillingPrice & { currency: string }; terms: string[];
  currency: string; monthly: PublishedBillingPrice; annual: PublishedBillingPrice;
  launchDiscount: PublishedBillingDiscount | null; referralDiscount: PublishedBillingDiscount | null;
  creditLifetimeDays: number; decisionCredits: number; referralCredits: number; refundPolicy: string | null; taxBehavior: string | null; automaticTax: boolean; autoTopUp: false;
}
export interface BillingStatus {
  enabled: boolean; configured: boolean; salesReady: boolean; mode: BillingMode; entitlement: Entitlement;
  plan: "free" | "pro"; periodEnd: string | null; selectedAgentIds: string[]; registeredAgentCount: number; agentLimit: number | null;
  pricing: BillingPricing | null; nextRenewal: string | null; creditLifetimeDays: number | null;
  prices: { currency: string; monthlyPriceId: string; annualPriceId: string } | null;
  credits: CreditSummary; decisionCredits: number | null;
  referral: { code: string; attributed: boolean; rewarded: boolean };
  subscriptionStatus: string | null; cancelAtPeriodEnd: boolean;
}
export interface BillingAdminReport { mode: BillingMode; accounts: Array<{ uid: string; plan: "free" | "pro"; balance: number; debt: number; syncPending: boolean }> }
export interface SubscriptionSnapshot {
  id: string; status: string; periodStart: string; periodEnd: string; interval: "monthly" | "annual";
  invoiceId: string; invoicePaid: boolean; cancelAtPeriodEnd: boolean;
  monthlyCredits: number; lifetimeDays: number;
}
export interface BillingAccountState {
  selectedAgentIds: string[]; subscription: SubscriptionSnapshot | null;
  blockedInvoices: string[]; blockedSubscriptions: string[];
  syncToken: string | null; syncUntil: string | null;
  customerCreationStartedAt?: string;
  firstPaidInvoice?: { id: string; paidAt: string };
  checkoutAttempt?: { requestId: string; interval: "monthly" | "annual"; startedAt: string; url: string | null; sessionId?: string; integrationIdentifier?: string };
}
interface Lot { source: string; amount: number; remaining: number; expired: number; reversed: boolean; expiresAt: string; createdAt: string }
interface Reservation extends CreditReservation { allocations: Array<{ source: string; amount: number }> }
interface Account {
  revision: number; maintenanceOrder: number; customerId: string | null; referralCode: string; balance: number; state: BillingAccountState;
  lots: Map<string, Lot>; reservations: Map<string, Reservation>; ledger: CreditLedgerEntry[];
}
interface AccountRow { revision: number; maintenance_order: number; customer_id: string | null; referral_code: string; balance: number; state_json: string }
interface Referral { referred_uid: string; referrer_uid: string; invoice_id: string | null; reversed: number; reward_amount: number | null; reward_expires_at: string | null }
interface DevStore { accounts: Map<string, Account>; referrals: Map<string, Referral>; events: Set<string> }
let memory = new WeakMap<object, DevStore>();

export function billingError(status: number, code: string, message: string): WorkerError { return Object.assign(new Error(message), { status, code }); }
export function billingNow(env: BillingEnv): Date {
  const date = new Date(env.BILLING_NOW || Date.now());
  if (!Number.isFinite(date.getTime())) throw billingError(500, "billing_clock_invalid", "Invalid billing clock.");
  return date;
}
export function billingMode(env: BillingEnv): BillingMode {
  if (env.BILLING_MODE && env.BILLING_MODE !== "test" && env.BILLING_MODE !== "live") throw billingError(503, "billing_mode_invalid", "Billing mode must be test or live.");
  if (!env.BILLING_MODE && env.APPWRITE_PROJECT_ID && env.BILLING_ENABLED === "true") throw billingError(503, "billing_mode_required", "Production billing requires an explicit mode.");
  return env.BILLING_MODE === "live" ? "live" : "test";
}
export function getBillingConfig(env: BillingEnv, required = false): BillingConfig | null {
  let config: BillingConfig | null = null;
  try {
    const value = JSON.parse(env.BILLING_CONFIG || "null") as BillingConfig | null;
    if (value && typeof value === "object" && value.approved === true && /^[a-z]{3}$/.test(value.currency)
      && /^price_[A-Za-z0-9]+$/.test(value.monthlyPriceId) && /^price_[A-Za-z0-9]+$/.test(value.annualPriceId)
      && value.monthlyPriceId !== value.annualPriceId
      && [value.monthlyCredits, value.annualMonthlyCredits, value.decisionCredits, value.referralCredits].every(n => Number.isSafeInteger(n) && n >= 0)
      && Number.isSafeInteger(value.creditLifetimeDays) && value.creditLifetimeDays >= 1 && value.creditLifetimeDays <= 366
      && [value.launchCouponId, value.referralCouponId].every(id => id === undefined || (typeof id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(id)))
      && (value.refundPolicy === undefined || value.refundPolicy === "revoke_invoice_benefits")
      && (value.taxBehavior === undefined || ["inclusive", "exclusive"].includes(value.taxBehavior))
      && (value.automaticTax === undefined || typeof value.automaticTax === "boolean")
      && (value.portalConfigurationId === undefined || (typeof value.portalConfigurationId === "string" && /^bpc_[A-Za-z0-9]{1,200}$/.test(value.portalConfigurationId)))) config = value;
  } catch { /* An absent or unapproved product never enables sales. */ }
  if (required && (!config || env.BILLING_ENABLED !== "true")) throw billingError(503, "billing_not_configured", "Billing requires approved product configuration and rollout.");
  return config;
}
function dev(env: BillingEnv): DevStore {
  if (env.APPWRITE_PROJECT_ID) throw billingError(503, "billing_d1_required", "Production billing requires D1.");
  let value = memory.get(env);
  if (!value) { value = { accounts: new Map(), referrals: new Map(), events: new Set() }; memory.set(env, value); }
  return value;
}
function key(env: BillingEnv, uid: string): string { return JSON.stringify([billingMode(env), uid]); }
function validId(value: string): void {
  if (typeof value !== "string" || !value.trim() || value.length > 240 || /[\u0000-\u001f]/.test(value)) throw billingError(400, "billing_id_invalid", "Invalid billing identifier.");
}
function amountValid(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw billingError(400, "credit_amount_invalid", "Credits must be a positive safe integer.");
}
function initial(): Account {
  return { revision: 0, maintenanceOrder: 0, customerId: null, referralCode: crypto.randomUUID().replaceAll("-", ""), balance: 0,
    state: { selectedAgentIds: [], subscription: null, blockedInvoices: [], blockedSubscriptions: [], syncToken: null, syncUntil: null }, lots: new Map(), reservations: new Map(), ledger: [] };
}
export function requireBillingDb(env: BillingEnv): D1DatabaseLike | undefined {
  billingMode(env);
  if (!env.QUESTFORGE_DB) dev(env);
  return env.QUESTFORGE_DB;
}
async function read(env: BillingEnv, uid: string): Promise<Account> {
  validId(uid);
  const db = requireBillingDb(env);
  if (!db) {
    const store = dev(env); const id = key(env, uid);
    if (!store.accounts.has(id)) store.accounts.set(id, initial());
    return structuredClone(store.accounts.get(id)!);
  }
  const mode = billingMode(env); const seed = initial();
  await db.prepare("INSERT INTO billing_accounts(mode,uid,referral_code,state_json) VALUES (?,?,?,?) ON CONFLICT(mode,uid) DO NOTHING")
    .bind(mode, uid, seed.referralCode, JSON.stringify(seed.state)).run();
  // A stable version around the reads prevents combining different committed snapshots.
  for (let attempt = 0; attempt < 12; attempt++) {
    const row = (await db.prepare("SELECT * FROM billing_accounts WHERE mode=? AND uid=?").bind(mode, uid).first<AccountRow>())!;
    const lots = await db.prepare("SELECT payload FROM billing_credit_lots WHERE mode=? AND uid=?").bind(mode, uid).all<{ payload: string }>();
    const reservations = await db.prepare("SELECT payload FROM billing_credit_reservations WHERE mode=? AND uid=?").bind(mode, uid).all<{ payload: string }>();
    const version = (await db.prepare("SELECT revision FROM billing_accounts WHERE mode=? AND uid=?").bind(mode, uid).first<{ revision: number }>())!;
    if (version.revision !== row.revision) continue;
    return { revision: row.revision, maintenanceOrder: row.maintenance_order, customerId: row.customer_id, referralCode: row.referral_code, balance: row.balance,
      state: JSON.parse(row.state_json) as BillingAccountState,
      lots: new Map((lots.results || []).map(row => { const lot = JSON.parse(row.payload) as Lot; return [lot.source, lot]; })),
      reservations: new Map((reservations.results || []).map(row => { const item = JSON.parse(row.payload) as Reservation; return [item.requestId, item]; })), ledger: [] };
  }
  throw billingError(409, "billing_busy", "Billing changed concurrently; retry the same request ID.");
}
function journal(account: Account, env: BillingEnv, kind: CreditLedgerEntry["kind"], source: string, amount: number, requestId: string | null = null): void {
  if (!Number.isSafeInteger(account.balance + amount)) throw billingError(409, "credit_overflow", "Credit balance overflow.");
  account.balance += amount;
  account.ledger.push({ id: crypto.randomUUID(), kind, source, requestId, amount, balance: account.balance, createdAt: billingNow(env).toISOString() });
}
function expire(account: Account, env: BillingEnv): void {
  const now = billingNow(env).toISOString();
  for (const lot of account.lots.values()) {
    if (!lot.reversed && lot.expiresAt <= now && lot.remaining > 0) {
      const amount = lot.remaining; lot.remaining = 0; lot.expired += amount;
      journal(account, env, "expire", lot.source, -amount);
    }
  }
}
// ponytail: reads an owner's lots/reservations for CAS; use indexed active-lot reads and archive terminal reservations if per-owner history becomes large.
async function mutate<T>(env: BillingEnv, uid: string, change: (account: Account) => T): Promise<T> {
  const db = requireBillingDb(env); const mode = billingMode(env);
  for (let attempt = 0; attempt < 24; attempt++) {
    const previous = await read(env, uid); const next = structuredClone(previous); next.ledger = [];
    expire(next, env); const result = change(next);
    if (!db) {
      const store = dev(env); const stored = store.accounts.get(key(env, uid))!;
      if (stored.revision !== previous.revision) continue;
      next.revision++; next.maintenanceOrder = stored.maintenanceOrder; next.ledger = [...stored.ledger, ...next.ledger]; store.accounts.set(key(env, uid), next); return result;
    }
    const token = crypto.randomUUID(); const revision = previous.revision + 1;
    const gate = "EXISTS(SELECT 1 FROM billing_accounts WHERE mode=? AND uid=? AND revision=? AND mutation_token=?)";
    const guard = [mode, uid, revision, token];
    const statements = [db.prepare("UPDATE billing_accounts SET revision=?,mutation_token=?,customer_id=?,balance=?,state_json=?,plan=?,period_end=?,selected_agent_ids=? WHERE mode=? AND uid=? AND revision=?")
      .bind(revision, token, next.customerId, next.balance, JSON.stringify(next.state), subscriptionActive(next, env) ? "pro" : "free", next.state.subscription?.periodEnd || null, JSON.stringify(next.state.selectedAgentIds), mode, uid, previous.revision)];
    for (const [source, lot] of next.lots) if (JSON.stringify(previous.lots.get(source)) !== JSON.stringify(lot)) {
      statements.push(db.prepare(`INSERT INTO billing_credit_lots(mode,uid,source,payload) SELECT ?,?,?,? WHERE ${gate} ON CONFLICT(mode,uid,source) DO UPDATE SET payload=excluded.payload`)
        .bind(mode, uid, source, JSON.stringify(lot), ...guard));
    }
    for (const [id, item] of next.reservations) if (JSON.stringify(previous.reservations.get(id)) !== JSON.stringify(item)) {
      statements.push(db.prepare(`INSERT INTO billing_credit_reservations(mode,uid,request_id,payload) SELECT ?,?,?,? WHERE ${gate} ON CONFLICT(mode,uid,request_id) DO UPDATE SET payload=excluded.payload`)
        .bind(mode, uid, id, JSON.stringify(item), ...guard));
    }
    for (const entry of next.ledger) statements.push(db.prepare(`INSERT INTO billing_credit_ledger(id,mode,uid,kind,source,request_id,amount,balance,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${gate}`)
      .bind(entry.id, mode, uid, entry.kind, entry.source, entry.requestId, entry.amount, entry.balance, entry.createdAt, ...guard));
    const written = await db.batch(statements);
    if (written[0]?.meta?.changes === 1) return result;
  }
  throw billingError(409, "billing_busy", "Billing changed concurrently; retry the same request ID.");
}
function summary(account: Account): CreditSummary {
  return { balance: account.balance, available: Math.max(0, account.balance), debt: Math.max(0, -account.balance),
    reserved: [...account.reservations.values()].filter(r => r.status === "reserved").reduce((sum, r) => sum + r.amount, 0) };
}
function subscriptionActive(account: Account, env: BillingEnv): boolean {
  const sub = account.state.subscription;
  return Boolean(sub && sub.status === "active" && sub.invoicePaid && sub.periodStart <= billingNow(env).toISOString() && sub.periodEnd > billingNow(env).toISOString()
    && !account.state.blockedSubscriptions.includes(sub.id) && !account.state.blockedInvoices.includes(sub.invoiceId));
}
export async function getEntitlement(env: BillingEnv, uid: string): Promise<Entitlement> {
  const account = await read(env, uid); const enabled = env.BILLING_ENABLED === "true";
  const agents = await listAgents(env, uid); const count = agents.filter(a => a.status !== "archived").length;
  const validSelectedCount = new Set(account.state.selectedAgentIds.filter(id => agents.some(a => a.agentId === id && a.status !== "archived"))).size;
  const pro = subscriptionActive(account, env);
  return { plan: pro ? "pro" : "free", periodEnd: account.state.subscription?.periodEnd || null, selectedAgentIds: [...account.state.selectedAgentIds],
    enabled, agentLimit: enabled && !pro ? 2 : null, selectionRequired: enabled && !pro && count > 2 && validSelectedCount !== 2 };
}
/** Dev-only synchronous accessor for Agent-store's in-memory atomic mutation. */
export function getMemoryEntitlement(env: BillingEnv, uid: string): Pick<Entitlement, "plan" | "periodEnd" | "selectedAgentIds"> {
  const account = dev(env).accounts.get(key(env, uid));
  return { plan: account && subscriptionActive(account, env) ? "pro" : "free", periodEnd: account?.state.subscription?.periodEnd || null, selectedAgentIds: [...(account?.state.selectedAgentIds || [])] };
}
export async function selectFreeAgents(env: BillingEnv, uid: string, agentIds: string[]): Promise<Entitlement> {
  if (!Array.isArray(agentIds) || agentIds.length > 2 || new Set(agentIds).size !== agentIds.length || agentIds.some(id => typeof id !== "string" || !/^[a-z0-9-]{1,80}$/.test(id))) throw billingError(400, "invalid_free_agents", "Select at most two distinct Agent IDs.");
  const db = requireBillingDb(env);
  if (db) {
    await read(env, uid);
    const result = await db.prepare(`UPDATE billing_accounts SET selected_agent_ids=?,state_json=json_set(state_json,'$.selectedAgentIds',json(?)),revision=revision+1
      WHERE mode=? AND uid=? AND (SELECT COUNT(*) FROM agent_registry_agents a WHERE a.uid=? AND a.status<>'archived' AND a.agent_id IN (SELECT value FROM json_each(?)))=?`)
      .bind(JSON.stringify(agentIds), JSON.stringify(agentIds), billingMode(env), uid, uid, JSON.stringify(agentIds), agentIds.length).run();
    if (result.meta?.changes !== 1) throw billingError(404, "agent_not_found", "Select owned, nonarchived Agents.");
  } else {
    const agents = await listAgents(env, uid);
    if (agentIds.some(id => !agents.some(a => a.agentId === id && a.status !== "archived"))) throw billingError(404, "agent_not_found", "Select owned, nonarchived Agents.");
    await mutate(env, uid, account => { account.state.selectedAgentIds = [...agentIds]; });
  }
  return getEntitlement(env, uid);
}
export async function getBillingStatus(env: BillingEnv, uid: string): Promise<BillingStatus> {
  const credits = await mutate(env, uid, summary); const account = await read(env, uid); const config = getBillingConfig(env);
  const referral = await getReferral(env, uid);
  const entitlement = await getEntitlement(env, uid);
  const prices = config ? { currency: config.currency, monthlyPriceId: config.monthlyPriceId, annualPriceId: config.annualPriceId } : null;
  let pricing: BillingPricing | null = null;
  if (config && env.BILLING_ENABLED === "true" && env.STRIPE_SECRET_KEY) {
    // Read-only price verification can fail independently: the UI stays unable to purchase without published prices.
    try { pricing = await (await import("./stripe-billing.ts")).getPublicBillingPrices(env); } catch { /* Keep status available during Stripe outages. */ }
  }
  return { enabled: env.BILLING_ENABLED === "true", configured: Boolean(config && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
    salesReady: Boolean(pricing && config && env.STRIPE_WEBHOOK_SECRET && (billingMode(env) === "test" || (config.refundPolicy && config.taxBehavior && typeof config.automaticTax === "boolean"))), mode: billingMode(env),
    entitlement, plan: entitlement.plan, periodEnd: entitlement.periodEnd, selectedAgentIds: entitlement.selectedAgentIds, agentLimit: entitlement.agentLimit,
    registeredAgentCount: (await listAgents(env, uid)).filter(a => a.status !== "archived").length, pricing, prices,
    nextRenewal: subscriptionActive(account, env) && !account.state.subscription?.cancelAtPeriodEnd ? account.state.subscription!.periodEnd : null, creditLifetimeDays: config?.creditLifetimeDays ?? null,
    credits, decisionCredits: config?.decisionCredits ?? null, referral: { code: account.referralCode, attributed: Boolean(referral), rewarded: Boolean(referral?.invoice_id && !referral.reversed) },
    subscriptionStatus: account.state.subscription?.status ?? null, cancelAtPeriodEnd: account.state.subscription?.cancelAtPeriodEnd ?? false };
}
export async function listCreditLedger(env: BillingEnv, uid: string, options: { limit?: number; cursor?: string; before?: string } = {}): Promise<CreditLedgerPage> {
  const limit = options.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw billingError(400, "invalid_page", "Ledger limit must be 1–100.");
  type Cursor = { at: string; id: string };
  let cursor: Cursor | null = null; const rawCursor = options.cursor ?? options.before;
  if (rawCursor) try {
    if (rawCursor.length > 1024) throw new Error();
    const parsed: unknown = JSON.parse(atob(rawCursor));
    if (!parsed || typeof parsed !== "object" || !("at" in parsed) || !("id" in parsed) || typeof parsed.at !== "string" || typeof parsed.id !== "string") throw new Error();
    cursor = { at: parsed.at, id: parsed.id };
  } catch { throw billingError(400, "invalid_cursor", "Invalid ledger cursor."); }
  await mutate(env, uid, () => {});
  const db = requireBillingDb(env); let entries: CreditLedgerEntry[];
  if (db) {
    const result = await db.prepare(`SELECT id,kind,source,request_id AS requestId,amount,balance,created_at AS createdAt FROM billing_credit_ledger WHERE mode=? AND uid=? ${cursor ? "AND (created_at<? OR (created_at=? AND id<?))" : ""} ORDER BY created_at DESC,id DESC LIMIT ?`)
      .bind(billingMode(env), uid, ...(cursor ? [cursor.at, cursor.at, cursor.id] : []), limit + 1).all<CreditLedgerEntry>(); entries = result.results || [];
  } else entries = (await read(env, uid)).ledger.filter(e => !cursor || e.createdAt < cursor.at || (e.createdAt === cursor.at && e.id < cursor.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, limit + 1);
  const more = entries.length > limit; entries = entries.slice(0, limit); const last = entries.at(-1);
  return { entries, nextCursor: more && last ? btoa(JSON.stringify({ at: last.createdAt, id: last.id })) : null };
}
function grant(account: Account, env: BillingEnv, source: string, amount: number, expiresAt: string): void {
  const existing = account.lots.get(source);
  if (existing) {
    if (existing.amount !== amount || existing.expiresAt !== expiresAt) throw billingError(409, "credit_source_conflict", "Credit source was reused with different terms.");
    return;
  }
  const remaining = Math.max(0, amount + Math.min(0, account.balance));
  account.lots.set(source, { source, amount, remaining, expired: 0, reversed: false, expiresAt, createdAt: billingNow(env).toISOString() });
  journal(account, env, "grant", source, amount);
}
export async function grantCredits(env: BillingEnv, uid: string, source: string, amount: number, expiresAt?: string): Promise<CreditSummary> {
  validId(source); amountValid(amount); const config = getBillingConfig(env, true)!;
  const now = billingNow(env); const bound = now.getTime() + config.creditLifetimeDays * 86400000;
  const expiry = expiresAt ? Date.parse(expiresAt) : bound;
  const previous = (await read(env, uid)).lots.get(source);
  // Replays retain the original bounded expiry, never extend the grant.
  if (!Number.isFinite(expiry) || (!previous && (expiry <= now.getTime() || expiry > bound))) throw billingError(400, "credit_expiry_invalid", "Credit expiry exceeds approved lifetime.");
  const at = expiresAt ? new Date(expiry).toISOString() : previous?.expiresAt || new Date(bound).toISOString();
  return mutate(env, uid, account => { grant(account, env, source, amount, expiresAt ? at : account.lots.get(source)?.expiresAt || at); return summary(account); });
}
export async function reserveCredits(env: BillingEnv, uid: string, requestId: string, amount: number): Promise<CreditReservation> {
  getBillingConfig(env, true); validId(requestId); amountValid(amount);
  return mutate(env, uid, account => {
    const existing = account.reservations.get(requestId);
    if (existing) { if (existing.amount !== amount) throw billingError(409, "credit_request_conflict", "Request ID has different credit terms."); return publicReservation(existing); }
    if (account.balance < amount) throw billingError(402, "insufficient_credits", "Insufficient Credits.");
    let needed = amount; const allocations: Reservation["allocations"] = [];
    for (const lot of [...account.lots.values()].filter(l => !l.reversed && l.remaining > 0).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.source.localeCompare(b.source))) {
      const used = Math.min(lot.remaining, needed); lot.remaining -= used; needed -= used; allocations.push({ source: lot.source, amount: used }); if (!needed) break;
    }
    if (needed) throw billingError(500, "credit_integrity", "Credit lots do not match balance.");
    const reservation: Reservation = { requestId, amount, status: "reserved", createdAt: billingNow(env).toISOString(), allocations };
    account.reservations.set(requestId, reservation); journal(account, env, "reserve", requestId, -amount, requestId); return publicReservation(reservation);
  });
}
function publicReservation(r: Reservation): CreditReservation { return { requestId: r.requestId, amount: r.amount, status: r.status, createdAt: r.createdAt }; }
export async function settleCredits(env: BillingEnv, uid: string, requestId: string, outcome: "commit" | "return"): Promise<CreditReservation> {
  validId(requestId); if (outcome !== "commit" && outcome !== "return") throw billingError(400, "credit_outcome_invalid", "An explicit known outcome is required.");
  return mutate(env, uid, account => {
    const reservation = account.reservations.get(requestId);
    if (!reservation) throw billingError(404, "credit_reservation_missing", "Credit reservation was not found.");
    if (reservation.status !== "reserved") { if (reservation.status !== outcome) throw billingError(409, "credit_outcome_conflict", "A settled request cannot change outcome."); return publicReservation(reservation); }
    let delta = 0;
    for (const allocation of reservation.allocations) {
      const lot = account.lots.get(allocation.source)!;
      if (outcome === "return") {
        if (!lot.reversed && lot.expiresAt > billingNow(env).toISOString()) {
          // A returned reservation pays existing refund debt before becoming expirable Credit.
          lot.remaining += Math.max(0, allocation.amount + Math.min(0, account.balance + delta)); delta += allocation.amount;
        }
        else if (!lot.reversed) { lot.expired += allocation.amount; }
      } else if (lot.reversed) delta -= allocation.amount;
    }
    reservation.status = outcome; journal(account, env, outcome, requestId, delta, requestId); return publicReservation(reservation);
  });
}
export async function reverseCreditSource(env: BillingEnv, uid: string, source: string): Promise<CreditSummary> {
  validId(source);
  return mutate(env, uid, account => {
    const lot = account.lots.get(source); if (!lot || lot.reversed) return summary(account);
    const held = [...account.reservations.values()].filter(r => r.status === "reserved").flatMap(r => r.allocations).filter(a => a.source === source).reduce((sum, a) => sum + a.amount, 0);
    const debit = lot.amount - lot.expired - held; lot.remaining = 0; lot.reversed = true;
    journal(account, env, "reverse", source, -debit); return summary(account);
  });
}
export async function getBillingAccount(env: BillingEnv, uid: string): Promise<{ customerId: string | null; state: BillingAccountState }> {
  const account = await read(env, uid); return { customerId: account.customerId, state: account.state };
}
export async function updateBillingOperation(env: BillingEnv, uid: string, token: string, update: Pick<BillingAccountState, "customerCreationStartedAt" | "checkoutAttempt">): Promise<void> {
  await mutate(env, uid, account => {
    if (account.state.syncToken !== token || account.state.syncUntil! <= billingNow(env).toISOString()) throw billingError(409, "billing_sync_stale", "Billing operation lease expired.");
    Object.assign(account.state, update);
  });
}
export async function setBillingCustomer(env: BillingEnv, uid: string, customerId: string): Promise<void> {
  validId(customerId);
  await mutate(env, uid, account => {
    if (account.customerId && account.customerId !== customerId) throw billingError(409, "billing_customer_conflict", "Customer identity cannot be reassigned.");
    if (!env.QUESTFORGE_DB && [...dev(env).accounts.entries()].some(([id, a]) => id !== key(env, uid) && id.startsWith(`["${billingMode(env)}",`) && a.customerId === customerId)) throw billingError(409, "billing_customer_conflict", "Customer already has an owner.");
    account.customerId = customerId;
  });
}
export async function findBillingCustomer(env: BillingEnv, customerId: string): Promise<string | null> {
  const db = requireBillingDb(env);
  if (db) return (await db.prepare("SELECT uid FROM billing_accounts WHERE mode=? AND customer_id=?").bind(billingMode(env), customerId).first<{ uid: string }>())?.uid || null;
  for (const [id, a] of dev(env).accounts) if (id.startsWith(`["${billingMode(env)}",`) && a.customerId === customerId) return (JSON.parse(id) as string[])[1]!;
  return null;
}
export async function acquireBillingSync(env: BillingEnv, uid: string): Promise<string> {
  const token = crypto.randomUUID();
  await mutate(env, uid, account => {
    if (account.state.syncToken && account.state.syncUntil! > billingNow(env).toISOString()) throw billingError(409, "billing_sync_busy", "Stripe reconciliation is already running.");
    account.state.syncToken = token; account.state.syncUntil = new Date(billingNow(env).getTime() + 120000).toISOString();
  }); return token;
}
export async function releaseBillingSync(env: BillingEnv, uid: string, token: string): Promise<void> {
  await mutate(env, uid, account => { if (account.state.syncToken === token) { account.state.syncToken = null; account.state.syncUntil = null; } });
}
export async function applyBillingSnapshot(env: BillingEnv, uid: string, token: string, subscription: SubscriptionSnapshot | null, blockedInvoices: string[], blockedSubscriptions: string[], firstPaidInvoice?: { id: string; paidAt: string }): Promise<void> {
  await mutate(env, uid, account => {
    if (account.state.syncToken !== token || account.state.syncUntil! <= billingNow(env).toISOString()) throw billingError(409, "billing_sync_stale", "Reconciliation lease expired; refetch Stripe.");
    account.state.blockedInvoices = [...new Set([...account.state.blockedInvoices, ...blockedInvoices])];
    account.state.blockedSubscriptions = [...new Set([...account.state.blockedSubscriptions, ...blockedSubscriptions])];
    account.state.subscription = subscription;
    if (firstPaidInvoice && (!account.state.firstPaidInvoice || firstPaidInvoice.paidAt < account.state.firstPaidInvoice.paidAt)) account.state.firstPaidInvoice = firstPaidInvoice;
  });
}
export function addBillingMonths(iso: string, months: number): string {
  const original = new Date(iso); const target = new Date(original); const day = original.getUTCDate();
  target.setUTCDate(1); target.setUTCMonth(target.getUTCMonth() + months);
  target.setUTCDate(Math.min(day, new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate())); return target.toISOString();
}
export async function grantPeriodicCredits(env: BillingEnv, uid: string): Promise<CreditSummary> {
  getBillingConfig(env, true);
  return mutate(env, uid, account => {
    const sub = account.state.subscription;
    if (!sub || !subscriptionActive(account, env)) return summary(account);
    const periods = sub.interval === "annual" ? 12 : 1;
    for (let month = 0; month < periods; month++) {
      const start = addBillingMonths(sub.periodStart, month); if (start > billingNow(env).toISOString() || start >= sub.periodEnd) break;
      const expiry = new Date(Date.parse(start) + sub.lifetimeDays * 86400000).toISOString();
      const source = `invoice:${sub.invoiceId}:${month}`;
      if (expiry <= billingNow(env).toISOString() || !sub.monthlyCredits || account.state.blockedInvoices.includes(sub.invoiceId)) continue;
      grant(account, env, source, sub.monthlyCredits, expiry);
    } return summary(account);
  });
}
export async function reverseInvoiceCredits(env: BillingEnv, uid: string, invoiceId: string): Promise<void> {
  const sources = [...(await read(env, uid)).lots.keys()].filter(source => source.startsWith(`invoice:${invoiceId}:`));
  for (const source of sources) await reverseCreditSource(env, uid, source);
}
export async function getReferral(env: BillingEnv, uid: string): Promise<Referral | null> {
  const db = requireBillingDb(env);
  return db ? db.prepare("SELECT * FROM billing_referrals WHERE mode=? AND referred_uid=?").bind(billingMode(env), uid).first<Referral>() : dev(env).referrals.get(key(env, uid)) || null;
}
export async function attributeReferral(env: BillingEnv, uid: string, code: string): Promise<void> {
  validId(code); const db = requireBillingDb(env); let referrer: string | null = null;
  if (db) referrer = (await db.prepare("SELECT uid FROM billing_accounts WHERE mode=? AND referral_code=?").bind(billingMode(env), code).first<{ uid: string }>())?.uid || null;
  else for (const [id, a] of dev(env).accounts) if (id.startsWith(`["${billingMode(env)}",`) && a.referralCode === code) referrer = (JSON.parse(id) as string[])[1]!;
  if (!referrer || referrer === uid) throw billingError(400, "referral_invalid", "Referral must belong to another account.");
  const existingReferral = await getReferral(env, uid);
  if (existingReferral) {
    if (existingReferral.referrer_uid !== referrer) throw billingError(409, "referral_conflict", "Referral attribution is immutable.");
    return;
  }
  const account = await read(env, uid);
  if (account.state.subscription || account.state.firstPaidInvoice || account.state.checkoutAttempt) throw billingError(409, "referral_ineligible", "Referral attribution is only available before a subscription or Checkout.");
  if (db) {
    await db.prepare(`INSERT INTO billing_referrals(mode,referred_uid,referrer_uid) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM billing_accounts WHERE mode=? AND uid=?
      AND json_extract(state_json,'$.subscription') IS NULL AND json_extract(state_json,'$.firstPaidInvoice') IS NULL AND json_extract(state_json,'$.checkoutAttempt') IS NULL)
      ON CONFLICT(mode,referred_uid) DO NOTHING`).bind(billingMode(env), uid, referrer, billingMode(env), uid).run();
    if (!(await getReferral(env, uid))) throw billingError(409, "referral_ineligible", "Referral eligibility changed concurrently.");
  } else {
    const current = dev(env).accounts.get(key(env, uid))!;
    if (current.state.subscription || current.state.firstPaidInvoice || current.state.checkoutAttempt) throw billingError(409, "referral_ineligible", "Referral eligibility changed concurrently.");
    if (!dev(env).referrals.has(key(env, uid))) dev(env).referrals.set(key(env, uid), { referred_uid: uid, referrer_uid: referrer, invoice_id: null, reversed: 0, reward_amount: null, reward_expires_at: null });
  }
  if ((await getReferral(env, uid))?.referrer_uid !== referrer) throw billingError(409, "referral_conflict", "Referral attribution is immutable.");
}
export async function rewardReferral(env: BillingEnv, uid: string, invoiceId: string, paidAt: string, options: { reversed?: boolean } = {}): Promise<void> {
  const config = getBillingConfig(env, true)!; const db = requireBillingDb(env); let referral = await getReferral(env, uid);
  if (!referral) return;
  const paid = Date.parse(paidAt);
  if (!Number.isFinite(paid) || paid > billingNow(env).getTime()) throw billingError(409, "referral_payment_invalid", "Referral requires a confirmed payment time.");
  const expiry = new Date(paid + config.creditLifetimeDays * 86400000).toISOString();
  if (db) await db.prepare("UPDATE billing_referrals SET invoice_id=?,reward_amount=?,reward_expires_at=?,reversed=? WHERE mode=? AND referred_uid=? AND invoice_id IS NULL").bind(invoiceId, config.referralCredits, expiry, options.reversed ? 1 : 0, billingMode(env), uid).run();
  else if (!referral.invoice_id) { referral.invoice_id = invoiceId; referral.reward_amount = config.referralCredits; referral.reward_expires_at = expiry; referral.reversed = options.reversed ? 1 : 0; }
  referral = await getReferral(env, uid);
  if (!referral || referral.invoice_id !== invoiceId) return;
  if (options.reversed) { await reverseReferral(env, uid, invoiceId); return; }
  if (referral.reversed || !referral.reward_amount || !referral.reward_expires_at || referral.reward_expires_at <= billingNow(env).toISOString()) return;
  // Replay uses the original product terms even if later grants have a different approved amount/lifetime.
  await mutate(env, referral.referrer_uid, account => { grant(account, env, `referral:${invoiceId}`, referral!.reward_amount!, referral!.reward_expires_at!); });
  // If refund won the race, the idempotent reversal also covers a late grant.
  if ((await getReferral(env, uid))?.reversed) await reverseCreditSource(env, referral.referrer_uid, `referral:${invoiceId}`);
}
export async function reverseReferral(env: BillingEnv, uid: string, invoiceId: string): Promise<void> {
  const db = requireBillingDb(env); const referral = await getReferral(env, uid);
  if (!referral || referral.invoice_id !== invoiceId) return;
  if (db) await db.prepare("UPDATE billing_referrals SET reversed=1 WHERE mode=? AND referred_uid=? AND invoice_id=?").bind(billingMode(env), uid, invoiceId).run();
  else referral.reversed = 1;
  await reverseCreditSource(env, referral.referrer_uid, `referral:${invoiceId}`);
}
export async function stripeEventProcessed(env: BillingEnv, eventId: string): Promise<boolean> {
  const db = requireBillingDb(env);
  return db ? Boolean(await db.prepare("SELECT event_id FROM billing_stripe_events WHERE mode=? AND event_id=?").bind(billingMode(env), eventId).first()) : dev(env).events.has(key(env, eventId));
}
export async function markStripeEventProcessed(env: BillingEnv, eventId: string): Promise<void> {
  const db = requireBillingDb(env);
  if (db) await db.prepare("INSERT INTO billing_stripe_events(mode,event_id,processed_at) VALUES (?,?,?) ON CONFLICT(mode,event_id) DO NOTHING").bind(billingMode(env), eventId, billingNow(env).toISOString()).run();
  else dev(env).events.add(key(env, eventId));
}
export async function getBillingAdminReport(env: BillingEnv, token: string, options: { limit?: number } = {}): Promise<BillingAdminReport> {
  // Digest comparison prevents a shared-prefix token timing oracle.
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [actual, expected] = await Promise.all([digest(token || ""), digest(env.BILLING_ADMIN_TOKEN || "")]);
  let different = 0; for (let i = 0; i < expected.length; i++) different |= actual[i]! ^ expected[i]!;
  if (!env.BILLING_ADMIN_TOKEN || different) throw billingError(403, "billing_admin_forbidden", "Billing administration requires a separate admin credential.");
  const limit = options.limit ?? 100; if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw billingError(400, "invalid_page", "Admin limit must be 1–1000.");
  const db = requireBillingDb(env); const mode = billingMode(env);
  const rows = db ? (await db.prepare("SELECT uid,balance,state_json FROM billing_accounts WHERE mode=? ORDER BY uid LIMIT ?").bind(mode, limit).all<{ uid: string; balance: number; state_json: string }>()).results || []
    : [...dev(env).accounts].filter(([id]) => id.startsWith(`["${mode}",`)).slice(0, limit).map(([id, a]) => ({ uid: (JSON.parse(id) as string[])[1]!, balance: a.balance, state_json: JSON.stringify(a.state) }));
  return { mode, accounts: rows.map(row => ({ uid: row.uid, balance: row.balance, debt: Math.max(0, -row.balance),
    plan: subscriptionActive({ state: JSON.parse(row.state_json) as BillingAccountState } as Account, env) ? "pro" : "free", syncPending: Boolean((JSON.parse(row.state_json) as BillingAccountState).syncToken) })) };
}
export async function listBillingMaintenanceOwners(env: BillingEnv, options: { limit?: number; afterUid?: string } = {}): Promise<{ uids: string[]; nextCursor: string | null }> {
  const limit = options.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw billingError(400, "invalid_page", "Maintenance limit must be 1–100.");
  const db = requireBillingDb(env); const mode = billingMode(env); const after = options.afterUid || "";
  const uids = db ? ((await db.prepare("SELECT uid FROM billing_accounts WHERE mode=? AND uid>? ORDER BY maintenance_order,uid LIMIT ?").bind(mode, after, limit + 1).all<{ uid: string }>()).results || []).map(row => row.uid)
    : [...dev(env).accounts].filter(([k]) => k.startsWith(`["${mode}",`)).map(([k, a]) => ({ uid: (JSON.parse(k) as string[])[1]!, order: a.maintenanceOrder })).filter(a => a.uid > after).sort((a, b) => a.order - b.order || a.uid.localeCompare(b.uid)).slice(0, limit + 1).map(a => a.uid);
  const page = uids.slice(0, limit); return { uids: page, nextCursor: uids.length > limit ? page.at(-1)! : null };
}
export async function markBillingMaintenanceAttempt(env: BillingEnv, uid: string): Promise<void> {
  const db = requireBillingDb(env); const mode = billingMode(env);
  if (db) await db.prepare("UPDATE billing_accounts SET maintenance_order=(SELECT COALESCE(MAX(maintenance_order),0)+1 FROM billing_accounts WHERE mode=?) WHERE mode=? AND uid=?").bind(mode, mode, uid).run();
  else {
    const store = dev(env); const current = store.accounts.get(key(env, uid));
    if (current) current.maintenanceOrder = Math.max(0, ...[...store.accounts].filter(([k]) => k.startsWith(`["${mode}",`)).map(([, a]) => a.maintenanceOrder)) + 1;
  }
}
export function resetBillingMemoryForTests(): void { memory = new WeakMap(); }

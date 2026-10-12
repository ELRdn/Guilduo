/**
 * Settings — state, model and normalization. Deliberately DOM-free (no
 * `primitives/dom.ts`, no `window`/`document`), matching the split every
 * other screen already uses (`quests-model.ts`, `party-model.ts`, etc.), so
 * this half can be unit-tested directly under `node:test` without pulling in
 * a DOM-typed render file.
 */

import type { ThemePreference } from "../theme.ts";
import type { BillingPricing as ApiBillingPricing, PublishedBillingPrice, PublishedBillingDiscount } from "../../../worker/src/billing-store.ts";

export type SettingsSection = "top" | "account" | "appearance" | "mcp" | "agents" | "billing";

export type ProfileDraftField = "displayName" | "handle" | "bio";

export interface ProfileDraft {
  displayName: string;
  handle: string;
  bio: string;
}

export interface SettingsState {
  avatarSaving: boolean;
  avatarProgress: number | null;
  avatarMessage: () => string;
  avatarTone: "success" | "error" | null;
  profileSaving: boolean;
  profileMessage: () => string;
  profileTone: "success" | "error" | null;
  profileDraft: ProfileDraft | null;
  mcpCopyMessage: () => string;
  mcpCopyTone: "success" | "error" | null;
  connectionBusyId: string | null;
  connectionMessage: () => string;
  connectionTone: "success" | "error" | null;
  connectionDrafts: Record<string, string[]>;
  /** Section to bring into view on the next render — consumed once, then cleared. */
  pendingFocus: SettingsSection | null;
}

export function initialSettingsState(): SettingsState {
  return {
    avatarSaving: false,
    avatarProgress: null,
    avatarMessage: () => "",
    avatarTone: null,
    profileSaving: false,
    profileMessage: () => "",
    profileTone: null,
    profileDraft: null,
    mcpCopyMessage: () => "",
    mcpCopyTone: null,
    connectionBusyId: null,
    connectionMessage: () => "",
    connectionTone: null,
    connectionDrafts: {},
    pendingFocus: "top",
  };
}

export interface SettingsAgentRow {
  readonly planAllowed?: boolean;
  readonly restrictionReason?: string;
  readonly allowedScopes?: readonly string[];
  readonly agentId: string;
  readonly displayName: string;
  readonly provider: string;
  readonly role: string;
  readonly status: string;
}

/** Execution scopes and the OAuth connection grant are separate capabilities. */
export function effectiveConnectionScopes(model: Pick<SettingsModel, "agents">, row: SettingsMcpConnectionRow): readonly string[] {
  if (!row.authorized || row.revokedAt || row.linkRevokedAt || !row.linkedAgentId) return [];
  const agent = model.agents.find((item) => item.agentId === row.linkedAgentId && item.status === "active");
  return agent ? row.scopes.filter((scope) => agent.allowedScopes?.includes(scope)) : [];
}

export interface SettingsMcpConnectionRow {
  readonly clientId: string;
  readonly clientName: string;
  readonly scopes: readonly string[];
  readonly firstConnectedAt: string;
  readonly lastUsedAt: string;
  /** The last/current relation target, retained for a useful legacy state. */
  readonly linkedAgentId: string | null;
  readonly allowedAgentIds?: readonly string[];
  /** Non-null when the relation exists but is no longer active. */
  readonly linkRevokedAt: string | null;
  /** True when an active OAuth grant exists for this client. */
  readonly authorized: boolean;
  /** OAuth grant revocation, distinct from an Agent unlink. */
  readonly revokedAt: string | null;
}

export interface SettingsModel {
  /** True in the fixture/demo lab — no runtime, so no write ever pretends to succeed. */
  readonly isDemo: boolean;
  readonly profile: {
    readonly displayName: string;
    readonly handle: string;
    readonly bio: string;
    readonly hasHandle: boolean;
    readonly hasCustomAvatar: boolean;
    readonly avatarVersion: number;
  } | null;
  readonly email: string;
  readonly profileLoadError: string | null;
  readonly theme: ThemePreference;
  readonly effectiveTheme: "light" | "dark";
  readonly mcpUrl: string;
  readonly agents: readonly SettingsAgentRow[];
  readonly mcpConnections: readonly SettingsMcpConnectionRow[];
  readonly mcpConnectionLoadError: string | null;
}

export interface NormalizeSettingsOptions {
  readonly isDemo: boolean;
  readonly profile: { readonly displayName?: string; readonly handle?: string; readonly bio?: string; readonly hasCustomAvatar?: boolean; readonly avatarVersion?: number } | null;
  readonly email?: string;
  readonly profileLoadError?: string | null;
  readonly theme: ThemePreference;
  readonly effectiveTheme: "light" | "dark";
  readonly gatewayUrl: string;
  readonly agents: readonly SettingsAgentRow[];
  readonly mcpConnections?: readonly SettingsMcpConnectionRow[];
  readonly mcpConnectionLoadError?: string | null;
}

/** `{gatewayUrl}/mcp` with no doubled or missing slash — the one normal-use MCP URL. */
export function deriveMcpUrl(gatewayUrl: string): string {
  const trimmed = gatewayUrl.trim().replace(/\/+$/, "");
  return trimmed === "" ? "" : `${trimmed}/mcp`;
}

export function normalizeSettingsModel(options: NormalizeSettingsOptions): SettingsModel {
  const displayName = options.profile?.displayName?.trim() ?? "";
  const handle = options.profile?.handle?.trim().replace(/^@+/, "") ?? "";
  const avatarVersion = Number(options.profile?.avatarVersion);
  return {
    isDemo: options.isDemo,
    profile: options.profile === null ? null : {
      displayName,
      handle,
      bio: options.profile?.bio?.trim() ?? "",
      hasHandle: handle !== "",
      hasCustomAvatar: options.profile?.hasCustomAvatar === true && Number.isSafeInteger(avatarVersion) && avatarVersion > 0,
      avatarVersion: Number.isSafeInteger(avatarVersion) && avatarVersion > 0 ? avatarVersion : 0,
    },
    email: options.email?.trim() ?? "",
    profileLoadError: options.profileLoadError?.trim() || null,
    theme: options.theme,
    effectiveTheme: options.effectiveTheme,
    mcpUrl: deriveMcpUrl(options.gatewayUrl),
    agents: options.agents,
    mcpConnections: options.mcpConnections ?? [],
    mcpConnectionLoadError: options.mcpConnectionLoadError?.trim() || null,
  };
}

export interface SettingsCallbacks {
  readonly onThemeSelect: (theme: ThemePreference) => void;
  readonly onAvatarFileSelected: (file: File) => void;
  readonly onRemoveAvatar: () => void;
  readonly onProfileDraftChange: (field: ProfileDraftField, value: string) => void;
  readonly onSaveProfile: () => void;
  readonly onRetryProfile: () => void;
  readonly onCopyMcpUrl: () => void;
  readonly onRetryMcpConnections: () => void;
  readonly onOpenAgentPicker: (clientId: string) => void;
  readonly onCancelAgentPicker: (clientId: string) => void;
  readonly onSelectConnectionAgent: (clientId: string, agentId: string) => void;
  readonly onLinkAgent: (clientId: string, agentId: string) => void;
  readonly onUnlinkAgent: (clientId: string, agentId: string) => void;
  readonly onRevokeConnection: (clientId: string) => void;
  readonly onDeleteConnection: (clientId: string) => void;
  readonly canManageAgents: boolean;
  readonly onCreateAgent: () => void;
  readonly onEditAgent: (agentId: string) => void;
}

export interface BillingPrice extends Readonly<Omit<PublishedBillingPrice, "priceId">> {
  readonly currency: string;
}

export interface BillingDiscount extends Readonly<Omit<PublishedBillingDiscount, "couponId" | "currency" | "duration" | "redeemBy">> {
  readonly currency: string;
  readonly duration: "once" | "repeating" | "forever";
  readonly durationMonths: number | null;
  readonly redeemBy: string;
}

export interface BillingStatus {
  readonly enabled: boolean;
  readonly configured: boolean;
  readonly salesReady: boolean;
  readonly mode: "test" | "live" | null;
  readonly plan: "free" | "pro";
  readonly periodEnd: string;
  readonly nextRenewal: string;
  readonly cancelAtPeriodEnd: boolean;
  readonly subscriptionStatus: string;
  readonly selectedAgentIds: readonly string[];
  readonly registeredAgentCount: number | null;
  readonly agentLimit: 2 | null;
  readonly credits: { readonly available: number | null; readonly reserved: number | null; readonly debt: number | null };
  readonly referral: { readonly code: string; readonly attributed: boolean; readonly rewarded: boolean };
  readonly pricing: {
    readonly approved: boolean; readonly complete: boolean; readonly month: BillingPrice | null; readonly year: BillingPrice | null;
    readonly launchDiscount: BillingDiscount | null; readonly referralDiscount: BillingDiscount | null;
    readonly creditLifetimeDays: ApiBillingPricing["creditLifetimeDays"] | null; readonly referralCredits: ApiBillingPricing["referralCredits"] | null; readonly decisionCredits: ApiBillingPricing["decisionCredits"] | null;
    readonly refundPolicy: ApiBillingPricing["refundPolicy"]; readonly automaticTax: boolean | null; readonly taxBehavior: ApiBillingPricing["taxBehavior"];
  };
}

export function billingRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function billingString(value: unknown): string { return typeof value === "string" ? value : ""; }
export function billingNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function normalizeBillingStatus(value: unknown): BillingStatus {
  const root = billingRecord(value);
  const source = Object.hasOwn(root, "billing") ? billingRecord(root.billing) : root;
  const credits = billingRecord(source.credits);
  const entitlement = Object.hasOwn(source, "entitlement") ? billingRecord(source.entitlement) : source;
  const pricing = billingRecord(source.pricing);
  const price = (value: unknown, interval: "month" | "year"): BillingPrice | null => {
    const row = billingRecord(value);
    const amount = billingNumber(row.amount);
    const currency = billingString(row.currency || pricing.currency);
    const creditsPerMonth = billingNumber(row.creditsPerMonth);
    if (amount === null || amount === 0 || !/^[a-zA-Z]{3}$/.test(currency) || row.interval !== interval || row.intervalCount !== 1 || creditsPerMonth === null
      || !["inclusive", "exclusive", "unspecified"].includes(billingString(row.taxBehavior))) return null;
    return { amount, currency: currency.toUpperCase(), interval, intervalCount: 1, creditsPerMonth, taxBehavior: billingString(row.taxBehavior) };
  };
  const discount = (value: unknown): BillingDiscount | null => {
    const row = billingRecord(value);
    const percentOff = typeof row.percentOff === "number" && Number.isFinite(row.percentOff) && row.percentOff > 0 && row.percentOff <= 100 ? row.percentOff : null;
    const amountOff = billingNumber(row.amountOff);
    const currency = billingString(row.currency || pricing.currency).toUpperCase();
    const duration = row.duration;
    const durationMonths = billingNumber(row.durationMonths);
    const redeemBy = billingString(row.redeemBy);
    if ((percentOff === null) === (amountOff === null) || (row.percentOff !== null && percentOff === null) || (row.amountOff !== null && amountOff === null)
      || amountOff === 0 || !/^[A-Z]{3}$/.test(currency) || currency !== billingString(pricing.currency).toUpperCase()
      || !["once", "repeating", "forever"].includes(String(duration)) || (duration === "repeating" && !durationMonths)
      || (redeemBy && !Number.isFinite(Date.parse(redeemBy)))) return null;
    return { percentOff, amountOff, currency, duration: duration as BillingDiscount["duration"], durationMonths, redeemBy };
  };
  const month = price(pricing.month ?? pricing.monthly, "month");
  const year = price(pricing.year ?? pricing.annual, "year");
  const launchDiscount = discount(pricing.launchDiscount);
  const referralDiscount = discount(pricing.referralDiscount);
  const lifetime = billingNumber(pricing.creditLifetimeDays);
  // Terms are localized from typed fields. Empty legacy terms[] cannot block a complete product.
  const complete = pricing.approved === true && month !== null && year !== null && month.currency === year.currency && month.currency === billingString(pricing.currency).toUpperCase()
    && lifetime !== null && lifetime >= 1 && lifetime <= 366 && billingNumber(pricing.referralCredits) !== null && billingNumber(pricing.decisionCredits) !== null
    && pricing.refundPolicy === "revoke_invoice_benefits" && ["inclusive", "exclusive"].includes(billingString(pricing.taxBehavior))
    && month.taxBehavior === pricing.taxBehavior && year.taxBehavior === pricing.taxBehavior && typeof pricing.automaticTax === "boolean" && pricing.autoTopUp === false
    && (pricing.launchDiscount === null || launchDiscount !== null) && (pricing.referralDiscount === null || referralDiscount !== null);
  return {
    enabled: source.enabled === true,
    configured: source.configured === true,
    salesReady: source.salesReady === true,
    mode: source.mode === "test" || source.mode === "live" ? source.mode : null,
    plan: entitlement.plan === "pro" ? "pro" : "free",
    periodEnd: billingString(entitlement.periodEnd),
    nextRenewal: billingString(source.nextRenewal),
    cancelAtPeriodEnd: source.cancelAtPeriodEnd === true,
    subscriptionStatus: billingString(source.subscriptionStatus),
    selectedAgentIds: Array.isArray(entitlement.selectedAgentIds) ? [...new Set(entitlement.selectedAgentIds.filter((id): id is string => typeof id === "string" && id !== ""))] : [],
    registeredAgentCount: billingNumber(source.registeredAgentCount),
    agentLimit: entitlement.plan === "pro" && entitlement.agentLimit === null ? null : 2,
    credits: { available: billingNumber(credits.available), reserved: billingNumber(credits.reserved), debt: billingNumber(credits.debt) },
    referral: { code: billingString(billingRecord(source.referral).code), attributed: billingRecord(source.referral).attributed === true, rewarded: billingRecord(source.referral).rewarded === true },
    pricing: {
      approved: pricing.approved === true, complete, month, year, launchDiscount, referralDiscount,
      creditLifetimeDays: billingNumber(pricing.creditLifetimeDays), referralCredits: billingNumber(pricing.referralCredits), decisionCredits: billingNumber(pricing.decisionCredits ?? source.decisionCredits),
      refundPolicy: billingString(pricing.refundPolicy) || null, automaticTax: typeof pricing.automaticTax === "boolean" ? pricing.automaticTax : null, taxBehavior: billingString(pricing.taxBehavior) || null,
    },
  };
}

export function billingPurchaseAvailable(status: BillingStatus, now = Date.now()): boolean {
  return status.enabled && status.configured && status.salesReady && status.mode !== null && status.pricing.complete
    && [status.pricing.launchDiscount, status.pricing.referralDiscount].every(discount => !discount?.redeemBy || Date.parse(discount.redeemBy) > now);
}

export function formatBillingMoney(amount: number, currency: string, locale: string): string {
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency });
  // Stripe represents ISK/UGX charges with two decimal places despite their ISO presentation.
  const decimals = ["ISK", "UGX"].includes(currency.toUpperCase()) ? 2 : formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(amount / 10 ** decimals);
}

export function billingDiscountedAmount(price: BillingPrice, discount: BillingDiscount): number {
  const reduction = discount.percentOff !== null ? Math.round(price.amount * discount.percentOff / 100) : discount.amountOff ?? 0;
  return Math.max(0, price.amount - reduction);
}

/** Validate exact hosts, scheme, credentials and port before navigating externally. */
export function safeStripeUrl(value: unknown, kind: "checkout" | "portal"): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const host = kind === "checkout" ? "checkout.stripe.com" : "billing.stripe.com";
    return url.protocol === "https:" && url.hostname === host && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}

export function validFreeAgentSelection(ids: readonly string[], agents: readonly SettingsAgentRow[]): boolean {
  const eligible = agents.filter(agent => agent.status === "active" || agent.status === "disabled");
  return ids.length === Math.min(2, eligible.length) && new Set(ids).size === ids.length && ids.every(id => eligible.some(agent => agent.agentId === id));
}

/** Jev's server boundary requires both reading the Quest and assigning its next action. */
export function eligibleDecisionAgent(agent: SettingsAgentRow): boolean {
  return agent.status === "active" && agent.planAllowed !== false
    && ["quests:read", "quests:write"].every(scope => agent.allowedScopes?.includes(scope));
}

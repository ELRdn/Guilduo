import { getLocale } from "../../../i18n.ts";
import type { Quest } from "../../../types/questforge.ts";
import { QuestForgeApiError } from "../../repository.ts";
import type { RelayForgeRuntime } from "../production.ts";
import { billingText as copy, type BillingCopyKey } from "../billing-copy.ts";
import { el } from "../primitives/dom.ts";
import { metricRow, screenRegion } from "./runtime.ts";
import { billingNumber, billingRecord, billingString, normalizeBillingStatus, safeStripeUrl, validFreeAgentSelection, billingPurchaseAvailable, formatBillingMoney, billingDiscountedAmount, eligibleDecisionAgent, type BillingStatus, type SettingsAgentRow, type BillingPrice, type BillingDiscount } from "./settings-model.ts";

export type BillingPort = NonNullable<RelayForgeRuntime["billingPort"]>;
export interface BillingUiOptions {
  readonly port: BillingPort | null;
  readonly agents: () => readonly SettingsAgentRow[];
  readonly quests: () => readonly Quest[];
  readonly render: () => void;
  readonly alive: () => boolean;
  readonly writeLocked: () => boolean;
  readonly refreshWorkspace: () => Promise<void>;
}

function control(key: BillingCopyKey, action: () => void, disabled = false): HTMLButtonElement {
  const button = el("button", { type: "button", class: "rf-secondary-button", disabled, "data-billing-action": key, "data-billing-focus": key }, copy(key));
  button.addEventListener("click", action);
  return button;
}
function field(label: string, input: HTMLElement): HTMLElement {
  return el("label", { class: "rf-set-field" }, el("span", { class: "rf-set-field-label" }, label), input);
}
function date(value: unknown): string {
  const parsed = Date.parse(billingString(value));
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString(getLocale()) : "—";
}
function priceText(price: BillingPrice): string {
  return formatBillingMoney(price.amount, price.currency, getLocale());
}
function contextText(value: string, max: number): string {
  // Keep the consent preview aligned with the Worker's whitelisted, redacted task text.
  return value.slice(0, max).replace(/https?:\/\/\S+|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "[redacted]")
    .replace(/(?:bearer\s+\S+|(?:api[-_ ]?key|token|secret|password)\s*[:=]\s*[^\s,;]+)/gi, "[redacted]");
}

/** State survives shell re-renders; every request is entry- or user-triggered. */
export function createBillingUi(options: BillingUiOptions) {
  let loaded = false;
  let busy = "";
  let status: BillingStatus | null = null;
  let error: BillingCopyKey | null = null;
  let message: BillingCopyKey | null = null;
  let selectedIds: string[] | null = null;
  let referralCode = "";
  let purchaseConsent = false;
  let purchaseAttempt: { interval: "month" | "year"; referralCode: string; requestId: string } | null = null;
  let ledger: Record<string, unknown>[] | null = null;
  let ledgerCursor: string | null = null;
  const ledgerCursors = new Set<string>();
  let ledgerError = false;
  let ledgerOpen = false;
  let questId = "";
  let candidateIds: string[] = [];
  let consent = false;
  let quote: { credits: number; version: string; agentIds: string[] } | null = null;
  let decision: Record<string, unknown> | null = null;
  let decisionId = "";
  let decisionVersion = "";
  let decisionCandidateIds: string[] = [];
  let applied = false;

  const agents = () => options.agents().filter(agent => agent.status === "active" || agent.status === "disabled");
  const candidates = () => options.agents().filter(agent => eligibleDecisionAgent(agent)
    && !(status?.enabled && status.plan === "free" && agents().length > 2 && !status.selectedAgentIds.includes(agent.agentId)));
  const quests = () => options.quests().filter(quest => quest.lifecycleState === "active" && !quest.archivedAt && !quest.done && !!quest.updatedAt);
  const selectedQuest = () => quests().find(quest => quest.id === questId);
  const changed = () => {
    if (!options.alive()) return;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.billingFocus : undefined;
    options.render();
    if (focused) [...document.querySelectorAll<HTMLElement>("[data-billing-focus]")].find(node => node.dataset.billingFocus === focused)?.focus({ preventScroll: true });
  };
  const canWrite = () => options.port !== null && !busy && !options.writeLocked() && options.alive();
  const allowedCandidates = () => candidateIds.length > 0 && candidateIds.length <= 254 && new Set(candidateIds).size === candidateIds.length
    && candidateIds.every(id => candidates().some(agent => agent.agentId === id));
  const quoteCurrent = () => !!quote && quote.version === selectedQuest()?.updatedAt
    && quote.agentIds.length === candidateIds.length && quote.agentIds.every(id => candidateIds.includes(id)) && allowedCandidates();

  function failure(reason: unknown): BillingCopyKey {
    if (reason instanceof QuestForgeApiError && ["billing_not_configured", "billing_disabled", "jev_unavailable", "jev_budget_exceeded"].includes(reason.code)) return "unavailable";
    return "failed";
  }
  async function run(name: string, action: () => Promise<void>): Promise<void> {
    if (!options.port || busy || !options.alive()) return;
    busy = name; error = null; message = null; changed();
    try { await action(); }
    catch (reason) { if (options.alive()) error = failure(reason); }
    finally { if (options.alive()) { busy = ""; changed(); } }
  }
  async function load(retry = false): Promise<void> {
    if (loaded && !retry || busy || !options.port) return;
    loaded = true;
    await run("load", async () => {
      const result = await options.port!.getBilling();
      if (!options.alive()) return;
      status = normalizeBillingStatus(result);
      purchaseConsent = false;
      if (selectedIds === null) selectedIds = [...status.selectedAgentIds];
    });
  }
  async function loadLedger(): Promise<void> {
    ledgerError = false;
    await run("ledger", async () => {
      try {
        const cursor = ledgerCursor;
        const result = await options.port!.getBillingCredits(cursor ? { cursor } : {});
        if (!options.alive()) return;
        if (!Array.isArray(result.entries) || (result.nextCursor != null && (typeof result.nextCursor !== "string" || !result.nextCursor
          || result.nextCursor === cursor || ledgerCursors.has(result.nextCursor)))) throw new Error("Invalid ledger");
        const entries = result.entries.map(billingRecord);
        const knownIds = new Set((ledger ?? []).map(entry => entry.id).filter(id => typeof id === "string"));
        ledger = [...ledger ?? [], ...entries.filter(entry => {
          if (typeof entry.id !== "string") return true;
          if (knownIds.has(entry.id)) return false;
          knownIds.add(entry.id); return true;
        })];
        if (cursor) ledgerCursors.add(cursor);
        ledgerCursor = result.nextCursor || null;
      } catch (reason) { ledgerError = true; throw reason; }
    });
  }
  async function saveAgents(): Promise<void> {
    if (!canWrite() || !status?.enabled || status.plan !== "free" || !validFreeAgentSelection(selectedIds ?? [], agents())) return;
    const ids = [...selectedIds!];
    await run("agents", async () => {
      const result = await options.port!.selectBillingAgents(ids);
      if (!options.alive()) return;
      const next = normalizeBillingStatus(result);
      if (next.selectedAgentIds.length !== ids.length || !ids.every(id => next.selectedAgentIds.includes(id))) throw new Error("Unverified selection");
      status = next; selectedIds = [...next.selectedAgentIds]; message = "saved";
      quote = null; consent = false;
      await options.refreshWorkspace();
    });
  }
  async function checkout(interval: "month" | "year"): Promise<void> {
    if (!canWrite() || !status || !billingPurchaseAvailable(status) || !purchaseConsent || (purchaseAttempt && purchaseAttempt.interval !== interval)) return;
    purchaseAttempt ??= { interval, referralCode: referralCode.trim(), requestId: crypto.randomUUID() };
    const attempt = purchaseAttempt;
    await run("checkout", async () => {
      const result = await options.port!.createCheckout({ interval: interval === "month" ? "monthly" : "annual", requestId: attempt.requestId, ...(attempt.referralCode ? { referralCode: attempt.referralCode } : {}) });
      if (!options.alive()) return;
      const url = safeStripeUrl(result.url, "checkout");
      if (!url) { error = "unsafeUrl"; return; }
      window.location.assign(url);
    });
  }
  async function portal(): Promise<void> {
    if (!canWrite() || !status?.enabled || !status.configured) return;
    await run("portal", async () => {
      const result = await options.port!.createBillingPortal();
      if (!options.alive()) return;
      const url = safeStripeUrl(result.url, "portal");
      if (!url) { error = "unsafeUrl"; return; }
      window.location.assign(url);
    });
  }
  function resetQuote(): void { consent = false; quote = null; changed(); }
  async function estimate(): Promise<void> {
    const quest = selectedQuest();
    if (!canWrite() || !quest || !consent || !allowedCandidates() || decisionId) return;
    const ids = [...candidateIds];
    await run("estimate", async () => {
      quote = null;
      const result = await options.port!.estimateDecision({ questId: quest.id, expectedUpdatedAt: quest.updatedAt, agentIds: ids, consent: true });
      if (!options.alive()) return;
      const credits = billingNumber(result.credits ?? result.creditCost ?? result.decisionCredits);
      if (credits === null || result.configured === false || result.available === false) throw new Error("Unavailable estimate");
      quote = { credits, version: quest.updatedAt, agentIds: ids };
    });
  }
  function setDecision(result: unknown): void {
    const source = billingRecord(result);
    const next = Object.hasOwn(source, "decision") ? billingRecord(source.decision) : source;
    if (next.questId !== questId || next.expectedUpdatedAt !== decisionVersion || (next.id ?? next.requestId) !== decisionId) throw new Error("Mismatched decision");
    decision = next;
  }
  async function execute(): Promise<void> {
    const quest = selectedQuest();
    if (!canWrite() || !quest || !consent || !quoteCurrent() || decisionId) return;
    decisionId = crypto.randomUUID(); decisionVersion = quote!.version; decisionCandidateIds = [...candidateIds];
    await run("execute", async () => {
      try {
        const result = await options.port!.createDecision({ questId: quest.id, expectedUpdatedAt: decisionVersion, agentIds: [...candidateIds], consent: true, requestId: decisionId });
        if (!options.alive()) return;
        setDecision(result);
      } catch (reason) {
        if (reason instanceof QuestForgeApiError && reason.status >= 400 && reason.status < 500) {
          decisionId = ""; quote = null; throw reason;
        }
        error = "uncertain";
      }
    });
  }
  async function checkResult(): Promise<void> {
    if (!canWrite() || !decisionId) return;
    await run("result", async () => {
      const result = await options.port!.getDecision(decisionId);
      if (options.alive()) setDecision(result);
    });
  }
  function suggestion(): { agent: SettingsAgentRow; action: string; confidence: number } | null {
    const answers = billingRecord(billingRecord(decision?.result).answers);
    const agentAnswer = billingRecord(answers.agent);
    const actionAnswer = billingRecord(answers.action);
    const choice = billingString(agentAnswer.choice);
    const agentId = billingString(decision?.agentId) || (choice.startsWith("agent:") ? choice.slice(6) : "");
    const action = billingString(decision?.action) || billingString(actionAnswer.choice);
    const confidence = Math.min(Number(decision?.confidence ?? agentAnswer.confidence), Number(decision?.confidence ?? actionAnswer.confidence));
    const agent = candidates().find(agent => agent.agentId === agentId && decisionCandidateIds.includes(agent.agentId));
    const state = billingString(decision?.status);
    return agent && state === "suggestion" && ["continue", "ask_human", "review", "wait"].includes(action)
      && Number.isFinite(confidence) && confidence >= 0.7 && confidence <= 1 ? { agent, action, confidence } : null;
  }
  async function apply(): Promise<void> {
    const quest = selectedQuest();
    if (!canWrite() || !suggestion() || !quest || quest.updatedAt !== decisionVersion || applied) return;
    if (!window.confirm(`${copy("apply")}\n${suggestion()!.agent.displayName}\n${copy("version")}: ${date(decisionVersion)}`)) return;
    await run("apply", async () => {
      try {
        await options.port!.applyDecision(decisionId, decisionVersion);
        if (!options.alive()) return;
        applied = true; message = "applied";
        await options.refreshWorkspace();
      } catch (reason) {
        if (!(reason instanceof QuestForgeApiError) || reason.status >= 500) { applied = true; error = "uncertain"; }
        else throw reason;
      }
    });
  }

  function agentPicker(label: string, pool: readonly SettingsAgentRow[], ids: readonly string[], limit: number, change: (id: string) => void, locked = false): HTMLElement {
    return el("fieldset", { class: "rf-billing-picker", disabled: busy !== "" || locked },
      el("legend", {}, label),
      ...pool.map((agent, index) => {
        const input = el("input", { type: "checkbox", checked: ids.includes(agent.agentId), disabled: !ids.includes(agent.agentId) && ids.length >= limit, "data-billing-focus": `${limit === 2 ? "free" : "jev"}-${index}` });
        input.addEventListener("change", () => change(agent.agentId));
        return el("label", { class: "rf-billing-check" }, input, el("span", {}, agent.displayName), agent.planAllowed === false ? el("small", {}, copy("disabled")) : null);
      }));
  }

  function discountTerms(discount: BillingDiscount, key: "launchDiscount" | "referralDiscount", prices: readonly BillingPrice[]): HTMLElement {
    const numeric = (value: number) => value.toLocaleString(getLocale());
    const reduction = discount.percentOff !== null ? `${numeric(discount.percentOff)}%` : formatBillingMoney(discount.amountOff!, discount.currency, getLocale());
    const duration = discount.duration === "repeating" ? `${copy("duration_repeating")}: ${numeric(discount.durationMonths!)} ${copy("months")}` : copy(discount.duration === "once" ? "duration_once" : "duration_forever");
    return el("div", { class: "rf-billing-discount", "data-billing-discount": key },
      el("p", {}, `${copy(key)}: ${reduction} · ${duration}`),
      el("p", {}, `${copy("redeemUntil")}: ${discount.redeemBy ? date(discount.redeemBy) : copy("noEnd")}`),
      ...prices.map(price => el("p", {}, `${copy(price.interval === "month" ? "monthly" : "yearly")}: ${copy("discountEstimate")} ${priceText({ ...price, amount: billingDiscountedAmount(price, discount) })}${discount.duration === "forever" ? "" : ` · ${copy("renewalPrice")}: ${priceText(price)}`}`)));
  }

  function pricingRegion(): HTMLElement {
    const pricing = status!.pricing;
    const section = el("div", { class: "rf-billing-pricing", "data-billing-pricing": "true" });
    if (!pricing.complete) { section.append(el("p", {}, copy("salesPending"))); return section; }
    const prices = [pricing.month!, pricing.year!];
    for (const price of prices) section.append(el("p", {}, `${copy(price.interval === "month" ? "monthly" : "yearly")}: ${copy("normal")} ${priceText(price)} · ${copy("creditsPerMonth")}: ${price.creditsPerMonth.toLocaleString(getLocale())}`));
    if (status!.mode === "test") section.append(el("p", {}, copy("testMode")));
    const terms = el("details", { class: "rf-billing-terms", open: true }, el("summary", { "data-billing-focus": "terms" }, copy("terms")),
      el("p", {}, copy("autoRenew")),
      el("p", {}, copy("creditsCadence")),
      el("p", {}, `${copy("creditExpiryFromGrant")}: ${pricing.creditLifetimeDays!.toLocaleString(getLocale())} ${copy("days")}`),
      el("p", {}, `${copy("jev")}: ${pricing.decisionCredits!.toLocaleString(getLocale())} ${copy("amount")}`),
      el("p", {}, copy("creditsHint")),
      el("p", {}, copy("cancelPolicy")),
      el("p", {}, copy(pricing.taxBehavior === "inclusive" ? "taxInclusive" : "taxExclusive")),
      pricing.automaticTax ? el("p", {}, copy("autoTax")) : null,
      el("p", {}, copy("refundPolicy")),
      el("p", {}, `${copy("referralReward")}: ${pricing.referralCredits!.toLocaleString(getLocale())}`),
      el("p", {}, copy("referralRules")),
    );
    if (pricing.launchDiscount) terms.append(discountTerms(pricing.launchDiscount, "launchDiscount", prices));
    if (pricing.referralDiscount) terms.append(discountTerms(pricing.referralDiscount, "referralDiscount", prices));
    if (!pricing.launchDiscount && !pricing.referralDiscount) terms.append(el("p", {}, copy("noDiscount")));
    if (pricing.launchDiscount || pricing.referralDiscount) terms.append(el("p", {}, copy("discountPriority")));
    section.append(terms);
    if (!billingPurchaseAvailable(status!)) { section.append(el("p", {}, copy("unavailable"))); return section; }
    if (purchaseAttempt) section.append(el("p", { role: "status" }, copy("checkoutUncertain")));
    const referral = el("input", { class: "rf-set-input", type: "text", value: referralCode, maxlength: 200, autocomplete: "off", "data-billing-focus": "referral", disabled: !!busy || !!purchaseAttempt || status!.referral.attributed });
    referral.addEventListener("input", () => {
      referralCode = referral.value; purchaseConsent = false;
      consent.checked = false;
      section.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true; });
    });
    section.append(field(copy("referralInput"), referral));
    const consent = el("input", { type: "checkbox", checked: purchaseConsent, "data-billing-focus": "purchase-consent", disabled: !!busy || options.writeLocked() });
    consent.addEventListener("change", () => { purchaseConsent = consent.checked; changed(); });
    section.append(el("label", { class: "rf-billing-check" }, consent, el("span", {}, copy("checkoutConsent"))));
    if (purchaseAttempt) section.append(control("checkoutRetry", () => { void checkout(purchaseAttempt!.interval); }, !canWrite() || !purchaseConsent));
    else for (const interval of ["month", "year"] as const) section.append(control(interval === "month" ? "monthly" : "yearly", () => { void checkout(interval); }, !canWrite() || !purchaseConsent));
    return section;
  }
  function billingRegion(): HTMLElement {
    const content = el("div", { class: "rf-billing", "aria-busy": String(!!busy), "data-billing": "true" });
    if (!options.port) { content.append(el("p", {}, copy("demo"))); return screenRegion(copy("title"), {}, content); }
    if (busy) content.append(el("p", { role: "status" }, copy("loading")));
    if (error) content.append(el("p", { role: "alert" }, copy(error)));
    if (message) content.append(el("p", { role: "status" }, copy(message)));
    content.append(control("retry", () => { void load(true); }, !!busy));
    if (!status) return screenRegion(copy("title"), {}, content);
    const numeric = (value: number | null) => value === null ? "—" : value.toLocaleString(getLocale());
    content.append(metricRow([
      { label: copy("plan"), value: status.plan === "pro" ? "Pro" : "Free" },
      { label: copy("agents"), value: `${numeric(status.registeredAgentCount ?? agents().length)} / ${status.agentLimit === null ? copy("unlimited") : "2"}` },
      { label: copy("available"), value: numeric(status.credits.available) },
      { label: copy("reserved"), value: numeric(status.credits.reserved) },
      { label: copy("debt"), value: numeric(status.credits.debt) },
    ]));
    if (status.periodEnd) content.append(el("p", {}, `${copy("period")}: ${date(status.periodEnd)}`));
    if (status.cancelAtPeriodEnd) content.append(el("p", {}, copy("cancelScheduled")));
    else if (status.nextRenewal) content.append(el("p", {}, `${copy("nextRenewal")}: ${date(status.nextRenewal)}`));
    content.append(el("p", {}, copy("creditsHint")));
    if (status.enabled && status.plan === "free") {
      content.append(el("p", {}, copy("freeHint")), agentPicker(copy("agents"), agents(), selectedIds ?? [], 2, id => {
        selectedIds = (selectedIds ?? []).includes(id) ? selectedIds!.filter(value => value !== id) : [...selectedIds ?? [], id]; changed();
      }, options.writeLocked()), control("saveAgents", () => { void saveAgents(); }, !canWrite() || !validFreeAgentSelection(selectedIds ?? [], agents())));
    }
    content.append(pricingRegion());
    if (status.enabled && status.configured) content.append(control("portal", () => { void portal(); }, !canWrite()));
    if (status.referral.code) content.append(el("p", {}, `${copy("referral")}: ${status.referral.code}`));
    if (status.referral.attributed) content.append(el("p", {}, copy("referralAttributed")));
    if (status.referral.rewarded) content.append(el("p", {}, copy("referralRewarded")));
    const history = el("details", { class: "rf-billing-history", open: ledgerOpen }, el("summary", { "data-billing-focus": "history" }, copy("history")));
    history.addEventListener("toggle", () => { if (!history.isConnected) return; ledgerOpen = history.open; if (history.open && ledger === null && !ledgerError && !busy) void loadLedger(); });
    if (ledgerError) history.append(el("p", { role: "alert" }, copy("failed")), control("retry", () => { void loadLedger(); }, !!busy));
    if (ledger) history.append(ledger.length ? el("ul", {}, ...ledger.map(row => el("li", {}, `${date(row.createdAt)} · ${copy("entry")}: ${entryLabel(row.kind)} · ${copy("amount")}: ${typeof row.amount === "number" && Number.isSafeInteger(row.amount) ? row.amount.toLocaleString(getLocale()) : "—"}`))) : el("p", {}, copy("emptyHistory")));
    if (ledgerCursor && !ledgerError) history.append(control("loadMore", () => { void loadLedger(); }, !!busy));
    content.append(history, jevRegion());
    return screenRegion(copy("title"), {}, content);
  }
  function entryLabel(kind: unknown): string {
    // Ledger provider identifiers and arbitrary source strings stay out of product copy.
    const labels: Record<string, BillingCopyKey> = { grant: "ledger_grant", reserve: "ledger_reserve", commit: "ledger_commit", return: "ledger_return", expire: "ledger_expire", adjust: "ledger_adjust", reverse: "ledger_revoke", revoke: "ledger_revoke" };
    return copy(typeof kind === "string" ? labels[kind] ?? "entry" : "entry");
  }
  function jevRegion(): HTMLElement {
    const section = el("div", { class: "rf-billing-jev", "data-jev": "true" }, el("h3", {}, copy("jev")), el("p", {}, copy("jevHint")));
    const locked = !!busy || !!decisionId || options.writeLocked();
    const select = el("select", { class: "rf-set-input", disabled: locked, "data-billing-focus": "quest" }, el("option", { value: "" }, copy("quest")));
    for (const quest of quests()) select.append(el("option", { value: quest.id, selected: quest.id === questId }, quest.title));
    select.addEventListener("change", () => { questId = select.value; resetQuote(); });
    section.append(field(copy("quest"), select));
    if (!quests().length) section.append(el("p", {}, copy("noQuest")));
    section.append(agentPicker(copy("candidates"), candidates(), candidateIds, 254, id => {
      candidateIds = candidateIds.includes(id) ? candidateIds.filter(value => value !== id) : [...candidateIds, id]; resetQuote();
    }, locked));
    if (!candidates().length) section.append(el("p", {}, copy("noAgents")));
    const quest = selectedQuest();
    if (quest) {
      const preview = el("details", {}, el("summary", {}, copy("payload")), el("p", {}, contextText(quest.title, 500)), el("p", {}, contextText(quest.completionCriteria, 1500)), el("p", {}, contextText(quest.nextAction, 1500)), el("p", {}, `${quest.lifecycleState} · ${quest.planningState}`), el("ul", {}, ...candidates().filter(agent => candidateIds.includes(agent.agentId)).map(agent => el("li", {}, `${agent.displayName} · ${contextText(agent.role, 120)}`))));
      preview.open = true;
      section.append(preview);
    }
    const check = el("input", { type: "checkbox", checked: consent, disabled: locked, "data-billing-focus": "consent" });
    check.addEventListener("change", () => { consent = check.checked; changed(); });
    section.append(el("label", { class: "rf-billing-check" }, check, el("span", {}, copy("consent"))));
    section.append(control("estimate", () => { void estimate(); }, !canWrite() || !quest || !consent || !allowedCandidates() || !!decisionId));
    if (quote) section.append(el("p", { role: "status" }, `${copy("quote")}: ${quote.credits.toLocaleString(getLocale())}`));
    section.append(control("execute", () => { void execute(); }, !canWrite() || !consent || !quoteCurrent() || !!decisionId));
    if (decisionId) {
      const state = billingString(decision?.status);
      const result = suggestion();
      const actionKey: Record<string, BillingCopyKey> = { continue: "action_continue", ask_human: "action_ask_human", review: "action_review", wait: "action_wait" };
      section.append(el("p", { role: "status" }, copy(result ? "result" : ["pending", "running", "reserved", "uncertain", "reconcile_required"].includes(state) || !decision ? "pending" : "manual")), el("p", {}, `${copy("version")}: ${date(decisionVersion)}`));
      if (result) section.append(el("p", {}, `${result.agent.displayName} · ${copy("action")}: ${copy(actionKey[result.action]!)} · ${copy("confidence")}: ${Math.round(result.confidence * 100)}%`));
      section.append(control("refresh", () => { void checkResult(); }, !canWrite()), control("apply", () => { void apply(); }, !canWrite() || !result || !quest || quest.updatedAt !== decisionVersion || applied));
      if (decision && ["suggestion", "manual", "error"].includes(state) || applied) section.append(control("cancel", () => {
        decisionId = ""; decisionVersion = ""; decision = null; decisionCandidateIds = []; applied = false; quote = null; consent = false; changed();
      }, !canWrite()));
    }
    return section;
  }
  return { enter: () => { void load(); }, retry: () => { void load(true); }, render: billingRegion };
}

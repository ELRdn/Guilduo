/**
 * Plan and Credits in All for ADHD's own layout (Penpot page 17): the plan,
 * the Agents Free uses, going Pro, and Credits, with Jev and the history as
 * child pages. State and every guarded request stay in Relay Forge's billing UI.
 */

import { createElement, ChevronRight, ChevronDown, type IconNode } from "lucide";
import { getLocale } from "../../i18n.ts";
import { el } from "../relay-forge/primitives/dom.ts";
import { billingText as copy } from "../relay-forge/billing-copy.ts";
import { formatBillingMoney, type BillingPrice } from "../relay-forge/screens/settings-model.ts";
import type { createBillingUi } from "../relay-forge/screens/billing.ts";
import { tx } from "./copy.ts";

type BillingApi = ReturnType<typeof createBillingUi>["api"];
type Page = "plan" | "jev" | "history";

const glyph = (icon: IconNode) => createElement(icon, { width: 18, height: 18, "stroke-width": 1.75, "aria-hidden": "true" });
const number = (value: number) => value.toLocaleString(getLocale());
const day = (value: string | null | undefined) => {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleDateString(getLocale(), { dateStyle: "long" }) : "—";
};
const price = (value: BillingPrice) => formatBillingMoney(value.amount, value.currency, getLocale());

function action(label: string, key: string, run: () => void, disabled: boolean, kind: "primary" | "secondary" | "link" = "secondary"): HTMLButtonElement {
  const node = el("button", { type: "button", class: kind === "primary" ? "a4-button a4-primary" : kind === "link" ? "a4-link" : "a4-button", disabled, "data-billing-action": key, "data-billing-focus": key }, label);
  node.addEventListener("click", run);
  return node;
}
function check(label: string, checked: boolean, disabled: boolean, focus: string, change: (on: boolean) => void, muted = false): HTMLElement {
  const input = el("input", { type: "checkbox", checked, disabled, "data-billing-focus": focus });
  input.addEventListener("change", () => change(input.checked));
  return el("label", { class: "a4-bill-check", "data-muted": String(muted) }, input, el("span", {}, label));
}
function fold(summary: string, focus: string, ...body: (HTMLElement | null)[]): HTMLElement {
  return el("details", { class: "a4-bill-fold" }, el("summary", { "data-billing-focus": focus }, summary, glyph(ChevronDown)), ...body);
}
function row(label: string, hint: string, open: () => void): HTMLElement {
  const node = el("button", { type: "button", class: "a4-set-row" }, el("span", { class: "a4-set-copy" }, el("strong", {}, label), hint ? el("small", {}, hint) : null), glyph(ChevronRight));
  node.addEventListener("click", open);
  return node;
}

export function billingView(api: BillingApi, rerender: () => void, say: (message: string) => void) {
  let page: Page = "plan";
  let interval: "month" | "year" = "year";
  const go = (next: Page) => {
    page = next;
    if (next === "history" && api.ledger() === null && !api.ledgerError()) void api.loadLedger();
    rerender();
    document.querySelector<HTMLElement>(".a4-bill-page h1")?.focus();
  };

  function notices(): HTMLElement[] {
    const out: HTMLElement[] = [];
    const busy = api.busy();
    if (busy === "load" && !api.status()) out.push(el("p", { class: "a4-meta", role: "status" }, tx("読み込んでいます")));
    const error = api.error();
    if (error) {
      out.push(el("div", { class: "a4-bill-alert", role: "alert" }, el("span", {}, copy(error)),
        // Retry is offered only after a failure.
        page === "plan" ? action(tx("もう一度"), "retry", () => retry(), busy !== "", "link") : null));
    }
    const message = api.message();
    if (message) out.push(el("p", { class: "a4-meta", role: "status" }, copy(message)));
    return out;
  }
  let retry = () => {};


  function planCard(): HTMLElement {
    const status = api.status()!;
    const pro = status.plan === "pro";
    const credits = status.credits;
    const card = el("section", { class: "a4-bill-card" },
      el("div", { class: "a4-bill-plan" }, el("strong", {}, pro ? "Pro" : "Free"),
        el("span", { class: "a4-bill-chip" }, status.agentLimit === null ? tx("Agent 無制限") : tx("使えるAgent {count}体まで", { count: status.agentLimit }))),
      el("p", { class: "a4-bill-credits" }, tx("残りのCredits"), el("strong", {}, credits.available === null ? "—" : number(credits.available))),
      // Reserved and pending adjustment only appear when they hold something.
      credits.reserved ? el("p", { class: "a4-meta" }, `${tx("予約中")} ${number(credits.reserved)}`) : null,
      credits.debt ? el("p", { class: "a4-meta" }, `${tx("調整待ち")} ${number(credits.debt)}`) : null);
    if (pro) {
      card.append(el("p", { class: "a4-meta" }, status.cancelAtPeriodEnd ? copy("cancelScheduled") : `${tx("次回の更新")} ${day(status.nextRenewal ?? status.periodEnd)}`));
      if (status.enabled && status.configured) card.append(action(copy("portal"), "portal", () => { void api.portal(); }, !api.canWrite()));
    } else card.append(el("p", { class: "a4-meta" }, tx("通常のMCP・タスク・受け渡しの操作は0 Credits。自動で追加請求はされません。")));
    return card;
  }

  function freeAgents(): HTMLElement | null {
    const status = api.status()!;
    const agents = api.agents();
    if (!status.enabled || status.plan !== "free" || agents.length <= 2) return null;
    const ids = api.selectedIds();
    const saved = status.selectedAgentIds;
    const dirty = ids.length !== saved.length || ids.some(id => !saved.includes(id));
    return el("section", { class: "a4-bill-section" },
      el("h2", { class: "a4-subtitle a4-bill-head" }, tx("Freeで使うAgent"), el("span", { class: "a4-meta" }, `${ids.length} / 2`)),
      el("p", { class: "a4-meta" }, tx("登録している{count}体のうち2体を選びます。選ばなかったAgentも消えません。", { count: agents.length })),
      el("div", { class: "a4-bill-list" }, ...agents.map((agent, index) => {
        const on = ids.includes(agent.agentId);
        const full = !on && ids.length >= 2;
        return check(agent.displayName, on, api.busy() !== "" || full, `free-${index}`, () => api.toggleFree(agent.agentId), full);
      })),
      dirty ? action(tx("保存"), "saveAgents", () => { void api.saveAgents(); }, !api.canWrite() || !api.validFree(), "primary") : null);
  }

  function terms(): HTMLElement {
    const pricing = api.status()!.pricing;
    const discounts = [["launchDiscount", pricing.launchDiscount], ["referralDiscount", pricing.referralDiscount]] as const;
    return fold(tx("返金・紹介を含む販売条件をすべて見る"), "terms",
      el("ul", { class: "a4-bill-terms" },
        ...[copy("creditsCadence"), `${copy("creditExpiryFromGrant")}: ${number(pricing.creditLifetimeDays!)} ${copy("days")}`,
          `${copy("jev")}: ${number(pricing.decisionCredits!)} Credits`, copy("refundPolicy"),
          `${copy("referralReward")}: ${number(pricing.referralCredits!)}`, copy("referralRules"),
          pricing.automaticTax ? copy("autoTax") : "",
          ...discounts.flatMap(([key, discount]) => discount ? [`${copy(key)}: ${discount.percentOff !== null ? `${number(discount.percentOff)}%` : formatBillingMoney(discount.amountOff!, discount.currency, getLocale())} · ${copy("redeemUntil")}: ${discount.redeemBy ? day(discount.redeemBy) : copy("noEnd")}`] : []),
          pricing.launchDiscount || pricing.referralDiscount ? copy("discountPriority") : copy("noDiscount"),
        ].filter(Boolean).map(line => el("li", {}, line))));
  }

  function goPro(): HTMLElement | null {
    const status = api.status()!;
    if (status.plan === "pro") return null;
    const pricing = status.pricing;
    const section = el("section", { class: "a4-bill-section", "data-billing-pricing": "true" }, el("h2", { class: "a4-subtitle" }, tx("Proにする")));
    if (!pricing.complete) { section.append(el("p", { class: "a4-meta" }, copy("salesPending"))); return section; }
    const attempt = api.purchaseAttempt();
    if (attempt) interval = attempt.interval;
    const choices = el("div", { class: "a4-bill-choices", role: "radiogroup", "aria-label": tx("支払いの周期") });
    for (const option of [pricing.month!, pricing.year!]) {
      const key = option.interval === "month" ? "month" : "year";
      const card = el("button", { type: "button", class: "a4-bill-choice", role: "radio", "aria-checked": String(interval === key), disabled: !!attempt, "data-billing-focus": `interval-${key}` },
        el("span", { class: "a4-meta" }, copy(key === "month" ? "monthly" : "yearly")), el("strong", {}, price(option)),
        el("span", { class: "a4-meta" }, tx("毎月 {count} Credits", { count: number(option.creditsPerMonth) })));
      card.addEventListener("click", () => { interval = key; api.setPurchaseConsent(false); });
      choices.append(card);
    }
    section.append(choices,
      el("ul", { class: "a4-bill-points" }, ...[copy("autoRenew"), copy("cancelPolicy"),
        tx("年払いも毎月の付与で、各付与日から{days}日有効です。", { days: number(pricing.creditLifetimeDays!) }),
        pricing.taxBehavior === "inclusive" ? tx("税込です。") : tx("税別です。")].map(line => el("li", {}, line))),
      terms());
    if (status.mode === "test") section.append(el("p", { class: "a4-meta" }, copy("testMode")));
    if (!api.purchasable()) { section.append(el("p", { class: "a4-meta" }, tx("今は購入できません。"))); return section; }
    const referral = el("input", { class: "a4-input", type: "text", value: api.referralCode(), maxlength: 200, autocomplete: "off", "aria-label": copy("referralInput"), "data-billing-focus": "referral", disabled: api.busy() !== "" || !!attempt || status.referral.attributed });
    const consent = check(copy("checkoutConsent"), api.purchaseConsent(), api.busy() !== "", "purchase-consent", on => api.setPurchaseConsent(on));
    const buy = attempt
      ? action(copy("checkoutRetry"), "checkoutRetry", () => { void api.checkout(attempt.interval); }, !api.canWrite() || !api.purchaseConsent(), "primary")
      : action(interval === "month" ? tx("月払いでProにする") : tx("年払いでProにする"), interval === "month" ? "monthly" : "yearly", () => { void api.checkout(interval); }, !api.canWrite() || !api.purchaseConsent(), "primary");
    referral.addEventListener("input", () => {
      api.setReferral(referral.value);
      // A changed code clears the consent on screen at once.
      consent.querySelector("input")!.checked = false; buy.disabled = true;
    });
    section.append(...[
      status.referral.attributed ? el("p", { class: "a4-meta" }, copy("referralAttributed")) : fold(tx("紹介コードを入力"), "referral-fold", referral),
      attempt ? el("p", { class: "a4-meta", role: "status" }, copy("checkoutUncertain")) : null,
      consent, buy, el("p", { class: "a4-meta" }, tx("このあとStripeの支払い画面に進みます。"))].filter(node => node !== null));
    return section;
  }

  function creditsSection(): HTMLElement {
    const status = api.status()!;
    const code = status.referral.code;
    let codeRow: HTMLElement | null = null;
    if (code) {
      const copyButton = action(tx("コピー"), "copy-referral", () => {
        void navigator.clipboard?.writeText(code).then(() => say(tx("コピーしました")), () => say(tx("コピーできませんでした")));
      }, false, "link");
      codeRow = el("div", { class: "a4-set-row" }, el("span", { class: "a4-set-copy" }, el("strong", {}, tx("自分の紹介コード")), el("small", {}, code)), copyButton);
    }
    const credits = status.pricing.decisionCredits;
    return el("section", { class: "a4-bill-section" }, el("h2", { class: "a4-subtitle" }, "Credits"),
      el("div", { class: "a4-set-group" },
        row(tx("Creditsの履歴"), "", () => go("history")),
        row(copy("jev"), credits === null ? tx("担当Agentと次の行動を提案します。") : tx("担当Agentと次の行動を提案します。{count} Credits", { count: number(credits) }), () => go("jev")),
        codeRow,
        status.referral.rewarded ? el("p", { class: "a4-meta" }, copy("referralRewarded")) : null));
  }

  function jevPage(): (HTMLElement | null)[] {
    const locked = api.busy() !== "" || !!api.decisionId();
    const quests = api.quests();
    const candidates = api.candidates();
    const select = el("select", { class: "a4-input", disabled: locked, "data-billing-focus": "quest", "aria-label": tx("対象のタスク") }, el("option", { value: "" }, tx("選んでください")));
    for (const quest of quests) select.append(el("option", { value: quest.id, selected: quest.id === api.questId() }, quest.title));
    select.addEventListener("change", () => api.setQuest(select.value));
    const quest = quests.find(item => item.id === api.questId());
    const chosen = candidates.filter(agent => api.candidateIds().includes(agent.agentId));
    const credits = api.status()?.pricing.decisionCredits ?? null;
    const out: (HTMLElement | null)[] = [
      el("label", { class: "a4-field-row" }, el("span", { class: "a4-step-label" }, tx("対象のタスク")), select),
      quests.length ? null : el("p", { class: "a4-meta" }, tx("提案を受けられるタスクがありません。")),
      el("div", { class: "a4-bill-section" }, el("span", { class: "a4-step-label" }, tx("候補のAgent")),
        candidates.length ? el("div", { class: "a4-bill-list" }, ...candidates.map((agent, index) =>
          check(agent.displayName, api.candidateIds().includes(agent.agentId), locked, `jev-${index}`, () => api.toggleCandidate(agent.agentId))))
          : el("p", { class: "a4-meta" }, copy("noAgents"))),
      quest ? fold(tx("送る内容を見る"), "payload", el("div", { class: "a4-bill-payload" },
        ...[api.contextText(quest.title, 500), api.contextText(quest.completionCriteria, 1500), api.contextText(quest.nextAction, 1500)].filter(Boolean).map(text => el("p", {}, text)),
        chosen.length ? el("ul", {}, ...chosen.map(agent => el("li", {}, `${agent.displayName} · ${api.contextText(agent.role, 120)}`))) : null)) : null,
      check(tx("表示したタスクの最小テキストと候補Agent情報をTypeSafeへ送信することに同意します。"), api.consent(), locked, "consent", on => api.setConsent(on)),
    ];
    if (!api.decisionId()) {
      // One button: the estimate is checked first, then the request goes out on the same consent.
      out.push(action(credits === null ? tx("提案を受ける") : tx("{count} Creditsで提案を受ける", { count: number(credits) }), "request", () => {
        void (async () => { if (!api.quoteCurrent()) await api.estimate(); if (api.quoteCurrent()) await api.execute(); })();
      }, !api.canWrite() || !quest || !api.consent() || !api.allowedCandidates(), "primary"));
      return out;
    }
    const state = api.decisionState();
    const result = api.suggestion();
    const actions: Record<string, string> = { continue: copy("action_continue"), ask_human: copy("action_ask_human"), review: copy("action_review"), wait: copy("action_wait") };
    out.push(el("div", { class: "a4-bill-card", role: "status" },
      el("p", {}, copy(result ? "result" : ["pending", "running", "reserved", "uncertain", "reconcile_required"].includes(state) || !api.hasDecision() ? "pending" : "manual")),
      result ? el("p", { class: "a4-bill-result" }, el("strong", {}, result.agent.displayName), ` · ${copy("action")}: ${actions[result.action]} · ${copy("confidence")}: ${Math.round(result.confidence * 100)}%`) : null,
      el("div", { class: "a4-actions" },
        result ? action(copy("apply"), "apply", () => { void api.apply(); }, !api.canWrite() || !quest || quest.updatedAt !== api.decisionVersion() || api.applied(), "primary") : null,
        action(copy("refresh"), "refresh", () => { void api.checkResult(); }, !api.canWrite()),
        api.hasDecision() && ["suggestion", "manual", "error"].includes(state) || api.applied() ? action(tx("やり直す"), "cancel", api.clearDecision, !api.canWrite(), "link") : null)));
    return out;
  }

  function historyPage(): HTMLElement[] {
    const ledger = api.ledger();
    const out: HTMLElement[] = [];
    if (api.ledgerError()) out.push(el("div", { class: "a4-bill-alert", role: "alert" }, el("span", {}, copy("failed")), action(tx("もう一度"), "retry", () => { void api.loadLedger(); }, api.busy() !== "", "link")));
    if (ledger === null) { if (!api.ledgerError()) out.push(el("p", { class: "a4-meta", role: "status" }, tx("読み込んでいます"))); return out; }
    if (!ledger.length) out.push(el("p", { class: "a4-meta" }, tx("まだ履歴はありません。")));
    else out.push(el("div", { class: "a4-set-group" }, ...ledger.map(entry => el("div", { class: "a4-set-row" },
      el("span", { class: "a4-set-copy" }, el("strong", {}, api.entryLabel(entry.kind)), el("small", {}, day(typeof entry.createdAt === "string" ? entry.createdAt : ""))),
      el("span", { class: "a4-bill-amount" }, typeof entry.amount === "number" && Number.isSafeInteger(entry.amount) ? `${entry.amount > 0 ? "+" : ""}${number(entry.amount)}` : "—")))));
    if (api.ledgerMore()) out.push(action(copy("loadMore"), "loadMore", () => { void api.loadLedger(); }, api.busy() !== "", "link"));
    return out;
  }

  /** The whole screen, child pages included; `backToSettings` is the parent's back link. */
  function render(backToSettings: HTMLElement, reload: () => void): HTMLElement {
    retry = reload;
    const status = api.status();
    const titles: Record<Page, string> = { plan: tx("利用プラン"), jev: copy("jev"), history: tx("Creditsの履歴") };
    const back = page === "plan" ? backToSettings : action(tx("← 利用プラン"), "back", () => go("plan"), false, "link");
    const lead = page === "jev" ? el("p", { class: "a4-lead" }, tx("担当Agentと次の行動の提案です。自動で担当を変更したり、タスクを完了したりしません。")) : null;
    const body: (HTMLElement | null)[] = page === "jev" ? jevPage() : page === "history" ? historyPage()
      : status ? [planCard(), freeAgents(), goPro(), creditsSection()] : [];
    return el("section", { class: "a4-view a4-wide a4-set-page a4-bill-page", "data-billing": "true", "aria-busy": String(api.busy() !== "") }, back,
      el("h1", { class: "a4-title", tabindex: -1 }, titles[page]), lead, ...notices(), ...body);
  }

  return { render, reset: () => { page = "plan"; } };
}

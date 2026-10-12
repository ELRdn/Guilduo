import type { BillingPricing } from "../../worker/src/billing-store.ts";

/** Synthetic contract fixture only. These amounts are not proposed or approved product prices. */
export function billingPricingFixture(): BillingPricing {
  const monthly = { priceId: "price_fixtureMonth", amount: 1234, interval: "month" as const, intervalCount: 1, taxBehavior: "exclusive", creditsPerMonth: 37 };
  const annual = { priceId: "price_fixtureYear", amount: 12345, interval: "year" as const, intervalCount: 1, taxBehavior: "exclusive", creditsPerMonth: 41 };
  return {
    approved: true, currency: "usd", month: { ...monthly, currency: "usd" }, year: { ...annual, currency: "usd" }, monthly, annual, terms: [],
    launchDiscount: { couponId: "fixtureLaunch", percentOff: 25, amountOff: null, currency: null, duration: "repeating", durationMonths: 3, redeemBy: "2099-01-01T00:00:00.000Z" },
    referralDiscount: { couponId: "fixtureReferral", percentOff: null, amountOff: 222, currency: "usd", duration: "once", durationMonths: null, redeemBy: null },
    creditLifetimeDays: 90, decisionCredits: 3, referralCredits: 17,
    refundPolicy: "revoke_invoice_benefits", taxBehavior: "exclusive", automaticTax: true, autoTopUp: false,
  };
}

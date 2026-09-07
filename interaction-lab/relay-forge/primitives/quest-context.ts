import type { SelectedQuestView } from "../model.ts";
import { relayText as t } from "../relay-copy.ts";
import { el } from "./dom.ts";

/** Text and an external link only. Opening the link never records confirmation. */
export function questContext(view: SelectedQuestView): HTMLElement | null {
  const review = view.externalReview;
  if (!review) return null;
  let link: HTMLElement | null = null;
  try {
    const url = new URL(review.url);
    if (url.protocol === "https:" && !url.username && !url.password) {
      link = el("a", { href: url.href, target: "_blank", rel: "noopener noreferrer", class: "rf-human-external" }, t("external"), " ↗");
    }
  } catch { /* An external URL is optional, including for physical-device checks. */ }
  return el("section", { class: "rf-quest-context", "aria-label": t("target") },
    el("p", { title: view.requester ? `${view.requester.type}: ${view.requester.id}` : "" }, `${t("from")}: ${view.requester?.label || t("unknown")}`),
    el("h3", { class: "rf-region-label" }, t("target")),
    review.note ? el("p", { class: "rf-human-request-text" }, review.note) : null,
    review.criteria ? el("p", { class: "rf-human-request-text" }, `${t("criteria")}: ${review.criteria}`) : null,
    link, el("p", { class: "rf-human-request-separate" }, t("hint")));
}

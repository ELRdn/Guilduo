import { el } from "./dom.ts";
import { relayText } from "../relay-copy.ts";

export function externalCheck(checked: boolean, disabled: boolean, onChange?: (value: boolean) => void): HTMLElement {
  const input = el("input", { type: "checkbox", disabled });
  input.checked = checked;
  input.addEventListener("change", () => onChange?.(input.checked));
  return el("label", { class: "rf-external-check rf-human-request-check" }, input, relayText("checked"));
}

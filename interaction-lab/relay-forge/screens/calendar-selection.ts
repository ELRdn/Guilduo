import { clockTime, snapTimeRange } from "../../../shared/productivity.ts";
import { el } from "../primitives/dom.ts";

export function calendarSelection(axis: HTMLElement, options: { label: string; busy: (active: boolean) => void; select: (from: number, to: number) => void }): () => void {
  let anchor = 540, cursor = 555, active = false, waiting = false, hold: number | null = null, touchY = 0, pointerId: number | null = null;
  const preview = el("div", { class: "rf-work-range-preview", "aria-hidden": "true" });
  axis.tabIndex = 0; axis.setAttribute("role", "region"); axis.setAttribute("aria-label", options.label);
  const minute = (y: number) => Math.max(0, Math.min(1440, (y - axis.getBoundingClientRect().top) / axis.getBoundingClientRect().height * 1440));
  const blocked = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("button, input, select, a"));
  function draw(): void { const range = snapTimeRange(anchor, cursor); preview.style.top = `${range.from / 1440 * 100}%`; preview.style.height = `${(range.to - range.from) / 1440 * 100}%`; preview.textContent = `${clockTime(range.from)} — ${clockTime(range.to)}`; if (!preview.isConnected) axis.append(preview); axis.setAttribute("aria-label", `${options.label}: ${preview.textContent}`); }
  function cancel(): void {
    if (hold !== null) window.clearTimeout(hold); hold = null;
    const captured = pointerId; pointerId = null; active = false; waiting = false;
    if (captured !== null && axis.hasPointerCapture(captured)) axis.releasePointerCapture(captured);
    preview.remove(); axis.setAttribute("aria-label", options.label); options.busy(false);
  }
  function finish(): void { if (!active) { cancel(); return; } const range = snapTimeRange(anchor, cursor); cancel(); options.select(range.from, range.to); }
  const down = (event: PointerEvent) => { if (event.pointerType === "touch" || event.button !== 0 || blocked(event.target)) return; event.preventDefault(); anchor = Math.min(1425, Math.floor(minute(event.clientY) / 15) * 15); cursor = anchor + 15; active = true; pointerId = event.pointerId; axis.setPointerCapture(event.pointerId); options.busy(true); axis.focus({ preventScroll: true }); draw(); };
  const move = (event: PointerEvent) => { if (!active || event.pointerId !== pointerId) return; event.preventDefault(); cursor = minute(event.clientY); draw(); };
  const up = (event: PointerEvent) => { if (event.pointerId === pointerId) finish(); };
  const touchStart = (event: TouchEvent) => { if (event.touches.length !== 1 || blocked(event.target)) return; waiting = true; touchY = event.touches[0]!.clientY; anchor = Math.min(1425, Math.floor(minute(touchY) / 15) * 15); cursor = anchor + 15; options.busy(true); hold = window.setTimeout(() => { if (!waiting) return; active = true; waiting = false; draw(); }, 400); };
  const touchMove = (event: TouchEvent) => { if (event.touches.length !== 1) { cancel(); return; } const y = event.touches[0]!.clientY; if (waiting && Math.abs(y - touchY) > 8) { cancel(); return; } if (active && pointerId === null) { event.preventDefault(); cursor = minute(y); draw(); } };
  const touchEnd = () => { if (active && pointerId === null) finish(); else if (waiting) cancel(); };
  const key = (event: KeyboardEvent) => {
    if (event.target !== axis) return;
    if (event.key === "Escape") { event.preventDefault(); cancel(); return; }
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (!active) { active = true; draw(); } finish(); return; }
    if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault(); const direction = event.key === "ArrowDown" ? 15 : -15;
    if (event.shiftKey) cursor = Math.max(0, Math.min(1440, cursor + direction)); else { anchor = Math.max(0, Math.min(1425, anchor + direction)); cursor = anchor + 15; }
    active = true; options.busy(true); draw();
  };
  axis.addEventListener("pointerdown", down); axis.addEventListener("pointermove", move); axis.addEventListener("pointerup", up);
  axis.addEventListener("pointercancel", cancel); axis.addEventListener("lostpointercapture", cancel);
  axis.addEventListener("touchstart", touchStart, { passive: true }); axis.addEventListener("touchmove", touchMove, { passive: false }); axis.addEventListener("touchend", touchEnd); axis.addEventListener("touchcancel", cancel); axis.addEventListener("keydown", key);
  return () => { cancel(); axis.removeEventListener("pointerdown", down); axis.removeEventListener("pointermove", move); axis.removeEventListener("pointerup", up); axis.removeEventListener("pointercancel", cancel); axis.removeEventListener("lostpointercapture", cancel); axis.removeEventListener("touchstart", touchStart); axis.removeEventListener("touchmove", touchMove); axis.removeEventListener("touchend", touchEnd); axis.removeEventListener("touchcancel", cancel); axis.removeEventListener("keydown", key); };
}

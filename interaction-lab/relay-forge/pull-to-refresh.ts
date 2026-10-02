import { relayText } from "./relay-copy.ts";

/** Read-only refresh: never reload the document or replay a write. */
export function mountPullToRefresh(root: HTMLElement, options: { canRefresh:() => boolean; refresh:() => Promise<void> }): () => void {
  const notice = document.createElement("div");
  notice.className = "rf-pull-refresh";
  notice.setAttribute("role", "status");
  notice.hidden = true;
  root.append(notice);
  let start: { x:number; y:number } | null = null;
  let armed = false;
  let busy = false;
  let disposed = false;
  const cancel = () => { start = null; armed = false; if (!busy) notice.hidden = true; };
  const begin = (event: TouchEvent) => {
    cancel();
    if (busy || event.touches.length !== 1 || !options.canRefresh() || window.scrollY > 1) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('input, textarea, select, button, a, dialog, [contenteditable="true"], .rf-nav, .rf-n-canvas')) return;
    for (let node: Element | null = target; node && root.contains(node); node = node.parentElement) {
      if (node.scrollTop > 1 || node.scrollLeft > 1) return;
    }
    start = { x:event.touches[0]!.clientX, y:event.touches[0]!.clientY };
  };
  const move = (event: TouchEvent) => {
    if (!start) return;
    if (event.touches.length !== 1 || !options.canRefresh()) { cancel(); return; }
    const x = event.touches[0]!.clientX - start.x;
    const y = event.touches[0]!.clientY - start.y;
    if (y < -8 || Math.abs(x) > Math.max(12, y)) { cancel(); return; }
    if (y < 12) { armed = false; notice.hidden = true; return; }
    if (event.cancelable) event.preventDefault();
    armed = y >= 72;
    const text = relayText(armed ? "releaseToRefresh" : "pullToRefresh");
    if (notice.textContent !== text) notice.textContent = text;
    notice.hidden = false;
  };
  const finish = () => {
    const run = start !== null && armed && options.canRefresh();
    cancel();
    if (!run || busy) return;
    busy = true;
    notice.textContent = relayText("statusLoading");
    notice.hidden = false;
    void options.refresh().finally(() => { busy = false; if (!disposed) notice.hidden = true; });
  };
  root.addEventListener("touchstart", begin, { passive:true });
  root.addEventListener("touchmove", move, { passive:false });
  root.addEventListener("touchend", finish);
  root.addEventListener("touchcancel", cancel);
  return () => {
    disposed = true;
    root.removeEventListener("touchstart", begin);
    root.removeEventListener("touchmove", move);
    root.removeEventListener("touchend", finish);
    root.removeEventListener("touchcancel", cancel);
    notice.remove();
  };
}

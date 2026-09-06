const root = document.documentElement;
const en = root.lang === "en";
const toggle = document.querySelector<HTMLButtonElement>("[data-motion-toggle]");
const stage = document.querySelector<HTMLElement>("[data-relay-stage]");
const experience = document.querySelector<HTMLElement>("#experience");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const storageKey = "guilduo-lpv21-motion";
const active = new Map<Animation, boolean>(); // true = hero-only animation
let preferred = true;
let enabled = false;
let heroVisible = true;
try { preferred = localStorage.getItem(storageKey) !== "off"; } catch { /* In-memory control still works. */ }

function syncPlayback(): void {
  root.dataset.pageHidden = String(document.hidden);
  for (const [animation, heroOnly] of active) {
    if (document.hidden || !enabled || (heroOnly && !heroVisible)) animation.pause();
    else animation.play();
  }
}

function animate(node: Element | null, frames: Keyframe[], timing: KeyframeAnimationOptions, heroOnly = false): void {
  if (!node || !enabled || document.hidden) return;
  const animation = node.animate(frames, { easing: "cubic-bezier(.22,.68,0,1)", ...timing });
  active.set(animation, heroOnly);
  animation.finished.then(() => active.delete(animation), () => active.delete(animation));
  if (heroOnly && !heroVisible) animation.pause();
}

function startRelay(): void {
  if (!stage) return;
  for (const [direction, delay] of [["out", 0], ["back", 2800]] as const) {
    const path = stage.querySelector<SVGPathElement>('[data-route="' + direction + '"]');
    const token = stage.querySelector('[data-relay-token="' + direction + '"]');
    if (!path || !token) continue;
    const length = path.getTotalLength();
    const frames: Keyframe[] = [];
    for (let step = 0; step <= 40; step++) {
      const point = path.getPointAtLength(length * step / 40);
      frames.push({ offset: step / 40 * .4, transform: `translate(${point.x}px, ${point.y}px)`, opacity: step === 0 || step === 40 ? 0 : 1 });
    }
    frames.push({ offset: 1, opacity: 0 });
    animate(token, frames, { duration: 5600, delay, iterations: Infinity, easing: "linear" }, true);
  }
}

function applyPreference(): void {
  enabled = preferred && !reduced.matches;
  root.dataset.motion = enabled ? "on" : "off";
  for (const animation of active.keys()) animation.cancel();
  active.clear();
  if (toggle) {
    toggle.hidden = false;
    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.disabled = reduced.matches;
    toggle.title = reduced.matches
      ? (en ? "Your system prefers reduced motion." : "端末の設定に合わせて動きを抑えています。")
      : (en ? "Turn motion effects on or off" : "モーション演出のオン・オフ");
    const label = toggle.querySelector("[data-motion-label]");
    if (label) label.textContent = en ? (enabled ? "Motion on" : "Motion off") : (enabled ? "動き ON" : "動き OFF");
  }
  if (enabled) startRelay();
  syncPlayback();
}

toggle?.addEventListener("click", () => {
  preferred = !preferred;
  try { localStorage.setItem(storageKey, preferred ? "on" : "off"); } catch { /* Optional persistence. */ }
  applyPreference();
});
reduced.addEventListener("change", applyPreference);
document.addEventListener("visibilitychange", syncPlayback);
applyPreference();

// Animate on entry, never hide readable content while waiting for JavaScript.
const entered = new WeakSet<Element>();
function reveal(node: Element): void {
  if (entered.has(node)) return;
  entered.add(node);
  (node as HTMLElement).dataset.seen = "true";
  animate(node, [{ opacity: .25, transform: "translateY(20px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 520 });
}
const revealTargets = document.querySelectorAll(".experience-heading, .relationship > div, .connection-map, .mcp-section > div:first-child, .control-section > div, .guild-symbols, .guild-section h2, .open-section > div, .final-cta h2");
const loopTargets = document.querySelectorAll<HTMLElement>(".relay-story, .connection-map, .guild-symbols");
if ("IntersectionObserver" in window) {
  const loopObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      (entry.target as HTMLElement).dataset.loopVisible = String(entry.isIntersecting);
    }
  }, { threshold: 0 });
  loopTargets.forEach(node => loopObserver.observe(node));
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      reveal(entry.target);
      observer.unobserve(entry.target);
    }
  }, { threshold: .18, rootMargin: "0px 0px -24px 0px" });
  revealTargets.forEach(node => observer.observe(node));
  if (stage) new IntersectionObserver(entries => {
    heroVisible = entries[0]?.isIntersecting ?? true;
    syncPlayback();
  }, { threshold: 0 }).observe(stage);
} else {
  loopTargets.forEach(node => { node.dataset.loopVisible = "true"; });
}

document.querySelectorAll(".hero-copy > .eyebrow, .hero-copy h1 > span, .hero-copy > .philosophy, .hero-actions").forEach((node, index) => {
  animate(node, [{ opacity: .15, transform: "translateY(18px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 640, delay: index * 85 });
});
stage?.querySelectorAll<SVGPathElement>(".relay-route").forEach(path => {
  const length = path.getTotalLength();
  animate(path, [{ strokeDasharray: `${length}`, strokeDashoffset: `${length}` }, { strokeDasharray: `${length}`, strokeDashoffset: "0" }], { duration: 1200 }, true);
});

// The existing demo owns task state; this layer only responds to its DOM state.
if (experience) {
  let previous = experience.dataset.state;
  new MutationObserver(() => {
    const state = experience.dataset.state;
    if (state === previous) return;
    previous = state;
    for (const [animation, heroOnly] of active) {
      const target = (animation.effect as KeyframeEffect | null)?.target;
      if (!heroOnly && target && experience.contains(target)) {
        animation.cancel();
        active.delete(animation);
      }
    }
    const message = experience.querySelector(".agent-message");
    animate(message, [{ opacity: .5, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 360 });
    if (state === "human_task") {
      animate(experience.querySelector(".review-quest"), [{ opacity: .2, transform: "translateY(16px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 480 });
    } else if (state === "delegated" || state === "feedback") {
      animate(experience.querySelector(state === "feedback" ? "[data-receipt]" : '[data-quest="original"]'), [{ transform: "translateX(0)" }, { transform: "translateX(7px)", offset: .35 }, { transform: "translateX(0)" }], { duration: 420 });
    } else if (state === "revised") {
      animate(experience.querySelector("[data-menu-toggle]"), [{ outline: "2px solid transparent", outlineOffset: "0px" }, { outline: "2px solid var(--color-human)", outlineOffset: "5px", offset: .4 }, { outline: "2px solid transparent", outlineOffset: "8px" }], { duration: 680 });
    } else if (state === "complete") {
      experience.querySelectorAll(".quest .status").forEach((node, index) => {
        animate(node, [{ opacity: .3, transform: "translateY(7px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 480, delay: index * 150 });
      });
    }
  }).observe(experience, { attributes: true, attributeFilter: ["data-state"] });
}

window.addEventListener("pagehide", () => {
  for (const animation of active.keys()) animation.pause();
});
window.addEventListener("pageshow", syncPlayback);

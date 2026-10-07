// Scroll-linked motion for LPv3. lpv2-1/motion.ts owns the on/off preference
// (html[data-motion]); this layer only reads it, so the header toggle and
// Reduced Motion settings stop everything here as well.
const root = document.documentElement;
const shot = document.querySelector<HTMLElement>(".hero-v3 .product-shot");
const scene = document.querySelector<HTMLElement>("[data-relay-scene]");
const clamp = (value: number): number => Math.min(1, Math.max(0, value));
const motionOn = (): boolean => root.dataset.motion === "on";
let frame = 0;

function update(): void {
  frame = 0;
  const on = motionOn();
  const vh = innerHeight;
  if (shot) {
    // 1 = tilted back like a product on a desk, 0 = flat and fully annotated.
    const top = shot.getBoundingClientRect().top;
    shot.style.setProperty("--tilt", on ? clamp(1 - (vh - top) / (vh * .85)).toFixed(3) : "0");
  }
  if (scene) {
    const rect = scene.getBoundingClientRect();
    const p = on ? clamp(-rect.top / Math.max(1, rect.height - vh)) : 1;
    scene.style.setProperty("--q1", clamp(p / .28).toFixed(3));
    scene.style.setProperty("--q2", clamp((p - .38) / .26).toFixed(3));
    const step = String(p < .34 ? 0 : p < .7 ? 1 : 2);
    if (scene.dataset.step !== step) scene.dataset.step = step;
  }
}
function schedule(): void {
  if (!frame) frame = requestAnimationFrame(update);
}
addEventListener("scroll", schedule, { passive: true });
addEventListener("resize", schedule);
new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ["data-motion"] });
update();

// One-time entrance for the LPv3 sections; content stays readable without it.
const targets = document.querySelectorAll(".pillars article, .mcp-copy, .mcp-code, .guild-copy, .guild-v3 .product-shot, .open-v3, .facts > div, .pin-legend li, .mcp-clients li, .start-steps li");
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      if (!motionOn() || document.hidden) continue;
      const siblings = [...(entry.target.parentElement?.children ?? [])];
      entry.target.animate(
        [{ opacity: .15, transform: "translateY(28px)" }, { opacity: 1, transform: "none" }],
        { duration: 700, delay: Math.max(0, siblings.indexOf(entry.target)) * 90, easing: "cubic-bezier(.22,.68,0,1)", fill: "backwards" },
      );
    }
  }, { threshold: .2 });
  targets.forEach(node => observer.observe(node));
}

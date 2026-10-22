/**
 * A short confetti burst for finishing a task. It is the one deliberate
 * exception to the "no decorative particles" brand rule: it only follows a
 * completion, lasts about a second, never loops, and is skipped entirely under
 * Reduced Motion. Colours are brighter cousins of the Bloom task hues (orange,
 * gold, sage, teal) so the burst reads on both the cream and charcoal grounds.
 */

const COLORS = ["#f29b38", "#f5bd3c", "#e8823a", "#ffd27a", "#62b585", "#3fa59a", "#c9a45c"];

export function celebrate(x: number, y: number, big = false): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const layer = document.createElement("div");
  layer.className = "a4-confetti";
  layer.setAttribute("aria-hidden", "true");
  document.body.append(layer);
  const count = big ? 110 : 40;
  let longest = 0;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("span");
    const size = 8 + Math.random() * (big ? 10 : 7);
    const shape = i % 3;
    piece.style.cssText = `left:${x}px;top:${y}px;width:${shape === 1 ? size * 0.5 : size}px;height:${size}px;background:${COLORS[i % COLORS.length]};`
      + `border-radius:${shape === 0 ? "50%" : shape === 1 ? "2px" : "60% 40% 55% 45%"};`;
    layer.append(piece);
    // Mostly upward, fanned out; a big burst also throws sideways.
    const angle = (-90 + (Math.random() - 0.5) * (big ? 220 : 140)) * (Math.PI / 180);
    const speed = (big ? 180 : 110) + Math.random() * (big ? 260 : 150);
    const dx = Math.cos(angle) * speed, dy = Math.sin(angle) * speed;
    const spin = (Math.random() - 0.5) * 720;
    const duration = 900 + Math.random() * (big ? 900 : 500);
    longest = Math.max(longest, duration);
    // Burst out fast, then fall; pieces stay solid until the last stretch of the fall.
    piece.animate([
      { transform: "translate(-50%, -50%) scale(0.4) rotate(0deg)", opacity: 1, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.4, easing: "ease-in" },
      { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + 150}px)) scale(0.95) rotate(${spin * 0.8}deg)`, opacity: 1, offset: 0.8 },
      { transform: `translate(calc(-50% + ${dx * 1.25}px), calc(-50% + ${dy + 240}px)) scale(0.9) rotate(${spin}deg)`, opacity: 0 },
    ], { duration, fill: "forwards" });
  }
  window.setTimeout(() => layer.remove(), longest + 100);
}

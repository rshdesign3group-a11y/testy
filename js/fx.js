/** Visual effects: hole transitions (iris), digging animation, confetti, dirt, banner and screen shake. */
import { S } from "./settings.js?v=13";
import * as audio from "./audio.js?v=13";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
let canvas, g, parts = [], raf = 0;

function ensureCanvas() {
  if (canvas) return;
  canvas = el("canvas", "fx-canvas"); document.body.append(canvas); g = canvas.getContext("2d");
  const fit = () => { canvas.width = innerWidth; canvas.height = innerHeight; }; fit(); addEventListener("resize", fit);
}
function loop() {
  g.clearRect(0, 0, canvas.width, canvas.height);
  parts = parts.filter((p) => p.life > 0);
  for (const p of parts) {
    p.vy += p.gy; p.x += p.vx; p.y += p.vy; p.vx *= .99; p.life -= 1; p.rot += p.vr;
    g.save(); g.globalAlpha = Math.min(1, p.life / 25); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.c;
    if (p.round) { g.beginPath(); g.arc(0, 0, p.s, 0, 6.3); g.fill(); } else g.fillRect(-p.s, -p.s / 2, p.s * 2, p.s);
    g.restore();
  }
  raf = parts.length ? requestAnimationFrame(loop) : 0;
  if (!parts.length) g.clearRect(0, 0, canvas.width, canvas.height);
}
function burst(x, y, n, make) {
  if (!S.transitions) return;
  ensureCanvas();
  for (let i = 0; i < n; i++) parts.push(make(x, y));
  if (!raf) raf = requestAnimationFrame(loop);
}
const COLORS = ["#ffffff", "#f9a8d4", "#f472b6", "#c084fc", "#a855f7", "#fde68a", "#e9d5ff"];
export const confetti = (x = innerWidth / 2, y = innerHeight / 3, n = 110) => burst(x, y, n, (x0, y0) => {
  const a = Math.random() * 6.28, v = 3 + Math.random() * 7;
  return { x: x0, y: y0, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 5, gy: .22, life: 90 + Math.random() * 60, s: 3 + Math.random() * 4, rot: 0, vr: (Math.random() - .5) * .4, c: COLORS[Math.floor(Math.random() * COLORS.length)] };
});
export const dirt = (x, y, n = 45) => burst(x, y, n, (x0, y0) => {
  const a = -Math.PI / 2 + (Math.random() - .5) * 1.6, v = 2 + Math.random() * 6;
  return { x: x0, y: y0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, gy: .3, life: 45 + Math.random() * 25, s: 2 + Math.random() * 3, rot: 0, vr: .2, c: ["#6b4423", "#8a5a2b", "#a16207", "#4a2c10"][Math.floor(Math.random() * 4)], round: true };
});

/** Iris wipe: the screen closes around (x, y), `mid()` swaps the screen, then it opens again. */
export async function iris(x, y, mid) {
  if (!S.transitions || !document.body.animate) { await mid(); return; }
  const d = el("div", "iris"); document.body.append(d);
  const R = Math.hypot(innerWidth, innerHeight);
  await d.animate([{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${R}px at ${x}px ${y}px)` }], { duration: 330, easing: "ease-in", fill: "forwards" }).finished;
  await mid();
  const cx = innerWidth / 2, cy = innerHeight / 2;
  await d.animate([{ clipPath: `circle(${R}px at ${cx}px ${cy}px)` }, { clipPath: `circle(0px at ${cx}px ${cy}px)` }], { duration: 420, easing: "ease-out", fill: "forwards" }).finished;
  d.remove();
}

/** "Digging…" card with a shaking pickaxe, dirt and a progress bar. Resolves when finished. */
export function dig(label = "Digging…", ms = 1500) {
  if (!S.transitions) return Promise.resolve();
  return new Promise((resolve) => {
    const bar = el("i"), card = el("div", "dig-card", ""), root = el("div", "dig-overlay");
    card.append(el("div", "dig-ico", "⛏️"), el("div", "dig-label", label), Object.assign(el("div", "dig-bar"), {}));
    card.lastChild.append(bar); root.append(card); document.body.append(root);
    bar.style.transition = `width ${ms}ms linear`; requestAnimationFrame(() => (bar.style.width = "100%"));
    const r = card.getBoundingClientRect();
    const iv = setInterval(() => { audio.sfx("dig"); dirt(r.left + r.width / 2, r.top + 30, 18); audio.vibrate(30); }, 480);
    audio.sfx("dig");
    setTimeout(() => { clearInterval(iv); root.classList.add("out"); setTimeout(() => { root.remove(); resolve(); }, 220); }, ms);
  });
}
export function banner(text) {
  const b = el("div", "fx-banner", text); document.body.append(b); setTimeout(() => b.remove(), 1900);
}
export function shake() {
  if (!S.shake) return;
  document.body.classList.remove("shake"); void document.body.offsetWidth; document.body.classList.add("shake");
  setTimeout(() => document.body.classList.remove("shake"), 450);
}

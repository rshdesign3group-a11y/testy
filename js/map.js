/**
 * Endless side-view map. Procedural in every direction, drag/arrow-key/wheel
 * navigation, animated creatures, per-player fog on deep layers.
 */
import { getImage } from "./data.js?v=14";
import { TAU, hash, biome, hsl, regionAt, slotX, groupEnd, gapLayout, CAFE_DEPTH, LAYER_DEPTHS, layerOf } from "./world.js?v=14";
import { art, artFile, drawArt, animFrame, tileX, tileY, cover } from "./assets.js?v=14";
import { S } from "./settings.js?v=14";
import * as audio from "./audio.js?v=14";
import { itemsIn } from "./items.js?v=14";
import { coinImage } from "./rcoin.js?v=14";

/* weather: what is happening in a region right now (changes every 15 minutes, same for everybody) */
const WX = { meadow: [["clear", .55], ["rain", .8], ["fog", .9], ["storm", 1]], desert: [["clear", .7], ["sand", 1]], snow: [["snow", .6], ["blizzard", .8], ["clear", 1]], fairy: [["petals", .55], ["clear", .9], ["rain", 1]], jungle: [["rain", .45], ["fog", .65], ["clear", .9], ["storm", 1]] };
const weatherAt = (id, now) => { const r = hash(Math.floor(now / 900000), (id || "m").charCodeAt(0) + (id || "").length * 7, 3); return (WX[id] || WX.meadow).find(([, p]) => r <= p)[0]; };
const RAR_COL = { common: "233,221,255", uncommon: "134,239,172", rare: "147,197,253", epic: "240,171,252" };

export const LH = 130;                  // layer height (compact, as before)
/** world-y below the ground of a hole's chamber: always near the bottom of its layer */
export const holeDepthPx = (d) => (layerOf(d) - 1) * LH + 100 + (((d - 1) % LAYER_DEPTHS) / (LAYER_DEPTHS - 1)) * 28;
export const SURF = 230;                // world-y of the ground surface
const holeX = (h) => slotX(h.x);        // groups of 4 holes with a gap (billboard / stall) in between

/* ---------- surface animals ---------- */
const SA = {
  rabbit:   { c: "#f1f5f9", d: "#cbd5e1", w: 11, h: 8, s: 1 },
  sheep:    { c: "#f8fafc", d: "#e5e7eb", w: 14, h: 9, s: 1.1 },
  fox:      { c: "#ea580c", d: "#fff7ed", w: 15, h: 7, s: 1.1 },
  deer:     { c: "#a16207", d: "#fde68a", w: 17, h: 9, s: 1.3 },
  squirrel: { c: "#b45309", d: "#fed7aa", w: 8,  h: 6, s: 1 },
  hedgehog: { c: "#57534e", d: "#d6b98c", w: 11, h: 8, s: 1 },
  polar:    { c: "#f8fafc", d: "#e2e8f0", w: 20, h: 11, s: 1.2 },
  wolf:     { c: "#64748b", d: "#e2e8f0", w: 15, h: 7, s: 1.2 },
  fennec:   { c: "#fcd34d", d: "#fff7ed", w: 11, h: 6, s: 1 },
  camel:    { c: "#d6a756", d: "#fde68a", w: 19, h: 9, s: 1.2 },
  unicorn:  { c: "#fdf2f8", d: "#f9a8d4", w: 16, h: 8, s: 1.2 }
};
const SA_KEYS = Object.keys(SA);

// Distance walked along a back-and-forth path x = A*sin(m)  ->  frame index follows real movement
const walked = (A, m) => { const k = Math.floor((m + Math.PI / 2) / Math.PI); return A * (2 * k + Math.sin(m - k * Math.PI) + 1); };

function critter(ctx, type, t, dir) {
  const a = SA[type], tall = type === "deer" || type === "camel" || type === "unicorn";
  const ll = tall ? 14 : 6, st = t * 9;
  ctx.save();
  ctx.scale(dir * a.s * 1.5, a.s * 1.5);   // large enough to recognise
  ctx.translate(0, -ll - a.h + (type === "rabbit" ? -Math.abs(Math.sin(st)) * 4 : 0));
  ctx.strokeStyle = a.c; ctx.lineWidth = tall ? 2 : 3; ctx.lineCap = "round";
  [[-0.6, 0], [-0.3, Math.PI], [0.4, Math.PI], [0.65, 0]].forEach(([k, p]) => {
    ctx.beginPath(); ctx.moveTo(a.w * k, a.h * .5);
    ctx.lineTo(a.w * k + Math.sin(st + p) * 4, a.h + ll); ctx.stroke();
  });
  // tail
  ctx.fillStyle = type === "rabbit" ? "#fff" : type === "unicorn" ? "#f472b6" : a.c;
  ctx.beginPath();
  if (type === "fox" || type === "wolf" || type === "fennec") ctx.ellipse(-a.w - 6, 0, 10, 4, -0.3 + Math.sin(st * .5) * .15, 0, TAU);
  else if (type === "squirrel") ctx.ellipse(-a.w + 1, -8, 5, 11, 0.5 + Math.sin(st * .5) * .2, 0, TAU);
  else ctx.arc(-a.w, -1, type === "rabbit" ? 3.5 : 3, 0, TAU);
  ctx.fill();
  // body
  ctx.fillStyle = a.c; ctx.beginPath(); ctx.ellipse(0, 0, a.w, a.h, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = a.d; ctx.beginPath(); ctx.ellipse(2, a.h * .4, a.w * .6, a.h * .45, 0, 0, TAU); ctx.fill();
  if (type === "hedgehog") {
    ctx.strokeStyle = "#292524"; ctx.lineWidth = 1.3;
    for (let i = 0; i < 14; i++) {
      const q = Math.PI * 1.05 + (i / 13) * Math.PI * .9;
      ctx.beginPath(); ctx.moveTo(Math.cos(q) * a.w * .8, Math.sin(q) * a.h * .8);
      ctx.lineTo(Math.cos(q) * (a.w + 5), Math.sin(q) * (a.h + 5)); ctx.stroke();
    }
  }
  // head
  const hx = a.w * .95, hy = -a.h * .55;
  ctx.fillStyle = a.c; ctx.beginPath();
  ctx.ellipse(hx + (tall ? 3 : 0), hy - (tall ? 7 : 0), tall ? 5 : 6, tall ? 4 : 5, 0, 0, TAU); ctx.fill();
  if (tall) { ctx.strokeStyle = a.c; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a.w * .6, -3); ctx.lineTo(hx + 1, hy - 7); ctx.stroke(); }
  const ey = tall ? hy - 8 : hy;
  ctx.fillStyle = "#0f172a"; ctx.beginPath(); ctx.arc(hx + (tall ? 5 : 3), ey - 1, 1.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(hx + (tall ? 8 : 6), ey + 1.5, 1.1, 0, TAU); ctx.fill();
  // ears / antlers
  ctx.fillStyle = a.c; ctx.strokeStyle = "#78350f"; ctx.lineWidth = 1.5;
  if (type === "rabbit") {
    ctx.beginPath(); ctx.ellipse(hx - 2, hy - 12, 2.6, 8, 0.25, 0, TAU); ctx.ellipse(hx + 3, hy - 12, 2.6, 8, -0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fda4af"; ctx.beginPath(); ctx.ellipse(hx - 2, hy - 11, 1, 5, 0.25, 0, TAU); ctx.fill();
  } else if (type === "fox" || type === "wolf" || type === "fennec") {
    ctx.beginPath(); ctx.moveTo(hx - 3, hy - 3); ctx.lineTo(hx - 1, hy - (type === "fennec" ? 17 : 11)); ctx.lineTo(hx + 3, hy - 4); ctx.fill();
  } else if (type === "polar") {
    ctx.beginPath(); ctx.arc(hx - 1, hy - 5, 2.6, 0, TAU); ctx.fill();
  } else if (type === "camel") {
    ctx.beginPath(); ctx.ellipse(-2, -a.h - 3, 6, 7, 0, 0, TAU); ctx.fill();
  } else if (type === "unicorn") {
    ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.moveTo(hx + 1, hy - 12); ctx.lineTo(hx + 6, hy - 24); ctx.lineTo(hx + 5, hy - 10); ctx.fill();
  } else if (type === "deer") {
    ctx.beginPath(); ctx.moveTo(hx + 1, hy - 11); ctx.lineTo(hx - 3, hy - 21); ctx.moveTo(hx - 1, hy - 16); ctx.lineTo(hx + 4, hy - 19);
    ctx.moveTo(hx + 3, hy - 11); ctx.lineTo(hx + 6, hy - 21); ctx.stroke();
  } else if (type === "squirrel") {
    ctx.beginPath(); ctx.arc(hx - 1, hy - 5, 2, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function snake(ctx, t) {
  ctx.save(); ctx.scale(1.3, 1.3);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const pts = []; for (let k = 0; k <= 12; k++) pts.push([-30 + k * 5, -6 + Math.sin(t * 5 + k * .7) * 4]);
  const path = () => { ctx.beginPath(); pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); };
  ctx.strokeStyle = "#65a30d"; ctx.lineWidth = 6; path(); ctx.stroke();
  ctx.strokeStyle = "#facc15"; ctx.lineWidth = 2; ctx.setLineDash([3, 7]); path(); ctx.stroke(); ctx.setLineDash([]);
  const [hx, hy] = pts[12];
  ctx.fillStyle = "#65a30d"; ctx.beginPath(); ctx.ellipse(hx + 2, hy, 6, 4.5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "#0f172a"; ctx.fillRect(hx + 2, hy - 3, 2, 2);
  ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx + 8, hy); ctx.lineTo(hx + 13, hy + Math.sin(t * 20) * 2); ctx.stroke();
  ctx.restore();
}
function penguin(ctx, t) {
  ctx.save(); ctx.scale(1.4, 1.4); ctx.translate(0, -19); ctx.rotate(Math.sin(t * 8) * .1);
  const f = Math.sin(t * 8) * 3;
  ctx.fillStyle = "#f97316"; ctx.beginPath(); ctx.ellipse(-4 + f, 17, 5, 2.5, 0, 0, TAU); ctx.ellipse(5 - f, 17, 5, 2.5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "#1e293b"; ctx.beginPath(); ctx.ellipse(0, 0, 11, 17, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-9, 3, 3, 9, .4 + f * .05, 0, TAU); ctx.fill();
  ctx.fillStyle = "#f8fafc"; ctx.beginPath(); ctx.ellipse(2, 3, 7, 12, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "#f97316"; ctx.beginPath(); ctx.moveTo(8, -10); ctx.lineTo(16, -8); ctx.lineTo(8, -6); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(5, -12, 2.4, 0, TAU); ctx.fill();
  ctx.fillStyle = "#0f172a"; ctx.beginPath(); ctx.arc(5.8, -12, 1.2, 0, TAU); ctx.fill();
  ctx.restore();
}
const drawAnimal = (ctx, type, t, dir, d = 0, slow = false) => {
  const a = art("animal-" + type);            // assets/surface/animals/<type>.png
  if (a) {
    const sp = a.spec, [w0, w1] = sp.walk || [0, sp.frames];
    ctx.fillStyle = "rgba(0,0,0,.16)"; ctx.beginPath(); ctx.ellipse(0, 1, sp.w * .34, 3.5, 0, 0, TAU); ctx.fill();
    const f = slow && sp.idle ? sp.idle[0] + (Math.floor(t * 1.6) % (sp.idle[1] - sp.idle[0]))
      : w0 + (Math.floor(d / (sp.stride || 6)) % (w1 - w0));
    return drawArt(ctx, a, { frame: f, dir });
  }
  if (type === "snake" || type === "penguin") { ctx.save(); ctx.scale(dir, 1); (type === "snake" ? snake : penguin)(ctx, t); ctx.restore(); }
  else critter(ctx, type, t, dir);
};

// Four tree species (round oak/sakura, pine, cactus, palm), `sw` = wind sway
function tree(ctx, kind, sc, r, sw) {
  ctx.save(); ctx.scale(sc, sc);
  const a = art(`tree-${kind}-${r.id}`) || art(`tree-${kind}`);   // region variant first
  if (a) { ctx.transform(1, 0, -sw * .012, 1, 0, 0); drawArt(ctx, a); }   // wind = gentle skew
  else if (kind === "pine") {
    ctx.fillStyle = r.trunk; ctx.fillRect(-6, -30, 12, 30);
    for (let k = 0; k < 4; k++) {
      const y = -22 - k * 28, wd = 46 - k * 9, o = sw * k / 3;
      ctx.fillStyle = r.leaf[k % 3]; ctx.beginPath(); ctx.moveTo(-wd + o, y); ctx.lineTo(o * 1.4, y - 42); ctx.lineTo(wd + o, y); ctx.fill();
    }
  } else if (kind === "cactus") {
    ctx.fillStyle = "#15803d"; ctx.strokeStyle = "#166534"; ctx.lineWidth = 2;
    [[-9, -92, 18, 92], [-30, -62, 10, 36], [20, -74, 10, 40]].forEach(([x, y, w, h], i) => {
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke();
      if (i) { ctx.fillRect(i === 1 ? -22 : 10, y + h - 8, 14, 9); }
    });
    ctx.fillStyle = "#fde68a"; for (let k = 0; k < 6; k++) ctx.fillRect(-4 + (k % 2) * 6, -84 + k * 13, 2, 2);
  } else if (kind === "palm") {
    ctx.strokeStyle = r.trunk; ctx.lineWidth = 9; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(16 + sw, -50, 6 + sw * 2, -100); ctx.stroke();
    ctx.strokeStyle = r.leaf[1]; ctx.lineWidth = 5;
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI + k * (Math.PI / 6) + sw * .02;
      ctx.beginPath(); ctx.moveTo(6 + sw * 2, -100); ctx.quadraticCurveTo(6 + Math.cos(a) * 24, -100 + Math.sin(a) * 30 - 14, 6 + Math.cos(a) * 50 + sw * 2, -100 + Math.sin(a) * 18 + 22); ctx.stroke();
    }
  } else {
    ctx.fillStyle = r.trunk; ctx.fillRect(-7, -80, 14, 80);
    [[0, -100, 34], [-20, -80, 26], [20, -80, 26], [0, -118, 22]].forEach(([dx, dy, rr], k) => {
      ctx.fillStyle = r.leaf[k % 3]; ctx.beginPath(); ctx.arc(dx + sw, dy, rr, 0, TAU); ctx.fill();
    });
  }
  ctx.restore();
}

/* ---------- underground creatures ---------- */
// y = where inside the layer the creature lives (0 top … 1 bottom)
const U = {
  worm(ctx, t, ph, o) {
    const gold = o.gold;
    for (let k = 7; k >= 0; k--) {
      const x = -18 + k * 5, y = Math.sin(t * 3 + ph + k * .8) * 3.2;
      ctx.fillStyle = gold ? `hsl(${44 - k * 1.5},95%,${58 - k}%)` : `hsl(335,70%,${66 - k * 2}%)`;
      ctx.beginPath(); ctx.arc(x, y, k === 7 ? 3.6 : 2.8, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = "#1c1917"; ctx.beginPath(); ctx.arc(19, -1.5 + Math.sin(t * 3 + ph + 5.6) * 3.2, .9, 0, TAU); ctx.fill();
    if (gold) {
      ctx.fillStyle = "#fffbeb"; ctx.globalAlpha = .5 + .5 * Math.sin(t * 5 + ph);
      ctx.beginPath(); ctx.arc(-6 + Math.sin(t + ph) * 10, -3, 1.4, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
  },
  skeleton(ctx, t, ph, o) {
    const dia = o.diamond, c = dia ? "#a5f3fc" : "#e7e5e4", st = t * 4 + ph;
    if (dia) { ctx.shadowColor = "#22d3ee"; ctx.shadowBlur = 10; }
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 2.2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-16, -8); ctx.quadraticCurveTo(0, -12, 12, -9); ctx.stroke();       // spine
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-6 + i * 5, -8, 5, .2, Math.PI - .2); ctx.stroke(); } // ribs
    [[-12, 0], [-8, Math.PI], [8, Math.PI], [12, 0]].forEach(([x, p]) => {
      ctx.beginPath(); ctx.moveTo(x, -8); ctx.lineTo(x + Math.sin(st + p) * 4, 4); ctx.stroke();
    });
    ctx.beginPath(); ctx.arc(15, -12, 6, 0, TAU); ctx.fill();                                     // skull
    ctx.fillStyle = "#0f172a"; ctx.beginPath(); ctx.arc(17, -13, 1.6, 0, TAU); ctx.fill();
    ctx.fillRect(16, -9, 6, 1.6 + Math.abs(Math.sin(st * .5)) * 2);                              // jaw
    if (dia) {
      ctx.shadowBlur = 0; ctx.fillStyle = "#fff"; ctx.globalAlpha = .5 + .5 * Math.sin(t * 6 + ph);
      ctx.beginPath(); ctx.moveTo(-4, -22); ctx.lineTo(-2, -18); ctx.lineTo(2, -16); ctx.lineTo(-2, -15); ctx.lineTo(-4, -10); ctx.lineTo(-6, -15); ctx.lineTo(-10, -16); ctx.lineTo(-6, -18); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.shadowBlur = 0;
  },
  root(ctx, t, ph) {
    ctx.strokeStyle = "#5b3a1a"; ctx.lineCap = "round";
    for (let k = 0; k < 3; k++) {
      ctx.lineWidth = 3 - k * .7; const len = 40 + hash(ph, k) * 40, sw = Math.sin(t * 1.2 + ph + k) * 6;
      ctx.beginPath(); ctx.moveTo(k * 8 - 8, 0);
      ctx.bezierCurveTo(k * 8 - 8 + sw, len * .4, k * 8 - 8 - sw, len * .7, k * 8 - 8 + sw * 1.4, len); ctx.stroke();
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(k * 8 - 8 + sw * .5, len * .4); ctx.lineTo(k * 8 + 2 + sw, len * .55); ctx.stroke();
    }
  },
  beetle(ctx, t, ph) {
    const h = 90 + hash(ph) * 140, s = t * 10 + ph;
    ctx.strokeStyle = "#1c1917"; ctx.lineWidth = 1.2;
    for (let k = -1; k <= 1; k++) for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(k * 4, 0); ctx.lineTo(k * 4 + Math.sin(s + k * 2) * 3, sd * 7); ctx.stroke();
    }
    ctx.fillStyle = `hsl(${h},60%,35%)`; ctx.beginPath(); ctx.ellipse(0, 0, 9, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = `hsl(${h},70%,55%)`; ctx.beginPath(); ctx.ellipse(-1, -2, 6, 2.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#1c1917"; ctx.beginPath(); ctx.arc(9, 0, 3.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(11, -1); ctx.lineTo(15, -4 + Math.sin(s) * 1.5); ctx.moveTo(11, 1); ctx.lineTo(15, 4 - Math.sin(s) * 1.5); ctx.stroke();
  },
  mole(ctx, t, ph) {
    const s = t * 8 + ph;
    ctx.fillStyle = "#44403c"; ctx.beginPath(); ctx.ellipse(0, 0, 13, 8, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(13, 1, 6, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fda4af"; ctx.beginPath(); ctx.arc(19, 2, 2.3, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fcd9b6"; for (const k of [0, 1]) { ctx.beginPath(); ctx.ellipse(8 + k * 3 + Math.sin(s + k) * 2, 8, 4, 2, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(15, -1, 1, 0, TAU); ctx.fill();
  },
  bat(ctx, t, ph) {
    const f = Math.sin(t * 12 + ph);
    ctx.fillStyle = "#312e81";
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sd * 3, 0); ctx.quadraticCurveTo(sd * 14, -10 - f * 8, sd * 22, -2 + f * 6);
      ctx.quadraticCurveTo(sd * 15, 2, sd * 11, 0); ctx.quadraticCurveTo(sd * 7, 4, sd * 3, 3); ctx.fill();
    }
    ctx.fillStyle = "#1e1b4b"; ctx.beginPath(); ctx.ellipse(0, 1, 4, 6, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-3, -4); ctx.lineTo(-2, -9); ctx.lineTo(0, -5); ctx.lineTo(2, -9); ctx.lineTo(3, -4); ctx.fill();
    ctx.fillStyle = "#fb7185"; ctx.fillRect(-2.5, -2, 1.4, 1.4); ctx.fillRect(1.2, -2, 1.4, 1.4);
  },
  crystal(ctx, t, ph, o) {
    const p = .6 + .4 * Math.sin(t * 2 + ph), h = o.hue;
    ctx.shadowColor = `hsl(${h},90%,60%)`; ctx.shadowBlur = 12 * p;
    [[-9, 14, 5], [0, 22, 6], [9, 12, 5]].forEach(([x, hh, w], k) => {
      ctx.fillStyle = `hsl(${h + k * 15},80%,${55 + p * 10}%)`;
      ctx.beginPath(); ctx.moveTo(x, -hh); ctx.lineTo(x + w, -hh * .25); ctx.lineTo(x + w * .6, 0); ctx.lineTo(x - w * .6, 0); ctx.lineTo(x - w, -hh * .25); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.moveTo(x, -hh); ctx.lineTo(x - w, -hh * .25); ctx.lineTo(x - w * .3, 0); ctx.lineTo(x, -hh * .3); ctx.fill();
    });
    ctx.shadowBlur = 0;
  },
  nugget(ctx, t, ph) {
    ctx.fillStyle = "#b45309"; ctx.beginPath(); ctx.ellipse(0, -5, 11, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.ellipse(-2, -7, 8, 5, -.2, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fffbeb"; ctx.globalAlpha = .5 + .5 * Math.sin(t * 4 + ph);
    ctx.beginPath(); ctx.arc(2, -9, 1.8, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  },
  bone(ctx, t, ph) {
    ctx.strokeStyle = "#e7e5e4"; ctx.lineCap = "round"; ctx.lineWidth = 3;
    for (const r of [-.5, .5]) {
      ctx.beginPath(); ctx.moveTo(-10 * Math.cos(r), -6 - 10 * Math.sin(r)); ctx.lineTo(10 * Math.cos(r), -6 + 10 * Math.sin(r)); ctx.stroke();
    }
    ctx.fillStyle = "#e7e5e4"; ctx.beginPath(); ctx.arc(0, -14, 5, 0, TAU); ctx.fill();
  },
  salamander(ctx, t, ph) {
    ctx.shadowColor = "#f97316"; ctx.shadowBlur = 10;
    ctx.strokeStyle = "#ea580c"; ctx.lineCap = "round"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(14, 0);
    for (let k = 1; k <= 8; k++) ctx.lineTo(14 - k * 4.5, Math.sin(t * 5 + ph + k * .7) * 4);
    ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(15, 0, 4.5, 0, TAU); ctx.fill();
    ctx.fillStyle = "#1c1917"; ctx.beginPath(); ctx.arc(16.5, -1.5, 1, 0, TAU); ctx.fill();
  }
};
const KIND = {   // type -> factory options, vertical position, motion range, speed
  worm: { y: .55, r: 50, v: .5 }, goldworm: { y: .6, r: 50, v: .45, base: "worm", gold: true },
  skeleton: { y: .85, r: 40, v: .3 }, diamond: { y: .85, r: 40, v: .3, base: "skeleton", diamond: true },
  root: { y: 0, r: 0, v: 0 }, beetle: { y: .8, r: 60, v: .6 }, mole: { y: .8, r: 45, v: .35 },
  bat: { y: .4, r: 70, v: .8, fly: true }, crystal: { y: .95, r: 0, v: 0 }, nugget: { y: .95, r: 0, v: 0 },
  bone: { y: .95, r: 0, v: 0 }, salamander: { y: .85, r: 50, v: .5 }
};

/* ---------- renderer ---------- */
/** Hole entrance, drawn procedurally. (x, y) = centre of the opening on the ground line. Also used for the style previews. */
export function drawEntrance(ctx, style, x, y, t = 0) {
  const dark = "#050403";
  const mound = (c, rx = 56) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y + 2, rx, 15, 0, Math.PI, TAU); ctx.fill(); };
  const opening = (rx = 44) => { ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(x, y, rx, 14, 0, 0, TAU); ctx.fill(); };
  const gold = "#fbbf24";
  switch (style) {
    case 1: {   // stone ring
      const stones = (back) => { for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU, sy = y + Math.sin(a) * 15; if ((sy <= y) !== back) continue;
        ctx.fillStyle = `hsl(30,6%,${40 + (k % 3) * 9}%)`; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 47, sy, 8, 6, 0, 0, TAU); ctx.fill(); } };
      stones(true); opening(40); stones(false); break; }
    case 2:     // wooden door
      mound("#6b4423"); opening(38);
      ctx.fillStyle = "#7c4a1d"; ctx.beginPath(); ctx.moveTo(x - 26, y + 6); ctx.lineTo(x - 26, y - 24); ctx.quadraticCurveTo(x, y - 52, x + 26, y - 24); ctx.lineTo(x + 26, y + 6); ctx.fill();
      ctx.strokeStyle = "#3b2208"; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); for (const d of [-13, 0, 13]) { ctx.moveTo(x + d, y - 38); ctx.lineTo(x + d, y + 6); } ctx.stroke();
      ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(x + 15, y - 9, 3, 0, TAU); ctx.fill(); break;
    case 3:     // mushroom hut
      mound("#4d7c2f", 50); opening(30);
      ctx.fillStyle = "#fef3c7"; ctx.fillRect(x - 40, y - 14, 10, 20); ctx.fillRect(x + 30, y - 14, 10, 20);
      ctx.fillStyle = "#dc2626"; ctx.beginPath(); ctx.ellipse(x, y - 14, 56, 32, 0, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = "#fef3c7"; ctx.beginPath(); ctx.ellipse(x, y - 14, 56, 7, 0, 0, TAU); ctx.fill();
      for (const [dx, dy, r] of [[-26, -30, 6], [8, -40, 7], [30, -24, 5], [-6, -24, 4]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, TAU); ctx.fill(); } break;
    case 4: {   // crystal gate
      opening(40);
      const p = .6 + .4 * Math.sin(t * 2); ctx.shadowColor = "#22d3ee"; ctx.shadowBlur = 12 * p;
      [[-50, 30, 8, 190], [-38, 48, 9, 280], [38, 44, 9, 200], [52, 28, 8, 300]].forEach(([dx, h, w, hue]) => {
        ctx.fillStyle = `hsl(${hue},80%,${58 + p * 8}%)`; ctx.beginPath(); ctx.moveTo(x + dx, y - h); ctx.lineTo(x + dx + w, y - h * .3); ctx.lineTo(x + dx + w * .6, y + 4); ctx.lineTo(x + dx - w * .6, y + 4); ctx.lineTo(x + dx - w, y - h * .3); ctx.fill(); });
      ctx.shadowBlur = 0; break; }
    case 5:     // flower burrow
      mound("#3f8f3f"); opening(38);
      for (let k = 0; k < 11; k++) { const fx = x - 52 + k * 10.4, fy = y - 4 - (k % 3) * 5;
        ctx.strokeStyle = "#166534"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(fx, y + 2); ctx.lineTo(fx, fy); ctx.stroke();
        ctx.fillStyle = ["#f472b6", "#fde047", "#fff", "#a78bfa"][k % 4]; ctx.beginPath(); ctx.arc(fx, fy, 4, 0, TAU); ctx.fill();
        ctx.fillStyle = "#f59e0b"; ctx.beginPath(); ctx.arc(fx, fy, 1.6, 0, TAU); ctx.fill(); } break;
    case 6: {   // royal gate (founder)
      opening(36);
      ctx.fillStyle = gold; ctx.fillRect(x - 50, y - 34, 13, 42); ctx.fillRect(x + 37, y - 34, 13, 42);
      ctx.strokeStyle = gold; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(x, y - 22, 37, Math.PI, TAU); ctx.stroke();
      ctx.fillStyle = "#f59e0b"; ctx.fillRect(x - 50, y - 34, 13, 5); ctx.fillRect(x + 37, y - 34, 13, 5);
      const g = .7 + .3 * Math.sin(t * 3);
      ctx.fillStyle = gold; ctx.beginPath(); ctx.moveTo(x - 16, y - 64); ctx.lineTo(x - 16, y - 82); ctx.lineTo(x - 8, y - 72); ctx.lineTo(x, y - 86); ctx.lineTo(x + 8, y - 72); ctx.lineTo(x + 16, y - 82); ctx.lineTo(x + 16, y - 64); ctx.fill();
      ctx.fillStyle = `rgba(239,68,68,${g})`; ctx.beginPath(); ctx.arc(x, y - 70, 3, 0, TAU); ctx.fill(); break; }
    default:    // classic mound
      mound("#6b4423"); opening(44);
  }
}

export class MapRenderer {
  constructor(canvas, holes, onHoleClick, getMaxDepth = () => 0) {
    Object.assign(this, { canvas, holes, onHoleClick, getMaxDepth });
    this.ctx = canvas.getContext("2d");
    this.camX = this.tx = 0; this.camY = this.ty = 0;
    this.time = 0; this.active = true; this.keys = {};
    this.drag = null; this.moved = 0;
    this.resize();
    // The canvas has no size while its screen is hidden, so always re-measure when it becomes visible again
    new ResizeObserver(() => this.resize()).observe(canvas);

    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, y: e.clientY, tx: this.tx, ty: this.ty }; this.moved = 0;
      canvas.style.cursor = "grabbing";
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.moved = Math.max(this.moved, Math.abs(dx) + Math.abs(dy));
      this.tx = this.drag.tx - dx; this.ty = this.drag.ty - dy; this.clamp();
    });
    canvas.addEventListener("pointerup", (e) => {
      const wasClick = this.drag && this.moved < 6;
      this.drag = null; canvas.style.cursor = "grab";
      if (wasClick) this.handleClick(e);
    });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) this.tx += (e.deltaX || e.deltaY);
      else this.ty += e.deltaY;
      this.clamp();
    }, { passive: false });

    const typing = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
    window.addEventListener("keydown", (e) => {
      if (!this.active || typing(e) || !e.key.startsWith("Arrow")) return;
      e.preventDefault(); this.keys[e.key] = true;
    });
    window.addEventListener("keyup", (e) => { this.keys[e.key] = false; });

    const loop = () => {
      requestAnimationFrame(loop);
      if (!this.active) return;
      this.time += 0.016;
      const k = this.keys, sp = 16;
      if (k.ArrowLeft) this.tx -= sp; if (k.ArrowRight) this.tx += sp;
      if (k.ArrowUp) this.ty -= sp; if (k.ArrowDown) this.ty += sp;
      this.clamp();
      this.camX += (this.tx - this.camX) * 0.14;
      this.camY += (this.ty - this.camY) * 0.14;
      this.draw();
    };
    loop();
  }

  setActive(on) { this.active = on; if (on) this.resize(); }
  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;                       // hidden screen: keep the last good size
    const dpr = window.devicePixelRatio || 1;
    this.w = w; this.h = h;
    this.canvas.width = w * dpr; this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.clamp();
  }
  // number of underground layers this player may see (layer index < unlocked)
  unlocked() { return Math.max(1, Math.ceil(this.getMaxDepth() / LAYER_DEPTHS)); }   // layer 1 is always open; a new layer opens every 5 depth levels
  clamp() {
    // horizontal: the world starts at the first hole and only continues to the right.
    // vertical: from sky down to just past the lock line
    const maxY = Math.max(0, SURF + this.unlocked() * LH + 120 - this.h * 0.5);
    this.ty = Math.max(0, Math.min(maxY, this.ty));
    this.tx = Math.max(0, this.tx);
  }
  setHoles(holes) { this.holes = holes; }
  // glide to a hole (surface view)
  focusHole(hole) { this.tx = holeX(hole) - this.w / 2; this.ty = 0; this.clamp(); }
  // jump (no animation) so a hole is centred horizontally; vertical view is kept
  centerOn(hole) {
    this.tx = holeX(hole) - this.w / 2; this.clamp();
    this.camX = this.tx; this.camY = this.ty;
  }

  pulse(hole) { hole._pulse = this.time + 0.0001; }

  /* ---------- day & night (your local clock; ?hour=22 or window.__DH_HOUR for testing) ---------- */
  dayState() {
    if (!S.daynight) return { day: 1, tw: 0, t: .5, elev: 1 };
    const n = new Date(), hr = window.__DH_HOUR ?? (n.getHours() + n.getMinutes() / 60 + n.getSeconds() / 3600), t = (hr % 24) / 24;
    const elev = Math.sin((t - .25) * TAU);
    return { day: Math.max(0, Math.min(1, (elev + .15) / .45)), tw: Math.max(0, 1 - Math.abs(elev) / .3), t, elev };
  }
  stars(ctx, w, sh, ds) {
    if (ds.day > .92) return;
    for (let i = 0; i < 80; i++) {
      const a = (1 - ds.day) * (.35 + .65 * Math.abs(Math.sin(this.time * 1.4 + i * 1.7)));
      ctx.fillStyle = `rgba(255,255,255,${a})`; const s = 1 + hash(i, 3) * 1.8; ctx.fillRect(hash(i, 1) * w, hash(i, 2) * (sh - 60), s, s);
    }
  }
  moon(ctx, w, sh, ds) {
    if (ds.day > .6) return;
    const mt = ((ds.t + .25) % 1) / .5; if (mt > 1) return;
    const x = w * (.1 + .8 * mt), y = sh - 30 - Math.sin(Math.PI * mt) * (SURF - 120), a = 1 - ds.day;
    const g = ctx.createRadialGradient(x, y, 4, x, y, 70); g.addColorStop(0, `rgba(233,213,255,${.55 * a})`); g.addColorStop(1, "rgba(233,213,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 70, 0, TAU); ctx.fill();
    ctx.globalAlpha = a; ctx.fillStyle = "#f5f3ff"; ctx.beginPath(); ctx.arc(x, y, 22, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(167,139,250,.35)"; for (const [dx, dy, r] of [[-7, -4, 5], [6, 5, 4], [3, -9, 3]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  /** darkens the sky and the surface at night, pink at dusk/dawn, lit holes and fireflies */
  nightOverlay(ctx, w, cx, cy) {
    const ds = this.ds, gy = SURF - cy; if (gy <= 0 || (ds.day > .97 && ds.tw < .05)) return;
    const a = .6 * (1 - ds.day);
    if (a > .01) { const g = ctx.createLinearGradient(0, 0, 0, gy + 20); g.addColorStop(0, `rgba(10,5,45,${a})`); g.addColorStop(1, `rgba(34,12,76,${a * .75})`); ctx.fillStyle = g; ctx.fillRect(0, 0, w, gy + 20); }
    if (ds.tw > .05) { const g = ctx.createLinearGradient(0, 0, 0, gy); g.addColorStop(0, "rgba(236,72,153,0)"); g.addColorStop(1, `rgba(251,146,60,${.32 * ds.tw})`); ctx.fillStyle = g; ctx.fillRect(0, 0, w, gy); }
    const night = 1 - ds.day; if (night < .15) return;
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const hole of this.holes) {                          // every hole glows at night
      const x = slotX(hole.x) - cx; if (x < -90 || x > w + 90) continue;
      const g = ctx.createRadialGradient(x, gy - 8, 4, x, gy - 8, 85); g.addColorStop(0, `rgba(251,191,36,${.4 * night})`); g.addColorStop(1, "rgba(251,191,36,0)"); ctx.fillStyle = g; ctx.fillRect(x - 90, gy - 100, 180, 120);
    }
    if (S.particles) for (let i = 0; i < 22; i++) {           // fireflies
      const fx = ((hash(i, 5) * (w + 200) + Math.sin(this.time * .6 + i) * 40 - cx * .6) % (w + 200) + w + 200) % (w + 200) - 100, fy = gy - 14 - hash(i, 6) * 90 + Math.sin(this.time * 1.3 + i * 2) * 10;
      const p = .4 + .6 * Math.abs(Math.sin(this.time * 2 + i)); ctx.fillStyle = `rgba(190,242,100,${p * night})`; ctx.beginPath(); ctx.arc(fx, fy, 2.2, 0, TAU); ctx.fill();
      const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 14); g.addColorStop(0, `rgba(190,242,100,${.35 * p * night})`); g.addColorStop(1, "rgba(190,242,100,0)"); ctx.fillStyle = g; ctx.fillRect(fx - 14, fy - 14, 28, 28);
    }
    ctx.restore();
  }

  /* ---------- weather ---------- */
  drawWeather(ctx, w, h, cx, cy, reg) {
    this.wx ||= []; this.wxKind ||= "clear"; this.wxK ??= 1; this.flash ||= 0;
    const vis = Math.max(0, 1 - cy / (SURF + 60)), target = S.weather ? (window.__DH_WX || weatherAt(reg.id, Date.now())) : "clear";
    if (this.wxKind !== target) { this.wxK -= .02; if (this.wxK <= 0) { this.wxKind = target; this.wxK = 0; } } else this.wxK = Math.min(1, this.wxK + .015);
    const k = this.wxK * vis, kind = this.wxKind, gy = SURF - cy;
    if (this.active && this.frame % 20 === 0) audio.ambience({ rain: kind === "rain" || kind === "storm" ? k : 0, wind: kind === "blizzard" || kind === "sand" || kind === "storm" ? k : kind === "snow" ? k * .4 : 0 });
    if (k < .02 || kind === "clear" || gy <= 0) { this.wx.length = 0; return; }
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, gy + 6); ctx.clip();
    if (kind === "fog") { const g = ctx.createLinearGradient(0, gy - 190, 0, gy + 6); g.addColorStop(0, "rgba(226,232,240,0)"); g.addColorStop(1, `rgba(226,232,240,${.5 * k})`); ctx.fillStyle = g; ctx.fillRect(0, gy - 190, w, 200); }
    if (kind === "sand") { ctx.fillStyle = `rgba(230,180,110,${.2 * k})`; ctx.fillRect(0, 0, w, gy + 6); }
    if (kind === "blizzard") { ctx.fillStyle = `rgba(226,232,240,${.18 * k})`; ctx.fillRect(0, 0, w, gy + 6); }
    const cap = { rain: 90, storm: 150, snow: 70, blizzard: 140, petals: 36, sand: 110, fog: 0 }[kind] || 0;
    const max = Math.round(cap * k * (S.particles ? 1 : .5)), pts = this.wx;
    while (pts.length < max) pts.push(this.newDrop(kind, w, gy, true));
    if (pts.length > max) pts.length = max;
    for (const p of pts) {
      p.x += p.vx + (p.sw ? Math.sin(this.time * 1.5 + p.sw) * .6 : 0); p.y += p.vy; p.r += p.vr || 0;
      if (p.y > gy + 2 || p.x < -60 || p.x > w + 60) Object.assign(p, this.newDrop(kind, w, gy, false));
      if (p.kind === "line") { ctx.strokeStyle = p.c; ctx.lineWidth = p.lw; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * p.len / Math.abs(p.vy || 1), p.y - p.len); ctx.stroke(); }
      else if (p.kind === "petal") { ctx.fillStyle = p.c; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.6, 0, 0, TAU); ctx.fill(); ctx.restore(); }
      else { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill(); }
    }
    if (kind === "storm") {
      if (this.flash <= 0 && Math.random() < .004 * k) { this.flash = 1; if (this.active) setTimeout(() => audio.sfx("thunder"), 450 + Math.random() * 700); }
      if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash * .55 * k})`; ctx.fillRect(0, 0, w, gy + 6); this.flash -= .05; }
    }
    ctx.restore();
  }
  newDrop(kind, w, gy, fill) {
    const y = fill ? Math.random() * gy : -10 - Math.random() * 40, x = Math.random() * (w + 120) - 60, r = Math.random();
    switch (kind) {
      case "rain": return { kind: "line", x, y, vx: -1.5, vy: 13 + r * 6, len: 13, lw: 1.2, c: "rgba(200,220,255,.5)" };
      case "storm": return { kind: "line", x, y, vx: -5, vy: 18 + r * 8, len: 17, lw: 1.4, c: "rgba(210,225,255,.55)" };
      case "snow": return { kind: "dot", x, y, vx: 0, vy: 1.1 + r * 1.4, s: 1.4 + r * 1.8, sw: x, c: "rgba(255,255,255,.9)" };
      case "blizzard": return { kind: "dot", x, y, vx: -6 - r * 3, vy: 3 + r * 2, s: 1.4 + r * 1.2, c: "rgba(255,255,255,.85)" };
      case "petals": return { kind: "petal", x, y, vx: 1 + r, vy: 1 + r * .8, r: r * 6, vr: .03 + r * .04, sw: x, c: r > .5 ? "rgba(249,168,212,.95)" : "rgba(255,255,255,.95)" };
      case "sand": return { kind: "line", x: fill ? x : -20, y: Math.random() * gy, vx: 9 + r * 6, vy: .4, len: 1, lw: 1.6, c: "rgba(235,196,130,.55)" };
      default: return { kind: "dot", x, y, vx: 0, vy: 1, s: 1, c: "rgba(255,255,255,.5)" };
    }
  }

  /* ---------- underground ambience: dust, embers, sparkles ---------- */
  drawMotes(ctx, w, h, cx, cy) {
    if (!S.particles || cy + h < SURF + 10) return;
    const lay = Math.max(0, Math.min(9, Math.floor((cy + h / 2 - SURF) / LH))), tx = biome(lay).tx, top = Math.max(0, SURF - cy);
    ctx.save(); ctx.beginPath(); ctx.rect(0, top, w, h); ctx.clip();
    for (let i = 0; i < 38; i++) {
      const sp = tx === "lava" ? -26 : -6, fx = ((hash(i, 1) * w + Math.sin(this.time * .4 + i) * 24 - cx * .25) % w + w) % w, fy = ((hash(i, 2) * h + this.time * sp * (.5 + hash(i, 3))) % h + h) % h;
      const tw = .3 + .7 * Math.abs(Math.sin(this.time * 1.6 + i * 2.3));
      ctx.fillStyle = tx === "lava" ? `rgba(251,146,60,${tw})` : tx === "crys" ? `rgba(240,171,252,${tw})` : tx === "ore" ? `rgba(253,224,71,${tw})` : `rgba(233,221,255,${tw * .35})`;
      ctx.beginPath(); ctx.arc(fx, fy, tx === "lava" ? 1.8 : tx === "crys" || tx === "ore" ? 1.6 : 1.2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- rare items ---------- */
  drawSurfaceItems(ctx, w, cx, cy) {
    const gy = SURF - cy; if (gy < -40 || gy > this.h + 40) return;
    for (const it of itemsIn(cx - 40, cx + w + 40, "surface")) {
      if (this.isCollected?.(it.id)) continue;
      this.drawItem(ctx, it, it.x - cx, gy - 16);
      this._itemHits.push({ x: it.x - 24, y: SURF - 44, w: 48, h: 48, item: it });
    }
  }
  drawItem(ctx, it, x, y) {
    if (x < -40 || x > this.w + 40) return;
    const bob = Math.sin(this.time * 2 + x * .01) * 3, c = RAR_COL[it.rarity], p = .6 + .4 * Math.sin(this.time * 3 + it.x);
    const g = ctx.createRadialGradient(x, y + bob, 2, x, y + bob, 26); g.addColorStop(0, `rgba(${c},${.55 * p})`); g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y + bob, 26, 0, TAU); ctx.fill();
    const cim = it.icon === "\u{1FA99}" ? coinImage() : null;
    if (cim) ctx.drawImage(cim, x - 13, y + bob - 13, 26, 26);
    else { ctx.font = "22px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(it.icon, x, y + bob); ctx.textBaseline = "alphabetic"; }
    if (it.rarity !== "common") { ctx.fillStyle = `rgba(${c},${p})`; const a = this.time * 2 + it.x; ctx.fillRect(x + Math.cos(a) * 15 - 1, y + bob + Math.sin(a) * 15 - 1, 3, 3); ctx.fillRect(x + Math.cos(a + 3) * 12 - 1, y + bob + Math.sin(a + 3) * 12 - 1, 2, 2); }
  }

  // jump to a world position (used when leaving the café)
  focusWorld(wx, wy) { this.tx = wx - this.w / 2; this.ty = Math.max(0, wy - this.h * 0.6); this.clamp(); this.camX = this.tx; this.camY = this.ty; }

  draw() {
    const ctx = this.ctx, w = this.w, h = this.h, cx = this.camX, cy = this.camY;
    const reg = regionAt(cx + w / 2);
    ctx.clearRect(0, 0, w, h);
    this._itemHits = []; this.ds = this.dayState();
    this.drawSky(ctx, w, reg, cx, cy);
    this.drawSurface(ctx, w, reg, cx, cy);
    this.drawGaps(ctx, w, cx, cy);
    this.drawSurfaceItems(ctx, w, cx, cy);
    this.nightOverlay(ctx, w, cx, cy);
    this.drawWeather(ctx, w, h, cx, cy, reg);

    const U_ = this.unlocked(), lockY = SURF + U_ * LH - cy;
    const first = Math.max(0, Math.floor((cy - SURF) / LH));
    for (let i = first; i < U_ && SURF + i * LH - cy < h; i++) this.drawLayer(ctx, w, i, SURF + i * LH - cy, cx);
    this.drawCafes(ctx, w, cx, cy);
    this.drawMotes(ctx, w, h, cx, cy);
    this.holes.forEach((hole) => this.drawHole(ctx, hole, cx, cy));

    // Fog: layers below the player's deepest hole stay hidden until reached
    if (lockY < h) {
      const g = ctx.createLinearGradient(0, lockY, 0, lockY + 18);
      g.addColorStop(0, "rgba(18,6,43,.55)"); g.addColorStop(1, "#12062b");
      ctx.fillStyle = g; ctx.fillRect(0, lockY, w, 18);
      ctx.fillStyle = "#12062b"; ctx.fillRect(0, lockY + 18, w, h);
      ctx.fillStyle = "rgba(233,213,255,.92)"; ctx.font = "600 15px system-ui"; ctx.textAlign = "center";
      ctx.fillText(`🔒 Layer ${U_ + 1} opens when your hole reaches depth ${U_ * LAYER_DEPTHS + 1}`, w / 2, lockY + 70);
    }
    this.holes.forEach((h) => { if (h._tag) { this.nameTag(ctx, h, ...h._tag); h._tag = null; } });
    // music follows the place you are looking at
    if (this.active && (this.frame = (this.frame || 0) + 1) % 40 === 0) {
      const midY = cy + h / 2;
      if (midY < SURF + 20) audio.theme(reg.id); else audio.theme(audio.LAYER_THEMES[Math.max(0, Math.min(9, Math.floor((midY - SURF) / LH)))]);
    }
    // depth gauge
    const lay = Math.max(0, Math.min(U_ - 1, Math.floor((cy + h / 2 - SURF) / LH)));
    if (cy + h / 2 > SURF && U_ > 0) {
      const b = biome(lay);
      ctx.fillStyle = "rgba(91,33,182,.86)"; ctx.beginPath(); ctx.roundRect(12, 12, 160, 30, 15); ctx.fill();
      ctx.fillStyle = "#f1f5f9"; ctx.font = "600 13px system-ui"; ctx.textAlign = "left";
      ctx.fillText(`Layer ${lay + 1} · ${b.name}`, 22, 32);
    }
  }

  drawSky(ctx, w, reg, cx, cy) {
    const sh = SURF - cy; if (sh <= 0) return;
    const skyA = art("sky-" + reg.id);
    if (skyA) cover(ctx, skyA, 0, sh - SURF, w, SURF);
    else {
      const g = ctx.createLinearGradient(0, 0, 0, sh);
      g.addColorStop(0, reg.sky[0]); g.addColorStop(.55, reg.sky[1]); g.addColorStop(1, reg.sky[2]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, sh);
    }
    const ds = this.ds || this.dayState(); let sx = w - 110, sy = 70 - cy * .6; const sunA = art("sun");
    if (S.daynight) { const st = Math.max(0, Math.min(1, (ds.t - .25) / .5)); sx = w * (.1 + .8 * st); sy = sh - 30 - Math.sin(Math.PI * st) * (SURF - 110); }
    const sunUp = !S.daynight || (ds.t > .22 && ds.t < .78);
    this.stars(ctx, w, sh, ds); this.moon(ctx, w, sh, ds);
    if (!sunUp) { /* the sun is below the horizon */ } else if (sunA) { ctx.save(); ctx.translate(sx, sy); drawArt(ctx, sunA); ctx.restore(); }
    else {
    const gl = ctx.createRadialGradient(sx, sy, 5, sx, sy, 70);
    gl.addColorStop(0, "rgba(253,224,71,.85)"); gl.addColorStop(1, "rgba(253,224,71,0)");
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(sx, sy, 70, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.arc(sx, sy, 26, 0, TAU); ctx.fill();
    }
    // far hills (parallax)
    const hillA = art("hills-" + reg.id);
    if (hillA) tileX(ctx, hillA, sh - hillA.spec.h, hillA.spec.h, cx * .3, w);
    else {
    ctx.fillStyle = "rgba(15,23,42,.18)"; ctx.beginPath(); ctx.moveTo(0, sh);
    for (let x = 0; x <= w; x += 20) {
      const wx = x + cx * .3; ctx.lineTo(x, sh - 40 - Math.sin(wx / 160) * 22 - Math.sin(wx / 57) * 7);
    }
    ctx.lineTo(w, sh); ctx.fill();
    }
    const cloudA = art("cloud"), birdA = art("bird");
    // clouds & birds (endless, parallax)
    for (let i = Math.floor((cx * .25) / 340) - 1; i < (cx * .25 + w) / 340 + 1; i++) {
      const x = i * 340 + hash(i, 1) * 200 - cx * .25 + this.time * 8, y = (20 + hash(i, 2) * 80) - cy * .7, s = .7 + hash(i, 3) * .6;
      if (cloudA) { ctx.save(); ctx.translate(x + 25 * s, y - 4 * s); drawArt(ctx, cloudA, { w: cloudA.spec.w * s }); ctx.restore(); }
      else {
        ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath();
        ctx.arc(x, y, 20 * s, 0, TAU); ctx.arc(x + 24 * s, y - 7 * s, 26 * s, 0, TAU); ctx.arc(x + 50 * s, y, 18 * s, 0, TAU); ctx.fill();
      }
      if (hash(i, 4) > .55) {
        const bx = x + 120 + Math.sin(this.time + i) * 30, by = y + 40 + Math.sin(this.time * 2 + i) * 6, f = Math.sin(this.time * 9 + i) * 5;
        if (birdA) { ctx.save(); ctx.translate(bx, by); drawArt(ctx, birdA, { frame: animFrame(birdA.spec, this.time, i) }); ctx.restore(); }
        else { ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx - 9, by + f); ctx.quadraticCurveTo(bx, by - 5, bx + 9, by + f); ctx.stroke(); }
      }
    }
  }

  drawSurface(ctx, w, reg, cx, cy) {
    const gy = SURF - cy; if (gy > this.h + 160 || gy < -160) return;
    // trees: every 150px cell may hold a tree whose species depends on its own region
    for (let i = Math.max(0, Math.floor((cx - 100) / 150)); i < (cx + w + 100) / 150; i++) {
      if (hash(i, 5) < .25) continue;
      const r = regionAt(i * 150), kind = r.trees[Math.floor(hash(i, 13) * r.trees.length)];
      const x = i * 150 + hash(i, 6) * 80 - cx, sc = .8 + hash(i, 7) * .6;
      ctx.save(); ctx.translate(x, gy + 2); tree(ctx, kind, sc, r, Math.sin(this.time * 1.4 + i) * 2.5); ctx.restore();
    }
    // ground
    const groundA = art("ground-" + reg.id);
    if (groundA) tileX(ctx, groundA, gy - 24, 32, cx, w);
    else {
    ctx.fillStyle = reg.grass; ctx.fillRect(0, gy - 12, w, 20);
    ctx.strokeStyle = reg.blade; ctx.lineWidth = 1.5;
    for (let x = -((cx % 7) + 7); x < w; x += 7) {
      const sway = Math.sin(this.time * 2.2 + (x + cx) * .12) * 2.5;
      ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + sway, gy - 9 - hash(Math.floor((x + cx) / 7), 8) * 4); ctx.stroke();
    }
    }
    // animals: species come from the region they are walking in
    const TT = S.creatures === "still" ? 0 : this.time;        // settings: animated / still / hidden
    for (let i = Math.max(0, Math.floor((cx - 300) / 400)); S.creatures !== "off" && i < (cx + w + 300) / 400; i++) {
      if (hash(i, 9) < .2) continue;
      const fa = regionAt(i * 400).fauna, type = fa[Math.floor(hash(i, 10) * fa.length)];
      const sp = .15 + hash(i, 11) * .25, ph = hash(i, 12) * TAU, m = TT * sp + ph;
      ctx.save(); ctx.translate(i * 400 + 200 + Math.sin(m) * 150 - cx, gy + 2);
      drawAnimal(ctx, type, TT + ph, Math.cos(m) >= 0 ? 1 : -1, walked(150, m), Math.abs(Math.cos(m)) < .22); ctx.restore();
    }
  }

  drawLayer(ctx, w, i, y, cx) {
    const b = biome(i);
    // texture: depth-N.png (exact depth) > <biome>.png (hue-shifted for deeper repeats) > procedural
    const tex = artFile(`assets/underground/layers/depth-${i + 1}.png`) || art("layer-" + b.k, b.hue);
    if (tex) tileX(ctx, tex, y, LH + 1, cx, w);
    else {
      const g = ctx.createLinearGradient(0, y, 0, y + LH);
      g.addColorStop(0, hsl(b, 5)); g.addColorStop(1, hsl(b, -4));
      ctx.fillStyle = g; ctx.fillRect(0, y, w, LH + 1);
    }

    const c0 = Math.max(0, Math.floor(cx / 70) - 1), c1 = Math.ceil((cx + w) / 70) + 1;
    ctx.save(); ctx.beginPath(); ctx.rect(0, y, w, LH); ctx.clip();
    for (let c = c0; c < c1 && !tex; c++) {
      const sd = i, by = y;
      const r1 = hash(sd, c, 1), r2 = hash(sd, c, 2), r3 = hash(sd, c, 3);
      const x = c * 70 + r1 * 60 - cx, py = by + 14 + r2 * (LH - 28);
      switch (b.tx) {
        case "roots": ctx.strokeStyle = "rgba(60,30,10,.45)"; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(x, by); ctx.quadraticCurveTo(x + 14 * (r3 - .5) * 2, by + 30, x + 10 * (r2 - .5), by + 30 + r3 * 50); ctx.stroke(); break;
        case "pebble": ctx.fillStyle = `hsla(${b.h},10%,${50 + r3 * 20}%,.35)`;
          ctx.beginPath(); ctx.ellipse(x, py, 2 + r3 * 4, 1.5 + r3 * 3, r2, 0, TAU); ctx.fill(); break;
        case "brick": ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 1;
          ctx.strokeRect(x, by + Math.floor(r2 * 4) * 32 + 4, 40 + r3 * 30, 28); break;
        case "bone": ctx.strokeStyle = "rgba(231,229,228,.28)"; ctx.lineWidth = 2.2; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + 18, py + 6 * (r3 - .5) * 2); ctx.stroke(); break;
        case "ore": if (r3 > .35) { ctx.fillStyle = `rgba(251,191,36,${.35 + .4 * Math.abs(Math.sin(this.time * 2 + c + i))})`;
          ctx.beginPath(); ctx.moveTo(x, py - 4); ctx.lineTo(x + 4, py); ctx.lineTo(x, py + 4); ctx.lineTo(x - 4, py); ctx.fill(); } break;
        case "crys": ctx.fillStyle = `hsla(${190 + r3 * 120},80%,65%,${.2 + .25 * Math.abs(Math.sin(this.time + c * 1.7))})`;
          ctx.beginPath(); ctx.moveTo(x, py - 7); ctx.lineTo(x + 4, py); ctx.lineTo(x - 4, py); ctx.fill(); break;
        case "lava": ctx.strokeStyle = `rgba(251,113,22,${.25 + .35 * Math.abs(Math.sin(this.time * 1.5 + c))})`; ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + 12, py + 8 * (r3 - .5)); ctx.lineTo(x + 20, py + 14 * (r2 - .5)); ctx.stroke(); break;
      }
    }
    // creatures: up to 2 per 210px cell
    const TT = S.creatures === "still" ? 0 : this.time;
    for (let c = Math.max(0, Math.floor((cx - 40) / 210)); S.creatures !== "off" && c < (cx + w + 40) / 210; c++) {
      const sd = i, by = y;
      const n = Math.floor(hash(sd, c, 20) * 2.4);
      for (let k = 0; k < n; k++) {
        const type = b.c[Math.floor(hash(sd, c, 30 + k) * b.c.length)], kd = KIND[type], ph = hash(sd, c, 40 + k) * TAU;
        const m = TT * kd.v + ph, bx = c * 210 + hash(sd, c, 50 + k) * 210;
        let x = bx + Math.sin(m) * kd.r - cx, yy = by + kd.y * LH;
        if (kd.fly) yy += Math.sin(m * 2.3) * 22;
        ctx.save(); ctx.translate(x, yy);
        const dir = kd.v && Math.cos(m) < 0 ? -1 : 1, ca = art("ug-" + type);   // assets/underground/creatures/<type>.png
        if (ca) drawArt(ctx, ca, { frame: animFrame(ca.spec, TT, ph), dir });
        else { ctx.scale(dir * 1.5, 1.5); U[kd.base || type](ctx, TT, ph, { ...kd, hue: 170 + hash(sd, c, 60) * 160 }); }
        ctx.restore();
      }
    }
    // rare items lying around today
    for (const it of itemsIn(cx - 40, cx + w + 40, i)) {
      if (this.isCollected?.(it.id)) continue;
      this.drawItem(ctx, it, it.x - cx, y + it.f * LH);
      this._itemHits.push({ x: it.x - 24, y: SURF + i * LH + it.f * LH - 28, w: 48, h: 48, item: it });
    }
    // layer 1: the two sprite beetles crawl around
    if (i === 0) {
      for (let c = Math.max(0, Math.floor((cx - 60) / 230)); c < (cx + w + 60) / 230; c++) {
        for (let k = 0; k < 2; k++) {
          if (hash(0, c, 70 + k) < .3) continue;
          const which = hash(0, c, 80 + k) < .5 ? "ug-beetle-blue" : "ug-beetle-purple";
          const ph = hash(0, c, 90 + k) * TAU, sp = .35 + hash(0, c, 95 + k) * .35;
          const m = this.time * sp + ph, bx = c * 230 + 40 + k * 110 + hash(0, c, 100 + k) * 60;
          ctx.save(); ctx.translate(bx + Math.sin(m) * 55 - cx, y + LH - 10 - k * 22);
          const ba = art(which), bd = Math.cos(m) >= 0 ? 1 : -1;
          if (ba) drawArt(ctx, ba, { frame: Math.floor(walked(55, m) / 2.6), dir: bd });
          else { ctx.scale(bd * 1.5, 1.5); ctx.translate(0, -6); U.beetle(ctx, this.time, which === "ug-beetle-blue" ? 0.2 : 0.75); }
          ctx.restore();
        }
      }
    }
    ctx.restore();
    // layer divider
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(0, y, w, 2);
  }

  drawHole(ctx, hole, cx, cy) {
    const x = holeX(hole) - cx, top = SURF - cy, dep = holeDepthPx(hole.depth);
    if (x < -90 || x > this.w + 90 || top > this.h) return;
    const lockBottom = SURF + this.unlocked() * LH;
    const shaftH = Math.min(dep, lockBottom - SURF);       // never draw into fog
    const own = hole.owner === this.owner;
    // shaft
    const g = ctx.createLinearGradient(x - 38, 0, x + 38, 0);
    g.addColorStop(0, "#1c1917"); g.addColorStop(.5, "#050403"); g.addColorStop(1, "#1c1917");
    const shaftA = art("hole-shaft");
    if (shaftA) tileY(ctx, shaftA, x - 38, top, 76, shaftH);
    else { ctx.fillStyle = g; ctx.fillRect(x - 38, top, 76, shaftH); }
    ctx.strokeStyle = own ? "#fbbf24" : "#57534e"; ctx.lineWidth = 2; ctx.strokeRect(x - 38, top, 76, shaftH);
    // rungs
    ctx.strokeStyle = "rgba(255,255,255,.06)"; ctx.lineWidth = 1;
    if (!shaftA) for (let y = LH; y < shaftH; y += LH) { ctx.beginPath(); ctx.moveTo(x - 38, top + y); ctx.lineTo(x + 38, top + y); ctx.stroke(); }
    // mound + opening
    const moundA = art("hole-mound");
    if (moundA && !hole.style) { ctx.save(); ctx.translate(x, top); drawArt(ctx, moundA); ctx.restore(); }
    else drawEntrance(ctx, hole.style || 0, x, top, this.time);
    if (hole._pulse) {                                      // buy / deepen: expanding ring
      const dt = this.time - hole._pulse;
      if (dt > 1.8) hole._pulse = 0; else { ctx.save(); ctx.strokeStyle = `rgba(244,114,182,${1 - dt / 1.8})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(x, top, 44 + dt * 70, 14 + dt * 24, 0, 0, TAU); ctx.stroke(); ctx.restore(); }
    }
    if (hole._party) { ctx.font = "22px system-ui"; ctx.textAlign = "center"; ctx.fillText("🎉", x + 50, top - 70 + Math.sin(this.time * 4) * 4); }
    // profile sign on the surface so every hole is recognisable at a glance
    const postA = art("hole-post");
    if (postA) { ctx.save(); ctx.translate(x, top - 10); drawArt(ctx, postA); ctx.restore(); }
    else { ctx.strokeStyle = "#78350f"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, top - 14); ctx.lineTo(x, top - 34); ctx.stroke(); }
    this.avatar(ctx, hole, x, top - 56, 40, own);
    this.nameTag(ctx, hole, x, top - 78);
    if (hole._sale) this.saleTag(ctx, hole._sale, x, top - 100);
    // burrow chamber at the bottom of the shaft: bigger picture + name, sinks as the hole deepens
    if (dep <= lockBottom - SURF) {
      const by = top + dep;
      const chA = art("hole-chamber");
      if (chA) { ctx.save(); ctx.translate(x, by - 24); drawArt(ctx, chA); ctx.restore(); }
      else { ctx.fillStyle = "#0c0a09"; ctx.beginPath(); ctx.ellipse(x, by - 24, 58, 42, 0, 0, TAU); ctx.fill(); }
      this.avatar(ctx, hole, x, by - 30, 60, own);
      hole._tag = [x, by + 20];   // drawn after the fog so it stays readable
    }
    hole._hit = { x: x + cx - 52, y: SURF - 116, w: 104, h: Math.max(100, shaftH + 122) };
  }

  // round profile picture (falls back to a rabbit face in the owner's colours)
  avatar(ctx, hole, x, y, size, own) {
    const r = size / 2, img = getImage(hole.image);
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
    if (img?.complete && img.naturalWidth) {
      const sc = Math.max(size / img.naturalWidth, size / img.naturalHeight), dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
      ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
    } else if (art("avatar-default")) {
      const a = art("avatar-default"), sc = Math.max(size / a.iw, size / a.ih);
      ctx.drawImage(a.im, x - a.iw * sc / 2, y - a.ih * sc / 2, a.iw * sc, a.ih * sc);
    } else {
      const c = hole.customRabbit?.color || "#94a3b8", e = hole.customRabbit?.earColor || "#64748b";
      ctx.fillStyle = "#1e293b"; ctx.fillRect(x - r, y - r, size, size);
      ctx.fillStyle = e; ctx.beginPath(); ctx.ellipse(x - r * .35, y - r * .55, r * .17, r * .5, -.15, 0, TAU); ctx.ellipse(x + r * .35, y - r * .55, r * .17, r * .5, .15, 0, TAU); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y + r * .15, r * .55, r * .5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#0f172a"; ctx.beginPath(); ctx.arc(x - r * .2, y + r * .05, r * .07, 0, TAU); ctx.arc(x + r * .2, y + r * .05, r * .07, 0, TAU); ctx.fill();
      ctx.fillStyle = "#f43f5e"; ctx.beginPath(); ctx.arc(x, y + r * .22, r * .07, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = own ? "#fbbf24" : "#f8fafc"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  }

  /* billboards (admin-editable sponsor boards) and a few stalls, in the gaps between groups of 4 holes */
  drawGaps(ctx, w, cx, cy) {
    this._gapHits = [];
    const gy = SURF - cy; if (gy > this.h + 260 || gy < -260) return;
    const maxX = this.holes.reduce((m, h) => Math.max(m, h.x), 0);
    for (let n = 0; groupEnd(n - 1) <= maxX; n++) {        // every gap up to the first one ahead of the last hole
      const g = gapLayout(n), bx = g.billboardX - cx;
      if (bx > -200 && bx < w + 200) { this.billboard(ctx, this.getAd?.(n) || null, bx, gy); this._gapHits.push({ x: g.billboardX - 125, y: SURF - 215, w: 250, h: 215, n, key: n, kind: "billboard" }); }
      const sx = g.shopX - cx;
      if (g.shop && sx > -200 && sx < w + 200) { this.stall(ctx, g.shop, this.getAd?.("s" + n) || null, sx, gy); this._gapHits.push({ x: g.shopX - 70, y: SURF - 125, w: 140, h: 125, n, key: "s" + n, kind: g.shop.k }); }
    }
  }
  /* the underground café below every stall (depth 20): a ladder shaft and a neon sign */
  drawCafes(ctx, w, cx, cy) {
    const maxX = this.holes.reduce((m, h) => Math.max(m, h.x), 0), top = SURF - cy, cafeY = holeDepthPx(CAFE_DEPTH), lockPx = this.unlocked() * LH;
    for (let n = 0; groupEnd(n - 1) <= maxX; n++) {
      const g = gapLayout(n); if (!g.shop) continue;
      const x = g.shopX - cx; if (x < -120 || x > w + 120) continue;
      const bottom = Math.min(cafeY, lockPx);
      ctx.fillStyle = "#0c0a09"; ctx.fillRect(x - 20, top, 40, bottom); ctx.strokeStyle = "#78350f"; ctx.lineWidth = 2; ctx.strokeRect(x - 20, top, 40, bottom);
      ctx.strokeStyle = "rgba(251,191,36,.35)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 9, top); ctx.lineTo(x - 9, top + bottom); ctx.moveTo(x + 9, top); ctx.lineTo(x + 9, top + bottom); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); for (let ry = 14; ry < bottom; ry += 16) { ctx.moveTo(x - 9, top + ry); ctx.lineTo(x + 9, top + ry); } ctx.stroke();
      if (cafeY > lockPx) continue;                           // the café itself is still hidden in the fog
      const y = SURF + cafeY - cy, p = .65 + .35 * Math.sin(this.time * 3 + n);
      ctx.fillStyle = "#1c1209"; ctx.beginPath(); ctx.ellipse(x, y - 26, 82, 46, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#b45309"; ctx.lineWidth = 3; ctx.stroke();
      ctx.shadowColor = "#f472b6"; ctx.shadowBlur = 14 * p; ctx.fillStyle = "#fbcfe8"; ctx.font = "bold 22px system-ui"; ctx.textAlign = "center";
      ctx.fillText("☕ CAFÉ", x, y - 26); ctx.shadowBlur = 0;
      ctx.fillStyle = "#cbd5e1"; ctx.font = "10px system-ui"; ctx.fillText("meet other players", x, y - 10);
      this._gapHits.push({ x: g.shopX - 82, y: SURF + cafeY - 72, w: 164, h: 92, n, key: "c" + n, kind: "cafe" });
    }
  }
  billboard(ctx, ad, x, gy) {
    const W = 240, H = 112, top = gy - 212, on = ad && ad.on !== false ? ad : null;   // very tall: always above the name tags
    ctx.fillStyle = "#44403c"; ctx.fillRect(x - 78, top + H - 4, 10, 212 - H + 4); ctx.fillRect(x + 68, top + H - 4, 10, 212 - H + 4);
    ctx.fillStyle = "#292524"; ctx.fillRect(x - 84, gy - 4, 22, 8); ctx.fillRect(x + 62, gy - 4, 22, 8);
    ctx.fillStyle = on?.color || "#1e293b"; ctx.beginPath(); ctx.roundRect(x - W / 2, top, W, H, 10); ctx.fill();
    ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "#fde68a"; for (const dx of [-80, 0, 80]) { ctx.beginPath(); ctx.arc(x + dx, top - 6, 4, 0, TAU); ctx.fill(); }
    ctx.font = "bold 9px system-ui"; ctx.textAlign = "left"; ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillText("SPONSORED", x - W / 2 + 12, top + 16);
    const img = on?.image ? getImage(on.image) : null, hasImg = !!(img?.complete && img.naturalWidth);
    let tx = x - W / 2 + 14;
    if (hasImg) {
      const s = 76, ix = x - W / 2 + 10, iy = top + 26, k = Math.max(s / img.naturalWidth, s / img.naturalHeight);
      ctx.save(); ctx.beginPath(); ctx.roundRect(ix, iy, s, s, 8); ctx.clip();
      ctx.drawImage(img, ix + (s - img.naturalWidth * k) / 2, iy + (s - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k); ctx.restore();
      tx = ix + s + 10;
    }
    const maxW = x + W / 2 - 12 - tx;
    ctx.fillStyle = "#f8fafc"; ctx.font = "bold 16px system-ui";
    const title = this.fit(ctx, on?.title || "YOUR AD HERE", maxW); ctx.fillText(title, tx, top + 42);
    ctx.font = "12px system-ui"; ctx.fillStyle = "#cbd5e1";
    this.wrap(ctx, on?.text || "Sponsor this billboard - contact the admin.", maxW, 3).forEach((l, i) => ctx.fillText(l, tx, top + 62 + i * 14));
  }
  stall(ctx, shop, ad, x, gy) {
    ctx.fillStyle = "#78350f"; ctx.fillRect(x - 56, gy - 78, 6, 78); ctx.fillRect(x + 50, gy - 78, 6, 78);
    ctx.fillStyle = "#a16207"; ctx.fillRect(x - 60, gy - 26, 120, 26);                      // counter
    ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.fillRect(x - 60, gy - 26, 120, 4);
    for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? "#fff7ed" : shop.c; ctx.beginPath(); ctx.moveTo(x - 66 + k * 22, gy - 96); ctx.lineTo(x - 44 + k * 22, gy - 96); ctx.lineTo(x - 48 + k * 22, gy - 78); ctx.lineTo(x - 62 + k * 22, gy - 78); ctx.fill(); }
    ctx.font = "22px system-ui"; ctx.textAlign = "center";
    [-34, -8, 18, 40].forEach((dx, i) => ctx.fillText(shop.e, x + dx, gy - 30 + Math.sin(this.time * 2 + i) * 1.5));
    ctx.font = "bold 12px system-ui";
    const sg = this.fit(ctx, ad?.title || shop.n, 98);
    ctx.fillStyle = "#292524"; ctx.beginPath(); ctx.roundRect(x - 54, gy - 120, 108, 20, 6); ctx.fill();
    ctx.fillStyle = "#fde68a"; ctx.fillText(sg, x, gy - 106);
  }
  fit(ctx, t, maxW) { while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -2) + "…"; return t; }
  wrap(ctx, text, maxW, maxLines) {
    const out = []; let line = "";
    for (const wd of String(text).split(/\s+/)) {
      const t = line ? line + " " + wd : wd;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = wd; } else line = t;
      if (out.length === maxLines) break;
    }
    if (out.length < maxLines && line) out.push(line);
    return out.slice(0, maxLines);
  }

  // orange "FOR SALE" ribbon with the price (set by the market layer: hole._sale)
  saleTag(ctx, price, x, y) {
    const t = `FOR SALE ${price}`;
    ctx.font = "bold 11px system-ui"; ctx.textAlign = "center";
    const w = ctx.measureText(t).width + 14;
    ctx.fillStyle = "#f97316"; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 11, w, 19, 9); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillText(t, x, y + 3);
  }

  nameTag(ctx, hole, x, y) {
    let n = hole.username || `Rabbit #${hole.id}`; if (n.length > 14) n = n.slice(0, 13) + "…";
    if (hole.special) n = "★ " + n;
    ctx.font = "bold 12px system-ui"; ctx.textAlign = "center";
    const w = ctx.measureText(n).width + 14;
    ctx.fillStyle = hole.special ? "#b45309" : "rgba(91,33,182,.9)"; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 12, w, 20, 10); ctx.fill();
    ctx.fillStyle = "#f1f5f9"; ctx.fillText(n, x, y + 2);
  }

  handleClick(e) {
    const r = this.canvas.getBoundingClientRect();
    const mx = e.clientX - r.left + this.camX, my = e.clientY - r.top + this.camY;
    for (const g of this._itemHits || []) if (mx >= g.x && mx <= g.x + g.w && my >= g.y && my <= g.y + g.h) { this.onItem?.(g.item); return; }
    for (const g of this._gapHits || []) if (mx >= g.x && mx <= g.x + g.w && my >= g.y && my <= g.y + g.h) { (g.kind === "cafe" ? this.onCafe : this.onGap)?.(g); return; }
    for (const hole of this.holes) {
      const b = hole._hit;
      if (b && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) { this.onHoleClick(hole); return; }
    }
  }
}

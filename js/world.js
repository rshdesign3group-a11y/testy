/**
 * Procedural world – deterministic, so every layer/column is generated the
 * same way for every player and can go on forever (any depth, any x).
 */
export const TAU = Math.PI * 2;
export const hash = (a, b = 0, c = 0) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + 13.37) * 43758.5453;
  return x - Math.floor(x);
};

// 8 base biomes; each further group of 8 shifts hue so layers never repeat exactly
const BIOMES = [
  { k: "topsoil", n: "Topsoil",      h: 28,  s: 45, l: 30, tx: "roots",  c: ["worm", "root"] },
  { k: "clay", n: "Clay",         h: 14,  s: 50, l: 30, tx: "pebble", c: ["beetle", "worm", "root"] },
  { k: "gravel", n: "Gravel",       h: 35,  s: 12, l: 36, tx: "pebble", c: ["mole", "goldworm", "beetle"] },
  { k: "stone", n: "Stone",        h: 215, s: 8,  l: 30, tx: "brick",  c: ["bat", "crystal", "skeleton"] },
  { k: "boneyard", n: "Boneyard",     h: 40,  s: 10, l: 20, tx: "bone",   c: ["skeleton", "bat", "bone"] },
  { k: "gold-vein", n: "Gold vein",    h: 42,  s: 40, l: 20, tx: "ore",    c: ["goldworm", "goldworm", "nugget"] },
  { k: "crystal-cave", n: "Crystal cave", h: 240, s: 35, l: 20, tx: "crys",   c: ["crystal", "diamond", "bat"] },
  { k: "magma", n: "Magma",        h: 8,   s: 60, l: 14, tx: "lava",   c: ["salamander", "diamond", "goldworm"] }
];
const cache = new Map();
export function biome(i) {
  if (!cache.has(i)) {
    const b = BIOMES[i % 8], tier = Math.floor(i / 8);
    cache.set(i, { ...b, i, tier, hue: tier * 47, h: (b.h + tier * 47) % 360, l: Math.max(8, b.l - tier * 1.5),
      name: b.n + (tier ? ` ${tier + 1}` : "") });
  }
  return cache.get(i);
}
export const hsl = (b, dl = 0, a = 1) => `hsla(${b.h},${b.s}%,${Math.max(3, b.l + dl)}%,${a})`;

// Surface changes every 1800px: new sky, ground, tree species and animals
export const REGIONS = [
  { id: "meadow", sky: ["#0c4a6e", "#38bdf8", "#bae6fd"], grass: "#4ade80", blade: "#22c55e", leaf: ["#14532d", "#166534", "#15803d"], trunk: "#78350f",
    trees: ["oak", "oak", "pine"], fauna: ["rabbit", "sheep", "fox", "deer", "sheep", "squirrel", "hedgehog"] },
  { id: "desert", sky: ["#7c2d12", "#fb923c", "#fde68a"], grass: "#e5b863", blade: "#b45309", leaf: ["#15803d", "#16a34a", "#4d7c0f"], trunk: "#92400e",
    trees: ["cactus", "palm", "cactus"], fauna: ["camel", "fennec", "snake"] },
  { id: "snow", sky: ["#1e293b", "#64748b", "#e2e8f0"], grass: "#f1f5f9", blade: "#cbd5e1", leaf: ["#0f766e", "#115e59", "#134e4a"], trunk: "#44403c",
    trees: ["pine", "pine", "oak"], fauna: ["polar", "wolf", "penguin", "sheep", "rabbit"] },
  { id: "fairy", sky: ["#4c1d95", "#c026d3", "#fbcfe8"], grass: "#f9a8d4", blade: "#db2777", leaf: ["#be185d", "#db2777", "#f472b6"], trunk: "#581c87",
    trees: ["oak", "palm", "oak"], fauna: ["unicorn", "sheep", "rabbit", "squirrel", "fox"] },
  { id: "jungle", sky: ["#052e16", "#15803d", "#bbf7d0"], grass: "#22c55e", blade: "#15803d", leaf: ["#064e3b", "#047857", "#10b981"], trunk: "#422006",
    trees: ["palm", "oak", "palm"], fauna: ["snake", "sheep", "squirrel", "deer", "hedgehog"] }
];
// Regions follow each other in a fixed order, every one exactly REGION_W px wide
export const REGION_W = 3000;
export const regionAt = (wx) => REGIONS[Math.floor(Math.max(0, wx) / REGION_W) % REGIONS.length];

/* ---------- depth / layers ---------- */
export const MAX_DEPTH = 50;          // deepest a hole can ever be
export const LAYER_DEPTHS = 5;        // 10 layers x 5 depth levels; every new layer = one more floor
export const layerOf = (d) => Math.ceil(Math.max(1, d) / LAYER_DEPTHS);

/* ---------- horizontal layout ----------
 * A billboard gap follows every 8-14 holes (random but fixed per gap). Every 3rd gap also holds a stall,
 * and below each stall (depth 20) there is a café. */
export const SLOT_W = 170, GAP = 300, SHOP_EXTRA = 220, CAFE_DEPTH = 20;
export const SHOPS = [
  { k: "carrot", n: "Carrot Stand", e: "🥕", c: "#f97316" },
  { k: "tools", n: "Tool Shop", e: "⛏️", c: "#64748b" },
  { k: "potion", n: "Potion Stall", e: "🧪", c: "#a855f7" }
];
const groupSize = (k) => 8 + Math.floor(hash(k, 91) * 7);              // 8..14 holes before gap k
const hasShop = (n) => n % 3 === 0;
const gapW = (n) => GAP + (hasShop(n) ? SHOP_EXTRA : 0);
const ends = [], offs = [0];                                           // last hole index of group k / total gap width before group k
function ensure(k) { while (ends.length <= k) { const i = ends.length; ends.push((i ? ends[i - 1] : -1) + groupSize(i)); offs.push(offs[i] + gapW(i)); } }
export const groupEnd = (k) => { if (k < 0) return -1; ensure(k); return ends[k]; };
export function slotX(x) { let k = 0; while (groupEnd(k) < x) k++; ensure(k); return 120 + x * SLOT_W + offs[k]; }
export function gapLayout(n) {
  const cx = slotX(groupEnd(n)) + (SLOT_W + gapW(n)) / 2, shop = hasShop(n) ? SHOPS[Math.floor(n / 3) % SHOPS.length] : null;
  return { n, cx, billboardX: shop ? cx - 120 : cx, shop, shopX: cx + 150 };
}

/* ---------- hole entrance styles (picked when buying) ---------- */
export const HOLE_STYLES = ["Classic mound", "Stone ring", "Wooden door", "Mushroom hut", "Crystal gate", "Flower burrow", "Royal gate"];
export const SPECIAL_STYLE = 6;       // founder only

/* ---------- rabbit look (every character is different) ---------- */
const strHash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
function hueOf(col) {
  const m = /^hsla?\((\d+)/.exec(col || ""); if (m) return +m[1];
  const x = /^#?([0-9a-f]{6})$/i.exec(col || ""); if (!x) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(x[1].slice(i, i + 2), 16) / 255), mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (!d) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
}
/** acc: 0 none, 1 scarf, 2 glasses, 3 bow, 4 flower, 5 crown (founder) */
export function lookFor(id, rabbit, crown = false) {
  const r = strHash(id), hue = Math.round(r * 360);
  const color = rabbit?.color || `hsl(${hue},65%,55%)`, ear = rabbit?.earColor || `hsl(${hue},60%,38%)`;
  return { color, ear, acc: crown ? 5 : (rabbit?.acc ?? Math.floor(strHash(id + "acc") * 5)), hue: hueOf(color) };
}

/** A random character for the hole-creation screen (the player can roll as often as they like, but only there). */
export function rollLook() {
  const h = Math.floor(Math.random() * 360), s = 55 + Math.floor(Math.random() * 35), l = 45 + Math.floor(Math.random() * 20);
  const eh = (h + Math.floor(Math.random() * 50) - 25 + 360) % 360;
  return { color: `hsl(${h},${s}%,${l}%)`, earColor: `hsl(${eh},${s}%,${Math.max(25, l - 18)}%)`, acc: Math.floor(Math.random() * 5) };
}

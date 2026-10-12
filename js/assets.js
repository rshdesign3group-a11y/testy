/**
 * ART / ASSET SYSTEM
 * ------------------------------------------------------------------
 * Every visual in the game has a fixed file name below. Drop a PNG with
 * that name into the assets/ folder and reload the page – the game uses it.
 * If the file does not exist, the game silently keeps the built-in
 * (procedural) drawing. Nothing else has to be changed.
 *
 *  - Sprite sheets are ONE horizontal row of equal-width frames, facing RIGHT.
 *  - `w` x `h`  = size the frame is shown in the game (CSS px).
 *  - Recommended file size = (w * frames * 2) x (h * 2)  (2x for sharp screens).
 *    Any size works as long as the frame proportions are kept.
 *  - If you draw a different number of frames, change `frames` (and walk/idle) here.
 *  - Open  assets.html  to see which files were found and which are still default.
 */
export const ASSET_VERSION = 8;          // bump after replacing a file to beat browser cache
export const SCALE = 2;                  // recommended resolution multiplier

export const REGIONS_ID = ["meadow", "desert", "snow", "fairy", "jungle"];
export const REGION_FA = { meadow: "چمنزار", desert: "بیابان", snow: "برفی", fairy: "صورتی جادویی", jungle: "جنگل" };
export const BIOME_KEYS = ["topsoil", "clay", "gravel", "stone", "boneyard", "gold-vein", "crystal-cave", "magma"];
export const BIOME_FA = { topsoil: "خاک سطحی", clay: "رُس", gravel: "شن", stone: "سنگ", boneyard: "گورستان استخوان",
  "gold-vein": "رگه طلا", "crystal-cave": "غار کریستال", magma: "ماگما" };

export const MANIFEST = [];
const add = (group, key, file, w, h, desc, o = {}) =>
  MANIFEST.push({ group, key, file: "assets/" + file, w, h, frames: 1, anchor: "bottom", desc, ...o });

/* ---------- 1. Surface: sky, sun, clouds, hills, ground ---------- */
for (const r of REGIONS_ID) {
  add("1. آسمان و زمین سطح", `sky-${r}`, `surface/sky/${r}.png`, 1280, 230, `پس‌زمینه آسمان منطقه ${REGION_FA[r]} (کل عرض صفحه را پر می‌کند، پایینش به زمین می‌چسبد)`, { kind: "cover" });
  add("1. آسمان و زمین سطح", `hills-${r}`, `surface/hills/${r}.png`, 1024, 80, `تپه‌های دور منطقه ${REGION_FA[r]} – تکرارشونده افقی (چپ و راستش به هم بچسبد)، پشت شفاف`, { kind: "tile-x" });
  add("1. آسمان و زمین سطح", `ground-${r}`, `surface/ground/${r}.png`, 256, 32, `نوار چمن/زمین منطقه ${REGION_FA[r]} – تکرارشونده افقی، ۲۴px بالای خط زمین تا ۸px زیر آن`, { kind: "tile-x" });
}
add("1. آسمان و زمین سطح", "sun", "surface/sky/sun.png", 140, 140, "خورشید با هاله نور (وسطش روی مرکز خورشید)", { anchor: "center" });
add("1. آسمان و زمین سطح", "cloud", "surface/sky/cloud.png", 120, 60, "ابر (بین ۰.۷ تا ۱.۳ برابر کوچک/بزرگ می‌شود)", { anchor: "center" });
add("1. آسمان و زمین سطح", "bird", "surface/sky/bird.png", 24, 14, "پرنده در حال پرواز – بال زدن", { anchor: "center", frames: 4, fps: 9 });

/* ---------- 2. Surface trees (optional per-region variant) ---------- */
const TREES = { oak: [100, 160, "درخت بلوط/گرد"], pine: [100, 150, "درخت کاج"], cactus: [64, 96, "کاکتوس"], palm: [120, 130, "درخت نخل"] };
const TREE_REG = { oak: ["meadow", "snow", "fairy", "jungle"], pine: ["meadow", "snow"], cactus: ["desert"], palm: ["desert", "fairy", "jungle"] };
for (const [k, [w, h, fa]] of Object.entries(TREES)) {
  add("2. درخت‌ها", `tree-${k}`, `surface/trees/${k}.png`, w, h, `${fa} (پایه وسط پایین تصویر؛ ۰.۸ تا ۱.۴ برابر اسکیل و تکان باد خودکار)`);
  for (const r of TREE_REG[k]) add("2. درخت‌ها", `tree-${k}-${r}`, `surface/trees/${k}-${r}.png`, w, h, `اختیاری: نسخه مخصوص منطقه ${REGION_FA[r]} از ${fa} (اگر نباشد ${k}.png استفاده می‌شود)`, { optional: true });
}

/* ---------- 3. Surface animals ---------- */
const ANIMALS = {
  rabbit: [48, 40, "خرگوش (پرش)"], sheep: [64, 53, "گوسفند"], fox: [64, 40, "روباه"], deer: [70, 64, "گوزن"],
  squirrel: [40, 40, "سنجاب"], hedgehog: [44, 32, "جوجه‌تیغی"], polar: [84, 52, "خرس قطبی"], wolf: [66, 42, "گرگ"],
  fennec: [50, 44, "روباه فنک"], camel: [84, 70, "شتر"], unicorn: [72, 70, "تک‌شاخ"], snake: [96, 30, "مار"], penguin: [40, 56, "پنگوئن"]
};
for (const [k, [w, h, fa]] of Object.entries(ANIMALS)) {
  const sheep = k === "sheep";
  add("3. حیوانات سطح زمین", `animal-${k}`, `surface/animals/${k}.png`, w, h,
    sheep ? "گوسفند: فریم ۰-۹ راه رفتن، ۱۰-۱۱ چریدن (ایستاده)" : `${fa}: ۸ فریم چرخه راه رفتن، رو به راست`,
    sheep ? { frames: 12, walk: [0, 10], idle: [10, 12] } : { frames: 8, walk: [0, 8] });
}

/* ---------- 4. Underground layers ---------- */
BIOME_KEYS.forEach((b, i) => add("4. لایه‌های زیرزمین", `layer-${b}`, `underground/layers/${b}.png`, 512, 130,
  `بافت لایه ${i + 1} (${BIOME_FA[b]}) – تکرارشونده افقی. لایه ${i + 9}، ${i + 17}، … همین بافت با تغییر رنگ خودکار`, { kind: "tile-x" }));
MANIFEST.push({ group: "4. لایه‌های زیرزمین", key: "depth-N", file: "assets/underground/layers/depth-N.png", w: 512, h: 130, frames: 1,
  kind: "tile-x", optional: true, pattern: true,
  desc: "اختیاری: بافت مخصوص یک عمق دقیق، مثلاً depth-12.png برای لایه ۱۲ (اولویت بالاتر از بافت بیوم)" });

/* ---------- 5. Underground creatures ---------- */
const UG = {
  worm: [60, 20, "center", 6, "کرم صورتی (لایه‌های خاک/رس)"], goldworm: [60, 20, "center", 6, "کرم طلایی"],
  skeleton: [60, 45, "bottom", 6, "اسکلت متحرک"], diamond: [60, 45, "bottom", 6, "اسکلت الماسی (درخشان)"],
  root: [40, 120, "top", 4, "ریشه آویزان از سقف لایه (تکان ملایم)"], beetle: [45, 30, "center", 6, "سوسک (رنگی)"],
  mole: [45, 30, "center", 6, "موش کور"], bat: [66, 40, "center", 6, "خفاش – بال زدن"],
  crystal: [40, 40, "bottom", 4, "دسته کریستال (درخشش)"], nugget: [34, 22, "bottom", 4, "تکه طلا (برق زدن)"],
  bone: [34, 30, "bottom", 1, "استخوان ثابت"], salamander: [75, 24, "center", 6, "سمندر آتشین"],
  "beetle-blue": [38, 38, "bottom", 8, "سوسک آبی لایه ۱ (فایل فعلی)"], "beetle-purple": [38, 38, "bottom", 8, "سوسک بنفش لایه ۱ (فایل فعلی)"]
};
for (const [k, [w, h, anchor, frames, fa]] of Object.entries(UG))
  add("5. موجودات زیرزمین", `ug-${k}`, `underground/creatures/${k}.png`, w, h, `${fa} – ${frames > 1 ? frames + " فریم" : "تک فریم"}، رو به راست`, { anchor, frames, fps: 8 });

/* ---------- 6. Holes on the map ---------- */
add("6. چاله روی نقشه", "hole-shaft", "hole/shaft.png", 76, 130, "بدنه تونل عمودی چاله – تکرارشونده عمودی (بالا و پایینش به هم بچسبد)", { kind: "tile-y" });
add("6. چاله روی نقشه", "hole-mound", "hole/mound.png", 112, 32, "تپه خاک و دهانه چاله روی سطح زمین (مرکز تصویر = مرکز دهانه)", { anchor: "center" });
add("6. چاله روی نقشه", "hole-post", "hole/post.png", 8, 24, "میله تابلوی پروفایل بالای چاله");
add("6. چاله روی نقشه", "hole-chamber", "hole/chamber.png", 116, 84, "اتاقک ته چاله (عکس پروفایل روی آن می‌آید)", { anchor: "center" });
add("6. چاله روی نقشه", "avatar-default", "hole/avatar-default.png", 64, 64, "عکس پروفایل پیش‌فرض (وقتی کاربر عکس ندارد) – دایره‌ای بریده می‌شود", { anchor: "center" });

/* ---------- 7. Burrow room (isometric) per biome ---------- */
// room floor f uses biome f*2 -> floors 1-4 = these 4 biomes; floor 5+ repeats them with an automatic colour shift
const ROOM_B = ["topsoil", "gravel", "boneyard", "crystal-cave"];
ROOM_B.forEach((b, j) => {
  const fl = `طبقه ${j + 1}، ${j + 5}، ${j + 9}…`;
  const g = "7. اتاق داخل چاله";
  add(g, `room-bg-${b}`, `room/background/${b}.png`, 1280, 720, `پس‌زمینه کل صفحه اتاق – ${BIOME_FA[b]} (${fl})`, { kind: "cover" });
  add(g, `room-floor-${b}`, `room/floor/${b}.png`, 128, 128, `کاشی کف ${BIOME_FA[b]} – مربع صاف از بالا؛ بازی خودش ایزومتریک می‌کند (۸×۸ کاشی)`, { kind: "flat" });
  add(g, `room-wall-left-${b}`, `room/wall-left/${b}.png`, 288, 150, `دیوار چپ ${BIOME_FA[b]} – مستطیل صاف رو به رو؛ بازی خودش کج می‌کند`, { kind: "flat" });
  add(g, `room-wall-right-${b}`, `room/wall-right/${b}.png`, 288, 150, `دیوار راست ${BIOME_FA[b]} – مستطیل صاف رو به رو؛ بازی خودش کج می‌کند`, { kind: "flat" });
});

/* ---------- 8. Room objects ---------- */
const PROPS = {
  mushroom: [26, 26, "قارچ"], lamp: [20, 40, "چراغ پایه‌دار (نور دورش خودکار)"], rock: [30, 20, "سنگ"], barrel: [24, 30, "بشکه"],
  plant: [32, 40, "گلدان گیاه"], crystal: [30, 36, "کریستال اتاق"], chest: [32, 28, "صندوق گنج"], bones: [30, 16, "استخوان و جمجمه"],
  bed: [58, 30, "تخت (فقط طبقه ۱)"], table: [52, 32, "میز (فقط طبقه ۱)"]
};
const go = "8. وسایل اتاق";
for (const [k, [w, h, fa]] of Object.entries(PROPS)) add(go, `room-prop-${k}`, `room/props/${k}.png`, w, h, `${fa} – پایه وسط پایین تصویر`, { frames: 1, fps: 6 });
add(go, "room-rug", "room/props/rug.png", 340, 220, "فرش وسط اتاق – مستطیل صاف از بالا؛ بازی ایزومتریکش می‌کند", { kind: "flat" });
add(go, "room-bookcase", "room/props/bookcase.png", 115, 58, "قفسه کتاب روی دیوار چپ طبقه ۱ – صاف رو به رو", { kind: "flat" });
add(go, "room-torch", "room/props/torch.png", 16, 40, "مشعل دیوار – شعله متحرک", { frames: 4, fps: 10 });
add(go, "room-stairs-up", "room/props/stairs-up.png", 70, 50, "پله بالا رفتن (فلش سبز خودکار)");
add(go, "room-stairs-down", "room/props/stairs-down.png", 70, 30, "پله/گودال پایین رفتن (فلش زرد خودکار)");
add(go, "room-frame", "room/props/frame.png", 64, 76, "قاب عکس دیوار – وسطش شفاف (عکس کاربر از پشت دیده می‌شود)، صاف رو به رو", { kind: "flat" });
add(go, "room-rabbit", "room/rabbit.png", 64, 80, "شخصیت خرگوش بازیکن: فریم ۰-۷ راه رفتن، ۸ ایستاده، ۹ پلک زدن – رو به راست",
  { frames: 10, walk: [0, 8], idle: [8, 9], blink: 9 });

/* ================================================================== */
export const BY_KEY = Object.fromEntries(MANIFEST.map((s) => [s.key, s]));
const store = new Map();   // file -> { im, state }

function entry(file) {
  let e = store.get(file);
  if (!e) {
    const im = new Image();
    e = { im, state: "loading" };
    im.onload = () => { e.state = "ok"; };
    im.onerror = () => { e.state = "missing"; };
    im.src = `${file}?v=${ASSET_VERSION}`;
    store.set(file, e);
  }
  return e;
}

// hue-shifted copies for deeper repeats of the same biome (cached)
const tints = new Map();
function tinted(e, deg) {
  const id = e.im.src + "|" + deg;
  if (!tints.has(id)) {
    const c = document.createElement("canvas"); c.width = e.im.naturalWidth; c.height = e.im.naturalHeight;
    const x = c.getContext("2d"); x.filter = `hue-rotate(${deg}deg)`; x.drawImage(e.im, 0, 0);
    tints.set(id, c);
  }
  return tints.get(id);
}

// Colour-tinted copies: a WHITE (or light grey) sprite becomes any colour. Multiply keeps the shading and the
// black outlines/eyes of the drawing, and the original alpha keeps the silhouette. Cached per image + colour.
const colourTints = new Map();
function tintedColour(e, color) {
  const id = e.im.src + "|c|" + color;
  if (!colourTints.has(id)) {
    if (colourTints.size > 300) colourTints.clear();
    const c = document.createElement("canvas"); c.width = e.im.naturalWidth; c.height = e.im.naturalHeight;
    const x = c.getContext("2d");
    x.drawImage(e.im, 0, 0);
    x.globalCompositeOperation = "multiply"; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = "destination-in"; x.drawImage(e.im, 0, 0);          // restore the original transparency
    colourTints.set(id, c);
  }
  return colourTints.get(id);
}

/** Loaded art for a manifest key, or null (=> use the built-in drawing).
 *  `color` (any CSS colour) recolours a white sprite automatically, e.g. art("room-rabbit", 0, undefined, "hsl(200,70%,55%)"). */
export function art(key, hue = 0, spec = BY_KEY[key], color = null) {
  if (!spec) return null;
  const e = entry(spec.file);
  if (e.state !== "ok") return null;
  const im = color ? tintedColour(e, color) : hue ? tinted(e, hue) : e.im;
  return { im, spec, iw: e.im.naturalWidth, ih: e.im.naturalHeight };
}
/** Art for a file that is not in the manifest (e.g. depth-12.png). */
export function artFile(file, base) { return art(null, 0, { ...(base || {}), file, frames: 1 }); }
/** Loading state for the checker page. */
export function stateOf(file) { const e = entry(file); return { state: e.state, im: e.im }; }

/** Draw frame `frame` with origin at the anchor (bottom-centre by default), facing right (dir=-1 mirrors). */
export function drawArt(ctx, a, { frame = 0, w = a.spec.w, dir = 1, anchor = a.spec.anchor || "bottom" } = {}) {
  const n = a.spec.frames || 1, fw = a.iw / n, h = w * a.ih / fw, f = ((Math.floor(frame) % n) + n) % n;
  const oy = anchor === "top" ? 0 : anchor === "center" ? -h / 2 : -h;
  ctx.save(); if (dir < 0) ctx.scale(-1, 1);
  ctx.drawImage(a.im, f * fw, 0, fw, a.ih, -w / 2, oy, w, h);
  ctx.restore();
}
/** Time-based looping frame. */
export const animFrame = (spec, t, ph = 0) => Math.floor(t * (spec.fps || 8) + ph * 2);

/** Repeat an image horizontally to fill [0,viewW], `h` tall at y, scrolled by `offset`. */
export function tileX(ctx, a, y, h, offset, viewW) {
  const tw = h * a.iw / a.ih;
  for (let x = -(((offset % tw) + tw) % tw); x < viewW; x += tw) ctx.drawImage(a.im, Math.floor(x), y, Math.ceil(tw) + 1, h);
}
/** Repeat an image vertically inside a column x..x+w from y, total height `h`. */
export function tileY(ctx, a, x, y, w, h) {
  const th = w * a.ih / a.iw;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  for (let yy = y; yy < y + h; yy += th) ctx.drawImage(a.im, x, Math.floor(yy), w, Math.ceil(th) + 1);
  ctx.restore();
}
/** Scale an image to cover a box (like CSS background-size: cover), bottom aligned. */
export function cover(ctx, a, x, y, w, h) {
  const s = Math.max(w / a.iw, h / a.ih), dw = a.iw * s, dh = a.ih * s;
  ctx.drawImage(a.im, x + (w - dw) / 2, y + h - dh, dw, dh);
}

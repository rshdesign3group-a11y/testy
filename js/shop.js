/**
 * Shop items: extra burrow THEMES and DECORATION props that an admin creates and sells (🪙 coins or SOL).
 * Only players who bought an item can use it when decorating; everybody can SEE it in any burrow that uses it.
 * A prop is a PNG (max 120 KB, 256x256 px) – drawn standing on the floor. A theme is a wall/floor colour.
 */
import * as net from "./social.js?v=14";
import * as eco from "./economy.js?v=14";
import { THEMES } from "./room.js?v=14";
import { hooks } from "./world.js?v=14";
import { prog } from "./prog-core.js?v=14";

const err = (e) => ({ ok: false, err: e });
export const items = () => prog().catalog;
export const get = (id) => items().find((x) => x.id === id) || null;
export const owns = (user, id) => (prog().owns[user] || []).includes(id);
export const ownedProps = (user) => items().filter((x) => x.kind === "prop" && owns(user, x.id));
export const soldOut = (x) => x.limit > 0 && (x.sold || 0) >= x.limit;
export const priceText = (x) => (x.currency === "sol" ? `◎${(+x.price).toFixed(3).replace(/\.?0+$/, "")}` : `🪙 ${x.price}`);
export const MAX_PNG = 120 * 1024;

const imgs = new Map();
hooks.propImg = (type) => {                                   // room.js asks for the picture of a custom prop ("x:<id>")
  const it = get(String(type).slice(2)); if (!it?.png) return null; let e = imgs.get(it.id + it.ts);
  if (!e) { const im = new Image(); e = { im, ok: false }; im.onload = () => { e.ok = true; }; im.src = it.png; imgs.set(it.id + it.ts, e); }
  return e.ok ? e.im : null;
};
/** Make the catalog's themes known to the renderer (call at start and after every change). */
export function syncThemes() {
  for (const k of Object.keys(THEMES)) if (k.startsWith("x:") && !get(k.slice(2))) delete THEMES[k];
  for (const x of items()) if (x.kind === "theme") THEMES["x:" + x.id] = { n: x.name, h: x.h, s: x.s, l: x.l, shop: x.id };
}

export function read(file) {                                 // check a prop PNG: type, size, dimensions
  return new Promise((res) => {
    if (!file || file.type !== "image/png") return res(err("The file must be a PNG."));
    if (file.size > MAX_PNG) return res(err(`The file is too big (max ${MAX_PNG / 1024} KB).`));
    const fr = new FileReader(); fr.onerror = () => res(err("Could not read the file."));
    fr.onload = () => { const im = new Image(); im.onerror = () => res(err("That is not a valid image.")); im.onload = () => (im.naturalWidth > 256 || im.naturalHeight > 256 ? res(err(`Max size is 256×256 px (yours is ${im.naturalWidth}×${im.naturalHeight}).`)) : res({ ok: true, png: fr.result })); im.src = fr.result; };
    fr.readAsDataURL(file);
  });
}
export function save(input) {
  const name = String(input.name || "").trim().slice(0, 28); if (!name) return err("Give the item a name.");
  const kind = input.kind === "prop" ? "prop" : "theme", currency = input.currency === "sol" ? "sol" : "coins"; let price = +input.price;
  if (!(price > 0)) return err("Enter a price above 0."); price = currency === "sol" ? Math.round(price * 1000) / 1000 : Math.floor(price); if (!(price > 0)) return err("The price is too small.");
  const old = input.id ? get(input.id) : null, it = { id: old?.id || "sh" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), kind, name, currency, price, onSale: input.onSale !== false,
    limit: Math.max(0, Math.floor(+input.limit || 0)), sold: old?.sold || 0, ts: old?.ts || Date.now() };
  if (kind === "theme") { it.h = Math.max(0, Math.min(360, Math.round(+input.h))); it.s = Math.max(0, Math.min(100, Math.round(+input.s))); it.l = Math.max(8, Math.min(55, Math.round(+input.l))); if (![it.h, it.s, it.l].every(Number.isFinite)) return err("Pick a colour."); }
  else { const png = input.png || old?.png; if (!png || !png.startsWith("data:image/png;base64,")) return err("Upload the prop picture (PNG)."); it.png = png; it.ts = input.png ? Date.now() : it.ts; it.icon = String(input.icon || "🧩").slice(0, 2); }
  if (it.limit > 0 && it.limit < it.sold) return err(`${it.sold} are already sold.`);
  const i = items().findIndex((x) => x.id === it.id); if (i >= 0) items()[i] = it; else items().push(it);
  syncThemes(); net.store.commit("prog"); return { ok: true, item: it };
}
export function remove(id) { prog().catalog = items().filter((x) => x.id !== id); syncThemes(); net.store.commit("prog"); }
export function buy(user, id) {
  const x = get(id); if (!x || !x.onSale) return err("This item is not for sale."); if (owns(user, id)) return err("You already own this.");
  if (soldOut(x)) return err("Sold out."); if (net.bannedIds().includes(user)) return err("Your account is banned.");
  const ok = x.currency === "coins" ? eco.spendCoins(user, x.price) : net.spendSol(user, x.price);
  if (!ok) return err(x.currency === "coins" ? "Not enough 🪙 coins. Convert 🥕 at the Carrot Stand." : "Not enough SOL balance.");
  (prog().owns[user] ||= []).push(id); x.sold = (x.sold || 0) + 1; net.store.commit("prog"); return { ok: true };
}

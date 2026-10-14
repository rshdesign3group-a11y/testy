/**
 * Character sets: a full outfit (hat, glasses, mouth, outfit, extra + optional body colour) that admins create
 * and players buy with 🪙 coins OR with SOL (each set has exactly one currency). Buying is the ONLY way to change
 * your character after the first roll. State lives in the net layer (like the rest of the economy).
 * NOTE: client-side with the local driver – on a real backend do the payment + ownership check on the SERVER.
 */
import * as net from "./social.js?v=14";
import * as eco from "./economy.js?v=14";
import { PART_ORDER } from "./world.js?v=14";

const st = () => net.store.get();
export const CURRENCY = { coins: { icon: "🪙", name: "Coins" }, sol: { icon: "◎", name: "SOL" } };
const HEX = /^#[0-9a-f]{6}$/i, PART_FILE = /^(fix)?\d{1,3}$/;
const err = (e) => ({ ok: false, err: e });

export const all = () => st().sets;
export const get = (id) => st().sets.find((s) => s.id === id) || null;
export const owned = (user) => st().ownedSets[user] || [];
export const has = (user, id) => owned(user).some((o) => o.id === id);
export const ownedEntry = (user, id) => owned(user).find((o) => o.id === id) || null;
export const equippedId = (user) => st().equipped[user] || null;
export const buyers = (id) => st().setLog.filter((x) => x.id === id);
export const priceText = (s) => (s.currency === "sol" ? `◎${(+s.price).toFixed(3).replace(/\.?0+$/, "")}` : `🪙 ${s.price}`);

const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
export const darken = (c, k = .78) => { const n = parseInt(c.slice(1), 16); return "#" + hex2((n >> 16) * k) + hex2(((n >> 8) & 255) * k) + hex2((n & 255) * k); };
function randomHex() {                                   // pleasant random colour
  const h = Math.random() * 360, s = .6 + Math.random() * .3, l = .5 + Math.random() * .12, a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return "#" + hex2(f(0) * 255) + hex2(f(8) * 255) + hex2(f(4) * 255);
}

/** Validate + store a set (admin). Returns { ok, set } or { ok:false, err }. */
export function save(input) {
  const name = String(input.name || "").trim().slice(0, 30); if (!name) return err("Give the set a name.");
  const currency = input.currency === "sol" ? "sol" : "coins";
  let price = +input.price; if (!(price > 0)) return err("Enter a price above 0.");
  price = currency === "sol" ? Math.min(1000, Math.round(price * 1000) / 1000) : Math.min(1e6, Math.floor(price));
  if (!(price > 0)) return err(currency === "sol" ? "Minimum price is ◎0.001." : "Minimum price is 1 🪙.");
  const parts = {};
  for (const c of PART_ORDER) { const q = input.parts?.[c]; if (q && PART_FILE.test(q.n)) parts[c] = { n: q.n, c: HEX.test(q.c || "") ? q.c : null }; }
  const mode = ["fixed", "random"].includes(input.body?.mode) ? input.body.mode : "keep";
  const body = { mode, color: HEX.test(input.body?.color || "") ? input.body.color : "#a78bfa" };
  if (!Object.keys(parts).length && mode === "keep") return err("Pick at least one part or a body colour.");
  const set = { id: input.id && get(input.id) ? input.id : "set" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, desc: String(input.desc || "").trim().slice(0, 120),
    currency, price, onSale: input.onSale !== false, parts, body, ts: Date.now() };
  const i = st().sets.findIndex((s) => s.id === set.id);
  if (i >= 0) st().sets[i] = { ...st().sets[i], ...set, ts: st().sets[i].ts }; else st().sets.push(set);
  net.store.commit("sets"); return { ok: true, set };
}
export function remove(id) { st().sets = st().sets.filter((s) => s.id !== id); net.store.commit("sets"); }   // worn parts stay on the rabbit; the set just leaves the shop
export function setOnSale(id, on) { const s = get(id); if (s) { s.onSale = !!on; net.store.commit("sets"); } }

const bodyFor = (s) => s.body.mode === "fixed" ? { color: s.body.color, ear: darken(s.body.color) } : s.body.mode === "random" ? (() => { const c = randomHex(); return { color: c, ear: darken(c) }; })() : null;

/** What to apply to the player's rabbit when wearing this set. */
export function lookPatch(user, id) { const s = get(id), o = ownedEntry(user, id); return s && o ? { parts: s.parts, body: o.body || null } : null; }

/** Pay and own a set. The currency is fixed by the set: 🪙 coins OR SOL – nothing else. */
export function purchase(user, id) {
  const s = get(id); if (!s || !s.onSale) return err("This set is not for sale.");
  if (has(user, id)) return err("You already own this set.");
  if (net.bannedIds().includes(user)) return err("Your account is banned.");
  if (s.currency === "coins") { if (!eco.spendCoins(user, s.price)) return err("Not enough 🪙 coins."); }
  else if (!net.spendSol(user, s.price)) return err("Not enough SOL balance.");
  (st().ownedSets[user] ||= []).push({ id, ts: Date.now(), body: bodyFor(s) });
  st().equipped[user] = id;
  st().setLog.push({ user, id, price: s.price, currency: s.currency, ts: Date.now() }); st().setLog.splice(0, Math.max(0, st().setLog.length - 1000));
  net.store.commit("sets"); return { ok: true };
}
/** Wear a set you already paid for. */
export function wear(user, id) { if (!has(user, id) || !get(id)) return err("You do not own this set."); st().equipped[user] = id; net.store.commit("sets"); return { ok: true }; }

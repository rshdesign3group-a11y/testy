/**
 * Character sets: a full outfit (hat, glasses, mouth, outfit, extra + optional body colour, a pet and a foot-trail effect)
 * that admins create (or players design and admins approve) and players buy with 🪙 coins OR with SOL
 * (each set has exactly one currency). Buying is the ONLY way to change your character after the first roll.
 * Limited editions (`limit`), numbered copies (`no`), gifts, a player-to-player resale market and designer royalties live here too.
 * NOTE: client-side with the local driver – on a real backend do payments + ownership on the SERVER.
 */
import * as net from "./social.js?v=14";
import * as eco from "./economy.js?v=14";
import { PART_ORDER, LOOK_PARTS } from "./world.js?v=14";
import { cfg as pcfg, notify, nameOf } from "./prog-core.js?v=14";

const st = () => net.store.get();
export const CURRENCY = { coins: { icon: "🪙", name: "Coins" }, sol: { icon: "◎", name: "SOL" } };
export const TRAILS = { "": "None", stars: "⭐ Stars", leaves: "🍃 Leaves", hearts: "💖 Hearts", sparkles: "✨ Sparkles", flames: "🔥 Flames", bubbles: "🫧 Bubbles" };
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
export const soldOut = (s) => s.limit > 0 && (s.sold || 0) >= s.limit;
export const left = (s) => (s.limit > 0 ? Math.max(0, s.limit - (s.sold || 0)) : Infinity);

const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
export const darken = (c, k = .78) => { const n = parseInt(c.slice(1), 16); return "#" + hex2((n >> 16) * k) + hex2(((n >> 8) & 255) * k) + hex2((n & 255) * k); };
function randomHex() {
  const h = Math.random() * 360, s = .6 + Math.random() * .3, l = .5 + Math.random() * .12, a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return "#" + hex2(f(0) * 255) + hex2(f(8) * 255) + hex2(f(4) * 255);
}
const cleanPet = (v) => Array.from(String(v || "").replace(/[\u0000-\u001f<>]/g, "").trim()).slice(0, 2).join("");

/** Validate the look part of a set (shared by admins and player designers). Returns { parts, body, pet, trail } or { err }. */
export function cleanLook(input) {
  const parts = {};
  for (const c of PART_ORDER) { const q = input.parts?.[c]; if (q && PART_FILE.test(q.n) && LOOK_PARTS[c].includes(q.n)) parts[c] = { n: q.n, c: HEX.test(q.c || "") ? q.c : null }; }
  const mode = ["fixed", "random"].includes(input.body?.mode) ? input.body.mode : "keep";
  const body = { mode, color: HEX.test(input.body?.color || "") ? input.body.color : "#a78bfa" };
  const pet = cleanPet(input.pet), trail = Object.hasOwn(TRAILS, input.trail || "") ? input.trail || "" : "";
  if (!Object.keys(parts).length && mode === "keep" && !pet && !trail) return { err: "Pick at least one part, a body colour, a pet or a trail." };
  return { parts, body, pet, trail };
}
function cleanPrice(currency, price) {
  price = +price; if (!(price > 0)) return err("Enter a price above 0.");
  price = currency === "sol" ? Math.min(1000, Math.round(price * 1000) / 1000) : Math.min(1e6, Math.floor(price));
  return price > 0 ? { price } : err(currency === "sol" ? "Minimum price is ◎0.001." : "Minimum price is 1 🪙.");
}

/** Create / edit a set (admin). Returns { ok, set } or { ok:false, err }. */
export function save(input) {
  const name = String(input.name || "").trim().slice(0, 30); if (!name) return err("Give the set a name.");
  const currency = input.currency === "sol" ? "sol" : "coins", pr = cleanPrice(currency, input.price); if (pr.ok === false) return pr;
  const look = cleanLook(input); if (look.err) return err(look.err);
  const old = input.id ? get(input.id) : null, limit = Math.max(0, Math.min(1e6, Math.floor(+input.limit || 0)));
  const set = { id: old?.id || "set" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, desc: String(input.desc || "").trim().slice(0, 120),
    currency, price: pr.price, onSale: input.onSale !== false, ...look, limit, sold: old?.sold || 0, by: old?.by || null, byName: old?.byName || "", fee: old?.fee ?? 0, ts: old?.ts || Date.now() };
  if (limit > 0 && limit < set.sold) return err(`${set.sold} copies are already sold – the limit cannot be lower.`);
  const i = st().sets.findIndex((s) => s.id === set.id); if (i >= 0) st().sets[i] = set; else st().sets.push(set);
  net.store.commit("sets"); return { ok: true, set };
}
export function remove(id) { st().sets = st().sets.filter((s) => s.id !== id); net.store.commit("sets"); }
export function setOnSale(id, on) { const s = get(id); if (s) { s.onSale = !!on; net.store.commit("sets"); } }

const bodyFor = (s) => s.body.mode === "fixed" ? { color: s.body.color, ear: darken(s.body.color) } : s.body.mode === "random" ? (() => { const c = randomHex(); return { color: c, ear: darken(c) }; })() : null;
/** What to apply to the player's rabbit when wearing this set. */
export function lookPatch(user, id) { const s = get(id), o = ownedEntry(user, id); return s && o ? { parts: s.parts, body: o.body || null } : null; }
/** Pet + trail of the set a player currently wears (drawn in burrows and the café). */
export function extrasFor(user) { const s = get(equippedId(user)); return s && has(user, s.id) ? { pet: s.pet || "", trail: s.trail || "" } : { pet: "", trail: "" }; }

function pay(user, s, amount) {
  if (s.currency === "coins") return eco.spendCoins(user, amount) ? true : false;
  return net.spendSol(user, amount);
}
function credit(user, currency, amount) {
  if (!user || !(amount > 0)) return;
  if (currency === "coins") { eco.wallet(user).coins += Math.floor(amount); net.store.commit("eco"); } else net.setBalance(user, net.balance(user) + amount);
}
function logSale(user, s, price) { st().setLog.push({ user, id: s.id, price, currency: s.currency, ts: Date.now() }); st().setLog.splice(0, Math.max(0, st().setLog.length - 1000)); }

/** Give a set without payment (prizes, gifts after payment). */
export function grant(user, id, extra = {}) {
  const s = get(id); if (!s || has(user, id)) return false;
  s.sold = (s.sold || 0) + 1;
  (st().ownedSets[user] ||= []).push({ id, ts: Date.now(), body: bodyFor(s), no: s.sold, ...extra });
  net.store.commit("sets"); return true;
}

/** Pay for a set. `payer` pays, `recipient` receives it (same person for a normal purchase, a friend for a gift). */
export function buyFor(payer, recipient, id) {
  const s = get(id); if (!s || !s.onSale) return err("This set is not for sale.");
  if (soldOut(s)) return err("Sold out! Look for it on the market from other players.");
  if (has(recipient, id)) return err(payer === recipient ? "You already own this set." : "They already own this set.");
  if (net.bannedIds().includes(payer)) return err("Your account is banned.");
  if (!pay(payer, s, s.price)) return err(s.currency === "coins" ? "Not enough 🪙 coins. Convert 🥕 at the Carrot Stand, or earn some in the arcade." : "Not enough SOL balance.");
  grant(recipient, id);
  if (payer === recipient) st().equipped[recipient] = id;
  if (s.by && s.by !== payer) { const cut = s.price * (1 - (s.fee || 0) / 100); credit(s.by, s.currency, s.currency === "coins" ? Math.floor(cut) : Math.round(cut * 1e6) / 1e6); notify(s.by, `Your set “${s.name}” was bought by ${nameOf(payer)}: +${s.currency === "coins" ? "🪙 " + Math.floor(cut) : "◎" + cut.toFixed(3)}`, "sale"); }
  logSale(payer, s, s.price); net.store.commit("sets");
  return { ok: true, no: ownedEntry(recipient, id)?.no };
}
export const purchase = (user, id) => buyFor(user, user, id);
/** Wear a set you already own. */
export function wear(user, id) { if (!has(user, id) || !get(id)) return err("You do not own this set."); st().equipped[user] = id; net.store.commit("sets"); return { ok: true }; }

/* ---------- player-to-player resale market ---------- */
export const listings = () => (st().market ||= []);
export function listForSale(user, id, price) {
  const s = get(id), o = ownedEntry(user, id); if (!s || !o) return err("You do not own this set.");
  const pr = cleanPrice(s.currency, price); if (pr.ok === false) return pr;
  if (listings().some((l) => l.seller === user && l.setId === id)) return err("Already listed.");
  st().ownedSets[user] = owned(user).filter((x) => x.id !== id);                            // escrow: the set leaves your closet while listed
  if (st().equipped[user] === id) delete st().equipped[user];
  listings().push({ id: "ml" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), setId: id, seller: user, price: pr.price, entry: o, ts: Date.now() });
  net.store.commit("sets"); return { ok: true };
}
export function cancelListing(user, lid) {
  const l = listings().find((x) => x.id === lid && x.seller === user); if (!l) return err("Listing not found.");
  st().market = listings().filter((x) => x !== l); (st().ownedSets[user] ||= []).push(l.entry); net.store.commit("sets"); return { ok: true };
}
export function buyListing(buyer, lid) {
  const l = listings().find((x) => x.id === lid), s = l && get(l.setId); if (!l || !s) return err("This listing is gone.");
  if (l.seller === buyer) return err("That is your own listing."); if (has(buyer, s.id)) return err("You already own this set.");
  if (!pay(buyer, s, l.price)) return err(s.currency === "coins" ? "Not enough 🪙 coins." : "Not enough SOL balance.");
  const fee = Math.max(0, Math.min(50, pcfg().marketFee)), cut = l.price * (1 - fee / 100);
  credit(l.seller, s.currency, s.currency === "coins" ? Math.floor(cut) : Math.round(cut * 1e6) / 1e6);
  notify(l.seller, `${nameOf(buyer)} bought your “${s.name}” #${l.entry.no || "?"} for ${priceText({ currency: s.currency, price: l.price })}`, "sale");
  st().market = listings().filter((x) => x !== l); (st().ownedSets[buyer] ||= []).push({ ...l.entry, ts: Date.now() }); st().equipped[buyer] = s.id;
  logSale(buyer, { ...s }, l.price); net.store.commit("sets"); return { ok: true };
}

/* ---------- player designs (an admin approves, then they appear in the shop with the designer's name) ---------- */
export const designs = () => (st().prog ||= {}).designs || (st().prog.designs = []);
export function submitDesign(user, input) {
  const name = String(input.name || "").trim().slice(0, 30); if (!name) return err("Give your design a name.");
  if (designs().filter((d) => d.by === user && d.status === "pending").length >= 3) return err("You already have 3 designs waiting for review.");
  const currency = input.currency === "sol" ? "sol" : "coins", pr = cleanPrice(currency, input.price); if (pr.ok === false) return pr;
  if (currency === "coins" && pr.price < 20) return err("Minimum price for a design is 20 🪙."); if (currency === "sol" && pr.price < 0.01) return err("Minimum price for a design is ◎0.01.");
  const look = cleanLook({ ...input, pet: "", trail: "" }); if (look.err) return err(look.err);          // designers choose parts and colours (pets/trails are admin extras)
  designs().push({ id: "ds" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), by: user, byName: nameOf(user), name, desc: String(input.desc || "").trim().slice(0, 120), currency, price: pr.price, ...look, status: "pending", note: "", ts: Date.now() });
  net.store.commit("prog"); return { ok: true };
}
export function approveDesign(id, { limit = 0, fee } = {}) {
  const d = designs().find((x) => x.id === id && x.status === "pending"); if (!d) return err("Design not found.");
  const r = save({ name: d.name, desc: d.desc, currency: d.currency, price: d.price, parts: d.parts, body: d.body, pet: "", trail: "", limit, onSale: true });
  if (!r.ok) return r;
  Object.assign(get(r.set.id), { by: d.by, byName: d.byName, fee: Math.max(0, Math.min(90, fee ?? pcfg().designerFee)) });
  d.status = "approved"; d.setId = r.set.id; notify(d.by, `Your design “${d.name}” was approved and is now in the shop! You earn ${100 - (get(r.set.id).fee)}% of every sale.`, "design");
  net.store.commit("sets"); net.store.commit("prog"); return { ok: true };
}
export function rejectDesign(id, note = "") {
  const d = designs().find((x) => x.id === id && x.status === "pending"); if (!d) return err("Design not found.");
  d.status = "rejected"; d.note = String(note).slice(0, 120); notify(d.by, `Your design “${d.name}” was not approved${d.note ? ": " + d.note : "."}`, "design"); net.store.commit("prog"); return { ok: true };
}

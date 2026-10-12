/**
 * Network layer – LOCAL driver.
 * Chat, presence, market listings and the money ledger. Everything is kept in
 * localStorage and synced between tabs of the same browser with a
 * BroadcastChannel, so it works on a static site (GitHub Pages) for testing.
 *
 * !! It is NOT multi-user over the internet. To go live, re-implement this
 *    file's exported functions against a server (Supabase Realtime, Firebase…)
 *    and move the money/ownership checks to the server or a Solana program.
 */
import { checkMessage } from "./chatrules.js?v=13";
export const START_BALANCE = 100;           // simulated SOL every user starts with
const KEY = "dh:net:v1";
const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("deep-holes") : null;

const empty = () => ({ chat: [], listings: {}, sales: [], balances: {}, visits: {}, likes: {}, tips: {}, tipLog: [], banned: {}, ads: {}, overrides: {}, notice: "",
  reports: [], staff: {}, events: [], parties: {}, partyLast: {}, holes: [], wallets: {}, rates: {}, claims: [], referrals: {} });
const load = () => { try { return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return empty(); } };
let state = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full/blocked */ } bc?.postMessage({ t: "state" }); };

const listeners = new Set();
const emit = (e) => listeners.forEach((fn) => fn(e));
export const on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/* ---------- café: positions + chat, live only (nothing is stored) ---------- */
const cafeMap = new Map(); export const cafeLog = [];
let cafeSelf = null, cafeId = null, lastCafeSend = 0;
export function cafeJoin(id) { cafeId = id; cafeLog.length = 0; cafeMap.clear(); bc?.postMessage({ t: "cafe-hello", id: me.id, cafe: id }); }
export function cafeUpdate(p) { cafeSelf = p; bc?.postMessage({ t: "cafe", id: me.id, name: me.name, cafe: cafeId, ...p }); }
export function cafeLeave() { if (cafeId == null) return; bc?.postMessage({ t: "cafe-bye", id: me.id, cafe: cafeId }); cafeId = null; cafeSelf = null; cafeMap.clear(); }
export function cafeSay(text) {
  text = String(text || "").trim();
  if (!text) return { ok: false, err: "" };
  if (cafeId == null) return { ok: false, err: "You are not in a café." };
  const err = guard("cafe", text);
  if (err) return { ok: false, err };
  const now = Date.now(), e = { mid: now + Math.random().toString(36).slice(2, 6), id: me.id, name: me.name, role: me.role || "", text: text.slice(0, 120), ts: now };
  cafeLog.push(e); cafeLog.splice(0, Math.max(0, cafeLog.length - 50));
  bc?.postMessage({ t: "cafe-chat", cafe: cafeId, ...e }); emit("cafe");
  return { ok: true, entry: e };
}
export const cafePlayers = () => { const now = Date.now(); for (const [id, p] of cafeMap) if (now - p.ts > 5000) cafeMap.delete(id); return [...cafeMap.values()]; };

/* ---------- presence ---------- */
let me = { id: null, name: "" };
const peers = new Map();                    // id -> { id, name, ts }
const beat = (t = "hb") => me.id && bc?.postMessage({ t, id: me.id, name: me.name });
export function setMe(m) { me = m; beat("hello"); emit("presence"); }
setInterval(() => {
  beat();
  const now = Date.now();
  for (const [id, p] of peers) if (now - p.ts > 15000) { peers.delete(id); emit("presence"); }
}, 5000);
addEventListener("pagehide", () => beat("bye"));
bc && (bc.onmessage = ({ data: m }) => {
  if (m.t === "state") { state = load(); emit("change"); }
  else if (m.t === "bye") { peers.delete(m.id); emit("presence"); }
  else if (m.t?.startsWith("cafe")) {                      // live café traffic (only for the café we are in)
    if (cafeId == null || m.cafe !== cafeId || m.id === me.id) return;
    if (m.t === "cafe") { cafeMap.set(m.id, { ...m, ts: Date.now() }); emit("cafe"); }
    else if (m.t === "cafe-hello") { if (cafeSelf) cafeUpdate(cafeSelf); }
    else if (m.t === "cafe-bye") { cafeMap.delete(m.id); emit("cafe"); }
    else if (m.t === "cafe-chat") { cafeLog.push({ mid: m.mid, id: m.id, name: m.name, role: m.role, text: m.text, ts: m.ts }); cafeLog.splice(0, Math.max(0, cafeLog.length - 50)); emit("cafe"); }
  }
  else if (m.id && m.id !== me.id) { peers.set(m.id, { id: m.id, name: m.name, ts: Date.now() }); if (m.t === "hello") beat(); emit("presence"); }
});
export const online = () => [{ id: me.id, name: me.name, self: true }, ...[...peers.values()].map((p) => ({ ...p, self: false }))].filter((p) => p.id);
export const peerName = (id) => peers.get(id)?.name;

/* ---------- chat (global: to = null, direct: to = user id) ---------- */
const strikes = new Map(), mutes = new Map();
/** Returns an error text if the current user may not send this message, otherwise null. */
function guard(scope, text) {
  if (!me.id) return "Not ready yet.";
  if (state.banned[me.id]) return "Your account is banned.";
  const now = Date.now(), m = mutes.get(me.id);
  if (m && m > now) return `You are muted for ${Math.ceil((m - now) / 1000)}s because of repeated blocked messages.`;
  const hist = scope === "cafe" ? cafeLog.filter((x) => x.id === me.id) : state.chat.filter((x) => x.from === me.id);
  const err = checkMessage({ text, tier: me.tier || "ghost", role: me.role || "", scope, history: hist, now });
  if (err) {
    const s = (strikes.get(me.id) || []).filter((t) => now - t < 60000); s.push(now); strikes.set(me.id, s);
    if (s.length >= 3 && !me.role) mutes.set(me.id, now + 60000);
  }
  return err;
}
export function send(to, text) {
  text = String(text || "").trim();
  if (!text) return { ok: false, err: "" };
  const err = guard(to ? "dm" : "global", text);
  if (err) return { ok: false, err };
  const now = Date.now();
  state.chat.push({ id: now + Math.random().toString(36).slice(2, 6), from: me.id, name: me.name, role: me.role || "", to: to || null, text: text.slice(0, 300), ts: now });
  state.chat = state.chat.slice(-300);
  save(); emit("chat");
  return { ok: true };
}
export const messages = () => state.chat;

/* ---------- ledger (simulated balances) ---------- */
export const balance = (u) => state.balances[u] ?? START_BALANCE;
const move = (from, to, amt) => { state.balances[from] = balance(from) - amt; if (to) state.balances[to] = balance(to) + amt; };

export function recordPrimary(hole, price) {             // buying a brand-new hole from the game
  move(hole.owner, null, price);
  state.sales.push({ kind: "primary", holeId: hole.id, from: null, to: hole.owner, price, ts: Date.now() });
  save(); emit("sales");
}

/* ---------- market ---------- */
export const activeListing = (hole) => { const l = state.listings[hole.id]; return l && l.seller === hole.owner ? l : null; };
export function listHole(hole, customPrice) {              // customPrice = number | null (automatic)
  if (hole.special || state.banned[hole.owner]) return;       // the founder hole is never for sale
  state.listings[hole.id] = { holeId: hole.id, seller: hole.owner, mode: customPrice == null ? "auto" : "custom", price: customPrice ?? null, ts: Date.now() };
  save(); emit("market");
}
export function unlist(hole) { delete state.listings[hole.id]; save(); emit("market"); }

export function buy(hole, buyer, price) {
  const l = activeListing(hole);
  if (!l) return { ok: false, err: "This hole is no longer for sale." };
  if (state.banned[buyer]) return { ok: false, err: "Your account is banned." };
  if (buyer === hole.owner) return { ok: false, err: "You already own this hole." };
  if (l.mode === "custom" && Math.abs(l.price - price) > 1e-9) return { ok: false, err: "The price changed. Please reopen the listing." };
  if (balance(buyer) < price) return { ok: false, err: "Not enough balance." };
  const seller = hole.owner;
  move(buyer, seller, price);
  state.sales.push({ kind: "resale", holeId: hole.id, from: seller, to: buyer, price, ts: Date.now() });
  delete state.listings[hole.id];
  save(); emit("sales");
  return { ok: true, seller };
}

/** Re-apply ownership changes from the sales history (other tabs / after reload). */
export function replay(transfer) {
  let changed = false;
  for (const s of state.sales) if (s.kind === "resale" && transfer(s.holeId, s.from, s.to)) changed = true;
  return changed;
}
export const sales = () => state.sales;
export function stats() {
  const t = { total: 0, count: state.sales.length, primary: 0, resale: 0, primaryCount: 0, resaleCount: 0 };
  for (const s of state.sales) {
    t.total += s.price;
    if (s.kind === "primary") { t.primary += s.price; t.primaryCount++; } else { t.resale += s.price; t.resaleCount++; }
  }
  return t;
}

/* ---------- visits, likes, tips ---------- */
export function recordVisit(holeId, visitor) {            // same visitor counts once per 30 minutes
  const v = (state.visits[holeId] ||= { n: 0, u: {} }), now = Date.now();
  if (!v.u[visitor] || now - v.u[visitor] > 30 * 60000) v.n++;
  v.u[visitor] = now;
  logEvent("visit", holeId, visitor, 1);
  save(); emit("stats");
}
export const holeStats = (id) => ({
  visits: state.visits[id]?.n || 0, unique: Object.keys(state.visits[id]?.u || {}).length,
  likes: (state.likes[id] || []).length, tips: state.tips[id]?.total || 0, tipCount: state.tips[id]?.n || 0
});
export const hasLiked = (id, user) => (state.likes[id] || []).includes(user);
export function toggleLike(id, user) {                     // returns true if now liked
  if (state.banned[user]) return false;
  const a = (state.likes[id] ||= []), i = a.indexOf(user);
  i < 0 ? a.push(user) : a.splice(i, 1);
  if (i < 0) logEvent("like", id, user, 1);
  save(); emit("stats");
  return i < 0;
}
export function tip(hole, from, amount) {
  if (state.banned[from]) return { ok: false, err: "Your account is banned." };
  if (from === hole.owner) return { ok: false, err: "You cannot tip yourself." };
  if (!(amount > 0)) return { ok: false, err: "Enter an amount above 0." };
  if (balance(from) < amount) return { ok: false, err: "Not enough balance." };
  move(from, hole.owner, amount);
  const t = (state.tips[hole.id] ||= { total: 0, n: 0 });
  t.total += amount; t.n++;
  logEvent("tip", hole.id, from, amount);
  state.tipLog.push({ holeId: hole.id, from, to: hole.owner, amount, ts: Date.now() });
  state.tipLog = state.tipLog.slice(-200);
  save(); emit("stats");
  return { ok: true };
}
export function totals() {
  const t = { likes: 0, visits: 0, tips: 0 };
  for (const k in state.likes) t.likes += state.likes[k].length;
  for (const k in state.visits) t.visits += state.visits[k].n;
  for (const k in state.tips) t.tips += state.tips[k].total;
  return t;
}

/* ---------- moderation / admin (the UI only offers these to the admin wallet) ---------- */
export const isBanned = (id) => !!state.banned[id];
export const bannedIds = () => Object.keys(state.banned);
export function ban(id, on = true) { on ? (state.banned[id] = { at: Date.now() }) : delete state.banned[id]; save(); emit("change"); }
export function deleteMessage(id) { state.chat = state.chat.filter((m) => m.id !== id); save(); emit("chat"); }
export function clearChat() { state.chat = []; save(); emit("chat"); }
export function purgeUser(id) {                              // chat, likes, balance of a deleted user
  state.chat = state.chat.filter((m) => m.from !== id && m.to !== id);
  for (const k in state.likes) state.likes[k] = state.likes[k].filter((u) => u !== id);
  delete state.balances[id];
  save(); emit("change");
}
export function setBalance(user, value) { state.balances[user] = Math.max(0, +value || 0); save(); emit("sales"); }
export function clearListings() { state.listings = {}; save(); emit("market"); }
export const overrides = () => state.overrides;
export function setOverride(holeId, patch) {
  state.overrides[holeId] = { ...state.overrides[holeId], ...patch };
  if (patch.deleted) delete state.listings[holeId];
  save(); emit("change");
}
export const getAd = (n) => state.ads[n] || null;
export function setAd(n, ad) { state.ads[n] = ad; save(); emit("change"); }
export const notice = () => state.notice;
export function setNotice(t) { state.notice = String(t || "").slice(0, 200); save(); emit("change"); }

/* ---------- staff (the owner can appoint admins with limited permissions) ---------- */
export const staff = () => state.staff;
export const staffOf = (id) => state.staff[id] || null;
export function setStaff(id, rec) { state.staff[id] = { name: rec.name || "", perms: rec.perms || {}, at: Date.now() }; save(); emit("change"); }
export function removeStaff(id) { delete state.staff[id]; save(); emit("change"); }

/* ---------- reports ---------- */
export const REPORT_REASONS = ["Spam or advertising", "Scam or suspicious link", "Harassment or insults", "Inappropriate content", "Other"];
export function reportMessage({ scope, msg, reason, note }) {
  if (!me.id) return { ok: false, err: "Not ready yet." };
  if (state.banned[me.id]) return { ok: false, err: "Your account is banned." };
  const mid = msg.mid || msg.id;
  if (msg.from === me.id || msg.id === me.id && scope === "cafe") return { ok: false, err: "You cannot report your own message." };
  if (scope === "dm" && msg.to !== me.id) return { ok: false, err: "You can only report messages sent to you." };
  if (state.reports.some((r) => r.msgId === mid && r.reporter === me.id)) return { ok: false, err: "You already reported this message." };
  const now = Date.now();
  if (state.reports.filter((r) => r.reporter === me.id && now - r.ts < 3600e3).length >= 8) return { ok: false, err: "Too many reports. Please try again later." };
  state.reports.push({ id: now + Math.random().toString(36).slice(2, 6), scope, msgId: mid, text: msg.text, from: msg.from || msg.id, fromName: msg.name, to: msg.to || null,
    reporter: me.id, reporterName: me.name, reason, note: String(note || "").slice(0, 200), ts: now, status: "open" });
  state.reports = state.reports.slice(-300);
  save(); emit("reports");
  return { ok: true };
}
export const reports = () => state.reports;
export function resolveReport(id, status, by) {
  const r = state.reports.find((x) => x.id === id);
  if (r) { r.status = status; r.by = by; r.at = Date.now(); save(); emit("reports"); }
}

/* ---------- events (weekly leaderboard) ---------- */
export function logEvent(type, holeId, user, amount = 1) {
  state.events.push({ t: type, h: holeId, u: user, a: amount, ts: Date.now() });
  if (state.events.length > 3000) state.events.splice(0, state.events.length - 3000);
}
export function weekStart(now = Date.now()) { const d = new Date(now); const day = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day); }
export function weekly() {
  const ws = weekStart(), out = {};
  for (const e of state.events) {
    if (e.ts < ws) continue;
    const o = (out[e.h] ||= { visits: 0, likes: 0, tips: 0, dug: 0 });
    if (e.t === "visit") o.visits += e.a; else if (e.t === "like") o.likes += e.a; else if (e.t === "tip") o.tips += e.a; else if (e.t === "deepen") o.dug += e.a;
  }
  return out;
}
/** Low level access for the economy / party modules that live in their own files. */
export const store = { get: () => state, commit: (ev = "change") => { save(); emit(ev); }, me: () => me };

/* ---------- parties: hole owners with depth 10+ can open their first floor to guests for a while ---------- */
export const PARTY = { minDepth: 10, duration: 30 * 60e3, max: 8, cooldown: 3 * 3600e3, cost: 20 };   // cost in coins
export function partyActive(hole) { const p = state.parties[hole.id]; return p && p.until > Date.now() && p.host === hole.owner ? p : null; }
export function partyCooldownLeft(hole) { return Math.max(0, (state.partyLast[hole.owner] || 0) + PARTY.cooldown - Date.now()); }
export function startParty(hole) {
  if (hole.depth < PARTY.minDepth) return { ok: false, err: `Parties unlock at depth ${PARTY.minDepth}.` };
  if (partyActive(hole)) return { ok: false, err: "A party is already running." };
  const cd = partyCooldownLeft(hole); if (cd > 0) return { ok: false, err: `You can host again in ${Math.ceil(cd / 60000)} min.` };
  const now = Date.now(); state.parties[hole.id] = { host: hole.owner, until: now + PARTY.duration, started: now, guests: {} }; state.partyLast[hole.owner] = now;
  save(); emit("party"); return { ok: true };
}
export function endParty(hole) { delete state.parties[hole.id]; save(); emit("party"); }
export function partyJoin(hole, id) {
  const p = partyActive(hole); if (!p) return false;
  if (id === hole.owner) return true;
  const now = Date.now(), n = Object.keys(p.guests).filter((k) => k !== id && now - p.guests[k] < 25000).length;
  if (n >= PARTY.max) return false;
  p.guests[id] = now; save(); return true;
}
export function partyBeat(hole, id) { const p = partyActive(hole); if (p && id !== hole.owner) { p.guests[id] = Date.now(); save(); } }
export const partyGuestCount = (hole) => { const p = partyActive(hole); return p ? Object.keys(p.guests).filter((k) => Date.now() - p.guests[k] < 25000).length : 0; };

/* ---------- holes created by players (shared between tabs; demo holes live in data.js) ---------- */
export const sharedHoles = () => state.holes;
export function pushHoles(list) { state.holes = list; save(); emit("holes"); }

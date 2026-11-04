/**
 * Progress & retention systems: XP / levels / titles, daily missions, onboarding quests, badges, idle carrots,
 * the daily treasure, timed events (double carrots...), the weekly arcade tournament, guestbooks, gifts and analytics.
 * Everything is tracked through ONE function: track(user, "event", n, data). Local driver now; do it on the SERVER later.
 */
import * as net from "./social.js?v=14";
import * as eco from "./economy.js?v=14";
import * as sets from "./sets.js?v=14";
import { floorCount } from "./data.js?v=14";
import { prog, cfg, notify, nameOf, short } from "./prog-core.js?v=14";

const st = () => net.store.get();
export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const dayHash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const ctx = { holes: () => [], inCafe: false };                      // main.js plugs the holes list in
export const setProvider = (o) => Object.assign(ctx, o);

export const U = (id) => (prog().users[id] ||= { xp: 0, stats: {}, badges: [], badge: "", titles: [], msn: { d: "", list: [], bonus: false }, quest: {}, idle: {}, first: Date.now(), visited: {}, gifted: { d: "", n: 0 }, treasure: "" });

/* ================= XP, levels, titles ================= */
export const xpFor = (lv) => 30 * (lv - 1) * (lv - 1);
export const levelOf = (xp) => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 30));
const LEVEL_TITLES = [[1, "Fresh Bunny"], [3, "Digger"], [6, "Burrower"], [10, "Tunneler"], [15, "Deep Delver"], [22, "Cave Master"], [30, "Underground Legend"], [45, "Mythic Hopper"]];
export const levelTitle = (lv) => LEVEL_TITLES.filter(([l]) => lv >= l).pop()[1];
export function addXp(user, n, why = "") {
  if (!user || !(n > 0)) return; const u = U(user), before = levelOf(u.xp);
  u.xp += Math.round(n * cfg().xpMult); const after = levelOf(u.xp);
  if (after > before) notify(user, `⬆ Level ${after}! New title: ${levelTitle(after)}`, "level");
  net.store.commit("prog");
}
export const level = (user) => levelOf(U(user).xp);
export function progressBar(user) { const xp = U(user).xp, lv = levelOf(xp), a = xpFor(lv), b = xpFor(lv + 1); return { lv, xp, into: xp - a, need: b - a, pct: Math.round(((xp - a) / (b - a)) * 100) }; }

/* ================= badges ================= */
export const BADGES = [
  { id: "first_hole", icon: "🕳️", name: "First Hole", desc: "Own a burrow", ok: (s) => (s.buy_hole || 0) >= 1 },
  { id: "deep10", icon: "⛏️", name: "Deep Dweller", desc: "Reach depth 10", ok: (s) => (s.maxDepth || 0) >= 10 },
  { id: "deep30", icon: "🪨", name: "Cave Diver", desc: "Reach depth 30", ok: (s) => (s.maxDepth || 0) >= 30 },
  { id: "deep50", icon: "🌋", name: "Core Seeker", desc: "Reach depth 50", ok: (s) => (s.maxDepth || 0) >= 50 },
  { id: "visit10", icon: "👋", name: "Friendly Neighbour", desc: "Visit 10 burrows", ok: (s) => (s.visitedN || 0) >= 10 },
  { id: "visit50", icon: "🧭", name: "Explorer", desc: "Visit 50 burrows", ok: (s) => (s.visitedN || 0) >= 50 },
  { id: "play10", icon: "🕹️", name: "Arcade Regular", desc: "Play 10 arcade games", ok: (s) => (s.arcade_play || 0) >= 10 },
  { id: "play100", icon: "👾", name: "Arcade Legend", desc: "Play 100 arcade games", ok: (s) => (s.arcade_play || 0) >= 100 },
  { id: "streak7", icon: "🔥", name: "On Fire", desc: "7 day streak", ok: (s) => (s.maxStreak || 0) >= 7 },
  { id: "streak30", icon: "☄️", name: "Unstoppable", desc: "30 day streak", ok: (s) => (s.maxStreak || 0) >= 30 },
  { id: "sets3", icon: "🎭", name: "Fashionista", desc: "Own 3 sets", ok: (s) => (s.setsOwned || 0) >= 3 },
  { id: "treasure5", icon: "💰", name: "Treasure Hunter", desc: "Find 5 daily treasures", ok: (s) => (s.treasure_found || 0) >= 5 },
  { id: "giver5", icon: "🎁", name: "Generous", desc: "Send 5 gifts", ok: (s) => (s.gift_send || 0) >= 5 },
  { id: "chat20", icon: "💬", name: "Guestbook Star", desc: "Sign 20 guestbooks", ok: (s) => (s.guest_post || 0) >= 20 },
  { id: "champ", icon: "🏆", name: "Weekly Champion", desc: "Win a weekly tournament", ok: (s) => (s.tourney_win || 0) >= 1 }
];
export const badgeById = (id) => BADGES.find((b) => b.id === id);
function checkBadges(user) {
  const u = U(user); for (const b of BADGES) if (!u.badges.includes(b.id) && b.ok(u.stats)) { u.badges.push(b.id); if (!u.badge) u.badge = b.id; notify(user, `${b.icon} Badge unlocked: ${b.name}`, "badge"); addXp(user, 25, "badge"); }
}
export function setBadge(user, id) { const u = U(user); if (id === "" || u.badges.includes(id)) { u.badge = id; net.store.commit("prog"); } }
/** What is shown next to a name: level, title and the chosen badge. */
export function tag(user) { const u = U(user), lv = levelOf(u.xp), b = badgeById(u.badge); return { lv, title: u.titles[u.titles.length - 1] || levelTitle(lv), badge: b ? b.icon : "" }; }
export const headTitle = (user) => { const t = tag(user); return `${t.badge ? t.badge + " " : ""}Lv ${t.lv} · ${t.title}`; };

/* ================= missions (3 a day, carrots + xp) ================= */
export const MISSIONS = [
  { id: "visit2", text: "Visit 2 burrows that are not yours", evt: "visit", goal: 2, cp: 15, xp: 15 },
  { id: "arcade1", text: "Play 1 arcade game", evt: "arcade_play", goal: 1, cp: 15, xp: 15 },
  { id: "deepen1", text: "Dig your burrow 1 level deeper", evt: "deepen", goal: 1, cp: 25, xp: 25, needHole: true },
  { id: "cafe1", text: "Drop by the café", evt: "cafe_enter", goal: 1, cp: 10, xp: 10 },
  { id: "item2", text: "Find 2 rare items on the map", evt: "item_found", goal: 2, cp: 20, xp: 20 },
  { id: "guest1", text: "Sign someone's guestbook", evt: "guest_post", goal: 1, cp: 10, xp: 10 },
  { id: "stairs3", text: "Use the stairs 3 times", evt: "stairs", goal: 3, cp: 12, xp: 12 },
  { id: "idle1", text: "Collect your burrow's carrots", evt: "collect_idle", goal: 1, cp: 12, xp: 12, needHole: true },
  { id: "treasure1", text: "Find today's hidden treasure", evt: "treasure_found", goal: 1, cp: 30, xp: 30 }
];
export function missionsFor(user) {
  const u = U(user), d = dayKey();
  if (u.msn.d !== d) {
    const hasHole = ctx.holes().some((h) => h.owner === user), off = cfg().missionsOff;
    const pool = MISSIONS.filter((m) => !off[m.id] && (!m.needHole || hasHole)).sort((a, b) => dayHash(d + user + a.id) - dayHash(d + user + b.id));
    u.msn = { d, bonus: false, list: pool.slice(0, 3).map((m) => ({ id: m.id, n: 0, done: false })) };
    net.store.commit("prog");
  }
  return u.msn.list.map((m) => ({ ...MISSIONS.find((x) => x.id === m.id), n: m.n, done: m.done }));
}
function missionTick(user, evt, n, key) {
  const u = U(user); missionsFor(user); let fin = 0;
  for (const m of u.msn.list) {
    const def = MISSIONS.find((x) => x.id === m.id); if (!def || m.done || def.evt !== evt) continue;
    if (key && def.evt === "visit") { u.msn.seen ||= {}; if (u.msn.seen[key]) continue; u.msn.seen[key] = 1; }
    m.n = Math.min(def.goal, m.n + n);
    if (m.n >= def.goal) { m.done = true; fin++; const cp = Math.round(def.cp * cfg().missionMult); eco.addCP(user, cp, false); addXp(user, def.xp); notify(user, `✅ Mission done: ${def.text} (+${cp} 🥕)`, "mission"); }
  }
  if (!u.msn.bonus && u.msn.list.every((m) => m.done)) { u.msn.bonus = true; const b = Math.round(cfg().missionBonus); eco.addCP(user, b, false); addXp(user, 30); notify(user, `🎉 All 3 missions done! Bonus +${b} 🥕`, "mission"); }
  return fin;
}

/* ================= onboarding quests (a short guided path for new players) ================= */
export const QUESTS = [
  { id: "connect", text: "Connect your wallet", tip: "Press “Connect Wallet” at the top.", cp: 10, evt: "connect" },
  { id: "buy_hole", text: "Buy your first burrow", tip: "Press “+ Buy New Hole” at the bottom.", cp: 30, evt: "buy_hole" },
  { id: "walk", text: "Walk around inside your burrow", tip: "Click your burrow on the map, then move with WASD or the joystick.", cp: 15, evt: "walk" },
  { id: "daily", text: "Claim your daily reward", tip: "Press the 🎁 button at the top.", cp: 15, evt: "daily_claim" },
  { id: "shop", text: "Open the character shop", tip: "Inside your burrow press “🎭 Sets”.", cp: 15, evt: "shop_open" },
  { id: "arcade", text: "Find the arcade and play a game", tip: "Look for the purple arcade machine in the café or in a burrow.", cp: 25, evt: "arcade_play" },
  { id: "visit", text: "Visit another player's burrow", tip: "Click any other hole on the map.", cp: 20, evt: "visit" },
  { id: "guest", text: "Sign a guestbook", tip: "Inside a burrow press “📖 Guestbook”.", cp: 20, evt: "guest_post" }
];
export const questState = (user) => QUESTS.map((q) => ({ ...q, done: !!U(user).quest[q.id] }));
export const nextQuest = (user) => questState(user).find((q) => !q.done) || null;
function questTick(user, evt) {
  const u = U(user);
  for (const q of QUESTS) if (q.evt === evt && !u.quest[q.id]) {
    u.quest[q.id] = Date.now(); const cp = Math.round(q.cp * cfg().questMult); eco.addCP(user, cp, false); addXp(user, 30); notify(user, `🧭 Quest done: ${q.text} (+${cp} 🥕)`, "quest");
    if (QUESTS.every((x) => u.quest[x.id])) { eco.addCP(user, 100, false); addXp(user, 100); if (!u.titles.includes("Explorer")) u.titles.push("Explorer"); notify(user, "🏅 You finished the starter path! +100 🥕 and the title “Explorer”.", "quest"); }
  }
}

/* ================= tracking (the one entry point) + analytics ================= */
const XP_BY = { arcade_play: 5, visit: 3, deepen: 25, buy_hole: 60, daily_claim: 10, cafe_enter: 2, item_found: 4, set_buy: 40, stairs: 1 };
export function track(user, evt, n = 1, data = {}) {
  if (!user || String(user).startsWith("guest-")) return;
  const u = U(user), s = u.stats, a = prog().an, d = dayKey();
  s[evt] = (s[evt] || 0) + n;
  if (evt === "visit" && data.key != null) { if (!u.visited[data.key]) { u.visited[data.key] = 1; s.visitedN = Object.keys(u.visited).length; } }
  if (evt === "depth") s.maxDepth = Math.max(s.maxDepth || 0, data.value || 0);
  if (evt === "daily_claim") s.maxStreak = Math.max(s.maxStreak || 0, data.streak || 0);
  s.setsOwned = sets.owned(user).length;
  const day = (a.days[d] ||= { u: {}, e: {} }); day.u[user] = 1; day.e[evt] = (day.e[evt] || 0) + n;
  a.first[user] ||= d; a.last[user] = d; (a.feat[evt] ||= {})[user] = 1;
  addXp(user, (XP_BY[evt] || 0) * n);
  questTick(user, evt); missionTick(user, evt, n, evt === "visit" ? data.key : null); checkBadges(user);
  net.store.commit("prog");
}

/* ================= idle carrots: every burrow makes carrots while you are away ================= */
const decorCount = (h) => Object.values(h.layout || {}).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0) + (h.theme && h.theme !== "natural" ? 2 : 0);
export function idleRate(h) { const c = cfg(); return c.idleBase + (h.depth || 1) * c.idlePerDepth + decorCount(h) * c.idlePerDecor; }
export function idleStatus(user, h) {
  const u = U(user), c = cfg(), last = u.idle[h.id] || Date.now() - 3600e3, hours = Math.min(c.idleCapHours, Math.max(0, (Date.now() - last) / 3600e3));
  const rate = idleRate(h); return { rate, hours, amount: Math.floor(rate * hours), cap: Math.floor(rate * c.idleCapHours), full: hours >= c.idleCapHours };
}
export function collectIdle(user, h) {
  if (h.owner !== user) return { ok: false, err: "Only the owner can collect." };
  const s = idleStatus(user, h); if (s.amount < 1) return { ok: false, err: "Nothing to collect yet – come back in a while." };
  const got = eco.addCP(user, s.amount, false); U(user).idle[h.id] = Date.now(); addXp(user, 4); track(user, "collect_idle"); return { ok: true, amount: got };
}
export function idleTotal(user) { return ctx.holes().filter((h) => h.owner === user).reduce((n, h) => n + idleStatus(user, h).amount, 0); }

/* ================= the daily treasure ================= */
export function treasureToday() {
  if (!cfg().treasureOn) return null;
  const list = ctx.holes().filter((h) => !h.deleted && h.depth >= 1 && !String(h.owner || "").startsWith("demo")); if (!list.length) return null;
  const d = dayKey(), h = list[Math.floor(dayHash("tr" + d) * list.length)], floors = floorCount(h.depth), floor = Math.floor(dayHash("tf" + d) * floors);
  const name = (h.username || "").trim(), lo = Math.max(1, h.depth - 3), clue = `A chest is hidden on floor ${floor + 1} of a burrow${name ? ` whose name starts with “${name[0].toUpperCase()}”` : ""}, dug somewhere between depth ${lo} and ${h.depth + 3}.`;
  return { id: d, hole: h.id, floor, clue, name: name || "Hole #" + h.id };
}
export const treasureFound = (user) => U(user).treasure === dayKey();
export function claimTreasure(user) {
  const t = treasureToday(); if (!t) return { ok: false, err: "No treasure today." }; if (treasureFound(user)) return { ok: false, err: "You already found today's treasure!" };
  U(user).treasure = dayKey(); const cp = Math.round(cfg().treasureCp), got = eco.addCP(user, cp, false); addXp(user, 30); track(user, "treasure_found"); return { ok: true, cp: got };
}

/* ================= timed events (admin) ================= */
export const events = () => prog().events;
const inWindow = (e, now) => {
  if (e.repeat === "weekly") {                                              // every week on a weekday, from hour:minute for N hours (admin's own time zone)
    const t = new Date(now - (e.tz || 0) * 60000), dow = t.getUTCDay(), mins = t.getUTCHours() * 60 + t.getUTCMinutes(), start = e.hour * 60 + (e.minute || 0), end = start + e.hours * 60;
    return (dow === e.dow && mins >= start && mins < end) || (end > 1440 && dow === (e.dow + 1) % 7 && mins < end - 1440);
  }
  return now >= e.start && now < e.end;
};
export const activeEvents = (now = Date.now()) => events().filter((e) => e.on !== false && inWindow(e, now));
export function eventMult(kind) {                                          // kind: "earn" | "arcade"
  let m = 1; for (const e of activeEvents()) { const sc = e.scope || "all"; if (sc === "all" || sc === kind || (sc === "cafe" && ctx.inCafe)) m *= Math.max(1, +e.mult || 1); } return Math.min(m, 10);
}
eco.mult.cp = (kind) => eventMult(kind);
export function saveEvent(e) {
  const name = String(e.name || "").trim().slice(0, 40); if (!name) return { ok: false, err: "Give the event a name." };
  const mult = Math.max(1, Math.min(10, +e.mult || 2)), scope = ["all", "arcade", "cafe"].includes(e.scope) ? e.scope : "all";
  const ev = { id: e.id || "ev" + Date.now().toString(36), name, mult, scope, desc: String(e.desc || "").slice(0, 120), on: e.on !== false, repeat: e.repeat === "weekly" ? "weekly" : "", tz: +e.tz || 0 };
  if (ev.repeat) { Object.assign(ev, { dow: Math.max(0, Math.min(6, +e.dow || 0)), hour: Math.max(0, Math.min(23, +e.hour || 0)), minute: Math.max(0, Math.min(59, +e.minute || 0)), hours: Math.max(0.25, Math.min(48, +e.hours || 2)) }); }
  else { ev.start = +e.start; ev.end = +e.end; if (!(ev.start > 0 && ev.end > ev.start)) return { ok: false, err: "Pick a start and an end time (the end must be after the start)." }; }
  const i = events().findIndex((x) => x.id === ev.id); if (i >= 0) events()[i] = ev; else events().push(ev);
  net.store.commit("prog"); return { ok: true, ev };
}
export function removeEvent(id) { prog().events = events().filter((e) => e.id !== id); net.store.commit("prog"); }

/* ================= weekly arcade tournament ================= */
export const weekKey = (t = Date.now()) => { const d = new Date(Date.UTC(...(x => [x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()])(new Date(t)))); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day); const y = d.getUTCFullYear(); return `${y}-W${String(Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7)).padStart(2, "0")}`; };
export const weekEndsIn = () => { const n = new Date(); const day = n.getUTCDay() || 7; return (8 - day) * 864e5 - (n.getUTCHours() * 3600e3 + n.getUTCMinutes() * 60e3 + n.getUTCSeconds() * 1e3); };
const DEFAULT_PRIZES = [{ cp: 100, setId: "", title: "" }, { cp: 50, setId: "", title: "" }, { cp: 25, setId: "", title: "" }];
export const prizes = (game) => (prog().tcfg[game] || DEFAULT_PRIZES);
export function setPrizes(game, list) { prog().tcfg[game] = list.slice(0, 3).map((p) => ({ cp: Math.max(0, Math.floor(+p.cp) || 0), setId: p.setId || "", title: String(p.title || "").slice(0, 28) })); net.store.commit("prog"); }
export function submitScore(user, game, score) {
  score = Math.floor(+score); if (!user || !(score > 0) || score > 100000) return; settle();
  const w = ((prog().tourney[weekKey()] ||= {})[game] ||= {}); if ((w[user] || 0) < score) { w[user] = score; net.store.commit("prog"); }
}
export const top = (game, wk = weekKey(), n = 10) => Object.entries(prog().tourney[wk]?.[game] || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([user, score], i) => ({ rank: i + 1, user, score }));
export const myRank = (user, game) => { const all = Object.entries(prog().tourney[weekKey()]?.[game] || {}).sort((a, b) => b[1] - a[1]); const i = all.findIndex(([u]) => u === user); return i < 0 ? null : { rank: i + 1, score: all[i][1], of: all.length }; };
/** Pay the prizes of every finished week once. */
export function settle() {
  const p = prog(), cur = weekKey(); const weeks = Object.keys(p.tourney).filter((w) => w < cur && w > (p.tsettled || "")).sort(); if (!weeks.length) return;
  for (const wk of weeks) for (const game of Object.keys(p.tourney[wk])) top(game, wk, 3).forEach((r, i) => {
    const pz = prizes(game)[i]; if (!pz) return; if (pz.cp) eco.addCP(r.user, pz.cp, false, true);
    if (pz.setId) sets.grant(r.user, pz.setId, { prize: wk });
    const ttl = pz.title ? `${pz.title}` : i === 0 ? `${game === "dash" ? "Dash" : "Run"} Champion ${wk}` : ""; if (ttl) { const u = U(r.user); if (!u.titles.includes(ttl)) u.titles.push(ttl); }
    if (i === 0) U(r.user).stats.tourney_win = (U(r.user).stats.tourney_win || 0) + 1;
    notify(r.user, `🏆 Weekly tournament ${wk}: you finished #${r.rank} in ${game === "dash" ? "Carrot Dash" : "Carrot Run"}! ${pz.cp ? "+" + pz.cp + " 🥕 " : ""}${pz.setId ? "+ a prize set " : ""}${ttl ? "+ title “" + ttl + "”" : ""}`, "tourney"); checkBadges(r.user);
  });
  p.tsettled = weeks[weeks.length - 1]; net.store.commit("prog");
}

/* ================= guestbook ================= */
export const STICKERS = ["👋", "❤️", "🥕", "🔥", "😂", "😮", "🎉", "⭐", "🐰", "💎"];
export const guestbook = (hid) => (prog().guest[hid] ||= []);
export function gbPost(user, hole, { text = "", sticker = "" }) {
  const c = cfg(); text = String(text).replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 160); if (!STICKERS.includes(sticker)) sticker = "";
  if (!text && !sticker) return { ok: false, err: "Write something or pick a sticker." };
  if (/https?:\/\/|www\.|t\.me\/|discord\.gg/i.test(text)) return { ok: false, err: "Links are not allowed in guestbooks." };
  if (net.bannedIds().includes(user)) return { ok: false, err: "Your account is banned." };
  const u = U(user), now = Date.now(); if (u.lastGb && now - u.lastGb < c.guestRate * 1000) return { ok: false, err: `Please wait ${Math.ceil((c.guestRate * 1000 - (now - u.lastGb)) / 1000)}s before posting again.` };
  u.lastGb = now; const list = guestbook(hole.id);
  list.unshift({ id: now.toString(36) + Math.random().toString(36).slice(2, 4), u: user, name: nameOf(user), text, sticker, ts: now, up: [], down: [] }); if (list.length > 120) list.length = 120;
  if (hole.owner && hole.owner !== user) notify(hole.owner, `📖 ${nameOf(user)} signed your guestbook: ${sticker}${sticker && text ? " " : ""}${text.slice(0, 60)}`, "guestbook");
  addXp(user, 3); track(user, "guest_post"); net.store.commit("prog"); return { ok: true };
}
export function gbVote(user, hid, mid, dir) {
  const m = guestbook(hid).find((x) => x.id === mid); if (!m || m.u === user) return false;
  const a = dir > 0 ? "up" : "down", b = dir > 0 ? "down" : "up"; m[b] = m[b].filter((x) => x !== user);
  m[a] = m[a].includes(user) ? m[a].filter((x) => x !== user) : [...m[a], user]; net.store.commit("prog"); return true;
}
export function gbDelete(user, hole, mid) { const m = guestbook(hole.id).find((x) => x.id === mid); if (!m || (m.u !== user && hole.owner !== user)) return false; prog().guest[hole.id] = guestbook(hole.id).filter((x) => x !== m); net.store.commit("prog"); return true; }

/* ================= gifts ================= */
export function giftCarrots(from, to, n) {
  const c = cfg(); n = Math.floor(+n); if (!to || to === from) return { ok: false, err: "Pick another player." };
  if (!(n >= c.giftMin)) return { ok: false, err: `The minimum gift is ${c.giftMin} 🥕.` }; if (n > c.giftMax) return { ok: false, err: `The maximum gift is ${c.giftMax} 🥕.` };
  const u = U(from); if (u.gifted.d !== dayKey()) u.gifted = { d: dayKey(), n: 0 };
  if (u.gifted.n + n > c.giftDaily) return { ok: false, err: `You can gift ${Math.max(0, c.giftDaily - u.gifted.n)} more 🥕 today.` };
  const w = eco.wallet(from); if (w.cp < n) return { ok: false, err: "Not enough carrots. Earn some in the arcade or with your daily missions." };
  w.cp -= n; u.gifted.n += n; eco.addCP(to, n, false, true); notify(to, `🎁 ${nameOf(from)} sent you ${n} 🥕`, "gift"); addXp(from, 5); track(from, "gift_send"); return { ok: true };
}
export function giftSet(from, to, setId) {
  if (!to || to === from) return { ok: false, err: "Pick another player." }; const r = sets.buyFor(from, to, setId); if (!r.ok) return r;
  const s = sets.get(setId); notify(to, `🎁 ${nameOf(from)} gave you the set “${s.name}”${r.no ? " #" + r.no : ""}! Open 🎭 Sets to wear it.`, "gift"); addXp(from, 8); track(from, "gift_send"); return { ok: true };
}

/* ================= analytics for the admin dashboard ================= */
const lastDays = (n) => Array.from({ length: n }, (_, i) => dayKey(Date.now() - (n - 1 - i) * 864e5));
export function analytics() {
  const a = prog().an, days = lastDays(14), dau = days.map((d) => Object.keys(a.days[d]?.u || {}).length);
  const uniq = (n) => { const s = new Set(); lastDays(n).forEach((d) => Object.keys(a.days[d]?.u || {}).forEach((u) => s.add(u))); return s.size; };
  const total = Object.keys(a.first).length, newPer = days.map((d) => Object.values(a.first).filter((f) => f === d).length);
  const ret = (k) => { const cohort = Object.entries(a.first).filter(([, f]) => Date.parse(dayKey()) - Date.parse(f) >= k * 864e5); if (!cohort.length) return null; const back = cohort.filter(([u, f]) => !!a.days[dayKey(Date.parse(f) + k * 864e5)]?.u[u]).length; return { pct: Math.round((back / cohort.length) * 100), of: cohort.length }; };
  const stepUsers = QUESTS.map((q) => ({ ...q, n: Object.values(prog().users).filter((u) => u.quest[q.id]).length }));
  const inactive = Object.entries(a.last).filter(([, l]) => (Date.parse(dayKey()) - Date.parse(l)) / 864e5 >= 3).map(([u]) => u);
  const dropAt = {}; inactive.forEach((u) => { const q = QUESTS.find((x) => !U(u).quest[x.id]); const k = q ? q.text : "Finished the starter path"; dropAt[k] = (dropAt[k] || 0) + 1; });
  const feats = Object.entries(a.feat).map(([evt, users]) => ({ evt, users: Object.keys(users).length })).sort((x, y) => y.users - x.users);
  const todayE = a.days[dayKey()]?.e || {};
  return { days, dau, newPer, wau: uniq(7), mau: uniq(30), total, d1: ret(1), d7: ret(7), stepUsers, dropAt, inactive: inactive.length, feats, todayE };
}

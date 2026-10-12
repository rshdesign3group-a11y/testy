/**
 * In-game economy (separate from SOL):
 *   🥕 Carrot points (CP): earned by daily visits, inviting friends, buying a hole, deepening, tweeting about the game.
 *   🪙 Coins: bought with CP at the Carrot Stand (limited per day).
 *   Rare items found on the map are sold at the Tool Shop for CP.
 * State lives in the net layer (store). With the local driver it is per browser; move it to the server when you go live.
 */
import { store } from "./social.js?v=13";

export const RATES_DEFAULT = { cpPerCoin: 10, convCap: 300, dailyCpCap: 600, itemsPerDay: 12 };
export const RARITY = {
  common: { name: "Common", color: "#e9ddff", cp: 8 }, uncommon: { name: "Uncommon", color: "#86efac", cp: 20 },
  rare: { name: "Rare", color: "#93c5fd", cp: 60 }, epic: { name: "Epic", color: "#f0abfc", cp: 200 }
};
export const REWARDS = { buyBase: 50, buyPerLevel: 5, deepenPerLevel: 10, invite: 30, inviteBuys: 100, tweet: 80 };
const today = () => new Date().toISOString().slice(0, 10);
export const rates = () => ({ ...RATES_DEFAULT, ...store.get().rates });

export function wallet(user) {
  const w = store.get().wallets;
  const o = (w[user] ||= { cp: 0, coins: 0, streak: 0, lastDaily: "", dayCp: { d: "", n: 0 }, dayConv: { d: "", n: 0 }, items: [], cd: "", collected: {}, dayItems: 0, tweetAt: 0, totalCp: 0 });
  if (o.cd !== today()) { o.cd = today(); o.collected = {}; o.dayItems = 0; }
  return o;
}

/** Give carrot points. `capped` ones count against the daily cap (everything except item sales and special bonuses). */
export function addCP(user, amount, capped = true) {
  const w = wallet(user), r = rates();
  if (capped) { if (w.dayCp.d !== today()) w.dayCp = { d: today(), n: 0 }; amount = Math.min(amount, Math.max(0, r.dailyCpCap - w.dayCp.n)); w.dayCp.n += amount; }
  if (amount <= 0) return 0;
  w.cp += amount; w.totalCp += amount; store.commit("eco");
  return amount;
}
export function spendCoins(user, n) { const w = wallet(user); if (w.coins < n) return false; w.coins -= n; store.commit("eco"); return true; }

/* ---------- daily visit ---------- */
export function dailyStatus(user) {
  const w = wallet(user), d = today(), yest = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const claimed = w.lastDaily === d, next = claimed ? w.streak : (w.lastDaily === yest ? w.streak + 1 : 1);
  return { claimed, streak: w.streak, next, reward: 10 + Math.min(next - 1, 6) * 5 + (next % 7 === 0 ? 20 : 0), coinBonus: next % 7 === 0 ? 2 : 0 };
}
export function claimDaily(user) {
  const s = dailyStatus(user); if (s.claimed) return { ok: false };
  const w = wallet(user); w.lastDaily = today(); w.streak = s.next; w.coins += s.coinBonus;
  return { ok: true, cp: addCP(user, s.reward, false), streak: s.next, coins: s.coinBonus };
}

/* ---------- carrot stand: CP -> coins ---------- */
export function sellCP(user, cp) {
  const w = wallet(user), r = rates(); cp = Math.floor(cp);
  if (!(cp >= r.cpPerCoin)) return { ok: false, err: `Minimum is ${r.cpPerCoin} 🥕.` };
  if (cp > w.cp) return { ok: false, err: "Not enough carrot points." };
  if (w.dayConv.d !== today()) w.dayConv = { d: today(), n: 0 };
  const room = r.convCap - w.dayConv.n; if (room < r.cpPerCoin) return { ok: false, err: "Daily limit reached. Come back tomorrow." };
  cp = Math.min(cp, room); const coins = Math.floor(cp / r.cpPerCoin), used = coins * r.cpPerCoin;
  w.cp -= used; w.coins += coins; w.dayConv.n += used; store.commit("eco");
  return { ok: true, coins, used };
}
export function convLeft(user) { const w = wallet(user); return Math.max(0, rates().convCap - (w.dayConv.d === today() ? w.dayConv.n : 0)); }

/* ---------- rare items (spawned on the map by items.js) ---------- */
export const hasCollected = (user, id) => !!wallet(user).collected[id];
export function collect(user, item) {
  const w = wallet(user), r = rates();
  if (w.collected[item.id]) return { ok: false, err: "You already picked this up." };
  if (w.dayItems >= r.itemsPerDay) return { ok: false, err: `Daily limit reached (${r.itemsPerDay} items). More appear tomorrow!` };
  w.collected[item.id] = 1; w.dayItems++; w.items.push({ id: item.id, name: item.name, icon: item.icon, rarity: item.rarity, ts: Date.now() });
  store.commit("eco");
  return { ok: true };
}
export const itemValue = (it) => RARITY[it.rarity].cp;
export function sellItems(user, ids) {                       // ids: array or "all"
  const w = wallet(user), pick = ids === "all" ? w.items.slice() : w.items.filter((i) => ids.includes(i.id));
  if (!pick.length) return { ok: false, err: "Nothing to sell." };
  const total = pick.reduce((s, i) => s + itemValue(i), 0);
  w.items = w.items.filter((i) => !pick.includes(i));
  addCP(user, total, false);
  return { ok: true, cp: total, n: pick.length };
}

/* ---------- purchases and progress ---------- */
export const rewardBuy = (user, depth) => addCP(user, REWARDS.buyBase + REWARDS.buyPerLevel * depth);
export const rewardDeepen = (user, levels = 1) => addCP(user, REWARDS.deepenPerLevel * levels);

/* ---------- invites (?ref=<id>) ---------- */
export function referral(ref, invitee) {
  const s = store.get(); if (!ref || ref === invitee || s.referrals[invitee]) return false;
  const today10 = Object.values(s.referrals).filter((r) => r.ref === ref && Date.now() - r.ts < 864e5).length;
  s.referrals[invitee] = { ref, ts: Date.now(), bought: false };
  if (today10 < 10) addCP(ref, REWARDS.invite, false); else store.commit("eco");
  return true;
}
export function referralBought(invitee) {
  const r = store.get().referrals[invitee]; if (!r || r.bought) return;
  r.bought = true; addCP(r.ref, REWARDS.inviteBuys, false);
}
export const invitedBy = (user) => Object.values(store.get().referrals).filter((r) => r.ref === user).length;

/* ---------- tweet proof (an admin approves it) ---------- */
export const TWEET_RE = /^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d{5,25}\/?(\?.*)?$/;
export function submitTweet(user, url) {
  const w = wallet(user), s = store.get(); url = String(url || "").trim();
  if (!TWEET_RE.test(url)) return { ok: false, err: "Paste the link of your tweet (https://x.com/you/status/123…)." };
  if (s.claims.some((c) => c.url.split("?")[0] === url.split("?")[0])) return { ok: false, err: "This tweet was already submitted." };
  if (Date.now() - w.tweetAt < 7 * 864e5 && s.claims.some((c) => c.user === user && c.status !== "rejected")) return { ok: false, err: "You can claim one tweet per week." };
  s.claims.push({ id: Date.now() + Math.random().toString(36).slice(2, 6), user, url, ts: Date.now(), status: "pending" });
  w.tweetAt = Date.now(); store.commit("eco");
  return { ok: true };
}
export function reviewClaim(id, approve, by) {
  const c = store.get().claims.find((x) => x.id === id); if (!c || c.status !== "pending") return;
  c.status = approve ? "approved" : "rejected"; c.by = by;
  if (approve) addCP(c.user, REWARDS.tweet, false); else wallet(c.user).tweetAt = 0;
  store.commit("eco");
}
export const claims = () => store.get().claims;
export function setRates(patch) { store.get().rates = { ...store.get().rates, ...patch }; store.commit("eco"); }

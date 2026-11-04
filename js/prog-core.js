/** Shared base for the progress systems: the state root, admin-tunable numbers, the inbox (notifications) and player names. */
import * as net from "./social.js?v=14";

const st = () => net.store.get();
export const prog = () => (st().prog ||= { users: {}, events: [], guest: {}, inbox: {}, an: { days: {}, first: {}, last: {}, feat: {} }, tourney: {}, tsettled: "", tcfg: {}, cfg: {}, designs: [], catalog: [], owns: {}, treasure: {} });
export const DEFAULT_CFG = {
  xpMult: 1, missionMult: 1, missionBonus: 20, missionsOff: {},          // missions
  idleBase: 2, idlePerDepth: 0.4, idlePerDecor: 0.3, idleCapHours: 12,    // idle carrots (per hour)
  treasureCp: 40, treasureOn: 1,
  giftMin: 5, giftMax: 500, giftDaily: 1000,                               // carrot gifts
  marketFee: 5, designerFee: 20,                                           // % kept by the game on resales / designer sets
  guestRate: 20,                                                           // seconds between guestbook posts
  inviteeBonus: 20, questMult: 1
};
export const cfg = () => ({ ...DEFAULT_CFG, ...prog().cfg });
export function setCfg(patch) { const c = prog().cfg; for (const k of Object.keys(DEFAULT_CFG)) if (k in patch) { const v = patch[k]; c[k] = typeof DEFAULT_CFG[k] === "object" ? v : Math.max(0, +v || 0); } net.store.commit("prog"); }

/* ---------- names ---------- */
export const hooks = { name: null };
export const short = (u) => (u ? String(u).slice(0, 4) + "…" + String(u).slice(-4) : "someone");
export const nameOf = (u) => (hooks.name && hooks.name(u)) || short(u);

/* ---------- inbox ---------- */
export function notify(user, text, kind = "info") {
  if (!user) return;
  const box = (prog().inbox[user] ||= []); box.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ts: Date.now(), kind, text: String(text).slice(0, 240), read: false });
  if (box.length > 60) box.length = 60;
  net.store.commit("inbox");
}
export const inbox = (user) => prog().inbox[user] || [];
export const unread = (user) => inbox(user).filter((m) => !m.read).length;
export function markRead(user) { let ch = false; for (const m of inbox(user)) if (!m.read) { m.read = true; ch = true; } if (ch) net.store.commit("inbox"); }

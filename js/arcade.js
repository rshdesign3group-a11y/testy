/**
 * Arcade: mini-games (iframes in games/<name>/) playable on an arcade machine.
 *  - The café machine plays the game the admin picked (or no machine when it is "off").
 *  - Admins can also put a machine on any floor of any burrow (Admin → Arcade), each with its own game.
 * The mini-games use the player's REAL carrot points (🥕 CP of the main game): entry fees are taken from them and
 * winnings are added to them – both ways stay in sync. Profit is capped per player per day (rates.arcadeCap).
 * NOTE: client-side with the local driver. On a real backend the server must own the balance and validate runs.
 *
 * To add a new mini-game: copy it into games/<name>/ and add an entry to GAMES below + a bridge in arcade-ui.js.
 */
import * as net from "./social.js?v=14";
import * as eco from "./economy.js?v=14";
import { TAU } from "./world.js?v=14";

export const GAMES = {
  dash: { id: "dash", name: "Carrot Dash", icon: "🥕", color: "#ff8a1f", url: "games/carrot-dash/index.html?embed=1", proto: "dash", hint: "" },
  run:  { id: "run",  name: "Carrot Run",  icon: "🐰", color: "#a855f7", url: "games/carrot-run/index.html?embed=1",  proto: "run",  hint: "📱 On a phone, turn it sideways for the best view." }
};
const st = () => net.store.get();
const A = () => (st().arcade ||= { cafe: null, machines: [] });
const stat = (g) => ((st().arcadeStats ||= {})[g] ||= { plays: 0, spent: 0, paid: 0 });
const err = (e) => ({ ok: false, err: e });

/* ---------- where machines are (admin) ---------- */
export const cafeGame = () => (GAMES[A().cafe] ? A().cafe : null);
export function setCafeGame(id) { A().cafe = GAMES[id] ? id : null; net.store.commit("arcade"); }
export const machines = () => A().machines;
export const machineFor = (holeId, floor) => A().machines.find((m) => m.hole === holeId && m.floor === floor && GAMES[m.game]) || null;
export function setMachine({ hole, floor, game }) {
  floor = Math.floor(+floor); hole = Math.floor(+hole);
  if (!GAMES[game]) return err("Pick a game."); if (!(hole >= 0) || !(floor >= 0)) return err("Pick a hole and a floor.");
  const m = A().machines.find((x) => x.hole === hole && x.floor === floor);
  if (m) m.game = game; else A().machines.push({ id: "am" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), hole, floor, game, ts: Date.now() });
  net.store.commit("arcade"); return { ok: true };
}
export function changeGame(id, game) { const m = A().machines.find((x) => x.id === id); if (m && GAMES[game]) { m.game = game; net.store.commit("arcade"); } }
export function removeMachine(id) { A().machines = A().machines.filter((m) => m.id !== id); net.store.commit("arcade"); }
export const statsFor = (g) => ({ ...stat(g) });

/* ---------- carrots: the mini-games spend and win the SAME 🥕 as the main game ---------- */
const today = () => new Date().toISOString().slice(0, 10);
const day = (w) => (w.arc && w.arc.d === today() ? w.arc : (w.arc = { d: today(), spent: 0, won: 0, profit: 0 }));
export const cap = () => Math.max(0, Math.floor(eco.rates().arcadeCap));
export const carrots = (user) => eco.wallet(user).cp;
const seenRuns = new Map();                                // runId -> entry paid (stops replayed / double refunds)

/** Take an entry fee / revive price. Returns true when paid. */
export function spend(user, amount, game, runId) {
  amount = Math.floor(+amount); const w = eco.wallet(user);
  if (!(amount > 0) || amount > 5000 || w.cp < amount) return false;
  if (runId) { if (seenRuns.has(runId)) return false; seenRuns.set(runId, amount); if (seenRuns.size > 400) seenRuns.delete(seenRuns.keys().next().value); }
  w.cp -= amount; day(w).spent += amount; const s = stat(game); s.plays++; s.spent += amount;
  net.store.commit("eco"); return true;
}
function pay(user, amount, game) {                          // add carrots (not part of the normal daily 🥕 cap: the arcade has its own)
  if (amount <= 0) return 0; const w = eco.wallet(user);
  w.cp += amount; w.totalCp += amount; stat(game).paid += amount; net.store.commit("eco"); return amount;
}
/** "Carrot Dash" style: positive balance changes. Day profit (won - spent) is capped. Returns the amount really paid. */
export function awardNet(user, amount, game) {
  amount = Math.floor(+amount); if (!(amount > 0) || amount > 5000) return 0;
  const a = day(eco.wallet(user));
  const paid = Math.max(0, Math.min(amount, cap() - (a.won - a.spent)));          // never let today's profit (won - spent) pass the cap
  a.won += paid; return pay(user, paid, game);
}
/** "Carrot Run" style: refund of the entry fee (once, never more than was paid) + profit (capped per day). */
export function awardRun(user, amount, info, runId, game) {
  amount = Math.floor(+amount); if (!(amount > 0) || amount > 5000) return 0;
  const w = eco.wallet(user), a = day(w); let profit = Math.max(0, Math.min(amount, Math.floor(+info?.profit || 0)));
  let refund = amount - profit; const paidIn = seenRuns.get(runId) || 0;
  refund = Math.max(0, Math.min(refund, paidIn)); if (refund) seenRuns.set(runId, 0);     // one refund per paid entry
  profit = Math.min(profit, Math.max(0, cap() - a.profit)); a.profit += profit; a.won += refund + profit;
  return pay(user, refund + profit, game);
}
export const earnedToday = (user) => day(eco.wallet(user)).profit;

/* ---------- drawing: the arcade cabinet (used by burrows and the café) ---------- */
export function drawCabinet(ctx, t, game, label = true) {
  const g = GAMES[game] || GAMES.dash, c = g.color;
  ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(6, 1, 30, 10, 0, 0, TAU); ctx.fill();
  // side panel (3D look) + body
  ctx.fillStyle = "#2e1065"; ctx.beginPath(); ctx.moveTo(22, -90); ctx.lineTo(34, -96); ctx.lineTo(34, -8); ctx.lineTo(22, 0); ctx.closePath(); ctx.fill();
  const body = ctx.createLinearGradient(-22, 0, 22, 0); body.addColorStop(0, "#4c1d95"); body.addColorStop(1, "#3b0764");
  ctx.fillStyle = body; ctx.beginPath(); ctx.roundRect(-22, -92, 44, 92, 3); ctx.fill();
  ctx.strokeStyle = c; ctx.globalAlpha = .55 + .35 * Math.sin(t * 3); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-19, -4); ctx.lineTo(-19, -80); ctx.moveTo(19, -4); ctx.lineTo(19, -80); ctx.stroke(); ctx.globalAlpha = 1;   // neon edge lights
  // marquee
  ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 10; ctx.beginPath(); ctx.roundRect(-22, -104, 44, 14, 3); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff"; ctx.font = "bold 8px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(g.name.toUpperCase(), 0, -97);
  // screen
  ctx.fillStyle = "#020617"; ctx.beginPath(); ctx.roundRect(-17, -86, 34, 32, 3); ctx.fill();
  const sg = ctx.createLinearGradient(0, -83, 0, -57); sg.addColorStop(0, `hsl(${(t * 40) % 360},70%,28%)`); sg.addColorStop(1, `hsl(${(t * 40 + 90) % 360},70%,18%)`);
  ctx.fillStyle = sg; ctx.fillRect(-15, -84, 30, 28);
  ctx.font = "15px system-ui"; ctx.fillText(g.icon, Math.sin(t * 2.2) * 8, -70 + Math.abs(Math.sin(t * 4)) * -5);
  ctx.fillStyle = "rgba(255,255,255,.07)"; for (let y = -84; y < -56; y += 3) ctx.fillRect(-15, y, 30, 1);                // scanlines
  // control panel: joystick + buttons + coin slot
  ctx.fillStyle = "#1e1b4b"; ctx.beginPath(); ctx.moveTo(-22, -50); ctx.lineTo(22, -50); ctx.lineTo(26, -38); ctx.lineTo(-18, -38); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#a1a1aa"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-9, -44); ctx.lineTo(-9 + Math.sin(t * 3) * 1.5, -50); ctx.stroke();
  ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(-9 + Math.sin(t * 3) * 1.5, -51, 3, 0, TAU); ctx.fill();
  ctx.fillStyle = "#22c55e"; ctx.beginPath(); ctx.arc(6, -44, 2.6, 0, TAU); ctx.fill(); ctx.fillStyle = "#38bdf8"; ctx.beginPath(); ctx.arc(14, -44, 2.6, 0, TAU); ctx.fill();
  ctx.fillStyle = "#facc15"; ctx.fillRect(-5, -26, 10, 7); ctx.fillStyle = "#713f12"; ctx.fillRect(-1, -25, 2, 5);
  if (label) {                                           // floating "PLAY" tag so people notice it
    const bob = Math.sin(t * 3) * 3; ctx.fillStyle = "rgba(15,23,42,.9)"; ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(-30, -134 + bob, 60, 20, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "bold 11px system-ui"; ctx.fillText("🕹 PLAY", 0, -124 + bob);
  }
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}

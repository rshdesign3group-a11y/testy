/**
 * Arcade overlay: runs a mini-game in an iframe and keeps its carrots in sync with the main game's 🥕 points.
 * Two small protocols are supported (see the comment at the top of each game file):
 *   "dash": Carrot Dash. The NEW version asks the host for everything (carrot-dash:req ops enter / clear / revive / end ->
 *           carrot-dash:res) and never decides amounts; the host keeps one open run per player, checks the order and the
 *           time of each cleared level and pays the reward from ITS OWN table. The old version (carrot-dash:delta) still works.
 *   "run" : game -> host  {src:'rabbit-game', type: balance|spend|award|earnedToday, id, ...}, host -> game {src:'host', id, ...}
 */
import * as net from "./social.js?v=14";
import * as arcade from "./arcade.js?v=14";
import * as audio from "./audio.js?v=14";

/* ---------- Carrot Dash (new protocol): the host is the referee ---------- */
const DASH_FEE = 10, REWARD_EARLY = [1, 1, 1, 1, 2, 2, 2];
const dashReward = (L) => (L % 15 === 0 ? 15 + 5 * ((L / 15 | 0) - 1) : L <= 7 ? REWARD_EARLY[L - 1] : Math.min(5, 1 + ((L - 8) >> 1)));
const dashTarget = (L) => (L % 15 === 0 ? 10 + 2 * (L / 15 | 0) : Math.min(4 + L, 26));
const dashRevive = (L) => 20 + Math.min(20, L - 15);
const rnd = () => Math.random().toString(36).slice(2, 10);

export function initArcadeUI({ social, session }) {
  const { h, btn } = social, say = (t) => social.say?.(t);
  const chip = h("span", "arc-chip"), title = h("b", "arc-title"), hint = h("small", "arc-hint");
  const closeB = btn("✕ Close", "btn-secondary", () => close());
  const holder = h("div", "arc-frame");
  const ov = h("div", "arcade-overlay hidden", h("div", "arc-bar", title, chip, closeB), hint, holder);
  document.body.append(ov);
  let frame = null, game = null, onMsg = null, run = null;
  const user = () => session.user;
  const refresh = () => { chip.textContent = `🥕 ${arcade.carrots(user())}`; };
  net.on((e) => { if (game && (e === "eco")) refresh(); });

  function close() {
    if (onMsg) removeEventListener("message", onMsg); onMsg = null;
    if (frame) { frame.src = "about:blank"; frame.remove(); } frame = null; game = null; run = null;
    ov.classList.add("hidden"); audio.sfx("close");
  }

  function open(g) {
    const G = arcade.GAMES[g]; if (!G) return;
    if (!session.wallet) { say("Connect your wallet to play – your 🥕 carrots are saved with it."); audio.sfx("error"); return; }
    if (net.bannedIds().includes(user())) { say("Your account is banned."); return; }
    if (frame) close();
    game = g; title.textContent = `${G.icon} ${G.name}`; hint.textContent = G.hint; hint.style.display = G.hint ? "" : "none"; refresh();
    frame = document.createElement("iframe"); frame.className = "arc-iframe"; frame.allow = "autoplay; fullscreen"; frame.title = G.name;
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");               // first-party games only
    const toGame = (m) => frame?.contentWindow?.postMessage(m, "*");
    onMsg = (e) => {
      if (!frame || e.source !== frame.contentWindow) return;                      // only OUR game talks to us
      const d = e.data; if (!d || typeof d !== "object") return;
      if (G.proto === "dash") {
        const bal = () => arcade.carrots(user());
        if (d.type === "carrot-dash:ready") { toGame({ type: "carrot-dash:balance", balance: bal() }); return; }
        if (d.type === "carrot-dash:exit") { close(); return; }
        if (d.type === "carrot-dash:out-of-carrots") { say("Out of carrots! Earn some in the main game, then come back. 🥕"); return; }
        if (d.type === "carrot-dash:req") {                                       // NEW protocol: request -> response
          const res = (o) => toGame({ type: "carrot-dash:res", id: d.id, balance: bal(), ...o });
          const R = run, now = Date.now();
          if (d.op === "enter") {
            run = null;                                                            // one open run per player: an abandoned run is simply closed
            const id = rnd();
            if (!arcade.spend(user(), DASH_FEE, g, "d" + id)) { audio.sfx("error"); return res({ ok: false }); }
            run = { run: id, tk: rnd() + rnd(), next: 1, t: now, revived: false };
            return res({ ok: true, run: run.run, tk: run.tk });
          }
          if (!R || d.run !== R.run || d.tk !== R.tk) return res({ ok: false });   // no open run / wrong ticket
          if (d.op === "clear") {
            const L = Math.trunc(+d.level), need = 0.8 * (dashTarget(L) - 3);
            if (L !== R.next || L < 1 || L > 500 || !(+d.secs >= need) || (now - R.t) / 1000 < need) return res({ ok: false });   // levels only in order, never faster than humanly possible
            const reward = dashReward(L), paid = arcade.awardNet(user(), reward, g);
            R.next++; R.t = now;
            if (paid < reward) say(paid ? `Daily arcade profit limit reached (only +${paid} 🥕 paid).` : "Daily arcade profit limit reached. Come back tomorrow!"); else if (paid) say(`+${paid} 🥕`);
            return res({ ok: true, reward: paid });
          }
          if (d.op === "revive") {
            const L = Math.trunc(+d.level);
            if (R.revived || L < 15 || L !== R.next) return res({ ok: false });
            if (!arcade.spend(user(), dashRevive(L), g, "v" + R.run)) return res({ ok: false });
            R.revived = true; R.t = now; return res({ ok: true });
          }
          if (d.op === "end") { run = null; return res({ ok: true }); }
          return res({ ok: false });
        }
        if (d.type === "carrot-dash:delta") {                                       // OLD protocol (previous version of the game)
          const amt = Math.trunc(+d.amount) || 0;
          if (amt < 0) { if (!arcade.spend(user(), -amt, g)) audio.sfx("error"); }
          else if (amt > 0) { const paid = arcade.awardNet(user(), amt, g); if (paid < amt) say(paid ? `Daily arcade profit limit reached (only +${paid} 🥕 paid).` : "Daily arcade profit limit reached. Come back tomorrow!"); else if (paid) say(`+${paid} 🥕`); }
          const real = bal(); if (real !== Math.trunc(+d.balance)) toGame({ type: "carrot-dash:balance", balance: real });
        }
      } else if (G.proto === "run" && d.src === "rabbit-game") {
        const reply = (o) => toGame({ src: "host", id: d.id, ...o });
        if (d.type === "balance") reply({ ok: true, balance: arcade.carrots(user()) });
        else if (d.type === "spend") reply({ ok: arcade.spend(user(), d.amount, g, String(d.runId || "")) });
        else if (d.type === "award") { const paid = arcade.awardRun(user(), d.amount, d.info, String(d.runId || ""), g); if (paid) say(`+${paid} 🥕`); reply({ ok: true }); }
        else if (d.type === "earnedToday") reply({ ok: true, earned: arcade.earnedToday(user()) });
        else reply({ ok: false });
      }
    };
    addEventListener("message", onMsg);
    frame.src = G.url + (G.url.includes("?") ? "&" : "?") + "v=" + (G.v || 1) + "b2"; holder.append(frame); ov.classList.remove("hidden"); audio.sfx("ding");
    frame.addEventListener("load", () => frame?.focus());
  }
  return { open, close, isOpen: () => !!game };
}

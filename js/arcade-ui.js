/**
 * Arcade overlay: runs a mini-game in an iframe and keeps its carrots in sync with the main game's 🥕 points.
 * Two small protocols are supported (see the comment at the top of each game file):
 *   "dash": game -> host  carrot-dash:ready | delta {amount} | exit | out-of-carrots,  host -> game  carrot-dash:balance
 *   "run" : game -> host  {src:'rabbit-game', type: balance|spend|award|earnedToday, id, ...}, host -> game {src:'host', id, ...}
 */
import * as net from "./social.js?v=14";
import * as arcade from "./arcade.js?v=14";
import * as audio from "./audio.js?v=14";

export function initArcadeUI({ social, session }) {
  const { h, btn } = social, say = (t) => social.say?.(t);
  const chip = h("span", "arc-chip"), title = h("b", "arc-title"), hint = h("small", "arc-hint");
  const closeB = btn("✕ Close", "btn-secondary", () => close());
  const holder = h("div", "arc-frame");
  const ov = h("div", "arcade-overlay hidden", h("div", "arc-bar", title, chip, closeB), hint, holder);
  document.body.append(ov);
  let frame = null, game = null, onMsg = null;
  const user = () => session.user;
  const refresh = () => { chip.textContent = `🥕 ${arcade.carrots(user())}`; };
  net.on((e) => { if (game && (e === "eco")) refresh(); });

  function close() {
    if (onMsg) removeEventListener("message", onMsg); onMsg = null;
    if (frame) { frame.src = "about:blank"; frame.remove(); } frame = null; game = null;
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
        if (d.type === "carrot-dash:ready") toGame({ type: "carrot-dash:balance", balance: arcade.carrots(user()) });
        else if (d.type === "carrot-dash:delta") {
          const amt = Math.trunc(+d.amount) || 0;
          if (amt < 0) { if (!arcade.spend(user(), -amt, g)) audio.sfx("error"); }
          else if (amt > 0) { const paid = arcade.awardNet(user(), amt, g); if (paid < amt) say(paid ? `Daily arcade profit limit reached (only +${paid} 🥕 paid).` : "Daily arcade profit limit reached. Come back tomorrow!"); else if (paid) say(`+${paid} 🥕`); }
          // Only correct the game when its number differs from the real one. (Answering every change made the game
          // redraw its MENU right after "ENTER", so you paid but never got into the game.)
          const real = arcade.carrots(user());
          if (real !== Math.trunc(+d.balance)) toGame({ type: "carrot-dash:balance", balance: real });
        } else if (d.type === "carrot-dash:exit") close();
        else if (d.type === "carrot-dash:out-of-carrots") say("Out of carrots! Earn some in the main game, then come back. 🥕");
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
    frame.src = G.url + (G.url.includes("?") ? "&" : "?") + "v=" + (G.v || 1); holder.append(frame); ov.classList.remove("hidden"); audio.sfx("ding");
    frame.addEventListener("load", () => frame?.focus());
  }
  return { open, close, isOpen: () => !!game };
}

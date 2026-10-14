/** Player side of the character sets: “🎭 Sets” in the profile / burrow header. Buying is the only way to change your rabbit. */
import * as net from "./social.js?v=14";
import * as eco from "./economy.js?v=14";
import * as sets from "./sets.js?v=14";
import * as audio from "./audio.js?v=14";
import * as fx from "./fx.js?v=14";
import { lookFor } from "./world.js?v=14";
import { drawRabbitPreview } from "./room.js?v=14";
import { fmtSol } from "./pricing.js?v=14";

/** Draw now and again shortly after, because part pictures load the first time they are needed. */
export function drawPreviewSoon(canvas, look) { const d = () => canvas.isConnected && drawRabbitPreview(canvas, look); d(); setTimeout(d, 250); setTimeout(d, 900); }

export function initSetsUI({ social, session, getMyHoles, applyLook }) {
  const { modal, h, btn, ask, say } = social;
  const m = modal("🎭 Character sets", true);
  const user = () => session.user;

  function currentLook() { const my = getMyHoles()[0]; return my ? lookFor(user(), my.customRabbit, !!my.special) : null; }
  function previewLook(cur, s, entry) {                 // how this set would look on YOUR rabbit
    const body = entry?.body || (s.body.mode === "fixed" ? { color: s.body.color, ear: sets.darken(s.body.color) } : null);
    return { color: body?.color || cur.color, earColor: body?.ear || cur.ear, acc: cur.acc, parts: s.parts };
  }
  const costLine = (s) => h("span", "set-price " + s.currency, sets.priceText(s));

  function buy(s) {
    if (!session.wallet) { say("Connect your wallet to buy sets."); audio.sfx("error"); return; }
    if (!getMyHoles().length) { say("Buy a hole first – your rabbit lives in it."); audio.sfx("error"); return; }
    const cur = s.currency === "sol" ? `${fmtSol(net.balance(user()))} SOL balance` : `${eco.wallet(user()).coins} 🪙 coins`;
    ask({ title: `Buy “${s.name}”`, text: `This set costs ${sets.priceText(s)} (${s.currency === "sol" ? "SOL only" : "coins only"}). You have ${cur}. Your rabbit changes right away.`, label: "Buy & wear" }, () => {
      const r = sets.purchase(user(), s.id);
      if (!r.ok) { say(r.err); audio.sfx("error"); return; }
      applyLook(sets.lookPatch(user(), s.id)); audio.sfx("buy"); fx.confetti(); say(`You are now wearing ${s.name}! 🎭`); render();
    });
  }
  function wear(s) { const r = sets.wear(user(), s.id); if (!r.ok) return say(r.err); applyLook(sets.lookPatch(user(), s.id)); audio.sfx("click"); say(`Wearing ${s.name}.`); render(); }

  function render() {
    const b = m.body; b.replaceChildren();
    const my = getMyHoles()[0], cur = currentLook();
    if (!session.wallet) { b.append(h("p", "chat-empty", "Connect your wallet to see and buy character sets.")); return; }
    if (!my || !cur) { b.append(h("p", "chat-empty", "Buy a hole first – your rabbit lives in it. Then you can dress it up here.")); return; }
    const nowCv = h("canvas"); nowCv.width = 150; nowCv.height = 170; nowCv.className = "set-cv";
    const wearing = sets.get(sets.equippedId(user()));
    b.append(h("div", "set-now", nowCv, h("div", null, h("b", null, "Your rabbit"), h("p", "modal-desc", wearing ? `Wearing: ${wearing.name}` : "No set yet."),
      h("p", "modal-desc", "Your look can only be changed by buying a set. Sets are paid with 🪙 coins or with SOL – each set uses one of them."),
      h("p", "modal-desc", `🪙 ${eco.wallet(user()).coins}  ·  ${fmtSol(net.balance(user()))} SOL`))));
    drawPreviewSoon(nowCv, { color: cur.color, earColor: cur.ear, acc: cur.acc, parts: cur.parts });
    const list = sets.all().filter((s) => s.onSale || sets.has(user(), s.id));
    if (!list.length) { b.append(h("p", "chat-empty", "No sets in the shop yet. Check back soon!")); return; }
    const grid = h("div", "set-grid");
    list.forEach((s) => {
      const own = sets.has(user(), s.id), on = sets.equippedId(user()) === s.id, cv = h("canvas"); cv.width = 150; cv.height = 170; cv.className = "set-cv";
      drawPreviewSoon(cv, previewLook(cur, s, sets.ownedEntry(user(), s.id)));
      const parts = Object.keys(s.parts).length;
      grid.append(h("div", "set-card" + (on ? " on" : ""), cv, h("b", null, s.name), s.desc ? h("small", null, s.desc) : null,
        h("small", null, `${parts} item${parts === 1 ? "" : "s"}${s.body.mode === "random" ? " · random colour" : s.body.mode === "fixed" ? " · body colour" : ""}`),
        own ? (on ? h("span", "tag", "✓ Wearing") : btn("Wear", "btn-secondary", () => wear(s))) : h("div", "set-buy", costLine(s), btn("Buy", "", () => buy(s)))));
    });
    b.append(grid);
  }
  net.on((e) => { if (m.isOpen() && (e === "sets" || e === "eco" || e === "sales" || e === "holes")) render(); });
  return { open() { render(); m.open(); } };
}

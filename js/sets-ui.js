/** Player side of the character sets: shop (limited & numbered sets), resale market, designing your own sets. Buying is the only way to change your rabbit. */
import * as net from "./social.js?v=14";
import * as eco from "./economy.js?v=14";
import * as sets from "./sets.js?v=14";
import * as audio from "./audio.js?v=14";
import * as fx from "./fx.js?v=14";
import * as pg from "./progress.js?v=14";
import { lookFor, LOOK_PARTS, PART_ORDER } from "./world.js?v=14";
import { drawRabbitPreview } from "./room.js?v=14";
import { fmtSol } from "./pricing.js?v=14";
import { cfg, nameOf } from "./prog-core.js?v=14";

/** Draw now and again shortly after, because part pictures load the first time they are needed. */
export function drawPreviewSoon(canvas, look) { const d = () => canvas.isConnected && drawRabbitPreview(canvas, look); d(); setTimeout(d, 250); setTimeout(d, 900); }
const NAMES = { outfit: "Outfit", mouth: "Mouth", glasses: "Glasses", hat: "Hat", extra: "Extra" };

export function initSetsUI({ social, session, getMyHoles, applyLook }) {
  const { modal, h, btn, ask, say } = social;
  const m = modal("🎭 Character sets", true);
  const user = () => session.user;
  let tab = "shop", draft = null;

  function currentLook() { const my = getMyHoles()[0]; return my ? lookFor(user(), my.customRabbit, !!my.special) : null; }
  function previewLook(cur, s, entry) {                 // how this set would look on YOUR rabbit
    const body = entry?.body || (s.body.mode === "fixed" ? { color: s.body.color, ear: sets.darken(s.body.color) } : null);
    return { color: body?.color || cur.color, earColor: body?.ear || cur.ear, acc: cur.acc, parts: s.parts, pet: s.pet, trail: s.trail };
  }
  const costLine = (s) => h("span", "set-price " + s.currency, sets.priceText(s));
  const extras = (s) => [s.pet ? `${s.pet} pet` : "", s.trail ? `${sets.TRAILS[s.trail]} trail` : ""].filter(Boolean).join(" · ");
  const canvas = () => { const c = h("canvas"); c.width = 150; c.height = 170; c.className = "set-cv"; return c; };
  const guard = () => { if (!session.wallet) { say("Connect your wallet first."); audio.sfx("error"); return true; } if (!getMyHoles().length) { say("Buy a hole first – your rabbit lives in it."); audio.sfx("error"); return true; } return false; };

  function buy(s) {
    if (guard()) return;
    const cur = s.currency === "sol" ? `${fmtSol(net.balance(user()))} SOL balance` : `${eco.wallet(user()).coins} 🪙 coins`;
    ask({ title: `Buy “${s.name}”`, text: `This set costs ${sets.priceText(s)} (${s.currency === "sol" ? "SOL only" : "coins only"}). You have ${cur}.${s.limit ? ` Limited edition: ${sets.left(s)} left.` : ""} Your rabbit changes right away.`, label: "Buy & wear" }, () => {
      const r = sets.purchase(user(), s.id); if (!r.ok) { say(r.err); audio.sfx("error"); return; }
      applyLook(sets.lookPatch(user(), s.id)); pg.track(user(), "set_buy"); audio.sfx("buy"); fx.confetti(); say(`You are now wearing ${s.name}${r.no ? " #" + r.no : ""}! 🎭`); render();
    });
  }
  function wear(s) { const r = sets.wear(user(), s.id); if (!r.ok) return say(r.err); applyLook(sets.lookPatch(user(), s.id)); audio.sfx("click"); say(`Wearing ${s.name}.`); render(); }

  /* ---------- tabs ---------- */
  const tabsBar = () => h("div", "ad-tabs", ...[["shop", "Shop"], ["mine", "My sets & selling"], ["market", `Market (${sets.listings().length})`], ["design", "✏️ Design a set"]].map(([k, t]) => btn(t, k === tab ? "" : "btn-secondary", () => { tab = k; render(); })));

  function header(b, cur) {
    const nowCv = canvas(), wearing = sets.get(sets.equippedId(user()));
    b.append(h("div", "set-now", nowCv, h("div", null, h("b", null, "Your rabbit"), h("p", "modal-desc", wearing ? `Wearing: ${wearing.name}${sets.ownedEntry(user(), wearing.id)?.no ? " #" + sets.ownedEntry(user(), wearing.id).no : ""}` : "No set yet."),
      h("p", "modal-desc", "Your look can only be changed by buying a set. Each set is paid with 🪙 coins or SOL – never both."), h("p", "modal-desc", `🪙 ${eco.wallet(user()).coins}  ·  ${fmtSol(net.balance(user()))} SOL`))));
    const x = sets.extrasFor(user()); drawPreviewSoon(nowCv, { color: cur.color, earColor: cur.ear, acc: cur.acc, parts: cur.parts, pet: x.pet, trail: x.trail });
  }

  function renderShop(b, cur) {
    const list = sets.all().filter((s) => s.onSale || sets.has(user(), s.id));
    if (!list.length) return b.append(h("p", "chat-empty", "No sets in the shop yet. Check back soon!"));
    const grid = h("div", "set-grid");
    list.forEach((s) => {
      const own = sets.has(user(), s.id), on = sets.equippedId(user()) === s.id, ent = sets.ownedEntry(user(), s.id), cv = canvas(), out = sets.soldOut(s) && !own;
      drawPreviewSoon(cv, previewLook(cur, s, ent)); const parts = Object.keys(s.parts).length;
      grid.append(h("div", "set-card" + (on ? " on" : ""), cv, h("b", null, s.name), s.by ? h("small", null, `✏️ by ${s.byName || nameOf(s.by)}`) : null, s.desc ? h("small", null, s.desc) : null,
        h("small", null, `${parts} item${parts === 1 ? "" : "s"}${extras(s) ? " · " + extras(s) : ""}${s.body.mode === "random" ? " · random colour" : s.body.mode === "fixed" ? " · body colour" : ""}`),
        s.limit ? h("small", "set-limited", out ? "Sold out" : `Limited: ${sets.left(s)} of ${s.limit} left`) : null, own && ent?.no ? h("small", "set-limited", `Your copy #${ent.no}`) : null,
        own ? (on ? h("span", "tag", "✓ Wearing") : btn("Wear", "btn-secondary", () => wear(s))) : out ? h("span", "tag", "Sold out") : h("div", "set-buy", costLine(s), btn("Buy", "", () => buy(s)))));
    });
    b.append(grid);
  }

  function renderMine(b, cur) {
    const mine = sets.owned(user()); b.append(h("h3", null, "Sell a set to another player"), h("small", "modal-desc", `Pick your price in the set's own currency. The game keeps ${cfg().marketFee}% when it sells. While listed, the set leaves your closet.`));
    if (!mine.length) return b.append(h("p", "chat-empty", "You don't own any set yet."));
    mine.forEach((o) => { const s = sets.get(o.id); if (!s) return; const price = h("input"); price.type = "number"; price.min = 0; price.step = "any"; price.value = s.price; price.addEventListener("keydown", (e) => e.stopPropagation()); price.style.width = "90px";
      b.append(h("div", "sx-row static", h("span", "nm", `${s.name}${o.no ? " #" + o.no : ""} (${s.currency === "sol" ? "SOL" : "🪙"})`), h("span", "acts", price, btn("List for sale", "btn-secondary", () => {
        const was = sets.equippedId(user()) === s.id, r = sets.listForSale(user(), s.id, price.value); if (!r.ok) { say(r.err); audio.sfx("error"); return; } if (was) applyLook({ parts: {}, body: null }); audio.sfx("sell"); say("Listed on the market."); render();
      })))); });
    const my = sets.listings().filter((l) => l.seller === user());
    if (my.length) b.append(h("h3", null, "Your listings"), ...my.map((l) => h("div", "sx-row static", h("span", "nm", `${sets.get(l.setId)?.name} #${l.entry.no || "?"} · ${sets.priceText({ currency: sets.get(l.setId)?.currency, price: l.price })}`), h("span", "acts", btn("Take back", "btn-secondary", () => { sets.cancelListing(user(), l.id); render(); })))));
  }

  function renderMarket(b, cur) {
    const list = sets.listings().filter((l) => sets.get(l.setId)); b.append(h("p", "modal-desc", "Sets other players sell. Numbered copies keep their number."));
    if (!list.length) return b.append(h("p", "chat-empty", "Nothing for sale right now."));
    const grid = h("div", "set-grid");
    list.forEach((l) => { const s = sets.get(l.setId), cv = canvas(), own = sets.has(user(), s.id), mine = l.seller === user(); drawPreviewSoon(cv, previewLook(cur, s, l.entry));
      grid.append(h("div", "set-card", cv, h("b", null, `${s.name}${l.entry.no ? " #" + l.entry.no : ""}`), h("small", null, `seller ${nameOf(l.seller)}`), extras(s) ? h("small", null, extras(s)) : null,
        mine ? btn("Take back", "btn-secondary", () => { sets.cancelListing(user(), l.id); render(); }) : own ? h("span", "tag", "You own it") : h("div", "set-buy", h("span", "set-price " + s.currency, sets.priceText({ currency: s.currency, price: l.price })), btn("Buy", "", () => {
          if (guard()) return; ask({ title: "Buy from player", text: `Buy “${s.name}” for ${sets.priceText({ currency: s.currency, price: l.price })}? Your rabbit changes right away.`, label: "Buy & wear" }, () => { const r = sets.buyListing(user(), l.id); if (!r.ok) { say(r.err); audio.sfx("error"); return; } applyLook(sets.lookPatch(user(), s.id)); audio.sfx("buy"); fx.confetti(); render(); }); })))); });
    b.append(grid);
  }

  function renderDesign(b, cur) {
    const d = (draft ||= { name: "", desc: "", currency: "coins", price: 100, body: { mode: "keep", color: "#a78bfa" }, parts: {} });
    b.append(h("p", "modal-desc", `Design a set and send it for review. If an admin approves it, it goes on sale with your name and you earn ${100 - cfg().designerFee}% of every sale (the game keeps ${cfg().designerFee}%).`));
    const cv = canvas(), redraw = () => drawPreviewSoon(cv, { color: d.body.mode === "fixed" ? d.body.color : cur.color, earColor: cur.ear, acc: cur.acc, parts: d.parts });
    const inp = (v, type = "text") => { const i = h("input"); i.type = type; i.value = v; i.addEventListener("keydown", (e) => e.stopPropagation()); return i; };
    const name = inp(d.name); name.maxLength = 30; name.placeholder = "Set name"; name.oninput = () => (d.name = name.value); const desc = inp(d.desc); desc.maxLength = 120; desc.placeholder = "Short description"; desc.oninput = () => (d.desc = desc.value);
    const curS = h("select"); [["coins", "🪙 Coins"], ["sol", "◎ SOL"]].forEach(([v, t]) => { const o = h("option", null, t); o.value = v; curS.append(o); }); curS.value = d.currency; curS.onchange = () => { d.currency = curS.value; price.value = d.price = d.currency === "sol" ? 0.5 : 100; };
    const price = inp(d.price, "number"); price.step = "any"; price.oninput = () => (d.price = price.value);
    const bm = h("select"); [["keep", "Keep the buyer's colour"], ["fixed", "Fixed body colour"]].forEach(([v, t]) => { const o = h("option", null, t); o.value = v; bm.append(o); }); bm.value = d.body.mode; const bc = inp(d.body.color, "color"); bc.style.display = d.body.mode === "fixed" ? "" : "none";
    bm.onchange = () => { d.body.mode = bm.value; bc.style.display = bm.value === "fixed" ? "" : "none"; redraw(); }; bc.oninput = () => { d.body.color = bc.value; redraw(); };
    const lab = (t, el) => h("label", "ad-field", h("span", null, t), el); const found = PART_ORDER.some((c) => LOOK_PARTS[c].length);
    const partsBox = h("div", "set-parts");
    PART_ORDER.forEach((c) => { const sel = h("select"), none = h("option", null, "— none —"); none.value = ""; sel.append(none); LOOK_PARTS[c].forEach((n) => { const o = h("option", null, n.startsWith("fix") ? `${n} (own colours)` : n); o.value = n; sel.append(o); });
      const col = inp(d.parts[c]?.c || "#ff5ca8", "color"); sel.value = d.parts[c]?.n || ""; col.style.display = sel.value && !sel.value.startsWith("fix") ? "" : "none";
      const sync = () => { if (!sel.value) { delete d.parts[c]; col.style.display = "none"; } else { d.parts[c] = { n: sel.value, c: sel.value.startsWith("fix") ? null : col.value }; col.style.display = sel.value.startsWith("fix") ? "none" : ""; } redraw(); }; sel.onchange = sync; col.oninput = sync;
      partsBox.append(lab(NAMES[c], h("div", "sx-chips", sel, col))); });
    const err = h("p", "sx-err");
    b.append(h("div", "set-edit", h("div", null, cv), h("div", "set-form", lab("Name", name), lab("Description", desc), lab("Currency buyers pay in", curS), lab("Price", price), lab("Body colour", h("div", "sx-chips", bm, bc)))));
    b.append(found ? partsBox : h("p", "chat-empty", "No parts available yet."), err, h("div", "modal-actions", btn("Send for review", "", () => {
      if (!session.wallet) { err.textContent = "Connect your wallet first."; return; } const r = sets.submitDesign(user(), d); if (!r.ok) { err.textContent = r.err; return; } draft = null; audio.sfx("buy"); say("Design sent! You will get a notification when an admin reviews it. ✏️"); render();
    })));
    redraw(); const mine = sets.designs().filter((x) => x.by === user()).slice(-6).reverse();
    if (mine.length) b.append(h("h3", null, "Your designs"), ...mine.map((x) => h("div", "sx-row static", h("span", "tag" + (x.status === "approved" ? " sale" : ""), x.status.toUpperCase()), h("span", "nm", `${x.name} · ${sets.priceText(x)}${x.note ? " · " + x.note : ""}`))));
  }

  function render() {
    const b = m.body; b.replaceChildren(); const cur = currentLook();
    if (!session.wallet) { b.append(h("p", "chat-empty", "Connect your wallet to see and buy character sets.")); return; }
    if (!getMyHoles()[0] || !cur) { b.append(h("p", "chat-empty", "Buy a hole first – your rabbit lives in it. Then you can dress it up here.")); return; }
    header(b, cur); b.append(tabsBar());
    ({ shop: renderShop, mine: renderMine, market: renderMarket, design: renderDesign })[tab](b, cur);
  }
  net.on((e) => { if (m.isOpen() && (e === "sets" || e === "eco" || e === "sales" || e === "holes") && !m.body.contains(document.activeElement)) render(); });
  return { open() { if (session.wallet) pg.track(user(), "shop_open"); render(); m.open(); } };
}

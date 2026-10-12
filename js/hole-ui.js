/** Owner tools inside a burrow: decorate (move/add/change/remove furniture), burrow themes, parties. */
import { THEMES, DECOR } from "./room.js?v=13";
import * as net from "./social.js?v=13";
import * as eco from "./economy.js?v=13";
import * as audio from "./audio.js?v=13";
import * as fx from "./fx.js?v=13";

const ICON = { bed: "🛏️", table: "🍽️", plant: "🪴", lamp: "💡", barrel: "🛢️", rug: "🟥", mushroom: "🍄", rock: "🪨", chest: "🧰", crystal: "💎", bones: "🦴" };
export const THEME_COST = 50;                                   // coins for a premium theme

export function initHoleUI({ social, session, room, updateHole, share }) {
  const { modal, h, btn, ask, say } = social;
  const themeModal = modal("🎨 Burrow theme"), partyModal = modal("🎉 Party");
  const tools = h("div", "owner-tools"); document.getElementById("room-info").append(tools);
  const bar = h("div", "decor-bar hidden"); document.getElementById("room-screen").append(bar);
  const user = () => session.user, hole = () => room.hole;
  let selBtns = [];

  /* ---------- decorating ---------- */
  function renderBar() {
    bar.replaceChildren();
    const items = h("div", "decor-items");
    DECOR.forEach((t) => { const b = h("button", "decor-it", h("span", null, ICON[t]), h("small", null, t)); b.type = "button"; b.addEventListener("click", () => { if (!room.addProp(t)) say("This floor is full (18 items max)."); }); items.append(b); });
    const mk = (label, fn, cls) => { const b = btn(label, cls || "btn-secondary", fn); return b; };
    const change = mk("↻ Change", () => room.swapSel()), remove = mk("🗑 Remove", () => room.removeSel(), "btn-danger");
    selBtns = [change, remove]; selBtns.forEach((b) => (b.disabled = !room.sel));
    bar.append(h("div", "decor-hint", "Drag items on the floor. Tap one to select it. Tap an item below to add."), items,
      h("div", "decor-actions", change, remove, mk("Reset floor", () => ask({ title: "Reset this floor", label: "Reset", danger: true, text: "Remove your arrangement and go back to the default furniture on this floor?" }, () => room.resetLayout())), mk("✔ Done", () => stopEdit(), "")));
  }
  function startEdit() { room.setEdit(true); if (!room.editOn) return; renderBar(); bar.classList.remove("hidden"); document.body.classList.add("decorating"); audio.sfx("open"); setup(hole(), true); }
  function stopEdit() { room.setEdit(false); bar.classList.add("hidden"); document.body.classList.remove("decorating"); audio.sfx("close"); setup(hole(), true); }
  room.onSelect = (sel) => selBtns.forEach((b) => (b.disabled = !sel));
  room.onLayout = () => { const hl = hole(); if (hl) updateHole(hl.id, { layout: { ...(hl.layout || {}) } }); };

  /* ---------- themes ---------- */
  function openThemes() {
    const hl = hole(), b = themeModal.body; b.replaceChildren();
    const owned = new Set(hl.themesOwned || []), coins = eco.wallet(user()).coins;
    b.append(h("p", "modal-desc", `Recolour every floor of your burrow. Premium themes cost 🪙 ${THEME_COST} (you have 🪙 ${coins}).`));
    const grid = h("div", "theme-grid");
    Object.entries(THEMES).forEach(([key, t]) => {
      const sw = h("span", "swatch"); sw.style.background = t.h === undefined ? "linear-gradient(135deg,#8a5a2b,#4a5568,#7c3aed)" : `linear-gradient(135deg,hsl(${t.h},${t.s}%,${t.l + 12}%),hsl(${t.h},${t.s}%,${t.l - 6}%))`;
      const on = (hl.theme || "natural") === key, locked = t.premium && !owned.has(key);
      const cell = h("button", "theme-it" + (on ? " on" : ""), sw, h("b", null, t.n), h("small", null, on ? "In use" : locked ? `🪙 ${THEME_COST}` : t.premium ? "Owned" : "Free")); cell.type = "button";
      cell.addEventListener("click", () => {
        const apply = () => { updateHole(hl.id, { theme: key === "natural" ? null : key, themesOwned: [...owned] }); room.buildProps(); audio.sfx("buy"); fx.confetti(innerWidth / 2, innerHeight / 2, 50); themeModal.close(); };
        if (!locked) return apply();
        ask({ title: "Unlock theme", label: "Unlock", text: `Unlock “${t.n}” for 🪙 ${THEME_COST}?` }, () => { if (!eco.spendCoins(user(), THEME_COST)) { say("Not enough coins. Sell carrot points at the Carrot Stand."); audio.sfx("error"); return; } owned.add(key); apply(); });
      });
      grid.append(cell);
    });
    b.append(grid); themeModal.open();
  }

  /* ---------- parties ---------- */
  function openParty() {
    const hl = hole(), b = partyModal.body; b.replaceChildren();
    const P = net.PARTY, act = net.partyActive(hl), cd = net.partyCooldownLeft(hl);
    b.append(h("p", "modal-desc", `Open the first floor of your burrow to guests for ${P.duration / 60000} minutes. Up to ${P.max} guests, a ${P.cooldown / 3600e3} hour cooldown, costs 🪙 ${P.cost}. Unlocked at depth ${P.minDepth}.`));
    if (act) {
      b.append(h("div", "sx-stats", h("div", "sx-stat", h("small", null, "Time left"), h("b", null, `${Math.max(0, Math.round((act.until - Date.now()) / 60000))} min`)), h("div", "sx-stat", h("small", null, "Guests"), h("b", null, `${net.partyGuestCount(hl)} / ${P.max}`))),
        h("div", "modal-actions", btn("End party", "btn-danger", () => ask({ title: "End the party", label: "End party", danger: true, text: "Send everyone home and close the party?" }, () => { net.endParty(hl); room.syncParty(); social.refreshAll(); partyModal.close(); }))));
    } else if (hl.depth < P.minDepth) b.append(h("p", "chat-empty", `Dig to depth ${P.minDepth} to host parties (now ${hl.depth}).`));
    else b.append(cd > 0 ? h("p", "chat-empty", `You can host again in ${Math.ceil(cd / 60000)} min.`) : null, h("div", "modal-actions", btn(`Start party (🪙 ${P.cost})`, "", () => {
      if (cd > 0) return;
      ask({ title: "Start a party", label: "Start", text: `Open your burrow for ${P.duration / 60000} minutes for 🪙 ${P.cost}?` }, () => {
        if (eco.wallet(user()).coins < P.cost) { say("Not enough coins. Sell carrot points at the Carrot Stand."); audio.sfx("error"); return; }
        const r = net.startParty(hl); if (!r.ok) { say(r.err); return; }
        eco.spendCoins(user(), P.cost); room.syncParty(); social.refreshAll(); audio.sfx("party"); fx.confetti(); fx.banner("🎉 Party time!"); partyModal.close();
      });
    })));
    partyModal.open();
  }

  /* ---------- buttons in the room header ---------- */
  function setup(hl, isOwner) {
    tools.replaceChildren();
    if (!hl) return;
    if (isOwner) {
      tools.append(btn(room.editOn ? "✔ Done decorating" : "🛋 Decorate", room.editOn ? "" : "btn-secondary", () => (room.editOn ? stopEdit() : startEdit())));
      if (!room.editOn) {
        tools.append(btn("🎨 Theme", "btn-secondary", openThemes));
        const act = net.partyActive(hl);
        tools.append(btn(act ? "🎉 Party live" : "🎉 Party", act ? "" : "btn-secondary", openParty));
      }
    }
    tools.append(btn("🔗 Share", "btn-secondary", () => share.openShare(hl)));
  }
  net.on((e) => { if ((e === "party" || e === "change") && hole() && !room.editOn) setup(hole(), room.isOwner); });   // button reads "Party live" while a party runs
  function hide() { if (room.editOn) room.setEdit(false); bar.classList.add("hidden"); document.body.classList.remove("decorating"); }
  return { setup, hide };
}

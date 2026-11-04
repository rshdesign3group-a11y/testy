/** Extra admin tabs: analytics dashboard, timed events, progress & rewards, design reviews and the shop (themes & props). */
import * as pg from "./progress.js?v=14";
import * as sets from "./sets.js?v=14";
import * as shop from "./shop.js?v=14";
import { cfg, setCfg, DEFAULT_CFG, notify, nameOf } from "./prog-core.js?v=14";
import { drawPreviewSoon } from "./sets-ui.js?v=14";

const pad = (n) => String(n).padStart(2, "0");
const toLocalInput = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let hh = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60; }
  return { h: Math.round(hh), s: Math.round(s * 100), l: Math.round(l * 100) };
}
function hslToHex(h, s, l) { s /= 100; l /= 100; const a = s * Math.min(l, 1 - l), f = (n) => { const k = (n + h / 30) % 12, c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, "0"); }; return `#${f(0)}${f(8)}${f(4)}`; }

export function extraViews(u) {
  const { h, btn, inp, field, confirmBtn, locked, can, changed, short, ago, getHoles, goToHole } = u;
  const opt = (v, t) => { const o = h("option", null, t); o.value = v; return o; };
  const sel = (pairs, val) => { const s = h("select"); pairs.forEach(([v, t]) => s.append(opt(v, t))); s.value = val; return s; };
  let evDraft = null, shopDraft = null;

  return {
    /* ================= analytics dashboard ================= */
    dashboard(b) {
      if (!can("dashboard")) return locked(b, "dashboard");
      const a = pg.analytics(), max = Math.max(1, ...a.dau), pct = (x) => (x ? `${x.pct}% (of ${x.of})` : "not enough data yet");
      b.append(h("div", "sx-stats", ...[["Active today", a.dau[a.dau.length - 1]], ["Active 7 days", a.wau], ["Active 30 days", a.mau], ["Known players", a.total]].map(([l, v]) => h("div", "sx-stat", h("small", null, l), h("b", null, v)))),
        h("div", "sx-stats", ...[["Back next day (D1)", pct(a.d1)], ["Back after 7 days (D7)", pct(a.d7)], ["Gone for 3+ days", a.inactive]].map(([l, v]) => h("div", "sx-stat", h("small", null, l), h("b", null, v))))); 
      const bars = (arr) => { const m = Math.max(1, ...arr), wrap = h("div", "dash-bars"); arr.forEach((v) => { const d = h("div", null, h("b", null, v || "")); d.style.height = Math.max(2, (v / m) * 100) + "%"; wrap.append(d); }); return wrap; };
      const lbl = h("div", "dash-lbl", ...a.days.map((d) => h("span", null, d.slice(8))));
      b.append(h("h3", null, "Active players per day (last 14 days)"), bars(a.dau), lbl, h("h3", null, "New players per day"), bars(a.newPer), h("div", "dash-lbl", ...a.days.map((d) => h("span", null, d.slice(8)))));
      b.append(h("h3", null, "Starter path – where players get stuck"), h("small", "modal-desc", "How many players finished each step, and where inactive players (gone 3+ days) stopped."));
      const top = Math.max(1, a.total); a.stepUsers.forEach((s, i) => { const prev = i ? a.stepUsers[i - 1].n : a.total; b.append(h("div", "sx-row static", h("span", "nm", `${i + 1}. ${s.text}`), h("span", "acts", `${s.n} players (${Math.round((s.n / top) * 100)}%)${i && prev > s.n ? ` · −${prev - s.n} lost` : ""}`))); });
      b.append(h("h3", null, "Where inactive players stopped"));
      const drops = Object.entries(a.dropAt).sort((x, y) => y[1] - x[1]); if (!drops.length) b.append(h("p", "chat-empty", "No inactive players yet.")); drops.forEach(([k, v]) => b.append(h("div", "sx-row static", h("span", "nm", k), h("span", "acts", `${v} players`))));
      b.append(h("h3", null, "Which parts of the game are used (players who ever used them)"));
      const NAMES = { visit: "Visit burrows", room_enter: "Own burrow", cafe_enter: "Café", arcade_play: "Arcade", shop_open: "Character shop", set_buy: "Bought a set", deepen: "Dug deeper", buy_hole: "Bought a hole", daily_claim: "Daily reward", guest_post: "Guestbook", gift_send: "Gifts", collect_idle: "Idle carrots", treasure_found: "Treasure hunt", tour: "Tour", item_found: "Rare items", walk: "Walked in a burrow", stairs: "Used stairs" };
      a.feats.filter((f) => NAMES[f.evt]).forEach((f) => b.append(h("div", "sx-row static", h("span", "nm", NAMES[f.evt]), h("span", "acts", `${f.users} players (${Math.round((f.users / Math.max(1, a.total)) * 100)}%)`))));
      const unused = Object.keys(NAMES).filter((k) => !a.feats.some((f) => f.evt === k)); if (unused.length) b.append(h("p", "modal-desc", "Nobody has used yet: " + unused.map((k) => NAMES[k]).join(", ")));
      b.append(h("h3", null, "Today's actions"), h("div", "sx-chips", ...Object.entries(a.todayE).sort((x, y) => y[1] - x[1]).slice(0, 14).map(([k, v]) => h("span", "tag", `${NAMES[k] || k}: ${v}`))));
    },

    /* ================= timed events ================= */
    events(b) {
      if (!can("events")) return locked(b, "events");
      const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const d = (evDraft ||= { id: null, name: "", mult: 2, scope: "all", repeat: "", dow: 5, hour: 21, minute: 0, hours: 2, start: toLocalInput(Date.now() + 3600e3), end: toLocalInput(Date.now() + 3 * 3600e3), desc: "", on: true });
      b.append(h("p", "modal-desc", "Create events like “Friday party: ×2 carrots”. While an event is on, everyone sees a banner and carrot rewards are multiplied."));
      const name = inp(d.name, "text", "Event name, e.g. Friday party"); name.addEventListener("input", () => (d.name = name.value));
      const mult = inp(d.mult, "number"); mult.min = 1; mult.max = 10; mult.step = "0.5"; mult.addEventListener("input", () => (d.mult = mult.value));
      const scope = sel([["all", "Everywhere (all carrots)"], ["arcade", "Only arcade winnings"], ["cafe", "Only while in the café"]], d.scope); scope.addEventListener("change", () => (d.scope = scope.value));
      const rep = sel([["", "One time"], ["weekly", "Every week"]], d.repeat); rep.addEventListener("change", () => { d.repeat = rep.value; changedForm(); });
      const box = h("div");
      const dow = sel(DAYS.map((x, i) => [i, x]), d.dow), hr = inp(d.hour, "number"), mi = inp(d.minute, "number"), du = inp(d.hours, "number"); hr.min = 0; hr.max = 23; mi.min = 0; mi.max = 59; du.min = 0.25; du.max = 48; du.step = "0.25";
      dow.addEventListener("change", () => (d.dow = +dow.value)); hr.addEventListener("input", () => (d.hour = hr.value)); mi.addEventListener("input", () => (d.minute = mi.value)); du.addEventListener("input", () => (d.hours = du.value));
      const st = inp(d.start, "datetime-local"), en = inp(d.end, "datetime-local"); st.addEventListener("input", () => (d.start = st.value)); en.addEventListener("input", () => (d.end = en.value));
      const desc = inp(d.desc, "text", "Short description (optional)"); desc.addEventListener("input", () => (d.desc = desc.value));
      function changedForm() { box.replaceChildren(...(d.repeat ? [field("Day of the week (your time zone)", dow), field("Start hour (0–23)", hr), field("Start minute", mi), field("Length in hours", du)] : [field("Starts", st), field("Ends", en)])); }
      changedForm(); const err = h("p", "sx-err");
      b.append(h("div", "ad-card", h("div", "ad-head", h("b", null, d.id ? "Edit event" : "New event")), field("Name", name), field("Carrot multiplier (×)", mult), field("Where it counts", scope), field("Repeat", rep), box, field("Description", desc), err,
        h("div", "ad-actions", btn(d.id ? "Save event" : "Create event", "", () => {
          const r = pg.saveEvent({ ...d, id: d.id, start: Date.parse(d.start), end: Date.parse(d.end), tz: new Date().getTimezoneOffset() * -1 }); if (!r.ok) { err.textContent = r.err; return; } evDraft = null; changed();
        }), d.id ? btn("Cancel", "btn-secondary", () => { evDraft = null; changed(); }) : null)));
      b.append(h("h3", null, "Events")); const list = pg.events(); if (!list.length) b.append(h("p", "chat-empty", "No events yet."));
      list.forEach((e) => { const on = pg.activeEvents().some((x) => x.id === e.id);
        b.append(h("div", "sx-row static", h("span", "tag" + (on ? " sale" : ""), on ? "LIVE" : e.on === false ? "OFF" : "PLANNED"), h("span", "nm", `${e.name} · ×${e.mult} · ${e.scope} · ${e.repeat === "weekly" ? `every ${DAYS[e.dow]} ${pad(e.hour)}:${pad(e.minute || 0)} for ${e.hours}h` : `${new Date(e.start).toLocaleString()} → ${new Date(e.end).toLocaleString()}`}`),
          h("span", "acts", btn("Edit", "btn-secondary", () => { evDraft = { ...e, start: toLocalInput(e.start || Date.now()), end: toLocalInput(e.end || Date.now() + 3600e3) }; changed(); }),
            btn(e.on === false ? "Turn on" : "Turn off", "btn-secondary", () => { e.on = e.on === false; changed(); }), confirmBtn("Delete", "btn-danger", () => { pg.removeEvent(e.id); changed(); })))); });
    },

    /* ================= progress & rewards ================= */
    progress(b) {
      if (!can("progress")) return locked(b, "progress");
      const c = cfg(), F = {}, NUM = [["xpMult", "XP multiplier (1 = normal)"], ["missionMult", "Mission reward multiplier"], ["missionBonus", "Bonus 🥕 for finishing all 3 daily missions"], ["questMult", "Starter path reward multiplier"],
        ["idleBase", "Idle carrots per hour: base per burrow"], ["idlePerDepth", "…plus per depth level"], ["idlePerDecor", "…plus per decoration"], ["idleCapHours", "Max hours a burrow stores carrots"], ["treasureCp", "Daily treasure reward (🥕)"],
        ["giftMin", "Gift: minimum 🥕"], ["giftMax", "Gift: maximum 🥕 per gift"], ["giftDaily", "Gift: max 🥕 a player can gift per day"], ["marketFee", "Resale market fee (%)"], ["designerFee", "Player-designed sets: game's share (%)"], ["guestRate", "Guestbook: seconds between posts"], ["inviteeBonus", "Invite link: bonus 🥕 for the invited friend"]];
      b.append(h("p", "modal-desc", "Tune the whole reward system. Changes apply immediately."));
      NUM.forEach(([k, l]) => { F[k] = inp(c[k], "number"); F[k].step = "any"; F[k].min = 0; b.append(field(l, F[k])); });
      const tr = inp(c.treasureOn, "number"); tr.min = 0; tr.max = 1; b.append(field("Daily treasure hunt on (1) / off (0)", tr));
      b.append(h("h3", null, "Daily missions in the pool"), h("small", "modal-desc", "Players get 3 random missions a day from the enabled ones."));
      const off = { ...c.missionsOff }, chk = {}; const mrow = h("div", "perm-grid"); pg.MISSIONS.forEach((m) => { const x = inp("", "checkbox"); x.checked = !off[m.id]; chk[m.id] = x; mrow.append(h("label", "perm", x, h("span", null, h("b", null, m.text), h("small", null, ` +${m.cp} 🥕`)))); }); b.append(mrow);
      b.append(h("div", "ad-actions", btn("Save all", "", () => { const p = {}; for (const k in F) p[k] = F[k].value; p.treasureOn = tr.value; const o = {}; pg.MISSIONS.forEach((m) => { if (!chk[m.id].checked) o[m.id] = 1; }); p.missionsOff = o; setCfg(p); changed(); })));
      b.append(h("h3", null, "Weekly tournament prizes"), h("small", "modal-desc", `This week: ${pg.weekKey()}. The top 3 of each game get these when the week ends (best level counts). Prize sets are given free; a title shows above the winner's head.`));
      const all = sets.all(); ["dash", "run"].forEach((g) => { const pz = pg.prizes(g), rows = [];
        b.append(h("h4", null, g === "dash" ? "🥕 Carrot Dash" : "🐰 Carrot Run"));
        pz.forEach((p, i) => { const cp = inp(p.cp, "number"), set = sel([["", "— no set —"], ...all.map((s) => [s.id, s.name])], p.setId), ti = inp(p.title, "text", "Title (optional)"); ti.maxLength = 28; rows.push({ cp, set, ti }); b.append(h("div", "ad-card", h("b", null, `#${i + 1}`), field("🥕 carrots", cp), field("Prize set", set), field("Title", ti))); });
        b.append(h("div", "ad-actions", btn("Save " + (g === "dash" ? "Dash" : "Run") + " prizes", "", () => { pg.setPrizes(g, rows.map((r) => ({ cp: r.cp.value, setId: r.set.value, title: r.ti.value }))); changed(); })));
        const t = pg.top(g, undefined, 3); if (t.length) b.append(h("small", "modal-desc", "Leading now: " + t.map((r) => `#${r.rank} ${nameOf(r.user)} (${r.score})`).join(" · "))); });
    },

    /* ================= player design reviews ================= */
    designs(b) {
      if (!can("designs")) return locked(b, "designs");
      b.append(h("p", "modal-desc", "Players can design sets. Approved designs go on sale with the designer's name; the designer earns the rest after the game's share."));
      const pend = sets.designs().filter((x) => x.status === "pending"), done = sets.designs().filter((x) => x.status !== "pending").slice(-8).reverse();
      if (!pend.length) b.append(h("p", "chat-empty", "No designs waiting."));
      pend.forEach((d) => { const cv = h("canvas", "set-cv"); cv.width = 150; cv.height = 170; drawPreviewSoon(cv, { color: d.body.mode === "fixed" ? d.body.color : "#e8e0ff", earColor: "#cbbdf5", acc: 0, parts: d.parts });
        const lim = inp(0, "number"), fee = inp(cfg().designerFee, "number"), note = inp("", "text", "Reason if you reject"); lim.min = 0; fee.min = 0; fee.max = 90; const err = h("p", "sx-err");
        b.append(h("div", "ad-card", h("div", "set-edit", h("div", null, cv), h("div", "set-form", h("b", null, `${d.name} · by ${d.byName || short(d.by)}`), h("small", null, `${sets.priceText(d)} · ${Object.keys(d.parts).length} parts · ${d.desc || "no description"}`),
          field("Limited edition (0 = unlimited)", lim), field("Game's share %", fee), note, err, h("div", "ad-actions", btn("Approve & put on sale", "", () => { const r = sets.approveDesign(d.id, { limit: +lim.value || 0, fee: +fee.value }); if (!r.ok) { err.textContent = r.err; return; } changed(); }), btn("Reject", "btn-secondary", () => { sets.rejectDesign(d.id, note.value); changed(); })))))); });
      if (done.length) b.append(h("h3", null, "Recently reviewed"), ...done.map((d) => h("div", "sx-row static", h("span", "tag" + (d.status === "approved" ? " sale" : ""), d.status.toUpperCase()), h("span", "nm", `${d.name} · ${d.byName}${d.note ? " · " + d.note : ""}`))));
      b.append(h("h3", null, "Resale market"), h("small", "modal-desc", `Listings: ${sets.listings().length} · fee ${cfg().marketFee}% (change it in Progress)`));
      sets.listings().slice(0, 20).forEach((l) => b.append(h("div", "sx-row static", h("span", "nm", `${sets.get(l.setId)?.name || "?"} #${l.entry.no || "?"} · ${sets.priceText({ currency: sets.get(l.setId)?.currency, price: l.price })} · seller ${nameOf(l.seller)}`), h("span", "acts", confirmBtn("Remove", "btn-danger", () => { sets.cancelListing(l.seller, l.id); changed(); })))));
    },

    /* ================= shop: themes and props ================= */
    shop(b) {
      if (!can("shop")) return locked(b, "shop");
      const d = (shopDraft ||= { id: null, kind: "theme", name: "", currency: "coins", price: 80, limit: 0, onSale: true, color: "#7c3aed", png: null, icon: "🧩" });
      b.append(h("p", "modal-desc", "Sell new burrow themes and decoration props. Only buyers can use them when decorating; everyone can see them in a burrow that uses them."));
      const kind = sel([["theme", "🎨 Burrow theme (colour)"], ["prop", "🪑 Decoration prop (PNG, max 256×256)"]], d.kind), name = inp(d.name, "text", "Item name"), cur = sel([["coins", "🪙 Coins only"], ["sol", "◎ SOL only"]], d.currency), price = inp(d.price, "number"), lim = inp(d.limit, "number");
      price.step = "any"; price.min = 0; lim.min = 0; const sale = inp("", "checkbox"); sale.checked = d.onSale; const col = inp(d.color, "color"), file = inp("", "file"), icon = inp(d.icon, "text", "Emoji for the toolbar"); file.accept = "image/png"; icon.maxLength = 2;
      const err = h("p", "sx-err"), prev = h("div", "swatch"); prev.style.cssText = "width:100%;height:46px;border-radius:10px;border:1px solid rgba(255,255,255,.2)";
      const showP = () => { if (d.kind === "theme") { const c = hexToHsl(d.color); prev.style.background = `linear-gradient(135deg,hsl(${c.h},${c.s}%,${c.l + 12}%),hsl(${c.h},${c.s}%,${Math.max(8, c.l - 6)}%))`; prev.textContent = ""; } else { prev.style.background = "rgba(255,255,255,.08)"; prev.textContent = d.png ? "" : "Pick a PNG"; if (d.png) { prev.style.background = `center/contain no-repeat url(${d.png})`; } } };
      const themeBox = field("Wall & floor colour", col), propBox = h("div", null, field("Picture (PNG)", file), field("Toolbar emoji", icon));
      const vis = () => { themeBox.style.display = d.kind === "theme" ? "" : "none"; propBox.style.display = d.kind === "prop" ? "" : "none"; showP(); };
      kind.addEventListener("change", () => { d.kind = kind.value; vis(); }); name.addEventListener("input", () => (d.name = name.value)); cur.addEventListener("change", () => (d.currency = cur.value)); price.addEventListener("input", () => (d.price = price.value)); lim.addEventListener("input", () => (d.limit = lim.value)); sale.addEventListener("change", () => (d.onSale = sale.checked)); col.addEventListener("input", () => { d.color = col.value; showP(); }); icon.addEventListener("input", () => (d.icon = icon.value));
      file.addEventListener("change", async () => { const r = await shop.read(file.files[0]); if (!r.ok) { err.textContent = r.err; file.value = ""; return; } err.textContent = ""; d.png = r.png; showP(); });
      vis();
      b.append(h("div", "ad-card", h("div", "ad-head", h("b", null, d.id ? "Edit item" : "New item")), field("Type", kind), field("Name", name), themeBox, propBox, prev, field("Currency", cur), field("Price", price), field("Limited edition (0 = unlimited)", lim), h("label", "perm", sale, h("span", null, h("b", null, "On sale"))), err,
        h("div", "ad-actions", btn(d.id ? "Save item" : "Create item", "", () => { const c = hexToHsl(d.color); const r = shop.save({ ...d, h: c.h, s: c.s, l: c.l }); if (!r.ok) { err.textContent = r.err; return; } shopDraft = null; changed(); }), d.id ? btn("Cancel", "btn-secondary", () => { shopDraft = null; changed(); }) : null)));
      b.append(h("h3", null, "Items")); if (!shop.items().length) b.append(h("p", "chat-empty", "Nothing in the shop yet."));
      shop.items().forEach((x) => b.append(h("div", "sx-row static", h("span", "tag" + (x.onSale ? " sale" : ""), x.kind === "theme" ? "THEME" : "PROP"), h("span", "nm", `${x.name} · ${shop.priceText(x)} · sold ${x.sold || 0}${x.limit ? "/" + x.limit : ""}`),
        h("span", "acts", btn("Edit", "btn-secondary", () => { shopDraft = { id: x.id, kind: x.kind, name: x.name, currency: x.currency, price: x.price, limit: x.limit, onSale: x.onSale, color: x.kind === "theme" ? hslToHex(x.h, x.s, x.l) : "#7c3aed", png: null, icon: x.icon || "🧩" }; changed(); }),
          btn(x.onSale ? "Hide" : "Show", "btn-secondary", () => { x.onSale = !x.onSale; changed(); }), confirmBtn("Delete", "btn-danger", () => { shop.remove(x.id); changed(); })))));
    }
  };
}

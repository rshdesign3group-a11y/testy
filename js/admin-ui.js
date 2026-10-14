/**
 * Admin panel. The owner (ADMIN_WALLET) can do everything and can appoint staff with limited permissions.
 * NOTE: this is client-side. With the local driver every change only affects this browser.
 * When you move to a real backend, enforce roles on the SERVER (verify a signed message from the wallet).
 */
import { HOLE_STYLES, MAX_DEPTH, groupEnd, gapLayout } from "./world.js?v=14";
import { fmtSol } from "./pricing.js?v=14";
import * as eco from "./economy.js?v=14";
import * as sets from "./sets.js?v=14";
import * as chars from "./chars.js?v=14";
import * as arcade from "./arcade.js?v=14";
import { floorCount } from "./data.js?v=14";
import { LOOK_PARTS, PART_ORDER } from "./world.js?v=14";
import { drawPreviewSoon } from "./sets-ui.js?v=14";

export const PERMS = [
  ["chat", "Moderate chat", "Delete messages, clear chat"], ["reports", "Handle reports", "Review reported messages"], ["ban", "Ban / unban", "Mute people by banning them"],
  ["users", "Users", "Delete users, edit balances"], ["holes", "Holes", "Edit or delete holes, remove listings"], ["ads", "Billboards & stalls", "Edit sponsor boards"],
  ["notice", "Announcements", "Publish the site-wide notice"], ["economy", "Economy", "Rates and tweet claims"],
  ["sets", "Character sets", "Create / edit sets, prices and currency"], ["chars", "Unique characters", "Upload special characters and give them to wallets"],
  ["arcade", "Arcade", "Choose the café game and put machines in burrows"]
];
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function initAdmin(c) {
  const { net, h, btn, modal, getHoles, session, people, nameOf, isOnline, applyOverride, goToHole, openDM, can, isOwner, changed } = c;
  const m = modal("🛡 Admin panel", true);
  let tab = "overview", focusN = null, setDraft = null, charDraft = null, arcDraft = { q: "", hole: null, floor: 0, game: "dash" };
  const short = (a) => (a && a.length > 12 ? a.slice(0, 4) + "…" + a.slice(-4) : a);
  const ago = (t) => { const x = Math.round((Date.now() - t) / 60000); return x < 1 ? "now" : x < 60 ? x + "m" : x < 1440 ? Math.round(x / 60) + "h" : Math.round(x / 1440) + "d"; };

  const confirmBtn = (label, cls, fn) => {            // two clicks needed for destructive actions
    const b = btn(label, cls, () => { if (b.dataset.arm) { fn(); return; } b.dataset.arm = "1"; b.textContent = "Click again to confirm"; setTimeout(() => { delete b.dataset.arm; b.textContent = label; }, 3000); });
    return b;
  };
  const inp = (value, type = "text", ph = "") => { const i = h("input"); i.type = type; i.value = value ?? ""; i.placeholder = ph; i.addEventListener("keydown", (e) => e.stopPropagation()); return i; };
  const field = (label, el) => h("label", "ad-field", h("span", null, label), el);
  const editHole = (id, patch) => { net.setOverride(id, patch); applyOverride(id, patch); changed(); };
  const removeHoleFor = (x) => { if (!x.special) editHole(x.id, { deleted: true }); };
  const locked = (b, perm) => b.append(h("p", "chat-empty", `You do not have the “${perm}” permission.`));
  const who = () => session.wallet || session.user;

  const views = {
    overview(b) {
      const st = net.stats(), tt = net.totals(), holes = getHoles(), open = net.reports().filter((r) => r.status === "open").length;
      b.append(h("div", "sx-stats",
        ...[["Holes", holes.length], ["Players", people().filter((p) => p.holes.length).length], ["Online", net.online().length], ["Messages", net.messages().length], ["Open reports", open],
          ["Banned", net.bannedIds().length], ["Staff", Object.keys(net.staff()).length], ["Sales volume", fmtSol(st.total)], ["Likes", tt.likes], ["Tips", fmtSol(tt.tips)]]
          .map(([k, v]) => h("div", "sx-stat", h("small", null, k), h("b", null, String(v))))));
      if (can("notice")) {
        const notice = inp(net.notice(), "text", "Announcement shown to everyone…"); notice.maxLength = 200;
        b.append(h("h3", null, "Announcement"), h("div", "sx-chips", notice, btn("Publish", "", () => { net.setNotice(notice.value); changed(); }), btn("Clear", "btn-secondary", () => { net.setNotice(""); changed(); })));
      }
      const mt = [];
      if (can("chat")) mt.push(confirmBtn("Clear all chat", "btn-danger", () => { net.clearChat(); changed(); }));
      if (can("holes")) mt.push(confirmBtn("Remove all listings", "btn-danger", () => { net.clearListings(); changed(); }));
      if (mt.length) b.append(h("h3", null, "Maintenance"), h("div", "sx-chips", ...mt));
    },

    chat(b) {
      if (!can("chat")) return locked(b, "chat");
      const msgs = [...net.messages()].reverse().slice(0, 150);
      if (!msgs.length) b.append(h("p", "chat-empty", "No messages."));
      msgs.forEach((x) => b.append(h("div", "sx-row static", h("span", "tag", x.to ? `DM → ${nameOf(x.to)}` : "Global"), h("span", "nm", `${x.name || short(x.from)}: ${x.text}`),
        btn("Delete", "btn-danger", () => { net.deleteMessage(x.id); changed(); }),
        can("ban") ? confirmBtn("Ban sender", "btn-danger", () => { net.ban(x.from, true); changed(); }) : null)));
    },

    reports(b) {
      if (!can("reports")) return locked(b, "reports");
      const list = [...net.reports()].sort((a, z) => (a.status === "open" ? 0 : 1) - (z.status === "open" ? 0 : 1) || z.ts - a.ts).slice(0, 120);
      if (!list.length) b.append(h("p", "chat-empty", "No reports. 🎉"));
      list.forEach((r) => {
        const open = r.status === "open", acts = h("div", "ad-actions");
        if (open) {
          acts.append(btn("Delete message", "btn-danger", () => { net.deleteMessage(r.msgId); net.resolveReport(r.id, "resolved", who()); changed(); }));
          if (can("ban")) acts.append(confirmBtn("Ban sender", "btn-danger", () => { net.ban(r.from, true); net.resolveReport(r.id, "resolved", who()); changed(); }));
          acts.append(btn("Dismiss", "btn-secondary", () => { net.resolveReport(r.id, "dismissed", who()); changed(); }), btn("Mark resolved", "btn-secondary", () => { net.resolveReport(r.id, "resolved", who()); changed(); }));
        }
        b.append(h("div", "ad-card" + (open ? " flash" : ""),
          h("div", "ad-head", h("span", "tag" + (open ? " sale" : ""), open ? "OPEN" : r.status.toUpperCase()), h("b", null, r.reason), h("span", null, `${r.scope} · ${ago(r.ts)} ago`)),
          h("p", "report-quote", r.text), h("p", "modal-desc", `From ${r.fromName || short(r.from)} · reported by ${r.reporterName || short(r.reporter)}${r.note ? " · “" + r.note + "”" : ""}`), acts));
      });
    },

    users(b) {
      if (!can("users") && !can("ban")) return locked(b, "users / ban");
      const list = people(), known = new Set(list.map((u) => u.id));
      net.bannedIds().filter((id) => !known.has(id)).forEach((id) => list.push({ id, name: nameOf(id), holes: [], online: false }));
      list.forEach((u) => {
        const isBan = net.isBanned(u.id), bal = inp(net.balance(u.id).toFixed(3), "number"); bal.step = "0.001"; bal.className = "ad-small";
        const staffTag = net.staffOf(u.id) ? h("span", "tag", "staff") : null;
        b.append(h("div", "sx-row static",
          h("span", null, u.online ? "🟢" : "⚪"), h("span", "nm", `${u.name || short(u.id)} · ${short(u.id)}`), h("span", null, `${u.holes.length} holes`), staffTag, isBan ? h("span", "tag sale", "banned") : null,
          can("users") ? bal : null, can("users") ? btn("Set ◎", "btn-secondary", () => { net.setBalance(u.id, bal.value); changed(); }) : null,
          btn("💬", "btn-secondary", () => { m.close(); openDM(u.id); }),
          can("ban") ? btn(isBan ? "Unban" : "Ban", isBan ? "" : "btn-danger", () => { net.ban(u.id, !isBan); changed(); }) : null,
          can("users") ? confirmBtn("Delete user", "btn-danger", () => { u.holes.forEach(removeHoleFor); net.purgeUser(u.id); net.ban(u.id, true); changed(); }) : null));
      });
    },

    holes(b) {
      if (!can("holes")) return locked(b, "holes");
      getHoles().forEach((x) => {
        const un = inp(x.username), ds = inp(x.description), dp = inp(x.depth, "number"), ow = inp(x.owner), st = h("select");
        dp.min = 1; dp.max = MAX_DEPTH; dp.className = "ad-small"; ow.disabled = !!x.special;
        HOLE_STYLES.forEach((n, i) => { const o = h("option", null, n); o.value = i; st.append(o); }); st.value = x.style || 0;
        const l = net.activeListing(x);
        b.append(h("div", "ad-card",
          h("div", "ad-head", h("b", null, `#${x.id}${x.special ? " ★" : ""}`), h("span", null, `slot ${x.x + 1}`), l ? h("span", "tag sale", "for sale") : null),
          field("Username", un), field("Description", ds), field("Depth (1-" + MAX_DEPTH + ")", dp), field("Style", st), field("Owner id", ow),
          h("div", "ad-actions",
            btn("Save", "", () => editHole(x.id, { username: un.value.trim() || x.username, description: ds.value, depth: Math.max(1, Math.min(MAX_DEPTH, Math.floor(+dp.value) || x.depth)), style: +st.value, ...(x.special || !ow.value.trim() ? {} : { owner: ow.value.trim() }) })),
            btn("Go", "btn-secondary", () => { m.close(); goToHole(x); }),
            l ? btn("Unlist", "btn-secondary", () => { net.unlist(x); changed(); }) : null,
            x.special ? null : confirmBtn("Delete hole", "btn-danger", () => removeHoleFor(x)))));
      });
    },

    ads(b) {
      if (!can("ads")) return locked(b, "ads");
      const maxX = getHoles().reduce((mx, x) => Math.max(mx, x.x), 0);
      b.append(h("p", "modal-desc", "A billboard follows every 8-14 holes. Every 3rd gap also has a stall with a café below it. Changes show on the map immediately."));
      const card = (key, title, sub, shopDefault) => {
        const ad = net.getAd(key) || {};
        const t = inp(ad.title, "text", shopDefault || "YOUR AD HERE"), tx = inp(ad.text), img = inp(ad.image, "text", "https://… picture"), link = inp(ad.link, "text", "https://… link when clicked"), color = inp(ad.color || "#1e293b", "color");
        const on = inp("", "checkbox"); on.checked = ad.on !== false;
        const el = h("div", "ad-card" + (focusN === key ? " flash" : ""), h("div", "ad-head", h("b", null, title), h("span", null, sub)),
          field("Title", t), field("Text", tx), field("Image URL", img), field("Link", link), field("Color", color), field("Active", on),
          h("div", "ad-actions", btn("Save", "", () => { net.setAd(key, { title: t.value.trim(), text: tx.value.trim(), image: img.value.trim(), link: link.value.trim(), color: color.value, on: on.checked }); changed(); })));
        b.append(el);
        if (focusN === key) requestAnimationFrame(() => el.scrollIntoView({ block: "center" }));
      };
      for (let n = 0; groupEnd(n - 1) <= maxX + 14 && n < 12; n++) {
        const g = gapLayout(n), after = groupEnd(n) + 1;
        card(n, "📢 Billboard", `gap ${n + 1} · after hole ${after}`);
        if (g.shop) card("s" + n, `${g.shop.e} ${g.shop.n}`, `stall in gap ${n + 1} · café below at depth 20`, g.shop.n);
      }
    },

    economy(b) {
      if (!can("economy")) return locked(b, "economy");
      const r = eco.rates(), F = {};
      [["cpPerCoin", "🥕 per 🪙 (exchange rate)"], ["convCap", "Max 🥕 sold per player per day"], ["dailyCpCap", "Max 🥕 earned per player per day (activities)"], ["itemsPerDay", "Max rare items per player per day"]]
        .forEach(([k, label]) => { F[k] = inp(r[k], "number"); F[k].min = 1; b.append(field(label, F[k])); });
      b.append(h("div", "ad-actions", btn("Save rates", "", () => { const p = {}; for (const k in F) p[k] = Math.max(1, Math.floor(+F[k].value) || r[k]); eco.setRates(p); changed(); })));
      /* ---- money control: starting amounts + give / take / set for everyone or one wallet ---- */
      b.append(h("h3", null, "Money control"));
      const c0 = net.cfg(), CF = {};
      b.append(h("p", "modal-desc", "Starting amounts for NEW players. Players who already have an account keep what they have (use the form below to change them)."));
      [["startSol", "◎ SOL a new player starts with"], ["startCp", "🥕 carrot points a new player starts with"], ["startCoins", "🪙 coins a new player starts with"]]
        .forEach(([k, label]) => { CF[k] = inp(c0[k], "number"); CF[k].min = 0; CF[k].step = "any"; b.append(field(label, CF[k])); });
      b.append(h("div", "ad-actions", btn("Save starting amounts", "", () => { const p = {}; for (const k in CF) p[k] = CF[k].value; net.setCfg(p); changed(); })));
      const cur = h("select"), mode = h("select"), who2 = h("select"); const amt = inp("", "number", "Amount"); amt.min = 0; amt.step = "any";
      Object.entries(eco.CURRENCIES).forEach(([k, v]) => { const o = h("option", null, `${v.icon} ${v.name}`); o.value = k; cur.append(o); });
      [["give", "Give (add)"], ["take", "Take away (subtract)"], ["set", "Set to exactly"]].forEach(([k, t]) => { const o = h("option", null, t); o.value = k; mode.append(o); });
      [["all", "Everyone"], ["one", "One wallet"]].forEach(([k, t]) => { const o = h("option", null, t); o.value = k; who2.append(o); });
      const addr = inp("", "text", "Wallet address"); addr.style.display = "none"; who2.addEventListener("change", () => { addr.style.display = who2.value === "one" ? "" : "none"; });
      const msg = h("p", "sx-err");
      b.append(h("div", "ad-card", h("div", "ad-head", h("b", null, "Change balances")),
        field("Currency", cur), field("Action", mode), field("Amount", amt), field("Who", who2), addr, msg,
        h("div", "ad-actions", confirmBtn("Apply", "", () => {
          const everyone = [...new Set([...people().map((u) => u.id).filter((id) => id && !id.startsWith("demo") && !id.startsWith("guest-")), ...net.knownUsers()])];
          const users = who2.value === "one" ? [addr.value.trim()] : everyone;
          if (who2.value === "one" && !BASE58.test(users[0])) { msg.textContent = "Enter a valid wallet address."; msg.style.color = ""; return; }
          const r = eco.adminAdjust({ currency: cur.value, mode: mode.value, amount: amt.value, users }, who());
          msg.textContent = r.ok ? `Done – ${r.count} player${r.count === 1 ? "" : "s"} updated.` : r.err; msg.style.color = r.ok ? "#86efac" : "";
          if (r.ok) setTimeout(changed, 600);
        }))));
      (net.store.get().moneyLog || []).slice(0, 8).forEach((x) => b.append(h("div", "sx-row static", h("span", "tag", ago(x.ts)), h("span", "nm", `${x.text} · by ${short(x.by || "")}`))));
      b.append(h("h3", null, "Tweet claims"));
      const cl = [...eco.claims()].sort((a, z) => (a.status === "pending" ? 0 : 1) - (z.status === "pending" ? 0 : 1) || z.ts - a.ts).slice(0, 60);
      if (!cl.length) b.append(h("p", "chat-empty", "No claims yet."));
      cl.forEach((x) => {
        const a = h("a", null, x.url.replace("https://", "")); a.href = x.url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.className = "ad-link";
        b.append(h("div", "sx-row static", h("span", "tag" + (x.status === "pending" ? " sale" : ""), x.status), h("span", "nm", `${nameOf(x.user)} · `, a),
          x.status === "pending" ? h("span", "acts", btn("Approve +80 🥕", "", () => { eco.reviewClaim(x.id, true, who()); changed(); }), btn("Reject", "btn-danger", () => { eco.reviewClaim(x.id, false, who()); changed(); })) : null));
      });
    },

    sets(b) {
      if (!can("sets")) return locked(b, "sets");
      const NAMES = { outfit: "Outfit", mouth: "Mouth", glasses: "Glasses", hat: "Hat", extra: "Extra" };
      const d = (setDraft ||= { id: null, name: "", desc: "", currency: "coins", price: 50, onSale: true, body: { mode: "keep", color: "#a78bfa" }, parts: {} });
      const found = PART_ORDER.some((c) => LOOK_PARTS[c].length);
      b.append(h("p", "modal-desc", "Build a full set. Players buy it with 🪙 coins OR with SOL (you choose one per set). It is the only way for them to change their rabbit."));
      if (!found) b.append(h("p", "sx-err", "No part pictures found yet. Put PNGs in assets/room/rabbit/<hat|glasses|mouth|outfit|extra>/ named 1.png, 2.png … (fix1.png keeps its own colours), then refresh."));
      const cv = h("canvas", "set-cv"); cv.width = 150; cv.height = 170;
      const redraw = () => drawPreviewSoon(cv, { color: d.body.mode === "fixed" ? d.body.color : "#e8e0ff", earColor: d.body.mode === "fixed" ? sets.darken(d.body.color) : "#cbbdf5", acc: 0, parts: d.parts });
      const name = inp(d.name, "text", "Set name, e.g. Wizard"); name.maxLength = 30; name.addEventListener("input", () => (d.name = name.value));
      const desc = inp(d.desc, "text", "Short description (optional)"); desc.maxLength = 120; desc.addEventListener("input", () => (d.desc = desc.value));
      const cur = h("select"); [["coins", "🪙 Coins only (in-game)"], ["sol", "◎ SOL only"]].forEach(([v, t]) => { const o = h("option", null, t); o.value = v; cur.append(o); }); cur.value = d.currency;
      const price = inp(d.price, "number", "Price"); price.min = "0"; price.step = "any"; price.addEventListener("input", () => (d.price = price.value));
      cur.addEventListener("change", () => { d.currency = cur.value; if (cur.value === "sol" && +d.price >= 5) { d.price = 0.5; price.value = "0.5"; } if (cur.value === "coins" && +d.price < 1) { d.price = 50; price.value = "50"; } });
      const sale = inp("", "checkbox"); sale.checked = d.onSale; sale.addEventListener("change", () => (d.onSale = sale.checked));
      const bm = h("select"); [["keep", "Keep the player's colour"], ["fixed", "Fixed body colour"], ["random", "Random colour (rolled when bought)"]].forEach(([v, t]) => { const o = h("option", null, t); o.value = v; bm.append(o); }); bm.value = d.body.mode;
      const bc = inp(d.body.color, "color"); bm.addEventListener("change", () => { d.body.mode = bm.value; bc.style.display = bm.value === "fixed" ? "" : "none"; redraw(); });
      bc.style.display = d.body.mode === "fixed" ? "" : "none"; bc.addEventListener("input", () => { d.body.color = bc.value; redraw(); });
      b.append(h("div", "ad-card", h("div", "ad-head", h("b", null, d.id ? "Edit set" : "New set")), h("div", "set-edit", h("div", null, cv), h("div", "set-form",
        field("Name", name), field("Description", desc), field("Currency", cur), field("Price", price), h("label", "perm", sale, h("span", null, h("b", null, "On sale"))), field("Body colour", h("div", "sx-chips", bm, bc))))));
      const partBox = h("div", "set-parts");
      PART_ORDER.forEach((c) => {
        const sel = h("select"), none = h("option", null, "— none —"); none.value = ""; sel.append(none);
        LOOK_PARTS[c].forEach((n) => { const o = h("option", null, n.startsWith("fix") ? `${n} (own colours)` : `${n} (tinted)`); o.value = n; sel.append(o); });
        const col = inp(d.parts[c]?.c || "#ff5ca8", "color"); sel.value = d.parts[c]?.n || "";
        const sync = () => { if (!sel.value) { delete d.parts[c]; col.style.display = "none"; } else { d.parts[c] = { n: sel.value, c: sel.value.startsWith("fix") ? null : col.value }; col.style.display = sel.value.startsWith("fix") ? "none" : ""; } redraw(); };
        sel.addEventListener("change", sync); col.addEventListener("input", sync);
        col.style.display = sel.value && !sel.value.startsWith("fix") ? "" : "none";
        partBox.append(h("label", "ad-field", h("span", null, NAMES[c]), h("div", "sx-chips", sel, col)));
      });
      const err = h("p", "sx-err");
      b.append(partBox, err, h("div", "ad-actions", btn(d.id ? "Save changes" : "Create set", "", () => {
        const r = sets.save({ ...d, price: +d.price }); if (!r.ok) { err.textContent = r.err; return; }
        setDraft = null; changed();
      }), d.id ? btn("Cancel edit", "btn-secondary", () => { setDraft = null; changed(); }) : null));
      redraw();
      b.append(h("h3", null, "Sets"));
      const list = sets.all();
      if (!list.length) b.append(h("p", "chat-empty", "No sets yet."));
      list.forEach((s) => {
        const bu = sets.buyers(s.id), sum = bu.reduce((a, x) => a + x.price, 0);
        b.append(h("div", "sx-row static", h("span", "tag" + (s.onSale ? " sale" : ""), s.onSale ? "ON SALE" : "HIDDEN"), h("span", "nm", `${s.name} · ${sets.priceText(s)} · ${Object.keys(s.parts).length} items · sold ${bu.length}${bu.length ? ` (${s.currency === "sol" ? "◎" + sum.toFixed(3) : "🪙 " + sum})` : ""}`),
          h("span", "acts", btn("Edit", "btn-secondary", () => { setDraft = JSON.parse(JSON.stringify({ id: s.id, name: s.name, desc: s.desc, currency: s.currency, price: s.price, onSale: s.onSale, body: s.body, parts: s.parts })); changed(); }),
            btn(s.onSale ? "Hide" : "Show", "btn-secondary", () => { sets.setOnSale(s.id, !s.onSale); changed(); }),
            confirmBtn("Delete", "btn-danger", () => { sets.remove(s.id); changed(); }))));
      });
    },

    chars(b) {
      if (!can("chars")) return locked(b, "chars");
      const d = (charDraft ||= { id: null, name: "", png: null, users: [] });
      b.append(h("p", "modal-desc", `Special characters for specific wallets (e.g. yourself). Draw the sheet exactly like assets/room/rabbit.png: ${chars.SHEET.w}×${chars.SHEET.h} px PNG, 10 frames of 128×160 (same frame order and size as the base rabbit). Those wallets are then drawn with this art everywhere instead of the normal rabbit.`));
      const cv = h("canvas", "set-cv"); cv.width = 150; cv.height = 170;
      const redraw = () => drawPreviewSoon(cv, { color: "#fff", earColor: "#fff", acc: 0, parts: {}, char: d.png || d.id ? { id: d.id || "draft", png: d.png || chars.get(d.id)?.png, ts: d.ts || chars.get(d.id)?.ts || 1 } : null });
      const name = inp(d.name, "text", "Character name"); name.maxLength = 30; name.addEventListener("input", () => (d.name = name.value));
      const file = inp("", "file"); file.accept = "image/png"; const msg = h("p", "sx-err");
      file.addEventListener("change", async () => { const r = await chars.readSheet(file.files[0]); if (!r.ok) { msg.textContent = r.err; file.value = ""; return; } msg.textContent = ""; d.png = r.png; d.ts = Date.now(); redraw(); });
      const users = h("textarea"); users.rows = 4; users.placeholder = "One wallet address per line"; users.value = d.users.join("\n"); users.addEventListener("keydown", (e) => e.stopPropagation()); users.addEventListener("input", () => (d.users = users.value.split(/[\s,]+/).filter(Boolean)));
      b.append(h("div", "ad-card", h("div", "ad-head", h("b", null, d.id ? "Edit character" : "New character")), h("div", "set-edit", h("div", null, cv), h("div", "set-form",
        field("Name", name), field("Character sheet (PNG)", file), field("Wallets that get this character", users),
        h("div", "ad-actions", btn("Add my wallet", "btn-secondary", () => { if (!session.wallet) { msg.textContent = "Connect your wallet first."; return; } if (!d.users.includes(session.wallet)) d.users.push(session.wallet); users.value = d.users.join("\n"); }))))));
      b.append(msg, h("div", "ad-actions", btn(d.id ? "Save changes" : "Create character", "", () => {
        const r = chars.save({ id: d.id, name: d.name, png: d.png, users: d.users }); if (!r.ok) { msg.textContent = r.err; return; }
        charDraft = null; changed();
      }), d.id ? btn("Cancel edit", "btn-secondary", () => { charDraft = null; changed(); }) : null));
      redraw();
      b.append(h("h3", null, "Characters"));
      if (!chars.all().length) b.append(h("p", "chat-empty", "No unique characters yet."));
      chars.all().forEach((c) => b.append(h("div", "sx-row static", h("span", "nm", `${c.name} · ${c.users.length} wallet${c.users.length === 1 ? "" : "s"}${c.users.length ? ": " + c.users.slice(0, 3).map(short).join(", ") + (c.users.length > 3 ? "…" : "") : ""}`),
        h("span", "acts", btn("Edit", "btn-secondary", () => { charDraft = { id: c.id, name: c.name, png: null, ts: c.ts, users: [...c.users] }; changed(); }),
          confirmBtn("Delete", "btn-danger", () => { chars.remove(c.id); changed(); })))));
    },

    arcade(b) {
      if (!can("arcade")) return locked(b, "arcade");
      const G = arcade.GAMES, opt = (v, t) => { const o = h("option", null, t); o.value = v; return o; };
      const gameSel = (val) => { const s = h("select"); Object.values(G).forEach((g) => s.append(opt(g.id, `${g.icon} ${g.name}`))); s.value = val; return s; };
      b.append(h("p", "modal-desc", "Mini-game machines. Players win and spend their real 🥕 carrot points in them (synced with the main game). You decide which game each machine plays."));
      // --- café machine ---
      const cs = h("select"); cs.append(opt("", "— Off: no machine in the café —")); Object.values(G).forEach((g) => cs.append(opt(g.id, `${g.icon} ${g.name}`))); cs.value = arcade.cafeGame() || "";
      cs.addEventListener("change", () => { arcade.setCafeGame(cs.value || null); changed(); });
      b.append(h("div", "ad-card", h("div", "ad-head", h("b", null, "☕ Café arcade machine")), field("Game on the café machine", cs)));
      // --- daily profit cap ---
      const capI = inp(eco.rates().arcadeCap, "number"); capI.min = 0;
      b.append(field("Max 🥕 profit a player can win in the arcade per day (all games)", capI), h("div", "ad-actions", btn("Save limit", "", () => { eco.setRates({ arcadeCap: Math.max(0, Math.floor(+capI.value) || 0) }); changed(); })));
      // --- add a machine to a burrow floor ---
      b.append(h("h3", null, "Machines in burrows"));
      const holes = getHoles().filter((x) => !x.deleted).sort((a, z) => (a.username || "").localeCompare(z.username || ""));
      const q = inp(arcDraft.q, "text", "Search a hole by name, owner or #id"), hs = h("select"), fs = h("select"), gs = gameSel(arcDraft.game);
      const fillHoles = () => {
        hs.replaceChildren(); const t = q.value.trim().toLowerCase();
        holes.filter((x) => !t || `${x.username || ""} ${x.owner || ""} #${x.id}`.toLowerCase().includes(t)).slice(0, 80).forEach((x) => hs.append(opt(x.id, `${x.username || "Hole"} · #${x.id} · depth ${x.depth}`)));
        if (arcDraft.hole != null && [...hs.options].some((o) => +o.value === arcDraft.hole)) hs.value = arcDraft.hole; else arcDraft.hole = hs.options[0] ? +hs.options[0].value : null;
        fillFloors();
      };
      const fillFloors = () => {
        fs.replaceChildren(); const x = holes.find((y) => y.id === arcDraft.hole); if (!x) return;
        for (let i = 0; i < floorCount(x.depth); i++) fs.append(opt(i, `Floor ${i + 1}${i === 0 ? " (the burrow home)" : ""}`));
        fs.value = Math.min(arcDraft.floor, fs.options.length - 1); arcDraft.floor = +fs.value;
      };
      q.addEventListener("input", () => { arcDraft.q = q.value; fillHoles(); });
      hs.addEventListener("change", () => { arcDraft.hole = +hs.value; fillFloors(); }); fs.addEventListener("change", () => (arcDraft.floor = +fs.value)); gs.addEventListener("change", () => (arcDraft.game = gs.value));
      fillHoles(); const msg = h("p", "sx-err");
      b.append(h("div", "ad-card", field("Find hole", q), field("Hole", hs), field("Floor", fs), field("Game", gs), msg,
        h("div", "ad-actions", btn("Place machine here", "", () => {
          if (arcDraft.hole == null) { msg.textContent = "Pick a hole."; return; }
          const r = arcade.setMachine({ hole: arcDraft.hole, floor: arcDraft.floor, game: arcDraft.game }); if (!r.ok) { msg.textContent = r.err; return; } changed();
        }))));
      const ms = arcade.machines();
      if (!ms.length) b.append(h("p", "chat-empty", "No machines in burrows yet."));
      ms.forEach((m) => {
        const x = holes.find((y) => y.id === m.hole), gsel = gameSel(m.game); gsel.addEventListener("change", () => { arcade.changeGame(m.id, gsel.value); changed(); });
        b.append(h("div", "sx-row static", h("span", "nm", `${x ? (x.username || "Hole") + " · #" + x.id : "Hole #" + m.hole + " (gone)"} · floor ${m.floor + 1}`), h("span", "acts", gsel,
          x ? btn("Show", "btn-secondary", () => goToHole(x)) : null, confirmBtn("Remove", "btn-danger", () => { arcade.removeMachine(m.id); changed(); }))));
      });
      // --- stats ---
      b.append(h("h3", null, "Stats (since the first play)"));
      Object.values(G).forEach((g) => { const s = arcade.statsFor(g.id); b.append(h("div", "sx-row static", h("span", "nm", `${g.icon} ${g.name}: ${s.plays} entries · players spent ${s.spent} 🥕 · paid out ${s.paid} 🥕`))); });
    },

    staff(b) {
      if (!isOwner()) return locked(b, "owner");
      b.append(h("p", "modal-desc", "Appoint admins and choose exactly what each one may do. Only you (the owner) can see this tab."));
      const known = people().filter((p) => p.id && !p.id.startsWith("demo") && !p.id.startsWith("guest-") && p.id !== session.wallet);
      const pick = h("select"); const o0 = h("option", null, "— pick a known player —"); o0.value = ""; pick.append(o0);
      known.forEach((p) => { const o = h("option", null, `${p.name || short(p.id)} · ${short(p.id)}`); o.value = p.id; pick.append(o); });
      const addr = inp("", "text", "…or paste a wallet address"), nm = inp("", "text", "Display name (optional)"), boxes = {};
      pick.addEventListener("change", () => { if (pick.value) { addr.value = pick.value; nm.value = nm.value || nameOf(pick.value); } });
      const permRow = h("div", "perm-grid");
      PERMS.forEach(([k, label, hint]) => { const cb = inp("", "checkbox"); boxes[k] = cb; permRow.append(h("label", "perm", cb, h("span", null, h("b", null, label), h("small", null, hint)))); });
      const err = h("p", "sx-err");
      b.append(h("div", "ad-card", h("div", "ad-head", h("b", null, "Add admin")), field("Player", pick), field("Wallet address", addr), field("Name", nm), permRow, err,
        h("div", "ad-actions", btn("Add / update admin", "", () => {
          const id = addr.value.trim();
          if (!BASE58.test(id)) { err.textContent = "That is not a valid Solana wallet address."; return; }
          const perms = {}; PERMS.forEach(([k]) => (perms[k] = boxes[k].checked));
          if (!Object.values(perms).some(Boolean)) { err.textContent = "Select at least one permission."; return; }
          net.setStaff(id, { name: nm.value.trim() || nameOf(id), perms }); changed();
        }))));
      b.append(h("h3", null, "Current staff"));
      const st = net.staff(), ids = Object.keys(st);
      if (!ids.length) b.append(h("p", "chat-empty", "No staff yet."));
      ids.forEach((id) => {
        const rec = st[id], grid = h("div", "perm-grid");
        PERMS.forEach(([k, label]) => { const cb = inp("", "checkbox"); cb.checked = !!rec.perms[k]; cb.addEventListener("change", () => { net.setStaff(id, { name: rec.name, perms: { ...rec.perms, [k]: cb.checked } }); changed(); }); grid.append(h("label", "perm", cb, h("span", null, h("b", null, label)))); });
        b.append(h("div", "ad-card", h("div", "ad-head", h("b", null, rec.name || nameOf(id)), h("span", null, short(id)), isOnline(id) ? h("span", "tag", "online") : null), grid,
          h("div", "ad-actions", confirmBtn("Remove admin", "btn-danger", () => { net.removeStaff(id); changed(); }))));
      });
    }
  };
  const TAB_PERM = { overview: () => true, chat: () => can("chat"), reports: () => can("reports"), users: () => can("users") || can("ban"), holes: () => can("holes"), ads: () => can("ads"), economy: () => can("economy"), sets: () => can("sets"), chars: () => can("chars"), arcade: () => can("arcade"), staff: () => isOwner() };

  function render() {
    const b = m.body; b.replaceChildren();
    const tabs = Object.keys(TAB_PERM).filter((t) => TAB_PERM[t]()); if (!tabs.includes(tab)) tab = "overview";
    const open = net.reports().filter((r) => r.status === "open").length;
    b.append(h("div", "ad-tabs", ...tabs.map((t) => btn((t === "chars" ? "Characters" : t[0].toUpperCase() + t.slice(1)) + (t === "reports" && open ? ` (${open})` : ""), t === tab ? "" : "btn-secondary", () => { tab = t; focusN = null; render(); }))));
    views[tab](b);
  }
  return { open(t = "overview", n = null) { tab = t; focusN = n; render(); m.open(); }, render, isOpen: m.isOpen, body: m.body };
}

/**
 * Admin panel. The owner (ADMIN_WALLET) can do everything and can appoint staff with limited permissions.
 * NOTE: this is client-side. With the local driver every change only affects this browser.
 * When you move to a real backend, enforce roles on the SERVER (verify a signed message from the wallet).
 */
import { HOLE_STYLES, MAX_DEPTH, groupEnd, gapLayout } from "./world.js?v=13";
import { fmtSol } from "./pricing.js?v=13";
import * as eco from "./economy.js?v=13";

export const PERMS = [
  ["chat", "Moderate chat", "Delete messages, clear chat"], ["reports", "Handle reports", "Review reported messages"], ["ban", "Ban / unban", "Mute people by banning them"],
  ["users", "Users", "Delete users, edit balances"], ["holes", "Holes", "Edit or delete holes, remove listings"], ["ads", "Billboards & stalls", "Edit sponsor boards"],
  ["notice", "Announcements", "Publish the site-wide notice"], ["economy", "Economy", "Rates and tweet claims"]
];
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function initAdmin(c) {
  const { net, h, btn, modal, getHoles, session, people, nameOf, isOnline, applyOverride, goToHole, openDM, can, isOwner, changed } = c;
  const m = modal("🛡 Admin panel", true);
  let tab = "overview", focusN = null;
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
      b.append(h("h3", null, "Tweet claims"));
      const cl = [...eco.claims()].sort((a, z) => (a.status === "pending" ? 0 : 1) - (z.status === "pending" ? 0 : 1) || z.ts - a.ts).slice(0, 60);
      if (!cl.length) b.append(h("p", "chat-empty", "No claims yet."));
      cl.forEach((x) => {
        const a = h("a", null, x.url.replace("https://", "")); a.href = x.url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.className = "ad-link";
        b.append(h("div", "sx-row static", h("span", "tag" + (x.status === "pending" ? " sale" : ""), x.status), h("span", "nm", `${nameOf(x.user)} · `, a),
          x.status === "pending" ? h("span", "acts", btn("Approve +80 🥕", "", () => { eco.reviewClaim(x.id, true, who()); changed(); }), btn("Reject", "btn-danger", () => { eco.reviewClaim(x.id, false, who()); changed(); })) : null));
      });
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
  const TAB_PERM = { overview: () => true, chat: () => can("chat"), reports: () => can("reports"), users: () => can("users") || can("ban"), holes: () => can("holes"), ads: () => can("ads"), economy: () => can("economy"), staff: () => isOwner() };

  function render() {
    const b = m.body; b.replaceChildren();
    const tabs = Object.keys(TAB_PERM).filter((t) => TAB_PERM[t]()); if (!tabs.includes(tab)) tab = "overview";
    const open = net.reports().filter((r) => r.status === "open").length;
    b.append(h("div", "ad-tabs", ...tabs.map((t) => btn(t[0].toUpperCase() + t.slice(1) + (t === "reports" && open ? ` (${open})` : ""), t === tab ? "" : "btn-secondary", () => { tab = t; focusN = null; render(); }))));
    views[tab](b);
  }
  return { open(t = "overview", n = null) { tab = t; focusN = n; render(); m.open(); }, render, isOpen: m.isOpen, body: m.body };
}

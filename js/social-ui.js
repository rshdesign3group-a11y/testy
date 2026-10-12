/**
 * Social UI: chat (global + direct), leaderboard, market, trade, owner NPC dialog,
 * likes / tips / visits, billboards + stalls, notice bar and the admin panel.
 * All dynamic text is inserted with textContent / text nodes (no innerHTML).
 */
import * as net from "./social.js?v=13";
import { priceBreakdown, autoPriceSol, fmtSol, fmtUsd, SOL_USD } from "./pricing.js?v=13";
import { floorCount, getGallery, ADMIN_WALLET, MAX_DEPTH } from "./data.js?v=13";
import { initAdmin } from "./admin-ui.js?v=13";
import { emojiPicker } from "./emoji.js?v=13";
import * as audio from "./audio.js?v=13";
import * as fx from "./fx.js?v=13";

const h = (tag, cls, ...kids) => { const e = document.createElement(tag); if (cls) e.className = cls; e.append(...kids.flat().filter((k) => k != null)); return e; };
const btn = (text, cls, fn) => { const b = h("button", "btn btn-small " + (cls || ""), text); b.type = "button"; b.addEventListener("click", fn); return b; };
const short = (a) => (a && a.length > 12 ? a.slice(0, 4) + "…" + a.slice(-4) : a);
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "now" : m < 60 ? m + "m" : Math.round(m / 60) + "h"; };
const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

export function initSocial(ctx) {
  const { getHoles, session, goToHole, transfer, applyOverride, onOwnership } = ctx;
  const guestId = (() => {
    try { let g = sessionStorage.getItem("dh:guest"); if (!g) { g = "guest-" + Math.random().toString(36).slice(2, 6); sessionStorage.setItem("dh:guest", g); } return g; }
    catch { return "guest-" + Math.random().toString(36).slice(2, 6); }
  })();
  const meId = () => session.wallet || guestId;
  // roles: the owner has everything, staff only the permissions the owner gave them
  const isOwner = () => session.wallet === ADMIN_WALLET;
  const staffRec = () => (session.wallet ? net.staffOf(session.wallet) : null);
  const can = (perm) => isOwner() || !!staffRec()?.perms?.[perm];
  const isAdmin = () => isOwner() || (!!staffRec() && Object.values(staffRec().perms || {}).some(Boolean));
  const roleNow = () => (isOwner() ? "owner" : isAdmin() ? "staff" : "");
  const owns = () => getHoles().some((x) => x.owner === session.user);
  const tierNow = () => (isAdmin() ? "staff" : owns() ? "holder" : session.wallet ? "wallet" : "ghost");
  const badgeOf = (role) => (role === "owner" ? "👑 " : role === "staff" ? "🛡 " : "");
  const say = (t) => { let e = document.getElementById("toast"); if (!e) { e = document.createElement("div"); e.id = "toast"; document.body.append(e); } e.textContent = t; e.classList.add("show"); clearTimeout(e._h); e._h = setTimeout(() => e.classList.remove("show"), 4000); };
  const banned = () => net.isBanned(meId());
  const isOnline = (id) => net.online().some((u) => u.id === id);
  const nameOf = (id) => getHoles().find((x) => x.owner === id)?.username || net.peerName(id) || (id?.startsWith("guest-") ? "Guest " + id.slice(6) : short(id));
  const priceOf = (hole) => { const l = net.activeListing(hole); return l?.mode === "custom" ? l.price : autoPriceSol(hole, getHoles()); };
  const money = (sol) => `${fmtSol(sol)} (~${fmtUsd(sol * SOL_USD)})`;
  const deny = () => alert("Your account is banned.");

  /* ---------- modal shell ---------- */
  function modal(title, wide, noClose) {
    const body = h("div", "sx-body"), close = btn("Close", "btn-secondary", () => { root.classList.add("hidden"); audio.sfx("close"); }), heading = h("h2", null, title);
    const root = h("div", "modal hidden", h("div", "modal-content" + (wide ? " wide" : ""), heading, body, noClose ? null : h("div", "modal-actions", close)));
    root.addEventListener("pointerdown", (e) => { if (e.target === root) root.classList.add("hidden"); });
    document.body.append(root);
    return { root, body, heading, open() { root.classList.remove("hidden"); audio.sfx("open"); }, close() { root.classList.add("hidden"); }, isOpen: () => !root.classList.contains("hidden") };
  }
  const lbModal = modal("🏆 Leaderboard", true), mkModal = modal("🏪 Market", true), trModal = modal("Trade hole");
  const npcModal = modal(""), tipModal = modal("💸 Tip the owner"), gapModal = modal(""), cfModal = modal("", false, true), reportModal = modal("⚑ Report message");

  cfModal.root.classList.add("top"); reportModal.root.classList.add("top");        // confirmations always sit above every other panel

  /** Every money action (tip, list, buy, cancel listing) must be confirmed first. */
  function ask({ title, text, label = "Confirm", danger = false }, onYes) {
    cfModal.heading.textContent = title; const b = cfModal.body; b.replaceChildren();
    b.append(h("p", null, text), h("div", "modal-actions", btn("Cancel", "btn-secondary", () => cfModal.close()), btn(label, danger ? "btn-danger" : "", () => { cfModal.close(); onYes(); })));
    cfModal.open();
  }

  /* ---------- top bar + notice ---------- */
  const area = document.querySelector(".top-bar .wallet-area");
  const balBadge = h("span", "badge", "");
  const iconBtn = (icon, label, cls, fn) => { const b = btn("", cls, fn); b.title = label; b.append(h("span", "ico", icon), h("span", "lbl", " " + label)); return b; };   // label hidden on phones
  const lbBtn = iconBtn("🏆", "Leaderboard", "btn-secondary", () => { renderLeaderboard(); lbModal.open(); });
  const mkBtn = iconBtn("🏪", "Market", "btn-secondary", () => { renderMarket(); mkModal.open(); });
  const adminBtn = iconBtn("🛡", "Admin", "", () => admin.open());
  adminBtn.classList.add("hidden");
  area.prepend(adminBtn, lbBtn, mkBtn, balBadge);
  const noticeText = h("span"), noticeX = h("button", "nx", "✕");
  const noticeBar = h("div", "notice-bar hidden", noticeText, noticeX); document.body.prepend(noticeBar);
  let dismissed = (() => { try { return sessionStorage.getItem("dh:notice-x"); } catch { return null; } })();
  noticeX.addEventListener("click", () => { dismissed = net.notice(); try { sessionStorage.setItem("dh:notice-x", dismissed); } catch { /* ignore */ } refreshAll(); });
  let lastNoticeH = -1;
  function showNotice() {
    const n = net.notice(), on = !!n && n !== dismissed;
    noticeText.textContent = n ? "📢 " + n : ""; noticeBar.classList.toggle("hidden", !on);
    const hgt = on ? noticeBar.offsetHeight : 0;
    if (hgt !== lastNoticeH) { lastNoticeH = hgt; document.documentElement.style.setProperty("--notice-h", hgt + "px"); requestAnimationFrame(() => dispatchEvent(new Event("resize"))); }
  }
  const updateBalance = () => { balBadge.textContent = "Balance " + fmtSol(net.balance(session.user)); balBadge.title = "Simulated balance (demo)"; };
  const syncFlags = () => getHoles().forEach((x) => { x._sale = !x.special && net.activeListing(x) ? fmtSol(priceOf(x)) : null; x._party = !!net.partyActive(x); });

  /* ================= CHAT ================= */
  let tab = "global", peer = null, chatOpen = false;
  const lastRead = {}, sessionStart = Date.now();
  const fab = h("button", "chat-fab", "💬"), badge = h("span", "chat-badge hidden");
  fab.append(badge); fab.title = "Chat";
  const gTab = btn("Global", "", () => { tab = "global"; peer = null; renderChat(); });
  const dTab = btn("Messages", "", () => { tab = "dm"; peer = null; renderChat(); });
  const peerTitle = h("span", "chat-peer");
  const list = h("div", "chat-list"), input = h("input", ""), sendBtn = btn("Send", "", doSend);
  input.type = "text"; input.maxLength = 300; input.placeholder = "Write a message…";
  input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") doSend(); });
  const emo = emojiPicker(input), errLine = h("div", "chat-err"), tierHint = h("div", "chat-tier hidden");
  const panel = h("div", "chat-panel hidden",
    h("div", "chat-head", gTab, dTab, peerTitle, btn("✕", "btn-secondary", () => toggleChat(false))), tierHint, list, errLine, h("div", "chat-foot", emo.toggle, input, sendBtn), emo.pop);
  let errT = 0; const showErr = (t) => { errLine.textContent = t; clearTimeout(errT); if (t) errT = setTimeout(() => (errLine.textContent = ""), 4500); };
  document.body.append(fab, panel);
  fab.addEventListener("click", () => toggleChat(!chatOpen));

  const convoOf = (m) => (m.from === meId() ? m.to : m.from);
  const globalMsgs = () => net.messages().filter((m) => !m.to);
  const dmMsgs = (p) => net.messages().filter((m) => m.to && ((m.from === meId() && m.to === p) || (m.from === p && m.to === meId())));
  const unreadIn = (msgs, key) => msgs.filter((m) => m.from !== meId() && m.ts > (lastRead[key] ?? sessionStart)).length;

  function toggleChat(open) { chatOpen = open; panel.classList.toggle("hidden", !open); renderChat(); if (open) input.focus(); }
  function openDM(id) { if (!id || id === meId()) return; tab = "dm"; peer = id; toggleChat(true); }
  function doSend() {
    if (tab === "dm" && !peer) return;
    if (banned()) return deny();
    const r = net.send(tab === "global" ? null : peer, input.value);
    if (!r.ok) { if (r.err) { showErr(r.err); ctx.onSound?.("error"); } return; }
    input.value = ""; showErr(""); renderChat(); ctx.onSound?.("pop");
  }
  function renderChat() {
    gTab.classList.toggle("on", tab === "global"); dTab.classList.toggle("on", tab === "dm");
    if (chatOpen) { if (tab === "global") lastRead.global = Date.now(); else if (peer) lastRead[peer] = Date.now(); }
    const dmPeers = new Set(net.messages().filter((m) => m.to && (m.from === meId() || m.to === meId())).map(convoOf));
    let unread = (chatOpen && tab === "global") ? 0 : unreadIn(globalMsgs(), "global");
    dmPeers.forEach((p) => { if (!(chatOpen && tab === "dm" && peer === p)) unread += unreadIn(dmMsgs(p), p); });
    badge.textContent = unread > 9 ? "9+" : unread; badge.classList.toggle("hidden", !unread);
    if (!chatOpen) return;

    list.replaceChildren(); peerTitle.textContent = "";
    const tier = tierNow();
    input.disabled = sendBtn.disabled = (tab === "dm" && !peer) || banned() || tier === "ghost";
    tierHint.classList.toggle("hidden", tier === "holder" || tier === "staff");
    tierHint.textContent = tier === "ghost" ? "👻 Ghost mode: you can read the chat. Connect a wallet to talk." : tier === "wallet" ? "🐢 Slow mode (15 s, 120 characters). Own a hole for faster, longer messages." : "";
    if (banned()) list.append(h("p", "chat-empty", "Your account is banned from chat."));
    if (tab === "dm" && !peer) {
      input.placeholder = "Pick a conversation first";
      if (!dmPeers.size) list.append(h("p", "chat-empty", "No messages yet. Click a name in the Leaderboard or talk to a hole owner."));
      [...dmPeers].forEach((p) => {
        const msgs = dmMsgs(p), last = msgs[msgs.length - 1], un = unreadIn(msgs, p);
        const row = h("button", "chat-convo", h("b", null, nameOf(p)), h("span", null, last?.text.slice(0, 40) || ""), un ? h("i", null, String(un)) : null);
        row.type = "button"; row.addEventListener("click", () => { peer = p; renderChat(); });
        list.append(row);
      });
      return;
    }
    input.placeholder = tab === "global" ? "Message everyone…" : "Message " + nameOf(peer) + "…";
    if (tab === "dm") {
      peerTitle.textContent = nameOf(peer);
      if (peer.startsWith("demo") || peer === "you") list.append(h("p", "chat-empty", "This is a demo account - nobody will answer."));
    }
    const msgs = tab === "global" ? globalMsgs() : dmMsgs(peer);
    if (!msgs.length && !banned()) list.append(h("p", "chat-empty", tab === "global" ? "Say hi to everyone online." : "No messages yet."));
    msgs.slice(-80).forEach((m) => {
      const self = m.from === meId(), who = h("button", "chat-name", self ? "You" : m.name || short(m.from));
      who.type = "button"; who.disabled = self; who.addEventListener("click", () => openDM(m.from));
      const rep = self || m.role ? null : btn("⚑", "chat-rep", () => openReport(m, tab === "dm" ? "dm" : "global")); if (rep) rep.title = "Report this message";
      list.append(h("div", "chat-msg" + (self ? " me" : ""), h("div", "chat-meta", h("b", "chat-badge-r", badgeOf(m.role)), who, h("span", null, ago(m.ts)), rep), h("div", "chat-text", m.text)));
    });
    list.scrollTop = list.scrollHeight;
  }

  /* ================= REPORT A MESSAGE ================= */
  function openReport(msg, scope) {
    const b = reportModal.body; b.replaceChildren();
    const sel = h("select"); net.REPORT_REASONS.forEach((r) => { const o = h("option", null, r); o.value = r; sel.append(o); });
    const note = h("input"); note.type = "text"; note.maxLength = 200; note.placeholder = "Add a note (optional)"; note.addEventListener("keydown", (e) => e.stopPropagation());
    const err = h("p", "sx-err");
    b.append(h("p", "modal-desc", `${msg.name || "Someone"} wrote:`), h("p", "report-quote", msg.text), h("label", "ad-field", h("span", null, "Reason"), sel), note, err,
      h("div", "modal-actions", btn("Cancel", "btn-secondary", () => reportModal.close()), btn("Send report", "btn-danger", () => {
        const r = net.reportMessage({ scope, msg, reason: sel.value, note: note.value });
        if (!r.ok) { err.textContent = r.err; return; }
        reportModal.close(); say("Thanks! Our team will review this message."); ctx.onSound?.("click");
      })));
    reportModal.open();
  }

  /* ================= PEOPLE / HOLE STATS ================= */
  function people() {
    const m = new Map();
    const get = (id, name) => { if (!m.has(id)) m.set(id, { id, name: name || nameOf(id), holes: [], likes: 0, visits: 0, tips: 0, online: isOnline(id) }); return m.get(id); };
    getHoles().forEach((x) => { const u = get(x.owner, x.username), st = net.holeStats(x.id); u.holes.push(x); u.likes += st.likes; u.visits += st.visits; u.tips += st.tips; });
    net.online().forEach((p) => get(p.id, p.name));
    net.messages().forEach((mm) => get(mm.from, mm.name));
    return [...m.values()];
  }
  const pictureCount = (hole) => { let n = 0; for (let f = 0; f < floorCount(hole.depth); f++) n += getGallery(hole, f).filter(Boolean).length; return n; };

  /* ================= LEADERBOARD (everyone, every hole) ================= */
  const stat = (label, value, sub) => h("div", "sx-stat", h("small", null, label), h("b", null, value), sub ? h("span", null, sub) : null);
  let lbTab = "holes", lbSort = "depth", lbQuery = "", lbWeek = "visits", listBox = null;
  const SORTS = { depth: "Depth", likes: "Likes", visits: "Visits", tips: "Tips", price: "Price" };

  function renderLeaderboard(rowsOnly) {
    if (rowsOnly && listBox) return fillRows();
    const holes = getHoles(), st = net.stats(), tt = net.totals(), on = net.online(), b = lbModal.body;
    b.replaceChildren();
    b.append(h("div", "sx-stats",
      stat("Online now", String(on.length)), stat("Players", String(people().filter((p) => p.holes.length).length), `${holes.length} holes`),
      stat("Total hole sales", fmtSol(st.total), `~${fmtUsd(st.total * SOL_USD)} · ${st.count} sales`),
      stat("Likes", String(tt.likes), `${tt.visits} visits`), stat("Tips sent", fmtSol(tt.tips))));
    b.append(h("div", "ad-tabs", ...["holes", "weekly", "people", "sales"].map((t) => btn(t[0].toUpperCase() + t.slice(1), t === lbTab ? "" : "btn-secondary", () => { lbTab = t; renderLeaderboard(); }))));
    if (lbTab === "holes") {
      const q = h("input", "sx-search"); q.type = "text"; q.placeholder = "Search by name…"; q.value = lbQuery;
      q.addEventListener("keydown", (e) => e.stopPropagation()); q.addEventListener("input", () => { lbQuery = q.value; fillRows(); });
      b.append(h("div", "sx-sorts", h("small", null, "Sort by"), ...Object.entries(SORTS).map(([k, label]) => btn(label, k === lbSort ? "" : "btn-secondary", () => { lbSort = k; renderLeaderboard(); })), q));
    }
    if (lbTab === "weekly") {
      const left = net.weekStart() + 7 * 864e5 - Date.now();
      b.append(h("div", "sx-sorts", h("small", null, `This week · resets in ${Math.floor(left / 864e5)}d ${Math.floor(left % 864e5 / 36e5)}h · rank by`),
        ...[["visits", "👁 Visited"], ["likes", "❤ Liked"], ["dug", "⛏ Dug"], ["tips", "💸 Tipped"]].map(([k, label]) => btn(label, k === lbWeek ? "" : "btn-secondary", () => { lbWeek = k; renderLeaderboard(); }))));
    }
    listBox = h("div", "sx-scroll"); b.append(listBox); fillRows();
  }
  function fillRows() {
    listBox.replaceChildren();
    if (lbTab === "holes") {
      const q = lbQuery.trim().toLowerCase();
      const rows = getHoles().map((x) => ({ x, st: net.holeStats(x.id), price: x.special ? null : priceOf(x), l: net.activeListing(x) }))
        .filter((r) => !q || (r.x.username || "").toLowerCase().includes(q))
        .sort((a, c) => ({ depth: c.x.depth - a.x.depth, likes: c.st.likes - a.st.likes, visits: c.st.visits - a.st.visits, tips: c.st.tips - a.st.tips, price: (c.price ?? Infinity) - (a.price ?? Infinity) })[lbSort] || 0);
      listBox.append(h("div", "sx-row sx-grid sx-head", ...["#", "Hole", "Depth", "❤", "👁", "Tips", "Price", ""].map((t) => h("span", null, t))));
      rows.forEach((r, i) => {
        const x = r.x, row = h("button", "sx-row sx-grid" + (i === 0 ? " top" : ""),
          h("span", "rk", i === 0 ? "👑" : String(i + 1)), h("span", "nm", (isOnline(x.owner) ? "🟢 " : "") + (x.special ? "★ " : "") + (x.username || "Hole " + x.id)),
          h("span", null, String(x.depth)), h("span", null, String(r.st.likes)), h("span", null, String(r.st.visits)), h("span", null, r.st.tips ? fmtSol(r.st.tips) : "-"),
          h("span", "pr", r.price == null ? "Founder" : fmtSol(r.price)), h("span", "tag" + (r.l ? " sale" : ""), r.l ? "For sale" : x.special ? "★" : ""));
        row.type = "button"; row.title = r.price == null ? "Not for sale" : money(r.price); row.addEventListener("click", () => { lbModal.close(); goToHole(x); });
        listBox.append(row);
      });
      if (!rows.length) listBox.append(h("p", "chat-empty", "No holes found."));
    } else if (lbTab === "weekly") {
      const wk = net.weekly(), rows = getHoles().map((x) => ({ x, w: wk[x.id] || { visits: 0, likes: 0, tips: 0, dug: 0 } })).sort((a, c) => c.w[lbWeek] - a.w[lbWeek] || c.x.depth - a.x.depth);
      listBox.append(h("div", "sx-row sx-grid weekly sx-head", ...["#", "Hole", "👁", "❤", "⛏", "Tips"].map((t) => h("span", null, t))));
      rows.forEach((r, i) => {
        const row = h("button", "sx-row sx-grid weekly" + (i === 0 && r.w[lbWeek] > 0 ? " top" : ""), h("span", "rk", i === 0 && r.w[lbWeek] > 0 ? "👑" : String(i + 1)), h("span", "nm", (r.x.special ? "★ " : "") + (r.x.username || "Hole " + r.x.id)),
          h("span", null, String(r.w.visits)), h("span", null, String(r.w.likes)), h("span", null, String(r.w.dug)), h("span", null, r.w.tips ? fmtSol(r.w.tips) : "-"));
        row.type = "button"; row.addEventListener("click", () => { lbModal.close(); goToHole(r.x); }); listBox.append(row);
      });
    } else if (lbTab === "people") {
      listBox.append(h("div", "sx-row sx-grid people sx-head", ...["", "Player", "Holes", "Deepest", "❤", "Tips", ""].map((t) => h("span", null, t))));
      people().sort((a, c) => Math.max(0, ...c.holes.map((x) => x.depth)) - Math.max(0, ...a.holes.map((x) => x.depth)) || c.likes - a.likes).forEach((u) => {
        const deep = u.holes.reduce((best, x) => (!best || x.depth > best.depth ? x : best), null);
        const acts = h("span", "acts", deep ? btn("View", "btn-secondary", () => { lbModal.close(); goToHole(deep); }) : null, u.id === meId() || u.id === session.user ? null : btn("💬", "", () => { lbModal.close(); openDM(u.id); }));
        listBox.append(h("div", "sx-row sx-grid people static", h("span", null, u.online ? "🟢" : "⚪"), h("span", "nm", u.name || short(u.id)), h("span", null, String(u.holes.length)),
          h("span", null, deep ? String(deep.depth) : "-"), h("span", null, String(u.likes)), h("span", null, u.tips ? fmtSol(u.tips) : "-"), acts));
      });
    } else {
      const all = [...net.sales()].reverse();
      if (!all.length) listBox.append(h("p", "chat-empty", "No sales yet."));
      all.forEach((s) => listBox.append(h("div", "sx-row static", h("span", "nm", `Hole #${s.holeId}`), h("span", null, s.kind === "primary" ? "new hole" : "resale"),
        h("span", null, `${s.from ? nameOf(s.from) : "game"} → ${nameOf(s.to)}`), h("span", "pr", money(s.price)), h("span", "tag", ago(s.ts)))));
    }
  }

  /* ================= MARKET ================= */
  function renderMarket() {
    const holes = getHoles(), b = mkModal.body; b.replaceChildren();
    b.append(h("p", "modal-desc", `Your balance: ${money(net.balance(session.user))} · simulated`));
    const items = holes.filter((x) => !x.special && net.activeListing(x)).sort((x, y) => priceOf(x) - priceOf(y));
    const grid = h("div", "sx-table");
    items.forEach((x) => {
      const l = net.activeListing(x), mine = x.owner === session.user;
      grid.append(h("div", "sx-row static", h("span", "nm", x.username || "Hole " + x.id), h("span", null, `Depth ${x.depth}`), h("span", null, `Slot ${x.x + 1}`),
        h("span", "pr", money(priceOf(x))), h("span", "tag", l.mode === "auto" ? "auto price" : "asking"),
        btn("View", "btn-secondary", () => { mkModal.close(); goToHole(x); }), mine ? h("span", "tag", "yours") : btn("Buy", "", () => openTrade(x))));
    });
    if (!items.length) grid.append(h("p", "chat-empty", "Nothing for sale right now. Owners can list a hole from inside it."));
    b.append(h("h3", null, "For sale"), grid, h("h3", null, "Recent sales"));
    const recent = h("div", "sx-table");
    [...net.sales()].slice(-8).reverse().forEach((s) => recent.append(h("div", "sx-row static", h("span", "nm", `Hole #${s.holeId}`), h("span", null, s.kind === "primary" ? "new" : "resale"),
      h("span", null, `${s.from ? nameOf(s.from) : "game"} → ${nameOf(s.to)}`), h("span", "pr", money(s.price)), h("span", "tag", ago(s.ts)))));
    if (!net.sales().length) recent.append(h("p", "chat-empty", "No sales yet."));
    b.append(recent);
  }

  /* ================= TRADE (sell / buy) ================= */
  let tradeHole = null, confirming = false;
  function openTrade(hole) { tradeHole = hole; confirming = false; renderTrade(); trModal.open(); }
  function renderTrade() {
    const hole = tradeHole, b = trModal.body; b.replaceChildren();
    if (!hole) return;
    if (hole.special) { b.append(h("p", null, "★ This is the founder's burrow. It is not for sale.")); return; }
    const bd = priceBreakdown(hole, getHoles()), l = net.activeListing(hole), mine = hole.owner === session.user;
    b.append(h("p", "modal-desc", `${hole.username || "Hole " + hole.id} · depth ${hole.depth} · ${floorCount(hole.depth)} floors · slot ${hole.x + 1}`),
      h("div", "sx-break",
        h("div", null, h("span", null, `Depth ${hole.depth} (4 × depth^1.15)`), h("b", null, fmtUsd(bd.base))),
        h("div", null, h("span", null, `Location: ${bd.dist} slot${bd.dist === 1 ? "" : "s"} from the first house`), h("b", null, "× " + bd.mult.toFixed(2))),
        h("div", "tot", h("span", null, "Automatic price"), h("b", null, money(bd.sol)))));
    if (mine) {
      const auto = h("input"), cust = h("input"), price = h("input"), msg = h("p", "sx-err");
      auto.type = cust.type = "radio"; auto.name = cust.name = "mode"; auto.checked = !l || l.mode === "auto"; cust.checked = l?.mode === "custom";
      price.type = "number"; price.min = "0.001"; price.step = "0.001"; price.value = l?.mode === "custom" ? l.price : bd.sol.toFixed(3);
      price.addEventListener("focus", () => (cust.checked = true)); price.addEventListener("keydown", (e) => e.stopPropagation());
      b.append(h("label", "sx-opt", auto, " Automatic price (follows depth and location)"), h("label", "sx-opt", cust, " My asking price (◎ SOL) ", price), msg,
        h("div", "modal-actions", l ? btn("Remove listing", "btn-secondary", () => ask({ title: "Remove listing", text: "Take this hole off the market? It will no longer be for sale.", label: "Remove listing", danger: true }, () => { net.unlist(hole); trModal.close(); changed(); })) : null,
          btn(l ? "Update listing" : "List for sale", "", () => {
            if (banned()) return deny();
            const v = parseFloat(price.value);
            if (cust.checked && !(v > 0 && v < 1e6)) { msg.textContent = "Enter a price above 0."; return; }
            const what = cust.checked ? `your asking price of ${money(v)}` : `the automatic price (${money(bd.sol)}), which follows its depth and location`;
            ask({ title: l ? "Update listing" : "List for sale", text: `${l ? "Update the listing of" : "List"} ${hole.username || "this hole"} for sale at ${what}?`, label: l ? "Update listing" : "List for sale" },
              () => { net.listHole(hole, cust.checked ? v : null); audio.sfx("coin"); trModal.close(); changed(); });
          })));
    } else {
      const price = priceOf(hole), err = h("p", "sx-err");
      b.append(h("p", null, l ? `Price: ${money(price)}` : "This hole is not for sale. Its estimated value is above."), h("p", "modal-desc", `Your balance: ${money(net.balance(session.user))}`), err);
      const row = h("div", "modal-actions", btn("💬 Message owner", "btn-secondary", () => { trModal.close(); openDM(hole.owner); }));
      if (l) row.append(btn("Buy now (simulated)", "", () => ask({
        title: "Confirm purchase", label: "Buy",
        text: `Buy ${hole.username || "this hole"} (depth ${hole.depth}) from ${nameOf(hole.owner)} for ${money(price)}? Your balance afterwards: ${money(net.balance(session.user) - price)}.`
      }, () => {
        const r = net.buy(hole, session.user, price);
        if (!r.ok) { renderTrade(); trModal.body.querySelector(".sx-err").textContent = r.err; return; }
        transfer(hole.id, r.seller, session.user); audio.sfx("buy"); fx.confetti(); changed(); trModal.close();
      })));
      b.append(row);
    }
  }
  function changed() { refreshAll(); onOwnership?.(); }

  /* ================= TIP ================= */
  function openTip(hole) {
    if (banned()) return deny();
    const b = tipModal.body, msg = h("p", "sx-err"), custom = h("input"); b.replaceChildren();
    custom.type = "number"; custom.min = "0.001"; custom.step = "0.001"; custom.placeholder = "Custom ◎"; custom.addEventListener("keydown", (e) => e.stopPropagation());
    const send = (v) => {
      if (!(v > 0)) { msg.textContent = "Enter an amount above 0."; return; }
      ask({ title: "Confirm tip", label: "Send tip", text: `Send ${money(v)} to ${hole.username || "the owner"}? A tip cannot be taken back.` },
        () => { const r = net.tip(hole, session.user, v); if (!r.ok) { msg.textContent = r.err; return; } audio.sfx("coin"); fx.confetti(innerWidth / 2, innerHeight / 2, 40); tipModal.close(); refreshAll(); });
    };
    b.append(h("p", "modal-desc", `Send a tip to ${hole.username || "the owner"}. Your balance: ${money(net.balance(session.user))} · simulated`),
      h("div", "sx-chips", [0.01, 0.05, 0.1, 0.5].map((v) => btn(fmtSol(v), "btn-secondary", () => send(v)))),
      h("div", "sx-chips", custom, btn("Send tip", "", () => send(parseFloat(custom.value)))), msg);
    tipModal.open();
  }

  /* ================= OWNER NPC DIALOG ================= */
  function openNpc(hole) {
    const mine = hole.owner === session.user || hole.owner === meId(), online = isOnline(hole.owner), name = hole.username || "Owner";
    const st = net.holeStats(hole.id), l = net.activeListing(hole), b = npcModal.body; b.replaceChildren();
    npcModal.heading.textContent = (hole.special ? "★ " : "") + name;
    let say;
    if (mine) say = "Hey, it's you! This is your own burrow. Visitors meet this character on the last floor.";
    else if (hole.special) say = online ? "Welcome to the founder's burrow! I'm online right now - say hi!" : "Welcome to the founder's burrow! I'm offline for now, but feel free to look around.";
    else if (online) say = `Hi, I'm ${name}! I'm online right now. Want to chat? Send me a message!`;
    else say = `Hello! I'm ${name}. I'm offline at the moment - here is the public info about my burrow.`;
    const av = h("div", "npc-av"); if (hole.image) av.style.backgroundImage = `url("${hole.image.replace(/"/g, "%22")}")`; else av.style.background = hole.customRabbit?.color || "#64748b";
    b.append(h("div", "npc-top", av, h("div", null, h("div", "npc-status" + (online ? " on" : ""), online ? "● Online" : "○ Offline"), h("div", "npc-say", say))));
    const cell = (k, v) => h("div", "sx-stat", h("small", null, k), h("b", null, v));
    b.append(h("div", "sx-stats",
      cell("Depth", `${hole.depth} / ${MAX_DEPTH}`), cell("Floors", String(floorCount(hole.depth))), cell("Pictures", String(pictureCount(hole))),
      cell(hole.special ? "Price" : l ? "Price (listed)" : "Estimated value", hole.special ? "Not for sale" : fmtSol(priceOf(hole))),
      cell("Visits", String(st.visits)), cell("Likes", String(st.likes)), cell("Tips", fmtSol(st.tips))));
    if (hole.description) b.append(h("p", "modal-desc", hole.description));
    const row = h("div", "modal-actions");
    if (!mine) row.append(btn("💬 Message", "", () => { npcModal.close(); openDM(hole.owner); }), likeButton(hole, () => openNpc(hole)), btn("💸 Tip", "btn-secondary", () => { npcModal.close(); openTip(hole); }));
    row.append(btn("👤 Profile", "btn-secondary", () => { npcModal.close(); ctx.onProfile?.(hole); }));
    b.append(row);
    npcModal.open();
  }
  function likeButton(hole, after) {
    const liked = net.hasLiked(hole.id, meId());
    return btn(liked ? "♥ Liked" : "♡ Like", liked ? "" : "btn-secondary", () => { if (banned()) return deny(); if (net.toggleLike(hole.id, meId())) { audio.sfx("like"); fx.confetti(innerWidth / 2, innerHeight * .4, 25); } refreshAll(); after?.(); });
  }

  /* ================= BILLBOARDS + STALLS ================= */
  function openGap(hit) {
    if (hit.kind === "carrot" || hit.kind === "tools") { ctx.onShop?.(hit.kind); return; }          // working stalls
    const ad = net.getAd(hit.key ?? hit.n), shop = hit.kind !== "billboard", b = gapModal.body; b.replaceChildren();
    const link = ad?.link && safeUrl(ad.link);
    if (!shop && link && !isAdmin()) { window.open(link, "_blank", "noopener,noreferrer"); return; }
    gapModal.heading.textContent = ad?.title || (shop ? "Stall" : "Sponsor this billboard");
    b.append(h("p", null, ad?.text || (shop ? "This stall opens soon. Come back later!" : "This billboard is available for sponsors. Contact the admin.")));
    if (link) b.append(btn("Open link", "", () => window.open(link, "_blank", "noopener,noreferrer")));
    if (isAdmin()) b.append(btn("Edit in admin panel", "btn-secondary", () => { gapModal.close(); admin.open("ads", hit.key ?? hit.n); }));
    gapModal.open();
  }

  /* ---------- room header: stats, like, tip, sell / buy ---------- */
  let tradeArea = null;
  function updateTrade(hole, isOwner) {
    const host = document.getElementById("room-info");
    if (!tradeArea) { tradeArea = h("div", "trade-area"); host.append(tradeArea); }
    tradeArea.replaceChildren();
    if (!hole) { delete tradeArea.dataset.hole; return; }
    const st = net.holeStats(hole.id), l = net.activeListing(hole);
    tradeArea.append(h("span", "pill", `👁 ${st.visits}`), h("span", "pill", `❤ ${st.likes}`));
    if (hole.special) tradeArea.append(h("span", "pill gold", "★ Founder's burrow"));
    if (isOwner) { if (!hole.special) tradeArea.append(btn(l ? `For sale · ${fmtSol(priceOf(hole))}` : "Sell hole", "btn-secondary", () => openTrade(hole))); }
    else {
      tradeArea.append(likeButton(hole), btn("💸 Tip", "btn-secondary", () => openTip(hole)));
      if (!hole.special) tradeArea.append(l ? btn(`Buy · ${fmtSol(priceOf(hole))}`, "", () => openTrade(hole)) : btn("Value", "btn-secondary", () => openTrade(hole)));
      tradeArea.append(btn("💬 Message", "btn-secondary", () => openDM(hole.owner)));
    }
    tradeArea.dataset.hole = hole.id;
  }
  function recordVisit(hole) { if (hole.owner !== session.user && hole.owner !== meId()) net.recordVisit(hole.id, meId()); }

  /* ================= ADMIN ================= */
  const admin = initAdmin({ net, h, btn, modal, getHoles, session, people, nameOf, isOnline, applyOverride, goToHole, openDM, can, isOwner, changed: () => changed() });

  /* ---------- sync ---------- */
  // never rebuild a panel while somebody is typing in it (other people's activity would wipe their input)
  const typingIn = (el) => !!el && el.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  const applyAllOverrides = () => { const o = net.overrides(); for (const id in o) applyOverride(+id, o[id]); };
  function refreshAll() {
    net.replay(transfer);
    { const m = net.store.me(); if (m.id && (m.tier !== tierNow() || m.role !== roleNow())) net.setMe({ ...m, tier: tierNow(), role: roleNow() }); }   // e.g. right after buying a hole
    ctx.onRefresh?.();
    syncFlags(); updateBalance(); renderChat();
    showNotice();
    adminBtn.classList.toggle("hidden", !isAdmin());
    if (lbModal.isOpen()) renderLeaderboard(document.activeElement?.classList.contains("sx-search"));
    if (mkModal.isOpen()) renderMarket();
    if (trModal.isOpen() && !typingIn(trModal.body)) renderTrade();
    if (admin.isOpen() && !typingIn(admin.body)) admin.render();
    if (tradeArea?.dataset.hole) { const x = getHoles().find((q) => q.id === +tradeArea.dataset.hole); if (x) updateTrade(x, x.owner === session.user); }
  }
  net.on((e) => { if (e === "change") { applyAllOverrides(); net.replay(transfer); onOwnership?.(); } refreshAll(); });

  function refreshIdentity() { net.setMe({ id: meId(), name: nameOf(meId()), tier: tierNow(), role: roleNow() }); refreshAll(); }
  applyAllOverrides(); refreshIdentity();

  return {
    openReport, updateTrade, openDM, openNpc, openGap, recordVisit, refreshIdentity, refreshAll, isAdmin, isOwner, can, tierNow, isOnline, say, modal, h, btn, ask, money,
    isBanned: banned, getAd: net.getAd,
    afford: (sol) => net.balance(session.user) >= sol,
    primarySale: (hole, sol) => net.recordPrimary(hole, sol)
  };
}

/** Player side of the progress systems: 🎯 Daily centre, 🔔 inbox, 📖 guestbook, 🎁 gifts, 🧭 tour, banners and the quest tip. */
import * as net from "./social.js?v=14";
import * as eco from "./economy.js?v=14";
import * as sets from "./sets.js?v=14";
import * as audio from "./audio.js?v=14";
import * as fx from "./fx.js?v=14";
import * as pg from "./progress.js?v=14";
import { prog, cfg, inbox, unread, markRead, nameOf, short } from "./prog-core.js?v=14";
import { playerCount, popMult, fmtSol } from "./pricing.js?v=14";

const fmtLeft = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`; };
const ICON = { level: "⬆", badge: "🏅", mission: "✅", quest: "🧭", gift: "🎁", guestbook: "📖", sale: "💰", design: "✏️", tourney: "🏆", info: "🔔" };

export function initProgressUI({ social, session, getHoles, getMyHoles, enterHole, applyLook, openSets }) {
  const { modal, h, btn, ask, say } = social, user = () => session.user, me = () => session.wallet;
  const needWallet = (what) => { if (me()) return false; say(`Connect your wallet to ${what}.`); audio.sfx("error"); return true; };

  /* ---------- top bar buttons ---------- */
  const area = document.querySelector(".top-bar .wallet-area");
  const dailyBtn = btn("🎯", "btn-secondary", () => open("today")), bell = btn("🔔", "btn-secondary bell-btn", () => openBell()), dot = h("i", "dot2"), cnt = h("b", "bell-n");
  dailyBtn.title = "Daily missions, quests and rewards"; bell.title = "Notifications"; dailyBtn.append(dot); bell.append(cnt); area?.prepend(bell, dailyBtn);
  function hud() {
    if (!me()) { dot.style.display = "none"; cnt.style.display = "none"; return; }
    const todo = pg.missionsFor(user()).some((m) => !m.done) || pg.idleTotal(user()) >= 10 || !!pg.nextQuest(user()), n = unread(user());
    dot.style.display = todo ? "block" : "none"; cnt.textContent = n > 9 ? "9+" : n; cnt.style.display = n ? "inline-block" : "none"; drawBanners(); drawTip();
  }

  /* ---------- banners (events, price notice) and quest tip ---------- */
  const stack = h("div", "banner-stack"), tip = h("div", "quest-tip hidden"); document.body.append(stack, tip);
  const closedKey = (k) => "dh_closed_" + k + "_" + pg.dayKey();
  const closed = (k) => { try { return !!localStorage.getItem(closedKey(k)); } catch { return false; } };
  const closeIt = (k) => { try { localStorage.setItem(closedKey(k), "1"); } catch {} };
  function banner(key, cls, text, closable = true) {
    if (closable && closed(key)) return null; const x = h("div", "bn " + cls, h("span", null, text)); if (closable) { const c = h("button", "bn-x", "✕"); c.type = "button"; c.addEventListener("click", () => { closeIt(key); x.remove(); }); x.append(c); } return x;
  }
  function drawBanners() {
    stack.replaceChildren();
    for (const e of pg.activeEvents()) { const left = e.repeat === "weekly" ? "" : ` · ends in ${fmtLeft(e.end - Date.now())}`; const b = banner("ev" + e.id, "ev", `🎉 ${e.name}: ×${e.mult} carrots${e.scope === "arcade" ? " in the arcade" : e.scope === "cafe" ? " in the café" : ""}${left}`); if (b) stack.append(b); }
    const pm = popMult(playerCount(getHoles())), last = +(localStorage.getItem("dh_pm") || 0);
    if (pm > last + 0.004) { const b = banner("price" + pm.toFixed(2), "price", `📈 Burrow prices went up: ×${pm.toFixed(2)} with ${playerCount(getHoles())} players. Buy before they grow more!`); if (b) { stack.append(b); b.querySelector(".bn-x")?.addEventListener("click", () => { try { localStorage.setItem("dh_pm", pm); } catch {} }); } }
  }
  function drawTip() {
    const q = me() ? pg.nextQuest(user()) : null; if (!q || closed("tip" + q.id)) return tip.classList.add("hidden");
    tip.replaceChildren(h("span", null, `🧭 Next: ${q.text}`), h("small", null, `${q.tip} (+${q.cp} 🥕)`)); const x = h("button", "bn-x", "✕"); x.type = "button"; x.addEventListener("click", () => { closeIt("tip" + q.id); drawTip(); }); tip.append(x); tip.classList.remove("hidden");
  }
  setInterval(drawBanners, 60000);

  /* ---------- Daily centre ---------- */
  const m = modal("🎯 Daily centre", true); let tab = "today", wk = "dash";
  function tabs() { return h("div", "ad-tabs", ...[["today", "Today"], ["path", "Starter path"], ["weekly", "Weekly 🏆"], ["me", "Me"]].map(([k, t]) => btn(t, k === tab ? "" : "btn-secondary", () => { tab = k; render(); }))); }
  function bar(p, txt) { const e = h("div", "pbar", h("i"), h("span", null, txt)); e.firstChild.style.width = Math.min(100, p) + "%"; return e; }
  function render() {
    const b = m.body; b.replaceChildren(); if (!me()) { b.append(h("p", "chat-empty", "Connect your wallet to unlock daily missions, quests and rewards.")); return; }
    b.append(tabs()); const u = user();
    if (tab === "today") {
      const d = eco.dailyStatus(u);
      b.append(h("h3", null, "Daily check-in"), h("div", "quest", h("span", "q-ico", "🔥"), h("div", "q-txt", h("b", null, d.claimed ? `Day ${d.streak} streak – claimed today` : `Day ${d.next}: claim +${d.reward} 🥕${d.coinBonus ? ` and +${d.coinBonus} 🪙` : ""}`), h("small", null, "Miss one day and your streak just pauses. Miss two and it starts again.")),
        (() => { const c = btn(d.claimed ? "Done ✓" : "Claim", d.claimed ? "btn-secondary" : "", () => { const r = eco.claimDaily(u); if (!r.ok) return; audio.sfx("fanfare"); fx.confetti(); fx.banner(`+${r.cp} 🥕`); pg.track(u, "daily_claim", 1, { streak: r.streak }); render(); }); c.disabled = d.claimed; return c; })()));
      const ms = pg.missionsFor(u); b.append(h("h3", null, `Today's missions (${ms.filter((x) => x.done).length}/3)`));
      ms.forEach((x) => b.append(h("div", "quest" + (x.done ? " done" : ""), h("span", "q-ico", x.done ? "✅" : "🎯"), h("div", "q-txt", h("b", null, x.text), h("small", null, `${x.n}/${x.goal} · +${Math.round(x.cp * cfg().missionMult)} 🥕 and ${x.xp} XP`)))));
      b.append(h("small", "modal-desc", `Finish all three for a bonus of +${Math.round(cfg().missionBonus)} 🥕.`));
      const mine = getMyHoles(); b.append(h("h3", null, "Your burrows are making carrots"));
      if (!mine.length) b.append(h("p", "chat-empty", "Buy a burrow and it will produce carrots while you are away."));
      mine.forEach((hl) => { const s = pg.idleStatus(u, hl); b.append(h("div", "quest", h("span", "q-ico", "🥕"), h("div", "q-txt", h("b", null, `${hl.username || "Burrow #" + hl.id}: ${s.amount} / ${s.cap} 🥕`), h("small", null, `${s.rate.toFixed(1)} 🥕 per hour · deeper and nicer burrows make more${s.full ? " · FULL – collect now!" : ""}`)),
        (() => { const c = btn("Collect", s.amount < 1 ? "btn-secondary" : "", () => { const r = pg.collectIdle(u, hl); if (!r.ok) return say(r.err); audio.sfx("buy"); fx.confetti(); say(`+${r.amount} 🥕 collected!`); render(); }); c.disabled = s.amount < 1; return c; })())); });
      const t = pg.treasureToday(); b.append(h("h3", null, "Hidden treasure"));
      b.append(t ? h("div", "quest" + (pg.treasureFound(u) ? " done" : ""), h("span", "q-ico", "💰"), h("div", "q-txt", h("b", null, pg.treasureFound(u) ? "You found today's treasure!" : "Find today's treasure"), h("small", null, pg.treasureFound(u) ? "A new one is hidden tomorrow." : t.clue)),
        !pg.treasureFound(u) ? btn("Show me", "btn-secondary", () => { m.close(); const hl = getHoles().find((x) => x.id === t.hole); if (hl) enterHole(hl, t.floor); }) : null) : h("p", "chat-empty", "No treasure today."));
    } else if (tab === "path") {
      const qs = pg.questState(u), done = qs.filter((q) => q.done).length;
      b.append(h("h3", null, `Starter path ${done}/${qs.length}`), h("small", "modal-desc", "Finish every step for a bonus of +100 🥕 and the title “Explorer”."));
      qs.forEach((q, i) => b.append(h("div", "quest" + (q.done ? " done" : ""), h("span", "q-ico", q.done ? "✅" : String(i + 1)), h("div", "q-txt", h("b", null, q.text), h("small", null, q.done ? "Done" : `${q.tip} · +${q.cp} 🥕`)))));
    } else if (tab === "weekly") {
      b.append(h("p", "modal-desc", `Best result of the week counts. Resets in ${fmtLeft(pg.weekEndsIn())}. Prizes are paid to the top 3 when the week ends.`),
        h("div", "ad-tabs", ...[["dash", "🥕 Carrot Dash"], ["run", "🐰 Carrot Run"]].map(([k, t]) => btn(t, k === wk ? "" : "btn-secondary", () => { wk = k; render(); }))));
      const mr = pg.myRank(u, wk); b.append(h("p", null, mr ? `Your rank: #${mr.rank} of ${mr.of} (best level ${mr.score})` : "You have no result this week yet – play at an arcade machine!"));
      const pz = pg.prizes(wk); b.append(h("small", "modal-desc", "Prizes: " + pz.map((p, i) => `#${i + 1}: ${p.cp} 🥕${p.setId && sets.get(p.setId) ? " + set “" + sets.get(p.setId).name + "”" : ""}${p.title ? " + “" + p.title + "”" : ""}`).join("  ·  ")));
      const t = pg.top(wk, undefined, 10); if (!t.length) b.append(h("p", "chat-empty", "Nobody has played yet. Be the first!"));
      t.forEach((r) => b.append(h("div", "sx-row static" + (r.user === u ? " me" : ""), h("span", "tag", "#" + r.rank), h("span", "nm", `${nameOf(r.user)} · ${pg.tag(r.user).title}`), h("span", "acts", `Level ${r.score}`))));
    } else {
      const p = pg.progressBar(u), us = pg.U(u);
      b.append(h("div", "sx-stats", h("div", "sx-stat", h("small", null, "Level"), h("b", null, p.lv), h("span", null, pg.levelTitle(p.lv))), h("div", "sx-stat", h("small", null, "XP"), h("b", null, us.xp), h("span", null, `${p.into}/${p.need} to next`)), h("div", "sx-stat", h("small", null, "Badges"), h("b", null, `${us.badges.length}/${pg.BADGES.length}`))));
      b.append(bar(p.pct, `${p.pct}%`), h("h3", null, "Badges"), h("small", "modal-desc", "Tap an unlocked badge to show it next to your name."));
      const g = h("div", "badge-grid"); pg.BADGES.forEach((bd) => { const own = us.badges.includes(bd.id), c = h("button", "badge" + (own ? " own" : "") + (us.badge === bd.id ? " on" : ""), h("span", null, bd.icon), h("b", null, bd.name), h("small", null, bd.desc)); c.type = "button"; c.disabled = !own; c.addEventListener("click", () => { pg.setBadge(u, us.badge === bd.id ? "" : bd.id); render(); }); g.append(c); }); b.append(g);
      if (us.titles.length) { b.append(h("h3", null, "Titles")); b.append(h("div", "sx-chips", ...us.titles.map((t) => h("span", "tag", t)))); }
    }
  }
  function open(t = "today") { tab = t; render(); m.open(); }

  /* ---------- inbox ---------- */
  const bm = modal("🔔 Notifications");
  function openBell() {
    const b = bm.body; b.replaceChildren(); if (!me()) b.append(h("p", "chat-empty", "Connect your wallet to get notifications."));
    else { const list = inbox(user()); if (!list.length) b.append(h("p", "chat-empty", "Nothing yet. Missions, gifts, guestbook messages and sales show up here.")); list.slice(0, 40).forEach((n) => b.append(h("div", "quest" + (n.read ? "" : " new"), h("span", "q-ico", ICON[n.kind] || "🔔"), h("div", "q-txt", h("b", null, n.text), h("small", null, new Date(n.ts).toLocaleString()))))); markRead(user()); }
    bm.open(); hud();
  }

  /* ---------- guestbook ---------- */
  const gm = modal("📖 Guestbook", true); let gHole = null, sticker = "";
  function renderGb() {
    const b = gm.body; b.replaceChildren(); const hl = gHole; if (!hl) return;
    b.append(h("p", "modal-desc", `Leave a message or a sticker at ${hl.username || "this burrow"}. The owner is notified.`));
    const input = h("input"); input.type = "text"; input.maxLength = 160; input.placeholder = "Say hi… (no links)"; input.addEventListener("keydown", (e) => e.stopPropagation());
    const row = h("div", "sx-chips", ...pg.STICKERS.map((s) => { const c = h("button", "badge" + (sticker === s ? " on" : ""), s); c.type = "button"; c.style.minWidth = "40px"; c.addEventListener("click", () => { sticker = sticker === s ? "" : s; renderGb(); }); return c; }));
    const err = h("p", "sx-err"); b.append(row, input, err, h("div", "modal-actions", btn("Post", "", () => {
      if (needWallet("sign guestbooks")) return; const r = pg.gbPost(user(), hl, { text: input.value, sticker }); if (!r.ok) { err.textContent = r.err; audio.sfx("error"); return; } sticker = ""; audio.sfx("click"); renderGb(); hud();
    })));
    const list = pg.guestbook(hl.id); if (!list.length) b.append(h("p", "chat-empty", "No messages yet. Be the first!"));
    list.slice(0, 40).forEach((g) => b.append(h("div", "gb-item", h("div", "gb-top", h("b", null, `${pg.tag(g.u).badge} ${g.name}`), h("small", null, `Lv ${pg.level(g.u)} · ${new Date(g.ts).toLocaleDateString()}`)), h("div", "gb-msg", `${g.sticker} ${g.text}`),
      h("div", "gb-act", btn(`👍 ${g.up.length}`, "btn-secondary" + (g.up.includes(user()) ? " on" : ""), () => { if (!needWallet("vote") && pg.gbVote(user(), hl.id, g.id, 1)) renderGb(); }), btn(`👎 ${g.down.length}`, "btn-secondary" + (g.down.includes(user()) ? " on" : ""), () => { if (!needWallet("vote") && pg.gbVote(user(), hl.id, g.id, -1)) renderGb(); }),
        (g.u === user() || hl.owner === user()) ? btn("Delete", "btn-secondary", () => { pg.gbDelete(user(), hl, g.id); renderGb(); }) : null))));
  }
  const openGuestbook = (hl) => { gHole = hl; sticker = ""; renderGb(); gm.open(); };
  net.on((e) => { if (gm.isOpen() && e === "prog" && !gm.body.contains(document.activeElement)) renderGb(); });

  /* ---------- gifts ---------- */
  const gf = modal("🎁 Send a gift");
  function openGift(hl) {
    if (needWallet("send gifts")) return; if (!hl?.owner || hl.owner === user()) return say("Pick another player's burrow to send a gift.");
    const b = gf.body; b.replaceChildren(); const to = hl.owner; b.append(h("p", "modal-desc", `Gift to ${hl.username || short(to)}.`));
    const c = cfg(), amt = h("input"); amt.type = "number"; amt.min = c.giftMin; amt.max = c.giftMax; amt.value = Math.min(20, c.giftMax); amt.addEventListener("keydown", (e) => e.stopPropagation());
    const err = h("p", "sx-err"), mine = eco.wallet(user()).cp;
    b.append(h("h3", null, "Carrots"), h("label", "ad-field", h("span", null, `Amount (${c.giftMin}–${c.giftMax}, you have ${mine} 🥕)`), amt), h("div", "modal-actions", btn("Send carrots", "", () => {
      const r = pg.giftCarrots(user(), to, amt.value); if (!r.ok) { err.textContent = r.err; audio.sfx("error"); return; } audio.sfx("buy"); fx.confetti(); say("Gift sent! 🎁"); gf.close(); hud();
    })), err, h("h3", null, "A character set"));
    const avail = sets.all().filter((s) => s.onSale && !sets.soldOut(s) && !sets.has(to, s.id));
    if (!avail.length) b.append(h("p", "chat-empty", "No set available for this player right now."));
    avail.forEach((s) => b.append(h("div", "sx-row static", h("span", "nm", `${s.name}${s.limit ? " · limited" : ""}`), h("span", "acts", h("span", "set-price " + s.currency, sets.priceText(s)), btn("Gift", "", () => ask({ title: "Gift a set", text: `Pay ${sets.priceText(s)} so ${hl.username || short(to)} receives “${s.name}”?`, label: "Pay & gift" }, () => { const r = pg.giftSet(user(), to, s.id); if (!r.ok) { say(r.err); audio.sfx("error"); return; } audio.sfx("buy"); fx.confetti(); say("Set gifted! 🎁"); gf.close(); })))))); gf.open();
  }

  /* ---------- tour ---------- */
  function tour() {
    const pool = getHoles().filter((x) => !x.deleted && x.owner !== user() && x.depth >= 1);
    if (!pool.length) return say("No burrows to tour yet."); audio.sfx("enter"); pg.track(user(), "tour");
    const score = (x) => 1 + (x.likes || 0) * 2 + (x.visits || 0) * .3 + Math.min(40, x.depth) * .4 + (x.special ? 8 : 0), total = pool.reduce((s, x) => s + score(x), 0); let r = Math.random() * total, pick = pool[0];
    for (const x of pool) { r -= score(x); if (r <= 0) { pick = x; break; } }
    say(`🧭 Tour: ${pick.username || "Burrow #" + pick.id}`); enterHole(pick);
  }
  const tourBtn = btn("🧭 Tour", "btn-secondary tour-fab", () => tour()); tourBtn.title = "Visit a random interesting burrow"; document.body.append(tourBtn);

  /* ---------- the café gives the treasure clue ---------- */
  const clueBtn = btn("📜 Today's clue", "btn-secondary clue-fab", () => {
    const t = pg.treasureToday(), cm = modal("📜 The café's treasure board"), b = cm.body; b.replaceChildren();
    b.append(h("p", null, t ? (pg.treasureFound(user()) ? "You already found today's treasure. Come back tomorrow!" : t.clue) : "No treasure is hidden today."), h("small", "modal-desc", `Finding it pays ${Math.round(cfg().treasureCp)} 🥕. Look for the glowing chest on that floor.`));
    if (t && !pg.treasureFound(user())) b.append(h("div", "modal-actions", btn("Take me there", "", () => { cm.close(); const hl = getHoles().find((x) => x.id === t.hole); if (hl) enterHole(hl, t.floor); })));
    cm.open();
  }); clueBtn.classList.add("hidden"); document.body.append(clueBtn);
  const setCafe = (on) => clueBtn.classList.toggle("hidden", !on);
  net.on((e) => { if (["prog", "inbox", "eco", "sets", "holes"].includes(e)) hud(); });
  /** Toast every new notification as it arrives */
  let seen = new Set(inbox(user()).map((n) => n.id)); net.on((e) => { if (e !== "inbox" || !me()) return; for (const n of inbox(user())) if (!seen.has(n.id)) { seen.add(n.id); say(n.text); } });
  return { setCafe, open, openBell, openGuestbook, openGift, tour, hud, refreshSeen: () => { seen = new Set(inbox(user()).map((n) => n.id)); } };
}

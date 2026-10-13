/** Wallet / inventory, daily reward, Carrot Stand (🥕 -> 🪙), Tool Shop (items -> 🥕) and item pickup. */
import * as eco from "./economy.js?v=14";
import * as net from "./social.js?v=14";
import * as audio from "./audio.js?v=14";
import * as fx from "./fx.js?v=14";
import { fmtSol } from "./pricing.js?v=14";

export function initEconomyUI({ social, session }) {
  const { modal, h, btn, ask, say } = social;
  const walletModal = modal("🎒 My wallet", true), carrotModal = modal("🥕 Carrot Stand"), toolModal = modal("⛏️ Tool Shop");
  const user = () => session.user;
  const needWallet = (what) => { if (session.wallet) return false; say(`Connect your wallet to ${what}.`); audio.sfx("error"); return true; };
  const inviteLink = () => `${location.origin}${location.pathname}?ref=${encodeURIComponent(session.wallet || "")}`;
  const bigStat = (label, value, sub) => h("div", "sx-stat", h("small", null, label), h("b", null, value), sub ? h("span", null, sub) : null);

  /* ---------- top bar ---------- */
  const area = document.querySelector(".top-bar .wallet-area");
  const chip = btn("", "btn-secondary eco-chip", () => openWallet()), dailyBtn = btn("", "btn-secondary daily-btn", () => openWallet());
  chip.title = "My wallet"; dailyBtn.title = "Daily reward"; dailyBtn.append(h("span", "ico", "🎁"), h("i", "dot"));
  area?.prepend(dailyBtn, chip);
  function refresh() {
    const w = eco.wallet(user()), d = eco.dailyStatus(user());
    chip.replaceChildren(h("span", null, `🪙 ${w.coins}`), h("span", null, `🥕 ${w.cp}`));
    dailyBtn.classList.toggle("ready", !d.claimed && !!session.wallet);
    if (walletModal.isOpen() && !(walletModal.body.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))) renderWallet();
  }
  net.on((e) => { if (e === "eco" || e === "change" || e === "sales") refresh(); });

  /* ---------- wallet modal ---------- */
  function renderWallet() {
    const b = walletModal.body; b.replaceChildren();
    const w = eco.wallet(user()), d = eco.dailyStatus(user()), r = eco.rates();
    b.append(h("div", "sx-stats", bigStat("SOL (demo)", fmtSol(net.balance(user()))), bigStat("Coins", `🪙 ${w.coins}`, "Burrow coins"), bigStat("Carrot points", `🥕 ${w.cp}`, `${r.cpPerCoin} 🥕 = 1 🪙`), bigStat("Streak", `🔥 ${w.streak}`, "days in a row")));

    // daily
    b.append(h("h3", null, "Daily reward"));
    const dr = h("div", "quest", h("span", "q-ico", "🎁"), h("div", "q-txt", h("b", null, d.claimed ? "Claimed today" : `Claim +${d.reward} 🥕${d.coinBonus ? ` and +${d.coinBonus} 🪙` : ""}`), h("small", null, `Day ${d.next} of your streak. Come back tomorrow for more.`)));
    dr.append(btn(d.claimed ? "Done ✓" : "Claim", d.claimed ? "btn-secondary" : "", () => {
      if (needWallet("claim your daily reward")) return;
      const res = eco.claimDaily(user()); if (!res.ok) return;
      audio.sfx("fanfare"); fx.confetti(); fx.banner(`+${res.cp} 🥕`); say(`Day ${res.streak}! +${res.cp} carrot points.`); refresh();
    })); dr.lastChild.disabled = d.claimed; b.append(dr);

    // quests
    b.append(h("h3", null, "Earn carrot points 🥕"));
    const link = h("input"); link.type = "text"; link.readOnly = true; link.value = session.wallet ? inviteLink() : "Connect your wallet to get your invite link"; link.addEventListener("keydown", (e) => e.stopPropagation());
    b.append(h("div", "quest", h("span", "q-ico", "🤝"), h("div", "q-txt", h("b", null, `Invite friends: +${eco.REWARDS.invite} 🥕 each, +${eco.REWARDS.inviteBuys} 🥕 when they buy a hole`), h("small", null, `${eco.invitedBy(session.wallet || "")} friends joined with your link`), link),
      btn("Copy", "btn-secondary", () => { if (needWallet("invite friends")) return; navigator.clipboard?.writeText(link.value); say("Invite link copied!"); })));
    const tw = h("input"); tw.type = "text"; tw.placeholder = "https://x.com/you/status/…"; tw.addEventListener("keydown", (e) => e.stopPropagation());
    const myClaim = eco.claims().filter((c) => c.user === user()).sort((a, z) => z.ts - a.ts)[0];
    const tweetText = encodeURIComponent("I'm digging deeper in Deep Holes 🐰⛏️ Join me and get your own burrow! #DeepHoles #Solana"), tweetUrl = encodeURIComponent(location.origin + location.pathname);
    b.append(h("div", "quest", h("span", "q-ico", "🐦"), h("div", "q-txt", h("b", null, `Tweet about the game: +${eco.REWARDS.tweet} 🥕 (once a week)`), h("small", null, myClaim ? `Your last proof: ${myClaim.status}` : "Post a tweet, then paste its link here. An admin will check it."), tw),
      h("div", "q-btns", btn("Tweet", "btn-secondary", () => window.open(`https://twitter.com/intent/tweet?text=${tweetText}&url=${tweetUrl}`, "_blank", "noopener")),
        btn("Submit proof", "", () => { if (needWallet("send a tweet proof")) return; const r2 = eco.submitTweet(user(), tw.value); if (!r2.ok) { say(r2.err); audio.sfx("error"); return; } tw.value = ""; audio.sfx("click"); say("Thanks! An admin will review your tweet."); renderWallet(); }))));
    b.append(h("div", "quest", h("span", "q-ico", "🏠"), h("div", "q-txt", h("b", null, `Buy a hole: +${eco.REWARDS.buyBase} 🥕 and +${eco.REWARDS.buyPerLevel} per level`), h("small", null, "Awarded automatically when you buy."))));
    b.append(h("div", "quest", h("span", "q-ico", "⛏️"), h("div", "q-txt", h("b", null, `Deepen your hole: +${eco.REWARDS.deepenPerLevel} 🥕 per level`), h("small", null, "Awarded automatically."))));
    b.append(h("div", "quest", h("span", "q-ico", "💎"), h("div", "q-txt", h("b", null, "Find rare items"), h("small", null, "Look on the surface and in every layer. Sell them at a Tool Shop (the stall with the ⛏️)."))));

    // inventory
    b.append(h("h3", null, `Bag (${w.items.length}) · today ${w.dayItems}/${r.itemsPerDay} found`));
    const grid = h("div", "bag");
    if (!w.items.length) grid.append(h("p", "chat-empty", "Your bag is empty. Rare items sparkle on the map!"));
    w.items.forEach((it) => grid.append(h("div", "bag-it " + it.rarity, h("span", null, it.icon), h("small", null, it.name), h("i", null, `${eco.itemValue(it)} 🥕`))));
    b.append(grid);
  }
  function openWallet() { renderWallet(); walletModal.open(); }

  /* ---------- carrot stand ---------- */
  function openCarrotStand() {
    const b = carrotModal.body; b.replaceChildren();
    const w = eco.wallet(user()), r = eco.rates(), left = eco.convLeft(user());
    const amt = h("input"); amt.type = "number"; amt.min = r.cpPerCoin; amt.step = r.cpPerCoin; amt.value = Math.min(w.cp, left) >= r.cpPerCoin ? Math.floor(Math.min(w.cp, left) / r.cpPerCoin) * r.cpPerCoin : r.cpPerCoin;
    amt.addEventListener("keydown", (e) => e.stopPropagation());
    const info = h("p", "modal-desc", ""), err = h("p", "sx-err");
    const upd = () => { const n = Math.floor((+amt.value || 0) / r.cpPerCoin); info.textContent = `You get 🪙 ${n} for ${n * r.cpPerCoin} 🥕.`; }; amt.addEventListener("input", upd); upd();
    b.append(h("p", null, "Welcome! I buy carrot points and pay in burrow coins."), h("div", "sx-stats", bigStat("Your carrots", `🥕 ${w.cp}`), bigStat("Rate", `${r.cpPerCoin} 🥕 = 1 🪙`), bigStat("Left today", `🥕 ${left}`, "daily limit")),
      h("label", "ad-field", h("span", null, "Carrot points to sell"), amt), info, err,
      h("div", "modal-actions", btn("Max", "btn-secondary", () => { amt.value = Math.floor(Math.min(w.cp, left) / r.cpPerCoin) * r.cpPerCoin; upd(); }), btn("Sell", "", () => {
        if (needWallet("trade at the stall")) return;
        const n = Math.floor((+amt.value || 0) / r.cpPerCoin), cp = n * r.cpPerCoin;
        if (n < 1) { err.textContent = `Minimum is ${r.cpPerCoin} 🥕.`; return; }
        ask({ title: "Sell carrot points", label: "Sell", text: `Sell ${cp} 🥕 for 🪙 ${n}?` }, () => {
          const res = eco.sellCP(user(), cp);
          if (!res.ok) { carrotModal.body.querySelector(".sx-err").textContent = res.err; audio.sfx("error"); return; }
          audio.sfx("sell"); fx.confetti(innerWidth / 2, innerHeight / 2, 50); say(`Sold ${res.used} 🥕 for 🪙 ${res.coins}.`); carrotModal.close(); refresh();
        });
      })));
    carrotModal.open();
  }

  /* ---------- tool shop ---------- */
  function openToolShop() {
    const b = toolModal.body; b.replaceChildren();
    const w = eco.wallet(user());
    b.append(h("p", null, "Found something shiny? I pay carrot points for rare finds."));
    if (!w.items.length) b.append(h("p", "chat-empty", "Your bag is empty. Look for sparkles on the surface and underground!"));
    else {
      const total = w.items.reduce((s, i) => s + eco.itemValue(i), 0), grid = h("div", "bag");
      w.items.forEach((it) => { const cell = h("button", "bag-it " + it.rarity, h("span", null, it.icon), h("small", null, it.name), h("i", null, `${eco.itemValue(it)} 🥕`)); cell.type = "button";
        cell.addEventListener("click", () => ask({ title: "Sell item", label: "Sell", text: `Sell ${it.name} for ${eco.itemValue(it)} 🥕?` }, () => { const r = eco.sellItems(user(), [it.id]); if (r.ok) { audio.sfx("sell"); say(`+${r.cp} 🥕`); refresh(); openToolShop(); } })); grid.append(cell); });
      b.append(grid, h("div", "modal-actions", btn(`Sell all (${w.items.length} → ${total} 🥕)`, "", () => ask({ title: "Sell everything", label: "Sell all", text: `Sell ${w.items.length} items for ${total} 🥕?` }, () => {
        const r = eco.sellItems(user(), "all"); if (r.ok) { audio.sfx("sell"); fx.confetti(innerWidth / 2, innerHeight / 2, 60); say(`+${r.cp} 🥕`); refresh(); openToolShop(); } }))));
    }
    toolModal.open();
  }

  /* ---------- picking items up on the map ---------- */
  function onItem(it) {
    if (needWallet("collect items")) return;
    const r = eco.collect(user(), it);
    if (!r.ok) { say(r.err); audio.sfx("error"); return; }
    audio.sfx(it.rarity === "common" ? "sparkle" : "rare"); audio.vibrate(40);
    fx.banner(`${it.icon} ${it.name}`); if (it.rarity === "rare" || it.rarity === "epic") fx.confetti(innerWidth / 2, innerHeight / 3, 80);
    say(`${it.rarity[0].toUpperCase() + it.rarity.slice(1)} find! Sell it at a Tool Shop for ${eco.itemValue(it)} 🥕.`); refresh();
  }

  /* ---------- invites: remember ?ref= and reward the friend when this player connects a wallet ---------- */
  try { const ref = new URLSearchParams(location.search).get("ref"); if (ref) localStorage.setItem("dh:ref", ref); } catch { /* ignore */ }
  function onWalletConnected(address) {
    try {
      const ref = localStorage.getItem("dh:ref");
      if (ref && address && eco.referral(ref, address)) say("Welcome! Your friend just earned carrot points for inviting you. 🥕");
      localStorage.removeItem("dh:ref");
    } catch { /* ignore */ }
    refresh();
  }
  refresh();
  return { openWallet, openCarrotStand, openToolShop, onItem, onWalletConnected, refresh, isCollected: (id) => eco.hasCollected(user(), id) };
}

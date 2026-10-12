/** Public profile, share link (?hole=ID) and the picture card you can post on X. */
import { drawEntrance } from "./map.js?v=13";
import { drawRabbitPreview } from "./room.js?v=13";
import { getImage, floorCount, MAX_DEPTH } from "./data.js?v=13";
import * as net from "./social.js?v=13";
import * as audio from "./audio.js?v=13";
import { lookFor } from "./world.js?v=13";

export function initShare({ social, getHoles, session, enterHole, goToHole }) {
  const { modal, h, btn, say } = social;
  const cardModal = modal("🔗 Share this hole", true), profileModal = modal("");
  const linkFor = (hole) => `${location.origin}${location.pathname}?hole=${hole.id}`;

  function drawCard(hole, withAvatar) {
    const c = document.createElement("canvas"); c.width = 1200; c.height = 630; const g = c.getContext("2d");
    const bg = g.createLinearGradient(0, 0, 1200, 630); bg.addColorStop(0, "#3b0764"); bg.addColorStop(.55, "#7c3aed"); bg.addColorStop(1, "#db2777"); g.fillStyle = bg; g.fillRect(0, 0, 1200, 630);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${.15 + (i % 5) * .08})`; g.beginPath(); g.arc((i * 193) % 1200, (i * 97) % 630, 1 + (i % 3), 0, 6.3); g.fill(); }
    // scene
    g.save(); g.beginPath(); g.roundRect(60, 60, 500, 510, 32); g.clip();
    const sky = g.createLinearGradient(0, 60, 0, 570); sky.addColorStop(0, "#38bdf8"); sky.addColorStop(.6, "#bae6fd"); sky.addColorStop(1, "#fbcfe8"); g.fillStyle = sky; g.fillRect(60, 60, 500, 510);
    g.fillStyle = "#4ade80"; g.fillRect(60, 400, 500, 18); g.fillStyle = "#8a5a2b"; g.fillRect(60, 418, 500, 152); g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(60, 480, 500, 90);
    g.save(); g.translate(310, 410); g.scale(2.4, 2.4); drawEntrance(g, hole.style || 0, 0, 0, 0); g.restore();
    const look = lookFor(hole.owner, hole.customRabbit, hole.special), tmp = document.createElement("canvas"); tmp.width = 240; tmp.height = 270;
    drawRabbitPreview(tmp, { color: look.color, earColor: look.ear, acc: look.acc }); g.drawImage(tmp, 215, 170, 190, 214);
    g.restore();
    // info
    const x = 620;
    g.fillStyle = "rgba(255,255,255,.2)"; g.beginPath(); g.roundRect(x, 60, 250, 44, 22); g.fill(); g.fillStyle = "#fff"; g.font = "bold 24px system-ui"; g.textBaseline = "middle"; g.fillText("🐰 Deep Holes", x + 20, 83);
    const img = withAvatar ? getImage(hole.image) : null;
    g.save(); g.beginPath(); g.arc(x + 62, 200, 62, 0, 6.3); g.clip();
    if (img?.complete && img.naturalWidth) { const s = Math.max(124 / img.naturalWidth, 124 / img.naturalHeight); g.drawImage(img, x + 62 - img.naturalWidth * s / 2, 200 - img.naturalHeight * s / 2, img.naturalWidth * s, img.naturalHeight * s); }
    else { g.fillStyle = hole.customRabbit?.color || "#a855f7"; g.fillRect(x, 138, 124, 124); g.font = "70px system-ui"; g.textAlign = "center"; g.fillText("🐰", x + 62, 204); g.textAlign = "left"; }
    g.restore(); g.strokeStyle = "#fff"; g.lineWidth = 5; g.beginPath(); g.arc(x + 62, 200, 62, 0, 6.3); g.stroke();
    g.fillStyle = "#fff"; g.font = "bold 62px system-ui"; g.textBaseline = "alphabetic"; g.fillText(((hole.special ? "★ " : "") + (hole.username || "Hole " + hole.id)).slice(0, 15), x + 150, 190);
    g.font = "32px system-ui"; g.fillStyle = "#fbcfe8"; g.fillText(`Depth ${hole.depth} of ${MAX_DEPTH} · ${floorCount(hole.depth)} floors`, x + 150, 238);
    const st = net.holeStats(hole.id);
    [[`❤ ${st.likes}`, "likes"], [`👁 ${st.visits}`, "visits"]].forEach(([v, l], i) => { const bx = x + i * 200; g.fillStyle = "rgba(255,255,255,.18)"; g.beginPath(); g.roundRect(bx, 300, 180, 100, 22); g.fill(); g.fillStyle = "#fff"; g.font = "bold 42px system-ui"; g.fillText(v, bx + 24, 355); g.font = "22px system-ui"; g.fillStyle = "#fbcfe8"; g.fillText(l, bx + 24, 386); });
    g.fillStyle = "#fff"; g.font = "bold 38px system-ui"; g.fillText("Dig your own burrow!", x, 480); g.font = "26px system-ui"; g.fillStyle = "#fbcfe8"; g.fillText((location.host + location.pathname).replace(/\/$/, "").slice(0, 36), x, 524);
    g.fillStyle = "#fff"; g.font = "22px system-ui"; g.fillText("#DeepHoles  #Solana", x, 566);
    return c;
  }
  function makeCard(hole) {
    let c = drawCard(hole, true);
    try { c.toDataURL(); } catch { c = drawCard(hole, false); }          // a picture from another site taints the canvas: draw without it
    return c;
  }

  function openShare(hole) {
    const b = cardModal.body; b.replaceChildren();
    const c = makeCard(hole), link = linkFor(hole), text = `Check out ${hole.username || "this"} burrow in Deep Holes: depth ${hole.depth}! 🐰⛏️`;
    c.className = "share-card";
    const input = h("input"); input.type = "text"; input.readOnly = true; input.value = link; input.addEventListener("keydown", (e) => e.stopPropagation());
    const row = h("div", "modal-actions",
      btn("⬇ Download card", "btn-secondary", () => { const a = document.createElement("a"); a.download = `deep-holes-${hole.id}.png`; a.href = c.toDataURL("image/png"); a.click(); }),
      btn("𝕏 Post", "", () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text + " #DeepHoles #Solana")}&url=${encodeURIComponent(link)}`, "_blank", "noopener")));
    if (navigator.share) row.append(btn("📤 Share…", "btn-secondary", async () => {
      try { const blob = await new Promise((r) => c.toBlob(r, "image/png")), file = new File([blob], "deep-holes.png", { type: "image/png" });
        await navigator.share(navigator.canShare?.({ files: [file] }) ? { title: "Deep Holes", text, url: link, files: [file] } : { title: "Deep Holes", text, url: link }); } catch { /* cancelled */ }
    }));
    b.append(c, h("div", "sx-chips", input, btn("Copy link", "btn-secondary", () => { navigator.clipboard?.writeText(link); say("Link copied!"); audio.sfx("click"); })), row);
    cardModal.open();
  }

  function openProfile(hole) {
    const b = profileModal.body, st = net.holeStats(hole.id), online = social.isOnline(hole.owner), l = net.activeListing(hole); b.replaceChildren();
    profileModal.heading.textContent = (hole.special ? "★ " : "") + (hole.username || "Hole " + hole.id);
    const av = h("div", "npc-av"); if (hole.image) av.style.backgroundImage = `url("${hole.image.replace(/"/g, "%22")}")`; else av.style.background = hole.customRabbit?.color || "#a855f7";
    const cell = (k, v) => h("div", "sx-stat", h("small", null, k), h("b", null, v));
    b.append(h("div", "npc-top", av, h("div", null, h("div", "npc-status" + (online ? " on" : ""), online ? "● Online" : "○ Offline"), h("div", "npc-say", hole.description || "A burrow in Deep Holes."))),
      h("div", "sx-stats", cell("Depth", `${hole.depth} / ${MAX_DEPTH}`), cell("Floors", String(floorCount(hole.depth))), cell("Likes", String(st.likes)), cell("Visits", String(st.visits)), cell("Slot", String(hole.x + 1)), cell("Status", net.partyActive(hole) ? "🎉 Party" : l ? "For sale" : "Home")),
      h("div", "modal-actions", btn("🚪 Visit", "", () => { profileModal.close(); enterHole(hole); }), btn("📍 Show on map", "btn-secondary", () => { profileModal.close(); goToHole(hole); }), btn("🔗 Share", "btn-secondary", () => { profileModal.close(); openShare(hole); })));
    profileModal.open();
  }

  /** ?hole=ID in the address opens that hole's profile. */
  function handleDeepLink() {
    const id = +(new URLSearchParams(location.search).get("hole") || 0), hole = getHoles().find((x) => x.id === id);
    if (hole) { goToHole(hole); setTimeout(() => openProfile(hole), 400); }
  }
  return { openShare, openProfile, handleDeepLink, linkFor };
}

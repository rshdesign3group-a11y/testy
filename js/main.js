/**
 * Deep Holes – Main
 */

import {
  getAllHoles, addHole as _addHole, updateHole as _updateHole, deepenHole as _deepenHole, getMyMaxDepth, session, GUEST_USER,
  floorCount, getGallery, setGallery as _setGallery, SLOTS, transferHole, removeHole, MAX_DEPTH, upsertHole
} from "./data.js?v=14";
import { lookFor, HOLE_STYLES, rollLook, CAFE_DEPTH, slotX, LOOK_PARTS, discoverParts } from "./world.js?v=14";
import { initSocial } from "./social-ui.js?v=14";
import { primaryPriceSol, deepenPriceSol, fmtSol } from "./pricing.js?v=14";
import { MapRenderer, drawEntrance, SURF } from "./map.js?v=14";
import { RoomRenderer, drawRabbitPreview } from "./room.js?v=14";
import { initCafe } from "./cafe.js?v=14";
import { initJoystick } from "./joystick.js?v=14";
import { initUI, initViewport } from "./ui.js?v=14";
import { S, onSettings, initSettings } from "./settings.js?v=14";
import * as audio from "./audio.js?v=14";
import * as fx from "./fx.js?v=14";
import * as eco from "./economy.js?v=14";
import * as net from "./social.js?v=14";
import { initEconomyUI } from "./economy-ui.js?v=14";
import { initHoleUI } from "./hole-ui.js?v=14";
import { initShare } from "./share.js?v=14";
import { initSetsUI } from "./sets-ui.js?v=14";
import * as sets from "./sets.js?v=14";
import { initRabbitCoin } from "./rcoin.js?v=14";
import { art as _preloadArt, partArt } from "./assets.js?v=14";

/* ---------- holes made by players are shared between tabs through the net layer ---------- */
const DEMO_IDS = new Set([1, 2, 3, 4, 5]);
const cleanHole = (h) => { const o = JSON.parse(JSON.stringify(h)); for (const k of Object.keys(o)) if (k.startsWith("_")) delete o[k]; return o; };
const pushHoles = () => net.pushHoles(getAllHoles().filter((h) => !DEMO_IDS.has(h.id)).map(cleanHole));
function pullHoles() {
  const gone = net.overrides();
  for (const r of net.sharedHoles()) if (!gone[r.id]?.deleted) upsertHole(r);
}
const addHole = (o) => { pullHoles(); const h = _addHole(o); pushHoles(); return h; };
const updateHole = (...a) => { const r = _updateHole(...a); pushHoles(); return r; };
const deepenHole = (...a) => { const r = _deepenHole(...a); pushHoles(); return r; };
const setGallery = (...a) => { const r = _setGallery(...a); pushHoles(); return r; };
pullHoles();

initViewport();
initRabbitCoin();                                        // 🪙 -> hand-drawn rabbit coin
_preloadArt("room-rabbit");
discoverParts().then(() => {                              // hats/glasses/... found in assets/room/rabbit/<category>/
  for (const [cat, names] of Object.entries(LOOK_PARTS)) names.forEach((n) => partArt(cat, n));   // preload so the roll preview shows them at once
});                              // start loading the white rabbit sheet so the character roll preview can recolour it                                         // real viewport height on phones
initSettings();                                         // ⚙ button + panel
const applyJoy = () => { document.body.dataset.joy = S.joystickSide; document.documentElement.style.setProperty("--joy-s", String(0.8 + S.joystickSize * 0.6)); };
onSettings(applyJoy); applyJoy();
import { checkFile, checkImageUrl, safeLink, MAX_LINKS } from "./media.js?v=14";
import { fetchWalletNFTs } from "./nft.js?v=14";

const $ = (id) => document.getElementById(id);

// DOM
const mapScreen = $("map-screen");
const roomScreen = $("room-screen");
const mapCanvas = $("map-canvas");
const roomCanvas = $("room-canvas");
const backBtn = $("back-to-map-btn");
const roomTitle = $("room-title");
const roomDepthBadge = $("room-depth-badge");
const roomImage = $("room-image");
const roomDescription = $("room-description");
const roomLinks = $("room-links");
const emptyState = $("empty-state");
const buyFirstBtn = $("buy-first-hole-btn");
const buyHoleBtn = $("buy-hole-btn");
const ownerPanelBtn = $("owner-panel-btn"), setsBtn = $("sets-btn");

// Modals
const buyModal = $("buy-modal");
const depthSlider = $("depth-slider");
const depthValue = $("depth-value");
const costDisplay = $("cost-display");
const cancelBuyBtn = $("cancel-buy-btn");
const confirmBuyBtn = $("confirm-buy-btn");

const ownerModal = $("owner-modal");
const editDescription = $("edit-description");
const editImage = $("edit-image");
const editLinks = $("edit-links");
const editCurrentDepth = $("edit-current-depth");
const buyUsername = $("buy-username");
const buyImageFile = $("buy-image");
const editUsername = $("edit-username");
const editImageFile = $("edit-image-file");
const deepenBtn = $("deepen-btn");
const cancelEditBtn = $("cancel-edit-btn");
const saveEditBtn = $("save-edit-btn");

let currentHole = null;
let isOwner = false;
let pendingBuyImage = null;
let pendingEditImage = null;

/* ---------- helpers ---------- */
function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.append(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 4000);
}
// only http(s) links are allowed (no javascript: URLs)
function safeUrl(u) {
  try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; }
}

function readFile(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => resolve(null);
    r.readAsDataURL(file);
  });
}
function loadImg(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
// Crop to a square and shrink to 256px so the profile picture is light enough to store
async function fileToAvatar(file) {
  const src = await readFile(file); if (!src) return null;
  const img = await loadImg(src); if (!img) return null;
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const s = Math.min(img.width, img.height);
  c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
  return c.toDataURL("image/jpeg", 0.85);
}
// Keep the aspect ratio, longest side max 720px (wall pictures)
async function fileToPicture(file) {
  const src = await readFile(file); if (!src) return null;
  const img = await loadImg(src); if (!img) return null;
  const k = Math.min(1, 720 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}

// pictures only: PNG/JPG/WebP/GIF, max 3 MB (see media.js)
async function pickAvatar(input) {
  const f = input.files[0]; if (!f) return null;
  const err = checkFile(f); if (err) { toast(err); input.value = ""; return null; }
  const url = await fileToAvatar(f); if (!url) { toast("That file could not be read as a picture."); input.value = ""; }
  return url;
}
buyImageFile.addEventListener("change", async () => { pendingBuyImage = await pickAvatar(buyImageFile); });
editImageFile.addEventListener("change", async () => { pendingEditImage = await pickAvatar(editImageFile); });

/* ---------- picture viewer (cute frame) ---------- */
const lightbox = $("lightbox");
const lbImg = $("lb-img");
const lbCaption = $("lb-caption");

function openLightbox({ item, floor, slot }) {
  lbImg.onerror = () => { lbCaption.textContent = "Couldn't load this picture"; };
  lbImg.src = item.url;
  const side = slot < 3 ? "left wall" : "right wall";
  lbCaption.textContent = item.title || `Floor ${floor + 1} · ${side}`;
  lbImg.alt = lbCaption.textContent;
  lightbox.classList.remove("hidden");
  $("lb-close").focus();
}
function closeLightbox() { lightbox.classList.add("hidden"); lbImg.removeAttribute("src"); }
$("lb-close").addEventListener("click", closeLightbox);
lightbox.addEventListener("pointerdown", (e) => { if (e.target === lightbox) closeLightbox(); });
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!lightbox.classList.contains("hidden")) closeLightbox();
  else if (!$("nft-modal").classList.contains("hidden")) closeNftPicker();
});

/* ---------- renderers ---------- */
let social = null, ecoUI = null, share = null, setsUI = null, holeUI = null, homeReady = false;                                   // created below (needs the renderers)
// the admin sees every layer; everyone else only down to the layer of their own deepest hole
const mapRenderer = new MapRenderer(mapCanvas, getAllHoles(), onHoleClick, () => (social?.isAdmin() ? MAX_DEPTH : getMyMaxDepth()));
mapRenderer.owner = session.user;
// you always walk into a burrow with YOUR OWN character
function myLook() {
  const mine = getAllHoles().find((x) => x.owner === session.user);
  return lookFor(session.wallet || session.user, mine?.customRabbit, !!mine?.special);
}
const roomRenderer = new RoomRenderer(roomCanvas, {
  onNpc: (hole) => social?.openNpc(hole),
  getLook: () => myLook(),
  isOnline: (id) => !!social?.isOnline(id),
  onFrame: (info) => {
    if (info.item) openLightbox(info);
    else if (isOwner) openOwnerPanel(info.floor, info.slot);   // empty frame -> edit that frame
  }
});

/* ---------- chat / market / leaderboard ---------- */
function applyOverride(id, o) {                        // admin edits (stored in the net layer, replayed on load)
  if (o.deleted) return removeHole(id);
  const { deleted, ...rest } = o;
  return updateHole(id, rest);
}
social = initSocial({
  getHoles: getAllHoles,
  session,
  transfer: transferHole,
  applyOverride,
  onSound: audio.sfx,
  onRefresh: () => homeReady && refreshHome(),
  onShop: (k) => (k === "carrot" ? ecoUI?.openCarrotStand() : ecoUI?.openToolShop()),
  onProfile: (h) => share?.openProfile(h),
  goToHole: (hole) => { currentHole = hole; showMap(); },   // jump to a hole on the map
  onOwnership: () => {                                      // a sale changed who owns what / someone else changed a hole
    pullHoles();
    mapRenderer.holes = getAllHoles(); mapRenderer.clamp();
    if (roomScreen.classList.contains("active") && currentHole) {
      const now = currentHole.owner === session.user;
      ownerPanelBtn.classList.toggle("hidden", !now); setsBtn.classList.toggle("hidden", !now);
      if (now !== isOwner) { isOwner = now; roomRenderer.enter(currentHole, isOwner, roomRenderer.floor); }
      social.updateTrade(currentHole, isOwner);
    }
  }
});

const cafe = initCafe({ canvas: roomCanvas, getLook: () => myLook(), onReport: (m, scope) => social.openReport(m, scope) });
initJoystick($("room-screen"), () => [roomRenderer, cafe.renderer]);   // touch movement for burrows and the café
initUI();                                                              // welcome card + help button
let cafeAt = null;
ecoUI = initEconomyUI({ social, session });
mapRenderer.isCollected = ecoUI.isCollected; mapRenderer.onItem = ecoUI.onItem;
setsUI = initSetsUI({ social, session, getMyHoles: () => myHoles(), applyLook });
share = initShare({ onSets: () => setsUI.open(), social, getHoles: getAllHoles, session, enterHole: (h) => onHoleClick(h), goToHole: (h) => { currentHole = h; showMap(); } });
holeUI = initHoleUI({ social, session, room: roomRenderer, updateHole, share });
roomRenderer.onParty = (ev) => {
  if (ev === "join") { cafe.attach(roomRenderer); audio.sfx("party"); toast("🎉 You joined the party! Chat is open."); }
  else if (ev === "leave") cafe.detach();
  else if (ev === "full") toast("The party is full right now.");
};

/* "My hole" shortcut (the rest of the world you have to find yourself) */
const homeBtn = document.createElement("button");
homeBtn.type = "button"; homeBtn.className = "btn btn-secondary btn-small hidden"; homeBtn.title = "Go to my hole";
homeBtn.innerHTML = '<span class="ico">🏠</span><span class="lbl"> My hole</span>';
document.querySelector(".top-bar .wallet-area")?.prepend(homeBtn); homeReady = true;
const myHoles = () => getAllHoles().filter((x) => x.owner === session.user);
/** The worn set is kept in the net layer; re-apply it after a reload (the demo/founder holes are not saved with the other holes). */
function reapplyEquipped() { const id = sets.equippedId(session.user); if (id) applyLook(sets.lookPatch(session.user, id)); }
/** A bought set is applied to every hole of the player, so the rabbit looks the same everywhere (map, burrow, café, share card). */
function applyLook(patch) {
  if (!patch) return;
  for (const hl of myHoles()) updateHole(hl.id, { customRabbit: { ...hl.customRabbit, ...(patch.body ? { color: patch.body.color, earColor: patch.body.ear } : {}), parts: patch.parts || {} } });
  mapRenderer.holes = getAllHoles();
  if (currentHole && roomScreen.classList.contains("active")) roomRenderer.enter(currentHole, isOwner, roomRenderer.floor);
}
function refreshHome() { homeBtn.classList.toggle("hidden", !myHoles().length); }
homeBtn.addEventListener("click", () => {
  const mine = myHoles(); if (!mine.length) return;
  const h = mine.reduce((a, b) => (b.depth > a.depth ? b : a)); currentHole = h; cafeAt = null; audio.sfx("click");
  if (roomScreen.classList.contains("active")) showMap(); else mapRenderer.centerOn(h);
  mapRenderer.pulse(h);
});
function enterCafe(hit) {
  if (!(social.isAdmin() || getMyMaxDepth() >= CAFE_DEPTH)) return toast(`Dig your hole down to depth ${CAFE_DEPTH} to enter the café.`);
  cafeAt = hit; audio.sfx("enter");
  mapRenderer.setActive(false); mapScreen.classList.remove("active"); roomScreen.classList.add("active");
  roomTitle.textContent = `☕ Underground Café #${hit.n + 1}`; roomDepthBadge.textContent = `Depth ${CAFE_DEPTH}`;
  $("room-info").classList.add("hidden"); ownerPanelBtn.classList.add("hidden"); setsBtn.classList.add("hidden"); social.updateTrade(null, false);
  setTimeout(() => cafe.open(hit.n), 50);
}
mapRenderer.onCafe = (hit) => fx.iris(innerWidth / 2, innerHeight / 2, () => enterCafe(hit));
mapRenderer.getAd = social.getAd;                       // billboards (admin-editable)
mapRenderer.onGap = (hit) => social.openGap(hit);

/* ---------- hole style picker (previews drawn with the same code as the map) ---------- */
let pendingStyle = 0, editStyle = 0;
let pendingLook = rollLook();                            // your character: roll as often as you like, but only while creating the hole
const drawLook = () => drawRabbitPreview($("char-preview"), pendingLook);
$("char-roll").addEventListener("click", () => { pendingLook = rollLook(); drawLook(); });
function buildStylePicker(box, selected, onPick, allowSpecial = false) {
  box.replaceChildren();
  HOLE_STYLES.forEach((name, i) => {
    if (i === 6 && !allowSpecial) return;
    const b = document.createElement("button"); b.type = "button"; b.className = "style-opt" + (i === selected ? " on" : "");
    const c = document.createElement("canvas"); c.width = 240; c.height = 150;
    const x = c.getContext("2d"); x.scale(2, 2);
    const g = x.createLinearGradient(0, 0, 0, 75); g.addColorStop(0, "#38bdf8"); g.addColorStop(1, "#bae6fd");
    x.fillStyle = g; x.fillRect(0, 0, 120, 75); x.fillStyle = "#4ade80"; x.fillRect(0, 56, 120, 6); x.fillStyle = "#8a5a2b"; x.fillRect(0, 62, 120, 13);
    drawEntrance(x, i, 60, 58, 0);
    const label = document.createElement("span"); label.textContent = name;
    b.append(c, label);
    b.addEventListener("click", () => { onPick(i); buildStylePicker(box, i, onPick, allowSpecial); });
    box.appendChild(b);
  });
}

/* ---------- events ---------- */
backBtn.addEventListener("click", () => { audio.sfx("exit"); fx.iris(innerWidth / 2, innerHeight / 2, showMap); });

buyFirstBtn.addEventListener("click", () => openBuyModal());
buyHoleBtn.addEventListener("click", () => openBuyModal());

depthSlider.addEventListener("input", () => {
  const d = parseInt(depthSlider.value, 10);
  depthValue.textContent = d;
  costDisplay.textContent = `$${d * 4} (${fmtSol(primaryPriceSol(d))})`;
});

cancelBuyBtn.addEventListener("click", () => buyModal.classList.add("hidden"));
confirmBuyBtn.addEventListener("click", async () => {
  if (!session.wallet) { toast("Connect your wallet to buy a hole."); audio.sfx("error"); return; }
  if (social.isBanned()) return alert("Your account is banned.");
  const depth = parseInt(depthSlider.value, 10);
  const cost = primaryPriceSol(depth);
  if (!social.afford(cost)) { alert(`Not enough balance. This hole costs ${fmtSol(cost)}.`); return; }
  buyModal.classList.add("hidden");
  await fx.dig("Digging your new burrow…", 1500);
  const hole = addHole({
    depth,
    description: `A new hole starting at depth ${depth}.`,
    username: buyUsername.value.trim() || undefined,
    image: pendingBuyImage,
    style: pendingStyle,
    customRabbit: pendingLook,                          // fixed from now on
    owner: session.user
  });
  social.primarySale(hole, cost);            // charged + counted in the leaderboard totals
  const cp = eco.rewardBuy(session.user, depth); eco.referralBought(session.user);   // 🥕 for buying; the friend who invited you gets a bonus
  updateEmptyState();
  mapRenderer.setHoles(getAllHoles());
  mapRenderer.focusHole(hole); mapRenderer.pulse(hole); social.refreshIdentity(); refreshHome();
  audio.sfx("buy"); audio.vibrate([40, 30, 60]); fx.confetti(); fx.banner("Welcome home! 🐰"); if (cp) toast(`+${cp} 🥕 carrot points for your new burrow!`);
});
let deepening = false;
deepenBtn.addEventListener("click", async () => {
  if (deepening || !currentHole || currentHole.depth >= MAX_DEPTH) return;
  // full checks before any money moves: wallet, ban, ownership, price, balance
  if (!session.wallet) { toast("Connect your wallet to dig deeper."); audio.sfx("error"); return; }
  if (social.isBanned()) { toast("Your account is banned."); audio.sfx("error"); return; }
  if (currentHole.owner !== session.user) { toast("Only the owner can deepen this hole."); audio.sfx("error"); return; }
  const cost = deepenPriceSol(1);
  if (!Number.isFinite(cost) || cost <= 0) return;
  const have = net.balance(session.user);
  if (!social.afford(cost) || have < cost) { toast(`Not enough balance. Digging one level costs ${fmtSol(cost)} and you have ${fmtSol(have)}.`); audio.sfx("error"); return; }
  deepening = true; deepenBtn.disabled = true;
  try {
  if (!net.spendSol(session.user, cost)) { toast("Payment failed. Nothing was charged."); audio.sfx("error"); return; }   // the SOL leaves the account here
  const before = currentHole.depth, floorsBefore = floorCount(before);
  await fx.dig("Digging deeper…", 1300);
  deepenHole(currentHole.id);
  net.logEvent("deepen", currentHole.id, session.user, 1); net.store.commit("stats");
  const cp = eco.rewardDeepen(session.user, 1);
  audio.sfx("deepen"); audio.vibrate([30, 20, 50]); fx.shake(); fx.confetti(innerWidth / 2, innerHeight * .45, 60); fx.banner(`Depth ${currentHole.depth}`); mapRenderer.pulse(currentHole);
  if (floorCount(currentHole.depth) > floorsBefore) setTimeout(() => { fx.banner("New floor unlocked! 🪜"); audio.sfx("rare"); }, 900);
  toast(`−${fmtSol(cost)} for digging deeper${cp ? ` · +${cp} 🥕` : ""}`);
  social.refreshIdentity(); refreshHome();
  editCurrentDepth.textContent = currentHole.depth;
  roomDepthBadge.textContent = `Depth ${currentHole.depth}`;
  for (let f = 0; f < floorCount(currentHole.depth); f++) if (!draft[f]) draft[f] = getGallery(currentHole, f);   // new floor -> new frames
  renderGalleryEditor();
  roomRenderer.enter(currentHole, isOwner, roomRenderer.floor);   // rebuild room, keep the current floor
  mapRenderer.holes = getAllHoles();
  console.log("Deepened to", currentHole.depth);
  } finally { deepening = false; deepenBtn.disabled = currentHole.depth >= MAX_DEPTH; deepenBtn.textContent = deepenLabel(); }
});
function deepenLabel() { return currentHole && currentHole.depth >= MAX_DEPTH ? `Maximum depth (${MAX_DEPTH})` : `Deepen +1 level (${fmtSol(deepenPriceSol(1))} ≈ $4)`; }

/* ---------- core ---------- */
async function onHoleClick(hole) {
  currentHole = hole;
  isOwner = hole.owner === session.user;
  const r = mapCanvas.getBoundingClientRect();                         // the iris closes on the hole you clicked
  const x = r.left + slotX(hole.x) - mapRenderer.camX, y = r.top + SURF - mapRenderer.camY;
  audio.sfx("enter"); audio.vibrate(25);
  await fx.iris(Number.isFinite(x) ? x : innerWidth / 2, Number.isFinite(y) ? y : innerHeight / 2, () => showRoom(hole, isOwner));
}

function showMap() {
  holeUI?.hide();
  roomRenderer.leave();
  cafe.leave();
  closeLightbox();
  roomScreen.classList.remove("active");
  mapScreen.classList.add("active");
  mapRenderer.holes = getAllHoles();
  mapRenderer.setActive(true);                      // after the screen is visible, so the canvas gets its real size
  if (cafeAt) { mapRenderer.focusWorld(cafeAt.x + cafeAt.w / 2, cafeAt.y + cafeAt.h / 2); cafeAt = null; }   // back from the café: stand where its door is
  else if (currentHole) mapRenderer.centerOn(currentHole); // come back exactly where we left: on this hole
  updateEmptyState();
}

function fillRoomHeader(hole) {
  roomTitle.textContent = hole.username || `Hole #${hole.id}`;
  roomDepthBadge.textContent = `Depth ${hole.depth}`;
  if (hole.image) roomImage.src = hole.image; else roomImage.removeAttribute("src");
  roomImage.onerror = () => { roomImage.removeAttribute("src"); };
  roomDescription.textContent = hole.description || "No description yet.";
  roomLinks.innerHTML = "";
  (hole.links || []).forEach(link => {
    const href = safeUrl(link.url); if (!href) return;
    const a = document.createElement("a");
    a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = link.label;
    roomLinks.appendChild(a);
  });
}

function showRoom(hole, owner) {
  $("room-info").classList.remove("hidden");
  mapRenderer.setActive(false);
  mapScreen.classList.remove("active");
  roomScreen.classList.add("active");
  fillRoomHeader(hole);
  ownerPanelBtn.classList.toggle("hidden", !owner); setsBtn.classList.toggle("hidden", !owner);   // owner button only for owned holes
  social.recordVisit(hole);
  social.updateTrade(hole, owner);
  holeUI?.setup(hole, owner);
  // Small delay to ensure canvas is visible before starting
  setTimeout(() => { roomRenderer.enter(hole, owner); }, 50);
}

function updateEmptyState() {
  emptyState.classList.toggle("hidden", getAllHoles().length > 0);
}

function openBuyModal() {
  pendingBuyImage = null; buyImageFile.value = ""; buyUsername.value = "";
  pendingStyle = 0; buildStylePicker($("buy-styles"), 0, (i) => (pendingStyle = i));
  const mine0 = myHoles()[0];
  pendingLook = mine0 ? { ...mine0.customRabbit } : rollLook();         // players who already have a rabbit keep it – the only way to change it is a set
  $("char-roll").classList.toggle("hidden", !!mine0);
  depthSlider.value = 1;
  depthValue.textContent = "1";
  costDisplay.textContent = `$4 (${fmtSol(primaryPriceSol(1))})`;
  buyModal.classList.remove("hidden");
  drawLook();
}

/* ---------- edit hole + wall pictures ---------- */
let draft = {};          // { floor: [item|null x6] } edited but not saved yet
let draftFloor = 0;
let flashSlot = -1;

const SLOT_NAMES = ["Left wall · 1", "Left wall · 2", "Left wall · 3", "Right wall · 1", "Right wall · 2 (shows your profile picture when empty)", "Right wall · 3"];

function openOwnerPanel(floor = 0, slot = -1) {
  if (!currentHole) return;
  editDescription.value = currentHole.description || "";
  pendingEditImage = null; editImageFile.value = "";
  editUsername.value = currentHole.username || "";
  editImage.value = currentHole.image?.startsWith("data:") ? "" : currentHole.image || "";
  editLinks.value = (currentHole.links || []).map(l => `${l.label}|${l.url}`).join("\n");
  editCurrentDepth.textContent = currentHole.depth;
  deepenBtn.disabled = currentHole.depth >= MAX_DEPTH;
  deepenBtn.textContent = deepenLabel();
  editStyle = currentHole.style || 0; buildStylePicker($("edit-styles"), editStyle, (i) => (editStyle = i), !!currentHole.special);
  draft = {};
  for (let f = 0; f < floorCount(currentHole.depth); f++) draft[f] = getGallery(currentHole, f).map(it => (it ? { ...it } : null));
  draftFloor = Math.min(floor, floorCount(currentHole.depth) - 1);
  flashSlot = slot;
  renderGalleryEditor();
  ownerModal.classList.remove("hidden");
  if (slot >= 0) requestAnimationFrame(() => document.querySelector(".slot-row.flash")?.scrollIntoView({ block: "center" }));
}

function renderGalleryEditor() {
  const tabs = $("gallery-floors"), box = $("gallery-slots");
  tabs.innerHTML = ""; box.innerHTML = "";
  const floors = floorCount(currentHole.depth);
  for (let f = 0; f < floors; f++) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = `Floor ${f + 1}`; b.className = f === draftFloor ? "on" : "";
    b.addEventListener("click", () => { draftFloor = f; flashSlot = -1; renderGalleryEditor(); });
    tabs.appendChild(b);
  }
  [["Left wall", 0], ["Right wall", 3]].forEach(([title, from]) => {
    const group = document.createElement("div"); group.className = "slot-group";
    group.innerHTML = `<h4>${title}</h4>`;
    for (let i = from; i < from + 3; i++) group.appendChild(slotRow(i));
    box.appendChild(group);
  });
}

function slotRow(i) {
  const item = draft[draftFloor][i];
  const row = document.createElement("div"); row.className = "slot-row" + (i === flashSlot ? " flash" : "");

  const thumb = document.createElement("div"); thumb.className = "slot-thumb";
  const setThumb = (url) => {
    thumb.innerHTML = "";
    if (url) { const im = document.createElement("img"); im.src = url; im.alt = ""; im.onerror = () => { thumb.textContent = "⚠"; }; thumb.appendChild(im); }
    else thumb.textContent = "+";
  };
  setThumb(item?.url);

  const body = document.createElement("div"); body.className = "slot-body";
  const name = document.createElement("div"); name.className = "slot-name"; name.textContent = SLOT_NAMES[i];

  const input = document.createElement("input"); input.type = "text"; input.maxLength = 500; input.placeholder = "https://… picture link (png, jpg, webp, gif)";
  input.value = item && !item.url.startsWith("data:") ? item.url : "";
  if (item?.url.startsWith("data:")) input.placeholder = "Uploaded picture";
  input.addEventListener("change", async () => {          // checked when you leave the field: https, a real picture, not too large
    const v = input.value.trim();
    if (!v) { draft[draftFloor][i] = null; setThumb(null); return; }
    input.disabled = true; const err = await checkImageUrl(v); input.disabled = false;
    if (err) { input.classList.add("bad"); toast(err); return; }
    input.classList.remove("bad"); draft[draftFloor][i] = { url: v, title: item?.title }; setThumb(v);
  });

  const actions = document.createElement("div"); actions.className = "slot-actions";
  const upload = document.createElement("input"); upload.type = "file"; upload.accept = "image/*";
  upload.addEventListener("change", async () => {
    const f = upload.files[0]; if (!f) return;
    const err = checkFile(f); if (err) { toast(err); upload.value = ""; return; }
    const url = await fileToPicture(f);
    if (!url) { toast("That file could not be read as a picture."); return; }
    draft[draftFloor][i] = { url }; flashSlot = i; renderGalleryEditor();
  });
  const upBtn = btn("Upload", "btn", () => upload.click());
  const nftBtn = btn("My NFTs", "btn", () => openNftPicker(i));
  const clr = btn("Remove", "btn btn-danger", () => { draft[draftFloor][i] = null; flashSlot = -1; renderGalleryEditor(); });
  actions.append(upBtn, nftBtn, clr, upload);

  body.append(name, input, actions);
  row.append(thumb, body);
  return row;
}
function btn(text, cls, fn) {
  const b = document.createElement("button"); b.type = "button"; b.className = cls + " btn-small"; b.textContent = text;
  b.addEventListener("click", fn); return b;
}

/* ---------- owner panel: open / cancel / save ---------- */
function closeOwnerPanel() { ownerModal.classList.add("hidden"); closeNftPicker(); draft = {}; pendingEditImage = null; flashSlot = -1; }
ownerPanelBtn.addEventListener("click", () => openOwnerPanel());
cancelEditBtn.addEventListener("click", () => { audio.sfx("close"); closeOwnerPanel(); });
ownerModal.addEventListener("pointerdown", (e) => { if (e.target === ownerModal) closeOwnerPanel(); });       // tap outside = cancel
addEventListener("keydown", (e) => { if (e.key === "Escape" && !ownerModal.classList.contains("hidden")) closeOwnerPanel(); });
saveEditBtn.addEventListener("click", async () => {
  if (!currentHole || !isOwner) return closeOwnerPanel();
  saveEditBtn.disabled = true;
  try {
    await new Promise((r) => setTimeout(r, 0));                                   // let a picture-link field finish its own check first
    // links: "label|https://url" per line
    const links = [];
    for (const line of editLinks.value.split("\n")) {
      if (!line.trim()) continue;
      const [label, ...rest] = line.split("|"), url = safeLink(rest.join("|"));
      if (!rest.length || !url || !label.trim()) { toast(`Link not valid: “${line.trim().slice(0, 40)}”. Use  label|https://…`); return; }
      links.push({ label: label.trim().slice(0, 40), url });
    }
    if (links.length > MAX_LINKS) { toast(`You can add up to ${MAX_LINKS} links.`); return; }
    // profile picture: upload > link > keep the uploaded one > none
    let image = pendingEditImage;
    if (!image) {
      const v = editImage.value.trim();
      if (v) { if (v !== currentHole.image) { const err = await checkImageUrl(v); if (err) { toast(err); return; } } image = v; }
      else image = currentHole.image?.startsWith("data:") ? currentHole.image : null;
    }
    updateHole(currentHole.id, {
      username: editUsername.value.trim().slice(0, 20) || currentHole.username,
      description: editDescription.value.trim().slice(0, 300),
      image, links, style: editStyle
    });
    for (const f of Object.keys(draft)) setGallery(currentHole, +f, draft[f]);
    ownerModal.classList.add("hidden"); draft = {}; pendingEditImage = null; flashSlot = -1;
    fillRoomHeader(currentHole);
    mapRenderer.holes = getAllHoles();
    roomRenderer.enter(currentHole, isOwner, roomRenderer.floor);                 // pictures on the walls update right away
    holeUI?.setup(currentHole, true);
    audio.sfx("buy"); toast("Saved ✔");
  } catch (e) { console.warn("Save failed", e); toast("Could not save. Please try again."); }
  finally { saveEditBtn.disabled = false; }
});

/* ---------- NFT picker ---------- */
const nftModal = $("nft-modal"), nftGrid = $("nft-grid"), nftNote = $("nft-note"), nftConnectBtn = $("nft-connect-btn");
let nftTarget = -1;

async function openNftPicker(slot) {
  nftTarget = slot;
  nftGrid.innerHTML = ""; nftConnectBtn.classList.add("hidden");
  nftModal.classList.remove("hidden");
  if (!session.wallet) {
    nftNote.textContent = "Connect your wallet to hang your NFTs on the wall.";
    nftConnectBtn.classList.remove("hidden");
    return;
  }
  nftNote.textContent = "Loading your NFTs…";
  try {
    const { demo, items } = await fetchWalletNFTs(session.wallet);
    if (nftModal.classList.contains("hidden")) return;
    nftNote.textContent = demo
      ? "Demo pictures: set DAS_RPC_URL in js/config.js to list the real NFTs of your wallet."
      : items.length ? "Choose one of your 50 latest NFTs for this frame." : "No NFTs with a picture were found in this wallet.";
    items.forEach((n) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "nft-item";
      const im = document.createElement("img"); im.src = n.image; im.alt = ""; im.loading = "lazy";
      const t = document.createElement("span"); t.textContent = n.name;
      b.append(im, t);
      b.addEventListener("click", () => {
        draft[draftFloor][nftTarget] = { url: n.image, title: n.name };
        flashSlot = nftTarget; closeNftPicker(); renderGalleryEditor();
      });
      nftGrid.appendChild(b);
    });
  } catch (e) {
    console.warn("NFT lookup failed", e);
    nftNote.textContent = "Could not load your NFTs. Check the RPC endpoint in js/config.js and try again.";
  }
}
function closeNftPicker() { nftModal.classList.add("hidden"); }
$("nft-close-btn").addEventListener("click", closeNftPicker);
nftConnectBtn.addEventListener("click", async () => { if (await connectWallet()) openNftPicker(nftTarget); });

/* ---------- Wallet (Phantom / Solana) ---------- */
const walletBtn = $("connect-wallet-btn");
const walletAddr = $("wallet-address");
const disconnectBtn = $("disconnect-wallet-btn");
const provider = () => window.phantom?.solana?.isPhantom ? window.phantom.solana : (window.solana?.isPhantom ? window.solana : null);

const nftCount = $("nft-count");
// Check the NFTs of every wallet that connects (cached, so the picker opens instantly)
function checkWalletNFTs(address) {
  nftCount.classList.remove("hidden"); nftCount.textContent = "NFTs: …";
  fetchWalletNFTs(address).then(({ demo, items }) => {
    if (session.wallet !== address) return;            // wallet changed meanwhile
    nftCount.textContent = demo ? "NFTs: demo" : `Latest NFTs: ${items.length}`;
    console.log(`Wallet ${address}: ${items.length} NFTs`, items);
  }).catch((e) => {
    if (session.wallet !== address) return;
    nftCount.textContent = "NFTs: error"; console.warn("NFT check failed", e);
  });
}

function applyConnected(address) {
  session.wallet = address;
  session.user = address;
  mapRenderer.owner = session.user;
  walletBtn.classList.add("hidden");
  walletAddr.textContent = address.slice(0, 4) + "…" + address.slice(-4);
  walletAddr.title = address;
  walletAddr.classList.remove("hidden");
  disconnectBtn.classList.remove("hidden");
  mapRenderer.clamp();
  social.refreshIdentity();
  ecoUI?.onWalletConnected(address); refreshHome(); reapplyEquipped();
  checkWalletNFTs(address);
}
function applyDisconnected() {
  session.wallet = null;
  session.user = GUEST_USER;
  mapRenderer.owner = session.user;
  walletBtn.classList.remove("hidden");
  walletAddr.classList.add("hidden"); walletAddr.textContent = ""; walletAddr.removeAttribute("title");
  disconnectBtn.classList.add("hidden");
  nftCount.classList.add("hidden");
  mapRenderer.clamp();
  social.refreshIdentity(); ecoUI?.refresh(); refreshHome();
}
async function connectWallet() {
  const sol = provider();
  if (!sol) { window.open("https://phantom.app/", "_blank", "noopener"); return false; }
  try {
    const { publicKey } = await sol.connect();
    applyConnected(publicKey.toString());
    return true;
  } catch (e) { console.warn("Wallet connection rejected", e); return false; }
}
async function disconnectWallet() {
  try { await provider()?.disconnect(); } catch (e) { console.warn("Wallet disconnect failed", e); }
  applyDisconnected();
}
walletBtn.addEventListener("click", connectWallet);
disconnectBtn.addEventListener("click", disconnectWallet);
{
  const sol = provider();
  if (sol) {
    sol.on?.("disconnect", applyDisconnected);
    sol.on?.("accountChanged", (pk) => (pk ? applyConnected(pk.toString()) : applyDisconnected()));
    sol.connect({ onlyIfTrusted: true }).then(({ publicKey }) => applyConnected(publicKey.toString())).catch(() => {});  // silent re-login
  }
}

// Init
updateEmptyState();
showMap();
refreshHome();
setsBtn.addEventListener("click", () => setsUI.open());
setTimeout(() => share?.handleDeepLink(), 500);       // ?hole=ID opens a public profile

window.DeepHoles = {
  social, cafe, fx, audio, eco, ecoUI, share, holeUI, S,
  getHoles: getAllHoles,
  addHole,
  deepenHole,
  mapRenderer,
  roomRenderer
};

console.log("%cDeep Holes ready", "color:#38bdf8; font-weight:bold;");

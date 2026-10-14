/**
 * Isometric burrow room. Tile-based floor, two walls with the owner's picture,
 * depth-based biome/props, 4-direction + click-to-move rabbit.
 */
import { getImage, getGallery, floorCount } from "./data.js?v=14";
import { TAU, hash, biome, hsl, lookFor, PART_ORDER } from "./world.js?v=14";
import { art, drawArt, animFrame, cover, partArt } from "./assets.js?v=14";

export const TOUCH = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;   // phones/tablets: no keyboard hints
const N = 8, TW = 72, TH = 36, WH = 150;
// wall picture frames: 3 per wall, positions along the wall (in tiles) and size
const SLOT_X = [0.5, 3.2, 5.9], SLOT_W = 1.6, SLOT_H = 64, SLOT_Y = -WH + 20;
const slotU0 = (i) => (i < 3 ? SLOT_X[2 - i] : SLOT_X[i - 3]);   // slots count left -> right on screen
import { S } from "./settings.js?v=14";
import * as audio from "./audio.js?v=14";
import * as net from "./social.js?v=14";

/** Burrow themes: they recolour walls and floor of every floor of a hole. `premium` ones cost coins. */
export const THEMES = {
  natural: { n: "Natural" }, wood: { n: "Cozy wood", h: 28, s: 42, l: 28 }, stone: { n: "Stone hall", h: 220, s: 9, l: 30 }, mint: { n: "Mint garden", h: 160, s: 40, l: 27 },
  candy: { n: "Candy pink", h: 325, s: 58, l: 34, premium: true }, midnight: { n: "Midnight", h: 250, s: 45, l: 17, premium: true },
  royal: { n: "Royal purple", h: 275, s: 50, l: 27, premium: true }, crystal: { n: "Crystal blue", h: 200, s: 50, l: 30, premium: true }
};
export const DECOR = ["bed", "table", "plant", "lamp", "barrel", "rug", "mushroom", "rock", "chest", "crystal", "bones"];
const modalOpen = () => !!document.querySelector(".modal:not(.hidden), .lightbox:not(.hidden)");
const PROPS = {
  shallow: ["mushroom", "lamp", "rock", "barrel", "plant"],
  deep: ["crystal", "chest", "bones", "lamp", "rock"]
};

export class RoomRenderer {
  constructor(canvas, { onFrame = () => {}, onNpc = () => {}, getLook = null, isOnline = () => false } = {}) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d"); this.onFrame = onFrame;
    this.onNpc = onNpc; this.getLook = getLook; this.isOnline = isOnline; this.npc = null;
    this.keys = {}; this.player = null; this.raf = null; this.hole = null; this.time = 0;
    this.hover = -1; this.isOwner = false;
    this.editOn = false; this.sel = null; this.drag = null; this.rem = new Map(); this.partyId = null; this.say = ""; this.sayTs = 0; this.tick = 0;
    new ResizeObserver(() => { if (this.player) this.resize(); }).observe(canvas);
    const typing = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
    window.addEventListener("keydown", (e) => {
      if (!this.player || typing(e) || modalOpen()) return;
      if (e.key.startsWith("Arrow") || "wasdWASD".includes(e.key)) e.preventDefault();
      this.keys[e.key.toLowerCase()] = true; this.player.target = null;
    });
    window.addEventListener("keyup", (e) => { this.keys[e.key.toLowerCase()] = false; });
    canvas.addEventListener("pointerdown", (e) => this.clickMove(e));
    canvas.addEventListener("pointermove", (e) => this.dragMove(e));
    canvas.addEventListener("pointerup", () => this.dragEnd());
    canvas.addEventListener("pointercancel", () => this.dragEnd());
    canvas.addEventListener("pointermove", (e) => {
      if (!this.player) return;
      const i = this.frameAt(...this.scenePoint(e));
      this.hover = i >= 0 && (this.slotItem(i) || this.isOwner) ? i : -1;
      canvas.style.cursor = this.hover >= 0 ? "pointer" : "default";
    });
    canvas.addEventListener("pointerleave", () => { this.hover = -1; canvas.style.cursor = "default"; });
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.canvas.width = Math.floor(r.width * dpr); this.canvas.height = Math.floor(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = r.width; this.h = r.height;
    this.scale = Math.min(1.25, this.w / (N * TW + 90), this.h / (N * TH + WH + 130));
  }

  enter(hole, isOwner = false, floor = 0) {
    this.leave(); this.hole = hole; this.floor = floor; this.time = 0; this.isOwner = isOwner; this.resize();
    const lk = this.getLook ? this.getLook(hole, isOwner) : lookFor("guest");   // your own character, not the owner's
    this.player = { gx: N / 2, gy: N / 2 + 1.4, face: 1, walk: 0, target: null, blink: 0, color: lk.color, ear: lk.ear, acc: lk.acc, hue: lk.hue, parts: lk.parts };
    this.fade = 0; this.pending = null; this.cool = 60;
    audio.setIndoor(this.floor);
    this.buildProps(); this.editOn = false; this.sel = null; this.syncParty();
    audio.theme(this.partyId ? "party" : audio.LAYER_THEMES[this.floor % 10]);
    const loop = () => { this.raf = requestAnimationFrame(loop); this.time += 0.016; this.update(); this.draw(); };
    loop();
  }
  leave() { audio.setIndoor(null); if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; this.player = null; this.hole = null; this.keys = {}; this.editOn = false; if (this.partyId) { net.cafeLeave(); this.partyId = null; this.onParty?.("leave"); } }

  // Every 3 depth levels add one floor. Floor f has its own look; stairs link neighbours.
  buildProps() {
    const d = this.hole.depth, f = this.floor, seed = this.hole.id * 31 + f * 7;
    this.floors = floorCount(d);
    this.floor = Math.min(f, this.floors - 1);
    this.biome = this.themed(biome(this.floor));          // floor f = layer f (recoloured by the hole's theme)
    this.stairs = [];
    // the owner waits on the LAST floor as an NPC with his own character
    this.npc = this.floor === this.floors - 1 && !this.isOwner   // you never meet your own character in your own burrow
      ? { gx: 5.2, gy: 2.6, face: -1, walk: 0, blink: 0, ...lookFor(this.hole.owner, this.hole.customRabbit, this.hole.special) } : null;
    if (this.floor < this.floors - 1) this.stairs.push({ type: "down", gx: N - 1.4, gy: 1.4 });
    if (this.floor > 0) this.stairs.push({ type: "up", gx: 1.4, gy: N - 1.4 });
    const P = (type, gx, gy) => ({ type, gx, gy, ph: hash(seed, gx, gy) * TAU });
    if (this.floor === 0) {       // the cosy burrow home
      this.props = [P("rug", 4, 4), P("bed", 1.3, 2.4), P("barrel", 1.2, 4.6), P("table", 5.4, 5.2),
        P("plant", 5.8, 6.6), P("lamp", 3.2, 6.6), P("mushroom", 6.4, 3.4)];
    } else {
      const set = this.floor > 4 ? PROPS.deep : PROPS.shallow;
      this.props = [P("rug", 4, 4)];
      for (let k = 0; k < 7; k++) {
        const o = P(set[Math.floor(hash(seed, k) * set.length)], 1 + hash(seed, k, 1) * (N - 2), 1 + hash(seed, k, 2) * (N - 2));
        if (Math.hypot(o.gx - N / 2, o.gy - N / 2) > 1.4 && this.stairs.every((t) => Math.hypot(o.gx - t.gx, o.gy - t.gy) > 1.6)) this.props.push(o);
      }
    }
    const lay = this.hole.layout?.[this.floor];                 // the owner's own arrangement wins
    if (lay) this.props = lay.map((o, i) => ({ type: o.type, gx: o.gx, gy: o.gy, ph: hash(seed, i, 5) * TAU }));
    else if (this.npc) this.props = this.props.filter((o) => Math.hypot(o.gx - this.npc.gx, o.gy - this.npc.gy) > 1.3);
  }
  themed(b) { const t = THEMES[this.hole?.theme]; return t && t.h !== undefined ? { ...b, h: t.h, s: t.s, l: t.l } : b; }
  P(gx, gy, z = 0) { const p = this.iso(gx + .5, gy + .5); return [p.x, p.y - z]; }

  /* ---------- decorating (owner) ---------- */
  setEdit(on) { this.editOn = !!on && this.isOwner; this.sel = null; this.drag = null; if (this.editOn && !this.hole.layout?.[this.floor]) this.saveLayout(); this.onSelect?.(null); }
  layoutNow() { return this.props.map((o) => ({ type: o.type, gx: +o.gx.toFixed(2), gy: +o.gy.toFixed(2) })); }
  saveLayout() { this.hole.layout ||= {}; this.hole.layout[this.floor] = this.layoutNow(); this.onLayout?.(this.floor, this.hole.layout[this.floor]); }
  tileAt(e) { const [x, y] = this.scenePoint(e), A = 2 * x / TW, B = 2 * (y + 14 + N * TH / 2) / TH; return [(A + B) / 2 - .5, (B - A) / 2 - .5, x, y]; }
  propAt(x, y, gx, gy) {
    let best = null;
    for (const o of this.props) { if (o.type === "rug") continue; const q = this.iso(o.gx, o.gy), fy = q.y + TH / 2; if (Math.abs(x - q.x) < 28 && y > fy - 52 && y < fy + 12 && (!best || o.gx + o.gy > best.gx + best.gy)) best = o; }
    if (!best) for (const o of this.props) if (o.type === "rug" && Math.abs(gx - o.gx) < 1.7 && Math.abs(gy - o.gy) < 1.0) best = o;
    return best;
  }
  editDown(e) { const [gx, gy, x, y] = this.tileAt(e); this.sel = this.propAt(x, y, gx, gy); this.drag = this.sel ? { dx: this.sel.gx - gx, dy: this.sel.gy - gy } : null; this.onSelect?.(this.sel); }
  dragMove(e) {
    if (!this.editOn || !this.drag || !this.sel) return;
    const [gx, gy] = this.tileAt(e), nx = Math.max(.5, Math.min(N - .6, gx + this.drag.dx)), ny = Math.max(.5, Math.min(N - .6, gy + this.drag.dy));
    if (this.stairs.every((t) => Math.hypot(nx - t.gx, ny - t.gy) > 1.1) && !(this.npc && Math.hypot(nx - this.npc.gx, ny - this.npc.gy) < .9)) { this.sel.gx = nx; this.sel.gy = ny; }
  }
  dragEnd() { if (this.drag) { this.drag = null; this.saveLayout(); audio.sfx("click"); } }
  addProp(type) { if (!this.editOn || this.props.length >= 18) return false; const o = { type, gx: N / 2 + (Math.random() - .5), gy: N / 2 + (Math.random() - .5), ph: Math.random() * TAU }; this.props.push(o); this.sel = o; this.saveLayout(); this.onSelect?.(o); audio.sfx("pop"); return true; }
  removeSel() { if (!this.sel) return; this.props = this.props.filter((o) => o !== this.sel); this.sel = null; this.saveLayout(); this.onSelect?.(null); }
  swapSel() { if (!this.sel) return; this.sel.type = DECOR[(DECOR.indexOf(this.sel.type) + 1) % DECOR.length]; this.saveLayout(); audio.sfx("click"); }
  resetLayout() { if (this.hole.layout) delete this.hole.layout[this.floor]; this.onLayout?.(this.floor, null); this.sel = null; this.buildProps(); this.onSelect?.(null); }
  drawGrid(ctx) {
    ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.lineWidth = 1;
    for (let gx = 0; gx < N; gx++) for (let gy = 0; gy < N; gy++) { const a = this.iso(gx, gy); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + TW / 2, a.y + TH / 2); ctx.lineTo(a.x, a.y + TH); ctx.lineTo(a.x - TW / 2, a.y + TH / 2); ctx.closePath(); ctx.stroke(); }
  }
  drawSel(ctx) { const [x, y] = this.P(this.sel.gx, this.sel.gy); ctx.strokeStyle = "#f472b6"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, 30, 13, 0, 0, TAU); ctx.stroke(); ctx.fillStyle = "rgba(244,114,182,.18)"; ctx.fill(); }

  /* ---------- parties (hole owners with depth 10+) ---------- */
  syncParty() {
    const want = this.hole && this.floor === 0 && net.partyActive(this.hole) ? "party:" + this.hole.id : null;
    if (want === this.partyId) return;
    if (this.partyId) net.cafeLeave();
    this.partyId = null; this.rem.clear();
    if (want) {
      const me = net.store.me();
      if (!net.partyJoin(this.hole, me.id)) { this.onParty?.("full"); return; }
      this.partyId = want; net.cafeJoin(want); this.say = ""; this.sayTs = 0; this.broadcast(); this.onParty?.("join");
    } else this.onParty?.("leave");
  }
  broadcast() { const p = this.player; if (p && this.partyId) net.cafeUpdate({ gx: p.gx, gy: p.gy, face: p.face, look: { color: p.color, ear: p.ear, acc: p.acc, hue: p.hue, parts: p.parts }, say: this.say, sayTs: this.sayTs }); }
  sayNow(entry) { this.say = entry.text; this.sayTs = entry.ts; this.broadcast(); }
  liveUpdate() {
    const p = this.player; if (!p || !this.hole) return;
    this.tick++;
    if (this.floor === 0 && !this.partyId && this.tick % 60 === 0 && net.partyActive(this.hole)) this.syncParty();          // a party started while you are inside
    if (!this.partyId) return;
    if (this.tick % 30 === 0 && !net.partyActive(this.hole)) { this.syncParty(); return; }                                // it ended
    if (this.tick % 480 === 0) net.partyBeat(this.hole, net.store.me().id);
    const seen = new Set();
    for (const d of net.cafePlayers()) {
      seen.add(d.id);
      let o = this.rem.get(d.id); if (!o) { o = { gx: d.gx, gy: d.gy, walk: 0, face: 1, blink: 0 }; this.rem.set(d.id, o); }
      const dist = Math.hypot(d.gx - o.gx, d.gy - o.gy);
      o.gx += (d.gx - o.gx) * .25; o.gy += (d.gy - o.gy) * .25; o.walk = dist > .03 ? o.walk + .3 : o.walk * .8;
      Object.assign(o, { face: d.face, name: d.name, say: d.say, sayTs: d.sayTs, color: d.look?.color, ear: d.look?.ear, acc: d.look?.acc, hue: d.look?.hue, parts: d.look?.parts });
    }
    for (const id of [...this.rem.keys()]) if (!seen.has(id)) this.rem.delete(id);
    const mv = Math.hypot(p.gx - (this._lx ?? p.gx), p.gy - (this._ly ?? p.gy)) > .001; this._lx = p.gx; this._ly = p.gy;
    if (mv !== this.wasMoving) { this.wasMoving = mv; this.broadcast(); } else if (this.tick % (mv ? 5 : 60) === 0) this.broadcast();
  }
  partyFx(ctx) {
    const t = this.time;
    for (let i = 0; i < 5; i++) {
      const q = this.iso(N / 2 + Math.cos(t * .8 + i * 1.26) * 2.6, N / 2 + Math.sin(t * .7 + i * 1.26) * 2.6), hue = (t * 60 + i * 72) % 360;
      const g = ctx.createRadialGradient(q.x, q.y + TH / 2, 2, q.x, q.y + TH / 2, 62); g.addColorStop(0, `hsla(${hue},90%,65%,.42)`); g.addColorStop(1, `hsla(${hue},90%,65%,0)`);
      ctx.fillStyle = g; ctx.fillRect(q.x - 62, q.y - 40, 124, 110);
    }
    const c = this.iso(N / 2, N / 2 - 1);
    ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(c.x, c.y - 210); ctx.lineTo(c.x, c.y - 118); ctx.stroke();
    ctx.fillStyle = "#e9ddff"; ctx.beginPath(); ctx.arc(c.x, c.y - 108, 16, 0, TAU); ctx.fill();
    for (let k = 0; k < 6; k++) { const a = t * 2 + k; ctx.fillStyle = `hsla(${(k * 60 + t * 80) % 360},90%,70%,.9)`; ctx.fillRect(c.x + Math.cos(a) * 11 - 2, c.y - 108 + Math.sin(a) * 11 - 2, 4, 4); }
    [[-3.2, -3.2, 330], [3.2, -3.2, 190], [-3.2, 3.2, 50], [3.2, 3.2, 280]].forEach(([dx, dy, hue], i) => {          // balloons
      const q = this.iso(N / 2 + dx, N / 2 + dy), by = q.y - 60 + Math.sin(t * 1.6 + i) * 6;
      ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.moveTo(q.x, q.y + TH / 2); ctx.lineTo(q.x, by + 18); ctx.stroke();
      ctx.fillStyle = `hsl(${hue},80%,62%)`; ctx.beginPath(); ctx.ellipse(q.x, by, 11, 14, 0, 0, TAU); ctx.fill();
    });
  }
  tag(ctx, o, name, me = false) {
    const [x, y] = this.P(o.gx, o.gy), t = String(name).slice(0, 14);
    ctx.save(); ctx.translate(x, y - 94); ctx.font = "bold 12px system-ui"; ctx.textAlign = "center";
    const w = ctx.measureText(t).width + 16;
    ctx.fillStyle = me ? "rgba(219,39,119,.9)" : "rgba(91,33,182,.9)"; ctx.beginPath(); ctx.roundRect(-w / 2, -12, w, 20, 10); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillText(t, 0, 3); ctx.restore();
  }
  bubble(ctx, o) {
    if (!o.say || Date.now() - o.sayTs > 8000) return;
    const [x, y] = this.P(o.gx, o.gy);
    ctx.save(); ctx.translate(x, y - 108); ctx.font = "13px system-ui"; ctx.textAlign = "center";
    const lines = []; let line = "";
    for (const wd of o.say.split(/\s+/)) { const t = line ? line + " " + wd : wd; if (ctx.measureText(t).width > 170 && line) { lines.push(line); line = wd; } else line = t; }
    if (line) lines.push(line);
    const shown = lines.slice(0, 3), bw = Math.min(190, Math.max(...shown.map((l) => ctx.measureText(l).width)) + 20), bh = shown.length * 16 + 12;
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(-bw / 2, -bh - 8, bw, bh, 10); ctx.moveTo(-6, -8); ctx.lineTo(0, 0); ctx.lineTo(6, -8); ctx.fill();
    ctx.fillStyle = "#2e1065"; shown.forEach((l, i) => ctx.fillText(l, 0, -bh - 8 + 18 + i * 16));
    ctx.restore();
  }

  switchFloor() {
    const p = this.player, going = this.dir;
    this.floor = this.pending; this.pending = null; this.cool = 60; audio.setIndoor(this.floor); this.buildProps(); this.editOn = false; this.sel = null; this.syncParty();
    audio.sfx("stairs"); audio.theme(this.partyId ? "party" : audio.LAYER_THEMES[this.floor % 10]);
    const s = this.stairs.find((q) => q.type === (going === "down" ? "up" : "down")), k = s.type === "up" ? 1 : -1;
    p.gx = s.gx + 1.3 * k; p.gy = s.gy - 1.3 * k; p.target = null;
  }

  iso(gx, gy) { return { x: (gx - gy) * TW / 2, y: (gx + gy) * TH / 2 - N * TH / 2 }; }

  // pointer position in scene units (the same space the room is drawn in)
  scenePoint(e) {
    const r = this.canvas.getBoundingClientRect(), s = this.scale;
    return [(e.clientX - r.left - this.w / 2) / s, (e.clientY - r.top - this.h / 2 - 30) / s];
  }

  // which wall frame (0-5) is under a scene point, or -1
  frameAt(sx, sy) {
    const top = this.iso(0, 0);
    for (let i = 0; i < 6; i++) {
      const left = i < 3, u0 = slotU0(i);
      const u = (sx - top.x) / (left ? -TW / 2 : TW / 2);
      const v = sy - top.y - u * TH / 2;
      if (u >= u0 - .08 && u <= u0 + SLOT_W + .08 && v >= SLOT_Y - 6 && v <= SLOT_Y + SLOT_H + 6) return i;
    }
    return -1;
  }

  // picture hanging in a slot. The centre frame of the right wall falls back to the profile picture.
  slotItem(i) {
    const it = getGallery(this.hole, this.floor)[i];
    if (it?.url) return it;
    if (i === 4 && this.hole.image) return { url: this.hole.image, title: this.hole.username, fallback: true };
    return null;
  }

  clickMove(e) {
    if (!this.player) return;
    if (this.editOn) { this.editDown(e); return; }
    const [x, y] = this.scenePoint(e), s = this.scale;
    const fi = this.frameAt(x, y);
    if (fi >= 0) {
      const item = this.slotItem(fi);
      if (item) { this.onFrame({ floor: this.floor, slot: fi, item, hole: this.hole }); return; }
      if (this.isOwner) { this.onFrame({ floor: this.floor, slot: fi, item: null, hole: this.hole }); return; }
    }
    if (this.npc) {                 // click the owner to talk to him
      const q = this.iso(this.npc.gx, this.npc.gy);
      if (Math.abs(x - q.x) < 30 && y > q.y + TH / 2 - 86 && y < q.y + TH / 2 + 10) { this.onNpc(this.hole); return; }
    }
    const A = 2 * x / TW, B = 2 * (y + N * TH / 2) / TH;
    this.player.target = { gx: Math.max(.4, Math.min(N - .4, (A + B) / 2)), gy: Math.max(.4, Math.min(N - .4, (B - A) / 2)) };
  }

  update() {
    const p = this.player; if (!p) return;
    if (this.pending !== null) { this.fade += .08; if (this.fade >= 1) this.switchFloor(); return; }
    if (this.fade > 0) this.fade = Math.max(0, this.fade - .06);
    if (this.cool > 0) this.cool--;
    const k = this.keys; let sx = (k.arrowright || k.d ? 1 : 0) - (k.arrowleft || k.a ? 1 : 0), sy = (k.arrowdown || k.s ? 1 : 0) - (k.arrowup || k.w ? 1 : 0);
    if (this.joy) { sx = this.joy.x; sy = this.joy.y; p.target = null; }       // touch joystick (analog direction)
    if (this.editOn) { sx = 0; sy = 0; p.target = null; }                      // decorating: the rabbit stands still
    if (!sx && !sy && p.target) {
      const dx = p.target.gx - p.gx, dy = p.target.gy - p.gy, d = Math.hypot(dx, dy);
      if (d < .08) p.target = null;
      else { const gx = dx / d, gy = dy / d; sx = gx - gy; sy = (gx + gy); }
    }
    // screen direction -> grid direction (right = +gx -gy, down = +gx +gy)
    const mx = sx + sy, my = sy - sx, len = Math.hypot(mx, my);
    if (len) {
      const sp = .055;
      p.gx += (mx / len) * sp; p.gy += (my / len) * sp;
      if (sx) p.face = sx > 0 ? 1 : -1;
      p.walk += .3;
      if (Math.floor(p.walk / Math.PI) !== this._ls) { this._ls = Math.floor(p.walk / Math.PI); audio.stepSound(); }
    } else p.walk *= .8;
    p.gx = Math.max(.4, Math.min(N - .4, p.gx)); p.gy = Math.max(.4, Math.min(N - .4, p.gy));
    if (this.npc) {                 // the owner NPC is solid, faces the visitor and blinks
      const n = this.npc, dx = p.gx - n.gx, dy = p.gy - n.gy, d = Math.hypot(dx, dy);
      if (d < .6 && d > 0) { p.gx = n.gx + dx / d * .6; p.gy = n.gy + dy / d * .6; }
      n.face = p.gx - p.gy >= n.gx - n.gy ? 1 : -1; n.blink = (this.time % 4.1) < .12 ? 1 : 0;
    }
    this.props.forEach((o) => { // solid props push the rabbit out
      if (["mushroom", "bones", "rug"].includes(o.type)) return;
      const dx = p.gx - o.gx, dy = p.gy - o.gy, d = Math.hypot(dx, dy);
      if (d < .5 && d > 0) { p.gx = o.gx + dx / d * .5; p.gy = o.gy + dy / d * .5; }
    });
    if (!this.cool) for (const st of this.stairs) if (Math.hypot(p.gx - st.gx, p.gy - st.gy) < .6) {
      this.pending = st.type === "down" ? this.floor + 1 : this.floor - 1; this.dir = st.type; break;
    }
    p.blink = (this.time % 3.4) < .12 ? 1 : 0;
    this.liveUpdate();
  }

  draw() {
    const ctx = this.ctx, w = this.w, h = this.h, b = this.biome, depth = this.hole.depth;
    const bgA = art("room-bg-" + b.k, b.hue);       // assets/room/background/<biome>.png
    if (bgA) cover(ctx, bgA, 0, 0, w, h);
    else {
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, hsl(b, 2)); bg.addColorStop(1, hsl(b, -9));
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    }

    ctx.save(); ctx.translate(w / 2, h / 2 + 30); ctx.scale(this.scale, this.scale);
    this.drawWalls(ctx, b, depth);
    this.drawFloor(ctx, b);
    this.props.forEach((o) => o.type === "rug" && this.drawRug(ctx, o));
    if (this.editOn) this.drawGrid(ctx);
    if (this.partyId) this.partyFx(ctx);
    // y-sort props + rabbit
    const list = [...this.stairs.map((t) => ({ z: t.gx + t.gy - .3, f: () => this.drawStairs(ctx, t) })),
      ...this.props.filter((o) => o.type !== "rug").map((o) => ({ o, z: o.gx + o.gy, f: () => this.drawProp(ctx, o) })),
      ...(this.npc ? [{ z: this.npc.gx + this.npc.gy, f: () => { this.drawRabbit(ctx, this.npc); this.drawNpcTag(ctx); } }] : []),
      ...(this.partyId ? [...this.rem.values()].map((o) => ({ z: o.gx + o.gy + .01, f: () => { this.drawRabbit(ctx, o); this.tag(ctx, o, o.name || "Guest"); } })) : []),
      { z: this.player.gx + this.player.gy, f: () => this.drawRabbit(ctx, this.player) }].sort((a, c) => a.z - c.z);
    list.forEach((it) => it.f());
    if (this.editOn && this.sel) this.drawSel(ctx);
    if (this.partyId) [...this.rem.values(), { ...this.player, say: this.say, sayTs: this.sayTs }].forEach((o) => this.bubble(ctx, o));
    ctx.restore();

    if (this.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, this.fade)})`; ctx.fillRect(0, 0, w, h); }
    ctx.fillStyle = "rgba(91,33,182,.86)"; ctx.beginPath(); ctx.roundRect(14, 14, 210, 30, 15); ctx.fill();
    ctx.fillStyle = "#f1f5f9"; ctx.font = "600 13px system-ui"; ctx.textAlign = "left";
    ctx.fillText(`Floor ${this.floor + 1} of ${this.floors} · ${b.name}`, 26, 34);
    if (this.partyId || this.editOn) {
      const left = this.partyId ? Math.max(0, Math.round(((net.partyActive(this.hole)?.until || 0) - Date.now()) / 60000)) : 0;
      ctx.fillStyle = "rgba(219,39,119,.9)"; ctx.beginPath(); ctx.roundRect(14, 52, 210, 28, 14); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillText(this.editOn ? "🛋 Decorating: drag items" : `🎉 Party · ${this.rem.size + 1} here · ${left} min left`, 26, 71);
    }
    ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.font = "13px system-ui"; ctx.textAlign = "center";
    if (!TOUCH) ctx.fillText(this.floors > 1 ? "Arrows / WASD or click the floor to move • click a picture to view it • click the owner to talk • stairs change floor" : "Arrows / WASD or click the floor to move • click a picture to view it • click the owner to talk", w / 2, h - 16);
  }

  drawRug(ctx, o) {
    const ra = art("room-rug");
    if (ra) {   // flat top-down picture projected onto the floor (3.4 x 2.2 tiles)
      const P = this.iso(o.gx - 1.7, o.gy - 1.1);
      ctx.save(); ctx.transform(TW / 2, TH / 2, -TW / 2, TH / 2, P.x, P.y + TH / 2);
      ctx.drawImage(ra.im, 0, 0, 3.4, 2.2); ctx.restore(); return;
    }
    const q = (dx, dy) => this.iso(o.gx + dx, o.gy + dy);
    [[1.7, 1.1, "#9f1239"], [1.45, .86, "#fda4af"], [1.2, .62, "#9f1239"]].forEach(([rx, ry, c]) => {
      const A = q(-rx, -ry), B = q(rx, -ry), C = q(rx, ry), D = q(-rx, ry);
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(A.x, A.y + TH / 2); ctx.lineTo(B.x, B.y + TH / 2); ctx.lineTo(C.x, C.y + TH / 2); ctx.lineTo(D.x, D.y + TH / 2); ctx.fill();
    });
  }

  drawStairs(ctx, st) {
    const p = this.iso(st.gx, st.gy), up = st.type === "up", bob = Math.sin(this.time * 3) * 3;
    ctx.save(); ctx.translate(p.x, p.y + TH / 2);
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.beginPath(); ctx.ellipse(0, 0, 34, 16, 0, 0, TAU); ctx.fill();
    const sa = art("room-stairs-" + st.type);
    if (sa) drawArt(ctx, sa, { anchor: "bottom" });
    else for (let k = 0; k < 4; k++) {
      const y = up ? -k * 9 : k * 3, w = 30 - k * (up ? 4 : 5);
      ctx.fillStyle = `hsl(30,25%,${up ? 46 - k * 3 : 24 - k * 4}%)`; ctx.beginPath(); ctx.roundRect(-w, y - 9, w * 2, 9, 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(-w, y - 9, w * 2, 2);
    }
    ctx.fillStyle = up ? "#4ade80" : "#fbbf24"; ctx.beginPath();
    const ay = (up ? -52 : -34) + bob; ctx.moveTo(-9, ay + (up ? 8 : 0)); ctx.lineTo(9, ay + (up ? 8 : 0)); ctx.lineTo(0, ay + (up ? -4 : 12)); ctx.fill();
    ctx.restore();
  }

  drawFloor(ctx, b) {
    const fa = art("room-floor-" + b.k, b.hue);   // flat square tile, projected to the iso grid
    if (fa) {
      const o = this.iso(0, 0);
      ctx.save(); ctx.transform(TW / 2, TH / 2, -TW / 2, TH / 2, o.x, o.y);
      for (let gx = 0; gx < N; gx++) for (let gy = 0; gy < N; gy++) ctx.drawImage(fa.im, gx, gy, 1.02, 1.02);
      ctx.restore();
    }
    else for (let gx = 0; gx < N; gx++) for (let gy = 0; gy < N; gy++) {
      const a = this.iso(gx, gy), r = hash(this.hole.id, gx, gy);
      ctx.fillStyle = hsl(b, 4 + ((gx + gy) & 1) * 3 + r * 3);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + TW / 2, a.y + TH / 2); ctx.lineTo(a.x, a.y + TH); ctx.lineTo(a.x - TW / 2, a.y + TH / 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 1; ctx.stroke();
      if (r > .7) { ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.beginPath(); ctx.ellipse(a.x + (r - .85) * 30, a.y + TH / 2, 4, 2, 0, 0, TAU); ctx.fill(); }
    }
    // front edge thickness
    const L = this.iso(0, N), B = this.iso(N, N), R = this.iso(N, 0);
    ctx.fillStyle = hsl(b, -10);
    ctx.beginPath(); ctx.moveTo(L.x - TW / 2, L.y + TH / 2); ctx.lineTo(B.x, B.y + TH); ctx.lineTo(B.x, B.y + TH + 14); ctx.lineTo(L.x - TW / 2, L.y + TH / 2 + 14); ctx.fill();
    ctx.fillStyle = hsl(b, -14);
    ctx.beginPath(); ctx.moveTo(R.x + TW / 2, R.y + TH / 2); ctx.lineTo(B.x, B.y + TH); ctx.lineTo(B.x, B.y + TH + 14); ctx.lineTo(R.x + TW / 2, R.y + TH / 2 + 14); ctx.fill();
  }

  drawWalls(ctx, b, depth) {
    const T = this.iso(0, 0), Lc = this.iso(0, N), Rc = this.iso(N, 0), top = { x: T.x, y: T.y };
    // left wall (gx = 0 edge) and right wall (gy = 0 edge)
    [[Lc, -8, 0], [Rc, -14, 1]].forEach(([c, dl, side]) => {
      const wa = art((side ? "room-wall-right-" : "room-wall-left-") + b.k, b.hue);
      if (wa) {   // flat front-facing picture, skewed onto the wall (never mirrored)
        ctx.save(); ctx.translate(top.x, top.y); ctx.transform(side ? TW / 2 : -TW / 2, TH / 2, 0, 1, 0, 0);
        if (!side) { ctx.translate(N, 0); ctx.scale(-1, 1); }
        ctx.drawImage(wa.im, 0, -WH, N, WH); ctx.restore(); return;
      }
      const g = ctx.createLinearGradient(0, top.y - WH, 0, top.y);
      g.addColorStop(0, hsl(b, dl - 6)); g.addColorStop(1, hsl(b, dl + 3));
      ctx.fillStyle = g; ctx.beginPath();
      const ox = 0, oy = 0;
      ctx.moveTo(top.x, top.y); ctx.lineTo(c.x, c.y); ctx.lineTo(c.x, c.y - WH); ctx.lineTo(top.x, top.y - WH); ctx.closePath(); ctx.fill();
      // strata + speckles along the wall
      for (let k = 0; k < N; k++) {
        const t0 = k / N, ex = top.x + (c.x - top.x) * t0, ey = top.y + (c.y - top.y) * t0;
        for (let j = 0; j < 4; j++) {
          const r = hash(this.hole.id, k * 4 + j, side);
          ctx.fillStyle = r > .5 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.14)";
          ctx.fillRect(ex + (side ? 1 : -1) * r * 8, ey - 14 - j * 36 - r * 8, side ? 24 : -24, 4 + r * 6);
        }
      }
    });
    this.drawFrames(ctx);
    const bkA = art("room-bookcase");
    if (this.floor === 0 && bkA) {
      ctx.save(); ctx.translate(top.x, top.y); ctx.transform(-TW / 2, TH / 2, 0, 1, 0, 0);
      ctx.translate(3.6, 0); ctx.scale(-1, 1); ctx.drawImage(bkA.im, 0, -58, 3.2, 58); ctx.restore();
    } else if (this.floor === 0) {   // low bookcase under the pictures
      ctx.save(); ctx.translate(top.x, top.y); ctx.transform(-TW / 2, TH / 2, 0, 1, 0, 0);
      ctx.fillStyle = "#5b3a1a"; ctx.fillRect(.4, -58, 3.2, 58);
      ctx.fillStyle = "#2b1a0b"; ctx.fillRect(.5, -55, 3, 52);
      ctx.fillStyle = "#5b3a1a"; ctx.fillRect(.4, -31, 3.2, 3);
      for (let r = 0; r < 2; r++) {
        const yb = r ? -31 : -3;
        for (let k = 0; k < 8; k++) {
          const bh = 15 + ((k * 7 + r * 3) % 5) * 2;
          ctx.fillStyle = `hsl(${(r * 70 + k * 53) % 360},55%,${40 + (k % 2) * 8}%)`;
          ctx.fillRect(.6 + k * .36, yb - bh, .3, bh);
        }
      }
      ctx.restore();
    }
    // wall torch on the left wall (between two frames)
    const tp = this.iso(0, 5.35), fl = Math.sin(this.time * 12) * 1.5, tA = art("room-torch");
    if (!tA) { ctx.fillStyle = "#44403c"; ctx.fillRect(tp.x - 8, tp.y - 70, 4, 22); }
    const gl = ctx.createRadialGradient(tp.x - 6, tp.y - 76, 2, tp.x - 6, tp.y - 76, 70);
    gl.addColorStop(0, "rgba(251,191,36,.45)"); gl.addColorStop(1, "rgba(251,191,36,0)");
    ctx.fillStyle = gl; ctx.fillRect(tp.x - 80, tp.y - 150, 150, 150);
    if (tA) { ctx.save(); ctx.translate(tp.x - 6, tp.y - 48); drawArt(ctx, tA, { frame: animFrame(tA.spec, this.time) }); ctx.restore(); return; }
    ctx.fillStyle = "#fb923c"; ctx.beginPath(); ctx.ellipse(tp.x - 6, tp.y - 78, 5, 8 + fl, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.ellipse(tp.x - 6, tp.y - 76, 2.5, 5 + fl, 0, 0, TAU); ctx.fill();
  }

  // six picture frames per floor, three on each wall
  drawFrames(ctx) {
    const top = this.iso(0, 0), W = SLOT_W, H = SLOT_H, y0 = SLOT_Y, ppt = TW / 2, frA = art("room-frame");
    for (let i = 0; i < 6; i++) {
      const item = this.slotItem(i);
      if (!item && !this.isOwner) continue;              // visitors only see hung pictures
      const left = i < 3, u0 = slotU0(i), hov = this.hover === i;
      ctx.save(); ctx.translate(top.x, top.y); ctx.transform(left ? -TW / 2 : TW / 2, TH / 2, 0, 1, 0, 0);
      ctx.translate(left ? u0 + W : u0, 0); ctx.scale(left ? -1 : 1, 1);   // keep pictures un-mirrored on the left wall
      if (hov) { ctx.fillStyle = "rgba(253,224,71,.35)"; ctx.fillRect(-.2, y0 - 12, W + .4, H + 24); }
      ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(.05, y0 - 3, W + .18, H + 14);          // soft shadow
      if (!frA) {
        ctx.fillStyle = "#6b4423"; ctx.fillRect(-.09, y0 - 6, W + .18, H + 12);                  // wood frame
        ctx.fillStyle = "#8a5a2b"; ctx.fillRect(-.09, y0 - 6, W + .18, 2);
      }
      ctx.fillStyle = "#1c1917"; ctx.fillRect(0, y0, W, H);
      const img = item ? getImage(item.url) : null;
      if (img?.complete && img.naturalWidth) {
        const sc = Math.max(W * ppt / img.naturalWidth, H / img.naturalHeight);
        const dw = img.naturalWidth * sc / ppt, dh = img.naturalHeight * sc;
        ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, H); ctx.clip();
        ctx.drawImage(img, (W - dw) / 2, y0 + (H - dh) / 2, dw, dh);
        ctx.fillStyle = "rgba(255,255,255,.10)"; ctx.beginPath();        // glass shine
        ctx.moveTo(0, y0); ctx.lineTo(W * .55, y0); ctx.lineTo(0, y0 + H * .5); ctx.fill();
        ctx.restore();
      } else if (item) { ctx.fillStyle = "#334155"; ctx.fillRect(0, y0, W, H); }
      else {                                                                  // owner sees empty frames with a +
        ctx.fillStyle = "rgba(255,255,255,.07)"; ctx.fillRect(0, y0, W, H);
        ctx.fillStyle = "rgba(255,255,255,.4)";
        ctx.fillRect(W / 2 - .05, y0 + H / 2 - 10, .1, 20); ctx.fillRect(W / 2 - .28, y0 + H / 2 - 1.5, .56, 3);
      }
      if (frA) ctx.drawImage(frA.im, -.09, y0 - 6, W + .18, H + 12);          // custom frame on top of the picture
      ctx.restore();
    }
  }

  drawProp(ctx, o) {
    const p = this.iso(o.gx, o.gy), t = this.time;
    ctx.save(); ctx.translate(p.x, p.y + TH / 2);
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(0, 0, 14, 6, 0, 0, TAU); ctx.fill();
    const pa = art("room-prop-" + o.type);       // assets/room/props/<type>.png
    if (pa) {
      if (o.type === "lamp") { const g = ctx.createRadialGradient(0, -26, 2, 0, -26, 60); g.addColorStop(0, "rgba(253,224,71,.4)"); g.addColorStop(1, "rgba(253,224,71,0)"); ctx.fillStyle = g; ctx.fillRect(-60, -90, 120, 120); }
      drawArt(ctx, pa, { frame: animFrame(pa.spec, t, o.ph) }); ctx.restore(); return;
    }
    switch (o.type) {
      case "mushroom":
        ctx.fillStyle = "#e7e5e4"; ctx.fillRect(-3, -12, 6, 12);
        ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.ellipse(0, -13, 11, 8, 0, Math.PI, TAU); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-4, -16, 1.8, 0, TAU); ctx.arc(3, -18, 1.5, 0, TAU); ctx.fill(); break;
      case "lamp": {
        const g = ctx.createRadialGradient(0, -26, 2, 0, -26, 60); g.addColorStop(0, "rgba(253,224,71,.4)"); g.addColorStop(1, "rgba(253,224,71,0)");
        ctx.fillStyle = g; ctx.fillRect(-60, -90, 120, 120);
        ctx.fillStyle = "#78350f"; ctx.fillRect(-2.5, -24, 5, 24);
        ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(0, -28, 7 + Math.sin(t * 9 + o.ph), 0, TAU); ctx.fill(); break; }
      case "rock":
        ctx.fillStyle = "#78716c"; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-9, -14); ctx.lineTo(4, -17); ctx.lineTo(14, -5); ctx.lineTo(12, 0); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.beginPath(); ctx.moveTo(-9, -14); ctx.lineTo(4, -17); ctx.lineTo(0, -8); ctx.fill(); break;
      case "crystal": {
        const pu = .6 + .4 * Math.sin(t * 2 + o.ph);
        ctx.shadowColor = "#22d3ee"; ctx.shadowBlur = 14 * pu;
        [[-8, 22], [0, 34], [8, 18]].forEach(([x, hh], k) => {
          ctx.fillStyle = `hsl(${185 + k * 20},85%,${55 + pu * 10}%)`;
          ctx.beginPath(); ctx.moveTo(x, -hh); ctx.lineTo(x + 6, -hh * .3); ctx.lineTo(x + 4, 0); ctx.lineTo(x - 4, 0); ctx.lineTo(x - 6, -hh * .3); ctx.fill();
        });
        ctx.shadowBlur = 0; break; }
      case "chest":
        ctx.fillStyle = "#92400e"; ctx.fillRect(-15, -16, 30, 16);
        ctx.fillStyle = "#b45309"; ctx.beginPath(); ctx.ellipse(0, -16, 15, 7, 0, Math.PI, TAU); ctx.fill();
        ctx.fillStyle = "#fbbf24"; ctx.fillRect(-15, -10, 30, 2.5); ctx.fillRect(-2.5, -13, 5, 7);
        ctx.fillStyle = "#fffbeb"; ctx.globalAlpha = .5 + .5 * Math.sin(t * 4 + o.ph); ctx.beginPath(); ctx.arc(8, -20, 1.8, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; break;
      case "bed":
        ctx.fillStyle = "#78350f"; ctx.fillRect(-27, -10, 54, 12); ctx.fillRect(-27, -26, 5, 20);
        ctx.fillStyle = "#3b82f6"; ctx.beginPath(); ctx.roundRect(-25, -22, 50, 15, 6); ctx.fill();
        ctx.fillStyle = "#93c5fd"; ctx.fillRect(-5, -22, 6, 15);
        ctx.fillStyle = "#f8fafc"; ctx.beginPath(); ctx.roundRect(-23, -25, 16, 9, 4); ctx.fill(); break;
      case "table":
        ctx.fillStyle = "#78350f"; ctx.fillRect(-15, -18, 4, 18); ctx.fillRect(11, -18, 4, 18);
        ctx.fillStyle = "#a16207"; ctx.beginPath(); ctx.ellipse(0, -20, 24, 10, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#f97316"; ctx.beginPath(); ctx.moveTo(-8, -26); ctx.lineTo(8, -24); ctx.lineTo(-3, -18); ctx.fill();
        ctx.fillStyle = "#4ade80"; ctx.fillRect(-9, -28, 3, 4); break;
      case "barrel":
        ctx.fillStyle = "#92400e"; ctx.beginPath(); ctx.roundRect(-11, -26, 22, 26, 5); ctx.fill();
        ctx.fillStyle = "#b45309"; ctx.beginPath(); ctx.ellipse(0, -26, 11, 4.5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#44403c"; ctx.fillRect(-11, -19, 22, 2.5); ctx.fillRect(-11, -8, 22, 2.5); break;
      case "plant": {
        const sw = Math.sin(t * 1.5 + o.ph) * 3;
        ctx.fillStyle = "#c2410c"; ctx.beginPath(); ctx.moveTo(-8, -12); ctx.lineTo(8, -12); ctx.lineTo(5, 0); ctx.lineTo(-5, 0); ctx.fill();
        ctx.fillStyle = "#22c55e";
        [[-14, -30], [0, -38], [14, -30]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(0, -12); ctx.quadraticCurveTo(x * .8 + sw, y + 14, x + sw, y); ctx.quadraticCurveTo(x * .4, y + 16, 0, -12); ctx.fill(); });
        break; }
      default: // bones
        ctx.strokeStyle = "#e7e5e4"; ctx.lineWidth = 3; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(10, -6); ctx.moveTo(-8, -8); ctx.lineTo(8, 1); ctx.stroke();
        ctx.fillStyle = "#e7e5e4"; ctx.beginPath(); ctx.arc(2, -8, 5, 0, TAU); ctx.fill();
        ctx.fillStyle = "#0f172a"; ctx.fillRect(0, -9, 1.6, 2); ctx.fillRect(3.5, -9, 1.6, 2);
    }
    ctx.restore();
  }

  drawNpcTag(ctx) {
    const n = this.npc, q = this.iso(n.gx, n.gy), on = this.isOnline(this.hole.owner), name = (this.hole.username || "Owner").slice(0, 16);
    ctx.save(); ctx.translate(q.x, q.y + TH / 2 - 94); ctx.font = "bold 12px system-ui"; ctx.textAlign = "center";
    const w = ctx.measureText(name).width + 30;
    ctx.fillStyle = "rgba(91,33,182,.9)"; ctx.beginPath(); ctx.roundRect(-w / 2, -12, w, 20, 10); ctx.fill();
    ctx.fillStyle = on ? "#4ade80" : "#94a3b8"; ctx.beginPath(); ctx.arc(-w / 2 + 11, -2, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = "#f1f5f9"; ctx.fillText(name, 6, 3);
    ctx.font = "16px system-ui"; ctx.fillText("💬", 0, -18 + Math.sin(this.time * 3) * 2);
    ctx.restore();
  }

  drawRabbit(ctx, p) {
    const pos = this.iso(p.gx, p.gy), moving = Math.abs(p.walk) > .05;
    const hop = moving ? Math.abs(Math.sin(p.walk)) * 7 : Math.sin(this.time * 2) * .8;
    ctx.save(); ctx.translate(pos.x, pos.y + TH / 2);
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(0, 1, 19 - hop * .6, 7 - hop * .2, 0, 0, TAU); ctx.fill();
    const rA = art("room-rabbit", 0, undefined, p.color || null);   // assets/room/rabbit.png: white character, recoloured to this rabbit's colour
    if (rA) {
      const sp = rA.spec, f = moving ? sp.walk[0] + Math.floor(p.walk / 1.2) % (sp.walk[1] - sp.walk[0]) : p.blink ? sp.blink : sp.idle[0];
      drawArt(ctx, rA, { frame: f, dir: p.face });
      for (const c of PART_ORDER) { const q = p.parts?.[c], pa = q && partArt(c, q.n, q.c); if (pa) drawArt(ctx, pa, { frame: f, dir: p.face }); }   // hat, glasses, outfit... on top of the body
      ctx.restore(); return;
    }
    ctx.translate(0, -hop); ctx.scale(p.face, 1);
    const dark = p.ear, c = p.color;
    // tail
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-19, -14, 6, 0, TAU); ctx.fill();
    // hind & front feet
    const ft = Math.sin(p.walk) * 5;
    ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(-8 + ft, -2, 9, 5, 0, 0, TAU); ctx.ellipse(10 - ft, -1, 6, 4, 0, 0, TAU); ctx.fill();
    // body
    const bg = ctx.createLinearGradient(0, -40, 0, 0); bg.addColorStop(0, c); bg.addColorStop(1, dark);
    ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(-2, -18, 19, 17 + Math.sin(this.time * 2.4) * .6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.beginPath(); ctx.ellipse(3, -13, 10, 10, 0, 0, TAU); ctx.fill();
    // ears (sway/flop)
    const sw = Math.sin(this.time * 3) * .06 + (moving ? Math.sin(p.walk) * .12 : 0);
    [[1, -.18], [-5, .1]].forEach(([x, r], k) => {
      ctx.save(); ctx.translate(x + 7, -50); ctx.rotate(r - sw * (k ? -1 : 1) - .1);
      ctx.fillStyle = k ? dark : c; ctx.beginPath(); ctx.ellipse(0, -14, 5.5, 17, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fda4af"; ctx.beginPath(); ctx.ellipse(0, -13, 2.6, 12, 0, 0, TAU); ctx.fill(); ctx.restore();
    });
    // head
    ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(8, -40, 15, 13, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.beginPath(); ctx.ellipse(14, -35, 8, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fda4af"; ctx.beginPath(); ctx.arc(12, -34, 3, 0, TAU); ctx.fill();    // cheek
    // eye (blinks)
    if (p.blink) { ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(10, -42); ctx.lineTo(16, -42); ctx.stroke(); }
    else { ctx.fillStyle = "#0f172a"; ctx.beginPath(); ctx.ellipse(14, -43, 3.2, 4, 0, 0, TAU); ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(15, -44.5, 1.3, 0, TAU); ctx.fill(); }
    // nose + whiskers
    ctx.fillStyle = "#f43f5e"; ctx.beginPath(); ctx.arc(21, -39, 2.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(15,23,42,.5)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(19, -37); ctx.lineTo(30, -39); ctx.moveTo(19, -36); ctx.lineTo(30, -34); ctx.stroke();
    // accessory: makes every character look different
    if (p.acc === 1) { ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.roundRect(-8, -31, 26, 8, 4); ctx.fill(); ctx.fillRect(-4, -25, 6, 13); ctx.fillStyle = "#fff"; ctx.fillRect(3, -31, 3, 8); }
    if (p.acc === 2) { ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 1.8; ctx.fillStyle = "rgba(147,197,253,.35)"; ctx.beginPath(); ctx.arc(14, -43, 5.5, 0, TAU); ctx.fill(); ctx.moveTo(8.5, -44); ctx.lineTo(0, -46); ctx.stroke(); }
    if (p.acc === 3) { ctx.fillStyle = "#ec4899"; ctx.beginPath(); ctx.moveTo(6, -29); ctx.lineTo(-4, -35); ctx.lineTo(-4, -23); ctx.closePath(); ctx.moveTo(6, -29); ctx.lineTo(16, -35); ctx.lineTo(16, -23); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(6, -29, 3, 0, TAU); ctx.fill(); }
    if (p.acc === 4) { for (let k = 0; k < 5; k++) { ctx.fillStyle = "#f9a8d4"; ctx.beginPath(); ctx.arc(2 + Math.cos(k * 1.256) * 4, -50 + Math.sin(k * 1.256) * 4, 3, 0, TAU); ctx.fill(); } ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.arc(2, -50, 2.4, 0, TAU); ctx.fill(); }
    if (p.acc === 5) { ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.moveTo(-1, -50); ctx.lineTo(-2, -63); ctx.lineTo(4, -57); ctx.lineTo(9, -66); ctx.lineTo(14, -57); ctx.lineTo(19, -63); ctx.lineTo(18, -50); ctx.fill(); ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(9, -55, 2.2, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
}

export { TW, TH, WH };

/** Draw a rabbit character into a small canvas (hole-creation preview). */
export function drawRabbitPreview(canvas, look) {
  const ctx = canvas.getContext("2d"), fake = { time: 0, iso: () => ({ x: 0, y: -TH / 2 }) };
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.translate(canvas.width / 2 - 8, canvas.height - 20); ctx.scale(1.8, 1.8);
  RoomRenderer.prototype.drawRabbit.call(fake, ctx, { gx: 0, gy: 0, face: 1, walk: 0, blink: 0, color: look.color, ear: look.earColor || look.ear, acc: look.acc, hue: 0, parts: look.parts });
  ctx.restore();
}

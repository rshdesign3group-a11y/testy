/**
 * The underground café (depth 20, below every stall): a big isometric room where players meet.
 * Everybody inside sees everybody else's character, and what you type in the café chat also
 * appears in a bubble above your rabbit. The café chat only exists inside the café.
 * (Live sync uses the local driver in social.js - see the notes there about going online.)
 */
import { RoomRenderer, TW, TH, TOUCH } from "./room.js?v=13";
import { TAU, hash, lookFor } from "./world.js?v=13";
import * as net from "./social.js?v=13";
import * as audio from "./audio.js?v=13";
import { emojiPicker } from "./emoji.js?v=13";

const NC = 11, WHC = 170;          // grid size and wall height of the café

export class CafeRenderer extends RoomRenderer {
  constructor(canvas, opts) { super(canvas, opts); this.rem = new Map(); this.say = ""; this.sayTs = 0; this.tick = 0; }

  iso(gx, gy) { return { x: (gx - gy) * TW / 2, y: (gx + gy) * TH / 2 - NC * TH / 2 }; }
  resize() { super.resize(); this.scale = Math.min(1.15, this.w / (NC * TW + 80), this.h / (NC * TH + WHC + 150)); }
  P(gx, gy, z = 0) { const p = this.iso(gx + .5, gy + .5); return [p.x, p.y - z]; }     // entity coordinates -> screen

  enter(look, cafeId) {
    this.leave(); this.time = 0; this.tick = 0; this.rem.clear(); this.say = ""; this.sayTs = 0; this.wasMoving = false; this.resize();
    this.player = { gx: NC / 2 + (Math.random() - .5) * 3.5, gy: NC - 2.2 - Math.random() * 1.2, face: 1, walk: 0, target: null, blink: 0, color: look.color, ear: look.ear, acc: look.acc, hue: look.hue };
    this.barista = { gx: 5.8, gy: 0.2, face: 1, walk: 0, blink: 0, ...lookFor("barista-npc", null), acc: 2 };
    const T = (type, gx, gy, solid = false) => ({ type, gx, gy, solid, ph: hash(gx, gy, 9) * TAU });
    this.props = [
      T("table", 3.2, 5.2, true), T("stool", 2.1, 5.2), T("stool", 4.3, 5.2),
      T("table", 3.2, 8.6, true), T("stool", 2.1, 8.6), T("stool", 4.3, 8.6),
      T("table", 7.6, 6.2, true), T("stool", 6.5, 6.2), T("stool", 8.7, 6.2),
      T("table", 7.4, 9.2, true), T("stool", 6.3, 9.2), T("stool", 8.5, 9.2),
      T("plant", .9, 10), T("plant", 10.1, 3), T("lamp", 1, 3), T("lamp", 10, 7.4), T("barrel", 10, 10)
    ];
    for (let x = 2.6; x < 9.6; x += 1.4) this.props.push(T("stool", x, 2.6));            // bar stools
    net.cafeJoin(cafeId); this.broadcast(); audio.theme("cafe"); audio.sfx("ding");
    const loop = () => { this.raf = requestAnimationFrame(loop); this.time += 0.016; this.update(); this.draw(); };
    loop();
  }
  leave() { const was = !!this.player; super.leave(); if (was) net.cafeLeave(); }

  broadcast() {
    const p = this.player; if (!p) return;
    net.cafeUpdate({ gx: p.gx, gy: p.gy, face: p.face, look: { color: p.color, ear: p.ear, acc: p.acc, hue: p.hue }, say: this.say, sayTs: this.sayTs });
  }
  sayNow(entry) { this.say = entry.text; this.sayTs = entry.ts; this.broadcast(); }

  clickMove(e) {
    if (!this.player) return;
    const r = this.canvas.getBoundingClientRect(), s = this.scale, c = (v) => Math.max(.5, Math.min(NC - .5, v));
    const x = (e.clientX - r.left - this.w / 2) / s, y = (e.clientY - r.top - this.h / 2 - 40) / s;
    const A = 2 * x / TW, B = 2 * (y + NC * TH / 2) / TH;
    this.player.target = { gx: c((A + B) / 2 - .5), gy: c((B - A) / 2 - .5) };
  }

  update() {
    const p = this.player; if (!p) return;
    const k = this.keys; let sx = (k.arrowright || k.d ? 1 : 0) - (k.arrowleft || k.a ? 1 : 0), sy = (k.arrowdown || k.s ? 1 : 0) - (k.arrowup || k.w ? 1 : 0);
    if (this.joy) { sx = this.joy.x; sy = this.joy.y; p.target = null; }       // touch joystick (analog direction)
    if (!sx && !sy && p.target) {
      const dx = p.target.gx - p.gx, dy = p.target.gy - p.gy, d = Math.hypot(dx, dy);
      if (d < .08) p.target = null; else { sx = dx / d - dy / d; sy = dx / d + dy / d; }
    }
    const mx = sx + sy, my = sy - sx, len = Math.hypot(mx, my);
    if (len) { p.gx += mx / len * .06; p.gy += my / len * .06; if (sx) p.face = sx > 0 ? 1 : -1; p.walk += .3; if (Math.floor(p.walk / Math.PI) !== this._ls) { this._ls = Math.floor(p.walk / Math.PI); audio.stepSound(); } } else p.walk *= .8;
    p.gx = Math.max(.4, Math.min(NC - .6, p.gx)); p.gy = Math.max(.4, Math.min(NC - .6, p.gy));
    if (p.gx > 1.6 && p.gx < 9.9 && p.gy < 2.0) p.gy = 2.0;                  // nobody walks behind the bar
    this.props.forEach((o) => { if (!o.solid) return; const dx = p.gx - o.gx, dy = p.gy - o.gy, d = Math.hypot(dx, dy); if (d < .7 && d > 0) { p.gx = o.gx + dx / d * .7; p.gy = o.gy + dy / d * .7; } });
    p.blink = (this.time % 3.4) < .12 ? 1 : 0; this.barista.blink = (this.time % 4.3) < .12 ? 1 : 0;

    // the other visitors, smoothed
    const seen = new Set();
    for (const d of net.cafePlayers()) {
      seen.add(d.id);
      let o = this.rem.get(d.id); if (!o) { o = { gx: d.gx, gy: d.gy, walk: 0, face: 1, blink: 0 }; this.rem.set(d.id, o); }
      const dist = Math.hypot(d.gx - o.gx, d.gy - o.gy);
      o.gx += (d.gx - o.gx) * .25; o.gy += (d.gy - o.gy) * .25; o.walk = dist > .03 ? o.walk + .3 : o.walk * .8;
      Object.assign(o, { face: d.face, name: d.name, say: d.say, sayTs: d.sayTs, color: d.look?.color, ear: d.look?.ear, acc: d.look?.acc, hue: d.look?.hue });
    }
    for (const id of [...this.rem.keys()]) if (!seen.has(id)) this.rem.delete(id);
    // tell the others where we are
    this.tick++;
    const moving = len > 0;
    if (moving !== this.wasMoving) { this.wasMoving = moving; this.broadcast(); } else if (this.tick % (moving ? 5 : 60) === 0) this.broadcast();
  }

  draw() {
    const ctx = this.ctx, w = this.w, h = this.h;
    if (!(w > 0 && h > 0 && this.scale > 0)) return;       // canvas not visible yet
    const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#1b120b"); bg.addColorStop(1, "#0d0805");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.translate(w / 2, h / 2 + 40); ctx.scale(this.scale, this.scale);
    this.walls(ctx); this.floor(ctx);
    this.drawRabbit(ctx, this.barista); this.tag(ctx, this.barista, "Barista");
    this.counter(ctx);
    const list = [
      ...this.props.map((o) => ({ z: o.gx + o.gy, f: () => this.cafeProp(ctx, o) })),
      ...[...this.rem.values()].map((o) => ({ z: o.gx + o.gy + .01, f: () => { this.drawRabbit(ctx, o); this.tag(ctx, o, o.name || "Guest"); } })),
      { z: this.player.gx + this.player.gy + .02, f: () => { this.drawRabbit(ctx, this.player); this.tag(ctx, this.player, "You", true); } }
    ].sort((a, b) => a.z - b.z);
    list.forEach((i) => i.f());
    [...this.rem.values(), { ...this.player, say: this.say, sayTs: this.sayTs }].forEach((o) => this.bubble(ctx, o));
    ctx.restore();

    ctx.fillStyle = "rgba(91,33,182,.86)"; ctx.beginPath(); ctx.roundRect(14, 14, 190, 30, 15); ctx.fill();
    ctx.fillStyle = "#f1f5f9"; ctx.font = "600 13px system-ui"; ctx.textAlign = "left";
    ctx.fillText(`☕ Café · ${this.rem.size + 1} here`, 26, 34);
    ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.font = "13px system-ui"; ctx.textAlign = "center";
    if (!TOUCH) ctx.fillText("Arrows / WASD or click to move • use the café chat to talk", w / 2, h - 16);
  }

  /* ---------- scenery ---------- */
  walls(ctx) {
    const T = this.iso(0, 0), L = this.iso(0, NC), R = this.iso(NC, 0);
    [[L, "#3b2514", "#2a190c"], [R, "#4a2f1b", "#33200f"]].forEach(([c, c1, c2]) => {
      const g = ctx.createLinearGradient(0, T.y - WHC, 0, 0); g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(T.x, T.y); ctx.lineTo(c.x, c.y); ctx.lineTo(c.x, c.y - WHC); ctx.lineTo(T.x, T.y - WHC); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.moveTo(T.x, T.y); ctx.lineTo(c.x, c.y); ctx.lineTo(c.x, c.y - 56); ctx.lineTo(T.x, T.y - 56); ctx.closePath(); ctx.fill();   // wainscot
      ctx.strokeStyle = "rgba(0,0,0,.2)"; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let k = 1; k < NC; k++) { const t = k / NC, x = T.x + (c.x - T.x) * t, y = T.y + (c.y - T.y) * t; ctx.moveTo(x, y); ctx.lineTo(x, y - WHC); }
      ctx.stroke();
    });
    // windows on the left wall (a glowing crystal cave outside)
    ctx.save(); ctx.translate(L.x, L.y); ctx.transform(1, -.5, 0, 1, 0, 0);
    [40, 160, 280].forEach((x, i) => {
      const g = ctx.createLinearGradient(0, -150, 0, -70); g.addColorStop(0, "#1e3a5f"); g.addColorStop(1, "#0f172a");
      ctx.fillStyle = "#6b4423"; ctx.fillRect(x - 5, -155, 80, 90); ctx.fillStyle = g; ctx.fillRect(x, -150, 70, 80);
      ctx.fillStyle = `rgba(103,232,249,${.5 + .4 * Math.sin(this.time * 2 + i)})`; ctx.beginPath(); ctx.moveTo(x + 20, -72); ctx.lineTo(x + 28, -110); ctx.lineTo(x + 36, -72); ctx.fill();
      ctx.fillStyle = "#c084fc"; ctx.beginPath(); ctx.moveTo(x + 42, -72); ctx.lineTo(x + 50, -98); ctx.lineTo(x + 58, -72); ctx.fill();
      ctx.strokeStyle = "#6b4423"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 35, -150); ctx.lineTo(x + 35, -70); ctx.moveTo(x, -110); ctx.lineTo(x + 70, -110); ctx.stroke();
    });
    ctx.restore();
    // neon sign + bottle shelves on the right wall
    ctx.save(); ctx.translate(T.x, T.y); ctx.transform(1, .5, 0, 1, 0, 0);
    ctx.fillStyle = "#5b3a1a"; for (const y of [-92, -52]) ctx.fillRect(66, y, 276, 5);
    for (let x = 74; x < 336; x += 20) for (const [y, hh] of [[-92, 20 + hash(x, 1) * 8], [-52, 18 + hash(x, 2) * 10]]) { ctx.fillStyle = `hsl(${Math.floor(hash(x, y) * 360)},55%,45%)`; ctx.fillRect(x, y - hh, 9, hh); }
    ctx.shadowColor = "#f472b6"; ctx.shadowBlur = 16 * (.7 + .3 * Math.sin(this.time * 3)); ctx.fillStyle = "#fbcfe8"; ctx.font = "bold 34px system-ui"; ctx.textAlign = "center";
    ctx.fillText("☕ CAFÉ", 204, -128); ctx.shadowBlur = 0;
    ctx.restore();
  }

  floor(ctx) {
    for (let gx = 0; gx < NC; gx++) for (let gy = 0; gy < NC; gy++) {
      const a = this.iso(gx, gy), r = hash(gx, gy, 5);
      ctx.fillStyle = `hsl(28,${34 + r * 6}%,${24 + ((gx + gy) & 1) * 5 + r * 3}%)`;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + TW / 2, a.y + TH / 2); ctx.lineTo(a.x, a.y + TH); ctx.lineTo(a.x - TW / 2, a.y + TH / 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.28)"; ctx.lineWidth = 1; ctx.stroke();
    }
    const L = this.iso(0, NC), B = this.iso(NC, NC), R = this.iso(NC, 0);
    ctx.fillStyle = "#1c1209"; ctx.beginPath(); ctx.moveTo(L.x, L.y); ctx.lineTo(B.x, B.y); ctx.lineTo(B.x, B.y + 14); ctx.lineTo(L.x, L.y + 14); ctx.fill();
    ctx.fillStyle = "#140d06"; ctx.beginPath(); ctx.moveTo(R.x, R.y); ctx.lineTo(B.x, B.y); ctx.lineTo(B.x, B.y + 14); ctx.lineTo(R.x, R.y + 14); ctx.fill();
    // rug in the middle
    const q = (dx, dy) => this.P(5.4 + dx, 4.2 + dy); ctx.fillStyle = "#7f1d1d"; ctx.beginPath();
    [[-1.8, -.8], [1.8, -.8], [1.8, .8], [-1.8, .8]].forEach(([dx, dy], i) => { const [x, y] = q(dx, dy); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.fill();
  }

  box(ctx, x0, y0, x1, y1, h, top, right, left) {
    const poly = (pts, c) => { ctx.fillStyle = c; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); };
    const P = (a, b, z) => this.P(a, b, z);
    poly([P(x1, y0, 0), P(x1, y1, 0), P(x1, y1, h), P(x1, y0, h)], right);
    poly([P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, h), P(x0, y1, h)], left);
    poly([P(x0, y0, h), P(x1, y0, h), P(x1, y1, h), P(x0, y1, h)], top);
  }
  counter(ctx) {
    this.box(ctx, 2, .7, 9.7, 1.7, 38, "#b45309", "#78350f", "#92400e");
    ctx.fillStyle = "#fde68a"; for (const gx of [3.4, 5.4, 7.4]) { const [x, y] = this.P(gx, 1.2, 40); ctx.fillRect(x - 5, y - 8, 9, 8); ctx.fillStyle = "#fff"; ctx.fillRect(x - 3, y - 6, 5, 2); ctx.fillStyle = "#fde68a"; }   // cups
  }
  cafeProp(ctx, o) {
    if (o.type !== "stool") return this.drawProp(ctx, o);
    const [x, y] = this.P(o.gx, o.gy);
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(0, 0, 12, 5, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#44403c"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-7, -12); ctx.lineTo(-8, 0); ctx.moveTo(7, -12); ctx.lineTo(8, 0); ctx.stroke();
    ctx.fillStyle = "#b91c1c"; ctx.beginPath(); ctx.ellipse(0, -14, 11, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.beginPath(); ctx.ellipse(-3, -15, 5, 2, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ---------- people ---------- */
  tag(ctx, o, name, me = false) {
    const [x, y] = this.P(o.gx, o.gy), t = String(name).slice(0, 14);
    ctx.save(); ctx.translate(x, y - 94); ctx.font = "bold 12px system-ui"; ctx.textAlign = "center";
    const w = ctx.measureText(t).width + 16;
    ctx.fillStyle = me ? "rgba(180,83,9,.9)" : "rgba(91,33,182,.9)"; ctx.beginPath(); ctx.roundRect(-w / 2, -12, w, 20, 10); ctx.fill();
    ctx.fillStyle = "#f1f5f9"; ctx.fillText(t, 0, 3); ctx.restore();
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
    ctx.fillStyle = "#0f172a"; shown.forEach((l, i) => ctx.fillText(l, 0, -bh - 8 + 18 + i * 16));
    ctx.restore();
  }
}

/** Builds the live chat box (visible only inside the café or at a party) and returns open/leave/attach controls. */
export function initCafe({ canvas, getLook, onReport }) {
  const renderer = new CafeRenderer(canvas, {});
  let active = renderer;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const head = el("div", "cafe-head", "☕ Café chat · only visible in here"), list = el("div", "cafe-log"), input = el("input"), send = el("button", "btn btn-small", "Send");
  const emo = emojiPicker(input), foot = el("div", "cafe-foot"), err = el("div", "chat-err"), panel = el("div", "cafe-chat hidden");
  input.type = "text"; input.maxLength = 120; input.placeholder = "Say something…";
  foot.append(emo.toggle, input, send);
  const emotes = el("div", "emote-row"); ["👋", "❤️", "😂", "👍", "🔥", "🎉"].forEach((e) => { const b = el("button", "emote", e); b.type = "button"; b.addEventListener("click", () => say(e)); emotes.append(b); });
  panel.append(head, list, emotes, err, foot, emo.pop); document.body.append(panel);
  let errT = 0; const showErr = (t) => { err.textContent = t; clearTimeout(errT); if (t) errT = setTimeout(() => (err.textContent = ""), 4500); };

  function renderLog() {
    list.replaceChildren();
    if (!net.cafeLog.length) list.append(el("p", "cafe-empty", "Nobody has said anything yet."));
    net.cafeLog.slice(-30).forEach((m) => {
      const self = m.id === active.myId, row = el("div", "cafe-msg"), b = el("b", null, (m.role === "owner" ? "👑 " : m.role === "staff" ? "🛡 " : "") + (self ? "You" : m.name || "Guest"));
      row.append(b, el("span", null, " " + m.text));
      if (!self && !m.role && onReport) { const r = el("button", "chat-rep", "⚑"); r.type = "button"; r.title = "Report"; r.addEventListener("click", () => onReport({ ...m, from: m.id }, "cafe")); row.append(r); }
      list.append(row);
    });
    list.scrollTop = list.scrollHeight;
  }
  function say(text) {
    const r = net.cafeSay(text);
    if (!r.ok) { if (r.err) { showErr(r.err); audio.sfx("error"); } return false; }
    active.sayNow(r.entry); showErr(""); renderLog(); audio.sfx("pop"); return true;
  }
  const doSend = () => { if (say(input.value)) input.value = ""; };
  input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") doSend(); });
  send.addEventListener("click", doSend);
  net.on((e) => { if (e === "cafe" && active.player && !panel.classList.contains("hidden")) renderLog(); });
  const show = (r, title) => { active = r; r.myId = net.store.me().id; head.textContent = title; panel.classList.remove("hidden"); renderLog(); };

  return {
    renderer,
    open(n) { renderer.enter(getLook(), n); show(renderer, "☕ Café chat · only visible in here"); },
    leave() { renderer.leave(); panel.classList.add("hidden"); },
    attach(r) { show(r, "🎉 Party chat · only visible here"); },
    detach() { if (active !== renderer || !renderer.player) panel.classList.add("hidden"); },
    isOpen: () => !!renderer.player
  };
}

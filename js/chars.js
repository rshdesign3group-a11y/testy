/**
 * Unique characters: an admin uploads a full character sheet (same layout and size as assets/room/rabbit.png:
 * 1280x160 px, 10 frames of 128x160) and assigns it to specific wallets (e.g. the owner). Those players are drawn
 * with that art everywhere (burrow, café, share card) instead of the normal rabbit. Not recoloured, no parts.
 * NOTE: stored in the net layer (local driver = this browser, ~450 KB max per sheet). On a real backend store the PNG as a file.
 */
import * as net from "./social.js?v=14";

export const SHEET = { w: 1280, h: 160, frames: 10 };
export const MAX_BYTES = 450 * 1024;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const st = () => net.store.get();
const err = (e) => ({ ok: false, err: e });

export const all = () => st().chars;
export const get = (id) => st().chars.find((c) => c.id === id) || null;
export const forUser = (user) => (user ? st().chars.find((c) => c.users.includes(user)) || null : null);

/** Read a PNG file and check it has the right size. Resolves { ok, png } or { ok:false, err }. */
export function readSheet(file) {
  return new Promise((res) => {
    if (!file) return res(err("Choose a PNG file."));
    if (file.type !== "image/png") return res(err("The file must be a PNG."));
    if (file.size > MAX_BYTES) return res(err(`The file is too big (max ${MAX_BYTES / 1024} KB). Reduce the PNG size.`));
    const fr = new FileReader();
    fr.onerror = () => res(err("Could not read the file."));
    fr.onload = () => {
      const im = new Image();
      im.onerror = () => res(err("That is not a valid image."));
      im.onload = () => (im.naturalWidth === SHEET.w && im.naturalHeight === SHEET.h ? res({ ok: true, png: fr.result })
        : res(err(`Size must be exactly ${SHEET.w}×${SHEET.h} px (10 frames of 128×160, like rabbit.png). Yours is ${im.naturalWidth}×${im.naturalHeight}.`)));
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/** input: { id?, name, png?, users[] }  -> { ok, char } */
export function save(input) {
  const name = String(input.name || "").trim().slice(0, 30); if (!name) return err("Give the character a name.");
  const old = input.id ? get(input.id) : null;
  const png = input.png || old?.png; if (!png || !png.startsWith("data:image/png;base64,")) return err("Upload the character sheet (PNG).");
  const users = [...new Set((input.users || []).map((u) => String(u).trim()).filter(Boolean))];
  const bad = users.find((u) => !BASE58.test(u)); if (bad) return err(`“${bad.slice(0, 14)}…” is not a valid wallet address.`);
  if (users.length > 200) return err("At most 200 wallets per character.");
  const c = { id: old?.id || "ch" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, png, users, ts: input.png ? Date.now() : old?.ts || Date.now() };
  for (const o of st().chars) if (o.id !== c.id) o.users = o.users.filter((u) => !users.includes(u));      // a wallet has only one unique character
  const i = st().chars.findIndex((x) => x.id === c.id); if (i >= 0) st().chars[i] = c; else st().chars.push(c);
  net.store.commit("chars"); return { ok: true, char: c };
}
export function remove(id) { st().chars = st().chars.filter((c) => c.id !== id); net.store.commit("chars"); }

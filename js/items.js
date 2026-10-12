/**
 * Rare collectibles. Every day a few spots on the surface and in every underground layer hold an item.
 * Spots are deterministic (same for everybody) and change every UTC day; each spot can be picked up once
 * per player and a player can collect only a few per day, so items stay rare and limited.
 */
import { hash } from "./world.js?v=13";

const ZONES = {
  surface: [["🌰", "Golden Acorn"], ["🪶", "Pink Feather"], ["💧", "Dewdrop Gem"], ["🍀", "Lucky Clover"]],
  0: [["🪙", "Old Coin"], ["🌿", "Root Charm"]], 1: [["🏺", "Clay Idol"], ["🔴", "Red Pearl"]], 2: [["🐚", "Fossil Shell"], ["⚪", "Silver Pebble"]],
  3: [["🗿", "Stone Rune"], ["🔮", "Geode"]], 4: [["🦷", "Ancient Fang"], ["🏆", "Skull Cup"]], 5: [["🥇", "Gold Nugget"], ["🗝️", "Gilded Key"]],
  6: [["💎", "Crystal Heart"], ["🌙", "Moon Shard"]], 7: [["🔥", "Magma Pearl"], ["🪽", "Phoenix Ember"]]
};
export const dayKey = () => new Date().toISOString().slice(0, 10);
const CELL = 1400;

/** Items whose x lies in [x0, x1] for a zone ("surface" or a layer index). */
export function itemsIn(x0, x1, zone) {
  const out = [], dn = Math.floor(Date.now() / 864e5), key = dayKey(), salt = zone === "surface" ? 77 : 100 + zone, list = ZONES[zone === "surface" ? "surface" : zone % 8];
  for (let c = Math.max(0, Math.floor(x0 / CELL)); c <= Math.floor(x1 / CELL); c++) {
    if (hash(c, salt, dn) > (zone === "surface" ? .3 : .4)) continue;
    const boost = zone === "surface" ? 0 : Math.min(zone, 9) * .025, r = Math.min(.999, hash(c, salt + 1, dn) + boost);
    const rarity = r < .6 ? "common" : r < .88 ? "uncommon" : r < .97 ? "rare" : "epic";
    const [icon, name] = list[Math.floor(hash(c, salt + 2, dn) * list.length)];
    out.push({ id: `${key}:${zone}:${c}`, x: c * CELL + 80 + hash(c, salt + 3, dn) * (CELL - 160), f: .35 + hash(c, salt + 4, dn) * .5, zone, icon, name, rarity });
  }
  return out;
}

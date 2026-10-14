/**
 * Rabbit coin 🐰🪙 – a hand-drawn gold coin with an embossed rabbit head.
 * The 🪙 emoji is blank/empty on many devices (older Windows, some Android), so every 🪙 in the page text is
 * swapped for this inline SVG automatically. The same picture is used on the canvas (Old Coin item).
 */
export const RCOIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs>
<radialGradient id="g" cx="35%" cy="28%" r="80%"><stop offset="0" stop-color="#fff3a6"/><stop offset=".45" stop-color="#fbbf24"/><stop offset="1" stop-color="#b45309"/></radialGradient>
<linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#92400e"/></linearGradient>
</defs>
<circle cx="32" cy="32" r="30" fill="url(#r)"/>
<circle cx="32" cy="32" r="26.5" fill="url(#g)" stroke="#b45309" stroke-width="1.2"/>
<circle cx="32" cy="32" r="23" fill="none" stroke="#fff7c2" stroke-width="1" stroke-dasharray="2 3" opacity=".8"/>
<g fill="#b45309" stroke="#7c2d12" stroke-width="1" stroke-linejoin="round">
<path d="M24.5 31 C20.5 20 21 9.5 25.5 9.5 C30 9.5 31 20 29.5 30 Z"/>
<path d="M39.5 31 C43.5 20 43 9.5 38.5 9.5 C34 9.5 33 20 34.5 30 Z"/>
<ellipse cx="32" cy="38" rx="12.5" ry="11"/>
</g>
<path d="M25.6 27 C24 19 24.2 13 25.6 13 C27 13 28 19 27.7 27 Z" fill="#fde68a" opacity=".9"/>
<path d="M38.4 27 C40 19 39.8 13 38.4 13 C37 13 36 19 36.3 27 Z" fill="#fde68a" opacity=".9"/>
<ellipse cx="32" cy="39.5" rx="9" ry="7.2" fill="#fcd34d" opacity=".55"/>
<circle cx="27.6" cy="36.2" r="1.7" fill="#451a03"/><circle cx="36.4" cy="36.2" r="1.7" fill="#451a03"/>
<circle cx="28" cy="35.6" r=".55" fill="#fff"/><circle cx="36.8" cy="35.6" r=".55" fill="#fff"/>
<path d="M30.4 40 L33.6 40 L32 42 Z" fill="#9f1239"/>
<path d="M32 42 L32 43.8 M32 43.8 C30.6 45.2 29.2 44.6 28.8 43.8 M32 43.8 C33.4 45.2 34.8 44.6 35.2 43.8" fill="none" stroke="#451a03" stroke-width=".9" stroke-linecap="round"/>
<path d="M22 40 L27.5 40.6 M22 43 L27.5 42 M42 40 L36.5 40.6 M42 43 L36.5 42" stroke="#7c2d12" stroke-width=".7" stroke-linecap="round"/>
<path d="M12 22 A22 22 0 0 1 24 10" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>
</svg>`;
export const RCOIN_URL = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(RCOIN_SVG);

let img = null;
/** Image for canvas drawing (null until loaded). */
export function coinImage() { if (!img) { img = new Image(); img.src = RCOIN_URL; } return img.complete && img.naturalWidth ? img : null; }

/* ---- swap every 🪙 character that appears in the page for the rabbit coin picture ---- */
const COIN = "\u{1FA99}";
function swap(node) {
  const t = node.nodeValue; if (!t || !t.includes(COIN)) return;
  const p = node.parentNode; if (!p || /^(SCRIPT|STYLE|TEXTAREA|INPUT|OPTION|TITLE)$/.test(p.nodeName)) return;
  const frag = document.createDocumentFragment();
  t.split(COIN).forEach((part, i) => {
    if (i) { const s = document.createElement("span"); s.className = "rcoin"; s.setAttribute("role", "img"); s.setAttribute("aria-label", "coin"); frag.append(s); }
    if (part) frag.append(document.createTextNode(part));
  });
  p.replaceChild(frag, node);
}
function scan(root) {
  if (root.nodeType === 3) return swap(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = [];
  while (w.nextNode()) if (w.currentNode.nodeValue.includes(COIN)) list.push(w.currentNode);
  list.forEach(swap);
}
export function initRabbitCoin() {
  coinImage();
  scan(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") swap(m.target);
      else m.addedNodes.forEach((n) => { if (n.nodeType === 3 || n.nodeType === 1) scan(n); });
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}

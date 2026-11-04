/** Small UX helpers: welcome card (first visit) and a "?" help button. */
const isTouch = () => matchMedia("(pointer: coarse)").matches || innerWidth < 760;

export function initViewport() {
  const set = () => document.documentElement.style.setProperty("--app-h", (window.visualViewport?.height || innerHeight) + "px");
  set(); addEventListener("resize", set); addEventListener("orientationchange", () => setTimeout(set, 250)); window.visualViewport?.addEventListener("resize", set);
}

export function initUI() {
  const h = (tag, cls, ...kids) => { const e = document.createElement(tag); if (cls) e.className = cls; e.append(...kids.filter((k) => k != null)); return e; };
  const tips = () => isTouch()
    ? [["👆", "Drag the map", "Slide your finger to explore. Tap a hole to visit it."], ["🕹️", "Use the joystick", "Inside a burrow or the café, drag the pink knob to walk. You can also tap the floor."], ["⛏️", "Dig deeper", "Every 5 levels unlocks a new layer, a new floor and new creatures."]]
    : [["🖱️", "Drag the map", "Drag (or use the arrow keys) to explore. Click a hole to visit it."], ["⌨️", "Walk around", "Inside a burrow or the café use WASD / arrows, or click the floor."], ["⛏️", "Dig deeper", "Every 5 levels unlocks a new layer, a new floor and new creatures."]];

  const card = h("div", "welcome");
  const root = h("div", "modal hidden", card);
  document.body.append(root);
  const close = () => { root.classList.add("hidden"); try { localStorage.setItem("dh:welcome", "1"); } catch { /* private mode */ } };
  function open() {
    card.replaceChildren(
      h("div", "welcome-rabbit", "🐰"), h("h2", null, "Welcome to Deep Holes"),
      h("p", "welcome-sub", "Buy a burrow, dig it deeper and meet other rabbits underground."),
      ...tips().map(([i, t, d]) => h("div", "welcome-tip", h("span", null, i), h("div", null, h("b", null, t), h("p", null, d)))),
      Object.assign(h("button", "btn btn-large", "Let's explore ✨"), { onclick: close })
    );
    root.classList.remove("hidden");
  }
  root.addEventListener("pointerdown", (e) => { if (e.target === root) close(); });

  const help = h("button", "btn btn-secondary btn-small help-btn", "?");
  help.type = "button"; help.title = "How to play"; help.addEventListener("click", open);
  document.querySelector(".top-bar .wallet-area")?.append(help);
  try { if (!localStorage.getItem("dh:welcome")) setTimeout(open, 600); } catch { /* ignore */ }
}

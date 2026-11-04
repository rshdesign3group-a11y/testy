/**
 * User settings (saved in localStorage). Renderers read `S` directly every frame,
 * so toggling something in the settings panel takes effect immediately.
 */
const KEY = "dh:settings";
const weak = typeof navigator !== "undefined" && ((navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2));
export const DEFAULTS = {
  sound: true, music: 0.5, sfx: 0.7, steps: true, vibrate: true,
  creatures: weak ? "still" : "full",          // full | still | off  (animals, worms, bats ...)
  weather: !weak, daynight: true, particles: !weak, transitions: true, shake: true,
  joystickSide: "left", joystickSize: 1
};
export const S = { ...DEFAULTS };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { /* ignore */ }
const listeners = new Set();
export const onSettings = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function setSetting(k, v) {
  S[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* ignore */ }
  listeners.forEach((fn) => fn(k, v));
}
export const LOW_POWER = { creatures: "off", weather: false, daynight: false, particles: false, transitions: false, shake: false, music: 0.25 };
export function applyPreset(p) { for (const k in p) setSetting(k, p[k]); }

/** Settings modal + the ⚙ button in the top bar. */
export function initSettings() {
  const h = (tag, cls, ...kids) => { const e = document.createElement(tag); if (cls) e.className = cls; e.append(...kids.filter((k) => k != null)); return e; };
  const body = h("div", "sx-body");
  const root = h("div", "modal hidden", h("div", "modal-content", h("h2", null, "⚙ Settings"), body,
    h("div", "modal-actions", Object.assign(h("button", "btn btn-secondary btn-small", "Close"), { onclick: () => root.classList.add("hidden") }))));
  root.addEventListener("pointerdown", (e) => { if (e.target === root) root.classList.add("hidden"); });
  document.body.append(root);

  const toggle = (label, key, hint) => {
    const i = h("input"); i.type = "checkbox"; i.checked = !!S[key]; i.addEventListener("change", () => setSetting(key, i.checked));
    return h("label", "set-row", h("span", null, label, hint ? h("small", null, hint) : null), h("span", "sw", i, h("i")));
  };
  const range = (label, key) => {
    const i = h("input"); i.type = "range"; i.min = 0; i.max = 1; i.step = 0.05; i.value = S[key]; i.addEventListener("input", () => setSetting(key, +i.value));
    return h("label", "set-row", h("span", null, label), i);
  };
  const select = (label, key, opts, hint) => {
    const s = h("select"); opts.forEach(([v, t]) => { const o = h("option", null, t); o.value = v; s.append(o); }); s.value = S[key];
    s.addEventListener("change", () => setSetting(key, s.value)); return h("label", "set-row", h("span", null, label, hint ? h("small", null, hint) : null), s);
  };
  function render() {
    body.replaceChildren(
      h("h3", null, "Sound"), toggle("Sound on", "sound"), range("Music volume", "music"), range("Effects volume", "sfx"), toggle("Footsteps", "steps"), toggle("Vibration (phones)", "vibrate"),
      h("h3", null, "Smoothness"),
      select("Creatures", "creatures", [["full", "Animated"], ["still", "Standing still"], ["off", "Hidden"]], "Animals, worms, bats and the NPC owner"),
      toggle("Weather", "weather", "Rain, snow, petals, storms"), toggle("Day & night", "daynight", "Off = always day"),
      toggle("Ambient particles", "particles", "Dust, sparkles, fireflies"), toggle("Transition animations", "transitions", "Entering holes, digging, confetti"), toggle("Screen shake", "shake"),
      h("h3", null, "Touch controls"),
      select("Joystick side", "joystickSide", [["left", "Left"], ["right", "Right"]]), range("Joystick size", "joystickSize"),
      h("div", "modal-actions",
        Object.assign(h("button", "btn btn-small", "⚡ Low-power mode"), { onclick: () => { applyPreset(LOW_POWER); render(); } }),
        Object.assign(h("button", "btn btn-secondary btn-small", "Reset all"), { onclick: () => { applyPreset(DEFAULTS); render(); } }))
    );
  }
  const btn = h("button", "btn btn-secondary btn-small", "⚙"); btn.type = "button"; btn.title = "Settings";
  btn.addEventListener("click", () => { render(); root.classList.remove("hidden"); });
  document.querySelector(".top-bar .wallet-area")?.append(btn);
}

/**
 * Touch joystick for phones/tablets. Drag the pink knob: the rabbit walks in that direction
 * (8+ directions, analog). It writes `joy = {x, y}` (screen directions, -1..1) into the renderers,
 * which use it instead of the arrow keys. Tapping the floor still works too.
 */
export function initJoystick(host, targets) {
  const base = document.createElement("div"), knob = document.createElement("div");
  base.className = "joy"; knob.className = "joy-knob";
  base.setAttribute("aria-label", "Move joystick");
  base.append(knob); host.append(base);
  const DEAD = 0.22;
  let id = null, cx = 0, cy = 0, R = 46;
  const set = (dx, dy) => {
    const mag = Math.hypot(dx, dy), k = mag > R ? R / mag : 1, x = dx * k, y = dy * k;
    knob.style.transform = `translate(${x}px, ${y}px)`;
    const nx = x / R, ny = y / R, on = Math.hypot(nx, ny) > DEAD;
    targets().forEach((t) => { t.joy = on ? { x: nx, y: ny } : null; });
  };
  const end = () => { id = null; knob.style.transform = ""; targets().forEach((t) => { t.joy = null; }); base.classList.remove("on"); };
  base.addEventListener("pointerdown", (e) => {
    id = e.pointerId; base.setPointerCapture(id); base.classList.add("on");
    const r = base.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; R = r.width * 0.34;
    set(e.clientX - cx, e.clientY - cy); e.preventDefault();
  });
  base.addEventListener("pointermove", (e) => { if (e.pointerId === id) set(e.clientX - cx, e.clientY - cy); });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) base.addEventListener(ev, end);
  return { base };
}

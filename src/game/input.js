import { $ } from '../core/utils.js';
import { sim, mpRoom, leaveMultiplayer } from '../main.js';
import { openPause, closePause, openMpPause } from '../ui/pause.js';
import { curOpts, chooseOption, doReroll } from '../ui/levelup.js';
import { banner } from '../ui/banner.js';
import { toggleDebug } from '../render/render.js';
import { cycleSpectate } from '../net/netSim.js';
import { getSettings } from '../core/settings.js';
import { requestDash } from './systems.js';
import { sendDash } from '../net/connection.js';

export const keys = {};
export const touch = { on: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };

// Set by ui/settings.js while it's waiting for the next keydown to bind to
// an action, so this module's own shortcuts (pause, reroll, ...) don't also
// fire on the same keypress.
export let capturingKeybind = false;
export function setCapturingKeybind(v) { capturingKeybind = v; }

function toggleMpPause() {
  // Read the modal's actual visibility instead of tracking a separate flag —
  // resuming via the "계속하기" button (ui/pause.js's own click handler)
  // calls closePause() directly, which would desync a flag kept only here.
  if ($('pause').classList.contains('on')) { closePause(); return; }
  const ps = mpRoom.state.players.get(mpRoom.sessionId);
  if (!ps) return;
  const p = {
    weapons: ps.weapons.map(w => ({ id: w.id, lv: w.lv, evo: w.evo })),
    passives: ps.passives.map(q => ({ id: q.id, lv: q.lv })),
  };
  openMpPause(p, leaveMultiplayer);
}

window.addEventListener('keydown', e => {
  if (capturingKeybind) return; // ui/settings.js owns key capture right now
  keys[e.code] = true;
  const kb = getSettings().keys;
  if (mpRoom) {
    // Multiplayer doesn't use sim.G at all (that's the untouched solo
    // state) — pause here is a local-only "check my build" overlay that
    // never stops the shared server simulation (see ui/pause.js), and the
    // other solo-only shortcuts below (auto-pilot, level-up digit picks
    // tied to sim.G.mode) don't apply to a networked run.
    if (e.code === 'Escape' || e.code === kb.pause) toggleMpPause();
    if (e.code === 'F3') { e.preventDefault(); toggleDebug(); }
    if (e.code === 'Tab') { e.preventDefault(); cycleSpectate(e.shiftKey ? -1 : 1); }
    if (e.code === kb.dash) { e.preventDefault(); sendDash(mpRoom); }
    return;
  }
  if (!sim.G || sim.G.demo) return;
  if (e.code === 'Escape' || e.code === kb.pause) {
    if (sim.G.mode === 'play') openPause(); else if (sim.G.mode === 'pause') closePause();
  }
  if (sim.G.mode === 'levelup') {
    // Numpad 1/2/3 always work as a fixed fallback alongside whatever
    // pick1-3 are rebound to, same reasoning as arrow keys for movement.
    const idx = { [kb.pick1]: 0, [kb.pick2]: 1, [kb.pick3]: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
    if (idx !== undefined && curOpts[idx]) chooseOption(idx);
    if (e.code === kb.reroll) doReroll();
  }
  if (e.code === 'F2') { e.preventDefault(); sim.G.human.auto = !sim.G.human.auto; banner(sim.G.human.auto ? '자동 조종 켜짐 (강화도 자동 선택)' : '자동 조종 꺼짐', 'good'); }
  if (e.code === 'F3') { e.preventDefault(); toggleDebug(); }
  if (e.code === kb.dash && sim.G.mode === 'play') { e.preventDefault(); requestDash(sim, sim.G.human); }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (sim.G && !sim.G.demo && sim.G.mode === 'play') openPause(); });

const cv = $('game');
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return;
  touch.on = true; touch.id = e.pointerId; touch.ox = e.clientX; touch.oy = e.clientY; touch.x = touch.y = 0;
});
window.addEventListener('pointermove', e => {
  if (!touch.on || e.pointerId !== touch.id) return;
  let dx = e.clientX - touch.ox, dy = e.clientY - touch.oy; const d = Math.hypot(dx, dy), m = 50;
  if (d > m) { dx *= m / d; dy *= m / d; }
  touch.x = dx / m; touch.y = dy / m;
});
const endTouch = e => { if (e.pointerId === touch.id) { touch.on = false; touch.x = touch.y = 0; } };
window.addEventListener('pointerup', endTouch);
window.addEventListener('pointercancel', endTouch);

export function getInput(p) {
  if (p !== sim.G.human) return { x: 0, y: 0 };
  const kb = getSettings().keys;
  let dx = 0, dy = 0;
  // Arrow keys always work as a fixed fallback alongside whatever the
  // move* actions are rebound to, so rebinding can never fully lock
  // movement out.
  if (keys[kb.moveUp] || keys.ArrowUp) dy -= 1;
  if (keys[kb.moveDown] || keys.ArrowDown) dy += 1;
  if (keys[kb.moveLeft] || keys.ArrowLeft) dx -= 1;
  if (keys[kb.moveRight] || keys.ArrowRight) dx += 1;
  dx += touch.x; dy += touch.y;
  return { x: dx, y: dy };
}

import { $ } from '../core/utils.js';
import { G } from './state.js';
import { openPause, closePause } from '../ui/pause.js';
import { curOpts, chooseOption, doReroll } from '../ui/levelup.js';
import { banner } from '../ui/banner.js';
import { toggleDebug } from '../render/render.js';

export const keys = {};
export const touch = { on: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };

window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (!G || G.demo) return;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (G.mode === 'play') openPause(); else if (G.mode === 'pause') closePause();
  }
  if (G.mode === 'levelup') {
    const idx = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
    if (idx !== undefined && curOpts[idx]) chooseOption(idx);
    if (e.code === 'KeyR') doReroll();
  }
  if (e.code === 'F2') { e.preventDefault(); G.human.auto = !G.human.auto; banner(G.human.auto ? '자동 조종 켜짐 (강화도 자동 선택)' : '자동 조종 꺼짐', 'good'); }
  if (e.code === 'F3') { e.preventDefault(); toggleDebug(); }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (G && !G.demo && G.mode === 'play') openPause(); });

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

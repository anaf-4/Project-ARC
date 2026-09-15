import { $ } from '../core/utils.js';
import { WEAPONS, PASSIVES } from '../data/tables.js';
import { iconHTML } from '../data/icons.js';
import { buildHTML } from './shared.js';
import { finishGame } from './result.js';
import { sim } from '../main.js';

// Set while a multiplayer pause overlay is showing. Multiplayer pause is
// purely a local "check my build" view — it does not touch sim.G (that's
// the solo state, untouched by multiplayer) and does not pause the shared
// server simulation (see server/rooms/GameRoom.js — the tick keeps running
// for every player regardless of who has this overlay open).
let mpLeaveFn = null;

export function openPause(p) {
  p = p || sim.G.human;
  if (!mpLeaveFn) sim.G.mode = 'pause';
  $('quitBtn').textContent = mpLeaveFn ? '방 나가기' : '포기하고 정산';
  $('pBuild').innerHTML = buildHTML(p);
  $('pRecipes').innerHTML = Object.entries(WEAPONS).map(([id, D]) => {
    const w = p.weapons.find(w => w.id === id), hasP = p.passives.some(q => q.id === D.pair);
    const hasCombo = D.comboWith && p.weapons.some(w2 => w2.id === D.comboWith);
    const cls = w && w.evo ? 'done' : (w && (hasP || hasCombo) ? 'have' : '');
    const reqText = D.comboWith ? `${iconHTML(PASSIVES[D.pair].icon)} ${PASSIVES[D.pair].name} 또는 ${iconHTML(WEAPONS[D.comboWith].icon)} ${WEAPONS[D.comboWith].name}` : `${iconHTML(PASSIVES[D.pair].icon)} ${PASSIVES[D.pair].name}`;
    return `<tr class="${cls}"><td>${iconHTML(D.icon)} ${D.name}${w ? (w.evo ? ' (진화 완료)' : ` Lv ${w.lv}`) : ''}</td><td class="arrow">+</td><td>${reqText}</td><td class="arrow">→</td><td>${iconHTML(D.evoIcon)} ${D.evo}</td></tr>`;
  }).join('');
  $('pause').classList.add('on');
  $('resumeBtn').focus({ preventScroll: true });
}
export function openMpPause(p, onLeave) {
  mpLeaveFn = onLeave;
  openPause(p);
}
// Called from main.js's leaveMultiplayer(): without this, a later solo run
// would inherit a stale mpLeaveFn — openPause() would wrongly skip pausing
// sim.G and quitBtn would keep showing "방 나가기" (and call back into a
// multiplayer leave callback for a room that no longer exists).
export function clearMpPause() { mpLeaveFn = null; }
export function closePause() {
  $('pause').classList.remove('on');
  if (!mpLeaveFn && sim.G) sim.G.mode = 'play';
}
$('resumeBtn').addEventListener('click', closePause);
$('pauseBtn').addEventListener('click', () => { if (sim.G && !sim.G.demo && sim.G.mode === 'play') openPause(); });
$('quitBtn').addEventListener('click', () => {
  $('pause').classList.remove('on');
  if (mpLeaveFn) { const fn = mpLeaveFn; mpLeaveFn = null; fn(); return; }
  finishGame();
});

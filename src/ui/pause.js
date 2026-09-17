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
  // A weapon with altEvos gets one recipe row per possible evolution — a
  // different skill really does lead down a different tree, so the table
  // needs to show every road, not just the first one written in tables.js.
  $('pRecipes').innerHTML = Object.entries(WEAPONS).flatMap(([id, D]) => {
    const w = p.weapons.find(w => w.id === id);
    const row = (reqPair, reqCombo, evoName, evoIcon, done) => {
      const hasP = p.passives.some(q => q.id === reqPair);
      const hasCombo = reqCombo && p.weapons.some(w2 => w2.id === reqCombo);
      const cls = done ? 'done' : (w && (hasP || hasCombo) ? 'have' : '');
      const reqText = reqCombo
        ? `${iconHTML(PASSIVES[reqPair].icon)} ${PASSIVES[reqPair].name} 또는 ${iconHTML(WEAPONS[reqCombo].icon)} ${WEAPONS[reqCombo].name}`
        : `${iconHTML(PASSIVES[reqPair].icon)} ${PASSIVES[reqPair].name}`;
      return `<tr class="${cls}"><td>${iconHTML(D.icon)} ${D.name}${w ? (w.evo ? ' (진화 완료)' : ` Lv ${w.lv}`) : ''}</td><td class="arrow">+</td><td>${reqText}</td><td class="arrow">→</td><td>${iconHTML(evoIcon)} ${evoName}</td></tr>`;
    };
    const rows = [row(D.pair, D.comboWith, D.evo, D.evoIcon, w && w.evo && w.altIdx < 0)];
    if (D.altEvos) D.altEvos.forEach((a, i) => rows.push(row(a.pair, a.comboWith, a.evo, a.evoIcon, w && w.evo && w.altIdx === i)));
    return rows;
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

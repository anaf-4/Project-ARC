import { $ } from '../core/utils.js';
import { WEAPONS, PASSIVES } from '../data/tables.js';
import { G } from '../game/state.js';
import { buildHTML } from './shared.js';
import { finishGame } from './result.js';

export function openPause() {
  G.mode = 'pause';
  const h = G.human;
  $('pBuild').innerHTML = buildHTML(h);
  $('pRecipes').innerHTML = Object.entries(WEAPONS).map(([id, D]) => {
    const w = h.weapons.find(w => w.id === id), hasP = h.passives.some(q => q.id === D.pair);
    const cls = w && w.evo ? 'done' : (w && hasP ? 'have' : '');
    return `<tr class="${cls}"><td>${D.icon} ${D.name}${w ? (w.evo ? ' (진화 완료)' : ` Lv ${w.lv}`) : ''}</td><td class="arrow">+</td><td>${PASSIVES[D.pair].icon} ${PASSIVES[D.pair].name}</td><td class="arrow">→</td><td>${D.evoIcon} ${D.evo}</td></tr>`;
  }).join('');
  $('pause').classList.add('on');
  $('resumeBtn').focus({ preventScroll: true });
}
export function closePause() { $('pause').classList.remove('on'); if (G) G.mode = 'play'; }
$('resumeBtn').addEventListener('click', closePause);
$('pauseBtn').addEventListener('click', () => { if (G && !G.demo && G.mode === 'play') openPause(); });
$('quitBtn').addEventListener('click', () => { $('pause').classList.remove('on'); finishGame(); });

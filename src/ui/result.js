import { $, fmt } from '../core/utils.js';
import { G, startDemo } from '../game/state.js';
import { meta, saveMeta } from '../core/meta.js';
import { buildHTML } from './shared.js';
import { renderLobby } from './lobby.js';

export function finishGame() {
  if (G.demo) { startDemo(); return; }
  if (G.mode === 'over') return;
  G.mode = 'over';
  $('levelup').classList.remove('on'); $('pauseBtn').classList.remove('on');
  const h = G.human;
  const earned = Math.floor((G.kills / 15 + G.time / 8 + h.level * 2) * (G.won ? 1.5 : 1)) + G.bonusShards;
  meta.shards += earned; saveMeta();
  $('rTitle').textContent = G.won ? '스테이지 클리어' : '작전 실패';
  $('rTitle').style.color = G.won ? 'var(--aether)' : 'var(--danger)';
  $('rSub').textContent = G.won ? '아크 코어를 격파했습니다. 파티 전원에게 보상이 지급됩니다.' : '파티가 전멸했습니다. 모은 에테르 파편은 그대로 정산됩니다.';
  $('rStats').innerHTML = [[fmt(G.time), '생존 시간'], [G.kills.toLocaleString(), '처치'], ['Lv ' + h.level, '최종 레벨'], ['◆ ' + earned, '에테르 파편']]
    .map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  $('rBuild').innerHTML = buildHTML(h);
  $('result').classList.add('on');
  $('toLobbyBtn').focus({ preventScroll: true });
}
$('toLobbyBtn').addEventListener('click', () => {
  $('result').classList.remove('on');
  startDemo(); renderLobby(); $('lobby').classList.add('on');
});

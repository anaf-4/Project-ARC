import { $ } from '../core/utils.js';
import { CLASSES, WEAPONS, META, metaCost } from '../data/tables.js';
import { saveMeta } from '../core/meta.js';
import { newGame } from '../game/state.js';
import { banner } from './banner.js';
import { sim } from '../main.js';
import { connect } from '../net/connection.js';
import { startMultiplayer } from '../main.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'ws://localhost:2567';

export const sel = { cls: 'vanguard', party: 1, stage: 900 };

export function renderLobby() {
  $('classGrid').innerHTML = Object.entries(CLASSES).map(([id, c]) => `
    <button class="cls" data-id="${id}" aria-pressed="${sel.cls === id}" style="--c:${c.color}">
      <span class="sigil">${c.sigil}</span>
      <span class="cname">${c.name}<small>${c.role}</small></span>
      <span class="cdesc">${c.desc}</span>
      <span class="cmeta">${WEAPONS[c.weapon].icon} ${WEAPONS[c.weapon].name}로 시작. ${c.traits}</span>
    </button>`).join('');
  $('partySeg').innerHTML = [1, 2, 3, 4].map(n => `<button data-n="${n}" aria-pressed="${sel.party === n}">${n === 1 ? '솔로' : n + '인'}</button>`).join('');
  $('stageSeg').innerHTML = [[360, '퀵 6분'], [900, '표준 15분']].map(([s, l]) => `<button data-s="${s}" aria-pressed="${sel.stage === s}">${l}</button>`).join('');
  $('shardCount').textContent = sim.meta.shards.toLocaleString();
  $('metaList').innerHTML = META.map(m => {
    const l = sim.meta.lv[m.id] || 0, maxed = l >= m.max, cost = metaCost(l);
    return `<div class="mrow"><span class="mi">${m.icon}</span><div><b>${m.name}</b><span>${m.desc}</span></div>
      <div class="pips">${Array.from({ length: m.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div>
      <button class="buy" data-m="${m.id}" ${maxed || sim.meta.shards < cost ? 'disabled' : ''}>${maxed ? '완료' : '◆ ' + cost}</button></div>`;
  }).join('');
}
$('classGrid').addEventListener('click', e => { const b = e.target.closest('.cls'); if (b) { sel.cls = b.dataset.id; renderLobby(); } });
$('partySeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { sel.party = +b.dataset.n; renderLobby(); } });
$('stageSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { sel.stage = +b.dataset.s; renderLobby(); } });
$('metaList').addEventListener('click', e => {
  const b = e.target.closest('.buy'); if (!b || b.disabled) return;
  const m = META.find(x => x.id === b.dataset.m), l = sim.meta.lv[m.id] || 0, cost = metaCost(l);
  if (l >= m.max || sim.meta.shards < cost) return;
  sim.meta.shards -= cost; sim.meta.lv[m.id] = l + 1; saveMeta(sim.meta); renderLobby();
});
$('startBtn').addEventListener('click', startRun);
export function startRun() {
  $('lobby').classList.remove('on');
  newGame(sim, { cls: sel.cls, party: sel.party, stage: sel.stage });
  $('pauseBtn').classList.add('on');
  banner('에테르 결정을 모아 성장하세요', 'good');
}

$('coopBtn').addEventListener('click', async () => {
  $('coopBtn').disabled = true; $('coopBtn').textContent = '접속 중...';
  try {
    const { room, state } = await connect(SERVER_URL, sel.cls, 'Player');
    $('lobby').classList.remove('on');
    startMultiplayer(room, state);
  } catch (err) {
    banner('접속 실패: ' + err.message, 'danger');
    $('coopBtn').disabled = false; $('coopBtn').textContent = '온라인 협동 접속';
  }
});

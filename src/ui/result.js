import { $, fmt } from '../core/utils.js';
import { startDemo } from '../game/state.js';
import { saveMeta } from '../core/meta.js';
import { buildHTML } from './shared.js';
import { CLASSES } from '../data/tables.js';
import { renderLobby } from './lobby.js';
import { sim, leaveMultiplayer } from '../main.js';

// Set while the currently-shown result screen is the multiplayer one (see
// showMpResult below), so toLobbyBtn's one shared click handler knows
// whether to leave the room or just reset the (untouched) solo state.
let mpMode = false;

// Multiplayer's "party wipe"/"stage clear" result screen — GameRoom flips
// state.phase to 'ended' once (see server/rooms/GameRoom.js's onGameOver
// hook) and ui/lobby.js's wireRoom() calls this in response. Unlike solo's
// finishGame(), which only ever has one player (sim.G.human) to report on,
// every real player here gets their own kills/build line — that's what the
// user actually asked for instead of a single flat "파티 전멸" banner.
export function showMpResult(room) {
  mpMode = true;
  const state = room.state;
  $('levelup').classList.remove('on'); $('pause').classList.remove('on');
  const players = [];
  state.players.forEach((p, sid) => players.push({ ...p, sid, weapons: p.weapons.map(w => ({ id: w.id, lv: w.lv, evo: w.evo, altIdx: w.altIdx })), passives: p.passives.map(q => ({ id: q.id, lv: q.lv })) }));
  const me = players.find(p => p.sid === room.sessionId) || players[0];
  const totalKills = players.reduce((s, p) => s + p.kills, 0);
  const earned = Math.floor((me.kills / 15 + state.time / 8 + me.level * 2) * (state.won ? 1.5 : 1)) + state.bonusShards;
  sim.meta.shards += earned; saveMeta(sim.meta);
  $('rTitle').textContent = state.won ? '스테이지 클리어' : '작전 실패';
  $('rTitle').style.color = state.won ? 'var(--aether)' : 'var(--danger)';
  $('rSub').textContent = state.won ? '아크 코어를 격파했습니다. 파티 전원에게 보상이 지급됩니다.' : '파티가 전멸했습니다. 모은 에테르 파편은 그대로 정산됩니다.';
  $('rStats').innerHTML = [[fmt(state.time), '생존 시간'], [totalKills.toLocaleString(), '파티 총 처치'], ['Lv ' + me.level, '내 최종 레벨'], ['◆ ' + earned, '에테르 파편']]
    .map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  $('rBuild').innerHTML = players.map(p => `
    <div class="mrow"><span class="mi">${CLASSES[p.cls]?.sigil || '?'}</span><div><b>${p.name}${p.sid === room.sessionId ? ' (나)' : ''}${p.dead ? ' 💀' : ''}</b><span>${CLASSES[p.cls]?.name || p.cls} · Lv ${p.level} · 처치 ${p.kills}</span></div></div>
    <div class="build" style="margin:6px 0 14px 40px">${buildHTML(p)}</div>`).join('');
  $('result').classList.add('on');
  $('toLobbyBtn').focus({ preventScroll: true });
}

export function finishGame() {
  mpMode = false;
  if (sim.G.demo) { startDemo(sim); return; }
  if (sim.G.mode === 'over') return;
  sim.G.mode = 'over';
  $('levelup').classList.remove('on'); $('pauseBtn').classList.remove('on');
  const h = sim.G.human;
  const earned = Math.floor((sim.G.kills / 15 + sim.G.time / 8 + h.level * 2) * (sim.G.won ? 1.5 : 1)) + sim.G.bonusShards;
  sim.meta.shards += earned; saveMeta(sim.meta);
  $('rTitle').textContent = sim.G.won ? '스테이지 클리어' : '작전 실패';
  $('rTitle').style.color = sim.G.won ? 'var(--aether)' : 'var(--danger)';
  $('rSub').textContent = sim.G.won ? '아크 코어를 격파했습니다. 파티 전원에게 보상이 지급됩니다.' : '파티가 전멸했습니다. 모은 에테르 파편은 그대로 정산됩니다.';
  $('rStats').innerHTML = [[fmt(sim.G.time), '생존 시간'], [sim.G.kills.toLocaleString(), '처치'], ['Lv ' + h.level, '최종 레벨'], ['◆ ' + earned, '에테르 파편']]
    .map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  $('rBuild').innerHTML = buildHTML(h);
  $('result').classList.add('on');
  $('toLobbyBtn').focus({ preventScroll: true });
}
$('toLobbyBtn').addEventListener('click', () => {
  $('result').classList.remove('on');
  if (mpMode) { mpMode = false; leaveMultiplayer(); return; }
  startDemo(sim); renderLobby(); $('lobby').classList.add('on');
});

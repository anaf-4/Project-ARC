import { $ } from '../core/utils.js';
import { CLASSES, WEAPONS, META, metaCost } from '../data/tables.js';
import { saveMeta } from '../core/meta.js';
import { newGame } from '../game/state.js';
import { banner } from './banner.js';
import { sim, startMultiplayer, clearMultiplayerRoom } from '../main.js';
import { createRoom, joinRoom, kickPlayer, setMaxPlayers, startGame, chooseLevelUp } from '../net/connection.js';
import { pushFx } from '../net/netFx.js';
import { showMpLevelUp } from './levelup.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'ws://localhost:2567';

export const sel = { cls: 'vanguard', party: 1, stage: 900, maxPlayers: 4 };
let classPickMode = 'solo'; // 'solo' | 'create' | 'join'
let mp = null; // the Colyseus room once connected — always read mp.state live (it's a getter), never cache it

const SCREENS = ['screenMenu', 'screenMultiChoice', 'screenClassPick', 'screenWaiting'];
const SCREEN_STACK = { screenMenu: null, screenMultiChoice: 'screenMenu', screenClassPick: 'screenMultiChoice', screenWaiting: null };

function showScreen(name) {
  for (const s of SCREENS) $(s).hidden = s !== name;
  $('backBtn').hidden = name === 'screenMenu' || name === 'screenWaiting';
}
// Called from main.js's leaveMultiplayer(): the lobby's screen state is
// otherwise never reset when a multiplayer run ends, because starting the
// game hides the whole #lobby element without ever calling showScreen() —
// so without this, returning here would show whatever screen (e.g. the
// stale pre-game waiting room) was last visible before gameplay started.
export function resetToMenu() { showScreen('screenMenu'); }

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
  $('maxPlayersSeg').innerHTML = [2, 3, 4].map(n => `<button data-n="${n}" aria-pressed="${sel.maxPlayers === n}">${n}인</button>`).join('');
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
$('maxPlayersSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { sel.maxPlayers = +b.dataset.n; renderLobby(); } });
$('metaList').addEventListener('click', e => {
  const b = e.target.closest('.buy'); if (!b || b.disabled) return;
  const m = META.find(x => x.id === b.dataset.m), l = sim.meta.lv[m.id] || 0, cost = metaCost(l);
  if (l >= m.max || sim.meta.shards < cost) return;
  sim.meta.shards -= cost; sim.meta.lv[m.id] = l + 1; saveMeta(sim.meta); renderLobby();
});

// ---------------- 메뉴 / 화면 전환 ----------------
$('soloModeBtn').addEventListener('click', () => {
  classPickMode = 'solo';
  $('soloOpts').hidden = false; $('createOpts').hidden = true; $('joinOpts').hidden = true;
  $('classPickConfirmBtn').textContent = '출격';
  renderLobby();
  showScreen('screenClassPick');
});
$('multiModeBtn').addEventListener('click', () => showScreen('screenMultiChoice'));
$('createRoomBtn').addEventListener('click', () => {
  classPickMode = 'create';
  $('soloOpts').hidden = true; $('createOpts').hidden = false; $('joinOpts').hidden = true;
  $('classPickConfirmBtn').textContent = '방 만들기';
  renderLobby();
  showScreen('screenClassPick');
});
$('joinRoomBtn').addEventListener('click', () => {
  classPickMode = 'join';
  $('soloOpts').hidden = true; $('createOpts').hidden = true; $('joinOpts').hidden = false;
  $('classPickConfirmBtn').textContent = '접속하기';
  renderLobby();
  showScreen('screenClassPick');
});
$('backBtn').addEventListener('click', () => {
  const current = SCREENS.find(s => !$(s).hidden);
  const parent = SCREEN_STACK[current];
  if (mp) { mp.leave(); mp = null; }
  showScreen(parent || 'screenMenu');
});

$('classPickConfirmBtn').addEventListener('click', async () => {
  if (classPickMode === 'solo') { startRun(); return; }
  const btn = $('classPickConfirmBtn');
  btn.disabled = true;
  try {
    if (classPickMode === 'create') {
      mp = (await createRoom(SERVER_URL, sel.cls, '나', sel.maxPlayers)).room;
    } else {
      const code = $('roomCode').value.trim();
      if (!code) { banner('방 코드를 입력하세요', 'warn'); btn.disabled = false; return; }
      mp = (await joinRoom(SERVER_URL, code, sel.cls, '나')).room;
    }
    wireRoom(mp);
    showScreen('screenWaiting');
    // Don't render here: room.state may not have finished decoding yet
    // (state.players can briefly be undefined right after join resolves).
    // wireRoom's onStateChange listener calls renderWaitingRoom() once real
    // state has arrived, and again on every subsequent change.
  } catch (err) {
    banner('접속 실패: ' + err.message, 'danger');
  } finally {
    btn.disabled = false;
  }
});

// ---------------- 대기실 ----------------
function wireRoom(room) {
  // Register as soon as the room connects, well before gameplay starts —
  // registering this later (e.g. only once phase flips to 'playing') risks
  // missing the first 'fx' broadcasts that land in the same tick as the
  // phase transition itself.
  room.onMessage('fx', pushFx);
  room.onMessage('levelup', (msg) => {
    const ps = room.state.players.get(room.sessionId);
    if (!ps) return;
    const p = {
      weapons: ps.weapons.map(w => ({ id: w.id, lv: w.lv, evo: w.evo })),
      passives: ps.passives.map(q => ({ id: q.id, lv: q.lv })),
    };
    showMpLevelUp(msg.options, p, (index) => chooseLevelUp(room, index));
  });
  room.onStateChange(() => {
    if (!mp) return;
    // Always read room.state live (it's a getter) rather than a captured
    // reference — Colyseus can swap the underlying state object on a big
    // transition like waiting->playing, which would silently orphan a
    // snapshot taken earlier and crash the next frame that reads it.
    if (room.state.phase === 'playing') {
      const finishedRoom = room; mp = null;
      startMultiplayer(finishedRoom);
      $('lobby').classList.remove('on');
      return;
    }
    renderWaitingRoom();
  });
  room.onLeave(() => {
    if (mp) { mp = null; banner('방 연결이 끊어졌습니다', 'danger'); showScreen('screenMenu'); return; }
    // Disconnected mid-gameplay (mp was already cleared when phase flipped
    // to 'playing') — main.js's mpRoom still points at this now-dead room
    // otherwise, leaving the client stuck rendering a frozen last frame
    // with no way back to the menu. Only clears the reference; doesn't call
    // .leave() again (the room already closed — that's why this fired).
    if (clearMultiplayerRoom()) { banner('방 연결이 끊어졌습니다', 'danger'); resetToMenu(); $('lobby').classList.add('on'); }
  });
}

function renderWaitingRoom() {
  if (!mp) return;
  const room = mp, state = room.state;
  if (!state.players) return; // state can briefly be mid-decode right after join
  const isHost = state.hostSessionId === room.sessionId;
  $('waitingRoomCode').textContent = `방 코드: ${room.roomId}`;
  const rows = [];
  state.players.forEach((p, sid) => {
    const you = sid === room.sessionId ? ' (나)' : '';
    const hostTag = sid === state.hostSessionId ? ' 👑' : '';
    const kick = isHost && sid !== room.sessionId
      ? `<button class="buy" data-kick="${sid}">추방</button>` : '';
    rows.push(`<div class="mrow"><span class="mi">${CLASSES[p.cls]?.sigil || '?'}</span><div><b>${p.name}${you}${hostTag}</b><span>${CLASSES[p.cls]?.name || p.cls}</span></div>${kick}</div>`);
  });
  $('playerList').innerHTML = rows.join('');
  $('hostControls').hidden = !isHost;
  $('waitingHint').hidden = isHost;
  if (isHost) {
    $('waitingMaxSeg').innerHTML = [2, 3, 4].map(n => `<button data-n="${n}" aria-pressed="${state.maxPlayers === n}">${n}인</button>`).join('');
  }
}
$('playerList').addEventListener('click', e => {
  const b = e.target.closest('[data-kick]'); if (!b || !mp) return;
  kickPlayer(mp, b.dataset.kick);
});
$('waitingMaxSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !mp) return;
  setMaxPlayers(mp, +b.dataset.n);
});
$('startGameBtn').addEventListener('click', () => { if (mp) startGame(mp); });

// ---------------- 솔로 ----------------
export function startRun() {
  $('lobby').classList.remove('on');
  newGame(sim, { cls: sel.cls, party: sel.party, stage: sel.stage });
  $('pauseBtn').classList.add('on');
  banner('에테르 결정을 모아 성장하세요', 'good');
}

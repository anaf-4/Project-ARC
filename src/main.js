import '../style.css';
import { createSimulation } from './core/simulation.js';
import { startDemo } from './game/state.js';
import { update } from './game/systems.js';
import { render, tickFps } from './render/render.js';
import { renderLobby, resetToMenu } from './ui/lobby.js';
import { loadMeta } from './core/meta.js';
import { banner } from './ui/banner.js';
import { openLevelUp } from './ui/levelup.js';
import { finishGame } from './ui/result.js';
import { getInput, keys as keysRef } from './game/input.js';
import { W, H } from './core/canvas.js';
import { $ } from './core/utils.js';
import { netSimFromState } from './net/netSim.js';
import { sendMove } from './net/connection.js';
import { updateNetFx, getNetFx } from './net/netFx.js';
import { clearMpPause } from './ui/pause.js';
import './ui/settings.js';
import { loadSettings, getSettings } from './core/settings.js';
import { initAudio, startMusic, playHit, playHurt } from './core/audio.js';

loadSettings();

export const sim = createSimulation();
sim.onBanner = banner;
sim.onLevelUp = openLevelUp;
sim.onGameOver = finishGame;
sim.onHit = (kind) => { if (kind === 'hurt') playHurt(); else playHit(); };

// AudioContext can't start before a user gesture (autoplay policy) — kick it
// off on whichever comes first, then never again.
let audioStarted = false;
function startAudioOnce() {
  if (audioStarted) return;
  audioStarted = true;
  initAudio(getSettings().vol);
  startMusic();
}
document.addEventListener('pointerdown', startAudioOnce, { once: true });
document.addEventListener('keydown', startAudioOnce, { once: true });

// ---------------- 멀티플레이어 ----------------
export let mpRoom = null;

export function startMultiplayer(room) {
  mpRoom = room;
  // 공유 세션이라 개인 일시정지가 없음 — 정지 버튼을 숨긴다
  $('pauseBtn')?.classList.remove('on');
}
// Called from game/input.js when the player leaves via the multiplayer
// pause overlay's "방 나가기" button.
export function leaveMultiplayer() {
  if (mpRoom) { mpRoom.leave(); mpRoom = null; }
  clearMpPause();
  renderLobby();
  resetToMenu();
  $('lobby').classList.add('on');
}
// Called from ui/lobby.js's room.onLeave when the connection drops mid-
// gameplay (not via the user-initiated leaveMultiplayer() above, which
// already handles its own cleanup) — just clears the dead reference so the
// frame loop stops trying to render it. Returns whether there was
// anything to clear, so the caller knows whether this fired for the room
// it's currently tracking.
export function clearMultiplayerRoom() {
  if (!mpRoom) return false;
  mpRoom = null;
  return true;
}

// 서버 틱(20Hz)보다 자주 보내봐야 의미가 없으므로 입력 전송도 같은 주기로 제한
const MOVE_SEND_INTERVAL = 1 / 20;
let moveSendAcc = 0;
function mpInputLoop(dt) {
  if (!mpRoom) return;
  moveSendAcc += dt;
  if (moveSendAcc < MOVE_SEND_INTERVAL) return;
  moveSendAcc = 0;
  const kb = getSettings().keys;
  let dx = 0, dy = 0;
  if (keysRef[kb.moveUp] || keysRef.ArrowUp) dy -= 1;
  if (keysRef[kb.moveDown] || keysRef.ArrowDown) dy += 1;
  if (keysRef[kb.moveLeft] || keysRef.ArrowLeft) dx -= 1;
  if (keysRef[kb.moveRight] || keysRef.ArrowRight) dx += 1;
  sendMove(mpRoom, dx, dy);
}

// ---------------- 메인 루프 ----------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  // rAF only ever fires as fast as the display's actual refresh rate — this
  // cap can throttle it down (e.g. to spare a laptop battery even on a
  // 240Hz screen) but can never make it exceed what the display provides.
  if (now - last < 1000 / getSettings().fps) return;
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;
  tickFps(dt);
  if (mpRoom) {
    mpInputLoop(dt);
    updateNetFx(dt);
    // netSimFromState returns null while state.players/state.enemies aren't
    // decoded yet, and G.human can be null for a frame or two after that,
    // before the local session's player syncs into state.players. render()'s
    // drawHUD dereferences G.human unconditionally, so skip the render call
    // entirely on those frames instead of crashing.
    const netSim = netSimFromState(mpRoom.state, mpRoom.sessionId, dt);
    if (netSim) {
      netSim.pools.fxs.live = getNetFx();
      if (netSim.G.human) render(netSim);
    }
    return;
  }
  if (sim.G) { sim.G.viewW = W; sim.G.viewH = H; }
  if (sim.G && sim.G.mode === 'play') update(sim, dt, getInput);
  render(sim);
}
startDemo(sim);
renderLobby();
loadMeta(sim.meta).then(renderLobby);
requestAnimationFrame(frame);

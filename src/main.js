import '../style.css';
import { createSimulation } from './core/simulation.js';
import { startDemo } from './game/state.js';
import { update } from './game/systems.js';
import { render, tickFps } from './render/render.js';
import { renderLobby } from './ui/lobby.js';
import { loadMeta } from './core/meta.js';
import { banner } from './ui/banner.js';
import { openLevelUp } from './ui/levelup.js';
import { finishGame } from './ui/result.js';
import { getInput, keys as keysRef } from './game/input.js';
import { W, H } from './core/canvas.js';
import { $ } from './core/utils.js';
import { netSimFromState } from './net/netSim.js';
import { sendMove } from './net/connection.js';

export const sim = createSimulation();
sim.onBanner = banner;
sim.onLevelUp = openLevelUp;
sim.onGameOver = finishGame;

// ---------------- 멀티플레이어 ----------------
let mpRoom = null, mpState = null;

export function startMultiplayer(room, state) {
  mpRoom = room; mpState = state;
  // 공유 세션이라 개인 일시정지가 없음 — 정지 버튼을 숨긴다
  $('pauseBtn')?.classList.remove('on');
}

function mpInputLoop() {
  requestAnimationFrame(mpInputLoop);
  if (!mpRoom) return;
  let dx = 0, dy = 0;
  if (keysRef.KeyW || keysRef.ArrowUp) dy -= 1;
  if (keysRef.KeyS || keysRef.ArrowDown) dy += 1;
  if (keysRef.KeyA || keysRef.ArrowLeft) dx -= 1;
  if (keysRef.KeyD || keysRef.ArrowRight) dx += 1;
  sendMove(mpRoom, dx, dy);
}

// ---------------- 메인 루프 ----------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;
  tickFps(dt);
  if (mpRoom) {
    // netSimFromState's G.human can be null for a frame or two right after
    // connecting, before the local session's player syncs into
    // state.players. render()'s drawHUD dereferences G.human unconditionally,
    // so skip the render call entirely on those frames instead of crashing.
    const netSim = netSimFromState(mpState, mpRoom.sessionId);
    if (netSim.G.human) render(netSim);
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
requestAnimationFrame(mpInputLoop);

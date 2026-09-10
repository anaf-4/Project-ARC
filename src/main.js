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
import { getInput } from './game/input.js';
import { W, H } from './core/canvas.js';

export const sim = createSimulation();
sim.onBanner = banner;
sim.onLevelUp = openLevelUp;
sim.onGameOver = finishGame;

// ---------------- 메인 루프 ----------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;
  tickFps(dt);
  if (sim.G) { sim.G.viewW = W; sim.G.viewH = H; }
  if (sim.G && sim.G.mode === 'play') update(sim, dt, getInput);
  render(sim);
}
startDemo(sim);
renderLobby();
loadMeta(sim.meta).then(renderLobby);
requestAnimationFrame(frame);

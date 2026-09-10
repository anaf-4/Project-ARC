import '../style.css';
import { G, startDemo } from './game/state.js';
import { update } from './game/systems.js';
import { render, tickFps } from './render/render.js';
import { renderLobby } from './ui/lobby.js';
import { loadMeta } from './core/meta.js';

// ---------------- 메인 루프 ----------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;
  tickFps(dt);
  if (G && G.mode === 'play') update(dt);
  render();
}
startDemo();
renderLobby();
loadMeta().then(renderLobby);
requestAnimationFrame(frame);

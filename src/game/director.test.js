import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../core/simulation.js';
import { newGame } from './state.js';
import { director } from './director.js';

test('director spawns enemies over time without a canvas', () => {
  const sim = createSimulation();
  newGame(sim, { cls: 'vanguard', party: 1, stage: 360 });
  sim.G.viewW = 1280; sim.G.viewH = 800;
  for (let i = 0; i < 60; i++) director(sim, 0.5); // 30 simulated seconds
  assert.ok(sim.pools.enemies.live.length > 0);
});

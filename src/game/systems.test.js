import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../core/simulation.js';
import { newGame } from './state.js';
import { update } from './systems.js';

test('update advances game clock and runs the director', () => {
  const sim = createSimulation();
  newGame(sim, { cls: 'vanguard', party: 1, stage: 360 });
  for (let i = 0; i < 120; i++) update(sim, 0.05); // 6 simulated seconds
  assert.ok(sim.G.clock > 5.9);
  assert.ok(sim.pools.enemies.live.length > 0);
});

test('onLevelUp fires instead of touching the DOM', () => {
  const sim = createSimulation();
  newGame(sim, { cls: 'vanguard', party: 1, stage: 360 });
  let fired = false;
  sim.onLevelUp = () => { fired = true; };
  sim.G.human.pending = 1;
  update(sim, 0.016);
  assert.equal(fired, true);
});

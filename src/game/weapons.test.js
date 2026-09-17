import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../core/simulation.js';
import { newGame } from './state.js';
import { updateWeapons } from './weapons.js';

test('blade weapon fires and damages a nearby enemy', () => {
  const sim = createSimulation();
  newGame(sim, { cls: 'vanguard', party: 1, stage: 360 });
  const p = sim.G.human;
  const e = sim.pools.enemies.get();
  e.x = p.x + 20; e.y = p.y; e.r = 5; e.hp = 100; e.maxHp = 100; e.boss = false; e.elite = false; e.alive = true;
  sim.spatial.gridBuild();
  p.weapons[0].t = 0; // force ready to fire
  updateWeapons(sim, p, 0.016);
  assert.ok(e.hp < 100);
});

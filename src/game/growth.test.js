import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../core/simulation.js';
import { newGame } from './state.js';
import { gainXp } from './growth.js';

test('gaining enough xp levels up the player', () => {
  const sim = createSimulation();
  newGame(sim, { cls: 'vanguard', party: 1, stage: 360 });
  const p = sim.G.human;
  const startLevel = p.level;
  gainXp(sim, p, p.xpNext + 1);
  assert.ok(p.level > startLevel);
});

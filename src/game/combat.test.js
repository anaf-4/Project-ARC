import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../core/simulation.js';
import { newGame, makePlayer } from './state.js';
import { damage, kill } from './combat.js';

function withGame() {
  const sim = createSimulation();
  newGame(sim, { cls: 'vanguard', party: 1, stage: 360 });
  return sim;
}

test('damage kills an enemy and awards a kill to the attacker', () => {
  const sim = withGame();
  const p = sim.G.human;
  const e = sim.pools.enemies.get();
  e.x = 0; e.y = 0; e.r = 5; e.hp = 10; e.maxHp = 10; e.xp = 1; e.boss = false; e.elite = false;
  damage(sim, e, 999, p, 0, 0, true);
  assert.equal(e.alive, false);
  assert.equal(sim.G.kills, 1);
  assert.equal(p.kills, 1);
});

test('kill drops xp that a later query can find', () => {
  const sim = withGame();
  const e = sim.pools.enemies.get();
  e.x = 5; e.y = 5; e.hp = 1; e.xp = 3; e.boss = false; e.elite = false;
  kill(sim, e, sim.G.human);
  const xpDrop = sim.pools.drops.live.find(d => d.kind === 'xp');
  assert.ok(xpDrop);
  assert.equal(Math.round(xpDrop.x), 5);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from './simulation.js';

test('two simulations have independent pools and spatial hashes', () => {
  const a = createSimulation();
  const b = createSimulation();
  const e = a.pools.enemies.get();
  e.x = 0; e.y = 0; e.r = 5; e.uid = 1;
  a.spatial.gridBuild();
  b.spatial.gridBuild();
  assert.equal(a.spatial.nearest(0, 0, 10)?.uid, 1);
  assert.equal(b.spatial.nearest(0, 0, 10), null);
  assert.equal(a.pools.enemies.live.length, 1);
  assert.equal(b.pools.enemies.live.length, 0);
});

test('starts with G null and empty meta', () => {
  const sim = createSimulation();
  assert.equal(sim.G, null);
  assert.deepEqual(sim.meta, { shards: 0, lv: {} });
});

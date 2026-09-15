import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from './pool.js';
import { createSpatialHash } from './spatialHash.js';

test('two spatial hash instances do not share state', () => {
  const poolA = new Pool(() => ({ alive: false }), 4);
  const poolB = new Pool(() => ({ alive: false }), 4);
  const a = createSpatialHash(poolA);
  const b = createSpatialHash(poolB);

  const ea = poolA.get();
  ea.x = 10; ea.y = 10; ea.r = 5; ea.uid = 1;
  a.gridBuild();

  b.gridBuild(); // pool B has no live entities
  assert.equal(a.nearest(10, 10, 50)?.uid, 1);
  assert.equal(b.nearest(10, 10, 50), null);
});

test('query returns entities within radius', () => {
  const pool = new Pool(() => ({ alive: false }), 4);
  const sh = createSpatialHash(pool);
  const e = pool.get();
  e.x = 0; e.y = 0; e.r = 5; e.uid = 1;
  sh.gridBuild();
  const out = [];
  sh.query(0, 0, 10, out);
  assert.equal(out.length, 1);
  assert.equal(out[0].uid, 1);
});

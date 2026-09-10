// Structural test for netSimFromState: confirms its output carries every
// field render.js's draw* helpers dereference (audited by reading
// src/render/render.js in full).
//
// This does NOT import render.js itself: render.js -> game/input.js ->
// main.js, and main.js does `import '../style.css'` plus runs the whole
// app bootstrap (starts a demo sim, wires up lobby DOM, kicks off
// requestAnimationFrame) as import-time side effects. That's not
// reproducible in plain `node --test` without reimplementing a browser.
// The real check — netSimFromState's output fed into the actual render(sim)
// from a running Vite dev server in a real browser — was done manually
// (see task-15-report.md) and passed without throwing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { netSimFromState } from './netSim.js';

function fakeMap(items) {
  // Mimics @colyseus/schema MapSchema's forEach(value, key) iteration API.
  return { forEach(cb) { for (const [k, v] of items) cb(v, k); } };
}

function makeState() {
  return {
    time: 123,
    kills: 7,
    players: fakeMap([
      ['sid1', { x: 10, y: 20, hp: 80, maxHp: 100, level: 3, dead: false, revive: 0, name: 'Alice', cls: 'vanguard' }],
      ['sid2', { x: -5, y: 40, hp: 0, maxHp: 90, level: 2, dead: true, revive: 0.4, name: 'Bob', cls: 'unknown-class' }],
    ]),
    enemies: fakeMap([
      ['e1', { tid: 'slime', x: 30, y: 30, hp: 5, maxHp: 9, boss: false, elite: false }],
      ['e2', { tid: 'golem', x: 60, y: 10, hp: 40, maxHp: 40, boss: false, elite: true }],
      ['e3', { tid: 'boss', x: 0, y: 0, hp: 900, maxHp: 1700, boss: true, elite: false }],
    ]),
  };
}

test('netSimFromState carries every field render.js reads', () => {
  const sim = netSimFromState(makeState(), 'sid1');

  // G.* read directly by render()/draw* helpers
  for (const key of ['players', 'human', 'cam', 'time', 'kills', 'bosses', 'demo', 'won', 'shake', 'clock', 'stageLen']) {
    assert.ok(key in sim.G, `sim.G.${key} missing`);
  }
  assert.equal(sim.G.players.length, 2);
  assert.equal(sim.G.human.name, 'Alice');
  assert.deepEqual(sim.G.cam, { x: 10, y: 20 });
  assert.equal(sim.G.time, 123);
  assert.equal(sim.G.kills, 7);
  assert.equal(sim.G.bosses.length, 1);

  // per-player fields (drawPlayers/drawAuras/drawHUD)
  for (const p of sim.G.players) {
    for (const key of ['x', 'y', 'hp', 's', 'level', 'dead', 'revive', 'name', 'cls', 'color', 'r', 'fx', 'fy', 'hurt', 'iframe', 'weapons', 'passives', 'xp', 'xpNext', 'auto']) {
      assert.ok(key in p, `player.${key} missing`);
    }
    assert.ok('maxHp' in p.s, 'player.s.maxHp missing');
    // guards render.js's unguarded CLASSES[p.cls] lookups
    assert.notEqual(p.cls, 'unknown-class');
  }

  // per-enemy fields (drawEnemies/drawBoss/drawIndicators)
  for (const e of sim.pools.enemies.live) {
    for (const key of ['alive', 'tid', 'x', 'y', 'hp', 'maxHp', 'boss', 'elite', 'r', 'color', 'fx', 'fy', 'flash', 'phase']) {
      assert.ok(key in e, `enemy.${key} missing`);
    }
  }
  const boss = sim.G.bosses[0];
  for (const key of ['teleT', 'tdx', 'tdy', 'spin', 'speed', 'name']) {
    assert.ok(key in boss, `boss.${key} missing`);
  }

  // pools drawn unconditionally by render()
  for (const pool of ['enemies', 'projs', 'ebul', 'drops', 'fxs', 'texts']) {
    assert.ok(Array.isArray(sim.pools[pool].live), `pools.${pool}.live missing/not array`);
  }
});

test('unmatched localSessionId leaves G.human null (caller must not render() that frame)', () => {
  const state = {
    time: 5, kills: 0,
    players: fakeMap([['sid9', { x: 0, y: 0, hp: 10, maxHp: 10, level: 1, dead: false, revive: 0, name: 'Solo', cls: 'sniper' }]]),
    enemies: fakeMap([]),
  };
  const sim = netSimFromState(state, 'not-in-state');
  assert.equal(sim.G.human, null);
});

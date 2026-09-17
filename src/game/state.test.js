import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../core/simulation.js';
import { newGame, makePlayer } from './state.js';

test('newGame is isolated per sim instance', () => {
  const simA = createSimulation();
  const simB = createSimulation();
  newGame(simA, { cls: 'vanguard', party: 1, stage: 360 });
  assert.equal(simB.G, null);
  assert.equal(simA.G.players.length, 1);
  assert.equal(simA.G.human.cls, 'vanguard');
});

test('makePlayer starting weapon matches class', () => {
  const sim = createSimulation();
  const p = makePlayer(sim, 'pyro', true, 'test');
  assert.equal(p.weapons[0].id, 'fireball');
  assert.equal(p.hp, p.s.maxHp);
});

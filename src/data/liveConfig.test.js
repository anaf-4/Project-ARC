import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, ETYPES, BOSSES, CLASSES } from './tables.js';
import { getEditableSchema, applyLiveOverrides, validateOverrides } from './liveConfig.js';

test('getEditableSchema exposes only numeric fields for a known weapon', () => {
  const schema = getEditableSchema();
  assert.equal(schema.weapons.blade.lv.length, 5);
  assert.equal(schema.weapons.blade.lv[0].dmg, 14);
  assert.equal(schema.weapons.blade.evoS.dmg, 60);
  assert.ok(!('name' in schema.weapons.blade)); // non-numeric top-level fields never appear
  assert.ok(!('shape' in schema.enemies.slime)); // string field excluded
  assert.equal(schema.enemies.slime.hp, 9);
  assert.equal(schema.bosses[0].hp, 1700);
  assert.equal(schema.classes.vanguard.hp, 150);
});

test('getEditableSchema includes altEvos for weapons that have them', () => {
  const schema = getEditableSchema();
  assert.equal(schema.weapons.wand.altEvos.length, 1);
  assert.equal(schema.weapons.wand.altEvos[0].evoS.dmg, 70);
  assert.equal(schema.weapons.blade.altEvos.length, 0); // blade has no altEvos
});

test('applyLiveOverrides mutates the live WEAPONS table in place, by lv index', () => {
  const before = WEAPONS.blade.lv[0].dmg;
  applyLiveOverrides({ weapons: { blade: { lv: { 0: { dmg: 999 } } } } });
  assert.equal(WEAPONS.blade.lv[0].dmg, 999);
  WEAPONS.blade.lv[0].dmg = before; // restore so later tests/files see defaults
});

test('applyLiveOverrides updates evoS and an altEvos evoS field', () => {
  const beforeEvo = WEAPONS.blade.evoS.dmg, beforeAlt = WEAPONS.wand.altEvos[0].evoS.dmg;
  applyLiveOverrides({ weapons: { blade: { evoS: { dmg: 500 } }, wand: { altEvos: { 0: { evoS: { dmg: 111 } } } } } });
  assert.equal(WEAPONS.blade.evoS.dmg, 500);
  assert.equal(WEAPONS.wand.altEvos[0].evoS.dmg, 111);
  WEAPONS.blade.evoS.dmg = beforeEvo; WEAPONS.wand.altEvos[0].evoS.dmg = beforeAlt;
});

test('applyLiveOverrides updates enemies, bosses (by array index) and classes', () => {
  const beforeHp = ETYPES.slime.hp, beforeBossHp = BOSSES[0].hp, beforeClassHp = CLASSES.vanguard.hp;
  applyLiveOverrides({ enemies: { slime: { hp: 12345 } }, bosses: { 0: { hp: 5000 } }, classes: { vanguard: { hp: 999 } } });
  assert.equal(ETYPES.slime.hp, 12345);
  assert.equal(BOSSES[0].hp, 5000);
  assert.equal(CLASSES.vanguard.hp, 999);
  ETYPES.slime.hp = beforeHp; BOSSES[0].hp = beforeBossHp; CLASSES.vanguard.hp = beforeClassHp;
});

test('applyLiveOverrides ignores unknown ids and non-numeric values', () => {
  const before = ETYPES.slime.hp;
  applyLiveOverrides({ enemies: { slime: { hp: 'not a number' }, madeup_enemy: { hp: 1 } } });
  assert.equal(ETYPES.slime.hp, before);
});

test('applyLiveOverrides silently ignores a top-level section it does not recognize', () => {
  // applyLiveOverrides itself doesn't need to reject bad input the way
  // validateOverrides does (that's the HTTP layer's job) — it just must
  // never throw and never touch anything real.
  assert.doesNotThrow(() => applyLiveOverrides({ made_up_section: { x: 1 } }));
});

test('validateOverrides accepts a well-formed override', () => {
  assert.equal(validateOverrides({ classes: { vanguard: { hp: 200 } } }), null);
});

test('validateOverrides rejects an unknown top-level section', () => {
  assert.equal(validateOverrides({ made_up_section: {} }), 'unknown section: made_up_section');
});

test('validateOverrides rejects an unknown id within a known section', () => {
  assert.equal(validateOverrides({ weapons: { not_a_real_weapon: {} } }), 'unknown weapon: not_a_real_weapon');
  assert.equal(validateOverrides({ enemies: { not_a_real_enemy: {} } }), 'unknown enemy: not_a_real_enemy');
  assert.equal(validateOverrides({ classes: { not_a_real_class: {} } }), 'unknown class: not_a_real_class');
  assert.equal(validateOverrides({ bosses: { 99: {} } }), 'unknown boss index: 99');
});

test('validateOverrides rejects a non-object', () => {
  assert.equal(validateOverrides(null), 'overrides must be an object');
  assert.equal(validateOverrides('nope'), 'overrides must be an object');
});

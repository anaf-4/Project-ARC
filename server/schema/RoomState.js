// Colyseus network schema for room state (Task 11; downgraded to
// @colyseus/schema@3.0.76 in the fix-up task to match colyseus.js@0.16.22's
// wire protocol / peer dependency).
//
// Uses @colyseus/schema's decorator-free `type()` function-call form:
// `type('string')(Klass.prototype, 'field')`. This project has no
// TS/Babel decorator pipeline configured (plain Vite+ESM). `type()` returns
// a plain `(target, field) => void` function in BOTH v5.0.27 and v3.0.76
// (confirmed by reading node_modules/@colyseus/schema/build/esm/index.mjs
// after the downgrade, and by round-tripping RoomState through
// `.toJSON()` at v3.0.76 — field values came back correctly) — it's a
// legacy-style decorator, so calling it directly like this is a supported
// pattern on both versions (unlike `defineTypes()`, which is the same thing
// but flagged deprecated in favor of the new `schema()`/`t.*` builder API).
// No rewrite of the field declarations below was needed for the downgrade.
//
// Note: unlike classes built with the `schema()` builder, plain `type()`-
// annotated classes do NOT auto-instantiate map/array/collection fields —
// the base Schema constructor only sets up change tracking. RoomState's
// map fields are therefore initialized explicitly in its constructor.
import { Schema, MapSchema, ArraySchema, type, view } from '@colyseus/schema';

export class WeaponState extends Schema {}
type('string')(WeaponState.prototype, 'id');
type('number')(WeaponState.prototype, 'lv');
type('boolean')(WeaponState.prototype, 'evo');

export class PassiveState extends Schema {}
type('string')(PassiveState.prototype, 'id');
type('number')(PassiveState.prototype, 'lv');

export class PlayerState extends Schema {
  constructor() {
    super();
    this.weapons = new ArraySchema();
    this.passives = new ArraySchema();
  }
}
type('string')(PlayerState.prototype, 'name');
type('string')(PlayerState.prototype, 'cls');
type('number')(PlayerState.prototype, 'x');
type('number')(PlayerState.prototype, 'y');
type('number')(PlayerState.prototype, 'hp');
type('number')(PlayerState.prototype, 'maxHp');
type('number')(PlayerState.prototype, 'level');
type('boolean')(PlayerState.prototype, 'dead');
type('number')(PlayerState.prototype, 'revive');
type('number')(PlayerState.prototype, 'xp');
type('number')(PlayerState.prototype, 'xpNext');
type('number')(PlayerState.prototype, 'pending');
type([WeaponState])(PlayerState.prototype, 'weapons');
type([PassiveState])(PlayerState.prototype, 'passives');

export class EnemyState extends Schema {}
type('string')(EnemyState.prototype, 'tid');
type('number')(EnemyState.prototype, 'x');
type('number')(EnemyState.prototype, 'y');
type('number')(EnemyState.prototype, 'hp');
type('number')(EnemyState.prototype, 'maxHp');
type('boolean')(EnemyState.prototype, 'boss');
type('boolean')(EnemyState.prototype, 'elite');

export class ProjectileState extends Schema {}
type('string')(ProjectileState.prototype, 'kind');
type('number')(ProjectileState.prototype, 'x');
type('number')(ProjectileState.prototype, 'y');

export class DropState extends Schema {}
type('string')(DropState.prototype, 'kind');
type('number')(DropState.prototype, 'x');
type('number')(DropState.prototype, 'y');

export class RoomState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.enemies = new MapSchema();
    this.projectiles = new MapSchema();
    this.drops = new MapSchema();
    this.time = 0;
    this.kills = 0;
    this.phase = 'waiting';
    this.hostSessionId = '';
    this.maxPlayers = 4;
  }
}
type('string')(RoomState.prototype, 'phase');
type('string')(RoomState.prototype, 'hostSessionId');
type('number')(RoomState.prototype, 'maxPlayers');
type({ map: PlayerState })(RoomState.prototype, 'players');
type({ map: EnemyState })(RoomState.prototype, 'enemies');
// Task 17: `enemies` is per-client filtered via Colyseus StateView (Task 12
// broadcast every enemy to every client; this narrows it to each player's
// view radius). `view()` must decorate this field for `isFiltered` to
// propagate to its MapSchema's ChangeTree (confirmed by reading
// node_modules/@colyseus/schema/lib/encoder/ChangeTree.js
// `_checkFilteredByParent`, which only sets `isFiltered` when
// `Metadata.hasViewTagAtIndex` is true for the field) — without it,
// `client.view.add()`/`.clear()` calls in GameRoom are silently no-ops and
// every client still gets every enemy via the unfiltered "shared" changeset.
// `players` intentionally has no `view()` tag: all players must stay visible
// to everyone.
view()(RoomState.prototype, 'enemies');
type({ map: ProjectileState })(RoomState.prototype, 'projectiles');
type({ map: DropState })(RoomState.prototype, 'drops');
type('number')(RoomState.prototype, 'time');
type('number')(RoomState.prototype, 'kills');

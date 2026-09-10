// Colyseus network schema for room state (Task 11).
//
// Uses @colyseus/schema's decorator-free `type()` function-call form:
// `type('string')(Klass.prototype, 'field')`. This project has no
// TS/Babel decorator pipeline configured (plain Vite+ESM), and v5.0.27's
// `type()` returns a plain `(target, field) => void` function (confirmed by
// reading node_modules/@colyseus/schema/build/index.mjs) — it's a legacy-style
// decorator, so calling it directly like this is a supported, non-deprecated
// pattern (unlike `defineTypes()`, which is the same thing but flagged
// deprecated in favor of the new `schema()`/`t.*` builder API).
//
// Note: unlike classes built with the `schema()` builder, plain `type()`-
// annotated classes do NOT auto-instantiate map/array/collection fields —
// the base Schema constructor only sets up change tracking. RoomState's
// map fields are therefore initialized explicitly in its constructor.
import { Schema, MapSchema, type } from '@colyseus/schema';

export class PlayerState extends Schema {}
type('string')(PlayerState.prototype, 'name');
type('string')(PlayerState.prototype, 'cls');
type('number')(PlayerState.prototype, 'x');
type('number')(PlayerState.prototype, 'y');
type('number')(PlayerState.prototype, 'hp');
type('number')(PlayerState.prototype, 'maxHp');
type('number')(PlayerState.prototype, 'level');
type('boolean')(PlayerState.prototype, 'dead');
type('number')(PlayerState.prototype, 'revive');

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
  }
}
type({ map: PlayerState })(RoomState.prototype, 'players');
type({ map: EnemyState })(RoomState.prototype, 'enemies');
type({ map: ProjectileState })(RoomState.prototype, 'projectiles');
type({ map: DropState })(RoomState.prototype, 'drops');
type('number')(RoomState.prototype, 'time');
type('number')(RoomState.prototype, 'kills');

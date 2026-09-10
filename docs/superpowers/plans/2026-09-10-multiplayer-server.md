# Server-Authoritative Multiplayer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 2-4 player co-op over the internet where a Colyseus server on Render authoritatively runs the simulation, while solo play stays fully local/offline and unchanged.

**Architecture:** Convert the module-singleton simulation state (`G`, entity pools, spatial hash) into a `createSimulation()` factory that returns one instance. Thread that instance through every simulation function so the exact same `src/game/*`/`src/core/*` code runs client-side (solo) or server-side (co-op, one instance per Colyseus room). Add a thin client networking layer that either drives a local `sim` (solo) or renders a `sim`-shaped view built from server snapshots (multiplayer).

**Tech Stack:** Colyseus (server framework + `@colyseus/schema`), colyseus.js (client), Node.js `node:test` for the now-server-testable simulation core, Express (Colyseus's HTTP transport), Vite (existing), Render (hosting).

**Spec:** [docs/superpowers/specs/2026-09-10-multiplayer-server-design.md](../specs/2026-09-10-multiplayer-server-design.md)

## Global Constraints

- Solo play must remain 100% local/offline with zero server dependency (spec: Goals).
- Server is authoritative: movement resolution, enemy AI, collision, damage, drops, spawn director all run server-side in multiplayer (spec: Goals).
- Client and server share one simulation codebase — no duplicated/parallel game-logic reimplementation (spec: Key refactor).
- No anti-cheat beyond server-computed truth; no reconnect/resume; no matchmaking (private room codes only); no host migration (spec: Non-goals).
- Server tick rate: fixed 20Hz (spec: Networking).
- Interest management: enemies/projectiles sent to a client are filtered to that player's view radius via the existing spatial hash (spec: Networking).
- Pause in multiplayer is local-only UI and does not stop the shared server simulation (spec: Networking).
- Deploy target: Render Web Service, Node runtime, public `wss://` URL (spec: Deployment).

---

## Milestone A — Per-room simulation core

Goal of this milestone: after Task 9, the game behaves identically to Phase 1/2 in solo mode, but all simulation state lives in an instance returned by `createSimulation()` instead of module singletons. This is the foundation everything else builds on — no networking code exists yet.

### Task 1: Spatial hash becomes a factory

**Files:**
- Modify: `src/core/spatialHash.js` (full rewrite)
- Test: `src/core/spatialHash.test.js`

**Interfaces:**
- Consumes: `Pool` instances (from `src/core/pool.js`), specifically a pool whose `.live` array holds objects with `{alive, x, y, r, uid}`.
- Produces: `createSpatialHash(enemiesPool)` → `{ CELL, gkey, gridBuild, query, nearest, Q1, Q2, Q3 }`. Two calls to `createSpatialHash` with two different pools must not share `grid`/`Q1`/`Q2`/`Q3` state.

- [ ] **Step 1: Write the failing test**

```javascript
// src/core/spatialHash.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/core/spatialHash.test.js`
Expected: FAIL — `createSpatialHash` is not exported (current file exports singletons `grid`, `query`, etc., not a factory).

- [ ] **Step 3: Rewrite `src/core/spatialHash.js` as a factory**

```javascript
export function createSpatialHash(enemiesPool) {
  const CELL = 64, grid = new Map(), usedCells = [];
  const gkey = (cx, cy) => ((cx & 0xffff) << 16) | (cy & 0xffff);
  function gridBuild() {
    for (let i = 0; i < usedCells.length; i++) usedCells[i].length = 0;
    usedCells.length = 0;
    if (grid.size > 30000) grid.clear();
    const L = enemiesPool.live;
    for (let i = 0; i < L.length; i++) {
      const e = L[i]; if (!e.alive) continue;
      const k = gkey(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
      let a = grid.get(k); if (!a) { a = []; grid.set(k, a); }
      if (a.length === 0) usedCells.push(a);
      a.push(e);
    }
  }
  function query(x, y, r, out) {
    out.length = 0;
    const m = r + 60, c0 = Math.floor((x - m) / CELL), c1 = Math.floor((x + m) / CELL), r0 = Math.floor((y - m) / CELL), r1 = Math.floor((y + m) / CELL);
    for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
      const a = grid.get(gkey(cx, cy)); if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const e = a[i]; if (!e.alive) continue;
        const dx = e.x - x, dy = e.y - y, rr = r + e.r;
        if (dx * dx + dy * dy <= rr * rr) out.push(e);
      }
    }
    return out;
  }
  function nearest(x, y, range, excl) {
    let best = null, bd = range * range;
    const c0 = Math.floor((x - range) / CELL), c1 = Math.floor((x + range) / CELL), r0 = Math.floor((y - range) / CELL), r1 = Math.floor((y + range) / CELL);
    for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
      const a = grid.get(gkey(cx, cy)); if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const e = a[i]; if (!e.alive || (excl && excl.has(e.uid))) continue;
        const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = e; }
      }
    }
    return best;
  }
  return { CELL, grid, usedCells, gkey, gridBuild, query, nearest, Q1: [], Q2: [], Q3: [] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/core/spatialHash.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/spatialHash.js src/core/spatialHash.test.js
git commit -m "Convert spatial hash to a per-instance factory

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 2: `createSimulation()` factory

**Files:**
- Create: `src/core/simulation.js`
- Test: `src/core/simulation.test.js`

**Interfaces:**
- Consumes: `Pool` (from `src/core/pool.js`), `createSpatialHash` (Task 1).
- Produces: `createSimulation()` → `{ pools: {enemies, projs, ebul, drops, fxs, texts}, spatial: {CELL, grid, usedCells, gkey, gridBuild, query, nearest, Q1, Q2, Q3}, G: null, meta: {shards:0, lv:{}}, onBanner: null }`. This `sim` object is the single value threaded through every function in Tasks 3-8. `sim.G` starts `null` and is assigned by `newGame(sim, cfg)` (Task 3), exactly like the current module-level `G` did.

- [ ] **Step 1: Write the failing test**

```javascript
// src/core/simulation.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/core/simulation.test.js`
Expected: FAIL — `src/core/simulation.js` does not exist.

- [ ] **Step 3: Write `src/core/simulation.js`**

```javascript
import { Pool } from './pool.js';
import { createSpatialHash } from './spatialHash.js';

export function createSimulation() {
  const pools = {
    enemies: new Pool(() => ({ alive: false }), 1400),
    projs: new Pool(() => ({ alive: false, hitIds: [] }), 600),
    ebul: new Pool(() => ({ alive: false }), 500),
    drops: new Pool(() => ({ alive: false }), 900),
    fxs: new Pool(() => ({ alive: false }), 500),
    texts: new Pool(() => ({ alive: false }), 200),
  };
  const spatial = createSpatialHash(pools.enemies);
  return { pools, spatial, G: null, meta: { shards: 0, lv: {} }, onBanner: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/core/simulation.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/simulation.js src/core/simulation.test.js
git commit -m "Add createSimulation() factory bundling pools, spatial hash, and G

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 3: Thread `sim` through `game/state.js`

**Files:**
- Modify: `src/game/state.js` (every export gains a leading `sim` parameter; internal `enemies.clear()` etc. become `sim.pools.enemies.clear()`; `grid.clear()` becomes `sim.spatial.grid.clear()`; module-level `let G = null` / `export { G }` is removed — callers now read `sim.G`)
- Test: `src/game/state.test.js`

**Interfaces:**
- Consumes: `createSimulation` (Task 2), `botLevel` (unchanged signature from `growth.js` for now — Task 7 will add `sim` to it; this task calls it as `botLevel(p)` still and Task 7 updates the call site to `botLevel(sim, p)`).
- Produces: `newGame(sim, cfg)` (sets `sim.G = {...}`, returns nothing), `makePlayer(sim, cls, human, name)` → player object, `newWeapon(id)` → weapon object (unchanged, no sim needed), `recompute(sim, p)` (mutates `p.s`/`p.hp`, reads `sim.meta`), `startDemo(sim)`. Every later task that calls these must use this exact signature.

- [ ] **Step 1: Write the failing test**

```javascript
// src/game/state.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/game/state.test.js`
Expected: FAIL — `newGame`/`makePlayer` currently take `(cfg)` / `(cls, human, name)` without `sim`, and mutate a module-level `G`.

- [ ] **Step 3: Rewrite `src/game/state.js`**

```javascript
import { TAU, shuffle, pick } from '../core/utils.js';
import { CLASSES, PASSIVES, META, BOT_NAMES, xpNeed } from '../data/tables.js';
import { botLevel } from './growth.js';

export function newGame(sim, cfg) {
  const { enemies, projs, ebul, drops, fxs, texts } = sim.pools;
  enemies.clear(); projs.clear(); ebul.clear(); drops.clear(); fxs.clear(); texts.clear();
  sim.spatial.grid.clear(); sim.spatial.usedCells.length = 0;
  const n = cfg.party, quick = cfg.stage < 600;
  sim.G = {
    demo: !!cfg.demo, cfg, time: 0, clock: 0, stageLen: cfg.stage, diff: 0,
    xpMul: quick ? 1.7 : 1, bossMul: quick ? 0.6 : 1, partyN: n, partyMul: 1 + 0.45 * (n - 1),
    players: [], human: null, cam: { x: 0, y: 0 }, kills: 0, mode: 'play',
    spawnAcc: 0, nextRush: cfg.stage / 15, rush: 0, bossIdx: 0, bossTimes: [cfg.stage / 3, cfg.stage * 2 / 3, cfg.stage], bosses: [],
    won: false, ending: 0, shake: 0, uid: 1, bonusShards: 0, rerolls: sim.meta.lv.reroll || 0,
  };
  const others = shuffle(Object.keys(CLASSES).filter(k => k !== cfg.cls));
  const h = makePlayer(sim, cfg.cls, true, sim.G.demo ? 'ARC' : '나');
  h.auto = sim.G.demo;
  sim.G.players.push(h); sim.G.human = h;
  for (let i = 1; i < n; i++) {
    const b = makePlayer(sim, others[(i - 1) % others.length], false, BOT_NAMES[i - 1]);
    const a = i * TAU / n; b.x = Math.cos(a) * 60; b.y = Math.sin(a) * 60;
    sim.G.players.push(b);
  }
  sim.G.cam.x = h.x; sim.G.cam.y = h.y;
}

export function makePlayer(sim, cls, human, name) {
  const C = CLASSES[cls];
  const p = {
    cls, human, name, color: C.color, x: 0, y: 0, r: 14, fx: 1, fy: 0, mx: 0, my: 0, hp: 0, s: null,
    level: 1, xp: 0, xpNext: xpNeed(1), weapons: [], passives: [], dead: false, revive: 0, iframe: 0, hurt: 0,
    pending: 0, kills: 0, auraRegen: 0, auraMag: 1, auto: !human, wig: Math.random() * TAU
  };
  p.weapons.push(newWeapon(C.weapon));
  recompute(sim, p); p.hp = p.s.maxHp;
  return p;
}
export function newWeapon(id) { return { id, lv: 1, evo: false, t: 0.4, on: 0, off: 0, ang: 0, hits: new Map() }; }

export function recompute(sim, p) {
  const C = CLASSES[p.cls];
  const s = {
    maxHp: C.hp, armor: C.armor || 0, speed: C.speed, dmgMul: 1, cdMul: C.cdMul || 1, areaMul: C.areaMul || 1, amount: 0, projSpeed: 1,
    crit: 0.05 + (C.crit || 0), critGrowth: C.critGrowth || 1, regen: C.regen || 0, magnet: 85 * (C.magnetMul || 1), xpMul: 1, reviveMul: 1, explosiveMul: C.explosiveMul || 1
  };
  for (const m of META) { const l = sim.meta.lv[m.id] || 0; if (l) m.apply(s, l); }
  for (const q of p.passives) PASSIVES[q.id].apply(s, q.lv);
  s.cdMul = Math.max(0.35, s.cdMul);
  const old = p.s ? p.s.maxHp : s.maxHp;
  p.s = s;
  if (s.maxHp > old) p.hp += s.maxHp - old;
  p.hp = Math.min(p.hp, s.maxHp);
}

export function startDemo(sim) {
  newGame(sim, { cls: pick(Object.keys(CLASSES)), party: 4, stage: 900, demo: true });
  sim.G.time = 100;
  for (const p of sim.G.players) for (let i = 0; i < 9; i++) botLevel(sim, p);
}
```

Note: this references `botLevel(sim, p)` — Task 7 updates `growth.js` to match this signature. Until Task 7 lands, `state.test.js`'s tests above don't call `startDemo`, so they pass without it; `main.js` still calling the old `startDemo()` shape will be fixed in Task 9.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/game/state.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/game/state.js src/game/state.test.js
git commit -m "Thread sim instance through game/state.js

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 4: Thread `sim` through `game/combat.js`

**Files:**
- Modify: `src/game/combat.js` (every function gains a leading `sim` param; `G`/`projs`/`ebul`/`drops`/`fxs`/`texts` become `sim.G`/`sim.pools.*`; `banner(...)` calls become `sim.onBanner?.(...)`)
- Test: `src/game/combat.test.js`

**Interfaces:**
- Consumes: `sim` shape from Task 2/3 (`sim.G`, `sim.pools`, `sim.onBanner`).
- Produces: `damage(sim, e, amt, p, kx, ky, noCrit)`, `kill(sim, e, p)`, `hurtPlayer(sim, p, dmg)`, `dropXp(sim, x, y, v)`, `dropItem(sim, kind, x, y)`, `shoot(sim, p, kind, a, speed, r, dmg, o)` → proj, `fireEbul(sim, x, y, dx, dy, speed, r, dmg)`, `addFx(sim, kind, x, y, o)`, `addText(sim, x, y, v, crit)`, `jag(pts)` (unchanged, pure function, no sim needed).

- [ ] **Step 1: Write the failing test**

```javascript
// src/game/combat.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/game/combat.test.js`
Expected: FAIL — current `combat.js` functions don't take `sim` and import a module-level `G` that no longer exists after Task 3.

- [ ] **Step 3: Rewrite `src/game/combat.js`**

```javascript
import { rand, pick, REDUCED } from '../core/utils.js';

export function damage(sim, e, amt, p, kx, ky, noCrit) {
  if (!e.alive) return;
  let crit = false;
  if (p && !noCrit && Math.random() < p.s.crit) { amt *= 2; crit = true; }
  e.hp -= amt; e.flash = 0.08;
  const kb = e.boss ? 0.05 : e.elite ? 0.3 : 1;
  e.kx += (kx || 0) * kb; e.ky += (ky || 0) * kb;
  if (sim.pools.texts.live.length < 150) addText(sim, e.x + rand(-6, 6), e.y - e.r, amt, crit);
  if (e.hp <= 0) kill(sim, e, p);
}
export function kill(sim, e, p) {
  const { G, pools } = sim;
  e.alive = false; G.kills++; if (p) p.kills++;
  dropXp(sim, e.x, e.y, e.xp * (1 + G.diff * 0.07));
  if (e.boss || e.elite) dropItem(sim, 'chest', e.x, e.y);
  else { const r = Math.random(); if (r < 0.006) dropItem(sim, 'potion', e.x, e.y); else if (r < 0.0085) dropItem(sim, 'magnet', e.x, e.y); }
  if (pools.fxs.live.length < 380) addFx(sim, 'pop', e.x, e.y, { r: e.r, color: e.color, life: 0.35 });
  if (e.boss) {
    if (!REDUCED) G.shake = 12;
    addFx(sim, 'ring', e.x, e.y, { r: 240, life: 0.9, color: e.color });
    if (e.final) { G.won = true; G.ending = 2.8; if (!G.demo) sim.onBanner?.('아크 코어 격파! 스테이지 클리어', 'good'); }
    else if (!G.demo) sim.onBanner?.(`${e.name} 격파. 에테르 상자를 주우세요`, 'good');
  }
}
export function hurtPlayer(sim, p, dmg) {
  const { G } = sim;
  if (p.dead || p.iframe > 0) return;
  dmg = Math.max(1, dmg - p.s.armor);
  p.hp -= dmg; p.iframe = 0.5; p.hurt = 0.16;
  if (p === G.human && !G.demo && !REDUCED) G.shake = Math.max(G.shake, 3);
  if (p.hp <= 0) {
    p.hp = 0; p.dead = true; p.revive = 0; p.mx = p.my = 0;
    addFx(sim, 'ring', p.x, p.y, { r: 70, life: 0.6, color: p.color });
    if (!G.demo && G.players.some(o => !o.dead)) {
      sim.onBanner?.(p === G.human ? '쓰러졌습니다. 동료가 영혼 오브에 닿으면 부활합니다' : `${p.name} 쓰러짐. 영혼 오브 위에 머물러 살리세요`, 'danger');
    }
  }
}
export function dropXp(sim, x, y, v) {
  const drops = sim.pools.drops;
  if (drops.live.length > 650) {
    for (let t = 0; t < 6; t++) { const g = pick(drops.live); if (g.alive && g.kind === 'xp') { g.v += v; return; } }
  }
  const g = drops.get(); g.kind = 'xp'; g.x = x + rand(-4, 4); g.y = y + rand(-4, 4); g.v = v; g.vac = false; g.sp = 0; g.t = 0;
}
export function dropItem(sim, kind, x, y) { const g = sim.pools.drops.get(); g.kind = kind; g.x = x; g.y = y; g.v = 0; g.vac = false; g.sp = 0; g.t = 0; }
export function shoot(sim, p, kind, a, speed, r, dmg, o) {
  const pr = sim.pools.projs.get();
  pr.kind = kind; pr.x = p.x; pr.y = p.y; pr.vx = Math.cos(a) * speed * p.s.projSpeed; pr.vy = Math.sin(a) * speed * p.s.projSpeed;
  pr.r = r; pr.dmg = dmg; pr.pierce = o.pierce || 1; pr.life = o.life || 1; pr.color = o.color || '#fff'; pr.owner = p;
  pr.er = o.er || 0; pr.zone = !!o.zone; pr.t = 0; pr.out = o.out || 0; pr.hits = null; pr.tick = 0; pr.hitIds.length = 0;
  return pr;
}
export function fireEbul(sim, x, y, dx, dy, speed, r, dmg) {
  const b = sim.pools.ebul.get(); b.x = x; b.y = y; b.vx = dx * speed; b.vy = dy * speed; b.r = r; b.dmg = dmg; b.life = 6;
}
export function addFx(sim, kind, x, y, o) {
  const f = sim.pools.fxs.get(); f.kind = kind; f.x = x; f.y = y; f.t = 0; f.life = o.life || 0.3; f.r = o.r || 0; f.a = o.a || 0;
  f.half = o.half || 0; f.w = o.w || 0; f.color = o.color || '#fff'; f.owner = o.owner || null; f.pts = o.pts || null;
}
export function addText(sim, x, y, v, crit) { const t = sim.pools.texts.get(); t.x = x; t.y = y; t.v = Math.round(v); t.crit = crit; t.t = 0; }
export function jag(pts) {
  const out = [pts[0], pts[1]];
  for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2], ay = pts[i - 1], bx = pts[i], by = pts[i + 1];
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    for (let k = 1; k < 4; k++) { const t = k / 4, o = rand(-1, 1) * Math.min(18, d * 0.12); out.push(ax + dx * t + nx * o, ay + dy * t + ny * o); }
    out.push(bx, by);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/game/combat.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/game/combat.js src/game/combat.test.js
git commit -m "Thread sim instance through game/combat.js, decouple banner via sim.onBanner

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 5: Thread `sim` through `game/weapons.js`

**Files:**
- Modify: `src/game/weapons.js` (every function gains a leading `sim` param; `enemies.live` becomes `sim.pools.enemies.live`; `nearest/query/Q1/Q2` become `sim.spatial.*`; `damage`/`addFx`/`shoot`/`jag` calls gain `sim` as first arg per Task 4's new signatures)
- Test: `src/game/weapons.test.js`

**Interfaces:**
- Consumes: `damage(sim, ...)`, `addFx(sim, ...)`, `shoot(sim, ...)`, `jag(pts)` from Task 4; `sim.spatial.{query,nearest,Q1,Q2}`.
- Produces: `wst(w)` (unchanged, pure), `wdmg(p, w, st)` (unchanged, pure), `beam(sim, p, a, len, wd, dmg)`, `explode(sim, pr)`, `orbitTick(sim, p, w, st, dt)`, `auraTick(sim, p, w, st)`, `updateWeapons(sim, p, dt)`. `FIRE` table entries all become `(sim, p, w, st)`.

- [ ] **Step 1: Write the failing test**

```javascript
// src/game/weapons.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/game/weapons.test.js`
Expected: FAIL — `updateWeapons` currently takes `(p, dt)` and imports module-singleton `enemies`/`query`/`nearest`, which no longer exist as module exports after Task 1.

- [ ] **Step 3: Rewrite `src/game/weapons.js`**

Apply this transform to the existing file (full content from the current `src/game/weapons.js`, git history if needed):
- Add `sim` as the first parameter of: `beam`, `explode`, every function in the `FIRE` object (`blade`, `rail`, `wand`, `fireball`, `boomerang`, `thunder`), `orbitTick`, `auraTick`, `updateWeapons`.
- Replace `enemies.live` → `sim.pools.enemies.live`; `nearest(...)` → `sim.spatial.nearest(...)`; `query(...)` → `sim.spatial.query(...)`; `Q1`/`Q2` → `sim.spatial.Q1`/`sim.spatial.Q2`.
- Replace every call `damage(e, ...)` → `damage(sim, e, ...)`; `addFx('kind', ...)` → `addFx(sim, 'kind', ...)`; `shoot(p, ...)` → `shoot(sim, p, ...)`; `beam(p, ...)` → `beam(sim, p, ...)` (recursive call inside `rail`'s evo branch); `jag(pts)` stays `jag(pts)` (unchanged, pure).
- In `updateWeapons`, `FIRE[w.id](p, w, st)` → `FIRE[w.id](sim, p, w, st)`.
- `wst`/`wdmg` keep their current signatures — they don't touch pools/spatial/G.

Concretely, the file becomes:

```javascript
import { TAU, rand, pick, angDiff } from '../core/utils.js';
import { WEAPONS } from '../data/tables.js';
import { damage, addFx, shoot, jag } from './combat.js';

export const wst = w => w.evo ? WEAPONS[w.id].evoS : WEAPONS[w.id].lv[w.lv - 1];
export const wdmg = (p, w, st) => st.dmg * p.s.dmgMul * (WEAPONS[w.id].explosive ? p.s.explosiveMul : 1);

export function beam(sim, p, a, len, wd, dmg) {
  const cx = Math.cos(a), cy = Math.sin(a), L = sim.pools.enemies.live;
  for (let i = 0; i < L.length; i++) {
    const e = L[i]; if (!e.alive) continue;
    const dx = e.x - p.x, dy = e.y - p.y, t = dx * cx + dy * cy;
    if (t < 0 || t > len) continue;
    if (Math.abs(dx * cy - dy * cx) < wd + e.r) damage(sim, e, dmg, p, cx * 80, cy * 80);
  }
  addFx(sim, 'beam', p.x, p.y, { a, r: len, w: wd, life: 0.3, color: '#6ff3e8' });
}
export function explode(sim, pr) {
  const p = pr.owner, burn = pr.dmg * 0.18;
  const { Q2 } = sim.spatial;
  sim.spatial.query(pr.x, pr.y, pr.er, Q2);
  for (const e of Q2) {
    const dx = e.x - pr.x, dy = e.y - pr.y, d = Math.hypot(dx, dy) || 1;
    damage(sim, e, pr.dmg, p, dx / d * 140, dy / d * 140);
    if (e.alive) { e.burnT = 2.2; e.burnDps = Math.max(e.burnDps, burn); e.burnOwner = p; }
  }
  addFx(sim, 'boom', pr.x, pr.y, { r: pr.er, life: 0.35, color: pr.color });
  if (pr.zone) {
    const z = sim.pools.projs.get(); z.kind = 'zone'; z.x = pr.x; z.y = pr.y; z.r = pr.er * 0.8; z.dmg = pr.dmg * 0.25; z.life = 2.6; z.t = 0; z.tick = 0;
    z.owner = p; z.color = '#ff8a3d'; z.hitIds.length = 0; z.hits = null; z.vx = z.vy = 0;
  }
  pr.alive = false;
}

const FIRE = {
  blade(sim, p, w, st) {
    const R = st.r * p.s.areaMul, dmg = wdmg(p, w, st), t = sim.spatial.nearest(p.x, p.y, R + 80);
    const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.fy, p.fx);
    const { Q1 } = sim.spatial;
    sim.spatial.query(p.x, p.y, R, Q1);
    if (w.evo) {
      for (const e of Q1) { const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1; damage(sim, e, dmg, p, dx / d * 320, dy / d * 320); }
      addFx(sim, 'shock', p.x, p.y, { r: R, life: 0.35, color: '#ffd166', owner: p });
      return true;
    }
    const n = st.n + p.s.amount, half = 0.62;
    for (let i = 0; i < n; i++) {
      const a = base + i * TAU / n;
      for (const e of Q1) {
        if (!e.alive) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (Math.abs(angDiff(Math.atan2(dy, dx), a)) <= half + e.r / d) damage(sim, e, dmg, p, dx / d * 160, dy / d * 160);
      }
      addFx(sim, 'slash', p.x, p.y, { r: R, a, half, life: 0.22, color: '#ffe2b0', owner: p });
    }
    return true;
  },
  rail(sim, p, w, st) {
    const t = sim.spatial.nearest(p.x, p.y, 700); if (!t) return false;
    const base = Math.atan2(t.y - p.y, t.x - p.x), dmg = wdmg(p, w, st), n = st.n + p.s.amount;
    if (w.evo) { for (let i = 0; i < n; i++) beam(sim, p, base + (i - (n - 1) / 2) * 0.22, st.len, st.w * p.s.areaMul, dmg); return true; }
    for (let i = 0; i < n; i++) shoot(sim, p, 'bullet', base + (i - (n - 1) / 2) * 0.09, 900, 5 * p.s.areaMul, dmg, { pierce: st.pierce, life: 1.1, color: '#6ff3e8' });
    return true;
  },
  wand(sim, p, w, st) {
    const dmg = wdmg(p, w, st), n = st.n + p.s.amount;
    if (w.evo) {
      const hit = new Set(); let any = false;
      for (let c = 0; c < n; c++) {
        let cur = sim.spatial.nearest(p.x, p.y, 520, hit); if (!cur) break;
        any = true; const pts = [p.x, p.y];
        for (let j = 0; j < st.jumps && cur; j++) {
          hit.add(cur.uid); pts.push(cur.x, cur.y);
          const cx = cur.x, cy = cur.y;
          damage(sim, cur, dmg * (1 - j * 0.06), p, 0, 0);
          cur = sim.spatial.nearest(cx, cy, st.jr * p.s.areaMul, hit);
        }
        addFx(sim, 'zap', p.x, p.y, { pts: jag(pts), life: 0.28, color: '#c9b8ff' });
      }
      return any;
    }
    const { Q1 } = sim.spatial;
    sim.spatial.query(p.x, p.y, 560, Q1); if (!Q1.length) return false;
    const px = p.x, py = p.y;
    Q1.sort((a, b) => ((a.x - px) ** 2 + (a.y - py) ** 2) - ((b.x - px) ** 2 + (b.y - py) ** 2));
    for (let i = 0; i < n; i++) {
      const t = Q1[i % Q1.length];
      shoot(sim, p, 'bolt', Math.atan2(t.y - py, t.x - px) + (i >= Q1.length ? rand(-0.25, 0.25) : 0), 520, 6, dmg, { pierce: 1, life: 1.4, color: '#b89cff' });
    }
    return true;
  },
  fireball(sim, p, w, st) {
    const { Q1 } = sim.spatial;
    sim.spatial.query(p.x, p.y, 520, Q1); if (!Q1.length) return false;
    const n = st.n + p.s.amount, dmg = wdmg(p, w, st);
    for (let i = 0; i < n; i++) {
      const t = pick(Q1);
      shoot(sim, p, 'fire', Math.atan2(t.y - p.y, t.x - p.x) + rand(-0.08, 0.08), 360, w.evo ? 12 : 8, dmg,
        { life: 1.8, er: st.r * p.s.areaMul, zone: !!st.zone, color: w.evo ? '#ffd166' : '#ff8a3d' });
    }
    return true;
  },
  boomerang(sim, p, w, st) {
    const t = sim.spatial.nearest(p.x, p.y, 480), base = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.fy, p.fx);
    const n = st.n + p.s.amount, sz = st.size || 1, dmg = wdmg(p, w, st);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * (w.evo ? TAU / n : 0.4);
      const pr = shoot(sim, p, 'boom', a, 480, 13 * sz * p.s.areaMul, dmg, { life: 5, out: 0.7, color: w.evo ? '#ffd166' : '#e8f0ff' });
      pr.hits = new Map();
    }
    return true;
  },
  thunder(sim, p, w, st) {
    const { Q1, Q2 } = sim.spatial;
    sim.spatial.query(p.x, p.y, 460, Q1); if (!Q1.length) return false;
    const n = st.n + p.s.amount, R = st.r * p.s.areaMul, dmg = wdmg(p, w, st);
    const spots = []; for (let i = 0; i < n; i++) { const t = pick(Q1); spots.push(t.x, t.y); }
    for (let i = 0; i < spots.length; i += 2) {
      const x = spots[i], y = spots[i + 1];
      sim.spatial.query(x, y, R, Q2);
      for (const e of Q2) { const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1; damage(sim, e, dmg, p, dx / d * 120, dy / d * 120); }
      addFx(sim, 'bolt', x, y, { r: R, life: 0.32, color: w.evo ? '#9ff9ff' : '#fff3a0', pts: jag([x + rand(-30, 30), y - 340, x, y]) });
      if (w.evo) { const c = sim.spatial.nearest(x, y, 170); if (c) { const cx = c.x, cy = c.y; damage(sim, c, dmg * 0.5, p, 0, 0); addFx(sim, 'zap', x, y, { pts: jag([x, y, cx, cy]), life: 0.22, color: '#9ff9ff' }); } }
    }
    return true;
  },
};
export function orbitTick(sim, p, w, st, dt) {
  w.ang += dt * (w.evo ? 3.8 : 3) * p.s.projSpeed;
  if (!w.evo) {
    if (w.on > 0) { w.on -= dt; if (w.on <= 0) { w.on = 0; w.off = st.cd * p.s.cdMul; } }
    else { w.off -= dt; if (w.off <= 0) w.on = st.dur; return; }
  }
  const n = st.n + p.s.amount, R = st.r * p.s.areaMul, sz = (w.evo ? 15 : 10) * p.s.areaMul, dmg = wdmg(p, w, st);
  if (w.hits.size > 3000) w.hits.clear();
  const { Q2 } = sim.spatial;
  for (let i = 0; i < n; i++) {
    const a = w.ang + i * TAU / n, ox = p.x + Math.cos(a) * R, oy = p.y + Math.sin(a) * R;
    sim.spatial.query(ox, oy, sz, Q2);
    for (const e of Q2) {
      const last = w.hits.get(e.uid);
      if (last !== undefined && sim.G.clock - last < 0.45) continue;
      w.hits.set(e.uid, sim.G.clock);
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
      damage(sim, e, dmg, p, dx / d * 200, dy / d * 200);
    }
  }
}
export function auraTick(sim, p, w, st) {
  const R = st.r * p.s.areaMul, dmg = wdmg(p, w, st);
  const { Q1 } = sim.spatial;
  sim.spatial.query(p.x, p.y, R, Q1);
  let hit = 0;
  for (const e of Q1) { damage(sim, e, dmg, p, 0, 0, true); hit++; }
  if (w.evo && hit) p.hp = Math.min(p.s.maxHp, p.hp + 1.5);
}
export function updateWeapons(sim, p, dt) {
  for (const w of p.weapons) {
    const st = wst(w);
    if (w.id === 'orbit') { orbitTick(sim, p, w, st, dt); continue; }
    w.t -= dt; if (w.t > 0) continue;
    if (w.id === 'aura') { w.t = 0.5; auraTick(sim, p, w, st); continue; }
    w.t = FIRE[w.id](sim, p, w, st) ? st.cd * p.s.cdMul : 0.15;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/game/weapons.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/weapons.js src/game/weapons.test.js
git commit -m "Thread sim instance through game/weapons.js

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 6: Thread `sim` through `game/director.js`

**Files:**
- Modify: `src/game/director.js` (every function gains a leading `sim` param; `enemies` → `sim.pools.enemies`; `G` → `sim.G`; `W, H` viewport globals are no longer imported from `core/canvas.js` — the server has no canvas, so `ringPos`/`spawnBoss`/`doRush` take a `viewW, viewH` pair from `sim.G` instead, see Step 3; `banner` → `sim.onBanner?.`)
- Test: `src/game/director.test.js`

**Interfaces:**
- Consumes: `sim.G`, `sim.pools.enemies`, `sim.onBanner`.
- Produces: `partyCenter(sim)`, `ringPos(sim, dist)`, `rollType(d)` (unchanged, pure), `spawnEnemy(sim, tid, x, y, m)`, `spawnBoss(sim, i)`, `doRush(sim, d)`, `director(sim, dt)`.
- **New field on `sim.G`**: `viewW`, `viewH` — replaces the client's `W`/`H` canvas globals as the "how far away can a spawn ring be" reference. Client sets these from `core/canvas.js`'s `W`/`H` each frame (Task 9); server sets fixed defaults (e.g. 1280/800, since there's no real viewport) when creating the room (Task 12).

- [ ] **Step 1: Write the failing test**

```javascript
// src/game/director.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../core/simulation.js';
import { newGame } from './state.js';
import { director } from './director.js';

test('director spawns enemies over time without a canvas', () => {
  const sim = createSimulation();
  newGame(sim, { cls: 'vanguard', party: 1, stage: 360 });
  sim.G.viewW = 1280; sim.G.viewH = 800;
  for (let i = 0; i < 60; i++) director(sim, 0.5); // 30 simulated seconds
  assert.ok(sim.pools.enemies.live.length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/game/director.test.js`
Expected: FAIL — `director` currently takes `(dt)` only and imports module-singleton `W`/`H`/`G`/`enemies`.

- [ ] **Step 3: Rewrite `src/game/director.js`**

```javascript
import { TAU, rand, REDUCED } from '../core/utils.js';
import { ETYPES, BOSSES, ENEMY_CAP } from '../data/tables.js';

export function partyCenter(sim) {
  const G = sim.G;
  let x = 0, y = 0, n = 0;
  for (const p of G.players) if (!p.dead) { x += p.x; y += p.y; n++; }
  return n ? [x / n, y / n] : [G.human.x, G.human.y];
}
export function ringPos(sim, dist) {
  const c = partyCenter(sim), R = dist || Math.hypot(sim.G.viewW, sim.G.viewH) / 2 + 60, a = Math.random() * TAU;
  return [c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R];
}
export function rollType(d) {
  const w = [['slime', Math.max(3, 10 - d * 0.5)], ['bat', d >= 1 ? 6 : 0], ['golem', d >= 3 ? 2.5 + d * 0.2 : 0], ['spitter', d >= 4 ? 2.2 : 0], ['wraith', d >= 7 ? 3 + d * 0.3 : 0]];
  let t = 0; for (const x of w) t += x[1];
  let r = Math.random() * t;
  for (const x of w) { r -= x[1]; if (r <= 0) return x[0]; }
  return 'slime';
}
export function spawnEnemy(sim, tid, x, y, m) {
  const T = ETYPES[tid], G = sim.G, e = sim.pools.enemies.get(), d = G.diff, hs = (1 + d * 0.2 + d * d * 0.017) * G.partyMul;
  e.tid = tid; e.uid = G.uid++; e.x = x; e.y = y; e.kx = 0; e.ky = 0; e.r = T.r; e.color = T.color; e.fx = 0; e.fy = 1;
  e.speed = T.speed * (1 + d * 0.012) * rand(0.9, 1.12); e.maxHp = e.hp = T.hp * hs; e.dmg = T.dmg * (1 + d * 0.06); e.xp = T.xp;
  e.flash = 0; e.elite = false; e.boss = false; e.final = false; e.name = ''; e.shootT = rand(1.5, 3);
  e.burnT = 0; e.burnDps = 0; e.burnAcc = 0; e.burnOwner = null; e.phase = Math.random() * TAU;
  if (m) {
    if (m.hpMul) { e.maxHp *= m.hpMul; e.hp = e.maxHp; }
    if (m.dmgMul) e.dmg *= m.dmgMul;
    if (m.speedMul) e.speed *= m.speedMul;
    if (m.r) e.r = m.r;
    if (m.elite) e.elite = true;
    if (m.xp) e.xp = m.xp;
  }
  return e;
}
export function spawnBoss(sim, i) {
  const B = BOSSES[i], G = sim.G, pos = ringPos(sim, Math.min(G.viewW, G.viewH) / 2 + 180);
  const e = spawnEnemy(sim, 'boss', pos[0], pos[1]);
  e.boss = true; e.final = !!B.final; e.name = B.name; e.color = B.color; e.r = B.r;
  e.maxHp = e.hp = B.hp * G.partyMul * G.bossMul; e.speed = B.speed; e.dmg = 22 + i * 8; e.xp = 80;
  e.burstN = B.burst; e.burstCd = B.burstCd; e.burstT = 3; e.burst2 = 0; e.dashCd = 6; e.teleT = 0; e.dashT = 0; e.spin = 0; e.tdx = 0; e.tdy = 0; e.dvx = 0; e.dvy = 0;
  G.bosses.push(e);
  if (!REDUCED) G.shake = 8;
  if (!G.demo) sim.onBanner?.(`${B.final ? '최종 보스' : '보스'} 출현: ${B.name}`, 'danger');
}
export function doRush(sim, d) {
  const G = sim.G, enemies = sim.pools.enemies;
  const cnt = Math.max(0, Math.min(ENEMY_CAP - enemies.live.length, Math.floor(20 + d * 4)));
  const c = partyCenter(sim), R = Math.hypot(G.viewW, G.viewH) / 2 + 40, tid = d < 6 ? 'bat' : 'wraith';
  for (let i = 0; i < cnt; i++) { const a = i / cnt * TAU; spawnEnemy(sim, tid, c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R); }
  const elite = G.rush >= 2 && G.rush % 2 === 0;
  if (elite) { const pos = ringPos(sim); spawnEnemy(sim, 'golem', pos[0], pos[1], { elite: true, hpMul: 10, r: 28, dmgMul: 1.6, speedMul: 1.2, xp: 20 }); }
  if (!G.demo) sim.onBanner?.(elite ? '웨이브 러시: 정예 결정 골렘 접근' : '웨이브 러시', 'warn');
}
export function director(sim, dt) {
  const G = sim.G;
  if (G.ending > 0 || G.won) return;
  const d = G.diff;
  const rate = (2.2 + d * 0.8) * (1 + 0.3 * (G.partyN - 1));
  G.spawnAcc = Math.min(G.spawnAcc + rate * dt, 8);
  while (G.spawnAcc >= 1 && sim.pools.enemies.live.length < ENEMY_CAP) {
    G.spawnAcc -= 1;
    const pos = ringPos(sim); spawnEnemy(sim, rollType(d), pos[0], pos[1]);
  }
  if (G.time >= G.nextRush) { G.nextRush += G.stageLen / 15; G.rush++; doRush(sim, d); }
  if (G.bossIdx < 3 && G.time >= G.bossTimes[G.bossIdx]) { spawnBoss(sim, G.bossIdx); G.bossIdx++; }
}
```

- [ ] **Step 4: Add `viewW`/`viewH` to `newGame` in `src/game/state.js`**

In the `sim.G = {...}` object literal from Task 3, add two fields with sane defaults (the client overwrites them every frame in Task 9; the server sets them once at room creation in Task 12):

```javascript
    won: false, ending: 0, shake: 0, uid: 1, bonusShards: 0, rerolls: sim.meta.lv.reroll || 0,
    viewW: 1280, viewH: 800,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test src/game/director.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/game/director.js src/game/state.js src/game/director.test.js
git commit -m "Thread sim instance through game/director.js, replace canvas W/H with G.viewW/viewH

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 7: Thread `sim` through `game/growth.js`

**Files:**
- Modify: `src/game/growth.js` (every function gains a leading `sim` param; `G` → `sim.G`; `addFx` calls gain `sim`; `banner` → `sim.onBanner?.`)
- Modify: `src/game/state.js:` the `startDemo` call to `botLevel(sim, p)` (already written that way in Task 3 — no change needed here, just confirms it now compiles)
- Test: `src/game/growth.test.js`

**Interfaces:**
- Consumes: `addFx(sim, ...)` (Task 4), `newWeapon`/`recompute` (Task 3, both already sim-first: `recompute(sim, p)`).
- Produces: `gainXp(sim, p, v)`, `getOptions(p, n)` (unchanged, pure — reads only `p` and the static `WEAPONS`/`PASSIVES` tables), `applyOption(sim, p, o)`, `optName(o)` (unchanged, pure), `botLevel(sim, p)`, `openChest(sim, p)`.

- [ ] **Step 1: Write the failing test**

```javascript
// src/game/growth.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/game/growth.test.js`
Expected: FAIL — `gainXp` currently takes `(p, v)` and imports module-singleton `G`.

- [ ] **Step 3: Rewrite `src/game/growth.js`**

```javascript
import { REDUCED } from '../core/utils.js';
import { WEAPONS, PASSIVES, xpNeed } from '../data/tables.js';
import { newWeapon, recompute } from './state.js';
import { addFx } from './combat.js';

export function gainXp(sim, p, v) {
  const G = sim.G;
  p.xp += v * p.s.xpMul * G.xpMul;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext; p.level++; p.xpNext = xpNeed(p.level);
    if (p.auto) botLevel(sim, p); else p.pending++;
    addFx(sim, 'ring', p.x, p.y, { r: 46, life: 0.45, color: '#6ff3e8', owner: p });
  }
}
export function getOptions(p, n) {
  const pool = [];
  for (const w of p.weapons) if (!w.evo && w.lv < 5) pool.push({ kind: 'wup', id: w.id, w: 3 });
  if (p.weapons.length < 4) for (const id in WEAPONS) if (!p.weapons.some(w => w.id === id)) pool.push({ kind: 'wnew', id, w: 1.2 });
  for (const q of p.passives) if (q.lv < 5) pool.push({ kind: 'pup', id: q.id, w: 2 });
  if (p.passives.length < 4) for (const id in PASSIVES) if (!p.passives.some(q => q.id === id)) pool.push({ kind: 'pnew', id, w: 1 });
  const out = [];
  while (out.length < n && pool.length) {
    let t = 0; for (const o of pool) t += o.w;
    let r = Math.random() * t, i = 0;
    for (; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) break; }
    out.push(pool.splice(Math.min(i, pool.length - 1), 1)[0]);
  }
  if (!out.length) { out.push({ kind: 'heal' }); if (n > 1) out.push({ kind: 'shard' }); }
  return out;
}
export function applyOption(sim, p, o) {
  if (o.kind === 'wnew') p.weapons.push(newWeapon(o.id));
  else if (o.kind === 'wup') { const w = p.weapons.find(w => w.id === o.id); if (w) w.lv++; }
  else if (o.kind === 'pnew') p.passives.push({ id: o.id, lv: 1 });
  else if (o.kind === 'pup') { const q = p.passives.find(q => q.id === o.id); if (q) q.lv++; }
  else if (o.kind === 'heal') p.hp = Math.min(p.s.maxHp, p.hp + p.s.maxHp * 0.3);
  else if (o.kind === 'shard') sim.G.bonusShards += 10;
  recompute(sim, p);
}
export function optName(o) {
  if (o.kind === 'wnew' || o.kind === 'wup') return WEAPONS[o.id].name;
  if (o.kind === 'pnew' || o.kind === 'pup') return PASSIVES[o.id].name;
  return o.kind === 'heal' ? '응급 회복' : '에테르 파편';
}
export function botLevel(sim, p) {
  const opts = getOptions(p, 3);
  let best = opts[0], bs = -1;
  for (const o of opts) {
    let sc = Math.random();
    if (o.kind === 'wup') sc += 1.2;
    if (o.kind === 'wnew') sc += 0.6;
    if ((o.kind === 'pnew' || o.kind === 'pup') && p.weapons.some(w => WEAPONS[w.id].pair === o.id)) sc += 1.5;
    if (sc > bs) { bs = sc; best = o; }
  }
  applyOption(sim, p, best);
}
export function openChest(sim, p) {
  const G = sim.G;
  addFx(sim, 'ring', p.x, p.y, { r: 150, life: 0.8, color: '#ffd166' });
  if (!REDUCED) G.shake = Math.max(G.shake, 5);
  const w = p.weapons.find(w => !w.evo && w.lv >= 5 && p.passives.some(q => q.id === WEAPONS[w.id].pair));
  if (w) {
    w.evo = true; w.t = 0; w.on = 0; w.off = 0; w.hits.clear();
    const D = WEAPONS[w.id];
    if (!G.demo) sim.onBanner?.(`${p === G.human ? '' : p.name + ' '}진화! ${D.name} → ${D.evo}`, 'evo');
    return;
  }
  const gains = [];
  for (let i = 0; i < 2; i++) { const o = getOptions(p, 1)[0]; applyOption(sim, p, o); gains.push(optName(o)); }
  if (!G.demo && p === G.human) sim.onBanner?.(`에테르 상자: ${gains.join(', ')} 강화`, 'good');
}
```

Note: `state.js` imports `botLevel` from this file — since `state.js` (Task 3) is loaded before `growth.js` normally, but `growth.js` imports `newWeapon, recompute` back from `state.js`, this is the same intentional circular import that existed pre-refactor (both only use the imported binding inside function bodies, never at module top level, so it resolves fine under ESM).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/game/growth.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/growth.js src/game/growth.test.js
git commit -m "Thread sim instance through game/growth.js

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 8: Thread `sim` through `game/systems.js`

**Files:**
- Modify: `src/game/systems.js` (every internal function and the exported `update` gain a leading `sim` param; `G`/pools/spatial become `sim.*`; `W, H` become `sim.G.viewW/viewH`; `updateWeapons`/`director`/`gainXp`/`openChest`/`damage`/`hurtPlayer`/`fireEbul`/`addFx` calls gain `sim` per prior tasks' new signatures; the two DOM-touching calls (`openLevelUp()`, `finishGame()`) are replaced with `sim.onLevelUp?.()` / `sim.onGameOver?.()` callbacks — Task 9 wires these to the real UI functions for solo; the server (Task 12) leaves them unset and instead reacts to `sim.G.mode`/`sim.G.ending` directly in its own tick loop)
- Test: `src/game/systems.test.js`

**Interfaces:**
- Consumes: everything produced by Tasks 3-7, all now `sim`-first.
- Produces: `update(sim, dt)`. New optional hooks on `sim`: `sim.onLevelUp` (called when a pending level-up choice is ready), `sim.onGameOver` (called once when a run ends).

- [ ] **Step 1: Write the failing test**

```javascript
// src/game/systems.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../core/simulation.js';
import { newGame } from './state.js';
import { update } from './systems.js';

test('update advances game clock and runs the director', () => {
  const sim = createSimulation();
  newGame(sim, { cls: 'vanguard', party: 1, stage: 360 });
  for (let i = 0; i < 120; i++) update(sim, 0.05); // 6 simulated seconds
  assert.ok(sim.G.clock > 5.9);
  assert.ok(sim.pools.enemies.live.length > 0);
});

test('onLevelUp fires instead of touching the DOM', () => {
  const sim = createSimulation();
  newGame(sim, { cls: 'vanguard', party: 1, stage: 360 });
  let fired = false;
  sim.onLevelUp = () => { fired = true; };
  sim.G.human.pending = 1;
  update(sim, 0.016);
  assert.equal(fired, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/game/systems.test.js`
Expected: FAIL — `update` currently takes `(dt)`, imports module-singleton `G`/`W`/`H`/pools, and calls `openLevelUp()`/`finishGame()` from the `ui/` layer directly (which import `document`, unavailable under `node --test`).

- [ ] **Step 3: Rewrite `src/game/systems.js`**

```javascript
import { lerp, rand, TAU } from '../core/utils.js';
import { CLASSES, ETYPES, REVIVE_TIME } from '../data/tables.js';
import { damage, hurtPlayer, fireEbul, addFx } from './combat.js';
import { explode, updateWeapons } from './weapons.js';
import { director, ringPos } from './director.js';
import { gainXp, openChest } from './growth.js';

function botDir(sim, p) {
  const G = sim.G;
  let ax = 0, ay = 0;
  const lead = G.human && !G.human.dead && G.human !== p ? G.human : null;
  let soul = null, sd = 1e9;
  for (const o of G.players) if (o.dead && o !== p) { const d = Math.hypot(o.x - p.x, o.y - p.y); if (d < sd) { sd = d; soul = o; } }
  const { Q3 } = sim.spatial;
  sim.spatial.query(p.x, p.y, 180, Q3);
  for (const e of Q3) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, wgt = (180 - d) / 180 * (e.boss ? 4 : 1);
    ax += dx / d * wgt * 1.6; ay += dy / d * wgt * 1.6;
  }
  for (const b of sim.pools.ebul.live) {
    if (!b.alive) continue;
    const dx = p.x - b.x, dy = p.y - b.y, d2 = dx * dx + dy * dy;
    if (d2 < 12100) { const d = Math.sqrt(d2) || 1; ax += dx / d * 1.2; ay += dy / d * 1.2; }
  }
  if (soul && sd < 900) {
    if (sd > 20) { ax += (soul.x - p.x) / sd * 2.4; ay += (soul.y - p.y) / sd * 2.4; }
  } else {
    let g = null, gd = 380 * 380;
    for (const q of sim.pools.drops.live) { if (!q.alive) continue; const dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy; if (d2 < gd) { gd = d2; g = q; } }
    if (g) {
      const d = Math.sqrt(gd) || 1, wgt = g.kind === 'chest' ? 1.6 : (g.kind === 'potion' && p.hp < p.s.maxHp * 0.6) ? 1.6 : (Q3.length ? 0.7 : 1.1);
      ax += (g.x - p.x) / d * wgt; ay += (g.y - p.y) / d * wgt;
    }
    if (lead) {
      const dx = lead.x - p.x, dy = lead.y - p.y, d = Math.hypot(dx, dy);
      if (d > 200) { const wgt = Math.min(2.5, (d - 200) / 150); ax += dx / d * wgt; ay += dy / d * wgt; }
    } else { p.wig += 0.008; ax += Math.cos(p.wig) * 0.45; ay += Math.sin(p.wig) * 0.45; }
  }
  return [ax, ay];
}
function updatePlayers(sim, dt, input) {
  const G = sim.G;
  const medics = G.players.filter(p => !p.dead && CLASSES[p.cls].aura);
  for (const p of G.players) {
    p.auraRegen = 0; p.auraMag = 1;
    for (const m of medics) if (Math.hypot(m.x - p.x, m.y - p.y) < 190) { p.auraRegen = 0.8; p.auraMag = 1.3; break; }
  }
  const { Q1 } = sim.spatial;
  for (const p of G.players) {
    if (p.dead) continue;
    let dx = 0, dy = 0;
    if (p.auto) { const v = botDir(sim, p); dx = v[0]; dy = v[1]; }
    else { const v = input(p); dx = v.x; dy = v.y; }
    const len = Math.hypot(dx, dy); if (len > 1) { dx /= len; dy /= len; }
    const sm = Math.min(1, dt * (p.auto ? 6 : 16));
    p.mx = lerp(p.mx, dx, sm); p.my = lerp(p.my, dy, sm);
    p.x += p.mx * p.s.speed * dt; p.y += p.my * p.s.speed * dt;
    const ml = Math.hypot(p.mx, p.my); if (ml > 0.2) { p.fx = p.mx / ml; p.fy = p.my / ml; }
    p.hp = Math.min(p.s.maxHp, p.hp + (p.s.regen + p.auraRegen) * dt);
    p.iframe -= dt; p.hurt -= dt;
    if (p.iframe <= 0) {
      sim.spatial.query(p.x, p.y, p.r, Q1);
      let worst = 0; for (const e of Q1) if (e.dmg > worst) worst = e.dmg;
      if (worst > 0) hurtPlayer(sim, p, worst);
    }
  }
}
function updateProjs(sim, dt) {
  const { Q1 } = sim.spatial;
  const L = sim.pools.projs.live;
  for (let i = 0; i < L.length; i++) {
    const pr = L[i]; if (!pr.alive) continue;
    pr.t += dt;
    if (pr.kind === 'zone') {
      pr.life -= dt; pr.tick -= dt;
      if (pr.tick <= 0) { pr.tick = 0.4; sim.spatial.query(pr.x, pr.y, pr.r, Q1); for (const e of Q1) damage(sim, e, pr.dmg, pr.owner, 0, 0, true); }
      if (pr.life <= 0) pr.alive = false;
      continue;
    }
    if (pr.kind === 'boom') {
      const o = pr.owner;
      if (pr.t < pr.out) { const f = 1 - pr.t / pr.out; pr.x += pr.vx * f * dt * 1.6; pr.y += pr.vy * f * dt * 1.6; }
      else {
        const dx = o.x - pr.x, dy = o.y - pr.y, d = Math.hypot(dx, dy) || 1, sp = Math.min(900, 150 + (pr.t - pr.out) * 900);
        const step = Math.min(sp * dt, d); pr.x += dx / d * step; pr.y += dy / d * step;
        if (d < 22 || o.dead) pr.alive = false;
      }
      sim.spatial.query(pr.x, pr.y, pr.r, Q1);
      for (const e of Q1) {
        const last = pr.hits.get(e.uid);
        if (last !== undefined && sim.G.clock - last < 0.4) continue;
        pr.hits.set(e.uid, sim.G.clock); damage(sim, e, pr.dmg, o, pr.vx * 0.15, pr.vy * 0.15);
      }
      pr.life -= dt; if (pr.life <= 0) pr.alive = false;
      continue;
    }
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
    if (pr.kind === 'fire') { sim.spatial.query(pr.x, pr.y, pr.r, Q1); if (Q1.length || pr.life <= 0) explode(sim, pr); continue; }
    sim.spatial.query(pr.x, pr.y, pr.r, Q1);
    for (const e of Q1) {
      if (pr.hitIds.includes(e.uid)) continue;
      pr.hitIds.push(e.uid);
      damage(sim, e, pr.dmg, pr.owner, pr.vx * 0.12, pr.vy * 0.12);
      if (--pr.pierce <= 0) { pr.alive = false; break; }
    }
    if (pr.life <= 0) pr.alive = false;
  }
}
function updateEnemies(sim, dt) {
  const G = sim.G;
  const L = sim.pools.enemies.live, P = G.players, relocate = Math.hypot(G.viewW, G.viewH) / 2 + 560, damp = Math.max(0, 1 - dt * 9);
  const { grid, gkey, CELL } = sim.spatial;
  for (let i = 0; i < L.length; i++) {
    const e = L[i]; if (!e.alive) continue;
    if (e.flash > 0) e.flash -= dt;
    if (e.burnT > 0) {
      e.burnT -= dt; e.burnAcc += e.burnDps * dt;
      if (e.burnAcc >= 4) { const a = e.burnAcc; e.burnAcc = 0; damage(sim, e, a, e.burnOwner, 0, 0, true); if (!e.alive) continue; }
      if (e.burnT <= 0) e.burnDps = 0;
    }
    let tp = null, td = 1e12;
    for (const p of P) { if (p.dead) continue; const dx = p.x - e.x, dy = p.y - e.y, d = dx * dx + dy * dy; if (d < td) { td = d; tp = p; } }
    if (!tp) { e.x += e.kx * dt; e.y += e.ky * dt; e.kx *= damp; e.ky *= damp; continue; }
    td = Math.sqrt(td) || 1;
    if (!e.boss && td > relocate) { const pos = ringPos(sim); e.x = pos[0]; e.y = pos[1]; continue; }
    const dx = (tp.x - e.x) / td, dy = (tp.y - e.y) / td;
    e.fx = dx; e.fy = dy;
    let vx = dx * e.speed, vy = dy * e.speed;
    if (e.boss) {
      e.spin += dt;
      if (e.dashT > 0) { e.dashT -= dt; vx = e.dvx; vy = e.dvy; }
      else if (e.teleT > 0) { e.teleT -= dt; vx = vy = 0; if (e.teleT <= 0) { e.dashT = 0.75; e.dvx = e.tdx * e.speed * 5.5; e.dvy = e.tdy * e.speed * 5.5; } }
      else { e.dashCd -= dt; if (e.dashCd <= 0 && td < 650) { e.dashCd = rand(5.5, 7.5); e.teleT = 0.7; e.tdx = dx; e.tdy = dy; } }
      e.burstT -= dt;
      if (e.burstT <= 0) {
        e.burstT = e.burstCd;
        const off = e.spin * 0.7;
        for (let b = 0; b < e.burstN; b++) { const a = off + b / e.burstN * TAU; fireEbul(sim, e.x, e.y, Math.cos(a), Math.sin(a), e.final ? 170 : 150, 7, e.dmg * 0.6); }
        if (e.final) e.burst2 = 0.5;
      }
      if (e.burst2 > 0) {
        e.burst2 -= dt;
        if (e.burst2 <= 0) { const off = e.spin * 0.7 + Math.PI / e.burstN; for (let b = 0; b < e.burstN; b++) { const a = off + b / e.burstN * TAU; fireEbul(sim, e.x, e.y, Math.cos(a), Math.sin(a), 130, 7, e.dmg * 0.6); } }
      }
    } else if (ETYPES[e.tid].ranged) {
      if (td < 240) { vx *= -0.4; vy *= -0.4; }
      e.shootT -= dt;
      if (e.shootT <= 0 && td < 520) { e.shootT = rand(2.4, 3.2); fireEbul(sim, e.x, e.y, dx, dy, 190, 6, e.dmg); }
    }
    e.x += (vx + e.kx) * dt; e.y += (vy + e.ky) * dt;
    e.kx *= damp; e.ky *= damp;
    if (!e.boss) {
      const a = grid.get(gkey(Math.floor(e.x / CELL), Math.floor(e.y / CELL)));
      if (a && a.length > 1) {
        const n = a.length, st = e.uid % n; let c = 0;
        for (let q = 0; q < n && c < 6; q++) {
          const o = a[(st + q) % n]; if (o === e || !o.alive) continue; c++;
          const sx = e.x - o.x, sy = e.y - o.y, dd = sx * sx + sy * sy, rr = e.r + o.r;
          if (dd < rr * rr && dd > 0.01) {
            const dist = Math.sqrt(dd), push = (rr - dist) * 0.5 / dist;
            e.x += sx * push; e.y += sy * push;
            if (!o.boss) { o.x -= sx * push * 0.5; o.y -= sy * push * 0.5; }
          }
        }
      }
    }
  }
}
function updateEbul(sim, dt) {
  for (const b of sim.pools.ebul.live) {
    if (!b.alive) continue;
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0) { b.alive = false; continue; }
    for (const p of sim.G.players) {
      if (p.dead) continue;
      const dx = p.x - b.x, dy = p.y - b.y, rr = p.r + b.r;
      if (dx * dx + dy * dy < rr * rr) { hurtPlayer(sim, p, b.dmg); b.alive = false; break; }
    }
  }
}
function collect(sim, p, g) {
  if (g.kind === 'xp') gainXp(sim, p, g.v);
  else if (g.kind === 'potion') { p.hp = Math.min(p.s.maxHp, p.hp + Math.max(30, p.s.maxHp * 0.3)); addFx(sim, 'ring', p.x, p.y, { r: 40, life: 0.4, color: '#ff5277', owner: p }); }
  else if (g.kind === 'magnet') { for (const q of sim.pools.drops.live) if (q.alive && q.kind === 'xp') q.vac = true; addFx(sim, 'ring', p.x, p.y, { r: 400, life: 0.6, color: '#6ff3e8' }); }
  else if (g.kind === 'chest') openChest(sim, p);
}
function updateDrops(sim, dt) {
  const P = sim.G.players;
  for (const g of sim.pools.drops.live) {
    if (!g.alive) continue;
    g.t += dt;
    let tp = null, td = 1e12;
    for (const p of P) { if (p.dead) continue; const dx = p.x - g.x, dy = p.y - g.y, d = dx * dx + dy * dy; if (d < td) { td = d; tp = p; } }
    if (!tp) continue;
    let d = Math.sqrt(td) || 1;
    if (g.kind === 'xp' && (g.vac || d < tp.s.magnet * tp.auraMag)) {
      g.sp = Math.min(g.sp + dt * 1400, 900);
      const step = Math.min(Math.max(g.sp, 120) * dt, d);
      g.x += (tp.x - g.x) / d * step; g.y += (tp.y - g.y) / d * step;
      d -= step;
    }
    if (d < tp.r + 10) { g.alive = false; collect(sim, tp, g); }
  }
}
function updateSouls(sim, dt) {
  const G = sim.G;
  for (const p of G.players) {
    if (!p.dead) continue;
    let k = 0, mul = 1;
    for (const o of G.players) if (!o.dead && Math.hypot(o.x - p.x, o.y - p.y) < 48) { k++; mul = Math.max(mul, o.s.reviveMul); }
    if (k > 0) p.revive += dt / REVIVE_TIME * mul * (1 + 0.5 * (k - 1));
    else p.revive = Math.max(0, p.revive - dt * 0.12);
    if (p.revive >= 1) {
      p.dead = false; p.hp = p.s.maxHp * 0.5; p.iframe = 2; p.revive = 0;
      addFx(sim, 'ring', p.x, p.y, { r: 90, life: 0.7, color: '#63f5a8' });
      if (!G.demo) sim.onBanner?.(p === G.human ? '부활했습니다' : `${p.name} 부활`, 'good');
    }
  }
}
function updateFx(sim, dt) {
  for (const f of sim.pools.fxs.live) { if (!f.alive) continue; f.t += dt; if (f.t >= f.life) f.alive = false; }
  for (const t of sim.pools.texts.live) { if (!t.alive) continue; t.t += dt; if (t.t >= 0.6) t.alive = false; }
}

const noInput = () => ({ x: 0, y: 0 });

export function update(sim, dt, input = noInput) {
  const { G, pools } = sim;
  G.clock += dt;
  if (!G.won) G.time += dt;
  G.diff = Math.min(G.time, G.stageLen) / G.stageLen * 15 + Math.max(0, G.time - G.stageLen) / 60;
  director(sim, dt);
  sim.spatial.gridBuild();
  updatePlayers(sim, dt, input);
  for (const p of G.players) if (!p.dead) updateWeapons(sim, p, dt);
  updateProjs(sim, dt);
  updateEnemies(sim, dt);
  updateEbul(sim, dt);
  updateDrops(sim, dt);
  updateSouls(sim, dt);
  updateFx(sim, dt);
  pools.enemies.compact(); pools.projs.compact(); pools.ebul.compact(); pools.drops.compact(); pools.fxs.compact(); pools.texts.compact();
  const h = G.human, k = Math.min(1, dt * 8);
  G.cam.x = lerp(G.cam.x, h.x, k); G.cam.y = lerp(G.cam.y, h.y, k);
  G.shake = Math.max(0, G.shake - dt * 20);
  if (G.ending > 0) { G.ending -= dt; if (G.ending <= 0) sim.onGameOver?.(); }
  else if (!G.won && G.players.every(p => p.dead)) { G.ending = 1.6; if (!G.demo) sim.onBanner?.('파티 전멸', 'danger'); }
  if (!G.demo && G.mode === 'play' && G.ending <= 0 && h.pending > 0 && !h.dead) sim.onLevelUp?.();
}
```

Note the new `input` parameter on `update`/`updatePlayers`: previously `updatePlayers` read `keys`/`touch` module singletons directly from `game/input.js`. Since the server has no keyboard/touch, input is now a function `(p) => ({x, y})` passed in by the caller — solo mode (Task 9) passes a function reading `keys`/`touch` for the human player and `{x:0,y:0}` for bots (bots use `botDir` regardless, so this function is only ever invoked for the non-auto human player); the server (Task 12) passes a function reading each room player's latest network input message.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/game/systems.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/game/systems.js src/game/systems.test.js
git commit -m "Thread sim instance through game/systems.js, decouple input/DOM via callbacks

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 9: Wire the client (solo mode) to the new `sim`-based API — regression checkpoint

**Files:**
- Modify: `src/main.js`, `src/game/input.js`, `src/ui/lobby.js`, `src/ui/levelup.js`, `src/ui/pause.js`, `src/ui/result.js`, `src/render/render.js`
- No new tests here — this task's verification is the manual solo playtest (Step 6), matching the one already done in Phase 1.

**Interfaces:**
- Consumes: `createSimulation` (Task 2), `newGame`/`startDemo` (Task 3), `update` (Task 8), everything else from Tasks 3-8 (all `sim`-first now).
- Produces: a single module-level `sim` created once in `main.js` and imported by every UI/render/input module that needs it (this mirrors the old `G` singleton pattern but now `sim` is one explicit object instead of several implicit ones — still a singleton on the client, which is correct since a browser tab only ever runs one game at a time).

- [ ] **Step 1: `main.js` creates the sim and wires DOM callbacks**

```javascript
// src/main.js
import '../style.css';
import { createSimulation } from './core/simulation.js';
import { startDemo } from './game/state.js';
import { update } from './game/systems.js';
import { render, tickFps } from './render/render.js';
import { renderLobby } from './ui/lobby.js';
import { loadMeta, saveMeta } from './core/meta.js';
import { banner } from './ui/banner.js';
import { openLevelUp } from './ui/levelup.js';
import { finishGame } from './ui/result.js';
import { getInput } from './game/input.js';

export const sim = createSimulation();
sim.onBanner = banner;
sim.onLevelUp = openLevelUp;
sim.onGameOver = finishGame;

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;
  tickFps(dt);
  if (sim.G && sim.G.mode === 'play') update(sim, dt, getInput);
  render(sim);
}
startDemo(sim);
renderLobby();
loadMeta(sim.meta).then(renderLobby);
requestAnimationFrame(frame);
```

- [ ] **Step 2: `game/input.js` exports `getInput(p)` instead of reading `keys`/`touch` inline elsewhere, and imports `sim` from `main.js`**

Modify `src/game/input.js`: add `import { sim } from '../main.js';` at the top (this is the one place the circular `main.js` ↔ `input.js` import is acceptable — both only touch the imported binding inside functions/callbacks, never at module top level). Replace every bare `G` reference in the existing keydown handler with `sim.G`. Add this export, used by `main.js`'s `update(sim, dt, getInput)` call:

```javascript
export function getInput(p) {
  if (p !== sim.G.human) return { x: 0, y: 0 };
  let dx = 0, dy = 0;
  if (keys.KeyW || keys.ArrowUp) dy -= 1;
  if (keys.KeyS || keys.ArrowDown) dy += 1;
  if (keys.KeyA || keys.ArrowLeft) dx -= 1;
  if (keys.KeyD || keys.ArrowRight) dx += 1;
  dx += touch.x; dy += touch.y;
  return { x: dx, y: dy };
}
```

The rest of `input.js` (keydown/keyup/pointer listeners) is unchanged except every `G.` becomes `sim.G.` and every call like `openPause()` stays the same (those UI functions gain `sim` access via their own imports in Steps 3-5, not via `input.js`).

- [ ] **Step 3: `ui/lobby.js`, `ui/levelup.js`, `ui/pause.js`, `ui/result.js` import `sim` from `main.js` and pass it through**

In each of these four files: add `import { sim } from '../main.js';`, replace every bare `G` with `sim.G`, and update every call into Tasks 3-8's functions to pass `sim` first — e.g. in `lobby.js`'s `startRun`: `newGame(sim, { cls: sel.cls, party: sel.party, stage: sel.stage });`; in `levelup.js`'s `chooseOption`: `applyOption(sim, sim.G.human, curOpts[i]);` and `getOptions(sim.G.human, 3)` (note `getOptions` itself did NOT gain a `sim` param in Task 7 — it's pure — only `applyOption` needs `sim`); in `result.js`'s `finishGame`: `startDemo(sim)`, and the shard-earning block reads/writes `sim.meta` instead of the standalone `meta` import, then calls `saveMeta(sim.meta)`.

- [ ] **Step 4: `core/meta.js` takes the meta object as a parameter instead of owning a module-level singleton**

```javascript
// src/core/meta.js
export async function loadMeta(meta) {
  try { const raw = localStorage.getItem('arc-meta'); if (raw) { const m = JSON.parse(raw); meta.shards = m.shards || 0; meta.lv = m.lv || {}; } } catch (e) { /* 저장소 없음: 세션 내 유지 */ }
}
export async function saveMeta(meta) { try { localStorage.setItem('arc-meta', JSON.stringify(meta)); } catch (e) { /* 무시 */ } }
```

Every call site (`lobby.js`'s buy-upgrade handler, `result.js`'s `finishGame`) becomes `saveMeta(sim.meta)` / `loadMeta(sim.meta)`.

- [ ] **Step 5: `render/render.js` takes `sim` as a parameter instead of importing `G`/pools as singletons**

The exported `render()` function's signature becomes `render(sim)` (called from `main.js` as `render(sim)`, Step 1). Internally, every `G.` becomes `sim.G.`, every direct pool reference (`enemies.live`, `projs.live`, etc.) becomes `sim.pools.enemies.live`, etc. `wst(w)` stays a pure call (unchanged from Task 5). The `W`, `H` used for indicator/HUD math still come from `core/canvas.js` as before (that's real viewport size, distinct from `sim.G.viewW/viewH` which is the *simulation's* logical view radius reference used by the director for spawn rings) — but `main.js`'s frame loop now also does `sim.G && (sim.G.viewW = W, sim.G.viewH = H)` each frame before calling `update`, keeping the director's spawn geometry in sync with the actual window size (this replaces director.js's former direct import of `core/canvas.js`).

Add this line to `main.js`'s `frame` function from Step 1, right before the `update` call:

```javascript
  if (sim.G) { sim.G.viewW = W; sim.G.viewH = H; }
```

(`W`, `H` come from `import { W, H } from './core/canvas.js';`, added to `main.js`'s imports.)

- [ ] **Step 6: Manual regression test — repeat the Phase 1 playtest**

Run: `npm run dev`, open the app in a browser.
Expected, exactly matching Phase 1's verified behavior:
- Lobby renders with class grid, party/stage selectors, meta upgrades, shard count.
- Demo battle plays in the background behind the lobby.
- Clicking 출격 starts a run; player moves with WASD; enemies spawn and can be damaged/killed; level-up modal appears and choosing an option closes it; Escape opens the pause menu showing current build and the evolution recipe table; closing pause resumes; reaching the end of a run shows the result screen with stats and returns to the lobby.
- No console errors.

- [ ] **Step 7: Production build check**

Run: `npm run build`
Expected: builds cleanly with no errors (matches Phase 1's baseline).

- [ ] **Step 8: Commit**

```bash
git add src/main.js src/game/input.js src/ui/lobby.js src/ui/levelup.js src/ui/pause.js src/ui/result.js src/core/meta.js src/render/render.js
git commit -m "Wire client to sim-based API; solo mode verified unchanged

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Milestone B — Colyseus server skeleton

### Task 10: Install server dependencies and create the entrypoint

**Files:**
- Modify: `package.json` (new `dependencies`: `colyseus`, `@colyseus/schema`, `express`; new script `server:dev`)
- Create: `server/index.js`

**Interfaces:**
- Produces: a running HTTP+WS server on `process.env.PORT || 2567` with a health-check route, ready for Task 11's room to be registered into it.

- [ ] **Step 1: Install dependencies**

Run: `npm install colyseus @colyseus/schema express`
Expected: adds three packages to `package.json` `dependencies` (not `devDependencies` — this code runs in production on Render).

- [ ] **Step 2: Write `server/index.js`**

```javascript
import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'colyseus';

const app = express();
app.get('/healthz', (_req, res) => res.send('ok'));

const port = Number(process.env.PORT) || 2567;
const gameServer = new Server({ server: createServer(app) });

gameServer.listen(port);
console.log(`Project ARC server listening on ${port}`);
```

- [ ] **Step 3: Add the `server:dev` script to `package.json`**

In the `"scripts"` block, add: `"server:dev": "node server/index.js"`.

- [ ] **Step 4: Verify it starts**

Run: `npm run server:dev` (in one terminal), then in another: `curl http://localhost:2567/healthz`
Expected: server logs `Project ARC server listening on 2567`; curl returns `ok`. Stop the server (Ctrl+C) before continuing.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json server/index.js
git commit -m "Add Colyseus server entrypoint

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 11: Network schema

**Files:**
- Create: `server/schema/RoomState.js`

**Interfaces:**
- Produces: `PlayerState`, `EnemyState`, `ProjectileState`, `DropState`, `RoomState` classes (all `@colyseus/schema` `Schema` subclasses) for Task 12 to populate and Task 14's client to read.

- [ ] **Step 1: Write `server/schema/RoomState.js`**

```javascript
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

export class RoomState extends Schema {}
type({ map: PlayerState })(RoomState.prototype, 'players');
type({ map: EnemyState })(RoomState.prototype, 'enemies');
type({ map: ProjectileState })(RoomState.prototype, 'projectiles');
type({ map: DropState })(RoomState.prototype, 'drops');
type('number')(RoomState.prototype, 'time');
type('number')(RoomState.prototype, 'kills');

RoomState.prototype.constructor = function () {
  Schema.call(this);
  this.players = new MapSchema();
  this.enemies = new MapSchema();
  this.projectiles = new MapSchema();
  this.drops = new MapSchema();
  this.time = 0;
  this.kills = 0;
};
```

Note: this uses `@colyseus/schema`'s decorator-free `type()` function form (works without a TypeScript/Babel decorator pipeline, which this project's plain Vite+ESM setup does not have configured — avoids adding a build-step dependency just for decorator syntax).

- [ ] **Step 2: Verify it loads without error**

Run: `node -e "import('./server/schema/RoomState.js').then(m => { const s = new m.RoomState(); console.log(s.players.size, s.time); })"`
Expected: prints `0 0`

- [ ] **Step 3: Commit**

```bash
git add server/schema/RoomState.js
git commit -m "Add Colyseus network schema for room state

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 12: `GameRoom` — server-side simulation loop

**Files:**
- Create: `server/rooms/GameRoom.js`
- Modify: `server/index.js` (register the room)

**Interfaces:**
- Consumes: `createSimulation` (Task 2), `newGame` (Task 3), `update` (Task 8), `RoomState`/`PlayerState`/`EnemyState`/`ProjectileState`/`DropState` (Task 11).
- Produces: a Colyseus `Room` class registered as `"game"`. `onJoin(client, options)` expects `options.cls` (one of `CLASSES`' keys) and `options.name`.

- [ ] **Step 1: Write `server/rooms/GameRoom.js`**

```javascript
import { Room } from 'colyseus';
import { createSimulation } from '../../src/core/simulation.js';
import { newGame, makePlayer } from '../../src/game/state.js';
import { update } from '../../src/game/systems.js';
import { RoomState, PlayerState, EnemyState, ProjectileState, DropState } from '../schema/RoomState.js';

const TICK_HZ = 20;
const TICK_DT = 1 / TICK_HZ;

export class GameRoom extends Room {
  onCreate() {
    this.setState(new RoomState());
    this.sim = createSimulation();
    this.sim.G = null;
    this.inputs = new Map(); // sessionId -> {x, y}
    this.simPlayers = new Map(); // sessionId -> sim player object

    this.onMessage('move', (client, msg) => {
      this.inputs.set(client.sessionId, { x: Number(msg.x) || 0, y: Number(msg.y) || 0 });
    });

    this.setSimulationInterval(() => this.tick(), 1000 / TICK_HZ);
  }

  onJoin(client, options) {
    if (!this.sim.G) {
      newGame(this.sim, { cls: options.cls || 'vanguard', party: 1, stage: 900 });
      this.sim.G.viewW = 1280; this.sim.G.viewH = 800;
      this.simPlayers.set(client.sessionId, this.sim.G.human);
    } else {
      const p = makePlayer(this.sim, options.cls || 'vanguard', true, options.name || client.sessionId);
      this.sim.G.players.push(p);
      this.sim.G.partyN = this.sim.G.players.length;
      this.sim.G.partyMul = 1 + 0.45 * (this.sim.G.partyN - 1);
      this.simPlayers.set(client.sessionId, p);
    }
    this.state.players.set(client.sessionId, new PlayerState());
    this.inputs.set(client.sessionId, { x: 0, y: 0 });
  }

  onLeave(client) {
    const p = this.simPlayers.get(client.sessionId);
    if (p) p.dead = true;
    this.simPlayers.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  tick() {
    if (!this.sim.G) return;
    const input = (p) => {
      for (const [sid, sp] of this.simPlayers) if (sp === p) return this.inputs.get(sid) || { x: 0, y: 0 };
      return { x: 0, y: 0 };
    };
    update(this.sim, TICK_DT, input);
    this.syncState();
  }

  syncState() {
    const { G, pools } = this.sim;
    this.state.time = G.time;
    this.state.kills = G.kills;
    for (const [sid, p] of this.simPlayers) {
      let ps = this.state.players.get(sid);
      ps.x = p.x; ps.y = p.y; ps.hp = p.hp; ps.maxHp = p.s.maxHp; ps.level = p.level; ps.dead = p.dead; ps.revive = p.revive; ps.name = p.name; ps.cls = p.cls;
    }
    this.state.enemies.clear();
    for (const e of pools.enemies.live) {
      if (!e.alive) continue;
      const es = new EnemyState();
      es.tid = e.tid; es.x = e.x; es.y = e.y; es.hp = e.hp; es.maxHp = e.maxHp; es.boss = e.boss; es.elite = e.elite;
      this.state.enemies.set(String(e.uid), es);
    }
  }
}
```

Note: `syncState` sends *all* enemies to *all* clients for now — Task 18 adds per-player interest filtering. Getting a correctness baseline first (everyone sees everything) makes Task 18 a pure optimization step that's easy to verify against this baseline.

- [ ] **Step 2: Register the room in `server/index.js`**

Add to `server/index.js`, after `const gameServer = new Server(...)`:

```javascript
import { GameRoom } from './rooms/GameRoom.js';
gameServer.define('game', GameRoom);
```

- [ ] **Step 3: Manual local verification**

Run: `npm run server:dev`
In another terminal: `node -e "
import('colyseus.js').then(async ({ Client }) => {
  const client = new Client('ws://localhost:2567');
  const room = await client.joinOrCreate('game', { cls: 'vanguard', name: 'tester' });
  room.onStateChange((state) => console.log('time', state.time, 'players', state.players.size, 'enemies', state.enemies.size));
  setTimeout(() => process.exit(0), 5000);
});
"` (requires `npm install --no-save colyseus.js` first if not already present — Task 14 adds it as a real dependency)
Expected: prints growing `time`/`enemies` counts over 5 seconds, `players` size 1.

- [ ] **Step 4: Commit**

```bash
git add server/rooms/GameRoom.js server/index.js
git commit -m "Add GameRoom: server-side authoritative simulation at 20Hz

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Milestone C — Client multiplayer integration

### Task 13: Install colyseus.js client dependency

**Files:**
- Modify: `package.json` (`dependencies`: `colyseus.js`)

- [ ] **Step 1: Install**

Run: `npm install colyseus.js`

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add colyseus.js client dependency

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 14: `src/net/connection.js` — client networking wrapper

**Files:**
- Create: `src/net/connection.js`

**Interfaces:**
- Produces: `connect(serverUrl, cls, name)` → `Promise<{ room, state }>` where `state` is the live Colyseus room state (a plain reactive object with `.players`, `.enemies`, `.projectiles`, `.drops`, `.time`, `.kills` matching `RoomState`'s shape); `sendMove(room, x, y)`.

- [ ] **Step 1: Write `src/net/connection.js`**

```javascript
import { Client } from 'colyseus.js';

export async function connect(serverUrl, cls, name) {
  const client = new Client(serverUrl);
  const room = await client.joinOrCreate('game', { cls, name });
  return { room, state: room.state };
}
export function sendMove(room, x, y) {
  room.send('move', { x, y });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/net/connection.js
git commit -m "Add colyseus.js client connection wrapper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 15: Multiplayer render adapter — network state as a `sim`-shaped view

**Files:**
- Create: `src/net/netSim.js`

**Interfaces:**
- Consumes: a Colyseus room `state` (Task 14).
- Produces: `netSimFromState(state, localSessionId)` → an object shaped enough like `sim` for `render/render.js` (Task 9, Step 5) to draw it unmodified: `{ G: { players: [...], human, cam, time, kills, bosses: [], demo: false, mode: 'play', ... }, pools: { enemies: {live: [...]}, projs: {live: []}, ebul: {live: []}, drops: {live: [...]}, fxs: {live: []}, texts: {live: []} } }`. Called once per client render frame (it's a cheap array-from-map conversion, not a simulation step).

- [ ] **Step 1: Write `src/net/netSim.js`**

```javascript
export function netSimFromState(state, localSessionId) {
  const players = [];
  let human = null;
  state.players.forEach((p, sid) => {
    const pl = { x: p.x, y: p.y, hp: p.hp, s: { maxHp: p.maxHp }, level: p.level, dead: p.dead, revive: p.revive, name: p.name, cls: p.cls, color: '#6ff3e8', r: 14, fx: 1, fy: 0, hurt: 0, iframe: 0, weapons: [], passives: [], xp: 0, xpNext: 1, pending: 0, auto: false };
    players.push(pl);
    if (sid === localSessionId) human = pl;
  });
  const enemies = [];
  state.enemies.forEach((e) => {
    enemies.push({ alive: true, tid: e.tid, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, boss: e.boss, elite: e.elite, r: e.boss ? 40 : 12, color: '#ff5277', fx: 0, fy: 1, flash: 0, phase: 0 });
  });
  const cam = human ? { x: human.x, y: human.y } : { x: 0, y: 0 };
  return {
    G: { players, human, cam, time: state.time, kills: state.kills, bosses: enemies.filter(e => e.boss), demo: false, mode: 'play', won: false, ending: 0, shake: 0, diff: 0, clock: state.time },
    pools: {
      enemies: { live: enemies }, projs: { live: [] }, ebul: { live: [] }, drops: { live: [] }, fxs: { live: [] }, texts: { live: [] },
    },
  };
}
```

Note: `projs`/`drops` render as empty for the first working version — `RoomState` (Task 11) doesn't carry them yet. This is a known, deliberate gap: it ships a playable "see players and enemies move and fight" multiplayer session before layering in projectile/drop visuals, keeping this task reviewable on its own. Extending `ProjectileState`/`DropState` population in `GameRoom.syncState` and reading them here is a natural fast-follow, not required for the cross-machine verification this plan ends on (Task 20 checks player sync, enemy sync, and the co-op loop — not projectile rendering fidelity).

- [ ] **Step 2: Commit**

```bash
git add src/net/netSim.js
git commit -m "Add network-state-to-renderable-sim adapter for multiplayer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 16: Multiplayer lobby entry point and game loop

**Files:**
- Modify: `src/ui/lobby.js` (add a "온라인 협동" button and room-code input alongside the existing solo flow)
- Modify: `src/main.js` (branch the `frame` loop between solo `sim` and multiplayer `netSim`)

**Interfaces:**
- Consumes: `connect`, `sendMove` (Task 14), `netSimFromState` (Task 15).
- Produces: clicking "온라인 협동" with a server URL/room code connects and switches the running `frame` loop to render from network state instead of the local `sim`.

- [ ] **Step 1: Add multiplayer UI to `index.html`**

In `index.html`, inside `.lobby`, after the existing `<button class="cta" id="startBtn">출격</button>` line, add:

```html
    <div style="margin-top:14px;display:flex;gap:8px;align-items:center">
      <input id="roomCode" placeholder="방 코드 (비우면 새 방 생성)" style="background:rgba(239,230,210,.06);border:1px solid rgba(239,230,210,.2);border-radius:4px;padding:8px 10px;color:var(--bone);font-size:13px;flex:1">
      <button class="ghost" id="coopBtn" style="margin-top:0">온라인 협동 접속</button>
    </div>
```

- [ ] **Step 2: Wire the button in `src/ui/lobby.js`**

Add to `src/ui/lobby.js`, after the existing `startRun` export:

```javascript
import { connect } from '../net/connection.js';
import { startMultiplayer } from '../main.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'ws://localhost:2567';

$('coopBtn').addEventListener('click', async () => {
  $('coopBtn').disabled = true; $('coopBtn').textContent = '접속 중...';
  try {
    const { room, state } = await connect(SERVER_URL, sel.cls, 'Player');
    $('lobby').classList.remove('on');
    startMultiplayer(room, state);
  } catch (err) {
    banner('접속 실패: ' + err.message, 'danger');
    $('coopBtn').disabled = false; $('coopBtn').textContent = '온라인 협동 접속';
  }
});
```

Note: `roomCode` input isn't read yet — `joinOrCreate` always matches any open `"game"` room or creates one. Private room codes (explicit `joinById`) are a fast-follow once basic join/create is verified working; flagged here rather than silently dropped.

- [ ] **Step 3: Add `startMultiplayer` to `src/main.js`**

Modify `src/main.js`: change `let last = performance.now();` and the `frame` function to support a mode switch, and export `startMultiplayer`:

```javascript
import { netSimFromState } from './net/netSim.js';
import { sendMove } from './net/connection.js';
import { W, H } from './core/canvas.js';

let mpRoom = null, mpState = null;

export function startMultiplayer(room, state) {
  mpRoom = room; mpState = state;
  $('pauseBtn')?.classList.remove('on');
}

function mpInputLoop() {
  if (!mpRoom) return;
  let dx = 0, dy = 0;
  if (keysRef.KeyW || keysRef.ArrowUp) dy -= 1;
  if (keysRef.KeyS || keysRef.ArrowDown) dy += 1;
  if (keysRef.KeyA || keysRef.ArrowLeft) dx -= 1;
  if (keysRef.KeyD || keysRef.ArrowRight) dx += 1;
  sendMove(mpRoom, dx, dy);
  requestAnimationFrame(mpInputLoop);
}
```

Replace the existing `frame` function body with:

```javascript
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;
  tickFps(dt);
  if (mpRoom) {
    render(netSimFromState(mpState, mpRoom.sessionId));
    return;
  }
  if (sim.G) { sim.G.viewW = W; sim.G.viewH = H; }
  if (sim.G && sim.G.mode === 'play') update(sim, dt, getInput);
  render(sim);
}
```

And start the input-sending loop once at the bottom of `main.js`, alongside the existing `requestAnimationFrame(frame);`:

```javascript
import { keys as keysRef } from './game/input.js';
requestAnimationFrame(mpInputLoop);
```

- [ ] **Step 4: Local two-tab verification**

Run: `npm run server:dev` in one terminal, `npm run dev` in another.
Open two browser tabs at the Vite dev URL. In both, click "온라인 협동 접속" (leaving `VITE_SERVER_URL` at its `ws://localhost:2567` default).
Expected: both tabs show two player dots and shared enemies moving toward them; killing an enemy in one tab reflects in the other's kill counter (`state.kills` synced via `RoomState`).

- [ ] **Step 5: Commit**

```bash
git add index.html src/ui/lobby.js src/main.js
git commit -m "Add multiplayer connect flow and network-driven render loop

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Milestone D — Interest management + deployment

### Task 17: Per-player interest-radius filtering

**Files:**
- Modify: `server/rooms/GameRoom.js` (`syncState` method)

**Interfaces:**
- Consumes: `sim.spatial.query` (Task 1), already available on `this.sim`.
- Produces: `RoomState.enemies` sent to a given client is limited to entities within that client's player's view radius — but `@colyseus/schema` broadcasts one shared `state` to every client by default, so true per-client filtering requires Colyseus's `StateView` API (available in `colyseus` ≥ 0.16, matching the version installed in Task 10). This task switches `GameRoom` to attach entities to each client's `StateView` instead of the shared root state.

- [ ] **Step 1: Rewrite `syncState` to use `StateView`**

Replace `GameRoom`'s `syncState` method:

```javascript
  syncState() {
    const { G, pools } = this.sim;
    this.state.time = G.time;
    this.state.kills = G.kills;
    for (const [sid, p] of this.simPlayers) {
      let ps = this.state.players.get(sid);
      ps.x = p.x; ps.y = p.y; ps.hp = p.hp; ps.maxHp = p.s.maxHp; ps.level = p.level; ps.dead = p.dead; ps.revive = p.revive; ps.name = p.name; ps.cls = p.cls;
    }
    this.state.enemies.clear();
    const nearbyByUid = new Map();
    for (const e of pools.enemies.live) {
      if (!e.alive) continue;
      const es = new EnemyState();
      es.tid = e.tid; es.x = e.x; es.y = e.y; es.hp = e.hp; es.maxHp = e.maxHp; es.boss = e.boss; es.elite = e.elite;
      this.state.enemies.set(String(e.uid), es);
      nearbyByUid.set(e.uid, es);
    }
    const VIEW_RADIUS = Math.hypot(this.sim.G.viewW, this.sim.G.viewH) / 2 + 80;
    for (const [sid, p] of this.simPlayers) {
      const client = this.clients.find(c => c.sessionId === sid);
      if (!client || !client.view) continue;
      const nearby = [];
      this.sim.spatial.query(p.x, p.y, VIEW_RADIUS, nearby);
      client.view.clear();
      client.view.add(this.state.players.get(sid));
      for (const e of nearby) {
        const es = nearbyByUid.get(e.uid);
        if (es) client.view.add(es);
      }
      for (const [otherSid] of this.simPlayers) client.view.add(this.state.players.get(otherSid));
    }
  }
```

- [ ] **Step 2: Enable views in `onCreate`**

Add `this.setState(new RoomState()); this.state.enemies.setSchemaCallback ? null : null;` — no, simpler: Colyseus's `StateView` is enabled per-client by setting `client.view = new StateView()` in `onJoin`. Update `onJoin` in `server/rooms/GameRoom.js`, adding after `this.state.players.set(client.sessionId, new PlayerState());`:

```javascript
    client.view = new (await import('colyseus')).StateView();
```

- [ ] **Step 3: Local verification with a synthetic far-away enemy**

Run: `npm run server:dev`, connect one client via the two-tab flow from Task 16, then in a third terminal, temporarily add a one-off log in `GameRoom.tick()` (`console.log(this.state.enemies.size)`) to confirm the *shared* `state.enemies` map still holds all enemies while each client's *view* only receives nearby ones (verified by checking `room.state.enemies.size` in the browser console via `mpState.enemies.size` stays bounded to nearby count, not the full server-side count once enemy count grows past view radius — e.g. wait until `enemies.live.length` exceeds ~50 server-side and confirm the client-visible count is lower). Remove the temporary log afterward.

- [ ] **Step 4: Commit**

```bash
git add server/rooms/GameRoom.js
git commit -m "Add per-player interest-radius filtering via Colyseus StateView

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 18: Render deployment

**Files:**
- Create: `render.yaml` (Render Blueprint, so the service config lives in the repo)

**Interfaces:**
- Produces: a Render Web Service definition deployable via `render.yaml` (Render's "Blueprint" flow — connect the GitHub repo, Render reads this file automatically).

- [ ] **Step 1: Write `render.yaml`**

```yaml
services:
  - type: web
    name: project-arc-server
    runtime: node
    plan: free
    buildCommand: npm install
    startCommand: npm run server:dev
    envVars:
      - key: NODE_VERSION
        value: 20
```

- [ ] **Step 2: Commit**

```bash
git add render.yaml
git commit -m "Add Render deployment blueprint for the multiplayer server

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Deploy (manual, requires the user's Render account)**

This step needs the user: connect the `anaf-4/Project-ARC` GitHub repo in the Render dashboard, choose "New Blueprint", point it at `render.yaml`. Once live, Render provides a public URL like `https://project-arc-server.onrender.com` — its WebSocket URL is the same host with `wss://`. Record this URL; Task 19 uses it.

### Task 19: Point the client at the deployed server

**Files:**
- Create: `.env.production` (or document the env var — see note)

**Interfaces:**
- Produces: `npm run build` picks up `VITE_SERVER_URL` from `.env.production` per Vite's built-in env file convention, so `src/ui/lobby.js`'s `SERVER_URL` (Task 16, Step 2) resolves to the deployed `wss://` URL in production builds while local dev keeps defaulting to `ws://localhost:2567`.

- [ ] **Step 1: Write `.env.production`**

```
VITE_SERVER_URL=wss://project-arc-server.onrender.com
```

(Replace the host with whatever URL Render actually assigned in Task 18, Step 3.)

- [ ] **Step 2: Rebuild and verify the URL is baked in**

Run: `npm run build`, then `grep -o "wss://[a-zA-Z0-9.-]*" dist/assets/*.js`
Expected: prints the Render URL, confirming it's compiled into the production bundle.

- [ ] **Step 3: Commit**

```bash
git add .env.production
git commit -m "Point production build at the deployed Render multiplayer server

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

### Task 20: Cross-machine verification

No files change in this task — it's the plan's acceptance test.

- [ ] **Step 1: Two different physical machines**

On machine A: open the Electron build (or `npm run preview` after `npm run build`) and click 온라인 협동 접속.
On machine B (a different PC, different network if possible — confirms "over the internet," not just LAN): do the same.
Expected: both machines see each other's player dot moving, see the same enemies spawn and take damage from either player's attacks, kill counter stays in sync, and a boss spawns and can be fought by both.

- [ ] **Step 2: Note the Render free-tier cold start**

If the server has been idle, the first connection attempt may take 10-50 seconds while Render spins the instance back up (spec: Deployment). Confirm the client's "접속 중..." state (Task 16, Step 2) stays visible and doesn't error out during this delay — if it does, increase the `connect()` call's timeout/retry in `src/net/connection.js`.

---

## Self-Review Notes

**Spec coverage:** Goals (server-authoritative co-op, solo unaffected, shared sim code, Render hosting) → Tasks 1-20 throughout. Non-goals (anti-cheat, reconnect, matchmaking, host migration) → explicitly not built; Task 16 Step 2 flags room-code matchmaking as a fast-follow rather than silently omitting it. Key refactor (per-room state, DOM decoupling) → Tasks 1-9. Networking (schema, interest management, tick rate, pause behavior) → Tasks 11, 17, 12/16 Step 3's pause-is-local-only note (the multiplayer flow in Task 16 has no pause wiring at all yet — flagging this as a real gap: `pauseBtn` still exists in the DOM but Task 16 never wires it for the multiplayer path; a fast-follow task should add a local-only build/recipe view toggle that does not touch `mpRoom`). Deployment → Tasks 18-19. Testing plan → Task 9 Step 6 (solo regression), Task 16 Step 4 (local multiplayer), Task 20 (cross-machine).

**Gap found and accepted as a fast-follow, not silently dropped:** pause UI in multiplayer mode (noted above) and projectile/drop rendering in multiplayer (Task 15's note). Both are explicitly called out rather than left as an implicit TODO, and neither blocks the plan's core acceptance test in Task 20.

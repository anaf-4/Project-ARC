// Server-side authoritative simulation room (Task 12; downgraded to
// colyseus@0.16.5 in the fix-up task to match colyseus.js@0.16.22's wire
// protocol). Extended with a waiting-room/host-controlled lobby phase.
//
// Colyseus 0.16.5 API note (checked against
// node_modules/@colyseus/core/build/Room.d.ts, @colyseus/core@0.16.26):
// `setTimestep` does not exist in this version at all — only
// `setSimulationInterval` is available for the simulation loop (and it is
// NOT deprecated here). `Room#setState` IS marked @deprecated in favor of
// the `.state =` setter, same as in 0.18.5. This file therefore uses
// `setSimulationInterval` + `this.state =`; everything else
// (onCreate/onJoin/onLeave/onMessage, this.clients, client.sessionId) matches
// the brief as-is. `client.leave(code, data)` is confirmed in Transport.d.ts.
import { Room } from 'colyseus';
// Task 17: `StateView` is NOT re-exported by `colyseus`/`@colyseus/core`
// (checked node_modules/@colyseus/core/build/index.d.ts — no StateView
// export; only `Transport.d.ts` references its *type*). It lives in
// `@colyseus/schema` (node_modules/@colyseus/schema/lib/encoder/StateView.d.ts),
// already a direct dependency (see RoomState.js), so it's imported from there
// directly instead of the brief's `(await import('colyseus')).StateView`,
// which would have been `undefined`.
import { StateView } from '@colyseus/schema';
import { createSimulation } from '../../src/core/simulation.js';
import { newGame, makePlayer } from '../../src/game/state.js';
import { update } from '../../src/game/systems.js';
import { getOptions, applyOption } from '../../src/game/growth.js';
import { requestDash } from '../../src/game/systems.js';
import { RoomState, PlayerState, EnemyState, WeaponState, PassiveState, ProjectileState, DropState, EbulState } from '../schema/RoomState.js';

const TICK_HZ = 20;
const TICK_DT = 1 / TICK_HZ;
const MAX_PLAYERS_CAP = 4;

export class GameRoom extends Room {
  onCreate() {
    this.state = new RoomState();
    this.sim = createSimulation();
    // Rebroadcast one-shot visual effects (weapon swings, hit sparks, boss
    // dash trails, ...) as fire-and-forget messages instead of syncing the
    // fx pool as persistent network state — these are purely cosmetic and
    // usually live <0.5s, so there's nothing worth diffing. `o.owner` (a
    // full sim player object) isn't serializable/needed on the client, so
    // it's collapsed to a plain (ox, oy) position snapshot at broadcast time.
    this.sim.onFx = (kind, x, y, o) => {
      this.broadcast('fx', {
        kind, x, y,
        life: o.life ?? null, r: o.r ?? null, a: o.a ?? null, half: o.half ?? null, w: o.w ?? null,
        color: o.color ?? null, pts: o.pts ?? null,
        ox: o.owner ? o.owner.x : null, oy: o.owner ? o.owner.y : null,
      });
    };
    // Hit sounds: don't broadcast one message per damage() call — an AOE
    // weapon can hit a dozen enemies in a single tick, and that's still just
    // one moment of "combat happened" worth of audio feedback. Coalesce into
    // at most one 'hit' and one 'hurt' message per tick instead (see tick()).
    this.hitFlags = { hit: false, hurt: false };
    this.sim.onHit = (kind) => { this.hitFlags[kind] = true; };
    // Chest opens are naturally rare (at most a few per boss/elite kill) —
    // no coalescing needed, broadcast straight away like onFx.
    this.sim.onReward = () => { this.broadcast('reward', {}); };
    this.inputs = new Map(); // sessionId -> {x, y}
    this.simPlayers = new Map(); // sessionId -> sim player object, populated once the game starts
    this.pending = new Map(); // sessionId -> {cls, name}, used to build the game at startGame time
    this.enemyStates = new Map(); // sim enemy uid (string) -> EnemyState, reused across ticks
    this.projStates = new Map(); // same reuse-by-uid pattern for projectiles
    this.dropStates = new Map(); // ...and drops (xp orbs, potions, chests, magnets)
    this.ebulStates = new Map(); // ...and enemy bullets (boss/ranged-enemy attacks)
    this.levelUpOffers = new Map(); // sessionId -> the 3 options currently offered, awaiting a choice
    this.maxClients = MAX_PLAYERS_CAP;

    // Fires once when the run ends (party wipe or stage clear — see
    // game/systems.js's G.ending countdown). Flips phase away from 'playing'
    // so tick() stops calling update() — without this, systems.js has no
    // equivalent of solo's G.mode gate, and the "all players dead" branch
    // would keep re-triggering G.ending and re-firing this every tick
    // forever. Clients watch for this phase change to show the result screen.
    this.sim.onGameOver = () => { this.state.phase = 'ended'; };

    // Solo pauses the whole sim while its one human chooses (game/systems.js's
    // G.mode gate). A shared co-op tick can't pause for one player, so each
    // player who levels up gets their own offer sent only to them; update()
    // keeps running for everyone else in the meantime (see systems.js's
    // awaitingLevelUp guard).
    this.sim.onLevelUp = (p) => {
      const sid = [...this.simPlayers].find(([, sp]) => sp === p)?.[0];
      const client = sid && this.clients.find(c => c.sessionId === sid);
      if (!client) return;
      const options = getOptions(p, 3);
      this.levelUpOffers.set(sid, options);
      client.send('levelup', { options });
    };

    this.onMessage('move', (client, msg) => {
      this.inputs.set(client.sessionId, { x: Number(msg.x) || 0, y: Number(msg.y) || 0 });
    });

    this.onMessage('dash', (client) => {
      const p = this.simPlayers.get(client.sessionId);
      if (p) requestDash(this.sim, p);
    });

    this.onMessage('chooseLevelUp', (client, msg) => {
      const p = this.simPlayers.get(client.sessionId);
      const offers = this.levelUpOffers.get(client.sessionId);
      if (!p || !offers) return;
      const idx = Number(msg.index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= offers.length) return;
      applyOption(this.sim, p, offers[idx]);
      p.pending--;
      p.awaitingLevelUp = false;
      this.levelUpOffers.delete(client.sessionId);
    });

    this.onMessage('setMaxPlayers', (client, msg) => {
      if (client.sessionId !== this.state.hostSessionId || this.state.phase !== 'waiting') return;
      const n = Math.max(1, Math.min(MAX_PLAYERS_CAP, Math.floor(Number(msg.max)) || MAX_PLAYERS_CAP));
      if (n < this.clients.length) return; // can't shrink below currently-connected players
      this.maxClients = n;
      this.state.maxPlayers = n;
    });

    this.onMessage('kick', (client, msg) => {
      if (client.sessionId !== this.state.hostSessionId || this.state.phase !== 'waiting') return;
      if (msg.sessionId === client.sessionId) return; // host can't kick self — use leave
      const target = this.clients.find(c => c.sessionId === msg.sessionId);
      target?.leave(4000, 'kicked');
    });

    this.onMessage('startGame', (client) => {
      if (client.sessionId !== this.state.hostSessionId || this.state.phase !== 'waiting') return;
      if (this.clients.length < 1) return;
      this.beginGame();
    });

    this.setSimulationInterval(() => this.tick(), 1000 / TICK_HZ);
  }

  onJoin(client, options) {
    if (this.state.phase !== 'waiting') {
      throw new Error('game already in progress');
    }
    const cls = options.cls || 'vanguard';
    const name = options.name || 'Player';
    this.pending.set(client.sessionId, { cls, name });
    const ps = new PlayerState();
    ps.name = name; ps.cls = cls;
    this.state.players.set(client.sessionId, ps);
    this.inputs.set(client.sessionId, { x: 0, y: 0 });
    if (!this.state.hostSessionId) this.state.hostSessionId = client.sessionId;
    // `StateView` must be constructed with `iterable: true` — its `clear()`
    // throws "StateView#clear() is only available for iterable StateView's"
    // otherwise (node_modules/@colyseus/schema/lib/encoder/StateView.js:246-249),
    // and syncState() below calls `.clear()` every tick.
    client.view = new StateView(true);
  }

  onLeave(client) {
    const p = this.simPlayers.get(client.sessionId);
    if (p) p.dead = true;
    this.simPlayers.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.pending.delete(client.sessionId);
    this.levelUpOffers.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    if (this.state.hostSessionId === client.sessionId) {
      const next = this.clients.find(c => c.sessionId !== client.sessionId);
      this.state.hostSessionId = next ? next.sessionId : '';
    }
  }

  beginGame() {
    const order = this.clients.map(c => c.sessionId).filter(sid => this.pending.has(sid));
    const first = order[0];
    const firstInfo = this.pending.get(first);
    newGame(this.sim, { cls: firstInfo.cls, party: 1, stage: 900 });
    this.sim.G.viewW = 1280; this.sim.G.viewH = 800;
    this.sim.G.human.name = firstInfo.name;
    this.simPlayers.set(first, this.sim.G.human);
    for (let i = 1; i < order.length; i++) {
      const sid = order[i], info = this.pending.get(sid);
      const p = makePlayer(this.sim, info.cls, true, info.name);
      this.sim.G.players.push(p);
      this.simPlayers.set(sid, p);
    }
    this.sim.G.partyN = this.sim.G.players.length;
    this.sim.G.partyMul = 1 + 0.45 * (this.sim.G.partyN - 1);
    this.state.phase = 'playing';
  }

  tick() {
    if (!this.sim.G || this.state.phase !== 'playing') return;
    const input = (p) => {
      for (const [sid, sp] of this.simPlayers) if (sp === p) return this.inputs.get(sid) || { x: 0, y: 0 };
      return { x: 0, y: 0 };
    };
    update(this.sim, TICK_DT, input);
    if (this.hitFlags.hit) this.broadcast('hit', { kind: 'hit' });
    if (this.hitFlags.hurt) this.broadcast('hit', { kind: 'hurt' });
    this.hitFlags.hit = false; this.hitFlags.hurt = false;
    this.syncState();
  }

  syncState() {
    const { G, pools } = this.sim;
    this.state.time = G.time;
    this.state.kills = G.kills;
    this.state.won = G.won;
    this.state.bonusShards = G.bonusShards;
    for (const [sid, p] of this.simPlayers) {
      const ps = this.state.players.get(sid);
      if (!ps) continue;
      ps.x = p.x; ps.y = p.y; ps.hp = p.hp; ps.maxHp = p.s.maxHp; ps.level = p.level; ps.dead = p.dead; ps.revive = p.revive; ps.name = p.name; ps.cls = p.cls;
      ps.xp = p.xp; ps.xpNext = p.xpNext; ps.pending = p.pending; ps.kills = p.kills;
      // Small, bounded (≤4 each) and only actually changes on level-up, so a
      // full clear+rebuild every tick isn't the anti-pattern it was for
      // enemies (hundreds of entities, every tick, regardless of change).
      ps.weapons.clear();
      for (const w of p.weapons) {
        const ws = new WeaponState(); ws.id = w.id; ws.lv = w.lv; ws.evo = w.evo; ws.altIdx = w.altIdx;
        ps.weapons.push(ws);
      }
      ps.passives.clear();
      for (const q of p.passives) {
        const qs = new PassiveState(); qs.id = q.id; qs.lv = q.lv;
        ps.passives.push(qs);
      }
    }
    // Reuse EnemyState instances by uid across ticks instead of clearing and
    // recreating every entity every tick — that anti-pattern defeats
    // Colyseus's schema diffing (every enemy looks "changed" every tick even
    // when only a few actually moved), forcing a full re-encode of the whole
    // enemy set 20 times/sec, which gets worse the more enemies are alive
    // (this was the actual cause of reported lag + seemingly-no combat: with
    // nothing ever appearing to die client-side while bandwidth cost grew,
    // it read as "not attacking", when the sim was killing enemies fine).
    // Mutate existing instances in place; only add/remove entries when an
    // enemy actually spawns or dies.
    const seen = new Set();
    for (const e of pools.enemies.live) {
      if (!e.alive) continue;
      const uid = String(e.uid);
      seen.add(uid);
      let es = this.enemyStates.get(uid);
      if (!es) {
        es = new EnemyState();
        this.enemyStates.set(uid, es);
        this.state.enemies.set(uid, es);
      }
      es.tid = e.tid; es.x = e.x; es.y = e.y; es.hp = e.hp; es.maxHp = e.maxHp; es.boss = e.boss; es.elite = e.elite; es.rush = !!e.rushPhase;
    }
    for (const uid of this.enemyStates.keys()) {
      if (!seen.has(uid)) {
        this.enemyStates.delete(uid);
        this.state.enemies.delete(uid);
      }
    }

    // Projectiles, drops and enemy bullets were, until now, never synced at
    // all — RoomState declared the schema fields (Task 11) but nothing ever
    // wrote to them, so no weapon attack or xp orb ever appeared client-side
    // in multiplayer even though the server was resolving them correctly.
    // Same reuse-by-uid pattern as enemies above, for the same reason
    // (avoids the clear+recreate diffing anti-pattern from item 3).
    syncPool(pools.projs.live, this.state.projectiles, this.projStates, ProjectileState, (ps, e) => {
      ps.kind = e.kind; ps.x = e.x; ps.y = e.y; ps.vx = e.vx; ps.vy = e.vy; ps.r = e.r; ps.color = e.color; ps.t = e.t; ps.life = e.life;
    });
    syncPool(pools.drops.live, this.state.drops, this.dropStates, DropState, (ds, g) => {
      ds.kind = g.kind; ds.x = g.x; ds.y = g.y; ds.v = g.v; ds.t = g.t; ds.tier = g.tier || 1;
    });
    syncPool(pools.ebul.live, this.state.ebul, this.ebulStates, EbulState, (es, b) => {
      es.x = b.x; es.y = b.y; es.r = b.r;
    });

    // Task 17: `enemies` is a `@view()`-tagged field (see RoomState.js), so
    // it is no longer broadcast to every client by default — each client
    // only sees the EnemyStates explicitly added to its own `client.view`.
    // `players` is untagged and stays in the unfiltered shared changeset, so
    // every player keeps seeing every other player without any view calls.
    const VIEW_RADIUS = Math.hypot(G.viewW, G.viewH) / 2 + 80;
    const nearby = [];
    for (const [sid, p] of this.simPlayers) {
      const client = this.clients.find(c => c.sessionId === sid);
      if (!client || !client.view) continue;
      this.sim.spatial.query(p.x, p.y, VIEW_RADIUS, nearby);
      client.view.clear();
      for (const e of nearby) {
        const es = this.enemyStates.get(String(e.uid));
        if (es) client.view.add(es);
      }
    }
  }
}

// Generic version of the enemy-sync loop above: mutate existing schema
// instances in place, keyed by the sim's own uid, instead of clearing and
// recreating every live entity every tick.
function syncPool(live, stateMap, instanceMap, StateClass, assign) {
  const seen = new Set();
  for (const o of live) {
    if (!o.alive) continue;
    const uid = String(o.uid);
    seen.add(uid);
    let s = instanceMap.get(uid);
    if (!s) { s = new StateClass(); instanceMap.set(uid, s); stateMap.set(uid, s); }
    assign(s, o);
  }
  for (const uid of instanceMap.keys()) {
    if (!seen.has(uid)) { instanceMap.delete(uid); stateMap.delete(uid); }
  }
}

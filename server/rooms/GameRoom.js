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
import { RoomState, PlayerState, EnemyState } from '../schema/RoomState.js';

const TICK_HZ = 20;
const TICK_DT = 1 / TICK_HZ;
const MAX_PLAYERS_CAP = 4;

export class GameRoom extends Room {
  onCreate() {
    this.state = new RoomState();
    this.sim = createSimulation();
    this.inputs = new Map(); // sessionId -> {x, y}
    this.simPlayers = new Map(); // sessionId -> sim player object, populated once the game starts
    this.pending = new Map(); // sessionId -> {cls, name}, used to build the game at startGame time
    this.enemyStates = new Map(); // sim enemy uid (string) -> EnemyState, reused across ticks
    this.maxClients = MAX_PLAYERS_CAP;

    this.onMessage('move', (client, msg) => {
      this.inputs.set(client.sessionId, { x: Number(msg.x) || 0, y: Number(msg.y) || 0 });
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
    this.syncState();
  }

  syncState() {
    const { G, pools } = this.sim;
    this.state.time = G.time;
    this.state.kills = G.kills;
    for (const [sid, p] of this.simPlayers) {
      const ps = this.state.players.get(sid);
      if (!ps) continue;
      ps.x = p.x; ps.y = p.y; ps.hp = p.hp; ps.maxHp = p.s.maxHp; ps.level = p.level; ps.dead = p.dead; ps.revive = p.revive; ps.name = p.name; ps.cls = p.cls;
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
      es.tid = e.tid; es.x = e.x; es.y = e.y; es.hp = e.hp; es.maxHp = e.maxHp; es.boss = e.boss; es.elite = e.elite;
    }
    for (const uid of this.enemyStates.keys()) {
      if (!seen.has(uid)) {
        this.enemyStates.delete(uid);
        this.state.enemies.delete(uid);
      }
    }

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

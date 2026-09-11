// Server-side authoritative simulation room (Task 12; downgraded to
// colyseus@0.16.5 in the fix-up task to match colyseus.js@0.16.22's wire
// protocol).
//
// Colyseus 0.16.5 API note (checked against
// node_modules/@colyseus/core/build/Room.d.ts, @colyseus/core@0.16.26):
// `setTimestep` does not exist in this version at all — only
// `setSimulationInterval` is available for the simulation loop (and it is
// NOT deprecated here). `Room#setState` IS marked @deprecated in favor of
// the `.state =` setter, same as in 0.18.5. This file therefore uses
// `setSimulationInterval` + `this.state =`; everything else
// (onCreate/onJoin/onLeave/onMessage, this.clients, client.sessionId) matches
// the brief as-is.
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

export class GameRoom extends Room {
  onCreate() {
    this.state = new RoomState();
    this.sim = createSimulation();
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
      const ps = this.state.players.get(sid);
      if (!ps) continue;
      ps.x = p.x; ps.y = p.y; ps.hp = p.hp; ps.maxHp = p.s.maxHp; ps.level = p.level; ps.dead = p.dead; ps.revive = p.revive; ps.name = p.name; ps.cls = p.cls;
    }
    this.state.enemies.clear();
    const byUid = new Map();
    for (const e of pools.enemies.live) {
      if (!e.alive) continue;
      const es = new EnemyState();
      es.tid = e.tid; es.x = e.x; es.y = e.y; es.hp = e.hp; es.maxHp = e.maxHp; es.boss = e.boss; es.elite = e.elite;
      this.state.enemies.set(String(e.uid), es);
      byUid.set(e.uid, es);
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
        const es = byUid.get(e.uid);
        if (es) client.view.add(es);
      }
    }
  }
}

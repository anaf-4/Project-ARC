// Server-side authoritative simulation room (Task 12).
//
// Colyseus 0.18.5 API note: `Room#setSimulationInterval` and `Room#setState`
// are marked @deprecated in node_modules/@colyseus/core/build/Room.d.ts —
// renamed to `setTimestep` and the `.state =` setter respectively (same
// signatures). This file uses the non-deprecated names; everything else
// (onCreate/onJoin/onLeave/onMessage, this.clients, client.sessionId) matches
// the brief as-is.
import { Room } from 'colyseus';
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

    this.setTimestep(() => this.tick(), 1000 / TICK_HZ);
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
      const ps = this.state.players.get(sid);
      if (!ps) continue;
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

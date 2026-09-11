// Converts a Colyseus RoomState (server/schema/RoomState.js) into an object
// shaped enough like the local-sim `sim` that render/render.js's exported
// render(sim) draws it unmodified — same renderer for single-player and
// multiplayer. Called once per client render frame; cheap map->array copy,
// not a simulation step.
//
// RoomState today carries players + enemies only (no weapons/passives/
// projectiles/drops state yet — Task 11's schema doesn't track them), so
// those render as empty. That's a deliberate, documented gap (see task-15
// brief), not something this adapter should paper over.
import { CLASSES } from '../data/tables.js';

// ponytail: RoomState doesn't sync a stage length yet; 900s matches the
// client's default "standard" stage (src/ui/lobby.js). Upgrade path: have
// GameRoom put stageLen on RoomState once stage selection is networked.
const STAGE_LEN = 900;

export function netSimFromState(state, localSessionId) {
  // state.players/state.enemies can briefly be undefined right after the
  // room's state object is (re)assigned — e.g. the waiting->playing
  // transition — before Colyseus finishes decoding the new schema onto it.
  // Callers must treat a null return as "nothing to render this frame" and
  // skip, not retry synchronously.
  if (!state || !state.players || !state.enemies) return null;
  const players = [];
  let human = null;
  state.players.forEach((p, sid) => {
    const cls = CLASSES[p.cls] ? p.cls : 'vanguard'; // guard render.js's CLASSES[p.cls] lookups
    const pl = {
      x: p.x, y: p.y, hp: p.hp, s: { maxHp: p.maxHp }, level: p.level, dead: p.dead, revive: p.revive,
      name: p.name, cls, color: '#6ff3e8', r: 14, fx: 1, fy: 0, hurt: 0, iframe: 0,
      weapons: [], passives: [], xp: 0, xpNext: 1, pending: 0, auto: false,
    };
    players.push(pl);
    if (sid === localSessionId) human = pl;
  });
  const enemies = [];
  state.enemies.forEach((e) => {
    enemies.push({
      alive: true, tid: e.tid, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, boss: e.boss, elite: e.elite,
      r: e.boss ? 40 : 12, color: '#ff5277', fx: 0, fy: 1, flash: 0, phase: 0,
      name: e.boss ? '보스' : undefined, teleT: 0, tdx: 0, tdy: 0, spin: 0, speed: 0,
    });
  });
  const cam = human ? { x: human.x, y: human.y } : { x: 0, y: 0 };
  // WARN: G.human can be null until localSessionId appears in state.players; render.js:drawHUD dereferences G.human unconditionally — callers must skip render() while null
  return {
    G: {
      players, human, cam, time: state.time, kills: state.kills, bosses: enemies.filter(e => e.boss),
      demo: false, mode: 'play', won: false, ending: 0, shake: 0, diff: 0, clock: state.time, stageLen: STAGE_LEN,
    },
    pools: {
      enemies: { live: enemies }, projs: { live: [] }, ebul: { live: [] }, drops: { live: [] }, fxs: { live: [] }, texts: { live: [] },
    },
  };
}

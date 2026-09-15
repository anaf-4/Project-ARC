// Converts a Colyseus RoomState (server/schema/RoomState.js) into an object
// shaped enough like the local-sim `sim` that render/render.js's exported
// render(sim) draws it unmodified — same renderer for single-player and
// multiplayer. Called once per client render frame; cheap map->array copy,
// not a simulation step.
import { CLASSES } from '../data/tables.js';

// ponytail: RoomState doesn't sync a stage length yet; 900s matches the
// client's default "standard" stage (src/ui/lobby.js). Upgrade path: have
// GameRoom put stageLen on RoomState once stage selection is networked.
const STAGE_LEN = 900;

// ---- Position smoothing --------------------------------------------------
// The server only reports a new position 20 times/sec. Rendering that raw
// value every client frame (~60/sec) makes everything visibly teleport in
// small steps every ~50ms. Two different techniques are used depending on
// whose entity it is:
//
// - The LOCAL player's own avatar uses fast exponential smoothing (near-zero
//   added latency) — any fixed render delay here would make your own
//   movement feel laggy, since there's no client-side prediction to hide it
//   behind.
// - Everything else (other players, enemies, projectiles, drops, enemy
//   bullets) uses buffered snapshot interpolation: render ~2 ticks in the
//   past, interpolated between the two real snapshots that bracket that
//   render time. This is the standard fix for the specific symptom "smooth
//   exponential-toward-latest still looks choppy" — that happens when
//   patches don't arrive on a perfectly even 50ms cadence (real network
//   jitter, GC pauses, etc.); chasing a single constantly-moving target with
//   exponential decay reproduces the jitter in the rendered motion, while
//   interpolating between two already-arrived, timestamped samples doesn't
//   care how unevenly they arrived.
const SMOOTH_TAU = 0.05;
const INTERP_DELAY = 0.1; // ~2 server ticks behind "now"
const BUFFER_MAX_AGE = 0.5;

const smoothed = new Map(); // id -> {x, y}, local player only
const buffers = new Map(); // id -> [{t, x, y}, ...] ascending by t, everyone else
const seenThisFrame = new Set();
let clock = 0; // local monotonic seconds, advanced by each call's dt

function smoothPos(id, targetX, targetY, dt) {
  seenThisFrame.add(id);
  let s = smoothed.get(id);
  if (!s) { s = { x: targetX, y: targetY }; smoothed.set(id, s); return s; }
  if (dt > 0) {
    const k = 1 - Math.exp(-dt / SMOOTH_TAU);
    s.x += (targetX - s.x) * k;
    s.y += (targetY - s.y) * k;
  } else {
    s.x = targetX; s.y = targetY;
  }
  return s;
}

function bufferedPos(id, targetX, targetY) {
  seenThisFrame.add(id);
  let buf = buffers.get(id);
  if (!buf) { buf = [{ t: clock, x: targetX, y: targetY }]; buffers.set(id, buf); return { x: targetX, y: targetY }; }
  const last = buf[buf.length - 1];
  if (last.x !== targetX || last.y !== targetY) buf.push({ t: clock, x: targetX, y: targetY });
  while (buf.length > 2 && buf[1].t < clock - BUFFER_MAX_AGE) buf.shift();
  const renderT = clock - INTERP_DELAY;
  if (renderT <= buf[0].t) return { x: buf[0].x, y: buf[0].y };
  for (let i = 1; i < buf.length; i++) {
    if (renderT <= buf[i].t) {
      const a = buf[i - 1], b = buf[i], k = (renderT - a.t) / (b.t - a.t || 1);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  const lastB = buf[buf.length - 1];
  return { x: lastB.x, y: lastB.y };
}

// ---- Spectating -----------------------------------------------------------
// While the local player is dead and teammates are still alive, follow one
// of them with the camera instead of staring at your own soul's fixed spot.
// cycleSpectate() (called from game/input.js on Tab) just records which
// direction to step; netSimFromState resolves it against the current alive
// list, since that's the only place that list exists.
let spectateSid = null;
let spectateStep = 0;
export function cycleSpectate(dir = 1) { spectateStep = dir; }

export function netSimFromState(state, localSessionId, dt = 0) {
  // state.players/state.enemies can briefly be undefined right after the
  // room's state object is (re)assigned — e.g. the waiting->playing
  // transition — before Colyseus finishes decoding the new schema onto it.
  // Callers must treat a null return as "nothing to render this frame" and
  // skip, not retry synchronously.
  if (!state || !state.players || !state.enemies) return null;
  clock += dt || 0;
  seenThisFrame.clear();
  const players = [];
  let human = null;
  state.players.forEach((p, sid) => {
    const cls = CLASSES[p.cls] ? p.cls : 'vanguard'; // guard render.js's CLASSES[p.cls] lookups
    const isLocal = sid === localSessionId;
    const pos = isLocal ? smoothPos('p:' + sid, p.x, p.y, dt) : bufferedPos('p:' + sid, p.x, p.y);
    const pl = {
      sid, x: pos.x, y: pos.y, hp: p.hp, s: { maxHp: p.maxHp }, level: p.level, dead: p.dead, revive: p.revive,
      name: p.name, cls, color: '#6ff3e8', r: 14, fx: 1, fy: 0, hurt: 0, iframe: 0,
      weapons: p.weapons.map(w => ({ id: w.id, lv: w.lv, evo: w.evo, altIdx: w.altIdx, ang: 0 })),
      passives: p.passives.map(q => ({ id: q.id, lv: q.lv })),
      xp: p.xp, xpNext: p.xpNext || 1, pending: p.pending, auto: false,
    };
    players.push(pl);
    if (isLocal) human = pl;
  });
  const enemies = [];
  state.enemies.forEach((e, uid) => {
    const pos = bufferedPos('e:' + uid, e.x, e.y);
    enemies.push({
      alive: true, tid: e.tid, x: pos.x, y: pos.y, hp: e.hp, maxHp: e.maxHp, boss: e.boss, elite: e.elite,
      r: e.boss ? 40 : 12, color: '#ff5277', fx: 0, fy: 1, flash: 0, phase: 0, rushPhase: e.rush,
      name: e.boss ? '보스' : undefined, teleT: 0, tdx: 0, tdy: 0, spin: 0, speed: 0,
    });
  });
  const projs = [];
  if (state.projectiles) state.projectiles.forEach((pr, uid) => {
    const pos = bufferedPos('pr:' + uid, pr.x, pr.y);
    projs.push({ alive: true, kind: pr.kind, x: pos.x, y: pos.y, vx: pr.vx, vy: pr.vy, r: pr.r, color: pr.color, t: pr.t, life: pr.life });
  });
  const drops = [];
  if (state.drops) state.drops.forEach((g, uid) => {
    const pos = bufferedPos('g:' + uid, g.x, g.y);
    drops.push({ alive: true, kind: g.kind, x: pos.x, y: pos.y, v: g.v, t: g.t, tier: g.tier });
  });
  const ebul = [];
  if (state.ebul) state.ebul.forEach((b, uid) => {
    const pos = bufferedPos('eb:' + uid, b.x, b.y);
    ebul.push({ alive: true, x: pos.x, y: pos.y, r: b.r });
  });
  // Drop smoothing/interpolation state for anything that despawned/
  // disconnected — otherwise these maps grow forever over a long run.
  for (const id of smoothed.keys()) if (!seenThisFrame.has(id)) smoothed.delete(id);
  for (const id of buffers.keys()) if (!seenThisFrame.has(id)) buffers.delete(id);

  let cam = { x: 0, y: 0 };
  if (human) {
    const others = players.filter(pl => pl.sid !== localSessionId && !pl.dead);
    if (human.dead && others.length) {
      if (spectateStep) {
        let idx = others.findIndex(pl => pl.sid === spectateSid);
        idx = ((idx < 0 ? 0 : idx) + spectateStep + others.length) % others.length;
        spectateSid = others[idx].sid;
        spectateStep = 0;
      }
      const target = others.find(pl => pl.sid === spectateSid) || others[0];
      spectateSid = target.sid;
      cam = { x: target.x, y: target.y };
      human.spectating = target.name;
    } else {
      spectateSid = null; spectateStep = 0;
      cam = { x: human.x, y: human.y };
    }
  }
  // WARN: G.human can be null until localSessionId appears in state.players; render.js:drawHUD dereferences G.human unconditionally — callers must skip render() while null
  return {
    G: {
      players, human, cam, time: state.time, kills: state.kills, bosses: enemies.filter(e => e.boss),
      demo: false, mode: 'play', won: !!state.won, ending: 0, shake: 0, diff: 0, clock: state.time, stageLen: STAGE_LEN,
    },
    pools: {
      enemies: { live: enemies }, projs: { live: projs }, ebul: { live: ebul }, drops: { live: drops }, fxs: { live: [] }, texts: { live: [] },
    },
  };
}

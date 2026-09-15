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
    viewW: 1280, viewH: 800,
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
    pending: 0, kills: 0, auraRegen: 0, auraMag: 1, auto: !human, wig: Math.random() * TAU,
    dashCd: 0, dashT: 0, dashDx: 0, dashDy: 0,
  };
  p.weapons.push(newWeapon(C.weapon));
  recompute(sim, p); p.hp = p.s.maxHp;
  return p;
}
export function newWeapon(id) { return { id, lv: 1, evo: false, altIdx: -1, t: 0.4, on: 0, off: 0, ang: 0, hits: new Map() }; }

export function recompute(sim, p) {
  const C = CLASSES[p.cls];
  const s = {
    maxHp: C.hp, armor: C.armor || 0, speed: C.speed, dmgMul: 1, cdMul: C.cdMul || 1, areaMul: C.areaMul || 1, amount: 0, projSpeed: 1,
    crit: 0.05 + (C.crit || 0), critGrowth: C.critGrowth || 1, regen: C.regen || 0, magnet: 85 * (C.magnetMul || 1), xpMul: 1, reviveMul: 1, explosiveMul: C.explosiveMul || 1, meleeRangeMul: 1,
    critMul: 2, lifesteal: 0,
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

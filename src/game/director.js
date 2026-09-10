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

import { rand, pick, REDUCED } from '../core/utils.js';
import { projs, ebul, drops, fxs, texts } from '../core/pool.js';
import { G } from './state.js';
import { banner } from '../ui/banner.js';

export function damage(e, amt, p, kx, ky, noCrit) {
  if (!e.alive) return;
  let crit = false;
  if (p && !noCrit && Math.random() < p.s.crit) { amt *= 2; crit = true; }
  e.hp -= amt; e.flash = 0.08;
  const kb = e.boss ? 0.05 : e.elite ? 0.3 : 1;
  e.kx += (kx || 0) * kb; e.ky += (ky || 0) * kb;
  if (texts.live.length < 150) addText(e.x + rand(-6, 6), e.y - e.r, amt, crit);
  if (e.hp <= 0) kill(e, p);
}
export function kill(e, p) {
  e.alive = false; G.kills++; if (p) p.kills++;
  dropXp(e.x, e.y, e.xp * (1 + G.diff * 0.07));
  if (e.boss || e.elite) dropItem('chest', e.x, e.y);
  else { const r = Math.random(); if (r < 0.006) dropItem('potion', e.x, e.y); else if (r < 0.0085) dropItem('magnet', e.x, e.y); }
  if (fxs.live.length < 380) addFx('pop', e.x, e.y, { r: e.r, color: e.color, life: 0.35 });
  if (e.boss) {
    if (!REDUCED) G.shake = 12;
    addFx('ring', e.x, e.y, { r: 240, life: 0.9, color: e.color });
    if (e.final) { G.won = true; G.ending = 2.8; if (!G.demo) banner('아크 코어 격파! 스테이지 클리어', 'good'); }
    else if (!G.demo) banner(`${e.name} 격파. 에테르 상자를 주우세요`, 'good');
  }
}
export function hurtPlayer(p, dmg) {
  if (p.dead || p.iframe > 0) return;
  dmg = Math.max(1, dmg - p.s.armor);
  p.hp -= dmg; p.iframe = 0.5; p.hurt = 0.16;
  if (p === G.human && !G.demo && !REDUCED) G.shake = Math.max(G.shake, 3);
  if (p.hp <= 0) {
    p.hp = 0; p.dead = true; p.revive = 0; p.mx = p.my = 0;
    addFx('ring', p.x, p.y, { r: 70, life: 0.6, color: p.color });
    if (!G.demo && G.players.some(o => !o.dead)) {
      banner(p === G.human ? '쓰러졌습니다. 동료가 영혼 오브에 닿으면 부활합니다' : `${p.name} 쓰러짐. 영혼 오브 위에 머물러 살리세요`, 'danger');
    }
  }
}
export function dropXp(x, y, v) {
  if (drops.live.length > 650) {
    for (let t = 0; t < 6; t++) { const g = pick(drops.live); if (g.alive && g.kind === 'xp') { g.v += v; return; } }
  }
  const g = drops.get(); g.kind = 'xp'; g.x = x + rand(-4, 4); g.y = y + rand(-4, 4); g.v = v; g.vac = false; g.sp = 0; g.t = 0;
}
export function dropItem(kind, x, y) { const g = drops.get(); g.kind = kind; g.x = x; g.y = y; g.v = 0; g.vac = false; g.sp = 0; g.t = 0; }
export function shoot(p, kind, a, speed, r, dmg, o) {
  const pr = projs.get();
  pr.kind = kind; pr.x = p.x; pr.y = p.y; pr.vx = Math.cos(a) * speed * p.s.projSpeed; pr.vy = Math.sin(a) * speed * p.s.projSpeed;
  pr.r = r; pr.dmg = dmg; pr.pierce = o.pierce || 1; pr.life = o.life || 1; pr.color = o.color || '#fff'; pr.owner = p;
  pr.er = o.er || 0; pr.zone = !!o.zone; pr.t = 0; pr.out = o.out || 0; pr.hits = null; pr.tick = 0; pr.hitIds.length = 0;
  return pr;
}
export function fireEbul(x, y, dx, dy, speed, r, dmg) {
  const b = ebul.get(); b.x = x; b.y = y; b.vx = dx * speed; b.vy = dy * speed; b.r = r; b.dmg = dmg; b.life = 6;
}
export function addFx(kind, x, y, o) {
  const f = fxs.get(); f.kind = kind; f.x = x; f.y = y; f.t = 0; f.life = o.life || 0.3; f.r = o.r || 0; f.a = o.a || 0;
  f.half = o.half || 0; f.w = o.w || 0; f.color = o.color || '#fff'; f.owner = o.owner || null; f.pts = o.pts || null;
}
export function addText(x, y, v, crit) { const t = texts.get(); t.x = x; t.y = y; t.v = Math.round(v); t.crit = crit; t.t = 0; }
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

import { lerp, rand, TAU } from '../core/utils.js';
import { W, H } from '../core/canvas.js';
import { CLASSES, ETYPES, REVIVE_TIME } from '../data/tables.js';
import { enemies, projs, ebul, drops, fxs, texts } from '../core/pool.js';
import { grid, gkey, gridBuild, query, Q1, Q3, CELL } from '../core/spatialHash.js';
import { G } from './state.js';
import { keys, touch } from './input.js';
import { damage, hurtPlayer, fireEbul, addFx } from './combat.js';
import { explode } from './weapons.js';
import { director, ringPos } from './director.js';
import { gainXp, openChest } from './growth.js';
import { updateWeapons } from './weapons.js';
import { banner } from '../ui/banner.js';
import { openLevelUp } from '../ui/levelup.js';
import { finishGame } from '../ui/result.js';

function botDir(p) {
  let ax = 0, ay = 0;
  const lead = G.human && !G.human.dead && G.human !== p ? G.human : null;
  let soul = null, sd = 1e9;
  for (const o of G.players) if (o.dead && o !== p) { const d = Math.hypot(o.x - p.x, o.y - p.y); if (d < sd) { sd = d; soul = o; } }
  query(p.x, p.y, 180, Q3);
  for (const e of Q3) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, wgt = (180 - d) / 180 * (e.boss ? 4 : 1);
    ax += dx / d * wgt * 1.6; ay += dy / d * wgt * 1.6;
  }
  for (const b of ebul.live) {
    if (!b.alive) continue;
    const dx = p.x - b.x, dy = p.y - b.y, d2 = dx * dx + dy * dy;
    if (d2 < 12100) { const d = Math.sqrt(d2) || 1; ax += dx / d * 1.2; ay += dy / d * 1.2; }
  }
  if (soul && sd < 900) {
    if (sd > 20) { ax += (soul.x - p.x) / sd * 2.4; ay += (soul.y - p.y) / sd * 2.4; }
  } else {
    let g = null, gd = 380 * 380;
    for (const q of drops.live) { if (!q.alive) continue; const dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy; if (d2 < gd) { gd = d2; g = q; } }
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
function updatePlayers(dt) {
  const medics = G.players.filter(p => !p.dead && CLASSES[p.cls].aura);
  for (const p of G.players) {
    p.auraRegen = 0; p.auraMag = 1;
    for (const m of medics) if (Math.hypot(m.x - p.x, m.y - p.y) < 190) { p.auraRegen = 0.8; p.auraMag = 1.3; break; }
  }
  for (const p of G.players) {
    if (p.dead) continue;
    let dx = 0, dy = 0;
    if (p.auto) { const v = botDir(p); dx = v[0]; dy = v[1]; }
    else {
      if (keys.KeyW || keys.ArrowUp) dy -= 1;
      if (keys.KeyS || keys.ArrowDown) dy += 1;
      if (keys.KeyA || keys.ArrowLeft) dx -= 1;
      if (keys.KeyD || keys.ArrowRight) dx += 1;
      dx += touch.x; dy += touch.y;
    }
    const len = Math.hypot(dx, dy); if (len > 1) { dx /= len; dy /= len; }
    const sm = Math.min(1, dt * (p.auto ? 6 : 16));
    p.mx = lerp(p.mx, dx, sm); p.my = lerp(p.my, dy, sm);
    p.x += p.mx * p.s.speed * dt; p.y += p.my * p.s.speed * dt;
    const ml = Math.hypot(p.mx, p.my); if (ml > 0.2) { p.fx = p.mx / ml; p.fy = p.my / ml; }
    p.hp = Math.min(p.s.maxHp, p.hp + (p.s.regen + p.auraRegen) * dt);
    p.iframe -= dt; p.hurt -= dt;
    if (p.iframe <= 0) {
      query(p.x, p.y, p.r, Q1);
      let worst = 0; for (const e of Q1) if (e.dmg > worst) worst = e.dmg;
      if (worst > 0) hurtPlayer(p, worst);
    }
  }
}
function updateProjs(dt) {
  const L = projs.live;
  for (let i = 0; i < L.length; i++) {
    const pr = L[i]; if (!pr.alive) continue;
    pr.t += dt;
    if (pr.kind === 'zone') {
      pr.life -= dt; pr.tick -= dt;
      if (pr.tick <= 0) { pr.tick = 0.4; query(pr.x, pr.y, pr.r, Q1); for (const e of Q1) damage(e, pr.dmg, pr.owner, 0, 0, true); }
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
      query(pr.x, pr.y, pr.r, Q1);
      for (const e of Q1) {
        const last = pr.hits.get(e.uid);
        if (last !== undefined && G.clock - last < 0.4) continue;
        pr.hits.set(e.uid, G.clock); damage(e, pr.dmg, o, pr.vx * 0.15, pr.vy * 0.15);
      }
      pr.life -= dt; if (pr.life <= 0) pr.alive = false;
      continue;
    }
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
    if (pr.kind === 'fire') { query(pr.x, pr.y, pr.r, Q1); if (Q1.length || pr.life <= 0) explode(pr); continue; }
    query(pr.x, pr.y, pr.r, Q1);
    for (const e of Q1) {
      if (pr.hitIds.includes(e.uid)) continue;
      pr.hitIds.push(e.uid);
      damage(e, pr.dmg, pr.owner, pr.vx * 0.12, pr.vy * 0.12);
      if (--pr.pierce <= 0) { pr.alive = false; break; }
    }
    if (pr.life <= 0) pr.alive = false;
  }
}
function updateEnemies(dt) {
  const L = enemies.live, P = G.players, relocate = Math.hypot(W, H) / 2 + 560, damp = Math.max(0, 1 - dt * 9);
  for (let i = 0; i < L.length; i++) {
    const e = L[i]; if (!e.alive) continue;
    if (e.flash > 0) e.flash -= dt;
    if (e.burnT > 0) {
      e.burnT -= dt; e.burnAcc += e.burnDps * dt;
      if (e.burnAcc >= 4) { const a = e.burnAcc; e.burnAcc = 0; damage(e, a, e.burnOwner, 0, 0, true); if (!e.alive) continue; }
      if (e.burnT <= 0) e.burnDps = 0;
    }
    let tp = null, td = 1e12;
    for (const p of P) { if (p.dead) continue; const dx = p.x - e.x, dy = p.y - e.y, d = dx * dx + dy * dy; if (d < td) { td = d; tp = p; } }
    if (!tp) { e.x += e.kx * dt; e.y += e.ky * dt; e.kx *= damp; e.ky *= damp; continue; }
    td = Math.sqrt(td) || 1;
    if (!e.boss && td > relocate) { const pos = ringPos(); e.x = pos[0]; e.y = pos[1]; continue; }
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
        for (let b = 0; b < e.burstN; b++) { const a = off + b / e.burstN * TAU; fireEbul(e.x, e.y, Math.cos(a), Math.sin(a), e.final ? 170 : 150, 7, e.dmg * 0.6); }
        if (e.final) e.burst2 = 0.5;
      }
      if (e.burst2 > 0) {
        e.burst2 -= dt;
        if (e.burst2 <= 0) { const off = e.spin * 0.7 + Math.PI / e.burstN; for (let b = 0; b < e.burstN; b++) { const a = off + b / e.burstN * TAU; fireEbul(e.x, e.y, Math.cos(a), Math.sin(a), 130, 7, e.dmg * 0.6); } }
      }
    } else if (ETYPES[e.tid].ranged) {
      if (td < 240) { vx *= -0.4; vy *= -0.4; }
      e.shootT -= dt;
      if (e.shootT <= 0 && td < 520) { e.shootT = rand(2.4, 3.2); fireEbul(e.x, e.y, dx, dy, 190, 6, e.dmg); }
    }
    e.x += (vx + e.kx) * dt; e.y += (vy + e.ky) * dt;
    e.kx *= damp; e.ky *= damp;
    if (!e.boss) { // 가벼운 분리: 같은 셀의 이웃 최대 6개만 검사
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
function updateEbul(dt) {
  for (const b of ebul.live) {
    if (!b.alive) continue;
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0) { b.alive = false; continue; }
    for (const p of G.players) {
      if (p.dead) continue;
      const dx = p.x - b.x, dy = p.y - b.y, rr = p.r + b.r;
      if (dx * dx + dy * dy < rr * rr) { hurtPlayer(p, b.dmg); b.alive = false; break; }
    }
  }
}
function collect(p, g) {
  if (g.kind === 'xp') gainXp(p, g.v);
  else if (g.kind === 'potion') { p.hp = Math.min(p.s.maxHp, p.hp + Math.max(30, p.s.maxHp * 0.3)); addFx('ring', p.x, p.y, { r: 40, life: 0.4, color: '#ff5277', owner: p }); }
  else if (g.kind === 'magnet') { for (const q of drops.live) if (q.alive && q.kind === 'xp') q.vac = true; addFx('ring', p.x, p.y, { r: 400, life: 0.6, color: '#6ff3e8' }); }
  else if (g.kind === 'chest') openChest(p);
}
function updateDrops(dt) {
  const P = G.players;
  for (const g of drops.live) {
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
    if (d < tp.r + 10) { g.alive = false; collect(tp, g); }
  }
}
function updateSouls(dt) {
  for (const p of G.players) {
    if (!p.dead) continue;
    let k = 0, mul = 1;
    for (const o of G.players) if (!o.dead && Math.hypot(o.x - p.x, o.y - p.y) < 48) { k++; mul = Math.max(mul, o.s.reviveMul); }
    if (k > 0) p.revive += dt / REVIVE_TIME * mul * (1 + 0.5 * (k - 1));
    else p.revive = Math.max(0, p.revive - dt * 0.12);
    if (p.revive >= 1) {
      p.dead = false; p.hp = p.s.maxHp * 0.5; p.iframe = 2; p.revive = 0;
      addFx('ring', p.x, p.y, { r: 90, life: 0.7, color: '#63f5a8' });
      if (!G.demo) banner(p === G.human ? '부활했습니다' : `${p.name} 부활`, 'good');
    }
  }
}
function updateFx(dt) {
  for (const f of fxs.live) { if (!f.alive) continue; f.t += dt; if (f.t >= f.life) f.alive = false; }
  for (const t of texts.live) { if (!t.alive) continue; t.t += dt; if (t.t >= 0.6) t.alive = false; }
}

export function update(dt) {
  G.clock += dt;
  if (!G.won) G.time += dt;
  G.diff = Math.min(G.time, G.stageLen) / G.stageLen * 15 + Math.max(0, G.time - G.stageLen) / 60;
  director(dt);
  gridBuild();
  updatePlayers(dt);
  for (const p of G.players) if (!p.dead) updateWeapons(p, dt);
  updateProjs(dt);
  updateEnemies(dt);
  updateEbul(dt);
  updateDrops(dt);
  updateSouls(dt);
  updateFx(dt);
  enemies.compact(); projs.compact(); ebul.compact(); drops.compact(); fxs.compact(); texts.compact();
  const h = G.human, k = Math.min(1, dt * 8);
  G.cam.x = lerp(G.cam.x, h.x, k); G.cam.y = lerp(G.cam.y, h.y, k);
  G.shake = Math.max(0, G.shake - dt * 20);
  if (G.ending > 0) { G.ending -= dt; if (G.ending <= 0) finishGame(); }
  else if (!G.won && G.players.every(p => p.dead)) { G.ending = 1.6; if (!G.demo) banner('파티 전멸', 'danger'); }
  if (!G.demo && G.mode === 'play' && G.ending <= 0 && h.pending > 0 && !h.dead) openLevelUp();
}

import { TAU, rand, pick, angDiff } from '../core/utils.js';
import { WEAPONS } from '../data/tables.js';
import { nearest, query, Q1, Q2 } from '../core/spatialHash.js';
import { enemies, projs } from '../core/pool.js';
import { G } from './state.js';
import { damage, addFx, shoot, jag } from './combat.js';

export const wst = w => w.evo ? WEAPONS[w.id].evoS : WEAPONS[w.id].lv[w.lv - 1];
export const wdmg = (p, w, st) => st.dmg * p.s.dmgMul * (WEAPONS[w.id].explosive ? p.s.explosiveMul : 1);

export function beam(p, a, len, wd, dmg) {
  const cx = Math.cos(a), cy = Math.sin(a), L = enemies.live;
  for (let i = 0; i < L.length; i++) {
    const e = L[i]; if (!e.alive) continue;
    const dx = e.x - p.x, dy = e.y - p.y, t = dx * cx + dy * cy;
    if (t < 0 || t > len) continue;
    if (Math.abs(dx * cy - dy * cx) < wd + e.r) damage(e, dmg, p, cx * 80, cy * 80);
  }
  addFx('beam', p.x, p.y, { a, r: len, w: wd, life: 0.3, color: '#6ff3e8' });
}
export function explode(pr) {
  const p = pr.owner, burn = pr.dmg * 0.18;
  query(pr.x, pr.y, pr.er, Q2);
  for (const e of Q2) {
    const dx = e.x - pr.x, dy = e.y - pr.y, d = Math.hypot(dx, dy) || 1;
    damage(e, pr.dmg, p, dx / d * 140, dy / d * 140);
    if (e.alive) { e.burnT = 2.2; e.burnDps = Math.max(e.burnDps, burn); e.burnOwner = p; }
  }
  addFx('boom', pr.x, pr.y, { r: pr.er, life: 0.35, color: pr.color });
  if (pr.zone) {
    const z = projs.get(); z.kind = 'zone'; z.x = pr.x; z.y = pr.y; z.r = pr.er * 0.8; z.dmg = pr.dmg * 0.25; z.life = 2.6; z.t = 0; z.tick = 0;
    z.owner = p; z.color = '#ff8a3d'; z.hitIds.length = 0; z.hits = null; z.vx = z.vy = 0;
  }
  pr.alive = false;
}

const FIRE = {
  blade(p, w, st) {
    const R = st.r * p.s.areaMul, dmg = wdmg(p, w, st), t = nearest(p.x, p.y, R + 80);
    const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.fy, p.fx);
    query(p.x, p.y, R, Q1);
    if (w.evo) {
      for (const e of Q1) { const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1; damage(e, dmg, p, dx / d * 320, dy / d * 320); }
      addFx('shock', p.x, p.y, { r: R, life: 0.35, color: '#ffd166', owner: p });
      return true;
    }
    const n = st.n + p.s.amount, half = 0.62;
    for (let i = 0; i < n; i++) {
      const a = base + i * TAU / n;
      for (const e of Q1) {
        if (!e.alive) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (Math.abs(angDiff(Math.atan2(dy, dx), a)) <= half + e.r / d) damage(e, dmg, p, dx / d * 160, dy / d * 160);
      }
      addFx('slash', p.x, p.y, { r: R, a, half, life: 0.22, color: '#ffe2b0', owner: p });
    }
    return true;
  },
  rail(p, w, st) {
    const t = nearest(p.x, p.y, 700); if (!t) return false;
    const base = Math.atan2(t.y - p.y, t.x - p.x), dmg = wdmg(p, w, st), n = st.n + p.s.amount;
    if (w.evo) { for (let i = 0; i < n; i++) beam(p, base + (i - (n - 1) / 2) * 0.22, st.len, st.w * p.s.areaMul, dmg); return true; }
    for (let i = 0; i < n; i++) shoot(p, 'bullet', base + (i - (n - 1) / 2) * 0.09, 900, 5 * p.s.areaMul, dmg, { pierce: st.pierce, life: 1.1, color: '#6ff3e8' });
    return true;
  },
  wand(p, w, st) {
    const dmg = wdmg(p, w, st), n = st.n + p.s.amount;
    if (w.evo) {
      const hit = new Set(); let any = false;
      for (let c = 0; c < n; c++) {
        let cur = nearest(p.x, p.y, 520, hit); if (!cur) break;
        any = true; const pts = [p.x, p.y];
        for (let j = 0; j < st.jumps && cur; j++) {
          hit.add(cur.uid); pts.push(cur.x, cur.y);
          const cx = cur.x, cy = cur.y;
          damage(cur, dmg * (1 - j * 0.06), p, 0, 0);
          cur = nearest(cx, cy, st.jr * p.s.areaMul, hit);
        }
        addFx('zap', p.x, p.y, { pts: jag(pts), life: 0.28, color: '#c9b8ff' });
      }
      return any;
    }
    query(p.x, p.y, 560, Q1); if (!Q1.length) return false;
    const px = p.x, py = p.y;
    Q1.sort((a, b) => ((a.x - px) ** 2 + (a.y - py) ** 2) - ((b.x - px) ** 2 + (b.y - py) ** 2));
    for (let i = 0; i < n; i++) {
      const t = Q1[i % Q1.length];
      shoot(p, 'bolt', Math.atan2(t.y - py, t.x - px) + (i >= Q1.length ? rand(-0.25, 0.25) : 0), 520, 6, dmg, { pierce: 1, life: 1.4, color: '#b89cff' });
    }
    return true;
  },
  fireball(p, w, st) {
    query(p.x, p.y, 520, Q1); if (!Q1.length) return false;
    const n = st.n + p.s.amount, dmg = wdmg(p, w, st);
    for (let i = 0; i < n; i++) {
      const t = pick(Q1);
      shoot(p, 'fire', Math.atan2(t.y - p.y, t.x - p.x) + rand(-0.08, 0.08), 360, w.evo ? 12 : 8, dmg,
        { life: 1.8, er: st.r * p.s.areaMul, zone: !!st.zone, color: w.evo ? '#ffd166' : '#ff8a3d' });
    }
    return true;
  },
  boomerang(p, w, st) {
    const t = nearest(p.x, p.y, 480), base = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.fy, p.fx);
    const n = st.n + p.s.amount, sz = st.size || 1, dmg = wdmg(p, w, st);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * (w.evo ? TAU / n : 0.4);
      const pr = shoot(p, 'boom', a, 480, 13 * sz * p.s.areaMul, dmg, { life: 5, out: 0.7, color: w.evo ? '#ffd166' : '#e8f0ff' });
      pr.hits = new Map();
    }
    return true;
  },
  thunder(p, w, st) {
    query(p.x, p.y, 460, Q1); if (!Q1.length) return false;
    const n = st.n + p.s.amount, R = st.r * p.s.areaMul, dmg = wdmg(p, w, st);
    const spots = []; for (let i = 0; i < n; i++) { const t = pick(Q1); spots.push(t.x, t.y); }
    for (let i = 0; i < spots.length; i += 2) {
      const x = spots[i], y = spots[i + 1];
      query(x, y, R, Q2);
      for (const e of Q2) { const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1; damage(e, dmg, p, dx / d * 120, dy / d * 120); }
      addFx('bolt', x, y, { r: R, life: 0.32, color: w.evo ? '#9ff9ff' : '#fff3a0', pts: jag([x + rand(-30, 30), y - 340, x, y]) });
      if (w.evo) { const c = nearest(x, y, 170); if (c) { const cx = c.x, cy = c.y; damage(c, dmg * 0.5, p, 0, 0); addFx('zap', x, y, { pts: jag([x, y, cx, cy]), life: 0.22, color: '#9ff9ff' }); } }
    }
    return true;
  },
};
export function orbitTick(p, w, st, dt) {
  w.ang += dt * (w.evo ? 3.8 : 3) * p.s.projSpeed;
  if (!w.evo) {
    if (w.on > 0) { w.on -= dt; if (w.on <= 0) { w.on = 0; w.off = st.cd * p.s.cdMul; } }
    else { w.off -= dt; if (w.off <= 0) w.on = st.dur; return; }
  }
  const n = st.n + p.s.amount, R = st.r * p.s.areaMul, sz = (w.evo ? 15 : 10) * p.s.areaMul, dmg = wdmg(p, w, st);
  if (w.hits.size > 3000) w.hits.clear();
  for (let i = 0; i < n; i++) {
    const a = w.ang + i * TAU / n, ox = p.x + Math.cos(a) * R, oy = p.y + Math.sin(a) * R;
    query(ox, oy, sz, Q2);
    for (const e of Q2) {
      const last = w.hits.get(e.uid);
      if (last !== undefined && G.clock - last < 0.45) continue;
      w.hits.set(e.uid, G.clock);
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
      damage(e, dmg, p, dx / d * 200, dy / d * 200);
    }
  }
}
export function auraTick(p, w, st) {
  const R = st.r * p.s.areaMul, dmg = wdmg(p, w, st);
  query(p.x, p.y, R, Q1);
  let hit = 0;
  for (const e of Q1) { damage(e, dmg, p, 0, 0, true); hit++; }
  if (w.evo && hit) p.hp = Math.min(p.s.maxHp, p.hp + 1.5);
}
export function updateWeapons(p, dt) {
  for (const w of p.weapons) {
    const st = wst(w);
    if (w.id === 'orbit') { orbitTick(p, w, st, dt); continue; }
    w.t -= dt; if (w.t > 0) continue;
    if (w.id === 'aura') { w.t = 0.5; auraTick(p, w, st); continue; }
    w.t = FIRE[w.id](p, w, st) ? st.cd * p.s.cdMul : 0.15;
  }
}

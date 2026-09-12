import { cv, ctx, W, H, DPR } from '../core/canvas.js';
import { TAU, rand, clamp, FONT_BODY, FONT_DISP, FONT_EMOJI, fmt } from '../core/utils.js';
import { CLASSES, WEAPONS, PASSIVES, ETYPES, ENEMY_KINDS } from '../data/tables.js';
import { wst } from '../game/weapons.js';
import { touch } from '../game/input.js';

let VX0 = 0, VY0 = 0, VX1 = 0, VY1 = 0, showDebug = true;
export function toggleDebug() { showDebug = !showDebug; }
let fps = 60, fpsAcc = 0, fpsN = 0;
export function tickFps(dt) { fpsAcc += dt; fpsN++; if (fpsAcc >= 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; } }

const vis = (x, y, m) => x > VX0 - m && x < VX1 + m && y > VY0 - m && y < VY1 + m;
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }

function drawGround() {
  const T = 256;
  for (let gx = Math.floor(VX0 / T); gx <= Math.floor(VX1 / T); gx++) for (let gy = Math.floor(VY0 / T); gy <= Math.floor(VY1 / T); gy++) {
    const h = hash(gx, gy), px = gx * T + hash(gy, gx) * T, py = gy * T + hash(gx + 7, gy - 3) * T;
    if (h < 0.3) { ctx.fillStyle = 'rgba(155,123,255,0.05)'; circle(px, py, 60 + h * 140); ctx.fill(); }
    else if (h < 0.46) {
      const s = 7 + h * 16; ctx.fillStyle = 'rgba(111,243,232,0.16)';
      ctx.beginPath(); ctx.moveTo(px, py - s * 1.6); ctx.lineTo(px + s * 0.6, py); ctx.lineTo(px, py + s * 0.5); ctx.lineTo(px - s * 0.6, py); ctx.closePath(); ctx.fill();
    } else if (h < 0.6) {
      ctx.strokeStyle = 'rgba(239,230,210,0.06)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(px, py, 30 + h * 40, 14 + h * 18, 0, 0, TAU); ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(239,230,210,0.08)';
  const S = 64;
  for (let gx = Math.floor(VX0 / S) * S; gx < VX1; gx += S) for (let gy = Math.floor(VY0 / S) * S; gy < VY1; gy += S) ctx.fillRect(gx - 1, gy - 1, 2, 2);
}
function shapePath(shape, x, y, r, ph) {
  if (shape === 'circle') { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
  else if (shape === 'diamond') { const wv = 1.1 + Math.sin(ph * 12) * 0.35; ctx.moveTo(x, y - r); ctx.lineTo(x + r * wv, y); ctx.lineTo(x, y + r * 0.8); ctx.lineTo(x - r * wv, y); ctx.closePath(); }
  else if (shape === 'square') { ctx.rect(x - r, y - r, r * 2, r * 2); }
  else { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); }
}
function drawDrops(sim) {
  const { drops } = sim.pools;
  const tiers = [[0, 3, '#6ff3e8', 4], [3, 12, '#9b7bff', 5.5], [12, 1e9, '#ff8a3d', 7]];
  for (const [lo, hi, col, s] of tiers) {
    ctx.beginPath(); let any = false;
    for (const g of drops.live) {
      if (!g.alive || g.kind !== 'xp' || g.v < lo || g.v >= hi || !vis(g.x, g.y, 10)) continue;
      any = true; ctx.moveTo(g.x, g.y - s * 1.3); ctx.lineTo(g.x + s, g.y); ctx.lineTo(g.x, g.y + s * 1.3); ctx.lineTo(g.x - s, g.y); ctx.closePath();
    }
    if (any) { ctx.fillStyle = col; ctx.fill(); }
  }
  for (const g of drops.live) {
    if (!g.alive || g.kind === 'xp' || !vis(g.x, g.y, 30)) continue;
    const bob = Math.sin(g.t * 4) * 2;
    if (g.kind === 'chest') {
      ctx.fillStyle = `rgba(255,209,102,${0.18 + 0.1 * Math.sin(g.t * 5)})`; circle(g.x, g.y, 30); ctx.fill();
      ctx.fillStyle = '#ffd166'; rr(g.x - 13, g.y - 9 + bob, 26, 18, 3); ctx.fill();
      ctx.fillStyle = '#b37a12'; ctx.fillRect(g.x - 13, g.y - 3 + bob, 26, 3);
      ctx.fillStyle = '#6ff3e8'; ctx.fillRect(g.x - 3, g.y - 5 + bob, 6, 7);
    } else if (g.kind === 'potion') {
      ctx.fillStyle = '#ff5277'; circle(g.x, g.y + bob, 9); ctx.fill();
      ctx.fillStyle = '#efe6d2'; ctx.fillRect(g.x - 1.5, g.y - 5 + bob, 3, 10); ctx.fillRect(g.x - 5, g.y - 1.5 + bob, 10, 3);
    } else if (g.kind === 'magnet') {
      ctx.strokeStyle = '#6ff3e8'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(g.x, g.y + bob, 8, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#ff5277'; ctx.fillRect(g.x - 10, g.y + bob, 4, 5); ctx.fillRect(g.x + 6, g.y + bob, 4, 5);
    }
  }
}
function drawEnemies(sim) {
  const G = sim.G, L = sim.pools.enemies.live;
  for (const tid of ENEMY_KINDS) {
    const T = ETYPES[tid]; ctx.beginPath(); let any = false;
    for (const e of L) {
      if (!e.alive || e.tid !== tid || e.elite || e.boss || !vis(e.x, e.y, e.r)) continue;
      any = true; shapePath(T.shape, e.x, e.y, e.r, e.phase + G.clock);
    }
    if (any) { ctx.fillStyle = T.color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = T.edge; ctx.stroke(); }
  }
  // 눈: 목표를 향한 작은 슬릿
  ctx.fillStyle = '#140f2b'; ctx.beginPath();
  for (const e of L) { if (!e.alive || e.boss || !vis(e.x, e.y, e.r)) continue; const ex = e.x + e.fx * e.r * 0.4, ey = e.y + e.fy * e.r * 0.4; ctx.moveTo(ex + 2.5, ey); ctx.arc(ex, ey, 2.5, 0, TAU); }
  ctx.fill();
  // 피격 플래시
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); let fl = false;
  for (const e of L) { if (!e.alive || e.flash <= 0 || e.boss || e.elite || !vis(e.x, e.y, e.r)) continue; fl = true; shapePath(ETYPES[e.tid].shape, e.x, e.y, e.r, e.phase + G.clock); }
  if (fl) ctx.fill();
  for (const e of L) {
    if (!e.alive || !vis(e.x, e.y, e.r + 40)) continue;
    if (e.elite) {
      ctx.fillStyle = 'rgba(255,209,102,0.16)'; circle(e.x, e.y, e.r + 12 + Math.sin(G.clock * 6) * 3); ctx.fill();
      ctx.fillStyle = e.flash > 0 ? '#fff' : '#b8926f'; ctx.beginPath(); ctx.rect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#ffd166'; ctx.stroke();
      ctx.fillStyle = '#140f2b'; circle(e.x + e.fx * 10, e.y + e.fy * 10, 4); ctx.fill();
      hpBar(e.x, e.y - e.r - 10, 50, e.hp / e.maxHp, '#ffd166');
    } else if (e.boss) drawBoss(sim, e);
  }
}
function drawBoss(sim, e) {
  const G = sim.G;
  if (e.teleT > 0) {
    const k = 1 - e.teleT / 0.7, len = e.speed * 5.5 * 0.75;
    ctx.strokeStyle = `rgba(255,82,119,${0.12 + 0.25 * k})`; ctx.lineWidth = e.r * 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + e.tdx * len, e.y + e.tdy * len); ctx.stroke(); ctx.lineCap = 'butt';
  }
  ctx.fillStyle = e.color + '26'; circle(e.x, e.y, e.r * 1.5); ctx.fill();
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#1d1638'; circle(e.x, e.y, e.r); ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = e.color; ctx.stroke();
  ctx.lineWidth = 5;
  for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 11, e.spin * 1.6 + k * TAU / 3, e.spin * 1.6 + k * TAU / 3 + 1.0); ctx.stroke(); }
  ctx.fillStyle = e.color; circle(e.x + e.fx * e.r * 0.2, e.y + e.fy * e.r * 0.2, e.r * (0.3 + 0.05 * Math.sin(G.clock * 8))); ctx.fill();
}
function hpBar(x, y, w, r, col) {
  ctx.fillStyle = 'rgba(13,10,31,0.8)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
  ctx.fillStyle = col; ctx.fillRect(x - w / 2, y, w * clamp(r, 0, 1), 4);
}
function drawAuras(sim) {
  const G = sim.G;
  for (const p of G.players) {
    if (p.dead) continue;
    if (CLASSES[p.cls].aura) {
      ctx.strokeStyle = 'rgba(99,245,168,0.22)'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]); ctx.lineDashOffset = -G.clock * 20;
      circle(p.x, p.y, 190); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const w of p.weapons) {
      if (w.id === 'aura') {
        const R = wst(w).r * p.s.areaMul;
        ctx.fillStyle = w.evo ? 'rgba(255,209,102,0.1)' : 'rgba(255,107,61,0.09)'; circle(p.x, p.y, R); ctx.fill();
        ctx.strokeStyle = w.evo ? 'rgba(255,209,102,0.45)' : 'rgba(255,138,61,0.35)'; ctx.lineWidth = 2; circle(p.x, p.y, R * (0.92 + 0.08 * Math.sin(G.clock * 6))); ctx.stroke();
      } else if (w.id === 'orbit' && (w.evo || w.on > 0)) {
        const st = wst(w), n = st.n + p.s.amount, R = st.r * p.s.areaMul, sz = (w.evo ? 15 : 10) * p.s.areaMul;
        ctx.fillStyle = w.evo ? '#ffd166' : '#9b7bff'; ctx.beginPath();
        for (let i = 0; i < n; i++) { const a = w.ang + i * TAU / n, ox = p.x + Math.cos(a) * R, oy = p.y + Math.sin(a) * R; ctx.moveTo(ox + sz, oy); ctx.arc(ox, oy, sz, 0, TAU); }
        ctx.fill();
        ctx.fillStyle = '#efe6d2'; ctx.beginPath();
        for (let i = 0; i < n; i++) { const a = w.ang + i * TAU / n, ox = p.x + Math.cos(a) * R, oy = p.y + Math.sin(a) * R; ctx.moveTo(ox + sz * 0.4, oy); ctx.arc(ox, oy, sz * 0.4, 0, TAU); }
        ctx.fill();
      }
    }
  }
}
function drawPlayers(sim) {
  const G = sim.G;
  for (const p of G.players) {
    if (p.dead) {
      const pulse = 1 + 0.08 * Math.sin(G.clock * 5);
      ctx.fillStyle = p.color + '30'; circle(p.x, p.y, 26 * pulse); ctx.fill();
      ctx.strokeStyle = p.color; ctx.lineWidth = 2; circle(p.x, p.y, 48); ctx.setLineDash([4, 6]); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#efe6d2'; circle(p.x, p.y, 7 * pulse); ctx.fill();
      if (p.revive > 0) { ctx.strokeStyle = '#63f5a8'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(p.x, p.y, 34, -Math.PI / 2, -Math.PI / 2 + TAU * p.revive); ctx.stroke(); }
      ctx.font = '700 12px ' + FONT_BODY; ctx.textAlign = 'center'; ctx.fillStyle = p.color;
      ctx.fillText(`${p.name} 영혼 오브`, p.x, p.y - 56);
      continue;
    }
    const blink = p.iframe > 0.45 && ((G.clock * 16) | 0) % 2 === 0;
    ctx.globalAlpha = blink ? 0.45 : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 13, 13, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = p.color + '38'; circle(p.x, p.y, p.r + 8); ctx.fill();
    ctx.fillStyle = p.hurt > 0 ? '#ffffff' : p.color; circle(p.x, p.y, p.r); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#140f2b'; ctx.stroke();
    ctx.fillStyle = '#140f2b'; circle(p.x + p.fx * 6, p.y + p.fy * 6, 5.5); ctx.fill();
    ctx.fillStyle = '#efe6d2'; circle(p.x + p.fx * 7.5, p.y + p.fy * 7.5, 2); ctx.fill();
    ctx.globalAlpha = 1;
    hpBar(p.x, p.y + p.r + 8, 34, p.hp / p.s.maxHp, p.hp / p.s.maxHp < 0.3 ? '#ff5277' : '#63f5a8');
    if (G.players.length > 1) { ctx.font = '700 11px ' + FONT_BODY; ctx.textAlign = 'center'; ctx.fillStyle = p.color; ctx.fillText(p.name, p.x, p.y - p.r - 8); }
  }
}
function drawProjs(sim) {
  for (const pr of sim.pools.projs.live) {
    if (!pr.alive || !vis(pr.x, pr.y, 40)) continue;
    if (pr.kind === 'bullet') {
      const sp = Math.hypot(pr.vx, pr.vy) || 1;
      ctx.strokeStyle = pr.color; ctx.lineWidth = pr.r * 0.9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(pr.x - pr.vx / sp * 22, pr.y - pr.vy / sp * 22); ctx.lineTo(pr.x, pr.y); ctx.stroke(); ctx.lineCap = 'butt';
    } else if (pr.kind === 'bolt') {
      ctx.fillStyle = pr.color + '55'; circle(pr.x, pr.y, pr.r * 1.9); ctx.fill();
      ctx.fillStyle = '#efe6d2'; circle(pr.x, pr.y, pr.r * 0.7); ctx.fill();
    } else if (pr.kind === 'fire') {
      ctx.fillStyle = pr.color + '55'; circle(pr.x, pr.y, pr.r * 1.8); ctx.fill();
      ctx.fillStyle = pr.color; circle(pr.x, pr.y, pr.r); ctx.fill();
      ctx.fillStyle = '#fff3a0'; circle(pr.x, pr.y, pr.r * 0.45); ctx.fill();
    } else if (pr.kind === 'boom') {
      ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(pr.t * 18); ctx.fillStyle = pr.color;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) { const a = k * TAU / 3; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * pr.r, Math.sin(a) * pr.r); ctx.lineTo(Math.cos(a + 0.6) * pr.r * 0.45, Math.sin(a + 0.6) * pr.r * 0.45); ctx.closePath(); }
      ctx.fill(); ctx.restore();
    } else if (pr.kind === 'zone') {
      const al = Math.min(1, pr.life / 0.6);
      ctx.fillStyle = `rgba(255,138,61,${0.16 * al})`; circle(pr.x, pr.y, pr.r); ctx.fill();
      ctx.strokeStyle = `rgba(255,209,102,${0.5 * al})`; ctx.lineWidth = 2; circle(pr.x, pr.y, pr.r * (0.9 + 0.1 * Math.sin(pr.t * 10))); ctx.stroke();
    }
  }
}
function drawEbul(sim) {
  const { ebul } = sim.pools;
  ctx.fillStyle = '#ff5277'; ctx.beginPath(); let any = false;
  for (const b of ebul.live) { if (!b.alive || !vis(b.x, b.y, 10)) continue; any = true; ctx.moveTo(b.x + b.r, b.y); ctx.arc(b.x, b.y, b.r, 0, TAU); }
  if (!any) return;
  ctx.fill();
  ctx.fillStyle = '#ffe0e8'; ctx.beginPath();
  for (const b of ebul.live) { if (!b.alive || !vis(b.x, b.y, 10)) continue; ctx.moveTo(b.x + b.r * 0.4, b.y); ctx.arc(b.x, b.y, b.r * 0.4, 0, TAU); }
  ctx.fill();
}
function polyline(pts) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke(); }
function drawFx(sim) {
  const { fxs, texts } = sim.pools;
  for (const f of fxs.live) {
    if (!f.alive) continue;
    const k = f.t / f.life, al = 1 - k, o = f.owner || f;
    ctx.globalAlpha = al;
    switch (f.kind) {
      case 'slash':
        ctx.fillStyle = f.color; ctx.beginPath();
        ctx.arc(o.x, o.y, f.r, f.a - f.half, f.a + f.half);
        ctx.arc(o.x, o.y, f.r * (0.45 + 0.35 * k), f.a + f.half, f.a - f.half, true);
        ctx.closePath(); ctx.fill(); break;
      case 'shock':
        ctx.fillStyle = 'rgba(255,209,102,0.15)'; circle(o.x, o.y, f.r); ctx.fill();
        ctx.strokeStyle = f.color; ctx.lineWidth = 10 * al + 1; circle(o.x, o.y, f.r * (0.4 + 0.6 * k)); ctx.stroke(); break;
      case 'ring':
        ctx.strokeStyle = f.color; ctx.lineWidth = 3; circle(o.x, o.y, f.r * (0.2 + 0.8 * k)); ctx.stroke(); break;
      case 'boom':
        ctx.fillStyle = f.color; ctx.globalAlpha = al * 0.45; circle(f.x, f.y, f.r * (0.6 + 0.4 * k)); ctx.fill();
        ctx.globalAlpha = al; ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = 2; ctx.stroke(); break;
      case 'beam': {
        const ex = f.x + Math.cos(f.a) * f.r, ey = f.y + Math.sin(f.a) * f.r;
        ctx.strokeStyle = f.color; ctx.lineWidth = f.w * 2 * al + 1; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = f.w * 0.5 * al + 1; ctx.stroke(); break;
      }
      case 'zap': case 'bolt':
        ctx.strokeStyle = f.color; ctx.lineWidth = 4; polyline(f.pts);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; polyline(f.pts);
        if (f.kind === 'bolt') { ctx.fillStyle = f.color; ctx.globalAlpha = al * 0.35; circle(f.x, f.y, f.r); ctx.fill(); }
        break;
      case 'pop':
        ctx.fillStyle = f.color;
        for (let j = 0; j < 5; j++) { const a = j * TAU / 5 + f.x, d = f.r * 0.6 + k * 20; ctx.fillRect(f.x + Math.cos(a) * d - 2, f.y + Math.sin(a) * d - 2, 4, 4); }
        break;
    }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const t of texts.live) {
    if (!t.alive || !vis(t.x, t.y, 20)) continue;
    const k = t.t / 0.6;
    ctx.globalAlpha = 1 - k * k;
    ctx.font = t.crit ? '800 15px ' + FONT_BODY : '700 11px ' + FONT_BODY;
    ctx.fillStyle = t.crit ? '#ffd166' : '#efe6d2';
    ctx.fillText(t.v, t.x, t.y - k * 22);
  }
  ctx.globalAlpha = 1;
}
function drawIndicators(sim) {
  const G = sim.G;
  const items = [];
  for (const g of sim.pools.drops.live) if (g.alive && g.kind === 'chest') items.push(g.x, g.y, '#ffd166');
  for (const p of G.players) if (p.dead && p !== G.human) items.push(p.x, p.y, p.color);
  for (const b of G.bosses) if (b.alive) items.push(b.x, b.y, '#ff5277');
  for (let i = 0; i < items.length; i += 3) {
    const dx = items[i] - G.cam.x, dy = items[i + 1] - G.cam.y;
    if (Math.abs(dx) < W / 2 - 10 && Math.abs(dy) < H / 2 - 10) continue;
    const t = Math.min((W / 2 - 28) / Math.abs(dx || 1e-6), (H / 2 - 28) / Math.abs(dy || 1e-6));
    const sx = W / 2 + dx * t, sy = H / 2 + dy * t, a = Math.atan2(dy, dx);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = items[i + 2];
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-7, -8); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.restore();
  }
}
function drawHUD(sim) {
  const G = sim.G;
  const h = G.human;
  ctx.fillStyle = 'rgba(13,10,31,0.85)'; ctx.fillRect(0, 0, W, 10);
  ctx.fillStyle = '#6ff3e8'; ctx.fillRect(0, 0, W * clamp(h.xp / h.xpNext, 0, 1), 10);
  ctx.textBaseline = 'alphabetic';
  // 타이머
  ctx.textAlign = 'center'; ctx.fillStyle = '#efe6d2'; ctx.font = '30px ' + FONT_DISP;
  const over = G.time >= G.stageLen;
  ctx.fillText(over ? '최종 보스전' : fmt(G.time), W / 2, 46);
  ctx.font = '600 12px ' + FONT_BODY; ctx.fillStyle = '#a59fc4';
  ctx.fillText(over ? `경과 ${fmt(G.time)}` : `목표 ${fmt(G.stageLen)}`, W / 2, 63);
  // 레벨, 처치
  ctx.textAlign = 'left'; ctx.font = '26px ' + FONT_DISP; ctx.fillStyle = '#6ff3e8'; ctx.fillText('Lv ' + h.level, 14, 44);
  ctx.textAlign = 'right'; ctx.fillStyle = '#efe6d2'; ctx.font = '22px ' + FONT_DISP; ctx.fillText(G.kills.toLocaleString() + ' 처치', W - 14, 42);
  if (showDebug) {
    ctx.font = '500 11px ' + FONT_BODY; ctx.fillStyle = '#a59fc4';
    ctx.fillText(`${fps} FPS  적 ${sim.pools.enemies.live.length}  투사체 ${sim.pools.projs.live.length + sim.pools.ebul.live.length}  (F3)`, W - 14, 60);
  }
  if (h.auto) { ctx.fillStyle = '#ffd166'; ctx.font = '700 12px ' + FONT_BODY; ctx.fillText('자동 조종 중 (F2)', W - 14, 76); }
  // 파티 패널
  ctx.textAlign = 'left';
  let y = 64;
  for (const p of G.players) {
    ctx.fillStyle = p.color; circle(20, y - 4, 5); ctx.fill();
    ctx.font = '700 12px ' + FONT_BODY; ctx.fillStyle = p.dead ? '#ff5277' : '#efe6d2';
    ctx.fillText(`${p.name}  ${CLASSES[p.cls].name}  Lv ${p.level}`, 32, y);
    ctx.fillStyle = 'rgba(239,230,210,0.12)'; ctx.fillRect(32, y + 5, 130, 5);
    if (p.dead) { ctx.fillStyle = '#63f5a8'; ctx.fillRect(32, y + 5, 130 * p.revive, 5); }
    else { ctx.fillStyle = p.hp / p.s.maxHp < 0.3 ? '#ff5277' : '#63f5a8'; ctx.fillRect(32, y + 5, 130 * p.hp / p.s.maxHp, 5); }
    y += 30;
  }
  // 보스 바
  let boss = null; for (let i = G.bosses.length - 1; i >= 0; i--) if (G.bosses[i].alive) { boss = G.bosses[i]; break; }
  if (boss) {
    const bw = Math.min(520, W * 0.6), bx = W / 2 - bw / 2, by = 76;
    ctx.fillStyle = 'rgba(13,10,31,0.85)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 12);
    ctx.fillStyle = boss.color; ctx.fillRect(bx, by, bw * boss.hp / boss.maxHp, 8);
    ctx.textAlign = 'center'; ctx.font = '16px ' + FONT_DISP; ctx.fillStyle = boss.color; ctx.fillText(boss.name, W / 2, by + 28);
  }
  // 슬롯
  const s = 42, gap = 6, bx = 14, byW = H - 14 - s, byP = byW - 36;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 4; i++) {
    const w = h.weapons[i], x = bx + i * (s + gap);
    ctx.fillStyle = 'rgba(13,10,31,0.72)'; rr(x, byW, s, s, 5); ctx.fill();
    ctx.lineWidth = w && w.evo ? 2.5 : 1; ctx.strokeStyle = w && w.evo ? '#ffd166' : 'rgba(239,230,210,0.22)'; ctx.stroke();
    if (!w) continue;
    ctx.font = '22px ' + FONT_EMOJI; ctx.fillStyle = '#fff';
    ctx.fillText(w.evo ? WEAPONS[w.id].evoIcon : WEAPONS[w.id].icon, x + s / 2, byW + s / 2 - 3);
    if (!w.evo) for (let l = 0; l < 5; l++) { ctx.fillStyle = l < w.lv ? '#6ff3e8' : 'rgba(239,230,210,0.2)'; ctx.fillRect(x + 6 + l * 6.4, byW + s - 6, 4.4, 3); }
  }
  for (let i = 0; i < 4; i++) {
    const q = h.passives[i], x = bx + i * (30 + 4), ps = 30;
    ctx.fillStyle = 'rgba(13,10,31,0.72)'; rr(x, byP, ps, ps, 4); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(155,123,255,0.35)'; ctx.stroke();
    if (!q) continue;
    ctx.font = '15px ' + FONT_EMOJI; ctx.fillStyle = '#fff'; ctx.fillText(PASSIVES[q.id].icon, x + ps / 2, byP + ps / 2 - 2);
    ctx.font = '700 9px ' + FONT_BODY; ctx.fillStyle = '#9b7bff'; ctx.fillText(q.lv, x + ps - 5, byP + ps - 5);
  }
  ctx.textBaseline = 'alphabetic';
  if (h.dead && !G.won) {
    ctx.textAlign = 'center'; ctx.font = '20px ' + FONT_DISP; ctx.fillStyle = '#ff5277';
    ctx.fillText(G.players.some(p => !p.dead) ? '동료가 영혼 오브에 닿으면 부활합니다' : '파티 전멸', W / 2, H - 60);
    if (h.spectating) {
      ctx.font = '600 13px ' + FONT_BODY; ctx.fillStyle = '#a59fc4';
      ctx.fillText(`${h.spectating} 관전 중 (Tab로 전환)`, W / 2, H - 38);
    }
  }
  if (touch.on) {
    ctx.strokeStyle = 'rgba(239,230,210,0.35)'; ctx.lineWidth = 2; circle(touch.ox, touch.oy, 50); ctx.stroke();
    ctx.fillStyle = 'rgba(111,243,232,0.5)'; circle(touch.ox + touch.x * 50, touch.oy + touch.y * 50, 18); ctx.fill();
  }
}
export function render(sim) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#140f2b'; ctx.fillRect(0, 0, W, H);
  const G = sim.G;
  if (!G) return;
  const sh = G.shake, ox = sh ? rand(-sh, sh) : 0, oy = sh ? rand(-sh, sh) : 0;
  const cx = G.cam.x, cy = G.cam.y;
  VX0 = cx - W / 2; VX1 = cx + W / 2; VY0 = cy - H / 2; VY1 = cy + H / 2;
  ctx.save(); ctx.translate(Math.round(W / 2 - cx + ox), Math.round(H / 2 - cy + oy));
  drawGround(); drawDrops(sim); drawAuras(sim); drawEnemies(sim); drawPlayers(sim); drawProjs(sim); drawEbul(sim); drawFx(sim);
  ctx.restore();
  if (!G.demo) { drawIndicators(sim); drawHUD(sim); }
}

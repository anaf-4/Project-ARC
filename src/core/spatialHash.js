import { enemies } from './pool.js';

export const CELL = 64, grid = new Map(), usedCells = [];
export const gkey = (cx, cy) => ((cx & 0xffff) << 16) | (cy & 0xffff);
export function gridBuild() {
  for (let i = 0; i < usedCells.length; i++) usedCells[i].length = 0;
  usedCells.length = 0;
  if (grid.size > 30000) grid.clear();
  const L = enemies.live;
  for (let i = 0; i < L.length; i++) {
    const e = L[i]; if (!e.alive) continue;
    const k = gkey(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
    let a = grid.get(k); if (!a) { a = []; grid.set(k, a); }
    if (a.length === 0) usedCells.push(a);
    a.push(e);
  }
}
export function query(x, y, r, out) {
  out.length = 0;
  const m = r + 60, c0 = Math.floor((x - m) / CELL), c1 = Math.floor((x + m) / CELL), r0 = Math.floor((y - m) / CELL), r1 = Math.floor((y + m) / CELL);
  for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
    const a = grid.get(gkey(cx, cy)); if (!a) continue;
    for (let i = 0; i < a.length; i++) {
      const e = a[i]; if (!e.alive) continue;
      const dx = e.x - x, dy = e.y - y, rr = r + e.r;
      if (dx * dx + dy * dy <= rr * rr) out.push(e);
    }
  }
  return out;
}
export function nearest(x, y, range, excl) {
  let best = null, bd = range * range;
  const c0 = Math.floor((x - range) / CELL), c1 = Math.floor((x + range) / CELL), r0 = Math.floor((y - range) / CELL), r1 = Math.floor((y + range) / CELL);
  for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
    const a = grid.get(gkey(cx, cy)); if (!a) continue;
    for (let i = 0; i < a.length; i++) {
      const e = a[i]; if (!e.alive || (excl && excl.has(e.uid))) continue;
      const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
  }
  return best;
}
export const Q1 = [], Q2 = [], Q3 = [];

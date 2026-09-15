import { REDUCED, TAU } from '../core/utils.js';
import { WEAPONS, PASSIVES, xpNeed, CHEST_TIERS, evoInfo } from '../data/tables.js';
import { newWeapon, recompute } from './state.js';
import { addFx } from './combat.js';

export function gainXp(sim, p, v) {
  const G = sim.G;
  p.xp += v * p.s.xpMul * G.xpMul;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext; p.level++; p.xpNext = xpNeed(p.level);
    if (p.auto) botLevel(sim, p); else p.pending++;
    addFx(sim, 'ring', p.x, p.y, { r: 46, life: 0.45, color: '#6ff3e8', owner: p });
  }
}
export function getOptions(p, n) {
  const pool = [];
  for (const w of p.weapons) if (!w.evo && w.lv < 5) pool.push({ kind: 'wup', id: w.id, w: 3 });
  if (p.weapons.length < 4) for (const id in WEAPONS) if (!p.weapons.some(w => w.id === id)) pool.push({ kind: 'wnew', id, w: 1.2 });
  for (const q of p.passives) if (q.lv < 5) pool.push({ kind: 'pup', id: q.id, w: 2 });
  if (p.passives.length < 4) for (const id in PASSIVES) if (!p.passives.some(q => q.id === id)) pool.push({ kind: 'pnew', id, w: 1 });
  const out = [];
  while (out.length < n && pool.length) {
    let t = 0; for (const o of pool) t += o.w;
    let r = Math.random() * t, i = 0;
    for (; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) break; }
    out.push(pool.splice(Math.min(i, pool.length - 1), 1)[0]);
  }
  if (!out.length) { out.push({ kind: 'heal' }); if (n > 1) out.push({ kind: 'shard' }); }
  return out;
}
export function applyOption(sim, p, o) {
  if (o.kind === 'wnew') p.weapons.push(newWeapon(o.id));
  else if (o.kind === 'wup') { const w = p.weapons.find(w => w.id === o.id); if (w) w.lv++; }
  else if (o.kind === 'pnew') p.passives.push({ id: o.id, lv: 1 });
  else if (o.kind === 'pup') { const q = p.passives.find(q => q.id === o.id); if (q) q.lv++; }
  else if (o.kind === 'heal') p.hp = Math.min(p.s.maxHp, p.hp + p.s.maxHp * 0.3);
  else if (o.kind === 'shard') sim.G.bonusShards += 10;
  recompute(sim, p);
}
export function optName(o) {
  if (o.kind === 'wnew' || o.kind === 'wup') return WEAPONS[o.id].name;
  if (o.kind === 'pnew' || o.kind === 'pup') return PASSIVES[o.id].name;
  return o.kind === 'heal' ? '응급 회복' : '에테르 파편';
}
export function optIcon(o) {
  if (o.kind === 'wnew' || o.kind === 'wup') return WEAPONS[o.id].icon;
  if (o.kind === 'pnew' || o.kind === 'pup') return PASSIVES[o.id].icon;
  return o.kind === 'heal' ? '🧪' : '◆';
}
export function botLevel(sim, p) {
  const opts = getOptions(p, 3);
  let best = opts[0], bs = -1;
  for (const o of opts) {
    let sc = Math.random();
    if (o.kind === 'wup') sc += 1.2;
    if (o.kind === 'wnew') sc += 0.6;
    if ((o.kind === 'pnew' || o.kind === 'pup') && p.weapons.some(w => WEAPONS[w.id].pair === o.id || WEAPONS[w.id].altEvos?.some(a => a.pair === o.id))) sc += 1.5;
    if (o.kind === 'wnew' && p.weapons.some(w => WEAPONS[w.id].comboWith === o.id || WEAPONS[o.id].comboWith === w.id)) sc += 1.3;
    if (sc > bs) { bs = sc; best = o; }
  }
  applyOption(sim, p, best);
}
export function openChest(sim, p, tier = 1) {
  const G = sim.G;
  const col = CHEST_TIERS[tier].color;
  addFx(sim, 'ring', p.x, p.y, { r: 70, life: 0.4, color: col });
  addFx(sim, 'ring', p.x, p.y, { r: 170, life: 0.9, color: col });
  addFx(sim, 'burst', p.x, p.y, { r: 130, life: 0.6, color: col, a: Math.random() * TAU });
  if (!REDUCED) G.shake = Math.max(G.shake, 8);
  // Evolution unlocks the usual way (paired passive at any level, or —
  // for a weapon tagged comboWith — by carrying the combo partner weapon
  // instead), OR via one of altEvos: a *different* skill unlocking a
  // *different* evolved form of the same weapon. -1 = primary, >=0 = which
  // altEvos entry. Checked in order; the first satisfied path wins.
  const evoMatch = (w) => {
    const D = WEAPONS[w.id];
    if (p.passives.some(q => q.id === D.pair) || (D.comboWith && p.weapons.some(w2 => w2.id === D.comboWith))) return -1;
    if (D.altEvos) for (let i = 0; i < D.altEvos.length; i++) {
      const a = D.altEvos[i];
      if ((a.pair && p.passives.some(q => q.id === a.pair)) || (a.comboWith && p.weapons.some(w2 => w2.id === a.comboWith))) return i;
    }
    return null;
  };
  const w = p.weapons.find(w => !w.evo && w.lv >= 5 && evoMatch(w) !== null);
  if (w) {
    const match = evoMatch(w);
    w.evo = true; if (match >= 0) w.altIdx = match;
    w.t = 0; w.on = 0; w.off = 0; w.hits.clear();
    const info = evoInfo(w);
    if (!G.demo) sim.onBanner?.(`${p === G.human ? '' : p.name + ' '}진화! ${WEAPONS[w.id].name} → ${info.name}`, 'evo');
    sim.onReward?.(tier, [{ icon: info.icon, name: info.name }]);
    return;
  }
  // Higher-tier chests offer more skills at once (up to the tier-4 cap) —
  // this is the whole point of the tier system once a weapon-evolution
  // isn't on offer instead.
  const gains = [], items = [];
  for (let i = 0; i < tier; i++) {
    const o = getOptions(p, 1)[0]; applyOption(sim, p, o);
    gains.push(optName(o)); items.push({ icon: optIcon(o), name: optName(o) });
  }
  if (!G.demo && p === G.human) sim.onBanner?.(`${CHEST_TIERS[tier].name} 에테르 상자: ${gains.join(', ')} 강화`, 'good');
  sim.onReward?.(tier, items);
}

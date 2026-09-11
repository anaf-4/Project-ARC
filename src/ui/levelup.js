import { $ } from '../core/utils.js';
import { WEAPONS, PASSIVES, STAT_LABEL } from '../data/tables.js';
import { getOptions, applyOption } from '../game/growth.js';
import { sim } from '../main.js';

export let curOpts = [];
// Set while a multiplayer level-up offer is showing; chooseOption() routes
// through this instead of the solo sim.G.human/applyOption path when set.
// index -> void; sends the pick to the server and doesn't touch sim at all
// (the server is authoritative — it applies the choice, not this client).
let mpCallback = null;

function optCardHTML(o, i, p) {
  let icon, name, tag, desc, evo = '', kcol;
  if (o.kind === 'wnew' || o.kind === 'wup') {
    const D = WEAPONS[o.id]; icon = D.icon; name = D.name; kcol = '#ff8a3d';
    if (o.kind === 'wnew') { tag = '새 무기'; desc = D.desc; }
    else {
      const w = p.weapons.find(w => w.id === o.id), a = D.lv[w.lv - 1], b = D.lv[w.lv];
      tag = `Lv ${w.lv} → ${w.lv + 1}`;
      desc = Object.keys(b).filter(k => a[k] !== b[k] && STAT_LABEL[k]).map(k => `${STAT_LABEL[k]} ${a[k]} → ${b[k]}`).join(', ') || D.desc;
    }
    evo = `진화 짝: ${PASSIVES[D.pair].icon} ${PASSIVES[D.pair].name} → ${D.evoIcon} ${D.evo}`;
  } else if (o.kind === 'pnew' || o.kind === 'pup') {
    const D = PASSIVES[o.id]; icon = D.icon; name = D.name; kcol = '#9b7bff';
    const q = p.passives.find(q => q.id === o.id);
    tag = q ? `Lv ${q.lv} → ${q.lv + 1}` : '새 패시브'; desc = D.desc + ' (레벨당)';
    const pw = Object.entries(WEAPONS).find(([, w]) => w.pair === o.id);
    if (pw) evo = `진화 짝: ${pw[1].icon} ${pw[1].name} → ${pw[1].evoIcon} ${pw[1].evo}`;
  } else if (o.kind === 'heal') { icon = '🧪'; name = '응급 회복'; tag = '보너스'; desc = '최대 체력의 30%를 회복합니다.'; kcol = '#63f5a8'; }
  else { icon = '◆'; name = '에테르 파편'; tag = '보너스'; desc = '정산 시 에테르 파편 10개를 추가로 받습니다.'; kcol = '#ffd166'; }
  return `<button class="card" data-i="${i}" style="--k:${kcol}"><span class="key">${i + 1}</span><span class="ic">${icon}</span>
    <span class="nm">${name}</span><span class="lvtag">${tag}</span><p>${desc}</p>${evo ? `<span class="evo">${evo}</span>` : ''}</button>`;
}
export function openLevelUp(p) {
  p = p || sim.G.human;
  sim.G.mode = 'levelup';
  curOpts = getOptions(p, 3);
  $('lvSub').textContent = `Lv ${p.level - p.pending + 1} 달성. 강화 하나를 고르세요` + (p.pending > 1 ? ` (대기 ${p.pending}회)` : '');
  $('choices').innerHTML = curOpts.map((o, i) => optCardHTML(o, i, p)).join('');
  $('rerollN').textContent = sim.G.rerolls; $('rerollBtn').disabled = sim.G.rerolls <= 0;
  $('levelup').classList.add('on');
  const first = $('choices').querySelector('.card'); if (first) first.focus({ preventScroll: true });
}
// Called by main.js when the server sends a 'levelup' message (multiplayer:
// each player gets their own offer; the shared sim keeps running for
// everyone else in the meantime — see server/rooms/GameRoom.js). `p` is
// this client's own player snapshot (from net/netSim.js) so the card text
// can still show real current-level deltas.
export function showMpLevelUp(options, p, onChoose) {
  mpCallback = onChoose;
  curOpts = options;
  $('lvSub').textContent = '레벨업! 강화 하나를 고르세요';
  $('choices').innerHTML = curOpts.map((o, i) => optCardHTML(o, i, p)).join('');
  $('rerollN').textContent = 0; $('rerollBtn').disabled = true;
  $('levelup').classList.add('on');
  const first = $('choices').querySelector('.card'); if (first) first.focus({ preventScroll: true });
}
export function chooseOption(i) {
  if (mpCallback) {
    const cb = mpCallback; mpCallback = null;
    $('levelup').classList.remove('on');
    cb(i);
    return;
  }
  if (!sim.G || sim.G.mode !== 'levelup') return;
  const p = sim.G.human;
  applyOption(sim, p, curOpts[i]);
  p.pending--;
  p.awaitingLevelUp = false;
  $('levelup').classList.remove('on');
  sim.G.mode = 'play';
  if (p.pending > 0) openLevelUp(p);
}
export function doReroll() {
  if (mpCallback) return; // no reroll in multiplayer yet
  if (!sim.G || sim.G.mode !== 'levelup' || sim.G.rerolls <= 0) return;
  sim.G.rerolls--; sim.G.mode = 'play'; openLevelUp();
}
$('choices').addEventListener('click', e => { const b = e.target.closest('.card'); if (b) chooseOption(+b.dataset.i); });
$('rerollBtn').addEventListener('click', doReroll);

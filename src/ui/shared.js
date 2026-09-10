import { WEAPONS, PASSIVES } from '../data/tables.js';

export function buildHTML(p) {
  return p.weapons.map(w => `<span class="slot ${w.evo ? 'evo' : ''}">${w.evo ? WEAPONS[w.id].evoIcon + ' ' + WEAPONS[w.id].evo : WEAPONS[w.id].icon + ' ' + WEAPONS[w.id].name + ' Lv ' + w.lv}</span>`).join('') +
    p.passives.map(q => `<span class="slot">${PASSIVES[q.id].icon} ${PASSIVES[q.id].name} Lv ${q.lv}</span>`).join('');
}

import { WEAPONS, PASSIVES, evoInfo } from '../data/tables.js';
import { iconHTML } from '../data/icons.js';

export function buildHTML(p) {
  return p.weapons.map(w => `<span class="slot ${w.evo ? 'evo' : ''}">${w.evo ? iconHTML(evoInfo(w).icon) + ' ' + evoInfo(w).name : iconHTML(WEAPONS[w.id].icon) + ' ' + WEAPONS[w.id].name + ' Lv ' + w.lv}</span>`).join('') +
    p.passives.map(q => `<span class="slot">${iconHTML(PASSIVES[q.id].icon)} ${PASSIVES[q.id].name} Lv ${q.lv}</span>`).join('');
}

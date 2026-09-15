import { CHEST_TIERS } from '../data/tables.js';
import { iconHTML } from '../data/icons.js';

// Chest-open reveal: a card that spins (pure CSS transform animation) while
// its color cycles through the tiers at a decelerating rate — a classic
// slot-machine "landing" reveal — then settles on the tier actually rolled
// and reveals what was actually drawn. Purely cosmetic: the reward itself
// was already decided synchronously in growth.js's openChest() by the time
// this plays, same as the existing fx/banner — this never blocks or
// represents real game state.
const CYCLE_COLORS = CHEST_TIERS.slice(1).map(t => t.color);

// items: [{icon, name}] — one entry for a weapon evolution, up to `tier`
// entries for a normal multi-skill chest reward. Icon only (no name text):
// the existing banner already announces names, this card is the visual hit.
export function showChestCard(tier, items = []) {
  const el = document.createElement('div');
  el.className = 'chestcard';
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('spin'));

  const finalColor = (CHEST_TIERS[tier] || CHEST_TIERS[1]).color;
  let i = 0, delay = 55;
  const tick = () => {
    el.style.setProperty('--cc', CYCLE_COLORS[i % CYCLE_COLORS.length]);
    i++;
    delay *= 1.18;
    if (delay < 550) setTimeout(tick, delay);
    else {
      el.style.setProperty('--cc', finalColor);
      el.classList.add('settled');
      el.innerHTML = `<div class="items${items.length > 1 ? ' many' : ''}">
        ${items.map(it => `<span class="itemIco">${iconHTML(it.icon)}</span>`).join('')}</div>`;
      setTimeout(() => el.remove(), 1500);
    }
  };
  tick();
}

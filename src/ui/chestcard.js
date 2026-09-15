import { CHEST_TIERS } from '../data/tables.js';

// Chest-open reveal: a card that spins (pure CSS transform animation) while
// its color cycles through the tiers at a decelerating rate — a classic
// slot-machine "landing" reveal — then settles on the tier actually rolled.
// Purely cosmetic: the reward itself was already decided synchronously in
// growth.js's openChest() by the time this plays, same as the existing
// fx/banner — this never blocks or represents real game state.
const CYCLE_COLORS = CHEST_TIERS.slice(1).map(t => t.color);

export function showChestCard(tier) {
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
      setTimeout(() => el.remove(), 750);
    }
  };
  tick();
}

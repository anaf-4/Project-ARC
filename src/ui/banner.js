import { $ } from '../core/utils.js';

let bannerTimer = 0;
export function banner(text, kind) {
  const el = $('banner'); el.textContent = text; el.className = 'on ' + (kind || 'good');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { el.className = kind || 'good'; }, kind === 'evo' ? 3600 : 2600);
}

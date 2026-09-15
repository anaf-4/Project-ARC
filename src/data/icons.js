// Weapon/passive/evolution icon art. Replaces the previous emoji-character
// icons (which rendered inconsistently or broken depending on whether the
// platform happened to have a matching system emoji font — see the
// Noto Color Emoji fix elsewhere for the same underlying class of problem)
// with a bundled, consistent icon set instead: SVGs from game-icons.net
// (CC BY 3.0 — https://creativecommons.org/licenses/by/3.0/), recolored per
// tier (aether cyan = weapons, gold = evolutions, violet = passives, ember =
// permanent meta upgrades) to match this game's own palette. Credit: icons
// by Lorc, Delapouite, Skoll and Willdabeast, available on game-icons.net.
import weapon_blade from '../assets/icons/weapon_blade.svg';
import weapon_rail from '../assets/icons/weapon_rail.svg';
import weapon_wand from '../assets/icons/weapon_wand.svg';
import weapon_fireball from '../assets/icons/weapon_fireball.svg';
import weapon_orbit from '../assets/icons/weapon_orbit.svg';
import weapon_aura from '../assets/icons/weapon_aura.svg';
import weapon_boomerang from '../assets/icons/weapon_boomerang.svg';
import weapon_thunder from '../assets/icons/weapon_thunder.svg';
import weapon_trap from '../assets/icons/weapon_trap.svg';
import evo_blade from '../assets/icons/evo_blade.svg';
import evo_rail from '../assets/icons/evo_rail.svg';
import evo_wand from '../assets/icons/evo_wand.svg';
import evo_fireball from '../assets/icons/evo_fireball.svg';
import evo_orbit from '../assets/icons/evo_orbit.svg';
import evo_aura from '../assets/icons/evo_aura.svg';
import evo_boomerang from '../assets/icons/evo_boomerang.svg';
import evo_thunder from '../assets/icons/evo_thunder.svg';
import evo_trap from '../assets/icons/evo_trap.svg';
import p_heart from '../assets/icons/p_heart.svg';
import p_scope from '../assets/icons/p_scope.svg';
import p_book from '../assets/icons/p_book.svg';
import p_catalyst from '../assets/icons/p_catalyst.svg';
import p_boots from '../assets/icons/p_boots.svg';
import p_regen from '../assets/icons/p_regen.svg';
import p_magazine from '../assets/icons/p_magazine.svg';
import p_magnet from '../assets/icons/p_magnet.svg';
import p_rune from '../assets/icons/p_rune.svg';
import p_guard from '../assets/icons/p_guard.svg';
import m_hp from '../assets/icons/m_hp.svg';
import m_might from '../assets/icons/m_might.svg';
import m_swift from '../assets/icons/m_swift.svg';
import m_greed from '../assets/icons/m_greed.svg';
import m_grip from '../assets/icons/m_grip.svg';
import m_medkit from '../assets/icons/m_medkit.svg';
import m_reroll from '../assets/icons/m_reroll.svg';

export const ICONS = {
  weapon_blade, weapon_rail, weapon_wand, weapon_fireball, weapon_orbit, weapon_aura, weapon_boomerang, weapon_thunder, weapon_trap,
  evo_blade, evo_rail, evo_wand, evo_fireball, evo_orbit, evo_aura, evo_boomerang, evo_thunder, evo_trap,
  p_heart, p_scope, p_book, p_catalyst, p_boots, p_regen, p_magazine, p_magnet, p_rune, p_guard,
  m_hp, m_might, m_swift, m_greed, m_grip, m_medkit, m_reroll,
};

// Preloaded <img> elements for Canvas drawImage() usage (render.js's HUD).
const images = {};
for (const [key, url] of Object.entries(ICONS)) {
  const img = new Image();
  img.src = url;
  images[key] = img;
}
export function drawIcon(ctx, key, cx, cy, size) {
  const img = images[key];
  if (img && img.complete && img.naturalWidth) ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
}

// For DOM usage — takes either one of the keys above (renders the bundled
// icon) or a plain string (a literal character like '🧪'/'◆' used by
// growth.js's non-weapon/passive bonus options, passed straight through).
export function iconHTML(key) {
  const url = ICONS[key];
  return url ? `<img class="ico" src="${url}" alt="">` : key;
}

import { WEAPONS, ETYPES, BOSSES, CLASSES } from './tables.js';

function numericKeys(obj) {
  const out = [];
  for (const k in obj) if (typeof obj[k] === 'number') out.push(k);
  return out;
}
function pickNumeric(obj) {
  const out = {};
  for (const k of numericKeys(obj)) out[k] = obj[k];
  return out;
}
function isPlainNumber(v) { return typeof v === 'number' && Number.isFinite(v); }

// Returns the current live values in a shape the editor UI can render
// inputs from, and that applyLiveOverrides()/validateOverrides() below
// both understand. Walking each entry's own keys and keeping only the
// ones that are already plain numbers means adding a new numeric field to
// tables.js later needs no matching change here or in the editor UI.
export function getEditableSchema() {
  const weapons = {};
  for (const id in WEAPONS) {
    const w = WEAPONS[id];
    weapons[id] = {
      lv: w.lv.map(pickNumeric),
      evoS: pickNumeric(w.evoS),
      altEvos: (w.altEvos || []).map(a => ({ evoS: pickNumeric(a.evoS) })),
    };
  }
  const enemies = {};
  for (const id in ETYPES) enemies[id] = pickNumeric(ETYPES[id]);
  const bosses = BOSSES.map(pickNumeric);
  const classes = {};
  for (const id in CLASSES) classes[id] = pickNumeric(CLASSES[id]);
  return { weapons, enemies, bosses, classes };
}

// Mutates WEAPONS/ETYPES/BOSSES/CLASSES IN PLACE so every existing
// consumer (weapons.js, director.js, render.js, GameRoom.js, ...) sees the
// new values automatically, exactly as if tables.js had been hand-edited.
// Unknown ids/fields and non-number values are silently skipped — this
// function is the last line of defense against a stale/malformed override
// silently corrupting a value; validateOverrides() below is the first
// line of defense (used by the HTTP layer to reject loudly instead).
export function applyLiveOverrides(overrides) {
  if (!overrides || typeof overrides !== 'object') return;
  if (overrides.weapons) for (const id in overrides.weapons) {
    const w = WEAPONS[id]; if (!w) continue;
    const o = overrides.weapons[id];
    if (o.lv) for (const i in o.lv) {
      const row = w.lv[i]; if (!row) continue;
      for (const k in o.lv[i]) if (k in row && isPlainNumber(o.lv[i][k])) row[k] = o.lv[i][k];
    }
    if (o.evoS) for (const k in o.evoS) if (k in w.evoS && isPlainNumber(o.evoS[k])) w.evoS[k] = o.evoS[k];
    if (o.altEvos && w.altEvos) for (const i in o.altEvos) {
      const a = w.altEvos[i]; if (!a || !o.altEvos[i].evoS) continue;
      for (const k in o.altEvos[i].evoS) if (k in a.evoS && isPlainNumber(o.altEvos[i].evoS[k])) a.evoS[k] = o.altEvos[i].evoS[k];
    }
  }
  if (overrides.enemies) for (const id in overrides.enemies) {
    const e = ETYPES[id]; if (!e) continue;
    for (const k in overrides.enemies[id]) if (k in e && isPlainNumber(overrides.enemies[id][k])) e[k] = overrides.enemies[id][k];
  }
  if (overrides.bosses) for (const i in overrides.bosses) {
    const b = BOSSES[i]; if (!b) continue;
    for (const k in overrides.bosses[i]) if (k in b && isPlainNumber(overrides.bosses[i][k])) b[k] = overrides.bosses[i][k];
  }
  if (overrides.classes) for (const id in overrides.classes) {
    const c = CLASSES[id]; if (!c) continue;
    for (const k in overrides.classes[id]) if (k in c && isPlainNumber(overrides.classes[id][k])) c[k] = overrides.classes[id][k];
  }
}

// Used by the HTTP layer (server/configRoutes.js) to reject a bad payload
// with a 400 instead of having applyLiveOverrides() quietly ignore it.
export function validateOverrides(overrides) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return 'overrides must be an object';
  const allowedTop = ['weapons', 'enemies', 'bosses', 'classes'];
  for (const k in overrides) if (!allowedTop.includes(k)) return `unknown section: ${k}`;
  if (overrides.weapons) for (const id in overrides.weapons) if (!WEAPONS[id]) return `unknown weapon: ${id}`;
  if (overrides.enemies) for (const id in overrides.enemies) if (!ETYPES[id]) return `unknown enemy: ${id}`;
  if (overrides.bosses) for (const i in overrides.bosses) if (!BOSSES[i]) return `unknown boss index: ${i}`;
  if (overrides.classes) for (const id in overrides.classes) if (!CLASSES[id]) return `unknown class: ${id}`;
  return null;
}

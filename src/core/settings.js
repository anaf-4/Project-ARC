// User preferences: fps cap, volume, keybinds. Persisted to localStorage,
// same try/catch-swallow convention as core/meta.js (Electron file:// /
// private-browsing localStorage access can throw; fall back to session-only).
const KEY = 'arc-settings';

export const DEFAULT_KEYBINDS = {
  moveUp: 'KeyW', moveDown: 'KeyS', moveLeft: 'KeyA', moveRight: 'KeyD',
  pick1: 'Digit1', pick2: 'Digit2', pick3: 'Digit3',
  reroll: 'KeyR', pause: 'KeyP', dash: 'Space',
};
// Order + Korean labels for the settings screen.
export const KEYBIND_ACTIONS = [
  ['moveUp', '위로 이동'], ['moveDown', '아래로 이동'], ['moveLeft', '왼쪽 이동'], ['moveRight', '오른쪽 이동'],
  ['pick1', '강화 선택 1'], ['pick2', '강화 선택 2'], ['pick3', '강화 선택 3'],
  ['reroll', '다시 뽑기'], ['pause', '일시정지'], ['dash', '대시'],
];
export const FPS_OPTIONS = [144, 165, 180, 200, 240];

const defaults = () => ({
  fps: 144,
  vol: { master: 0.8, music: 0.5, sfx: 0.8 },
  keys: { ...DEFAULT_KEYBINDS },
});

let settings = defaults();

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      settings = { ...defaults(), ...s, vol: { ...defaults().vol, ...(s.vol || {}) }, keys: { ...DEFAULT_KEYBINDS, ...(s.keys || {}) } };
    }
  } catch (e) { /* 저장소 없음: 세션 내 유지 */ }
  return settings;
}
export function getSettings() { return settings; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* 무시 */ } }

export function setFps(v) { settings.fps = v; save(); }
export function setVolume(bus, v) { settings.vol[bus] = v; save(); }
export function setKeybind(action, code) { settings.keys[action] = code; save(); }
export function resetKeybinds() { settings.keys = { ...DEFAULT_KEYBINDS }; save(); }

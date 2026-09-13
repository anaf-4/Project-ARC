import { $ } from '../core/utils.js';
import { getSettings, setFps, setVolume, setKeybind, resetKeybinds, FPS_OPTIONS, KEYBIND_ACTIONS } from '../core/settings.js';
import { setMasterVolume, setMusicVolume, setSfxVolume } from '../core/audio.js';
import { setCapturingKeybind } from '../game/input.js';

const VOL_SETTERS = { master: setMasterVolume, music: setMusicVolume, sfx: setSfxVolume };

function keyLabel(code) {
  if (!code) return '-';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const arrows = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  if (arrows[code]) return arrows[code];
  if (code === 'Escape') return 'Esc';
  if (code === 'Space') return 'Space';
  return code;
}

function renderFps() {
  const cur = getSettings().fps;
  $('fpsSeg').innerHTML = FPS_OPTIONS.map(v => `<button data-fps="${v}" aria-pressed="${v === cur}">${v}</button>`).join('');
}
function renderVolumes() {
  const vol = getSettings().vol;
  for (const bus of ['master', 'music', 'sfx']) {
    const pct = Math.round(vol[bus] * 100);
    $('vol' + bus[0].toUpperCase() + bus.slice(1)).value = pct;
    $('vol' + bus[0].toUpperCase() + bus.slice(1) + 'N').textContent = pct;
  }
}
function renderKeybinds() {
  const keys = getSettings().keys;
  $('keybindList').innerHTML = KEYBIND_ACTIONS.map(([action, label]) => `
    <div class="kbrow"><span>${label}</span><button class="kbbtn" data-action="${action}">${keyLabel(keys[action])}</button></div>`).join('');
}
export function renderSettings() { renderFps(); renderVolumes(); renderKeybinds(); }

$('fpsSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  setFps(+b.dataset.fps); renderFps();
});

for (const bus of ['master', 'music', 'sfx']) {
  const id = 'vol' + bus[0].toUpperCase() + bus.slice(1);
  $(id).addEventListener('input', e => {
    const v = +e.target.value / 100;
    setVolume(bus, v);
    VOL_SETTERS[bus](v);
    $(id + 'N').textContent = e.target.value;
  });
}

let capturingAction = null;
$('keybindList').addEventListener('click', e => {
  const b = e.target.closest('.kbbtn'); if (!b || capturingAction) return;
  capturingAction = b.dataset.action;
  setCapturingKeybind(true);
  b.textContent = '키 입력...'; b.classList.add('waiting');
  const onKey = (ev) => {
    ev.preventDefault();
    if (ev.code !== 'Escape') setKeybind(capturingAction, ev.code);
    capturingAction = null;
    setCapturingKeybind(false);
    window.removeEventListener('keydown', onKey, true);
    renderKeybinds();
  };
  // Capture phase so this always sees the key before anything else does.
  window.addEventListener('keydown', onKey, true);
});
$('resetKeysBtn').addEventListener('click', () => { resetKeybinds(); renderKeybinds(); });

function openSettings() { renderSettings(); $('settings').classList.add('on'); }
$('settingsBtn').addEventListener('click', openSettings);
// Reachable mid-run too (solo pause and the multiplayer "check my build"
// overlay both use the same #pause modal — see ui/pause.js), not just from
// the main menu before a game starts. Settings and pause share a z-index,
// but #settings comes later in the DOM so it paints on top without needing
// to hide #pause first; closing it just reveals pause again underneath.
$('pauseSettingsBtn').addEventListener('click', openSettings);
$('closeSettingsBtn').addEventListener('click', () => { $('settings').classList.remove('on'); });

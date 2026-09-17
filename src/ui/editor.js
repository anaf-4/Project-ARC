import { $ } from '../core/utils.js';
import { getEditableSchema, applyLiveOverrides } from '../data/liveConfig.js';
import { CONFIG_URL } from '../core/serverUrl.js';
import { banner } from './banner.js';

// Captured the first time the editor opens this session — used by
// "초기화" to revert whatever's been edited THIS session back to the
// baseline that was in effect when the editor was first opened (which may
// already include a server-synced value from boot — that's intentional:
// resetting should undo your own in-progress edits, not erase a
// legitimately-synced balance value that predates them).
let snapshot = null;
// Accumulated edits since the editor first opened, in the same shape
// applyLiveOverrides()/validateOverrides() expect — this is exactly what
// gets POSTed on "동기화".
let pending = {};

function mergeIn(path, value) {
  let node = pending;
  for (let i = 0; i < path.length - 1; i++) { node[path[i]] = node[path[i]] || {}; node = node[path[i]]; }
  node[path[path.length - 1]] = value;
}

function inputRow(label, value, path) {
  return `<label class="edrow"><span>${label}</span>
    <input type="number" step="any" value="${value}" data-path="${path.join('.')}"></label>`;
}
function weaponSection(id, w) {
  const rows = [];
  w.lv.forEach((row, i) => { for (const k in row) rows.push(inputRow(`Lv${i + 1} ${k}`, row[k], ['weapons', id, 'lv', i, k])); });
  for (const k in w.evoS) rows.push(inputRow(`진화 ${k}`, w.evoS[k], ['weapons', id, 'evoS', k]));
  w.altEvos.forEach((a, i) => { for (const k in a.evoS) rows.push(inputRow(`대체진화${i + 1} ${k}`, a.evoS[k], ['weapons', id, 'altEvos', i, 'evoS', k])); });
  return `<details><summary>${id}</summary>${rows.join('')}</details>`;
}
function flatSection(id, obj, section) {
  const rows = []; for (const k in obj) rows.push(inputRow(k, obj[k], [section, id, k]));
  return `<details><summary>${id}</summary>${rows.join('')}</details>`;
}

function render() {
  const s = getEditableSchema(); // current live values, reflecting any edits already made this session
  $('edWeapons').innerHTML = Object.entries(s.weapons).map(([id, w]) => weaponSection(id, w)).join('');
  $('edEnemies').innerHTML = Object.entries(s.enemies).map(([id, e]) => flatSection(id, e, 'enemies')).join('');
  $('edBosses').innerHTML = s.bosses.map((b, i) => flatSection(String(i), b, 'bosses')).join('');
  $('edClasses').innerHTML = Object.entries(s.classes).map(([id, c]) => flatSection(id, c, 'classes')).join('');
}

export function openEditor() {
  if (!snapshot) snapshot = getEditableSchema();
  render();
  $('editor').classList.add('on');
}
function closeEditor() { $('editor').classList.remove('on'); }

$('editor').addEventListener('input', e => {
  const input = e.target.closest('input[data-path]'); if (!input) return;
  const value = parseFloat(input.value); if (Number.isNaN(value)) return;
  mergeIn(input.dataset.path.split('.'), value);
  applyLiveOverrides(pending);
});
$('edCloseBtn').addEventListener('click', closeEditor);
$('edResetBtn').addEventListener('click', () => {
  if (snapshot) applyLiveOverrides(snapshot);
  pending = {};
  render();
});
$('edSyncBtn').addEventListener('click', async () => {
  const pw = $('edPassword').value;
  if (!pw) { banner('비밀번호를 입력하세요', 'danger'); return; }
  try {
    const res = await fetch(CONFIG_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-editor-password': pw },
      body: JSON.stringify(pending),
    });
    if (res.status === 401) { banner('비밀번호가 틀렸습니다', 'danger'); return; }
    if (!res.ok) { banner('동기화 실패: ' + res.status, 'danger'); return; }
    const result = await res.json();
    banner(result.committed ? '동기화 완료' : '적용은 됐지만 GitHub 저장 실패 — 서버 재시작 시 사라질 수 있음', result.committed ? 'good' : 'danger');
  } catch (e) {
    banner('동기화 실패: ' + e.message, 'danger');
  }
});

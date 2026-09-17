# Live Balance Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A hidden, developer-only in-game editor for tuning weapon/enemy/boss/character-base numeric stats live, with a "동기화" action that pushes edits to a GitHub-branch-backed store so both the multiplayer server and offline-capable solo clients pick them up without a new release.

**Architecture:** `src/data/liveConfig.js` mutates the existing `tables.js` exports (`WEAPONS`/`ETYPES`/`BOSSES`/`CLASSES`) in place, so every existing consumer sees new values with zero changes elsewhere. The server persists synced overrides to a dedicated `live-config` git branch (via GitHub's Contents API) and re-applies them on every boot; it also serves them over `GET /config` for solo clients to fetch at startup. The editor is a hidden modal (`Ctrl+Shift+E`) that edits locally for instant preview and POSTs the accumulated diff to `POST /config` (password-gated) to sync.

**Tech Stack:** Vanilla JS/ESM (existing stack — no new dependencies), Node's built-in `fetch`/`node:test`, Express (already a dependency) for the two new HTTP routes, GitHub REST Contents API for durable storage.

**Spec:** `docs/superpowers/specs/2026-09-16-live-balance-editor-design.md`

## Global Constraints

- Scope is WEAPONS, ETYPES, BOSSES, CLASSES only — never touch PASSIVES, META, or director.js's difficulty-curve formulas (explicitly out of scope per the spec; they're JS closures/magic numbers, not plain data).
- `applyLiveOverrides()` must mutate the *same* object references `tables.js` already exports — never replace `WEAPONS`/`ETYPES`/`BOSSES`/`CLASSES` with new objects, or every existing consumer holding the old reference silently stops seeing updates.
- Only numeric (`typeof === 'number'` and finite) leaf values are ever read or written by the schema/merge/validate functions — string/boolean/array-of-non-number fields (name, color, shape, `final`, `ranged`, `zone`, `guaranteedCrit`, `melee`, `explosive`, `pair`, `comboWith`, icon/desc/evo* text fields) are never exposed to the editor and never mutated.
- The `live-config` git branch is dedicated storage, never the branch Render deploys from — a sync commit must never be able to trigger a real server redeploy.
- `POST /config` fails closed: if `EDITOR_PASSWORD` isn't set in the environment, every POST is rejected (401), never silently accepted.
- Missing `GITHUB_TOKEN` must not crash a sync — it applies in-memory and reports `commitError` instead of throwing.

---

### Task 1: `src/data/liveConfig.js` — schema + merge/validate (pure logic)

**Files:**
- Create: `src/data/liveConfig.js`
- Test: `src/data/liveConfig.test.js`

**Interfaces:**
- Consumes: `WEAPONS`, `ETYPES`, `BOSSES`, `CLASSES` from `./tables.js` (already exported).
- Produces (used by every later task):
  - `getEditableSchema(): { weapons: { [id]: { lv: [{[key:string]: number}], evoS: {[key:string]: number}, altEvos: [{ evoS: {[key:string]: number} }] } }, enemies: { [id]: {[key:string]: number} }, bosses: [{[key:string]: number}], classes: { [id]: {[key:string]: number} } }`
  - `applyLiveOverrides(overrides: object): void` — mutates the live tables in place.
  - `validateOverrides(overrides: object): string | null` — returns an error message string, or `null` if valid.

- [ ] **Step 1: Write the failing tests**

Create `src/data/liveConfig.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, ETYPES, BOSSES, CLASSES } from './tables.js';
import { getEditableSchema, applyLiveOverrides, validateOverrides } from './liveConfig.js';

test('getEditableSchema exposes only numeric fields for a known weapon', () => {
  const schema = getEditableSchema();
  assert.equal(schema.weapons.blade.lv.length, 5);
  assert.equal(schema.weapons.blade.lv[0].dmg, 14);
  assert.equal(schema.weapons.blade.evoS.dmg, 60);
  assert.ok(!('name' in schema.weapons.blade)); // non-numeric top-level fields never appear
  assert.ok(!('shape' in schema.enemies.slime)); // string field excluded
  assert.equal(schema.enemies.slime.hp, 9);
  assert.equal(schema.bosses[0].hp, 1700);
  assert.equal(schema.classes.vanguard.hp, 150);
});

test('getEditableSchema includes altEvos for weapons that have them', () => {
  const schema = getEditableSchema();
  assert.equal(schema.weapons.wand.altEvos.length, 1);
  assert.equal(schema.weapons.wand.altEvos[0].evoS.dmg, 70);
  assert.equal(schema.weapons.blade.altEvos.length, 0); // blade has no altEvos
});

test('applyLiveOverrides mutates the live WEAPONS table in place, by lv index', () => {
  const before = WEAPONS.blade.lv[0].dmg;
  applyLiveOverrides({ weapons: { blade: { lv: { 0: { dmg: 999 } } } } });
  assert.equal(WEAPONS.blade.lv[0].dmg, 999);
  WEAPONS.blade.lv[0].dmg = before; // restore so later tests/files see defaults
});

test('applyLiveOverrides updates evoS and an altEvos evoS field', () => {
  const beforeEvo = WEAPONS.blade.evoS.dmg, beforeAlt = WEAPONS.wand.altEvos[0].evoS.dmg;
  applyLiveOverrides({ weapons: { blade: { evoS: { dmg: 500 } }, wand: { altEvos: { 0: { evoS: { dmg: 111 } } } } } });
  assert.equal(WEAPONS.blade.evoS.dmg, 500);
  assert.equal(WEAPONS.wand.altEvos[0].evoS.dmg, 111);
  WEAPONS.blade.evoS.dmg = beforeEvo; WEAPONS.wand.altEvos[0].evoS.dmg = beforeAlt;
});

test('applyLiveOverrides updates enemies, bosses (by array index) and classes', () => {
  const beforeHp = ETYPES.slime.hp, beforeBossHp = BOSSES[0].hp, beforeClassHp = CLASSES.vanguard.hp;
  applyLiveOverrides({ enemies: { slime: { hp: 12345 } }, bosses: { 0: { hp: 5000 } }, classes: { vanguard: { hp: 999 } } });
  assert.equal(ETYPES.slime.hp, 12345);
  assert.equal(BOSSES[0].hp, 5000);
  assert.equal(CLASSES.vanguard.hp, 999);
  ETYPES.slime.hp = beforeHp; BOSSES[0].hp = beforeBossHp; CLASSES.vanguard.hp = beforeClassHp;
});

test('applyLiveOverrides ignores unknown ids and non-numeric values', () => {
  const before = ETYPES.slime.hp;
  applyLiveOverrides({ enemies: { slime: { hp: 'not a number' }, madeup_enemy: { hp: 1 } } });
  assert.equal(ETYPES.slime.hp, before);
});

test('applyLiveOverrides silently ignores a top-level section it does not recognize', () => {
  // applyLiveOverrides itself doesn't need to reject bad input the way
  // validateOverrides does (that's the HTTP layer's job) — it just must
  // never throw and never touch anything real.
  assert.doesNotThrow(() => applyLiveOverrides({ made_up_section: { x: 1 } }));
});

test('validateOverrides accepts a well-formed override', () => {
  assert.equal(validateOverrides({ classes: { vanguard: { hp: 200 } } }), null);
});

test('validateOverrides rejects an unknown top-level section', () => {
  assert.equal(validateOverrides({ made_up_section: {} }), 'unknown section: made_up_section');
});

test('validateOverrides rejects an unknown id within a known section', () => {
  assert.equal(validateOverrides({ weapons: { not_a_real_weapon: {} } }), 'unknown weapon: not_a_real_weapon');
  assert.equal(validateOverrides({ enemies: { not_a_real_enemy: {} } }), 'unknown enemy: not_a_real_enemy');
  assert.equal(validateOverrides({ classes: { not_a_real_class: {} } }), 'unknown class: not_a_real_class');
  assert.equal(validateOverrides({ bosses: { 99: {} } }), 'unknown boss index: 99');
});

test('validateOverrides rejects a non-object', () => {
  assert.equal(validateOverrides(null), 'overrides must be an object');
  assert.equal(validateOverrides('nope'), 'overrides must be an object');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/data/liveConfig.test.js`
Expected: FAIL — `Cannot find module './liveConfig.js'` (or similar import error), since the file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/data/liveConfig.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/data/liveConfig.test.js`
Expected: PASS, all 10 tests green.

- [ ] **Step 5: Run the full existing suite to confirm no regression**

Run: `node --test "src/**/*.test.js" "server/**/*.test.js"`
Expected: all previously-passing tests (15 before this task) still pass, plus the 10 new ones (25 total).

- [ ] **Step 6: Commit**

```bash
git add src/data/liveConfig.js src/data/liveConfig.test.js
git commit -m "Add live-balance-editor schema/merge/validate layer"
```

---

### Task 2: `server/liveConfigStore.js` — GitHub-backed store

**Files:**
- Create: `server/liveConfigStore.js`
- Test: `server/liveConfigStore.test.js`

**Interfaces:**
- Consumes: `applyLiveOverrides`, `validateOverrides` from `../src/data/liveConfig.js` (Task 1).
- Produces (used by Task 3): `createLiveConfigStore({ repo?, branch?, githubToken?, fetchImpl? }) => { boot(): Promise<void>, getOverrides(): object, setOverrides(overrides: object): Promise<{ committed: boolean, commitError: string|null }> }`

- [ ] **Step 1: Write the failing tests**

Create `server/liveConfigStore.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveConfigStore } from './liveConfigStore.js';
import { ETYPES } from '../src/data/tables.js';

function stubFetch(handler) { return async (url, opts) => handler(url, opts); }

test('boot() fetches from the raw GitHub URL and applies a valid config', async () => {
  const before = ETYPES.slime.hp;
  const store = createLiveConfigStore({
    fetchImpl: stubFetch(async (url) => {
      assert.match(url, /raw\.githubusercontent\.com\/anaf-4\/Project-ARC\/live-config\/live-config\.json/);
      return { ok: true, json: async () => ({ enemies: { slime: { hp: 12345 } } }) };
    }),
  });
  await store.boot();
  assert.equal(ETYPES.slime.hp, 12345);
  assert.deepEqual(store.getOverrides(), { enemies: { slime: { hp: 12345 } } });
  ETYPES.slime.hp = before;
});

test('boot() falls back to empty overrides on a 404 (first-ever run, branch does not exist yet)', async () => {
  const store = createLiveConfigStore({ fetchImpl: stubFetch(async () => ({ ok: false, status: 404 })) });
  await store.boot();
  assert.deepEqual(store.getOverrides(), {});
});

test('boot() falls back to empty overrides on a network error, without throwing', async () => {
  const store = createLiveConfigStore({ fetchImpl: stubFetch(async () => { throw new Error('offline'); }) });
  await assert.doesNotReject(() => store.boot());
  assert.deepEqual(store.getOverrides(), {});
});

test('boot() ignores a fetched config that fails validation (unknown id)', async () => {
  const store = createLiveConfigStore({
    fetchImpl: stubFetch(async () => ({ ok: true, json: async () => ({ enemies: { not_a_real_enemy: { hp: 1 } } }) })),
  });
  await store.boot();
  assert.deepEqual(store.getOverrides(), {});
});

test('setOverrides applies in-memory immediately and reports commitError when no GITHUB_TOKEN is configured', async () => {
  const before = ETYPES.slime.hp;
  const store = createLiveConfigStore({ githubToken: undefined, fetchImpl: stubFetch(async () => { throw new Error('must not be called'); }) });
  const result = await store.setOverrides({ enemies: { slime: { hp: 777 } } });
  assert.equal(ETYPES.slime.hp, 777);
  assert.deepEqual(result, { committed: false, commitError: 'GITHUB_TOKEN not configured' });
  ETYPES.slime.hp = before;
});

test('setOverrides GETs the current sha then PUTs to the Contents API when a token is present', async () => {
  const before = ETYPES.slime.hp;
  const calls = [];
  const store = createLiveConfigStore({
    githubToken: 'fake-token',
    fetchImpl: stubFetch(async (url, opts) => {
      calls.push({ url, method: opts?.method || 'GET' });
      if (!opts?.method) {
        assert.match(url, /api\.github\.com\/repos\/anaf-4\/Project-ARC\/contents\/live-config\.json\?ref=live-config/);
        return { ok: true, json: async () => ({ sha: 'abc123' }) };
      }
      assert.equal(opts.method, 'PUT');
      assert.doesNotMatch(url, /\?ref=/);
      const body = JSON.parse(opts.body);
      assert.equal(body.sha, 'abc123');
      assert.equal(body.branch, 'live-config');
      return { ok: true, json: async () => ({}) };
    }),
  });
  const result = await store.setOverrides({ enemies: { slime: { hp: 55 } } });
  assert.deepEqual(result, { committed: true, commitError: null });
  assert.equal(calls.length, 2);
  ETYPES.slime.hp = before;
});

test('setOverrides reports commitError (but still applies) when the GitHub API rejects the PUT', async () => {
  const before = ETYPES.slime.hp;
  const store = createLiveConfigStore({
    githubToken: 'fake-token',
    fetchImpl: stubFetch(async (url, opts) => {
      if (!opts?.method) return { ok: false, status: 404 }; // no existing file yet
      return { ok: false, status: 403 };
    }),
  });
  const result = await store.setOverrides({ enemies: { slime: { hp: 88 } } });
  assert.equal(ETYPES.slime.hp, 88); // still applied in-memory
  assert.equal(result.committed, false);
  assert.equal(result.commitError, 'GitHub API 403');
  ETYPES.slime.hp = before;
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test server/liveConfigStore.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `server/liveConfigStore.js`:

```js
import { applyLiveOverrides, validateOverrides } from '../src/data/liveConfig.js';

const rawUrl = (repo, branch) => `https://raw.githubusercontent.com/${repo}/${branch}/live-config.json`;
const contentsUrl = (repo, branch) => `https://api.github.com/repos/${repo}/contents/live-config.json?ref=${branch}`;

// fetchImpl defaults to the real global fetch (Node 18+) but is injectable
// so tests never make a real network call.
export function createLiveConfigStore({
  repo = 'anaf-4/Project-ARC',
  branch = 'live-config',
  githubToken = process.env.GITHUB_TOKEN,
  fetchImpl = fetch,
} = {}) {
  let current = {};

  async function boot() {
    try {
      const res = await fetchImpl(rawUrl(repo, branch));
      if (!res.ok) return; // e.g. 404 — the branch/file doesn't exist yet on a fresh repo
      const json = await res.json();
      if (validateOverrides(json)) return; // stale/malformed — ignore rather than half-apply
      current = json;
      applyLiveOverrides(current);
    } catch {
      // offline / GitHub unreachable at boot — keep pure tables.js defaults
    }
  }

  function getOverrides() { return current; }

  // Applies in-memory immediately regardless of GitHub outcome, then
  // best-effort commits to the live-config branch for durability across a
  // future redeploy. The caller (server/configRoutes.js) surfaces
  // commitError to the editor so a durability failure is never silent.
  async function setOverrides(overrides) {
    current = overrides;
    applyLiveOverrides(overrides);
    if (!githubToken) return { committed: false, commitError: 'GITHUB_TOKEN not configured' };
    try {
      let sha;
      const getRes = await fetchImpl(contentsUrl(repo, branch), {
        headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json' },
      });
      if (getRes.ok) { const body = await getRes.json(); sha = body.sha; }
      const putRes = await fetchImpl(contentsUrl(repo, branch).replace(/\?ref=.*$/, ''), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json' },
        body: JSON.stringify({
          message: 'chore(live-config): sync from editor',
          content: Buffer.from(JSON.stringify(overrides, null, 2)).toString('base64'),
          branch,
          ...(sha ? { sha } : {}),
        }),
      });
      if (!putRes.ok) return { committed: false, commitError: `GitHub API ${putRes.status}` };
      return { committed: true, commitError: null };
    } catch (e) {
      return { committed: false, commitError: e.message };
    }
  }

  return { boot, getOverrides, setOverrides };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test server/liveConfigStore.test.js`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Run the full existing suite to confirm no regression**

Run: `node --test "src/**/*.test.js" "server/**/*.test.js"`
Expected: 25 (Task 1) + 7 = 32 tests passing.

- [ ] **Step 6: Commit**

```bash
git add server/liveConfigStore.js server/liveConfigStore.test.js
git commit -m "Add GitHub-branch-backed live config store for the server"
```

---

### Task 3: `server/configRoutes.js` + `server/index.js` wiring

**Files:**
- Create: `server/configRoutes.js`
- Test: `server/configRoutes.test.js`
- Modify: `server/index.js` (add `express.json()` middleware, boot the store, attach the routes)

**Interfaces:**
- Consumes: `validateOverrides` from `../src/data/liveConfig.js` (Task 1); `createLiveConfigStore` from `./liveConfigStore.js` (Task 2) — but `configRoutes.js` itself takes an already-constructed store object (any object shaped like `{ getOverrides(), setOverrides() }`), so it never imports `liveConfigStore.js` directly and can be tested with a stub.
- Produces: `attachConfigRoutes(app: import('express').Express, liveConfig: { getOverrides(): object, setOverrides(o: object): Promise<{committed, commitError}> }): void`

- [ ] **Step 1: Write the failing tests**

Create `server/configRoutes.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { attachConfigRoutes } from './configRoutes.js';

function makeStubStore(initial = {}) {
  let current = initial;
  return {
    getOverrides: () => current,
    setOverrides: async (o) => { current = o; return { committed: true, commitError: null }; },
  };
}

async function startTestServer(store) {
  const app = express();
  app.use(express.json());
  attachConfigRoutes(app, store);
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  return { server, base: `http://localhost:${server.address().port}` };
}

test('GET /config returns the store current overrides with no auth required', async () => {
  const { server, base } = await startTestServer(makeStubStore({ enemies: { slime: { hp: 1 } } }));
  const res = await fetch(`${base}/config`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { enemies: { slime: { hp: 1 } } });
  server.close();
});

test('POST /config is rejected with 401 when EDITOR_PASSWORD is not configured at all', async () => {
  delete process.env.EDITOR_PASSWORD;
  const { server, base } = await startTestServer(makeStubStore());
  const res = await fetch(`${base}/config`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-editor-password': 'anything' }, body: '{}',
  });
  assert.equal(res.status, 401);
  server.close();
});

test('POST /config is rejected with 401 for the wrong password', async () => {
  process.env.EDITOR_PASSWORD = 'correct-horse';
  const { server, base } = await startTestServer(makeStubStore());
  const res = await fetch(`${base}/config`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-editor-password': 'wrong' }, body: '{}',
  });
  assert.equal(res.status, 401);
  server.close();
  delete process.env.EDITOR_PASSWORD;
});

test('POST /config with the correct password and a valid body applies it and echoes the store result', async () => {
  process.env.EDITOR_PASSWORD = 'correct-horse';
  const store = makeStubStore();
  const { server, base } = await startTestServer(store);
  const res = await fetch(`${base}/config`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-editor-password': 'correct-horse' },
    body: JSON.stringify({ enemies: { slime: { hp: 42 } } }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { committed: true, commitError: null });
  assert.deepEqual(store.getOverrides(), { enemies: { slime: { hp: 42 } } });
  server.close();
  delete process.env.EDITOR_PASSWORD;
});

test('POST /config rejects an invalid body (unknown enemy id) with 400 and never calls setOverrides', async () => {
  process.env.EDITOR_PASSWORD = 'correct-horse';
  let setOverridesCalled = false;
  const store = { getOverrides: () => ({}), setOverrides: async () => { setOverridesCalled = true; return { committed: true, commitError: null }; } };
  const { server, base } = await startTestServer(store);
  const res = await fetch(`${base}/config`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-editor-password': 'correct-horse' },
    body: JSON.stringify({ enemies: { not_a_real_enemy: { hp: 1 } } }),
  });
  assert.equal(res.status, 400);
  assert.equal(setOverridesCalled, false);
  server.close();
  delete process.env.EDITOR_PASSWORD;
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test server/configRoutes.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `server/configRoutes.js`:

```js
import { validateOverrides } from '../src/data/liveConfig.js';

// Split out from server/index.js so these two routes are testable via a
// bare Express app + a stub store, without booting a real Colyseus server
// in every test run.
export function attachConfigRoutes(app, liveConfig) {
  app.get('/config', (_req, res) => res.json(liveConfig.getOverrides()));
  app.post('/config', async (req, res) => {
    if (!process.env.EDITOR_PASSWORD || req.get('x-editor-password') !== process.env.EDITOR_PASSWORD) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const err = validateOverrides(req.body);
    if (err) return res.status(400).json({ error: err });
    const result = await liveConfig.setOverrides(req.body);
    res.json(result);
  });
}
```

Modify `server/index.js` to match:

```js
import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'colyseus';
import { GameRoom } from './rooms/GameRoom.js';
import { createLiveConfigStore } from './liveConfigStore.js';
import { attachConfigRoutes } from './configRoutes.js';

const app = express();
app.use(express.json());
app.get('/healthz', (_req, res) => res.send('ok'));

const liveConfig = createLiveConfigStore();
await liveConfig.boot();
attachConfigRoutes(app, liveConfig);

const port = Number(process.env.PORT) || 2567;
const gameServer = new Server({ server: createServer(app) });
gameServer.define('game', GameRoom);

gameServer.listen(port);
console.log(`Project ARC server listening on ${port}`);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test server/configRoutes.test.js`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Run the full existing suite, and sanity-check the real server still boots**

Run: `node --test "src/**/*.test.js" "server/**/*.test.js"`
Expected: 32 (Tasks 1-2) + 5 = 37 tests passing.

Run: `node server/index.js` (let it run ~3s, then Ctrl+C / kill it)
Expected: starts cleanly, logs "Project ARC server listening on 2567" — confirms the top-level `await liveConfig.boot()` doesn't hang or throw even with no `GITHUB_TOKEN`/network oddities in a local dev environment (a boot fetch to the real `live-config` branch may 404 if it doesn't exist yet — that's fine, `boot()` treats a non-ok response as "use defaults", not an error).

- [ ] **Step 6: Commit**

```bash
git add server/configRoutes.js server/configRoutes.test.js server/index.js
git commit -m "Wire GET/POST /config routes onto the multiplayer server"
```

---

### Task 4: Client boot integration — solo/multiplayer clients fetch synced overrides at startup

**Files:**
- Create: `src/core/serverUrl.js`
- Modify: `src/ui/lobby.js:15` (use the shared constant instead of defining its own)
- Modify: `src/main.js` (fetch + apply + cache overrides before the first render)

**Interfaces:**
- Consumes: `applyLiveOverrides` from `./data/liveConfig.js` (Task 1); `SERVER_URL`/`CONFIG_URL` from `./core/serverUrl.js` (this task).
- Produces: nothing new consumed by later tasks — this task is a leaf.

- [ ] **Step 1: Extract the shared server URL constant**

Create `src/core/serverUrl.js`:

```js
// Single source of truth for the multiplayer server's address — used both
// for the Colyseus websocket connection (ui/lobby.js) and for the plain
// HTTP /config endpoint (main.js's boot-time live-balance fetch).
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'ws://localhost:2567';
export const CONFIG_URL = SERVER_URL.replace(/^ws/, 'http') + '/config';
```

Read `src/ui/lobby.js` around its current `SERVER_URL` definition (line 15: ``const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'ws://localhost:2567';``) and replace that line with an import instead:

```js
import { SERVER_URL } from '../core/serverUrl.js';
```

(Remove the old `const SERVER_URL = ...` line entirely — every other use of `SERVER_URL` further down in `lobby.js` stays unchanged, since it's the same name/value.)

- [ ] **Step 2: Add the boot-time fetch to `src/main.js`**

In `src/main.js`, add two imports near the top (alongside the existing `core/settings.js` import):

```js
import { applyLiveOverrides } from './data/liveConfig.js';
import { CONFIG_URL } from './core/serverUrl.js';
```

Add this function definition right after the imports (before `loadSettings();`):

```js
const LIVE_CONFIG_CACHE_KEY = 'arc-live-config';
// Best-effort: try the server once at startup so a synced balance change
// reaches solo players too, without requiring a new release. Never blocks
// longer than the timeout, and always falls back gracefully (cache, then
// pure tables.js defaults) rather than leaving the game half-started.
async function loadLiveConfig() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(CONFIG_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const json = await res.json();
    applyLiveOverrides(json);
    try { localStorage.setItem(LIVE_CONFIG_CACHE_KEY, JSON.stringify(json)); } catch (e) { /* 저장소 없음 */ }
  } catch (e) {
    try {
      const cached = localStorage.getItem(LIVE_CONFIG_CACHE_KEY);
      if (cached) applyLiveOverrides(JSON.parse(cached));
    } catch (e2) { /* 캐시 없음: 기본값 사용 */ }
  }
}
```

Change the line `loadSettings();` to:

```js
loadSettings();
await loadLiveConfig();
```

(Top-level `await` is fine here — `main.js` is loaded as `<script type="module">` in `index.html`, and Vite/all three target runtimes — Electron, Capacitor's WebView, and plain browser — support ESM top-level await natively.)

- [ ] **Step 2: Verify the vite build still succeeds**

Run: `npx vite build`
Expected: succeeds cleanly (this task has no automated test — `main.js` isn't unit-tested anywhere in this repo today, matching the existing convention that browser-entry/DOM-wiring files are verified manually, not via `node --test`; see the manual verification step below instead).

- [ ] **Step 3: Manual verification (packaged-exe + CDP, this project's established pattern for anything DOM/browser-only)**

Build an unsigned `--dir` Electron app for fast iteration:

```bash
npx electron-builder --dir --win
```

Launch it with remote debugging on a free port and connect via a small Node script using the built-in global `WebSocket` (no extra npm package needed):

```bash
"release/win-unpacked/Project ARC.exe" --remote-debugging-port=9800 &
```

Then, using the Chrome DevTools Protocol (`Runtime.evaluate`), confirm:
1. With no `server:dev` running and no cached value in `localStorage`, the game still starts normally (menu renders, no console exceptions) within a couple seconds — proves the fetch failure path degrades gracefully.
2. Start the server locally (`node server/index.js` in a separate terminal) with a temporary `EDITOR_PASSWORD=test` env var, `POST` a small override directly with `curl` (e.g. set `enemies.slime.hp` to an obviously-different number), then relaunch the exe and confirm via `Runtime.evaluate` that `ETYPES.slime.hp` reflects the overridden value on boot (the eval can't import the module directly in the packaged bundle, so instead start a real solo run, let a slime spawn, and read its `hp`/`maxHp` off the live sim object exposed for debugging — or simpler: check `localStorage.getItem('arc-live-config')` reflects the fetched JSON, which directly proves the fetch-and-cache path executed).
3. Kill the local server, relaunch the exe again, and confirm the PREVIOUSLY cached override is still applied (read from `localStorage`) even though the server is now unreachable — proves the offline/cache fallback path.

- [ ] **Step 4: Commit**

```bash
git add src/core/serverUrl.js src/ui/lobby.js src/main.js
git commit -m "Fetch and apply synced live-balance overrides at client boot"
```

---

### Task 5: Hidden editor UI (`Ctrl+Shift+E`)

**Files:**
- Modify: `index.html` (new `#editor` modal markup)
- Modify: `style.css` (new `.edrow`/`#editor`/`#edPassword` rules)
- Create: `src/ui/editor.js`
- Modify: `src/game/input.js` (wire the `Ctrl+Shift+E` shortcut)

**Interfaces:**
- Consumes: `getEditableSchema`, `applyLiveOverrides` from `../data/liveConfig.js` (Task 1); `CONFIG_URL` from `../core/serverUrl.js` (Task 4); `banner` from `./banner.js`; `$` from `../core/utils.js`.
- Produces: `openEditor(): void`, imported by `src/game/input.js`.

- [ ] **Step 1: Add the modal markup to `index.html`**

Add this block right after the existing `</div>` that closes `#settings` (i.e. immediately after the `#settings` modal, before `<div id="banner">`):

```html
<div id="editor" class="modal" role="dialog" aria-modal="true" aria-labelledby="edTitle">
  <div class="box" style="width:min(720px,100%);max-height:86vh;overflow-y:auto">
    <div class="mtitle" id="edTitle" style="font-size:30px">밸런스 에디터</div>
    <div class="panel"><h3>무기</h3><div id="edWeapons"></div></div>
    <div class="panel"><h3>몹</h3><div id="edEnemies"></div></div>
    <div class="panel"><h3>보스</h3><div id="edBosses"></div></div>
    <div class="panel"><h3>캐릭터</h3><div id="edClasses"></div></div>
    <div class="panel">
      <input type="password" id="edPassword" placeholder="동기화 비밀번호" autocomplete="off">
      <div class="btnrow">
        <button class="ghost" id="edResetBtn">초기화</button>
        <button class="cta" id="edSyncBtn">동기화</button>
        <button class="cta" id="edCloseBtn">닫기</button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add editor-specific CSS to `style.css`**

Add near the other modal-adjacent rules (e.g. right after the existing `.volrow` rules):

```css
/* 밸런스 에디터 */
.edrow{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:3px 0;font-size:12px;color:var(--mute)}
.edrow input{width:84px;background:rgba(13,10,31,.6);border:1px solid rgba(239,230,210,.2);border-radius:4px;color:var(--bone);padding:3px 6px;font:inherit}
#editor details{margin-bottom:6px}
#editor summary{cursor:pointer;font-weight:700;color:#6ff3e8;padding:4px 0}
#edPassword{width:100%;margin-bottom:10px;background:rgba(13,10,31,.6);border:1px solid rgba(239,230,210,.2);border-radius:6px;color:var(--bone);padding:8px;font:inherit}
```

- [ ] **Step 3: Write `src/ui/editor.js`**

```js
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
```

- [ ] **Step 4: Wire the `Ctrl+Shift+E` shortcut in `src/game/input.js`**

Add the import near the top (alongside the existing `closeSettings` import):

```js
import { openEditor } from '../ui/editor.js';
```

In the `window.addEventListener('keydown', ...)` handler, add this check right after the existing settings-Escape-close check (same early placement, so it works from the main menu, mid-run, solo, or multiplayer):

```js
  if (e.ctrlKey && e.shiftKey && e.code === 'KeyE') { e.preventDefault(); openEditor(); return; }
```

- [ ] **Step 5: Verify the vite build still succeeds**

Run: `node --test "src/**/*.test.js" "server/**/*.test.js"`
Expected: still 37/37 passing (this task adds no new automated tests — see the manual verification below for why, matching the same reasoning as Task 4).

Run: `npx vite build`
Expected: succeeds cleanly.

- [ ] **Step 6: Manual verification (packaged-exe + CDP)**

Build and launch an unsigned `--dir` exe with `--remote-debugging-port` exactly as in Task 4. Using CDP:

1. Dispatch `Ctrl+Shift+E` (a `keydown` with `ctrlKey: true`, `shiftKey: true`, `code: 'KeyE'`) and confirm `document.getElementById('editor').classList.contains('on')` becomes true.
2. Confirm the 무기/몹/보스/캐릭터 sections rendered at least one `<details>` each with populated `<input>` rows (e.g. `document.querySelectorAll('#edWeapons input').length > 0`).
3. Change one weapon's Lv1 dmg input's value via `Input.dispatchKeyEvent`/`Runtime.evaluate`-driven `value` assignment plus a dispatched `input` event, and confirm via `Runtime.evaluate` that the corresponding live value changed accordingly (can't `import` the module directly from outside in the packaged bundle — instead open a solo run in the SAME session afterward and confirm the weapon's in-game behavior/tooltip reflects the new number, or check the accumulated `pending` object isn't directly inspectable from outside the module scope, so the most reliable check is: re-open the editor after the change and confirm the input still shows the edited value, proving it round-tripped through `getEditableSchema()` reading the mutated live table).
4. Click "초기화" and confirm the input's value reverts to what it showed when the editor first opened this session.
5. Start a local `node server/index.js` (with a temporary `EDITOR_PASSWORD` env var set) in a separate terminal — NOT the real production Render service, to avoid writing to the real `live-config` branch during a manual test — and point `VITE_SERVER_URL` at it for this build (or verify against `ws://localhost:2567`, the default, which already matches a locally-run server with no env var needed). Enter the WRONG password in `#edPassword` and click "동기화"; confirm a `danger`-styled banner appears and the local server's `EDITOR_PASSWORD` check actually ran (visible in the local server's own terminal/logs or via its own response). Then enter the correct password and confirm a success banner appears.
7. Confirm zero console exceptions across the whole sequence.

- [ ] **Step 7: Commit**

```bash
git add index.html style.css src/ui/editor.js src/game/input.js
git commit -m "Add the hidden live-balance editor UI (Ctrl+Shift+E)"
```

---

## Self-review notes (from the plan author, not a task to execute)

- Spec coverage check: shared mutate-in-place module (Task 1), server GitHub-backed store + boot fetch (Task 2), HTTP routes + password gate + validation (Task 3), solo/offline client fetch-and-cache-and-fallback (Task 4), hidden editor UI with local-preview + sync + reset (Task 5) — every component in the spec's "Components" section has a matching task. The spec's "Known limitations" (no retroactive apply to already-spawned entities) is a documented behavior, not a bug to fix, so it has no corresponding task — correct.
- Out-of-scope reminder for whoever picks this up next: passives/META/difficulty-curve editing is explicitly deferred (see spec's Non-goals) — do not expand `getEditableSchema()`/`applyLiveOverrides()` to cover them without first refactoring those systems off of JS-closure `apply()` functions onto plain data, which is real, separate work.

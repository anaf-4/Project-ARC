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

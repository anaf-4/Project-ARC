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

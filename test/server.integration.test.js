'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}
function makeClient(base) {
  let cookie = '';
  return async (url, options = {}) => {
    const response = await fetch(base + url, {
      method: options.method || 'GET',
      headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const body = await response.json().catch(() => ({}));
    return { response, body };
  };
}
async function waitForHealth(base) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { const response = await fetch(`${base}/health`); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Test server did not become healthy.');
}

test('HTTP multiplayer actions remain private and only the creator can delete a lobby', { timeout: 15000 }, async t => {
  const port = await freePort();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dco-test-'));
  const root = path.resolve(__dirname, '..');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_FILE: path.join(tempDir, 'db.json'), COOKIE_SECURE: '0' },
    stdio: 'ignore',
  });
  t.after(async () => {
    if (!child.killed) child.kill('SIGTERM');
    await new Promise(resolve => {
      if (child.exitCode != null) return resolve();
      child.once('exit', resolve);
      setTimeout(resolve, 1500).unref();
    });
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  const base = `http://127.0.0.1:${port}`;
  await waitForHealth(base);
  const alpha = makeClient(base);
  const bravo = makeClient(base);

  let result = await alpha('/api/register', { method: 'POST', body: { username: 'AlphaTest', password: 'password123' } });
  assert.equal(result.response.status, 201);
  result = await bravo('/api/register', { method: 'POST', body: { username: 'BravoTest', password: 'password123' } });
  assert.equal(result.response.status, 201);

  result = await alpha('/api/lobbies', { method: 'POST', body: { name: 'Private League' } });
  const lobbyId = result.body.lobby.id;
  const code = result.body.lobby.code;
  const alphaRevision = result.body.lobby.me.revision;

  result = await bravo('/api/lobbies/join', { method: 'POST', body: { code } });
  const bravoRevision = result.body.lobby.me.revision;

  const [alphaAction, bravoAction] = await Promise.all([
    alpha(`/api/lobbies/${lobbyId}/action`, { method: 'POST', body: { action: 'finance', payload: { sponsor: 'arts', foodPlan: 'standard' }, actionId: 'alpha-finance', expectedRevision: alphaRevision } }),
    bravo(`/api/lobbies/${lobbyId}/action`, { method: 'POST', body: { action: 'finance', payload: { sponsor: 'community', foodPlan: 'basic' }, actionId: 'bravo-finance', expectedRevision: bravoRevision } }),
  ]);
  assert.equal(alphaAction.response.status, 200);
  assert.equal(bravoAction.response.status, 200);

  const alphaView = await alpha(`/api/lobbies/${lobbyId}`);
  const bravoView = await bravo(`/api/lobbies/${lobbyId}`);
  assert.equal(alphaView.body.lobby.me.corps.sponsor, 'arts');
  assert.equal(bravoView.body.lobby.me.corps.sponsor, 'community');
  assert.equal(Object.hasOwn(alphaView.body.lobby.players.find(player => player.username === 'BravoTest'), 'budget'), false);

  const forbidden = await bravo(`/api/lobbies/${lobbyId}`, { method: 'DELETE' });
  assert.equal(forbidden.response.status, 403);
  const deleted = await alpha(`/api/lobbies/${lobbyId}`, { method: 'DELETE' });
  assert.equal(deleted.response.status, 200);
  const gone = await bravo(`/api/lobbies/${lobbyId}`);
  assert.equal(gone.response.status, 404);
});

test('HTTP seasons archive to accounts and the host can open the next year', { timeout: 20000 }, async t => {
  const port = await freePort();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dco-season-test-'));
  const root = path.resolve(__dirname, '..');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_FILE: path.join(tempDir, 'db.json'), COOKIE_SECURE: '0' },
    stdio: 'ignore',
  });
  t.after(async () => {
    if (!child.killed) child.kill('SIGTERM');
    await new Promise(resolve => {
      if (child.exitCode != null) return resolve();
      child.once('exit', resolve);
      setTimeout(resolve, 1500).unref();
    });
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  const base = `http://127.0.0.1:${port}`;
  await waitForHealth(base);
  const alpha = makeClient(base);
  const bravo = makeClient(base);
  await alpha('/api/register', { method: 'POST', body: { username: 'AlphaYears', password: 'password123' } });
  await bravo('/api/register', { method: 'POST', body: { username: 'BravoYears', password: 'password123' } });

  let result = await alpha('/api/lobbies', { method: 'POST', body: { name: 'Long League' } });
  const lobbyId = result.body.lobby.id;
  const code = result.body.lobby.code;
  let alphaRevision = result.body.lobby.me.revision;
  result = await bravo('/api/lobbies/join', { method: 'POST', body: { code } });
  let bravoRevision = result.body.lobby.me.revision;

  result = await alpha(`/api/lobbies/${lobbyId}/action`, { method: 'POST', body: { action: 'quickBuild', payload: {}, actionId: 'alpha-quick', expectedRevision: alphaRevision } });
  alphaRevision = result.body.lobby.me.revision;
  result = await bravo(`/api/lobbies/${lobbyId}/action`, { method: 'POST', body: { action: 'quickBuild', payload: {}, actionId: 'bravo-quick', expectedRevision: bravoRevision } });
  bravoRevision = result.body.lobby.me.revision;

  assert.equal((await alpha(`/api/lobbies/${lobbyId}/ready`, { method: 'POST', body: { ready: true } })).response.status, 200);
  assert.equal((await bravo(`/api/lobbies/${lobbyId}/ready`, { method: 'POST', body: { ready: true } })).response.status, 200);
  result = await alpha(`/api/lobbies/${lobbyId}/start`, { method: 'POST', body: {} });
  assert.equal(result.response.status, 200);

  for (let step = 0; step < 19; step += 1) {
    result = await alpha(`/api/lobbies/${lobbyId}/advance`, { method: 'POST', body: {} });
    assert.equal(result.response.status, 200);
  }
  assert.equal(result.body.lobby.status, 'complete');
  assert.ok(result.body.lobby.latestArchiveId);
  const archiveId = result.body.lobby.latestArchiveId;
  const staffBefore = Object.fromEntries(Object.entries(result.body.lobby.me.corps.staff).map(([role, person]) => [role, person.name]));

  const accountList = await alpha('/api/account/recaps');
  assert.equal(accountList.response.status, 200);
  assert.equal(accountList.body.recaps.length, 1);
  assert.equal(accountList.body.recaps[0].id, archiveId);
  const recap = await alpha(`/api/account/recaps/${archiveId}`);
  assert.equal(recap.response.status, 200);
  assert.equal(recap.body.recap.weeks.length, 10);
  assert.equal(recap.body.myPlayer.scores.length, 10);

  result = await alpha(`/api/lobbies/${lobbyId}/next-season`, { method: 'POST', body: {} });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.lobby.season, 2);
  assert.equal(result.body.lobby.status, 'setup');
  assert.equal(result.body.lobby.history.length, 0);
  assert.deepEqual(Object.fromEntries(Object.entries(result.body.lobby.me.corps.staff).map(([role, person]) => [role, person.name])), staffBefore);
  assert.equal(result.body.lobby.me.checklist.staff, false);

  const bravoAccount = await bravo('/api/account/recaps');
  assert.equal(bravoAccount.body.recaps.length, 1);
});

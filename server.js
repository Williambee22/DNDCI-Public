'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { JsonStore } = require('./storage');
const game = require('./game-engine');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const VOLUME_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const DATA_FILE = process.env.DATA_FILE || path.join(VOLUME_DIR, 'db.json');
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 14);
const COOKIE_SECURE = /^(1|true|yes)$/i.test(String(process.env.COOKIE_SECURE || '0'));
const STARTED_AT = Date.now();
const PUBLIC_DIR = path.join(__dirname, 'public');
const store = new JsonStore(DATA_FILE);
const sseClients = new Map();
const loginAttempts = new Map();
const lobbyLocks = new Map();

let upgradedSavedData = false;
store.data.archives ||= {};
for (const user of Object.values(store.data.users)) {
  if (!Array.isArray(user.archiveIds)) { user.archiveIds = []; upgradedSavedData = true; }
}
for (const lobby of Object.values(store.data.lobbies)) {
  if (game.normalizeLobby(lobby)) upgradedSavedData = true;
  if (lobby.status === 'complete' && lobby.history?.length) {
    if (persistSeasonArchive(lobby)) upgradedSavedData = true;
  }
}
if (upgradedSavedData) store.save();

function healthPayload() {
  return {
    ok: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    storage: process.env.RAILWAY_VOLUME_MOUNT_PATH ? 'railway-volume' : 'local-filesystem',
  };
}

function json(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(body);
}

function parseCookies(req) {
  const output = {};
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) output[key] = decodeURIComponent(value);
  }
  return output;
}

function sessionCookie(token, maxAgeSeconds) {
  const pieces = [
    `dco_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (COOKIE_SECURE) pieces.push('Secure');
  return pieces.join('; ');
}

function currentUser(req) {
  const token = parseCookies(req).dco_session;
  if (!token) return null;
  const session = store.data.sessions[token];
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return null;
  return store.data.users[session.userId] || null;
}

function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) json(res, 401, { error: 'You must log in first.' });
  return user;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('Request body must be valid JSON.')); }
    });
    req.on('error', reject);
  });
}

function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function passwordMatches(password, user) {
  const incoming = Buffer.from(passwordHash(password, user.passwordSalt).hash, 'hex');
  const saved = Buffer.from(user.passwordHash, 'hex');
  return incoming.length === saved.length && crypto.timingSafeEqual(incoming, saved);
}
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  store.data.sessions[token] = { userId, expiresAt };
  store.save();
  return { token, expiresAt };
}
function userSafe(user) { return { id: user.id, username: user.username, createdAt: user.createdAt, recapCount: (user.archiveIds || []).length }; }
function archiveSummary(archive, userId) {
  const player = archive.players?.find(item => item.userId === userId) || null;
  return {
    id: archive.id, lobbyId: archive.lobbyId, lobbyName: archive.lobbyName, lobbyCode: archive.lobbyCode,
    season: archive.season, completedAt: archive.completedAt, champion: archive.champion,
    playerCount: archive.playerIds?.length || 0,
    myResult: player ? { corpsName: player.corpsName, showTitle: player.showTitle, finalScore: player.finalScore, finalPlacement: player.finalPlacement } : null,
  };
}
function persistSeasonArchive(lobby) {
  lobby.archiveIds ||= [];
  const archiveId = `${lobby.id}-season-${lobby.season}`;
  let changed = false;
  if (!store.data.archives[archiveId]) {
    store.data.archives[archiveId] = game.createSeasonArchive(lobby);
    changed = true;
  }
  if (!lobby.archiveIds.includes(archiveId)) { lobby.archiveIds.push(archiveId); changed = true; }
  for (const player of Object.values(lobby.players || {})) {
    const account = store.data.users[player.userId];
    if (!account) continue;
    account.archiveIds ||= [];
    if (!account.archiveIds.includes(archiveId)) { account.archiveIds.push(archiveId); changed = true; }
  }
  return changed;
}


function getLobbyForUser(lobbyId, user) {
  const lobby = store.data.lobbies[lobbyId];
  if (!lobby) throw Object.assign(new Error('Lobby not found.'), { status: 404 });
  if (!lobby.players[user.id]) throw Object.assign(new Error('You are not a member of this lobby.'), { status: 403 });
  return lobby;
}

function broadcastLobby(lobbyId, event = 'refresh', data = {}) {
  const clients = sseClients.get(lobbyId);
  if (!clients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify({ lobbyId, at: Date.now(), ...data })}\n\n`;
  for (const res of [...clients]) {
    try { res.write(payload); }
    catch { clients.delete(res); }
  }
}

function closeLobbyClients(lobbyId) {
  const clients = sseClients.get(lobbyId);
  if (!clients) return;
  for (const res of [...clients]) {
    try { res.end(); } catch {}
  }
  sseClients.delete(lobbyId);
}

async function withLobbyLock(lobbyId, callback) {
  const previous = lobbyLocks.get(lobbyId) || Promise.resolve();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const chain = previous.then(() => gate);
  lobbyLocks.set(lobbyId, chain);
  await previous;
  try { return await callback(); }
  finally {
    release();
    if (lobbyLocks.get(lobbyId) === chain) lobbyLocks.delete(lobbyId);
  }
}

function registerSse(req, res, lobbyId, user) {
  getLobbyForUser(lobbyId, user);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ lobbyId })}\n\n`);
  if (!sseClients.has(lobbyId)) sseClients.set(lobbyId, new Set());
  const clients = sseClients.get(lobbyId);
  clients.add(res);
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); }
    catch { clearInterval(heartbeat); clients.delete(res); }
  }, 20_000);
  req.on('close', () => { clearInterval(heartbeat); clients.delete(res); });
}

function serveStatic(res, pathname) {
  const aliases = { '/': '/index.html', '/app': '/index.html' };
  const requested = aliases[pathname] || pathname;
  const normalized = path.normalize(requested).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, normalized);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
  const ext = path.extname(filePath).toLowerCase();
  const mime = {
    '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  }[ext] || 'application/octet-stream';
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-store' : 'no-cache, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function attemptAllowed(ip) {
  const now = Date.now();
  const list = (loginAttempts.get(ip) || []).filter(time => now - time < 10 * 60_000);
  loginAttempts.set(ip, list);
  return list.length < 20;
}
function recordFailedAttempt(ip) {
  const list = loginAttempts.get(ip) || [];
  list.push(Date.now());
  loginAttempts.set(ip, list);
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;
  const method = req.method || 'GET';
  const forwardedFor = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : String(forwardedFor || '').split(',')[0].trim();
  const ip = forwardedIp || req.socket.remoteAddress || 'unknown';

  if (method === 'GET' && pathname === '/api/health') return json(res, 200, healthPayload());

  if (method === 'POST' && pathname === '/api/register') {
    if (!attemptAllowed(ip)) return json(res, 429, { error: 'Too many attempts. Try again later.' });
    const body = await readJson(req);
    const username = String(body.username || '').trim();
    const normalized = username.toLowerCase();
    const password = String(body.password || '');
    if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) return json(res, 400, { error: 'Username must be 3–24 letters, numbers, or underscores.' });
    if (password.length < 8 || password.length > 200) return json(res, 400, { error: 'Password must be at least 8 characters.' });
    if (store.data.usernames[normalized]) return json(res, 409, { error: 'That username is already taken.' });
    const id = crypto.randomBytes(10).toString('hex');
    const pw = passwordHash(password);
    const user = { id, username, normalizedUsername: normalized, passwordHash: pw.hash, passwordSalt: pw.salt, archiveIds: [], createdAt: new Date().toISOString() };
    store.data.users[id] = user;
    store.data.usernames[normalized] = id;
    const session = createSession(id);
    return json(res, 201, { user: userSafe(user) }, { 'Set-Cookie': sessionCookie(session.token, SESSION_DAYS * 86400) });
  }

  if (method === 'POST' && pathname === '/api/login') {
    if (!attemptAllowed(ip)) return json(res, 429, { error: 'Too many attempts. Try again later.' });
    const body = await readJson(req);
    const normalized = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const userId = store.data.usernames[normalized];
    const user = userId ? store.data.users[userId] : null;
    if (!user || !passwordMatches(password, user)) {
      recordFailedAttempt(ip);
      return json(res, 401, { error: 'Incorrect username or password.' });
    }
    const session = createSession(user.id);
    return json(res, 200, { user: userSafe(user) }, { 'Set-Cookie': sessionCookie(session.token, SESSION_DAYS * 86400) });
  }

  if (method === 'POST' && pathname === '/api/logout') {
    const token = parseCookies(req).dco_session;
    if (token) delete store.data.sessions[token];
    store.save();
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
  }

  const user = requireUser(req, res);
  if (!user) return;

  if (method === 'GET' && pathname === '/api/session') return json(res, 200, { user: userSafe(user) });

  if (method === 'GET' && pathname === '/api/meta') {
    return json(res, 200, {
      captions: game.CAPTIONS, buffs: game.VALID_BUFFS, staffRoles: game.STAFF_ROLES,
      staffLabels: game.STAFF_LABELS, staffTiers: game.STAFF_TIERS, staffBaseSalaries: game.STAFF_BASE_SALARIES,
      facilities: game.FACILITIES, sponsors: game.SPONSORS, foodPlans: game.FOOD_PLANS,
      tourPlans: game.TOUR_PLANS, trainingPlans: game.TRAINING_PLANS, tourSchedule: game.TOUR_SCHEDULE,
      sectionTargets: game.SECTION_TARGETS, fundraisers: game.FUNDRAISERS,
      startingBudget: game.STARTING_BUDGET, maxFundraisers: game.MAX_FUNDRAISERS, staffMarketRefreshCost: game.STAFF_MARKET_REFRESH_COST,
      minPlayers: Number(process.env.MIN_PLAYERS || 2),
    });
  }

  if (method === 'GET' && pathname === '/api/account/recaps') {
    user.archiveIds ||= [];
    const recaps = user.archiveIds
      .map(id => store.data.archives[id])
      .filter(Boolean)
      .sort((a, b) => Number(b.season) - Number(a.season) || String(b.completedAt).localeCompare(String(a.completedAt)))
      .map(archive => archiveSummary(archive, user.id));
    return json(res, 200, { recaps });
  }

  const accountRecapMatch = pathname.match(/^\/api\/account\/recaps\/([A-Za-z0-9-]+)$/);
  if (method === 'GET' && accountRecapMatch) {
    const archive = store.data.archives[accountRecapMatch[1]];
    if (!archive || !(user.archiveIds || []).includes(archive.id)) return json(res, 404, { error: 'Season recap not found on this account.' });
    return json(res, 200, { recap: archive, myPlayer: archive.players?.find(item => item.userId === user.id) || null });
  }

  if (method === 'GET' && pathname === '/api/lobbies') {
    const lobbies = Object.values(store.data.lobbies)
      .filter(lobby => lobby.players[user.id])
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .map(lobby => ({
        id: lobby.id, code: lobby.code, name: lobby.name, status: lobby.status,
        season: lobby.season, week: lobby.week, phase: lobby.phase,
        players: Object.keys(lobby.players).length, isHost: lobby.hostUserId === user.id,
        updatedAt: lobby.updatedAt, revision: lobby.revision || 0, completedSeasons: (lobby.archiveIds || []).length,
      }));
    return json(res, 200, { lobbies });
  }

  if (method === 'POST' && pathname === '/api/lobbies') {
    const body = await readJson(req);
    const lobby = game.createLobby(user, body.name);
    store.data.lobbies[lobby.id] = lobby;
    store.save();
    broadcastLobby(lobby.id);
    return json(res, 201, { lobby: game.lobbyView(lobby, user.id) });
  }

  if (method === 'POST' && pathname === '/api/lobbies/join') {
    const body = await readJson(req);
    const code = String(body.code || '').trim().toUpperCase();
    const lobby = Object.values(store.data.lobbies).find(item => item.code === code);
    if (!lobby) return json(res, 404, { error: 'No lobby uses that code.' });
    game.addPlayerToLobby(lobby, user);
    store.save();
    broadcastLobby(lobby.id);
    return json(res, 200, { lobby: game.lobbyView(lobby, user.id) });
  }

  const lobbyRecapsMatch = pathname.match(/^\/api\/lobbies\/([a-f0-9]+)\/recaps(?:\/([A-Za-z0-9-]+))?$/);
  if (method === 'GET' && lobbyRecapsMatch) {
    const lobby = getLobbyForUser(lobbyRecapsMatch[1], user);
    const archiveId = lobbyRecapsMatch[2] || null;
    if (archiveId) {
      const archive = store.data.archives[archiveId];
      if (!archive || archive.lobbyId !== lobby.id || !(lobby.archiveIds || []).includes(archiveId)) return json(res, 404, { error: 'Season recap not found.' });
      return json(res, 200, { recap: archive, myPlayer: archive.players?.find(item => item.userId === user.id) || null });
    }
    const recaps = (lobby.archiveIds || []).map(id => store.data.archives[id]).filter(Boolean).map(archive => archiveSummary(archive, user.id));
    return json(res, 200, { recaps });
  }

  const match = pathname.match(/^\/api\/lobbies\/([a-f0-9]+)(?:\/(events|action|ready|start|advance|event-choice|next-season))?$/);
  if (match) {
    const lobbyId = match[1];
    const operation = match[2] || null;
    const lobby = getLobbyForUser(lobbyId, user);

    if (method === 'GET' && !operation) return json(res, 200, { lobby: game.lobbyView(lobby, user.id) });
    if (method === 'GET' && operation === 'events') return registerSse(req, res, lobbyId, user);

    if (method === 'DELETE' && !operation) {
      if (lobby.hostUserId !== user.id) return json(res, 403, { error: 'Only the lobby creator can delete this lobby.' });
      return withLobbyLock(lobbyId, async () => {
        const current = store.data.lobbies[lobbyId];
        if (!current) return json(res, 404, { error: 'Lobby not found.' });
        if (current.hostUserId !== user.id) return json(res, 403, { error: 'Only the lobby creator can delete this lobby.' });
        broadcastLobby(lobbyId, 'deleted', { name: current.name });
        delete store.data.lobbies[lobbyId];
        store.save();
        setTimeout(() => closeLobbyClients(lobbyId), 25).unref();
        return json(res, 200, { ok: true });
      });
    }

    if (method === 'POST' && operation === 'action') {
      const body = await readJson(req);
      return withLobbyLock(lobbyId, async () => {
        const current = getLobbyForUser(lobbyId, user);
        if (current.status !== 'setup') return json(res, 409, { error: 'Preseason actions are locked after the season starts.', lobby: game.lobbyView(current, user.id) });
        const player = current.players[user.id];
        const nextCorps = structuredClone(player.corps);
        try {
          game.applyAction(nextCorps, body.action, body.payload || {}, `${current.id}:${current.season}`, {
            actionId: String(body.actionId || ''), expectedRevision: body.expectedRevision, season: current.season,
          });
        } catch (error) {
          if (error.code === 'REVISION_CONFLICT') return json(res, 409, { error: error.message, lobby: game.lobbyView(current, user.id) });
          throw error;
        }
        player.corps = nextCorps;
        player.ready = false;
        current.revision = Number(current.revision || 0) + 1;
        current.updatedAt = new Date().toISOString();
        store.save();
        broadcastLobby(current.id);
        return json(res, 200, { lobby: game.lobbyView(current, user.id) });
      });
    }

    if (method === 'POST' && operation === 'ready') {
      const body = await readJson(req);
      return withLobbyLock(lobbyId, async () => {
        const current = getLobbyForUser(lobbyId, user);
        if (current.status !== 'setup') return json(res, 409, { error: 'Readiness is locked after the season starts.' });
        const player = current.players[user.id];
        const ready = Boolean(body.ready);
        if (ready && !game.isCorpsReady(player.corps)) return json(res, 409, { error: 'Complete every preseason checklist item first.', lobby: game.lobbyView(current, user.id) });
        player.ready = ready;
        current.revision = Number(current.revision || 0) + 1;
        current.updatedAt = new Date().toISOString();
        store.save();
        broadcastLobby(current.id);
        return json(res, 200, { lobby: game.lobbyView(current, user.id) });
      });
    }

    if (method === 'POST' && operation === 'start') {
      const body = await readJson(req);
      return withLobbyLock(lobbyId, async () => {
        const current = getLobbyForUser(lobbyId, user);
        if (current.hostUserId !== user.id) return json(res, 403, { error: 'Only the lobby host can start the season.' });
        game.startSeason(current, Boolean(body.force));
        store.save();
        broadcastLobby(current.id, 'season');
        return json(res, 200, { lobby: game.lobbyView(current, user.id) });
      });
    }

    if (method === 'POST' && operation === 'advance') {
      return withLobbyLock(lobbyId, async () => {
        const current = getLobbyForUser(lobbyId, user);
        if (current.hostUserId !== user.id) return json(res, 403, { error: 'Only the lobby host can advance the season.' });
        game.advanceSeason(current);
        if (current.status === 'complete') persistSeasonArchive(current);
        store.save();
        broadcastLobby(current.id, 'season');
        return json(res, 200, { lobby: game.lobbyView(current, user.id) });
      });
    }

    if (method === 'POST' && operation === 'next-season') {
      return withLobbyLock(lobbyId, async () => {
        const current = getLobbyForUser(lobbyId, user);
        if (current.hostUserId !== user.id) return json(res, 403, { error: 'Only the lobby host can open the next season.' });
        if (current.status !== 'complete') return json(res, 409, { error: 'The current season is not complete.' });
        persistSeasonArchive(current);
        game.startNextSeason(current);
        store.save();
        broadcastLobby(current.id, 'season', { season: current.season });
        return json(res, 200, { lobby: game.lobbyView(current, user.id) });
      });
    }

    if (method === 'POST' && operation === 'event-choice') {
      const body = await readJson(req);
      return withLobbyLock(lobbyId, async () => {
        const current = getLobbyForUser(lobbyId, user);
        if (current.status !== 'running' || current.phase !== 'choices') return json(res, 409, { error: 'Event choices are not open.', lobby: game.lobbyView(current, user.id) });
        const player = current.players[user.id];
        const nextCorps = structuredClone(player.corps);
        try {
          game.chooseEvent(nextCorps, String(body.eventId || ''), String(body.choiceId || ''), {
            actionId: String(body.actionId || ''), expectedRevision: body.expectedRevision,
          });
        } catch (error) {
          if (error.code === 'REVISION_CONFLICT') return json(res, 409, { error: error.message, lobby: game.lobbyView(current, user.id) });
          throw error;
        }
        player.corps = nextCorps;
        current.revision = Number(current.revision || 0) + 1;
        current.updatedAt = new Date().toISOString();
        store.save();
        broadcastLobby(current.id);
        return json(res, 200, { lobby: game.lobbyView(current, user.id) });
      });
    }
  }

  return json(res, 404, { error: 'API route not found.' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/health') {
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        return res.end();
      }
      return json(res, 200, healthPayload());
    }
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method === 'GET' && serveStatic(res, url.pathname)) return;
    if (req.method === 'GET' && !path.extname(url.pathname)) return serveStatic(res, '/index.html');
    json(res, 404, { error: 'Not found.' });
  } catch (error) {
    const status = Number(error.status || 400);
    console.error(error);
    if (!res.headersSent) json(res, status >= 400 && status < 600 ? status : 500, { error: error.message || 'Unexpected server error.' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Drum Corps Online listening on http://${HOST}:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; saving state and shutting down.`);

  try { store.save(); }
  catch (error) { console.error('Failed to save state during shutdown.', error); }

  for (const clients of sseClients.values()) {
    for (const response of clients) {
      try { response.end(); } catch {}
    }
  }

  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10_000).unref();
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => shutdown(signal));

'use strict';

const state = {
  user: null,
  meta: null,
  lobbies: [],
  lobby: null,
  currentLobbyId: null,
  stream: null,
};

const $ = selector => document.querySelector(selector);
const authScreen = $('#authScreen');
const dashboardScreen = $('#dashboardScreen');
const lobbyScreen = $('#lobbyScreen');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
}
function money(value) { return `$${Math.round(Number(value) || 0).toLocaleString()}`; }
function number(value, digits = 1) { return Number(value || 0).toFixed(digits); }
function labelize(value) { return String(value).replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()); }

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

let noticeTimer = null;
function notice(message, kind = 'success') {
  const box = $('#notice');
  clearTimeout(noticeTimer);
  box.textContent = message;
  box.className = `notice ${kind}`;
  noticeTimer = setTimeout(() => box.classList.add('hidden'), 5000);
}
function hideNotice() { $('#notice').classList.add('hidden'); }

function showOnly(screen) {
  for (const item of [authScreen, dashboardScreen, lobbyScreen]) item.classList.add('hidden');
  screen.classList.remove('hidden');
}

function renderSession() {
  const area = $('#sessionArea');
  if (!state.user) {
    area.innerHTML = '';
    return;
  }
  area.innerHTML = `<div class="topbar-actions"><span class="topbar-user">${escapeHtml(state.user.username)}</span><button id="logoutButton" class="secondary" type="button">Log out</button></div>`;
  $('#logoutButton').addEventListener('click', logout);
}

async function loadMeta() {
  if (!state.meta) state.meta = await api('/api/meta');
}

async function boot() {
  wireStaticEvents();
  try {
    const payload = await api('/api/session');
    state.user = payload.user;
    renderSession();
    await Promise.all([loadMeta(), showDashboard()]);
  } catch {
    state.user = null;
    renderSession();
    showOnly(authScreen);
  }
}

function wireStaticEvents() {
  $('#loginTab').addEventListener('click', () => setAuthMode('login'));
  $('#registerTab').addEventListener('click', () => setAuthMode('register'));
  $('#authForm').addEventListener('submit', submitAuth);
  $('#createLobbyForm').addEventListener('submit', createLobby);
  $('#joinLobbyForm').addEventListener('submit', joinLobby);
  $('#backDashboard').addEventListener('click', showDashboard);
  $('#setupStages').addEventListener('submit', handleStageSubmit);
  $('#setupStages').addEventListener('click', handleStageClick);
  $('#privateEvent').addEventListener('click', handleEventChoice);
  $('#hostControls').addEventListener('click', handleHostControl);
  $('#playerList').addEventListener('click', handleReadyControl);
}

function setAuthMode(mode) {
  $('#authMode').value = mode;
  $('#loginTab').classList.toggle('active', mode === 'login');
  $('#registerTab').classList.toggle('active', mode === 'register');
  $('#authSubmit').textContent = mode === 'login' ? 'Log in' : 'Create account';
  $('#password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
}

async function submitAuth(event) {
  event.preventDefault();
  hideNotice();
  const mode = $('#authMode').value;
  try {
    const payload = await api(`/api/${mode}`, {
      method: 'POST',
      body: { username: $('#username').value, password: $('#password').value },
    });
    state.user = payload.user;
    renderSession();
    $('#authForm').reset();
    await loadMeta();
    await showDashboard();
    notice(mode === 'login' ? 'Logged in.' : 'Account created.');
  } catch (error) { notice(error.message, 'error'); }
}

async function logout() {
  try { await api('/api/logout', { method: 'POST' }); } catch { /* ignore */ }
  closeStream();
  state.user = null;
  state.lobby = null;
  state.currentLobbyId = null;
  renderSession();
  showOnly(authScreen);
  notice('Logged out.');
}

async function showDashboard() {
  closeStream();
  state.currentLobbyId = null;
  state.lobby = null;
  showOnly(dashboardScreen);
  try {
    const payload = await api('/api/lobbies');
    state.lobbies = payload.lobbies;
    renderLobbyList();
  } catch (error) { notice(error.message, 'error'); }
}

function renderLobbyList() {
  const list = $('#lobbyList');
  if (!state.lobbies.length) {
    list.innerHTML = '<div class="empty">You have no lobbies yet. Create one or join with a code.</div>';
    return;
  }
  list.innerHTML = state.lobbies.map(lobby => `
    <article class="lobby-card">
      <div class="eyebrow">Code ${escapeHtml(lobby.code)}</div>
      <h3>${escapeHtml(lobby.name)}</h3>
      <div class="meta-row"><span>Status</span><b>${escapeHtml(lobby.status)}</b></div>
      <div class="meta-row"><span>Season / week</span><b>${lobby.season} / ${lobby.week}</b></div>
      <div class="meta-row"><span>Players</span><b>${lobby.players}</b></div>
      <button class="primary wide open-lobby" data-lobby-id="${lobby.id}" type="button">Open lobby</button>
    </article>`).join('');
  for (const button of list.querySelectorAll('.open-lobby')) {
    button.addEventListener('click', () => openLobby(button.dataset.lobbyId));
  }
}

async function createLobby(event) {
  event.preventDefault();
  try {
    const payload = await api('/api/lobbies', { method: 'POST', body: { name: $('#lobbyName').value } });
    $('#createLobbyForm').reset();
    await openLobby(payload.lobby.id);
    notice('Lobby created. Share the code with the other directors.');
  } catch (error) { notice(error.message, 'error'); }
}

async function joinLobby(event) {
  event.preventDefault();
  try {
    const payload = await api('/api/lobbies/join', { method: 'POST', body: { code: $('#joinCode').value } });
    $('#joinLobbyForm').reset();
    await openLobby(payload.lobby.id);
    notice('Joined the lobby.');
  } catch (error) { notice(error.message, 'error'); }
}

async function openLobby(lobbyId) {
  state.currentLobbyId = lobbyId;
  showOnly(lobbyScreen);
  try {
    const payload = await api(`/api/lobbies/${lobbyId}`);
    state.lobby = payload.lobby;
    renderLobby();
    openStream(lobbyId);
  } catch (error) {
    notice(error.message, 'error');
    await showDashboard();
  }
}

async function refreshLobby(silent = true) {
  if (!state.currentLobbyId) return;
  try {
    const payload = await api(`/api/lobbies/${state.currentLobbyId}`);
    state.lobby = payload.lobby;
    renderLobby();
  } catch (error) {
    if (!silent) notice(error.message, 'error');
  }
}

function openStream(lobbyId) {
  closeStream();
  const stream = new EventSource(`/api/lobbies/${lobbyId}/events`);
  stream.addEventListener('refresh', () => refreshLobby());
  stream.addEventListener('season', () => refreshLobby());
  stream.onerror = () => { /* EventSource reconnects automatically. */ };
  state.stream = stream;
}
function closeStream() {
  if (state.stream) state.stream.close();
  state.stream = null;
}

function renderLobby() {
  const lobby = state.lobby;
  if (!lobby) return;
  $('#lobbyKicker').textContent = `Code ${lobby.code} • Season ${lobby.season}`;
  $('#lobbyTitle').textContent = lobby.name;
  $('#lobbyStatus').textContent = `${lobby.status} • ${lobby.phase}${lobby.week ? ` • week ${lobby.week}` : ''}`;
  renderLobbyMeta();
  renderPlayers();
  renderHostControls();
  renderPrivateEvent();
  renderPrivateStats();
  renderStages();
  renderPrivateLog();
  renderStandings();
  renderHistory();
}

function renderLobbyMeta() {
  const lobby = state.lobby;
  const readyCount = lobby.players.filter(player => player.ready).length;
  $('#lobbyMeta').innerHTML = `
    <div class="meta-row"><span>Lobby code</span><b>${escapeHtml(lobby.code)}</b></div>
    <div class="meta-row"><span>Players</span><b>${lobby.players.length}</b></div>
    <div class="meta-row"><span>Ready</span><b>${readyCount} / ${lobby.readyNeeded}</b></div>
    <div class="meta-row"><span>Season phase</span><b>${escapeHtml(lobby.phase)}</b></div>`;
}

function renderPlayers() {
  const lobby = state.lobby;
  const checklist = lobby.me.checklist;
  const checklistHtml = Object.entries(checklist).map(([key, done]) => `<div class="check-item ${done ? 'done' : ''}"><span>${escapeHtml(labelize(key))}</span><b>${done ? '✓' : '—'}</b></div>`).join('');
  const people = lobby.players.map(player => `
    <div class="player-card ${player.userId === state.user.id ? 'me' : ''}">
      <div class="player-title"><b>${escapeHtml(player.corpsName || player.username)}</b><span class="${player.ready ? 'ready' : 'not-ready'}">${player.ready ? 'READY' : 'NOT READY'}</span></div>
      <div class="tiny muted">${escapeHtml(player.showTitle || 'No show title')} • ${escapeHtml(player.username)}</div>
      ${player.latestScore == null ? '' : `<div class="tiny"><b>${number(player.latestScore, 2)}</b> • ${player.latestPlacement ? `${player.latestPlacement} place` : ''}</div>`}
    </div>`).join('');
  $('#playerList').innerHTML = `
    <h3 class="spaced">Directors</h3>${people}
    <h3 class="spaced">Your preseason checklist</h3>
    <div class="checklist">${checklistHtml}</div>
    ${lobby.status === 'setup' ? `<button id="readyButton" class="${lobby.me.ready ? 'warning' : 'good'} wide" type="button" ${!lobby.me.setupComplete ? 'disabled' : ''}>${lobby.me.ready ? 'Mark not ready' : 'Mark ready'}</button>` : ''}`;
}

function renderHostControls() {
  const lobby = state.lobby;
  if (!lobby.isHost) {
    $('#hostControls').innerHTML = '<div class="host-box"><b>Host controls</b><p class="tiny muted">The lobby host starts the season and advances each weekly phase.</p></div>';
    return;
  }
  let controls = '';
  if (lobby.status === 'setup') {
    controls = `<button class="primary wide" data-host-action="start" type="button">Start when ready threshold is met</button><button class="secondary wide" data-host-action="force-start" type="button">Force start</button>`;
  } else if (lobby.status === 'running' && lobby.phase === 'choices') {
    controls = `<button class="primary wide" data-host-action="advance" type="button">Score week ${lobby.week}</button><p class="tiny muted">Unanswered private events use their safest/default option.</p>`;
  } else if (lobby.status === 'running' && lobby.phase === 'results') {
    controls = `<button class="primary wide" data-host-action="advance" type="button">Open week ${lobby.week + 1}</button>`;
  } else {
    controls = '<p class="tiny muted">This season is complete. Its scores remain in history.</p>';
  }
  $('#hostControls').innerHTML = `<div class="host-box"><b>Host controls</b>${controls}</div>`;
}

function renderPrivateEvent() {
  const event = state.lobby.me.corps.pendingEvent;
  if (!event || state.lobby.phase !== 'choices') {
    $('#privateEvent').innerHTML = '';
    return;
  }
  const options = event.options.map(option => `<button class="${event.choice === option.id ? 'good' : 'warning'}" data-event-id="${event.id}" data-choice-id="${option.id}" type="button" ${event.choice ? 'disabled' : ''}>${escapeHtml(option.label)}</button>`).join('');
  $('#privateEvent').innerHTML = `
    <article class="event-card">
      <div class="eyebrow">Private week ${event.week} decision</div>
      <h3>${escapeHtml(event.title)}</h3>
      <p>${escapeHtml(event.text)}</p>
      ${event.choice ? `<p class="event-choice-locked">Choice locked: ${escapeHtml(event.choice)}</p>` : `<div class="event-options">${options}</div>`}
    </article>`;
}

function renderPrivateStats() {
  const corps = state.lobby.me.corps;
  $('#corpsHeading').textContent = corps.corpsName;
  const total = captionScore(corps);
  $('#privateStats').innerHTML = `
    <div class="stats-grid">
      ${statBox('Budget', money(corps.budget))}
      ${statBox('Projected score', number(total, 2))}
      ${statBox('Morale', number(corps.morale))}
      ${statBox('Burnout', number(corps.burnout))}
      ${statBox('Injury', number(corps.injury))}
      ${statBox('Fans', Math.round(corps.fans).toLocaleString())}
      ${statBox('Reputation', number(corps.reputation))}
      ${statBox('Legacy', number(corps.legacy))}
    </div>
    <h3 class="spaced">Private caption detail</h3>
    <table class="caption-table"><thead><tr><th>Caption</th><th>Content</th><th>Achievement</th><th>Total</th></tr></thead><tbody>
      ${state.meta.captions.map(([key, label]) => {
        const cap = corps.captions[key];
        return `<tr><td>${escapeHtml(label)}</td><td>${number(cap.content, 2)}</td><td>${number(cap.achievement, 2)}</td><td><b>${number(cap.content + cap.achievement, 2)}</b></td></tr>`;
      }).join('')}
    </tbody></table>`;
}

function statBox(label, value) { return `<div class="stat-box"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`; }
function captionScore(corps) {
  const t = key => Number(corps.captions[key].content) + Number(corps.captions[key].achievement);
  return t('musicGE') + t('visualGE') + (t('visualPerformance') + t('visualAnalysis') + t('colorGuard')) / 2 + (t('brass') + t('musicAnalysis') + t('percussion')) / 2;
}

function renderStages() {
  const lobby = state.lobby;
  const corps = lobby.me.corps;
  if (lobby.status !== 'setup') {
    $('#setupStages').innerHTML = `
      <article class="stage-card complete"><div class="stage-heading"><h3><span class="stage-number">✓</span>Preseason locked</h3><span class="pill">Season running</span></div><p class="muted">Your private setup is locked. Respond to private events while the host advances the weekly season.</p></article>`;
    return;
  }
  const c = lobby.me.checklist;
  const options = (items, selected) => items.map(value => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
  const hired = Object.keys(corps.staff);
  const staffHtml = state.meta.staffRoles.map(role => {
    const person = corps.staff[role];
    if (person) return `<div class="staff-card hired"><b>${escapeHtml(state.meta.staffLabels[role])}</b><div class="tiny">Level ${person.level} • Quality ${number(person.quality)}</div></div>`;
    return `<div class="staff-card"><b>${escapeHtml(state.meta.staffLabels[role])}</b><label>Level</label><select data-staff-level="${role}"><option value="1">1 — $2,500</option><option value="2" selected>2 — $4,500</option><option value="3">3 — $7,500</option><option value="4">4 — $11,000</option></select><button class="secondary wide" data-game-action="hireStaff" data-role="${role}" type="button">Hire</button></div>`;
  }).join('');
  const facilities = Object.entries(state.meta.facilities).map(([key, facility]) => `<option value="${key}">${escapeHtml(facility.label)} — ${money(facility.cost)}</option>`).join('');
  const sectionRows = Object.entries(corps.sections).map(([key, section]) => `<div class="stat-row"><span>${escapeHtml(labelize(key))}</span><b>${section.count}/${state.meta.sectionTargets[key]} • talent ${number(section.talent)} • move ${number(section.movement)}</b></div>`).join('');

  $('#setupStages').innerHTML = `
    <article class="stage-card ${c.identity ? 'complete' : ''}">
      <div class="stage-heading"><h3><span class="stage-number">1</span>Identity</h3><span>${c.identity ? '✓ Complete' : 'Required'}</span></div>
      <form data-stage-form="configure"><div class="form-grid">
        <div><label>Corps name</label><input name="corpsName" maxlength="50" value="${escapeHtml(corps.corpsName)}" required></div>
        <div><label>Show title</label><input name="showTitle" maxlength="70" value="${escapeHtml(corps.showTitle)}" required></div>
        <div><label>Director</label><input name="director" maxlength="50" value="${escapeHtml(corps.director)}" required></div>
        <div><label>Home base</label><input name="home" maxlength="60" value="${escapeHtml(corps.home)}" required></div>
        <div><label>Caption buff</label><select name="buff">${options(state.meta.buffs, corps.buff)}</select></div>
        <div><label>Difficulty</label><select name="difficulty">${options(['easy', 'normal', 'hard'], corps.difficulty)}</select></div>
      </div><button class="primary wide" type="submit">Save identity</button></form>
    </article>

    <article class="stage-card ${c.office ? 'complete' : ''}">
      <div class="stage-heading"><h3><span class="stage-number">2</span>Office</h3><span>${c.office ? '✓ Complete' : 'Required'}</span></div>
      <form data-stage-form="office"><div class="form-grid three">
        <div><label>Sponsor</label><select name="sponsor">${options(['community', 'arts', 'corporate'], corps.sponsor || 'community')}</select></div>
        <div><label>Food budget</label><input name="foodBudget" type="number" min="20" max="100" value="${corps.foodBudget}"></div>
        <div><label>Add facility</label><select name="facility"><option value="">No new facility</option>${facilities}</select></div>
      </div><p class="tiny muted">Owned: ${Object.keys(corps.facilities).map(labelize).join(', ') || 'none'}</p><button class="primary wide" type="submit">Apply office plan</button></form>
    </article>

    <article class="stage-card ${c.staff ? 'complete' : ''}">
      <div class="stage-heading"><h3><span class="stage-number">3</span>Staff</h3><span>${hired.length}/5 required</span></div>
      <div class="staff-grid">${staffHtml}</div>
    </article>

    <article class="stage-card ${c.design ? 'complete' : ''}">
      <div class="stage-heading"><h3><span class="stage-number">4</span>Design</h3><span>${c.design ? '✓ Complete' : 'Required'}</span></div>
      <form data-stage-form="design"><div class="form-grid three">
        <div><label>Concept</label><input name="concept" maxlength="80" value="${escapeHtml(corps.design?.concept || corps.showTitle)}"></div>
        <div><label>Book difficulty</label><input name="bookDifficulty" type="number" min="35" max="95" value="${corps.design?.difficulty || 65}"></div>
        <div><label>Primary focus</label><select name="focus">${options(['balanced', 'ge', 'visual', 'music'], corps.design?.focus || 'balanced')}</select></div>
      </div><button class="primary wide" type="submit">Build production</button></form>
    </article>

    <article class="stage-card ${c.recruit ? 'complete' : ''}">
      <div class="stage-heading"><h3><span class="stage-number">5</span>Recruit</h3><span>${corps.auditionCamps}/4 camps</span></div>
      ${sectionRows}
      <button class="primary wide" data-game-action="audition" type="button" ${c.recruit ? 'disabled' : ''}>Run whole-corps audition camp</button>
    </article>

    <article class="stage-card ${c.route ? 'complete' : ''}">
      <div class="stage-heading"><h3><span class="stage-number">6</span>Tour plan</h3><span>${c.route ? `✓ ${escapeHtml(corps.routeStrategy)}` : 'Required'}</span></div>
      <p class="muted tiny">Rest improves health, aggressive touring builds fans but creates fatigue, and balanced touring splits the difference.</p>
      <div class="button-grid"><button class="secondary" data-game-action="route" data-strategy="rest" type="button">Rest-focused</button><button class="primary" data-game-action="route" data-strategy="balanced" type="button">Balanced</button><button class="warning" data-game-action="route" data-strategy="aggressive" type="button">Aggressive</button></div>
    </article>

    <article class="stage-card ${c.training ? 'complete' : ''}">
      <div class="stage-heading"><h3><span class="stage-number">7</span>Training</h3><span>${corps.trainingBlocks}/8 blocks</span></div>
      <div class="progress"><span style="width:${Math.min(100, corps.trainingBlocks / 8 * 100)}%"></span></div>
      <div class="button-grid">${['ge', 'visual', 'music', 'brass', 'percussion', 'guard', 'all'].map(focus => `<button class="secondary" data-game-action="train" data-focus="${focus}" type="button" ${c.training ? 'disabled' : ''}>${escapeHtml(labelize(focus))}</button>`).join('')}</div>
      <div class="button-grid">${['ge', 'visual', 'music'].map(focus => `<button class="warning" data-game-action="train" data-focus="${focus}" data-intense="1" type="button" ${c.training ? 'disabled' : ''}>Intense ${escapeHtml(labelize(focus))}</button>`).join('')}</div>
    </article>

    <article class="stage-card ${lobby.me.setupComplete ? 'complete' : ''}">
      <div class="stage-heading"><h3><span class="stage-number">8</span>Finish preseason</h3><span>${lobby.me.setupComplete ? '✓ Ready eligible' : 'Incomplete'}</span></div>
      <p class="muted">Quick Build fills a balanced, playable setup. It is useful for testing or for directors who do not want to configure every stage manually.</p>
      <button class="secondary wide" data-game-action="quickBuild" type="button">Quick Build remaining preseason</button>
    </article>`;
}

function renderPrivateLog() {
  const entries = state.lobby.me.corps.log || [];
  $('#privateLog').innerHTML = entries.map(entry => `<div class="log-entry">${escapeHtml(entry)}</div>`).join('') || '<div>No private log entries.</div>';
}

function renderStandings() {
  const lobby = state.lobby;
  if (!lobby.standings.length) {
    $('#standings').innerHTML = '<div class="empty">No scored week yet.</div>';
    return;
  }
  $('#standings').innerHTML = `<table class="standings-table"><thead><tr><th>Place</th><th>Corps</th><th>Score</th></tr></thead><tbody>${lobby.standings.map(row => `<tr class="${row.userId === state.user.id ? 'my-row' : ''}"><td>${row.placement}</td><td>${escapeHtml(row.corpsName)}${row.type === 'player' ? ' ★' : ''}<div class="tiny muted">${escapeHtml(row.showTitle || '')}</div></td><td><b>${number(row.score, 2)}</b>${row.penalty ? `<div class="tiny">-${number(row.penalty, 2)}</div>` : ''}</td></tr>`).join('')}</tbody></table>`;
}

function renderHistory() {
  const history = state.lobby.history;
  $('#history').innerHTML = history.length ? history.slice().reverse().map(item => `<div class="history-card"><b>Week ${item.week}</b><div class="tiny muted">Winner: ${escapeHtml(item.winner?.corpsName || 'None')} • ${item.winner ? number(item.winner.score, 2) : ''}</div></div>`).join('') : '<div class="empty">No completed weeks.</div>';
}

async function postAction(action, payload = {}) {
  try {
    const response = await api(`/api/lobbies/${state.currentLobbyId}/action`, { method: 'POST', body: { action, payload } });
    state.lobby = response.lobby;
    renderLobby();
    notice('Corps updated.');
  } catch (error) { notice(error.message, 'error'); }
}

async function handleStageSubmit(event) {
  const form = event.target.closest('form[data-stage-form]');
  if (!form) return;
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form).entries());
  if (payload.foodBudget) payload.foodBudget = Number(payload.foodBudget);
  if (payload.bookDifficulty) payload.bookDifficulty = Number(payload.bookDifficulty);
  await postAction(form.dataset.stageForm, payload);
}

async function handleStageClick(event) {
  const button = event.target.closest('[data-game-action]');
  if (!button) return;
  const action = button.dataset.gameAction;
  let payload = {};
  if (action === 'hireStaff') {
    const role = button.dataset.role;
    payload = { role, level: Number(document.querySelector(`[data-staff-level="${role}"]`).value) };
  }
  if (action === 'route') payload = { strategy: button.dataset.strategy };
  if (action === 'train') payload = { focus: button.dataset.focus, intense: button.dataset.intense === '1' };
  await postAction(action, payload);
}

async function handleReadyControl(event) {
  if (!event.target.closest('#readyButton')) return;
  try {
    const response = await api(`/api/lobbies/${state.currentLobbyId}/ready`, { method: 'POST', body: { ready: !state.lobby.me.ready } });
    state.lobby = response.lobby;
    renderLobby();
    notice(state.lobby.me.ready ? 'You are ready.' : 'You are no longer ready.');
  } catch (error) { notice(error.message, 'error'); }
}

async function handleHostControl(event) {
  const button = event.target.closest('[data-host-action]');
  if (!button) return;
  try {
    const action = button.dataset.hostAction;
    const endpoint = action === 'advance' ? 'advance' : 'start';
    const body = action === 'force-start' ? { force: true } : {};
    const response = await api(`/api/lobbies/${state.currentLobbyId}/${endpoint}`, { method: 'POST', body });
    state.lobby = response.lobby;
    renderLobby();
    notice(action === 'advance' ? 'Season advanced.' : 'Season started.');
  } catch (error) { notice(error.message, 'error'); }
}

async function handleEventChoice(event) {
  const button = event.target.closest('[data-event-id]');
  if (!button) return;
  try {
    const response = await api(`/api/lobbies/${state.currentLobbyId}/event-choice`, {
      method: 'POST', body: { eventId: button.dataset.eventId, choiceId: button.dataset.choiceId },
    });
    state.lobby = response.lobby;
    renderLobby();
    notice('Private event choice locked.');
  } catch (error) { notice(error.message, 'error'); }
}

document.addEventListener('DOMContentLoaded', boot);

'use strict';

const state = {
  user: null,
  meta: null,
  lobbies: [],
  lobby: null,
  currentLobbyId: null,
  stream: null,
  busy: false,
  accountRecaps: [],
  activeRecap: null,
  recapFromLobby: false,
  dismissedRecapId: null,
};

const $ = selector => document.querySelector(selector);
const authScreen = $('#authScreen');
const dashboardScreen = $('#dashboardScreen');
const lobbyScreen = $('#lobbyScreen');
const recapScreen = $('#recapScreen');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
}
function money(value) { return `$${Math.round(Number(value) || 0).toLocaleString()}`; }
function signedMoney(value) { const n = Math.round(Number(value) || 0); return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toLocaleString()}`; }
function number(value, digits = 1) { return Number(value || 0).toFixed(digits); }
function labelize(value) { return String(value).replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()); }
function actionId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed (${response.status}).`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
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
  for (const item of [authScreen, dashboardScreen, lobbyScreen, recapScreen]) item.classList.add('hidden');
  screen.classList.remove('hidden');
}
function acceptLobby(nextLobby) {
  if (!nextLobby) return false;
  if (state.lobby && state.lobby.id === nextLobby.id && Number(nextLobby.revision || 0) < Number(state.lobby.revision || 0)) return false;
  state.lobby = nextLobby;
  return true;
}

function renderSession() {
  const area = $('#sessionArea');
  if (!state.user) { area.innerHTML = ''; return; }
  area.innerHTML = `<div class="topbar-actions"><span class="topbar-user">${escapeHtml(state.user.username)}</span><button id="logoutButton" class="secondary" type="button">Log out</button></div>`;
  $('#logoutButton').addEventListener('click', logout);
}
async function loadMeta() { if (!state.meta) state.meta = await api('/api/meta'); }

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
  $('#lobbyList').addEventListener('click', handleLobbyListClick);
  $('#setupStages').addEventListener('submit', handleStageSubmit);
  $('#setupStages').addEventListener('click', handleStageClick);
  $('#privateEvent').addEventListener('click', handleEventChoice);
  $('#hostControls').addEventListener('click', handleHostControl);
  $('#playerList').addEventListener('click', handleReadyControl);
  $('#accountHistory').addEventListener('click', handleAccountHistoryClick);
  $('#recapScreen').addEventListener('click', handleRecapControl);
}
function setAuthMode(mode) {
  $('#authMode').value = mode;
  $('#loginTab').classList.toggle('active', mode === 'login');
  $('#registerTab').classList.toggle('active', mode === 'register');
  $('#authSubmit').textContent = mode === 'login' ? 'Log in' : 'Create account';
  $('#password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
}
async function submitAuth(event) {
  event.preventDefault(); hideNotice();
  const mode = $('#authMode').value;
  try {
    const payload = await api(`/api/${mode}`, { method: 'POST', body: { username: $('#username').value, password: $('#password').value } });
    state.user = payload.user;
    renderSession();
    $('#authForm').reset();
    await loadMeta();
    await showDashboard();
    notice(mode === 'login' ? 'Logged in.' : 'Account created.');
  } catch (error) { notice(error.message, 'error'); }
}
async function logout() {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  closeStream();
  state.user = null; state.lobby = null; state.currentLobbyId = null;
  renderSession(); showOnly(authScreen); notice('Logged out.');
}

async function showDashboard() {
  closeStream();
  state.currentLobbyId = null; state.lobby = null;
  showOnly(dashboardScreen);
  try {
    const [lobbyPayload, recapPayload] = await Promise.all([api('/api/lobbies'), api('/api/account/recaps')]);
    state.lobbies = lobbyPayload.lobbies;
    state.accountRecaps = recapPayload.recaps || [];
    renderLobbyList();
    renderAccountHistory();
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
      <div class="meta-row"><span>Saved seasons</span><b>${lobby.completedSeasons || 0}</b></div>
      <button class="primary wide" data-open-lobby="${lobby.id}" type="button">Open lobby</button>
      ${lobby.isHost ? `<button class="danger-link wide" data-delete-lobby="${lobby.id}" data-lobby-name="${escapeHtml(lobby.name)}" type="button">Delete lobby</button>` : ''}
    </article>`).join('');
}
async function handleLobbyListClick(event) {
  const openButton = event.target.closest('[data-open-lobby]');
  if (openButton) return openLobby(openButton.dataset.openLobby);
  const deleteButton = event.target.closest('[data-delete-lobby]');
  if (deleteButton) await deleteLobby(deleteButton.dataset.deleteLobby, deleteButton.dataset.lobbyName);
}
function renderAccountHistory() {
  const list = $('#accountHistory');
  $('#careerRecapCount').textContent = `${state.accountRecaps.length} saved`;
  if (!state.accountRecaps.length) {
    list.innerHTML = '<div class="empty">Your completed seasons will appear here automatically.</div>';
    return;
  }
  list.innerHTML = state.accountRecaps.map(recap => `
    <article class="recap-card">
      <div><div class="eyebrow">Season ${recap.season} • ${escapeHtml(recap.lobbyCode || '')}</div><h4>${escapeHtml(recap.lobbyName)}</h4><p>${escapeHtml(recap.myResult?.corpsName || 'Your corps')} • ${recap.myResult?.finalPlacement ? `${recap.myResult.finalPlacement} place` : 'Result saved'} • ${number(recap.myResult?.finalScore, 2)}</p></div>
      <button class="secondary" data-account-recap="${recap.id}" type="button">View recap</button>
    </article>`).join('');
}
async function handleAccountHistoryClick(event) {
  const button = event.target.closest('[data-account-recap]');
  if (!button) return;
  await openRecap(button.dataset.accountRecap, false);
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
async function deleteLobby(lobbyId, lobbyName = 'this lobby') {
  if (!window.confirm(`Delete ${lobbyName}? This removes the live lobby. Completed season recaps already saved to player accounts will remain available.`)) return;
  try {
    await api(`/api/lobbies/${lobbyId}`, { method: 'DELETE' });
    if (state.currentLobbyId === lobbyId) await showDashboard();
    else {
      state.lobbies = state.lobbies.filter(lobby => lobby.id !== lobbyId);
      renderLobbyList();
    }
    notice('Lobby deleted.');
  } catch (error) { notice(error.message, 'error'); }
}

async function openLobby(lobbyId) {
  state.currentLobbyId = lobbyId;
  showOnly(lobbyScreen);
  try {
    const payload = await api(`/api/lobbies/${lobbyId}`);
    acceptLobby(payload.lobby);
    renderLobby();
    openStream(lobbyId);
    if (state.lobby.status === 'complete' && state.lobby.latestArchiveId && state.dismissedRecapId !== state.lobby.latestArchiveId) await openRecap(state.lobby.latestArchiveId, true);
  } catch (error) {
    notice(error.message, 'error');
    await showDashboard();
  }
}
async function refreshLobby(silent = true) {
  if (!state.currentLobbyId) return;
  try {
    const wasComplete = state.lobby?.status === 'complete';
    const payload = await api(`/api/lobbies/${state.currentLobbyId}`);
    if (acceptLobby(payload.lobby)) {
      renderLobby();
      if (!wasComplete && state.lobby.status === 'complete' && state.lobby.latestArchiveId) await openRecap(state.lobby.latestArchiveId, true);
    }
  } catch (error) {
    if (error.status === 404) { notice('This lobby was deleted.', 'error'); await showDashboard(); return; }
    if (!silent) notice(error.message, 'error');
  }
}
function openStream(lobbyId) {
  closeStream();
  const stream = new EventSource(`/api/lobbies/${lobbyId}/events`);
  stream.addEventListener('refresh', () => refreshLobby());
  stream.addEventListener('season', () => refreshLobby());
  stream.addEventListener('deleted', async () => { notice('The lobby creator deleted this lobby.', 'error'); await showDashboard(); });
  stream.onerror = () => { /* EventSource reconnects automatically. */ };
  state.stream = stream;
}
function closeStream() { if (state.stream) state.stream.close(); state.stream = null; }

function renderLobby() {
  const lobby = state.lobby;
  if (!lobby) return;
  const schedule = lobby.tourEvent?.schedule;
  $('#lobbyKicker').textContent = `Code ${lobby.code} • Season ${lobby.season}${schedule ? ` • ${schedule.city}` : ''}`;
  $('#lobbyTitle').textContent = lobby.name;
  $('#lobbyStatus').textContent = `${lobby.status} • ${lobby.phase}${lobby.week ? ` • week ${lobby.week}` : ''}`;
  renderLobbyMeta(); renderPlayers(); renderHostControls(); renderPrivateEvent(); renderPrivateStats();
  renderStages(); renderPrivateLog(); renderStandings(); renderHistory();
}
function renderLobbyMeta() {
  const lobby = state.lobby;
  const readyCount = lobby.players.filter(player => player.ready).length;
  $('#lobbyMeta').innerHTML = `
    <div class="meta-row"><span>Lobby code</span><b>${escapeHtml(lobby.code)}</b></div>
    <div class="meta-row"><span>Players</span><b>${lobby.players.length}</b></div>
    <div class="meta-row"><span>Ready</span><b>${readyCount} / ${lobby.readyNeeded}</b></div>
    <div class="meta-row"><span>Phase</span><b>${escapeHtml(lobby.phase)}</b></div>
    ${lobby.tourEvent ? `<div class="meta-row"><span>Contest</span><b>${escapeHtml(lobby.tourEvent.schedule.name)}</b></div><div class="meta-row"><span>Tour situation</span><b>${escapeHtml(lobby.tourEvent.title)}</b></div>` : ''}`;
}
function renderPlayers() {
  const lobby = state.lobby;
  const checklistHtml = Object.entries(lobby.me.checklist).map(([key, done]) => `<div class="check-item ${done ? 'done' : ''}"><span>${escapeHtml(labelize(key))}</span><b>${done ? '✓' : '—'}</b></div>`).join('');
  const people = lobby.players.map(player => `
    <div class="player-card ${player.userId === state.user.id ? 'me' : ''}">
      <div class="player-title"><b>${escapeHtml(player.corpsName || player.username)}</b><span class="${player.ready ? 'ready' : 'not-ready'}">${player.ready ? 'READY' : 'NOT READY'}</span></div>
      <div class="tiny muted">${escapeHtml(player.showTitle || 'No show title')} • ${escapeHtml(player.username)}</div>
      ${player.latestScore == null ? '' : `<div class="tiny"><b>${number(player.latestScore, 2)}</b> • ${player.latestPlacement ? `${player.latestPlacement} place` : ''}</div>`}
    </div>`).join('');
  $('#playerList').innerHTML = `
    <h3 class="spaced">Directors</h3>${people}
    <h3 class="spaced">Your setup checklist</h3><div class="checklist">${checklistHtml}</div>
    ${lobby.status === 'setup' ? `<button id="readyButton" class="${lobby.me.ready ? 'warning' : 'good'} wide" type="button" ${!lobby.me.setupComplete || state.busy ? 'disabled' : ''}>${lobby.me.ready ? 'Mark not ready' : 'Mark ready'}</button>` : ''}`;
}
function renderHostControls() {
  const lobby = state.lobby;
  if (!lobby.isHost) {
    $('#hostControls').innerHTML = '<div class="host-box"><b>Host controls</b><p class="tiny muted">The lobby creator starts the season and advances each contest.</p></div>';
    return;
  }
  let controls = '';
  if (lobby.status === 'setup') controls = `<button class="primary wide" data-host-action="start" type="button">Start season</button><button class="secondary wide" data-host-action="force-start" type="button">Force start</button>`;
  else if (lobby.status === 'running' && lobby.phase === 'choices') controls = `<button class="primary wide" data-host-action="advance" type="button">Score ${escapeHtml(lobby.tourEvent?.schedule?.name || `week ${lobby.week}`)}</button><p class="tiny muted">Unanswered decisions use the safest default option.</p>`;
  else if (lobby.status === 'running' && lobby.phase === 'results') controls = `<button class="primary wide" data-host-action="advance" type="button">Open ${escapeHtml(state.meta.tourSchedule[lobby.week]?.name || `week ${lobby.week + 1}`)}</button>`;
  else controls = `<button class="secondary wide" data-host-action="recap" type="button">View full recap</button><button class="primary wide" data-host-action="next-season" type="button">Open season ${lobby.season + 1}</button>`;
  $('#hostControls').innerHTML = `<div class="host-box"><b>Host controls</b>${controls}<div class="danger-zone"><button class="danger-link wide" data-host-action="delete" type="button">Delete lobby</button></div></div>`;
}
function renderPrivateEvent() {
  const lobby = state.lobby;
  const event = lobby.me.corps.pendingEvent;
  if (lobby.status !== 'running') { $('#privateEvent').innerHTML = ''; return; }
  if (lobby.phase === 'results') {
    const result = lobby.me.corps.lastEventResult;
    $('#privateEvent').innerHTML = `
      <article class="tour-banner"><div class="eyebrow">Week ${lobby.week} complete</div><h3>${escapeHtml(lobby.history.at(-1)?.schedule?.name || 'Contest complete')}</h3><p>${escapeHtml(result?.note || 'The week has been scored.')}</p></article>`;
    return;
  }
  if (!event) { $('#privateEvent').innerHTML = ''; return; }
  const options = event.options.map(item => `
    <button class="event-option ${event.choice === item.id ? 'selected' : ''}" data-event-id="${event.id}" data-choice-id="${item.id}" type="button" ${event.choice || state.busy ? 'disabled' : ''}>
      <b>${escapeHtml(item.label)}</b>${item.cost ? `<span>${money(item.cost)}</span>` : '<span>No cash cost</span>'}<small>${escapeHtml(item.description)}</small>
    </button>`).join('');
  $('#privateEvent').innerHTML = `
    <article class="event-card">
      <div class="eyebrow">${escapeHtml(lobby.tourEvent.schedule.name)} • ${escapeHtml(lobby.tourEvent.schedule.city)}</div>
      <h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(event.text)}</p>
      ${event.choice ? `<p class="event-choice-locked">Choice locked: ${escapeHtml(event.choiceLabel || event.choice)}</p>` : `<div class="event-options event-options-grid">${options}</div>`}
    </article>`;
}
function renderPrivateStats() {
  const lobby = state.lobby;
  const corps = lobby.me.corps;
  const budget = lobby.me.budgetSummary;
  $('#corpsHeading').textContent = corps.corpsName;
  $('#privateStats').innerHTML = `
    <div class="stats-grid">
      ${statBox('Cash', money(corps.budget))}
      ${statBox('Projected finish', money(budget.projectedFinish))}
      ${statBox('Weekly tour cost', money(budget.weekly.net))}
      ${statBox('Projected score', number(captionScore(corps), 2))}
      ${statBox('Morale', number(corps.morale))}
      ${statBox('Burnout', number(corps.burnout))}
      ${statBox('Injury', number(corps.injury))}
      ${statBox('Interest', number(corps.interest))}
      ${statBox('Fans', Math.round(corps.fans).toLocaleString())}
      ${statBox('Recruiting boost', `+${number(lobby.me.fanRecruitingBonus)} talent`)}
      ${statBox('Reputation', number(corps.reputation))}
    </div>
    <div class="budget-strip">
      <span>Travel ${money(budget.weekly.travel)}/week</span><span>Food ${money(budget.weekly.food)}/week</span><span>Sponsor −${money(budget.weekly.sponsorSupport)}/week</span><b>Ten-week projection ${money(budget.projectedTourCost)}</b>
    </div>
    <details class="details-block"><summary>Caption detail</summary>
      <table class="caption-table"><thead><tr><th>Caption</th><th>Content</th><th>Achievement</th><th>Total</th></tr></thead><tbody>
      ${state.meta.captions.map(([key, label]) => { const cap = corps.captions[key]; return `<tr><td>${escapeHtml(label)}</td><td>${number(cap.content, 2)}</td><td>${number(cap.achievement, 2)}</td><td><b>${number(cap.content + cap.achievement, 2)}</b></td></tr>`; }).join('')}
      </tbody></table></details>
    <details class="details-block"><summary>Money ledger</summary><div class="ledger">
      ${(corps.ledger || []).slice(0, 16).map(item => `<div class="ledger-row"><div><b>${escapeHtml(item.label)}</b><span>${item.week ? `Week ${item.week}` : 'Preseason'} • balance ${money(item.balance)}</span></div><strong class="${item.amount >= 0 ? 'income' : 'expense'}">${signedMoney(item.amount)}</strong></div>`).join('')}
    </div></details>`;
}
function statBox(label, value) { return `<div class="stat-box"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`; }
function captionScore(corps) {
  const total = key => Number(corps.captions[key].content) + Number(corps.captions[key].achievement);
  return total('musicGE') + total('visualGE') + (total('visualPerformance') + total('visualAnalysis') + total('colorGuard')) / 2 + (total('brass') + total('musicAnalysis') + total('percussion')) / 2;
}

function selectOptions(object, selected) {
  return Object.entries(object).map(([id, item]) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('');
}
function renderStages() {
  const lobby = state.lobby;
  const corps = lobby.me.corps;
  if (lobby.status !== 'setup') {
    $('#setupStages').innerHTML = `<article class="stage-card complete"><div class="stage-heading"><h3><span class="stage-number">✓</span>Preseason locked</h3><span class="pill">Season running</span></div><p class="muted">Your private setup is locked. Your choices and finances remain isolated from every other director.</p></article>`;
    return;
  }
  const checklist = lobby.me.checklist;
  const budget = lobby.me.budgetSummary;
  const fundraiserCards = lobby.me.fundraisingOptions.map(item => `
    <div class="staff-card ${item.used ? 'hired' : ''}"><b>${escapeHtml(item.label)}</b><div class="tiny muted">Cost ${money(item.cost)} • ${number(item.successChance, 0)}% success</div><div class="tiny">Expected net <b>${money(item.estimatedNet)}</b></div><button class="secondary wide" data-game-action="fundraise" data-fundraiser="${item.id}" type="button" ${item.used || state.busy ? 'disabled' : ''}>${item.used ? 'Used' : 'Run fundraiser'}</button></div>`).join('');
  const facilityCards = Object.entries(state.meta.facilities).map(([id, item]) => `
    <div class="staff-card ${corps.facilities[id] ? 'hired' : ''}"><b>${escapeHtml(item.label)}</b><div class="tiny muted">${money(item.cost)} • ${escapeHtml(item.note)}</div><button class="secondary wide" data-game-action="buyFacility" data-facility="${id}" type="button" ${corps.facilities[id] || state.busy ? 'disabled' : ''}>${corps.facilities[id] ? 'Owned' : 'Buy'}</button></div>`).join('');
  const currentStaffCards = state.meta.staffRoles.map(role => {
    const person = corps.staff[role];
    if (!person) return `<div class="staff-card vacancy"><b>${escapeHtml(state.meta.staffLabels[role])}</b><div class="tiny muted">Position vacant</div></div>`;
    const paid = Number(person.paidSeason) === Number(lobby.season);
    return `<div class="staff-card hired"><div class="staff-ovr">${number(person.overall || person.quality, 0)}<small>OVR</small></div><b>${escapeHtml(person.name || state.meta.staffLabels[role])}</b><div class="tiny muted">${escapeHtml(state.meta.staffLabels[role])}</div><div class="tiny">${money(person.salary)} • ${paid ? 'Paid this season' : 'Renewal due'}</div><button class="danger-link wide" data-game-action="fireStaff" data-role="${role}" type="button" ${state.busy ? 'disabled' : ''}>Fire</button></div>`;
  }).join('');
  const marketCards = (corps.staffMarket || []).slice().sort((a, b) => state.meta.staffRoles.indexOf(a.role) - state.meta.staffRoles.indexOf(b.role) || b.overall - a.overall).map(candidate => {
    const filled = Boolean(corps.staff[candidate.role]);
    return `<div class="staff-card candidate-card ${candidate.overall >= 90 ? 'star-candidate' : ''}"><div class="staff-ovr">${candidate.overall}<small>OVR</small></div><b>${escapeHtml(candidate.name)}</b><div class="tiny muted">${escapeHtml(state.meta.staffLabels[candidate.role])}</div><div class="tiny">${money(candidate.salary)} • ${escapeHtml(candidate.specialty)}</div><button class="secondary wide" data-game-action="hireCandidate" data-candidate-id="${candidate.id}" type="button" ${filled || state.busy ? 'disabled' : ''}>${filled ? 'Position filled' : 'Hire candidate'}</button></div>`;
  }).join('');
  const sectionRows = Object.entries(corps.sections).map(([key, section]) => `<div class="stat-row"><span>${escapeHtml(labelize(key))}</span><b>${section.count}/${state.meta.sectionTargets[key]} • talent ${number(section.talent)} • movement ${number(section.movement)}</b></div>`).join('');
  const tourCards = Object.entries(state.meta.tourPlans).map(([id, item]) => {
    const food = state.meta.foodPlans[corps.foodPlan || 'standard'];
    const sponsor = state.meta.sponsors[corps.sponsor || 'arts'];
    const approximate = item.weeklyCost + food.weeklyCost - sponsor.weeklySupport;
    return `<button class="plan-choice ${corps.tourPlan === id ? 'selected' : ''}" data-game-action="route" data-plan="${id}" type="button" ${state.busy ? 'disabled' : ''}><b>${escapeHtml(item.label)}</b><span>About ${money(approximate)}/week</span><small>${item.fans} fan growth • burnout ${item.burnout >= 0 ? '+' : ''}${item.burnout}</small></button>`;
  }).join('');

  $('#setupStages').innerHTML = `
    <article class="stage-card ${checklist.identity ? 'complete' : ''}">
      <div class="stage-heading"><h3><span class="stage-number">1</span>Identity</h3><span>${checklist.identity ? '✓ Complete' : 'Required'}</span></div>
      <form data-stage-form="configure"><div class="form-grid"><div><label>Corps name</label><input name="corpsName" value="${escapeHtml(corps.corpsName)}" required></div><div><label>Show title</label><input name="showTitle" value="${escapeHtml(corps.showTitle)}" required></div><div><label>Director</label><input name="director" value="${escapeHtml(corps.director)}"></div><div><label>Home city</label><input name="home" value="${escapeHtml(corps.home)}"></div><div><label>Competitive strength</label><select name="buff">${state.meta.buffs.map(value => `<option ${value === corps.buff ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}</select></div></div><button class="primary" type="submit" ${state.busy ? 'disabled' : ''}>Save identity</button></form>
    </article>

    <article class="stage-card ${checklist.finance ? 'complete' : ''}">
      <div class="stage-heading"><h3><span class="stage-number">2</span>Money</h3><span>${money(corps.budget)} available</span></div>
      <p class="muted">Choose one sponsor and one food plan. Tour expenses are charged weekly, so keep a cash buffer.</p>
      <form data-stage-form="finance"><div class="form-grid"><div><label>Sponsor</label><select name="sponsor" ${corps.sponsor ? 'disabled' : ''}>${selectOptions(state.meta.sponsors, corps.sponsor || 'arts')}</select>${corps.sponsor ? `<input type="hidden" name="sponsor" value="${corps.sponsor}">` : ''}</div><div><label>Food plan</label><select name="foodPlan">${selectOptions(state.meta.foodPlans, corps.foodPlan || 'standard')}</select></div></div><button class="primary" type="submit" ${state.busy ? 'disabled' : ''}>${corps.sponsor ? 'Update food plan' : 'Sign finance plan'}</button></form>
      <div class="budget-callout"><b>Projected ten-week cost: ${money(budget.projectedTourCost)}</b><span>Projected cash after tour: ${money(budget.projectedFinish)}</span></div>
      <h4>Optional facilities</h4><div class="staff-grid">${facilityCards}</div>
      <h4>Optional fundraising</h4><div class="staff-grid">${fundraiserCards}</div>
    </article>

    <article class="stage-card ${checklist.staff ? 'complete' : ''}">
      <div class="stage-heading"><h3><span class="stage-number">3</span>Staff office</h3><span>${checklist.staff ? '✓ Contracts complete' : 'Hiring required'}</span></div>
      <p class="muted">Staff stay with the corps between seasons. Retained staff must be renewed each year; candidates are randomized privately and can reach 99 OVR. Their ratings directly affect their assigned captions and operations.</p>
      ${lobby.me.staffRenewalCost > 0 ? `<div class="budget-callout"><b>Retained staff renewal: ${money(lobby.me.staffRenewalCost)}</b><button class="primary" data-game-action="renewStaff" type="button" ${state.busy ? 'disabled' : ''}>Renew retained staff</button></div>` : ''}
      <h4>Current staff</h4><div class="staff-grid">${currentStaffCards}</div>
      <div class="stage-heading staff-market-heading"><h4>Private candidate market</h4><span>${corps.staffMarketRefreshes || 0}/2 refreshes used</span></div>
      <div class="market-tools"><button class="secondary" data-game-action="refreshStaffMarket" type="button" ${(corps.staffMarketRefreshes || 0) >= 2 || state.busy ? 'disabled' : ''}>Refresh market — ${money(state.meta.staffMarketRefreshCost)}</button></div>
      <div class="staff-grid market-grid">${marketCards}</div>
    </article>

    <article class="stage-card ${checklist.program && checklist.members && checklist.training ? 'complete' : ''}">
      <div class="stage-heading"><h3><span class="stage-number">4</span>Show & members</h3><span>${checklist.training ? '✓ Complete' : 'Three one-time plans'}</span></div>
      ${corps.design ? `<div class="summary-card"><b>${escapeHtml(corps.design.concept)}</b><span>${corps.design.complexity} complexity • ${escapeHtml(corps.design.focus)} focus • ${money(corps.design.cost)}</span></div>` : `<form data-stage-form="design"><div class="form-grid"><div><label>Concept</label><input name="concept" value="${escapeHtml(corps.showTitle)}"></div><div><label>Complexity (40–90)</label><input type="number" name="complexity" min="40" max="90" value="65"></div><div><label>Focus</label><select name="focus"><option value="balanced">Balanced</option><option value="ge">GE</option><option value="visual">Visual</option><option value="music">Music</option></select></div></div><button class="primary" type="submit" ${state.busy ? 'disabled' : ''}>Design the show</button></form>`}
      <h4>Audition season</h4><p class="tiny muted">Your ${Math.round(corps.fans).toLocaleString()} fans currently add +${number(lobby.me.fanRecruitingBonus)} talent to recruiting.</p>${sectionRows}<button class="primary wide" data-game-action="auditions" type="button" ${corps.auditionsComplete || state.busy ? 'disabled' : ''}>${corps.auditionsComplete ? 'Auditions complete' : 'Run the full audition season'}</button>
      <h4>Spring training</h4>${corps.trainingPlan ? `<div class="summary-card"><b>${escapeHtml(state.meta.trainingPlans[corps.trainingPlan.type]?.label || corps.trainingPlan.type)}</b><span>${escapeHtml(corps.trainingPlan.focus)} focus</span></div>` : `<form data-stage-form="training"><div class="form-grid"><div><label>Camp plan</label><select name="type">${selectOptions(state.meta.trainingPlans, 'balanced')}</select></div><div><label>Focus</label><select name="focus"><option value="all">Balanced</option><option value="ge">GE</option><option value="visual">Visual</option><option value="music">Music</option><option value="brass">Brass</option><option value="percussion">Percussion</option><option value="guard">Guard</option></select></div></div><button class="primary" type="submit" ${!corps.auditionsComplete || state.busy ? 'disabled' : ''}>Complete spring training</button></form>`}
    </article>

    <article class="stage-card ${checklist.tour ? 'complete' : ''}">
      <div class="stage-heading"><h3><span class="stage-number">5</span>Tour plan</h3><span>${checklist.tour ? '✓ Selected' : 'Required'}</span></div>
      <p class="muted">The plan controls weekly travel cost, fan growth, burnout, and score development. It can be changed until the season starts.</p><div class="plan-grid">${tourCards}</div>
      <details class="details-block"><summary>View the ten-event schedule</summary><div class="schedule-list">${state.meta.tourSchedule.map(item => `<div><b>${item.week}. ${escapeHtml(item.name)}</b><span>${escapeHtml(item.city)} • ${escapeHtml(item.tier)}</span></div>`).join('')}</div></details>
    </article>

    <article class="stage-card recommended-card ${lobby.me.setupComplete ? 'complete' : ''}"><div class="stage-heading"><h3>Recommended Setup</h3><span>${lobby.me.setupComplete ? 'Ready eligible' : 'One-click option'}</span></div><p class="muted">Completes only the missing required plans with balanced choices. Optional fundraising and facilities remain optional.</p><button class="secondary wide" data-game-action="quickBuild" type="button" ${state.busy ? 'disabled' : ''}>Complete missing setup</button></article>`;
}

function renderPrivateLog() {
  const entries = state.lobby.me.corps.log || [];
  $('#privateLog').innerHTML = entries.map(entry => `<div class="log-entry">${escapeHtml(entry)}</div>`).join('') || '<div>No private log entries.</div>';
}
function renderStandings() {
  const lobby = state.lobby;
  if (!lobby.standings.length) { $('#standings').innerHTML = '<div class="empty">No scored contest yet.</div>'; return; }
  $('#standings').innerHTML = `<table class="standings-table"><thead><tr><th>Place</th><th>Corps</th><th>Score</th></tr></thead><tbody>${lobby.standings.map(row => `<tr class="${row.userId === state.user.id ? 'my-row' : ''}"><td>${row.placement}</td><td>${escapeHtml(row.corpsName)}<div class="tiny muted">${escapeHtml(row.showTitle || '')}</div></td><td><b>${number(row.score, 2)}</b>${row.penalty ? `<div class="tiny">-${number(row.penalty, 2)}</div>` : ''}</td></tr>`).join('')}</tbody></table>`;
}
function renderHistory() {
  const history = state.lobby.history;
  $('#history').innerHTML = history.length ? history.slice().reverse().map(item => `<div class="history-card"><b>Week ${item.week}: ${escapeHtml(item.schedule?.name || 'Contest')}</b><div class="tiny muted">${escapeHtml(item.tourEvent?.title || 'Tour week')} • Winner: ${escapeHtml(item.winner?.corpsName || 'None')} ${item.winner ? `• ${number(item.winner.score, 2)}` : ''}</div></div>`).join('') : '<div class="empty">No completed contests.</div>';
}

async function postAction(action, payload = {}) {
  if (state.busy) return;
  state.busy = true; renderLobby();
  try {
    const response = await api(`/api/lobbies/${state.currentLobbyId}/action`, {
      method: 'POST', body: { action, payload, actionId: actionId(), expectedRevision: state.lobby.me.revision },
    });
    acceptLobby(response.lobby); renderLobby(); notice('Your corps was updated.');
  } catch (error) {
    if (error.payload?.lobby) { acceptLobby(error.payload.lobby); renderLobby(); }
    notice(error.message, 'error');
  } finally { state.busy = false; renderLobby(); }
}
async function handleStageSubmit(event) {
  const form = event.target.closest('form[data-stage-form]');
  if (!form) return;
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form).entries());
  if (payload.complexity) payload.complexity = Number(payload.complexity);
  await postAction(form.dataset.stageForm, payload);
}
async function handleStageClick(event) {
  const button = event.target.closest('[data-game-action]');
  if (!button) return;
  const action = button.dataset.gameAction;
  let payload = {};
  if (action === 'buyFacility') payload = { facility: button.dataset.facility };
  if (action === 'hireStaff') { const role = button.dataset.role; payload = { role, tier: document.querySelector(`[data-staff-tier="${role}"]`).value }; }
  if (action === 'hirePackage') payload = { tier: button.dataset.tier };
  if (action === 'hireCandidate') payload = { candidateId: button.dataset.candidateId };
  if (action === 'fireStaff') payload = { role: button.dataset.role };
  if (action === 'fundraise') payload = { type: button.dataset.fundraiser };
  if (action === 'route') payload = { plan: button.dataset.plan };
  await postAction(action, payload);
}
async function handleReadyControl(event) {
  if (!event.target.closest('#readyButton') || state.busy) return;
  state.busy = true;
  try {
    const response = await api(`/api/lobbies/${state.currentLobbyId}/ready`, { method: 'POST', body: { ready: !state.lobby.me.ready } });
    acceptLobby(response.lobby); renderLobby(); notice(state.lobby.me.ready ? 'You are ready.' : 'You are no longer ready.');
  } catch (error) { if (error.payload?.lobby) acceptLobby(error.payload.lobby); notice(error.message, 'error'); }
  finally { state.busy = false; renderLobby(); }
}
async function handleHostControl(event) {
  const button = event.target.closest('[data-host-action]');
  if (!button || state.busy) return;
  const action = button.dataset.hostAction;
  if (action === 'delete') return deleteLobby(state.currentLobbyId, state.lobby.name);
  if (action === 'recap') return openRecap(state.lobby.latestArchiveId, true);
  if (action === 'next-season') return beginNextSeason();
  state.busy = true;
  try {
    const endpoint = action === 'advance' ? 'advance' : 'start';
    const body = action === 'force-start' ? { force: true } : {};
    const response = await api(`/api/lobbies/${state.currentLobbyId}/${endpoint}`, { method: 'POST', body });
    acceptLobby(response.lobby); renderLobby();
    if (state.lobby.status === 'complete' && state.lobby.latestArchiveId) await openRecap(state.lobby.latestArchiveId, true);
    notice(action === 'advance' ? 'Season advanced.' : 'Season started.');
  } catch (error) { if (error.payload?.lobby) acceptLobby(error.payload.lobby); notice(error.message, 'error'); }
  finally { state.busy = false; if (!recapScreen.classList.contains('hidden')) return; renderLobby(); }
}
async function openRecap(archiveId, fromLobby = false) {
  if (!archiveId) return notice('No saved recap is available yet.', 'error');
  try {
    const payload = await api(`/api/account/recaps/${archiveId}`);
    state.activeRecap = { ...payload, recap: payload.recap };
    state.recapFromLobby = fromLobby;
    renderRecapScreen();
    showOnly(recapScreen);
  } catch (error) { notice(error.message, 'error'); }
}
function renderRecapScreen() {
  const recap = state.activeRecap?.recap;
  const me = state.activeRecap?.myPlayer;
  if (!recap) return;
  $('#recapKicker').textContent = `${recap.lobbyName} • Season ${recap.season}`;
  $('#recapTitle').textContent = recap.champion ? `${recap.champion.corpsName} wins Season ${recap.season}` : `Season ${recap.season} recap`;
  $('#recapHero').innerHTML = `<div class="eyebrow">World Championship complete</div><h3>${escapeHtml(recap.champion?.corpsName || 'Season complete')}</h3><div class="recap-score">${number(recap.champion?.score, 2)}</div><p>${recap.playerIds.length} directors • 10 contests • Saved ${new Date(recap.completedAt).toLocaleDateString()}</p>`;
  $('#recapFinalStandings').innerHTML = recapTable(recap.finalStandings || []);
  $('#recapWeeks').innerHTML = (recap.weeks || []).map(week => `<details class="recap-week" ${week.week === 10 ? 'open' : ''}><summary><span>Week ${week.week}: ${escapeHtml(week.schedule?.name || 'Contest')}</span><b>${escapeHtml(week.standings?.[0]?.corpsName || '')} ${number(week.standings?.[0]?.score, 2)}</b></summary><div class="tiny muted recap-event-line">${escapeHtml(week.schedule?.city || '')} • ${escapeHtml(week.tourEvent?.title || 'Tour contest')}</div>${recapTable(week.standings || [])}</details>`).join('');
  $('#recapPersonal').innerHTML = me ? `<div class="personal-finish"><span>Final placement</span><b>${me.finalPlacement || '—'}</b><span>Final score</span><b>${number(me.finalScore, 2)}</b></div><h4>${escapeHtml(me.corpsName)}</h4><p class="muted">${escapeHtml(me.showTitle || '')}</p><div class="score-timeline">${(me.scores || []).map(score => `<div><span>W${score.week} • ${escapeHtml(score.event?.schedule?.name || state.meta.tourSchedule[score.week - 1]?.name || 'Contest')}</span><b>${number(score.score, 2)}</b><small>${score.placement} of ${score.totalCompetitors}</small></div>`).join('')}</div><div class="stat-row"><span>Ending cash</span><b>${money(me.budgetEnd)}</b></div><div class="stat-row"><span>Fans</span><b>${Math.round(me.fans || 0).toLocaleString()}</b></div><div class="stat-row"><span>Legacy</span><b>${number(me.legacy)}</b></div>` : '<div class="empty">Your personal result was not found.</div>';
  const next = $('#nextSeasonButton');
  const canNext = Boolean(state.recapFromLobby && state.lobby?.isHost && state.lobby?.status === 'complete' && state.lobby?.latestArchiveId === recap.id);
  next.classList.toggle('hidden', !canNext);
  next.textContent = `Start season ${Number(recap.season) + 1}`;
}
function recapTable(rows) {
  return `<table class="standings-table recap-table"><thead><tr><th>Place</th><th>Corps</th><th>Show</th><th>Score</th></tr></thead><tbody>${rows.map(row => `<tr class="${row.userId === state.user.id ? 'my-row' : ''}"><td>${row.placement}</td><td><b>${escapeHtml(row.corpsName)}</b></td><td>${escapeHtml(row.showTitle || '')}</td><td><b>${number(row.score, 2)}</b></td></tr>`).join('')}</tbody></table>`;
}
async function beginNextSeason() {
  if (!state.currentLobbyId || state.busy) return;
  if (!window.confirm(`Open season ${state.lobby.season + 1}? Scores and recaps will stay saved.`)) return;
  state.busy = true;
  try {
    const response = await api(`/api/lobbies/${state.currentLobbyId}/next-season`, { method: 'POST', body: {} });
    acceptLobby(response.lobby);
    state.activeRecap = null;
    state.dismissedRecapId = null;
    showOnly(lobbyScreen);
    renderLobby();
    notice(`Season ${state.lobby.season} preseason is open.`);
  } catch (error) { notice(error.message, 'error'); }
  finally { state.busy = false; }
}
function downloadActiveRecap() {
  const recap = state.activeRecap?.recap;
  if (!recap) return;
  const blob = new Blob([JSON.stringify(recap, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${recap.lobbyName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-season-${recap.season}-recap.json`;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}
async function handleRecapControl(event) {
  if (event.target.closest('#downloadRecap')) return downloadActiveRecap();
  if (event.target.closest('#nextSeasonButton')) return beginNextSeason();
  if (event.target.closest('#recapBack')) {
    const recapId = state.activeRecap?.recap?.id;
    if (state.recapFromLobby && state.lobby) {
      state.dismissedRecapId = recapId;
      showOnly(lobbyScreen); renderLobby();
    } else await showDashboard();
  }
}

async function handleEventChoice(event) {
  const button = event.target.closest('[data-event-id]');
  if (!button || state.busy) return;
  state.busy = true; renderLobby();
  try {
    const response = await api(`/api/lobbies/${state.currentLobbyId}/event-choice`, {
      method: 'POST', body: { eventId: button.dataset.eventId, choiceId: button.dataset.choiceId, actionId: actionId(), expectedRevision: state.lobby.me.revision },
    });
    acceptLobby(response.lobby); renderLobby(); notice('Private tour choice locked.');
  } catch (error) { if (error.payload?.lobby) acceptLobby(error.payload.lobby); notice(error.message, 'error'); }
  finally { state.busy = false; renderLobby(); }
}

document.addEventListener('DOMContentLoaded', boot);

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../game-engine');

function user(id, username) { return { id, username }; }
function complete(corps, seed) {
  game.applyAction(corps, 'quickBuild', {}, seed, { actionId: `${seed}-quick`, expectedRevision: corps.revision });
  if (!corps.showTitle) {
    game.applyAction(corps, 'configure', {
      corpsName: `${corps.ownerUsername} Regiment`, showTitle: 'Test Production',
      director: corps.ownerUsername, home: 'Austin, TX', buff: 'Music GE',
    }, seed, { actionId: `${seed}-identity`, expectedRevision: corps.revision });
  }
}

test('new corps have a $150,000 budget, ledger, and no difficulty', () => {
  const corps = game.createCorps('u1', 'Alpha', 'budget');
  assert.equal(corps.budget, 150000);
  assert.equal(corps.startingBudget, 150000);
  assert.equal(Object.hasOwn(corps, 'difficulty'), false);
  assert.equal(corps.ledger[0].balance, 150000);
  assert.equal(corps.revision, 0);
});

test('player actions are isolated, revisioned, and idempotent', () => {
  const lobby = game.createLobby(user('u1', 'Alpha'), 'Test Lobby');
  game.addPlayerToLobby(lobby, user('u2', 'Bravo'));
  const alpha = lobby.players.u1.corps;
  const bravo = lobby.players.u2.corps;
  const bravoBudget = bravo.budget;

  game.applyAction(alpha, 'finance', { sponsor: 'arts', foodPlan: 'standard' }, 'iso', {
    actionId: 'finance-1', expectedRevision: 0,
  });
  const afterFirst = alpha.budget;
  const duplicate = game.applyAction(alpha, 'finance', { sponsor: 'arts', foodPlan: 'standard' }, 'iso', {
    actionId: 'finance-1', expectedRevision: 0,
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(alpha.budget, afterFirst);
  assert.equal(bravo.budget, bravoBudget);
  assert.equal(alpha.revision, 1);
  assert.equal(bravo.revision, 0);
  assert.throws(() => game.applyAction(alpha, 'route', { plan: 'balanced' }, 'iso', {
    actionId: 'stale', expectedRevision: 0,
  }), /another tab/);
});

test('recommended setup produces a clear, complete preseason plan', () => {
  const corps = game.createCorps('u1', 'Alpha', 'setup');
  complete(corps, 'setup');
  const checklist = game.readyChecklist(corps);
  assert.equal(Object.values(checklist).every(Boolean), true);
  assert.equal(game.isCorpsReady(corps), true);
  assert.equal(game.STAFF_ROLES.every(role => corps.staff[role]), true);
  assert.equal(corps.auditionsComplete, true);
  assert.ok(corps.trainingPlan);
  assert.ok(corps.tourPlan);
  assert.ok(corps.budget > 0);
});

test('ten named contests generate a tour decision every week', () => {
  const lobby = game.createLobby(user('u1', 'Alpha'), 'Tour Test');
  game.addPlayerToLobby(lobby, user('u2', 'Bravo'));
  complete(lobby.players.u1.corps, 'one');
  complete(lobby.players.u2.corps, 'two');
  lobby.players.u1.ready = true;
  lobby.players.u2.ready = true;
  game.startSeason(lobby);

  for (let week = 1; week <= 10; week += 1) {
    assert.equal(lobby.phase, 'choices');
    assert.equal(lobby.tourEvent.week, week);
    assert.equal(lobby.tourEvent.schedule.name, game.TOUR_SCHEDULE[week - 1].name);
    assert.ok(lobby.players.u1.corps.pendingEvent);
    assert.ok(lobby.players.u2.corps.pendingEvent);
    assert.notEqual(lobby.players.u1.corps.pendingEvent, lobby.players.u2.corps.pendingEvent);
    game.advanceSeason(lobby);
    assert.equal(lobby.standings.length, 2);
    assert.equal(lobby.standings.every(entry => entry.type === 'player'), true);
    if (week < 10) game.advanceSeason(lobby);
  }

  assert.equal(lobby.status, 'complete');
  assert.equal(lobby.history.length, 10);
  assert.equal(lobby.history[9].schedule.name, 'World Championship Finals');
  assert.equal(lobby.players.u1.corps.scoreHistory.length, 10);
  assert.ok(lobby.players.u1.corps.ledger.some(entry => entry.week === 1));
});

test('different directors can lock different choices without cross-effects', () => {
  const lobby = game.createLobby(user('u1', 'Alpha'), 'Choice Test');
  game.addPlayerToLobby(lobby, user('u2', 'Bravo'));
  complete(lobby.players.u1.corps, 'one');
  complete(lobby.players.u2.corps, 'two');
  lobby.players.u1.ready = true;
  lobby.players.u2.ready = true;
  game.startSeason(lobby);
  const alpha = lobby.players.u1.corps;
  const bravo = lobby.players.u2.corps;
  const alphaChoice = alpha.pendingEvent.options[0].id;
  const bravoChoice = bravo.pendingEvent.options.at(-1).id;
  game.chooseEvent(alpha, alpha.pendingEvent.id, alphaChoice, { actionId: 'a-choice', expectedRevision: alpha.revision });
  game.chooseEvent(bravo, bravo.pendingEvent.id, bravoChoice, { actionId: 'b-choice', expectedRevision: bravo.revision });
  assert.equal(alpha.pendingEvent.choice, alphaChoice);
  assert.equal(bravo.pendingEvent.choice, bravoChoice);
  assert.notEqual(alpha.pendingEvent.choice, bravo.pendingEvent.choice);
});

test('fundraising scales with interest and remains limited', () => {
  const base = game.createCorps('same-user', 'Alpha', 'fundraiser');
  base.updatedAt = '2026-01-01T00:00:00.000Z';
  const low = structuredClone(base);
  const high = structuredClone(base);
  low.interest = 5;
  high.interest = 75;
  game.applyAction(low, 'fundraise', { type: 'community' }, 'same-seed');
  game.applyAction(high, 'fundraise', { type: 'community' }, 'same-seed');
  assert.ok(high.fundraisingHistory[0].gross > low.fundraisingHistory[0].gross);
  assert.ok(high.fundraisingHistory[0].successChance > low.fundraisingHistory[0].successChance);
  assert.throws(() => game.applyAction(high, 'fundraise', { type: 'community' }, 'same-seed'), /already been used/);
  game.applyAction(high, 'fundraise', { type: 'alumni' }, 'same-seed');
  game.applyAction(high, 'fundraise', { type: 'corporate' }, 'same-seed');
  assert.equal(high.fundraisingHistory.length, 3);
});

test('personalized lobby views expose only the requesting player private state', () => {
  const lobby = game.createLobby(user('u1', 'Alpha'), 'Privacy Test');
  game.addPlayerToLobby(lobby, user('u2', 'Bravo'));
  const view = game.lobbyView(lobby, 'u1');
  const other = view.players.find(player => player.userId === 'u2');
  assert.equal(Object.hasOwn(other, 'budget'), false);
  assert.equal(Object.hasOwn(other, 'captions'), false);
  assert.equal(Object.hasOwn(other, 'revision'), false);
  assert.equal(view.me.corps.ownerUserId, 'u1');
  assert.equal(view.me.revision, lobby.players.u1.corps.revision);
});

test('staff markets are randomized, role-specific, and can produce 99 OVR candidates', () => {
  const corps = game.createCorps('u-market', 'Market', 'market-seed');
  assert.equal(corps.staffMarket.length, game.STAFF_ROLES.length * 4);
  assert.equal(corps.staffMarket.every(candidate => game.STAFF_ROLES.includes(candidate.role)), true);
  assert.equal(corps.staffMarket.every(candidate => candidate.overall >= 45 && candidate.overall <= 99), true);
  let found99 = corps.staffMarket.some(candidate => candidate.overall === 99);
  for (let i = 0; i < 120 && !found99; i += 1) {
    found99 = game.generateStaffMarket(`search-${i}`, 1, i).some(candidate => candidate.overall === 99);
  }
  assert.equal(found99, true);

  const director = corps.staffMarket.find(candidate => candidate.role === 'director');
  game.applyAction(corps, 'hireCandidate', { candidateId: director.id }, 'market', { actionId: 'hire-market', expectedRevision: corps.revision, season: 1 });
  assert.equal(corps.staff.director.name, director.name);
  assert.equal(corps.staff.director.paidSeason, 1);
  game.applyAction(corps, 'fireStaff', { role: 'director' }, 'market', { actionId: 'fire-market', expectedRevision: corps.revision, season: 1 });
  assert.equal(corps.staff.director, undefined);
});

test('larger fanbases produce stronger recruiting talent with the same random seed', () => {
  const base = game.createCorps('u-fans', 'Fans', 'fans');
  const low = structuredClone(base);
  const high = structuredClone(base);
  low.fans = 600;
  high.fans = 100000;
  low.updatedAt = high.updatedAt = '2026-01-01T00:00:00.000Z';
  game.applyAction(low, 'auditions', {}, 'same-recruiting-seed');
  game.applyAction(high, 'auditions', {}, 'same-recruiting-seed');
  const lowTalent = Object.values(low.sections).reduce((sum, section) => sum + section.talent, 0) / 3;
  const highTalent = Object.values(high.sections).reduce((sum, section) => sum + section.talent, 0) / 3;
  assert.ok(highTalent > lowTalent);
  assert.ok(game.fanRecruitingBonus(high) > game.fanRecruitingBonus(low));
});

test('a completed lobby can archive a full season and open another year with carryover', () => {
  const lobby = game.createLobby(user('u1', 'Alpha'), 'Dynasty League');
  game.addPlayerToLobby(lobby, user('u2', 'Bravo'));
  complete(lobby.players.u1.corps, 'dynasty-one');
  complete(lobby.players.u2.corps, 'dynasty-two');
  lobby.players.u1.ready = true;
  lobby.players.u2.ready = true;
  game.startSeason(lobby);
  for (let week = 1; week <= 10; week += 1) {
    game.advanceSeason(lobby);
    if (week < 10) game.advanceSeason(lobby);
  }
  const archive = game.createSeasonArchive(lobby);
  assert.equal(archive.weeks.length, 10);
  assert.equal(archive.players.length, 2);
  assert.equal(archive.players[0].scores.length, 10);
  assert.equal(archive.finalStandings.length, 2);

  const alpha = lobby.players.u1.corps;
  const carried = {
    budget: alpha.budget,
    fans: alpha.fans,
    facilities: structuredClone(alpha.facilities),
    staffNames: Object.fromEntries(Object.entries(alpha.staff).map(([role, person]) => [role, person.name])),
  };
  game.startNextSeason(lobby);
  assert.equal(lobby.season, 2);
  assert.equal(lobby.status, 'setup');
  assert.equal(lobby.history.length, 0);
  assert.equal(alpha.budget, carried.budget);
  assert.equal(alpha.fans, carried.fans);
  assert.deepEqual(alpha.facilities, carried.facilities);
  assert.deepEqual(Object.fromEntries(Object.entries(alpha.staff).map(([role, person]) => [role, person.name])), carried.staffNames);
  assert.equal(alpha.showTitle, '');
  assert.equal(alpha.auditionsComplete, false);
  assert.equal(alpha.staffMarketSeason, 2);
  assert.equal(game.readyChecklist(alpha).staff, false);
});

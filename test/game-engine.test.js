'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../game-engine');

function user(id, username) { return { id, username }; }
function complete(corps, seed) {
  game.applyAction(corps, 'quickBuild', {}, seed);
  game.applyAction(corps, 'configure', {
    corpsName: `${corps.ownerUsername} Regiment`,
    showTitle: 'Test Production',
    director: corps.ownerUsername,
    home: 'Austin, TX',
    difficulty: 'normal',
    buff: 'Music GE',
  }, seed);
  game.applyAction(corps, 'office', { sponsor: 'arts', facility: 'office', foodBudget: 60 }, seed);
}

test('lobby gives each player an independent private corps', () => {
  const lobby = game.createLobby(user('u1', 'Alpha'), 'Test Lobby');
  game.addPlayerToLobby(lobby, user('u2', 'Bravo'));
  assert.notEqual(lobby.players.u1.corps, lobby.players.u2.corps);
  lobby.players.u1.corps.budget -= 100;
  assert.notEqual(lobby.players.u1.corps.budget, lobby.players.u2.corps.budget);
});

test('ready checklist and ten-week season work', () => {
  const lobby = game.createLobby(user('u1', 'Alpha'), 'Test Lobby');
  game.addPlayerToLobby(lobby, user('u2', 'Bravo'));
  complete(lobby.players.u1.corps, 'one');
  complete(lobby.players.u2.corps, 'two');
  assert.equal(game.isCorpsReady(lobby.players.u1.corps), true);
  assert.equal(game.isCorpsReady(lobby.players.u2.corps), true);
  lobby.players.u1.ready = true;
  lobby.players.u2.ready = true;
  game.startSeason(lobby);
  assert.equal(lobby.week, 1);
  for (let week = 1; week <= 10; week += 1) {
    assert.equal(lobby.phase, 'choices');
    game.advanceSeason(lobby);
    assert.ok(lobby.standings.length >= 18);
    if (week < 10) {
      assert.equal(lobby.phase, 'results');
      game.advanceSeason(lobby);
      assert.equal(lobby.week, week + 1);
    }
  }
  assert.equal(lobby.status, 'complete');
  assert.equal(lobby.history.length, 10);
  assert.equal(lobby.players.u1.corps.scoreHistory.length, 10);
});

test('personalized lobby view does not expose another corps private state', () => {
  const lobby = game.createLobby(user('u1', 'Alpha'), 'Test Lobby');
  game.addPlayerToLobby(lobby, user('u2', 'Bravo'));
  const view = game.lobbyView(lobby, 'u1');
  const other = view.players.find(player => player.userId === 'u2');
  assert.equal(Object.hasOwn(other, 'budget'), false);
  assert.equal(Object.hasOwn(other, 'captions'), false);
  assert.equal(view.me.corps.ownerUserId, 'u1');
});

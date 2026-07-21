'use strict';

const crypto = require('node:crypto');

const SECTION_TARGETS = { brass: 80, percussion: 38, guard: 47 };
const CAPTIONS = [
  ['musicGE', 'Music GE'],
  ['visualGE', 'Visual GE'],
  ['visualPerformance', 'Visual Performance'],
  ['visualAnalysis', 'Visual Analysis'],
  ['colorGuard', 'Color Guard'],
  ['brass', 'Brass Performance'],
  ['musicAnalysis', 'Music Analysis'],
  ['percussion', 'Percussion'],
];
const VALID_BUFFS = CAPTIONS.map(([, label]) => label);
const STAFF_ROLES = ['director', 'program', 'brass', 'percussion', 'guard', 'visual', 'music', 'drill', 'tour', 'food'];
const STAFF_LABELS = {
  director: 'Corps Director', program: 'Program Coordinator', brass: 'Brass Caption Head',
  percussion: 'Percussion Caption Head', guard: 'Guard Caption Head', visual: 'Visual Caption Head',
  music: 'Music Arranger', drill: 'Drill Designer', tour: 'Tour Director', food: 'Food Manager',
};
const FACILITIES = {
  office: { label: 'Admin Office', cost: 2500 }, field: { label: 'Rehearsal Field', cost: 3200 },
  kitchen: { label: 'Food Program', cost: 2000 }, fleet: { label: 'Equipment Fleet', cost: 3600 },
  recruit: { label: 'Recruiting Network', cost: 2800 }, design: { label: 'Design Lab', cost: 3400 },
};
const CPU_CORPS = [
  ['Blue Devils', 72.2, 96.2, 0.96], ['Bluecoats', 71.7, 95.7, 0.99],
  ['Boston Crusaders', 71.2, 95.2, 1.02], ['Carolina Crown', 69.8, 94.0, 1.01],
  ['Phantom Regiment', 68.9, 93.2, 1.03], ['Santa Clara Vanguard', 68.1, 92.4, 1.04],
  ['Mandarins', 67.8, 91.7, 1.06], ['The Cavaliers', 66.5, 90.4, 1.0],
  ['Blue Stars', 66.2, 90.0, 1.01], ['Troopers', 65.8, 89.6, 1.02],
  ['Colts', 65.4, 88.9, 1.04], ['Madison Scouts', 65.8, 89.2, 1.05],
  ['Blue Knights', 64.9, 88.4, 1.02], ['Crossmen', 64.2, 86.9, 1.01],
  ['Pacific Crest', 63.9, 86.4, 1.04], ['Spirit of Atlanta', 63.5, 86.2, 1.03],
];

function clamp(n, min, max) { return Math.max(min, Math.min(max, Number(n))); }
function round2(n) { return Math.round(Number(n) * 100) / 100; }
function nowIso() { return new Date().toISOString(); }
function randomId(bytes = 8) { return crypto.randomBytes(bytes).toString('hex'); }
function seedNumber(text) {
  const hash = crypto.createHash('sha256').update(String(text)).digest();
  return hash.readUInt32LE(0);
}
function rngFromSeed(seedText) {
  let a = seedNumber(seedText) || 1;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }
function safeText(value, max = 60) { return String(value ?? '').trim().replace(/[<>]/g, '').slice(0, max); }

function emptyCaptions(rng) {
  const captions = {};
  for (const [key] of CAPTIONS) {
    captions[key] = {
      content: round2(5.85 + rng() * 0.55),
      achievement: round2(5.75 + rng() * 0.55),
    };
  }
  return captions;
}

function defaultModifiers() {
  return {
    nextFlat: 0,
    futureIncrementBonus: 0,
    futureAllPenalty: 0,
    skipNextIncrease: 0,
    nextGeDelta: 0,
    nextOtherDelta: 0,
    nextCaptionDelta: {},
    nextAllDelta: 0,
    nextAchievementDelta: 0,
    persistentNotes: [],
  };
}

function createCorps(userId, username, seed = '') {
  const rng = rngFromSeed(`${seed}:${userId}:${username}`);
  return {
    ownerUserId: userId,
    ownerUsername: username,
    corpsName: `${username}'s Corps`,
    showTitle: '',
    director: username,
    buff: 'Music GE',
    home: 'Dallas, TX',
    difficulty: 'normal',
    budget: 62000,
    sponsor: null,
    facilities: {},
    foodBudget: 50,
    staff: {},
    design: null,
    sections: {
      brass: { count: 0, talent: 0, movement: 0 },
      percussion: { count: 0, talent: 0, movement: 0 },
      guard: { count: 0, talent: 0, movement: 0 },
    },
    auditionCamps: 0,
    routeStrategy: null,
    trainingBlocks: 0,
    morale: 70,
    burnout: 5,
    injury: 0,
    fans: 600,
    reputation: 6,
    interest: 7,
    legacy: 0,
    captions: emptyCaptions(rng),
    modifiers: defaultModifiers(),
    pendingEvent: null,
    latestScore: null,
    latestPlacement: null,
    scoreHistory: [],
    log: ['Corps created. Complete the preseason stages or use Quick Build.'],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function addLog(corps, message) {
  corps.log.unshift(`${nowIso()} — ${message}`);
  corps.log = corps.log.slice(0, 80);
  corps.updatedAt = nowIso();
}

function totalMembers(corps) {
  return Object.values(corps.sections).reduce((sum, section) => sum + section.count, 0);
}
function rosterFull(corps) {
  return Object.entries(SECTION_TARGETS).every(([key, target]) => corps.sections[key].count >= target);
}
function averageSection(corps, field) {
  const total = Math.max(1, totalMembers(corps));
  return Object.values(corps.sections).reduce((sum, section) => sum + section[field] * section.count, 0) / total;
}
function staffAverage(corps) {
  const people = Object.values(corps.staff);
  if (!people.length) return 35;
  return people.reduce((sum, person) => sum + person.quality, 0) / people.length;
}
function readyChecklist(corps) {
  return {
    identity: Boolean(corps.corpsName && corps.showTitle && corps.director && VALID_BUFFS.includes(corps.buff)),
    office: Boolean(corps.sponsor && Object.keys(corps.facilities).length >= 1),
    staff: Object.keys(corps.staff).length >= 5,
    design: Boolean(corps.design),
    recruit: corps.auditionCamps >= 4 || rosterFull(corps),
    route: Boolean(corps.routeStrategy),
    training: corps.trainingBlocks >= 8,
  };
}
function isCorpsReady(corps) { return Object.values(readyChecklist(corps)).every(Boolean); }

function spend(corps, amount) {
  amount = Math.max(0, Number(amount) || 0);
  if (corps.budget < amount) throw new Error('Not enough budget for that action.');
  corps.budget = round2(corps.budget - amount);
}

function boostCaption(corps, captionKey, contentDelta, achievementDelta = contentDelta) {
  const caption = corps.captions[captionKey];
  if (!caption) return;
  caption.content = round2(clamp(caption.content + contentDelta, 0, 10.05));
  caption.achievement = round2(clamp(caption.achievement + achievementDelta, 0, 10.05));
}
function boostGroup(corps, group, amount) {
  const map = {
    ge: ['musicGE', 'visualGE'], visual: ['visualPerformance', 'visualAnalysis', 'colorGuard'],
    music: ['brass', 'musicAnalysis', 'percussion'], brass: ['brass', 'musicAnalysis'],
    percussion: ['percussion', 'musicAnalysis'], guard: ['colorGuard', 'visualPerformance'],
    all: CAPTIONS.map(([key]) => key),
  };
  for (const key of map[group] || [group]) boostCaption(corps, key, amount, amount * 0.9);
}

function applyAction(corps, action, payload = {}, contextSeed = '') {
  if (!corps) throw new Error('Corps not found.');
  const rng = rngFromSeed(`${contextSeed}:${corps.ownerUserId}:${action}:${corps.updatedAt}:${corps.log.length}`);

  switch (action) {
    case 'configure': {
      corps.corpsName = safeText(payload.corpsName, 50) || corps.corpsName;
      corps.showTitle = safeText(payload.showTitle, 70);
      corps.director = safeText(payload.director, 50) || corps.ownerUsername;
      corps.home = safeText(payload.home, 60) || corps.home;
      corps.difficulty = ['easy', 'normal', 'hard'].includes(payload.difficulty) ? payload.difficulty : corps.difficulty;
      corps.buff = VALID_BUFFS.includes(payload.buff) ? payload.buff : corps.buff;
      addLog(corps, 'Corps identity and competitive buff updated.');
      break;
    }
    case 'office': {
      const sponsor = ['community', 'arts', 'corporate'].includes(payload.sponsor) ? payload.sponsor : 'community';
      if (!corps.sponsor) {
        corps.sponsor = sponsor;
        corps.budget += sponsor === 'corporate' ? 12000 : sponsor === 'arts' ? 8500 : 6000;
      } else {
        corps.sponsor = sponsor;
      }
      corps.foodBudget = clamp(payload.foodBudget ?? corps.foodBudget, 20, 100);
      const facility = String(payload.facility || '');
      if (FACILITIES[facility] && !corps.facilities[facility]) {
        spend(corps, FACILITIES[facility].cost);
        corps.facilities[facility] = 1;
      }
      addLog(corps, `Office plan set with a ${sponsor} sponsor.`);
      break;
    }
    case 'hireStaff': {
      const role = String(payload.role || '');
      if (!STAFF_ROLES.includes(role)) throw new Error('Invalid staff role.');
      const level = clamp(parseInt(payload.level, 10) || 1, 1, 4);
      const cost = [0, 2500, 4500, 7500, 11000][level];
      if (corps.staff[role]) throw new Error('That staff role is already filled.');
      spend(corps, cost);
      const quality = round2(42 + level * 10 + rng() * 8);
      corps.staff[role] = { role, label: STAFF_LABELS[role], level, quality, salary: cost };
      addLog(corps, `Hired ${STAFF_LABELS[role]} at staff level ${level}.`);
      break;
    }
    case 'design': {
      const difficulty = clamp(payload.bookDifficulty ?? 65, 35, 95);
      const focus = ['ge', 'visual', 'music', 'balanced'].includes(payload.focus) ? payload.focus : 'balanced';
      spend(corps, 3500 + difficulty * 35);
      corps.design = {
        concept: safeText(payload.concept, 80) || corps.showTitle || 'Untitled Production',
        difficulty,
        focus,
      };
      const designQuality = (corps.staff.program?.quality || 35) + (corps.staff.music?.quality || 35) + (corps.staff.drill?.quality || 35);
      const gain = clamp(designQuality / 650, 0.12, 0.38);
      boostGroup(corps, focus === 'balanced' ? 'all' : focus, gain);
      addLog(corps, `Designed a ${focus} production with difficulty ${difficulty}.`);
      break;
    }
    case 'audition': {
      if (corps.auditionCamps >= 4 || rosterFull(corps)) throw new Error('All audition camps are already complete.');
      spend(corps, 2400);
      corps.auditionCamps += 1;
      const recruitFacility = corps.facilities.recruit ? 7 : 0;
      const homeBonus = /TX|Texas|Dallas|Austin|San Antonio/i.test(corps.home) ? 7 : 2;
      const fanBonus = clamp(Math.log10(Math.max(100, corps.fans)) * 3, 0, 10);
      for (const [key, target] of Object.entries(SECTION_TARGETS)) {
        const section = corps.sections[key];
        const remaining = target - section.count;
        if (remaining <= 0) continue;
        const add = Math.min(remaining, Math.max(5, Math.round(target / 4 + (rng() - 0.5) * 8)));
        const quality = clamp(45 + recruitFacility + homeBonus + fanBonus + rng() * 18, 35, 92);
        const movement = clamp(42 + recruitFacility + homeBonus / 2 + rng() * 20, 32, 90);
        const oldCount = section.count;
        section.count += add;
        section.talent = round2((section.talent * oldCount + quality * add) / Math.max(1, section.count));
        section.movement = round2((section.movement * oldCount + movement * add) / Math.max(1, section.count));
      }
      corps.interest = round2(clamp(corps.interest + 2.5 + rng() * 2, 0, 100));
      corps.fans += 80 + Math.round(rng() * 120);
      addLog(corps, `Completed whole-corps audition camp ${corps.auditionCamps} of 4.`);
      break;
    }
    case 'route': {
      const strategy = ['rest', 'balanced', 'aggressive'].includes(payload.strategy) ? payload.strategy : 'balanced';
      corps.routeStrategy = strategy;
      if (strategy === 'aggressive') { corps.burnout = clamp(corps.burnout + 4, 0, 100); corps.fans += 250; }
      if (strategy === 'rest') { corps.morale = clamp(corps.morale + 4, 0, 100); }
      addLog(corps, `Tour strategy set to ${strategy}.`);
      break;
    }
    case 'train': {
      if (corps.trainingBlocks >= 8) throw new Error('All eight training blocks are complete.');
      const focus = ['ge', 'visual', 'music', 'brass', 'percussion', 'guard', 'all'].includes(payload.focus) ? payload.focus : 'all';
      const intense = Boolean(payload.intense);
      const field = corps.facilities.field ? 1.12 : 1;
      const teaching = staffAverage(corps) / 100;
      const gain = (intense ? 0.17 : 0.11) * field * (0.75 + teaching * 0.55);
      boostGroup(corps, focus, gain);
      corps.trainingBlocks += 1;
      corps.burnout = round2(clamp(corps.burnout + (intense ? 5.5 : 2.0), 0, 100));
      corps.morale = round2(clamp(corps.morale + (intense ? -2.5 : 0.5), 0, 100));
      const injuryRisk = (intense ? 0.22 : 0.06) * (corps.facilities.field ? 0.7 : 1);
      if (rng() < injuryRisk) corps.injury = round2(clamp(corps.injury + 2 + rng() * 4, 0, 100));
      addLog(corps, `${intense ? 'Intense ' : ''}${focus} training block completed (${corps.trainingBlocks}/8).`);
      break;
    }
    case 'quickBuild': {
      if (corps.scoreHistory.length) throw new Error('Quick Build is only available before the season starts.');
      corps.showTitle ||= 'Momentum in Motion';
      corps.sponsor ||= 'arts';
      corps.facilities.field = 1;
      corps.facilities.recruit = 1;
      corps.facilities.kitchen = 1;
      for (const [index, role] of STAFF_ROLES.slice(0, 7).entries()) {
        if (!corps.staff[role]) corps.staff[role] = { role, label: STAFF_LABELS[role], level: 2, quality: 62 + index % 3, salary: 4500 };
      }
      corps.design ||= { concept: corps.showTitle, difficulty: 68, focus: 'balanced' };
      corps.auditionCamps = 4;
      for (const [key, target] of Object.entries(SECTION_TARGETS)) {
        corps.sections[key] = { count: target, talent: 66 + rng() * 7, movement: 63 + rng() * 7 };
      }
      corps.routeStrategy ||= 'balanced';
      while (corps.trainingBlocks < 8) {
        corps.trainingBlocks += 1;
        boostGroup(corps, 'all', 0.07);
      }
      corps.budget = Math.max(corps.budget, 14000);
      corps.morale = 72;
      corps.burnout = 18;
      addLog(corps, 'Quick Build completed a balanced preseason setup.');
      break;
    }
    default:
      throw new Error('Unknown game action.');
  }
  return corps;
}

function captionTotals(corps) {
  const parent = {};
  for (const [key, label] of CAPTIONS) {
    parent[key] = round2(corps.captions[key].content + corps.captions[key].achievement);
    parent[label] = parent[key];
  }
  const ge = parent.musicGE + parent.visualGE;
  const visual = (parent.visualPerformance + parent.visualAnalysis + parent.colorGuard) / 2;
  const music = (parent.brass + parent.musicAnalysis + parent.percussion) / 2;
  return { parent, ge: round2(ge), visual: round2(visual), music: round2(music), total: round2(ge + visual + music) };
}

function eventDefinitions(corps, rng) {
  const section = pick(rng, ['brass', 'percussion', 'guard']);
  const captionKey = section === 'guard' ? 'colorGuard' : section;
  return [
    {
      type: 'hotStreak', title: 'Hot Streak Gamble',
      text: 'Take a major boost next week, but accept a small penalty to every later weekly increase.',
      options: [{ id: 'accept', label: 'Take the gamble' }, { id: 'decline', label: 'Stay consistent' }],
    },
    {
      type: 'plateau', title: 'Plateau Into Surge',
      text: 'Sacrifice the next increase to improve every remaining weekly increase.',
      options: [{ id: 'accept', label: 'Rebuild the program' }, { id: 'decline', label: 'Keep the current plan' }],
    },
    {
      type: 'identity', title: 'Identity Reset',
      text: 'A rebrand hurts GE briefly but may improve the non-GE captions.',
      options: [{ id: 'accept', label: 'Rebrand now' }, { id: 'decline', label: 'Protect the current identity' }],
    },
    {
      type: 'party', title: `${STAFF_LABELS[captionKey] || section} Night Out`,
      text: `The ${section} section wants a risky night out before the next contest.`,
      meta: { captionKey },
      options: [{ id: 'accept', label: 'Allow it' }, { id: 'decline', label: 'Enforce curfew' }],
    },
    {
      type: 'newDrill', title: 'New Drill Package',
      text: 'Install new drill that may hurt visual cleanliness while improving Visual GE.',
      options: [{ id: 'accept', label: 'Install the rewrite' }, { id: 'decline', label: 'Keep the current drill' }],
    },
    {
      type: 'sick', title: 'Corps Illness',
      text: 'A large part of the corps is sick. Rest protects health; rehearsal has a volatile result.',
      options: [{ id: 'rest', label: 'Rest the corps' }, { id: 'practice', label: 'Hold rehearsal' }],
    },
    {
      type: 'sectionDilemma', title: 'Section Dilemma',
      text: `The ${section} book is not landing. Choose whether to simplify, rewrite, or trust the current plan.`,
      meta: { captionKey },
      options: [{ id: 'simplify', label: 'Simplify for achievement' }, { id: 'rewrite', label: 'Rewrite for content' }, { id: 'stick', label: 'Stick with it' }],
    },
    {
      type: 'designerEpiphany', title: 'Designer Epiphany',
      text: 'The design team has a late-night concept that could improve GE content at a modest cost.',
      options: [{ id: 'accept', label: 'Fund the change' }, { id: 'decline', label: 'Decline the change' }],
    },
  ];
}

function generatePendingEvent(corps, lobby, week) {
  const rng = rngFromSeed(`${lobby.id}:${lobby.season}:${week}:${corps.ownerUserId}:event`);
  const chance = [3, 5, 7].includes(week) ? 0.78 : 0.24;
  if (rng() > chance) { corps.pendingEvent = null; return null; }
  const def = pick(rng, eventDefinitions(corps, rng));
  corps.pendingEvent = { id: randomId(6), week, ...def, choice: null, createdAt: nowIso() };
  addLog(corps, `Private event received: ${def.title}.`);
  return corps.pendingEvent;
}

function chooseEvent(corps, eventId, choiceId) {
  const event = corps.pendingEvent;
  if (!event || event.id !== eventId) throw new Error('That event is no longer active.');
  if (!event.options.some(option => option.id === choiceId)) throw new Error('Invalid event choice.');
  event.choice = choiceId;
  addLog(corps, `Event choice locked for ${event.title}: ${choiceId}.`);
}

function applyEventResolution(corps, lobby, week) {
  const event = corps.pendingEvent;
  if (!event || event.week !== week) return;
  const choice = event.choice || event.options[event.options.length - 1].id;
  const rng = rngFromSeed(`${lobby.id}:${lobby.season}:${week}:${corps.ownerUserId}:${event.type}:${choice}`);
  const mods = corps.modifiers;
  let note = `${event.title}: no major effect.`;

  if (event.type === 'hotStreak' && choice === 'accept') {
    mods.nextFlat += 0.35; mods.futureAllPenalty -= 0.05;
    note = 'Hot Streak accepted: next scoring boost, later growth penalty.';
  } else if (event.type === 'plateau' && choice === 'accept') {
    mods.skipNextIncrease += 1; mods.futureIncrementBonus += 0.07;
    note = 'Plateau accepted: next increase skipped, future growth improved.';
  } else if (event.type === 'identity' && choice === 'accept') {
    mods.nextGeDelta -= 0.10; mods.nextOtherDelta += 0.075;
    note = 'Identity reset accepted: GE risk with non-GE upside.';
  } else if (event.type === 'party' && choice === 'accept') {
    const key = event.meta?.captionKey || 'brass';
    mods.nextCaptionDelta[key] = (mods.nextCaptionDelta[key] || 0) + (rng() < 0.5 ? -0.10 : 0.10);
    note = `Night out affected ${key} at the next scoring.`;
  } else if (event.type === 'newDrill' && choice === 'accept') {
    mods.nextCaptionDelta.visualPerformance = (mods.nextCaptionDelta.visualPerformance || 0) - 0.12;
    mods.nextCaptionDelta.visualGE = (mods.nextCaptionDelta.visualGE || 0) + 0.18;
    note = 'New drill installed: visual performance risk, Visual GE upside.';
  } else if (event.type === 'sick') {
    if (choice === 'rest') {
      corps.morale = clamp(corps.morale + 3, 0, 100);
      corps.injury = clamp(corps.injury - 2, 0, 100);
      mods.nextAllDelta -= 0.04;
      note = 'The corps rested and protected its health.';
    } else {
      const outcome = rng() < 0.5 ? 0.14 : -0.18;
      mods.nextAllDelta += outcome;
      if (outcome < 0) corps.injury = clamp(corps.injury + 4, 0, 100);
      note = outcome > 0 ? 'The risky rehearsal produced a breakthrough.' : 'The risky rehearsal made the illness worse.';
    }
  } else if (event.type === 'sectionDilemma') {
    const key = event.meta?.captionKey || 'brass';
    if (choice === 'simplify') { boostCaption(corps, key, -0.10, 0.16); note = 'The section simplified the book for cleaner achievement.'; }
    if (choice === 'rewrite') { boostCaption(corps, key, 0.17, -0.10); note = 'The section rewrote the book for more content.'; }
  } else if (event.type === 'designerEpiphany' && choice === 'accept') {
    if (corps.budget >= 1800) {
      spend(corps, 1800);
      boostCaption(corps, rng() < 0.5 ? 'musicGE' : 'visualGE', 0.12 + rng() * 0.18, 0.03);
      note = 'The designer epiphany improved GE content.';
    } else note = 'The corps could not afford the designer change.';
  }

  addLog(corps, note);
  corps.pendingEvent = null;
}

function applyPendingDeltas(corps) {
  const mods = corps.modifiers;
  if (mods.nextAllDelta) {
    for (const [key] of CAPTIONS) boostCaption(corps, key, mods.nextAllDelta, mods.nextAllDelta);
    mods.nextAllDelta = 0;
  }
  if (mods.nextGeDelta) {
    for (const key of ['musicGE', 'visualGE']) boostCaption(corps, key, mods.nextGeDelta, mods.nextGeDelta);
    mods.nextGeDelta = 0;
  }
  if (mods.nextOtherDelta) {
    for (const [key] of CAPTIONS) if (!['musicGE', 'visualGE'].includes(key)) boostCaption(corps, key, mods.nextOtherDelta, mods.nextOtherDelta);
    mods.nextOtherDelta = 0;
  }
  for (const [key, delta] of Object.entries(mods.nextCaptionDelta)) boostCaption(corps, key, delta, delta);
  mods.nextCaptionDelta = {};
  if (mods.nextAchievementDelta) {
    for (const [key] of CAPTIONS) boostCaption(corps, key, 0, mods.nextAchievementDelta);
    mods.nextAchievementDelta = 0;
  }
}

function weeklyIncrement(corps, lobby, week) {
  const rng = rngFromSeed(`${lobby.id}:${lobby.season}:${week}:${corps.ownerUserId}:score`);
  const mods = corps.modifiers;
  const skipped = mods.skipNextIncrease > 0;
  if (skipped) mods.skipNextIncrease -= 1;

  if (!skipped) {
    const talent = averageSection(corps, 'talent');
    const movement = averageSection(corps, 'movement');
    const staff = staffAverage(corps);
    const design = corps.design?.difficulty || 55;
    const readiness = clamp((talent + movement + staff + design) / 400, 0.35, 0.95);
    const health = clamp((corps.morale + (100 - corps.burnout) + (100 - corps.injury)) / 300, 0.35, 1);
    const route = corps.routeStrategy === 'rest' ? 0.015 : corps.routeStrategy === 'aggressive' ? -0.008 : 0.006;
    const base = 0.16 + readiness * 0.17 + health * 0.06 + route + mods.futureIncrementBonus + mods.futureAllPenalty;

    for (const [key, label] of CAPTIONS) {
      let contentGain = base * (0.48 + rng() * 0.18);
      let achievementGain = base * (0.60 + rng() * 0.20);
      if (corps.buff === label) { contentGain += 0.045; achievementGain += 0.045; }
      if (['visualPerformance', 'visualAnalysis', 'colorGuard'].includes(key)) achievementGain += movement / 2200;
      if (['brass', 'musicAnalysis', 'percussion'].includes(key)) achievementGain += talent / 2500;
      if (corps.design?.focus === 'ge' && ['musicGE', 'visualGE'].includes(key)) contentGain += 0.025;
      if (corps.design?.focus === 'visual' && ['visualPerformance', 'visualAnalysis', 'colorGuard'].includes(key)) contentGain += 0.025;
      if (corps.design?.focus === 'music' && ['brass', 'musicAnalysis', 'percussion'].includes(key)) contentGain += 0.025;
      boostCaption(corps, key, contentGain, achievementGain);
    }
  }

  if (mods.nextFlat) {
    for (const [key] of CAPTIONS) boostCaption(corps, key, mods.nextFlat, mods.nextFlat);
    mods.nextFlat = 0;
  }
  applyPendingDeltas(corps);

  const foodRecovery = corps.facilities.kitchen ? 1.8 : 0.7;
  corps.morale = round2(clamp(corps.morale + foodRecovery - corps.burnout / 80, 0, 100));
  corps.burnout = round2(clamp(corps.burnout + (corps.routeStrategy === 'aggressive' ? 2.4 : corps.routeStrategy === 'rest' ? -1.2 : 0.8), 0, 100));
  corps.injury = round2(clamp(corps.injury + (rng() < corps.burnout / 500 ? 1.5 + rng() * 2 : -0.3), 0, 100));
}

function cpuScore(lobby, week, cpu) {
  const [name, start, ceiling, growth] = cpu;
  const rng = rngFromSeed(`${lobby.id}:${lobby.season}:${week}:${name}:cpu`);
  const progress = clamp(week / 10, 0, 1);
  const seasonShift = ((lobby.season - 1) % 5 - 2) * 0.12;
  return round2(start + (ceiling - start) * Math.pow(progress, growth) + seasonShift + (rng() - 0.5) * 0.7);
}

function scoreWeek(lobby) {
  if (lobby.status !== 'running' || lobby.phase !== 'choices') throw new Error('The lobby is not ready to score this week.');
  const week = lobby.week;
  const entries = [];

  for (const player of Object.values(lobby.players)) {
    const corps = player.corps;
    applyEventResolution(corps, lobby, week);
    weeklyIncrement(corps, lobby, week);
    const totals = captionTotals(corps);
    const rng = rngFromSeed(`${lobby.id}:${lobby.season}:${week}:${player.userId}:penalty`);
    const penalty = week === 10 && rng() < 0.07 ? round2(0.05 + rng() * 0.10) : 0;
    const score = round2(totals.total - penalty);
    entries.push({
      type: 'player', userId: player.userId, corpsName: corps.corpsName, showTitle: corps.showTitle,
      score, penalty, captions: totals, eventNote: corps.log[0]?.split(' — ').slice(1).join(' — ') || '',
    });
  }
  for (const cpu of CPU_CORPS) entries.push({ type: 'cpu', corpsName: cpu[0], showTitle: 'CPU Production', score: cpuScore(lobby, week, cpu), penalty: 0 });

  entries.sort((a, b) => b.score - a.score || a.corpsName.localeCompare(b.corpsName));
  entries.forEach((entry, index) => { entry.placement = index + 1; });

  for (const player of Object.values(lobby.players)) {
    const result = entries.find(entry => entry.type === 'player' && entry.userId === player.userId);
    player.corps.latestScore = result.score;
    player.corps.latestPlacement = result.placement;
    player.corps.scoreHistory.push({
      season: lobby.season, week, score: result.score, placement: result.placement,
      totalCompetitors: entries.length, penalty: result.penalty, captions: result.captions, createdAt: nowIso(),
    });
    player.corps.reputation = round2(clamp(player.corps.reputation + Math.max(0, 20 - result.placement) * 0.08, 0, 100));
    player.corps.fans += Math.max(40, Math.round(420 - result.placement * 12));
    if (week === 10) player.corps.legacy = round2(clamp(player.corps.legacy + (result.placement <= 12 ? 2 : 0.5) + (result.placement <= 3 ? 2 : 0), 0, 100));
    addLog(player.corps, `Week ${week} score: ${result.score.toFixed(2)} (${ordinal(result.placement)} of ${entries.length}).`);
  }

  lobby.standings = entries;
  lobby.history.push({ season: lobby.season, week, standings: entries, scoredAt: nowIso() });
  lobby.log.unshift(`${nowIso()} — Week ${week} scored.`);
  lobby.log = lobby.log.slice(0, 100);
  if (week >= 10) {
    lobby.status = 'complete';
    lobby.phase = 'complete';
    lobby.completedAt = nowIso();
  } else {
    lobby.phase = 'results';
  }
  lobby.updatedAt = nowIso();
  return entries;
}

function openNextWeek(lobby) {
  if (lobby.status !== 'running' || lobby.phase !== 'results') throw new Error('The next week cannot be opened yet.');
  lobby.week += 1;
  lobby.phase = 'choices';
  for (const player of Object.values(lobby.players)) generatePendingEvent(player.corps, lobby, lobby.week);
  lobby.log.unshift(`${nowIso()} — Week ${lobby.week} choices opened.`);
  lobby.updatedAt = nowIso();
}

function readyNeeded(count) { return count <= 0 ? 0 : Math.ceil((2 * count) / 3); }
function startSeason(lobby, force = false) {
  if (lobby.status !== 'setup') throw new Error('This lobby has already started.');
  const players = Object.values(lobby.players);
  const minPlayers = Number(process.env.MIN_PLAYERS || 2);
  if (players.length < minPlayers) throw new Error(`At least ${minPlayers} players are required.`);
  const readyCount = players.filter(player => player.ready).length;
  if (!force && readyCount < readyNeeded(players.length)) throw new Error(`At least ${readyNeeded(players.length)} players must be ready.`);
  for (const player of players) {
    if (!isCorpsReady(player.corps)) throw new Error(`${player.username}'s corps has not completed the preseason checklist.`);
  }
  lobby.status = 'running';
  lobby.week = 1;
  lobby.phase = 'choices';
  lobby.standings = [];
  for (const player of players) generatePendingEvent(player.corps, lobby, 1);
  lobby.startedAt = nowIso();
  lobby.updatedAt = nowIso();
  lobby.log.unshift(`${nowIso()} — Season ${lobby.season} started.`);
}

function advanceSeason(lobby) {
  if (lobby.phase === 'choices') return scoreWeek(lobby);
  if (lobby.phase === 'results') { openNextWeek(lobby); return null; }
  throw new Error('The season cannot be advanced from its current phase.');
}

function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
}

function createLobby(hostUser, name) {
  const id = randomId(8);
  const code = crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
  const lobby = {
    id, code, name: safeText(name, 60) || `${hostUser.username}'s Season`,
    hostUserId: hostUser.id, status: 'setup', season: 1, week: 0, phase: 'setup',
    players: {}, standings: [], history: [], log: [], createdAt: nowIso(), updatedAt: nowIso(),
  };
  lobby.players[hostUser.id] = {
    userId: hostUser.id, username: hostUser.username, ready: false,
    corps: createCorps(hostUser.id, hostUser.username, id), joinedAt: nowIso(),
  };
  return lobby;
}

function addPlayerToLobby(lobby, user) {
  if (lobby.status !== 'setup') throw new Error('This lobby is no longer accepting players.');
  if (lobby.players[user.id]) return lobby.players[user.id];
  if (Object.keys(lobby.players).length >= 20) throw new Error('This lobby is full.');
  lobby.players[user.id] = {
    userId: user.id, username: user.username, ready: false,
    corps: createCorps(user.id, user.username, lobby.id), joinedAt: nowIso(),
  };
  lobby.updatedAt = nowIso();
  lobby.log.unshift(`${nowIso()} — ${user.username} joined the lobby.`);
  return lobby.players[user.id];
}

function publicPlayer(player) {
  return {
    userId: player.userId, username: player.username, ready: player.ready,
    corpsName: player.corps.corpsName, showTitle: player.corps.showTitle,
    latestScore: player.corps.latestScore, latestPlacement: player.corps.latestPlacement,
    setupComplete: isCorpsReady(player.corps),
  };
}

function lobbyView(lobby, userId) {
  const membership = lobby.players[userId];
  if (!membership) throw new Error('You are not a member of this lobby.');
  return {
    id: lobby.id, code: lobby.code, name: lobby.name, hostUserId: lobby.hostUserId,
    isHost: lobby.hostUserId === userId, status: lobby.status, season: lobby.season,
    week: lobby.week, phase: lobby.phase, readyNeeded: readyNeeded(Object.keys(lobby.players).length),
    players: Object.values(lobby.players).map(publicPlayer),
    standings: lobby.standings.map(entry => ({
      type: entry.type, userId: entry.userId || null, corpsName: entry.corpsName,
      showTitle: entry.showTitle, score: entry.score, penalty: entry.penalty, placement: entry.placement,
    })),
    history: lobby.history.map(week => ({
      season: week.season, week: week.week, scoredAt: week.scoredAt,
      winner: week.standings[0] ? { corpsName: week.standings[0].corpsName, score: week.standings[0].score } : null,
    })),
    me: {
      ready: membership.ready,
      checklist: readyChecklist(membership.corps),
      setupComplete: isCorpsReady(membership.corps),
      corps: membership.corps,
    },
    log: lobby.log.slice(0, 30),
  };
}

module.exports = {
  CAPTIONS, VALID_BUFFS, STAFF_ROLES, STAFF_LABELS, FACILITIES, SECTION_TARGETS,
  createLobby, addPlayerToLobby, createCorps, applyAction, readyChecklist, isCorpsReady,
  readyNeeded, startSeason, advanceSeason, chooseEvent, captionTotals, lobbyView, ordinal,
  clamp, safeText,
};

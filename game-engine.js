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

const STARTING_BUDGET = 150000;
const MAX_FUNDRAISERS = 3;

const STAFF_ROLES = ['director', 'program', 'brass', 'percussion', 'visual', 'tour'];
const STAFF_LABELS = {
  director: 'Corps Director',
  program: 'Program Coordinator',
  brass: 'Brass Caption Head',
  percussion: 'Percussion Caption Head',
  visual: 'Visual & Guard Caption Head',
  tour: 'Tour & Operations Manager',
};
const STAFF_BASE_SALARIES = {
  director: 4500,
  program: 5500,
  brass: 4000,
  percussion: 4000,
  visual: 4500,
  tour: 3500,
};
const STAFF_TIERS = {
  local: { label: 'Local educator', multiplier: 1, quality: 54 },
  experienced: { label: 'Experienced staff', multiplier: 1.65, quality: 69 },
  elite: { label: 'National-level staff', multiplier: 2.65, quality: 83 },
};

const FACILITIES = {
  field: { label: 'Dedicated Rehearsal Site', cost: 8000, note: 'Improves training and reduces injury risk.' },
  recruit: { label: 'Recruiting Network', cost: 7000, note: 'Improves audition turnout and member talent.' },
  kitchen: { label: 'Kitchen & Medical Unit', cost: 6500, note: 'Improves morale and recovery during tour.' },
  fleet: { label: 'Transportation Fleet', cost: 10000, note: 'Reduces weekly travel costs.' },
};

const SPONSORS = {
  community: { label: 'Community Partners', grant: 12000, weeklySupport: 400, interest: 5, reputation: 0 },
  arts: { label: 'Arts Foundation', grant: 18000, weeklySupport: 750, interest: 2, reputation: 2 },
  corporate: { label: 'Corporate Sponsor', grant: 28000, weeklySupport: 1250, interest: -2, reputation: 1 },
};
const FOOD_PLANS = {
  basic: { label: 'Basic meals', weeklyCost: 900, morale: -0.6, recovery: 0.2 },
  standard: { label: 'Balanced meals', weeklyCost: 1800, morale: 0.3, recovery: 0.7 },
  premium: { label: 'Performance nutrition', weeklyCost: 3200, morale: 1.2, recovery: 1.5 },
};
const TOUR_PLANS = {
  regional: { label: 'Regional route', weeklyCost: 2600, growth: 0.008, burnout: -0.4, fans: 160 },
  balanced: { label: 'Balanced national route', weeklyCost: 4000, growth: 0.018, burnout: 0.6, fans: 290 },
  national: { label: 'Aggressive national route', weeklyCost: 6000, growth: 0.030, burnout: 1.8, fans: 480 },
};
const TRAINING_PLANS = {
  controlled: { label: 'Controlled camp', cost: 7000, gain: 0.12, burnout: 3, morale: 3, injuryRisk: 0.02 },
  balanced: { label: 'Balanced camp', cost: 11000, gain: 0.19, burnout: 8, morale: 0, injuryRisk: 0.07 },
  push: { label: 'Maximum-output camp', cost: 16000, gain: 0.27, burnout: 16, morale: -4, injuryRisk: 0.18 },
};

const FUNDRAISERS = {
  community: {
    label: 'Community Donation Drive', cost: 750, base: 4200, perInterest: 115,
    spread: 3200, baseChance: 0.60, interestChance: 0.0032, fallback: 1100,
  },
  alumni: {
    label: 'Alumni & Booster Gala', cost: 2000, base: 7000, perInterest: 190,
    spread: 6500, baseChance: 0.46, interestChance: 0.0042, fallback: 1800,
  },
  corporate: {
    label: 'Corporate Partnership Campaign', cost: 4500, base: 10500, perInterest: 285,
    spread: 10500, baseChance: 0.28, interestChance: 0.0058, fallback: 2600,
  },
};

const TOUR_SCHEDULE = [
  { week: 1, name: 'Season Premiere', city: 'Akron, OH', tier: 'Opening night' },
  { week: 2, name: 'Midwest Classic', city: 'Muncie, IN', tier: 'Tour stop' },
  { week: 3, name: 'River City Showdown', city: 'Louisville, KY', tier: 'Tour stop' },
  { week: 4, name: 'Texas Regional', city: 'San Antonio, TX', tier: 'Regional championship' },
  { week: 5, name: 'Southern Championship', city: 'Atlanta, GA', tier: 'Regional championship' },
  { week: 6, name: 'Night of Champions', city: 'Winston-Salem, NC', tier: 'Major event' },
  { week: 7, name: 'Eastern Classic', city: 'Allentown, PA', tier: 'Major event' },
  { week: 8, name: 'World Championship Prelims', city: 'Indianapolis, IN', tier: 'Championship' },
  { week: 9, name: 'World Championship Semifinals', city: 'Indianapolis, IN', tier: 'Championship' },
  { week: 10, name: 'World Championship Finals', city: 'Indianapolis, IN', tier: 'Finals' },
];

const TOUR_EVENT_PUBLIC = {
  rainDay: ['Rain Day', 'Weather has disrupted the competition. Every corps must decide how much risk to take.'],
  heatWave: ['Heat Wave', 'Extreme heat forces directors to balance rehearsal time, health, and competitive readiness.'],
  busBreakdown: ['Bus Breakdown', 'Transportation trouble threatens arrival and rehearsal time.'],
  housingLoss: ['Housing Site Lost', 'The planned overnight site canceled at the last minute.'],
  foodIssue: ['Food Truck Failure', 'The corps food operation cannot serve the planned meals.'],
  illness: ['Corps Illness', 'A large part of the corps is sick before the contest.'],
  sectionDilemma: ['Section Dilemma', 'One section is not performing its book successfully.'],
  designerEpiphany: ['Designer Epiphany', 'The design team proposes a late change with potential GE value.'],
  staffConflict: ['Staff Conflict', 'A disagreement between staff members is affecting rehearsal.'],
  sponsorActivation: ['Sponsor Appearance', 'The sponsor requests a public appearance during rehearsal time.'],
  equipmentTheft: ['Equipment Missing', 'Important equipment disappeared during travel.'],
  medicalCuts: ['Medical Budget Decision', 'The corps must decide how much medical support to fund this week.'],
  drillRewrite: ['Late Drill Rewrite', 'The visual team proposes replacing a major drill segment.'],
  hotStreak: ['Hot Streak Gamble', 'The corps can chase an immediate competitive surge at a future cost.'],
  plateau: ['Plateau Into Surge', 'The staff can sacrifice short-term progress to rebuild the program.'],
  party: ['Night Before the Show', 'A section wants to break curfew before competition.'],
  rehearsalSite: ['Rehearsal Site Canceled', 'The scheduled rehearsal field is no longer available.'],
  alumniBoost: ['Alumni Opportunity', 'Alumni have gathered near the show and can support the corps.'],
};
const TOUR_EVENT_KEYS = Object.keys(TOUR_EVENT_PUBLIC);

function clamp(n, min, max) { return Math.max(min, Math.min(max, Number(n))); }
function round2(n) { return Math.round(Number(n) * 100) / 100; }
function round100(n) { return Math.round(Number(n) / 100) * 100; }
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
function shuffled(seed, values) {
  const rng = rngFromSeed(seed);
  const output = [...values];
  for (let i = output.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}

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
  };
}

function addLog(corps, message) {
  corps.log.unshift(`${nowIso()} — ${message}`);
  corps.log = corps.log.slice(0, 100);
  corps.updatedAt = nowIso();
}
function recordMoney(corps, amount, label, kind = amount >= 0 ? 'income' : 'expense', week = null) {
  const signed = round2(Number(amount) || 0);
  corps.budget = round2(corps.budget + signed);
  corps.ledger.unshift({
    id: randomId(6), label: safeText(label, 90), amount: signed, balance: corps.budget,
    kind, week, createdAt: nowIso(),
  });
  corps.ledger = corps.ledger.slice(0, 120);
}
function spend(corps, amount, label, week = null) {
  const cost = Math.max(0, Number(amount) || 0);
  if (corps.budget < cost) throw new Error(`Not enough budget for ${label || 'that action'}.`);
  recordMoney(corps, -cost, label || 'Expense', 'expense', week);
}
function spendDuringTour(corps, amount, label, week) {
  const cost = Math.max(0, Number(amount) || 0);
  if (corps.budget >= cost) {
    spend(corps, cost, label, week);
    return 0;
  }
  const available = Math.max(0, corps.budget);
  if (available) recordMoney(corps, -available, label, 'expense', week);
  const shortage = round2(cost - available);
  corps.budget = 0;
  corps.morale = round2(clamp(corps.morale - 4, 0, 100));
  corps.modifiers.nextAchievementDelta -= clamp(shortage / 45000, 0.04, 0.18);
  addLog(corps, `${label} exceeded available cash by $${Math.round(shortage).toLocaleString()}; emergency cuts reduced morale and achievement.`);
  return shortage;
}

function createCorps(userId, username, seed = '') {
  const rng = rngFromSeed(`${seed}:${userId}:${username}`);
  const corps = {
    ownerUserId: userId,
    ownerUsername: username,
    revision: 0,
    processedActionIds: [],
    corpsName: `${username}'s Corps`,
    showTitle: '',
    director: username,
    buff: 'Music GE',
    home: 'Dallas, TX',
    startingBudget: STARTING_BUDGET,
    budget: STARTING_BUDGET,
    sponsor: null,
    foodPlan: null,
    facilities: {},
    staff: {},
    design: null,
    sections: {
      brass: { count: 0, talent: 0, movement: 0 },
      percussion: { count: 0, talent: 0, movement: 0 },
      guard: { count: 0, talent: 0, movement: 0 },
    },
    auditionsComplete: false,
    fundraisingHistory: [],
    trainingPlan: null,
    tourPlan: null,
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
    lastEventResult: null,
    latestScore: null,
    latestPlacement: null,
    scoreHistory: [],
    ledger: [],
    log: ['Corps created. Complete the five preseason plans or use Recommended Setup.'],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  recordMoney(corps, 0, `Opening budget: $${STARTING_BUDGET.toLocaleString()}`, 'opening');
  corps.ledger[0].balance = STARTING_BUDGET;
  return corps;
}

function rosterFull(corps) {
  return Object.entries(SECTION_TARGETS).every(([key, target]) => Number(corps.sections?.[key]?.count || 0) >= target);
}
function normalizeCorps(corps, context = {}) {
  if (!corps || typeof corps !== 'object') return false;
  let changed = false;
  if (Object.hasOwn(corps, 'difficulty')) { delete corps.difficulty; changed = true; }
  if (!Number.isInteger(corps.revision)) { corps.revision = 0; changed = true; }
  if (!Array.isArray(corps.processedActionIds)) { corps.processedActionIds = []; changed = true; }
  if (!Number.isFinite(Number(corps.startingBudget))) {
    corps.startingBudget = STARTING_BUDGET;
    if (context.season === 1 && context.status === 'setup' && !corps.startingBudgetMigrationApplied) {
      corps.budget = round2(Number(corps.budget || 0) + (STARTING_BUDGET - 62000));
      corps.startingBudgetMigrationApplied = true;
    }
    changed = true;
  }
  if (!Array.isArray(corps.fundraisingHistory)) { corps.fundraisingHistory = []; changed = true; }
  if (!Array.isArray(corps.ledger)) {
    corps.ledger = [{ id: randomId(6), label: 'Imported balance', amount: Number(corps.budget || 0), balance: Number(corps.budget || 0), kind: 'opening', week: null, createdAt: nowIso() }];
    changed = true;
  }
  if (!corps.modifiers || typeof corps.modifiers !== 'object') { corps.modifiers = defaultModifiers(); changed = true; }
  else corps.modifiers = { ...defaultModifiers(), ...corps.modifiers, nextCaptionDelta: { ...(corps.modifiers.nextCaptionDelta || {}) } };
  if (!corps.foodPlan) {
    const oldFood = Number(corps.foodBudget || 50);
    corps.foodPlan = oldFood < 45 ? 'basic' : oldFood > 75 ? 'premium' : 'standard';
    changed = true;
  }
  if (!corps.trainingPlan && Number(corps.trainingBlocks || 0) >= 8) { corps.trainingPlan = { type: 'balanced', focus: 'all', completedAt: nowIso() }; changed = true; }
  if (!corps.tourPlan && corps.routeStrategy) { corps.tourPlan = corps.routeStrategy === 'rest' ? 'regional' : corps.routeStrategy === 'aggressive' ? 'national' : 'balanced'; changed = true; }
  if (!corps.auditionsComplete && (Number(corps.auditionCamps || 0) >= 4 || rosterFull(corps))) { corps.auditionsComplete = true; changed = true; }
  if (corps.design && !Number.isFinite(Number(corps.design.complexity))) {
    corps.design.complexity = Number(corps.design.difficulty || 65);
    delete corps.design.difficulty;
    changed = true;
  }
  corps.staff ||= {};
  if (!corps.staff.visual && corps.staff.guard) { corps.staff.visual = { ...corps.staff.guard, role: 'visual', label: STAFF_LABELS.visual }; changed = true; }
  for (const role of STAFF_ROLES) {
    const person = corps.staff[role];
    if (!person) continue;
    if (!person.tier) {
      const oldLevel = Number(person.level || 2);
      person.tier = oldLevel >= 4 ? 'elite' : oldLevel >= 2 ? 'experienced' : 'local';
      person.salary = Number(person.salary || staffSalary(role, person.tier));
      person.label = STAFF_LABELS[role];
      changed = true;
    }
  }
  if (!Object.hasOwn(corps, 'lastEventResult')) { corps.lastEventResult = null; changed = true; }
  return changed;
}

function totalMembers(corps) {
  return Object.values(corps.sections || {}).reduce((sum, section) => sum + Number(section.count || 0), 0);
}
function averageSection(corps, field) {
  const total = Math.max(1, totalMembers(corps));
  return Object.values(corps.sections || {}).reduce((sum, section) => sum + Number(section[field] || 0) * Number(section.count || 0), 0) / total;
}
function staffQuality(corps, role, fallback = 40) { return Number(corps.staff?.[role]?.quality || fallback); }
function staffAverage(corps) {
  const people = STAFF_ROLES.map(role => corps.staff?.[role]).filter(Boolean);
  if (!people.length) return 38;
  return people.reduce((sum, person) => sum + Number(person.quality || 0), 0) / people.length;
}
function staffSalary(role, tier) {
  const definition = STAFF_TIERS[tier] || STAFF_TIERS.local;
  return round100(STAFF_BASE_SALARIES[role] * definition.multiplier);
}
function readyChecklist(corps) {
  normalizeCorps(corps);
  return {
    identity: Boolean(corps.corpsName && corps.showTitle && corps.director && VALID_BUFFS.includes(corps.buff)),
    finance: Boolean(corps.sponsor && FOOD_PLANS[corps.foodPlan]),
    staff: STAFF_ROLES.every(role => Boolean(corps.staff[role])),
    program: Boolean(corps.design),
    members: Boolean(corps.auditionsComplete && rosterFull(corps)),
    training: Boolean(corps.trainingPlan),
    tour: Boolean(TOUR_PLANS[corps.tourPlan]),
  };
}
function isCorpsReady(corps) { return Object.values(readyChecklist(corps)).every(Boolean); }

function boostCaption(corps, captionKey, contentDelta, achievementDelta = contentDelta) {
  const caption = corps.captions[captionKey];
  if (!caption) return;
  caption.content = round2(clamp(caption.content + contentDelta, 0, 10.05));
  caption.achievement = round2(clamp(caption.achievement + achievementDelta, 0, 10.05));
}
function boostGroup(corps, group, amount, achievementMultiplier = 0.9) {
  const map = {
    ge: ['musicGE', 'visualGE'], visual: ['visualPerformance', 'visualAnalysis', 'colorGuard'],
    music: ['brass', 'musicAnalysis', 'percussion'], brass: ['brass', 'musicAnalysis'],
    percussion: ['percussion', 'musicAnalysis'], guard: ['colorGuard', 'visualPerformance'],
    all: CAPTIONS.map(([key]) => key),
  };
  for (const key of map[group] || [group]) boostCaption(corps, key, amount, amount * achievementMultiplier);
}

function fundraiserChance(corps, definition) {
  const interest = clamp(corps.interest || 0, 0, 100);
  const reputation = clamp(corps.reputation || 0, 0, 100);
  const director = staffQuality(corps, 'director', 40);
  return clamp(definition.baseChance + interest * definition.interestChance + reputation * 0.0012 + (director - 40) * 0.001, 0.20, 0.97);
}
function fundraiserOptions(corps) {
  normalizeCorps(corps);
  const used = new Set(corps.fundraisingHistory.map(entry => entry.type));
  const interest = clamp(corps.interest || 0, 0, 100);
  const reputation = clamp(corps.reputation || 0, 0, 100);
  const fanBoost = clamp(Math.log10(Math.max(100, corps.fans || 100)) - 2, 0, 4) * 350;
  return Object.entries(FUNDRAISERS).map(([id, definition]) => {
    const successChance = fundraiserChance(corps, definition);
    const typicalGross = definition.base + interest * definition.perInterest + definition.spread * 0.5 + reputation * 28 + fanBoost;
    const fallbackGross = definition.fallback + interest * definition.perInterest * 0.22 + fanBoost * 0.2;
    return {
      id, label: definition.label, cost: definition.cost, used: used.has(id),
      successChance: round2(successChance * 100),
      estimatedNet: round2((successChance * typicalGross + (1 - successChance) * fallbackGross) - definition.cost),
    };
  });
}
function projectedWeeklyCost(corps) {
  normalizeCorps(corps);
  const tour = TOUR_PLANS[corps.tourPlan] || TOUR_PLANS.balanced;
  const food = FOOD_PLANS[corps.foodPlan] || FOOD_PLANS.standard;
  const sponsor = SPONSORS[corps.sponsor] || { weeklySupport: 0 };
  const fleetDiscount = corps.facilities.fleet ? 800 : 0;
  const tourManagerDiscount = clamp((staffQuality(corps, 'tour', 40) - 40) * 12, 0, 650);
  const travel = Math.max(900, tour.weeklyCost - fleetDiscount - tourManagerDiscount);
  return {
    travel: round2(travel), food: food.weeklyCost, sponsorSupport: sponsor.weeklySupport,
    net: round2(travel + food.weeklyCost - sponsor.weeklySupport),
  };
}
function budgetSummary(corps) {
  const weekly = projectedWeeklyCost(corps);
  return {
    startingBudget: corps.startingBudget,
    currentBudget: corps.budget,
    weekly,
    projectedTourCost: round2(weekly.net * TOUR_SCHEDULE.length),
    projectedFinish: round2(corps.budget - weekly.net * TOUR_SCHEDULE.length),
    staffCost: STAFF_ROLES.reduce((sum, role) => sum + Number(corps.staff?.[role]?.salary || 0), 0),
  };
}

function finishPlayerMutation(corps, meta = {}) {
  corps.revision = Number(corps.revision || 0) + 1;
  corps.updatedAt = nowIso();
  if (meta.actionId) {
    corps.processedActionIds.push(String(meta.actionId));
    corps.processedActionIds = corps.processedActionIds.slice(-80);
  }
}
function checkPlayerMutation(corps, meta = {}) {
  normalizeCorps(corps);
  if (meta.actionId && corps.processedActionIds.includes(String(meta.actionId))) return { duplicate: true };
  if (meta.expectedRevision != null && Number(meta.expectedRevision) !== Number(corps.revision)) {
    const error = new Error('Your corps changed in another tab. The latest version has been loaded.');
    error.code = 'REVISION_CONFLICT';
    throw error;
  }
  return { duplicate: false };
}

function signFinancePlan(corps, sponsorId, foodPlanId) {
  const sponsor = SPONSORS[sponsorId] || SPONSORS.arts;
  const food = FOOD_PLANS[foodPlanId] ? foodPlanId : 'standard';
  if (corps.sponsor && corps.sponsor !== sponsorId) throw new Error('A sponsor agreement is already signed for this season.');
  if (!corps.sponsor) {
    corps.sponsor = sponsorId;
    recordMoney(corps, sponsor.grant, `${sponsor.label} season grant`, 'income');
    corps.interest = round2(clamp(corps.interest + sponsor.interest, 0, 100));
    corps.reputation = round2(clamp(corps.reputation + sponsor.reputation, 0, 100));
  }
  corps.foodPlan = food;
  addLog(corps, `Finance plan saved: ${sponsor.label}, ${FOOD_PLANS[food].label}.`);
}
function hireRole(corps, role, tier, rng, charge = true) {
  if (!STAFF_ROLES.includes(role)) throw new Error('Invalid staff role.');
  if (corps.staff[role]) throw new Error(`${STAFF_LABELS[role]} is already hired.`);
  const chosenTier = STAFF_TIERS[tier] ? tier : 'local';
  const salary = staffSalary(role, chosenTier);
  if (charge) spend(corps, salary, `${STAFF_LABELS[role]} season salary`);
  const quality = round2(clamp(STAFF_TIERS[chosenTier].quality + (rng() - 0.5) * 7, 45, 92));
  corps.staff[role] = { role, label: STAFF_LABELS[role], tier: chosenTier, quality, salary };
  return corps.staff[role];
}
function hirePackage(corps, tier, rng) {
  const chosenTier = STAFF_TIERS[tier] ? tier : 'experienced';
  const missing = STAFF_ROLES.filter(role => !corps.staff[role]);
  if (!missing.length) throw new Error('All core staff positions are already filled.');
  const total = missing.reduce((sum, role) => sum + staffSalary(role, chosenTier), 0);
  spend(corps, total, `${STAFF_TIERS[chosenTier].label} staff package`);
  for (const role of missing) hireRole(corps, role, chosenTier, rng, false);
  addLog(corps, `Hired ${missing.length} staff members with the ${STAFF_TIERS[chosenTier].label.toLowerCase()} package.`);
}
function runDesign(corps, payload) {
  if (corps.design) throw new Error('The production is already designed.');
  const complexity = clamp(payload.complexity ?? payload.bookDifficulty ?? 65, 40, 90);
  const focus = ['ge', 'visual', 'music', 'balanced'].includes(payload.focus) ? payload.focus : 'balanced';
  const cost = round100(6000 + complexity * 35);
  spend(corps, cost, 'Show design, arranging, and drill writing');
  corps.design = { concept: safeText(payload.concept, 80) || corps.showTitle || 'Untitled Production', complexity, focus, cost };
  const programQuality = staffQuality(corps, 'program', 40);
  const contentGain = clamp(0.11 + programQuality / 520 + complexity / 1200, 0.20, 0.38);
  boostGroup(corps, focus === 'balanced' ? 'all' : focus, contentGain, 0.25);
  addLog(corps, `Production designed with ${complexity} complexity and a ${focus} focus.`);
}
function runAuditions(corps, rng) {
  if (corps.auditionsComplete) throw new Error('Audition season is already complete.');
  const cost = corps.facilities.recruit ? 8500 : 10000;
  spend(corps, cost, 'Audition season operations');
  const recruitBonus = corps.facilities.recruit ? 8 : 0;
  const interestBonus = clamp(corps.interest * 0.22, 0, 18);
  const homeBonus = /TX|Texas|Dallas|Austin|San Antonio/i.test(corps.home) ? 5 : 1;
  for (const [key, target] of Object.entries(SECTION_TARGETS)) {
    const roleBonus = key === 'brass' ? staffQuality(corps, 'brass') : key === 'percussion' ? staffQuality(corps, 'percussion') : staffQuality(corps, 'visual');
    const talent = clamp(42 + recruitBonus + interestBonus + homeBonus + roleBonus * 0.16 + rng() * 10, 42, 91);
    const movement = clamp(40 + recruitBonus + interestBonus * 0.5 + staffQuality(corps, 'visual') * 0.15 + rng() * 11, 40, 90);
    corps.sections[key] = { count: target, talent: round2(talent), movement: round2(movement) };
  }
  corps.auditionsComplete = true;
  corps.interest = round2(clamp(corps.interest + 6 + rng() * 3, 0, 100));
  corps.fans += 350 + Math.round(rng() * 350);
  addLog(corps, `Audition season completed with all ${Object.values(SECTION_TARGETS).reduce((a, b) => a + b, 0)} positions filled.`);
}
function runTraining(corps, payload, rng) {
  if (corps.trainingPlan) throw new Error('Spring training is already complete.');
  if (!corps.auditionsComplete) throw new Error('Complete auditions before spring training.');
  const type = TRAINING_PLANS[payload.type] ? payload.type : 'balanced';
  const focus = ['ge', 'visual', 'music', 'brass', 'percussion', 'guard', 'all'].includes(payload.focus) ? payload.focus : 'all';
  const plan = TRAINING_PLANS[type];
  spend(corps, plan.cost, `${plan.label} spring training`);
  const field = corps.facilities.field ? 1.13 : 1;
  const teaching = staffAverage(corps) / 100;
  const gain = plan.gain * field * (0.72 + teaching * 0.52);
  boostGroup(corps, 'all', gain * 0.55);
  boostGroup(corps, focus, gain * 0.55);
  corps.trainingPlan = { type, focus, cost: plan.cost, completedAt: nowIso() };
  corps.burnout = round2(clamp(corps.burnout + plan.burnout, 0, 100));
  corps.morale = round2(clamp(corps.morale + plan.morale, 0, 100));
  const risk = plan.injuryRisk * (corps.facilities.field ? 0.65 : 1);
  if (rng() < risk) corps.injury = round2(clamp(corps.injury + 2 + rng() * 4, 0, 100));
  addLog(corps, `${plan.label} completed with a ${focus} emphasis.`);
}

function applyAction(corps, action, payload = {}, contextSeed = '', meta = {}) {
  if (!corps) throw new Error('Corps not found.');
  const check = checkPlayerMutation(corps, meta);
  if (check.duplicate) return { duplicate: true };
  const rng = rngFromSeed(`${contextSeed}:${corps.ownerUserId}:${action}:${meta.actionId || corps.updatedAt}:${corps.revision}`);

  switch (action) {
    case 'configure':
      corps.corpsName = safeText(payload.corpsName, 50) || corps.corpsName;
      corps.showTitle = safeText(payload.showTitle, 70);
      corps.director = safeText(payload.director, 50) || corps.ownerUsername;
      corps.home = safeText(payload.home, 60) || corps.home;
      corps.buff = VALID_BUFFS.includes(payload.buff) ? payload.buff : corps.buff;
      addLog(corps, 'Corps identity updated.');
      break;
    case 'finance':
      signFinancePlan(corps, String(payload.sponsor || 'arts'), String(payload.foodPlan || 'standard'));
      break;
    case 'office':
      signFinancePlan(corps, String(payload.sponsor || 'arts'), Number(payload.foodBudget || 50) > 75 ? 'premium' : Number(payload.foodBudget || 50) < 45 ? 'basic' : 'standard');
      if (payload.facility && FACILITIES[payload.facility] && !corps.facilities[payload.facility]) {
        spend(corps, FACILITIES[payload.facility].cost, FACILITIES[payload.facility].label);
        corps.facilities[payload.facility] = 1;
      }
      break;
    case 'buyFacility': {
      const facility = String(payload.facility || '');
      if (!FACILITIES[facility]) throw new Error('Invalid facility.');
      if (corps.facilities[facility]) throw new Error('That facility is already owned.');
      spend(corps, FACILITIES[facility].cost, FACILITIES[facility].label);
      corps.facilities[facility] = 1;
      addLog(corps, `${FACILITIES[facility].label} purchased.`);
      break;
    }
    case 'hireStaff':
      hireRole(corps, String(payload.role || ''), String(payload.tier || payload.level || 'local'), rng);
      addLog(corps, `${STAFF_LABELS[payload.role] || 'Staff member'} hired.`);
      break;
    case 'hirePackage':
      hirePackage(corps, String(payload.tier || 'experienced'), rng);
      break;
    case 'design':
      runDesign(corps, payload);
      break;
    case 'auditions':
    case 'audition':
      runAuditions(corps, rng);
      break;
    case 'training':
      runTraining(corps, payload, rng);
      break;
    case 'train':
      if (!corps.auditionsComplete && rosterFull(corps)) corps.auditionsComplete = true;
      runTraining(corps, { type: payload.intense ? 'push' : 'balanced', focus: payload.focus }, rng);
      break;
    case 'route': {
      const plan = TOUR_PLANS[payload.plan] ? payload.plan : payload.strategy === 'rest' ? 'regional' : payload.strategy === 'aggressive' ? 'national' : 'balanced';
      corps.tourPlan = plan;
      addLog(corps, `Tour plan selected: ${TOUR_PLANS[plan].label}.`);
      break;
    }
    case 'fundraise': {
      const type = String(payload.type || '');
      const definition = FUNDRAISERS[type];
      if (!definition) throw new Error('Invalid fundraising option.');
      if (corps.fundraisingHistory.length >= MAX_FUNDRAISERS) throw new Error('All three preseason fundraising campaigns are complete.');
      if (corps.fundraisingHistory.some(entry => entry.type === type)) throw new Error('That fundraising option has already been used.');
      spend(corps, definition.cost, `${definition.label} expenses`);
      const interest = clamp(corps.interest || 0, 0, 100);
      const reputation = clamp(corps.reputation || 0, 0, 100);
      const fanBoost = clamp(Math.log10(Math.max(100, corps.fans || 100)) - 2, 0, 4) * 350;
      const successChance = fundraiserChance(corps, definition);
      const succeeded = rng() < successChance;
      const gross = round2(Math.max(0, succeeded
        ? definition.base + interest * definition.perInterest + rng() * definition.spread + reputation * 28 + fanBoost
        : definition.fallback + interest * definition.perInterest * 0.22 + rng() * definition.spread * 0.12 + fanBoost * 0.2));
      recordMoney(corps, gross, `${definition.label} donations`, 'income');
      const net = round2(gross - definition.cost);
      corps.fundraisingHistory.push({ type, label: definition.label, cost: definition.cost, gross, net, interestAtTime: round2(interest), successChance: round2(successChance * 100), succeeded, createdAt: nowIso() });
      corps.interest = round2(clamp(corps.interest + (succeeded ? 1.1 : 0.35), 0, 100));
      corps.fans += succeeded ? 120 + Math.round(rng() * 180) : 35 + Math.round(rng() * 60);
      addLog(corps, `${definition.label} ${succeeded ? 'succeeded' : 'underperformed'}: ${net >= 0 ? '+' : ''}$${Math.round(net).toLocaleString()} net.`);
      break;
    }
    case 'quickBuild': {
      if (!corps.sponsor) signFinancePlan(corps, 'arts', 'standard');
      if (!corps.facilities.field && corps.budget >= FACILITIES.field.cost + 65000) { spend(corps, FACILITIES.field.cost, FACILITIES.field.label); corps.facilities.field = 1; }
      if (!corps.facilities.fleet && corps.budget >= FACILITIES.fleet.cost + 60000) { spend(corps, FACILITIES.fleet.cost, FACILITIES.fleet.label); corps.facilities.fleet = 1; }
      if (!STAFF_ROLES.every(role => corps.staff[role])) hirePackage(corps, corps.budget > 100000 ? 'experienced' : 'local', rng);
      corps.showTitle ||= 'Momentum in Motion';
      if (!corps.design) runDesign(corps, { concept: corps.showTitle, complexity: 62, focus: 'balanced' });
      if (!corps.auditionsComplete) runAuditions(corps, rng);
      if (!corps.trainingPlan) runTraining(corps, { type: corps.budget > 65000 ? 'balanced' : 'controlled', focus: 'all' }, rng);
      corps.tourPlan ||= corps.budget > 65000 ? 'balanced' : 'regional';
      addLog(corps, 'Recommended Setup completed the remaining preseason plans.');
      break;
    }
    default:
      throw new Error('Unknown game action.');
  }

  finishPlayerMutation(corps, meta);
  return { duplicate: false };
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

function tourEventKey(lobby, week) {
  const plan = shuffled(`${lobby.id}:${lobby.season}:tour-event-order`, TOUR_EVENT_KEYS);
  return plan[(week - 1) % plan.length];
}
function makeTourEvent(lobby, week) {
  const schedule = TOUR_SCHEDULE[week - 1];
  const type = tourEventKey(lobby, week);
  const [title, summary] = TOUR_EVENT_PUBLIC[type];
  return { id: `${lobby.season}-${week}-${type}`, type, title, summary, week, schedule };
}
function option(id, label, description, cost = 0) { return { id, label, description, cost }; }
function buildPlayerEvent(corps, lobby, publicEvent) {
  const rng = rngFromSeed(`${lobby.id}:${lobby.season}:${publicEvent.week}:${corps.ownerUserId}:event-detail`);
  const section = pick(rng, ['brass', 'percussion', 'guard']);
  const captionKey = section === 'guard' ? 'colorGuard' : section;
  const common = { id: randomId(6), week: publicEvent.week, type: publicEvent.type, title: publicEvent.title, text: publicEvent.summary, choice: null, choiceLabel: null, createdAt: nowIso(), meta: { section, captionKey } };
  const definitions = {
    rainDay: { defaultChoice: 'rest', options: [option('perform', 'Perform the full show', 'High risk: a chance at a major score gain, but poor footing can hurt achievement.'), option('standstill', 'Music standstill', 'Protects music while sacrificing visual scoring.'), option('rest', 'Take the day off', 'Safest health choice, but the next score grows less.')] },
    heatWave: { defaultChoice: 'modified', options: [option('push', 'Full rehearsal block', 'Potential breakthrough with significant injury risk.'), option('modified', 'Modified rehearsal', 'Small achievement gain with controlled risk.'), option('rest', 'Rest in the shade', 'Improves morale but gives up some growth.')] },
    busBreakdown: { defaultChoice: 'repair', options: [option('repair', 'Repair the bus', 'Reliable fix with a moderate expense.', 3500), option('rent', 'Rent replacement buses', 'Most reliable and protects morale, but costs more.', 6500), option('roadside', 'Attempt a roadside fix', 'Cheap, but the result is unpredictable.', 1200)] },
    housingLoss: { defaultChoice: 'gym', options: [option('hotel', 'Book hotel rooms', 'Protects rest and morale.', 7000), option('gym', 'Sleep on a gym floor', 'Affordable but increases burnout.', 1200), option('overnight', 'Travel overnight', 'Moderate cost and reduced achievement.', 2500)] },
    foodIssue: { defaultChoice: 'basic', options: [option('catering', 'Emergency catering', 'Maintains nutrition and morale.', 3500), option('basic', 'Buy basic meals', 'Affordable, with a small morale loss.', 1000), option('skip', 'Skip the meal service', 'Free, but creates a serious performance risk.')] },
    illness: { defaultChoice: 'rest', options: [option('rest', 'Rest the corps', 'Protects health but slightly lowers the next score.'), option('light', 'Hold a light rehearsal', 'Balanced recovery and preparation.'), option('practice', 'Run full rehearsal', 'A volatile choice that may produce a breakthrough or worsen illness.')] },
    sectionDilemma: { defaultChoice: 'stick', options: [option('simplify', `Simplify ${section}`, 'Trades content for cleaner achievement.'), option('rewrite', `Rewrite ${section}`, 'Adds content but may be less clean.'), option('stick', 'Keep the current book', 'No cost, with an uncertain result.')] },
    designerEpiphany: { defaultChoice: 'decline', options: [option('fund', 'Fund the late change', 'Improves one GE caption.', 2500), option('decline', 'Keep the current design', 'No change and no expense.')] },
    staffConflict: { defaultChoice: 'mediate', options: [option('mediate', 'Bring in a mediator', 'Restores morale and stabilizes rehearsal.', 1500), option('side', 'Choose one staff member', 'Boosts one area while slightly hurting others.'), option('ignore', 'Ignore the conflict', 'No expense, but morale falls.')] },
    sponsorActivation: { defaultChoice: 'delegate', options: [option('attend', 'Send the full corps', 'Builds interest and fans but costs rehearsal time.'), option('delegate', 'Send a small ensemble', 'A balanced publicity option.'), option('skip', 'Skip the appearance', 'Preserves rehearsal but disappoints the sponsor.')] },
    equipmentTheft: { defaultChoice: 'borrow', options: [option('replace', 'Replace the equipment', 'Avoids a scoring loss.', 5000), option('borrow', 'Borrow from another corps', 'Small achievement loss and moderate cost.', 1500), option('improvise', 'Improvise with what remains', 'Free but highly unpredictable.')] },
    medicalCuts: { defaultChoice: 'volunteer', options: [option('full', 'Fund full medical coverage', 'Improves recovery.', 2500), option('volunteer', 'Use volunteer coverage', 'Modest recovery at a low cost.', 800), option('cut', 'Cut medical support', 'Provides cash now, but creates future injury risk.')] },
    drillRewrite: { defaultChoice: 'partial', options: [option('full', 'Install the full rewrite', 'Large Visual GE gain with a cleanliness penalty.', 2000), option('partial', 'Install only the ending', 'Smaller gain and smaller risk.', 900), option('decline', 'Keep the current drill', 'No change.')] },
    hotStreak: { defaultChoice: 'decline', options: [option('accept', 'Take the gamble', 'Large next-score boost followed by slower growth.'), option('decline', 'Stay consistent', 'No change.')] },
    plateau: { defaultChoice: 'decline', options: [option('accept', 'Rebuild the program', 'Skips one weekly increase, then improves every later increase.'), option('decline', 'Keep the current plan', 'No change.')] },
    party: { defaultChoice: 'curfew', options: [option('allow', `Allow ${section} to go out`, 'The section receives a random positive or negative result.'), option('curfew', 'Enforce curfew', 'Protects consistency with a small morale cost.')] },
    rehearsalSite: { defaultChoice: 'school', options: [option('stadium', 'Rent a stadium', 'Excellent rehearsal conditions.', 4500), option('school', 'Use a school field', 'Adequate rehearsal at a low cost.', 1000), option('parking', 'Rehearse in a parking lot', 'Free, but hurts visual achievement.')] },
    alumniBoost: { defaultChoice: 'rehearse', options: [option('dinner', 'Host an alumni dinner', 'Raises money based on interest, but costs rehearsal time.', 1200), option('rehearse', 'Keep rehearsing', 'Small score improvement and no fundraising.')] },
  };
  return { ...common, ...(definitions[publicEvent.type] || definitions.illness) };
}
function openTourWeek(lobby, week) {
  lobby.tourEvent = makeTourEvent(lobby, week);
  for (const player of Object.values(lobby.players)) {
    player.corps.pendingEvent = buildPlayerEvent(player.corps, lobby, lobby.tourEvent);
    player.corps.lastEventResult = null;
    addLog(player.corps, `Week ${week} tour situation: ${lobby.tourEvent.title}.`);
    player.corps.revision += 1;
  }
}
function chooseEvent(corps, eventId, choiceId, meta = {}) {
  const check = checkPlayerMutation(corps, meta);
  if (check.duplicate) return { duplicate: true };
  const event = corps.pendingEvent;
  if (!event || event.id !== eventId) throw new Error('That event is no longer active.');
  const selected = event.options.find(item => item.id === choiceId);
  if (!selected) throw new Error('Invalid event choice.');
  event.choice = choiceId;
  event.choiceLabel = selected.label;
  addLog(corps, `Tour choice locked: ${selected.label}.`);
  finishPlayerMutation(corps, meta);
  return { duplicate: false };
}
function eventCost(corps, amount, label, week) {
  if (!amount) return 0;
  return spendDuringTour(corps, amount, label, week);
}
function resolveEvent(corps, lobby, week) {
  const event = corps.pendingEvent;
  if (!event || event.week !== week) return 'No event.';
  const choice = event.choice || event.defaultChoice;
  const rng = rngFromSeed(`${lobby.id}:${lobby.season}:${week}:${corps.ownerUserId}:${event.type}:${choice}`);
  const mods = corps.modifiers;
  const key = event.meta?.captionKey || 'brass';
  let note = `${event.title}: no major effect.`;

  if (event.type === 'rainDay') {
    if (choice === 'perform') {
      if (rng() < 0.25) { mods.nextAllDelta += 0.20; note = 'Rain Day: the full performance produced a major breakthrough.'; }
      else { mods.nextAchievementDelta -= 0.10; corps.injury = clamp(corps.injury + 2, 0, 100); note = 'Rain Day: poor footing hurt achievement and health.'; }
    } else if (choice === 'standstill') {
      for (const musicKey of ['musicGE', 'brass', 'musicAnalysis', 'percussion']) mods.nextCaptionDelta[musicKey] = (mods.nextCaptionDelta[musicKey] || 0) + 0.06;
      for (const visualKey of ['visualGE', 'visualPerformance', 'visualAnalysis', 'colorGuard']) mods.nextCaptionDelta[visualKey] = (mods.nextCaptionDelta[visualKey] || 0) - 0.12;
      note = 'Rain Day: the standstill protected music but sacrificed visual scoring.';
    } else { corps.morale = clamp(corps.morale + 4, 0, 100); mods.nextAllDelta -= 0.05; note = 'Rain Day: rest improved morale but reduced competitive growth.'; }
  } else if (event.type === 'heatWave') {
    if (choice === 'push') {
      if (rng() < 0.45) { mods.nextAllDelta += 0.10; note = 'Heat Wave: the hard rehearsal produced a breakthrough.'; }
      else { corps.injury = clamp(corps.injury + 5, 0, 100); mods.nextAchievementDelta -= 0.08; note = 'Heat Wave: the corps overheated and lost achievement.'; }
    } else if (choice === 'modified') { mods.nextAchievementDelta += 0.035; corps.morale -= 1; note = 'Heat Wave: the modified block improved achievement safely.'; }
    else { corps.morale += 3; mods.nextAllDelta -= 0.035; note = 'Heat Wave: rest protected health.'; }
  } else if (event.type === 'busBreakdown') {
    const costs = { repair: 3500, rent: 6500, roadside: 1200 }; eventCost(corps, costs[choice], 'Bus breakdown response', week);
    if (choice === 'rent') { corps.morale += 2; note = 'Bus Breakdown: replacement buses protected the schedule.'; }
    else if (choice === 'roadside') { const delta = rng() < 0.5 ? 0.08 : -0.09; mods.nextAllDelta += delta; note = delta > 0 ? 'Bus Breakdown: the roadside fix worked and created extra rehearsal time.' : 'Bus Breakdown: the roadside fix failed and cost rehearsal time.'; }
    else note = 'Bus Breakdown: the bus was repaired without a scoring effect.';
  } else if (event.type === 'housingLoss') {
    const costs = { hotel: 7000, gym: 1200, overnight: 2500 }; eventCost(corps, costs[choice], 'Emergency housing', week);
    if (choice === 'hotel') { corps.morale += 3; corps.burnout -= 2; note = 'Housing: hotel rooms protected rest and morale.'; }
    else if (choice === 'gym') { corps.morale -= 2; corps.burnout += 3; note = 'Housing: the gym floor increased fatigue.'; }
    else { mods.nextAchievementDelta -= 0.07; corps.fans += 120; note = 'Housing: overnight travel reduced achievement but kept the tour moving.'; }
  } else if (event.type === 'foodIssue') {
    const costs = { catering: 3500, basic: 1000, skip: 0 }; eventCost(corps, costs[choice], 'Emergency meals', week);
    if (choice === 'catering') { corps.morale += 3; note = 'Food issue: catering preserved nutrition and morale.'; }
    else if (choice === 'basic') { corps.morale -= 1; note = 'Food issue: basic meals kept the corps operational.'; }
    else { corps.morale -= 5; corps.injury += 2; mods.nextAchievementDelta -= 0.10; note = 'Food issue: skipping meals seriously hurt the corps.'; }
  } else if (event.type === 'illness') {
    if (choice === 'rest') { corps.morale += 3; corps.injury -= 2; mods.nextAllDelta -= 0.04; note = 'Illness: rest protected health.'; }
    else if (choice === 'light') { mods.nextAchievementDelta += 0.02; corps.injury -= 0.5; note = 'Illness: a light rehearsal balanced recovery and preparation.'; }
    else { const delta = rng() < 0.5 ? 0.13 : -0.16; mods.nextAllDelta += delta; if (delta < 0) corps.injury += 4; note = delta > 0 ? 'Illness: full rehearsal produced a breakthrough.' : 'Illness: full rehearsal made the sickness worse.'; }
  } else if (event.type === 'sectionDilemma') {
    if (choice === 'simplify') { boostCaption(corps, key, -0.10, 0.16); note = 'Section Dilemma: the book was simplified for cleaner achievement.'; }
    else if (choice === 'rewrite') { boostCaption(corps, key, 0.17, -0.10); note = 'Section Dilemma: the rewrite added content but reduced cleanliness.'; }
    else { const delta = rng() < 0.5 ? 0.07 : -0.06; boostCaption(corps, key, delta, delta); note = `Section Dilemma: keeping the book produced a ${delta > 0 ? 'positive' : 'negative'} result.`; }
  } else if (event.type === 'designerEpiphany') {
    if (choice === 'fund') { eventCost(corps, 2500, 'Designer epiphany', week); boostCaption(corps, rng() < 0.5 ? 'musicGE' : 'visualGE', 0.17, 0.04); note = 'Designer Epiphany: the funded change improved GE content.'; }
    else note = 'Designer Epiphany: the corps retained the current design.';
  } else if (event.type === 'staffConflict') {
    if (choice === 'mediate') { eventCost(corps, 1500, 'Staff mediation', week); corps.morale += 3; note = 'Staff Conflict: mediation stabilized rehearsal.'; }
    else if (choice === 'side') { mods.nextCaptionDelta[key] = (mods.nextCaptionDelta[key] || 0) + 0.12; mods.nextOtherDelta -= 0.02; note = 'Staff Conflict: one area improved while the rest of the program lost cohesion.'; }
    else { corps.morale -= 5; note = 'Staff Conflict: ignoring the dispute hurt morale.'; }
  } else if (event.type === 'sponsorActivation') {
    if (choice === 'attend') { corps.interest += 4; corps.fans += 350; mods.nextAchievementDelta -= 0.04; note = 'Sponsor Appearance: publicity grew, but rehearsal time was lost.'; }
    else if (choice === 'delegate') { corps.interest += 2; corps.fans += 150; note = 'Sponsor Appearance: a small ensemble balanced publicity and rehearsal.'; }
    else { corps.interest -= 2; mods.nextAllDelta += 0.025; note = 'Sponsor Appearance: skipping preserved rehearsal but hurt public interest.'; }
  } else if (event.type === 'equipmentTheft') {
    const costs = { replace: 5000, borrow: 1500, improvise: 0 }; eventCost(corps, costs[choice], 'Missing equipment response', week);
    if (choice === 'replace') note = 'Equipment: replacements prevented a score loss.';
    else if (choice === 'borrow') { mods.nextAchievementDelta -= 0.035; note = 'Equipment: borrowed gear caused a small achievement loss.'; }
    else { const delta = rng() < 0.4 ? 0.09 : -0.12; mods.nextAllDelta += delta; note = delta > 0 ? 'Equipment: improvisation became a memorable effect.' : 'Equipment: improvisation failed.'; }
  } else if (event.type === 'medicalCuts') {
    if (choice === 'full') { eventCost(corps, 2500, 'Full medical coverage', week); corps.injury -= 4; corps.morale += 1; note = 'Medical support: full coverage improved recovery.'; }
    else if (choice === 'volunteer') { eventCost(corps, 800, 'Volunteer medical supplies', week); corps.injury -= 1.5; note = 'Medical support: volunteers provided basic coverage.'; }
    else { recordMoney(corps, 3000, 'Medical budget savings', 'income', week); corps.injury += 3; corps.morale -= 2; mods.futureAllPenalty -= 0.012; note = 'Medical support: cuts raised cash but increased long-term risk.'; }
  } else if (event.type === 'drillRewrite') {
    if (choice === 'full') { eventCost(corps, 2000, 'Full drill rewrite', week); mods.nextCaptionDelta.visualGE = (mods.nextCaptionDelta.visualGE || 0) + 0.17; mods.nextCaptionDelta.visualPerformance = (mods.nextCaptionDelta.visualPerformance || 0) - 0.10; note = 'Drill Rewrite: GE improved while visual cleanliness fell.'; }
    else if (choice === 'partial') { eventCost(corps, 900, 'Partial drill rewrite', week); mods.nextCaptionDelta.visualGE = (mods.nextCaptionDelta.visualGE || 0) + 0.08; mods.nextCaptionDelta.visualPerformance = (mods.nextCaptionDelta.visualPerformance || 0) - 0.04; note = 'Drill Rewrite: the ending gained effect with limited risk.'; }
    else note = 'Drill Rewrite: the current drill was retained.';
  } else if (event.type === 'hotStreak') {
    if (choice === 'accept') { mods.nextFlat += 0.22; mods.futureAllPenalty -= 0.025; note = 'Hot Streak: next score boosted, later growth reduced.'; }
    else note = 'Hot Streak: the corps stayed consistent.';
  } else if (event.type === 'plateau') {
    if (choice === 'accept') { mods.skipNextIncrease += 1; mods.futureIncrementBonus += 0.05; note = 'Plateau: one increase sacrificed for stronger future growth.'; }
    else note = 'Plateau: the current plan continued.';
  } else if (event.type === 'party') {
    if (choice === 'allow') { const delta = rng() < 0.5 ? 0.11 : -0.11; mods.nextCaptionDelta[key] = (mods.nextCaptionDelta[key] || 0) + delta; note = `Night Out: the section received a ${delta > 0 ? 'positive' : 'negative'} result.`; }
    else { corps.morale -= 1; note = 'Night Out: curfew protected consistency.'; }
  } else if (event.type === 'rehearsalSite') {
    if (choice === 'stadium') { eventCost(corps, 4500, 'Stadium rehearsal rental', week); mods.nextAllDelta += 0.06; note = 'Rehearsal Site: the stadium produced an excellent block.'; }
    else if (choice === 'school') { eventCost(corps, 1000, 'School field rental', week); note = 'Rehearsal Site: the school field provided an adequate block.'; }
    else { mods.nextCaptionDelta.visualPerformance = (mods.nextCaptionDelta.visualPerformance || 0) - 0.08; note = 'Rehearsal Site: the parking lot hurt visual achievement.'; }
  } else if (event.type === 'alumniBoost') {
    if (choice === 'dinner') {
      eventCost(corps, 1200, 'Alumni dinner', week);
      const gross = round100(3500 + corps.interest * 95 + rng() * 4500);
      recordMoney(corps, gross, 'Alumni dinner donations', 'income', week);
      corps.interest += 2;
      mods.nextAchievementDelta -= 0.025;
      note = `Alumni Opportunity: the dinner raised $${gross.toLocaleString()} but used rehearsal time.`;
    } else { mods.nextAllDelta += 0.045; note = 'Alumni Opportunity: the corps kept rehearsing and improved the show.'; }
  }

  corps.morale = round2(clamp(corps.morale, 0, 100));
  corps.burnout = round2(clamp(corps.burnout, 0, 100));
  corps.injury = round2(clamp(corps.injury, 0, 100));
  corps.interest = round2(clamp(corps.interest, 0, 100));
  corps.lastEventResult = { week, title: event.title, choice, choiceLabel: event.options.find(item => item.id === choice)?.label || choice, note };
  addLog(corps, note);
  corps.pendingEvent = null;
  return note;
}

function applyPendingDeltas(corps) {
  const mods = corps.modifiers;
  if (mods.nextAllDelta) { for (const [key] of CAPTIONS) boostCaption(corps, key, mods.nextAllDelta, mods.nextAllDelta); mods.nextAllDelta = 0; }
  if (mods.nextGeDelta) { for (const key of ['musicGE', 'visualGE']) boostCaption(corps, key, mods.nextGeDelta, mods.nextGeDelta); mods.nextGeDelta = 0; }
  if (mods.nextOtherDelta) { for (const [key] of CAPTIONS) if (!['musicGE', 'visualGE'].includes(key)) boostCaption(corps, key, mods.nextOtherDelta, mods.nextOtherDelta); mods.nextOtherDelta = 0; }
  for (const [key, delta] of Object.entries(mods.nextCaptionDelta || {})) boostCaption(corps, key, delta, delta);
  mods.nextCaptionDelta = {};
  if (mods.nextAchievementDelta) { for (const [key] of CAPTIONS) boostCaption(corps, key, 0, mods.nextAchievementDelta); mods.nextAchievementDelta = 0; }
}
function applyTourFinances(corps, week) {
  const sponsor = SPONSORS[corps.sponsor] || { label: 'No sponsor', weeklySupport: 0 };
  const food = FOOD_PLANS[corps.foodPlan] || FOOD_PLANS.standard;
  const tour = TOUR_PLANS[corps.tourPlan] || TOUR_PLANS.balanced;
  const costs = projectedWeeklyCost(corps);
  if (sponsor.weeklySupport) recordMoney(corps, sponsor.weeklySupport, `${sponsor.label} weekly support`, 'income', week);
  spendDuringTour(corps, costs.travel, `${TOUR_SCHEDULE[week - 1].name} travel and housing`, week);
  spendDuringTour(corps, food.weeklyCost, `${food.label} food program`, week);
  corps.morale = round2(clamp(corps.morale + food.morale + (corps.facilities.kitchen ? 0.6 : 0), 0, 100));
  corps.injury = round2(clamp(corps.injury - food.recovery - (corps.facilities.kitchen ? 0.5 : 0), 0, 100));
  corps.burnout = round2(clamp(corps.burnout + tour.burnout - (staffQuality(corps, 'tour') - 50) / 75, 0, 100));
  corps.fans += tour.fans;
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
    const complexity = corps.design?.complexity || 55;
    const readiness = clamp((talent + movement + staff + complexity) / 400, 0.35, 0.96);
    const health = clamp((corps.morale + (100 - corps.burnout) + (100 - corps.injury)) / 300, 0.30, 1);
    const tourGrowth = TOUR_PLANS[corps.tourPlan]?.growth || 0;
    const complexityPressure = clamp((complexity - (talent + staff) / 2) / 650, 0, 0.055);
    const base = 0.15 + readiness * 0.16 + health * 0.055 + tourGrowth + mods.futureIncrementBonus + mods.futureAllPenalty;
    for (const [key, label] of CAPTIONS) {
      let contentGain = base * (0.47 + rng() * 0.17);
      let achievementGain = base * (0.59 + rng() * 0.19) - complexityPressure;
      if (corps.buff === label) { contentGain += 0.04; achievementGain += 0.04; }
      if (['musicGE', 'visualGE'].includes(key)) contentGain += (staffQuality(corps, 'program') - 50) / 1800;
      if (['visualPerformance', 'visualAnalysis', 'colorGuard'].includes(key)) achievementGain += movement / 2500 + (staffQuality(corps, 'visual') - 50) / 1900;
      if (['brass', 'musicAnalysis'].includes(key)) achievementGain += talent / 2700 + (staffQuality(corps, 'brass') - 50) / 2000;
      if (key === 'percussion') achievementGain += talent / 2700 + (staffQuality(corps, 'percussion') - 50) / 1800;
      if (corps.design?.focus === 'ge' && ['musicGE', 'visualGE'].includes(key)) contentGain += 0.025;
      if (corps.design?.focus === 'visual' && ['visualPerformance', 'visualAnalysis', 'colorGuard'].includes(key)) contentGain += 0.025;
      if (corps.design?.focus === 'music' && ['brass', 'musicAnalysis', 'percussion'].includes(key)) contentGain += 0.025;
      boostCaption(corps, key, contentGain, achievementGain);
    }
  }
  if (mods.nextFlat) { for (const [key] of CAPTIONS) boostCaption(corps, key, mods.nextFlat, mods.nextFlat); mods.nextFlat = 0; }
  applyPendingDeltas(corps);
  corps.morale = round2(clamp(corps.morale - corps.burnout / 110, 0, 100));
  if (rng() < corps.burnout / 650) corps.injury = round2(clamp(corps.injury + 1 + rng() * 2.5, 0, 100));
}

function scoreWeek(lobby) {
  if (lobby.status !== 'running' || lobby.phase !== 'choices') throw new Error('The lobby is not ready to score this week.');
  const week = lobby.week;
  const entries = [];
  for (const player of Object.values(lobby.players)) {
    const corps = player.corps;
    const eventNote = resolveEvent(corps, lobby, week);
    applyTourFinances(corps, week);
    weeklyIncrement(corps, lobby, week);
    const totals = captionTotals(corps);
    const rng = rngFromSeed(`${lobby.id}:${lobby.season}:${week}:${player.userId}:penalty`);
    const penalty = week === 10 && rng() < 0.07 ? round2(0.05 + rng() * 0.10) : 0;
    const score = round2(totals.total - penalty);
    entries.push({ type: 'player', userId: player.userId, corpsName: corps.corpsName, showTitle: corps.showTitle, score, penalty, captions: totals, eventNote });
  }
  entries.sort((a, b) => b.score - a.score || a.corpsName.localeCompare(b.corpsName));
  entries.forEach((entry, index) => { entry.placement = index + 1; });
  for (const player of Object.values(lobby.players)) {
    const result = entries.find(entry => entry.userId === player.userId);
    const corps = player.corps;
    corps.latestScore = result.score;
    corps.latestPlacement = result.placement;
    corps.scoreHistory.push({ season: lobby.season, week, event: lobby.tourEvent, score: result.score, placement: result.placement, totalCompetitors: entries.length, penalty: result.penalty, captions: result.captions, budget: corps.budget, createdAt: nowIso() });
    const fieldSize = entries.length;
    corps.reputation = round2(clamp(corps.reputation + Math.max(0, fieldSize - result.placement) * 0.35 + (result.placement === 1 ? 0.5 : 0), 0, 100));
    corps.fans += Math.max(60, Math.round(260 + (fieldSize - result.placement) * 70));
    if (week === 10) corps.legacy = round2(clamp(corps.legacy + (result.placement === 1 ? 5 : result.placement <= 3 ? 3 : 1), 0, 100));
    addLog(corps, `${TOUR_SCHEDULE[week - 1].name}: ${result.score.toFixed(2)} (${ordinal(result.placement)} of ${entries.length}).`);
    corps.revision += 1;
  }
  lobby.standings = entries;
  lobby.history.push({ season: lobby.season, week, schedule: TOUR_SCHEDULE[week - 1], tourEvent: lobby.tourEvent, standings: entries, scoredAt: nowIso() });
  lobby.log.unshift(`${nowIso()} — Week ${week} scored at ${TOUR_SCHEDULE[week - 1].name}.`);
  lobby.log = lobby.log.slice(0, 120);
  if (week >= TOUR_SCHEDULE.length) {
    lobby.status = 'complete'; lobby.phase = 'complete'; lobby.completedAt = nowIso(); lobby.tourEvent = null;
  } else lobby.phase = 'results';
  lobby.updatedAt = nowIso();
  lobby.revision += 1;
  return entries;
}
function openNextWeek(lobby) {
  if (lobby.status !== 'running' || lobby.phase !== 'results') throw new Error('The next week cannot be opened yet.');
  lobby.week += 1;
  lobby.phase = 'choices';
  openTourWeek(lobby, lobby.week);
  lobby.log.unshift(`${nowIso()} — Week ${lobby.week} opened: ${TOUR_SCHEDULE[lobby.week - 1].name}.`);
  lobby.updatedAt = nowIso();
  lobby.revision += 1;
}
function readyNeeded(count) { return count <= 0 ? 0 : Math.ceil((2 * count) / 3); }
function startSeason(lobby, force = false) {
  if (lobby.status !== 'setup') throw new Error('This lobby has already started.');
  const players = Object.values(lobby.players);
  const minPlayers = Number(process.env.MIN_PLAYERS || 2);
  if (players.length < minPlayers) throw new Error(`At least ${minPlayers} players are required.`);
  const readyCount = players.filter(player => player.ready).length;
  if (!force && readyCount < readyNeeded(players.length)) throw new Error(`At least ${readyNeeded(players.length)} players must be ready.`);
  for (const player of players) if (!isCorpsReady(player.corps)) throw new Error(`${player.username}'s corps has not completed the preseason checklist.`);
  lobby.status = 'running'; lobby.week = 1; lobby.phase = 'choices'; lobby.standings = [];
  openTourWeek(lobby, 1);
  lobby.startedAt = nowIso(); lobby.updatedAt = nowIso(); lobby.revision += 1;
  lobby.log.unshift(`${nowIso()} — Season ${lobby.season} started at ${TOUR_SCHEDULE[0].name}.`);
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

function normalizeLobby(lobby) {
  let changed = false;
  if (!Number.isInteger(lobby.revision)) { lobby.revision = 0; changed = true; }
  if (!Object.hasOwn(lobby, 'tourEvent')) { lobby.tourEvent = null; changed = true; }
  for (const player of Object.values(lobby.players || {})) if (normalizeCorps(player.corps, { season: lobby.season, status: lobby.status })) changed = true;
  return changed;
}
function createLobby(hostUser, name) {
  const id = randomId(8);
  const code = crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
  const lobby = {
    id, code, name: safeText(name, 60) || `${hostUser.username}'s Season`,
    hostUserId: hostUser.id, status: 'setup', season: 1, week: 0, phase: 'setup', revision: 0,
    tourEvent: null, players: {}, standings: [], history: [], log: [], createdAt: nowIso(), updatedAt: nowIso(),
  };
  lobby.players[hostUser.id] = { userId: hostUser.id, username: hostUser.username, ready: false, corps: createCorps(hostUser.id, hostUser.username, id), joinedAt: nowIso() };
  return lobby;
}
function addPlayerToLobby(lobby, user) {
  normalizeLobby(lobby);
  if (lobby.status !== 'setup') throw new Error('This lobby is no longer accepting players.');
  if (lobby.players[user.id]) return lobby.players[user.id];
  if (Object.keys(lobby.players).length >= 20) throw new Error('This lobby is full.');
  lobby.players[user.id] = { userId: user.id, username: user.username, ready: false, corps: createCorps(user.id, user.username, lobby.id), joinedAt: nowIso() };
  lobby.updatedAt = nowIso(); lobby.revision += 1;
  lobby.log.unshift(`${nowIso()} — ${user.username} joined the lobby.`);
  return lobby.players[user.id];
}
function publicPlayer(player) {
  normalizeCorps(player.corps);
  return {
    userId: player.userId, username: player.username, ready: player.ready,
    corpsName: player.corps.corpsName, showTitle: player.corps.showTitle,
    latestScore: player.corps.latestScore, latestPlacement: player.corps.latestPlacement,
    setupComplete: isCorpsReady(player.corps),
  };
}
function lobbyView(lobby, userId) {
  normalizeLobby(lobby);
  const membership = lobby.players[userId];
  if (!membership) throw new Error('You are not a member of this lobby.');
  return {
    id: lobby.id, code: lobby.code, name: lobby.name, hostUserId: lobby.hostUserId,
    isHost: lobby.hostUserId === userId, status: lobby.status, season: lobby.season,
    week: lobby.week, phase: lobby.phase, revision: lobby.revision,
    readyNeeded: readyNeeded(Object.keys(lobby.players).length),
    tourEvent: lobby.tourEvent,
    players: Object.values(lobby.players).map(publicPlayer),
    standings: lobby.standings.map(entry => ({ type: entry.type, userId: entry.userId || null, corpsName: entry.corpsName, showTitle: entry.showTitle, score: entry.score, penalty: entry.penalty, placement: entry.placement })),
    history: lobby.history.map(item => ({
      season: item.season, week: item.week, scoredAt: item.scoredAt,
      schedule: item.schedule || TOUR_SCHEDULE[(item.week || 1) - 1],
      tourEvent: item.tourEvent || null,
      winner: item.standings?.[0] ? { corpsName: item.standings[0].corpsName, score: item.standings[0].score } : null,
    })),
    me: {
      ready: membership.ready,
      revision: membership.corps.revision,
      fundraisingOptions: fundraiserOptions(membership.corps),
      budgetSummary: budgetSummary(membership.corps),
      checklist: readyChecklist(membership.corps),
      setupComplete: isCorpsReady(membership.corps),
      corps: membership.corps,
    },
    log: lobby.log.slice(0, 30),
  };
}

module.exports = {
  CAPTIONS, VALID_BUFFS, STAFF_ROLES, STAFF_LABELS, STAFF_TIERS, STAFF_BASE_SALARIES,
  FACILITIES, SPONSORS, FOOD_PLANS, TOUR_PLANS, TRAINING_PLANS, TOUR_SCHEDULE, SECTION_TARGETS,
  STARTING_BUDGET, MAX_FUNDRAISERS, FUNDRAISERS,
  createLobby, addPlayerToLobby, createCorps, applyAction, readyChecklist, isCorpsReady,
  readyNeeded, startSeason, advanceSeason, chooseEvent, captionTotals, lobbyView, ordinal,
  clamp, safeText, normalizeCorps, normalizeLobby, fundraiserOptions, budgetSummary, projectedWeeklyCost,
};

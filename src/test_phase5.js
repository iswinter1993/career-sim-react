// Phase 5 verification script — Player Ratings & Match Stats
// Tests: P5.1 (playerRating), P5.2 (matchStats), matchEngine integration

import {
  POSITION_RATING_BASELINE, ROLE_RATING_WEIGHTS, DEFAULT_RATING_WEIGHTS,
  calculateRating, calculateGKRating, rateAllPlayers,
  getRatingLabel, getRatingClass, RATING_LABELS
} from './playerRating.js';
import {
  createMatchStatsTracker, recordMatchEvent,
  calculateDerivedStats, calculateTeamDerivedStats,
  getTeamPassAccuracy, getTeamTackleRate, extractMatchTimeline
} from './engine/lib/matchStats.js';

let passed = 0, failed = 0;
function check(expr, label) {
  if (expr) { passed++; }
  else { failed++; console.error(`FAIL: ${label}`); }
}
function approx(a, b, eps = 0.001) {
  return Math.abs(a - b) < eps;
}

// ================================================================
// P5.1 — Position Rating Baselines
// ================================================================
console.log('\n--- P5.1 Position Rating Baselines ---');

const allPositions = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];
for (const pos of allPositions) {
  check(typeof POSITION_RATING_BASELINE[pos] === 'number', `${pos} has baseline rating`);
}
check(POSITION_RATING_BASELINE.GK === 6.4, 'GK baseline 6.4');
check(POSITION_RATING_BASELINE.CB === 6.6, 'CB baseline 6.6');
for (const pos of allPositions) {
  if (pos !== 'GK' && pos !== 'CB') {
    check(POSITION_RATING_BASELINE[pos] === 6.5, `${pos} baseline 6.5`);
  }
}

// ================================================================
// P5.1 — Role Rating Weights
// ================================================================
console.log('\n--- P5.1 Role Rating Weights ---');

const roleCount = Object.keys(ROLE_RATING_WEIGHTS).length;
check(roleCount >= 13, `>=13 role weight profiles, got ${roleCount}`);

// Poacher — goals matter most
const poacherW = ROLE_RATING_WEIGHTS['ST_poacher_attack'];
check(poacherW.goals === 5.0, 'Poacher goals weight = 5.0');
check(poacherW.tackles === 0.1, 'Poacher tackles weight = 0.1');

// B2B — all-around
const b2bW = ROLE_RATING_WEIGHTS['CM_box_to_box_support'];
check(b2bW.tackles === 1.5, 'B2B tackles weight = 1.5');
check(b2bW.goals === 2.0, 'B2B goals weight = 2.0');
check(b2bW.runs === 2.0, 'B2B runs weight = 2.0');

// Anchor man — defensive screening
const anchorW = ROLE_RATING_WEIGHTS['CDM_anchor_man_defend'];
check(anchorW.tackles === 3.0, 'Anchor tackles weight = 3.0');
check(anchorW.shots === 0.2, 'Anchor shots weight = 0.2');
check(anchorW.goals === 0.2, 'Anchor goals weight = 0.2');

// Advanced Playmaker — creative hub
const apW = ROLE_RATING_WEIGHTS['CM_advanced_playmaker_attack'];
check(apW.keyPasses === 3.0, 'AP keyPasses weight = 3.0');
check(apW.assists === 3.0, 'AP assists weight = 3.0');
check(apW.tackles === 0.3, 'AP tackles weight = 0.3');

// Wing-Back — attacking full-back
const wbW = ROLE_RATING_WEIGHTS['FB_wing_back_attack'];
check(wbW.crosses === 3.0, 'WB crosses weight = 3.0');
check(wbW.assists === 3.0, 'WB assists weight = 3.0');
check(wbW.runs === 2.5, 'WB runs weight = 2.5');

// Sweeper Keeper
const skW = ROLE_RATING_WEIGHTS['GK_sweeper_keeper_support'];
check(skW.sweeps === 3.0, 'SK sweeps weight = 3.0');
check(skW.passesCompleted === 2.0, 'SK passesCompleted weight = 2.0');

// Check all weights reference valid stat keys
const validStatKeys = new Set([
  'tackles', 'interceptions', 'clearances', 'passesCompleted', 'keyPasses',
  'throughBalls', 'crosses', 'dribbles', 'runs', 'shots', 'shotsOnTarget',
  'goals', 'assists', 'fouls', 'offsides', 'positionErrors', 'errors',
  'saves', 'catches', 'punches', 'sweeps', 'goalsConceded', 'cleanSheet',
  'blocks', 'savesParried',
]);
for (const [role, weights] of Object.entries(ROLE_RATING_WEIGHTS)) {
  for (const key of Object.keys(weights)) {
    check(validStatKeys.has(key), `${role}.${key} is a valid stat key`);
  }
}

// ================================================================
// P5.1 — calculateRating (outfield)
// ================================================================
console.log('\n--- P5.1 calculateRating (outfield) ---');

// Poacher with 2 goals, good shooting
const poacherPlayer = {
  position: 'ST',
  matchStats: {
    goals: 2, shots: 4, shotsOnTarget: 3,
    passesCompleted: 5, keyPasses: 1,
    tackles: 0, interceptions: 0,
    minutesPlayed: 90,
  },
};
const poacherRating = calculateRating(poacherPlayer, 'ST', 'ST_poacher_attack', { result: 'win' });
check(poacherRating >= 7.0, `Poacher with 2 goals >= 7.0: ${poacherRating}`);
check(poacherRating <= 9.0, `Poacher with 2 goals <= 9.0: ${poacherRating}`);

// B2B with no goals but high work rate
const b2bPlayer = {
  position: 'CM',
  matchStats: {
    goals: 0, assists: 0, shots: 2, shotsOnTarget: 0,
    passesCompleted: 45, keyPasses: 2,
    tackles: 6, interceptions: 4,
    totalDistance: 1200, // runs = 12
    minutesPlayed: 90,
  },
};
const b2bRating = calculateRating(b2bPlayer, 'CM', 'CM_box_to_box_support', { result: 'win' });
check(b2bRating >= 7.0, `B2B high work rate >= 7.0: ${b2bRating}`);
check(b2bRating <= 9.5, `B2B high work rate <= 9.5: ${b2bRating}`);

// Anchor man — defensive clean sheet
const anchorPlayer = {
  position: 'CDM',
  matchStats: {
    goals: 0, assists: 0,
    passesCompleted: 30,
    tackles: 8, interceptions: 5, clearances: 3,
    goalsConceded: 0,
    minutesPlayed: 90,
  },
};
const anchorRating = calculateRating(anchorPlayer, 'CDM', 'CDM_anchor_man_defend', { result: 'draw' });
check(anchorRating >= 7.0, `Anchor clean sheet >= 7.0: ${anchorRating}`);

// Player with no matchStats — should still return a valid rating
const barePlayer = { position: 'CM' };
const bareRating = calculateRating(barePlayer, 'CM', null, { result: 'draw' });
check(bareRating >= 6.0 && bareRating <= 7.0, `Bare player rating in range: ${bareRating}`);

// Test minutes modifier (sub playing only 30 mins)
const subPlayer = {
  matchStats: {
    goals: 1, shots: 1, shotsOnTarget: 1,
    passesCompleted: 5,
    minutesPlayed: 30,
  },
};
const subRating = calculateRating(subPlayer, 'ST', 'ST_poacher_attack', { result: 'win' });
check(subRating < 8.0, `Sub with 30 mins gets lower rating: ${subRating}`);

// Rating with loss result
const lossRating = calculateRating(poacherPlayer, 'ST', 'ST_poacher_attack', { result: 'loss' });
check(lossRating < poacherRating, `Loss rating < win rating: ${lossRating} < ${poacherRating}`);

// Rating clamping
for (const r of [poacherRating, b2bRating, anchorRating, bareRating, subRating, lossRating]) {
  check(r >= 0.1 && r <= 10.0, `Rating in [0.1, 10.0]: ${r}`);
}

// ================================================================
// P5.1 — calculateGKRating
// ================================================================
console.log('\n--- P5.1 calculateGKRating ---');

// Clean sheet GK with many saves
const greatGK = {
  matchStats: {
    saves: 8, goalsConceded: 0,
    passesCompleted: 12, sweeps: 2,
    catches: 3, punches: 1,
    minutesPlayed: 90,
  },
};
const gkRatingGood = calculateGKRating(greatGK, 'GK_goalkeeper_defend', { result: 'win' });
check(gkRatingGood >= 7.5, `Clean sheet GK with 8 saves >= 7.5: ${gkRatingGood}`);

// GK who conceded 3
const badGK = {
  matchStats: {
    saves: 2, goalsConceded: 3,
    passesCompleted: 8,
    minutesPlayed: 90,
  },
};
const gkRatingBad = calculateGKRating(badGK, 'GK_goalkeeper_defend', { result: 'loss' });
check(gkRatingBad <= 6.0, `GK conceded 3 + loss <= 6.0: ${gkRatingBad}`);
check(gkRatingBad < gkRatingGood, `Bad GK < Good GK: ${gkRatingBad} < ${gkRatingGood}`);

// Sweeper keeper with distribution
const sweeperGK = {
  matchStats: {
    saves: 4, goalsConceded: 1,
    passesCompleted: 30, sweeps: 5,
    catches: 1, punches: 2,
    minutesPlayed: 90,
  },
};
const skRating = calculateGKRating(sweeperGK, 'GK_sweeper_keeper_support', { result: 'draw' });
check(skRating >= 6.5, `Sweeper keeper distribution >= 6.5: ${skRating}`);

// ================================================================
// P5.2 — Match Stats Tracker
// ================================================================
console.log('\n--- P5.2 Match Stats Tracker ---');

// Create tracker
const tracker = createMatchStatsTracker();
check(tracker !== null, 'tracker created');
check(tracker.home !== undefined, 'home tracker exists');
check(tracker.away !== undefined, 'away tracker exists');
check(tracker.matchEvents !== undefined, 'matchEvents array exists');
check(Array.isArray(tracker.matchEvents), 'matchEvents is array');

// Record events
// Register players first (simulates match init — GKs registered before any goals)
recordMatchEvent(tracker, 'away', 'ap1', 'save', { parried: false }, 20);
recordMatchEvent(tracker, 'home', 'p2', 'pass', { completed: true, keyPass: true }, 80);
recordMatchEvent(tracker, 'home', 'p3', 'tackle', { won: true }, 90);
recordMatchEvent(tracker, 'home', 'p1', 'shoot', { onTarget: true }, 100);
recordMatchEvent(tracker, 'home', 'p1', 'shoot', { onTarget: false }, 150);
recordMatchEvent(tracker, 'home', 'p3', 'tackle', { won: false }, 120);
recordMatchEvent(tracker, 'home', 'p1', 'goal', { assistPlayerID: 'p2' }, 200);
recordMatchEvent(tracker, 'away', 'ap1', 'save', { parried: true }, 220);
recordMatchEvent(tracker, 'home', 'p3', 'sprint', { distance: 10 }, 300);

// Check p1 stats
const p1Stats = tracker.home.players['p1'];
check(p1Stats.shots === 2, 'p1 has 2 shots');
check(p1Stats.shotsOnTarget === 1, 'p1 has 1 shot on target');
check(p1Stats.goals === 1, 'p1 has 1 goal');

// Check p2 stats (assist + pass)
const p2Stats = tracker.home.players['p2'];
check(p2Stats.assists === 1, 'p2 has 1 assist');
check(p2Stats.passesAttempted === 1, 'p2 has 1 pass attempt');
check(p2Stats.passesCompleted === 1, 'p2 pass completed');
check(p2Stats.keyPasses === 1, 'p2 has 1 key pass');

// Check p3 stats (tackles + sprint)
const p3Stats = tracker.home.players['p3'];
check(p3Stats.tacklesAttempted === 2, 'p3 has 2 tackles attempted');
check(p3Stats.tacklesWon === 1, 'p3 has 1 tackle won');
check(p3Stats.sprints === 1, 'p3 has 1 sprint');
check(p3Stats.totalDistance === 10, 'p3 totalDistance = 10');

// Check away GK stats
const ap1Stats = tracker.away.players['ap1'];
check(ap1Stats.saves === 2, `ap1 has 2 saves: ${ap1Stats.saves}`);
check(ap1Stats.savesParried === 1, 'ap1 save was parried');
check(ap1Stats.goalsConceded === 1, 'ap1 conceded 1 goal (p1 goal)');

// Check team stats
check(tracker.teamStats.home.shots === 2, 'home team shots = 2');
check(tracker.teamStats.home.shotsOnTarget === 1, 'home team shotsOnTarget = 1');

// Check timeline events
check(tracker.matchEvents.length === 1, '1 timeline event (goal)');
check(tracker.matchEvents[0].eventType === 'goal', 'timeline event is goal');
check(tracker.matchEvents[0].minute === 6, `goal at minute 6 (200/30): got ${tracker.matchEvents[0].minute}`);

// ================================================================
// P5.2 — Derived Stats
// ================================================================
console.log('\n--- P5.2 Derived Stats ---');

const p1Derived = calculateDerivedStats(p1Stats);
check(p1Derived.shotAccuracy === 50, `shot accuracy 50%: ${p1Derived.shotAccuracy}%`);

const p3Derived = calculateDerivedStats(p3Stats);
check(p3Derived.tackleSuccessRate === 50, `tackle success 50%: ${p3Derived.tackleSuccessRate}%`);

// Team derived stats
const homeDerived = calculateTeamDerivedStats(tracker.home);
check(homeDerived.totalPasses === 1, `home total passes = 1: ${homeDerived.totalPasses}`);
check(homeDerived.totalTackles === 2, 'home total tackles = 2');

const homePA = getTeamPassAccuracy(tracker.home);
const awayPA = getTeamPassAccuracy(tracker.away);
check(homePA === 100, `home pass accuracy 100%: ${homePA}`);
check(awayPA === 0, `away pass accuracy 0%: ${awayPA}`);

const homeTR = getTeamTackleRate(tracker.home);
check(approx(homeTR, 50), `home tackle rate 50%: ${homeTR}`);

// Timeline extraction
const timeline = extractMatchTimeline(tracker);
check(timeline.length === 1, 'timeline has 1 event');

// ================================================================
// P5.2 — Discipline tracking
// ================================================================
console.log('\n--- P5.2 Discipline ---');

recordMatchEvent(tracker, 'home', 'p3', 'foul', { victimID: 'ap2' }, 310);
recordMatchEvent(tracker, 'home', 'p3', 'yellowCard', {}, 320);
recordMatchEvent(tracker, 'away', 'ap3', 'redCard', {}, 400);

const p3Updated = tracker.home.players['p3'];
check(p3Updated.fouls === 1, 'p3 has 1 foul');
check(p3Updated.yellowCards === 1, 'p3 has 1 yellow card');

const ap2Updated = tracker.away.players['ap2'];
check(ap2Updated.foulsAgainst === 1, 'ap2 has 1 foul against');

const ap3Updated = tracker.away.players['ap3'];
check(ap3Updated.redCards === 1, 'ap3 has 1 red card');

check(tracker.teamStats.home.fouls === 1, 'home team fouls = 1');
check(tracker.teamStats.away.cards === 1, 'away team cards = 1');

// Timeline events (goal + yellow + red)
check(tracker.matchEvents.length === 3, '3 timeline events (goal + YC + RC)');

// ================================================================
// P5.2 — Unknown player handling
// ================================================================
console.log('\n--- P5.2 Edge Cases ---');

// Should not crash with nulls
recordMatchEvent(null, 'home', 'p1', 'shoot', {}, 0);
recordMatchEvent(tracker, null, 'p1', 'shoot', {}, 0);
recordMatchEvent(tracker, 'home', null, 'shoot', {}, 0);

// Empty derived stats
const emptyDerived = calculateDerivedStats(null);
check(emptyDerived !== null, 'null stats returns empty object');

const emptyTeamDerived = calculateTeamDerivedStats(null);
check(emptyTeamDerived !== null && typeof emptyTeamDerived === 'object', 'null team tracker returns object');

// Unknown event type should not crash
recordMatchEvent(tracker, 'home', 'p5', 'nonexistent_event', {}, 0);
const p5Stats = tracker.home.players['p5'];
check(p5Stats !== undefined, 'unknown event creates player entry anyway');

// ================================================================
// P5.1 — rateAllPlayers (legacy compat)
// ================================================================
console.log('\n--- P5.1 rateAllPlayers ---');

const matchDetails = {
  homeTeam: [
    { id: 'h1', name: 'Player H1', position: 'ST' },
    { id: 'h2', name: 'Player H2', position: 'CM' },
  ],
  awayTeam: [
    { id: 'a1', name: 'Player A1', position: 'CB' },
    { id: 'a2', name: 'Player A2', position: 'GK' },
  ],
  result: { homeGoals: 2, awayGoals: 1 },
  events: [
    { type: 'goal', playerID: 'h1' },
    { type: 'goal', playerID: 'h1' },
    { type: 'assist', playerID: 'h2' },
    { type: 'yellowCard', playerID: 'a1' },
    { type: 'goal', playerID: 'a1' },
  ],
  _homeRoles: { h1: 'ST_poacher_attack', h2: 'CM_box_to_box_support' },
  _awayRoles: { a1: 'CB_central_defender_defend', a2: 'GK_goalkeeper_defend' },
};

const ratings = rateAllPlayers(matchDetails);
check(ratings.home.length === 2, '2 home players rated');
check(ratings.away.length === 2, '2 away players rated');
check(ratings.mvp !== null, 'MVP exists');
check(ratings.mvp.playerID === 'h1', 'h1 is MVP (2 goals)');

// Check sorting: highest rating first
check(ratings.home[0].rating >= ratings.home[1].rating, 'home players sorted by rating desc');
check(ratings.away[0].rating >= ratings.away[1].rating, 'away players sorted by rating desc');

// ================================================================
// P5.1 — Rating Labels
// ================================================================
console.log('\n--- P5.1 Rating Labels ---');

check(RATING_LABELS.length >= 8, `>=8 rating labels: ${RATING_LABELS.length}`);

const label9 = getRatingLabel(9.2);
check(label9.label !== 'data_not_found', 'label found for 9.2');

const labelClass = getRatingClass(8.5);
check(labelClass === 'rating-excellent', `8.5 is excellent: ${labelClass}`);
check(getRatingClass(7.3) === 'rating-good', '7.3 is good');
check(getRatingClass(6.2) === 'rating-average', '6.2 is average');
check(getRatingClass(5.0) === 'rating-poor', '5.0 is poor');

// ================================================================
// P5.1 — Default weights validity
// ================================================================
console.log('\n--- P5.1 Default Weights ---');

const defaultKeys = Object.keys(DEFAULT_RATING_WEIGHTS);
check(defaultKeys.length >= 14, `>=14 default weight keys: ${defaultKeys.length}`);
for (const key of defaultKeys) {
  check(validStatKeys.has(key), `DEFAULT.${key} is valid stat key`);
}

// Summary
console.log(`\n${'='.repeat(60)}`);
console.log(`PASSED: ${passed}  FAILED: ${failed}  TOTAL: ${passed + failed}`);
console.log(`${'='.repeat(60)}`);

if (failed > 0) {
  console.error('\n❌ SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('\n✅ ALL PHASE 5 TESTS PASSED');
  process.exit(0);
}

// Post-match player rating calculator.
//
// Pure function `calculateRating(matchDetails, playerID)` → 0-10.
// Extensible: the base event set covers ~20-30 core events; add more
// event types later without changing the scoring logic.

// ---------------------------------------------------------------------------
// Event → rating contributions
// ---------------------------------------------------------------------------
// Positive events (single-instance bonuses, additive).
const POSITIVE_EVENTS = {
  goal:          1.0,
  assist:        0.5,
  keyPass:       0.2,
  successfulDribble: 0.1,
  tackleWon:     0.1,
  interception:  0.1,
  clearance:     0.1,
  passComplete:  0.05,
  aerialDuelWon: 0.05,
  shotOnTarget:  0.15,
  penaltyGoal:   0.8,   // penalty scored counts as this instead of goal
  savedPenalty:  1.5,   // GK saves a penalty
  bigChanceCreated: 0.3,
  crossCompleted: 0.15,
  lastManTackle: 0.3,
};

// Negative events (subtractive).
const NEGATIVE_EVENTS = {
  redCard:        2.0,
  yellowCard:     0.5,
  secondYellow:   1.5,   // second yellow → red
  ownGoal:        1.5,
  penaltyConceded: 1.0,
  dribbledPast:   0.1,
  possessionLost: 0.1,
  passMissed:     0.05,
  foulCommit:     0.1,
  offside:        0.05,
  missedChance:   0.3,   // big chance missed
  errorLeadToGoal: 1.0,
  penaltyMissed:  1.5,
  caughtOffPosition: 0.05,
};

// Minutes-played thresholds for rating floor/ceiling.
const MIN_MINUTES_FOR_FULL_RATING = 60; // subs with fewer mins get prorated
const BASE_RATING = 6.0;

// Result bonuses.
const WIN_BONUS = 0.15;
const DRAW_BONUS = 0.05;
const LOSS_PENALTY = -0.1;

// Clean-sheet bonuses (position-dependent).
const CLEAN_SHEET_POSITIONS = { GK: 0.3, CB: 0.25, LB: 0.2, RB: 0.2, CDM: 0.2 };
const CLEAN_SHEET_MIN_MINUTES = 60;

// Position categories for bonus qualification.
const DEFENSIVE_POSITIONS = new Set(['GK', 'CB', 'LB', 'RB', 'CDM']);
const ATTACKING_POSITIONS = new Set(['ST', 'LW', 'RW', 'CAM', 'LM', 'RM']);

// Rating scale evaluation labels.
const RATING_LABELS = [
  { min: 9.0, label: '统治级表现', color: '#e74c3c' },
  { min: 8.5, label: '全场最佳',     color: '#e67e22' },
  { min: 8.0, label: '极为出色',     color: '#f39c12' },
  { min: 7.5, label: '表现出色',     color: '#27ae60' },
  { min: 7.0, label: '良好发挥',     color: '#2ecc71' },
  { min: 6.5, label: '中规中矩',     color: '#3498db' },
  { min: 6.0, label: '表现平平',     color: '#95a5a6' },
  { min: 5.0, label: '状态低迷',     color: '#e67e22' },
  { min: 0,   label: '灾难级表现',   color: '#e74c3c' },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate a 0-10 match rating for the given player.
 *
 * @param {object} matchDetails — the engine's final match state, including:
 *   - homeTeam / awayTeam: arrays of player objects with `id`, `position`
 *   - events: array of { type, playerID?, … }
 *   - result: { homeGoals, awayGoals, winner: 'home'|'away'|'draw' } or a
 *       boolean-based `homeWin` / `awayWin` / `draw` shape
 *   - stats: optional per-player stats counters keyed by playerID
 *   - minutesPlayed: optional { [playerID]: number }
 * @param {string} playerID — unique ID of the player to rate
 * @returns {{ rating: number, label: string, color: string, breakdown: object }}
 *   breakdown contains per-event tallies and the final weighted score.
 */
export function calculateRating(matchDetails, playerID) {
  if (!matchDetails || !playerID) {
    return _fallbackRating();
  }

  const events = matchDetails.events || [];
  const result = matchDetails.result || {};
  const stats = matchDetails.stats || {};
  const minutesPlayed = matchDetails.minutesPlayed || {};

  // Resolve the player's position and team from the matchDetails.
  const playerInfo = _findPlayer(matchDetails, playerID);
  const position = playerInfo ? playerInfo.position : 'CM';
  const playerSide = playerInfo ? playerInfo.side : null; // 'home'|'away'

  // ------------------------------------------------------------------
  // 1. Tally event contributions
  // ------------------------------------------------------------------
  let eventScore = 0;
  const breakdown = {
    positive: {},
    negative: {},
    rawScore: 0,
    resultBonus: 0,
    cleanSheetBonus: 0,
    minutesMultiplier: 1,
  };

  for (const evt of events) {
    if (evt.playerID !== playerID) continue;

    const posVal = POSITIVE_EVENTS[evt.type];
    const negVal = NEGATIVE_EVENTS[evt.type];

    if (posVal) {
      eventScore += posVal;
      breakdown.positive[evt.type] = (breakdown.positive[evt.type] || 0) + 1;
    }
    if (negVal) {
      eventScore -= negVal;
      breakdown.negative[evt.type] = (breakdown.negative[evt.type] || 0) + 1;
    }
  }

  // Also tally from stats if the engine provides aggregated stats per player
  const playerStats = stats[playerID];
  if (playerStats) {
    for (const [statKey, statVal] of Object.entries(playerStats)) {
      const posVal = POSITIVE_EVENTS[statKey];
      const negVal = NEGATIVE_EVENTS[statKey];
      if (posVal && typeof statVal === 'number') {
        eventScore += posVal * statVal;
        breakdown.positive[statKey] = (breakdown.positive[statKey] || 0) + statVal;
      }
      if (negVal && typeof statVal === 'number') {
        eventScore -= negVal * statVal;
        breakdown.negative[statKey] = (breakdown.negative[statKey] || 0) + statVal;
      }
    }
  }

  breakdown.rawScore = eventScore;

  // ------------------------------------------------------------------
  // 2. Result bonus
  // ------------------------------------------------------------------
  let resultBonus = 0;
  if (playerSide === 'home') {
    if (result.homeGoals > result.awayGoals) resultBonus = WIN_BONUS;
    else if (result.homeGoals === result.awayGoals) resultBonus = DRAW_BONUS;
    else resultBonus = LOSS_PENALTY;
  } else if (playerSide === 'away') {
    if (result.awayGoals > result.homeGoals) resultBonus = WIN_BONUS;
    else if (result.awayGoals === result.homeGoals) resultBonus = DRAW_BONUS;
    else resultBonus = LOSS_PENALTY;
  }
  // Fallback if result shape uses winner property
  if (resultBonus === 0 && result.winner) {
    if (result.winner === 'draw') resultBonus = DRAW_BONUS;
    else if ((result.winner === 'home' && playerSide === 'home') ||
             (result.winner === 'away' && playerSide === 'away')) {
      resultBonus = WIN_BONUS;
    } else {
      resultBonus = LOSS_PENALTY;
    }
  }
  breakdown.resultBonus = resultBonus;

  // ------------------------------------------------------------------
  // 3. Clean-sheet bonus (GK / defenders / defensive mids)
  // ------------------------------------------------------------------
  let cleanSheetBonus = 0;
  if (playerSide && position && CLEAN_SHEET_POSITIONS[position]) {
    const conceded = playerSide === 'home'
      ? result.awayGoals
      : result.homeGoals;
    const mins = minutesPlayed[playerID] || 90;
    if (conceded === 0 && mins >= CLEAN_SHEET_MIN_MINUTES) {
      cleanSheetBonus = CLEAN_SHEET_POSITIONS[position] || 0;
    }
  }
  breakdown.cleanSheetBonus = cleanSheetBonus;

  // ------------------------------------------------------------------
  // 4. Minutes multiplier (subs with fewer minutes get prorated)
  // ------------------------------------------------------------------
  const mins = minutesPlayed[playerID] || 90;
  let minutesMultiplier = 1;
  if (mins < MIN_MINUTES_FOR_FULL_RATING) {
    // Scale: 10 mins → 0.5×, 45 mins → 0.9×, 60+ → 1×
    minutesMultiplier = 0.5 + (0.5 * mins) / MIN_MINUTES_FOR_FULL_RATING;
  }
  breakdown.minutesMultiplier = minutesMultiplier;

  // ------------------------------------------------------------------
  // 5. Composite rating
  // ------------------------------------------------------------------
  const composite = (BASE_RATING + eventScore + resultBonus + cleanSheetBonus)
    * minutesMultiplier;

  // Clamp to 0-10 range
  const rating = Math.max(0, Math.min(10, composite));

  // One decimal precision
  const rounded = Math.round(rating * 10) / 10;

  // Find the label
  const labelInfo = RATING_LABELS.find((l) => rounded >= l.min) || RATING_LABELS[RATING_LABELS.length - 1];

  return {
    rating: rounded,
    label: labelInfo.label,
    color: labelInfo.color,
    breakdown,
  };
}

/**
 * Rate all players in a match and return sorted results.
 *
 * @param {object} matchDetails
 * @returns {{ home: Array, away: Array, mvp: object|null }}
 */
export function rateAllPlayers(matchDetails) {
  if (!matchDetails) return { home: [], away: [], mvp: null };

  const home = (matchDetails.homeTeam || []).map((p) => ({
    playerID: p.id,
    name: p.name || p.id,
    position: p.position,
    ...calculateRating(matchDetails, p.id),
  })).sort((a, b) => b.rating - a.rating);

  const away = (matchDetails.awayTeam || []).map((p) => ({
    playerID: p.id,
    name: p.name || p.id,
    position: p.position,
    ...calculateRating(matchDetails, p.id),
  })).sort((a, b) => b.rating - a.rating);

  const all = [...home, ...away].sort((a, b) => b.rating - a.rating);
  const mvp = all.length > 0 ? all[0] : null;

  return { home, away, mvp };
}

/**
 * Get the human-readable label for a given rating value.
 *
 * @param {number} rating — 0-10
 * @returns {{ label: string, color: string }}
 */
export function getRatingLabel(rating) {
  return RATING_LABELS.find((l) => rating >= l.min) || RATING_LABELS[RATING_LABELS.length - 1];
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function _findPlayer(matchDetails, playerID) {
  const homeTeam = matchDetails.homeTeam || [];
  const awayTeam = matchDetails.awayTeam || [];

  for (const p of homeTeam) {
    if (p.id === playerID) return { ...p, side: 'home' };
  }
  for (const p of awayTeam) {
    if (p.id === playerID) return { ...p, side: 'away' };
  }
  return null;
}

function _fallbackRating() {
  return {
    rating: 6.0,
    label: '数据不足',
    color: '#95a5a6',
    breakdown: {},
  };
}

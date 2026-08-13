// playerRating.js — FM-style post-match player rating calculator (Phase 5.1)
//
// Computes 0.0-10.0 ratings using position baselines + role-specific
// stat weights + result modifiers. Supports all 12 positions and
// ~15+ player roles with differentiated scoring profiles.
//
// Public API:
//   POSITION_RATING_BASELINE                 — { [pos]: baseline }
//   ROLE_RATING_WEIGHTS                      — { [roleKey]: weight profile }
//   DEFAULT_RATING_WEIGHTS                   — generic fallback weights
//   calculateRating(player, position, role, matchContext) → number
//   calculateGKRating(player, role, matchContext)           → number
//   rateAllPlayers(matchDetails)             → { home:[], away:[], mvp }
//   getRatingLabel(rating)                   → { label, color }
//   RATING_LABELS                            — rating scale labels

import { getRoleModifier } from './engine/lib/tactics.js';
import { calculateDerivedStats } from './engine/lib/matchStats.js';

// ===========================================================================
// POSITION RATING BASELINES
// ===========================================================================

/** Baseline rating (before contributions) for every position. */
export const POSITION_RATING_BASELINE = {
  GK: 6.4,
  CB: 6.6,
  LB: 6.5,
  RB: 6.5,
  LWB: 6.5,
  RWB: 6.5,
  CDM: 6.5,
  CM: 6.5,
  CAM: 6.5,
  LM: 6.5,
  RM: 6.5,
  LW: 6.5,
  RW: 6.5,
  ST: 6.5,
};

// ===========================================================================
// ROLE-SPECIFIC RATING WEIGHTS
// ===========================================================================

/**
 * Rating weight profiles for each player role.
 * Higher weight = this stat matters more for the final rating.
 * These are additive to DEFAULT_RATING_WEIGHTS — a role weight replaces
 * (not adds to) the default for that key.
 */
export const ROLE_RATING_WEIGHTS = {
  // ===== GK roles =====
  'GK_goalkeeper_defend': {
    saves: 3.0,
    catches: 1.5,
    punches: 1.0,
    passesCompleted: 0.5,
    goalsConceded: -2.5,
    cleanSheet: 1.5,
    errors: -3.0,
  },
  'GK_sweeper_keeper_support': {
    saves: 3.0,
    catches: 1.0,
    punches: 1.5,
    passesCompleted: 2.0,
    sweeps: 3.0,
    goalsConceded: -2.5,
    cleanSheet: 1.5,
    errors: -3.0,
  },

  // ===== CB roles =====
  'CB_ball_playing_defender_defend': {
    tackles: 2.0,
    interceptions: 2.5,
    clearances: 1.5,
    passesCompleted: 2.0,
    keyPasses: 1.0,
    dribbles: 0.3,
    shots: 0.3,
    goals: 0.5,
    assists: 0.5,
    positionErrors: -2.0,
    fouls: -0.5,
  },
  'CB_central_defender_defend': {
    tackles: 3.0,
    interceptions: 2.5,
    clearances: 3.0,
    passesCompleted: 1.0,
    keyPasses: 0.3,
    shots: 0.2,
    goals: 0.3,
    positionErrors: -2.5,
    fouls: -0.3,
  },
  'CB_central_defender_cover': {
    tackles: 1.5,
    interceptions: 3.5,
    clearances: 2.5,
    passesCompleted: 1.2,
    keyPasses: 0.5,
    positionErrors: -3.0,
    fouls: -0.2,
  },
  'CB_central_defender_stopper': {
    tackles: 3.5,
    interceptions: 2.0,
    clearances: 2.5,
    passesCompleted: 0.8,
    fouls: -1.0,
    positionErrors: -1.5,
  },
  'CB_libero_support': {
    tackles: 2.0,
    interceptions: 2.5,
    clearances: 1.0,
    passesCompleted: 2.5,
    keyPasses: 1.5,
    dribbles: 1.0,
    runs: 1.5,
    positionErrors: -1.5,
    fouls: -0.5,
  },

  // ===== FB roles =====
  'FB_full_back_defend': {
    tackles: 3.0,
    interceptions: 2.0,
    clearances: 2.0,
    passesCompleted: 1.5,
    crosses: 1.0,
    assists: 0.5,
    runs: 1.0,
    positionErrors: -2.0,
    fouls: -0.5,
  },
  'FB_wing_back_attack': {
    tackles: 1.5,
    interceptions: 1.0,
    passesCompleted: 1.5,
    keyPasses: 1.5,
    crosses: 3.0,
    assists: 3.0,
    dribbles: 1.0,
    runs: 2.5,
    goals: 0.5,
    fouls: -0.5,
    positionErrors: -1.0,
  },
  'FB_wing_back_support': {
    tackles: 2.0,
    interceptions: 1.5,
    passesCompleted: 1.5,
    keyPasses: 1.0,
    crosses: 2.5,
    assists: 2.0,
    runs: 2.0,
    dribbles: 0.8,
    goals: 0.3,
    positionErrors: -1.5,
    fouls: -0.5,
  },
  'FB_inverted_wing_back_defend': {
    tackles: 2.5,
    interceptions: 2.5,
    passesCompleted: 2.0,
    keyPasses: 1.0,
    crosses: 0.3,
    assists: 0.5,
    dribbles: 0.5,
    runs: 1.0,
    positionErrors: -2.0,
    fouls: -0.5,
  },
  'FB_complete_wing_back_attack': {
    tackles: 1.5,
    interceptions: 1.5,
    passesCompleted: 1.5,
    keyPasses: 2.0,
    crosses: 3.0,
    assists: 3.0,
    dribbles: 1.5,
    runs: 3.0,
    goals: 1.0,
    shots: 0.8,
    positionErrors: -1.0,
    fouls: -0.5,
  },

  // ===== CDM roles =====
  'CDM_anchor_man_defend': {
    tackles: 3.0,
    interceptions: 3.0,
    clearances: 1.5,
    passesCompleted: 1.5,
    keyPasses: 0.5,
    dribbles: 0.3,
    shots: 0.2,
    goals: 0.2,
    fouls: -0.5,
    positionErrors: -1.5,
  },
  'CDM_deep_lying_playmaker_defend': {
    tackles: 1.5,
    interceptions: 2.0,
    passesCompleted: 3.0,
    keyPasses: 2.5,
    throughBalls: 2.0,
    assists: 1.5,
    dribbles: 0.5,
    shots: 0.3,
    goals: 0.3,
    positionErrors: -1.0,
    fouls: -0.3,
  },
  'CDM_regista_support': {
    tackles: 1.0,
    interceptions: 1.5,
    passesCompleted: 3.5,
    keyPasses: 3.0,
    throughBalls: 2.5,
    assists: 2.0,
    dribbles: 1.0,
    shots: 0.5,
    goals: 0.5,
    runs: 1.5,
    positionErrors: -0.5,
    fouls: -0.3,
  },

  // ===== CM roles =====
  'CM_box_to_box_support': {
    tackles: 1.5,
    interceptions: 1.5,
    passesCompleted: 2.0,
    keyPasses: 1.5,
    throughBalls: 1.0,
    dribbles: 1.0,
    runs: 2.0,
    shots: 0.8,
    goals: 2.0,
    assists: 2.0,
  },
  'CM_deep_lying_playmaker_support': {
    tackles: 1.0,
    interceptions: 1.5,
    passesCompleted: 3.5,
    keyPasses: 3.0,
    throughBalls: 2.5,
    assists: 2.5,
    dribbles: 0.5,
    shots: 0.3,
    goals: 0.3,
    fouls: -0.3,
  },
  'CM_advanced_playmaker_attack': {
    tackles: 0.3,
    interceptions: 0.5,
    passesCompleted: 2.5,
    keyPasses: 3.0,
    throughBalls: 3.5,
    assists: 3.0,
    dribbles: 1.0,
    shots: 0.5,
    goals: 1.0,
    fouls: -0.3,
  },
  'CM_mezzala_attack': {
    tackles: 0.8,
    interceptions: 0.8,
    passesCompleted: 2.0,
    keyPasses: 2.0,
    throughBalls: 1.5,
    dribbles: 2.0,
    runs: 2.5,
    shots: 1.5,
    goals: 2.5,
    assists: 2.0,
    crosses: 1.0,
  },
  'CM_ball_winning_midfielder_defend': {
    tackles: 4.0,
    interceptions: 3.0,
    clearances: 1.0,
    passesCompleted: 1.5,
    fouls: -1.0,
    positionErrors: -1.0,
    shots: 0.2,
    goals: 0.2,
  },
  'CM_roaming_playmaker_support': {
    tackles: 0.5,
    interceptions: 1.0,
    passesCompleted: 3.5,
    keyPasses: 3.5,
    throughBalls: 3.0,
    assists: 3.0,
    dribbles: 1.5,
    runs: 3.0,
    shots: 0.5,
    goals: 0.8,
    fouls: -0.2,
  },

  // ===== CAM roles =====
  'CAM_advanced_playmaker_attack': {
    tackles: 0.2,
    interceptions: 0.3,
    passesCompleted: 2.5,
    keyPasses: 3.5,
    throughBalls: 3.5,
    assists: 3.5,
    dribbles: 1.0,
    shots: 1.0,
    goals: 1.5,
    fouls: -0.2,
  },
  'CAM_engache_support': {
    tackles: 0.1,
    interceptions: 0.2,
    passesCompleted: 3.0,
    keyPasses: 4.0,
    throughBalls: 4.0,
    assists: 4.0,
    dribbles: 0.5,
    shots: 0.5,
    goals: 0.8,
    runs: 0.5,
    fouls: -0.1,
  },
  'CAM_shadow_striker_attack': {
    tackles: 0.3,
    passesCompleted: 1.5,
    keyPasses: 2.0,
    throughBalls: 2.0,
    dribbles: 1.5,
    runs: 2.0,
    shots: 2.5,
    shotsOnTarget: 2.5,
    goals: 4.0,
    assists: 2.0,
    offsides: -0.5,
  },

  // ===== WM roles =====
  'WM_wide_midfielder_support': {
    tackles: 1.0,
    interceptions: 1.0,
    passesCompleted: 1.5,
    keyPasses: 1.5,
    crosses: 2.5,
    assists: 2.0,
    dribbles: 1.0,
    runs: 2.0,
    shots: 0.5,
    goals: 0.8,
  },
  'WM_wide_playmaker_attack': {
    tackles: 0.5,
    interceptions: 0.5,
    passesCompleted: 2.5,
    keyPasses: 3.0,
    throughBalls: 2.5,
    crosses: 1.5,
    assists: 3.0,
    dribbles: 1.5,
    shots: 0.8,
    goals: 1.0,
  },
  'WM_defensive_winger_defend': {
    tackles: 3.0,
    interceptions: 2.5,
    clearances: 1.0,
    passesCompleted: 1.0,
    crosses: 2.0,
    assists: 1.0,
    runs: 2.5,
    fouls: -0.5,
    positionErrors: -1.5,
    shots: 0.2,
    goals: 0.3,
  },

  // ===== WG roles =====
  'WG_winger_attack': {
    tackles: 0.2,
    interceptions: 0.3,
    passesCompleted: 1.0,
    keyPasses: 1.5,
    crosses: 3.5,
    assists: 3.0,
    dribbles: 2.5,
    runs: 2.5,
    shots: 1.0,
    goals: 2.0,
    offsides: -0.5,
  },
  'WG_inside_forward_attack': {
    tackles: 0.3,
    passesCompleted: 1.0,
    keyPasses: 1.5,
    throughBalls: 1.0,
    crosses: 0.5,
    assists: 2.0,
    dribbles: 2.5,
    runs: 2.0,
    shots: 2.0,
    shotsOnTarget: 2.0,
    goals: 4.0,
    offsides: -0.5,
  },
  'WG_inverted_winger_support': {
    tackles: 0.5,
    interceptions: 0.5,
    passesCompleted: 2.0,
    keyPasses: 2.5,
    throughBalls: 2.0,
    crosses: 1.0,
    assists: 2.5,
    dribbles: 2.0,
    shots: 1.0,
    goals: 1.5,
    offsides: -0.3,
  },

  // ===== ST roles =====
  'ST_poacher_attack': {
    tackles: 0.1,
    passesCompleted: 0.5,
    keyPasses: 1.0,
    dribbles: 0.5,
    shots: 3.0,
    shotsOnTarget: 3.5,
    goals: 5.0,
    assists: 1.0,
    offsides: -1.0,
  },
  'ST_advanced_forward_attack': {
    tackles: 0.2,
    passesCompleted: 0.8,
    keyPasses: 1.5,
    dribbles: 1.0,
    runs: 2.0,
    shots: 2.5,
    shotsOnTarget: 2.5,
    goals: 4.5,
    assists: 2.0,
    offsides: -0.5,
  },
  'ST_complete_forward_attack': {
    tackles: 0.5,
    passesCompleted: 1.0,
    keyPasses: 2.0,
    throughBalls: 1.0,
    dribbles: 1.0,
    runs: 1.5,
    shots: 2.0,
    shotsOnTarget: 2.5,
    goals: 4.0,
    assists: 2.5,
    offsides: -0.5,
  },
  'ST_deep_lying_forward_support': {
    tackles: 0.5,
    passesCompleted: 2.0,
    keyPasses: 3.0,
    throughBalls: 2.5,
    dribbles: 1.5,
    assists: 3.5,
    shots: 1.0,
    shotsOnTarget: 1.0,
    goals: 2.0,
    offsides: -0.2,
  },
  'ST_target_man_support': {
    tackles: 0.5,
    passesCompleted: 1.5,
    keyPasses: 2.0,
    crosses: 0.3,
    assists: 2.0,
    dribbles: 0.3,
    shots: 2.0,
    shotsOnTarget: 2.0,
    goals: 3.5,
    offsides: -0.3,
    fouls: -0.3,
  },
  'ST_trequartista_attack': {
    tackles: 0.1,
    passesCompleted: 2.0,
    keyPasses: 3.5,
    throughBalls: 3.5,
    dribbles: 2.0,
    assists: 4.0,
    shots: 1.5,
    shotsOnTarget: 1.5,
    goals: 2.5,
    runs: 1.0,
    offsides: -0.3,
  },
  'ST_pressing_forward_attack': {
    tackles: 1.5,
    interceptions: 1.0,
    passesCompleted: 1.0,
    keyPasses: 1.5,
    dribbles: 1.0,
    runs: 2.5,
    shots: 2.0,
    shotsOnTarget: 2.0,
    goals: 3.5,
    assists: 1.5,
    offsides: -0.5,
    fouls: -0.8,
  },
};

// ===========================================================================
// DEFAULT WEIGHTS (generic fallback when no role is specified)
// ===========================================================================

export const DEFAULT_RATING_WEIGHTS = {
  tackles: 1.0,
  interceptions: 1.0,
  clearances: 1.0,
  passesCompleted: 1.0,
  keyPasses: 1.0,
  throughBalls: 1.0,
  crosses: 1.0,
  dribbles: 1.0,
  runs: 1.0,
  shots: 1.0,
  shotsOnTarget: 1.0,
  goals: 3.0,
  assists: 2.5,
  fouls: -0.5,
  offsides: -0.3,
  positionErrors: -1.0,
  errors: -2.0,
};

// GK special weights (used when no role matches)
const GK_DEFAULT_WEIGHTS = {
  saves: 3.0,
  catches: 1.5,
  punches: 1.0,
  passesCompleted: 0.5,
  sweeps: 1.0,
  goalsConceded: -2.5,
  cleanSheet: 1.5,
  errors: -3.0,
};

// ===========================================================================
// RATING SCALE LABELS
// ===========================================================================

export const RATING_LABELS = [
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

// ===========================================================================
// RESULT MODIFIERS
// ===========================================================================

const WIN_BONUS = 0.3;
const DRAW_BONUS = 0.0;
const LOSS_PENALTY = -0.3;

// Minutes threshold for full rating (subs get prorated below this)
const MIN_MINUTES_FOR_FULL_RATING = 60;

// Scaling factor for weighted contribution
const WEIGHT_SCALE = 0.02;

// ===========================================================================
// PUBLIC API
// ===========================================================================

/**
 * Calculate FM-style match rating for a player.
 *
 * Uses a two-tier system:
 *   1. If the player has matchStats with tracked events, use weighted
 *      contribution scoring (preferred, from Phase 5.2 tracker).
 *   2. Falls back to event-list scoring (legacy compatibility).
 *
 * @param {object} player — player object with matchStats or legacy stats
 * @param {string} position — e.g. 'CM', 'ST'
 * @param {string} [role] — role key e.g. 'CM_box_to_box_support'
 * @param {object} [matchContext] — { result: 'win'|'draw'|'loss', minutesPlayed }
 * @returns {number} 0.0-10.0
 */
export function calculateRating(player, position, role, matchContext) {
  if (!player) return 6.0;

  const pos = position || player.position || 'CM';
  const ctx = matchContext || {};

  // GK uses specialized formula
  if (pos === 'GK') {
    return calculateGKRating(player, role, ctx);
  }

  // Determine weights: role-specific > generic role > default
  const weights = role && ROLE_RATING_WEIGHTS[role]
    ? ROLE_RATING_WEIGHTS[role]
    : DEFAULT_RATING_WEIGHTS;

  // Start from position baseline
  const baseline = POSITION_RATING_BASELINE[pos] || 6.5;
  let rating = baseline;

  // Calculate weighted contribution from match stats
  let contributionScore = 0;
  const stats = player.matchStats || player.stats || {};

  for (const [statName, weight] of Object.entries(weights)) {
    const statValue = stats[statName] || 0;
    contributionScore += statValue * weight * WEIGHT_SCALE;
  }

  // Apply minutes modifier (subs who play < 60 min get prorated)
  const minutesPlayed = stats.minutesPlayed || player.minutesPlayed || 90;
  const minutesModifier = Math.min(1.0, minutesPlayed / MIN_MINUTES_FOR_FULL_RATING);

  // Apply result modifier
  const resultModifier = getResultModifier(ctx);

  // Composite rating
  rating += (contributionScore * minutesModifier) + resultModifier;

  // Clean sheet bonus for defenders (goalsConceded = 0)
  if (stats.goalsConceded !== undefined && stats.goalsConceded === 0
      && minutesPlayed >= MIN_MINUTES_FOR_FULL_RATING) {
    const cleanSheetBonuses = { CB: 0.25, LB: 0.2, RB: 0.2, LWB: 0.2, RWB: 0.2, CDM: 0.2 };
    rating += cleanSheetBonuses[pos] || 0;
  }

  // Clamp to 0-10
  return Math.max(0.1, Math.min(10.0, Math.round(rating * 10) / 10));
}

/**
 * Specialized GK rating formula.
 *
 * Key differences from outfield:
 *   - Save ratio is the primary metric
 *   - Goal concession penalty
 *   - Clean sheet bonus
 *   - Distribution bonus (for sweeper keepers)
 *
 * @param {object} player
 * @param {string} [role]
 * @param {object} [matchContext]
 * @returns {number} 0.0-10.0
 */
export function calculateGKRating(player, role, matchContext) {
  const ctx = matchContext || {};
  const stats = player.matchStats || player.stats || {};
  const weights = role && ROLE_RATING_WEIGHTS[role]
    ? ROLE_RATING_WEIGHTS[role]
    : GK_DEFAULT_WEIGHTS;

  let rating = POSITION_RATING_BASELINE.GK;

  const saves = stats.saves || stats.savesParried || 0;
  const goalsConceded = stats.goalsConceded || 0;

  // Save ratio is the key metric
  const saveRatio = goalsConceded > 0
    ? saves / (saves + goalsConceded)
    : (saves > 0 ? 1.0 : 0.7);

  // Baseline save ratio is ~0.7 — score above/below this
  rating += (saveRatio - 0.7) * 3.0;

  // Goal concession penalty
  rating -= goalsConceded * 0.4;

  // Clean sheet bonus
  if (goalsConceded === 0) rating += 1.0;

  // Distribution bonus
  const passesCompleted = stats.passesCompleted || 0;
  rating += (passesCompleted / 20) * 0.5;

  // Sweeper actions
  const sweeps = stats.sweeps || 0;
  rating += sweeps * 0.2;

  // Catches and punches from GK stats
  const catches = stats.catches || 0;
  const punches = stats.punches || 0;
  rating += catches * 0.05;
  rating += punches * 0.05;

  // Errors penalty
  const errors = stats.errors || stats.errorsLeadingToGoal || 0;
  rating -= errors * 1.0;

  // Result modifier
  rating += getResultModifier(ctx);

  return Math.max(0.1, Math.min(10.0, Math.round(rating * 10) / 10));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the result modifier for the match context.
 *
 * @param {object} matchContext — { result: 'win'|'draw'|'loss' }
 * @returns {number}
 */
function getResultModifier(matchContext) {
  if (!matchContext) return 0;

  const { result } = matchContext;
  switch (result) {
    case 'win': return WIN_BONUS;
    case 'draw': return DRAW_BONUS;
    case 'loss': return LOSS_PENALTY;
    default: return 0;
  }
}

/**
 * Determine which side ('home'|'away') a player is on in matchDetails.
 */
function _findPlayerSide(matchDetails, playerID) {
  const homeTeam = matchDetails.homeTeam || [];
  const awayTeam = matchDetails.awayTeam || [];
  for (const p of homeTeam) {
    if (p.id === playerID || p.playerID === playerID) return 'home';
  }
  for (const p of awayTeam) {
    if (p.id === playerID || p.playerID === playerID) return 'away';
  }
  return null;
}

/**
 * Determine match result for a specific side.
 */
function _getSideResult(matchDetails, side) {
  const result = matchDetails.result || {};
  const homeGoals = result.homeGoals ?? matchDetails.goals ?? 0;
  const awayGoals = result.awayGoals ?? matchDetails.awayGoals ?? 0;
  // Also check _finished state
  const homeWin = result.homeWin ?? matchDetails.homeWin;
  const awayWin = result.awayWin ?? matchDetails.awayWin;
  const draw = result.draw ?? matchDetails.draw;

  if (draw) return 'draw';
  if (side === 'home') {
    if (homeWin || homeGoals > awayGoals) return 'win';
    if (awayWin || awayGoals > homeGoals) return 'loss';
  } else {
    if (awayWin || awayGoals > homeGoals) return 'win';
    if (homeWin || homeGoals > awayGoals) return 'loss';
  }
  if (homeGoals === awayGoals) return 'draw';
  return 'draw';
}

// ---------------------------------------------------------------------------
// Legacy rateAllPlayers (backward compatible)
// ---------------------------------------------------------------------------

/**
 * Rate all players in a match and return sorted results.
 * Supports both the new system (matchStats) and legacy (events list).
 *
 * @param {object} matchDetails
 * @returns {{ home: Array, away: Array, mvp: object|null }}
 */
export function rateAllPlayers(matchDetails) {
  if (!matchDetails) return { home: [], away: [], mvp: null };

  const homeTeam = matchDetails.homeTeam || [];
  const awayTeam = matchDetails.awayTeam || [];
  const homeRoles = matchDetails._homeRoles || {};
  const awayRoles = matchDetails._awayRoles || {};

  // Use matchStats from tracker if available
  const tracker = matchDetails._statsTracker;
  const homeStats = tracker?.home?.players || {};
  const awayStats = tracker?.away?.players || {};

  const rateTeam = (players, statsMap, roles, side) => {
    return players.map((p) => {
      // Tracker/role lookup key — the engine's (randomised) playerID.
      const lookupID = p.id || p.playerID;
      // Stable identity for the UI — prefer squadID, which survives the
      // engine's setGameVariables playerID randomisation (so `player_self`
      // maps back to the human player for MVP / growth / highlight logic).
      const displayID = p.squadID || lookupID;
      const tracked = statsMap[lookupID] || {};
      const derived = (tracked && Object.keys(tracked).length > 0)
        ? (typeof calculateDerivedStats === 'function' ? calculateDerivedStats(tracked) : tracked)
        : {};

      const position = p.position || 'CM';
      const role = roles[lookupID] || null;
      const result = _getSideResult(matchDetails, side);

      // If we have tracked stats, use the new system
      if (Object.keys(derived).length > 0) {
        return {
          playerID: displayID,
          name: p.name || displayID,
          position,
          role,
          rating: calculateRating(
            { ...p, matchStats: { ...derived, minutesPlayed: tracked.minutesPlayed || 90 } },
            position,
            role,
            { result },
          ),
        };
      }

      // Legacy: use the old event-based system
      const legacy = _legacyRatePlayer(matchDetails, lookupID, p, role, side);
      legacy.playerID = displayID;
      return legacy;
    }).sort((a, b) => b.rating - a.rating);
  };

  const home = rateTeam(homeTeam, homeStats, homeRoles, 'home');
  const away = rateTeam(awayTeam, awayStats, awayRoles, 'away');
  const all = [...home, ...away].sort((a, b) => b.rating - a.rating);
  const mvp = all.length > 0 ? all[0] : null;

  return { home, away, mvp };
}

/**
 * Legacy event-based rating (kept for backward compatibility).
 */
function _legacyRatePlayer(matchDetails, playerID, playerObj, role, side) {
  const events = matchDetails.events || [];
  const result = matchDetails.result || {};
  const minutesPlayed = (matchDetails.minutesPlayed || {})[playerID] || 90;

  const position = playerObj?.position || 'CM';

  // Event contributions
  let eventScore = 0;
  const POSITIVE_EVENTS = {
    goal: 1.0, assist: 0.5, keyPass: 0.2, successfulDribble: 0.1,
    tackleWon: 0.1, interception: 0.1, clearance: 0.1,
    passComplete: 0.05, shotOnTarget: 0.15, penaltyGoal: 0.8,
    savedPenalty: 1.5, bigChanceCreated: 0.3, crossCompleted: 0.15,
    lastManTackle: 0.3,
  };
  const NEGATIVE_EVENTS = {
    redCard: 2.0, yellowCard: 0.5, secondYellow: 1.5, ownGoal: 1.5,
    penaltyConceded: 1.0, dribbledPast: 0.1, possessionLost: 0.1,
    passMissed: 0.05, foulCommit: 0.1, offside: 0.05,
    missedChance: 0.3, errorLeadToGoal: 1.0, penaltyMissed: 1.5,
    caughtOffPosition: 0.05,
  };

  for (const evt of events) {
    if (evt.playerID !== playerID) continue;
    eventScore += POSITIVE_EVENTS[evt.type] || 0;
    eventScore -= NEGATIVE_EVENTS[evt.type] || 0;
  }

  // Result modifier
  let resultMod = 0;
  if (side === 'home') {
    if (result.homeGoals > result.awayGoals) resultMod = 0.15;
    else if (result.homeGoals === result.awayGoals) resultMod = 0.05;
    else resultMod = -0.1;
  } else {
    if (result.awayGoals > result.homeGoals) resultMod = 0.15;
    else if (result.awayGoals === result.homeGoals) resultMod = 0.05;
    else resultMod = -0.1;
  }

  // Minutes multiplier
  let minutesMult = 1;
  if (minutesPlayed < MIN_MINUTES_FOR_FULL_RATING) {
    minutesMult = 0.5 + (0.5 * minutesPlayed) / MIN_MINUTES_FOR_FULL_RATING;
  }

  const rating = Math.max(0, Math.min(10, (6.0 + eventScore + resultMod) * minutesMult));
  return {
    playerID,
    name: playerObj?.name || playerID,
    position,
    role,
    rating: Math.round(rating * 10) / 10,
  };
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

/**
 * Get the rating color class for UI styling.
 *
 * @param {number} rating
 * @returns {string} CSS class
 */
export function getRatingClass(rating) {
  if (rating >= 8.0) return 'rating-excellent';
  if (rating >= 7.0) return 'rating-good';
  if (rating >= 6.0) return 'rating-average';
  return 'rating-poor';
}

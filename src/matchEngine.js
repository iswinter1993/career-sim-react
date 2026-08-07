// Facade wrapper around footballsimulationengine (CJS → ESM bridge).
//
// The npm package uses `require()` (CommonJS) but Vite's bundler handles
// conversion automatically. This module presents a clean async API while
// suppressing the engine's noisy console.log, normalising data shapes,
// and exposing convenience helpers for React integration.
//
// Public API:
//   createMatch(homeTeam, awayTeam, pitch)  → matchDetails
//   runIteration(matchDetails)               → matchDetails
//   startSecondHalf(matchDetails)            → matchDetails
//   runAutoSim(matchDetails, maxIters, cb)   → matchDetails
//   applySubstitution(matchDetails, teamKey, playerOutID, playerIn)
//                                             → matchDetails
//   buildPlayerJson({ id, name, position, engineSkills, subAttrs })
//                                             → engine-ready player object
//   buildTeamJson(teamName, playerList)       → engine-ready team object
//   DEFAULT_PITCH                             → { pitchWidth, pitchHeight, goalWidth }
//   getMatchSummary(matchDetails)             → { homeGoals, awayGoals, … }
//   getIterationCount(matchDetails)           → number
//   isMatchFinished(matchDetails)             → boolean (both halves done)
//   destroyMatch()                            → restore console.log

import * as Engine from 'footballsimulationengine';

// ---------------------------------------------------------------------------
// console.log suppression
// ---------------------------------------------------------------------------

const _originalLog = console.log;
let _suppressed = false;

function _suppressLog() {
  if (_suppressed) return;
  console.log = () => {};
  _suppressed = true;
}

function _restoreLog() {
  console.log = _originalLog;
  _suppressed = false;
}

/** Restore console.log — call after the match concludes. */
export function destroyMatch() {
  _restoreLog();
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_PITCH = {
  pitchWidth: 680,
  pitchHeight: 1050,
  goalWidth: 90,
};

// Iterations per half. Half the author's reference (gamelength=12000→6000/half)
// because we batch 4 iterations per tick, giving ~12s per half at normal speed.
export const DEFAULT_ITERATIONS = 3000;

// ---------------------------------------------------------------------------
// Player / Team builder helpers
// ---------------------------------------------------------------------------

// Map extended position codes to engine-supported positions.
// The engine only understands: GK, CB, LB, RB, CM, LM, RM, ST
// Our game uses: GK, CB, LB, RB, CDM, CM, CAM, LM, RM, LW, RW, ST
const ENGINE_POSITION_MAP = {
  CDM: 'CM',
  CAM: 'CM',
  LW:  'LM',
  RW:  'RM',
};

/** Engine-compatible starting positions matching the sample initiated_team.json. */
const POSITION_PLACES = {
  GK: [340, 0],
  LB: [80,  80],
  CB: [230, 80],   // alternates with 420 for second CB
  RB: [600, 80],
  LM: [80,  270],
  CM: [230, 270],  // alternates with 420 for second CM
  RM: [600, 270],
  ST: [280, 500],  // alternates with 440 for second ST
};

/** Alternating x-offset for paired positions (two CBs, two CMs, two STs). */
const PAIRED_OFFSET_X = {
  CB: 190,  // 230 → 420
  CM: 190,  // 230 → 420
  ST: 160,  // 280 → 440
};

// Track pairing counter so two CBs / two CMs / two STs split left/right
const _pairCount = {};

function _enginePosFor(p) {
  const raw = p.position || 'CM';
  // Map extended positions to engine-supported ones
  return ENGINE_POSITION_MAP[raw] || raw;
}

function _placementFor(p) {
  const pos = _enginePosFor(p);
  const base = POSITION_PLACES[pos] || [340, 300];

  // Paired position: alternate x so two same-position players spread out
  if (PAIRED_OFFSET_X[pos] != null) {
    const n = _pairCount[pos] || 0;
    _pairCount[pos] = n + 1;
    if (n > 0) {
      return [base[0] + PAIRED_OFFSET_X[pos], base[1]];
    }
  }

  return [base[0], base[1]];
}

/** Reset pairing counters (call before building each new team). */
export function resetPlacementCounters() {
  _pairCount.CB  = 0;
  _pairCount.CM  = 0;
  _pairCount.ST  = 0;
}

/**
 * Build a single engine-compatible Player JSON from our internal player shape.
 *
 * @param {object} p — { id, name, position, engineSkills, subAttrs, height }
 * @returns {object} engine-ready player
 */
export function buildPlayerJson(p) {
  const skills = p.engineSkills || {};
  const enginePos = _enginePosFor(p);
  const [px, py] = _placementFor(p);
  return {
    name: p.name || p.id,
    position: enginePos,
    rating: String(p.ovr || 50),
    skill: {
      passing:        String(skills.passing ?? 50),
      shooting:       String(skills.shooting ?? 50),
      tackling:       String(skills.tackling ?? 50),
      saving:         String(skills.saving ?? 50),
      agility:        String(skills.agility ?? 50),
      strength:       String(skills.strength ?? 50),
      penalty_taking: String(skills.penalty_taking ?? 50),
      perception:     String(skills.perception ?? 50),
      jumping:        String(skills.jumping ?? 50),
      control:        String(skills.control ?? 50),
    },
    currentPOS: [px, py],
    fitness: skills.fitness ?? 100,
    height: p.height ?? 180,
    injured: p.injured ?? false,
  };
}

/**
 * Batch-convert a list of our internal players into engine-ready JSON.
 * Convenience factory for squad generation.  Resets pairing counters first
 * so CB/CM/ST pairs are split left/right correctly.
 */
export function buildPlayerJsonList(players) {
  resetPlacementCounters();
  return players.map(buildPlayerJson);
}

/**
 * Convert a list of players into the engine's Team JSON.
 *
 * @param {string} teamName
 * @param {Array} players — array of objects with buildPlayerJson's shape
 * @returns {object}
 */
export function buildTeamJson(teamName, players) {
  resetPlacementCounters();
  return {
    name: teamName,
    players: players.map(buildPlayerJson),
    manager: 'CPU',
  };
}

// ---------------------------------------------------------------------------
// Core API wrappers
// ---------------------------------------------------------------------------

/**
 * Initialise a match between two teams.
 *
 * @param {object} homeTeam — from buildTeamJson()
 * @param {object} awayTeam — from buildTeamJson()
 * @param {object} [pitch] — { pitchWidth, pitchHeight, goalWidth }
 * @returns {Promise<object>} matchDetails
 */
export async function createMatch(homeTeam, awayTeam, pitch) {
  _suppressLog();
  const p = pitch || DEFAULT_PITCH;
  const md = await Engine.initiateGame(homeTeam, awayTeam, p);

  // The engine randomly assigns "kickOffTeam" and "secondTeam".
  // Normalise: tag each team with a stable side key so our UI knows
  // which is home/away regardless of the engine's internal naming.
  md._homeTeamName = homeTeam.name;
  md._awayTeamName = awayTeam.name;
  md._half = 1;
  md._halfIteration = 0;
  md._finished = false;

  return md;
}

/**
 * Run one iteration of the match engine.
 *
 * @param {object} matchDetails
 * @returns {Promise<object>} updated matchDetails
 */
export async function runIteration(matchDetails) {
  _suppressLog();
  try {
    const md = await Engine.playIteration(matchDetails);
    md._half = matchDetails._half || 1;
    md._halfIteration = (matchDetails._halfIteration || 0) + 1;
    return md;
  } catch (e) {
    // Engine-internal boundary case (e.g. "player.skill" on undefined during
    // a penalty or tackle resolution). Skip this iteration gracefully — the
    // match state is preserved and the next tick will likely succeed.
    console.warn('[MatchEngine] playIteration error (skipping tick):', e.message || e);
    matchDetails._halfIteration = (matchDetails._halfIteration || 0) + 1;
    return matchDetails;
  }
}

/**
 * Transition to the second half.
 *
 * Works around an engine bug: when a player receives a red card (or two
 * yellows), playerMovement.js calls Object.defineProperty(currentPOS, …)
 * with writable:false + configurable:false.  Later, startSecondHalf →
 * switchSide iterates ALL players and attempts `currentPOS = originPOS`,
 * which throws "Cannot assign to read only property 'currentPOS'".
 *
 * Our fix: clone any player whose currentPOS is frozen by the engine
 * (i.e. currentPOS[0] === 'NP') back into a plain object so the
 * switchSide assignment succeeds. The cloned player keeps the 'NP' marker
 * so the rest of the engine still treats them as sent off.
 *
 * @param {object} matchDetails
 * @returns {Promise<object>} updated matchDetails
 */
export async function startSecondHalf(matchDetails) {
  _suppressLog();

  // Remember which players are sent off before the engine runs.
  // switchSide unconditionally overwrites currentPOS for every player,
  // including sent-off ones whose currentPOS was frozen to ['NP','NP'].
  const sentOff = _sentOffPlayerIDs(matchDetails);

  // Unfreeze any red-carded players so switchSide's `currentPOS = originPOS`
  // assignment doesn't crash with "Cannot assign to read only property".
  // (The engine uses writable:false + configurable:false for sent-off players.)
  _unfreezeAllPlayers(matchDetails);

  const md = await Engine.startSecondHalf(matchDetails);

  // Restore sent-off markers — switchSide gave sent-off players real
  // coordinates, but they must stay at ['NP','NP'] so the engine doesn't
  // try to move/validate them.
  _reapplySentOff(md, sentOff);

  md._half = 2;
  md._halfIteration = 0;
  return md;
}

/** Collect the playerIDs of players whose currentPOS indicates they are
 *  sent off or frozen by the engine's red-card logic. */
function _sentOffPlayerIDs(matchDetails) {
  const ids = new Set();
  for (const teamKey of ['kickOffTeam', 'secondTeam']) {
    const team = matchDetails[teamKey];
    if (!team?.players) continue;
    for (const p of team.players) {
      const pos = p.currentPOS;
      if (Array.isArray(pos) && pos[0] === 'NP') {
        ids.add(p.playerID);
      }
    }
  }
  return ids;
}

/** Replace any player whose currentPOS is frozen with a plain (mutable)
 *  clone so that switchSide can reassign currentPOS without throwing. */
function _unfreezeAllPlayers(matchDetails) {
  for (const teamKey of ['kickOffTeam', 'secondTeam']) {
    const team = matchDetails[teamKey];
    if (!team?.players) continue;
    for (let i = 0; i < team.players.length; i++) {
      const p = team.players[i];
      const pos = p.currentPOS;
      if (Array.isArray(pos) && pos[0] === 'NP') {
        team.players[i] = { ...p, currentPOS: ['NP', 'NP'] };
      }
    }
  }
}

/** Restore currentPOS = ['NP','NP'] for players who were sent off before
 *  startSecondHalf, after switchSide overwrote it with real coordinates. */
function _reapplySentOff(matchDetails, playerIDs) {
  if (!playerIDs || playerIDs.size === 0) return;
  for (const teamKey of ['kickOffTeam', 'secondTeam']) {
    const team = matchDetails[teamKey];
    if (!team?.players) continue;
    for (const p of team.players) {
      if (playerIDs.has(p.playerID)) {
        try {
          p.currentPOS = ['NP', 'NP'];
        } catch (_) { /* still frozen somehow — should not happen */ }
      }
    }
  }
}

/**
 * Automatically run all remaining iterations to complete the match.
 *
 * Calls `onProgress` periodically so the UI can update.
 *
 * @param {object} matchDetails — current state
 * @param {number} maxItersPerHalf — iterations per half (default DEFAULT_ITERATIONS, 3000)
 * @param {Function} [onProgress] — (matchDetails, pct) called periodically
 * @returns {Promise<object>} final matchDetails
 */
export async function runAutoSim(matchDetails, maxItersPerHalf, onProgress) {
  const maxIters = maxItersPerHalf || DEFAULT_ITERATIONS;
  let md = matchDetails;

  const currentIter = getIterationCount(md);
  const remainingHalf1 = md._half === 1 ? Math.max(0, maxIters - currentIter) : 0;

  // First half
  for (let i = 0; i < remainingHalf1; i++) {
    md = await runIteration(md);
    if (onProgress && i % 10 === 0) {
      const pct = ((i + 1) / (maxIters * 2)) * 100;
      onProgress(md, Math.round(pct));
    }
  }

  // Half-time transition
  if (md._half === 1) {
    md = await startSecondHalf(md);
  }

  // Second half
  const currentIter2 = getIterationCount(md);
  const remainingHalf2 = Math.max(0, maxIters - currentIter2);

  for (let i = 0; i < remainingHalf2; i++) {
    md = await runIteration(md);
    if (onProgress && i % 10 === 0) {
      const pct = 50 + ((i + 1) / maxIters) * 50;
      onProgress(md, Math.round(pct));
    }
  }

  md._finished = true;
  _restoreLog();
  return md;
}

/**
 * Substitute a player during a match (between iterations).
 *
 * @param {object} matchDetails
 * @param {'kickOffTeam'|'secondTeam'} teamKey — which team in the engine's structure
 * @param {string} playerOutID — playerID being taken off
 * @param {object} playerIn — the substitute player object (buildPlayerJson shape)
 * @returns {object} updated matchDetails
 */
export function applySubstitution(matchDetails, teamKey, playerOutID, playerIn) {
  const team = matchDetails[teamKey];
  if (!team) return matchDetails;

  const idx = team.players.findIndex((p) => p.playerID === playerOutID);
  if (idx === -1) return matchDetails;

  const subPlayer = buildPlayerJson(playerIn);
  team.players[idx] = subPlayer;

  // Re-index: engine assigns playerID based on array position during init,
  // but mid-match we just swap the player object (the engine doesn't re-validate).
  return matchDetails;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Get current half's iteration count.
 * Uses _halfIteration (per-half counter) since engine's iterationLog is cumulative.
 */
export function getIterationCount(matchDetails) {
  return matchDetails?._halfIteration || 0;
}

/**
 * Check if the match has finished both halves.
 */
export function isMatchFinished(matchDetails) {
  return matchDetails?._finished === true;
}

/**
 * Extract a readable summary from the match details.
 *
 * @returns {{ homeGoals: number, awayGoals: number, winner: string,
 *   homeShots: number, awayShots: number, possession: [number, number] }}
 */
export function getMatchSummary(matchDetails) {
  if (!matchDetails) return null;

  // The engine stores stats under team statistics objects.
  // Figure out which is which based on our custom tags.
  const kickOff = matchDetails.kickOffTeam;
  const second = matchDetails.secondTeam;

  const kickOffStats = matchDetails.kickOffTeamStatistics || {};
  const secondStats = matchDetails.secondTeamStatistics || {};

  const kickIsHome = kickOff?.name === matchDetails._homeTeamName;

  const homeGoals = kickIsHome
    ? (kickOffStats.goals || 0)
    : (secondStats.goals || 0);
  const awayGoals = kickIsHome
    ? (secondStats.goals || 0)
    : (kickOffStats.goals || 0);

  const homeShots = kickIsHome
    ? (kickOffStats.shots?.total || 0)
    : (secondStats.shots?.total || 0);
  const awayShots = kickIsHome
    ? (secondStats.shots?.total || 0)
    : (kickOffStats.shots?.total || 0);

  let winner = 'draw';
  if (homeGoals > awayGoals) winner = 'home';
  else if (awayGoals > homeGoals) winner = 'away';

  return {
    homeGoals,
    awayGoals,
    winner,
    homeShots,
    awayShots,
    homeTeamName: matchDetails._homeTeamName || kickOff?.name || 'Home',
    awayTeamName: matchDetails._awayTeamName || second?.name || 'Away',
    half: matchDetails._half || 1,
    finished: matchDetails._finished || false,
  };
}

/**
 * Collect per-player stats from the match details.
 *
 * Engine stores per-player stats inside each player's `stats` field.
 *
 * @returns {object} { [playerID]: { goals, shots, passes, tackles, cards, saves, … } }
 */
export function getPlayerStats(matchDetails) {
  if (!matchDetails) return {};

  const stats = {};
  const allPlayers = [
    ...(matchDetails.kickOffTeam?.players || []),
    ...(matchDetails.secondTeam?.players || []),
  ];

  for (const p of allPlayers) {
    if (!p.playerID) continue;
    stats[p.playerID] = {
      name: p.name,
      position: p.position,
      goals: p.stats?.goals || 0,
      shots: p.stats?.shots || { total: 0, on: 0, off: 0 },
      passes: p.stats?.passes || { total: 0, on: 0, off: 0 },
      tackles: p.stats?.tackles || { total: 0, on: 0, off: 0, fouls: 0 },
      cards: p.stats?.cards || { yellow: 0, red: 0 },
      saves: p.stats?.saves || 0,
      injured: p.injured || false,
    };
  }

  return stats;
}

/**
 * Build a unified events array from the iteration log.
 *
 * The engine writes narrative strings to `iterationLog` each iteration.
 * Parse them into structured events for the commentary system.
 *
 * Uses _halfIteration and _half (tracked per-tick on matchDetails) instead
 * of splitting the log at totalEvents/2, which is unreliable when the two
 * halves produce different numbers of log entries.
 *
 * @returns {Array<{ type: string, text: string, half: number, halfIter: number, iter: number }>}
 */
export function parseIterationEvents(matchDetails) {
  if (!matchDetails?.iterationLog) return [];

  // Use tracked per-half counts stored alongside the matchDetails
  const half = matchDetails._half || 1;
  const halfIter = matchDetails._halfIteration || 1;
  const log = matchDetails.iterationLog;
  const total = log.length;
  if (total === 0) return [];

  const events = [];

  // The latest log entry (index total-1) belongs to this tick's half & halfIter.
  // We can't precisely assign every historical entry, but the engine appends
  // exactly one entry per tick, so we assign the most recent entry to the
  // current tick and let older entries keep their previously-computed halfIter.
  // For a fresh match, this builds up correctly tick by tick.

  // Build events: walk the log paired with half info.
  // Since we track half transitions, we rebuild the full events list each tick
  // by using a sliding estimate: entries up to a saved firstHalfCount marker.
  if (!matchDetails._firstHalfEventCount) {
    matchDetails._firstHalfEventCount = total;
  }

  const firstHalfSplit = matchDetails._firstHalfEventCount;
  let hi = 0;

  for (let i = 0; i < total; i++) {
    const text = log[i];
    const eventHalf = i < firstHalfSplit ? 1 : 2;
    const eventHalfIter = i < firstHalfSplit ? i : i - firstHalfSplit;
    events.push({
      text,
      half: eventHalf,
      halfIter: eventHalfIter,
      iter: i,
      type: _classifyEvent(text),
    });
  }

  return events;
}

function _classifyEvent(text) {
  const t = text.toLowerCase();
  if (t.includes('goal') || t.includes('scored')) return 'goal';
  if (t.includes('save')) return 'save';
  if (t.includes('tackle')) return 'tackle';
  if (t.includes('foul') || t.includes('yellow') || t.includes('red')) return 'foul';
  if (t.includes('offside')) return 'offside';
  if (t.includes('corner')) return 'corner';
  if (t.includes('pass')) return 'pass';
  if (t.includes('shot')) return 'shot';
  if (t.includes('cross')) return 'cross';
  if (t.includes('injur')) return 'injury';
  return 'info';
}

// Facade wrapper around footballsimulationengine (CJS → ESM bridge).
//
// The npm package uses `require()` (CommonJS) but Vite's bundler handles
// conversion automatically. This module presents a clean async API while
// suppressing the engine's noisy console.log, normalising data shapes,
// and exposing convenience helpers for React integration.
//
// Public API:
//   createMatch(homeTeam, awayTeam, pitch, tactics)  → matchDetails
//   runIteration(matchDetails)               → matchDetails
//   startSecondHalf(matchDetails)            → matchDetails
//   runAutoSim(matchDetails, maxIters, cb)   → matchDetails
//   applySubstitution(matchDetails, teamKey, playerOutID, playerIn)
//                                             → matchDetails
//   applySubstitutionV2(matchDetails, side, playerOutID, playerIn, subTracker, minute)
//                                             → { matchDetails, subTracker, success, error? }
//   applyFormationChange(matchDetails, side, newFormation, pitchSize)
//                                             → matchDetails
//   applyFormationChangeWithSubs(matchDetails, side, subs, newFormation, subTracker, minute, pitchSize)
//                                             → { matchDetails, subTracker, success, error? }
//   getFormationForMatch(matchDetails, side)  → string
//   createSubstitutionTracker()               → { windowsUsed, playersUsed, substitutions, … }
//   extractSubstitutionReport(matchDetails, homeSubTracker, awaySubTracker)
//                                             → { home: {}, away: {} }
//   rateSubstitution(sub, matchEvents)        → number (1-10)
//   buildPlayerJson({ id, name, position, engineSkills, subAttrs }, originPOS, options)
//                                             → engine-ready player object
//   buildTeamJson(teamName, playerList, tactics) → engine-ready team object
//   buildPlayerJsonList(players, tactics)      → engine-ready player array
//   buildMatchTactics(squad, uiTactics)        → { formation, strategy, mentality, roles }
//   injectTacticsIntoTeam(team, tactics, pitchSize) → team (mutated)
//   validateTacticsCompatibility(tactics)      → { isValid, warnings[] }
//   getActiveTeamStrategy(matchDetails, side)  → strategy object
//   DEFAULT_PITCH                             → { pitchWidth, pitchHeight, goalWidth }
//   getMatchSummary(matchDetails)             → { homeGoals, awayGoals, … }
//   getIterationCount(matchDetails)           → number
//   isMatchFinished(matchDetails)             → boolean (both halves done)
//   destroyMatch()                            → restore console.log

import * as Engine from 'footballsimulationengine';
import { computeOriginPOSForStarters, getDefaultFormation } from './engine/lib/formation.js';
import { getDefaultRole, STYLE_PRESETS, applyTeamStrategy, validateRoleForPosition } from './engine/lib/tactics.js';
import { createMatchStatsTracker, recordMatchEvent, calculateDerivedStats, calculateTeamDerivedStats, extractMatchTimeline, getTeamPassAccuracy, getTeamTackleRate } from './engine/lib/matchStats.js';

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

// Engine-compatible starting positions matching the sample initiated_team.json.
// Supports all 12 positions: GK, CB, LB, RB, CDM, CM, CAM, LM, RM, LW, RW, ST
const POSITION_PLACES = {
  GK:  [340, 0],
  LB:  [80,  80],
  CB:  [230, 80],   // alternates with 420 for second CB
  RB:  [600, 80],
  CDM: [230, 170],  // deeper than CM, between CB and CM
  LM:  [80,  270],
  CM:  [230, 270],  // alternates with 420 for second CM
  RM:  [600, 270],
  CAM: [340, 370],  // more advanced than CM, behind the striker
  LW:  [180, 420],  // wider advanced position
  RW:  [500, 420],  // wider advanced position
  ST:  [280, 500],  // alternates with 440 for second ST
};

/** Alternating x-offset for paired positions (two CBs, two CMs, two STs, two CDMs). */
const PAIRED_OFFSET_X = {
  CB:  190,  // 230 → 420
  CM:  190,  // 230 → 420
  CDM: 190,  // 230 → 420
  ST:  160,  // 280 → 440
};

// Track pairing counter so two CBs / two CMs / two CDMs / two STs split left/right
const _pairCount = {};

function _placementFor(p) {
  const pos = p.position || 'CM';
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
  _pairCount.CDM = 0;
  _pairCount.ST  = 0;
}

/**
 * Build a single engine-compatible Player JSON from our internal player shape.
 *
 * @param {object} p — { id, name, position, engineSkills, subAttrs, height }
 * @param {number[]} [originPOS] — optional formation-based [x, y] override
 * @param {object} [options] — { isSubstitute, subbedOnMinute, replacedPlayerID,
 *   effectivePosition, familiarityModifier }
 * @returns {object} engine-ready player
 */
export function buildPlayerJson(p, originPOS, options) {
  const skills = p.engineSkills || {};
  const [px, py] = originPOS || _placementFor(p);
  return {
    name: p.name || p.id,
    playerID: p.playerID || p.id,
    position: p.position || 'CM',
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
    originPOS: [px, py],
    fitness: skills.fitness ?? 100,
    height: p.height ?? 180,
    injured: p.injured ?? false,
    // Substitution metadata
    isSubstitute: options?.isSubstitute || false,
    subbedOnMinute: options?.subbedOnMinute || null,
    replacedPlayerID: options?.replacedPlayerID || null,
    effectivePosition: options?.effectivePosition || p.position || 'CM',
    familiarityModifier: options?.familiarityModifier ?? 1.0,
  };
}

/**
 * Batch-convert a list of our internal players into engine-ready JSON.
 * Convenience factory for squad generation.  Resets pairing counters first
 * so CB/CM/ST pairs are split left/right correctly.
 *
 * When `tactics.formation` is provided, uses computeOriginPOSForStarters()
 * from formation.js instead of the legacy POSITION_PLACES lookup.
 *
 * @param {Array} players — array of objects with buildPlayerJson's shape
 * @param {object} [tactics] — { formation, strategy }
 * @returns {Array}
 */
export function buildPlayerJsonList(players, tactics) {
  const formation = tactics?.formation || getDefaultFormation();
  const pitchSize = tactics?.pitchSize;
  const strategy = tactics?.strategy;

  // Use formation-based placement when available
  const originPOSList = computeOriginPOSForStarters(players, formation, pitchSize, strategy);

  return players.map((p, i) => {
    const originPOS = originPOSList[i];
    // Inject default role if not already set
    if (!p.role) {
      p.role = getDefaultRole(p.position || 'CM');
    }
    return buildPlayerJson(p, originPOS);
  });
}

/**
 * Convert a list of players into the engine's Team JSON.
 *
 * @param {string} teamName
 * @param {Array} players — array of objects with buildPlayerJson's shape
 * @param {object} [tactics] — { formation, strategy, pitchSize }
 * @returns {object}
 */
export function buildTeamJson(teamName, players, tactics) {
  const formation = tactics?.formation || getDefaultFormation();
  const pitchSize = tactics?.pitchSize;
  const strategy = tactics?.strategy;

  // Use formation-based placement when available
  const originPOSList = computeOriginPOSForStarters(players, formation, pitchSize, strategy);

  const enginePlayers = players.map((p, i) => {
    const originPOS = originPOSList[i];
    // Inject default role if not already set
    if (!p.role) {
      p.role = getDefaultRole(p.position || 'CM');
    }
    return buildPlayerJson(p, originPOS);
  });

  return {
    name: teamName,
    players: enginePlayers,
    manager: 'CPU',
    _formation: formation,
    _roles: Object.fromEntries(enginePlayers.map((ep, i) => [ep.playerID || i, players[i]?.role || getDefaultRole(players[i]?.position || 'CM')])),
  };
}

// ---------------------------------------------------------------------------
// Tactics glue layer (P4.7) — connect UI → matchEngine → engine modules
// ---------------------------------------------------------------------------

/**
 * Build the complete tactics configuration for a match.
 * Merges UI-selected tactics with squad defaults.
 *
 * @param {object} squad — { starters, formation }
 * @param {object} uiTactics — user-selected { formation, style, mentality, roles, pitchSize }
 * @returns {object} — { formation, strategy, mentality, roles, pitchSize }
 */
export function buildMatchTactics(squad, uiTactics) {
  const formation = uiTactics?.formation || squad?.formation || getDefaultFormation();
  const style = uiTactics?.style || uiTactics?.strategy || 'balanced';
  const mentality = uiTactics?.mentality || 'balanced';

  // Resolve strategy — can be a preset key or raw strategy object
  const strategy = typeof style === 'string'
    ? (STYLE_PRESETS[style] || STYLE_PRESETS.balanced)
    : { ...STYLE_PRESETS.balanced, ...style };

  // Resolve roles — fill in defaults for positions without explicit role
  const roles = {};
  const starters = squad?.starters || squad?.players?.slice(0, 11) || [];
  for (const player of starters) {
    const playerId = player.playerID || player.id;
    const uiRole = uiTactics?.roles?.[playerId];
    // Validate that the UI-supplied role is compatible with the player's position
    if (uiRole && validateRoleForPosition(uiRole, player.position)) {
      roles[playerId] = uiRole;
    } else {
      roles[playerId] = getDefaultRole(player.position);
    }
  }

  return {
    formation,
    strategy,
    mentality,
    roles,
    pitchSize: uiTactics?.pitchSize || null,
  };
}

/**
 * Inject tactics into a team object — attach strategy parameters and
 * assign player roles. Mutates the team in place and returns it.
 *
 * @param {object} team — engine-ready team { name, players, ... }
 * @param {object} tactics — from buildMatchTactics()
 * @param {object} [pitchSize] — optional pitch dimensions
 * @returns {object} same team (mutated)
 */
export function injectTacticsIntoTeam(team, tactics, pitchSize) {
  if (!team || !tactics) return team;

  // Store strategy on team object (mutates team, attaching _strategy, _tempoMultiplier, etc.)
  applyTeamStrategy(team, tactics.strategy, pitchSize);

  // Assign roles to each player
  const players = team.players || [];
  for (const player of players) {
    const playerId = player.playerID || player.id;
    player.role = tactics.roles?.[playerId] || getDefaultRole(player.position);
    // traits should already be on the player from squadGen; ensure array
    if (!player.traits) player.traits = [];
  }

  // Store roles map on team for substitution inheritance
  team._roles = tactics.roles || {};

  return team;
}

/**
 * Validate tactical combinations and return warnings for incompatible setups.
 *
 * @param {object} tactics — from buildMatchTactics()
 * @returns {{ isValid: boolean, warnings: string[] }}
 */
export function validateTacticsCompatibility(tactics) {
  const warnings = [];
  const { formation, strategy } = tactics;
  if (!strategy) return { isValid: true, warnings: [] };

  // Contradictory: high press + deep line
  if (strategy.pressingIntensity === 'much_more' && strategy.defensiveLine === 'deep') {
    warnings.push('高位压迫与深防线矛盾——压迫在对方半场进行但防线站位靠后');
  }

  // Contradictory: slow tempo + very direct passing
  if (strategy.tempo === 'very_slow' && strategy.passingDirectness === 'very_direct') {
    warnings.push('慢节奏与长传冲吊不匹配');
  }
  if (strategy.tempo === 'slow' && strategy.passingDirectness === 'very_direct') {
    warnings.push('慢节奏与长传冲吊可能不协调');
  }

  // Contradictory: narrow width + winger-dependent formation
  if (strategy.width === 'narrow' && ['4-2-4', '4-3-3', '3-4-3'].includes(formation)) {
    warnings.push('窄宽度策略与边路阵型不匹配——边路球员效率降低');
  }

  // Contradictory: wide width + narrow formation
  if (strategy.width === 'wide' && ['4-3-1-2', '4-3-2-1'].includes(formation)) {
    warnings.push('宽宽度策略但阵型缺乏边路人员');
  }

  return { isValid: warnings.length === 0, warnings };
}

/**
 * Get the active strategy for a team in the current match.
 * Convenience accessor used by actions.js and playerMovement.js
 * when they need to read strategy parameters.
 *
 * @param {object} matchDetails — current match state
 * @param {'home'|'away'} side — which side
 * @returns {object|null} strategy object
 */
export function getActiveTeamStrategy(matchDetails, side) {
  if (!matchDetails) return null;
  const key = side === 'home' ? '_homeStrategy' : '_awayStrategy';
  return matchDetails[key] || null;
}

// ---------------------------------------------------------------------------
// Core API wrappers
// ---------------------------------------------------------------------------

// Mentality → engine intent mapping
// The engine's team.intent controls AI aggression level
const MENTALITY_INTENT = {
  ultra_attack: 'attack',
  attack:       'attack',
  balanced:     'balanced',
  defend:       'defend',
  ultra_defend: 'defend',
};

/**
 * Apply mentality modifiers to a team's players before match creation.
 * Higher mentality → boosted offensive skills, lowered defensive skills.
 * Lower mentality → boosted defensive skills, lowered offensive skills.
 *
 * @param {object} team — engine-ready team object
 * @param {string} mentalityKey — one of MENTALITY_INTENT keys
 * @returns {object} modified team (shallow clone)
 */
export function applyMentalityToTeam(team, mentalityKey) {
  if (!team || !mentalityKey) return team;
  const intentVal = MENTALITY_INTENT[mentalityKey] || 'balanced';

  // Set team-level intent
  const modified = { ...team, intent: intentVal, _mentality: mentalityKey };

  // Boost/scaledown per-player skills based on mentality
  // ultra_attack: +15% shooting/passing, -10% tackling
  // attack: +8% shooting/passing, -5% tackling
  // defend: -8% shooting/passing, +10% tackling
  // ultra_defend: -15% shooting/passing, +20% tackling
  const offensiveSkills = ['shooting', 'passing', 'control'];
  const defensiveSkills = ['tackling', 'strength', 'perception'];

  let offMod = 1.0, defMod = 1.0;
  switch (mentalityKey) {
    case 'ultra_attack':  offMod = 1.15; defMod = 0.90; break;
    case 'attack':        offMod = 1.08; defMod = 0.95; break;
    case 'defend':        offMod = 0.92; defMod = 1.10; break;
    case 'ultra_defend':  offMod = 0.85; defMod = 1.20; break;
    default: break;
  }

  const players = team.players.map((p) => {
    const skill = { ...p.skill };
    for (const key of offensiveSkills) {
      if (skill[key] != null) {
        skill[key] = String(Math.min(100, Math.round(Number(skill[key]) * offMod)));
      }
    }
    for (const key of defensiveSkills) {
      if (skill[key] != null) {
        skill[key] = String(Math.min(100, Math.round(Number(skill[key]) * defMod)));
      }
    }
    return { ...p, skill };
  });

  modified.players = players;
  return modified;
}

/**
 * Initialise a match between two teams.
 *
 * @param {object} homeTeam — from buildTeamJson()
 * @param {object} awayTeam — from buildTeamJson()
 * @param {object} [pitch] — { pitchWidth, pitchHeight, goalWidth }
 * @param {object} [tactics] — {
 *   homeMentality, awayMentality,
 *   home: { formation, style, strategy, roles, mentality },
 *   away: { formation, style, strategy, roles, mentality }
 * } (optional)
 * @returns {Promise<object>} matchDetails
 */
export async function createMatch(homeTeam, awayTeam, pitch, tactics) {
  _suppressLog();
  const p = pitch || DEFAULT_PITCH;

  // Build complete tactics from UI selections + defaults
  const homeTactics = tactics?.home
    ? buildMatchTactics({ formation: homeTeam._formation }, tactics.home)
    : buildMatchTactics({ formation: homeTeam._formation }, {});
  const awayTactics = tactics?.away
    ? buildMatchTactics({ formation: awayTeam._formation }, tactics.away)
    : buildMatchTactics({ formation: awayTeam._formation }, {});

  // Override style strategy from direct props (backward compat)
  if (tactics?.homeStrategy) homeTactics.strategy = tactics.homeStrategy;
  if (tactics?.awayStrategy) awayTactics.strategy = tactics.awayStrategy;
  if (tactics?.homeFormation) homeTactics.formation = tactics.homeFormation;
  if (tactics?.awayFormation) awayTactics.formation = tactics.awayFormation;
  if (tactics?.homeMentality) homeTactics.mentality = tactics.homeMentality;
  if (tactics?.awayMentality) awayTactics.mentality = tactics.awayMentality;
  if (tactics?.homeStyle) homeTactics.strategy = STYLE_PRESETS[tactics.homeStyle] || homeTactics.strategy;
  if (tactics?.awayStyle) awayTactics.strategy = STYLE_PRESETS[tactics.awayStyle] || awayTactics.strategy;

  // Inject tactics into teams (strategy params + player roles)
  injectTacticsIntoTeam(homeTeam, homeTactics, p);
  injectTacticsIntoTeam(awayTeam, awayTactics, p);

  // Apply mentality modifiers before feeding into the engine
  const ht = tactics?.homeMentality
    ? applyMentalityToTeam(homeTeam, tactics.homeMentality)
    : homeTeam;
  const at = tactics?.awayMentality
    ? applyMentalityToTeam(awayTeam, tactics.awayMentality)
    : awayTeam;

  const md = await Engine.initiateGame(ht, at, p);

  // The engine randomly assigns "kickOffTeam" and "secondTeam".
  // Normalise: tag each team with a stable side key so our UI knows
  // which is home/away regardless of the engine's internal naming.
  md._homeTeamName = homeTeam.name;
  md._awayTeamName = awayTeam.name;

  // --- Formation metadata ---
  md._homeFormation = homeTactics.formation;
  md._awayFormation = awayTactics.formation;

  // --- Mentality / Strategy metadata ---
  md._homeMentality = homeTactics.mentality;
  md._awayMentality = awayTactics.mentality;
  md._homeStrategy = homeTactics.strategy;
  md._awayStrategy = awayTactics.strategy;

  // --- Style presets ---
  md._homeStyle = tactics?.homeStyle || null;
  md._awayStyle = tactics?.awayStyle || null;

  // --- Player roles (keyed by playerID) ---
  md._homeRoles = homeTactics.roles;
  md._awayRoles = awayTactics.roles;

  // --- Run compatibility check (log warnings, don't block) ---
  const homeCompat = validateTacticsCompatibility({ formation: homeTactics.formation, strategy: homeTactics.strategy });
  const awayCompat = validateTacticsCompatibility({ formation: awayTactics.formation, strategy: awayTactics.strategy });
  if (!homeCompat.isValid || !awayCompat.isValid) {
    const allWarnings = [...homeCompat.warnings, ...awayCompat.warnings];
    console.warn('[MatchEngine] Tactics compatibility warnings:', allWarnings.join('; '));
  }

  // --- Stats tracker (Phase 5.2) ---
  md._statsTracker = createMatchStatsTracker();

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

// ---------------------------------------------------------------------------
// Substitution System (P3.1 / P3.2 / P3.5)
// ---------------------------------------------------------------------------

import { resolveSubstitutionPosition, applyFamiliarityPenalty } from './engine/lib/positionGroup.js';

// Internal: resolve which engine team key corresponds to a given side
function _getTeamKey(matchDetails, side) {
  if (!matchDetails) return null;
  const kickIsHome = matchDetails.kickOffTeam?.name === matchDetails._homeTeamName;
  if (side === 'home') {
    return kickIsHome ? 'kickOffTeam' : 'secondTeam';
  }
  return kickIsHome ? 'secondTeam' : 'kickOffTeam';
}

/**
 * Create a fresh substitution tracker for a team.
 * Tracks windows used, players used, and substitution history.
 *
 * @returns {object} subTracker
 */
export function createSubstitutionTracker() {
  return {
    windowsUsed: 0,          // substitution windows used (max 3 per FIFA rules)
    maxWindows: 3,
    playersUsed: 0,          // players substituted on (max 5)
    maxPlayers: 5,
    substitutions: [],       // [{ minute, playerOutID, playerInID, playerOutName, playerInName, window }]
    subbedOutPlayerIDs: new Set(),
  };
}

/**
 * Determine whether a new substitution window should be opened.
 * Consecutive subs within a short interval share the same window.
 * Half-time does NOT count as a window.
 *
 * @param {object} subTracker
 * @param {number} minute
 * @returns {boolean}
 */
export function isNewSubWindow(subTracker, minute) {
  if (subTracker.substitutions.length === 0) return true;
  const lastSubMinute = subTracker.substitutions[subTracker.substitutions.length - 1].minute;
  // If more than 5 minutes since last sub, it's a new window
  return (minute - lastSubMinute) > 5;
}

/**
 * FM-style substitution with position familiarity and substitution rules.
 *
 * Rules:
 *   - Max 5 players per match (FIFA 2023+)
 *   - Max 3 substitution windows (half-time excluded)
 *   - Subs inherit the outgoing player's originPOS
 *   - Sent-off players cannot be replaced
 *   - Position mismatch applies familiarity penalty
 *
 * @param {object} matchDetails — current match state
 * @param {'home'|'away'} side — which team
 * @param {string} playerOutID — ID of player to replace
 * @param {object} playerIn — squad player object for the substitute
 * @param {object} subTracker — from createSubstitutionTracker()
 * @param {number} minute — current match minute
 * @returns {{ matchDetails: object, subTracker: object, success: boolean, error?: string }}
 */
export function applySubstitutionV2(matchDetails, side, playerOutID, playerIn, subTracker, minute) {
  if (!matchDetails || !playerOutID || !playerIn || !subTracker) {
    return { matchDetails, subTracker, success: false, error: 'INVALID_PARAMS' };
  }

  // 1. Check substitution limits
  if (subTracker.playersUsed >= subTracker.maxPlayers) {
    return { matchDetails, subTracker, success: false, error: 'MAX_SUBS_REACHED' };
  }

  // 2. Find the outgoing player
  const teamKey = _getTeamKey(matchDetails, side);
  if (!teamKey) {
    return { matchDetails, subTracker, success: false, error: 'TEAM_NOT_FOUND' };
  }

  const team = matchDetails[teamKey];
  if (!team?.players) {
    return { matchDetails, subTracker, success: false, error: 'TEAM_NOT_FOUND' };
  }

  const outIdx = team.players.findIndex((p) => p.playerID === playerOutID);
  if (outIdx === -1) {
    return { matchDetails, subTracker, success: false, error: 'PLAYER_NOT_FOUND' };
  }

  const outPlayer = team.players[outIdx];

  // 3. Validate: sent-off players cannot be replaced
  if (Array.isArray(outPlayer.currentPOS) && outPlayer.currentPOS[0] === 'NP') {
    return { matchDetails, subTracker, success: false, error: 'PLAYER_SENT_OFF' };
  }

  // 4. Window logic — open new window if needed
  const newWindow = isNewSubWindow(subTracker, minute);
  if (newWindow && subTracker.windowsUsed >= subTracker.maxWindows) {
    return { matchDetails, subTracker, success: false, error: 'MAX_WINDOWS_REACHED' };
  }

  // 5. Resolve position familiarity
  const formation = getFormationForMatch(matchDetails, side);
  const { effectivePosition, familiarityModifier } = resolveSubstitutionPosition(
    playerIn, outPlayer, formation
  );
  const adjustedPlayer = applyFamiliarityPenalty(playerIn, familiarityModifier);

  // 6. originPOS inheritance
  const inheritedOriginPOS = Array.isArray(outPlayer.originPOS)
    ? [...outPlayer.originPOS]
    : null;

  const subPlayer = buildPlayerJson(adjustedPlayer, inheritedOriginPOS, {
    isSubstitute: true,
    subbedOnMinute: minute,
    replacedPlayerID: playerOutID,
    effectivePosition,
    familiarityModifier,
  });

  // 7. Copy currentPOS so the sub appears at the right spot
  if (Array.isArray(outPlayer.currentPOS)) {
    subPlayer.currentPOS = [...outPlayer.currentPOS];
  }

  // 8. Swap player in the team array
  team.players[outIdx] = subPlayer;

  // 9. Track substitution
  subTracker.playersUsed++;
  if (newWindow) subTracker.windowsUsed++;
  subTracker.subbedOutPlayerIDs.add(playerOutID);
  subTracker.substitutions.push({
    minute,
    playerOutID,
    playerOutName: outPlayer.name || playerOutID,
    playerInID: playerIn.playerID || playerIn.id,
    playerInName: playerIn.name || playerIn.id,
    window: subTracker.windowsUsed,
    effectivePosition,
    familiarityModifier,
  });

  // 10. Log
  if (matchDetails.iterationLog) {
    const famLabel = familiarityModifier >= 1.0 ? 'natural' :
      familiarityModifier >= 0.85 ? 'accomplished' :
      familiarityModifier >= 0.70 ? 'competent' : 'awkward';
    matchDetails.iterationLog.push(
      `SUB: ${playerIn.name || playerIn.id} (${playerIn.position}) replaces ${outPlayer.name} (${outPlayer.position}) at ${minute}' [${famLabel}] — ${subTracker.playersUsed}/${subTracker.maxPlayers} subs, window ${subTracker.windowsUsed}/${subTracker.maxWindows}`
    );
  }

  return { matchDetails, subTracker, success: true };
}

/**
 * Apply formation change together with one or more substitutions in a single
 * atomic operation. Mirrors FM's half-time tactical changes.
 *
 * @param {object} matchDetails
 * @param {'home'|'away'} side
 * @param {Array<{ playerOutID: string, playerIn: object }>} subs — 1-5 subs
 * @param {string} newFormation — formation key
 * @param {object} subTracker — substitution tracker
 * @param {number} minute — current match minute
 * @param {object} [pitchSize] — optional pitch dimensions
 * @returns {{ matchDetails: object, subTracker: object, success: boolean, error?: string }}
 */
export function applyFormationChangeWithSubs(
  matchDetails, side, subs, newFormation, subTracker, minute, pitchSize
) {
  if (!matchDetails || !subs || !subs.length || !newFormation || !subTracker) {
    return { matchDetails, subTracker, success: false, error: 'INVALID_PARAMS' };
  }

  // Check substitution limits
  if (subTracker.playersUsed + subs.length > subTracker.maxPlayers) {
    return { matchDetails, subTracker, success: false, error: 'MAX_SUBS_REACHED' };
  }

  // Check window limit
  if (subTracker.windowsUsed >= subTracker.maxWindows) {
    return { matchDetails, subTracker, success: false, error: 'MAX_WINDOWS_REACHED' };
  }

  const p = pitchSize || DEFAULT_PITCH;
  const teamKey = _getTeamKey(matchDetails, side);
  if (!teamKey) {
    return { matchDetails, subTracker, success: false, error: 'TEAM_NOT_FOUND' };
  }

  const team = matchDetails[teamKey];
  if (!team?.players) {
    return { matchDetails, subTracker, success: false, error: 'TEAM_NOT_FOUND' };
  }

  const formation = getFormationForMatch(matchDetails, side);

  // 1. Mark outgoing players for removal
  const outIDs = new Set(subs.map((s) => s.playerOutID));

  // 2. Collect remaining active players + incoming subs for originPOS calculation
  const remainingActive = team.players.filter(
    (pl) => !outIDs.has(pl.playerID) &&
      !(Array.isArray(pl.currentPOS) && pl.currentPOS[0] === 'NP')
  );

  const finalPositions = [
    ...remainingActive.map((pl) => ({ position: pl.position || 'CM' })),
    ...subs.map((s) => ({ position: s.playerIn.position || 'CM' })),
  ];

  const newOriginPOS = computeOriginPOSForStarters(finalPositions, newFormation, p);

  // 3. Assign originPOS: remaining players first
  let posIdx = 0;
  for (const player of team.players) {
    if (outIDs.has(player.playerID)) continue; // will be replaced
    if (Array.isArray(player.currentPOS) && player.currentPOS[0] === 'NP') continue;

    if (posIdx < remainingActive.length) {
      player.originPOS = newOriginPOS[posIdx];
      player.intentPOS = [...newOriginPOS[posIdx]];
    }
    posIdx++;
  }

  // 4. Build and insert substitutes with assigned positions
  posIdx = remainingActive.length;
  for (const sub of subs) {
    const outIdx = team.players.findIndex((pl) => pl.playerID === sub.playerOutID);
    if (outIdx === -1) continue;

    const outPlayer = team.players[outIdx];
    if (Array.isArray(outPlayer.currentPOS) && outPlayer.currentPOS[0] === 'NP') continue;

    // Resolve position familiarity
    const { effectivePosition, familiarityModifier } = resolveSubstitutionPosition(
      sub.playerIn, outPlayer, newFormation
    );
    const adjustedPlayer = applyFamiliarityPenalty(sub.playerIn, familiarityModifier);

    const pos = posIdx < newOriginPOS.length ? newOriginPOS[posIdx] : inheritedOriginPOS;
    const subPlayer = buildPlayerJson(adjustedPlayer, pos, {
      isSubstitute: true,
      subbedOnMinute: minute,
      replacedPlayerID: sub.playerOutID,
      effectivePosition,
      familiarityModifier,
    });

    // Place at the assigned formation spot
    subPlayer.currentPOS = [...pos];

    team.players[outIdx] = subPlayer;

    // Track
    subTracker.playersUsed++;
    subTracker.subbedOutPlayerIDs.add(sub.playerOutID);
    subTracker.substitutions.push({
      minute,
      playerOutID: sub.playerOutID,
      playerOutName: outPlayer.name || sub.playerOutID,
      playerInID: sub.playerIn.playerID || sub.playerIn.id,
      playerInName: sub.playerIn.name || sub.playerIn.id,
      window: subTracker.windowsUsed + 1,
      effectivePosition,
      familiarityModifier,
    });

    posIdx++;
  }

  // 5. This entire operation consumes 1 substitution window
  subTracker.windowsUsed++;

  // 6. Update formation tag
  if (side === 'home') {
    matchDetails._homeFormation = newFormation;
  } else {
    matchDetails._awayFormation = newFormation;
  }

  // 7. Log
  if (matchDetails.iterationLog) {
    const names = subs.map(
      (s) => `${s.playerIn.name || s.playerIn.id} → ${s.playerOutID}`
    ).join(', ');
    matchDetails.iterationLog.push(
      `TACTICAL: ${team.name} switch to ${newFormation} with ${subs.length} subs at ${minute}' (${names})`
    );
  }

  return { matchDetails, subTracker, success: true };
}

// ---------------------------------------------------------------------------
// Substitution reporting (P3.5)
// ---------------------------------------------------------------------------

/**
 * Extract per-player stats for a specific player from match details.
 *
 * @param {object} matchDetails
 * @param {string} playerID
 * @returns {object|null}
 */
export function extractPlayerMatchStats(matchDetails, playerID) {
  if (!matchDetails || !playerID) return null;

  const allPlayers = [
    ...(matchDetails.kickOffTeam?.players || []),
    ...(matchDetails.secondTeam?.players || []),
  ];

  const player = allPlayers.find((p) => p.playerID === playerID);
  if (!player) return null;

  return {
    name: player.name,
    position: player.position,
    goals: player.stats?.goals || 0,
    shots: player.stats?.shots || { total: 0, on: 0, off: 0 },
    passes: player.stats?.passes || { total: 0, on: 0, off: 0 },
    tackles: player.stats?.tackles || { total: 0, on: 0, off: 0, fouls: 0 },
    cards: player.stats?.cards || { yellow: 0, red: 0 },
    saves: player.stats?.saves || 0,
    isSubstitute: player.isSubstitute || false,
    subbedOnMinute: player.subbedOnMinute || null,
  };
}

/**
 * Build a substitution report for one team from the substitution tracker.
 *
 * @param {object} matchDetails
 * @param {'home'|'away'} side
 * @param {object} subTracker — from createSubstitutionTracker()
 * @returns {object}
 */
export function buildTeamSubReport(matchDetails, side, subTracker) {
  if (!subTracker) {
    return { totalSubs: 0, windowsUsed: 0, subs: [], remainedUnused: 5 };
  }

  const subs = subTracker.substitutions.map((sub) => ({
    minute: sub.minute,
    playerOut: sub.playerOutName,
    playerIn: sub.playerInName,
    window: sub.window,
    effectivePosition: sub.effectivePosition,
    familiarityModifier: sub.familiarityModifier,
    playerInStats: extractPlayerMatchStats(matchDetails, sub.playerInID),
  }));

  return {
    totalSubs: subTracker.playersUsed,
    windowsUsed: subTracker.windowsUsed,
    subs,
    remainedUnused: subTracker.maxPlayers - subTracker.playersUsed,
  };
}

/**
 * Generate a full substitution report covering both teams.
 *
 * @param {object} matchDetails
 * @param {object} homeSubTracker
 * @param {object} awaySubTracker
 * @returns {{ home: object, away: object }}
 */
export function extractSubstitutionReport(matchDetails, homeSubTracker, awaySubTracker) {
  return {
    home: buildTeamSubReport(matchDetails, 'home', homeSubTracker),
    away: buildTeamSubReport(matchDetails, 'away', awaySubTracker),
  };
}

/**
 * Rate a substitution decision for post-match analysis.
 *
 * Scoring factors:
 *   - Baseline: 5.0
 *   - Earlier subs (< 60') score higher (+1)
 *   - Tactical response (sub after conceding): +0.5
 *   - Sub contributed a goal/assist: +2.0 each
 *   - Goal conceded within 5 min of sub: -1.5
 *   - Good positional fit (familiarity >= 0.9): +0.5
 *
 * @param {object} sub — entry from subTracker.substitutions
 * @param {Array} matchEvents — parsed events from parseIterationEvents()
 * @returns {number} rating from 1.0 to 10.0
 */
export function rateSubstitution(sub, matchEvents) {
  if (!sub) return 5.0;
  let score = 5.0;

  // Earlier subs score higher
  if (sub.minute < 46) score += 1.5;
  else if (sub.minute < 60) score += 1.0;
  else if (sub.minute < 75) score += 0.5;
  else if (sub.minute < 85) score += 0.2;

  // Good positional fit
  if ((sub.familiarityModifier || 1.0) >= 0.90) score += 0.5;
  else if ((sub.familiarityModifier || 1.0) < 0.60) score -= 0.8;

  if (!matchEvents || matchEvents.length === 0) {
    return Math.min(10, Math.max(1, Math.round(score * 10) / 10));
  }

  // Sub made after conceding a goal → tactical response
  const goalsConcededBefore = matchEvents.filter(
    (e) => e.type === 'goal' &&
      e.half === sub.half &&
      e.halfIter < sub.halfIter
  ).length;
  if (goalsConcededBefore > 0) score += 0.5;

  // Sub contributed a goal or assist
  const postSubGoals = matchEvents.filter(
    (e) => e.type === 'goal' &&
      (e.scorer === sub.playerInID || e.assist === sub.playerInID ||
       (e.text && e.text.includes(sub.playerInName)))
  ).length;
  score += postSubGoals * 2.0;

  // Goal conceded soon after sub → tactical error
  const goalConcededSoon = matchEvents.filter(
    (e) => e.type === 'goal' &&
      e.half === sub.half &&
      e.halfIter > sub.halfIter &&
      e.halfIter < sub.halfIter + 15 // ~5 minute window in iteration terms
  ).length;
  score -= goalConcededSoon * 1.5;

  return Math.min(10, Math.max(1, Math.round(score * 10) / 10));
}

/**
 * Get the formation currently used by a side in this match.
 *
 * @param {object} matchDetails
 * @param {'home'|'away'} side
 * @returns {string} formation key (e.g. '4-3-3')
 */
export function getFormationForMatch(matchDetails, side) {
  if (!matchDetails) return getDefaultFormation();
  return side === 'home'
    ? matchDetails._homeFormation || getDefaultFormation()
    : matchDetails._awayFormation || getDefaultFormation();
}

/**
 * Apply a formation change during a match (between iterations).
 * Updates all players' originPOS and intentPOS to match the new formation.
 * Sent-off players (currentPOS === ['NP','NP']) are excluded.
 *
 * @param {object} matchDetails — current match state
 * @param {'home'|'away'} side — which team is changing formation
 * @param {string} newFormation — formation key (e.g. '4-3-3')
 * @param {object} [pitchSize] — optional, defaults to DEFAULT_PITCH
 * @returns {object} updated matchDetails
 */
export function applyFormationChange(matchDetails, side, newFormation, pitchSize) {
  if (!matchDetails || !newFormation) return matchDetails;

  const p = pitchSize || DEFAULT_PITCH;

  // Determine which team key in the engine's structure corresponds to this side
  const kickIsHome = matchDetails.kickOffTeam?.name === matchDetails._homeTeamName;
  const teamKey = (side === 'home')
    ? (kickIsHome ? 'kickOffTeam' : 'secondTeam')
    : (kickIsHome ? 'secondTeam' : 'kickOffTeam');

  const team = matchDetails[teamKey];
  if (!team) return matchDetails;

  // Filter to active (not sent-off) players for formation assignment
  const activePlayers = team.players.filter(
    (pl) => !(Array.isArray(pl.currentPOS) && pl.currentPOS[0] === 'NP')
  );

  if (activePlayers.length === 0) return matchDetails;

  // Compute new originPOS from the formation
  const formationPos = computeOriginPOSForStarters(
    activePlayers.map((pl) => ({ position: pl.position || 'CM' })),
    newFormation,
    p
  );

  // Apply new originPOS and reset intentPOS to each active player
  let posIdx = 0;
  for (const player of team.players) {
    if (Array.isArray(player.currentPOS) && player.currentPOS[0] === 'NP') continue;

    if (posIdx < formationPos.length) {
      player.originPOS = formationPos[posIdx];
      // Reset intentPOS to new originPOS — player will gradually pull toward it
      player.intentPOS = [...formationPos[posIdx]];
    }
    posIdx++;
  }

  // Store the updated formation on matchDetails
  if (side === 'home') {
    matchDetails._homeFormation = newFormation;
  } else {
    matchDetails._awayFormation = newFormation;
  }

  // Log the change
  if (matchDetails.iterationLog) {
    matchDetails.iterationLog.push(
      `Formation change: ${team.name} switches to ${newFormation}`
    );
  }

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

// ===========================================================================
// MATCH REPORT (Phase 5.2 + 5.3 foundation)
// ===========================================================================

/**
 * Build the complete match report from all tracked data.
 * Called after the match ends to produce structured output for UI display.
 *
 * @param {object} matchDetails — final match state
 * @returns {object|null} structured report or null if no tracker
 */
export function buildMatchReport(matchDetails) {
  const tracker = matchDetails?._statsTracker;
  if (!tracker) return null;

  // Derive team-level stats
  const homeTeamStats = calculateTeamDerivedStats(tracker.home);
  const awayTeamStats = calculateTeamDerivedStats(tracker.away);

  // Calculate pass accuracy for possession estimate
  const homePasses = homeTeamStats.totalPasses || 0;
  const awayPasses = awayTeamStats.totalPasses || 0;
  const totalPasses = homePasses + awayPasses;
  const homePossession = totalPasses > 0
    ? Math.round(homePasses / totalPasses * 100)
    : 50;

  // Update team stats with derived values
  tracker.teamStats.home.possession = homePossession;
  tracker.teamStats.away.possession = 100 - homePossession;

  // Build player-level derived stats for both teams
  const homePlayerStats = {};
  for (const [pid, stats] of Object.entries(tracker.home.players)) {
    homePlayerStats[pid] = calculateDerivedStats(stats);
  }
  const awayPlayerStats = {};
  for (const [pid, stats] of Object.entries(tracker.away.players)) {
    awayPlayerStats[pid] = calculateDerivedStats(stats);
  }

  // Extract match timeline
  const timeline = extractMatchTimeline(tracker);

  // Build substitution report
  const subReport = extractSubstitutionReport(
    matchDetails,
    matchDetails._subTrackerHome,
    matchDetails._subTrackerAway
  );

  return {
    teamStats: tracker.teamStats,
    playerStats: { home: homePlayerStats, away: awayPlayerStats },
    matchEvents: timeline,
    substitutionReport: subReport,
    formations: {
      home: matchDetails._homeFormation,
      away: matchDetails._awayFormation,
    },
    strategies: {
      home: matchDetails._homeStrategy,
      away: matchDetails._awayStrategy,
    },
    roles: {
      home: matchDetails._homeRoles || {},
      away: matchDetails._awayRoles || {},
    },
    scoreline: {
      homeGoals: matchDetails.goals || 0,
      awayGoals: matchDetails.awayGoals || 0,
    },
  };
}

/**
 * Record an action as a tracked match event.
 * Thin wrapper around recordMatchEvent that resolves player side.
 *
 * @param {object} matchDetails
 * @param {string} playerID
 * @param {string} eventType — e.g. 'shoot', 'tackle', 'pass'
 * @param {object} [detail] — additional event data
 * @param {number} [iteration] — current iteration
 */
export function trackMatchAction(matchDetails, playerID, eventType, detail = {}, iteration = 0) {
  const tracker = matchDetails?._statsTracker;
  if (!tracker) return;

  // Determine side: check which team the player belongs to
  let side = null;
  const homePlayers = matchDetails.kickOffTeam?.players || [];
  const awayPlayers = matchDetails.secondTeam?.players || [];
  if (homePlayers.some((p) => p.playerID === playerID)) side = 'home';
  else if (awayPlayers.some((p) => p.playerID === playerID)) side = 'away';
  if (!side) return;

  recordMatchEvent(tracker, side, playerID, eventType, detail, iteration);
}

// Export stats tracker helpers for use by other modules
export {
  createMatchStatsTracker,
  recordMatchEvent,
  calculateDerivedStats,
  calculateTeamDerivedStats,
  extractMatchTimeline,
  getTeamPassAccuracy,
  getTeamTackleRate,
};

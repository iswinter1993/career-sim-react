// Facade wrapper around the in-repo match engine fork (src/engine/engine.js).
//
// The engine is the vendored ESM fork of `footballsimulationengine` v5.0.0
// (originally CommonJS). This module presents a clean async API while
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

import * as Engine from './engine/engine.js';
import { computeOriginPOSForStarters, getDefaultFormation } from './engine/lib/formation.js';
import { getDefaultRole, STYLE_PRESETS, applyTeamStrategy, validateRoleForPosition } from './engine/lib/tactics.js';
import { getMentalityStrategy, OFFENSIVE_SKILLS, DEFENSIVE_SKILLS } from './engine/lib/mentality.js';
import { createMatchStatsTracker, recordMatchEvent, calculateDerivedStats, calculateTeamDerivedStats, extractMatchTimeline, getTeamPassAccuracy, getTeamTackleRate } from './engine/lib/matchStats.js';
import { parseMatchEvent, createMatchEventBus, emitLogEvents } from './matchEvents.js';
import { assemblePlayer } from './playerComponents.js';
import { bumpRevision, memoizeByRevision } from './dirtyMemo.js';
import { PITCH, ITERATIONS_PER_HALF, COMMENTARY_TEMPLATES } from './gameConfig.js';
import { captureMatchState, restoreMatchState, serializeMatchState, deserializeMatchState } from './matchMemento.js';

// Re-export for backward compatibility — the placement counters moved into
// playerComponents.js as part of Design Pattern #5 (Component).
export { resetPlacementCounters } from './playerComponents.js';

// ---------------------------------------------------------------------------
// Chinese commentary templates
// (moved to gameConfig.js — Design Pattern #9: Data-driven static config)
// ---------------------------------------------------------------------------

/**
 * Translate an engine log string to Chinese commentary text.
 * Returns the translated text, or the original if no template matches.
 */
function _translateCommentary(text, matchDetails) {
  const t = text;
  if (!t) return '';

  // We do NOT check for Chinese characters here — engine log strings are
  // always English even when they contain Chinese player/team names
  // (e.g. "Goal Scored by - 武文强 - (主队)"). We must translate anyway.

  const kickOff = matchDetails.kickOffTeam;
  const second = matchDetails.secondTeam;
  const kickIsHome = kickOff?.name === matchDetails._homeTeamName;

  // Determine which team performed the action (by player name OR team name)
  function _resolveTeam(entryText) {
    for (const p of (kickOff?.players || [])) {
      if (p.name && entryText.includes(p.name)) return kickIsHome ? '🏠 ' : '🏟 ';
    }
    for (const p of (second?.players || [])) {
      if (p.name && entryText.includes(p.name)) return kickIsHome ? '🏟 ' : '🏠 ';
    }
    // Fall back to team name match
    if (kickOff?.name && entryText.includes(kickOff.name)) return kickIsHome ? '🏠 ' : '🏟 ';
    if (second?.name && entryText.includes(second.name)) return kickIsHome ? '🏟 ' : '🏠 ';
    return '';
  }

  // Extract player name — look for names that exist in either team
  function _extractName(entryText) {
    const allPlayers = [...(kickOff?.players || []), ...(second?.players || [])];
    let best = null;
    for (const p of allPlayers) {
      if (p.name && entryText.includes(p.name)) {
        if (!best || p.name.length > best.length) best = p.name;
      }
    }
    return best;
  }

  
  // Extract team name from text (fallback: use resolve)
  function _getTeamName(entryText) {
    // Match "Team to kick off - TeamName" / "freekick to: TeamName [...]" / etc
    const m = entryText.match(/- (.+?)($|\[|:)/) || entryText.match(/to: (.+?)($|\[)/);
    if (m) return m[1].trim();
    // Check if text contains a known team name
    if (kickOff?.name && entryText.includes(kickOff.name)) return kickOff.name;
    if (second?.name && entryText.includes(second.name)) return second.name;
    return '';
  }

  const teamTag = _resolveTeam(t);
  const playerName = _extractName(t) || '';

  // Try each template pattern. Pass the full raw text so templates
  // can extract structured info (team name, coordinates, etc.).
  for (const [pattern, fn] of Object.entries(COMMENTARY_TEMPLATES)) {
    if (t.includes(pattern)) {
      try {
        const result = fn(t, teamTag, playerName);
        if (result) return result;
        // If template returned empty string (boilerplate suppression),
        // return empty so parseIterationEvents can filter it out.
        if (result === '') return '';
      } catch (_) { /* fall through */ }
      return t; // fallback: return raw text if template fails
    }
  }

  return t;
}

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

/**
 * Ensure the ball object has every property the engine's validateBall expects.
 * JSON.parse(JSON.stringify(…)) drops keys whose value is undefined, so when
 * the engine leaves withTeam / Player / withPlayer in an undefined state and we
 * later restore from a pristine snapshot, the next tick's validateBall throws.
 * This guard fills in safe defaults for any missing ball properties.
 */
function _repairBall(matchDetails) {
  if (!matchDetails?.ball) return;
  const b = matchDetails.ball;
  const defaults = {
    position: [340, 525, 0],
    withPlayer: false,
    Player: '',
    withTeam: '',
    direction: 'wait',
    ballOverIterations: [],
  };
  for (const [key, fallback] of Object.entries(defaults)) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || b[key] === undefined || b[key] === null) {
      b[key] = fallback;
    }
  }
  // Also ensure lastTouch sub-object exists (used by engine logging)
  if (!b.lastTouch || typeof b.lastTouch !== 'object') {
    b.lastTouch = { playerName: '', playerID: '', teamID: '', bodyPart: '' };
  }
}

/** Restore console.log — call after the match concludes. */
export function destroyMatch() {
  _restoreLog();
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Backward-compatible re-exports — the canonical values now live in
// gameConfig.js (Design Pattern #9). Existing importers (matchSession.js,
// MatchView.jsx) keep working via `MatchEngine.DEFAULT_ITERATIONS` etc.
export const DEFAULT_PITCH = PITCH;

// Iterations per half (see gameConfig.ITERATIONS_PER_HALF).
export const DEFAULT_ITERATIONS = ITERATIONS_PER_HALF;

// ---------------------------------------------------------------------------
// Player / Team builder helpers
// ---------------------------------------------------------------------------

/**
 * Build a single engine-compatible Player JSON from our internal player shape.
 * Delegates to playerComponents.assemblePlayer() (Design Pattern #5: Component),
 * which composes identity / skill / placement / action-state / stats / physical /
 * substitution components into the flat object the engine expects.
 *
 * @param {object} p — { id, name, position, engineSkills, subAttrs, height }
 * @param {number[]} [originPOS] — optional formation-based [x, y] override
 * @param {object} [options] — { isSubstitute, subbedOnMinute, replacedPlayerID,
 *   effectivePosition, familiarityModifier }
 * @returns {object} engine-ready player
 */
export function buildPlayerJson(p, originPOS, options) {
  return assemblePlayer(p, originPOS, options);
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

/**
 * Apply mentality modifiers to a team's players before match creation.
 * Higher mentality → boosted offensive skills, lowered defensive skills.
 * Lower mentality → boosted defensive skills, lowered offensive skills.
 *
 * Mentality effects (engine intent, skill modifiers, defensive-line depth)
 * are unified in engine/lib/mentality.js (Design Pattern #3: Strategy); this
 * function only applies the skill-modifier slice of that strategy.
 *
 * @param {object} team — engine-ready team object
 * @param {string} mentalityKey — e.g. 'attack' | 'balanced' | 'defend'
 * @returns {object} modified team (shallow clone)
 */
export function applyMentalityToTeam(team, mentalityKey) {
  if (!team || !mentalityKey) return team;
  const strategy = getMentalityStrategy(mentalityKey);

  // Set team-level intent
  const modified = { ...team, intent: strategy.intent, _mentality: mentalityKey };

  // Boost/scaledown per-player skills based on mentality
  const offMod = strategy.skillModifiers.offensive;
  const defMod = strategy.skillModifiers.defensive;

  const players = team.players.map((p) => {
    const skill = { ...p.skill };
    for (const key of OFFENSIVE_SKILLS) {
      if (skill[key] != null) {
        skill[key] = String(Math.min(100, Math.round(Number(skill[key]) * offMod)));
      }
    }
    for (const key of DEFENSIVE_SKILLS) {
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

  // --- Structured event pipeline (Design Pattern #1: Observer) ---
  // A single parser (parseMatchEvent) turns each engine log string into a
  // typed event; subscribers consume them via the bus. The stats tracker is
  // the first subscriber; commentary/ratings can attach later without
  // touching the tick loop.
  md._eventBus = createMatchEventBus();
  md._eventBus.on('*', (ev, ctx) => _trackStatsEvent(ctx._statsTracker, ctx, ev));

  md._half = 1;
  md._halfIteration = 0;
  md._finished = false;

  // Dirty Flag (Design Pattern #8) — revision counter for memoized derived
  // data (getMatchSummary / getPlayerStats). Bumped on every mutation.
  md._revision = 0;

  return md;
}

// ---------------------------------------------------------------------------
// Memento save/load (Design Pattern #10)
// ---------------------------------------------------------------------------

/**
 * Snapshot the live match into a serializable object. Runtime-only state (the
 * event bus) is excluded; the stats tracker is captured as raw data and
 * rehydrated with live getters on restore.
 *
 * @param {object} matchDetails
 * @returns {object|null} snapshot — safe to JSON.stringify for storage
 */
export function saveMatch(matchDetails) {
  return captureMatchState(matchDetails);
}

/**
 * Rebuild a live match from a snapshot, re-attaching the event bus and
 * re-wiring the stats subscriber. Returns a NEW object.
 *
 * @param {object} snapshot
 * @returns {object} live matchDetails
 */
export function loadMatch(snapshot) {
  return restoreMatchState(snapshot, {
    statsSubscriber: (ev, ctx) => _trackStatsEvent(ctx._statsTracker, ctx, ev),
  });
}

/**
 * Serialize the match to a JSON string for persistent storage.
 *
 * @param {object} matchDetails
 * @returns {string} JSON
 */
export function serializeMatch(matchDetails) {
  return serializeMatchState(matchDetails);
}

/**
 * Restore a match from a saved JSON string.
 *
 * @param {string} json
 * @returns {object} live matchDetails
 */
export function deserializeMatch(json) {
  return deserializeMatchState(json, {
    statsSubscriber: (ev, ctx) => _trackStatsEvent(ctx._statsTracker, ctx, ev),
  });
}

/**
 * Run one iteration of the match engine.
 *
 * @param {object} matchDetails
 * @returns {Promise<object>} updated matchDetails
 */
export async function runIteration(matchDetails) {
  _suppressLog();
  // Deep-clone before engine mutation. When playIteration throws mid-way,
  // matchDetails is left in a partially-mutated, inconsistent state
  // (e.g. player positions updated but ball not moved). If we return that
  // corrupted object, validate.validatePlayerPositions at the top of the
  // NEXT playIteration call throws again — and the match freezes forever.
  // By keeping a pristine snapshot we can discard the broken state
  // entirely and let the sim recover on the next tick.
  const pristine = JSON.parse(JSON.stringify(matchDetails));

  // Defensive: repair the ball object before calling the engine.
  // The engine occasionally leaves the ball in a state where `withTeam`
  // or other required properties are undefined — and JSON.parse(JSON.stringify(…))
  // drops undefined keys, causing validateBall to throw on the next tick.
  // This guard ensures the ball always has every property the validator expects.
  _repairBall(matchDetails);

  try {
    // Clear the log before each engine iteration so only this tick's new
    // entries remain. The engine (engine.js line 45) also clears and re-adds
    // boilerplate, but we clear first so the returned log is a clean delta.
    // parseIterationEvents and the event bus both operate on this per-tick
    // slice.
    matchDetails.iterationLog = [];

    const md = await Engine.playIteration(matchDetails);
    md._half = matchDetails._half || 1;
    md._halfIteration = (matchDetails._halfIteration || 0) + 1;
    bumpRevision(md);

    // Parse this tick's new log entries ONCE into typed events and emit them
    // on the bus; the stats subscriber (and future subscribers) react here.
    emitLogEvents(md, md.iterationLog);

    return md;
  } catch (e) {
    // Engine-internal boundary case (e.g. "player.skill" on undefined during
    // a penalty or tackle resolution, or a player moved off the pitch).
    // Restore the pristine copy so the corrupted partial mutation doesn't
    // poison the next tick — without this, validate at the top of
    // playIteration would throw again and the match animation would freeze.
    console.warn('[MatchEngine] playIteration error (skipping tick):', e.message || e);
    pristine.iterationLog = [];
    pristine._half = matchDetails._half || 1;
    pristine._halfIteration = (matchDetails._halfIteration || 0) + 1;
    bumpRevision(pristine);
    // The event bus is a Map of closures and does not survive the JSON clone;
    // re-attach the live bus so subscribers keep firing on the next tick.
    pristine._eventBus = matchDetails._eventBus;
    // Repair the pristine ball too — JSON round-trip may have stripped
    // undefined properties that the engine validator requires.
    _repairBall(pristine);
    return pristine;
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

  // The engine's startSecondHalf unconditionally resets iterationLog to just
  // ["Second Half Started: ..."]. That's exactly what we want here: the
  // commentary tab accumulates events in its own ref, so first-half entries
  // do NOT need to be re-injected — re-injecting them would re-parse the same
  // log entries with fresh keys and stamp them all with the half-2 minute,
  // producing duplicate "45'" events.
  const md = await Engine.startSecondHalf(matchDetails);

  // Restore sent-off markers — switchSide gave sent-off players real
  // coordinates, but they must stay at ['NP','NP'] so the engine doesn't
  // try to move/validate them.
  _reapplySentOff(md, sentOff);

  md._half = 2;
  md._halfIteration = 0;
  bumpRevision(md);
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
 * Simple in-place substitution by engine team key (legacy API).
 * Unlike applySubstitutionV2, this directly swaps players in a team array
 * without position familiarity checks or window tracking.
 *
 * @param {object} matchDetails
 * @param {'kickOffTeam'|'secondTeam'} teamKey
 * @param {string} playerOutID
 * @param {object} playerIn — squad player object
 * @returns {object} updated matchDetails
 */
export function applySubstitution(matchDetails, teamKey, playerOutID, playerIn) {
  if (!matchDetails || !teamKey || !playerOutID || !playerIn) return matchDetails;
  const team = matchDetails[teamKey];
  if (!team?.players) return matchDetails;
  // Match by engine playerID first; fall back to squadID because the engine's
  // setGameVariables overwrites playerID with a random number, so callers that
  // only have the squad ID must be able to locate the outgoing player.
  const outIdx = team.players.findIndex((p) => p.playerID === playerOutID || p.squadID === playerOutID);
  if (outIdx === -1) return matchDetails;
  const outPlayer = team.players[outIdx];
  if (Array.isArray(outPlayer.currentPOS) && outPlayer.currentPOS[0] === 'NP') return matchDetails;
  const subPlayer = buildPlayerJson(playerIn, outPlayer.originPOS || outPlayer.currentPOS);
  // Keep the outgoing player's originPOS so engine pathfinding knows the formation slot.
  // Do NOT copy the outgoing player's currentPOS — it may have drifted near or past
  // the pitch boundary (e.g. x = -2), and the validator on the next tick would throw
  // "not on the pitch", resetting the entire tick and undoing the sub.
  // Instead, place the substitute at the formation originPOS and reset intentPOS.
  subPlayer.intentPOS = [...subPlayer.originPOS];
  team.players[outIdx] = subPlayer;
  if (matchDetails.iterationLog) {
    matchDetails.iterationLog.push(`SUB: ${playerIn.name || playerIn.id} replaces ${outPlayer.name || playerOutID}`);
  }
  bumpRevision(matchDetails);
  return matchDetails;
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

  bumpRevision(matchDetails);
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
export const getMatchSummary = memoizeByRevision(function getMatchSummary(matchDetails) {
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
    homeTeamName: matchDetails._homeTeamName || kickOff?.name || '主队',
    awayTeamName: matchDetails._awayTeamName || second?.name || '客队',
    half: matchDetails._half || 1,
    finished: matchDetails._finished || false,
  };
});

/**
 * Collect per-player stats from the match details.
 *
 * Engine stores per-player stats inside each player's `stats` field.
 *
 * @returns {object} { [playerID]: { goals, shots, passes, tackles, cards, saves, … } }
 */
export const getPlayerStats = memoizeByRevision(function getPlayerStats(matchDetails) {
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
});

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

  const half = matchDetails._half || 1;
  const halfIter = matchDetails._halfIteration || 1;
  const log = matchDetails.iterationLog;
  const total = log.length;
  if (total === 0) return [];

  const events = [];

  // Snapshot matchDetails data that _translateCommentary depends on so
  // translations are stable across ticks. The engine mutates team rosters
  // during play (substitutions, red cards, etc.) — without a snapshot,
  // _resolveTeam can return a different teamTag for the same old entry,
  // causing React to update the DOM on a stable key → perceived as flicker.
  //
  // CRITICAL: Must deep-copy the players arrays. A shallow reference copy
  // (e.g. { kickOffTeam: matchDetails.kickOffTeam }) still points at the
  // same mutable objects — engine substitutions mutate them in-place,
  // leaking through the "snapshot" and changing old entry translations.
  const _translateSnapshot = {
    kickOffTeam: matchDetails.kickOffTeam ? {
      ...matchDetails.kickOffTeam,
      players: (matchDetails.kickOffTeam.players || []).map(p => ({ ...p })),
    } : null,
    secondTeam: matchDetails.secondTeam ? {
      ...matchDetails.secondTeam,
      players: (matchDetails.secondTeam.players || []).map(p => ({ ...p })),
    } : null,
    _homeTeamName: matchDetails._homeTeamName,
  };

  // Rate-limit info-type events: at most 1 info event per 15 ticks.
  // Info events (ball position updates, closest-player, passes, etc.) flood the
  // commentary in burst mode (4-15 engine iterations per tick). Non-info events
  // (goals, saves, tackles, fouls, cards, offside, shots, corners, injuries,
  // subs) always pass through.
  const INFO_WINDOW = 15;
  _infoTickCounter++;
  if (_infoTickCounter >= INFO_WINDOW) {
    _infoTickCounter = 0;
    _infoAllowed = true;
  }

  for (let i = 0; i < total; i++) {
    const rawText = log[i];
    const translatedText = _translateCommentary(rawText, _translateSnapshot);
    // Skip boilerplate entries (templates return '' for suppressed content)
    if (translatedText === '') continue;
    // runIteration() clears iterationLog before each engine tick, so every
    // entry in this slice was produced during the CURRENT half at the CURRENT
    // halfIter. Tag every event with `half` directly. (The old approach split
    // the log at a frozen _firstHalfEventCount, which mis-classified
    // second-half events with index < frozen count as half-1, dropping their
    // +45' minute offset and printing e.g. "18'" at 62' match time.)
    const eventHalf = half;
    const estimatedIter = halfIter;
    const type = _classifyEvent(rawText);
    // Rate-limit info events: at most 1 per INFO_WINDOW ticks
    if (type === 'info') {
      if (!_infoAllowed) continue;
      _infoAllowed = false;
    }
    events.push({
      text: translatedText,
      rawText,
      half: eventHalf,
      halfIter: estimatedIter,  // estimated engine iteration for minute display
      _logIndex: i,             // log index within this tick's slice
      iter: i,
      key: _nextEventKey(),     // globally unique, never repeats across ticks
      type,
    });
  }

  return events;
}

let _eventKeyCounter = 0;

function _nextEventKey() {
  return 'e' + (++_eventKeyCounter);
}

// Info-event throttle: at most 1 info event per INFO_WINDOW ticks (15).
// _infoTickCounter increments on every parseIterationEvents() call;
// when it reaches INFO_WINDOW, we reset and grant one info slot.
let _infoTickCounter = 0;
let _infoAllowed = true;

function _classifyEvent(text) {
  // Delegates to the single structured parser (Design Pattern #1).
  // `coarse` reproduces the legacy classification exactly (see matchEvents.js).
  return parseMatchEvent(text).coarse;
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

// ---------------------------------------------------------------------------
// Auto-tracking: parse engine log entries into matchStats
// ---------------------------------------------------------------------------

/**
 * Stats subscriber for the structured event pipeline (Design Pattern #1).
 *
 * Called from the event bus for every typed event emitted in runIteration.
 * Consumes the typed event's `type` + `playerName`/`won` fields (produced by
 * parseMatchEvent) and feeds the matchStats tracker.
 *
 * Legacy behaviour is preserved exactly:
 *   - shots: only "Shot Made/Header Shot/Volley Shot by" lines count, with
 *     onTarget always false (the on/off-target lines are separate events and
 *     were never merged by the legacy parser).
 *   - tackles: only "successful" (won=true) and "slide attempted" (won=false)
 *     count; plain "tackle attempted"/"failed tackle" are ignored.
 *   - fouls: only "Handball by" resolves a player name in the legacy code, so
 *     only handballs increment foul stats.
 *
 * @param {object} tracker — matchDetails._statsTracker
 * @param {object} matchDetails — live match state (for name→id + side lookup)
 * @param {object} ev — typed event from parseMatchEvent
 */
function _trackStatsEvent(tracker, matchDetails, ev) {
  if (!tracker || !ev) return;

  const iter = matchDetails._halfIteration || 1;

  // Determine which engine team maps to home/away
  const kickIsHome = matchDetails.kickOffTeam?.name === matchDetails._homeTeamName;
  const sides = {
    [matchDetails.kickOffTeam?.name]: kickIsHome ? 'home' : 'away',
    [matchDetails.secondTeam?.name]: kickIsHome ? 'away' : 'home',
  };

  // Resolve which side a message belongs to by scanning team names in the text.
  function resolveSide(text) {
    for (const [teamName, side] of Object.entries(sides)) {
      if (teamName && text.includes(teamName)) return side;
    }
    return 'home';
  }

  const side = resolveSide(ev.rawText);
  const playerID = ev.playerName ? _findPlayerIDByName(matchDetails, ev.playerName, side) : null;

  switch (ev.type) {
    // Shot events — "Shot Made/Header Shot/Volley Shot by" (legacy onTarget=false)
    case 'shot':
      if (playerID) recordMatchEvent(tracker, side, playerID, 'shoot', { onTarget: false }, iter);
      _incTeamShotStat(matchDetails, side, false);
      break;

    // Goal events
    case 'goal':
      if (playerID) recordMatchEvent(tracker, side, playerID, 'goal', {}, iter);
      break;

    // Save events
    case 'save':
      if (playerID) recordMatchEvent(tracker, side, playerID, 'save', {}, iter);
      break;

    // Tackle events — successful only (legacy)
    case 'tackle':
      if (playerID) recordMatchEvent(tracker, side, playerID, 'tackle', { won: true }, iter);
      break;
    // Slide-tackle attempt — counted as a lost tackle (legacy)
    case 'slide_tackle':
      if (playerID) recordMatchEvent(tracker, side, playerID, 'tackle', { won: false }, iter);
      break;

    // Pass events — "ball passed by" and "through ball attempted" only
    case 'pass':
    case 'through_ball':
      if (playerID) recordMatchEvent(tracker, side, playerID, 'pass', { completed: true }, iter);
      break;

    // Cross events
    case 'cross':
      if (playerID) recordMatchEvent(tracker, side, playerID, 'cross', { completed: true }, iter);
      break;

    // Foul events — legacy only tracks handball (the only branch where a
    // player name resolved). "Foul against" is left untracked to match legacy.
    case 'foul':
      if (ev.rawText.toLowerCase().includes('handball by') && playerID) {
        recordMatchEvent(tracker, side, playerID, 'foul', {}, iter);
        _incTeamFoulStat(matchDetails, side);
      }
      break;

    // Corner events
    case 'corner':
      _incTeamCornerStat(matchDetails, side);
      break;

    // Interception / possession events — "has the ball" only (legacy)
    case 'interception':
      if (playerID) recordMatchEvent(tracker, side, playerID, 'interception', {}, iter);
      break;

    default:
      break;
  }
}

/** Look up a playerID by (partial) name within a side's engine team. */
function _findPlayerIDByName(matchDetails, name, side) {
  if (!name || !matchDetails) return null;
  const kickIsHome = matchDetails.kickOffTeam?.name === matchDetails._homeTeamName;
  const team = side === 'home'
    ? (kickIsHome ? matchDetails.kickOffTeam : matchDetails.secondTeam)
    : (kickIsHome ? matchDetails.secondTeam : matchDetails.kickOffTeam);
  if (!team?.players) return null;
  const n = name.toLowerCase().trim();
  let player = team.players.find((p) => p.name && p.name.toLowerCase().includes(n));
  if (!player) player = team.players.find((p) => p.name && n.includes(p.name.toLowerCase()));
  return player?.playerID || null;
}

/** Add shot to engine-heap team statistics. */
function _incTeamShotStat(matchDetails, side, onTarget) {
  const kickIsHome = matchDetails.kickOffTeam?.name === matchDetails._homeTeamName;
  const statsKey = side === 'home'
    ? (kickIsHome ? 'kickOffTeamStatistics' : 'secondTeamStatistics')
    : (kickIsHome ? 'secondTeamStatistics' : 'kickOffTeamStatistics');
  const ts = matchDetails[statsKey];
  if (!ts) return;
  if (!ts.shots) ts.shots = { total: 0, on: 0, off: 0 };
  ts.shots.total = (ts.shots.total || 0) + 1;
  if (onTarget) ts.shots.on = (ts.shots.on || 0) + 1;
  else ts.shots.off = (ts.shots.off || 0) + 1;
}

/** Add foul to engine-heap team statistics. */
function _incTeamFoulStat(matchDetails, side) {
  const kickIsHome = matchDetails.kickOffTeam?.name === matchDetails._homeTeamName;
  const statsKey = side === 'home'
    ? (kickIsHome ? 'kickOffTeamStatistics' : 'secondTeamStatistics')
    : (kickIsHome ? 'secondTeamStatistics' : 'kickOffTeamStatistics');
  const ts = matchDetails[statsKey];
  if (!ts) return;
  ts.fouls = (ts.fouls || 0) + 1;
}

/** Add corner to engine-heap team statistics. */
function _incTeamCornerStat(matchDetails, side) {
  const kickIsHome = matchDetails.kickOffTeam?.name === matchDetails._homeTeamName;
  const statsKey = side === 'home'
    ? (kickIsHome ? 'kickOffTeamStatistics' : 'secondTeamStatistics')
    : (kickIsHome ? 'secondTeamStatistics' : 'kickOffTeamStatistics');
  const ts = matchDetails[statsKey];
  if (!ts) return;
  ts.corners = (ts.corners || 0) + 1;
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

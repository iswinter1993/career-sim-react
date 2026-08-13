// playerComponents.js — Design Pattern #5: Component
//
// Decomposes the monolithic engine-player object into named, composable
// components. buildPlayerJson() used to hand-assemble one big flat object;
// now each concern — identity, skills, placement, action state, stats,
// physical, substitution metadata — is an independent builder, and
// assemblePlayer() merges them. The engine still receives the exact same
// flat shape, so this is a decomposition of *construction*, not of the
// runtime object. Each component can be tuned or unit-tested in isolation
// without touching the others.
//
// Public API:
//   resolvePlacement(p, originPOS)   → [x, y]
//   resetPlacementCounters()         → void (legacy export, kept for compat)
//   identityComponent(p)             → { name, playerID, squadID, position, isPlayerSelf }
//   skillComponent(p)                → { rating, skill }
//   placementComponent([x,y])        → { currentPOS, originPOS, intentPOS }
//   actionStateComponent()           → { action, offside, hasBall }
//   statsComponent(position)         → { stats }
//   physicalComponent(p)             → { fitness, height, injured }
//   substitutionComponent(p, options) → { isSubstitute, subbedOnMinute, … }
//   assemblePlayer(p, originPOS, options) → flat engine player (== old buildPlayerJson)

// ---------------------------------------------------------------------------
// Placement (moved from matchEngine.js — kept private except the resolver)
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

/** Resolve a player's starting [x, y]: explicit originPOS wins, else static table. */
export function resolvePlacement(p, originPOS) {
  return originPOS || _placementFor(p);
}

// ---------------------------------------------------------------------------
// Component builders
// ---------------------------------------------------------------------------

/** Identity: name + stable identifiers that survive engine re-initialisation. */
export function identityComponent(p) {
  return {
    name: p.name || p.id,
    playerID: p.playerID || p.id,
    // Stable squad identifier — survives the engine's setGameVariables,
    // which overwrites playerID with a random number. Used to map engine
    // players back to squad players for substitutions / UI highlights.
    squadID: p.squadID || p.id,
    position: p.position || 'CM',
    // Human-player marker — survives engine's playerID overwrite
    // (setGameVariables assigns a random playerID, wiping 'player_self')
    isPlayerSelf: p.isPlayer || false,
  };
}

/** Skills: overall rating + the 11 engine skill attributes. */
export function skillComponent(p) {
  const skills = p.engineSkills || {};
  return {
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
      crossing:       String(skills.crossing ?? skills.passing ?? 50),
    },
  };
}

/** Placement: the three position vectors the engine's validator requires. */
export function placementComponent(pos) {
  return {
    currentPOS: pos,
    originPOS: pos,
    // Engine iteration-validator field. Substitutes built outside
    // setGameVariables must carry a complete intentPOS or the next tick
    // throws "Player must contain JSON variable: action" (etc.).
    intentPOS: pos,
  };
}

/** Action state: the per-tick action/offside/ball flags the engine mutates. */
export function actionStateComponent() {
  return {
    action: 'none',
    offside: false,
    hasBall: false,
  };
}

/** Stats: the per-player accumulator the engine fills during the match. */
export function statsComponent(position) {
  const pos = position || 'CM';
  return {
    stats: {
      goals: 0,
      shots: { total: 0, on: 0, off: 0 },
      cards: { yellow: 0, red: 0 },
      passes: { total: 0, on: 0, off: 0 },
      tackles: { total: 0, on: 0, off: 0, fouls: 0 },
      ...(pos === 'GK' ? { saves: 0 } : {}),
    },
  };
}

/** Physical: fitness, height, injury state. */
export function physicalComponent(p) {
  return {
    fitness: p.engineSkills?.fitness ?? 100,
    height: p.height ?? 180,
    injured: p.injured ?? false,
  };
}

/** Substitution metadata: how this player entered the match (if at all). */
export function substitutionComponent(p, options) {
  return {
    isSubstitute: options?.isSubstitute || false,
    subbedOnMinute: options?.subbedOnMinute || null,
    replacedPlayerID: options?.replacedPlayerID || null,
    effectivePosition: options?.effectivePosition || p.position || 'CM',
    familiarityModifier: options?.familiarityModifier ?? 1.0,
  };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Assemble a full engine-compatible player from its components.
 * Produces the exact flat shape the engine (and buildPlayerJson before it)
 * expects.
 *
 * @param {object} p — { id, name, position, engineSkills, subAttrs, height }
 * @param {number[]} [originPOS] — optional formation-based [x, y] override
 * @param {object} [options] — substitution metadata
 * @returns {object} engine-ready player
 */
export function assemblePlayer(p, originPOS, options) {
  const pos = resolvePlacement(p, originPOS);
  return {
    ...identityComponent(p),
    ...skillComponent(p),
    ...placementComponent(pos),
    ...actionStateComponent(),
    ...statsComponent(p.position),
    ...physicalComponent(p),
    ...substitutionComponent(p, options),
  };
}

// engine/lib/positionGroup.js
//
// Position grouping utilities for the career-sim-react match engine.
// Centralises all position classification logic so the rest of the engine
// (actions.js, setFreekicks.js, setPositions.js, playerMovement.js) can
// reference position groups instead of hardcoded arrays.
//
// Public API:
//   ALL_POSITIONS                    → ['GK','CB','LB','RB','CDM','CM','CAM','LM','RM','LW','RW','ST']
//   POSITION_LABELS                  → { GK: '门将', CB: '中后卫', ... }
//   getPositionGroup(position)       → 'GK'|'CB'|'FB'|'DM'|'CM'|'WM'|'WG'|'ST'
//   isInGroup(position, groupName)   → boolean
//   isDefensivePosition(position)    → boolean (GK/CB/LB/RB/CDM)
//   isMidfieldPosition(position)     → boolean (CDM/CM/CAM/LM/RM)
//   isAttackingPosition(position)    → boolean (ST/LW/RW/CAM)
//   isWidePosition(position)         → boolean (LB/RB/LM/RM/LW/RW)
//   isCentralPosition(position)      → boolean (GK/CB/CDM/CM/CAM/ST)
//   getSetpieceGroup(position, grp)  → boolean (DEFENDERS/MIDFIELDERS/ATTACKERS/...)
//   getSetpieceLayer(position, ballZone) → 'wall'|'near_post'|'far_post'|'edge_of_box'|'stay_forward'
//   getBenchCoverage()               → bench position templates for squadGen
//   resolveSubstitutionPosition(pIn, pOut, formation) → { effectivePosition, familiarityModifier }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All 12 supported player positions (plus LWB/RWB from 5-3-2/3-5-2 formations). */
export const ALL_POSITIONS = [
  'GK',                    // Goalkeeper
  'CB',                    // Centre-Back
  'LB', 'RB',             // Full-Backs
  'LWB', 'RWB',           // Wing-Backs (formation positions, treated as full-backs)
  'CDM',                   // Defensive Midfielder
  'CM', 'CAM',            // Central Midfielders
  'LM', 'RM',             // Wide Midfielders
  'LW', 'RW',             // Wingers
  'ST',                    // Striker
];

/** Chinese-language labels for each position. */
export const POSITION_LABELS = {
  GK:  '门将',
  CB:  '中后卫',
  LB:  '左后卫',
  RB:  '右后卫',
  LWB: '左翼卫',
  RWB: '右翼卫',
  CDM: '后腰',
  CM:  '中前卫',
  CAM: '前腰',
  LM:  '左前卫',
  RM:  '右前卫',
  LW:  '左边锋',
  RW:  '右边锋',
  ST:  '前锋',
};

// ---------------------------------------------------------------------------
// Tactical position groups (6 groups → engine-level behaviour buckets)
// ---------------------------------------------------------------------------

const GROUP_DEFINITIONS = {
  GK: ['GK'],                       // Goalkeeper
  CB: ['CB'],                       // Centre-Back
  FB: ['LB', 'RB', 'LWB', 'RWB'],   // Full-Back / Wing-Back
  DM: ['CDM'],                      // Defensive Midfield
  CM: ['CM', 'CAM'],                // Central Midfield (CAM is more advanced but same base group)
  WM: ['LM', 'RM'],                 // Wide Midfield
  WG: ['LW', 'RW'],                 // Wingers (more advanced than WM)
  ST: ['ST'],                       // Striker
};

// ---------------------------------------------------------------------------
// Set-piece / tactical sub-groups
// ---------------------------------------------------------------------------

export const SETPIECE_GROUPS = {
  DEFENDERS:       ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM'],
  MIDFIELDERS:     ['CM', 'CAM', 'LM', 'RM'],
  ATTACKERS:       ['ST', 'LW', 'RW'],
  WIDE_PLAYERS:    ['LB', 'RB', 'LWB', 'RWB', 'LM', 'RM', 'LW', 'RW'],
  CENTRAL_PLAYERS: ['GK', 'CB', 'CDM', 'CM', 'CAM', 'ST'],
  BACK_LINE:       ['CB', 'LB', 'RB', 'LWB', 'RWB'],
};

// ---------------------------------------------------------------------------
// Core look-up
// ---------------------------------------------------------------------------

/**
 * Return the tactical group for a given position.
 *
 * @param {string} position — one of ALL_POSITIONS
 * @returns {'GK'|'CB'|'FB'|'DM'|'CM'|'WM'|'WG'|'ST'}
 */
export function getPositionGroup(position) {
  for (const [group, members] of Object.entries(GROUP_DEFINITIONS)) {
    if (members.includes(position)) return group;
  }
  return 'CM'; // safe fallback
}

/**
 * Check whether a position belongs to a named set-piece group.
 *
 * @param {string} position
 * @param {string} groupName — key of SETPIECE_GROUPS
 * @returns {boolean}
 */
export function isInGroup(position, groupName) {
  const group = SETPIECE_GROUPS[groupName];
  return group ? group.includes(position) : false;
}

// ---------------------------------------------------------------------------
// Boolean classifiers
// ---------------------------------------------------------------------------

/** Goalkeeper + back-four/five + defensive midfielder (includes wing-backs). */
export function isDefensivePosition(position) {
  return ['GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM'].includes(position);
}

/** All midfielders (including wide and defensive). */
export function isMidfieldPosition(position) {
  return ['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(position);
}

/** Forwards and attacking midfielders who primarily contribute in the final third. */
export function isAttackingPosition(position) {
  return ['ST', 'LW', 'RW', 'CAM'].includes(position);
}

/** Full-backs, wing-backs, wide midfielders, and wingers. */
export function isWidePosition(position) {
  return ['LB', 'RB', 'LWB', 'RWB', 'LM', 'RM', 'LW', 'RW'].includes(position);
}

/** Central (non-wide) positions. */
export function isCentralPosition(position) {
  return ['GK', 'CB', 'CDM', 'CM', 'CAM', 'ST'].includes(position);
}

// ---------------------------------------------------------------------------
// Set-piece layering
// ---------------------------------------------------------------------------

/**
 * Determine the set-piece role a player should take given their position
 * and the zone where the free-kick / corner is being taken.
 *
 * @param {string} position — player position
 * @param {string} ballZone — rough area where the dead ball is:
 *   'defensive_third'  (own third, Y < 350)
 *   'middle_third'     (centre circle area)
 *   'attacking_third'  (opposition third)
 *   'near_box'         (just outside the box, Y ~700-900 or ~150-350)
 *   'corner'           (corner kick)
 * @returns {'wall'|'near_post'|'far_post'|'edge_of_box'|'stay_forward'|'mark_attacker'|'gk_default'}
 */
export function getSetpieceLayer(position, ballZone) {
  const group = getPositionGroup(position);

  // Goalkeeper always stays in goal
  if (group === 'GK') return 'gk_default';

  // Corners — special assignment
  if (ballZone === 'corner') {
    if (group === 'CB') return 'near_post';       // biggest CB marks near post
    if (group === 'FB') return 'far_post';         // full-back covers far post
    if (group === 'DM') return 'edge_of_box';      // DM waits for clearances
    if (group === 'ST') return 'stay_forward';     // striker stays up for counter
    if (group === 'WG' || group === 'WM') return 'edge_of_box';
    return 'mark_attacker'; // CM/CAM — mark opposition players
  }

  // Defensive free-kicks — wall vs. marking
  if (ballZone === 'defensive_third' || ballZone === 'near_box') {
    if (group === 'CB' || group === 'DM') return 'wall';   // tallest players in wall
    if (group === 'FB') return 'near_post';                 // cover posts
    if (group === 'ST' || group === 'WG') return 'stay_forward'; // outlet
    return 'mark_attacker';                                 // everyone else marks
  }

  // Attacking free-kicks
  if (ballZone === 'attacking_third' || ballZone === 'near_box') {
    if (group === 'CB') return 'near_post';   // CBs attack the near post
    if (group === 'ST') return 'far_post';    // strikers attack far post
    if (group === 'FB') return 'edge_of_box'; // full-backs stay back to cover counter
    if (group === 'DM') return 'edge_of_box'; // DM stays back too
    return 'mark_attacker';                   // mids flood the box
  }

  // Middle third — fairly neutral
  if (group === 'CB' || group === 'FB' || group === 'DM') return 'mark_attacker';
  if (group === 'ST' || group === 'WG') return 'stay_forward';
  return 'edge_of_box';
}

// ---------------------------------------------------------------------------
// Bench coverage (for squadGen)
// ---------------------------------------------------------------------------

/** Standard 7-player bench templates covering all position groups. */
const BENCH_TEMPLATES = [
  ['GK', 'CB', 'LB', 'CDM', 'CM', 'LW', 'ST'],
  ['GK', 'CB', 'RB', 'CDM', 'CAM', 'RW', 'ST'],
  ['GK', 'CB', 'CB', 'CM', 'LM', 'LW', 'ST'],
];

/**
 * Return a random 7-player bench position template.
 * @param {Function} [rng] — seeded PRNG (Math.random used if omitted)
 * @returns {string[]}
 */
export function getBenchCoverage(rng) {
  const random = rng || Math.random;
  return BENCH_TEMPLATES[Math.floor(random() * BENCH_TEMPLATES.length)];
}

// ---------------------------------------------------------------------------
// Substitution position resolution (P3.4)
// ---------------------------------------------------------------------------

/**
 * Resolve a substitute's effective position after substitution.
 * Returns both the assigned position and a familiarity penalty modifier.
 *
 * familiarityModifier:  1.00 = natural, 0.90 = same-group, 0.75 = adjacent, 0.45 = awkward
 *
 * @param {object} playerIn  — substitute player { position, … }
 * @param {object} playerOut — player being replaced { position, … }
 * @param {string} [formation] — current formation (reserved for future use)
 * @returns {{ effectivePosition: string, familiarityModifier: number }}
 */
export function resolveSubstitutionPosition(playerIn, playerOut, formation) {
  const inPos = playerIn.position;
  const outPos = playerOut.position;

  // Same position — perfect fit
  if (inPos === outPos) {
    return { effectivePosition: outPos, familiarityModifier: 1.0 };
  }

  const inGroup = getPositionGroup(inPos);
  const outGroup = getPositionGroup(outPos);

  // Same tactical group — natural fit
  if (inGroup === outGroup) {
    return { effectivePosition: outPos, familiarityModifier: 0.90 };
  }

  // Adjacent groups — reasonable fit
  if (_areAdjacentGroups(inGroup, outGroup)) {
    return { effectivePosition: outPos, familiarityModifier: 0.75 };
  }

  // Cross-group — awkward (e.g. ST → CB)
  return { effectivePosition: outPos, familiarityModifier: 0.45 };
}

const GROUP_ADJACENCY = {
  GK:  ['CB', 'FB'],
  CB:  ['GK', 'FB', 'DM'],
  FB:  ['CB', 'DM', 'WM', 'WG'],
  DM:  ['CB', 'FB', 'CM', 'WM'],
  CM:  ['DM', 'WM', 'WG', 'ST'],
  WM:  ['FB', 'DM', 'CM', 'WG'],
  WG:  ['FB', 'WM', 'CM', 'ST'],
  ST:  ['CM', 'WG'],
};

function _areAdjacentGroups(a, b) {
  return (GROUP_ADJACENCY[a] || []).includes(b);
}

/**
 * Apply position familiarity penalty to a player's skill values.
 * Non-native positions hurt positioning most, then technical skills, then physical.
 *
 * @param {object} player — player with .skill object
 * @param {number} familiarityModifier — from resolveSubstitutionPosition()
 * @returns {object} shallow clone with adjusted skills
 */
export function applyFamiliarityPenalty(player, familiarityModifier) {
  if (familiarityModifier >= 1.0) return player;
  const penalty = 1.0 - familiarityModifier;

  const skill = { ...player.skill };
  skill.positioning   = Math.round(Number(skill.positioning   || 50) * (1 - penalty * 0.8));
  skill.tackling      = Math.round(Number(skill.tackling      || 50) * (1 - penalty * 0.7));
  skill.passing       = Math.round(Number(skill.passing       || 50) * (1 - penalty * 0.5));
  skill.shooting      = Math.round(Number(skill.shooting      || 50) * (1 - penalty * 0.6));
  skill.control       = Math.round(Number(skill.control       || 50) * (1 - penalty * 0.5));
  skill.agility       = Math.round(Number(skill.agility       || 50) * (1 - penalty * 0.3));
  skill.strength      = Math.round(Number(skill.strength      || 50) * (1 - penalty * 0.2));
  skill.pace          = Math.round(Number(skill.pace          || 50) * (1 - penalty * 0.3));
  skill.jumping       = Math.round(Number(skill.jumping       || 50) * (1 - penalty * 0.2));
  skill.penalty_taking = Math.round(Number(skill.penalty_taking || 50) * (1 - penalty * 0.1));
  skill.saving        = Math.round(Number(skill.saving        || 50) * (1 - penalty * 0.1));

  return { ...player, skill };
}

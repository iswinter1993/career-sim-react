// Bidirectional mapping between the player's 15 sub-attributes (0-100)
// and the engine fork's 10 skills (0-100).
//
// This module is a pure function layer — no side effects, no mutable state.
//
// Public API:
//   mapToEngineSkills(attrs, position) → { passing, shooting, tackling,
//     saving, agility, strength, penalty_taking, perception, jumping,
//     control, fitness }
//   mapLeadershipToIntent(leadership)  → intent modifier for match engine
//   mapGrowthToSubAttrs(rating, position, existingAttrs, potential)
//                                     → { key: delta, … } growth deltas

import { SUB_ATTRS } from './attributes.js';

// ---------------------------------------------------------------------------
// Position-dependent mapping weights (15 sub-attributes → 10 engine skills)
// ---------------------------------------------------------------------------
// Each engine skill is a weighted blend of relevant sub-attributes.
// The weights vary by position — a ST's "shooting" pulls more from the
// shooting sub-attribute while a CB's barely pulls from it at all.
//
// Weights are stored as arrays of {subKey, weight} pairs per engine skill
// per position. The total weight is normalised so each engine skill ends
// up in [0, 100].

/**
 * Mapping tables keyed by position.
 *
 * Each position has 10 engine-skill entries. An entry is an array of
 * {subKey, weight} objects. Values are normalised against the sum of
 * weights before multiplying by the sub-attribute value.
 */
const MAPPING = {
  GK: {
    passing:       [{ subKey: 'passing', w: 8 }, { subKey: 'vision', w: 2 }],
    shooting:      [{ subKey: 'shooting', w: 1 }, { subKey: 'setPieces', w: 1 }],
    tackling:      [{ subKey: 'tackling', w: 2 }, { subKey: 'physicality', w: 2 }],
    saving:        [{ subKey: 'ballControl', w: 5 }, { subKey: 'composure', w: 5 }, { subKey: 'decision', w: 5 }],
    agility:       [{ subKey: 'speed', w: 3 }, { subKey: 'jumping', w: 5 }],
    strength:      [{ subKey: 'strength', w: 5 }, { subKey: 'physicality', w: 5 }],
    penalty_taking:[{ subKey: 'composure', w: 4 }, { subKey: 'decision', w: 3 }, { subKey: 'setPieces', w: 2 }],
    perception:    [{ subKey: 'vision', w: 5 }, { subKey: 'decision', w: 5 }],
    jumping:       [{ subKey: 'jumping', w: 8 }, { subKey: 'physicality', w: 2 }],
    control:       [{ subKey: 'ballControl', w: 4 }, { subKey: 'dribbling', w: 2 }],
  },
  CB: {
    passing:       [{ subKey: 'passing', w: 7 }, { subKey: 'vision', w: 3 }],
    shooting:      [{ subKey: 'shooting', w: 2 }, { subKey: 'setPieces', w: 1 }],
    tackling:      [{ subKey: 'tackling', w: 8 }, { subKey: 'physicality', w: 4 }],
    saving:        [{ subKey: 'ballControl', w: 1 }],
    agility:       [{ subKey: 'speed', w: 5 }, { subKey: 'jumping', w: 3 }],
    strength:      [{ subKey: 'strength', w: 7 }, { subKey: 'physicality', w: 7 }],
    penalty_taking:[{ subKey: 'composure', w: 3 }, { subKey: 'decision', w: 2 }, { subKey: 'setPieces', w: 1 }],
    perception:    [{ subKey: 'vision', w: 4 }, { subKey: 'decision', w: 5 }],
    jumping:       [{ subKey: 'jumping', w: 8 }, { subKey: 'physicality', w: 2 }],
    control:       [{ subKey: 'ballControl', w: 5 }, { subKey: 'dribbling', w: 3 }],
  },
  LB: {
    passing:       [{ subKey: 'passing', w: 7 }, { subKey: 'vision', w: 3 }],
    shooting:      [{ subKey: 'shooting', w: 3 }, { subKey: 'setPieces', w: 2 }],
    tackling:      [{ subKey: 'tackling', w: 6 }, { subKey: 'physicality', w: 3 }],
    saving:        [{ subKey: 'ballControl', w: 1 }],
    agility:       [{ subKey: 'speed', w: 8 }, { subKey: 'jumping', w: 2 }],
    strength:      [{ subKey: 'strength', w: 5 }, { subKey: 'physicality', w: 5 }],
    penalty_taking:[{ subKey: 'composure', w: 3 }, { subKey: 'decision', w: 2 }, { subKey: 'setPieces', w: 2 }],
    perception:    [{ subKey: 'vision', w: 5 }, { subKey: 'decision', w: 5 }],
    jumping:       [{ subKey: 'jumping', w: 4 }, { subKey: 'speed', w: 2 }],
    control:       [{ subKey: 'ballControl', w: 5 }, { subKey: 'dribbling', w: 5 }],
  },
  RB: {
    passing:       [{ subKey: 'passing', w: 7 }, { subKey: 'vision', w: 3 }],
    shooting:      [{ subKey: 'shooting', w: 3 }, { subKey: 'setPieces', w: 2 }],
    tackling:      [{ subKey: 'tackling', w: 6 }, { subKey: 'physicality', w: 3 }],
    saving:        [{ subKey: 'ballControl', w: 1 }],
    agility:       [{ subKey: 'speed', w: 8 }, { subKey: 'jumping', w: 2 }],
    strength:      [{ subKey: 'strength', w: 5 }, { subKey: 'physicality', w: 5 }],
    penalty_taking:[{ subKey: 'composure', w: 3 }, { subKey: 'decision', w: 2 }, { subKey: 'setPieces', w: 2 }],
    perception:    [{ subKey: 'vision', w: 5 }, { subKey: 'decision', w: 5 }],
    jumping:       [{ subKey: 'jumping', w: 4 }, { subKey: 'speed', w: 2 }],
    control:       [{ subKey: 'ballControl', w: 5 }, { subKey: 'dribbling', w: 5 }],
  },
  CDM: {
    passing:       [{ subKey: 'passing', w: 7 }, { subKey: 'vision', w: 4 }],
    shooting:      [{ subKey: 'shooting', w: 4 }, { subKey: 'setPieces', w: 2 }],
    tackling:      [{ subKey: 'tackling', w: 8 }, { subKey: 'physicality', w: 4 }],
    saving:        [{ subKey: 'ballControl', w: 1 }],
    agility:       [{ subKey: 'speed', w: 5 }, { subKey: 'strength', w: 2 }],
    strength:      [{ subKey: 'strength', w: 6 }, { subKey: 'physicality', w: 6 }],
    penalty_taking:[{ subKey: 'composure', w: 3 }, { subKey: 'decision', w: 3 }, { subKey: 'setPieces', w: 2 }],
    perception:    [{ subKey: 'vision', w: 6 }, { subKey: 'decision', w: 5 }],
    jumping:       [{ subKey: 'jumping', w: 6 }, { subKey: 'physicality', w: 2 }],
    control:       [{ subKey: 'ballControl', w: 6 }, { subKey: 'dribbling', w: 4 }],
  },
  CM: {
    passing:       [{ subKey: 'passing', w: 8 }, { subKey: 'vision', w: 5 }],
    shooting:      [{ subKey: 'shooting', w: 6 }, { subKey: 'setPieces', w: 3 }],
    tackling:      [{ subKey: 'tackling', w: 5 }, { subKey: 'physicality', w: 3 }],
    saving:        [{ subKey: 'ballControl', w: 1 }],
    agility:       [{ subKey: 'speed', w: 5 }, { subKey: 'dribbling', w: 3 }],
    strength:      [{ subKey: 'strength', w: 5 }, { subKey: 'physicality', w: 4 }],
    penalty_taking:[{ subKey: 'composure', w: 3 }, { subKey: 'decision', w: 3 }, { subKey: 'setPieces', w: 3 }],
    perception:    [{ subKey: 'vision', w: 7 }, { subKey: 'decision', w: 5 }],
    jumping:       [{ subKey: 'jumping', w: 4 }, { subKey: 'strength', w: 2 }],
    control:       [{ subKey: 'ballControl', w: 7 }, { subKey: 'dribbling', w: 5 }],
  },
  CAM: {
    passing:       [{ subKey: 'passing', w: 8 }, { subKey: 'vision', w: 6 }],
    shooting:      [{ subKey: 'shooting', w: 8 }, { subKey: 'setPieces', w: 4 }],
    tackling:      [{ subKey: 'tackling', w: 2 }, { subKey: 'physicality', w: 1 }],
    saving:        [{ subKey: 'ballControl', w: 1 }],
    agility:       [{ subKey: 'speed', w: 5 }, { subKey: 'dribbling', w: 5 }],
    strength:      [{ subKey: 'strength', w: 3 }, { subKey: 'physicality', w: 2 }],
    penalty_taking:[{ subKey: 'composure', w: 4 }, { subKey: 'decision', w: 4 }, { subKey: 'setPieces', w: 4 }],
    perception:    [{ subKey: 'vision', w: 8 }, { subKey: 'decision', w: 5 }],
    jumping:       [{ subKey: 'jumping', w: 3 }, { subKey: 'speed', w: 1 }],
    control:       [{ subKey: 'ballControl', w: 8 }, { subKey: 'dribbling', w: 7 }],
  },
  LM: {
    passing:       [{ subKey: 'passing', w: 7 }, { subKey: 'vision', w: 4 }],
    shooting:      [{ subKey: 'shooting', w: 5 }, { subKey: 'setPieces', w: 3 }],
    tackling:      [{ subKey: 'tackling', w: 4 }, { subKey: 'physicality', w: 2 }],
    saving:        [{ subKey: 'ballControl', w: 1 }],
    agility:       [{ subKey: 'speed', w: 8 }, { subKey: 'dribbling', w: 4 }],
    strength:      [{ subKey: 'strength', w: 4 }, { subKey: 'physicality', w: 4 }],
    penalty_taking:[{ subKey: 'composure', w: 3 }, { subKey: 'decision', w: 2 }, { subKey: 'setPieces', w: 3 }],
    perception:    [{ subKey: 'vision', w: 6 }, { subKey: 'decision', w: 4 }],
    jumping:       [{ subKey: 'jumping', w: 3 }, { subKey: 'speed', w: 2 }],
    control:       [{ subKey: 'ballControl', w: 7 }, { subKey: 'dribbling', w: 7 }],
  },
  RM: {
    passing:       [{ subKey: 'passing', w: 7 }, { subKey: 'vision', w: 4 }],
    shooting:      [{ subKey: 'shooting', w: 5 }, { subKey: 'setPieces', w: 3 }],
    tackling:      [{ subKey: 'tackling', w: 4 }, { subKey: 'physicality', w: 2 }],
    saving:        [{ subKey: 'ballControl', w: 1 }],
    agility:       [{ subKey: 'speed', w: 8 }, { subKey: 'dribbling', w: 4 }],
    strength:      [{ subKey: 'strength', w: 4 }, { subKey: 'physicality', w: 4 }],
    penalty_taking:[{ subKey: 'composure', w: 3 }, { subKey: 'decision', w: 2 }, { subKey: 'setPieces', w: 3 }],
    perception:    [{ subKey: 'vision', w: 6 }, { subKey: 'decision', w: 4 }],
    jumping:       [{ subKey: 'jumping', w: 3 }, { subKey: 'speed', w: 2 }],
    control:       [{ subKey: 'ballControl', w: 7 }, { subKey: 'dribbling', w: 7 }],
  },
  LW: {
    passing:       [{ subKey: 'passing', w: 6 }, { subKey: 'vision', w: 4 }],
    shooting:      [{ subKey: 'shooting', w: 7 }, { subKey: 'setPieces', w: 3 }],
    tackling:      [{ subKey: 'tackling', w: 1 }],
    saving:        [{ subKey: 'ballControl', w: 1 }],
    agility:       [{ subKey: 'speed', w: 9 }, { subKey: 'dribbling', w: 5 }],
    strength:      [{ subKey: 'strength', w: 3 }, { subKey: 'physicality', w: 3 }],
    penalty_taking:[{ subKey: 'composure', w: 3 }, { subKey: 'decision', w: 2 }, { subKey: 'setPieces', w: 3 }],
    perception:    [{ subKey: 'vision', w: 6 }, { subKey: 'decision', w: 4 }],
    jumping:       [{ subKey: 'jumping', w: 2 }, { subKey: 'speed', w: 2 }],
    control:       [{ subKey: 'ballControl', w: 8 }, { subKey: 'dribbling', w: 8 }],
  },
  RW: {
    passing:       [{ subKey: 'passing', w: 6 }, { subKey: 'vision', w: 4 }],
    shooting:      [{ subKey: 'shooting', w: 7 }, { subKey: 'setPieces', w: 3 }],
    tackling:      [{ subKey: 'tackling', w: 1 }],
    saving:        [{ subKey: 'ballControl', w: 1 }],
    agility:       [{ subKey: 'speed', w: 9 }, { subKey: 'dribbling', w: 5 }],
    strength:      [{ subKey: 'strength', w: 3 }, { subKey: 'physicality', w: 3 }],
    penalty_taking:[{ subKey: 'composure', w: 3 }, { subKey: 'decision', w: 2 }, { subKey: 'setPieces', w: 3 }],
    perception:    [{ subKey: 'vision', w: 6 }, { subKey: 'decision', w: 4 }],
    jumping:       [{ subKey: 'jumping', w: 2 }, { subKey: 'speed', w: 2 }],
    control:       [{ subKey: 'ballControl', w: 8 }, { subKey: 'dribbling', w: 8 }],
  },
  ST: {
    passing:       [{ subKey: 'passing', w: 5 }, { subKey: 'vision', w: 3 }],
    shooting:      [{ subKey: 'shooting', w: 9 }, { subKey: 'setPieces', w: 2 }],
    tackling:      [{ subKey: 'tackling', w: 1 }],
    saving:        [{ subKey: 'ballControl', w: 1 }],
    agility:       [{ subKey: 'speed', w: 6 }, { subKey: 'dribbling', w: 4 }],
    strength:      [{ subKey: 'strength', w: 5 }, { subKey: 'physicality', w: 5 }],
    penalty_taking:[{ subKey: 'composure', w: 5 }, { subKey: 'decision', w: 3 }, { subKey: 'shooting', w: 2 }],
    perception:    [{ subKey: 'vision', w: 4 }, { subKey: 'decision', w: 5 }],
    jumping:       [{ subKey: 'jumping', w: 6 }, { subKey: 'physicality', w: 2 }],
    control:       [{ subKey: 'ballControl', w: 7 }, { subKey: 'dribbling', w: 6 }],
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Map 15 sub-attributes → 10 engine skills for the given position.
 *
 * @param {object} attrs — { dribbling: 75, passing: 68, … } (0-100 each)
 * @param {string} position — e.g. 'ST', 'CM', 'GK'
 * @returns {object} engine-ready skills: { passing, shooting, tackling,
 *   saving, agility, strength, penalty_taking, perception, jumping, control,
 *   fitness }
 */
export function mapToEngineSkills(attrs, position) {
  const posMap = MAPPING[position] || MAPPING['CM'];
  const skills = {};

  for (const [skillKey, entries] of Object.entries(posMap)) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const { subKey, w } of entries) {
      const val = attrs[subKey] || 0;
      weightedSum += val * w;
      totalWeight += w;
    }
    const raw = totalWeight > 0 ? weightedSum / totalWeight : 50;
    skills[skillKey] = Math.round(Math.max(0, Math.min(100, raw)));
  }

  // Fitness is derived from stamina sub-attribute (direct 1:1)
  skills.fitness = Math.round(Math.max(1, Math.min(100, attrs.stamina || 50)));

  // Crossing — a distinct skill so wide players' crosses use their own stat
  // (ballMovement.ballCrossed reads skill.crossing, falling back to passing).
  // Blends passing + ball control + vision, boosted for wide players who
  // specialise in it. LWB/RWB (formation positions) count as wide too.
  const widePositions = ['LB', 'RB', 'LWB', 'RWB', 'LM', 'RM', 'LW', 'RW'];
  const isWide = widePositions.includes(position);
  const crossingRaw =
    ((attrs.passing || 0) * 0.55 + (attrs.ballControl || 0) * 0.25 + (attrs.vision || 0) * 0.20)
    * (isWide ? 1.05 : 0.85)
    + (isWide ? 5 : 0);
  skills.crossing = Math.round(Math.max(0, Math.min(100, crossingRaw)));

  return skills;
}

/**
 * Convert leadership sub-attribute into an intent modifier for the engine.
 *
 * High leadership → team is more likely to stay composed under pressure.
 * Returns a float in [-0.3, 0.3] that can be added to intent weights.
 *
 * @param {number} leadership — 0-100
 * @returns {number} intent modifier
 */
export function mapLeadershipToIntent(leadership) {
  const raw = (leadership - 50) / 100;
  return Math.max(-0.3, Math.min(0.3, raw));
}

/**
 * Compute sub-attribute growth deltas from a match rating.
 *
 * Only triggers when rating exceeds 7.0. Growth amount scales with rating
 * and is weighted by position importance. Remaining potential ceiling is
 * respected so players cannot exceed their hidden potential.
 *
 * @param {number} rating        — final match rating (0-10)
 * @param {string} position      — e.g. 'ST', 'CM', 'GK'
 * @param {object} existingAttrs — current sub-attribute values (0-100)
 * @param {number} potential     — hidden potential ceiling (0-100)
 * @returns {object} { key: delta, … } — each delta is an integer
 */
export function mapGrowthToSubAttrs(rating, position, existingAttrs, potential) {
  const posWeights = _getPosSubWeights(position);
  const altPotential = potential != null ? potential : 80;

  // No growth for poor or average performances
  if (rating <= 7.0) return {};

  // Rating → growth budget (higher rating = more growth)
  // 7.1-7.5 → ~2 points, 8.0-8.5 → ~5 points, 9.0-9.5 → ~10 points, 10.0 → ~15 points
  const growthBudget = Math.round(Math.pow((rating - 7.0) * 3.3, 1.5));
  if (growthBudget <= 0) return {};

  const avgAttr = _avgAttrs(existingAttrs);
  const gap = Math.max(0, altPotential - avgAttr);

  // Dampen if already near potential
  let dampener = 1.0;
  if (gap < 5) dampener = 0.1;
  else if (gap < 15) dampener = 0.4;
  else if (gap < 25) dampener = 0.7;

  const adjustedBudget = growthBudget * dampener;
  if (adjustedBudget <= 0) return {};

  // Distribute budget across sub-attributes by position importance
  const deltas = {};
  let totalW = 0;
  for (const w of Object.values(posWeights)) totalW += w;

  let distributedTotal = 0;
  for (const [key, w] of Object.entries(posWeights)) {
    const share = (w / totalW) * adjustedBudget;
    // ±20% random jitter (deterministic testability: use key hash instead of RNG)
    const jitter = 0.8 + (simpleHash(key + String(rating)) % 40) / 100;
    const delta = Math.round(Math.max(0, share * jitter));
    const current = existingAttrs[key] || 0;
    const capped = Math.min(100, current + delta) - current;
    if (capped > 0) {
      deltas[key] = capped;
      distributedTotal += capped;
    }
  }

  // If nothing distributed, give at least 1 point to the top-weighted sub-attr
  if (distributedTotal === 0 && adjustedBudget >= 1) {
    const topKey = Object.entries(posWeights).sort((a, b) => b[1] - a[1])[0][0];
    const current = existingAttrs[topKey] || 0;
    if (current < 100) deltas[topKey] = 1;
  }

  return deltas;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function _getPosSubWeights(pos) {
  const posMap = MAPPING[pos] || MAPPING['CM'];
  // Aggregate mapping weights back into sub-attribute importance
  const weights = {};
  for (const entries of Object.values(posMap)) {
    for (const { subKey, w } of entries) {
      weights[subKey] = (weights[subKey] || 0) + w;
    }
  }
  // Ensure all 15 keys exist
  for (const key of Object.keys(SUB_ATTRS)) {
    if (!weights[key]) weights[key] = 1;
  }
  return weights;
}

function _avgAttrs(attrs) {
  const keys = Object.keys(SUB_ATTRS);
  let sum = 0;
  for (const key of keys) {
    sum += attrs[key] || 0;
  }
  return sum / keys.length;
}

/** Tiny deterministic hash for pseudo-random jitter. */
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Post-match attribute growth — maps a match rating into growth deltas over
// the 46 vendor PlayerAttributes (1-20 scale). Pure function layer, no state.
//
// Public API:
//   mapGrowthToAttributes(rating, position, existingAttrs, potential)
//     → { key: delta, … } growth deltas over the 46 vendor keys

import { ATTRIBUTE_KEYS, weightsFor } from './attributes.js';

/**
 * Compute growth deltas over the 46 vendor attributes from a match rating.
 *
 * Only triggers when rating exceeds 7.0. Growth amount scales with rating and
 * is weighted by position archetype importance; the hidden potential ceiling
 * is respected. One rating point maps to a handful of distributed 1-20 units
 * across the (larger) 46-key set.
 *
 * @param {number} rating        — final match rating (0-10)
 * @param {string} position      — e.g. 'ST', 'CM', 'GK'
 * @param {object} existingAttrs — current 46-key attribute values (1-20)
 * @param {number} potential     — hidden potential ceiling (1-20)
 * @returns {object} { key: delta, … } — each delta is an integer
 */
export function mapGrowthToAttributes(rating, position, existingAttrs, potential) {
  const weights = weightsFor(position);
  const altPotential = potential != null ? potential : 16;

  // No growth for poor or average performances
  if (rating <= 7.0) return {};

  // Rating → growth budget (1-20 scale). ×3 vs the old 15-key system because
  // the budget is now spread across 46 keys.
  const growthBudget = (Math.pow((rating - 7.0) * 3.3, 1.5) / 5) * 3;
  if (growthBudget <= 0) return {};

  const avgAttr = _avgAttrs(existingAttrs);
  const gap = Math.max(0, altPotential - avgAttr);

  // Dampen if already near potential (1-20 gaps)
  let dampener = 1.0;
  if (gap < 1) dampener = 0.1;
  else if (gap < 3) dampener = 0.4;
  else if (gap < 5) dampener = 0.7;

  const adjustedBudget = growthBudget * dampener;
  if (adjustedBudget <= 0) return {};

  // Distribute budget across the 46 keys by position importance
  const deltas = {};
  let totalW = 0;
  for (const key of ATTRIBUTE_KEYS) totalW += weights[key] || 1;

  let distributedTotal = 0;
  for (const key of ATTRIBUTE_KEYS) {
    const w = weights[key] || 1;
    const share = (w / totalW) * adjustedBudget;
    // ±20% deterministic jitter (key hash instead of RNG, for testability)
    const jitter = 0.8 + (simpleHash(key + String(rating)) % 40) / 100;
    const delta = Math.round(Math.max(0, share * jitter));
    const current = existingAttrs[key] || 0;
    const capped = Math.min(20, current + delta) - current;
    if (capped > 0) {
      deltas[key] = capped;
      distributedTotal += capped;
    }
  }

  // If nothing distributed, give at least 1 point to the top-weighted key
  if (distributedTotal === 0 && adjustedBudget >= 1) {
    const topKey = ATTRIBUTE_KEYS.slice().sort((a, b) => (weights[b] || 0) - (weights[a] || 0))[0];
    const current = existingAttrs[topKey] || 0;
    if (current < 20) deltas[topKey] = 1;
  }

  return deltas;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function _avgAttrs(attrs) {
  let sum = 0;
  for (const key of ATTRIBUTE_KEYS) {
    sum += attrs[key] || 0;
  }
  return sum / ATTRIBUTE_KEYS.length;
}

/** Tiny deterministic hash for pseudo-random jitter. */
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

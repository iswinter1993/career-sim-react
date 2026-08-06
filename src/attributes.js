// Player sub-attribute system for career-sim-react.
// Maintains 15 sub-attributes (Technical/Physical/Mental) in a module-level
// closure, queried through the SIM bridge layer.
//
// Lifecycle:
//   initAttributes(identity, seed)   — called at START_CAREER
//   tickAttributes(currentOvr, age, pos, attrs) — called at NEXT_STEP
//
// Public interface:
//   getAttributes()          → current attrs object (or null)
//   getCategory(attrs, cat)  → weighted integer for tech/phys/mental
//   getWeights(pos)          → { sub, cat } position weight matrices
//   getOVRFromAttributes(attrs, pos) → approximate OVR (0-99)
//   getPotential(attrs)      → hidden potential value (0-20)
//   getDevCurve(attrs)       → 'early' | 'steady' | 'late'
//   initAttributes(identity, seed)   → fresh attrs, stores internally
//   tickAttributes(currentOvr, age, pos, attrs) → updated attrs

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32)
// ---------------------------------------------------------------------------

/**
 * Hash an arbitrary seed string into a 32-bit unsigned integer.
 * Same seed always produces the same hash — determinism is the point.
 */
function hashSeed(seed) {
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/**
 * Mulberry32 — fast, high-quality 32-bit PRNG.
 * Returns a function that yields numbers in [0, 1).
 */
function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Data Model
// ---------------------------------------------------------------------------

/** Every sub-attribute: key → { label (Chinese display name), category }. */
export const SUB_ATTRS = {
  // 技术 Technical (6)
  dribbling:   { label: '盘带',   cat: 'tech' },
  passing:     { label: '传球',   cat: 'tech' },
  shooting:    { label: '射门',   cat: 'tech' },
  ballControl: { label: '控球',   cat: 'tech' },
  tackling:    { label: '抢断',   cat: 'tech' },
  setPieces:   { label: '定位球', cat: 'tech' },
  // 身体 Physical (5)
  speed:       { label: '速度',   cat: 'phys' },
  strength:    { label: '力量',   cat: 'phys' },
  stamina:     { label: '耐力',   cat: 'phys' },
  jumping:     { label: '弹跳',   cat: 'phys' },
  physicality: { label: '对抗',   cat: 'phys' },
  // 精神 Mental (4)
  vision:      { label: '视野',   cat: 'mental' },
  composure:   { label: '冷静',   cat: 'mental' },
  decision:    { label: '决断',   cat: 'mental' },
  leadership:  { label: '领导力', cat: 'mental' },
};

export const CATEGORIES = ['tech', 'phys', 'mental'];

export const CAT_LABELS = {
  tech: '技术',
  phys: '身体',
  mental: '精神',
};

const SUB_KEYS = Object.keys(SUB_ATTRS);

// ---------------------------------------------------------------------------
// Position Weight Matrices
// ---------------------------------------------------------------------------
//
// Each position defines two things:
//   sub  — 0-10 importance for each of the 15 sub-attributes.
//   cat  — how much each of the 3 categories contributes to OVR (sums to 1).
//
// Design rationale: 10 = core skill for this position, 2 = largely irrelevant.
// These weights are coarse but deliberate — a ST with 10 shooting and 2 tackling
// feels right; a CB with 9 tackling and 2 shooting likewise.

const POSITION_WEIGHTS = {
  GK: {
    sub: {
      dribbling: 2, passing: 4, shooting: 1, ballControl: 2, tackling: 2, setPieces: 4,
      speed: 3, strength: 5, stamina: 3, jumping: 10, physicality: 5,
      vision: 5, composure: 9, decision: 9, leadership: 8,
    },
    cat: { tech: 0.22, phys: 0.40, mental: 0.38 },
  },
  CB: {
    sub: {
      dribbling: 4, passing: 5, shooting: 2, ballControl: 4, tackling: 10, setPieces: 2,
      speed: 6, strength: 9, stamina: 6, jumping: 9, physicality: 9,
      vision: 5, composure: 8, decision: 8, leadership: 7,
    },
    cat: { tech: 0.28, phys: 0.42, mental: 0.30 },
  },
  LB: {
    sub: {
      dribbling: 6, passing: 7, shooting: 3, ballControl: 6, tackling: 7, setPieces: 4,
      speed: 9, strength: 5, stamina: 9, jumping: 4, physicality: 6,
      vision: 6, composure: 6, decision: 7, leadership: 4,
    },
    cat: { tech: 0.33, phys: 0.38, mental: 0.29 },
  },
  RB: {
    sub: {
      dribbling: 6, passing: 7, shooting: 3, ballControl: 6, tackling: 7, setPieces: 4,
      speed: 9, strength: 5, stamina: 9, jumping: 4, physicality: 6,
      vision: 6, composure: 6, decision: 7, leadership: 4,
    },
    cat: { tech: 0.33, phys: 0.38, mental: 0.29 },
  },
  CDM: {
    sub: {
      dribbling: 6, passing: 7, shooting: 4, ballControl: 6, tackling: 9, setPieces: 4,
      speed: 6, strength: 8, stamina: 8, jumping: 6, physicality: 8,
      vision: 7, composure: 8, decision: 8, leadership: 6,
    },
    cat: { tech: 0.32, phys: 0.36, mental: 0.32 },
  },
  CM: {
    sub: {
      dribbling: 7, passing: 9, shooting: 6, ballControl: 7, tackling: 6, setPieces: 5,
      speed: 6, strength: 6, stamina: 8, jumping: 4, physicality: 6,
      vision: 9, composure: 7, decision: 8, leadership: 6,
    },
    cat: { tech: 0.38, phys: 0.30, mental: 0.32 },
  },
  CAM: {
    sub: {
      dribbling: 9, passing: 9, shooting: 8, ballControl: 9, tackling: 3, setPieces: 6,
      speed: 7, strength: 4, stamina: 6, jumping: 3, physicality: 4,
      vision: 10, composure: 7, decision: 8, leadership: 5,
    },
    cat: { tech: 0.42, phys: 0.22, mental: 0.36 },
  },
  LM: {
    sub: {
      dribbling: 8, passing: 8, shooting: 5, ballControl: 8, tackling: 5, setPieces: 5,
      speed: 9, strength: 5, stamina: 9, jumping: 4, physicality: 5,
      vision: 7, composure: 6, decision: 6, leadership: 4,
    },
    cat: { tech: 0.37, phys: 0.36, mental: 0.27 },
  },
  RM: {
    sub: {
      dribbling: 8, passing: 8, shooting: 5, ballControl: 8, tackling: 5, setPieces: 5,
      speed: 9, strength: 5, stamina: 9, jumping: 4, physicality: 5,
      vision: 7, composure: 6, decision: 6, leadership: 4,
    },
    cat: { tech: 0.37, phys: 0.36, mental: 0.27 },
  },
  LW: {
    sub: {
      dribbling: 10, passing: 7, shooting: 7, ballControl: 9, tackling: 2, setPieces: 4,
      speed: 10, strength: 4, stamina: 7, jumping: 3, physicality: 4,
      vision: 7, composure: 6, decision: 6, leadership: 3,
    },
    cat: { tech: 0.38, phys: 0.32, mental: 0.30 },
  },
  RW: {
    sub: {
      dribbling: 10, passing: 7, shooting: 7, ballControl: 9, tackling: 2, setPieces: 4,
      speed: 10, strength: 4, stamina: 7, jumping: 3, physicality: 4,
      vision: 7, composure: 6, decision: 6, leadership: 3,
    },
    cat: { tech: 0.38, phys: 0.32, mental: 0.30 },
  },
  ST: {
    sub: {
      dribbling: 8, passing: 6, shooting: 10, ballControl: 8, tackling: 2, setPieces: 4,
      speed: 8, strength: 7, stamina: 6, jumping: 7, physicality: 7,
      vision: 6, composure: 8, decision: 7, leadership: 4,
    },
    cat: { tech: 0.40, phys: 0.34, mental: 0.26 },
  },
};

// ---------------------------------------------------------------------------
// Module State
// ---------------------------------------------------------------------------

let _currentAttrs = null;
let _lastEngineOvr = null;
let _rng = null; // seeded PRNG instance, set during initAttributes

// ---------------------------------------------------------------------------
// Public API — Query
// ---------------------------------------------------------------------------

/** Return the current player attribute object (or null before init). */
export function getAttributes() {
  return _currentAttrs;
}

/**
 * Weighted integer value for one category.
 * @param {object} attrs — the attrs object from getAttributes()
 * @param {'tech'|'phys'|'mental'} category
 * @returns {number} 0-20
 */
export function getCategory(attrs, category) {
  if (!attrs) return 0;
  const weights = _posWeights(attrs._pos);
  const subW = weights.sub;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const key of SUB_KEYS) {
    if (SUB_ATTRS[key].cat === category) {
      const w = subW[key] || 1;
      weightedSum += (attrs[key] || 0) * w;
      totalWeight += w;
    }
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

/**
 * Return the full weight matrices for a position.
 * @param {string} pos — e.g. 'ST', 'CM', 'GK'
 * @returns {{ sub: object, cat: object }}
 */
export function getWeights(pos) {
  return _posWeights(pos);
}

/**
 * Approximate OVR (0-99) derived from sub-attributes and position weights.
 *
 * The category weights and a 5× scalar map the 0-20 category scores into
 * the engine's 0-99 OVR space.  This is deliberately an *approximation* —
 * it tracks the engine's trend but won't match exactly.
 *
 * @param {object} attrs
 * @param {string} [pos] — falls back to attrs._pos
 * @returns {number} 0-99
 */
export function getOVRFromAttributes(attrs, pos) {
  if (!attrs) return 0;
  const weights = _posWeights(pos || attrs._pos);
  const catW = weights.cat;
  let ovr = 0;
  for (const cat of CATEGORIES) {
    ovr += getCategory(attrs, cat) * (catW[cat] || 0.33) * 5;
  }
  return Math.round(Math.min(99, Math.max(0, ovr)));
}

/**
 * Hidden potential value set at creation time.
 * @param {object} attrs
 * @returns {number|null} 0-20, or null if not initialised
 */
export function getPotential(attrs) {
  return attrs ? attrs._potential : null;
}

/**
 * Development curve type set at creation time.
 * @param {object} attrs
 * @returns {'early'|'steady'|'late'|null}
 */
export function getDevCurve(attrs) {
  return attrs ? attrs._devCurve : null;
}

// ---------------------------------------------------------------------------
// Public API — Lifecycle
// ---------------------------------------------------------------------------

/**
 * Create a fresh attributes object for a new career.
 *
 * Generation is seed-driven so the same seed + identity always produces the
 * same initial values and the same PRNG stream for future ticks.
 *
 * Process:
 *   1. Seed the PRNG with seed + name + position.
 *   2. Roll devCurve (early 30% / steady 50% / late 20%).
 *   3. Roll potential (range varies by devCurve).
 *   4. For each sub-attribute: base = posWeight × 1.5, then ±4 uniform jitter,
 *      clamped to [0, 20].
 *
 * @param {object} identity — { name, pos, … }
 * @param {string} seed    — player-chosen or system-generated seed
 * @param {number} [currentOvr] — engine OVR at creation (age 16 baseline). When
 *   provided, the first tickAttributes call computes a real delta instead of 0,
 *   so the age-16→17 growth is not lost.
 * @returns {object} the fresh attrs object (also stored internally)
 */
export function initAttributes(identity, seed, currentOvr) {
  const pos = identity?.pos || 'CM';
  const weights = _posWeights(pos);
  const subW = weights.sub;

  // Deterministic PRNG from the compound seed
  const seedStr = String(seed) + '|' + (identity?.name || '') + '|' + pos;
  _rng = mulberry32(hashSeed(seedStr));

  // --- devCurve roll (~30/50/20 split) ---
  const curveRoll = _rng();
  let devCurve;
  if (curveRoll < 0.30) {
    devCurve = 'early';
  } else if (curveRoll < 0.80) {
    devCurve = 'steady';
  } else {
    devCurve = 'late';
  }

  // --- potential roll (higher floor for late bloomers) ---
  let potBase;
  switch (devCurve) {
    case 'early':  potBase = 10 + _rng() * 7; break;  // 10–17
    case 'steady': potBase = 11 + _rng() * 8; break;  // 11–19
    case 'late':   potBase = 13 + _rng() * 7; break;  // 13–20
    default:       potBase = 12 + _rng() * 7; break;
  }
  const potential = Math.min(20, Math.round(potBase));

  // --- initial sub-attribute values ---
  const attrs = { _pos: pos, _potential: potential, _devCurve: devCurve };

  for (const key of SUB_KEYS) {
    const w = subW[key] || 5;
    // Base anchored to position weight: weight 10 → ~15, weight 2 → ~3
    const base = w * 1.5;
    // Uniform jitter of ±4 to make different seeds feel genuinely different
    const jitter = (_rng() - 0.5) * 8;
    const raw = base + jitter;
    attrs[key] = Math.max(0, Math.min(20, Math.round(raw)));
  }

  _currentAttrs = attrs;
  // Anchor the engine-OVR baseline so the first tick gets a real delta.
  _lastEngineOvr = currentOvr != null ? currentOvr : null;
  return attrs;
}

/**
 * Evolve attributes by one season, anchored to the engine's OVR delta.
 *
 * Call this after SIM.nextStep() produces a new engine OVR.
 *
 * Growth rules (per devCurve):
 *   early  — 1.5× growth at 16-20, 1.2× at 21-24, decline from 26
 *   steady — 1.2× to 24, 1.1× at 25-28, gentle decline from 30
 *   late   — 0.8× to 24, 1.3× at 25-28, 1.4× at 29-32, decline from 33
 *
 * The growth multiplier is damped when avg sub-attribute is close to the
 * hidden potential ceiling (prevents OVR-attribute decoupling).
 *
 * Engine ΔOVR is distributed across sub-attributes weighted by position
 * importance, with ±30% per-attribute jitter for believability.
 *
 * After peak age, physical attributes decline gradually while mental
 * attributes may still tick up (experience beats legs).
 *
 * @param {number} currentOvr — engine OVR *after* this season's tick
 * @param {number} age        — current player age
 * @param {string} pos        — current position
 * @param {object} [attrs]    — defaults to internal _currentAttrs
 * @returns {object} the updated attrs (also stored internally)
 */
export function tickAttributes(currentOvr, age, pos, attrs) {
  if (!attrs) attrs = _currentAttrs;
  if (!attrs) return null;

  const devCurve = attrs._devCurve || 'steady';
  const potential = attrs._potential != null ? attrs._potential : 14;

  // --- engine OVR delta (first tick sees delta=0, which is fine) ---
  let delta = 0;
  if (_lastEngineOvr != null) {
    delta = currentOvr - _lastEngineOvr;
  }
  _lastEngineOvr = currentOvr;

  // Update position if it changed
  if (pos && pos !== attrs._pos) {
    attrs._pos = pos;
  }

  // --- growth multiplier from dev curve × age ---
  let growthMultiplier = 1.0;
  switch (devCurve) {
    case 'early':
      if (age <= 20)      growthMultiplier = 1.5;
      else if (age <= 24) growthMultiplier = 1.2;
      else if (age <= 28) growthMultiplier = 0.8;
      else                growthMultiplier = 0.5;
      break;
    case 'steady':
      if (age <= 24)      growthMultiplier = 1.2;
      else if (age <= 28) growthMultiplier = 1.1;
      else if (age <= 32) growthMultiplier = 0.9;
      else                growthMultiplier = 0.6;
      break;
    case 'late':
      if (age <= 24)      growthMultiplier = 0.8;
      else if (age <= 28) growthMultiplier = 1.3;
      else if (age <= 32) growthMultiplier = 1.4;
      else                growthMultiplier = 0.7;
      break;
    default:
      break;
  }

  // --- dampen growth near potential ceiling ---
  if (delta > 0) {
    const avgAttr = _avgOfVisible(attrs);
    const gap = Math.max(0, potential - avgAttr);
    if (gap < 1)       growthMultiplier *= 0.2;
    else if (gap < 3)  growthMultiplier *= 0.6;
    else if (gap < 5)  growthMultiplier *= 0.85;
  }

  // --- distribute effective delta across sub-attributes ---
  const effectiveDelta = delta * growthMultiplier;
  if (effectiveDelta !== 0) {
    const weights = _posWeights(pos || attrs._pos);
    const subW = weights.sub;

    let totalW = 0;
    for (const key of SUB_KEYS) totalW += subW[key] || 1;

    // Scale: 1 OVR point ≈ 3 sub-attribute units distributed
    const totalDist = effectiveDelta * 3.0;

    for (const key of SUB_KEYS) {
      const w = subW[key] || 1;
      const share = (w / totalW) * totalDist;
      // ±30% per-key jitter so not every attribute moves in lockstep
      const jittered = share * (0.7 + (_rng ? _rng() : Math.random()) * 0.6);
      attrs[key] = Math.max(0, Math.min(20, Math.round(attrs[key] + jittered)));
    }
  }

  // --- age-related physical decline ---
  const declineAge = { early: 26, steady: 30, late: 33 }[devCurve] || 28;
  if (age > declineAge) {
    const rate = (age - declineAge) * 0.08;
    for (const key of SUB_KEYS) {
      if (SUB_ATTRS[key].cat === 'phys') {
        attrs[key] = Math.max(0, Math.round(attrs[key] - rate));
      }
    }
  }

  // --- mild mental growth from experience (caps at 20) ---
  for (const key of SUB_KEYS) {
    if (SUB_ATTRS[key].cat === 'mental' && attrs[key] < 20) {
      const bump = (_rng ? _rng() : Math.random()) * 0.25;
      attrs[key] = Math.min(20, attrs[key] + bump);
    }
  }

  _currentAttrs = attrs;
  return attrs;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/** Safe position-weight lookup with CM fallback. */
function _posWeights(pos) {
  return POSITION_WEIGHTS[pos] || POSITION_WEIGHTS['CM'];
}

/** Average of the 15 visible sub-attributes only (excludes _meta keys). */
function _avgOfVisible(attrs) {
  let sum = 0;
  for (const key of SUB_KEYS) {
    sum += attrs[key] || 0;
  }
  return sum / SUB_KEYS.length;
}

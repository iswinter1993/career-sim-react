// Player attribute system for career-sim-react — vendor-native 46-key model.
//
// The attribute model is now 1:1 with the vendor engine's `PlayerAttributes`
// (46 keys: 14 mental + 8 physical + 14 technical + 10 goalkeeper, all on the
// 1-20 FM-style scale). There is NO mapping layer anymore — vendor is the
// single source of truth. OVR is derived directly from `Player.ratingAverage()`.
//
// Lifecycle:
//   initAttributes(identity, seed, currentOvr) — called at START_CAREER
//   tickAttributes(currentOvr, age, pos, attrs)  — called at NEXT_STEP
//
// Public interface:
//   PLAYER_ATTRS / ATTRIBUTE_KEYS / CATEGORIES / CAT_LABELS / RATING_COMPONENTS
//   getKeysByCategory(cat)      → attribute keys in a category
//   positionEnumFor(pos)        → career position string → vendor Position enum
//   archetypeForVendorPosition(pe) → vendor Position enum → weight archetype
//   weightsFor(pos)             → full 46-key weight map for a career position
//   weightsForVendorPosition(pe)→ full 46-key weight map for a vendor Position
//   getAttributes()             → current attrs object (or null)
//   getRatingComponents(attrs, pos) → vendor Player.rating() components (0-100)
//   getOVRFromAttributes(attrs, pos) → vendor ratingAverage (0-99)
//   getPotential(attrs)         → hidden potential (1-20)
//   getDevCurve(attrs)          → 'early' | 'steady' | 'late'
//   initAttributes(...) / tickAttributes(...)

import Player from '../vendor/football-simulator/src/Player';
import {
  Position,
  defencePositions,
  midfieldPositions,
  attackPositions,
} from '../vendor/football-simulator/src/enums/Position';

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32)
// ---------------------------------------------------------------------------

function hashSeed(seed) {
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

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
// Data Model — the 46 vendor PlayerAttributes, with Chinese labels + category
// ---------------------------------------------------------------------------

/** Every vendor attribute: key → { label (Chinese), cat }. */
export const PLAYER_ATTRS = {
  // 心理 Mental (14)
  aggression:     { label: '侵略性',   cat: 'mental' },
  anticipation:   { label: '预判',     cat: 'mental' },
  bravery:        { label: '勇敢',     cat: 'mental' },
  composure:      { label: '冷静',     cat: 'mental' },
  concentration:  { label: '专注',     cat: 'mental' },
  decisions:      { label: '决断',     cat: 'mental' },
  determination:  { label: '意志',     cat: 'mental' },
  flair:          { label: '想象力',   cat: 'mental' },
  leadership:     { label: '领导力',   cat: 'mental' },
  offTheBall:     { label: '无球跑动', cat: 'mental' },
  positioning:    { label: '站位',     cat: 'mental' },
  teamwork:       { label: '团队合作', cat: 'mental' },
  vision:         { label: '视野',     cat: 'mental' },
  workRate:       { label: '工作投入', cat: 'mental' },
  // 身体 Physical (8)
  acceleration:   { label: '加速',     cat: 'physical' },
  agility:        { label: '敏捷',     cat: 'physical' },
  balance:        { label: '平衡',     cat: 'physical' },
  jumpingReach:   { label: '弹跳',     cat: 'physical' },
  naturalFitness: { label: '体质',     cat: 'physical' },
  pace:           { label: '速度',     cat: 'physical' },
  stamina:        { label: '耐力',     cat: 'physical' },
  strength:       { label: '力量',     cat: 'physical' },
  // 技术 Technical (14)
  corners:        { label: '角球',     cat: 'technical' },
  crossing:       { label: '传中',     cat: 'technical' },
  dribbling:      { label: '盘带',     cat: 'technical' },
  finishing:      { label: '射门',     cat: 'technical' },
  firstTouch:     { label: '停球',     cat: 'technical' },
  freeKickTaking: { label: '任意球',   cat: 'technical' },
  heading:        { label: '头球',     cat: 'technical' },
  longShots:      { label: '远射',     cat: 'technical' },
  longThrows:     { label: '界外球',   cat: 'technical' },
  marking:        { label: '盯人',     cat: 'technical' },
  passing:        { label: '传球',     cat: 'technical' },
  penaltyTaking:  { label: '点球',     cat: 'technical' },
  tackling:       { label: '抢断',     cat: 'technical' },
  technique:      { label: '技术',     cat: 'technical' },
  // 门将 Goalkeeper (10)
  aerialReach:    { label: '制空',     cat: 'goalkeeping' },
  commandOfArea:  { label: '控制禁区', cat: 'goalkeeping' },
  communication:  { label: '沟通',     cat: 'goalkeeping' },
  eccentricity:   { label: '即兴发挥', cat: 'goalkeeping' },
  handling:       { label: '手控球',   cat: 'goalkeeping' },
  oneOnOnes:      { label: '一对一',   cat: 'goalkeeping' },
  reflexes:       { label: '反应',     cat: 'goalkeeping' },
  rushingOut:     { label: '出击',     cat: 'goalkeeping' },
  tendencyToPunch:{ label: '拳击球',   cat: 'goalkeeping' },
  throwing:       { label: '手抛球',   cat: 'goalkeeping' },
};

export const CATEGORIES = ['mental', 'physical', 'technical', 'goalkeeping'];

export const CAT_LABELS = {
  mental: '心理',
  physical: '身体',
  technical: '技术',
  goalkeeping: '门将',
};

export const ATTRIBUTE_KEYS = Object.keys(PLAYER_ATTRS);

const MENTAL_KEYS = ATTRIBUTE_KEYS.filter((k) => PLAYER_ATTRS[k].cat === 'mental');
const PHYSICAL_KEYS = ATTRIBUTE_KEYS.filter((k) => PLAYER_ATTRS[k].cat === 'physical');

/** vendor `rating()` 的分量标签，用于属性面板六维雷达。 */
export const RATING_COMPONENTS = {
  outfield: [
    { key: 'pace',      label: '速度' },
    { key: 'shooting',  label: '射门' },
    { key: 'passing',   label: '传球' },
    { key: 'dribbling', label: '盘带' },
    { key: 'defending', label: '防守' },
    { key: 'physique',  label: '身体' },
  ],
  gk: [
    { key: 'diving',     label: '扑救' },
    { key: 'hands',      label: '手控球' },
    { key: 'kicking',    label: '开球' },
    { key: 'reflexes',   label: '反应' },
    { key: 'speed',      label: '速度' },
    { key: 'positioning', label: '站位' },
  ],
};

// ---------------------------------------------------------------------------
// Position → vendor enum + weight archetype
// ---------------------------------------------------------------------------

/**
 * Career position string → vendor Position enum.
 * CAM → CM：vendor 把 COM 归入 attackPositions（会落到单前锋线），映射到 CM
 * 才会落到 4-2-3-1 / 4-4-2 的前腰线。
 */
const POSITION_ENUM = {
  GK: Position.GK,
  CB: Position.CB,
  LB: Position.LB,
  RB: Position.RB,
  CDM: Position.DM,
  CM: Position.CM,
  CAM: Position.CM,
  LM: Position.LM,
  RM: Position.RM,
  LW: Position.LW,
  RW: Position.RW,
  ST: Position.ST,
};

const POSITION_ARCHETYPE = {
  GK: 'GK',
  CB: 'CB',
  LB: 'FB',
  RB: 'FB',
  CDM: 'DM',
  CM: 'CM',
  CAM: 'CAM',
  LM: 'WM',
  RM: 'WM',
  LW: 'WING',
  RW: 'WING',
  ST: 'ST',
};

export function positionEnumFor(pos) {
  return POSITION_ENUM[pos] ?? Position.CM;
}

export function archetypeFor(pos) {
  return POSITION_ARCHETYPE[pos] || 'CM';
}

/** Map a vendor Position enum → weight archetype (for generated squad players). */
export function archetypeForVendorPosition(pe) {
  if (pe === Position.GK) return 'GK';
  if (pe === Position.LWB || pe === Position.RWB) return 'FB';
  if (defencePositions.includes(pe)) {
    return (pe === Position.LB || pe === Position.RB) ? 'FB' : 'CB';
  }
  if (midfieldPositions.includes(pe)) {
    if (pe === Position.LDM || pe === Position.DM || pe === Position.RDM) return 'DM';
    if (pe === Position.LM || pe === Position.RM) return 'WM';
    return 'CM';
  }
  if (pe === Position.LW || pe === Position.RW) return 'WING';
  if (pe === Position.LCOM || pe === Position.COM || pe === Position.RCOM) return 'CAM';
  return 'ST'; // LF / CF / RF / ST
}

// ---------------------------------------------------------------------------
// Position weight archetypes (46 keys, weight 1-10; default 5)
// ---------------------------------------------------------------------------

const DEFAULT_WEIGHT = 5;

// Override maps per archetype. Any key not listed defaults to DEFAULT_WEIGHT.
const ARCHETYPE_WEIGHTS = {
  GK: {
    aggression: 4, anticipation: 9, bravery: 7, composure: 9, concentration: 9,
    decisions: 9, determination: 6, flair: 2, leadership: 7, offTheBall: 2,
    positioning: 10, teamwork: 6, vision: 7, workRate: 5,
    acceleration: 6, agility: 9, balance: 8, jumpingReach: 9, naturalFitness: 7,
    pace: 6, stamina: 6, strength: 8,
    corners: 2, crossing: 2, dribbling: 3, finishing: 2, firstTouch: 6,
    freeKickTaking: 3, heading: 3, longShots: 3, longThrows: 3, marking: 2,
    passing: 7, penaltyTaking: 2, tackling: 2, technique: 4,
    aerialReach: 9, commandOfArea: 9, communication: 9, eccentricity: 5,
    handling: 10, oneOnOnes: 10, reflexes: 10, rushingOut: 8,
    tendencyToPunch: 6, throwing: 8,
  },
  CB: {
    aggression: 8, anticipation: 9, bravery: 8, composure: 8, concentration: 9,
    decisions: 8, determination: 6, flair: 2, leadership: 7, offTheBall: 3,
    positioning: 10, teamwork: 7, vision: 5, workRate: 6,
    acceleration: 6, agility: 5, balance: 7, jumpingReach: 9, naturalFitness: 6,
    pace: 6, stamina: 6, strength: 9,
    corners: 2, crossing: 3, dribbling: 4, finishing: 2, firstTouch: 5,
    freeKickTaking: 2, heading: 9, longShots: 2, longThrows: 4, marking: 10,
    passing: 6, penaltyTaking: 2, tackling: 10, technique: 4,
    aerialReach: 3, commandOfArea: 3, communication: 4, eccentricity: 1,
    handling: 2, oneOnOnes: 2, reflexes: 2, rushingOut: 2,
    tendencyToPunch: 1, throwing: 3,
  },
  FB: {
    aggression: 6, anticipation: 8, bravery: 6, composure: 7, concentration: 8,
    decisions: 7, determination: 5, flair: 4, leadership: 4, offTheBall: 5,
    positioning: 8, teamwork: 7, vision: 6, workRate: 9,
    acceleration: 9, agility: 7, balance: 7, jumpingReach: 5, naturalFitness: 6,
    pace: 9, stamina: 9, strength: 6,
    corners: 4, crossing: 9, dribbling: 6, finishing: 3, firstTouch: 6,
    freeKickTaking: 4, heading: 5, longShots: 4, longThrows: 6, marking: 8,
    passing: 7, penaltyTaking: 3, tackling: 8, technique: 6,
    aerialReach: 3, commandOfArea: 2, communication: 3, eccentricity: 1,
    handling: 2, oneOnOnes: 2, reflexes: 2, rushingOut: 2,
    tendencyToPunch: 1, throwing: 3,
  },
  DM: {
    aggression: 7, anticipation: 9, bravery: 7, composure: 8, concentration: 9,
    decisions: 8, determination: 6, flair: 3, leadership: 6, offTheBall: 4,
    positioning: 9, teamwork: 8, vision: 7, workRate: 8,
    acceleration: 6, agility: 6, balance: 7, jumpingReach: 6, naturalFitness: 7,
    pace: 6, stamina: 8, strength: 8,
    corners: 3, crossing: 4, dribbling: 5, finishing: 3, firstTouch: 6,
    freeKickTaking: 3, heading: 6, longShots: 4, longThrows: 4, marking: 8,
    passing: 8, penaltyTaking: 3, tackling: 9, technique: 6,
    aerialReach: 3, commandOfArea: 3, communication: 4, eccentricity: 1,
    handling: 2, oneOnOnes: 2, reflexes: 2, rushingOut: 2,
    tendencyToPunch: 1, throwing: 3,
  },
  CM: {
    aggression: 5, anticipation: 8, bravery: 5, composure: 8, concentration: 8,
    decisions: 9, determination: 6, flair: 6, leadership: 5, offTheBall: 6,
    positioning: 7, teamwork: 8, vision: 9, workRate: 8,
    acceleration: 6, agility: 6, balance: 7, jumpingReach: 4, naturalFitness: 7,
    pace: 6, stamina: 8, strength: 6,
    corners: 5, crossing: 5, dribbling: 7, finishing: 5, firstTouch: 8,
    freeKickTaking: 5, heading: 4, longShots: 7, longThrows: 3, marking: 5,
    passing: 9, penaltyTaking: 5, tackling: 6, technique: 8,
    aerialReach: 3, commandOfArea: 3, communication: 4, eccentricity: 1,
    handling: 2, oneOnOnes: 2, reflexes: 2, rushingOut: 2,
    tendencyToPunch: 1, throwing: 3,
  },
  CAM: {
    aggression: 3, anticipation: 8, bravery: 3, composure: 8, concentration: 7,
    decisions: 8, determination: 5, flair: 9, leadership: 4, offTheBall: 8,
    positioning: 6, teamwork: 6, vision: 10, workRate: 6,
    acceleration: 7, agility: 8, balance: 7, jumpingReach: 3, naturalFitness: 5,
    pace: 7, stamina: 6, strength: 4,
    corners: 6, crossing: 6, dribbling: 9, finishing: 7, firstTouch: 9,
    freeKickTaking: 6, heading: 3, longShots: 8, longThrows: 2, marking: 3,
    passing: 9, penaltyTaking: 6, tackling: 3, technique: 9,
    aerialReach: 2, commandOfArea: 2, communication: 3, eccentricity: 1,
    handling: 2, oneOnOnes: 2, reflexes: 2, rushingOut: 2,
    tendencyToPunch: 1, throwing: 2,
  },
  WM: {
    aggression: 5, anticipation: 7, bravery: 5, composure: 7, concentration: 7,
    decisions: 7, determination: 5, flair: 7, leadership: 4, offTheBall: 7,
    positioning: 7, teamwork: 7, vision: 7, workRate: 9,
    acceleration: 9, agility: 8, balance: 7, jumpingReach: 4, naturalFitness: 7,
    pace: 9, stamina: 9, strength: 5,
    corners: 6, crossing: 9, dribbling: 8, finishing: 5, firstTouch: 7,
    freeKickTaking: 5, heading: 4, longShots: 5, longThrows: 5, marking: 5,
    passing: 7, penaltyTaking: 4, tackling: 5, technique: 8,
    aerialReach: 2, commandOfArea: 2, communication: 3, eccentricity: 1,
    handling: 2, oneOnOnes: 2, reflexes: 2, rushingOut: 2,
    tendencyToPunch: 1, throwing: 3,
  },
  WING: {
    aggression: 3, anticipation: 7, bravery: 3, composure: 8, concentration: 6,
    decisions: 7, determination: 5, flair: 9, leadership: 3, offTheBall: 9,
    positioning: 5, teamwork: 6, vision: 7, workRate: 7,
    acceleration: 10, agility: 9, balance: 8, jumpingReach: 4, naturalFitness: 6,
    pace: 10, stamina: 7, strength: 4,
    corners: 5, crossing: 7, dribbling: 10, finishing: 8, firstTouch: 8,
    freeKickTaking: 5, heading: 4, longShots: 7, longThrows: 2, marking: 2,
    passing: 7, penaltyTaking: 5, tackling: 2, technique: 9,
    aerialReach: 2, commandOfArea: 2, communication: 2, eccentricity: 1,
    handling: 2, oneOnOnes: 2, reflexes: 2, rushingOut: 2,
    tendencyToPunch: 1, throwing: 2,
  },
  ST: {
    aggression: 6, anticipation: 8, bravery: 6, composure: 9, concentration: 7,
    decisions: 8, determination: 6, flair: 7, leadership: 4, offTheBall: 10,
    positioning: 6, teamwork: 6, vision: 6, workRate: 6,
    acceleration: 8, agility: 7, balance: 8, jumpingReach: 7, naturalFitness: 6,
    pace: 8, stamina: 6, strength: 7,
    corners: 3, crossing: 3, dribbling: 8, finishing: 10, firstTouch: 9,
    freeKickTaking: 5, heading: 8, longShots: 7, longThrows: 2, marking: 2,
    passing: 6, penaltyTaking: 8, tackling: 2, technique: 8,
    aerialReach: 3, commandOfArea: 2, communication: 3, eccentricity: 1,
    handling: 2, oneOnOnes: 2, reflexes: 2, rushingOut: 2,
    tendencyToPunch: 1, throwing: 2,
  },
};

/** Full 46-key weight map for an archetype (defaults filled in). */
function weightsForArchetype(arch) {
  const src = ARCHETYPE_WEIGHTS[arch] || ARCHETYPE_WEIGHTS.CM;
  const full = {};
  for (const key of ATTRIBUTE_KEYS) {
    full[key] = src[key] ?? DEFAULT_WEIGHT;
  }
  return full;
}

/** Full 46-key weight map for a career position string. */
export function weightsFor(pos) {
  return weightsForArchetype(archetypeFor(pos));
}

/** Full 46-key weight map for a vendor Position enum. */
export function weightsForVendorPosition(pe) {
  return weightsForArchetype(archetypeForVendorPosition(pe));
}

// ---------------------------------------------------------------------------
// Module State
// ---------------------------------------------------------------------------

let _currentAttrs = null;
let _lastEngineOvr = null;
let _rng = null;

// ---------------------------------------------------------------------------
// Public API — Query
// ---------------------------------------------------------------------------

export function getAttributes() {
  return _currentAttrs;
}

/** All attribute keys belonging to a category. */
export function getKeysByCategory(category) {
  return ATTRIBUTE_KEYS.filter((k) => PLAYER_ATTRS[k].cat === category);
}

/**
 * vendor `Player.rating()` components (0-100 each). Six axes for outfield
 * (pace/shooting/passing/dribbling/defending/physique) or GK (diving/hands/
 * kicking/reflexes/speed/positioning).
 */
export function getRatingComponents(attrs, pos) {
  if (!attrs) return null;
  return _buildPlayer(attrs, pos).rating();
}

/**
 * OVR (0-99) derived straight from vendor `ratingAverage()` (0-100, clamped).
 * vendor is the single source of truth — no position-weight approximation.
 */
export function getOVRFromAttributes(attrs, pos) {
  if (!attrs) return 0;
  const ovr = _buildPlayer(attrs, pos).ratingAverage();
  return Math.round(Math.min(99, Math.max(0, ovr)));
}

export function getPotential(attrs) {
  return attrs ? attrs._potential : null;
}

export function getDevCurve(attrs) {
  return attrs ? attrs._devCurve : null;
}

// ---------------------------------------------------------------------------
// Public API — Lifecycle
// ---------------------------------------------------------------------------

/**
 * Create a fresh 46-key attribute object for a new career (age 16 baseline).
 * Seed-driven, same seed + identity always yields the same values + PRNG stream.
 */
export function initAttributes(identity, seed, currentOvr) {
  const pos = identity?.pos || 'CM';
  const weights = weightsFor(pos);

  const seedStr = String(seed) + '|' + (identity?.name || '') + '|' + pos;
  _rng = mulberry32(hashSeed(seedStr));

  // devCurve roll (~30/50/20)
  const curveRoll = _rng();
  let devCurve;
  if (curveRoll < 0.30) devCurve = 'early';
  else if (curveRoll < 0.80) devCurve = 'steady';
  else devCurve = 'late';

  // potential roll (1-20)
  let potBase;
  switch (devCurve) {
    case 'early':  potBase = 10 + _rng() * 7; break; // 10-17
    case 'steady': potBase = 11 + _rng() * 8; break; // 11-19
    case 'late':   potBase = 13 + _rng() * 7; break; // 13-20
    default:       potBase = 12 + _rng() * 7; break;
  }
  const potential = Math.min(20, Math.max(1, Math.round(potBase)));

  const attrs = { _pos: pos, _potential: potential, _devCurve: devCurve };
  for (const key of ATTRIBUTE_KEYS) {
    const w = weights[key] || 5;
    // Young-player baseline: weight 10 → ~15, weight 2 → ~3 (1-20 scale)
    const base = w * 1.5;
    const jitter = (_rng() - 0.5) * 8; // ±4
    attrs[key] = Math.max(1, Math.min(20, Math.round(base + jitter)));
  }

  _currentAttrs = attrs;
  _lastEngineOvr = currentOvr != null ? currentOvr : null;
  return attrs;
}

/**
 * Evolve attributes by one season, anchored to the engine's OVR delta.
 * Growth rules mirror the previous 15-key system, but distributed across the
 * 46 vendor keys weighted by position archetype. Physical attrs decline after
 * the peak age; mental attrs keep ticking up with experience.
 */
export function tickAttributes(currentOvr, age, pos, attrs) {
  if (!attrs) attrs = _currentAttrs;
  if (!attrs) return null;

  const devCurve = attrs._devCurve || 'steady';
  const potential = attrs._potential != null ? attrs._potential : 14;

  let delta = 0;
  if (_lastEngineOvr != null) delta = currentOvr - _lastEngineOvr;
  _lastEngineOvr = currentOvr;

  if (pos && pos !== attrs._pos) attrs._pos = pos;

  // growth multiplier from dev curve × age
  let gm = 1.0;
  switch (devCurve) {
    case 'early':
      if (age <= 20) gm = 1.5; else if (age <= 24) gm = 1.2;
      else if (age <= 28) gm = 0.8; else gm = 0.5;
      break;
    case 'steady':
      if (age <= 24) gm = 1.2; else if (age <= 28) gm = 1.1;
      else if (age <= 32) gm = 0.9; else gm = 0.6;
      break;
    case 'late':
      if (age <= 24) gm = 0.8; else if (age <= 28) gm = 1.3;
      else if (age <= 32) gm = 1.4; else gm = 0.7;
      break;
    default:
      break;
  }

  // dampen growth near potential ceiling
  if (delta > 0) {
    const avgAttr = _avgOfAttributes(attrs);
    const gap = Math.max(0, potential - avgAttr);
    if (gap < 1) gm *= 0.2;
    else if (gap < 3) gm *= 0.6;
    else if (gap < 5) gm *= 0.85;
  }

  // distribute effective delta across the 46 keys
  const effectiveDelta = delta * gm;
  if (effectiveDelta !== 0) {
    const weights = weightsFor(pos || attrs._pos);
    let totalW = 0;
    for (const key of ATTRIBUTE_KEYS) totalW += weights[key] || 1;
    // 46-key scale: 1 OVR point ≈ 8 attribute units spread across the set
    const totalDist = effectiveDelta * 8.0;

    for (const key of ATTRIBUTE_KEYS) {
      const w = weights[key] || 1;
      const share = (w / totalW) * totalDist;
      const jittered = share * (0.7 + (_rng ? _rng() : Math.random()) * 0.6);
      attrs[key] = Math.max(1, Math.min(20, Math.round(attrs[key] + jittered)));
    }
  }

  // age-related physical decline
  const declineAge = { early: 26, steady: 30, late: 33 }[devCurve] || 28;
  if (age > declineAge) {
    const rate = (age - declineAge) * 0.08;
    for (const key of PHYSICAL_KEYS) {
      attrs[key] = Math.max(1, Math.round(attrs[key] - rate));
    }
  }

  // mild mental growth from experience (caps at 20)
  for (const key of MENTAL_KEYS) {
    if (attrs[key] < 20) {
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

function _buildPlayer(attrs, pos) {
  return new Player(
    { name: '_', number: 0 },
    { height: 180, weight: 75 },
    attrs,
    positionEnumFor(pos || attrs._pos),
  );
}

function _avgOfAttributes(attrs) {
  let sum = 0;
  for (const key of ATTRIBUTE_KEYS) {
    sum += attrs[key] || 0;
  }
  return sum / ATTRIBUTE_KEYS.length;
}

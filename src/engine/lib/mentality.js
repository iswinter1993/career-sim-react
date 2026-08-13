// engine/lib/mentality.js
//
// Design Pattern #3: Strategy — unified mentality strategies.
//
// The five FM-style mentalities (ultra_attack → ultra_defend) each describe a
// complete "strategy" for how the team plays: the engine AI intent, the
// per-skill boost/penalty, and the defensive-line depth. Before this module
// those three effect domains lived in three separate switch statements
// (MENTALITY_INTENT + the skill-modifier switch in matchEngine.js, and
// _mentalityToDepthFactor in formation.js). They are now one data-driven
// table, so every consumer reads the same source of truth and adding or
// tuning a mentality is a single edit.
//
// Public API:
//   MENTALITY_STRATEGIES            → { key: { key, name, intent, depthFactor, skillModifiers } }
//   OFFENSIVE_SKILLS / DEFENSIVE_SKILLS → shared skill classification
//   getMentalityStrategy(key)        → strategy (falls back to balanced)
//   getMentalityList()               → [{ key, name }]

export const MENTALITY_STRATEGIES = {
  ultra_attack: {
    key: 'ultra_attack',
    name: '全力进攻',
    intent: 'attack',
    depthFactor: 1.15,
    skillModifiers: { offensive: 1.15, defensive: 0.90 },
  },
  attack: {
    key: 'attack',
    name: '进攻',
    intent: 'attack',
    depthFactor: 1.07,
    skillModifiers: { offensive: 1.08, defensive: 0.95 },
  },
  balanced: {
    key: 'balanced',
    name: '均衡',
    intent: 'balanced',
    depthFactor: 1.00,
    skillModifiers: { offensive: 1.00, defensive: 1.00 },
  },
  defend: {
    key: 'defend',
    name: '防守',
    intent: 'defend',
    depthFactor: 0.93,
    skillModifiers: { offensive: 0.92, defensive: 1.10 },
  },
  ultra_defend: {
    key: 'ultra_defend',
    name: '全力防守',
    intent: 'defend',
    depthFactor: 0.85,
    skillModifiers: { offensive: 0.85, defensive: 1.20 },
  },
};

// Shared skill classification — which skill groups a mentality boosts/penalises.
export const OFFENSIVE_SKILLS = ['shooting', 'passing', 'control'];
export const DEFENSIVE_SKILLS = ['tackling', 'strength', 'perception'];

/** Resolve a mentality key to its strategy, falling back to balanced. */
export function getMentalityStrategy(key) {
  return MENTALITY_STRATEGIES[key] || MENTALITY_STRATEGIES.balanced;
}

/** List mentalities as [{ key, name }] for UI selectors. */
export function getMentalityList() {
  return Object.values(MENTALITY_STRATEGIES).map(({ key, name }) => ({ key, name }));
}

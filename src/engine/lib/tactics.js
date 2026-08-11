// engine/lib/tactics.js
//
// FM-style three-layer AI system: Team Strategy → Player Role → Player Trait.
//
// Layer 1 – TeamStrategy:  global team instructions (tempo, pressing, width, …)
// Layer 2 – PlayerRole:    position-specific role definitions (~50 roles)
// Layer 3 – PlayerTraits:  individual playing habits (~30 traits)
//
// Public API:
//   STYLE_PRESETS                  → { key: { name, tempo, pressingIntensity, … } }
//   DEFAULT_STRATEGY               → { tempo, pressingIntensity, defensiveLine, … }
//   PLAYER_ROLES                   → { roleKey: { position, name, duty, actionModifiers, movementModifiers } }
//   PLAYER_TRAITS                  → { traitKey: { category, description, condition, override } }
//
//   applyTeamStrategy(team, strategy, pitchSize) → team (mutated)
//   getRoleModifier(roleKey)        → { actionModifiers, movementModifiers, position, duty }
//   getAvailableRolesForPosition(p) → string[]
//   getDefaultRole(position)        → string
//   validateRoleForPosition(roleKey, position) → boolean
//   evaluateTraits(player, matchState) → { actionModifiers, movementModifiers, flags }
//   getRoleName(roleKey)           → string
//   getTraitCategory(traitKey)     → string
//
//   // Helper lookups used by downstream modules
//   getAllTraits()                  → string[]
//   getStylePresetList()            → { key, name }[]

import { getPositionGroup } from './positionGroup.js';

// ===========================================================================
// LAYER 1 — TEAM STRATEGY PRESETS
// ===========================================================================

/** Fallback when no strategy is specified. */
export const DEFAULT_STRATEGY = {
  tempo: 'balanced',
  pressingIntensity: 'balanced',
  defensiveLine: 'balanced',
  width: 'balanced',
  passingDirectness: 'balanced',
  counterPress: false,
  fluidity: 'balanced',
  mentality: 'balanced',
};

/** Pre-built team-style templates — each maps to FM's tactical presets. */
export const STYLE_PRESETS = {
  tiki_taka: {
    name: 'Tiki-Taka',
    tempo: 'very_slow',
    pressingIntensity: 'much_more',
    defensiveLine: 'high',
    width: 'wide',
    passingDirectness: 'much_shorter',
    counterPress: true,
    fluidity: 'very_fluid',
    mentality: 'attack',
  },
  gegenpress: {
    name: 'Gegenpress',
    tempo: 'very_quick',
    pressingIntensity: 'much_more',
    defensiveLine: 'high',
    width: 'slightly_narrow',
    passingDirectness: 'more_direct',
    counterPress: true,
    fluidity: 'fluid',
    mentality: 'attack',
  },
  park_the_bus: {
    name: 'Park The Bus',
    tempo: 'very_slow',
    pressingIntensity: 'much_less',
    defensiveLine: 'deep',
    width: 'narrow',
    passingDirectness: 'very_direct',
    counterPress: false,
    fluidity: 'very_rigid',
    mentality: 'ultra_defend',
  },
  route_one: {
    name: 'Route One',
    tempo: 'quick',
    pressingIntensity: 'less',
    defensiveLine: 'slightly_deep',
    width: 'balanced',
    passingDirectness: 'very_direct',
    counterPress: false,
    fluidity: 'rigid',
    mentality: 'defend',
  },
  wing_play: {
    name: 'Wing Play',
    tempo: 'balanced',
    pressingIntensity: 'balanced',
    defensiveLine: 'balanced',
    width: 'wide',
    passingDirectness: 'more_direct',
    counterPress: false,
    fluidity: 'balanced',
    mentality: 'balanced',
  },
  control_possession: {
    name: 'Control Possession',
    tempo: 'slow',
    pressingIntensity: 'more',
    defensiveLine: 'slightly_high',
    width: 'slightly_wide',
    passingDirectness: 'shorter',
    counterPress: true,
    fluidity: 'fluid',
    mentality: 'balanced',
  },
  vertical_tiki_taka: {
    name: 'Vertical Tiki-Taka',
    tempo: 'balanced',
    pressingIntensity: 'much_more',
    defensiveLine: 'high',
    width: 'slightly_wide',
    passingDirectness: 'shorter',
    counterPress: true,
    fluidity: 'very_fluid',
    mentality: 'attack',
  },
};

// ===========================================================================
// applyTeamStrategy — inject strategy parameters into a team object
// ===========================================================================

/**
 * Apply team strategy to a team. Mutates the team object by attaching
 * helper properties that actions.js and playerMovement.js read at runtime.
 *
 * @param {object} team — engine team { name, players, … }
 * @param {object} strategy — { tempo, pressingIntensity, defensiveLine, width, … }
 * @param {object} pitchSize — { pitchWidth, pitchHeight }
 * @returns {object} the same team (mutated)
 */
export function applyTeamStrategy(team, strategy, pitchSize) {
  const s = { ...DEFAULT_STRATEGY, ...strategy };
  team._strategy = s;

  team._tempoMultiplier      = _tempoToMultiplier(s.tempo);
  team._pressingMultiplier   = _pressingToMultiplier(s.pressingIntensity);
  team._pressingDistance     = _pressingToDistance(s.pressingIntensity, pitchSize);
  team._defensiveLineOffset  = _defensiveLineToOffset(s.defensiveLine, pitchSize);
  team._widthMultiplier      = _widthToMultiplier(s.width);
  team._passingWeights       = _passingDirectnessToWeights(s.passingDirectness);
  team._counterPress         = s.counterPress;
  team._fluidityFactor       = _fluidityToFactor(s.fluidity);

  return team;
}

// ---- strategy → numeric helpers ----

function _tempoToMultiplier(tempo) {
  const map = {
    very_slow:  { pace: 0.85, passing: 1.10 },
    slow:       { pace: 0.92, passing: 1.05 },
    balanced:   { pace: 1.00, passing: 1.00 },
    quick:      { pace: 1.08, passing: 0.95 },
    very_quick: { pace: 1.15, passing: 0.90 },
  };
  return map[tempo] || map.balanced;
}

function _pressingToMultiplier(intensity) {
  const map = { much_less: 0.70, less: 0.85, balanced: 1.00, more: 1.15, much_more: 1.30 };
  return map[intensity] != null ? map[intensity] : 1.0;
}

function _pressingToDistance(intensity, pitchSize) {
  const height = pitchSize?.pitchHeight || 1050;
  const map = { much_less: 60, less: 90, balanced: 130, more: 170, much_more: 220 };
  const base = map[intensity] != null ? map[intensity] : 130;
  return Math.round(base * (height / 1050));
}

function _defensiveLineToOffset(line, pitchSize) {
  const height = pitchSize?.pitchHeight || 1050;
  const map = { deep: -60, slightly_deep: -30, balanced: 0, slightly_high: 30, high: 60 };
  const base = map[line] != null ? map[line] : 0;
  return Math.round(base * (height / 1050));
}

function _widthToMultiplier(width) {
  const map = { narrow: 0.85, slightly_narrow: 0.93, balanced: 1.00, slightly_wide: 1.07, wide: 1.15 };
  return map[width] != null ? map[width] : 1.0;
}

function _passingDirectnessToWeights(directness) {
  const map = {
    much_shorter: { short: 1.3, through: 0.8, long: 0.4 },
    shorter:      { short: 1.15, through: 0.9, long: 0.6 },
    balanced:     { short: 1.0, through: 1.0, long: 0.8 },
    more_direct:  { short: 0.8, through: 1.15, long: 1.2 },
    very_direct:  { short: 0.5, through: 1.0, long: 1.6 },
  };
  return map[directness] || map.balanced;
}

function _fluidityToFactor(fluidity) {
  const map = { very_rigid: 0.0, rigid: 0.1, balanced: 0.3, fluid: 0.5, very_fluid: 0.7 };
  return map[fluidity] != null ? map[fluidity] : 0.3;
}

// ===========================================================================
// LAYER 2 — PLAYER ROLES (~50 across 12 positions)
// ===========================================================================

export const PLAYER_ROLES = {

  // ===== GOALKEEPER =====
  GK_goalkeeper_defend: {
    position: 'GK', name: 'Goalkeeper (Defend)', duty: 'defend',
    actionModifiers: { boot: 1.3, pass: 0.8, run: 0.5 },
    movementModifiers: { sweeperDistance: 0.3, rushOut: 0.2 },
  },
  GK_sweeper_keeper_support: {
    position: 'GK', name: 'Sweeper Keeper (Support)', duty: 'support',
    actionModifiers: { boot: 0.7, pass: 1.3, run: 1.0, slide: 1.2 },
    movementModifiers: { sweeperDistance: 0.7, rushOut: 0.6 },
  },
  GK_sweeper_keeper_attack: {
    position: 'GK', name: 'Sweeper Keeper (Attack)', duty: 'attack',
    actionModifiers: { boot: 0.5, pass: 1.5, run: 1.3, slide: 1.4 },
    movementModifiers: { sweeperDistance: 0.9, rushOut: 0.8 },
  },

  // ===== CENTRE-BACK =====
  CB_central_defender_defend: {
    position: 'CB', name: 'Central Defender (Defend)', duty: 'defend',
    actionModifiers: { tackle: 1.2, intercept: 1.1, cleared: 1.3, pass: 0.7, run: 0.3, shoot: 0.1 },
    movementModifiers: { forwardRuns: 0.1, holdPosition: 0.9 },
  },
  CB_ball_playing_defender_defend: {
    position: 'CB', name: 'Ball-Playing Defender (Defend)', duty: 'defend',
    actionModifiers: { tackle: 1.0, intercept: 1.0, pass: 1.4, throughBall: 1.2, run: 0.5 },
    movementModifiers: { forwardRuns: 0.2, holdPosition: 0.7 },
  },
  CB_ball_playing_defender_stopper: {
    position: 'CB', name: 'Ball-Playing Defender (Stopper)', duty: 'defend',
    actionModifiers: { tackle: 1.5, intercept: 1.4, pass: 1.1, run: 0.6, cleared: 0.7 },
    movementModifiers: { forwardRuns: 0.4, holdPosition: 0.5, closingDown: 0.7 },
  },
  CB_no_nonsense_centre_back_defend: {
    position: 'CB', name: 'No-Nonsense Centre-Back (Defend)', duty: 'defend',
    actionModifiers: { tackle: 1.5, cleared: 1.8, intercept: 1.2, pass: 0.2, run: 0.1, shoot: 0.05 },
    movementModifiers: { forwardRuns: 0.0, holdPosition: 1.0 },
  },
  CB_libero_support: {
    position: 'CB', name: 'Libero (Support)', duty: 'support',
    actionModifiers: { tackle: 1.0, pass: 1.2, run: 0.8, dribble: 1.2 },
    movementModifiers: { forwardRuns: 0.5, holdPosition: 0.4 },
  },

  // ===== FULL-BACK =====
  FB_fullback_defend: {
    position: ['LB', 'RB', 'LWB', 'RWB'], name: 'Full-Back (Defend)', duty: 'defend',
    actionModifiers: { tackle: 1.2, intercept: 1.1, cross: 0.6, run: 0.3 },
    movementModifiers: { forwardRuns: 0.2, stayWide: 0.6 },
  },
  FB_fullback_support: {
    position: ['LB', 'RB', 'LWB', 'RWB'], name: 'Full-Back (Support)', duty: 'support',
    actionModifiers: { tackle: 1.0, cross: 1.0, pass: 1.1, run: 0.7 },
    movementModifiers: { forwardRuns: 0.4, stayWide: 0.6 },
  },
  FB_wing_back_attack: {
    position: ['LB', 'RB', 'LWB', 'RWB'], name: 'Wing-Back (Attack)', duty: 'attack',
    actionModifiers: { cross: 1.5, run: 1.3, tackle: 0.8, dribble: 1.2 },
    movementModifiers: { forwardRuns: 0.8, stayWide: 0.9 },
  },
  FB_wing_back_support: {
    position: ['LB', 'RB', 'LWB', 'RWB'], name: 'Wing-Back (Support)', duty: 'support',
    actionModifiers: { cross: 1.2, pass: 1.1, run: 0.9, tackle: 1.0 },
    movementModifiers: { forwardRuns: 0.5, stayWide: 0.8 },
  },
  FB_inverted_wing_back_support: {
    position: ['LB', 'RB', 'LWB', 'RWB'], name: 'Inverted Wing-Back (Support)', duty: 'support',
    actionModifiers: { pass: 1.3, throughBall: 1.2, cross: 0.5, tackle: 1.0 },
    movementModifiers: { forwardRuns: 0.6, stayWide: 0.3, invertInside: 0.8 },
  },
  FB_complete_wing_back_attack: {
    position: ['LB', 'RB', 'LWB', 'RWB'], name: 'Complete Wing-Back (Attack)', duty: 'attack',
    actionModifiers: { cross: 1.3, pass: 1.2, run: 1.4, dribble: 1.3, tackle: 0.9 },
    movementModifiers: { forwardRuns: 0.9, stayWide: 0.7, roamFromPosition: 0.4 },
  },

  // ===== DEFENSIVE MIDFIELD =====
  CDM_anchor_man_defend: {
    position: 'CDM', name: 'Anchor Man (Defend)', duty: 'defend',
    actionModifiers: { tackle: 1.3, intercept: 1.3, pass: 0.9, run: 0.1, shoot: 0.3 },
    movementModifiers: { forwardRuns: 0.0, holdPosition: 1.0 },
  },
  CDM_defensive_midfielder_defend: {
    position: 'CDM', name: 'Defensive Midfielder (Defend)', duty: 'defend',
    actionModifiers: { tackle: 1.4, intercept: 1.2, pass: 1.0, run: 0.2, shoot: 0.2 },
    movementModifiers: { forwardRuns: 0.1, holdPosition: 0.8 },
  },
  CDM_deep_lying_playmaker_defend: {
    position: 'CDM', name: 'Deep-Lying Playmaker (Defend)', duty: 'defend',
    actionModifiers: { pass: 1.5, throughBall: 1.2, tackle: 1.0, run: 0.3, shoot: 0.3 },
    movementModifiers: { forwardRuns: 0.15, holdPosition: 0.7 },
  },
  CDM_regista_support: {
    position: 'CDM', name: 'Regista (Support)', duty: 'support',
    actionModifiers: { pass: 1.5, throughBall: 1.4, shoot: 0.7, tackle: 0.7 },
    movementModifiers: { forwardRuns: 0.3, roamFromPosition: 0.6 },
  },
  CDM_half_back_defend: {
    position: 'CDM', name: 'Half-Back (Defend)', duty: 'defend',
    actionModifiers: { tackle: 1.3, intercept: 1.4, pass: 0.9, run: 0.2 },
    movementModifiers: { forwardRuns: 0.0, holdPosition: 0.9, dropBetweenCBs: 0.8 },
  },

  // ===== CENTRAL MIDFIELD =====
  CM_central_midfielder_support: {
    position: 'CM', name: 'Central Midfielder (Support)', duty: 'support',
    actionModifiers: { pass: 1.2, tackle: 0.9, run: 0.7, shoot: 0.6 },
    movementModifiers: { forwardRuns: 0.3, holdPosition: 0.5 },
  },
  CM_deep_lying_playmaker_support: {
    position: 'CM', name: 'Deep-Lying Playmaker (Support)', duty: 'support',
    actionModifiers: { pass: 1.5, throughBall: 1.3, tackle: 0.8, run: 0.4, shoot: 0.6 },
    movementModifiers: { forwardRuns: 0.2, holdPosition: 0.6 },
  },
  CM_box_to_box_support: {
    position: 'CM', name: 'Box-to-Box Midfielder (Support)', duty: 'support',
    actionModifiers: { pass: 1.1, tackle: 1.1, run: 1.3, shoot: 1.0, sprint: 1.2 },
    movementModifiers: { forwardRuns: 0.6, holdPosition: 0.2, staminaDrain: 1.3 },
  },
  CM_mezzala_attack: {
    position: 'CM', name: 'Mezzala (Attack)', duty: 'attack',
    actionModifiers: { run: 1.4, dribble: 1.3, pass: 1.1, shoot: 1.2, tackle: 0.6 },
    movementModifiers: { forwardRuns: 0.8, stayWide: 0.7, holdPosition: 0.1 },
  },
  CM_mezzala_support: {
    position: 'CM', name: 'Mezzala (Support)', duty: 'support',
    actionModifiers: { pass: 1.3, dribble: 1.1, run: 1.0, cross: 0.8, tackle: 0.7 },
    movementModifiers: { forwardRuns: 0.5, stayWide: 0.6 },
  },
  CM_advanced_playmaker_attack: {
    position: 'CM', name: 'Advanced Playmaker (Attack)', duty: 'attack',
    actionModifiers: { pass: 1.6, throughBall: 1.5, dribble: 1.2, shoot: 0.8, tackle: 0.4 },
    movementModifiers: { forwardRuns: 0.5, roamFromPosition: 0.8 },
  },
  CM_ball_winning_midfielder_defend: {
    position: 'CM', name: 'Ball-Winning Midfielder (Defend)', duty: 'defend',
    actionModifiers: { tackle: 1.6, intercept: 1.4, slide: 1.3, pass: 0.8, shoot: 0.4 },
    movementModifiers: { forwardRuns: 0.1, closingDown: 0.9 },
  },
  CM_carrilero_support: {
    position: 'CM', name: 'Carrilero (Support)', duty: 'support',
    actionModifiers: { pass: 1.3, tackle: 1.1, run: 0.8, cross: 0.7 },
    movementModifiers: { forwardRuns: 0.3, stayWide: 0.5 },
  },

  // ===== ATTACKING MIDFIELD =====
  CAM_attacking_midfielder_attack: {
    position: 'CAM', name: 'Attacking Midfielder (Attack)', duty: 'attack',
    actionModifiers: { shoot: 1.4, pass: 1.2, throughBall: 1.4, dribble: 1.5, run: 1.0 },
    movementModifiers: { forwardRuns: 0.6, roamFromPosition: 0.5 },
  },
  CAM_attacking_midfielder_support: {
    position: 'CAM', name: 'Attacking Midfielder (Support)', duty: 'support',
    actionModifiers: { pass: 1.4, throughBall: 1.2, dribble: 1.0, shoot: 0.8, tackle: 0.3 },
    movementModifiers: { forwardRuns: 0.4, roamFromPosition: 0.4 },
  },
  CAM_advanced_playmaker_attack: {
    position: 'CAM', name: 'Advanced Playmaker (Attack)', duty: 'attack',
    actionModifiers: { pass: 1.8, throughBall: 1.6, dribble: 1.1, shoot: 0.8, tackle: 0.2 },
    movementModifiers: { forwardRuns: 0.3, roamFromPosition: 0.7 },
  },
  CAM_enganche_support: {
    position: 'CAM', name: 'Enganche (Support)', duty: 'support',
    actionModifiers: { pass: 1.6, throughBall: 1.5, dribble: 1.1, shoot: 0.9, run: 0.3 },
    movementModifiers: { forwardRuns: 0.2, roamFromPosition: 0.4, holdPosition: 0.8 },
  },
  CAM_shadow_striker_attack: {
    position: 'CAM', name: 'Shadow Striker (Attack)', duty: 'attack',
    actionModifiers: { run: 1.4, shoot: 1.5, dribble: 1.3, pass: 0.9 },
    movementModifiers: { forwardRuns: 0.9, roamFromPosition: 0.7, holdPosition: 0.1 },
  },

  // ===== WIDE MIDFIELD =====
  LM_wide_midfielder_support: {
    position: ['LM', 'RM'], name: 'Wide Midfielder (Support)', duty: 'support',
    actionModifiers: { cross: 1.2, pass: 1.1, run: 1.0, tackle: 1.0 },
    movementModifiers: { forwardRuns: 0.5, stayWide: 0.7 },
  },
  LM_winger_support: {
    position: ['LM', 'RM'], name: 'Winger (Support)', duty: 'support',
    actionModifiers: { cross: 1.4, dribble: 1.3, run: 1.2, pass: 0.8 },
    movementModifiers: { forwardRuns: 0.6, stayWide: 0.8 },
  },
  LM_winger_attack: {
    position: ['LM', 'RM'], name: 'Winger (Attack)', duty: 'attack',
    actionModifiers: { cross: 1.5, run: 1.4, dribble: 1.4, tackle: 0.4 },
    movementModifiers: { forwardRuns: 0.8, stayWide: 0.9 },
  },
  LM_defensive_winger_defend: {
    position: ['LM', 'RM'], name: 'Defensive Winger (Defend)', duty: 'defend',
    actionModifiers: { tackle: 1.5, cross: 1.0, run: 0.8, pass: 0.7 },
    movementModifiers: { forwardRuns: 0.3, stayWide: 0.5, closingDown: 0.7 },
  },
  LM_wide_playmaker_support: {
    position: ['LM', 'RM'], name: 'Wide Playmaker (Support)', duty: 'support',
    actionModifiers: { pass: 1.6, throughBall: 1.3, cross: 0.8, dribble: 0.9, run: 0.6 },
    movementModifiers: { forwardRuns: 0.3, stayWide: 0.5, roamFromPosition: 0.5 },
  },
  LM_inverted_winger_attack: {
    position: ['LM', 'RM'], name: 'Inverted Winger (Attack)', duty: 'attack',
    actionModifiers: { shoot: 1.3, dribble: 1.4, cross: 0.4, pass: 0.9, run: 1.2 },
    movementModifiers: { forwardRuns: 0.7, stayWide: 0.3, cutInside: 0.8 },
  },

  // ===== WINGERS =====
  LW_inside_forward_attack: {
    position: ['LW', 'RW'], name: 'Inside Forward (Attack)', duty: 'attack',
    actionModifiers: { shoot: 1.4, run: 1.3, dribble: 1.3, cross: 0.7, pass: 1.0 },
    movementModifiers: { forwardRuns: 0.9, stayWide: 0.2, cutInside: 0.8 },
  },
  LW_inside_forward_support: {
    position: ['LW', 'RW'], name: 'Inside Forward (Support)', duty: 'support',
    actionModifiers: { pass: 1.3, dribble: 1.2, shoot: 1.0, cross: 0.8, run: 1.0 },
    movementModifiers: { forwardRuns: 0.6, stayWide: 0.3, cutInside: 0.7 },
  },
  LW_winger_attack: {
    position: ['LW', 'RW'], name: 'Winger (Attack)', duty: 'attack',
    actionModifiers: { cross: 1.6, dribble: 1.5, run: 1.4, shoot: 0.6, pass: 0.8 },
    movementModifiers: { forwardRuns: 0.8, stayWide: 0.9 },
  },
  RW_raumdeuter_attack: {
    position: ['RW', 'LW'], name: 'Raumdeuter (Attack)', duty: 'attack',
    actionModifiers: { shoot: 1.6, run: 1.2, dribble: 0.9, cross: 0.5, pass: 0.8 },
    movementModifiers: { forwardRuns: 0.7, roamFromPosition: 0.9, holdPosition: 0.0 },
  },
  LW_inverted_winger_attack: {
    position: ['LW', 'RW'], name: 'Inverted Winger (Attack)', duty: 'attack',
    actionModifiers: { shoot: 1.4, dribble: 1.5, cross: 0.3, pass: 0.9, run: 1.2 },
    movementModifiers: { forwardRuns: 0.7, stayWide: 0.2, cutInside: 0.9 },
  },

  // ===== STRIKER =====
  ST_advanced_forward_attack: {
    position: 'ST', name: 'Advanced Forward (Attack)', duty: 'attack',
    actionModifiers: { shoot: 1.5, run: 1.3, dribble: 0.9, pass: 0.5 },
    movementModifiers: { forwardRuns: 0.8, roamFromPosition: 0.5 },
  },
  ST_poacher_attack: {
    position: 'ST', name: 'Poacher (Attack)', duty: 'attack',
    actionModifiers: { shoot: 1.7, run: 1.2, pass: 0.5, tackle: 0.2, dribble: 0.7 },
    movementModifiers: { forwardRuns: 0.7, holdPosition: 0.4, closingDown: 0.3 },
  },
  ST_complete_forward_attack: {
    position: 'ST', name: 'Complete Forward (Attack)', duty: 'attack',
    actionModifiers: { shoot: 1.3, pass: 1.1, run: 1.2, dribble: 1.2, cross: 0.8 },
    movementModifiers: { forwardRuns: 0.7, roamFromPosition: 0.6, closingDown: 0.6 },
  },
  ST_complete_forward_support: {
    position: 'ST', name: 'Complete Forward (Support)', duty: 'support',
    actionModifiers: { pass: 1.4, shoot: 1.0, dribble: 1.1, run: 1.0, cross: 0.7 },
    movementModifiers: { forwardRuns: 0.5, roamFromPosition: 0.7, holdPosition: 0.2 },
  },
  ST_deep_lying_forward_support: {
    position: 'ST', name: 'Deep-Lying Forward (Support)', duty: 'support',
    actionModifiers: { pass: 1.4, throughBall: 1.3, shoot: 1.0, dribble: 1.1, tackle: 0.6 },
    movementModifiers: { forwardRuns: 0.4, roamFromPosition: 0.5, holdPosition: 0.4 },
  },
  ST_target_man_attack: {
    position: 'ST', name: 'Target Man (Attack)', duty: 'attack',
    actionModifiers: { shoot: 1.3, pass: 0.8, dribble: 0.5, run: 0.3, tackle: 0.8 },
    movementModifiers: { forwardRuns: 0.3, holdPosition: 0.8 },
  },
  ST_target_man_support: {
    position: 'ST', name: 'Target Man (Support)', duty: 'support',
    actionModifiers: { pass: 1.2, shoot: 1.0, dribble: 0.4, run: 0.3, tackle: 0.6 },
    movementModifiers: { forwardRuns: 0.2, holdPosition: 0.9 },
  },
  ST_pressing_forward_attack: {
    position: 'ST', name: 'Pressing Forward (Attack)', duty: 'attack',
    actionModifiers: { shoot: 1.2, tackle: 1.3, run: 1.1, pass: 0.7 },
    movementModifiers: { forwardRuns: 0.7, closingDown: 0.9, roamFromPosition: 0.4 },
  },
  ST_trequartista_attack: {
    position: 'ST', name: 'Trequartista (Attack)', duty: 'attack',
    actionModifiers: { pass: 1.6, throughBall: 1.5, dribble: 1.4, shoot: 1.0, run: 0.8 },
    movementModifiers: { forwardRuns: 0.4, roamFromPosition: 0.9, holdPosition: 0.1 },
  },
};

// ===========================================================================
// Layer 2 — role lookup API
// ===========================================================================

/**
 * Get the full role definition by role key.
 * @param {string} roleKey — e.g. 'CM_box_to_box_support'
 * @returns {{ position, name, duty, actionModifiers, movementModifiers }}
 */
export function getRoleModifier(roleKey) {
  return PLAYER_ROLES[roleKey] || PLAYER_ROLES.CM_central_midfielder_support;
}

/**
 * List all role keys available for a given position.
 * @param {string} position — e.g. 'CM', 'ST'
 * @returns {string[]}
 */
export function getAvailableRolesForPosition(position) {
  return Object.entries(PLAYER_ROLES)
    .filter(([, role]) => {
      const allowed = role.position;
      return Array.isArray(allowed) ? allowed.includes(position) : allowed === position;
    })
    .map(([key]) => key);
}

/**
 * Get the recommended default role for a position.
 * @param {string} position
 * @returns {string} role key
 */
export function getDefaultRole(position) {
  const defaults = {
    GK:  'GK_goalkeeper_defend',
    CB:  'CB_central_defender_defend',
    LB:  'FB_fullback_support',
    RB:  'FB_fullback_support',
    LWB: 'FB_wing_back_support',
    RWB: 'FB_wing_back_support',
    CDM: 'CDM_defensive_midfielder_defend',
    CM:  'CM_box_to_box_support',
    CAM: 'CAM_attacking_midfielder_attack',
    LM:  'LM_wide_midfielder_support',
    RM:  'LM_wide_midfielder_support',
    LW:  'LW_inside_forward_attack',
    RW:  'LW_inside_forward_attack',
    ST:  'ST_advanced_forward_attack',
  };
  return defaults[position] || 'CM_central_midfielder_support';
}

/**
 * Check if a role is valid for a given position.
 */
export function validateRoleForPosition(roleKey, position) {
  const role = PLAYER_ROLES[roleKey];
  if (!role) return false;
  const allowed = role.position;
  return Array.isArray(allowed) ? allowed.includes(position) : allowed === position;
}

/** Return the human-readable name for a role key. */
export function getRoleName(roleKey) {
  return PLAYER_ROLES[roleKey]?.name || roleKey;
}

// ===========================================================================
// LAYER 3 — PLAYER TRAITS (~30 individual playing habits)
// ===========================================================================

export const PLAYER_TRAITS = {

  // ---- Movement traits (affect intentPOS / positioning) ----
  comes_deep_to_get_ball: {
    category: 'movement',
    description: 'Comes deep to receive the ball instead of staying high',
    condition: (player, matchState) => matchState?.ballPossession === 'opponent',
    override: { movementModifiers: { forwardRuns: -0.3, holdPosition: 0.3 } },
  },
  gets_forward_whenever_possible: {
    category: 'movement',
    description: 'Gets forward at every opportunity, even when defending',
    override: { movementModifiers: { forwardRuns: 0.3, holdPosition: -0.3 } },
  },
  stays_back_at_all_times: {
    category: 'movement',
    description: 'Never makes forward runs',
    override: { movementModifiers: { forwardRuns: -1.0, holdPosition: 0.5 } },
  },
  cuts_inside_from_both_flanks: {
    category: 'movement',
    description: 'Cuts inside from wide areas instead of staying out wide',
    condition: (player) => ['WG', 'WM', 'FB'].includes(getPositionGroup(player.position)),
    override: { movementModifiers: { stayWide: -0.6, cutInside: 0.7 } },
  },
  hugs_line: {
    category: 'movement',
    description: 'Stays as wide as possible, hugging the touchline',
    condition: (player) => ['WG', 'WM', 'FB'].includes(getPositionGroup(player.position)),
    override: { movementModifiers: { stayWide: 0.7, cutInside: -0.5 } },
  },
  moves_into_channels: {
    category: 'movement',
    description: 'Moves into the channels between CB and FB',
    condition: (player) => getPositionGroup(player.position) === 'ST',
    override: { movementModifiers: { roamFromPosition: 0.4, stayWide: 0.3, forwardRuns: 0.2 } },
  },
  arrives_late_in_opponents_area: {
    category: 'movement',
    description: 'Makes late runs into the box from midfield',
    condition: (player) => ['CM', 'DM'].includes(getPositionGroup(player.position)),
    override: { actionModifiers: { shoot: 0.2, run: 0.2 }, movementModifiers: { forwardRuns: 0.3 } },
  },
  knocks_ball_past_opponent: {
    category: 'movement',
    description: 'Knocks the ball past opponent and uses pace to beat them',
    override: { actionModifiers: { run: 0.4, sprint: 0.3, dribble: 0.2 }, movementModifiers: { forwardRuns: 0.2 } },
  },

  // ---- Action traits (affect decision weights) ----
  plays_one_twos: {
    category: 'action',
    description: 'Frequently plays one-two passing combinations',
    override: { actionModifiers: { pass: 0.3, throughBall: 0.1, dribble: -0.2 } },
  },
  tries_killer_balls_often: {
    category: 'action',
    description: 'Frequently attempts through balls to split the defense',
    override: { actionModifiers: { throughBall: 0.5, pass: -0.1 } },
  },
  shoots_from_distance: {
    category: 'action',
    description: 'Tends to shoot from outside the box',
    condition: (player, matchState) => {
      if (!matchState?.ball) return true;
      const goalY = player.originPOS?.[1] > 525 ? 1050 : 0;
      return Math.abs(matchState.ball[1] - goalY) > 200;
    },
    override: { actionModifiers: { shoot: 0.6, pass: -0.15 } },
  },
  runs_with_ball_often: {
    category: 'action',
    description: 'Frequently attempts to dribble past opponents',
    override: { actionModifiers: { run: 0.4, dribble: 0.3, pass: -0.1 } },
  },
  runs_with_ball_rarely: {
    category: 'action',
    description: 'Rarely dribbles, prefers to pass immediately',
    override: { actionModifiers: { run: -0.5, dribble: -0.5, pass: 0.1 } },
  },
  plays_long_balls_often: {
    category: 'action',
    description: 'Frequently plays long passes',
    override: { actionModifiers: { boot: 0.4, pass: -0.15 } },
  },
  plays_short_simple_passes: {
    category: 'action',
    description: 'Sticks to short simple passes',
    override: { actionModifiers: { pass: 0.2, throughBall: -0.3, boot: -0.4 } },
  },
  tries_first_time_shots: {
    category: 'action',
    description: 'Attempts first-time shots whenever possible',
    override: { actionModifiers: { shoot: 0.3 } },
  },
  tries_long_range_free_kicks: {
    category: 'action',
    description: 'Attempts shots directly from long-range free kicks',
    condition: (player, matchState) => matchState?.scenario === 'freeKick' && matchState?.freeKickDistance > 250,
    override: { actionModifiers: { shoot: 1.0 } },
  },
  dwells_on_ball: {
    category: 'action',
    description: 'Tends to hold onto the ball',
    override: { actionModifiers: { dribble: 0.2, pass: -0.2 } },
  },
  avoids_using_weaker_foot: {
    category: 'action',
    description: 'Always uses stronger foot',
    override: { actionModifiers: { pass: -0.1, cross: -0.15 } },
  },
  curls_ball: {
    category: 'action',
    description: 'Likes to curl the ball on passes and shots',
    override: { actionModifiers: { shoot: 0.1, cross: 0.2 } },
  },
  long_flat_throw: {
    category: 'action',
    description: 'Can throw the ball long distances (GK only)',
    condition: (player) => player.position === 'GK',
    override: { actionModifiers: { pass: 0.2 } },
  },

  // ---- Reaction traits (affect team play) ----
  dictates_tempo: {
    category: 'reaction',
    description: 'Controls the pace of the game',
    override: { actionModifiers: { pass: 0.15, dribble: 0.1 } },
  },
  tries_to_play_way_out_of_trouble: {
    category: 'reaction',
    description: 'Attempts to play out of dangerous situations',
    condition: (player) => {
      const pcy = player.currentPOS?.[1] || 0;
      return (player.originPOS?.[1] > 525 ? 1050 - pcy : pcy) < 350;
    },
    override: { actionModifiers: { dribble: 0.4, pass: -0.1, cleared: -0.4 } },
  },
  winds_up_opponents: {
    category: 'reaction',
    description: 'Gets under opponents\' skin — increases their foul probability',
    override: { flag: 'provocateur' },
  },
  argues_with_officials: {
    category: 'reaction',
    description: 'Frequently argues with the referee',
    override: { flag: 'card_risk' },
  },
  looks_for_pass_rather_than_scoring: {
    category: 'reaction',
    description: 'Prefers to assist rather than shoot',
    override: { actionModifiers: { shoot: -0.3, pass: 0.2, throughBall: 0.2 } },
  },

  // ---- Marking / defensive traits ----
  marks_opponent_tightly: {
    category: 'marking',
    description: 'Stays very close to assigned opponent',
    override: { actionModifiers: { tackle: 0.15, intercept: 0.2 }, movementModifiers: { closingDown: 0.4 } },
  },
  does_not_dive_into_tackles: {
    category: 'marking',
    description: 'Stays on feet instead of sliding in',
    override: { actionModifiers: { slide: -0.8, intercept: 0.2 } },
  },
  dives_into_tackles: {
    category: 'marking',
    description: 'Goes to ground frequently',
    override: { actionModifiers: { slide: 0.6, tackle: 0.2 } },
  },
  brings_ball_out_of_defence: {
    category: 'marking',
    description: 'Carries the ball out from the back',
    condition: (player) => ['CB', 'FB'].includes(getPositionGroup(player.position)),
    override: { actionModifiers: { run: 0.5, dribble: 0.4, cleared: -0.3 } },
  },
};

// ===========================================================================
// Layer 3 — trait evaluation API
// ===========================================================================

/**
 * Evaluate all traits for a player and return combined modifiers.
 *
 * @param {object} player — engine player { position, traits: string[], currentPOS, originPOS, … }
 * @param {object} [matchState] — optional match context for conditional traits
 *   { ball, ballPossession, scenario, freeKickDistance, iteration }
 * @returns {{ actionModifiers: object, movementModifiers: object, flags: string[] }}
 */
export function evaluateTraits(player, matchState) {
  const combined = { actionModifiers: {}, movementModifiers: {}, flags: [] };

  if (!player.traits || !Array.isArray(player.traits) || player.traits.length === 0) {
    return combined;
  }

  for (const traitKey of player.traits) {
    const trait = PLAYER_TRAITS[traitKey];
    if (!trait) continue;

    // Check condition — trait only fires when its condition is met
    if (trait.condition && !trait.condition(player, matchState)) continue;

    const { override } = trait;

    // Merge action modifiers (additive)
    if (override.actionModifiers) {
      for (const [key, val] of Object.entries(override.actionModifiers)) {
        combined.actionModifiers[key] = (combined.actionModifiers[key] || 0) + val;
      }
    }

    // Merge movement modifiers (additive)
    if (override.movementModifiers) {
      for (const [key, val] of Object.entries(override.movementModifiers)) {
        combined.movementModifiers[key] = (combined.movementModifiers[key] || 0) + val;
      }
    }

    // Collect flags
    if (override.flag) {
      combined.flags.push(override.flag);
    }
  }

  return combined;
}

/** Return the category name for a trait. */
export function getTraitCategory(traitKey) {
  return PLAYER_TRAITS[traitKey]?.category || 'unknown';
}

/** List all available trait keys. */
export function getAllTraits() {
  return Object.keys(PLAYER_TRAITS);
}

/** List available style presets as [{ key, name }]. */
export function getStylePresetList() {
  return Object.entries(STYLE_PRESETS).map(([key, preset]) => ({ key, name: preset.name }));
}

// engine/lib/formation.js
//
// Single source of truth for formation coordinates.
// Every formation maps 11 slot-keys to {x, y} on a 680×1050 pitch.
// The home team attacks UP (decreasing y); the away team attacks DOWN.
//
// Public API:
//   FORMATION_MATRIX                              — raw data (10+ formations)
//   getFormationSlots(formationName)              → [{ pos, slotKey, x, y }]
//   getFormationPositions(formationName, pitch, mentality) → { position: [x,y], … }
//   computeOriginPOSForStarters(starters, form, pitch, strategy) → [[x,y], …]
//   getAdjustedLineY(baseY, mentality, pitchHeight) → number
//   getAvailableFormations()                      → string[]
//   getFormationLabel(formationName)              → string (Chinese)
//   getDefaultFormation()                         → '4-4-2'
//   countPositionSlots(formationName, position)   → number

// ===========================================================================
// FORMATION MATRIX
// ===========================================================================
//
// Slot-key naming convention:
//   GK        — one slot
//   LB / RB   — one per side
//   CBL / CBR — two centre-backs (left / right)
//   CDM       — single, or CDML / CDMR for two
//   CML / CMR / CM — 2-3 central midfielders
//   CAM       — single, or CAML / CAMR for two
//   LM / RM   — wide midfielders
//   LW / RW   — wingers
//   ST        — single, or STL / STR for two
//   LWB / RWB — wing-backs (5-3-2)
// ===========================================================================

export const FORMATION_MATRIX = {

  // -----------------------------------------------------------------------
  // 4-4-2 — classic flat four across midfield and defence
  // -----------------------------------------------------------------------
  '4-4-2': {
    GK:  { x: 340, y: 50 },
    LB:  { x: 80,  y: 150 },
    CBL: { x: 240, y: 150 },
    CBR: { x: 440, y: 150 },
    RB:  { x: 600, y: 150 },
    LM:  { x: 80,  y: 350 },
    CML: { x: 240, y: 350 },
    CMR: { x: 440, y: 350 },
    RM:  { x: 600, y: 350 },
    STL: { x: 280, y: 600 },
    STR: { x: 400, y: 600 },
  },

  // -----------------------------------------------------------------------
  // 4-3-3 — modern attacking shape with wingers
  // -----------------------------------------------------------------------
  '4-3-3': {
    GK:  { x: 340, y: 50 },
    LB:  { x: 80,  y: 150 },
    CBL: { x: 240, y: 150 },
    CBR: { x: 440, y: 150 },
    RB:  { x: 600, y: 150 },
    CML: { x: 200, y: 380 },
    CM:  { x: 340, y: 360 },
    CMR: { x: 480, y: 380 },
    LW:  { x: 140, y: 620 },
    ST:  { x: 340, y: 660 },
    RW:  { x: 540, y: 620 },
  },

  // -----------------------------------------------------------------------
  // 4-2-3-1 — double-pivot with attacking midfielder
  // -----------------------------------------------------------------------
  '4-2-3-1': {
    GK:  { x: 340, y: 50 },
    LB:  { x: 80,  y: 150 },
    CBL: { x: 240, y: 150 },
    CBR: { x: 440, y: 150 },
    RB:  { x: 600, y: 150 },
    CDML:{ x: 280, y: 280 },
    CDMR:{ x: 400, y: 280 },
    LM:  { x: 120, y: 460 },
    CAM: { x: 340, y: 440 },
    RM:  { x: 560, y: 460 },
    ST:  { x: 340, y: 660 },
  },

  // -----------------------------------------------------------------------
  // 3-5-2 — three at the back with wing-backs in midfield line
  // -----------------------------------------------------------------------
  '3-5-2': {
    GK:  { x: 340, y: 50 },
    CBL: { x: 180, y: 150 },
    CB:  { x: 340, y: 130 },
    CBR: { x: 500, y: 150 },
    RM:  { x: 60,  y: 340 },
    CML: { x: 200, y: 340 },
    CM:  { x: 340, y: 320 },
    CMR: { x: 480, y: 340 },
    LM:  { x: 620, y: 340 },
    STL: { x: 280, y: 600 },
    STR: { x: 400, y: 600 },
  },

  // -----------------------------------------------------------------------
  // 5-3-2 — defensive block with wing-backs
  // -----------------------------------------------------------------------
  '5-3-2': {
    GK:  { x: 340, y: 50 },
    LWB: { x: 60,  y: 150 },
    CBL: { x: 180, y: 130 },
    CB:  { x: 340, y: 120 },
    CBR: { x: 500, y: 130 },
    RWB: { x: 620, y: 150 },
    CML: { x: 200, y: 360 },
    CM:  { x: 340, y: 340 },
    CMR: { x: 480, y: 360 },
    STL: { x: 280, y: 600 },
    STR: { x: 400, y: 600 },
  },

  // -----------------------------------------------------------------------
  // 4-1-4-1 — single pivot defensive midfielder, wide midfield line
  // -----------------------------------------------------------------------
  '4-1-4-1': {
    GK:  { x: 340, y: 50 },
    LB:  { x: 80,  y: 150 },
    CBL: { x: 240, y: 150 },
    CBR: { x: 440, y: 150 },
    RB:  { x: 600, y: 150 },
    CDM: { x: 340, y: 280 },
    LM:  { x: 80,  y: 420 },
    CML: { x: 240, y: 420 },
    CMR: { x: 440, y: 420 },
    RM:  { x: 600, y: 420 },
    ST:  { x: 340, y: 680 },
  },

  // -----------------------------------------------------------------------
  // 3-4-3 — three at the back, two midfield lines, three forwards
  // -----------------------------------------------------------------------
  '3-4-3': {
    GK:  { x: 340, y: 50 },
    CBL: { x: 160, y: 150 },
    CB:  { x: 340, y: 130 },
    CBR: { x: 520, y: 150 },
    LM:  { x: 80,  y: 340 },
    CML: { x: 240, y: 360 },
    CMR: { x: 440, y: 360 },
    RM:  { x: 600, y: 340 },
    LW:  { x: 120, y: 620 },
    ST:  { x: 340, y: 660 },
    RW:  { x: 560, y: 620 },
  },

  // -----------------------------------------------------------------------
  // 4-4-1-1 — shadow striker behind the main striker
  // -----------------------------------------------------------------------
  '4-4-1-1': {
    GK:  { x: 340, y: 50 },
    LB:  { x: 80,  y: 150 },
    CBL: { x: 240, y: 150 },
    CBR: { x: 440, y: 150 },
    RB:  { x: 600, y: 150 },
    LM:  { x: 80,  y: 350 },
    CML: { x: 240, y: 350 },
    CMR: { x: 440, y: 350 },
    RM:  { x: 600, y: 350 },
    CAM: { x: 340, y: 520 },
    ST:  { x: 340, y: 680 },
  },

  // -----------------------------------------------------------------------
  // 4-3-2-1 "Christmas Tree" — narrow midfield diamond behind lone striker
  // -----------------------------------------------------------------------
  '4-3-2-1': {
    GK:  { x: 340, y: 50 },
    LB:  { x: 80,  y: 150 },
    CBL: { x: 240, y: 150 },
    CBR: { x: 440, y: 150 },
    RB:  { x: 600, y: 150 },
    CML: { x: 200, y: 350 },
    CM:  { x: 340, y: 330 },
    CMR: { x: 480, y: 350 },
    CAML:{ x: 260, y: 500 },
    CAMR:{ x: 420, y: 500 },
    ST:  { x: 340, y: 680 },
  },

  // -----------------------------------------------------------------------
  // 3-4-2-1 — three at back, double attacking midfield behind striker
  // -----------------------------------------------------------------------
  '3-4-2-1': {
    GK:  { x: 340, y: 50 },
    CBL: { x: 160, y: 150 },
    CB:  { x: 340, y: 130 },
    CBR: { x: 520, y: 150 },
    LM:  { x: 80,  y: 340 },
    CML: { x: 240, y: 360 },
    CMR: { x: 440, y: 360 },
    RM:  { x: 600, y: 340 },
    AML: { x: 240, y: 540 },
    AMR: { x: 440, y: 540 },
    ST:  { x: 340, y: 700 },
  },

  // -----------------------------------------------------------------------
  // 4-2-4 — ultra-attacking, two strikers + two wingers
  // -----------------------------------------------------------------------
  '4-2-4': {
    GK:  { x: 340, y: 50 },
    LB:  { x: 80,  y: 150 },
    CBL: { x: 240, y: 150 },
    CBR: { x: 440, y: 150 },
    RB:  { x: 600, y: 150 },
    CML: { x: 200, y: 350 },
    CMR: { x: 480, y: 350 },
    LW:  { x: 120, y: 600 },
    STL: { x: 280, y: 660 },
    STR: { x: 400, y: 660 },
    RW:  { x: 560, y: 600 },
  },

  // -----------------------------------------------------------------------
  // 4-3-1-2 — narrow diamond (no wide midfielders)
  // -----------------------------------------------------------------------
  '4-3-1-2': {
    GK:  { x: 340, y: 50 },
    LB:  { x: 100, y: 150 },
    CBL: { x: 240, y: 150 },
    CBR: { x: 440, y: 150 },
    RB:  { x: 580, y: 150 },
    CDML:{ x: 340, y: 280 },
    CML: { x: 220, y: 400 },
    CMR: { x: 460, y: 400 },
    CAM: { x: 340, y: 500 },
    STL: { x: 280, y: 650 },
    STR: { x: 400, y: 650 },
  },
};

// ===========================================================================
// PUBLIC API
// ===========================================================================

// Chinese labels for each formation
const FORMATION_LABELS = {
  '4-4-2':   '4-4-2 经典平行',
  '4-3-3':   '4-3-3 三叉戟',
  '4-2-3-1': '4-2-3-1 双后腰',
  '3-5-2':   '3-5-2 翼卫体系',
  '5-3-2':   '5-3-2 防守反击',
  '4-1-4-1': '4-1-4-1 单后腰',
  '3-4-3':   '3-4-3 全攻全守',
  '4-4-1-1': '4-4-1-1 影锋战术',
  '4-3-2-1': '4-3-2-1 圣诞树',
  '3-4-2-1': '3-4-2-1 双前腰',
  '4-2-4':   '4-2-4 狂攻阵',
  '4-3-1-2': '4-3-1-2 菱形中场',
};

// ---------------------------------------------------------------------------
// getFormationSlots(formationName) → Array<{ pos, slotKey, x, y }>
// ---------------------------------------------------------------------------

/**
 * Return the 11 slot definitions for a formation.
 * Each slot has a `pos` (position name, stripped of L/R suffix) and
 * a unique `slotKey` (the key used in FORMATION_MATRIX).
 */
export function getFormationSlots(formationName) {
  const matrix = FORMATION_MATRIX[formationName] || FORMATION_MATRIX['4-4-2'];
  return Object.entries(matrix).map(([slotKey, coord]) => ({
    pos: _slotToPosition(slotKey),
    slotKey,
    x: coord.x,
    y: coord.y,
  }));
}

// ---------------------------------------------------------------------------
// getFormationPositions(formationName, pitchSize, mentality)
// → { GK: [x,y], CB: [x,y], CB: [x,y], … }
// ---------------------------------------------------------------------------

/**
 * Compute position → coordinate mapping for a formation.
 * Multi-slot positions (CB × 2, CM × 2, etc.) produce multiple entries
 * keyed the same way — consumers iterate by array index.
 *
 * Mentality shifts the defensive line depth:
 *   ultra_attack → ×1.15 (push higher)
 *   attack       → ×1.07
 *   balanced     → ×1.00
 *   defend       → ×0.93
 *   ultra_defend → ×0.85 (sit deeper)
 */
export function getFormationPositions(formationName, pitchSize, mentality) {
  const matrix = FORMATION_MATRIX[formationName] || FORMATION_MATRIX['4-4-2'];
  const height = pitchSize?.pitchHeight || 1050;
  const width  = pitchSize?.pitchWidth  || 680;

  const depthFactor = _mentalityToDepthFactor(mentality || 'balanced');

  // Scale coordinates to the requested pitch size
  const scaleX = width / 680;
  const scaleY = height / 1050;

  const positions = {};

  for (const [slotKey, coord] of Object.entries(matrix)) {
    const pos = _slotToPosition(slotKey);
    const baseY = coord.y;
    // Only non-GK positions are affected by mentality depth adjustment
    const adjustedY = pos === 'GK'
      ? coord.y
      : Math.round(baseY * depthFactor);

    const x = Math.round(coord.x * scaleX);
    const y = Math.round(adjustedY * scaleY);

    // Push into array keyed by position name
    if (!positions[pos]) {
      positions[pos] = [];
    }
    positions[pos].push([x, y]);
  }

  return positions;
}

// ---------------------------------------------------------------------------
// computeOriginPOSForStarters(starters, formationName, pitchSize, strategy)
// → Array<[number, number]>  (one entry per starter, same order)
// ---------------------------------------------------------------------------

/**
 * Calculate originPOS for each starter based on the formation.
 * Handles paired positions (CB×2, CM×2, ST×2, etc.) by cycling through
 * the available slot coordinates for that position.
 *
 * @param {Array}  starters — [{ position, … }, …]  (11 players)
 * @param {string} formationName
 * @param {object} [pitchSize] — { pitchWidth, pitchHeight }
 * @param {object} [strategy]  — optional team strategy for depth adjustment
 * @returns {Array<[number, number]>}
 */
export function computeOriginPOSForStarters(starters, formationName, pitchSize, strategy) {
  const mentality = strategy?.mentality || 'balanced';
  const positionsMap = getFormationPositions(formationName, pitchSize, mentality);

  // Apply defensive line offset from team strategy (Layer 1 AI)
  const lineOffset = strategy?._defensiveLineOffset || 0;
  const height = pitchSize?.pitchHeight || 1050;

  // Track which slot index we're on for each position type
  const usage = {};

  return starters.map((starter) => {
    const pos = starter.position || 'CM';
    const slots = positionsMap[pos];
    if (!slots || slots.length === 0) {
      // Position not in this formation — fall back to CM slot
      const fallback = positionsMap['CM'];
      if (fallback && fallback.length > 0) {
        const idx = usage[pos] || 0;
        usage[pos] = idx + 1;
        const [fx, fy] = fallback[idx % fallback.length];
        // Apply line offset to non-GK positions
        const adjustedY = pos === 'GK' ? fy : Math.max(50, Math.min(height - 50, fy + lineOffset));
        return [fx, adjustedY];
      }
      return [340, 350]; // absolute fallback — centre circle
    }

    const idx = usage[pos] || 0;
    usage[pos] = idx + 1;
    const [sx, sy] = slots[idx % slots.length];
    // Apply line offset to non-GK positions
    const adjustedY = pos === 'GK' ? sy : Math.max(50, Math.min(height - 50, sy + lineOffset));
    return [sx, adjustedY];
  });
}

// ---------------------------------------------------------------------------
// getAdjustedLineY(baseY, mentality, pitchHeight)
// ---------------------------------------------------------------------------

/**
 * FM-style mentality-adjusted defensive line position.
 * Used when individual player Y positions need to be nudged up/down
 * based on the team's mental approach.
 */
export function getAdjustedLineY(baseY, mentality, pitchHeight) {
  const factor = _mentalityToDepthFactor(mentality);
  return Math.round(baseY * factor);
}

// ---------------------------------------------------------------------------
// getAvailableFormations() → string[]
// ---------------------------------------------------------------------------

/** Return all supported formation keys. */
export function getAvailableFormations() {
  return Object.keys(FORMATION_MATRIX);
}

// ---------------------------------------------------------------------------
// getFormationLabel(formationName) → string
// ---------------------------------------------------------------------------

/** Return the human-readable Chinese label for a formation. */
export function getFormationLabel(formationName) {
  return FORMATION_LABELS[formationName] || formationName;
}

// ---------------------------------------------------------------------------
// getDefaultFormation() → '4-4-2'
// ---------------------------------------------------------------------------

export function getDefaultFormation() {
  return '4-4-2';
}

// ---------------------------------------------------------------------------
// countPositionSlots(formationName, position) → number
// ---------------------------------------------------------------------------

/** How many slots does a formation allocate to a given position? (e.g. CB=2 in 4-4-2) */
export function countPositionSlots(formationName, position) {
  const slots = getFormationSlots(formationName);
  return slots.filter(s => s.pos === position).length;
}

// ---------------------------------------------------------------------------
// validateFormationName(name) → boolean
// ---------------------------------------------------------------------------

export function validateFormationName(name) {
  return FORMATION_MATRIX.hasOwnProperty(name);
}

// ===========================================================================
// INTERNAL HELPERS
// ===========================================================================

/**
 * Strip L/R/number suffix from a slot key to get the canonical position name.
 * "CBL" → "CB", "STL" → "ST", "CDML" → "CDM", "CAML" → "CAM", "AML" → "CAM"
 */
function _slotToPosition(slotKey) {
  // Special abbreviations
  if (slotKey === 'LWB' || slotKey === 'RWB') return slotKey; // keep as-is (treated as LB/RB in engine)
  if (slotKey.startsWith('AML')) return 'CAM';
  if (slotKey.startsWith('AMR')) return 'CAM';
  return slotKey.replace(/[LR]\d?$/, '').replace(/\d$/, '');
}

/**
 * Mentality → defensive line depth multiplier.
 * Attack pushes the defensive line higher; defend drops it deeper.
 */
function _mentalityToDepthFactor(mentality) {
  switch (mentality) {
    case 'ultra_attack':  return 1.15;
    case 'attack':        return 1.07;
    case 'defend':        return 0.93;
    case 'ultra_defend':  return 0.85;
    default:              return 1.00;  // 'balanced'
  }
}

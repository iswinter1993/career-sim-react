// stateMachine.js — explicit state model for the entire game lifecycle.
//
// This module replaces the previous implicit state logic (combinations of
// `phase`, `pendingEvent`, `pendingResult`, `spinning`, etc.) with named
// states and centralized transition logic.
//
// Top-level phases remain: INTRO → IDENTITY → CAREER → MATCH → SUMMARY
// Each phase has explicit sub-states derived from the raw engine/game state.
//
// The reducer delegates to the helpers exported here; components dispatch
// simple events ({ type: 'CHOOSE', index } or { type: 'CONTINUE' }) and
// the reducer routes based on the current sub-state.

import SIM from './simEngine';
import { ITERATIONS_PER_HALF } from './gameConfig';

// ---------------------------------------------------------------------------
// Phase & sub-state enums
// ---------------------------------------------------------------------------

export const PHASES = {
  INTRO: 'intro',
  IDENTITY: 'identity',
  CAREER: 'career',
  MATCH: 'match',
  SUMMARY: 'summary',
  DEMO: 'demo',
};

export const CAREER = {
  IDLE:           'career.idle',
  EVENT_CHOICE:   'career.event_choice',
  SPINNING:       'career.spinning',
  EVENT_RESULT:   'career.event_result',
  ACADEMY_CHOICE: 'career.academy_choice',
  TRANSFER_CHOICE:'career.transfer_choice',
  RECAP:          'career.recap',
  END:            'career.end',
};

export const MATCH = {
  INIT:      'match.init',
  TACTICS:   'match.tactics',
  PLAYING:   'match.playing',
  PAUSED:    'match.paused',
  FINISHED:  'match.finished',
};

// ---------------------------------------------------------------------------
// Sub-state derivation (pure — no side effects)
// ---------------------------------------------------------------------------

/** Derive the current CAREER sub-state from the game state. */
export function deriveCareerState(state) {
  const sim = state.simState;
  if (!sim || sim.phase === 'summary') return null;

  if (state.spinning)    return CAREER.SPINNING;
  if (state.pendingResult) return CAREER.EVENT_RESULT;

  const pending = sim.pending;
  if (!pending) return CAREER.IDLE;

  switch (pending.type) {
    case 'event':
    case 'random':  return CAREER.EVENT_CHOICE;
    case 'academy': return CAREER.ACADEMY_CHOICE;
    case 'transfer':return CAREER.TRANSFER_CHOICE;
    case 'recap':
    case 'report':  return CAREER.RECAP;
    case 'end':     return CAREER.END;
    default:        return CAREER.IDLE;
  }
}

/** Derive the current MATCH sub-state from the game state. */
export function deriveMatchState(state) {
  const ms = state.matchState;
  if (!ms) return null;
  if (ms.finished) return MATCH.FINISHED;
  // Tactics phase: paused + not yet confirmed. This must come BEFORE
  // the !ms.ready check — during tactics, ready is still false because
  // the engine hasn't been initialised yet (it only init'ed after the
  // user confirms tactics).
  if (ms.paused && !ms.tacticsDone) return MATCH.TACTICS;
  // Engine not initialised yet — transitional loading state.
  if (!ms.ready)   return MATCH.INIT;
  // Tactics done, but user paused during play.
  if (ms.paused)   return MATCH.PAUSED;
  return MATCH.PLAYING;
}

/** Derive the top-level phase + sub-state in one call. */
export function deriveFullState(state) {
  return {
    phase: state.phase,
    careerState: state.phase === PHASES.CAREER ? deriveCareerState(state) : null,
    matchState:  state.phase === PHASES.MATCH  ? deriveMatchState(state)  : null,
  };
}

// ---------------------------------------------------------------------------
// Career transition helpers (called by the reducer)
// Each returns { state: newState, animKey } — the reducer merges into context.
// ---------------------------------------------------------------------------

/** NEXT_STEP — advance the engine one tick. */
export function applyNextStep(state) {
  SIM.nextStep();
  const simState = SIM.state();

  if (simState?.ovr != null && simState?.age != null) {
    SIM.tickAttributes(simState.ovr, simState.age, simState.pos);
  }

  if (simState?.phase === 'summary') {
    return {
      phase: PHASES.SUMMARY,
      simState,
      pendingEvent: null,
      pendingResult: null,
      spinning: null,
    };
  }

  return {
    phase: PHASES.CAREER,
    simState,
    pendingEvent: simState?.pending || null,
    pendingResult: null,
    spinning: null,
  };
}

/** CHOOSE on an event/random pending — may route to spinning or result. */
export function applyChooseEvent(state, index) {
  const pending = state.simState?.pending;
  const resolved = SIM.resolveEvent(index);

  if (!resolved) {
    // Fallback
    console.warn('[stateMachine] resolveEvent returned null for index', index);
    SIM.cont();
    const simState = SIM.state();
    return {
      phase: PHASES.CAREER,
      simState,
      pendingEvent: simState?.pending || null,
      pendingResult: null,
      spinning: null,
    };
  }

  const { res, opt, roll } = resolved;
  const rawP = roll?.p;
  const p = rawP != null ? Math.min(Math.max(rawP, 0), 1) : null;
  const hasProb = p != null && p > 0.01 && p < 0.99;

  if (hasProb) {
    // Show spinning animation before committing
    let a = '成了', b = '没成';
    const hint = opt?.hint || '';
    const hintParts = hint.split(/\s*\/\s*/);
    if (hintParts.length === 2) {
      a = hintParts[0].replace(/^\d+%\s*/, '');
      b = hintParts[1].replace(/^\d+%\s*/, '');
    }
    const ok = roll?.ok ?? !!res;
    return {
      phase: PHASES.CAREER,
      simState: state.simState,
      pendingEvent: state.simState?.pending || null,
      pendingResult: null,
      spinning: { resolved, a, b, p, ok, index },
    };
  }

  // Deterministic — commit immediately
  SIM.commitEvent(res);
  const simState = SIM.state();
  return {
    phase: PHASES.CAREER,
    simState,
    pendingEvent: simState?.pending || null,
    pendingResult: simState?.pending?.result || resolved,
    spinning: null,
  };
}

/** SPIN_COMPLETE — commit the pre-determined event result. */
export function applySpinComplete(state) {
  const spin = state.spinning;
  if (!spin || !spin.resolved) return null;

  const engineResult = SIM.commitEvent(spin.resolved.res);
  const simState = SIM.state();
  return {
    phase: PHASES.CAREER,
    simState,
    spinning: null,
    pendingEvent: simState?.pending || null,
    pendingResult: engineResult || simState?.pending?.result || null,
  };
}

/** CHOOSE on an academy / transfer pending. */
export function applyChooseAcademyTransfer(state, index) {
  if (index === 'retire') {
    SIM.choose('retire');
  } else if (index === 'stay') {
    SIM.choose('stay');
  } else if (index === 'end') {
    SIM.goSummary('无处可去');
    const simState = SIM.state();
    return {
      phase: PHASES.SUMMARY,
      simState,
      pendingEvent: null,
      pendingResult: null,
      spinning: null,
    };
  } else {
    SIM.choose(index);
  }

  const simState = SIM.state();
  if (simState?.phase === 'summary') {
    return {
      phase: PHASES.SUMMARY,
      simState,
      pendingEvent: null,
      pendingResult: null,
      spinning: null,
    };
  }

  return {
    phase: PHASES.CAREER,
    simState,
    pendingEvent: simState?.pending || null,
    pendingResult: null,
    spinning: null,
  };
}

/** Start a match from the current career state. */
export function applyStartMatch(state) {
  return {
    phase: PHASES.MATCH,
    matchState: {
      identity: state.identity,
      simState: state.simState,
      pitch: null,
      maxIters: ITERATIONS_PER_HALF,
      matchDetails: null,
      paused: true,
      autoMode: false,
      substitutionsLeft: 3,
      iterationLog: [],
      events: [],
      stats: {},
      result: null,
      half: 1,
      finished: false,
      ready: false,
      tacticsDone: false,
    },
    pendingEvent: null,
    pendingResult: null,
  };
}

/** Leave match — advance engine and return to CAREER or SUMMARY. */
export function applyLeaveMatch(state) {
  SIM.cont();
  const simState = SIM.state();

  if (simState?.phase === 'summary') {
    return {
      phase: PHASES.SUMMARY,
      simState,
      matchState: null,
      pendingEvent: null,
      pendingResult: null,
    };
  }

  return {
    phase: PHASES.CAREER,
    simState,
    matchState: null,
    pendingEvent: simState?.pending || null,
    pendingResult: null,
  };
}

/** Continue past a resolved event result — advance the career (no match). */
export function applyContinueCareer(state) {
  SIM.cont();
  const simState = SIM.state();

  if (simState?.phase === 'summary') {
    return {
      phase: PHASES.SUMMARY,
      simState,
      pendingEvent: null,
      pendingResult: null,
      spinning: null,
    };
  }

  return {
    phase: PHASES.CAREER,
    simState,
    pendingEvent: simState?.pending || null,
    pendingResult: null,
    spinning: null,
  };
}

/** CONTINUE — dispatches based on current career sub-state. */
export function applyContinue(state) {
  const careerState = deriveCareerState(state);

  // If engine already in summary phase
  if (state.simState?.phase === 'summary') {
    SIM.goSummary('end');
    return {
      phase: PHASES.SUMMARY,
      simState: SIM.state(),
      pendingEvent: null,
      pendingResult: null,
      spinning: null,
    };
  }

  switch (careerState) {
    // 赛季回顾（recap/report）→ 判定进入模拟比赛 → 赛前设置 → 比赛页
    case CAREER.RECAP:
      return applyStartMatch(state);

    // 事件结果后点继续 → 不是比赛，而是继续推进生涯
    case CAREER.EVENT_RESULT:
      return applyContinueCareer(state);

    case CAREER.END:
      SIM.goSummary('无处可去');
      return {
        phase: PHASES.SUMMARY,
        simState: SIM.state(),
        pendingEvent: null,
        pendingResult: null,
        spinning: null,
      };

    case CAREER.EVENT_CHOICE:
    case CAREER.ACADEMY_CHOICE:
    case CAREER.TRANSFER_CHOICE:
    case CAREER.SPINNING:
      // Not actionable — ignore
      return null;

    default:
      return applyNextStep(state);
  }
}

/** CHOOSE — dispatches based on current career sub-state. */
export function applyChoose(state, index) {
  const careerState = deriveCareerState(state);

  if (state.simState?.phase === 'summary') {
    return {
      phase: PHASES.SUMMARY,
      simState: state.simState,
      pendingEvent: null,
      pendingResult: null,
      spinning: null,
    };
  }

  switch (careerState) {
    case CAREER.EVENT_CHOICE:
      return applyChooseEvent(state, index);

    case CAREER.ACADEMY_CHOICE:
    case CAREER.TRANSFER_CHOICE:
      return applyChooseAcademyTransfer(state, index);

    case CAREER.EVENT_RESULT:
      // Clicking while an event result is showing → continue career (no match)
      return applyContinueCareer(state);

    case CAREER.RECAP:
      // Clicking while the season recap is showing → start match
      return applyStartMatch(state);

    case CAREER.END:
      SIM.goSummary('无处可去');
      return {
        phase: PHASES.SUMMARY,
        simState: SIM.state(),
        pendingEvent: null,
        pendingResult: null,
        spinning: null,
      };

    default:
      // No pending — advance step
      return applyNextStep(state);
  }
}

// ---------------------------------------------------------------------------
// Match transition helpers
// ---------------------------------------------------------------------------

export function applyMatchReady(state, matchDetails, homeSquad, awaySquad) {
  if (!state.matchState) return null;
  return {
    matchState: {
      ...state.matchState,
      matchDetails,
      homeSquad: homeSquad || state.matchState.homeSquad,
      awaySquad: awaySquad || state.matchState.awaySquad,
      ready: true,
    },
  };
}

export function applyTickIteration(state, md, opts = {}) {
  if (!state.matchState) return null;
  // Shallow-clone matchDetails so React sees a new reference.
  // The engine mutates the same object in-place; without this,
  // useEffect([matchDetails]) never re-fires → no Canvas animation,
  // stale stats, and no commentary updates.
  return {
    matchState: {
      ...state.matchState,
      matchDetails: { ...md },
      iterationLog: opts.iterationLog || state.matchState.iterationLog,
      events: opts.events || state.matchState.events,
      stats: opts.stats || state.matchState.stats,
      half: opts.half ?? state.matchState.half,
      finished: opts.finished ?? state.matchState.finished,
      result: opts.result || state.matchState.result,
    },
  };
}

export function applyPauseMatch(state) {
  if (!state.matchState) return null;
  return { matchState: { ...state.matchState, paused: true } };
}

export function applyResumeMatch(state) {
  if (!state.matchState) return null;
  return { matchState: { ...state.matchState, paused: false, autoMode: false, tacticsDone: true } };
}

export function applySubstitute(state, { matchDetails, homeSquad, awaySquad }) {
  if (!state.matchState) return null;
  const subLeft = state.matchState.substitutionsLeft - 1;
  if (subLeft < 0) return null;
  return {
    matchState: {
      ...state.matchState,
      matchDetails: matchDetails || state.matchState.matchDetails,
      substitutionsLeft: subLeft,
      homeSquad: homeSquad || state.matchState.homeSquad,
      awaySquad: awaySquad || state.matchState.awaySquad,
    },
  };
}

export function applyMatchComplete(state, { matchDetails, result, ratings, mvp, growthDeltas, matchResult }) {
  if (!state.matchState) return null;
  return {
    matchState: {
      ...state.matchState,
      matchDetails,
      result,
      finished: true,
      ratings: ratings || null,
      mvp: mvp || null,
      growthDeltas: growthDeltas || {},
      autoMode: false,
    },
  };
}

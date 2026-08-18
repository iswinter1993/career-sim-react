import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import SIM from './simEngine';
import {
  PHASES,
  deriveCareerState,
  deriveMatchState,
  applyChoose,
  applyContinue,
  applyStartMatch,
  applyLeaveMatch,
  applySpinComplete,
  applyMatchReady,
  applyTickIteration,
  applyPauseMatch,
  applyResumeMatch,
  applySubstitute,
  applyMatchComplete,
} from './stateMachine';

const GameContext = createContext(null);

const initialState = {
  phase: PHASES.INTRO,
  mode: 'normal',
  simState: null,
  pendingEvent: null,
  pendingResult: null,
  step: 0,
  identity: null,
  seed: null,
  animKey: 0,
  showHelp: false,
  showNews: false,
  showShare: false,
  spinning: null,
  matchState: null,
};

/** Merge a partial update returned by the state machine into the full state. */
function mergeState(state, update) {
  if (!update) return state;
  return { ...state, ...update, animKey: state.animKey + 1 };
}

function gameReducer(state, action) {
  switch (action.type) {

    // UI-only actions (no state machine delegation needed)
    case 'SET_MODE':
      return { ...state, mode: action.mode };
    case 'SET_STEP':
      return { ...state, step: action.step };
    case 'SET_IDENTITY':
      return { ...state, identity: { ...state.identity, ...action.identity } };
    case 'START_IDENTITY':
      return { ...state, phase: PHASES.IDENTITY, step: 1 };

    case 'OPEN_DEMO':
      return { ...state, phase: PHASES.DEMO };

    case 'START_CAREER': {
      const seed = action.seed || String(Math.floor(Math.random() * 1000000000));
      const simState = SIM.newState(state.mode, state.identity, seed);
      SIM.initAttributes(state.identity, seed, simState?.ovr);
      return {
        ...state,
        phase: PHASES.CAREER,
        simState,
        seed,
        pendingEvent: null,
        pendingResult: null,
        animKey: state.animKey + 1,
      };
    }

    // -------------------------------------------------------------------
    // Career actions — delegated to state machine
    // -------------------------------------------------------------------
    case 'NEXT_STEP':
      return mergeState(state, applyContinue(state));

    case 'CHOOSE':
      return mergeState(state, applyChoose(state, action.index));

    case 'CONTINUE':
      return mergeState(state, applyContinue(state));

    case 'SPIN_COMPLETE':
      return mergeState(state, applySpinComplete(state));

    case 'START_MATCH':
      return mergeState(state, applyStartMatch(state));

    case 'LEAVE_MATCH':
      return mergeState(state, applyLeaveMatch(state));

    case 'GO_SUMMARY': {
      SIM.goSummary(action.reason);
      return {
        ...state,
        phase: PHASES.SUMMARY,
        simState: SIM.state(),
        pendingEvent: null,
        pendingResult: null,
        spinning: null,
        animKey: state.animKey + 1,
      };
    }

    // -------------------------------------------------------------------
    // Match actions — thin wrappers
    // -------------------------------------------------------------------
    case 'MATCH_READY':
      return mergeState(state, applyMatchReady(state, action.matchDetails, action.homeSquad, action.awaySquad));

    case 'TICK_ITERATION':
      return mergeState(state, applyTickIteration(state, action.matchDetails, {
        iterationLog: action.iterationLog,
        events: action.events,
        stats: action.stats,
        half: action.half,
        finished: action.finished,
        result: action.result,
      }));

    case 'PAUSE_MATCH':
      return mergeState(state, applyPauseMatch(state));

    case 'RESUME_MATCH':
      return mergeState(state, applyResumeMatch(state));

    case 'SUBSTITUTE':
      return mergeState(state, applySubstitute(state, {
        matchDetails: action.matchDetails,
        homeSquad: action.homeSquad,
        awaySquad: action.awaySquad,
      }));

    case 'MATCH_COMPLETE':
      return mergeState(state, applyMatchComplete(state, {
        matchDetails: action.matchDetails,
        result: action.result,
        ratings: action.ratings,
        mvp: action.mvp,
        growthDeltas: action.growthDeltas,
      }));

    // UI toggles
    case 'RESTART':
      return { ...initialState, mode: state.mode, seed: null, identity: null };
    case 'BACK_TO_INTRO':
      return { ...initialState, mode: state.mode };
    case 'TOGGLE_HELP':
      return { ...state, showHelp: !state.showHelp };
    case 'TOGGLE_NEWS':
      return { ...state, showNews: !state.showNews };
    case 'TOGGLE_SHARE':
      return { ...state, showShare: !state.showShare };

    default:
      return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const engineReady = useRef(false);

  useEffect(() => {
    const check = () => {
      if (window.SIM && window.DATA) {
        SIM.init();
        engineReady.current = true;
        dispatch({ type: 'SET_MODE', mode: state.mode });
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  }, []);

  const value = {
    state,
    dispatch,
    PHASES,
    engineReady: engineReady.current,
    // Expose derived sub-states for convenience
    careerState: deriveCareerState(state),
    matchPhase: deriveMatchState(state),
  };

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}

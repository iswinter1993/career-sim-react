import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import SIM from './simEngine';

const GameContext = createContext(null);

// Phases matching the original game
const PHASES = {
  INTRO: 'intro',
  IDENTITY: 'identity',
  CAREER: 'career',
  SUMMARY: 'summary',
};

const initialState = {
  phase: PHASES.INTRO,
  mode: 'normal',
  simState: null,
  pendingEvent: null,     // { type, eventId } or { type, recs } or { type, offers, fired, canStay, canRetire }
  pendingResult: null,    // After choosing an event option
  step: 0,                // Identity creation step (0-2)
  identity: null,         // Player identity: { name, number, foot, pos, originId }
  seed: null,
  animKey: 0,
  showHelp: false,
  showNews: false,
  showShare: false,
  spinning: null,         // { resolved, a, b, p, ok } — slot-machine spin before committing
};

function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.mode };

    case 'SET_STEP':
      return { ...state, step: action.step };

    case 'SET_IDENTITY':
      return { ...state, identity: { ...state.identity, ...action.identity } };

    case 'START_IDENTITY':
      return { ...state, phase: PHASES.IDENTITY, step: 1 };

    case 'START_CAREER': {
      const seed = action.seed || String(Math.floor(Math.random() * 1000000000));
      const simState = SIM.newState(state.mode, state.identity, seed);
      // Anchor the attribute baseline to the engine's starting OVR (age 16) so
      // the first NEXT_STEP tick computes a real delta instead of 0.
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

    case 'NEXT_STEP': {
      SIM.nextStep();
      const simState = SIM.state();
      const pending = simState?.pending;

      // Sync attribute module with engine state
      if (simState?.ovr != null && simState?.age != null) {
        SIM.tickAttributes(simState.ovr, simState.age, simState.pos);
      }

      // Engine may reach summary phase immediately (forced retirement by age).
      if (simState?.phase === 'summary') {
        return {
          ...state,
          phase: PHASES.SUMMARY,
          simState,
          pendingEvent: null,
          pendingResult: null,
          animKey: state.animKey + 1,
        };
      }

      return {
        ...state,
        simState,
        pendingEvent: pending || null,
        pendingResult: null,
        animKey: state.animKey + 1,
      };
    }

    case 'CHOOSE_EVENT': {
      const pending = state.simState?.pending;
      const pendingType = pending?.type;

      // Follow the original game's bE() flow:
      //   1. resolveEvent(index) to get {res, opt, roll}
      //   2. If roll.p in (0.005, 0.995): set spinning, play animation
      //      Animation callback → commitEvent(res) → show result
      //   3. If deterministic: commitEvent(res) directly

      if (pendingType === 'random' || pendingType === 'event') {
        const resolved = SIM.resolveEvent(action.index);
        if (resolved) {
          const { res, opt, roll } = resolved;
          const rawP = roll?.p;
          // Clamp: engine dynamic probs (Math.max(0.7, (ovr-50)/40)) may exceed 1.0
          const p = rawP != null ? Math.min(Math.max(rawP, 0), 1) : null;
          const hasProb = p != null && p > 0.01 && p < 0.99;

          if (hasProb) {
            // Has non-trivial probability → show spinning animation first.
            // Don't commit yet; resolveEvent already determined the outcome
            // (resolved.res reflects the winning branch). Store resolved so
            // SPIN_COMPLETE can commit the same result without re-running RNG.
            //
            // Parse slot labels from opt.hint (e.g. "70% 过 / 30% 整期无法报名")
            // The first segment after stripping the percentage is "a", the second is "b".
            let a = '成了', b = '没成';
            const hint = opt?.hint || '';
            const hintParts = hint.split(/\s*\/\s*/);
            if (hintParts.length === 2) {
              a = hintParts[0].replace(/^\d+%\s*/, '');
              b = hintParts[1].replace(/^\d+%\s*/, '');
            }
            const ok = roll?.ok ?? !!res;
            return {
              ...state,
              spinning: { resolved, a, b, p, ok, index: action.index },
              pendingResult: null,
              animKey: state.animKey + 1,
            };
          }

          // Deterministic — no spin needed, commit immediately
          SIM.commitEvent(res);
          const simState = SIM.state();
          return {
            ...state,
            simState,
            pendingEvent: simState?.pending || null,
            pendingResult: simState?.pending?.result || resolved,
            spinning: null,
            animKey: state.animKey + 1,
          };
        }

        // resolveEvent failed — log warning and fall through to engine's cont()
        console.warn('[GameContext] resolveEvent returned null for index', action.index, 'pending type:', pendingType);
        SIM.cont();
        const simState = SIM.state();
        return {
          ...state,
          simState,
          pendingEvent: simState?.pending || null,
          pendingResult: null,
          spinning: null,
          animKey: state.animKey + 1,
        };
      }

      // academy / transfer / end — use engine's choose() directly
      const result = SIM.choose(action.index);
      const simState = SIM.state();


      if (simState?.phase === 'summary') {
        return {
          ...state,
          phase: PHASES.SUMMARY,
          simState,
          pendingEvent: null,
          pendingResult: null,
          spinning: null,
          animKey: state.animKey + 1,
        };
      }

      return {
        ...state,
        simState,
        pendingEvent: simState?.pending || null,
        pendingResult: result?.res ? result : null,
        spinning: null,
        animKey: state.animKey + 1,
      };
    }

    case 'SPIN_COMPLETE': {
      // Animation finished — commit the result that resolveEvent already
      // determined back in CHOOSE_EVENT. This matches the original game's
      // flow: resolve → spin → commit.
      const spin = state.spinning;
      if (!spin || !spin.resolved) return state;

      const { resolved } = spin;
      const engineResult = SIM.commitEvent(resolved.res);
      const simState = SIM.state();
      return {
        ...state,
        simState,
        spinning: null,
        pendingEvent: simState?.pending || null,
        // commitEvent result is authoritative; fall back to state.pending.result
        pendingResult: engineResult || simState?.pending?.result || null,
        animKey: state.animKey + 1,
      };
    }

    case 'CHOOSE_RETIRE': {
      SIM.choose('retire');
      const simState = SIM.state();
      if (simState?.phase === 'summary') {
        return {
          ...state,
          phase: PHASES.SUMMARY,
          simState,
          pendingEvent: null,
          pendingResult: null,
          animKey: state.animKey + 1,
        };
      }
      return {
        ...state,
        simState,
        pendingEvent: simState?.pending || null,
        pendingResult: null,
        animKey: state.animKey + 1,
      };
    }

    case 'CHOOSE_STAY': {
      SIM.choose('stay');
      const simState = SIM.state();
      const pending = simState?.pending;
      if (simState?.phase === 'summary') {
        return {
          ...state,
          phase: PHASES.SUMMARY,
          simState,
          pendingEvent: null,
          pendingResult: null,
          animKey: state.animKey + 1,
        };
      }
      return {
        ...state,
        simState,
        pendingEvent: pending || null,
        pendingResult: null,
        animKey: state.animKey + 1,
      };
    }

    case 'CONTINUE': {
      SIM.cont();
      const simState = SIM.state();
      const pending = simState?.pending;


      // Check if career ended
      if (simState?.phase === 'summary') {
        return {
          ...state,
          phase: PHASES.SUMMARY,
          simState,
          pendingEvent: null,
          pendingResult: null,
          animKey: state.animKey + 1,
        };
      }
      return {
        ...state,
        simState,
        pendingEvent: pending || null,
        pendingResult: null, // clear pending result after cont
        animKey: state.animKey + 1,
      };
    }

    case 'GO_SUMMARY': {
      SIM.goSummary(action.reason);
      const simState = SIM.state();
      return {
        ...state,
        phase: PHASES.SUMMARY,
        simState,
        pendingEvent: null,
        pendingResult: null,
        animKey: state.animKey + 1,
      };
    }

    case 'RESTART':
      return {
        ...initialState,
        mode: state.mode,
        seed: null,
        identity: null,
      };

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

  // Initialize engine once scripts are loaded
  useEffect(() => {
    const check = () => {
      if (window.SIM && window.DATA) {
        SIM.init();
        engineReady.current = true;
        // Force re-render
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

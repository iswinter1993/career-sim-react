// [DEPRECATED] 已弃用 — 比赛会话逻辑改由 vendor RealTimeEngine 直接驱动。
// 本文件保留仅作历史参考，无任何活代码引用（仅被已弃用的 MatchView.jsx 引用）。
// matchSession.js — Design Pattern #6: EngineSession
//
// Wraps the stateless engine API (createMatch / runIteration / startSecondHalf
// / destroyMatch) behind a single per-match session object. The session is the
// source of truth for a match's lifecycle:
//
//   create → advance(burst) → (interventions via commandHistory) → destroy
//
// It owns the mutable matchDetails (reassigned every tick, since the engine can
// return a new object), the event bus (attached by createMatch), and the Command
// history (Design Pattern #2). Consumers stop passing raw matchDetails around and
// instead call methods on one object — which also gives later patterns (#8 dirty
// marking, #10 memento) a single home to hang off.
//
// Public API:
//   createMatchSession({ homeTeam, awayTeam, pitch, tactics }) → session
//   session.matchDetails   (getter — always the latest state, never keep a stale ref)
//   session.commandHistory (undo/redo for substitutions & formation changes)
//   session.iterate()      → advance one engine tick
//   session.advance(burst) → advance up to `burst` ticks + half-time transition,
//                            returns { matchDetails, finished }
//   session.isFinished() / iterationCount() / summary() / playerStats() / events()
//   session.on(type, fn) / off(type, fn)  — event-bus passthrough (Pattern #1)
//   session.save() / load(snapshot) / serialize() / deserialize(json)
//                                          — memento save/restore (Pattern #10)
//   session.destroy()      → restore console.log; idempotent

import * as MatchEngine from './matchEngine.js';
import { createCommandHistory } from './matchCommands.js';

export async function createMatchSession({ homeTeam, awayTeam, pitch, tactics }) {
  let md = await MatchEngine.createMatch(homeTeam, awayTeam, pitch, tactics);
  const commandHistory = createCommandHistory();
  const maxIters = MatchEngine.DEFAULT_ITERATIONS;
  let destroyed = false;

  const session = {
    get matchDetails() {
      return md;
    },
    get commandHistory() {
      return commandHistory;
    },
    get destroyed() {
      return destroyed;
    },

    /** Advance one engine tick. Returns the (possibly new) matchDetails. */
    async iterate() {
      md = await MatchEngine.runIteration(md);
      return md;
    },

    /**
     * Advance up to `burst` iterations, handling the half-time transition and
     * signalling when the match reaches full time. Mirrors the legacy tick loop:
     * break early if already past the second-half limit, switch sides when the
     * first half's iteration budget is exhausted.
     */
    async advance(burst = 4) {
      for (let b = 0; b < burst; b++) {
        if (MatchEngine.getIterationCount(md) >= maxIters && md._half === 2) break;
        md = await MatchEngine.runIteration(md);
        if (MatchEngine.getIterationCount(md) >= maxIters && md._half === 1) {
          md = await MatchEngine.startSecondHalf(md);
          break;
        }
      }
      return { matchDetails: md, finished: session.isFinished() };
    },

    isFinished() {
      return MatchEngine.getIterationCount(md) >= maxIters && md._half === 2;
    },
    iterationCount() {
      return MatchEngine.getIterationCount(md);
    },
    summary() {
      return MatchEngine.getMatchSummary(md);
    },
    playerStats() {
      return MatchEngine.getPlayerStats(md);
    },
    events() {
      return MatchEngine.parseIterationEvents(md);
    },

    // Memento save/restore (Design Pattern #10). The session stays the single
    // source of truth: save() snapshots the current match, load() swaps in a
    // restored match and returns it.
    save() {
      return MatchEngine.saveMatch(md);
    },
    load(snapshot) {
      if (!snapshot) return md;
      md = MatchEngine.loadMatch(snapshot);
      return md;
    },
    serialize() {
      return MatchEngine.serializeMatch(md);
    },
    deserialize(json) {
      md = MatchEngine.deserializeMatch(json);
      return md;
    },

    // Event-bus passthrough (Design Pattern #1: Observer)
    on(type, fn) {
      md._eventBus?.on(type, fn);
      return session;
    },
    off(type, fn) {
      md._eventBus?.off(type, fn);
      return session;
    },

    /** Restore console.log. Idempotent — safe to call from multiple exit paths. */
    destroy() {
      if (destroyed) return;
      destroyed = true;
      MatchEngine.destroyMatch();
    },
  };

  return session;
}

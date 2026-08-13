// matchMemento.js — Design Pattern #10: Memento (save/restore mid-match state)
//
// Lets the game capture the full match state as a serializable snapshot and
// restore it later (mid-match save file, undo-after-quit, career resume). The
// engine's matchDetails is almost entirely plain JSON, EXCEPT for two runtime
// objects that hold closures / live getters and must be re-attached on restore:
//
//   _eventBus     — observer bus (Map of subscriber closures). Rebuilt here and
//                   re-wired with the stats subscriber supplied by matchEngine.
//   _statsTracker — plain data, but its per-player stats use getter aliases
//                   (dribbles / errors / runs). JSON.stringify would freeze
//                   those getters into stale static values, so restore
//                   re-creates them via createEmptyPlayerStats() and copies only
//                   the raw fields.
//
// The Memento captures state, not identity: captureMatchState deep-clones via a
// JSON round-trip, so the returned snapshot (and any restore from it) can be
// mutated without touching the live match — the key invariant the Memento
// pattern guarantees.
//
// Public API:
//   captureMatchState(md)                → serializable snapshot (no runtime refs)
//   restoreMatchState(snapshot, opts)    → live matchDetails with runtime re-attached
//   serializeMatchState(md)              → JSON string (for storage)
//   deserializeMatchState(json, opts)    → matchDetails from a saved string
//   opts.statsSubscriber                 → (ev, ctx) => void — re-wired onto the bus

import { createMatchEventBus } from './matchEvents.js';
import { createMatchStatsTracker, createEmptyPlayerStats } from './engine/lib/matchStats.js';

// Runtime-only keys stripped from the snapshot and rebuilt on restore.
const RUNTIME_KEYS = new Set(['_eventBus']);

// Getter aliases on player stats that JSON.stringify would freeze into stale
// static values. Skipped on rehydrate so the fresh objects keep live getters.
const STAT_ALIAS_KEYS = new Set(['dribbles', 'errors', 'runs']);

function deepClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Rebuild a live stats tracker from a serialized one, preserving raw counters
 * while re-instantiating getter aliases (dribbles/errors/runs).
 */
function rehydrateTracker(raw) {
  const tracker = createMatchStatsTracker();
  if (!raw) return tracker;

  tracker.matchEvents = deepClone(raw.matchEvents) || [];
  tracker.teamStats = deepClone(raw.teamStats) || tracker.teamStats;

  for (const side of ['home', 'away']) {
    const rawTeam = raw[side];
    if (!rawTeam) continue;

    for (const [pid, rawStats] of Object.entries(rawTeam.players || {})) {
      const target = createEmptyPlayerStats();
      for (const [k, v] of Object.entries(rawStats)) {
        if (STAT_ALIAS_KEYS.has(k)) continue;
        target[k] = v;
      }
      tracker[side].players[pid] = target;
    }

    const rawTotal = rawTeam.total;
    if (rawTotal) {
      for (const [k, v] of Object.entries(rawTotal)) {
        if (STAT_ALIAS_KEYS.has(k)) continue;
        tracker[side].total[k] = v;
      }
    }
  }

  return tracker;
}

/**
 * Capture a serializable snapshot of the match. Excludes runtime-only fields
 * (_eventBus) and deep-clones the rest so the snapshot is independent of the
 * live matchDetails. Safe to JSON.stringify for storage.
 *
 * @param {object} matchDetails
 * @returns {object|null} snapshot
 */
export function captureMatchState(matchDetails) {
  if (!matchDetails) return null;

  const snapshot = {};
  for (const key of Object.keys(matchDetails)) {
    if (RUNTIME_KEYS.has(key)) continue;
    snapshot[key] = deepClone(matchDetails[key]);
  }
  return snapshot;
}

/**
 * Restore a live matchDetails from a snapshot. Re-attaches the runtime objects:
 * a fresh _eventBus (wired to `statsSubscriber`) and a rehydrated _statsTracker
 * with live getters. Returns a NEW object — the original snapshot is untouched.
 *
 * @param {object} snapshot — from captureMatchState
 * @param {object} [opts] — { statsSubscriber }
 * @returns {object} live matchDetails
 */
export function restoreMatchState(snapshot, opts = {}) {
  if (!snapshot) return null;

  const md = {};
  for (const key of Object.keys(snapshot)) {
    if (RUNTIME_KEYS.has(key)) continue;
    md[key] = deepClone(snapshot[key]);
  }

  // Re-attach the stats tracker (live getters) and wire the bus subscriber.
  md._statsTracker = rehydrateTracker(snapshot._statsTracker);
  md._eventBus = createMatchEventBus();
  if (typeof opts.statsSubscriber === 'function') {
    md._eventBus.on('*', (ev, ctx) => opts.statsSubscriber(ev, ctx));
  }

  return md;
}

/**
 * Serialize a match to a JSON string for storage (localStorage / save file).
 *
 * @param {object} matchDetails
 * @returns {string} JSON
 */
export function serializeMatchState(matchDetails) {
  return JSON.stringify(captureMatchState(matchDetails));
}

/**
 * Deserialize a saved JSON string back into a live matchDetails.
 *
 * @param {string} json
 * @param {object} [opts] — { statsSubscriber }
 * @returns {object} live matchDetails
 */
export function deserializeMatchState(json, opts = {}) {
  return restoreMatchState(JSON.parse(json), opts);
}

// dirtyMemo.js — Design Pattern #8: Dirty Flag / memoization
//
// Derived data (match summary, per-player stats) is recomputed from mutable
// match state every time the UI renders — even when nothing changed (pause,
// tab switch, panel toggle). The Dirty Flag pattern tags the source state with
// a revision counter that increments whenever it mutates, then memoizes
// derived results keyed on that revision. Unchanged state is never recomputed;
// any mutation invalidates the cache.
//
// The revision lives on the matchDetails object itself as `_revision`, and is
// bumped by the mutation points in matchEngine.js (runIteration, startSecondHalf,
// applySubstitution, applyFormationChange).
//
// Public API:
//   bumpRevision(obj)        → increment obj._revision, return the new value
//   getRevision(obj)         → obj._revision ?? 0
//   memoizeByRevision(fn)    → single-argument memo wrapper keyed on
//                              (argument identity, argument._revision)

export function bumpRevision(obj) {
  if (!obj) return 0;
  obj._revision = (obj._revision || 0) + 1;
  return obj._revision;
}

export function getRevision(obj) {
  return obj?._revision || 0;
}

/**
 * Memoize a single-argument function against a Dirty Flag. The result is cached
 * and reused while (a) the argument is the same object identity and (b) its
 * `_revision` has not changed. A single-entry cache is enough for the render
 * loop (calls are sequential, single-threaded).
 *
 * @param {Function} fn — (arg) => derived result
 * @returns {Function} memoized wrapper with the same signature
 */
export function memoizeByRevision(fn) {
  let cachedArg = null;
  let cachedRev = -1;
  let cachedResult;
  let hasCache = false;

  return function memoized(arg) {
    const rev = arg?._revision || 0;
    if (hasCache && cachedArg === arg && cachedRev === rev) {
      return cachedResult;
    }
    cachedArg = arg;
    cachedRev = rev;
    cachedResult = fn(arg);
    hasCache = true;
    return cachedResult;
  };
}

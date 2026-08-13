// matchEvents.js — structured match-event pipeline (Design Pattern #1: Observer)
//
// The engine writes flat English strings to `matchDetails.iterationLog` every
// tick. Historically three separate code paths (stats tracking, commentary
// translation, event classification) each re-parsed those strings with their
// own regexes. This module consolidates that into ONE parser that produces
// typed event objects, plus an observer bus so stats / commentary / ratings
// (and future subscribers) all consume the same structured events.
//
// Public API:
//   parseMatchEvent(text)        → { type, coarse, rawText, playerName, teamName, onTarget, won }
//   createMatchEventBus()        → { on, off, emit, clear, listenerCount }
//   emitLogEvents(md, entries)   → parse + emit each entry on md._eventBus
//                                  (pooled — returns the number of events emitted)

import { createObjectPool } from './objectPool.js';

// ---------------------------------------------------------------------------
// 1. Structured parser — ordered matchers (most specific first)
// ---------------------------------------------------------------------------

const MATCHERS = [
  { type: 'goal',           re: /goal scored by - (.+?) - \((.+?)\)/i, name: 1, team: 2 },
  { type: 'goal',           re: /own goal/i },
  { type: 'save',           re: /ball saved by (.+?) possesion to (.+)/i, name: 1, team: 2 },
  { type: 'save',           re: /ball saved/i },
  { type: 'red_card',       re: /red card for: (.+)/i, name: 1 },
  { type: 'yellow_card',    re: /yellow card for: (.+)/i, name: 1 },
  { type: 'foul',           re: /foul against: (.+)/i, name: 1 },
  { type: 'foul',           re: /handball by (.+)/i, name: 1 },
  { type: 'penalty',        re: /penalty taken by: (.+)/i, name: 1 },
  { type: 'penalty',        re: /penalty/i },
  { type: 'offside',        re: /(.+?) is offside/i, name: 1 },
  { type: 'offside',        re: /offside/i },
  { type: 'corner',         re: /corner to - (.+)/i, team: 1 },
  { type: 'goal_kick',      re: /goal kick to - (.+)/i, team: 1 },
  { type: 'freekick',       re: /free kick taken by: (.+)/i, name: 1 },
  { type: 'freekick',       re: /freekick to: (.+?) \[/i, team: 1 },
  { type: 'freekick',       re: /freekick/i },
  { type: 'throw_in',       re: /throw in to - (.+)/i, team: 1 },
  { type: 'tackle',         re: /successful tackle by: (.+)/i, name: 1, won: true },
  { type: 'slide_tackle',   re: /slide tackle attempted by: (.+)/i, name: 1, won: false },
  { type: 'tackle_attempt', re: /tackle attempted by: (.+)/i, name: 1, won: false },
  { type: 'tackle_fail',    re: /failed tackle by: (.+)/i, name: 1, won: false },
  { type: 'shot',           re: /header shot by: (.+)/i, name: 1 },
  { type: 'shot',           re: /volley shot by: (.+)/i, name: 1 },
  { type: 'shot',           re: /shot made by: (.+)/i, name: 1 },
  { type: 'shot_on_target', re: /shot on target/i, onTarget: true },
  { type: 'shot_off_target', re: /shot off target/i, onTarget: false },
  { type: 'through_ball',   re: /through ball attempted by: (.+)/i, name: 1 },
  { type: 'through_target', re: /through ball target: (.+)/i, name: 1 },
  { type: 'pass',           re: /ball passed by: (.+)/i, name: 1 },
  { type: 'cross',          re: /ball crossed by: (.+)/i, name: 1 },
  { type: 'header',         re: /header made by: (.+)/i, name: 1 },
  { type: 'volley',         re: /volley kick made by: (.+)/i, name: 1 },
  { type: 'injury',         re: /player injured - (.+)/i, name: 1 },
  { type: 'pass_intercepted', re: /pass intercepted by (.+)/i, name: 1 },
  { type: 'interception',   re: /(.+?) has the ball/i, name: 1 },
  { type: 'sub',            re: /sub:/i },
  { type: 'tactical',       re: /tactical|formation/i },
  { type: 'kickoff',        re: /team to kick off - (.+)/i, team: 1 },
  { type: 'half_start',     re: /second half started/i },
];

// Coarse classification — kept VERBATIM from the legacy `_classifyEvent` so
// commentary/icon behaviour is bit-for-bit unchanged. `parseMatchEvent`'s
// granular `type` is only additive (used by stats subscribers); `coarse` is
// what the UI has always seen.
export function classifyCoarse(text) {
  const t = text.toLowerCase();

  if (t.includes('goal scored')) return 'goal';
  if (t.includes('own goal')) return 'goal';
  if (t.includes('ball saved') || t.includes('ball saved by')) return 'save';
  if (t.includes('yellow card') || t.includes('red card')) return 'foul';
  if (t.includes('offside')) return 'offside';
  if (t.includes('foul') || t.includes('handball')) return 'foul';
  if (t.includes('penalty')) return 'foul';
  if (t.includes('corner')) return 'corner';
  if (t.includes('goal kick')) return 'info';
  if (t.includes('freekick') || t.includes('free kick')) return 'info';
  if (t.includes('throw in')) return 'info';
  if (t.includes('tackle') && !t.includes('tactical')) return 'tackle';
  if (t.includes('shot made') || t.includes('shot by') || t.includes('shot on') || t.includes('shot off')) return 'shot';
  if (t.includes('pass') || t.includes('passed') || t.includes('through ball')) return 'pass';
  if (t.includes('cross')) return 'cross';
  if (t.includes('injur')) return 'injury';
  if (t.includes('sub:') || t.includes('replaces')) return 'sub';
  if (t.includes('tactical') || t.includes('formation')) return 'tactical';

  return 'info';
}

/**
 * Fill a (possibly pooled) event object with the parsed result of a single
 * engine log string. Sets every field, so a recycled object is fully refreshed.
 *
 * @param {object} ev — target object to mutate in place
 * @param {string} text — engine log entry
 * @returns {object} the same `ev`
 */
export function fillEvent(ev, text) {
  if (typeof text !== 'string' || !text) {
    ev.type = 'info';
    ev.coarse = 'info';
    ev.rawText = text || '';
    ev.playerName = null;
    ev.teamName = null;
    ev.onTarget = undefined;
    ev.won = undefined;
    return ev;
  }

  let type = 'info';
  let playerName = null;
  let teamName = null;
  let onTarget = undefined;
  let won = undefined;

  for (const m of MATCHERS) {
    const match = text.match(m.re);
    if (match) {
      type = m.type;
      if (m.name && match[m.name]) playerName = match[m.name].trim();
      if (m.team && match[m.team]) teamName = match[m.team].trim();
      if (m.onTarget !== undefined) onTarget = m.onTarget;
      if (m.won !== undefined) won = m.won;
      break;
    }
  }

  ev.type = type;
  ev.coarse = classifyCoarse(text);
  ev.rawText = text;
  ev.playerName = playerName;
  ev.teamName = teamName;
  ev.onTarget = onTarget;
  ev.won = won;
  return ev;
}

/**
 * Parse a single engine log string into a structured, typed event.
 * Pure — no matchDetails needed. Granular `type` is for stats/subscribers;
 * `coarse` reproduces the legacy commentary classification exactly.
 *
 * Returns a fresh object — safe for callers to retain. (The hot path in
 * emitLogEvents uses the pooled fillEvent instead; see below.)
 *
 * @returns {{ type: string, coarse: string, rawText: string,
 *             playerName: string|null, teamName: string|null,
 *             onTarget: boolean|undefined, won: boolean|undefined }}
 */
export function parseMatchEvent(text) {
  return fillEvent({
    type: 'info', coarse: 'info', rawText: '', playerName: null, teamName: null, onTarget: undefined, won: undefined,
  }, text);
}

// ---------------------------------------------------------------------------
// 2. Observer bus
// ---------------------------------------------------------------------------

/**
 * Create a tiny event bus (Observer pattern). Subscribers register per event
 * `type` (or '*' for all). `emit(event, ctx)` calls listeners with the event
 * and an optional context object; subscriber exceptions are caught so one bad
 * listener never breaks the match loop.
 */
export function createMatchEventBus() {
  const listeners = new Map();

  const bus = {
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => bus.off(type, fn);
    },
    off(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    emit(event, ctx) {
      for (const fn of [...(listeners.get(event.type) || [])]) {
        try { fn(event, ctx); } catch (e) { console.warn('[MatchEventBus] subscriber error:', e); }
      }
      for (const fn of [...(listeners.get('*') || [])]) {
        try { fn(event, ctx); } catch (e) { console.warn('[MatchEventBus] subscriber error:', e); }
      }
    },
    clear() {
      listeners.clear();
    },
    listenerCount() {
      let n = 0;
      for (const s of listeners.values()) n += s.size;
      return n;
    },
  };

  return bus;
}

// Pool of typed-event objects for the tick hot path (Design Pattern #7).
// Recycles event payloads across emitLogEvents calls; consumers read them
// synchronously on the bus, so releasing after the emit loop is safe.
const _eventPool = createObjectPool({
  create: () => ({ type: 'info', coarse: 'info', rawText: '', playerName: null, teamName: null, onTarget: undefined, won: undefined }),
  reset: (ev) => {
    ev.type = 'info';
    ev.coarse = 'info';
    ev.rawText = '';
    ev.playerName = null;
    ev.teamName = null;
    ev.onTarget = undefined;
    ev.won = undefined;
  },
});

/**
 * Parse a slice of iterationLog entries and emit each as a typed event on
 * `matchDetails._eventBus`. Uses the object pool (Pattern #7): event objects
 * are acquired → filled → emitted → released, and MUST NOT be retained by the
 * caller. Returns the number of events emitted.
 *
 * @param {object} matchDetails — carries `_eventBus`
 * @param {string[]} entries — new log entries for this tick
 * @returns {number} events emitted
 */
export function emitLogEvents(matchDetails, entries) {
  const bus = matchDetails?._eventBus;
  if (!bus || !entries?.length) return 0;

  let n = 0;
  for (const text of entries) {
    if (typeof text !== 'string' || !text) continue;
    const ev = _eventPool.acquire();
    fillEvent(ev, text);
    bus.emit(ev, matchDetails);
    _eventPool.release(ev);
    n++;
  }
  return n;
}

/** Diagnostics: how many pooled event objects exist and are currently free. */
export function getEventPoolStats() {
  return { size: _eventPool.size, allocated: _eventPool.allocated };
}

// matchCommands.js — Design Pattern #2: Command
//
// Match interventions (substitutions, formation changes) are wrapped as
// Command objects with a uniform { name, validate, execute, undo } interface,
// plus a bounded history for undo/redo. The commands delegate the actual
// engine mutation to the existing helpers in matchEngine.js, so on-field
// behaviour is unchanged — the Command layer adds validation, undo and an
// audit trail on top.
//
// Public API:
//   createCommand(name, { validate, execute, undo })  → command
//   substitutionCommand(md, teamKey, playerOutID, playerIn) → command
//   formationChangeCommand(md, side, newFormation, pitchSize) → command
//   createCommandHistory(max) → { execute, undo, redo, clear, history }

import { applySubstitution, applyFormationChange } from './matchEngine.js';

// ---------------------------------------------------------------------------
// Snapshot / restore — undo support
// ---------------------------------------------------------------------------

function clonePlayers(players) {
  return (players || []).map((p) => JSON.parse(JSON.stringify(p)));
}

// Snapshot the mutable match state an intervention can touch, so undo can
// restore it exactly. The event bus (a Map of closures) is deliberately NOT
// snapshotted — it never changes during an intervention.
function snapshotIntervention(md) {
  if (!md) return null;
  return {
    kickOffPlayers: clonePlayers(md.kickOffTeam?.players),
    secondPlayers: clonePlayers(md.secondTeam?.players),
    homeFormation: md._homeFormation,
    awayFormation: md._awayFormation,
  };
}

function restoreIntervention(md, snap) {
  if (!md || !snap) return md;
  if (md.kickOffTeam) md.kickOffTeam.players = snap.kickOffPlayers;
  if (md.secondTeam) md.secondTeam.players = snap.secondPlayers;
  md._homeFormation = snap.homeFormation;
  md._awayFormation = snap.awayFormation;
  return md;
}

// ---------------------------------------------------------------------------
// Command interface
// ---------------------------------------------------------------------------

export function createCommand(name, { validate, execute, undo }) {
  return { name, validate, execute, undo };
}

/**
 * Build a substitution command. Mirrors the legacy applySubstitution rules:
 * resolve the outgoing player by engine playerID (fallback squadID), reject
 * sent-off players, swap in the substitute at the formation originPOS.
 *
 * @param {object} md — live matchDetails
 * @param {'kickOffTeam'|'secondTeam'} teamKey
 * @param {string} playerOutID
 * @param {object} playerIn — squad player object
 * @returns command
 */
export function substitutionCommand(md, teamKey, playerOutID, playerIn) {
  let snap = null;
  return createCommand('substitution', {
    validate() {
      if (!md || !teamKey || !playerOutID || !playerIn) return { ok: false, error: 'INVALID_PARAMS' };
      const team = md[teamKey];
      if (!team?.players) return { ok: false, error: 'TEAM_NOT_FOUND' };
      const idx = team.players.findIndex((p) => p.playerID === playerOutID || p.squadID === playerOutID);
      if (idx === -1) return { ok: false, error: 'PLAYER_NOT_FOUND' };
      const out = team.players[idx];
      if (Array.isArray(out.currentPOS) && out.currentPOS[0] === 'NP') return { ok: false, error: 'PLAYER_SENT_OFF' };
      return { ok: true };
    },
    execute() {
      snap = snapshotIntervention(md);
      applySubstitution(md, teamKey, playerOutID, playerIn);
      return { ok: true, matchDetails: md };
    },
    undo(mdArg = md) {
      return restoreIntervention(mdArg, snap);
    },
  });
}

/**
 * Build a formation-change command. Recomputes originPOS/intentPOS for all
 * active players and updates the side's formation metadata.
 *
 * @param {object} md
 * @param {'home'|'away'} side
 * @param {string} newFormation
 * @param {object} [pitchSize]
 * @returns command
 */
export function formationChangeCommand(md, side, newFormation, pitchSize) {
  let snap = null;
  return createCommand('formationChange', {
    validate() {
      if (!md || !side || !newFormation) return { ok: false, error: 'INVALID_PARAMS' };
      return { ok: true };
    },
    execute() {
      snap = snapshotIntervention(md);
      applyFormationChange(md, side, newFormation, pitchSize);
      return { ok: true, matchDetails: md };
    },
    undo(mdArg = md) {
      return restoreIntervention(mdArg, snap);
    },
  });
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/**
 * Bounded command history with undo/redo. `execute` runs a command's
 * validate → execute and records it on success.
 */
export function createCommandHistory(max = 50) {
  const done = [];
  const undone = [];

  return {
    execute(cmd) {
      const v = cmd.validate ? cmd.validate() : { ok: true };
      if (v && v.ok === false) return { ok: false, error: v.error, matchDetails: v.matchDetails };
      const r = cmd.execute();
      done.push(cmd);
      undone.length = 0;
      if (done.length > max) done.shift();
      return { ok: r?.ok !== false, matchDetails: r?.matchDetails, error: r?.error };
    },
    undo() {
      const cmd = done.pop();
      if (!cmd) return { ok: false, error: 'NOTHING_TO_UNDO' };
      undone.push(cmd);
      const md = cmd.undo();
      return { ok: true, matchDetails: md };
    },
    redo() {
      const cmd = undone.pop();
      if (!cmd) return { ok: false, error: 'NOTHING_TO_REDO' };
      const r = cmd.execute();
      done.push(cmd);
      return { ok: r?.ok !== false, matchDetails: r?.matchDetails };
    },
    clear() {
      done.length = 0;
      undone.length = 0;
    },
    get history() {
      return done.map((c) => c.name);
    },
    get canUndo() {
      return done.length > 0;
    },
    get canRedo() {
      return undone.length > 0;
    },
  };
}

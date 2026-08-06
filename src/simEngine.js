// Bridge to the original sim engine (window.SIM).
// The engine is loaded via script tags before React mounts.
//
// This is a facade over the global window.SIM — it normalizes access,
// adds null-safe defaults, and provides the `init()` bootstrap. It is
// intentionally thin because the engine owns all game logic; changing
// that would mean forking the obfuscated engine scripts.

import * as ATTRS from './attributes';

const SIM = {
  get() {
    return window.SIM;
  },

  newState(mode, identity, seed) {
    return window.SIM.newState(mode, identity, seed);
  },

  state() {
    return window.SIM.state();
  },

  nextStep() {
    window.SIM.nextStep();
    return window.SIM.state();
  },

  doPeriod() {
    window.SIM.doPeriod();
  },

  choose(index) {
    return window.SIM.choose(index);
  },

  cont() {
    window.SIM.cont();
    return window.SIM.state();
  },

  // Data lookups
  getOrigins() {
    return window.SIM.ORIGINS;
  },

  getPositions() {
    return window.DATA?.POSITIONS || [];
  },

  getTeamById(id) {
    return window.SIM.teamById(id);
  },

  getLeagueById(id) {
    return window.SIM.leagueById(id);
  },

  curTeam() {
    return window.SIM.curTeam();
  },

  curLeague() {
    return window.SIM.curLeague();
  },

  inChina() {
    return window.SIM.inChina();
  },

  snap() {
    return window.SIM.snap();
  },

  getEndings() {
    return window.DATA?.ENDINGS || [];
  },

  getNearTeams(originId) {
    return window.SIM.NEAR_TEAMS?.[originId] || [];
  },

  isNear(originId, teamId) {
    return window.SIM.isNear(originId, teamId);
  },

  /** Format a salary/earnings amount (e.g. "120万欧元"). */
  fmtMoney(amount) {
    return window.SIM.fmtMoney(amount);
  },

  /** Format a transfer market value (e.g. "5000万欧"). */
  fmtValue(amount) {
    return window.SIM.fmtValue(amount);
  },

  valueOf(ovr, age) {
    return window.SIM.valueOf(ovr, age);
  },

  rnd() {
    return window.SIM.rnd();
  },

  originById(id) {
    return window.SIM.originById(id);
  },

  buildProfile() {
    return window.SIM.buildProfile();
  },

  makeAcademy() {
    return window.SIM.makeAcademy();
  },

  makeTransfer(fired) {
    return window.SIM.makeTransfer(fired);
  },

  resolveEvent(index) {
    return window.SIM.resolveEvent(index);
  },

  commitEvent(optOrRes) {
    return window.SIM.commitEvent(optOrRes);
  },

  goSummary(reason) {
    window.SIM.goSummary(reason);
  },

  interpolate(text) {
    return window.SIM?.interpolate?.(text) || text;
  },

  MODES: {},
  AWARDS: {},
  ENDINGS: [],

  init() {
    this.MODES = window.SIM?.MODES || {};
    if (window.DATA) {
      this.AWARDS = window.DATA.AWARDS || {};
      this.ENDINGS = window.DATA.ENDINGS || [];
      this.POSITIONS = window.DATA.POSITIONS || [];
      this.ROLES = window.DATA.ROLES || {};
      this.LEAGUES = window.DATA.LEAGUES || [];
      this.TEAMS = window.DATA.TEAMS || [];
    }
  },

  getRole(roleId) {
    const roles = window.DATA?.ROLES || {};
    return roles[roleId] || null;
  },

  getEvents() {
    return window.EVENTS || [];
  },

  // --- Attribute system bridge (Ticket 02) ---

  initAttributes(identity, seed, currentOvr) {
    return ATTRS.initAttributes(identity, seed, currentOvr);
  },

  tickAttributes(currentOvr, age, pos) {
    return ATTRS.tickAttributes(currentOvr, age, pos);
  },

  getAttributes() {
    return ATTRS.getAttributes();
  },

  getCategory(attrs, category) {
    return ATTRS.getCategory(attrs, category);
  },

  getWeights(pos) {
    return ATTRS.getWeights(pos);
  },

  getOVRFromAttributes(attrs, pos) {
    return ATTRS.getOVRFromAttributes(attrs, pos);
  },

  getPotential(attrs) {
    return ATTRS.getPotential(attrs);
  },

  getDevCurve(attrs) {
    return ATTRS.getDevCurve(attrs);
  },
};

export default SIM;

var O = Object.defineProperty;
var K = (o, t, e) => t in o ? O(o, t, { enumerable: !0, configurable: !0, writable: !0, value: e }) : o[t] = e;
var d = (o, t, e) => K(o, typeof t != "symbol" ? t + "" : t, e);
import { EventEmitter as j } from "events";
var f;
(function(o) {
  o[o.GameStart = 0] = "GameStart", o[o.Kickoff = 1] = "Kickoff", o[o.HalfTime = 2] = "HalfTime", o[o.GameEnd = 3] = "GameEnd", o[o.Injury = 4] = "Injury", o[o.Goal = 5] = "Goal", o[o.Save = 6] = "Save", o[o.Block = 7] = "Block", o[o.Substitution = 8] = "Substitution", o[o.Possession = 9] = "Possession", o[o.Defence = 10] = "Defence", o[o.EventLess = 11] = "EventLess", o[o.Advance = 12] = "Advance", o[o.Retreat = 13] = "Retreat", o[o.Corner = 14] = "Corner", o[o.FreeKick = 15] = "FreeKick";
})(f || (f = {}));
const Z = [
  f.GameStart,
  f.Kickoff,
  f.HalfTime,
  f.Advance,
  f.Save,
  f.Block,
  f.Goal,
  f.GameEnd,
  f.Injury
];
class ot {
  constructor(t = "Mr. Commentator") {
    d(this, "name");
    this.name = t;
  }
  routeComment(t) {
    switch (t.event) {
      case f.GameStart:
        return this.gameStarted(t);
      case f.Kickoff:
        return this.kickoff(t);
      case f.HalfTime:
        return this.halfTime(t);
      case f.Advance:
        return this.advance(t);
      case f.Defence:
        return this.defence(t);
      case f.Save:
        return this.save(t);
      case f.Block:
        return this.block(t);
      case f.Goal:
        return this.goal(t);
      case f.GameEnd:
        return this.gameEnded(t);
      default:
        return null;
    }
  }
  comment(t) {
    return !(t.event in Z) && Math.random() > 0.5 ? null : this.routeComment(t);
  }
  gameStarted(t) {
    return `The game between ${t.homeTeam.name} and ${t.awayTeam.name} has started.`;
  }
  kickoff(t) {
    return `${t.data.name} with the kickoff.`;
  }
  halfTime(t) {
    return `It's half time! The score is ${t.gameInfo.homeGoals} - ${t.gameInfo.awayGoals}`;
  }
  advance(t) {
    return `${t.attackingTeam.name} advances with the ball.`;
  }
  defence(t) {
    return `${t.defendingTeam.name} tries to advance but good defence by ${t.attackingTeam.name} that steals the ball.`;
  }
  rebound(t, e) {
    return e.data === e.attackingTeam ? `${e.attackingTeam.name} gets the ball back.` : [t, `${e.attackingTeam.name} can take control over the ball.`].join(" ");
  }
  save(t) {
    return this.rebound(`${t.attackingPrimaryPlayer.info.name} tries to score but the goalkeeper saves the ball.`, t);
  }
  block(t) {
    return this.rebound(`${t.attackingPrimaryPlayer.info.name} tries to score but the ball was blocked by the defence.`, t);
  }
  goal(t) {
    return `${t.attackingPrimaryPlayer.info.name} shoots and he scores! ${t.gameInfo.homeGoals}-${t.gameInfo.awayGoals}`;
  }
  gameEnded(t) {
    return t.gameInfo.homeGoals > t.gameInfo.awayGoals ? `The game has ended! ${t.homeTeam.name} wins ${t.gameInfo.homeGoals}-${t.gameInfo.awayGoals}` : t.gameInfo.homeGoals < t.gameInfo.awayGoals ? `The game has ended! ${t.awayTeam.name} takes 3 points on the road! ${t.gameInfo.homeGoals}-${t.gameInfo.awayGoals}` : `The game ends with a draw! Final score ${t.gameInfo.homeGoals}-${t.gameInfo.awayGoals}`;
  }
}
var x;
(function(o) {
  o[o.Advance = 0] = "Advance", o[o.Stay = 1] = "Stay", o[o.Retreat = 2] = "Retreat", o[o.GoalAttempt = 3] = "GoalAttempt";
})(x || (x = {}));
var R;
(function(o) {
  o[o.Shot = 0] = "Shot", o[o.Volley = 1] = "Volley", o[o.Header = 2] = "Header";
})(R || (R = {}));
var B;
(function(o) {
  o[o.Pass = 0] = "Pass", o[o.Cross = 1] = "Cross", o[o.Rebound = 2] = "Rebound", o[o.Deflection = 3] = "Deflection";
})(B || (B = {}));
var k;
(function(o) {
  o.DefensiveLeft = "A1", o.DefensiveCenter = "B1", o.DefensiveRight = "C1", o.PreDefensiveLeft = "A2", o.PreDefensiveCenter = "B2", o.PreDefensiveRight = "C2", o.MidfieldLeft = "A3", o.MidfieldCenter = "B3", o.MidfieldRight = "C3", o.PreAttackingLeft = "A4", o.PreAttackingCenter = "B4", o.PreAttackingRight = "C4", o.AttackingLeft = "A5", o.AttackingCenter = "B5", o.AttackingRight = "C5";
})(k || (k = {}));
const L = {
  A: 1,
  B: 2,
  C: 3
};
class q {
  constructor() {
    d(this, "areas", [
      [k.DefensiveLeft, k.DefensiveCenter, k.DefensiveRight],
      [k.PreDefensiveLeft, k.PreDefensiveCenter, k.PreDefensiveRight],
      [k.MidfieldLeft, k.MidfieldCenter, k.MidfieldRight],
      [k.PreAttackingLeft, k.PreAttackingCenter, k.PreAttackingRight],
      [k.AttackingLeft, k.AttackingCenter, k.AttackingRight]
    ]);
  }
  fieldAreaToNumber(t) {
    const [e, s] = t;
    return [L[e], parseInt(s, 10)];
  }
  columnToNumber(t) {
    return L[t];
  }
  startPosition() {
    return k.MidfieldCenter;
  }
  randomDirection() {
    const t = ["A", "B", "C"];
    return t[Math.floor(Math.random() * t.length)];
  }
  reverseSide(t) {
    const [e, s] = this.fieldAreaToNumber(t);
    return this.areas.reverse()[s - 1].reverse()[e - 1];
  }
  move(t, e = 1, s = null) {
    const [, i] = this.fieldAreaToNumber(t), a = Math.max(1, Math.min(i + e, this.areas.length)), n = s || this.randomDirection();
    return this.areas[a - 1][this.columnToNumber(n) - 1];
  }
  advance(t, e = null) {
    return this.move(t, 1, e);
  }
  retreat(t, e = null) {
    return this.move(t, -1, e);
  }
}
class Q {
  constructor(t, e) {
    /**
     * Has the game started?
     */
    d(this, "gameStarted", !1);
    /**
     * Has the game ended?
     */
    d(this, "gameEnded", !1);
    /**
     * Number of minutes for a full game
     */
    d(this, "gameTime", 90);
    /**
     * Number of events per minutes. This decides how eventful the game should be,
     * how many actions can take place within a minute.
     */
    d(this, "eventsPerMinute", 1);
    /**
     * Extra rating points for home team attributes
     */
    d(this, "homeTeamAdvantage", 2);
    /**
     * All attributes are randomized on each simulation using
     * a positive or negative version of this value
     */
    d(this, "randomEffect", 25);
    /**
     * Chance (0 to 1) to get the ball back after goal attempt.
     */
    d(this, "reboundChance", 0.1);
    /**
     * Increase attack attributes on goal chance
     */
    d(this, "extraAttackOnChance", 0.05);
    /**
     * Current team with possession.
     */
    d(this, "ballPossession", null);
    /**
     * The team that started with the ball.
     */
    d(this, "startedWithBall", null);
    /**
     * FieldArea enum describing the current ball position.
     */
    d(this, "ballPosition");
    /**
     * Game info object describing the current state of the game
     */
    d(this, "gameInfo");
    /**
     * Array containing all simulations
     */
    d(this, "gameEvents", []);
    /**
     * The game loop
     */
    d(this, "gameLoop");
    /**
     * The home team
     */
    d(this, "homeTeam");
    /**
     * The away team
     */
    d(this, "awayTeam");
    /**
     * The field
     */
    d(this, "field");
    d(this, "simulate", () => {
      this.gameStarted || this.start();
      const t = this.gameLoop.next();
      t.done || (this.gameEvents.push(t.value), this.handleEvent(t.value), this.simulate());
    });
    this.homeTeam = t, this.awayTeam = e, this.field = new q(), this.ballPosition = this.field.startPosition(), this.gameLoop = this.eventLoop(), this.gameInfo = {
      matchMinute: 0,
      homeGoals: 0,
      awayGoals: 0
    }, this.homeTeam.setField(this.field), this.awayTeam.setField(this.field);
  }
  start() {
    const t = Math.floor(Math.random() * 2) == 0;
    this.ballPossession = t ? this.homeTeam : this.awayTeam, this.startedWithBall = this.ballPossession, this.gameEvents.push(this.gameEvent(f.GameStart, this.ballPossession)), this.gameEvents.push(this.gameEvent(f.Kickoff, this.ballPossession)), this.gameStarted = !0;
  }
  teamWithoutBall() {
    return this.ballPossession === this.homeTeam ? this.awayTeam : this.homeTeam;
  }
  rebound() {
    return Math.floor(Math.random()) > this.reboundChance;
  }
  handleEvent(t) {
    switch (t.event) {
      case f.Goal:
        this.ballPosition = this.field.startPosition(), this.ballPossession = this.teamWithoutBall();
        break;
      case f.Save:
        this.rebound() || (this.ballPossession = this.teamWithoutBall());
        break;
      case f.Block:
        this.rebound() || (this.ballPossession = this.teamWithoutBall());
        break;
      case f.Advance:
        this.ballPosition = this.field.advance(this.ballPosition);
        break;
      case f.Retreat:
        this.ballPosition = this.field.retreat(this.ballPosition);
        break;
      case f.Defence:
        this.ballPossession = this.teamWithoutBall();
        break;
    }
  }
  *eventLoop() {
    for (this.gameInfo.matchMinute; this.gameInfo.matchMinute <= this.gameTime; this.gameInfo.matchMinute += 1 / this.eventsPerMinute)
      yield this.simulateEvent();
  }
  gameEvent(t, e = null, s = null, i = null, a = null, n = null, r = null, h = null) {
    return {
      event: t,
      data: e,
      attackingPrimaryPlayer: s,
      attackingSecondaryPlayer: i,
      defendingPrimaryPlayer: a,
      defendingSecondaryPlayer: n,
      gameInfo: Object.assign({}, this.gameInfo),
      homeTeam: this.homeTeam,
      awayTeam: this.awayTeam,
      attackingTeam: this.ballPossession || this.homeTeam,
      defendingTeam: this.teamWithoutBall(),
      fieldPosition: this.ballPosition,
      goalType: r,
      assistType: h
    };
  }
  random(t) {
    const e = -this.randomEffect, s = this.randomEffect;
    let i = Math.floor(Math.random() * (s - e + 1) + e);
    return t === this.homeTeam && (i += this.homeTeamAdvantage), i;
  }
  simulateGoalAttempt(t, e, s) {
    const i = e.defenceRating() + this.random(e), a = t.attackRating() + this.random(t);
    if (a + a * this.extraAttackOnChance > i) {
      const n = e.goalkeeperRating() + this.random(e);
      return s.attackRating() + this.random(t) > n ? f.Goal : f.Save;
    }
    return f.Block;
  }
  simulatePossession(t, e, s) {
    const i = e.defenceRating() + this.random(e), a = t.possessionRating() + this.random(t);
    return i > a ? f.Defence : s === x.Retreat ? f.Retreat : f.Possession;
  }
  simulateAction(t, e) {
    if (!this.ballPossession)
      return f.EventLess;
    const s = this.ballPossession, i = this.teamWithoutBall(), a = i.defenceRating() + this.random(i), n = s.attackRating() + this.random(s);
    return t === x.Advance ? n > a ? f.Advance : f.Defence : t === x.GoalAttempt ? this.simulateGoalAttempt(s, i, e) : this.simulatePossession(s, i, t);
  }
  simulateAssistType(t) {
    const e = Math.random(), s = t.attributes, i = t.rating(), a = i.shooting, n = i.passing;
    return a > n && e > 0.5 ? e > 0.5 ? B.Deflection : B.Rebound : s.passing > s.crossing && e > 0.5 ? B.Pass : B.Cross;
  }
  simulateGoalType(t, e) {
    if (!(Math.random() > 0.5))
      return [R.Shot, null];
    const i = t.attributes, a = Math.random(), n = this.simulateAssistType(e);
    return [
      i.heading > i.finishing && a > 0.5 ? R.Header : [R.Volley, R.Shot][Math.floor(Math.random() * 2)],
      n
    ];
  }
  halfTime() {
    return this.ballPossession = this.startedWithBall === this.homeTeam ? this.awayTeam : this.homeTeam, this.ballPosition = this.field.startPosition(), this.gameEvent(f.HalfTime);
  }
  gameEnd() {
    return this.gameEnded = !0, this.gameEvent(f.GameEnd);
  }
  goal(t, e) {
    return this.ballPossession === this.homeTeam ? this.gameInfo.homeGoals += 1 : this.gameInfo.awayGoals += 1, this.simulateGoalType(t, e);
  }
  simulateEvent() {
    if (this.gameInfo.matchMinute == this.gameTime / 2)
      return this.halfTime();
    if (this.gameInfo.matchMinute >= this.gameTime)
      return this.gameEnd();
    if (!this.ballPossession)
      return this.gameEvent(f.EventLess);
    const t = this.ballPossession.home ? this.ballPosition : this.field.reverseSide(this.ballPosition), e = this.ballPossession.attacker(t), s = this.ballPossession.attacker(t, [e]), i = this.teamWithoutBall(), a = i.defender(t), n = this.ballPossession.simulateMove(t, this.gameInfo);
    let r = null, h = null;
    const u = this.simulateAction(n, e);
    return u === f.Goal && ([r, h] = this.goal(e, s)), this.gameEvent(u, null, e, s, a, i.defender(t, [a]), r, h);
  }
}
class H {
  constructor(t) {
    d(this, "gameEvents");
    d(this, "home", {
      goals: 0,
      possession: 0,
      shots: 0,
      shotsOnGoal: 0
    });
    d(this, "away", {
      goals: 0,
      possession: 0,
      shots: 0,
      shotsOnGoal: 0
    });
    d(this, "scoreSheet", []);
    d(this, "registerEvent", (t) => {
      const e = t.attackingTeam && t.attackingTeam.home ? "home" : "away";
      this[e].possession += 1, [f.Save, f.Goal, f.Block].includes(t.event) && (this[e].shots += 1), [f.Save, f.Goal].includes(t.event) && (this[e].shotsOnGoal += 1), t.event === f.Goal && (this[e].goals += 1, this.scoreSheet.push({
        matchMinute: t.gameInfo.matchMinute,
        goalScorer: t.attackingPrimaryPlayer,
        assist: t.assistType && t.attackingSecondaryPlayer ? t.attackingSecondaryPlayer : !1,
        team: t.attackingTeam
      }));
    });
    this.gameEvents = t;
  }
  getReport() {
    this.gameEvents.forEach(this.registerEvent);
    const t = this.home.possession + this.away.possession;
    return {
      home: { ...this.home, possession: this.home.possession / t },
      away: { ...this.away, possession: this.away.possession / t },
      scoreSheet: this.scoreSheet
    };
  }
}
class ct extends j {
  constructor(e, s, i) {
    super();
    /**
     * Milliseconds between each simulation
     */
    d(this, "gameSpeed", 500);
    /**
     * Engine
     */
    d(this, "engine");
    /**
     * The home team
     */
    d(this, "homeTeam");
    /**
     * The away team
     */
    d(this, "awayTeam");
    /**
     * The commentator
     */
    d(this, "commentator");
    /**
     * Events copy
     */
    d(this, "events", []);
    d(this, "loop", () => {
      const e = this.events.shift();
      if (!e) {
        this.report();
        return;
      }
      this.emit("comment", {
        text: this.commentator.comment(e),
        gameInfo: e.gameInfo
      }), this.emit("event", e), setTimeout(this.loop, this.gameSpeed);
    });
    this.homeTeam = e, this.awayTeam = s, this.commentator = i, this.engine = new Q(this.homeTeam, this.awayTeam);
  }
  start() {
    this.engine.start(), this.events = this.engine.gameEvents.slice(), this.events.forEach((e) => {
      this.emit("comment", {
        text: this.commentator.comment(e),
        gameInfo: this.engine.gameInfo
      });
    }), this.events = [], this.simulate();
  }
  simulate() {
    this.engine.simulate(), this.events = this.engine.gameEvents.slice(), this.loop();
  }
  report() {
    const e = new H(this.engine.gameEvents);
    this.emit("report", e.getReport());
  }
}
var c;
(function(o) {
  o[o.GK = 0] = "GK", o[o.LB = 1] = "LB", o[o.LCB = 2] = "LCB", o[o.CB = 3] = "CB", o[o.RCB = 4] = "RCB", o[o.RB = 5] = "RB", o[o.LWB = 6] = "LWB", o[o.LDM = 7] = "LDM", o[o.DM = 8] = "DM", o[o.RDM = 9] = "RDM", o[o.RWB = 10] = "RWB", o[o.LM = 11] = "LM", o[o.LCM = 12] = "LCM", o[o.CM = 13] = "CM", o[o.RCM = 14] = "RCM", o[o.RM = 15] = "RM", o[o.LW = 16] = "LW", o[o.LCOM = 17] = "LCOM", o[o.COM = 18] = "COM", o[o.RCOM = 19] = "RCOM", o[o.RW = 20] = "RW", o[o.LF = 21] = "LF", o[o.CF = 22] = "CF", o[o.RF = 23] = "RF", o[o.ST = 24] = "ST";
})(c || (c = {}));
const _ = [
  c.LB,
  c.LCB,
  c.CB,
  c.RCB,
  c.RB,
  c.LWB,
  c.RWB
], T = [
  c.LDM,
  c.DM,
  c.RDM,
  c.LM,
  c.LCM,
  c.CM,
  c.RCM,
  c.RM
], P = [
  c.LW,
  c.LCOM,
  c.COM,
  c.RCOM,
  c.RW,
  c.LF,
  c.CF,
  c.RF,
  c.ST
], N = [
  c.LB,
  c.LCB,
  c.LDM,
  c.LWB,
  c.LM,
  c.LCM,
  c.LW,
  c.LCOM,
  c.LF
], U = [
  c.LCB,
  c.CB,
  c.RCB,
  c.LDM,
  c.DM,
  c.RDM,
  c.LCM,
  c.CM,
  c.RCM,
  c.LCOM,
  c.COM,
  c.RCOM,
  c.CF,
  c.ST
], Y = [
  c.RB,
  c.RCB,
  c.RDM,
  c.RWB,
  c.RM,
  c.RCM,
  c.RW,
  c.RCOM,
  c.RF
];
class V {
  constructor(t, e, s, i) {
    d(this, "info");
    d(this, "biometrics");
    d(this, "attributes");
    d(this, "position");
    this.info = t, this.biometrics = e, this.attributes = s, this.position = i;
  }
  ratingAverage() {
    const t = this.rating();
    return Object.values(t).reduce((e, s) => e + s) / Object.values(t).length;
  }
  rating() {
    return this.position === c.GK ? {
      diving: this.attributesAverage(this.attributes.agility, this.attributes.balance, this.attributes.naturalFitness, this.attributes.strength),
      hands: this.attributesAverage(this.attributes.agility, this.attributes.balance, this.attributes.naturalFitness, this.attributes.handling, this.attributes.aerialReach),
      kicking: this.attributesAverage(this.attributes.agility, this.attributes.balance, this.attributes.naturalFitness, this.attributes.strength, this.attributes.longShots),
      reflexes: this.attributesAverage(this.attributes.agility, this.attributes.balance, this.attributes.naturalFitness, this.attributes.strength, this.attributes.reflexes),
      speed: this.attributesAverage(this.attributes.agility, this.attributes.balance, this.attributes.naturalFitness, this.attributes.strength, this.attributes.pace, this.attributes.acceleration),
      positioning: this.attributesAverage(this.attributes.anticipation, this.attributes.positioning, this.attributes.offTheBall, this.attributes.vision)
    } : {
      pace: this.attributesAverage(this.attributes.acceleration, this.attributes.agility, this.attributes.balance, this.attributes.naturalFitness, this.attributes.pace, this.attributes.strength),
      shooting: this.attributesAverage(this.attributes.agility, this.attributes.balance, this.attributes.naturalFitness, this.attributes.strength, this.attributes.finishing, this.attributes.longShots, this.attributes.technique, this.attributes.freeKickTaking, this.attributes.penaltyTaking, this.attributes.jumpingReach),
      passing: this.attributesAverage(this.attributes.agility, this.attributes.balance, this.attributes.naturalFitness, this.attributes.strength, this.attributes.passing, this.attributes.crossing, this.attributes.corners),
      dribbling: this.attributesAverage(this.attributes.agility, this.attributes.balance, this.attributes.naturalFitness, this.attributes.dribbling, this.attributes.firstTouch, this.attributes.technique),
      defending: this.attributesAverage(this.attributes.agility, this.attributes.balance, this.attributes.naturalFitness, this.attributes.strength, this.attributes.tackling, this.attributes.marking, this.attributes.aggression, this.attributes.teamwork, this.attributes.workRate, this.attributes.positioning, this.attributes.anticipation, this.attributes.jumpingReach),
      physique: this.attributesAverage(this.attributes.agility, this.attributes.balance, this.attributes.naturalFitness, this.attributes.strength, this.attributes.jumpingReach, this.attributes.stamina, this.attributes.pace)
    };
  }
  averageRating(t) {
    return t.reduce((e, s) => e + s) / t.length;
  }
  defenceRating() {
    const t = this.rating();
    return this.averageRating([
      t.defending,
      t.physique,
      t.pace
    ]);
  }
  possessionRating() {
    const t = this.rating();
    return this.averageRating([
      t.dribbling,
      t.passing,
      t.physique
    ]);
  }
  attackRating() {
    const t = this.rating();
    return this.averageRating([
      t.dribbling,
      t.pace,
      t.passing,
      t.shooting,
      t.physique
    ]);
  }
  attributesAverage(...t) {
    return t.reduce((e, s) => e + s) / t.length / 20 * 100;
  }
}
const I = {
  formation: "4-4-2",
  style: "balanced",
  press: 50,
  width: 55,
  tempo: 50,
  mentality: "balanced",
  defensiveLine: 50,
  compactness: 50,
  focus: "balanced"
}, X = {
  balanced: {
    press: 50,
    width: 55,
    tempo: 50,
    mentality: "balanced",
    defensiveLine: 50,
    compactness: 50,
    focus: "balanced"
  },
  possession: {
    press: 56,
    width: 54,
    tempo: 42,
    mentality: "balanced",
    defensiveLine: 56,
    compactness: 58,
    focus: "central"
  },
  direct: {
    press: 46,
    width: 52,
    tempo: 72,
    mentality: "balanced",
    defensiveLine: 48,
    compactness: 46,
    focus: "balanced"
  },
  counter: {
    press: 38,
    width: 48,
    tempo: 62,
    mentality: "defensive",
    defensiveLine: 38,
    compactness: 60,
    focus: "central"
  },
  low_block: {
    press: 28,
    width: 42,
    tempo: 36,
    mentality: "defensive",
    defensiveLine: 28,
    compactness: 76,
    focus: "central"
  },
  high_press: {
    press: 82,
    width: 58,
    tempo: 68,
    mentality: "attacking",
    defensiveLine: 72,
    compactness: 46,
    focus: "balanced"
  }
}, C = {
  strictness: 52,
  advantagePatience: 45,
  penaltyThreshold: 55,
  bookingThreshold: 55
}, l = {
  length: 105,
  width: 68,
  goalWidth: 7.32
};
class J {
  constructor(t, e, s = {}) {
    d(this, "tickSeconds");
    d(this, "matchLengthSeconds");
    d(this, "homeTeam");
    d(this, "awayTeam");
    d(this, "state");
    d(this, "events", []);
    d(this, "snapshots", []);
    d(this, "gameStarted", !1);
    d(this, "random");
    d(this, "startedWithBallSide", null);
    d(this, "baseTactics");
    d(this, "nextPhaseAfterSnapshot", null);
    d(this, "clearRestartAfterSnapshot", !1);
    d(this, "nextPossessionId", 1);
    this.homeTeam = t, this.awayTeam = e, this.tickSeconds = s.tickSeconds || 0.25, this.matchLengthSeconds = s.matchLengthSeconds || 5400, this.random = s.random || Math.random;
    const i = this.tacticsFromOptions(s.homeTactics), a = this.tacticsFromOptions(s.awayTactics);
    this.baseTactics = {
      home: { ...i },
      away: { ...a }
    };
    const n = this.createPlayers(t, "home", i, t.players.slice(0, 11)), r = this.createPlayers(e, "away", a, e.players.slice(0, 11)), h = [
      ...n,
      ...r
    ];
    this.state = {
      time: 0,
      period: 1,
      phase: "kickoff",
      ball: {
        x: l.length / 2,
        y: l.width / 2,
        velocity: { x: 0, y: 0 },
        owner: null,
        lastTouchSide: null,
        lastTouchPlayerId: null
      },
      players: h,
      tactics: {
        home: i,
        away: a
      },
      referee: this.refereeFromOptions(s.referee),
      score: {
        home: 0,
        away: 0
      },
      activeBallAction: null,
      secondBall: null,
      restart: null,
      possession: this.emptyPossessionContext(),
      addedTime: {
        firstHalf: 0,
        secondHalf: 0
      },
      bench: {
        home: this.createBenchPlayers(t, "home", i),
        away: this.createBenchPlayers(e, "away", a)
      },
      substitutionsUsed: {
        home: 0,
        away: 0
      }
    };
  }
  start() {
    if (this.gameStarted)
      return this.snapshot([]);
    this.gameStarted = !0, this.updateTacticalTargetPositions(), this.state.players.forEach((i) => {
      i.x = i.target.x, i.y = i.target.y;
    });
    const t = this.random() > 0.5 ? "home" : "away";
    this.startedWithBallSide = t, this.resetForKickoff(t);
    const e = [
      this.createEvent("match_start"),
      this.createEvent("kickoff", this.state.ball.owner || void 0)
    ];
    return this.nextPhaseAfterSnapshot = "open_play", this.commitSnapshot(e).snapshot;
  }
  simulate(t = this.matchLengthSeconds) {
    this.gameStarted || this.start();
    const e = Math.min(t, this.matchLengthSeconds);
    for (; this.state.period !== "ended" && this.state.time < e; )
      this.tick();
    return this.snapshots;
  }
  applyTacticalChange(t, e, s = "manager_tactical_change") {
    const i = this.tacticsFromOptions({
      ...this.baseTactics[t],
      ...e
    }), a = this.closestPlayerTo(t, this.state.ball) || void 0;
    this.baseTactics[t] = i, this.state.tactics[t] = i, this.updateTacticalTargetPositions();
    const n = this.createEvent("tactical_change", a, void 0, s);
    return this.events.push(n), n;
  }
  applyRoleChange(t, e, s = "manager_role_change") {
    const i = this.playerById(t);
    if (!i)
      return null;
    i.role = e, this.updateTacticalTargetPositions();
    const a = this.createEvent("role_change", i, void 0, s);
    return this.events.push(a), a;
  }
  tick() {
    if (this.gameStarted || this.start(), this.state.period === "ended") {
      const s = this.snapshot([]);
      return { state: this.state, events: [], snapshot: s };
    }
    this.state.time = this.roundTime(this.state.time + this.tickSeconds);
    const t = this.handleTimeBoundaries();
    if (t.length)
      return this.commitSnapshot(t);
    if (this.state.phase !== "open_play")
      return this.commitSnapshot(this.resolvePhaseAction());
    this.updateTacticalState(), this.updateTacticalTargetPositions(), this.decidePlayerIntents();
    const e = [
      ...this.resolveBallAction()
    ];
    return this.movePlayersAndBall(), e.push(...this.detectEvents()), this.state.phase === "open_play" && e.push(...this.detectSubstitutionEvents()), this.commitSnapshot(e);
  }
  commitSnapshot(t) {
    this.events.push(...t), this.registerAddedTime(t);
    const e = this.snapshot(t);
    return this.snapshots.push(e), this.nextPhaseAfterSnapshot && (this.state.phase = this.nextPhaseAfterSnapshot, this.nextPhaseAfterSnapshot = null), this.clearRestartAfterSnapshot && (this.state.restart = null, this.clearRestartAfterSnapshot = !1), { state: this.state, events: t, snapshot: e };
  }
  registerAddedTime(t) {
    const e = t.reduce((s, i) => i.type === "goal" ? s + 25 : i.type === "injury" ? s + 35 : i.type === "substitution" ? s + 20 : ["yellow_card", "red_card", "penalty"].includes(i.type) ? s + 10 : s, 0);
    if (!(!e || this.state.period === "ended")) {
      if (this.state.period === 1) {
        this.state.addedTime.firstHalf += e;
        return;
      }
      this.state.addedTime.secondHalf += e;
    }
  }
  tacticsFromOptions(t) {
    const e = (t == null ? void 0 : t.style) || I.style, s = X[e];
    return {
      ...I,
      ...s,
      ...t,
      style: e,
      press: this.clamp((t == null ? void 0 : t.press) ?? s.press, 0, 100),
      width: this.clamp((t == null ? void 0 : t.width) ?? s.width, 0, 100),
      tempo: this.clamp((t == null ? void 0 : t.tempo) ?? s.tempo, 0, 100),
      defensiveLine: this.clamp((t == null ? void 0 : t.defensiveLine) ?? s.defensiveLine, 0, 100),
      compactness: this.clamp((t == null ? void 0 : t.compactness) ?? s.compactness, 0, 100)
    };
  }
  refereeFromOptions(t) {
    return {
      ...C,
      ...t,
      strictness: this.clamp((t == null ? void 0 : t.strictness) ?? C.strictness, 0, 100),
      advantagePatience: this.clamp((t == null ? void 0 : t.advantagePatience) ?? C.advantagePatience, 0, 100),
      penaltyThreshold: this.clamp((t == null ? void 0 : t.penaltyThreshold) ?? C.penaltyThreshold, 0, 100),
      bookingThreshold: this.clamp((t == null ? void 0 : t.bookingThreshold) ?? C.bookingThreshold, 0, 100)
    };
  }
  emptyPossessionContext() {
    return {
      id: 0,
      teamSide: null,
      startTime: 0,
      startPhase: "kickoff",
      passCount: 0,
      lastPassRoute: null,
      lastSuccessfulPassRoute: null,
      lastProgressionZone: null,
      finalThirdEntries: 0,
      wideEntries: 0,
      boxEntries: 0,
      secondBallRecoveries: 0,
      setPieceOrigin: null,
      activeAttackPattern: "none",
      currentFieldZones: [],
      lastRecoveryType: null
    };
  }
  startPossession(t, e, s = null) {
    const i = this.fieldZonesFor(t, this.state.ball);
    this.state.possession = {
      id: this.nextPossessionId,
      teamSide: t,
      startTime: this.state.time,
      startPhase: e,
      passCount: 0,
      lastPassRoute: null,
      lastSuccessfulPassRoute: null,
      lastProgressionZone: this.progressionZone(i),
      finalThirdEntries: i.includes("final_third") ? 1 : 0,
      wideEntries: this.hasWideZone(i) ? 1 : 0,
      boxEntries: i.includes("box") ? 1 : 0,
      secondBallRecoveries: 0,
      setPieceOrigin: s,
      activeAttackPattern: s ? "set_piece" : this.attackPatternFromZones(i),
      currentFieldZones: i,
      lastRecoveryType: null
    }, this.nextPossessionId += 1;
  }
  possessionSnapshot() {
    return {
      ...this.state.possession,
      currentFieldZones: [...this.state.possession.currentFieldZones]
    };
  }
  recordPossessionPosition(t, e) {
    if (this.state.possession.teamSide !== t)
      return;
    const s = this.fieldZonesFor(t, e), i = this.state.possession.currentFieldZones;
    !i.includes("final_third") && s.includes("final_third") && (this.state.possession.finalThirdEntries += 1), !this.hasWideZone(i) && this.hasWideZone(s) && (this.state.possession.wideEntries += 1), !i.includes("box") && s.includes("box") && (this.state.possession.boxEntries += 1), this.state.possession.currentFieldZones = s, this.state.possession.lastProgressionZone = this.progressionZone(s), this.routeLedAttackPattern(this.state.possession.activeAttackPattern) || (this.state.possession.activeAttackPattern = this.attackPatternFromZones(s));
  }
  recordPassAttempt(t, e) {
    const s = this.state.possession;
    s.teamSide && (s.passCount += 1, s.lastPassRoute = t, s.activeAttackPattern = this.attackPatternFromPassRoute(t), this.recordPossessionPosition(s.teamSide, e));
  }
  recordSuccessfulPass(t, e) {
    this.state.possession.teamSide === e.side && (this.state.possession.lastSuccessfulPassRoute = t, this.state.possession.activeAttackPattern = this.attackPatternFromPassRoute(t), this.recordPossessionPosition(e.side, e));
  }
  recordSecondBallRecovery(t) {
    this.state.possession.secondBallRecoveries += 1, this.state.possession.lastRecoveryType = t, this.state.possession.activeAttackPattern = t;
  }
  createPlayers(t, e, s, i, a = "starter") {
    const n = this.formationTargetsForRoles(i.map((r) => r.position), e, s, 1);
    return i.map((r, h) => {
      const u = n[h];
      return {
        id: `${e}-${a}-${h}-${r.info.number}`,
        team: t,
        side: e,
        player: r,
        role: r.position,
        x: u.x,
        y: u.y,
        target: { ...u },
        stamina: 100,
        attributes: r.attributes,
        currentIntent: this.intent("hold_shape", { ...u }),
        actionCooldown: 0,
        foulsCommitted: 0,
        foulsSuffered: 0,
        yellowCards: 0,
        redCard: !1,
        aggressionRisk: r.attributes.aggression / 20,
        tackleTimingRisk: this.clamp(1 - r.attributes.tackling / 20, 0, 1),
        injurySeverity: "none",
        injuryPerformancePenalty: 0,
        onPitch: a === "starter"
      };
    });
  }
  createBenchPlayers(t, e, s) {
    const i = t.players.slice(11, 16), a = i.length ? i : this.generateBenchPlayers(t);
    return this.createPlayers(t, e, s, a, "bench");
  }
  generateBenchPlayers(t) {
    const e = t.players[0], s = e ? e.attributes : this.fallbackAttributes();
    return [c.GK, c.CB, c.CM, c.RM, c.ST].map((a, n) => new V({
      name: `${t.name} Bench ${c[a]}`,
      number: 90 + n
    }, {
      height: 180,
      weight: 76
    }, { ...s }, a));
  }
  fallbackAttributes() {
    return {
      aggression: 12,
      anticipation: 12,
      bravery: 12,
      composure: 12,
      concentration: 12,
      decisions: 12,
      determination: 12,
      flair: 12,
      leadership: 12,
      offTheBall: 12,
      positioning: 12,
      teamwork: 12,
      vision: 12,
      workRate: 12,
      acceleration: 12,
      agility: 12,
      balance: 12,
      jumpingReach: 12,
      naturalFitness: 12,
      pace: 12,
      stamina: 12,
      strength: 12,
      corners: 12,
      crossing: 12,
      dribbling: 12,
      finishing: 12,
      firstTouch: 12,
      freeKickTaking: 12,
      heading: 12,
      longShots: 12,
      longThrows: 12,
      marking: 12,
      passing: 12,
      penaltyTaking: 12,
      tackling: 12,
      technique: 12,
      aerialReach: 12,
      commandOfArea: 12,
      communication: 12,
      eccentricity: 12,
      handling: 12,
      oneOnOnes: 12,
      reflexes: 12,
      rushingOut: 12,
      tendencyToPunch: 12,
      throwing: 12
    };
  }
  intent(t, e, s = {}) {
    return {
      type: t,
      target: e,
      targetPlayerId: s.targetPlayerId,
      duration: s.duration ?? 2,
      urgency: s.urgency ?? 0.5,
      tacticalRisk: s.tacticalRisk ?? 0.25
    };
  }
  handleTimeBoundaries() {
    const e = this.matchLengthSeconds / 2 + this.state.addedTime.firstHalf, s = this.matchLengthSeconds + this.state.addedTime.secondHalf;
    return this.state.period === 1 && this.state.time >= e ? (this.state.time = e, this.state.period = 2, this.state.phase = "half_time", this.resetForKickoff(this.startedSecondHalfSide()), this.nextPhaseAfterSnapshot = "open_play", [
      this.createEvent("half_time"),
      this.createEvent("kickoff", this.state.ball.owner || void 0)
    ]) : this.state.time >= s ? (this.state.time = s, this.state.period = "ended", this.state.phase = "full_time", this.state.ball.owner = null, this.state.ball.velocity = { x: 0, y: 0 }, this.state.activeBallAction = null, this.state.restart = null, [this.createEvent("full_time")]) : [];
  }
  startedSecondHalfSide() {
    return this.startedWithBallSide ? this.oppositeSide(this.startedWithBallSide) : "away";
  }
  resetForKickoff(t) {
    this.resetPlayersToFormation();
    const e = this.closestPlayerTo(t, { x: l.length / 2, y: l.width / 2 });
    this.state.ball.x = l.length / 2, this.state.ball.y = l.width / 2, this.state.ball.velocity = { x: 0, y: 0 }, this.state.ball.owner = e, this.state.activeBallAction = null, this.state.secondBall = null, e && (this.startPossession(t, "kickoff"), this.registerTouch(e)), e && (e.x = this.state.ball.x, e.y = this.state.ball.y, e.actionCooldown = 0.6);
  }
  resolvePhaseAction() {
    return this.state.restart ? this.state.restart.phase === "throw_in" ? [this.executeThrowIn()] : this.state.restart.phase === "corner" ? [this.executeCorner()] : this.state.restart.phase === "goal_kick" ? [this.executeGoalKick()] : this.state.restart.phase === "free_kick" ? [this.executeFreeKick()] : this.state.restart.phase === "penalty" ? this.executePenalty() : (this.nextPhaseAfterSnapshot = "open_play", this.clearRestartAfterSnapshot = !0, []) : (this.nextPhaseAfterSnapshot = "open_play", []);
  }
  executeThrowIn() {
    const t = this.state.restart, e = this.state.ball.owner || this.selectRestartTaker(t), s = this.selectThrowInTarget(t.teamSide, e), i = s ? { x: s.x, y: s.y } : this.safeRestartTarget(t.teamSide, t.position, 12), a = this.random() < 0.75 ? "short_safe_throw" : "throw_down_line";
    return this.playRestartPass("throw_in", e, s, i, 18, a);
  }
  executeCorner() {
    const t = this.state.restart, e = this.state.ball.owner || this.selectRestartTaker(t), s = ["near_post", "far_post", "penalty_spot", "short_corner"], i = s[Math.floor(this.random() * s.length)] || "penalty_spot", a = i === "short_corner" ? this.selectThrowInTarget(t.teamSide, e) : this.selectBoxTarget(t.teamSide, e), n = a ? { x: a.x, y: a.y } : this.cornerTargetPoint(t.teamSide, i), r = i === "short_corner" ? 16 : 28;
    return this.playRestartPass("corner", e, a, n, r, i);
  }
  executeGoalKick() {
    const t = this.state.restart, e = this.state.ball.owner || this.selectRestartTaker(t), s = this.random() < 0.55, i = s ? this.selectShortGoalKickTarget(t.teamSide, e) : this.selectLongGoalKickTarget(t.teamSide, e), a = i ? { x: i.x, y: i.y } : this.safeRestartTarget(t.teamSide, t.position, s ? 18 : 45);
    return this.playRestartPass("goal_kick", e, i, a, s ? 24 : 34, s ? "short_build_up" : "long_kick");
  }
  executeFreeKick() {
    const t = this.state.restart, e = this.state.ball.owner || this.selectRestartTaker(t), s = this.goalCenterAgainst(t.teamSide);
    if (this.distance(t.position, s) < 28 && this.random() < 0.45)
      return this.playRestartShot("free_kick", e, s, 30, "direct_free_kick");
    const a = this.selectBoxTarget(t.teamSide, e) || this.selectThrowInTarget(t.teamSide, e), n = a ? { x: a.x, y: a.y } : this.safeRestartTarget(t.teamSide, t.position, 22);
    return this.playRestartPass("free_kick", e, a, n, 24, "indirect_free_kick");
  }
  executePenalty() {
    const t = this.state.restart, e = this.state.ball.owner || this.selectRestartTaker(t), s = this.goalkeeperFor(this.oppositeSide(t.teamSide)), i = (e.attributes.penaltyTaking + e.attributes.composure + e.attributes.finishing) / 60, a = s ? (s.attributes.reflexes + s.attributes.oneOnOnes + s.attributes.handling) / 60 : 0.45, n = this.clamp(0.72 + i * 0.18 - a * 0.14, 0.58, 0.9), r = this.random();
    if (this.state.ball.velocity = { x: 0, y: 0 }, this.state.activeBallAction = null, this.registerTouch(e), this.nextPhaseAfterSnapshot = "open_play", this.clearRestartAfterSnapshot = !0, r < n) {
      this.state.score[t.teamSide] += 1;
      const h = this.createEvent("penalty", e, s || void 0, "goal", {
        chanceQuality: n
      }), u = this.createEvent("goal", e, s || void 0, "penalty_goal", {
        chanceQuality: n
      });
      u.replayWindow = this.replayWindowForGoal(), this.resetForKickoff(this.oppositeSide(t.teamSide)), this.state.phase = "kickoff", this.nextPhaseAfterSnapshot = "open_play";
      const g = this.createEvent("kickoff", this.state.ball.owner || void 0);
      return [h, u, g];
    }
    return r < n + 0.08 ? (this.state.ball.owner = null, [this.createEvent("penalty", e, s || void 0, "miss", {
      chanceQuality: n
    })]) : (s && (this.state.ball.owner = s, this.registerTouch(s)), [this.createEvent("penalty", e, s || void 0, this.random() < 0.3 ? "save_rebound" : "save", {
      chanceQuality: n
    })]);
  }
  playRestartPass(t, e, s, i, a, n) {
    var u;
    const r = ((u = this.state.restart) == null ? void 0 : u.position) || { x: this.state.ball.x, y: this.state.ball.y }, h = this.clampPoint(i);
    return e.x = r.x, e.y = r.y, this.state.possession.activeAttackPattern = "set_piece", this.state.ball.owner = null, this.state.ball.x = r.x, this.state.ball.y = r.y, this.state.ball.velocity = this.velocityTowards(r, h, a), this.registerTouch(e), this.state.activeBallAction = {
      type: "pass",
      from: e,
      teamSide: e.side,
      origin: { ...r },
      target: h,
      targetPlayer: s || void 0,
      inaccurate: !1,
      quality: 0.76,
      estimatedArrivalTime: this.state.time + this.distance(r, h) / a,
      passSpeed: a,
      receiveDifficulty: t === "goal_kick" && n === "long_kick" ? 0.72 : 0.34,
      targetKind: n === "long_kick" ? "contest" : "feet",
      route: n,
      restartType: t
    }, this.state.secondBall = null, this.recordPassAttempt(n, h), e.actionCooldown = 1.2, this.nextPhaseAfterSnapshot = "open_play", this.clearRestartAfterSnapshot = !0, this.createEvent(t, e, s || void 0, n);
  }
  playRestartShot(t, e, s, i, a) {
    var u;
    const n = ((u = this.state.restart) == null ? void 0 : u.position) || { x: this.state.ball.x, y: this.state.ball.y }, r = this.clamp((e.attributes.freeKickTaking + e.attributes.technique + e.attributes.longShots) / 60, 0.25, 0.9), h = {
      x: s.x,
      y: s.y + (this.random() - 0.5) * l.goalWidth * (1.2 - r)
    };
    return e.x = n.x, e.y = n.y, this.state.ball.owner = null, this.state.ball.x = n.x, this.state.ball.y = n.y, this.state.ball.velocity = this.velocityTowards(n, h, i), this.registerTouch(e), this.state.activeBallAction = {
      type: "shot",
      from: e,
      teamSide: e.side,
      origin: { ...n },
      target: h,
      inaccurate: r < this.random(),
      quality: r,
      chanceQuality: r,
      route: a,
      restartType: t
    }, this.state.secondBall = null, e.actionCooldown = 1.4, this.nextPhaseAfterSnapshot = "open_play", this.clearRestartAfterSnapshot = !0, this.createEvent(t, e, void 0, a, {
      chanceQuality: r
    });
  }
  detectBallOut() {
    var t, e;
    if (this.state.phase !== "open_play")
      return null;
    if (this.state.ball.y < 0 || this.state.ball.y > l.width) {
      const s = this.state.ball.lastTouchSide || ((t = this.state.activeBallAction) == null ? void 0 : t.teamSide) || "home", i = this.oppositeSide(s), a = this.state.ball.y < 0 ? 0 : l.width;
      return this.prepareRestart("throw_in", i, {
        x: this.clamp(this.state.ball.x, 0, l.length),
        y: a
      }, "touchline");
    }
    return this.state.ball.x < 0 || this.state.ball.x > l.length ? this.prepareGoalLineRestart(this.state.ball.lastTouchSide || ((e = this.state.activeBallAction) == null ? void 0 : e.teamSide) || "home") : null;
  }
  prepareGoalLineRestart(t) {
    const e = this.state.ball.x < 0 ? 0 : l.length, s = this.attackingSideForGoalLine(e), i = this.oppositeSide(s);
    return t === s ? this.prepareRestart("goal_kick", i, this.goalKickPosition(i), "goal_line") : this.prepareRestart("corner", s, {
      x: e,
      y: this.state.ball.y < l.width / 2 ? 0 : l.width
    }, "goal_line");
  }
  prepareRestart(t, e, s, i) {
    const a = {
      phase: t,
      teamSide: e,
      position: this.clampPoint(s),
      reason: i
    }, n = this.selectRestartTaker(a);
    return this.state.phase = t, this.state.restart = a, this.state.activeBallAction = null, this.state.secondBall = null, this.state.ball.x = a.position.x, this.state.ball.y = a.position.y, this.state.ball.velocity = { x: 0, y: 0 }, this.state.ball.owner = n, this.startPossession(e, t, t), this.registerTouch(n), this.placePlayersForRestart(a, n), this.createEvent(t, n, void 0, i);
  }
  placePlayersForRestart(t, e) {
    this.updateTacticalTargetPositions(), this.state.players.forEach((s) => {
      if (s === e) {
        s.x = t.position.x, s.y = t.position.y, s.currentIntent = this.intent("hold_shape", { ...t.position }, {
          duration: 1.5,
          urgency: 0.4,
          tacticalRisk: 0.05
        });
        return;
      }
      if (this.distance(s, t.position) < 6) {
        const a = s.side === t.teamSide ? -1 : 1;
        s.x = this.clamp(s.x + a * 4, 0, l.length);
      }
      s.currentIntent = this.intent("hold_shape", { ...s.target }, {
        duration: 2,
        urgency: 0.35,
        tacticalRisk: 0.08
      });
    });
  }
  updateTacticalState() {
    for (const t of ["home", "away"]) {
      const e = this.baseTactics[t], s = this.oppositeSide(t), i = this.state.time / 60, a = this.state.score[t] - this.state.score[s], n = this.playersForSide(t), r = n.length ? n.reduce((b, v) => b + v.stamina, 0) / n.length : 100, h = n.filter((b) => b.redCard).length + (11 - n.length), u = n.filter((b) => b.injurySeverity !== "none").length, g = n.reduce((b, v) => b + v.yellowCards, 0);
      let y = e.press, m = e.tempo, p = e.mentality;
      h > 0 ? (y -= 14, m -= 8, p = "defensive") : a < 0 && i >= 60 ? (y += 10, m += 12, p = "attacking") : a > 0 && i >= 75 && (y -= 8, m -= 10, p = "defensive"), r < 58 && (y -= 8, m -= 5), (g > 1 || u > 0) && (y -= 4), this.state.tactics[t] = {
        ...e,
        press: this.clamp(y, 0, 100),
        tempo: this.clamp(m, 0, 100),
        mentality: p
      };
    }
  }
  updateTacticalTargetPositions() {
    ["home", "away"].forEach((t) => {
      var y;
      const e = this.tactics(t), s = this.playersForSide(t), i = this.formationTargetsForRoles(s.map((m) => m.role), t, e, this.activePeriod()), a = ((y = this.state.ball.owner) == null ? void 0 : y.side) === t, n = this.state.ball, r = this.attackDirection(t), h = a ? 6 : -4 + (e.defensiveLine - 50) * 0.05, u = (n.x - l.length / 2) * 0.12 * r, g = a ? 0 : Math.max(0, (e.compactness - 50) / 100);
      s.forEach((m, p) => {
        const b = i[p], v = this.distance(m, n) < 24 ? 0.18 : 0.08, S = {
          x: b.x + r * (h + u),
          y: b.y + (n.y - b.y) * v + (l.width / 2 - b.y) * g * 0.5
        };
        m.target = this.clampPoint(S);
      });
    });
  }
  resetPlayersToFormation() {
    ["home", "away"].forEach((t) => {
      const e = this.playersForSide(t), s = this.formationTargetsForRoles(e.map((i) => i.role), t, this.tactics(t), this.activePeriod());
      e.forEach((i, a) => {
        const n = s[a];
        i.x = n.x, i.y = n.y, i.target = { ...n }, i.currentIntent = this.intent("hold_shape", { ...n }), i.actionCooldown = 0;
      });
    });
  }
  decidePlayerIntents() {
    var s;
    const t = this.state.ball.owner, e = ((s = this.state.activeBallAction) == null ? void 0 : s.type) === "pass" ? this.state.activeBallAction : null;
    this.state.players.forEach((i) => {
      if (i.actionCooldown = Math.max(0, i.actionCooldown - this.tickSeconds), (e == null ? void 0 : e.targetPlayer) === i) {
        i.currentIntent = this.intentForPassReceiver(i, e);
        return;
      }
      if (i === t) {
        i.currentIntent = this.intentForBallOwner(i);
        return;
      }
      if (!t) {
        i.currentIntent = this.state.secondBall ? this.intentForSecondBall(i) : this.intentForLooseBall(i);
        return;
      }
      if (t.side === i.side) {
        i.currentIntent = this.intentForTeammateInPossession(i, t);
        return;
      }
      i.currentIntent = this.intentForOutOfPossession(i, t);
    });
  }
  intentForPassReceiver(t, e) {
    return this.intent("receive_pass", this.clampPoint(e.target), {
      targetPlayerId: e.from.id,
      duration: Math.max(this.tickSeconds, (e.estimatedArrivalTime || this.state.time + 1) - this.state.time),
      urgency: e.targetKind === "contest" ? 0.9 : 0.78,
      tacticalRisk: e.receiveDifficulty || 0.3
    });
  }
  intentForBallOwner(t) {
    const e = this.goalCenterAgainst(t.side), s = this.distance(t, e), i = T.includes(t.role) ? 25 : 21;
    if (t.actionCooldown === 0 && s < i && this.random() < this.shootingIntentChance(t, s))
      return this.intent("shoot", e, {
        duration: 1,
        urgency: 0.9,
        tacticalRisk: s > 24 ? 0.65 : 0.45
      });
    if (t.actionCooldown > 0)
      return this.dribbleIntent(t);
    const a = this.selectPassTarget(t), n = this.tactics(t.side), h = 0.12 + n.tempo / 100 * 0.22 + this.stylePassFrequencyBonus(n.style);
    return t.actionCooldown === 0 && a && this.random() < h ? this.intent("pass", {
      x: a.x,
      y: a.y
    }, {
      targetPlayerId: a.id,
      duration: 1,
      urgency: 0.7,
      tacticalRisk: this.distance(t, a) > 25 ? 0.45 : 0.25
    }) : this.dribbleIntent(t);
  }
  dribbleIntent(t) {
    const e = this.attackDirection(t.side), s = this.isWideCarrier(t) && this.hasOverlappingSupport(t);
    return this.intent("dribble", this.clampPoint({
      x: t.x + e * 8,
      y: t.y + (l.width / 2 - t.y) * (s ? 0.55 : 0.2)
    }), {
      duration: 2,
      urgency: 0.62,
      tacticalRisk: 0.38
    });
  }
  intentForLooseBall(t) {
    const e = this.distance(t, this.state.ball);
    return this.closestPlayerTo(t.side, this.state.ball) === t || e < 8 ? this.intent("recover", {
      x: this.state.ball.x,
      y: this.state.ball.y
    }, {
      duration: 1.5,
      urgency: 0.85,
      tacticalRisk: 0.25
    }) : this.intent("recover_shape", { ...t.target }, {
      duration: 2,
      urgency: 0.5,
      tacticalRisk: 0.12
    });
  }
  intentForSecondBall(t) {
    const e = this.state.secondBall, s = this.distance(t, e), i = this.closestPlayerTo(t.side, e), a = this.closestPlayer(e), n = t.attributes.anticipation / 20, r = t.attributes.aggression / 20, h = s < 14 + (n + r) * 3;
    return i === t || a === t && h || s < 7 ? this.intent("attack_second_ball", {
      x: e.x,
      y: e.y
    }, {
      duration: Math.max(this.tickSeconds, e.expiresAt - this.state.time),
      urgency: 0.82 + n * 0.12,
      tacticalRisk: 0.34
    }) : this.intent("recover_shape", { ...t.target }, {
      duration: 1.5,
      urgency: 0.52,
      tacticalRisk: 0.14
    });
  }
  intentForTeammateInPossession(t, e) {
    const s = this.distance(t, e), i = this.attackDirection(t.side), a = i > 0 ? e.x > l.length * 0.56 : e.x < l.length * 0.44;
    return this.isWideDefender(t) && s < 34 && t.x * i <= e.x * i ? this.intent("overlap", this.overlapTarget(t, e), {
      duration: 4,
      urgency: 0.76,
      tacticalRisk: 0.62
    }) : T.includes(t.role) && this.isWideCarrier(e) && a && s < 30 ? this.intent("underlap", this.underlapTarget(t, e), {
      duration: 3.5,
      urgency: 0.72,
      tacticalRisk: 0.52
    }) : T.includes(t.role) && a ? this.intent("attack_box", this.boxEntryTarget(t.side, t), {
      duration: 3,
      urgency: 0.72,
      tacticalRisk: 0.58
    }) : P.includes(t.role) && s > 12 ? this.intent("make_forward_run", this.forwardRunTarget(t), {
      duration: 3,
      urgency: 0.78,
      tacticalRisk: 0.5
    }) : this.isWideAttacker(t) ? this.intent("drift_wide", this.driftWideTarget(t), {
      duration: 3,
      urgency: 0.56,
      tacticalRisk: 0.34
    }) : s < 28 ? this.intent("support_carrier", this.supportTarget(t, e), {
      duration: 2,
      urgency: 0.65,
      tacticalRisk: 0.26
    }) : this.intent("drop_between_lines", this.betweenLinesTarget(t), {
      duration: 2.5,
      urgency: 0.45,
      tacticalRisk: 0.2
    });
  }
  intentForOutOfPossession(t, e) {
    const s = this.pressDistance(t, e);
    return this.distance(t, e) < s ? this.intent("press", {
      x: e.x,
      y: e.y
    }, {
      duration: 1.5,
      urgency: this.pressUrgency(t.side),
      tacticalRisk: this.pressRisk(t.side)
    }) : _.includes(t.role) && this.distance(t, e) < 22 ? this.intent("track_runner", this.trackRunnerTarget(t, e), {
      duration: 2,
      urgency: 0.68,
      tacticalRisk: 0.22
    }) : T.includes(t.role) ? this.intent("cover_passing_lane", this.coverLaneTarget(t, e), {
      duration: 2.5,
      urgency: 0.52,
      tacticalRisk: 0.18
    }) : this.intent("hold_shape", { ...t.target }, {
      duration: 2,
      urgency: 0.35,
      tacticalRisk: 0.1
    });
  }
  pressDistance(t, e) {
    const s = this.tactics(t.side), i = this.fieldZonesFor(t.side, e), a = P.includes(t.role) ? 3 : T.includes(t.role) ? 1.5 : 0, n = this.pressTrapBonus(s, i);
    return 7 + s.press * 0.16 + s.defensiveLine * 0.05 - s.compactness * 0.02 + this.stylePressDistanceModifier(s.style) + a + n;
  }
  stylePressDistanceModifier(t) {
    switch (t) {
      case "high_press":
        return 3;
      case "low_block":
        return -6;
      case "counter":
        return -2;
      default:
        return 0;
    }
  }
  pressTrapBonus(t, e) {
    let s = 0;
    return t.style === "high_press" && e.includes("attacking_third") && (s += 5), t.focus === "wide" && this.hasWideZone(e) && (s += 3), t.focus === "central" && t.press >= 45 && e.includes("central_lane") && (s += 2), s;
  }
  pressUrgency(t) {
    const e = this.tactics(t);
    return this.clamp(0.64 + e.press / 100 * 0.28 + e.defensiveLine / 100 * 0.08, 0.58, 0.98);
  }
  pressRisk(t) {
    const e = this.tactics(t), s = e.compactness / 100 * 0.12;
    return this.clamp(0.22 + e.press / 100 * 0.26 + e.defensiveLine / 100 * 0.18 - s, 0.18, 0.78);
  }
  resolveBallAction() {
    const t = this.state.ball.owner;
    if (!t || t.actionCooldown > 0 || this.state.activeBallAction)
      return [];
    if (t.currentIntent.type === "pass" && t.currentIntent.targetPlayerId) {
      const e = this.playerById(t.currentIntent.targetPlayerId);
      return e ? [this.startPass(t, e)] : [];
    }
    return t.currentIntent.type === "shoot" ? [this.startShot(t)] : t.currentIntent.type === "dribble" && this.random() < 0.08 ? (t.actionCooldown = 0.6, [this.createEvent("dribble", t, void 0, "dribble_into_space")]) : [];
  }
  startPass(t, e) {
    const s = this.pressureAround(t), i = this.distance(t, e), a = this.passQuality(t, i, s), n = this.random() > a, r = this.passRoute(t, e), h = this.passSpeed(r, i), u = this.passTargetKind(r, i, this.tactics(t.side)), g = this.passTargetPoint(t, e, r, h), y = n ? this.randomPoint(2.5, this.passMissDistance(i, r)) : { x: 0, y: 0 }, m = {
      x: g.x + y.x,
      y: g.y + y.y
    }, p = n ? m : this.clampPassTarget(m);
    return this.state.ball.owner = null, this.state.ball.x = t.x, this.state.ball.y = t.y, this.state.ball.velocity = this.velocityTowards(t, p, h), this.registerTouch(t), this.state.activeBallAction = {
      type: "pass",
      from: t,
      teamSide: t.side,
      origin: { x: t.x, y: t.y },
      target: p,
      targetPlayer: e,
      inaccurate: n,
      quality: a,
      estimatedArrivalTime: this.state.time + this.distance(t, p) / h,
      passSpeed: h,
      receiveDifficulty: this.receiveDifficulty(t, e, i, s, r, u),
      targetKind: u,
      route: r
    }, this.state.secondBall = null, this.recordPassAttempt(r, p), e.currentIntent = this.intentForPassReceiver(e, this.state.activeBallAction), t.actionCooldown = 0.7 + (1 - this.tactics(t.side).tempo / 100) * 0.8, this.createEvent("pass", t, e, n ? `${r}_inaccurate` : r);
  }
  startShot(t) {
    const e = this.goalCenterAgainst(t.side), s = this.distance(t, e), i = this.shotRoute(t, s), a = this.shotQuality(t, s, i), n = {
      x: e.x,
      y: e.y + (this.random() - 0.5) * l.goalWidth * 3.2 * (1.08 - a)
    };
    return this.state.possession.activeAttackPattern = this.attackPatternFromShotRoute(i), this.state.ball.owner = null, this.state.ball.x = t.x, this.state.ball.y = t.y, this.state.ball.velocity = this.velocityTowards(t, n, 34), this.registerTouch(t), this.state.activeBallAction = {
      type: "shot",
      from: t,
      teamSide: t.side,
      origin: { x: t.x, y: t.y },
      target: n,
      inaccurate: a < this.random(),
      quality: a,
      chanceQuality: a,
      route: i
    }, this.state.secondBall = null, t.actionCooldown = 1.8, this.createEvent("shot", t, void 0, i, {
      chanceQuality: a
    });
  }
  movePlayersAndBall() {
    if (this.state.players.forEach((e) => {
      const s = e.currentIntent.target, i = this.playerSpeed(e);
      this.moveTowards(e, s, i * this.tickSeconds), this.updateStamina(e);
    }), this.state.ball.owner) {
      this.state.ball.x = this.state.ball.owner.x, this.state.ball.y = this.state.ball.owner.y, this.state.ball.velocity = { x: 0, y: 0 }, this.state.secondBall = null, this.registerTouch(this.state.ball.owner);
      return;
    }
    this.state.ball.x += this.state.ball.velocity.x * this.tickSeconds, this.state.ball.y += this.state.ball.velocity.y * this.tickSeconds;
    const t = this.state.secondBall ? 0.9 : 0.985;
    this.state.ball.velocity.x *= t, this.state.ball.velocity.y *= t, this.state.secondBall && (this.state.secondBall.x = this.state.ball.x, this.state.secondBall.y = this.state.ball.y, this.state.time >= this.state.secondBall.expiresAt && (this.state.secondBall = null));
  }
  detectEvents() {
    var e, s;
    if (((e = this.state.activeBallAction) == null ? void 0 : e.type) === "shot")
      return this.detectShotOutcome(this.state.activeBallAction);
    if (((s = this.state.activeBallAction) == null ? void 0 : s.type) === "pass") {
      const i = this.detectPassOutcome(this.state.activeBallAction);
      if (i.length)
        return i;
    }
    const t = this.detectBallOut();
    return t ? [t] : this.state.ball.owner ? this.detectTackleOrFoul(this.state.ball.owner) : this.state.activeBallAction ? [] : this.detectLooseBallRecovery();
  }
  detectTackleOrFoul(t) {
    const e = this.nearestOpponent(t.side, t), s = e ? this.isPenaltyFoul(e.side, t) : !1, i = s ? 0.95 : 1.4;
    if (!e || this.distance(t, e) > i)
      return [];
    if (e.actionCooldown > 0)
      return [];
    const a = this.createEvent("challenge", e, t, "standing_tackle"), n = this.clamp(0.04 + e.attributes.tackling / 20 * 0.08 - t.attributes.dribbling / 20 * 0.06 - e.injuryPerformancePenalty * 0.04, 0.01, 0.12), r = this.clamp(2e-3 + e.attributes.aggression / 20 * 8e-3 + this.state.referee.strictness / 100 * 6e-3 + e.tackleTimingRisk * 5e-3, 1e-3, 0.012), h = s ? r * 0.03 : r;
    return e.actionCooldown = 0.55, this.random() < h ? (this.state.ball.velocity = { x: 0, y: 0 }, [a, ...this.resolveFoul(e, t)]) : this.random() < n ? (this.state.ball.owner = e, this.state.secondBall = null, e.actionCooldown = 0.7, this.registerTouch(e), [a, this.createEvent("tackle", e, t)]) : [a];
  }
  resolveFoul(t, e) {
    t.foulsCommitted += 1, e.foulsSuffered += 1, this.state.ball.owner = null, this.state.activeBallAction = null;
    const s = [
      this.createEvent("foul", t, e, "late_challenge"),
      ...this.bookingEvents(t, e),
      ...this.injuryEvents(e, "heavy_challenge")
    ];
    if (this.shouldPlayAdvantage(t, e))
      return this.state.ball.owner = e, this.state.ball.velocity = { x: 0, y: 0 }, this.state.secondBall = null, this.registerTouch(e), [
        ...s,
        this.createEvent("advantage", e, t, "advantage_played")
      ];
    const i = this.prepareFoulRestart(t, e);
    return [...s, i];
  }
  shouldPlayAdvantage(t, e) {
    if (e.injurySeverity === "forced" || t.redCard)
      return !1;
    const s = this.attackDirection(e.side), i = (e.x - l.length / 2) * s, a = this.playersForSide(e.side).some((n) => n !== e && this.distance(n, e) < 12);
    return i > 24 && a && this.state.referee.advantagePatience >= 40 && !this.isPenaltyFoul(t.side, e);
  }
  bookingEvents(t, e) {
    const s = t.foulsCommitted >= 3 ? 0.18 : t.foulsCommitted >= 2 ? 0.08 : 0, i = this.attackDirection(e.side) * (e.x - t.x) > 0 ? 0.08 : 0, a = this.clamp(0.04 + this.state.referee.strictness / 100 * 0.12 + t.aggressionRisk * 0.1 + t.tackleTimingRisk * 0.08 + s + i - this.state.referee.bookingThreshold / 100 * 0.08, 0.02, 0.72);
    if (this.random() >= a)
      return [];
    t.yellowCards += 1;
    const n = this.createEvent("yellow_card", t, e, t.yellowCards > 1 ? "second_yellow" : "reckless_tackle");
    return t.yellowCards < 2 ? [n] : (this.applyRedCard(t), [
      n,
      this.createEvent("red_card", t, e, "second_yellow")
    ]);
  }
  injuryEvents(t, e) {
    const s = (100 - t.stamina) / 100 * 0.05, i = e === "heavy_challenge" ? 0.035 : 0.01, a = this.clamp(6e-3 + s + i - t.attributes.naturalFitness / 20 * 0.02, 3e-3, 0.18);
    if (this.random() >= a)
      return [];
    const n = this.random(), r = n < 0.22 ? "forced" : n < 0.58 ? "minor" : "knock";
    t.injurySeverity = r, t.injuryPerformancePenalty = r === "forced" ? 0.45 : r === "minor" ? 0.18 : 0.08;
    const h = [
      this.createEvent("injury", t, void 0, r)
    ];
    if (r === "forced") {
      const u = this.performSubstitution(t, "forced_injury", !1);
      u && h.push(u);
    }
    return h;
  }
  prepareFoulRestart(t, e) {
    const s = this.clampPoint({
      x: this.state.ball.x,
      y: this.state.ball.y
    });
    return this.isPenaltyFoul(t.side, s) ? this.prepareRestart("penalty", e.side, this.penaltySpotFor(e.side), "penalty_foul") : this.prepareRestart("free_kick", e.side, s, "foul");
  }
  applyRedCard(t) {
    t.redCard = !0, t.onPitch = !1, this.state.players = this.state.players.filter((e) => e !== t), this.state.tactics[t.side] = {
      ...this.state.tactics[t.side],
      press: this.clamp(this.state.tactics[t.side].press - 12, 0, 100),
      tempo: this.clamp(this.state.tactics[t.side].tempo - 8, 0, 100),
      mentality: "defensive"
    }, this.state.ball.owner === t && (this.state.ball.owner = null);
  }
  detectSubstitutionEvents() {
    for (const t of ["home", "away"]) {
      if (this.state.substitutionsUsed[t] >= 5 || !this.state.bench[t].length)
        continue;
      const e = this.substitutionCandidate(t);
      if (!e)
        continue;
      const s = this.performSubstitution(e.player, e.reason, !0);
      return s ? [s] : [];
    }
    return [];
  }
  substitutionCandidate(t) {
    const e = this.state.time / 60, s = this.playersForSide(t), i = s.find((u) => u.injurySeverity === "forced");
    if (i)
      return {
        player: i,
        reason: "forced_injury"
      };
    const a = s.filter((u) => e >= 60 && u.stamina < 42).sort((u, g) => u.stamina - g.stamina)[0];
    if (a)
      return {
        player: a,
        reason: "exhausted"
      };
    const n = s.filter((u) => e >= 55 && u.yellowCards > 0 && _.includes(u.role)).sort((u, g) => this.pressureAround(g) - this.pressureAround(u))[0];
    if (n && this.pressureAround(n) > 0.25)
      return {
        player: n,
        reason: "booked_defender_under_pressure"
      };
    const r = this.state.score[t] - this.state.score[this.oppositeSide(t)], h = s.filter((u) => e >= 70 && r < 0 && P.includes(u.role)).sort((u, g) => u.stamina - g.stamina)[0];
    return h ? {
      player: h,
      reason: "chasing_goal"
    } : null;
  }
  performSubstitution(t, e, s) {
    const i = this.state.bench[t.side], a = this.selectSubstituteFor(t);
    if (!a || this.state.substitutionsUsed[t.side] >= 5)
      return null;
    this.state.bench[t.side] = i.filter((r) => r !== a), this.state.substitutionsUsed[t.side] += 1, t.onPitch = !1, a.onPitch = !0, a.role = t.role, a.x = t.x, a.y = t.y, a.target = { ...t.target }, a.currentIntent = this.intent("hold_shape", { ...t.target }, {
      duration: 2,
      urgency: 0.5,
      tacticalRisk: 0.1
    }), a.actionCooldown = 1;
    const n = this.state.players.indexOf(t);
    return n >= 0 ? this.state.players.splice(n, 1, a) : this.state.players.push(a), this.state.ball.owner === t && (this.state.ball.owner = a, this.registerTouch(a)), s && (this.state.phase = "substitution", this.nextPhaseAfterSnapshot = "open_play"), this.createEvent("substitution", a, t, e);
  }
  selectSubstituteFor(t) {
    const e = this.state.bench[t.side], s = (i) => i.role === t.role ? 0 : t.role === c.GK ? i.role === c.GK ? 1 : 50 : _.includes(t.role) ? _.includes(i.role) ? 2 : 20 : T.includes(t.role) ? T.includes(i.role) ? 2 : 16 : P.includes(t.role) ? P.includes(i.role) ? 2 : 18 : 10;
    return e.slice().sort((i, a) => {
      const n = s(i) - i.stamina / 100, r = s(a) - a.stamina / 100;
      return n - r;
    })[0] || null;
  }
  isPenaltyFoul(t, e) {
    const s = this.goalCenterAgainst(this.oppositeSide(t)), i = 14 + (100 - this.state.referee.penaltyThreshold) / 100 * 4, a = s.x === 0 ? e.x <= i : e.x >= l.length - i, n = Math.abs(e.y - l.width / 2) <= 20.16;
    return a && n;
  }
  ballIsInPenaltyArea(t, e) {
    const i = this.goalCenterAgainst(this.oppositeSide(t)).x === 0 ? e.x <= 18 : e.x >= l.length - 18, a = Math.abs(e.y - l.width / 2) <= 22;
    return i && a;
  }
  penaltySpotFor(t) {
    const e = this.goalCenterAgainst(t), s = this.attackDirection(t);
    return {
      x: e.x - s * 11,
      y: l.width / 2
    };
  }
  detectLooseBallRecovery() {
    const t = this.closestPlayer({ x: this.state.ball.x, y: this.state.ball.y }), e = this.state.secondBall ? 2.2 : 1.6;
    if (!t || this.distance(t, this.state.ball) > e)
      return [];
    const s = this.state.secondBall;
    return this.state.ball.owner = t, this.state.ball.velocity = { x: 0, y: 0 }, this.state.secondBall = null, t.actionCooldown = s ? 0.42 : 0.35, this.registerTouch(t), s && this.recordSecondBallRecovery(s.source), [this.createEvent("recovery", t)];
  }
  detectPassOutcome(t) {
    const e = this.detectGoalkeeperSetPieceAction(t);
    if (e)
      return [e];
    const s = this.detectGoalkeeperSweep(t);
    if (s)
      return [s];
    const i = this.detectAerialDuel(t);
    if (i)
      return [i];
    if (this.ballOutsidePitch() && this.random() < this.keepOverhitPassInPlayChance(t))
      return [this.createSecondBall(t, "overhit_pass_second_ball")];
    const a = this.playersAgainst(t.teamSide).filter((n) => this.distance(n, this.state.ball) < 1.8).sort((n, r) => this.distance(n, this.state.ball) - this.distance(r, this.state.ball))[0];
    return a && (t.inaccurate || this.random() < this.interceptionChance(a, t)) ? ["cross", "cutback"].includes(t.route || "") && this.fieldZonesFor(t.teamSide, this.state.ball).includes("final_third") ? (this.registerTouch(a), this.random() < 0.34 ? [this.prepareRestart("corner", t.teamSide, {
      x: this.goalCenterAgainst(t.teamSide).x,
      y: this.state.ball.y < l.width / 2 ? 0 : l.width
    }, "goal_line")] : [this.createSecondBall(t, "blocked_cross_second_ball")]) : (this.state.ball.owner = a, this.state.ball.velocity = { x: 0, y: 0 }, this.state.activeBallAction = null, this.state.secondBall = null, a.actionCooldown = 0.75, this.registerTouch(a), [this.createEvent("interception", a, t.from)]) : t.targetPlayer && this.distance(t.targetPlayer, this.state.ball) < this.receiveZone(t) ? this.resolveFirstTouch(t) : this.distance(this.state.ball, t.target) < this.passTargetZone(t) || this.ballIsSlow() ? [this.createSecondBall(t, t.inaccurate ? "misplaced_pass" : "heavy_pass")] : [];
  }
  resolveFirstTouch(t) {
    const e = t.targetPlayer, s = this.pressureAround(e), i = this.firstTouchChance(e, t, s), a = this.random();
    if (a < i)
      return this.state.ball.owner = e, this.state.ball.x = e.x, this.state.ball.y = e.y, this.state.ball.velocity = { x: 0, y: 0 }, this.state.activeBallAction = null, this.state.secondBall = null, e.actionCooldown = a < i * 0.82 ? 0.18 : 0.45, this.registerTouch(e), this.recordSuccessfulPass(t.route || "open_play", e), [this.createEvent("receive", e, t.from, a < i * 0.82 ? "clean_receive" : "heavy_touch_retained")];
    const n = this.nearestOpponent(t.teamSide, e), r = n && this.distance(n, e) < 3.2, h = n ? this.clamp(0.12 + this.interceptionChance(n, t) * 0.45 + s * 0.24, 0.12, 0.68) : 0;
    return n && r && this.random() < h ? (this.state.ball.owner = n, this.state.ball.x = n.x, this.state.ball.y = n.y, this.state.ball.velocity = { x: 0, y: 0 }, this.state.activeBallAction = null, this.state.secondBall = null, n.actionCooldown = 0.75, this.registerTouch(n), [this.createEvent("interception", n, t.from, "poor_first_touch")]) : [this.createSecondBall(t, "loose_first_touch")];
  }
  firstTouchChance(t, e, s) {
    const i = t.attributes.firstTouch / 20, a = t.attributes.composure / 20, n = t.attributes.technique / 20, r = (e.passSpeed || 24) / 34, h = e.receiveDifficulty || 0.35, u = e.targetKind === "contest" ? 0.18 : e.targetKind === "space" ? 0.08 : 0, g = this.distance(t, e.target);
    return this.clamp(0.62 + e.quality * 0.26 + i * 0.18 + a * 0.12 + n * 0.08 - s * 0.14 - h * 0.12 - r * 0.04 - u - g / 100, 0.4, 0.96);
  }
  createSecondBall(t, e) {
    const s = this.secondBallPoint(t);
    if (this.shouldSecondBallRunOut(t, s))
      return this.state.activeBallAction = null, this.state.secondBall = null, this.state.ball.owner = null, this.state.ball.x = s.x, this.state.ball.y = s.y < l.width / 2 ? -0.1 : l.width + 0.1, this.state.ball.velocity = { x: 0, y: 0 }, this.prepareRestart("throw_in", this.oppositeSide(t.teamSide), {
        x: this.clamp(s.x, 0, l.length),
        y: s.y < l.width / 2 ? 0 : l.width
      }, "touchline");
    const i = t.targetKind === "contest" ? 2.2 : 1.2, a = { x: s.x, y: l.width / 2 };
    return this.state.ball.owner = null, this.state.ball.x = s.x, this.state.ball.y = s.y, this.state.ball.velocity = this.velocityTowards(s, a, 0.2 + this.random() * i), this.state.activeBallAction = null, this.state.secondBall = {
      x: s.x,
      y: s.y,
      expiresAt: this.state.time + (t.targetKind === "contest" ? 5 : 4),
      teamSide: t.teamSide,
      sourcePlayerId: t.from.id,
      source: "second_ball"
    }, this.createEvent("second_ball", t.targetPlayer || t.from, t.from, e);
  }
  shouldSecondBallRunOut(t, e) {
    return t.inaccurate ? e.y < 22 || e.y > l.width - 22 ? this.random() < 0.24 : this.random() < 0.045 : !1;
  }
  secondBallPoint(t) {
    const e = t.origin || t.from, s = this.clampPassTarget(t.target);
    return (s.x < 5 || s.x > l.length - 5 || s.y < 5 || s.y > l.width - 5) && t.inaccurate && this.distance(e, s) > 24 ? this.clampPassTarget(s) : this.clampPassTarget({
      x: s.x,
      y: s.y
    });
  }
  receiveZone(t) {
    const e = t.receiveDifficulty || 0.35, s = t.targetKind === "feet" ? 2.1 : t.targetKind === "space" ? 2.6 : 3;
    return this.clamp(s - e * 0.45 + t.quality * 0.35, 1.7, 3.2);
  }
  passTargetZone(t) {
    return t.targetKind === "contest" ? 3.4 : t.inaccurate ? 2.8 : 2.2;
  }
  keepOverhitPassInPlayChance(t) {
    return t.targetKind === "contest" ? 0.65 : t.inaccurate ? 0.74 : 0.9;
  }
  detectGoalkeeperSetPieceAction(t) {
    if (!["corner", "cross", "cutback"].includes(t.restartType || t.route || ""))
      return null;
    const e = this.goalkeeperFor(this.oppositeSide(t.teamSide));
    if (!e || this.distance(e, this.state.ball) > 13 || !this.ballIsInPenaltyArea(e.side, this.state.ball))
      return null;
    const s = this.clamp(0.18 + e.attributes.aerialReach / 20 * 0.18 + e.attributes.commandOfArea / 20 * 0.16 + e.attributes.handling / 20 * 0.12 - t.quality * 0.08, 0.16, 0.68), i = this.random();
    return this.state.activeBallAction = null, i < s ? (this.state.ball.owner = e, this.state.ball.x = e.x, this.state.ball.y = e.y, this.state.ball.velocity = { x: 0, y: 0 }, this.state.secondBall = null, e.actionCooldown = 1, this.registerTouch(e), this.createEvent("goalkeeper_claim", e, t.from, t.restartType || t.route)) : i < s + e.attributes.tendencyToPunch / 20 * 0.22 ? (this.state.ball.owner = null, this.state.ball.velocity = {
      x: -this.attackDirection(t.teamSide) * (10 + this.random() * 8),
      y: (this.random() - 0.5) * 12
    }, this.state.secondBall = null, this.registerTouch(e), this.createEvent("goalkeeper_punch", e, t.from, t.restartType || t.route)) : (this.state.activeBallAction = t, null);
  }
  detectGoalkeeperSweep(t) {
    if (t.route !== "through_ball")
      return null;
    const e = this.goalkeeperFor(this.oppositeSide(t.teamSide));
    if (!e || this.distance(e, this.state.ball) > 11)
      return null;
    const s = this.goalCenterAgainst(t.teamSide);
    if (this.distance(this.state.ball, s) > 24)
      return null;
    const i = this.clamp(0.18 + e.attributes.rushingOut / 20 * 0.24 + e.attributes.oneOnOnes / 20 * 0.12 - t.quality * 0.12, 0.12, 0.58);
    return this.random() >= i ? null : (this.state.ball.owner = e, this.state.ball.x = e.x, this.state.ball.y = e.y, this.state.ball.velocity = { x: 0, y: 0 }, this.state.activeBallAction = null, this.state.secondBall = null, e.actionCooldown = 0.9, this.registerTouch(e), this.createEvent("goalkeeper_claim", e, t.from, "sweeper_keeper"));
  }
  detectAerialDuel(t) {
    if (t.restartType !== "goal_kick" || t.route !== "long_kick" || !t.targetPlayer || this.distance(t.targetPlayer, this.state.ball) > 2.4)
      return null;
    const e = this.nearestOpponent(t.teamSide, t.targetPlayer);
    if (!e || this.distance(e, t.targetPlayer) > 5)
      return null;
    const s = t.targetPlayer.attributes.heading + t.targetPlayer.attributes.jumpingReach + t.targetPlayer.attributes.strength, i = e.attributes.heading + e.attributes.jumpingReach + e.attributes.strength, a = this.clamp(0.5 + (s - i) / 120, 0.25, 0.75), n = this.random();
    return this.state.activeBallAction = null, this.state.ball.velocity = { x: 0, y: 0 }, n < a ? (this.state.ball.owner = t.targetPlayer, this.state.secondBall = null, t.targetPlayer.actionCooldown = 0.8, this.registerTouch(t.targetPlayer), this.createEvent("aerial_duel", t.targetPlayer, e, "attacker_wins")) : n > 0.92 ? (this.state.ball.owner = null, this.state.ball.velocity = this.randomPoint(3, 8), this.state.secondBall = {
      x: this.state.ball.x,
      y: this.state.ball.y,
      expiresAt: this.state.time + 5,
      teamSide: t.teamSide,
      sourcePlayerId: t.from.id,
      source: "second_ball"
    }, this.createEvent("aerial_duel", t.targetPlayer, e, "loose_second_ball")) : (this.state.ball.owner = e, this.state.secondBall = null, e.actionCooldown = 0.8, this.registerTouch(e), this.createEvent("aerial_duel", e, t.targetPlayer, "defender_wins"));
  }
  detectShotOutcome(t) {
    const e = this.detectShotBlock(t);
    if (e)
      return [e];
    if (!(this.attackDirection(t.teamSide) > 0 ? this.state.ball.x >= l.length : this.state.ball.x <= 0))
      return [];
    const a = l.width / 2, n = Math.abs(this.state.ball.y - a) <= l.goalWidth / 2, r = this.goalkeeperFor(this.oppositeSide(t.teamSide)), h = r ? r.player.ratingAverage() / 20 : 0.55, u = this.clamp(0.48 + h * 0.34 - t.quality * 0.28, 0.34, 0.82);
    if (n && this.random() > u) {
      this.state.score[t.teamSide] += 1, this.state.ball.velocity = { x: 0, y: 0 }, this.state.activeBallAction = null;
      const m = this.createEvent("goal", t.from, void 0, `${t.route || "open_play"}_goal`, {
        chanceQuality: t.chanceQuality || t.quality
      });
      m.replayWindow = this.replayWindowForGoal(), this.resetForKickoff(this.oppositeSide(t.teamSide)), this.state.phase = "kickoff", this.nextPhaseAfterSnapshot = "open_play";
      const p = this.createEvent("kickoff", this.state.ball.owner || void 0);
      return [m, p];
    }
    if (this.state.ball.velocity = { x: 0, y: 0 }, this.state.activeBallAction = null, n && r) {
      const m = this.random() < 0.18, p = this.distance(t.from, r) < 16;
      return m ? (this.state.ball.owner = null, this.state.ball.x = this.clamp(r.x + this.attackDirection(t.teamSide) * -2, 0, l.length), this.state.ball.y = this.clamp(r.y + (this.random() - 0.5) * 7, 0, l.width), this.state.ball.velocity = { x: 0, y: 0 }, this.state.secondBall = {
        x: this.state.ball.x,
        y: this.state.ball.y,
        expiresAt: this.state.time + 4,
        teamSide: t.teamSide,
        sourcePlayerId: t.from.id,
        source: "rebound"
      }, this.registerTouch(r), [this.createEvent("save", r, t.from, "goalkeeper_spill", {
        chanceQuality: t.chanceQuality || t.quality
      })]) : (this.state.ball.owner = r, this.state.ball.x = r.x, this.state.ball.y = r.y, this.state.secondBall = null, r.actionCooldown = 1, this.registerTouch(r), [this.createEvent("save", r, t.from, p ? "close_down_one_v_one" : "positioned_save", {
        chanceQuality: t.chanceQuality || t.quality
      })]);
    }
    if (!n && this.random() < 0.16) {
      const m = this.createEvent("miss", t.from, void 0, `${t.route || "open_play"}_deflected_behind`, {
        chanceQuality: t.chanceQuality || t.quality
      }), p = this.prepareRestart("corner", t.teamSide, {
        x: this.goalCenterAgainst(t.teamSide).x,
        y: this.state.ball.y < l.width / 2 ? 0 : l.width
      }, "goal_line");
      return [m, p];
    }
    const g = this.createEvent("miss", t.from, void 0, `${t.route || "open_play"}_miss`, {
      chanceQuality: t.chanceQuality || t.quality
    }), y = this.prepareGoalLineRestart(t.teamSide);
    return [g, y];
  }
  detectShotBlock(t) {
    const e = this.playersAgainst(t.teamSide).filter((i) => i.role !== c.GK && this.distance(i, this.state.ball) < 1.6).sort((i, a) => this.distance(i, this.state.ball) - this.distance(a, this.state.ball))[0];
    if (!e)
      return null;
    const s = this.clamp(0.18 + e.attributes.bravery / 20 * 0.16 + e.attributes.positioning / 20 * 0.16 - t.quality * 0.18, 0.12, 0.55);
    return this.random() >= s ? null : (this.state.ball.owner = null, this.state.ball.velocity = this.randomPoint(5, 12), this.state.activeBallAction = null, this.registerTouch(e), this.createEvent("blocked_shot", e, t.from, t.route || "shot_block", {
      chanceQuality: t.chanceQuality || t.quality
    }));
  }
  snapshot(t) {
    var e, s, i;
    return {
      time: this.state.time,
      period: this.state.period,
      phase: this.state.phase,
      addedTime: { ...this.state.addedTime },
      score: { ...this.state.score },
      ball: {
        x: this.round(this.state.ball.x),
        y: this.round(this.state.ball.y),
        velocity: {
          x: this.round(this.state.ball.velocity.x),
          y: this.round(this.state.ball.velocity.y)
        },
        ownerId: ((e = this.state.ball.owner) == null ? void 0 : e.id) || null
      },
      activePassTarget: ((s = this.state.activeBallAction) == null ? void 0 : s.type) === "pass" ? {
        x: this.round(this.state.activeBallAction.target.x),
        y: this.round(this.state.activeBallAction.target.y)
      } : null,
      activeShot: ((i = this.state.activeBallAction) == null ? void 0 : i.type) === "shot" ? {
        route: this.state.activeBallAction.route || "open_play",
        chanceQuality: this.round(this.state.activeBallAction.chanceQuality || this.state.activeBallAction.quality),
        target: {
          x: this.round(this.state.activeBallAction.target.x),
          y: this.round(this.state.activeBallAction.target.y)
        }
      } : null,
      secondBall: this.state.secondBall ? {
        x: this.round(this.state.secondBall.x),
        y: this.round(this.state.secondBall.y),
        expiresAt: this.roundTime(this.state.secondBall.expiresAt),
        source: this.state.secondBall.source
      } : null,
      possession: this.possessionSnapshot(),
      fieldZones: [...this.state.possession.currentFieldZones],
      activeAttackPattern: this.state.possession.activeAttackPattern,
      players: this.state.players.map((a) => ({
        id: a.id,
        teamSide: a.side,
        role: a.role,
        roleName: c[a.role],
        playerName: a.player.info.name,
        playerNumber: a.player.info.number,
        x: this.round(a.x),
        y: this.round(a.y),
        stamina: this.round(a.stamina),
        foulsCommitted: a.foulsCommitted,
        foulsSuffered: a.foulsSuffered,
        yellowCards: a.yellowCards,
        redCard: a.redCard,
        injurySeverity: a.injurySeverity,
        currentIntent: {
          ...a.currentIntent,
          target: {
            x: this.round(a.currentIntent.target.x),
            y: this.round(a.currentIntent.target.y)
          }
        },
        target: {
          x: this.round(a.target.x),
          y: this.round(a.target.y)
        }
      })),
      events: t
    };
  }
  createEvent(t, e, s, i, a = {}) {
    var u;
    const n = (e == null ? void 0 : e.side) || this.state.possession.teamSide || void 0, r = n ? this.fieldZonesFor(n, this.state.ball) : [], h = ((u = this.state.activeBallAction) == null ? void 0 : u.type) === "shot" ? this.state.activeBallAction : null;
    return {
      type: t,
      time: this.state.time,
      team: e == null ? void 0 : e.team,
      teamSide: n,
      player: e == null ? void 0 : e.player,
      playerId: e == null ? void 0 : e.id,
      secondaryPlayer: s == null ? void 0 : s.player,
      secondaryPlayerId: s == null ? void 0 : s.id,
      position: {
        x: this.round(this.state.ball.x),
        y: this.round(this.state.ball.y)
      },
      score: { ...this.state.score },
      outcome: i,
      fieldZones: r,
      possession: this.possessionSnapshot(),
      activeAttackPattern: this.state.possession.activeAttackPattern,
      chanceQuality: a.chanceQuality ?? (h == null ? void 0 : h.chanceQuality)
    };
  }
  replayWindowForGoal() {
    return {
      startTime: this.roundTime(Math.max(0, this.state.time - 12)),
      endTime: this.roundTime(Math.min(this.matchLengthSeconds, this.state.time + 4))
    };
  }
  formationTargetsForRoles(t, e, s, i) {
    const a = this.formationSlots(e, s, i), n = Math.max(...a.filter((h) => !h.goalkeeper).map((h) => h.lineIndex)) + 1, r = /* @__PURE__ */ new Set();
    return t.map((h) => {
      const u = this.roleFormationPreference(h, n), g = a.map((p, b) => ({ slot: p, index: b })).filter(({ index: p }) => !r.has(p)), m = (g.length ? g : a.map((p, b) => ({ slot: p, index: b }))).sort((p, b) => {
        const v = this.formationSlotScore(p.slot, u), S = this.formationSlotScore(b.slot, u);
        return v - S;
      })[0];
      return r.add(m.index), { ...m.slot.point };
    });
  }
  formationSlotScore(t, e) {
    const s = t.goalkeeper === e.goalkeeper ? 0 : 20, i = Math.abs(t.lineIndex - e.lineIndex) * 4, a = Math.abs(t.lane - e.lane);
    return s + i + a;
  }
  roleFormationPreference(t, e) {
    return t === c.GK ? {
      lineIndex: -1,
      lane: 0.5,
      goalkeeper: !0
    } : {
      lineIndex: this.roleLineIndex(t, e),
      lane: this.roleLane(t),
      goalkeeper: !1
    };
  }
  roleLineIndex(t, e) {
    return _.includes(t) ? 0 : P.includes(t) ? e - 1 : T.includes(t) ? [c.LDM, c.DM, c.RDM].includes(t) ? Math.min(1, e - 1) : Math.min(Math.max(1, Math.round((e - 1) / 2)), e - 1) : Math.max(0, e - 1);
  }
  roleLane(t) {
    switch (t) {
      case c.LB:
      case c.LWB:
      case c.LM:
      case c.LW:
      case c.LF:
        return 0;
      case c.LCB:
      case c.LDM:
      case c.LCM:
      case c.LCOM:
        return 0.33;
      case c.RCB:
      case c.RDM:
      case c.RCM:
      case c.RCOM:
        return 0.67;
      case c.RB:
      case c.RWB:
      case c.RM:
      case c.RW:
      case c.RF:
        return 1;
      default:
        return 0.5;
    }
  }
  formationSlots(t, e, s) {
    const i = this.parseFormation(e.formation), a = [
      {
        point: this.mirrorForSide(t, { x: 7, y: l.width / 2 }, s),
        lineIndex: -1,
        lane: 0.5,
        goalkeeper: !0
      }
    ], n = this.mentalityShift(e.mentality), r = (e.defensiveLine - 50) * 0.16, h = (e.compactness - 50) * 0.16, u = 22 + n + r, g = 82 + n + r;
    return i.forEach((y, m) => {
      const p = i.length === 1 ? (u + g) / 2 : u + (g - u) * (m / (i.length - 1)), b = this.clamp(26 + e.width / 100 * 34 - h, 24, 62), v = l.width / 2 - b / 2, S = y === 1 ? 0 : b / (y - 1);
      for (let w = 0; w < y; w += 1) {
        const M = y === 1 ? 0.5 : w / (y - 1);
        a.push({
          point: this.mirrorForSide(t, {
            x: p,
            y: y === 1 ? l.width / 2 : v + S * w
          }, s),
          lineIndex: m,
          lane: M,
          goalkeeper: !1
        });
      }
    }), a;
  }
  parseFormation(t) {
    const e = t.split("-").map((s) => parseInt(s, 10)).filter((s) => Number.isFinite(s) && s > 0);
    return e.reduce((s, i) => s + i, 0) !== 10 ? [4, 4, 2] : e;
  }
  selectPassTarget(t) {
    var y;
    const e = this.attackDirection(t.side), s = this.playersAgainst(t.side), i = this.pressureAround(t), a = this.tactics(t.side), n = a.tempo / 100, r = this.tacticalDirectness(a), h = this.maxOpenPlayPassDistance(a), u = (t.x - l.length / 2) * e;
    return ((y = this.playersForSide(t.side).filter((m) => m !== t).map((m) => {
      const p = this.distance(t, m), b = (m.x - t.x) * e, v = Math.min(...s.map((W) => this.distance(W, m))), S = Math.abs(m.y - t.y), w = b > -10 && b < 12 && p < 24, M = b < -2 && p < 26, F = this.passRoute(t, m), D = Math.max(0, b - 18) * (i > 0.25 || u < 18 ? 0.65 : 0.18), E = i > 0.45 ? -0.12 : 0.08 + n * 0.12 + r * 0.1, G = a.style === "possession" ? 0.3 : 0.2 - r * 0.04, $ = b * E + v * 0.48 - p * G - S * 0.04 - D + this.passRouteSelectionBonus(F, t, m) + this.styleRouteSelectionBonus(a, F, b, p) + (w ? 7 : 0) + (M && i > 0.22 ? 6 : 0) + this.random() * 4;
      return { player: m, distance: p, score: $, route: F };
    }).filter((m) => m.distance > 5 && m.distance < h).sort((m, p) => p.score - m.score)[0]) == null ? void 0 : y.player) || null;
  }
  passRouteSelectionBonus(t, e, s) {
    const i = this.fieldZonesFor(e.side, e), a = i.includes("byline"), n = i.includes("final_third"), r = this.pressureAround(e);
    return t === "cutback" ? a ? 18 : 10 : t === "cross" ? n ? 18 : 8 : t === "through_ball" ? 12 + this.runnerSeparation(s) * 2 : t === "switch_of_play" ? r < 0.3 ? 9 : 4 : t === "overlap_pass" || t === "underlap_pass" ? 11 : t === "line_breaking_pass" ? 7 : t === "wall_pass" ? 4 : 0;
  }
  tacticalDirectness(t) {
    switch (t.style) {
      case "direct":
        return 0.9;
      case "counter":
        return 0.7;
      case "high_press":
        return 0.35;
      case "possession":
        return -0.35;
      case "low_block":
        return -0.2;
      default:
        return 0;
    }
  }
  maxOpenPlayPassDistance(t) {
    switch (t.style) {
      case "direct":
        return 44;
      case "counter":
        return 40;
      case "high_press":
        return 38;
      case "possession":
        return 30;
      default:
        return 34;
    }
  }
  styleRouteSelectionBonus(t, e, s, i) {
    let a = 0;
    return t.style === "possession" && (["lateral_support", "backward_reset", "wall_pass", "line_breaking_pass"].includes(e) && (a += 8), i < 18 && (a += 4), s > 18 && (a -= 8)), t.style === "direct" && (["progressive_pass", "through_ball", "cross"].includes(e) && (a += 10), i > 24 && (a += 6)), t.style === "counter" && s > 10 && (a += ["through_ball", "progressive_pass", "line_breaking_pass"].includes(e) ? 11 : 5), t.style === "low_block" && (a += s > 12 ? 4 : 0, a += ["lateral_support", "backward_reset"].includes(e) ? 5 : 0), t.style === "high_press" && s > 4 && (a += ["through_ball", "progressive_pass", "cross"].includes(e) ? 7 : 3), t.focus === "wide" && (a += ["cross", "switch_of_play", "overlap_pass"].includes(e) ? 8 : 0, a -= ["line_breaking_pass", "wall_pass"].includes(e) ? 2 : 0), t.focus === "central" && (a += ["line_breaking_pass", "wall_pass", "through_ball", "cutback", "underlap_pass"].includes(e) ? 8 : 0, a -= e === "cross" ? 5 : 0), a;
  }
  passTargetPoint(t, e, s, i) {
    const n = this.distance(t, e) / i, r = e.currentIntent.target || e.target, h = this.playerSpeed(e) * n * (s === "through_ball" ? 0.85 : 0.62), u = ["through_ball", "cross", "cutback", "overlap_pass", "underlap_pass"].includes(s) ? this.pointTowards(e, r, h) : this.pointTowards(e, r, Math.min(h, 3));
    return this.clampPassTarget(u);
  }
  passTargetKind(t, e, s) {
    return ["direct", "counter"].includes(s.style) && e > 26 ? "contest" : t === "through_ball" || t === "cutback" || t === "overlap_pass" || t === "underlap_pass" ? "space" : t === "cross" || e > 32 ? "contest" : "feet";
  }
  passSpeed(t, e) {
    return t === "cross" || t === "through_ball" || t === "cutback" ? 16 : t === "switch_of_play" ? 18 : e > 24 ? 14 : 10;
  }
  passMissDistance(t, e) {
    const s = ["through_ball", "cross", "cutback", "switch_of_play"].includes(e) ? 3 : 0;
    return this.clamp(3.5 + t * 0.12 + s, 4.5, 11);
  }
  receiveDifficulty(t, e, s, i, a, n) {
    const r = this.pressureAround(e), h = n === "contest" ? 0.26 : n === "space" ? 0.14 : 0.04, u = Math.abs(e.y - t.y) / l.width * 0.16, g = this.tactics(t.side), y = ["direct", "counter"].includes(g.style) && (s > 28 || n === "contest") ? 0.08 : 0, m = g.style === "possession" && s < 20 && n === "feet" ? 0.04 : 0;
    return this.clamp(s / 70 + i * 0.22 + r * 0.24 + h + u + y - t.attributes.passing / 20 * 0.08 - m, 0.08, 0.88);
  }
  passRoute(t, e) {
    const s = this.attackDirection(t.side), i = (e.x - t.x) * s, a = Math.abs(e.y - t.y), n = (t.x - l.length / 2) * s, r = this.fieldZonesFor(t.side, t), h = this.fieldZonesFor(t.side, e), u = this.hasWideZone(r), g = h.includes("central_lane") || h.includes("half_space_left") || h.includes("half_space_right"), y = this.pressureAround(t);
    return a > 30 && Math.abs(i) < 12 && y < 0.45 ? "switch_of_play" : r.includes("byline") && g && i < 8 ? "cutback" : i < -4 ? "backward_reset" : e.currentIntent.type === "overlap" && u && i >= -2 ? "overlap_pass" : e.currentIntent.type === "underlap" && u && i >= -2 ? "underlap_pass" : u && h.includes("box") && n > 24 || u && g && i > 4 && n > 20 ? "cross" : i > 16 && this.canPlayThroughBall(t, e) ? "through_ball" : i > 12 && g && n > -8 ? "line_breaking_pass" : i > 0 && i <= 12 && this.distance(t, e) < 16 && y < 0.35 ? "wall_pass" : Math.abs(i) <= 6 ? "lateral_support" : "progressive_pass";
  }
  canPlayThroughBall(t, e) {
    if (e.currentIntent.type !== "make_forward_run" || !P.includes(e.role))
      return !1;
    const s = this.attackDirection(t.side), i = this.goalCenterAgainst(t.side);
    return (t.x - l.length / 2) * s > 8 && this.pressureAround(t) < 0.42 && this.runnerSeparation(e) > 1.2 && this.distance(e.currentIntent.target, i) > 8 && this.passingLanePressure(t, e) < 0.48;
  }
  runnerSeparation(t) {
    const e = this.nearestOpponent(t.side, t);
    if (!e)
      return 4;
    const s = this.attackDirection(t.side);
    return (t.x - e.x) * s + this.distance(t, e) * 0.35;
  }
  passingLanePressure(t, e) {
    const s = this.playersAgainst(t.side).map((i) => this.distanceToSegment(i, t, e)).sort((i, a) => i - a)[0] ?? 20;
    return this.clamp(1 - s / 7, 0, 1);
  }
  shotRoute(t, e) {
    const s = this.state.possession, i = s.lastSuccessfulPassRoute || s.lastPassRoute;
    return s.lastRecoveryType === "rebound" ? "rebound" : s.lastRecoveryType === "second_ball" ? "second_ball" : s.setPieceOrigin && (s.passCount <= 2 || _.includes(t.role)) ? "set_piece" : i === "through_ball" ? "through_ball" : i === "cutback" ? "cutback" : i === "cross" ? "cross" : t.currentIntent.type === "attack_box" || T.includes(t.role) && e < 20 ? "late_midfield_run" : e > 24 ? "long_shot" : ["line_breaking_pass", "wall_pass", "overlap_pass", "underlap_pass", "short_corner", "indirect_free_kick"].includes(i || "") ? "central_combination" : this.isWideAttacker(t) && Math.abs(t.y - l.width / 2) > 12 ? "dribble_cut_inside" : "central_combination";
  }
  selectRestartTaker(t) {
    const e = this.playersForSide(t.teamSide);
    return t.phase === "goal_kick" ? this.goalkeeperFor(t.teamSide) || e[0] : t.phase === "corner" ? e.filter((s) => s.role !== c.GK).slice().sort((s, i) => {
      const a = s.attributes.corners + s.attributes.crossing - this.distance(s, t.position) * 0.15;
      return i.attributes.corners + i.attributes.crossing - this.distance(i, t.position) * 0.15 - a;
    })[0] || e[0] : t.phase === "free_kick" ? e.filter((s) => s.role !== c.GK).slice().sort((s, i) => {
      const a = s.attributes.freeKickTaking + s.attributes.technique - this.distance(s, t.position) * 0.1;
      return i.attributes.freeKickTaking + i.attributes.technique - this.distance(i, t.position) * 0.1 - a;
    })[0] || e[0] : t.phase === "penalty" ? e.filter((s) => s.role !== c.GK).slice().sort((s, i) => {
      const a = s.attributes.penaltyTaking + s.attributes.finishing + s.attributes.composure;
      return i.attributes.penaltyTaking + i.attributes.finishing + i.attributes.composure - a;
    })[0] || e[0] : e.filter((s) => s.role !== c.GK).slice().sort((s, i) => this.distance(s, t.position) - this.distance(i, t.position))[0] || e[0];
  }
  selectThrowInTarget(t, e) {
    return this.playersForSide(t).filter((s) => s !== e && s.role !== c.GK).slice().sort((s, i) => {
      const a = this.distance(s, e) + Math.abs(s.y - e.y) * 0.4, n = this.distance(i, e) + Math.abs(i.y - e.y) * 0.4;
      return a - n;
    })[0] || null;
  }
  selectBoxTarget(t, e) {
    const s = this.goalCenterAgainst(t);
    return this.playersForSide(t).filter((i) => i !== e && i.role !== c.GK).slice().sort((i, a) => {
      var g, y;
      const n = ((g = this.state.restart) == null ? void 0 : g.phase) === "corner" && _.includes(i.role) ? 8 : 0, r = ((y = this.state.restart) == null ? void 0 : y.phase) === "corner" && _.includes(a.role) ? 8 : 0, h = i.attributes.heading + i.attributes.jumpingReach + n - this.distance(i, s) * 0.2;
      return a.attributes.heading + a.attributes.jumpingReach + r - this.distance(a, s) * 0.2 - h;
    })[0] || null;
  }
  selectShortGoalKickTarget(t, e) {
    return this.playersForSide(t).filter((s) => s !== e && _.includes(s.role)).slice().sort((s, i) => this.distance(s, e) - this.distance(i, e))[0] || null;
  }
  selectLongGoalKickTarget(t, e) {
    const s = this.attackDirection(t);
    return this.playersForSide(t).filter((i) => i !== e && i.role !== c.GK).slice().sort((i, a) => (a.x - i.x) * s)[0] || null;
  }
  safeRestartTarget(t, e, s) {
    const i = this.attackDirection(t);
    return this.clampPoint({
      x: e.x + i * s,
      y: l.width / 2 + (e.y - l.width / 2) * 0.4
    });
  }
  cornerTargetPoint(t, e) {
    const s = this.goalCenterAgainst(t), i = this.attackDirection(t), a = s.x - i * (e === "short_corner" ? 16 : 8), n = e === "near_post" ? -7.32 / 2 : e === "far_post" ? l.goalWidth / 2 : 0;
    return {
      x: a,
      y: l.width / 2 + n
    };
  }
  supportTarget(t, e) {
    const s = this.attackDirection(t.side), i = t.y < e.y ? -5 : 5;
    return this.clampPoint({
      x: t.target.x + s * 5,
      y: t.target.y + i
    });
  }
  overlapTarget(t, e) {
    const s = this.attackDirection(t.side), i = t.y < l.width / 2 ? 5 : l.width - 5;
    return this.clampPoint({
      x: Math.max(t.target.x * s, e.x * s + 12) * s,
      y: i
    });
  }
  underlapTarget(t, e) {
    const s = this.attackDirection(t.side);
    return this.clampPoint({
      x: Math.max(t.x * s, e.x * s + 8) * s,
      y: e.y + (l.width / 2 - e.y) * 0.55
    });
  }
  boxEntryTarget(t, e) {
    const s = this.goalCenterAgainst(t), i = this.attackDirection(t);
    return this.clampPoint({
      x: s.x - i * 15,
      y: l.width / 2 + (e.y < l.width / 2 ? -8 : 8)
    });
  }
  forwardRunTarget(t) {
    const e = this.attackDirection(t.side);
    return this.clampPoint({
      x: t.x + e * 16,
      y: t.y + (l.width / 2 - t.y) * 0.25
    });
  }
  driftWideTarget(t) {
    const e = t.y < l.width / 2 ? 8 : l.width - 8;
    return this.clampPoint({
      x: t.target.x,
      y: e
    });
  }
  betweenLinesTarget(t) {
    const e = this.attackDirection(t.side);
    return this.clampPoint({
      x: t.target.x - e * 5,
      y: t.target.y
    });
  }
  trackRunnerTarget(t, e) {
    const s = this.attackDirection(e.side);
    return this.clampPoint({
      x: e.x + s * 4,
      y: e.y
    });
  }
  coverLaneTarget(t, e) {
    return this.clampPoint({
      x: (t.target.x + e.x) / 2,
      y: (t.target.y + e.y) / 2
    });
  }
  isWideDefender(t) {
    return [c.LB, c.RB, c.LWB, c.RWB].includes(t.role);
  }
  isWideAttacker(t) {
    return [c.LM, c.RM, c.LW, c.RW, c.LF, c.RF].includes(t.role);
  }
  isWideCarrier(t) {
    return this.hasWideZone(this.fieldZonesFor(t.side, t));
  }
  hasOverlappingSupport(t) {
    const e = this.attackDirection(t.side);
    return this.playersForSide(t.side).some((s) => this.isWideDefender(s) ? s.x * e > t.x * e - 2 && this.distance(s, t) < 18 : !1);
  }
  shootingIntentChance(t, e) {
    const s = t.attributes.finishing / 20, i = t.attributes.longShots / 20, a = t.attributes.composure / 20, n = this.pressureAround(t), r = this.goalCenterAgainst(t.side), h = this.clamp(Math.abs(t.y - r.y) / (l.width / 2), 0, 1), u = this.playersForSide(t.side).filter((b) => b !== t && this.distance(b, t) < 18).length, g = e < 12 ? 0.026 : e < 18 ? 0.013 : e < 24 ? 5e-3 : 1e-3, y = e > 24 ? i * 12e-4 : 0, m = this.tactics(t.side).mentality === "attacking" ? 2e-3 : this.tactics(t.side).mentality === "defensive" ? -3e-3 : 0, p = u >= 2 && e > 12 ? 9e-3 : 0;
    return this.clamp(g + s * 6e-3 + a * 4e-3 + y + m - n * 0.016 - h * 0.018 - p, 3e-3, e > 24 ? 4e-3 : 0.045);
  }
  stylePassFrequencyBonus(t) {
    switch (t) {
      case "possession":
        return 0.12;
      case "direct":
        return -0.02;
      case "counter":
        return -0.01;
      case "low_block":
        return -0.02;
      case "high_press":
        return 0.03;
      default:
        return 0;
    }
  }
  passQuality(t, e, s) {
    const i = t.attributes.passing / 20, a = t.attributes.technique / 20, n = t.attributes.decisions / 20, r = e / 155, h = this.tactics(t.side), u = h.style === "possession" && e < 22 ? 0.05 : ["direct", "counter"].includes(h.style) && e > 24 ? -0.08 : 0;
    return this.clamp(0.66 + i * 0.16 + a * 0.11 + n * 0.1 + u - s * 0.12 - r - t.injuryPerformancePenalty * 0.16, 0.46, 0.96);
  }
  shotQuality(t, e, s) {
    const i = t.attributes.finishing / 20, a = t.attributes.longShots / 20, n = t.attributes.technique / 20, r = t.attributes.composure / 20, h = this.pressureAround(t), u = this.goalCenterAgainst(t.side), g = this.goalkeeperFor(this.oppositeSide(t.side)), y = this.clamp(Math.abs(t.y - u.y) / (l.width / 2), 0, 1) * 0.18, m = e / 62, p = e > 24 ? a * 0.12 : i * 0.08, b = g ? this.clamp(this.distance(g, u) / 18, 0, 1) * 0.04 : 0.02, v = this.shotRouteQualityBoost(s), S = this.defensiveShotQualityModifier(t.side, t, s);
    return this.clamp(0.32 + i * 0.17 + p + n * 0.14 + r * 0.13 + v + S + b - h * 0.18 - m - y - t.injuryPerformancePenalty * 0.2, 0.08, 0.92);
  }
  shotRouteQualityBoost(t) {
    switch (t) {
      case "cutback":
        return 0.16;
      case "rebound":
        return 0.13;
      case "through_ball":
        return 0.1;
      case "cross":
        return 0.06;
      case "late_midfield_run":
        return 0.06;
      case "second_ball":
        return 0.04;
      case "set_piece":
        return 0.03;
      case "long_shot":
        return -0.08;
      case "dribble_cut_inside":
        return -0.02;
      default:
        return 0;
    }
  }
  defensiveShotQualityModifier(t, e, s) {
    const i = this.tactics(this.oppositeSide(t)), a = this.fieldZonesFor(t, e);
    let n = 0;
    return a.includes("final_third") && (n -= Math.max(0, i.compactness - 50) / 100 * 0.06), a.includes("box") && (n -= Math.max(0, i.compactness - 50) / 100 * 0.08, n -= Math.max(0, 50 - i.defensiveLine) / 100 * 0.05), i.style === "low_block" && a.includes("final_third") && (n -= 0.05), i.defensiveLine > 65 && s === "through_ball" && (n += 0.08), i.compactness > 65 && ["cutback", "central_combination", "late_midfield_run"].includes(s) && (n -= 0.04), i.focus === "wide" && s === "cross" && (n -= 0.04), n;
  }
  pressureAround(t) {
    const e = this.nearestOpponent(t.side, t);
    return e ? this.clamp(1 - this.distance(t, e) / 9 + this.defensiveSystemPressure(t), 0, 1) : 0;
  }
  defensiveSystemPressure(t) {
    const e = this.tactics(this.oppositeSide(t.side)), s = this.fieldZonesFor(t.side, t);
    let i = 0;
    return s.includes("final_third") && (i += Math.max(0, e.compactness - 50) / 100 * 0.1), s.includes("box") && (i += Math.max(0, 50 - e.defensiveLine) / 100 * 0.08), e.style === "low_block" && s.includes("final_third") && (i += 0.06), e.focus === "wide" && this.hasWideZone(s) && (i += 0.04), e.focus === "central" && s.includes("central_lane") && (i += 0.04), i;
  }
  interceptionChance(t, e) {
    const s = t.attributes.anticipation / 20, i = t.attributes.positioning / 20, a = 1 - e.quality;
    return this.clamp(0.08 + s * 0.18 + i * 0.14 + a * 0.35, 0.08, 0.72);
  }
  playerSpeed(t) {
    const e = t.attributes.pace / 20, s = t.attributes.acceleration / 20, i = this.clamp(t.stamina / 100, 0.55, 1), n = ["press", "recover", "attack_second_ball", "receive_pass", "dribble", "overlap", "attack_box", "make_forward_run", "track_runner"].includes(t.currentIntent.type) ? 1.12 : 1, r = 1 - t.injuryPerformancePenalty;
    return (3.2 + e * 2.4 + s * 1.2) * i * n * r;
  }
  updateStamina(t) {
    const e = ["press", "recover", "attack_second_ball", "receive_pass", "dribble", "overlap", "attack_box", "make_forward_run", "track_runner"], s = this.tactics(t.side), i = e.includes(t.currentIntent.type) ? 0.01 : 4e-3, a = t.currentIntent.type === "press" ? s.press / 100 * 8e-3 : 0, n = e.includes(t.currentIntent.type) ? s.tempo / 100 * 3e-3 : 0, r = s.style === "high_press" && t.currentIntent.type === "press" ? 4e-3 : 0, h = i + a + n + r;
    t.stamina = this.clamp(t.stamina - (5e-3 + h) * this.tickSeconds, 35, 100);
  }
  velocityTowards(t, e, s) {
    const i = e.x - t.x, a = e.y - t.y, n = Math.hypot(i, a) || 1;
    return {
      x: i / n * s,
      y: a / n * s
    };
  }
  moveTowards(t, e, s) {
    const i = e.x - t.x, a = e.y - t.y, n = Math.hypot(i, a);
    if (n <= s || n === 0) {
      t.x = e.x, t.y = e.y;
      return;
    }
    t.x += i / n * s, t.y += a / n * s;
  }
  pointTowards(t, e, s) {
    const i = e.x - t.x, a = e.y - t.y, n = Math.hypot(i, a);
    return n <= s || n === 0 ? { x: e.x, y: e.y } : {
      x: t.x + i / n * s,
      y: t.y + a / n * s
    };
  }
  playerById(t) {
    return this.state.players.find((e) => e.id === t);
  }
  playersForSide(t) {
    return this.state.players.filter((e) => e.side === t);
  }
  playersAgainst(t) {
    return this.state.players.filter((e) => e.side !== t);
  }
  closestPlayerTo(t, e) {
    return this.playersForSide(t).slice().sort((s, i) => this.distance(s, e) - this.distance(i, e))[0] || null;
  }
  closestPlayer(t) {
    return this.state.players.slice().sort((e, s) => this.distance(e, t) - this.distance(s, t))[0] || null;
  }
  nearestOpponent(t, e) {
    return this.playersAgainst(t).slice().sort((s, i) => this.distance(s, e) - this.distance(i, e))[0] || null;
  }
  goalkeeperFor(t) {
    return this.playersForSide(t).find((e) => e.role === c.GK) || this.playersForSide(t)[0] || null;
  }
  tactics(t) {
    return this.state.tactics[t];
  }
  activePeriod() {
    var t;
    return ((t = this.state) == null ? void 0 : t.period) === 1 ? 1 : 2;
  }
  attackDirection(t) {
    return this.attackDirectionForPeriod(t, this.activePeriod());
  }
  attackDirectionForPeriod(t, e) {
    const s = t === "home" ? 1 : -1;
    return e === 1 ? s : s === 1 ? -1 : 1;
  }
  oppositeSide(t) {
    return t === "home" ? "away" : "home";
  }
  goalCenterAgainst(t) {
    return {
      x: this.attackDirection(t) > 0 ? l.length : 0,
      y: l.width / 2
    };
  }
  attackingSideForGoalLine(t) {
    return ["home", "away"].find((e) => this.goalCenterAgainst(e).x === t) || "home";
  }
  goalKickPosition(t) {
    return {
      x: this.attackDirection(t) > 0 ? 6 : l.length - 6,
      y: l.width / 2
    };
  }
  fieldZonesFor(t, e) {
    const s = this.attackDirection(t) > 0 ? e.x : l.length - e.x, i = this.attackDirection(t) > 0 ? e.y : l.width - e.y, a = [];
    return s < l.length / 3 ? a.push("defensive_third") : s < l.length * 2 / 3 ? a.push("middle_third") : a.push("attacking_third", "final_third"), i < l.width * 0.2 ? a.push("wide_left") : i < l.width * 0.4 ? a.push("half_space_left") : i <= l.width * 0.6 ? a.push("central_lane") : i <= l.width * 0.8 ? a.push("half_space_right") : a.push("wide_right"), s >= l.length - 18 && Math.abs(i - l.width / 2) <= 22 && a.push("box"), s >= l.length - 7 && a.push("byline"), a;
  }
  progressionZone(t) {
    return t.includes("final_third") ? "final_third" : t.includes("attacking_third") ? "attacking_third" : t.includes("middle_third") ? "middle_third" : t.includes("defensive_third") ? "defensive_third" : null;
  }
  hasWideZone(t) {
    return t.includes("wide_left") || t.includes("wide_right");
  }
  routeLedAttackPattern(t) {
    return [
      "switch_of_play",
      "overlap",
      "underlap",
      "through_ball",
      "cross",
      "cutback",
      "late_run",
      "rebound",
      "second_ball",
      "set_piece",
      "central_combination",
      "defensive_transition"
    ].includes(t);
  }
  attackPatternFromZones(t) {
    return t.includes("box") || t.includes("final_third") ? this.hasWideZone(t) || t.includes("byline") ? "wide_overload" : "final_third_probe" : t.includes("middle_third") ? "midfield_progression" : t.includes("defensive_third") ? "patient_buildup" : "none";
  }
  attackPatternFromPassRoute(t) {
    return t === "switch_of_play" ? "switch_of_play" : t === "overlap_pass" ? "overlap" : t === "underlap_pass" ? "underlap" : t === "through_ball" ? "through_ball" : t === "cross" ? "cross" : t === "cutback" ? "cutback" : ["line_breaking_pass", "wall_pass", "progressive_pass"].includes(t) ? "central_combination" : this.attackPatternFromZones(this.state.possession.currentFieldZones);
  }
  attackPatternFromShotRoute(t) {
    return ["through_ball", "cross", "cutback", "rebound", "second_ball"].includes(t) ? t : t === "late_midfield_run" ? "late_run" : t === "set_piece" ? "set_piece" : "central_combination";
  }
  registerTouch(t) {
    t && (this.state.possession.teamSide !== t.side && this.startPossession(t.side, this.state.phase), this.state.ball.lastTouchSide = t.side, this.state.ball.lastTouchPlayerId = t.id, this.recordPossessionPosition(t.side, this.state.ball));
  }
  mirrorForSide(t, e, s) {
    return this.attackDirectionForPeriod(t, s) > 0 ? e : {
      x: l.length - e.x,
      y: l.width - e.y
    };
  }
  mentalityShift(t) {
    return t === "attacking" ? 6 : t === "defensive" ? -6 : 0;
  }
  randomPoint(t, e) {
    const s = t + this.random() * (e - t), i = this.random() * Math.PI * 2;
    return {
      x: Math.cos(i) * s,
      y: Math.sin(i) * s
    };
  }
  ballIsSlow() {
    return Math.hypot(this.state.ball.velocity.x, this.state.ball.velocity.y) < 2.5;
  }
  ballOutsidePitch() {
    return this.state.ball.x < 0 || this.state.ball.x > l.length || this.state.ball.y < 0 || this.state.ball.y > l.width;
  }
  distance(t, e) {
    return Math.hypot(t.x - e.x, t.y - e.y);
  }
  distanceToSegment(t, e, s) {
    const i = (s.x - e.x) ** 2 + (s.y - e.y) ** 2;
    if (i === 0)
      return this.distance(t, e);
    const a = this.clamp(((t.x - e.x) * (s.x - e.x) + (t.y - e.y) * (s.y - e.y)) / i, 0, 1);
    return this.distance(t, {
      x: e.x + (s.x - e.x) * a,
      y: e.y + (s.y - e.y) * a
    });
  }
  clampPoint(t) {
    return {
      x: this.clamp(t.x, 0, l.length),
      y: this.clamp(t.y, 0, l.width)
    };
  }
  clampPassTarget(t) {
    return {
      x: this.clamp(t.x, 2, l.length - 2),
      y: this.clamp(t.y, 2, l.width - 2)
    };
  }
  clamp(t, e, s) {
    return Math.max(e, Math.min(s, t));
  }
  round(t) {
    return Math.round(t * 100) / 100;
  }
  roundTime(t) {
    return Math.round(t * 1e3) / 1e3;
  }
}
class lt {
  constructor(t) {
    d(this, "engine");
    this.engine = t;
  }
  getReport() {
    const t = this.finalSnapshot(), e = this.teamReport({
      side: "home",
      name: this.engine.homeTeam.name,
      style: this.engine.state.tactics.home.style,
      goals: t.score.home
    }), s = this.teamReport({
      side: "away",
      name: this.engine.awayTeam.name,
      style: this.engine.state.tactics.away.style,
      goals: t.score.away
    }), i = [
      this.tacticalPatternSection(e, s),
      this.chanceCreationSection(),
      this.pressingSection(e, s),
      this.playerImpactSection(),
      this.managerImpactSection()
    ], a = this.turningPoints();
    return {
      headline: `${e.name} ${e.goals}-${s.goals} ${s.name}`,
      summary: this.summary(e, s, i),
      teams: {
        home: e,
        away: s
      },
      sections: i,
      turningPoints: a
    };
  }
  teamReport(t) {
    const e = this.eventsFor(t.side, "pass").length, s = this.eventsFor(t.side, "receive").length, i = this.finalSnapshot().players.filter((a) => a.teamSide === t.side);
    return {
      name: t.name,
      style: t.style,
      goals: t.goals,
      shots: this.eventsFor(t.side, "shot").length,
      passCompletion: e ? s / e : 0,
      finalThirdRecoveries: this.finalThirdRecoveries(t.side),
      averageStamina: this.average(i.map((a) => a.stamina))
    };
  }
  tacticalPatternSection(t, e) {
    const s = this.topEntry(this.countBy(this.engine.events.filter((a) => a.activeAttackPattern && a.activeAttackPattern !== "none"), (a) => a.activeAttackPattern)), i = t.finalThirdRecoveries >= e.finalThirdRecoveries ? t : e;
    return s ? {
      title: "Tactical pattern",
      teamSide: i === t ? "home" : "away",
      text: `${t.name} used ${this.label(t.style)} against ${e.name}'s ${this.label(e.style)}. The match most often settled into ${this.label(s.key)} sequences, with ${i.name} creating more high recoveries.`
    } : {
      title: "Tactical pattern",
      text: `${t.name} used ${this.label(t.style)} against ${e.name}'s ${this.label(e.style)}, but neither side established a dominant pattern.`
    };
  }
  chanceCreationSection() {
    const t = this.engine.events.filter((i) => i.type === "shot"), e = this.topEntry(this.countBy(t, (i) => i.outcome || "open_play")), s = this.average(t.map((i) => i.chanceQuality || 0).filter((i) => i > 0));
    return e ? {
      title: "Chance creation",
      text: `${this.label(e.key)} was the main shot route (${e.value} shots), with average chance quality ${s.toFixed(2)}.`
    } : {
      title: "Chance creation",
      text: "Neither side created a clear shot pattern."
    };
  }
  pressingSection(t, e) {
    const s = t.finalThirdRecoveries >= e.finalThirdRecoveries ? t : e, i = s === t ? e : t, a = s === t ? "home" : "away", n = i.averageStamina - s.averageStamina, r = n > 4 ? `, but their average stamina finished ${n.toFixed(1)} points lower` : "";
    return {
      title: "Pressing",
      teamSide: a,
      text: `${s.name} made ${s.finalThirdRecoveries} final-third recoveries versus ${i.finalThirdRecoveries}${r}.`
    };
  }
  playerImpactSection() {
    const t = this.topPlayer("shot"), e = this.topPlayer("pass"), s = this.topPlayer("tackle", "interception"), i = [
      t ? `${t.name} led the shot volume (${t.count})` : "",
      e ? `${e.name} drove circulation (${e.count} passes)` : "",
      s ? `${s.name} led defensive actions (${s.count})` : ""
    ].filter(Boolean);
    return {
      title: "Player impact",
      teamSide: t == null ? void 0 : t.side,
      text: i.length ? `${i.join("; ")}.` : "No single player dominated the event profile."
    };
  }
  managerImpactSection() {
    const t = this.engine.events.filter((r) => r.type === "substitution"), e = this.engine.events.filter((r) => r.type === "tactical_change"), s = this.engine.events.filter((r) => r.type === "role_change"), i = this.engine.events.filter((r) => r.type === "red_card"), a = this.engine.events.filter((r) => r.type === "injury");
    return !t.length && !e.length && !s.length && !i.length && !a.length ? {
      title: "Manager impact",
      text: "The match stayed mostly in the starting tactical plans, with no substitution, injury, or red-card reshaping."
    } : {
      title: "Manager impact",
      text: `${[
        e.length ? `${e.length} tactical change${e.length === 1 ? "" : "s"}` : "",
        s.length ? `${s.length} role change${s.length === 1 ? "" : "s"}` : "",
        t.length ? `${t.length} substitution${t.length === 1 ? "" : "s"}` : "",
        a.length ? `${a.length} injury event${a.length === 1 ? "" : "s"}` : "",
        i.length ? `${i.length} red card${i.length === 1 ? "" : "s"}` : ""
      ].filter(Boolean).join(", ")} changed the personnel and match rhythm after the starting plans had taken shape.`
    };
  }
  turningPoints() {
    return this.engine.events.filter((e) => e.type === "penalty" && e.outcome === "goal" ? !1 : ["goal", "penalty", "red_card", "substitution", "tactical_change", "role_change", "injury"].includes(e.type)).slice(0, 6).map((e) => ({
      title: this.label(e.type),
      text: this.turningPointText(e),
      teamSide: e.teamSide,
      time: e.time
    }));
  }
  turningPointText(t) {
    var i;
    const e = ((i = t.player) == null ? void 0 : i.info.name) || t.teamSide || "Match", s = t.outcome ? ` from ${this.label(t.outcome.replace(/_goal$/, ""))}` : "";
    return t.type === "goal" ? `${e} scored${s} after possession #${t.possession.id}.` : t.type === "substitution" ? `${e} came on because of ${this.label(t.outcome || "manager_choice")}.` : t.type === "tactical_change" ? `${t.teamSide || "A team"} changed the tactical plan for ${this.label(t.outcome || "manager_tactical_change")}.` : t.type === "role_change" ? `${e} changed role for ${this.label(t.outcome || "manager_role_change")}.` : t.type === "penalty" ? `${e} was central to a penalty ${this.label(t.outcome || "event")}.` : `${e} produced a ${this.label(t.type)} moment.`;
  }
  summary(t, e, s) {
    const i = t.shots >= e.shots ? t : e, a = t.passCompletion >= e.passCompletion ? t : e;
    return `${s[0].text} ${i.name} led shots ${i.shots}-${i === t ? e.shots : t.shots}, while ${a.name} had the cleaner passing rhythm.`;
  }
  eventsFor(t, e) {
    return this.engine.events.filter((s) => s.teamSide === t && s.type === e);
  }
  finalThirdRecoveries(t) {
    return this.engine.events.filter((e) => e.teamSide === t && ["interception", "tackle", "recovery"].includes(e.type) && e.fieldZones.includes("final_third")).length;
  }
  topPlayer(...t) {
    const e = /* @__PURE__ */ new Map();
    return this.engine.events.filter((s) => s.teamSide && s.player && t.includes(s.type)).forEach((s) => {
      var n;
      const i = `${s.teamSide}:${s.playerId}`, a = e.get(i) || {
        name: ((n = s.player) == null ? void 0 : n.info.name) || "Unknown",
        count: 0,
        side: s.teamSide
      };
      a.count += 1, e.set(i, a);
    }), [...e.values()].sort((s, i) => i.count - s.count)[0] || null;
  }
  countBy(t, e) {
    return t.reduce((s, i) => {
      const a = e(i);
      return s[a] = (s[a] || 0) + 1, s;
    }, {});
  }
  topEntry(t) {
    const e = Object.entries(t).sort((s, i) => i[1] - s[1])[0];
    return e ? { key: e[0], value: e[1] } : null;
  }
  finalSnapshot() {
    return this.engine.snapshots[this.engine.snapshots.length - 1] || this.engine.start();
  }
  average(t) {
    return t.length ? t.reduce((e, s) => e + s, 0) / t.length : 0;
  }
  label(t) {
    return t.replace(/_/g, " ");
  }
}
function A(o) {
  const t = o.map(([e, s]) => Array(s).fill(e)).reduce((e, s) => e.concat(s), []);
  return t[Math.floor(Math.random() * t.length)];
}
const z = {
  1: {
    defenders: 6,
    midfielders: 3,
    attackers: 1
  },
  2: {
    defenders: 5,
    midfielders: 3,
    attackers: 2
  },
  3: {
    defenders: 2,
    midfielders: 5,
    attackers: 3
  },
  4: {
    defenders: 2,
    midfielders: 4,
    attackers: 4
  },
  5: {
    defenders: 1,
    midfielders: 3,
    attackers: 6
  }
}, tt = {
  1: {
    left: 6,
    center: 3,
    right: 1
  },
  2: {
    left: 2,
    center: 6,
    right: 2
  },
  3: {
    left: 1,
    center: 3,
    right: 6
  }
}, et = {
  defenders: _,
  midfielders: T,
  attackers: P
}, st = {
  left: N,
  center: U,
  right: Y
};
class it {
  constructor(t, e, s) {
    d(this, "players");
    d(this, "home");
    d(this, "name");
    d(this, "field", null);
    this.home = t, this.name = e, this.players = s;
  }
  setField(t) {
    this.field = t;
  }
  rating() {
    return {
      goalkeeping: this.goalkeeperRating(),
      defense: this.defenceRating(),
      attack: this.attackRating()
    };
  }
  getGoalkeepers() {
    return this.players.filter((t) => t.position === c.GK);
  }
  getFieldPlayers(t = []) {
    return this.players.filter((e) => e.position !== c.GK).filter((e) => !t.length || t.indexOf(e) < 0);
  }
  averageRating(t, e = null) {
    const s = e || this.getFieldPlayers();
    return s.map(t).reduce((i, a) => i + a) / s.length;
  }
  goalkeeperRating() {
    return this.averageRating((t) => t.ratingAverage(), this.getGoalkeepers());
  }
  defenceRating() {
    return this.averageRating((t) => t.defenceRating());
  }
  possessionRating() {
    return this.averageRating((t) => t.possessionRating());
  }
  attackRating() {
    return this.averageRating((t) => t.attackRating());
  }
  simulateMove(t, e) {
    if ([k.AttackingLeft, k.AttackingCenter, k.AttackingRight].indexOf(t) >= 0) {
      const i = [[x.GoalAttempt, 50], [x.Stay, 35], [x.Retreat, 15]];
      return A(i);
    }
    const s = [[x.Advance, 50], [x.Stay, 35], [x.Retreat, 15]];
    return A(s);
  }
  getProbablePlayer(t, e, s = []) {
    if (!this.field)
      throw new Error("Field is not set");
    const [i, a] = this.field.fieldAreaToNumber(t), n = z[a], r = tt[i], h = Object.entries(n), u = Object.entries(r), g = A(h), y = A(u), m = et[g], p = st[y], b = m.filter((S) => p.includes(S));
    let v = this.getFieldPlayers(s).filter((S) => b.includes(S.position));
    return v.length || (v = this.getFieldPlayers(s).filter((S) => m.includes(S.position))), v[Math.floor(Math.random() * v.length)];
  }
  attacker(t, e = []) {
    return this.getProbablePlayer(t, !0, e);
  }
  defender(t, e = []) {
    return this.getProbablePlayer(t, !1, e);
  }
}
const at = {
  rounds: 2,
  matchLengthSeconds: 5400,
  random: Math.random
};
class ht {
  constructor(t, e = {}) {
    d(this, "teams");
    d(this, "options");
    this.teams = t, this.options = {
      ...at,
      ...e
    };
  }
  simulate() {
    const t = this.emptyTable(), e = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map(), i = [];
    return this.fixtures().forEach(([a, n]) => {
      const r = this.teamFromInput(a, !0), h = this.teamFromInput(n, !1), u = new J(r, h, {
        matchLengthSeconds: this.options.matchLengthSeconds,
        random: this.options.random,
        homeTactics: a.tactics,
        awayTactics: n.tactics
      });
      u.simulate(this.options.matchLengthSeconds);
      const g = this.matchReport(u);
      i.push(g), this.applyTableResult(t, g), this.collectPlayerStats(e, u.events), this.collectStyleStats(s, a, n, u.events, g);
    }), {
      matches: i,
      table: this.sortedTable(t),
      topScorers: this.topPlayers(e, "goals"),
      topPassers: this.topPlayers(e, "passes"),
      styleStats: this.finalizeStyleStats(s),
      metrics: this.metrics(i)
    };
  }
  fixtures() {
    const t = [];
    for (let e = 0; e < this.options.rounds; e += 1)
      for (let s = 0; s < this.teams.length; s += 1)
        for (let i = s + 1; i < this.teams.length; i += 1) {
          const a = e % 2 === 0 ? this.teams[s] : this.teams[i], n = e % 2 === 0 ? this.teams[i] : this.teams[s];
          t.push([a, n]);
        }
    return t;
  }
  teamFromInput(t, e) {
    return new it(e, t.name, t.players);
  }
  emptyTable() {
    return new Map(this.teams.map((t) => [
      t.name,
      {
        teamName: t.name,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0
      }
    ]));
  }
  matchReport(t) {
    const e = t.snapshots[t.snapshots.length - 1];
    return {
      homeTeam: t.homeTeam.name,
      awayTeam: t.awayTeam.name,
      homeGoals: (e == null ? void 0 : e.score.home) || 0,
      awayGoals: (e == null ? void 0 : e.score.away) || 0,
      shots: t.events.filter((s) => s.type === "shot").length,
      fouls: t.events.filter((s) => s.type === "foul").length,
      yellowCards: t.events.filter((s) => s.type === "yellow_card").length,
      redCards: t.events.filter((s) => s.type === "red_card").length,
      injuries: t.events.filter((s) => s.type === "injury").length
    };
  }
  applyTableResult(t, e) {
    const s = t.get(e.homeTeam), i = t.get(e.awayTeam);
    !s || !i || (this.applyTeamResult(s, e.homeGoals, e.awayGoals), this.applyTeamResult(i, e.awayGoals, e.homeGoals));
  }
  applyTeamResult(t, e, s) {
    if (t.played += 1, t.goalsFor += e, t.goalsAgainst += s, t.goalDifference = t.goalsFor - t.goalsAgainst, e > s) {
      t.won += 1, t.points += 3;
      return;
    }
    if (e === s) {
      t.drawn += 1, t.points += 1;
      return;
    }
    t.lost += 1;
  }
  collectPlayerStats(t, e) {
    e.forEach((s) => {
      if (!s.player || !s.team)
        return;
      const i = `${s.team.name}:${s.player.info.number}:${s.player.info.name}`, a = t.get(i) || {
        playerName: s.player.info.name,
        teamName: s.team.name,
        goals: 0,
        shots: 0,
        passes: 0,
        defensiveActions: 0
      };
      s.type === "goal" && (a.goals += 1), s.type === "shot" && (a.shots += 1), s.type === "pass" && (a.passes += 1), ["interception", "tackle", "blocked_shot"].includes(s.type) && (a.defensiveActions += 1), t.set(i, a);
    });
  }
  collectStyleStats(t, e, s, i, a) {
    var n, r;
    this.applyStyleStats(t, ((n = e.tactics) == null ? void 0 : n.style) || "balanced", "home", i, a.homeGoals), this.applyStyleStats(t, ((r = s.tactics) == null ? void 0 : r.style) || "balanced", "away", i, a.awayGoals);
  }
  applyStyleStats(t, e, s, i, a) {
    const n = t.get(e) || {
      style: e,
      matches: 0,
      goalsFor: 0,
      shotsFor: 0,
      finalThirdRecoveries: 0,
      averageGoalsFor: 0,
      averageShotsFor: 0,
      averageFinalThirdRecoveries: 0
    };
    n.matches += 1, n.goalsFor += a, n.shotsFor += i.filter((r) => r.teamSide === s && r.type === "shot").length, n.finalThirdRecoveries += i.filter((r) => r.teamSide === s && ["interception", "tackle", "recovery"].includes(r.type) && r.fieldZones.includes("final_third")).length, t.set(e, n);
  }
  sortedTable(t) {
    return [...t.values()].sort((e, s) => s.points - e.points || s.goalDifference - e.goalDifference || s.goalsFor - e.goalsFor || e.teamName.localeCompare(s.teamName));
  }
  topPlayers(t, e) {
    return [...t.values()].filter((s) => s[e] > 0).sort((s, i) => i[e] - s[e]).slice(0, 10);
  }
  finalizeStyleStats(t) {
    return [...t.values()].map((e) => ({
      ...e,
      averageGoalsFor: this.ratio(e.goalsFor, e.matches),
      averageShotsFor: this.ratio(e.shotsFor, e.matches),
      averageFinalThirdRecoveries: this.ratio(e.finalThirdRecoveries, e.matches)
    }));
  }
  metrics(t) {
    return {
      goalsPerMatch: this.ratio(t.reduce((e, s) => e + s.homeGoals + s.awayGoals, 0), t.length),
      shotsPerMatch: this.ratio(t.reduce((e, s) => e + s.shots, 0), t.length),
      yellowCardsPerMatch: this.ratio(t.reduce((e, s) => e + s.yellowCards, 0), t.length),
      redCardsPerMatch: this.ratio(t.reduce((e, s) => e + s.redCards, 0), t.length),
      injuriesPerMatch: this.ratio(t.reduce((e, s) => e + s.injuries, 0), t.length),
      homeWinShare: this.ratio(t.filter((e) => e.homeGoals > e.awayGoals).length, t.length)
    };
  }
  ratio(t, e) {
    return e ? Math.round(t / e * 1e3) / 1e3 : 0;
  }
}
export {
  ot as Commentator,
  Q as Engine,
  q as Field,
  ct as Game,
  V as Player,
  c as Position,
  J as RealTimeEngine,
  lt as RealTimeReporter,
  H as Reporter,
  ht as SeasonSimulator,
  it as Team,
  P as attackPositions,
  U as centerPositions,
  _ as defencePositions,
  N as leftPositions,
  T as midfieldPositions,
  Y as rightPositions
};
//# sourceMappingURL=index.js.map

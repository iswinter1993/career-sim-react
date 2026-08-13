// engine/lib/matchStats.js — FM-style match statistics tracker (Phase 5.2)
//
// Tracks per-player and per-team statistics during a match iteration.
// Provides the data foundation for post-match ratings (P5.1) and
// match reports (P5.3).
//
// Public API:
//   createMatchStatsTracker()            → { home, away, matchEvents, teamStats }
//   createEmptyPlayerStats()              → fresh per-player stats (with live getters)
//   recordMatchEvent(tracker, side, playerID, eventType, detail, iteration) → void
//   calculateDerivedStats(playerStats)   → enriched stats with % rates
//   calculateTeamDerivedStats(teamTracker) → team-level aggregates
//   getTeamPassAccuracy(teamTracker)     → number (0-100)
//   getTeamTackleRate(teamTracker)       → number (0-100)
//   extractMatchTimeline(tracker)        → Array<{ minute, event, … }>

// ===========================================================================
// TRACKER CREATION
// ===========================================================================

/** Create a fresh match statistics tracker. Call once per match in createMatch(). */
export function createMatchStatsTracker() {
  return {
    home: createTeamStatsTracker(),
    away: createTeamStatsTracker(),
    matchEvents: [],
    teamStats: {
      home: { possession: 0, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, cards: 0 },
      away: { possession: 0, shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, cards: 0 },
    },
  };
}

function createTeamStatsTracker() {
  return {
    players: {},
    total: createEmptyPlayerStats(),
  };
}

export function createEmptyPlayerStats() {  return {
    // Shooting
    shots: 0,
    shotsOnTarget: 0,
    shotsBlocked: 0,
    shotsOffTarget: 0,
    goals: 0,

    // Passing
    passesAttempted: 0,
    passesCompleted: 0,
    keyPasses: 0,
    throughBalls: 0,
    throughBallsCompleted: 0,
    crossesAttempted: 0,
    crossesCompleted: 0,

    // Defending
    tacklesAttempted: 0,
    tacklesWon: 0,
    interceptions: 0,
    clearances: 0,
    blocks: 0,
    fouls: 0,
    foulsAgainst: 0,

    // Movement
    totalDistance: 0,
    sprints: 0,

    // Dribbling
    dribblesAttempted: 0,
    dribblesCompleted: 0,
    // Alias for compatibility with playerRating weights
    get dribbles() { return this.dribblesCompleted; },

    // Discipline
    yellowCards: 0,
    redCards: 0,

    // Goalkeeper
    saves: 0,
    savesParried: 0,
    catches: 0,
    punches: 0,
    goalsConceded: 0,
    sweeps: 0,

    // Other
    offsides: 0,
    assists: 0,
    positionErrors: 0,
    errorsLeadingToGoal: 0,
    // Alias for compatibility
    get errors() { return this.errorsLeadingToGoal + this.positionErrors; },

    // Time
    minutesPlayed: 0,
    substitutedOff: false,
    substitutedOnMinute: null,
    substitutedOffMinute: null,

    // Alias for compatibility with rating weights
    // 'runs' is derived from totalDistance for rating calculations.
    // Defined as a plain value updated alongside totalDistance, not a getter.
    get runs() { return Math.round(this.totalDistance / 100); },
  };
}

// ===========================================================================
// PLAYER STATS ACCESS
// ===========================================================================

/**
 * Get or create a player stats object in a team tracker.
 * @param {object} teamTracker — tracker.home or tracker.away
 * @param {string} playerID
 * @returns {object} player stats
 */
function getOrCreatePlayerStats(teamTracker, playerID) {
  if (!teamTracker.players[playerID]) {
    teamTracker.players[playerID] = createEmptyPlayerStats();
  }
  return teamTracker.players[playerID];
}

// ===========================================================================
// EVENT RECORDING
// ===========================================================================

/**
 * Record a tracked event during the match.
 *
 * Call this from action functions (actions.js, playerMovement.js) or
 * from matchEngine.js after key events are resolved.
 *
 * @param {object} tracker — the match stats tracker
 * @param {'home'|'away'} side — which team performed the action
 * @param {string} playerID — player who performed the action
 * @param {string} eventType — event category (see switch below)
 * @param {object} [detail] — additional event data
 * @param {number} [iteration] — current iteration (for minute calculation)
 */
export function recordMatchEvent(tracker, side, playerID, eventType, detail = {}, iteration = 0) {
  if (!tracker || !side || !playerID) return;

  const teamTracker = side === 'home' ? tracker.home : tracker.away;
  const playerStats = getOrCreatePlayerStats(teamTracker, playerID);
  const teamAggStats = tracker.teamStats[side];

  const minute = Math.floor(iteration / 30);

  switch (eventType) {
    // ===== SHOOTING =====
    case 'shot':
    case 'shoot':
      playerStats.shots++;
      teamAggStats.shots++;
      if (detail.onTarget) {
        playerStats.shotsOnTarget++;
        teamAggStats.shotsOnTarget++;
      } else if (detail.blocked) {
        playerStats.shotsBlocked++;
      } else {
        playerStats.shotsOffTarget++;
      }
      break;

    case 'goal':
      playerStats.goals++;
      if (detail.assistPlayerID) {
        const assistPlayer = getOrCreatePlayerStats(teamTracker, detail.assistPlayerID);
        assistPlayer.assists++;
      }
      // Track conceding GK on the other team
      _trackConcedingGK(tracker, side);
      // Record in timeline
      tracker.matchEvents.push({
        minute, iteration, side, playerID, eventType: 'goal',
        detail: { ...detail },
      });
      break;

    // ===== PASSING =====
    case 'pass':
      playerStats.passesAttempted++;
      if (detail.completed) {
        playerStats.passesCompleted++;
      }
      if (detail.keyPass) {
        playerStats.keyPasses++;
      }
      break;

    case 'throughBall':
      playerStats.throughBalls++;
      if (detail.completed) {
        playerStats.throughBallsCompleted++;
      }
      if (detail.keyPass) {
        playerStats.keyPasses++;
      }
      break;

    case 'cross':
      playerStats.crossesAttempted++;
      if (detail.completed) {
        playerStats.crossesCompleted++;
      }
      break;

    // ===== DEFENDING =====
    case 'tackle':
      playerStats.tacklesAttempted++;
      if (detail.won) {
        playerStats.tacklesWon++;
      }
      break;

    case 'intercept':
    case 'interception':
      playerStats.interceptions++;
      break;

    case 'slide':
      playerStats.tacklesAttempted++;
      if (detail.won) {
        playerStats.tacklesWon++;
      }
      if (detail.foul) {
        playerStats.fouls++;
        teamAggStats.fouls++;
        if (detail.victimID) {
          _trackVictimFoul(tracker, side, detail.victimID);
        }
      }
      break;

    case 'cleared':
    case 'boot':
      playerStats.clearances++;
      break;

    case 'block':
      playerStats.blocks++;
      break;

    // ===== MOVEMENT =====
    case 'sprint':
      playerStats.sprints++;
      playerStats.totalDistance += detail.distance || 5;
      break;

    case 'run':
    case 'dribble':
      playerStats.dribblesAttempted++;
      if (detail.completed) {
        playerStats.dribblesCompleted++;
      }
      playerStats.totalDistance += detail.distance || 2;
      break;

    // ===== DISCIPLINE =====
    case 'foul':
      playerStats.fouls++;
      teamAggStats.fouls++;
      if (detail.victimID) {
        _trackVictimFoul(tracker, side, detail.victimID);
      }
      break;

    case 'yellowCard':
      playerStats.yellowCards++;
      teamAggStats.cards++;
      tracker.matchEvents.push({
        minute, iteration, side, playerID, eventType: 'yellowCard', detail,
      });
      break;

    case 'redCard':
      playerStats.redCards++;
      teamAggStats.cards++;
      tracker.matchEvents.push({
        minute, iteration, side, playerID, eventType: 'redCard', detail,
      });
      break;

    // ===== GOALKEEPER =====
    case 'save':
      playerStats.saves++;
      if (detail.parried) {
        playerStats.savesParried++;
      }
      break;

    case 'catch':
      playerStats.catches++;
      break;

    case 'punch':
      playerStats.punches++;
      break;

    case 'sweep':
      playerStats.sweeps++;
      break;

    // ===== OTHER =====
    case 'offside':
      playerStats.offsides++;
      break;

    case 'error':
      playerStats.positionErrors++;
      if (detail.ledToGoal) {
        playerStats.errorsLeadingToGoal++;
      }
      break;

    case 'corner':
      teamAggStats.corners++;
      break;
  }
}

// ===========================================================================
// DERIVED STATS
// ===========================================================================

/**
 * Calculate derived (percentage) statistics for a player.
 *
 * @param {object} playerStats — raw stats from tracker
 * @returns {object} enriched stats with accuracy percentages
 */
export function calculateDerivedStats(playerStats) {
  if (!playerStats) return createEmptyPlayerStats();

  return {
    ...playerStats,
    passAccuracy: playerStats.passesAttempted > 0
      ? Math.round(playerStats.passesCompleted / playerStats.passesAttempted * 100)
      : 0,
    tackleSuccessRate: playerStats.tacklesAttempted > 0
      ? Math.round(playerStats.tacklesWon / playerStats.tacklesAttempted * 100)
      : 0,
    dribbleSuccessRate: playerStats.dribblesAttempted > 0
      ? Math.round(playerStats.dribblesCompleted / playerStats.dribblesAttempted * 100)
      : 0,
    shotAccuracy: playerStats.shots > 0
      ? Math.round(playerStats.shotsOnTarget / playerStats.shots * 100)
      : 0,
    crossAccuracy: playerStats.crossesAttempted > 0
      ? Math.round(playerStats.crossesCompleted / playerStats.crossesAttempted * 100)
      : 0,
    // Rating-weight aliases — playerRating.js weights reference `tackles` and
    // `crosses` (completed), but the tracker stores tacklesWon/crossesCompleted.
    tackles: playerStats.tacklesWon || 0,
    crosses: playerStats.crossesCompleted || 0,
  };
}

/**
 * Calculate team-level derived statistics.
 *
 * @param {object} teamTracker — tracker.home or tracker.away
 * @returns {object}
 */
export function calculateTeamDerivedStats(teamTracker) {
  if (!teamTracker) return {};

  const players = teamTracker.players || {};
  const totalPasses = Object.values(players)
    .reduce((sum, p) => sum + (p.passesAttempted || 0), 0);
  const totalPassesCompleted = Object.values(players)
    .reduce((sum, p) => sum + (p.passesCompleted || 0), 0);
  const totalTackles = Object.values(players)
    .reduce((sum, p) => sum + (p.tacklesAttempted || 0), 0);
  const totalDistance = Object.values(players)
    .reduce((sum, p) => sum + (p.totalDistance || 0), 0);

  return {
    ...teamTracker.total,
    totalPasses,
    totalPassesCompleted,
    passAccuracy: totalPasses > 0
      ? Math.round(totalPassesCompleted / totalPasses * 100)
      : 0,
    totalTackles,
    totalDistance,
  };
}

/**
 * Get team pass accuracy as a percentage (0-100).
 *
 * @param {object} teamTracker
 * @returns {number}
 */
export function getTeamPassAccuracy(teamTracker) {
  const players = teamTracker?.players || {};
  const attempted = Object.values(players)
    .reduce((sum, p) => sum + (p.passesAttempted || 0), 0);
  const completed = Object.values(players)
    .reduce((sum, p) => sum + (p.passesCompleted || 0), 0);
  return attempted > 0 ? Math.round(completed / attempted * 100) : 0;
}

/**
 * Get team tackle success rate as a percentage (0-100).
 *
 * @param {object} teamTracker
 * @returns {number}
 */
export function getTeamTackleRate(teamTracker) {
  const players = teamTracker?.players || {};
  const attempted = Object.values(players)
    .reduce((sum, p) => sum + (p.tacklesAttempted || 0), 0);
  const won = Object.values(players)
    .reduce((sum, p) => sum + (p.tacklesWon || 0), 0);
  return attempted > 0 ? Math.round(won / attempted * 100) : 0;
}

// ===========================================================================
// TIMELINE EXTRACTION
// ===========================================================================

/**
 * Extract a sorted match event timeline.
 *
 * @param {object} tracker
 * @returns {Array<{ minute, side, playerID, eventType, detail }>}
 */
export function extractMatchTimeline(tracker) {
  if (!tracker?.matchEvents) return [];
  return [...tracker.matchEvents].sort((a, b) => a.minute - b.minute || a.iteration - b.iteration);
}

// ===========================================================================
// INTERNAL HELPERS
// ===========================================================================

/**
 * Track a goal conceded by the opposing GK.
 */
function _trackConcedingGK(tracker, scoringSide) {
  const gkSide = scoringSide === 'home' ? 'away' : 'home';
  const gkTracker = gkSide === 'home' ? tracker.home : tracker.away;
  // Only increment goalsConceded for players already tracked
  // (the GK should be registered before any goals are scored)
  for (const stats of Object.values(gkTracker.players)) {
    if (typeof stats.goalsConceded === 'number') {
      stats.goalsConceded++;
    }
  }
  // Also increment on the team total
  gkTracker.total.goalsConceded++;
}

/**
 * Track fouls against a specific victim player.
 */
function _trackVictimFoul(tracker, foulingSide, victimID) {
  const victimSide = foulingSide === 'home' ? 'away' : 'home';
  const victimTracker = victimSide === 'home' ? tracker.home : tracker.away;
  const victimStats = getOrCreatePlayerStats(victimTracker, victimID);
  victimStats.foulsAgainst++;
}

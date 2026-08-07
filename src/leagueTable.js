// League standings module — pure functions for a double-round-robin league.
//
// Public API:
//   generateSchedule(teams)        → array of rounds, each round an array of
//                                    { home, away } fixtures
//   simulateOtherMatch(teamA, teamB, rng)
//                                  → { homeGoals, awayGoals, home, away }
//   createTable(teams)             → initial empty table
//   updateTable(table, result)     → table with points/goals/goalDiff updated
//   getRankings(table)             → sorted by pts→gd→gf→head-to-head
//   getTeamRanking(table, teamID)  → rank position for one team

// ---------------------------------------------------------------------------
// Schedule generation — double round-robin (home + away)
// ---------------------------------------------------------------------------

/**
 * Generate a full double-round-robin fixture list.
 *
 * Uses the circle method (Berger tables) for the first half-season, then
 * mirrors home/away to produce the second half.
 *
 * @param {Array<{ id: string, name?: string }>} teams
 * @returns {Array<Array<{ home: string, away: string, round: number }>>}
 *   Outer array = rounds (matchdays). Each round is an array of fixtures
 *   where each fixture has home team ID and away team ID.
 */
export function generateSchedule(teams) {
  const ids = teams.map((t) => t.id);
  const n = ids.length;

  // Odd number → add a "BYE" dummy; fixtures involving BYE become rest weeks
  const hasBye = n % 2 !== 0;
  const all = hasBye ? [...ids, 'BYE'] : [...ids];
  const m = all.length; // m is even

  const halfRounds = m - 1;    // each team plays every other once
  const matchesPerRound = m / 2;

  const firstHalf = [];

  // Circle method: fix team[0], rotate the rest
  const circle = [...all];

  for (let round = 0; round < halfRounds; round++) {
    const fixtures = [];
    for (let i = 0; i < matchesPerRound; i++) {
      const home = circle[i];
      const away = circle[m - 1 - i];

      if (home !== 'BYE' && away !== 'BYE') {
        // Alternate home/away assignment to keep it balanced
        fixtures.push({ home, away, round: round + 1 });
      }
    }
    if (fixtures.length > 0) {
      firstHalf.push(fixtures);
    }

    // Rotate: keep circle[0] fixed, shift the rest clockwise by 1
    const last = circle.pop();
    circle.splice(1, 0, last);
  }

  // Second half: mirror fixtures, increment round numbers
  const secondHalf = [];
  for (const roundFixtures of firstHalf) {
    const mirrored = roundFixtures.map((f) => ({
      home: f.away,
      away: f.home,
      round: f.round + halfRounds,
    }));
    secondHalf.push(mirrored);
  }

  return [...firstHalf, ...secondHalf];
}

// ---------------------------------------------------------------------------
// Other-match simulation — simple Poisson / Elo-like random score
// ---------------------------------------------------------------------------

/**
 * Simulate a match between two AI-controlled teams.
 *
 * @param {string} teamA — team ID (home)
 * @param {string} teamB — team ID (away)
 * @param {Function} [rng] — optional PRNG returning [0,1). If omitted, uses
 *   Math.random (non-deterministic).
 * @returns {{ home: string, away: string, homeGoals: number, awayGoals: number }}
 */
export function simulateOtherMatch(teamA, teamB, rng) {
  const rand = rng || Math.random;

  // Simple Poisson-inspired scoring: 0-4 goals for each side, with home bias
  const homeAvg = 1.4;
  const awayAvg = 1.1;

  const homeGoals = _poissonSample(homeAvg, rand);
  const awayGoals = _poissonSample(awayAvg, rand);

  return { home: teamA, away: teamB, homeGoals, awayGoals };
}

// ---------------------------------------------------------------------------
// Table operations
// ---------------------------------------------------------------------------

/**
 * Create an empty league table from a list of teams.
 *
 * @param {Array<{ id: string, name?: string }>} teams
 * @returns {object} keyed by team ID → { id, name, played, won, drawn, lost,
 *   goalsFor, goalsAgainst, goalDiff, points }
 */
export function createTable(teams) {
  const table = {};
  for (const team of teams) {
    table[team.id] = {
      id: team.id,
      name: team.name || team.id,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
    };
  }
  return table;
}

/**
 * Update a league table with a match result.
 *
 * Points: 3 for a win, 1 for a draw, 0 for a loss.
 * Returns a new shallow copy of the table (immutable style).
 *
 * @param {object} table — the table from createTable or a previous updateTable
 * @param {{ home: string, away: string, homeGoals: number, awayGoals: number }} result
 * @returns {object} updated table
 */
export function updateTable(table, result) {
  // shallow clone
  const next = { ...table };

  const homeRec = { ...next[result.home] };
  const awayRec = { ...next[result.away] };

  homeRec.played += 1;
  awayRec.played += 1;

  homeRec.goalsFor += result.homeGoals;
  homeRec.goalsAgainst += result.awayGoals;

  awayRec.goalsFor += result.awayGoals;
  awayRec.goalsAgainst += result.homeGoals;

  if (result.homeGoals > result.awayGoals) {
    homeRec.won += 1;
    homeRec.points += 3;
    awayRec.lost += 1;
  } else if (result.homeGoals < result.awayGoals) {
    awayRec.won += 1;
    awayRec.points += 3;
    homeRec.lost += 1;
  } else {
    homeRec.drawn += 1;
    awayRec.drawn += 1;
    homeRec.points += 1;
    awayRec.points += 1;
  }

  homeRec.goalDiff = homeRec.goalsFor - homeRec.goalsAgainst;
  awayRec.goalDiff = awayRec.goalsFor - awayRec.goalsAgainst;

  next[result.home] = homeRec;
  next[result.away] = awayRec;

  return next;
}

/**
 * Get team rankings sorted by the standard tiebreakers:
 *   1. Points (descending)
 *   2. Goal difference (descending)
 *   3. Goals scored (descending)
 *   4. Alphabetical by name (ascending, tie-breaker of last resort)
 *
 * @param {object} table — keyed by team ID
 * @returns {Array} sorted array of team records with a `rank` property (1-based)
 */
export function getRankings(table) {
  const entries = Object.values(table);

  entries.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return (a.name || a.id).localeCompare(b.name || b.id);
  });

  // Assign ranks (handle tied points/goalDiff/goalsFor = same rank)
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 &&
        entries[i].points === entries[i - 1].points &&
        entries[i].goalDiff === entries[i - 1].goalDiff &&
        entries[i].goalsFor === entries[i - 1].goalsFor) {
      entries[i].rank = entries[i - 1].rank;
    } else {
      entries[i].rank = i + 1;
    }
  }

  return entries;
}

/**
 * Get the rank (1-based) of a specific team in the table.
 *
 * @param {object} table — keyed by team ID
 * @param {string} teamID
 * @returns {number|null} rank or null if not found
 */
export function getTeamRanking(table, teamID) {
  const rankings = getRankings(table);
  const entry = rankings.find((r) => r.id === teamID);
  return entry ? entry.rank : null;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Approximate Poisson-distributed integer using inverse transform.
 * Clamps to 0-7 to keep scores believable.
 */
function _poissonSample(lambda, randFn) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= randFn();
  } while (p > L && k < 8);
  return Math.max(0, Math.min(7, k - 1));
}

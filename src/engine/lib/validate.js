import * as common from './common.js'
import { ALL_POSITIONS } from './positionGroup.js'
import { validateFormationName as _validateFormationName } from './formation.js'
import { validateRoleForPosition, getDefaultRole } from './tactics.js'

function validateTeam(team) {
  if (typeof (team) != `object`) team = JSON.parse(team)
  if (!team.name) throw new Error(`No team name given.`)
  else {
    validateNumberOfPlayers(team.players)
    for (const player of team.players) {
      validatePlayerObjects(player)
    }
  }
}

function validateTeamSecondHalf(team) {
  if (typeof (team) != `object`) team = JSON.parse(team)
  if (!team.name) throw new Error(`No team name given.`)
  else if (!team.intent) throw new Error(`No team intent given.`)
  else if (!team.teamID) throw new Error(`No team ID given.`)
  else {
    validateNumberOfPlayers(team.players)
    for (const player of team.players) {
      validatePlayerObjectsIteration(player)
    }
  }
}

function validateNumberOfPlayers(players) {
  if (players.length != 11) {
    throw new Error(`There must be 11 players in a team`)
  }
}

function validatePlayerObjects(player) {
  let playerObjects = [`name`, `position`, `rating`, `currentPOS`, `injured`, `fitness`, `height`]
  for (const obj of playerObjects) {
    if (!Object.prototype.hasOwnProperty.call(player, obj)) {
      throw new Error(`Player must contain JSON variable: ${obj}`)
    }
  }

  // Validate position against the canonical 12-position list.
  // Unknown positions are mapped to 'CM' instead of crashing so that
  // slightly-malformed squad data doesn't break the whole initialisation.
  const pos = player.position;
  if (pos && !ALL_POSITIONS.includes(pos)) {
    console.warn(`[validate] Unknown position "${pos}" for player "${player.name}" — falling back to CM`);
    player.position = 'CM';
  }

  validatePlayerSkills(player.skill)
}

function validatePlayerObjectsIteration(player) {
  let playerObjects = [`playerID`, `name`, `position`, `rating`, `currentPOS`, `injured`, `fitness`, `height`]
  playerObjects.push(`originPOS`, `intentPOS`, `action`, `offside`, `hasBall`, `stats`)
  for (const obj of playerObjects) {
    if (!Object.prototype.hasOwnProperty.call(player, obj)) {
      throw new Error(`Player must contain JSON variable: ${obj}`)
    }
  }

  // Validate position (as above, fall back rather than crash)
  const pos = player.position;
  if (pos && !ALL_POSITIONS.includes(pos)) {
    console.warn(`[validate] Unknown position "${pos}" for player "${player.name}" — falling back to CM`);
    player.position = 'CM';
  }

  validatePlayerSkills(player.skill)
  validateStats(player.stats)
}

function validateStats(stats) {
  let statsObject = [`cards`, `goals`, `tackles`, `passes`, `shots`]
  let badObjects = 0
  for (const type of statsObject) {
    if (!Object.prototype.hasOwnProperty.call(stats, type)) {
      console.error(`Player must have set stats: ${type}`)
      badObjects++
    }
  }
  if (badObjects > 0) {
    throw new Error(`Provide Stats: cards,goals,tackles,passes,shots`)
  }
}

function validatePlayerSkills(skills) {
  let skillType = [`passing`, `shooting`, `tackling`, `saving`, `agility`, `strength`, `penalty_taking`, `jumping`]
  let badObjects = 0
  for (const type of skillType) {
    if (!Object.prototype.hasOwnProperty.call(skills, type)) {
      console.error(`Player must contain skill: ${type}`)
      badObjects++
    }
  }
  if (badObjects > 0) {
    throw new Error(`Provide skills: passing,shooting,tackling,saving,agility,strength,penalty_taking,jumping`)
  }
}

function validatePitch(pitchDetails) {
  let pitchObjects = [`pitchWidth`, `pitchHeight`]
  let badObjects = 0
  for (const obj of pitchObjects) {
    if (!Object.prototype.hasOwnProperty.call(pitchDetails, obj)) {
      console.error(`Pitch Must contain: ${obj}`)
      badObjects++
    }
  }
  if (badObjects > 0) {
    throw new Error(`Please provide pitchWidth and pitchHeight`)
  }
}

function validateArguments(a, b, c) {
  if (a === undefined || b === undefined || c === undefined) throw new Error(`Please provide two teams and a pitch`)
}

function validateMatchDetails(matchDetails) {
  let matchObjects = [`matchID`, `kickOffTeam`, `secondTeam`, `pitchSize`, `ball`, `half`]
  Array.prototype.push.apply(matchObjects, [`kickOffTeamStatistics`, `secondTeamStatistics`, `iterationLog`])
  let badObjects = 0
  for (const obj of matchObjects) {
    if (matchDetails) {
      if (!Object.prototype.hasOwnProperty.call(matchDetails, obj)) {
        console.error(`Match Details must contain: ${obj}`)
        badObjects++
      }
    }
    if (badObjects > 0) throw new Error(`Please provide valid match details JSON`)
  }
  validateBall(matchDetails.ball)
}

function validateBall(ball) {
  let ballProps = [`position`, `withPlayer`, `Player`, `withTeam`, `direction`, `ballOverIterations`]
  let badObjects = 0
  for (const prop of ballProps) {
    if (!Object.prototype.hasOwnProperty.call(ball, prop)) {
      console.error(`Ball JSON must have property: ${prop}`)
      badObjects++
    }
  }
  if (badObjects > 0) throw new Error(`Provide: position,withPlayer,Player,withTeam,direction,ballOverIterations`)
}

function validatePlayerPositions(matchDetails) {
  let { kickOffTeam, secondTeam } = matchDetails
  const [pitchWidth, pitchHeight] = matchDetails.pitchSize
  for (const player of kickOffTeam.players) {
    if (player.currentPOS[0] != 'NP') {
      let onPitchX = (common.isBetween(player.currentPOS[0], -1, pitchWidth + 1))
      let onPitchY = (common.isBetween(player.currentPOS[1], -1, pitchHeight + 1))
      if (onPitchX == false) throw new Error(`Player ${player.name} not on the pitch X: ${player.currentPOS[0]}`)
      if (onPitchY == false) throw new Error(`Player ${player.name} not on the pitch Y: ${player.currentPOS[1]}`)
    }
  }
  for (const player of secondTeam.players) {
    if (player.currentPOS[0] != 'NP') {
      let onPitchX = (common.isBetween(player.currentPOS[0], -1, pitchWidth + 1))
      let onPitchY = (common.isBetween(player.currentPOS[1], -1, pitchHeight + 1))
      if (onPitchX == false) throw new Error(`Player ${player.name} not on the pitch X: ${player.currentPOS[0]}`)
      if (onPitchY == false) throw new Error(`Player ${player.name} not on the pitch Y: ${player.currentPOS[1]}`)
    }
  }
}

// ---------------------------------------------------------------------------
// New validation helpers (P0.4)
// ---------------------------------------------------------------------------

/**
 * Validate that a formation name string refers to a known formation.
 * Returns the canonical name, or '4-4-2' as fallback.
 *
 * @param {string} name
 * @returns {string} canonical formation name
 */
function validateFormationName(name) {
  if (_validateFormationName(name)) return name;
  console.warn(`[validate] Unknown formation "${name}" — falling back to 4-4-2`);
  return '4-4-2';
}

/**
 * Validate that a role is appropriate for a position.  If the role is invalid
 * for the position, returns the default role for that position instead.
 *
 * @param {string} position
 * @param {string} role
 * @returns {string} valid role key
 */
function validateRoleAssignment(position, role) {
  if (validateRoleForPosition(role, position)) return role;
  console.warn(`[validate] Role "${role}" invalid for position "${position}" — falling back to default`);
  return getDefaultRole(position);
}

export {
  validateTeam,
  validateTeamSecondHalf,
  validatePlayerObjectsIteration,
  validatePitch,
  validateArguments,
  validateMatchDetails,
  validatePlayerPositions,
  validateFormationName,
  validateRoleAssignment,
}

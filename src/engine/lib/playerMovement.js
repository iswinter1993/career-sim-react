/* eslint-disable no-unused-vars */
import * as common from './common.js'
import * as ballMovement from './ballMovement.js'
import * as setPositions from './setPositions.js'
import * as actions from './actions.js'
import { getPositionGroup, isDefensivePosition, isAttackingPosition, isWidePosition } from './positionGroup.js'
import { getRoleModifier, evaluateTraits } from './tactics.js'

// ===========================================================================
// THREE-LAYER AI — Movement Modifiers (P4.5)
// ===========================================================================

/**
 * Calculate movement modifiers for a player from all three AI layers.
 * Called by getRunMovement / getSprintMovement to adjust behaviour.
 *
 * Layer 1 (Team Strategy): width, pressing, fluidity
 * Layer 2 (Player Role): forwardRuns, holdPosition, stayWide, cutInside, …
 * Layer 3 (Player Traits): additive override on top of role
 *
 * @param {object} player — engine player with .role, .traits, .position
 * @param {object} teamStrategy — team._strategy (from applyTeamStrategy)
 * @param {object} matchState — { ball, ballPossession }
 * @returns {{ forwardRuns: number, holdPosition: number, stayWide: number,
 *             cutInside: number, roamFromPosition: number, closingDown: number,
 *             staminaDrain: number, invertInside: number }}
 */
export function getMovementModifiers(player, teamStrategy, matchState) {
  if (!player) {
    return {
      forwardRuns: 1.0, holdPosition: 1.0, stayWide: 1.0, cutInside: 1.0,
      roamFromPosition: 1.0, closingDown: 1.0, staminaDrain: 1.0, invertInside: 1.0,
    };
  }

  const modifiers = {
    forwardRuns: 1.0, holdPosition: 1.0, stayWide: 1.0, cutInside: 1.0,
    roamFromPosition: 1.0, closingDown: 1.0, staminaDrain: 1.0, invertInside: 1.0,
  };
  // --- Layer 1: Team Strategy ---
  if (teamStrategy) {
    if (teamStrategy._widthMultiplier) {
      modifiers.stayWide *= teamStrategy._widthMultiplier;
    }
    if (teamStrategy._pressingMultiplier) {
      modifiers.closingDown *= teamStrategy._pressingMultiplier;
    }
    if (teamStrategy._fluidityFactor !== undefined) {
      modifiers.roamFromPosition += teamStrategy._fluidityFactor;
      modifiers.holdPosition -= teamStrategy._fluidityFactor * 0.5;
    }
  }

  // --- Layer 2: Player Role ---
  if (player.role) {
    const role = getRoleModifier(player.role);
    if (role.movementModifiers) {
      const rm = role.movementModifiers;
      if (rm.forwardRuns !== undefined) modifiers.forwardRuns += rm.forwardRuns;
      if (rm.holdPosition !== undefined) modifiers.holdPosition += rm.holdPosition;
      if (rm.stayWide !== undefined) modifiers.stayWide += rm.stayWide;
      if (rm.cutInside !== undefined) modifiers.cutInside += rm.cutInside;
      if (rm.roamFromPosition !== undefined) modifiers.roamFromPosition += rm.roamFromPosition;
      if (rm.closingDown !== undefined) modifiers.closingDown += rm.closingDown;
      if (rm.staminaDrain !== undefined) modifiers.staminaDrain += rm.staminaDrain;
      if (rm.invertInside !== undefined) modifiers.invertInside += rm.invertInside;
    }
  }

  // --- Layer 3: Player Traits ---
  if (player.traits && player.traits.length > 0) {
    const traitEffects = evaluateTraits(player, matchState);
    if (traitEffects.movementModifiers) {
      const tm = traitEffects.movementModifiers;
      if (tm.forwardRuns !== undefined) modifiers.forwardRuns += tm.forwardRuns;
      if (tm.holdPosition !== undefined) modifiers.holdPosition += tm.holdPosition;
      if (tm.stayWide !== undefined) modifiers.stayWide += tm.stayWide;
      if (tm.cutInside !== undefined) modifiers.cutInside += tm.cutInside;
      if (tm.roamFromPosition !== undefined) modifiers.roamFromPosition += tm.roamFromPosition;
      if (tm.closingDown !== undefined) modifiers.closingDown += tm.closingDown;
      if (tm.staminaDrain !== undefined) modifiers.staminaDrain += tm.staminaDrain;
      if (tm.invertInside !== undefined) modifiers.invertInside += tm.invertInside;
    }
  }

  // Clamp to reasonable ranges (0.1 - 2.0)
  for (const key of Object.keys(modifiers)) {
    modifiers[key] = Math.max(0.1, Math.min(2.0, modifiers[key]));
  }

  return modifiers;
}

/**
 * Resolve the active team strategy from the matchDetails and team side.
 * Helper for movement functions to discover which team strategy to apply.
 */
function _resolveTeamStrategy(matchDetails, player) {
  // Try team._strategy first (injected by injectTacticsIntoTeam)
  // Fall back to matchDetails metadata
  const originY = player.originPOS?.[1] || 0;
  const pitchHeight = matchDetails.pitchSize?.[1] || 1050;
  const isTop = originY < pitchHeight / 2;

  const kickIsHome = matchDetails.kickOffTeam?.name === matchDetails._homeTeamName;
  const homeTeamKey = kickIsHome ? 'kickOffTeam' : 'secondTeam';
  const awayTeamKey = kickIsHome ? 'secondTeam' : 'kickOffTeam';

  // Determine which side this player belongs to
  const homeTeam = matchDetails[homeTeamKey];
  const awayTeam = matchDetails[awayTeamKey];

  if (homeTeam?.players?.some(p => p.playerID === player.playerID)) {
    return homeTeam._strategy || matchDetails._homeStrategy || null;
  }
  if (awayTeam?.players?.some(p => p.playerID === player.playerID)) {
    return awayTeam._strategy || matchDetails._awayStrategy || null;
  }

  return matchDetails._homeStrategy || matchDetails._awayStrategy || null;
}

function decideMovement(closestPlayer, team, opp, matchDetails) {
  const allActions = [`shoot`, `throughBall`, `pass`, `cross`, `tackle`, `intercept`, `slide`]
  Array.prototype.push.apply(allActions, [`run`, `sprint`, `cleared`, `boot`, `penalty`])
  let { position, withPlayer, withTeam } = matchDetails.ball
  let teamActions = []
  for (const thisPlayer of team.players) {
    if (thisPlayer.currentPOS[0] != 'NP') {
      let ballToPlayerX = thisPlayer.currentPOS[0] - position[0]
      let ballToPlayerY = thisPlayer.currentPOS[1] - position[1]
      let possibleActions
      let action
      possibleActions = actions.findPossActions(thisPlayer, team, opp, ballToPlayerX, ballToPlayerY, matchDetails)
      let lastTouchPlayer = (thisPlayer.playerID == matchDetails.ball.lastTouch.playerID)
      let ballRecentlyKicked = (matchDetails.ball.lastTouch.iterations < 4)
      let ballMoving = (matchDetails.ball.ballOverIterations.length > 0)
      if (lastTouchPlayer && ballRecentlyKicked && ballMoving) action = 'wait'
      else {
        action = actions.selectAction(possibleActions)
        action = checkProvidedAction(matchDetails, thisPlayer, action)
      }
      if (withTeam && withTeam !== team.teamID && closestPlayer.name === thisPlayer.name) {
        if (action !== `tackle` && action !== `slide` && action !== `intercept`) action = `sprint`
        ballToPlayerX = closestPlayerActionBallX(ballToPlayerX)
        ballToPlayerY = closestPlayerActionBallY(ballToPlayerY)
      }
      let move = getMovement(thisPlayer, action, opp, ballToPlayerX, ballToPlayerY, matchDetails)
      teamActions.push({ player: thisPlayer, action, move })
    }
  }
  return teamActions
}

function movePlayers(moves, team, opp, matchDetails) {
  let { position, withPlayer, withTeam } = matchDetails.ball
  for (const thisPlayerMove of moves) {
    let thisPlayer = thisPlayerMove.player
    let { move } = thisPlayerMove
    let { action } = thisPlayerMove
    thisPlayer.currentPOS = completeMovement(matchDetails, thisPlayer.currentPOS, move)
    let xPosition = common.isBetween(thisPlayer.currentPOS[0], position[0] - 3, position[0] + 3)
    let yPosition = common.isBetween(thisPlayer.currentPOS[1], position[1] - 3, position[1] + 3)
    let samePositionAsBall = thisPlayer.currentPOS[0] === position[0] && thisPlayer.currentPOS[1] === position[1]
    let closeWithPlayer = !!((xPosition && yPosition && withPlayer == false))
    if (xPosition && yPosition && withTeam !== team.teamID) {
      if (samePositionAsBall) {
        if (withPlayer === true && thisPlayer.hasBall === false && withTeam !== team.teamID) {
          if (action === `tackle`) matchDetails = completeTackleWhenCloseNoBall(matchDetails, thisPlayer, team, opp)
          if (action === `slide`) matchDetails = completeSlide(matchDetails, thisPlayer, team, opp)
        } else setClosePlayerTakesBall(matchDetails, thisPlayer, team, opp)
      } else if (withPlayer === true && thisPlayer.hasBall === false && withTeam !== team.teamID) {
        if (action === `slide`) matchDetails = completeSlide(matchDetails, thisPlayer, team, opp)
      } else {
        setClosePlayerTakesBall(matchDetails, thisPlayer, team, opp)
      }
    } else if (closeWithPlayer) setClosePlayerTakesBall(matchDetails, thisPlayer, team, opp)
  }
  return team
}

function executeBallAction(move, team, opp, matchDetails) {
  if (matchDetails.ball.ballOverIterations.length !== 0) return team
  const { player } = move
  const { action } = move
  handleBallPlayerActions(matchDetails, player, team, opp, action)
  common.removeBallFromAllPlayers(matchDetails)
  matchDetails.ball.Player = ''
  matchDetails.ball.withPlayer = false
  matchDetails.ball.withTeam = ''
  return team
}

function setClosePlayerTakesBall(matchDetails, thisPlayer, team, opp) {
  if (thisPlayer.offside) {
    matchDetails.iterationLog.push(`${thisPlayer.name} is offside`)
    if (team.name == matchDetails.kickOffTeam.name) setPositions.setSetpieceKickOffTeam(matchDetails)
    else setPositions.setSetpieceSecondTeam(matchDetails)
  } else {
    thisPlayer.hasBall = true
    matchDetails.ball.lastTouch.playerName = thisPlayer.name
    matchDetails.ball.lastTouch.playerID = thisPlayer.playerID
    matchDetails.ball.lastTouch.teamID = team.teamID
    matchDetails.ball.lastTouch.deflection = false
    matchDetails.ball.ballOverIterations = []
    matchDetails.ball.position = thisPlayer.currentPOS.map(x => x)
    matchDetails.ball.Player = thisPlayer.playerID
    matchDetails.ball.withPlayer = true
    matchDetails.ball.withTeam = team.teamID
    team.intent = `attack`
    opp.intent = `defend`
  }
}

function completeSlide(matchDetails, thisPlayer, team, opp) {
  let foul = actions.resolveSlide(thisPlayer, team, opp, matchDetails)
  if (!foul) {
    if (opp.name == matchDetails.kickOffTeam.name) return setPositions.setSetpieceKickOffTeam(matchDetails)
    return setPositions.setSetpieceSecondTeam(matchDetails)
  }
  let intensity = actions.foulIntensity(thisPlayer.skill.tackling)
  if (common.isBetween(intensity, 65, 90)) {
    thisPlayer.stats.cards.yellow++
    if (thisPlayer.stats.cards.yellow == 2) {
      thisPlayer.stats.cards.red++
      _sendOff(matchDetails, thisPlayer)
      matchDetails.iterationLog.push(`Red card for: ${thisPlayer.name}`)
    } else {
      matchDetails.iterationLog.push(`Yellow card for: ${thisPlayer.name}`)
    }
  } else if (common.isBetween(intensity, 85, 100)) {
    thisPlayer.stats.cards.red++
    _sendOff(matchDetails, thisPlayer)
    matchDetails.iterationLog.push(`Red card for: ${thisPlayer.name}`)
  }
  if (opp.name == matchDetails.kickOffTeam.name) return setPositions.setSetpieceKickOffTeam(matchDetails)
  return setPositions.setSetpieceSecondTeam(matchDetails)
}

function completeTackleWhenCloseNoBall(matchDetails, thisPlayer, team, opp) {
  let foul = actions.resolveTackle(thisPlayer, team, opp, matchDetails)
  if (foul) {
    let intensity = actions.foulIntensity(thisPlayer.skill.tackling)
    if (common.isBetween(intensity, 75, 90)) {
      thisPlayer.stats.cards.yellow++
      if (thisPlayer.stats.cards.yellow == 2) {
        thisPlayer.stats.cards.red++
        _sendOff(matchDetails, thisPlayer)
        matchDetails.iterationLog.push(`Red card for: ${thisPlayer.name}`)
      } else {
        matchDetails.iterationLog.push(`Yellow card for: ${thisPlayer.name}`)
      }
    } else if (common.isBetween(intensity, 90, 100)) {
      thisPlayer.stats.cards.red++
      _sendOff(matchDetails, thisPlayer)
      matchDetails.iterationLog.push(`Red card for: ${thisPlayer.name}`)
    }
  }
  if (opp.name == matchDetails.kickOffTeam.name) return setPositions.setSetpieceKickOffTeam(matchDetails)
  return setPositions.setSetpieceSecondTeam(matchDetails)
}

function completeMovement(matchDetails, currentPOS, move) {
  if (currentPOS[0] != 'NP') {
    let intendedMovementX = currentPOS[0] + move[0]
    let intendedMovementY = currentPOS[1] + move[1]
    if (intendedMovementX < matchDetails.pitchSize[0] + 1 && intendedMovementX > -1) currentPOS[0] += move[0]
    if (intendedMovementY < matchDetails.pitchSize[1] + 1 && intendedMovementY > -1) currentPOS[1] += move[1]
  }
  return currentPOS
}

function closestPlayerActionBallX(ballToPlayerX) {
  if (common.isBetween(ballToPlayerX, -30, 30) === false) {
    if (ballToPlayerX > 29) return 29
    return -29
  } return ballToPlayerX
}

function closestPlayerActionBallY(ballToPlayerY) {
  if (common.isBetween(ballToPlayerY, -30, 30) === false) {
    if (ballToPlayerY > 29) return 29
    return -29
  } return ballToPlayerY
}

function checkProvidedAction(matchDetails, thisPlayer, action) {
  const ballActions = [`shoot`, `throughBall`, `pass`, `cross`, `cleared`, `boot`, `penalty`]
  const allActions = [`shoot`, `throughBall`, `pass`, `cross`, `tackle`, `intercept`, `slide`]
  Array.prototype.push.apply(allActions, [`run`, `sprint`, `cleared`, `boot`, `penalty`])
  let providedAction = (thisPlayer.action) ? thisPlayer.action : `unassigned`
  if (providedAction === `none`) return action
  if (allActions.includes(providedAction)) {
    if (thisPlayer.playerID !== matchDetails.ball.Player) {
      if (ballActions.includes(providedAction)) {
        const notice = `${thisPlayer.name} doesnt have the ball so cannot ${providedAction} -action: run`
        console.error(notice)
        return `run`
      } return providedAction
    } else if (providedAction === `tackle` || providedAction === `slide` || providedAction === `intercept`) {
      action = ballActions[common.getRandomNumber(0, 5)]
      const notice = `${thisPlayer.name} has the ball so cannot ${providedAction} -action: ${action}`
      console.error(notice)
      return action
    } return providedAction
  } else if (thisPlayer.action !== `none`) throw new Error(`Invalid player action for ${thisPlayer.name}`)
}

function handleBallPlayerActions(matchDetails, thisPlayer, team, opp, action) {
  const ballActions = [`shoot`, `throughBall`, `pass`, `cross`, `cleared`, `boot`, `penalty`]
  ballMovement.getBallDirection(matchDetails, thisPlayer.currentPOS)
  let tempArray = thisPlayer.currentPOS
  matchDetails.ball.position = tempArray.map(x => x)
  matchDetails.ball.position[2] = 0
  if (ballActions.includes(action)) {
    ballMoved(matchDetails, thisPlayer, team, opp)
    if (action === `cleared` || action === `boot`) {
      let newPosition = ballMovement.ballKicked(matchDetails, team, thisPlayer)
      updateInformation(matchDetails, newPosition)
    } else if (action === `pass`) {
      let newPosition = ballMovement.ballPassed(matchDetails, team, thisPlayer)
      matchDetails.iterationLog.push(`passed to new position: ${newPosition}`)
      updateInformation(matchDetails, newPosition)
    } else if (action === `cross`) {
      let newPosition = ballMovement.ballCrossed(matchDetails, team, thisPlayer)
      matchDetails.iterationLog.push(`crossed to new position: ${newPosition}`)
      updateInformation(matchDetails, newPosition)
    } else if (action === `throughBall`) {
      let newPosition = ballMovement.throughBall(matchDetails, team, thisPlayer)
      updateInformation(matchDetails, newPosition)
    } else if (action === `shoot`) {
      let newPosition = ballMovement.shotMade(matchDetails, team, thisPlayer)
      updateInformation(matchDetails, newPosition)
    } else if (action === `penalty`) {
      let newPosition = ballMovement.penaltyTaken(matchDetails, team, thisPlayer)
      updateInformation(matchDetails, newPosition)
    }
  }
}

function ballMoved(matchDetails, thisPlayer, team, opp) {
  thisPlayer.hasBall = false
  matchDetails.ball.withPlayer = false
  team.intent = `attack`
  opp.intent = `attack`
  matchDetails.ball.Player = ``
  matchDetails.ball.withTeam = ``
}

function updateInformation(matchDetails, newPosition) {
  if (matchDetails.endIteration == true) return
  let tempPosition = newPosition.map(x => x)
  matchDetails.ball.position = tempPosition
  matchDetails.ball.position[2] = 0
}

function getMovement(player, action, opposition, ballX, ballY, matchDetails) {
  const { position } = matchDetails.ball
  const ballActions = [`shoot`, `throughBall`, `pass`, `cross`, `cleared`, `boot`, `penalty`]
  if (action === `wait` || ballActions.includes(action)) return [0, 0]
  else if (action === `tackle` || action === `slide`) {
    return getTackleMovement(ballX, ballY)
  } else if (action === `intercept`) {
    return getInterceptMovement(player, opposition, position, matchDetails.pitchSize)
  } else if (action === `run`) {
    return getRunMovement(matchDetails, player, ballX, ballY)
  } else if (action === `sprint`) {
    return getSprintMovement(matchDetails, player, ballX, ballY)
  }
}

function getTackleMovement(ballX, ballY) {
  let move = [0, 0]
  if (ballX > 0) move[0] = -1
  else if (ballX === 0) move[0] = 0
  else if (ballX < 0) move[0] = 1
  if (ballY > 0) move[1] = -1
  else if (ballY === 0) move[1] = 0
  else if (ballY < 0) move[1] = 1
  return move
}

function getInterceptMovement(player, opposition, ballPosition, pitchSize) {
  let move = [0, 0]
  let intcptPos = getInterceptPosition(player.currentPOS, opposition, ballPosition, pitchSize)
  let intcptPosX = player.currentPOS[0] - intcptPos[0]
  let intcptPosY = player.currentPOS[1] - intcptPos[1]
  if (intcptPosX === 0) {
    if (intcptPosY === 0) move = [0, 0]
    else if (intcptPosY < 0) move = [0, 1]
    else if (intcptPosY > 0) move = [0, -1]
  } else if (intcptPosY === 0) {
    if (intcptPosX < 0) move = [1, 0]
    else if (intcptPosX > 0) move = [-1, 0]
  } else if (intcptPosX < 0 && intcptPosY < 0) move = [1, 1]
  else if (intcptPosX > 0 && intcptPosY > 0) move = [-1, -1]
  else if (intcptPosX > 0 && intcptPosY < 0) move = [-1, 1]
  else if (intcptPosX < 0 && intcptPosY > 0) move = [1, -1]
  return move
}

function getInterceptPosition(currentPOS, opposition, ballPosition, pitchSize) {
  let BallPlyTraj = getInterceptTrajectory(opposition, ballPosition, pitchSize)
  let intcptPos = getClosestTrajPosition(currentPOS, BallPlyTraj, false)
  if (JSON.stringify(intcptPos) === JSON.stringify(currentPOS)) {
    let index = getClosestTrajPosition(currentPOS, BallPlyTraj, true)
    if (index > 0) return BallPlyTraj[getClosestTrajPosition(currentPOS, BallPlyTraj, true) - 1]
  }
  return intcptPos
}

function getClosestTrajPosition(playerPos, BallPlyTraj, getIndex) {
  let intcptPos = []
  let theDiff = 10000000
  let index = 0
  for (let thisPos of BallPlyTraj) {
    let xDiff = Math.abs(playerPos[0] - thisPos[0])
    let yDiff = Math.abs(playerPos[1] - thisPos[1])
    let totalDiff = xDiff + yDiff
    if (totalDiff < theDiff) {
      theDiff = totalDiff
      intcptPos = thisPos
    }
    if (JSON.stringify(thisPos) == JSON.stringify(playerPos) && getIndex) return index
    index++
  }
  return intcptPos
}

function getInterceptTrajectory(opposition, ballPosition, pitchSize) {
  let [pitchWidth, pitchHeight] = pitchSize
  let playerInformation = setPositions.closestPlayerToPosition(`name`, opposition, ballPosition)
  let interceptPlayer = playerInformation.thePlayer
  let targetX = pitchWidth / 2
  let targetY = (interceptPlayer.originPOS[1] < pitchHeight / 2) ? pitchHeight : 0
  let moveX = targetX - interceptPlayer.currentPOS[0]
  let moveY = targetY - interceptPlayer.currentPOS[1]
  let highNum = (Math.abs(moveX) <= Math.abs(moveY)) ? Math.abs(moveY) : Math.abs(moveX)
  let xDiff = moveX / highNum
  let yDiff = moveY / highNum
  let POI = []
  POI.push(interceptPlayer.currentPOS)
  for (let i of new Array(Math.round(highNum))) {
    let lastArrayPOS = POI.length - 1
    let lastXPOS = POI[lastArrayPOS][0]
    let lastYPOS = POI[lastArrayPOS][1]
    POI.push([common.round(lastXPOS + xDiff, 0), common.round(lastYPOS + yDiff, 0)])
  }
  return POI
}

// ===========================================================================
// 跑动速度 ← 敏捷 (agility → off-ball stride)
// ===========================================================================
// The original engine gave every player the same fixed stride (run ±1, sprint
// ±2) regardless of agility, so a 95-agility winger and a 40-agility
// centre-back covered identical ground. We scale the off-ball stride by
// agility so faster players visibly outpace slower ones.
//
//   agility < 55           → slow   (run ±1, sprint ±1)
//   55 ≤ agility < 85      → normal (run ±1, sprint ±2)  [original behaviour]
//   agility ≥ 85           → fast   (run ±2, sprint ±3)

function runStepArray(player) {
  const agility = parseInt(player?.skill?.agility, 10)
  if (Number.isFinite(agility) && agility >= 85) return [-2, 0, 2]
  return [-1, 0, 1]
}

function sprintStepArray(player) {
  const agility = parseInt(player?.skill?.agility, 10)
  if (Number.isFinite(agility) && agility >= 85) return [-3, -2, 0, 2, 3]
  if (Number.isFinite(agility) && agility < 55) return [-1, -1, 0, 1, 1]
  return [-2, -1, 0, 1, 2]
}

// ===========================================================================
// 红牌罚下 (sending off) — keep sent-off players at ['NP','NP'] every tick
// ===========================================================================
// Set-piece routines (free kicks, corners, throw-ins, goal kicks) reposition
// every player and would otherwise resurrect a red-carded player. We record
// the sent-off playerID and re-apply the 'NP' marker at the end of each tick.

function _sendOff(matchDetails, player) {
  player.currentPOS = ['NP', 'NP']
  if (!matchDetails._sentOff) matchDetails._sentOff = []
  if (!matchDetails._sentOff.includes(player.playerID)) matchDetails._sentOff.push(player.playerID)
}

export function reapplySentOff(matchDetails) {
  const sent = matchDetails?._sentOff
  if (!sent || sent.length === 0) return matchDetails
  for (const team of [matchDetails.kickOffTeam, matchDetails.secondTeam]) {
    if (!team?.players) continue
    for (const p of team.players) {
      if (sent.includes(p.playerID)) p.currentPOS = ['NP', 'NP']
    }
  }
  return matchDetails
}

// ===========================================================================
// 盯防 (marking) — assign isMarked to pass receivers each tick
// ===========================================================================
// ballMovement's pass/through-ball AI already READS `player.isMarked`
// (marked receivers get a lower target score and a shorter reachable radius),
// but nothing ever SET it, so the marking mechanic was dead code. This runs
// once per tick (after movement, before ball actions) to decide who is being
// tightly marked by the opposition.
//
// Marking duel: marker's positioning (tackling + agility) vs receiver's
// agility to lose them. Even matchup → ~50% marked; a marker 20 points better
// is almost always on them.

export function assignMarking(matchDetails) {
  _clearMarking(matchDetails.kickOffTeam)
  _clearMarking(matchDetails.secondTeam)
  _markReceivers(matchDetails.kickOffTeam, matchDetails.secondTeam)
  _markReceivers(matchDetails.secondTeam, matchDetails.kickOffTeam)
  return matchDetails
}

function _clearMarking(team) {
  for (const p of team.players) {
    if (p.currentPOS[0] === 'NP') continue
    p.isMarked = false
  }
}

function _markReceivers(receivers, markers) {
  const MARK_RADIUS = 32
  for (const receiver of receivers.players) {
    if (receiver.injured) continue
    if (receiver.position === 'GK') continue
    if (receiver.hasBall) continue
    if (receiver.currentPOS[0] === 'NP') continue
    let closest = null
    let closestDist = Infinity
    for (const marker of markers.players) {
      if (marker.injured) continue
      if (marker.position === 'GK') continue
      if (marker.currentPOS[0] === 'NP') continue
      const d = common.distance(marker.currentPOS, receiver.currentPOS)
      if (d < closestDist) { closestDist = d; closest = marker }
    }
    if (!closest || closestDist > MARK_RADIUS) continue
    const markAbility = (parseInt(closest.skill.tackling, 10) + parseInt(closest.skill.agility, 10)) / 2
    const escapeAbility = parseInt(receiver.skill.agility, 10)
    const margin = markAbility - escapeAbility
    if (common.getRandomNumber(-10, 10) < margin) receiver.isMarked = true
  }
}

function getRunMovement(matchDetails, player, ballX, ballY) {
  let move = [0, 0]

  // P4.5: Tactical movement modifiers
  const teamStr = _resolveTeamStrategy(matchDetails, player);
  const modifiers = getMovementModifiers(player, teamStr, {
    ballPossession: matchDetails.ball?.withPlayer
      ? (matchDetails.ball?.withTeam === matchDetails.kickOffTeam?.teamID ? 'home' : 'away')
      : 'loose',
    ball: matchDetails.ball?.position,
  });

  // Apply stamina drain from modifiers
  if (player.fitness > 20) {
    player.fitness = common.round(player.fitness - (0.005 * modifiers.staminaDrain), 6);
  }
  let side = (player.originPOS[1] > matchDetails.pitchSize[1] / 2) ? `bottom` : `top`
  // Position-group-differentiated dribbling: attackers more aggressive
  const attSpeed = isAttackingPosition(player.position) ? 1 : 0

  // Apply forwardRuns modifier to attacking direction bias
  const fwdBias = modifiers.forwardRuns;

  if (player.hasBall && side == `bottom`) return [common.getRandomNumber(0 + attSpeed, 2 + attSpeed), common.getRandomNumber(0, 2)]
  if (player.hasBall && side == `top`) return [common.getRandomNumber(-2 - attSpeed, 0 - attSpeed), common.getRandomNumber(-2, 0)]
  let movementRun = runStepArray(player)
  // Position-group-differentiated off-ball: defensive players less aggressive forward runs
  const runBias = isDefensivePosition(player.position) ? 1 : 0  // defensive players pick middle index more

  // Apply roamFromPosition — more roaming = wider random range
  if (modifiers.roamFromPosition > 1.0) {
    movementRun = [-2, -1, 0, 1, 2]; // expanded movement options
  }

  if (common.isBetween(ballX, -60, 60) && common.isBetween(ballY, -60, 60)) {
    if (common.isBetween(ballX, -60, 0)) move[0] = movementRun[common.getRandomNumber(2 - runBias, 2)]
    else if (common.isBetween(ballX, 0, 60)) move[0] = movementRun[common.getRandomNumber(0, 0 + runBias)]
    else move[0] = movementRun[common.getRandomNumber(1, 1)]
    if (common.isBetween(ballY, -60, 0)) move[1] = movementRun[common.getRandomNumber(2 - runBias, 2)]
    else if (common.isBetween(ballY, 0, 60)) move[1] = movementRun[common.getRandomNumber(0, 0 + runBias)]
    else move[1] = movementRun[common.getRandomNumber(1, 1)]
    return move
  }
  let formationDirection = setPositions.formationCheck(player.intentPOS, player.currentPOS)

  // Apply forwardRuns: amplify forward direction preference
  const fwdIdxY = formationDirection[1] === 0 ? 1 :
    formationDirection[1] < 0 ? 2 - Math.round(fwdBias * 0.5) : 1 + Math.round(fwdBias * 0.5);

  if (formationDirection[0] === 0) move[0] = movementRun[common.getRandomNumber(1, 1)]
  else if (formationDirection[0] < 0) move[0] = movementRun[common.getRandomNumber(0, 1)]
  else if (formationDirection[0] > 0) move[0] = movementRun[common.getRandomNumber(1, 2)]
  if (formationDirection[1] === 0) move[1] = movementRun[common.getRandomNumber(1, 1)]
  else if (formationDirection[1] < 0) move[1] = movementRun[common.getRandomNumber(
    Math.max(0, 2 - Math.round(fwdBias)),
    Math.min(2, 2)
  )]
  else if (formationDirection[1] > 0) move[1] = movementRun[common.getRandomNumber(
    0,
    Math.min(2, Math.round(fwdBias))
  )]

  // Apply stayWide / cutInside to X axis movement
  if (modifiers.stayWide > 1.0 || modifiers.cutInside > 1.0) {
    const centerX = matchDetails.pitchSize[0] / 2;
    const offsetFromCenter = player.currentPOS[0] - centerX;
    if (Math.abs(offsetFromCenter) > 100) { // only apply to wide players
      if (modifiers.stayWide > 1.0 && Math.abs(offsetFromCenter) > 0) {
        // pull wider: move away from center
        move[0] += offsetFromCenter > 0 ? 0 : 0; // stayWide keeps wide position — don't counteract
      }
      if (modifiers.cutInside > 1.0) {
        // pull inside: move toward center
        move[0] += offsetFromCenter > 0 ? -1 : 1;
      }
    }
  }

  return move
}

function getSprintMovement(matchDetails, player, ballX, ballY) {
  let move = [0, 0]

  // P4.5: Tactical movement modifiers
  const teamStr = _resolveTeamStrategy(matchDetails, player);
  const modifiers = getMovementModifiers(player, teamStr, {
    ballPossession: matchDetails.ball?.withPlayer
      ? (matchDetails.ball?.withTeam === matchDetails.kickOffTeam?.teamID ? 'home' : 'away')
      : 'loose',
    ball: matchDetails.ball?.position,
  });

  // Apply stamina drain from modifiers
  if (player.fitness > 30) {
    player.fitness = common.round(player.fitness - (0.01 * modifiers.staminaDrain), 6);
  }
  let side = (player.originPOS[1] > matchDetails.pitchSize[1] / 2) ? `bottom` : `top`
  // Position-group-differentiated sprint: attackers more aggressive, wide players wider
  const attBoost = isAttackingPosition(player.position) ? 1 : 0
  const wideBoost = isWidePosition(player.position) ? 1 : 0
  // P4.5: Apply forwardRuns modifier to sprint aggressiveness
  const fwdBoost = Math.round((modifiers.forwardRuns - 1.0) * 2);
  if (player.hasBall && side == `bottom`) return [
    common.getRandomNumber(-4 - wideBoost, 4 + wideBoost),
    common.getRandomNumber(-4 - attBoost - fwdBoost, -2 - fwdBoost)
  ]
  if (player.hasBall && side == `top`) return [
    common.getRandomNumber(-4 - wideBoost, 4 + wideBoost),
    common.getRandomNumber(2 + fwdBoost, 4 + attBoost + fwdBoost)
  ]
  let movementSprint = sprintStepArray(player)
  // Defensive players: smaller sprints closer to formation
  const defBias = isDefensivePosition(player.position) ? 1 : 0

  // Apply roamFromPosition — more roaming = wider sprint options
  if (modifiers.roamFromPosition > 1.0) {
    movementSprint = [-3, -2, -1, 0, 1, 2, 3];
  }

  if (common.isBetween(ballX, -60, 60) && common.isBetween(ballY, -60, 60)) {
    if (common.isBetween(ballX, -60, 0)) move[0] = movementSprint[common.getRandomNumber(3 - defBias, 4)]
    else if (common.isBetween(ballX, 0, 60)) move[0] = movementSprint[common.getRandomNumber(0, 1 + defBias)]
    else move[0] = movementSprint[common.getRandomNumber(2, 2)]
    if (common.isBetween(ballY, -60, 0)) move[1] = movementSprint[common.getRandomNumber(3 - defBias, 4)]
    else if (common.isBetween(ballY, 0, 60)) move[1] = movementSprint[common.getRandomNumber(0, 1 + defBias)]
    else move[1] = movementSprint[common.getRandomNumber(2, 2)]
    return move
  }
  let formationDirection = setPositions.formationCheck(player.intentPOS, player.currentPOS)

  // Apply forwardRuns modifier — more forward movement toward goal
  const fwdIdx = Math.round((modifiers.forwardRuns - 1.0) * 2); // -2 to +2 adjustment
  if (formationDirection[0] === 0) move[0] = movementSprint[common.getRandomNumber(2, 2)]
  else if (formationDirection[0] < 0) move[0] = movementSprint[common.getRandomNumber(
    Math.max(0, 0 + defBias - fwdIdx),
    Math.min(movementSprint.length - 1, 2)
  )]
  else if (formationDirection[0] > 0) move[0] = movementSprint[common.getRandomNumber(
    Math.max(0, 2),
    Math.min(movementSprint.length - 1, 4 - defBias + fwdIdx)
  )]
  if (formationDirection[1] === 0) move[1] = movementSprint[common.getRandomNumber(2, 2)]
  else if (formationDirection[1] < 0) move[1] = movementSprint[common.getRandomNumber(
    Math.max(0, 0 + defBias - fwdIdx),
    Math.min(movementSprint.length - 1, 2)
  )]
  else if (formationDirection[1] > 0) move[1] = movementSprint[common.getRandomNumber(
    Math.max(0, 2),
    Math.min(movementSprint.length - 1, 4 - defBias + fwdIdx)
  )]

  // Apply stayWide / cutInside to X axis during sprint
  if (modifiers.stayWide > 1.0 || modifiers.cutInside > 1.0) {
    const centerX = matchDetails.pitchSize[0] / 2;
    const offsetFromCenter = player.currentPOS[0] - centerX;
    if (Math.abs(offsetFromCenter) > 100) {
      if (modifiers.cutInside > 1.0) {
        move[0] += offsetFromCenter > 0 ? -1 : 1;
      }
    }
  }

  return move
}

function closestPlayerToBall(closestPlayer, team, matchDetails) {
  let closestPlayerDetails
  let { position } = matchDetails.ball
  for (let thisPlayer of team.players) {
    let ballToPlayerX = Math.abs(thisPlayer.currentPOS[0] - position[0])
    let ballToPlayerY = Math.abs(thisPlayer.currentPOS[1] - position[1])
    let proximityToBall = ballToPlayerX + ballToPlayerY
    if (proximityToBall < closestPlayer.position) {
      closestPlayer.name = thisPlayer.name
      closestPlayer.position = proximityToBall
      closestPlayerDetails = thisPlayer
    }
  }

  setPositions.setIntentPosition(matchDetails, closestPlayerDetails)
  matchDetails.iterationLog.push(`Closest Player to ball: ${closestPlayerDetails.name}`)
}

function checkOffside(team1, team2, matchDetails) {
  const { ball } = matchDetails
  const { pitchSize } = matchDetails
  const team1side = (team1.players[0].originPOS[1] < (pitchSize[1] / 2)) ? `top` : `bottom`
  if (ball.withTeam == false) return matchDetails
  if (team1side == `bottom`) {
    team1atBottom(team1, team2, pitchSize[1])
  } else {
    team1atTop(team1, team2, pitchSize[1])
  }
}

function getTopMostPlayer(team, pitchHeight) {
  let player
  for (let thisPlayer of team.players) {
    let topMostPosition = pitchHeight
    let [, plyrX] = thisPlayer.currentPOS
    if (thisPlayer.currentPOS[1] < topMostPosition) {
      topMostPosition = plyrX
      player = thisPlayer
    }
  }
  return player
}

function getBottomMostPlayer(team) {
  let player
  for (let thisPlayer of team.players) {
    let topMostPosition = 0
    let [, plyrX] = thisPlayer.currentPOS
    if (thisPlayer.currentPOS[1] > topMostPosition) {
      topMostPosition = plyrX
      player = thisPlayer
    }
  }
  return player
}

function team1atBottom(team1, team2, pitchHeight) {
  let offT1Ypos = offsideYPOS(team2, `top`, pitchHeight)
  let topPlayer = getTopMostPlayer(team1, pitchHeight)
  let topPlayerOffsidePosition = common.isBetween(topPlayer.currentPOS[1], offT1Ypos.pos1, offT1Ypos.pos2)
  if (topPlayerOffsidePosition && topPlayer.hasBall) return
  for (let thisPlayer of team1.players) {
    thisPlayer.offside = false
    if (common.isBetween(thisPlayer.currentPOS[1], offT1Ypos.pos1, offT1Ypos.pos2)) {
      if (!thisPlayer.hasBall) thisPlayer.offside = true
    }
  }
  let offT2Ypos = offsideYPOS(team1, `bottom`, pitchHeight)
  let btmPlayer = getBottomMostPlayer(team2)
  let btmPlayerOffsidePosition = common.isBetween(btmPlayer.currentPOS[1], offT2Ypos.pos2, offT2Ypos.pos1)
  if (btmPlayerOffsidePosition && btmPlayer.hasBall) return
  for (let thisPlayer of team2.players) {
    thisPlayer.offside = false
    if (common.isBetween(thisPlayer.currentPOS[1], offT2Ypos.pos2, offT2Ypos.pos1)) {
      if (!thisPlayer.hasBall) thisPlayer.offside = true
    }
  }
}

function team1atTop(team1, team2, pitchHeight) {
  let offT1Ypos = offsideYPOS(team2, `bottom`, pitchHeight)
  let btmPlayer = getBottomMostPlayer(team1)
  let btmPlayerOffsidePosition = common.isBetween(btmPlayer.currentPOS[1], offT1Ypos.pos2, offT1Ypos.pos1)
  if (btmPlayerOffsidePosition && btmPlayer.hasBall) return
  for (let thisPlayer of team1.players) {
    thisPlayer.offside = false
    if (common.isBetween(thisPlayer.currentPOS[1], offT1Ypos.pos2, offT1Ypos.pos1)) {
      if (!thisPlayer.hasBall) thisPlayer.offside = true
    }
  }
  let offT2Ypos = offsideYPOS(team1, `top`, pitchHeight)
  let topPlayer = getTopMostPlayer(team2, pitchHeight)
  let topPlayerOffsidePosition = common.isBetween(topPlayer.currentPOS[1], offT2Ypos.pos1, offT2Ypos.pos2)
  if (topPlayerOffsidePosition && topPlayer.hasBall) return
  for (let thisPlayer of team2.players) {
    thisPlayer.offside = false
    if (common.isBetween(thisPlayer.currentPOS[1], offT2Ypos.pos1, offT2Ypos.pos2)) {
      if (!thisPlayer.hasBall) thisPlayer.offside = true
    }
  }
}

function offsideYPOS(team, side, pitchHeight) {
  let offsideYPOS = {
    'pos1': 0,
    'pos2': pitchHeight / 2
  }
  for (let thisPlayer of team.players) {
    if (getPositionGroup(thisPlayer.position) === 'GK') {
      let [, position1] = thisPlayer.currentPOS
      offsideYPOS.pos1 = position1
      if (thisPlayer.hasBall) {
        offsideYPOS.pos2 = position1
        return offsideYPOS
      }
    } else if (side == `top`) {
      if (thisPlayer.currentPOS[1] < offsideYPOS.pos2) {
        let [, position2] = thisPlayer.currentPOS
        offsideYPOS.pos2 = position2
      }
    } else if (thisPlayer.currentPOS[1] > offsideYPOS.pos2) {
      let [, position2] = thisPlayer.currentPOS
      offsideYPOS.pos2 = position2
    }
  }
  return offsideYPOS
}

export {
  decideMovement,
  getMovement,
  closestPlayerToBall,
  closestPlayerActionBallX,
  closestPlayerActionBallY,
  setClosePlayerTakesBall,
  team1atBottom,
  team1atTop,
  handleBallPlayerActions,
  updateInformation,
  ballMoved,
  getSprintMovement,
  getRunMovement,
  checkProvidedAction,
  checkOffside,
  completeSlide,
  movePlayers,
  executeBallAction
}

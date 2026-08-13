//------------------------
//    NPM Modules
//------------------------
import * as common from './lib/common.js'
import * as setPositions from './lib/setPositions.js'
import * as setVariables from './lib/setVariables.js'
import * as playerMovement from './lib/playerMovement.js'
import * as ballMovement from './lib/ballMovement.js'
import * as validate from './lib/validate.js'
import * as actions from './lib/actions.js'

//------------------------
//    Functions
//------------------------
async function initiateGame(team1, team2, pitchDetails) {
  validate.validateArguments(team1, team2, pitchDetails)
  validate.validateTeam(team1)
  validate.validateTeam(team2)
  validate.validatePitch(pitchDetails)
  let matchDetails = setVariables.populateMatchDetails(team1, team2, pitchDetails)
  let kickOffTeam = setVariables.setGameVariables(matchDetails.kickOffTeam)
  let secondTeam = setVariables.setGameVariables(matchDetails.secondTeam)
  kickOffTeam = setVariables.koDecider(kickOffTeam, matchDetails)
  matchDetails.iterationLog.push(`Team to kick off - ${kickOffTeam.name}`)
  matchDetails.iterationLog.push(`Second team - ${secondTeam.name}`)
  setPositions.switchSide(matchDetails, secondTeam)
  matchDetails.kickOffTeam = kickOffTeam
  matchDetails.secondTeam = secondTeam
  return matchDetails
}

async function playIteration(matchDetails) {
  let closestPlayerA = {
    'name': '',
    'position': 100000
  }
  let closestPlayerB = {
    'name': '',
    'position': 100000
  }
  validate.validateMatchDetails(matchDetails)
  validate.validateTeamSecondHalf(matchDetails.kickOffTeam)
  validate.validateTeamSecondHalf(matchDetails.secondTeam)
  validate.validatePlayerPositions(matchDetails)
  matchDetails.iterationLog = []
  matchDetails.iterationLog.push(`Ball start position: ${matchDetails.ball.position}`)
  let { kickOffTeam, secondTeam } = matchDetails
  common.matchInjury(matchDetails, kickOffTeam)
  common.matchInjury(matchDetails, secondTeam)
  matchDetails = ballMovement.moveBall(matchDetails)
  if (matchDetails.endIteration == true) {
    delete matchDetails.endIteration
    playerMovement.reapplySentOff(matchDetails)
    return matchDetails
  }
  playerMovement.closestPlayerToBall(closestPlayerA, kickOffTeam, matchDetails)
  playerMovement.closestPlayerToBall(closestPlayerB, secondTeam, matchDetails)
  let koTeamMoves = playerMovement.decideMovement(closestPlayerA, kickOffTeam, secondTeam, matchDetails)
  let stMoves = playerMovement.decideMovement(closestPlayerB, secondTeam, kickOffTeam, matchDetails)
  let koTeamMovesBallMoves = actions.extractBallActions(koTeamMoves, 'ball')
  let koTeamAllOtherMoves = actions.extractBallActions(koTeamMoves, 'movement')
  let stMovesBallMoves = actions.extractBallActions(stMoves, 'ball')
  let stAllOtherMoves = actions.extractBallActions(stMoves, 'movement')
  matchDetails.kickOffTeam = playerMovement.movePlayers(koTeamAllOtherMoves, kickOffTeam, secondTeam, matchDetails)
  matchDetails.secondTeam = playerMovement.movePlayers(stAllOtherMoves, secondTeam, kickOffTeam, matchDetails)

  // 盯防: assign isMarked before ball actions so the pass/through-ball AI
  // (ballMovement.passScoreOption / tballScoreOption) prefers unmarked receivers.
  playerMovement.assignMarking(matchDetails)

  let allBallMoves = [...koTeamMovesBallMoves, ...stMovesBallMoves]
  let validBallMoves = allBallMoves.filter(m => m.player.hasBall === true)
  if (validBallMoves.length > 0) {
    const chosenMove = validBallMoves[common.getRandomNumber(0, validBallMoves.length - 1)]
    const { player } = chosenMove
    let team, opp
    if (player.teamID === kickOffTeam.teamID) {
      team = kickOffTeam
      opp = secondTeam
    } else {
      team = secondTeam
      opp = kickOffTeam
    }
    if (team.teamID === kickOffTeam.teamID) {
      matchDetails.kickOffTeam = playerMovement.executeBallAction(chosenMove, team, opp, matchDetails)
    } else {
      matchDetails.secondTeam = playerMovement.executeBallAction(chosenMove, team, opp, matchDetails)
    }
  }
  if (matchDetails.ball.ballOverIterations.length == 0 || matchDetails.ball.withTeam != '') {
    playerMovement.checkOffside(kickOffTeam, secondTeam, matchDetails)
  }
  matchDetails.iterationLog.push(`Ball end position: ${matchDetails.ball.position}`)
  playerMovement.reapplySentOff(matchDetails)
  return matchDetails
}

async function startSecondHalf(matchDetails) {
  validate.validateMatchDetails(matchDetails)
  validate.validateTeamSecondHalf(matchDetails.kickOffTeam)
  validate.validateTeamSecondHalf(matchDetails.secondTeam)
  validate.validatePlayerPositions(matchDetails)
  let { kickOffTeam, secondTeam } = matchDetails
  setPositions.switchSide(matchDetails, kickOffTeam)
  setPositions.switchSide(matchDetails, secondTeam)
  common.removeBallFromAllPlayers(matchDetails)
  setVariables.resetPlayerPositions(matchDetails)
  setPositions.setBallSpecificGoalScoreValue(matchDetails, matchDetails.secondTeam)
  matchDetails.iterationLog = [`Second Half Started: ${matchDetails.secondTeam.name} to kick offs`]
  matchDetails.kickOffTeam.intent = `defend`
  matchDetails.secondTeam.intent = `attack`
  matchDetails.half++
  playerMovement.reapplySentOff(matchDetails)
  return matchDetails
}

export {
  initiateGame,
  playIteration,
  startSecondHalf
}

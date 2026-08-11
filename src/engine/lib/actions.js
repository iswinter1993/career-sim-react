import * as common from './common.js'
import * as setPositions from './setPositions.js'
import { getPositionGroup, isDefensivePosition, isMidfieldPosition, isAttackingPosition, isWidePosition } from './positionGroup.js'
import { getRoleModifier, evaluateTraits } from './tactics.js'

// ===========================================================================
// THREE-LAYER AI — Action Score Equation (P4.4)
// ===========================================================================
//
// Event Score = PlayerGrade + PositionAbility + M(L) + AC
//
// We inject role/trait/strategy modifiers into the action weight array before
// normalisation, modifying the relative probability of each action.

/**
 * Calculate the tactical modifier for a single action.
 * Multiplies Layer 2 (role), Layer 3 (traits), and Layer 1 (team strategy).
 *
 * @param {object} player — engine player with .role, .traits
 * @param {string} actionName — 'shoot', 'pass', 'tackle', …
 * @param {object} matchState — { ball, ballPossession, scenario, freeKickDistance, iteration }
 * @param {object} teamStrategy — team._strategy (from applyTeamStrategy)
 * @returns {number} multiplier (1.0 = no modification)
 */
export function calculateModifiedActionWeight(player, actionName, matchState, teamStrategy) {
  if (!player) return 1.0;

  let modifier = 1.0;

  // --- Layer 2: Role modifier ---
  if (player.role) {
    const role = getRoleModifier(player.role);
    const roleMod = role.actionModifiers?.[actionName];
    if (roleMod !== undefined) {
      modifier *= roleMod;
    }
  }

  // --- Layer 3: Trait modifier (additive, applied as multiplier) ---
  if (player.traits && player.traits.length > 0) {
    const traitEffects = evaluateTraits(player, matchState);
    const traitVal = traitEffects.actionModifiers?.[actionName];
    if (traitVal !== undefined) {
      // traitVal is additive delta (e.g. +0.3 for throughBall with killer balls)
      // convert to multiplier: 1.0 + delta
      modifier *= (1.0 + traitVal);
    }
  }

  // --- Layer 1: Team Strategy modifier ---
  if (teamStrategy) {
    switch (actionName) {
      case 'pass':
        modifier *= (teamStrategy._passingWeights?.short || 1.0);
        break;
      case 'throughBall':
        modifier *= (teamStrategy._passingWeights?.through || 1.0);
        break;
      case 'boot':
      case 'cleared':
        modifier *= (teamStrategy._passingWeights?.long || 1.0);
        break;
      case 'shoot':
        modifier *= (teamStrategy._tempoMultiplier?.pace || 1.0);
        break;
      case 'sprint':
        modifier *= (teamStrategy._tempoMultiplier?.pace || 1.0);
        break;
      case 'tackle':
      case 'slide':
        modifier *= (teamStrategy._pressingMultiplier || 1.0);
        break;
    }
  }

  // Clamp to prevent degenerate 0 or absurdly high weights
  return Math.max(0.05, Math.min(3.0, modifier));
}

/**
 * Get all action weight modifiers for a player at once.
 * @param {object} player
 * @param {object} matchState
 * @param {object} teamStrategy
 * @returns {{[actionName]: number}}
 */
export function getModifiedActionWeights(player, matchState, teamStrategy) {
  const actionNames = [
    'shoot', 'throughBall', 'pass', 'cross', 'tackle',
    'intercept', 'slide', 'run', 'sprint', 'cleared', 'boot',
  ];
  const weights = {};
  for (const action of actionNames) {
    weights[action] = calculateModifiedActionWeight(player, action, matchState, teamStrategy);
  }
  return weights;
}

/**
 * Build the matchState object that traits and conditions need.
 * Call this before evaluateTraits or calculateModifiedActionWeight.
 *
 * @param {object} matchDetails — current engine match state
 * @param {number[]} ball — ball coordinates [x, y]
 * @param {object} player — the evaluating player
 * @returns {object} matchState suitable for evaluateTraits()
 */
export function buildActionMatchState(matchDetails, ball, player) {
  const ballX = ball?.[0] || 0;
  const ballY = ball?.[1] || 0;
  const ballPossession = matchDetails.ball?.withPlayer
    ? (matchDetails.ball?.withTeam === matchDetails.kickOffTeam?.teamID ? 'home' : 'away')
    : 'loose';
  return {
    ball: [ballX, ballY],
    ballPossession,
    scenario: matchDetails.ball?.withPlayer === false ? 'loose' : 'possession',
    freeKickDistance: matchDetails._freeKickDistance || 0,
    iteration: matchDetails._halfIteration || 0,
  };
}

/**
 * Apply tactical modifiers to an action weight array (11-element array).
 * Modifies the array in-place by multiplying each action's raw score
 * by its calculated modifier.
 *
 * Index mapping:
 *   0=shoot, 1=throughBall, 2=pass, 3=cross, 4=tackle,
 *   5=intercept, 6=slide, 7=run, 8=sprint, 9=cleared, 10=boot
 *
 * @param {number[]} weightArray — raw action scores (will be mutated)
 * @param {object} player — engine player
 * @param {object} matchDetails — current match state
 * @param {object} teamStr — team._strategy (optional)
 */
export function applyTacticalModifiers(weightArray, player, matchDetails, teamStr) {
  if (!weightArray || !player) return weightArray;
  const matchState = buildActionMatchState(matchDetails, [0, 0], player);
  const modifiedWeights = getModifiedActionWeights(player, matchState, teamStr);
  const indices = [
    'shoot', 'throughBall', 'pass', 'cross', 'tackle',
    'intercept', 'slide', 'run', 'sprint', 'cleared', 'boot',
  ];
  for (let i = 0; i < indices.length; i++) {
    const mod = modifiedWeights[indices[i]];
    if (mod !== undefined && mod !== 1.0) {
      weightArray[i] = Math.round(weightArray[i] * mod);
    }
  }
  return weightArray;
}

function selectAction(possibleActions) {
  let goodActions = []
  for (const thisAction of possibleActions) {
    let tempArray = Array(thisAction.points).fill(thisAction.name)
    goodActions = goodActions.concat(tempArray)
  }
  if (goodActions[0] == null) return 'wait'
  return goodActions[common.getRandomNumber(0, goodActions.length - 1)]
}

function findPossActions(player, team, opposition, ballX, ballY, matchDetails) {
  let possibleActions = populateActionsJSON()
  const [, pitchHeight] = matchDetails.pitchSize
  let params = []
  let {
    hasBall, originPOS
  } = player
  const ballZ = matchDetails.ball.position[2] || 0
  if (hasBall === false) params = playerDoesNotHaveBall(player, ballX, ballY, ballZ, matchDetails)
  else if (originPOS[1] > (pitchHeight / 2)) params = bottomTeamPlayerHasBall(matchDetails, player, team, opposition)
  else params = topTeamPlayerHasBall(matchDetails, player, team, opposition)

  // P4.4: Apply three-layer AI tactical modifiers (role + traits + strategy)
  const teamStr = team._strategy || matchDetails._homeStrategy || matchDetails._awayStrategy || null;
  applyTacticalModifiers(params, player, matchDetails, teamStr);

  return populatePossibleActions(possibleActions, player, matchDetails, ...params)
}

function topTeamPlayerHasBall(matchDetails, player, team, opposition) {
  let playerInformation = setPositions.closestPlayerToPosition(player, opposition, player.currentPOS)
  const [pitchWidth, pitchHeight] = matchDetails.pitchSize
  let {
    position, currentPOS, skill
  } = player
  if (getPositionGroup(position) === 'GK' && oppositionNearPlayer(playerInformation, 10, 25)) return [0, 0, 10, 0, 0, 0, 0, 10, 0, 40, 40]
  else if (getPositionGroup(position) === 'GK') return [0, 0, 50, 0, 0, 0, 0, 10, 0, 20, 20]
  else if (onBottomCornerBoundary(currentPOS, pitchWidth, pitchHeight)) return [0, 0, 20, 80, 0, 0, 0, 0, 0, 0, 0]
  else if (checkPositionInBottomPenaltyBox(currentPOS, pitchWidth, pitchHeight)) {
    return topTeamPlayerHasBallInBottomPenaltyBox(matchDetails, player, team, opposition)
  } else if (common.isBetween(currentPOS[1], pitchHeight - (pitchHeight / 3), (pitchHeight - (pitchHeight / 6) + 5))) {
    if (oppositionNearPlayer(playerInformation, 10, 10)) return [30, 20, 20, 10, 0, 0, 0, 20, 0, 0, 0]
    return [70, 10, 10, 0, 0, 0, 0, 10, 0, 0, 0]
  } else if (common.isBetween(currentPOS[1], (pitchHeight / 3), (pitchHeight - (pitchHeight / 3)))) {
    if (oppositionNearPlayer(playerInformation, 10, 10)) return [0, 20, 30, 20, 0, 0, 20, 0, 0, 0, 10]
    else if (skill.shooting > 85) return [10, 10, 30, 0, 0, 0, 50, 0, 0, 0, 0]
    else if (getPositionGroup(position) === 'CM' || getPositionGroup(position) === 'WM') return [0, 10, 10, 10, 0, 0, 0, 30, 40, 0, 0]
    else if (getPositionGroup(position) === 'DM') return [0, 5, 30, 5, 0, 0, 0, 30, 30, 0, 0]
    else if (getPositionGroup(position) === 'ST') return [0, 0, 0, 0, 0, 0, 0, 50, 50, 0, 0]
    else if (position === 'CAM') return [15, 20, 30, 5, 0, 0, 0, 15, 15, 0, 0]
    else if (getPositionGroup(position) === 'WG') return [5, 10, 10, 30, 0, 0, 0, 20, 25, 0, 0]
    return [0, 0, 10, 0, 0, 0, 0, 60, 20, 0, 10]
  } else if (oppositionNearPlayer(playerInformation, 10, 10)) return [0, 0, 0, 0, 0, 0, 0, 10, 0, 70, 20]
  else if (getPositionGroup(position) === 'CM' || getPositionGroup(position) === 'WM') return [0, 0, 30, 0, 0, 0, 0, 30, 40, 0, 0]
  else if (getPositionGroup(position) === 'DM') return [0, 0, 40, 0, 0, 0, 0, 20, 20, 10, 10]
  else if (position === 'CAM') return [0, 0, 20, 0, 0, 0, 0, 30, 30, 20, 0]
  else if (getPositionGroup(position) === 'WG') return [0, 0, 20, 20, 0, 0, 0, 30, 30, 0, 0]
  else if (position === 'ST') return [0, 0, 0, 0, 0, 0, 0, 50, 50, 0, 0]
  return [0, 0, 40, 0, 0, 0, 0, 30, 0, 20, 10]
}

function topTeamPlayerHasBallInBottomPenaltyBox(matchDetails, player, team, opposition) {
  let playerInformation = setPositions.closestPlayerToPosition(player, opposition, player.currentPOS)
  let ownPlayerInformation = setPositions.closestPlayerToPosition(player, team, player.currentPOS)
  let tmateProximity = [Math.abs(ownPlayerInformation.proxPOS[0]), Math.abs(ownPlayerInformation.proxPOS[1])]
  let closePlayerPosition = playerInformation.thePlayer.currentPOS
  const [pitchWidth, pitchHeight] = matchDetails.pitchSize
  let {
    currentPOS, skill
  } = player
  let halfRange = pitchHeight - (skill.shooting / 2)
  let shotRange = pitchHeight - skill.shooting
  if (checkPositionInBottomPenaltyBoxClose(currentPOS, pitchWidth, pitchHeight)) {
    if (oppositionNearPlayer(playerInformation, 6, 6)) {
      if (checkOppositionBelow(closePlayerPosition, currentPOS)) {
        if (checkTeamMateSpaceClose(tmateProximity, -10, 10, -10, 10)) return [20, 0, 70, 0, 0, 0, 0, 10, 0, 0, 0]
        else if (common.isBetween(currentPOS[1], halfRange, pitchHeight)) return [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        else if (common.isBetween(currentPOS[1], shotRange, pitchHeight)) return [70, 0, 0, 0, 0, 0, 0, 30, 0, 0, 0]
        return [20, 0, 0, 0, 0, 0, 0, 40, 20, 0, 0]
      } else if (checkTeamMateSpaceClose(tmateProximity, -10, 10, -4, 10)) {
        if (common.isBetween(currentPOS[1], halfRange, pitchHeight)) return [90, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0]
        else if (common.isBetween(currentPOS[1], shotRange, pitchHeight)) return [50, 0, 20, 0, 0, 0, 0, 30, 0, 0, 0]
        return [20, 0, 30, 0, 0, 0, 0, 30, 20, 0, 0]
      } else if (common.isBetween(currentPOS[1], halfRange, pitchHeight)) return [90, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0]
      else if (common.isBetween(currentPOS[1], shotRange, pitchHeight)) return [70, 0, 0, 0, 0, 0, 0, 30, 0, 0, 0]
      return [20, 0, 0, 0, 0, 0, 0, 50, 30, 0, 0]
    } else if (checkTeamMateSpaceClose(tmateProximity, -10, 10, -4, 10)) {
      if (common.isBetween(currentPOS[1], halfRange, pitchHeight)) return [90, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0]
      else if (common.isBetween(currentPOS[1], shotRange, pitchHeight)) return [50, 0, 20, 0, 0, 0, 0, 30, 0, 0, 0]
      return [20, 0, 30, 0, 0, 0, 0, 30, 20, 0, 0]
    } else if (common.isBetween(currentPOS[1], halfRange, pitchHeight)) return [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    else if (common.isBetween(currentPOS[1], shotRange, pitchHeight)) return [60, 0, 0, 0, 0, 0, 0, 40, 0, 0, 0]
    return [30, 0, 0, 0, 0, 0, 0, 40, 30, 0, 0]
  } else if (common.isBetween(currentPOS[1], shotRange, pitchHeight)) return [50, 0, 20, 0, 0, 0, 0, 30, 0, 0, 0]
  else if (oppositionNearPlayer(playerInformation, 6, 6)) return [10, 0, 70, 0, 0, 0, 0, 20, 0, 0, 0]
  return [70, 0, 20, 0, 0, 0, 0, 10, 0, 0, 0]
}

function bottomTeamPlayerHasBall(matchDetails, player, team, opposition) {
  let playerInformation = setPositions.closestPlayerToPosition(player, opposition, player.currentPOS)
  const [pitchWidth, pitchHeight] = matchDetails.pitchSize
  let {
    position, currentPOS, skill
  } = player
  if (getPositionGroup(position) === 'GK' && oppositionNearPlayer(playerInformation, 10, 25)) return [0, 0, 10, 0, 0, 0, 0, 10, 0, 40, 40]
  else if (getPositionGroup(position) === 'GK') return [0, 0, 50, 0, 0, 0, 0, 10, 0, 20, 20]
  else if (onTopCornerBoundary(currentPOS, pitchWidth)) return [0, 0, 20, 80, 0, 0, 0, 0, 0, 0, 0]
  else if (checkPositionInTopPenaltyBox(currentPOS, pitchWidth, pitchHeight)) {
    return bottomTeamPlayerHasBallInTopPenaltyBox(matchDetails, player, team, opposition)
  } else if (common.isBetween(currentPOS[1], (pitchHeight / 6) - 5, pitchHeight / 3)) {
    if (oppositionNearPlayer(playerInformation, 10, 10)) return [30, 20, 20, 10, 0, 0, 0, 20, 0, 0, 0]
    return [70, 10, 10, 0, 0, 0, 0, 10, 0, 0, 0]
  } else if (common.isBetween(currentPOS[1], (pitchHeight / 3), (2 * (pitchHeight / 3)))) {
    return bottomTeamPlayerHasBallInMiddle(playerInformation, position, skill)
  } else if (oppositionNearPlayer(playerInformation, 10, 10)) return [0, 0, 0, 0, 0, 0, 0, 10, 0, 70, 20]
  else if (getPositionGroup(position) === 'CM' || getPositionGroup(position) === 'WM') return [0, 0, 30, 0, 0, 0, 0, 30, 40, 0, 0]
  else if (getPositionGroup(position) === 'DM') return [0, 0, 40, 0, 0, 0, 0, 20, 20, 10, 10]
  else if (position === 'CAM') return [0, 0, 20, 0, 0, 0, 0, 30, 30, 20, 0]
  else if (getPositionGroup(position) === 'WG') return [0, 0, 20, 20, 0, 0, 0, 30, 30, 0, 0]
  else if (position === 'ST') return [0, 0, 0, 0, 0, 0, 0, 50, 50, 0, 0]
  return [0, 0, 30, 0, 0, 0, 0, 50, 0, 10, 10]
}

function bottomTeamPlayerHasBallInMiddle(playerInformation, position, skill) {
  if (oppositionNearPlayer(playerInformation, 10, 10)) return [0, 20, 30, 20, 0, 0, 0, 20, 0, 0, 10]
  else if (skill.shooting > 85) return [10, 10, 30, 0, 0, 0, 0, 50, 0, 0, 0]
  else if (getPositionGroup(position) === 'CM' || getPositionGroup(position) === 'WM') return [0, 10, 10, 10, 0, 0, 0, 30, 40, 0, 0]
  else if (getPositionGroup(position) === 'DM') return [0, 5, 30, 5, 0, 0, 0, 30, 30, 0, 0]
  else if (position === 'CAM') return [15, 20, 30, 5, 0, 0, 0, 15, 15, 0, 0]
  else if (getPositionGroup(position) === 'WG') return [5, 10, 10, 30, 0, 0, 0, 20, 25, 0, 0]
  else if (position === 'ST') return [0, 0, 0, 0, 0, 0, 0, 50, 50, 0, 0]
  return [0, 0, 10, 0, 0, 0, 0, 60, 20, 0, 10]
}

function bottomTeamPlayerHasBallInTopPenaltyBox(matchDetails, player, team, opposition) {
  let playerInformation = setPositions.closestPlayerToPosition(player, opposition, player.currentPOS)
  let ownPlayerInformation = setPositions.closestPlayerToPosition(player, team, player.currentPOS)
  let tmateProximity = [Math.abs(ownPlayerInformation.proxPOS[0]), Math.abs(ownPlayerInformation.proxPOS[1])]
  let closePlayerPosition = playerInformation.thePlayer.currentPOS
  const [pitchWidth, pitchHeight] = matchDetails.pitchSize
  let {
    currentPOS, skill
  } = player
  if (checkPositionInTopPenaltyBoxClose(currentPOS, pitchWidth, pitchHeight)) {
    if (oppositionNearPlayer(playerInformation, 20, 20)) {
      if (checkOppositionAhead(closePlayerPosition, currentPOS)) {
        if (checkTeamMateSpaceClose(tmateProximity, -10, 10, -10, 10)) return [20, 0, 70, 0, 0, 0, 0, 10, 0, 0, 0]
        else if (common.isBetween(currentPOS[1], 0, (skill.shooting / 2))) return [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        else if (common.isBetween(currentPOS[1], 0, skill.shooting)) return [70, 0, 0, 0, 0, 0, 0, 30, 0, 0, 0]
        return [20, 0, 0, 0, 0, 0, 0, 40, 20, 0, 0]
      } else if (checkTeamMateSpaceClose(tmateProximity, -10, 10, -4, 10)) {
        if (common.isBetween(currentPOS[1], 0, (skill.shooting / 2))) return [90, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0]
        else if (common.isBetween(currentPOS[1], 0, skill.shooting)) return [50, 0, 20, 0, 0, 0, 0, 30, 0, 0, 0]
        return [20, 0, 30, 0, 0, 0, 0, 30, 20, 0, 0]
      } else if (common.isBetween(currentPOS[1], 0, (skill.shooting / 2))) return [90, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0]
      else if (common.isBetween(currentPOS[1], 0, skill.shooting)) return [70, 0, 0, 0, 0, 0, 0, 30, 0, 0, 0]
      return [20, 0, 0, 0, 0, 0, 0, 50, 30, 0, 0]
    } else if (checkTeamMateSpaceClose(tmateProximity, -10, 10, -4, 10)) {
      if (common.isBetween(currentPOS[1], 0, (skill.shooting / 2))) return [90, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0]
      else if (common.isBetween(currentPOS[1], 0, skill.shooting)) return [50, 0, 20, 0, 0, 0, 0, 30, 0, 0, 0]
      return [20, 0, 30, 0, 0, 0, 0, 30, 20, 0, 0]
    } else if (common.isBetween(currentPOS[1], 0, (skill.shooting / 2))) return [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    else if (common.isBetween(currentPOS[1], 0, skill.shooting)) return [60, 0, 0, 0, 0, 0, 0, 40, 0, 0, 0]
    return [30, 0, 0, 0, 0, 0, 0, 40, 30, 0, 0]
  } else if (common.isBetween(currentPOS[1], 0, skill.shooting)) return [50, 0, 20, 0, 0, 0, 0, 30, 0, 0, 0]
  else if (checkOppositionAhead(closePlayerPosition, currentPOS)) return [20, 0, 0, 0, 0, 0, 0, 80, 0, 0, 0]
  return [50, 0, 20, 20, 0, 0, 0, 10, 0, 0, 0]
}

function oppositionNearPlayer(oppositionPlayer, spaceX, spaceY) {
  let oppositionProximity = [Math.abs(oppositionPlayer.proxPOS[0]), Math.abs(oppositionPlayer.proxPOS[1])]
  if (oppositionProximity[0] < spaceX && oppositionProximity[1] < spaceY) return true
  return false
}

function checkTeamMateSpaceClose(tmateProximity, lowX, highX, lowY, highY) {
  if (common.isBetween(tmateProximity[0], lowX, highX) && common.isBetween(tmateProximity[1], lowY, highY)) return true
  return false
}

function checkOppositionAhead(closePlayerPosition, currentPOS) {
  let closePlyX = common.isBetween(closePlayerPosition[0], currentPOS[0] - 4, currentPOS[0] + 4)
  if (closePlyX && closePlayerPosition[1] < currentPOS[1]) return true
  return false
}

function checkOppositionBelow(closePlayerPosition, currentPOS) {
  let closePlyX = common.isBetween(closePlayerPosition[0], currentPOS[0] - 4, currentPOS[0] + 4)
  if (closePlyX && closePlayerPosition[1] > currentPOS[1]) return true
  return false
}

function playerDoesNotHaveBall(player, ballX, ballY, ballZ, matchDetails) {
  const [pitchWidth, pitchHeight] = matchDetails.pitchSize
  let {
    position, currentPOS, originPOS
  } = player
  if (getPositionGroup(position) === 'GK') return [0, 0, 0, 0, 0, 0, 0, 60, 40, 0, 0]
  else if (common.isBetween(ballX, -20, 20) && common.isBetween(ballY, -20, 20)) {
    return noBallNotGK2CloseBall(matchDetails, player, pitchWidth, pitchHeight)
  } else if (common.isBetween(ballX, -40, 40) && common.isBetween(ballY, -40, 40)) {
    return noBallNotGK4CloseBall(matchDetails, player, pitchWidth, pitchHeight)
  } else if (common.isBetween(ballX, -80, 80) && common.isBetween(ballY, -80, 80)) {
    if (matchDetails.ball.withPlayer === false) {
      if (isDefensivePosition(position)) return [0, 0, 0, 0, 15, 10, 0, 40, 35, 0, 0]
      if (isAttackingPosition(position)) return [0, 0, 0, 0, 0, 0, 0, 70, 30, 0, 0]
      return [0, 0, 0, 0, 0, 0, 0, 60, 40, 0, 0]
    }
    if (isDefensivePosition(position)) return [0, 0, 0, 0, 10, 40, 10, 20, 20, 0, 0]
    if (isAttackingPosition(position)) return [0, 0, 0, 0, 0, 20, 0, 40, 40, 0, 0]
    return [0, 0, 0, 0, 0, 40, 0, 30, 30, 0, 0]
  }
  if (isDefensivePosition(position)) return [0, 0, 0, 0, 15, 15, 0, 35, 25, 0, 0]
  if (isAttackingPosition(position)) return [0, 0, 0, 0, 0, 5, 0, 55, 35, 0, 0]
  return [0, 0, 0, 0, 0, 10, 0, 50, 30, 0, 0]
}

function noBallNotGK4CloseBall(matchDetails, player, pitchWidth, pitchHeight) {
  const { currentPOS, originPOS, position } = player;
  if (originPOS[1] > (pitchHeight / 2)) {
    return noBallNotGK4CloseBallBottomTeam(matchDetails, player, pitchWidth, pitchHeight)
  }
  if (checkPositionInTopPenaltyBox(currentPOS, pitchWidth, pitchHeight)) {
    if (matchDetails.ball.withPlayer === false) return [0, 0, 0, 0, 0, 0, 0, 20, 80, 0, 0]
    return [0, 0, 0, 0, 40, 0, 20, 10, 30, 0, 0]
  }
  if (matchDetails.ball.withPlayer === false) {
    if (isDefensivePosition(position)) return [0, 0, 0, 0, 10, 5, 0, 20, 65, 0, 0]
    return [0, 0, 0, 0, 0, 0, 0, 20, 80, 0, 0]
  }
  if (isDefensivePosition(position)) return [0, 0, 0, 0, 60, 0, 40, 0, 0, 0, 0]
  return [0, 0, 0, 0, 50, 0, 50, 0, 0, 0, 0]
}

function noBallNotGK4CloseBallBottomTeam(matchDetails, player, pitchWidth, pitchHeight) {
  const { currentPOS, position } = player;
  if (checkPositionInBottomPenaltyBox(currentPOS, pitchWidth, pitchHeight)) {
    if (matchDetails.ball.withPlayer === false) return [0, 0, 0, 0, 0, 0, 0, 20, 80, 0, 0]
    return [0, 0, 0, 0, 40, 0, 20, 10, 30, 0, 0]
  }
  if (matchDetails.ball.withPlayer === false) {
    if (isDefensivePosition(position)) return [0, 0, 0, 0, 10, 5, 0, 20, 65, 0, 0]
    return [0, 0, 0, 0, 0, 0, 0, 20, 80, 0, 0]
  }
  if (isDefensivePosition(position)) return [0, 0, 0, 0, 60, 0, 40, 0, 0, 0, 0]
  return [0, 0, 0, 0, 50, 0, 50, 0, 0, 0, 0]
}

function noBallNotGK2CloseBall(matchDetails, player, pitchWidth, pitchHeight) {
  const { currentPOS, originPOS, position } = player;
  if (originPOS[1] > (pitchHeight / 2)) {
    return noBallNotGK2CloseBallBottomTeam(matchDetails, player, pitchWidth, pitchHeight)
  }
  if (checkPositionInTopPenaltyBox(currentPOS, pitchWidth, pitchHeight)) {
    if (matchDetails.ball.withPlayer === false) return [0, 0, 0, 0, 0, 0, 0, 20, 80, 0, 0]
    return [0, 0, 0, 0, 40, 0, 20, 10, 30, 0, 0]
  }
  if (matchDetails.ball.withPlayer === false) {
    if (isDefensivePosition(position)) return [0, 0, 0, 0, 10, 5, 0, 25, 60, 0, 0]
    if (isAttackingPosition(position)) return [0, 0, 0, 0, 0, 0, 0, 30, 70, 0, 0]
    return [0, 0, 0, 0, 0, 0, 0, 20, 80, 0, 0]
  }
  if (isDefensivePosition(position)) return [0, 0, 0, 0, 80, 10, 10, 0, 0, 0, 0]
  if (isAttackingPosition(position)) return [0, 0, 0, 0, 50, 20, 30, 0, 0, 0, 0]
  return [0, 0, 0, 0, 70, 10, 20, 0, 0, 0, 0]
}

function noBallNotGK2CloseBallBottomTeam(matchDetails, player, pitchWidth, pitchHeight) {
  const { currentPOS, position } = player;
  if (checkPositionInBottomPenaltyBox(currentPOS, pitchWidth, pitchHeight)) {
    if (matchDetails.ball.withPlayer === false) return [0, 0, 0, 0, 0, 0, 0, 20, 80, 0, 0]
    return [0, 0, 0, 0, 50, 0, 10, 20, 20, 0, 0]
  }
  if (matchDetails.ball.withPlayer === false) {
    if (isDefensivePosition(position)) return [0, 0, 0, 0, 10, 5, 0, 25, 60, 0, 0]
    if (isAttackingPosition(position)) return [0, 0, 0, 0, 0, 0, 0, 30, 70, 0, 0]
    return [0, 0, 0, 0, 0, 0, 0, 20, 80, 0, 0]
  }
  if (isDefensivePosition(position)) return [0, 0, 0, 0, 80, 10, 10, 0, 0, 0, 0]
  if (isAttackingPosition(position)) return [0, 0, 0, 0, 50, 20, 30, 0, 0, 0, 0]
  return [0, 0, 0, 0, 70, 10, 20, 0, 0, 0, 0]
}

function checkPositionInBottomPenaltyBox(position, pitchWidth, pitchHeight) {
  let yPos = common.isBetween(position[0], (pitchWidth / 4) - 5, pitchWidth - (pitchWidth / 4) + 5)
  let xPos = common.isBetween(position[1], pitchHeight - (pitchHeight / 6) + 5, pitchHeight)
  if (yPos && xPos) return true
  return false
}

function checkPositionInBottomPenaltyBoxClose(position, pitchWidth, pitchHeight) {
  let yPos = common.isBetween(position[0], (pitchWidth / 3) - 5, pitchWidth - (pitchWidth / 3) + 5)
  let xPos = common.isBetween(position[1], (pitchHeight - (pitchHeight / 12) + 5), pitchHeight)
  if (yPos && xPos) return true
  return false
}

function checkPositionInTopPenaltyBox(position, pitchWidth, pitchHeight) {
  let xPos = common.isBetween(position[0], (pitchWidth / 4) - 5, pitchWidth - (pitchWidth / 4) + 5)
  let yPos = common.isBetween(position[1], 0, (pitchHeight / 6) - 5)
  if (yPos && xPos) return true
  return false
}

function checkPositionInTopPenaltyBoxClose(position, pitchWidth, pitchHeight) {
  let xPos = common.isBetween(position[0], (pitchWidth / 3) - 5, pitchWidth - (pitchWidth / 3) + 5)
  let yPos = common.isBetween(position[1], 0, (pitchHeight / 12) - 5)
  if (yPos && xPos) return true
  return false
}

function onBottomCornerBoundary(position, pitchWidth, pitchHeight) {
  if (position[1] == pitchHeight && (position[0] == 0 || position[0] == pitchWidth)) return true
  return false
}

function onTopCornerBoundary(position, pitchWidth) {
  if (position[1] == 0 && (position[0] == 0 || position[0] == pitchWidth)) return true
  return false
}

function populatePossibleActions(possibleActions, player, matchDetails, a, b, c, d, e, f, g, h, i, j, k) {
  //a-shoot, b-throughBall, c-pass, d-cross, e-tackle, f-intercept
  //g-slide, h-run, i-sprint j-cleared k-boot
  possibleActions[0].points = a
  possibleActions[1].points = b
  possibleActions[2].points = c
  possibleActions[3].points = d
  possibleActions[4].points = e
  possibleActions[5].points = f
  possibleActions[6].points = g
  possibleActions[7].points = h
  possibleActions[8].points = i
  possibleActions[9].points = j
  possibleActions[10].points = k
  possibleActions = adjustForBallHeight(possibleActions, player, matchDetails)
  possibleActions = normaliseActionObjects(possibleActions)
  return possibleActions
}

function populateActionsJSON() {
  return [{
    'name': 'shoot',
    'points': 0
  }, {
    'name': 'throughBall',
    'points': 0
  }, {
    'name': 'pass',
    'points': 0
  }, {
    'name': 'cross',
    'points': 0
  }, {
    'name': 'tackle',
    'points': 0
  }, {
    'name': 'intercept',
    'points': 0
  }, {
    'name': 'slide',
    'points': 0
  }, {
    'name': 'run',
    'points': 0
  }, {
    'name': 'sprint',
    'points': 0
  }, {
    'name': 'cleared',
    'points': 0
  }, {
    'name': 'boot',
    'points': 0
  }]
}

function resolveTackle(player, team, opposition, matchDetails) {
  matchDetails.iterationLog.push(`Tackle attempted by: ${player.name}`)
  let tackleDetails = {
    'injuryHigh': 1500,
    'injuryLow': 1400,
    'increment': 1
  }
  let index = opposition.players.findIndex(function(thisPlayer) {
    return thisPlayer.playerID === matchDetails.ball.Player
  })
  let thatPlayer
  if (index !== -1) thatPlayer = opposition.players[index]
  else return false
  player.stats.tackles.total++
  if (wasFoul(10, 18)) {
    setFoul(matchDetails, team, player, thatPlayer)
    return true
  }
  if (calcTackleScore(player.skill, 5) > calcRetentionScore(thatPlayer.skill, 5)) {
    setSuccessTackle(matchDetails, team, opposition, player, thatPlayer, tackleDetails)
    return false
  }
  setFailedTackle(matchDetails, player, thatPlayer, tackleDetails)
  return false
}

function resolveSlide(player, team, opposition, matchDetails) {
  matchDetails.iterationLog.push(`Slide tackle attempted by: ${player.name}`)
  let tackleDetails = {
    'injuryHigh': 1500,
    'injuryLow': 1400,
    'increment': 3
  }
  let index = opposition.players.findIndex(function(thisPlayer) {
    return thisPlayer.playerID === matchDetails.ball.Player
  })
  let thatPlayer
  if (index !== -1) thatPlayer = opposition.players[index]
  else return false
  player.stats.tackles.total++
  if (wasFoul(11, 20)) {
    setFoul(matchDetails, team, player, thatPlayer)
    return true
  }
  if (calcTackleScore(player.skill, 5) > calcRetentionScore(thatPlayer.skill, 5)) {
    setSuccessTackle(matchDetails, team, opposition, player, thatPlayer, tackleDetails)
    return false
  }
  setFailedTackle(matchDetails, player, thatPlayer, tackleDetails)
  return false
}

function setFailedTackle(matchDetails, player, thatPlayer, tackleDetails) {
  matchDetails.iterationLog.push(`Failed tackle by: ${player.name}`)
  player.stats.tackles.off++
  setInjury(matchDetails, player, thatPlayer, tackleDetails.injuryHigh, tackleDetails.injuryLow)
  setPostTacklePosition(matchDetails, thatPlayer, player, tackleDetails.increment)
}

function setSuccessTackle(matchDetails, team, opposition, player, thatPlayer, tackleDetails) {
  setPostTackleBall(matchDetails, team, opposition, player)
  matchDetails.iterationLog.push(`Successful tackle by: ${player.name}`)
  player.stats.tackles.on++
  setInjury(matchDetails, thatPlayer, player, tackleDetails.injuryLow, tackleDetails.injuryHigh)
  setPostTacklePosition(matchDetails, player, thatPlayer, tackleDetails.increment)
}

function calcTackleScore(skill, diff) {
  return ((parseInt(skill.tackling, 10) + parseInt(skill.strength, 10)) / 2) + common.getRandomNumber(-diff, diff)
}

function calcRetentionScore(skill, diff) {
  return ((parseInt(skill.agility, 10) + parseInt(skill.strength, 10)) / 2) + common.getRandomNumber(-diff, diff)
}

function setPostTackleBall(matchDetails, team, opposition, player) {
  player.hasBall = true
  matchDetails.ball.lastTouch.playerName = player.name
  matchDetails.ball.lastTouch.playerID = player.playerID
  matchDetails.ball.lastTouch.teamID = team.teamID
  matchDetails.ball.lastTouch.deflection = false
  let tempArray = player.currentPOS
  matchDetails.ball.position = tempArray.map(x => x)
  matchDetails.ball.position[2] = 0
  matchDetails.ball.Player = player.playerID
  matchDetails.ball.withPlayer = true
  matchDetails.ball.withTeam = team.teamID
  matchDetails.ball.ballOverIterations = []
  team.intent = 'attack'
  opposition.intent = 'defend'
}

function setPostTacklePosition(matchDetails, winningPlyr, losePlayer, increment) {
  const [, pitchHeight] = matchDetails.pitchSize
  if (losePlayer.originPOS[1] > pitchHeight / 2) {
    losePlayer.currentPOS[1] = common.upToMin(losePlayer.currentPOS[1] - increment, 0)
    matchDetails.ball.position[1] = common.upToMin(matchDetails.ball.position[1] - increment, 0)
    winningPlyr.currentPOS[1] = common.upToMax(winningPlyr.currentPOS[1] + increment, pitchHeight)
  } else {
    losePlayer.currentPOS[1] = common.upToMax(losePlayer.currentPOS[1] + increment, pitchHeight)
    matchDetails.ball.position[1] = common.upToMax(matchDetails.ball.position[1] + increment, pitchHeight)
    winningPlyr.currentPOS[1] = common.upToMin(winningPlyr.currentPOS[1] - increment, 0)
  }
}

function setInjury(matchDetails, thatPlayer, player, tackledInjury, tacklerInjury) {
  if (common.isInjured(tackledInjury)) {
    thatPlayer.injured = true
    matchDetails.iterationLog.push(`Player Injured - ${thatPlayer.name}`)
  }
  if (common.isInjured(tacklerInjury)) {
    player.injured = true
    matchDetails.iterationLog.push(`Player Injured - ${player.name}`)
  }
}

function setFoul(matchDetails, team, player, thatPlayer) {
  matchDetails.iterationLog.push(`Foul against: ${thatPlayer.name}`)
  player.stats.tackles.fouls++
  if (team.teamID === matchDetails.kickOffTeam.teamID) matchDetails.kickOffTeamStatistics.fouls++
  else matchDetails.secondTeamStatistics.fouls++
}

function wasFoul(x, y) {
  let foul = common.getRandomNumber(0, x)
  if (common.isBetween(foul, 0, (y / 2) - 1)) return true
  return false
}

function foulIntensity() {
  return common.getRandomNumber(1, 99)
}

function playerJumps(perception) {
  if (common.isBetween(common.getRandomNumber(0, 100), 0, common.getRandomNumber(0, perception))) return true
  return false
}

function normaliseActionObjects(actions) {
  const total = actions.reduce((sum, a) => sum + a.points, 0)
  if (total <= 0) return actions
  actions.forEach(a => {
    a.points = Math.round((a.points / total) * 100)
  })
  return actions
}

function adjustForBallHeight(actions, player, matchDetails) {
  const ballZ = matchDetails.ball.position[2] || 0
  const { withPlayer } = matchDetails.ball
  const pitchHeight = matchDetails.pitchSize[1]
  const groundMax = pitchHeight * 0.01
  const aerialMax = pitchHeight * 0.035
  const playerHeightMeters = player.height / 100
  const pitchHeightMeters = pitchHeight / 10
  const reachableHeight = (playerHeightMeters / pitchHeightMeters) * pitchHeight
    + (player.skill.jumping / 10)
  const settlingFrames = matchDetails.ball.settlingFrames || 0
  if (!withPlayer && ballZ > groundMax) {
    if (ballZ > reachableHeight) {
      actions[0].points = 0
      actions[1].points = 0
      actions[2].points = 0
      actions[3].points = 0
      actions[4].points = 0
      actions[6].points = 0
      actions[9].points += 25
      actions[10].points += 25
      return actions
    }
    const rawFactor = 1 - (ballZ / aerialMax)
    const heightFactor = Math.max(0, Math.min(1, rawFactor))
    actions[0].points *= heightFactor
    actions[1].points *= heightFactor
    actions[2].points *= heightFactor
    actions[3].points *= heightFactor
    actions[9].points += 15 * (1 - heightFactor)
    actions[10].points += 10 * (1 - heightFactor)
    return actions
  }
  if (withPlayer === true && matchDetails.ball.Player === player.playerID && ballZ > groundMax) {
    const rawFactor = 1 - (ballZ / aerialMax)
    const heightFactor = Math.max(0, Math.min(1, rawFactor))
    actions[7].points *= heightFactor
    actions[8].points *= heightFactor * 0.6
    actions[0].points *= 0.85
    actions[1].points *= 0.85
    actions[2].points *= 0.85
    if (settlingFrames > 0) {
      actions[8].points *= 0.2
      actions[1].points *= 0.5
      actions[3].points *= 0.5
      matchDetails.ball.settlingFrames--
    }
    return actions
  }
  return actions
}

function extractBallActions(moves, type) {
  const ballActions = ['shoot', 'throughBall', 'pass', 'cross', 'cleared', 'boot', 'penalty']
  if (type === 'ball') return moves.filter(m => ballActions.includes(m.action))
  if (type === 'movement') return moves.filter(m => !ballActions.includes(m.action))
  return []
}

export {
  selectAction,
  findPossActions,
  playerDoesNotHaveBall,
  topTeamPlayerHasBall,
  topTeamPlayerHasBallInBottomPenaltyBox,
  bottomTeamPlayerHasBall,
  bottomTeamPlayerHasBallInMiddle,
  bottomTeamPlayerHasBallInTopPenaltyBox,
  noBallNotGK2CloseBall,
  noBallNotGK2CloseBallBottomTeam,
  noBallNotGK4CloseBall,
  noBallNotGK4CloseBallBottomTeam,
  oppositionNearPlayer,
  checkTeamMateSpaceClose,
  checkOppositionAhead,
  checkOppositionBelow,
  checkPositionInTopPenaltyBox,
  checkPositionInTopPenaltyBoxClose,
  onBottomCornerBoundary,
  onTopCornerBoundary,
  checkPositionInBottomPenaltyBox,
  checkPositionInBottomPenaltyBoxClose,
  populatePossibleActions,
  resolveTackle,
  resolveSlide,
  calcTackleScore,
  calcRetentionScore,
  setPostTackleBall,
  setPostTacklePosition,
  setFoul,
  setInjury,
  wasFoul,
  foulIntensity,
  playerJumps,
  extractBallActions
}
